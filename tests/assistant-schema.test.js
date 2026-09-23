// tests/assistant-schema.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAssistantCatalog } = require("../server/assistant/catalog.cjs");
const {
  DRAFT_LIMITS,
  MISSING_FIELDS,
  buildDraftSchema,
  buildModelOutputSchema,
  coerceModelDraft,
  isReady,
  validateDraft
} = require("../server/assistant/schema.cjs");

const catalog = createAssistantCatalog();
const ready = {
  language: "ko",
  occasion: "event",
  templateId: "gallery-notice",
  title: "돈그리아에서 저녁",
  subtitle: null,
  dateTime: "2026-10-23T17:00",
  timeZone: "Asia/Seoul",
  host: "재성",
  location: "선릉 돈그리아",
  message: "함께 저녁 먹어요.",
  missing: []
};

test("validateDraft accepts a complete draft and fills defaults", () => {
  const draft = validateDraft({ ...ready, timeZone: undefined, missing: undefined }, catalog);
  assert.equal(draft.timeZone, "Asia/Seoul");
  assert.deepEqual(draft.missing, []);
  assert.equal(isReady(draft), true);
});

test("validateDraft rejects bad shapes with BAD_REQUEST", () => {
  const cases = [
    [{ ...ready, language: "fr" }, /language/],
    [{ ...ready, occasion: "party" }, /occasion/],
    [{ ...ready, title: "x".repeat(DRAFT_LIMITS.title + 1) }, /title/],
    [{ ...ready, dateTime: "2026-10-23 17:00" }, /dateTime/],
    [{ ...ready, timeZone: "Mars/Olympus" }, /timeZone/],
    [{ ...ready, missing: [{ field: "email", question: "?" }] }, /missing/],
    [{ ...ready, missing: Array.from({ length: 5 }, () => ({ field: "host", question: "?" })) }, /missing/],
    ["not an object", /draft/]
  ];
  for (const [input, pattern] of cases) {
    assert.throws(() => validateDraft(input, catalog), (error) => error.code === "BAD_REQUEST" && pattern.test(error.message), String(pattern));
  }
});

test("isReady needs title, dateTime and location but not host", () => {
  assert.equal(isReady({ ...ready, host: null }), true);
  assert.equal(isReady({ ...ready, location: null }), false);
  assert.equal(isReady({ ...ready, dateTime: null }), false);
  assert.equal(isReady({ ...ready, title: "" }), false);
});

test("coerceModelDraft trims, drops junk, and keeps the summary", () => {
  const { draft, summary } = coerceModelDraft({
    draft: {
      ...ready,
      occasion: "banquet",
      title: "t".repeat(200),
      message: "m".repeat(1000),
      extra: "ignored",
      missing: [{ field: "host", question: "q".repeat(500) }, { field: "phone", question: "?" }, "junk"]
    },
    summary: "요약"
  }, catalog);
  assert.equal(draft.occasion, "event");
  assert.equal(draft.title.length, DRAFT_LIMITS.title);
  assert.equal(draft.message.length, DRAFT_LIMITS.message);
  assert.equal("extra" in draft, false);
  assert.deepEqual(draft.missing.map((m) => m.field), ["host"]);
  assert.equal(draft.missing[0].question.length, DRAFT_LIMITS.question);
  assert.equal(summary, "요약");
});

test("coerceModelDraft rejects output that is not a draft object", () => {
  assert.throws(() => coerceModelDraft({ summary: "x" }, catalog), (error) => error.code === "ASSISTANT_BAD_OUTPUT");
});

test("validateDraft treats whitespace-only optional fields as null and title as required", () => {
  const draft = validateDraft({ ...ready, host: "   ", subtitle: "  \t", dateTime: "\n", location: "  ", message: "   " }, catalog);
  assert.equal(draft.host, null);
  assert.equal(draft.subtitle, null);
  assert.equal(draft.dateTime, null);
  assert.equal(draft.location, null);
  assert.equal(draft.message, null);
  assert.throws(() => validateDraft({ ...ready, title: "   " }, catalog), (error) => error.code === "BAD_REQUEST" && /title/.test(error.message));
});

test("schemas are plain JSON Schema with enums from the catalog", () => {
  const draftSchema = buildDraftSchema(catalog);
  assert.equal(draftSchema.type, "object");
  assert.deepEqual(draftSchema.properties.occasion.enum, [...catalog.occasionIds]);
  assert.deepEqual(draftSchema.properties.missing.items.properties.field.enum, MISSING_FIELDS);
  const output = buildModelOutputSchema(catalog);
  assert.deepEqual(output.required, ["draft", "summary"]);
  assert.equal(output.additionalProperties, false);
  assert.deepEqual(output.properties.draft.required.sort(), Object.keys(output.properties.draft.properties).sort(), "structured outputs need every property required");
  assert.equal(JSON.stringify(output).includes("maxLength"), false);
  assert.equal(JSON.stringify(output).includes("pattern"), false);
});
