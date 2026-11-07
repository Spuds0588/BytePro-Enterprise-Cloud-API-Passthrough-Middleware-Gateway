const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { startMockBytepro, DEMO_PDF } = require("../mock/bytepro");
const { createMemoryStore } = require("../dev/memory-store");
const { localEnv, seedSecrets, INVITES } = require("../dev/config");

const root = path.resolve(__dirname, "..");

/** Pulls the inline Lambda bundle out of the committed template exactly as CloudFormation sees it. */
function extractInlineCode(template) {
  const marker = "        ZipFile: |\n";
  const start = template.indexOf(marker);
  assert.ok(start > 0, "template must contain an inline ZipFile block");
  const lines = template.slice(start + marker.length).split("\n");
  const code = [];
  for (const line of lines) {
    if (!line.startsWith(" ".repeat(9))) break;
    code.push(line.slice(9));
  }
  return code.join("\n");
}

test("the template's inline Lambda bundle serves reads, document uploads, and the queue worker", async (t) => {
  const code = extractInlineCode(fs.readFileSync(path.join(root, "template.yaml"), "utf8"));
  assert.match(code, /const __defs=\s*\{/, "bundle must inline its modules");
  assert.match(code, /function __require\(id\)/, "bundle must resolve inlined modules");
  assert.ok(!code.includes("__GATEWAY_CODE__"));

  const bundlePath = path.join(os.tmpdir(), `bytepro-bundle-${process.pid}-${Date.now()}.js`);
  fs.writeFileSync(bundlePath, code);
  t.after(() => fs.rmSync(bundlePath, { force: true }));

  const { createHandler } = require(bundlePath);
  assert.equal(typeof createHandler, "function");

  const mock = await startMockBytepro();
  t.after(() => mock.close());
  const env = localEnv(`http://127.0.0.1:${mock.port}`);
  const store = seedSecrets(createMemoryStore());
  const handler = createHandler({ store, env });

  assert.equal((await handler({ httpMethod: "GET", path: "/health" })).statusCode, 200);

  const provisioned = await handler({
    httpMethod: "POST",
    path: "/portal",
    body: JSON.stringify({ tenantName: "Acme Broker", email: "dev@acme.test", role: "broker", code: INVITES.broker })
  });
  assert.equal(provisioned.statusCode, 200, provisioned.body);
  const apiKeyId = store.resolveApiKey(JSON.parse(provisioned.body).apiKey);
  assert.ok(apiKeyId);

  const read = await handler({ httpMethod: "GET", path: "/v1/loans/BYTE-1002948", requestContext: { identity: { apiKeyId } } });
  assert.equal(read.statusCode, 200, read.body);
  const loan = JSON.parse(read.body);
  assert.equal(loan.data.Property.City, "Dallas");
  assert.equal(loan.data.Borrower.SSN, undefined);

  const upload = await handler({
    httpMethod: "POST",
    path: "/v1/loans/BYTE-1002948/documents",
    body: JSON.stringify({ documentType: "Title Commitment", contentBase64: DEMO_PDF }),
    requestContext: { identity: { apiKeyId } }
  });
  assert.equal(upload.statusCode, 202, upload.body);

  const message = store.queue.shift();
  const queued = await handler({
    Records: [
      {
        eventSource: "aws:sqs",
        messageId: "message-1",
        attributes: { ApproximateReceiveCount: "1" },
        body: JSON.stringify(message)
      }
    ]
  });
  assert.deepEqual(queued.batchItemFailures, []);
  assert.equal((await store.getJob(message.jobId)).status, "COMPLETED");

  const list = await handler({
    httpMethod: "GET",
    path: "/v1/loans/BYTE-1002948/documents",
    requestContext: { identity: { apiKeyId } }
  });
  assert.equal(list.statusCode, 200);
  assert.equal(JSON.parse(list.body).documents.length, 1);
});
