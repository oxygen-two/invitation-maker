# Social link preview

The homepage has static Open Graph and Twitter card metadata, with an absolute
HTTPS PNG URL. No SDK, credentials, cookies or JavaScript execution is needed by
the crawler. The image is a 1200×630 public brand graphic, not invitation content.

Regenerate the checked-in PNG with installed Chrome and Playwright:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node scripts/build-social-preview.cjs
node --test tests/social-preview.test.js
```

The source uses system fonts; regeneration on a different OS may change typography.
No production build step is required. Change the versioned image filename and all
metadata references when replacing an image to avoid stale image caches.

After deployment, request `/` with the Kakao/Facebook crawler user agent and
verify the metadata is present in raw HTML. The image URL must return 200 with
`Content-Type: image/png`, without authentication or crawler challenges.
UTM URLs use the homepage canonical/og:url so they share one public card.

Existing previews can remain cached. Use Kakao Developers' OG cache reset and
Facebook Sharing Debugger's Scrape Again after deployment. An existing message
may keep its earlier card; test a newly pasted link. Do not post to real contacts
or social feeds as part of automated verification.

References:
- https://developers.kakao.com/docs/ko/message-template/faq
- https://devtalk.kakao.com/t/scrap-url/116202
- https://developers.facebook.com/tools/debug/

Scope: homepage service sharing only. IndexedDB viewer links cannot expose local
data to social crawlers. Individual invitation previews require a public HTML URL
with its own static/server-rendered metadata and a publicly accessible image.
Actual Kakao/Facebook card rendering and cache refresh are separate from local
metadata/image checks and must not be reported as verified without observing them.
