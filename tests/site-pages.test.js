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

const parseTagAttributes = (tag) => Object.fromEntries([...tag.matchAll(/([a-zA-Z0-9-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

const assertPageIsTranslatable = (file, minimumBindings) => {
  const I18n = loadI18n();
  const html = read(file);
  const bindings = [...html.matchAll(/<([a-z0-9]+)\b([^>]*\bdata-i18n="[^"]+"[^>]*)>([^<]*)</gi)];
  assert.ok(bindings.length >= minimumBindings, `${file}: expected at least ${minimumBindings} translatable elements`);
  for (const [, , attributes, text] of bindings) {
    const key = parseTagAttributes(`<x ${attributes}>`)["data-i18n"];
    assert.equal(text.trim(), I18n.t(key, undefined, "ko"), `${file} text for ${key} has drifted from dictionary-site-ko.js`);
  }
  const keys = [
    ...[...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap((m) => m[1].split(";")).map((pair) => pair.split(":")[1])
  ].filter(Boolean).map((key) => key.trim());
  for (const key of keys) {
    for (const language of I18n.SUPPORTED) assert.equal(I18n.hasKey(key, language), true, `${language} has no ${key}`);
  }
};

test("the landing page is fully translatable and its Korean copy matches the dictionary", () => {
  assertPageIsTranslatable("index.html", 40);
});

test("the landing page owns the root's search metadata", () => {
  const landing = read("index.html");
  assert.match(landing, /<meta name="google-site-verification" content="k0bGP9otm9hmWB_sAZmrRd4dF6ClSKZCx5s_IkHjVeM">/);
  assert.match(landing, /<meta name="naver-site-verification" content="323c12e50a81986273c33141f5fcdf9cae3c2ef6">/);
  assert.match(landing, /<link rel="canonical" href="https:\/\/invitation-maker-one\.vercel\.app\/">/);
  assert.match(landing, /"@type": "WebApplication"/);
  assert.match(landing, /og:image" content="https:\/\/invitation-maker-one\.vercel\.app\/assets\/media\/social-preview-v1\.png"/);
});

test("the landing page sends returning studio users straight to /studio, but never from /welcome", () => {
  const landing = read("index.html");
  const script = landing.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.match(script, /invitation-studio:visited/);
  assert.match(script, /location\.replace\("\/studio" \+ location\.search\)/);
  assert.match(script, /welcome/);
  assert.match(script, /try \{/);
  // It must run before any stylesheet so a returning user never paints the landing.
  assert.ok(landing.indexOf("<script>") < landing.indexOf('<link rel="stylesheet"'));
});

test("landing links use canonical clean URLs and the sample opens in a new tab", () => {
  const landing = read("index.html");
  assert.match(landing, /href="\/studio"[^>]*data-site-event="landing_cta_clicked" data-site-placement="hero"/);
  assert.match(landing, /href="\/sample" target="_blank" rel="noopener"[^>]*data-site-event="landing_sample_opened"/);
  assert.match(landing, /href="\/guide#data"/);
  assert.doesNotMatch(landing, /href="[^"]*\.html"/);
  assert.doesNotMatch(landing, /fonts\.googleapis\.com/);
});

test("both site pages share the exact same header and footer markup", () => {
  const chrome = (file) => {
    const html = read(file);
    return [html.match(/<header class="site-header">[\s\S]*?<\/header>/)[0], html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)[0]];
  };
  assert.deepEqual(chrome("index.html"), chrome("guide.html"));
});

test("the guide is fully translatable and its Korean copy matches the dictionary", () => {
  assertPageIsTranslatable("guide.html", 70);
});

test("the guide has the anchors the landing and the studio link to", () => {
  const guide = read("guide.html");
  for (const id of ["steps", "finish", "data", "faq"]) assert.match(guide, new RegExp(`<section[^>]* id="${id}"`));
  assert.match(guide, /<meta name="robots" content="index, follow">/);
  assert.match(guide, /<link rel="canonical" href="https:\/\/invitation-maker-one\.vercel\.app\/guide">/);
  assert.doesNotMatch(guide, /google-site-verification/);
  assert.equal((guide.match(/<details>/g) || []).length, 8);
  assert.doesNotMatch(guide, /<script>\s*try \{/, "the guide never redirects");
});

test("site media and the sample invitation are checked in", () => {
  const files = [
    ...["bloom-portrait", "wedding", "first-chapter", "golden-years", "botanical", "midnight-cinema"].map((id) => `assets/media/site/design-${id}@2x.jpg`),
    "assets/media/site/guide-step-01@2x.jpg",
    "assets/media/site/guide-step-02@2x.jpg",
    "assets/media/site/guide-step-03@2x.jpg",
    "sample.html"
  ];
  for (const file of files) assert.ok(fs.statSync(path.join(root, file)).size > 1000, `${file} is missing or empty`);
  const sample = read("sample.html");
  assert.match(sample, /<meta name="robots" content="noindex">/);
  assert.match(sample, /class="invitation-card"/);
  assert.match(sample, /data-template="bloom-portrait"/);
});

test("the sitemap lists the landing, the guide, and the studio but not the sample", () => {
  const sitemap = read("sitemap.xml");
  for (const url of ["/", "/guide", "/studio"]) assert.match(sitemap, new RegExp(`<loc>https://invitation-maker-one\\.vercel\\.app${url}</loc>`));
  assert.doesNotMatch(sitemap, /\/sample/);
});

test("build-public copies sample.html", () => {
  const pattern = /^(?:index|viewer|shared|[0-9A-Za-z_-]+)\.html$/;
  assert.ok(pattern.test("sample.html"));
  assert.ok(pattern.test("studio.html"));
  assert.ok(pattern.test("guide.html"));
});

test("the studio links to the guide and the landing", () => {
  const studio = read("studio.html");
  assert.match(studio, /<a class="studio-guide-link" href="\/guide" data-i18n="header\.guideLink">사용법<\/a>/);
  assert.match(studio, /<a href="\/welcome" data-i18n="header\.aboutLink">소개<\/a>/);
  assert.match(studio, /<a href="\/guide#finish" data-i18n="finish\.compareLink">세 가지 방식의 차이 보기<\/a>/);
});
