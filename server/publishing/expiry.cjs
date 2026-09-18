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

/* The instant an invitation's own event happens, read from the wall clock the
   author typed ("2026-04-11T17:30"). The author's time zone is deliberately
   ignored here: the widest zone spread is under a day, and the grace window
   below is measured in days, so honouring the zone would change nothing a
   guest can notice while adding a zone-conversion of its own. */
const eventInstantFrom = (dateTime) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(dateTime || "").trim());
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const instant = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isFinite(instant) ? new Date(instant) : null;
};

/* An invitation is sent before its event, and the sliding window alone killed
   links before the day they were for: a wedding invitation sent two months
   ahead expired while guests were still waiting. So a publication also lives
   `eventGraceDays` past the event it announces.

   The event time comes from the author, so it cannot extend storage without
   bound: an event further than `maxEventLeadDays` past the publication date is
   ignored, as is one already in the past. */
const eventFloorAt = ({ createdAt, dateTime, eventGraceDays, maxEventLeadDays }) => {
  const created = toDate(createdAt);
  const event = eventInstantFrom(dateTime);
  const grace = positive(eventGraceDays);
  const lead = positive(maxEventLeadDays);
  if (!created || !event || !grace || !lead) return null;
  if (event.getTime() < created.getTime()) return null;
  if (event.getTime() > created.getTime() + lead * DAY_MS) return null;
  return new Date(event.getTime() + grace * DAY_MS);
};

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
  maxLifetimeDays,
  dateTime,
  eventGraceDays,
  maxEventLeadDays
}) => {
  const created = toDate(createdAt);
  const current = toDate(now);
  const maxLifetime = positive(maxLifetimeDays);
  const idleWindow = positive(idleWindowDays);
  if (!created || !current || !maxLifetime) return null;

  const ceiling = created.getTime() + maxLifetime * DAY_MS;
  const sliding = idleWindow ? current.getTime() + idleWindow * DAY_MS : Number.POSITIVE_INFINITY;
  const window = Math.min(sliding, ceiling);
  // The event floor outranks both the ceiling and the sliding window: nobody
  // opening the link for a week must not retire an invitation to a day that
  // has not happened yet.
  const floor = eventFloorAt({ createdAt: created, dateTime, eventGraceDays, maxEventLeadDays });
  return new Date(floor ? Math.max(window, floor.getTime()) : window);
};

const initialExpiresAt = ({ now, idleWindowDays, maxLifetimeDays, dateTime, eventGraceDays, maxEventLeadDays }) => {
  const target = expiryTargetAt({
    createdAt: now, now, idleWindowDays, maxLifetimeDays, dateTime, eventGraceDays, maxEventLeadDays
  });
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
  expiryRefreshThrottleHours,
  dateTime,
  eventGraceDays,
  maxEventLeadDays
}) => {
  const current = toDate(now);
  const target = expiryTargetAt({
    createdAt, now, idleWindowDays, maxLifetimeDays, dateTime, eventGraceDays, maxEventLeadDays
  });
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
  eventFloorAt,
  expiryTargetAt,
  initialExpiresAt,
  nextExpiresAt
};
