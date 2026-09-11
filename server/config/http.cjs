const DEFAULT_HTTP_CONFIG = Object.freeze({
  allowedOrigin: "",
  host: "127.0.0.1",
  port: 4173,
  staticRoot: "",
  trustProxy: false
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

const readHttpConfigFromEnv = (env = process.env) => ({
  allowedOrigin: env.PUBLISH_ALLOWED_ORIGIN || DEFAULT_HTTP_CONFIG.allowedOrigin,
  host: env.HOST || DEFAULT_HTTP_CONFIG.host,
  port: integerFromEnv(env, "PORT", DEFAULT_HTTP_CONFIG.port),
  trustProxy: booleanFromEnv(env, "PUBLISH_TRUST_PROXY", DEFAULT_HTTP_CONFIG.trustProxy)
});

module.exports = {
  DEFAULT_HTTP_CONFIG,
  readHttpConfigFromEnv
};
