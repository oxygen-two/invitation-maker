const http = require("node:http");
const path = require("node:path");
const { readConfigFromEnv } = require("./config.cjs");
const { createHandler } = require("./http.cjs");
const { createMongoRepository } = require("./mongo-repository.cjs");

const config = {
  ...readConfigFromEnv(),
  staticRoot: path.resolve(__dirname, "..")
};

const repository = config.mongoUri
  ? createMongoRepository({
    uri: config.mongoUri,
    dbName: config.mongoDbName,
    ttlDays: config.ttlDays,
    rateLimitPerHour: config.rateLimitPerHour,
    totalDailyLimit: config.totalDailyLimit,
    lifetimeLimit: config.lifetimeLimit
  })
  : null;

const server = http.createServer(createHandler({ repository, config }));

server.listen(config.port, config.host, () => {
  console.log(`Invitation maker listening at http://${config.host}:${config.port}`);
});

const shutdown = async () => {
  server.close();
  if (repository) await repository.close();
};

process.on("SIGINT", () => shutdown().finally(() => process.exit(0)));
process.on("SIGTERM", () => shutdown().finally(() => process.exit(0)));
