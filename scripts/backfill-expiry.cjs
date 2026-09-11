#!/usr/bin/env node
// Backfills `expiresAtDate` on publications created before the sliding-expiry
// policy existed. Those records have `expiresAtDate: null` and would otherwise
// live forever.
//
// This script never deletes anything. It only writes an expiry; MongoDB's TTL
// index on `expiresAtDate` performs the actual removal later.
//
// Usage:
//   node scripts/backfill-expiry.cjs              # dry run (default)
//   node scripts/backfill-expiry.cjs --apply      # write
//
// Safety: refuses non-loopback MongoDB hosts unless PUBLISH_BACKFILL_ALLOW_REMOTE=1.

const { MongoClient } = require("mongodb");
const { readDatabaseConfigFromEnv } = require("../server/config/database.cjs");
const { readPublishingConfigFromEnv } = require("../server/config/publishing.cjs");
const { DAY_MS } = require("../server/publishing/expiry.cjs");

const BATCH_SIZE = 500;
const SAMPLE_SIZE = 5;

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
if (!loopbackHosts.has(parsedUri.hostname) && process.env.PUBLISH_BACKFILL_ALLOW_REMOTE !== "1") {
  console.error("Refusing to run the expiry backfill against a non-loopback MongoDB host. Set PUBLISH_BACKFILL_ALLOW_REMOTE=1 only after reviewing a dry run against a copy of that data.");
  process.exit(1);
}

const { idleWindowDays, maxLifetimeDays } = readPublishingConfigFromEnv();
if (!(maxLifetimeDays > 0)) {
  console.error("PUBLISH_MAX_LIFETIME_DAYS is 0, so expiry is disabled. Nothing to backfill.");
  process.exit(1);
}

const collectionName = process.env.PUBLISH_COLLECTION || "published_invitations";
const idleWindowMs = Math.max(0, idleWindowDays) * DAY_MS;
const maxLifetimeMs = maxLifetimeDays * DAY_MS;

const asDate = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

// Grace decision: a record whose `createdAt` is already older than the hard
// ceiling would be deleted by the TTL index the moment this migration wrote its
// honest expiry. Killing a live invitation on the spot is unacceptable
// collateral, so those records get `now + idleWindow` instead: anyone sharing
// that link today still has a full idle window, and normal reads take over from
// there (a link nobody opens then expires on schedule).
const plan = (record, now) => {
  const createdAt = asDate(record.createdAt);
  if (!createdAt) {
    return { bucket: "missingCreatedAt", expiresAt: new Date(now.getTime() + idleWindowMs) };
  }
  const ceiling = new Date(createdAt.getTime() + maxLifetimeMs);
  if (ceiling.getTime() <= now.getTime()) {
    return { bucket: "grace", expiresAt: new Date(now.getTime() + idleWindowMs) };
  }
  const sliding = new Date(now.getTime() + idleWindowMs);
  return {
    bucket: "normal",
    expiresAt: idleWindowMs && sliding.getTime() < ceiling.getTime() ? sliding : ceiling
  };
};

const run = async () => {
  const client = new MongoClient(mongoUri);
  await client.connect();
  const collection = client.db(mongoDbName).collection(collectionName);
  const now = new Date();

  const summary = {
    scanned: 0,
    alreadyExpiring: 0,
    newlySet: 0,
    normal: 0,
    grace: 0,
    missingCreatedAt: 0
  };
  const samples = [];
  let operations = [];

  const flush = async () => {
    if (!operations.length) return;
    if (apply) await collection.bulkWrite(operations, { ordered: false });
    operations = [];
  };

  const cursor = collection.find({}, {
    projection: { id: 1, createdAt: 1, expiresAt: 1, expiresAtDate: 1 }
  });

  for await (const record of cursor) {
    summary.scanned += 1;
    if (asDate(record.expiresAtDate)) {
      summary.alreadyExpiring += 1;
      continue;
    }

    const { bucket, expiresAt } = plan(record, now);
    summary[bucket] += 1;
    summary.newlySet += 1;
    if (samples.length < SAMPLE_SIZE) {
      samples.push({
        id: record.id,
        createdAt: asDate(record.createdAt)?.toISOString() || null,
        bucket,
        expiresAt: expiresAt.toISOString()
      });
    }

    operations.push({
      updateOne: {
        filter: { id: record.id },
        update: { $set: { expiresAt: expiresAt.toISOString(), expiresAtDate: expiresAt } }
      }
    });
    if (operations.length >= BATCH_SIZE) await flush();
  }
  await flush();
  await client.close();

  const mode = apply ? "APPLY" : "DRY RUN";
  console.log(`[${mode}] ${mongoDbName}.${collectionName} @ ${parsedUri.host}`);
  console.log(`  policy: idle window ${idleWindowDays}d, max lifetime ${maxLifetimeDays}d, reference time ${now.toISOString()}`);
  console.log(`  scanned:            ${summary.scanned}`);
  console.log(`  already had expiry: ${summary.alreadyExpiring} (untouched)`);
  console.log(`  newly set:          ${summary.newlySet}`);
  console.log(`    within ceiling:   ${summary.normal}`);
  console.log(`    grace bucket:     ${summary.grace} (older than ${maxLifetimeDays}d; would be deleted immediately, given now + ${idleWindowDays}d instead)`);
  console.log(`    no createdAt:     ${summary.missingCreatedAt} (given now + ${idleWindowDays}d)`);
  if (samples.length) {
    console.log("  sample:");
    for (const sample of samples) {
      console.log(`    ${sample.id} created=${sample.createdAt} bucket=${sample.bucket} -> ${sample.expiresAt}`);
    }
  }
  if (!apply) console.log("  No documents were modified. Re-run with --apply to write these values.");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
