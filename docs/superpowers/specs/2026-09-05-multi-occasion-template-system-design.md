# Multi-Occasion Template System Design

## Goal

Extend the existing static invitation maker into a category-first template system for nine occasions: date, birthday, anniversary, general event, kindergarten, wedding, 70th birthday celebration, 60th birthday celebration, and first birthday.

Each occasion provides two complete presets, for 18 presets total. Selecting a preset supplies layout, sample copy, ordered content, fonts, colors, intro, particles, and decoration defaults. After applying it, the user continues editing through the existing maker, preview, map, image, download, registration, and library flows.

## Product Constraints

- Keep the application as static HTML, CSS, and JavaScript. Do not add a server runtime or new production dependency.
- Preserve the current maker rather than replacing it with a separate editor or wizard.
- Preserve the five existing template IDs and continue loading existing saved and downloaded invitations.
- Keep preview, standalone download, saved records, imported HTML, and the viewer on the same canonical renderer path.
- Keep NAVER Maps optional and retain its existing public Client ID boundary. Never store or emit a Client Secret.
- Built-in template decoration must not depend on third-party image URLs at invitation-viewing time.
- Do not copy external template artwork. External services are references for category breadth, information hierarchy, and interaction patterns only.
- Keep RSVP collection, guest books, payments, and account management out of scope. A template may link to an external RSVP page, telephone number, or message action.

## Reference Findings

The design direction is informed by these public template and product collections:

- Canva groups large template catalogs by occasion and differentiates them through photography, illustration, typography, and motif rather than palette alone: <https://www.canva.com/invitations/templates/>
- Paperless Post starts from occasion-specific complete designs and then supports detailed personalization: <https://www.paperlesspost.com/>
- MiriCanvas includes Korean milestone designs that use traditional colors, floral motifs, and restrained whitespace: <https://www.miricanvas.com/ko/template/all-types/%EA%B3%A0%ED%9D%AC%EC%97%B0>
- Korean mobile invitation services commonly combine gallery, map, guidance, contact, and external response links as optional sections: <https://foil.ink/> and <https://pickinvite.com/ko/>

The project will adopt those structural lessons while creating original layouts, copy, and decorative assets.

## User Flow

The existing template area becomes the first part of the current maker:

1. The user selects one of nine occasion chips.
2. The maker displays the two presets assigned to that occasion.
3. Selecting a preset card changes only the pending selection and its summary. It does not modify the current draft.
4. The user activates `이 템플릿 적용` to apply the complete preset.
5. If the current draft differs from the last applied or loaded state, the maker confirms that content will be replaced.
6. Immediately before application, the maker stores one in-memory snapshot of the current normalized invitation.
7. The preset fills the existing form and ordered content editor. The user edits it through the current controls.
8. A transient `되돌리기` action restores the saved snapshot once. Applying another preset replaces that snapshot.

Changing the occasion only filters presets. It never overwrites invitation content. Reloading the page clears the one-step undo snapshot.

## Catalog And Layout Families

The 18 presets are organized into five reusable layout families. A layout family owns composition and section presentation. Each preset owns content defaults and visual tokens.

| Occasion | Preset | Status | Layout family | Primary character |
| --- | --- | --- | --- | --- |
| Date | Botanical Date | Existing `botanical` | Romantic Story | Garden and daytime walk |
| Date | Midnight Cinema | New | Romantic Story | Urban evening itinerary |
| Birthday | Modern Birthday | Existing `modern` | Celebration Poster | Restrained adult birthday |
| Birthday | Color Pop | New | Celebration Poster | Bold party typography |
| Anniversary | Royal Anniversary | Existing `royal` | Romantic Story | Elegant evening milestone |
| Anniversary | Memory Film | New | Romantic Story | Photo-led shared history |
| General event | Black Tie Event | Existing `black-tie` | Celebration Poster | Gala and formal gathering |
| General event | Gallery Notice | New | Celebration Poster | Exhibition, popup, and opening |
| Kindergarten | Sunny Classroom | New | Kids Storybook | Performance and sports day |
| Kindergarten | Little Forest | New | Kids Storybook | Picnic and field activity |
| Wedding | Wedding Letter | Existing `wedding` | Wedding Editorial | Classic invitation letter |
| Wedding | Modern Vow | New | Wedding Editorial | Photo-led contemporary ceremony |
| 70th birthday | Blue Porcelain | New | Korean Heritage | Porcelain blue and whitespace |
| 70th birthday | Peony Tribute | New | Korean Heritage | Peony and gratitude letter |
| 60th birthday | Red Silk | New | Korean Heritage | Formal traditional celebration |
| 60th birthday | Golden Years | New | Korean Heritage | Family portrait and life story |
| First birthday | First Chapter | New | Kids Storybook | Child's first-year story |
| First birthday | Little Star | New | Kids Storybook | Portrait and starlight celebration |

The five existing IDs keep their current base visual identity and remain valid catalog entries. Their occasion assignment changes discovery only; it does not invalidate existing invitation content.

## Preset Catalog Model

The catalog is data-driven. Each preset has a stable ID and references one layout family:

```json
{
  "id": "modern-vow",
  "occasionId": "wedding",
  "familyId": "wedding-editorial",
  "name": "Modern Vow",
  "description": "사진 중심의 현대적인 결혼 초대장",
  "assetMode": "photo",
  "theme": {
    "palette": "ivory-charcoal",
    "decoration": "fine-line-frame"
  },
  "defaults": {
    "introEffect": "curtain",
    "particleEffect": "petals",
    "particleScale": 90,
    "particleAmount": 75,
    "englishFont": "playfair-display",
    "koreanFont": "noto-serif-kr",
    "title": "Minjun & Seoyeon",
    "subtitle": "두 사람이 함께 걷는 첫날에 초대합니다.",
    "items": []
  }
}
```

Required catalog invariants:

- Every preset ID is unique and stable.
- Every occasion has exactly two presets.
- Every preset references one of the five known layout families.
- The five existing IDs remain present.
- Defaults pass through `InvitationCore.normalizeInvitation` before reaching editor state.
- Invalid catalog entries are omitted without blocking valid presets.

## Invitation Data Model

`templateId` remains the persisted preset reference. The existing top-level invitation fields remain unchanged. `items[]` remains the canonical ordered content sequence and expands from two item types to five.

### Existing item types

- `course`: time, label, place, note, map URL, and optional dynamic map. Its editor label may be `코스`, `일정`, or `프로그램` according to the active occasion, but the persisted type remains `course` for compatibility.
- `photo`: embedded JPEG, PNG, or WebP source, alternative text, and optional caption. Existing limits and compression rules remain unchanged.

### New item types

```json
[
  {
    "id": "notice-uuid",
    "type": "notice",
    "heading": "준비물 안내",
    "body": "편한 운동화와 개인 물병을 준비해주세요."
  },
  {
    "id": "profile-uuid",
    "type": "profile",
    "name": "김하린",
    "role": "오늘의 주인공",
    "description": "첫 번째 생일을 함께 축하해주세요."
  },
  {
    "id": "link-uuid",
    "type": "link",
    "label": "참석 여부 알려주기",
    "value": "행사 준비를 위해 회신해주세요.",
    "url": "https://example.com/rsvp"
  }
]
```

- `notice` supports general guidance such as supplies, parking, dress code, transportation, or meal information.
- `profile` supports wedding participants, a child, parents, or a milestone celebrant without adding occasion-specific top-level fields.
- `link` allowlists `https:`, `http:`, `tel:`, and `sms:` destinations. Executable and unknown schemes are rejected.
- Empty items and unknown types are dropped during normalization.
- Existing total item and photo limits remain in force.

This model keeps the maker generic. Occasion-specific behavior comes from preset defaults and labels rather than nine separate forms.

## Rendering Architecture

The user sees one maker, but implementation responsibilities remain isolated:

- The catalog module validates occasion and preset metadata and returns normalized defaults.
- The maker application owns category filtering, pending selection, dirty-state confirmation, one-step undo, and form hydration.
- `InvitationCore` remains the public normalization and output boundary.
- A layout-family registry selects one of five body renderers from the resolved `templateId`.
- Shared item renderers normalize and escape each item, then expose safe markup to the selected family.
- Shared map, particle, intro, font, and standalone runtime helpers remain the source for preview and downloaded HTML.
- Existing template IDs have explicit family mappings. An unknown template ID falls back to the current default renderer without dropping user content.

No family may create its own storage, export, map, or intro path. This prevents preview and standalone output from diverging.

## Visual System And Assets

The five families differ in composition, not only color:

- Romantic Story uses immersive photography, narrative spacing, and an itinerary rhythm.
- Celebration Poster uses large display type, immediately visible schedule information, and bold geometric decoration.
- Kids Storybook uses friendly illustration, child-safe contrast, rounded image framing, and concise guardian information.
- Wedding Editorial uses formal typography, generous whitespace, couple profiles, ceremony schedule, and restrained ornament.
- Korean Heritage uses Korean serif typography, traditional color accents, subtle paper texture, and family-centered information hierarchy.

Asset policy is mixed by occasion:

- Date, anniversary, wedding, and first-birthday presets are photo-forward but remain complete when no user photo is supplied.
- Birthday, general event, kindergarten, 60th birthday, and 70th birthday presets are complete with original built-in decoration.
- Built-in visual assets are original, locally stored, and optimized. Only assets required by the selected preset are embedded in standalone HTML.
- Missing decorative assets fall back to readable CSS background and typography rather than leaving broken images.
- Decoration remains behind readable content. Interactive controls and invitation content retain their expected stacking behavior above decoration, while user-selected particles keep their existing foreground contract.

## Mobile Design

The current `제작`, `미리보기`, and `보관함` tabs remain the primary mobile navigation.

- Occasion chips form a single horizontally scrollable row with visible selected state.
- The two preset cards use horizontal snap behavior and stable dimensions. Selecting a card does not shift surrounding layout.
- Editor groups remain collapsible. Ordered items use one full-width column.
- Touch drag remains available through the existing handle, and move-up/down buttons remain as accessible alternatives.
- Interactive targets are at least 44 CSS pixels in both dimensions.
- Download and registration actions respect device safe areas and do not cover focused inputs when the software keyboard is open.
- Preview uses the same renderer and invitation width rules as desktop, with no horizontal page overflow.
- Long Korean words, large system text, and the maximum configured particle amount must not overlap controls or content.

## Error Handling And Recovery

- Invalid or missing catalog data falls back to the default occasion and preset while leaving the current draft editable.
- Applying a malformed preset fails before draft replacement and reports a Korean status message.
- Once application starts, form hydration is atomic: either the normalized preset replaces the draft or the old draft remains intact.
- The undo snapshot is captured only after validation succeeds and immediately before replacement.
- Unsupported item types are omitted while valid sibling items continue to render.
- Invalid link schemes render as plain information without a clickable action.
- Missing decorative assets retain readable layout and content.
- Existing map load and geocoding failures continue to show the current map fallback link.
- Imported and saved invitations continue to be rebuilt from normalized JSON rather than trusting uploaded HTML markup.

## Expected File Boundaries

Implementation should keep the diff focused around these responsibilities:

- `invitation-data.json`: occasion metadata, 18 preset entries, and default invitation.
- `assets/template-catalog.js`: catalog validation, lookup, and stable mappings if JSON-only validation would overburden `app.js`.
- `assets/template-renderers.js`: five layout-family renderers and safe item presentation helpers.
- `assets/invitation-core.js`: canonical normalization, new item types, family dispatch, and standalone integration.
- `assets/app.js`: category/preset interaction, dirty confirmation, one-step undo, and new item-card editors.
- `index.html`: category selector, preset application control, and new item commands within the existing maker.
- `assets/style.css`: maker controls, five preview families, responsive behavior, and item editors.
- Existing test files plus focused catalog or renderer tests where responsibility is isolated.

Exact file creation is implementation-dependent, but catalog rules and family rendering must not be folded into one growing `app.js` block.

## Accessibility And Performance

- All preset cards use buttons with `aria-pressed` or equivalent selected-state semantics.
- Confirmation and undo status are announced without stealing focus.
- Template thumbnails are decorative unless they communicate content not present in the accessible name.
- Every family meets readable text contrast and remains usable when images or animation are disabled.
- `prefers-reduced-motion` continues to suppress nonessential intro and particle motion.
- Only the selected preset's built-in asset payload is included in downloaded HTML.
- Existing photo compression, eight-photo limit, and ten-megabyte imported HTML limit remain unchanged unless measurements during implementation prove a narrower adjustment is required.

## Verification

Automated tests will cover:

- Exactly nine occasions, exactly two presets per occasion, 18 unique IDs, five valid families, and retention of all five existing IDs.
- Catalog fallback and rejection of malformed preset definitions.
- Full-preset application, dirty-state confirmation boundaries, atomic hydration, and one-step undo.
- Normalization, limits, escaping, URL allowlisting, and rendering for `notice`, `profile`, and `link` items.
- Existing `course` and `photo` migration and rendering behavior.
- Unknown template and unknown item fallback without content loss.
- Preview, standalone HTML, saved record, imported HTML, and viewer renderer parity.
- Conditional inclusion of only the selected preset's decorative assets.
- Existing map, intro, particle, font, storage, and content-order contracts.

Browser verification will cover:

- Category filtering and both presets for every occasion.
- Applying, cancelling, editing, and undoing a preset with and without an existing draft.
- Adding, deleting, dragging, and keyboard-moving all five item types.
- Visual distinction among all five layout families and between the two presets in each occasion.
- No overlap or horizontal overflow at widths of 390, 768, and 1440 CSS pixels.
- Long Korean content, no user photo, eight photos, map failure, reduced motion, and particle amount at 500 percent.
- Preview, downloaded HTML, registration, reload, and viewer output for at least one preset from each family.
- Zero known browser console errors during the verified paths.

## Delivery Sequence

Implementation should proceed in compatibility-first slices:

1. Add catalog validation and occasion filtering while preserving current template rendering.
2. Add safe preset application and one-step undo using existing item types.
3. Add and test the three new item types.
4. Add the five family renderer boundary and map the existing IDs without visual regressions.
5. Add the 13 new presets and original visual assets.
6. Complete responsive styling, standalone parity, and cross-family browser QA.

## Stop Condition

The work is complete when all 18 presets are discoverable as two choices under each of nine occasions; every preset applies a complete editable draft through the existing maker; all five item types survive preview, standalone export, registration, reload, and viewer rendering; the five existing template IDs and old invitations remain supported; all five families are visually distinct and responsive; and automated plus browser verification passes without known console errors or content overlap.
