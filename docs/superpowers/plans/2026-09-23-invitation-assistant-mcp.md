# Invitation Assistant (LLM + MCP Server) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a one-line request such as "23일 17시 선릉 돈그리아 초대장" into a published invitation link through a conversational assistant, exposed to external users as a stateless MCP server at `/mcp`.

**Architecture:** A pure `server/assistant/` engine asks Claude Opus 5 for a structured draft (JSON schema output), reports missing fields, and materializes a ready draft into the existing publishing use-case. A thin `server/mcp/` layer registers four tools on `@modelcontextprotocol/server` (stateless Streamable HTTP, JSON responses) and is mounted by both the local server and a Vercel function. Abuse limits reuse the Mongo atomic counters the publishing quota already uses.

**Tech Stack:** Node >=22 CommonJS, `node --test`, `mongodb` 7.6.0, `@anthropic-ai/sdk` ^0.128.0, `@modelcontextprotocol/server` ^2.0.0, Vercel functions.

**Spec:** `docs/superpowers/specs/2026-09-23-invitation-assistant-mcp-design.md`

## Global Constraints

- Node `>=22`, `"type": "commonjs"`; every new server file is `.cjs` and uses `require`.
- Exactly two new runtime dependencies: `@anthropic-ai/sdk` `^0.128.0` and `@modelcontextprotocol/server` `^2.0.0`. No `zod` import anywhere in our code (tool schemas go through `fromJsonSchema`). No `@modelcontextprotocol/node`, no hono.
- Claude call shape (spec §4.2): `model` from config (default `claude-opus-5`), `max_tokens: 2048`, `thinking: { type: "adaptive" }`, `output_config: { effort: "medium", format: { type: "json_schema", schema } }`, timeout 45 s, no streaming.
- The server never stores conversation state; the host passes the previous `draft` back.
- All quota keys use the existing `publishing_counters` collection with atomic `findOneAndUpdate`; assistant keys are `assist:hour:<clientKeyHash>:<hourBucket>` and `assist:day:<dayBucket>`.
- Defaults: `ASSISTANT_RATE_LIMIT_PER_HOUR=20`, `ASSISTANT_TOTAL_DAILY_LIMIT=300`, `ASSISTANT_MODEL=claude-opus-5`, MCP request body cap 65,536 bytes, `request`/`answers` ≤ 2,000 chars, default `timeZone` `Asia/Seoul`.
- Draft string limits: title ≤ 80, subtitle ≤ 120, host ≤ 60, location ≤ 120, message ≤ 600, question ≤ 200, at most 4 `missing` entries.
- Error payload shape everywhere: `{ "error": { "code": "...", "message": "..." } }`; messages are one English sentence.
- Tests must pass under `TZ=UTC` and `TZ=America/Los_Angeles`; date work uses the request `timeZone`, never the process zone.
- `npm run build:public` must leave tracked files unchanged; `server/` code never touches the DOM.
- Site dictionaries (`assets/i18n/dictionary-site-ko.js` / `-en.js`) must keep identical key sets (`tests/site-pages.test.js` enforces it).
- Commit after every task with a plain, present-tense subject line and no trailer.

---

## File Structure

| Path | Responsibility |
|---|---|
| `server/config/assistant.cjs` | Env → assistant config, defaults, assistant error messages |
| `server/assistant/catalog.cjs` | Occasion/template summaries from `invitation-data.json` + `content-en.json`; template fallback |
| `server/assistant/schema.cjs` | Draft JSON Schema (tool input + model output), strict validation, model-output coercion |
| `server/assistant/engine.cjs` | Prompt building, Claude call through injected `createMessage`, output re-validation, ready/needs_info |
| `server/assistant/materialize.cjs` | Draft + template preset → publishable `invitation` record |
| `server/assistant/quota.cjs` | Hour/day reservation on top of the repository's generic counters |
| `server/assistant/claude-client.cjs` | Builds the `createMessage` function from `@anthropic-ai/sdk` |
| `server/assistant/assistant.cjs` | Transport-agnostic facade: `listOccasions`, `draft`, `publish`, `revoke` |
| `server/assistant/bootstrap.cjs` | Wires config + repository into an assistant instance (used by local server and Vercel) |
| `server/mcp/node-adapter.cjs` | Node `req/res` ↔ web `Request/Response` |
| `server/mcp/server.cjs` | `McpServer` factory registering the four tools |
| `server/mcp/handler.cjs` | `POST /mcp` handler: method/size guards, client key, transport |
| `server/storage/mongo-publications.cjs` | Adds public `reserveQuota` / `releaseQuota` |
| `server/http.cjs` | Routes `/mcp`, exports `clientIpFrom`, `getRequestOrigin` |
| `server/index.cjs`, `api/invitations.js`, `api/mcp.js`, `vercel.json` | Mounting |
| `tests/helpers/fake-publications-repository.js` | In-memory repository with quota counters for tests |
| `scripts/smoke-assistant.cjs` | Live smoke run with a real key (not in CI) |
| `README.md`, `guide.html`, `privacy.html`, site dictionaries, `.env.example` | Docs |

---

### Task 1: Dependencies and assistant config

**Files:**
- Modify: `package.json`
- Create: `server/config/assistant.cjs`
- Modify: `.env.example`
- Test: `tests/assistant-config.test.js`

**Interfaces:**
- Produces: `DEFAULT_ASSISTANT_CONFIG`, `ASSISTANT_ERROR_MESSAGES`, `readAssistantConfigFromEnv(env) → { anthropicApiKey, assistantModel, assistantRateLimitPerHour, assistantTotalDailyLimit, assistantTimeoutMs, assistantMaxInputChars, assistantMaxPayloadBytes, publicBaseUrl }`.

- [ ] **Step 1: Install the two dependencies**

```bash
npm install @anthropic-ai/sdk@^0.128.0 @modelcontextprotocol/server@^2.0.0
git diff package.json
```
Expected: `dependencies` now lists `@anthropic-ai/sdk`, `@modelcontextprotocol/server`, `mongodb`. `package-lock.json` updated. `node -e 'require("@modelcontextprotocol/server"); require("@anthropic-ai/sdk")'` prints nothing.

- [ ] **Step 2: Write the failing config test**

```js
// tests/assistant-config.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ASSISTANT_ERROR_MESSAGES,
  DEFAULT_ASSISTANT_CONFIG,
  readAssistantConfigFromEnv
} = require("../server/config/assistant.cjs");

test("assistant config falls back to defaults when env is empty", () => {
  const config = readAssistantConfigFromEnv({});
  assert.equal(config.anthropicApiKey, "");
  assert.equal(config.assistantModel, "claude-opus-5");
  assert.equal(config.assistantRateLimitPerHour, 20);
  assert.equal(config.assistantTotalDailyLimit, 300);
  assert.equal(config.assistantTimeoutMs, 45_000);
  assert.equal(config.assistantMaxInputChars, 2000);
  assert.equal(config.assistantMaxPayloadBytes, 65_536);
  assert.equal(config.publicBaseUrl, "");
  assert.deepEqual(config, { ...DEFAULT_ASSISTANT_CONFIG });
});

test("assistant config reads env and ignores garbage numbers", () => {
  const config = readAssistantConfigFromEnv({
    ANTHROPIC_API_KEY: "sk-test",
    ASSISTANT_MODEL: "claude-opus-5",
    ASSISTANT_RATE_LIMIT_PER_HOUR: "5",
    ASSISTANT_TOTAL_DAILY_LIMIT: "abc",
    PUBLIC_BASE_URL: "https://example.com/"
  });
  assert.equal(config.anthropicApiKey, "sk-test");
  assert.equal(config.assistantRateLimitPerHour, 5);
  assert.equal(config.assistantTotalDailyLimit, 300);
  assert.equal(config.publicBaseUrl, "https://example.com", "trailing slash is trimmed");
});

test("assistant error messages cover every assistant code", () => {
  for (const code of ["ASSISTANT_RATE_LIMIT", "ASSISTANT_DAILY_LIMIT", "ASSISTANT_UNAVAILABLE", "ASSISTANT_BAD_OUTPUT", "NOT_CONFIRMED"]) {
    assert.equal(typeof ASSISTANT_ERROR_MESSAGES[code], "string");
    assert.ok(ASSISTANT_ERROR_MESSAGES[code].endsWith("."));
  }
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test tests/assistant-config.test.js`
Expected: FAIL with `Cannot find module '../server/config/assistant.cjs'`.

- [ ] **Step 4: Write the config module**

```js
// server/config/assistant.cjs
const DEFAULT_ASSISTANT_CONFIG = Object.freeze({
  anthropicApiKey: "",
  assistantModel: "claude-opus-5",
  // Per-IP hourly and service-wide daily caps on Claude calls. Hosted MCP
  // clients (Claude.ai, ChatGPT) arrive from shared egress IPs, so the daily
  // cap is the real cost guard; the hourly one stops a single direct client.
  assistantRateLimitPerHour: 20,
  assistantTotalDailyLimit: 300,
  assistantTimeoutMs: 45_000,
  assistantMaxInputChars: 2000,
  // A draft plus two short texts fits easily; anything bigger is abuse.
  assistantMaxPayloadBytes: 65_536,
  // Absolute origin for published links. Empty means "derive from the request".
  publicBaseUrl: ""
});

const ASSISTANT_ERROR_MESSAGES = Object.freeze({
  ASSISTANT_RATE_LIMIT: "Too many drafting requests were made from this client.",
  ASSISTANT_DAILY_LIMIT: "The service daily drafting quota has been reached.",
  ASSISTANT_UNAVAILABLE: "The drafting assistant is unavailable right now.",
  ASSISTANT_BAD_OUTPUT: "The assistant could not produce a usable draft.",
  NOT_CONFIRMED: "Set confirmed to true only after the user has approved the summary."
});

const integerFromEnv = (env, name, fallback) => {
  const value = Number.parseInt(env[name] || "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const readAssistantConfigFromEnv = (env = process.env) => ({
  anthropicApiKey: env.ANTHROPIC_API_KEY || DEFAULT_ASSISTANT_CONFIG.anthropicApiKey,
  assistantModel: env.ASSISTANT_MODEL || DEFAULT_ASSISTANT_CONFIG.assistantModel,
  assistantRateLimitPerHour: integerFromEnv(env, "ASSISTANT_RATE_LIMIT_PER_HOUR", DEFAULT_ASSISTANT_CONFIG.assistantRateLimitPerHour),
  assistantTotalDailyLimit: integerFromEnv(env, "ASSISTANT_TOTAL_DAILY_LIMIT", DEFAULT_ASSISTANT_CONFIG.assistantTotalDailyLimit),
  assistantTimeoutMs: integerFromEnv(env, "ASSISTANT_TIMEOUT_MS", DEFAULT_ASSISTANT_CONFIG.assistantTimeoutMs),
  assistantMaxInputChars: DEFAULT_ASSISTANT_CONFIG.assistantMaxInputChars,
  assistantMaxPayloadBytes: DEFAULT_ASSISTANT_CONFIG.assistantMaxPayloadBytes,
  publicBaseUrl: String(env.PUBLIC_BASE_URL || DEFAULT_ASSISTANT_CONFIG.publicBaseUrl).replace(/\/+$/, "")
});

module.exports = {
  ASSISTANT_ERROR_MESSAGES,
  DEFAULT_ASSISTANT_CONFIG,
  readAssistantConfigFromEnv
};
```

- [ ] **Step 5: Add the env keys to `.env.example`**

Append after the `PUBLISH_TRUST_PROXY=false` line:

```dotenv
# AI assistant (MCP server at /mcp). Leave ANTHROPIC_API_KEY empty to keep the
# draft_invitation tool disabled; publish/revoke keep working without it.
ANTHROPIC_API_KEY=
ASSISTANT_MODEL=claude-opus-5
# Per-IP hourly and service-wide daily caps on Claude calls (drafts only).
ASSISTANT_RATE_LIMIT_PER_HOUR=20
ASSISTANT_TOTAL_DAILY_LIMIT=300
```

`PUBLIC_BASE_URL=` already exists in the file (admin uses it); add this comment line directly above it: `# Also used by the MCP server to build absolute invitation links.`

- [ ] **Step 6: Run the test and the full suite**

Run: `node --test tests/assistant-config.test.js && npm test`
Expected: new tests PASS; suite still green (753 + 3).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json server/config/assistant.cjs .env.example tests/assistant-config.test.js
git commit -m "Add the assistant config and its two SDK dependencies"
```

---

### Task 2: Assistant catalog

**Files:**
- Create: `server/assistant/catalog.cjs`
- Test: `tests/assistant-catalog.test.js`

**Interfaces:**
- Produces: `createAssistantCatalog({ data?, overlay? })` → `{ listOccasions(language), listTemplates(language), resolveTemplate(templateId, occasion), occasionIds: string[], templateIds: string[] }`.
  - `listOccasions("en")` → `[{ id, name, group }]` with English names from `content-en.json`; `"ko"` → Korean names.
  - `listTemplates(language)` → `[{ id, occasion, family, name, note }]`.
  - `resolveTemplate(id, occasion)` → a deep-cloned preset object from `invitation-data.json` (`{ id, occasionId, familyId, name, note, defaults }`): exact id if it exists, else the first template whose `occasionId === occasion`, else the first template with `occasionId === "event"`.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/assistant-catalog.test.js`
Expected: FAIL with `Cannot find module '../server/assistant/catalog.cjs'`.

- [ ] **Step 3: Write the catalog module**

```js
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
```

- [ ] **Step 4: Run the test**

Run: `node --test tests/assistant-catalog.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/assistant/catalog.cjs tests/assistant-catalog.test.js
git commit -m "Give the assistant a read-only view of the template catalog"
```

---

### Task 3: Draft schema and validation

**Files:**
- Create: `server/assistant/schema.cjs`
- Test: `tests/assistant-schema.test.js`

**Interfaces:**
- Consumes: `createAssistantCatalog` (Task 2) for `occasionIds`/`templateIds`.
- Produces:
  - `DRAFT_LIMITS = { title: 80, subtitle: 120, host: 60, location: 120, message: 600, question: 200, missing: 4 }`
  - `MISSING_FIELDS = ["dateTime", "location", "host", "title"]`
  - `buildDraftSchema(catalog) → JSON Schema` (draft object; used as the MCP tool input schema for `draft` and `publish`).
  - `buildModelOutputSchema(catalog) → JSON Schema` (`{ draft, summary }`, every property required, `additionalProperties: false`, nullable via `type: ["string","null"]`; no `maxLength`/`pattern` so Claude structured outputs accept it).
  - `validateDraft(input, catalog) → draft` (strict: throws `{ code: "BAD_REQUEST", message }`; unknown `templateId` is allowed here and resolved later; unknown `occasion` is rejected).
  - `coerceModelDraft(output, catalog) → { draft, summary }` (lenient: trims strings to limits, drops unknown keys, maps a bad occasion to `"event"`, drops malformed `missing` entries, then runs `validateDraft`).
  - `isReady(draft) → boolean` (title, dateTime, location all present).
  - `DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/`.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/assistant-schema.test.js`
Expected: FAIL with `Cannot find module '../server/assistant/schema.cjs'`.

- [ ] **Step 3: Write the schema module**

```js
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
```

- [ ] **Step 4: Run the test**

Run: `node --test tests/assistant-schema.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/assistant/schema.cjs tests/assistant-schema.test.js
git commit -m "Define the invitation draft schema the assistant and its tools share"
```

---

### Task 4: Drafting engine (Claude call through an injected function)

**Files:**
- Create: `server/assistant/engine.cjs`
- Test: `tests/assistant-engine.test.js`

**Interfaces:**
- Consumes: `buildModelOutputSchema`, `coerceModelDraft`, `validateDraft`, `isReady`, `DEFAULT_TIME_ZONE` (Task 3); `catalog.listOccasions/listTemplates/resolveTemplate/templateIds` (Task 2).
- Produces: `createAssistantEngine({ createMessage, catalog, config, now = () => new Date(), report = () => {} })` with:
  - `validateInput({ request, answers, draft, language, timeZone }) → normalized input` (throws `BAD_REQUEST`).
  - `draft(normalizedInput) → { status: "ready" | "needs_info", draft, missing, summary }`.
  - `createMessage(params) → Promise<{ stop_reason, content: [{ type: "text", text }] }>` is the Anthropic SDK `client.messages.create` or a test fake.
  - Errors thrown by `createMessage` become `{ code: "ASSISTANT_UNAVAILABLE" }`; unparsable/refused output becomes `{ code: "ASSISTANT_BAD_OUTPUT" }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/assistant-engine.test.js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/assistant-engine.test.js`
Expected: FAIL with `Cannot find module '../server/assistant/engine.cjs'`.

- [ ] **Step 3: Write the engine**

```js
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
```

Note on readiness: after `checkDate` nulls a bad `dateTime`, `fillMissing` adds a `dateTime` question, so the demotion test passes. A draft is `ready` only when title, dateTime and location are present **and** no question remains. `host` is optional in the sense that the engine never asks for it on its own (spec §4.2); when the model does ask, the host relays the question and the answer arrives in the next call.

- [ ] **Step 4: Run the tests under both zones**

Run: `TZ=America/Los_Angeles node --test tests/assistant-engine.test.js && TZ=UTC node --test tests/assistant-engine.test.js`
Expected: PASS (8 tests) in both zones.

- [ ] **Step 5: Commit**

```bash
git add server/assistant/engine.cjs tests/assistant-engine.test.js
git commit -m "Draft invitations from a one-line request with Claude structured output"
```

---

### Task 5: Materialize a draft into a publishable invitation

**Files:**
- Create: `server/assistant/materialize.cjs`
- Test: `tests/assistant-materialize.test.js`

**Interfaces:**
- Consumes: `catalog.resolveTemplate` (Task 2), `validateKnownInvitationFields` is not exported from `server/validation.cjs`; instead the test runs the result through `normalizeForPublishing` (exported) which calls it.
- Produces: `materializeInvitation(draft, { catalog }) → { invitation, language }`, `formatDateLabel(dateTime, timeZone, language) → string`, `googleMapsSearchUrl(location) → string`.

- [ ] **Step 1: Write the failing test**

```js
// tests/assistant-materialize.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAssistantCatalog } = require("../server/assistant/catalog.cjs");
const { formatDateLabel, googleMapsSearchUrl, materializeInvitation } = require("../server/assistant/materialize.cjs");
const { normalizeForPublishing } = require("../server/validation.cjs");

const catalog = createAssistantCatalog();
const draft = {
  language: "ko",
  occasion: "event",
  templateId: "gallery-notice",
  title: "돈그리아에서 저녁",
  subtitle: null,
  dateTime: "2026-10-23T17:00",
  timeZone: "Asia/Seoul",
  host: "재성",
  location: "선릉 돈그리아",
  message: "같이 저녁 먹어요.",
  missing: []
};

test("materializeInvitation copies the preset look and the draft's words, nothing else", () => {
  const preset = catalog.resolveTemplate("gallery-notice", "event");
  const { invitation, language } = materializeInvitation(draft, { catalog });
  assert.equal(language, "ko");
  assert.equal(invitation.templateId, "gallery-notice");
  assert.equal(invitation.introEffect, preset.defaults.introEffect);
  assert.equal(invitation.particleEffect, preset.defaults.particleEffect);
  assert.equal(invitation.englishFont, preset.defaults.englishFont);
  assert.equal(invitation.koreanFont, preset.defaults.koreanFont);
  assert.equal(invitation.title, "돈그리아에서 저녁");
  assert.equal(invitation.host, "재성");
  assert.equal(invitation.location, "선릉 돈그리아");
  assert.equal(invitation.message, "같이 저녁 먹어요.");
  assert.equal(invitation.subtitle, "");
  assert.equal(invitation.dateTime, "2026-10-23T17:00");
  assert.equal(invitation.timeZone, "Asia/Seoul");
  assert.deepEqual(invitation.items, [], "no sample courses or photos leak in");
  assert.equal("heroImage" in invitation, false);
  assert.equal(invitation.mapProvider, "google");
  assert.equal(invitation.mapEnabled, false);
  assert.equal(invitation.mapUrl, "https://www.google.com/maps/search/?api=1&query=%EC%84%A0%EB%A6%89%20%EB%8F%88%EA%B7%B8%EB%A6%AC%EC%95%84");
});

test("materializeInvitation output passes the publishing validator", () => {
  const { invitation, language } = materializeInvitation(draft, { catalog });
  const normalized = normalizeForPublishing({ body: { invitation, language } });
  assert.equal(normalized.language, "ko");
  assert.equal(normalized.invitation.title, "돈그리아에서 저녁");
});

test("materializeInvitation falls back to an occasion template for an unknown id", () => {
  const { invitation } = materializeInvitation({ ...draft, templateId: "ghost", occasion: "graduation" }, { catalog });
  assert.equal(catalog.resolveTemplate(invitation.templateId, "graduation").occasionId, "graduation");
});

test("formatDateLabel renders in the draft language and zone regardless of process zone", () => {
  assert.equal(formatDateLabel("2026-10-23T17:00", "Asia/Seoul", "ko"), "2026년 10월 23일 (금) 오후 5:00");
  assert.equal(formatDateLabel("2026-10-23T17:00", "Asia/Seoul", "en"), "Fri, Oct 23, 2026, 5:00 PM");
  assert.equal(formatDateLabel("2026-10-23T17:00", "America/New_York", "en"), "Fri, Oct 23, 2026, 5:00 PM", "wall time is kept, not shifted");
  assert.equal(formatDateLabel(null, "Asia/Seoul", "ko"), "");
});

test("googleMapsSearchUrl encodes the location and is empty without one", () => {
  assert.equal(googleMapsSearchUrl("Main St & 5th"), "https://www.google.com/maps/search/?api=1&query=Main%20St%20%26%205th");
  assert.equal(googleMapsSearchUrl(null), "");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/assistant-materialize.test.js`
Expected: FAIL with `Cannot find module '../server/assistant/materialize.cjs'`.

- [ ] **Step 3: Write the module**

```js
// server/assistant/materialize.cjs
// A ready draft plus its template preset becomes the invitation record the
// publishing API already accepts. Only the preset's look travels (effects,
// fonts, particles); its sample courses, photos and profiles never do.
const LOOK_FIELDS = ["introEffect", "particleEffect", "particleScale", "particleAmount", "englishFont", "koreanFont"];

const googleMapsSearchUrl = (location) => (location
  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
  : "");

// The draft's dateTime is wall time in its zone. Formatting the parts we
// already have (no instant conversion) keeps the label identical whatever
// zone the process runs in.
const formatDateLabel = (dateTime, timeZone, language) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(dateTime || "");
  if (!match) return "";
  const [, year, month, day, hour, minute] = match.map(Number);
  const asUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "ko-KR", {
    timeZone: "UTC",
    year: "numeric", month: language === "en" ? "short" : "long", day: "numeric", weekday: "short",
    hour: "numeric", minute: "2-digit"
  }).format(asUtc);
};

const materializeInvitation = (draft, { catalog }) => {
  const preset = catalog.resolveTemplate(draft.templateId, draft.occasion);
  const invitation = { templateId: preset.id, layoutFamily: preset.familyId };
  for (const field of LOOK_FIELDS) {
    if (preset.defaults?.[field] !== undefined) invitation[field] = preset.defaults[field];
  }
  Object.assign(invitation, {
    title: draft.title,
    subtitle: draft.subtitle || "",
    dateLabel: formatDateLabel(draft.dateTime, draft.timeZone, draft.language),
    dateTime: draft.dateTime || "",
    timeZone: draft.timeZone,
    host: draft.host || "",
    location: draft.location || "",
    message: draft.message || "",
    mapProvider: "google",
    mapEnabled: false,
    mapUrl: googleMapsSearchUrl(draft.location),
    items: []
  });
  return { invitation, language: draft.language };
};

module.exports = { formatDateLabel, googleMapsSearchUrl, materializeInvitation };
```

If the `formatDateLabel` expected strings differ by a character on Node 22's ICU (e.g. a narrow no-break space before `PM`), update the test expectation to what Node 22 prints after checking `node -e` on Node 22 — the assertion's purpose is zone independence, which the third case proves.

- [ ] **Step 4: Run the tests under both zones**

Run: `TZ=America/Los_Angeles node --test tests/assistant-materialize.test.js && TZ=UTC node --test tests/assistant-materialize.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/assistant/materialize.cjs tests/assistant-materialize.test.js
git commit -m "Turn a ready draft into the invitation record the publishing API accepts"
```

---

### Task 6: Generic quota counters and the assistant quota

**Files:**
- Modify: `server/storage/mongo-publications.cjs` (lines 93–120: `reserveCounter`/`releaseCounter`)
- Create: `server/assistant/quota.cjs`
- Create: `tests/helpers/fake-publications-repository.js`
- Test: `tests/assistant-quota.test.js`

**Interfaces:**
- Produces on the Mongo repository: `reserveQuota({ key, limit, now, expiresAt, errorCode }) → Promise<string|null>` (null when `limit <= 0`; throws `Error` with `code = errorCode` when exhausted) and `releaseQuota(key) → Promise<void>`. The existing `publish` keeps its exact behavior by calling these.
- Produces: `createAssistantQuota({ repository, rateLimitPerHour, totalDailyLimit }) → { reserve({ clientKeyHash, now }) → Promise<release> }` where `release()` releases every reserved key.
- Produces the test helper `FakePublicationsRepository` with `publish`, `get`, `remove`, `refreshExpiry`, `reserveQuota`, `releaseQuota`, plus `counters: Map<string, number>` and `records: Map`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/helpers/fake-publications-repository.js
// In-memory stand-in for server/storage/mongo-publications.cjs used by the
// assistant and MCP tests. Mirrors the quota contract: reserveQuota throws the
// caller's errorCode once a key reaches its limit; releaseQuota decrements.
const { randomBytes } = require("node:crypto");

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const publicId = () => Array.from(randomBytes(22), (byte) => BASE62[byte % 62]).join("");

class FakePublicationsRepository {
  constructor() {
    this.records = new Map();
    this.counters = new Map();
    this.publishes = [];
    this.nextError = null;
  }

  async reserveQuota({ key, limit, errorCode }) {
    if (limit <= 0) return null;
    const count = this.counters.get(key) || 0;
    if (count >= limit) throw Object.assign(new Error(errorCode), { code: errorCode });
    this.counters.set(key, count + 1);
    return key;
  }

  async releaseQuota(key) {
    if (!key) return;
    this.counters.set(key, Math.max(0, (this.counters.get(key) || 0) - 1));
  }

  async publish(input) {
    this.publishes.push(input);
    if (this.nextError) throw this.nextError;
    const existing = [...this.records.values()].find((record) =>
      record.idempotencyKeyHash === input.idempotencyKeyHash && record.tokenHash === input.tokenHash);
    if (existing) return { id: existing.id, expiresAt: existing.expiresAt };
    const record = {
      id: input.id || publicId(),
      invitation: input.invitation,
      language: input.language || null,
      tokenHash: input.tokenHash,
      idempotencyKeyHash: input.idempotencyKeyHash,
      contentHash: input.contentHash,
      clientKeyHash: input.clientKeyHash,
      createdAt: input.now || new Date(),
      expiresAt: input.expiresAt || null
    };
    this.records.set(record.id, record);
    return { id: record.id, expiresAt: record.expiresAt };
  }

  async get(id) {
    return this.records.get(id) || null;
  }

  async refreshExpiry() {
    return false;
  }

  async remove({ id, tokenHash }) {
    const record = this.records.get(id);
    if (!record || record.tokenHash !== tokenHash) return false;
    this.records.delete(id);
    return true;
  }
}

module.exports = { FakePublicationsRepository };
```

```js
// tests/assistant-quota.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { MongoClient } = require("mongodb");
const { createAssistantQuota } = require("../server/assistant/quota.cjs");
const { createMongoPublicationsRepository } = require("../server/storage/mongo-publications.cjs");
const { FakePublicationsRepository } = require("./helpers/fake-publications-repository.js");

const NOW = new Date("2026-09-23T03:30:00.000Z");

test("reserve takes one hour slot and one day slot, release gives both back", async () => {
  const repository = new FakePublicationsRepository();
  const quota = createAssistantQuota({ repository, rateLimitPerHour: 2, totalDailyLimit: 5 });
  const release = await quota.reserve({ clientKeyHash: "abc", now: NOW });
  assert.equal(repository.counters.get("assist:hour:abc:2026-09-23T03"), 1);
  assert.equal(repository.counters.get("assist:day:2026-09-23"), 1);
  await release();
  assert.equal(repository.counters.get("assist:hour:abc:2026-09-23T03"), 0);
  assert.equal(repository.counters.get("assist:day:2026-09-23"), 0);
});

test("hourly exhaustion is ASSISTANT_RATE_LIMIT and daily exhaustion is ASSISTANT_DAILY_LIMIT", async () => {
  const repository = new FakePublicationsRepository();
  const quota = createAssistantQuota({ repository, rateLimitPerHour: 1, totalDailyLimit: 2 });
  await quota.reserve({ clientKeyHash: "a", now: NOW });
  await assert.rejects(quota.reserve({ clientKeyHash: "a", now: NOW }), (e) => e.code === "ASSISTANT_RATE_LIMIT");
  await quota.reserve({ clientKeyHash: "b", now: NOW });
  await assert.rejects(quota.reserve({ clientKeyHash: "c", now: NOW }), (e) => e.code === "ASSISTANT_DAILY_LIMIT");
  assert.equal(repository.counters.get("assist:hour:c:2026-09-23T03"), 0, "a failed day reservation releases the hour slot it took");
});

test("a zero limit disables that counter", async () => {
  const repository = new FakePublicationsRepository();
  const quota = createAssistantQuota({ repository, rateLimitPerHour: 0, totalDailyLimit: 1 });
  await quota.reserve({ clientKeyHash: "a", now: NOW });
  await quota.reserve({ clientKeyHash: "a", now: NOW }).catch((e) => assert.equal(e.code, "ASSISTANT_DAILY_LIMIT"));
  assert.equal(repository.counters.has("assist:hour:a:2026-09-23T03"), false);
});

test("Mongo repository exposes reserveQuota/releaseQuota with TTL-bearing counters", {
  skip: !process.env.MONGODB_URI && "Set MONGODB_URI for real Mongo integration"
}, async () => {
  const dbName = `assistant_quota_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const repository = createMongoPublicationsRepository({ uri: process.env.MONGODB_URI, dbName });
  try {
    const expiresAt = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
    await repository.reserveQuota({ key: "assist:hour:x:2026-09-23T03", limit: 1, now: NOW, expiresAt, errorCode: "ASSISTANT_RATE_LIMIT" });
    await assert.rejects(
      repository.reserveQuota({ key: "assist:hour:x:2026-09-23T03", limit: 1, now: NOW, expiresAt, errorCode: "ASSISTANT_RATE_LIMIT" }),
      (e) => e.code === "ASSISTANT_RATE_LIMIT"
    );
    await repository.releaseQuota("assist:hour:x:2026-09-23T03");
    await repository.reserveQuota({ key: "assist:hour:x:2026-09-23T03", limit: 1, now: NOW, expiresAt, errorCode: "ASSISTANT_RATE_LIMIT" });
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const doc = await client.db(dbName).collection("publishing_counters").findOne({ key: "assist:hour:x:2026-09-23T03" });
    await client.close();
    assert.equal(doc.count, 1);
    assert.ok(doc.expiresAt instanceof Date);
  } finally {
    await repository.dropDatabase();
    await repository.close();
  }
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/assistant-quota.test.js`
Expected: FAIL with `Cannot find module '../server/assistant/quota.cjs'`.

- [ ] **Step 3: Generalize the Mongo counters**

In `server/storage/mongo-publications.cjs`, replace `reserveCounter` and `releaseCounter` with:

```js
  // One atomic slot on a named counter. `limit <= 0` disables the counter.
  // Every quota in the service (publishing, assistant drafting) goes through
  // here so the same TTL-indexed collection and the same upsert race handling
  // serve both.
  const reserveQuota = async ({ key, limit, now, expiresAt = null, errorCode }) => {
    if (limit <= 0) return null;
    const countersCollection = await counters();
    const result = await countersCollection.findOneAndUpdate(
      { key, count: { $lt: limit } },
      {
        $setOnInsert: { key, createdAt: now, ...(expiresAt ? { expiresAt } : {}) },
        $set: { updatedAt: now },
        $inc: { count: 1 }
      },
      { upsert: true, returnDocument: "after" }
    ).catch((error) => {
      if (error.code === 11000) return null;
      throw error;
    });
    if (!result) throw errorWithCode(errorCode);
    return key;
  };

  const releaseQuota = async (key) => {
    if (!key) return;
    await (await counters()).updateOne({ key }, { $inc: { count: -1 } });
  };

  const publishingErrorCode = (key) => (key.startsWith("hour:") ? "RATE_LIMIT" : key.startsWith("day:") ? "TOTAL_DAILY_LIMIT" : "LIFETIME_LIMIT");
  const reserveCounter = (key, limit, now) => reserveQuota({ key, limit, now, expiresAt: counterExpiry(key, now), errorCode: publishingErrorCode(key) });
  const releaseCounter = releaseQuota;
```

and add `reserveQuota, releaseQuota` to the returned object (`return { publish, get, refreshExpiry, remove, reserveQuota, releaseQuota, close, dropDatabase }`).

- [ ] **Step 4: Write the assistant quota**

```js
// server/assistant/quota.cjs
// Drafting quota: one slot per client per hour, one per service per day.
// Keys carry the `assist:` prefix so they never collide with the publishing
// counters that share the collection.
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const hourBucket = (date) => date.toISOString().slice(0, 13);
const dayBucket = (date) => date.toISOString().slice(0, 10);

const createAssistantQuota = ({ repository, rateLimitPerHour = 20, totalDailyLimit = 300 }) => {
  const reserve = async ({ clientKeyHash, now = new Date() }) => {
    if (!repository || typeof repository.reserveQuota !== "function") {
      throw Object.assign(new Error("REPOSITORY_UNAVAILABLE"), { code: "REPOSITORY_UNAVAILABLE" });
    }
    const reserved = [];
    const release = async () => {
      await Promise.all(reserved.splice(0).map((key) => repository.releaseQuota(key)));
    };
    try {
      reserved.push(await repository.reserveQuota({
        key: `assist:hour:${clientKeyHash}:${hourBucket(now)}`,
        limit: rateLimitPerHour,
        now,
        expiresAt: new Date(now.getTime() + 2 * HOUR_MS),
        errorCode: "ASSISTANT_RATE_LIMIT"
      }));
      reserved.push(await repository.reserveQuota({
        key: `assist:day:${dayBucket(now)}`,
        limit: totalDailyLimit,
        now,
        expiresAt: new Date(now.getTime() + 2 * DAY_MS),
        errorCode: "ASSISTANT_DAILY_LIMIT"
      }));
    } catch (error) {
      await release();
      throw error;
    }
    return release;
  };

  return Object.freeze({ reserve });
};

module.exports = { createAssistantQuota };
```

- [ ] **Step 5: Run the quota tests and the publishing suite**

Run: `node --test tests/assistant-quota.test.js tests/publishing-server.test.js`
Expected: PASS; the Mongo case is skipped locally without `MONGODB_URI`. If a local Mongo is available, also run `MONGODB_URI=mongodb://127.0.0.1:27017 node --test tests/assistant-quota.test.js tests/publishing-server.test.js` and expect PASS.

- [ ] **Step 6: Commit**

```bash
git add server/storage/mongo-publications.cjs server/assistant/quota.cjs tests/helpers/fake-publications-repository.js tests/assistant-quota.test.js
git commit -m "Reserve drafting quota through the shared publishing counters"
```

---

### Task 7: Claude client factory

**Files:**
- Create: `server/assistant/claude-client.cjs`
- Test: `tests/assistant-claude-client.test.js`

**Interfaces:**
- Produces: `createClaudeMessageClient({ apiKey, timeoutMs }) → ((params) => Promise<Message>) | null` (null when `apiKey` is empty). Uses `@anthropic-ai/sdk`: `new Anthropic({ apiKey, timeout, maxRetries: 2 })` and `client.messages.create(params)`.

- [ ] **Step 1: Write the failing test**

```js
// tests/assistant-claude-client.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createClaudeMessageClient } = require("../server/assistant/claude-client.cjs");

test("no API key means no client", () => {
  assert.equal(createClaudeMessageClient({ apiKey: "" }), null);
  assert.equal(createClaudeMessageClient({}), null);
});

test("with a key it returns a function bound to messages.create", () => {
  const createMessage = createClaudeMessageClient({ apiKey: "sk-ant-test", timeoutMs: 1234 });
  assert.equal(typeof createMessage, "function");
  assert.equal(createMessage.length, 1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/assistant-claude-client.test.js`
Expected: FAIL with `Cannot find module '../server/assistant/claude-client.cjs'`.

- [ ] **Step 3: Write the factory**

```js
// server/assistant/claude-client.cjs
// The only file that knows about the Anthropic SDK. It hands the engine a
// plain function so everything else can be tested with a fake.
const createClaudeMessageClient = ({ apiKey = "", timeoutMs = 45_000 } = {}) => {
  if (!apiKey) return null;
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 2 });
  return (params) => client.messages.create(params);
};

module.exports = { createClaudeMessageClient };
```

- [ ] **Step 4: Run the test**

Run: `node --test tests/assistant-claude-client.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/assistant/claude-client.cjs tests/assistant-claude-client.test.js
git commit -m "Wrap the Anthropic SDK behind a single message function"
```

---

### Task 8: Assistant facade (draft, publish, revoke, listOccasions)

**Files:**
- Create: `server/assistant/assistant.cjs`
- Create: `server/assistant/bootstrap.cjs`
- Test: `tests/assistant-facade.test.js`

**Interfaces:**
- Consumes: engine (Task 4), quota (Task 6), materialize (Task 5), catalog (Task 2), `publishInvitation` from `server/publishing/use-case.cjs`, `sha256`/`isValidPublicId` from `server/validation.cjs`, `createClaudeMessageClient` (Task 7).
- Produces `createAssistant({ engine, quota, catalog, repository, config, report })` with:
  - `listOccasions({ language }) → { occasions, templates }`
  - `draft({ request, answers, draft, language, timeZone, clientKeyHash, now }) → { status, draft, missing, summary }`
  - `publish({ draft, confirmed, clientKeyHash, now, baseUrl }) → { id, url, expiresAt, managementToken }`
  - `revoke({ id, managementToken }) → { revoked: true }`
  - every failure is an `Error` with a `code` from `PUBLISHING_ERROR_MESSAGES` or `ASSISTANT_ERROR_MESSAGES`.
- Produces `createAssistantFromConfig({ config, repository, report }) → assistant` (bootstrap): builds catalog, `createClaudeMessageClient({ apiKey: config.anthropicApiKey, timeoutMs: config.assistantTimeoutMs })`, engine (only when a client exists), quota, facade.
- Token format matches the studio: 32 random bytes base64url; hash `sha256("management-token:" + token)` (same as `tokenHashFromHeader`).

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/assistant-facade.test.js`
Expected: FAIL with `Cannot find module '../server/assistant/assistant.cjs'`.

- [ ] **Step 3: Write the facade and bootstrap**

```js
// server/assistant/assistant.cjs
// Transport-agnostic entry point: the MCP tools call this, and any future
// surface (a web chat, a bot) would call the same four methods.
const { randomBytes, randomUUID } = require("node:crypto");
const { publishInvitation } = require("../publishing/use-case.cjs");
const { isValidPublicId, sha256 } = require("../validation.cjs");
const { materializeInvitation } = require("./materialize.cjs");
const { isReady, validateDraft } = require("./schema.cjs");

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const withCode = (code, message) => Object.assign(new Error(message || code), { code });

const createAssistant = ({ engine = null, quota, catalog, repository = null, config = {}, now = () => new Date() }) => {
  const clock = (value) => (value instanceof Date ? value : now());

  const listOccasions = ({ language = "ko" } = {}) => ({
    occasions: catalog.listOccasions(language),
    templates: catalog.listTemplates(language)
  });

  const draft = async ({ request, answers, draft: previous, language, timeZone, clientKeyHash, now: at }) => {
    if (!engine) throw withCode("ASSISTANT_UNAVAILABLE", "no model configured");
    if (!repository) throw withCode("REPOSITORY_UNAVAILABLE");
    const input = engine.validateInput({ request, answers, draft: previous, language, timeZone });
    const release = await quota.reserve({ clientKeyHash, now: clock(at) });
    try {
      return await engine.draft(input);
    } catch (error) {
      await release();
      throw error;
    }
  };

  const publish = async ({ draft: candidate, confirmed, clientKeyHash, now: at, baseUrl }) => {
    if (confirmed !== true) throw withCode("NOT_CONFIRMED");
    if (!repository) throw withCode("REPOSITORY_UNAVAILABLE");
    const validated = validateDraft(candidate, catalog);
    if (!isReady(validated)) throw withCode("BAD_REQUEST", "draft is missing title, dateTime or location");
    const { invitation, language } = materializeInvitation(validated, { catalog });
    const managementToken = randomBytes(32).toString("base64url");
    const result = await publishInvitation({
      body: { invitation, language },
      clientKeyHash,
      config,
      idempotencyKey: randomUUID(),
      now: clock(at),
      repository,
      tokenHash: sha256(`management-token:${managementToken}`)
    });
    return {
      id: result.id,
      url: `${String(baseUrl || "").replace(/\/+$/, "")}${result.url}`,
      expiresAt: result.expiresAt,
      managementToken
    };
  };

  const revoke = async ({ id, managementToken }) => {
    if (!repository) throw withCode("REPOSITORY_UNAVAILABLE");
    if (typeof managementToken !== "string" || !TOKEN_PATTERN.test(managementToken)) throw withCode("TOKEN_REQUIRED");
    if (!isValidPublicId(id)) throw withCode("NOT_FOUND");
    const tokenHash = sha256(`management-token:${managementToken}`);
    const removed = await repository.remove({ id, tokenHash });
    if (removed) return { revoked: true };
    const record = await repository.get(id);
    if (!record) throw withCode("NOT_FOUND");
    throw withCode("TOKEN_FORBIDDEN");
  };

  return Object.freeze({ listOccasions, draft, publish, revoke, hasEngine: Boolean(engine) });
};

module.exports = { createAssistant };
```

```js
// server/assistant/bootstrap.cjs
// Builds the assistant from config + repository. Both the local server and
// the Vercel function call this, so the wiring lives in exactly one place.
const { createAssistant } = require("./assistant.cjs");
const { createAssistantCatalog } = require("./catalog.cjs");
const { createClaudeMessageClient } = require("./claude-client.cjs");
const { createAssistantEngine } = require("./engine.cjs");
const { createAssistantQuota } = require("./quota.cjs");

const createAssistantFromConfig = ({ config, repository = null, report = () => {} }) => {
  const catalog = createAssistantCatalog();
  const createMessage = createClaudeMessageClient({ apiKey: config.anthropicApiKey, timeoutMs: config.assistantTimeoutMs });
  const engine = createMessage ? createAssistantEngine({ createMessage, catalog, config, report }) : null;
  const quota = createAssistantQuota({
    repository,
    rateLimitPerHour: config.assistantRateLimitPerHour,
    totalDailyLimit: config.assistantTotalDailyLimit
  });
  return createAssistant({ engine, quota, catalog, repository, config });
};

module.exports = { createAssistantFromConfig };
```

- [ ] **Step 4: Run the test**

Run: `node --test tests/assistant-facade.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add server/assistant/assistant.cjs server/assistant/bootstrap.cjs tests/assistant-facade.test.js
git commit -m "Expose the assistant as one facade for drafting, publishing and revoking"
```

---

### Task 9: MCP server, Node adapter, and handler

**Files:**
- Create: `server/mcp/node-adapter.cjs`
- Create: `server/mcp/server.cjs`
- Create: `server/mcp/handler.cjs`
- Create: `server/http/request-info.cjs`
- Modify: `server/http.cjs` (use `request-info.cjs` instead of its local `getRequestOrigin`/`clientIpFrom`; no routing yet — Task 10)
- Test: `tests/mcp-handler.test.js`

**Interfaces:**
- Consumes: assistant facade (Task 8), `buildDraftSchema` (Task 3), `PUBLISHING_ERROR_MESSAGES`, `ASSISTANT_ERROR_MESSAGES`.
- Produces:
  - `toWebRequest(req, { body, baseUrl }) → Request`; `sendWebResponse(res, response) → Promise<void>`.
  - `createMcpServer({ assistant, context }) → McpServer` where `context = { clientKeyHash, baseUrl, now }`; tools `list_occasions`, `draft_invitation`, `publish_invitation`, `revoke_invitation`.
  - `createMcpHandler({ assistant, config }) → async (req, res)`; only `POST` reaches the transport, other methods get `405` with `Allow: POST`; bodies over `config.assistantMaxPayloadBytes` get `413`.
  - Tool results: success → `{ content: [{ type: "text", text: JSON.stringify(result) }] }`; failure → `{ isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code, message } }) }] }`.

- [ ] **Step 1: Move the two request helpers into `server/http/request-info.cjs`**

`server/http.cjs` will later require the MCP handler (Task 10), and the MCP handler needs these helpers, so they get their own module now to avoid a require cycle.

```js
// server/http/request-info.cjs
// Where a request came from, as the publishing and MCP handlers both need it.
const getRequestOrigin = (req) => {
  const host = req.headers.host;
  if (!host) return "";
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = typeof forwardedProto === "string" && forwardedProto.split(",")[0].trim() === "https"
    ? "https"
    : req.socket?.encrypted ? "https" : "http";
  return `${proto}://${host}`;
};

const clientIpFrom = (req, config) => {
  if (config.trustProxy && typeof req.headers["x-forwarded-for"] === "string") {
    return req.headers["x-forwarded-for"].split(",")[0].trim() || "unknown";
  }
  return req.socket?.remoteAddress || "unknown";
};

module.exports = { clientIpFrom, getRequestOrigin };
```

In `server/http.cjs`: delete the local `getRequestOrigin` and `clientIpFrom` definitions (lines 81–100 in the current file), add `const { clientIpFrom, getRequestOrigin } = require("./http/request-info.cjs");` next to the other requires, and leave the rest untouched. Run `node --test tests/publishing-server.test.js` — it must still pass.

- [ ] **Step 2: Write the failing integration test**

```js
// tests/mcp-handler.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { createAssistant } = require("../server/assistant/assistant.cjs");
const { createAssistantCatalog } = require("../server/assistant/catalog.cjs");
const { createAssistantEngine } = require("../server/assistant/engine.cjs");
const { createAssistantQuota } = require("../server/assistant/quota.cjs");
const { DEFAULT_ASSISTANT_CONFIG } = require("../server/config/assistant.cjs");
const { DEFAULT_PUBLISHING_CONFIG } = require("../server/config/publishing.cjs");
const { createMcpHandler } = require("../server/mcp/handler.cjs");
const { FakePublicationsRepository } = require("./helpers/fake-publications-repository.js");

const NOW = new Date("2026-09-23T03:00:00.000Z");
const catalog = createAssistantCatalog();
const readyDraft = {
  language: "ko", occasion: "event", templateId: "gallery-notice", title: "돈그리아에서 저녁", subtitle: null,
  dateTime: "2026-10-23T17:00", timeZone: "Asia/Seoul", host: "재성", location: "선릉 돈그리아", message: "같이 먹어요.", missing: []
};
const needsInfoDraft = { ...readyDraft, host: null, missing: [{ field: "host", question: "누가 초대하나요?" }] };

const modelReturning = (draft) => async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ draft, summary: "요약문" }) }] });

const buildHandler = ({ createMessage = modelReturning(readyDraft), repository = new FakePublicationsRepository(), config = {} } = {}) => {
  const merged = { ...DEFAULT_PUBLISHING_CONFIG, ...DEFAULT_ASSISTANT_CONFIG, trustProxy: false, ...config };
  const engine = createMessage ? createAssistantEngine({ createMessage, catalog, config: merged, now: () => NOW }) : null;
  const quota = createAssistantQuota({ repository, rateLimitPerHour: merged.assistantRateLimitPerHour, totalDailyLimit: merged.assistantTotalDailyLimit });
  const assistant = createAssistant({ engine, quota, catalog, repository, config: merged, now: () => NOW });
  return { handler: createMcpHandler({ assistant, config: merged }), repository };
};

const withServer = async (handler, run) => {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const rpc = async (body, { method = "POST", headers = {} } = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method,
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
  };
  try {
    await run(rpc);
  } finally {
    server.close();
    await once(server, "close");
  }
};

const call = (id, name, args) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
const toolJson = (rpcBody) => JSON.parse(rpcBody.result.content[0].text);

test("initialize and tools/list answer statelessly with JSON", async () => {
  const { handler } = buildHandler();
  await withServer(handler, async (rpc) => {
    const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
    assert.equal(init.status, 200);
    assert.match(init.headers.get("content-type"), /application\/json/);
    assert.equal(init.body.result.serverInfo.name, "invitation-maker");
    assert.equal(init.headers.get("mcp-session-id"), null, "stateless: no session id");

    const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    assert.deepEqual(list.body.result.tools.map((t) => t.name).sort(), ["draft_invitation", "list_occasions", "publish_invitation", "revoke_invitation"]);
    const draftTool = list.body.result.tools.find((t) => t.name === "draft_invitation");
    assert.match(draftTool.description, /needs_info/);
    assert.match(list.body.result.tools.find((t) => t.name === "publish_invitation").description, /confirm/i);
    assert.equal(draftTool.inputSchema.properties.draft.properties.occasion.enum.length, 12);
  });
});

test("the whole conversation: draft → needs_info → draft again → publish → revoke", async () => {
  let turn = 0;
  const createMessage = async () => {
    turn += 1;
    return modelReturning(turn === 1 ? needsInfoDraft : readyDraft)();
  };
  const { handler, repository } = buildHandler({ createMessage });
  await withServer(handler, async (rpc) => {
    const first = await rpc(call(1, "draft_invitation", { request: "23일 17시 선릉 돈그리아 초대장" }));
    assert.equal(first.status, 200);
    const firstResult = toolJson(first.body);
    assert.equal(firstResult.status, "needs_info");
    assert.equal(firstResult.missing[0].field, "host");

    const second = toolJson((await rpc(call(2, "draft_invitation", { request: "23일 17시 선릉 돈그리아 초대장", draft: firstResult.draft, answers: "재성" }))).body);
    assert.equal(second.status, "ready");
    assert.equal(second.summary, "요약문");

    const unconfirmed = (await rpc(call(3, "publish_invitation", { draft: second.draft }))).body;
    assert.equal(unconfirmed.result.isError, true);
    assert.equal(toolJson(unconfirmed).error.code, "NOT_CONFIRMED");

    const published = toolJson((await rpc(call(4, "publish_invitation", { draft: second.draft, confirmed: true }))).body);
    assert.match(published.url, /^http:\/\/127\.0\.0\.1:\d+\/i\/[0-9A-Za-z]{22}$/, "base url derives from the request when PUBLIC_BASE_URL is empty");
    assert.match(published.managementToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(repository.records.size, 1);
    const hourKey = [...repository.counters.keys()].find((key) => key.startsWith("assist:hour:"));
    assert.equal(repository.counters.get(hourKey), 2, "two drafts consumed two slots");

    const revoked = toolJson((await rpc(call(5, "revoke_invitation", { id: published.id, managementToken: published.managementToken }))).body);
    assert.deepEqual(revoked, { revoked: true });
    assert.equal(repository.records.size, 0);
  });
});

test("PUBLIC_BASE_URL wins over the request host", async () => {
  const { handler } = buildHandler({ config: { publicBaseUrl: "https://invites.example" } });
  await withServer(handler, async (rpc) => {
    const published = toolJson((await rpc(call(1, "publish_invitation", { draft: readyDraft, confirmed: true }))).body);
    assert.match(published.url, /^https:\/\/invites\.example\/i\//);
  });
});

test("tool errors carry the shared error shape", async () => {
  const { handler } = buildHandler({ createMessage: null });
  await withServer(handler, async (rpc) => {
    const noEngine = (await rpc(call(1, "draft_invitation", { request: "x" }))).body;
    assert.equal(noEngine.result.isError, true);
    assert.deepEqual(toolJson(noEngine), { error: { code: "ASSISTANT_UNAVAILABLE", message: "The drafting assistant is unavailable right now." } });

    const badArgs = (await rpc(call(2, "draft_invitation", { nope: 1 }))).body;
    assert.equal(badArgs.result.isError, true, "the SDK validates the input schema before the handler");

    const list = toolJson((await rpc(call(3, "list_occasions", { language: "en" }))).body);
    assert.equal(list.occasions[0].id, "date");
  });
});

test("quota exhaustion surfaces as ASSISTANT_RATE_LIMIT", async () => {
  const { handler } = buildHandler({ config: { assistantRateLimitPerHour: 1 } });
  await withServer(handler, async (rpc) => {
    await rpc(call(1, "draft_invitation", { request: "x" }));
    const second = (await rpc(call(2, "draft_invitation", { request: "x" }))).body;
    assert.equal(toolJson(second).error.code, "ASSISTANT_RATE_LIMIT");
  });
});

test("non-POST methods are 405, oversized bodies are 413, bad JSON is a JSON-RPC error", async () => {
  const { handler } = buildHandler();
  await withServer(handler, async (rpc) => {
    const get = await rpc(null, { method: "GET" });
    assert.equal(get.status, 405);
    assert.equal(get.headers.get("allow"), "POST");
    assert.equal(get.body.error.code, "METHOD_NOT_ALLOWED");

    const big = await rpc(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "draft_invitation", arguments: { request: "x".repeat(70_000) } } }));
    assert.equal(big.status, 413);
    assert.equal(big.body.error.code, "BODY_TOO_LARGE");

    const bad = await rpc("{not json");
    assert.equal(bad.status, 400);
    assert.equal(bad.body.jsonrpc, "2.0");
    assert.ok(bad.body.error);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test tests/mcp-handler.test.js`
Expected: FAIL with `Cannot find module '../server/mcp/handler.cjs'`.

- [ ] **Step 4: Write the Node adapter**

```js
// server/mcp/node-adapter.cjs
// The MCP SDK speaks web-standard Request/Response. Node 22 ships both
// globals, so a few lines bridge them without pulling in an HTTP framework.
const { Readable } = require("node:stream");

// Hop-by-hop and framing headers describe the Node connection, not the
// message; the web Request computes its own.
const SKIPPED_HEADERS = new Set(["host", "connection", "content-length", "transfer-encoding", "keep-alive"]);

const toWebRequest = (req, { body, baseUrl }) => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers || {})) {
    if (value === undefined || SKIPPED_HEADERS.has(name.toLowerCase())) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
  }
  return new Request(new URL(req.url || "/", baseUrl), {
    method: req.method,
    headers,
    body: body === undefined ? undefined : body
  });
};

const sendWebResponse = async (res, response) => {
  const headers = {};
  response.headers.forEach((value, name) => { headers[name] = value; });
  res.writeHead(response.status, { "cache-control": "no-store", "x-robots-tag": "noindex", ...headers });
  if (!response.body) {
    res.end();
    return;
  }
  await new Promise((resolve, reject) => {
    Readable.fromWeb(response.body).on("error", reject).on("end", resolve).pipe(res);
  });
};

module.exports = { sendWebResponse, toWebRequest };
```

- [ ] **Step 5: Write the MCP server factory**

```js
// server/mcp/server.cjs
// One McpServer per request (stateless transport), four tools, all thin
// wrappers over the assistant facade. Tool descriptions double as the
// conversation script the host model follows (spec §5).
const { McpServer, fromJsonSchema } = require("@modelcontextprotocol/server");
const { ASSISTANT_ERROR_MESSAGES } = require("../config/assistant.cjs");
const { PUBLISHING_ERROR_MESSAGES } = require("../config/publishing.cjs");
const { buildDraftSchema } = require("../assistant/schema.cjs");

const SERVER_INFO = Object.freeze({ name: "invitation-maker", version: "1.0.0" });
const LANGUAGE_PROPERTY = { type: "string", enum: ["ko", "en"], description: "ko or en. Omit to follow the request text." };

const messageFor = (code) => PUBLISHING_ERROR_MESSAGES[code] || ASSISTANT_ERROR_MESSAGES[code];
const knownCode = (code) => (messageFor(code) ? code : "REPOSITORY_UNAVAILABLE");

const ok = (result) => ({ content: [{ type: "text", text: JSON.stringify(result) }] });
const failed = (error) => {
  const code = knownCode(error?.code);
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code, message: messageFor(code) } }) }] };
};
const guarded = (fn) => async (args) => {
  try {
    return ok(await fn(args));
  } catch (error) {
    return failed(error);
  }
};

const DRAFT_TOOL_DESCRIPTION = [
  "Draft an invitation from the user's one-line request (for example \"23일 17시 선릉 돈그리아 초대장\").",
  "Pass the request text exactly as the user wrote it. The result has status \"ready\" or \"needs_info\".",
  "When status is \"needs_info\": ask the user each question in `missing[].question`, then call this tool again with the same `request`, the returned `draft` in `draft`, and the user's replies in `answers`.",
  "When status is \"ready\": show the user `summary` and ask them to confirm before calling publish_invitation.",
  "Never invent a time, place or host; the tool leaves unknown fields null on purpose."
].join(" ");

const PUBLISH_TOOL_DESCRIPTION = [
  "Publish a ready draft and return the public link.",
  "Call only after the user has explicitly confirmed the summary from draft_invitation, and pass `confirmed: true` to record that.",
  "Give the user the `url`, and tell them to keep `managementToken`: it is the only way to take the link down later (revoke_invitation) and the server stores just a hash of it.",
  "Links expire on their own after the event or after a period without views."
].join(" ");

const createMcpServer = ({ assistant, catalog, context }) => {
  const server = new McpServer(SERVER_INFO);
  const draftSchema = buildDraftSchema(catalog);

  server.registerTool("list_occasions", {
    description: "List the occasions (birthday, wedding, housewarming, …) and the design templates the service ships, with names in the requested language.",
    inputSchema: fromJsonSchema({ type: "object", properties: { language: LANGUAGE_PROPERTY }, additionalProperties: false })
  }, guarded(({ language }) => assistant.listOccasions({ language: language || "ko" })));

  server.registerTool("draft_invitation", {
    description: DRAFT_TOOL_DESCRIPTION,
    inputSchema: fromJsonSchema({
      type: "object",
      properties: {
        request: { type: "string", description: "The user's request, verbatim." },
        answers: { type: "string", description: "The user's replies to the previous `missing` questions, in their own words." },
        draft: { ...draftSchema, description: "The `draft` returned by the previous call, unchanged." },
        language: LANGUAGE_PROPERTY,
        timeZone: { type: "string", description: "IANA time zone of the event, default Asia/Seoul." }
      },
      required: ["request"],
      additionalProperties: false
    })
  }, guarded((args) => assistant.draft({ ...args, clientKeyHash: context.clientKeyHash, now: context.now })));

  server.registerTool("publish_invitation", {
    description: PUBLISH_TOOL_DESCRIPTION,
    inputSchema: fromJsonSchema({
      type: "object",
      properties: {
        draft: { ...draftSchema, description: "A draft whose status was \"ready\"." },
        confirmed: { type: "boolean", description: "true only after the user approved the summary." }
      },
      required: ["draft"],
      additionalProperties: false
    })
  }, guarded(({ draft, confirmed }) => assistant.publish({ draft, confirmed, clientKeyHash: context.clientKeyHash, now: context.now, baseUrl: context.baseUrl })));

  server.registerTool("revoke_invitation", {
    description: "Take a published invitation link down. Needs the invitation id (the last 22 characters of the url) and the managementToken returned by publish_invitation.",
    inputSchema: fromJsonSchema({
      type: "object",
      properties: {
        id: { type: "string" },
        managementToken: { type: "string" }
      },
      required: ["id", "managementToken"],
      additionalProperties: false
    })
  }, guarded(({ id, managementToken }) => assistant.revoke({ id, managementToken })));

  return server;
};

module.exports = { SERVER_INFO, createMcpServer };
```

- [ ] **Step 6: Write the handler**

```js
// server/mcp/handler.cjs
// POST /mcp. Reads the body under a cap, derives the client key from the IP
// exactly as publishing does, then lets the SDK's stateless transport answer
// one JSON-RPC exchange with a JSON body (no SSE stream on serverless).
const { WebStandardStreamableHTTPServerTransport } = require("@modelcontextprotocol/server");
const { PUBLISHING_ERROR_MESSAGES } = require("../config/publishing.cjs");
const { createAssistantCatalog } = require("../assistant/catalog.cjs");
const { clientIpFrom, getRequestOrigin } = require("../http/request-info.cjs");
const { sha256 } = require("../validation.cjs");
const { sendWebResponse, toWebRequest } = require("./node-adapter.cjs");
const { createMcpServer } = require("./server.cjs");

const jsonError = (res, status, code, extraHeaders = {}) => {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-robots-tag": "noindex",
    ...extraHeaders
  });
  res.end(JSON.stringify({ error: { code, message: PUBLISHING_ERROR_MESSAGES[code] } }));
};

const readBody = (req, maxBytes) => new Promise((resolve, reject) => {
  if (req.body !== undefined) {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw, "utf8") > maxBytes) reject(Object.assign(new Error("body too large"), { code: "BODY_TOO_LARGE" }));
    else resolve(raw);
    return;
  }
  const chunks = [];
  let size = 0;
  let failed = false;
  req.on("data", (chunk) => {
    if (failed) return;
    size += chunk.length;
    if (size > maxBytes) {
      failed = true;
      reject(Object.assign(new Error("body too large"), { code: "BODY_TOO_LARGE" }));
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => { if (!failed) resolve(Buffer.concat(chunks).toString("utf8")); });
  req.on("error", reject);
});

const createMcpHandler = ({ assistant, config = {} }) => {
  const catalog = createAssistantCatalog();
  const maxBytes = config.assistantMaxPayloadBytes || 65_536;
  const nowFrom = () => (typeof config.clock === "function" ? config.clock() : new Date());

  return async (req, res) => {
    if (req.method !== "POST") return jsonError(res, 405, "METHOD_NOT_ALLOWED", { allow: "POST" });
    let body;
    try {
      body = await readBody(req, maxBytes);
    } catch (error) {
      return jsonError(res, error.code === "BODY_TOO_LARGE" ? 413 : 400, error.code === "BODY_TOO_LARGE" ? "BODY_TOO_LARGE" : "BAD_REQUEST");
    }
    const baseUrl = config.publicBaseUrl || getRequestOrigin(req) || "http://localhost";
    const context = {
      clientKeyHash: sha256(`client:${clientIpFrom(req, config)}`),
      baseUrl,
      now: nowFrom()
    };
    const server = createMcpServer({ assistant, catalog, context });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(toWebRequest(req, { body, baseUrl }));
      await sendWebResponse(res, response);
    } finally {
      await transport.close().catch(() => {});
    }
  };
};

module.exports = { createMcpHandler };
```

- [ ] **Step 7: Run the test**

Run: `node --test tests/mcp-handler.test.js`
Expected: PASS (6 tests). If the bad-JSON case returns a different status than 400, read what the transport actually sends (`console.log(bad)`) and, if it is a JSON-RPC parse error with another 4xx status, change the assertion to that status — the SDK owns protocol errors; do not intercept them.

- [ ] **Step 8: Commit**

```bash
git add server/mcp server/http.cjs server/http/request-info.cjs tests/mcp-handler.test.js
git commit -m "Serve the assistant as a stateless MCP server"
```

---

### Task 10: Mount `/mcp` locally and on Vercel

**Files:**
- Modify: `server/http.cjs` (`createHandler` signature and routing)
- Modify: `server/index.cjs`
- Modify: `api/invitations.js`
- Create: `api/mcp.js`
- Modify: `vercel.json`
- Test: `tests/mcp-routing.test.js`

**Interfaces:**
- `createHandler({ repository, config, assistant })`: when `assistant` is provided, `POST /mcp` and `POST /api/mcp.js` go to `createMcpHandler({ assistant, config: mergedConfig })`; without an `assistant`, `/mcp` answers `404 NOT_FOUND` like any unknown API path (the feature is simply not mounted).
- `api/mcp.js` re-exports the handler from `api/invitations.js` (same pattern as `api/invitations/[id].js`).

- [ ] **Step 1: Write the failing routing test**

```js
// tests/mcp-routing.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const { createHandler } = require("../server/http.cjs");
const { createAssistantFromConfig } = require("../server/assistant/bootstrap.cjs");
const { DEFAULT_ASSISTANT_CONFIG } = require("../server/config/assistant.cjs");
const { DEFAULT_PUBLISHING_CONFIG } = require("../server/config/publishing.cjs");
const { FakePublicationsRepository } = require("./helpers/fake-publications-repository.js");

const post = async (handler, url, body) => {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${url}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  } finally {
    server.close();
    await once(server, "close");
  }
};

const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } };

test("createHandler routes /mcp and /api/mcp.js to the MCP handler when an assistant is given", async () => {
  const repository = new FakePublicationsRepository();
  const config = { ...DEFAULT_PUBLISHING_CONFIG, ...DEFAULT_ASSISTANT_CONFIG, staticRoot: path.resolve(__dirname, "..") };
  const assistant = createAssistantFromConfig({ config, repository });
  const handler = createHandler({ repository, config, assistant });
  for (const url of ["/mcp", "/api/mcp.js"]) {
    const { status, body } = await post(handler, url, initialize);
    assert.equal(status, 200, url);
    assert.equal(body.result.serverInfo.name, "invitation-maker", url);
  }
});

test("without an assistant, /mcp is not mounted", async () => {
  const handler = createHandler({ repository: new FakePublicationsRepository(), config: { staticRoot: path.resolve(__dirname, "..") } });
  const { status, body } = await post(handler, "/mcp", initialize);
  assert.equal(status, 404);
  assert.equal(body.error.code, "NOT_FOUND");
});

test("Vercel routes /mcp to api/mcp.js with a 60 second budget, and api/mcp.js re-exports the invitations handler", () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
  assert.deepEqual(vercel.routes.find((route) => route.src === "/mcp"), { src: "/mcp", dest: "/api/mcp.js" });
  assert.equal(vercel.functions["api/**/*.js"].maxDuration, 60);
  const source = fs.readFileSync(path.join(__dirname, "..", "api", "mcp.js"), "utf8");
  assert.match(source, /require\("\.\/invitations\.js"\)/);
  const invitations = fs.readFileSync(path.join(__dirname, "..", "api", "invitations.js"), "utf8");
  assert.match(invitations, /createAssistantFromConfig/);
  assert.match(invitations, /readAssistantConfigFromEnv/);
  const local = fs.readFileSync(path.join(__dirname, "..", "server", "index.cjs"), "utf8");
  assert.match(local, /createAssistantFromConfig/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/mcp-routing.test.js`
Expected: FAIL (first test gets 404; third test cannot find `api/mcp.js`).

- [ ] **Step 3: Route in `server/http.cjs`**

Add the import near the top:

```js
const { createMcpHandler } = require("./mcp/handler.cjs");
```

Change `createHandler` to accept `assistant` and route before the `/api/invitations` checks:

```js
const createHandler = ({ repository, config = {}, assistant = null } = {}) => {
  const report = createReporter(config.logSink);
  const mergedConfig = {
    ...DEFAULT_PUBLISHING_CONFIG,
    ...DEFAULT_HTTP_CONFIG,
    ...config,
    reportServerEvent: report
  };
  const mcpHandler = assistant ? createMcpHandler({ assistant, config: mergedConfig }) : null;

  return observeHttp(async (req, res) => {
    const parsed = new URL(req.url || "/", "http://localhost");
    if (mcpHandler && (parsed.pathname === "/mcp" || parsed.pathname === "/api/mcp.js")) {
      return mcpHandler(req, res);
    }
    // ...existing routing unchanged...
```

No require cycle arises: `server/mcp/handler.cjs` imports `server/http/request-info.cjs` (Task 9), not `server/http.cjs`.

- [ ] **Step 4: Wire the local server and the Vercel function**

`server/index.cjs`:

```js
const { readAssistantConfigFromEnv } = require("./config/assistant.cjs");
const { createAssistantFromConfig } = require("./assistant/bootstrap.cjs");
// ...
const config = {
  ...readDatabaseConfigFromEnv(),
  ...readHttpConfigFromEnv(),
  ...readPublishingConfigFromEnv(),
  ...readAssistantConfigFromEnv(),
  staticRoot: path.resolve(__dirname, "..")
};
// after `repository` is built:
const assistant = createAssistantFromConfig({ config, repository });
const server = http.createServer(createHandler({ repository, config, assistant }));
```

`api/invitations.js`: same two requires (paths `../server/config/assistant.cjs`, `../server/assistant/bootstrap.cjs`), spread `...readAssistantConfigFromEnv()` into `config`, build `const assistant = createAssistantFromConfig({ config, repository });` and pass it: `cached = createHandler({ repository, config, assistant });`.

`api/mcp.js`:

```js
const handler = require("./invitations.js");

module.exports = (req, res) => handler(req, res);
```

`vercel.json`: add `{ "src": "/mcp", "dest": "/api/mcp.js" }` directly after the `/api/invitations/...` route, and change the functions block to:

```json
  "functions": {
    "api/**/*.js": {
      "maxDuration": 60,
      "excludeFiles": "{docs/**,tests/**,public/**,.env,.env.*,output/**,.git/**}"
    }
  }
```

- [ ] **Step 5: Run the routing test, the MCP test, and the whole suite**

Run: `node --test tests/mcp-routing.test.js tests/mcp-handler.test.js && npm test && npm run build:public && git diff --exit-code`
Expected: all PASS; build leaves tracked files unchanged.

- [ ] **Step 6: Smoke the local server by hand**

```bash
PORT=4199 node server/index.cjs &
sleep 1
curl -s -X POST http://127.0.0.1:4199/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
kill %1
```
Expected: a JSON body listing the four tools (no `MONGODB_URI` needed for `tools/list`).

- [ ] **Step 7: Commit**

```bash
git add server/http.cjs server/index.cjs api/invitations.js api/mcp.js vercel.json tests/mcp-routing.test.js
git commit -m "Mount the MCP server at /mcp locally and on Vercel"
```

---

### Task 11: Live smoke script

**Files:**
- Create: `scripts/smoke-assistant.cjs`
- Modify: `package.json` (script `smoke:assistant`)

**Interfaces:**
- Consumes: `createAssistantFromConfig` (Task 8), config readers.
- Produces: `npm run smoke:assistant -- "23일 17시 선릉 돈그리아 초대장"` prints the draft result as JSON; exits 1 without `ANTHROPIC_API_KEY`. Never publishes.

- [ ] **Step 1: Write the script**

```js
// scripts/smoke-assistant.cjs
// Manual check against the real model. Not part of CI: it spends money.
//   ANTHROPIC_API_KEY=... node scripts/smoke-assistant.cjs "23일 17시 선릉 돈그리아 초대장"
const { readAssistantConfigFromEnv } = require("../server/config/assistant.cjs");
const { readPublishingConfigFromEnv } = require("../server/config/publishing.cjs");
const { createAssistantFromConfig } = require("../server/assistant/bootstrap.cjs");
const { FakePublicationsRepository } = require("../tests/helpers/fake-publications-repository.js");

const request = process.argv.slice(2).join(" ").trim();
const config = { ...readPublishingConfigFromEnv(), ...readAssistantConfigFromEnv() };
if (!config.anthropicApiKey) {
  console.error("ANTHROPIC_API_KEY is required.");
  process.exit(1);
}
if (!request) {
  console.error("Usage: node scripts/smoke-assistant.cjs \"<one-line request>\"");
  process.exit(1);
}

// The in-memory repository only counts quota here; nothing is published.
const assistant = createAssistantFromConfig({ config, repository: new FakePublicationsRepository() });

assistant.draft({ request, clientKeyHash: "smoke", timeZone: process.env.ASSISTANT_SMOKE_TIME_ZONE || "Asia/Seoul" })
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(`draft failed: ${error.code || error.message}`);
    process.exit(1);
  });
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, after `"monitor:publish-cycle"`, add:

```json
    "smoke:assistant": "node --env-file-if-exists=.env scripts/smoke-assistant.cjs",
```

- [ ] **Step 3: Verify the guard and, if a key is at hand, one live run**

Run: `ANTHROPIC_API_KEY= node scripts/smoke-assistant.cjs "test"; echo "exit $?"`
Expected: `ANTHROPIC_API_KEY is required.` and `exit 1`.

With a real key in `.env`: `npm run smoke:assistant -- "23일 17시 선릉 돈그리아 초대장"`
Expected: JSON with `status`, a `draft` whose `dateTime` is the next 23rd at `17:00`, `location` containing `돈그리아`, and either `ready` or a `missing` host question. Paste the output into the PR description.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-assistant.cjs package.json
git commit -m "Add a manual smoke run for the drafting assistant"
```

---

### Task 12: User-facing docs (README, guide, privacy)

**Files:**
- Modify: `README.md` (new section after "Public publishing")
- Modify: `guide.html` (new section `#assistant` between `#finish` and `#data`, plus a TOC entry)
- Modify: `assets/i18n/dictionary-site-ko.js`, `assets/i18n/dictionary-site-en.js` (`site.guide.toc.assistant`, `site.guide.assistant.*`, `site.privacy.server.seven`)
- Modify: `privacy.html` (new list item in the `#server` section)
- Test: `tests/site-pages.test.js` (one added assertion)

**Interfaces:** none beyond dictionary keys, which must exist in both languages.

- [ ] **Step 1: Add the failing assertion**

Append to `tests/site-pages.test.js`:

```js
test("the guide and privacy pages describe the MCP assistant", () => {
  const guide = read("guide.html");
  assert.match(guide, /id="assistant"/);
  assert.match(guide, /data-i18n="site.guide.assistant.title"/);
  assert.match(guide, /data-i18n="site.guide.toc.assistant"/);
  assert.match(guide, /\/mcp/);
  const privacy = read("privacy.html");
  assert.match(privacy, /data-i18n="site.privacy.server.seven"/);
  const ko = require("../assets/i18n/dictionary-site-ko.js");
  const en = require("../assets/i18n/dictionary-site-en.js");
  assert.match(ko.site.privacy.server.seven, /Anthropic/);
  assert.match(en.site.privacy.server.seven, /Anthropic/);
  assert.match(ko.site.guide.assistant.url, /\/mcp$/);
});
```

(`read` is the existing helper at the top of that file.)

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/site-pages.test.js`
Expected: the new test FAILS on `id="assistant"`; the key-parity test still passes.

- [ ] **Step 3: Add dictionary keys (both files, same keys)**

In `dictionary-site-ko.js` inside `guide`: extend `toc` with `assistant: "AI 어시스턴트로 만들기"` and add a sibling block after `finish`:

```js
        assistant: {
          eyebrow: "AI ASSISTANT",
          title: "AI 어시스턴트로 만들기",
          lead: "Claude, ChatGPT, Cursor처럼 MCP를 지원하는 앱에 이 주소를 커넥터로 등록하면, 대화만으로 초대장 링크를 만들 수 있어요.",
          url: "https://invitation-maker-one.vercel.app/mcp",
          one: "\"23일 17시 선릉 돈그리아 초대장\"처럼 한 줄로 말하면 돼요. 빠진 정보는 어시스턴트가 되물어요.",
          two: "요약을 확인해 주면 그때 링크가 만들어져요. 확인 전에는 아무것도 발행되지 않아요.",
          three: "함께 받은 관리 토큰을 보관하세요. 링크를 내릴 때 필요하고, 서버에는 해시만 남아요.",
          four: "만료 규칙은 스튜디오에서 만든 링크와 같아요. 사진은 아직 넣을 수 없어요.",
          note: "입력한 문장은 초안을 만들기 위해 Anthropic API로 전송돼요. 자세한 내용은 개인정보처리방침을 보세요."
        },
```

`privacy.server`: add `seven: "AI 어시스턴트(MCP)로 만들 때 입력한 문장. 초안을 만들기 위해 Anthropic API로 전송되며, 이 서비스의 서버에는 저장되지 않아요."`.

In `dictionary-site-en.js`: `toc.assistant: "Make one with an AI assistant"` and

```js
        assistant: {
          eyebrow: "AI ASSISTANT",
          title: "Make one with an AI assistant",
          lead: "Add this address as a connector in any MCP-capable app — Claude, ChatGPT, Cursor — and make an invitation link by talking.",
          url: "https://invitation-maker-one.vercel.app/mcp",
          one: "One line is enough, like \"dinner at Dongria near Seolleung on the 23rd at 5 pm\". The assistant asks for anything missing.",
          two: "The link is created only after you confirm the summary. Nothing is published before that.",
          three: "Keep the management token you get with the link. It is the only way to take the link down, and the server keeps just a hash of it.",
          four: "Links expire by the same rules as links made in the studio. Photos are not supported yet.",
          note: "What you type is sent to the Anthropic API to draft the invitation. See the privacy policy for details."
        },
```

`privacy.server.seven: "What you type when making an invitation through the AI assistant (MCP). It is sent to the Anthropic API to draft the invitation and is not stored on this service's servers."`

- [ ] **Step 4: Add the guide section and TOC entry**

In `guide.html`, add `<li><a href="#assistant" data-i18n="site.guide.toc.assistant">AI 어시스턴트로 만들기</a></li>` after the `#finish` TOC item, and insert this section between `</section>` of `#finish` and `<section id="data"`:

```html
    <section id="assistant" aria-labelledby="assistant-title">
      <p class="eyebrow" data-i18n="site.guide.assistant.eyebrow">AI ASSISTANT</p>
      <h2 id="assistant-title" data-i18n="site.guide.assistant.title">AI 어시스턴트로 만들기</h2>
      <p class="lead" data-i18n="site.guide.assistant.lead">Claude, ChatGPT, Cursor처럼 MCP를 지원하는 앱에 이 주소를 커넥터로 등록하면, 대화만으로 초대장 링크를 만들 수 있어요.</p>
      <p><code data-i18n="site.guide.assistant.url">https://invitation-maker-one.vercel.app/mcp</code></p>
      <ul class="data-list">
        <li data-i18n="site.guide.assistant.one">"23일 17시 선릉 돈그리아 초대장"처럼 한 줄로 말하면 돼요. 빠진 정보는 어시스턴트가 되물어요.</li>
        <li data-i18n="site.guide.assistant.two">요약을 확인해 주면 그때 링크가 만들어져요. 확인 전에는 아무것도 발행되지 않아요.</li>
        <li data-i18n="site.guide.assistant.three">함께 받은 관리 토큰을 보관하세요. 링크를 내릴 때 필요하고, 서버에는 해시만 남아요.</li>
        <li data-i18n="site.guide.assistant.four">만료 규칙은 스튜디오에서 만든 링크와 같아요. 사진은 아직 넣을 수 없어요.</li>
      </ul>
      <p class="legal-note" data-i18n="site.guide.assistant.note">입력한 문장은 초안을 만들기 위해 Anthropic API로 전송돼요. 자세한 내용은 개인정보처리방침을 보세요.</p>
    </section>
```

If `guide.html` has no `.legal-note` style, use `class="lead"` on that last paragraph instead (check `assets/site/site.css` with `grep -n "legal-note" assets/site/*.css`).

- [ ] **Step 5: Add the privacy list item**

In `privacy.html` `#server` section, after the `site.privacy.server.six` `<li>`:

```html
        <li data-i18n="site.privacy.server.seven">AI 어시스턴트(MCP)로 만들 때 입력한 문장. 초안을 만들기 위해 Anthropic API로 전송되며, 이 서비스의 서버에는 저장되지 않아요.</li>
```

- [ ] **Step 6: Add the README section**

After the "Public publishing" section, add:

````markdown
## AI assistant (MCP server)

`POST /mcp` is a stateless [Model Context Protocol](https://modelcontextprotocol.io) server (Streamable HTTP, JSON responses). Add `https://<your-domain>/mcp` as a custom connector in Claude.ai, Claude Code (`claude mcp add --transport http invitation-maker https://<your-domain>/mcp`), ChatGPT, or Cursor, then ask for an invitation in one line, e.g. "23일 17시 선릉 돈그리아 초대장".

| Tool | What it does |
| --- | --- |
| `list_occasions` | Occasions and design templates, named in `ko` or `en` |
| `draft_invitation` | Asks Claude Opus 5 for a structured draft; returns `ready` or `needs_info` with the questions to ask |
| `publish_invitation` | Publishes a ready draft (`confirmed: true` required) and returns the link plus a management token |
| `revoke_invitation` | Takes a link down with that token |

The server keeps no conversation state: the host passes the previous `draft` back with the user's `answers`. Publishing goes through the same use-case, validation, expiry and quotas as the studio. Drafting has its own quota (`ASSISTANT_RATE_LIMIT_PER_HOUR` per client IP, `ASSISTANT_TOTAL_DAILY_LIMIT` service-wide) stored in the same Mongo counters. Hosted clients such as Claude.ai reach the server from shared IPs, so the daily cap is the real cost guard.

```dotenv
ANTHROPIC_API_KEY=sk-ant-...
ASSISTANT_MODEL=claude-opus-5
ASSISTANT_RATE_LIMIT_PER_HOUR=20
ASSISTANT_TOTAL_DAILY_LIMIT=300
PUBLIC_BASE_URL=https://<your-domain>
```

Without `ANTHROPIC_API_KEY` the `draft_invitation` tool answers `ASSISTANT_UNAVAILABLE`; the other tools keep working. Without `MONGODB_URI` every tool answers `REPOSITORY_UNAVAILABLE`, exactly like the publishing API. `npm run smoke:assistant -- "<request>"` runs one real draft against the model (costs money, never publishes). Design: `docs/superpowers/specs/2026-09-23-invitation-assistant-mcp-design.md`.
````

- [ ] **Step 7: Run the site tests and the whole suite**

Run: `node --test tests/site-pages.test.js tests/i18n.test.js && npm test && npm run build:public && git diff --exit-code`
Expected: PASS; dictionary parity holds; build changes nothing tracked.

- [ ] **Step 8: Commit**

```bash
git add README.md guide.html privacy.html assets/i18n/dictionary-site-ko.js assets/i18n/dictionary-site-en.js tests/site-pages.test.js
git commit -m "Document the MCP assistant for users and operators"
```

---

### Task 13: Final verification and PR

- [ ] **Step 1: Full suite in both zones**

Run: `TZ=UTC npm test && TZ=America/Los_Angeles npm test`
Expected: PASS, 0 failures. Count should be 753 + the new tests (≈ 45).

- [ ] **Step 2: Generators and build**

Run: `node scripts/build-error-pages.cjs --check && node scripts/build-template-art.js --check && npm run build:public && git diff --exit-code`
Expected: all clean.

- [ ] **Step 3: Dependency audit**

Run: `node -e 'const p=require("./package.json"); console.log(Object.keys(p.dependencies))'` and `grep -rn "from \"zod\"\|require(\"zod\")" server api scripts`
Expected: `[ '@anthropic-ai/sdk', '@modelcontextprotocol/server', 'mongodb' ]` and no zod imports.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin HEAD
gh pr create --title "Invitation assistant: Claude drafting engine and MCP server" --body-file - <<'EOF'
Implements docs/superpowers/specs/2026-09-23-invitation-assistant-mcp-design.md.

- server/assistant: catalog, draft schema, Opus 5 drafting engine (structured output), materialize, quota, facade
- server/mcp: stateless Streamable HTTP server with list_occasions / draft_invitation / publish_invitation / revoke_invitation
- POST /mcp mounted locally and on Vercel (api/mcp.js, maxDuration 60)
- Drafting quota on the shared Mongo counters (ASSISTANT_RATE_LIMIT_PER_HOUR, ASSISTANT_TOTAL_DAILY_LIMIT)
- Guide, privacy, README updated; smoke script for a live draft

New runtime dependencies: @anthropic-ai/sdk, @modelcontextprotocol/server.
Vercel needs ANTHROPIC_API_KEY and PUBLIC_BASE_URL set before the connector works.
EOF
gh pr checks --watch
```
Expected: CI green on both timezone legs and the Mongo job (which now also runs the assistant quota Mongo test).
