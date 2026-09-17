// Renders the landing/guide images and sample.html from the real studio, so
// the landing shows exactly what the studio produces. Same conventions as
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
const OUTPUTS = [
  "hero-sample@2x.png",
  ...DESIGNS.map(({ id }) => `design-${id}@2x.png`),
  "guide-step-01@2x.png", "guide-step-02@2x.png", "guide-step-03@2x.png"
].map((name) => path.join(mediaDir, name)).concat(path.join(root, "sample.html"));

if (process.argv.includes("--check")) {
  const missing = OUTPUTS.filter((file) => !fs.existsSync(file) || fs.statSync(file).size < 1000);
  if (missing.length) { console.error(`Missing or empty:\n${missing.map((f) => path.relative(root, f)).join("\n")}`); process.exit(1); }
  console.log(`All ${OUTPUTS.length} site media outputs present.`);
  process.exit(0);
}

const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

// At <=900px wide the studio replaces the desktop "#preview-apply-button"
// with the "#gallery-dock" bar (see scripts/verify-studio.cjs), so applying
// a design has two different UIs depending on viewport width. Applying
// always advances the studio to the edit stage, where the mobile preview
// tab actually renders the card (the gallery stage's preview tab is known
// to render blank), so screenshots are taken there.
const applyDesign = async (page, { id, occasion }, width) => {
  await page.locator(`[data-occasion-id="${occasion}"]`).click();
  await page.locator(`[data-template-id="${id}"]`).click();
  if (width <= 900) {
    await page.locator("#gallery-dock").waitFor();
    await page.locator("#gallery-create").click();
  } else {
    await page.locator("#preview-apply-button").click();
  }
  // On phone widths the preview iframe lives in the (currently hidden)
  // preview tab until it's switched to below, so wait for the card to be
  // attached to the DOM rather than the default "visible" state.
  await page.frameLocator("#preview").locator(`.invitation-card[data-template="${id}"]`).waitFor({ state: "attached" });
  await page.waitForTimeout(300); // let fonts inside the frame settle
};

(async () => {
  fs.mkdirSync(mediaDir, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    // Phone-sized frames: one per design, plus the hero and sample.html.
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
      const phoneContext = await browser.newContext({ viewport: { width: phoneWidth, height: 844 }, deviceScaleFactor: 2, locale: "ko-KR" });
      const phone = await phoneContext.newPage();
      // bloom-portrait's default RSVP item has no phone/email in it, which
      // makes the download flow below raise a native confirm() asking the
      // author to double check; auto-accept it like verify-studio.cjs does.
      phone.on("dialog", (dialog) => dialog.accept());
      await phone.goto(`${baseUrl}/studio`);
      await applyDesign(phone, design, phoneWidth);
      await phone.locator('.mobile-view-tabs [data-mobile-view="preview"]').click();
      await phone.locator("#preview").screenshot({ path: path.join(mediaDir, `design-${design.id}@2x.png`) });
      if (design.id === "bloom-portrait") {
        await phone.locator("#preview").screenshot({ path: path.join(mediaDir, "hero-sample@2x.png") });
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
        fs.writeFileSync(path.join(root, "sample.html"), `<!-- Generated by scripts/build-site-media.cjs from the studio's own export; regenerate, do not edit. -->\n${sample}`);
      }
      await phoneContext.close();
    }
    // Desktop screenshots of the three stages for the guide.
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "ko-KR" });
    await desktop.goto(`${baseUrl}/studio`);
    await desktop.locator('[data-occasion-id="birthday"]').click();
    await desktop.locator('[data-template-id="bloom-portrait"]').click();
    await desktop.screenshot({ path: path.join(mediaDir, "guide-step-01@2x.png") });
    await desktop.locator("#preview-apply-button").click();
    await desktop.frameLocator("#preview").locator(".invitation-card").waitFor();
    await desktop.screenshot({ path: path.join(mediaDir, "guide-step-02@2x.png") });
    await desktop.locator('.studio-steps [data-studio-stage="finish"]').click();
    await desktop.waitForTimeout(300);
    await desktop.screenshot({ path: path.join(mediaDir, "guide-step-03@2x.png") });
    console.log(`Wrote ${OUTPUTS.length} outputs under ${path.relative(root, mediaDir)} and sample.html`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
