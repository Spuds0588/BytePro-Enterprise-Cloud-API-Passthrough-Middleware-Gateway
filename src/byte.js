/**
 * BytePro Enterprise Cloud client. Sessions are stateful bearer tokens per
 * service account, cached in DynamoDB and refreshed once on a 401. No loan data
 * is persisted; callers receive `{ status, body }` and decide the HTTP mapping.
 */
const { log } = require("./log");
const { roleFor } = require("./roles");

const REFRESH_MS = 25 * 60_000;
const SESSION_FLOOR_MS = 60_000;

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const createByte = ({ store, env = process.env, timeoutMs = 8000, fetchImpl = fetch, now = () => Date.now() }) => {
  const base = () => String(env.BYTE_BASE_URL || "").replace(/\/+$/, "");
  const send = (path, init, token) =>
    fetchImpl(`${base()}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers },
      signal: AbortSignal.timeout(timeoutMs)
    });

  async function session(role, force = false) {
    const config = roleFor(env, role);
    if (!config) throw new Error(`Unknown BytePro role: ${role}`);

    if (!force) {
      const cached = await store.getSession(role);
      if (cached?.token && cached.expiresAt > now() + SESSION_FLOOR_MS) {
        log("INFO", "SESSION_CACHE_HIT", { role });
        return cached.token;
      }
    }

    const password = await store.getSecret(env[config.secretEnv]);
    if (!password) throw new Error(`No BytePro password configured for role: ${role}`);
    log("INFO", "SESSION_LOGIN_REQUEST", { role });

    const response = await fetchImpl(`${base()}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountCode: env.BYTE_ACCOUNT_CODE,
        username: env[config.userEnv],
        password
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      log("ERROR", "BYTE_LOGIN_FAILED", { role, status: response.status });
      throw new Error(`BytePro authentication failed: ${response.status}`);
    }

    const body = await response.json().catch(() => ({}));
    const token = body.sessionToken || body.token;
    if (!token) throw new Error("BytePro login returned no session token");

    const lifetime = Math.min((Number(body.expiresIn) || 1800) * 1000 - SESSION_FLOOR_MS, REFRESH_MS);
    const expiresAt = now() + Math.max(lifetime, SESSION_FLOOR_MS);
    await store.putSession({ role, token, expiresAt, ttl: Math.ceil(expiresAt / 1000) });
    log("INFO", "SESSION_LOGIN_SUCCESS", { role, expiresAt });
    return token;
  }

  async function call(role, path, init = {}) {
    const token = await session(role);
    const response = await send(path, init, token);
    if (response.status !== 401) return { status: response.status, body: await response.text() };

    log("WARN", "SESSION_INVALIDATED_RETRYING", { role });
    const retry = await send(path, init, await session(role, true));
    return { status: retry.status, body: await retry.text() };
  }

  return {
    getLoan: (role, loanId, paths) =>
      call(role, `/loans/${encodeURIComponent(loanId)}${paths ? `?paths=${encodeURIComponent(paths)}` : ""}`),
    updateLoan: (role, loanId, data) => call(role, `/loans/${encodeURIComponent(loanId)}`, { method: "PATCH", body: JSON.stringify({ data }) }),
    listDocuments: (role, loanId) => call(role, `/loans/${encodeURIComponent(loanId)}/documents`),
    downloadDocument: (role, loanId, documentId) =>
      call(role, `/loans/${encodeURIComponent(loanId)}/documents/${encodeURIComponent(documentId)}`),
    uploadDocument: (role, loanId, doc) =>
      call(role, `/loans/${encodeURIComponent(loanId)}/documents`, { method: "POST", body: JSON.stringify(doc) })
  };
};

/** BytePro returns the loan either bare or wrapped in `{ data }`. */
const loanData = (body) => parseJson(body)?.data ?? parseJson(body);

/** Normalizes a document list from the documented array or `documents` wrapper. */
const documentList = (body) => {
  const parsed = parseJson(body);
  const rows = Array.isArray(parsed) ? parsed : parsed?.documents ?? parsed?.Documents ?? [];
  return rows
    .map((doc) => ({
      id: doc?.id ?? doc?.documentId ?? doc?.DocumentId ?? null,
      documentType: doc?.documentType ?? doc?.DocumentType ?? doc?.type ?? null,
      fileName: doc?.fileName ?? doc?.FileName ?? doc?.name ?? null,
      notes: doc?.notes ?? doc?.Notes ?? null,
      uploadedAt: doc?.uploadedAt ?? doc?.UploadedAt ?? doc?.uploadedDate ?? null
    }))
    .filter((doc) => doc.id !== null && doc.id !== undefined)
    .map((doc) => ({ ...doc, id: String(doc.id) }));
};

/** Normalizes a downloaded document to a whitespace-free base64 string. */
const documentContent = (body) => {
  const parsed = parseJson(body);
  const content = parsed?.contentBase64 ?? parsed?.content ?? parsed?.data ?? (parsed === null ? body : null);
  return typeof content === "string" && content.trim() ? content.replace(/\s+/g, "") : null;
};

module.exports = { createByte, loanData, documentList, documentContent };
