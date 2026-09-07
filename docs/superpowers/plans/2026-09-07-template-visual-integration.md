# Template Visual Integration Implementation Plan

> **For agentic workers:** Use scoped executor agents for independent implementation and a separate reviewer for verification. User approved execution in the current workspace.

**Goal:** Connect the approved 18-design collection to actual selection, editing, preview, saved invitations, and standalone HTML.

**Architecture:** Preserve the five family renderers for content ordering and add preset-specific hero compositions within `TemplateRenderers`. `InvitationCore` remains the single normalization/render/export boundary. Selection thumbnails consume the same renderer and preset defaults, without active links, maps, particles, or intro playback.

**Tech Stack:** Existing plain HTML/CSS/JavaScript and Node built-in tests; no new dependencies.

**Spec:** User-approved `.superpowers/brainstorm/64919-1788778398/content/occasion-gallery-v3.html`; compatibility requirements in `docs/superpowers/specs/2026-09-05-multi-occasion-template-system-design.md`.

## Global Constraints

- Keep all 18 stable IDs, nine occasions, five families, and current ordered content types.
- Keep editable title, subtitle, message, date, location, host, images and focal crop; decorative text must not invent personal names, ages or event dates.
- Each hero has a distinct preset composition: botanical garden, midnight ticket, modern typographic, color-pop poster, royal anniversary, memory-film album, black-tie gala, gallery-notice exhibition, sunny-classroom illustration, little-forest invitation, wedding letter, modern-vow full photo, blue-porcelain heritage, peony-tribute letter, red-silk heritage, golden-years framed photo, first-chapter book, little-star night sky.
- Preserve content ordering, map/link escaping, particles, intro overlays, undo, dirty-state confirmation, storage/import and standalone output.
- Use only existing local decorative assets. A selected export embeds its own asset only.
- No commits, pushes, server/account features or new production dependencies in this task.

### Task 1: Canonical preset compositions

**Files:** `assets/template-renderers.js`, `assets/invitation-core.js`, `tests/template-renderers.test.js`, `tests/invitation-core.test.js`.

**Interfaces:** `InvitationCore.renderInvitationBody(input)` and `buildStandaloneHtml(input)` remain stable. Core supplies `templateId`, escaped `dateLabel`, `location`, and `host` slots. Renderer selects trusted preset-specific composition from `slots.templateId`, falling back to the existing generic family for unknown values. `TemplateRenderers.getStyles()` is shared by app and export.

- [x] Add regression assertions for all 18 IDs, unique design identifiers, escaped editable fields, preservation of item order, unknown fallback, and identical body markup in export.
- [x] Run `node --test tests/template-renderers.test.js tests/invitation-core.test.js` and establish the missing behavior before implementation.
- [x] Implement preset hero registry and styles with growing height for long text; preserve custom image crop attributes and downstream family rendering.
- [x] Re-run targeted tests and inspect the diff.

### Task 2: Visual selection cards

**Files:** `assets/app.js`, `assets/style.css`, `index.html`, `tests/app-contract.test.js`.

**Interfaces:** Consume existing `InvitationCore.renderInvitationBody({...template.defaults, templateId: template.id, particleEffect: 'none', introEffect: 'none', mapEnabled: false})`. Render a decorative inert thumbnail of the canonical hero; preserve `data-template-id`, `aria-pressed`, pending/apply/undo behavior. Do not introduce a second template layout implementation.

- [x] Add a meaningful contract test that thumbnails use the canonical renderer and cannot start maps or overwrite the current draft when merely selected.
- [x] Implement responsive visual cards with names/descriptions and clear selected/applied states. Preview content must not introduce nested active buttons/links or accessibility noise.
- [x] Run `node --test tests/app-contract.test.js tests/preset-application.test.js`.
- [x] Review selection keyboard and touch behavior in the browser.

### Task 3: Catalog alignment and integrated verification

**Files:** `invitation-data.json`, `scripts/build-template-art.js`, generated `assets/template-art.js`, relevant art/catalog tests, browser verification artifacts under `output/playwright/`.

**Interfaces:** Existing catalog fields and `TemplateArt.getDataUrl(id)` remain stable; selection and rendering both consume the same presets.

- [x] Align preset names, descriptions, font defaults and local art mappings with the approved collection. Do not mutate existing user records or insert fixed personal information into renderer markup.
- [x] Regenerate the embedded art module using the existing builder if mappings change, and run `node --test tests/*.test.js`.
- [x] Check JavaScript syntax and `git diff --check`; this static repository has no package-defined lint/typecheck/build command.
- [x] Browser-check all 18 presets, 390/768/1440 widths, long Korean text, missing/custom images, live editing, undo, and download parity; round-trip at least one saved/imported record.
- [x] Obtain independent spec and code-quality review, address findings, save final visual verification evidence and report the actual product URL.

## Final Verification — 2026-09-07

- Full Node suite: 232/232 passed. Five changed/generated scripts passed `node --check`; `git diff --check` passed.
- Browser: all 18 presets at 390/768/1440px; no horizontal overflow, clipped hero copy/details or uncaught page errors. Thumbnail dimensions stable across 12 animation frames per width.
- Enter/Space and pointer selection retain focus and preserve the draft until Apply. Dirty cancellation, live title editing and undo passed.
- Actual HTML download preserves custom photo and focal crop. IndexedDB save, viewer rebuild, reload and HTML import passed. Custom photo/crop rendering verified for all 18 presets.
- Long Korean title, subtitle, date and location passed across all presets. Final contact sheet and custom-photo screenshots reviewed after color, overlay and wrapping repairs.
- Independent reviewer: APPROVE, zero unresolved findings. No JavaScript LSP was available; syntax checks, executable tests, static review and browser validation are the evidence. No configured package lint/typecheck/build pipeline exists.
- Evidence: `output/playwright/integration-report.json`, `output/playwright/contact-sheet.png`, `output/playwright/maker-{390,768,1440}.png`, `output/playwright/custom-*.png`, `.omx/state/template-integration/ralph-progress.json`.
- Intentional adaptation: royal's display name avoids fixing every anniversary at ten years; approved purple/gold composition remains. Text-only ticket/poster exports omit unused built-in image payloads; custom photos remain supported.
- Actual product: http://localhost:4173. No dependencies, commits, pushes or server/account functionality added.
