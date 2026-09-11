const http = require("node:http");
const path = require("node:path");
const { readDatabaseConfigFromEnv } = require("../server/config/database.cjs");
const { logConnectionTarget } = require("../server/config/connection-info.cjs");
const { createAdminMongoPublications } = require("./storage/mongo-publications.cjs");
const { readAdminConfigFromEnv } = require("./config.cjs");
const { createSessionStore } = require("./session-store.cjs");
const { createHandler } = require("./http.cjs");

const databaseConfig = readDatabaseConfigFromEnv();
const config = readAdminConfigFromEnv();
if (!config.adminPassword) {
  console.error("ADMIN_PASSWORD is required to start the admin service.");
  process.exit(1);
}
if (!databaseConfig.mongoUri) {
  console.error("MONGODB_URI is required to start the admin service.");
  process.exit(1);
}

const repository = createAdminMongoPublications({
  uri: databaseConfig.mongoUri,
  dbName: databaseConfig.mongoDbName
});
const sessionStore = createSessionStore({ ttlMs: config.sessionTtlMs });
const server = http.createServer(createHandler({
  repository,
  config,
  sessionStore,
  staticRoot: path.resolve(__dirname, "public")
}));

server.listen(config.port, config.host, () => {
  console.log(`Invitation admin listening at http://${config.host}:${config.port}/admin`);
  logConnectionTarget(console, databaseConfig);
  if (!config.trustProxy) {
    console.warn("ADMIN_TRUST_PROXY is off: the session cookie only gets Secure when the connection is directly HTTPS. If this service sits behind an HTTPS-terminating proxy (e.g. Cloudtype), set ADMIN_TRUST_PROXY=true or the session cookie will be sent over plaintext to that proxy.");
  }
});

const shutdown = async () => {
  server.close();
  await repository.close();
};
process.on("SIGINT", () => shutdown().finally(() => process.exit(0)));
process.on("SIGTERM", () => shutdown().finally(() => process.exit(0)));
