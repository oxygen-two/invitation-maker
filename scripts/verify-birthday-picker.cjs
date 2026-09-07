// Optional browser regression. Start the static server first and provide an
// existing Playwright module through PLAYWRIGHT_MODULE; no install is performed.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const birthdayIds = ["modern", "color-pop", "cherry-muse", "silver-afterglow", "peach-table", "midnight-toast", "bloom-portrait", "signature-birthday"];

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => dialog.accept());
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(process.env.INVITATION_BASE_URL || "http://localhost:4173");
      await page.locator('[data-occasion-id="birthday"]').click();
      await page.evaluate(() => document.fonts.ready);
      const buttons = page.locator('#template-list button[data-template-id]');
      assert.deepEqual(await buttons.evaluateAll(nodes => nodes.map(node => node.dataset.templateId)), birthdayIds);
      const dimensions = await page.locator('[data-template-thumbnail-viewport]').evaluateAll(async nodes => {
        const samples = [];
        for (let frame = 0; frame < 12; frame++) {
          await new Promise(requestAnimationFrame);
          samples.push(nodes.map(node => ({ width: node.offsetWidth, height: node.offsetHeight })));
        }
        return samples;
      });
      assert.deepEqual(dimensions.at(-1), dimensions.at(-3), `unstable thumbnail sizing at ${width}`);
      assert.ok(dimensions.at(-1).every(box => box.width >= 140 && box.height > 0 && box.height < 1000), `collapsed birthday card at ${width}: ${JSON.stringify(dimensions.at(-1))}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page overflow at ${width}`);
      for (const id of birthdayIds) {
        const before = await page.locator('#preview .invitation-card').getAttribute("data-template");
        await page.locator(`#template-list button[data-template-id="${id}"]`).click();
        assert.equal(await page.evaluate(() => document.activeElement.dataset.templateId), id, `lost focus on ${id}`);
        assert.equal(await page.locator('#preview .invitation-card').getAttribute("data-template"), before, "selection replaced draft before Apply");
        await page.locator('#apply-template-button').click();
        assert.equal(await page.locator('#preview .invitation-card').getAttribute("data-template"), id);
        if (["silver-afterglow", "midnight-toast"].includes(id)) {
          const previewTab = page.locator('button[data-mobile-view="preview"]');
          const mobileTabs = await previewTab.isVisible();
          if (mobileTabs) await previewTab.click();
          await page.locator('#preview .invite-hero h1').waitFor({ state: "visible" });
          await page.evaluate(() => document.fonts.ready);
          const wrappedWords = await page.locator('#preview .invite-hero h1').evaluate(heading => {
            const text = heading.firstChild;
            return [...heading.textContent.matchAll(/\S+/g)].filter(match => {
              const range = document.createRange();
              range.setStart(text, match.index);
              range.setEnd(text, match.index + match[0].length);
              return range.getClientRects().length > 1;
            }).map(match => match[0]);
          });
          assert.deepEqual(wrappedWords, [], `default headline splits a word: ${id} at ${width}`);
          if (mobileTabs) await page.locator('button[data-mobile-view="editor"]').click();
        }
      }
      console.log(`PASS birthday picker: 8 visible-width cards, selection/apply and focus at ${width}px`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
