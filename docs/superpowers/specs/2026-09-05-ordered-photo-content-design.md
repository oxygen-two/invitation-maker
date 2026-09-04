# Ordered Photo Content Design

## Goal

Extend the static invitation maker so users can add photos as independent invitation items and reorder photos and date-course cards in one shared sequence. Preserve live preview, standalone HTML download, uploaded-HTML registration, and the same-origin viewer.

Also extend the approved particle amount scale from `25..200` percent to `25..500` percent and expand the available CSS particle effects.

## Constraints

- Keep the application as static HTML, CSS, and JavaScript. Do not add a Node.js server or runtime dependency.
- Downloaded invitations must contain their images and work without access to the maker or IndexedDB.
- Do not accept SVG or arbitrary image URLs as uploaded image data.
- Keep existing `stops[]` invitations readable through a one-way normalization migration.
- Preserve the current NAVER Map Client ID boundary and never store or emit a Client Secret.
- Reordering must work with a visible drag handle and have keyboard-accessible move controls.
- Limit image count and encoded size so generated HTML remains practical to download and share.

## Canonical Data Model

`items[]` becomes the canonical ordered invitation content collection:

```json
{
  "items": [
    {
      "id": "course-uuid",
      "type": "course",
      "time": "14:00",
      "label": "MEET",
      "place": "성수역 3번 출구",
      "note": "첫 만남 장소입니다.",
      "mapUrl": "",
      "mapEnabled": false,
      "mapLatitude": 37.5446,
      "mapLongitude": 127.0559,
      "mapZoom": 16
    },
    {
      "id": "photo-uuid",
      "type": "photo",
      "src": "data:image/webp;base64,...",
      "alt": "서울숲에서 찍은 사진",
      "caption": "우리의 첫 번째 산책"
    }
  ]
}
```

- Item IDs use `crypto.randomUUID()` with a timestamp/random fallback.
- Unknown item types and empty course items are dropped during normalization.
- Photo sources must match a Base64 data URL for JPEG, PNG, or WebP. SVG, external URLs, HTML, and malformed data are rejected.
- The invitation supports at most 50 total items and at most 8 photos.
- Legacy `stops[]` input is converted to course items in the same order when `items[]` is absent.
- New generated HTML stores only canonical `items[]`; consumers derive course-map work from course items instead of maintaining a duplicated `stops[]` array.

## Image Pipeline

The photo picker accepts JPEG, PNG, and WebP files. Each selected file is decoded in the browser, oriented according to browser image decoding, resized so its longest edge is at most 1600 pixels, and re-encoded through Canvas.

- Prefer WebP at an initial quality of `0.82`.
- Reduce quality and dimensions in bounded steps until the encoded result is at most 600 KB.
- Reject a source file larger than 15 MB before decoding.
- Reject an image that cannot be decoded or reduced below the encoded limit.
- Re-encoding removes unrelated file metadata from the embedded result.
- Process multiple selected images sequentially to avoid memory spikes.
- Show progress and failures through the existing status area without discarding successful files from the same selection.

The maximum embedded image payload is therefore approximately 4.8 MB before Base64 overhead. Imported generated HTML raises its current size limit from 2 MB to 10 MB.

## Editor And Reordering

The existing date-course section becomes an ordered-content section with two commands: `코스 추가` and `사진 추가`. Course and photo editors share one list.

Each card contains:

- A drag handle restricted to pointer-driven reordering, so input editing does not accidentally start a drag.
- Icon-only move-up, move-down, and delete controls with Korean tooltips and accessible labels.
- A concise collapsed summary.
- Type-specific fields: course details and map options, or photo preview, alternative text, and caption.

Pointer Events drive mouse, pen, and touch reordering. While dragging, the card receives a raised visual state and is inserted before or after the item under the pointer. Releasing or cancelling the pointer commits the DOM order, rebuilds normalized data, and refreshes the preview. Move buttons use the same reorder function and remain available for keyboard and assistive-technology users.

## Invitation Rendering

The renderer iterates `items[]` in order:

- Course items render with their existing number, time, label, place, note, map, and fallback link.
- Photo items render as `<figure>` with a constrained responsive image, optional caption, and normalized alternative text.
- Course numbering counts only course items, regardless of intervening photos.
- Photos use fixed aspect and object-fit constraints in the editor, while standalone output preserves the image's natural aspect ratio within the invitation width.
- Empty captions are omitted rather than reserving blank space.

The same renderer remains the source for preview, downloaded HTML, saved records, uploaded invitations, and the viewer.

## IndexedDB Storage And Migration

Replace HTML payload storage in `localStorage` with an IndexedDB database named `invitation-maker`, version 1, containing an `invitations` object store keyed by `id`. Records retain the current shape: `id`, `title`, `createdAt`, `source`, and generated `html`.

- Library operations become asynchronous and report storage errors in the existing status elements.
- On startup, valid legacy localStorage records are copied to IndexedDB one at a time.
- A legacy record is removed from localStorage only after its IndexedDB write succeeds.
- Invalid records are skipped without blocking startup.
- `viewer.html?id=...` reads the record from the same IndexedDB store and rebuilds it through `InvitationCore` before rendering.
- Downloaded HTML remains fully independent and never reads IndexedDB.

## Particle Amount Extension

- Change the amount slider maximum to `500%`, retaining a `25%` step and `100%` default.
- Clamp normalized `particleAmount` to `25..500`.
- Continue using 16 particles at `100%`; `500%` produces 80 particle elements.
- Keep the mobile CSS visibility cap at 16 particles and keep `prefers-reduced-motion: reduce` disabling the entire layer.
- Persist the selected amount in preview, downloaded HTML, IndexedDB records, imported HTML, and viewer output.

## Particle Effect Expansion

Retain the existing effects and add five CSS-only effects, resulting in eight active effects plus `none`:

| Group | Effect ID | Editor label | Motion profile |
| --- | --- | --- | --- |
| Romantic | `petals` | 꽃잎 | Rotating downward drift |
| Romantic | `hearts` | 하트 | Slow downward sway |
| Ambient | `sparkle` | 빛가루 | Soft downward glow |
| Ambient | `fireflies` | 반딧불 | Irregular upward float and pulse |
| Ambient | `bubbles` | 버블 | Upward movement with subtle scaling |
| Seasonal | `snow` | 눈 | Layered downward fall at varied speeds |
| Seasonal | `leaves` | 나뭇잎 | Side-to-side tumbling fall |
| Celebration | `confetti` | 컨페티 | Faster multicolor downward fall |

The editor groups these options with `<optgroup>` labels `로맨틱`, `분위기`, `계절`, and `축하`. Unknown values continue to normalize to `none`.

The renderer uses one particle element structure and selects a per-effect CSS profile for shape, color, opacity, animation direction, duration multiplier, and spin behavior. Effects may use `::before` and `::after`, but do not add bitmap assets, Canvas animation, or runtime libraries. The common size and amount scales apply to all effects.

Upward effects start below the invitation viewport and finish above it; downward effects retain the existing top-to-bottom path. Pulse-only visual changes use opacity and transform so animation does not trigger layout. At `500%`, desktop output remains capped at 80 elements and mobile remains visually capped at 16 elements.

## Error Handling

- Unsupported, malformed, oversized, or undecodable photos produce a specific Korean message.
- IndexedDB open, migration, quota, and write failures leave the editor usable and explain that registration failed.
- A malformed imported invitation cannot inject executable markup; it is parsed only for the JSON payload and rebuilt through normalized data.
- Drag cancellation preserves the last committed order.
- Removing a photo immediately releases editor-only object URLs if any are used during decoding.

## Verification

Automated tests will cover:

- Legacy `stops[]` to `items[]` migration and canonical round trips.
- Course/photo normalization, limits, source allowlisting, and unsafe-source rejection.
- Mixed-order rendering and course-only numbering.
- Particle amount clamping and 80-element generation at `500%`.
- Effect allowlisting, option grouping, and generated output for all eight active particle effects.
- IndexedDB CRUD, legacy migration, registration, and same-origin viewer lookup.
- Standalone HTML image embedding, import rebuilding, and script-injection resistance.
- Reorder operations through the shared ordering function.

Browser verification will cover:

- JPEG, PNG, and WebP addition and visible compression feedback.
- Mouse and touch-style pointer reordering between course and photo cards.
- Keyboard move controls and focus preservation.
- Preview, download, registration, reload, and viewer order parity.
- Desktop and mobile layout, overflow, console errors, and the 16-particle mobile cap at `500%`.
- Visual distinction among falling, upward-floating, and pulsing effects without layout-triggering animation properties.

## Stop Condition

The change is complete when mixed photo/course ordering survives preview, standalone export, registration, reload, and viewer opening; legacy invitations still load; unsafe images are rejected; the `500%` particle amount behaves within the desktop/mobile limits; and all automated and browser checks pass without known console errors.
