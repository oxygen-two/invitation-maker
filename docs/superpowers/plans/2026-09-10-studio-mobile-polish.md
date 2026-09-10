# Invitation Studio mobile polish implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make template selection actionable without scrolling, shorten mobile editing chrome, and distinguish three birthday designs beyond their covers.

**Architecture:** Keep the existing static editor and shared export renderer. A mobile gallery dock delegates to the existing template-application function; no duplicate invitation state or export pipeline.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node test runner, existing Playwright installation.

**Spec:** `DESIGN.md` and the accepted four priorities in this conversation.

## Global Constraints

- Preserve personal content, uploaded photos, IndexedDB drafts and standalone HTML exports.
- No new dependencies, account features, deployment, or edits to personal birthday pages.
- Preserve the existing `.gitignore` and `.superpowers` changes.
- Validate 320, 390, 768 and 1440 pixel widths; emulation does not prove native mobile behavior.

## Task 1: Mobile selection and compact editor

Files: `index.html`, `assets/app.js`, `assets/studio.css`, `scripts/verify-studio.cjs`.

- [ ] Add regression assertions for a visible mobile gallery dock, selection name, sample return, and first input above 420px.
- [ ] Run the browser regression and establish failure before implementation.
- [ ] Add `#gallery-dock`, `#gallery-selection`, `#gallery-back`, `#gallery-create` at body level. Synchronize selected name and disabled state in `syncTemplateAvailability()`. Delegate create to `applyPendingTemplate()` and return to `setMobileView('editor')`.
- [ ] Use fixed bottom positioning with safe-area padding only in mobile gallery. Keep a two-column gallery and shorten editing header; neutralize maker-only labels and details summaries without changing invitation theme variables.

```js
assert.ok(await page.locator('#gallery-dock').isVisible());
assert.ok(await page.locator('[name="title"]').evaluate(el => el.getBoundingClientRect().top < 420));
```

## Task 2: Distinct birthday bodies

File: `assets/template-renderers.js`.

- [ ] Add scoped `data-design` styles: bloom uses spacious ruled sections, cherry uses bold numbered rows, peach uses an inset stationery timeline.
- [ ] Apply Korean title detection to all three designs and safe wrapping without changing stored text.
- [ ] Verify no-photo and ten-course long-title exports at 320px; styles must travel with standalone HTML.

## Task 3: Verification and handoff

- [ ] Run `node --test tests/*.test.js`.
- [ ] Run `PLAYWRIGHT_MODULE=/Users/jaeseoh/.agents/skills/gstack/node_modules/playwright node scripts/verify-studio.cjs`.
- [ ] Inspect fresh screenshots at 390 and 1440 pixels, correct observed regressions, update `DESIGN.md`.
- [ ] Report tested behavior and native-device limits. Do not commit or push without a current request.

Self-review: all four accepted priorities map to Tasks 1–2; state and export interfaces remain unchanged. Desktop gallery restructuring and broader schedule-editor redesign are separate follow-up scope.

## Execution result

Tasks 1–3 completed on 2026-09-10. The initial gallery regression failed because the dock did not exist; after implementation all four viewport flows passed. Node tests: 242/242. Standalone stress cases: all three passed with populated course text. Fresh mobile, desktop and full-page export screenshots were inspected. `git diff --check` passed. No deployment, commit or push performed; native-device validation remains outstanding.
