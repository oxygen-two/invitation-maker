// Exercises local files on a simulated production origin. No events reach a vendor.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'invitation-maker-one.vercel.app') return route.abort();
      const response = await route.fetch({ url: `http://localhost:4173${url.pathname}${url.search}` });
      return route.fulfill({ response });
    });
    await page.addInitScript(() => {
      window.analyticsTestEvents = [];
      window.InvitationAnalyticsConfig = { enabled: true, posthog: { token: 'test-only' }, vercel: {} };
      window.posthog = {
        init(_token, config) { this.config = config; },
        capture(event, properties) { window.analyticsTestEvents.push(this.config.before_send({ event, properties })); }
      };
    });
    await page.goto('https://invitation-maker-one.vercel.app/?utm_source=kakao&utm_medium=social&utm_campaign=launch_2026_09');
    await page.waitForFunction(() => document.querySelector('#template-list [data-template-id]'));
    await page.getByRole('button', { name: '02 내용 편집', exact: true }).click();
    await page.locator('[name="title"]').fill('PRIVATE_SENTINEL_DO_NOT_SEND');
    await page.locator('[name="title"]').fill('PRIVATE_SENTINEL_DO_NOT_SEND_2');
    await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('저장됨'));
    await page.getByRole('button', { name: '03 완성', exact: true }).click();
    let events = await page.evaluate(() => window.analyticsTestEvents);
    assert.equal(events.filter(e => e.event === 'invitation_completed').length, 0);
    page.on('dialog', dialog => dialog.accept());
    for (let i = 0; i < 2; i++) {
      const download = page.waitForEvent('download');
      await page.locator('#download-button').click();
      await download;
    }
    events = await page.evaluate(() => window.analyticsTestEvents);
    for (const event of ['landing_viewed', 'editing_started', 'draft_saved', 'invitation_completed', 'html_downloaded']) {
      assert.equal(events.filter(e => e.event === event).length, 1, event);
    }
    assert.equal(JSON.stringify(events).includes('PRIVATE_SENTINEL'), false);
    assert.ok(events.every(e => e.properties.source === 'kakao'));
    console.log('PASS simulated production: first-touch UTM, five funnel events, duplicate suppression, no title/body; no vendor requests');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
