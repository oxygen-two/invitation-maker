# SEO

This is a separate document rather than a section of `docs/publishing.md` because it answers a different question for a different reader. Publishing's docs are about the API contract and expiry mechanics for people integrating with or operating the publishing feature; this document is about how the *site* is found and what deliberately stays unfindable — relevant to anyone touching `robots.txt`, `sitemap.xml`, the landing page's `<meta>` tags, or the noindex behavior on published invitations, none of which has anything to do with the publishing API's request/response contract.

## What is indexable, and what is not

The landing page (`/`), the guide (`/guide`) and the studio (`/studio`) are indexable; `/sample` carries `noindex`.

`robots.txt`:

```
User-agent: *
Allow: /
Disallow: /i/
Disallow: /api/

Sitemap: https://invitation-maker-one.vercel.app/sitemap.xml
```

`sitemap.xml` lists three URLs — the landing page, the guide, and the studio — with `changefreq: monthly` and priorities `1.0`, `0.7`, and `0.8` respectively. `/sample` is deliberately absent from the sitemap: it is a generated demo page (see [`docs/landing-and-guide.md`](landing-and-guide.md)), not a page meant to rank on its own, and its own `<meta name="robots" content="noindex">` keeps a crawler that finds it anyway from indexing it. There is no per-invitation sitemap and there should never be one.

## Why published invitations stay noindex

`/i/{id}` pages carry real names, dates, venues, and phone numbers that a guest chose to share with the people they invited — not with a search engine. Keeping them out of search results is a deliberate privacy decision, enforced in two independent places so a single oversight can't undo it:

1. **`robots.txt`** disallows the `/i/` path as a crawling instruction (a well-behaved crawler won't even fetch the page).
2. **`shared.html`** carries `<meta name="robots" content="noindex">`, and the publishing API responds to `GET /api/invitations/:id` with an `x-robots-tag: noindex` header (`server/http.cjs`). This is the layer that actually matters: `robots.txt` only asks a crawler not to *visit* a disallowed path, but a search engine that already has a link to a specific `/i/{id}` from somewhere else could still choose to index the page it fetches. The per-page `noindex` signal tells it not to, regardless of how it got there.

`tests/social-preview.test.js` asserts `shared.html` still contains the `noindex` meta tag, and `tests/publishing-server.test.js` asserts the live API response carries the `x-robots-tag` header. Both exist so this decision can't be quietly reverted by an edit that "cleans up" a meta tag or a response header without realizing what it was protecting — if you're reading this because one of those tests just failed on a change you made, that's the test working as intended, not a false positive to silence.

## Building the static files into `public/`

`scripts/build-public.cjs` copies `robots.txt` and `sitemap.xml` (alongside the root HTML files and `assets/`) into `public/`, which is what Vercel actually serves. Before this was added, both files existed at the repository root but 404'd in production because the build never copied them — a crawler requesting `/robots.txt` on the deployed site got a 404 instead of the file. `npm run build:public` (and the `verify` job in `.github/workflows/ci.yml`, which runs it on every push/PR) is what to check if either file ever appears to work locally but not in production again.

## Search Console / Search Advisor verification

The landing page carries verification meta tags for both engines active in this project's target market:

```html
<meta name="google-site-verification" content="...">
<meta name="naver-site-verification" content="...">
```

Both are in `index.html`'s `<head>`. Do not remove or "clean up" either tag without deliberately re-verifying ownership in the corresponding console first — removing the tag silently drops verification, and with it any reporting on indexing status, search queries, or crawl errors for that engine. Verified with both **Google Search Console** and **Naver Search Advisor**; the sitemap has been submitted to Google, and the landing page is indexed.

## Open Graph / Twitter card metadata

`index.html` also carries static Open Graph and Twitter card tags (title, description, image, locale) for link previews on the landing page. This is a separate concern from search indexing — see [`docs/social-preview.md`](social-preview.md) for the image, its regeneration script, and how to verify a pasted link's preview card. Published invitations are not covered by this metadata; a `noindex`, unlisted page deliberately has no public preview card of its own.

## Verification

```sh
npm run build:public
```

Confirm `public/robots.txt` and `public/sitemap.xml` exist afterward and match the repository-root originals. Live deployment behavior — actual crawl/index status, Search Console/Search Advisor coverage reports, and rendered social previews — must be checked against the deployed site, not inferred from a local build.
