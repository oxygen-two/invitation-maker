# Multi-Occasion Template System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 18 complete invitation presets across nine occasions while preserving the existing static maker, editor, preview, map, export, registration, and viewer workflows.

**Architecture:** Keep `invitation-data.json` as the editable preset source, add a small catalog validator, and route normalized invitations through five layout-family renderers. The current maker remains the only editor; category selection filters presets, explicit application hydrates the existing form, and all output paths continue through `InvitationCore`.

**Tech Stack:** Static HTML, CSS, browser JavaScript, CommonJS-compatible UMD modules, Node.js built-in test runner, IndexedDB, NAVER Maps JavaScript API, original image generation, `cwebp`, Playwright browser QA.

**Spec:** `docs/superpowers/specs/2026-09-05-multi-occasion-template-system-design.md`

## Global Constraints

- Keep the application as static HTML, CSS, and JavaScript. Do not add a server runtime or new production dependency.
- Preserve the current maker rather than replacing it with a separate editor or wizard.
- Preserve template IDs `royal`, `wedding`, `black-tie`, `botanical`, and `modern`.
- Keep preview, standalone download, saved records, imported HTML, and the viewer on the same canonical renderer path.
- Keep NAVER Maps optional and never store or emit a Client Secret.
- Use original built-in visual assets; do not copy third-party template artwork.
- Keep RSVP collection, guest books, payments, and account management out of scope.
- Keep the existing eight-photo limit, 50-item limit, image compression contract, and ten-megabyte imported HTML limit.
- Preserve `prefers-reduced-motion`, keyboard move controls, and foreground particle behavior.
- Every commit must follow the repository Lore commit protocol from `AGENTS.md`.

## File Structure

### New files

- `assets/template-catalog.js`: validate catalog metadata, normalize family IDs, and provide occasion/preset lookup functions.
- `assets/template-renderers.js`: render five layout families and expose one family-style string to preview and standalone HTML.
- `assets/preset-application.js`: create canonical draft snapshots, compare dirty state, and atomically prepare a preset replacement.
- `assets/template-art/*.webp`: original lightweight decorative raster assets.
- `assets/template-art.js`: generated UMD map of template IDs to embedded WebP data URLs.
- `scripts/build-template-art.js`: dependency-free Node script that builds `assets/template-art.js` from local WebP files.
- `tests/template-catalog.test.js`: catalog invariants and fallback behavior.
- `tests/preset-application.test.js`: replacement, snapshot, and dirty-state behavior.
- `tests/template-renderers.test.js`: family dispatch, style injection, and fallback behavior.
- `tests/template-art.test.js`: generated asset allowlist and payload-budget checks.

### Existing files

- `invitation-data.json`: add nine occasions and 18 complete preset definitions.
- `index.html`: add occasion controls, pending preset summary, apply/undo actions, new item commands, and module script order.
- `assets/invitation-core.js`: normalize `layoutFamily` plus three new item types and integrate family rendering with standalone output.
- `assets/app.js`: keep the current editor orchestration while adding category filtering, explicit preset application, undo, and new item editors.
- `assets/style.css`: style the expanded maker controls, new editor cards, mobile selection flow, and responsive fallbacks.
- `tests/invitation-core.test.js`: add canonical data, security, ordering, and output parity coverage.
- `tests/app-contract.test.js`: extend the editor harness and DOM contract coverage.
- `README.md`: document occasion-first selection and the five ordered item types.

---

### Task 1: Catalog Validation And Lookup Boundary

**Files:**
- Create: `assets/template-catalog.js`
- Create: `tests/template-catalog.test.js`
- Modify: `index.html:155-161`

**Interfaces:**
- Consumes: raw `{ occasions, templates }` JSON loaded by `app.js`.
- Produces: `TemplateCatalog.OCCASION_IDS`, `TemplateCatalog.FAMILY_IDS`, `TemplateCatalog.normalizeFamily(value, templateId)`, `TemplateCatalog.normalizeCatalog(input)`, `TemplateCatalog.getPreset(catalog, id)`, `TemplateCatalog.getPresetsForOccasion(catalog, occasionId)`, and `TemplateCatalog.getOccasionForTemplate(catalog, templateId)`.

- [ ] **Step 1: Write failing catalog tests**

Create `tests/template-catalog.test.js` with a complete valid fixture and malformed siblings:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const TemplateCatalog = require("../assets/template-catalog.js");

const fixture = {
  occasions: [
    { id: "date", name: "데이트" },
    { id: "wedding", name: "결혼" }
  ],
  templates: [
    { id: "botanical", occasionId: "date", familyId: "romantic-story", name: "Botanical Date", note: "낮 산책", defaults: { title: "A Day Together" } },
    { id: "midnight-cinema", occasionId: "date", familyId: "romantic-story", name: "Midnight Cinema", note: "저녁 데이트", defaults: { title: "Tonight, Together" } },
    { id: "wedding", occasionId: "wedding", familyId: "wedding-editorial", name: "Wedding Letter", note: "클래식 결혼", defaults: { title: "Our Wedding Day" } },
    { id: "broken-family", occasionId: "wedding", familyId: "unknown", name: "Broken", defaults: {} },
    { id: "broken-occasion", occasionId: "missing", familyId: "romantic-story", name: "Broken", defaults: {} }
  ]
};

test("normalizes known occasions and drops presets with invalid relationships", () => {
  const catalog = TemplateCatalog.normalizeCatalog(fixture);
  assert.deepEqual(catalog.occasions.map(({ id }) => id), ["date", "wedding"]);
  assert.deepEqual(catalog.templates.map(({ id }) => id), ["botanical", "midnight-cinema", "wedding"]);
});

test("looks up two presets without exposing mutable defaults", () => {
  const catalog = TemplateCatalog.normalizeCatalog(fixture);
  const presets = TemplateCatalog.getPresetsForOccasion(catalog, "date");
  assert.deepEqual(presets.map(({ id }) => id), ["botanical", "midnight-cinema"]);
  presets[0].defaults.title = "mutated";
  assert.equal(TemplateCatalog.getPreset(catalog, "botanical").defaults.title, "A Day Together");
});

test("maps legacy IDs to approved families and unknown values to romantic-story", () => {
  assert.equal(TemplateCatalog.normalizeFamily("", "wedding"), "wedding-editorial");
  assert.equal(TemplateCatalog.normalizeFamily("", "black-tie"), "celebration-poster");
  assert.equal(TemplateCatalog.normalizeFamily("unknown", "unknown"), "romantic-story");
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `node --test tests/template-catalog.test.js`

Expected: FAIL with `Cannot find module '../assets/template-catalog.js'`.

- [ ] **Step 3: Implement the UMD catalog module**

Create `assets/template-catalog.js` using the established browser/CommonJS pattern:

```js
(function (root) {
  const OCCASION_IDS = Object.freeze(["date", "birthday", "anniversary", "event", "kindergarten", "wedding", "gohui", "hwangap", "first-birthday"]);
  const FAMILY_IDS = Object.freeze(["romantic-story", "celebration-poster", "kids-storybook", "wedding-editorial", "korean-heritage"]);
  const legacyFamilies = Object.freeze({
    royal: "romantic-story",
    wedding: "wedding-editorial",
    "black-tie": "celebration-poster",
    botanical: "romantic-story",
    modern: "celebration-poster"
  });
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const normalizeFamily = (value, templateId = "") => FAMILY_IDS.includes(value)
    ? value
    : legacyFamilies[templateId] || "romantic-story";

  const normalizeCatalog = (input = {}) => {
    const seenOccasions = new Set();
    const occasions = (Array.isArray(input.occasions) ? input.occasions : [])
      .filter((occasion) => OCCASION_IDS.includes(occasion?.id) && !seenOccasions.has(occasion.id) && seenOccasions.add(occasion.id))
      .map((occasion) => ({ id: occasion.id, name: String(occasion.name || occasion.id) }));
    const occasionIds = new Set(occasions.map(({ id }) => id));
    const seenTemplates = new Set();
    const templates = (Array.isArray(input.templates) ? input.templates : [])
      .filter((preset) => preset && typeof preset === "object"
        && typeof preset.id === "string" && preset.id
        && !seenTemplates.has(preset.id) && seenTemplates.add(preset.id)
        && occasionIds.has(preset.occasionId)
        && FAMILY_IDS.includes(preset.familyId)
        && preset.defaults && typeof preset.defaults === "object" && !Array.isArray(preset.defaults))
      .map((preset) => clone(preset));
    return { occasions, templates };
  };

  const getPreset = (catalog, id) => clone(catalog.templates.find((preset) => preset.id === id) || null);
  const getPresetsForOccasion = (catalog, occasionId) => clone(catalog.templates.filter((preset) => preset.occasionId === occasionId));
  const getOccasionForTemplate = (catalog, templateId) => catalog.templates.find((preset) => preset.id === templateId)?.occasionId || catalog.occasions[0]?.id || "date";
  const api = { FAMILY_IDS, OCCASION_IDS, getOccasionForTemplate, getPreset, getPresetsForOccasion, normalizeCatalog, normalizeFamily };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TemplateCatalog = api;
})(typeof window !== "undefined" ? window : globalThis);
```

Keep a private frozen legacy family map. Return deep copies from every public lookup so applying or editing a preset cannot mutate catalog defaults.

- [ ] **Step 4: Load the catalog before `invitation-core.js` and run tests**

Add this script after `intro-effects.js` and before `invitation-core.js`:

```html
<script src="assets/template-catalog.js"></script>
```

Run: `node --test tests/template-catalog.test.js tests/app-contract.test.js tests/invitation-core.test.js`

Expected: PASS with the current editor and renderer behavior unchanged.

- [ ] **Step 5: Commit the catalog boundary**

```bash
git add assets/template-catalog.js tests/template-catalog.test.js index.html
git commit -m "Give occasion presets a validated catalog boundary" \
  -m "Constraint: Keep raw JSON editable while preventing malformed preset relationships from reaching the maker.
Rejected: Reading invitation-data.json directly throughout app.js | It would duplicate validation and allow catalog defaults to be mutated.
Confidence: high
Scope-risk: narrow
Directive: Add future occasions and families through TemplateCatalog allowlists and tests.
Tested: node --test tests/template-catalog.test.js tests/app-contract.test.js tests/invitation-core.test.js
Not-tested: Occasion selection UI is delivered in a later task."
```

---

### Task 2: Canonical Invitation Schema And Five Item Types

**Files:**
- Modify: `assets/invitation-core.js:1-267,322-386,457-507`
- Modify: `tests/invitation-core.test.js:1-260`

**Interfaces:**
- Consumes: `TemplateCatalog.normalizeFamily(value, templateId)` from Task 1.
- Produces: normalized `layoutFamily`; canonical ordered items of type `course`, `photo`, `notice`, `profile`, or `link`; safe common item markup consumed by Task 4.

- [ ] **Step 1: Add failing normalization and security tests**

Append focused tests to `tests/invitation-core.test.js`:

```js
test("normalizes all five ordered item types and preserves their order", () => {
  const invitation = normalizeInvitation({
    templateId: "wedding",
    items: [
      { id: "profile-1", type: "profile", name: "김민준", role: "신랑", description: "서로의 평생 친구" },
      { id: "notice-1", type: "notice", heading: "주차 안내", body: "지하 2층을 이용해주세요." },
      { id: "course-1", type: "course", time: "14:00", place: "그랜드홀" },
      { id: "link-1", type: "link", label: "참석 여부", value: "9월 30일까지", url: "https://example.com/rsvp" },
      { id: "photo-1", type: "photo", src: SAFE_WEBP, alt: "두 사람" }
    ]
  });

  assert.equal(invitation.layoutFamily, "wedding-editorial");
  assert.deepEqual(invitation.items.map(({ type }) => type), ["profile", "notice", "course", "link", "photo"]);
});

test("rejects executable item links and keeps safe contact schemes", () => {
  const invitation = normalizeInvitation({ items: [
    { id: "bad", type: "link", label: "Bad", url: "javascript:alert(1)" },
    { id: "tel", type: "link", label: "전화", url: "tel:01012345678" },
    { id: "sms", type: "link", label: "문자", url: "sms:01012345678" }
  ] });
  assert.equal(invitation.items[0].url, "");
  assert.equal(invitation.items[1].url, "tel:01012345678");
  assert.equal(invitation.items[2].url, "sms:01012345678");
});

test("renders new item text escaped and unsafe links as non-clickable information", () => {
  const html = buildStandaloneHtml({ items: [
    { id: "notice", type: "notice", heading: "<img src=x>", body: "준비물" },
    { id: "profile", type: "profile", name: "하린", role: "주인공", description: "첫 생일" },
    { id: "link", type: "link", label: "회신", value: "문의", url: "javascript:alert(1)" }
  ] });
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /invite-profile/);
  assert.match(html, /invite-link-info/);
  assert.doesNotMatch(html, /href="javascript:/);
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `node --test --test-name-pattern="five ordered|executable item|new item text" tests/invitation-core.test.js`

Expected: FAIL because `profile`, `notice`, and `link` are currently dropped and `layoutFamily` is absent.

- [ ] **Step 3: Add the layout and item normalizers**

Require `TemplateCatalog` with the same fail-open dependency pattern used for `InvitationIntro`. Add these exact normalized shapes:

```js
const normalizeNotice = (item, id) => {
  const heading = String(item.heading || "").trim();
  const body = String(item.body || "").trim();
  return heading || body ? { id, type: "notice", heading, body } : null;
};

const normalizeProfile = (item, id) => {
  const name = String(item.name || "").trim();
  const role = String(item.role || "").trim();
  const description = String(item.description || "").trim();
  return name || role || description ? { id, type: "profile", name, role, description } : null;
};

const normalizeActionUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return ["http:", "https:", "tel:", "sms:"].includes(parsed.protocol) ? raw : "";
  } catch {
    return "";
  }
};

const normalizeLink = (item, id) => {
  const label = String(item.label || "").trim();
  const value = String(item.value || "").trim();
  const url = normalizeActionUrl(item.url);
  return label || value || url ? { id, type: "link", label, value, url } : null;
};
```

Replace the binary photo/course branch in `normalizeItems` with a five-type dispatch table. Preserve `photoCount`, duplicate-ID handling, `MAX_ITEMS`, `MAX_PHOTOS`, and legacy `stops[]` migration. Add:

```js
layoutFamily: TemplateCatalog.normalizeFamily(input.layoutFamily, input.templateId ?? defaultInvitation.templateId),
```

to normalized invitations.

- [ ] **Step 4: Render safe common markup for each new item**

Extract the current inline item mapping into `renderInvitationItems(invitation)`. Keep course numbering course-only and emit:

```html
<section class="invite-notice"><p class="invite-item-eyebrow">안내</p><h3>...</h3><p>...</p></section>
<section class="invite-profile"><p class="invite-profile-role">...</p><h3>...</h3><p>...</p></section>
<section class="invite-link-info"><p class="invite-item-eyebrow">...</p><strong>...</strong></section>
```

When a normalized link has a URL, use an `<a class="invite-link-action">`; otherwise use the non-clickable `invite-link-info` section. Escape every text field and URL through existing helpers.

- [ ] **Step 5: Run core and legacy migration tests**

Run: `node --test tests/invitation-core.test.js tests/app-contract.test.js`

Expected: PASS, including legacy `stops[]`, mixed course/photo ordering, standalone JSON, maps, intros, fonts, and particles.

- [ ] **Step 6: Commit the canonical schema**

```bash
git add assets/invitation-core.js tests/invitation-core.test.js
git commit -m "Let every occasion share one safe ordered content model" \
  -m "Constraint: Preserve legacy stops, course numbering, photo limits, and standalone normalization.
Rejected: Occasion-specific top-level schemas | They would split the existing maker into nine incompatible forms.
Confidence: high
Scope-risk: moderate
Directive: New content belongs in allowlisted ordered item types and must render through InvitationCore.
Tested: node --test tests/invitation-core.test.js tests/app-contract.test.js
Not-tested: New item editor controls are delivered in the next task."
```

---

### Task 3: Ordered Editors For Notice, Profile, And Link Cards

**Files:**
- Modify: `index.html:109-123,155-163`
- Modify: `assets/app.js:5-299,955-993,1299-1376`
- Modify: `assets/style.css:481-620,1472-1542`
- Modify: `tests/app-contract.test.js:73-260` and editor contract tests below the harness

**Interfaces:**
- Consumes: the five normalized item shapes from Task 2 and existing `ContentOrder.move(items, fromIndex, toIndex)`.
- Produces: DOM cards marked with `data-item-type`; field selectors `data-notice-field`, `data-profile-field`, and `data-link-field`; canonical objects returned by `getItemsData()`.

- [ ] **Step 1: Extend the editor harness and write failing contract tests**

Teach `makeCard` and `parseCards` in `tests/app-contract.test.js` the three new field selector families. Then add:

```js
test("editor renders and re-collects every optional information card", () => {
  const harness = loadEditorHarness({ maxItems: 10 });
  const items = [
    { id: "notice-1", type: "notice", heading: "준비물", body: "물병" },
    { id: "profile-1", type: "profile", name: "김하린", role: "주인공", description: "첫 생일" },
    { id: "link-1", type: "link", label: "참석 여부", value: "회신해주세요", url: "https://example.com/rsvp" }
  ];
  harness.renderContentEditor(items, "notice-1");
  assert.deepEqual(harness.getItemsData(), items);
  assert.match(harness.markup(), /data-notice-field="heading"/);
  assert.match(harness.markup(), /data-profile-field="name"/);
  assert.match(harness.markup(), /data-link-field="url"/);
});

test("new information cards use the existing drag and move controls", () => {
  const harness = loadEditorHarness({ maxItems: 10 });
  harness.renderContentEditor([
    { id: "notice-1", type: "notice", heading: "안내", body: "내용" },
    { id: "link-1", type: "link", label: "문의", value: "전화", url: "tel:01012345678" }
  ], "notice-1");
  assert.equal(harness.commitItemMove(0, 1), "notice-1");
  assert.deepEqual(harness.getItemsData().map(({ id }) => id), ["link-1", "notice-1"]);
});
```

- [ ] **Step 2: Run the focused editor tests and confirm failure**

Run: `node --test --test-name-pattern="optional information|information cards" tests/app-contract.test.js`

Expected: FAIL because every non-photo item currently enters the course branch.

- [ ] **Step 3: Add three item commands and empty-item factories**

Add buttons beside the current `+ 코스` and `+ 사진` commands:

```html
<button class="add-item-button" type="button" data-add-item="notice">+ 안내</button>
<button class="add-item-button" type="button" data-add-item="profile">+ 인물 소개</button>
<button class="add-item-button" type="button" data-add-item="link">+ 연락처·링크</button>
```

Replace `emptyCourse()` with `createEmptyItem(type)` returning exact canonical fields for all non-photo types. Keep photo creation in the compression pipeline.

- [ ] **Step 4: Make collection, summaries, rendering, and focus type-aware**

Change `getItemsData()` to a `switch (type)` and add render helpers:

```js
const renderNoticeFields = (item, bodyId, isOpen) => `...data-notice-field="heading"...data-notice-field="body"...`;
const renderProfileFields = (item, bodyId, isOpen) => `...data-profile-field="name"...data-profile-field="role"...data-profile-field="description"...`;
const renderLinkFields = (item, bodyId, isOpen) => `...data-link-field="label"...data-link-field="value"...data-link-field="url" type="url"...`;
```

Use this type metadata in `renderContentEditor`:

```js
const ITEM_LABELS = Object.freeze({ course: "코스", photo: "사진", notice: "안내", profile: "인물 소개", link: "연락처·링크" });
```

Update `getFocusedItemContext`, delete confirmation names, live summaries, add-button disabling, and post-add focus selectors. Do not change the shared reorder implementation.

- [ ] **Step 5: Add responsive editor styling and verify all editor tests**

Give every new field grid the same full-width mobile behavior as course/photo editors. Make `.content-editor-commands` horizontally scrollable below 540px and keep each command at least 44px high.

Run: `node --test tests/app-contract.test.js tests/content-order.test.js tests/invitation-core.test.js`

Expected: PASS with all five item types retaining order and focus after rerender.

- [ ] **Step 6: Commit the expanded editor**

```bash
git add index.html assets/app.js assets/style.css tests/app-contract.test.js
git commit -m "Keep occasion details editable in one ordered invitation flow" \
  -m "Constraint: Reuse the existing card, drag, focus, and mobile interaction contracts.
Rejected: Separate wedding and family-event forms | They would replace the maker the user asked to preserve.
Confidence: high
Scope-risk: moderate
Directive: Every item editor must round-trip through getItemsData and InvitationCore normalization.
Tested: node --test tests/app-contract.test.js tests/content-order.test.js tests/invitation-core.test.js
Not-tested: Final family-specific visual treatment is delivered later."
```

---

### Task 4: Five Layout-Family Renderers

**Files:**
- Create: `assets/template-renderers.js`
- Create: `tests/template-renderers.test.js`
- Modify: `index.html:155-163`
- Modify: `assets/invitation-core.js:322-398,457-501`
- Modify: `assets/app.js:1198-1205`
- Modify: `tests/invitation-core.test.js`

**Interfaces:**
- Consumes: `TemplateCatalog.normalizeFamily`, a normalized invitation, and safe pre-rendered slots from `InvitationCore`.
- Produces: `TemplateRenderers.ensureStyles(document)`, `TemplateRenderers.getStyles()`, and `TemplateRenderers.render(familyId, slots)`.

- [ ] **Step 1: Write failing renderer boundary tests**

Create `tests/template-renderers.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const TemplateRenderers = require("../assets/template-renderers.js");

const slots = {
  articleAttributes: 'data-template="sample"',
  particles: "PARTICLES",
  kicker: "INVITATION",
  title: "TITLE",
  subtitle: "SUBTITLE",
  message: "MESSAGE",
  meta: "META",
  items: "ITEMS",
  map: "MAP",
  mapLink: "MAP_LINK"
};

test("renders every family with the complete safe slot set", () => {
  for (const family of ["romantic-story", "celebration-poster", "kids-storybook", "wedding-editorial", "korean-heritage"]) {
    const html = TemplateRenderers.render(family, slots);
    assert.match(html, new RegExp(`data-layout-family="${family}"`));
    for (const marker of ["PARTICLES", "TITLE", "MESSAGE", "META", "ITEMS", "MAP", "MAP_LINK"]) assert.match(html, new RegExp(marker));
  }
});

test("unknown families fall back to romantic-story", () => {
  assert.match(TemplateRenderers.render("unknown", slots), /data-layout-family="romantic-story"/);
});

test("ensureStyles inserts one reusable family style element", () => {
  const appended = [];
  const document = { head: { append: (node) => appended.push(node) }, createElement: () => ({ id: "", textContent: "" }), getElementById: () => null };
  TemplateRenderers.ensureStyles(document);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].id, "invitation-template-family-styles");
  assert.match(appended[0].textContent, /data-layout-family="korean-heritage"/);
});
```

- [ ] **Step 2: Run renderer tests and confirm failure**

Run: `node --test tests/template-renderers.test.js`

Expected: FAIL with `Cannot find module '../assets/template-renderers.js'`.

- [ ] **Step 3: Implement five explicit render functions**

Create a UMD module with one renderer per family. Each function must consume every slot exactly once, retain `.invitation-card`, `.invite-hero`, `.invite-meta`, `.invite-timeline`, map selectors, and the particle container, and add `data-layout-family` to the article.

Use a shared fallback and explicit registry:

```js
const renderers = Object.freeze({
  "romantic-story": renderRomanticStory,
  "celebration-poster": renderCelebrationPoster,
  "kids-storybook": renderKidsStorybook,
  "wedding-editorial": renderWeddingEditorial,
  "korean-heritage": renderKoreanHeritage
});
const render = (familyId, slots) => (renderers[familyId] || renderers["romantic-story"])(slots);
```

The initial family CSS may be structural and token-based, but it must visibly change hero alignment, metadata composition, and item framing across all five families. Put that CSS in one `getStyles()` string and reuse it in both `ensureStyles(document)` and standalone output.

- [ ] **Step 4: Dispatch `InvitationCore` through safe slots**

In `renderInvitationBody`, normalize and escape all invitation values first. Build `articleAttributes`, `particles`, hero text, message, meta markup, item markup, map markup, and map-link markup. Pass only those strings into:

```js
return TemplateRenderers.render(invitation.layoutFamily, slots);
```

Load `template-renderers.js` after `template-catalog.js` and before `invitation-core.js`. Call `TemplateRenderers.ensureStyles(document)` during `init()`. Append `TemplateRenderers.getStyles()` after the existing common standalone CSS.

- [ ] **Step 5: Prove preview and standalone parity**

Add a core test for one invitation per family:

```js
test("preview body and standalone HTML resolve the same layout family", () => {
  for (const layoutFamily of TemplateCatalog.FAMILY_IDS) {
    const input = { layoutFamily, title: layoutFamily, items: [{ id: "notice", type: "notice", heading: "안내", body: "내용" }] };
    assert.match(InvitationCore.renderInvitationBody(input), new RegExp(`data-layout-family="${layoutFamily}"`));
    assert.match(InvitationCore.buildStandaloneHtml(input), new RegExp(`data-layout-family="${layoutFamily}"`));
  }
});
```

Run: `node --test tests/template-renderers.test.js tests/invitation-core.test.js tests/intro-effects.test.js tests/app-contract.test.js`

Expected: PASS with intro selectors, particles, maps, and existing templates still present.

- [ ] **Step 6: Commit the renderer boundary**

```bash
git add assets/template-renderers.js tests/template-renderers.test.js assets/invitation-core.js tests/invitation-core.test.js assets/app.js index.html
git commit -m "Let invitations vary by layout without splitting delivery paths" \
  -m "Constraint: Preview, standalone HTML, saved records, and viewer output must share one family dispatch.
Rejected: One renderer per preset | It would multiply map, intro, item, and export behavior eighteen times.
Confidence: high
Scope-risk: broad
Directive: Family renderers may arrange safe slots but may not own storage, maps, particles, or normalization.
Tested: node --test tests/template-renderers.test.js tests/invitation-core.test.js tests/intro-effects.test.js tests/app-contract.test.js
Not-tested: Final imagery and responsive visual polish are delivered in Task 6."
```

---

### Task 5: Occasion Picker, Complete Presets, And One-Step Undo

**Files:**
- Create: `assets/preset-application.js`
- Create: `tests/preset-application.test.js`
- Modify: `invitation-data.json`
- Modify: `index.html:29-34,155-164`
- Modify: `assets/app.js:7-45,344-404,643-667,1184-1205,1384-1390`
- Modify: `assets/style.css:256-310,1370-1542`
- Modify: `tests/app-contract.test.js`
- Modify: `tests/template-catalog.test.js`

**Interfaces:**
- Consumes: Task 1 catalog lookups and Task 2 `InvitationCore.normalizeInvitation`.
- Produces: `PresetApplication.snapshot(invitation)`, `PresetApplication.isDirty(current, baseline)`, and `PresetApplication.prepare({ current, preset, naverMapClientId }) -> { previous, next }`; maker state fields `catalog`, `activeOccasion`, `pendingTemplateId`, `appliedBaseline`, and `undoSnapshot`.

- [ ] **Step 1: Write failing preset application tests**

Create `tests/preset-application.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const PresetApplication = require("../assets/preset-application.js");

const preset = {
  id: "modern-vow",
  familyId: "wedding-editorial",
  defaults: {
    title: "Minjun & Seoyeon",
    subtitle: "두 사람이 함께 걷는 첫날",
    items: [{ id: "notice-1", type: "notice", heading: "예식 안내", body: "오후 2시" }]
  }
};

test("prepares a normalized replacement without mutating draft or preset", () => {
  const current = { templateId: "royal", title: "현재 초안", items: [{ id: "course-1", type: "course", place: "성수" }] };
  const originalPreset = JSON.stringify(preset);
  const result = PresetApplication.prepare({ current, preset, naverMapClientId: "public-id" });
  assert.equal(result.previous.title, "현재 초안");
  assert.equal(result.next.templateId, "modern-vow");
  assert.equal(result.next.layoutFamily, "wedding-editorial");
  assert.equal(result.next.naverMapClientId, "public-id");
  assert.equal(JSON.stringify(preset), originalPreset);
});

test("dirty comparison uses canonical normalized invitations", () => {
  const baseline = { title: "초대", particleAmount: 100, items: [] };
  assert.equal(PresetApplication.isDirty({ ...baseline }, baseline), false);
  assert.equal(PresetApplication.isDirty({ ...baseline, title: "수정" }, baseline), true);
});

test("rejects malformed presets before creating a replacement", () => {
  assert.throws(() => PresetApplication.prepare({ current: {}, preset: { id: "broken", defaults: null } }), /invalid preset/);
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `node --test tests/preset-application.test.js`

Expected: FAIL with `Cannot find module '../assets/preset-application.js'`.

- [ ] **Step 3: Implement atomic preset preparation**

Create a UMD module that depends on `InvitationCore`. Use JSON cloning because canonical invitations contain only serializable data. Validate `preset.id`, `preset.familyId`, and plain-object `preset.defaults` before cloning. `prepare` must normalize `current` first, then normalize a separate object composed only from cloned defaults plus stable preset identity and the public map Client ID. It must not touch DOM or global maker state.

- [ ] **Step 4: Define the exact nine occasions and 18 presets**

Update `invitation-data.json` with these stable IDs and defaults. Every preset supplies title, subtitle, date label, host, location, message, intro, particle settings, both fonts, and an ordered item sequence:

| Occasion ID | Preset ID | Family | Default title | Ordered item types |
| --- | --- | --- | --- | --- |
| `date` | `botanical` | `romantic-story` | `A Day in Seongsu` | course, photo, course, course |
| `date` | `midnight-cinema` | `romantic-story` | `Tonight, Together` | photo, course, course, notice |
| `birthday` | `modern` | `celebration-poster` | `A Very Happy Birthday` | profile, notice, course, link |
| `birthday` | `color-pop` | `celebration-poster` | `LET'S CELEBRATE!` | notice, course, photo, link |
| `anniversary` | `royal` | `romantic-story` | `Our Anniversary` | photo, notice, course, link |
| `anniversary` | `memory-film` | `romantic-story` | `The Days We Remember` | photo, profile, photo, notice |
| `event` | `black-tie` | `celebration-poster` | `An Evening Invitation` | notice, course, link |
| `event` | `gallery-notice` | `celebration-poster` | `OPENING NIGHT` | notice, course, profile, link |
| `kindergarten` | `sunny-classroom` | `kids-storybook` | `우리들의 작은 발표회` | notice, course, profile, link |
| `kindergarten` | `little-forest` | `kids-storybook` | `숲으로 떠나는 하루` | notice, course, course, link |
| `wedding` | `wedding` | `wedding-editorial` | `Minjun & Seoyeon` | profile, profile, photo, course, notice, link |
| `wedding` | `modern-vow` | `wedding-editorial` | `Together, We Begin` | photo, profile, profile, course, link |
| `gohui` | `blue-porcelain` | `korean-heritage` | `고희를 함께 축하해주세요` | profile, notice, course, link |
| `gohui` | `peony-tribute` | `korean-heritage` | `사랑과 감사의 일흔 해` | photo, profile, notice, course |
| `hwangap` | `red-silk` | `korean-heritage` | `환갑을 맞아 모십니다` | profile, notice, course, link |
| `hwangap` | `golden-years` | `korean-heritage` | `빛나는 예순의 이야기` | photo, profile, notice, course |
| `first-birthday` | `first-chapter` | `kids-storybook` | `하린이의 첫 번째 생일` | profile, photo, notice, course, link |
| `first-birthday` | `little-star` | `kids-storybook` | `Our Little Star Turns One` | photo, profile, notice, course |

Apply these exact recommended style defaults while keeping every control editable:

| Preset ID | Intro | Particle | Scale / amount | English font | Korean font |
| --- | --- | --- | --- | --- | --- |
| `botanical` | `dawn` | `leaves` | 90 / 75 | `cormorant-garamond` | `gowun-batang` |
| `midnight-cinema` | `spotlight` | `fireflies` | 100 / 100 | `dm-serif-display` | `nanum-gothic` |
| `modern` | `card-shrink` | `confetti` | 100 / 125 | `dm-serif-display` | `gmarket-sans` |
| `color-pop` | `fireworks` | `confetti` | 120 / 175 | `dm-serif-display` | `gmarket-sans` |
| `royal` | `envelope` | `hearts` | 90 / 75 | `great-vibes` | `gowun-batang` |
| `memory-film` | `photo-focus` | `sparkle` | 90 / 75 | `libre-baskerville` | `nanum-myeongjo` |
| `black-tie` | `spotlight` | `sparkle` | 80 / 75 | `playfair-display` | `nanum-gothic` |
| `gallery-notice` | `curtain` | `none` | 100 / 100 | `dm-serif-display` | `gmarket-sans` |
| `sunny-classroom` | `card-shrink` | `confetti` | 110 / 125 | `dm-serif-display` | `gmarket-sans` |
| `little-forest` | `dawn` | `leaves` | 95 / 100 | `cormorant-garamond` | `gowun-batang` |
| `wedding` | `envelope` | `petals` | 90 / 75 | `great-vibes` | `noto-serif-kr` |
| `modern-vow` | `photo-focus` | `sparkle` | 85 / 75 | `playfair-display` | `noto-serif-kr` |
| `blue-porcelain` | `dawn` | `none` | 100 / 100 | `libre-baskerville` | `song-myung` |
| `peony-tribute` | `petals` | `petals` | 95 / 75 | `cormorant-garamond` | `song-myung` |
| `red-silk` | `curtain` | `sparkle` | 90 / 75 | `libre-baskerville` | `song-myung` |
| `golden-years` | `photo-focus` | `sparkle` | 85 / 75 | `libre-baskerville` | `nanum-myeongjo` |
| `first-chapter` | `photo-focus` | `bubbles` | 100 / 100 | `cormorant-garamond` | `gowun-batang` |
| `little-star` | `dawn` | `sparkle` | 95 / 100 | `great-vibes` | `gowun-batang` |

Use Korean sample details that are immediately understandable and editable. Keep `mapEnabled: false` in defaults so choosing a preset never starts geocoding without user intent. Use safe example URLs only where an action must be demonstrated; otherwise keep link URLs empty.

- [ ] **Step 5: Add category, pending selection, apply, and undo controls**

Replace the current template section contents with:

```html
<span class="picker-label">Occasion</span>
<div id="occasion-list" class="occasion-list" aria-label="행사 유형"></div>
<span class="picker-label">Template</span>
<div id="template-list" class="template-list"></div>
<div class="template-apply-row">
  <p id="template-summary" aria-live="polite"></p>
  <button id="apply-template-button" type="button">이 템플릿 적용</button>
  <button id="undo-template-button" type="button" hidden>되돌리기</button>
</div>
```

Load `preset-application.js` after `invitation-core.js` and before `app.js`.

In `loadInitialData`, normalize the catalog, derive the active occasion from the current template, and set both pending and active template IDs. In event handlers:

- Occasion click updates only `activeOccasion` and `pendingTemplateId`, then rerenders selector controls.
- Preset click updates only `pendingTemplateId` and `aria-pressed` state.
- Apply gets `current = getFormData()`, confirms only when `PresetApplication.isDirty(current, state.appliedBaseline)`, calls `prepare`, then atomically assigns state and calls `fillForm` plus `renderPreview`.
- Apply sets `undoSnapshot = previous`, `appliedBaseline = next`, and reveals one undo action.
- Undo restores and clears `undoSnapshot`, updates active occasion/template, fills the form, renders preview, and returns focus to the restored preset card.
- Any prepare error leaves the form unchanged and reports `템플릿을 적용하지 못했습니다. 현재 초안은 그대로 유지됩니다.`

- [ ] **Step 6: Add selector and state contract tests**

Extend the app harness with occasion, apply, and undo targets. Assert that category and preset clicks do not call `fillForm`; cancelled confirmation leaves markup and state unchanged; successful apply calls `fillForm` once; and undo restores the previous normalized title and items.

Extend `tests/template-catalog.test.js` to load `invitation-data.json` and assert:

```js
assert.equal(catalog.occasions.length, 9);
assert.equal(catalog.templates.length, 18);
for (const occasion of catalog.occasions) {
  assert.equal(TemplateCatalog.getPresetsForOccasion(catalog, occasion.id).length, 2);
}
assert.deepEqual(["royal", "wedding", "black-tie", "botanical", "modern"].filter((id) => !TemplateCatalog.getPreset(catalog, id)), []);
```

- [ ] **Step 7: Run all automated tests and commit**

Run: `node --test tests/*.test.js`

Expected: PASS with 18 valid presets and no regression in editor, storage, export, or viewer contracts.

```bash
git add invitation-data.json index.html assets/preset-application.js assets/app.js assets/style.css tests/preset-application.test.js tests/template-catalog.test.js tests/app-contract.test.js
git commit -m "Make complete occasion presets safe to apply inside the existing maker" \
  -m "Constraint: Browsing categories must never overwrite an in-progress invitation.
Rejected: Applying templates immediately on card click | It would destroy edited content during exploration.
Confidence: high
Scope-risk: broad
Directive: Keep preset replacement atomic, explicit, and recoverable through one canonical snapshot.
Tested: node --test tests/*.test.js
Not-tested: Final visual assets and viewport-specific polish are delivered in Task 6."
```

---

### Task 6: Original Template Art, Five Visual Families, And Mobile Polish

**Files:**
- Create: `assets/template-art/romantic-story-cover.webp`
- Create: `assets/template-art/color-pop.webp`
- Create: `assets/template-art/gallery-notice.webp`
- Create: `assets/template-art/sunny-classroom.webp`
- Create: `assets/template-art/little-forest.webp`
- Create: `assets/template-art/wedding-paper.webp`
- Create: `assets/template-art/blue-porcelain.webp`
- Create: `assets/template-art/peony-tribute.webp`
- Create: `assets/template-art/red-silk.webp`
- Create: `assets/template-art/golden-years.webp`
- Create: `assets/template-art/first-chapter-stars.webp`
- Create: `scripts/build-template-art.js`
- Create: `assets/template-art.js`
- Create: `tests/template-art.test.js`
- Modify: `assets/template-renderers.js`
- Modify: `assets/invitation-core.js`
- Modify: `index.html:155-165`
- Modify: `assets/style.css`
- Modify: `tests/template-renderers.test.js`
- Modify: `tests/invitation-core.test.js`

**Interfaces:**
- Consumes: stable template IDs and family markup from Tasks 4-5.
- Produces: `TemplateArt.getDataUrl(templateId) -> string`; original WebP decoration; final responsive family CSS reused by preview and standalone HTML.

- [ ] **Step 1: Write failing generated-art tests**

Create `tests/template-art.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const TemplateArt = require("../assets/template-art.js");

const decorated = [
  "midnight-cinema",
  "color-pop",
  "memory-film",
  "gallery-notice",
  "sunny-classroom",
  "little-forest",
  "modern-vow",
  "blue-porcelain",
  "peony-tribute",
  "red-silk",
  "golden-years",
  "first-chapter",
  "little-star"
];

test("returns only allowlisted WebP data URLs", () => {
  for (const id of decorated) assert.match(TemplateArt.getDataUrl(id), /^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/);
  assert.equal(TemplateArt.getDataUrl("unknown"), "");
});

test("keeps every embedded decoration within its 80 KiB source budget", () => {
  for (const id of decorated) {
    const payload = TemplateArt.getDataUrl(id).split(",")[1];
    assert.ok(Buffer.from(payload, "base64").byteLength <= 80 * 1024, id);
  }
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `node --test tests/template-art.test.js`

Expected: FAIL with `Cannot find module '../assets/template-art.js'`.

- [ ] **Step 3: Create and optimize original raster assets**

Generate one original 4:3 PNG source per subject with the image generation tool, visually inspect the full-resolution output, and reject outputs containing readable text, logos, watermarks, identifiable faces, or cropped focal objects. Keep clear negative space for invitation copy and use these subjects:

- Romantic Story: softly lit real floral table detail suitable behind photo-free date/anniversary copy.
- Color Pop: flat celebratory paper forms and confetti with strong primary accents.
- Gallery Notice: editorial exhibition wall and directional typography shapes without readable words.
- Sunny Classroom: bright handmade classroom-stage illustration.
- Little Forest: gentle illustrated forest path and picnic details.
- Wedding Paper: tactile ivory paper, fine border, and restrained botanical embossing.
- Blue Porcelain: original blue-and-white porcelain-inspired floral pattern.
- Peony Tribute: dignified painted peony arrangement with broad whitespace.
- Red Silk: folded crimson silk and subtle traditional knot detail.
- Golden Years: warm family-album table detail with no identifiable faces.
- First Chapter Stars: soft nursery night sky with paper stars.

Store generated PNG sources outside the repository. Convert each approved source to a 1200x900-or-smaller WebP with the installed `cwebp`, beginning at quality 72 and reducing quality only as needed to satisfy the 80 KiB budget:

```bash
cwebp -quiet -q 72 -resize 1200 0 /path/to/approved-source.png -o assets/template-art/<name>.webp
find assets/template-art -name '*.webp' -size +81920c -print
```

The `find` command must print nothing. Open every resulting WebP and inspect it again after compression before accepting it.

- [ ] **Step 4: Build the dependency-free asset module**

Create `scripts/build-template-art.js` using only `node:fs` and `node:path`. Map source basenames to template IDs in a frozen object, read each WebP, reject files above `80 * 1024` bytes, and write a deterministic UMD module exposing:

```js
const getDataUrl = (templateId) => ART[templateId] || "";
const api = { getDataUrl, templateIds: Object.freeze(Object.keys(ART)) };
```

Map `romantic-story-cover` to `midnight-cinema` and `memory-film`, `wedding-paper` to `modern-vow`, and `first-chapter-stars` to both `first-chapter` and `little-star`. Map each remaining basename to its same-named template ID. Run:

`node scripts/build-template-art.js`

Expected: writes deterministic `assets/template-art.js` and exits zero.

- [ ] **Step 5: Integrate selected-only art and final family styles**

Load `template-art.js` after `template-catalog.js` and before `template-renderers.js`. In `InvitationCore`, resolve only `TemplateArt.getDataUrl(invitation.templateId)` and pass it as an escaped `art` slot. Family renderers may omit the image when the string is empty.

Complete family styles with these required distinctions:

- `romantic-story`: full-bleed hero image or fallback color, bottom-aligned title, narrative item rhythm.
- `celebration-poster`: compact hero, large upright type, high-contrast date strip, geometric item frames.
- `kids-storybook`: illustrated hero, friendly shapes, large labels, concise notice blocks.
- `wedding-editorial`: centered names, generous whitespace, paired profiles, fine rules.
- `korean-heritage`: vertical accent rail, Korean serif emphasis, paper texture, dignified profile and schedule blocks.

Use template-specific data attributes and color tokens to distinguish both presets within one family. Keep particles at `z-index: 10`, pointer events disabled, and decoration below invitation content.

- [ ] **Step 6: Finish mobile behavior**

At widths below 900px, retain the existing top view tabs. At widths below 540px:

- make `.occasion-list` one horizontally scrollable row;
- make `.template-list` a two-card horizontal snap track with stable card width;
- stack editor fields and all ordered cards in one column;
- preserve 44px controls and safe-area padding for download/register actions;
- prevent long Korean text, template names, and 500-percent particles from causing horizontal overflow;
- keep the preview card at the viewport width without scaling fonts by viewport width.

- [ ] **Step 7: Verify assets, renderer parity, and syntax**

Run:

```bash
node scripts/build-template-art.js
node --test tests/template-art.test.js tests/template-renderers.test.js tests/invitation-core.test.js tests/app-contract.test.js
node --check assets/template-art.js
node --check assets/template-renderers.js
node --check assets/invitation-core.js
node --check assets/app.js
git diff --check
```

Expected: every command exits zero. Add an assertion that standalone HTML for `color-pop` contains its WebP data URL and does not contain the `blue-porcelain` payload.

- [ ] **Step 8: Commit the visual system**

```bash
git add assets/template-art assets/template-art.js scripts/build-template-art.js tests/template-art.test.js assets/template-renderers.js tests/template-renderers.test.js assets/invitation-core.js tests/invitation-core.test.js assets/style.css index.html
git commit -m "Give every occasion a distinct visual identity that survives download" \
  -m "Constraint: Standalone invitations must include only selected original art and remain readable when art fails.
Rejected: Remote stock artwork | It would create licensing, availability, and offline-output risks.
Confidence: high
Scope-risk: broad
Directive: Rebuild template-art.js deterministically whenever source WebP files change.
Tested: template art budget tests; renderer parity tests; JavaScript syntax checks; git diff --check.
Not-tested: Full cross-viewport browser QA is performed in Task 7."
```

---

### Task 7: Cross-Path Regression, Visual QA, And Documentation

**Files:**
- Modify: `tests/template-catalog.test.js`
- Modify: `tests/template-renderers.test.js`
- Modify: `tests/invitation-core.test.js`
- Modify: `tests/app-contract.test.js`
- Modify: `README.md:1-45`
- Verify without committing: `output/playwright/invitation-template-qa/`

**Interfaces:**
- Consumes: the complete catalog, editor, renderer, and art system from Tasks 1-6.
- Produces: regression evidence for all nine occasions, five families, five item types, three viewports, and every delivery path.

- [ ] **Step 1: Add final invariant and delivery-path tests**

Add table-driven tests that iterate all 18 presets from `invitation-data.json`. For every preset, normalize its defaults with identity fields and assert:

```js
assert.equal(invitation.templateId, preset.id);
assert.equal(invitation.layoutFamily, preset.familyId);
assert.ok(invitation.title.trim());
assert.ok(invitation.message.trim());
assert.ok(invitation.items.length > 0);
assert.match(InvitationCore.renderInvitationBody(invitation), new RegExp(`data-template="${preset.id}"`));
assert.match(InvitationCore.buildStandaloneHtml(invitation), /<script id="invitation-data" type="application\/json">/);
```

For one preset per family, run the existing upload parse and viewer rebuild harness and assert the item type order is unchanged.

- [ ] **Step 2: Run the complete automated suite**

Run:

```bash
node --test tests/*.test.js
node --check assets/template-catalog.js
node --check assets/template-art.js
node --check assets/template-renderers.js
node --check assets/preset-application.js
node --check assets/invitation-core.js
node --check assets/app.js
git diff --check
```

Expected: zero failures and zero syntax or whitespace errors.

- [ ] **Step 3: Start the static server and run desktop/mobile browser QA**

Run `python3 -m http.server 4173` from the repository root, choosing another free port only if 4173 is occupied by an unrelated process. Use the Playwright skill to test widths `390x844`, `768x1024`, and `1440x1000`.

At each width verify:

- category chips select and expose exactly two presets;
- preset card selection alone does not change the invitation;
- cancelled apply preserves the draft;
- confirmed apply changes copy, items, fonts, effects, and family;
- undo restores the prior draft once;
- all five item commands add cards and keep drag/move/delete behavior;
- mobile tabs preserve their scroll positions;
- download and registration buttons remain reachable with no overlap;
- no document-level horizontal overflow occurs.

Capture one screenshot per family at 390px and 1440px in `output/playwright/invitation-template-qa/`. Verify long Korean content, no photo, eight photos, map failure, reduced motion, and particle amount 500 percent. Record zero console errors as the pass condition.

- [ ] **Step 4: Verify standalone, registration, reload, and viewer parity**

For one preset per family:

1. Download the standalone HTML.
2. Open it over HTTP and verify family, item order, fonts, effects, map fallback, and selected art.
3. Register that HTML through the existing upload control.
4. Reload the maker and open the saved invitation in `viewer.html`.
5. Compare title, item order, family ID, and template ID across preview, standalone, and viewer.

Stop only when all five families pass and no console errors remain.

- [ ] **Step 5: Update README and perform final review**

Document the occasion-first flow, 18 presets, five item types, explicit apply/undo behavior, static HTML delivery, original embedded art, and the existing NAVER Maps domain requirement. Do not document internal brainstorming artifacts.

Review the complete diff against the spec. Confirm no Client Secret, third-party copied artwork, remote runtime image dependency, new production package, or unrelated refactor is present.

- [ ] **Step 6: Commit verified delivery**

```bash
git add README.md tests/template-catalog.test.js tests/template-renderers.test.js tests/invitation-core.test.js tests/app-contract.test.js
git commit -m "Lock multi-occasion invitations to one verified delivery contract" \
  -m "Constraint: Every preset must survive preview, standalone download, registration, reload, and viewer rendering on mobile and desktop.
Rejected: Visual-only signoff | It would miss data loss, unsafe links, and output divergence.
Confidence: high
Scope-risk: moderate
Directive: Keep the 18-preset catalog invariants and five-family browser matrix in future reviews.
Tested: full Node suite; JavaScript syntax checks; 390x844, 768x1024, and 1440x1000 Playwright QA; five-family delivery-path round trip.
Not-tested: Live NAVER geocoding success when the external account still returns HTTP 403."
```

## Completion Gate

Before reporting completion, verify all of the following:

- [ ] Nine occasion categories each expose exactly two valid presets.
- [ ] Existing template IDs and existing invitation payloads still load.
- [ ] Applying a preset is explicit, atomic, and undoable once.
- [ ] Course, photo, notice, profile, and link cards all round-trip in order.
- [ ] Every layout family is visibly distinct in preview and standalone HTML.
- [ ] Standalone output embeds only the selected built-in art payload.
- [ ] Desktop, tablet, and mobile layouts have no overlap or horizontal overflow.
- [ ] Existing map, intro, particle, font, storage, import, and viewer tests pass.
- [ ] Browser console remains free of known errors on verified paths.
- [ ] README matches delivered behavior.
