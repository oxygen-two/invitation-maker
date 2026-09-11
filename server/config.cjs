const DEFAULT_LIMITS = Object.freeze({
  maxPayloadBytes: 2_000_000,
  publicIdLength: 22,
  tokenBytes: 32,
  ttlDays: 0,
  rateLimitPerHour: 10,
  totalDailyLimit: 100,
  lifetimeLimit: 1000,
  port: 4173,
  host: "127.0.0.1",
  trustProxy: false
});

const ERROR_MESSAGES = Object.freeze({
  BAD_JSON: "Request body must be valid JSON.",
  BAD_REQUEST: "Request does not match the publishing API contract.",
  BODY_TOO_LARGE: "Invitation payload is too large.",
  FORBIDDEN_ORIGIN: "This origin is not allowed to publish invitations.",
  IDEMPOTENCY_CONFLICT: "This idempotency key was already used with different content.",
  LIFETIME_LIMIT: "The service lifetime publishing quota has been reached.",
  METHOD_NOT_ALLOWED: "This method is not allowed for the requested resource.",
  NOT_FOUND: "Invitation was not found.",
  RATE_LIMIT: "Too many invitations were published from this client.",
  REPOSITORY_UNAVAILABLE: "Publishing storage is unavailable.",
  TOKEN_FORBIDDEN: "The management token does not match this invitation.",
  TOKEN_REQUIRED: "A valid management token is required.",
  TOTAL_DAILY_LIMIT: "The service daily publishing quota has been reached.",
  EXPIRED: "Invitation has expired."
});

const integerFromEnv = (env, name, fallback) => {
  const value = Number.parseInt(env[name] || "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const booleanFromEnv = (env, name, fallback) => {
  const value = String(env[name] || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
};

const readConfigFromEnv = (env = process.env) => ({
  mongoUri: env.MONGODB_URI || "",
  mongoDbName: env.MONGODB_DB || "invitation_publish",
  allowedOrigin: env.PUBLISH_ALLOWED_ORIGIN || "",
  maxPayloadBytes: integerFromEnv(env, "PUBLISH_MAX_BYTES", DEFAULT_LIMITS.maxPayloadBytes),
  ttlDays: integerFromEnv(env, "PUBLISH_TTL_DAYS", DEFAULT_LIMITS.ttlDays),
  rateLimitPerHour: integerFromEnv(env, "PUBLISH_RATE_LIMIT_PER_HOUR", DEFAULT_LIMITS.rateLimitPerHour),
  totalDailyLimit: integerFromEnv(env, "PUBLISH_TOTAL_DAILY_LIMIT", DEFAULT_LIMITS.totalDailyLimit),
  lifetimeLimit: integerFromEnv(env, "PUBLISH_LIFETIME_LIMIT", DEFAULT_LIMITS.lifetimeLimit),
  trustProxy: booleanFromEnv(env, "PUBLISH_TRUST_PROXY", DEFAULT_LIMITS.trustProxy),
  host: env.HOST || DEFAULT_LIMITS.host,
  port: integerFromEnv(env, "PORT", DEFAULT_LIMITS.port)
});

module.exports = {
  DEFAULT_LIMITS,
  ERROR_MESSAGES,
  readConfigFromEnv
};
