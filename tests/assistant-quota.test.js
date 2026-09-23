const test = require("node:test");
const assert = require("node:assert/strict");
const { MongoClient } = require("mongodb");
const { createAssistantQuota } = require("../server/assistant/quota.cjs");
const { createMongoPublicationsRepository } = require("../server/storage/mongo-publications.cjs");
const { FakePublicationsRepository } = require("./helpers/fake-publications-repository.js");

const NOW = new Date("2026-09-23T03:30:00.000Z");

test("reserve takes one hour slot and one day slot, release gives both back", async () => {
  const repository = new FakePublicationsRepository();
  const quota = createAssistantQuota({ repository, rateLimitPerHour: 2, totalDailyLimit: 5 });
  const release = await quota.reserve({ clientKeyHash: "abc", now: NOW });
  assert.equal(repository.counters.get("assist:hour:abc:2026-09-23T03"), 1);
  assert.equal(repository.counters.get("assist:day:2026-09-23"), 1);
  await release();
  assert.equal(repository.counters.get("assist:hour:abc:2026-09-23T03"), 0);
  assert.equal(repository.counters.get("assist:day:2026-09-23"), 0);
});

test("hourly exhaustion is ASSISTANT_RATE_LIMIT and daily exhaustion is ASSISTANT_DAILY_LIMIT", async () => {
  const repository = new FakePublicationsRepository();
  const quota = createAssistantQuota({ repository, rateLimitPerHour: 1, totalDailyLimit: 2 });
  await quota.reserve({ clientKeyHash: "a", now: NOW });
  await assert.rejects(quota.reserve({ clientKeyHash: "a", now: NOW }), (e) => e.code === "ASSISTANT_RATE_LIMIT");
  await quota.reserve({ clientKeyHash: "b", now: NOW });
  await assert.rejects(quota.reserve({ clientKeyHash: "c", now: NOW }), (e) => e.code === "ASSISTANT_DAILY_LIMIT");
  assert.equal(repository.counters.get("assist:hour:c:2026-09-23T03"), 0, "a failed day reservation releases the hour slot it took");
});

test("a zero limit disables that counter", async () => {
  const repository = new FakePublicationsRepository();
  const quota = createAssistantQuota({ repository, rateLimitPerHour: 0, totalDailyLimit: 1 });
  await quota.reserve({ clientKeyHash: "a", now: NOW });
  await quota.reserve({ clientKeyHash: "a", now: NOW }).catch((e) => assert.equal(e.code, "ASSISTANT_DAILY_LIMIT"));
  assert.equal(repository.counters.has("assist:hour:a:2026-09-23T03"), false);
});

test("Mongo repository exposes reserveQuota/releaseQuota with TTL-bearing counters", {
  skip: !process.env.MONGODB_URI && "Set MONGODB_URI for real Mongo integration"
}, async () => {
  const dbName = `assistant_quota_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const repository = createMongoPublicationsRepository({ uri: process.env.MONGODB_URI, dbName });
  try {
    const expiresAt = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
    await repository.reserveQuota({ key: "assist:hour:x:2026-09-23T03", limit: 1, now: NOW, expiresAt, errorCode: "ASSISTANT_RATE_LIMIT" });
    await assert.rejects(
      repository.reserveQuota({ key: "assist:hour:x:2026-09-23T03", limit: 1, now: NOW, expiresAt, errorCode: "ASSISTANT_RATE_LIMIT" }),
      (e) => e.code === "ASSISTANT_RATE_LIMIT"
    );
    await repository.releaseQuota("assist:hour:x:2026-09-23T03");
    await repository.reserveQuota({ key: "assist:hour:x:2026-09-23T03", limit: 1, now: NOW, expiresAt, errorCode: "ASSISTANT_RATE_LIMIT" });
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const doc = await client.db(dbName).collection("publishing_counters").findOne({ key: "assist:hour:x:2026-09-23T03" });
    await client.close();
    assert.equal(doc.count, 1);
    assert.ok(doc.expiresAt instanceof Date);
  } finally {
    await repository.dropDatabase();
    await repository.close();
  }
});
