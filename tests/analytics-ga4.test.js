const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const makeDocument = ({ appendFailure = false } = {}) => {
  const created = [];
  const documentRef = {
    referrer: "https://private.example/raw?keep=no",
    createElement: (tagName) => ({
      tagName,
      attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = value;
        this[name] = value;
      }
    }),
    head: {
      append: (node) => {
        if (appendFailure) throw new Error("append failed");
        created.push(node);
      }
    },
    querySelector: (selector) => {
      if (selector !== 'script[data-invitation-analytics="ga4"]') return null;
      return created.find((node) => node.attributes?.["data-invitation-analytics"] === "ga4") || null;
    }
  };
  return { created, documentRef };
};

const loadGA4 = ({
  config = { enabled: true, ga4: { measurementId: "" } },
  hostname = "invitation-maker-one.vercel.app",
  pathname = "/private/path",
  search = "?share=secret",
  hash = "#private",
  documentRef = makeDocument().documentRef,
  existingRoot,
  navigator = { doNotTrack: "0", globalPrivacyControl: false }
} = {}) => {
  const rootObject = existingRoot || {
    InvitationAnalyticsConfig: config,
    URL,
    document: documentRef,
    location: {
      hash,
      hostname,
      origin: `https://${hostname}`,
      pathname,
      search
    },
    navigator,
    window: null
  };
  rootObject.window = rootObject;
  rootObject.document = documentRef;
  rootObject.InvitationAnalyticsConfig = config;
  rootObject.navigator = navigator;

  vm.runInNewContext(read("assets/analytics-ga4.js"), {
    globalThis: rootObject,
    window: rootObject
  }, { filename: "assets/analytics-ga4.js" });

  return rootObject;
};

test("GA4 stays inert without a valid measurement id", () => {
  const { created, documentRef } = makeDocument();
  const rootObject = loadGA4({
    config: { enabled: true, ga4: { measurementId: "" } },
    documentRef
  });

  assert.equal(rootObject.InvitationAnalyticsGA4.init(), false);
  assert.equal(created.length, 0);
  assert.equal(rootObject.dataLayer, undefined);
  assert.equal(rootObject.gtag, undefined);
});

test("GA4 rejects disabled config, preview hosts, and malformed measurement ids", () => {
  for (const blocked of [
    {
      config: { enabled: false, ga4: { measurementId: "G-DISABLED1" } },
      hostname: "invitation-maker-one.vercel.app"
    },
    {
      config: { enabled: true, ga4: { measurementId: "G-PREVIEW1" } },
      hostname: "preview-invitation-maker.vercel.app"
    },
    {
      config: { enabled: true, ga4: { measurementId: "G-12345" } },
      hostname: "invitation-maker-one.vercel.app"
    },
    {
      config: { enabled: true, ga4: { measurementId: "G-lowercase1" } },
      hostname: "invitation-maker-one.vercel.app"
    }
  ]) {
    const { created, documentRef } = makeDocument();
    const rootObject = loadGA4({
      config: blocked.config,
      documentRef,
      hostname: blocked.hostname
    });

    assert.equal(rootObject.InvitationAnalyticsGA4.init(), false);
    assert.equal(created.length, 0);
    assert.equal(rootObject.dataLayer, undefined);
    assert.equal(rootObject.gtag, undefined);
  }
});

test("GA4 honors opt-out, Do Not Track, and Global Privacy Control gates", () => {
  for (const blocked of [
    { config: { enabled: true, optOut: true, ga4: { measurementId: "G-OPTOUT1" } } },
    { navigator: { doNotTrack: "1", globalPrivacyControl: false } },
    { navigator: { doNotTrack: "0", globalPrivacyControl: true } }
  ]) {
    const { created, documentRef } = makeDocument();
    const rootObject = loadGA4({
      config: blocked.config || { enabled: true, ga4: { measurementId: "G-PRIVACY1" } },
      documentRef,
      navigator: blocked.navigator || { doNotTrack: "0", globalPrivacyControl: false }
    });

    assert.equal(rootObject.InvitationAnalyticsGA4.init(), false);
    assert.equal(created.length, 0);
    assert.equal(rootObject.dataLayer, undefined);
    assert.equal(rootObject.gtag, undefined);
  }
});

test("GA4 queues one sanitized maker page view after manual page view is disabled", () => {
  const { created, documentRef } = makeDocument();
  const rootObject = loadGA4({
    config: { enabled: true, ga4: { measurementId: "G-ABC123XYZ" } },
    documentRef,
    pathname: "/manage/secret",
    search: "?token=raw",
    hash: "#raw"
  });

  assert.equal(rootObject.InvitationAnalyticsGA4.init(), true);
  assert.equal(rootObject.InvitationAnalyticsGA4.init(), true);
  assert.equal(created.length, 1);
  assert.equal(created[0].async, true);
  assert.equal(created[0].src, "https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ");
  assert.equal(created[0].referrerPolicy, "no-referrer");
  assert.equal(created[0].attributes["data-invitation-analytics"], "ga4");
  assert.equal(rootObject.dataLayer.length, 4);
  assert.equal(rootObject.dataLayer[0][0], "js");
  assert.equal(JSON.stringify(rootObject.dataLayer.slice(1)), JSON.stringify([
    ["set", {
      page_location: "https://invitation-maker-one.vercel.app/",
      page_title: "Invitation Studio",
      page_referrer: ""
    }],
    ["config", "G-ABC123XYZ", {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    }],
    ["event", "page_view", {
      send_to: "G-ABC123XYZ"
    }]
  ]));
});

test("GA4 sanitizes shared invitation views to the recipient route", () => {
  const { documentRef } = makeDocument();
  const rootObject = loadGA4({
    config: { enabled: true, ga4: { measurementId: "G-SHARED1" } },
    documentRef,
    pathname: "/i/shared-private-id",
    search: "?managementKey=secret"
  });

  assert.equal(JSON.stringify(rootObject.dataLayer.slice(1)), JSON.stringify([
    ["set", {
      page_location: "https://invitation-maker-one.vercel.app/i/shared",
      page_title: "Shared Invitation",
      page_referrer: ""
    }],
    ["config", "G-SHARED1", {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    }],
    ["event", "page_view", {
      send_to: "G-SHARED1"
    }]
  ]));
});

test("GA4 does not duplicate script or page view queue when the module reloads", () => {
  const { created, documentRef } = makeDocument();
  const rootObject = loadGA4({
    config: { enabled: true, ga4: { measurementId: "G-RELOAD1" } },
    documentRef
  });
  loadGA4({
    config: { enabled: true, ga4: { measurementId: "G-RELOAD1" } },
    documentRef,
    existingRoot: rootObject
  });

  assert.equal(created.length, 1);
  assert.equal(rootObject.dataLayer.filter((entry) => entry[0] === "event" && entry[1] === "page_view").length, 1);
});

test("GA4 fails open when script creation or append fails", () => {
  const { created, documentRef } = makeDocument({ appendFailure: true });
  const rootObject = loadGA4({
    config: { enabled: true, ga4: { measurementId: "G-FAILOK1" } },
    documentRef
  });

  assert.equal(rootObject.InvitationAnalyticsGA4.init(), false);
  assert.equal(created.length, 0);
});
