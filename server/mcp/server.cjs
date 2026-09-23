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
// An unrecognized code (including undefined, from a genuine programming
// error) falls back to ASSISTANT_UNAVAILABLE, not REPOSITORY_UNAVAILABLE:
// the latter would misdirect the operator and the host LLM into believing
// the database is down when the real cause is something else entirely.
const knownCode = (code) => (messageFor(code) ? code : "ASSISTANT_UNAVAILABLE");

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
