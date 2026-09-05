# Invitation Intro Effects Design

## Goal

Add an optional full-screen intro to invitations created by the static invitation maker. Users choose from eight polished presets or disable the intro. The same selection must work in the live preview, downloaded standalone HTML, saved invitation library, imported HTML, and viewer.

The intro reuses the invitation title, subtitle, date, host name, template colors, fonts, and first uploaded photo. Version 1 does not add intro-only copy, audio, video, Canvas, or external animation dependencies.

## Constraints

- Keep the application as static HTML, CSS, and JavaScript. Do not add Node.js or a server runtime.
- Downloaded invitations remain self-contained except for the existing font and NAVER Map network boundaries.
- Intro playback must never block invitation links, maps, scrolling, or input after it completes.
- Editing ordinary invitation fields must not restart the preview intro.
- Respect `prefers-reduced-motion: reduce` by skipping the intro immediately.
- Reuse the selected invitation template's palette and typography instead of introducing separate intro styling controls.
- Reuse the first valid uploaded photo for photo-based effects and provide a complete no-photo fallback.

## Preset Catalog

The editor exposes `사용 안 함` followed by eight active presets:

| Group | Effect ID | Editor label | Duration | Presentation |
| --- | --- | --- | --- | --- |
| Classic | `envelope` | 봉투 열기 | 3.2s | A stationery-style envelope opens and the invitation title rises from it. |
| Classic | `card-shrink` | 전체 화면 카드 | 3.0s | A full-viewport title card scales and settles into the invitation. |
| Cinematic | `dawn` | 어둠에서 밝아지기 | 2.6s | Darkness lifts into the template background while the title sharpens. |
| Celebration | `fireworks` | 골드 폭죽 | 3.4s | Restrained gold and rose sparks reveal the title against a dark field. |
| Cinematic | `curtain` | 커튼 열기 | 3.0s | Two template-colored panels part to uncover the invitation. |
| Romantic | `petals` | 꽃잎 사이로 | 3.2s | A small set of petals moves outward while the title and card appear. |
| Cinematic | `spotlight` | 스포트라이트 | 2.8s | A central light expands over the title and date. |
| Photo | `photo-focus` | 사진 초점 전환 | 3.6s | The first uploaded photo moves from soft focus to clear before revealing the card. |

`photo-focus` falls back to the selected template background, title, and subtitle when no valid photo exists. It never renders an empty or broken image state.

## Editor UX

Add a full-width `인트로 효과` control near the template and visual-effect controls. It uses a grouped `<select>` because the value is a single preset choice and the existing editor already uses compact select controls. `사용 안 함` is the default.

An icon-only replay command sits beside the select with the tooltip and accessible label `인트로 다시 보기`. It is disabled while `사용 안 함` is selected.

- Selecting a new active effect plays it once in the preview.
- Pressing replay restarts the selected effect from the beginning.
- Changing title, subtitle, date, host, template, photos, courses, particles, or fonts updates the invitation behind the intro without restarting it.
- The preview intro covers only the preview frame, not the maker interface or browser viewport.
- The downloaded invitation intro covers the complete browser viewport.
- A visible `건너뛰기` command, clicking or tapping the intro, and pressing Escape all complete the intro immediately.
- There is no duration slider. Each preset owns a tuned 2.6 to 3.6 second duration.

## Canonical Data Model

Add one field to the normalized invitation object:

```json
{
  "introEffect": "envelope"
}
```

Allowed values are `none`, `envelope`, `card-shrink`, `dawn`, `fireworks`, `curtain`, `petals`, `spotlight`, and `photo-focus`. Unknown or missing values normalize to `none`.

No separate `introEnabled` boolean is stored; `none` is the disabled state. Timing, particle count, and choreography remain preset metadata rather than user data. This keeps saved and downloaded invitation payloads stable if animation tuning changes later.

## Architecture

Create `assets/intro-effects.js` as the shared intro boundary. It owns:

- the preset allowlist and metadata;
- intro markup generation from a normalized invitation;
- preview playback, skip, completion, and cleanup;
- standalone intro CSS and the small self-starting runtime embedded in downloaded HTML.

`assets/invitation-core.js` remains responsible for canonical invitation normalization, invitation-card rendering, and standalone document assembly. It calls the intro module to include intro markup and runtime only when `introEffect` is active.

`assets/app.js` owns editor interaction state. It separates ordinary preview rendering from intro playback so the existing broad `input` listener cannot restart the intro on every keystroke. A preset change or explicit replay command passes a fresh preview frame and normalized invitation to the intro controller.

`assets/viewer.js` requires no intro-specific behavior. It continues to parse canonical invitation JSON and rebuild standalone HTML through `InvitationCore`, preserving the intro selection automatically.

## Rendering And Lifecycle

The intro controller uses a single lifecycle:

1. Build a preset-specific overlay above the invitation card.
2. Mark the host as intro-active and temporarily prevent scrolling in standalone output.
3. Start CSS animations and one completion timer.
4. Complete on timer, click, touch, skip command, Escape, or reduced-motion preference.
5. Make completion idempotent, remove listeners and timers, remove the overlay, restore scrolling, and start the existing background particle effect.

The standalone overlay uses `position: fixed; inset: 0`. The preview overlay uses `position: absolute; inset: 0` inside the preview frame. Both use the same markup classes and preset variables.

Animation is limited to transform, opacity, filter, and clipping where supported. Fireworks and petals use a bounded number of decorative DOM elements; there is no Canvas loop. The downloaded artifact contains no external images for intro decoration.

For `card-shrink`, the standalone runtime measures the rendered invitation card and writes target translation and scale variables before starting. The preview uses the preview card bounds. If measurement fails, it falls back to a centered fade-and-scale transition.

## Visual Rules

- Intro typography uses the invitation's selected Korean and English font variables.
- Intro foreground, accent, and background colors derive from the selected template.
- Title is the primary line; subtitle, date, and host appear only where the preset benefits from them.
- The skip command stays legible across every preset and respects mobile safe-area insets.
- Decorative effects remain restrained enough that the title is readable at all times.
- No nested cards, gradient-orb decoration, video, or stock imagery is introduced.

## Accessibility And Failure Handling

- `prefers-reduced-motion: reduce` completes the intro before animation begins.
- Decorative intro elements use `aria-hidden="true"`; the skip command remains keyboard accessible.
- Escape completes playback without trapping focus.
- The overlay is removed after completion rather than left transparent above interactive content.
- Repeated completion signals are harmless and restore scroll state exactly once.
- Invalid preset values fall back to `none`.
- A missing or rejected photo uses the no-photo `photo-focus` fallback.
- Runtime exceptions during setup fail open by removing the intro and showing the invitation.

## Testing

Automated tests will cover:

- `introEffect` defaults, allowlisting, and invalid-value fallback.
- Canonical JSON round trips through download, registration, import, and viewer rebuilding.
- Intro markup, CSS, and runtime inclusion for all eight active presets.
- Complete omission of the intro runtime when the value is `none`.
- Photo-focus output with and without a valid uploaded photo.
- Idempotent completion, timer cleanup, scroll restoration, click and Escape skipping, and reduced-motion behavior.
- Preview lifecycle behavior proving unrelated form input does not replay an intro.
- Editor control grouping, replay command state, and accessible labels.

Browser verification will cover:

- Every preset on desktop and representative mobile sizes.
- Full preview-frame coverage and full standalone-viewport coverage.
- Automatic completion and immediate click, touch, keyboard, and skip-command completion.
- No blocked maps, links, scrolling, or invitation controls after completion.
- Template font and palette inheritance, photo fallback, overflow, and console errors.
- Background invitation particles starting only after the intro completes.

## Stop Condition

The feature is complete when users can select, preview, replay, disable, download, register, import, and view every intro preset; normal editing never causes unwanted replay; standalone intros cover the viewport and always release interaction; reduced-motion users bypass animation; and automated plus desktop/mobile browser checks pass without known console errors.
