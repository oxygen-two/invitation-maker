const crypto = require("node:crypto");

const DEFAULT_ADMIN_CONFIG = Object.freeze({
  host: "0.0.0.0",
  port: 4174,
  sessionTtlMs: 8 * 60 * 60 * 1000,
  pageSize: 20,
  loginWindowMs: 60 * 1000,
  loginMaxAttempts: 5,
  publicBaseUrl: "http://127.0.0.1:4173"
});

const boundedIntegerFromEnv = (env, name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const value = Number.parseInt(env[name] || "", 10);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
};

const clampedIntegerFromEnv = (env, name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const value = Number.parseInt(env[name] || "", 10);
  if (!Number.isSafeInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
};

const httpUrlFromEnv = (env, name, fallback) => {
  try {
    const parsed = new URL(String(env[name] || fallback));
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString().replace(/\/$/, "") : fallback;
  } catch {
    return fallback;
  }
};

const readAdminConfigFromEnv = (env = process.env) => ({
  adminPassword: env.ADMIN_PASSWORD || "",
  host: env.ADMIN_HOST || DEFAULT_ADMIN_CONFIG.host,
  port: boundedIntegerFromEnv(env, "ADMIN_PORT", DEFAULT_ADMIN_CONFIG.port, { min: 1, max: 65_535 }),
  sessionTtlMs: boundedIntegerFromEnv(env, "ADMIN_SESSION_TTL_MS", DEFAULT_ADMIN_CONFIG.sessionTtlMs, { min: 60_000, max: 7 * 24 * 60 * 60 * 1000 }),
  pageSize: clampedIntegerFromEnv(env, "ADMIN_PAGE_SIZE", DEFAULT_ADMIN_CONFIG.pageSize, { min: 1, max: 100 }),
  publicBaseUrl: httpUrlFromEnv(env, "PUBLIC_BASE_URL", DEFAULT_ADMIN_CONFIG.publicBaseUrl),
  loginRateLimit: {
    windowMs: boundedIntegerFromEnv(env, "ADMIN_LOGIN_WINDOW_MS", DEFAULT_ADMIN_CONFIG.loginWindowMs, { min: 10_000, max: 60 * 60 * 1000 }),
    maxAttempts: boundedIntegerFromEnv(env, "ADMIN_LOGIN_MAX_ATTEMPTS", DEFAULT_ADMIN_CONFIG.loginMaxAttempts, { min: 1, max: 100 })
  }
});

const passwordMatches = (actual, expected) => {
  if (!expected || !actual) return false;
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
  boundedIntegerFromEnv,
  clampedIntegerFromEnv,
  passwordMatches,
  readAdminConfigFromEnv
};
