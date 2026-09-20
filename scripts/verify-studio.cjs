const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// The studio lives at /studio; the root is the landing page, and it only
// forwards a browser that has been to the studio before. Every page here is a
// first visit in its own context, so the root would serve the landing and
// every studio selector below would wait 30s for markup that is not there.
const baseUrl = process.env.INVITATION_BASE_URL || 'http://localhost:4173';

// One apply action, reached two ways. Above 900px it is the button under the
// gallery grid. At or below 900px tapping a card first raises #sample-sheet,
// a modal <dialog>, and the apply button to press is the sheet's own — the
// identical one on #gallery-dock is behind a modal and therefore inert.
const applySelectedDesign = async (page, width) => {
  if (width <= 900 && await page.locator('#sample-sheet[open]').count()) {
    await page.locator('#sample-sheet[open] #sample-sheet-apply').click();
    return;
  }
  await page.locator('#apply-template-button').click();
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [320, 390, 768, 1440]) {
      // This script drives the Korean studio, and it says so: without a locale
      // headless Chrome reports en-US and the studio would correctly resolve
      // to English, leaving the Korean assertions below checking nothing.
      // Both languages are exercised by the per-language verification script.
      const page = await browser.newPage({ viewport: { width, height: 844 }, locale: 'ko-KR' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      await page.goto(`${baseUrl}/studio`);
      await page.locator('[data-occasion-id="birthday"]').click();
      if (width <= 900) {
        await page.locator('#gallery-dock').waitFor({ timeout: 3000 });
        assert.ok(await page.locator('#gallery-create').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight));
      }
      await page.locator('[data-template-id="bloom-portrait"]').click();
      if (width <= 900) {
        // The tap raises the sheet over the dock: the sheet is what the author
        // now decides from, so it is checked first, and closing it is what
        // makes the dock behind it reachable again.
        await page.locator('#sample-sheet[open]').waitFor({ timeout: 3000 });
        assert.match(await page.locator('#sample-sheet-title').textContent(), /블룸/);
        await page.locator('#sample-sheet[open] .studio-sheet-close').click();
        await page.locator('#sample-sheet').waitFor({ state: 'hidden' });
        assert.ok(await page.locator('#template-list').isVisible());
        assert.match(await page.locator('#gallery-selection').textContent(), /블룸/);
        // The sheet's close button is the whole way back now. #gallery-back
        // is not exercised here because a phone cannot reach it on this
        // stage: studio.css hides it outside the preview view, and the view
        // tabs that switch there only exist on the edit stage, so the gallery
        // is always in the editor view while the dock is on screen.
        await page.locator('#gallery-create').click();
        assert.ok(await page.locator('[name="title"]').evaluate(el => el.getBoundingClientRect().top < 420));
      } else {
        await page.locator('#apply-template-button').click();
      }
      await page.locator('[name="title"]').fill('하린의 생일 · 오래 기억하고 싶은 하루');
      // The free-text date lives behind the "write it my own way" drawer now.
      await page.locator('[data-date-custom] > summary').click();
      await page.locator('[name="dateLabel"]').fill('September 12 · 13:00');
      if (width === 390) {
        await page.locator('#hero-image-input').setInputFiles('assets/invitation/template-art/wedding-paper.webp');
        await page.waitForFunction(() => !document.querySelector('#hero-image-preview').hidden);
      }
      await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('저장됨'));
      await page.reload();
      await page.locator('[name="title"]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('[name="title"]').inputValue(), '하린의 생일 · 오래 기억하고 싶은 하루');
      if (width === 390) assert.match(await page.locator('#hero-image-preview').getAttribute('src'), /^data:image\//);
      await page.locator('.studio-steps [data-studio-stage="gallery"]').click();
      await page.locator('[data-template-id="cherry-muse"]').click();
      await applySelectedDesign(page, width);
      assert.equal(await page.locator('[name="dateLabel"]').inputValue(), 'September 12 · 13:00');
      // #preview is an iframe running the standalone invitation document, so
      // reach the card through the frame. Doing so also proves the isolation:
      // if the invitation ever rendered back into the studio document this
      // locator would find nothing.
      assert.equal(await page.frameLocator('#preview').locator('.invitation-card').getAttribute('data-template'), 'cherry-muse');
      assert.equal(await page.locator('#preview .invitation-card').count(), 0);
      if (width === 390) assert.match(await page.locator('#hero-image-preview').getAttribute('src'), /^data:image\//);
      await page.locator('.studio-steps [data-studio-stage="finish"]').click();
      assert.equal(await page.locator('#preview').isVisible(), true);
      await page.locator('#open-download-dialog-button').click();
      const download = page.waitForEvent('download');
      await page.locator('#download-button').click();
      assert.match((await download).suggestedFilename(), /\.html$/);
      await page.locator('#download-dialog .studio-dialog-close').click();
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
    const core = require('../assets/invitation/core.js');
    for (const template of ['bloom-portrait', 'cherry-muse', 'peach-table']) {
      const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
      await page.setContent(core.buildStandaloneHtml({
        templateId: template, title: '오래도록 기억하고 싶은 우리의 특별한 생일을 함께 축하해요',
        introEffect: 'none', heroImage: null,
        items: Array.from({ length: 10 }, (_, i) => ({ type: 'course', place: `일정 ${i + 1}`, note: '함께 걷고 편하게 대화하는 시간', time: '13:00' }))
      }));
      assert.equal(await page.locator('.invite-stop').count(), 10);
      assert.match(await page.locator('.invite-timeline').textContent(), /함께 걷고/);
      assert.equal(await page.locator('.invitation-card').getAttribute('data-design'), template);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${template}: export overflow`);
      await page.screenshot({ path: `/tmp/studio-stress-${template}.png`, fullPage: true });
      await page.close();
      console.log(`PASS ${template}: standalone, no custom photo, long Korean title, ten courses`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
