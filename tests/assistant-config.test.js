const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ASSISTANT_ERROR_MESSAGES,
  DEFAULT_ASSISTANT_CONFIG,
  readAssistantConfigFromEnv
} = require("../server/config/assistant.cjs");

test("assistant config falls back to defaults when env is empty", () => {
  const config = readAssistantConfigFromEnv({});
  assert.equal(config.anthropicApiKey, "");
  assert.equal(config.assistantModel, "claude-opus-5");
  assert.equal(config.assistantRateLimitPerHour, 20);
  assert.equal(config.assistantTotalDailyLimit, 300);
  assert.equal(config.assistantTimeoutMs, 45_000);
  assert.equal(config.assistantMaxInputChars, 2000);
  assert.equal(config.assistantMaxPayloadBytes, 65_536);
  assert.equal(config.publicBaseUrl, "");
  assert.deepEqual(config, { ...DEFAULT_ASSISTANT_CONFIG });
});

test("assistant config reads env and ignores garbage numbers", () => {
  const config = readAssistantConfigFromEnv({
    ANTHROPIC_API_KEY: "sk-test",
    ASSISTANT_MODEL: "claude-opus-5",
    ASSISTANT_RATE_LIMIT_PER_HOUR: "5",
    ASSISTANT_TOTAL_DAILY_LIMIT: "abc",
    PUBLIC_BASE_URL: "https://example.com/"
  });
  assert.equal(config.anthropicApiKey, "sk-test");
  assert.equal(config.assistantRateLimitPerHour, 5);
  assert.equal(config.assistantTotalDailyLimit, 300);
  assert.equal(config.publicBaseUrl, "https://example.com", "trailing slash is trimmed");
});

test("assistant error messages cover every assistant code", () => {
  for (const code of ["ASSISTANT_RATE_LIMIT", "ASSISTANT_DAILY_LIMIT", "ASSISTANT_UNAVAILABLE", "ASSISTANT_BAD_OUTPUT", "NOT_CONFIRMED"]) {
    assert.equal(typeof ASSISTANT_ERROR_MESSAGES[code], "string");
    assert.ok(ASSISTANT_ERROR_MESSAGES[code].endsWith("."));
  }
});
