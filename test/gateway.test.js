const assert = require("node:assert/strict");
const { test } = require("node:test");
const { startMockBytepro, DEMO_PDF } = require("../mock/bytepro");
const { createMemoryStore } = require("../dev/memory-store");
const { root, openStack, provision, call, drainQueue, pdfBase64, BROKER, TITLE, APPRAISAL } = require("./helpers");

test("health is open; any vendor route without a key is rejected", async (t) => {
  const { app } = await openStack(t);
  assert.equal((await app.handle({ httpMethod: "GET", path: "/health" })).statusCode, 200);
  const denied = await call(app, "GET", "/v1/loans/BYTE-1002948", "missing-key");
  assert.equal(denied.statusCode, 403);
});

test("invite links are role-locked, timing-safe, and fail closed", async (t) => {
  const { app } = await openStack(t);

  const landing = await app.handle({ httpMethod: "GET", path: "/portal" });
  assert.equal(landing.statusCode, 200);
  assert.match(landing.body, /Use your invite link/);

  const invited = await app.handle({ httpMethod: "GET", path: "/portal", queryStringParameters: { role: "title", code: "wrong-code" } });
  assert.equal(invited.statusCode, 403);
  assert.match(invited.body, /invalid or has expired/);

  const unknown = await app.handle({ httpMethod: "GET", path: "/portal", queryStringParameters: { role: "admin", code: "anything" } });
  assert.equal(unknown.statusCode, 403);

  const form = await app.handle({
    httpMethod: "GET",
    path: "/portal",
    queryStringParameters: { role: "broker", code: "local-broker-invite-0123456789" }
  });
  assert.equal(form.statusCode, 200);
  assert.match(form.body, /TPO_BROKER/);
  assert.match(form.headers["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.equal(form.headers["X-Frame-Options"], "DENY");

  const badEmail = await app.handle({
    httpMethod: "POST",
    path: "/portal",
    body: JSON.stringify({ role: "broker", code: "local-broker-invite-0123456789", tenantName: "Acme", email: "nope" })
  });
  assert.equal(badEmail.statusCode, 400);
});

test("provisioning stores only the key id, never the plaintext key", async (t) => {
  const { app, store } = await openStack(t);
  const { apiKey, tenant } = await provision(app, store, "title", "Acme Title");
  assert.ok(apiKey.startsWith("bpg_"));
  assert.equal(tenant.persona, "TITLE_VENDOR");
  assert.equal(tenant.role, "title");
  assert.equal(tenant.status, "ACTIVE");
  const stored = JSON.stringify(tenant);
  assert.ok(!stored.includes(apiKey), "tenant record must not contain the plaintext key");
});

test("persona masking removes NPI and out-of-scope objects before the response leaves the gateway", async (t) => {
  const { app, store } = await openStack(t);
  const broker = await provision(app, store, "broker", "Acme Broker");
  const title = await provision(app, store, "title", "Acme Title");
  const appraisal = await provision(app, store, "appraisal", "Acme AMC");

  const brokerRead = await call(app, "GET", "/v1/loans/BYTE-1002948", broker.apiKeyId);
  assert.equal(brokerRead.statusCode, 200, brokerRead.body);
  const brokerLoan = JSON.parse(brokerRead.body);
  assert.equal(brokerLoan._cached, false);
  assert.equal(brokerLoan.data.Property.City, "Dallas");
  assert.equal(brokerLoan.data.Borrower.FirstName, "Jordan");
  assert.equal(brokerLoan.data.Borrower.SSN, undefined);
  assert.equal(brokerLoan.data.Borrower.DateOfBirth, undefined);
  assert.equal(brokerLoan.data.Loan.CreditScore, undefined);
  assert.equal(brokerRead.headers["Cache-Control"], "private, max-age=15");
  assert.ok(brokerLoan.data.Conditions.length > 0, "broker sees conditions");

  const titleRead = await call(app, "GET", "/v1/loans/BYTE-1002948", title.apiKeyId);
  const titleLoan = JSON.parse(titleRead.body);
  assert.equal(titleLoan.data.Borrower, undefined);
  assert.equal(titleLoan.data.Property.Street, "456 Oak Avenue");
  assert.equal(titleLoan.data.Fees[0].Amount, 1350);

  const appraisalRead = await call(app, "GET", "/v1/loans/BYTE-1002948", appraisal.apiKeyId);
  const appraisalLoan = JSON.parse(appraisalRead.body);
  assert.equal(appraisalLoan.data.Fees, undefined);
  assert.equal(appraisalLoan.data.Conditions, undefined);
  assert.equal(appraisalLoan.data.Borrower, undefined);
  assert.equal(appraisalLoan.data.Property.LegalDescription, "Lot 12, Block 4, Oak Ridge Addition");
});

test("read projection honours ?paths and rejects an oversized list", async (t) => {
  const { app, store } = await openStack(t);
  const broker = await provision(app, store, "broker", "Acme Broker");
  const appraisal = await provision(app, store, "appraisal", "Acme AMC");

  const projected = await call(app, "GET", "/v1/loans/BYTE-1002948", broker.apiKeyId, null, { paths: "Property" });
  assert.equal(projected.statusCode, 200);
  assert.deepEqual(Object.keys(JSON.parse(projected.body).data), ["Property"]);

  const denied = await call(app, "GET", "/v1/loans/BYTE-1002948", appraisal.apiKeyId, null, { paths: "Borrower" });
  assert.equal(denied.statusCode, 403, "an appraisal key may not request a borrower object");

  const roots = Array.from({ length: 11 }, (_, index) => `Root${index}`).join(",");
  assert.equal((await call(app, "GET", "/v1/loans/BYTE-1002948", broker.apiKeyId, null, { paths: roots })).statusCode, 400);
});

test("read maps BytePro locks and misses without leaking upstream bodies", async (t) => {
  const { app, store } = await openStack(t);
  const broker = await provision(app, store, "broker", "Acme Broker");
  const locked = await call(app, "GET", "/v1/loans/BYTE-LOCKED-1", broker.apiKeyId);
  assert.equal(locked.statusCode, 423);
  assert.equal(JSON.parse(locked.body).code, "FILE_LOCKED");
  const missing = await call(app, "GET", "/v1/loans/BYTE-404", broker.apiKeyId);
  assert.equal(missing.statusCode, 404);
});

test("a read timeout becomes 504 and an unreachable upstream becomes 502", async (t) => {
  const store = createMemoryStore();
  const { createApp } = require("../src/app");
  const { localEnv, INVITES } = require("../dev/config");
  const provisioned = createApp({
    store,
    byte: { getLoan: async () => Promise.reject(Object.assign(new Error("timed out"), { name: "TimeoutError" })) },
    env: localEnv()
  });
  const key = await provision(provisioned, store, "broker", "Acme Broker");
  assert.equal((await call(provisioned, "GET", "/v1/loans/BYTE-1002948", key.apiKeyId)).statusCode, 504);

  const broken = createApp({
    store,
    byte: { getLoan: async () => Promise.reject(new Error("ECONNREFUSED")) },
    env: localEnv()
  });
  assert.equal((await call(broken, "GET", "/v1/loans/BYTE-1002948", key.apiKeyId)).statusCode, 502);

  const unauthorized = createApp({
    store,
    byte: { getLoan: async () => ({ status: 401, body: "{}" }) },
    env: localEnv()
  });
  assert.equal((await call(unauthorized, "GET", "/v1/loans/BYTE-1002948", key.apiKeyId)).statusCode, 502);
  assert.ok(INVITES.broker.length >= 24);
});

test("fee writes are queued for title and broker, rejected for appraisal before enqueueing", async (t) => {
  const { app, store, mock, byte } = await openStack(t);
  const title = await provision(app, store, "title", "Acme Title");
  const appraisal = await provision(app, store, "appraisal", "Acme AMC");

  const accepted = await call(app, "PATCH", "/v1/loans/BYTE-1002948/fees", title.apiKeyId, {
    fees: [{ feeType: "TitleLendersPolicy", amount: 1410, paidTo: "Acme Title" }]
  });
  assert.equal(accepted.statusCode, 202, accepted.body);
  const { jobId, status, statusUrl } = JSON.parse(accepted.body);
  assert.equal(status, "ACCEPTED");
  assert.equal(statusUrl, `/v1/jobs/${jobId}`);
  assert.equal(store.queue.length, 1);
  assert.equal(store.queue[0].payload.Fees[0].FeeType, "TitleLendersPolicy");
  assert.equal(store.queue[0].payload.fees, undefined);

  const denied = await call(app, "PATCH", "/v1/loans/BYTE-1002948/fees", appraisal.apiKeyId, { fees: [{ feeType: "X", amount: 1 }] });
  assert.equal(denied.statusCode, 403);
  assert.equal(store.queue.length, 1, "appraisal rejection happens before any job or message exists");

  await drainQueue({ store, byte });
  assert.equal((await store.getJob(jobId)).status, "COMPLETED");
  assert.deepEqual(mock.updates.at(-1).data.Fees, [{ FeeType: "TitleLendersPolicy", Amount: 1410, PaidTo: "Acme Title" }]);

  const statusRead = await call(app, "GET", `/v1/jobs/${jobId}`, title.apiKeyId);
  assert.equal(JSON.parse(statusRead.body).status, "COMPLETED");
  assert.equal(JSON.parse(statusRead.body).kind, "fees");
});

test("invalid fee payloads are rejected before a job is created", async (t) => {
  const { app, store } = await openStack(t);
  const broker = await provision(app, store, "broker", "Acme Broker");
  for (const body of [{}, { fees: [] }, { fees: [{ feeType: "", amount: 1 }] }, { fees: [{ feeType: "X", amount: "1" }] }, { fees: Array(101).fill({ feeType: "X", amount: 1 }) }]) {
    assert.equal((await call(app, "PATCH", "/v1/loans/BYTE-1002948/fees", broker.apiKeyId, body)).statusCode, 400);
  }
  assert.equal(store.queue.length, 0);
});

test("conditions are submitted by broker and title, applied by the worker, and invisible to appraisal", async (t) => {
  const { app, store, mock, byte } = await openStack(t);
  const broker = await provision(app, store, "broker", "Acme Broker");
  const title = await provision(app, store, "title", "Acme Title");
  const appraisal = await provision(app, store, "appraisal", "Acme AMC");

  const accepted = await call(app, "POST", "/v1/loans/BYTE-1002948/conditions", broker.apiKeyId, {
    conditions: [
      { description: "Provide title commitment", status: "Satisfied" },
      { description: "Upload 2025 W-2", status: "Received", borrowerVisible: true }
    ]
  });
  assert.equal(accepted.statusCode, 202, accepted.body);
  const { jobId } = JSON.parse(accepted.body);
  assert.equal(store.queue[0].payload.Conditions[0].Description, "Provide title commitment");

  await drainQueue({ store, byte });
  assert.equal((await store.getJob(jobId)).status, "COMPLETED");
  const sent = mock.updates.at(-1).data.Conditions;
  assert.equal(sent.length, 2);
  assert.equal(mock.loans.get("BYTE-1002948").Conditions[0].Status, "Satisfied");
  assert.ok(mock.loans.get("BYTE-1002948").Conditions.some((condition) => condition.Description === "Upload 2025 W-2"));

  const titleAccepted = await call(app, "POST", "/v1/loans/BYTE-1002948/conditions", title.apiKeyId, {
    conditions: [{ description: "Provide title commitment", status: "Satisfied" }]
  });
  assert.equal(titleAccepted.statusCode, 202);

  const denied = await call(app, "POST", "/v1/loans/BYTE-1002948/conditions", appraisal.apiKeyId, {
    conditions: [{ description: "X", status: "Received" }]
  });
  assert.equal(denied.statusCode, 403);
});

test("invalid condition payloads are rejected", async (t) => {
  const { app, store } = await openStack(t);
  const broker = await provision(app, store, "broker", "Acme Broker");
  for (const body of [
    { conditions: [] },
    { conditions: [{ description: "", status: "Received" }] },
    { conditions: [{ description: "X" }] },
    { conditions: Array(101).fill({ description: "X", status: "Received" }) }
  ]) {
    assert.equal((await call(app, "POST", "/v1/loans/BYTE-1002948/conditions", broker.apiKeyId, body)).statusCode, 400);
  }
});

test("document upload, list, and download round-trip through the FIFO pipeline", async (t) => {
  const { app, store, mock, byte } = await openStack(t);
  const broker = await provision(app, store, "broker", "Acme Broker");

  const upload = await call(app, "POST", "/v1/loans/BYTE-1002948/documents", broker.apiKeyId, {
    documentType: "Title Commitment",
    notes: "Recorded copy",
    contentBase64: pdfBase64()
  });
  assert.equal(upload.statusCode, 202, upload.body);
  const { jobId } = JSON.parse(upload.body);
  assert.equal(store.queue[0].kind, "documents");
  assert.equal(store.queue[0].payload.documentType, "Title Commitment");

  await drainQueue({ store, byte });
  assert.equal((await store.getJob(jobId)).status, "COMPLETED");
  assert.equal(mock.counters.uploads, 1);

  const list = await call(app, "GET", "/v1/loans/BYTE-1002948/documents", broker.apiKeyId);
  assert.equal(list.statusCode, 200, list.body);
  const { documents } = JSON.parse(list.body);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].documentType, "Title Commitment");
  assert.equal(documents[0].fileName, "title-commitment.pdf");
  assert.equal(documents[0].contentBase64, undefined, "listing must not return bytes");
  assert.equal(list.headers["Cache-Control"], "private, max-age=15");

  const download = await call(app, "GET", `/v1/loans/BYTE-1002948/documents/${documents[0].id}`, broker.apiKeyId);
  assert.equal(download.statusCode, 200);
  const payload = JSON.parse(download.body);
  assert.equal(payload.contentType, "application/pdf");
  assert.equal(payload.contentBase64, DEMO_PDF);

  const missing = await call(app, "GET", "/v1/loans/BYTE-1002948/documents/nope", broker.apiKeyId);
  assert.equal(missing.statusCode, 404);
});

test("title keys can read and upload documents; appraisal keys cannot", async (t) => {
  const { app, store } = await openStack(t);
  const title = await provision(app, store, "title", "Acme Title");
  const appraisal = await provision(app, store, "appraisal", "Acme AMC");

  assert.equal((await call(app, "GET", "/v1/loans/BYTE-1002948/documents", title.apiKeyId)).statusCode, 200);
  const deniedUpload = await call(app, "POST", "/v1/loans/BYTE-1002948/documents", appraisal.apiKeyId, {
    documentType: "Appraisal",
    contentBase64: pdfBase64()
  });
  assert.equal(deniedUpload.statusCode, 403);
  assert.equal((await call(app, "GET", "/v1/loans/BYTE-1002948/documents", appraisal.apiKeyId)).statusCode, 403);
  assert.equal(store.queue.length, 0);
});

test("document validation rejects bad base64, non-PDFs, oversized files, and missing metadata", async (t) => {
  const { app, store } = await openStack(t);
  const broker = await provision(app, store, "broker", "Acme Broker");
  const base = { documentType: "Title Commitment", contentBase64: pdfBase64() };

  const cases = [
    [{ ...base, documentType: "" }, 400],
    [{ ...base, contentBase64: "not base64!" }, 400],
    [{ ...base, contentBase64: Buffer.from("just text").toString("base64") }, 415],
    [{ ...base, contentBase64: Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(180_001)]).toString("base64") }, 413],
    [{ ...base, notes: "x".repeat(501) }, 400]
  ];
  for (const [body, expected] of cases) {
    const response = await call(app, "POST", "/v1/loans/BYTE-1002948/documents", broker.apiKeyId, body);
    assert.equal(response.statusCode, expected, JSON.stringify(body).slice(0, 80));
  }
  assert.equal(store.queue.length, 0);
});

test("job status is owner-scoped and unknown routes return 404", async (t) => {
  const { app, store } = await openStack(t);
  const broker = await provision(app, store, "broker", "Acme Broker");
  const title = await provision(app, store, "title", "Acme Title");

  const accepted = await call(app, "PATCH", "/v1/loans/BYTE-1002948/fees", broker.apiKeyId, { fees: [{ feeType: "X", amount: 1 }] });
  const { jobId } = JSON.parse(accepted.body);
  assert.equal((await call(app, "GET", `/v1/jobs/${jobId}`, title.apiKeyId)).statusCode, 404);
  assert.equal((await call(app, "GET", "/v1/jobs/job_missing", broker.apiKeyId)).statusCode, 404);
  assert.equal((await call(app, "GET", "/v1/nope", broker.apiKeyId)).statusCode, 404);
});

test("1003 loan writes stay unimplemented rather than guessing a BytePro shape", async (t) => {
  const { app, store } = await openStack(t);
  const broker = await provision(app, store, "broker", "Acme Broker");
  const response = await call(app, "PATCH", "/v1/loans/BYTE-1002948", broker.apiKeyId, { data: { Loan: { InterestRate: 6 } } });
  assert.equal(response.statusCode, 501);
  assert.match(JSON.parse(response.body).error, /1003/);
});

test("retryable upstream failures keep the job RETRYING; permanent and exhausted failures are FAILED", async () => {
  const { processWrite } = require("../src/writes");
  const { makeJob } = require("./helpers");
  const storeResponse = (status) => ({ updateLoan: async () => ({ status, body: "" }) });

  const retrying = createMemoryStore();
  const job = makeJob();
  await retrying.putJob(job);
  await assert.rejects(() => processWrite({ job, payload: {}, byte: storeResponse(423), store: retrying, attempts: 1 }), /Retryable upstream status 423/);
  assert.equal((await retrying.getJob(job.jobId)).status, "RETRYING");
  await processWrite({ job: await retrying.getJob(job.jobId), payload: {}, byte: storeResponse(200), store: retrying, attempts: 2 });
  assert.equal((await retrying.getJob(job.jobId)).status, "COMPLETED");

  const permanent = createMemoryStore();
  const permanentJob = makeJob("job_permanent");
  await permanent.putJob(permanentJob);
  await processWrite({ job: permanentJob, payload: {}, byte: storeResponse(400), store: permanent, attempts: 1 });
  assert.equal((await permanent.getJob(permanentJob.jobId)).status, "FAILED");

  const exhausted = createMemoryStore();
  const exhaustedJob = makeJob("job_exhausted");
  await exhausted.putJob(exhaustedJob);
  await processWrite({ job: exhaustedJob, payload: {}, byte: storeResponse(503), store: exhausted, attempts: 5 });
  const final = await exhausted.getJob(exhaustedJob.jobId);
  assert.equal(final.status, "FAILED");
  assert.match(final.error, /after 5 attempts/);
});

test("HTTP adapter serves the whole flow with x-api-key identity", async (t) => {
  const { app, store, byte } = await openStack(t);
  const { serve } = require("../src/server");
  const server = await serve({ app, port: 0, resolveApiKey: store.resolveApiKey });
  t.after(() => new Promise((done) => server.close(done)));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const provisioned = await fetch(`${origin}/portal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "broker", code: "local-broker-invite-0123456789", tenantName: "Acme Broker", email: "dev@acme.test" })
  });
  assert.equal(provisioned.status, 200);
  const { apiKey } = await provisioned.json();

  const loan = await fetch(`${origin}/v1/loans/BYTE-1002948`, { headers: { "x-api-key": apiKey } });
  assert.equal(loan.status, 200);
  assert.equal((await loan.json()).data.Property.City, "Dallas");

  const upload = await fetch(`${origin}/v1/loans/BYTE-1002948/documents`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ documentType: "Title Commitment", contentBase64: pdfBase64() })
  });
  assert.equal(upload.status, 202);
  await drainQueue({ store, byte });

  const list = await fetch(`${origin}/v1/loans/BYTE-1002948/documents`, { headers: { "x-api-key": apiKey } });
  const { documents } = await list.json();
  assert.equal(documents.length, 1);
  assert.equal(documents[0].documentType, "Title Commitment");
});

test("local mock is usable directly by tests", async (t) => {
  const mock = await startMockBytepro();
  t.after(() => mock.close());
  assert.ok(mock.port > 0);
  assert.ok(root.includes("BytePro"));
  assert.deepEqual([BROKER, TITLE, APPRAISAL].map((persona) => persona.split("_")[0]), ["TPO", "TITLE", "AMC"]);
});
