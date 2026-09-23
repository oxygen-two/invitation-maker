// tests/assistant-catalog.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAssistantCatalog } = require("../server/assistant/catalog.cjs");

const catalog = createAssistantCatalog();

test("listOccasions returns every shipped occasion with a name per language", () => {
  const ko = catalog.listOccasions("ko");
  const en = catalog.listOccasions("en");
  assert.equal(ko.length, 12);
  assert.equal(en.length, 12);
  assert.deepEqual(ko.find((o) => o.id === "birthday"), { id: "birthday", name: "생일", group: "celebrate" });
  assert.deepEqual(en.find((o) => o.id === "birthday"), { id: "birthday", name: "Birthday", group: "celebrate" });
  assert.deepEqual(catalog.occasionIds, ko.map((o) => o.id));
});

test("listTemplates summarizes every template with its occasion and family", () => {
  const templates = catalog.listTemplates("en");
  assert.equal(templates.length, 30);
  const botanical = templates.find((t) => t.id === "botanical");
  assert.equal(botanical.occasion, "date");
  assert.equal(botanical.family, "romantic-story");
  assert.equal(botanical.name, "Two of Us, in the Sun");
  assert.equal(catalog.listTemplates("ko").find((t) => t.id === "botanical").name, "햇살 아래, 둘이");
  assert.deepEqual(catalog.templateIds, templates.map((t) => t.id));
});

test("resolveTemplate falls back by occasion, then to the event occasion", () => {
  assert.equal(catalog.resolveTemplate("botanical", "birthday").id, "botanical");
  const byOccasion = catalog.resolveTemplate("no-such-template", "graduation");
  assert.equal(byOccasion.occasionId, "graduation");
  const fallback = catalog.resolveTemplate("nope", "not-an-occasion");
  assert.equal(fallback.occasionId, "event");
  assert.ok(fallback.defaults && typeof fallback.defaults.introEffect === "string");
});

test("resolveTemplate returns a copy the caller may mutate", () => {
  const first = catalog.resolveTemplate("botanical", "date");
  first.defaults.title = "changed";
  assert.notEqual(catalog.resolveTemplate("botanical", "date").defaults.title, "changed");
});

test("resolveTemplate returns null instead of throwing when the data file has no templates at all", () => {
  const empty = createAssistantCatalog({ data: { occasions: [], templates: [] } });
  assert.equal(empty.resolveTemplate("anything", "event"), null);
});
