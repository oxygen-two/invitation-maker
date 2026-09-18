const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { staticFileFor } = require("../server/http/static.cjs");
const { shouldCopyRootFile } = require("../scripts/build-public.cjs");

test("clean URLs resolve to the right static files on the local server", () => {
  assert.equal(staticFileFor(root, "/"), path.join(root, "index.html"));
  assert.equal(staticFileFor(root, "/welcome"), path.join(root, "index.html"));
  assert.equal(staticFileFor(root, "/studio"), path.join(root, "studio.html"));
  assert.equal(staticFileFor(root, "/guide"), path.join(root, "guide.html"));
  assert.equal(staticFileFor(root, "/sample"), path.join(root, "sample.html"));
  assert.equal(staticFileFor(root, "/privacy"), path.join(root, "privacy.html"));
  assert.equal(staticFileFor(root, "/terms"), path.join(root, "terms.html"));
});

test("vercel routes the clean URLs before the filesystem handler", () => {
  const { routes } = JSON.parse(read("vercel.json"));
  const filesystemIndex = routes.findIndex((route) => route.handle === "filesystem");
  const expected = {
    "/studio": "/studio.html",
    "/welcome": "/index.html",
    "/guide": "/guide.html",
    "/sample": "/sample.html",
    "/privacy": "/privacy.html",
    "/terms": "/terms.html"
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
  assert.match(source, /landing_cta_clicked: \["campaign", "flow_id", "medium", "page", "placement", "source"\]/);
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
    ...["bloom-portrait", "wedding", "first-chapter", "golden-years", "botanical", "midnight-cinema"].map((id) => `assets/media/site/design-${id}-2x.jpg`),
    "assets/media/site/guide-step-01-2x.jpg",
    "assets/media/site/guide-step-02-2x.jpg",
    "assets/media/site/guide-step-03-2x.jpg",
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
  assert.ok(shouldCopyRootFile("sample.html"));
  assert.ok(shouldCopyRootFile("studio.html"));
  assert.ok(shouldCopyRootFile("guide.html"));
});

test("the landing's design shelf has six figures and the guide's finish table labels every cell", () => {
  const landing = read("index.html");
  const designsMarkup = landing.match(/<div class="designs"[^>]*>[\s\S]*?<\/div>\s*<\/div>/)[0];
  assert.equal((designsMarkup.match(/<figure class="design">/g) || []).length, 6);

  const guide = read("guide.html");
  const tableMarkup = guide.match(/<tbody>[\s\S]*?<\/tbody>/)[0];
  const cells = [...tableMarkup.matchAll(/<td\b[^>]*>/g)];
  assert.equal(cells.length, 12, "finish table should have 12 <td> cells");
  for (const [tag] of cells) assert.match(tag, /data-i18n-attr="data-label:site\.guide\.finish\.head\.\w+"/, `${tag} is missing data-label binding`);
});

test("the studio links to the guide and the landing", () => {
  const studio = read("studio.html");
  assert.match(studio, /<a class="studio-guide-link" href="\/guide" data-i18n="header\.guideLink">사용법<\/a>/);
  assert.match(studio, /<a href="\/welcome" data-i18n="header\.aboutLink">소개<\/a>/);
  assert.match(studio, /<a href="\/guide#finish" data-i18n="finish\.compareLink">세 가지 방식의 차이 보기<\/a>/);
});

test("site chrome pages declare a dark palette for prefers-color-scheme and a future toggle", () => {
  // index.html and guide.html carry no inline <style>; their dark rules live in
  // the linked assets/site/site.css. shared.html and viewer.html style inline.
  const siteCss = read("assets/site/site.css");
  const pagesToCss = {
    "index.html": siteCss,
    "guide.html": siteCss,
    "shared.html": read("shared.html"),
    "viewer.html": read("viewer.html")
  };
  for (const [page, css] of Object.entries(pagesToCss)) {
    assert.match(css, /@media\s*\(prefers-color-scheme:\s*dark\)/, `${page}: missing prefers-color-scheme: dark block`);
    assert.match(css, /:root\[data-theme="dark"\]/, `${page}: missing [data-theme="dark"] override block`);
    // the media-query block must be guarded so an explicit light choice wins
    assert.match(css, /:root:not\(\[data-theme="light"\]\)/, `${page}: prefers-color-scheme block must be guarded with :root:not([data-theme="light"])`);
  }
});

test("site chrome pages ship a dark theme-color meta alongside the light one", () => {
  for (const page of ["index.html", "guide.html", "shared.html", "viewer.html"]) {
    const html = read(page);
    assert.match(html, /<meta name="theme-color"(?![^>]*media)[^>]*>/, `${page}: missing the light theme-color meta`);
    assert.match(
      html,
      /<meta name="theme-color" content="#[0-9a-fA-F]{3,6}" media="\(prefers-color-scheme:\s*dark\)">/,
      `${page}: missing the dark theme-color meta`
    );
  }
});

test("the shared page's not-found envelope illustration does not glow pastel green on a dark surface", () => {
  const shared = read("shared.html");
  // The envelope's paper/back-flap fills must be overridable per theme rather
  // than fixed presentation attributes with no dark counterpart. A bare
  // "some selector exists" check would pass even if the near-white
  // #fffdf8 fill were left unmapped, so assert the actual remap happens
  // inside both the prefers-color-scheme block and the manual
  // [data-theme="dark"] override.
  assert.match(
    shared,
    /:root:not\(\[data-theme="light"\]\)[^}]*\.envelope svg \[fill="#fffdf8"\][^}]*fill:\s*#[0-9a-f]{3,8}/i,
    "shared.html: prefers-color-scheme dark block does not remap the envelope's near-white fill"
  );
  assert.match(
    shared,
    /:root\[data-theme="dark"\][^}]*\.envelope svg \[fill="#fffdf8"\][^}]*fill:\s*#[0-9a-f]{3,8}/i,
    'shared.html: [data-theme="dark"] block does not remap the envelope\'s near-white fill'
  );
});

test("the shared page's skip link stays legible in dark mode instead of hardcoding a white background", () => {
  const shared = read("shared.html");
  // .skip previously hardcoded `background: #fff` with no explicit color,
  // which put near-white ink on a white background once dark mode lightened
  // --ink (1.14:1 contrast). It must use the theme-aware card/ink tokens
  // instead, mirroring assets/site/site.css's .skip rule.
  assert.match(
    shared,
    /\.skip\s*\{[^}]*background:\s*var\(--card\)[^}]*color:\s*var\(--ink\)/,
    "shared.html: .skip should paint background: var(--card); color: var(--ink) so it stays legible in dark mode"
  );
  assert.doesNotMatch(
    shared,
    /\.skip\s*\{[^}]*background:\s*#fff\b/i,
    "shared.html: .skip must not hardcode a white background"
  );
});

/* Privacy, terms and the consent choice (A-8) ---------------------------- */

test("the privacy and terms pages are fully translatable and their Korean copy matches the dictionary", () => {
  assertPageIsTranslatable("privacy.html", 60);
  assertPageIsTranslatable("terms.html", 50);
});

test("every binding on the two legal pages names a key both site dictionaries ship", () => {
  const ko = require("../assets/i18n/dictionary-site-ko.js");
  const en = require("../assets/i18n/dictionary-site-en.js");
  const has = (dictionary, key) => {
    let cursor = dictionary;
    for (const segment of key.split(".")) {
      if (!cursor || typeof cursor !== "object") return false;
      cursor = cursor[segment];
    }
    return typeof cursor === "string" && cursor.trim().length > 0;
  };

  for (const page of ["privacy.html", "terms.html"]) {
    const html = read(page);
    const keys = new Set([
      ...[...html.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]),
      ...[...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap((match) => match[1].split(";")).map((pair) => pair.split(":")[1]),
      ...[...html.matchAll(/data-i18n-title="([^"]+)"/g)].map((match) => match[1])
    ].filter(Boolean).map((key) => key.trim()));

    assert.ok(keys.size > 40, `${page} should bind most of its copy`);
    for (const key of keys) {
      // The legal pages are site pages: every key they name has to live in
      // the site dictionaries, which is what they load alongside the main ones.
      assert.ok(has(ko, key) || has(require("../assets/i18n/dictionary-ko.js"), key), `dictionary-site-ko.js has no ${key}`);
      assert.ok(has(en, key) || has(require("../assets/i18n/dictionary-en.js"), key), `dictionary-site-en.js has no ${key}`);
    }
    for (const key of [...keys].filter((key) => key.startsWith("site."))) {
      assert.ok(has(ko, key), `dictionary-site-ko.js has no ${key}`);
      assert.ok(has(en, key), `dictionary-site-en.js has no ${key}`);
    }
  }
});

test("the legal pages carry the same head discipline as the guide", () => {
  for (const [page, slug, titleKey] of [["privacy.html", "privacy", "site.meta.privacyTitle"], ["terms.html", "terms", "site.meta.termsTitle"]]) {
    const html = read(page);
    assert.match(html, /<meta name="robots" content="index, follow">/, `${page}: should be indexable`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://invitation-maker-one\\.vercel\\.app/${slug}">`), `${page}: wrong canonical`);
    assert.match(html, new RegExp(`data-i18n-title="${titleKey.replace(/\./g, "\\.")}"`), `${page}: should name its own tab title`);
    assert.doesNotMatch(html, /google-site-verification/, `${page}: search-console tags belong to the landing`);
    assert.doesNotMatch(html, /<script>\s*try \{/, `${page} never redirects`);
    assert.doesNotMatch(html, /fonts\.googleapis\.com/, `${page}: the site chrome loads no web fonts`);
    assert.match(html, /<link rel="stylesheet" href="\/assets\/site\/site\.css">/, `${page}: should reuse the site chrome`);
  }
});

test("the privacy page states the shipped retention defaults and calls them defaults", () => {
  const { DEFAULT_PUBLISHING_CONFIG } = require("../server/config/publishing.cjs");
  const ko = require("../assets/i18n/dictionary-site-ko.js");
  const en = require("../assets/i18n/dictionary-site-en.js");

  assert.equal(DEFAULT_PUBLISHING_CONFIG.idleWindowDays, 7);
  assert.equal(DEFAULT_PUBLISHING_CONFIG.maxLifetimeDays, 30);
  for (const [name, dictionary] of [["ko", ko], ["en", en]]) {
    const retention = dictionary.site.privacy.retention;
    assert.match(retention.one, /\b7\b/, `${name}: the idle window is missing`);
    assert.match(retention.two, /\b7\b/, `${name}: the sliding rule is missing`);
    assert.match(retention.three, /\b30\b/, `${name}: the max lifetime is missing`);
    assert.match(retention.note, /\b7\b[\s\S]*\b30\b/, `${name}: the note should name both numbers`);
    const expiry = dictionary.site.terms.expiry;
    assert.match(expiry.one, /\b7\b/);
    assert.match(expiry.two, /\b30\b/);
  }
  assert.match(ko.site.privacy.retention.note, /기본값/, "ko must say these are defaults");
  assert.match(en.site.privacy.retention.note, /defaults/, "en must say these are defaults");
});

test("the privacy page names the real operator and contact address", () => {
  for (const dictionary of [require("../assets/i18n/dictionary-site-ko.js"), require("../assets/i18n/dictionary-site-en.js")]) {
    assert.match(dictionary.site.privacy.contact.lead, /오재성/);
    assert.match(dictionary.site.privacy.contact.lead, /rojae@kakao\.com/);
    assert.match(dictionary.site.privacy.deletion.two, /rojae@kakao\.com/);
    assert.match(dictionary.site.terms.contact.lead, /오재성/);
    assert.match(dictionary.site.terms.contact.lead, /rojae@kakao\.com/);
    assert.doesNotMatch(dictionary.site.privacy.contact.lead, /\[OPERATOR\]|\[CONTACT_EMAIL\]/);
    assert.doesNotMatch(dictionary.site.privacy.deletion.two, /\[CONTACT_EMAIL\]/);
    assert.doesNotMatch(dictionary.site.terms.contact.lead, /\[OPERATOR\]|\[CONTACT_EMAIL\]/);
  }
});

test("the privacy page covers every section the audit asked for", () => {
  const privacy = read("privacy.html");
  for (const id of ["browser", "server", "retention", "analytics", "diagnostics", "deletion", "children", "contact"]) {
    assert.match(privacy, new RegExp(`<section id="${id}"`), `privacy.html has no #${id} section`);
    assert.match(privacy, new RegExp(`href="#${id}"`), `privacy.html's table of contents skips #${id}`);
  }
  const terms = read("terms.html");
  for (const id of ["service", "account", "content", "prohibited", "availability", "expiry", "contact"]) {
    assert.match(terms, new RegExp(`<section id="${id}"`), `terms.html has no #${id} section`);
    assert.match(terms, new RegExp(`href="#${id}"`), `terms.html's table of contents skips #${id}`);
  }
});

test("the privacy page offers a way back to the consent choice", () => {
  const privacy = read("privacy.html");
  assert.match(privacy, /<button type="button"[^>]*data-consent-settings[^>]*data-i18n="site\.privacy\.analytics\.settings">/);
  assert.match(read("assets/site/consent.js"), /\[data-consent-settings\]/);
});

test("every page with a footer links to the privacy policy and the terms", () => {
  for (const page of ["index.html", "guide.html", "privacy.html", "terms.html"]) {
    const footer = read(page).match(/<footer class="site-footer">[\s\S]*?<\/footer>/)[0];
    assert.match(footer, /<a href="\/privacy" data-i18n="site\.footer\.privacy">/, `${page}: no privacy link`);
    assert.match(footer, /<a href="\/terms" data-i18n="site\.footer\.terms">/, `${page}: no terms link`);
  }

  const studioFooter = read("studio.html").match(/<nav class="studio-footer-links"[\s\S]*?<\/nav>/)[0];
  assert.match(studioFooter, /<a href="\/privacy" data-i18n="header\.privacyLink">/);
  assert.match(studioFooter, /<a href="\/terms" data-i18n="header\.termsLink">/);

  const sharedFooter = read("shared.html").match(/<footer id="shared-invitation-footer"[\s\S]*?<\/footer>/)[0];
  assert.match(sharedFooter, /<a href="\/privacy" data-i18n="header\.privacyLink">/);
  assert.match(sharedFooter, /<a href="\/terms" data-i18n="header\.termsLink">/);
});

test("the four site pages share the exact same header and footer markup", () => {
  const chrome = (file) => {
    const html = read(file);
    return [html.match(/<header class="site-header">[\s\S]*?<\/header>/)[0], html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)[0]];
  };
  const expected = chrome("index.html");
  for (const page of ["guide.html", "privacy.html", "terms.html"]) {
    assert.deepEqual(chrome(page), expected, `${page}: chrome has drifted from index.html`);
  }
});

test("the share dialog states the retention rule in its own static markup", () => {
  const studio = read("studio.html");
  const dialog = studio.match(/<dialog id="share-dialog"[\s\S]*?<\/dialog>/)[0];
  assert.match(dialog, /data-i18n="finish\.shareDialogPrivacy"/);
  assert.match(dialog, /<a href="\/privacy" data-i18n="finish\.privacyLink">/);
  // It has to be readable before anything is published, so it lives in the
  // dialog itself rather than in the panel publishing.js renders.
  assert.ok(dialog.indexOf("finish.shareDialogPrivacy") < dialog.indexOf('id="publishing-panel"'));
  assert.doesNotMatch(read("assets/publishing/publishing.js"), /shareDialogPrivacy/);

  const ko = require("../assets/i18n/dictionary-ko.js");
  assert.match(ko.finish.shareDialogPrivacy, /7일/);
  assert.match(ko.finish.shareDialogPrivacy, /30일/);
});

test("the sitemap lists the two legal pages", () => {
  const sitemap = read("sitemap.xml");
  for (const url of ["/privacy", "/terms"]) {
    assert.match(sitemap, new RegExp(`<loc>https://invitation-maker-one\\.vercel\\.app${url}</loc>`));
  }
});

test("build-public ships the two legal pages", () => {
  assert.ok(shouldCopyRootFile("privacy.html"));
  assert.ok(shouldCopyRootFile("terms.html"));
});
