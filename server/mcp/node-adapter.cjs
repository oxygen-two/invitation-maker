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
