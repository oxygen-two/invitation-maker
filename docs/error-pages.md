# Error pages

## Files and maintenance

Root `400.html`, `401.html`, `403.html`, `404.html`, `408.html`, `410.html`,
`429.html`, `500.html`, `502.html`, `503.html`, `504.html` are standalone,
generated static documents. Their copy lives in the `errorPages` namespace of
`assets/i18n/dictionary-ko.js` and `assets/i18n/dictionary-en.js`, which
`scripts/build-error-pages.cjs` requires. So a wording change is: edit the
dictionary, regenerate, commit the HTML. Edit the generator only for markup,
CSS or behaviour. Then run:

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

## Language

Korean is what the server sends. `<html lang="ko">` and every sentence in the
markup are Korean, so a visitor with JavaScript disabled, a crawler, or a
browser that fails to run the inline script still reads a real page.

Both languages travel inside each document, because an error page is the moment
when fetching `assets/i18n/i18n.js` and a dictionary is least likely to work:

- `<script type="application/json" data-error-copy>` holds one record per
  language for that status — eyebrow, title, description, hint, action, the
  reload label where there is a reload button, and the shared header, footer,
  skip-link and offline lines.
- `<script data-error-lang>` in `<head>` repeats the resolution rules of
  `assets/i18n/i18n.js`: `?lang`, then `localStorage["invitation-maker.language"]`,
  then `navigator.languages`, then `ko`. It runs before anything is painted and
  sets `<html lang>` and `<html data-error-lang>` to what it resolved.
- A second inline script at the end of `<body>` applies that language: it sets
  `document.title` and the text of every `[data-error-text]` node and the
  `aria-label` of every `[data-error-label]` node. Text is set as text
  (`textContent`), never as markup.

Two privacy notes follow from reading those signals. The query string is read
for one allow-listed value (`lang`, matched against `ko`/`en`); nothing from the
URL is ever written into the document, so a crafted link still cannot put text
on the page. And an error page reads the stored language but never writes it:
it is not the place to record a decision about anything.

The `<noscript>` reload hint is Korean only, by construction — a visitor without
JavaScript cannot have been switched to English in the first place.

Adding a language means adding it to `LOCALES` in `assets/i18n/i18n.js`, adding
the dictionary, extending `supported` in the generator's resolver, and
regenerating. `tests/error-pages.test.js` checks that both shipped languages
reach every page and that `--check` passes on the committed output; CI runs
`git diff --exit-code` after the build, so stale HTML fails there too.

## Colour scheme

The pages answer `prefers-color-scheme`. Light is the studio's warm paper
(`#f7f7f4` on `#282b29`, green `#314e41`); dark swaps the same tokens to a
`#15181a` surface with `#e9ede9` ink and lightens the accent to `#9ec9ab`,
because `#314e41` reads as black on a dark ground. The envelope illustration's
fills are SVG presentation attributes, so the dark rules override them by class
(`.env-back`, `.env-card`, `.env-flap` and the rest). `theme-color` is declared
twice, once per scheme. The site-chrome dark-mode work deliberately excludes
these documents; their whole palette lives in the generator.

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

Inline CSS/SVG/JSON and a system font need no asset/CDN requests. Navigation works
with JavaScript disabled. No analytics, session recording, external requests,
request URLs, exception stacks or invitation contents are included; the only
query parameter read is `lang`, and it is matched against an allow-list rather
than reflected. `noindex, nofollow` avoids indexing error documents;
`no-referrer` prevents onward referrer disclosure. These controls do not remove
normal infrastructure access logs.

## Verification and deployment checklist

Local browser checks: all 11 variants at 320/390/768/1440px; no horizontal overflow;
48px actions; home navigation; keyboard skip link; offline/reconnection; manual
reload; no-JS primary actions; no external requests; no query reflection; the
language a browser resolves and the language `?lang=` forces; no storage writes.
Screenshots are saved under `output/playwright/error-*.png`. Text contrast >= 4.5:1
in both colour schemes.

After deployment (not claimed by local tests):

1. Request a unique missing nested path and verify HTTP **404** and branded HTML.
2. Confirm `/`, `/viewer.html`, `/assets/studio/app.js` and existing birthday URLs still resolve.
3. Open the 11 explicit preview URLs on mobile and desktop. Confirm no analytics requests.
   Check one of them from a non-Korean browser and confirm it reads in English.
4. Do not induce a production outage to test 5xx. Once a supported error integration
   exists, test controlled failures in Preview and verify original HTTP statuses.

Real iOS/Android, real Vercel 404 routing and platform 5xx substitution remain
separate deployment/device checks. This feature was locally verified, not deployed.
