const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ENCODED_LIMIT,
  MAX_EDGE,
  SOURCE_LIMIT,
  ImageError,
  buildResizePlan,
  compress,
  validateFile
} = require("../assets/image-tools.js");

test("validateFile accepts JPEG, PNG, and WebP at the source-size boundary", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    assert.equal(validateFile({ type, size: 15 * 1024 * 1024 }).ok, true);
  }
});

test("validateFile rejects active and unknown image formats", () => {
  assert.deepEqual(validateFile({ type: "image/svg+xml", size: 100 }), {
    ok: false,
    code: "type"
  });
  assert.deepEqual(validateFile({ type: "image/gif", size: 100 }), {
    ok: false,
    code: "type"
  });
});

test("validateFile rejects files above 15 MiB before decoding", () => {
  assert.deepEqual(validateFile({ type: "image/png", size: 15 * 1024 * 1024 + 1 }), {
    ok: false,
    code: "source-size"
  });
});

test("buildResizePlan bounds landscape images while preserving aspect ratio", () => {
  assert.deepEqual(buildResizePlan(3200, 1200, 1600), {
    width: 1600,
    height: 600
  });
});

test("buildResizePlan bounds portrait images while preserving aspect ratio", () => {
  assert.deepEqual(buildResizePlan(1200, 3200, 1600), {
    width: 600,
    height: 1600
  });
});

test("buildResizePlan uses the 1600px default without enlarging smaller images", () => {
  assert.deepEqual(buildResizePlan(800, 600), { width: 800, height: 600 });
  assert.deepEqual(buildResizePlan(2400, 1200), { width: 1600, height: 800 });
});

test("ImageError preserves the editor-facing error code", () => {
  const error = new ImageError("encoded-size", "too large");

  assert.equal(error.name, "ImageError");
  assert.equal(error.code, "encoded-size");
  assert.equal(error.message, "too large");
});

test("compress normalizes unavailable browser decoding to a typed error", async () => {
  const file = new Blob(["not-an-image"], { type: "image/jpeg" });

  await assert.rejects(compress(file), (error) => {
    assert.ok(error instanceof ImageError);
    assert.equal(error.code, "decode");
    return true;
  });
});

test("image tools expose the encoded limit and browser compression boundary", () => {
  assert.equal(SOURCE_LIMIT, 15 * 1024 * 1024);
  assert.equal(ENCODED_LIMIT, 600 * 1024);
  assert.equal(MAX_EDGE, 1600);
  assert.equal(typeof compress, "function");
});

test("the browser loads ImageTools before app.js", () => {
  const index = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");
  const imageToolsIndex = index.indexOf('<script src="assets/image-tools.js"></script>');
  const appIndex = index.indexOf('<script src="assets/app.js"></script>');

  assert.notEqual(imageToolsIndex, -1);
  assert.ok(imageToolsIndex < appIndex);
});
