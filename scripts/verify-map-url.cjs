// Run against the local static server with an existing Playwright installation.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const requests = [];
      page.on('request', request => requests.push(request.url()));
      await page.goto(process.env.INVITATION_BASE_URL || 'http://localhost:4173');
      await page.waitForFunction(() => document.querySelector('#template-list [data-template-id]'));
      await page.getByRole('button', { name: '02 내용 편집', exact: true }).click();
      await page.locator('details').evaluateAll(elements => elements.forEach(element => { element.open = true; }));
      // Domain authorization of the external map renderer is a separate production check.
      await page.route('**/maps.js*', route => route.abort());
      const url = page.locator('[name="mapUrl"]');
      const name = page.locator('[name="location"]');
      const latitude = page.locator('[name="mapLatitude"]');
      // URL-only links must not depend on an embedded map or the display name.
      await page.locator('[name="mapEnabled"]').uncheck();
      for (const target of ['https://map.naver.com/p/entry/place/1266673496', 'https://naver.me/xAtWyIdS']) {
        await name.fill('전혀 다른 표시 이름');
        await url.fill(target);
        await url.blur();
        await page.waitForFunction(expected => Array.from(document.querySelectorAll('#preview a')).some(link => link.href === expected), target);
        assert.equal(await page.evaluate(expected => Array.from(document.querySelectorAll('#preview a')).some(link => link.href === expected && link.target === '_blank'), target), true);
      }
      await name.fill('전혀 다른 표시 이름');
      await url.fill('https://map.naver.com/?lat=37.5741694&lng=126.9916905');
      await page.locator('[name="mapEnabled"]').check();
      await page.waitForFunction(() => document.querySelector('[name="mapLatitude"]').value === '37.5741694');
      await name.fill('살롱순라 서순라길점');
      await name.blur();
      assert.equal(await latitude.inputValue(), '37.5741694');
      assert.equal(await page.locator('[name="mapLongitude"]').inputValue(), '126.9916905');
      await url.fill('https://map.naver.com/p/entry/place/1266673496');
      await url.blur();
      await page.waitForFunction(() => document.querySelector('form [data-map-message]').dataset.mapLookupState === 'error');
      assert.equal(await latitude.inputValue(), '');
      assert.match(await page.locator('form [data-map-message]').first().textContent(), /자동으로 확인할 수 없습니다/);
      const course = page.locator('[data-item-card]').filter({ has: page.locator('[data-course-field="mapUrl"]') }).first();
      if (await course.locator('[data-toggle-item]').getAttribute('aria-expanded') !== 'true') await course.locator('[data-toggle-item]').click();
      await course.locator('[data-course-field="mapUrl"]').fill('https://map.naver.com/?lat=37.5741694&lng=126.9916905');
      await course.locator('[data-course-field="mapUrl"]').blur();
      await course.locator('[data-course-field="mapEnabled"]').check();
      await page.waitForFunction(() => document.querySelector('[data-course-field="mapLatitude"]').value === '37.5741694');
      await course.locator('[data-course-field="place"]').fill('다른 표시 이름');
      await course.locator('[data-course-field="place"]').blur();
      assert.equal(await course.locator('[data-course-field="mapLatitude"]').inputValue(), '37.5741694');
      assert.equal(await page.evaluate(() => InvitationAnalytics.isEnabled()), false);
      assert.equal(requests.some(value => /posthog|\/insights\/|\/geocode/.test(value)), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      console.log(`PASS ${width}px: URL-only place/short links preserved independently of name; URL coordinates win; local analytics off`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
