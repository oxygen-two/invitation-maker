// Read-only synthetic checks against a deployed origin.
//
// WHY THIS EXISTS, AND WHAT IT DELIBERATELY IS NOT
//
// Most of the production incidents this project has seen threw no exception at
// all: a UI that was never committed, an admin pointed at the wrong database
// name so it faithfully reported zero of everything. An exception tracker sees
// none of that. These checks look for *silently wrong* behaviour instead — the
// site is up, it returns 200, and it is still wrong.
//
// WHAT THIS SUITE CANNOT SEE — read this before trusting a green run:
//
//   * It cannot tell a correctly configured database from an empty one. Every
//     check here is read-only by design (see the quota note in
//     ./publish-cycle.cjs), so the only database question it can ask is "does a
//     lookup for a missing id come back as a clean 404 instead of a 503?".
//     A Mongo instance that is reachable, healthy and pointed at the WRONG
//     DATABASE answers that question exactly the way a correct one does.
//     Only the rare publish cycle in ./publish-cycle.cjs closes that gap.
//   * It cannot see anything about the admin service, which is not deployed.
//   * It does not execute JavaScript. It asserts on the HTML that the server
//     sent, so a page that is served intact but crashes in the browser still
//     looks healthy here. scripts/verify-studio.cjs and
//     scripts/verify-error-pages.cjs drive a real browser; this does not.
//   * It cannot see partial data loss, wrong invitation content, or anything
//     about invitations that real users published.
//   * It says nothing about latency or availability *between* runs. A site that
//     is down for ten minutes between two 15-minute checks looks perfect.
//
// Everything in this file is pure: checks receive an already-fetched response
// and return a list of human-readable failures. No network, no clock, no
// filesystem — so the assertions are unit-testable without touching production.

"use strict";

const PRODUCTION_ORIGIN = "https://invitation-maker-one.vercel.app";

// Syntactically a real public id (22 base62 characters), so Vercel routes it to
// the invitation handlers instead of the static 404. No publish will ever mint
// it: createPublicId draws all 22 characters uniformly from a 62-character
// alphabet, and this string spells words.
const MISSING_PUBLIC_ID = "zzzzSyntheticCanary404";

// Pinned on purpose rather than checked for mere presence. A tag that is still
// there but carrying somebody else's token fails verification just as silently
// as a deleted one, and the failure is invisible until the reports stop
// arriving weeks later. If a property is ever re-verified with a new token,
// update index.html (the landing page) and this constant together.
const SEARCH_CONSOLE_TAGS = Object.freeze([
  {
    name: "google-site-verification",
    content: "k0bGP9otm9hmWB_sAZmrRd4dF6ClSKZCx5s_IkHjVeM"
  },
  {
    name: "naver-site-verification",
    content: "323c12e50a81986273c33141f5fcdf9cae3c2ef6"
  }
]);

const headerOf = (response, name) => {
  const value = response?.headers?.[name.toLowerCase()];
  return typeof value === "string" ? value : "";
};

const expectStatus = (response, expected) =>
  response.status === expected ? [] : [`expected HTTP ${expected}, got ${response.status}`];

const expectHeaderContains = (response, name, needle) => {
  const value = headerOf(response, name);
  if (value.toLowerCase().includes(needle.toLowerCase())) return [];
  return [`header ${name} should contain "${needle}", got "${value || "(absent)"}"`];
};

const expectBodyContains = (response, needle, description) =>
  (response.body || "").includes(needle) ? [] : [`response body is missing ${description}`];

// A page whose HTML is intact but which the server replaced with an error shell
// still returns markup and still contains tags. The designed error pages all
// carry data-error-code, so its presence on a page that should be the real
// thing is the cheapest "this is not what I asked for" signal available.
const expectNotAnErrorShell = (response) =>
  (response.body || "").includes("data-error-code")
    ? ["page carries data-error-code, so an error shell was served in place of the real page"]
    : [];

// Deliberately a shape check, not a validating parse: Node has no XML parser in
// core and a sitemap is small enough that "declaration, one balanced urlset,
// at least one balanced url/loc" catches every truncation and mis-templating
// failure that has ever mattered here. It would not catch an invalid entity or
// a namespace typo.
const expectWellFormedSitemap = (response) => {
  const body = (response.body || "").trim();
  const failures = [];
  if (!body.startsWith("<?xml")) failures.push("sitemap does not start with an XML declaration");
  for (const tag of ["urlset", "url", "loc"]) {
    const open = (body.match(new RegExp(`<${tag}[\\s>]`, "g")) || []).length;
    const close = (body.match(new RegExp(`</${tag}>`, "g")) || []).length;
    if (open === 0) failures.push(`sitemap has no <${tag}> element`);
    else if (open !== close) failures.push(`sitemap has ${open} <${tag}> but ${close} </${tag}>`);
  }
  return failures;
};

const READ_ONLY_CHECKS = Object.freeze([
  {
    id: "landing-page-renders",
    title: "Landing page returns 200 and rendered the studio, not an error shell",
    method: "GET",
    path: "/",
    verify: (response) => [
      ...expectStatus(response, 200),
      ...expectHeaderContains(response, "content-type", "text/html"),
      ...expectBodyContains(response, "<h1", "an <h1> element"),
      ...expectBodyContains(response, 'id="studio-heading"', "the studio heading"),
      ...expectNotAnErrorShell(response)
    ]
  },
  {
    id: "search-console-verification-tags",
    title: "Both search-console verification tags are present with the expected tokens",
    method: "GET",
    path: "/",
    verify: (response) => SEARCH_CONSOLE_TAGS.flatMap(({ name, content }) => {
      const body = response.body || "";
      const tag = body.match(new RegExp(`<meta[^>]*name=["']${name}["'][^>]*>`, "i"));
      if (!tag) return [`<meta name="${name}"> is missing from the landing page`];
      return tag[0].includes(content)
        ? []
        : [`<meta name="${name}"> is present but no longer carries the verified token`];
    })
  },
  {
    id: "robots-txt-protects-invitations",
    title: "robots.txt is served and still disallows /i/ and /api/",
    method: "GET",
    path: "/robots.txt",
    verify: (response) => [
      ...expectStatus(response, 200),
      ...expectHeaderContains(response, "content-type", "text/plain"),
      // The privacy story for a published invitation is two-layered: the
      // noindex meta tag on shared.html and this disallow. Losing the disallow
      // changes nothing a human can see.
      ...expectBodyContains(response, "Disallow: /i/", "Disallow: /i/"),
      ...expectBodyContains(response, "Disallow: /api/", "Disallow: /api/"),
      ...expectBodyContains(response, "Sitemap:", "a Sitemap: line")
    ]
  },
  {
    id: "sitemap-is-well-formed",
    title: "sitemap.xml is served and parses as a sitemap",
    method: "GET",
    path: "/sitemap.xml",
    verify: (response) => [
      ...expectStatus(response, 200),
      ...expectHeaderContains(response, "content-type", "xml"),
      ...expectWellFormedSitemap(response)
    ]
  },
  {
    id: "missing-invitation-serves-html",
    title: "An unknown /i/{id} serves the HTML viewer shell, never raw JSON",
    method: "GET",
    path: `/i/${MISSING_PUBLIC_ID}`,
    verify: (response) => {
      const body = response.body || "";
      return [
        // 200 is correct here and not a bug: Vercel rewrites /i/{id} to the
        // static viewer, which then fetches the API and renders its own error
        // panel. What must never happen is a guest seeing a JSON blob.
        ...expectStatus(response, 200),
        ...expectHeaderContains(response, "content-type", "text/html"),
        ...expectBodyContains(response, 'id="shared-invitation-error"', "the viewer's error panel"),
        ...expectBodyContains(response, 'name="robots"', "the noindex robots tag"),
        ...(body.trimStart().startsWith("{") ? ["viewer route returned a JSON body"] : [])
      ];
    }
  },
  {
    id: "api-missing-invitation-is-404",
    title: "GET /api/invitations/{unknown} answers 404 NOT_FOUND, proving Mongo is reachable",
    method: "GET",
    path: `/api/invitations/${MISSING_PUBLIC_ID}`,
    verify: (response) => {
      // This is the cheapest database health signal the system has, and it
      // costs zero writes. handleGet answers 503 REPOSITORY_UNAVAILABLE when
      // the repository is missing or throws, and 404 NOT_FOUND only after a
      // query actually completed and returned nothing. So 404 means "Mongo
      // answered"; 503 means "Mongo did not".
      //
      // It cannot distinguish the right database from the wrong one. An empty
      // database answers 404 just as cheerfully.
      if (response.status === 503) {
        return ["API answered 503 REPOSITORY_UNAVAILABLE: the publication store is unreachable or misconfigured"];
      }
      const failures = [
        ...expectStatus(response, 404),
        ...expectHeaderContains(response, "content-type", "application/json")
      ];
      let parsed;
      try {
        parsed = JSON.parse(response.body || "");
      } catch {
        return [...failures, "API error body is not valid JSON"];
      }
      if (parsed?.error?.code !== "NOT_FOUND") {
        failures.push(`expected error code NOT_FOUND, got ${JSON.stringify(parsed?.error?.code ?? null)}`);
      }
      return failures;
    }
  },
  {
    id: "api-sends-noindex",
    title: "API responses still carry x-robots-tag: noindex",
    method: "GET",
    path: `/api/invitations/${MISSING_PUBLIC_ID}`,
    // Invitation payloads carry real names, dates and phone numbers. This
    // header is the guarantee that a crawler which somehow reaches the API
    // does not publish them. Nothing user-visible changes when it disappears.
    verify: (response) => expectHeaderContains(response, "x-robots-tag", "noindex")
  },
  {
    id: "unknown-path-serves-designed-404",
    title: "An unknown path serves the designed 404 page with a real 404 status",
    method: "GET",
    path: "/4asd",
    verify: (response) => [
      ...expectStatus(response, 404),
      ...expectHeaderContains(response, "content-type", "text/html"),
      ...expectBodyContains(response, "data-error-code", "the designed error page markup"),
      ...expectBodyContains(response, "<h1", "an <h1> element")
    ]
  }
]);

// Runs checks against an injected transport so tests can drive every branch
// without a network. `fetchResponse` receives { method, path } and resolves to
// { status, headers, body }; a rejection is reported as a failed check rather
// than crashing the run. Checks that share a request share one fetch.
const runChecks = async ({ checks = READ_ONLY_CHECKS, fetchResponse }) => {
  const fetched = new Map();
  const results = [];

  for (const check of checks) {
    const key = `${check.method} ${check.path}`;
    if (!fetched.has(key)) {
      fetched.set(
        key,
        await fetchResponse({ method: check.method, path: check.path })
          .then((response) => ({ response }))
          .catch((error) => ({ error }))
      );
    }
    const outcome = fetched.get(key);
    const failures = outcome.error
      ? [`request failed: ${outcome.error.message || String(outcome.error)}`]
      : check.verify(outcome.response);
    results.push({
      id: check.id,
      title: check.title,
      request: key,
      status: outcome.response?.status ?? null,
      ok: failures.length === 0,
      failures
    });
  }

  return results;
};

// A stable fingerprint of *which* checks are failing. The alerting workflow
// uses it to avoid commenting on an open incident issue every 15 minutes while
// nothing has changed — that is how people learn to mute a repository.
const signatureOf = (results) =>
  results.filter((result) => !result.ok).map((result) => result.id).sort().join(",");

// Shared by the read-only monitor and the publish cycle: both produce results
// of the shape { id, title, ok, failures }, and the alerting workflow only
// knows how to read one report format.
const formatReport = ({ results, origin, checkedAt, label = "Synthetic monitoring", footnote = "" }) => {
  const failed = results.filter((result) => !result.ok);
  const lines = [
    `<!-- synthetic-signature: ${signatureOf(results)} -->`,
    `## ${label}: ${failed.length === 0 ? "all checks passed" : `${failed.length} of ${results.length} checks failed`}`,
    "",
    `- Target: ${origin}`,
    `- Checked at: ${checkedAt}`,
    ""
  ];
  for (const result of results) {
    lines.push(`${result.ok ? "- PASS" : "- **FAIL**"} \`${result.id}\` — ${result.title}`);
    for (const failure of result.failures) lines.push(`  - ${failure}`);
  }
  if (failed.length > 0 && footnote) lines.push("", footnote);
  return `${lines.join("\n")}\n`;
};

const READ_ONLY_FOOTNOTE = [
  "These checks are read-only, and a green run proves less than it looks like.",
  "It cannot tell a correctly configured database from an empty one — only the",
  "rare publish cycle can. See the header comment in `scripts/synthetic/checks.cjs`."
].join("\n");

module.exports = {
  MISSING_PUBLIC_ID,
  PRODUCTION_ORIGIN,
  READ_ONLY_CHECKS,
  READ_ONLY_FOOTNOTE,
  SEARCH_CONSOLE_TAGS,
  formatReport,
  runChecks,
  signatureOf
};
