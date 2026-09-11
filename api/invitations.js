const path = require("node:path");
const { readConfigFromEnv } = require("../server/config.cjs");
const { createHandler } = require("../server/http.cjs");
const { createMongoRepository } = require("../server/mongo-repository.cjs");

let cached;

const getHandler = () => {
  if (cached) return cached;
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
  cached = createHandler({ repository, config });
  return cached;
};

module.exports = (req, res) => getHandler()(req, res);
