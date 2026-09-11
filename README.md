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
- Optional GA4 and PostHog analytics

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

The admin service runs separately from the public server and is excluded from the public static build. It also requires `MONGODB_URI` and `MONGODB_DB` for the database you want to manage.

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

## Analytics

GA4 requires a valid Measurement ID and enabled configuration in `assets/analytics-config.js`. Local and preview hosts do not send events by default. See [analytics documentation](docs/analytics.md) for configuration and privacy boundaries.

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

`build:public` copies public root HTML and `assets/` into `public/`. Admin files and architecture documentation are excluded.

## Documentation

- [Architecture review (Korean)](docs/architecture/README.md): boundaries and refactoring progress
- [Archify diagram guide (Korean)](docs/architecture/archify/README.md): installation, source, regeneration, and validation
- [Publishing](docs/publishing.md): API and MongoDB operations
- [Analytics](docs/analytics.md): GA4/PostHog configuration
- [Design](DESIGN.md): editor and template conventions

## Maintenance

- Keep normalization and rendering rules centered on `assets/invitation-core.js`.
- Preserve separate authentication flows for public publishing and administration.
- Use response DTOs instead of returning raw database documents.
- Keep examples in documentation or isolated fixtures, outside the public root.
- Validate public publishing, administration, and packaging after structural changes.
- Update both READMEs together when commands, configuration, or supported features change. Keep diagram sources shared under `docs/` to avoid duplicate maintenance.
