const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { once } = require("node:events");

const root = path.resolve(__dirname, "..");
const {
  MISSING_PUBLIC_ID,
  READ_ONLY_CHECKS,
  formatReport,
  runChecks,
  signatureOf
} = require(path.join(root, "scripts/synthetic/checks.cjs"));
const {
  buildCanaryInvitation,
  createManagementToken,
  createRunId,
  describeQuotaRefusal,
  runPublishCycle
} = require(path.join(root, "scripts/synthetic/publish-cycle.cjs"));
const { parseArgs } = require(path.join(root, "scripts/synthetic/http.cjs"));
const { createHandler, errorBody } = require(path.join(root, "server/http.cjs"));

const readRepoFile = (name) => fs.readFileSync(path.join(root, name), "utf8");

// The healthy fixtures are the repository's own deployable files rather than
// hand-written HTML. That couples the monitor to what would actually ship: if
// somebody deletes a search-console meta tag from index.html, this suite goes
// red in the pull request instead of days later in a scheduled run.
const healthyResponses = () => ({
  "GET /": {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: readRepoFile("index.html")
  },
  "GET /robots.txt": {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
    body: readRepoFile("robots.txt")
  },
  "GET /sitemap.xml": {
    status: 200,
    headers: { "content-type": "application/xml" },
    body: readRepoFile("sitemap.xml")
  },
  [`GET /i/${MISSING_PUBLIC_ID}`]: {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: readRepoFile("shared.html")
  },
  [`GET /api/invitations/${MISSING_PUBLIC_ID}`]: {
    status: 404,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-robots-tag": "noindex",
      "cache-control": "no-store"
    },
    body: JSON.stringify(errorBody("NOT_FOUND"))
  },
  "GET /4asd": {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: readRepoFile("404.html")
  }
});

const transportFor = (responses, log = []) => async ({ method, path: requestPath }) => {
  const key = `${method} ${requestPath}`;
  log.push(key);
  const response = responses[key];
  if (!response) throw new Error(`no fixture for ${key}`);
  if (response instanceof Error) throw response;
  return response;
};

const runAgainst = (responses, log) => runChecks({ fetchResponse: transportFor(responses, log) });

const failuresFor = (results, id) => results.find((result) => result.id === id)?.failures ?? [];
const resultFor = (results, id) => results.find((result) => result.id === id);

const withPatchedBody = (key, patch) => {
  const responses = healthyResponses();
  responses[key] = { ...responses[key], body: patch(responses[key].body) };
  return responses;
};

test("every read-only check passes against the files this repository deploys", async () => {
  const results = await runAgainst(healthyResponses());

  assert.equal(results.length, READ_ONLY_CHECKS.length);
  assert.deepEqual(results.filter((result) => !result.ok), []);
  assert.equal(signatureOf(results), "");
});

test("checks that share a request only fetch it once", async () => {
  const log = [];
  await runAgainst(healthyResponses(), log);

  // landing-page-renders and search-console-verification-tags both read "/",
  // and the two API checks both read the same 404. Eight checks, six requests.
  assert.equal(log.length, new Set(log).size);
  assert.equal(log.length, 6);
});

test("a landing page replaced by an error shell fails even though it is 200 HTML", async () => {
  const responses = healthyResponses();
  responses["GET /"] = {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: readRepoFile("503.html")
  };
  const results = await runAgainst(responses);

  const failures = failuresFor(results, "landing-page-renders");
  assert.ok(failures.some((failure) => failure.includes("data-error-code")));
  assert.ok(failures.some((failure) => failure.includes("studio heading")));
});

test("a landing page that lost its <h1> fails", async () => {
  const results = await runAgainst(withPatchedBody("GET /", (body) => body.replace(/<h1/g, "<div")));

  assert.ok(failuresFor(results, "landing-page-renders").some((failure) => failure.includes("<h1>")));
});

test("a dropped search-console verification tag fails", async () => {
  const results = await runAgainst(
    withPatchedBody("GET /", (body) => body.replace(/<meta name="naver-site-verification"[^>]*>/, ""))
  );

  const failures = failuresFor(results, "search-console-verification-tags");
  assert.deepEqual(failures, ['<meta name="naver-site-verification"> is missing from the landing page']);
});

test("a verification tag that is present but carries the wrong token fails", async () => {
  const results = await runAgainst(
    withPatchedBody("GET /", (body) => body.replace(/content="k0bGP9[^"]*"/, 'content="somebody-elses-token"'))
  );

  const failures = failuresFor(results, "search-console-verification-tags");
  assert.deepEqual(failures, ['<meta name="google-site-verification"> is present but no longer carries the verified token']);
});

test("a robots.txt that stopped disallowing /i/ fails", async () => {
  const results = await runAgainst(
    withPatchedBody("GET /robots.txt", (body) => body.replace("Disallow: /i/\n", ""))
  );

  assert.deepEqual(failuresFor(results, "robots-txt-protects-invitations"), ["response body is missing Disallow: /i/"]);
});

test("a truncated sitemap fails on unbalanced tags", async () => {
  const results = await runAgainst(
    withPatchedBody("GET /sitemap.xml", (body) => body.replace("</urlset>", "").replace("</url>", ""))
  );

  const failures = failuresFor(results, "sitemap-is-well-formed");
  assert.ok(failures.some((failure) => failure.includes("<urlset> but 0 </urlset>")));
  assert.ok(failures.some((failure) => failure.includes("<url> but 0 </url>")));
});

test("a sitemap served without its XML declaration fails", async () => {
  const results = await runAgainst(
    withPatchedBody("GET /sitemap.xml", (body) => body.replace(/^<\?xml[^>]*\?>\s*/, ""))
  );

  assert.ok(failuresFor(results, "sitemap-is-well-formed").some((failure) => failure.includes("XML declaration")));
});

test("an unknown /i/{id} that leaks raw JSON to a guest fails", async () => {
  const responses = healthyResponses();
  responses[`GET /i/${MISSING_PUBLIC_ID}`] = {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(errorBody("NOT_FOUND"))
  };
  const results = await runAgainst(responses);

  const failures = failuresFor(results, "missing-invitation-serves-html");
  assert.ok(failures.some((failure) => failure.includes("JSON body")));
  assert.ok(failures.some((failure) => failure.includes("error panel")));
});

test("a 503 REPOSITORY_UNAVAILABLE is reported as the database being unreachable", async () => {
  const responses = healthyResponses();
  responses[`GET /api/invitations/${MISSING_PUBLIC_ID}`] = {
    status: 503,
    headers: { "content-type": "application/json; charset=utf-8", "x-robots-tag": "noindex" },
    body: JSON.stringify(errorBody("REPOSITORY_UNAVAILABLE"))
  };
  const results = await runAgainst(responses);

  assert.deepEqual(failuresFor(results, "api-missing-invitation-is-404"), [
    "API answered 503 REPOSITORY_UNAVAILABLE: the publication store is unreachable or misconfigured"
  ]);
  // The privacy header is independent of the database, so it must still pass.
  assert.equal(resultFor(results, "api-sends-noindex").ok, true);
});

test("an API 404 carrying the wrong error code fails", async () => {
  const responses = healthyResponses();
  responses[`GET /api/invitations/${MISSING_PUBLIC_ID}`] = {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8", "x-robots-tag": "noindex" },
    body: JSON.stringify(errorBody("EXPIRED"))
  };
  const results = await runAgainst(responses);

  assert.deepEqual(failuresFor(results, "api-missing-invitation-is-404"), [
    'expected error code NOT_FOUND, got "EXPIRED"'
  ]);
});

test("an API response that lost x-robots-tag fails", async () => {
  const responses = healthyResponses();
  const existing = responses[`GET /api/invitations/${MISSING_PUBLIC_ID}`];
  responses[`GET /api/invitations/${MISSING_PUBLIC_ID}`] = {
    ...existing,
    headers: { "content-type": existing.headers["content-type"] }
  };
  const results = await runAgainst(responses);

  assert.deepEqual(failuresFor(results, "api-sends-noindex"), [
    'header x-robots-tag should contain "noindex", got "(absent)"'
  ]);
  assert.equal(resultFor(results, "api-missing-invitation-is-404").ok, true);
});

test("a soft 404 that answers 200 with the designed page still fails", async () => {
  const responses = healthyResponses();
  responses["GET /4asd"] = { ...responses["GET /4asd"], status: 200 };
  const results = await runAgainst(responses);

  assert.deepEqual(failuresFor(results, "unknown-path-serves-designed-404"), ["expected HTTP 404, got 200"]);
});

test("a transport failure is reported as a failed check rather than crashing the run", async () => {
  const responses = healthyResponses();
  responses["GET /robots.txt"] = new Error("connect ETIMEDOUT");
  const results = await runAgainst(responses);

  assert.equal(results.length, READ_ONLY_CHECKS.length);
  assert.deepEqual(failuresFor(results, "robots-txt-protects-invitations"), ["request failed: connect ETIMEDOUT"]);
});

test("the report carries a sorted signature so alerting can tell one incident from another", async () => {
  const responses = healthyResponses();
  responses["GET /robots.txt"] = new Error("boom");
  responses["GET /4asd"] = { ...responses["GET /4asd"], status: 200 };
  const results = await runAgainst(responses);

  assert.equal(signatureOf(results), "robots-txt-protects-invitations,unknown-path-serves-designed-404");

  const report = formatReport({
    results,
    origin: "https://example.test",
    checkedAt: "2026-01-01T00:00:00.000Z",
    footnote: "read this"
  });
  assert.ok(report.startsWith("<!-- synthetic-signature: robots-txt-protects-invitations,unknown-path-serves-designed-404 -->"));
  assert.ok(report.includes("2 of 8 checks failed"));
  assert.ok(report.includes("read this"));
});

test("a passing report omits the footnote and records an empty signature", () => {
  const report = formatReport({
    results: [{ id: "a", title: "A", ok: true, failures: [] }],
    origin: "https://example.test",
    checkedAt: "2026-01-01T00:00:00.000Z",
    footnote: "read this"
  });

  assert.ok(report.startsWith("<!-- synthetic-signature:  -->"));
  assert.ok(report.includes("all checks passed"));
  assert.ok(!report.includes("read this"));
});

// --- publish cycle ----------------------------------------------------------

const PUBLISHED_ID = "AbCdEfGhIjKlMnOpQrStUv";

// A transport standing in for a healthy deployment: it remembers what was
// published so the read-back sees the same invitation, and honours the
// management token on delete.
const fakeDeployment = (overrides = {}) => {
  const store = new Map();
  const calls = [];
  return {
    calls,
    store,
    request: async ({ method, path: requestPath, headers = {}, body }) => {
      calls.push(`${method} ${requestPath}`);
      const override = overrides[`${method} ${requestPath.replace(PUBLISHED_ID, "{id}")}`];
      if (override) return typeof override === "function" ? override({ method, requestPath, headers, body }) : override;

      if (method === "POST" && requestPath === "/api/invitations") {
        const parsed = JSON.parse(body);
        store.set(PUBLISHED_ID, { invitation: parsed.invitation, tokenHash: headers.authorization });
        return {
          status: 201,
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            id: PUBLISHED_ID,
            url: `/i/${PUBLISHED_ID}`,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          })
        };
      }
      if (method === "GET" && requestPath === `/api/invitations/${PUBLISHED_ID}`) {
        const record = store.get(PUBLISHED_ID);
        if (!record) {
          return {
            status: 404,
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify(errorBody("NOT_FOUND"))
          };
        }
        return {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({ invitation: record.invitation, expiresAt: null })
        };
      }
      if (method === "GET" && requestPath === `/i/${PUBLISHED_ID}`) {
        return { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: "<html></html>" };
      }
      if (method === "DELETE" && requestPath === `/api/invitations/${PUBLISHED_ID}`) {
        const record = store.get(PUBLISHED_ID);
        if (!record) return { status: 204, headers: {}, body: "" };
        if (record.tokenHash !== headers.authorization) {
          return {
            status: 403,
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify(errorBody("TOKEN_FORBIDDEN"))
          };
        }
        store.delete(PUBLISHED_ID);
        return { status: 204, headers: {}, body: "" };
      }
      throw new Error(`unexpected request ${method} ${requestPath}`);
    }
  };
};

test("the publish cycle passes end to end against a healthy deployment and leaves nothing behind", async () => {
  const deployment = fakeDeployment();
  const outcome = await runPublishCycle({ request: deployment.request });

  assert.deepEqual(outcome.steps.filter((step) => !step.ok), []);
  assert.deepEqual(outcome.steps.map((step) => step.id), [
    "publish",
    "read-back",
    "viewer-page",
    "revoke",
    "revoked-invitation-is-gone"
  ]);
  assert.equal(outcome.publishedId, PUBLISHED_ID);
  assert.equal(outcome.revoked, true);
  assert.equal(deployment.store.size, 0);
});

test("a read-back that 404s names the write and read paths disagreeing", async () => {
  const deployment = fakeDeployment({
    "GET /api/invitations/{id}": {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(errorBody("NOT_FOUND"))
    }
  });
  const outcome = await runPublishCycle({ request: deployment.request });

  assert.deepEqual(outcome.steps.find((step) => step.id === "read-back").failures, [
    "read-back answered 404 for an id that was just published: the write and read paths are not seeing the same database"
  ]);
});

test("a read-back that returns somebody else's invitation fails", async () => {
  // The wrong-database-with-data case: the read succeeds, the status is 200,
  // and the content is not what this run wrote.
  const deployment = fakeDeployment({
    "GET /api/invitations/{id}": {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ invitation: { title: "someone else's party" }, expiresAt: null })
    }
  });
  const outcome = await runPublishCycle({ request: deployment.request });

  const failures = outcome.steps.find((step) => step.id === "read-back").failures;
  assert.equal(failures.length, 1);
  assert.ok(failures[0].includes("read-back returned a different invitation"));
  assert.ok(failures[0].includes("someone else's party"));
});

test("the invitation is still revoked when the read-back fails", async () => {
  const deployment = fakeDeployment({
    "GET /api/invitations/{id}": {
      status: 500,
      headers: {},
      body: "upstream exploded"
    }
  });
  const outcome = await runPublishCycle({ request: deployment.request });

  assert.equal(outcome.steps.find((step) => step.id === "read-back").ok, false);
  assert.ok(deployment.calls.includes(`DELETE /api/invitations/${PUBLISHED_ID}`));
  assert.equal(deployment.store.size, 0);
});

test("a failed revoke says the canary invitation is still live and where", async () => {
  const deployment = fakeDeployment({
    "DELETE /api/invitations/{id}": {
      status: 403,
      headers: {},
      body: JSON.stringify(errorBody("TOKEN_FORBIDDEN"))
    }
  });
  const outcome = await runPublishCycle({ request: deployment.request });

  assert.equal(outcome.revoked, false);
  assert.ok(outcome.steps.find((step) => step.id === "revoke").failures[0].includes("token hashing is inconsistent"));
  const cleanup = outcome.steps.find((step) => step.id === "revoked-invitation-is-gone");
  assert.ok(cleanup.failures[0].includes(`/i/${PUBLISHED_ID}`));
});

test("an invitation that survives revocation fails", async () => {
  const deployment = fakeDeployment();
  let deleted = false;
  const request = async (options) => {
    if (options.method === "DELETE") {
      deleted = true;
      return { status: 204, headers: {}, body: "" };
    }
    if (deleted && options.method === "GET" && options.path.startsWith("/api/invitations/")) {
      return {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ invitation: { title: "still here" }, expiresAt: null })
      };
    }
    return deployment.request(options);
  };
  const outcome = await runPublishCycle({ request });

  assert.deepEqual(outcome.steps.find((step) => step.id === "revoked-invitation-is-gone").failures, [
    "a revoked invitation is still reachable: expected HTTP 404, got 200"
  ]);
});

test("a publish refused for quota reports which shared limit was hit and skips the rest", async () => {
  const deployment = fakeDeployment({
    "POST /api/invitations": {
      status: 429,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(errorBody("LIFETIME_LIMIT"))
    }
  });
  const outcome = await runPublishCycle({ request: deployment.request });

  assert.equal(outcome.publishedId, null);
  assert.ok(outcome.steps.find((step) => step.id === "publish").failures[0].includes("NO user can publish"));
  for (const id of ["read-back", "viewer-page", "revoke", "revoked-invitation-is-gone"]) {
    assert.deepEqual(outcome.steps.find((step) => step.id === id).failures, ["skipped: nothing was published"]);
  }
  // Nothing was published, so nothing may be deleted.
  assert.ok(!deployment.calls.some((call) => call.startsWith("DELETE")));
});

test("describeQuotaRefusal only speaks for 429 and names each shared limit", () => {
  assert.equal(describeQuotaRefusal(503, "REPOSITORY_UNAVAILABLE"), null);
  assert.ok(describeQuotaRefusal(429, "LIFETIME_LIMIT").includes("never released"));
  assert.ok(describeQuotaRefusal(429, "TOTAL_DAILY_LIMIT").includes("turned away today"));
  assert.ok(describeQuotaRefusal(429, "RATE_LIMIT").includes("hourly allowance"));
  assert.ok(describeQuotaRefusal(429, undefined).includes("unknown code"));
});

test("a publish that returns an expiry beyond the 30-day ceiling fails", async () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const deployment = fakeDeployment({
    "POST /api/invitations": {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        id: PUBLISHED_ID,
        url: `/i/${PUBLISHED_ID}`,
        expiresAt: "2026-06-01T00:00:00.000Z"
      })
    }
  });
  const outcome = await runPublishCycle({ request: deployment.request, now });

  assert.deepEqual(outcome.steps.find((step) => step.id === "publish").failures, [
    "publish returned an expiresAt beyond the 30-day ceiling"
  ]);
});

test("the management token matches the shape the server accepts and every run is unique", () => {
  const token = createManagementToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(createManagementToken(), token);

  const first = createRunId();
  assert.notEqual(createRunId(), first);
  assert.ok(buildCanaryInvitation(first).title.includes(first));
  assert.ok(buildCanaryInvitation(first).title.startsWith("SYNTHETIC CANARY"));
});

// --- the canary's expectations against the real server ----------------------

// An in-memory publication store with the same contract as the Mongo one, so
// the cycle below runs through the actual request handler. This is what keeps
// the canary honest: if the API contract changes, this test fails in CI rather
// than the canary failing in production at 03:15 on a Monday.
class MemoryPublications {
  constructor() {
    this.records = new Map();
  }

  async publish(input) {
    const record = {
      id: input.id,
      invitation: input.invitation,
      tokenHash: input.tokenHash,
      idempotencyKeyHash: input.idempotencyKeyHash,
      contentHash: input.contentHash,
      createdAt: input.now,
      expiresAt: input.expiresAt
    };
    this.records.set(record.id, record);
    return { id: record.id, expiresAt: record.expiresAt };
  }

  async get(id) {
    return this.records.get(id) || null;
  }

  async remove({ id, tokenHash }) {
    const record = this.records.get(id);
    if (!record || record.tokenHash !== tokenHash) return false;
    this.records.delete(id);
    return true;
  }
}

test("the publish cycle passes against the real request handler", async () => {
  const repository = new MemoryPublications();
  const handler = createHandler({
    repository,
    config: { staticRoot: root, trustProxy: false }
  });
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const { port } = server.address();
    const request = async ({ method = "GET", path: requestPath, headers = {}, body }) => {
      const response = await fetch(`http://127.0.0.1:${port}${requestPath}`, { method, headers, body });
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text()
      };
    };

    const outcome = await runPublishCycle({ request });

    assert.deepEqual(outcome.steps.filter((step) => !step.ok), []);
    assert.match(outcome.publishedId, /^[0-9A-Za-z]{22}$/);
    assert.equal(outcome.revoked, true);
    assert.equal(repository.records.size, 0);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("the read-only checks pass against the real request handler serving this repository", async () => {
  // Covers the static half of the suite the same way: the handler mirrors
  // Vercel's routing, so /i/{id} lands on shared.html and an unknown path
  // lands on the designed 404.
  const handler = createHandler({
    repository: new MemoryPublications(),
    config: { staticRoot: root, trustProxy: false }
  });
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const { port } = server.address();
    const results = await runChecks({
      fetchResponse: async ({ method, path: requestPath }) => {
        const response = await fetch(`http://127.0.0.1:${port}${requestPath}`, { method });
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: await response.text()
        };
      }
    });

    assert.deepEqual(
      results.filter((result) => !result.ok).map((result) => [result.id, result.failures]),
      []
    );
  } finally {
    server.close();
    await once(server, "close");
  }
});

// --- argument parsing -------------------------------------------------------

test("parseArgs understands --flag value, --flag=value and bare flags", () => {
  assert.deepEqual(parseArgs(["--origin", "https://example.test", "--report=/tmp/r.md", "--confirm-quota-spend"]), {
    origin: "https://example.test",
    report: "/tmp/r.md",
    "confirm-quota-spend": "true"
  });
  assert.deepEqual(parseArgs([]), {});
  assert.deepEqual(parseArgs(["--a", "--b", "1"]), { a: "true", b: "1" });
  assert.deepEqual(parseArgs(["--trailing"]), { trailing: "true" });
});
