# Anonymous publishing

This feature adds a small Node.js API to the existing HTML/CSS/JS maker. It stores a normalized invitation snapshot, including Base64 photos, in MongoDB. There is no build step for the maker, no account requirement, and no object storage dependency.

## Responsibilities

- `assets/app.js` owns the existing editor and supplies its value, validation, and busy state to the publishing client.
- `assets/publishing.js` owns requests, publish status, link copying, and the browser's private publication records.
- `shared.html` and `assets/shared-invitation.js` fetch a public snapshot and render it using the existing invitation renderer in a sandboxed frame.
- `server/` owns configuration, server-side input validation, HTTP routing, and MongoDB persistence. Database code does not access the DOM; frontend code never receives a database connection string.
- `api/` adapts the same API implementation to Vercel. A static Python server still previews the maker, but cannot publish invitations. Vercel runs `npm run build:public` to copy public assets into `public/`; this is deployment packaging, not a frontend framework build.

Keep the existing renderer as the source of invitation output. Do not duplicate template HTML in the API. If object storage is added later, change the publication asset boundary and retain the standalone HTML export's embedded-photo behavior.

## Public and private identifiers

A public link looks like `/i/<22-character random Base62 id>`. Anyone with the link can read the invitation. A separate random management token authorizes deletion. It never appears in the share URL, public response, or analytics events.

The browser durably saves the token and retry identity before sending a publication request. Where supported, Web Locks serialize publication management across tabs; avoid concurrent management from multiple tabs on older browsers without Web Locks. If storage is unavailable, publication is blocked. This prevents a successful anonymous publication whose deletion credential was never saved. Clearing browser data loses access to that browser's management records; there is no account recovery in this version.

Publishing creates a snapshot. Editing a local draft does not change a previously published invitation. To share new content, create a new link and cancel the old publication if appropriate.

## API

`POST /api/invitations` accepts `{ "invitation": { ... } }`, with a UUID `Idempotency-Key` header and an `Authorization: Bearer <management-token>` header. The management token is 32 random bytes encoded as unpadded Base64url. Success returns `{ "id": "...", "url": "/i/...", "expiresAt": null }` (or an ISO expiry timestamp).

A retry must reuse the same content, management token, and idempotency key. Do not generate a new key simply because a response was lost. A reused identity with different content is rejected.

`GET /api/invitations/:id` returns only `{ "invitation": { ... }, "expiresAt": null }`. Reads check expiry before returning content. No public listing endpoint is provided.

`DELETE /api/invitations/:id` requires the management token and returns HTTP 204 on success. Cancellation removes the remotely stored snapshot; a recipient's already downloaded HTML cannot be recalled.

## Cost and expiry policy

The request body and stored normalized invitation are each limited to **2,000,000 UTF-8 bytes**, including embedded images. Existing editor image compression remains in use. If the total is too large, reduce photos or their size before publishing. Do not silently discard photos to meet the limit.

The initial server defaults allow 10 successful publications per IP per hour, 100 per service per day, and 1,000 cumulative successful publications. Limits are enforced by MongoDB atomic operations, not process-local memory. The cumulative cap is deliberately conservative: cancellation and expiry do not refund it. An operator must review usage before increasing it. This bounds published payload storage conservatively; database indexes, operational records, backups, and traffic are additional usage.

### Sliding expiry

A publication expires on a sliding window with a hard ceiling:

- Publishing stamps an expiry `PUBLISH_IDLE_WINDOW_DAYS` (default 7) ahead.
- Every successful public read of `GET /api/invitations/:id` pushes the expiry to `now + idle window`.
- The expiry is never pushed past `createdAt + PUBLISH_MAX_LIFETIME_DAYS` (default 30). The ceiling is computed from the stored publication time, never from a client-supplied value.

```
D+0   published            expires D+7
D+5   viewed               expires D+12
D+25  viewed               expires D+30   (capped by the 30-day ceiling)
D+30  deleted
never viewed again         deleted one idle window after the last view
```

An invitation that keeps getting opened stays alive for up to a month; one nobody opens disappears a week after its last view. `PUBLISH_MAX_LIFETIME_DAYS=0` disables expiry entirely. `PUBLISH_IDLE_WINDOW_DAYS=0` disables the sliding behaviour and leaves a plain `createdAt + max lifetime` TTL, which is how the retired `PUBLISH_TTL_DAYS` setting used to behave.

Reads refresh the expiry with a single atomic, monotonic update, and only when the new value is more than `PUBLISH_EXPIRY_REFRESH_HOURS` (default 6) beyond the stored one. A busy invitation therefore costs at most a few writes per day, not one per view. A read that is already past its expiry returns `410` and is never revived; a record already past its ceiling is served as-is and never shortened by a read. The refresh is bookkeeping: if the write fails, the read still returns the invitation with its stored expiry.

Administrator reads never extend anything. The admin service uses a separate read-only repository (`admin/storage/mongo-publications.cjs`), so an operator opening a record in the publication manager cannot keep it alive.

A MongoDB TTL index on `expiresAtDate` cleans up expired records in the background; immediate access expiry is enforced by the API and does not depend on that cleanup task.

### Backfilling records published before this policy

Publications created earlier have `expiresAtDate: null` and would live forever. `node scripts/backfill-expiry.cjs` gives them an expiry. It defaults to a dry run, refuses non-loopback MongoDB hosts unless `PUBLISH_BACKFILL_ALLOW_REMOTE=1` is set, and requires `--apply` to write. It never deletes: it only sets `expiresAt`/`expiresAtDate` and lets the TTL index do the removal.

Records whose `createdAt` is already older than the ceiling would be deleted the instant their honest expiry was written. Those get `now + idle window` instead, so a link shared today still works for a week; the dry-run summary reports that grace bucket separately, along with the total scanned, the records that already had an expiry, and the records newly given one. Records with no usable `createdAt` are treated the same way. Re-running the script is safe: records that already have an expiry are left untouched.

Do not trust arbitrary client-supplied forwarded-IP headers. Configure trusted proxy behavior only for a deployment that overwrites those headers and prevents direct bypass of that proxy.

## Deployment boundary

MongoDB Atlas needs a full server-side connection string, a dedicated database user, and network access from the API host. The hostname supplied during planning is not sufficient to authenticate. Keep credentials in deployment environment variables or a local ignored `.env`; never in HTML, browser scripts, screenshots, or committed files.

The API must be available on the same origin as the maker and `/i/` viewer. On Vercel this is handled by the function adapter and rewrite configuration. On a standalone Node host the Node server serves the public site and API together; use HTTPS at the reverse proxy for browser cryptography and clipboard support.

Do not interpret a local MongoDB test as verification of Atlas credentials, production access rules, or a deployed function. Those are separate deployment checks.

## Local development

Use Node.js 22 or newer. Install the lockfile dependencies with `npm ci`. Copy `.env.example` to a local `.env`, supply a development `MONGODB_URI`, then run `npm start`. The default address is `http://127.0.0.1:4173`.

The publication manager is a separate local Node service and is not included in the Vercel/public build. Set `ADMIN_PASSWORD` in the ignored `.env`, then run `npm run admin`. Open `http://127.0.0.1:4174/admin` (or the configured host and port). The manager supports login, paginated publication listing, ID search, details, public links, and administrator revocation. Sessions are held in memory and end when the process restarts. If the service is reachable from another device, put it behind HTTPS before using a real password.

| Variable | Default | Meaning |
| --- | --- | --- |
| `MONGODB_URI` | unset | Server-only MongoDB connection string; missing means publication is unavailable. |
| `MONGODB_DB` | `invitation_maker` | Dedicated invitation database. |
| `PUBLISH_MAX_BYTES` | `2000000` | Server byte cap; the browser also enforces the 2MB product limit. |
| `PUBLISH_TTL_DAYS` | `0` | No automatic expiry when zero; otherwise expiry after this many days. |
| `PUBLISH_RATE_LIMIT_PER_HOUR` | `10` | Per-client publication rate ceiling. |
| `PUBLISH_TOTAL_DAILY_LIMIT` | `100` | Service-wide daily publication ceiling. |
| `PUBLISH_LIFETIME_LIMIT` | `1000` | Cumulative publication ceiling, not restored on deletion. |
| `PUBLISH_ALLOWED_ORIGIN` | unset | Set the exact HTTPS maker origin in production, especially behind a TLS-terminating proxy. |
| `PUBLISH_TRUST_PROXY` | `false` | Only enable behind a trusted proxy that controls forwarded client-IP headers. |
| `HOST` / `PORT` | `127.0.0.1` / `4173` | Standalone listener. |
| `ADMIN_PASSWORD` | unset | Required for `npm run admin`; never commit it. |
| `ADMIN_HOST` / `ADMIN_PORT` | `0.0.0.0` / `4174` | Admin listener. |
| `ADMIN_SESSION_TTL_MS` | `28800000` | In-memory session lifetime (8 hours). |
| `ADMIN_PAGE_SIZE` | `20` | Default admin list page size; requests are capped at 100. |
| `PUBLIC_BASE_URL` | unset | Optional base URL used for links shown in the admin screen. |

Run `npm test` for unit and HTTP checks. `node scripts/verify-publishing-mongo.cjs` tests actual MongoDB persistence using a separate disposable test database; use a local development MongoDB connection. Run the browser scripts with a running API and an existing Playwright installation:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node scripts/verify-publishing.cjs
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node scripts/verify-studio.cjs
```

`INVITATION_BASE_URL` changes the browser target. The publishing browser script creates and deletes real test publications, so run it only against a disposable local/test deployment. Screenshots are written under `output/playwright/publishing/`.

The API's 2MB JSON read response avoids sending duplicated standalone HTML through a serverless function. Rendering the standalone document happens in the recipient browser. Actual expiry and cancellation checks still happen on the server.

Reference: [MongoDB TTL indexes](https://www.mongodb.com/docs/manual/core/index-ttl/) explains delayed background cleanup; [Vercel function limits](https://vercel.com/docs/functions/limitations#request-body-size) documents the 4.5MB request/response ceiling.
