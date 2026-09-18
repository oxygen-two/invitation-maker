const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const HANGUL = /[ㄱ-ㆎ가-힣]/;
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const FILES = [
  "assets/media/image-tools.js", "assets/storage/invitation-storage.js", "assets/integrations/map-location.js",
  "assets/invitation/intro-effects.js", "assets/invitation/core.js", "assets/publishing/publishing.js",
  "assets/publishing/shared-invitation.js", "assets/studio/app.js", "assets/invitation/viewer.js"
];
test("no user-facing Korean literal lives outside the dictionaries", () => {
  const offenders = [];
  for (const file of FILES) {
    const lines = stripComments(fs.readFileSync(path.join(root, file), "utf8")).split("\n");
    lines.forEach((line, index) => { if (HANGUL.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim().slice(0, 80)}`); });
  }
  assert.deepEqual(offenders, [], `Korean literals found:\n${offenders.join("\n")}`);
});
test("image, storage and map errors carry machine codes", () => {
  const { ImageToolsError } = require("../assets/media/image-tools.js");
  assert.equal(new ImageToolsError("type").code, "type");
  const MapLocation = require("../assets/integrations/map-location.js");
  assert.rejects(MapLocation.resolve(null, ""), (error) => error.code === "EMPTY_QUERY");
});

/* The checks above are the plan's gate. The ones below pin down what the codes
   actually are and where the copy for them comes from, so a later task cannot
   quietly reintroduce a literal by inventing a code nothing translates. */

const InvitationI18n = require("../assets/i18n/i18n.js");
InvitationI18n.register("ko", require("../assets/i18n/dictionary-ko.js"));
InvitationI18n.register("en", require("../assets/i18n/dictionary-en.js"));

test("every image-tools failure reports a code whose message is the code itself", async () => {
  const { ImageToolsError, ImageError } = require("../assets/media/image-tools.js");
  assert.equal(ImageToolsError, ImageError, "both names must be the same class");

  for (const code of ["type", "source-size", "decode", "encoded-size"]) {
    const error = new ImageError(code);
    assert.equal(error.code, code);
    assert.equal(error.message, code, "a thrown message must be machine text, never copy");
    assert.doesNotMatch(error.message, HANGUL);
  }
});

test("map-location rejects with a code and never with a sentence", async () => {
  const MapLocation = require("../assets/integrations/map-location.js");
  const rejections = [
    [MapLocation.resolve(null, ""), "EMPTY_QUERY"],
    [MapLocation.resolve(null, "place", "https://naver.me/xAtWyIdS"), "URL_LOCATION_UNAVAILABLE"],
    [MapLocation.resolve(null, "place", "https://example.test/"), "INVALID_MAP_URL"],
    [MapLocation.resolve({}, "place"), "SERVICE_UNAVAILABLE"]
  ];

  for (const [promise, code] of rejections) {
    await assert.rejects(promise, (error) => {
      assert.equal(error.code, code);
      assert.equal(error.message, code);
      return true;
    });
  }
});

test("invitation-storage rejects with IDB codes rather than Korean sentences", async () => {
  const InvitationStorage = require("../assets/storage/invitation-storage.js");

  await assert.rejects(InvitationStorage.open(null), (error) => error.code === "IDB_UNAVAILABLE");

  const request = { onsuccess: null, onerror: null, error: null };
  const promise = InvitationStorage.requestToPromise(request);
  request.onerror();
  await assert.rejects(promise, (error) => error.code === "IDB_REQUEST_FAILED");

  const transaction = { oncomplete: null, onerror: null, onabort: null, error: null };
  const transactionPromise = InvitationStorage.transactionToPromise(transaction);
  transaction.onabort();
  await assert.rejects(transactionPromise, (error) => error.code === "IDB_TRANSACTION_FAILED");
});

test("every intro preset names a dictionary key both languages answer", () => {
  const InvitationIntro = require("../assets/invitation/intro-effects.js");

  for (const [id, preset] of Object.entries(InvitationIntro.PRESETS)) {
    assert.equal("label" in preset, false, `${id} still carries a baked label`);
    assert.match(preset.labelKey, /^effects\.intro/, `${id} has no labelKey`);
    for (const language of InvitationI18n.SUPPORTED) {
      assert.equal(InvitationI18n.hasKey(preset.labelKey, language), true,
        `${language} has no ${preset.labelKey}`);
    }
  }
});

test("the studio has a dictionary key for every image error code it can be handed", () => {
  const app = fs.readFileSync(path.join(root, "assets/studio/app.js"), "utf8");
  const keys = ["errors.image.type", "errors.image.sourceSize", "errors.image.decode",
    "errors.image.encodedSize", "errors.image.generic"];

  for (const key of keys) {
    for (const language of InvitationI18n.SUPPORTED) {
      assert.equal(InvitationI18n.hasKey(key, language), true, `${language} has no ${key}`);
    }
  }
  assert.match(app, /describeImageError/, "app.js must translate the code at the point of display");
});

test("a fresh invitation is written in the reader's language, not always Korean", () => {
  const InvitationCore = require("../assets/invitation/core.js");

  const korean = InvitationCore.createDefaultInvitation("ko");
  const english = InvitationCore.createDefaultInvitation("en");

  assert.equal(korean.title, InvitationI18n.t("invitation.defaultTitle", undefined, "ko"));
  assert.equal(english.title, InvitationI18n.t("invitation.defaultTitle", undefined, "en"));
  assert.doesNotMatch(english.title, HANGUL);
  assert.doesNotMatch(english.subtitle, HANGUL);
  assert.doesNotMatch(english.location, HANGUL);
  assert.doesNotMatch(english.message, HANGUL);
  assert.deepEqual(english.stops.map((stop) => stop.label), ["MEET", "CAFE", "WALK", "DINNER"]);
  for (const stop of english.stops) {
    assert.doesNotMatch(stop.place, HANGUL);
    assert.doesNotMatch(stop.note, HANGUL);
  }
});

test("normalizing an empty invitation fills the blanks in the active language", () => {
  const InvitationCore = require("../assets/invitation/core.js");
  const previous = InvitationI18n.getLanguage();

  try {
    InvitationI18n.setLanguage("en");
    const english = InvitationCore.normalizeInvitation({});
    assert.doesNotMatch(english.title, HANGUL);
    assert.doesNotMatch(english.location, HANGUL);
    assert.doesNotMatch(english.items.map((item) => `${item.place}${item.note}`).join(""), HANGUL);

    InvitationI18n.setLanguage("ko");
    const korean = InvitationCore.normalizeInvitation({});
    assert.match(korean.title, HANGUL);
  } finally {
    InvitationI18n.setLanguage(previous);
  }
});
