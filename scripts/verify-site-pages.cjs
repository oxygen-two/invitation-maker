// Browser verification for the landing/guide/studio surface: no horizontal
// overflow and a visible CTA in the first viewport across phone/tablet/
// desktop widths, the entry-policy redirect rules from the design spec, the
// sample page's single invitation card, and that English pages carry no
// leftover Korean copy. Same Playwright conventions as build-site-media.cjs:
// PLAYWRIGHT_MODULE locates the module, Chrome is the channel.
//
//   npm start   (in another terminal)
//   PLAYWRIGHT_MODULE=/abs/path/to/playwright INVITATION_BASE_URL=http://127.0.0.1:4173 node scripts/verify-site-pages.cjs
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseUrl = process.env.INVITATION_BASE_URL || "http://localhost:4173";

// Korean-count check must exclude the language <select> (its "한국어" option
// labels are legitimate UI, not leftover copy) and any script/style/template
// text a clone might otherwise carry into innerText.
const countKoreanOutsideLanguageSwitcher = () => {
  const clone = document.body.cloneNode(true);
  clone.querySelector("#language-select")?.remove();
  for (const el of clone.querySelectorAll("script, style, template")) el.remove();
  return (clone.innerText.match(/[가-힣]/g) || []).length;
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const width of [320, 390, 768, 1440]) {
      for (const route of ["/", "/guide"]) {
        const page = await browser.newPage({ viewport: { width, height: 844 }, locale: "ko-KR" });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${baseUrl}${route}`);
        await page.waitForLoadState("networkidle");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route}@${width}: horizontal overflow`);
        // The header CTA is hidden on phones (see site.css); the hero CTA is
        // the one guaranteed to sit in the first viewport there, so check
        // whichever .site-cta is actually visible, not just the first match.
        assert.ok(await page.locator(".site-cta:visible").first().evaluate((el) => el.getBoundingClientRect().top < innerHeight), `${route}@${width}: CTA not in first viewport`);
        // The gallery images carry loading="lazy" and sit below the fold, so
        // "networkidle" alone doesn't make them start fetching — force every
        // <img> to load eagerly and await its outcome before checking, or
        // this would flag legitimately-deferred off-screen images as broken
        // (or worse, pass/fail depending on how far Chromium's lazy-load
        // distance threshold happened to reach that run).
        await page.evaluate(() => Promise.all([...document.images].map((img) => {
          if (img.complete) return undefined;
          img.loading = "eager";
          return new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          });
        })));
        const broken = await page.evaluate(() => [...document.images].filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.getAttribute("src")));
        assert.deepEqual(broken, [], `${route}@${width}: broken images`);
        assert.deepEqual(errors, [], `${route}@${width}: page errors`);

        // Below 600px the design shelf becomes a horizontal snap strip: it
        // must scroll internally without the document itself scrolling
        // sideways, and the finish table's phone-stacked cards must not
        // overflow their wrapper.
        if (width === 320 || width === 390) {
          if (route === "/") {
            const [designsScroll, docScroll] = await page.evaluate(() => [
              document.querySelector(".designs"),
              document.documentElement
            ].map((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })));
            assert.ok(designsScroll.scrollWidth > designsScroll.clientWidth, `${route}@${width}: design strip should overflow to scroll`);
            assert.ok(docScroll.scrollWidth <= docScroll.clientWidth, `${route}@${width}: document should not scroll horizontally`);
          }
          if (route === "/guide") {
            const tableWrap = await page.evaluate(() => {
              const el = document.querySelector(".table-wrap");
              return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
            });
            assert.ok(tableWrap.scrollWidth <= tableWrap.clientWidth, `${route}@${width}: finish table overflows .table-wrap`);
          }
        }
        await page.close();
      }
    }

    // Entry policy: a fresh browser (its own context) sees the landing.
    const freshContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ko-KR" });
    const freshPage = await freshContext.newPage();
    await freshPage.goto(`${baseUrl}/`);
    assert.match(freshPage.url(), /\/$/, "fresh browser sees the landing");
    await freshContext.close();

    // Entry policy: once a browser has visited /studio, / sends it back to
    // /studio (preserving query params) — but /welcome never redirects. This
    // runs in one context so the "visited" flag lives in the same
    // localStorage the redirect script reads.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ko-KR" });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/studio`);
    await page.locator("#template-list").waitFor();
    await page.goto(`${baseUrl}/?lang=en`);
    await page.waitForURL(/\/studio\?lang=en$/);
    await page.goto(`${baseUrl}/welcome`);
    assert.match(page.url(), /\/welcome$/, "/welcome never redirects");

    // Sample.
    await page.goto(`${baseUrl}/sample`);
    assert.equal(await page.locator(".invitation-card").count(), 1);

    // English: no Korean left on the landing or guide.
    for (const route of ["/welcome?lang=en", "/guide?lang=en"]) {
      await page.goto(`${baseUrl}${route}`);
      const korean = await page.evaluate(countKoreanOutsideLanguageSwitcher);
      assert.equal(korean, 0, `${route}: Korean text remains`);
    }
    await context.close();

    console.log("Site pages verified at 320/390/768/1440, entry policy, sample, English, design-strip scroll, and finish-table overflow.");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
