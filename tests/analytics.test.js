const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const makeStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
    snapshot: () => Object.fromEntries(values)
  };
};

const deniedStorage = () => ({
  getItem: () => {
    throw new Error("storage denied");
  },
  removeItem: () => {
    throw new Error("storage denied");
  },
  setItem: () => {
    throw new Error("storage denied");
  }
});

const loadAnalytics = ({
  hostname = "invitation-maker-one.vercel.app",
  search = "",
  pathname = "/",
  config = {},
  posthog,
  sessionStorage = makeStorage(),
  TemplateCatalog,
  va
} = {}) => {
  const script = read("assets/analytics.js");
  const rootObject = {
    InvitationAnalyticsConfig: config,
    URLSearchParams,
    URL,
    crypto: { randomUUID: () => "flow-test-id" },
    location: {
      hostname,
      pathname,
      search
    },
    navigator: { doNotTrack: "0" },
    posthog,
    sessionStorage,
    TemplateCatalog,
    va,
    window: null
  };
  rootObject.window = rootObject;
  vm.runInNewContext(script, {
    globalThis: rootObject,
    module: { exports: {} },
    window: rootObject
  }, { filename: "assets/analytics.js" });
  return { analytics: rootObject.InvitationAnalytics, rootObject, sessionStorage };
};

test("public config exposes configured public analytics endpoints and preserves overrides", () => {
  const rootObject = { window: null };
  rootObject.window = rootObject;

  vm.runInNewContext(read("assets/analytics-config.js"), {
    globalThis: rootObject,
    window: rootObject
  }, { filename: "assets/analytics-config.js" });

  assert.equal(JSON.stringify(rootObject.InvitationAnalyticsConfig), JSON.stringify({
    enabled: true,
    posthog: {
      apiHost: "https://us.i.posthog.com",
      token: "phc_sGYr45steRy4nEUdioFcaPkueKdebqBBbxbUPrk5rMZ8"
    },
    ga4: { measurementId: "" },
    vercel: { analyticsScriptSrc: "/_vercel/insights/script.js" }
  }));

  const override = {
    enabled: false,
    posthog: { apiHost: "https://override.example", token: "override-token" },
    vercel: { analyticsScriptSrc: "/override.js" }
  };
  const overrideRoot = { InvitationAnalyticsConfig: override, window: null };
  overrideRoot.window = overrideRoot;

  vm.runInNewContext(read("assets/analytics-config.js"), {
    globalThis: overrideRoot,
    window: overrideRoot
  }, { filename: "assets/analytics-config.js" });

  assert.equal(overrideRoot.InvitationAnalyticsConfig, override);
});

test("production host captures allowed first-touch UTM values once", () => {
  const { analytics, sessionStorage } = loadAnalytics({
    search: "?utm_source=kakao&utm_medium=social&utm_campaign=launch_2026_09"
  });

  const first = analytics.registerFirstTouch();
  const second = analytics.registerFirstTouch("?utm_source=instagram&utm_medium=social&utm_campaign=launch_2026_09");

  assert.equal(JSON.stringify(first), JSON.stringify({
    utm_campaign: "launch_2026_09",
    utm_medium: "social",
    utm_source: "kakao"
  }));
  assert.equal(JSON.stringify(second), JSON.stringify(first));
  assert.match(sessionStorage.snapshot()["invitation_analytics:first_touch"], /kakao/);
});

test("invalid or absent UTM freezes an empty first touch and rejects restored arbitrary values", () => {
  const sessionStorage = makeStorage();
  sessionStorage.setItem("invitation_analytics:first_touch", JSON.stringify({
    utm_campaign: "private_campaign",
    utm_medium: "email",
    utm_source: "friend"
  }));
  const restored = loadAnalytics({
    search: "?utm_source=kakao&utm_medium=social&utm_campaign=launch_2026_09",
    sessionStorage
  }).analytics;
  const empty = loadAnalytics({ search: "", sessionStorage: makeStorage() }).analytics;

  assert.equal(JSON.stringify(restored.registerFirstTouch()), JSON.stringify({}));
  assert.equal(JSON.stringify(empty.registerFirstTouch()), JSON.stringify({}));
});

test("preview and local hosts fail open without analytics dispatch", () => {
  const captured = [];
  const { analytics } = loadAnalytics({
    hostname: "localhost",
    va: { track: (...args) => captured.push(args) }
  });

  assert.equal(analytics.trackTemplateSelected({ templateId: "royal" }), false);
  assert.deepEqual(captured, []);
});

test("missing runtime config keeps analytics off", () => {
  const captured = [];
  const { analytics, rootObject } = loadAnalytics({
    config: null,
    va: { track: (...args) => captured.push(args) }
  });

  assert.equal(analytics.trackLandingViewed(), false);
  assert.deepEqual(captured, []);
});

test("PostHog events dispatch only allowlisted properties with flow and first-touch context", () => {
  const captured = [];
  const { analytics } = loadAnalytics({
    search: "?utm_source=qr&utm_medium=offline&utm_campaign=launch_2026_09",
    posthog: {
      init: () => {},
      capture: (name, props) => captured.push({ name, props })
    },
    config: {
      posthog: { apiHost: "https://us.i.posthog.com", token: "ph_test" }
    }
  });
  analytics.initPostHog();

  assert.equal(analytics.trackTemplateSelected({
    templateId: "royal",
    occasion: "birthday",
    name: "raw person",
    contact: "raw contact",
    url: "https://example.com/private"
  }), true);

  assert.equal(JSON.stringify(captured), JSON.stringify([{
    name: "template_selected",
    props: {
      campaign: "launch_2026_09",
      flow_id: "flow-test-id",
      medium: "offline",
      occasion: "birthday",
      source: "qr",
      template_id: "royal"
    }
  }]));
});

test("event string properties are restricted to configured and catalog enums", () => {
  const captured = [];
  const { analytics } = loadAnalytics({
    config: {
      allowedTemplateIds: ["royal"],
      posthog: { apiHost: "https://us.i.posthog.com", token: "ph_test" }
    },
    TemplateCatalog: {
      FAMILY_IDS: ["romantic-story"],
      OCCASION_IDS: ["birthday"]
    },
    posthog: {
      init: () => {},
      capture: (name, props) => captured.push({ name, props })
    }
  });
  analytics.initPostHog();

  assert.equal(analytics.trackEditingStarted({
    templateId: "royal",
    occasion: "birthday",
    layoutFamily: "romantic-story",
    fieldGroup: "details"
  }), true);
  assert.equal(analytics.trackShareClicked({
    templateId: "evil-template",
    channel: "raw-channel",
    occasion: "raw-occasion"
  }), true);

  assert.equal(JSON.stringify(captured[0].props), JSON.stringify({
    field_group: "details",
    flow_id: "flow-test-id",
    occasion: "birthday",
    template_id: "royal"
  }));
  assert.equal(JSON.stringify(captured[1].props), JSON.stringify({
    flow_id: "flow-test-id"
  }));
});


test("Vercel Analytics never receives custom events on Hobby-safe builds", () => {
  const captured = [];
  const { analytics } = loadAnalytics({
    va: { track: (name, props) => captured.push({ name, props }) }
  });

  assert.equal(analytics.trackTemplateSelected({ templateId: "royal" }), false);
  assert.deepEqual(captured, []);
});

test("dedup keys suppress repeated PostHog events and never include draft ids", () => {
  const captured = [];
  const { analytics } = loadAnalytics({
    posthog: {
      init: () => {},
      capture: (name, props) => captured.push({ name, props })
    },
    config: {
      posthog: { apiHost: "https://us.i.posthog.com", token: "ph_test" }
    }
  });
  analytics.initPostHog();

  assert.equal(analytics.trackDraftSaved({ draftId: "draft-1", dedupKey: "save:1" }), true);
  assert.equal(analytics.trackDraftSaved({ draftId: "draft-1", dedupKey: "save:1" }), false);

  assert.equal(captured.length, 1);
  assert.equal(captured[0].name, "draft_saved");
  assert.equal(JSON.stringify(captured[0].props), JSON.stringify({
    flow_id: "flow-test-id"
  }));
});

test("dedup waits for a configured provider and still works when storage is denied", () => {
  const captured = [];
  const rootPostHog = {
    init: () => {},
    capture: (name, props) => captured.push({ name, props })
  };
  const { analytics, rootObject } = loadAnalytics({
    config: { posthog: { apiHost: "https://us.i.posthog.com", token: "ph_test" } },
    posthog: undefined,
    sessionStorage: deniedStorage()
  });

  assert.equal(analytics.trackHtmlDownloaded({ templateId: "royal" }, { dedupKey: "download:royal:1" }), false);
  rootObject.posthog = rootPostHog;
  assert.equal(analytics.initPostHog(), true);
  assert.equal(analytics.trackHtmlDownloaded({ templateId: "royal" }, { dedupKey: "download:royal:1" }), true);
  assert.equal(analytics.trackHtmlDownloaded({ templateId: "royal" }, { dedupKey: "download:royal:1" }), false);
  assert.equal(captured.length, 1);
});

test("PostHog loader installs an official-compatible array stub and appends the SDK once", () => {
  const created = [];
  const document = {
    createElement: () => ({
      setAttribute(name, value) {
        this[name] = value;
      }
    }),
    head: { append: (script) => created.push(script) }
  };
  const { analytics, rootObject } = loadAnalytics({
    config: {
      posthog: { apiHost: "https://us.i.posthog.com", token: "ph_test" }
    }
  });
  rootObject.document = document;

  assert.equal(analytics.initPostHog(), true);
  assert.equal(analytics.initPostHog(), true);

  assert.equal(created.length, 1);
  assert.equal(created[0].async, true);
  assert.equal(created[0].src, "https://us-assets.i.posthog.com/static/array.js");
  assert.equal(created[0].type, "text/javascript");
  assert.equal(created[0]["data-invitation-analytics"], "posthog");
  assert.equal(Array.isArray(rootObject.posthog), true);
  assert.equal(rootObject.posthog.__SV, 1);
  assert.equal(rootObject.posthog._i.length, 1);
  assert.equal(rootObject.posthog._i[0][0], "ph_test");
  assert.equal(rootObject.posthog._i[0][1].api_host, "https://us.i.posthog.com");
  assert.equal(rootObject.posthog._i[0][1].autocapture, false);
  assert.equal(rootObject.posthog._i[0][1].capture_pageview, false);
});

test("PostHog array stub queues sanitized manual captures before the SDK loads", () => {
  const document = {
    createElement: () => ({
      setAttribute(name, value) {
        this[name] = value;
      }
    }),
    head: { append: () => {} }
  };
  const { analytics, rootObject } = loadAnalytics({
    search: "?utm_source=qr&utm_medium=offline&utm_campaign=launch_2026_09",
    config: {
      posthog: { apiHost: "https://us.i.posthog.com", token: "ph_test" }
    }
  });
  rootObject.document = document;

  assert.equal(analytics.initPostHog(), true);
  assert.equal(analytics.trackTemplateSelected({
    templateId: "royal",
    occasion: "birthday",
    name: "raw person",
    url: "https://example.com/private"
  }), true);

  assert.equal(JSON.stringify(rootObject.posthog), JSON.stringify([
    ["capture", "template_selected", {
      campaign: "launch_2026_09",
      flow_id: "flow-test-id",
      medium: "offline",
      occasion: "birthday",
      source: "qr",
      template_id: "royal"
    }]
  ]));
});

test("optout and disabled config fail open", () => {
  const captured = [];
  const optedOut = loadAnalytics({
    config: { enabled: true, optOut: true },
    va: { track: (...args) => captured.push(args) }
  }).analytics;
  const disabled = loadAnalytics({
    config: { enabled: false },
    va: { track: (...args) => captured.push(args) }
  }).analytics;

  assert.equal(optedOut.trackLandingViewed(), false);
  assert.equal(disabled.trackLandingViewed(), false);
  assert.deepEqual(captured, []);
});

test("resetFlow starts a new tab-local workflow id and clears dedup decisions", () => {
  const captured = [];
  let nextId = 0;
  const { analytics, rootObject } = loadAnalytics({
    posthog: {
      init: () => {},
      capture: (name, props) => captured.push({ name, props })
    },
    config: {
      posthog: { apiHost: "https://us.i.posthog.com", token: "ph_test" }
    }
  });
  analytics.initPostHog();

  assert.equal(analytics.trackHtmlDownloaded({ dedupKey: "download:royal:1" }), true);
  assert.equal(analytics.trackHtmlDownloaded({ dedupKey: "download:royal:1" }), false);
  rootObject.crypto = { randomUUID: () => `flow-${nextId += 1}` };
  assert.equal(analytics.resetFlow(), true);
  assert.equal(analytics.trackHtmlDownloaded({ dedupKey: "download:royal:1" }), true);

  assert.deepEqual(captured.map((event) => event.props.flow_id), ["flow-test-id", "flow-1"]);
});


test("PostHog initializes manual-only and strips automatic URL/referrer context", () => {
  const calls = [];
  const { analytics } = loadAnalytics({
    config: {
      posthog: {
        apiHost: "https://us.i.posthog.com",
        token: "ph_test"
      }
    },
    posthog: {
      init: (...args) => calls.push(args)
    }
  });

  assert.equal(analytics.initPostHog(), true);
  assert.equal(calls[0][0], "ph_test");
  assert.equal(calls[0][1].api_host, "https://us.i.posthog.com");
  assert.equal(calls[0][1].autocapture, false);
  assert.equal(calls[0][1].capture_pageview, false);
  assert.equal(calls[0][1].capture_pageleave, false);
  assert.equal(calls[0][1].disable_session_recording, true);
  assert.equal(calls[0][1].capture_exceptions, false);
  assert.equal(calls[0][1].capture_dead_clicks, false);
  assert.equal(calls[0][1].rageclick, false);
  assert.equal(calls[0][1].capture_heatmaps, false);
  assert.equal(calls[0][1].capture_performance, false);
  assert.equal(calls[0][1].advanced_disable_feature_flags, true);
  assert.equal(calls[0][1].disable_external_dependency_loading, true);
  assert.equal(calls[0][1].enable_recording_console_log, false);
  assert.equal(JSON.stringify(calls[0][1].logs), JSON.stringify({ captureConsoleLogs: false }));
  assert.equal(calls[0][1].person_profiles, "never");
  assert.equal(calls[0][1].persistence, "sessionStorage");
  assert.equal(calls[0][1].remote_config_refresh_interval_ms, 0);

  assert.equal(JSON.stringify(calls[0][1].before_send({
    event: "template_selected",
    properties: {
      "$anon_distinct_id": "anon-id",
      "$current_url": "https://private.example",
      "$initial_current_url": "https://private.example",
      "$initial_referrer": "https://private.example",
      "$referrer": "https://private.example",
      "$session_entry_referring_domain": "private.example",
      name: "raw person",
      token: "ph_test",
      template_id: "royal"
    }
  })), JSON.stringify({
    event: "template_selected",
    properties: {
      "$anon_distinct_id": "anon-id",
      token: "ph_test",
      template_id: "royal"
    }
  }));
  assert.equal(calls[0][1].before_send({ event: "$pageview", properties: { template_id: "royal" } }), null);
});

test("Vercel loader queues beforeSend before appending the SDK and is idempotent", () => {
  const created = [];
  const document = {
    createElement: () => ({
      setAttribute(name, value) {
        this[name] = value;
      }
    }),
    head: { append: (script) => created.push(script) }
  };
  const { analytics, rootObject } = loadAnalytics({
    config: {
      vercel: { analyticsScriptSrc: "/_vercel/insights/script.js" }
    }
  });

  assert.equal(analytics.loadVercelAnalytics(document), true);
  assert.equal(analytics.loadVercelAnalytics(document), true);
  assert.equal(created.length, 1);
  assert.equal(created[0].beforeSend, undefined);
  assert.equal(rootObject.vaq[0][0], "beforeSend");
  assert.equal(JSON.stringify(rootObject.vaq[0][1]({
    url: "https://invitation-maker-one.vercel.app/private/path?x=1#hash"
  })), JSON.stringify({ url: "https://invitation-maker-one.vercel.app/" }));
  assert.equal(rootObject.vaq[0][1]({ url: "not a url" }), null);
});
