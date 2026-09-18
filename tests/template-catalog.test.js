const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const TemplateCatalog = require("../assets/invitation/template-catalog.js");

const fixture = {
  occasions: [
    { id: "date", name: "데이트", group: "gather" },
    { id: "wedding", name: "결혼", group: "milestone" }
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

test("production catalog adds six birthday presets without replacing the original eighteen", () => {
  const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../invitation-data.json"), "utf8"));
  const catalog = TemplateCatalog.normalizeCatalog(data);
  const originalIds = [
    "botanical", "midnight-cinema", "modern", "color-pop", "royal", "memory-film",
    "black-tie", "gallery-notice", "sunny-classroom", "little-forest", "wedding",
    "modern-vow", "blue-porcelain", "peony-tribute", "red-silk", "golden-years",
    "first-chapter", "little-star"
  ];
  const newBirthdayIds = [
    "cherry-muse", "silver-afterglow", "peach-table", "midnight-toast",
    "bloom-portrait", "signature-birthday"
  ];

  assert.equal(catalog.occasions.length, 12);
  assert.equal(catalog.templates.length, 30);
  for (const occasion of catalog.occasions) {
    assert.equal(
      TemplateCatalog.getPresetsForOccasion(catalog, occasion.id).length,
      occasion.id === "birthday" ? 8 : 2,
      `${occasion.id} preset count`
    );
  }
  assert.deepEqual(originalIds.filter((id) => !TemplateCatalog.getPreset(catalog, id)), []);
  assert.deepEqual(
    TemplateCatalog.getPresetsForOccasion(catalog, "birthday").map(({ id }) => id),
    ["modern", "color-pop", ...newBirthdayIds]
  );
});

test("every occasion belongs to one known group, and unknown groups fall back to gather", () => {
  const catalog = TemplateCatalog.normalizeCatalog({
    occasions: [
      { id: "date", name: "데이트", group: "gather" },
      { id: "wedding", name: "결혼", group: "not-a-group" },
      { id: "birthday", name: "생일" }
    ],
    templates: []
  });

  assert.deepEqual(TemplateCatalog.GROUP_IDS, ["celebrate", "milestone", "family", "gather"]);
  assert.deepEqual(catalog.occasions.map(({ id, group }) => [id, group]), [
    ["date", "gather"],
    ["wedding", "gather"],
    ["birthday", "gather"]
  ]);
});

test("the production catalog groups its twelve occasions for the gallery", () => {
  const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../invitation-data.json"), "utf8"));
  const catalog = TemplateCatalog.normalizeCatalog(data);
  const groups = TemplateCatalog.getOccasionsByGroup(catalog);

  // Groups come out in GROUP_IDS order, each carrying its occasions in
  // catalog order, so the gallery never has to sort them itself.
  assert.deepEqual(groups.map(({ group, occasions }) => [group, occasions.map(({ id }) => id)]), [
    ["celebrate", ["birthday", "anniversary"]],
    ["milestone", ["wedding", "gohui", "hwangap", "first-birthday", "graduation"]],
    ["family", ["kindergarten", "baby-shower"]],
    ["gather", ["date", "event", "housewarming"]]
  ]);
  assert.equal(groups.reduce((total, { occasions }) => total + occasions.length, 0), catalog.occasions.length);
});

test("the three new occasions each ship two designs on an approved family", () => {
  const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../invitation-data.json"), "utf8"));
  const catalog = TemplateCatalog.normalizeCatalog(data);
  const expected = {
    "baby-shower": [["baby-cloud", "kids-storybook"], ["baby-garden", "kids-storybook"]],
    graduation: [["grad-cap", "celebration-poster"], ["grad-bold", "celebration-poster"]],
    housewarming: [["home-key", "romantic-story"], ["home-warm", "romantic-story"]]
  };

  for (const [occasionId, designs] of Object.entries(expected)) {
    assert.deepEqual(
      TemplateCatalog.getPresetsForOccasion(catalog, occasionId).map(({ id, familyId }) => [id, familyId]),
      designs,
      occasionId
    );
  }
});

test("groups with no occasions are left out instead of printing an empty label", () => {
  const catalog = TemplateCatalog.normalizeCatalog({
    occasions: [{ id: "wedding", name: "결혼", group: "milestone" }],
    templates: []
  });

  assert.deepEqual(TemplateCatalog.getOccasionsByGroup(catalog).map(({ group }) => group), ["milestone"]);
});

test("getOccasionsByGroup falls back an occasion with an unrecognized group to gather instead of dropping it", () => {
  // normalizeCatalog already repairs a bad group, so this feeds getOccasionsByGroup
  // a raw, un-normalized catalog directly to prove the fallback lives in the
  // grouping function itself: an occasion the caller never normalized still
  // shows up in the gallery (under "gather"), rather than vanishing entirely.
  const catalog = {
    occasions: [
      { id: "wedding", name: "결혼", group: "milestone" },
      { id: "date", name: "데이트", group: "not-a-group" }
    ]
  };

  assert.deepEqual(
    TemplateCatalog.getOccasionsByGroup(catalog).map(({ group, occasions }) => [group, occasions.map(({ id }) => id)]),
    [
      ["milestone", ["wedding"]],
      ["gather", ["date"]]
    ]
  );
});
