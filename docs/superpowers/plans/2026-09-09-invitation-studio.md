# Invitation Studio implementation

**Goal:** Separate discovery from editing and protect personal drafts on mobile and desktop.
**Architecture:** Keep the static renderer and standalone exports; add an isolated IndexedDB draft store and maker-only styling.
**Tech Stack:** HTML, CSS, vanilla JavaScript, Node test runner, Chromium.
**Spec:** Approved local-first UI/UX redesign in this conversation.

- [x] Test content-preserving preset changes before implementing them (observed red, then green).
- [x] Restore and serialize automatic draft writes, including images; expose storage failures.
- [x] Separate gallery and editing with accessible navigation and full design previews.
- [x] Apply neutral maker-only styles and mobile layouts without altering exported HTML.
- [x] Run existing tests and browser checks for reload, design switching, narrow screens and export (242 Node tests; Chromium at 320/390/768/1440px).

Follow-up scope: template artwork refinements, library editing/duplication and native-device keyboard verification remain separately verifiable work.
