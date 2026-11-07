/**
 * Fake BytePro Enterprise Cloud API for local runs and tests. Never deploy.
 * Mirrors the documented session + loan + document REST convention closely
 * enough to exercise routing, masking, session caching, and FIFO delivery.
 */
const http = require("node:http");

const DEMO_PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n").toString("base64");

const ACCOUNTS = {
  title: { accountCode: "BYTE-DEMO", username: "api_title_user", password: "demo-title-password" },
  broker: { accountCode: "BYTE-DEMO", username: "api_broker_user", password: "demo-broker-password" },
  appraisal: { accountCode: "BYTE-DEMO", username: "api_appraisal_user", password: "demo-appraisal-password" }
};

const loanFixture = (loanId) => ({
  loanId,
  Property: {
    Street: "456 Oak Avenue",
    City: "Dallas",
    State: "TX",
    Zip: "75001",
    County: "Dallas",
    LegalDescription: "Lot 12, Block 4, Oak Ridge Addition"
  },
  Loan: {
    BaseLoanAmount: 385000,
    InterestRate: 6.625,
    LoanType: "Conventional",
    LoanPurpose: "Purchase",
    LTV: 80,
    CLTV: 80,
    CreditScore: 780
  },
  Borrower: {
    FirstName: "Jordan",
    LastName: "Rivera",
    Email: "jordan@example.test",
    HomePhone: "555-0100",
    SSN: "000-00-0000",
    DateOfBirth: "1985-04-02",
    MailingAddress: { Street: "1 Elm Street", City: "Dallas", State: "TX", Zip: "75001" }
  },
  Milestones: { CurrentStatus: "Underwriting", ClosingDate: "2026-12-04" },
  Fees: [{ FeeType: "TitleLendersPolicy", Amount: 1350, PaidTo: "First American Title" }],
  Conditions: [{ Description: "Provide title commitment", Status: "Added", Category: "Title" }],
  CustomFields: { TitleCommitmentNumber: "FAT-99281-TX" }
});

const json = (value) => JSON.stringify(value);

function createMockBytepro({ accounts = ACCOUNTS, now = () => Date.now() } = {}) {
  const loans = new Map([
    ["BYTE-1002948", loanFixture("BYTE-1002948")],
    ["BYTE-LOCKED-1", loanFixture("BYTE-LOCKED-1")]
  ]);
  const sessions = new Map();
  const documents = new Map();
  const updates = [];
  const counters = { logins: 0, uploads: 0, downloads: 0 };

  const send = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(typeof body === "string" ? body : json(body));
  };
  const readBody = async (req) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      return null;
    }
  };
  const roleFor = (token) => sessions.get(token)?.role ?? null;
  const authorized = (req) => roleFor(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""));

  async function handler(req, res) {
    const url = new URL(req.url, "http://mock");
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const role = authorized(req);

    if (req.method === "POST" && url.pathname === "/session") {
      const body = await readBody(req);
      const match = Object.entries(accounts).find(([, account]) => account.username === body?.username);
      if (!match || match[1].password !== body?.password || match[1].accountCode !== body?.accountCode) {
        return send(res, 401, { error: "Invalid BytePro credentials" });
      }
      counters.logins += 1;
      const token = `tok_${match[0]}_${counters.logins}`;
      sessions.set(token, { role: match[0], expiresAt: now() + 30 * 60_000 });
      return send(res, 200, { sessionToken: token, expiresIn: 1800 });
    }

    if (!role) return send(res, 401, { error: "Missing or expired session" });

    const loanId = parts[0] === "loans" ? parts[1] : null;
    if (!loanId) return send(res, 404, { error: "Not found" });
    const loan = loans.get(loanId);
    if (!loan) return send(res, 404, { error: "Loan not found" });
    if (loanId === "BYTE-LOCKED-1") return send(res, 423, { error: "Loan is open in the BytePro desktop client" });

    if (req.method === "GET" && parts.length === 2) {
      const roots = String(url.searchParams.get("paths") || "Property,Loan,Milestones").split(",").filter(Boolean);
      return send(res, 200, { data: Object.fromEntries(roots.filter((root) => root in loan).map((root) => [root, loan[root]])) });
    }

    if (req.method === "PATCH" && parts.length === 2) {
      const body = await readBody(req);
      if (!body?.data || typeof body.data !== "object") return send(res, 400, { error: "data is required" });
      const { Fees, Conditions } = body.data;
      if (Fees !== undefined && !Array.isArray(Fees)) return send(res, 400, { error: "Fees must be an array" });
      if (Conditions !== undefined && !Array.isArray(Conditions)) return send(res, 400, { error: "Conditions must be an array" });
      if (Fees) loan.Fees = Fees;
      if (Conditions) {
        for (const incoming of Conditions) {
          const existing = loan.Conditions.find((condition) => condition.Description === incoming.Description);
          if (existing) Object.assign(existing, incoming);
          else loan.Conditions.push(incoming);
        }
      }
      updates.push({ loanId, data: body.data, role });
      return send(res, 200, { loanId, updated: true });
    }

    if (parts[2] === "documents") {
      const list = documents.get(loanId) || [];
      if (req.method === "POST" && parts.length === 3) {
        const body = await readBody(req);
        if (!body?.documentType || !body?.contentBase64) return send(res, 400, { error: "documentType and contentBase64 are required" });
        counters.uploads += 1;
        const record = {
          id: `doc_${counters.uploads}`,
          documentType: body.documentType,
          fileName: `${body.documentType.replace(/\s+/g, "-").toLowerCase()}.pdf`,
          notes: body.notes || null,
          uploadedAt: new Date(now()).toISOString(),
          contentBase64: body.contentBase64,
          role
        };
        list.push(record);
        documents.set(loanId, list);
        return send(res, 201, { id: record.id, documentId: record.id, documentType: record.documentType, fileName: record.fileName });
      }
      if (req.method === "GET" && parts.length === 3) {
        return send(res, 200, { documents: list.map(({ contentBase64, ...meta }) => meta) });
      }
      if (req.method === "GET" && parts.length === 4) {
        const record = list.find((doc) => doc.id === parts[3]);
        if (!record) return send(res, 404, { error: "Document not found" });
        counters.downloads += 1;
        return send(res, 200, { documentId: record.id, contentBase64: record.contentBase64 });
      }
    }

    return send(res, 404, { error: "Not found" });
  }

  return { handler, loans, documents, updates, counters, sessions, DEMO_PDF };
}

/** Starts the mock on an ephemeral (or given) loopback port. */
const startMockBytepro = (options = {}) =>
  new Promise((resolve, reject) => {
    const mock = createMockBytepro(options);
    const server = http.createServer(mock.handler);
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () =>
      resolve({
        ...mock,
        server,
        port: server.address().port,
        close: () => new Promise((done) => server.close(done))
      })
    );
  });

module.exports = { createMockBytepro, startMockBytepro, ACCOUNTS, DEMO_PDF, loanFixture };
