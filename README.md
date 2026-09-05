# Invitation Maker

Static HTML invitation maker with occasion-first template presets, live preview, standalone HTML download, and local invitation registration.

## Files

- `index.html`: maker UI.
- `viewer.html`: same-origin viewer for invitations saved in the local library.
- `invitation-data.json`: template presets and the default invitation content.
- `assets/app.js`: editor, preview, download, upload, and local registration logic.
- `assets/template-catalog.js`: occasion and preset validation for the nine-category catalog.
- `assets/template-renderers.js`: five shared layout-family renderers used by preview, download, upload, and viewer paths.
- `assets/template-art.js`: built-in original WebP decoration data for selected presets.
- `assets/image-tools.js`: JPEG, PNG, and WebP validation, resizing, and compression.
- `assets/invitation-storage.js`: IndexedDB repository for registered invitations.
- `assets/invitation-core.js`: shared standalone HTML renderer.
- `assets/map-location.js`: NAVER Geocoding response normalization and place lookup.
- `assets/viewer.js`: validates and rebuilds a saved invitation before opening it.
- `assets/style.css`: maker UI and preview styles.

## Preview

The app loads `invitation-data.json`, so open it through a local static server or a deployed static host.

```sh
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173
```

## Workflow

1. Choose one of nine occasions: date, birthday, anniversary, event, kindergarten, wedding, 70th birthday, 60th birthday, or first birthday.
2. Pick one of the two presets in that occasion. The catalog has 18 presets total, including the preserved `royal`, `wedding`, `black-tie`, `botanical`, and `modern` IDs.
3. Selecting a preset card only changes the pending selection. Press **이 템플릿 적용** to replace the current draft; cancelling the confirmation keeps the draft untouched, and **되돌리기** restores the previous draft once.
4. Choose none, petals, hearts, sparkle, fireflies, bubbles, snow, leaves, or confetti, then adjust particle size from 50% to 200% in 5% steps and amount from 25% to 500% in 25% steps.
5. Choose separate display fonts for English and Korean text.
6. Edit title, date, location, and message, then add course, photo, notice, profile, and link cards in one ordered list.
7. Reorder content cards with the drag handle or the accessible move buttons, and delete cards without changing the remaining order.
8. Place names automatically create NAVER Map search links. Optionally enable Dynamic Map for the representative place or each course card; the maker resolves coordinates from the entered place or address.
9. Check the live preview.
10. Download a standalone `.html` invitation.
11. Register the current invitation or upload a downloaded HTML file into the local library.

On mobile, use the Maker, Preview, and Library tabs to switch between each workspace. Registered invitations are stored in the browser's IndexedDB and open through `viewer.html`, so Dynamic Maps keep the static site's registered origin.

Photos must be JPEG, PNG, or WebP. Each invitation accepts up to 8 photos and 50 total content items. Source images are limited to 15 MiB, resized to a maximum 1600-pixel edge, and compressed to at most 600 KiB before being embedded. Downloaded invitations include those images as Base64 data, so the standalone HTML does not depend on IndexedDB or the maker site.

The five layout families are Romantic Story, Celebration Poster, Kids Storybook, Wedding Editorial, and Korean Heritage. Preview, downloaded HTML, uploaded registrations, reloads, and `viewer.html` all rebuild from the same normalized invitation payload. Built-in template decoration is original local WebP art embedded only for the selected preset, so viewed invitations do not depend on remote image URLs or copied third-party artwork.

Only HTML downloaded by the current maker can be imported. HTML imports are limited to 10 MiB. Existing localStorage registrations are migrated to IndexedDB one record at a time after a successful durable write.

## NAVER Dynamic Map

Set the public Web Dynamic Map Client ID in `invitation-data.json`:

```json
{
  "site": {
    "naverMapClientId": "YOUR_CLIENT_ID"
  }
}
```

Enable both **Dynamic Map** and **Geocoding** for the NAVER Maps application. Register the exact local and deployed HTTP or HTTPS origins as Web service URLs, for example `http://localhost:4173` and the production Vercel origin.

The downloaded invitation keeps the `지도 열기` link as a fallback because a file opened directly with `file://` cannot use an origin-registered Dynamic Map. Dynamic Maps render when the invitation is served from a registered origin, including invitations opened from the local library.

Never place a NAVER Maps Client Secret in this repository or generated HTML. Browser-based Dynamic Map rendering uses only the public Client ID.
