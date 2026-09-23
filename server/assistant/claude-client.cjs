// The only file that knows about the Anthropic SDK. It hands the engine a
// plain function so everything else can be tested with a fake.
const createClaudeMessageClient = ({ apiKey = "", timeoutMs = 45_000 } = {}) => {
  if (!apiKey) return null;
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 2 });
  return (params) => client.messages.create(params);
};

module.exports = { createClaudeMessageClient };
