const { createHash, randomInt } = require("node:crypto");
const { Buffer } = require("node:buffer");
const { normalizeInvitation } = require("../assets/invitation-core.js");
const { DEFAULT_PUBLISHING_CONFIG } = require("./config/publishing.cjs");

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATA_IMAGE_PATTERN = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_STRING_BYTES = 1_000_000;
const MAX_DEPTH = 12;
const MAX_NODES = 3000;
const MAX_ITEMS = 50;
const MAX_PHOTOS = 8;

const badRequest = (message) => {
  const error = new Error(message);
  error.code = "BAD_REQUEST";
  return error;
};

const bodyTooLarge = (message) => {
  const error = new Error(message);
  error.code = "BODY_TOO_LARGE";
  return error;
};

const stableStringify = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stableStringify(value[key])}`
  ).join(",")}}`;
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const createPublicId = (length = DEFAULT_PUBLISHING_CONFIG.publicIdLength) => {
  let id = "";
  for (let index = 0; index < length; index += 1) {
    id += BASE62[randomInt(BASE62.length)];
  }
  return id;
};

const isValidPublicId = (value) => typeof value === "string" && /^[0-9A-Za-z]{22}$/.test(value);

const tokenHashFromHeader = (headerValue = "") => {
  const match = String(headerValue).match(/^Bearer ([A-Za-z0-9_-]+)$/);
  if (!match || !TOKEN_PATTERN.test(match[1])) return null;
  return sha256(`management-token:${match[1]}`);
};

const validateIdempotencyKey = (value) => typeof value === "string" && UUID_PATTERN.test(value);

const inspectJsonShape = (value, path = "$", state = { depth: 0, nodes: 0 }) => {
  state.nodes += 1;
  if (state.nodes > MAX_NODES || state.depth > MAX_DEPTH) throw badRequest(`${path} is too deeply nested`);
  if (value === null) return;
  if (Array.isArray(value)) {
    if (value.length > 80) throw badRequest(`${path} has too many items`);
    state.depth += 1;
    value.forEach((entry, index) => inspectJsonShape(entry, `${path}[${index}]`, state));
    state.depth -= 1;
    return;
  }
  if (typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype) throw badRequest(`${path} must be a plain object`);
    const keys = Object.keys(value);
    if (keys.length > 80) throw badRequest(`${path} has too many keys`);
    state.depth += 1;
    keys.forEach((key) => inspectJsonShape(value[key], `${path}.${key}`, state));
    state.depth -= 1;
    return;
  }
  if (typeof value === "string") {
    if (Buffer.byteLength(value, "utf8") > MAX_STRING_BYTES) throw bodyTooLarge(`${path} string is too large`);
    return;
  }
  if (!["number", "boolean"].includes(typeof value)) throw badRequest(`${path} has unsupported JSON value`);
};

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

const optionalString = (value, path) => {
  if (value === undefined || typeof value === "string") return;
  throw badRequest(`${path} must be a string`);
};

const optionalStringOrNumber = (value, path) => {
  if (value === undefined || value === null || typeof value === "string" || typeof value === "number") return;
  throw badRequest(`${path} must be a string or number`);
};

const optionalBooleanInput = (value, path) => {
  if (value === undefined || typeof value === "boolean" || typeof value === "string") return;
  throw badRequest(`${path} must be a boolean input`);
};

const optionalObjectOrNull = (value, path) => {
  if (value === undefined || value === null || isPlainObject(value)) return;
  throw badRequest(`${path} must be an object or null`);
};

const hasMagicBytes = (kind, buffer) => {
  if (kind === "png") {
    return buffer.length >= 8
      && buffer[0] === 0x89
      && buffer[1] === 0x50
      && buffer[2] === 0x4e
      && buffer[3] === 0x47
      && buffer[4] === 0x0d
      && buffer[5] === 0x0a
      && buffer[6] === 0x1a
      && buffer[7] === 0x0a;
  }
  if (kind === "jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  return kind === "webp"
    && buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
};

const validateImageDataUrl = (value, path) => {
  const raw = String(value || "");
  const match = raw.match(DATA_IMAGE_PATTERN);
  if (!match) throw badRequest(`${path} must be a PNG, JPEG, or WebP data URL`);
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.toString("base64") !== match[2]) throw badRequest(`${path} must use canonical Base64 padding`);
  if (!hasMagicBytes(match[1], buffer)) throw badRequest(`${path} MIME type does not match image bytes`);
};

const validateHeroImage = (heroImage) => {
  optionalObjectOrNull(heroImage, "$.invitation.heroImage");
  if (!heroImage) return;
  optionalString(heroImage.src, "$.invitation.heroImage.src");
  optionalStringOrNumber(heroImage.scale, "$.invitation.heroImage.scale");
  optionalStringOrNumber(heroImage.positionX, "$.invitation.heroImage.positionX");
  optionalStringOrNumber(heroImage.positionY, "$.invitation.heroImage.positionY");
  if (Object.hasOwn(heroImage, "src")) validateImageDataUrl(heroImage.src, "$.invitation.heroImage.src");
};

const validateStopFields = (value, path) => {
  optionalString(value.time, `${path}.time`);
  optionalString(value.label, `${path}.label`);
  optionalString(value.place, `${path}.place`);
  optionalString(value.note, `${path}.note`);
  optionalString(value.mapUrl, `${path}.mapUrl`);
  optionalBooleanInput(value.mapEnabled, `${path}.mapEnabled`);
  optionalStringOrNumber(value.mapLatitude, `${path}.mapLatitude`);
  optionalStringOrNumber(value.mapLongitude, `${path}.mapLongitude`);
  optionalStringOrNumber(value.mapZoom, `${path}.mapZoom`);
};

const validateItem = (item, index) => {
  const path = `$.invitation.items[${index}]`;
  if (!isPlainObject(item)) throw badRequest(`${path} must be an object`);
  optionalString(item.id, `${path}.id`);
  optionalString(item.type, `${path}.type`);
  if (!["course", "photo", "notice", "profile", "link"].includes(item.type)) {
    throw badRequest(`${path}.type must be a supported item type`);
  }
  if (item.type === "course") validateStopFields(item, path);
  if (item.type === "photo") {
    optionalString(item.src, `${path}.src`);
    optionalString(item.alt, `${path}.alt`);
    optionalString(item.caption, `${path}.caption`);
    validateImageDataUrl(item.src, `${path}.src`);
  }
  if (item.type === "notice") {
    optionalString(item.heading, `${path}.heading`);
    optionalString(item.body, `${path}.body`);
  }
  if (item.type === "profile") {
    optionalString(item.name, `${path}.name`);
    optionalString(item.role, `${path}.role`);
    optionalString(item.description, `${path}.description`);
  }
  if (item.type === "link") {
    optionalString(item.label, `${path}.label`);
    optionalString(item.value, `${path}.value`);
    optionalString(item.url, `${path}.url`);
  }
};

const validateStops = (stops) => {
  if (stops === undefined || typeof stops === "string") return;
  if (!Array.isArray(stops)) throw badRequest("$.invitation.stops must be a string or array");
  if (stops.length > MAX_ITEMS) throw badRequest("$.invitation.stops has too many items");
  stops.forEach((stop, index) => {
    if (!isPlainObject(stop)) throw badRequest(`$.invitation.stops[${index}] must be an object`);
    validateStopFields(stop, `$.invitation.stops[${index}]`);
  });
};

const validateKnownInvitationFields = (invitation) => {
  for (const key of [
    "templateId", "layoutFamily", "introEffect", "particleEffect", "particleSize",
    "englishFont", "koreanFont", "naverMapClientId", "title", "subtitle",
    "dateLabel", "host", "location", "mapUrl", "message"
  ]) {
    optionalString(invitation[key], `$.invitation.${key}`);
  }
  optionalStringOrNumber(invitation.particleScale, "$.invitation.particleScale");
  optionalStringOrNumber(invitation.particleAmount, "$.invitation.particleAmount");
  optionalBooleanInput(invitation.mapEnabled, "$.invitation.mapEnabled");
  optionalStringOrNumber(invitation.mapLatitude, "$.invitation.mapLatitude");
  optionalStringOrNumber(invitation.mapLongitude, "$.invitation.mapLongitude");
  optionalStringOrNumber(invitation.mapZoom, "$.invitation.mapZoom");
  validateHeroImage(invitation.heroImage);
  validateStops(invitation.stops);
  if (invitation.items !== undefined) {
    if (!Array.isArray(invitation.items)) throw badRequest("$.invitation.items must be an array");
    if (invitation.items.length > MAX_ITEMS) throw badRequest("$.invitation.items has too many items");
    const photoCount = invitation.items.filter((item) => item?.type === "photo").length;
    if (photoCount > MAX_PHOTOS) throw badRequest("$.invitation.items has too many photos");
    invitation.items.forEach(validateItem);
  }
};

const normalizeForPublishing = ({ body, maxPayloadBytes = DEFAULT_PUBLISHING_CONFIG.maxPayloadBytes }) => {
  if (!isPlainObject(body) || !isPlainObject(body.invitation)) throw badRequest("Missing invitation object");
  inspectJsonShape(body.invitation, "$.invitation");
  validateKnownInvitationFields(body.invitation);

  const contentHash = sha256(stableStringify(body.invitation));
  const normalized = normalizeInvitation(body.invitation);
  const storedInvitation = { ...normalized };
  delete storedInvitation.stops;
  const normalizedBytes = Buffer.byteLength(JSON.stringify(storedInvitation), "utf8");
  if (normalizedBytes > maxPayloadBytes) throw bodyTooLarge("Normalized invitation is too large");
  return { invitation: storedInvitation, contentHash, normalizedBytes };
};

module.exports = {
  createPublicId,
  isValidPublicId,
  normalizeForPublishing,
  sha256,
  stableStringify,
  tokenHashFromHeader,
  validateIdempotencyKey
};
