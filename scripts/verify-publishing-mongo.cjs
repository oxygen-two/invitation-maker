const assert = require("node:assert/strict");
const { createMongoPublicationsRepository } = require("../server/storage/mongo-publications.cjs");

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
}

const parsed = new URL(uri);
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);
if (!loopbackHosts.has(parsed.hostname) && process.env.PUBLISH_VERIFY_ALLOW_REMOTE !== "1") {
  console.error("Refusing to run destructive verification against a non-loopback MongoDB host. Set PUBLISH_VERIFY_ALLOW_REMOTE=1 only for an isolated test database.");
  process.exit(1);
}

// Atlas limits database names to 38 bytes; keep the disposable verifier name below that limit.
const dbName = `inv_pub_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const repository = createMongoPublicationsRepository({
  uri,
  dbName,
  ttlDays: 1,
  rateLimitPerHour: 5,
  totalDailyLimit: 2,
  lifetimeLimit: 2
});

(async () => {
  try {
    const now = new Date();
    const first = await repository.publish({
      id: "AAAAAAAAAAAAAAAAAAAAAA",
      invitation: { title: "Mongo verification" },
      tokenHash: "token",
      idempotencyKeyHash: "idem",
      contentHash: "content",
      clientKeyHash: "client",
      now,
      expiresAt: new Date(now.getTime() + 86_400_000).toISOString()
    });
    const replay = await repository.publish({
      id: "BBBBBBBBBBBBBBBBBBBBBB",
      invitation: { title: "Mongo verification" },
      tokenHash: "token",
      idempotencyKeyHash: "idem",
      contentHash: "content",
      clientKeyHash: "client",
      now,
      expiresAt: new Date(now.getTime() + 86_400_000).toISOString()
    });
    assert.equal(replay.id, first.id);
    assert.equal((await repository.get(first.id)).invitation.title, "Mongo verification");
    await repository.close();

    const restarted = createMongoPublicationsRepository({
      uri,
      dbName,
      ttlDays: 1,
      rateLimitPerHour: 5,
      totalDailyLimit: 2,
      lifetimeLimit: 2
    });
    assert.equal((await restarted.get(first.id)).invitation.title, "Mongo verification");
    await restarted.close();

    const concurrent = await Promise.allSettled([0, 1].map((index) => repository.publish({
      id: `DDDDDDDDDDDDDDDDDDDDD${index}`,
      invitation: { title: `Quota ${index}` },
      tokenHash: `token-${index}`,
      idempotencyKeyHash: `idem-${index}`,
      contentHash: `content-${index}`,
      clientKeyHash: `client-${index}`,
      now,
      expiresAt: new Date(now.getTime() + 86_400_000).toISOString()
    })));
    assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);

    await assert.rejects(() => repository.publish({
      id: "CCCCCCCCCCCCCCCCCCCCCC",
      invitation: { title: "Changed" },
      tokenHash: "token",
      idempotencyKeyHash: "idem",
      contentHash: "changed",
      clientKeyHash: "client",
      now,
      expiresAt: new Date(now.getTime() + 86_400_000).toISOString()
    }), /IDEMPOTENCY_CONFLICT/);
    assert.equal(await repository.remove({ id: first.id, tokenHash: "wrong" }), false);
    assert.equal(await repository.remove({ id: first.id, tokenHash: "token" }), true);
    console.log(`PASS Mongo publishing repository verification (${dbName})`);
  } finally {
    await repository.dropDatabase();
    await repository.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
