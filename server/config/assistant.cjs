const DEFAULT_ASSISTANT_CONFIG = Object.freeze({
  anthropicApiKey: "",
  assistantModel: "claude-opus-5",
  // Per-IP hourly and service-wide daily caps on Claude calls. Hosted MCP
  // clients (Claude.ai, ChatGPT) arrive from shared egress IPs, so the daily
  // cap is the real cost guard; the hourly one stops a single direct client.
  assistantRateLimitPerHour: 20,
  assistantTotalDailyLimit: 300,
  assistantTimeoutMs: 45_000,
  assistantMaxInputChars: 2000,
  // A draft plus two short texts fits easily; anything bigger is abuse.
  assistantMaxPayloadBytes: 65_536,
  // Absolute origin for published links. Empty means "derive from the request".
  publicBaseUrl: ""
});

const ASSISTANT_ERROR_MESSAGES = Object.freeze({
  ASSISTANT_RATE_LIMIT: "Too many drafting requests were made from this client.",
  ASSISTANT_DAILY_LIMIT: "The service daily drafting quota has been reached.",
  ASSISTANT_UNAVAILABLE: "The drafting assistant is unavailable right now.",
  ASSISTANT_BAD_OUTPUT: "The assistant could not produce a usable draft.",
  NOT_CONFIRMED: "Set confirmed to true only after the user has approved the summary."
});

const integerFromEnv = (env, name, fallback) => {
  const value = Number.parseInt(env[name] || "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const readAssistantConfigFromEnv = (env = process.env) => ({
  anthropicApiKey: env.ANTHROPIC_API_KEY || DEFAULT_ASSISTANT_CONFIG.anthropicApiKey,
  assistantModel: env.ASSISTANT_MODEL || DEFAULT_ASSISTANT_CONFIG.assistantModel,
  assistantRateLimitPerHour: integerFromEnv(env, "ASSISTANT_RATE_LIMIT_PER_HOUR", DEFAULT_ASSISTANT_CONFIG.assistantRateLimitPerHour),
  assistantTotalDailyLimit: integerFromEnv(env, "ASSISTANT_TOTAL_DAILY_LIMIT", DEFAULT_ASSISTANT_CONFIG.assistantTotalDailyLimit),
  assistantTimeoutMs: integerFromEnv(env, "ASSISTANT_TIMEOUT_MS", DEFAULT_ASSISTANT_CONFIG.assistantTimeoutMs),
  assistantMaxInputChars: DEFAULT_ASSISTANT_CONFIG.assistantMaxInputChars,
  assistantMaxPayloadBytes: DEFAULT_ASSISTANT_CONFIG.assistantMaxPayloadBytes,
  publicBaseUrl: String(env.PUBLIC_BASE_URL || DEFAULT_ASSISTANT_CONFIG.publicBaseUrl).replace(/\/+$/, "")
});

module.exports = {
  ASSISTANT_ERROR_MESSAGES,
  DEFAULT_ASSISTANT_CONFIG,
  readAssistantConfigFromEnv
};
