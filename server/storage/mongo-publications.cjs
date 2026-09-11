const { MongoClient } = require("mongodb");

const errorWithCode = (code) => Object.assign(new Error(code), { code });

// MongoDB refuses to redefine an existing index with different options.
// IndexOptionsConflict (85) / IndexKeySpecsConflict (86) are what a deployment
// still carrying the retired TTL index reports for the plain expiry index.
const INDEX_CONFLICT_CODES = new Set([85, 86]);

// A record is live while its expiry is strictly in the future, matching the
// boundary the retired TTL index used (it removed documents at expiresAtDate).
// A missing or null expiry means "no expiry set" and stays live.
const liveExpiryFilter = (now) => ({
  $or: [
    { expiresAtDate: null },
    { expiresAtDate: { $exists: false } },
    { expiresAtDate: { $gt: now } }
  ]
});

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

  // A plain, non-TTL index on `expiresAtDate`. MongoDB must not delete
  // publications: `expiresAtDate` is only a marker that the public read below
  // enforces and an external batch job acts on. The index keeps both that read
  // filter and the job's "find expired records" scan cheap.
  //
  // Deployments created before this change still carry the retired TTL index
  // (`expiresAtDate_1` with `expireAfterSeconds: 0`), and MongoDB rejects the
  // redefinition. Serving is unaffected either way, so warn instead of taking
  // the API down until an operator runs the drop script.
  const createExpiryScanIndex = async (invitations) => {
    try {
      await invitations.createIndex({ expiresAtDate: 1 });
    } catch (error) {
      if (!INDEX_CONFLICT_CODES.has(error?.code)) throw error;
      console.warn(`[publications] ${collectionName}.expiresAtDate still carries the retired TTL index, so MongoDB keeps deleting expired publications. Drop it with: node scripts/drop-expiry-ttl-index.cjs --apply`);
    }
  };

  const setupIndexes = async () => {
    const db = await connect();
    await Promise.all([
      db.collection(collectionName).createIndex({ id: 1 }, { unique: true }),
      db.collection(collectionName).createIndex({ tokenHash: 1, idempotencyKeyHash: 1 }, { unique: true }),
      createExpiryScanIndex(db.collection(collectionName)),
      db.collection(countersCollectionName).createIndex({ key: 1 }, { unique: true }),
      // Counters keep their TTL index on purpose: rate-limit quota buckets are
      // ephemeral bookkeeping, not user content, and must expire on their own.
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
          expiresAtDate: input.expiresAt ? new Date(input.expiresAt) : null
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

  // The public read owns expiry enforcement. Nothing deletes expired documents
  // any more, so an expired record is still on disk and must never be served:
  // it behaves exactly as it did when the TTL index had removed it.
  //
  // The expiry is part of the query, not a check after `findOne`, so an expired
  // invitation's content never leaves the database. `now` comes from the caller
  // (the request's single clock) and falls back to the wall clock.
  const get = async (id, { now = new Date() } = {}) => {
    const record = await (await collection()).findOne({ id, ...liveExpiryFilter(now) });
    if (!record) return null;
    return {
      id: record.id,
      invitation: record.invitation,
      // Stored publication time; the sliding-expiry ceiling is derived from it
      // and never from anything the client sends. Not part of the API response.
      createdAt: record.createdAt || null,
      expiresAt: record.expiresAt || null
    };
  };

  // One atomic, monotonic update guarded twice:
  //   - the record must still be live, so a read can never resurrect a record
  //     that is already past its expiry (the document still exists now that
  //     nothing deletes it, so this guard is what keeps it dead);
  //   - the stored expiry must be missing or older than the new one, so
  //     concurrent reads can never move an expiry backwards and a lost race is
  //     simply a no-op.
  const refreshExpiry = async ({ id, expiresAt, now = new Date() }) => {
    if (!id || !expiresAt) return false;
    const next = new Date(expiresAt);
    if (Number.isNaN(next.getTime())) return false;
    const result = await (await collection()).updateOne(
      {
        id,
        $and: [
          liveExpiryFilter(now),
          {
            $or: [
              { expiresAtDate: null },
              { expiresAtDate: { $exists: false } },
              { expiresAtDate: { $lt: next } }
            ]
          }
        ]
      },
      { $set: { expiresAt: next.toISOString(), expiresAtDate: next } }
    );
    return result.modifiedCount === 1;
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
    refreshExpiry,
    remove,
    close,
    dropDatabase
  };
};

module.exports = {
  createMongoPublicationsRepository
};
