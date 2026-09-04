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
2. Edit title, date, location, message, and course rows.
3. Check the live preview.
4. Download a standalone `.html` invitation.
5. Register the current invitation or upload a downloaded HTML file into the local library.

Registered invitations are stored in the browser's `localStorage`.
