// server/assistant/materialize.cjs
// A ready draft plus its template preset becomes the invitation record the
// publishing API already accepts. Only the preset's look travels (effects,
// fonts, particles); its sample courses, photos and profiles never do.
const I18n = require("../../assets/i18n/i18n.js");

const LOOK_FIELDS = ["introEffect", "particleEffect", "particleScale", "particleAmount", "englishFont", "koreanFont"];

const googleMapsSearchUrl = (location) => (location
  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
  : "");

// The studio derives a dateLabel from the picked dateTime with this same
// function, so an assistant-made invitation reads exactly like a studio one.
// It assembles the label from Intl parts and preserves the wall time, so the
// result is the same in every process zone.
const formatDateLabel = (dateTime, timeZone, language) => {
  if (!dateTime) return "";
  return I18n.formatSampleDate(dateTime, language === "en" ? "en" : "ko") || "";
};

const materializeInvitation = (draft, { catalog }) => {
  const preset = catalog.resolveTemplate(draft.templateId, draft.occasion);
  const invitation = { templateId: preset.id, layoutFamily: preset.familyId };
  for (const field of LOOK_FIELDS) {
    if (preset.defaults?.[field] !== undefined) invitation[field] = preset.defaults[field];
  }
  Object.assign(invitation, {
    title: draft.title,
    subtitle: draft.subtitle || "",
    dateLabel: formatDateLabel(draft.dateTime, draft.timeZone, draft.language),
    dateTime: draft.dateTime || "",
    timeZone: draft.timeZone,
    host: draft.host || "",
    location: draft.location || "",
    message: draft.message || "",
    mapProvider: "google",
    mapEnabled: false,
    mapUrl: googleMapsSearchUrl(draft.location),
    items: []
  });
  return { invitation, language: draft.language };
};

module.exports = { formatDateLabel, googleMapsSearchUrl, materializeInvitation };
