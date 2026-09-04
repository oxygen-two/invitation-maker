const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ContentOrder = require("../assets/content-order.js");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

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

const loadEditorHarness = ({ maxItems = 4, maxPhotos = 8, compress } = {}) => {
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
      normalizeInvitation: (value) => value,
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

test("saved invitations open through a same-origin viewer", () => {
  const app = read("assets/app.js");
  const viewer = read("viewer.html");

  assert.match(app, /viewer\.html\?id=/);
  assert.doesNotMatch(app, /const openSaved = \(item\) => \{[\s\S]*?URL\.createObjectURL/);
  assert.match(viewer, /assets\/viewer\.js/);
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

test("photo selection processes files sequentially and retains partial success", () => {
  const app = read("assets/app.js");
  const handler = app.match(/const handlePhotoSelection = async \(\) => \{[\s\S]*?\n\};/)?.[0] || "";
  const merge = app.match(/const mergeCompressedPhotos = \(currentItems, compressedPhotos\) => \{[\s\S]*?\n\};/)?.[0] || "";
  const beforeFirstAwait = handler.slice(0, handler.indexOf("await ImageTools.compress(file)"));

  assert.match(handler, /for \(const \[index, file\] of files\.entries\(\)\) \{/);
  assert.match(handler, /await ImageTools\.compress\(file\)/);
  assert.doesNotMatch(beforeFirstAwait, /getItemsData\(\)/);
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
  node("#photo-input").files = [{ name: "one.png" }, { name: "two.png" }];

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
  await upload;

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
  assert.equal(node("#photo-input").value, "");
});

test("photo upload with only commit-time skips leaves the editor untouched", async () => {
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

  assert.equal(compressions, 1);
  assert.equal(contentEditor.renderCount, renderStart);
  assert.deepEqual(Array.from(api.getItemsData(), (item) => item.id), ["photo-a", "photo-b"]);
  assert.match(node("#save-status").textContent, /full\.png: 사진 처리를 완료했지만 사진 제한으로 추가하지 않았습니다/);
  assert.doesNotMatch(node("#save-status").textContent, /사진을 추가했습니다/);
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
