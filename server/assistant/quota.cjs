// Drafting quota: one slot per client per hour, one per service per day.
// Keys carry the `assist:` prefix so they never collide with the publishing
// counters that share the collection.
const { hourBucket, dayBucket } = require("../storage/counter-buckets.cjs");

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const createAssistantQuota = ({ repository, rateLimitPerHour = 20, totalDailyLimit = 300 }) => {
  const reserve = async ({ clientKeyHash, now = new Date() }) => {
    if (!repository || typeof repository.reserveQuota !== "function") {
      throw Object.assign(new Error("REPOSITORY_UNAVAILABLE"), { code: "REPOSITORY_UNAVAILABLE" });
    }
    const reserved = [];
    const release = async () => {
      await Promise.all(reserved.splice(0).map((key) => repository.releaseQuota(key)));
    };
    try {
      reserved.push(await repository.reserveQuota({
        key: `assist:hour:${clientKeyHash}:${hourBucket(now)}`,
        limit: rateLimitPerHour,
        now,
        expiresAt: new Date(now.getTime() + 2 * HOUR_MS),
        errorCode: "ASSISTANT_RATE_LIMIT"
      }));
      reserved.push(await repository.reserveQuota({
        key: `assist:day:${dayBucket(now)}`,
        limit: totalDailyLimit,
        now,
        expiresAt: new Date(now.getTime() + 2 * DAY_MS),
        errorCode: "ASSISTANT_DAILY_LIMIT"
      }));
    } catch (error) {
      await release();
      throw error;
    }
    return release;
  };

  return Object.freeze({ reserve });
};

module.exports = { createAssistantQuota };
