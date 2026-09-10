const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const origin = process.env.TEST_URL || 'http://localhost:4173';
  const output = path.resolve(__dirname, '../output/playwright');
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const width of [320, 390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const failures = [];
      page.on('pageerror', error => failures.push(error.message));
      for (const code of [400, 401, 403, 404, 408, 410, 429, 500, 502, 503, 504]) {
        const requests = [];
        const record = request => requests.push(request.url());
        page.on('request', record);
        await page.goto(`${origin}/${code}.html?message=PRIVATE_SENTINEL&next=https://example.com`);
        assert.equal(await page.locator('h1').count(), 1, `${code}: meaningful heading`);
        assert.equal(await page.locator('[data-error-code]').textContent(), String(code));
        assert.equal(await page.locator('a.primary').getAttribute('href'), '/');
        assert.equal(await page.locator('meta[name=robots]').getAttribute('content'), 'noindex, nofollow');
        assert.ok(!(await page.locator('body').textContent()).includes('PRIVATE_SENTINEL'));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${code}/${width}: overflow`);
        assert.ok(requests.every(url => url.startsWith(origin + '/')), 'no third-party dependencies or analytics');
        const retry = page.getByRole('button', { name: '다시 시도' });
        assert.equal(await retry.count(), [408, 429, 500, 502, 503, 504].includes(code) ? 1 : 0);
        for (const box of await page.locator('.actions a, .actions button').evaluateAll(elements => elements.map(el => ({ height: el.getBoundingClientRect().height })))) {
          assert.ok(box.height >= 44, 'touch target');
        }
        if ([404, 503].includes(code)) await page.screenshot({ path: path.join(output, `error-${code}-${width}.png`), fullPage: true });
        page.off('request', record);
      }
      await page.goto(`${origin}/503.html`);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
      await context.setOffline(true);
      await page.waitForFunction(() => !document.querySelector('[data-offline]').hidden);
      await page.getByRole('button', { name: '다시 시도' }).click();
      assert.equal(await page.getByRole('button', { name: '다시 시도' }).isEnabled(), true);
      await context.setOffline(false);
      await page.waitForFunction(() => document.querySelector('[data-offline]').hidden);
      await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: '다시 시도' }).click()]);
      await page.locator('a.primary').click();
      assert.equal(new URL(page.url()).pathname, '/');
      assert.deepEqual(failures, []);
      await context.close();
    }
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 640 } });
    const page = await context.newPage();
    for (const code of [404, 503]) {
      await page.goto(`${origin}/${code}.html`);
      assert.equal(await page.locator('h1').isVisible(), true);
      assert.equal(await page.locator('a.primary').isVisible(), true);
      assert.equal(await page.locator('button').isVisible(), false);
    }
    await context.close();
    const luminance = hex => {
      const channels = hex.match(/\w\w/g).map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    for (const [foreground, background] of [['59645e', 'f7f7f4'], ['314e41', 'f7f7f4'], ['ffffff', '314e41']]) {
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      assert.ok((values[0] + .05) / (values[1] + .05) >= 4.5, 'text contrast');
    }
    console.log('PASS: 11 error pages × 4 widths; recovery, privacy, offline and no-JS checks');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
