(function exposePresetApplication(root, factory) {
  const presetApplication = factory(root.InvitationCore);

  if (typeof module === "object" && module.exports) {
    module.exports = presetApplication;
  }

  root.PresetApplication = presetApplication;
})(typeof globalThis === "object" ? globalThis : this, function createPresetApplication(browserInvitationCore) {
  const InvitationCore = (() => {
    if (browserInvitationCore) return browserInvitationCore;
    if (typeof module === "object" && module.exports) {
      return require("./invitation-core.js");
    }
    return null;
  })();

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const isPlainObject = (value) =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

  const normalizeInvitation = (value) => {
    if (!InvitationCore || typeof InvitationCore.normalizeInvitation !== "function") {
      throw new Error("InvitationCore.normalizeInvitation is required");
    }
    return InvitationCore.normalizeInvitation(value);
  };

  const assertValidPreset = (preset) => {
    if (!isPlainObject(preset)
      || !String(preset.id || "").trim()
      || !String(preset.familyId || "").trim()
      || !isPlainObject(preset.defaults)) {
      throw new Error("invalid preset");
    }
  };

  const snapshot = (invitation) => normalizeInvitation(clone(invitation || {}));

  const isDirty = (current, baseline) =>
    JSON.stringify(snapshot(current)) !== JSON.stringify(snapshot(baseline));

  const prepare = ({ current, preset, naverMapClientId = "" } = {}) => {
    assertValidPreset(preset);
    const previous = snapshot(current);
    const defaults = clone(preset.defaults);
    const next = snapshot({
      ...defaults,
      templateId: String(preset.id).trim(),
      layoutFamily: String(preset.familyId).trim(),
      naverMapClientId
    });

    return { previous, next };
  };

  return Object.freeze({
    isDirty,
    prepare,
    snapshot
  });
});
