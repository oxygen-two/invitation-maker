const test = require("node:test");
const assert = require("node:assert/strict");
const { createAssistantCatalog } = require("../server/assistant/catalog.cjs");
const { createAssistantEngine } = require("../server/assistant/engine.cjs");
const { DEFAULT_ASSISTANT_CONFIG } = require("../server/config/assistant.cjs");

const catalog = createAssistantCatalog();
const NOW = new Date("2026-09-23T03:00:00.000Z"); // 12:00 in Seoul, Wednesday

const modelDraft = (overrides = {}) => ({
  language: "ko",
  occasion: "event",
  templateId: "gallery-notice",
  title: "돈그리아에서 저녁 한 끼",
  subtitle: null,
  dateTime: "2026-10-23T17:00",
  timeZone: "Asia/Seoul",
  host: null,
  location: "선릉 돈그리아",
  message: "같이 저녁 먹어요.",
  missing: [{ field: "host", question: "초대하는 분 이름을 알려 주세요." }],
  ...overrides
});

const fakeModel = (output, { throws } = {}) => {
  const calls = [];
  const fn = async (params) => {
    calls.push(params);
    if (throws) throw throws;
    return { stop_reason: "end_turn", content: [{ type: "text", text: typeof output === "string" ? output : JSON.stringify(output) }] };
  };
  fn.calls = calls;
  return fn;
};

const engineWith = (createMessage) => createAssistantEngine({ createMessage, catalog, config: DEFAULT_ASSISTANT_CONFIG, now: () => NOW });

test("validateInput normalizes and caps the free text", () => {
  const engine = engineWith(fakeModel({}));
  const input = engine.validateInput({ request: "  23일 17시 선릉 돈그리아 초대장 " });
  assert.equal(input.request, "23일 17시 선릉 돈그리아 초대장");
  assert.equal(input.timeZone, "Asia/Seoul");
  assert.equal(input.language, null);
  assert.equal(input.answers, null);
  assert.equal(input.draft, null);
  assert.throws(() => engine.validateInput({ request: "" }), (e) => e.code === "BAD_REQUEST");
  assert.throws(() => engine.validateInput({ request: "x".repeat(2001) }), (e) => e.code === "BAD_REQUEST");
  assert.throws(() => engine.validateInput({ request: "ok", timeZone: "Nowhere/City" }), (e) => e.code === "BAD_REQUEST");
  assert.throws(() => engine.validateInput({ request: "ok", language: "jp" }), (e) => e.code === "BAD_REQUEST");
  assert.throws(() => engine.validateInput({ request: "ok", draft: { language: "ko" } }), (e) => e.code === "BAD_REQUEST");
});

test("draft calls Claude with the documented shape and returns needs_info when a field is missing", async () => {
  const model = fakeModel({ draft: modelDraft(), summary: "10월 23일 17시 선릉 돈그리아, 주최자 미정" });
  const engine = engineWith(model);
  const result = await engine.draft(engine.validateInput({ request: "23일 17시 선릉 돈그리아 초대장" }));

  assert.equal(result.status, "needs_info");
  assert.deepEqual(result.missing, [{ field: "host", question: "초대하는 분 이름을 알려 주세요." }]);
  assert.equal(result.draft.location, "선릉 돈그리아");
  assert.equal(result.summary, "10월 23일 17시 선릉 돈그리아, 주최자 미정");

  const [params] = model.calls;
  assert.equal(params.model, "claude-opus-5");
  assert.equal(params.max_tokens, 2048);
  assert.deepEqual(params.thinking, { type: "adaptive" });
  assert.equal(params.output_config.effort, "medium");
  assert.equal(params.output_config.format.type, "json_schema");
  assert.equal(params.output_config.format.schema.required.join(), "draft,summary");
  assert.match(params.system, /2026-09-23/, "today's date in the request time zone");
  assert.match(params.system, /Wednesday/);
  assert.match(params.system, /gallery-notice/, "the template list is in the prompt");
  assert.equal(params.messages.length, 1);
  assert.equal(params.messages[0].role, "user");
  assert.match(params.messages[0].content, /선릉 돈그리아/);
});

test("draft passes the previous draft and answers back to the model and turns ready", async () => {
  const model = fakeModel({ draft: modelDraft({ host: "재성", missing: [] }), summary: "요약" });
  const engine = engineWith(model);
  const previous = modelDraft();
  const result = await engine.draft(engine.validateInput({ request: "23일 17시 선릉 돈그리아 초대장", draft: previous, answers: "재성" }));
  assert.equal(result.status, "ready");
  assert.deepEqual(result.missing, []);
  assert.equal(result.draft.host, "재성");
  assert.match(model.calls[0].messages[0].content, /"host": null/, "previous draft is serialized in the user turn");
  assert.match(model.calls[0].messages[0].content, /재성/);
});

test("draft is needs_info when the model claims ready but a required field is empty", async () => {
  const engine = engineWith(fakeModel({ draft: modelDraft({ dateTime: null, missing: [] }), summary: "s" }));
  const result = await engine.draft(engine.validateInput({ request: "저녁 초대" }));
  assert.equal(result.status, "needs_info");
  assert.deepEqual(result.missing.map((m) => m.field), ["dateTime"]);
  assert.ok(result.missing[0].question.length > 0, "a default question is supplied");
});

test("draft demotes a past or too-distant dateTime to needs_info", async () => {
  for (const dateTime of ["2026-09-22T17:00", "2028-01-01T10:00"]) {
    const engine = engineWith(fakeModel({ draft: modelDraft({ dateTime, missing: [] }), summary: "s" }));
    const result = await engine.draft(engine.validateInput({ request: "x" }));
    assert.equal(result.status, "needs_info", dateTime);
    assert.equal(result.draft.dateTime, null);
    assert.equal(result.missing[0].field, "dateTime");
  }
});

test("draft keeps today's event when the process zone is behind Seoul", async () => {
  const engine = engineWith(fakeModel({ draft: modelDraft({ dateTime: "2026-09-23T20:00", missing: [] }), summary: "s" }));
  const result = await engine.draft(engine.validateInput({ request: "x" }));
  assert.equal(result.status, "ready");
});

test("draft resolves an unknown templateId to the occasion's first template", async () => {
  const engine = engineWith(fakeModel({ draft: modelDraft({ templateId: "made-up", occasion: "graduation", missing: [] }), summary: "s" }));
  const result = await engine.draft(engine.validateInput({ request: "x" }));
  assert.equal(catalog.resolveTemplate(result.draft.templateId, "graduation").occasionId, "graduation");
  assert.ok(catalog.templateIds.includes(result.draft.templateId));
});

test("draft maps model failures to ASSISTANT_UNAVAILABLE and bad output to ASSISTANT_BAD_OUTPUT", async () => {
  const events = [];
  const failing = createAssistantEngine({
    createMessage: fakeModel(null, { throws: Object.assign(new Error("boom"), { status: 529, request_id: "req_1" }) }),
    catalog, config: DEFAULT_ASSISTANT_CONFIG, now: () => NOW, report: (event) => events.push(event)
  });
  await assert.rejects(failing.draft(failing.validateInput({ request: "x" })), (e) => e.code === "ASSISTANT_UNAVAILABLE");
  assert.deepEqual(events, [{ event: "assistant_model_failed", status: 529, requestId: "req_1" }]);

  const garbage = engineWith(fakeModel("not json"));
  await assert.rejects(garbage.draft(garbage.validateInput({ request: "x" })), (e) => e.code === "ASSISTANT_BAD_OUTPUT");

  const refused = createAssistantEngine({
    createMessage: async () => ({ stop_reason: "refusal", content: [] }),
    catalog, config: DEFAULT_ASSISTANT_CONFIG, now: () => NOW
  });
  await assert.rejects(refused.draft(refused.validateInput({ request: "x" })), (e) => e.code === "ASSISTANT_BAD_OUTPUT");
});
