// Renders the landing/guide images and sample.html from the real studio, so
// the landing shows exactly what the studio produces — in both site languages,
// because the studio is translated and a photograph of it therefore is too.
// Same conventions as
// build-social-preview.cjs and verify-studio.cjs: Playwright is located via
// PLAYWRIGHT_MODULE, Chrome is the channel, outputs are checked in.
//
//   npm start   (in another terminal)
//   PLAYWRIGHT_MODULE=/abs/path/to/playwright node scripts/build-site-media.cjs
//   node scripts/build-site-media.cjs --check   # outputs exist and are non-empty
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mediaDir = path.join(root, "assets", "media", "site");
const baseUrl = process.env.INVITATION_BASE_URL || "http://localhost:4173";
// occasionId per template, verified against invitation-data.json (each
// template belongs to exactly one occasion there). midnight-cinema is a
// "date" template, not "event" — TemplateCatalog only renders a template
// card once its occasion chip is active, so this has to match exactly.
const DESIGNS = [
  { id: "bloom-portrait", occasion: "birthday" },
  { id: "wedding", occasion: "wedding" },
  { id: "first-chapter", occasion: "first-birthday" },
  { id: "golden-years", occasion: "hwangap" },
  { id: "botanical", occasion: "date" },
  { id: "midnight-cinema", occasion: "date" }
];
// Lossless PNG screenshots of full invitation cards and studio chrome are
// heavy (hero-only landing images were 445 KB, guide steps 621-753 KB each);
// these are marketing photos, not pixel-diffed fixtures, so JPEG at a high
// quality is the right tradeoff and needs no extra dependency (Playwright's
// screenshot() supports it natively).
const JPEG_OPTIONS = { type: "jpeg", quality: 82 };
// Every image is rendered twice, once per site language, because these are
// photographs of the studio and the studio is translated: an English reader
// was being shown Korean sample invitations under Korean studio chrome. The
// landing and the guide swap between the two sets at runtime (see the
// data-src-ko/data-src-en pair on each <img data-site-media> and the hook in
// assets/site/site.js).
//
// Korean keeps the plain filename and English takes the "-en" suffix, rather
// than each language getting its own directory: the plain name is the one the
// HTML serves as its static src, so it is what a reader with no JavaScript —
// and every crawler that does not run one — actually downloads. Making that
// the default-shaped name rather than "ko/..." keeps the fallback honest, and
// keeps the two renders of one image adjacent in a listing and in a diff.
const LANGUAGES = [
  { id: "ko", locale: "ko-KR", query: "", suffix: "" },
  { id: "en", locale: "en-US", query: "?lang=en", suffix: "-en" }
];
// Known limitation, and the one place a capture is not fully in its own
// language: Chrome paints <input type="datetime-local"> with the date format
// of the operating system's region, and nothing the page or Playwright can
// say changes it — the context locale, ?lang= and --lang were all measured
// here and none of them moves that widget under channel "chrome". On a Mac
// set to Korea the English guide-step-02 therefore shows
// "2026. 12. 05. 오후 04:00" in that single field while everything around it
// is English. It is the browser's own widget rather than anything this
// product renders — an English reader on an English-region machine sees
// "12/05/2026, 04:00 PM" — so regenerating on a machine set to an English
// region produces a fully English set with no change to this script.
// The hero image on the landing is the same bloom-portrait design as the
// gallery's first card, so it reuses design-bloom-portrait-2x.jpg instead of
// shipping a second, near-identical download.
const mediaNames = (suffix) => [
  ...DESIGNS.map(({ id }) => `design-${id}-2x${suffix}.jpg`),
  `guide-step-01-2x${suffix}.jpg`, `guide-step-02-2x${suffix}.jpg`, `guide-step-03-2x${suffix}.jpg`
];
// sample.html is a single document, not a pair: /sample is one page and the
// invitation it shows is a real export, which carries the language it was
// written in. It is produced by the Korean pass only.
const OUTPUTS = LANGUAGES
  .flatMap(({ suffix }) => mediaNames(suffix))
  .map((name) => path.join(mediaDir, name))
  .concat(path.join(root, "sample.html"));

if (process.argv.includes("--check")) {
  const missing = OUTPUTS.filter((file) => !fs.existsSync(file) || fs.statSync(file).size < 1000);
  if (missing.length) { console.error(`Missing or empty:\n${missing.map((f) => path.relative(root, f)).join("\n")}`); process.exit(1); }
  console.log(`All ${OUTPUTS.length} site media outputs present.`);
  process.exit(0);
}

const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

// Every page here is a first visit, and a first visit is shown the cookie and
// analytics banner (assets/site/consent.js), which is position:fixed to the
// bottom of the viewport and therefore sits inside every screenshot this
// script takes — over the foot of the phone card, over the guide's apply row.
// It is not part of the product being photographed, so each context answers
// the question before the first document runs, exactly as a returning visitor
// arrives: the answer is a plain string in localStorage, and "denied" is the
// answer that both closes the banner and keeps analytics off in the captures.
const CONSENT_KEY = "invitation-maker.consent";
// Fresh contexts already start with empty storage; clearing it again here is
// what makes that a property of the script rather than of Playwright's
// defaults. It matters because applying a design no longer resets the editor:
// PresetApplication keeps whatever the author has written, so a run that
// inherited a draft would photograph six designs all carrying the first one's
// content. The IndexedDB database the draft lives in (assets/storage/
// invitation-storage.js) is dropped before any page script can open it.
const startClean = (context) => context.addInitScript(([key, answer]) => {
  try {
    localStorage.clear();
    localStorage.setItem(key, answer);
  } catch { /* storage disabled: the banner check below still fails loudly */ }
  try { indexedDB.deleteDatabase("invitation-maker"); } catch { /* nothing to drop */ }
}, [CONSENT_KEY, "denied"]);

const newStudioContext = async (browser, viewport, language) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: language.locale });
  await startClean(context);
  return context;
};

// ?lang= is how a reader asks for a language and how the engine resolves one
// (assets/i18n/i18n.js), and it persists nothing, so every context here starts
// from the query alone. The browser locale is set to match rather than left on
// ko-KR for both passes: the studio's own chrome follows ?lang=, but the date
// a <input type="datetime-local"> paints and the sample date the renderer
// formats follow the locale, so leaving them Korean would put Korean dates
// inside an otherwise English screenshot.
const studioUrl = (language) => `${baseUrl}/studio${language.query}`;

// The banner is built and appended by script, so "it is not in the DOM" is the
// only honest way to say it is gone. Asserted right before the first capture of
// each context rather than trusted, because a silent regression here would not
// break the run — it would just quietly paste a black bar across every image.
const assertNoConsentBanner = async (page, where) => {
  if (await page.locator("#invitation-consent").count()) {
    throw new Error(`${where}: the consent banner is still on the page and would appear in the capture`);
  }
};

// Applying a design has two different UIs depending on viewport width. Above
// 900px the gallery renders every design live at card size and one apply
// button, "#apply-template-button", sits under the grid. At or below 900px the
// cards are 160px thumbnails, so tapping one raises the design full size in the
// "#sample-sheet" modal <dialog> and the apply button to press is the sheet's
// own — the "#gallery-dock" bar carries the same action but a modal dialog
// makes everything behind it inert, so a click aimed at the dock is swallowed
// by the sheet's iframe. (That is exactly how this script broke: the sheet
// arrived in PR #39 and the dock click has been timing out ever since.)
//
// Applying always advances the studio to the edit stage, where the mobile
// preview tab actually renders the card (the gallery stage hides #preview
// outright), so screenshots are taken there.
const applyDesign = async (page, { id, occasion }, width) => {
  await page.locator(`[data-occasion-id="${occasion}"]`).click();
  await page.locator(`[data-template-id="${id}"]`).click();
  if (width <= 900) {
    await page.locator("#sample-sheet[open] #sample-sheet-apply").click();
  } else {
    await page.locator("#apply-template-button").click();
  }
  // On phone widths the preview iframe lives in the (currently hidden)
  // preview tab until it's switched to below, so wait for the card to be
  // attached to the DOM rather than the default "visible" state.
  await page.frameLocator("#preview").locator(`.invitation-card[data-template="${id}"]`).waitFor({ state: "attached" });
  await page.waitForTimeout(300); // let fonts inside the frame settle
};

// One full pass over the studio in one language: six phone cards and the three
// desktop guide stages. Called once per entry in LANGUAGES, so the two sets are
// the same captures of the same studio with only the language changed.
const captureLanguage = async (browser, language) => {
  // Phone-sized frames: one per design (the first, bloom-portrait, also
  // doubles as the landing's hero image and produces sample.html).
  // Each design gets its own browser context (fresh storage), not just a
  // fresh page: the studio autosaves the in-progress draft (title, message,
  // etc.) and, once a template has been applied once, deliberately
  // preserves that content across further template switches instead of
  // resetting to the new preset's defaults. Reusing one context for all
  // six designs was tried first and produced five screenshots that all
  // read "BLOOM PORTRAIT" in the new template's styling — a real defect
  // for a gallery meant to showcase six distinct designs. A private
  // context per design keeps each screenshot on that template's own
  // untouched defaults.
  const phoneWidth = 390;
  for (const design of DESIGNS) {
    const phoneContext = await newStudioContext(browser, { width: phoneWidth, height: 844 }, language);
    const phone = await phoneContext.newPage();
    // bloom-portrait's default RSVP item has no phone/email in it, which
    // makes the download flow below raise a native confirm() asking the
    // author to double check; auto-accept it like verify-studio.cjs does.
    phone.on("dialog", (dialog) => dialog.accept());
    await phone.goto(studioUrl(language));
    await assertNoConsentBanner(phone, `${language.id}/design-${design.id}`);
    await applyDesign(phone, design, phoneWidth);
    await phone.locator('.mobile-view-tabs [data-mobile-view="preview"]').click();
    await phone.locator("#preview").screenshot({ path: path.join(mediaDir, `design-${design.id}-2x${language.suffix}.jpg`), ...JPEG_OPTIONS });
    if (design.id === "bloom-portrait" && language.id === "ko") {
      // Korean only: /sample is one page showing one real export, and an
      // export carries the language it was written in rather than following
      // the reader's. The landing links it as "see a finished invitation".
      //
      // #preview is seeded ONCE with a generic placeholder document (see
      // mountPreviewFrame in assets/studio/app.js: "the frame is seeded
      // ONCE ... every later render patches only the body inside it") —
      // its srcdoc attribute never reflects whichever design is applied
      // afterwards, it always stays the original empty-invitation seed.
      // Reading it literally produced a sample.html whose visible card was
      // the seed's default template with none of bloom-portrait's content.
      // The studio's own "download HTML" button runs the exact
      // InvitationCore.buildStandaloneHtml call a guest's export gets built
      // from, current template and content included, so that's the real
      // source for "the studio's own export" — trigger it the same way
      // scripts/verify-studio.cjs does and read the file it produces.
      await phone.locator('.studio-steps [data-studio-stage="finish"]').click();
      await phone.locator("#open-download-dialog-button").click();
      const downloadPromise = phone.waitForEvent("download");
      await phone.locator("#download-button").click();
      const download = await downloadPromise;
      const exportedHtml = fs.readFileSync(await download.path(), "utf8");
      const sample = exportedHtml.replace(/<head>/i, '<head>\n<meta name="robots" content="noindex">');
      // The studio's export has indentation-only lines (trailing spaces/tabs
      // with nothing after them); CI's whitespace check rejects those in a
      // tracked file, so strip them here rather than in the export itself.
      const cleanedSample = sample.replace(/[ \t]+$/gm, "");
      fs.writeFileSync(path.join(root, "sample.html"), `<!-- Generated by scripts/build-site-media.cjs from the studio's own export; regenerate, do not edit. -->\n${cleanedSample}`);
    }
    await phoneContext.close();
  }
  // Desktop screenshots of the three stages for the guide. Each screenshot
  // waits for a real element of the stage it is capturing rather than a
  // bare timeout, which was flaky on slower machines.
  const desktopContext = await newStudioContext(browser, { width: 1440, height: 900 }, language);
  const desktop = await desktopContext.newPage();
  await desktop.goto(studioUrl(language));
  await assertNoConsentBanner(desktop, `${language.id}/guide-step-01`);
  await desktop.locator('[data-occasion-id="birthday"]').click();
  await desktop.locator('[data-template-id="bloom-portrait"]').click();
  await desktop.locator('[data-template-id="bloom-portrait"]').waitFor({ state: "visible" });
  // Step 01 illustrates picking a design AND applying it, so the capture
  // must wait for the apply row to have caught up with the card that was
  // just tapped, not just for the card. There is no preview frame to wait
  // for here: the desktop gallery renders every design live in its own card,
  // so studio.css hides #preview for the whole gallery stage and the panel
  // that used to hold it now only hosts the apply prompt. "#template-summary"
  // is that prompt — it names the selected design, so it is filled in by the
  // same render that marks the card selected, and unlike the hidden frame it
  // is actually in the picture.
  await desktop.locator("#apply-template-button").waitFor({ state: "visible" });
  await desktop.waitForFunction(() => document.querySelector("#template-summary")?.textContent.trim().length > 0);
  // The gallery grid at 1440x900 puts the selected card and the apply
  // prompt below the fold together — scrolling back to (0,0) would hide
  // #apply-template-button entirely, and the button is the point of this
  // step's screenshot (the guide's prose walks the reader through pressing
  // it). scrollIntoViewIfNeeded() on the button also pushes the top bar
  // well out of frame, so unlike steps 02/03 this capture does NOT reset
  // scroll to the top — the studio-bar's "사용법" link is still shown, just
  // by the step 02/03 captures below and not by this one.
  await desktop.locator("#apply-template-button").scrollIntoViewIfNeeded();
  await desktop.screenshot({ path: path.join(mediaDir, `guide-step-01-2x${language.suffix}.jpg`), fullPage: false, ...JPEG_OPTIONS });
  await desktop.locator("#apply-template-button").click();
  await desktop.frameLocator("#preview").locator(".invitation-card").waitFor();
  await desktop.evaluate(() => window.scrollTo(0, 0));
  await desktop.screenshot({ path: path.join(mediaDir, `guide-step-02-2x${language.suffix}.jpg`), ...JPEG_OPTIONS });
  await desktop.locator('.studio-steps [data-studio-stage="finish"]').click();
  // "#save-button" is the "보관함에 저장" choice card in .finish-choice-row —
  // waiting for it (rather than a timeout) proves the finish stage's own
  // markup, not just the stage-nav button, has actually rendered.
  await desktop.locator("#save-button").waitFor({ state: "visible" });
  await desktop.waitForTimeout(300); // let fonts settle
  await desktop.evaluate(() => window.scrollTo(0, 0));
  await desktop.screenshot({ path: path.join(mediaDir, `guide-step-03-2x${language.suffix}.jpg`), ...JPEG_OPTIONS });
  await desktopContext.close();
  console.log(`Wrote ${mediaNames(language.suffix).length} ${language.id} images.`);
};

(async () => {
  fs.mkdirSync(mediaDir, { recursive: true });
  // One browser for both passes. A second launch carrying --lang was tried
  // first, to see whether asking the browser itself for a language would move
  // the datetime widget above: it did not, and close() on the second instance
  // hung, leaving the run without an exit. The language a capture needs is
  // carried entirely by the context locale and ?lang=, which are per-context.
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const language of LANGUAGES) await captureLanguage(browser, language);
    console.log(`Wrote ${OUTPUTS.length} outputs under ${path.relative(root, mediaDir)} and sample.html`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
