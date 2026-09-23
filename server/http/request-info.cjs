// server/http/request-info.cjs
// Where a request came from, as the publishing and MCP handlers both need it.
const getRequestOrigin = (req) => {
  const host = req.headers.host;
  if (!host) return "";
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = typeof forwardedProto === "string" && forwardedProto.split(",")[0].trim() === "https"
    ? "https"
    : req.socket?.encrypted ? "https" : "http";
  return `${proto}://${host}`;
};

const clientIpFrom = (req, config) => {
  if (config.trustProxy && typeof req.headers["x-forwarded-for"] === "string") {
    return req.headers["x-forwarded-for"].split(",")[0].trim() || "unknown";
  }
  return req.socket?.remoteAddress || "unknown";
};

module.exports = { clientIpFrom, getRequestOrigin };
