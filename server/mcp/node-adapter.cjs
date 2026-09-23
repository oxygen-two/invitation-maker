// The MCP SDK speaks web-standard Request/Response. Node 22 ships both
// globals, so a few lines bridge them without pulling in an HTTP framework.
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

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
  // The SDK's own headers go first, our security headers after, so ours win
  // if the SDK ever sets its own cache-control or x-robots-tag.
  res.writeHead(response.status, { ...headers, "cache-control": "no-store", "x-robots-tag": "noindex" });
  if (!response.body) {
    res.end();
    return;
  }
  // stream.promises.pipeline settles (resolves or rejects) whichever side
  // fails first - including the destination (res) erroring mid-write, e.g.
  // a client aborting the response - unlike a bare .pipe()/"end" listener,
  // which can leave this promise hanging and pin the request open.
  await pipeline(Readable.fromWeb(response.body), res);
};

module.exports = { sendWebResponse, toWebRequest };
