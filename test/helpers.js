/** Shared test harness: real handler over the local fake BytePro and in-memory store. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { startMockBytepro, DEMO_PDF } = require("../mock/bytepro");
const { createMemoryStore } = require("../dev/memory-store");
const { localEnv, seedSecrets, INVITES } = require("../dev/config");
const { createByte } = require("../src/byte");
const { createApp } = require("../src/app");
const { drain } = require("../dev/local-runner");

const root = path.resolve(__dirname, "..");
const BROKER = "TPO_BROKER";
const TITLE = "TITLE_VENDOR";
const APPRAISAL = "AMC_VENDOR";

async function openStack(t) {
  const mock = await startMockBytepro();
  t.after(() => mock.close());
  const env = localEnv(`http://127.0.0.1:${mock.port}`);
  const store = seedSecrets(createMemoryStore());
  const byte = createByte({ store, env });
  const app = createApp({ store, byte, env });
  return { mock, env, store, byte, app };
}

async function provision(app, store, role, tenantName) {
  const response = await app.handle({
    httpMethod: "POST",
    path: "/portal",
    body: JSON.stringify({ role, code: INVITES[role], tenantName, email: "dev@acme.test" })
  });
  assert.equal(response.statusCode, 200, response.body);
  const { apiKey } = JSON.parse(response.body);
  const apiKeyId = store.resolveApiKey(apiKey);
  assert.ok(apiKeyId, "provisioned key must resolve to a tenant id");
  return { apiKey, apiKeyId, tenant: await store.getTenant(apiKeyId) };
}

const call = (app, method, path, apiKeyId, body = null, query = null) =>
  app.handle({
    httpMethod: method,
    path,
    body: body === null ? null : JSON.stringify(body),
    queryStringParameters: query,
    requestContext: { identity: { apiKeyId } }
  });

const drainQueue = async ({ store, byte }) => {
  for (let i = 0; i < 10 && store.queue.length; i += 1) await drain({ store, byte });
};

const pdfBase64 = () => DEMO_PDF;

const makeJob = (jobId = "job_test") => ({
  jobId,
  loanId: "BYTE-1002948",
  apiKeyId: "key_test",
  role: "broker",
  kind: "fees",
  status: "PENDING",
  attempts: 0,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
});

module.exports = { root, openStack, provision, call, drainQueue, pdfBase64, makeJob, BROKER, TITLE, APPRAISAL };
