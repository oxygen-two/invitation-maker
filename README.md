# Invitation Maker

Static HTML invitation maker with template presets, live preview, standalone HTML download, and local invitation registration.

## Files

- `index.html`: maker UI.
- `invitation-data.json`: template presets and the default invitation content.
- `assets/app.js`: editor, preview, download, upload, and local registration logic.
- `assets/invitation-core.js`: shared standalone HTML renderer.
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
2. Choose no effect, sparkle, petals, or confetti and select its size.
3. Edit title, date, location, and message, then expand, add, or remove course cards.
4. Optionally set a map link and Dynamic Map coordinates on the representative place or each course card.
5. Check the live preview.
6. Download a standalone `.html` invitation.
7. Register the current invitation or upload a downloaded HTML file into the local library.

Registered invitations are stored in the browser's `localStorage`.
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
