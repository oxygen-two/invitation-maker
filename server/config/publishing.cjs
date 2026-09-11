const DEFAULT_PUBLISHING_CONFIG = Object.freeze({
  // Sliding expiry: a publication lives `idleWindowDays` past its last public
  // read, and never longer than `maxLifetimeDays` after it was published.
  // `expiryRefreshThrottleHours` bounds how often a read may write.
  expiryRefreshThrottleHours: 6,
  idleWindowDays: 7,
  lifetimeLimit: 1000,
  maxLifetimeDays: 30,
  maxPayloadBytes: 2_000_000,
  publicIdLength: 22,
  rateLimitPerHour: 10,
  tokenBytes: 32,
  totalDailyLimit: 100
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
  expiryRefreshThrottleHours: integerFromEnv(env, "PUBLISH_EXPIRY_REFRESH_HOURS", DEFAULT_PUBLISHING_CONFIG.expiryRefreshThrottleHours),
  idleWindowDays: integerFromEnv(env, "PUBLISH_IDLE_WINDOW_DAYS", DEFAULT_PUBLISHING_CONFIG.idleWindowDays),
  lifetimeLimit: integerFromEnv(env, "PUBLISH_LIFETIME_LIMIT", DEFAULT_PUBLISHING_CONFIG.lifetimeLimit),
  maxLifetimeDays: integerFromEnv(env, "PUBLISH_MAX_LIFETIME_DAYS", DEFAULT_PUBLISHING_CONFIG.maxLifetimeDays),
  maxPayloadBytes: integerFromEnv(env, "PUBLISH_MAX_BYTES", DEFAULT_PUBLISHING_CONFIG.maxPayloadBytes),
  rateLimitPerHour: integerFromEnv(env, "PUBLISH_RATE_LIMIT_PER_HOUR", DEFAULT_PUBLISHING_CONFIG.rateLimitPerHour),
  totalDailyLimit: integerFromEnv(env, "PUBLISH_TOTAL_DAILY_LIMIT", DEFAULT_PUBLISHING_CONFIG.totalDailyLimit)
});

module.exports = {
  DEFAULT_PUBLISHING_CONFIG,
  PUBLISHING_ERROR_MESSAGES,
  readPublishingConfigFromEnv
};
