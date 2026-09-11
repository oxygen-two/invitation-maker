const { MongoClient } = require("mongodb");

const errorWithCode = (code) => Object.assign(new Error(code), { code });

const hourBucket = (date) => date.toISOString().slice(0, 13);
const dayBucket = (date) => date.toISOString().slice(0, 10);
const counterExpiry = (key, now) => {
  if (key.startsWith("hour:")) return new Date(now.getTime() + 2 * 60 * 60 * 1000);
  if (key.startsWith("day:")) return new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  return null;
};

const createMongoPublicationsRepository = ({
  uri,
  dbName,
  collectionName = "published_invitations",
  countersCollectionName = "publishing_counters",
  ttlDays = 0,
  rateLimitPerHour = 10,
  totalDailyLimit = 100,
  lifetimeLimit = 1000
} = {}) => {
  let client = null;
  let setupPromise = null;

  const connect = async () => {
    if (!uri || !dbName) throw errorWithCode("REPOSITORY_UNAVAILABLE");
    if (!client) client = new MongoClient(uri);
    await client.connect();
    return client.db(dbName);
  };

  const setupIndexes = async () => {
    const db = await connect();
    await Promise.all([
      db.collection(collectionName).createIndex({ id: 1 }, { unique: true }),
      db.collection(collectionName).createIndex({ tokenHash: 1, idempotencyKeyHash: 1 }, { unique: true }),
      db.collection(collectionName).createIndex({ expiresAtDate: 1 }, { expireAfterSeconds: 0 }),
      db.collection(countersCollectionName).createIndex({ key: 1 }, { unique: true }),
      db.collection(countersCollectionName).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    ]);
    return db;
  };

  const db = async () => {
    if (!setupPromise) {
      setupPromise = setupIndexes().catch((error) => {
        setupPromise = null;
        throw error;
      });
    }
    return setupPromise;
  };

  const collection = async () => (await db()).collection(collectionName);
  const counters = async () => (await db()).collection(countersCollectionName);

  const reserveCounter = async (key, limit, now) => {
    if (limit <= 0) return null;
    const countersCollection = await counters();
    const expiresAt = counterExpiry(key, now);
    const result = await countersCollection.findOneAndUpdate(
      { key, count: { $lt: limit } },
      {
        $setOnInsert: { key, createdAt: now, ...(expiresAt ? { expiresAt } : {}) },
        $set: { updatedAt: now },
        $inc: { count: 1 }
      },
      { upsert: true, returnDocument: "after" }
    ).catch((error) => {
      if (error.code === 11000) return null;
      throw error;
    });
    if (!result) throw errorWithCode(key.startsWith("hour:") ? "RATE_LIMIT" : key.startsWith("day:") ? "TOTAL_DAILY_LIMIT" : "LIFETIME_LIMIT");
    return key;
  };

  const releaseCounter = async (key) => {
    if (!key) return;
    await (await counters()).updateOne({ key }, { $inc: { count: -1 } });
  };

  const publish = async (input) => {
    const invitations = await collection();
    const existing = await invitations.findOne({
      tokenHash: input.tokenHash,
      idempotencyKeyHash: input.idempotencyKeyHash
    });
    if (existing) {
      if (existing.contentHash !== input.contentHash) throw errorWithCode("IDEMPOTENCY_CONFLICT");
      return { id: existing.id, expiresAt: existing.expiresAt || null };
    }

    const now = input.now || new Date();
    let id = input.id;
    let attempts = 0;
    const maxAttempts = input.createId ? 5 : 1;

    while (attempts < maxAttempts) {
      attempts += 1;
      const reserved = [];
      try {
        reserved.push(await reserveCounter(`hour:${input.clientKeyHash}:${hourBucket(now)}`, rateLimitPerHour, now));
        reserved.push(await reserveCounter(`day:${dayBucket(now)}`, totalDailyLimit, now));
        reserved.push(await reserveCounter("lifetime", lifetimeLimit, now));

        await invitations.insertOne({
          id,
          invitation: input.invitation,
          tokenHash: input.tokenHash,
          idempotencyKeyHash: input.idempotencyKeyHash,
          contentHash: input.contentHash,
          clientKeyHash: input.clientKeyHash,
          createdAt: now,
          expiresAt: input.expiresAt || null,
          expiresAtDate: ttlDays > 0 && input.expiresAt ? new Date(input.expiresAt) : null
        });
        return { id, expiresAt: input.expiresAt || null };
      } catch (error) {
        await Promise.all(reserved.map(releaseCounter));
        if (error.code !== 11000) throw error;

        const winner = await invitations.findOne({
          tokenHash: input.tokenHash,
          idempotencyKeyHash: input.idempotencyKeyHash
        });
        if (winner) {
          if (winner.contentHash !== input.contentHash) throw errorWithCode("IDEMPOTENCY_CONFLICT");
          return { id: winner.id, expiresAt: winner.expiresAt || null };
        }

        if (!input.createId || attempts >= maxAttempts) throw errorWithCode("PUBLIC_ID_COLLISION");
        id = input.createId();
      }
    }

    throw errorWithCode("PUBLIC_ID_COLLISION");
  };

  const get = async (id) => {
    const record = await (await collection()).findOne({ id });
    if (!record) return null;
    return {
      id: record.id,
      invitation: record.invitation,
      expiresAt: record.expiresAt || null
    };
  };

  const remove = async ({ id, tokenHash }) => {
    const result = await (await collection()).deleteOne({ id, tokenHash });
    return result.deletedCount === 1;
  };

  const close = async () => {
    if (client) await client.close();
    client = null;
    setupPromise = null;
  };

  const dropDatabase = async () => {
    if (!client) return;
    await client.db(dbName).dropDatabase();
  };

  return {
    publish,
    get,
    remove,
    close,
    dropDatabase
  };
};

module.exports = {
  createMongoPublicationsRepository
};
