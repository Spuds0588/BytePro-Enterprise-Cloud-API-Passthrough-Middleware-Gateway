/** Shared write-delivery logic used by the SQS worker and the local drain runner. */
const { log } = require("./log");

const RETRYABLE = (status) => status === 423 || status === 429 || status >= 500;

/** Marks a job FAILED permanently. */
const fail = (store, job, attempts, error, now) =>
  store.putJob({ ...job, status: "FAILED", attempts, error, updatedAt: new Date(now()).toISOString() });

/**
 * Attempts one queued write (loan field update or a document upload). Returns
 * normally when the job reached a terminal state; throws for a retryable
 * failure so SQS (or the local runner) redelivers it.
 */
async function processWrite({ job, kind, payload, byte, store, attempts, maxAttempts = 5, now = Date.now }) {
  if (!job) return log("WARN", "JOB_NOT_FOUND", { attempts });
  if (job.status === "COMPLETED") return;

  const updatedAt = () => new Date(now()).toISOString();
  const upstreamKind = kind || job.kind;
  let response;
  try {
    response =
      upstreamKind === "documents"
        ? await byte.uploadDocument(job.role, job.loanId, payload)
        : await byte.updateLoan(job.role, job.loanId, payload);
  } catch (err) {
    log("WARN", "WRITE_TRANSPORT_ERROR", { jobId: job.jobId, loanId: job.loanId, attempts, message: err.message });
    if (attempts >= maxAttempts) {
      await fail(store, job, attempts, err.message, now);
      return log("ERROR", "WRITE_ATTEMPTS_EXHAUSTED", { jobId: job.jobId, attempts });
    }
    await store.putJob({ ...job, status: "RETRYING", attempts, error: err.message, updatedAt: updatedAt() });
    throw err;
  }

  if (response.status < 300) {
    await store.putJob({ ...job, status: "COMPLETED", attempts, error: null, updatedAt: updatedAt() });
    return log("INFO", "WRITE_COMPLETED", { jobId: job.jobId, loanId: job.loanId, kind: upstreamKind, attempts });
  }

  if (!RETRYABLE(response.status)) {
    await fail(store, job, attempts, `upstream ${response.status}`, now);
    return log("ERROR", "WRITE_REJECTED", { jobId: job.jobId, loanId: job.loanId, status: response.status, attempts });
  }

  if (attempts >= maxAttempts) {
    await fail(store, job, attempts, `upstream still ${response.status} after ${maxAttempts} attempts`, now);
    return log("ERROR", "WRITE_ATTEMPTS_EXHAUSTED", { jobId: job.jobId, loanId: job.loanId, status: response.status, attempts });
  }

  await store.putJob({ ...job, status: "RETRYING", attempts, error: `upstream ${response.status}`, updatedAt: updatedAt() });
  log("WARN", "RECORD_LOCK_BACKOFF", { jobId: job.jobId, loanId: job.loanId, status: response.status, attempts });
  throw new Error(`Retryable upstream status ${response.status}`);
}

module.exports = { processWrite };
