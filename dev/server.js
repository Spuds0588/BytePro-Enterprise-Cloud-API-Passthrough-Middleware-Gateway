/** Local stack: fake BytePro + memory store + FIFO drain runner. Nothing here is deployed. */
const { startMockBytepro } = require("../mock/bytepro");
const { createMemoryStore } = require("./memory-store");
const { drain } = require("./local-runner");
const { localEnv, seedSecrets, INVITES } = require("./config");
const { createByte } = require("../src/byte");
const { createApp } = require("../src/app");
const { serve } = require("../src/server");

const PORT = Number(process.env.PORT || 3000);

(async () => {
  const mock = await startMockBytepro();
  const env = localEnv(`http://127.0.0.1:${mock.port}`);
  const store = seedSecrets(createMemoryStore());
  const byte = createByte({ store, env });
  const app = createApp({ store, byte, env });
  const server = await serve({ app, port: PORT, resolveApiKey: store.resolveApiKey });
  const timer = setInterval(() => drain({ store, byte }).catch((err) => console.error("drain:", err.message)), 100);

  console.log(`Gateway:   http://127.0.0.1:${PORT}`);
  console.log(`Health:    http://127.0.0.1:${PORT}/health`);
  console.log(`Title:     http://127.0.0.1:${PORT}/portal?role=title&code=${INVITES.title}`);
  console.log(`Broker:    http://127.0.0.1:${PORT}/portal?role=broker&code=${INVITES.broker}`);
  console.log(`Appraisal: http://127.0.0.1:${PORT}/portal?role=appraisal&code=${INVITES.appraisal}`);
  console.log("Mock loans: BYTE-1002948, BYTE-LOCKED-1 (423), BYTE-404 (404)");

  const stop = () => {
    clearInterval(timer);
    server.close(() => mock.close().then(() => process.exit(0)));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
