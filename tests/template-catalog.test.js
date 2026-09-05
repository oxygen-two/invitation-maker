const test = require("node:test");
const assert = require("node:assert/strict");
const TemplateCatalog = require("../assets/template-catalog.js");

const fixture = {
  occasions: [
    { id: "date", name: "데이트" },
    { id: "wedding", name: "결혼" }
  ],
  templates: [
    { id: "botanical", occasionId: "date", familyId: "romantic-story", name: "Botanical Date", note: "낮 산책", defaults: { title: "A Day Together" } },
    { id: "midnight-cinema", occasionId: "date", familyId: "romantic-story", name: "Midnight Cinema", note: "저녁 데이트", defaults: { title: "Tonight, Together" } },
    { id: "wedding", occasionId: "wedding", familyId: "wedding-editorial", name: "Wedding Letter", note: "클래식 결혼", defaults: { title: "Our Wedding Day" } },
    { id: "broken-family", occasionId: "wedding", familyId: "unknown", name: "Broken", defaults: {} },
    { id: "broken-occasion", occasionId: "missing", familyId: "romantic-story", name: "Broken", defaults: {} }
  ]
};

test("normalizes known occasions and drops presets with invalid relationships", () => {
  const catalog = TemplateCatalog.normalizeCatalog(fixture);

  assert.deepEqual(catalog.occasions.map(({ id }) => id), ["date", "wedding"]);
  assert.deepEqual(catalog.templates.map(({ id }) => id), ["botanical", "midnight-cinema", "wedding"]);
});

test("looks up two presets without exposing mutable defaults", () => {
  const catalog = TemplateCatalog.normalizeCatalog(fixture);
  const presets = TemplateCatalog.getPresetsForOccasion(catalog, "date");

  assert.deepEqual(presets.map(({ id }) => id), ["botanical", "midnight-cinema"]);
  presets[0].defaults.title = "mutated";
  assert.equal(TemplateCatalog.getPreset(catalog, "botanical").defaults.title, "A Day Together");
});

test("maps legacy IDs to approved families and unknown values to romantic-story", () => {
  assert.equal(TemplateCatalog.normalizeFamily("", "wedding"), "wedding-editorial");
  assert.equal(TemplateCatalog.normalizeFamily("", "black-tie"), "celebration-poster");
  assert.equal(TemplateCatalog.normalizeFamily("unknown", "unknown"), "romantic-story");
});
