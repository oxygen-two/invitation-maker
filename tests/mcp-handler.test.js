const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { createAssistant } = require("../server/assistant/assistant.cjs");
const { createAssistantCatalog } = require("../server/assistant/catalog.cjs");
const { createAssistantEngine } = require("../server/assistant/engine.cjs");
const { createAssistantQuota } = require("../server/assistant/quota.cjs");
const { DEFAULT_ASSISTANT_CONFIG } = require("../server/config/assistant.cjs");
const { DEFAULT_PUBLISHING_CONFIG } = require("../server/config/publishing.cjs");
const { createMcpHandler } = require("../server/mcp/handler.cjs");
const { FakePublicationsRepository } = require("./helpers/fake-publications-repository.js");

const NOW = new Date("2026-09-23T03:00:00.000Z");
const catalog = createAssistantCatalog();
const readyDraft = {
  language: "ko", occasion: "event", templateId: "gallery-notice", title: "돈그리아에서 저녁", subtitle: null,
  dateTime: "2026-10-23T17:00", timeZone: "Asia/Seoul", host: "재성", location: "선릉 돈그리아", message: "같이 먹어요.", missing: []
};
const needsInfoDraft = { ...readyDraft, host: null, missing: [{ field: "host", question: "누가 초대하나요?" }] };

const modelReturning = (draft) => async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ draft, summary: "요약문" }) }] });

const buildHandler = ({ createMessage = modelReturning(readyDraft), repository = new FakePublicationsRepository(), config = {} } = {}) => {
  const merged = { ...DEFAULT_PUBLISHING_CONFIG, ...DEFAULT_ASSISTANT_CONFIG, trustProxy: false, ...config };
  const engine = createMessage ? createAssistantEngine({ createMessage, catalog, config: merged, now: () => NOW }) : null;
  const quota = createAssistantQuota({ repository, rateLimitPerHour: merged.assistantRateLimitPerHour, totalDailyLimit: merged.assistantTotalDailyLimit });
  const assistant = createAssistant({ engine, quota, catalog, repository, config: merged, now: () => NOW });
  return { handler: createMcpHandler({ assistant, config: merged }), repository };
};

const withServer = async (handler, run) => {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const rpc = async (body, { method = "POST", headers = {} } = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method,
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
  };
  try {
    await run(rpc);
  } finally {
    server.close();
    await once(server, "close");
  }
};

const call = (id, name, args) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
const toolJson = (rpcBody) => JSON.parse(rpcBody.result.content[0].text);

// fetch() always sends the real connection authority and silently ignores a
// caller-supplied "host" header (with or without a space), so it cannot be
// used to test Host-header spoofing. node:http.request lets a client set an
// arbitrary Host header, which is what a real attacker in front of the
// deployed server could also send.
const rawPost = ({ port, headers = {}, body }) => new Promise((resolve, reject) => {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const req = http.request({
    host: "127.0.0.1",
    port,
    path: "/mcp",
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "content-length": Buffer.byteLength(payload),
      ...headers
    }
  }, (response) => {
    const chunks = [];
    response.on("data", (chunk) => chunks.push(chunk));
    response.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      resolve({ status: response.statusCode, headers: response.headers, body: text ? JSON.parse(text) : null });
    });
  });
  req.on("error", reject);
  req.end(payload);
});

const withRawServer = async (handler, run) => {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    await run(port);
  } finally {
    server.close();
    await once(server, "close");
  }
};

test("initialize and tools/list answer statelessly with JSON", async () => {
  const { handler } = buildHandler();
  await withServer(handler, async (rpc) => {
    const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
    assert.equal(init.status, 200);
    assert.match(init.headers.get("content-type"), /application\/json/);
    assert.equal(init.body.result.serverInfo.name, "invitation-maker");
    assert.equal(init.headers.get("mcp-session-id"), null, "stateless: no session id");

    const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    assert.deepEqual(list.body.result.tools.map((t) => t.name).sort(), ["draft_invitation", "list_occasions", "publish_invitation", "revoke_invitation"]);
    const draftTool = list.body.result.tools.find((t) => t.name === "draft_invitation");
    assert.match(draftTool.description, /needs_info/);
    assert.match(list.body.result.tools.find((t) => t.name === "publish_invitation").description, /confirm/i);
    assert.equal(draftTool.inputSchema.properties.draft.properties.occasion.enum.length, 12);
  });
});

test("the whole conversation: draft → needs_info → draft again → publish → revoke", async () => {
  let turn = 0;
  const createMessage = async () => {
    turn += 1;
    return modelReturning(turn === 1 ? needsInfoDraft : readyDraft)();
  };
  const { handler, repository } = buildHandler({ createMessage });
  await withServer(handler, async (rpc) => {
    const first = await rpc(call(1, "draft_invitation", { request: "23일 17시 선릉 돈그리아 초대장" }));
    assert.equal(first.status, 200);
    const firstResult = toolJson(first.body);
    assert.equal(firstResult.status, "needs_info");
    assert.equal(firstResult.missing[0].field, "host");

    const second = toolJson((await rpc(call(2, "draft_invitation", { request: "23일 17시 선릉 돈그리아 초대장", draft: firstResult.draft, answers: "재성" }))).body);
    assert.equal(second.status, "ready");
    assert.equal(second.summary, "요약문");

    const unconfirmed = (await rpc(call(3, "publish_invitation", { draft: second.draft }))).body;
    assert.equal(unconfirmed.result.isError, true);
    assert.equal(toolJson(unconfirmed).error.code, "NOT_CONFIRMED");

    const published = toolJson((await rpc(call(4, "publish_invitation", { draft: second.draft, confirmed: true }))).body);
    assert.match(published.url, /^http:\/\/127\.0\.0\.1:\d+\/i\/[0-9A-Za-z]{22}$/, "base url derives from the request when PUBLIC_BASE_URL is empty");
    assert.match(published.managementToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(repository.records.size, 1);
    const hourKey = [...repository.counters.keys()].find((key) => key.startsWith("assist:hour:"));
    assert.equal(repository.counters.get(hourKey), 2, "two drafts consumed two slots");

    const revoked = toolJson((await rpc(call(5, "revoke_invitation", { id: published.id, managementToken: published.managementToken }))).body);
    assert.deepEqual(revoked, { revoked: true });
    assert.equal(repository.records.size, 0);
  });
});

test("PUBLIC_BASE_URL wins over the request host", async () => {
  const { handler } = buildHandler({ config: { publicBaseUrl: "https://invites.example" } });
  await withServer(handler, async (rpc) => {
    const published = toolJson((await rpc(call(1, "publish_invitation", { draft: readyDraft, confirmed: true }))).body);
    assert.match(published.url, /^https:\/\/invites\.example\/i\//);
  });
});

test("tool errors carry the shared error shape", async () => {
  const { handler } = buildHandler({ createMessage: null });
  await withServer(handler, async (rpc) => {
    const noEngine = (await rpc(call(1, "draft_invitation", { request: "x" }))).body;
    assert.equal(noEngine.result.isError, true);
    assert.deepEqual(toolJson(noEngine), { error: { code: "ASSISTANT_UNAVAILABLE", message: "The drafting assistant is unavailable right now." } });

    const badArgs = (await rpc(call(2, "draft_invitation", { nope: 1 }))).body;
    assert.equal(badArgs.result.isError, true, "the SDK validates the input schema before the handler");

    const list = toolJson((await rpc(call(3, "list_occasions", { language: "en" }))).body);
    assert.equal(list.occasions[0].id, "date");
  });
});

test("quota exhaustion surfaces as ASSISTANT_RATE_LIMIT", async () => {
  const { handler } = buildHandler({ config: { assistantRateLimitPerHour: 1 } });
  await withServer(handler, async (rpc) => {
    await rpc(call(1, "draft_invitation", { request: "x" }));
    const second = (await rpc(call(2, "draft_invitation", { request: "x" }))).body;
    assert.equal(toolJson(second).error.code, "ASSISTANT_RATE_LIMIT");
  });
});

test("non-POST methods are 405, oversized bodies are 413, bad JSON is a JSON-RPC error", async () => {
  const { handler } = buildHandler();
  await withServer(handler, async (rpc) => {
    const get = await rpc(null, { method: "GET" });
    assert.equal(get.status, 405);
    assert.equal(get.headers.get("allow"), "POST");
    assert.equal(get.body.error.code, "METHOD_NOT_ALLOWED");

    const big = await rpc(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "draft_invitation", arguments: { request: "x".repeat(70_000) } } }));
    assert.equal(big.status, 413);
    assert.equal(big.body.error.code, "BODY_TOO_LARGE");

    const bad = await rpc("{not json");
    assert.equal(bad.status, 400);
    assert.equal(bad.body.jsonrpc, "2.0");
    assert.ok(bad.body.error);
  });
});

test("a spoofed Host header never becomes the base of a published link", async () => {
  const { handler } = buildHandler();
  await withRawServer(handler, async (port) => {
    const response = await rawPost({
      port,
      headers: { host: "evil.example" },
      body: call(1, "publish_invitation", { draft: readyDraft, confirmed: true })
    });
    assert.equal(response.status, 200);
    assert.match(toolJson(response.body).url, /^\/i\/[0-9A-Za-z]{22}$/,
      "no publicBaseUrl or allowedOrigin configured, and the request Host is not loopback: url falls back to a relative path instead of trusting the Host header");
  });
});

test("a malformed Host header (with a space) does not crash the process", async () => {
  const { handler } = buildHandler();
  await withRawServer(handler, async (port) => {
    // Node's HTTP client and server both accept a header value with a
    // space; what used to crash the process was building the request's base
    // URL from it. resolvePublicBaseUrl now validates that origin with
    // new URL(...) itself, catches the failure, and falls back to "" before
    // the adapter ever sees it - so this answers normally instead of
    // throwing.
    const response = await rawPost({
      port,
      headers: { host: "evil host" },
      body: call(1, "publish_invitation", { draft: readyDraft, confirmed: true })
    });
    assert.equal(response.status, 200);
    assert.match(toolJson(response.body).url, /^\/i\//);

    // The process is still alive and the server keeps answering.
    const followUp = await rawPost({ port, body: { jsonrpc: "2.0", id: 2, method: "tools/list" } });
    assert.equal(followUp.status, 200);
    assert.ok(Array.isArray(followUp.body.result.tools));
  });
});

test("PUBLISH_ALLOWED_ORIGIN is trusted as the base when PUBLIC_BASE_URL is unset", async () => {
  const { handler } = buildHandler({ config: { allowedOrigin: "https://invites.example" } });
  await withServer(handler, async (rpc) => {
    const published = toolJson((await rpc(call(1, "publish_invitation", { draft: readyDraft, confirmed: true }))).body);
    assert.match(published.url, /^https:\/\/invites\.example\/i\//);
  });
});

test("an invalid configured base url answers a plain error instead of crashing the process", async () => {
  // allowedOrigin is operator-configured, not attacker-controlled, so it is
  // trusted without re-validating it against the Host header allowlist -
  // but a bad value must still fail safely rather than take the process
  // down, and must never leak the raw value or a stack trace to the caller.
  const { handler } = buildHandler({ config: { allowedOrigin: "not a url at all" } });
  await withServer(handler, async (rpc) => {
    const response = await rpc(call(1, "publish_invitation", { draft: readyDraft, confirmed: true }));
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "BAD_REQUEST");
    assert.doesNotMatch(JSON.stringify(response.body), /not a url at all/);

    // A misconfigured allowedOrigin makes every request fail the same way
    // (the base URL is resolved before any tool runs) - the point is that
    // the process survives and keeps answering cleanly, not that this one
    // request recovers.
    const followUp = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    assert.equal(followUp.status, 400);
    assert.equal(followUp.body.error.code, "BAD_REQUEST");
  });
});
