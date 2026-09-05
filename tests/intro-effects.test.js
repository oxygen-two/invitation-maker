const test = require("node:test");
const assert = require("node:assert/strict");

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
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter((registered) => registered !== listener));
    }
  };
};

const createIntroFixture = ({ reducedMotion = false } = {}) => {
  const document = createEventTarget();
  let removedOverlays = 0;
  let clearedTimers = 0;
  let overlay = null;
  let timerId = 0;
  const host = {
    classList: createClassList(),
    ownerDocument: document,
    insertAdjacentHTML(position, html) {
      assert.equal(position, "afterbegin");
      overlay = createEventTarget();
      overlay.html = html;
      overlay.remove = () => {
        if (overlay) {
          removedOverlays += 1;
          overlay = null;
        }
      };
      overlay.querySelector = (selector) => selector === "[data-intro-skip]" ? createEventTarget() : null;
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
    environment: {
      clearTimeout(id) {
        if (id) clearedTimers += 1;
      },
      matchReducedMotion: () => reducedMotion,
      setTimeout() {
        timerId += 1;
        return timerId;
      }
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

test("reduced motion skips before an active overlay remains mounted", () => {
  const fixture = createIntroFixture({ reducedMotion: true });
  InvitationIntro.play(fixture.host, { introEffect: "envelope", title: "Us" }, fixture.environment);
  assert.equal(fixture.host.querySelector("[data-intro-overlay]"), null);
});
