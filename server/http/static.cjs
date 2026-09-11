const fs = require("node:fs");
const path = require("node:path");

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
    if (req.method === "HEAD") {
      res.end();
      return true;
    }
    fs.createReadStream(file).pipe(res);
    return true;
  } catch {
    return false;
  }
};

// Serves a fixed, known error page (e.g. "404.html") from the static root.
// `fileName` is always a literal supplied by server code, never derived from
// the request path, so there is no path-traversal surface here.
const serveErrorPage = async (req, res, config, fileName, status) => {
  if (!config.staticRoot) return false;
  const file = path.resolve(config.staticRoot, fileName);
  try {
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) return false;
    res.writeHead(status, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    });
    if (req.method === "HEAD") {
      res.end();
      return true;
    }
    fs.createReadStream(file).pipe(res);
    return true;
  } catch {
    return false;
  }
};

module.exports = {
  serveErrorPage,
  serveStatic,
  staticFileFor
};
