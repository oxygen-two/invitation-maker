// Render a typography/logo composition, not a runtime screenshot of private invitations.
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html lang="ko"><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#f7f7f4;color:#282b29;font-family:system-ui,-apple-system,sans-serif;display:grid;place-items:center}
      main{text-align:center;width:1080px;height:510px;border:1px solid #dce1d8;display:flex;align-items:center;justify-content:center;flex-direction:column}
      .icon{width:88px;height:88px;border-radius:24px;background:#e9eee6;display:grid;place-items:center;margin-bottom:28px;color:#314e41}
      svg{width:50px;height:50px}h1{font-size:64px;letter-spacing:-2.5px;margin:0;font-weight:700;line-height:1.25}p{margin:22px 0 0;font-size:28px;letter-spacing:-.6px;color:#59645e}
      .rule{width:42px;border-top:1px solid #9ba99b;margin-top:35px}
    </style><main><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></svg></div><h1>Invitation Studio</h1><p>작은 초대, 소중한 순간.</p><div class="rule"></div></main></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.resolve(__dirname, '../assets/social-preview-v1.png') });
    console.log('Rendered 1200×630 social-preview-v1.png');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
