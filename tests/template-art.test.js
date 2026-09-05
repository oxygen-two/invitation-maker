const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
const sourceFiles = [
  "blue-porcelain.webp",
  "color-pop.webp",
  "first-chapter-stars.webp",
  "gallery-notice.webp",
  "golden-years.webp",
  "little-forest.webp",
  "peony-tribute.webp",
  "red-silk.webp",
  "romantic-story-cover.webp",
  "sunny-classroom.webp",
  "wedding-paper.webp"
];
const artDir = path.resolve(__dirname, "../assets/template-art");
const readWebpDimensions = (buffer) => {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP");

  for (let offset = 12; offset + 8 <= buffer.length;) {
    const chunk = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (chunk === "VP8 ") {
      assert.equal(buffer.toString("hex", dataOffset + 3, dataOffset + 6), "9d012a");
      return {
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff
      };
    }
    if (chunk === "VP8X") {
      return {
        width: 1 + buffer.readUIntLE(dataOffset + 4, 3),
        height: 1 + buffer.readUIntLE(dataOffset + 7, 3)
      };
    }
    offset = dataOffset + size + (size % 2);
  }

  throw new Error("Unsupported WebP container");
};

test("returns only allowlisted WebP data URLs", () => {
  for (const id of decorated) {
    assert.match(TemplateArt.getDataUrl(id), /^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/);
  }

  assert.equal(TemplateArt.getDataUrl("unknown"), "");
});

test("exposes exactly the decorated template ID allowlist", () => {
  assert.deepEqual([...TemplateArt.templateIds].sort(), [...decorated].sort());
});

test("keeps every embedded decoration within its 80 KiB source budget", () => {
  for (const id of decorated) {
    const payload = TemplateArt.getDataUrl(id).split(",")[1];
    assert.ok(Buffer.from(payload, "base64").byteLength <= 80 * 1024, id);
  }
});

test("source WebP decorations are the expected 1200 by 900 canvas", () => {
  for (const file of sourceFiles) {
    assert.deepEqual(readWebpDimensions(fs.readFileSync(path.join(artDir, file))), {
      width: 1200,
      height: 900
    }, file);
  }
});
