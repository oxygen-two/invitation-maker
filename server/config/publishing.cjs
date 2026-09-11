const DEFAULT_PUBLISHING_CONFIG = Object.freeze({
  lifetimeLimit: 1000,
  maxPayloadBytes: 2_000_000,
  publicIdLength: 22,
  rateLimitPerHour: 10,
  tokenBytes: 32,
  totalDailyLimit: 100,
  ttlDays: 0
});

const PUBLISHING_ERROR_MESSAGES = Object.freeze({
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

const readPublishingConfigFromEnv = (env = process.env) => ({
  lifetimeLimit: integerFromEnv(env, "PUBLISH_LIFETIME_LIMIT", DEFAULT_PUBLISHING_CONFIG.lifetimeLimit),
  maxPayloadBytes: integerFromEnv(env, "PUBLISH_MAX_BYTES", DEFAULT_PUBLISHING_CONFIG.maxPayloadBytes),
  rateLimitPerHour: integerFromEnv(env, "PUBLISH_RATE_LIMIT_PER_HOUR", DEFAULT_PUBLISHING_CONFIG.rateLimitPerHour),
  totalDailyLimit: integerFromEnv(env, "PUBLISH_TOTAL_DAILY_LIMIT", DEFAULT_PUBLISHING_CONFIG.totalDailyLimit),
  ttlDays: integerFromEnv(env, "PUBLISH_TTL_DAYS", DEFAULT_PUBLISHING_CONFIG.ttlDays)
});

module.exports = {
  DEFAULT_PUBLISHING_CONFIG,
  PUBLISHING_ERROR_MESSAGES,
  readPublishingConfigFromEnv
};
