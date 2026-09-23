const path = require("node:path");
const { readDatabaseConfigFromEnv } = require("../server/config/database.cjs");
const { readHttpConfigFromEnv } = require("../server/config/http.cjs");
const { readPublishingConfigFromEnv } = require("../server/config/publishing.cjs");
const { readAssistantConfigFromEnv } = require("../server/config/assistant.cjs");
const { createHandler } = require("../server/http.cjs");
const { createReporter } = require("../server/observability.cjs");
const { createAssistantFromConfig } = require("../server/assistant/bootstrap.cjs");
const { createMongoPublicationsRepository } = require("../server/storage/mongo-publications.cjs");

let cached;

const getHandler = () => {
  if (cached) return cached;
  const config = {
    ...readDatabaseConfigFromEnv(),
    ...readHttpConfigFromEnv(),
    ...readPublishingConfigFromEnv(),
    ...readAssistantConfigFromEnv(),
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
  const report = createReporter(config.logSink);
  const assistant = createAssistantFromConfig({ config, repository, report });
  cached = createHandler({ repository, config, assistant });
  return cached;
};

module.exports = (req, res) => getHandler()(req, res);
