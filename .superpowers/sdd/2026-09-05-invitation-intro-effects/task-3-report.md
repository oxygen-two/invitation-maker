# Task 3 Report: Editor Controls And Non-Replaying Preview Lifecycle

## Summary

Implemented the editor intro-effect selector and replay command. The editor now serializes and restores `introEffect`, disables replay for the normalized `none` value, injects shared intro styles once at initialization, and starts preview playback only from an intro selection or explicit replay command.

Ordinary `renderPreview()` calls continue to update invitation markup and maps without invoking `InvitationIntro.play`. When markup is replaced during an active intro, the existing `[data-intro-overlay]` is detached and appended back to the preview host after replacement, preserving the active controller and visible overlay.

## RED Evidence

Command:

```sh
node --test tests/app-contract.test.js
```

Result after adding the Task 3 contract tests and their local `functionBody` utility: 50 passed, 2 failed, 0 skipped.

- `editor exposes grouped intro choices and replay control` failed because `index.html` lacked `name="introEffect"`.
- `ordinary preview rendering does not start intro playback` failed because `assets/app.js` lacked `const playPreviewIntro`.

The first run exposed the missing local test utility from the supplied snippet; adding that test-only utility produced the intended production-behavior failures above before implementation began.

## GREEN Evidence

Commands and results:

```sh
node --test tests/app-contract.test.js
# 52 passed, 0 failed, 0 skipped

node --check assets/app.js
# exit 0

git diff --check
# exit 0

node --test tests/*.test.js
# 140 passed, 0 failed, 0 skipped
```

## Changed Files

- `index.html`: Added the full-width intro-effect select, exact option groups, and the 40px icon-only replay button.
- `assets/app.js`: Added intro form persistence, replay availability state, explicit-only `playPreviewIntro()`, active-overlay preservation during preview replacement, and shared-style initialization.
- `assets/style.css`: Added compact intro-control layout and replay-button styling; made `.preview-frame` a containing block for overlays.
- `tests/app-contract.test.js`: Added the required editor/lifecycle contract tests and kept the existing isolated editor harness compatible with the explicit-play helper.
- `.superpowers/sdd/2026-09-05-invitation-intro-effects/task-3-report.md`: This report.

## Self-Review

- `renderPreview()` has no `InvitationIntro.play` call.
- `playPreviewIntro()` is the only editor path that starts preview playback.
- Changing `introEffect` renders first, then stops for normalized `none` or plays exactly once for an active effect.
- Initial editor load renders without autoplay.
- Existing map canvases remain preserved by the pre-existing map replacement logic, and active intro overlays are detached before card replacement then restored to the same preview host.
- The replay command has the required title and accessible label and remains disabled for `none`.

## Concerns

No known concerns. Browser-specific visual interaction was not separately automated; the HTML, lifecycle contract, syntax, whitespace, and full Node test suite are covered above.

## Review Fix Evidence

### Finding 1: Preview Scope

`playPreviewIntro()` now calls `InvitationIntro.play(dom.preview, invitation, { preview: true })`. This selects the preview-specific absolute overlay mode, keeping the animation bounded to `.preview-frame` rather than fixed across the maker viewport.

### Finding 2: Executable Lifecycle Coverage

Added a separate VM integration harness that executes the real editor `getFormData`, `renderPreview`, `updatePreviewMarkup`, form input listener, and replay listener. The harness fakes only the browser DOM boundary and `InvitationIntro`, allowing the tests to observe the real preview host, active overlay identity, and playback options.

RED command:

```sh
node --test tests/app-contract.test.js
```

RED result: 54 passed, 2 failed, 0 skipped. Both active-selection and replay tests observed `InvitationIntro.play` receiving `undefined` instead of preview mode, which reproduced the review finding before the production change.

GREEN commands:

```sh
node --test tests/app-contract.test.js
# 56 passed, 0 failed, 0 skipped

node --check assets/app.js
# exit 0

git diff --check
# exit 0

node --test tests/*.test.js
# 144 passed, 0 failed, 0 skipped
```

The new executable coverage verifies all requested branches: active selection plays once with preview mode, replay starts a fresh preview-scoped intro, selecting `none` calls `stop` and disables replay, and ordinary rendering preserves the same active overlay without an additional play call.
