const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const InvitationIntro = require("../assets/intro-effects.js");

const SAFE_WEBP = "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/vuUAAA=";

const createClassList = () => {
  const names = new Set();
  return {
    add: (...values) => values.forEach((value) => names.add(value)),
    contains: (value) => names.has(value),
    remove: (...values) => values.forEach((value) => names.delete(value))
  };
};

const createEventTarget = () => {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const registered = listeners.get(type) || [];
      registered.push(listener);
      listeners.set(type, registered);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) || []) listener(event);
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter((registered) => registered !== listener));
    }
  };
};

const createIntroFixture = ({ mountOverlay = true, reducedMotion = false } = {}) => {
  const document = createEventTarget();
  let removedOverlays = 0;
  let clearedTimers = 0;
  let overlay = null;
  let skip = null;
  let timerCallback = null;
  let timerId = 0;
  const host = {
    classList: createClassList(),
    ownerDocument: document,
    insertAdjacentHTML(position, html) {
      assert.equal(position, "afterbegin");
      if (!mountOverlay) return;
      overlay = createEventTarget();
      overlay.classList = createClassList();
      overlay.html = html;
      overlay.remove = () => {
        if (overlay) {
          removedOverlays += 1;
          overlay = null;
          skip = null;
        }
      };
      skip = createEventTarget();
      overlay.querySelector = (selector) => selector === "[data-intro-skip]" ? skip : null;
    },
    querySelector(selector) {
      return selector === "[data-intro-overlay]" ? overlay : null;
    }
  };

  return {
    host,
    get clearedTimers() {
      return clearedTimers;
    },
    get removedOverlays() {
      return removedOverlays;
    },
    clickOverlay() {
      overlay.dispatchEvent({ type: "click", preventDefault() {} });
    },
    clickSkip() {
      skip.dispatchEvent({ type: "click", preventDefault() {} });
    },
    pressEscape() {
      document.dispatchEvent({ type: "keydown", key: "Escape" });
    },
    runTimer() {
      timerCallback();
    },
    environment: {
      clearTimeout(id) {
        if (id) clearedTimers += 1;
      },
      matchReducedMotion: () => reducedMotion,
      setTimeout(callback) {
        timerCallback = callback;
        timerId += 1;
        return timerId;
      }
    }
  };
};

const createStandaloneSandbox = ({ bodyQuerySelector = () => null } = {}) => {
  const classList = createClassList();
  const document = createEventTarget();
  document.body = {
    classList,
    querySelector: bodyQuerySelector
  };
  document.readyState = "complete";
  document.getElementById = () => ({
    textContent: JSON.stringify({ introEffect: "envelope" })
  });
  return {
    document,
    window: {
      clearTimeout() {},
      matchMedia: () => ({ matches: false }),
      setTimeout: () => 1
    }
  };
};

const createStyleDocument = () => {
  let style = null;
  return {
    createElement(tagName) {
      assert.equal(tagName, "style");
      return {
        attributes: {},
        dataset: {},
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        },
        textContent: ""
      };
    },
    head: {
      append(element) {
        style = element;
      }
    },
    querySelector(selector) {
      return selector === "style[data-intro-styles]" ? style : null;
    }
  };
};

test("intro presets normalize to eight active effects plus none", () => {
  const active = Object.keys(InvitationIntro.PRESETS);
  assert.deepEqual(active, ["envelope", "card-shrink", "dawn", "fireworks", "curtain", "petals", "spotlight", "photo-focus"]);
  assert.equal(InvitationIntro.normalizeEffect("fireworks"), "fireworks");
  assert.equal(InvitationIntro.normalizeEffect("unknown"), "none");
});

test("photo focus reuses the first safe photo and falls back without one", () => {
  const withPhoto = InvitationIntro.renderMarkup({ introEffect: "photo-focus", title: "Us", items: [{ type: "photo", src: SAFE_WEBP }] });
  const withoutPhoto = InvitationIntro.renderMarkup({ introEffect: "photo-focus", title: "Us", items: [] });
  assert.match(withPhoto, /data-intro-photo/);
  assert.match(withPhoto, /data:image\/webp/);
  assert.match(withoutPhoto, /data-photo-fallback/);
  assert.doesNotMatch(withoutPhoto, /<img/);
});

test("rendered intro contains no visible intro-only copy", () => {
  const html = InvitationIntro.renderMarkup({
    introEffect: "dawn",
    title: "우리의 초대",
    subtitle: "함께해 주세요",
    dateLabel: "2026.09.12",
    host: "Rin"
  });

  assert.doesNotMatch(html, />Invitation</);
  assert.match(html, /우리의 초대/);
  assert.match(html, /함께해 주세요/);
  assert.match(html, /2026\.09\.12/);
  assert.match(html, /Rin/);
  assert.match(html, />건너뛰기</);
});

test("rendered intro escapes reused invitation text and photo attributes", () => {
  const html = InvitationIntro.renderMarkup({
    introEffect: "photo-focus",
    title: "<img src=x onerror=TITLE>",
    subtitle: 'Sub "quoted"',
    dateLabel: "<time>now</time>",
    host: "A&B",
    items: [{ type: "photo", src: SAFE_WEBP, alt: '"><img src=x onerror=ALT>' }]
  });

  assert.match(html, /&lt;img src=x onerror=TITLE&gt;/);
  assert.match(html, /Sub &quot;quoted&quot;/);
  assert.match(html, /&lt;time&gt;now&lt;\/time&gt;/);
  assert.match(html, /A&amp;B/);
  assert.match(html, /alt="&quot;&gt;&lt;img src=x onerror=ALT&gt;"/);
  assert.doesNotMatch(html, /<img src=x onerror=TITLE>|<time>now<\/time>|<img src=x onerror=ALT>/);
});

test("ensureStyles inserts one preview style element", () => {
  const document = createStyleDocument();
  const first = InvitationIntro.ensureStyles(document);
  const second = InvitationIntro.ensureStyles(document);

  assert.equal(first, second);
  assert.equal(first.attributes["data-intro-styles"], "");
  assert.match(first.textContent, /\.invitation-intro/);
});

test("standalone runtime contains the self-starting playback boundary", () => {
  const runtime = InvitationIntro.getStandaloneRuntime();

  assert.match(runtime, /data-intro-runtime/);
  assert.match(runtime, /InvitationIntro\.play/);
  assert.match(runtime, /invitation-data/);
});

test("play completes once and restores the host after repeated finish signals", () => {
  const fixture = createIntroFixture();
  const controller = InvitationIntro.play(fixture.host, { introEffect: "dawn", title: "Us" }, fixture.environment);
  controller.finish();
  controller.finish();
  assert.equal(fixture.host.classList.contains("is-intro-active"), false);
  assert.equal(fixture.removedOverlays, 1);
  assert.equal(fixture.clearedTimers, 1);
});

test("skip click completes playback and clears the active state", () => {
  const fixture = createIntroFixture();
  InvitationIntro.play(fixture.host, { introEffect: "curtain", title: "Us" }, fixture.environment);
  fixture.clickSkip();

  assert.equal(fixture.host.classList.contains("is-intro-active"), false);
  assert.equal(fixture.removedOverlays, 1);
  assert.equal(fixture.clearedTimers, 1);
});

test("escape completes playback and removes the overlay", () => {
  const fixture = createIntroFixture();
  InvitationIntro.play(fixture.host, { introEffect: "spotlight", title: "Us" }, fixture.environment);
  fixture.pressEscape();

  assert.equal(fixture.host.querySelector("[data-intro-overlay]"), null);
  assert.equal(fixture.host.classList.contains("is-intro-active"), false);
  assert.equal(fixture.clearedTimers, 1);
});

test("timer completion restores the host", () => {
  const fixture = createIntroFixture();
  InvitationIntro.play(fixture.host, { introEffect: "fireworks", title: "Us" }, fixture.environment);
  fixture.runTimer();

  assert.equal(fixture.host.classList.contains("is-intro-active"), false);
  assert.equal(fixture.removedOverlays, 1);
  assert.equal(fixture.clearedTimers, 1);
});

test("stop completes active playback", () => {
  const fixture = createIntroFixture();
  InvitationIntro.play(fixture.host, { introEffect: "petals", title: "Us" }, fixture.environment);
  InvitationIntro.stop(fixture.host);

  assert.equal(fixture.host.classList.contains("is-intro-active"), false);
  assert.equal(fixture.removedOverlays, 1);
  assert.equal(fixture.clearedTimers, 1);
});

test("play replaces an existing controller on the same host", () => {
  const fixture = createIntroFixture();
  InvitationIntro.play(fixture.host, { introEffect: "envelope", title: "First" }, fixture.environment);
  const second = InvitationIntro.play(fixture.host, { introEffect: "dawn", title: "Second" }, fixture.environment);

  assert.equal(fixture.host.classList.contains("is-intro-active"), true);
  assert.equal(fixture.removedOverlays, 1);
  assert.equal(fixture.clearedTimers, 1);
  second.finish();
  assert.equal(fixture.host.classList.contains("is-intro-active"), false);
  assert.equal(fixture.removedOverlays, 2);
  assert.equal(fixture.clearedTimers, 2);
});

test("setup errors fail open and clear the active state", () => {
  const fixture = createIntroFixture({ mountOverlay: false });
  const controller = InvitationIntro.play(fixture.host, { introEffect: "envelope", title: "Us" }, fixture.environment);

  assert.equal(controller, null);
  assert.equal(fixture.host.classList.contains("is-intro-active"), false);
  assert.equal(fixture.host.querySelector("[data-intro-overlay]"), null);
});

test("standalone runtime setup errors fail open when no overlay is mounted", () => {
  const sandbox = createStandaloneSandbox();
  vm.runInNewContext(InvitationIntro.getStandaloneRuntime().replace(/^<script data-intro-runtime>|<\/script>$/g, ""), sandbox);

  assert.equal(sandbox.document.body.classList.contains("is-intro-active"), false);
});

test("reduced motion skips before an active overlay remains mounted", () => {
  const fixture = createIntroFixture({ reducedMotion: true });
  InvitationIntro.play(fixture.host, { introEffect: "envelope", title: "Us" }, fixture.environment);
  assert.equal(fixture.host.querySelector("[data-intro-overlay]"), null);
});
