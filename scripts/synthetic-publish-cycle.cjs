// Runs the WRITING canary: publish -> read back -> revoke, against a real
// deployment.
//
//   node scripts/synthetic-publish-cycle.cjs --origin http://localhost:4173
//   node scripts/synthetic-publish-cycle.cjs --confirm-quota-spend   (production)
//
// THIS SPENDS QUOTA THAT IS NEVER RETURNED. One successful run permanently
// consumes one of the service's `PUBLISH_LIFETIME_LIMIT` publishes (default
// 1000) which every real user shares, because remove() does not call
// releaseCounter(). Read the header comment in scripts/synthetic/publish-cycle.cjs
// before changing how often this runs.
//
// Because of that, running it against a non-loopback origin requires
// --confirm-quota-spend. The scheduled workflow passes it; a developer who
// typed the command out of curiosity does not, and gets a refusal instead of a
// spent counter.
//
// Exits 1 if any step fails.

"use strict";

const fs = require("node:fs");
const { PRODUCTION_ORIGIN, formatReport } = require("./synthetic/checks.cjs");
const { PUBLISH_CYCLE_FOOTNOTE, runPublishCycle } = require("./synthetic/publish-cycle.cjs");
const { createFetchTransport, parseArgs, writeStepSummary } = require("./synthetic/http.cjs");

const isLocalOrigin = (origin) => {
  try {
    const { hostname } = new URL(origin);
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
  } catch {
    return false;
  }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const origin = args.origin || process.env.SYNTHETIC_ORIGIN || PRODUCTION_ORIGIN;
  const timeoutMs = Number(args.timeout || 20_000);

  if (!isLocalOrigin(origin) && args["confirm-quota-spend"] !== "true") {
    console.error(
      `Refusing to publish to ${origin} without --confirm-quota-spend.\n` +
      "A successful publish permanently consumes one unit of the shared lifetime\n" +
      "quota; revoking does not give it back. See scripts/synthetic/publish-cycle.cjs."
    );
    process.exitCode = 2;
    return;
  }

  const request = createFetchTransport({ origin, timeoutMs });
  const { steps, runId, publishedId, revoked } = await runPublishCycle({ request });

  for (const step of steps) {
    console.log(`${step.ok ? "PASS" : "FAIL"}  ${step.id}  ${step.title}`);
    for (const failure of step.failures) console.log(`        ${failure}`);
  }

  const failed = steps.filter((step) => !step.ok);
  console.log(`\n${steps.length - failed.length}/${steps.length} publish-cycle steps passed against ${origin}`);
  console.log(`run id: ${runId}`);
  if (publishedId) {
    console.log(`published id: ${publishedId} (${revoked ? "revoked" : "NOT REVOKED — clean this up by hand"})`);
    console.log("one unit of the lifetime publishing quota was spent and will not be returned");
  }

  const report = formatReport({
    results: steps,
    origin,
    checkedAt: new Date().toISOString(),
    label: "Synthetic publish cycle (writes to production)",
    footnote: PUBLISH_CYCLE_FOOTNOTE
  });
  if (args.report) fs.writeFileSync(args.report, report);
  writeStepSummary(report);

  process.exitCode = failed.length === 0 ? 0 : 1;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
