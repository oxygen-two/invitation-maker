const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { DEFAULT_LIMITS, ERROR_MESSAGES } = require("./config.cjs");
const {
  createPublicId,
  isValidPublicId,
  normalizeForPublishing,
  sha256,
  tokenHashFromHeader,
  validateIdempotencyKey
} = require("./validation.cjs");

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
});

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
    message: ERROR_MESSAGES[code] || ERROR_MESSAGES.BAD_REQUEST
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

const calculateExpiresAt = (ttlDays, now) => {
  if (!Number.isFinite(ttlDays) || ttlDays <= 0) return null;
  return new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
};

const mapRepositoryError = (error) => {
  const code = error?.code || "REPOSITORY_UNAVAILABLE";
  if (code === "IDEMPOTENCY_CONFLICT") return [409, code];
  if (["RATE_LIMIT", "TOTAL_DAILY_LIMIT", "LIFETIME_LIMIT"].includes(code)) return [429, code];
  return [503, "REPOSITORY_UNAVAILABLE"];
};

const isExpired = (expiresAt, now = new Date()) => expiresAt && new Date(expiresAt).getTime() <= now.getTime();

const staticFileFor = (staticRoot, requestPath) => {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  if (decoded === "/" || decoded === "") decoded = "/index.html";
  if (decoded === "/i" || decoded.startsWith("/i/")) decoded = "/shared.html";
  if (decoded.includes("\0") || decoded.split("/").includes("..")) return null;
  if (/\/\./.test(decoded)) return null;
  if (!(
    /^\/[0-9A-Za-z_-][0-9A-Za-z_.-]*\.html$/.test(decoded)
    || /^\/assets\/[0-9A-Za-z_./-]+\.(?:css|js|json|png|webp|jpe?g|svg|ico)$/.test(decoded)
    || decoded === "/invitation-data.json"
  )) return null;
  const fullPath = path.resolve(staticRoot, `.${decoded}`);
  const rootWithSep = path.resolve(staticRoot) + path.sep;
  if (!fullPath.startsWith(rootWithSep)) return null;
  return fullPath;
};

const serveStatic = async (req, res, config, requestPath) => {
  if (!config.staticRoot) return false;
  const file = staticFileFor(config.staticRoot, requestPath);
  if (!file) return false;
  try {
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) return false;
    res.writeHead(200, {
      "content-type": MIME_TYPES[path.extname(file)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    fs.createReadStream(file).pipe(res);
    return true;
  } catch {
    return false;
  }
};

const handlePost = async (req, res, repository, config) => {
  if (!repository) return sendError(res, 503, "REPOSITORY_UNAVAILABLE");
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

  let publishing;
  try {
    publishing = normalizeForPublishing({ body: parsed, maxPayloadBytes: config.maxPayloadBytes });
  } catch (error) {
    const code = error.code || "BAD_REQUEST";
    return sendError(res, code === "BODY_TOO_LARGE" ? 413 : 400, code);
  }

  const now = new Date();
  try {
    const result = await repository.publish({
      id: createPublicId(),
      createId: createPublicId,
      invitation: publishing.invitation,
      tokenHash,
      idempotencyKeyHash: sha256(`idempotency:${tokenHash}:${idempotencyKey}`),
      contentHash: publishing.contentHash,
      clientKeyHash: sha256(`client:${clientIpFrom(req, config)}`),
      now,
      expiresAt: calculateExpiresAt(config.ttlDays, now)
    });
    return json(res, 201, {
      id: result.id,
      url: `/i/${result.id}`,
      expiresAt: result.expiresAt || null
    });
  } catch (error) {
    const [status, code] = mapRepositoryError(error);
    return sendError(res, status, code);
  }
};

const handleGet = async (res, repository, id) => {
  if (!repository) return sendError(res, 503, "REPOSITORY_UNAVAILABLE");
  if (!isValidPublicId(id)) return sendError(res, 404, "NOT_FOUND");
  try {
    const record = await repository.get(id);
    if (!record) return sendError(res, 404, "NOT_FOUND");
    if (isExpired(record.expiresAt)) return sendError(res, 410, "EXPIRED");
    return json(res, 200, {
      invitation: record.invitation,
      expiresAt: record.expiresAt || null
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
    ...DEFAULT_LIMITS,
    staticRoot: "",
    allowedOrigin: "",
    ...config
  };

  return async (req, res) => {
    const parsed = new URL(req.url || "/", "http://localhost");
    const invitationId = req.query?.id || parsed.searchParams.get("id");
    if (parsed.pathname === "/api/invitations" || parsed.pathname === "/api/invitations.js") {
      if (invitationId) {
        if (req.method === "GET") return handleGet(res, repository, invitationId);
        if (req.method === "DELETE") return handleDelete(req, res, repository, invitationId);
        return sendError(res, 405, "METHOD_NOT_ALLOWED");
      }
      if (req.method === "POST") return handlePost(req, res, repository, mergedConfig);
      return sendError(res, 405, "METHOD_NOT_ALLOWED");
    }

    const invitationMatch = parsed.pathname.match(/^\/api\/invitations\/([^/]+)$/);
    if (invitationMatch) {
      if (req.method === "GET") return handleGet(res, repository, invitationMatch[1]);
      if (req.method === "DELETE") return handleDelete(req, res, repository, invitationMatch[1]);
      return sendError(res, 405, "METHOD_NOT_ALLOWED");
    }

    if (req.method === "GET" || req.method === "HEAD") {
      const served = await serveStatic(req, res, mergedConfig, parsed.pathname);
      if (served) return;
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
