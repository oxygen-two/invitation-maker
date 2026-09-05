const test = require("node:test");
const assert = require("node:assert/strict");
const TemplateArt = require("../assets/template-art.js");

const decorated = [
  "midnight-cinema",
  "color-pop",
  "memory-film",
  "gallery-notice",
  "sunny-classroom",
  "little-forest",
  "modern-vow",
  "blue-porcelain",
  "peony-tribute",
  "red-silk",
  "golden-years",
  "first-chapter",
  "little-star"
];

test("returns only allowlisted WebP data URLs", () => {
  for (const id of decorated) {
    assert.match(TemplateArt.getDataUrl(id), /^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/);
  }

  assert.equal(TemplateArt.getDataUrl("unknown"), "");
});

test("keeps every embedded decoration within its 80 KiB source budget", () => {
  for (const id of decorated) {
    const payload = TemplateArt.getDataUrl(id).split(",")[1];
    assert.ok(Buffer.from(payload, "base64").byteLength <= 80 * 1024, id);
  }
});
