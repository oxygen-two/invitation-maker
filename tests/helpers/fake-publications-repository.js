// In-memory stand-in for server/storage/mongo-publications.cjs used by the
// assistant and MCP tests. Mirrors the quota contract: reserveQuota throws the
// caller's errorCode once a key reaches its limit; releaseQuota decrements.
const { randomBytes } = require("node:crypto");

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const publicId = () => Array.from(randomBytes(22), (byte) => BASE62[byte % 62]).join("");

class FakePublicationsRepository {
  constructor() {
    this.records = new Map();
    this.counters = new Map();
    this.publishes = [];
    this.nextError = null;
  }

  async reserveQuota({ key, limit, errorCode }) {
    if (limit <= 0) return null;
    const count = this.counters.get(key) || 0;
    if (count >= limit) throw Object.assign(new Error(errorCode), { code: errorCode });
    this.counters.set(key, count + 1);
    return key;
  }

  async releaseQuota(key) {
    if (!key) return;
    this.counters.set(key, Math.max(0, (this.counters.get(key) || 0) - 1));
  }

  async publish(input) {
    this.publishes.push(input);
    if (this.nextError) throw this.nextError;
    const existing = [...this.records.values()].find((record) =>
      record.idempotencyKeyHash === input.idempotencyKeyHash && record.tokenHash === input.tokenHash);
    if (existing) return { id: existing.id, expiresAt: existing.expiresAt };
    const record = {
      id: input.id || publicId(),
      invitation: input.invitation,
      language: input.language || null,
      tokenHash: input.tokenHash,
      idempotencyKeyHash: input.idempotencyKeyHash,
      contentHash: input.contentHash,
      clientKeyHash: input.clientKeyHash,
      createdAt: input.now || new Date(),
      expiresAt: input.expiresAt || null
    };
    this.records.set(record.id, record);
    return { id: record.id, expiresAt: record.expiresAt };
  }

  async get(id) {
    return this.records.get(id) || null;
  }

  async refreshExpiry() {
    return false;
  }

  async remove({ id, tokenHash }) {
    const record = this.records.get(id);
    if (!record || record.tokenHash !== tokenHash) return false;
    this.records.delete(id);
    return true;
  }
}

module.exports = { FakePublicationsRepository };
