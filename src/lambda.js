/** Deployed Lambda: API Gateway routes plus SQS FIFO write records. */
const { createApp } = require("./app");
const { createByte } = require("./byte");
const { processWrite } = require("./writes");
const { log } = require("./log");

function createHandler({ store, env = process.env, byte, now = () => Date.now() }) {
  const client = byte || createByte({ store, env, timeoutMs: Number(env.UPSTREAM_TIMEOUT_MS) || undefined });
  const app = createApp({ store, byte: client, env, now });

  async function handleQueue(records) {
    const batchItemFailures = [];
    for (const record of records) {
      const attempts = Number(record.attributes?.ApproximateReceiveCount) || 1;
      let jobId;
      try {
        const message = JSON.parse(record.body || "{}");
        jobId = message.jobId;
        await processWrite({
          job: await store.getJob(message.jobId),
          kind: message.kind,
          payload: message.payload,
          byte: client,
          store,
          attempts,
          now
        });
      } catch (err) {
        log("WARN", "WRITE_RETRY_SCHEDULED", { jobId, messageId: record.messageId, attempts, message: err.message });
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }
    return { batchItemFailures };
  }

  return async function handler(event = {}) {
    if (Array.isArray(event.Records) && event.Records[0]?.eventSource === "aws:sqs") return handleQueue(event.Records);
    return app.handle(event);
  };
}

let defaultHandler = null;

exports.handler = async (event, context) => {
  if (!defaultHandler) {
    const { createAwsStore } = require("./aws-store");
    defaultHandler = createHandler({ store: createAwsStore(process.env) });
  }
  return defaultHandler(event, context);
};

exports.createHandler = createHandler;
