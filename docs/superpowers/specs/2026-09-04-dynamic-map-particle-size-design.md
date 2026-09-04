# Dynamic Map and Particle Size Design

## Goal

Extend the static invitation maker with optional NAVER Web Dynamic Maps per course card and user-selectable particle sizes while preserving standalone HTML downloads and link-only fallbacks.

## Constraints

- Keep the application static HTML, CSS, and JavaScript; do not add a Node.js server or runtime dependency.
- Use only the NAVER Maps Client ID in browser code. Never accept, persist, log, or embed a Client Secret.
- Load NAVER Maps only when the invitation enables the map and has valid coordinates.
- A downloaded invitation opened with `file://` or outside an allowed service URL must retain a usable NAVER Map link fallback.
- Keep `none`, `sparkle`, `petals`, and `confetti`; add `small`, `medium`, and `large` particle sizes.

## Data Model

`site.naverMapClientId` stores the public Web Dynamic Map Client ID used by the maker and generated HTML. Each course card carries its own optional map settings:

```json
{
  "particleSize": "medium",
  "stops": [
    {
      "time": "14:00",
      "label": "CAFE",
      "place": "카페",
      "note": "첫 코스",
      "mapUrl": "https://map.naver.com/",
      "mapEnabled": false,
      "mapLatitude": 37.5446,
      "mapLongitude": 127.0559,
      "mapZoom": 16
    }
  ]
}
```

Unknown particle sizes normalize to `medium`. Coordinates outside latitude `-90..90` or longitude `-180..180` disable the dynamic map. Zoom is clamped to `6..21`.

## Rendering

The editor presents course cards instead of a pipe-delimited textarea. Users can add and remove cards, and each card owns its map link and optional coordinates. Enabled maps render below their course details with a marker and nearby fallback link. The maker and standalone HTML load the NAVER Maps script once, then mount every enabled course map. Generated HTML loads the script only on HTTP or HTTPS and shows fallback states if loading or authentication fails.

Particle size is expressed as a CSS scale on the existing decorative layer. Mobile still limits visible particles to ten, and `prefers-reduced-motion: reduce` hides the layer.

## Verification

- Node tests cover normalization, conditional Dynamic Map output, fallback output, particle size preservation, and secret exclusion.
- Browser checks cover all particle sizes, map toggle visibility, fallback behavior, mobile overflow, reduced motion, card lifecycle, download, and re-import.
- The SDK currently loads from `http://localhost:4173`, but NAVER's origin authentication returns `401`; the verified fallback remains visible until the console registration accepts the origin.
