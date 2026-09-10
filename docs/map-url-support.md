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
