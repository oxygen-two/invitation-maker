# Landing Page and User Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a conversion-focused landing page at `/` (state-aware: returning studio users go straight to `/studio`) and a fixed-address user guide at `/guide`, without changing the studio's behaviour.

**Architecture:** The current `index.html` (the studio) is renamed to `studio.html`; a new hand-written `index.html` (landing) and `guide.html` share one stylesheet `assets/site/site.css`, one tiny script `assets/site/site.js`, and a `site` i18n namespace shipped as `dictionary-site-{ko,en}.js` that merges on top of the main dictionaries. Sample images and `sample.html` are produced by a Playwright build script and checked in, matching the existing error-page and social-preview pattern.

**Tech Stack:** Static HTML/CSS/JS, existing `InvitationI18n` engine, existing `InvitationAnalytics`, Node 22 `node:test`, Playwright via `PLAYWRIGHT_MODULE` (no npm dependency).

**Spec:** `docs/superpowers/specs/2026-09-18-landing-and-guide-design.md`

## Global Constraints

- No new npm dependencies. Playwright is loaded with `require(process.env.PLAYWRIGHT_MODULE || 'playwright')` and `chromium.launch({ channel: 'chrome' })`, exactly like `scripts/build-social-preview.cjs`.
- Palette for page chrome: paper `#f7f7f4`, ink `#282b29`, green `#314e41`, muted `#59645e`, line `#dce1d8`. No invitation palette on page chrome.
- No external fonts on landing/guide. No animation. `prefers-reduced-motion` only touches `scroll-behavior`.
- Korean inline copy in HTML must equal the `ko` dictionary value for its `data-i18n` key (tests enforce this, as they already do for the studio).
- Every `data-i18n` / `data-i18n-attr` key must exist in both `ko` and `en`.
- Canonical URLs in links are extension-less: `/studio`, `/guide`, `/welcome`, `/sample`.
- Never claim a completion time (no "3분").
- Policy numbers in the guide (7 days, 30 days, 2 MB) must be tied to `server/config/publishing.cjs` defaults and `assets/publishing/publishing.js` `MAX_PUBLISH_BYTES` by a test.
- Run `npm test` before every commit; it must stay green (baseline: 421 pass, 3 skipped).
- Use `/usr/bin/git` for git commands in this worktree (the `rtk` wrapper refuses worktree git otherwise).

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `studio.html` | The studio (renamed from `index.html`). Only header/footer links, canonical, and verification-tag removal change. |
| `index.html` | Landing. Redirect script in `<head>`, sections per spec §2. |
| `guide.html` | User guide. Sections per spec §3. |
| `assets/site/site.css` | Shared chrome + landing + guide styles. |
| `assets/site/site.js` | Language switcher population and CTA analytics on landing/guide. |
| `assets/i18n/dictionary-site-ko.js`, `assets/i18n/dictionary-site-en.js` | `site.*` namespace, merged onto the main dictionaries. |
| `assets/analytics/analytics.js` | Add three events to the allowlist. |
| `assets/studio/app.js` | Write the visited flag at `init()`. |
| `server/http/static.cjs` | Four clean-URL mappings. |
| `vercel.json` | Four routes. |
| `sitemap.xml` | Add `/guide`, `/studio`. |
| `scripts/build-site-media.cjs` | Playwright: 6 design PNGs, hero PNG, 3 guide step PNGs, `sample.html`. |
| `sample.html`, `assets/media/site/*.png` | Build outputs, checked in. |
| `tests/site-pages.test.js` | All new assertions. |
| `docs/landing-and-guide.md` | Operations doc. |

---

### Task 1: Rename the studio to `studio.html` and route `/studio`

**Files:**
- Rename: `index.html` → `studio.html`
- Modify: `studio.html` (`<head>` canonical + verification tags; brand link)
- Modify: `server/http/static.cjs:22-25`
- Modify: `vercel.json`
- Modify: `assets/studio/app.js:2133` (`init`)
- Modify: `tests/*.test.js` (every `"index.html"` read that targets the studio)
- Create: `tests/site-pages.test.js`

**Interfaces:**
- Produces: `/studio` → `studio.html` on Vercel and the local server; `localStorage["invitation-studio:visited"]` set by the studio; `staticFileFor(root, "/studio")` resolves to `<root>/studio.html`.

- [ ] **Step 1: Write failing tests**

Create `tests/site-pages.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { staticFileFor } = require("../server/http/static.cjs");

test("clean URLs resolve to the right static files on the local server", () => {
  assert.equal(staticFileFor(root, "/"), path.join(root, "index.html"));
  assert.equal(staticFileFor(root, "/welcome"), path.join(root, "index.html"));
  assert.equal(staticFileFor(root, "/studio"), path.join(root, "studio.html"));
  assert.equal(staticFileFor(root, "/guide"), path.join(root, "guide.html"));
  assert.equal(staticFileFor(root, "/sample"), path.join(root, "sample.html"));
});

test("vercel routes the clean URLs before the filesystem handler", () => {
  const { routes } = JSON.parse(read("vercel.json"));
  const filesystemIndex = routes.findIndex((route) => route.handle === "filesystem");
  const expected = {
    "/studio": "/studio.html",
    "/welcome": "/index.html",
    "/guide": "/guide.html",
    "/sample": "/sample.html"
  };
  for (const [src, dest] of Object.entries(expected)) {
    const index = routes.findIndex((route) => route.src === src && route.dest === dest);
    assert.ok(index >= 0, `${src} → ${dest} route missing`);
    assert.ok(index < filesystemIndex, `${src} route must precede handle: filesystem`);
  }
});

test("the studio lives at studio.html and no longer carries the root's search-console tags", () => {
  const studio = read("studio.html");
  assert.match(studio, /<link rel="canonical" href="https:\/\/invitation-maker-one\.vercel\.app\/studio">/);
  assert.doesNotMatch(studio, /google-site-verification/);
  assert.doesNotMatch(studio, /naver-site-verification/);
  assert.match(studio, /<a href="\/studio">Invitation Studio/);
});

test("the studio records that this browser has used it", () => {
  const app = read("assets/studio/app.js");
  assert.match(app, /localStorage\.setItem\("invitation-studio:visited"/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/site-pages.test.js`
Expected: 4 failing tests (`studio.html` missing, routes missing, `staticFileFor` returns null for `/studio`).

- [ ] **Step 3: Rename and update the studio**

```bash
/usr/bin/git mv index.html studio.html
```

In `studio.html`:
- Delete the two lines `<meta name="google-site-verification" ...>` and `<meta name="naver-site-verification" ...>` and the comment above them.
- Change `<link rel="canonical" href="https://invitation-maker-one.vercel.app/">` to `.../studio`.
- Change `<meta property="og:url" content="https://invitation-maker-one.vercel.app/">` to `.../studio`.
- Change the brand link `<a href="./">Invitation Studio<span ...>` to `<a href="/studio">Invitation Studio<span ...>`.
- Leave everything else untouched in this task.

- [ ] **Step 4: Map clean URLs on the local server**

In `server/http/static.cjs`, replace

```js
  if (decoded === "/" || decoded === "") decoded = "/index.html";
```

with

```js
  // Clean URLs. Keep this list identical to the `routes` in vercel.json so a
  // page that works under `npm start` also works in production.
  const CLEAN_URLS = { "/": "/index.html", "": "/index.html", "/welcome": "/index.html", "/studio": "/studio.html", "/guide": "/guide.html", "/sample": "/sample.html" };
  if (Object.hasOwn(CLEAN_URLS, decoded)) decoded = CLEAN_URLS[decoded];
```

- [ ] **Step 5: Add Vercel routes**

In `vercel.json`, insert before `{ "src": "/(server|api|docs|tests|scripts)(/.*)?", "status": 404 }`:

```json
    { "src": "/studio", "dest": "/studio.html" },
    { "src": "/welcome", "dest": "/index.html" },
    { "src": "/guide", "dest": "/guide.html" },
    { "src": "/sample", "dest": "/sample.html" },
```

- [ ] **Step 6: Record the visit in the studio**

In `assets/studio/app.js`, the first statement inside `const init = async () => {` (line 2133) becomes:

```js
  // The landing page at "/" sends anyone who has opened the studio before
  // straight back here. This flag is the only thing it reads; it is not the
  // draft, and losing it (private mode, cleared storage) just shows the
  // landing again.
  try { localStorage.setItem("invitation-studio:visited", new Date().toISOString()); } catch { /* storage unavailable */ }
```

- [ ] **Step 7: Point existing tests at `studio.html`**

Every test that reads the studio document must read `studio.html`. Apply with sed, then review the diff:

```bash
grep -ln '"index.html"' tests/*.test.js | xargs sed -i '' 's/"index\.html"/"studio.html"/g'
grep -n "index.html" tests/*.test.js scripts/synthetic/checks.cjs
```

Then fix by hand:
- `tests/i18n.test.js`: test names mentioning `index.html` → `studio.html`; the assertion message `"the studio keeps the default meta.title"` stays.
- `tests/i18n.test.js:552` loop `["shared.html", "viewer.html", "admin/public/index.html"]` — `admin/public/index.html` must NOT be changed back to studio; the sed only touched the exact string `"index.html"`, so verify the admin path survived.
- `tests/synthetic-monitoring.test.js:36` reads `"index.html"` as the body served at `/` for the search-console check. Leave it as `"index.html"` — that is still the root page, and Task 3 puts the tags there. Until Task 3 the synthetic test will fail; that is expected and noted in the commit message.
- `scripts/synthetic/checks.cjs:48` comment: change `index.html` to `index.html (the landing page)`.

- [ ] **Step 8: Run the whole suite**

Run: `npm test`
Expected: everything passes except `tests/synthetic-monitoring.test.js` cases that read the root page's verification tags (they will pass again after Task 3). Record the exact failing test names.

- [ ] **Step 9: Commit**

```bash
/usr/bin/git add -A
/usr/bin/git commit -m "Move the studio to /studio so the root can become a landing page"
```

---

### Task 2: Site dictionary, shared chrome, and analytics events

**Files:**
- Create: `assets/i18n/dictionary-site-ko.js`, `assets/i18n/dictionary-site-en.js`
- Create: `assets/site/site.css`, `assets/site/site.js`
- Modify: `assets/analytics/analytics.js:145-181` (allowlist), `:183-198` (string limits), `:305-320` (`normalizeAllowedValue`)
- Modify: `tests/site-pages.test.js`, `tests/i18n.test.js`

**Interfaces:**
- Produces: `InvitationI18n` gets `site.*` keys after loading the two site dictionaries; `window.InvitationSite.init()` populates `#language-select`, applies DOM, and binds `[data-site-event]` clicks; analytics events `site_page_viewed {page}`, `landing_cta_clicked {placement}`, `landing_sample_opened`.
- Key list (both languages must have exactly these keys under `site`):

```
site.meta.landingTitle, site.meta.landingDescription, site.meta.guideTitle, site.meta.guideDescription
site.header.tagline, site.header.guide, site.header.cta, site.header.skip, site.header.langLabel, site.header.langDescription
site.footer.brand, site.footer.about, site.footer.guide, site.footer.data, site.footer.note
site.landing.hero.eyebrow, .title, .lead, .cta, .sample, .imageAlt
site.landing.steps.title, .one.title, .one.text, .two.title, .two.text, .three.title, .three.text
site.landing.gallery.title, .lead, .cta, .bloomPortrait, .wedding, .firstChapter, .goldenYears, .botanical, .midnightCinema, .altPrefix
site.landing.trust.title, .one.title, .one.text, .two.title, .two.text, .three.title, .three.text, .link
site.landing.closing.title, .cta
site.guide.title, .lead, .toc.steps, .toc.finish, .toc.data, .toc.faq
site.guide.steps.title, .one.title, .one.text, .one.alt, .two.title, .two.text, .two.alt, .three.title, .three.text, .three.alt
site.guide.finish.title, .lead, .head.method, .head.where, .head.switch, .head.undo,
  .library.method, .library.where, .library.switch, .library.undo,
  .file.method, .file.where, .file.switch, .file.undo,
  .link.method, .link.where, .link.switch, .link.undo,
  .fileTitle, .fileText
site.guide.data.title, .one, .two, .three, .four, .five, .six
site.guide.faq.title, .q1, .a1, .q2, .a2, .q3, .a3, .q4, .a4, .q5, .a5, .q6, .a6, .q7, .a7, .q8, .a8
site.guide.closing.title, .cta
```

- [ ] **Step 1: Write failing tests**

Append to `tests/site-pages.test.js`:

```js
const loadI18n = () => {
  const I18n = require("../assets/i18n/i18n.js");
  const ko = require("../assets/i18n/dictionary-ko.js");
  const en = require("../assets/i18n/dictionary-en.js");
  const siteKo = require("../assets/i18n/dictionary-site-ko.js");
  const siteEn = require("../assets/i18n/dictionary-site-en.js");
  I18n.register("ko", { ...ko, ...siteKo });
  I18n.register("en", { ...en, ...siteEn });
  return I18n;
};

const flattenKeys = (object, prefix = "") => Object.entries(object).flatMap(([key, value]) =>
  value && typeof value === "object" ? flattenKeys(value, `${prefix}${key}.`) : [`${prefix}${key}`]);

test("site dictionaries expose the same keys in every language", () => {
  const ko = require("../assets/i18n/dictionary-site-ko.js");
  const en = require("../assets/i18n/dictionary-site-en.js");
  assert.deepEqual(Object.keys(ko), ["site"]);
  assert.deepEqual(flattenKeys(ko).sort(), flattenKeys(en).sort());
  assert.ok(flattenKeys(ko).length > 80);
});

test("site dictionaries merge onto the main dictionary instead of replacing it", () => {
  const source = read("assets/i18n/dictionary-site-ko.js");
  assert.match(source, /root\.InvitationDictionaryKo/);
  assert.match(source, /register\("ko"/);
});

test("guide policy numbers match the shipped defaults", () => {
  const { DEFAULT_PUBLISHING_CONFIG } = require("../server/config/publishing.cjs");
  const publishing = read("assets/publishing/publishing.js");
  const maxBytes = Number(publishing.match(/MAX_PUBLISH_BYTES = (\d+)/)[1]);
  const ko = require("../assets/i18n/dictionary-site-ko.js");
  assert.equal(DEFAULT_PUBLISHING_CONFIG.idleWindowDays, 7);
  assert.equal(DEFAULT_PUBLISHING_CONFIG.maxLifetimeDays, 30);
  assert.equal(maxBytes, 2_000_000);
  assert.match(ko.site.guide.data.two, /7일/);
  assert.match(ko.site.guide.data.two, /30일/);
  assert.match(ko.site.guide.faq.a1, /2MB/);
});

test("analytics allows the landing events and nothing more from them", () => {
  const source = read("assets/analytics/analytics.js");
  assert.match(source, /site_page_viewed: \["campaign", "flow_id", "medium", "page", "source"\]/);
  assert.match(source, /landing_cta_clicked: \["campaign", "flow_id", "medium", "placement", "source"\]/);
  assert.match(source, /landing_sample_opened: \["campaign", "flow_id", "medium", "source"\]/);
  assert.match(source, /placement: 16/);
});
```

Check whether `server/config/publishing.cjs` exports `DEFAULT_PUBLISHING_CONFIG`; if it only exports a resolver, export the constant too (one-line `module.exports` addition).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/site-pages.test.js`
Expected: the four new tests fail (modules not found / patterns missing).

- [ ] **Step 3: Write the Korean site dictionary**

Create `assets/i18n/dictionary-site-ko.js`:

```js
/* Korean copy for the landing page and the user guide.

   Kept apart from dictionary-ko.js so the studio never ships a page's worth
   of marketing and FAQ text it cannot display. The engine's register()
   replaces a language's dictionary wholesale, so this file re-registers the
   main dictionary with the `site` namespace merged on top. Load order:
   i18n.js → dictionary-ko.js → dictionary-en.js → this file → the English one. */
(function exposeSiteDictionaryKo(root, factory) {
  const dictionary = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = dictionary;
  }

  root.InvitationI18n?.register("ko", { ...(root.InvitationDictionaryKo || {}), ...dictionary });
  root.InvitationSiteDictionaryKo = dictionary;
})(typeof globalThis === "object" ? globalThis : this, function createSiteDictionaryKo() {
  return {
    site: {
      meta: {
        landingTitle: "Invitation Studio · 작은 초대, 소중한 순간",
        landingDescription: "회원가입 없이 디자인을 고르고 내용을 채워, 파일이나 링크로 보내는 무료 모바일 초대장.",
        guideTitle: "사용법 · Invitation Studio",
        guideDescription: "디자인 고르기, 내용 채우기, 완성 방식 세 가지, 내 데이터가 저장되는 곳까지 한 페이지에."
      },
      header: {
        tagline: "작은 날도, 특별하게.",
        guide: "사용법",
        cta: "초대장 만들기",
        skip: "본문으로 건너뛰기",
        langLabel: "언어 선택",
        langDescription: "표시 언어"
      },
      footer: {
        brand: "INVITATION STUDIO",
        about: "소개",
        guide: "사용법",
        data: "내 데이터",
        note: "작은 초대, 소중한 순간."
      },
      landing: {
        hero: {
          eyebrow: "회원가입 없음 · 무료",
          title: "작은 초대, 소중한 순간.",
          lead: "디자인을 고르고, 내용을 채우고, 파일이나 링크로 보내세요.",
          cta: "초대장 만들기",
          sample: "완성된 초대장 먼저 보기",
          imageAlt: "휴대폰 화면에 열린 완성 초대장 예시"
        },
        steps: {
          title: "세 단계면 됩니다",
          one: { title: "01 디자인 고르기", text: "생일, 결혼, 돌잔치, 모임. 행사에 맞는 디자인을 고르면 샘플이 바로 보입니다." },
          two: { title: "02 내용 채우기", text: "제목, 일정, 장소, 메시지를 적고 사진을 더하세요. 미리보기는 하객이 받는 화면 그대로입니다." },
          three: { title: "03 보관 · 파일 · 링크", text: "이 브라우저에 보관하거나, 파일 하나로 내려받거나, 공개 링크로 보내세요." }
        },
        gallery: {
          title: "디자인",
          lead: "취향으로 고르세요. 행사 유형마다 여러 디자인이 있습니다.",
          cta: "디자인 전체 보기",
          bloomPortrait: "생일",
          wedding: "결혼",
          firstChapter: "돌잔치",
          goldenYears: "환갑",
          botanical: "데이트",
          midnightCinema: "행사",
          altPrefix: "초대장 디자인 예시"
        },
        trust: {
          title: "안심하고 쓰세요",
          one: { title: "회원가입도 앱 설치도 없습니다", text: "브라우저에서 열어 바로 만듭니다. 이메일도 전화번호도 묻지 않습니다." },
          two: { title: "초안은 내 브라우저에만 남습니다", text: "쓰는 동안 자동으로 저장되지만, 서버로 보내지 않습니다." },
          three: { title: "파일은 영원히, 링크는 내가 정합니다", text: "파일로 받으면 계속 내 것입니다. 공개 링크는 시간이 지나면 만료되고, 원할 때 취소할 수 있습니다." },
          link: "내 데이터는 어디에 저장되나요"
        },
        closing: {
          title: "지금 만들어 보세요",
          cta: "초대장 만들기"
        }
      },
      guide: {
        title: "사용법",
        lead: "디자인을 고르고, 내용을 채우고, 원하는 방식으로 전하면 됩니다.",
        toc: { steps: "세 단계", finish: "완성 방식 세 가지", data: "내 데이터는 어디에", faq: "자주 묻는 질문" },
        steps: {
          title: "세 단계",
          one: {
            title: "01 디자인",
            text: "먼저 행사 유형을 고르고, 마음에 드는 디자인 카드를 누르면 샘플이 크게 보입니다. 마음에 들면 '이 디자인으로 만들기'를 누르세요. 나중에 디자인을 바꿔도 이미 쓴 내용은 그대로 남습니다.",
            alt: "스튜디오의 디자인 선택 화면"
          },
          two: {
            title: "02 내용 편집",
            text: "제목, 일정, 메시지 같은 기본 정보를 먼저 채우세요. 장소와 지도 링크는 그 아래에 있고, 사진과 효과는 접혀 있는 항목을 열면 나옵니다. 오른쪽 미리보기는 하객이 받는 문서와 정확히 같습니다.",
            alt: "스튜디오의 내용 편집 화면"
          },
          three: {
            title: "03 완성",
            text: "세 가지 방식 중 하나를 고릅니다. 초안은 쓰는 동안 이 브라우저에 자동 저장되니, 완성 화면에 오기 전에 닫아도 이어서 만들 수 있습니다.",
            alt: "스튜디오의 완성 화면"
          }
        },
        finish: {
          title: "완성 방식 세 가지",
          lead: "셋 중 무엇을 골라도 되고, 여러 개를 함께 써도 됩니다. 차이는 어디에 남느냐입니다.",
          head: { method: "방식", where: "남는 곳", switch: "브라우저를 바꾸면", undo: "되돌리기" },
          library: { method: "보관함에 저장", where: "이 브라우저", switch: "사라짐", undo: "목록에서 삭제" },
          file: { method: "파일로 저장", where: "내 기기의 HTML 파일", switch: "파일은 그대로", undo: "파일 삭제" },
          link: { method: "링크로 공유", where: "서버", switch: "링크는 살아 있고, 취소 권한은 이 브라우저에만", undo: "스튜디오에서 취소" },
          fileTitle: "HTML 파일은 어떻게 쓰나요",
          fileText: "사진까지 하나로 담긴 파일이라 어떤 브라우저에서든 열립니다. 메신저나 메일에 파일로 첨부해도 되고, 나중에 보관함에 다시 불러와 고칠 수도 있습니다."
        },
        data: {
          title: "내 데이터는 어디에",
          one: "초안과 보관함은 이 브라우저의 저장소에만 있습니다. 서버로 보내지 않습니다.",
          two: "공개 링크만 서버에 저장됩니다. 마지막으로 열린 뒤 7일이 지나면 만료되고, 아무리 자주 열려도 발행 후 30일이 지나면 만료됩니다. 만료된 링크는 열리지 않습니다.",
          three: "링크 취소는 발행한 브라우저의 스튜디오에서만 할 수 있습니다. 그 브라우저를 잃었다면 만료를 기다리는 수밖에 없습니다.",
          four: "공개 링크는 검색엔진에 색인되지 않습니다.",
          five: "방문 통계 도구를 씁니다. 브라우저의 추적 거부 설정을 존중하고, 초대장 내용은 통계로 보내지 않습니다.",
          six: "초대장을 받은 분이 자기 정보가 담긴 링크를 지우고 싶다면, 보낸 분에게 취소를 요청해 주세요."
        },
        faq: {
          title: "자주 묻는 질문",
          q1: "사진은 몇 장까지 넣을 수 있나요?",
          a1: "링크로 공유할 때는 초대장 전체가 2MB 안에 들어가야 합니다. 보통 사진 서너 장 정도입니다. 파일로 저장할 때는 제한이 없습니다.",
          q2: "사진이 안 올라가요.",
          a2: "너무 큰 사진이거나 지원하지 않는 형식일 수 있습니다. 휴대폰에서 찍은 JPG, PNG는 대부분 됩니다. 다른 사진으로 다시 시도해 보세요.",
          q3: "디자인을 바꾸면 쓴 내용이 사라지나요?",
          a3: "아니요. 제목, 일정, 사진, 항목 순서는 그대로 남고 디자인만 바뀝니다. 마음에 안 들면 되돌리기를 누르세요.",
          q4: "지도 링크는 어떤 걸 넣나요?",
          a4: "지도 앱에서 장소를 찾은 뒤 '공유'로 복사한 링크를 붙여 넣으세요. 링크가 없으면 하객은 장소 이름으로 지도를 검색하게 됩니다.",
          q5: "초대장 언어와 화면 언어는 다른가요?",
          a5: "네. 화면 언어는 이 도구의 메뉴와 안내에만 적용됩니다. 초대장에 쓴 내용은 쓴 그대로 하객에게 보입니다.",
          q6: "여러 개 만들 수 있나요?",
          a6: "네. 보관함에 여러 초대장을 저장하고 골라서 이어 만들 수 있습니다.",
          q7: "다른 기기에서 이어서 만들 수 있나요?",
          a7: "파일로 저장해 다른 기기로 옮긴 뒤, 그 기기의 보관함에 불러오세요. 초안은 브라우저마다 따로 있어 자동으로 옮겨지지 않습니다.",
          q8: "만료된 링크를 다시 살릴 수 있나요?",
          a8: "아니요. 보관함이나 파일에서 초대장을 열어 새 링크로 다시 발행하세요."
        },
        closing: {
          title: "이제 만들어 볼까요",
          cta: "초대장 만들기"
        }
      }
    };
});
```

- [ ] **Step 4: Write the English site dictionary**

Create `assets/i18n/dictionary-site-en.js` with the identical structure (same wrapper, `register("en", { ...(root.InvitationDictionaryEn || {}), ...dictionary })`, `root.InvitationSiteDictionaryEn = dictionary`). Check the actual global name in `dictionary-en.js` (`root.InvitationDictionaryEn`) before writing. English copy:

```js
    site: {
      meta: {
        landingTitle: "Invitation Studio · Small invitations, big moments",
        landingDescription: "Free mobile invitations with no sign-up: pick a design, fill it in, send it as a file or a link.",
        guideTitle: "How it works · Invitation Studio",
        guideDescription: "Choosing a design, filling it in, the three ways to finish, and where your data lives — on one page."
      },
      header: { tagline: "Make small days special.", guide: "How it works", cta: "Make an invitation", skip: "Skip to content", langLabel: "Language", langDescription: "Display language" },
      footer: { brand: "INVITATION STUDIO", about: "About", guide: "How it works", data: "Your data", note: "Small invitations, big moments." },
      landing: {
        hero: {
          eyebrow: "No sign-up · Free",
          title: "Small invitations, big moments.",
          lead: "Pick a design, fill it in, send it as a file or a link.",
          cta: "Make an invitation",
          sample: "See a finished invitation first",
          imageAlt: "A finished invitation open on a phone screen"
        },
        steps: {
          title: "Three steps",
          one: { title: "01 Pick a design", text: "Birthdays, weddings, first birthdays, get-togethers. Choose a design for the occasion and see a sample right away." },
          two: { title: "02 Fill it in", text: "Add the title, date, place, and a message, then photos if you like. The preview is exactly what your guests get." },
          three: { title: "03 Keep · File · Link", text: "Keep it in this browser, download a single file, or share a public link." }
        },
        gallery: {
          title: "Designs",
          lead: "Choose by taste. Every occasion has several designs.",
          cta: "See all designs",
          bloomPortrait: "Birthday",
          wedding: "Wedding",
          firstChapter: "First birthday",
          goldenYears: "60th birthday",
          botanical: "Date",
          midnightCinema: "Event",
          altPrefix: "Invitation design sample"
        },
        trust: {
          title: "Use it with confidence",
          one: { title: "No account, no app", text: "Open it in a browser and start. We never ask for an email or a phone number." },
          two: { title: "Drafts stay in your browser", text: "Your work is saved as you go, but it is never sent to a server." },
          three: { title: "Files are yours forever, links are yours to end", text: "A downloaded file stays with you. A public link expires on its own and can be revoked whenever you want." },
          link: "Where is my data stored?"
        },
        closing: { title: "Make one now", cta: "Make an invitation" }
      },
      guide: {
        title: "How it works",
        lead: "Pick a design, fill it in, and send it the way you prefer.",
        toc: { steps: "Three steps", finish: "Three ways to finish", data: "Where your data lives", faq: "Questions" },
        steps: {
          title: "Three steps",
          one: { title: "01 Design", text: "Choose the occasion first, then tap a design card to see the sample at full size. Press 'Use this design' when it feels right. You can change the design later without losing anything you have written.", alt: "The studio's design picker" },
          two: { title: "02 Content", text: "Start with the basics: title, date, and message. The place and map link come next, and photos and effects are in collapsed sections. The preview on the right is exactly the document your guests receive.", alt: "The studio's content editor" },
          three: { title: "03 Finish", text: "Choose one of three ways to finish. Your draft is saved to this browser as you write, so you can close the tab before this step and pick up later.", alt: "The studio's finish screen" }
        },
        finish: {
          title: "Three ways to finish",
          lead: "Any of them works, and you can use more than one. The difference is where the invitation ends up.",
          head: { method: "Method", where: "Where it lives", switch: "If you change browsers", undo: "Undo" },
          library: { method: "Save to library", where: "This browser", switch: "Gone", undo: "Delete from the list" },
          file: { method: "Save as a file", where: "An HTML file on your device", switch: "The file stays", undo: "Delete the file" },
          link: { method: "Share a link", where: "Our server", switch: "The link stays alive; only this browser can revoke it", undo: "Revoke in the studio" },
          fileTitle: "What do I do with the HTML file?",
          fileText: "It is one file with the photos inside, so it opens in any browser. Attach it in a messenger or an email, or import it back into the library later to edit it."
        },
        data: {
          title: "Where your data lives",
          one: "Drafts and the library live only in this browser's storage. They are never sent to a server.",
          two: "Only public links are stored on the server. A link expires 7 days after it was last opened, and no matter how often it is opened, 30 days after publishing. An expired link no longer opens.",
          three: "A link can only be revoked from the studio in the browser that published it. If that browser is gone, the link stays until it expires.",
          four: "Public links are not indexed by search engines.",
          five: "We use visit analytics. They respect your browser's do-not-track setting, and invitation content is never sent to them.",
          six: "If you received an invitation and want a link with your details removed, ask the sender to revoke it."
        },
        faq: {
          title: "Questions",
          q1: "How many photos can I add?",
          a1: "For a shared link the whole invitation must fit in 2MB — usually three or four photos. Saving as a file has no limit.",
          q2: "A photo will not upload.",
          a2: "It may be too large or in an unsupported format. JPG and PNG from a phone almost always work. Try a different photo.",
          q3: "Will changing the design erase what I wrote?",
          a3: "No. The title, date, photos, and item order stay; only the design changes. Use Undo if you preferred the previous one.",
          q4: "Which map link should I paste?",
          a4: "Find the place in your maps app and paste the link from its Share option. Without a link, guests search the map by the place name.",
          q5: "Is the invitation's language separate from the display language?",
          a5: "Yes. The display language only affects this tool's menus and hints. What you write in the invitation is shown to guests exactly as written.",
          q6: "Can I make more than one?",
          a6: "Yes. Save several invitations to the library and pick one to continue.",
          q7: "Can I continue on another device?",
          a7: "Save it as a file, move the file to the other device, and import it into that device's library. Drafts are per browser and do not move on their own.",
          q8: "Can an expired link be restored?",
          a8: "No. Open the invitation from the library or the file and publish a new link."
        },
        closing: { title: "Ready to make one?", cta: "Make an invitation" }
      }
    }
```

- [ ] **Step 5: Add the analytics events**

In `assets/analytics/analytics.js` inside `eventPropertyAllowlist`, after `landing_viewed`:

```js
    site_page_viewed: ["campaign", "flow_id", "medium", "page", "source"],
    landing_cta_clicked: ["campaign", "flow_id", "medium", "placement", "source"],
    landing_sample_opened: ["campaign", "flow_id", "medium", "source"],
```

In `stringLimits` add `placement: 16,` (alphabetical, after `page`). In `normalizeAllowedValue`, after the `page` line:

```js
    if (key === "placement") return includesValue(["header", "hero", "gallery", "footer"], normalized) ? normalized : "";
```

Find `pageKinds` and add `"landing"` and `"guide"` to it if they are not already present (read the array first; it currently lists the studio/viewer/shared kinds).

- [ ] **Step 6: Write the shared stylesheet**

Create `assets/site/site.css`. Requirements, not suggestions:

```css
/* Landing and guide chrome. Deliberately independent from studio.css: the
   studio's own colours come from the invitation palette and must not reach
   these pages (see docs/ui-ux-global-audit B-1/B-2). Same tokens as the
   generated error pages. */
:root { color-scheme: light; --paper: #f7f7f4; --ink: #282b29; --green: #314e41; --muted: #59645e; --line: #dce1d8; --tint: #e9eee6; }
* { box-sizing: border-box; }
html { background: var(--paper); }
body { margin: 0; background: var(--paper); color: var(--ink); font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.7; min-height: 100svh; display: flex; flex-direction: column; word-break: keep-all; }
a { color: inherit; }
a:focus-visible, button:focus-visible, select:focus-visible { outline: 3px solid var(--green); outline-offset: 4px; }
.skip { position: absolute; left: 20px; top: -80px; background: #fff; padding: 10px; z-index: 5; }
.skip:focus { top: 10px; }
[hidden] { display: none !important; }

/* Header / footer — identical markup on both pages (tested). */
.site-header, .site-footer { width: min(1200px, 100%); margin-inline: auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 32px; }
.site-brand { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; font-size: 19px; font-weight: 700; letter-spacing: -.6px; text-decoration: none; }
.site-brand svg { width: 25px; height: 25px; }
.site-brand span { display: none; }
.site-nav { display: flex; align-items: center; gap: 14px; }
.site-nav a:not(.site-cta) { min-height: 44px; display: inline-flex; align-items: center; text-decoration: none; font-size: 14px; font-weight: 600; }
.site-language { display: flex; align-items: center; gap: 6px; }
.site-language label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.site-language select { min-height: 44px; font: inherit; font-size: 14px; border: 1px solid var(--line); border-radius: 9px; background: #fff; color: var(--ink); padding: 0 10px; }
.site-cta { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 11px 22px; border-radius: 9px; background: var(--green); color: #fff; font-size: 15px; font-weight: 650; text-decoration: none; }
.site-cta:hover { box-shadow: 0 0 0 2px #314e4125; }
.site-cta.secondary { background: transparent; color: var(--green); border: 1px solid #b9c4b9; }
.site-footer { border-top: 1px solid var(--line); margin-top: auto; font-size: 12px; letter-spacing: 1px; color: var(--muted); padding-bottom: max(24px, env(safe-area-inset-bottom)); flex-wrap: wrap; }
.site-footer nav { display: flex; gap: 18px; letter-spacing: 0; }
.site-footer nav a { min-height: 44px; display: inline-flex; align-items: center; text-decoration: none; }
.site-footer-note { letter-spacing: 0; }

main { width: min(1100px, 100%); margin-inline: auto; padding: 0 32px 64px; }
section { padding-block: 48px; }
section + section { border-top: 1px solid var(--line); }
h1, h2, h3 { letter-spacing: -.8px; line-height: 1.35; margin: 0 0 14px; }
h1 { font-size: clamp(30px, 4.5vw, 52px); }
h2 { font-size: clamp(22px, 2.6vw, 30px); }
h3 { font-size: 18px; }
.eyebrow { font-size: 11px; letter-spacing: 2.2px; font-weight: 700; color: var(--green); margin: 0 0 12px; text-transform: uppercase; }
.lead { color: var(--muted); font-size: 17px; max-width: 520px; margin: 0 0 24px; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.text-link { color: var(--green); font-weight: 600; min-height: 44px; display: inline-flex; align-items: center; }

/* Landing */
.hero { display: grid; grid-template-columns: 1.1fr .9fr; gap: 56px; align-items: center; padding-top: 32px; }
.hero-media { display: grid; place-items: center; }
.phone { width: min(300px, 100%); border-radius: 36px; padding: 12px; background: var(--ink); box-shadow: 0 30px 40px -24px #283d3260; }
.phone img { display: block; width: 100%; height: auto; border-radius: 26px; background: #fff; }
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.step { padding: 20px; border: 1px solid var(--line); border-radius: 14px; background: #fff; }
.step h3 { color: var(--green); }
.step p { margin: 0; color: var(--muted); font-size: 15px; }
.designs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 28px; }
.design { margin: 0; }
.design img { display: block; width: 100%; height: auto; border-radius: 14px; border: 1px solid var(--line); background: #fff; }
.design figcaption { margin-top: 8px; font-size: 13px; color: var(--muted); }
.trust { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 20px; }
.trust article { padding: 20px; border-radius: 14px; background: var(--tint); }
.trust p { margin: 0; color: var(--muted); font-size: 15px; }
.closing { text-align: center; }
.closing .actions { justify-content: center; }

/* Guide */
.toc { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; padding: 0; list-style: none; }
.toc a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--line); background: #fff; text-decoration: none; font-size: 14px; font-weight: 600; }
.guide-step { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: center; padding-block: 24px; }
.guide-step img { display: block; width: 100%; height: auto; border-radius: 14px; border: 1px solid var(--line); background: #fff; }
.guide-step p { margin: 0; color: var(--muted); }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; min-width: 560px; font-size: 15px; }
th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 12px; letter-spacing: 1px; color: var(--muted); text-transform: uppercase; }
td:first-child { font-weight: 650; }
.data-list { padding-left: 20px; margin: 0; }
.data-list li { margin-bottom: 10px; }
details { border: 1px solid var(--line); border-radius: 12px; background: #fff; padding: 0 18px; margin-bottom: 10px; }
summary { cursor: pointer; min-height: 48px; display: flex; align-items: center; font-weight: 650; list-style: none; }
summary::-webkit-details-marker { display: none; }
summary::after { content: "+"; margin-left: auto; color: var(--green); font-size: 20px; }
details[open] summary::after { content: "–"; }
details p { margin: 0 0 16px; color: var(--muted); }

@media (max-width: 900px) {
  .hero, .steps, .trust, .guide-step { grid-template-columns: 1fr; }
  .designs { grid-template-columns: repeat(2, 1fr); }
  .site-header, .site-footer { padding: 14px 20px; }
  .site-nav a:not(.site-cta):not(.site-language a) { display: none; }
  main { padding-inline: 20px; }
  section { padding-block: 36px; }
  .hero .actions .site-cta { width: 100%; }
  .site-footer { flex-direction: column; align-items: flex-start; gap: 8px; }
}
@media (max-width: 350px) { .site-cta { width: 100%; } .site-nav { gap: 8px; } }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
```

- [ ] **Step 7: Write the site script**

Create `assets/site/site.js`:

```js
/* Landing / guide behaviour. Deliberately tiny: the language switcher and
   a couple of analytics events. Anything heavier belongs in the studio. */
(function siteScript(root) {
  const I18n = root.InvitationI18n;
  const analytics = root.InvitationAnalytics;
  const escapeAttribute = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

  const populateLanguageSwitcher = (select) => {
    if (!select || !I18n) return;
    select.innerHTML = I18n.getLanguages()
      .map(({ language, label }) => `<option value="${escapeAttribute(language)}">${escapeAttribute(label)}</option>`)
      .join("");
    select.value = I18n.getLanguage();
    select.addEventListener("change", () => { I18n.setLanguage(select.value); });
    I18n.subscribe(() => { select.value = I18n.getLanguage(); });
  };

  const track = (eventName, props) => {
    try { analytics?.track?.(eventName, props); } catch { /* analytics is optional */ }
  };

  const init = () => {
    try { analytics?.init?.(); } catch { /* optional */ }
    try { root.InvitationErrorReporting?.init?.(); } catch { /* optional */ }
    populateLanguageSwitcher(document.querySelector("#language-select"));
    I18n?.applyDom(document);
    track("site_page_viewed", { page: document.body.dataset.sitePage });
    for (const element of document.querySelectorAll("[data-site-event]")) {
      element.addEventListener("click", () => {
        track(element.dataset.siteEvent, { placement: element.dataset.sitePlacement });
      });
    }
  };

  root.InvitationSite = { init };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(typeof window !== "undefined" ? window : globalThis);
```

Check `I18n.getLanguages()` returns `[{ language, label }]` (it does in `app.js:2509`) and that `applyDom(document)` is the right call (see `app.js:2560`).

- [ ] **Step 8: Extend the i18n key-set test**

In `tests/i18n.test.js`, find the test that compares `ko` and `en` key sets (search for `flatten` or `keys` near the top). Add a sibling assertion that `dictionary-site-ko.js` and `dictionary-site-en.js` have identical flattened keys, or confirm the new test in `tests/site-pages.test.js` already covers it and skip this step.

- [ ] **Step 9: Run the tests**

Run: `node --test tests/site-pages.test.js tests/analytics.test.js tests/i18n.test.js`
Expected: PASS. The analytics "restricted to configured enums" test must still pass; if it enumerates the allowlist, update its expectation.

- [ ] **Step 10: Commit**

```bash
/usr/bin/git add assets/i18n/dictionary-site-ko.js assets/i18n/dictionary-site-en.js assets/site assets/analytics/analytics.js tests
/usr/bin/git commit -m "Add the site dictionary, shared page chrome, and landing analytics events"
```

---

### Task 3: The landing page

**Files:**
- Create: `index.html`
- Modify: `tests/site-pages.test.js`

**Interfaces:**
- Consumes: `site.*` keys, `assets/site/site.css`, `assets/site/site.js`, images at `assets/media/site/hero-sample@2x.png` and `assets/media/site/design-<id>@2x.png` (Task 5 produces them; reference them now with explicit `width`/`height`).
- Produces: `/` with the redirect script and the root's meta tags.

- [ ] **Step 1: Write failing tests**

Append to `tests/site-pages.test.js`:

```js
const parseTagAttributes = (tag) => Object.fromEntries([...tag.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

const assertPageIsTranslatable = (file, minimumBindings) => {
  const I18n = loadI18n();
  const html = read(file);
  const bindings = [...html.matchAll(/<([a-z0-9]+)\b([^>]*\bdata-i18n="[^"]+"[^>]*)>([^<]*)</gi)];
  assert.ok(bindings.length >= minimumBindings, `${file}: expected at least ${minimumBindings} translatable elements`);
  for (const [, , attributes, text] of bindings) {
    const key = parseTagAttributes(`<x ${attributes}>`)["data-i18n"];
    assert.equal(text.trim(), I18n.t(key, undefined, "ko"), `${file} text for ${key} has drifted from dictionary-site-ko.js`);
  }
  const keys = [
    ...[...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap((m) => m[1].split(";")).map((pair) => pair.split(":")[1])
  ].filter(Boolean).map((key) => key.trim());
  for (const key of keys) {
    for (const language of I18n.SUPPORTED) assert.equal(I18n.hasKey(key, language), true, `${language} has no ${key}`);
  }
};

test("the landing page is fully translatable and its Korean copy matches the dictionary", () => {
  assertPageIsTranslatable("index.html", 40);
});

test("the landing page owns the root's search metadata", () => {
  const landing = read("index.html");
  assert.match(landing, /<meta name="google-site-verification" content="k0bGP9otm9hmWB_sAZmrRd4dF6ClSKZCx5s_IkHjVeM">/);
  assert.match(landing, /<meta name="naver-site-verification" content="323c12e50a81986273c33141f5fcdf9cae3c2ef6">/);
  assert.match(landing, /<link rel="canonical" href="https:\/\/invitation-maker-one\.vercel\.app\/">/);
  assert.match(landing, /"@type": "WebApplication"/);
  assert.match(landing, /og:image" content="https:\/\/invitation-maker-one\.vercel\.app\/assets\/media\/social-preview-v1\.png"/);
});

test("the landing page sends returning studio users straight to /studio, but never from /welcome", () => {
  const landing = read("index.html");
  const script = landing.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.match(script, /invitation-studio:visited/);
  assert.match(script, /location\.replace\("\/studio" \+ location\.search\)/);
  assert.match(script, /welcome/);
  assert.match(script, /try \{/);
  // It must run before any stylesheet so a returning user never paints the landing.
  assert.ok(landing.indexOf("<script>") < landing.indexOf('<link rel="stylesheet"'));
});

test("landing links use canonical clean URLs and the sample opens in a new tab", () => {
  const landing = read("index.html");
  assert.match(landing, /href="\/studio"[^>]*data-site-event="landing_cta_clicked" data-site-placement="hero"/);
  assert.match(landing, /href="\/sample" target="_blank" rel="noopener"[^>]*data-site-event="landing_sample_opened"/);
  assert.match(landing, /href="\/guide#data"/);
  assert.doesNotMatch(landing, /href="[^"]*\.html"/);
  assert.doesNotMatch(landing, /fonts\.googleapis\.com/);
});

test("both site pages share the exact same header and footer markup", () => {
  const chrome = (file) => {
    const html = read(file);
    return [html.match(/<header class="site-header">[\s\S]*?<\/header>/)[0], html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)[0]];
  };
  assert.deepEqual(chrome("index.html"), chrome("guide.html"));
});
```

Note: `loadI18n()` from Task 2 registers merged dictionaries once per process; `I18n.t(key, undefined, "ko")` is the signature `tests/i18n.test.js` already uses. The shared-chrome test will fail until Task 4 creates `guide.html`; that is expected.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/site-pages.test.js`
Expected: the landing tests fail with `ENOENT index.html`.

- [ ] **Step 3: Write `index.html`**

```html
<!doctype html>
<!-- The landing page. "/" is state-aware: a browser that has opened the
     studio before is sent to /studio by the inline script below, before any
     stylesheet loads. "/welcome" is the same document without that redirect.
     Crawlers have no localStorage and always see this page. -->
<html lang="ko" data-i18n-title="site.meta.landingTitle">
<head>
  <meta charset="utf-8">
  <script>
    try {
      var isRoot = location.pathname === "/" || location.pathname === "/index.html";
      var stay = new URLSearchParams(location.search).has("welcome");
      if (isRoot && !stay && localStorage.getItem("invitation-studio:visited")) {
        location.replace("/studio" + location.search);
      }
    } catch (error) { /* No storage, no redirect: show the landing. */ }
  </script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#f7f7f4">
  <meta name="description" data-i18n-attr="content:site.meta.landingDescription" content="회원가입 없이 디자인을 고르고 내용을 채워, 파일이나 링크로 보내는 무료 모바일 초대장.">
  <!-- Ownership proofs for the two search consoles this site is registered
       with. Both are re-checked periodically rather than once, so deleting
       either tag silently drops that verification and the reports with it. -->
  <meta name="google-site-verification" content="k0bGP9otm9hmWB_sAZmrRd4dF6ClSKZCx5s_IkHjVeM">
  <meta name="naver-site-verification" content="323c12e50a81986273c33141f5fcdf9cae3c2ef6">
  <link rel="canonical" href="https://invitation-maker-one.vercel.app/">
  <meta property="og:type" content="website">
  <meta property="og:locale" data-i18n-attr="content:meta.ogLocale" content="ko_KR">
  <meta property="og:site_name" content="Invitation Studio">
  <meta property="og:title" data-i18n-attr="content:site.meta.landingTitle" content="Invitation Studio · 작은 초대, 소중한 순간">
  <meta property="og:description" data-i18n-attr="content:site.meta.landingDescription" content="회원가입 없이 디자인을 고르고 내용을 채워, 파일이나 링크로 보내는 무료 모바일 초대장.">
  <meta property="og:url" content="https://invitation-maker-one.vercel.app/">
  <meta property="og:image" content="https://invitation-maker-one.vercel.app/assets/media/social-preview-v1.png">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" data-i18n-attr="content:meta.ogImageAlt" content="봉투 로고와 Invitation Studio — 작은 초대, 소중한 순간">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" data-i18n-attr="content:site.meta.landingTitle" content="Invitation Studio · 작은 초대, 소중한 순간">
  <meta name="twitter:description" data-i18n-attr="content:site.meta.landingDescription" content="회원가입 없이 디자인을 고르고 내용을 채워, 파일이나 링크로 보내는 무료 모바일 초대장.">
  <meta name="twitter:image" content="https://invitation-maker-one.vercel.app/assets/media/social-preview-v1.png">
  <script type="application/ld+json">
  { ...copy the WebApplication block verbatim from studio.html, url "https://invitation-maker-one.vercel.app/" ... }
  </script>
  <title>Invitation Studio · 작은 초대, 소중한 순간</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ctext y='48' font-size='46'%3E%F0%9F%92%8C%3C/text%3E%3C/svg%3E">
  <link rel="stylesheet" href="/assets/site/site.css">
  <script src="/assets/i18n/i18n.js"></script>
  <script src="/assets/i18n/dictionary-ko.js"></script>
  <script src="/assets/i18n/dictionary-en.js"></script>
  <script src="/assets/i18n/dictionary-site-ko.js"></script>
  <script src="/assets/i18n/dictionary-site-en.js"></script>
  <script>InvitationI18n.init();</script>
</head>
<body data-site-page="landing">
  <a class="skip" href="#main" data-i18n="site.header.skip">본문으로 건너뛰기</a>
  <header class="site-header">
    <a class="site-brand" href="/welcome"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></svg>Invitation Studio<span data-i18n="site.header.tagline">작은 날도, 특별하게.</span></a>
    <nav class="site-nav" aria-label="사이트" data-i18n-attr="aria-label:nav.stepsLabel">
      <a href="/guide" data-i18n="site.header.guide">사용법</a>
      <div class="site-language">
        <label for="language-select" data-i18n="site.header.langDescription">표시 언어</label>
        <select id="language-select" data-i18n-attr="aria-label:site.header.langLabel" aria-label="언어 선택"></select>
      </div>
      <a class="site-cta" href="/studio" data-site-event="landing_cta_clicked" data-site-placement="header" data-i18n="site.header.cta">초대장 만들기</a>
    </nav>
  </header>
  <main id="main" tabindex="-1">
    <section class="hero">
      <div>
        <p class="eyebrow" data-i18n="site.landing.hero.eyebrow">회원가입 없음 · 무료</p>
        <h1 data-i18n="site.landing.hero.title">작은 초대, 소중한 순간.</h1>
        <p class="lead" data-i18n="site.landing.hero.lead">디자인을 고르고, 내용을 채우고, 파일이나 링크로 보내세요.</p>
        <div class="actions">
          <a class="site-cta" href="/studio" data-site-event="landing_cta_clicked" data-site-placement="hero" data-i18n="site.landing.hero.cta">초대장 만들기</a>
          <a class="text-link" href="/sample" target="_blank" rel="noopener" data-site-event="landing_sample_opened" data-i18n="site.landing.hero.sample">완성된 초대장 먼저 보기</a>
        </div>
      </div>
      <div class="hero-media">
        <div class="phone"><img src="/assets/media/site/hero-sample@2x.png" width="780" height="1688" alt="휴대폰 화면에 열린 완성 초대장 예시" data-i18n-attr="alt:site.landing.hero.imageAlt"></div>
      </div>
    </section>
    <section aria-labelledby="steps-title">
      <h2 id="steps-title" data-i18n="site.landing.steps.title">세 단계면 됩니다</h2>
      <div class="steps">
        <article class="step"><h3 data-i18n="site.landing.steps.one.title">01 디자인 고르기</h3><p data-i18n="site.landing.steps.one.text">…</p></article>
        <article class="step"><h3 data-i18n="site.landing.steps.two.title">02 내용 채우기</h3><p data-i18n="site.landing.steps.two.text">…</p></article>
        <article class="step"><h3 data-i18n="site.landing.steps.three.title">03 보관 · 파일 · 링크</h3><p data-i18n="site.landing.steps.three.text">…</p></article>
      </div>
    </section>
    <section aria-labelledby="designs-title">
      <h2 id="designs-title" data-i18n="site.landing.gallery.title">디자인</h2>
      <p class="lead" data-i18n="site.landing.gallery.lead">취향으로 고르세요. 행사 유형마다 여러 디자인이 있습니다.</p>
      <div class="designs">
        <figure class="design"><img loading="lazy" src="/assets/media/site/design-bloom-portrait@2x.png" width="780" height="1688" alt="초대장 디자인 예시 · 생일"><figcaption data-i18n="site.landing.gallery.bloomPortrait">생일</figcaption></figure>
        … five more: wedding, first-chapter, golden-years, botanical, midnight-cinema …
      </div>
      <div class="actions"><a class="site-cta secondary" href="/studio" data-site-event="landing_cta_clicked" data-site-placement="gallery" data-i18n="site.landing.gallery.cta">디자인 전체 보기</a></div>
    </section>
    <section aria-labelledby="trust-title">
      <h2 id="trust-title" data-i18n="site.landing.trust.title">안심하고 쓰세요</h2>
      <div class="trust">
        <article><h3 data-i18n="site.landing.trust.one.title">…</h3><p data-i18n="site.landing.trust.one.text">…</p></article>
        <article><h3 data-i18n="site.landing.trust.two.title">…</h3><p data-i18n="site.landing.trust.two.text">…</p></article>
        <article><h3 data-i18n="site.landing.trust.three.title">…</h3><p data-i18n="site.landing.trust.three.text">…</p></article>
      </div>
      <a class="text-link" href="/guide#data" data-i18n="site.landing.trust.link">내 데이터는 어디에 저장되나요</a>
    </section>
    <section class="closing" aria-labelledby="closing-title">
      <h2 id="closing-title" data-i18n="site.landing.closing.title">지금 만들어 보세요</h2>
      <div class="actions"><a class="site-cta" href="/studio" data-site-event="landing_cta_clicked" data-site-placement="footer" data-i18n="site.landing.closing.cta">초대장 만들기</a></div>
    </section>
  </main>
  <footer class="site-footer">
    <span data-i18n="site.footer.brand">INVITATION STUDIO</span>
    <nav aria-label="바닥글" data-i18n-attr="aria-label:site.footer.brand"><a href="/welcome" data-i18n="site.footer.about">소개</a><a href="/guide" data-i18n="site.footer.guide">사용법</a><a href="/guide#data" data-i18n="site.footer.data">내 데이터</a></nav>
    <span class="site-footer-note" data-i18n="site.footer.note">작은 초대, 소중한 순간.</span>
  </footer>
  <script src="/assets/analytics/config.js"></script>
  <script src="/assets/analytics/analytics.js"></script>
  <script src="/assets/analytics/error-reporting.js"></script>
  <script type="module" src="/assets/analytics/ga4.js"></script>
  <script src="/assets/site/site.js"></script>
</body>
</html>
```

Rules while filling in the `…`:
- Every `…` is the exact `ko` dictionary value for that key. No paraphrasing: the test compares character for character.
- Design `alt` texts are `"초대장 디자인 예시 · <행사명>"` with `data-i18n-attr="alt:site.landing.gallery.altPrefix"` omitted (the prefix alone is not a full alt). Instead give each image a static Korean alt and mark the figure `aria-label` unused. Keep it simple: `alt` = Korean, no `data-i18n-attr` on it. Add a comment explaining the alt stays Korean because the screenshots are Korean.
- Header nav `aria-label` uses key `nav.stepsLabel`? No — that is the studio's "제작 단계". Use a plain `aria-label="사이트"` without `data-i18n-attr`, or add `site.header.navLabel` ("사이트" / "Site") to both dictionaries. Add the key.
- Footer nav `aria-label`: add `site.footer.navLabel` ("바닥글 링크" / "Footer links"). Add the key.
- Image dimensions: `780×1688` assumes a 390×844 iframe at 2× — Task 5 must produce exactly that; if the preview frame is a different size, update both the images and these attributes together.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/site-pages.test.js`
Expected: all landing tests pass; only "both site pages share the exact same header and footer" fails (`guide.html` missing).
Run: `npm test`
Expected: `tests/synthetic-monitoring.test.js` passes again (root page has the tags).

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add index.html tests/site-pages.test.js assets/i18n
/usr/bin/git commit -m "Add the landing page with a state-aware root"
```

---

### Task 4: The guide page

**Files:**
- Create: `guide.html`
- Modify: `tests/site-pages.test.js`

**Interfaces:**
- Consumes: `site.guide.*` keys, shared chrome markup copied verbatim from `index.html` (header CTA `data-site-placement="header"` is fine on both pages; the guide's `data-site-page` is `guide`).
- Produces: `/guide` with anchors `#steps`, `#finish`, `#data`, `#faq`.

- [ ] **Step 1: Write failing tests**

Append to `tests/site-pages.test.js`:

```js
test("the guide is fully translatable and its Korean copy matches the dictionary", () => {
  assertPageIsTranslatable("guide.html", 70);
});

test("the guide has the anchors the landing and the studio link to", () => {
  const guide = read("guide.html");
  for (const id of ["steps", "finish", "data", "faq"]) assert.match(guide, new RegExp(`<section[^>]* id="${id}"`));
  assert.match(guide, /<meta name="robots" content="index, follow">/);
  assert.match(guide, /<link rel="canonical" href="https:\/\/invitation-maker-one\.vercel\.app\/guide">/);
  assert.doesNotMatch(guide, /google-site-verification/);
  assert.equal((guide.match(/<details>/g) || []).length, 8);
  assert.doesNotMatch(guide, /<script>\s*try \{/, "the guide never redirects");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/site-pages.test.js`
Expected: guide tests fail with `ENOENT guide.html`.

- [ ] **Step 3: Write `guide.html`**

Same `<head>` shape as the landing minus the redirect script, verification tags, and JSON-LD; `data-i18n-title="site.meta.guideTitle"`, canonical `/guide`, `og:url` `/guide`, `og:title`/`description` from `site.meta.guide*`, `<meta name="robots" content="index, follow">`. Same script/stylesheet includes. `<body data-site-page="guide">`. Header and footer markup copied byte-for-byte from `index.html`.

`<main>`:

```html
  <main id="main" tabindex="-1">
    <section>
      <h1 data-i18n="site.guide.title">사용법</h1>
      <p class="lead" data-i18n="site.guide.lead">디자인을 고르고, 내용을 채우고, 원하는 방식으로 전하면 됩니다.</p>
      <ul class="toc">
        <li><a href="#steps" data-i18n="site.guide.toc.steps">세 단계</a></li>
        <li><a href="#finish" data-i18n="site.guide.toc.finish">완성 방식 세 가지</a></li>
        <li><a href="#data" data-i18n="site.guide.toc.data">내 데이터는 어디에</a></li>
        <li><a href="#faq" data-i18n="site.guide.toc.faq">자주 묻는 질문</a></li>
      </ul>
    </section>
    <section id="steps" aria-labelledby="steps-title">
      <h2 id="steps-title" data-i18n="site.guide.steps.title">세 단계</h2>
      <article class="guide-step">
        <div><h3 data-i18n="site.guide.steps.one.title">01 디자인</h3><p data-i18n="site.guide.steps.one.text">…</p></div>
        <img loading="lazy" src="/assets/media/site/guide-step-01@2x.png" width="2880" height="1800" alt="스튜디오의 디자인 선택 화면" data-i18n-attr="alt:site.guide.steps.one.alt">
      </article>
      … two and three, same shape …
    </section>
    <section id="finish" aria-labelledby="finish-title">
      <h2 id="finish-title" data-i18n="site.guide.finish.title">완성 방식 세 가지</h2>
      <p class="lead" data-i18n="site.guide.finish.lead">…</p>
      <div class="table-wrap"><table>
        <thead><tr><th data-i18n="site.guide.finish.head.method">방식</th><th data-i18n="site.guide.finish.head.where">남는 곳</th><th data-i18n="site.guide.finish.head.switch">브라우저를 바꾸면</th><th data-i18n="site.guide.finish.head.undo">되돌리기</th></tr></thead>
        <tbody>
          <tr><td data-i18n="site.guide.finish.library.method">보관함에 저장</td><td data-i18n="site.guide.finish.library.where">이 브라우저</td><td data-i18n="site.guide.finish.library.switch">사라짐</td><td data-i18n="site.guide.finish.library.undo">목록에서 삭제</td></tr>
          <tr>… file …</tr>
          <tr>… link …</tr>
        </tbody>
      </table></div>
      <h3 data-i18n="site.guide.finish.fileTitle">HTML 파일은 어떻게 쓰나요</h3>
      <p data-i18n="site.guide.finish.fileText">…</p>
    </section>
    <section id="data" aria-labelledby="data-title">
      <h2 id="data-title" data-i18n="site.guide.data.title">내 데이터는 어디에</h2>
      <ul class="data-list">
        <li data-i18n="site.guide.data.one">…</li>
        … two … six …
      </ul>
    </section>
    <section id="faq" aria-labelledby="faq-title">
      <h2 id="faq-title" data-i18n="site.guide.faq.title">자주 묻는 질문</h2>
      <details><summary data-i18n="site.guide.faq.q1">…</summary><p data-i18n="site.guide.faq.a1">…</p></details>
      … q2–q8 …
    </section>
    <section class="closing" aria-labelledby="closing-title">
      <h2 id="closing-title" data-i18n="site.guide.closing.title">이제 만들어 볼까요</h2>
      <div class="actions"><a class="site-cta" href="/studio" data-site-event="landing_cta_clicked" data-site-placement="footer" data-i18n="site.guide.closing.cta">초대장 만들기</a></div>
    </section>
  </main>
```

Guide screenshots are 1440×900 at 2× = `2880×1800`; Task 5 must produce exactly that.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/site-pages.test.js && npm test`
Expected: everything passes, including the shared-chrome test.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add guide.html tests/site-pages.test.js assets/i18n
/usr/bin/git commit -m "Add the user guide at /guide"
```

---

### Task 5: Build the sample images and `sample.html`

**Files:**
- Create: `scripts/build-site-media.cjs`
- Create (outputs): `assets/media/site/hero-sample@2x.png`, `assets/media/site/design-{bloom-portrait,wedding,first-chapter,golden-years,botanical,midnight-cinema}@2x.png`, `assets/media/site/guide-step-0{1,2,3}@2x.png`, `sample.html`
- Modify: `tests/site-pages.test.js`, `sitemap.xml`

**Interfaces:**
- Consumes: a running `npm start` at `INVITATION_BASE_URL` (default `http://localhost:4173`), `/studio`.
- Produces: the files above; `sample.html` is the studio's `#preview` `srcdoc` plus a `noindex` meta.

- [ ] **Step 1: Write failing tests**

Append to `tests/site-pages.test.js`:

```js
test("site media and the sample invitation are checked in", () => {
  const files = [
    "assets/media/site/hero-sample@2x.png",
    ...["bloom-portrait", "wedding", "first-chapter", "golden-years", "botanical", "midnight-cinema"].map((id) => `assets/media/site/design-${id}@2x.png`),
    "assets/media/site/guide-step-01@2x.png",
    "assets/media/site/guide-step-02@2x.png",
    "assets/media/site/guide-step-03@2x.png",
    "sample.html"
  ];
  for (const file of files) assert.ok(fs.statSync(path.join(root, file)).size > 1000, `${file} is missing or empty`);
  const sample = read("sample.html");
  assert.match(sample, /<meta name="robots" content="noindex">/);
  assert.match(sample, /class="invitation-card"/);
  assert.match(sample, /data-template="bloom-portrait"/);
});

test("the sitemap lists the landing, the guide, and the studio but not the sample", () => {
  const sitemap = read("sitemap.xml");
  for (const url of ["/", "/guide", "/studio"]) assert.match(sitemap, new RegExp(`<loc>https://invitation-maker-one\\.vercel\\.app${url}</loc>`));
  assert.doesNotMatch(sitemap, /\/sample/);
});

test("build-public copies sample.html", () => {
  const pattern = /^(?:index|viewer|shared|[0-9A-Za-z_-]+)\.html$/;
  assert.ok(pattern.test("sample.html"));
  assert.ok(pattern.test("studio.html"));
  assert.ok(pattern.test("guide.html"));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/site-pages.test.js`
Expected: media test fails (`ENOENT`), sitemap test fails.

- [ ] **Step 3: Write the build script**

Create `scripts/build-site-media.cjs`:

```js
// Renders the landing/guide images and sample.html from the real studio, so
// the landing shows exactly what the studio produces. Same conventions as
// build-social-preview.cjs and verify-studio.cjs: Playwright is located via
// PLAYWRIGHT_MODULE, Chrome is the channel, outputs are checked in.
//
//   npm start   (in another terminal)
//   PLAYWRIGHT_MODULE=/abs/path/to/playwright node scripts/build-site-media.cjs
//   node scripts/build-site-media.cjs --check   # outputs exist and are non-empty
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mediaDir = path.join(root, "assets", "media", "site");
const baseUrl = process.env.INVITATION_BASE_URL || "http://localhost:4173";
const DESIGNS = [
  { id: "bloom-portrait", occasion: "birthday" },
  { id: "wedding", occasion: "wedding" },
  { id: "first-chapter", occasion: "first-birthday" },
  { id: "golden-years", occasion: "hwangap" },
  { id: "botanical", occasion: "date" },
  { id: "midnight-cinema", occasion: "event" }
];
const OUTPUTS = [
  "hero-sample@2x.png",
  ...DESIGNS.map(({ id }) => `design-${id}@2x.png`),
  "guide-step-01@2x.png", "guide-step-02@2x.png", "guide-step-03@2x.png"
].map((name) => path.join(mediaDir, name)).concat(path.join(root, "sample.html"));

if (process.argv.includes("--check")) {
  const missing = OUTPUTS.filter((file) => !fs.existsSync(file) || fs.statSync(file).size < 1000);
  if (missing.length) { console.error(`Missing or empty:\n${missing.map((f) => path.relative(root, f)).join("\n")}`); process.exit(1); }
  console.log(`All ${OUTPUTS.length} site media outputs present.`);
  process.exit(0);
}

const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const applyDesign = async (page, { id, occasion }) => {
  await page.locator(`[data-occasion-id="${occasion}"]`).click();
  await page.locator(`[data-template-id="${id}"]`).click();
  await page.locator("#preview-apply-button").click();
  await page.frameLocator("#preview").locator(`.invitation-card[data-template="${id}"]`).waitFor();
  await page.waitForTimeout(300); // let fonts inside the frame settle
};

(async () => {
  fs.mkdirSync(mediaDir, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    // Phone-sized frames: one per design, plus the hero and sample.html.
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ko-KR" });
    await phone.goto(`${baseUrl}/studio`);
    for (const design of DESIGNS) {
      await phone.locator('.studio-steps [data-studio-stage="gallery"]').click();
      await applyDesign(phone, design);
      await phone.locator('.mobile-view-tabs [data-mobile-view="preview"]').click();
      await phone.locator("#preview").screenshot({ path: path.join(mediaDir, `design-${design.id}@2x.png`) });
      if (design.id === "bloom-portrait") {
        await phone.locator("#preview").screenshot({ path: path.join(mediaDir, "hero-sample@2x.png") });
        const srcdoc = await phone.locator("#preview").getAttribute("srcdoc");
        const sample = srcdoc.replace(/<head>/i, '<head>\n<meta name="robots" content="noindex">');
        fs.writeFileSync(path.join(root, "sample.html"), `<!-- Generated by scripts/build-site-media.cjs from the studio's own export; regenerate, do not edit. -->\n${sample}`);
      }
      await phone.locator('.mobile-view-tabs [data-mobile-view="editor"]').click();
    }
    // Desktop screenshots of the three stages for the guide.
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "ko-KR" });
    await desktop.goto(`${baseUrl}/studio`);
    await desktop.locator('[data-occasion-id="birthday"]').click();
    await desktop.locator('[data-template-id="bloom-portrait"]').click();
    await desktop.screenshot({ path: path.join(mediaDir, "guide-step-01@2x.png") });
    await desktop.locator("#preview-apply-button").click();
    await desktop.frameLocator("#preview").locator(".invitation-card").waitFor();
    await desktop.screenshot({ path: path.join(mediaDir, "guide-step-02@2x.png") });
    await desktop.locator('.studio-steps [data-studio-stage="finish"]').click();
    await desktop.waitForTimeout(300);
    await desktop.screenshot({ path: path.join(mediaDir, "guide-step-03@2x.png") });
    console.log(`Wrote ${OUTPUTS.length} outputs under ${path.relative(root, mediaDir)} and sample.html`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
```

Adjust selectors against `studio.html` if any differ (`#preview-apply-button`, `.mobile-view-tabs`, `#preview`); `scripts/verify-studio.cjs` is the reference for what exists. The `#preview` iframe's rendered size decides the PNG dimensions; after the first run, read the PNG sizes (`node -e` with a PNG header parse, or `sips -g pixelWidth`) and set the `width`/`height` attributes in `index.html`/`guide.html` to match.

- [ ] **Step 4: Run the build**

```bash
npm start &            # or a second terminal
PLAYWRIGHT_MODULE=$(node -e 'console.log(require.resolve("playwright"))' 2>/dev/null || echo /path/to/playwright) node scripts/build-site-media.cjs
node scripts/build-site-media.cjs --check
```

If Playwright is not installed anywhere on the machine, stop and report; the doc in Task 6 explains how to install it locally (`npm i -g playwright` or a scratch directory). Do not add it to `package.json`.

- [ ] **Step 5: Update the sitemap**

`sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://invitation-maker-one.vercel.app/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>
  <url><loc>https://invitation-maker-one.vercel.app/guide</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>https://invitation-maker-one.vercel.app/studio</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
</urlset>
```

Check `tests/social-preview.test.js` / `tests/synthetic-monitoring.test.js` for a sitemap assertion that pins a single URL; update it to the three URLs.

- [ ] **Step 6: Run all tests, fix image dimensions**

Run: `npm test`
Expected: PASS. Then compare PNG sizes to the `width`/`height` attributes and correct the HTML if they differ.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add scripts/build-site-media.cjs assets/media/site sample.html sitemap.xml index.html guide.html tests
/usr/bin/git commit -m "Render the landing's sample images and sample.html from the studio itself"
```

---

### Task 6: Studio links, browser verification, operations doc

**Files:**
- Modify: `studio.html` (top bar, finish note, footer)
- Modify: `assets/i18n/dictionary-ko.js`, `assets/i18n/dictionary-en.js` (three new keys under existing namespaces: `header.guideLink`, `header.aboutLink`, `finish.compareLink`)
- Create: `scripts/verify-site-pages.cjs`
- Create: `docs/landing-and-guide.md`
- Modify: `README.md`, `README.ko.md` (one paragraph + tree), `docs/seo.md` (indexable set), `DESIGN.md` (dated section)
- Modify: `tests/site-pages.test.js`

**Interfaces:**
- Consumes: everything above.
- Produces: studio → guide/landing links; a browser verification script; documentation.

- [ ] **Step 1: Write failing tests**

Append to `tests/site-pages.test.js`:

```js
test("the studio links to the guide and the landing", () => {
  const studio = read("studio.html");
  assert.match(studio, /<a class="studio-guide-link" href="\/guide" data-i18n="header\.guideLink">사용법<\/a>/);
  assert.match(studio, /<a href="\/welcome" data-i18n="header\.aboutLink">소개<\/a>/);
  assert.match(studio, /<a href="\/guide#finish" data-i18n="finish\.compareLink">세 가지 방식의 차이 보기<\/a>/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/site-pages.test.js`
Expected: fails on the three links.

- [ ] **Step 3: Add the keys and links**

`dictionary-ko.js` — inside `header: { ... }` add `guideLink: "사용법", aboutLink: "소개",`; inside `finish: { ... }` add `compareLink: "세 가지 방식의 차이 보기",`. `dictionary-en.js` — `guideLink: "How it works", aboutLink: "About",` and `compareLink: "See how the three differ",`. Confirm the namespaces `header` and `finish` exist with those names (grep `finish: {` and `header: {`).

`studio.html`:
- In `.studio-bar-meta`, before `<div class="studio-language">`: `<a class="studio-guide-link" href="/guide" data-i18n="header.guideLink">사용법</a>`.
- After `<p class="finish-persistence-note">…</p>` (line ~248): `<p class="finish-compare"><a href="/guide#finish" data-i18n="finish.compareLink">세 가지 방식의 차이 보기</a></p>`.
- Footer: between the two spans add `<nav class="studio-footer-links"><a href="/welcome" data-i18n="header.aboutLink">소개</a><a href="/guide" data-i18n="header.guideLink">사용법</a></nav>`.

`assets/studio/studio.css` — append:

```css
.studio-guide-link { font-size: 12px; color: #314e41; font-weight: 600; min-height: 44px; display: inline-flex; align-items: center; }
.finish-compare { margin: 6px 0 0; font-size: 13px; }
.finish-compare a { color: #314e41; font-weight: 600; }
.studio-footer-links { display: flex; gap: 14px; }
.studio-footer-links a { color: inherit; text-decoration: none; min-height: 44px; display: inline-flex; align-items: center; }
```

Run `node --test tests/i18n.test.js tests/app-contract.test.js` — the inline-copy and key-count tests must still pass (they will, since the new inline copy equals the dictionary).

- [ ] **Step 4: Write the browser verification script**

Create `scripts/verify-site-pages.cjs`:

```js
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseUrl = process.env.INVITATION_BASE_URL || "http://localhost:4173";

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const width of [320, 390, 768, 1440]) {
      for (const route of ["/", "/guide"]) {
        const page = await browser.newPage({ viewport: { width, height: 844 }, locale: "ko-KR" });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${baseUrl}${route}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route}@${width}: horizontal overflow`);
        assert.ok(await page.locator(".site-cta").first().evaluate((el) => el.getBoundingClientRect().top < innerHeight), `${route}@${width}: CTA not in first viewport`);
        assert.deepEqual(errors, [], `${route}@${width}: page errors`);
        await page.close();
      }
    }
    // Entry policy.
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "ko-KR" });
    await page.goto(`${baseUrl}/`);
    assert.match(page.url(), /\/$/, "fresh browser sees the landing");
    await page.goto(`${baseUrl}/studio`);
    await page.locator("#template-list").waitFor();
    await page.goto(`${baseUrl}/?lang=en`);
    await page.waitForURL(/\/studio\?lang=en$/);
    await page.goto(`${baseUrl}/welcome`);
    assert.match(page.url(), /\/welcome$/, "/welcome never redirects");
    // Sample.
    await page.goto(`${baseUrl}/sample`);
    assert.equal(await page.locator(".invitation-card").count(), 1);
    // English: no Korean left on the landing or guide.
    for (const route of ["/welcome?lang=en", "/guide?lang=en"]) {
      await page.goto(`${baseUrl}${route}`);
      const korean = await page.evaluate(() => (document.body.innerText.match(/[가-힣]/g) || []).length);
      assert.equal(korean, 0, `${route}: Korean text remains`);
    }
    console.log("Site pages verified at 320/390/768/1440, entry policy, sample, and English.");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
```

The Korean-count check will flag the language `<select>` option labels ("한국어") and any Korean `alt` text is not in `innerText`, so exclude the select: compute `innerText` on a clone with `#language-select` removed. Adjust the script accordingly.

- [ ] **Step 5: Run the verification**

```bash
npm start &
PLAYWRIGHT_MODULE=... node scripts/verify-site-pages.cjs
```

Expected: the success line. Fix anything it catches (overflow, missing translation) before moving on.

- [ ] **Step 6: Write `docs/landing-and-guide.md`**

Korean, matching the voice of `docs/seo.md`. Sections:
1. 왜 이 구조인가 — `/` 상태 분기의 이유(재방문자 비용 vs 첫 방문자 온보딩), `/welcome`이 있는 이유, 파일명 변경을 택한 이유(로컬·프로덕션 동일 동작).
2. 파일과 주소 — 표 (spec §4).
3. 바꾸면 안 되는 것 — 인증 태그는 `index.html`에, `href="/"`는 그대로, 정책 숫자는 테스트로 묶임, `sample.html`은 생성물.
4. 재생성 — `build-site-media.cjs` 사용법, Playwright 위치, 이미지 크기와 HTML `width/height`의 관계.
5. 검증 — `npm test`, `verify-site-pages.cjs`, 실제 배포 후 Search Console에서 `/guide` 색인 확인.
6. 측정 — 세 이벤트와 PostHog에서 볼 비율(`landing_cta_clicked` / `site_page_viewed{page:landing}`).
7. 이번에 하지 않은 것 — 동의 배너, 정식 방침, 행사별 진입 쿼리, 영어 스크린샷.

- [ ] **Step 7: Update the existing docs**

- `README.md` / `README.ko.md`: in the tree replace `index.html + assets/   # Editor` with `index.html / guide.html   # Landing page and user guide` and `studio.html + assets/   # Editor`; add one sentence under Quick start: "`/` is the landing page; the editor is at `/studio` (a browser that has opened the studio is sent there automatically)". Korean equivalent in `README.ko.md`.
- `docs/seo.md`: "Only the landing page (`/`) is meant to appear" → "The landing page (`/`), the guide (`/guide`) and the studio (`/studio`) are indexable; `/sample` carries `noindex`." Update the sitemap paragraph to three URLs.
- `DESIGN.md`: append a dated section "Landing and guide — 2026-09-18" with five bullets: entry policy, palette reuse, no external fonts, static screenshots from the studio, data section as the honest answer to A-8.

- [ ] **Step 8: Run everything and commit**

```bash
npm test
node scripts/build-site-media.cjs --check
/usr/bin/git add -A
/usr/bin/git commit -m "Link the studio to the guide and landing, and document the entry policy"
```

---

## Self-review

- Spec §1 entry policy → Task 1 (flag, routes), Task 3 (redirect script), Task 6 (verify). ✓
- Spec §1 meta/search → Task 1 (studio canonical), Task 3 (root tags), Task 5 (sitemap), Task 6 (seo doc). ✓
- Spec §1 studio additions → Task 6. ✓
- Spec §2 landing sections, visual rules, analytics → Tasks 2, 3. ✓
- Spec §3 guide sections, policy-number test → Tasks 2, 4. ✓
- Spec §4 files, dictionary split, build script, tests, browser verification, docs → Tasks 2, 5, 6. ✓
- Two keys added during Task 3 (`site.header.navLabel`, `site.footer.navLabel`) must be added to BOTH dictionaries in Task 2's files; Task 3 Step 3 says so. ✓
- Image sizes are provisional until Task 5 measures them; Tasks 3, 4, 5 all say to reconcile. ✓
