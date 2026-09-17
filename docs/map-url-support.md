# Map URL support and remaining integration

The URL field now takes priority over the display name for representative and course maps. Changing the display name while a URL is present preserves coordinates. Changing the URL invalidates coordinates and in-flight lookups. A URL is never sent to address geocoding, and failure never silently falls back to the display name.

Supported automatic positioning is limited to allowed Naver map hosts with explicit valid `lat` and `lng` query parameters. A map camera centre is not a place marker. Enable the dynamic-map checkbox to display the map; the Naver SDK still requires an authorized client/domain configuration.

## Not yet supported

`https://map.naver.com/p/entry/place/1266673496` (살롱순라 서순라길점), mobile place links, and `naver.me` short links do not supply trusted coordinates to the current static implementation. They show an explicit unavailable message and retain the external map button. This is **not** a complete fix for automatic positioning from those links.

Completion requires a supported place-ID-to-coordinate data source/API and, if required by that source, a server-side resolver. Do not hardcode one restaurant, silently geocode a different label, use a camera centre, or assume embedding the Naver place page works. The inspected Naver page returned `X-Frame-Options: DENY`.

Without a URL, existing address geocoding remains available. Previous production verification resolved `서울 종로구 율곡로10길 75` to latitude `37.5741694`, longitude `126.9916905`; this is evidence for that address, not a general place-ID resolver.

## Verification

- `node --test tests/map-location.test.js`: URL priority, no name fallback, malformed/foreign URLs, coordinate bounds, existing geocoding behavior.
- `PLAYWRIGHT_MODULE=/absolute/path/to/playwright node scripts/verify-map-url.cjs`: local Chrome, 390/1440px, URL coordinates, renamed label, unsupported place-ID behavior, no local analytics dispatch. External map rendering is deliberately excluded; production SDK/domain validation remains separate.

## Google Maps (added 2026-09-18)

Each invitation now stores `mapProvider` (`"naver"` or `"google"`). Invitations saved or published before this field existed have no value and are read as `"naver"`, which is what they were. The author picks the service at the top of the main location group. A new invitation starts on Google Maps when the studio is in English and on NAVER Map otherwise; after that, only the author changes it.

The provider decides three things: which geocoder reads a typed address, which SDK draws the map, and where a guest's map button searches when the author gave no link. An author's own link always wins for the button.

Switching provider keeps coordinates that were already found. Both services use WGS84, and re-geocoding a Korean venue name through Google could move a correct pin. Only maps that are on but have no position yet are looked up again.

### Links that give an automatic position

Links from either service are accepted whatever provider is selected.

| Link | Result |
|---|---|
| `google.*/maps/place/…/data=…!3d<lat>!4d<lng>` | The pinned place |
| `?q=<lat>,<lng>`, `?query=<lat>,<lng>`, `?destination=<lat>,<lng>` | That position |
| `/maps/search/<lat>,<lng>` | That position |
| `maps.app.goo.gl/…`, `goo.gl/maps/…` | Unavailable, button kept. Resolving a short link needs a server |
| `?q=<text>`, or only `@<lat>,<lng>,<zoom>` | Unavailable. A text search is not a position and `@` is the camera centre |

### Configuration

Set `site.googleMapsApiKey` in `invitation-data.json`. With no key, Google invitations show the "use the button below" status instead of a map, and the button still works.

Create the key in Google Cloud Console with both restrictions:

- **Application restriction:** HTTP referrers. Add `https://invitation-maker-one.vercel.app/*` and, for local work, `http://127.0.0.1:4173/*` and `http://localhost:4173/*`.
- **API restriction:** Maps JavaScript API and Geocoding API only.

Enter each site as its own row with the scheme and `/*`. A single row such as `a.com,127.0.0.1:4173` matches nothing. Key changes take up to five minutes to apply.

### Why Google is drawn in its own pages

Two pages in `assets/integrations/` exist because Google Maps cannot run directly where invitations are rendered. Both findings come from Chrome with the restricted key above.

- **`google-map.html` draws every Google map.** The studio preview and the published viewer show invitations in `about:srcdoc` frames. Google authorizes the key with a delayed call about 30 to 40 seconds after a map appears. From an `srcdoc` document it reports the site as `null`, fails with `RefererNotAllowedMapError`, and replaces the map with its error screen. The same map inside a nested frame with a real URL stays up, including inside the viewer's sandboxed, no-referrer frame. Coordinates and the public key travel in the URL fragment, which is never sent to a server. The page reports `ready` or `failed` back with `postMessage`.
- **`google-geocoder.html` answers address lookups in the studio.** The geocoder inside the `srcdoc` preview never calls back. A Google copy loaded with a real URL in the studio's own origin also broke the preview map. This page runs in a sandbox without `allow-same-origin`, so it has a real URL but no access to the studio's storage.

Short checks hide the map failure because it arrives late. Any change to how Google maps load must be verified by keeping a map on screen for at least a minute.

Google maps use `gestureHandling: "cooperative"`, so a one-finger swipe scrolls the invitation instead of dragging the map. NAVER maps are unchanged.

A downloaded invitation opened from disk (`file:`) still shows the "use the button below" status for Google maps, as it already did for NAVER.

### Verification

- `node --test tests/map-location.test.js`: Google link parsing, look-alike hosts, Google geocoder statuses.
- `node --test tests/invitation-core.test.js`: provider default, Google loader output, provider-specific button links.
- `node --test tests/map-provider-publishing.test.js`: provider survives publishing and invalid values are rejected.
- Verified in Chrome on 2026-09-18: a Paris address resolved through the geocoder page, and the studio preview map stayed up with its pin past 60 seconds. A viewer-like sandboxed `srcdoc` frame with the nested map page stayed up past 90 seconds, while a direct `srcdoc` map failed at about 40 seconds.
- Not yet verified: a published `/i/{id}` page on production. It needs this branch deployed.
