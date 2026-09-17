const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { staticFileFor } = require("../server/http/static.cjs");

test("clean URLs resolve to the right static files on the local server", () => {
  assert.equal(staticFileFor(root, "/"), path.join(root, "index.html"));
  assert.equal(staticFileFor(root, "/welcome"), path.join(root, "index.html"));
  assert.equal(staticFileFor(root, "/studio"), path.join(root, "studio.html"));
  assert.equal(staticFileFor(root, "/guide"), path.join(root, "guide.html"));
  assert.equal(staticFileFor(root, "/sample"), path.join(root, "sample.html"));
});

test("vercel routes the clean URLs before the filesystem handler", () => {
  const { routes } = JSON.parse(read("vercel.json"));
  const filesystemIndex = routes.findIndex((route) => route.handle === "filesystem");
  const expected = {
    "/studio": "/studio.html",
    "/welcome": "/index.html",
    "/guide": "/guide.html",
    "/sample": "/sample.html"
  };
  for (const [src, dest] of Object.entries(expected)) {
    const index = routes.findIndex((route) => route.src === src && route.dest === dest);
    assert.ok(index >= 0, `${src} → ${dest} route missing`);
    assert.ok(index < filesystemIndex, `${src} route must precede handle: filesystem`);
  }
});

test("the studio lives at studio.html and no longer carries the root's search-console tags", () => {
  const studio = read("studio.html");
  assert.match(studio, /<link rel="canonical" href="https:\/\/invitation-maker-one\.vercel\.app\/studio">/);
  assert.doesNotMatch(studio, /google-site-verification/);
  assert.doesNotMatch(studio, /naver-site-verification/);
  assert.match(studio, /<a href="\/studio">Invitation Studio/);
});

test("the studio records that this browser has used it", () => {
  const app = read("assets/studio/app.js");
  assert.match(app, /localStorage\.setItem\("invitation-studio:visited"/);
});

const loadI18n = () => {
  const I18n = require("../assets/i18n/i18n.js");
  const ko = require("../assets/i18n/dictionary-ko.js");
  const en = require("../assets/i18n/dictionary-en.js");
  const siteKo = require("../assets/i18n/dictionary-site-ko.js");
  const siteEn = require("../assets/i18n/dictionary-site-en.js");
  I18n.register("ko", { ...ko, ...siteKo });
  I18n.register("en", { ...en, ...siteEn });
  return I18n;
};

const flattenKeys = (object, prefix = "") => Object.entries(object).flatMap(([key, value]) =>
  value && typeof value === "object" ? flattenKeys(value, `${prefix}${key}.`) : [`${prefix}${key}`]);

test("site dictionaries expose the same keys in every language", () => {
  const ko = require("../assets/i18n/dictionary-site-ko.js");
  const en = require("../assets/i18n/dictionary-site-en.js");
  assert.deepEqual(Object.keys(ko), ["site"]);
  assert.deepEqual(flattenKeys(ko).sort(), flattenKeys(en).sort());
  assert.ok(flattenKeys(ko).length > 80);
});

test("site dictionaries merge onto the main dictionary instead of replacing it", () => {
  const source = read("assets/i18n/dictionary-site-ko.js");
  assert.match(source, /root\.InvitationDictionaryKo/);
  assert.match(source, /register\("ko"/);
});

test("guide policy numbers match the shipped defaults", () => {
  const { DEFAULT_PUBLISHING_CONFIG } = require("../server/config/publishing.cjs");
  const publishing = read("assets/publishing/publishing.js");
  const maxBytes = Number(publishing.match(/MAX_PUBLISH_BYTES = (\d+)/)[1]);
  const ko = require("../assets/i18n/dictionary-site-ko.js");
  assert.equal(DEFAULT_PUBLISHING_CONFIG.idleWindowDays, 7);
  assert.equal(DEFAULT_PUBLISHING_CONFIG.maxLifetimeDays, 30);
  assert.equal(maxBytes, 2_000_000);
  assert.match(ko.site.guide.data.two, /7일/);
  assert.match(ko.site.guide.data.two, /30일/);
  assert.match(ko.site.guide.faq.a1, /2MB/);
});

test("analytics allows the landing events and nothing more from them", () => {
  const source = read("assets/analytics/analytics.js");
  assert.match(source, /site_page_viewed: \["campaign", "flow_id", "medium", "page", "source"\]/);
  assert.match(source, /landing_cta_clicked: \["campaign", "flow_id", "medium", "placement", "source"\]/);
  assert.match(source, /landing_sample_opened: \["campaign", "flow_id", "medium", "source"\]/);
  assert.match(source, /placement: 16/);
});
