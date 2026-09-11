const http = require("node:http");
const path = require("node:path");
const { readDatabaseConfigFromEnv } = require("./config/database.cjs");
const { readHttpConfigFromEnv } = require("./config/http.cjs");
const { readPublishingConfigFromEnv } = require("./config/publishing.cjs");
const { logConnectionTarget } = require("./config/connection-info.cjs");
const { createHandler } = require("./http.cjs");
const { createMongoPublicationsRepository } = require("./storage/mongo-publications.cjs");

const config = {
  ...readDatabaseConfigFromEnv(),
  ...readHttpConfigFromEnv(),
  ...readPublishingConfigFromEnv(),
  staticRoot: path.resolve(__dirname, "..")
};

const repository = config.mongoUri
  ? createMongoPublicationsRepository({
    uri: config.mongoUri,
    dbName: config.mongoDbName,
    rateLimitPerHour: config.rateLimitPerHour,
    totalDailyLimit: config.totalDailyLimit,
    lifetimeLimit: config.lifetimeLimit
  })
  : null;

const server = http.createServer(createHandler({ repository, config }));

server.listen(config.port, config.host, () => {
  console.log(`Invitation maker listening at http://${config.host}:${config.port}`);
  logConnectionTarget(console, config);
});

const shutdown = async () => {
  server.close();
  if (repository) await repository.close();
};

process.on("SIGINT", () => shutdown().finally(() => process.exit(0)));
process.on("SIGTERM", () => shutdown().finally(() => process.exit(0)));
