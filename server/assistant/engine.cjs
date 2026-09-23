// server/assistant/engine.cjs
// Turns a one-line request (plus the previous draft and the user's answers)
// into a validated draft by asking Claude for structured output. The Claude
// call is an injected function so tests never touch the network and the
// engine never learns about API keys.
const { PUBLISHED_LANGUAGES } = require("../validation.cjs");
const { DEFAULT_PUBLISHING_CONFIG } = require("../config/publishing.cjs");
const {
  DEFAULT_TIME_ZONE,
  MISSING_FIELDS,
  buildModelOutputSchema,
  coerceModelDraft,
  isReady,
  validateDraft
} = require("./schema.cjs");

const TIME_ZONES = new Set(Intl.supportedValuesOf("timeZone"));
const DAY_MS = 24 * 60 * 60 * 1000;

const withCode = (code, message) => Object.assign(new Error(message || code), { code });
const badRequest = (message) => withCode("BAD_REQUEST", message);

const DEFAULT_QUESTIONS = Object.freeze({
  ko: { dateTime: "언제 모이나요? 날짜와 시간을 알려 주세요.", location: "어디에서 모이나요?", host: "초대하는 분 이름을 알려 주세요.", title: "초대장 제목을 무엇으로 할까요?" },
  en: { dateTime: "When is it? Please give the date and time.", location: "Where will it be?", host: "Who is sending the invitation?", title: "What should the invitation be titled?" }
});

// Calendar date (YYYY-MM-DD) and weekday of an instant in a zone, without a
// date library: Intl does the zone math, we only read the parts back.
const calendarDateIn = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "long"
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value;
  return { date: `${pick("year")}-${pick("month")}-${pick("day")}`, weekday: pick("weekday") };
};

const dayNumber = (isoDate) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
};

const renderCatalog = (catalog, language) => {
  const occasions = catalog.listOccasions(language).map((o) => `- ${o.id}: ${o.name} (${o.group})`).join("\n");
  const templates = catalog.listTemplates(language).map((t) => `- ${t.id} [${t.occasion}, ${t.family}]: ${t.name} — ${t.note}`).join("\n");
  return `Occasions:\n${occasions}\n\nTemplates:\n${templates}`;
};

const buildSystemPrompt = ({ today, catalog, timeZone, language, maxEventLeadDays }) => [
  "You draft short event invitations for the Invitation Studio service.",
  `Today is ${today.date} (${today.weekday}) in the ${timeZone} time zone.`,
  "Rules:",
  "- Never invent a time, place, or host the user did not state. Leave the field null and add it to `missing` with a friendly question.",
  "- A bare day such as \"23일\" means the next occurrence of that day of the month on or after today; a bare weekday means the next such weekday. Keep dateTime as wall time in the time zone above, formatted YYYY-MM-DDTHH:mm.",
  `- The event must be today or later and within ${maxEventLeadDays} days.`,
  language ? `- Write every text field in language "${language}".` : "- Write every text field in the language of the user's request (ko or en) and set `language` accordingly.",
  "- Choose `occasion` and `templateId` only from the catalog below, matching the kind of event and its mood.",
  "- title is short and warm; message is one or two friendly sentences; subtitle is optional.",
  "- `summary` is one short paragraph restating date, time, place, host and title for the user to confirm, in the same language.",
  "- Questions in `missing` are addressed to the user, one sentence each, at most four.",
  "",
  renderCatalog(catalog, language || "ko")
].join("\n");

const buildUserMessage = ({ request, draft, answers }) => {
  const sections = [`Request:\n${request}`];
  if (draft) sections.push(`Previous draft (JSON):\n${JSON.stringify(draft, null, 2)}`);
  if (answers) sections.push(`The user's answers to the previous questions:\n${answers}`);
  return sections.join("\n\n");
};

const textOf = (response) => (Array.isArray(response?.content) ? response.content : [])
  .filter((block) => block?.type === "text")
  .map((block) => block.text)
  .join("");

const createAssistantEngine = ({
  createMessage,
  catalog,
  config = {},
  now = () => new Date(),
  report = () => {}
}) => {
  if (typeof createMessage !== "function") throw new TypeError("createMessage function is required");
  const maxChars = config.assistantMaxInputChars || 2000;
  const maxEventLeadDays = config.maxEventLeadDays || DEFAULT_PUBLISHING_CONFIG.maxEventLeadDays;
  const outputSchema = buildModelOutputSchema(catalog);

  const text = (value, name, { required = false } = {}) => {
    if (value === undefined || value === null || value === "") {
      if (required) throw badRequest(`${name} is required`);
      return null;
    }
    if (typeof value !== "string") throw badRequest(`${name} must be a string`);
    const trimmed = value.trim();
    if (!trimmed && required) throw badRequest(`${name} is required`);
    if (trimmed.length > maxChars) throw badRequest(`${name} must be at most ${maxChars} characters`);
    return trimmed || null;
  };

  const validateInput = (input = {}) => {
    const request = text(input.request, "request", { required: true });
    const answers = text(input.answers, "answers");
    const language = input.language === undefined || input.language === null ? null : input.language;
    if (language !== null && !PUBLISHED_LANGUAGES.includes(language)) throw badRequest(`language must be one of ${PUBLISHED_LANGUAGES.join(", ")}`);
    const timeZone = input.timeZone === undefined || input.timeZone === null ? DEFAULT_TIME_ZONE : input.timeZone;
    if (typeof timeZone !== "string" || !TIME_ZONES.has(timeZone)) throw badRequest("timeZone must be an IANA time zone");
    const draft = input.draft === undefined || input.draft === null ? null : validateDraft(input.draft, catalog);
    return { request, answers, language, timeZone, draft };
  };

  const checkDate = (draft, today) => {
    if (!draft.dateTime) return draft;
    const eventDay = dayNumber(draft.dateTime.slice(0, 10));
    const todayDay = dayNumber(today.date);
    if (eventDay < todayDay || eventDay - todayDay > maxEventLeadDays) return { ...draft, dateTime: null };
    return draft;
  };

  // The model's own questions survive only while their field is still empty;
  // the engine adds a default question for every required field that is
  // empty and not already asked about. `host` is optional: the engine never
  // adds a host question, but it honours one the model chose to ask.
  const fillMissing = (draft) => {
    const questions = DEFAULT_QUESTIONS[draft.language] || DEFAULT_QUESTIONS.ko;
    const missing = draft.missing.filter((entry) => !draft[entry.field]);
    const asked = new Set(missing.map((entry) => entry.field));
    for (const field of MISSING_FIELDS) {
      if (field === "host" || draft[field] || asked.has(field)) continue;
      missing.push({ field, question: questions[field] });
    }
    return { ...draft, missing: missing.slice(0, 4) };
  };

  const draft = async (input) => {
    const today = calendarDateIn(now(), input.timeZone);
    let response;
    try {
      response = await createMessage({
        model: config.assistantModel || "claude-opus-5",
        max_tokens: 2048,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium", format: { type: "json_schema", schema: outputSchema } },
        system: buildSystemPrompt({ today, catalog, timeZone: input.timeZone, language: input.language, maxEventLeadDays }),
        messages: [{ role: "user", content: buildUserMessage(input) }]
      });
    } catch (error) {
      try { report({ event: "assistant_model_failed", status: error?.status ?? null, requestId: error?.request_id ?? null }); } catch {}
      throw withCode("ASSISTANT_UNAVAILABLE", "model call failed");
    }
    if (response?.stop_reason === "refusal") throw withCode("ASSISTANT_BAD_OUTPUT", "model refused");
    let parsed;
    try {
      parsed = JSON.parse(textOf(response));
    } catch {
      throw withCode("ASSISTANT_BAD_OUTPUT", "model output is not JSON");
    }
    const coerced = coerceModelDraft(parsed, catalog);
    let result = coerced.draft;
    if (input.language) result = { ...result, language: input.language };
    result = { ...result, timeZone: input.timeZone, templateId: catalog.resolveTemplate(result.templateId, result.occasion).id };
    result = fillMissing(checkDate(result, today));
    const ready = isReady(result) && result.missing.length === 0;
    return {
      status: ready ? "ready" : "needs_info",
      draft: result,
      missing: result.missing,
      summary: coerced.summary
    };
  };

  return Object.freeze({ validateInput, draft });
};

module.exports = { createAssistantEngine, buildSystemPrompt, calendarDateIn };
