# Invitation Maker

[English](README.md) | [한국어](README.ko.md)

A static-first invitation editor with live previews, standalone HTML downloads, and optional public sharing. Drafts stay in the browser; publishing stores a normalized invitation snapshot in MongoDB.

## Features

- Occasion-based templates for birthdays, weddings, anniversaries, and events
- Live preview and standalone HTML downloads with embedded photos
- IndexedDB storage for drafts and the local invitation library
- Anonymous publishing with random Base62 public IDs
- Public invitation viewing and owner-token deletion
- A separate local admin service for search, pagination, details, and revocation
- Korean and English studio, viewer, and admin UI, with dependency-free `Intl`-backed date/number formatting
- Optional GA4 and PostHog analytics
- Landing page indexed by search engines; published invitations deliberately are not

## Architecture

![Invitation Maker architecture — Korean labels](docs/architecture/archify/system.visual-check.2048x1320.light.png)

[Interactive Archify diagram](docs/architecture/archify/system.html) · [JSON source and regeneration instructions (Korean)](docs/architecture/archify/README.md)

The diagram currently uses Korean labels. Download the HTML and open it in a browser to use the interactive viewer.

```text
invitation-maker/
├── index.html + assets/   # Editor
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

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). To preview only the static editor:

```bash
python3 -m http.server 4173
```

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

Publishing returns `/i/{base62-id}`. Per-IP hourly, daily, and lifetime quotas limit publication volume. A publication expires on a sliding window: `PUBLISH_IDLE_WINDOW_DAYS` (default 7) after its last view, never later than `PUBLISH_MAX_LIFETIME_DAYS` (default 30) after publication. The database never deletes anything on its own — expiry is a marker the read path enforces, so an expired link answers `404` while the record stays stored for an operator or a batch deletion job.

See [publishing documentation](docs/publishing.md) for authentication headers, limits, retry rules, and deployment configuration.

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

## Analytics

GA4 requires a valid Measurement ID and enabled configuration in `assets/analytics/config.js`. Local and preview hosts do not send events by default. See [analytics documentation](docs/analytics.md) for configuration and privacy boundaries.

## SEO

Only the landing page is meant to be indexed. `robots.txt` allows `/` and disallows `/i/` and `/api/`; `sitemap.xml` lists just the landing page. Published invitations (`/i/{id}`) stay `noindex` — via `shared.html`'s meta tag and the API's `x-robots-tag` header — because they carry real names, dates, venues, and phone numbers a guest shared with their invitees, not with a search engine. A test asserts the `noindex` tag stays in place so this can't be quietly reverted. The landing page carries Google Search Console and Naver Search Advisor verification tags and its sitemap has been submitted to Google. See [SEO documentation](docs/seo.md) for the full reasoning and the build step that ships `robots.txt`/`sitemap.xml` to production.

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

`.github/workflows/ci.yml` runs on every push to `main` and every pull request: a `verify` job runs `npm test` and `npm run build:public` on Node 22 and asserts the build left tracked files unchanged, and a `publishing-mongo` job runs `npm run verify:publishing-mongo` against a real `mongo:7` service container. There was no CI before this.

## Documentation

- [Architecture review (Korean)](docs/architecture/README.md): boundaries and refactoring progress
- [Archify diagram guide (Korean)](docs/architecture/archify/README.md): installation, source, regeneration, and validation
- [Publishing](docs/publishing.md): API and MongoDB operations
- [i18n](docs/i18n.md): dictionary structure, language resolution, and the authored-vs-chrome translation rule
- [SEO](docs/seo.md): indexing, `noindex` on published invitations, and Search Console/Search Advisor verification
- [Analytics](docs/analytics.md): GA4/PostHog configuration
- [Design](DESIGN.md): editor and template conventions

## Maintenance

- Keep normalization and rendering rules centered on `assets/invitation/core.js`.
- Preserve separate authentication flows for public publishing and administration.
- Use response DTOs instead of returning raw database documents.
- Keep examples in documentation or isolated fixtures, outside the public root.
- Validate public publishing, administration, and packaging after structural changes.
- Update both READMEs together when commands, configuration, or supported features change. Keep diagram sources shared under `docs/` to avoid duplicate maintenance.
