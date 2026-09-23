const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const TemplateArt = require("../assets/invitation/template-art.js");
const buildTemplateArt = require("../scripts/build-template-art.js");

const decorated = [
  "silver-afterglow",
  "peach-table",
  "bloom-portrait",
  "botanical",
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
  "little-star",
  "baby-garden",
  "home-warm"
];
const sourceFiles = [
  "silver-afterglow.webp",
  "peach-table.webp",
  "bloom-portrait.webp",
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
const artDir = path.resolve(__dirname, "../assets/invitation/template-art");
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

test("garden and photo wedding use the approved full-photo floral art", () => {
  const expected = `data:image/webp;base64,${fs.readFileSync(path.join(artDir, "romantic-story-cover.webp")).toString("base64")}`;
  assert.equal(TemplateArt.getDataUrl("botanical"), expected);
  assert.equal(TemplateArt.getDataUrl("modern-vow"), expected);
  // The housewarming photo story reuses the same floral cover rather than
  // shipping another binary decoration.
  assert.equal(TemplateArt.getDataUrl("home-warm"), expected);
});

test("the garden baby shower reuses the woodland decoration", () => {
  const expected = `data:image/webp;base64,${fs.readFileSync(path.join(artDir, "little-forest.webp")).toString("base64")}`;
  assert.equal(TemplateArt.getDataUrl("baby-garden"), expected);
  assert.equal(TemplateArt.getDataUrl("little-forest"), expected);
});

test("typographic ticket and poster omit unused built-in image payloads", () => {
  for (const id of ["midnight-cinema", "color-pop"]) {
    assert.equal(TemplateArt.getDataUrl(id), "");
  }
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

/* The error pages are the one generated artifact in this repository that has
   never gone stale, and the reason is this shape of test: regenerate in
   memory, compare against what is committed. template-art.js and
   template-art-index.js are generated from the .webp files beside them and
   had no such guard, so swapping a decoration without re-running the
   generator shipped a module that disagreed with its own sources. */
test("the committed template art modules are exactly what the generator produces", () => {
  for (const [target, contents] of buildTemplateArt.render()) {
    assert.equal(fs.readFileSync(target, "utf8"), contents, `${path.basename(target)} is stale`);
  }

  // CI runs this same flag, so a failure here is that failure arriving earlier.
  const output = execFileSync(
    process.execPath,
    [path.resolve(__dirname, "../scripts/build-template-art.js"), "--check"],
    { encoding: "utf8" }
  );
  assert.match(output, /Verified 2 template art modules/);
});

test("--check fails loudly on a module the generator would no longer produce", () => {
  const target = buildTemplateArt.INDEX_FILE;
  const original = fs.readFileSync(target, "utf8");
  try {
    fs.writeFileSync(target, original.replace("const BASE =", "const BASE_DRIFTED ="));
    assert.throws(
      () => buildTemplateArt.main(["--check"]),
      /Outdated generated file: assets\/invitation\/template-art-index\.js/
    );
  } finally {
    fs.writeFileSync(target, original);
  }
  // And the restore really restored: nothing this test did can leak into the
  // `git diff --exit-code` step that follows it in CI.
  assert.equal(fs.readFileSync(target, "utf8"), original);
});
