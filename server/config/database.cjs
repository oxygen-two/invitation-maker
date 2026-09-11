const DEFAULT_DATABASE_CONFIG = Object.freeze({
  mongoUri: "",
  mongoDbName: "invitation_publish"
});

const readDatabaseConfigFromEnv = (env = process.env) => ({
  mongoUri: env.MONGODB_URI || DEFAULT_DATABASE_CONFIG.mongoUri,
  mongoDbName: env.MONGODB_DB || DEFAULT_DATABASE_CONFIG.mongoDbName
});

module.exports = {
  DEFAULT_DATABASE_CONFIG,
  readDatabaseConfigFromEnv
};
