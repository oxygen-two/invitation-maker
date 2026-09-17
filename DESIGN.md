# Design

## Source of truth
- Status: Active. Last refreshed: 2026-09-12.
- Surfaces: maker, preview, library, standalone invitation.
- Evidence: index.html, assets/studio/app.js, assets/studio/style.css, assets/invitation/template-renderers.js; approved UI/UX audit on 2026-09-07.

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

## Error pages — 2026-09-10

- Scope: standalone 400/401/403/404/408/410/429/500/502/503/504 pages; no new server, authentication or paid platform configuration.
- Extend the studio palette (#f7f7f4 paper, #282b29 ink, #314e41 green), not invitation-specific themes. Use a static envelope illustration, large serif status number, concise Korean heading and explicit recovery actions.
- No motion, external fonts, image requests, analytics or storage reads. Inline SVG/CSS make the page independent of failing asset requests; primary navigation works without JavaScript.
- Do not imply a missing invitation is deleted, a save succeeded, support has been notified, or an authentication service exists. No automatic retries, query-string rendering or arbitrary return URLs.
- Mobile: stacked illustration/content at 700px, 48px minimum action targets, safe-area footer, test at 320/390/768/1440px.
- Root 404.html is the static missing-route fallback. Other HTTP statuses need a server/platform error integration; on the current Hobby plan, Vercel platform errors cannot be replaced by these files. Direct HTML visits are previews, not HTTP error responses.

## Social preview — 2026-09-10

- Main-site link preview uses the user-approved error-page envelope mark and Invitation Studio wordmark, warm paper and green palette, and “작은 초대, 소중한 순간.” copy.
- Static 1200×630 PNG with a centered safe composition; no private draft content or external fonts. Source: scripts/build-social-preview.cjs. Main HTML exposes Open Graph and large-image Twitter card tags before JavaScript runs.
- This is the public service card, not per-invitation publishing. Local viewer IDs and standalone exports are unchanged; per-invitation metadata needs publicly accessible published HTML and images.

## Finish-stage choices — 2026-09-11

- Finishing an invitation is three peer choices rather than one save action with buried alternatives: 보관함에 저장 (local library), 파일로 저장 (HTML download), 링크로 공유 (public link). All three sit in one row as equal `finish-choice-card` buttons; none is visually primary over the others.
- The download and share choices open a native `<dialog>` (`#download-dialog`, `#share-dialog`) before doing anything, because both have a consequence that is not obvious from the button label alone: the downloaded file is the copy that survives losing this browser, while a published link's *revocation* right does not — it stays tied to this browser even though the link itself outlives it. The library choice needs no such dialog because it has no such asymmetry to explain.
- Dialogs are plain `<dialog>` with `showModal()`/`close()`, closed by an explicit close button, a backdrop click, or the native Escape handling; focus returns to the triggering button on close (`bindDialog` in `assets/studio/app.js`).

## Studio preview isolation and unified stages — 2026-09-12

- The preview panel is an `<iframe>` whose `srcdoc` is generated by the same `InvitationCore.buildStandaloneHtml` call used for an actual download or publish, not markup injected into the studio page. Two reasons: the invitation's own `<h1>`/`<header>` no longer appear in the studio document's own heading outline (they used to, which broke the page's accessibility structure), and the preview can no longer visually drift from what a guest actually receives, because it now literally is that document.
- The preview column is sticky (`position: sticky`, full viewport height minus the top bar) during the edit and finish stages, so it stays visible while a long form scrolls.
- The gallery/edit/finish stages share one alignment and grid structure (`body[data-studio-stage="..."]` selectors in `assets/studio/studio.css`) instead of each stage having its own bespoke layout, so switching stages no longer reflows unrelated panels.
- The language switcher (`#language-select`) lives in the top bar, clear of the three-stage nav, sized for touch.

## Landing and guide — 2026-09-18

- Entry policy: `/` is state-aware — a browser that has never opened the studio sees the landing, one that has is sent straight to `/studio` (query string preserved) via an inline pre-stylesheet script guarded by `try/catch`. `/welcome` is the same document without that branch, so the studio footer's "소개" link and any shared "revisit the landing" copy stay true even for returning users.
- Palette reuse: the landing/guide chrome (`assets/site/site.css`) reuses the error-page and social-card palette — paper `#f7f7f4`, ink `#282b29`, green `#314e41`, muted `#59645e`, line `#dce1d8` — deliberately kept independent of `assets/studio/studio.css` so no invitation palette leaks into site chrome.
- No external fonts: system font stack only, matching the studio and error pages; only the invitation designs themselves carry custom typography, and that lives inside the screenshots.
- Static screenshots come from the studio itself: `scripts/build-site-media.cjs` drives the real `/studio` with Playwright and captures the gallery/edit/finish stages and the six design cards, so the guide and landing can never show chrome the studio doesn't actually have. Re-run this script (and `--check`) whenever studio chrome changes.
- The guide's "내 데이터는 어디에" (`#data`) section is the honest answer to the audit's A-8 finding (no data-handling explanation existed): what stays local, what reaches the server, and the same 7/30-day expiry and 2MB limits already enforced in `server/config/publishing.cjs`, stated as fact rather than as a policy document.
