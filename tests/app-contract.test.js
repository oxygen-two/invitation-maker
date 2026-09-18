const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ContentOrder = require("../assets/studio/content-order.js");
const HeroImage = require("../assets/media/hero-image.js");
const InvitationCore = require("../assets/invitation/core.js");
const PresetApplication = require("../assets/studio/preset-application.js");
const InvitationI18n = require("../assets/i18n/i18n.js");
const dictionaryKo = require("../assets/i18n/dictionary-ko.js");
const dictionaryEn = require("../assets/i18n/dictionary-en.js");

InvitationI18n.register("ko", dictionaryKo);
InvitationI18n.register("en", dictionaryEn);

/* The studio's copy lives in the dictionaries now, so assertions name the key
   and resolve it rather than repeating the sentence. A wording change updates
   one file and the tests follow; a key that stops existing fails loudly here
   because t() returns the key itself and the key never matches the text. */
const ko = (key, values) => InvitationI18n.t(key, values, "ko");
const en = (key, values) => InvitationI18n.t(key, values, "en");
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const copy = (key, values) => new RegExp(escapeRegExp(ko(key, values)));

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const functionBody = (source, name) => {
  const start = source.indexOf(`const ${name} = () => {`);
  if (start < 0) return "";
  const bodyStart = source.indexOf("{", start) + 1;
  const end = source.indexOf("\n};", bodyStart);
  return end < 0 ? "" : source.slice(bodyStart, end);
};

const getFaviconLinks = (html) => [...html.matchAll(/<link\b[^>]*>/gi)]
  .map(([tag]) => {
    const attributes = {};
    for (const match of tag.matchAll(/\s([a-z][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi)) {
      attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
    }
    return attributes;
  })
  .filter(({ rel = "" }) => rel.toLowerCase().split(/\s+/).some((token) => token === "icon" || token.endsWith("-icon")));

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
};

const makeEventTarget = () => {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const registered = listeners.get(type) || [];
      registered.push(listener);
      listeners.set(type, registered);
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener({ type, ...event });
    }
  };
};

const makeClassList = (className = "") => {
  const values = new Set(className.split(/\s+/).filter(Boolean));
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    contains: (name) => values.has(name),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    toggle(name, force) {
      if (force === undefined) {
        if (values.has(name)) values.delete(name);
        else values.add(name);
        return values.has(name);
      }
      if (force) values.add(name);
      else values.delete(name);
      return force;
    }
  };
};

const course = (id, place = id) => ({
  id,
  type: "course",
  time: "14:00",
  label: "PLACE",
  place,
  note: "",
  mapUrl: "",
  mapEnabled: false,
  mapLatitude: "",
  mapLongitude: "",
  mapZoom: "16"
});

const photo = (id, caption = id) => ({
  id,
  type: "photo",
  src: "data:image/png;base64,QQ==",
  alt: "",
  caption
});

const loadEditorHarness = ({
  maxItems = 4,
  maxPhotos = 8,
  buildStandaloneHtml = (invitation) => JSON.stringify(invitation),
  compress,
  confirm = () => true,
  normalizeInvitation = (value) => value,
  renderInvitationBody = () => "",
  put,
  putDraft,
  previewFrame = false,
  reducedMotion = false,
  mobile = false
} = {}) => {
  const documentEvents = makeEventTarget();
  const windowEvents = makeEventTarget();
  const matchMediaCalls = [];
  const scrollCalls = [];
  const scrollIntoViewCalls = [];
  const animationFrames = [];
  const document = {
    ...documentEvents,
    activeElement: null,
    body: { append() {}, dataset: {} },
    head: { append() {} },
    hitTarget: null,
    createElement: () => ({
      childNodes: [],
      querySelectorAll: () => [],
      set innerHTML(value) { this.value = value; }
    }),
    elementFromPoint: () => document.hitTarget,
    querySelectorAll: () => []
  };
  const window = {
    ...windowEvents,
    confirm,
    matchMedia(query) {
      matchMediaCalls.push(query);
      return {
        matches: (reducedMotion && query === "(prefers-reduced-motion: reduce)")
          || (mobile && query === "(max-width: 900px)")
      };
    },
    open() {},
    scrollTo(options) {
      scrollCalls.push(options);
      this.scrollY = options.top;
    },
    scrollY: 0
  };

  const makeControl = (card, selector, { attrs = {}, dataset = {}, value = "", checked = false, hidden } = {}) => {
    const capturedPointers = new Set();
    return {
      attrs: { ...attrs },
      card,
      checked,
      classList: makeClassList(),
      dataset: { ...dataset },
      disabled: Boolean(attrs.disabled),
      hidden,
      textContent: "",
      value,
      capturedPointers,
      closest(requested) {
        if (requested === selector) return this;
        if (requested === "[data-item-action]" && this.dataset.itemAction) return this;
        if (requested === "[data-drag-handle]" && selector === "[data-drag-handle]") return this;
        if (requested === "[data-item-menu]" && selector.startsWith("[data-item-menu")) return this;
        if (requested === "[data-item-card]") return card;
        return null;
      },
      focus() {
        document.activeElement = this;
      },
      getAttribute(name) {
        return this.attrs[name] ?? null;
      },
      hasPointerCapture(pointerId) {
        return capturedPointers.has(pointerId);
      },
      matches(requested) {
        return requested === selector;
      },
      releasePointerCapture(pointerId) {
        capturedPointers.delete(pointerId);
      },
      setAttribute(name, valueToSet) {
        this.attrs[name] = String(valueToSet);
      },
      setPointerCapture(pointerId) {
        capturedPointers.add(pointerId);
      }
    };
  };

  const makeCard = (item, { isOpen = false, top = 0 } = {}) => {
    const card = {
      animations: [],
      animate(frames, options) {
        this.animations.push({ frames, options });
      },
      classList: makeClassList(`content-item-card${isOpen ? " is-open" : ""}`),
      controls: new Map(),
      dataset: { itemId: item.id, itemType: item.type },
      closest: (selector) => selector === "[data-item-card]" ? card : null,
      getBoundingClientRect: () => ({ top, height: 40 }),
      querySelector(selector) {
        return this.controls.get(selector) || null;
      }
    };
    const addControl = (selector, options) => {
      const control = makeControl(card, selector, options);
      card.controls.set(selector, control);
      return control;
    };

    addControl("[data-drag-handle]");
    addControl("[data-toggle-item]", { attrs: { "aria-expanded": String(isOpen) } });
    addControl("[data-item-body]", { attrs: { hidden: !isOpen } });
    addControl("[data-item-summary]");
    addControl("[data-item-secondary-summary]");
    addControl("[data-item-menu-button]", { attrs: { "aria-expanded": "false" } });
    addControl("[data-item-menu-list]", { hidden: true });
    addControl("[data-item-confirm]", { hidden: true });
    addControl("[data-item-confirm-text]");
    for (const action of ["up", "down", "delete", "confirm-delete", "cancel-delete"]) {
      addControl(`[data-item-action="${action}"]`, { dataset: { itemAction: action } });
    }

    if (item.type === "photo") {
      addControl("[data-photo-thumbnail]", { attrs: { src: item.src, alt: item.alt || "" } });
      addControl('[data-photo-field="alt"]', { dataset: { photoField: "alt" }, value: item.alt });
      addControl('[data-photo-field="caption"]', { dataset: { photoField: "caption" }, value: item.caption });
    } else if (item.type === "notice") {
      addControl('[data-notice-field="heading"]', { dataset: { noticeField: "heading" }, value: item.heading });
      addControl('[data-notice-field="body"]', { dataset: { noticeField: "body" }, value: item.body });
    } else if (item.type === "profile") {
      addControl('[data-profile-field="name"]', { dataset: { profileField: "name" }, value: item.name });
      addControl('[data-profile-field="role"]', { dataset: { profileField: "role" }, value: item.role });
      addControl('[data-profile-field="description"]', { dataset: { profileField: "description" }, value: item.description });
    } else if (item.type === "link") {
      addControl('[data-link-field="label"]', { dataset: { linkField: "label" }, value: item.label });
      addControl('[data-link-field="value"]', { dataset: { linkField: "value" }, value: item.value });
      addControl('[data-link-field="url"]', { dataset: { linkField: "url" }, value: item.url });
    } else {
      for (const field of ["time", "label", "place", "note", "mapUrl", "mapLatitude", "mapLongitude", "mapZoom"]) {
        addControl(`[data-course-field="${field}"]`, { dataset: { courseField: field }, value: item[field] });
      }
      addControl('[data-course-field="mapEnabled"]', {
        checked: item.mapEnabled,
        dataset: { courseField: "mapEnabled" }
      });
    }
    return card;
  };

  const readAttribute = (markup, name) => markup.match(new RegExp(`${name}="([^"]*)"`))?.[1] || "";
  const readInput = (markup, kind, field) => markup
    .match(new RegExp(`<input[^>]+data-${kind}-field="${field}"[^>]*value="([^"]*)"`))?.[1] || "";
  const readTextarea = (markup, kind, field) => markup
    .match(new RegExp(`<textarea[^>]+data-${kind}-field="${field}"[^>]*>([^<]*)</textarea>`))?.[1] || "";

  const parseCards = (markup) => [...markup.matchAll(/<article class="([^"]*)" data-item-card data-item-id="([^"]+)" data-item-type="([^"]+)">([\s\S]*?)<\/article>/g)]
    .map((match, index) => {
      const [, className, id, type, body] = match;
      const item = (() => {
        if (type === "photo") {
          return {
            id,
            type,
            src: readAttribute(body.match(/<img[^>]+data-photo-thumbnail[^>]*>/)?.[0] || "", "src"),
            alt: readInput(body, "photo", "alt"),
            caption: readTextarea(body, "photo", "caption")
          };
        }
        if (type === "notice") {
          return {
            id,
            type,
            heading: readInput(body, "notice", "heading"),
            body: readTextarea(body, "notice", "body")
          };
        }
        if (type === "profile") {
          return {
            id,
            type,
            name: readInput(body, "profile", "name"),
            role: readInput(body, "profile", "role"),
            description: readTextarea(body, "profile", "description")
          };
        }
        if (type === "link") {
          return {
            id,
            type,
            label: readInput(body, "link", "label"),
            value: readInput(body, "link", "value"),
            url: readInput(body, "link", "url")
          };
        }
        return {
          id,
          type,
          time: readInput(body, "course", "time"),
          label: readInput(body, "course", "label"),
          place: readInput(body, "course", "place"),
          note: readTextarea(body, "course", "note"),
          mapUrl: readInput(body, "course", "mapUrl"),
          mapEnabled: /data-course-field="mapEnabled"[^>]* checked/.test(body),
          mapLatitude: readInput(body, "course", "mapLatitude"),
          mapLongitude: readInput(body, "course", "mapLongitude"),
          mapZoom: readInput(body, "course", "mapZoom")
        };
      })();
      const card = makeCard(item, { isOpen: className.includes("is-open"), top: index * 50 });
      for (const action of ["up", "down", "delete"]) {
        const button = body.match(new RegExp(`<button[^>]+data-item-action="${action}"[^>]*>`))?.[0] || "";
        const control = card.querySelector(`[data-item-action="${action}"]`);
        control.disabled = /\sdisabled(?:\s|>)/.test(button);
        if (/aria-disabled="true"/.test(button)) control.attrs["aria-disabled"] = "true";
      }
      return card;
    });

  const contentEvents = makeEventTarget();
  const contentEditor = {
    ...contentEvents,
    cards: [],
    html: "",
    renderCount: 0,
    contains(card) {
      return this.cards.includes(card);
    },
    querySelector(selector) {
      if (selector === ".content-item-card.is-open") {
        return this.cards.find((card) => card.classList.contains("is-open")) || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-item-card]") return this.cards;
      if (selector === '[data-item-type="course"]') return this.cards.filter((card) => card.dataset.itemType === "course");
      if (selector === ".is-drop-before, .is-drop-after") {
        return this.cards.filter((card) => card.classList.contains("is-drop-before") || card.classList.contains("is-drop-after"));
      }
      return [];
    },
    set innerHTML(markup) {
      const detachedHandles = this.cards
        .map((card) => card.querySelector("[data-drag-handle]"))
        .filter((handle) => handle.capturedPointers.size);
      this.html = markup;
      this.renderCount += 1;
      this.cards = parseCards(markup);
      for (const handle of detachedHandles) {
        for (const pointerId of handle.capturedPointers) {
          const event = { pointerId, target: handle };
          document.dispatch("lostpointercapture", event);
          window.dispatch("lostpointercapture", event);
          handle.capturedPointers.delete(pointerId);
        }
      }
    },
    get innerHTML() {
      return this.html;
    }
  };

  const parseAttributes = (tag) => {
    const attributes = {};
    for (const match of String(tag).matchAll(/\s([a-z][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi)) {
      attributes[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
    }
    return attributes;
  };
  const buttonFromMarkup = (tag) => {
    const attrs = parseAttributes(tag);
    const dataset = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith("data-")) {
        const camel = key.slice(5).replace(/-([a-z])/g, (_match, char) => char.toUpperCase());
        dataset[camel] = value;
      }
    }
    return {
      attrs,
      classList: makeClassList(attrs.class || ""),
      dataset,
      focus() {
        document.activeElement = this;
      },
      getAttribute(name) {
        return this.attrs[name] ?? null;
      },
      closest(selector) {
        if (selector === "[data-template-id]" && this.dataset.templateId) return this;
        if (selector === "[data-occasion-id]" && this.dataset.occasionId) return this;
        return null;
      },
      scrollIntoView(options) {
        scrollIntoViewCalls.push({ node: this, options });
      },
      setAttribute(name, valueToSet) {
        this.attrs[name] = String(valueToSet);
      }
    };
  };
  const genericNode = () => ({
    ...makeEventTarget(),
    append() {},
    click() {},
    classList: makeClassList(),
    capturedPointers: new Set(),
    dataset: {},
    disabled: false,
    focus() { document.activeElement = this; },
    getAttribute(name) { return this.attrs?.[name] ?? null; },
    getBoundingClientRect() { return { width: 200, height: 300 }; },
    hasPointerCapture(pointerId) { return this.capturedPointers.has(pointerId); },
    hidden: false,
    html: "",
    querySelector: () => ({ hidden: false, textContent: "" }),
    querySelectorAll: () => [],
    releasePointerCapture(pointerId) { this.capturedPointers.delete(pointerId); },
    replaceChildren() {},
    setPointerCapture(pointerId) { this.capturedPointers.add(pointerId); },
    setAttribute(name, valueToSet) {
      this.attrs = { ...(this.attrs || {}), [name]: String(valueToSet) };
    },
    textContent: "",
    value: "",
    set innerHTML(markup) {
      this.html = markup;
    },
    get innerHTML() {
      return this.html;
    }
  });
  const makeListNode = () => ({
    ...genericNode(),
    buttons: [],
    querySelector(selector) {
      if (selector === ".occasion-chip.is-active") {
        return this.buttons.find((button) =>
          button.classList.contains("occasion-chip") && button.classList.contains("is-active")) || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-template-id]") return this.buttons.filter((button) => button.dataset.templateId);
      if (selector === "[data-occasion-id]") return this.buttons.filter((button) => button.dataset.occasionId);
      return [];
    },
    set innerHTML(markup) {
      this.html = markup;
      this.buttons = [...String(markup).matchAll(/<button\b[^>]*>/gi)].map(([tag]) => buttonFromMarkup(tag));
    },
    get innerHTML() {
      return this.html;
    }
  });
  const selectors = new Map();
  const mobileTabs = ["editor", "preview", "library"].map((view) => ({
    ...genericNode(),
    dataset: { mobileView: view }
  }));
  const node = (selector) => {
    if (!selectors.has(selector)) selectors.set(selector, genericNode());
    return selectors.get(selector);
  };
  selectors.set("#content-editor", contentEditor);
  const formElements = {
    introEffect: { value: "none" },
    particleEffect: { value: "none" },
    particleScale: { value: "100" },
    particleAmount: { value: "100" },
    englishFont: { value: "cormorant-garamond" },
    koreanFont: { value: "gowun-batang" },
    title: { value: "" },
    subtitle: { value: "" },
    dateTime: { value: "" },
    timeZone: { value: "" },
    dateLabel: { value: "" },
    host: { value: "" },
    location: { value: "" },
    mapUrl: { value: "" },
    mapEnabled: { checked: false },
    mapLatitude: { value: "" },
    mapLongitude: { value: "" },
    mapZoom: { value: "16" },
    message: { value: "" }
  };
  const formNode = {
    ...genericNode(),
    elements: formElements,
    querySelector(selector) {
      if (selector === "[data-map-settings]") return node("[data-map-settings]");
      if (selector === "[data-map-message]") return node("[data-map-message]");
      return genericNode();
    }
  };
  selectors.set("#invitation-form", formNode);
  selectors.set("#occasion-list", makeListNode());
  selectors.set("#template-list", makeListNode());
  /* #sample-sheet is a <dialog>, and the whole of what the app asks of it is
     showModal, close, and the "close" event a closed dialog fires. */
  /* A stand-in for the preview <iframe>. The frame is seeded with the whole
     standalone document and afterwards only its body is patched, so the
     language in <html lang> is only ever as current as the last seed — which
     is what this node exists to let a test read back. Off by default: every
     other test wants the pre-iframe host, where #preview is not an iframe. */
  if (previewFrame) {
    const frameDocument = {
      ...makeEventTarget(),
      body: { replaceChildren() {} },
      createElement: () => genericNode(),
      documentElement: {}
    };
    selectors.set("#preview", {
      ...genericNode(),
      tagName: "IFRAME",
      contentDocument: frameDocument,
      seeds: [],
      get srcdoc() { return this.seeds.at(-1) || ""; },
      set srcdoc(markup) {
        this.seeds.push(markup);
        this.dispatch("load");
      }
    });
  }
  selectors.set("#sample-sheet", {
    ...genericNode(),
    open: false,
    modalCalls: 0,
    showModal() {
      this.open = true;
      this.modalCalls += 1;
    },
    close() {
      if (!this.open) return;
      this.open = false;
      this.dispatch("close");
    }
  });
  document.querySelector = node;
  document.querySelectorAll = (selector) =>
    selector === ".mobile-view-tabs button[data-mobile-view]" ? mobileTabs : [];

  let source = read("assets/studio/app.js");
  /* Sample rendering paints into a frame this harness has no layout for, and
     is exercised in verify-studio.cjs. setStudioStage is deliberately not
     stubbed: it is the one funnel every stage change goes through, and the
     sheet/dialog dismissal it carries is a contract worth holding against the
     real function rather than a stand-in. */
  source = source.replace(/const renderSamplePreview = \([^)]*\) => \{[\s\S]*?\n\};/, 'const renderSamplePreview = () => {};');
  const previewStart = source.indexOf("const renderPreview = () => {");
  const previewEnd = source.indexOf("\nconst renderSaved =", previewStart);
  source = `${source.slice(0, previewStart)}const renderPreview = () => { globalThis.__previewRenders += 1; };\nconst playPreviewIntro = () => {};${source.slice(previewEnd)}`;
  source = source.replace(
    /const validateForExport = \(\) => \{[\s\S]*?\n\};/,
    "const validateForExport = () => true;"
  );
  source = source.replace(
    "const fillForm = (invitation) => {",
    "const fillForm = (invitation) => { globalThis.__fillFormCalls += 1;"
  );
  source = source.replace(/\ninit\(\);\s*$/, "");
  source += `\n;globalThis.__editorTest = {
    beginHeroImageDrag: typeof beginHeroImageDrag === "function" ? beginHeroImageDrag : undefined,
    captureAppliedBaseline,
    commitItemMove,
    fillForm,
    getHeroImageDragState: () => typeof heroImageDragState === "undefined" ? null : heroImageDragState,
    getFillFormCalls: () => globalThis.__fillFormCalls,
    getFormData,
    getItemsData,
    getMobileTabs: () => dom.mobileTabs,
    OCCASION_GROUP_LABEL_KEYS,
    getPendingPreviewMapKey: () => pendingPreviewMapKey,
    handleHeroImageSelection: typeof handleHeroImageSelection === "function" ? handleHeroImageSelection : undefined,
    handlePhotoSelection,
    loadInitialData,
    mountPreviewFrame,
    openSampleSheet,
    closeSampleSheet,
    setStudioStage,
    renderContentEditor,
    renderTemplates,
    removeHeroImage: typeof removeHeroImage === "function" ? removeHeroImage : undefined,
    resetHeroImage: typeof resetHeroImage === "function" ? resetHeroImage : undefined,
    saveDraft,
    saveCurrent,
    setDraftReady: (value) => { draftReady = value; },
    setMobileView,
    setPersonalDraft: (value) => { personalDraft = value; },
    syncHeroImageEditor: typeof syncHeroImageEditor === "function" ? syncHeroImageEditor : undefined,
    updateHeroImageScale: typeof updateHeroImageScale === "function" ? updateHeroImageScale : undefined,
    moveHeroImageDrag: typeof moveHeroImageDrag === "function" ? moveHeroImageDrag : undefined,
    moveHeroImageByKeyboard: typeof moveHeroImageByKeyboard === "function" ? moveHeroImageByKeyboard : undefined,
    finishHeroImageDrag: typeof finishHeroImageDrag === "function" ? finishHeroImageDrag : undefined,
    state,
    waitForDraftWrite: () => draftWrite
  };`;

  let uuid = 0;
  const context = {
    Blob,
    ContentOrder,
    FormData: class FormData {
      constructor(form) { this.form = form; }
      get(name) { return this.form.elements[name]?.value || ""; }
      has(name) { return Boolean(this.form.elements[name]?.checked); }
    },
    HeroImage,
    ImageTools: {
      ImageError: class ImageError extends Error {},
      compress: compress || (async () => ({ src: "data:image/png;base64,QQ==" }))
    },
    InvitationCore: {
      MAX_ITEMS: maxItems,
      MAX_PHOTOS: maxPhotos,
      MAX_STOPS: maxItems,
      buildStandaloneHtml,
      normalizeInvitation,
      renderInvitationBody
    },
    InvitationIntro: {
      ensureStyles() {},
      normalizeEffect: (value) => value || "none",
      stop() {}
    },
    PresetApplication,
    TemplateCatalog,
    InvitationI18n,
    InvitationStorage: {
      async list() { return []; },
      async put(record) { if (put) await put(record); },
      async putDraft(record) { if (putDraft) await putDraft(record); },
      async remove() {}
    },
    URL,
    /* Served off disk by path, so a language switch reads the real content
       overlay instead of the Korean base data a second time. */
    fetch: async (resource) => {
      const file = String(resource).split("?")[0];
      const served = file === "invitation-data.json" || /^assets\/i18n\/content-[a-z-]+\.json$/.test(file);
      return { ok: served && fs.existsSync(path.join(root, file)), json: async () => JSON.parse(read(file)) };
    },
    __previewRenders: 0,
    __fillFormCalls: 0,
    clearTimeout,
    console,
    crypto: { randomUUID: () => `uuid-${++uuid}` },
    document,
    localStorage: { getItem: () => null, setItem() {} },
    requestAnimationFrame(callback) {
      animationFrames.push(callback);
      return animationFrames.length;
    },
    setTimeout,
    window
  };
  vm.runInNewContext(source, context, { filename: "assets/studio/app.js" });

  return {
    api: context.__editorTest,
    contentEditor,
    document,
    matchMediaCalls,
    node,
    runAnimationFrames() {
      while (animationFrames.length) animationFrames.shift()();
    },
    scrollCalls,
    scrollIntoViewCalls,
    terminal(type, event) {
      document.dispatch(type, event);
      window.dispatch(type, event);
    },
    window
  };
};

const loadIntroLifecycleHarness = () => {
  const documentEvents = makeEventTarget();
  const windowEvents = makeEventTarget();
  const genericNode = () => ({
    ...makeEventTarget(),
    classList: makeClassList(),
    dataset: {},
    disabled: false,
    hidden: false,
    textContent: "",
    value: "",
    append() {},
    click() {},
    focus() {},
    querySelector: () => genericNode(),
    querySelectorAll: () => [],
    replaceChildren() {}
  });
  const controls = new Map();
  const control = (name, value = "") => ({
    ...makeEventTarget(),
    checked: false,
    disabled: false,
    name,
    validity: { valid: true },
    value,
    matches: () => false
  });
  const elements = {
    introEffect: control("introEffect", "none"),
    particleEffect: control("particleEffect", "none"),
    particleScale: control("particleScale", "100"),
    particleAmount: control("particleAmount", "100"),
    englishFont: control("englishFont", "cormorant-garamond"),
    koreanFont: control("koreanFont", "gowun-batang"),
    title: control("title", "Preview test"),
    subtitle: control("subtitle"),
    dateTime: control("dateTime"),
    timeZone: control("timeZone"),
    dateLabel: control("dateLabel"),
    host: control("host"),
    location: control("location"),
    mapUrl: control("mapUrl"),
    mapEnabled: control("mapEnabled"),
    mapLatitude: control("mapLatitude"),
    mapLongitude: control("mapLongitude"),
    mapZoom: control("mapZoom", "16"),
    message: control("message")
  };
  const form = {
    ...makeEventTarget(),
    elements,
    querySelector(selector) {
      if (selector === "[data-map-settings]") return controls.get("map-settings");
      if (selector === "[data-map-message]") return controls.get("map-message");
      return genericNode();
    }
  };
  controls.set("map-settings", genericNode());
  controls.set("map-message", genericNode());

  const preview = {
    ...makeEventTarget(),
    children: [],
    classList: makeClassList(),
    dataset: {},
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    append(child) {
      child.parentNode = this;
      this.children.push(child);
    },
    querySelector(selector) {
      if (selector === "[data-intro-overlay]") {
        return this.children.find((child) => child.dataset?.introOverlay !== undefined) || null;
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
    replaceChildren(...children) {
      this.children.forEach((child) => { child.parentNode = null; });
      this.children = children;
      children.forEach((child) => { child.parentNode = this; });
    }
  };
  const replay = control("", "");
  const contentEditor = {
    ...makeEventTarget(),
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const document = {
    ...documentEvents,
    body: { dataset: {} },
    defaultView: null,
    head: { append() {} },
    createElement() {
      return {
        childNodes: [],
        querySelectorAll: () => [],
        set innerHTML(markup) {
          this.childNodes = [{ markup, parentNode: null }];
        }
      };
    },
    elementFromPoint: () => null,
    querySelector(selector) {
      if (selector === "#invitation-form") return form;
      if (selector === "#preview") return preview;
      if (selector === "#replay-intro-button") return replay;
      if (selector === '[name="introEffect"]') return elements.introEffect;
      if (selector === "#content-editor") return contentEditor;
      if (!controls.has(selector)) controls.set(selector, genericNode());
      return controls.get(selector);
    },
    querySelectorAll: () => []
  };
  const calls = [];
  const stops = [];
  const createOverlay = () => ({
    dataset: { introOverlay: "" },
    parentNode: null,
    remove() {
      if (!this.parentNode) return;
      const index = this.parentNode.children.indexOf(this);
      if (index >= 0) this.parentNode.children.splice(index, 1);
      this.parentNode = null;
    }
  });
  const InvitationIntro = {
    ensureStyles() {},
    normalizeEffect(value) {
      return ["envelope", "card-shrink", "dawn", "fireworks", "curtain", "petals", "spotlight", "photo-focus"].includes(value)
        ? value
        : "none";
    },
    play(host, invitation, options) {
      host.querySelector("[data-intro-overlay]")?.remove();
      const overlay = createOverlay();
      host.append(overlay);
      calls.push({ host, invitation, options, overlay });
      return { finish: () => overlay.remove() };
    },
    stop(host) {
      stops.push(host);
      host.querySelector("[data-intro-overlay]")?.remove();
    }
  };
  const window = {
    ...windowEvents,
    confirm: () => true,
    matchMedia: () => ({ matches: false }),
    open() {},
    scrollTo() {}
  };
  document.defaultView = window;

  let source = read("assets/studio/app.js").replace(/\ninit\(\);\s*$/, "");
  source += "\n;globalThis.__introLifecycleTest = { renderPreview };";
  const context = {
    Blob,
    ContentOrder,
    FormData: class FormData {
      constructor(formNode) { this.elements = formNode.elements; }
      get(name) { return this.elements[name]?.value || ""; }
      has(name) { return Boolean(this.elements[name]?.checked); }
    },
    ImageTools: { ImageError: class ImageError extends Error {}, compress: async () => ({}) },
    InvitationCore,
    InvitationI18n,
    InvitationIntro,
    InvitationStorage: { async list() { return []; }, async open() { return { close() {} }; }, async put() {}, async remove() {} },
    URL,
    clearTimeout() {},
    console,
    crypto: { randomUUID: () => "intro-test" },
    document,
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout: () => 1,
    window
  };
  vm.runInNewContext(source, context, { filename: "assets/studio/app.js" });

  return { calls, elements, form, preview, replay, stops, api: context.__introLifecycleTest };
};

const invitationParser = class DOMParser {
  parseFromString(html) {
    const matches = [...String(html).matchAll(/<script\s+id="invitation-data"\s+type="application\/json">([\s\S]*?)<\/script>/g)]
      .map((match) => ({ textContent: match[1] }));
    return {
      querySelector(selector) {
        if (selector !== '#invitation-data[type="application/json"]') return null;
        return matches[0] || null;
      },
      querySelectorAll(selector) {
        if (selector !== '#invitation-data[type="application/json"]') return [];
        return matches;
      }
    };
  }
};

const loadLibraryHarness = ({ records = [], list, put, randomUUID, remove, setItem } = {}) => {
  const values = new Map();
  const writes = [];
  const storage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (setItem) setItem(key, value, writes.length + 1);
      values.set(key, value);
      writes.push(JSON.parse(value));
    }
  };
  const repositoryRecords = records.slice();
  const InvitationStorage = {
    async open() { return { close() {} }; },
    async list() {
      if (list) return list(repositoryRecords);
      return repositoryRecords.slice().sort((left, right) => {
        const leftTime = Date.parse(left.createdAt) || Number.NEGATIVE_INFINITY;
        const rightTime = Date.parse(right.createdAt) || Number.NEGATIVE_INFINITY;
        return rightTime - leftTime || String(left.id).localeCompare(String(right.id));
      });
    },
    async get(id) { return repositoryRecords.find((record) => record.id === id); },
    async put(record) {
      if (put) await put(record);
      const index = repositoryRecords.findIndex((item) => item.id === record.id);
      if (index >= 0) repositoryRecords[index] = record;
      else repositoryRecords.unshift(record);
    },
    async remove(id) {
      if (remove) await remove(id);
      const index = repositoryRecords.findIndex((record) => record.id === id);
      if (index >= 0) repositoryRecords.splice(index, 1);
    }
  };

  const genericNode = () => ({
    addEventListener() {},
    append() {},
    click() {},
    dataset: {},
    disabled: false,
    files: [],
    focus() {},
    innerHTML: "",
    querySelector: () => null,
    querySelectorAll: () => [],
    replaceChildren() {},
    textContent: "",
    value: ""
  });
  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, genericNode());
    return nodes.get(selector);
  };
  const formElements = {
    mapEnabled: { checked: false },
    mapLatitude: { validity: { valid: true }, value: "" },
    mapLongitude: { validity: { valid: true }, value: "" },
    mapZoom: { value: "16" },
    particleScale: { value: "100" },
    particleAmount: { value: "100" }
  };
  const form = {
    ...genericNode(),
    elements: formElements,
    querySelector(selector) {
      if (selector === ":invalid") return null;
      return genericNode();
    }
  };
  nodes.set("#invitation-form", form);

  const document = {
    ...makeEventTarget(),
    activeElement: null,
    body: { append() {}, dataset: {} },
    createElement: () => genericNode(),
    head: { append() {} },
    querySelector: node,
    querySelectorAll: () => []
  };
  const window = {
    ...makeEventTarget(),
    confirm: () => true,
    matchMedia: () => ({ matches: false }),
    open() {},
    scrollTo() {}
  };

  let source = read("assets/studio/app.js").replace(/\ninit\(\);\s*$/, "");
  source += `\n;globalThis.__libraryTest = {
    enforceSavedLimit,
    handleSavedAction,
    makeSavedItem,
    migrateLegacySaved,
    refreshSaved,
    registerUploadedHtml,
    saveCurrent,
    saveRecord,
    state
  };`;
  let uuid = 0;
  const context = {
    Blob,
    ContentOrder,
    DOMParser: invitationParser,
    FormData: class FormData {
      get(name) {
        return {
          title: "Saved title",
          subtitle: "Subtitle",
          dateLabel: "Date",
          host: "Host",
          location: "Location",
          message: "Message",
          particleEffect: "none",
          particleScale: "100",
          particleAmount: "100",
          englishFont: "cormorant-garamond",
          koreanFont: "gowun-batang"
        }[name] || "";
      }
      has() { return false; }
    },
    ImageTools: { ImageError: class ImageError extends Error {}, compress: async () => ({}) },
    InvitationCore,
    InvitationI18n,
    InvitationStorage,
    URL,
    clearTimeout,
    console,
    crypto: { randomUUID: randomUUID || (() => `record-uuid-${++uuid}`) },
    document,
    fetch: async () => ({ ok: true, json: async () => ({ templates: [], defaultInvitation: {} }) }),
    localStorage: storage,
    setTimeout,
    window
  };
  vm.runInNewContext(source, context, { filename: "assets/studio/app.js" });

  return {
    api: context.__libraryTest,
    node,
    repositoryRecords,
    storage,
    values,
    writes
  };
};

const validInvitationHtml = (title = "Stored invitation") => InvitationCore.buildStandaloneHtml({
  title,
  items: [course(`course-${title}`, "Seongsu")]
});
const invitationDataFrom = (html) => {
  const match = String(html).match(/<script id="invitation-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match);
  return JSON.parse(match[1]);
};

test("saved invitations open through a same-origin viewer", () => {
  const app = read("assets/studio/app.js");
  const viewer = read("viewer.html");

  assert.match(app, /viewer\.html\?id=/);
  assert.doesNotMatch(app, /const openSaved = \(item\) => \{[\s\S]*?URL\.createObjectURL/);
  assert.match(viewer, /assets\/invitation\/viewer\.js/);
});

test("maker and viewer each use exactly one inline favicon", () => {
  for (const page of ["studio.html", "viewer.html"]) {
    const faviconLinks = getFaviconLinks(read(page));

    assert.equal(faviconLinks.length, 1, `${page} must declare exactly one favicon link`);
    assert.ok(faviconLinks[0].rel.toLowerCase().split(/\s+/).includes("icon"));
    assert.ok(faviconLinks[0].href.toLowerCase().startsWith("data:"), `${page} favicon must be inline`);
    assert.equal(faviconLinks.some(({ href = "" }) => !href.toLowerCase().startsWith("data:")), false);
  }
});

test("legacy migration removes only each successfully durable occurrence", async () => {
  const failedId = "legacy-failed";
  const legacy = [
    { id: "legacy-ok", title: "Old title", createdAt: "2026-09-01T10:00:00.000Z", source: "upload", html: validInvitationHtml("Migrated") },
    { id: failedId, title: "Failed", createdAt: "2026-09-02T10:00:00.000Z", source: "generated", html: validInvitationHtml("Retained") },
    { id: "legacy-invalid", html: "<html><script id=\"invitation-data\">{}</script></html>" },
    { id: "legacy-array", html: '<script id="invitation-data" type="application/json">[]</script>' }
  ];
  const puts = [];
  let rejectFailedRecord = true;
  const harness = loadLibraryHarness({
    async put(record) {
      puts.push(record);
      if (record.id === failedId && rejectFailedRecord) throw new Error("quota");
    }
  });
  harness.values.set("invitation-maker.saved", JSON.stringify(legacy));

  const result = await harness.api.migrateLegacySaved();

  assert.equal(result.migrated, 1);
  assert.equal(result.retained, 3);
  assert.deepEqual(Array.from(puts, (record) => record.id), ["legacy-ok", failedId]);
  assert.equal(puts[0].source, "upload");
  assert.match(puts[0].createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(puts[0].html, /Migrated/);
  assert.equal(harness.writes.length, 2);
  assert.deepEqual(Array.from(harness.writes[0], (record) => record.id), ["legacy-ok", failedId, "legacy-invalid", "legacy-array"]);
  assert.deepEqual(Array.from(harness.writes[1], (record) => record.id), [failedId, "legacy-invalid", "legacy-array"]);
  assert.deepEqual(
    Array.from(JSON.parse(harness.values.get("invitation-maker.saved")), (record) => record.id),
    [failedId, "legacy-invalid", "legacy-array"]
  );

  rejectFailedRecord = false;
  const resumed = await harness.api.migrateLegacySaved();

  assert.equal(resumed.migrated, 1);
  assert.equal(resumed.retained, 2);
  assert.deepEqual(
    Array.from(JSON.parse(harness.values.get("invitation-maker.saved")), (record) => record.id),
    ["legacy-invalid", "legacy-array"]
  );
});

test("legacy migration checkpoints unique IDs before duplicate records can overwrite", async () => {
  const legacy = [
    { id: "duplicate", html: validInvitationHtml("First duplicate") },
    { id: "duplicate", html: validInvitationHtml("Second duplicate") }
  ];
  const putIds = [];
  const harness = loadLibraryHarness({ put: async (record) => putIds.push(record.id) });
  harness.values.set("invitation-maker.saved", JSON.stringify(legacy));

  const result = await harness.api.migrateLegacySaved();

  assert.equal(result.migrated, 2);
  assert.equal(new Set(putIds).size, 2);
  assert.equal(putIds[0], "duplicate");
  assert.notEqual(putIds[1], "duplicate");
  assert.equal(harness.repositoryRecords.length, 2);
  assert.deepEqual(
    new Set(harness.repositoryRecords.map((record) => record.title)),
    new Set(["First duplicate", "Second duplicate"])
  );
  assert.deepEqual(Array.from(harness.writes[0], (record) => record.id), putIds);
});

test("generated migration IDs cannot claim a later unique legacy ID", async () => {
  const generated = ["reserved", "replacement"];
  const harness = loadLibraryHarness({ randomUUID: () => generated.shift() });
  harness.values.set("invitation-maker.saved", JSON.stringify([
    { html: validInvitationHtml("Missing first") },
    { id: "invitation-reserved", html: validInvitationHtml("Reserved existing") }
  ]));

  await harness.api.migrateLegacySaved();

  const checkpointIds = Array.from(harness.writes[0], (record) => record.id);
  assert.deepEqual(checkpointIds, ["invitation-replacement", "invitation-reserved"]);
  assert.equal(new Set(checkpointIds).size, 2);
});

test("missing legacy ID is reused after a post-put checkpoint failure", async () => {
  let failRemovalCheckpoint = true;
  const putIds = [];
  const harness = loadLibraryHarness({
    put: async (record) => putIds.push(record.id),
    setItem(key, value, callNumber) {
      if (failRemovalCheckpoint && callNumber === 2) throw new Error("localStorage write failed");
    }
  });
  harness.values.set("invitation-maker.saved", JSON.stringify([{ html: validInvitationHtml("Missing ID") }]));

  const first = await harness.api.migrateLegacySaved();
  const checkpointedId = JSON.parse(harness.values.get("invitation-maker.saved"))[0].id;

  assert.equal(first.migrated, 0);
  assert.match(checkpointedId, /^invitation-/);
  assert.deepEqual(putIds, [checkpointedId]);
  assert.equal(harness.repositoryRecords.length, 1);

  failRemovalCheckpoint = false;
  const resumed = await harness.api.migrateLegacySaved();

  assert.equal(resumed.migrated, 1);
  assert.deepEqual(putIds, [checkpointedId, checkpointedId]);
  assert.equal(harness.repositoryRecords.length, 1);
  assert.equal(harness.repositoryRecords[0].id, checkpointedId);
  assert.deepEqual(JSON.parse(harness.values.get("invitation-maker.saved")), []);
});

test("failed identity checkpoint prevents every legacy IndexedDB write", async () => {
  let puts = 0;
  const harness = loadLibraryHarness({
    put: async () => { puts += 1; },
    setItem() { throw new Error("checkpoint unavailable"); }
  });
  harness.values.set("invitation-maker.saved", JSON.stringify([{ html: validInvitationHtml("No checkpoint") }]));

  const result = await harness.api.migrateLegacySaved();

  assert.equal(puts, 0);
  assert.equal(result.migrated, 0);
  assert.equal(result.retained, 1);
  assert.equal(harness.repositoryRecords.length, 0);
});

test("record persistence enforces MAX_SAVED without deleting the current record", async () => {
  const current = {
    id: "current",
    title: "Current",
    createdAt: "2000-01-01T00:00:00.000Z",
    source: "generated",
    html: validInvitationHtml("Current")
  };
  const oldRecords = Array.from({ length: 20 }, (_, index) => ({
    id: `newer-${index}`,
    title: `Newer ${index}`,
    createdAt: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    source: "generated",
    html: validInvitationHtml(`Newer ${index}`)
  }));
  const removed = [];
  const harness = loadLibraryHarness({ records: oldRecords, remove: async (id) => removed.push(id) });

  await harness.api.saveRecord(current);

  assert.equal(harness.repositoryRecords.length, 20);
  assert.ok(harness.repositoryRecords.some((record) => record.id === current.id));
  assert.equal(removed.length, 1);
  assert.notEqual(removed[0], current.id);
  assert.equal(harness.api.state.saved.length, 20);
});

test("uploaded HTML waits for durable storage and restores its disabled control", async () => {
  const pending = deferred();
  let stored;
  const harness = loadLibraryHarness({
    async put(record) {
      stored = record;
      await pending.promise;
    }
  });
  const upload = harness.node("#html-upload");
  upload.value = "chosen.html";
  const file = { name: "chosen.html", size: 1024, text: async () => validInvitationHtml("Uploaded") };

  const registration = harness.api.registerUploadedHtml(file);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(upload.disabled, true);
  assert.equal(harness.api.state.saved.length, 0);

  pending.resolve();
  await registration;

  assert.equal(stored.source, "upload");
  assert.match(stored.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(upload.disabled, false);
  assert.equal(upload.value, "");
  assert.equal(harness.api.state.saved.length, 1);
  assert.match(harness.node("#upload-status").textContent, /초대장을 등록했습니다/);
});

test("active intro survives download import storage and viewer rebuild", async () => {
  const sourceHtml = InvitationCore.buildStandaloneHtml({
    introEffect: "fireworks",
    templateId: "botanical",
    englishFont: "great-vibes",
    koreanFont: "gmarket-sans",
    title: "Round trip invitation",
    items: [course("round-trip-course", "Seongsu")]
  });
  const harness = loadLibraryHarness();

  await harness.api.registerUploadedHtml({ size: sourceHtml.length, text: async () => sourceHtml });

  assert.equal(harness.repositoryRecords.length, 1);
  const stored = harness.repositoryRecords[0];
  assert.equal(invitationDataFrom(stored.html).introEffect, "fireworks");
  assert.match(stored.html, /data-intro-effect="fireworks"/);
  assert.match(stored.html, /data-intro-runtime/);

  const viewerSource = read("assets/invitation/viewer.js");
  const written = [];
  const result = vm.runInNewContext(viewerSource, {
    DOMParser: invitationParser,
    InvitationCore,
    InvitationStorage: { async get() { return stored; } },
    URLSearchParams,
    document: {
      close() {},
      open() {},
      querySelector: () => ({ innerHTML: "" }),
      write(html) { written.push(html); }
    },
    window: { location: { search: `?id=${stored.id}` } }
  }, { filename: "assets/invitation/viewer.js" });
  await result;

  assert.equal(written.length, 1);
  assert.equal(invitationDataFrom(written[0]).introEffect, "fireworks");
  assert.match(written[0], /data-template="botanical"/);
  assert.match(written[0], /style="--font-en:'Great Vibes', 'Brush Script MT', cursive;--font-ko:'Gmarket Sans', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif"/);
  assert.match(written[0], /data-intro-effect="fireworks"/);
  assert.match(written[0], /data-intro-runtime/);
});

test("one preset per family survives upload registration and viewer rebuild without item reordering", async () => {
  const data = JSON.parse(read("invitation-data.json"));
  const catalog = TemplateCatalog.normalizeCatalog(data);
  const presetsByFamily = new Map();
  for (const preset of catalog.templates) {
    if (!presetsByFamily.has(preset.familyId)) presetsByFamily.set(preset.familyId, preset);
  }
  const viewerSource = read("assets/invitation/viewer.js");

  for (const familyId of TemplateCatalog.FAMILY_IDS) {
    const preset = presetsByFamily.get(familyId);
    assert.ok(preset, `${familyId} has a preset`);
    const previewInvitation = InvitationCore.normalizeInvitation({
      ...preset.defaults,
      templateId: preset.id,
      layoutFamily: preset.familyId
    });
    const expectedOrder = previewInvitation.items.map(({ id, type }) => `${id}:${type}`);
    const standaloneHtml = InvitationCore.buildStandaloneHtml(previewInvitation);
    const harness = loadLibraryHarness();

    await harness.api.registerUploadedHtml({ size: standaloneHtml.length, text: async () => standaloneHtml });

    const stored = harness.repositoryRecords[0];
    const storedInvitation = invitationDataFrom(stored.html);
    const written = [];
    const result = vm.runInNewContext(viewerSource, {
      DOMParser: invitationParser,
      InvitationCore,
      InvitationStorage: { async get() { return stored; } },
      URLSearchParams,
      document: {
        close() {},
        open() {},
        querySelector: () => ({ innerHTML: "" }),
        write(html) { written.push(html); }
      },
      window: { location: { search: `?id=${stored.id}` } }
    }, { filename: "assets/invitation/viewer.js" });
    await result;

    const standaloneInvitation = invitationDataFrom(standaloneHtml);
    const viewerInvitation = invitationDataFrom(written[0]);
    for (const invitation of [standaloneInvitation, storedInvitation, viewerInvitation]) {
      assert.equal(invitation.title, previewInvitation.title);
      assert.equal(invitation.templateId, preset.id);
      assert.equal(invitation.layoutFamily, familyId);
      assert.deepEqual(invitation.items.map(({ id, type }) => `${id}:${type}`), expectedOrder);
    }
  }
});

test("successful generation emits only aggregate analytics and transport failure cannot break saving", async () => {
  const harness = loadEditorHarness();
  const events = [];
  harness.window.InvitationAnalytics = { track(name, props, options) {
    events.push({ name, props, options });
    throw new Error("analytics unavailable");
  } };
  await harness.api.saveCurrent();
  assert.equal(events[0]?.name, "invitation_completed");
  assert.equal(events[0].options.dedupKey, "completed");
  assert.equal(Object.hasOwn(events[0].props, "title"), false);
  assert.equal(Object.hasOwn(events[0].props, "items"), false);
  assert.match(harness.node("#save-status").textContent, /목록에 등록했습니다/);
});

test("autosave failures keep the localized status and report a draft-save fault", async () => {
  const failure = new Error("Alice Johnson at 221B Baker Street");
  const reports = [];
  const harness = loadEditorHarness({ putDraft: async () => { throw failure; } });
  harness.window.InvitationErrorReporting = {
    reportError(error, context) { reports.push({ error, context }); }
  };
  harness.api.setDraftReady(true);

  harness.api.saveDraft();
  await harness.api.waitForDraftWrite();

  assert.equal(harness.node("#draft-status-text").textContent, ko("status.draftFailed"));
  assert.deepEqual(reports, [{ error: failure, context: "draft_save" }]);
});

test("setDraftStatus updates the short label and icon for the failed state, not a frozen 'Saved'", async () => {
  const harness = loadEditorHarness({ putDraft: async () => { throw new Error("disk full"); } });
  harness.window.InvitationErrorReporting = { reportError() {} };
  harness.api.setDraftReady(true);

  harness.api.saveDraft();
  await harness.api.waitForDraftWrite();

  assert.equal(harness.node("#draft-status-text").textContent, ko("status.draftFailed"));
  assert.equal(harness.node(".draft-status-short").textContent, ko("status.draftFailedShort"));
  assert.notEqual(harness.node(".draft-status-short").textContent, ko("status.draftSavedShort"));
  assert.equal(harness.node(".draft-status-icon").classList.contains("is-warning"), true);
});

test("manual save failures keep the localized status and report a draft-save fault", async () => {
  const failure = new Error("Robert Smith at The Grand Hotel");
  const reports = [];
  const harness = loadEditorHarness({ put: async () => { throw failure; } });
  harness.window.InvitationErrorReporting = {
    reportError(error, context) { reports.push({ error, context }); }
  };

  await harness.api.saveCurrent();

  assert.equal(harness.node("#save-status").textContent, ko("status.saveFailed"));
  assert.deepEqual(reports, [{ error: failure, context: "draft_save" }]);
});

test("generated save waits for durability and restores the save button", async () => {
  const pending = deferred();
  const harness = loadLibraryHarness({ put: async () => pending.promise });
  const saveButton = harness.node("#save-button");

  const save = harness.api.saveCurrent();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saveButton.disabled, true);
  assert.equal(harness.api.state.saved.length, 0);

  pending.resolve();
  await save;

  assert.equal(saveButton.disabled, false);
  assert.equal(harness.api.state.saved.length, 1);
  assert.equal(harness.api.state.saved[0].source, "generated");
  assert.match(harness.node("#save-status").textContent, /목록에 등록했습니다/);
});

test("saved deletion waits for durability and restores the clicked button", async () => {
  const pending = deferred();
  const existing = {
    id: "delete-me",
    title: "Delete me",
    createdAt: "2026-09-05T00:00:00.000Z",
    source: "generated",
    html: validInvitationHtml("Delete me")
  };
  const harness = loadLibraryHarness({ records: [existing], remove: async () => pending.promise });
  await harness.api.refreshSaved();
  const button = {
    dataset: { action: "delete", id: existing.id },
    disabled: false,
    closest(selector) { return selector === "[data-action]" ? this : null; }
  };

  const deletion = harness.api.handleSavedAction({ target: button });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(button.disabled, true);
  assert.equal(harness.api.state.saved.length, 1);

  pending.resolve();
  await deletion;

  assert.equal(button.disabled, false);
  assert.equal(harness.api.state.saved.length, 0);
  assert.match(harness.node("#upload-status").textContent, /삭제했습니다/);
});

test("repository failures are reported as storage errors, not invalid uploads", async () => {
  const harness = loadLibraryHarness({ put: async () => { throw new Error("disk unavailable"); } });

  await harness.api.registerUploadedHtml({ size: 1024, text: async () => validInvitationHtml("Valid upload") });

  assert.match(harness.node("#upload-status").textContent, /저장 공간에 기록하지 못해 등록에 실패했습니다/);
  assert.doesNotMatch(harness.node("#upload-status").textContent, /이 제작기에서 다운로드한 HTML만/);
  assert.equal(harness.node("#html-upload").disabled, false);
});

test("durable generated save remains successful when cleanup listing fails", async () => {
  const harness = loadLibraryHarness({
    list: async () => { throw new Error("list failed"); }
  });

  await harness.api.saveCurrent();

  assert.equal(harness.repositoryRecords.length, 1);
  assert.equal(harness.api.state.saved.length, 1);
  assert.equal(harness.api.state.saved[0].source, "generated");
  assert.match(harness.node("#save-status").textContent, /등록은 완료/);
  assert.match(harness.node("#save-status").textContent, /정리|동기화/);
  assert.doesNotMatch(harness.node("#save-status").textContent, /등록에 실패/);
});

test("durable uploaded save remains successful when cleanup listing fails", async () => {
  const harness = loadLibraryHarness({
    list: async () => { throw new Error("list failed"); }
  });

  await harness.api.registerUploadedHtml({ size: 1024, text: async () => validInvitationHtml("Durable upload") });

  assert.equal(harness.repositoryRecords.length, 1);
  assert.equal(harness.api.state.saved.length, 1);
  assert.equal(harness.api.state.saved[0].source, "upload");
  assert.match(harness.node("#upload-status").textContent, /등록은 완료/);
  assert.match(harness.node("#upload-status").textContent, /정리|동기화/);
  assert.doesNotMatch(harness.node("#upload-status").textContent, /등록에 실패/);
});

test("durable deletion updates local state when repository refresh fails", async () => {
  const existing = {
    id: "durably-deleted",
    title: "Durably deleted",
    createdAt: "2026-09-05T00:00:00.000Z",
    source: "generated",
    html: validInvitationHtml("Durably deleted")
  };
  const harness = loadLibraryHarness({
    records: [existing],
    list: async () => { throw new Error("list failed"); }
  });
  harness.api.state.saved = [existing];
  const button = {
    dataset: { action: "delete", id: existing.id },
    disabled: false,
    closest(selector) { return selector === "[data-action]" ? this : null; }
  };

  await harness.api.handleSavedAction({ target: button });

  assert.equal(harness.repositoryRecords.length, 0);
  assert.equal(harness.api.state.saved.length, 0);
  assert.match(harness.node("#upload-status").textContent, /삭제는 완료/);
  assert.match(harness.node("#upload-status").textContent, /새로고침|동기화/);
  assert.doesNotMatch(harness.node("#upload-status").textContent, /변경하지 못/);
  assert.equal(button.disabled, false);
});

test("library implementation uses IndexedDB outside resumable migration and accepts exactly 10 MiB", () => {
  const app = read("assets/studio/app.js");
  const migration = app.match(/const migrateLegacySaved = async \(\) => \{[\s\S]*?\n\};/)?.[0] || "";
  // The studio also drops a same-origin flag so the landing page knows this
  // browser has opened it before. That is unrelated to the saved-invitations
  // library this test guards, so it is excluded the same way the legacy
  // migration is.
  const visitedFlag = app.match(/try \{ localStorage\.setItem\("invitation-studio:visited"[^\n]*\n/)?.[0] || "";
  const appWithoutMigration = app.replace(migration, "").replace(visitedFlag, "");

  assert.match(app, /const MAX_UPLOAD_BYTES = 10 \* 1024 \* 1024/);
  // The over-size message moved into the dictionary; assert the guard still
  // reaches for it and that every language actually names the 10MB limit,
  // which the single-language literal could never check.
  assert.match(app, /dom\.uploadStatus\.textContent = t\("status\.uploadTooLarge"\)/);
  assert.match(ko("status.uploadTooLarge"), /10MB/);
  assert.match(en("status.uploadTooLarge"), /10MB/);
  assert.match(app, /await InvitationStorage\.open\(\)/);
  assert.match(app, /await InvitationStorage\.(?:put|remove|list)\(/);
  assert.doesNotMatch(appWithoutMigration, /localStorage\.(?:getItem|setItem|removeItem)/);
});

test("library initialization distinguishes open failure from later sync failure", () => {
  const app = read("assets/studio/app.js");
  const init = app.match(/const init = async \(\) => \{[\s\S]*?\n\};/)?.[0] || "";
  const statusKeys = [...init.matchAll(/dom\.uploadStatus\.textContent = t\("([^"]+)"\)/g)]
    .map((match) => match[1]);

  assert.ok(statusKeys.includes("status.storageUnavailable"));
  assert.ok(statusKeys.some((key) => /sync|migration/i.test(key)));
  // Every branch must still say something different, in every language — a
  // shared sentence would hide which failure the reader is actually looking at.
  assert.equal(new Set(statusKeys).size, statusKeys.length);
  for (const translate of [ko, en]) {
    const messages = statusKeys.map((key) => translate(key));
    assert.equal(new Set(messages).size, messages.length, `duplicate init status copy: ${messages}`);
    for (const message of messages) assert.ok(message.length > 0 && !statusKeys.includes(message));
  }
});

test("viewer awaits IndexedDB and rebuilds only a typed JSON invitation payload", async () => {
  const viewerSource = read("assets/invitation/viewer.js");
  const written = [];
  const main = { innerHTML: "" };
  const document = {
    close() {},
    open() {},
    querySelector: () => main,
    write(html) { written.push(html); }
  };
  let requestedId = null;
  const context = {
    DOMParser: invitationParser,
    InvitationCore,
    InvitationStorage: {
      async get(id) {
        requestedId = id;
        return { id, html: validInvitationHtml("Viewer rebuilt") };
      }
    },
    URLSearchParams,
    document,
    window: { location: { search: "?id=saved-1" } }
  };

  const result = vm.runInNewContext(viewerSource, context, { filename: "assets/invitation/viewer.js" });
  await result;

  assert.equal(requestedId, "saved-1");
  assert.equal(written.length, 1);
  assert.match(written[0], /Viewer rebuilt/);
  assert.doesNotMatch(viewerSource, /localStorage/);
  assert.match(viewerSource, /querySelectorAll\('#invitation-data\[type="application\/json"\]'\)/);
});

test("app rejects imported HTML containing duplicate invitation payloads", async () => {
  const harness = loadLibraryHarness();
  const duplicated = `${validInvitationHtml("First payload")}${validInvitationHtml("Second payload")}`;

  await harness.api.registerUploadedHtml({ size: duplicated.length, text: async () => duplicated });

  assert.equal(harness.repositoryRecords.length, 0);
  assert.equal(harness.api.state.saved.length, 0);
  assert.match(harness.node("#upload-status").textContent, /이 제작기에서 다운로드한 HTML만/);
});

test("viewer rejects stored HTML containing duplicate invitation payloads", async () => {
  const viewerSource = read("assets/invitation/viewer.js");
  const main = { innerHTML: "" };
  const written = [];
  const duplicated = `${validInvitationHtml("First payload")}${validInvitationHtml("Second payload")}`;
  const context = {
    DOMParser: invitationParser,
    InvitationCore,
    // viewer.html loads the engine in <head>, so the sandbox carries it too.
    InvitationI18n,
    InvitationStorage: { async get() { return { id: "duplicate", html: duplicated }; } },
    URLSearchParams,
    document: {
      close() {},
      open() {},
      querySelector: () => main,
      write(html) { written.push(html); }
    },
    window: { location: { search: "?id=duplicate" } }
  };

  InvitationI18n.setLanguage("ko", { persist: false });
  const result = vm.runInNewContext(viewerSource, context, { filename: "assets/invitation/viewer.js" });
  await result;

  assert.equal(written.length, 0);
  // Asserted through the dictionary rather than as a literal, so the copy can
  // be edited in one place while this still pins the exact rendered sentence.
  assert.ok(main.innerHTML.includes(ko("viewer.errorBody")), main.innerHTML);
  assert.ok(main.innerHTML.includes(ko("viewer.errorTitle")), main.innerHTML);
  assert.match(ko("viewer.errorBody"), /등록 목록에서 초대장을 확인한 뒤 다시 시도해 주세요/);
});

test("viewer preserves the missing invitation message for invalid stored HTML", async () => {
  const viewerSource = read("assets/invitation/viewer.js");
  const main = { innerHTML: "" };
  const written = [];
  const context = {
    DOMParser: invitationParser,
    InvitationCore,
    InvitationI18n,
    InvitationStorage: {
      async get() {
        return { id: "bad", html: '<script id="invitation-data" type="application/json">[]</script>' };
      }
    },
    URLSearchParams,
    document: {
      close() {},
      open() {},
      querySelector: () => main,
      write(html) { written.push(html); }
    },
    window: { location: { search: "?id=bad" } }
  };

  InvitationI18n.setLanguage("ko", { persist: false });
  const result = vm.runInNewContext(viewerSource, context, { filename: "assets/invitation/viewer.js" });
  await result;

  assert.equal(written.length, 0);
  assert.ok(main.innerHTML.includes(ko("viewer.errorBody")), main.innerHTML);
  assert.ok(main.innerHTML.includes(ko("viewer.errorTitle")), main.innerHTML);
  assert.match(ko("viewer.errorBody"), /등록 목록에서 초대장을 확인한 뒤 다시 시도해 주세요/);
});

test("gallery has one apply CTA, not a second button in the preview notice", () => {
  const index = read("studio.html");
  const app = read("assets/studio/app.js");

  assert.doesNotMatch(index, /id="pending-preview-notice"/);
  assert.doesNotMatch(index, /id="preview-apply-button"/);
  assert.doesNotMatch(index, /id="pending-preview-text"/);
  assert.doesNotMatch(app, /dom\.pendingPreview\b|dom\.previewApply\b/);
  // The apply row stays the one CTA and the summary sentence appears once.
  assert.match(index, /class="template-apply-row"[\s\S]*?id="template-summary"[\s\S]*?id="apply-template-button"/);
});

test("library empty state offers an illustration, copy and a way back to the gallery", async () => {
  const harness = loadLibraryHarness();

  await harness.api.refreshSaved();
  const markup = harness.node("#saved-list").innerHTML;

  assert.match(markup, /<svg[^>]*class="library-empty-icon"/);
  assert.match(markup, new RegExp(escapeRegExp(ko("library.emptyTitle"))));
  assert.match(markup, new RegExp(escapeRegExp(ko("library.emptyBody"))));
  assert.match(markup, new RegExp(`data-action="start-new"[^>]*>${escapeRegExp(ko("library.startNew"))}`));

  const app = read("assets/studio/app.js");
  assert.match(app, /dataset\.action === "start-new"\)\s*\{\s*setStudioStage\("gallery"\);/);
});

test("the library upload input becomes a styled, drag-and-drop dropzone that stays keyboard focusable", () => {
  const index = read("studio.html");
  const app = read("assets/studio/app.js");

  assert.match(index, /<label for="html-upload" class="upload-dropzone" data-i18n="library\.dropzone"/);
  assert.match(index, /<input id="html-upload"[^>]*class="upload-input-visually-hidden"/);
  const css = read("assets/studio/studio.css");
  assert.match(css, /\.upload-input-visually-hidden\s*\{[^}]*position:\s*absolute[^}]*clip-path:\s*inset\(50%\)/s);
  assert.match(app, /addEventListener\("drop"/);
  assert.match(app, /registerUploadedHtml\(/g);
});

test("draft status collapses to an icon and a short label on phones, and the language select stays legible", () => {
  const index = read("studio.html");
  const css = read("assets/studio/studio.css");

  assert.match(index, /<svg class="draft-status-icon"/);
  assert.match(index, /<span id="draft-status-text" data-i18n="status\.draftKept">/);
  // The short label is aria-hidden: it stands in visually for the phone
  // reader, but #draft-status-text (moved off-screen, not display:none)
  // stays the one sentence a screen reader hears.
  assert.match(index, /<span class="draft-status-short" aria-hidden="true" data-i18n="status\.draftKeptShort">/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?#draft-status\s*\{[^}]*font-size:\s*1[2-9]px/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?#language-select\s*\{[^}]*font-size:\s*1[2-9]px/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?#draft-status-text\s*\{[^}]*position:\s*absolute/);
  assert.doesNotMatch(css, /#draft-status-text\s*\{[^}]*display:\s*none/);
  // The fade lives on the non-scrolling row container's overlay, never on
  // .occasion-list itself, so it can't mask a chip's own focus ring.
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.occasion-list-row::after\s*\{[^}]*background:\s*linear-gradient/);
  assert.doesNotMatch(css, /\.occasion-list\s*\{[^}]*mask-image:/);
  for (const translate of [ko, en]) {
    for (const shortKey of ["draftKeptShort", "draftSavingShort", "draftSavedShort", "draftFailedShort", "draftRestoredShort", "draftUnavailableShort"]) {
      assert.notEqual(translate(`status.${shortKey}`), `status.${shortKey}`);
    }
  }
});

test("the occasion row scrolls a focused chip into view, clear of the fade overlay", () => {
  const app = read("assets/studio/app.js");
  assert.match(app, /dom\.occasions\.addEventListener\("focusin"[\s\S]{0,400}?scrollIntoView\(\{\s*inline:\s*"nearest",\s*block:\s*"nearest"\s*\}\)/);
});

test("clicking an occasion chip re-renders the row and scrolls the newly active chip into view", async () => {
  const harness = loadEditorHarness();

  await harness.api.loadInitialData();
  harness.api.renderTemplates();

  harness.node("#occasion-list").dispatch("click", {
    target: harness.node("#occasion-list").buttons.find((button) => button.dataset.occasionId === "wedding")
  });

  const activeChip = harness.node("#occasion-list").buttons
    .find((button) => button.dataset.occasionId === "wedding");
  assert.ok(activeChip.classList.contains("is-active"));

  const lastScroll = harness.scrollIntoViewCalls.at(-1);
  assert.equal(lastScroll.node, activeChip);
  // lastScroll.options is a plain object literal built inside the vm sandbox
  // (a separate realm), so it is compared field by field rather than with
  // deepEqual: the two realms' Object prototypes are never reference-equal
  // even when the shapes match.
  assert.equal(lastScroll.options.inline, "nearest");
  assert.equal(lastScroll.options.block, "nearest");
});

test("OCCASION_GROUP_LABEL_KEYS names exactly the catalog's groups", () => {
  const harness = loadEditorHarness();
  assert.deepEqual(
    Object.keys(harness.api.OCCASION_GROUP_LABEL_KEYS).sort(),
    [...TemplateCatalog.GROUP_IDS].sort()
  );
});

test("editor exposes mobile view tabs and selected template state", () => {
  const index = read("studio.html");
  const app = read("assets/studio/app.js");

  assert.match(index, /class="mobile-view-tabs"/);
  assert.match(index, /data-mobile-view="editor"/);
  assert.match(index, /data-mobile-view="preview"/);
  assert.match(index, /data-mobile-view="library"/);
  assert.match(app, /querySelectorAll\("\.mobile-view-tabs button\[data-mobile-view\]"\)/);
  assert.match(app, /aria-pressed/);
});

test("current picker boot path exposes eight birthday presets and keeps the original catalog", async () => {
  const harness = loadEditorHarness();
  const originalIds = [
    "botanical", "midnight-cinema", "modern", "color-pop", "royal", "memory-film",
    "black-tie", "gallery-notice", "sunny-classroom", "little-forest", "wedding",
    "modern-vow", "blue-porcelain", "peony-tribute", "red-silk", "golden-years",
    "first-chapter", "little-star"
  ];

  await harness.api.loadInitialData();

  assert.equal(harness.api.state.catalog.occasions.length, 12);
  assert.equal(harness.api.state.catalog.templates.length, 30);
  for (const occasion of harness.api.state.catalog.occasions) {
    assert.equal(
      TemplateCatalog.getPresetsForOccasion(harness.api.state.catalog, occasion.id).length,
      occasion.id === "birthday" ? 8 : 2,
      `${occasion.id} preset count`
    );
  }
  assert.deepEqual(originalIds.filter((id) => !TemplateCatalog.getPreset(harness.api.state.catalog, id)), []);

  harness.api.state.activeOccasion = "birthday";
  harness.api.renderTemplates();
  assert.deepEqual(
    harness.node("#template-list").buttons.map((button) => button.dataset.templateId),
    [
      "modern", "color-pop", "cherry-muse", "silver-afterglow", "peach-table",
      "midnight-toast", "bloom-portrait", "signature-birthday"
    ]
  );
});

test("the occasion chips are grouped under a label per group and stay one scrollable row", async () => {
  const harness = loadEditorHarness();
  const style = read("assets/studio/style.css");
  const chrome = read("assets/studio/studio.css");

  await harness.api.loadInitialData();
  harness.api.renderTemplates();
  const markup = harness.node("#occasion-list").innerHTML;

  // One labelled group per catalog group, in GROUP_IDS order, and every
  // occasion still a chip with the behaviour the click handler expects.
  for (const [group, key, members] of [
    ["celebrate", "gallery.groupCelebrate", ["birthday", "anniversary"]],
    ["milestone", "gallery.groupMilestone", ["wedding", "gohui", "hwangap", "first-birthday", "graduation"]],
    ["family", "gallery.groupFamily", ["kindergarten", "baby-shower"]],
    ["gather", "gallery.groupGather", ["date", "event", "housewarming"]]
  ]) {
    assert.ok(markup.includes(`aria-label="${ko(key)}"`), `${group} has no group label`);
    assert.notEqual(ko(key), key, `${key} missing from dictionary-ko.js`);
    assert.notEqual(en(key), key, `${key} missing from dictionary-en.js`);
    for (const occasion of members) {
      assert.match(markup, new RegExp(`data-occasion-id="${occasion}"`), `${occasion} has no chip`);
    }
  }
  assert.equal((markup.match(/class="occasion-group"/g) || []).length, 4);
  assert.deepEqual(
    harness.node("#occasion-list").buttons.map((button) => button.dataset.occasionId),
    ["birthday", "anniversary", "wedding", "gohui", "hwangap", "first-birthday",
      "graduation", "kindergarten", "baby-shower", "date", "event", "housewarming"]
  );

  // Twelve occasions no longer fit a phone, so the row has to be reachable by
  // swiping: .occasion-list scrolls, and its row is allowed to be narrower
  // than its own content (it is a grid item of .template-picker, which clips).
  assert.match(style, /\.occasion-list\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(style, /\.occasion-list-row\s*\{[^}]*min-width:\s*0/);
  // The group label is editor chrome, never an invitation palette colour.
  assert.match(chrome, /\.occasion-group-label\s*\{[^}]*color:\s*var\(--studio-ink-muted\)/);
});

test("occasion and preset browsing update pending selection without filling the draft and preserve template focus", async () => {
  const harness = loadEditorHarness({ normalizeInvitation: InvitationCore.normalizeInvitation });

  await harness.api.loadInitialData();
  harness.api.renderTemplates();
  const fillCalls = harness.api.getFillFormCalls();

  harness.node("#occasion-list").dispatch("click", {
    target: harness.node("#occasion-list").buttons.find((button) => button.dataset.occasionId === "wedding")
  });
  assert.equal(harness.api.state.activeOccasion, "wedding");
  assert.equal(harness.api.state.pendingTemplateId, "wedding");
  assert.equal(harness.api.getFillFormCalls(), fillCalls);

  const selectedTemplate = harness.node("#template-list").buttons
    .find((button) => button.dataset.templateId === "modern-vow");
  selectedTemplate.focus();
  harness.node("#template-list").dispatch("click", { target: selectedTemplate });
  assert.equal(harness.api.state.pendingTemplateId, "modern-vow");
  assert.equal(harness.api.state.activeTemplate, "royal");
  assert.equal(harness.api.getFillFormCalls(), fillCalls);
  assert.notEqual(harness.document.activeElement, selectedTemplate);
  assert.equal(harness.document.activeElement, harness.node("#template-list").buttons
    .find((button) => button.dataset.templateId === "modern-vow"));
});

test("preset cards render inert canonical heroes without changing the draft on selection", async () => {
  const thumbnailCalls = [];
  const harness = loadEditorHarness({
    normalizeInvitation: InvitationCore.normalizeInvitation,
    renderInvitationBody(invitation) {
      thumbnailCalls.push(invitation);
      return `
        <article class="invitation-card" data-template="${invitation.templateId}" data-layout-family="romantic-story">
          <header class="invite-hero"><h1>${invitation.title}</h1></header>
          <a href="https://example.com">본문 링크</a>
          <div data-map-key="unsafe-map"></div>
        </article>
      `;
    }
  });

  await harness.api.loadInitialData();
  harness.api.fillForm(harness.api.state.invitation);
  harness.node("#invitation-form").elements.title.value = "지켜야 할 현재 초안";
  harness.api.state.activeOccasion = "date";
  harness.api.state.pendingTemplateId = "botanical";
  harness.api.renderTemplates();

  assert.equal(thumbnailCalls.length, 2);
  assert.deepEqual(
    thumbnailCalls.map(({ templateId, layoutFamily, particleEffect, introEffect, mapEnabled }) => ({
      templateId,
      layoutFamily,
      particleEffect,
      introEffect,
      mapEnabled
    })),
    [
      { templateId: "botanical", layoutFamily: "romantic-story", particleEffect: "none", introEffect: "none", mapEnabled: false },
      { templateId: "midnight-cinema", layoutFamily: "romantic-story", particleEffect: "none", introEffect: "none", mapEnabled: false }
    ]
  );
  assert.match(harness.node("#template-list").innerHTML, /data-template-thumbnail[^>]*aria-hidden="true"[^>]*inert/);
  assert.match(harness.node("#template-list").innerHTML, /data-template="botanical"/);
  assert.doesNotMatch(harness.node("#template-list").innerHTML, /<a\b|data-map-key/);

  harness.node("#template-list").dispatch("click", {
    target: harness.node("#template-list").buttons.find((button) => button.dataset.templateId === "midnight-cinema")
  });

  assert.equal(harness.api.state.pendingTemplateId, "midnight-cinema");
  assert.equal(harness.api.state.activeTemplate, "royal");
  assert.equal(harness.node("#invitation-form").elements.title.value, "지켜야 할 현재 초안");
});

test("measured template thumbnails cannot feed intrinsic aspect sizing back into grid width", () => {
  const css = read("assets/studio/style.css");
  const viewportRule = css.match(/\.template-thumbnail-viewport\s*\{([^}]*)\}/)?.[1] || "";

  assert.match(viewportRule, /width:\s*100%/);
  assert.match(viewportRule, /min-width:\s*0/);
  assert.doesNotMatch(viewportRule, /aspect-ratio\s*:/);
});

test("design changes preserve edited content without destructive confirmation", async () => {
  let confirmations = 0;
  const harness = loadEditorHarness({
    confirm: () => {
      confirmations += 1;
      return false;
    },
    normalizeInvitation: InvitationCore.normalizeInvitation
  });

  await harness.api.loadInitialData();
  harness.api.fillForm(harness.api.state.invitation);
  harness.api.renderTemplates();
  harness.node("#invitation-form").elements.title.value = "수정 중인 초안";
  harness.node("#occasion-list").dispatch("click", {
    target: harness.node("#occasion-list").buttons.find((button) => button.dataset.occasionId === "wedding")
  });
  const previousMarkup = harness.contentEditor.innerHTML;
  harness.node("#apply-template-button").dispatch("click", { target: harness.node("#apply-template-button") });

  assert.equal(confirmations, 0);
  assert.equal(harness.contentEditor.innerHTML, previousMarkup);
  assert.equal(harness.node("#invitation-form").elements.title.value, "수정 중인 초안");
  assert.equal(harness.api.state.activeTemplate, "wedding");
});

test("successful template apply fills once and undo restores the previous normalized draft", async () => {
  const harness = loadEditorHarness({ normalizeInvitation: InvitationCore.normalizeInvitation });

  await harness.api.loadInitialData();
  harness.api.fillForm(harness.api.state.invitation);
  harness.api.renderTemplates();
  harness.node("#invitation-form").elements.title.value = "직접 수정한 제목";
  harness.api.renderContentEditor([course("draft-course", "기존 장소")]);
  const callsBeforeApply = harness.api.getFillFormCalls();

  harness.node("#occasion-list").dispatch("click", {
    target: harness.node("#occasion-list").buttons.find((button) => button.dataset.occasionId === "wedding")
  });
  harness.node("#template-list").dispatch("click", {
    target: harness.node("#template-list").buttons.find((button) => button.dataset.templateId === "modern-vow")
  });
  harness.node("#apply-template-button").dispatch("click", { target: harness.node("#apply-template-button") });

  assert.equal(harness.api.getFillFormCalls(), callsBeforeApply + 1);
  assert.equal(harness.api.state.activeTemplate, "modern-vow");
  assert.equal(harness.node("#invitation-form").elements.title.value, "직접 수정한 제목");
  assert.equal(harness.api.getFormData().layoutFamily, "wedding-editorial");
  assert.equal(harness.node("#undo-template-button").hidden, false);

  harness.node("#undo-template-button").dispatch("click", { target: harness.node("#undo-template-button") });

  assert.equal(harness.node("#invitation-form").elements.title.value, "직접 수정한 제목");
  assert.deepEqual(JSON.parse(JSON.stringify(harness.api.getItemsData().map((item) => [item.id, item.type, item.place]))), [["draft-course", "course", "기존 장소"]]);
  assert.equal(harness.api.state.undoSnapshot, null);
  assert.equal(harness.node("#undo-template-button").hidden, true);
  assert.equal(harness.document.activeElement.dataset.templateId, "royal");
});

/* Language switching after a design was applied ----------------------------
   The studio's rule is about authorship, not about how far the author has
   got: sample content is ours until they type over it, so it follows the
   switcher, while anything they wrote is their document and is never
   retranslated. These drive the real switcher, because handleLanguageChange
   is what has to hold that rule, and they hand Korean back so the tests
   after them still read the base data. */
const englishContent = () => JSON.parse(read("assets/i18n/content-en.json"));
const englishSample = (templateId) => englishContent().templates[templateId].defaults;
const HANGUL = /[ㄱ-ㆎ가-힣]/;

const switchLanguage = async (language) => {
  InvitationI18n.setLanguage(language, { persist: false });
  // The switch re-reads the content overlay, so let its awaits settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
};

/* Boot, in the order init() does it: the sample is filled into the form and
   the baseline is then read back off the form — never snapshotted from the
   invitation — which is the whole reason an untouched sample can still be
   recognised as ours several designs later. */
const startedEditor = async (options = {}) => {
  const harness = loadEditorHarness({ normalizeInvitation: InvitationCore.normalizeInvitation, ...options });
  await harness.api.loadInitialData();
  harness.api.fillForm(harness.api.state.invitation);
  harness.api.captureAppliedBaseline();
  harness.api.renderTemplates();
  return harness;
};

/* The same boot, ending the way init()'s restore path ends: the draft came
   back from storage, so it is the author's — personalDraft — even though not
   a word of it has been typed yet. */
const restoredDraftEditor = async () => {
  const harness = await startedEditor();
  harness.api.setPersonalDraft(true);
  return harness;
};

const applyDesign = (harness, occasionId, templateId) => {
  harness.node("#occasion-list").dispatch("click", {
    target: harness.node("#occasion-list").buttons.find((button) => button.dataset.occasionId === occasionId)
  });
  harness.node("#template-list").dispatch("click", {
    target: harness.node("#template-list").buttons.find((button) => button.dataset.templateId === templateId)
  });
  harness.node("#apply-template-button").dispatch("click", { target: harness.node("#apply-template-button") });
};

const itemById = (harness, id) => harness.api.getItemsData().find((item) => item.id === id);

/* A keystroke, delivered the way the browser delivers one: every editable
   control in the studio is inside #invitation-form, so one input event there
   is how the app learns the author has started writing. Setting .value alone
   is a test fixture, not an edit, and the app is entitled to tell them apart. */
const typeInto = (harness, field, value) => {
  const form = harness.node("#invitation-form");
  form.elements[field].value = value;
  form.dispatch("input", { target: { name: field, type: "text", matches: () => false, closest: () => null } });
};

test("an applied design's untouched sample follows a later language switch", async () => {
  const harness = await startedEditor();
  const english = englishSample("modern");

  applyDesign(harness, "birthday", "modern");
  // Nothing has been typed: the draft is still Korean sample text of ours.
  assert.match(harness.node("#invitation-form").elements.subtitle.value, HANGUL);

  try {
    await switchLanguage("en");

    const form = harness.node("#invitation-form").elements;
    assert.equal(form.title.value, english.title);
    assert.equal(form.subtitle.value, english.subtitle);
    assert.equal(form.message.value, english.message);
    assert.equal(form.host.value, english.host);
    assert.equal(itemById(harness, "profile-1").name, english.items["profile-1"].name);
    assert.equal(itemById(harness, "notice-1").heading, english.items["notice-1"].heading);
    assert.equal(itemById(harness, "course-1").place, english.items["course-1"].place);
    // The design the author chose is untouched: only the words changed.
    assert.equal(harness.api.state.activeTemplate, "modern");
  } finally {
    await switchLanguage("ko");
  }
});

test("a design applied after a language switch carries no Korean sample text", async () => {
  const harness = await startedEditor();

  applyDesign(harness, "birthday", "modern");

  try {
    await switchLanguage("en");
    applyDesign(harness, "birthday", "color-pop");

    const form = harness.node("#invitation-form").elements;
    assert.equal(harness.api.state.activeTemplate, "color-pop");
    // A second apply preserves what is on the page, which is English by now.
    assert.equal(form.title.value, englishSample("modern").title);
    for (const field of ["title", "subtitle", "message", "host", "location"]) {
      assert.doesNotMatch(form[field].value, HANGUL, `${field} kept Korean sample text`);
    }
    for (const item of harness.api.getItemsData()) {
      assert.doesNotMatch(JSON.stringify(item), HANGUL, `${item.id} kept Korean sample text`);
    }
  } finally {
    await switchLanguage("ko");
  }
});

test("a language switch never retranslates content the author edited", async () => {
  const harness = await startedEditor();

  applyDesign(harness, "birthday", "modern");
  const form = harness.node("#invitation-form").elements;
  // What the author types is what the form carries; the app reads the form
  // back and compares it with the applied baseline to know it is theirs.
  form.title.value = "민아의 서른 번째 생일";
  const untranslated = itemById(harness, "notice-1").heading;

  try {
    await switchLanguage("en");

    assert.equal(form.title.value, "민아의 서른 번째 생일");
    // Their draft stays whole — the rest of it is not retranslated either.
    assert.equal(itemById(harness, "notice-1").heading, untranslated);
    // ...while the chrome around it does follow the switch.
    assert.ok(harness.node("#template-list").innerHTML.includes(englishContent().templates.modern.name),
      harness.node("#template-list").innerHTML.slice(0, 400));
  } finally {
    await switchLanguage("ko");
  }
});

test("undo after a language switch brings the sample back in the new language", async () => {
  const harness = await startedEditor();
  // Undo's job is the design the studio opened on, whatever it is.
  const opening = harness.api.state.activeTemplate;
  const english = englishSample(opening);

  applyDesign(harness, "birthday", "modern");

  try {
    await switchLanguage("en");
    harness.node("#undo-template-button").dispatch("click", { target: harness.node("#undo-template-button") });

    const form = harness.node("#invitation-form").elements;
    assert.equal(harness.api.state.activeTemplate, opening);
    assert.equal(form.title.value, english.title);
    assert.equal(form.subtitle.value, english.subtitle);
    assert.equal(form.message.value, english.message);
    // Nothing of the pre-apply sample comes back in the old language: it was
    // our writing, and the studio is not in that language any more.
    for (const field of ["title", "subtitle", "message", "host", "location"]) {
      assert.doesNotMatch(form[field].value, HANGUL, `${field} came back in Korean`);
    }
    for (const item of harness.api.getItemsData()) {
      assert.doesNotMatch(JSON.stringify(item), HANGUL, `${item.id} came back in Korean`);
    }
    assert.equal(harness.api.state.undoSnapshot, null);
  } finally {
    await switchLanguage("ko");
  }
});

test("undo restores the author's own pre-apply draft verbatim across a language switch", async () => {
  const harness = await startedEditor();
  const form = harness.node("#invitation-form").elements;
  typeInto(harness, "title", "지민과 하준의 결혼식");
  typeInto(harness, "message", "귀한 걸음으로 축복해 주세요.");
  // The rest of the draft is theirs too, from the moment they typed a word.
  const untypedSubtitle = form.subtitle.value;

  applyDesign(harness, "birthday", "modern");

  try {
    await switchLanguage("en");
    harness.node("#undo-template-button").dispatch("click", { target: harness.node("#undo-template-button") });

    // Their document, in the words they chose, in the language they chose.
    assert.equal(form.title.value, "지민과 하준의 결혼식");
    assert.equal(form.message.value, "귀한 걸음으로 축복해 주세요.");
    assert.equal(form.subtitle.value, untypedSubtitle);
    assert.match(form.subtitle.value, HANGUL);
  } finally {
    await switchLanguage("ko");
  }
});

test("an untouched restored draft is still our sample and follows a language switch", async () => {
  const harness = await restoredDraftEditor();
  const english = englishSample(harness.api.state.activeTemplate);

  try {
    await switchLanguage("en");

    const form = harness.node("#invitation-form").elements;
    assert.equal(form.title.value, english.title);
    assert.equal(form.subtitle.value, english.subtitle);
    assert.equal(form.message.value, english.message);
  } finally {
    await switchLanguage("ko");
  }
});

test("an edited restored draft is never retranslated by a language switch", async () => {
  const harness = await restoredDraftEditor();
  const form = harness.node("#invitation-form").elements;
  // One edit is enough: from here the whole draft is theirs, and what tells
  // the app so is the form itself, read back and compared with the baseline.
  typeInto(harness, "message", "지난 한 해를 함께 걸어주신 분들께");
  const kept = form.subtitle.value;

  try {
    await switchLanguage("en");

    assert.equal(form.message.value, "지난 한 해를 함께 걸어주신 분들께");
    assert.equal(form.subtitle.value, kept);
    assert.match(form.subtitle.value, HANGUL);
  } finally {
    await switchLanguage("ko");
  }
});

/* The preview is an iframe seeded with the real standalone document, and only
   its body is patched on a render — so the language it declares in
   <html lang>, and every word of chrome baked into its head, are as old as
   the last seed. A language switch has to re-seed it or the finished card
   goes on describing itself in the language the studio opened in. */
test("a language switch re-seeds the preview frame in the new language", async () => {
  const harness = await startedEditor({
    buildStandaloneHtml: InvitationCore.buildStandaloneHtml,
    previewFrame: true
  });
  const frame = harness.node("#preview");

  await harness.api.mountPreviewFrame();
  assert.match(frame.srcdoc, /<html lang="ko">/);

  try {
    await switchLanguage("en");
    assert.match(frame.srcdoc, /<html lang="en">/);
  } finally {
    await switchLanguage("ko");
  }
  assert.match(frame.srcdoc, /<html lang="ko">/);
});

/* One place answers "what was on the page when we put our sample there?", and
   it answers by reading the form back — the invitation we just wrote into it
   is not the same document (fillForm blanks a dateLabel that is only our own
   rendering of the instant), so a snapshot of it never compares equal to a
   later getFormData() and every untouched sample would read as edited. A
   second assignment anywhere else is how that silently stops holding. */
test("the applied baseline is only ever assigned inside captureAppliedBaseline", () => {
  const source = read("assets/studio/app.js");
  const helper = source.slice(source.indexOf("const captureAppliedBaseline = () => {"));
  const body = helper.slice(0, helper.indexOf("\n};"));

  assert.ok(body.includes("state.appliedBaseline = getFormData();"), body);
  assert.equal([...source.matchAll(/state\.appliedBaseline\s*=[^=]/g)].length, 1);
});

test("template prepare errors preserve draft state and report failure status", async () => {
  const harness = loadEditorHarness({ normalizeInvitation: InvitationCore.normalizeInvitation });

  await harness.api.loadInitialData();
  harness.api.fillForm(harness.api.state.invitation);
  harness.api.renderContentEditor([course("draft-course", "기존 장소")]);
  harness.api.state.catalog = {
    occasions: harness.api.state.catalog.occasions.slice(),
    templates: [
      ...harness.api.state.catalog.templates,
      {
        id: "broken-preset",
        occasionId: harness.api.state.activeOccasion,
        name: "Broken Preset",
        note: "Malformed",
        defaults: { title: "Should not apply" }
      }
    ]
  };
  harness.api.state.pendingTemplateId = "broken-preset";
  harness.api.renderTemplates();
  harness.node("#invitation-form").elements.title.value = "보존할 초안";
  const previousMarkup = harness.contentEditor.innerHTML;
  const previousState = JSON.stringify(harness.api.state);

  harness.node("#apply-template-button").dispatch("click", { target: harness.node("#apply-template-button") });

  assert.equal(harness.node("#invitation-form").elements.title.value, "보존할 초안");
  assert.equal(harness.contentEditor.innerHTML, previousMarkup);
  assert.equal(JSON.stringify(harness.api.state), previousState);
  assert.match(harness.node("#save-status").textContent, /템플릿을 적용하지 못했습니다/);
});

test("mobile view switching restores the previous scroll position for each workspace", () => {
  const harness = loadEditorHarness({ mobile: true });

  harness.document.body.dataset.mobileView = "editor";
  harness.window.scrollY = 1280;
  harness.api.setMobileView("preview");
  assert.equal(harness.scrollCalls.at(-1).top, 0);
  assert.equal(harness.scrollCalls.at(-1).behavior, "auto");

  harness.window.scrollY = 360;
  harness.api.setMobileView("editor");
  assert.equal(harness.scrollCalls.at(-1).top, 1280);
  assert.equal(harness.scrollCalls.at(-1).behavior, "auto");
  harness.window.scrollY = 0;
  harness.runAnimationFrames();
  assert.equal(harness.scrollCalls.at(-1).top, 1280);
  assert.equal(harness.window.scrollY, 1280);
});

test("mobile tab pointer capture preserves scroll before browser focus moves the page", () => {
  const harness = loadEditorHarness({ mobile: true });

  harness.document.body.dataset.mobileView = "editor";
  harness.window.scrollY = 640;
  harness.api.getMobileTabs()[1].dispatch("pointerdown");
  harness.window.scrollY = 0;
  harness.api.setMobileView("preview");
  harness.api.getMobileTabs()[0].dispatch("pointerdown");
  harness.window.scrollY = 0;
  harness.api.setMobileView("editor");
  harness.runAnimationFrames();

  assert.equal(harness.scrollCalls.at(-1).top, 640);
  assert.equal(harness.window.scrollY, 640);
});

test("editor groups related controls and keeps mobile export actions reachable", () => {
  const index = read("studio.html");
  const css = read("assets/studio/style.css");

  for (const group of ["style", "details", "location", "content"]) {
    assert.match(index, new RegExp(`data-editor-group="${group}"`));
  }
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?body\[data-mobile-view="editor"\] \.action-row\s*\{[^}]*position:\s*fixed[^}]*bottom:/s);
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*?body\[data-mobile-view="editor"\]\s*\{[^}]*padding-bottom:\s*calc\(136px/s);
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*?body\[data-mobile-view="editor"\] \.save-status:not\(:empty\)\s*\{[^}]*bottom:\s*calc\(132px/s);
  assert.match(css, /\.mobile-view-tabs button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.replay-intro-button\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
});

test("map controls use place geocoding without exposing coordinates or zoom", () => {
  const index = read("studio.html");
  const app = read("assets/studio/app.js");

  assert.doesNotMatch(index, /<span>위도<\/span>|<span>경도<\/span>|<span>지도 줌<\/span>/);
  assert.doesNotMatch(app, /<span>위도<\/span>|<span>경도<\/span>|<span>지도 줌<\/span>/);
  assert.match(index, /name="mapLatitude" type="hidden"/);
  assert.match(index, /name="mapLongitude" type="hidden"/);
  assert.match(app, /data-course-field="mapLatitude" type="hidden"/);
  assert.match(app, /data-course-field="mapLongitude" type="hidden"/);
  assert.match(app, /submodules=geocoder/);
  assert.match(index, /src="assets\/integrations\/map-location\.js"/);
  // The geocoding-misconfigured branch must still point the reader at the
  // NAVER Geocoding setting rather than at their own address — in every
  // language, which the single Korean literal could not check.
  assert.match(app, /error\.code === "SERVICE_UNAVAILABLE"[\s\S]*?t\("map\.serviceUnavailable"\)/);
  for (const translate of [ko, en]) {
    assert.match(translate("map.serviceUnavailable"), /NAVER Geocoding/);
    assert.notEqual(translate("map.serviceUnavailable"), translate("map.notFound"));
  }
});

test("mobile preview frame remains viewport-bounded and scrollable", () => {
  const css = read("assets/studio/style.css");

  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.preview-frame\s*\{\s*height: calc\(100dvh - 158px\);\s*max-height: calc\(100dvh - 158px\);\s*overflow: auto;/);
  assert.doesNotMatch(css, /@media \(max-width: 900px\)[\s\S]*?\.preview-frame\s*\{\s*max-height: none;\s*overflow: visible;/);
});

test("saved invitation cards render friendly dates and source labels", async () => {
  const createdAt = "2026-09-05T03:52:31.704Z";
  const harness = loadLibraryHarness({ records: [{
    id: "friendly-date",
    title: "Evening invite",
    createdAt,
    source: "upload",
    html: validInvitationHtml("Evening invite")
  }] });

  await harness.api.refreshSaved();
  const markup = harness.node("#saved-list").innerHTML;
  assert.match(markup, /<time datetime="2026-09-05T03:52:31\.704Z">/);
  assert.match(markup, /HTML 등록/);
  assert.doesNotMatch(markup, />2026-09-05T03:52:31\.704Z</);
});

test("editor template palettes define the intro text colors used by standalone output", () => {
  const css = read("assets/studio/style.css");
  const expected = {
    wedding: ["#33241a", "#705d4c"],
    "black-tie": ["#17191f", "#5f6876"],
    botanical: ["#102018", "#52695b"],
    modern: ["#1f1b1a", "#6d625b"]
  };

  for (const [template, [ink, soft]] of Object.entries(expected)) {
    const rule = css.match(new RegExp(`body\\[data-template="${template}"\\]\\s*\\{([\\s\\S]*?)\\}`))?.[1] || "";
    assert.match(rule, new RegExp(`--ink:\\s*${ink}`));
    assert.match(rule, new RegExp(`--ink-soft:\\s*${soft}`));
  }
});

test("course map settings span the full card width", () => {
  const css = read("assets/studio/style.css");

  assert.match(css, /\.editor-form\s*>\s*\.full\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(css, /\.course-editor-grid\s*>\s*\.full,\s*[\s\S]*?\.link-editor-grid\s*>\s*\.full\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(css, /\.stop-map-settings\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
});

test("editor exposes one ordered content shell and constrained photo picker", () => {
  const index = read("studio.html");
  const photoInput = index.match(/<input[^>]+id="photo-input"[^>]*>/)?.[0] || "";
  const scriptOrder = [
    "assets/invitation/core.js",
    "assets/media/image-tools.js",
    "assets/studio/content-order.js",
    "assets/studio/app.js"
  ].map((source) => index.indexOf(`<script src="${source}"></script>`));

  assert.equal((index.match(/id="content-editor"/g) || []).length, 1);
  assert.doesNotMatch(index, /id="stops-editor"|id="add-stop-button"/);
  assert.match(index, /id="add-course-button"/);
  assert.match(index, /id="add-photo-button"/);
  assert.match(photoInput, /type="file"/);
  assert.match(photoInput, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(photoInput, /\smultiple(?:\s|>)/);
  assert.match(photoInput, /\shidden(?:\s|>)/);
  assert.ok(scriptOrder.every((position) => position >= 0));
  assert.deepEqual(scriptOrder, [...scriptOrder].sort((a, b) => a - b));
});

test("editor exposes a separate single-file hero background tool before invitation core", () => {
  const index = read("studio.html");
  const heroInput = index.match(/<input[^>]+id="hero-image-input"[^>]*>/)?.[0] || "";
  const bodyPhotoInput = index.match(/<input[^>]+id="photo-input"[^>]*>/)?.[0] || "";
  const heroModuleIndex = index.indexOf('src="assets/media/hero-image.js"');
  const coreIndex = index.indexOf('src="assets/invitation/core.js"');

  assert.match(index, /data-editor-group="hero-image"/);
  assert.match(index, /id="hero-image-frame"/);
  assert.match(index, /id="hero-image-scale"[^>]+min="100"[^>]+max="250"[^>]+step="5"/);
  assert.match(index, /id="hero-image-reset-button"/);
  assert.match(index, /id="hero-image-remove-button"/);
  assert.match(heroInput, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.doesNotMatch(heroInput, /\smultiple(?:\s|>)/);
  assert.match(bodyPhotoInput, /\smultiple(?:\s|>)/);
  assert.ok(heroModuleIndex >= 0 && heroModuleIndex < coreIndex);

  const viewer = read("viewer.html");
  const viewerHeroModuleIndex = viewer.indexOf('src="assets/media/hero-image.js"');
  const viewerCoreIndex = viewer.indexOf('src="assets/invitation/core.js"');
  assert.ok(viewerHeroModuleIndex >= 0 && viewerHeroModuleIndex < viewerCoreIndex);
});

test("hero background upload stays outside ordered photo items and supports scale and drag", async () => {
  const harness = loadEditorHarness({
    normalizeInvitation: InvitationCore.normalizeInvitation,
    async compress() {
      return { src: "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/vuUAAA=" };
    }
  });
  const { api, node } = harness;
  await api.loadInitialData();
  api.fillForm(api.state.invitation);
  api.renderContentEditor([photo("body-photo")], "body-photo");
  node("#hero-image-input").files = [{ name: "cover.png" }];

  await api.handleHeroImageSelection();

  assert.equal(api.getItemsData().length, 1);
  assert.equal(api.getItemsData()[0].id, "body-photo");
  assert.equal(api.state.heroImage.scale, 100);
  assert.equal(node("#hero-image-select-button").textContent, "사진 변경");
  assert.equal(node("#hero-image-adjustments").hidden, false);

  api.updateHeroImageScale(150);
  api.beginHeroImageDrag({ pointerId: 7, button: 0, clientX: 100, clientY: 100, preventDefault() {} });
  api.moveHeroImageDrag({ pointerId: 7, clientX: 140, clientY: 70, preventDefault() {} });
  api.finishHeroImageDrag({ pointerId: 7 });

  assert.deepEqual(JSON.parse(JSON.stringify(api.state.heroImage)), {
    src: "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/vuUAAA=",
    scale: 150,
    positionX: 36.67,
    positionY: 56.67
  });
  assert.equal(api.getHeroImageDragState(), null);
  assert.match(node("#hero-image-preview").attrs.style, /--hero-image-scale:1\.5/);

  let prevented = false;
  api.moveHeroImageByKeyboard({ key: "ArrowLeft", preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.ok(api.state.heroImage.positionX > 36.67);
});

test("hero upload failure preserves the previous image and reset and remove are explicit", async () => {
  const harness = loadEditorHarness({
    normalizeInvitation: InvitationCore.normalizeInvitation,
    async compress() {
      throw new Error("decode failed");
    }
  });
  const { api, node } = harness;
  const previous = {
    src: "data:image/png;base64,iVBORw0KGgo=",
    scale: 200,
    positionX: 20,
    positionY: 80
  };
  api.state.heroImage = previous;
  api.syncHeroImageEditor();
  node("#hero-image-input").files = [{ name: "broken.png" }];

  await api.handleHeroImageSelection();

  assert.deepEqual(JSON.parse(JSON.stringify(api.state.heroImage)), previous);
  assert.match(node("#hero-image-status").textContent, /이미지를 처리할 수 없습니다/);
  api.resetHeroImage();
  assert.deepEqual(JSON.parse(JSON.stringify(api.state.heroImage)), {
    src: previous.src,
    scale: 100,
    positionX: 50,
    positionY: 50
  });
  api.removeHeroImage();
  assert.equal(api.state.heroImage, null);
  assert.equal(node("#hero-image-adjustments").hidden, true);
  assert.equal(node("#hero-image-select-button").textContent, "배경 사진 추가");
});

test("template changes stay locked until a pending hero upload settles", async () => {
  const compression = deferred();
  const harness = loadEditorHarness({
    normalizeInvitation: InvitationCore.normalizeInvitation,
    compress: () => compression.promise
  });
  const { api, node } = harness;
  await api.loadInitialData();
  api.fillForm(api.state.invitation);
  api.renderTemplates();
  node("#template-list").dispatch("click", {
    target: node("#template-list").buttons.find((button) => button.dataset.templateId !== api.state.activeTemplate)
  });
  const pendingTemplateId = api.state.pendingTemplateId;
  node("#hero-image-input").files = [{ name: "cover.png" }];

  const upload = api.handleHeroImageSelection();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(node("#apply-template-button").disabled, true);
  assert.ok(node("#template-list").buttons.every((button) => button.disabled));
  node("#apply-template-button").dispatch("click", { target: node("#apply-template-button") });
  assert.notEqual(api.state.activeTemplate, pendingTemplateId);

  compression.resolve({ src: "data:image/png;base64,iVBORw0KGgo=" });
  await upload;
  assert.equal(node("#apply-template-button").disabled, false);
  node("#apply-template-button").dispatch("click", { target: node("#apply-template-button") });
  assert.equal(api.state.activeTemplate, pendingTemplateId);
  assert.equal(api.state.heroImage.src, "data:image/png;base64,iVBORw0KGgo=");
});

test("template undo restores the custom hero image and crop", async () => {
  const harness = loadEditorHarness({ normalizeInvitation: InvitationCore.normalizeInvitation });
  const heroImage = {
    src: "data:image/png;base64,iVBORw0KGgo=",
    scale: 185,
    positionX: 18,
    positionY: 73
  };

  await harness.api.loadInitialData();
  harness.api.fillForm({ ...harness.api.state.invitation, heroImage });
  harness.api.renderTemplates();
  harness.node("#template-list").dispatch("click", {
    target: harness.node("#template-list").buttons.find((button) => button.dataset.templateId !== harness.api.state.activeTemplate)
  });
  harness.node("#apply-template-button").dispatch("click", { target: harness.node("#apply-template-button") });
  assert.deepEqual(JSON.parse(JSON.stringify(harness.api.state.heroImage)), heroImage);

  harness.node("#undo-template-button").dispatch("click", { target: harness.node("#undo-template-button") });
  assert.deepEqual(JSON.parse(JSON.stringify(harness.api.state.heroImage)), heroImage);
});

test("editor and viewer load intro effects before invitation core", () => {
  for (const page of ["studio.html", "viewer.html"]) {
    const html = read(page);
    const introIndex = html.indexOf('src="assets/invitation/intro-effects.js"');
    const coreIndex = html.indexOf('src="assets/invitation/core.js"');

    assert.notEqual(introIndex, -1, `${page} must load intro effects`);
    assert.notEqual(coreIndex, -1, `${page} must load invitation core`);
    assert.ok(introIndex < coreIndex, `${page} must load intro effects before invitation core`);
  }
});

test("maker and viewer load TemplateCatalog and TemplateRenderers before InvitationCore for browser family rendering", () => {
  for (const page of ["studio.html", "viewer.html"]) {
    const html = read(page);
    const catalogIndex = html.indexOf('src="assets/invitation/template-catalog.js"');
    // Pages carry the art index (file names). The inlined artwork is ~900KB
    // and is fetched only when a portable file is about to be written.
    const artIndex = html.indexOf('src="assets/invitation/template-art-index.js"');
    assert.equal(html.includes('src="assets/invitation/template-art.js"'), false, `${page} must not eagerly load inlined artwork`);
    const renderersIndex = html.indexOf('src="assets/invitation/template-renderers.js"');
    const coreIndex = html.indexOf('src="assets/invitation/core.js"');

    assert.ok(catalogIndex >= 0, `${page} loads TemplateCatalog`);
    assert.ok(artIndex >= 0, `${page} loads TemplateArt`);
    assert.ok(renderersIndex >= 0, `${page} loads TemplateRenderers`);
    assert.ok(catalogIndex < coreIndex, `${page} loads TemplateCatalog before InvitationCore`);
    assert.ok(catalogIndex < artIndex, `${page} loads TemplateCatalog before TemplateArt`);
    assert.ok(artIndex < renderersIndex, `${page} loads TemplateArt before TemplateRenderers`);
    assert.ok(catalogIndex < renderersIndex, `${page} loads TemplateCatalog before TemplateRenderers`);
    assert.ok(renderersIndex < coreIndex, `${page} loads TemplateRenderers before InvitationCore`);
  }

  const browser = { URL };
  browser.globalThis = browser;
  vm.runInNewContext(read("assets/invitation/template-catalog.js"), browser, { filename: "assets/invitation/template-catalog.js" });
  vm.runInNewContext(read("assets/invitation/template-art.js"), browser, { filename: "assets/invitation/template-art.js" });
  vm.runInNewContext(read("assets/invitation/template-renderers.js"), browser, { filename: "assets/invitation/template-renderers.js" });
  vm.runInNewContext(read("assets/invitation/core.js"), browser, { filename: "assets/invitation/core.js" });

  assert.equal(browser.InvitationCore.normalizeInvitation({ templateId: "wedding" }).layoutFamily, "wedding-editorial");
  assert.match(browser.TemplateArt.getDataUrl("botanical"), /^data:image\/webp;base64,/);
  vm.runInNewContext(read("assets/invitation/template-art-index.js"), browser, { filename: "assets/invitation/template-art-index.js" });
  assert.equal(browser.TemplateArtIndex.getUrl("botanical"), "/assets/invitation/template-art/romantic-story-cover.webp");
  assert.match(browser.InvitationCore.renderInvitationBody({ layoutFamily: "wedding-editorial" }), /data-layout-family="wedding-editorial"/);
});

test("mixed editor cards preserve identity and expose type-specific fields", () => {
  const app = read("assets/studio/app.js");

  assert.match(app, /const getItemsData = \(\) => \[\.\.\.dom\.contentEditor\.querySelectorAll\("\[data-item-card\]"\)\]/);
  assert.match(app, /const id = card\.dataset\.itemId/);
  assert.match(app, /const type = card\.dataset\.itemType/);
  assert.match(app, /switch \(type\)[\s\S]*?case "photo"[\s\S]*?data-photo-thumbnail[\s\S]*?data-photo-field="alt"[\s\S]*?data-photo-field="caption"/);
  assert.match(app, /case "notice"[\s\S]*?data-notice-field="\$\{field\}"[\s\S]*?heading: value\("heading"\)[\s\S]*?body: value\("body"\)/);
  assert.match(app, /case "profile"[\s\S]*?data-profile-field="\$\{field\}"[\s\S]*?name: value\("name"\)[\s\S]*?role: value\("role"\)[\s\S]*?description: value\("description"\)/);
  assert.match(app, /case "link"[\s\S]*?data-link-field="\$\{field\}"[\s\S]*?label: value\("label"\)[\s\S]*?value: value\("value"\)[\s\S]*?url: value\("url"\)/);
  assert.match(app, /data-item-id="\$\{escapeAttribute\(item\.id\)\}"/);
  assert.match(app, /data-item-type="\$\{item\.type\}"/);
  assert.match(app, /data-course-field="time" type="time" step="600"/);
  assert.match(app, /data-notice-field="heading"/);
  assert.match(app, /data-profile-field="name"/);
  assert.match(app, /data-link-field="url" type="url"/);
  assert.doesNotMatch(app, /data-drag-handle/);
  assert.match(app, /class="content-item-position" aria-hidden="true"/);
  // Every action carries a type-qualified accessible name; the three that now
  // live in the menu also carry visible copy, so they no longer need a title.
  for (const action of ["up", "down", "delete"]) {
    assert.match(app, new RegExp(`data-item-action="${action}"[^>]+aria-label="[^"]+"`));
  }
  assert.match(app, /items:\s*getItemsData\(\)/);
  assert.doesNotMatch(app, /stops:\s*getStopsData\(\)/);
  assert.match(app, /const removeItemAt = \(index\) => \{[\s\S]*?items\.splice\(index, 1\)/);
});

/* B-6. Three icon buttons could not share a 390px header row with the type and
   the summary, so they wrapped and doubled the card height; and the delete
   step was a browser `confirm()`, the one dialog in the studio that cannot be
   styled, translated, or dismissed the way every other one is. */
test("item card actions collapse into one overflow menu", () => {
  const app = read("assets/studio/app.js");

  assert.match(app, /data-item-menu-button[^>]+aria-haspopup="true"[^>]+aria-expanded="false"[^>]+aria-controls="\$\{menuId\}"/);
  assert.match(app, /<div class="content-item-menu-list" id="\$\{menuId\}" role="menu"[^>]*data-item-menu-list hidden>/);
  assert.equal((app.match(/role="menuitem"/g) || []).length, 3);
  for (const action of ["up", "down", "delete"]) {
    assert.match(app, new RegExp(`role="menuitem" data-item-action="${action}"`));
  }
  // The header is a fixed three-column grid, so nothing in it can wrap.
  assert.match(app, /content-item-handle[\s\S]*?content-item-grip[\s\S]*?content-item-position/);
  assert.match(app, /renderItemMenu\(item, index, items\.length, menuId\)/);
});

test("deleting an item confirms inside the card instead of through window.confirm", () => {
  const app = read("assets/studio/app.js");
  const removal = app.match(/if \(action === "delete"\)[\s\S]*?\n  \}/)?.[0] || "";

  assert.doesNotMatch(app, /window\.confirm\(t\("content\.confirm(?:Remove|Delete)"/);
  assert.doesNotMatch(removal, /window\.confirm/);
  assert.match(app, /data-item-confirm role="group"[^>]*hidden>/);
  assert.match(app, /data-item-action="cancel-delete"/);
  assert.match(app, /data-item-action="confirm-delete"/);
  assert.match(app, /t\("content\.confirmDelete", \{ name: /);
  assert.match(app, /escapeAttribute\(t\("content\.cancel"\)\)/);
  // Focus lands on the safe half of the pair, which is also what Escape does.
  assert.match(app, /card\.querySelector\('\[data-item-action="cancel-delete"\]'\)\?\.focus\(\)/);
  assert.match(app, /event\.key === "Escape"[\s\S]*?closeItemConfirm\(card, \{ focusMenu: true \}\)/);

  for (const translate of [ko, en]) {
    assert.match(translate("content.confirmDelete", { name: "A" }), /A/);
    assert.ok(translate("content.cancel").length > 0);
    assert.ok(translate("content.menu").length > 0);
    assert.match(translate("content.menuLabel", { type: "Course" }), /Course/);
  }
});

test("the overflow menu opens, closes, and survives a reorder from inside itself", () => {
  const { api, contentEditor, document } = loadEditorHarness();
  api.renderContentEditor([course("course-a"), course("course-b")], "course-a");

  const [first, second] = contentEditor.cards;
  contentEditor.dispatch("click", { target: second.querySelector("[data-item-menu-button]") });
  assert.equal(second.querySelector("[data-item-menu-button]").getAttribute("aria-expanded"), "true");
  assert.equal(second.querySelector("[data-item-menu-list]").hidden, false);

  // Only ever one menu open: opening the other card's closes the first.
  contentEditor.dispatch("click", { target: first.querySelector("[data-item-menu-button]") });
  assert.equal(second.querySelector("[data-item-menu-button]").getAttribute("aria-expanded"), "false");

  contentEditor.dispatch("click", { target: contentEditor.cards[1].querySelector("[data-item-menu-button]") });
  contentEditor.dispatch("click", { target: contentEditor.cards[1].querySelector('[data-item-action="up"]') });

  assert.deepEqual(Array.from(api.getItemsData(), (item) => item.id), ["course-b", "course-a"]);
  const moved = contentEditor.cards[0];
  assert.equal(moved.dataset.itemId, "course-b");
  assert.equal(moved.querySelector("[data-item-menu-list]").hidden, false);
  assert.equal(document.activeElement, moved.querySelector('[data-item-action="up"]'));
});

test("escape closes the menu and cancels a pending delete without losing the item", () => {
  const { api, contentEditor, document } = loadEditorHarness();
  api.renderContentEditor([course("course-a"), course("course-b")], "course-a");

  const card = contentEditor.cards[0];
  const menuButton = card.querySelector("[data-item-menu-button]");
  contentEditor.dispatch("click", { target: menuButton });
  contentEditor.dispatch("keydown", { key: "Escape", target: menuButton });
  assert.equal(card.querySelector("[data-item-menu-list]").hidden, true);
  assert.equal(document.activeElement, menuButton);

  contentEditor.dispatch("click", { target: menuButton });
  contentEditor.dispatch("click", { target: card.querySelector('[data-item-action="delete"]') });
  assert.equal(card.querySelector("[data-item-menu-list]").hidden, true);
  assert.equal(card.querySelector("[data-item-confirm]").hidden, false);
  assert.match(card.querySelector("[data-item-confirm-text]").textContent, /course-a/);
  assert.equal(document.activeElement, card.querySelector('[data-item-action="cancel-delete"]'));

  contentEditor.dispatch("keydown", { key: "Escape", target: document.activeElement });
  assert.equal(card.querySelector("[data-item-confirm]").hidden, true);
  assert.equal(document.activeElement, menuButton);
  assert.deepEqual(Array.from(api.getItemsData(), (item) => item.id), ["course-a", "course-b"]);
});

test("alt plus an arrow key reorders the card the focus is in", () => {
  const { api, contentEditor } = loadEditorHarness();
  api.renderContentEditor([course("course-a"), course("course-b")], "course-a");

  const toggle = contentEditor.cards[0].querySelector("[data-toggle-item]");
  toggle.focus();
  contentEditor.dispatch("keydown", { key: "ArrowDown", altKey: true, target: toggle, preventDefault() {} });
  assert.deepEqual(Array.from(api.getItemsData(), (item) => item.id), ["course-b", "course-a"]);

  // The boundary is a no-op rather than a wrap-around.
  const top = contentEditor.cards[0].querySelector("[data-toggle-item]");
  contentEditor.dispatch("keydown", { key: "ArrowUp", altKey: true, target: top, preventDefault() {} });
  assert.deepEqual(Array.from(api.getItemsData(), (item) => item.id), ["course-b", "course-a"]);

  // Without the modifier the arrow keys stay the browser's.
  contentEditor.dispatch("keydown", { key: "ArrowDown", target: top, preventDefault() {} });
  assert.deepEqual(Array.from(api.getItemsData(), (item) => item.id), ["course-b", "course-a"]);
});

test("alt plus an arrow key does not reorder a card with a pending delete confirmation", () => {
  const { api, contentEditor } = loadEditorHarness();
  api.renderContentEditor([course("course-a"), course("course-b")], "course-a");

  const card = contentEditor.cards[0];
  contentEditor.dispatch("click", { target: card.querySelector("[data-item-menu-button]") });
  contentEditor.dispatch("click", { target: card.querySelector('[data-item-action="delete"]') });
  assert.equal(card.querySelector("[data-item-confirm]").hidden, false);

  const toggle = card.querySelector("[data-toggle-item]");
  contentEditor.dispatch("keydown", { key: "ArrowDown", altKey: true, target: toggle, preventDefault() {} });

  // The reorder is a no-op while the confirmation is open, so the item order
  // holds and the confirmation is still there to be answered.
  assert.deepEqual(Array.from(api.getItemsData(), (item) => item.id), ["course-a", "course-b"]);
  assert.equal(card.querySelector("[data-item-confirm]").hidden, false);
});

test("course labels use presets and reveal text entry only for a custom label", () => {
  const app = read("assets/studio/app.js");

  assert.match(app, /data-course-label-preset/);
  for (const label of ["MEET", "CAFE", "WALK", "DINNER"]) {
    assert.match(app, new RegExp(`COURSE_LABEL_PRESETS[^;]+"${label}"`));
  }
  // The custom option is still the last one and still carries a real label —
  // now resolved from the dictionary, and asserted to be distinct from every
  // preset so "custom" can never be mistaken for one of them.
  assert.match(app, /<option value="custom"[^>]*>\$\{escapeAttribute\(t\("content\.courseLabelCustom"\)\)\}<\/option>/);
  for (const translate of [ko, en]) {
    const custom = translate("content.courseLabelCustom");
    assert.ok(custom.length > 0);
    assert.equal(["MEET", "CAFE", "WALK", "DINNER", "DRINK", "ACTIVITY"].includes(custom), false);
  }
  assert.match(app, /data-custom-label-field/);
  assert.match(app, /data-course-field="label" type="text"/);
  assert.match(app, /syncCourseLabelPreset\(event\.target\)/);
});

test("editor card headings omit redundant number badges", () => {
  const app = read("assets/studio/app.js");
  const css = read("assets/studio/style.css");

  assert.doesNotMatch(app, /content-item-number/);
  assert.doesNotMatch(css, /content-item-number/);
  assert.match(css, /\.content-item-toggle\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
});

test("course map pending key follows the normalized rendered course index", () => {
  const harness = loadEditorHarness({ normalizeInvitation: InvitationCore.normalizeInvitation });
  const { api, contentEditor, node } = harness;
  const emptyCourseItem = {
    ...course("course-empty", ""),
    time: "",
    label: "",
    place: ""
  };
  const mappedCourse = {
    ...course("course-map", "PENDING MAP"),
    mapEnabled: true,
    mapLatitude: "37.5446",
    mapLongitude: "127.0559"
  };
  api.renderContentEditor([emptyCourseItem, photo("photo-between"), mappedCourse], "course-map");
  const checkbox = contentEditor.cards[2].querySelector('[data-course-field="mapEnabled"]');

  node("#invitation-form").dispatch("input", { target: checkbox });

  const renderedHtml = InvitationCore.renderInvitationBody({ items: api.getItemsData() });
  const renderedMapKey = renderedHtml.match(/data-map-key="([^"]+)"/)?.[1] || null;
  assert.equal(api.getPendingPreviewMapKey(), "stop-0");
  assert.equal(api.getPendingPreviewMapKey(), renderedMapKey);
});

test("dropped empty course map toggle leaves no pending preview key", () => {
  const harness = loadEditorHarness({ normalizeInvitation: InvitationCore.normalizeInvitation });
  const { api, contentEditor, node } = harness;
  const droppedCourse = {
    ...course("course-dropped", ""),
    time: "",
    label: "",
    place: "",
    mapEnabled: true
  };
  api.renderContentEditor([droppedCourse], "course-dropped");
  const checkbox = contentEditor.cards[0].querySelector('[data-course-field="mapEnabled"]');

  node("#invitation-form").dispatch("input", { target: checkbox });

  const renderedHtml = InvitationCore.renderInvitationBody({ items: api.getItemsData() });
  assert.equal(api.getPendingPreviewMapKey(), null);
  assert.doesNotMatch(renderedHtml, /data-map-key=/);
});

test("photo selection processes files sequentially and retains partial success", () => {
  const app = read("assets/studio/app.js");
  const handler = app.match(/const handlePhotoSelection = async \(\) => \{[\s\S]*?\n\};/)?.[0] || "";
  const merge = app.match(/const mergeCompressedPhotos = \(currentItems, compressedPhotos\) => \{[\s\S]*?\n\};/)?.[0] || "";

  assert.match(handler, /for \(const \[index, file\] of files\.entries\(\)\) \{/);
  assert.match(handler, /await ImageTools\.compress\(file\)/);
  assert.match(handler, /compressedPhotos\.push\(/);
  assert.match(handler, /const currentItems = getItemsData\(\);[\s\S]*?mergeCompressedPhotos\(currentItems, compressedPhotos\)/);
  assert.match(merge, /InvitationCore\.MAX_PHOTOS/);
  assert.match(merge, /InvitationCore\.MAX_ITEMS/);
  assert.match(handler, /try \{[\s\S]*?compressedPhotos\.push\([\s\S]*?\}\s*catch/s);
  assert.match(handler, /file\.name/);
  assert.match(handler, /dom\.photoInput\.value = ""/);
  assert.match(handler, /data-photo-field="caption"/);
  assert.match(handler, /if \(result\.committed\.length\)[\s\S]*?renderContentEditor/);
  assert.doesNotMatch(handler, /Promise\.all/);
  assert.doesNotMatch(handler, /URL\.createObjectURL/);
});

test("photo selection uses successful compressions to fill the remaining capacity", async () => {
  const attempts = [];
  const harness = loadEditorHarness({
    maxItems: 2,
    async compress(file) {
      attempts.push(file.name);
      if (file.name === "broken.png") throw new Error("decode failed");
      return { src: "data:image/webp;base64,U1VDQ0VTUw==" };
    }
  });
  const { api, node } = harness;
  api.renderContentEditor([course("course-a", "A")], "course-a");
  node("#photo-input").files = [{ name: "broken.png" }, { name: "working.png" }];

  await api.handlePhotoSelection();

  assert.deepEqual(attempts, ["broken.png", "working.png"]);
  assert.deepEqual(Array.from(api.getItemsData(), (item) => item.type), ["course", "photo"]);
  assert.equal(api.getItemsData()[1].src, "data:image/webp;base64,U1VDQ0VTUw==");
  assert.match(node("#save-status").textContent, /broken\.png: 이미지를 처리할 수 없습니다/);
  assert.match(node("#save-status").textContent, /working\.png: 사진을 추가했습니다/);
});

test("photo processing locks export actions and includes the photo after completion", async () => {
  const compression = deferred();
  let writes = 0;
  const harness = loadEditorHarness({
    compress: () => compression.promise,
    async put() { writes += 1; }
  });
  const { api, node } = harness;
  api.renderContentEditor([course("course-a", "A")], "course-a");
  node("#photo-input").files = [{ name: "pending.png" }];

  const selection = api.handlePhotoSelection();

  assert.equal(node("#add-photo-button").disabled, true);
  assert.equal(node("#download-button").disabled, true);
  assert.equal(node("#save-button").disabled, true);
  await api.saveCurrent();
  assert.equal(writes, 0);
  assert.equal(node("#save-button").disabled, true);

  compression.resolve({ src: "data:image/webp;base64,RklOQUw=" });
  await selection;

  assert.equal(node("#add-photo-button").disabled, false);
  assert.equal(node("#download-button").disabled, false);
  assert.equal(node("#save-button").disabled, false);
  assert.equal(api.getItemsData().at(-1).src, "data:image/webp;base64,RklOQUw=");
});

test("photo processing restores export actions after compression failure", async () => {
  const compression = deferred();
  const harness = loadEditorHarness({ compress: () => compression.promise });
  const { api, node } = harness;
  api.renderContentEditor([course("course-a", "A")], "course-a");
  node("#photo-input").files = [{ name: "broken.png" }];

  const selection = api.handlePhotoSelection();
  assert.equal(node("#download-button").disabled, true);
  assert.equal(node("#save-button").disabled, true);

  compression.reject(new Error("decode failed"));
  await selection;

  assert.equal(node("#add-photo-button").disabled, false);
  assert.equal(node("#download-button").disabled, false);
  assert.equal(node("#save-button").disabled, false);
  assert.deepEqual(Array.from(api.getItemsData(), (item) => item.type), ["course"]);
});

test("an active save prevents photo processing until the write settles", async () => {
  const write = deferred();
  let compressions = 0;
  const harness = loadEditorHarness({
    async compress() { compressions += 1; return { src: "data:image/webp;base64,TEFURQ==" }; },
    put: () => write.promise
  });
  const { api, node } = harness;
  api.renderContentEditor([course("course-a", "A")], "course-a");

  const saving = api.saveCurrent();
  assert.equal(node("#save-button").disabled, true);
  assert.equal(node("#add-photo-button").disabled, true);

  node("#photo-input").files = [{ name: "blocked.png" }];
  await api.handlePhotoSelection();
  assert.equal(compressions, 0);
  assert.equal(node("#photo-input").value, "");

  write.resolve();
  await saving;
  assert.equal(node("#save-button").disabled, false);
  assert.equal(node("#add-photo-button").disabled, false);
});

test("photo upload commits against fresh edited and reordered items", async () => {
  const pending = [];
  const harness = loadEditorHarness({
    maxItems: 4,
    compress(file) {
      const result = deferred();
      pending.push({ file, ...result });
      return result.promise;
    }
  });
  const { api, contentEditor, document, node } = harness;
  api.renderContentEditor([course("course-a", "A"), course("course-b", "B")], "course-a");
  node("#photo-input").files = [{ name: "one.png" }, { name: "two.png" }, { name: "three.png" }];

  const upload = api.handlePhotoSelection();
  assert.equal(pending.length, 1);

  api.renderContentEditor([
    course("course-b", "B"),
    course("course-a", "A edited while compressing"),
    course("course-c", "C added while compressing")
  ], "course-b");
  contentEditor.cards[1].querySelector('[data-course-field="place"]').focus();
  const commitRenderStart = contentEditor.renderCount;

  pending[0].resolve({ src: "data:image/png;base64,T05F" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pending.length, 2);
  pending[1].resolve({ src: "data:image/png;base64,VFdP" });
  await new Promise((resolve) => setImmediate(resolve));
  pending[2]?.resolve({ src: "data:image/png;base64,VEhSRUU=" });
  await upload;

  assert.equal(pending.length, 2);
  const items = api.getItemsData();
  assert.deepEqual(Array.from(items, (item) => item.id), ["course-b", "course-a", "course-c", "photo-uuid-1"]);
  assert.equal(items[1].place, "A edited while compressing");
  assert.equal(items.some((item) => item.src === "data:image/png;base64,VFdP"), false);
  assert.equal(contentEditor.renderCount, commitRenderStart + 1);
  assert.equal(contentEditor.querySelector(".content-item-card.is-open").dataset.itemId, "course-b");
  assert.equal(document.activeElement.closest("[data-item-card]").dataset.itemId, "course-a");
  assert.equal(document.activeElement.dataset.courseField, "place");
  assert.match(node("#save-status").textContent, /one\.png: 사진을 추가했습니다/);
  assert.match(node("#save-status").textContent, /two\.png: 사진 처리를 완료했지만 초대장 항목 제한으로 추가하지 않았습니다/);
  assert.match(node("#save-status").textContent, /three\.png: 선택 시점의 추가 가능 수를 초과해 처리하지 않았습니다/);
  assert.equal(node("#photo-input").value, "");
});

test("photo upload skips files beyond initial capacity without compression", async () => {
  let compressions = 0;
  const harness = loadEditorHarness({
    maxItems: 4,
    maxPhotos: 2,
    async compress() {
      compressions += 1;
      return { src: "data:image/png;base64,U0tJUA==" };
    }
  });
  const { api, contentEditor, node } = harness;
  api.renderContentEditor([photo("photo-a"), photo("photo-b")], "photo-a");
  const renderStart = contentEditor.renderCount;
  node("#photo-input").files = [{ name: "full.png" }];

  await api.handlePhotoSelection();

  assert.equal(compressions, 0);
  assert.equal(contentEditor.renderCount, renderStart);
  assert.deepEqual(Array.from(api.getItemsData(), (item) => item.id), ["photo-a", "photo-b"]);
  assert.match(node("#save-status").textContent, /full\.png: 선택 시점의 추가 가능 수를 초과해 처리하지 않았습니다/);
  assert.doesNotMatch(node("#save-status").textContent, /사진을 추가했습니다/);
});

test("all photo compression failures preserve the live editor state", async () => {
  const pending = [];
  const harness = loadEditorHarness({
    maxItems: 4,
    compress(file) {
      const result = deferred();
      pending.push({ file, ...result });
      return result.promise;
    }
  });
  const { api, contentEditor, document, node } = harness;
  api.renderContentEditor([course("course-a", "A"), course("course-b", "B")], "course-a");
  node("#photo-input").files = [{ name: "broken-a.png" }, { name: "broken-b.png" }];

  const upload = api.handlePhotoSelection();
  api.renderContentEditor([
    course("course-b", "B"),
    course("course-a", "A edited while failures resolve")
  ], "course-b");
  const focusedField = contentEditor.cards[1].querySelector('[data-course-field="place"]');
  focusedField.focus();
  const renderStart = contentEditor.renderCount;

  pending[0].reject(new Error("decode failed"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pending.length, 2);
  pending[1].reject(new Error("decode failed"));
  await upload;

  assert.equal(contentEditor.renderCount, renderStart);
  assert.deepEqual(Array.from(api.getItemsData(), (item) => item.id), ["course-b", "course-a"]);
  assert.equal(api.getItemsData()[1].place, "A edited while failures resolve");
  assert.equal(contentEditor.querySelector(".content-item-card.is-open").dataset.itemId, "course-b");
  assert.equal(document.activeElement, focusedField);
  assert.equal(node("#photo-input").value, "");
  assert.match(node("#save-status").textContent, /broken-a\.png: 이미지를 처리할 수 없습니다/);
  assert.match(node("#save-status").textContent, /broken-b\.png: 이미지를 처리할 수 없습니다/);
});

test("editor renders and re-collects every optional information card", () => {
  const harness = loadEditorHarness({ maxItems: 10 });
  const items = [
    { id: "notice-1", type: "notice", heading: "준비물", body: "물병" },
    { id: "profile-1", type: "profile", name: "김하린", role: "주인공", description: "첫 생일" },
    { id: "link-1", type: "link", label: "참석 여부", value: "회신해주세요", url: "https://example.com/rsvp" }
  ];
  harness.api.renderContentEditor(items, "notice-1");

  assert.deepEqual(JSON.parse(JSON.stringify(harness.api.getItemsData())), items);
  assert.match(harness.contentEditor.html, /data-notice-field="heading"/);
  assert.match(harness.contentEditor.html, /data-profile-field="name"/);
  assert.match(harness.contentEditor.html, /data-link-field="url"/);
});

test("new information cards use the existing move controls", () => {
  const harness = loadEditorHarness({ maxItems: 10 });
  harness.api.renderContentEditor([
    { id: "notice-1", type: "notice", heading: "안내", body: "내용" },
    { id: "link-1", type: "link", label: "문의", value: "전화", url: "tel:01012345678" }
  ], "notice-1");

  assert.equal(harness.api.commitItemMove(0, 1), "notice-1");
  assert.deepEqual(Array.from(harness.api.getItemsData(), ({ id }) => id), ["link-1", "notice-1"]);
});

test("boundary move controls stay focusable and moved focus survives the new boundary", () => {
  const { api, contentEditor, document } = loadEditorHarness();
  api.renderContentEditor([course("course-a"), course("course-b")], "course-a");
  const firstUp = contentEditor.cards[0].querySelector('[data-item-action="up"]');
  firstUp.focus();
  const renderStart = contentEditor.renderCount;

  contentEditor.dispatch("click", { target: firstUp });

  assert.equal(firstUp.disabled, false);
  assert.equal(firstUp.getAttribute("aria-disabled"), "true");
  assert.equal(document.activeElement, firstUp);
  assert.equal(contentEditor.renderCount, renderStart);

  const secondUp = contentEditor.cards[1].querySelector('[data-item-action="up"]');
  secondUp.focus();
  contentEditor.dispatch("click", { target: secondUp });

  assert.deepEqual(Array.from(api.getItemsData(), (item) => item.id), ["course-b", "course-a"]);
  assert.equal(document.activeElement.closest("[data-item-card]").dataset.itemId, "course-b");
  assert.equal(document.activeElement.dataset.itemAction, "up");
  assert.equal(document.activeElement.disabled, false);
  assert.equal(document.activeElement.getAttribute("aria-disabled"), "true");
});

test("deletion focuses the adjacent surviving card and then the add control", () => {
  const { api, contentEditor, document, node } = loadEditorHarness();
  api.renderContentEditor([course("course-a"), course("course-b"), course("course-c")], "course-a");

  const confirmDelete = (card) => {
    contentEditor.dispatch("click", { target: card.querySelector('[data-item-action="delete"]') });
    contentEditor.dispatch("click", { target: card.querySelector('[data-item-action="confirm-delete"]') });
  };

  confirmDelete(contentEditor.cards[1]);

  assert.deepEqual(Array.from(api.getItemsData(), (item) => item.id), ["course-a", "course-c"]);
  assert.equal(contentEditor.querySelector(".content-item-card.is-open").dataset.itemId, "course-a");
  assert.equal(document.activeElement.closest("[data-item-card]").dataset.itemId, "course-c");
  assert.equal(document.activeElement, contentEditor.cards[1].querySelector("[data-toggle-item]"));

  for (const id of ["course-c", "course-a"]) {
    confirmDelete(contentEditor.cards.find((itemCard) => itemCard.dataset.itemId === id));
  }

  assert.deepEqual(Array.from(api.getItemsData()), []);
  assert.equal(document.activeElement, node("#add-course-button"));
});

test("move buttons share the immutable move commit", () => {
  const app = read("assets/studio/app.js");
  const commit = app.match(/const commitItemMove = \(fromIndex, toIndex[\s\S]*?\n\};/)?.[0] || "";

  assert.match(commit, /ContentOrder\.move\(items, fromIndex, toIndex\)/);
  assert.match(commit, /renderContentEditor\(/);
  assert.match(commit, /renderPreview\(\)/);
  assert.match(commit, /focusItemControl\(movedId, focusSelector\)/);
  assert.match(app, /data-item-action="up"[\s\S]*?data-item-action="down"/);
  assert.match(app, /const toIndex = action === "up" \? index - 1 : index \+ 1/);
  assert.match(app, /commitItemMove\(index, toIndex/);
});

test("move controls animate cards from their previous positions", () => {
  const { api, contentEditor } = loadEditorHarness();
  api.renderContentEditor([course("course-a"), course("course-b")], "course-a");

  const secondUp = contentEditor.cards[1].querySelector('[data-item-action="up"]');
  contentEditor.dispatch("click", { target: secondUp });

  const moved = contentEditor.cards.find((card) => card.dataset.itemId === "course-b");
  const shifted = contentEditor.cards.find((card) => card.dataset.itemId === "course-a");
  assert.equal(moved.animations[0].frames[0].transform, "translateY(50px)");
  assert.equal(moved.animations[0].frames[1].transform, "translateY(0)");
  assert.equal(moved.animations[0].options.duration, 400);
  assert.equal(moved.animations[0].options.easing, "cubic-bezier(0.22, 1, 0.36, 1)");
  assert.equal(shifted.animations[0].frames[0].transform, "translateY(-50px)");
});

test("reorder motion respects reduced-motion preferences", () => {
  const { api, contentEditor, matchMediaCalls } = loadEditorHarness({ reducedMotion: true });
  api.renderContentEditor([course("course-a"), course("course-b")], "course-a");

  contentEditor.dispatch("click", {
    target: contentEditor.cards[1].querySelector('[data-item-action="up"]')
  });

  assert.deepEqual(contentEditor.cards.flatMap((card) => card.animations), []);
  assert.ok(matchMediaCalls.includes("(prefers-reduced-motion: reduce)"));
});

test("ordered editor controls and thumbnails stay bounded on narrow screens", () => {
  const css = read("assets/studio/style.css");

  assert.match(css, /\.item-icon-button\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
  // Reordering is the ↑ ↓ buttons only: pointer drag was the one mechanism
  // with no keyboard equivalent, and `touch-action: none` on a 44px handle
  // stole vertical scroll from the thumb on exactly the screens that matter.
  assert.doesNotMatch(css, /\.item-drag-handle/);
  assert.doesNotMatch(css, /\.drag-grip-bar/);
  assert.doesNotMatch(css, /\.content-item-card\.is-dragging/);
  assert.doesNotMatch(css, /\.content-item-card\.is-drop-(?:before|after)/);
  assert.doesNotMatch(css, /\.content-item-card\s*\{[^}]*touch-action:\s*none/s);
  assert.match(css, /\.content-item-position\s*\{[^}]*width:\s*26px[^}]*height:\s*26px/s);
  assert.match(css, /\.photo-editor-thumbnail\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3[^}]*object-fit:\s*cover/s);
});

/* B-6, B-7. Both fixes are overrides in studio.css rather than edits to
   style.css, because style.css is copied verbatim into every exported
   invitation and none of this chrome exists there. */
test("the item header keeps one row and the add buttons keep one shape", () => {
  const studio = read("assets/studio/studio.css");

  // Three fixed columns — grip, summary, menu — at every width, including the
  // 420px breakpoint where style.css used to drop the actions onto row two.
  assert.match(studio, /\.content-item-header\s*\{[^}]*grid-template-columns:\s*30px\s+minmax\(0,\s*1fr\)\s+44px/s);
  assert.match(studio, /@media\s*\(max-width:\s*420px\)\s*\{[^}]*\.content-item-header\s*\{[^}]*grid-template-columns:\s*30px\s+minmax\(0,\s*1fr\)\s+44px/s);
  assert.match(studio, /\.content-item-menu-button\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
  assert.match(studio, /\.content-item-menu-item\s*\{[^}]*min-height:\s*44px/s);
  assert.match(studio, /\.content-item-confirm-actions\s+button\s*\{[^}]*min-height:\s*44px/s);
  // Both are laid out with `display: grid`, which outranks the user agent's
  // `[hidden] { display: none }` — without this every card renders its menu
  // and its delete confirmation open.
  assert.match(studio, /\.content-item-menu-list\[hidden\],\s*\.content-item-confirm\[hidden\]\s*\{\s*display:\s*none/);
  // The popover has to escape the card, which style.css clips.
  assert.match(studio, /\.content-item-card\s*\{[^}]*overflow:\s*visible/s);

  // Five equal columns on a roomy screen; one scrolling chip row below it,
  // with a mask so the row reads as continuing past the right edge.
  assert.match(studio, /@media\s*\(min-width:\s*600px\)\s*\{[^}]*\.content-editor-commands\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(min-content,\s*1fr\)\)/s);
  assert.match(studio, /@media\s*\(max-width:\s*599px\)\s*\{[^}]*\.content-editor-commands\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(studio, /@media\s*\(max-width:\s*599px\)\s*\{[^}]*\.content-editor-commands\s*\{[^}]*mask-image:\s*linear-gradient/s);
  assert.doesNotMatch(studio, /\.content-editor-commands\s*\{[^}]*flex-wrap:\s*wrap/s);

  // Chrome colour only: no invitation palette variable may appear in the block.
  const block = studio.slice(studio.indexOf("/* Item cards and add-item commands"));
  assert.ok(block.length > 0, "the item-card block should be commented");
  assert.doesNotMatch(block, /var\(--(?:wine|gold|cream|ink|line|white)/);
  assert.match(block, /var\(--studio-/);
});

test("editor offers six English fonts and six Korean fonts", () => {
  const index = read("studio.html");
  const app = read("assets/studio/app.js");
  const englishSelect = index.match(/<select name="englishFont"[\s\S]*?<\/select>/)?.[0] || "";
  const koreanSelect = index.match(/<select name="koreanFont"[\s\S]*?<\/select>/)?.[0] || "";

  assert.equal((englishSelect.match(/<option /g) || []).length, 6);
  assert.equal((koreanSelect.match(/<option /g) || []).length, 6);
  assert.match(englishSelect, /value="gmarket-sans"/);
  assert.match(koreanSelect, /value="nanum-gothic"/);
  assert.match(koreanSelect, /value="gmarket-sans"/);
  assert.match(app, /data\.get\("englishFont"\)/);
  assert.match(app, /data\.get\("koreanFont"\)/);
});

test("editor exposes particle size and amount as percentage scales", () => {
  const index = read("studio.html");
  const app = read("assets/studio/app.js");

  assert.match(index, /<input[^>]+name="particleScale"[^>]+type="range"[^>]+min="50"[^>]+max="200"[^>]+step="5"/);
  assert.match(index, /<output[^>]+data-particle-scale-output[^>]*>100%<\/output>/);
  assert.match(index, /<input[^>]+name="particleAmount"[^>]+type="range"[^>]+min="25"[^>]+max="500"[^>]+step="25"/);
  assert.match(index, /<output[^>]+data-particle-amount-output[^>]*>100%<\/output>/);
  assert.match(app, /data\.get\("particleScale"\)/);
  assert.match(app, /data\.get\("particleAmount"\)/);
  assert.match(app, /data-particle-scale-output/);
  assert.match(app, /data-particle-amount-output/);
  assert.match(app, /particleScaleOutput\.setAttribute\("aria-label"/);
  assert.match(app, /particleAmountOutput\.setAttribute\("aria-label"/);
});

/* The <option> and <optgroup> labels now carry data-i18n bindings alongside
   their attributes, so these read the tag's attributes rather than assuming
   an order, then check the copy through the dictionary. That keeps the same
   assertions and adds one the literals could not make: the English studio
   shows a real translated label for every single choice. */
const parseTagAttributes = (tag) => {
  const attributes = {};
  for (const match of String(tag).matchAll(/\s([a-z][\w:-]*)\s*=\s*"([^"]*)"/gi)) {
    attributes[match[1].toLowerCase()] = match[2];
  }
  return attributes;
};
const readOptions = (select) => [...select.matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)]
  .map(([, attributes, text]) => ({ ...parseTagAttributes(`<option${attributes}>`), text }));
const readOptgroups = (select) => [...select.matchAll(/<optgroup\b([^>]*)>([\s\S]*?)<\/optgroup>/g)]
  .map(([, attributes, body]) => ({ ...parseTagAttributes(`<optgroup${attributes}>`), options: readOptions(body) }));

const assertLocalizedChoice = ({ text, "data-i18n": key }, value) => {
  assert.ok(key, `option ${value} must be translatable`);
  // The inline text is the Korean default the page serves before scripts run,
  // so it has to agree with the Korean dictionary or the two would drift.
  assert.equal(text, ko(key), `option ${value} inline text must match the ko dictionary`);
  assert.notEqual(en(key), key, `option ${value} has no English translation`);
};

test("particle selector groups every effect profile in the editor", () => {
  const index = read("studio.html");
  const select = index.match(/<select name="particleEffect"[\s\S]*?<\/select>/)?.[0] || "";
  const groups = readOptgroups(select);

  const none = readOptions(select).find((option) => option.value === "none");
  assertLocalizedChoice(none, "none");

  assert.equal(groups.length, 4);
  const expectedGroups = [
    ["effects.particleGroupRomantic", ["petals", "hearts"]],
    ["effects.particleGroupMood", ["sparkle", "fireflies", "bubbles"]],
    ["effects.particleGroupSeason", ["snow", "leaves"]],
    ["effects.particleGroupCelebration", ["confetti"]]
  ];
  assert.deepEqual(groups.map((group) => group.options.map((option) => option.value)),
    expectedGroups.map(([, values]) => values));

  for (const [index_, [groupKey]] of expectedGroups.entries()) {
    const group = groups[index_];
    assert.equal(group["data-i18n-attr"], `label:${groupKey}`);
    assert.equal(group.label, ko(groupKey), `optgroup ${groupKey} inline label must match the ko dictionary`);
    assert.notEqual(en(groupKey), groupKey, `optgroup ${groupKey} has no English translation`);
    for (const option of group.options) assertLocalizedChoice(option, option.value);
  }

  for (const effect of ["none", "petals", "hearts", "sparkle", "fireflies", "bubbles", "snow", "leaves", "confetti"]) {
    assert.equal((select.match(new RegExp(`value="${effect}"`, "g")) || []).length, 1);
  }
});

test("editor exposes grouped intro choices and replay control", () => {
  const html = read("studio.html");
  const select = html.match(/<select id="intro-effect"[\s\S]*?<\/select>/)?.[0] || "";
  assert.match(html, /name="introEffect"/);
  assert.match(html, /id="replay-intro-button"/);
  for (const effect of ["envelope", "card-shrink", "dawn", "fireworks", "curtain", "petals", "spotlight", "photo-focus"]) {
    assert.match(html, new RegExp(`value="${effect}"`));
  }

  const options = new Map(readOptions(select).map((option) => [option.value, option]));
  assert.equal(options.get("petals")["data-i18n"], "effects.introPetals");
  assert.equal(options.get("photo-focus")["data-i18n"], "effects.introPhotoFocus");
  for (const effect of ["none", "envelope", "card-shrink", "dawn", "fireworks", "curtain", "petals", "spotlight", "photo-focus"]) {
    assertLocalizedChoice(options.get(effect), effect);
  }
});

test("ordinary preview rendering does not start intro playback", () => {
  const source = read("assets/studio/app.js");
  const renderPreviewBody = functionBody(source, "renderPreview");
  assert.doesNotMatch(renderPreviewBody, /InvitationIntro\.play/);
  assert.match(source, /const playPreviewIntro/);
});

test("selecting an active intro plays one preview-scoped overlay", () => {
  const harness = loadIntroLifecycleHarness();
  harness.elements.introEffect.value = "dawn";

  harness.form.dispatch("input", { target: harness.elements.introEffect });

  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].options?.preview, true);
  assert.equal(harness.preview.querySelector("[data-intro-overlay]"), harness.calls[0].overlay);
  assert.equal(harness.replay.disabled, false);
});

test("replay starts a fresh preview-scoped intro", () => {
  const harness = loadIntroLifecycleHarness();
  harness.elements.introEffect.value = "dawn";
  harness.form.dispatch("input", { target: harness.elements.introEffect });
  const initialOverlay = harness.preview.querySelector("[data-intro-overlay]");

  harness.replay.dispatch("click");

  assert.equal(harness.calls.length, 2);
  assert.equal(harness.calls[1].options?.preview, true);
  assert.notEqual(harness.preview.querySelector("[data-intro-overlay]"), initialOverlay);
});

test("selecting none stops the active intro and disables replay", () => {
  const harness = loadIntroLifecycleHarness();
  harness.elements.introEffect.value = "dawn";
  harness.form.dispatch("input", { target: harness.elements.introEffect });

  harness.elements.introEffect.value = "none";
  harness.form.dispatch("input", { target: harness.elements.introEffect });

  assert.deepEqual(harness.stops, [harness.preview]);
  assert.equal(harness.preview.querySelector("[data-intro-overlay]"), null);
  assert.equal(harness.replay.disabled, true);
});

test("ordinary preview rendering preserves an active overlay without replaying", () => {
  const harness = loadIntroLifecycleHarness();
  harness.elements.introEffect.value = "dawn";
  harness.form.dispatch("input", { target: harness.elements.introEffect });
  const activeOverlay = harness.preview.querySelector("[data-intro-overlay]");

  harness.api.renderPreview();

  assert.equal(harness.calls.length, 1);
  assert.equal(harness.preview.querySelector("[data-intro-overlay]"), activeOverlay);
});

test("preview host receives the selected invitation font variables", () => {
  const harness = loadIntroLifecycleHarness();
  harness.elements.englishFont.value = "great-vibes";
  harness.elements.koreanFont.value = "gmarket-sans";

  harness.api.renderPreview();

  assert.equal(
    harness.preview.attributes.style,
    "--font-en:'Great Vibes', 'Brush Script MT', cursive;--font-ko:'Gmarket Sans', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif"
  );
});

test("the details editor takes the date from a picker, a zone and an optional sentence", () => {
  const index = read("studio.html");
  const app = read("assets/studio/app.js");

  assert.match(index, /<input name="dateTime" type="datetime-local"/);
  assert.match(index, /<select name="timeZone"/);
  assert.match(index, /data-i18n="editor\.dateTime"/);
  assert.match(index, /data-i18n="editor\.dateTimeZone"/);
  // The free-text label survives as an explicit opt-in, not as the only way in.
  assert.match(index, /<details class="full date-custom-field" data-date-custom>/);
  assert.match(index, /data-i18n="editor\.dateCustomToggle"/);
  assert.match(index, /<input name="dateLabel" type="text"/);

  // Both new controls reach the invitation the same way every other field does.
  assert.match(app, /dateTime: data\.get\("dateTime"\)/);
  assert.match(app, /timeZone: data\.get\("timeZone"\)/);

  for (const key of ["dateTime", "dateTimeZone", "dateCustomToggle", "dateCustomHint", "dateCustomPlaceholder"]) {
    assert.notEqual(ko(`editor.${key}`), `editor.${key}`, `editor.${key} has no Korean copy`);
    assert.notEqual(en(`editor.${key}`), `editor.${key}`, `editor.${key} has no English copy`);
  }
});

test("the time zone list is offered from the browser's own zones and defaults to the reader's", () => {
  const app = read("assets/studio/app.js");

  assert.match(app, /Intl\.supportedValuesOf\?\.\("timeZone"\)/);
  assert.match(app, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  // A browser without supportedValuesOf still gets a usable list.
  assert.match(app, /const FALLBACK_TIME_ZONES = \[/);
});

test("a date the author picked fills the picker, and only their own words fill the sentence", () => {
  const harness = loadEditorHarness();
  const { fillForm } = harness.api;
  const form = harness.node("#invitation-form");

  const derived = InvitationI18n.formatSampleDate("2026-12-19T17:00", InvitationI18n.getDateLocale());
  // A sample carries both an instant and the label we formatted from it. That
  // label is ours, so the "write it my own way" field stays empty and the
  // picker keeps the date.
  fillForm(InvitationCore.normalizeInvitation({
    dateTime: "2026-12-19T17:00", timeZone: "Europe/London", dateLabel: derived
  }));
  assert.equal(form.elements.dateTime.value, "2026-12-19T17:00");
  assert.equal(form.elements.timeZone.value, "Europe/London");
  assert.equal(form.elements.dateLabel.value, "");

  // Words the author typed are theirs and come back exactly as they left them.
  fillForm(InvitationCore.normalizeInvitation({
    dateTime: "2026-12-19T17:00", dateLabel: "the last Saturday of summer"
  }));
  assert.equal(form.elements.dateLabel.value, "the last Saturday of summer");

  // A draft saved before the picker existed has only its sentence.
  fillForm(InvitationCore.normalizeInvitation({ dateLabel: "2026.09.12 SAT 14:00" }));
  assert.equal(form.elements.dateTime.value, "");
  assert.equal(form.elements.dateLabel.value, "2026.09.12 SAT 14:00");
});

/* B-3 / B-4 — the phone gallery ------------------------------------------
   Two thumbnails per row, 160px wide, are all a phone author sees before the
   biggest decision in the studio. Tapping a card has to open the real thing at
   the real width, and the edit/finish preview has to stop lying about how wide
   a phone is. */
test("the sample sheet's markup is a labelled dialog with two ways out", () => {
  const sheet = read("studio.html").match(/<dialog id="sample-sheet"[\s\S]*?<\/dialog>/)?.[0] || "";

  assert.match(sheet, /class="studio-sheet"/);
  assert.match(sheet, /aria-labelledby="sample-sheet-title"/);
  assert.match(sheet, /id="sample-sheet-title"/);
  assert.match(sheet, /<iframe[^>]+id="sample-sheet-frame"/);
  assert.match(sheet, /id="sample-sheet-apply"/);
  // Two ways out of a modal that covers the screen: the 44px ✕ and a labelled
  // button next to the one that commits.
  assert.equal((sheet.match(/data-sheet-close/g) || []).length, 2);
  assert.match(sheet, /data-i18n="gallery\.sheetTitle"/);
  assert.match(sheet, /data-i18n="gallery\.sheetClose"/);

  for (const translate of [ko, en]) {
    for (const key of ["gallery.sheetTitle", "gallery.sheetClose", "gallery.sheetFrameTitle"]) {
      assert.notEqual(translate(key), key, `${key} is missing a translation`);
    }
  }
});

const loadGalleryHarness = async ({ mobile }) => {
  const harness = loadEditorHarness({ mobile, normalizeInvitation: InvitationCore.normalizeInvitation });
  await harness.api.loadInitialData();
  harness.api.state.activeOccasion = "wedding";
  harness.api.renderTemplates();
  return harness;
};
const galleryCard = (harness, templateId) => harness.node("#template-list").buttons
  .find((button) => button.dataset.templateId === templateId);

test("a design card tap raises the sheet on a phone and leaves the desktop gallery alone", async () => {
  // Above 900px the gallery already renders every design live at full width,
  // so there is nothing a sheet would add and none opens.
  const desktop = await loadGalleryHarness({ mobile: false });
  desktop.node("#template-list").dispatch("click", { target: galleryCard(desktop, "modern-vow") });
  assert.equal(desktop.api.openSampleSheet("modern-vow"), false);
  assert.equal(desktop.node("#sample-sheet").modalCalls, 0);
  assert.equal(desktop.node("#sample-sheet-frame").srcdoc, undefined);

  const phone = await loadGalleryHarness({ mobile: true });
  const sheet = phone.node("#sample-sheet");
  phone.node("#template-list").dispatch("click", { target: galleryCard(phone, "modern-vow") });

  assert.equal(sheet.modalCalls, 1);
  assert.equal(sheet.open, true);
  assert.equal(
    phone.node("#sample-sheet-title").textContent,
    TemplateCatalog.getPreset(phone.api.state.catalog, "modern-vow").name
  );
  // The frame carries the same standalone document a guest receives, minus the
  // envelope (an animation over the design is the opposite of showing it) and
  // minus the map keys, so one card tap never calls a maps provider.
  const sample = JSON.parse(phone.node("#sample-sheet-frame").srcdoc);
  assert.equal(sample.templateId, "modern-vow");
  assert.equal(sample.introEffect, "none");
  assert.equal(sample.naverMapClientId, "");
  assert.equal(sample.googleMapsApiKey, "");
});

test("a design that asks for a map keeps the map section at the height a guest would see", async () => {
  const phone = await loadGalleryHarness({ mobile: true });
  // No preset ships a map today, so a design that wants one has to be made.
  const data = JSON.parse(read("invitation-data.json"));
  Object.assign(data.templates.find((template) => template.id === "modern-vow").defaults, {
    mapEnabled: true, mapLatitude: 37.5665, mapLongitude: 126.978
  });
  phone.api.state.catalog = TemplateCatalog.normalizeCatalog(data);
  phone.api.renderTemplates();

  phone.node("#template-list").dispatch("click", { target: galleryCard(phone, "modern-vow") });

  // Forcing mapEnabled off dropped the whole panel and made the sheet shorter
  // than the design it was previewing. The keyless map renders instead: the
  // panel keeps its height and carries the status a guest gets when a map
  // cannot load, and with no key in the document nothing calls a provider.
  const sample = JSON.parse(phone.node("#sample-sheet-frame").srcdoc);
  assert.equal(sample.mapEnabled, true);
  assert.equal(sample.naverMapClientId, "");
  assert.equal(sample.googleMapsApiKey, "");
  const body = InvitationCore.renderInvitationBody(sample);
  assert.match(body, /class="invite-map-panel/);
  assert.match(body, /invite-map-status/);
});

test("closing the sheet drops the sample and hands focus back to the tapped card", async () => {
  const phone = await loadGalleryHarness({ mobile: true });
  const sheet = phone.node("#sample-sheet");
  phone.node("#template-list").dispatch("click", { target: galleryCard(phone, "modern-vow") });

  phone.document.activeElement = null;
  sheet.close();

  assert.equal(sheet.open, false);
  // A sample left parsed in a hidden frame keeps its fonts and palette alive
  // for nothing, and the author's attention was on the card they tapped.
  assert.equal(phone.node("#sample-sheet-frame").srcdoc, "");
  assert.equal(phone.document.activeElement, galleryCard(phone, "modern-vow"));
});

test("the sheet's apply button is the dock's apply button, label and all", async () => {
  const phone = await loadGalleryHarness({ mobile: true });
  const sheet = phone.node("#sample-sheet");
  const sheetApply = phone.node("#sample-sheet-apply");
  const dock = phone.node("#gallery-create");

  phone.node("#template-list").dispatch("click", { target: galleryCard(phone, "modern-vow") });
  assert.equal(sheetApply.textContent, ko("gallery.apply"));
  assert.equal(sheetApply.textContent, dock.textContent);
  assert.equal(sheetApply.disabled, dock.disabled);

  phone.document.activeElement = null;
  sheetApply.dispatch("click");

  // Same handler as the dock: the design is applied, and focus is left for the
  // editor the apply lands in rather than snapped back to the card.
  assert.equal(phone.api.state.activeTemplate, "modern-vow");
  assert.equal(sheet.open, false);
  assert.equal(phone.document.activeElement, null);

  // Tapping the card that is already applied now offers the next step, exactly
  // as the dock does — no button asking to re-apply what is already on.
  phone.node("#template-list").dispatch("click", { target: galleryCard(phone, "modern-vow") });
  assert.equal(sheetApply.textContent, ko("gallery.continueToEditor"));
  assert.equal(sheetApply.textContent, dock.textContent);

  // And with nothing selectable, the sheet's button is as unavailable as the dock's.
  phone.api.state.pendingTemplateId = "no-such-design";
  phone.api.renderTemplates();
  assert.equal(sheetApply.disabled, true);
  assert.equal(sheetApply.disabled, dock.disabled);
});
/* The sheet is a top-layer modal raised by a gallery card, and the card is the
   only thing it is about. Left open across an apply it covered the editor with
   a "use this design" button for a design the author had already committed to,
   and there was no card behind it to go back to. Every apply ends in
   setStudioStage, so that is where the sheet is dismissed — which is what makes
   the guarantee hold for a button that did not exist when this was written. */
const applyFromSheet = async (control) => {
  const phone = await loadGalleryHarness({ mobile: true });
  phone.node("#template-list").dispatch("click", { target: galleryCard(phone, "modern-vow") });
  assert.equal(phone.node("#sample-sheet").open, true, `${control} needs an open sheet to dismiss`);
  phone.document.activeElement = null;
  phone.node(control).dispatch("click");
  return phone;
};

test("applying a design dismisses the sheet, whichever button applied it", async () => {
  for (const control of ["#apply-template-button", "#gallery-create", "#sample-sheet-apply"]) {
    const phone = await applyFromSheet(control);

    assert.equal(phone.api.state.activeTemplate, "modern-vow", `${control} did not apply the design`);
    assert.equal(phone.node("#sample-sheet").open, false, `${control} left the sheet over the editor`);
    assert.equal(phone.document.body.dataset.studioStage, "edit", `${control} did not land on the editor`);
    // The sample document goes with it, and focus is left for the editor
    // rather than snapped back to a card on a stage the author has left.
    assert.equal(phone.node("#sample-sheet-frame").srcdoc, "");
    assert.equal(phone.document.activeElement, null, `${control} sent focus back to the gallery card`);
  }
});

test("the sheet cannot survive a stage change onto the editor, finish screen or library", async () => {
  for (const stage of ["edit", "finish", "library", "gallery"]) {
    const phone = await loadGalleryHarness({ mobile: true });
    const sheet = phone.node("#sample-sheet");
    phone.node("#template-list").dispatch("click", { target: galleryCard(phone, "modern-vow") });
    assert.equal(sheet.open, true);

    phone.document.activeElement = null;
    phone.api.setStudioStage(stage);

    assert.equal(sheet.open, false, `the sheet outlived the ${stage} stage`);
    assert.equal(phone.node("#sample-sheet-frame").srcdoc, "");
    assert.equal(phone.document.activeElement, null);
  }
});

test("the sample sheet is a bottom sheet with a safe-area floor and no motion when motion is off", () => {
  const css = read("assets/studio/studio.css");

  assert.match(css, /\.studio-sheet\s*\{[^}]*height:\s*92vh/s);
  assert.match(css, /\.studio-sheet\s*\{[^}]*margin:\s*auto auto 0/s);
  assert.match(css, /\.studio-sheet\s*\{[^}]*border-radius:\s*20px 20px 0 0/s);
  assert.match(css, /\.studio-sheet::backdrop\s*\{[^}]*background:\s*var\(--studio-scrim\)/s);
  // `display: flex` outranks the UA's `dialog:not([open]) { display: none }`:
  // without this the unopened sheet paints at the foot of the gallery page.
  assert.match(css, /\.studio-sheet:not\(\[open\]\)\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.studio-sheet-close\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
  assert.match(css, /\.studio-sheet-actions\s*\{[^}]*env\(safe-area-inset-bottom\)/s);
  assert.match(css, /\.studio-sheet-actions button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[^}]*\{[^}]*\.studio-sheet[^}]*animation: none/s);
  // The gallery stage keeps the preview panel only to host the apply prompt:
  // the frame itself is hidden there, and the sheet is the full-size view.
  assert.match(css, /body\[data-studio-stage="gallery"\] #preview \{ display: none; \}/);
});

test("the phone preview frame is as wide as the phone", () => {
  const css = read("assets/studio/studio.css");
  const mobile = css.slice(css.indexOf("/* Honest preview width (B-4)"));

  assert.ok(mobile, "the B-4 block is missing");
  assert.match(mobile, /\.preview-panel\s*\{[^}]*padding:\s*0/s);
  assert.match(mobile, /\.preview-frame\s*\{[^}]*width:\s*100%/s);
  // .app-shell keeps a 16px gutter on phones; the preview steps back out of it
  // so a 390px phone previews at 390px rather than 358px.
  assert.match(mobile, /margin-inline:\s*-16px/s);
});
