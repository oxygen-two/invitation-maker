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

The local browser pass covers the supplied desktop/mobile visual defects and console health. The controller remains responsible for the requested final full browser matrix across all eight effects, standalone completion paths, reduced motion, and map interactions.
