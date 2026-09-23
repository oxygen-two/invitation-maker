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
