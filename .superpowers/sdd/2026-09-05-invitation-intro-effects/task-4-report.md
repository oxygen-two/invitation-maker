# Task 4 Report: Visual Polish And Browser Verification

## Result

Polished the preview and standalone intro boundary without adding dependencies or changing the static HTML/CSS/JavaScript architecture.

- Mobile previews now keep a `calc(100dvh - 158px)` frame with internal scrolling, keeping the active intro inside the visible preview at 390x844.
- Active intros pause particle-layer, particle-span, and particle pseudo-element animations until completion.
- The envelope preset now uses distinct card, pocket, flap, and seal elements.
- The fireworks preset now renders staggered gold and rose multi-origin bursts on a dark field with light, readable copy.
- Card-shrink measures the actual invitation-card bounds in both preview and standalone runtimes and writes translation, scale, and origin CSS variables. A centered CSS fade-and-scale remains the fallback when measurement is unavailable.

## RED Evidence

Commands run before production changes:

```sh
node --test tests/intro-effects.test.js
# 15 passed, 3 failed

node --test tests/app-contract.test.js
# 56 passed, 1 failed
```

The intended failures were:

- particle pause only targeted `.particle-layer`, not animated spans and pseudo-elements;
- preview card-shrink did not write measured target variables;
- standalone card-shrink did not write measured target variables;
- mobile CSS reset the preview frame to unlimited height and visible overflow.

## GREEN Evidence

Focused checks after the implementation:

```sh
node --test tests/intro-effects.test.js
# 18 passed, 0 failed

node --test tests/app-contract.test.js
# 57 passed, 0 failed
```

Final checks:

```sh
node --check assets/intro-effects.js
# exit 0

node --test tests/*.test.js
# 148 passed, 0 failed

git diff --check
# exit 0
```

## Browser Evidence

The existing static server on `http://localhost:4173` returned HTTP 200. Browser-console inspection found zero errors and zero warnings.

Visual before/after inspection used the supplied baseline captures and these final captures:

- `output/playwright/task-4-envelope-active-desktop.png`
- `output/playwright/task-4-fireworks-dense-desktop.png`
- `output/playwright/task-4-envelope-wrapped-mobile.png`

At 390x844, the preview frame remains bounded and scrollable while the skip control, title, and envelope stay inside the frame. The mobile title-width adjustment was verified in the final wrapped-mobile capture.

## Changed Files

- `assets/intro-effects.js`
- `assets/style.css`
- `tests/intro-effects.test.js`
- `tests/app-contract.test.js`
- `.superpowers/sdd/2026-09-05-invitation-intro-effects/task-4-report.md`

## Concerns

None after the controller browser matrix below.

## Controller Browser Matrix

The controller completed the remaining browser acceptance checks with the Playwright CLI against `http://localhost:4173`.

- Desktop preview at 1440x1000: all eight presets stayed inside `#preview`, kept `.intro-copy` visible, completed automatically, removed the overlay, and cleared `is-intro-active`.
- Mobile preview at 390x844: all eight presets stayed inside the bounded preview frame, kept intro copy inside the viewport, completed automatically, removed the overlay, and cleared `is-intro-active`.
- Standalone output at 1440x1000 and 390x844: all eight presets covered the full viewport, locked body scrolling while active, removed the overlay through the skip command, cleared active state, restored scrolling, and retained five invitation links.
- Standalone automatic completion: all eight presets completed within their configured durations and restored scrolling.
- Reduced motion: all eight presets skipped immediately with no overlay, active state, or scroll lock.
- Input paths: overlay click, Escape, skip-button click, and touch `tap()` each removed the overlay and restored interaction.
- Live editing: changing the title during a preview intro preserved the same overlay, updated the card behind it, kept invitation particles paused, and resumed particles after completion.
- Photo focus: uploading a PNG produced one compressed WebP photo item and a visible `data:image/webp;base64` intro image.
- Saved viewer: the registered invitation opened at `viewer.html?id=...`; its mobile intro covered the full viewport, locked and restored scrolling, then the representative NAVER map reached `data-map-state="ready"` and its fallback link remained visible.
- Console: zero warnings and zero errors after the complete matrix.

Representative final captures are stored under `output/playwright/final-preview-*-desktop.png`, `output/playwright/final-preview-*-mobile.png`, and `output/playwright/final-standalone-*-{1440,390}.png`.

## Follow-up Defect: Malformed Standalone Payload Fails Open

The standalone runtime previously caught malformed `#invitation-data` JSON and called `InvitationIntro.stop(document.body)`. Because parsing fails before a controller is created, that call could not remove the server-rendered overlay. The fixed overlay could therefore continue intercepting input.

### RED Evidence

Before the runtime fix:

```sh
node --test tests/intro-effects.test.js
# 18 passed, 1 failed
```

The new `standalone malformed payload removes the server-rendered overlay` regression failed with `false !== true`: the pre-existing `[data-intro-overlay]` was not removed.

### GREEN Evidence

The standalone catch path now stops any controller, removes every available `[data-intro-overlay]`, and clears `is-intro-active` from `document.body`.

```sh
node --test tests/intro-effects.test.js
# 19 passed, 0 failed

node --check assets/intro-effects.js
# exit 0

node --test tests/*.test.js
# 149 passed, 0 failed

git diff --check
# exit 0
```

The controller will run and document the full eight-effect browser matrix separately; that external matrix is not a blocker for this malformed-payload fallback fix.

## Follow-up Defect: Standalone Intro Scroll Lock

Standalone playback uses `document.body` as its intro host, so it adds `is-intro-active` to the page body. The shared stylesheet did not previously consume that state to suppress document scrolling while the fixed overlay was active.

### RED Evidence

Before the stylesheet fix:

```sh
node --test tests/intro-effects.test.js
# 19 passed, 1 failed
```

The new `standalone active body locks scrolling without overriding preview frames` style contract failed because `body.is-intro-active{overflow:hidden}` was absent from the generated shared styles.

### GREEN Evidence

The generated styles now include the body-only overflow rule. The contract also rejects a `.preview-frame.is-intro-active` overflow override, preserving the preview frame's existing scoped scrolling behavior. Completion and fail-open paths already remove `is-intro-active`, restoring standalone scrolling automatically.

```sh
node --test tests/intro-effects.test.js
# 20 passed, 0 failed

node --check assets/intro-effects.js
# exit 0

node --test tests/*.test.js
# 150 passed, 0 failed

git diff --check
# exit 0
```

## Final Review Corrections

The whole-feature review found that preview intros inherited the editor's template background tokens but not its selected font variables or template-specific text colors. It also identified missing automated coverage for an active intro completing the download, import, storage, and viewer rebuild path.

### RED Evidence

New regression coverage initially reported seven failures across the focused suites. The failures covered host font variables, editor/standalone palette aliases, preset-specific copy, canonical labels, the active-intro round trip, and removal of a dead finishing animation. A final palette contract separately failed because editor template rules did not define `--ink` and `--ink-soft`.

### GREEN Evidence

- The preview host and standalone body now share the same allowlisted `--font-en` and `--font-ko` declaration.
- Intro CSS resolves both standalone tokens and the editor's existing template-token names.
- Editor templates define text colors matching standalone output.
- Each preset renders only its tuned invitation fields, while all reused values remain escaped.
- Downloaded active-intro HTML survives import, IndexedDB-style storage, and viewer reconstruction with its effect, template, fonts, overlay, and runtime intact.
- Editor option labels match the canonical preset catalog, and the ineffective immediate-removal fade class was deleted.

Browser verification at 390x844 with `Botanical`, `Great Vibes`, and `Gmarket Sans` resolved `--ink` to `#102018`, `--ink-soft` to `#52695b`, the title font to `Great Vibes`, and the standalone overlay to the full 390x844 viewport. Completing the viewer intro restored body overflow from `hidden` to `visible`.
