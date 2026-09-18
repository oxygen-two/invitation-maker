const test = require("node:test");
const assert = require("node:assert/strict");

const { DAY_MS, eventFloorAt, expiryTargetAt, nextExpiresAt } = require("../server/publishing/expiry.cjs");
const { DEFAULT_PUBLISHING_CONFIG } = require("../server/config/publishing.cjs");
const { calculateExpiresAt } = require("../server/publishing/use-case.cjs");

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
