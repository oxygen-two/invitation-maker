/* Proves the one thing a hero title must never do: break inside a word.

   A reviewer can read `word-break:keep-all` in the stylesheet and believe the
   job is done. Only a browser knows whether "BIRTHDAY!" actually fitted on the
   line it was given, so this script asks the layout engine directly: does any
   single word of a title occupy more than one line box, or spill past its own
   box? A whole word's Range spans exactly one line box; two means the engine
   gave up and split it.

   Why the cross product of every design and every sample title, rather than
   each design with its own title: the studio hands a design switch the
   author's existing words. PresetApplication.prepare takes the design's fonts
   and layout but keeps the content, which is how "HAPPY BIRTHDAY!" — Color
   Pop's sample — ends up set in Cherry Muse's 72px Playfair at weight 900.
   Every design must therefore survive every title, and the design's own fonts
   must be the ones measured, because a switch adopts them.

   The widths span phone to desktop because the failure is not simply "narrow".
   The card stops growing at 430px while `vw` keeps climbing, so the worst ratio
   of type size to box arrives at 520px and above, not at 320px.

   Run: PLAYWRIGHT_MODULE=/path/to/playwright node scripts/verify-hero-wrap.cjs
   HERO_WRAP_MATRIX=1 prints the full per-design measurement table. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const root = path.join(__dirname, "..");
const core = require(path.join(root, "assets/invitation/core.js"));
const data = require(path.join(root, "invitation-data.json"));
const overlayEn = require(path.join(root, "assets/i18n/content-en.json"));

const WIDTHS = [320, 360, 390, 414, 430, 465, 480, 520, 600, 768, 1024, 1440];

/* The same overlay merge the studio performs (localizeSampleInvitation in
   assets/studio/app.js): translatable leaves only, keyed by id. */
const localize = (defaults, overlay) => {
  const localized = { ...defaults };
  for (const field of ["title", "subtitle", "host", "location", "message"]) {
    if (overlay?.[field]) localized[field] = overlay[field];
  }
  return localized;
};

const overlayFor = (id) => overlayEn.templates?.[id]?.defaults;

const sampleFor = (template, language) => ({
  ...localize(template.defaults, language === "en" ? overlayFor(template.id) : null),
  templateId: template.id,
  layoutFamily: template.familyId,
  // The intro curtain reprints the title over the card; switching it off
  // measures the hero itself rather than what is painted on top of it.
  introEffect: "none"
});

// Every title an author can be carrying when they pick a design, deduplicated.
const TITLES = [...new Set(data.templates.flatMap((template) => [
  template.defaults.title,
  overlayFor(template.id)?.title || template.defaults.title
]))];

// Mirrors the renderer's rule in assets/invitation/template-renderers.js, so a
// probed title carries the same script marker the renderer would have written.
const SCRIPT_MARKED_DESIGNS = ["bloom-portrait", "signature-birthday", "cherry-muse", "peach-table"];

/* Runs in the page. Swaps each candidate title into the live hero — the font,
   the clamped size, the max-width and the text-transform all stay exactly as
   the design renders them — and reports the words that did not survive. */
const probeTitles = ({ titles, scriptMarked }) => {
  const h1 = document.querySelector(".invite-hero h1");
  if (!h1) return { error: "no hero title" };

  const hangul = /[\u3131-\u318e\uac00-\ud7a3]/;
  const results = [];
  let widest = 0;

  for (const title of titles) {
    h1.textContent = title;
    if (scriptMarked && hangul.test(title)) h1.setAttribute("data-title-script", "ko");
    else h1.removeAttribute("data-title-script");

    const style = getComputedStyle(h1);
    const available = h1.clientWidth
      - parseFloat(style.paddingLeft || 0)
      - parseFloat(style.paddingRight || 0);

    const broken = [];
    const node = h1.firstChild;
    for (const match of title.matchAll(/\S+/g)) {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
      // Rounding the top edge keeps sub-pixel baseline jitter from reading as
      // a second line; a genuine second line is a whole line-height away.
      const lines = new Set(rects.map((rect) => Math.round(rect.top))).size;
      const width = rects.length ? Math.max(...rects.map((rect) => rect.width)) : 0;
      widest = Math.max(widest, width);
      // Two line boxes means the word was cut. A word wider than the box it
      // was given was not cut only because `overflow-wrap:normal` let it
      // spill instead — the same bug wearing a different hat.
      if (lines > 1) broken.push(`${match[0]} (cut)`);
      else if (width > available + 1) broken.push(`${match[0]} (spills ${Math.round(width - available)}px)`);
      range.detach();
    }
    if (broken.length) results.push({ title, broken });
  }

  const style = getComputedStyle(h1);
  return {
    results,
    widest: Math.round(widest),
    fontSize: Math.round(parseFloat(style.fontSize) * 10) / 10,
    boxWidth: Math.round(h1.clientWidth),
    wordBreak: style.wordBreak,
    overflowWrap: style.overflowWrap
  };
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const failures = [];
  const contracts = new Set();
  let probes = 0;

  try {
    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      for (const language of ["ko", "en"]) {
        for (const template of data.templates) {
          await page.setContent(
            core.buildStandaloneHtml(sampleFor(template, language), { language }),
            { waitUntil: "load" }
          );
          // The designs are drawn in specific faces. Measuring fallback
          // metrics would measure a document nobody receives.
          await page.evaluate(() => window.document.fonts.ready);
          const result = await page.evaluate(probeTitles, { titles: TITLES, scriptMarked: SCRIPT_MARKED_DESIGNS.includes(template.id) });
          probes += TITLES.length;

          const label = `${template.id}/${language}/${width}`;
          if (result.error) {
            failures.push(`${label}: ${result.error}`);
            continue;
          }
          contracts.add(`${result.wordBreak} + ${result.overflowWrap}`);
          for (const { title, broken } of result.results) {
            failures.push(`${label}: "${title}" -> ${broken.join(", ")} at ${result.fontSize}px in ${result.boxWidth}px`);
          }
          if (process.env.HERO_WRAP_MATRIX) {
            process.stdout.write([
              template.id.padEnd(19),
              language,
              String(width).padStart(5),
              `${String(result.fontSize).padStart(5)}px`,
              `box ${String(result.boxWidth).padStart(4)}`,
              `widest ${String(result.widest).padStart(4)}`,
              result.results.length ? `BREAKS ${result.results.length}` : "ok"
            ].join("  ") + "\n");
          }
        }
      }
      await page.close();
      process.stderr.write(`measured ${width}px\n`);
    }
  } finally {
    await browser.close();
  }

  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`computed title wrapping: ${[...contracts].join(" / ")}`);
  assert.deepEqual(
    failures.map((line) => line.split(": ")[0]),
    [],
    `${failures.length} hero titles break inside a word`
  );
  console.log(`PASS ${probes} title probes across ${data.templates.length} designs x ${TITLES.length} titles x ko/en x ${WIDTHS.join(", ")}px: no word cut or spilled`);
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
