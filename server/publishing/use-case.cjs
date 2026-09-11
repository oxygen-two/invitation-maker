const {
  createPublicId,
  normalizeForPublishing,
  sha256
} = require("../validation.cjs");
const { initialExpiresAt, nextExpiresAt } = require("./expiry.cjs");

const calculateExpiresAt = (config, now) => initialExpiresAt({
  now,
  idleWindowDays: config?.idleWindowDays,
  maxLifetimeDays: config?.maxLifetimeDays
});

// Public reads extend the sliding window. This is bookkeeping: a failure must
// never turn a working invitation page into an error, so every problem here
// resolves to "keep serving the stored expiry".
const refreshPublicationExpiry = async ({ record, repository, config = {}, now = new Date() }) => {
  const storedExpiresAt = record?.expiresAt || null;
  if (!record || typeof repository?.refreshExpiry !== "function") return storedExpiresAt;

  const target = nextExpiresAt({
    createdAt: record.createdAt,
    expiresAt: storedExpiresAt,
    now,
    idleWindowDays: config.idleWindowDays,
    maxLifetimeDays: config.maxLifetimeDays,
    expiryRefreshThrottleHours: config.expiryRefreshThrottleHours
  });
  if (!target) return storedExpiresAt;

  try {
    // `now` travels with the write: the repository refuses to extend a record
    // that is already past its expiry, and it must judge that against the same
    // clock this read used.
    const applied = await repository.refreshExpiry({ id: record.id, expiresAt: target, now });
    return applied ? target : storedExpiresAt;
  } catch {
    return storedExpiresAt;
  }
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
    expiresAt: calculateExpiresAt(config, now)
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
  publishInvitation,
  refreshPublicationExpiry
};
