# Global Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Each task runs in its own git worktree and lands as its own PR to `main`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the studio from "a Korean service with English strings" into a globally usable invitation maker by closing every open item in the 2026-09-18 UI/UX audit.

**Architecture:** Three waves. Wave 0 lays two foundations every later task depends on: a studio design-token layer (so editor chrome stops inheriting invitation palettes) and an i18n hardening pass (so no user-facing Korean string lives outside a dictionary). Wave 1 is nine independent tasks that branch from `main` after wave 0 lands and run in parallel, each in its own worktree with a file-ownership map to keep merges clean. Wave 2 holds the tasks that need product decisions already taken: occasion taxonomy, neutral samples, legal pages and consent, and a docs sweep.

**Tech Stack:** Static HTML/CSS/JS with no bundler and no new runtime dependencies. Node 22 test runner (`node --test`). Existing i18n engine (`assets/i18n/i18n.js`) with `data-i18n` bindings and self-registering dictionaries. Vercel static output built by `scripts/build-public.cjs`.

**Spec:** `docs/ui-ux-global-audit/2026-09-18/README.md` (the audit). Item ids (A-1 … B-12) below refer to that document. Evidence screenshots live in `docs/ui-ux-global-audit/2026-09-18/screenshots/`.

## Global Constraints

- Node `>=22`, no new npm dependencies (package.json has exactly one dependency: `mongodb`).
- No bundler, no framework. Files attach globals in load order; keep script order intact.
- Korean is the base language; every dictionary key must exist in both `dictionary-ko.js` and `dictionary-en.js` (`tests/i18n.test.js` enforces parity). Site pages use `dictionary-site-ko.js` / `dictionary-site-en.js`.
- An invitation's authored content is never translated; only chrome is (`docs/i18n.md`).
- Studio chrome palette is warm paper `#f7f7f4`, ink `#282b29`, green `#314e41`, muted `#59645e`, line `#dce1d8`/`#e3e5df`. Invitation palettes must never leak into editor chrome (`DESIGN.md`).
- Touch targets ≥ 44px, focus-visible outlines preserved, `prefers-reduced-motion` respected.
- `npm test` must stay green in every commit. CI also runs `npm run build:public` and requires `git diff --exit-code` afterwards, so generated files must be committed in sync with their generators.
- Commit messages follow the repo's style: one imperative sentence, no prefix (see `git log`).
- Never push or open PRs from inside a task worktree; the orchestrator does that.

## Status of audit items after `main@ed3fe46`

| Item | Status | Handled by |
| --- | --- | --- |
| A-1 Naver-only maps | **Resolved upstream** (Google Maps provider, `mapProvider` field) | — |
| B-11 Onboarding | **Resolved upstream** (landing at `/`, guide at `/guide`, studio at `/studio`) | — |
| B-1 html background | Open | W0-1 |
| B-2 Editor palette leak | Open | W0-1 |
| A-6 Hardcoded Korean | Open (still 48 Hangul literals across 5 JS files) | W0-2 |
| A-5 Publish language | Open | W1-1 |
| A-7 Error pages Korean-only | Open | W1-2 |
| A-4 Date input | Open | W1-3 |
| A-9 Fonts / scripts | Open | W1-4 |
| B-3, B-4 Mobile gallery preview / preview width | Open | W1-5 |
| B-6, B-7 Item cards / add buttons | Open | W1-6 |
| B-9 Share dialog | Open | W1-7 |
| B-5, B-8, B-10 Gallery CTA / library / mobile header | Open | W1-8 |
| B-12 Dark mode | Open | W1-9 |
| A-2, A-3 Occasions / samples | Open | W2-1 |
| A-8 Privacy, terms, consent | Open | W2-2 |
| Docs sweep | — | W2-3 |
| RSVP | Out of scope (decided 2026-09-18) | — |

## Branch and worktree layout

```
main                                   ← every task lands here as its own PR
.worktrees/integration                 ← branch integration/global-readiness: main + all in-flight tasks, test-only, never pushed
.worktrees/w0-studio-tokens            ← branch feat/studio-tokens
.worktrees/w0-i18n-hardening           ← branch feat/i18n-hardening
.worktrees/w1-publish-language         ← branch feat/publish-language        (from main after wave 0)
.worktrees/w1-error-pages-i18n         ← branch feat/error-pages-i18n
.worktrees/w1-date-locale              ← branch feat/date-locale
.worktrees/w1-fonts-script             ← branch feat/fonts-script
.worktrees/w1-mobile-gallery-preview   ← branch feat/mobile-gallery-preview
.worktrees/w1-editor-items             ← branch feat/editor-items
.worktrees/w1-share-dialog             ← branch feat/share-dialog
.worktrees/w1-library-gallery-cta      ← branch feat/library-gallery-cta
.worktrees/w1-dark-mode                ← branch feat/dark-mode
.worktrees/w2-occasions-global         ← branch feat/occasions-global         (from main after wave 1)
.worktrees/w2-legal-consent            ← branch feat/legal-consent
.worktrees/w2-docs-sweep               ← branch docs/global-readiness
```

Merge gate for every task: `npm test` green in the worktree → orchestrator merges the branch into `integration` and re-runs `npm test` → code-reviewer pass → rebase on `main` → PR → CI green → merge (merge commit, matching repo history).

## File-ownership map (wave 1)

| File | Owner task | Others may |
| --- | --- | --- |
| `assets/studio/studio.css` | W1-5, W1-6, W1-8 (separate sections, append-only) | add ≤10 lines in a clearly commented block |
| `assets/studio/app.js` gallery section | W1-5, W1-8 | — |
| `assets/studio/app.js` item editor section | W1-6 | — |
| `assets/studio/app.js` date/form section | W1-3 | — |
| `assets/publishing/publishing.js` | W1-7 (dialog), W1-1 (payload) | keep diffs in different functions |
| `assets/publishing/shared-invitation.js`, `server/validation.cjs`, `api/**` | W1-1 | — |
| `scripts/build-error-pages.cjs`, `[0-9]{3}.html` | W1-2 | — |
| `assets/invitation/core.js` fonts block | W1-4 | W1-3 may add `.ics` link rendering in a new function |
| `assets/invitation/template-renderers.js` | W1-5 (heading wrap only) | — |
| `shared.html`, `viewer.html`, `index.html`, `guide.html`, `assets/site/**` | W1-9 | W1-1 may touch `shared.html` script block only |
| `assets/i18n/dictionary-*.js` | everyone, **own namespace only** (listed per task) | — |

---

## Wave 0

### Task W0-1: Studio design tokens and palette isolation (B-1, B-2)

**Files:**
- Modify: `assets/studio/studio.css` (add a `:root` token block at the top; convert every hard-coded chrome colour in this file to a token; add rules that pin `.add-item-button`, `.range-heading`, `.range-heading output`, `.panel-title .eyebrow`, `.library-panel .eyebrow`, `.upload-box label`, `.hero-image-empty`, `.content-item` header meta/labels, `.hero-image-select-button`, `#gallery-selection` to chrome tokens)
- Modify: `assets/studio/style.css` — only add `html { background: #f7f7f4; }` override or move the `:root` palette so it does not paint `html`
- Modify: `.gitignore` — add `.claude/worktrees/`
- Test: `tests/studio-chrome.test.js` (new)

**Interfaces:**
- Produces: CSS custom properties on `:root` named `--studio-paper`, `--studio-ink`, `--studio-ink-muted`, `--studio-accent`, `--studio-accent-ink`, `--studio-line`, `--studio-surface`, `--studio-surface-alt`, `--studio-warn-bg`, `--studio-warn-ink`, `--studio-danger`. Later tasks use these names.

- [ ] **Step 1: Write the failing test**

```js
// tests/studio-chrome.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const studio = fs.readFileSync(path.join(root, "assets/studio/studio.css"), "utf8");

test("studio.css declares the chrome token set", () => {
  for (const token of ["--studio-paper", "--studio-ink", "--studio-ink-muted", "--studio-accent", "--studio-accent-ink", "--studio-line", "--studio-surface", "--studio-surface-alt", "--studio-warn-bg", "--studio-warn-ink", "--studio-danger"]) {
    assert.match(studio, new RegExp(`${token}:\\s*#[0-9a-f]{3,8}`, "i"), `${token} missing`);
  }
});

test("the document background is the studio paper, not an invitation palette", () => {
  assert.match(studio, /html\s*{[^}]*background:\s*var\(--studio-paper\)/);
});

test("editor components that used to inherit invitation colours are pinned to chrome tokens", () => {
  for (const selector of [".add-item-button", ".range-heading", ".panel-title .eyebrow", ".library-panel .eyebrow", ".upload-box label", ".hero-image-empty", ".hero-image-select-button"]) {
    assert.ok(studio.includes(selector), `${selector} has no chrome rule`);
  }
});

test("studio.css uses no raw green/ink hex outside the token block", () => {
  const body = studio.slice(studio.indexOf("}") + 1); // everything after the :root block
  assert.doesNotMatch(body, /#314e41|#282b29|#59645e|#647168/i, "raw chrome hex found; use var(--studio-*)");
});
```

- [ ] **Step 2: Run test to verify it fails** — `node --test tests/studio-chrome.test.js` → FAIL (tokens missing)
- [ ] **Step 3: Implement** — token block at top of `studio.css`; replace hex literals; add `html { background: var(--studio-paper); }`; add pin rules listed under Files. Item card meta (`.content-item` header type/label spans) must use `--studio-accent` for the type and `--studio-ink-muted` for the label/phone, never the template accent. Buttons `.add-item-button` and `.hero-image-select-button` use `--studio-accent` background with `--studio-accent-ink` text.
- [ ] **Step 4: Run** `npm test` → PASS
- [ ] **Step 5: Browser check** — serve with `python3 -m http.server 4173`, open `/studio?lang=en`, apply "Let's Celebrate Loudly" (id `color-pop`): no blue/red chrome in the editor, no pink band on the Library stage or on overscroll. Also check "Cherry Muse" and "Midnight Toast".
- [ ] **Step 6: Commit** — `Pin the studio chrome to its own tokens and paint the document background paper`

### Task W0-2: i18n hardening — no Korean literal outside dictionaries (A-6)

**Files:**
- Modify: `assets/media/image-tools.js` (throw `ImageToolsError` with `code` only; drop Korean messages)
- Modify: `assets/storage/invitation-storage.js` (reject with `Error` carrying `code` such as `IDB_REQUEST_FAILED`, `IDB_UNAVAILABLE`, `IDB_OPEN_FAILED`, `IDB_UPGRADE_BLOCKED`)
- Modify: `assets/integrations/map-location.js` (errors carry `code` only; `message` may be the code)
- Modify: `assets/invitation/intro-effects.js` (drop `label` and `copy` Korean strings from the effect table, or key them: `labelKey: "effects.introEnvelope"`; whoever renders them resolves through `InvitationI18n.t`)
- Modify: `assets/invitation/core.js` (default invitation fallback: title/subtitle/location/message/items resolved via dictionary keys `invitation.defaultTitle`, `invitation.defaultSubtitle`, `invitation.defaultLocation`, `invitation.defaultMessage`, `invitation.defaultCourse{Meet,Cafe,Walk,Dinner}{Place,Note}` at normalize time for the active language)
- Modify: `assets/studio/app.js` (map error `code` → dictionary key: `errors.image.type`, `errors.image.sourceSize`, `errors.image.decode`, `errors.image.encodedSize`, `errors.image.generic`, `errors.storage.*`, `map.*` already exists)
- Modify: `assets/i18n/dictionary-ko.js`, `assets/i18n/dictionary-en.js` — namespaces `errors.*` and `invitation.default*` only
- Test: `tests/i18n-hardening.test.js` (new)

**Interfaces:**
- Produces: error objects `{ code: string }` from image-tools, storage, map-location; `InvitationI18n.t("errors.image.<code>")` keys; `InvitationCore.createDefaultInvitation(language)` returns localized defaults.

- [ ] **Step 1: Write the failing test**

```js
// tests/i18n-hardening.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const HANGUL = /[ㄱ-ㆎ가-힣]/;
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const FILES = [
  "assets/media/image-tools.js", "assets/storage/invitation-storage.js", "assets/integrations/map-location.js",
  "assets/invitation/intro-effects.js", "assets/invitation/core.js", "assets/publishing/publishing.js",
  "assets/publishing/shared-invitation.js", "assets/studio/app.js", "assets/invitation/viewer.js"
];
test("no user-facing Korean literal lives outside the dictionaries", () => {
  const offenders = [];
  for (const file of FILES) {
    const lines = stripComments(fs.readFileSync(path.join(root, file), "utf8")).split("\n");
    lines.forEach((line, index) => { if (HANGUL.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim().slice(0, 80)}`); });
  }
  assert.deepEqual(offenders, [], `Korean literals found:\n${offenders.join("\n")}`);
});
test("image, storage and map errors carry machine codes", () => {
  const { ImageToolsError } = require("../assets/media/image-tools.js");
  assert.equal(new ImageToolsError("type").code, "type");
  const MapLocation = require("../assets/integrations/map-location.js");
  assert.rejects(MapLocation.resolve(null, ""), (error) => error.code === "EMPTY_QUERY");
});
```

Note: `app.js` line 296 contains a Hangul *regex range* (`가-힣`) used for slug generation; move that range into a named constant `HANGUL_RANGE` built from `가-힣` escapes so the literal test passes without changing behaviour.

- [ ] **Step 2: Run** → FAIL listing the 48 literals
- [ ] **Step 3: Implement** file by file; keep public function names unchanged; app.js resolves codes to copy at the point of display.
- [ ] **Step 4: Run** `npm test` → PASS (existing tests that asserted Korean error messages must be updated to assert codes)
- [ ] **Step 5: Browser check** — `/studio?lang=en`: upload a `.gif` as a photo → English error; `/studio?lang=ko` → Korean error.
- [ ] **Step 6: Commit** — `Resolve every user-facing error and default string through the dictionaries`

---

## Wave 1 (branch from `main` after W0-1 and W0-2 merge)

### Task W1-1: Publish the author's language with the invitation (A-5)

**Files:**
- Modify: `assets/publishing/publishing.js` (payload gains `language: InvitationI18n.getLanguage()`)
- Modify: `server/validation.cjs` (accept optional `language` ∈ registered languages, default `"ko"`)
- Modify: `api/invitations.js`, `api/invitations/[id].js`, `server/**` read path (store and return `language`)
- Modify: `assets/publishing/shared-invitation.js` (render frame with `buildStandaloneHtml(invitation, { language: record.language || "ko" })`; delete the "always Korean" comment block and replace with the new rule)
- Modify: `docs/i18n.md`, `docs/publishing.md` (rewrite the shared-link language section)
- Test: `tests/publishing-server.test.js`, `tests/publishing-client.test.js`, `tests/invitation-core.test.js`

- [ ] Write failing tests: server accepts `language: "en"` and echoes it; rejects `language: "xx"`; client payload includes current language; shared page renders `<html lang="en">` inside the frame for an `en` record and `ko` for a record without the field.
- [ ] Implement, `npm test`, commit: `Carry the author's language with a published invitation so guests see its chrome as written`

### Task W1-2: Error pages follow the guest's language (A-7)

**Files:**
- Modify: `scripts/build-error-pages.cjs` — inline a tiny resolver (URL `?lang`, `localStorage["invitation-maker.language"]`, `navigator.languages`, default `ko`) plus both languages' copy for each status as a JSON object inside the page; on boot set `<html lang>`, swap text nodes; no external asset requests (existing constraint in `docs/error-pages.md`)
- Regenerate: all `[0-9]{3}.html`
- Modify: `assets/i18n/dictionary-ko.js` / `dictionary-en.js` — namespace `errorPages.<status>.{eyebrow,title,description,hint,action,reload}` (the build script reads these dictionaries via `require` so copy has one home)
- Modify: `docs/error-pages.md`
- Test: `tests/error-pages.test.js` (new): every generated page contains both languages' titles, contains `data-error-lang` boot script, and `node scripts/build-error-pages.cjs --check` passes.

- [ ] Failing test → implement → `node scripts/build-error-pages.cjs` → `npm test` → browser: `/404.html?lang=en` shows English → commit: `Let the static error pages speak the visitor's language without loading any asset`

### Task W1-3: Real date input, locale formats, add-to-calendar (A-4)

**Files:**
- Modify: `studio.html` — replace the single text field with: `<input name="dateTime" type="datetime-local">` + `<select name="timeZone">` (built from `Intl.supportedValuesOf("timeZone")` where available, default to the browser zone) + a collapsed "Write it my own way" toggle revealing the existing `dateLabel` text input
- Modify: `assets/studio/app.js` — when `dateTime` is set and `dateLabel` is empty, the invitation stores `dateTime` + `timeZone` and `dateLabel` is derived per language through `InvitationI18n.formatSampleDate`; when the author types a custom label it wins (existing rule)
- Modify: `assets/i18n/i18n.js` — `LOCALES.en` gains `variants: { "en-GB": { hour12: false }, "en-AU": {...} }` resolved from `navigator.languages` for date formatting only (UI language stays `en`)
- Modify: `assets/invitation/core.js` — new `renderCalendarLink(invitation, language)` producing an `<a download="invitation.ics" href="data:text/calendar;charset=utf-8,...">` after the date block, only when `dateTime` exists; timezone shown next to the date when `timeZone` differs from the guest's (`Intl.DateTimeFormat().resolvedOptions().timeZone`) via a small inline script in the standalone document
- Modify: dictionaries — namespace `editor.date*`, `invitation.addToCalendar`, `invitation.timeZoneNote`
- Test: `tests/invitation-core.test.js` (ics content has `DTSTART;TZID=`), `tests/i18n.test.js` (en-GB formats `19 Dec 2026, 17:00`), `tests/app-contract.test.js` (form contract)

- [ ] Failing tests → implement → `npm test` → browser at `/studio?lang=en` → commit: `Take the date from a real picker, format it for the reader's locale, and offer a calendar file`

### Task W1-4: Script-aware fonts and lean font loading (A-9)

**Files:**
- Modify: `assets/invitation/core.js` — `googleFontsUrl` becomes `buildFontsUrl(invitation)` that includes only the two families in use (+ Noto Sans KR for chrome); system fallback stacks per script (`"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif` etc.)
- Modify: `studio.html` — label `editor.koreanFont` → `editor.scriptFont` ("Text font" / "본문 글꼴"); `<link>` for fonts stays for the studio thumbnails
- Modify: `assets/studio/app.js` — default `koreanFont` for a fresh English studio is `noto-sans-kr` → keep field name for storage compatibility, only the label changes
- Modify: dictionaries — `editor.scriptFont`, `editor.scriptFontHint`
- Test: `tests/invitation-core.test.js` — standalone HTML for a `cormorant-garamond` + `gowun-batang` invitation requests exactly those families plus Noto Sans KR; no other family in the URL.

- [ ] Failing tests → implement → `npm test` → commit: `Load only the fonts an invitation uses and stop calling the text font Korean`

### Task W1-5: Mobile gallery sample sheet and honest preview width (B-3, B-4)

**Files:**
- Modify: `studio.html` — add `<dialog id="sample-sheet" class="studio-sheet">` with a preview iframe and "Use this design" / "Close" buttons
- Modify: `assets/studio/app.js` gallery section — on card tap below 900px open the sheet with the sample rendered through the same `buildStandaloneHtml` path; apply button calls the existing apply handler; remove the stale CSS comment about a preview tab
- Modify: `assets/studio/studio.css` — new `.studio-sheet` block (bottom sheet, 92vh, safe-area padding, backdrop); mobile `.preview-panel` padding 0 and `.preview-frame` full width so the frame is 390px on a 390px phone
- Modify: `assets/invitation/template-renderers.js` line ~409 — hero `h1`: `overflow-wrap: normal; word-break: keep-all; hyphens: auto;` plus a `clamp()` font-size step so Latin words never break mid-word; `overflow-wrap: anywhere` only for `[lang="ko"]` long unbroken strings
- Modify: dictionaries — `gallery.sheetTitle`, `gallery.sheetClose`
- Test: `tests/app-contract.test.js` (sheet markup + ids), `tests/template-renderers.test.js` (h1 rule)

- [ ] Failing tests → implement → `npm test` → browser at 390px (`verify-mobile-editor.cjs` or manual) → commit: `Show a full-size sample in a sheet on phones and preview at the phone's real width`

### Task W1-6: Item cards that fit a phone (B-6, B-7)

**Files:**
- Modify: `assets/studio/app.js` item editor — card header becomes `[handle] [type · summary] [⋯ menu]`; the menu holds Move up / Move down / Delete; delete shows an inline confirm row inside the card (two buttons) instead of `window.confirm`; keyboard: Alt+↑/↓ still reorder
- Modify: `assets/studio/studio.css` — `.content-editor-commands` becomes a 5-column grid ≥ 600px and a horizontally scrolling chip row below with a fade mask; `.content-item-menu` styles
- Modify: dictionaries — `content.menu*`, `content.confirmDelete`, `content.cancel`
- Test: `tests/app-contract.test.js` — no `window.confirm` for item removal; menu markup present

- [ ] Failing tests → implement → `npm test` → commit: `Fold item card actions into a menu and confirm deletes inline`

### Task W1-7: One-heading share dialog with QR, system share and expiry up front (B-9)

**Files:**
- Modify: `studio.html` `#share-dialog` — remove the inner `SHARE / Public link` heading; the panel starts with the consent sentence; expiry policy sentence rendered from `publish.expiryPolicy` before publishing
- Modify: `assets/publishing/publishing.js` — after publish: link, Copy, "Share…" (`navigator.share` when available, hidden otherwise), QR code `<canvas>` rendered by a dependency-free encoder in new `assets/publishing/qr.js` (byte mode, EC level M, versions 1–10 are enough for a 60-char URL), and a "Copy invitation message" button using `publish.messageTemplate` ("{title} · {date} · {url}")
- Modify: dictionaries — `publish.expiryPolicy`, `publish.share`, `publish.qrLabel`, `publish.copyMessage`, `publish.messageTemplate`; replace `publish.limit` "2MB max" with `publish.limitHint` ("Photos are compressed so the page stays small")
- Test: `tests/qr.test.js` (encoder produces a known matrix for `"HELLO"`), `tests/publishing-client.test.js`

- [ ] Failing tests → implement → `npm test` → commit: `Give the share dialog one heading, a QR code, the system share sheet, and the expiry rule before publishing`

### Task W1-8: Single gallery CTA, useful library, calmer mobile header (B-5, B-8, B-10)

**Files:**
- Modify: `studio.html` + `assets/studio/app.js` gallery — drop `#pending-preview-notice`'s second button; the apply row is the one CTA; summary copy appears once
- Modify: `studio.html` library — empty state block with illustration (inline SVG envelope from `shared.html`), `library.emptyTitle`, `library.emptyBody`, and a `Start a new invitation` button that jumps to the gallery stage; custom dropzone label replacing the bare file input (input stays, visually hidden)
- Modify: `assets/studio/studio.css` — header: `#draft-status` collapses to an icon + `status.draftSavedShort` below 900px; occasion chip row gets `mask-image` fade; `#language-select` font-size 12px minimum
- Modify: dictionaries — `library.empty*`, `library.startNew`, `library.dropzone`, `status.draftSavedShort`
- Test: `tests/app-contract.test.js`

- [ ] Failing tests → implement → `npm test` → browser at 390px → commit: `Keep one apply action in the gallery, give the empty library a next step, and calm the phone header`

### Task W1-9: Dark mode for the site chrome (B-12)

**Files:**
- Modify: `shared.html`, `viewer.html` inline styles; `index.html`, `guide.html` and `assets/site/**` CSS — define light tokens on `:root`, override under `@media (prefers-color-scheme: dark)` and `[data-theme="dark"]`; `theme-color` meta gets a dark variant via `media="(prefers-color-scheme: dark)"`
- Do **not** touch the studio (`studio.html`, `studio.css`) or the invitation renderers; error pages belong to W1-2.
- Test: `tests/site-pages.test.js` — each page's CSS contains a `prefers-color-scheme: dark` block and a dark `theme-color` meta.

- [ ] Failing tests → implement → `npm test` → browser with dark scheme emulation → commit: `Dress the site chrome for dark mode`

---

## Wave 2 (branch from `main` after wave 1 merges)

### Task W2-1: Global occasion taxonomy and neutral samples (A-2, A-3)

Decision (2026-09-18): regroup existing occasions and add three new ones reusing existing design families; RSVP stays out.

**Files:**
- Modify: `invitation-data.json` — occasions gain `group` (`"celebrate" | "milestone" | "family" | "gather"`); `gohui`, `hwangap`, `first-birthday` → group `milestone`; new occasions `baby-shower` (family), `graduation` (milestone), `housewarming` (gather), each with two templates: reuse families `kids-storybook` / `celebration-poster` / `romantic-story` with new ids `baby-cloud`, `baby-garden`, `grad-cap`, `grad-bold`, `home-key`, `home-warm`, new palettes/fonts in `defaults`, art reused from existing template-art entries where a photo slot exists
- Modify: `assets/invitation/template-catalog.js` — `OCCASION_IDS` extended; `GROUP_IDS` added; `getOccasionsByGroup(catalog)`
- Modify: `assets/studio/app.js` gallery — chips render grouped with a small group label; the mobile chip row keeps the fade from W1-8
- Modify: `assets/i18n/content-en.json` — names/notes for new templates; **all** English sample places become region-neutral ("Rooftop lounge", "Riverside park", "Studio 2F"), hosts neutral ("From. Mina" → "From. Alex"), phone samples `+1 555 010 0000`; Korean samples unchanged
- Modify: `assets/invitation/core.js` defaults (already keyed by W0-2) — English default course places neutral
- Modify: dictionaries — `gallery.group*`
- Test: `tests/template-catalog.test.js`, `tests/i18n.test.js` overlay parity, `tests/template-renderers.test.js` renders every new template id without throwing, new test asserting no Seoul district name (`Hongdae|Cheongdam|Hannam|Seongsu|Bukchon|Euljiro|Yeonnam|Seochon`) in `content-en.json`

- [ ] Failing tests → implement (two commits: taxonomy + templates, then samples) → `npm test` → browser gallery at 1440 and 390 → commits: `Group occasions for a global gallery and add baby shower, graduation and housewarming designs`, `Make the English samples region-neutral`

### Task W2-2: Privacy, terms, consent (A-8)

Decision (2026-09-18): full drafts with `[OPERATOR]` and `[CONTACT_EMAIL]` placeholders to be replaced before deploy.

**Files:**
- Create: `privacy.html`, `terms.html` — same shell as `guide.html` (site header/footer, `data-i18n` on every text node), sections: what is stored where (browser vs server), public-link retention and sliding expiry (from `docs/publishing.md`), analytics and the consent choice, deletion requests (`[CONTACT_EMAIL]` + the owner revoke flow), children's data note, contact `[OPERATOR]`
- Modify: `assets/i18n/dictionary-site-ko.js` / `dictionary-site-en.js` — `site.privacy.*`, `site.terms.*`, `site.consent.*`
- Modify: `vercel.json` routes `/privacy`, `/terms`; `server/http/static.cjs` clean URLs; `sitemap.xml`
- Modify: `index.html`, `guide.html`, `studio.html`, `shared.html` footers — links to both pages
- Create: `assets/site/consent.js` — banner shown until a choice is stored in `localStorage["invitation-maker.consent"]`; `assets/analytics/analytics.js` and `ga4.js` dispatch only when consent is `"granted"` (DNT/GPC still force off); banner has Accept / Essential only, both 44px
- Modify: `studio.html` share dialog copy — one sentence on retention + link to privacy
- Modify: `docs/analytics.md` (consent gate), `README.md` / `README.ko.md` (placeholders to replace)
- Test: `tests/site-pages.test.js` (routes, footers), `tests/analytics.test.js` (no dispatch without consent), new `tests/consent.test.js`

- [ ] Failing tests → implement → `npm test` → browser: banner appears once, analytics inert until accept → commit: `Add privacy and terms pages and gate analytics behind a consent choice`

### Task W2-3: Documentation sweep

**Files:**
- Modify: `docs/ui-ux-global-audit/2026-09-18/README.md` — append a "Resolution log" table mapping every item to its PR number and status
- Modify: `DESIGN.md` — token layer, dark mode, sheet component, share dialog, occasion groups
- Modify: `docs/i18n.md` — error-code pattern, published language, error pages, locale variants
- Modify: `README.md`, `README.ko.md` — feature list (calendar file, QR, consent, new occasions)
- Agent: writer (haiku). No code changes.

- [ ] Commit: `Record the global-readiness work in the design, i18n and audit documents`

---

## Orchestrator runbook

1. `git worktree add .worktrees/integration -b integration/global-readiness main`
2. Wave 0: two worktrees from `main`, two agents in parallel. Merge each into `integration`, run `npm test`, code-review, PR to `main`, merge after CI. Fast-forward `integration` to `main`.
3. Wave 1: nine worktrees from `main`, nine agents in parallel. As each finishes: merge into `integration` → `npm test` → review → rebase on `main` → PR → merge. Conflicts are resolved in the feature worktree, never in `integration`.
4. Wave 2: three worktrees from `main`; W2-3 starts only after W2-1 and W2-2 merge.
5. Final: browser smoke of `main` at 1440/390 in ko/en, update the audit's resolution log, remove worktrees.
