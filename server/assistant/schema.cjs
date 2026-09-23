// server/assistant/schema.cjs
// One draft shape shared by the model's structured output and the MCP tool
// inputs. The model schema stays within what Claude structured outputs
// accept (types, enums, required, additionalProperties); the length limits
// are enforced here in code instead.
const { PUBLISHED_LANGUAGES } = require("../validation.cjs");

const DRAFT_LIMITS = Object.freeze({
  title: 80,
  subtitle: 120,
  host: 60,
  location: 120,
  message: 600,
  question: 200,
  missing: 4
});
const MISSING_FIELDS = Object.freeze(["dateTime", "location", "host", "title"]);
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DEFAULT_TIME_ZONE = "Asia/Seoul";
const TIME_ZONES = new Set(Intl.supportedValuesOf("timeZone"));

const badRequest = (message) => Object.assign(new Error(message), { code: "BAD_REQUEST" });
const badOutput = (message) => Object.assign(new Error(message), { code: "ASSISTANT_BAD_OUTPUT" });
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const nullableString = (description) => ({ type: ["string", "null"], description });

const draftProperties = (catalog) => ({
  language: { type: "string", enum: [...PUBLISHED_LANGUAGES], description: "Language the invitation is written in." },
  occasion: { type: "string", enum: [...catalog.occasionIds], description: "Occasion id from list_occasions." },
  templateId: { type: "string", description: "Template id from list_occasions; an unknown id falls back to the occasion's first template." },
  title: { type: "string", description: `Invitation title, at most ${DRAFT_LIMITS.title} characters.` },
  subtitle: nullableString(`Optional one-line subtitle, at most ${DRAFT_LIMITS.subtitle} characters.`),
  dateTime: nullableString("Event start as YYYY-MM-DDTHH:mm wall time in timeZone, or null when unknown."),
  timeZone: { type: "string", description: `IANA time zone, default ${DEFAULT_TIME_ZONE}.` },
  host: nullableString(`Who is inviting, at most ${DRAFT_LIMITS.host} characters, or null.`),
  location: nullableString(`Venue name or address, at most ${DRAFT_LIMITS.location} characters, or null.`),
  message: nullableString(`Short warm message, at most ${DRAFT_LIMITS.message} characters, or null.`),
  missing: {
    type: "array",
    description: "Fields the user still has to supply, each with the question to ask them.",
    items: {
      type: "object",
      properties: {
        field: { type: "string", enum: [...MISSING_FIELDS] },
        question: { type: "string" }
      },
      required: ["field", "question"],
      additionalProperties: false
    }
  }
});

const buildDraftSchema = (catalog) => ({
  type: "object",
  properties: draftProperties(catalog),
  required: ["language", "occasion", "templateId", "title"],
  additionalProperties: false
});

const buildModelOutputSchema = (catalog) => {
  const properties = draftProperties(catalog);
  return {
    type: "object",
    properties: {
      draft: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
      summary: { type: "string", description: "One short paragraph, in the draft language, that the host shows the user before publishing." }
    },
    required: ["draft", "summary"],
    additionalProperties: false
  };
};

const optionalText = (value, name, limit) => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw badRequest(`${name} must be a string`);
  if (value.length > limit) throw badRequest(`${name} must be at most ${limit} characters`);
  return value.trim();
};

const validateDraft = (input, catalog) => {
  if (!isPlainObject(input)) throw badRequest("draft must be an object");
  if (!PUBLISHED_LANGUAGES.includes(input.language)) throw badRequest(`language must be one of ${PUBLISHED_LANGUAGES.join(", ")}`);
  if (!catalog.occasionIds.includes(input.occasion)) throw badRequest("occasion is not a known occasion id");
  if (typeof input.templateId !== "string" || !input.templateId.trim()) throw badRequest("templateId must be a non-empty string");
  const title = optionalText(input.title, "title", DRAFT_LIMITS.title);
  if (!title) throw badRequest("title is required");
  const dateTime = optionalText(input.dateTime, "dateTime", 16);
  if (dateTime && !DATE_TIME_PATTERN.test(dateTime)) throw badRequest("dateTime must look like YYYY-MM-DDTHH:mm");
  const timeZone = input.timeZone === undefined || input.timeZone === null ? DEFAULT_TIME_ZONE : input.timeZone;
  if (typeof timeZone !== "string" || !TIME_ZONES.has(timeZone)) throw badRequest("timeZone must be an IANA time zone");
  const missingInput = input.missing === undefined ? [] : input.missing;
  if (!Array.isArray(missingInput) || missingInput.length > DRAFT_LIMITS.missing) throw badRequest(`missing must be an array of at most ${DRAFT_LIMITS.missing} entries`);
  const missing = missingInput.map((entry) => {
    if (!isPlainObject(entry) || !MISSING_FIELDS.includes(entry.field)) throw badRequest("missing[].field must be one of " + MISSING_FIELDS.join(", "));
    const question = optionalText(entry.question, "missing[].question", DRAFT_LIMITS.question);
    if (!question) throw badRequest("missing[].question is required");
    return { field: entry.field, question };
  });
  return {
    language: input.language,
    occasion: input.occasion,
    templateId: input.templateId.trim(),
    title,
    subtitle: optionalText(input.subtitle, "subtitle", DRAFT_LIMITS.subtitle),
    dateTime,
    timeZone,
    host: optionalText(input.host, "host", DRAFT_LIMITS.host),
    location: optionalText(input.location, "location", DRAFT_LIMITS.location),
    message: optionalText(input.message, "message", DRAFT_LIMITS.message),
    missing
  };
};

const isReady = (draft) => Boolean(draft?.title && draft?.dateTime && draft?.location);

const clip = (value, limit) => (typeof value === "string" ? value.slice(0, limit) : value ?? null);

const coerceModelDraft = (output, catalog) => {
  if (!isPlainObject(output) || !isPlainObject(output.draft)) throw badOutput("model output has no draft object");
  const raw = output.draft;
  const missing = (Array.isArray(raw.missing) ? raw.missing : [])
    .filter((entry) => isPlainObject(entry) && MISSING_FIELDS.includes(entry.field) && typeof entry.question === "string" && entry.question.trim())
    .slice(0, DRAFT_LIMITS.missing)
    .map((entry) => ({ field: entry.field, question: clip(entry.question, DRAFT_LIMITS.question) }));
  const candidate = {
    language: PUBLISHED_LANGUAGES.includes(raw.language) ? raw.language : PUBLISHED_LANGUAGES[0],
    occasion: catalog.occasionIds.includes(raw.occasion) ? raw.occasion : "event",
    templateId: typeof raw.templateId === "string" && raw.templateId.trim() ? raw.templateId : "",
    title: clip(raw.title, DRAFT_LIMITS.title) || "",
    subtitle: clip(raw.subtitle, DRAFT_LIMITS.subtitle),
    dateTime: typeof raw.dateTime === "string" && DATE_TIME_PATTERN.test(raw.dateTime) ? raw.dateTime : null,
    timeZone: typeof raw.timeZone === "string" && TIME_ZONES.has(raw.timeZone) ? raw.timeZone : DEFAULT_TIME_ZONE,
    host: clip(raw.host, DRAFT_LIMITS.host),
    location: clip(raw.location, DRAFT_LIMITS.location),
    message: clip(raw.message, DRAFT_LIMITS.message),
    missing
  };
  if (!candidate.templateId) candidate.templateId = catalog.resolveTemplate("", candidate.occasion).id;
  if (!candidate.title) throw badOutput("model output has no title");
  try {
    return { draft: validateDraft(candidate, catalog), summary: typeof output.summary === "string" ? output.summary.slice(0, 1000) : "" };
  } catch (error) {
    throw badOutput(error.message);
  }
};

module.exports = {
  DATE_TIME_PATTERN,
  DEFAULT_TIME_ZONE,
  DRAFT_LIMITS,
  MISSING_FIELDS,
  buildDraftSchema,
  buildModelOutputSchema,
  coerceModelDraft,
  isReady,
  validateDraft
};
