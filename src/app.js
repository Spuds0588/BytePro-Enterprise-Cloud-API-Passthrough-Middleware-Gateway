/** Vendor-facing routes. API-Gateway-shaped events; tenant identity comes only from apiKeyId. */
const { randomUUID } = require("node:crypto");
const { log } = require("./log");
const { mask } = require("./mask");
const { loanData, documentList, documentContent } = require("./byte");
const { roleFor, safeEqual } = require("./roles");
const { renderPortal } = require("./portal");

const MAX_ITEMS = 100;
const DEFAULT_PATHS = "Property,Loan,Borrower,Milestones,Conditions,Fees,CustomFields";
const MAX_QUEUED_DOCUMENT_BYTES = 180_000;
const MAX_DIRECT_DOCUMENT_BYTES = 5_000_000;
const DIRECT_DOCUMENT_TIMEOUT_MS = 20_000;
const JOB_TTL_SECONDS = 30 * 24 * 60 * 60;
const ROOT = /^[A-Za-z][A-Za-z0-9]{0,40}$/;
const MAX_ROOTS = 10;
const WRITE_PERSONAS = {
  fees: ["TITLE_VENDOR", "TPO_BROKER"],
  conditions: ["TITLE_VENDOR", "TPO_BROKER"],
  documents: ["TITLE_VENDOR", "TPO_BROKER"]
};
const DOCUMENT_PERSONAS = ["TITLE_VENDOR", "TPO_BROKER"];
const OPERATION = { fees: "write fees", conditions: "submit conditions", documents: "upload documents" };

const json = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  body: JSON.stringify(body)
});
const error = (statusCode, message, extra = {}) => json(statusCode, { error: message, ...extra });
const html = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
    "X-Frame-Options": "DENY"
  },
  body
});

const decode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const parseRoots = (raw) => {
  const roots = [...new Set(String(raw || DEFAULT_PATHS).split(",").map((root) => root.trim()).filter(Boolean))];
  return roots.length && roots.length <= MAX_ROOTS && roots.every((root) => ROOT.test(root)) ? roots : null;
};

const validFees = (fees) =>
  Array.isArray(fees) &&
  fees.length > 0 &&
  fees.length <= MAX_ITEMS &&
  fees.every(
    (fee) =>
      typeof fee?.feeType === "string" &&
      fee.feeType.trim().length > 0 &&
      fee.feeType.length <= 100 &&
      Number.isFinite(fee.amount) &&
      fee.amount >= 0 &&
      (fee.paidTo === undefined || (typeof fee.paidTo === "string" && fee.paidTo.length <= 200))
  );

const validConditions = (conditions) =>
  Array.isArray(conditions) &&
  conditions.length > 0 &&
  conditions.length <= MAX_ITEMS &&
  conditions.every(
    (condition) =>
      typeof condition?.description === "string" &&
      condition.description.trim().length > 0 &&
      condition.description.length <= 200 &&
      typeof condition?.status === "string" &&
      condition.status.trim().length > 0 &&
      condition.status.length <= 50 &&
      (condition.category === undefined || (typeof condition.category === "string" && condition.category.length <= 100)) &&
      (condition.borrowerVisible === undefined || typeof condition.borrowerVisible === "boolean")
  );

const parsePdf = (content, maxBytes = MAX_QUEUED_DOCUMENT_BYTES) => {
  if (typeof content !== "string" || !content.trim()) return { error: [400, "contentBase64 is required"] };
  const clean = content.replace(/\s+/g, "");
  if (clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return { error: [400, "contentBase64 must be valid base64"] };
  const bytes = Buffer.from(clean, "base64");
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) return { error: [415, "Only PDF content is supported"] };
  if (bytes.length > maxBytes) {
    return { error: [413, `Document exceeds ${maxBytes} bytes`, { maxBytes }] };
  }
  return { content: clean, bytes: bytes.length };
};

const upstreamError = (status, loanId) => {
  if (status === 423) return error(423, "Loan is locked by BytePro", { code: "FILE_LOCKED" });
  if (status === 404) return error(404, "Loan or document not found");
  if (status === 429) return error(429, "BytePro rate limit reached");
  if (status === 401 || status === 403) return error(502, "BytePro rejected gateway credentials");
  if (status >= 500) return error(502, "BytePro unavailable");
  if (status >= 300) return error(400, "BytePro rejected the request", { upstreamStatus: status, loanId });
  return null;
};

const uploadedDocumentId = (body) => {
  try {
    const parsed = JSON.parse(body);
    return parsed?.documentId ?? parsed?.id ?? null;
  } catch {
    return null;
  }
};

function createApp({ store, byte, env = process.env, now = () => Date.now() }) {
  if (!store) throw new Error("createApp requires a store");
  const tenantFor = async (apiKeyId) => (apiKeyId ? (await store.getTenant(apiKeyId)) || null : null);

  async function readLoan(event, apiKeyId, loanId) {
    const tenant = await tenantFor(apiKeyId);
    if (!tenant) return error(403, "Unauthorized tenant mapping");
    const roots = parseRoots(event.queryStringParameters?.paths);
    if (!roots) return error(400, `paths must be 1-${MAX_ROOTS} comma-separated root objects (Property, Loan, Milestones)`);

    let upstream;
    try {
      upstream = await byte.getLoan(tenant.role, loanId, roots.join(","));
    } catch (err) {
      log("ERROR", "BYTEPRO_READ_FAILED", { loanId, message: err.message });
      return error(err.name === "TimeoutError" ? 504 : 502, "BytePro request failed");
    }

    log("INFO", "BYTEPRO_READ_COMPLETE", { loanId, status: upstream.status, persona: tenant.persona });
    const failed = upstreamError(upstream.status, loanId);
    if (failed) return failed;

    const data = loanData(upstream.body);
    if (!data || typeof data !== "object") return error(502, "Invalid BytePro response");
    const masked = mask(data, tenant.persona, roots);
    if (!masked) return error(403, `Persona ${tenant.persona} has no schema allowlist`);
    log("INFO", "SCHEMA_MASKING_APPLIED", { loanId, persona: tenant.persona, roots: roots.length });
    return json(200, { loanId, data: masked.data, _cached: false }, { "Cache-Control": "private, max-age=15" });
  }

  async function enqueueWrite(event, apiKeyId, loanId, kind) {
    const tenant = await tenantFor(apiKeyId);
    if (!tenant) return error(403, "Unauthorized tenant mapping");
    if (!WRITE_PERSONAS[kind].includes(tenant.persona)) return error(403, `Persona cannot ${OPERATION[kind]}`);

    let body;
    try {
      body = JSON.parse(event.body || "");
    } catch {
      return error(400, "Invalid JSON body");
    }

    let payload;
    if (kind === "documents") {
      if (typeof body?.documentType !== "string" || !body.documentType.trim() || body.documentType.length > 100) {
        return error(400, "documentType is required (max 100 chars)");
      }
      if (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.length > 500)) {
        return error(400, "notes must be a string (max 500 chars)");
      }
      const pdf = parsePdf(body?.contentBase64, MAX_DIRECT_DOCUMENT_BYTES);
      if (pdf.error) return error(pdf.error[0], pdf.error[1], pdf.error[2]);
      const documentType = body.documentType.trim();
      const notes = String(body.notes || "").trim();
      if (pdf.bytes > MAX_QUEUED_DOCUMENT_BYTES) {
        let upstream;
        try {
          upstream = await byte.uploadDocument(tenant.role, loanId, { documentType, notes, contentBase64: pdf.content }, DIRECT_DOCUMENT_TIMEOUT_MS);
        } catch (err) {
          log("ERROR", "BYTEPRO_DOCUMENT_UPLOAD_FAILED", { loanId, bytes: pdf.bytes, message: err.message });
          return error(err.name === "TimeoutError" ? 504 : 502, "BytePro document upload failed");
        }
        const failed = upstreamError(upstream.status, loanId);
        if (failed) return failed;
        log("INFO", "DOCUMENT_DIRECT_COMPLETE", { loanId, tenantName: tenant.tenantName, bytes: pdf.bytes });
        return json(200, { status: "COMPLETED", loanId, sync: true, documentId: uploadedDocumentId(upstream.body) });
      }
      payload = { documentType, notes, contentBase64: pdf.content };
    } else if (kind === "conditions") {
      if (!validConditions(body?.conditions)) return error(400, "Body must contain a non-empty conditions array (max 100)");
      payload = {
        Conditions: body.conditions.map((condition) => ({
          Description: condition.description.trim(),
          Status: condition.status.trim(),
          ...(condition.category === undefined ? {} : { Category: condition.category }),
          ...(condition.borrowerVisible === undefined ? {} : { BorrowerVisible: condition.borrowerVisible })
        }))
      };
    } else {
      if (!validFees(body?.fees)) return error(400, "Body must contain a non-empty fees array (max 100)");
      payload = {
        Fees: body.fees.map((fee) => ({
          FeeType: fee.feeType.trim(),
          Amount: fee.amount,
          ...(fee.paidTo === undefined ? {} : { PaidTo: fee.paidTo })
        }))
      };
    }

    const createdAt = new Date(now()).toISOString();
    const job = {
      jobId: `job_${randomUUID()}`,
      loanId,
      apiKeyId,
      tenantName: tenant.tenantName,
      persona: tenant.persona,
      role: tenant.role,
      kind,
      status: "PENDING",
      attempts: 0,
      error: null,
      createdAt,
      updatedAt: createdAt,
      ttl: Math.floor(now() / 1000) + JOB_TTL_SECONDS
    };
    await store.putJob(job);

    try {
      await store.enqueueWrite({ jobId: job.jobId, loanId, kind, payload });
    } catch (err) {
      await store.putJob({ ...job, status: "FAILED", error: "Queue unavailable", updatedAt: new Date(now()).toISOString() });
      log("ERROR", "WRITE_ENQUEUE_FAILED", { jobId: job.jobId, loanId, message: err.message });
      return error(503, "Write queue unavailable");
    }

    log("INFO", "WRITE_ENQUEUED", { jobId: job.jobId, loanId, tenantName: tenant.tenantName, kind });
    return json(202, { status: "ACCEPTED", jobId: job.jobId, loanId, statusUrl: `/v1/jobs/${job.jobId}` });
  }

  async function readDocuments(apiKeyId, loanId, documentId) {
    const tenant = await tenantFor(apiKeyId);
    if (!tenant) return error(403, "Unauthorized tenant mapping");
    if (!DOCUMENT_PERSONAS.includes(tenant.persona)) return error(403, "Persona cannot read documents");

    let upstream;
    try {
      upstream = documentId
        ? await byte.downloadDocument(tenant.role, loanId, documentId)
        : await byte.listDocuments(tenant.role, loanId);
    } catch (err) {
      log("ERROR", "BYTEPRO_DOCUMENT_FAILED", { loanId, message: err.message });
      return error(err.name === "TimeoutError" ? 504 : 502, "BytePro document request failed");
    }

    log("INFO", "BYTEPRO_DOCUMENT_READ", { loanId, status: upstream.status, single: Boolean(documentId) });
    const failed = upstreamError(upstream.status, loanId);
    if (failed) return failed;

    if (documentId) {
      const contentBase64 = documentContent(upstream.body);
      if (!contentBase64) return error(502, "BytePro returned no document content");
      return json(200, { documentId, contentType: "application/pdf", contentBase64 });
    }
    return json(200, { loanId, documents: documentList(upstream.body) }, { "Cache-Control": "private, max-age=15" });
  }

  async function jobStatus(apiKeyId, jobId) {
    const tenant = await tenantFor(apiKeyId);
    if (!tenant) return error(403, "Unauthorized tenant mapping");

    const job = await store.getJob(jobId);
    if (!job || job.apiKeyId !== apiKeyId) return error(404, "Job not found");
    return json(200, {
      jobId: job.jobId,
      loanId: job.loanId,
      kind: job.kind,
      status: job.status,
      attempts: job.attempts,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      error: job.error || null
    });
  }

  async function provision(event, requestId) {
    let payload;
    try {
      payload = JSON.parse(event.body || "");
    } catch {
      return error(400, "Invalid JSON body");
    }

    const role = String(payload?.role || "").trim().toLowerCase();
    const config = roleFor(env, role);
    if (!config || !safeEqual(String(payload?.code || ""), config.code)) {
      log("WARN", "PORTAL_INVITE_REJECTED", { requestId, role: role || "unknown" });
      return error(403, "Invalid or expired invite link");
    }

    const tenantName = String(payload.tenantName || "").trim();
    const email = String(payload.email || "").trim();
    if (!tenantName || tenantName.length > 100) return error(400, "tenantName is required (max 100 chars)");
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return error(400, "A valid email is required");

    const key = await store.createApiKey({ tenantName });
    await store.putTenant({
      apiKeyId: key.id,
      tenantName,
      email,
      role,
      persona: config.persona,
      status: "ACTIVE",
      createdAt: new Date(now()).toISOString()
    });
    log("INFO", "TENANT_PROVISIONED", { tenantName, role, persona: config.persona, apiKeyId: key.id });

    return json(200, { message: "Tenant provisioned successfully", apiKey: key.value, tenantName, email, role, persona: config.persona });
  }

  async function handle(event = {}) {
    const method = String(event.httpMethod || event.requestContext?.http?.method || "GET").toUpperCase();
    const path = event.path || event.rawPath || "/";
    const requestId = event.requestContext?.requestId;
    const apiKeyId = event.requestContext?.identity?.apiKeyId;
    const started = now();

    log("INFO", "REQUEST_RECEIVED", { requestId, method, path });
    try {
      if (method === "GET" && path === "/health") return json(200, { status: "ok", system: "ByteProGateway" });

      if (path === "/portal") {
        if (method === "POST") return await provision(event, requestId);
        if (method !== "GET") return error(405, "Method not allowed");
        const role = String(event.queryStringParameters?.role || "").trim().toLowerCase();
        const code = String(event.queryStringParameters?.code || "");
        if (!role && !code) return html(200, renderPortal());
        const config = roleFor(env, role);
        if (!config || !safeEqual(code, config.code)) {
          log("WARN", "PORTAL_INVITE_REJECTED", { requestId, role: role || "unknown" });
          return html(403, renderPortal({ error: "This invite link is invalid or has expired." }));
        }
        return html(200, renderPortal({ role: config, code }));
      }

      let match;
      if ((match = /^\/v1\/loans\/([^/]+)\/fees$/.exec(path))) {
        if (method !== "PATCH") return error(405, "Method not allowed");
        return await enqueueWrite(event, apiKeyId, decode(match[1]), "fees");
      }
      if ((match = /^\/v1\/loans\/([^/]+)\/conditions$/.exec(path))) {
        if (method !== "POST") return error(405, "Method not allowed");
        return await enqueueWrite(event, apiKeyId, decode(match[1]), "conditions");
      }
      if ((match = /^\/v1\/loans\/([^/]+)\/documents$/.exec(path))) {
        if (method === "POST") return await enqueueWrite(event, apiKeyId, decode(match[1]), "documents");
        if (method === "GET") return await readDocuments(apiKeyId, decode(match[1]));
        return error(405, "Method not allowed");
      }
      if ((match = /^\/v1\/loans\/([^/]+)\/documents\/([^/]+)$/.exec(path))) {
        if (method !== "GET") return error(405, "Method not allowed");
        return await readDocuments(apiKeyId, decode(match[1]), decode(match[2]));
      }
      if ((match = /^\/v1\/loans\/([^/]+)$/.exec(path))) {
        const loanId = decode(match[1]);
        if (method === "GET") return await readLoan(event, apiKeyId, loanId);
        if (method === "PATCH") return error(501, "Only fee, condition, and document writes are supported; 1003 loan-field writes are not implemented");
        return error(405, "Method not allowed");
      }
      if ((match = /^\/v1\/jobs\/([^/]+)$/.exec(path))) {
        if (method !== "GET") return error(405, "Method not allowed");
        return await jobStatus(apiKeyId, decode(match[1]));
      }

      return error(404, "Not found");
    } catch (err) {
      log("ERROR", "HANDLER_EXCEPTION", { requestId, method, path, message: err.message, stack: err.stack });
      return error(500, "Internal gateway error");
    } finally {
      log("INFO", "REQUEST_COMPLETE", { requestId, method, path, durationMs: now() - started });
    }
  }

  return { handle };
}

module.exports = { createApp };
