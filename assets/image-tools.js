(function (root) {
  "use strict";

  const SOURCE_LIMIT = 15 * 1024 * 1024;
  const ENCODED_LIMIT = 600 * 1024;
  const MAX_EDGE = 1600;
  const MIN_EDGE = 640;
  const WEBP_TYPE = "image/webp";
  const WEBP_QUALITIES = Object.freeze([0.82, 0.72, 0.62, 0.52]);
  const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", WEBP_TYPE]);

  const errorMessages = Object.freeze({
    type: "JPEG, PNG, WebP 파일만 사용할 수 있습니다.",
    "source-size": "원본 이미지는 15 MiB 이하여야 합니다.",
    decode: "이미지를 읽을 수 없습니다.",
    "encoded-size": "이미지를 600 KiB 이하로 압축할 수 없습니다."
  });

  class ImageError extends Error {
    constructor(code, message = errorMessages[code] || "이미지를 처리할 수 없습니다.") {
      super(message);
      this.name = "ImageError";
      this.code = code;
    }
  }

  const validateFile = (file) => {
    if (!file || !ALLOWED_TYPES.has(file.type)) {
      return { ok: false, code: "type" };
    }
    if (!Number.isFinite(file.size) || file.size < 0 || file.size > SOURCE_LIMIT) {
      return { ok: false, code: "source-size" };
    }
    return { ok: true };
  };

  const buildResizePlan = (width, height, maxEdge = MAX_EDGE) => {
    if (![width, height, maxEdge].every((value) => Number.isFinite(value) && value > 0)) {
      throw new RangeError("Image dimensions and maxEdge must be positive numbers.");
    }

    const scale = Math.min(1, maxEdge / Math.max(width, height));
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
    };
  };

  const decodeImage = (sourceUrl) => new Promise((resolve, reject) => {
    const image = new root.Image();
    image.decoding = "async";
    image.onload = () => {
      image.onload = null;
      image.onerror = null;
      resolve(image);
    };
    image.onerror = () => {
      image.onload = null;
      image.onerror = null;
      reject(new ImageError("decode"));
    };
    image.src = sourceUrl;
  });

  const encodeCanvas = (canvas, quality) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== WEBP_TYPE) {
        reject(new ImageError("decode"));
        return;
      }
      resolve(blob);
    }, WEBP_TYPE, quality);
  });

  const encodeAtSize = async (image, width, height) => {
    const canvas = root.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new ImageError("decode");
    context.drawImage(image, 0, 0, width, height);

    for (const quality of WEBP_QUALITIES) {
      const blob = await encodeCanvas(canvas, quality);
      if (blob.size <= ENCODED_LIMIT) return blob;
    }
    return null;
  };

  const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new root.FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new ImageError("decode"));
    reader.readAsDataURL(blob);
  });

  const compress = async (file) => {
    const validation = validateFile(file);
    if (!validation.ok) throw new ImageError(validation.code);

    let sourceUrl = "";
    try {
      try {
        sourceUrl = root.URL.createObjectURL(file);
      } catch {
        throw new ImageError("decode");
      }

      const image = await decodeImage(sourceUrl);
      let dimensions;
      try {
        dimensions = buildResizePlan(image.naturalWidth, image.naturalHeight);
      } catch {
        throw new ImageError("decode");
      }

      while (true) {
        let blob;
        try {
          blob = await encodeAtSize(image, dimensions.width, dimensions.height);
        } catch (error) {
          if (error instanceof ImageError) throw error;
          throw new ImageError("decode");
        }

        if (blob) {
          return {
            src: await blobToDataUrl(blob),
            width: dimensions.width,
            height: dimensions.height,
            bytes: blob.size,
            mimeType: WEBP_TYPE
          };
        }

        const next = {
          width: Math.max(1, Math.round(dimensions.width * 0.85)),
          height: Math.max(1, Math.round(dimensions.height * 0.85))
        };
        if (Math.max(next.width, next.height) < MIN_EDGE) {
          throw new ImageError("encoded-size");
        }
        dimensions = next;
      }
    } catch (error) {
      if (error instanceof ImageError) throw error;
      throw new ImageError("decode");
    } finally {
      if (sourceUrl) {
        try {
          root.URL.revokeObjectURL(sourceUrl);
        } catch {
          // Revocation is best-effort after the processing boundary has closed.
        }
      }
    }
  };

  const api = {
    SOURCE_LIMIT,
    ENCODED_LIMIT,
    MAX_EDGE,
    ImageError,
    validateFile,
    buildResizePlan,
    compress
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.ImageTools = api;
})(typeof window !== "undefined" ? window : globalThis);
