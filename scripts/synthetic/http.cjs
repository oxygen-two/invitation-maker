// The only place in the synthetic suite that touches the network. Keeping it
// here is what makes scripts/synthetic/checks.cjs and
// scripts/synthetic/publish-cycle.cjs testable: everything else receives a
// transport and never knows whether it is real.
//
// Node 22 ships fetch globally, so this suite has no dependencies at all and
// the monitoring workflow can skip `npm ci` entirely.

"use strict";

const DEFAULT_TIMEOUT_MS = 15_000;

// Identifies the monitor in access logs so a human reading traffic can tell
// synthetic requests from real guests.
const USER_AGENT = "invitation-maker-synthetic-monitor (+https://github.com/oxygen-two/invitation-maker)";

const createFetchTransport = ({ origin, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch }) => {
  return async ({ method = "GET", path, headers = {}, body }) => {
    const response = await fetchImpl(new URL(path, origin), {
      method,
      headers: { "user-agent": USER_AGENT, ...headers },
      body,
      // Never follow redirects. A check that asserts "200 with an <h1>" would
      // otherwise pass happily while production quietly 301s the landing page
      // somewhere else, which is exactly the class of silent breakage this
      // suite exists to catch.
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs)
    });
    return {
      status: response.status,
      // fetch lowercases header names, which is what the checks expect.
      headers: Object.fromEntries(response.headers),
      body: await response.text()
    };
  };
};

// Supports `--flag value`, `--flag=value` and bare `--flag` (which reads as
// "true"). Deliberately tiny: the alternative is a dependency, and this suite
// runs in a workflow that installs nothing.
const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const equals = token.indexOf("=");
    if (equals !== -1) {
      args[token.slice(2, equals)] = token.slice(equals + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      args[token.slice(2)] = "true";
      continue;
    }
    args[token.slice(2)] = next;
    index += 1;
  }
  return args;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// GitHub renders this file under the job in the Actions UI, so the same report
// that would go into an issue is readable without opening one.
const writeStepSummary = (markdown, env = process.env, fs = require("node:fs")) => {
  if (!env.GITHUB_STEP_SUMMARY) return false;
  fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  return true;
};

module.exports = {
  DEFAULT_TIMEOUT_MS,
  USER_AGENT,
  createFetchTransport,
  parseArgs,
  sleep,
  writeStepSummary
};
