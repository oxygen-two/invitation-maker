// Run with an existing Playwright installation and the static server running.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(process.env.INVITATION_BASE_URL || 'http://localhost:4173');
      await page.locator('[data-occasion-id="birthday"]').click();
      assert.equal(await page.locator('[data-template-thumbnail-viewport]').evaluateAll(es => es.every(e => e.clientHeight >= 190 && e.closest('.template-card').clientHeight >= e.clientHeight + 60)), true, 'bounded gallery must scroll without shrinking or clipping thumbnails');
      await page.locator('[data-template-id="cherry-muse"]').click();
      const start = page.locator('#start-template-button');
      assert.equal(await start.count(), 1, 'pending design needs a visible primary start action');
      assert.equal(await start.isVisible(), true);
      assert.match(await start.innerText(), /체리 뮤즈/);
      if (width <= 900) {
        const box = await start.boundingBox();
        assert.ok(box.y >= 0 && box.y + box.height <= 844, 'pending apply must be in the viewport');
      }
      assert.equal(await page.locator('#download-button').isVisible(), false, 'must not offer a misleading download before applying');
      if (width <= 900) await page.locator('[data-mobile-view="preview"]').click();
      assert.equal(await page.locator('#pending-preview-notice').isVisible(), true);
      if (width <= 900) await page.locator('[data-mobile-view="editor"]').click();
      const previous = await page.locator('#preview .invitation-card').getAttribute('data-template');
      await start.click();
      assert.equal(await page.locator('#preview .invitation-card').getAttribute('data-template'), 'cherry-muse');
      assert.equal(await page.locator('[name="title"]').evaluate(e => e === document.activeElement), true);
      const groups = await page.locator('[data-editor-group]').evaluateAll(es => es.map(e => ({ name: e.dataset.editorGroup, open: e.open })));
      assert.equal(groups[0].name, 'details');
      assert.equal(groups.find(e => e.name === 'style').open, false);
      await page.locator('[name="title"]').fill('서연의 생일에 초대합니다');
      await page.locator('[data-template-id="peach-table"]').click();
      page.once('dialog', dialog => dialog.dismiss());
      await start.click();
      assert.equal(await page.locator('[name="title"]').inputValue(), '서연의 생일에 초대합니다', 'cancel must retain edited draft');
      await page.locator('#keep-draft-button').click();
      assert.equal(await page.locator('#download-button').isVisible(), true);
      assert.equal(await page.locator('#preview .invitation-card').getAttribute('data-template'), 'cherry-muse');
      await page.locator('#undo-template-button').click();
      assert.equal(await page.locator('#preview .invitation-card').getAttribute('data-template'), previous);
      await page.locator('[data-occasion-id="birthday"]').click();
      await page.locator('#toggle-templates-button').click();
      assert.equal(await page.locator('#toggle-templates-button').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#template-list').evaluate(e => e.scrollWidth <= e.clientWidth + 1), true, 'expanded gallery should not require horizontal scrolling');
      await page.locator('[data-template-id="peach-table"]').click();
      await start.click();
      let warning = '';
      page.once('dialog', dialog => { warning = dialog.message(); return dialog.dismiss(); });
      await page.locator('#download-button').click();
      assert.match(warning, /연락|회신/, 'contactless reply request needs a pre-export warning');
      assert.equal(await page.locator('[data-link-field="url"]').evaluate(e => e === document.activeElement), true);
      page.once('dialog', dialog => dialog.accept());
      const contactlessDownload = page.waitForEvent('download');
      await page.locator('#download-button').click();
      assert.match((await contactlessDownload).suggestedFilename(), /\.html$/, 'explicit consent still permits contactless export');
      await page.locator('[data-link-field="url"]').fill('mailto:host@example.com');
      warning = '';
      page.once('dialog', dialog => { warning = dialog.message(); return dialog.dismiss(); });
      await page.locator('#download-button').click();
      assert.match(warning, /연락|회신/, 'URL schemes removed by export must not bypass the contact warning');
      await page.locator('[data-link-field="url"]').fill('');
      await page.locator('[data-link-field="value"]').fill('2026-09-30까지');
      warning = '';
      page.once('dialog', dialog => { warning = dialog.message(); return dialog.dismiss(); });
      await page.locator('#download-button').click();
      assert.match(warning, /연락|회신/, 'reply deadline must not be mistaken for a phone number');
      await page.locator('[data-link-field="url"]').fill('https://example.com/rsvp');
      const download = page.waitForEvent('download');
      await page.locator('#download-button').click();
      assert.match((await download).suggestedFilename(), /\.html$/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      console.log(`PASS maker UX at ${width}: visible apply, draft/cancel/undo, essential fields, gallery, contact warning/export`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
