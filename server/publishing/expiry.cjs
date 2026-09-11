const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const toDate = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const positive = (value) => (Number.isFinite(value) && value > 0 ? value : 0);

// A publication lives on a sliding window: every public read pushes the expiry
// to `now + idleWindowDays`, but never past `createdAt + maxLifetimeDays`.
//
//   maxLifetimeDays <= 0  -> expiry disabled entirely.
//   idleWindowDays  <= 0  -> no sliding; a plain `createdAt + maxLifetimeDays` TTL.
//
// `createdAt` is always the stored publication timestamp, never a client value.
const expiryTargetAt = ({
  createdAt,
  now,
  idleWindowDays,
  maxLifetimeDays
}) => {
  const created = toDate(createdAt);
  const current = toDate(now);
  const maxLifetime = positive(maxLifetimeDays);
  const idleWindow = positive(idleWindowDays);
  if (!created || !current || !maxLifetime) return null;

  const ceiling = created.getTime() + maxLifetime * DAY_MS;
  const sliding = idleWindow ? current.getTime() + idleWindow * DAY_MS : Number.POSITIVE_INFINITY;
  return new Date(Math.min(sliding, ceiling));
};

const initialExpiresAt = ({ now, idleWindowDays, maxLifetimeDays }) => {
  const target = expiryTargetAt({ createdAt: now, now, idleWindowDays, maxLifetimeDays });
  return target ? target.toISOString() : null;
};

// Returns the ISO expiry a public read should write, or null when the read
// should not write at all. A write is skipped when:
//   - expiry is disabled or the record has no usable `createdAt`;
//   - the record already sits past its hard ceiling (never shorten a live
//     record from the read path; the backfill/TTL owns that case);
//   - the move would be smaller than the refresh throttle, so the extra write
//     buys nothing.
const nextExpiresAt = ({
  createdAt,
  expiresAt,
  now,
  idleWindowDays,
  maxLifetimeDays,
  expiryRefreshThrottleHours
}) => {
  const current = toDate(now);
  const target = expiryTargetAt({ createdAt, now, idleWindowDays, maxLifetimeDays });
  if (!target || !current) return null;
  if (target.getTime() <= current.getTime()) return null;

  const stored = toDate(expiresAt);
  if (stored) {
    const throttleMs = positive(expiryRefreshThrottleHours) * HOUR_MS;
    if (target.getTime() - stored.getTime() <= throttleMs) return null;
  }
  return target.toISOString();
};

module.exports = {
  DAY_MS,
  HOUR_MS,
  expiryTargetAt,
  initialExpiresAt,
  nextExpiresAt
};
