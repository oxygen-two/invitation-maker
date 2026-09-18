const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const makeStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
    snapshot: () => Object.fromEntries(values)
  };
};

const deniedStorage = () => ({
  getItem: () => {
    throw new Error("storage denied");
  },
  setItem: () => {
    throw new Error("storage denied");
  },
  removeItem: () => {
    throw new Error("storage denied");
  }
});

/* A hand-built DOM, the same shape as the other suites use: just enough of
   createElement/append/querySelector for the banner to be built and read
   back. `document: null` exercises the no-DOM path (the module must still
   expose its API rather than throwing). */
const makeElement = (tagName) => {
  const element = {
    tagName,
    attributes: {},
    children: [],
    className: "",
    hidden: false,
    isConnected: false,
    textContent: "",
    listeners: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
    },
    addEventListener(name, handler) {
      this.listeners[name] = this.listeners[name] || [];
      this.listeners[name].push(handler);
    },
    append(...nodes) {
      for (const node of nodes) {
        if (node && typeof node === "object") node.isConnected = true;
        this.children.push(node);
      }
    },
    focus() {
      element.focused = true;
    },
    querySelector(selector) {
      return descendants(element).find((node) => matches(node, selector)) || null;
    },
    click() {
      for (const handler of this.listeners.click || []) handler();
    }
  };
  element.dataset = {};
  return element;
};

const descendants = (node) => (node.children || []).flatMap((child) =>
  (child && typeof child === "object" && child.tagName ? [child, ...descendants(child)] : []));

const matches = (node, selector) => {
  if (selector === "button") return node.tagName === "button";
  if (selector.startsWith("[") && selector.endsWith("]")) {
    return Object.hasOwn(node.attributes, selector.slice(1, -1));
  }
  if (selector.startsWith(".")) return String(node.className).split(/\s+/).includes(selector.slice(1));
  return false;
};

const makeDocument = ({ settingsControls = [] } = {}) => {
  const body = makeElement("body");
  const head = makeElement("head");
  const documentRef = {
    readyState: "complete",
    body,
    head,
    createElement: makeElement,
    createTextNode: (text) => ({ text }),
    getElementById: (id) => [head, body, ...descendants(head), ...descendants(body)]
      .find((node) => (node.id || node.attributes.id) === id) || null,
    querySelectorAll: (selector) => (selector === "[data-consent-settings]" ? settingsControls : []),
    addEventListener: () => {}
  };
  return { body, documentRef, head };
};

const loadConsent = ({ localStorage = makeStorage(), documentRef, i18n, analytics, ga4 } = {}) => {
  const rootObject = {
    localStorage,
    document: documentRef || null,
    InvitationI18n: i18n,
    InvitationAnalytics: analytics,
    InvitationAnalyticsGA4: ga4,
    window: null
  };
  rootObject.window = rootObject;
  vm.runInNewContext(read("assets/site/consent.js"), {
    globalThis: rootObject,
    module: { exports: {} },
    window: rootObject
  }, { filename: "assets/site/consent.js" });
  return { consent: rootObject.InvitationConsent, rootObject };
};

test("the stored contract is exactly two words under one key", () => {
  const { consent } = loadConsent();
  assert.equal(consent.STORAGE_KEY, "invitation-maker.consent");
  assert.equal(consent.GRANTED, "granted");
  assert.equal(consent.DENIED, "denied");
});

test("no stored answer reads as no answer, and so does anything but the two words", () => {
  for (const stored of [undefined, "", "yes", "true", "GRANTED", "accepted", "1"]) {
    const localStorage = makeStorage(stored === undefined ? {} : { "invitation-maker.consent": stored });
    const { consent } = loadConsent({ localStorage });
    assert.equal(consent.get(), "", `"${stored}" should not count as an answer`);
  }
});

test("a stored answer is read back verbatim", () => {
  for (const stored of ["granted", "denied"]) {
    const { consent } = loadConsent({ localStorage: makeStorage({ "invitation-maker.consent": stored }) });
    assert.equal(consent.get(), stored);
  }
});

test("set writes only the two allowed words and reports what it did", () => {
  const localStorage = makeStorage();
  const { consent } = loadConsent({ localStorage });

  assert.equal(consent.set("granted"), true);
  assert.equal(localStorage.snapshot()["invitation-maker.consent"], "granted");
  assert.equal(consent.get(), "granted");

  assert.equal(consent.set("denied"), true);
  assert.equal(consent.get(), "denied");

  for (const rejected of ["maybe", "", null, undefined, 1, true]) {
    assert.equal(consent.set(rejected), false, `${String(rejected)} should be rejected`);
  }
  assert.equal(consent.get(), "denied", "a rejected value must not overwrite the answer");
});

test("onChange hears every accepted answer and can unsubscribe", () => {
  const { consent } = loadConsent();
  const seen = [];
  const unsubscribe = consent.onChange((choice) => seen.push(choice));
  assert.equal(typeof unsubscribe, "function");

  consent.set("granted");
  consent.set("denied");
  consent.set("nonsense");
  unsubscribe();
  consent.set("granted");

  assert.deepEqual(seen, ["granted", "denied"]);
});

test("onChange ignores non-functions and one bad subscriber cannot silence the rest", () => {
  const { consent } = loadConsent();
  const seen = [];
  assert.equal(typeof consent.onChange("not a function"), "function");
  consent.onChange(() => {
    throw new Error("bad subscriber");
  });
  consent.onChange((choice) => seen.push(choice));

  consent.set("denied");
  assert.deepEqual(seen, ["denied"]);
});

test("storage that throws cannot stop the banner from working", () => {
  const { consent } = loadConsent({ localStorage: deniedStorage() });
  assert.equal(consent.get(), "");
  assert.equal(consent.set("granted"), true);
  // Nothing could be persisted, so the visitor is asked again next page.
  assert.equal(consent.get(), "");
});

test("granting consent starts the analytics modules; denying starts nothing", () => {
  const started = [];
  const analytics = { init: () => started.push("posthog") };
  const ga4 = { init: () => started.push("ga4") };

  const denied = loadConsent({ analytics, ga4 }).consent;
  denied.set("denied");
  assert.deepEqual(started, []);

  const granted = loadConsent({ analytics, ga4 }).consent;
  granted.set("granted");
  assert.deepEqual(started, ["posthog", "ga4"]);
});

test("an analytics module that throws on init cannot break the choice", () => {
  const analytics = {
    init: () => {
      throw new Error("provider exploded");
    }
  };
  const { consent } = loadConsent({ analytics });
  assert.equal(consent.set("granted"), true);
  assert.equal(consent.get(), "granted");
});

test("the banner appears once, unasked, and is a labelled region with two 44px buttons", () => {
  const { body, documentRef } = makeDocument();
  loadConsent({ documentRef });

  const banner = documentRef.getElementById("invitation-consent");
  assert.ok(banner, "the banner should be appended on a first visit");
  assert.equal(banner.getAttribute("role"), "region");
  assert.ok(banner.getAttribute("aria-label"), "the region needs an accessible name");
  assert.equal(banner.getAttribute("data-i18n-attr"), "aria-label:consent.regionLabel");

  const buttons = descendants(banner).filter((node) => node.tagName === "button");
  assert.equal(buttons.length, 2);
  assert.deepEqual(buttons.map((button) => button.getAttribute("data-i18n")), ["consent.accept", "consent.deny"]);
  for (const button of buttons) assert.equal(button.type, "button");

  const link = descendants(banner).find((node) => node.tagName === "a");
  assert.equal(link.href, "/privacy");
  assert.equal(link.getAttribute("data-i18n"), "consent.privacyLink");

  // The CSS comes with the file: the studio and the guest page share no
  // stylesheet with the site chrome.
  const style = descendants(documentRef.head).find((node) => node.tagName === "style");
  assert.match(style.textContent, /min-height: 44px/);
  assert.match(style.textContent, /min-width: 44px/);
  assert.equal(body.children.length, 1);
});

test("an answer already stored means no banner at all", () => {
  for (const stored of ["granted", "denied"]) {
    const { documentRef } = makeDocument();
    loadConsent({ documentRef, localStorage: makeStorage({ "invitation-maker.consent": stored }) });
    assert.equal(documentRef.getElementById("invitation-consent"), null, `${stored} should not be asked again`);
  }
});

test("pressing a banner button stores the answer and hides the banner", () => {
  const localStorage = makeStorage();
  const { documentRef } = makeDocument();
  loadConsent({ documentRef, localStorage });

  const banner = documentRef.getElementById("invitation-consent");
  const [accept] = descendants(banner).filter((node) => node.tagName === "button");
  accept.click();

  assert.equal(localStorage.snapshot()["invitation-maker.consent"], "granted");
  assert.equal(banner.hidden, true);
});

test("the privacy page's settings control reopens the banner and focuses it", () => {
  const settings = makeElement("button");
  settings.setAttribute("data-consent-settings", "");
  const { documentRef } = makeDocument({ settingsControls: [settings] });
  loadConsent({ documentRef, localStorage: makeStorage({ "invitation-maker.consent": "denied" }) });

  assert.equal(documentRef.getElementById("invitation-consent"), null, "an answered visitor sees no banner");
  settings.click();

  const banner = documentRef.getElementById("invitation-consent");
  assert.ok(banner, "the settings control should bring the banner back");
  assert.equal(banner.hidden, false);
  assert.equal(descendants(banner).find((node) => node.tagName === "button").focused, true);
});

test("the banner copy is bound to the dictionaries rather than hard-coded", () => {
  const source = read("assets/site/consent.js");
  for (const key of ["consent.regionLabel", "consent.message", "consent.privacyLink", "consent.accept", "consent.deny"]) {
    assert.ok(source.includes(`"${key}"`), `${key} is not bound`);
  }

  const ko = require("../assets/i18n/dictionary-ko.js");
  const en = require("../assets/i18n/dictionary-en.js");
  for (const dictionary of [ko, en]) {
    for (const name of ["regionLabel", "message", "privacyLink", "accept", "deny", "settings"]) {
      assert.equal(typeof dictionary.consent[name], "string", `consent.${name} missing`);
      assert.ok(dictionary.consent[name].trim().length > 0);
    }
  }
});

test("the file adds no dependency and stays a plain global", () => {
  const source = read("assets/site/consent.js");
  assert.doesNotMatch(source, /\brequire\(/);
  assert.doesNotMatch(source, /\bimport\b/);
  assert.match(source, /root\.InvitationConsent = api/);
});

test("every page that loads analytics also loads the consent banner", () => {
  for (const page of ["index.html", "guide.html", "privacy.html", "terms.html", "studio.html", "shared.html", "viewer.html"]) {
    const html = read(page);
    assert.match(html, /assets\/analytics\/analytics\.js/, `${page} should load analytics`);
    const consentAt = html.indexOf("assets/site/consent.js\"");
    const reporterAt = html.indexOf("assets/analytics/error-reporting.js");
    assert.ok(consentAt > 0, `${page} does not load assets/site/consent.js`);
    // Like every other watched script, it loads after the reporter, so a
    // failure while parsing it is something we actually hear about. Order does
    // not matter for correctness: analytics.js and ga4.js read the stored
    // answer themselves rather than calling into this file.
    assert.ok(reporterAt > 0 && consentAt > reporterAt, `${page} must load consent.js after error-reporting.js`);
  }
});
