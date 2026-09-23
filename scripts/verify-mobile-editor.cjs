const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// The studio itself lives at /studio; the base URL is now the marketing
// landing page, which has none of the elements this script exercises.
const baseUrl = process.env.INVITATION_BASE_URL || 'http://127.0.0.1:4173';
const studioUrl = `${baseUrl}/studio`;

// A first visit shows the cookie/consent banner (assets/site/consent.js),
// which is position:fixed to the bottom of the viewport and can sit over the
// very controls being measured. Same bypass as scripts/build-site-media.cjs:
// answer the question before the first script on the page runs, exactly as a
// returning visitor would arrive, rather than clicking it away through the UI.
const CONSENT_KEY = 'invitation-maker.consent';
const dismissConsentBanner = (page) => page.addInitScript(([key, answer]) => {
  try { localStorage.setItem(key, answer); } catch { /* storage disabled */ }
}, [CONSENT_KEY, 'denied']);

// Measure descendants: html overflow-x:hidden can conceal an oversized form
// while a page-level scrollWidth check still passes.
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const locale of ['ko-KR', 'en-US']) {
      for (const width of [320, 360, 390, 412, 768, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 844 }, locale });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await dismissConsentBanner(page);
        await page.goto(studioUrl);
        await page.locator('.studio-steps [data-studio-stage="edit"]').click();
        await page.locator('.content-editor-section').evaluate(el => { el.closest('details').open = true; });
        for (const kind of ['notice', 'profile', 'link']) {
          await page.locator(`[data-add-item="${kind}"]`).click();
        }
        await page.locator('#add-course-button').click();
        await page.locator('.content-item-toggle').evaluateAll(elements => {
          for (const el of elements) if (el.getAttribute('aria-expanded') !== 'true') el.click();
        });
        // Below 600px assets/studio/studio.css (B-7) deliberately turns the
        // add-item row into a horizontally scrolling chip strip with a faded
        // right edge, rather than wrapping five buttons onto extra lines; at
        // or above 600px it lays out as five even columns and must not
        // scroll. So a chip sitting past the visible edge below 600px is the
        // design, not a clipping bug, and only the scrolling container's own
        // box is checked there; everything else must stay fully in view.
        const violations = await page.locator('.content-editor-section').evaluate((section, isScrollingChipRow) => {
          const bounds = section.closest('.editor-group').getBoundingClientRect();
          const commands = section.querySelector('.content-editor-commands');
          const bad = [];
          for (const el of section.querySelectorAll('.content-item-card, input, textarea, select, button')) {
            if (isScrollingChipRow && commands.contains(el)) continue;
            if (!el.getClientRects().length) continue;
            const r = el.getBoundingClientRect();
            if (r.left < bounds.left - 1 || r.right > bounds.right + 1) bad.push(`${el.id || el.className}: ${Math.round(r.right)} > ${Math.round(bounds.right)}`);
          }
          const commandsRect = commands.getBoundingClientRect();
          if (commandsRect.right > bounds.right + 1) bad.push(`content-editor-commands row: ${Math.round(commandsRect.right)} > ${Math.round(bounds.right)}`);
          if (!isScrollingChipRow && commands.scrollWidth > commands.clientWidth + 1) bad.push('add buttons require horizontal scrolling');
          return bad;
        }, width < 600);
        assert.deepEqual(violations, [], `${locale} ${width}px clipped controls`);
        const input = page.locator('[data-profile-field="name"]').first();
        await input.fill('A long profile name / 긴 이름도 입력 가능');
        assert.equal(await input.inputValue(), 'A long profile name / 긴 이름도 입력 가능');
        assert.deepEqual(errors, [], `${locale} ${width}px runtime errors`);
        console.log(`PASS mobile editor ${locale} ${width}px: cards, fields, add/reorder controls fit`);
        await page.close();
      }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
