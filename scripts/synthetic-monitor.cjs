// Runs the read-only synthetic checks against a deployed origin.
//
//   node scripts/synthetic-monitor.cjs
//   node scripts/synthetic-monitor.cjs --origin http://localhost:4173
//   node scripts/synthetic-monitor.cjs --report /tmp/report.md
//
// Safe to run as often as you like: it writes nothing, publishes nothing and
// consumes no quota. See scripts/synthetic/checks.cjs for what it cannot see.
// Exits 1 if any check fails.

"use strict";

const fs = require("node:fs");
const {
  PRODUCTION_ORIGIN,
  READ_ONLY_CHECKS,
  READ_ONLY_FOOTNOTE,
  formatReport,
  runChecks
} = require("./synthetic/checks.cjs");
const { createFetchTransport, parseArgs, sleep, writeStepSummary } = require("./synthetic/http.cjs");

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const origin = args.origin || process.env.SYNTHETIC_ORIGIN || PRODUCTION_ORIGIN;
  const timeoutMs = Number(args.timeout || 15_000);
  const retryDelayMs = Number(args["retry-delay"] || 15_000);

  const transport = createFetchTransport({ origin, timeoutMs });
  const fetchResponse = ({ method, path }) => transport({ method, path });

  let results = await runChecks({ fetchResponse });

  // A single dropped packet or a cold serverless start must not open an issue.
  // A real failure survives a pause; a blip does not. This is the difference
  // between an alert people read and an alert people mute.
  const firstPassFailures = results.filter((result) => !result.ok).map((result) => result.id);
  if (firstPassFailures.length > 0 && retryDelayMs > 0) {
    console.log(`${firstPassFailures.length} check(s) failed; retrying them in ${retryDelayMs}ms before reporting.`);
    await sleep(retryDelayMs);
    const retried = await runChecks({
      checks: READ_ONLY_CHECKS.filter((check) => firstPassFailures.includes(check.id)),
      fetchResponse
    });
    const byId = new Map(retried.map((result) => [result.id, result]));
    results = results.map((result) => byId.get(result.id) || result);
  }

  const report = formatReport({
    results,
    origin,
    checkedAt: new Date().toISOString(),
    label: "Synthetic monitoring (read-only)",
    footnote: READ_ONLY_FOOTNOTE
  });

  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.id}  [${result.request}${result.status === null ? "" : ` -> ${result.status}`}]`);
    for (const failure of result.failures) console.log(`        ${failure}`);
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} read-only checks passed against ${origin}`);

  if (args.report) fs.writeFileSync(args.report, report);
  writeStepSummary(report);

  process.exitCode = failed.length === 0 ? 0 : 1;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
