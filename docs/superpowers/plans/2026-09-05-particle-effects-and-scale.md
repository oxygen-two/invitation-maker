# Particle Effects And Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the invitation maker to eight distinct CSS particle effects and let users scale particle amount up to 500 percent without degrading mobile behavior.

**Architecture:** Keep one deterministic particle renderer with effect IDs normalized through an allowlist. CSS effect profiles control shape and animation direction while common numeric size and amount scales control geometry and generated element count.

**Tech Stack:** Static HTML, CSS animations, browser JavaScript, Node.js built-in test runner, Playwright CLI.

**Spec:** `docs/superpowers/specs/2026-09-05-ordered-photo-content-design.md`

## Global Constraints

- Keep the app and downloaded invitation dependency-free for particle rendering.
- Support `petals`, `hearts`, `sparkle`, `fireflies`, `bubbles`, `snow`, `leaves`, and `confetti`, plus `none`.
- Keep size at `50..200` percent with step 5 and amount at `25..500` percent with step 25.
- Render 16 elements at 100 percent and 80 elements at 500 percent.
- Keep mobile visibility capped at 16 elements.
- Disable all particle layers under `prefers-reduced-motion: reduce`.
- Animate only transform and opacity; avoid layout-triggering animation properties.

## File Structure

- Modify `tests/invitation-core.test.js`: allowlist, clamping, element counts, and effect markup.
- Modify `tests/app-contract.test.js`: grouped editor options and slider maximum.
- Modify `assets/invitation-core.js`: effect allowlist, deterministic particle variables, expanded standalone CSS.
- Modify `index.html`: grouped effect selector and 500-percent slider.
- Modify `assets/style.css`: matching live-preview profiles and animation keyframes.
- Modify `invitation-data.json`: retain compatible defaults.
- Modify `README.md`: list effects and scale ranges.

---

### Task 1: Raise The Particle Amount Contract

**Files:**
- Modify: `tests/invitation-core.test.js`
- Modify: `tests/app-contract.test.js`
- Modify: `assets/invitation-core.js`
- Modify: `index.html`

**Interfaces:**
- Produces: normalized `particleAmount: number` in `25..500` and `renderParticles` output of `round(16 * amount / 100)` elements.

- [ ] **Step 1: Write failing maximum-scale tests**

```js
assert.equal(normalizeInvitation({ particleAmount: 900 }).particleAmount, 500);
const html = buildStandaloneHtml({ particleEffect: "petals", particleAmount: 500 });
assert.equal((html.match(/<span style="--x:/g) || []).length, 80);
```

Update the editor contract to require `max="500"` on `particleAmount`.

- [ ] **Step 2: Verify RED**

Run: `node --test --test-name-pattern="particle" tests/invitation-core.test.js tests/app-contract.test.js`

Expected: FAIL because normalization and the slider still cap at 200.

- [ ] **Step 3: Raise both boundaries**

Change the core clamp maximum and range-input maximum to 500. Keep the 25 step, 100 default, deterministic position generation, and current 16-particle mobile CSS cap.

- [ ] **Step 4: Verify GREEN**

Run: `node --test --test-name-pattern="particle" tests/invitation-core.test.js tests/app-contract.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```bash
git add assets/invitation-core.js index.html tests/invitation-core.test.js tests/app-contract.test.js
git commit -m "Let invitations reach celebration-scale particle density" \
  -m "Constraint: Desktop may render 80 particles while mobile remains capped at 16 visible elements.
Confidence: high
Scope-risk: narrow
Directive: Keep amount normalization and input bounds synchronized.
Tested: particle-focused Node tests"
```

### Task 2: Add Five Distinct Effect Profiles

**Files:**
- Modify: `tests/invitation-core.test.js`
- Modify: `tests/app-contract.test.js`
- Modify: `assets/invitation-core.js`
- Modify: `index.html`
- Modify: `assets/style.css`

**Interfaces:**
- Consumes: `particleEffect`, `particleScale`, and `particleAmount`.
- Produces: normalized effect IDs and matching preview/standalone CSS profiles.

- [ ] **Step 1: Write failing allowlist and option-group tests**

Loop over all eight active IDs and assert normalization preserves each. Assert unknown values normalize to `none`. In `app-contract.test.js`, assert the selector contains four optgroups and one option for every ID.

- [ ] **Step 2: Write failing output-profile tests**

Build standalone HTML for each effect and assert `data-effect` plus its profile marker. Assert the CSS contains `particle-fall`, `particle-rise`, and `particle-pulse` keyframes and contains no animation of `top`, `left`, `width`, or `height`.

- [ ] **Step 3: Verify RED**

Run: `node --test --test-name-pattern="particle effect|particle selector|profile" tests/*.test.js`

Expected: FAIL for `hearts`, `fireflies`, `bubbles`, `snow`, and `leaves`.

- [ ] **Step 4: Expand the effect allowlist and selector**

Use optgroups and IDs exactly as specified:

```html
<optgroup label="로맨틱"><option value="petals">꽃잎</option><option value="hearts">하트</option></optgroup>
<optgroup label="분위기"><option value="sparkle">빛가루</option><option value="fireflies">반딧불</option><option value="bubbles">버블</option></optgroup>
<optgroup label="계절"><option value="snow">눈</option><option value="leaves">나뭇잎</option></optgroup>
<optgroup label="축하"><option value="confetti">컨페티</option></optgroup>
```

Keep `효과 없음` outside the groups as the first option.

- [ ] **Step 5: Add deterministic per-particle variables**

Keep current `--x`, `--size`, `--drift`, `--duration`, `--delay`, `--turn`, and `--tone`; add `--sway` and `--pulse-delay` derived from the item index. Do not use runtime randomness so preview and downloaded output remain reproducible.

- [ ] **Step 6: Implement matching preview and standalone profiles**

- `hearts`: text heart shape, downward sway, rose tones.
- `fireflies`: circular glow, upward drift, alternating pulse.
- `bubbles`: transparent bordered circles, upward movement, subtle scale.
- `snow`: white circles with varied opacity, slower downward drift.
- `leaves`: tapered oval, green/gold tones, stronger rotation.
- Existing effects retain their current visual identity.

Use `particle-fall`, `particle-rise`, `particle-spin`, and `particle-pulse` animations composed only from transform and opacity.

- [ ] **Step 7: Verify GREEN and syntax**

Run: `node --test tests/*.test.js && node --check assets/invitation-core.js && node --check assets/app.js`

Expected: all tests pass and scripts parse.

- [ ] **Step 8: Commit the task**

```bash
git add assets/invitation-core.js assets/style.css index.html tests/invitation-core.test.js tests/app-contract.test.js
git commit -m "Offer particle moods that match different invitations" \
  -m "Constraint: Every effect must survive standalone export without Canvas or a runtime library.
Rejected: Bitmap particle assets | They increase payload and complicate scaling.
Confidence: high
Scope-risk: moderate
Directive: Keep preview CSS and standaloneCss behaviorally identical.
Tested: node --test tests/*.test.js; JavaScript syntax checks"
```

### Task 3: Visual And Performance Acceptance

**Files:**
- Modify only when browser evidence identifies a focused defect.
- Capture: `output/playwright/particle-effects/`

**Interfaces:**
- Consumes: completed particle selector and renderer.
- Produces: screenshots and measured DOM/computed-style evidence.

- [ ] **Step 1: Verify every effect at representative scales**

At 1440x900, select each of the eight effects at size 100 and amount 100. Confirm the selected ID, generated element count 16, visible animation, and zero horizontal overflow.

- [ ] **Step 2: Verify scale extremes**

For petals, hearts, and bubbles, check size 50/200 and amount 25/500. Assert element counts 4/80 and computed `--particle-scale` values `0.5/2`.

- [ ] **Step 3: Verify mobile cap and reduced motion**

At 390x844 and amount 500, assert 80 total elements but 16 visible elements. Emulate reduced motion and assert `.particle-layer` computes to `display: none`.

- [ ] **Step 4: Capture representative screenshots**

Capture one romantic, one upward ambient, one seasonal, and confetti effect on desktop plus a 500-percent mobile preview. Inspect for obscured text, visually excessive opacity, clipping, and layout shifts.

- [ ] **Step 5: Verify exported and registered parity**

Register and open an invitation using `fireflies`, size 175, and amount 500. Assert viewer data attributes, CSS scale, total count, font selections, and zero console errors match the maker preview.

- [ ] **Step 6: Run final checks and review**

Run:

```bash
node --test tests/*.test.js
node --check assets/app.js
node --check assets/invitation-core.js
node --check assets/viewer.js
node -e "JSON.parse(require('fs').readFileSync('invitation-data.json','utf8'))"
git diff --check
```

Review for mismatched preview/export CSS, unbounded particle generation, layout-triggering keyframes, and unsafe unnormalized effect IDs.

- [ ] **Step 7: Commit only reproduced acceptance fixes**

Use a Lore-formatted commit with the exact failing browser scenario and verification. Do not create an empty acceptance commit.
