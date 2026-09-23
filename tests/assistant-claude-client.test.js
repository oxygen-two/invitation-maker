const test = require("node:test");
const assert = require("node:assert/strict");
const { createClaudeMessageClient } = require("../server/assistant/claude-client.cjs");

test("no API key means no client", () => {
  assert.equal(createClaudeMessageClient({ apiKey: "" }), null);
  assert.equal(createClaudeMessageClient({}), null);
});

test("with a key it returns a function bound to messages.create", () => {
  const createMessage = createClaudeMessageClient({ apiKey: "sk-ant-test", timeoutMs: 1234 });
  assert.equal(typeof createMessage, "function");
  assert.equal(createMessage.length, 1);
});
