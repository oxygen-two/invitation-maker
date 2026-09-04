# Ordered Photo Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add compressed, self-contained photo items that can be reordered with course cards and remain intact through preview, download, registration, reload, and viewer opening.

**Architecture:** Replace the editor's course-only list with a canonical ordered `items[]` model containing course and photo variants. Keep browser image processing, IndexedDB persistence, and pure invitation normalization in separate modules; use `InvitationCore` as the only renderer and import trust boundary.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Canvas 2D, Pointer Events, IndexedDB, Node.js built-in test runner, Playwright CLI.

**Spec:** `docs/superpowers/specs/2026-09-05-ordered-photo-content-design.md`

## Global Constraints

- Keep the application static HTML, CSS, and JavaScript; do not add a Node.js runtime dependency or package dependency.
- Accept only JPEG, PNG, and WebP uploads, with a 15 MB source limit and 600 KB encoded limit.
- Limit invitations to 50 total items and 8 photo items.
- Keep downloaded invitations independent by embedding normalized Base64 image data.
- Migrate legacy `stops[]` input and localStorage records without losing valid invitations.
- Preserve the NAVER Map Client ID boundary and exclude all Client Secrets.
- Use test-first implementation and keep existing uncommitted work intact.

## File Structure

- Create `assets/image-tools.js`: image file validation, resize planning, Canvas decoding, bounded WebP compression.
- Create `assets/invitation-storage.js`: IndexedDB open, CRUD, and deterministic request/transaction promise adapters.
- Create `assets/content-order.js`: pure immutable item movement used by buttons and pointer drag.
- Modify `assets/invitation-core.js`: canonical item normalization, legacy stop migration, safe photo validation, mixed item rendering.
- Modify `assets/app.js`: unified editor, photo upload workflow, pointer drag, move controls, asynchronous library storage.
- Modify `assets/viewer.js`: asynchronous IndexedDB lookup and normalized viewer rendering.
- Modify `index.html`: ordered-content controls and new scripts.
- Modify `viewer.html`: storage script dependency.
- Modify `assets/style.css`: course/photo editor cards, drag states, image figures, responsive behavior.
- Modify `invitation-data.json`: replace default `stops[]` with course `items[]`.
- Modify `tests/invitation-core.test.js`: migration, image allowlist, limits, mixed rendering, standalone round trips.
- Modify `tests/app-contract.test.js`: script order, controls, accessibility, and trust-boundary contracts.
- Create `tests/content-order.test.js`: immutable movement and boundary behavior.
- Create `tests/image-tools.test.js`: file validation and resize-plan behavior.
- Create `tests/invitation-storage.test.js`: request adapter failures and source-level IndexedDB contract.
- Modify `README.md`: photo limits, reordering, IndexedDB registration, and import limit.

---

### Task 1: Canonical Ordered Item Model

**Files:**
- Modify: `tests/invitation-core.test.js`
- Modify: `assets/invitation-core.js`
- Modify: `invitation-data.json`

**Interfaces:**
- Produces: `MAX_ITEMS = 50`, `MAX_PHOTOS = 8`, `normalizeInvitation(input).items`.
- Item union: `{ id, type: "course", ...courseFields } | { id, type: "photo", src, alt, caption }`.
- Compatibility input: `stops[]` is read only when `items[]` is absent.

- [ ] **Step 1: Write failing normalization tests**

Add tests asserting that mixed item order is preserved, legacy stops become course items, duplicate/missing IDs receive stable nonempty IDs, unknown types are dropped, only eight photos survive, and only 50 total items survive.

```js
const invitation = normalizeInvitation({
  items: [
    { id: "course-1", type: "course", time: "14:00", place: "서울숲" },
    { id: "photo-1", type: "photo", src: SAFE_WEBP, alt: "산책 사진", caption: "첫 산책" }
  ]
});
assert.deepEqual(invitation.items.map(({ id, type }) => ({ id, type })), [
  { id: "course-1", type: "course" },
  { id: "photo-1", type: "photo" }
]);
assert.equal(normalizeInvitation({ stops: [{ place: "성수역" }] }).items[0].type, "course");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-name-pattern="ordered|legacy stops|photo limits" tests/invitation-core.test.js`

Expected: FAIL because `items`, `MAX_ITEMS`, and `MAX_PHOTOS` do not exist.

- [ ] **Step 3: Implement minimal item normalization**

Add pure helpers and exports:

```js
const MAX_ITEMS = 50;
const MAX_PHOTOS = 8;
const safeImagePattern = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

const normalizePhoto = (item, id) => safeImagePattern.test(String(item.src || ""))
  ? { id, type: "photo", src: item.src, alt: String(item.alt || ""), caption: String(item.caption || "") }
  : null;
```

Generate missing IDs with `crypto.randomUUID()` when available and a timestamp/random fallback otherwise. Count photo items while iterating, stop at `MAX_ITEMS`, and migrate `stops[]` only when `items` is not an array.

- [ ] **Step 4: Replace default JSON stops with course items**

Convert each existing default stop to `{ "id": "course-1", "type": "course", ... }` without changing its content or order.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/invitation-core.test.js`

Expected: PASS, including all existing map, font, and particle tests.

- [ ] **Step 6: Commit the task**

```bash
git add assets/invitation-core.js invitation-data.json tests/invitation-core.test.js
git commit -m "Make invitation content order a durable data contract" \
  -m "Constraint: Legacy stops must load without becoming the canonical saved format.
Rejected: Maintain parallel stops and photos arrays | Cross-list ordering would require fragile synchronization.
Confidence: high
Scope-risk: broad
Directive: Add new invitation content variants only through items normalization.
Tested: node --test tests/invitation-core.test.js"
```

### Task 2: Browser Image Processing Boundary

**Files:**
- Create: `assets/image-tools.js`
- Create: `tests/image-tools.test.js`
- Modify: `index.html`

**Interfaces:**
- Produces: `ImageTools.validateFile(file)`, `ImageTools.buildResizePlan(width, height, maxEdge)`, `ImageTools.compress(file)`.
- `compress(file)` resolves `{ src, width, height, bytes, mimeType }` or throws an `ImageTools.ImageError` with code `type`, `source-size`, `decode`, or `encoded-size`.

- [ ] **Step 1: Write failing pure tests**

```js
assert.equal(validateFile({ type: "image/jpeg", size: 1024 }).ok, true);
assert.deepEqual(buildResizePlan(3200, 1200, 1600), { width: 1600, height: 600 });
assert.equal(validateFile({ type: "image/svg+xml", size: 100 }).code, "type");
assert.equal(validateFile({ type: "image/png", size: 15 * 1024 * 1024 + 1 }).code, "source-size");
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/image-tools.test.js`

Expected: FAIL because `assets/image-tools.js` is missing.

- [ ] **Step 3: Implement validation and resize planning**

Use constants `SOURCE_LIMIT = 15 * 1024 * 1024`, `ENCODED_LIMIT = 600 * 1024`, and `MAX_EDGE = 1600`. Export through CommonJS for Node tests and `globalThis.ImageTools` for the browser.

- [ ] **Step 4: Implement bounded Canvas compression**

Decode with an object URL and `Image`, draw to a fresh canvas, then attempt WebP encoding at qualities `[0.82, 0.72, 0.62, 0.52]`. If still too large, reduce both dimensions by `0.85` and repeat, stopping below a 640-pixel longest edge. Revoke the object URL in `finally` and reject when the output remains above 600 KB.

- [ ] **Step 5: Load the module before app.js**

Add `<script src="assets/image-tools.js"></script>` before `assets/app.js` in `index.html`.

- [ ] **Step 6: Verify tests and syntax**

Run: `node --test tests/image-tools.test.js && node --check assets/image-tools.js`

Expected: PASS and no syntax output.

- [ ] **Step 7: Commit the task**

```bash
git add assets/image-tools.js tests/image-tools.test.js index.html
git commit -m "Bound photo uploads before they enter invitations" \
  -m "Constraint: Standalone HTML must remain shareable and reject active image formats.
Rejected: Embed original files | Metadata and payload size would remain uncontrolled.
Confidence: high
Scope-risk: moderate
Directive: Keep decode and compression errors typed for editor messaging.
Tested: node --test tests/image-tools.test.js; node --check assets/image-tools.js"
```

### Task 3: Shared Reorder Operation

**Files:**
- Create: `assets/content-order.js`
- Create: `tests/content-order.test.js`
- Modify: `index.html`

**Interfaces:**
- Produces: `ContentOrder.move(items, fromIndex, toIndex)` returning a new array.
- Invalid, identical, or out-of-range moves return an unchanged shallow copy.

- [ ] **Step 1: Write failing movement tests**

```js
assert.deepEqual(move(["course", "photo", "dinner"], 1, 0), ["photo", "course", "dinner"]);
assert.deepEqual(move(["course", "photo"], 0, 9), ["course", "photo"]);
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/content-order.test.js`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement the immutable move helper**

Clone with `slice()`, remove one item, insert it at the bounded valid target, and export to CommonJS plus `globalThis.ContentOrder`.

- [ ] **Step 4: Load before app.js and verify**

Run: `node --test tests/content-order.test.js && node --check assets/content-order.js`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```bash
git add assets/content-order.js tests/content-order.test.js index.html
git commit -m "Give every invitation item one reorder operation" \
  -m "Constraint: Pointer and keyboard interactions must commit identical ordering.
Confidence: high
Scope-risk: narrow
Directive: Route all ordering controls through ContentOrder.move.
Tested: node --test tests/content-order.test.js; node --check assets/content-order.js"
```

### Task 4: Unified Course And Photo Editor

**Files:**
- Modify: `tests/app-contract.test.js`
- Modify: `index.html`
- Modify: `assets/app.js`
- Modify: `assets/style.css`

**Interfaces:**
- Consumes: `InvitationCore.normalizeInvitation`, `ImageTools.compress`, `ContentOrder.move`.
- Produces: `getItemsData()`, `renderContentEditor(items, openId)`, and `commitItemMove(fromIndex, toIndex)` inside `app.js`.

- [ ] **Step 1: Write failing editor contract tests**

Assert that the page exposes `#add-course-button`, `#add-photo-button`, a multiple file input accepting JPEG/PNG/WebP, one ordered editor container, drag handles, move controls, and the three required scripts before `app.js`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/app-contract.test.js`

Expected: FAIL on missing ordered-content controls.

- [ ] **Step 3: Replace the course-only editor shell**

Rename the section to `초대장 항목`, add the two commands, and add a visually hidden multiple file input:

```html
<button id="add-course-button" type="button">+ 코스</button>
<button id="add-photo-button" type="button">+ 사진</button>
<input id="photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden>
<div id="content-editor" class="content-editor"></div>
```

- [ ] **Step 4: Render both card variants**

Keep current course fields. Photo cards render a bounded thumbnail plus `alt` and `caption` inputs. Every card includes a drag-handle button and icon-only `↑`, `↓`, and `×` buttons with `title` and `aria-label` text.

- [ ] **Step 5: Connect photo selection sequentially**

On selection, check the current photo count, await `ImageTools.compress(file)` one file at a time, append successful photo items, report each rejected filename in `saveStatus`, clear the file input, rerender, and focus the first new photo caption.

- [ ] **Step 6: Connect move buttons**

Read current items from card datasets and fields, call `ContentOrder.move`, rerender with the moved item ID open, refresh preview, and focus the same move button on the moved card.

- [ ] **Step 7: Connect pointer dragging**

Use Pointer Events only on `[data-drag-handle]`. Set pointer capture, add `.is-dragging`, determine target cards with `document.elementFromPoint`, call `commitItemMove` when crossing card midpoints, and clear all drag state on `pointerup`, `pointercancel`, or lost capture. Set `touch-action: none` only on the handle.

- [ ] **Step 8: Add responsive styles**

Keep cards at 8px radius or less, reserve stable 44px icon-button dimensions, constrain thumbnails with `aspect-ratio: 4 / 3; object-fit: cover`, add visible insertion and dragging states, and verify controls wrap instead of overflowing at 390px.

- [ ] **Step 9: Run tests and syntax checks**

Run: `node --test tests/app-contract.test.js tests/content-order.test.js tests/image-tools.test.js && node --check assets/app.js`

Expected: PASS.

- [ ] **Step 10: Commit the task**

```bash
git add index.html assets/app.js assets/style.css tests/app-contract.test.js
git commit -m "Let photos and courses share one editable sequence" \
  -m "Constraint: Reordering must work for pointer, touch, keyboard, and assistive technology users.
Rejected: Make the whole card draggable | Form controls would start accidental drags.
Confidence: medium
Scope-risk: broad
Directive: Keep item identity stable across rerenders and focus restoration.
Tested: node --test tests/app-contract.test.js tests/content-order.test.js tests/image-tools.test.js; node --check assets/app.js"
```

### Task 5: Mixed Invitation Rendering And Export

**Files:**
- Modify: `tests/invitation-core.test.js`
- Modify: `assets/invitation-core.js`
- Modify: `assets/style.css`

**Interfaces:**
- Consumes: normalized `invitation.items`.
- Produces: mixed ordered markup where course numbering ignores photo items and standalone JSON contains `items[]` without `stops[]`.

- [ ] **Step 1: Write failing rendering and security tests**

```js
const html = buildStandaloneHtml({ items: [course("A"), photo(SAFE_WEBP), course("B")] });
assert.ok(html.indexOf("A") < html.indexOf("<figure"));
assert.ok(html.indexOf("<figure") < html.indexOf("B"));
assert.match(html, /invite-stop-number">01/);
assert.match(html, /invite-stop-number">02/);
assert.doesNotMatch(html, /"stops":/);
assert.equal(normalizeInvitation({ items: [photo("data:image/svg+xml;base64,PHN2Zz4=")] }).items.length, 0);
```

- [ ] **Step 2: Verify RED**

Run: `node --test --test-name-pattern="mixed|unsafe photo|canonical JSON" tests/invitation-core.test.js`

Expected: FAIL because the renderer still iterates `stops`.

- [ ] **Step 3: Render ordered item variants**

Iterate `items`, increment a separate course counter, render existing course markup for course items, and render photos as `<figure class="invite-photo"><img ...><figcaption>...</figcaption></figure>`. Escape alt and caption; omit `figcaption` when blank.

- [ ] **Step 4: Derive map loading from course items**

Replace every `invitation.stops.some(...)` and map iteration with filtered course items so one shared NAVER loader still mounts all enabled maps.

- [ ] **Step 5: Add preview and standalone photo CSS**

Use the same class contract in `assets/style.css` and `standaloneCss`: full-width image, natural aspect ratio, no decorative nested card, bounded caption padding, and no horizontal overflow.

- [ ] **Step 6: Verify full core suite**

Run: `node --test tests/invitation-core.test.js && node --check assets/invitation-core.js`

Expected: PASS.

- [ ] **Step 7: Commit the task**

```bash
git add assets/invitation-core.js assets/style.css tests/invitation-core.test.js
git commit -m "Keep mixed content intact in every invitation artifact" \
  -m "Constraint: Preview, export, import, and viewer must share one renderer.
Confidence: high
Scope-risk: broad
Directive: Never render imported HTML directly; rebuild normalized items through InvitationCore.
Tested: node --test tests/invitation-core.test.js; node --check assets/invitation-core.js"
```

### Task 6: IndexedDB Invitation Repository

**Files:**
- Create: `assets/invitation-storage.js`
- Create: `tests/invitation-storage.test.js`
- Modify: `index.html`
- Modify: `viewer.html`

**Interfaces:**
- Produces: `InvitationStorage.open()`, `.list()`, `.get(id)`, `.put(record)`, `.remove(id)`.
- Record: `{ id: string, title: string, createdAt: string, source: string, html: string }`.

- [ ] **Step 1: Write failing storage adapter tests**

Test exported constants, rejection when IndexedDB is unavailable, request success/error conversion, and the exact database/store/key names. Keep request conversion injectable so small fake request objects can drive Node tests without a package dependency.

```js
await assert.rejects(() => InvitationStorage.open(undefined), /IndexedDB/);
assert.equal(InvitationStorage.DB_NAME, "invitation-maker");
assert.equal(InvitationStorage.STORE_NAME, "invitations");
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/invitation-storage.test.js`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement database open and CRUD**

Open version 1, create the object store with `{ keyPath: "id" }` during upgrade, convert request and transaction events to promises, sort `.list()` records newest-first in JavaScript, and surface original error causes.

- [ ] **Step 4: Load storage before app and viewer code**

Add `assets/invitation-storage.js` before `app.js` and before `viewer.js`.

- [ ] **Step 5: Verify unit and syntax checks**

Run: `node --test tests/invitation-storage.test.js && node --check assets/invitation-storage.js`

Expected: PASS.

- [ ] **Step 6: Commit the task**

```bash
git add assets/invitation-storage.js tests/invitation-storage.test.js index.html viewer.html
git commit -m "Give image-bearing invitations durable browser storage" \
  -m "Constraint: Base64 photos can exceed localStorage quota.
Rejected: Raise localStorage limits | Quotas are browser-controlled and synchronous writes block the UI.
Confidence: high
Scope-risk: moderate
Directive: Keep IndexedDB access behind InvitationStorage.
Tested: node --test tests/invitation-storage.test.js; node --check assets/invitation-storage.js"
```

### Task 7: Async Library Migration And Viewer

**Files:**
- Modify: `tests/app-contract.test.js`
- Modify: `assets/app.js`
- Modify: `assets/viewer.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: `InvitationStorage` CRUD and existing `parseInvitationHtml` normalization boundary.
- Produces: `migrateLegacySaved()`, asynchronous save/import/delete/list flows, and IndexedDB-backed viewer lookup.

- [ ] **Step 1: Write failing migration and viewer contracts**

Assert that app code opens `InvitationStorage`, performs `put` before deleting each migrated localStorage record, uses a 10 MB import limit, and that viewer code awaits `InvitationStorage.get(id)` instead of reading localStorage.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/app-contract.test.js`

Expected: FAIL on localStorage-only persistence.

- [ ] **Step 3: Convert library operations to async repository calls**

Open storage during `init`, load records, and update `saveCurrent`, uploaded registration, delete, and render refresh paths to await CRUD. Disable the triggering command during writes and restore it in `finally`.

- [ ] **Step 4: Implement record-by-record legacy migration**

Parse the legacy array, validate and rebuild each HTML record, await IndexedDB `put`, then remove only that record from the retained localStorage array. Rewrite the remaining array after each successful copy so interrupted migrations resume safely.

- [ ] **Step 5: Convert viewer lookup**

Await `InvitationStorage.get(id)`, parse only `#invitation-data[type="application/json"]`, normalize, rebuild standalone HTML, and write the rebuilt document. Preserve the current missing/invalid invitation message.

- [ ] **Step 6: Update limits and documentation**

Set `MAX_UPLOAD_BYTES = 10 * 1024 * 1024` and document image types, 8-photo limit, 15 MB source limit, compression, drag/move controls, IndexedDB registration, and standalone Base64 behavior.

- [ ] **Step 7: Run all automated checks**

Run: `node --test tests/*.test.js && node --check assets/app.js && node --check assets/viewer.js && node -e "JSON.parse(require('fs').readFileSync('invitation-data.json','utf8'))"`

Expected: all tests pass, scripts parse, JSON parses.

- [ ] **Step 8: Commit the task**

```bash
git add assets/app.js assets/viewer.js README.md tests/app-contract.test.js
git commit -m "Preserve registered photo invitations across reloads" \
  -m "Constraint: Existing localStorage invitations must migrate without all-or-nothing loss.
Confidence: high
Scope-risk: broad
Directive: Delete a legacy record only after its IndexedDB write succeeds.
Tested: node --test tests/*.test.js; syntax and JSON checks"
```

### Task 8: Browser Acceptance And Regression Review

**Files:**
- Modify only when a reproduced defect requires a focused fix.
- Capture: `output/playwright/ordered-photo-content/`

**Interfaces:**
- Consumes: completed application at `http://localhost:4173`.
- Produces: screenshots and measured browser evidence for the stop condition.

- [ ] **Step 1: Run fresh static checks**

Run:

```bash
node --test tests/*.test.js
node --check assets/app.js
node --check assets/invitation-core.js
node --check assets/image-tools.js
node --check assets/content-order.js
node --check assets/invitation-storage.js
node --check assets/viewer.js
node -e "JSON.parse(require('fs').readFileSync('invitation-data.json','utf8'))"
git diff --check
```

Expected: zero failures.

- [ ] **Step 2: Verify image formats and limits in Chromium**

Use Playwright CLI at 1440x900. Add one JPEG, PNG, and WebP fixture; verify three photo cards, encoded MIME types, each payload at or below 600 KB, and clear errors for SVG and a source above 15 MB.

- [ ] **Step 3: Verify mixed reordering**

Drag a photo between course 1 and course 2, move it down with the keyboard control, and verify DOM card order equals preview order. Confirm focus remains on the moved item's control.

- [ ] **Step 4: Verify artifact parity**

Download, register, reload, open `viewer.html?id=...`, and compare item type/ID order from each normalized payload. Confirm the viewer URL is same-origin and all images have matching `src`, `alt`, and caption values.

- [ ] **Step 5: Verify mobile behavior**

Resize to 390x844. Exercise the drag handle with touch-style pointer events, move buttons, preview/library tabs, and image rendering. Assert `document.body.scrollWidth === innerWidth` and capture editor plus preview screenshots.

- [ ] **Step 6: Check browser health and review the diff**

Confirm zero console errors and warnings, inspect screenshots for clipping/overlap, run `git diff --check`, and review the full diff for unsafe data URLs, direct imported-HTML rendering, synchronous storage assumptions, and leaked object URLs.

- [ ] **Step 7: Commit only reproduced acceptance fixes**

Use a Lore-formatted commit describing the reproduced defect, rejected alternatives, exact verification, and remaining untested gaps. Do not create an empty acceptance commit.
