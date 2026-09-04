const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ContentOrder = require("../assets/content-order.js");
const InvitationCore = require("../assets/invitation-core.js");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

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

const loadEditorHarness = ({ maxItems = 4, maxPhotos = 8, compress, normalizeInvitation = (value) => value } = {}) => {
  const documentEvents = makeEventTarget();
  const windowEvents = makeEventTarget();
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
    confirm: () => true,
    matchMedia: () => ({ matches: false }),
    open() {},
    scrollTo() {}
  };

  const makeControl = (card, selector, { attrs = {}, dataset = {}, value = "", checked = false } = {}) => {
    const capturedPointers = new Set();
    return {
      attrs: { ...attrs },
      card,
      checked,
      dataset: { ...dataset },
      disabled: Boolean(attrs.disabled),
      value,
      capturedPointers,
      closest(requested) {
        if (requested === selector) return this;
        if (requested === "[data-item-action]" && this.dataset.itemAction) return this;
        if (requested === "[data-drag-handle]" && selector === "[data-drag-handle]") return this;
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
    for (const action of ["up", "down", "delete"]) {
      addControl(`[data-item-action="${action}"]`, { dataset: { itemAction: action } });
    }

    if (item.type === "photo") {
      addControl("[data-photo-thumbnail]", { attrs: { src: item.src, alt: item.alt || "" } });
      addControl('[data-photo-field="alt"]', { dataset: { photoField: "alt" }, value: item.alt });
      addControl('[data-photo-field="caption"]', { dataset: { photoField: "caption" }, value: item.caption });
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
      const item = type === "photo"
        ? {
            id,
            type,
            src: readAttribute(body.match(/<img[^>]+data-photo-thumbnail[^>]*>/)?.[0] || "", "src"),
            alt: readInput(body, "photo", "alt"),
            caption: readTextarea(body, "photo", "caption")
          }
        : {
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

  const genericNode = () => ({
    addEventListener() {},
    append() {},
    click() {},
    dataset: {},
    disabled: false,
    focus() { document.activeElement = this; },
    querySelector: () => ({ hidden: false, textContent: "" }),
    querySelectorAll: () => [],
    replaceChildren() {},
    textContent: "",
    value: ""
  });
  const selectors = new Map();
  const node = (selector) => {
    if (!selectors.has(selector)) selectors.set(selector, genericNode());
    return selectors.get(selector);
  };
  selectors.set("#content-editor", contentEditor);
  selectors.set("#invitation-form", { ...genericNode(), ...makeEventTarget() });
  document.querySelector = node;

  let source = read("assets/app.js");
  const previewStart = source.indexOf("const renderPreview = () => {");
  const previewEnd = source.indexOf("\nconst renderSaved =", previewStart);
  source = `${source.slice(0, previewStart)}const renderPreview = () => { globalThis.__previewRenders += 1; };${source.slice(previewEnd)}`;
  source = source.replace(/\ninit\(\);\s*$/, "");
  source += `\n;globalThis.__editorTest = {
    beginItemDrag,
    getDragState: () => dragState,
    getItemsData,
    getPendingPreviewMapKey: () => pendingPreviewMapKey,
    handlePhotoSelection,
    moveItemDrag,
    renderContentEditor
  };`;

  let uuid = 0;
  const context = {
    Blob,
    ContentOrder,
    FormData: class FormData { get() { return ""; } has() { return false; } },
    ImageTools: {
      ImageError: class ImageError extends Error {},
      compress: compress || (async () => ({ src: "data:image/png;base64,QQ==" }))
    },
    InvitationCore: {
      MAX_ITEMS: maxItems,
      MAX_PHOTOS: maxPhotos,
      MAX_STOPS: maxItems,
      normalizeInvitation,
      renderInvitationBody: () => ""
    },
    URL,
    __previewRenders: 0,
    clearTimeout,
    console,
    crypto: { randomUUID: () => `uuid-${++uuid}` },
    document,
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout,
    window
  };
  vm.runInNewContext(source, context, { filename: "assets/app.js" });

  return {
    api: context.__editorTest,
    contentEditor,
    document,
    node,
    terminal(type, event) {
      document.dispatch(type, event);
      window.dispatch(type, event);
    }
  };
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
      return { hidden: false, textContent: "" };
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

  let source = read("assets/app.js").replace(/\ninit\(\);\s*$/, "");
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
  vm.runInNewContext(source, context, { filename: "assets/app.js" });

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

test("saved invitations open through a same-origin viewer", () => {
  const app = read("assets/app.js");
  const viewer = read("viewer.html");

  assert.match(app, /viewer\.html\?id=/);
  assert.doesNotMatch(app, /const openSaved = \(item\) => \{[\s\S]*?URL\.createObjectURL/);
  assert.match(viewer, /assets\/viewer\.js/);
});

test("maker and viewer each use exactly one inline favicon", () => {
  for (const page of ["index.html", "viewer.html"]) {
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
  const app = read("assets/app.js");
  const migration = app.match(/const migrateLegacySaved = async \(\) => \{[\s\S]*?\n\};/)?.[0] || "";
  const appWithoutMigration = app.replace(migration, "");

  assert.match(app, /const MAX_UPLOAD_BYTES = 10 \* 1024 \* 1024/);
  assert.match(app, /10MB 이하의 초대장 HTML만 등록할 수 있습니다/);
  assert.match(app, /await InvitationStorage\.open\(\)/);
  assert.match(app, /await InvitationStorage\.(?:put|remove|list)\(/);
  assert.doesNotMatch(appWithoutMigration, /localStorage\.(?:getItem|setItem|removeItem)/);
});

test("library initialization distinguishes open failure from later sync failure", () => {
  const app = read("assets/app.js");
  const init = app.match(/const init = async \(\) => \{[\s\S]*?\n\};/)?.[0] || "";
  const statusMessages = [...init.matchAll(/dom\.uploadStatus\.textContent = "([^"]+)"/g)]
    .map((match) => match[1]);

  assert.ok(statusMessages.some((message) => /저장소를 열지 못/.test(message)));
  assert.ok(statusMessages.some((message) => /동기화|마이그레이션/.test(message)));
  assert.equal(new Set(statusMessages).size, statusMessages.length);
});

test("viewer awaits IndexedDB and rebuilds only a typed JSON invitation payload", async () => {
  const viewerSource = read("assets/viewer.js");
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

  const result = vm.runInNewContext(viewerSource, context, { filename: "assets/viewer.js" });
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
  const viewerSource = read("assets/viewer.js");
  const main = { innerHTML: "" };
  const written = [];
  const duplicated = `${validInvitationHtml("First payload")}${validInvitationHtml("Second payload")}`;
  const context = {
    DOMParser: invitationParser,
    InvitationCore,
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

  const result = vm.runInNewContext(viewerSource, context, { filename: "assets/viewer.js" });
  await result;

  assert.equal(written.length, 0);
  assert.match(main.innerHTML, /등록 목록에서 초대장을 확인한 뒤 다시 시도해 주세요/);
});

test("viewer preserves the missing invitation message for invalid stored HTML", async () => {
  const viewerSource = read("assets/viewer.js");
  const main = { innerHTML: "" };
  const written = [];
  const context = {
    DOMParser: invitationParser,
    InvitationCore,
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

  const result = vm.runInNewContext(viewerSource, context, { filename: "assets/viewer.js" });
  await result;

  assert.equal(written.length, 0);
  assert.match(main.innerHTML, /등록 목록에서 초대장을 확인한 뒤 다시 시도해 주세요/);
});

test("editor exposes mobile view tabs and selected template state", () => {
  const index = read("index.html");
  const app = read("assets/app.js");

  assert.match(index, /class="mobile-view-tabs"/);
  assert.match(index, /data-mobile-view="editor"/);
  assert.match(index, /data-mobile-view="preview"/);
  assert.match(index, /data-mobile-view="library"/);
  assert.match(app, /querySelectorAll\("\.mobile-view-tabs button\[data-mobile-view\]"\)/);
  assert.match(app, /aria-pressed/);
});

test("course map settings span the full card width", () => {
  const css = read("assets/style.css");

  assert.match(css, /\.editor-form\s*>\s*\.full\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(css, /\.course-editor-grid\s*>\s*\.full\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(css, /\.stop-map-settings\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
});

test("editor exposes one ordered content shell and constrained photo picker", () => {
  const index = read("index.html");
  const photoInput = index.match(/<input[^>]+id="photo-input"[^>]*>/)?.[0] || "";
  const scriptOrder = [
    "assets/invitation-core.js",
    "assets/image-tools.js",
    "assets/content-order.js",
    "assets/app.js"
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

test("mixed editor cards preserve identity and expose type-specific fields", () => {
  const app = read("assets/app.js");

  assert.match(app, /const getItemsData = \(\) => \[\.\.\.dom\.contentEditor\.querySelectorAll\("\[data-item-card\]"\)\]/);
  assert.match(app, /id:\s*card\.dataset\.itemId/);
  assert.match(app, /type:\s*card\.dataset\.itemType/);
  assert.match(app, /card\.dataset\.itemType === "photo"[\s\S]*?data-photo-thumbnail[\s\S]*?data-photo-field="alt"[\s\S]*?data-photo-field="caption"/);
  assert.match(app, /data-item-id="\$\{escapeAttribute\(item\.id\)\}"/);
  assert.match(app, /data-item-type="\$\{item\.type\}"/);
  assert.match(app, /data-course-field="time" type="time" step="600"/);
  assert.match(app, /data-drag-handle/);
  for (const action of ["up", "down", "delete"]) {
    assert.match(app, new RegExp(`data-item-action="${action}"[^>]+aria-label="[^"]+"[^>]+title="[^"]+"`));
  }
  assert.match(app, /items:\s*getItemsData\(\)/);
  assert.doesNotMatch(app, /stops:\s*getStopsData\(\)/);
  assert.match(app, /if \(action !== "delete"\)[\s\S]*?const items = getItemsData\(\)[\s\S]*?item\.type === "photo"[\s\S]*?items\.splice\(index, 1\)/);
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
  const app = read("assets/app.js");
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

  const deleteB = contentEditor.cards[1].querySelector('[data-item-action="delete"]');
  deleteB.focus();
  contentEditor.dispatch("click", { target: deleteB });

  assert.deepEqual(Array.from(api.getItemsData(), (item) => item.id), ["course-a", "course-c"]);
  assert.equal(contentEditor.querySelector(".content-item-card.is-open").dataset.itemId, "course-a");
  assert.equal(document.activeElement.closest("[data-item-card]").dataset.itemId, "course-c");
  assert.equal(document.activeElement, contentEditor.cards[1].querySelector("[data-toggle-item]"));

  for (const id of ["course-c", "course-a"]) {
    const card = contentEditor.cards.find((itemCard) => itemCard.dataset.itemId === id);
    contentEditor.dispatch("click", { target: card.querySelector('[data-item-action="delete"]') });
  }

  assert.deepEqual(Array.from(api.getItemsData()), []);
  assert.equal(document.activeElement, node("#add-course-button"));
});

test("an unrelated rerender tears down drag state before replacing cards", () => {
  const harness = loadEditorHarness();
  const { api, contentEditor } = harness;
  const items = [course("course-a"), course("course-b")];
  api.renderContentEditor(items, "course-a");
  const oldCard = contentEditor.cards[0];
  const oldHandle = oldCard.querySelector("[data-drag-handle]");
  contentEditor.dispatch("pointerdown", {
    button: 0,
    pointerId: 11,
    preventDefault() {},
    target: oldHandle
  });
  assert.equal(api.getDragState().itemId, "course-a");

  api.renderContentEditor(items, "course-a");

  assert.equal(api.getDragState(), null);
  assert.equal(oldCard.classList.contains("is-dragging"), false);
  assert.equal(oldHandle.hasPointerCapture(11), false);

  const nextHandle = contentEditor.cards[1].querySelector("[data-drag-handle]");
  contentEditor.dispatch("pointerdown", {
    button: 0,
    pointerId: 12,
    preventDefault() {},
    target: nextHandle
  });
  assert.equal(api.getDragState().itemId, "course-b");
  harness.terminal("pointerup", { pointerId: 12, target: nextHandle });
  assert.equal(api.getDragState(), null);
});

test("midpoint capture transfer survives detach and global cancel permits a second drag", () => {
  const harness = loadEditorHarness();
  const { api, contentEditor, document } = harness;
  api.renderContentEditor([course("course-a"), course("course-b")], "course-a");
  const oldHandle = contentEditor.cards[0].querySelector("[data-drag-handle]");
  contentEditor.dispatch("pointerdown", {
    button: 0,
    pointerId: 21,
    preventDefault() {},
    target: oldHandle
  });
  document.hitTarget = contentEditor.cards[1];

  contentEditor.dispatch("pointermove", {
    clientX: 10,
    clientY: 100,
    pointerId: 21,
    preventDefault() {},
    target: oldHandle
  });

  assert.deepEqual(Array.from(api.getItemsData(), (item) => item.id), ["course-b", "course-a"]);
  assert.equal(api.getDragState().itemId, "course-a");
  assert.equal(api.getDragState().handle.hasPointerCapture(21), true);

  harness.terminal("pointercancel", { pointerId: 21, target: oldHandle });
  assert.equal(api.getDragState(), null);

  const secondHandle = contentEditor.cards[0].querySelector("[data-drag-handle]");
  contentEditor.dispatch("pointerdown", {
    button: 0,
    pointerId: 22,
    preventDefault() {},
    target: secondHandle
  });
  assert.equal(api.getDragState().itemId, "course-b");
  harness.terminal("pointerup", { pointerId: 22, target: secondHandle });
  assert.equal(api.getDragState(), null);
});

test("buttons and pointer drag share the immutable move commit", () => {
  const app = read("assets/app.js");
  const commit = app.match(/const commitItemMove = \(fromIndex, toIndex[\s\S]*?\n\};/)?.[0] || "";
  const beginDrag = app.match(/const beginItemDrag = \(event\) => \{[\s\S]*?\n\};/)?.[0] || "";
  const moveDrag = app.match(/const moveItemDrag = \(event\) => \{[\s\S]*?\n\};/)?.[0] || "";

  assert.match(commit, /ContentOrder\.move\(items, fromIndex, toIndex\)/);
  assert.match(commit, /renderContentEditor\(/);
  assert.match(commit, /renderPreview\(\)/);
  assert.match(commit, /focusItemControl\(movedId, focusSelector\)/);
  assert.match(app, /data-item-action="up"[\s\S]*?data-item-action="down"/);
  assert.match(app, /const toIndex = action === "up" \? index - 1 : index \+ 1/);
  assert.match(app, /commitItemMove\(index, toIndex/);
  assert.match(app, /addEventListener\("pointerdown", beginItemDrag\)/);
  assert.match(beginDrag, /closest\("\[data-drag-handle\]"\)[\s\S]*?setPointerCapture/);
  assert.match(app, /addEventListener\("pointermove", moveItemDrag\)/);
  assert.match(moveDrag, /document\.elementFromPoint\(event\.clientX, event\.clientY\)/);
  assert.match(moveDrag, /getBoundingClientRect\(\)[\s\S]*?height \/ 2[\s\S]*?commitItemMove/);
  assert.match(app, /window\.addEventListener\("pointerup", finishItemDrag\)/);
  assert.match(app, /window\.addEventListener\("pointercancel", finishItemDrag\)/);
  assert.match(app, /document\.addEventListener\("lostpointercapture", finishItemDrag, true\)/);
});

test("ordered editor controls and thumbnails stay bounded on narrow screens", () => {
  const css = read("assets/style.css");

  assert.match(css, /\.item-icon-button\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
  assert.match(css, /\.item-drag-handle\s*\{[^}]*touch-action:\s*none/s);
  assert.doesNotMatch(css, /\.content-item-card\s*\{[^}]*touch-action:\s*none/s);
  assert.match(css, /\.photo-editor-thumbnail\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3[^}]*object-fit:\s*cover/s);
  assert.match(css, /\.content-item-card\.is-dragging/);
  assert.match(css, /\.content-item-card\.is-drop-(?:before|after)/);
  assert.match(css, /@media\s*\(max-width:\s*420px\)[\s\S]*?\.item-editor-actions\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
});

test("editor offers five English fonts and six Korean fonts", () => {
  const index = read("index.html");
  const app = read("assets/app.js");
  const englishSelect = index.match(/<select name="englishFont"[\s\S]*?<\/select>/)?.[0] || "";
  const koreanSelect = index.match(/<select name="koreanFont"[\s\S]*?<\/select>/)?.[0] || "";

  assert.equal((englishSelect.match(/<option /g) || []).length, 5);
  assert.equal((koreanSelect.match(/<option /g) || []).length, 6);
  assert.match(koreanSelect, /value="nanum-gothic"/);
  assert.match(koreanSelect, /value="gmarket-sans"/);
  assert.match(app, /data\.get\("englishFont"\)/);
  assert.match(app, /data\.get\("koreanFont"\)/);
});

test("editor exposes particle size and amount as percentage scales", () => {
  const index = read("index.html");
  const app = read("assets/app.js");

  assert.match(index, /<input[^>]+name="particleScale"[^>]+type="range"[^>]+min="50"[^>]+max="200"[^>]+step="5"/);
  assert.match(index, /<output[^>]+data-particle-scale-output[^>]*>100%<\/output>/);
  assert.match(index, /<input[^>]+name="particleAmount"[^>]+type="range"[^>]+min="25"[^>]+max="500"[^>]+step="25"/);
  assert.match(index, /<output[^>]+data-particle-amount-output[^>]*>100%<\/output>/);
  assert.match(app, /data\.get\("particleScale"\)/);
  assert.match(app, /data\.get\("particleAmount"\)/);
  assert.match(app, /data-particle-scale-output/);
  assert.match(app, /data-particle-amount-output/);
});

test("particle selector groups every effect profile in the editor", () => {
  const index = read("index.html");
  const select = index.match(/<select name="particleEffect"[\s\S]*?<\/select>/)?.[0] || "";

  assert.match(select, /<option value="none">효과 없음<\/option>/);
  assert.equal((select.match(/<optgroup /g) || []).length, 4);
  assert.match(select, /<optgroup label="로맨틱">[\s\S]*?<option value="petals">꽃잎<\/option>[\s\S]*?<option value="hearts">하트<\/option>[\s\S]*?<\/optgroup>/);
  assert.match(select, /<optgroup label="분위기">[\s\S]*?<option value="sparkle">빛가루<\/option>[\s\S]*?<option value="fireflies">반딧불<\/option>[\s\S]*?<option value="bubbles">버블<\/option>[\s\S]*?<\/optgroup>/);
  assert.match(select, /<optgroup label="계절">[\s\S]*?<option value="snow">눈<\/option>[\s\S]*?<option value="leaves">나뭇잎<\/option>[\s\S]*?<\/optgroup>/);
  assert.match(select, /<optgroup label="축하">[\s\S]*?<option value="confetti">컨페티<\/option>[\s\S]*?<\/optgroup>/);

  for (const effect of ["none", "petals", "hearts", "sparkle", "fireflies", "bubbles", "snow", "leaves", "confetti"]) {
    assert.equal((select.match(new RegExp(`value="${effect}"`, "g")) || []).length, 1);
  }
});
