const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

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
        await page.goto(process.env.INVITATION_BASE_URL || 'http://127.0.0.1:4173');
        await page.locator('.studio-steps [data-studio-stage="edit"]').click();
        await page.locator('.content-editor-section').evaluate(el => { el.closest('details').open = true; });
        for (const kind of ['notice', 'profile', 'link']) {
          await page.locator(`[data-add-item="${kind}"]`).click();
        }
        await page.locator('#add-course-button').click();
        await page.locator('.content-item-toggle').evaluateAll(elements => {
          for (const el of elements) if (el.getAttribute('aria-expanded') !== 'true') el.click();
        });
        const violations = await page.locator('.content-editor-section').evaluate(section => {
          const bounds = section.closest('.editor-group').getBoundingClientRect();
          const bad = [];
          for (const el of section.querySelectorAll('.content-item-card, input, textarea, select, button')) {
            if (!el.getClientRects().length) continue;
            const r = el.getBoundingClientRect();
            if (r.left < bounds.left - 1 || r.right > bounds.right + 1) bad.push(`${el.id || el.className}: ${Math.round(r.right)} > ${Math.round(bounds.right)}`);
          }
          const commands = section.querySelector('.content-editor-commands');
          if (commands.scrollWidth > commands.clientWidth + 1) bad.push('add buttons require horizontal scrolling');
          return bad;
        });
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
