const { URL } = require("node:url");
const { DEFAULT_HTTP_CONFIG } = require("./config/http.cjs");
const { DEFAULT_PUBLISHING_CONFIG, PUBLISHING_ERROR_MESSAGES } = require("./config/publishing.cjs");
const { serveErrorPage, serveStatic, staticFileFor } = require("./http/static.cjs");
const { mapRepositoryError, publishInvitation, refreshPublicationExpiry } = require("./publishing/use-case.cjs");
const {
  isValidPublicId,
  sha256,
  tokenHashFromHeader,
  validateIdempotencyKey
} = require("./validation.cjs");

const json = (res, status, body, extraHeaders = {}) => {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-robots-tag": "noindex",
    "referrer-policy": "no-referrer",
    ...extraHeaders
  });
  res.end(JSON.stringify(body));
};

const empty = (res, status, extraHeaders = {}) => {
  res.writeHead(status, {
    "cache-control": "no-store",
    "x-robots-tag": "noindex",
    "referrer-policy": "no-referrer",
    ...extraHeaders
  });
  res.end();
};

const errorBody = (code) => ({
  error: {
    code,
    message: PUBLISHING_ERROR_MESSAGES[code] || PUBLISHING_ERROR_MESSAGES.BAD_REQUEST
  }
});

const sendError = (res, status, code) => json(res, status, errorBody(code));

const readBody = (req, maxPayloadBytes) => new Promise((resolve, reject) => {
  if (req.body !== undefined) {
    const raw = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body);
    if (Buffer.byteLength(raw, "utf8") > maxPayloadBytes) {
      const error = new Error("body too large");
      error.code = "BODY_TOO_LARGE";
      reject(error);
      return;
    }
    resolve(raw);
    return;
  }
  let size = 0;
  let tooLarge = false;
  const chunks = [];
  req.on("data", (chunk) => {
    if (tooLarge) return;
    size += chunk.length;
    if (size > maxPayloadBytes) {
      tooLarge = true;
      const error = new Error("body too large");
      error.code = "BODY_TOO_LARGE";
      reject(error);
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});

const getRequestOrigin = (req) => {
  const host = req.headers.host;
  if (!host) return "";
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = typeof forwardedProto === "string" && forwardedProto.split(",")[0].trim() === "https"
    ? "https"
    : req.socket.encrypted ? "https" : "http";
  return `${proto}://${host}`;
};

const isAllowedOrigin = (req, config) => {
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === (config.allowedOrigin || getRequestOrigin(req));
};

const clientIpFrom = (req, config) => {
  if (config.trustProxy && typeof req.headers["x-forwarded-for"] === "string") {
    return req.headers["x-forwarded-for"].split(",")[0].trim() || "unknown";
  }
  return req.socket.remoteAddress || "unknown";
};

const isExpired = (expiresAt, now = new Date()) => expiresAt && new Date(expiresAt).getTime() <= now.getTime();

// Tests inject a clock through the config; production always reads the wall clock.
const nowFrom = (config) => (typeof config?.clock === "function" ? config.clock() : new Date());

const handlePost = async (req, res, repository, config) => {
  if (!isAllowedOrigin(req, config)) return sendError(res, 403, "FORBIDDEN_ORIGIN");
  const tokenHash = tokenHashFromHeader(req.headers.authorization);
  if (!tokenHash) return sendError(res, 401, "TOKEN_REQUIRED");
  const idempotencyKey = req.headers["idempotency-key"];
  if (!validateIdempotencyKey(idempotencyKey)) return sendError(res, 400, "BAD_REQUEST");

  let raw;
  try {
    raw = await readBody(req, config.maxPayloadBytes);
  } catch (error) {
    return sendError(res, error.code === "BODY_TOO_LARGE" ? 413 : 400, error.code || "BAD_REQUEST");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return sendError(res, 400, "BAD_JSON");
  }

  try {
    const result = await publishInvitation({
      body: parsed,
      clientKeyHash: sha256(`client:${clientIpFrom(req, config)}`),
      config,
      idempotencyKey,
      now: nowFrom(config),
      repository,
      tokenHash,
    });
    return json(res, 201, result);
  } catch (error) {
    if (["BAD_REQUEST", "BODY_TOO_LARGE"].includes(error.code)) {
      return sendError(res, error.code === "BODY_TOO_LARGE" ? 413 : 400, error.code);
    }
    const [status, code] = mapRepositoryError(error);
    return sendError(res, status, code);
  }
};

const handleGet = async (res, repository, id, config = {}) => {
  if (!repository) return sendError(res, 503, "REPOSITORY_UNAVAILABLE");
  if (!isValidPublicId(id)) return sendError(res, 404, "NOT_FOUND");
  try {
    const now = nowFrom(config);
    const record = await repository.get(id);
    if (!record) return sendError(res, 404, "NOT_FOUND");
    // Already dead records are never revived by the refresh below.
    if (isExpired(record.expiresAt, now)) return sendError(res, 410, "EXPIRED");
    const expiresAt = await refreshPublicationExpiry({ record, repository, config, now });
    return json(res, 200, {
      invitation: record.invitation,
      expiresAt: expiresAt || null
    });
  } catch {
    return sendError(res, 503, "REPOSITORY_UNAVAILABLE");
  }
};

const handleDelete = async (req, res, repository, id) => {
  if (!repository) return sendError(res, 503, "REPOSITORY_UNAVAILABLE");
  if (!isValidPublicId(id)) return sendError(res, 404, "NOT_FOUND");
  const tokenHash = tokenHashFromHeader(req.headers.authorization);
  if (!tokenHash) return sendError(res, 401, "TOKEN_REQUIRED");
  try {
    const removed = await repository.remove({ id, tokenHash });
    if (!removed) {
      const record = await repository.get(id);
      if (!record) return empty(res, 204);
      return sendError(res, 403, "TOKEN_FORBIDDEN");
    }
    return empty(res, 204);
  } catch {
    return sendError(res, 503, "REPOSITORY_UNAVAILABLE");
  }
};

const createHandler = ({ repository, config = {} } = {}) => {
  const mergedConfig = {
    ...DEFAULT_PUBLISHING_CONFIG,
    ...DEFAULT_HTTP_CONFIG,
    ...config
  };

  return async (req, res) => {
    const parsed = new URL(req.url || "/", "http://localhost");
    const invitationId = req.query?.id || parsed.searchParams.get("id");
    if (parsed.pathname === "/api/invitations" || parsed.pathname === "/api/invitations.js") {
      if (invitationId) {
        if (req.method === "GET") return handleGet(res, repository, invitationId, mergedConfig);
        if (req.method === "DELETE") return handleDelete(req, res, repository, invitationId);
        return sendError(res, 405, "METHOD_NOT_ALLOWED");
      }
      if (req.method === "POST") return handlePost(req, res, repository, mergedConfig);
      return sendError(res, 405, "METHOD_NOT_ALLOWED");
    }

    const invitationMatch = parsed.pathname.match(/^\/api\/invitations\/([^/]+)$/);
    if (invitationMatch) {
      if (req.method === "GET") return handleGet(res, repository, invitationMatch[1], mergedConfig);
      if (req.method === "DELETE") return handleDelete(req, res, repository, invitationMatch[1]);
      return sendError(res, 405, "METHOD_NOT_ALLOWED");
    }

    if (req.method === "GET" || req.method === "HEAD") {
      const served = await serveStatic(req, res, mergedConfig, parsed.pathname);
      if (served) return;

      // Match production (Vercel filesystem + static 404 handler): an
      // unmatched, non-API GET/HEAD gets the designed 404 page instead of
      // the publishing API's JSON error. API clients (/api/...) always keep
      // getting JSON below, and non-GET/HEAD requests never render HTML.
      if (!parsed.pathname.startsWith("/api/")) {
        const servedNotFound = await serveErrorPage(req, res, mergedConfig, "404.html", 404);
        if (servedNotFound) return;
        res.writeHead(404, {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store"
        });
        res.end(req.method === "HEAD" ? undefined : "Not Found");
        return;
      }
    }
    return sendError(res, 404, "NOT_FOUND");
  };
};

module.exports = {
  createHandler,
  errorBody,
  isExpired,
  staticFileFor
};
