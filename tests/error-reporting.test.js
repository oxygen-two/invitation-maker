/* Error reports may contain only closed fields and allowlisted asset frames.
   Keep the reporter and analytics transport boundaries in sync. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const PRODUCTION_HOST = "invitation-maker-one.vercel.app";
// 22 base62 characters, the shape server/validation.cjs issues and vercel.json
// routes on. This id is the capability to read a private invitation.
const INVITATION_ID = "Ab3xKq9ZmP2wTn7Lc5Ve1R";
// 43 url-safe base64 characters: the owner's management token, the capability
// to delete that same invitation.
const MANAGEMENT_TOKEN = "s7Kd-2fQzX9pLm4VbNc8Rt1Ye6Wa0Hj3Ug5Io-Dq_Zs";

const KAKAOTALK_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.5";
const MOBILE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

const makeStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value))
  };
};

// Run both real browser scripts so assertions see the final PostHog payload.
const loadReporting = ({
  hostname = PRODUCTION_HOST,
  pathname = "/",
  search = "",
  href,
  config = { enabled: true, posthog: { apiHost: "https://us.i.posthog.com", token: "ph_test" } },
  userAgent = MOBILE_SAFARI,
  capture,
  withAnalytics = true,
  listeners
} = {}) => {
  const captured = [];
  const initCalls = [];
  const registered = listeners || [];
  const rootObject = {
    InvitationAnalyticsConfig: config,
    URL,
    URLSearchParams,
    crypto: { randomUUID: () => "flow-test-id" },
    location: {
      hostname,
      href: href || `https://${hostname}${pathname}${search}`,
      origin: `https://${hostname}`,
      pathname,
      search
    },
    navigator: { doNotTrack: "0", userAgent },
    posthog: {
      init: (...args) => initCalls.push(args),
      capture: capture || ((name, props) => captured.push({ name, props }))
    },
    sessionStorage: makeStorage(),
    addEventListener: (type, handler, options) => registered.push({ type, handler, options }),
    document: { readyState: "complete" },
    window: null
  };
  rootObject.window = rootObject;

  if (withAnalytics) {
    vm.runInNewContext(read("assets/analytics/analytics.js"), {
      globalThis: rootObject,
      module: { exports: {} },
      window: rootObject
    }, { filename: "assets/analytics/analytics.js" });
    rootObject.InvitationAnalytics.initPostHog();
  }

  vm.runInNewContext(read("assets/analytics/error-reporting.js"), {
    globalThis: rootObject,
    module: { exports: {} },
    window: rootObject
  }, { filename: "assets/analytics/error-reporting.js" });

  const reporting = rootObject.InvitationErrorReporting;
  reporting.reset();
  reporting.init();

  const fire = (type, event) => {
    for (const entry of registered) {
      if (entry.type === type) entry.handler(event);
    }
  };

  return { captured, fire, initCalls, registered, reporting, rootObject };
};

test("a thrown error is reported as a fixed category with safe asset frames", () => {
  const { captured, fire } = loadReporting();

  fire("error", {
    colno: 14,
    error: Object.assign(new Error("skipIntro is not a function"), {
      stack: "TypeError: skipIntro is not a function\n    at HTMLButtonElement.onClick (https://invitation-maker-one.vercel.app/assets/invitation/intro-effects.js:223:9)"
    }),
    filename: "https://invitation-maker-one.vercel.app/assets/invitation/intro-effects.js",
    lineno: 223,
    message: "Uncaught TypeError: skipIntro is not a function",
    target: undefined
  });

  assert.equal(captured.length, 1);
  assert.equal(captured[0].name, "client_error");
  assert.equal(captured[0].props.error_kind, "runtime");
  assert.equal(captured[0].props.error_context, "window");
  assert.equal(captured[0].props.error_message, "runtime_error");
  assert.equal(captured[0].props.error_stack, "/assets/invitation/intro-effects.js:223:9");
  assert.equal(captured[0].props.error_source, "/assets/invitation/intro-effects.js");
  assert.equal(captured[0].props.error_line, 223);
  assert.equal(captured[0].props.error_column, 14);
});

test("an unhandled promise rejection is reported", () => {
  const { captured, fire } = loadReporting();

  fire("unhandledrejection", {
    reason: Object.assign(new Error("Failed to fetch"), {
      stack: "TypeError: Failed to fetch\n    at mount (/assets/publishing/shared-invitation.js:118:24)"
    })
  });

  assert.equal(captured.length, 1);
  assert.equal(captured[0].props.error_kind, "promise");
  assert.equal(captured[0].props.error_message, "promise_rejection");
  assert.equal(captured[0].props.error_stack, "/assets/publishing/shared-invitation.js:118:24");
});

test("a rejection with a non-Error reason still reports something nameable", () => {
  const { captured, fire } = loadReporting();

  fire("unhandledrejection", { reason: undefined });

  assert.equal(captured.length, 1);
  assert.equal(captured[0].props.error_message, "promise_rejection");
});

test("a script that never loads is reported, because that page shows no error at all", () => {
  const { captured, fire } = loadReporting();

  fire("error", {
    target: { src: "https://invitation-maker-one.vercel.app/assets/studio/app.js", tagName: "SCRIPT" }
  });

  assert.equal(captured.length, 1);
  assert.equal(captured[0].props.error_kind, "resource");
  assert.equal(captured[0].props.error_context, "resource_load");
  assert.equal(captured[0].props.error_message, "resource_load_failure");
  assert.equal(captured[0].props.error_source, "/assets/studio/app.js");
});

test("page identity is coarse and invitation URLs never reach the payload", () => {
  const { captured, fire, reporting } = loadReporting({
    pathname: `/i/${INVITATION_ID}`,
    search: "?from=kakao"
  });

  fire("error", {
    error: Object.assign(new Error(`Failed to load https://invitation-maker-one.vercel.app/api/invitations/${INVITATION_ID}`), {
      stack: `Error\n    at mount (https://invitation-maker-one.vercel.app/i/${INVITATION_ID}:1:1)`
    }),
    filename: `https://invitation-maker-one.vercel.app/i/${INVITATION_ID}`,
    lineno: 1,
    message: "load failed"
  });

  const props = captured[0].props;
  const serialized = JSON.stringify(props);

  assert.equal(props.page, "shared");
  assert.equal(props.page, "shared");
  assert.equal(Object.hasOwn(props, "page_url"), false);
  assert.equal(Object.hasOwn(props, "error_source"), false);
  assert.equal(Object.hasOwn(props, "error_stack"), false);
  assert.equal(props.error_message, "runtime_error");
  assert.equal(serialized.includes(INVITATION_ID), false, "the raw invitation id must never appear in a report");
  // The search string carried the id's referral context; it is dropped whole.
  assert.equal(serialized.includes("from=kakao"), false);

  assert.equal(typeof reporting.maskUrl, "undefined");
  assert.equal(typeof reporting.maskIdentifiers, "undefined");
});

test("free-text messages are replaced rather than scrubbed or truncated", () => {
  const { captured, reporting } = loadReporting();
  // Past the 300-character message limit, so truncation happens after masking
  // rather than before it. Half of a private address is still half of one.
  const padding = "x".repeat(295);

  reporting.report({ message: `${padding} ${INVITATION_ID}` });

  assert.equal(captured[0].props.error_message, "runtime_error");
  assert.equal(JSON.stringify(captured[0].props).includes("x".repeat(20)), false);
});

test("the owner's management token is discarded in every form it can appear in", () => {
  const { captured, reporting } = loadReporting();

  reporting.report({
    message: `Bearer ${MANAGEMENT_TOKEN} rejected`,
    stack: `Error\n    at sendPending (token=${MANAGEMENT_TOKEN})`
  });

  const serialized = JSON.stringify(captured[0].props);
  assert.equal(serialized.includes(MANAGEMENT_TOKEN), false);
  assert.equal(serialized.includes(MANAGEMENT_TOKEN.slice(0, 16)), false);
  assert.equal(captured[0].props.error_message, "runtime_error");
  assert.equal(Object.hasOwn(captured[0].props, "error_stack"), false);
});

test("a report built from a page full of invitation content carries none of it", () => {
  const { captured, reporting } = loadReporting({ pathname: `/i/${INVITATION_ID}` });

  /* Everything a real invitation holds, pushed at the reporter through every
     door it has: as extra keys on the input, and as text inside the fields it
     does read. A payload is only safe if both are refused. */
  const personal = {
    address: "221B Baker Street, London",
    bride: "Alice Johnson",
    date: "2026-10-17",
    draft: { items: [{ caption: "본식 스냅", type: "photo" }] },
    email: "alice.johnson@example.com",
    groom: "Robert Smith",
    heroImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    invitationId: INVITATION_ID,
    localStorage: JSON.stringify({ "invitation-maker.saved": "Robert Smith and Alice Johnson" }),
    managementToken: MANAGEMENT_TOKEN,
    phone: "010-2345-6789",
    venue: "The Grand Hotel Crystal Ballroom"
  };

  reporting.report({
    ...personal,
    message: `Cannot read properties of null (reading 'render') while drawing ${personal.venue} for ${personal.groom} <${personal.email}> ${personal.phone}`,
    source: "https://evil.example/private/Alice-Johnson/wedding.js?token=secret",
    stack: `Error: ${personal.bride}\n    at buildStandaloneHtml (https://invitation-maker-one.vercel.app/assets/invitation/core.js:690:11)\n    at forgedFrame (https://evil.example/assets/studio/app.js:12:3)\n    at privateGuestPage (https://evil.example/private/Alice-Johnson/wedding.js:12:3)\n    at fetch (/api/invitations/${INVITATION_ID})`
  });

  const props = captured[0].props;
  const serialized = JSON.stringify(props);

  for (const [field, value] of Object.entries(personal)) {
    const needle = typeof value === "string" ? value : JSON.stringify(value);
    assert.equal(serialized.includes(needle), false, `${field} must not reach the report`);
  }
  for (const forbidden of ["Alice", "Johnson", "Robert", "Smith", "Grand Hotel", "Baker Street", "2345-6789", "example.com", "base64", "evil.example", "privateGuestPage"]) {
    assert.equal(serialized.includes(forbidden), false, `"${forbidden}" must not reach the report`);
  }
  // Not a single one of the extra keys survived: the payload is built by name.
  for (const key of Object.keys(personal)) {
    assert.equal(Object.hasOwn(props, key), false, `${key} must not become a property`);
  }
  assert.deepEqual(Object.keys(props).sort(), [
    "browser_env",
    "error_context",
    "error_kind",
    "error_message",
    "error_stack",
    "os_family",
    "os_version",
    "page"
  ]);
  assert.equal(props.error_message, "runtime_error");
  assert.equal(props.error_stack, "/assets/invitation/core.js:690:11");
  assert.equal(Object.hasOwn(props, "error_source"), false);
});

test("reporting is suppressed when analytics is disabled, opted out, or off production", () => {
  for (const suppressed of [
    { config: { enabled: false, posthog: { token: "ph_test" } } },
    { config: { enabled: true, optOut: true, posthog: { token: "ph_test" } } },
    { hostname: "localhost" },
    { hostname: "invitation-maker-git-preview.vercel.app" }
  ]) {
    const { captured, fire, reporting } = loadReporting(suppressed);

    fire("error", { error: new Error("boom"), message: "boom" });
    fire("unhandledrejection", { reason: new Error("boom") });

    assert.equal(reporting.report({ message: "boom" }), false);
    assert.deepEqual(captured, [], `${JSON.stringify(suppressed)} must send nothing`);
  }
});

test("reporting is suppressed when Do Not Track is on, exactly as analytics is", () => {
  const { captured, reporting, rootObject } = loadReporting();
  rootObject.navigator = { doNotTrack: "1", userAgent: MOBILE_SAFARI };

  assert.equal(reporting.report({ message: "boom" }), false);
  assert.deepEqual(captured, []);
});

test("a throwing transport does not propagate and does not re-report", () => {
  let calls = 0;
  const nested = [];
  const harness = {};
  Object.assign(harness, loadReporting({
    capture: () => {
      calls += 1;
      /* The reporter failing WHILE reporting is the loop worth fearing: a
         transport that throws, a handler that catches it, and a handler that
         reports what it caught. The re-entrancy guard is what stops it. */
      nested.push(harness.reporting.report({ context: "boot", message: "transport exploded" }));
      // The shape of a transport that dies mid-send: an SDK that never
      // finished loading, a blocked host, a quota rejection.
      throw new Error("transport exploded");
    }
  }));
  const explode = () => harness.fire("error", {
    error: Object.assign(new Error("boom"), { stack: "Error: boom\n    at app.js:1:1" }),
    filename: "https://invitation-maker-one.vercel.app/assets/studio/app.js",
    lineno: 1,
    message: "boom"
  });

  assert.doesNotThrow(explode);
  // The reporter's own failure is not itself reportable, and the identical
  // fault is not retried on the next throw.
  assert.doesNotThrow(explode);

  assert.equal(calls, 1);
  assert.deepEqual(nested, [false]);
});

test("a repeating fault reports once and a storm cannot exceed the page budget", () => {
  const { captured, reporting } = loadReporting();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    reporting.report({ message: "render loop" });
  }
  assert.equal(captured.length, 1);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    reporting.report({ context: reporting.ERROR_CONTEXTS[attempt % reporting.ERROR_CONTEXTS.length], status: 400 + attempt });
  }
  assert.equal(captured.length, reporting.MAX_REPORTS_PER_PAGE);
});

test("a handler with no analytics on the page fails silently instead of throwing", () => {
  const { fire, reporting } = loadReporting({ withAnalytics: false });

  assert.doesNotThrow(() => fire("error", { error: new Error("boom"), message: "boom" }));
  assert.doesNotThrow(() => fire("unhandledrejection", { reason: new Error("boom") }));
  assert.equal(reporting.report({ message: "boom" }), false);
});

test("window.onerror is wired alongside the listener and the pair reports once", () => {
  const { captured, fire, rootObject } = loadReporting();
  const error = Object.assign(new Error("Unexpected token '?'"), { stack: "SyntaxError: Unexpected token '?'" });

  rootObject.onerror("Uncaught SyntaxError", "https://invitation-maker-one.vercel.app/assets/studio/app.js", 1, 1, error);
  fire("error", {
    colno: 1,
    error,
    filename: "https://invitation-maker-one.vercel.app/assets/studio/app.js",
    lineno: 1,
    message: "Uncaught SyntaxError"
  });

  assert.equal(captured.length, 1);
  assert.equal(captured[0].props.error_message, "runtime_error");
});

test("an in-app WebView is distinguishable from Safari without sending the user agent", () => {
  const inApp = loadReporting({ userAgent: KAKAOTALK_IOS, pathname: `/i/${INVITATION_ID}` });
  inApp.reporting.report({ message: "skip did nothing" });

  const props = inApp.captured[0].props;
  assert.equal(props.browser_env, "kakaotalk");
  assert.equal(props.os_family, "ios");
  assert.equal(props.os_version, "16.6");
  assert.equal(props.page, "shared");
  // The user agent itself is a device fingerprint and never travels.
  assert.equal(JSON.stringify(props).includes("Mozilla/5.0"), false);
  assert.equal(JSON.stringify(props).includes("15E148"), false);

  const safari = loadReporting({ userAgent: MOBILE_SAFARI });
  safari.reporting.report({ message: "skip did nothing" });
  assert.equal(safari.captured[0].props.browser_env, "safari");
  assert.equal(safari.captured[0].props.os_version, "18.1");
});

test("browser environment and page identity are closed vocabularies", () => {
  const { reporting } = loadReporting();

  assert.equal(reporting.browserEnvironment("Mozilla/5.0 (Linux; Android 13; SM-S911N; wv) Chrome/120"), "android_webview");
  assert.equal(reporting.browserEnvironment("Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15"), "ios_webview");
  assert.equal(reporting.browserEnvironment("Instagram 300.0 (iPhone; iOS 17_0) AppleWebKit Mobile/15E148 Safari/604.1"), "instagram");
  assert.equal(reporting.browserEnvironment(""), "unknown");
  assert.equal(reporting.browserEnvironment("something entirely new"), "other");

  assert.equal(reporting.pageKind({ pathname: "/" }), "landing");
  assert.equal(reporting.pageKind({ pathname: "/index.html" }), "landing");
  assert.equal(reporting.pageKind({ pathname: "/welcome" }), "landing");
  assert.equal(reporting.pageKind({ pathname: "/studio" }), "studio");
  assert.equal(reporting.pageKind({ pathname: "/studio.html" }), "studio");
  assert.equal(reporting.pageKind({ pathname: "/guide" }), "guide");
  assert.equal(reporting.pageKind({ pathname: "/sample" }), "sample");
  assert.equal(reporting.pageKind({ pathname: "/viewer.html" }), "viewer");
  assert.equal(reporting.pageKind({ pathname: `/i/${INVITATION_ID}` }), "shared");
  assert.equal(reporting.pageKind({ pathname: "/unknown/route" }), "other");

  const payload = reporting.buildPayload({}, {
    location: {
      href: "https://invitation-maker-one.vercel.app/private/Alice-Johnson-wedding?guest=Robert-Smith",
      pathname: "/private/Alice-Johnson-wedding"
    },
    navigator: { userAgent: MOBILE_SAFARI }
  });
  assert.equal(payload.page, "other");
  assert.equal(JSON.stringify(payload).includes("Alice"), false);
  assert.equal(JSON.stringify(payload).includes("Robert"), false);
});

test("an application error becomes a fixed handled category", () => {
  const { captured, reporting } = loadReporting();

  reporting.reportError(
    Object.assign(new Error("초대장을 저장할 공간이 없습니다."), { code: "STORAGE_UNAVAILABLE" }),
    "publish",
    { status: 503 }
  );

  const props = captured[0].props;
  assert.equal(props.error_context, "publish");
  assert.equal(props.error_kind, "handled");
  assert.equal(props.error_status, 503);
  assert.equal(props.error_message, "handled_error");
  assert.equal(props.error_message.includes("초대장"), false);
});

test("a caller cannot smuggle free text through the enum fields", () => {
  const { captured, reporting } = loadReporting();

  reporting.report({
    context: "박지훈 and 김서연",
    kind: "<script>alert(1)</script>",
    message: "boom"
  });

  assert.equal(captured[0].props.error_context, "unknown");
  assert.equal(captured[0].props.error_kind, "runtime");
});

/* analytics.js is the floor under the reporter. These two prove the floor is
   real: a caller who skips error-reporting.js entirely and reaches for track()
   with a raw URL still cannot publish the id, and still cannot invent a key. */
test("analytics rejects free text and unlisted properties on a direct client_error capture", () => {
  const { captured, rootObject } = loadReporting();

  const sent = rootObject.InvitationAnalytics.track("client_error", {
    browser_env: "not_a_browser",
    bride: "김서연",
    error_context: "publish",
    error_kind: "network",
    error_message: `Alice Johnson at 221B Baker Street: GET /api/invitations/${INVITATION_ID} failed`,
    error_source: "https://evil.example/private/Alice-Johnson/wedding.js",
    error_stack: "at AliceJohnson (https://evil.example/private/Alice-Johnson/wedding.js:1:2)",
    error_status: 503,
    flow_id: "Alice-Johnson-private-draft",
    os_version: "not-a-version",
    page: "shared",
    page_url: `https://invitation-maker-one.vercel.app/i/${INVITATION_ID}?token=${MANAGEMENT_TOKEN}`,
    venue: "그랜드호텔"
  });

  assert.equal(sent, true);
  const props = captured[0].props;
  assert.equal(JSON.stringify(props).includes(INVITATION_ID), false);
  assert.equal(JSON.stringify(props).includes(MANAGEMENT_TOKEN), false);
  assert.equal(Object.hasOwn(props, "bride"), false);
  assert.equal(Object.hasOwn(props, "venue"), false);
  assert.equal(Object.hasOwn(props, "browser_env"), false, "an unlisted enum value is dropped, not passed through");
  assert.equal(Object.hasOwn(props, "os_version"), false);
  assert.equal(props.error_status, 503);
  assert.equal(Object.hasOwn(props, "error_message"), false);
  assert.equal(Object.hasOwn(props, "error_source"), false);
  assert.equal(Object.hasOwn(props, "error_stack"), false);
  assert.equal(Object.hasOwn(props, "flow_id"), false);
  assert.equal(Object.hasOwn(props, "page_url"), false);
});

test("PostHog's before_send hook re-sanitizes a client_error on its way out", () => {
  const { initCalls } = loadReporting();
  const beforeSend = initCalls[0][1].before_send;
  assert.equal(typeof beforeSend, "function");

  const sanitized = beforeSend({
    event: "client_error",
    properties: {
      $current_url: `https://invitation-maker-one.vercel.app/i/${INVITATION_ID}`,
      $session_id: "session-1",
      error_kind: "runtime",
      error_message: "runtime_error",
      error_source: "/assets/studio/app.js",
      error_stack: `/assets/studio/app.js:20:4\nhttps://evil.example/assets/studio/app.js:99:2\nhttps://evil.example/private/Alice-Johnson.js:1:2`,
      flow_id: "Alice-Johnson-private-draft",
      page: "studio",
      page_url: `https://invitation-maker-one.vercel.app/i/${INVITATION_ID}`,
      groom: "박지훈"
    }
  });

  assert.equal(Object.hasOwn(sanitized.properties, "$current_url"), false);
  assert.equal(Object.hasOwn(sanitized.properties, "groom"), false);
  assert.equal(JSON.stringify(sanitized.properties).includes(INVITATION_ID), false);
  assert.equal(JSON.stringify(sanitized.properties).includes("Alice"), false);
  assert.equal(sanitized.properties.error_message, "runtime_error");
  assert.equal(sanitized.properties.error_source, "/assets/studio/app.js");
  assert.equal(sanitized.properties.error_stack, "/assets/studio/app.js:20:4");
  assert.equal(Object.hasOwn(sanitized.properties, "page_url"), false);
  assert.equal(Object.hasOwn(sanitized.properties, "flow_id"), false);
  assert.equal(sanitized.properties.$session_id, "session-1");
});

/* The wiring, asserted against the shipped files rather than a fixture. A
   reporter loaded after the script it is meant to watch reports nothing when
   that script fails to parse, which is the exact failure this phase exists
   for — so the ORDER is part of the contract. */
test("every page installs the reporter before the scripts it watches", () => {
  for (const [page, prefix] of [["studio.html", "assets"], ["shared.html", "/assets"], ["viewer.html", "assets"], ["index.html", "/assets"], ["guide.html", "/assets"]]) {
    const html = read(page);
    const analyticsIndex = html.indexOf(`src="${prefix}/analytics/analytics.js"`);
    const reporterIndex = html.indexOf(`src="${prefix}/analytics/error-reporting.js"`);
    const configIndex = html.indexOf(`src="${prefix}/analytics/config.js"`);
    const watched = [...html.matchAll(/<script[^>]+src="[^"]*\/(?:invitation|studio|publishing|media|storage|integrations|site)\/[^"]+"/g)]
      .map((match) => match.index);

    assert.ok(configIndex >= 0, `${page} must load the analytics config`);
    assert.ok(analyticsIndex > configIndex, `${page} must load analytics after its config`);
    assert.ok(reporterIndex > analyticsIndex, `${page} must load the reporter after its transport`);
    assert.ok(watched.length > 0, `${page} must load scripts worth watching`);
    assert.ok(
      watched.every((position) => position > reporterIndex),
      `${page} must install error reporting before every script it can report on`
    );
  }
});

test("the pages that can fail in a console-less in-app browser all carry the reporter", () => {
  for (const page of ["studio.html", "shared.html", "viewer.html", "index.html", "guide.html"]) {
    assert.match(read(page), /analytics\/error-reporting\.js/, `${page} must report its own failures`);
  }
});

test("every local browser script is represented by a safe diagnostic path", () => {
  const { reporting } = loadReporting();
  const sources = new Set();
  for (const page of ["studio.html", "shared.html", "viewer.html", "index.html", "guide.html"]) {
    for (const match of read(page).matchAll(/<script[^>]+src="(\/?assets\/[^"?]+\.js)"/g)) {
      sources.add(`/${match[1].replace(/^\//, "")}`);
    }
  }

  for (const source of sources) {
    assert.equal(reporting.normalizeAssetPath(source), source, `${source} must be allowlisted`);
  }
});
