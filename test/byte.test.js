const assert = require("node:assert/strict");
const { test } = require("node:test");
const { startMockBytepro, DEMO_PDF } = require("../mock/bytepro");
const { createMemoryStore } = require("../dev/memory-store");
const { localEnv, seedSecrets } = require("../dev/config");
const { createByte, loanData, documentList, documentContent } = require("../src/byte");

const openClient = async (t, { patchSecret } = {}) => {
  const mock = await startMockBytepro();
  t.after(() => mock.close());
  const env = localEnv(`http://127.0.0.1:${mock.port}`);
  const store = seedSecrets(createMemoryStore());
  if (patchSecret) patchSecret(store, env);
  return { mock, env, store, byte: createByte({ store, env }) };
};

test("session tokens are cached per role and reused across calls", async (t) => {
  const { mock, store, byte } = await openClient(t);
  const first = await byte.getLoan("broker", "BYTE-1002948", "Property,Loan");
  assert.equal(first.status, 200);
  await byte.getLoan("broker", "BYTE-1002948", "Property");
  assert.equal(mock.counters.logins, 1, "second call must reuse the cached session");
  assert.ok((await store.getSession("broker")).token.startsWith("tok_broker"));
});

test("a 401 from BytePro invalidates the cache and retries once with a fresh login", async (t) => {
  const { mock, byte } = await openClient(t);
  await byte.getLoan("broker", "BYTE-1002948", "Property");
  mock.sessions.clear();
  const retried = await byte.getLoan("broker", "BYTE-1002948", "Property");
  assert.equal(retried.status, 200);
  assert.equal(mock.counters.logins, 2);
});

test("an expired cached session is replaced before the request is sent", async (t) => {
  const { mock, store, byte } = await openClient(t);
  await store.putSession({ role: "title", token: "stale", expiresAt: 0, ttl: 0 });
  const response = await byte.getLoan("title", "BYTE-1002948", "Property");
  assert.equal(response.status, 200);
  assert.equal(mock.counters.logins, 1);
  assert.notEqual((await store.getSession("title")).token, "stale");
});

test("bad credentials surface as a gateway error instead of a phantom request", async (t) => {
  const { byte } = await openClient(t, {
    patchSecret: (store, env) => store.setSecret(env.BYTE_TITLE_SECRET_ARN, "wrong-password")
  });
  await assert.rejects(() => byte.getLoan("title", "BYTE-1002948", "Property"), /authentication failed: 401/);
  await assert.rejects(() => byte.getLoan("admin", "BYTE-1002948", "Property"), /Unknown BytePro role/);
});

test("document and loan response shapes normalize to the vendor contract", () => {
  assert.deepEqual(loanData(JSON.stringify({ data: { Loan: { BaseLoanAmount: 1 } } })), { Loan: { BaseLoanAmount: 1 } });
  assert.deepEqual(loanData(JSON.stringify({ Loan: { BaseLoanAmount: 2 } })), { Loan: { BaseLoanAmount: 2 } });
  assert.equal(loanData("not json"), null);

  assert.deepEqual(documentList(JSON.stringify({ Documents: [{ DocumentId: 7, DocumentType: "Title", FileName: "t.pdf" }] })), [
    { id: "7", documentType: "Title", fileName: "t.pdf", notes: null, uploadedAt: null }
  ]);
  assert.equal(documentList("[]").length, 0);

  assert.equal(documentContent(JSON.stringify({ contentBase64: DEMO_PDF })), DEMO_PDF);
  assert.equal(documentContent(DEMO_PDF), DEMO_PDF);
  assert.equal(documentContent(JSON.stringify({ data: DEMO_PDF })), DEMO_PDF);
  assert.equal(documentContent("{}"), null);
});
