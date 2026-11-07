/** In-memory stand-in for the AWS store. Local development and tests only. */
const { randomBytes } = require("node:crypto");

function createMemoryStore({ now = () => Date.now() } = {}) {
  const tenants = new Map();
  const jobs = new Map();
  const sessions = new Map();
  const secrets = new Map();
  const keys = new Map();

  const store = {
    queue: [],
    getSecret: async (id) => secrets.get(id) ?? null,
    setSecret: (id, value) => secrets.set(id, value),
    getSession: async (role) => sessions.get(role) ?? null,
    putSession: async (session) => void sessions.set(session.role, session),
    getTenant: async (apiKeyId) => tenants.get(apiKeyId) ?? null,
    putTenant: async (tenant) => void tenants.set(tenant.apiKeyId, tenant),
    getJob: async (jobId) => jobs.get(jobId) ?? null,
    putJob: async (job) => void jobs.set(job.jobId, job),
    enqueueWrite: async (message) => void store.queue.push(JSON.parse(JSON.stringify(message))),
    createApiKey: async ({ tenantName }) => {
      const id = `key_${randomBytes(8).toString("hex")}`;
      const value = `bpg_${randomBytes(24).toString("hex")}`;
      keys.set(value, id);
      store.lastTenantName = tenantName;
      return { id, value };
    },
    resolveApiKey: (value) => (value ? keys.get(String(value)) : undefined),
    revokeSessions: () => sessions.clear()
  };
  return store;
}

module.exports = { createMemoryStore };
