# Invitation Intro Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add eight optional, reusable invitation intro presets that behave consistently in the editor preview and downloaded standalone HTML.

**Architecture:** A new UMD-style `InvitationIntro` module owns preset metadata, markup, CSS, and playback lifecycle. `InvitationCore` delegates intro normalization and standalone assembly to this module, while `app.js` controls when preview playback starts so ordinary form edits can update content without replaying the intro.

**Tech Stack:** Static HTML5, CSS custom properties and keyframes, vanilla JavaScript, Node.js built-in test runner, Playwright browser QA.

**Spec:** `docs/superpowers/specs/2026-09-05-invitation-intro-effects-design.md`

## Global Constraints

- Keep the application as static HTML, CSS, and JavaScript. Do not add Node.js or a server runtime.
- Downloaded invitations remain self-contained except for the existing font and NAVER Map network boundaries.
- Intro playback must never block invitation links, maps, scrolling, or input after it completes.
- Editing ordinary invitation fields must not restart the preview intro.
- Respect `prefers-reduced-motion: reduce` by skipping the intro immediately.
- Reuse the selected invitation template's palette and typography instead of introducing separate intro styling controls.
- Version 1 has no intro-specific text fields, duration control, audio, video, Canvas, or external animation dependency.

---

### Task 1: Intro Preset Contract And Rendering Module

**Files:**
- Create: `assets/intro-effects.js`
- Create: `tests/intro-effects.test.js`

**Interfaces:**
- Produces: `InvitationIntro.PRESETS: Readonly<Record<string, { label: string, duration: number }>>`
- Produces: `InvitationIntro.normalizeEffect(value: unknown): string`
- Produces: `InvitationIntro.renderMarkup(invitation: object, options?: { preview?: boolean }): string`
- Produces: `InvitationIntro.getStyles(): string`
- Produces: `InvitationIntro.ensureStyles(document: Document): HTMLStyleElement`
- Produces: `InvitationIntro.getStandaloneRuntime(): string`
- Produces: `InvitationIntro.play(host: HTMLElement, invitation: object, environment?: object): { finish(): void } | null`
- Produces: `InvitationIntro.stop(host: HTMLElement): void`

- [ ] **Step 1: Write failing module contract tests**

```js
test("intro presets normalize to eight active effects plus none", () => {
  const active = Object.keys(InvitationIntro.PRESETS);
  assert.deepEqual(active, ["envelope", "card-shrink", "dawn", "fireworks", "curtain", "petals", "spotlight", "photo-focus"]);
  assert.equal(InvitationIntro.normalizeEffect("fireworks"), "fireworks");
  assert.equal(InvitationIntro.normalizeEffect("unknown"), "none");
});

test("photo focus reuses the first safe photo and falls back without one", () => {
  const withPhoto = InvitationIntro.renderMarkup({ introEffect: "photo-focus", title: "Us", items: [{ type: "photo", src: SAFE_WEBP }] });
  const withoutPhoto = InvitationIntro.renderMarkup({ introEffect: "photo-focus", title: "Us", items: [] });
  assert.match(withPhoto, /data-intro-photo/);
  assert.match(withPhoto, /data:image\/webp/);
  assert.match(withoutPhoto, /data-photo-fallback/);
  assert.doesNotMatch(withoutPhoto, /<img/);
});
```

- [ ] **Step 2: Run the focused tests and verify the expected module-not-found failure**

Run: `node --test tests/intro-effects.test.js`

Expected: FAIL because `assets/intro-effects.js` does not exist.

- [ ] **Step 3: Implement the UMD module and pure rendering helpers**

Use one frozen preset registry with the exact IDs and durations from the spec. Escape all reused title, subtitle, date, host, and photo attribute values. Emit one `.invitation-intro` overlay with `data-intro-effect`, an accessible `건너뛰기` button, preset-specific decorative markup, and a safe no-photo fallback.

The module must export through both `module.exports` and `root.InvitationIntro`. `ensureStyles()` inserts one `style[data-intro-styles]` element for maker previews and returns an existing one on later calls. Keep the standalone runtime as a returned source string so downloaded HTML needs no external JavaScript file.

- [ ] **Step 4: Add lifecycle tests using a minimal fake host**

```js
test("play completes once and restores the host after repeated finish signals", () => {
  const fixture = createIntroFixture();
  const controller = InvitationIntro.play(fixture.host, { introEffect: "dawn", title: "Us" }, fixture.environment);
  controller.finish();
  controller.finish();
  assert.equal(fixture.host.classList.contains("is-intro-active"), false);
  assert.equal(fixture.removedOverlays, 1);
  assert.equal(fixture.clearedTimers, 1);
});

test("reduced motion skips before an active overlay remains mounted", () => {
  const fixture = createIntroFixture({ reducedMotion: true });
  InvitationIntro.play(fixture.host, { introEffect: "envelope", title: "Us" }, fixture.environment);
  assert.equal(fixture.host.querySelector("[data-intro-overlay]"), null);
});
```

- [ ] **Step 5: Implement idempotent playback, skip, Escape, timer, and cleanup**

`play()` stops any previous controller on the host, mounts the overlay, pauses background particles through `is-intro-active`, and completes through one guarded `finish()` function. The environment argument may inject timer and reduced-motion functions for tests; production defaults come from the host document's window. Any setup error calls cleanup and leaves the invitation visible.

- [ ] **Step 6: Run focused tests**

Run: `node --test tests/intro-effects.test.js`

Expected: PASS.

- [ ] **Step 7: Commit**

Commit only `assets/intro-effects.js` and `tests/intro-effects.test.js` using a Lore-formatted message describing the shared preset boundary and test evidence.

---

### Task 2: Canonical Data And Standalone Export

**Files:**
- Modify: `assets/invitation-core.js:1-63,213-249,367-477`
- Modify: `index.html:169-173`
- Modify: `viewer.html` script order
- Modify: `tests/invitation-core.test.js`
- Modify: `tests/app-contract.test.js`

**Interfaces:**
- Consumes: `InvitationIntro.normalizeEffect`, `renderMarkup`, `getStyles`, and `getStandaloneRuntime` from Task 1.
- Produces: normalized `invitation.introEffect: string`.
- Produces: standalone documents with intro markup and runtime only for active effects.

- [ ] **Step 1: Write failing normalization and standalone export tests**

```js
test("normalizeInvitation allowlists intro effects", () => {
  assert.equal(normalizeInvitation({ introEffect: "curtain" }).introEffect, "curtain");
  assert.equal(normalizeInvitation({ introEffect: "script" }).introEffect, "none");
});

test("active standalone intro is self-contained and canonical", () => {
  const html = buildStandaloneHtml({ introEffect: "envelope", title: "Invite" });
  assert.match(html, /data-intro-effect="envelope"/);
  assert.match(html, /data-intro-runtime/);
  assert.equal(invitationDataFrom(html).introEffect, "envelope");
});

test("none omits standalone intro markup styles and runtime", () => {
  const html = buildStandaloneHtml({ introEffect: "none" });
  assert.doesNotMatch(html, /data-intro-overlay|data-intro-runtime|invitation-intro/);
});
```

- [ ] **Step 2: Run focused tests and verify missing-field/output failures**

Run: `node --test tests/invitation-core.test.js`

Expected: FAIL because `introEffect` is not normalized and standalone output contains no intro.

- [ ] **Step 3: Integrate the intro module with InvitationCore**

Load `InvitationIntro` from the browser global or CommonJS `require("./intro-effects.js")`. Add `introEffect: "none"` to `defaultInvitation`, normalize through `InvitationIntro.normalizeEffect`, and serialize it in canonical JSON. For active effects only, append `InvitationIntro.getStyles()` to the standalone style block, insert `renderMarkup()` before the invitation card, and append `getStandaloneRuntime()` after the content.

Add `assets/intro-effects.js` before `assets/invitation-core.js` in both editor and viewer pages.

- [ ] **Step 4: Add all-preset and photo-fallback export assertions**

Loop over `Object.keys(InvitationIntro.PRESETS)` and assert each generated document includes the exact `data-intro-effect`. Generate `photo-focus` with and without `SAFE_WEBP` and verify safe image reuse and fallback markup.

- [ ] **Step 5: Run core and contract tests**

Run: `node --test tests/invitation-core.test.js tests/app-contract.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit the core, page script-order, and test changes using a Lore-formatted message documenting the active-only export choice.

---

### Task 3: Editor Controls And Non-Replaying Preview Lifecycle

**Files:**
- Modify: `index.html:34-59,147-153`
- Modify: `assets/app.js:6-40,305-354,502-546,1108-1246`
- Modify: `assets/style.css`
- Modify: `tests/app-contract.test.js`

**Interfaces:**
- Consumes: `InvitationIntro.play(host, invitation)` and `InvitationIntro.stop(host)` from Task 1.
- Produces: form field `name="introEffect"` and replay command `#replay-intro-button`.
- Produces: `playPreviewIntro()` as the only editor path that starts intro playback.

- [ ] **Step 1: Write failing editor control and lifecycle contract tests**

```js
test("editor exposes grouped intro choices and replay control", () => {
  const html = read("index.html");
  assert.match(html, /name="introEffect"/);
  assert.match(html, /id="replay-intro-button"/);
  for (const effect of ["envelope", "card-shrink", "dawn", "fireworks", "curtain", "petals", "spotlight", "photo-focus"]) {
    assert.match(html, new RegExp(`value="${effect}"`));
  }
});

test("ordinary preview rendering does not start intro playback", () => {
  const source = read("assets/app.js");
  const renderPreviewBody = functionBody(source, "renderPreview");
  assert.doesNotMatch(renderPreviewBody, /InvitationIntro\.play/);
  assert.match(source, /const playPreviewIntro/);
});
```

- [ ] **Step 2: Run the contract tests and verify missing-control failures**

Run: `node --test tests/app-contract.test.js`

Expected: FAIL because intro controls and playback separation do not exist.

- [ ] **Step 3: Add the grouped select and replay icon command**

Place a full-width visual-effects row before particle controls. Use option groups `클래식`, `시네마틱`, `축하`, `로맨틱`, and `사진`; keep `사용 안 함` first. Use a familiar replay icon inside the button, with `title` and `aria-label` set to `인트로 다시 보기`, and stable 40px control dimensions.

- [ ] **Step 4: Wire form data, fill behavior, and replay state**

Read `introEffect` in `getFormData()`, restore it in `fillForm()`, cache the select and replay button in `dom`, and disable replay whenever the normalized effect is `none`.

- [ ] **Step 5: Preserve active overlays during ordinary preview markup replacement**

Update `updatePreviewMarkup()` to temporarily detach the current `[data-intro-overlay]`, replace the invitation card while retaining existing map canvases, and append the same overlay again. Do not call `InvitationIntro.play()` inside `renderPreview()`.

- [ ] **Step 6: Start playback only from explicit intro actions**

Add `playPreviewIntro()` that normalizes current form data and calls `InvitationIntro.play(dom.preview, invitation)`. In the form `input` listener, detect `event.target.name === "introEffect"`: render first, stop for `none`, otherwise play once. The replay button calls `playPreviewIntro()`. Initial page load renders the invitation without autoplay in the maker.

- [ ] **Step 7: Add editor and preview styles**

Style the control as a compact full-width row, align the replay icon command with the select, and set `.preview-frame` to a containing block for its absolute intro overlay. Call `InvitationIntro.ensureStyles(document)` during editor initialization so preview and standalone output use the same choreography without duplicated CSS.

- [ ] **Step 8: Run contract and full automated tests**

Run: `node --test tests/*.test.js`

Expected: PASS with no skipped or failed tests.

- [ ] **Step 9: Commit**

Commit editor, preview lifecycle, styling, and contract tests using a Lore-formatted message documenting the no-replay-on-edit invariant.

---

### Task 4: Visual Polish And Browser Verification

**Files:**
- Modify: `assets/intro-effects.js`
- Modify: `assets/style.css`
- Modify: `tests/intro-effects.test.js`
- Create: `tests/playwright/intro-effects.spec.js` only if the repository already has a runnable Playwright test harness; otherwise keep browser evidence outside the repository.

**Interfaces:**
- Consumes: completed preview and standalone intro flows from Tasks 1-3.
- Produces: verified desktop and mobile presentation for every preset.

- [ ] **Step 1: Start the existing static server and establish the baseline**

Run: `python3 -m http.server 4173`

Expected: `http://localhost:4173` serves the maker. If port 4173 is already occupied by this repository, reuse it instead of starting another process.

- [ ] **Step 2: Exercise every preset in the maker preview**

At desktop 1440x1000 and mobile 390x844, select each active intro, capture its opening and near-completion states, and verify the overlay stays inside the preview frame. Verify the title remains readable, the skip control fits within safe bounds, and no element overlaps editor controls.

- [ ] **Step 3: Exercise standalone output and completion paths**

Download or generate one invitation per representative effect group. Open standalone output and verify full viewport coverage, timer completion, click/touch completion, skip button, Escape, restored scrolling, working links, and working map fallback or map canvas after the overlay is removed.

- [ ] **Step 4: Verify reduced motion and editing behavior**

Emulate reduced motion and confirm standalone output reveals the invitation immediately. During an active preview intro, edit title and subtitle and confirm the card updates without restarting or losing the existing overlay. Confirm background particle animation does not advance until the intro completes.

- [ ] **Step 5: Fix visual or lifecycle defects test-first**

For each behavior defect, add the smallest failing assertion to `tests/intro-effects.test.js` or `tests/app-contract.test.js`, run it to observe failure, apply the minimal fix, and rerun the focused test. For purely visual defects, capture before and after screenshots at the same viewport and inspect console output.

- [ ] **Step 6: Run final verification**

Run: `node --test tests/*.test.js`

Run: `git diff --check`

Expected: all tests pass, no whitespace errors, no browser console errors, and all eight effects complete without leaving an interaction-blocking overlay.

- [ ] **Step 7: Commit**

Commit final polish and verification changes using a Lore-formatted message with exact automated and browser evidence.
