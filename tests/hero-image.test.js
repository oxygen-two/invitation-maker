const test = require("node:test");
const assert = require("node:assert/strict");

const HeroImage = require("../assets/hero-image.js");

test("normalizes hero crop values to stable editor bounds", () => {
  assert.deepEqual(HeroImage.normalizeCrop(), {
    scale: 100,
    positionX: 50,
    positionY: 50
  });
  assert.deepEqual(HeroImage.normalizeCrop({
    scale: 263,
    positionX: -12,
    positionY: 140
  }), {
    scale: 250,
    positionX: 0,
    positionY: 100
  });
  assert.deepEqual(HeroImage.normalizeCrop({
    scale: 132,
    positionX: 33.333,
    positionY: 66.666
  }), {
    scale: 130,
    positionX: 33.33,
    positionY: 66.67
  });
});

test("moves the focal point opposite the pointer drag without leaving its bounds", () => {
  const moved = HeroImage.moveByDrag(
    { scale: 150, positionX: 50, positionY: 50 },
    { deltaX: 40, deltaY: -30, frameWidth: 200, frameHeight: 300 }
  );

  assert.deepEqual(moved, {
    scale: 150,
    positionX: 36.67,
    positionY: 56.67
  });

  assert.deepEqual(HeroImage.moveByDrag(moved, {
    deltaX: -999,
    deltaY: 999,
    frameWidth: 200,
    frameHeight: 300
  }), {
    scale: 150,
    positionX: 100,
    positionY: 0
  });
});

test("ignores invalid drag dimensions and keeps a normalized crop", () => {
  const crop = { scale: 177, positionX: 21.234, positionY: 79.876 };

  assert.deepEqual(HeroImage.moveByDrag(crop, {
    deltaX: 20,
    deltaY: 20,
    frameWidth: 0,
    frameHeight: Number.NaN
  }), {
    scale: 175,
    positionX: 21.23,
    positionY: 79.88
  });
});
