# Task 1 Report: Intro Preset Contract And Rendering Module

## Implementation Summary

- Created `assets/intro-effects.js` as a UMD-style `InvitationIntro` module.
- Added frozen preset metadata for the eight active intro effects with exact labels and durations from the design spec:
  - `envelope` 3.2
  - `card-shrink` 3.0
  - `dawn` 2.6
  - `fireworks` 3.4
  - `curtain` 3.0
  - `petals` 3.2
  - `spotlight` 2.8
  - `photo-focus` 3.6
- Implemented `normalizeEffect`, `renderMarkup`, `getStyles`, `ensureStyles`, `getStandaloneRuntime`, `play`, and `stop`.
- `renderMarkup` emits one `.invitation-intro` overlay with `data-intro-effect`, `data-intro-overlay`, an accessible `건너뛰기` button, preset-specific decorative markup, escaped invitation text, escaped safe photo attributes, and a no-photo fallback for `photo-focus`.
- `ensureStyles(document)` inserts one `style[data-intro-styles]` element and returns the existing one on subsequent calls.
- `play()` stops existing playback on the same host, mounts an overlay, adds `is-intro-active`, supports click/tap/Escape/timer completion, handles reduced motion by skipping before mount, and uses a guarded `finish()` cleanup.
- `getStandaloneRuntime()` returns inline script markup with a self-starting runtime that can operate on embedded intro markup without an external JavaScript file.

## RED Evidence

Command:

```sh
node --test tests/intro-effects.test.js
```

Expected failure observed before creating `assets/intro-effects.js`:

```text
Error: Cannot find module '../assets/intro-effects.js'
Require stack:
- /Users/jaeseoh/Documents/workspace/happy-rin/tests/intro-effects.test.js
code: 'MODULE_NOT_FOUND'
fail 1
```

## GREEN Evidence

Focused command:

```sh
node --test tests/intro-effects.test.js
```

Result:

```text
tests 7
pass 7
fail 0
duration_ms 67.337083
```

Regression command:

```sh
node --test tests/*.test.js
```

Result:

```text
tests 123
pass 123
fail 0
duration_ms 124.626208
```

## Exact Tests And Results

- `intro presets normalize to eight active effects plus none` - PASS
- `photo focus reuses the first safe photo and falls back without one` - PASS
- `rendered intro escapes reused invitation text and photo attributes` - PASS
- `ensureStyles inserts one preview style element` - PASS
- `standalone runtime contains the self-starting playback boundary` - PASS
- `play completes once and restores the host after repeated finish signals` - PASS
- `reduced motion skips before an active overlay remains mounted` - PASS
- Full existing suite: 123 tests PASS

## Changed Files

- `assets/intro-effects.js`
- `tests/intro-effects.test.js`
- `.superpowers/sdd/2026-09-05-invitation-intro-effects/task-1-report.md`

## Self-Review

- Scope stayed within the task module/test surface plus the required report file.
- The public module API matches the task brief.
- Preset order is insertion-stable through `Object.keys(InvitationIntro.PRESETS)`.
- Rendering escapes title, subtitle, date, host, safe photo `src`, and photo `alt`.
- Unsafe photos are not reused by `photo-focus`; missing photos render fallback markup and no image.
- Playback cleanup is guarded against repeated finish calls and clears the timer once.
- Reduced motion returns before mounting an active overlay.
- Standalone runtime was reviewed after the first green run and tightened to avoid relying on an external `InvitationIntro` script.

## Concerns

- Browser visual choreography and integration with `InvitationCore`/editor preview are intentionally deferred to later tasks in the plan.
- `card-shrink` measurement behavior is not implemented in this foundation task; the current CSS falls back to a centered scale/fade transition.

## Review Fix Evidence

### Findings Addressed

- Removed visible hard-coded intro-only copy `Invitation`; rendered intro markup now reuses invitation content plus the required `건너뛰기` control.
- Hardened standalone runtime playback setup so a missing `[data-intro-overlay]` fails open and clears `is-intro-active`.
- Added focused lifecycle coverage for skip click, Escape, timer completion, `stop(host)`, replacement of an existing host controller, setup-error cleanup, and standalone missing-overlay cleanup.

### Review RED Evidence

Command:

```sh
node --test tests/intro-effects.test.js
```

Expected failures observed before applying the fix:

```text
tests 15
pass 13
fail 2
```

Failing tests:

```text
rendered intro contains no visible intro-only copy
standalone runtime setup errors fail open when no overlay is mounted
```

### Review GREEN Evidence

Focused command:

```sh
node --test tests/intro-effects.test.js
```

Result:

```text
tests 15
pass 15
fail 0
duration_ms 70.61
```

Regression command:

```sh
node --test tests/*.test.js
```

Result:

```text
tests 131
pass 131
fail 0
duration_ms 118.627917
```
