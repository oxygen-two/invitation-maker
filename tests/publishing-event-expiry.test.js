const test = require("node:test");
const assert = require("node:assert/strict");

const { DAY_MS, eventFloorAt, expiryTargetAt, nextExpiresAt } = require("../server/publishing/expiry.cjs");
const { DEFAULT_PUBLISHING_CONFIG } = require("../server/config/publishing.cjs");
const { calculateExpiresAt, refreshPublicationExpiry } = require("../server/publishing/use-case.cjs");

const config = DEFAULT_PUBLISHING_CONFIG;
const publishedAt = new Date("2026-03-01T00:00:00.000Z");
const daysAfter = (from, days) => new Date(from.getTime() + days * DAY_MS);
const isoDay = (value) => new Date(value).toISOString().slice(0, 10);

test("an invitation stays open until after the event it announces", () => {
  // The case this rule exists for: a wedding invitation sent two months ahead.
  // Under the plain 30 day ceiling the link died three weeks before the day.
  const expiresAt = calculateExpiresAt(config, publishedAt, { dateTime: "2026-05-01T14:00" });
  assert.equal(isoDay(expiresAt), "2026-05-08");
  assert.ok(new Date(expiresAt) > daysAfter(publishedAt, config.maxLifetimeDays));
});

test("nobody opening the link cannot retire it before the event", () => {
  // Sliding window alone would land seven days from now; the event outranks it.
  const quietDay = daysAfter(publishedAt, 20);
  const target = expiryTargetAt({
    createdAt: publishedAt,
    now: quietDay,
    idleWindowDays: config.idleWindowDays,
    maxLifetimeDays: config.maxLifetimeDays,
    dateTime: "2026-05-01T14:00",
    eventGraceDays: config.eventGraceDays,
    maxEventLeadDays: config.maxEventLeadDays
  });
  assert.equal(isoDay(target), "2026-05-08");
});

test("an invitation with no event date keeps the previous sliding behaviour", () => {
  const withoutEvent = calculateExpiresAt(config, publishedAt, { dateTime: "" });
  const legacy = calculateExpiresAt(config, publishedAt);
  assert.equal(withoutEvent, legacy);
  assert.equal(isoDay(withoutEvent), isoDay(daysAfter(publishedAt, config.idleWindowDays)));
});

test("an author cannot buy unlimited storage with a far future date", () => {
  for (const dateTime of ["2031-01-01T10:00", "2020-01-01T10:00", "not-a-date", "2026-05-01"]) {
    assert.equal(
      eventFloorAt({ createdAt: publishedAt, dateTime, eventGraceDays: config.eventGraceDays, maxEventLeadDays: config.maxEventLeadDays }),
      null,
      dateTime
    );
  }
  // Just inside the lead limit still counts.
  assert.ok(eventFloorAt({
    createdAt: publishedAt,
    dateTime: "2027-03-01T10:00",
    eventGraceDays: config.eventGraceDays,
    maxEventLeadDays: config.maxEventLeadDays
  }));
});

test("a read after the event still lets the invitation retire", () => {
  const afterEvent = new Date("2026-05-20T00:00:00.000Z");
  const target = expiryTargetAt({
    createdAt: publishedAt,
    now: afterEvent,
    idleWindowDays: config.idleWindowDays,
    maxLifetimeDays: config.maxLifetimeDays,
    dateTime: "2026-05-01T14:00",
    eventGraceDays: config.eventGraceDays,
    maxEventLeadDays: config.maxEventLeadDays
  });
  assert.equal(isoDay(target), "2026-05-08");
  // And the read path writes nothing once the target sits in the past.
  assert.equal(nextExpiresAt({
    createdAt: publishedAt,
    expiresAt: new Date("2026-05-08T14:00:00.000Z").toISOString(),
    now: afterEvent,
    idleWindowDays: config.idleWindowDays,
    maxLifetimeDays: config.maxLifetimeDays,
    expiryRefreshThrottleHours: config.expiryRefreshThrottleHours,
    dateTime: "2026-05-01T14:00",
    eventGraceDays: config.eventGraceDays,
    maxEventLeadDays: config.maxEventLeadDays
  }), null);
});

test("the event grace and lead limits are configurable through the environment", () => {
  const { readPublishingConfigFromEnv } = require("../server/config/publishing.cjs");
  const read = readPublishingConfigFromEnv({ PUBLISH_EVENT_GRACE_DAYS: "3", PUBLISH_MAX_EVENT_LEAD_DAYS: "90" });
  assert.equal(read.eventGraceDays, 3);
  assert.equal(read.maxEventLeadDays, 90);
});

/* The event floor had a narrower parser than the rest of the codebase:
   expiry.cjs required YYYY-MM-DDTHH:MM exactly, while normalizeDateTime at
   assets/invitation/core.js:374 accepts optional seconds and canonicalizes
   them away — and every dateTime in invitation-data.json carries them.
   A publish was safe because validation.cjs normalizes before storing. A read
   was not: refreshPublicationExpiry takes record.invitation.dateTime straight
   from storage, so any document predating that normalization, or written by
   the backfill script, silently lost its floor and could not get it back. */
test("a stored dateTime that still carries seconds keeps its event floor", () => {
  const withSeconds = calculateExpiresAt(config, publishedAt, { dateTime: "2026-05-01T14:00:00" });
  const withoutSeconds = calculateExpiresAt(config, publishedAt, { dateTime: "2026-05-01T14:00" });

  assert.equal(withSeconds, withoutSeconds);
  assert.equal(isoDay(withSeconds), "2026-05-08");

  // A date with no time at all still names no instant, and a UTC instant is
  // not what this field holds — both stay refused.
  for (const dateTime of ["2026-05-01", "2026-05-01T14:00:00.000Z", "2026-05-01T14:00:00Z"]) {
    assert.equal(
      eventFloorAt({ createdAt: publishedAt, dateTime, eventGraceDays: config.eventGraceDays, maxEventLeadDays: config.maxEventLeadDays }),
      null,
      dateTime
    );
  }
});

test("a public read of a seconds-form record pushes its expiry past the event", async () => {
  const quietDay = daysAfter(publishedAt, 20);
  const stored = {
    id: "AbCdEfGhIjKlMnOpQrStUv",
    createdAt: publishedAt,
    // Seven days out from the publish, which is where the sliding window alone
    // would have left it; the event is six weeks later.
    expiresAt: daysAfter(publishedAt, 7).toISOString(),
    invitation: { title: "\uc800\ub141 \uc2dd\uc0ac", dateTime: "2026-05-01T14:00:00" }
  };
  const writes = [];
  const repository = {
    async refreshExpiry({ id, expiresAt }) {
      writes.push({ id, expiresAt });
      return true;
    }
  };

  const applied = await refreshPublicationExpiry({ record: stored, repository, config, now: quietDay });

  assert.equal(writes.length, 1, "the read wrote nothing, so the floor was lost");
  assert.equal(writes[0].id, stored.id);
  assert.equal(isoDay(applied), "2026-05-08");
  assert.equal(applied, writes[0].expiresAt);
  assert.ok(new Date(applied) > new Date(stored.expiresAt));
});

test("a record with no event date is still left on the sliding window by a read", async () => {
  const quietDay = daysAfter(publishedAt, 20);
  const writes = [];
  const applied = await refreshPublicationExpiry({
    record: {
      id: "AbCdEfGhIjKlMnOpQrStUv",
      createdAt: publishedAt,
      expiresAt: daysAfter(publishedAt, 7).toISOString(),
      invitation: { title: "No date" }
    },
    repository: { async refreshExpiry({ expiresAt }) { writes.push(expiresAt); return true; } },
    config,
    now: quietDay
  });

  // now + idleWindowDays (27 days out), still under the 30-day ceiling.
  assert.equal(isoDay(applied), isoDay(daysAfter(quietDay, config.idleWindowDays)));
  assert.ok(new Date(applied) < daysAfter(publishedAt, config.maxLifetimeDays));
  assert.deepEqual(writes, [applied]);
});

/* The backfill wrote the expiry policy out a second time — a min() of the
   sliding window and the ceiling — and PR #47's event floor never reached it.
   A record for an event three weeks out would have been stamped with an expiry
   a week from now, against a live link guests are holding. */
test("the backfill plans expiries with the one expiry formula", () => {
  const { createExpiryPlanner } = require("../scripts/backfill-expiry.cjs");
  const plan = createExpiryPlanner(config);
  const now = new Date("2026-03-01T00:00:00.000Z");
  const target = (record) => expiryTargetAt({
    createdAt: record.createdAt,
    now,
    idleWindowDays: config.idleWindowDays,
    maxLifetimeDays: config.maxLifetimeDays,
    dateTime: record.invitation?.dateTime,
    eventGraceDays: config.eventGraceDays,
    maxEventLeadDays: config.maxEventLeadDays
  });

  const withEvent = { id: "a", createdAt: "2026-02-25T00:00:00.000Z", invitation: { dateTime: "2026-05-01T14:00" } };
  const planned = plan(withEvent, now);
  assert.equal(planned.bucket, "normal");
  assert.equal(isoDay(planned.expiresAt), "2026-05-08", "the event floor outranks the sliding window here too");
  assert.equal(planned.expiresAt.getTime(), target(withEvent).getTime());

  const quiet = { id: "b", createdAt: "2026-02-25T00:00:00.000Z" };
  assert.equal(plan(quiet, now).expiresAt.getTime(), target(quiet).getTime());

  // A record already past its ceiling would stop being readable the instant an
  // honest expiry was written, so it keeps its full idle window instead.
  const ancient = { id: "c", createdAt: "2025-01-01T00:00:00.000Z" };
  assert.equal(plan(ancient, now).bucket, "grace");
  assert.equal(isoDay(plan(ancient, now).expiresAt), isoDay(daysAfter(now, config.idleWindowDays)));

  const undated = { id: "d" };
  assert.equal(plan(undated, now).bucket, "missingCreatedAt");
  assert.equal(isoDay(plan(undated, now).expiresAt), isoDay(daysAfter(now, config.idleWindowDays)));

  // And the formula itself is required, not restated.
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "scripts/backfill-expiry.cjs"), "utf8");
  assert.match(source, /expiryTargetAt/);
  assert.doesNotMatch(source, /maxLifetimeMs/, "the ceiling is expiry.cjs's to compute");
});
