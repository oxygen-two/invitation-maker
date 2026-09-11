(function exposeHeroImage(root, factory) {
  const heroImage = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = heroImage;
  }

  root.HeroImage = heroImage;
})(typeof globalThis === "object" ? globalThis : this, function createHeroImage() {
  const MIN_SCALE = 100;
  const MAX_SCALE = 250;
  const SCALE_STEP = 5;
  const DEFAULT_CROP = Object.freeze({
    scale: MIN_SCALE,
    positionX: 50,
    positionY: 50
  });

  const clamp = (value, min, max, fallback) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  };

  const roundPosition = (value) => Math.round(value * 100) / 100;

  const normalizeCrop = (value = {}) => {
    const boundedScale = clamp(value.scale, MIN_SCALE, MAX_SCALE, DEFAULT_CROP.scale);

    return {
      scale: Math.round(boundedScale / SCALE_STEP) * SCALE_STEP,
      positionX: roundPosition(clamp(value.positionX, 0, 100, DEFAULT_CROP.positionX)),
      positionY: roundPosition(clamp(value.positionY, 0, 100, DEFAULT_CROP.positionY))
    };
  };

  const moveByDrag = (crop, drag = {}) => {
    const normalized = normalizeCrop(crop);
    const frameWidth = Number(drag.frameWidth);
    const frameHeight = Number(drag.frameHeight);
    const deltaX = Number(drag.deltaX);
    const deltaY = Number(drag.deltaY);

    if (!Number.isFinite(frameWidth) || frameWidth <= 0
      || !Number.isFinite(frameHeight) || frameHeight <= 0
      || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
      return normalized;
    }

    const scaleFactor = normalized.scale / 100;
    return normalizeCrop({
      ...normalized,
      positionX: normalized.positionX - (deltaX / frameWidth) * 100 / scaleFactor,
      positionY: normalized.positionY - (deltaY / frameHeight) * 100 / scaleFactor
    });
  };

  return {
    DEFAULT_CROP,
    MAX_SCALE,
    MIN_SCALE,
    SCALE_STEP,
    moveByDrag,
    normalizeCrop
  };
});
