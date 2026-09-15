# Observability

Three independent layers, in the order a failure is most likely to be caught: synthetic checks against the live site, privacy-limited browser error reports, and server error logs. They exist because the incidents this project has actually had did not throw exceptions — a UI that was never committed, an admin pointed at a database whose name did not match production and calmly reported zero of everything. Nothing crashed, nothing logged, and both were found by a person noticing something looked wrong. These checks assert what production *should* look like instead of waiting for it to throw. No new npm dependency was added for any of this.

## 1. Synthetic monitoring

`scripts/synthetic-monitor.cjs` runs eight read-only checks against a deployed origin and touches nothing: it never publishes, reads, or revokes a real invitation.

```bash
npm run monitor:synthetic
SYNTHETIC_ORIGIN=http://127.0.0.1:4173 npm run monitor:synthetic
```

`SYNTHETIC_ORIGIN` overrides the production origin baked into the script, which is how you point it at a local build or a preview deploy. Exit code is non-zero if any check fails.

The eight checks (see `scripts/synthetic/checks.cjs`):

1. The landing page returns 200, is HTML, and renders the studio heading rather than an error shell.
2. Both search-console verification `<meta>` tags are present *and still carry their verified token* — a tag that is still there but holding somebody else's token fails as silently as a deleted one.
3. `robots.txt` still disallows `/i/` and `/api/`.
4. `sitemap.xml` parses (a shape check: declaration present, `urlset`/`url`/`loc` tags balanced).
5. `GET /i/{unknown-id}` serves the HTML viewer shell with its error panel, never a raw JSON body — a guest must never see a JSON blob.
6. `GET /api/invitations/{unknown-id}` answers `404 NOT_FOUND`, not `503 REPOSITORY_UNAVAILABLE`.
7. That same API response still carries `x-robots-tag: noindex`.
8. An unknown path (`/4asd`) serves the designed 404 page with a real 404 status.

Checks 2, 3, and 7 guard things that are **silently droppable**: nothing user-visible breaks if the verification token goes stale, the `/i/` disallow disappears, or the `noindex` header stops being sent, yet each one costs something real — search-console ownership, a crawled directory of private invitations, or invitation content indexed by search engines. Nothing else in the codebase would notice if one of them regressed, which is exactly why a synthetic check exists for it.

Check 6 is the cheapest database health signal available: `handleGet` answers `404 NOT_FOUND` only after a query actually completed and found nothing, and `503 REPOSITORY_UNAVAILABLE` when the repository is missing or throws. So 404 proves Mongo answered; 503 means it did not — and asking for an id that can never exist costs zero writes.

`.github/workflows/synthetic-monitoring.yml` runs this suite on a 15-minute schedule (and on `workflow_dispatch`), separate from `ci.yml` on purpose: CI answers "is this commit good?" and must stay a fast, deterministic gate on a pull request; this answers "is what's deployed right now behaving?", which has a different cadence and must never turn a PR red because Vercel had a bad minute. Failures open or update a tracking GitHub issue; a signature of which checks are failing prevents re-commenting every 15 minutes on an unchanged incident, and recovery closes the issue. GitHub delays or disables scheduled runs under load or after 60 days of repository inactivity, so treat 15 minutes as a requested cadence, not a guarantee.

### Synthetic publish cycle

`scripts/synthetic-publish-cycle.cjs` is a separate, opt-in check: publish a real invitation, read it back, revoke it. It closes the one gap the read-only suite cannot: a database that is reachable and healthy but pointed at the *wrong* place answers "is a missing id a 404?" exactly the way a correct database does. Writing a unique marker and reading that same marker back is the only way to prove the write path and the read path reach the same database.

It is deliberately rare. `releaseCounter()` in `server/storage/mongo-publications.cjs` is called only on the rollback path of a *failed* publish; `remove()` (used to revoke) never calls it. So **revoking a publication does not return its quota** — every successful cycle permanently consumes one unit of the shared lifetime publish limit (1000, via `PUBLISH_LIFETIME_LIMIT`) that real users draw against. Running it daily would spend 365 units a year (36.5% of the budget); weekly spends 52 (5.2%), which is the trade-off `.github/workflows/synthetic-publish-cycle.yml` makes explicit. A single long-lived canary invitation isn't a substitute either — every publication expires after `PUBLISH_MAX_LIFETIME_DAYS` (30 days) regardless, so it would quietly turn into a 404 check within a month.

The workflow is gated behind the repository secret `SYNTHETIC_PUBLISH_OPT_IN`: unset, the scheduled run skips cleanly (green, not red) rather than failing every week for every fork that hasn't configured it. A manual `workflow_dispatch` run additionally requires `--confirm-quota-spend`, so a human still has to mean it. Run it by hand right after any deploy that touches `MONGODB_URI`, `MONGODB_DB`, or the publishing config — that's the moment a wrong-database failure would actually be introduced, and the scheduled Monday run could be up to 7 days late to catch it.

### What this suite cannot see

Say this plainly rather than implying fuller coverage:

- **A database that is connected but empty or wrong**, for the read-only suite. A missing-id lookup against an empty database returns the same 404 as a correct one. Only the weekly publish cycle closes this, and only for one database at a time.
- **The admin service**, which these checks never touch.
- **Anything that requires JavaScript to execute.** The read-only checks assert on server-sent HTML; a page that arrives intact but then fails in the browser still looks healthy here. `scripts/verify-studio.cjs` and `scripts/verify-error-pages.cjs` drive a real browser and catch that class of failure, but are not part of this scheduled suite.
- **Partial data loss, wrong invitation content, or anything about invitations real users published.**
- **Availability between runs.** A 15-minute gap where the site is down and recovers looks perfect to a suite that only samples every 15 minutes.
- **Whether the admin reads from the same database as the public API**, or whether previously published invitations still exist — the publish cycle proves the write and read paths agree with each other, nothing more.

## 2. Browser error reporting

`assets/analytics/error-reporting.js` rides the PostHog transport that `assets/analytics/analytics.js` already sets up, rather than adding a new SDK — this project has one runtime dependency and no bundler. It attaches a global `error`/`unhandledrejection` listener (plus a legacy `window.onerror` handler for older in-app WebViews) on the studio, the shared viewer, and the standalone viewer, and reports a `client_error` PostHog event. Selected handled failures — draft save, publish, revoke — report explicitly through the same path; everything else, including downloads, falls through the global listener.

The motivating case: a user reported that the invitation intro hangs inside iOS KakaoTalk's in-app browser. That browser has no accessible console, so the only way to see what happened is for the failure to travel over the network. `browser_env` identifies that browser directly (in-app WebViews impersonate Safari/Chrome in their user agent, so every known wrapper — KakaoTalk, Line, Instagram, Facebook, Naver, Daum, WeChat, generic Android WebView — is matched before the browser it claims to be).

The privacy design is the part worth reading closely, because someone will eventually want richer context for debugging and the reasoning needs to be findable here rather than rediscovered. The report does not attempt to mask or scrub free-form text — it **never carries free-form text at all**. Every field is drawn from a small closed vocabulary:

| Field | Values / shape |
|---|---|
| `page` | `studio` \| `shared` \| `viewer` \| `other` — never the URL or the invitation id (the id *is* the capability to view a private invitation) |
| `error_kind` / `error_message` | one of a fixed enum: `runtime` → `runtime_error`, `promise` → `promise_rejection`, `network` → `network_error`, `resource` → `resource_load_failure`, `handled` → `handled_error` — never the thrown message |
| `error_context` | a fixed enum naming the code path (`boot`, `draft_save`, `publish`, `shared_fetch`, `window`, …), defaulting to `unknown` |
| `error_stack` | normalized to `asset-path:line:column` per frame, only for paths in a hardcoded allowlist of shipped `/assets/**.js` files, capped at 8 frames |
| `browser_env` | a closed vocabulary of known wrappers/browsers (`kakaotalk`, `line`, `safari`, `chrome`, `ios_webview`, …) |
| `os_family` / `os_version` | closed vocabulary (`ios`, `android`, `macos`, `windows`, `linux`) plus a coarse version string — enough to tell iOS 15 from iOS 18, which are different JavaScript engines wearing the same name |

This was verified empirically, not just trusted: a report was built from an error whose message and stack were stuffed with a real name, a phone number, a venue, and a 22-character invitation id. The resulting payload came back as

```json
{"browser_env":"kakaotalk","os_family":"ios","os_version":"17.0",
 "page":"shared","error_kind":"runtime","error_message":"runtime_error"}
```

— none of the injected content survived. Tests in `tests/error-reporting.test.js` lock this boundary so it cannot quietly widen later; `assets/analytics/analytics.js` and PostHog's `before_send` re-apply their own allowlists on top as a second layer.

The trade-off is honest and worth stating: dropping the raw message costs real diagnostic detail. In practice the normalized stack frame plus the environment usually locates the fault anyway, and for the motivating KakaoTalk case, `browser_env` alone answers the question that mattered. Reporting also respects the analytics module's existing production-host, `enabled`, opt-out, and DNT/GPC gates, deduplicates identical failures, and caps itself at 8 reports per page so a page that is failing in a loop cannot flood PostHog. A reporter that itself throws is treated as worse than one that misses, so every handler is wrapped to fail silently. It does not install on sandboxed invitation iframes, standalone downloaded HTML, or admin pages, and it cannot see failures that happen before the script itself has loaded. Adding this reporter does not by itself guarantee the iOS KakaoTalk intro issue is resolved or will always be reported — only that when it is, there is now a place for the signal to go. See [analytics.md](analytics.md) for the event allowlist and provider configuration this reporter shares.

## 3. Server error logs

`server/observability.cjs` wraps the public and admin HTTP handlers (the same wrapper backs the Vercel public API) and logs a single JSON line to stderr the first time a request's response status is 5xx. Expected 4xx responses are never logged as server errors. An unexpected exception inside a handler is caught, logged, and answered with a generic 500 — never the original error text.

```json
{"timestamp":"2026-09-13T00:00:00.000Z","event":"server_error","level":"error","service":"public","route":"publication","status":503,"method":"GET","request_id":"11111111-1111-4111-8111-111111111111"}
```

Allowed fields are exactly: `timestamp`, a fixed `event` (`server_error` or `expiry_refresh_failed`), `level`, a fixed `service` (`public`/`admin`), a fixed `route` category (`publication`, `publications`, `session`, `static`, or `other`), the 5xx `status`, the HTTP `method`, and a server-generated `request_id` (a UUID, not derived from anything the client sent). The actual request URL, query string, headers, body, session or admin tokens, the Mongo connection string, and the original exception's message or stack are never logged.

When the best-effort expiry-extension side effect fails, the handler logs an `expiry_refresh_failed` warning and keeps serving the invitation with its existing expiry date rather than blocking the read — a failed housekeeping write must never prevent someone from viewing an invitation. Logging failing outright also never changes the HTTP response; diagnostics are not allowed to affect the API outcome (see the guard in `createReporter` in `server/observability.cjs`).

Find these logs in Vercel's function logs for the public API, and in the admin process's own stdout/terminal or hosting log system for the admin service. Server logs are never sent to PostHog or any external service. Long-term retention, log-based alerting, and capturing failures before the process has even started are hosting concerns outside this project's code.

## Verifying a change to any of this

```bash
node --test tests/synthetic-monitoring.test.js tests/error-reporting.test.js tests/server-observability.test.js
npm test
npm run build:public
git diff --check
```

Client-side tests intercept the provider transport to check that private content is excluded, that the host/opt-out/DNT gates are honored, and that duplicate reports are suppressed. Server-side tests inject database errors and log-sink failures into real HTTP requests to check that responses stay correct and that only the allowed fields reach the log line. None of this is verified against real user data or by revoking a production invitation outside the scheduled weekly cycle.
