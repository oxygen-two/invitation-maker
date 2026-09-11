const http = require("node:http");
const path = require("node:path");
const { readConfigFromEnv } = require("../server/config.cjs");
const { createMongoRepository } = require("../server/mongo-repository.cjs");
const { readAdminConfigFromEnv } = require("./config.cjs");
const { createSessionStore } = require("./session-store.cjs");
const { createHandler } = require("./http.cjs");

const publicConfig = readConfigFromEnv();
const config = readAdminConfigFromEnv();
if (!config.adminPassword) {
  console.error("ADMIN_PASSWORD is required to start the admin service.");
  process.exit(1);
}
if (!publicConfig.mongoUri) {
  console.error("MONGODB_URI is required to start the admin service.");
  process.exit(1);
}

const repository = createMongoRepository({
  uri: publicConfig.mongoUri,
  dbName: publicConfig.mongoDbName,
  ttlDays: publicConfig.ttlDays,
  rateLimitPerHour: publicConfig.rateLimitPerHour,
  totalDailyLimit: publicConfig.totalDailyLimit,
  lifetimeLimit: publicConfig.lifetimeLimit
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
});

const shutdown = async () => {
  server.close();
  await repository.close();
};
process.on("SIGINT", () => shutdown().finally(() => process.exit(0)));
process.on("SIGTERM", () => shutdown().finally(() => process.exit(0)));
