(function exposeTemplateCatalog(root, factory) {
  const templateCatalog = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = templateCatalog;
  }

  root.TemplateCatalog = templateCatalog;
})(typeof globalThis === "object" ? globalThis : this, function createTemplateCatalog() {
  const OCCASION_IDS = Object.freeze([
    "date",
    "birthday",
    "anniversary",
    "event",
    "kindergarten",
    "wedding",
    "gohui",
    "hwangap",
    "first-birthday",
    "baby-shower",
    "graduation",
    "housewarming"
  ]);

  /* An occasion belongs to one group, and the gallery prints the groups in
     this order. The groups are about what the day IS, not where it happens,
     so the same four hold in every locale: a celebration, a milestone, a
     family day, a get-together. An occasion with an unknown or missing group
     falls back to "gather" rather than disappearing from the gallery. */
  const GROUP_IDS = Object.freeze([
    "celebrate",
    "milestone",
    "family",
    "gather"
  ]);
  const FALLBACK_GROUP = "gather";

  const FAMILY_IDS = Object.freeze([
    "romantic-story",
    "celebration-poster",
    "kids-storybook",
    "wedding-editorial",
    "korean-heritage"
  ]);

  const legacyFamilies = Object.freeze({
    royal: "romantic-story",
    wedding: "wedding-editorial",
    "black-tie": "celebration-poster",
    botanical: "romantic-story",
    modern: "celebration-poster"
  });

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const freezeDeep = (value) => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      freezeDeep(nested);
    }
    return value;
  };

  const normalizeFamily = (value, templateId = "") =>
    FAMILY_IDS.includes(value)
      ? value
      : legacyFamilies[templateId] || "romantic-story";

  const normalizeOccasion = (occasion) => {
    if (!occasion || typeof occasion !== "object") return null;
    const id = String(occasion.id || "").trim();
    if (!id || !OCCASION_IDS.includes(id)) return null;
    const group = String(occasion.group || "").trim();
    return {
      ...clone(occasion),
      id,
      name: String(occasion.name || id),
      group: GROUP_IDS.includes(group) ? group : FALLBACK_GROUP
    };
  };

  const normalizePreset = (preset, occasionIds, seenTemplates) => {
    if (!preset || typeof preset !== "object") return null;

    const id = String(preset.id || "").trim();
    const occasionId = String(preset.occasionId || "").trim();
    const familyId = String(preset.familyId || "").trim();
    if (!id || seenTemplates.has(id) || !occasionIds.has(occasionId) || !FAMILY_IDS.includes(familyId)) {
      return null;
    }

    const defaults = preset.defaults && typeof preset.defaults === "object" && !Array.isArray(preset.defaults)
      ? clone(preset.defaults)
      : null;
    if (!defaults) return null;

    seenTemplates.add(id);
    return {
      ...clone(preset),
      id,
      occasionId,
      familyId,
      name: String(preset.name || id),
      note: String(preset.note || ""),
      defaults
    };
  };

  const normalizeCatalog = (input = {}) => {
    const seenOccasions = new Set();
    const occasions = [];
    for (const occasion of Array.isArray(input.occasions) ? input.occasions : []) {
      const normalized = normalizeOccasion(occasion);
      if (!normalized || seenOccasions.has(normalized.id)) continue;
      seenOccasions.add(normalized.id);
      occasions.push(normalized);
    }

    const occasionIds = new Set(occasions.map(({ id }) => id));
    const seenTemplates = new Set();
    const templates = [];
    for (const preset of Array.isArray(input.templates) ? input.templates : []) {
      const normalized = normalizePreset(preset, occasionIds, seenTemplates);
      if (normalized) templates.push(normalized);
    }

    return freezeDeep({
      occasions,
      templates
    });
  };

  const getPreset = (catalog, id) => {
    const source = Array.isArray(catalog?.templates)
      ? catalog.templates.find((preset) => preset?.id === id)
      : null;
    return source ? clone(source) : null;
  };

  const getPresetsForOccasion = (catalog, occasionId) => {
    const presets = Array.isArray(catalog?.templates)
      ? catalog.templates.filter((preset) => preset?.occasionId === occasionId)
      : [];
    return clone(presets);
  };

  const getOccasionForTemplate = (catalog, templateId) => {
    const preset = Array.isArray(catalog?.templates)
      ? catalog.templates.find((entry) => entry?.id === templateId)
      : null;
    if (preset?.occasionId) return preset.occasionId;
    return Array.isArray(catalog?.occasions) && catalog.occasions[0]?.id
      ? catalog.occasions[0].id
      : "date";
  };

  /* The gallery's chip rows: every group that actually has occasions, in
     GROUP_IDS order, each carrying its occasions in catalog order. Groups
     with no occasions are left out so the studio never prints an empty
     label. */
  const getOccasionsByGroup = (catalog) => {
    const occasions = Array.isArray(catalog?.occasions) ? catalog.occasions : [];
    const normalizedGroup = (occasion) => (GROUP_IDS.includes(occasion?.group) ? occasion.group : FALLBACK_GROUP);
    return GROUP_IDS
      .map((group) => ({
        group,
        occasions: clone(occasions.filter((occasion) => normalizedGroup(occasion) === group))
      }))
      .filter(({ occasions: members }) => members.length > 0);
  };

  const api = Object.freeze({
    FAMILY_IDS,
    GROUP_IDS,
    OCCASION_IDS,
    getOccasionForTemplate,
    getOccasionsByGroup,
    getPreset,
    getPresetsForOccasion,
    normalizeCatalog,
    normalizeFamily
  });

  return api;
});
