# Invitation Maker

Static HTML invitation maker with template presets, live preview, standalone HTML download, and local invitation registration.

## Files

- `index.html`: maker UI.
- `viewer.html`: same-origin viewer for invitations saved in the local library.
- `invitation-data.json`: template presets and the default invitation content.
- `assets/app.js`: editor, preview, download, upload, and local registration logic.
- `assets/invitation-core.js`: shared standalone HTML renderer.
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

1. Choose an invitation template.
2. Choose no effect, sparkle, petals, or confetti, then adjust particle size and amount with percentage scales.
3. Choose separate display fonts for English and Korean text.
4. Edit title, date, location, and message, then expand, add, or remove course cards.
5. Place names automatically create NAVER Map search links. Optionally add Dynamic Map coordinates to the representative place or each course card.
6. Check the live preview.
7. Download a standalone `.html` invitation.
8. Register the current invitation or upload a downloaded HTML file into the local library.

On mobile, use the Maker, Preview, and Library tabs to switch between each workspace. Registered invitations are stored in the browser's `localStorage` and open through `viewer.html`, so Dynamic Maps keep the static site's registered origin.
Only HTML downloaded by the current maker can be imported. Imports are limited to 2 MB and invitations support up to 50 course cards.

## NAVER Dynamic Map

Set the public Web Dynamic Map Client ID in `invitation-data.json`:

```json
{
  "site": {
    "naverMapClientId": "YOUR_CLIENT_ID"
  }
}
```

Register the deployed HTTP or HTTPS origin as a Web service URL in NAVER Cloud. The downloaded invitation keeps the `지도 열기` link as a fallback because a file opened directly with `file://` cannot use an origin-registered Dynamic Map.

Never place a NAVER Maps Client Secret in this repository or generated HTML. Browser-based Dynamic Map rendering uses only the public Client ID.
