# Design

## Source of truth
- Status: Active. Last refreshed: 2026-09-09.
- Surfaces: maker, preview, library, standalone invitation.
- Evidence: index.html, assets/app.js, assets/style.css, assets/template-renderers.js; approved UI/UX audit on 2026-09-07.

## Brand
- Calm, useful editor; expressive invitation designs. Keep the six birthday compositions distinct.
- Trust: visible applied state, reversible template changes, user-owned HTML.
- Avoid decorative editor chrome competing with the invitation, age-gated styles, and placeholder contact promises.

## Product goals
- Help a first-time user choose, personalize, and finish quickly; three minutes is a target, not a measured claim.
- No new server, account, RSVP collection, dependencies, or deployment in this iteration.
- Success: visible apply action, essential fields before effects, readable invitation information.

## Personas and jobs
- Personal event hosts, including women in their20s–40s, selecting by taste rather than age.
- Choose a style, enter name/date/place, optionally add photos and contact, download or save.

## Information architecture
- Invitation Studio: Design / Edit / Finish / Library navigation.
- Gallery: two columns on phones, four on desktop; selecting a card opens a full sample without changing the draft.
- Edit: essential fields first, optional effects and photos collapsed; mobile editor/preview toggle.
- Finish: invitation preview and HTML download / local library save. No simulated cloud publishing.
- Template selection → basic information → place → optional photo/style/content.
- Selecting a card does not overwrite the current draft. A visible primary action applies it.

## Design principles
- Preserve personal text, images and ordered content on design changes; use the new design's font defaults. First selection uses sample content.
- Drafts live in a separate IndexedDB store and restore on startup. Show write failures; local storage is not cloud backup. Wait for saved status before closing.
- Expose essential actions and progressively disclose decoration.
- Reuse the existing form and renderer across stages; no framework or dependency additions.

## Visual language
- Retain invitation palettes and editorial imagery; maker-only studio.css uses warm white, charcoal and a muted green action color. It is not embedded in exports.
- Korean titles must not inherit English decorative italics in the new birthday designs.
- Important date/place/host text at least14px; normal information text contrast at least4.5:1.
- Keep existing radii and spacing vocabulary; compact maker header, bounded template gallery.
- No additional animation; retain reduced-motion behavior.

## Components
- Reuse template picker, existing apply/undo handlers, details groups, fixed action row, contact/link editor.
- Pending selection gets a named start button and clear explanation of the current preview.
- Template gallery can expand to show all designs; original thumbnail rendering stays canonical.

## Accessibility
- Improve verified contrast failures; this iteration does not certify full WCAG compliance.
- Preserve semantic buttons, keyboard focus, field labels, polite status messages, reduced motion.
- Editor controls should be at least44px tall where practical.

## Responsive behavior
- Verify390/768/1440px; small-screen spot check at320px.
- Mobile has compact horizontal template browsing plus all-design view, stable fixed actions and safe-area padding.
- Avoid page-level horizontal overflow and fixed controls hiding focused fields.

## Interaction states
- Loading: preserve pending image/save disabling.
- Empty: library still shows no saved invitations, no automatic writes.
- Error: invalid fields are opened and focused; preserve draft.
- Success: applied design named, undo available, save/export feedback retained.
- Pending selection: no silent download of a different highlighted design; user can explicitly keep current draft.
- Offline: standalone content remains local; external fonts/maps may need network.

## Content voice
- Korean, brief, action-oriented. Describe use cases instead of design jargon.
- Warn before export when a reply-request contact item has no contact route; allow explicit export without contact.

## Implementation constraints
- Static HTML/CSS/JS, shared canonical invitation renderer, no new dependencies.
- Preserve prior uncommitted template work and existing storage/import/export compatibility.
- Tests first for behavior; actual browser geometry, contrast and screenshot review before completion.

## Open questions
- Real novice completion time and real iOS/Android keyboard testing remain future validation work.
# Mobile polish — 2026-09-10

- Mobile gallery has a persistent selected-design label and create action, plus an explicit sample-to-gallery return action. Actions share the existing busy-state guard and template application path.
- Mobile editing uses a compact heading and hides redundant introductory copy. Maker controls use neutral/green styling independently from invitation palettes.
- Bloom body: spacious ruled sections. Cherry body: bold numbered rows. Peach body: inset stationery with centered schedule entries. Shared renderer styles also ship in standalone exports.
- Verification: 242 Node tests; browser flows at 320/390/768/1440px; 320px standalone stress cases for the three designs with long Korean titles and ten course items. Native iOS/Android keyboard, safe-area and sharing behavior still require physical-device testing.
