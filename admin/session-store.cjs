const crypto = require("node:crypto");

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

const createSessionStore = ({ ttlMs = 8 * 60 * 60 * 1000, now = () => Date.now() } = {}) => {
  const sessions = new Map();

  const purge = () => {
    const timestamp = now();
    for (const [key, session] of sessions) {
      if (session.expiresAt <= timestamp) sessions.delete(key);
    }
  };

  const create = () => {
    purge();
    const sessionToken = crypto.randomBytes(32).toString("base64url");
    const csrfToken = crypto.randomBytes(32).toString("base64url");
    sessions.set(hash(sessionToken), {
      csrfHashes: new Set([hash(csrfToken)]),
      expiresAt: now() + ttlMs
    });
    return { sessionToken, csrfToken };
  };

  const get = (sessionToken) => {
    if (!sessionToken) return null;
    purge();
    const session = sessions.get(hash(sessionToken));
    if (!session) return null;
    return { expiresAt: session.expiresAt };
  };

  const issueCsrf = (sessionToken) => {
    if (!sessionToken) return null;
    purge();
    const session = sessions.get(hash(sessionToken));
    if (!session) return null;
    const csrfToken = crypto.randomBytes(32).toString("base64url");
    session.csrfHashes.add(hash(csrfToken));
    return csrfToken;
  };

  const validCsrf = (sessionToken, csrfToken) => {
    if (!sessionToken || !csrfToken) return false;
    purge();
    const session = sessions.get(hash(sessionToken));
    if (!session) return false;
    const candidate = hash(csrfToken);
    for (const csrfHash of session.csrfHashes) {
      const actual = Buffer.from(candidate);
      const expected = Buffer.from(csrfHash);
      if (actual.length === expected.length && crypto.timingSafeEqual(actual, expected)) return true;
    }
    return false;
  };

  const remove = (sessionToken) => {
    if (sessionToken) sessions.delete(hash(sessionToken));
  };

  return { create, get, issueCsrf, validCsrf, remove, size: () => sessions.size };
};

module.exports = { createSessionStore };
