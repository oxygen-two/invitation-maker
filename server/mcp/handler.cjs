// POST /mcp. Reads the body under a cap, derives the client key from the IP
// exactly as publishing does, then lets the SDK's stateless transport answer
// one JSON-RPC exchange with a JSON body (no SSE stream on serverless).
const { WebStandardStreamableHTTPServerTransport } = require("@modelcontextprotocol/server");
const { PUBLISHING_ERROR_MESSAGES } = require("../config/publishing.cjs");
const { ASSISTANT_ERROR_MESSAGES } = require("../config/assistant.cjs");
const { createAssistantCatalog } = require("../assistant/catalog.cjs");
const { clientIpFrom, getRequestOrigin } = require("../http/request-info.cjs");
const { readBody } = require("../http/read-body.cjs");
const { sha256 } = require("../validation.cjs");
const { sendWebResponse, toWebRequest } = require("./node-adapter.cjs");
const { createMcpServer } = require("./server.cjs");

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const messageFor = (code) => PUBLISHING_ERROR_MESSAGES[code] || ASSISTANT_ERROR_MESSAGES[code];

const jsonError = (res, status, code, extraHeaders = {}) => {
  // A failure this late (e.g. the transport threw mid-stream) may already
  // have started writing a response; never attempt to write headers twice.
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-robots-tag": "noindex",
    ...extraHeaders
  });
  res.end(JSON.stringify({ error: { code, message: messageFor(code) } }));
};

// The Host header is attacker-controlled, so it never becomes the base of a
// published link on its own. Only an explicitly configured base (env), the
// deployed origin (also env), or a loopback request origin (local dev) are
// trusted; anything else resolves to "" and publish_invitation falls back to
// a relative /i/<id> url.
const resolvePublicBaseUrl = (req, config) => {
  if (config.publicBaseUrl) return config.publicBaseUrl;
  if (config.allowedOrigin) return config.allowedOrigin;
  const origin = getRequestOrigin(req);
  if (!origin) return "";
  try {
    const { hostname } = new URL(origin);
    return LOCAL_HOSTNAMES.has(hostname) ? origin : "";
  } catch {
    return "";
  }
};

const isInvalidUrlError = (error) =>
  error?.code === "ERR_INVALID_URL" || (error instanceof TypeError && /invalid url/i.test(error.message || ""));

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
    const baseUrl = resolvePublicBaseUrl(req, config);
    const context = {
      clientKeyHash: sha256(`client:${clientIpFrom(req, config)}`),
      baseUrl,
      now: nowFrom()
    };
    const server = createMcpServer({ assistant, catalog, context });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(toWebRequest(req, { body, baseUrl: baseUrl || "http://localhost" }));
      await sendWebResponse(res, response);
    } catch (error) {
      // Never let a malformed request (or any other transport failure) crash
      // the process: answer a plain, message-free error instead.
      try { config.reportServerEvent?.({ event: "mcp_transport_failed", name: error?.name || "Error" }); } catch {}
      jsonError(res, isInvalidUrlError(error) ? 400 : 503, isInvalidUrlError(error) ? "BAD_REQUEST" : "ASSISTANT_UNAVAILABLE");
    } finally {
      await transport.close().catch(() => {});
    }
  };
};

module.exports = { createMcpHandler, resolvePublicBaseUrl };
