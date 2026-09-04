# Dynamic Map and Particle Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional NAVER Web Dynamic Map rendering and three particle sizes to the static invitation workflow.

**Architecture:** Extend the normalized invitation data and shared renderer, then connect the maker form to a small browser-only NAVER map loader. Generated HTML contains its own guarded map bootstrap and always preserves the external NAVER Map link.

**Tech Stack:** Vanilla HTML, CSS, JavaScript, Node test runner, NAVER Maps JavaScript API v3

**Spec:** `docs/superpowers/specs/2026-09-04-dynamic-map-particle-size-design.md`

## Global Constraints

- No Node.js server or new dependency.
- Never use or persist a Client Secret.
- Keep link fallback available whenever Dynamic Map cannot load.
- Dynamic Map requires valid coordinates and an HTTP(S) origin registered with NAVER Cloud.

---

### Task 1: Normalize New Invitation Settings

**Files:**
- Modify: `assets/invitation-core.js`
- Test: `tests/invitation-core.test.js`

**Interfaces:**
- Consumes: invitation-shaped plain objects
- Produces: `normalizeInvitation(input)` with `particleSize`, `mapEnabled`, `mapLatitude`, `mapLongitude`, and `mapZoom`

- [x] Write tests asserting invalid particle sizes become `medium`, invalid coordinates disable the map, and zoom is clamped to `6..21`.
- [x] Run `node --test tests/invitation-core.test.js` and confirm the new assertions fail because the fields are not normalized.
- [x] Implement the normalization rules in `assets/invitation-core.js`.
- [x] Run `node --test tests/invitation-core.test.js` and confirm all tests pass.

### Task 2: Render Conditional Map Output

**Files:**
- Modify: `assets/invitation-core.js`
- Modify: `assets/style.css`
- Test: `tests/invitation-core.test.js`

**Interfaces:**
- Consumes: normalized invitation plus public `naverMapClientId`
- Produces: map container, fallback link, and guarded standalone bootstrap

- [x] Write tests asserting enabled valid maps emit `ncpKeyId`, coordinates, and a map container while disabled maps emit no NAVER API loader.
- [x] Run `node --test tests/invitation-core.test.js` and confirm those assertions fail.
- [x] Add the map markup, standalone bootstrap, marker initialization, and fallback styles.
- [x] Run `node --test tests/invitation-core.test.js` and confirm all tests pass.

### Task 3: Connect Maker Controls

**Files:**
- Modify: `index.html`
- Modify: `assets/app.js`
- Modify: `assets/style.css`
- Modify: `invitation-data.json`

**Interfaces:**
- Consumes: form values and `site.naverMapClientId`
- Produces: immediate preview refresh and map mounting through `mountPreviewMaps()`

- [x] Add particle size, map visibility, latitude, longitude, and zoom controls with explicit labels.
- [x] Read and restore the new values through `getFormData()` and `fillForm()`.
- [x] Load NAVER Maps once, mount the preview marker, and expose a visible fallback on failure.
- [x] Run Node syntax checks and JSON parsing checks.

### Task 4: Verify and Ship

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: completed app
- Produces: browser evidence and usage documentation

- [x] Document Client ID and service URL registration without mentioning a Client Secret value.
- [x] Verify desktop and mobile selection, map fallback, standalone HTML, reduced motion, overflow, and console output with Playwright.
- [x] Run `node --test tests/invitation-core.test.js`, syntax checks, JSON parsing, and `git diff --check`.
- [x] Commit using the repository Lore trailers and push `main` to `origin`.

### Task 5: Replace Course Textarea With Map-Aware Cards

**Files:**
- Modify: `index.html`
- Modify: `assets/app.js`
- Modify: `assets/invitation-core.js`
- Modify: `assets/style.css`
- Modify: `invitation-data.json`
- Test: `tests/invitation-core.test.js`

- [x] Add failing tests for per-course map normalization and multiple standalone maps.
- [x] Render addable and removable course cards instead of pipe-delimited text.
- [x] Keep map settings and fallback links independent for each course.
- [x] Load the NAVER SDK once and mount every enabled map.
- [x] Verify card editing, multiple maps, download, and mobile layout in a browser.
