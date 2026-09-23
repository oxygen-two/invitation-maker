// server/assistant/catalog.cjs
// A read-only view of invitation-data.json for the assistant: what the model
// may pick from, and the preset a chosen template contributes to a draft.
const clone = (value) => JSON.parse(JSON.stringify(value));

const createAssistantCatalog = ({
  data = require("../../invitation-data.json"),
  overlay = require("../../assets/i18n/content-en.json")
} = {}) => {
  const occasions = Array.isArray(data.occasions) ? data.occasions : [];
  const templates = Array.isArray(data.templates) ? data.templates : [];

  const occasionName = (occasion, language) =>
    (language === "en" && overlay?.occasions?.[occasion.id]) || occasion.name;
  const templateCopy = (template, language) => {
    const english = language === "en" ? overlay?.templates?.[template.id] : null;
    return { name: english?.name || template.name, note: english?.note || template.note || "" };
  };

  const listOccasions = (language = "ko") => occasions.map((occasion) => ({
    id: occasion.id,
    name: occasionName(occasion, language),
    group: occasion.group
  }));

  const listTemplates = (language = "ko") => templates.map((template) => ({
    id: template.id,
    occasion: template.occasionId,
    family: template.familyId,
    ...templateCopy(template, language)
  }));

  const resolveTemplate = (templateId, occasion) => {
    const exact = templates.find((template) => template.id === templateId);
    if (exact) return clone(exact);
    const byOccasion = templates.find((template) => template.occasionId === occasion);
    if (byOccasion) return clone(byOccasion);
    return clone(templates.find((template) => template.occasionId === "event") || templates[0]);
  };

  return Object.freeze({
    listOccasions,
    listTemplates,
    resolveTemplate,
    occasionIds: Object.freeze(occasions.map((occasion) => occasion.id)),
    templateIds: Object.freeze(templates.map((template) => template.id))
  });
};

module.exports = { createAssistantCatalog };
