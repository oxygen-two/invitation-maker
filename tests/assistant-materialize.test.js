// tests/assistant-materialize.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAssistantCatalog } = require("../server/assistant/catalog.cjs");
const { formatDateLabel, googleMapsSearchUrl, materializeInvitation } = require("../server/assistant/materialize.cjs");
const { normalizeForPublishing } = require("../server/validation.cjs");

const catalog = createAssistantCatalog();
const draft = {
  language: "ko",
  occasion: "event",
  templateId: "gallery-notice",
  title: "돈그리아에서 저녁",
  subtitle: null,
  dateTime: "2026-10-23T17:00",
  timeZone: "Asia/Seoul",
  host: "재성",
  location: "선릉 돈그리아",
  message: "같이 저녁 먹어요.",
  missing: []
};

test("materializeInvitation copies the preset look and the draft's words, nothing else", () => {
  const preset = catalog.resolveTemplate("gallery-notice", "event");
  const { invitation, language } = materializeInvitation(draft, { catalog });
  assert.equal(language, "ko");
  assert.equal(invitation.templateId, "gallery-notice");
  assert.equal(invitation.introEffect, preset.defaults.introEffect);
  assert.equal(invitation.particleEffect, preset.defaults.particleEffect);
  assert.equal(invitation.englishFont, preset.defaults.englishFont);
  assert.equal(invitation.koreanFont, preset.defaults.koreanFont);
  assert.equal(invitation.title, "돈그리아에서 저녁");
  assert.equal(invitation.host, "재성");
  assert.equal(invitation.location, "선릉 돈그리아");
  assert.equal(invitation.message, "같이 저녁 먹어요.");
  assert.equal(invitation.subtitle, "");
  assert.equal(invitation.dateLabel, "2026.10.23 (금) 17:00");
  assert.equal(invitation.dateTime, "2026-10-23T17:00");
  assert.equal(invitation.timeZone, "Asia/Seoul");
  assert.deepEqual(invitation.items, [], "no sample courses or photos leak in");
  assert.equal("heroImage" in invitation, false);
  assert.equal(invitation.mapProvider, "google");
  assert.equal(invitation.mapEnabled, false);
  assert.equal(invitation.mapUrl, "https://www.google.com/maps/search/?api=1&query=%EC%84%A0%EB%A6%89%20%EB%8F%88%EA%B7%B8%EB%A6%AC%EC%95%84");
});

test("materializeInvitation output passes the publishing validator", () => {
  const { invitation, language } = materializeInvitation(draft, { catalog });
  const normalized = normalizeForPublishing({ body: { invitation, language } });
  assert.equal(normalized.language, "ko");
  assert.equal(normalized.invitation.title, "돈그리아에서 저녁");
});

test("materializeInvitation falls back to an occasion template for an unknown id", () => {
  const { invitation } = materializeInvitation({ ...draft, templateId: "ghost", occasion: "graduation" }, { catalog });
  assert.equal(catalog.resolveTemplate(invitation.templateId, "graduation").occasionId, "graduation");
});

test("formatDateLabel renders in the draft language and zone regardless of process zone", () => {
  assert.equal(formatDateLabel("2026-10-23T17:00", "Asia/Seoul", "ko"), "2026.10.23 (금) 17:00");
  assert.equal(formatDateLabel("2026-10-23T17:00", "Asia/Seoul", "en"), "Fri, Oct 23, 2026 · 5:00 PM");
  assert.equal(formatDateLabel("2026-10-23T17:00", "America/New_York", "en"), "Fri, Oct 23, 2026 · 5:00 PM", "wall time is kept, not shifted");
  assert.equal(formatDateLabel(null, "Asia/Seoul", "ko"), "");
});

test("googleMapsSearchUrl encodes the location and is empty without one", () => {
  assert.equal(googleMapsSearchUrl("Main St & 5th"), "https://www.google.com/maps/search/?api=1&query=Main%20St%20%26%205th");
  assert.equal(googleMapsSearchUrl(null), "");
});
