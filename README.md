# Invitation Maker

[English](README.md) | [한국어](README.ko.md)

A static-first invitation editor with live previews, standalone HTML downloads, and optional public sharing. Drafts stay in the browser; publishing stores a normalized invitation snapshot in MongoDB.

## Features

- Occasion-based templates grouped as celebrate / milestone / family / gather, covering birthdays, weddings, anniversaries, baby showers, graduations, housewarmings, and other events
- Live preview and standalone HTML downloads with embedded photos, with lean font loading — only the two families an invitation actually uses, plus system-font fallbacks per script
- A real date/time picker with time-zone selection, locale-aware date formatting (including English regional variants), and a downloadable `.ics` calendar file
- IndexedDB storage for drafts and the local invitation library
- Anonymous publishing with random Base62 public IDs, a QR code, the system share sheet, and a copyable invitation message
- Public invitation viewing and owner-token deletion
- A separate local admin service for search, pagination, details, and revocation
- Korean and English studio, viewer, and admin UI, with dependency-free `Intl`-backed date/number formatting and dark mode for the site chrome
- Optional GA4 and PostHog analytics, inert until the visitor accepts the consent banner
- Privacy policy and terms pages at `/privacy` and `/terms`, translated like the rest of the site chrome — the pages name the operator and a contact address (see [Legal pages](#legal-pages))
- Landing page indexed by search engines; published invitations deliberately are not

## Architecture

![Invitation Maker architecture — Korean labels](docs/architecture/archify/system.visual-check.2048x1320.light.png)

[Interactive Archify diagram](docs/architecture/archify/system.html) · [JSON source and regeneration instructions (Korean)](docs/architecture/archify/README.md)

The diagram currently uses Korean labels. Download the HTML and open it in a browser to use the interactive viewer.

```text
invitation-maker/
├── index.html / guide.html   # Landing page and user guide
├── studio.html + assets/   # Editor
├── shared.html           # Public invitation viewer
├── api/ + server/        # Publishing API
├── admin/                # Local admin service
├── public/               # Generated deployment assets
└── docs/                 # Documentation and diagram sources
```

See the [architecture review (Korean)](docs/architecture/README.md) for current boundaries and refactoring progress. The planned refactor has fully landed — all five steps are complete. [Mermaid sources](docs/architecture/diagrams/) and [Archify JSON](docs/architecture/archify/system.architecture.json) are kept under `docs/`.

## Quick start

Requires Node.js 22 or later.

```bash
npm ci
cp .env.example .env
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). `/` is the landing page; the editor is at `/studio` (a browser that has opened the studio is sent there automatically).

To preview only the static files, with no server-side routing:

```bash
python3 -m http.server 4173
```

Open `/studio.html` directly (and `/index.html?welcome` for the landing page) — plain static serving has no clean URLs, and `/` redirects a browser that has already visited the studio straight to `/studio`.

`npm start`, `npm run admin`, `npm run dev`, and `npm run dev:admin` are all local-developer commands — none of them run in production. Production never runs `server/index.cjs`; it deploys through `api/*.js` serverless functions and `scripts/build-public.cjs`, configured entirely from Vercel's environment variables. For a second local config (e.g. a different local database), copy `.env.example` to `.env.dev` and run `npm run dev` (or `npm run dev:admin`) — `npm start`/`npm run admin` keep loading `.env` unchanged. Both `.env` and `.env.dev` should point at your own machine; both entry points print the database name and host they connect to at startup, and warn loudly if that host isn't loopback.

## Studio experience

The preview renders in a `srcdoc` iframe rather than being injected into the page: the invitation's own headings stay out of the studio's outline, and the preview runs the exact standalone document a guest receives, so it can never silently drift from the actual export. It stays visible while scrolling a long form. The three stages (gallery, edit, finish) share one layout so moving between them doesn't reflow the page. Finishing an invitation offers three peer choices — save to the browser's local library, save to an HTML file, or share a public link — the latter two opening a dialog that explains what you're getting: the local library survives only in this browser, and a published link outlives the browser while the token that can revoke it does not.

## Language

The studio, the shared/public viewer, and standalone downloads support Korean and English with no library or bundler — a dictionary under `assets/i18n/` plus `data-i18n` attributes. Language resolves from an explicit `?lang=` override, then a stored choice, then the visitor's own browser preference, defaulting to Korean; `<html lang>` and generated/sample dates (via `Intl`) follow it. **An invitation's authored content is never translated — only the chrome around it is.** A guest with an English browser opening a Korean invitation's public link sees English loading/error text around an invitation still entirely in the Korean it was written in; a standalone download bakes its chrome in whatever language was active at export time. See [i18n documentation](docs/i18n.md) for the dictionary structure, how to add a language, and the full authored-vs-chrome rule.

## Public publishing

Set your MongoDB connection in the ignored `.env` file:

```dotenv
MONGODB_URI=mongodb://...
MONGODB_DB=invitation_maker
PUBLISH_ALLOWED_ORIGIN=http://127.0.0.1:4173
```

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/invitations` | Publish a normalized snapshot |
| `GET` | `/api/invitations/:id` | Read a public invitation |
| `DELETE` | `/api/invitations/:id` | Revoke with the owner's management token |

The publish payload carries an optional `language` (the author's studio language when they pressed Publish; `ko` or `en`, defaulting to `ko`), and the read response always echoes it back beside the invitation — see [i18n documentation](docs/i18n.md#published-shared-link-invitations-chrome-and-content-follow-different-people). Publishing returns `/i/{base62-id}`. Per-IP hourly, daily, and lifetime quotas limit publication volume. A publication expires on a sliding window — `PUBLISH_IDLE_WINDOW_DAYS` (default 7) after its last view, capped at `PUBLISH_MAX_LIFETIME_DAYS` (default 30) after publication — except that an invitation carrying a `dateTime` also stays open until `PUBLISH_EVENT_GRACE_DAYS` (default 7) after that date, and **this event floor outranks both the sliding window and the 30-day ceiling**: a wedding invitation published two months ahead does not expire before the wedding. The event time only counts when it falls within `PUBLISH_MAX_EVENT_LEAD_DAYS` (default 400) of publication. The database never deletes anything on its own — expiry is a marker the read path enforces, so an expired link answers `404` while the record stays stored for an operator or a batch deletion job.

See [publishing documentation](docs/publishing.md) for authentication headers, limits, retry rules, and deployment configuration.

## AI assistant (MCP server)

`POST /mcp` is a stateless [Model Context Protocol](https://modelcontextprotocol.io) server (Streamable HTTP, JSON responses). Add `https://<your-domain>/mcp` as a custom connector in Claude.ai, Claude Code (`claude mcp add --transport http invitation-maker https://<your-domain>/mcp`), ChatGPT, or Cursor, then ask for an invitation in one line, e.g. "23일 17시 선릉 돈그리아 초대장".

| Tool | What it does |
| --- | --- |
| `list_occasions` | Occasions and design templates, named in `ko` or `en` |
| `draft_invitation` | Asks Claude Opus 5 for a structured draft; returns `ready` or `needs_info` with the questions to ask |
| `publish_invitation` | Publishes a ready draft (`confirmed: true` required) and returns the link plus a management token |
| `revoke_invitation` | Takes a link down with that token |

The server keeps no conversation state: the host passes the previous `draft` back with the user's `answers`. Publishing goes through the same use-case, validation, expiry and quotas as the studio. Drafting has its own quota (`ASSISTANT_RATE_LIMIT_PER_HOUR` per client IP, `ASSISTANT_TOTAL_DAILY_LIMIT` service-wide) stored in the same Mongo counters. Hosted clients such as Claude.ai reach the server from shared IPs, so the daily cap is the real cost guard. Production must set `PUBLIC_BASE_URL` (or `PUBLISH_ALLOWED_ORIGIN`) — the MCP server never trusts the request `Host` header for the published link; without either, `publish_invitation` returns a relative `/i/<id>` url.

```dotenv
ANTHROPIC_API_KEY=sk-ant-...
ASSISTANT_MODEL=claude-opus-5
ASSISTANT_RATE_LIMIT_PER_HOUR=20
ASSISTANT_TOTAL_DAILY_LIMIT=300
PUBLIC_BASE_URL=https://<your-domain>
```

Without `ANTHROPIC_API_KEY` the `draft_invitation` tool answers `ASSISTANT_UNAVAILABLE`; the other tools keep working. Without `MONGODB_URI` every tool answers `REPOSITORY_UNAVAILABLE`, exactly like the publishing API. `npm run smoke:assistant -- "<request>"` runs one real draft against the model (costs money, never publishes). Design: `docs/superpowers/specs/2026-09-23-invitation-assistant-mcp-design.md`.

## Local administration

The admin service runs separately from the public server and is excluded from the public static build. It also requires `MONGODB_URI` and `MONGODB_DB` for the database you want to manage. `admin/public/` (its HTML/CSS/JS) is committed to Git — `.gitignore`'s `public/` rule used to match at every depth, so this directory was silently untracked and a fresh clone got an admin server with no pages; the rule is now anchored to `/public/` so only the build output at the repository root is ignored.

Set `ADMIN_PASSWORD` in your ignored `.env`, then run:

```bash
npm run admin
```

Open [http://127.0.0.1:4174/admin](http://127.0.0.1:4174/admin). `npm run dev:admin` reads `.env.dev` instead, for a separate local config. Either file can be pointed at a remote database when you deliberately need to operate on one — the admin service prints a loud warning at startup when `MONGODB_URI` isn't loopback, since revocations there affect real data.

- Password login with an in-memory session
- Search by publication ID or title
- Server pagination with a page size of 1–100
- Publication details, public links, and administrator revocation

`ADMIN_HOST` defaults to `0.0.0.0`. Use HTTPS when accessing the service across a network. Restarting the process clears sessions. Set `PUBLIC_BASE_URL` to the public site's origin when managing a remote deployment.

The session cookie only carries `Secure` when the request is actually HTTPS. A direct TLS connection is detected automatically, but a proxy that terminates TLS in front of the admin service (as Cloudtype does) is invisible to it — the only signal is the `x-forwarded-proto` header, which is spoofable and therefore ignored unless you opt in. **Set `ADMIN_TRUST_PROXY=true` when running behind such a proxy**, or the session cookie will be missing `Secure` and can be sent in the clear. It defaults to `false`, and the admin service prints a startup warning while it's off.

## Analytics and consent

GA4 requires a valid Measurement ID and enabled configuration in `assets/analytics/config.js`. Local and preview hosts do not send events by default.

Product analytics also wait for an explicit choice. `assets/site/consent.js` shows a banner until one is stored in `localStorage["invitation-maker.consent"]` as `"granted"` or `"denied"`; until then no provider SDK is fetched and every `track*` call returns `false`. Do Not Track and Global Privacy Control still force analytics off after an accept. Error diagnostics (`client_error`) are the single exception and keep running without consent — they carry closed enums, a shipped script path and a line number, and never authored content. See [analytics documentation](docs/analytics.md) for the gate, the `InvitationConsent` API and the privacy boundaries.

## Legal pages

> `privacy.html` and `terms.html` name the real operator (오재성) and contact address (rojae@kakao.com). The copy lives in the `site.privacy.*` and `site.terms.*` namespaces of `assets/i18n/dictionary-site-ko.js` and `assets/i18n/dictionary-site-en.js`, plus the matching inline Korean text in the two HTML files — change it in **all four** places if the operator or contact address ever changes, so `tests/site-pages.test.js` still matches.

The retention numbers the privacy and terms pages state — the 7-day idle window, the 30-day ceiling, and the event floor that keeps a dated invitation open until 7 days after it (bounded by a 400-day lead cap) — are read from the shipped defaults in `server/config/publishing.cjs` and described as defaults; `tests/site-pages.test.js` keeps the copy and the config in sync.

## Observability

Monitoring is implemented in three layers: scheduled synthetic checks, privacy-limited PostHog `client_error` events, and JSON server error logs. Run `npm run monitor:synthetic` for read-only production checks; scheduled failures create/update a GitHub issue and recovery closes it. The separate weekly publish cycle requires `SYNTHETIC_PUBLISH_OPT_IN` and spends one non-refundable publishing quota unit per successful run.

Browser reports respect the existing production-host and privacy gates. Server 5xx logs contain fixed route categories and generated request IDs, never raw errors or invitation content. Server logs remain in the hosting log system; external log retention and alert rules are not configured by this change. See [observability](docs/observability.md) for commands, boundaries, and coverage gaps.

## SEO

Only the site chrome is meant to be indexed. `robots.txt` allows `/` and disallows `/i/` and `/api/`; `sitemap.xml` lists the site's five indexable pages — landing, guide, studio, privacy, and terms. Published invitations (`/i/{id}`) stay `noindex` — via `shared.html`'s meta tag and the API's `x-robots-tag` header — because they carry real names, dates, venues, and phone numbers a guest shared with their invitees, not with a search engine. A test asserts the `noindex` tag stays in place so this can't be quietly reverted. The landing page carries Google Search Console and Naver Search Advisor verification tags and its sitemap has been submitted to Google. See [SEO documentation](docs/seo.md) for the full reasoning and the build step that ships `robots.txt`/`sitemap.xml` to production.

## Tests and build

```bash
npm test
npm run build:public
git diff --check
```

For integration checks against a disposable MongoDB test database:

```bash
npm run verify:publishing-mongo
```

`build:public` copies public root HTML and `assets/` into `public/`, including `robots.txt` and `sitemap.xml`. Admin files and architecture documentation are excluded.

For the mobile editor regression, start the local server and run `PLAYWRIGHT_MODULE=/absolute/path/to/playwright node scripts/verify-mobile-editor.cjs` with Chrome installed. It checks actual card/control boundaries in Korean and English at six widths (320–1440px), including controls hidden by ancestor clipping. Playwright remains an external QA tool, not a runtime dependency.

For invitation titles, run `PLAYWRIGHT_MODULE=/absolute/path/to/playwright node scripts/verify-hero-wrap.cjs` with Chrome installed; no local server is needed, since it builds each standalone document in memory. It asks the layout engine whether any word of a title was cut in half or spilled out of its box, measuring both places a title appears — the card's hero and the intro overlay — for every design against every shipped sample title, in Korean and English documents alike, at twelve widths from 320px to 1440px. Titles and documents are crossed deliberately: an export is `lang="ko"` whatever it is written in, so a Latin title in a Korean document is the ordinary case. `HERO_WRAP_MATRIX=1` prints the per-design table of sizes and box widths behind the result.

The landing/guide screenshots are generated, not hand-captured: `PLAYWRIGHT_MODULE=/absolute/path/to/playwright node scripts/build-site-media.cjs` drives the real `/studio` with Chrome and writes the images `docs/landing-and-guide.md` describes; `--check` only confirms each file exists and is a plausible size, it cannot detect that the studio chrome has drifted, so re-run the full command (not just `--check`) whenever studio chrome changes.

`.github/workflows/ci.yml` runs on every push to `main` and every pull request: a `verify` job runs `npm test` and `npm run build:public` on Node 22, re-checks the two committed generators (`node scripts/build-error-pages.cjs --check` and `node scripts/build-template-art.js --check`, both pure `node:fs` so neither needs a browser) and asserts the build left tracked files unchanged. That job runs twice, once with `TZ=UTC` and once with `TZ=America/Los_Angeles`: the suite does all its date work in UTC internally and the second leg is what fails if that ever stops being true. A `publishing-mongo` job runs `npm run verify:publishing-mongo` against a real `mongo:7` service container, then `npm test` again with `MONGODB_URI` set — the only place the three real-Mongo integration tests in `tests/publishing-server.test.js` actually execute. There was no CI before this.

## Documentation

- [Architecture review (Korean)](docs/architecture/README.md): boundaries and refactoring progress
- [Archify diagram guide (Korean)](docs/architecture/archify/README.md): installation, source, regeneration, and validation
- [Publishing](docs/publishing.md): API and MongoDB operations
- [i18n](docs/i18n.md): dictionary structure, language resolution, and the authored-vs-chrome translation rule
- [SEO](docs/seo.md): indexing, `noindex` on published invitations, and Search Console/Search Advisor verification
- [Analytics](docs/analytics.md): GA4/PostHog configuration, the consent gate, and the diagnostics exemption
- [Observability](docs/observability.md): synthetic checks, browser errors, server logs, and coverage limits
- [Mobile app plan (Korean)](docs/mobile-app-plan.md): app approach, code reuse, implementation stages, and release criteria
- [Design](DESIGN.md): editor and template conventions

## Maintenance

- Keep normalization and rendering rules centered on `assets/invitation/core.js`.
- Preserve separate authentication flows for public publishing and administration.
- Use response DTOs instead of returning raw database documents.
- Keep examples in documentation or isolated fixtures, outside the public root.
- Validate public publishing, administration, and packaging after structural changes.
- Update both READMEs together when commands, configuration, or supported features change. Keep diagram sources shared under `docs/` to avoid duplicate maintenance.
