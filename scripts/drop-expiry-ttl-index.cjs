#!/usr/bin/env node
// Drops the retired TTL index on `published_invitations.expiresAtDate`.
//
// MongoDB must no longer delete published invitations: `expiresAtDate` is a
// marker the API enforces on every read and an external batch job acts on.
// Removing `createIndex(..., { expireAfterSeconds: 0 })` from the application
// does not drop the index that earlier versions already created, so a database
// that ever ran them keeps deleting until this script runs.
//
// It drops one index. It never touches documents, and never touches the
// counters collection, whose TTL index is intentional (rate-limit quota
// buckets are ephemeral bookkeeping, not user content).
//
// Usage:
//   node scripts/drop-expiry-ttl-index.cjs              # dry run (default)
//   node scripts/drop-expiry-ttl-index.cjs --apply      # drop and recreate plain
//
// Safety: refuses non-loopback MongoDB hosts unless
// PUBLISH_INDEX_DROP_ALLOW_REMOTE=1.

const { MongoClient } = require("mongodb");
const { readDatabaseConfigFromEnv } = require("../server/config/database.cjs");

const INDEX_NAME = "expiresAtDate_1";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const unknownArgs = args.filter((arg) => !["--apply", "--dry-run"].includes(arg));
if (unknownArgs.length) {
  console.error(`Unknown argument(s): ${unknownArgs.join(", ")}. Supported: --apply, --dry-run.`);
  process.exit(1);
}

const { mongoUri, mongoDbName } = readDatabaseConfigFromEnv();
if (!mongoUri) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
}

const parsedUri = new URL(mongoUri);
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);
if (!loopbackHosts.has(parsedUri.hostname) && process.env.PUBLISH_INDEX_DROP_ALLOW_REMOTE !== "1") {
  console.error("Refusing to drop an index on a non-loopback MongoDB host. Set PUBLISH_INDEX_DROP_ALLOW_REMOTE=1 only after reviewing a dry run and confirming the deployed API already enforces expiry on reads.");
  process.exit(1);
}

const collectionName = process.env.PUBLISH_COLLECTION || "published_invitations";

const run = async () => {
  const client = new MongoClient(mongoUri);
  await client.connect();
  const collection = client.db(mongoDbName).collection(collectionName);

  const indexes = await collection.indexes();
  const existing = indexes.find((index) => index.name === INDEX_NAME
    || (index.key?.expiresAtDate === 1 && Object.keys(index.key).length === 1));
  const isTtl = Boolean(existing) && existing.expireAfterSeconds !== undefined;

  const mode = apply ? "APPLY" : "DRY RUN";
  console.log(`[${mode}] ${mongoDbName}.${collectionName} @ ${parsedUri.host}`);
  console.log(`  indexes present:    ${indexes.map((index) => index.name).join(", ")}`);

  if (!existing) {
    console.log(`  ${INDEX_NAME}:    absent`);
    console.log(`  action:             create the plain (non-TTL) scan index`);
  } else if (!isTtl) {
    console.log(`  ${existing.name}:    present, not a TTL index (no expireAfterSeconds)`);
    console.log("  action:             nothing to do; MongoDB is not deleting publications");
    await client.close();
    return;
  } else {
    console.log(`  ${existing.name}:    TTL index, expireAfterSeconds=${existing.expireAfterSeconds}`);
    console.log("  action:             drop it, then create the plain (non-TTL) scan index");
    console.log("  effect:             MongoDB stops deleting expired publications; the API keeps hiding them from public reads");
  }

  if (!apply) {
    console.log("  No index was changed. Re-run with --apply to perform the action above.");
    await client.close();
    return;
  }

  if (existing) {
    await collection.dropIndex(existing.name);
    console.log(`  dropped:            ${existing.name}`);
  }
  await collection.createIndex({ expiresAtDate: 1 });
  console.log(`  created:            ${INDEX_NAME} (plain)`);

  const after = await collection.indexes();
  const rebuilt = after.find((index) => index.name === INDEX_NAME);
  if (!rebuilt || rebuilt.expireAfterSeconds !== undefined) {
    throw new Error(`${INDEX_NAME} is still a TTL index after the drop; inspect the collection manually.`);
  }
  console.log("  verified:           no TTL index remains on expiresAtDate");
  await client.close();
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
