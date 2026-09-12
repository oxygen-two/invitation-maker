const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { passwordMatches } = require("./config.cjs");

const COOKIE = "invitation_admin_session";
const MAX_BODY = 16_000;

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex",
    ...headers
  });
  res.end(JSON.stringify(body));
};

const empty = (res, status, headers = {}) => {
  res.writeHead(status, { "cache-control": "no-store", ...headers });
  res.end();
};

const error = (res, status, message) => json(res, status, { error: message });

const readBody = (req) => new Promise((resolve, reject) => {
  if (req.body !== undefined) {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    return raw.length > MAX_BODY ? reject(new Error("BODY_TOO_LARGE")) : resolve(raw);
  }
  let size = 0;
  const chunks = [];
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) reject(new Error("BODY_TOO_LARGE"));
    else chunks.push(chunk);
  });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});

const cookies = (req) => Object.fromEntries(String(req.headers.cookie || "").split(";").map((part) => {
  const index = part.indexOf("=");
  if (index < 0) return ["", ""];
  const key = part.slice(0, index).trim();
  try {
    return [key, decodeURIComponent(part.slice(index + 1).trim())];
  } catch {
    return ["", ""];
  }
}).filter(([key]) => key));

// Cloudtype (and similar platforms) terminate TLS at a proxy, so req.socket.encrypted
// is false even when the browser is on HTTPS. x-forwarded-proto is the only signal for
// that case, but it's attacker-controllable unless a trusted proxy actually sets it —
// so it's only trusted when the deployer has explicitly opted in via config.trustProxy.
const requestIsHttps = (req, config) => {
  if (req.socket?.encrypted) return true;
  if (!config.trustProxy) return false;
  const forwardedProto = req.headers["x-forwarded-proto"];
  return typeof forwardedProto === "string" && forwardedProto.split(",")[0].trim().toLowerCase() === "https";
};

const sessionCookie = (token, maxAge, secure) => `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
const clearCookie = (secure) => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;

const parsePage = (parsed, defaultPageSize) => {
  const page = Math.max(1, Number.parseInt(parsed.searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(parsed.searchParams.get("pageSize") || String(defaultPageSize), 10) || defaultPageSize));
  return { page, pageSize, query: (parsed.searchParams.get("q") || "").trim().slice(0, 80) };
};

/* What /admin/* may serve, as a fixed map from request name to the directory
   the file comes from. Two roots, not one:

     staticRoot  admin/public — the console's own page, script, styles and
                 dictionaries.
     sharedRoot  assets/i18n — the language ENGINE only.

   The engine is shared with the studio deliberately: reimplementing resolution
   order and the storage key here would mean the operator's language choice
   next door silently failed to carry over, and two copies of the rules to keep
   in step. Reading one named file off local disk is not a dependency on the
   public SERVER — this process already reads server/config/database.cjs — and
   the admin still starts, listens and serves on its own.

   A map rather than a widened regex: the request never contributes a path
   segment, so there is no traversal to defend against. */
const STATIC_FILES = Object.freeze({
  "index.html": ["static", "index.html", "text/html; charset=utf-8"],
  "admin.js": ["static", "admin.js", "text/javascript; charset=utf-8"],
  "admin.css": ["static", "admin.css", "text/css; charset=utf-8"],
  "admin-i18n.js": ["static", "admin-i18n.js", "text/javascript; charset=utf-8"],
  "i18n.js": ["shared", "i18n.js", "text/javascript; charset=utf-8"]
});

const createHandler = ({ repository, config, sessionStore, staticRoot, sharedRoot }) => {
  const loginAttempts = new Map();

  const requireSession = (req, res) => {
    const sessionToken = cookies(req)[COOKIE];
    const session = sessionStore.get(sessionToken);
    if (!session) {
      error(res, 401, "ADMIN_AUTH_REQUIRED");
      return null;
    }
    return { sessionToken, session };
  };

  const requireCsrf = (req, res, auth) => {
    if (!sessionStore.validCsrf(auth.sessionToken, req.headers["x-admin-csrf"])) {
      error(res, 403, "CSRF_INVALID");
      return false;
    }
    return true;
  };

  const allowLoginAttempt = (clientKey) => {
    const now = Date.now();
    const entry = loginAttempts.get(clientKey);
    if (!entry || entry.resetAt <= now) {
      loginAttempts.set(clientKey, { count: 1, resetAt: now + config.loginRateLimit.windowMs });
      return true;
    }
    if (entry.count >= config.loginRateLimit.maxAttempts) return false;
    entry.count += 1;
    return true;
  };

  const publicUrl = (req, id) => {
    const base = config.publicBaseUrl;
    return new URL(`/i/${encodeURIComponent(id)}`, base).toString();
  };

  const serve = async (req, res, pathname) => {
    const requested = pathname === "/admin" || pathname === "/admin/" ? "index.html" : pathname.replace(/^\/admin\//, "");
    const entry = Object.hasOwn(STATIC_FILES, requested) ? STATIC_FILES[requested] : null;
    if (!entry) return false;
    const [source, name, type] = entry;
    const directory = source === "shared" ? sharedRoot : staticRoot;
    if (!directory) return false;
    try {
      const content = await fs.promises.readFile(path.join(directory, name));
      res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
      res.end(content);
      return true;
    } catch { return false; }
  };

  return async (req, res) => {
    const parsed = new URL(req.url || "/", "http://admin.local");
    if (req.method === "GET" && await serve(req, res, parsed.pathname)) return;
    if (!parsed.pathname.startsWith("/admin/api/")) return error(res, 404, "NOT_FOUND");

    if (parsed.pathname === "/admin/api/login" && req.method === "POST") {
      const clientKey = req.socket?.remoteAddress || "unknown";
      if (!allowLoginAttempt(clientKey)) return error(res, 429, "LOGIN_RATE_LIMITED");
      try {
        const body = JSON.parse(await readBody(req));
        if (!passwordMatches(body.password, config.adminPassword)) return error(res, 401, "INVALID_ADMIN_PASSWORD");
        const { sessionToken, csrfToken } = sessionStore.create();
        return json(res, 200, { csrfToken }, { "set-cookie": sessionCookie(sessionToken, Math.floor(config.sessionTtlMs / 1000), requestIsHttps(req, config)) });
      } catch (caught) {
        return error(res, caught.message === "BODY_TOO_LARGE" ? 413 : 400, "BAD_REQUEST");
      }
    }

    if (parsed.pathname === "/admin/api/logout" && req.method === "POST") {
      const logoutAuth = requireSession(req, res);
      if (!logoutAuth) return;
      if (!requireCsrf(req, res, logoutAuth)) return;
      sessionStore.remove(logoutAuth.sessionToken);
      return empty(res, 204, { "set-cookie": clearCookie(requestIsHttps(req, config)) });
    }

    const auth = requireSession(req, res);
    if (!auth) return;
    if (parsed.pathname === "/admin/api/session" && req.method === "GET") {
      const csrfToken = sessionStore.issueCsrf(auth.sessionToken);
      return json(res, 200, { authenticated: true, expiresAt: new Date(auth.session.expiresAt).toISOString(), csrfToken });
    }

    if (parsed.pathname === "/admin/api/publications" && req.method === "GET") {
      try {
        const result = await repository.list(parsePage(parsed, config.pageSize));
        return json(res, 200, {
          ...result,
          items: result.items.map((item) => ({ ...item, invitation: undefined, publicUrl: publicUrl(req, item.id) }))
        });
      } catch { return error(res, 503, "REPOSITORY_UNAVAILABLE"); }
    }

    const detail = parsed.pathname.match(/^\/admin\/api\/publications\/([^/]+)$/);
    const revoke = parsed.pathname.match(/^\/admin\/api\/publications\/([^/]+)\/revoke$/);
    if (detail && req.method === "GET") {
      try {
        const item = await repository.getAdmin(detail[1]);
        if (!item) return error(res, 404, "NOT_FOUND");
        return json(res, 200, { ...item, publicUrl: publicUrl(req, item.id) });
      } catch { return error(res, 503, "REPOSITORY_UNAVAILABLE"); }
    }
    if (revoke && req.method === "POST") {
      if (!requireCsrf(req, res, auth)) return;
      try {
        const removed = await repository.revoke(revoke[1]);
        return removed ? empty(res, 204) : error(res, 404, "NOT_FOUND");
      } catch { return error(res, 503, "REPOSITORY_UNAVAILABLE"); }
    }
    return error(res, 405, "METHOD_NOT_ALLOWED");
  };
};

module.exports = { COOKIE, createHandler };
