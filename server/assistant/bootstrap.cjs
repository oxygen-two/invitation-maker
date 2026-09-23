// server/assistant/bootstrap.cjs
// Builds the assistant from config + repository. Both the local server and
// the Vercel function call this, so the wiring lives in exactly one place.
const { createAssistant } = require("./assistant.cjs");
const { createAssistantCatalog } = require("./catalog.cjs");
const { createClaudeMessageClient } = require("./claude-client.cjs");
const { createAssistantEngine } = require("./engine.cjs");
const { createAssistantQuota } = require("./quota.cjs");

const createAssistantFromConfig = ({ config, repository = null, report = () => {} }) => {
  const catalog = createAssistantCatalog();
  const createMessage = createClaudeMessageClient({ apiKey: config.anthropicApiKey, timeoutMs: config.assistantTimeoutMs });
  const engine = createMessage ? createAssistantEngine({ createMessage, catalog, config, report }) : null;
  const quota = createAssistantQuota({
    repository,
    rateLimitPerHour: config.assistantRateLimitPerHour,
    totalDailyLimit: config.assistantTotalDailyLimit
  });
  return createAssistant({ engine, quota, catalog, repository, config });
};

module.exports = { createAssistantFromConfig };
