const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const {
  ENCODED_LIMIT,
  MAX_EDGE,
  SOURCE_LIMIT,
  ImageError,
  buildResizePlan,
  compress,
  validateFile
} = require("../assets/image-tools.js");

const imageToolsPath = path.resolve(__dirname, "..", "assets", "image-tools.js");
const imageToolsSource = fs.readFileSync(imageToolsPath, "utf8");

const createBrowserHarness = ({
  naturalWidth = 3200,
  naturalHeight = 1600,
  encodedSizes = [1024],
  imageFailure = false,
  contextFailure = false,
  drawFailure = false,
  blobFailure = false,
  readerFailure = false
} = {}) => {
  const calls = {
    canvases: [],
    draws: [],
    qualities: [],
    createdUrls: [],
    revokedUrls: []
  };
  let encodedIndex = 0;

  class FakeImage {
    constructor() {
      this.naturalWidth = naturalWidth;
      this.naturalHeight = naturalHeight;
    }

    set src(value) {
      this.currentSrc = value;
      queueMicrotask(() => {
        if (imageFailure) this.onerror();
        else this.onload();
      });
    }
  }

  class FakeFileReader {
    readAsDataURL(blob) {
      queueMicrotask(() => {
        if (readerFailure) {
          this.onerror();
          return;
        }
        this.result = `data:${blob.type};base64,dGVzdA==`;
        this.onload();
      });
    }
  }

  const document = {
    createElement(tagName) {
      assert.equal(tagName, "canvas");
      const canvas = {
        width: 0,
        height: 0,
        getContext(contextType) {
          assert.equal(contextType, "2d");
          if (contextFailure) return null;
          return {
            drawImage(image, x, y, width, height) {
              if (drawFailure) throw new Error("draw failed");
              calls.draws.push({ canvas, image, x, y, width, height });
            }
          };
        },
        toBlob(callback, mimeType, quality) {
          calls.qualities.push(quality);
          if (blobFailure) {
            queueMicrotask(() => callback(null));
            return;
          }
          if (encodedIndex >= encodedSizes.length) {
            throw new Error("Missing encoded-size fixture");
          }
          const size = encodedSizes[encodedIndex];
          encodedIndex += 1;
          queueMicrotask(() => callback({ size, type: mimeType }));
        }
      };
      calls.canvases.push(canvas);
      return canvas;
    }
  };

  const url = {
    createObjectURL(file) {
      calls.createdUrls.push(file);
      return "blob:image-tools-test";
    },
    revokeObjectURL(sourceUrl) {
      calls.revokedUrls.push(sourceUrl);
    }
  };
  const window = { document, FileReader: FakeFileReader, Image: FakeImage, URL: url };
  const context = vm.createContext({ window });
  vm.runInContext(imageToolsSource, context, { filename: imageToolsPath });

  return {
    ImageTools: window.ImageTools,
    calls,
    file: { type: "image/jpeg", size: 1024 }
  };
};

const expectImageError = async (promise, ImageErrorClass, code) => {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ImageErrorClass);
    assert.equal(error.code, code);
    return true;
  });
};

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

test("compress returns bounded WebP fields and accepts exactly 600 KiB", async () => {
  const { ImageTools, calls, file } = createBrowserHarness({
    encodedSizes: [600 * 1024]
  });

  const result = await ImageTools.compress(file);

  assert.deepEqual({ ...result }, {
    src: "data:image/webp;base64,dGVzdA==",
    width: 1600,
    height: 800,
    bytes: 600 * 1024,
    mimeType: "image/webp"
  });
  assert.deepEqual(calls.revokedUrls, ["blob:image-tools-test"]);
});

test("compress attempts each bounded WebP quality in order", async () => {
  const overLimit = 600 * 1024 + 1;
  const { ImageTools, calls, file } = createBrowserHarness({
    encodedSizes: [overLimit, overLimit, overLimit, 600 * 1024]
  });

  await ImageTools.compress(file);

  assert.deepEqual(calls.qualities, [0.82, 0.72, 0.62, 0.52]);
  assert.equal(calls.canvases.length, 1);
});

test("compress redraws on a fresh canvas after reducing dimensions by 0.85", async () => {
  const overLimit = 600 * 1024 + 1;
  const { ImageTools, calls, file } = createBrowserHarness({
    encodedSizes: [overLimit, overLimit, overLimit, overLimit, 1024]
  });

  const result = await ImageTools.compress(file);

  assert.deepEqual(
    calls.draws.map(({ width, height }) => ({ width, height })),
    [{ width: 1600, height: 800 }, { width: 1360, height: 680 }]
  );
  assert.equal(calls.canvases.length, 2);
  assert.notEqual(calls.canvases[0], calls.canvases[1]);
  assert.deepEqual({ width: result.width, height: result.height }, { width: 1360, height: 680 });
});

test("compress rejects before drawing below a 640px longest edge", async () => {
  const overLimit = 600 * 1024 + 1;
  const { ImageTools, calls, file } = createBrowserHarness({
    naturalWidth: 800,
    naturalHeight: 400,
    encodedSizes: Array(8).fill(overLimit)
  });

  await expectImageError(ImageTools.compress(file), ImageTools.ImageError, "encoded-size");

  assert.deepEqual(
    calls.draws.map(({ width, height }) => ({ width, height })),
    [{ width: 800, height: 400 }, { width: 680, height: 340 }]
  );
  assert.deepEqual(calls.qualities, [0.82, 0.72, 0.62, 0.52, 0.82, 0.72, 0.62, 0.52]);
  assert.deepEqual(calls.revokedUrls, ["blob:image-tools-test"]);
});

test("compress normalizes image decoding failure and revokes its object URL", async () => {
  const { ImageTools, calls, file } = createBrowserHarness({ imageFailure: true });

  await expectImageError(ImageTools.compress(file), ImageTools.ImageError, "decode");

  assert.deepEqual(calls.revokedUrls, ["blob:image-tools-test"]);
});

test("compress normalizes a missing Canvas context and revokes its object URL", async () => {
  const { ImageTools, calls, file } = createBrowserHarness({ contextFailure: true });

  await expectImageError(ImageTools.compress(file), ImageTools.ImageError, "decode");

  assert.deepEqual(calls.revokedUrls, ["blob:image-tools-test"]);
});

test("compress normalizes Canvas drawing failure and revokes its object URL", async () => {
  const { ImageTools, calls, file } = createBrowserHarness({ drawFailure: true });

  await expectImageError(ImageTools.compress(file), ImageTools.ImageError, "decode");

  assert.deepEqual(calls.revokedUrls, ["blob:image-tools-test"]);
});

test("compress normalizes toBlob failure and revokes its object URL", async () => {
  const { ImageTools, calls, file } = createBrowserHarness({ blobFailure: true });

  await expectImageError(ImageTools.compress(file), ImageTools.ImageError, "decode");

  assert.deepEqual(calls.revokedUrls, ["blob:image-tools-test"]);
});

test("compress normalizes FileReader failure and revokes its object URL", async () => {
  const { ImageTools, calls, file } = createBrowserHarness({ readerFailure: true });

  await expectImageError(ImageTools.compress(file), ImageTools.ImageError, "decode");

  assert.deepEqual(calls.revokedUrls, ["blob:image-tools-test"]);
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
