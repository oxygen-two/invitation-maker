const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

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

  assert.match(handler, /for \(const file of files\) \{/);
  assert.match(handler, /await ImageTools\.compress\(file\)/);
  assert.match(handler, /InvitationCore\.MAX_PHOTOS/);
  assert.match(handler, /InvitationCore\.MAX_ITEMS/);
  assert.match(handler, /try \{[\s\S]*?items\.push\([\s\S]*?\}\s*catch/s);
  assert.match(handler, /file\.name/);
  assert.match(handler, /dom\.photoInput\.value = ""/);
  assert.match(handler, /data-photo-field='caption'/);
  assert.doesNotMatch(handler, /Promise\.all/);
  assert.doesNotMatch(handler, /URL\.createObjectURL/);
});

test("buttons and pointer drag share the immutable move commit", () => {
  const app = read("assets/app.js");
  const commit = app.match(/const commitItemMove = \(fromIndex, toIndex[\s\S]*?\n\};/)?.[0] || "";
  const beginDrag = app.match(/const beginItemDrag = \(event\) => \{[\s\S]*?\n\};/)?.[0] || "";
  const moveDrag = app.match(/const moveItemDrag = \(event\) => \{[\s\S]*?\n\};/)?.[0] || "";

  assert.match(commit, /ContentOrder\.move\(items, fromIndex, toIndex\)/);
  assert.match(commit, /renderContentEditor\(/);
  assert.match(commit, /renderPreview\(\)/);
  assert.match(commit, /\.focus\(\)/);
  assert.match(app, /data-item-action="up"[\s\S]*?data-item-action="down"/);
  assert.match(app, /const toIndex = action === "up" \? index - 1 : index \+ 1/);
  assert.match(app, /commitItemMove\(index, toIndex/);
  assert.match(app, /addEventListener\("pointerdown", beginItemDrag\)/);
  assert.match(beginDrag, /closest\("\[data-drag-handle\]"\)[\s\S]*?setPointerCapture/);
  assert.match(app, /addEventListener\("pointermove", moveItemDrag\)/);
  assert.match(moveDrag, /document\.elementFromPoint\(event\.clientX, event\.clientY\)/);
  assert.match(moveDrag, /getBoundingClientRect\(\)[\s\S]*?height \/ 2[\s\S]*?commitItemMove/);
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    assert.match(app, new RegExp(`addEventListener\\("${eventName}"`));
  }
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
