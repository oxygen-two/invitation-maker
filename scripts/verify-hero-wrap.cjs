/* Proves the one thing an invitation title must never do: break inside a word.

   Two places print the author's title — the hero inside the card, and the
   intro overlay that covers it on arrival — and both are checked here, because
   both had the same defect for the same reason and a fix to one says nothing
   about the other.

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

/* Two renders per design. The hero is measured with the intro switched off,
   so what is measured is the card and not the curtain painted over it; the
   overlay is measured with an intro switched on, since it does not exist
   otherwise. Every effect puts the title in the same .intro-copy box, so
   rotating the effect by design index covers all eight of them across the
   catalogue without multiplying the run. */
const INTRO_EFFECTS = ["envelope", "card-shrink", "dawn", "fireworks", "curtain", "petals", "spotlight", "photo-focus"];

const sampleFor = (template, language, introEffect) => ({
  ...localize(template.defaults, language === "en" ? overlayFor(template.id) : null),
  templateId: template.id,
  layoutFamily: template.familyId,
  introEffect
});

// Every title an author can be carrying when they pick a design, deduplicated.
const TITLES = [...new Set(data.templates.flatMap((template) => [
  template.defaults.title,
  overlayFor(template.id)?.title || template.defaults.title
]))];

/* Mirrors titleScript() in assets/invitation/template-renderers.js and
   assets/invitation/intro-effects.js, so a probed title carries the same
   marker the renderer would have written for it. */
const titleScript = (title) => /[\u3131-\u318e\uac00-\ud7a3]/.test(title) ? "ko" : "en";

/* The pairing that the document's language used to get wrong, and the reason
   this matrix crosses the two axes rather than testing each language against
   its own titles. An exported invitation is `lang="ko"` unless it was built in
   English, so a Latin title in a Korean document is the common case, not the
   exotic one — and while the fallback was gated on `:lang(ko)` that case was
   the one where `anywhere` could cut a Latin word. The mirror case, a Korean
   title in an `en` document, got no fallback at all. */
const CROSS_SCRIPT = (language, title) => titleScript(title) !== (language === "en" ? "en" : "ko");

/* Runs in the page. Swaps each candidate title into the live title element —
   the font, the container-relative size, the max-width and the text-transform
   all stay exactly as the design renders them — and reports the words that did
   not survive. */
const probeTitles = ({ selector, titles }) => {
  const h1 = document.querySelector(selector);
  if (!h1) return { error: `no title at ${selector}` };

  const hangul = /[\u3131-\u318e\uac00-\ud7a3]/;
  const results = [];
  let widest = 0;

  for (const title of titles) {
    h1.textContent = title;
    // Every title carries a marker now, naming the script it is written in.
    h1.setAttribute("data-title-script", hangul.test(title) ? "ko" : "en");

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

  /* What the two scripts actually resolve to in this document. The Korean
     fallback must reach a Korean title and must not reach a Latin one, and
     that has to hold in a `ko` document and an `en` one alike. */
  const wrapByScript = {};
  for (const script of ["ko", "en"]) {
    h1.setAttribute("data-title-script", script);
    const resolved = getComputedStyle(h1);
    wrapByScript[script] = `${resolved.wordBreak}/${resolved.overflowWrap}`;
  }

  const style = getComputedStyle(h1);
  return {
    results,
    wrapByScript,
    widest: Math.round(widest),
    fontSize: Math.round(parseFloat(style.fontSize) * 10) / 10,
    boxWidth: Math.round(h1.clientWidth)
  };
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const failures = [];
  const contracts = new Set();
  let probes = 0;
  let crossScript = 0;

  try {
    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      for (const language of ["ko", "en"]) {
        for (const [index, template] of data.templates.entries()) {
          const surfaces = [
            { name: "hero", selector: ".invite-hero h1", introEffect: "none" },
            { name: "intro", selector: ".intro-copy h1", introEffect: INTRO_EFFECTS[index % INTRO_EFFECTS.length] }
          ];

          for (const surface of surfaces) {
            await page.setContent(
              core.buildStandaloneHtml(sampleFor(template, language, surface.introEffect), { language }),
              { waitUntil: "load" }
            );
            // The designs are drawn in specific faces. Measuring fallback
            // metrics would measure a document nobody receives.
            await page.evaluate(() => window.document.fonts.ready);
            const result = await page.evaluate(probeTitles, { selector: surface.selector, titles: TITLES });
            probes += TITLES.length;
            crossScript += TITLES.filter((title) => CROSS_SCRIPT(language, title)).length;

            const label = `${surface.name}/${template.id}/${language}/${width}`;
            if (result.error) {
              failures.push(`${label}: ${result.error}`);
              continue;
            }
            for (const [script, wrap] of Object.entries(result.wrapByScript)) {
              contracts.add(`${surface.name} ${script}-title in ${language} doc: ${wrap}`);
            }
            for (const { title, broken } of result.results) {
              failures.push(`${label}: "${title}" -> ${broken.join(", ")} at ${result.fontSize}px in ${result.boxWidth}px`);
            }
            if (process.env.HERO_WRAP_MATRIX) {
              process.stdout.write([
                surface.name.padEnd(5),
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
      }
      await page.close();
      process.stderr.write(`measured ${width}px\n`);
    }
  } finally {
    await browser.close();
  }

  for (const failure of failures) console.error(`FAIL ${failure}`);
  for (const line of [...contracts].sort()) console.error(`computed wrapping: ${line}`);
  console.error(`cross-script probes (Latin title in a ko document, or Korean title in an en one): ${crossScript}`);
  assert.deepEqual(
    failures.map((line) => line.split(": ")[0]),
    [],
    `${failures.length} titles break inside a word`
  );
  console.log(`PASS ${probes} title probes across hero+intro x ${data.templates.length} designs x ${TITLES.length} titles x ko/en x ${WIDTHS.join(", ")}px: no word cut or spilled`);
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
