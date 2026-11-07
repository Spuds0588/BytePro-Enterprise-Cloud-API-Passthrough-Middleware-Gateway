/** Local drain runner: emulates the SQS FIFO event source mapping. */
const { processWrite } = require("../src/writes");
const { log } = require("../src/log");

const drain = async ({ store, byte, max = 20 }) => {
  for (let i = 0; i < max; i += 1) {
    const message = store.queue.shift();
    if (!message) return;
    const job = await store.getJob(message.jobId);
    try {
      await processWrite({
        job,
        kind: message.kind,
        payload: message.payload,
        byte,
        store,
        attempts: (job?.attempts || 0) + 1
      });
    } catch (err) {
      log("WARN", "LOCAL_WRITE_RETRY", { jobId: message.jobId, message: err.message });
      store.queue.push(message);
      return;
    }
  }
};

module.exports = { drain };
