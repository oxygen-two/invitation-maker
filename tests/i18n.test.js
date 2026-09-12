const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const InvitationI18n = require("../assets/i18n/i18n.js");
const dictionaryKo = require("../assets/i18n/dictionary-ko.js");
const dictionaryEn = require("../assets/i18n/dictionary-en.js");

InvitationI18n.register("ko", dictionaryKo);
InvitationI18n.register("en", dictionaryEn);

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const readJson = (file) => JSON.parse(read(file));

const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"];
const isPluralForm = (value) => Boolean(value)
  && typeof value === "object"
  && !Array.isArray(value)
  && Object.values(value).every((form) => typeof form === "string")
  && PLURAL_CATEGORIES.some((category) => category in value);

// A leaf is one translatable entry: a string, or a set of plural forms.
const leafKeys = (node, prefix = "", out = []) => {
  for (const [name, value] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (typeof value === "string" || isPluralForm(value)) out.push(key);
    else if (value && typeof value === "object") leafKeys(value, key, out);
  }
  return out;
};

const HANGUL = /[가-힣]/;
const dictionaries = { ko: dictionaryKo, en: dictionaryEn };

const parseTagAttributes = (tag) => {
  const attributes = {};
  for (const match of String(tag).matchAll(/\s([a-z][\w:-]*)\s*=\s*"([^"]*)"/gi)) {
    attributes[match[1].toLowerCase()] = match[2];
  }
  return attributes;
};

/* The whole scheme rests on two duplications being kept honest by test:
   index.html repeats the Korean copy inline (so the page renders correctly
   before a single script runs, and so crawlers see real text), and the
   English dictionary repeats the Korean key structure. Both are checked
   below, which is what lets the runtime fallback stay a last resort instead
   of a routine occurrence. */

test("every language ships the same set of translatable keys", () => {
  const koKeys = leafKeys(dictionaryKo).sort();
  const enKeys = leafKeys(dictionaryEn).sort();

  assert.ok(koKeys.length > 200, "the dictionaries should cover the whole studio");
  assert.deepEqual(enKeys.filter((key) => !koKeys.includes(key)), [], "keys in en that ko lacks");
  assert.deepEqual(koKeys.filter((key) => !enKeys.includes(key)), [], "keys in ko that en lacks");
  assert.equal(InvitationI18n.SUPPORTED.length, Object.keys(dictionaries).length);
});

test("every key resolves to real copy in every language", () => {
  for (const key of leafKeys(dictionaryKo)) {
    for (const language of InvitationI18n.SUPPORTED) {
      const value = InvitationI18n.t(key, { count: 1, max: 1 }, language);
      assert.notEqual(value, key, `${language} is missing ${key}`);
      assert.ok(value.trim().length > 0, `${language}:${key} is blank`);
    }
  }
});

test("English copy carries no leftover Korean, and Korean copy is actually Korean", () => {
  // Korean typeface names are deliberately kept in Hangul in the English
  // dictionary: they are the names the foundries ship and the names a user
  // scanning the font list would recognise.
  const keepsHangulInEnglish = (key) => key.startsWith("fonts.");

  for (const key of leafKeys(dictionaryEn)) {
    if (keepsHangulInEnglish(key)) continue;
    const value = InvitationI18n.t(key, { count: 1, max: 1 }, "en");
    assert.doesNotMatch(value, HANGUL, `en:${key} still contains Korean: ${value}`);
  }

  // Guard the other direction too: a key accidentally copied from en into ko
  // would otherwise show an English sentence to a Korean reader.
  const englishOnlyInKorean = new Set([
    "meta.title", "meta.ogLocale", "maker.eyebrow", "preview.eyebrow",
    "library.eyebrow", "library.untitled", "content.linkUrl", "finish.replyContactPattern",
    // Pure interpolation: "{file}: {reason}" is punctuation around two values
    // that are themselves already in the reader's language.
    "content.photoFailed"
  ]);
  const koreanSentences = leafKeys(dictionaryKo)
    .filter((key) => !englishOnlyInKorean.has(key))
    .filter((key) => !HANGUL.test(InvitationI18n.t(key, { count: 1, max: 1 }, "ko")));
  assert.deepEqual(koreanSentences, [], "ko entries with no Korean in them");
});

test("a missing key renders as the key, never as undefined or another language", () => {
  assert.equal(InvitationI18n.t("nope.not.here"), "nope.not.here");
  assert.equal(InvitationI18n.t("gallery"), "gallery", "a branch node is not copy");
  assert.equal(InvitationI18n.hasKey("nope.not.here"), false);
  assert.equal(InvitationI18n.hasKey("nav.gallery"), true);
});

test("placeholders interpolate and plural forms select per language", () => {
  assert.match(InvitationI18n.t("gallery.startNamed", { name: "체리 뮤즈" }, "ko"), /체리 뮤즈/);
  assert.match(InvitationI18n.t("gallery.startNamed", { name: "Cherry Muse" }, "en"), /Cherry Muse/);
  // An unknown placeholder is left visible rather than silently blanked.
  assert.match(InvitationI18n.t("gallery.startNamed", {}, "en"), /\{name\}/);

  assert.match(InvitationI18n.t("content.limitReached", { max: 1, count: 1 }, "en"), /up to 1 item\./);
  assert.match(InvitationI18n.t("content.limitReached", { max: 50, count: 50 }, "en"), /up to 50 items\./);
  // Korean has one form for both, which is exactly why plural lives in data.
  assert.equal(
    InvitationI18n.t("content.limitReached", { max: 1, count: 1 }, "ko").replace("1", "50"),
    InvitationI18n.t("content.limitReached", { max: 50, count: 50 }, "ko")
  );
});

test("language resolution prefers the URL, then the stored choice, then the browser", () => {
  const resolve = (options) => InvitationI18n.resolve(options);

  // A shared ?lang= link wins for this view...
  assert.deepEqual(resolve({ search: "?lang=en", stored: "ko", navigatorLanguages: ["ko-KR"] }),
    { language: "en", source: "query" });
  // ...an explicit choice made here beats the browser's guess...
  assert.deepEqual(resolve({ search: "", stored: "ko", navigatorLanguages: ["en-US"] }),
    { language: "ko", source: "stored" });
  // ...the browser's own preference is the best guess before anyone chooses...
  assert.deepEqual(resolve({ search: "", stored: null, navigatorLanguages: ["en-GB", "fr"] }),
    { language: "en", source: "navigator" });
  // ...an unsupported browser language falls through to the product's home...
  assert.deepEqual(resolve({ search: "", stored: null, navigatorLanguages: ["fr-FR", "de"] }),
    { language: "ko", source: "default" });
  // ...and so does an unsupported or junk ?lang=.
  assert.deepEqual(resolve({ search: "?lang=de", stored: null, navigatorLanguages: [] }),
    { language: "ko", source: "default" });
  assert.deepEqual(resolve({ search: "?lang=", stored: "en", navigatorLanguages: [] }),
    { language: "en", source: "stored" });

  for (const value of ["ko", "ko-KR", "KO", "ko_KR"]) {
    assert.equal(InvitationI18n.normalizeLanguage(value), "ko");
  }
  assert.equal(InvitationI18n.normalizeLanguage("de-DE"), null);
});

test("a shared ?lang= link never rewrites the stored preference", () => {
  // The point of honouring ?lang= only for the current view: someone can send
  // you a link in their language without quietly changing what this device
  // does on every later visit.
  const writes = [];
  const storage = { getItem: () => "ko", setItem: (key, value) => writes.push([key, value]) };
  const previousLocalStorage = globalThis.localStorage;
  const previousLocation = globalThis.location;
  globalThis.localStorage = storage;
  globalThis.location = { search: "?lang=en" };

  try {
    const result = InvitationI18n.init();
    assert.equal(result.source, "query");
    assert.equal(result.language, "en");
    assert.deepEqual(writes, [], "a ?lang= visit must not persist anything");

    // A choice made in the switcher, by contrast, is remembered.
    InvitationI18n.setLanguage("en");
    assert.deepEqual(writes, [[InvitationI18n.STORAGE_KEY, "en"]]);
  } finally {
    globalThis.localStorage = previousLocalStorage;
    globalThis.location = previousLocation;
    InvitationI18n.setLanguage("ko", { persist: false });
  }
});

test("storage that throws cannot stop the studio from choosing a language", () => {
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() { throw new Error("private mode"); },
    setItem() { throw new Error("private mode"); }
  };

  try {
    assert.deepEqual(InvitationI18n.resolve({ search: "", navigatorLanguages: ["en"] }),
      { language: "en", source: "navigator" });
    assert.equal(InvitationI18n.setLanguage("en"), "en");
  } finally {
    globalThis.localStorage = previousLocalStorage;
    InvitationI18n.setLanguage("ko", { persist: false });
  }
});

test("index.html inline copy is exactly what the Korean dictionary says", () => {
  const index = read("index.html");
  const bindings = [...index.matchAll(/<([a-z0-9]+)\b([^>]*\bdata-i18n="[^"]+"[^>]*)>([^<]*)</gi)];

  assert.ok(bindings.length > 60, "most of the page should be translatable");
  for (const [, , attributes, text] of bindings) {
    const key = parseTagAttributes(`<x ${attributes}>`)["data-i18n"];
    assert.equal(text, InvitationI18n.t(key, undefined, "ko"),
      `index.html text for ${key} has drifted from dictionary-ko.js`);
  }
});

test("every data-i18n and data-i18n-attr binding in index.html names a real key", () => {
  const index = read("index.html");
  const keys = [
    ...[...index.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]),
    ...[...index.matchAll(/data-i18n-attr="([^"]+)"/g)]
      .flatMap((match) => match[1].split(";"))
      .map((pair) => pair.split(":")[1])
  ].filter(Boolean).map((key) => key.trim());

  assert.ok(keys.length > 90);
  for (const key of keys) {
    for (const language of InvitationI18n.SUPPORTED) {
      assert.equal(InvitationI18n.hasKey(key, language), true, `${language} has no ${key}`);
    }
  }
});

test("index.html serves the default language and lets the engine correct it", () => {
  const index = read("index.html");

  assert.match(index, /<html lang="ko">/);
  // The engine must run before the body so <html lang> is right for the first
  // paint, and the dictionaries must be registered before it resolves.
  const i18nAt = index.indexOf("assets/i18n/i18n.js");
  const koAt = index.indexOf("assets/i18n/dictionary-ko.js");
  const enAt = index.indexOf("assets/i18n/dictionary-en.js");
  const initAt = index.indexOf("InvitationI18n.init()");
  const bodyAt = index.indexOf("<body");
  assert.ok(i18nAt > 0 && i18nAt < koAt && koAt < enAt && enAt < initAt && initAt < bodyAt);

  // The switcher is reachable by keyboard, labelled, and out of the stage nav.
  assert.match(index, /<select id="language-select"[^>]*data-i18n-attr="aria-label:lang\.switcherLabel"/);
  assert.match(index, /<label for="language-select" data-i18n="lang\.switcherDescription">/);
  assert.ok(index.indexOf('id="language-select"') < index.indexOf('class="studio-steps"'));
});

test("setLanguage updates the document language and every bound node", () => {
  const nodes = [
    { attributes: { "data-i18n": "nav.gallery" }, dataset: { i18n: "nav.gallery" }, textContent: "" },
    {
      attributes: {},
      dataset: { i18nAttr: "aria-label:gallery.dockLabel" },
      setAttribute(name, value) { this.attributes[name] = value; }
    }
  ];
  const documentElement = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
  const fakeDocument = {
    documentElement,
    title: "",
    querySelectorAll: (selector) => selector === "[data-i18n]"
      ? nodes.filter((node) => node.dataset.i18n)
      : nodes.filter((node) => node.dataset.i18nAttr)
  };
  const previousDocument = globalThis.document;
  globalThis.document = fakeDocument;

  try {
    InvitationI18n.setLanguage("en", { persist: false });
    assert.equal(documentElement.attributes.lang, "en");
    assert.equal(nodes[0].textContent, InvitationI18n.t("nav.gallery", undefined, "en"));
    assert.equal(nodes[1].attributes["aria-label"], InvitationI18n.t("gallery.dockLabel", undefined, "en"));

    InvitationI18n.setLanguage("ko", { persist: false });
    assert.equal(documentElement.attributes.lang, "ko");
    assert.equal(nodes[0].textContent, InvitationI18n.t("nav.gallery", undefined, "ko"));
    assert.equal(nodes[1].attributes["aria-label"], InvitationI18n.t("gallery.dockLabel", undefined, "ko"));
  } finally {
    globalThis.document = previousDocument;
    InvitationI18n.setLanguage("ko", { persist: false });
  }
});

test("subscribers are told about a language change and one failure cannot strand the rest", () => {
  const seen = [];
  const unsubscribeBad = InvitationI18n.subscribe(() => { throw new Error("bad subscriber"); });
  const unsubscribe = InvitationI18n.subscribe((language) => seen.push(language));

  try {
    InvitationI18n.setLanguage("en", { persist: false });
    InvitationI18n.setLanguage("ko", { persist: false });
    assert.deepEqual(seen, ["en", "ko"]);
  } finally {
    unsubscribeBad();
    unsubscribe();
    InvitationI18n.setLanguage("ko", { persist: false });
  }
});

test("sample dates are built through Intl and differ per language", () => {
  const iso = "2026-09-12T14:00:00";

  const korean = InvitationI18n.formatSampleDate(iso, "ko");
  const english = InvitationI18n.formatSampleDate(iso, "en");

  assert.equal(korean, "2026.09.12 (토) 14:00");
  assert.equal(english, "Sat, Sep 12, 2026 · 2:00 PM");
  assert.notEqual(korean, english);
  // A 12-hour clock must not print a padded hour.
  assert.doesNotMatch(english, /\b0\d:\d\d/);
  assert.equal(InvitationI18n.formatSampleDate("not a date", "en"), "");

  // Compact enough for the single hero line the templates give it.
  for (const value of [korean, english]) assert.ok(value.length <= 30, `${value} is too long for a hero`);
});

test("numbers and percentages go through Intl rather than string concatenation", () => {
  const app = read("assets/studio/app.js");

  assert.doesNotMatch(app, /\$\{scale\}%|\$\{amount\}%|\$\{crop\.scale\}%/,
    "percentages must be formatted, not concatenated");
  assert.match(app, /const percent = \(value\) => I18n\?\.formatPercent\(value\)/);
  assert.doesNotMatch(app, /new Intl\.DateTimeFormat\("ko-KR"/,
    "the studio must not pin a locale");

  for (const language of InvitationI18n.SUPPORTED) {
    assert.match(InvitationI18n.formatPercent(100, language), /100/);
    assert.match(InvitationI18n.formatNumber(1234, {}, language), /1.?234/);
  }
});

test("saved-record timestamps are formatted for the reader's language", () => {
  const stamp = "2026-09-12T05:00:00.000Z";

  const korean = InvitationI18n.formatDateTime(stamp, { year: "numeric", month: "short", day: "numeric" }, "ko");
  const english = InvitationI18n.formatDateTime(stamp, { year: "numeric", month: "short", day: "numeric" }, "en");

  assert.match(korean, /2026/);
  assert.match(english, /2026/);
  assert.notEqual(korean, english);
  assert.equal(InvitationI18n.formatDateTime("nonsense", {}, "en"), null);
});

test("the content overlay translates every Korean leaf without touching structure", () => {
  const base = readJson("invitation-data.json");
  const overlay = readJson("assets/i18n/content-en.json");

  const untranslated = [];
  const checkInvitation = (invitation, translated, where) => {
    for (const field of ["title", "subtitle", "host", "location", "message"]) {
      if (HANGUL.test(invitation[field] || "") && !translated?.[field]) untranslated.push(`${where}.${field}`);
    }
    for (const item of invitation.items || []) {
      for (const [field, value] of Object.entries(item)) {
        if (field === "id" || field === "type" || typeof value !== "string") continue;
        if (HANGUL.test(value) && !translated?.items?.[item.id]?.[field]) {
          untranslated.push(`${where}.items.${item.id}.${field}`);
        }
      }
    }
  };

  for (const occasion of base.occasions) {
    if (HANGUL.test(occasion.name) && !overlay.occasions?.[occasion.id]) {
      untranslated.push(`occasions.${occasion.id}`);
    }
  }
  for (const template of base.templates) {
    const translated = overlay.templates?.[template.id];
    if (HANGUL.test(template.name) && !translated?.name) untranslated.push(`${template.id}.name`);
    if (HANGUL.test(template.note) && !translated?.note) untranslated.push(`${template.id}.note`);
    checkInvitation(template.defaults, translated?.defaults, template.id);
  }
  checkInvitation(base.defaultInvitation, overlay.defaultInvitation, "defaultInvitation");

  assert.deepEqual(untranslated, [], "sample content the English studio would still show in Korean");

  /* The overlay must carry copy only. Everything structural staying in the
     base file is what keeps ids, effects, fonts, times and coordinates
     identical across languages no matter how the translations drift.

     Note that "label" is structural on a course — MEET / CAFE / WALK are the
     decorative typography printed on the invitation — but is real copy on a
     link, where it reads "참석 회신" / "RSVP". So the allowlist is per item
     type rather than a flat list of field names. */
  const TRANSLATABLE = {
    invitation: ["title", "subtitle", "host", "location", "message"],
    course: ["place", "note"],
    notice: ["heading", "body"],
    profile: ["name", "role", "description"],
    link: ["label", "value"],
    photo: ["alt", "caption"]
  };

  const leaked = [];
  const checkOverlayInvitation = (invitation, translated, where) => {
    if (!translated) return;
    for (const field of Object.keys(translated)) {
      if (field === "items") continue;
      if (!TRANSLATABLE.invitation.includes(field)) leaked.push(`${where}.${field}`);
    }
    for (const [id, fields] of Object.entries(translated.items || {})) {
      const item = (invitation.items || []).find((candidate) => candidate.id === id);
      if (!item) {
        leaked.push(`${where}.items.${id} (no such item in the base data)`);
        continue;
      }
      for (const field of Object.keys(fields)) {
        if (!(TRANSLATABLE[item.type] || []).includes(field)) leaked.push(`${where}.items.${id}.${field}`);
      }
    }
  };

  for (const [id, translated] of Object.entries(overlay.templates || {})) {
    const template = base.templates.find((candidate) => candidate.id === id);
    assert.ok(template, `overlay names a template that does not exist: ${id}`);
    for (const field of Object.keys(translated)) {
      if (!["name", "note", "defaults"].includes(field)) leaked.push(`templates.${id}.${field}`);
    }
    checkOverlayInvitation(template.defaults, translated.defaults, `templates.${id}.defaults`);
  }
  checkOverlayInvitation(base.defaultInvitation, overlay.defaultInvitation, "defaultInvitation");

  assert.deepEqual(leaked, [], "structural fields must never appear in a translation overlay");
});

test("every sample invitation carries a language-neutral instant matching its designed label", () => {
  const base = readJson("invitation-data.json");
  const samples = [...base.templates.map((template) => [template.id, template.defaults]),
    ["defaultInvitation", base.defaultInvitation]];

  for (const [id, sample] of samples) {
    assert.ok(sample.dateTime, `${id} has no dateTime for Intl to format`);
    assert.match(sample.dateTime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    // The designed literal and the instant must agree, or the Korean studio
    // would start showing a different day than the file was written for.
    const [date, time] = sample.dateTime.split("T");
    const [year, month, day] = date.split("-");
    assert.equal(sample.dateLabel.slice(0, 10), `${year}.${month}.${day}`, `${id} dateLabel/dateTime disagree`);
    assert.ok(sample.dateLabel.endsWith(time.slice(0, 5)), `${id} dateLabel/dateTime time disagree`);
    assert.equal(
      new Date(`${sample.dateTime}Z`).toUTCString().slice(0, 3).toUpperCase(),
      sample.dateLabel.slice(11, 14),
      `${id} weekday disagrees with its own date`
    );
  }
});

test("a dateLabel the author typed is never reformatted by a language change", () => {
  const app = read("assets/studio/app.js");
  const localize = app.match(/const localizeSampleInvitation = [\s\S]*?\n\};/)?.[0] || "";

  assert.ok(localize, "localizeSampleInvitation must exist");
  // The only path that writes dateLabel is guarded by the presence of
  // dateTime, which exists only on generated samples — an invitation the
  // author has edited carries their dateLabel and no dateTime.
  assert.match(localize, /invitation\.dateTime && I18n\?\.formatSampleDate\(invitation\.dateTime\)/);
  assert.match(localize, /if \(sampleDate\) localized\.dateLabel = sampleDate/);
  assert.equal((localize.match(/localized\.dateLabel\s*=/g) || []).length, 1,
    "dateLabel must be written on exactly one guarded path");
  // normalizeInvitation returns an explicit shape, so dateTime never reaches
  // an exported invitation. Guard that it stays that way.
  const InvitationCore = require("../assets/invitation/core.js");
  assert.equal("dateTime" in InvitationCore.normalizeInvitation({ dateTime: "2026-09-12T14:00:00" }), false);
});

test("the studio's own copy never hard-codes a Korean sentence", () => {
  const app = read("assets/studio/app.js");
  const withoutComments = app
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  // The filename sanitiser keeps a Hangul character class on purpose: it is a
  // set of legal filename characters, not copy.
  const withoutSanitizer = withoutComments.replace(/\[\^\\w가-힣-\]\+/g, "");

  assert.doesNotMatch(withoutSanitizer, HANGUL, "Korean copy must live in dictionary-ko.js");
});
