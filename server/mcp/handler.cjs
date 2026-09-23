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
