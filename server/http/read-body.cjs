// server/http/read-body.cjs
// Reads a request body under a byte cap, whether Node streamed it (a local
// server) or the platform already materialized it onto req.body (Vercel).
// Shared by the publishing handler and the MCP handler so the two never
// drift on how they enforce the cap.
const readBody = (req, maxBytes) => new Promise((resolve, reject) => {
  // On Vercel the platform has already read and materialized the body onto
  // req.body before this ever runs, so its own ~4.5 MB request-size limit is
  // the real bound there; the maxBytes cap below is a local-server guarantee.
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

module.exports = { readBody };
