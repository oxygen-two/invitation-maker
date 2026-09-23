// server/assistant/materialize.cjs
// A ready draft plus its template preset becomes the invitation record the
// publishing API already accepts. Only the preset's look travels (effects,
// fonts, particles); its sample courses, photos and profiles never do.
const LOOK_FIELDS = ["introEffect", "particleEffect", "particleScale", "particleAmount", "englishFont", "koreanFont"];

const googleMapsSearchUrl = (location) => (location
  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
  : "");

// The draft's dateTime is wall time in its zone. Formatting the parts we
// already have (no instant conversion) keeps the label identical whatever
// zone the process runs in.
const formatDateLabel = (dateTime, timeZone, language) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(dateTime || "");
  if (!match) return "";
  const [, year, month, day, hour, minute] = match.map(Number);
  const asUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "ko-KR", {
    timeZone: "UTC",
    year: "numeric", month: language === "en" ? "short" : "long", day: "numeric", weekday: "short",
    hour: "numeric", minute: "2-digit"
  }).format(asUtc);
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
