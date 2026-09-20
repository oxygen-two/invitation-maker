const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const dictionaryKo = require("../assets/i18n/dictionary-ko.js");
const dictionaryEn = require("../assets/i18n/dictionary-en.js");
const { pages, renderPage } = require("../scripts/build-error-pages.cjs");

const root = path.resolve(__dirname, "..");
const generator = path.join(root, "scripts/build-error-pages.cjs");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const STATUSES = [400, 401, 403, 404, 408, 410, 429, 500, 502, 503, 504];
const RELOADABLE = [408, 429, 500, 502, 503, 504];
const dictionaries = { ko: dictionaryKo, en: dictionaryEn };

const documents = new Map(STATUSES.map((code) => [code, read(`${code}.html`)]));

/* These pages are unusual in this codebase: they are checked-in build output,
   and they are the only documents a visitor can reach while every other asset
   of the site is unavailable. That combination is what the tests below guard.

   Nothing may be fetched — not the i18n engine, not a dictionary, not a font —
   so both languages have to travel inside the document itself. Korean is what
   the server sends, because a visitor with JavaScript off still deserves a
   sentence rather than a blank. The inline resolver then reads the same
   signals assets/i18n/i18n.js reads and, for an English reader, swaps the
   copy in. Copy itself lives in the dictionaries; the generator inlines it. */

const copyBlockOf = (html) => {
  const match = html.match(/<script type="application\/json" data-error-copy>([\s\S]*?)<\/script>/);
  assert.ok(match, "the page must carry an inline copy block");
  return JSON.parse(match[1]);
};

test("the dictionaries carry the whole error-page namespace in both languages", () => {
  for (const [language, dictionary] of Object.entries(dictionaries)) {
    const namespace = dictionary.errorPages;
    assert.ok(namespace, `${language} has no errorPages namespace`);

    for (const key of ["skipToContent", "brandHome", "headerNote", "footerNote", "offline", "reloadHint"]) {
      assert.equal(typeof namespace.common?.[key], "string", `${language}: errorPages.common.${key}`);
      assert.ok(namespace.common[key].trim().length > 0, `${language}: errorPages.common.${key} is blank`);
    }

    for (const code of STATUSES) {
      const entry = namespace[code];
      assert.ok(entry, `${language} has no errorPages.${code}`);
      for (const key of ["eyebrow", "title", "description", "hint", "action"]) {
        assert.equal(typeof entry[key], "string", `${language}: errorPages.${code}.${key}`);
        assert.ok(entry[key].trim().length > 0, `${language}: errorPages.${code}.${key} is blank`);
      }
      // Only the temporary failures offer a reload, so only they name one.
      assert.equal("reload" in entry, RELOADABLE.includes(code), `${language}: errorPages.${code}.reload`);
    }
  }
});

test("the generator takes its copy from the dictionaries, not from itself", () => {
  const source = read("scripts/build-error-pages.cjs");
  assert.match(source, /require\(.*dictionary-ko\.js.*\)/, "ko dictionary must be required");
  assert.match(source, /require\(.*dictionary-en\.js.*\)/, "en dictionary must be required");

  // A Korean sentence inside the generator would mean a second home for copy,
  // and the two homes would drift. tests/i18n-hardening.test.js makes the same
  // demand of the studio's JavaScript.
  assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, ""), /[가-힣]/, "Korean literal in the generator");
});

test("every page is served in Korean so a visitor without JavaScript still reads a sentence", () => {
  for (const code of STATUSES) {
    const html = documents.get(code);
    const korean = dictionaryKo.errorPages[code];

    assert.match(html, /<html lang="ko"/, `${code}: served language`);
    assert.ok(html.includes(korean.title), `${code}: Korean title`);
    assert.ok(html.includes(korean.description), `${code}: Korean description`);
    assert.ok(html.includes(korean.hint), `${code}: Korean hint`);
    assert.ok(html.includes(korean.action), `${code}: Korean primary action`);
    assert.ok(html.includes(dictionaryKo.errorPages.common.skipToContent), `${code}: Korean skip link`);
  }
});

test("both languages' copy travels inside every page", () => {
  for (const code of STATUSES) {
    const copy = copyBlockOf(documents.get(code));
    assert.deepEqual(Object.keys(copy).sort(), ["en", "ko"], `${code}: languages in the copy block`);

    for (const [language, dictionary] of Object.entries(dictionaries)) {
      const entry = dictionary.errorPages[code];
      assert.equal(copy[language].title, entry.title, `${code}: ${language} title`);
      assert.equal(copy[language].description, entry.description, `${code}: ${language} description`);
      assert.equal(copy[language].eyebrow, entry.eyebrow, `${code}: ${language} eyebrow`);
      assert.equal(copy[language].hint, entry.hint, `${code}: ${language} hint`);
      assert.equal(copy[language].action, entry.action, `${code}: ${language} action`);
      assert.equal(copy[language].offline, dictionary.errorPages.common.offline, `${code}: ${language} offline`);
    }

    // The English title is the thing an English reader will actually see, so
    // assert it reached the document and not merely the dictionary.
    assert.ok(documents.get(code).includes(dictionaryEn.errorPages[code].title), `${code}: English title in the page`);
    assert.equal("reload" in copy.ko, RELOADABLE.includes(code), `${code}: reload label only where a button exists`);
  }
});

test("the boot script resolves the language the way the studio does", () => {
  for (const code of STATUSES) {
    const html = documents.get(code);
    const boot = html.match(/<script data-error-lang>([\s\S]*?)<\/script>/);
    assert.ok(boot, `${code}: the data-error-lang boot script is missing`);

    const source = boot[1];
    assert.match(source, /["']lang["']/, `${code}: ?lang is not read`);
    assert.match(source, /invitation-maker\.language/, `${code}: the stored choice is not read`);
    assert.match(source, /navigator\.languages/, `${code}: the browser preference is not read`);
    assert.match(source, /"ko"/, `${code}: Korean is not the fallback`);
    assert.match(source, /documentElement\.lang\s*=/, `${code}: <html lang> is never updated`);

    // Reading a preference is fine; remembering one from an error page is not.
    assert.doesNotMatch(html, /setItem/, `${code}: an error page must never write storage`);
    // The query string is read for one allow-listed value and never echoed back.
    assert.doesNotMatch(html, /document\.write|innerHTML/, `${code}: no markup is built from input`);
  }
});

test("nothing on an error page is fetched from anywhere", () => {
  for (const code of STATUSES) {
    const html = documents.get(code);

    assert.doesNotMatch(html, /<script[^>]+\ssrc=/, `${code}: external script`);
    assert.doesNotMatch(html, /<img\b/, `${code}: image request`);
    assert.doesNotMatch(html, /@import/, `${code}: imported stylesheet`);
    assert.doesNotMatch(html, /\bfetch\(|XMLHttpRequest|navigator\.sendBeacon/, `${code}: network call`);

    for (const [, value] of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
      assert.ok(/^(?:data:|#|\/$|\/[^/])/.test(value), `${code}: ${value} leaves the document`);
    }
    for (const [, value] of html.matchAll(/<link\b[^>]*\shref="([^"]*)"/g)) {
      assert.match(value, /^data:/, `${code}: <link> to an external asset`);
    }
  }
});

test("only the temporary failures offer a reload, in whichever language won", () => {
  for (const code of STATUSES) {
    const html = documents.get(code);
    const expected = RELOADABLE.includes(code);

    assert.equal(/<button [^>]*data-retry/.test(html), expected, `${code}: reload button`);
    if (!expected) continue;

    assert.ok(html.includes(dictionaryKo.errorPages[code].reload), `${code}: Korean reload label`);
    assert.ok(html.includes(dictionaryEn.errorPages[code].reload), `${code}: English reload label`);
    assert.ok(html.includes(dictionaryKo.errorPages.common.reloadHint), `${code}: no-JS reload hint`);
    assert.match(html, /location\.reload\(\)/, `${code}: the reload is user-triggered`);
    assert.doesNotMatch(html, /setInterval|setTimeout/, `${code}: never auto-reload`);
  }
});

test("the offline notice is an empty live region the boot script writes into", () => {
  for (const code of STATUSES) {
    const html = documents.get(code);
    const notice = html.match(/<p class="offline"[^>]*>([\s\S]*?)<\/p>/);
    assert.ok(notice, `${code}: the offline notice is missing`);

    // A role="status" region only announces content that appears in it while
    // it is being observed. Shipping the sentence in the markup and revealing
    // it by clearing `hidden` changes nothing the screen reader is watching,
    // so the notice must arrive empty and be written to.
    assert.equal(notice[1], "", `${code}: the offline notice ships pre-filled`);
    assert.match(notice[0], /role="status"/, `${code}: the offline notice is not a live region`);
    assert.doesNotMatch(notice[0], /\bhidden\b/, `${code}: the offline notice is hidden rather than empty`);
    assert.doesNotMatch(notice[0], /data-error-text/, `${code}: the boot copy pass would pre-fill the notice`);

    // Empty is invisible without `hidden`, and both languages' sentences still
    // travel in the copy block for the boot script to choose from.
    assert.match(html, /\.offline:empty\{display:none\}/, `${code}: an empty notice would leave a gap`);
    assert.match(html, /offline\.textContent = navigator\.onLine === false \? copy\.offline : ''/,
      `${code}: going offline must write the sentence in`);
    assert.ok(html.includes(dictionaryKo.errorPages.common.offline), `${code}: Korean offline sentence`);
    assert.ok(html.includes(dictionaryEn.errorPages.common.offline), `${code}: English offline sentence`);
  }
});

test("the pages keep their illustration, palette, 48px actions and safe-area footer", () => {
  for (const code of STATUSES) {
    const html = documents.get(code);
    assert.match(html, /class="envelope"/, `${code}: envelope illustration`);
    assert.match(html, /--paper:#f7f7f4/, `${code}: paper`);
    assert.match(html, /--green:#314e41/, `${code}: accent`);
    assert.match(html, /min-height:48px/, `${code}: 48px actions`);
    assert.match(html, /env\(safe-area-inset-bottom\)/, `${code}: safe-area footer`);
    assert.match(html, /data-error-code>\s*\d{3}/, `${code}: status number`);
  }
});

test("the pages answer a dark colour scheme instead of glowing white", () => {
  for (const code of STATUSES) {
    const html = documents.get(code);
    assert.match(html, /@media\(prefers-color-scheme:dark\)/, `${code}: dark palette`);
    assert.match(html, /color-scheme:dark/, `${code}: dark form controls`);
    assert.match(
      html,
      /<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: dark\)">/,
      `${code}: dark theme-color`
    );
  }
});

test("the committed pages are exactly what the generator produces", () => {
  for (const page of pages) assert.equal(documents.get(page.code), renderPage(page), `${page.code}.html is stale`);

  // CI runs the generator and then `git diff --exit-code`, so --check failing
  // here is the same failure arriving a few minutes earlier.
  const output = execFileSync(process.execPath, [generator, "--check"], { encoding: "utf8" });
  assert.match(output, /Verified 11 standalone error pages/);
});
