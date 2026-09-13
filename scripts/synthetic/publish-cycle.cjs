// The one synthetic check that writes to production: publish -> read back ->
// revoke, against the real API and the real database.
//
// WHY IT IS RARE, AND WHY IT CANNOT BE MADE CHEAP
//
// Publishing permanently consumes quota that real users share, and revoking
// does NOT give it back. Three counters are incremented on every successful
// publish (server/storage/mongo-publications.cjs):
//
//     hour:<clientKeyHash>:<hour>   PUBLISH_RATE_LIMIT_PER_HOUR, default 10
//     day:<day>                     PUBLISH_TOTAL_DAILY_LIMIT,   default 100
//     lifetime                      PUBLISH_LIFETIME_LIMIT,      default 1000
//
// releaseCounter() exists, but publish() is its only caller and it only runs on
// the rollback path of a FAILED publish. remove() deletes the document and
// touches no counter at all. So a successful canary publish burns one unit of
// the lifetime budget forever, no matter how promptly it is revoked. The hourly
// and daily counters expire on their own; `lifetime` has no expiry field, so it
// only ever goes up.
//
// That arithmetic is the whole reason for the cadence:
//
//     daily   -> 365 of 1000 lifetime units per year (36.5%). Not acceptable.
//     weekly  ->  52 of 1000 lifetime units per year (5.2%), and 1% of one
//                 day's quota on the day it runs. Acceptable.
//
// A permanently-parked canary invitation is not an option either: initialExpiresAt
// caps every publication at createdAt + PUBLISH_MAX_LIFETIME_DAYS (30), and reads
// only slide the window up to that ceiling. Any canary invitation dies inside a
// month regardless of how often it is read, so "publish one and watch it" would
// silently become "watch a 404" after 30 days.
//
// WHAT THIS CATCHES THAT THE READ-ONLY SUITE CANNOT
//
// Exactly one thing, and it is the important one: a database that is reachable
// and healthy but WRONG. The read-only Mongo probe asks "does a lookup for a
// missing id return 404 rather than 503?" — a correctly configured database and
// an empty one both answer 404. Only writing a unique marker and reading that
// same marker back proves the write path and the read path are looking at the
// same collection in the same database.
//
// The cost of the weekly cadence is an up-to-7-day blind spot for precisely that
// failure. The mitigation is not a faster schedule, it is workflow_dispatch:
// run this by hand immediately after any deploy that touches MONGODB_URI,
// MONGODB_DB or the publishing config, which is when that failure is introduced.
//
// Everything here is pure apart from the injected `request` and `randomBytes`,
// so the whole cycle — including its failure branches — is unit-testable
// without touching production.

"use strict";

const { randomBytes, randomUUID } = require("node:crypto");

const API_ROOT = "/api/invitations";
const PUBLIC_ID_PATTERN = /^[0-9A-Za-z]{22}$/;

// Anyone who stumbles on this invitation in a database dump should know what it
// is on sight, and the marker must be unique per run: a stale canary from a
// previous run must never be able to satisfy this run's read-back assertion.
const CANARY_TITLE_PREFIX = "SYNTHETIC CANARY — automated monitoring, safe to delete";

const createRunId = (now = new Date(), random = randomBytes) =>
  `${now.toISOString().replace(/[^0-9]/g, "")}-${random(4).toString("hex")}`;

// The management token is generated here rather than supplied as a secret,
// because publishing is anonymous by design: the server only ever stores
// sha256("management-token:" + token) and compares it back. There is no account
// to authenticate as. The token is a capability this run mints for itself so
// that it, and only it, can revoke what it published.
const createManagementToken = (random = randomBytes) => random(32).toString("base64url");

const buildCanaryInvitation = (runId) => ({
  // Only plain optional strings, so the payload stays a few hundred bytes and
  // normalizeInvitation fills in every other field from its defaults.
  title: `${CANARY_TITLE_PREFIX} ${runId}`,
  subtitle: "synthetic monitoring",
  host: "synthetic monitoring",
  message: `Automated production check ${runId}. This invitation is revoked seconds after it is created.`
});

const parseJson = (body) => {
  try {
    return { value: JSON.parse(body || "") };
  } catch {
    return { error: "response body is not valid JSON" };
  }
};

const describeQuotaRefusal = (status, code) => {
  if (status !== 429) return null;
  if (code === "LIFETIME_LIMIT") {
    return "publish refused with LIFETIME_LIMIT: the service has spent its entire lifetime publishing quota and NO user can publish. This counter is never released.";
  }
  if (code === "TOTAL_DAILY_LIMIT") {
    return "publish refused with TOTAL_DAILY_LIMIT: the shared daily quota is exhausted, so users are being turned away today.";
  }
  if (code === "RATE_LIMIT") {
    return "publish refused with RATE_LIMIT: this runner's address already published its hourly allowance. Check whether the cycle is running more often than intended.";
  }
  return `publish refused with HTTP 429 (${code || "unknown code"})`;
};

// `request` receives { method, path, headers, body } and resolves to
// { status, headers, body }. It never throws for an HTTP status; a rejection
// means the transport itself failed.
const runPublishCycle = async ({
  request,
  now = new Date(),
  runId = createRunId(now),
  token = createManagementToken(),
  idempotencyKey = randomUUID(),
  maxLifetimeDays = 30
}) => {
  const steps = [];
  const invitation = buildCanaryInvitation(runId);
  let publishedId = null;
  let revoked = false;

  const step = async (id, title, run) => {
    let failures;
    try {
      failures = await run();
    } catch (error) {
      failures = [`request failed: ${error?.message || String(error)}`];
    }
    steps.push({ id, title, ok: failures.length === 0, failures });
    return failures.length === 0;
  };

  const skipped = (id, title, reason) => {
    steps.push({ id, title, ok: false, failures: [`skipped: ${reason}`] });
  };

  try {
    const published = await step(
      "publish",
      "POST /api/invitations creates an invitation",
      async () => {
        const response = await request({
          method: "POST",
          path: API_ROOT,
          headers: {
            authorization: `Bearer ${token}`,
            "idempotency-key": idempotencyKey,
            "content-type": "application/json"
          },
          body: JSON.stringify({ invitation })
        });

        const parsed = parseJson(response.body);
        if (response.status !== 201) {
          const quota = describeQuotaRefusal(response.status, parsed.value?.error?.code);
          if (quota) return [quota];
          return [`expected HTTP 201, got ${response.status} (${parsed.value?.error?.code || response.body?.slice(0, 120) || "no body"})`];
        }
        if (parsed.error) return [parsed.error];

        const failures = [];
        const body = parsed.value;
        if (!PUBLIC_ID_PATTERN.test(body?.id || "")) {
          failures.push(`publish returned an id that is not 22 base62 characters: ${JSON.stringify(body?.id ?? null)}`);
        } else {
          publishedId = body.id;
        }
        if (body?.url !== `/i/${body?.id}`) {
          failures.push(`publish returned url ${JSON.stringify(body?.url ?? null)}, expected /i/${body?.id}`);
        }
        // A missing or absurd expiry means the sliding-window bookkeeping is
        // broken, which shows up months later as invitations that never die or
        // die immediately.
        const expiresAt = Date.parse(body?.expiresAt || "");
        const ceiling = now.getTime() + maxLifetimeDays * 24 * 60 * 60 * 1000;
        if (!Number.isFinite(expiresAt)) {
          failures.push(`publish returned no usable expiresAt: ${JSON.stringify(body?.expiresAt ?? null)}`);
        } else if (expiresAt <= now.getTime()) {
          failures.push("publish returned an expiresAt that is already in the past");
        } else if (expiresAt > ceiling + 60_000) {
          failures.push(`publish returned an expiresAt beyond the ${maxLifetimeDays}-day ceiling`);
        }
        return failures;
      }
    );

    if (published && publishedId) {
      await step(
        "read-back",
        "GET /api/invitations/{id} returns the invitation this run just wrote",
        async () => {
          const response = await request({ method: "GET", path: `${API_ROOT}/${publishedId}` });
          if (response.status === 503) {
            return ["read-back answered 503 REPOSITORY_UNAVAILABLE immediately after a successful write"];
          }
          if (response.status === 404) {
            // The headline failure mode. A write that succeeds and a read that
            // misses means the two paths are not looking at the same data.
            return ["read-back answered 404 for an id that was just published: the write and read paths are not seeing the same database"];
          }
          if (response.status !== 200) return [`expected HTTP 200, got ${response.status}`];
          const parsed = parseJson(response.body);
          if (parsed.error) return [parsed.error];
          const title = parsed.value?.invitation?.title;
          if (title !== invitation.title) {
            return [`read-back returned a different invitation: expected title ${JSON.stringify(invitation.title)}, got ${JSON.stringify(title ?? null)}`];
          }
          return [];
        }
      );

      await step(
        "viewer-page",
        "GET /i/{id} serves the viewer shell for a real invitation",
        async () => {
          const response = await request({ method: "GET", path: `/i/${publishedId}` });
          if (response.status !== 200) return [`expected HTTP 200, got ${response.status}`];
          const contentType = response.headers?.["content-type"] || "";
          if (!contentType.includes("text/html")) return [`expected an HTML content-type, got "${contentType}"`];
          return [];
        }
      );
    } else {
      skipped("read-back", "GET /api/invitations/{id} returns the invitation this run just wrote", "nothing was published");
      skipped("viewer-page", "GET /i/{id} serves the viewer shell for a real invitation", "nothing was published");
    }
  } finally {
    // Always reached, including when an assertion above threw. The quota is
    // spent either way, but a canary invitation must never be left readable at
    // a public URL.
    if (publishedId) {
      revoked = await step(
        "revoke",
        "DELETE /api/invitations/{id} revokes the invitation",
        async () => {
          const response = await request({
            method: "DELETE",
            path: `${API_ROOT}/${publishedId}`,
            headers: { authorization: `Bearer ${token}` }
          });
          if (response.status === 403) {
            return ["revoke answered 403 TOKEN_FORBIDDEN with the same token that published: token hashing is inconsistent between write and delete"];
          }
          if (response.status !== 204) return [`expected HTTP 204, got ${response.status}`];
          return [];
        }
      );

      if (revoked) {
        await step(
          "revoked-invitation-is-gone",
          "GET /api/invitations/{id} answers 404 after revocation",
          async () => {
            const response = await request({ method: "GET", path: `${API_ROOT}/${publishedId}` });
            if (response.status !== 404) {
              return [`a revoked invitation is still reachable: expected HTTP 404, got ${response.status}`];
            }
            return [];
          }
        );
      } else {
        skipped(
          "revoked-invitation-is-gone",
          "GET /api/invitations/{id} answers 404 after revocation",
          "revocation did not succeed, so this canary invitation is still live at " +
            `/i/${publishedId} until it expires — revoke it by hand`
        );
      }
    } else {
      skipped("revoke", "DELETE /api/invitations/{id} revokes the invitation", "nothing was published");
      skipped(
        "revoked-invitation-is-gone",
        "GET /api/invitations/{id} answers 404 after revocation",
        "nothing was published"
      );
    }
  }

  return { steps, runId, publishedId, revoked, invitation };
};

const PUBLISH_CYCLE_FOOTNOTE = [
  "This cycle spent one unit of the service's lifetime publishing quota",
  "(`PUBLISH_LIFETIME_LIMIT`, default 1000). Revoking does not give it back —",
  "see the header comment in `scripts/synthetic/publish-cycle.cjs`.",
  "",
  "If the `revoke` step failed, a canary invitation is publicly readable until it",
  "expires. Revoke it by hand or delete the document before closing this issue."
].join("\n");

module.exports = {
  CANARY_TITLE_PREFIX,
  PUBLISH_CYCLE_FOOTNOTE,
  buildCanaryInvitation,
  createManagementToken,
  createRunId,
  describeQuotaRefusal,
  runPublishCycle
};
