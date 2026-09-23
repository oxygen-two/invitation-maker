// tests/assistant-facade.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAssistant } = require("../server/assistant/assistant.cjs");
const { createAssistantFromConfig } = require("../server/assistant/bootstrap.cjs");
const { createAssistantCatalog } = require("../server/assistant/catalog.cjs");
const { createAssistantEngine } = require("../server/assistant/engine.cjs");
const { createAssistantQuota } = require("../server/assistant/quota.cjs");
const { DEFAULT_ASSISTANT_CONFIG } = require("../server/config/assistant.cjs");
const { DEFAULT_PUBLISHING_CONFIG } = require("../server/config/publishing.cjs");
const { sha256 } = require("../server/validation.cjs");
const { FakePublicationsRepository } = require("./helpers/fake-publications-repository.js");

const NOW = new Date("2026-09-23T03:00:00.000Z");
const catalog = createAssistantCatalog();
const readyDraft = {
  language: "ko", occasion: "event", templateId: "gallery-notice", title: "돈그리아에서 저녁", subtitle: null,
  dateTime: "2026-10-23T17:00", timeZone: "Asia/Seoul", host: "재성", location: "선릉 돈그리아", message: "같이 먹어요.", missing: []
};

const build = ({ createMessage, repository = new FakePublicationsRepository(), withEngine = true } = {}) => {
  const config = { ...DEFAULT_PUBLISHING_CONFIG, ...DEFAULT_ASSISTANT_CONFIG, assistantRateLimitPerHour: 2, assistantTotalDailyLimit: 10 };
  const engine = withEngine ? createAssistantEngine({ createMessage, catalog, config, now: () => NOW }) : null;
  const quota = createAssistantQuota({ repository, rateLimitPerHour: 2, totalDailyLimit: 10 });
  return { repository, assistant: createAssistant({ engine, quota, catalog, repository, config, now: () => NOW }) };
};

const okModel = async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ draft: readyDraft, summary: "요약" }) }] });

test("listOccasions returns the catalog in the requested language", () => {
  const { assistant } = build({ createMessage: okModel });
  const result = assistant.listOccasions({ language: "en" });
  assert.equal(result.occasions.find((o) => o.id === "wedding").name, "Wedding");
  assert.equal(result.templates.length, 30);
});

test("listOccasions works without a repository", () => {
  const quota = createAssistantQuota({ repository: null, rateLimitPerHour: 2, totalDailyLimit: 10 });
  const assistant = createAssistant({ engine: null, quota, catalog, repository: null, config: DEFAULT_ASSISTANT_CONFIG });
  const result = assistant.listOccasions({ language: "ko" });
  assert.equal(result.occasions.length, 12);
  assert.equal(result.templates.length, 30);
});

test("draft reserves quota, calls the engine, and keeps the slot on success", async () => {
  const { assistant, repository } = build({ createMessage: okModel });
  const result = await assistant.draft({ request: "23일 17시 선릉 돈그리아 초대장", clientKeyHash: "k", now: NOW });
  assert.equal(result.status, "ready");
  assert.equal(repository.counters.get("assist:hour:k:2026-09-23T03"), 1);
});

test("draft releases quota when the model fails, and enforces the hourly cap", async () => {
  const { assistant, repository } = build({ createMessage: async () => { throw new Error("down"); } });
  await assert.rejects(assistant.draft({ request: "x", clientKeyHash: "k", now: NOW }), (e) => e.code === "ASSISTANT_UNAVAILABLE");
  assert.equal(repository.counters.get("assist:hour:k:2026-09-23T03"), 0);

  const capped = build({ createMessage: okModel });
  await capped.assistant.draft({ request: "x", clientKeyHash: "k", now: NOW });
  await capped.assistant.draft({ request: "x", clientKeyHash: "k", now: NOW });
  await assert.rejects(capped.assistant.draft({ request: "x", clientKeyHash: "k", now: NOW }), (e) => e.code === "ASSISTANT_RATE_LIMIT");
});

test("draft keeps the quota slot when the model answers but the output is unusable", async () => {
  const { assistant, repository } = build({ createMessage: async () => ({ stop_reason: "refusal", content: [] }) });
  await assert.rejects(assistant.draft({ request: "x", clientKeyHash: "k", now: NOW }), (e) => e.code === "ASSISTANT_BAD_OUTPUT");
  assert.equal(repository.counters.get("assist:hour:k:2026-09-23T03"), 1, "a billed call keeps its slot");
});

test("draft validates input before touching quota", async () => {
  const { assistant, repository } = build({ createMessage: okModel });
  await assert.rejects(assistant.draft({ request: "", clientKeyHash: "k", now: NOW }), (e) => e.code === "BAD_REQUEST");
  assert.equal(repository.counters.size, 0);
});

test("draft without an engine or repository reports the right code", async () => {
  const { assistant } = build({ withEngine: false });
  await assert.rejects(assistant.draft({ request: "x", clientKeyHash: "k", now: NOW }), (e) => e.code === "ASSISTANT_UNAVAILABLE");
  const noRepo = createAssistant({ engine: null, quota: createAssistantQuota({ repository: null }), catalog, repository: null, config: DEFAULT_ASSISTANT_CONFIG });
  await assert.rejects(noRepo.publish({ draft: readyDraft, confirmed: true, clientKeyHash: "k", now: NOW, baseUrl: "https://x.test" }), (e) => e.code === "REPOSITORY_UNAVAILABLE");
});

test("publish requires confirmation and a ready draft, then returns an absolute url and a token", async () => {
  const { assistant, repository } = build({ createMessage: okModel });
  await assert.rejects(assistant.publish({ draft: readyDraft, confirmed: false, clientKeyHash: "k", now: NOW, baseUrl: "https://x.test" }), (e) => e.code === "NOT_CONFIRMED");
  await assert.rejects(assistant.publish({ draft: { ...readyDraft, location: null }, confirmed: true, clientKeyHash: "k", now: NOW, baseUrl: "https://x.test" }), (e) => e.code === "BAD_REQUEST");

  const result = await assistant.publish({ draft: readyDraft, confirmed: true, clientKeyHash: "k", now: NOW, baseUrl: "https://x.test" });
  assert.match(result.url, /^https:\/\/x\.test\/i\/[0-9A-Za-z]{22}$/);
  assert.equal(result.id, result.url.slice(-22));
  assert.match(result.managementToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(typeof result.expiresAt, "string");

  const record = repository.records.get(result.id);
  assert.equal(record.language, "ko");
  assert.equal(record.invitation.title, "돈그리아에서 저녁");
  assert.equal(record.tokenHash, sha256(`management-token:${result.managementToken}`));
  assert.equal(record.clientKeyHash, "k");
  assert.deepEqual(record.invitation.items, []);
});

test("revoke needs the matching token", async () => {
  const { assistant } = build({ createMessage: okModel });
  const published = await assistant.publish({ draft: readyDraft, confirmed: true, clientKeyHash: "k", now: NOW, baseUrl: "https://x.test" });
  await assert.rejects(assistant.revoke({ id: published.id, managementToken: "A".repeat(43) }), (e) => e.code === "TOKEN_FORBIDDEN");
  await assert.rejects(assistant.revoke({ id: "short", managementToken: published.managementToken }), (e) => e.code === "NOT_FOUND");
  await assert.rejects(assistant.revoke({ id: published.id, managementToken: "bad token" }), (e) => e.code === "TOKEN_REQUIRED");
  assert.deepEqual(await assistant.revoke({ id: published.id, managementToken: published.managementToken }), { revoked: true });
  await assert.rejects(assistant.revoke({ id: published.id, managementToken: published.managementToken }), (e) => e.code === "NOT_FOUND");
});

test("bootstrap builds an assistant without an engine when no key is configured", async () => {
  const assistant = createAssistantFromConfig({ config: { ...DEFAULT_PUBLISHING_CONFIG, ...DEFAULT_ASSISTANT_CONFIG }, repository: new FakePublicationsRepository() });
  await assert.rejects(assistant.draft({ request: "x", clientKeyHash: "k" }), (e) => e.code === "ASSISTANT_UNAVAILABLE");
  assert.equal(assistant.listOccasions({ language: "ko" }).occasions.length, 12);
  const keyed = createAssistantFromConfig({ config: { ...DEFAULT_PUBLISHING_CONFIG, ...DEFAULT_ASSISTANT_CONFIG, anthropicApiKey: "sk-ant-test" }, repository: new FakePublicationsRepository() });
  assert.equal(keyed.hasEngine, true);
});
