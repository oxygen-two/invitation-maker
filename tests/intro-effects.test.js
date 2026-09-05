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

const createStyle = () => {
  const properties = new Map();
  return {
    getPropertyValue(name) {
      return properties.get(name) || "";
    },
    setProperty(name, value) {
      properties.set(name, String(value));
    }
  };
};

const createIntroFixture = ({
  cardRect = null,
  hostRect = { height: 800, left: 0, top: 0, width: 600 },
  mountOverlay = true,
  reducedMotion = false
} = {}) => {
  const document = createEventTarget();
  let removedOverlays = 0;
  let clearedTimers = 0;
  let overlay = null;
  let skip = null;
  let timerCallback = null;
  let timerId = 0;
  const card = cardRect ? { getBoundingClientRect: () => cardRect } : null;
  const host = {
    classList: createClassList(),
    getBoundingClientRect: () => hostRect,
    ownerDocument: document,
    insertAdjacentHTML(position, html) {
      assert.equal(position, "afterbegin");
      if (!mountOverlay) return;
      overlay = createEventTarget();
      overlay.classList = createClassList();
      overlay.html = html;
      overlay.style = createStyle();
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
      if (selector === "[data-intro-overlay]") return overlay;
      if (selector === ".invitation-card") return card;
      return null;
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

const createStandaloneSandbox = ({ bodyQuerySelector = () => null, invitationData = JSON.stringify({ introEffect: "envelope" }) } = {}) => {
  const classList = createClassList();
  const document = createEventTarget();
  document.body = {
    classList,
    querySelector: bodyQuerySelector
  };
  document.readyState = "complete";
  document.getElementById = () => ({
    textContent: invitationData
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
  assert.doesNotMatch(html, /2026\.09\.12/);
  assert.doesNotMatch(html, /Rin/);
  assert.match(html, />건너뛰기</);
});

test("each intro preset renders only its tuned invitation copy", () => {
  const invitation = {
    title: "TITLE",
    subtitle: "SUBTITLE",
    dateLabel: "DATE",
    host: "HOST"
  };
  const expected = {
    envelope: ["TITLE", "HOST"],
    "card-shrink": ["TITLE", "SUBTITLE"],
    dawn: ["TITLE", "SUBTITLE"],
    fireworks: ["TITLE", "DATE"],
    curtain: ["TITLE", "HOST"],
    petals: ["TITLE", "SUBTITLE"],
    spotlight: ["TITLE", "DATE"],
    "photo-focus": ["TITLE", "SUBTITLE"]
  };

  for (const [effect, visible] of Object.entries(expected)) {
    const html = InvitationIntro.renderMarkup({ ...invitation, introEffect: effect });
    for (const value of Object.values(invitation)) {
      assert.equal(html.includes(value), visible.includes(value), `${effect} copy mismatch for ${value}`);
    }
  }
});

test("rendered intro escapes reused invitation text and photo attributes", () => {
  const invitation = {
    title: "<img src=x onerror=TITLE>",
    subtitle: 'Sub "quoted"',
    dateLabel: "<time>now</time>",
    host: "A&B",
    items: [{ type: "photo", src: SAFE_WEBP, alt: '"><img src=x onerror=ALT>' }]
  };
  const photoHtml = InvitationIntro.renderMarkup({
    ...invitation,
    introEffect: "photo-focus",
  });
  const dateHtml = InvitationIntro.renderMarkup({ ...invitation, introEffect: "spotlight" });
  const hostHtml = InvitationIntro.renderMarkup({ ...invitation, introEffect: "envelope" });

  assert.match(photoHtml, /&lt;img src=x onerror=TITLE&gt;/);
  assert.match(photoHtml, /Sub &quot;quoted&quot;/);
  assert.match(photoHtml, /alt="&quot;&gt;&lt;img src=x onerror=ALT&gt;"/);
  assert.match(dateHtml, /&lt;time&gt;now&lt;\/time&gt;/);
  assert.match(hostHtml, /A&amp;B/);
  assert.doesNotMatch(`${photoHtml}${dateHtml}${hostHtml}`, /<img src=x onerror=TITLE>|<time>now<\/time>|<img src=x onerror=ALT>/);
});

test("ensureStyles inserts one preview style element", () => {
  const document = createStyleDocument();
  const first = InvitationIntro.ensureStyles(document);
  const second = InvitationIntro.ensureStyles(document);

  assert.equal(first, second);
  assert.equal(first.attributes["data-intro-styles"], "");
  assert.match(first.textContent, /\.invitation-intro/);
});

test("active intros pause particle spans and their pseudo-element animation owners", () => {
  const styles = InvitationIntro.getStyles();

  assert.match(styles, /\.is-intro-active \.particle-layer,\.is-intro-active \.particle-layer span,\.is-intro-active \.particle-layer span::before\{animation-play-state:paused\}/);
});

test("petal intro uses explicit two-dimensional positions and template palette tokens", () => {
  const markup = InvitationIntro.renderMarkup({ introEffect: "petals", title: "Us" });
  const styles = InvitationIntro.getStyles();

  assert.equal((markup.match(/--petal-x:/g) || []).length, 10);
  assert.equal((markup.match(/--petal-y:/g) || []).length, 10);
  assert.match(markup, /--petal-delay:/);
  assert.match(styles, /left:var\(--petal-x\)/);
  assert.match(styles, /top:var\(--petal-y\)/);
  assert.match(styles, /var\(--particle-accent/);
  assert.doesNotMatch(styles, /var\(--i\) %/);
});

test("intro styles inherit editor and standalone palette token names without dead finishing animation", () => {
  const styles = InvitationIntro.getStyles();

  assert.match(styles, /var\(--paper,var\(--cream-50,#fffaf2\)\)/);
  assert.match(styles, /var\(--deep,var\(--wine-900,#42101f\)\)/);
  assert.match(styles, /var\(--mid,var\(--wine-700,#7a243b\)\)/);
  assert.match(styles, /var\(--soft,var\(--ink-soft,#65535a\)\)/);
  assert.match(styles, /var\(--bg,var\(--page-bg-a,#ead5ce\)\)/);
  assert.doesNotMatch(styles, /is-finishing|intro-fade-out/);
});

test("standalone active body locks scrolling without overriding preview frames", () => {
  const styles = InvitationIntro.getStyles();

  assert.match(styles, /body\.is-intro-active\{overflow:hidden\}/);
  assert.doesNotMatch(styles, /\.preview-frame\.is-intro-active\{overflow:hidden\}/);
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

test("card shrink measures the preview card before animation begins", () => {
  const fixture = createIntroFixture({
    cardRect: { height: 1000, left: 90, top: 130, width: 300 },
    hostRect: { height: 800, left: 30, top: 50, width: 600 }
  });

  InvitationIntro.play(fixture.host, { introEffect: "card-shrink", title: "Us" }, fixture.environment);
  const overlay = fixture.host.querySelector("[data-intro-overlay]");

  assert.equal(overlay.style.getPropertyValue("--intro-target-scale"), "0.5");
  assert.equal(overlay.style.getPropertyValue("--intro-target-x"), "60px");
  assert.equal(overlay.style.getPropertyValue("--intro-target-y"), "80px");
  assert.equal(overlay.style.getPropertyValue("--intro-target-origin"), "top left");
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

test("standalone malformed payload removes the server-rendered overlay", () => {
  let overlayRemoved = false;
  const overlay = { remove() { overlayRemoved = true; } };
  const sandbox = createStandaloneSandbox({
    bodyQuerySelector: (selector) => selector === "[data-intro-overlay]" ? overlay : null,
    invitationData: "{malformed"
  });
  sandbox.document.body.classList.add("is-intro-active");

  vm.runInNewContext(InvitationIntro.getStandaloneRuntime().replace(/^<script data-intro-runtime>|<\/script>$/g, ""), sandbox);

  assert.equal(overlayRemoved, true);
  assert.equal(sandbox.document.body.classList.contains("is-intro-active"), false);
});

test("standalone card shrink measures the invitation card before playback", () => {
  const document = createEventTarget();
  const overlay = {
    ...createEventTarget(),
    classList: createClassList(),
    getBoundingClientRect: () => ({ height: 900, left: 0, top: 0, width: 900 }),
    remove() {},
    style: createStyle()
  };
  const card = {
    getBoundingClientRect: () => ({ height: 1200, left: 180, top: 120, width: 450 })
  };
  document.body = {
    classList: createClassList(),
    getBoundingClientRect: () => ({ height: 900, left: 0, top: 0, width: 900 }),
    querySelector(selector) {
      if (selector === "[data-intro-overlay]") return overlay;
      if (selector === ".invitation-card") return card;
      return null;
    }
  };
  document.readyState = "complete";
  document.getElementById = () => ({ textContent: JSON.stringify({ introEffect: "card-shrink" }) });

  vm.runInNewContext(InvitationIntro.getStandaloneRuntime().replace(/^<script data-intro-runtime>|<\/script>$/g, ""), {
    document,
    window: {
      clearTimeout() {},
      matchMedia: () => ({ matches: false }),
      setTimeout: () => 1
    }
  });

  assert.equal(overlay.style.getPropertyValue("--intro-target-scale"), "0.5");
  assert.equal(overlay.style.getPropertyValue("--intro-target-x"), "180px");
  assert.equal(overlay.style.getPropertyValue("--intro-target-y"), "120px");
  assert.equal(overlay.style.getPropertyValue("--intro-target-origin"), "top left");
});

test("reduced motion skips before an active overlay remains mounted", () => {
  const fixture = createIntroFixture({ reducedMotion: true });
  InvitationIntro.play(fixture.host, { introEffect: "envelope", title: "Us" }, fixture.environment);
  assert.equal(fixture.host.querySelector("[data-intro-overlay]"), null);
});
