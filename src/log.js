/** Structured JSON logging — the only allowed log shape (see agents.md §3). */
const log = (level, action, details = {}) =>
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), system: "ByteProGateway", level, action, ...details }));

module.exports = { log };
