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
   studio.html repeats the Korean copy inline (so the page renders correctly
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
    // The shared.html error eyebrows are decorative small-caps set in English
    // on Korean invitations too, matching the generated error pages. Same
    // reasoning as the INVITATION / DATE / PLACE words in the template art.
    "shared.notFoundEyebrow", "shared.goneEyebrow", "shared.failedEyebrow",
    // Pure interpolation: "{file}: {reason}" is punctuation around two values
    // that are themselves already in the reader's language.
    "content.photoFailed"
  ]);
  // Every generated error page carries the same kind of eyebrow, for the same
  // reason as the three above, so they are matched by shape rather than listed.
  const keepsEnglishInKorean = (key) => englishOnlyInKorean.has(key)
    || /^errorPages\.\d{3}\.eyebrow$/.test(key);

  const koreanSentences = leafKeys(dictionaryKo)
    .filter((key) => !keepsEnglishInKorean(key))
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

test("studio.html inline copy is exactly what the Korean dictionary says", () => {
  const index = read("studio.html");
  const bindings = [...index.matchAll(/<([a-z0-9]+)\b([^>]*\bdata-i18n="[^"]+"[^>]*)>([^<]*)</gi)];

  assert.ok(bindings.length > 60, "most of the page should be translatable");
  for (const [, , attributes, text] of bindings) {
    const key = parseTagAttributes(`<x ${attributes}>`)["data-i18n"];
    assert.equal(text, InvitationI18n.t(key, undefined, "ko"),
      `studio.html text for ${key} has drifted from dictionary-ko.js`);
  }
});

test("every data-i18n and data-i18n-attr binding in studio.html names a real key", () => {
  const index = read("studio.html");
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

test("studio.html serves the default language and lets the engine correct it", () => {
  const index = read("studio.html");

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

/* A generated sample date is a WALL CLOCK, not an instant: the ISO string
   carries no offset, so it is parsed as local time and then formatted in that
   same local zone. The two cancel, which is why these literals hold on a
   runner in any zone. That cancellation is the contract — it is what lets an
   author in Seoul and a reader in Los Angeles both see the hour that was
   typed — so it is asserted here rather than left as a coincidence the CI
   matrix would only report as a mystery failure. */
const assertParsesAsWallClock = (iso) => {
  const parsed = new Date(iso);
  const [date, time] = iso.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  assert.equal(parsed.getFullYear(), year, iso);
  assert.equal(parsed.getMonth() + 1, month, iso);
  assert.equal(parsed.getDate(), day, iso);
  assert.equal(parsed.getHours(), hour, iso);
  assert.equal(parsed.getMinutes(), minute, iso);
};

test("sample dates are built through Intl and differ per language", () => {
  const iso = "2026-09-12T14:00:00";
  assertParsesAsWallClock(iso);

  const korean = InvitationI18n.formatSampleDate(iso, "ko");
  // Named with its region so this assertion cannot depend on the region the
  // machine running the test happens to be set to.
  const english = InvitationI18n.formatSampleDate(iso, "en-US");

  assert.equal(korean, "2026.09.12 (토) 14:00");
  assert.equal(english, "Sat, Sep 12, 2026 · 2:00 PM");
  assert.notEqual(korean, english);
  // A 12-hour clock must not print a padded hour.
  assert.doesNotMatch(english, /\b0\d:\d\d/);
  assert.equal(InvitationI18n.formatSampleDate("not a date", "en"), "");

  // Compact enough for the single hero line the templates give it.
  for (const value of [korean, english]) assert.ok(value.length <= 30, `${value} is too long for a hero`);
});

test("English regional variants read day-first on a 24-hour clock", () => {
  const iso = "2026-12-19T17:00:00";
  // December, so a host zone east or west of the generator's would be the one
  // thing able to move this date across a year boundary. It cannot: see above.
  assertParsesAsWallClock(iso);

  assert.equal(InvitationI18n.formatSampleDate(iso, "en-GB"), "19 Dec 2026, 17:00");
  assert.equal(InvitationI18n.formatSampleDate(iso, "en-AU"), "19 Dec 2026, 17:00");
  assert.equal(InvitationI18n.formatSampleDate(iso, "en-US"), "Sat, Dec 19, 2026 · 5:00 PM");
  // A region we do not special-case falls back to the language's own format
  // rather than inventing one.
  assert.equal(InvitationI18n.formatSampleDate(iso, "en-XX"), InvitationI18n.formatSampleDate(iso, "en-US"));
  assert.ok(InvitationI18n.formatSampleDate(iso, "en-GB").length <= 30);
});

test("a region changes the date format without changing the language", () => {
  // The reader's region decides how a date reads; it never decides which
  // dictionary the chrome around it comes from.
  assert.equal(InvitationI18n.getDateLocale("en", { navigatorLanguages: ["en-GB", "en"] }), "en-GB");
  assert.equal(InvitationI18n.getDateLocale("en", { navigatorLanguages: ["en-US"] }), "en-US");
  assert.equal(InvitationI18n.getDateLocale("en", { navigatorLanguages: ["ko-KR"] }), "en-US");
  assert.equal(InvitationI18n.getDateLocale("ko", { navigatorLanguages: ["en-GB"] }), "ko-KR");
  // An explicit tag wins over whatever the browser prefers.
  assert.equal(InvitationI18n.getDateLocale("en-AU", { navigatorLanguages: ["en-GB"] }), "en-AU");

  assert.equal(InvitationI18n.normalizeLanguage("en-GB"), "en");
  assert.equal(InvitationI18n.t("editor.dateTime", undefined, "en-GB"), InvitationI18n.t("editor.dateTime", undefined, "en"));
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
  // Unlike a sample date this one IS an instant (it carries Z), so nothing
  // cancels: the calendar day it lands on is the reader's, and a loose /2026/
  // would have passed on the wrong year for a stamp near a year boundary read
  // from a negative offset. The zone is named so the whole string can be
  // asserted instead, which is also a stronger test of the per-language format.
  const stamp = "2026-09-12T05:00:00.000Z";
  const options = { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" };

  const korean = InvitationI18n.formatDateTime(stamp, options, "ko");
  const english = InvitationI18n.formatDateTime(stamp, options, "en");

  assert.equal(korean, "2026년 9월 12일");
  assert.equal(english, "Sep 12, 2026");
  assert.notEqual(korean, english);

  // Without a named zone the studio still renders the reader's own day, which
  // is the behaviour the library cards want; only the year is safe to pin.
  assert.match(InvitationI18n.formatDateTime(stamp, { year: "numeric" }, "ko"), /2026/);
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

/* The general rule: sample/default content must read as a finished, if
   generic, invitation — never as an instruction telling the author to fill
   in the very field they are looking at. Korean instructional verbs take the
   imperative/polite-request endings 입력하세요/적어 주세요/넣어 주세요/작성하세요
   and friends; English instructions open a sentence with an imperative verb
   (Add/Enter/Say/Write/Put/Type) or leave a bare "___ here" fill-in-the-blank
   with no closing punctuation ("Your name here", "Name here"). A sentence
   that merely contains "here" mid-thought ("the reason we are all here.")
   is real prose, not a placeholder, so only a trailing bare "here" counts. */
const KOREAN_INSTRUCTION = /(입력|적어|넣어|작성)(하세요|해 주세요|주세요)/;
const ENGLISH_SENTENCE_START = /^(Add|Enter|Say|Write|Put|Type)\b/i;
const ENGLISH_BARE_HERE = /(^|\s)here$/i;
const ENGLISH_NAME_HERE = /Your name here/i;

const readsAsInstruction = (value) => {
  if (typeof value !== "string") return false;
  if (KOREAN_INSTRUCTION.test(value)) return true;
  if (ENGLISH_NAME_HERE.test(value)) return true;
  if (ENGLISH_BARE_HERE.test(value.trim())) return true;
  return value.split(/(?<=[.!?])\s+/).some((sentence) => ENGLISH_SENTENCE_START.test(sentence.trim()));
};

test("no template default or overlay leaf ships an imperative placeholder as sample content", () => {
  /* Sample content is what a guest sees if the author never touches a field.
     "Add the cafe name" or "카페 이름을 입력하세요" read as an instruction left
     on the page, not an invitation. Every template default and its English
     overlay must instead read like a finished, if generic, invitation. This
     is scoped to invitation-data.json/content-en.json's sample content, not
     to real UI placeholders such as content.summary*, map.empty, or any
     *Placeholder key, which are legitimate empty-state hints, not content. */
  const base = readJson("invitation-data.json");
  const overlay = readJson("assets/i18n/content-en.json");

  const violations = [];
  const walk = (node, where) => {
    if (typeof node === "string") {
      if (readsAsInstruction(node)) violations.push(`${where}: "${node}"`);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${where}[${index}]`));
    } else if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) walk(value, `${where}.${key}`);
    }
  };

  for (const template of base.templates) walk(template.defaults, `invitation-data.json:templates.${template.id}.defaults`);
  walk(base.defaultInvitation, "invitation-data.json:defaultInvitation");
  for (const [id, translated] of Object.entries(overlay.templates || {})) {
    walk(translated.defaults, `content-en.json:templates.${id}.defaults`);
  }
  walk(overlay.defaultInvitation, "content-en.json:defaultInvitation");

  assert.deepEqual(violations, [], "sample content reads as an instruction to fill in the field, not as content");
});

test("every invitation.default* key in both dictionaries reads as a sample, not an instruction", () => {
  // These ship as real `title`/`location`/course `place`/`note` text on a
  // brand-new invitation (see createDefaultInvitation in
  // assets/invitation/core.js), so none of them may read as an instruction —
  // this covers defaultLocation as well as the four defaultCourse*Note hints
  // that used to tell the author what to type ("Say where to meet first.").
  for (const [name, dictionary] of [["dictionary-ko.js", dictionaryKo], ["dictionary-en.js", dictionaryEn]]) {
    const defaults = Object.entries(dictionary.invitation || {}).filter(([key]) => key.startsWith("default"));
    assert.ok(defaults.length > 0, `${name}: expected invitation.default* keys to check`);
    for (const [key, value] of defaults) {
      assert.ok(!readsAsInstruction(value), `${name}: invitation.${key} reads as an instruction: "${value}"`);
    }
  }
});

test("the English samples and defaults name no Korean-only place or phone format", () => {
  /* A-3: the English studio used to open on Hongdae, Cheongdam and
     010-0000-0000, which tells a reader outside Korea that the product is
     not for them before they have typed anything. English sample content is
     region-neutral instead ("Rooftop lounge", "Riverside park", "+1 555 010
     0000"); the Korean samples in invitation-data.json are untouched, and so
     are the Korean-tradition occasions' own names and dishes. */
  const overlay = read("assets/i18n/content-en.json");
  const englishDefaults = Object.entries(dictionaryEn.invitation || {})
    .filter(([key]) => key.startsWith("default"))
    .map(([, value]) => value)
    .join("\n");

  for (const term of ["Hongdae", "Cheongdam", "Hannam", "Seongsu", "Bukchon", "Euljiro", "Yeonnam", "Seochon", "Seoul", "Gangnam", "010-"]) {
    const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    assert.doesNotMatch(overlay, pattern, `content-en.json still names ${term}`);
    assert.doesNotMatch(englishDefaults, pattern, `the English invitation defaults still name ${term}`);
  }

  // The Korean samples are the original and stay exactly as designed.
  const korean = read("invitation-data.json");
  assert.match(korean, /성수역/);
  assert.match(korean, /010-0000-0000/);
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
  // The picker's instant now travels with the invitation, so the rule has to
  // hold one level deeper: a dateLabel wins over a dateTime at render time,
  // and it is printed byte-for-byte in every language.
  const InvitationCore = require("../assets/invitation/core.js");
  const typed = InvitationCore.normalizeInvitation({
    dateTime: "2026-09-12T14:00:00",
    dateLabel: "the last Saturday of summer"
  });
  assert.equal(typed.dateTime, "2026-09-12T14:00");
  assert.equal(typed.dateLabel, "the last Saturday of summer");
  for (const language of ["ko", "en"]) {
    const body = InvitationCore.renderInvitationBody(typed, { language });
    assert.match(body, /the last Saturday of summer/);
    assert.doesNotMatch(body, /Sep 12|09\.12/, `${language} reformatted a label the author typed`);
  }
});

test("the studio's own copy never hard-codes a Korean sentence", () => {
  // The filename sanitiser needs a Hangul character class — a set of legal
  // filename characters, not copy — and spells it \uac00-\ud7a3 so this check
  // needs no exemption for it.
  const app = read("assets/studio/app.js")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  assert.doesNotMatch(app, HANGUL, "Korean copy must live in dictionary-ko.js");
});

const withoutComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

test("no surface outside the dictionaries hard-codes a Korean sentence", () => {
  /* The same rule the studio has always been held to, now applied to every
     other surface that speaks — assets/invitation/core.js included. Its blank
     invitation used to be exempt as sample CONTENT rather than chrome; it now
     names invitation.default* keys and is resolved per language, so there is
     nothing left to exempt. tests/i18n-hardening.test.js covers the same
     ground for the modules that raise errors. */
  const surfaces = [
    "assets/publishing/publishing.js",
    "assets/publishing/shared-invitation.js",
    "assets/invitation/viewer.js",
    "assets/invitation/core.js",
    "admin/public/admin.js"
  ];

  for (const surface of surfaces) {
    assert.doesNotMatch(withoutComments(read(surface)), HANGUL,
      `${surface} must read its copy from a dictionary`);
  }
});

test("shared.html and viewer.html inline copy is exactly what the Korean dictionary says", () => {
  for (const page of ["shared.html", "viewer.html"]) {
    const markup = read(page);
    const bindings = [...markup.matchAll(/<([a-z0-9]+)\b([^>]*\bdata-i18n="[^"]+"[^>]*)>([^<]*)</gi)];
    assert.ok(bindings.length >= 3, `${page} should bind its chrome`);

    for (const [, , attributes, text] of bindings) {
      const key = parseTagAttributes(`<x ${attributes}>`)["data-i18n"];
      assert.equal(text, InvitationI18n.t(key, undefined, "ko"),
        `${page} text for ${key} has drifted from dictionary-ko.js`);
    }

    const keys = [
      ...[...markup.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]),
      ...[...markup.matchAll(/data-i18n-attr="([^"]+)"/g)]
        .flatMap((match) => match[1].split(";"))
        .map((pair) => pair.split(":")[1]),
      ...[...markup.matchAll(/data-i18n-title="([^"]+)"/g)].map((match) => match[1])
    ].filter(Boolean).map((key) => key.trim());

    for (const key of keys) {
      for (const language of InvitationI18n.SUPPORTED) {
        assert.equal(InvitationI18n.hasKey(key, language), true, `${language} has no ${key}`);
      }
    }

    // The engine has to run before the body so <html lang> and the tab title
    // are right for the first paint.
    const i18nAt = markup.indexOf("i18n/i18n.js");
    const koAt = markup.indexOf("i18n/dictionary-ko.js");
    const enAt = markup.indexOf("i18n/dictionary-en.js");
    const initAt = markup.indexOf("InvitationI18n.init()");
    assert.ok(i18nAt > 0 && i18nAt < koAt && koAt < enAt && enAt < initAt && initAt < markup.indexOf("<body"),
      `${page} must resolve its language in <head>`);
  }
});

test("every page that resolves a language in <head> also applies it to the body", () => {
  /* init() runs before the body is parsed, so <html lang> and the tab title
     are right for the first paint but no bound node in the body has been
     touched yet. Each page needs a second pass, or an English reader gets an
     English panel sitting on a Korean footer. */
  assert.match(read("assets/studio/app.js"), /I18n\.applyDom\(document\)/);
  assert.match(read("assets/publishing/shared-invitation.js"), /I18n\?\.applyDom\?\.\(root\.document\)/);
  assert.match(read("assets/invitation/viewer.js"), /InvitationI18n\?\.applyDom\?\.\(globalThis\.document\)/);
  assert.match(read("admin/public/admin.js"), /I18n\.applyDom\(document\)/);

  for (const page of ["shared.html", "viewer.html", "admin/public/index.html"]) {
    assert.ok(read(page).includes("data-i18n"), `${page} has nothing bound to apply`);
  }
});

test("a page can name its own tab title instead of borrowing the studio's", () => {
  // Three different things in a tab strip: the studio, a guest's invitation,
  // the operator console. One shared meta.title would be wrong on two of them.
  assert.match(read("shared.html"), /<html lang="ko" data-i18n-title="shared\.documentTitle">/);
  assert.match(read("viewer.html"), /<html lang="ko" data-i18n-title="viewer\.documentTitle">/);
  assert.doesNotMatch(read("studio.html"), /data-i18n-title/, "the studio keeps the default meta.title");

  const titled = (key) => {
    const documentElement = {
      attributes: {},
      getAttribute: (name) => (name === "data-i18n-title" ? key : null),
      setAttribute(name, value) { this.attributes[name] = value; }
    };
    const fakeDocument = { documentElement, title: "", querySelectorAll: () => [] };
    const previousDocument = globalThis.document;
    globalThis.document = fakeDocument;
    try {
      InvitationI18n.syncDocumentLanguage("en");
      return fakeDocument.title;
    } finally {
      globalThis.document = previousDocument;
      InvitationI18n.setLanguage("ko", { persist: false });
    }
  };

  assert.equal(titled("shared.documentTitle"), InvitationI18n.t("shared.documentTitle", undefined, "en"));
  assert.equal(titled(null), InvitationI18n.t("meta.title", undefined, "en"));
  // A page naming a key that does not exist keeps whatever title it served
  // rather than rendering the key into the tab strip.
  assert.equal(titled("nope.not.here"), "");
});

test("an invitation's baked chrome follows the language it was built in, not the reader's", () => {
  const InvitationCore = require("../assets/invitation/core.js");
  const invitation = {
    title: "서울숲 저녁 초대",
    introEffect: "fireworks",
    items: [
      { id: "notice-1", type: "notice", heading: "주차 안내", body: "지하 2층" },
      { id: "course-1", type: "course", time: "18:00", place: "서울숲", mapUrl: "https://map.naver.com/" }
    ]
  };

  const korean = InvitationCore.buildStandaloneHtml(invitation, { language: "ko" });
  const english = InvitationCore.buildStandaloneHtml(invitation, { language: "en" });

  // The chrome differs...
  assert.match(korean, /<html lang="ko">/);
  assert.match(english, /<html lang="en">/);
  for (const key of ["invitation.noticeEyebrow", "invitation.openMap", "invitation.skipIntro"]) {
    assert.ok(korean.includes(InvitationI18n.t(key, undefined, "ko")), `ko is missing ${key}`);
    assert.ok(english.includes(InvitationI18n.t(key, undefined, "en")), `en is missing ${key}`);
  }
  assert.doesNotMatch(english, /안내<\/p>/, "the English export still carries a Korean eyebrow");

  // ...while every word the AUTHOR typed is identical in both.
  for (const authored of ["서울숲 저녁 초대", "주차 안내", "지하 2층", "서울숲"]) {
    assert.ok(korean.includes(authored), `ko dropped ${authored}`);
    assert.ok(english.includes(authored), `the English export must not translate ${authored}`);
  }

  // No caller, no opinion: the product's home language, never whatever the
  // switcher was last set to.
  InvitationI18n.setLanguage("en", { persist: false });
  try {
    assert.match(InvitationCore.buildStandaloneHtml(invitation), /<html lang="ko">/,
      "an unspecified render must not follow the active language");
  } finally {
    InvitationI18n.setLanguage("ko", { persist: false });
  }

  // And the file says what it was built in, so a rebuild can reproduce it.
  assert.equal(InvitationCore.readStandaloneLanguage(english), "en");
  assert.equal(InvitationCore.readStandaloneLanguage(korean), "ko");
  // Files exported before <html lang> varied carry "ko", which is what they
  // were in fact built in, so they round-trip correctly too.
  assert.equal(InvitationCore.readStandaloneLanguage('<html lang="ko">'), "ko");
  assert.equal(InvitationCore.readStandaloneLanguage("<html>"), "ko");
  assert.equal(InvitationCore.readStandaloneLanguage('<html lang="de">'), "ko");
});

test("the studio bakes its own language into exports but never re-languages a finished file", () => {
  const app = read("assets/studio/app.js");

  // What the author is making now follows the studio.
  assert.match(app, /const studioChrome = \(\) => \(\{ language: I18n\?\.getLanguage\?\.\(\) \}\)/);
  for (const site of [
    /downloadHtml/, /makeSavedItem\(html, invitation\.title, "generated"\)/
  ]) assert.match(app, site);
  // portableOptions only adds the inlined artwork a kept file needs; the
  // language it passes through is still the studio's.
  assert.equal((app.match(/buildStandaloneHtml\(invitation, await portableOptions\(invitation, studioChrome\(\)\)\)/g) || []).length, 2,
    "the download and the library save both bake the studio's language");

  // What already exists is rebuilt in the language it declares.
  assert.match(app, /const standaloneOptionsFor = \(html\) => \(\{[\s\S]*?readStandaloneLanguage/);
  assert.equal((app.match(/await portableOptions\(invitation, standaloneOptionsFor\(html\)\)/g) || []).length, 1,
    "a re-imported file keeps its own language");
  assert.match(app, /await portableOptions\(invitation, standaloneOptionsFor\(legacyItem\.html\)\)/,
    "a migrated legacy record keeps its own language");

  // No call site may fall back to the bare one-argument form again.
  assert.doesNotMatch(app, /buildStandaloneHtml\(invitation\)/);
});

test("a guest's page chrome and the invitation they were sent are separate languages", () => {
  const shared = read("assets/publishing/shared-invitation.js");

  /* The decision this file exists to hold: the panels around the invitation
     follow the GUEST, because a guest made no choice in the studio and on the
     not-found path there is no author to defer to. The invitation inside the
     frame does not follow them, because it is somebody else's document. */
  assert.match(shared, /const pageLanguage = \(override\) =>[\s\S]*?I18n\?\.getLanguage\?\.\(\)/,
    "page chrome must resolve to the reader's own language");
  assert.match(shared, /const FRAME_LANGUAGE = I18n\?\.DEFAULT_LANGUAGE \|\| "ko"/,
    "the frame must not follow the reader");
  assert.doesNotMatch(shared, /renderFrame\([^)]*pageLanguage/,
    "rendering a stranger's invitation in the reader's language is the bug this file guards against");

  // Every panel the guest can be shown resolves in their language.
  for (const kind of ["notFound", "gone", "failed"]) {
    for (const part of ["Eyebrow", "Title", "Description", "Hint"]) {
      for (const language of InvitationI18n.SUPPORTED) {
        assert.equal(InvitationI18n.hasKey(`shared.${kind}${part}`, language), true,
          `${language} has no shared.${kind}${part}`);
      }
    }
  }
});
