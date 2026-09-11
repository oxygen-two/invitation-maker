const crypto = require("node:crypto");

const DEFAULT_ADMIN_CONFIG = Object.freeze({
  host: "0.0.0.0",
  port: 4174,
  sessionTtlMs: 8 * 60 * 60 * 1000,
  pageSize: 20
});

const integerFromEnv = (env, name, fallback) => {
  const value = Number.parseInt(env[name] || "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const readAdminConfigFromEnv = (env = process.env) => ({
  adminPassword: env.ADMIN_PASSWORD || "",
  host: env.ADMIN_HOST || DEFAULT_ADMIN_CONFIG.host,
  port: integerFromEnv(env, "ADMIN_PORT", DEFAULT_ADMIN_CONFIG.port),
  sessionTtlMs: integerFromEnv(env, "ADMIN_SESSION_TTL_MS", DEFAULT_ADMIN_CONFIG.sessionTtlMs),
  pageSize: integerFromEnv(env, "ADMIN_PAGE_SIZE", DEFAULT_ADMIN_CONFIG.pageSize),
  publicBaseUrl: env.PUBLIC_BASE_URL || "http://127.0.0.1:4173"
});

const passwordMatches = (actual, expected) => {
  const actualBuffer = Buffer.from(String(actual || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  const length = Math.max(actualBuffer.length, expectedBuffer.length, 1);
  const paddedActual = Buffer.alloc(length);
  const paddedExpected = Buffer.alloc(length);
  actualBuffer.copy(paddedActual);
  expectedBuffer.copy(paddedExpected);
  return crypto.timingSafeEqual(paddedActual, paddedExpected) && actualBuffer.length === expectedBuffer.length;
};

module.exports = {
  DEFAULT_ADMIN_CONFIG,
  passwordMatches,
  readAdminConfigFromEnv
};
