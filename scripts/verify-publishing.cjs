const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const baseUrl = process.env.INVITATION_BASE_URL || 'http://127.0.0.1:4173';
const output = path.join(__dirname, '..', 'output', 'playwright', 'publishing');

async function createInvitation(page, width, title) {
  page.on('dialog', dialog => dialog.accept());
  await page.goto(baseUrl);
  await page.locator('[data-occasion-id="birthday"]').click();
  await page.locator('[data-template-id="bloom-portrait"]').click();
  if (width <= 900) await page.locator('#gallery-create').click();
  else await page.locator('#preview-apply-button').click();
  await page.locator('[name="title"]').fill(title);
  await page.locator('[name="dateLabel"]').fill('2026년 10월 10일 오후 2시');
  await page.locator('#hero-image-input').setInputFiles(path.join(__dirname, '..', 'assets', 'template-art', 'wedding-paper.webp'));
  await page.waitForFunction(() => !document.querySelector('#hero-image-preview').hidden);
  await page.locator('#review-button').click();
  await page.locator('#publish-button').waitFor({ state: 'visible' });
}

async function publish(page) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/invitations' && r.request().method() === 'POST');
  await page.locator('#publish-button').click();
  const result = await response;
  assert.equal(result.status(), 201, await result.text());
  return result.json();
}

async function assertNoOverflow(page, label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: horizontal overflow`);
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [320, 390, 768, 1440]) {
      const owner = await browser.newContext({ viewport: { width, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
      const recipient = await browser.newContext({ viewport: { width, height: 844 } });
      try {
        const page = await owner.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const title = `공유 검증 ${width} · 사진이 있는 초대장`;
        await createInvitation(page, width, title);
        const result = await publish(page);
        assert.match(result.id, /^[A-Za-z0-9]{22}$/);
        assert.equal(result.url, `/i/${result.id}`);
        await page.locator('#publish-status').filter({ hasText: /공개 링크|발행|공유/ }).waitFor();
        await assertNoOverflow(page, `owner ${width}`);
        await page.locator('#publish-button').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, `owner-${width}.png`), fullPage: true });
        const read = await recipient.newPage();
        read.on('pageerror', error => errors.push(error.message));
        await read.goto(new URL(result.url, baseUrl).href);
        const frame = read.frameLocator('iframe');
        await frame.locator('.invitation-card').waitFor();
        assert.ok((await frame.locator('body').innerText()).includes(title));
        await frame.locator('img[src^="data:image/"]').first().waitFor();
        assert.ok(await frame.locator('img[src^="data:image/"]').first().evaluate(image => image.complete && image.naturalWidth > 0));
        assert.ok(!((await read.locator('iframe').getAttribute('sandbox')) || '').includes('allow-same-origin'));
        await assertNoOverflow(read, `recipient ${width}`);
        assert.equal(await read.evaluate(() => localStorage.length), 0, 'recipient should not need owner local storage');
        await frame.locator('body').evaluate(async () => { await document.fonts.ready; });
        // Let Chromium present the newly attached sandboxed frame before visual capture.
        await read.waitForTimeout(1500);
        await read.screenshot({ path: path.join(output, `recipient-${width}.png`), fullPage: true, animations: 'disabled' });
        await page.getByRole('button', { name: /링크 복사/ }).first().click();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), new URL(result.url, baseUrl).href);
        const deletion = page.waitForResponse(r => r.request().method() === 'DELETE' && r.url().endsWith(result.id));
        await page.locator('[data-publish-action="revoke"]').first().click();
        assert.equal((await deletion).status(), 204);
        await read.reload();
        await read.getByText(/초대장을 열 수 없습니다|초대장을 찾을 수 없습니다|만료|삭제|취소/).first().waitFor();
        assert.deepEqual(errors, []);
        console.log(`PASS ${width}: real publish, independent recipient, photo, copy, cancellation, layout`);
      } finally {
        await owner.close();
        await recipient.close();
      }
    }

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      await createInvitation(page, 390, '응답 유실 재시도');
      let firstResult;
      let postCount = 0;
      await page.route('**/api/invitations', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        postCount += 1;
        if (postCount !== 1) return route.continue();
        const response = await route.fetch();
        assert.equal(response.status(), 201);
        firstResult = await response.json();
        await route.abort('failed');
      });
      await page.locator('#publish-button').click();
      await page.locator('#publish-status').filter({ hasText: /실패|연결|네트워크|다시/ }).waitFor();
      const retry = await publish(page);
      assert.equal(retry.id, firstResult.id, 'lost response retry must retain one publication');
      assert.equal(postCount, 2);
      await page.locator('[data-publish-action="revoke"]').first().click();
      console.log('PASS lost response: retry returns same publication');
    } finally { await context.close(); }

    const blocked = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      await blocked.addInitScript(() => {
        Storage.prototype.setItem = function () { throw new DOMException('Blocked', 'QuotaExceededError'); };
      });
      const page = await blocked.newPage();
      let writes = 0;
      page.on('request', request => {
        if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/invitations') writes += 1;
      });
      await createInvitation(page, 390, '관리 권한 저장 실패');
      await page.locator('#publish-button').click();
      await page.locator('#publish-status').filter({ hasText: /저장 공간|저장.*실패|저장.*없/ }).waitFor();
      assert.equal(writes, 0);
      console.log('PASS blocked browser storage: no remote publication');
    } finally { await blocked.close(); }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
