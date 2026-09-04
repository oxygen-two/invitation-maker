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
  assert.match(css, /\.stop-editor-grid\s*>\s*\.full\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(css, /\.stop-map-settings\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
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
