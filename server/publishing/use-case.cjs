const {
  createPublicId,
  normalizeForPublishing,
  sha256
} = require("../validation.cjs");

const calculateExpiresAt = (ttlDays, now) => {
  if (!Number.isFinite(ttlDays) || ttlDays <= 0) return null;
  return new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
};

const mapRepositoryError = (error) => {
  const code = error?.code || "REPOSITORY_UNAVAILABLE";
  if (code === "IDEMPOTENCY_CONFLICT") return [409, code];
  if (["RATE_LIMIT", "TOTAL_DAILY_LIMIT", "LIFETIME_LIMIT"].includes(code)) return [429, code];
  return [503, "REPOSITORY_UNAVAILABLE"];
};

const publishInvitation = async ({
  body,
  clientKeyHash,
  config,
  idempotencyKey,
  now = new Date(),
  repository,
  tokenHash
}) => {
  if (!repository) {
    const error = new Error("REPOSITORY_UNAVAILABLE");
    error.code = "REPOSITORY_UNAVAILABLE";
    throw error;
  }

  const publishing = normalizeForPublishing({
    body,
    maxPayloadBytes: config.maxPayloadBytes
  });

  const result = await repository.publish({
    id: createPublicId(),
    createId: createPublicId,
    invitation: publishing.invitation,
    tokenHash,
    idempotencyKeyHash: sha256(`idempotency:${tokenHash}:${idempotencyKey}`),
    contentHash: publishing.contentHash,
    clientKeyHash,
    now,
    expiresAt: calculateExpiresAt(config.ttlDays, now)
  });

  return {
    id: result.id,
    url: `/i/${result.id}`,
    expiresAt: result.expiresAt || null
  };
};

module.exports = {
  calculateExpiresAt,
  mapRepositoryError,
  publishInvitation
};
