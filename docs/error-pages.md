# Error pages

## Files and maintenance

Root `400.html`, `401.html`, `403.html`, `404.html`, `408.html`, `410.html`,
`429.html`, `500.html`, `502.html`, `503.html`, `504.html` are standalone,
generated static documents. Edit `scripts/build-error-pages.cjs`, then run:

```sh
node scripts/build-error-pages.cjs
node scripts/build-error-pages.cjs --check
node --test tests/*.test.js
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node scripts/verify-error-pages.cjs
```

The browser verifier uses installed Chrome and defaults to `http://localhost:4173`.
Start the existing static server first. `TEST_URL` can override the origin.
No npm dependency or Vercel build command is added. Generated HTML is checked in
with the source, so the current root output directory remains unchanged.

## Routing: distinguish UI from HTTP status

- Vercel's static missing-route fallback automatically uses root `404.html`
  when the output directory is the repository root. Do **not** add a catch-all
  rewrite to `/404.html` or `/index.html`: it could produce soft 404s or hide real routes.
- Visiting `/404.html` or `/503.html` directly previews the document; it does not
  make a static server return HTTP 404 or 503.
- Other 4xx documents are prepared for future application/server integrations.
  They do not implement authentication, authorization, rate limiting or expiry.
- Vercel platform-error customization is **Enterprise-only** according to the
  documentation checked on 2026-09-10. On the current Hobby plan, adding `500.html`
  does **not** replace platform timeouts, throttling, firewall or infrastructure errors.
- With an eligible platform integration, a corresponding static error page is
  selected, with `500.html` as the platform fallback. Future application responses
  should serve the correct document **with the original error status**, not redirect
  to a success response. APIs should continue returning their API error format.
- Offline browser navigation failures cannot be replaced by static HTML without
  a service worker. The connection notice only handles a page that already loaded.
- Existing viewer validation/storage errors retain their current flow. Client
  exceptions are not automatically classified as HTTP 500 errors.

References: [Vercel static 404](https://vercel.com/kb/guide/custom-404-page),
[platform error pages and plan eligibility](https://vercel.com/docs/custom-error-pages).

## Recovery and privacy

All pages offer a normal `/` link. Temporary failures (408/429/500/502/503/504)
also offer a user-triggered reload; never auto-reload or send a repeating request.
Offline reload clicks keep the page visible. No fake login or support actions.
No promise that unsaved work is safe. The page does not read or write draft storage.

Inline CSS/SVG and a system font need no asset/CDN requests. Navigation works with
JavaScript disabled. No analytics, session recording, external requests, request
URLs, exception stacks or invitation contents are included. `noindex, nofollow`
avoids indexing error documents; `no-referrer` prevents onward referrer disclosure.
These controls do not remove normal infrastructure access logs.

## Verification and deployment checklist

Local browser checks: all 11 variants at 320/390/768/1440px; no horizontal overflow;
48px actions; home navigation; keyboard skip link; offline/reconnection; manual
reload; no-JS primary actions; no external requests; no query reflection. Screenshots
are saved under `output/playwright/error-*.png`. Palette text contrast >= 4.5:1.

After deployment (not claimed by local tests):

1. Request a unique missing nested path and verify HTTP **404** and branded HTML.
2. Confirm `/`, `/viewer.html`, `/assets/app.js` and existing birthday URLs still resolve.
3. Open the 11 explicit preview URLs on mobile and desktop. Confirm no analytics requests.
4. Do not induce a production outage to test 5xx. Once a supported error integration
   exists, test controlled failures in Preview and verify original HTTP statuses.

Real iOS/Android, real Vercel 404 routing and platform 5xx substitution remain
separate deployment/device checks. This feature was locally verified, not deployed.
