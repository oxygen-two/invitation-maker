const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [320, 390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      await page.goto(process.env.INVITATION_BASE_URL || 'http://localhost:4173');
      await page.locator('[data-occasion-id="birthday"]').click();
      await page.locator('[data-template-id="bloom-portrait"]').click();
      await page.locator('#preview-apply-button').click();
      await page.locator('[name="title"]').fill('하린의 생일 · 오래 기억하고 싶은 하루');
      await page.locator('[name="dateLabel"]').fill('September 12 · 13:00');
      if (width === 390) {
        await page.locator('#hero-image-input').setInputFiles('assets/template-art/wedding-paper.webp');
        await page.waitForFunction(() => !document.querySelector('#hero-image-preview').hidden);
      }
      await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('저장됨'));
      await page.reload();
      await page.locator('[name="title"]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('[name="title"]').inputValue(), '하린의 생일 · 오래 기억하고 싶은 하루');
      if (width === 390) assert.match(await page.locator('#hero-image-preview').getAttribute('src'), /^data:image\//);
      await page.locator('.studio-steps [data-studio-stage="gallery"]').click();
      await page.locator('[data-template-id="cherry-muse"]').click();
      await page.locator('#preview-apply-button').click();
      assert.equal(await page.locator('[name="dateLabel"]').inputValue(), 'September 12 · 13:00');
      assert.equal(await page.locator('#preview .invitation-card').getAttribute('data-template'), 'cherry-muse');
      if (width === 390) assert.match(await page.locator('#hero-image-preview').getAttribute('src'), /^data:image\//);
      await page.locator('.studio-steps [data-studio-stage="finish"]').click();
      assert.equal(await page.locator('#preview').isVisible(), true);
      const download = page.waitForEvent('download');
      await page.locator('#download-button').click();
      assert.match((await download).suggestedFilename(), /\.html$/);
      await page.locator('#save-button').click();
      await page.locator('.studio-steps [data-studio-stage="library"]').click();
      await page.locator('.saved-item').waitFor();
      for (const stage of ['gallery', 'edit', 'finish', 'library']) {
        await page.locator(`.studio-steps [data-studio-stage="${stage}"]`).click();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}: ${stage} overflows`);
        if (width === 390 || width === 1440) await page.screenshot({ path: `/tmp/studio-${width}-${stage}.png` });
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}: restore, preserve, sample, export, library, four-stage layout`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
