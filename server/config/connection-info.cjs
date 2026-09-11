// Startup visibility for which MongoDB the process will talk to. The
// incident this guards against: nothing printed the db name or host, so a
// wrong MONGODB_DB/MONGODB_URI silently read an empty (or the wrong) database.
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const stripPort = (hostToken) => {
  const value = hostToken.trim();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end === -1 ? value : value.slice(0, end + 1);
  }
  const lastColon = value.lastIndexOf(":");
  return lastColon === -1 ? value : value.slice(0, lastColon);
};

// Extracts host[,host2,...] from a mongodb:// or mongodb+srv:// URI,
// discarding scheme, credentials, database name, and query options. Returns
// "" for anything that doesn't look like a mongo URI. Never includes
// credentials in its output, even on malformed input.
const hostFromMongoUri = (uri) => {
  const value = String(uri || "").trim();
  const withoutScheme = value.replace(/^mongodb(\+srv)?:\/\//i, "");
  if (withoutScheme === value) return "";
  const afterCredentials = withoutScheme.includes("@")
    ? withoutScheme.slice(withoutScheme.lastIndexOf("@") + 1)
    : withoutScheme;
  const hostSegment = afterCredentials.split(/[/?]/)[0];
  return hostSegment.split(",").map((entry) => entry.trim()).filter(Boolean).join(",");
};

// True only when every host in a (possibly comma-separated replica set)
// host string is loopback. Empty input is not loopback — treat "unknown" as
// remote so the warning errs toward visibility, not silence.
const isLoopbackHost = (host) => {
  const hosts = String(host || "").split(",").map((entry) => stripPort(entry).toLowerCase()).filter(Boolean);
  if (hosts.length === 0) return false;
  return hosts.every((entry) => LOOPBACK_HOSTS.has(entry));
};

const describeMongoConnection = (uri) => {
  const host = hostFromMongoUri(uri);
  return { host, isLoopback: isLoopbackHost(host) };
};

// Prints the db name + host the process will use, and — if it resolves to a
// non-loopback host — a loud, hard-to-miss warning. Never refuses to start;
// operating on a remote database is a legitimate workflow, it just should
// never be silent.
const logConnectionTarget = (logger, { mongoUri, mongoDbName }) => {
  if (!mongoUri) {
    logger.log("Database: no MONGODB_URI set — publishing storage is disabled.");
    return;
  }
  const { host, isLoopback } = describeMongoConnection(mongoUri);
  logger.log(`Database: "${mongoDbName}" at ${host || "(unrecognized host)"}`);
  if (!isLoopback) {
    logger.warn("!!! REMOTE DATABASE !!!");
    logger.warn(`!!! ${host || "this host"} is not local — writes and revocations affect real data.`);
  }
};

module.exports = {
  describeMongoConnection,
  hostFromMongoUri,
  isLoopbackHost,
  logConnectionTarget
};
