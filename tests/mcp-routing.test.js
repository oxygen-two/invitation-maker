const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const { createHandler } = require("../server/http.cjs");
const { createAssistantFromConfig } = require("../server/assistant/bootstrap.cjs");
const { DEFAULT_ASSISTANT_CONFIG } = require("../server/config/assistant.cjs");
const { DEFAULT_PUBLISHING_CONFIG } = require("../server/config/publishing.cjs");
const { FakePublicationsRepository } = require("./helpers/fake-publications-repository.js");

const post = async (handler, url, body) => {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${url}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  } finally {
    server.close();
    await once(server, "close");
  }
};

const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } };

test("createHandler routes /mcp and /api/mcp.js to the MCP handler when an assistant is given", async () => {
  const repository = new FakePublicationsRepository();
  const config = { ...DEFAULT_PUBLISHING_CONFIG, ...DEFAULT_ASSISTANT_CONFIG, staticRoot: path.resolve(__dirname, "..") };
  const assistant = createAssistantFromConfig({ config, repository });
  const handler = createHandler({ repository, config, assistant });
  for (const url of ["/mcp", "/api/mcp.js"]) {
    const { status, body } = await post(handler, url, initialize);
    assert.equal(status, 200, url);
    assert.equal(body.result.serverInfo.name, "invitation-maker", url);
  }
});

test("without an assistant, /mcp is not mounted", async () => {
  const handler = createHandler({ repository: new FakePublicationsRepository(), config: { staticRoot: path.resolve(__dirname, "..") } });
  const { status, body } = await post(handler, "/mcp", initialize);
  assert.equal(status, 404);
  assert.equal(body.error.code, "NOT_FOUND");
});

test("Vercel routes /mcp to api/mcp.js with a 60 second budget, and api/mcp.js re-exports the invitations handler", () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
  assert.deepEqual(vercel.routes.find((route) => route.src === "/mcp"), { src: "/mcp", dest: "/api/mcp.js" });
  assert.equal(vercel.functions["api/**/*.js"].maxDuration, 60);
  const source = fs.readFileSync(path.join(__dirname, "..", "api", "mcp.js"), "utf8");
  assert.match(source, /require\("\.\/invitations\.js"\)/);
  const invitations = fs.readFileSync(path.join(__dirname, "..", "api", "invitations.js"), "utf8");
  assert.match(invitations, /createAssistantFromConfig/);
  assert.match(invitations, /readAssistantConfigFromEnv/);
  const local = fs.readFileSync(path.join(__dirname, "..", "server", "index.cjs"), "utf8");
  assert.match(local, /createAssistantFromConfig/);
});
