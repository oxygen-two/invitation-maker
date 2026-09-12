const STORAGE_KEY = "invitation-maker.saved";
const MAX_SAVED = 20;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAP_LOAD_TIMEOUT_MS = 10000;
const PREVIEW_FRAME_TIMEOUT_MS = 5000;
// Decorative typography, not copy: these are the course labels printed on the
// invitation itself, in the same letterspaced English the templates use for
// INVITATION / DATE / PLACE. Translating them would break the layouts they
// were set for, and they read as convention on a Korean invitation already.
const COURSE_LABEL_PRESETS = ["MEET", "CAFE", "WALK", "DINNER", "DRINK", "ACTIVITY"];

/* Every user-facing string in this file goes through t(). The engine is read
   off the global rather than imported because app.js is also executed inside
   a bare vm context by the contract tests; the key-returning fallback keeps a
   missing engine from turning into a page full of "undefined". */
const I18n = globalThis.InvitationI18n;
const t = (key, values) => I18n?.t(key, values) ?? String(key);
const percent = (value) => I18n?.formatPercent(value) ?? `${value}%`;

/* The language an invitation rendered HERE is built in.

   Everything the studio renders — the live preview, the gallery thumbnails,
   the file the author downloads — is the author's work in progress, so its
   baked chrome follows the studio. Read at call time rather than captured,
   because the switcher can move between one render and the next.

   Re-rendering somebody's ALREADY FINISHED file is the opposite case and does
   not use this: see standaloneOptionsFor(). */
const studioChrome = () => ({ language: I18n?.getLanguage?.() });

/* A file that already exists — a legacy library record being migrated, or an
   HTML the author is re-importing — is rebuilt in the language it was built
   in, read back out of its own <html lang>. Rebuilding it in today's studio
   language would silently re-word a document the author considered done, and
   would make their downloaded copy and their library copy disagree. */
const standaloneOptionsFor = (html) => ({
  language: InvitationCore.readStandaloneLanguage?.(html) ?? I18n?.DEFAULT_LANGUAGE
});

const ITEM_LABEL_KEYS = Object.freeze({
  course: "content.typeCourse",
  photo: "content.typePhoto",
  notice: "content.typeNotice",
  profile: "content.typeProfile",
  link: "content.typeLink"
});
const itemTypeLabel = (type) => t(ITEM_LABEL_KEYS[type] || ITEM_LABEL_KEYS.course);
const ITEM_FOCUS_SELECTORS = Object.freeze({
  course: '[data-course-field="time"]',
  notice: '[data-notice-field="heading"]',
  profile: '[data-profile-field="name"]',
  link: '[data-link-field="label"]'
});

const state = {
  catalog: { occasions: [], templates: [] },
  // The catalog as fetched, before any language overlay. Kept so switching
  // language re-localizes the gallery without another network round trip.
  rawData: null,
  localizedDefault: null,
  templates: [],
  activeOccasion: "date",
  pendingTemplateId: "royal",
  activeTemplate: "royal",
  appliedBaseline: {},
  undoSnapshot: null,
  naverMapClientId: "",
  heroImage: null,
  invitation: {},
  saved: []
};

let naverMapsPromise;
let previewMapsPromise;
let previewMapsNamespace;
let previewRenderId = 0;
let previewMapTimer;
let pendingPreviewMapKey = null;
let photoSelectionPending = false;
let heroImageSelectionPending = false;
let heroImageDragState = null;
let saveWritePending = false;
const previewMapInstances = new WeakMap();
const mobileViewScrollPositions = { editor: 0, preview: 0, library: 0 };
let mobileViewScrollCaptured = false;
const mapLookupVersions = new Map();
let templateThumbnailObserver;
let draftReady = false;
let draftWrite = Promise.resolve();
let draftRevision = 0;
let personalDraft = false;
let analyticsEditRevision = 0;
const analyticsPageRevision = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

// Never pass form values or invitation objects to an analytics transport.
const trackAnalytics = (event, properties = {}, dedupKey = event) => {
  try {
    window.InvitationAnalytics?.track(event, {
      template_id: state.activeTemplate,
      occasion: state.activeOccasion,
      ...properties
    }, { dedupKey });
  } catch { /* Analytics must not interrupt authoring. */ }
};
const markAnalyticsEdit = () => {
  analyticsEditRevision += 1;
  trackAnalytics("editing_started", { field_group: "editor" }, "editing");
};
const trackAnalyticsCompletion = (invitation) => {
  const items = invitation.items || [];
  trackAnalytics("invitation_completed", {
    item_count: items.length,
    photo_count: items.filter(item => item.type === "photo").length,
    has_map: Boolean(invitation.mapEnabled || items.some(item => item.mapEnabled)),
    has_hero_image: Boolean(invitation.heroImage),
    has_intro_effect: Boolean(invitation.introEffect && invitation.introEffect !== "none")
  }, "completed");
};

const saveDraft = () => {
  if (!draftReady) return;
  const invitation = PresetApplication.snapshot(state.invitation);
  const revision = ++draftRevision;
  const edited = analyticsEditRevision > 0;
  const status = document.querySelector('#draft-status');
  status.textContent = t('status.draftSaving');
  draftWrite = draftWrite.then(() => InvitationStorage.putDraft(invitation)).then(() => {
    if (edited) trackAnalytics("draft_saved", {}, "draft");
    if (revision === draftRevision) status.textContent = t('status.draftSaved');
  }).catch(() => {
    if (revision === draftRevision) status.textContent = t('status.draftFailed');
  });
};

const syncStudioHeading = (stage = document.body.dataset.studioStage) => {
  document.querySelector('#studio-heading').textContent =
    t(stage === 'gallery' ? 'maker.headingGallery' : 'maker.headingEdit');
};

const setStudioStage = (stage) => {
  if (hasPendingEditorOperation()) return;
  document.body.dataset.studioStage = stage;
  if (stage !== 'finish') {
    dom.downloadDialog?.close?.();
    dom.shareDialog?.close?.();
  }
  document.querySelectorAll('.studio-steps button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.studioStage === stage)));
  syncStudioHeading(stage);
  if (stage !== 'gallery') {
    state.pendingTemplateId = state.activeTemplate;
    renderTemplates();
    renderPreview();
  }
  setMobileView(stage === 'finish' ? 'preview' : stage === 'library' ? 'library' : 'editor');
  window.scrollTo(0, 0);
  if (stage === 'gallery') requestAnimationFrame(syncTemplateThumbnailScales);
};

const dom = {
  form: document.querySelector("#invitation-form"),
  occasions: document.querySelector("#occasion-list"),
  templates: document.querySelector("#template-list"),
  templateSummary: document.querySelector("#template-summary"),
  applyTemplate: document.querySelector("#apply-template-button"),
  undoTemplate: document.querySelector("#undo-template-button"),
  startTemplate: document.querySelector("#start-template-button"),
  keepDraft: document.querySelector("#keep-draft-button"),
  toggleTemplates: document.querySelector("#toggle-templates-button"),
  pendingPreview: document.querySelector("#pending-preview-notice"),
  pendingPreviewText: document.querySelector("#pending-preview-text"),
  previewApply: document.querySelector("#preview-apply-button"),
  contentEditor: document.querySelector("#content-editor"),
  addCourse: document.querySelector("#add-course-button"),
  addPhoto: document.querySelector("#add-photo-button"),
  addItemButtons: [...document.querySelectorAll("[data-add-item]")],
  photoInput: document.querySelector("#photo-input"),
  heroImageEditor: document.querySelector("#hero-image-editor"),
  heroImageFrame: document.querySelector("#hero-image-frame"),
  heroImagePreview: document.querySelector("#hero-image-preview"),
  heroImageEmpty: document.querySelector("#hero-image-empty"),
  heroImageInput: document.querySelector("#hero-image-input"),
  heroImageSelect: document.querySelector("#hero-image-select-button"),
  heroImageAdjustments: document.querySelector("#hero-image-adjustments"),
  heroImageScale: document.querySelector("#hero-image-scale"),
  heroImageScaleOutput: document.querySelector("#hero-image-scale-output"),
  heroImageReset: document.querySelector("#hero-image-reset-button"),
  heroImageRemove: document.querySelector("#hero-image-remove-button"),
  heroImageStatus: document.querySelector("#hero-image-status"),
  preview: document.querySelector("#preview"),
  introEffect: document.querySelector('[name="introEffect"]'),
  replayIntro: document.querySelector("#replay-intro-button"),
  download: document.querySelector("#download-button"),
  save: document.querySelector("#save-button"),
  saveStatus: document.querySelector("#save-status"),
  openDownloadDialog: document.querySelector("#open-download-dialog-button"),
  openShareDialog: document.querySelector("#open-share-dialog-button"),
  downloadDialog: document.querySelector("#download-dialog"),
  shareDialog: document.querySelector("#share-dialog"),
  upload: document.querySelector("#html-upload"),
  uploadStatus: document.querySelector("#upload-status"),
  savedList: document.querySelector("#saved-list"),
  particleScaleOutput: document.querySelector("[data-particle-scale-output]"),
  particleAmountOutput: document.querySelector("[data-particle-amount-output]"),
  mobileTabs: [...document.querySelectorAll(".mobile-view-tabs button[data-mobile-view]")]
};

/* Preview isolation -------------------------------------------------------
   #preview is an <iframe>. Rendering the invitation into the studio document
   put four <h1>s and fourteen <header>s on one screen (the invitation brings
   its own) and let studio CSS leak into what the author believed was the
   finished card. The frame is seeded ONCE with the real standalone document —
   the same InvitationCore.buildStandaloneHtml a guest receives and the export
   writes — and every later render patches only the body inside it. Nothing
   reloads on a keystroke, so there is no flash and no scroll reset.

   `previewFrame` is null when #preview is not an iframe (the fake-DOM contract
   harness), and every reference below then falls back to the element itself,
   which is exactly the pre-iframe behaviour. */
const previewFrame = dom.preview?.tagName === "IFRAME" ? dom.preview : null;
let previewDoc = null;
let previewHost = previewFrame ? null : dom.preview;
let previewStyleTarget = previewFrame ? null : dom.preview;
let previewScroller = previewFrame ? null : dom.preview;

const handlePreviewClick = (event) => {
  const retryButton = event.target.closest?.("[data-retry-map]");
  if (!retryButton) return;
  const panel = retryButton.closest("[data-map-key]");
  const canvas = panel?.querySelector("[data-dynamic-map]");
  const status = panel?.querySelector("[data-map-status]");
  if (!canvas || !status) return;

  delete canvas.dataset.mapState;
  status.textContent = t("map.loading");
  naverMapsPromise = undefined;
  previewMapsPromise = undefined;
  previewRenderId += 1;
  mountPreviewMaps(previewRenderId);
};

const mountPreviewFrame = () => new Promise((resolve) => {
  if (!previewFrame) {
    dom.preview.addEventListener("click", handlePreviewClick);
    resolve(false);
    return;
  }
  // init() awaits this before its first render, so a frame that never loads
  // must not take the whole editor down with it — time out and carry on with a
  // blank preview rather than a blank studio.
  const settle = (value) => { clearTimeout(timeoutId); resolve(value); };
  const timeoutId = setTimeout(() => settle(false), PREVIEW_FRAME_TIMEOUT_MS);
  previewFrame.addEventListener("load", () => {
    const frameDocument = previewFrame.contentDocument;
    if (!frameDocument?.body) {
      settle(false);
      return;
    }
    // The seeded body only existed to make buildStandaloneHtml produce a
    // complete <head> (fonts, palette, template and particle CSS). Swap it for
    // an empty render root so patches never touch the head again.
    const root = frameDocument.createElement("div");
    root.id = "preview-root";
    frameDocument.body.replaceChildren(root);
    // Intro overlays are played on demand rather than baked into the seed, so
    // their stylesheet has to be added the same way the studio document gets it.
    InvitationIntro.ensureStyles(frameDocument);
    frameDocument.addEventListener("click", handlePreviewClick);
    previewDoc = frameDocument;
    previewHost = root;
    previewStyleTarget = frameDocument.body;
    previewScroller = frameDocument.scrollingElement || frameDocument.documentElement;
    settle(true);
  }, { once: true });
  previewFrame.srcdoc = InvitationCore.buildStandaloneHtml({
    introEffect: "none",
    particleEffect: "none",
    mapEnabled: false,
    items: []
  }, studioChrome());
});

const sanitizeFilename = (value) =>
  String(value || "invitation")
    .trim()
    .replace(/[^\w가-힣-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "invitation";

const escapeAttribute = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
})[char]);

// A record's createdAt is a machine timestamp, so it is formatted for the
// reader's language rather than printed as stored.
const formatSavedDate = (value) => I18n?.formatDateTime(value, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
}) ?? t("library.unknownDate");

const createItemId = (type) => {
  if (globalThis.crypto?.randomUUID) return `${type}-${globalThis.crypto.randomUUID()}`;
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const createEmptyItem = (type) => {
  switch (type) {
    case "course":
      return {
        id: createItemId("course"),
        type: "course",
        time: "",
        label: "MEET",
        place: "",
        note: "",
        mapUrl: "",
        mapEnabled: false,
        mapLatitude: "",
        mapLongitude: "",
        mapZoom: 16
      };
    case "notice":
      return {
        id: createItemId("notice"),
        type: "notice",
        heading: "",
        body: ""
      };
    case "profile":
      return {
        id: createItemId("profile"),
        type: "profile",
        name: "",
        role: "",
        description: ""
      };
    case "link":
      return {
        id: createItemId("link"),
        type: "link",
        label: "",
        value: "",
        url: ""
      };
    default:
      return null;
  }
};

const getItemsData = () => [...dom.contentEditor.querySelectorAll("[data-item-card]")].map((card) => {
  const id = card.dataset.itemId;
  const type = card.dataset.itemType;

  switch (type) {
    case "photo":
      return {
        id,
        type,
        src: card.querySelector("[data-photo-thumbnail]").getAttribute("src") || "",
        alt: card.querySelector('[data-photo-field="alt"]').value,
        caption: card.querySelector('[data-photo-field="caption"]').value
      };
    case "notice": {
      const value = (field) => card.querySelector(`[data-notice-field="${field}"]`).value;
      return {
        id,
        type,
        heading: value("heading"),
        body: value("body")
      };
    }
    case "profile": {
      const value = (field) => card.querySelector(`[data-profile-field="${field}"]`).value;
      return {
        id,
        type,
        name: value("name"),
        role: value("role"),
        description: value("description")
      };
    }
    case "link": {
      const value = (field) => card.querySelector(`[data-link-field="${field}"]`).value;
      return {
        id,
        type,
        label: value("label"),
        value: value("value"),
        url: value("url")
      };
    }
    case "course":
    default: {
      const value = (field) => card.querySelector(`[data-course-field="${field}"]`).value;
      return {
        id,
        type,
        time: value("time"),
        label: value("label"),
        place: value("place"),
        note: value("note"),
        mapUrl: value("mapUrl"),
        mapEnabled: card.querySelector('[data-course-field="mapEnabled"]').checked,
        mapLatitude: value("mapLatitude"),
        mapLongitude: value("mapLongitude"),
        mapZoom: value("mapZoom")
      };
    }
  }
});

const renderItemActions = (item, index, itemCount) => {
  const type = itemTypeLabel(item.type);
  return `
    <div class="item-editor-actions">
      <button class="item-icon-button" type="button" data-item-action="up" aria-disabled="${index === 0}" aria-label="${escapeAttribute(t("content.moveUp", { type }))}" title="${escapeAttribute(t("content.moveUpTitle"))}">↑</button>
      <button class="item-icon-button" type="button" data-item-action="down" aria-disabled="${index === itemCount - 1}" aria-label="${escapeAttribute(t("content.moveDown", { type }))}" title="${escapeAttribute(t("content.moveDownTitle"))}">↓</button>
      <button class="item-icon-button remove-item-button" type="button" data-item-action="delete" aria-label="${escapeAttribute(t("content.removeItem", { type }))}" title="${escapeAttribute(t("content.removeItemTitle"))}">×</button>
    </div>
  `;
};

const renderCourseFields = (item, bodyId, isOpen) => {
  const checked = item.mapEnabled ? " checked" : "";
  const hidden = item.mapEnabled ? "" : " hidden";
  const label = String(item.label || "").trim();
  const labelPreset = COURSE_LABEL_PRESETS.includes(label) ? label : label ? "custom" : "MEET";
  return `
    <div id="${bodyId}" class="course-editor-grid" data-item-body${isOpen ? "" : " hidden"}>
      <label>
        <span>${escapeAttribute(t("content.courseTime"))}</span>
        <input data-course-field="time" type="time" step="600" value="${escapeAttribute(item.time)}">
      </label>
      <label>
        <span>${escapeAttribute(t("content.courseLabel"))}</span>
        <select data-course-label-preset aria-label="${escapeAttribute(t("content.courseLabelSelect"))}">
          ${COURSE_LABEL_PRESETS.map((preset) => `<option value="${preset}"${labelPreset === preset ? " selected" : ""}>${preset}</option>`).join("")}
          <option value="custom"${labelPreset === "custom" ? " selected" : ""}>${escapeAttribute(t("content.courseLabelCustom"))}</option>
        </select>
      </label>
      <label class="full custom-label-field" data-custom-label-field${labelPreset === "custom" ? "" : " hidden"}>
        <span>${escapeAttribute(t("content.courseLabelCustom"))}</span>
        <input data-course-field="label" type="text" value="${escapeAttribute(labelPreset === "custom" ? label : labelPreset)}" placeholder="${escapeAttribute(t("content.courseLabelPlaceholder"))}" autocomplete="off">
      </label>
      <label class="full">
        <span>${escapeAttribute(t("content.coursePlace"))}</span>
        <input data-course-field="place" type="text" value="${escapeAttribute(item.place)}" autocomplete="off">
      </label>
      <label class="full">
        <span>${escapeAttribute(t("content.courseNote"))}</span>
        <textarea data-course-field="note" rows="2">${escapeAttribute(item.note)}</textarea>
      </label>
      <label class="full">
        <span>${escapeAttribute(t("content.courseMapUrl"))}</span>
        <input data-course-field="mapUrl" type="url" value="${escapeAttribute(item.mapUrl)}" placeholder="https://map.naver.com/" autocomplete="off">
      </label>
      <label class="full checkbox-field">
        <input data-course-field="mapEnabled" type="checkbox"${checked}>
        <span>${escapeAttribute(t("content.courseMapEnabled"))}</span>
      </label>
      <div class="full map-settings stop-map-settings" data-course-map-settings${hidden}>
        <input data-course-field="mapLatitude" type="hidden" value="${escapeAttribute(item.mapLatitude ?? "")}">
        <input data-course-field="mapLongitude" type="hidden" value="${escapeAttribute(item.mapLongitude ?? "")}">
        <input data-course-field="mapZoom" type="hidden" value="${escapeAttribute(item.mapZoom || 16)}">
        <small class="stop-map-message" data-course-map-message role="status" aria-live="polite"></small>
      </div>
    </div>
  `;
};

const syncCourseLabelPreset = (select) => {
  const card = select.closest("[data-item-card]");
  const labelInput = card?.querySelector('[data-course-field="label"]');
  const customField = card?.querySelector("[data-custom-label-field]");
  if (!card || !labelInput || !customField) return;

  const usesCustomLabel = select.value === "custom";
  customField.hidden = !usesCustomLabel;
  if (usesCustomLabel) {
    if (COURSE_LABEL_PRESETS.includes(labelInput.value)) labelInput.value = "";
    labelInput.focus();
  } else {
    labelInput.value = select.value;
  }

  const time = card.querySelector('[data-course-field="time"]').value || t("content.timeUnset");
  card.querySelector("[data-item-secondary-summary]").textContent = `${time} · ${labelInput.value || "PLACE"}`;
};

const renderPhotoFields = (item, bodyId, isOpen) => `
  <div id="${bodyId}" class="photo-editor-grid" data-item-body${isOpen ? "" : " hidden"}>
    <img class="photo-editor-thumbnail" data-photo-thumbnail src="${escapeAttribute(item.src)}" alt="${escapeAttribute(item.alt || t("content.photoThumbnailAlt"))}">
    <label class="full">
      <span>${escapeAttribute(t("content.photoAlt"))}</span>
      <input data-photo-field="alt" type="text" value="${escapeAttribute(item.alt)}" autocomplete="off">
    </label>
    <label class="full">
      <span>${escapeAttribute(t("content.photoCaption"))}</span>
      <textarea data-photo-field="caption" rows="2">${escapeAttribute(item.caption)}</textarea>
    </label>
  </div>
`;

const renderNoticeFields = (item, bodyId, isOpen) => `
  <div id="${bodyId}" class="notice-editor-grid" data-item-body${isOpen ? "" : " hidden"}>
    <label class="full">
      <span>${escapeAttribute(t("content.noticeHeading"))}</span>
      <input data-notice-field="heading" type="text" value="${escapeAttribute(item.heading)}" autocomplete="off">
    </label>
    <label class="full">
      <span>${escapeAttribute(t("content.noticeBody"))}</span>
      <textarea data-notice-field="body" rows="2">${escapeAttribute(item.body)}</textarea>
    </label>
  </div>
`;

const renderProfileFields = (item, bodyId, isOpen) => `
  <div id="${bodyId}" class="profile-editor-grid" data-item-body${isOpen ? "" : " hidden"}>
    <label>
      <span>${escapeAttribute(t("content.profileName"))}</span>
      <input data-profile-field="name" type="text" value="${escapeAttribute(item.name)}" autocomplete="off">
    </label>
    <label>
      <span>${escapeAttribute(t("content.profileRole"))}</span>
      <input data-profile-field="role" type="text" value="${escapeAttribute(item.role)}" autocomplete="off">
    </label>
    <label class="full">
      <span>${escapeAttribute(t("content.profileDescription"))}</span>
      <textarea data-profile-field="description" rows="2">${escapeAttribute(item.description)}</textarea>
    </label>
  </div>
`;

const renderLinkFields = (item, bodyId, isOpen) => `
  <div id="${bodyId}" class="link-editor-grid" data-item-body${isOpen ? "" : " hidden"}>
    <label>
      <span>${escapeAttribute(t("content.linkLabel"))}</span>
      <input data-link-field="label" type="text" value="${escapeAttribute(item.label)}" autocomplete="off">
    </label>
    <label>
      <span>${escapeAttribute(t("content.linkValue"))}</span>
      <input data-link-field="value" type="text" value="${escapeAttribute(item.value)}" autocomplete="off">
    </label>
    <label class="full">
      <span>${escapeAttribute(t("content.linkUrl"))}</span>
      <input data-link-field="url" type="url" value="${escapeAttribute(item.url)}" autocomplete="off">
    </label>
  </div>
`;

const renderItemFields = (item, bodyId, isOpen) => {
  switch (item.type) {
    case "photo":
      return renderPhotoFields(item, bodyId, isOpen);
    case "notice":
      return renderNoticeFields(item, bodyId, isOpen);
    case "profile":
      return renderProfileFields(item, bodyId, isOpen);
    case "link":
      return renderLinkFields(item, bodyId, isOpen);
    case "course":
    default:
      return renderCourseFields(item, bodyId, isOpen);
  }
};

const hasPendingEditorOperation = () =>
  photoSelectionPending || heroImageSelectionPending || saveWritePending;

const mountPublishing = () => {
  globalThis.InvitationPublishing?.mount?.({
    getValue: getFormData,
    validate: () => validateForExport() && confirmReplyContact(),
    isBusy: hasPendingEditorOperation
  });
};

const syncTemplateAvailability = () => {
  const busy = hasPendingEditorOperation();
  const pending = globalThis.TemplateCatalog?.getPreset?.(state.catalog, state.pendingTemplateId);
  dom.occasions.querySelectorAll("[data-occasion-id]").forEach((button) => { button.disabled = busy; });
  dom.templates.querySelectorAll("[data-template-id]").forEach((button) => { button.disabled = busy; });
  dom.applyTemplate.disabled = busy || !pending;
  document.querySelector('#gallery-create').disabled = busy || !pending;
  document.querySelector('#gallery-back').disabled = busy;
  document.querySelector('#gallery-selection').textContent = pending
    ? t('gallery.dockSelected', { name: pending.name })
    : t('gallery.dockEmpty');
  dom.undoTemplate.disabled = busy || !state.undoSnapshot;
  const needsApply = Boolean(pending && pending.id !== state.activeTemplate);
  dom.startTemplate.hidden = !needsApply;
  dom.keepDraft.hidden = !needsApply;
  dom.download.hidden = needsApply;
  dom.save.hidden = needsApply;
  dom.openDownloadDialog.hidden = needsApply;
  dom.startTemplate.disabled = busy;
  dom.keepDraft.disabled = busy;
  dom.previewApply.disabled = busy;
  dom.startTemplate.textContent = pending ? t("gallery.startNamed", { name: pending.name }) : t("gallery.start");
  // A card already badged as in-use sitting next to a button offering to apply
  // it reads as a contradiction. When the selection IS the applied design the
  // same button becomes the next step instead — go write the invitation.
  const applyLabel = needsApply ? t("gallery.apply") : t("gallery.continueToEditor");
  dom.applyTemplate.textContent = applyLabel;
  document.querySelector('#gallery-create').textContent = applyLabel;
  dom.pendingPreview.hidden = !needsApply;
  dom.pendingPreviewText.textContent = needsApply
    ? t("preview.pendingTemplate", { name: pending.name }) : "";
};

const syncAddItemAvailability = (items) => {
  const photoCount = items.filter((item) => item.type === "photo").length;
  const itemsFull = items.length >= InvitationCore.MAX_ITEMS;
  dom.addCourse.disabled = itemsFull;
  dom.addItemButtons.forEach((button) => { button.disabled = itemsFull; });
  dom.addPhoto.disabled = photoSelectionPending
    || heroImageSelectionPending
    || saveWritePending
    || itemsFull
    || photoCount >= InvitationCore.MAX_PHOTOS;
  dom.download.disabled = photoSelectionPending || heroImageSelectionPending;
  dom.save.disabled = photoSelectionPending || heroImageSelectionPending || saveWritePending;
  dom.openDownloadDialog.disabled = photoSelectionPending || heroImageSelectionPending;
  syncHeroImageAvailability();
  syncTemplateAvailability();
};

const getItemPrimarySummary = (item) => {
  switch (item.type) {
    case "photo":
      return item.caption || item.alt || t("content.summaryPhoto");
    case "notice":
      return item.heading || item.body || t("content.summaryNotice");
    case "profile":
      return item.name || item.role || t("content.summaryProfile");
    case "link":
      return item.label || item.value || item.url || t("content.summaryLink");
    case "course":
    default:
      return item.place || t("content.summaryCourse");
  }
};

const getItemSecondarySummary = (item) => {
  switch (item.type) {
    case "photo":
      return "PHOTO";
    case "notice":
      return "NOTICE";
    case "profile":
      return item.role || "PROFILE";
    case "link":
      return item.value || item.url || "LINK";
    case "course":
    default:
      return `${item.time || t("content.timeUnset")} · ${item.label || "PLACE"}`;
  }
};

const getDeleteItemName = (item, index) => {
  const position = index + 1;
  switch (item.type) {
    case "photo":
      return item.caption.trim() || item.alt.trim() || t("content.fallbackPhoto", { index: position });
    case "notice":
      return item.heading.trim() || item.body.trim() || t("content.fallbackNotice", { index: position });
    case "profile":
      return item.name.trim() || item.role.trim() || t("content.fallbackProfile", { index: position });
    case "link":
      return item.label.trim() || item.value.trim() || item.url.trim() || t("content.fallbackLink", { index: position });
    case "course":
    default:
      return item.place.trim() || t("content.fallbackCourse", { index: position });
  }
};

const captureItemPositions = () => new Map(
  [...dom.contentEditor.querySelectorAll("[data-item-card]")]
    .map((card) => [card.dataset.itemId, card.getBoundingClientRect().top])
);

const animateItemReorder = (previousPositions) => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  dom.contentEditor.querySelectorAll("[data-item-card]").forEach((card) => {
    if (typeof card.animate !== "function") return;
    const previousTop = previousPositions.get(card.dataset.itemId);
    if (!Number.isFinite(previousTop)) return;

    const offset = previousTop - card.getBoundingClientRect().top;
    if (!offset) return;

    card.animate(
      [
        { transform: `translateY(${offset}px)` },
        { transform: "translateY(0)" }
      ],
      {
        duration: 400,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)"
      }
    );
  });
};

const renderContentEditor = (items = [], openId = items[0]?.id) => {
  syncAddItemAvailability(items);

  if (!items.length) {
    dom.contentEditor.innerHTML = `<p class="content-empty">${escapeAttribute(t("content.empty"))}</p>`;
    return;
  }

  dom.contentEditor.innerHTML = items.map((item, index) => {
    const isOpen = item.id === openId;
    const bodyId = `content-editor-body-${index}`;
    const typeLabel = itemTypeLabel(item.type);
    const primarySummary = getItemPrimarySummary(item);
    const secondarySummary = getItemSecondarySummary(item);
    return `
      <article class="content-item-card ${escapeAttribute(item.type)}-editor-card${isOpen ? " is-open" : ""}" data-item-card data-item-id="${escapeAttribute(item.id)}" data-item-type="${item.type}">
        <div class="content-item-header">
          <span class="content-item-position" aria-hidden="true">${index + 1}</span>
          <button class="content-item-toggle" type="button" data-toggle-item aria-expanded="${isOpen}" aria-controls="${bodyId}">
            <span class="content-item-heading">
              <strong>${escapeAttribute(typeLabel)} · <span data-item-secondary-summary>${escapeAttribute(secondarySummary)}</span></strong>
              <span data-item-summary>${escapeAttribute(primarySummary)}</span>
            </span>
          </button>
          ${renderItemActions(item, index, items.length)}
        </div>
        ${renderItemFields(item, bodyId, isOpen)}
      </article>
    `;
  }).join("");
};

const setItemExpanded = (card, isOpen) => {
  const body = card.querySelector("[data-item-body]");
  const toggle = card.querySelector("[data-toggle-item]");
  body.hidden = !isOpen;
  card.classList.toggle("is-open", isOpen);
  toggle.setAttribute("aria-expanded", String(isOpen));
};

const findItemCard = (itemId) => [...dom.contentEditor.querySelectorAll("[data-item-card]")]
  .find((card) => card.dataset.itemId === itemId);

const restoreMobileScroll = (top) => {
  const target = Math.max(0, Number(top) || 0);
  window.scrollTo({ top: target, behavior: "auto" });
  globalThis.requestAnimationFrame?.(() => {
    window.scrollTo({ top: target, behavior: "auto" });
  });
};

const rememberMobileViewScroll = () => {
  const currentView = document.body.dataset.mobileView || "editor";
  if (!["editor", "preview", "library"].includes(currentView)) return;
  if (!window.matchMedia("(max-width: 900px)").matches) return;
  mobileViewScrollPositions[currentView] = window.scrollY || 0;
  mobileViewScrollCaptured = true;
};

const setMobileView = (view, shouldFocus = false) => {
  if (!["editor", "preview", "library"].includes(view)) return;
  const isMobile = window.matchMedia("(max-width: 900px)").matches;
  const currentView = document.body.dataset.mobileView || "editor";
  if (isMobile && (!mobileViewScrollCaptured || currentView === view)) {
    mobileViewScrollPositions[currentView] = window.scrollY || 0;
  }
  mobileViewScrollCaptured = false;
  document.body.dataset.mobileView = view;
  dom.mobileTabs.forEach((button) => {
    const isActive = button.dataset.mobileView === view;
    button.setAttribute("aria-pressed", String(isActive));
    if (isActive && shouldFocus) button.focus();
  });
  if (isMobile) restoreMobileScroll(mobileViewScrollPositions[view]);
};

const parseInvitationHtml = (html) => {
  const documentNode = new DOMParser().parseFromString(html, "text/html");
  const payloads = documentNode.querySelectorAll('#invitation-data[type="application/json"]');
  if (payloads.length !== 1) throw new Error("unsupported invitation file");
  const [payload] = payloads;
  const data = JSON.parse(payload.textContent);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("invalid invitation payload");
  }
  if (Array.isArray(data.stops) && data.stops.length > InvitationCore.MAX_STOPS) {
    throw new Error("too many course cards");
  }
  return InvitationCore.normalizeInvitation({
    ...data,
    naverMapClientId: state.naverMapClientId
  });
};

const getFormData = () => {
  const data = new FormData(dom.form);
  const activePreset = globalThis.TemplateCatalog?.getPreset?.(state.catalog, state.activeTemplate);
  return InvitationCore.normalizeInvitation({
    templateId: state.activeTemplate,
    heroImage: state.heroImage,
    layoutFamily: activePreset?.familyId,
    introEffect: data.get("introEffect"),
    particleEffect: data.get("particleEffect"),
    particleScale: data.get("particleScale"),
    particleAmount: data.get("particleAmount"),
    englishFont: data.get("englishFont"),
    koreanFont: data.get("koreanFont"),
    naverMapClientId: state.naverMapClientId,
    title: data.get("title"),
    subtitle: data.get("subtitle"),
    dateLabel: data.get("dateLabel"),
    host: data.get("host"),
    location: data.get("location"),
    mapUrl: data.get("mapUrl"),
    mapEnabled: data.has("mapEnabled"),
    mapLatitude: data.get("mapLatitude"),
    mapLongitude: data.get("mapLongitude"),
    mapZoom: data.get("mapZoom"),
    message: data.get("message"),
    items: getItemsData()
  });
};

const syncParticleOutputs = () => {
  const scale = dom.form.elements.particleScale.value;
  const amount = dom.form.elements.particleAmount.value;
  dom.particleScaleOutput.textContent = percent(scale);
  dom.particleScaleOutput.setAttribute("aria-label", t("editor.particleScaleValue", { value: percent(scale) }));
  dom.particleAmountOutput.textContent = percent(amount);
  dom.particleAmountOutput.setAttribute("aria-label", t("editor.particleAmountValue", { value: percent(amount) }));
};

const syncIntroReplayAvailability = () => {
  dom.replayIntro.disabled = InvitationIntro.normalizeEffect(dom.introEffect.value) === "none";
};

const syncHeroImageAvailability = () => {
  const busy = heroImageSelectionPending || photoSelectionPending || saveWritePending;
  dom.heroImageSelect.disabled = busy;
  dom.heroImageInput.disabled = busy;
  dom.heroImageScale.disabled = busy || !state.heroImage;
  dom.heroImageReset.disabled = busy || !state.heroImage;
  dom.heroImageRemove.disabled = busy || !state.heroImage;
};

const syncHeroImageEditor = () => {
  const heroImage = state.heroImage;
  const activePreset = globalThis.TemplateCatalog?.getPreset?.(state.catalog, state.activeTemplate);
  dom.heroImageEditor.dataset.layoutFamily = activePreset?.familyId || "romantic-story";
  dom.heroImagePreview.hidden = !heroImage;
  dom.heroImageEmpty.hidden = Boolean(heroImage);
  dom.heroImageAdjustments.hidden = !heroImage;
  dom.heroImageSelect.textContent = t(heroImage ? "hero.change" : "hero.add");

  if (heroImage) {
    const crop = HeroImage.normalizeCrop(heroImage);
    state.heroImage = { src: heroImage.src, ...crop };
    dom.heroImagePreview.setAttribute("src", heroImage.src);
    dom.heroImagePreview.setAttribute(
      "style",
      `--hero-image-scale:${crop.scale / 100};--hero-image-x:${crop.positionX}%;--hero-image-y:${crop.positionY}%`
    );
    dom.heroImageScale.value = String(crop.scale);
    dom.heroImageScaleOutput.textContent = percent(crop.scale);
    dom.heroImageScaleOutput.setAttribute("aria-label", t("hero.scaleValue", { value: percent(crop.scale) }));
  } else {
    dom.heroImagePreview.removeAttribute?.("src");
    dom.heroImagePreview.removeAttribute?.("style");
    dom.heroImageScale.value = String(HeroImage.MIN_SCALE);
    dom.heroImageScaleOutput.textContent = percent(HeroImage.MIN_SCALE);
  }

  syncHeroImageAvailability();
};

const fillForm = (invitation) => {
  state.heroImage = invitation.heroImage ? { ...invitation.heroImage } : null;
  dom.form.elements.introEffect.value = invitation.introEffect || "none";
  dom.form.elements.particleEffect.value = invitation.particleEffect || "none";
  dom.form.elements.particleScale.value = invitation.particleScale || 100;
  dom.form.elements.particleAmount.value = invitation.particleAmount || 100;
  dom.form.elements.englishFont.value = invitation.englishFont || "cormorant-garamond";
  dom.form.elements.koreanFont.value = invitation.koreanFont || "gowun-batang";
  dom.form.elements.title.value = invitation.title || "";
  dom.form.elements.subtitle.value = invitation.subtitle || "";
  dom.form.elements.dateLabel.value = invitation.dateLabel || "";
  dom.form.elements.host.value = invitation.host || "";
  dom.form.elements.location.value = invitation.location || "";
  dom.form.elements.mapUrl.value = invitation.mapUrl || "";
  dom.form.elements.mapEnabled.checked = Boolean(invitation.mapEnabled);
  dom.form.elements.mapLatitude.value = invitation.mapLatitude ?? "";
  dom.form.elements.mapLongitude.value = invitation.mapLongitude ?? "";
  dom.form.elements.mapZoom.value = invitation.mapZoom || 16;
  dom.form.elements.message.value = invitation.message || "";
  syncParticleOutputs();
  syncIntroReplayAvailability();
  syncHeroImageEditor();
  renderContentEditor(invitation.items);
};

const syncMapSettingsVisibility = () => {
  const representativeEnabled = dom.form.elements.mapEnabled.checked;
  dom.form.querySelector("[data-map-settings]").hidden = !representativeEnabled;
  const representativeMessage = dom.form.querySelector("[data-map-message]");
  const representativeCoordinatesValid = dom.form.elements.mapLatitude.value !== ""
    && dom.form.elements.mapLongitude.value !== "";
  if (!representativeEnabled) {
    representativeMessage.textContent = "";
    delete representativeMessage.dataset.mapLookupState;
  } else if (representativeCoordinatesValid && representativeMessage.dataset.mapLookupState !== "loading") {
    representativeMessage.textContent = t("map.ready");
    representativeMessage.dataset.mapLookupState = "ready";
  } else if (!dom.form.elements.location.value.trim()) {
    representativeMessage.textContent = t("map.empty");
    representativeMessage.dataset.mapLookupState = "empty";
  } else if (!representativeMessage.dataset.mapLookupState || representativeMessage.dataset.mapLookupState === "ready") {
    representativeMessage.textContent = t("map.pending");
    representativeMessage.dataset.mapLookupState = "pending";
  }
  dom.contentEditor.querySelectorAll('[data-item-type="course"]').forEach((card) => {
    const checkbox = card.querySelector('[data-course-field="mapEnabled"]');
    card.querySelector("[data-course-map-settings]").hidden = !checkbox.checked;
    const latitude = card.querySelector('[data-course-field="mapLatitude"]');
    const longitude = card.querySelector('[data-course-field="mapLongitude"]');
    const time = card.querySelector('[data-course-field="time"]');
    const place = card.querySelector('[data-course-field="place"]');
    const hasCourseContent = ["time", "place", "note", "mapUrl"]
      .some((field) => card.querySelector(`[data-course-field="${field}"]`).value.trim())
      || checkbox.checked;
    time.required = hasCourseContent;
    place.required = hasCourseContent;
    const message = card.querySelector("[data-course-map-message]");
    const hasValidCoordinates = latitude.value !== "" && longitude.value !== "";
    if (!checkbox.checked) {
      message.textContent = "";
      delete message.dataset.mapLookupState;
    } else if (hasValidCoordinates && message.dataset.mapLookupState !== "loading") {
      message.textContent = t("map.ready");
      message.dataset.mapLookupState = "ready";
    } else if (!place.value.trim()) {
      message.textContent = t("map.empty");
      message.dataset.mapLookupState = "empty";
    } else if (!message.dataset.mapLookupState || message.dataset.mapLookupState === "ready") {
      message.textContent = t("map.pending");
      message.dataset.mapLookupState = "pending";
    }
  });
};

const revealPendingPreviewMap = () => {
  if (!pendingPreviewMapKey || !previewHost) return;
  const panel = previewHost.querySelector(`[data-map-key="${pendingPreviewMapKey}"]`);
  if (!panel) return;

  // offsetTop is relative to the nearest positioned ancestor (the invitation
  // card), so measure against the scroll port itself — the frame's scrolling
  // element once the preview lives in its own document. A document scroller's
  // own rect is already offset by the scroll, so only an element port needs its
  // top subtracted; doing it for both would count the scroll twice.
  const port = previewScroller || previewHost;
  const isDocumentPort = Boolean(previewDoc)
    && (port === previewDoc.scrollingElement || port === previewDoc.documentElement);
  const portTop = isDocumentPort || typeof port.getBoundingClientRect !== "function"
    ? 0
    : port.getBoundingClientRect().top;
  const panelRect = panel.getBoundingClientRect();
  const offsetWithinPort = panelRect.top - portTop + (port.scrollTop || 0);
  const centeredTop = offsetWithinPort - Math.max(20, (port.clientHeight - panelRect.height) / 2);
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  port.scrollTo({ top: Math.max(0, centeredTop), behavior });
  pendingPreviewMapKey = null;
};

const setMapFallback = (canvas, status, canRetry = false) => {
  if (canvas) canvas.dataset.mapState = "fallback";
  const statusElement = status || canvas?.nextElementSibling;
  if (!statusElement) return;

  statusElement.textContent = t("map.unavailable");
  if (canRetry) {
    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "map-retry-button";
    retryButton.dataset.retryMap = "";
    retryButton.textContent = t("map.retry");
    statusElement.append(retryButton);
  }
};

window.navermap_authFailure = () => {
  previewHost?.querySelectorAll("[data-dynamic-map]").forEach((canvas) => setMapFallback(canvas));
};

const loadNaverMaps = () => {
  if (window.naver?.maps) return Promise.resolve(window.naver.maps);
  if (!state.naverMapClientId) return Promise.reject(new Error("NAVER Maps Client ID is missing"));
  if (naverMapsPromise) return naverMapsPromise;

  naverMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    let timeoutId;
    const finish = (callback, value) => {
      clearTimeout(timeoutId);
      script.onload = null;
      script.onerror = null;
      script.remove();
      callback(value);
    };
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(state.naverMapClientId)}&submodules=geocoder`;
    script.async = true;
    script.onload = () => window.naver?.maps
      ? finish(resolve, window.naver.maps)
      : finish(reject, new Error("NAVER Maps failed to initialize"));
    script.onerror = () => finish(reject, new Error("NAVER Maps failed to load"));
    timeoutId = setTimeout(
      () => finish(reject, new Error("NAVER Maps timed out")),
      MAP_LOAD_TIMEOUT_MS
    );
    document.head.append(script);
  });

  naverMapsPromise.catch(() => {
    naverMapsPromise = undefined;
  });

  return naverMapsPromise;
};

/* Preview maps load their SDK inside the frame rather than borrowing the
   studio's. The studio copy stays for address lookup (it is the one carrying
   the geocoder submodule), but a map is an interactive surface: driving one
   from the parent window would leave its drag and wheel handlers bound to the
   parent document while the pointer events happen in the frame. Loading it in
   the frame is also what the standalone export does, so the preview and the
   guest's invitation run the same code. */
const loadPreviewNaverMaps = () => {
  if (!previewDoc) return loadNaverMaps().then((maps) => { previewMapsNamespace = maps; return maps; });

  const frameWindow = previewDoc.defaultView;
  if (frameWindow?.naver?.maps) {
    previewMapsNamespace = frameWindow.naver.maps;
    return Promise.resolve(previewMapsNamespace);
  }
  if (!state.naverMapClientId) return Promise.reject(new Error("NAVER Maps Client ID is missing"));
  if (previewMapsPromise) return previewMapsPromise;

  previewMapsPromise = new Promise((resolve, reject) => {
    if (!frameWindow) {
      reject(new Error("Preview frame is unavailable"));
      return;
    }
    frameWindow.navermap_authFailure = window.navermap_authFailure;
    const script = previewDoc.createElement("script");
    let timeoutId;
    const finish = (callback, value) => {
      clearTimeout(timeoutId);
      script.onload = null;
      script.onerror = null;
      script.remove();
      callback(value);
    };
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(state.naverMapClientId)}`;
    script.async = true;
    script.onload = () => frameWindow.naver?.maps
      ? finish(resolve, frameWindow.naver.maps)
      : finish(reject, new Error("NAVER Maps failed to initialize"));
    script.onerror = () => finish(reject, new Error("NAVER Maps failed to load"));
    timeoutId = setTimeout(() => finish(reject, new Error("NAVER Maps timed out")), MAP_LOAD_TIMEOUT_MS);
    previewDoc.head.append(script);
  });

  previewMapsPromise.then((maps) => { previewMapsNamespace = maps; }).catch(() => {
    previewMapsPromise = undefined;
  });

  return previewMapsPromise;
};

const resolveMapFields = async ({ key, query, mapUrl, latitude, longitude, message, mapKey }) => {
  const normalizedQuery = String(query || "").trim();
  const version = (mapLookupVersions.get(key) || 0) + 1;
  mapLookupVersions.set(key, version);
  latitude.value = "";
  longitude.value = "";
  message.dataset.mapLookupState = "loading";
  message.textContent = t("map.searching");

  try {
    const hasUrl = String(mapUrl || "").trim() || /^https?:\/\//i.test(normalizedQuery);
    const maps = hasUrl ? null : await loadNaverMaps();
    const coordinates = await MapLocation.resolve(maps, normalizedQuery, mapUrl);
    if (mapLookupVersions.get(key) !== version) return;
    latitude.value = String(coordinates.latitude);
    longitude.value = String(coordinates.longitude);
    message.dataset.mapLookupState = "ready";
    message.textContent = t("map.ready");
    pendingPreviewMapKey = typeof mapKey === "function" ? mapKey() : mapKey;
  } catch (error) {
    if (mapLookupVersions.get(key) !== version) return;
    message.dataset.mapLookupState = "error";
    if (error.code === "URL_LOCATION_UNAVAILABLE" || error.code === "INVALID_MAP_URL") {
      message.textContent = error.message;
    } else if (error.code === "SERVICE_UNAVAILABLE") {
      message.textContent = t("map.serviceUnavailable");
    } else {
      message.textContent = t(normalizedQuery ? "map.notFound" : "map.empty");
    }
  }
  renderPreview();
};

const resolveRepresentativeMapLocation = () => resolveMapFields({
  key: "representative",
  query: dom.form.elements.location.value,
  mapUrl: dom.form.elements.mapUrl.value,
  latitude: dom.form.elements.mapLatitude,
  longitude: dom.form.elements.mapLongitude,
  message: dom.form.querySelector("[data-map-message]"),
  mapKey: "representative"
});

const resolveCourseMapLocation = (card) => resolveMapFields({
  key: card.dataset.itemId,
  query: card.querySelector('[data-course-field="place"]').value,
  mapUrl: card.querySelector('[data-course-field="mapUrl"]').value,
  latitude: card.querySelector('[data-course-field="mapLatitude"]'),
  longitude: card.querySelector('[data-course-field="mapLongitude"]'),
  message: card.querySelector("[data-course-map-message]"),
  mapKey: () => {
    const courses = getFormData().items.filter((item) => item.type === "course");
    const index = courses.findIndex((item) => item.id === card.dataset.itemId);
    return index >= 0 ? `stop-${index}` : null;
  }
});

const mountPreviewMaps = async (renderId) => {
  if (!previewHost) return;
  const canvases = [...previewHost.querySelectorAll("[data-dynamic-map]:not([data-map-state])")];
  if (!canvases.length) {
    revealPendingPreviewMap();
    return;
  }

  try {
    const maps = await loadPreviewNaverMaps();
    if (renderId !== previewRenderId) return;
    canvases.forEach((canvas) => {
      if (!canvas.isConnected) return;
      const position = new maps.LatLng(
        Number(canvas.dataset.latitude),
        Number(canvas.dataset.longitude)
      );
      const map = new maps.Map(canvas, {
        center: position,
        zoom: Number(canvas.dataset.zoom)
      });
      const marker = new maps.Marker({ map, position });
      previewMapInstances.set(canvas, { map, marker });
      canvas.dataset.mapState = "ready";
    });
  } catch {
    canvases.forEach((canvas) => setMapFallback(canvas, null, true));
  }
  if (renderId === previewRenderId) revealPendingPreviewMap();
};

const mapSignature = (panel) => {
  const canvas = panel.querySelector("[data-dynamic-map]");
  return [panel.dataset.mapKey, canvas?.dataset.latitude, canvas?.dataset.longitude, canvas?.dataset.zoom].join(":");
};

const cleanupPreviewMap = (canvas) => {
  const instance = previewMapInstances.get(canvas);
  if (!instance) return;
  instance.marker.setMap?.(null);
  previewMapsNamespace?.Event?.clearInstanceListeners?.(instance.marker);
  previewMapsNamespace?.Event?.clearInstanceListeners?.(instance.map);
  previewMapInstances.delete(canvas);
};

const updatePreviewMarkup = (html) => {
  if (!previewHost) return;
  // Build in the target document so adopted nodes (and any live map panel
  // handed back to it) never cross a document boundary mid-render.
  const next = (previewDoc || document).createElement("div");
  next.innerHTML = html;
  const activeIntroOverlay = previewHost.querySelector("[data-intro-overlay]");
  const currentPanels = new Map(
    [...previewHost.querySelectorAll("[data-map-key]")].map((panel) => [mapSignature(panel), panel])
  );
  const preservedCanvases = new Set();

  next.querySelectorAll("[data-map-key]").forEach((panel) => {
    const current = currentPanels.get(mapSignature(panel));
    if (!current) return;
    preservedCanvases.add(current.querySelector("[data-dynamic-map]"));
    panel.replaceWith(current);
  });

  previewHost.querySelectorAll("[data-dynamic-map]").forEach((canvas) => {
    if (!preservedCanvases.has(canvas)) cleanupPreviewMap(canvas);
  });
  activeIntroOverlay?.remove();
  previewHost.replaceChildren(...next.childNodes);
  if (activeIntroOverlay) previewHost.append(activeIntroOverlay);
};

/* Template cards inject real invitation markup, and there are up to a dozen of
   them on the gallery at once — far too many to give each its own document the
   way #preview gets one. Their hero is decorative (aria-hidden + inert), so the
   cheap fix is to stop it contributing headings and landmarks to the studio
   outline: <header> becomes a plain <div> (.invite-hero does the styling) and
   every heading drops to h3 or below. */
const demoteThumbnailOutline = (markup) => markup
  .replace(/<(\/?)header\b/gi, "<$1div")
  .replace(/<(\/?)h([12])\b/gi, (_match, slash, level) => `<${slash}h${Number(level) + 2}`);

/* Every hero type rule — in style.css and in the renderer stylesheet the export
   also ships — is written `.invite-hero h1`, so demoting the tag would strip the
   thumbnails bare. Mirror those rules onto h3 in the studio document instead of
   forking a stylesheet the guest's invitation depends on. */
const HERO_HEADING_SELECTOR = /\.invite-hero(\s+)h1\b/g;

const mirrorThumbnailHeadingRules = (documentRef) => {
  const mirrorGroup = (group) => {
    const additions = [];
    for (const rule of [...group.cssRules]) {
      if (rule.selectorText === undefined) {
        if (rule.cssRules) mirrorGroup(rule);
        continue;
      }
      if (!HERO_HEADING_SELECTOR.test(rule.selectorText)) continue;
      HERO_HEADING_SELECTOR.lastIndex = 0;
      additions.push(`${rule.selectorText.replace(HERO_HEADING_SELECTOR, ".invite-hero$1h3")}{${rule.style.cssText}}`);
    }
    for (const text of additions) {
      try {
        group.insertRule(text, group.cssRules.length);
      } catch {
        // A rule the engine will not re-parse is not worth failing the gallery for.
      }
    }
  };

  for (const sheet of [...(documentRef.styleSheets || [])]) {
    try {
      if (sheet.cssRules) mirrorGroup(sheet);
    } catch {
      // Cross-origin sheets (the web font CSS) carry no hero rules to mirror.
    }
  }
};

const renderTemplateThumbnail = (template) => {
  const rendered = InvitationCore.renderInvitationBody({
    ...template.defaults,
    templateId: template.id,
    layoutFamily: template.familyId,
    particleEffect: "none",
    introEffect: "none",
    mapEnabled: false
  }, studioChrome());
  const article = rendered.match(/<article\b[^>]*>/i)?.[0];
  const hero = rendered.match(/<(header|section)\b[^>]*class=["'][^"']*\binvite-hero\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/i)?.[0];
  if (!article || !hero) return "";
  return `${article.replace(/>$/, ' data-template-thumbnail aria-hidden="true" inert>')}${demoteThumbnailOutline(hero)}</article>`;
};

const syncTemplateThumbnailScales = () => {
  templateThumbnailObserver?.disconnect();
  const viewports = [...dom.templates.querySelectorAll("[data-template-thumbnail-viewport]")];
  const resize = (viewport) => {
    const thumbnail = viewport.querySelector("[data-template-thumbnail]");
    const hero = thumbnail?.querySelector(".invite-hero");
    const width = viewport.getBoundingClientRect().width;
    if (!thumbnail || !hero || width <= 0) return;
    const heroHeight = Math.max(hero.scrollHeight || 0, hero.offsetHeight || 0);
    const scale = Math.min(width / 430, viewport.clientHeight / (heroHeight || 1));
    thumbnail.style.setProperty("--template-thumbnail-scale", String(scale));
    thumbnail.style.setProperty("--template-thumbnail-left", `${(width - 430 * scale) / 2}px`);
  };
  viewports.forEach(resize);
  if (typeof ResizeObserver !== "function") return;
  templateThumbnailObserver = new ResizeObserver((entries) => entries.forEach(({ target }) => resize(target.closest('[data-template-thumbnail-viewport]'))));
  viewports.forEach((viewport) => {
    templateThumbnailObserver.observe(viewport);
    const hero = viewport.querySelector('.invite-hero');
    if (hero) templateThumbnailObserver.observe(hero);
  });
};

const renderTemplates = () => {
  dom.occasions.innerHTML = state.catalog.occasions.map((occasion) => {
    const isActive = occasion.id === state.activeOccasion;
    return `
      <button class="occasion-chip${isActive ? " is-active" : ""}" type="button" data-occasion-id="${escapeAttribute(occasion.id)}" aria-pressed="${isActive}">
        ${escapeAttribute(occasion.name)}
      </button>
    `;
  }).join("");

  const presets = TemplateCatalog.getPresetsForOccasion(state.catalog, state.activeOccasion);
  dom.templates.innerHTML = presets.map((template) => {
    const isPending = template.id === state.pendingTemplateId;
    const isApplied = template.id === state.activeTemplate;
    return `
      <article class="template-card${isPending ? " is-active" : ""}${isApplied ? " is-applied" : ""}">
        <div class="template-thumbnail-viewport" data-template-thumbnail-viewport aria-hidden="true">
          ${renderTemplateThumbnail(template)}
        </div>
        <div class="template-card-copy">
          <div class="template-card-heading">
            <strong>${escapeAttribute(template.name)}</strong>
            ${isApplied ? `<small class="template-chip-status">${escapeAttribute(t("gallery.applied"))}</small>` : ""}
          </div>
          <p>${escapeAttribute(template.note)}</p>
        </div>
        <button class="template-chip" type="button" data-template-id="${escapeAttribute(template.id)}" aria-label="${escapeAttribute(t("gallery.selectTemplate", { name: template.name }) + (isApplied ? t("gallery.selectTemplateApplied") : ""))}" aria-pressed="${isPending}"></button>
      </article>
    `;
  }).join("");
  syncTemplateThumbnailScales();

  const pending = TemplateCatalog.getPreset(state.catalog, state.pendingTemplateId) || presets[0] || null;
  dom.templateSummary.textContent = pending
    ? t(pending.id === state.activeTemplate ? "gallery.summaryApplied" : "gallery.summaryPending", { name: pending.name })
    : t("gallery.summaryEmpty");
  dom.toggleTemplates.textContent = dom.toggleTemplates.getAttribute('aria-expanded') === 'true'
    ? t('gallery.collapse') : t('gallery.showAllCount', { count: presets.length });
  dom.undoTemplate.hidden = !state.undoSnapshot;
  syncTemplateAvailability();
};

const setPendingTemplate = (templateId) => {
  const preset = TemplateCatalog.getPreset(state.catalog, templateId);
  if (!preset) return false;
  state.activeOccasion = preset.occasionId;
  state.pendingTemplateId = preset.id;
  return true;
};

/* The standalone stylesheet keys its palette off body[data-template] and its
   font variables off inline custom properties, so both land on the frame's
   <body>. Without a frame they land on #preview, exactly as before. */
const applyPreviewPalette = (invitation) => {
  const target = previewStyleTarget;
  if (!target) return;
  target.dataset.template = invitation.templateId;
  target.dataset.particle = invitation.particleEffect;
  target.setAttribute("style", InvitationCore.getInvitationStyle(invitation));
};

const renderSamplePreview = () => {
  const preset = TemplateCatalog.getPreset(state.catalog, state.pendingTemplateId);
  const sample = PresetApplication.prepare({ current: getFormData(), preset }).next;
  applyPreviewPalette(sample);
  updatePreviewMarkup(InvitationCore.renderInvitationBody(sample, studioChrome()));
  dom.pendingPreview.hidden = false;
  dom.pendingPreviewText.textContent = t('preview.sample');
  setMobileView('preview');
  document.querySelector('.preview-panel').scrollIntoView({ block: 'start' });
  dom.previewApply.focus({ preventScroll: true });
};

const focusPresetCard = (templateId) => {
  [...dom.templates.querySelectorAll("[data-template-id]")]
    .find((button) => button.dataset.templateId === templateId)
    ?.focus();
};

const applyPendingTemplate = () => {
  if (hasPendingEditorOperation()) return;
  const preset = TemplateCatalog.getPreset(state.catalog, state.pendingTemplateId);
  if (!preset) return;

  const current = getFormData();

  try {
    const { previous, next } = PresetApplication.prepare({
      current,
      preset,
      preserveContent: personalDraft || PresetApplication.isDirty(current, state.appliedBaseline),
      naverMapClientId: state.naverMapClientId
    });
    state.undoSnapshot = previous;
    state.appliedBaseline = next;
    state.invitation = next;
    state.activeTemplate = next.templateId;
    state.activeOccasion = TemplateCatalog.getOccasionForTemplate(state.catalog, next.templateId);
    state.pendingTemplateId = next.templateId;
    fillForm(next);
    renderTemplates();
    renderPreview();
    personalDraft = true;
    trackAnalytics("template_selected", {}, `template:${state.activeTemplate}`);
    setStudioStage('edit');
    return true;
  } catch {
    dom.saveStatus.textContent = t("gallery.applyFailed");
  }
};

const undoTemplateApplication = () => {
  if (hasPendingEditorOperation() || !state.undoSnapshot) return;
  const restored = PresetApplication.snapshot(state.undoSnapshot);
  state.undoSnapshot = null;
  state.appliedBaseline = restored;
  state.invitation = restored;
  state.activeTemplate = restored.templateId;
  state.activeOccasion = TemplateCatalog.getOccasionForTemplate(state.catalog, restored.templateId);
  state.pendingTemplateId = restored.templateId;
  fillForm(restored);
  renderTemplates();
  renderPreview();
  focusPresetCard(restored.templateId);
};

const renderPreview = () => {
  syncMapSettingsVisibility();
  state.invitation = getFormData();
  saveDraft();
  document.body.dataset.template = state.activeTemplate;
  document.body.dataset.particle = state.invitation.particleEffect;
  applyPreviewPalette(state.invitation);
  updatePreviewMarkup(InvitationCore.renderInvitationBody(state.invitation, studioChrome()));
  previewRenderId += 1;
  clearTimeout(previewMapTimer);
  previewMapTimer = setTimeout(() => mountPreviewMaps(previewRenderId), 180);
};

const playPreviewIntro = () => {
  if (!previewHost) return;
  const invitation = getFormData();
  InvitationIntro.play(previewHost, invitation, { preview: true });
};

const renderSaved = () => {
  if (!state.saved.length) {
    dom.savedList.innerHTML = `<p class="empty-state">${escapeAttribute(t("library.empty"))}</p>`;
    return;
  }

  dom.savedList.innerHTML = state.saved.map((item) => `
    <article class="saved-item">
      <div class="saved-item-copy">
        <strong>${escapeAttribute(item.title)}</strong>
        <div class="saved-item-meta">
          <span class="saved-source">${escapeAttribute(t(item.source === "upload" ? "library.sourceUpload" : "library.sourceGenerated"))}</span>
          <time datetime="${escapeAttribute(item.createdAt)}">${escapeAttribute(formatSavedDate(item.createdAt))}</time>
        </div>
      </div>
      <div class="saved-actions">
        <button type="button" data-action="open" data-id="${escapeAttribute(item.id)}">${escapeAttribute(t("library.open"))}</button>
        <button type="button" data-action="download" data-id="${escapeAttribute(item.id)}">${escapeAttribute(t("library.download"))}</button>
        <button type="button" data-action="delete" data-id="${escapeAttribute(item.id)}">${escapeAttribute(t("library.remove"))}</button>
      </div>
    </article>
  `).join("");
};

const refreshSaved = async () => {
  const records = await InvitationStorage.list();
  state.saved = records.slice(0, MAX_SAVED);
  renderSaved();
  return state.saved;
};

const compareSavedRecords = (left, right) => {
  const leftTime = Date.parse(String(left?.createdAt || ""));
  const rightTime = Date.parse(String(right?.createdAt || ""));
  const safeLeftTime = Number.isFinite(leftTime) ? leftTime : Number.NEGATIVE_INFINITY;
  const safeRightTime = Number.isFinite(rightTime) ? rightTime : Number.NEGATIVE_INFINITY;
  return safeRightTime - safeLeftTime || String(left?.id || "").localeCompare(String(right?.id || ""));
};

const upsertSavedState = (record) => {
  const records = [record, ...state.saved.filter((saved) => saved.id !== record.id)].sort(compareSavedRecords);
  state.saved = records.slice(0, MAX_SAVED);
  if (!state.saved.some((saved) => saved.id === record.id)) {
    state.saved[state.saved.length - 1] = record;
  }
  renderSaved();
};

const removeSavedState = (id) => {
  state.saved = state.saved.filter((saved) => saved.id !== id);
  renderSaved();
};

const enforceSavedLimit = async (protectedId = null) => {
  const records = await InvitationStorage.list();
  if (records.length <= MAX_SAVED) return records;

  const retained = records.slice(0, MAX_SAVED);
  const protectedRecord = protectedId
    ? records.find((record) => record.id === protectedId)
    : null;
  if (protectedRecord && !retained.some((record) => record.id === protectedId)) {
    retained[retained.length - 1] = protectedRecord;
  }

  const retainedIds = new Set(retained.map((record) => record.id));
  for (const record of records) {
    if (!retainedIds.has(record.id)) await InvitationStorage.remove(record.id);
  }
  return retained;
};

const synchronizeSaved = async (protectedId = null) => {
  try {
    await enforceSavedLimit(protectedId);
    await refreshSaved();
    return true;
  } catch {
    return false;
  }
};

const saveRecord = async (record) => {
  await InvitationStorage.put(record);
  upsertSavedState(record);
  return {
    record,
    synchronized: await synchronizeSaved(record.id)
  };
};

const validateForExport = () => {
  syncMapSettingsVisibility();
  const invalidField = dom.form.querySelector(":invalid");
  if (!invalidField) return true;
  setStudioStage('edit');

  const card = invalidField.closest("[data-item-card]");
  if (card) setItemExpanded(card, true);
  const group = invalidField.closest("details");
  if (group) group.open = true;
  invalidField.reportValidity();
  invalidField.focus();
  return false;
};

const confirmReplyContact = () => {
  // The vocabulary that marks an item as asking for a reply is language-
  // specific — an English author writes "RSVP" or "Reply", never "회신" — so
  // the pattern comes from the dictionary rather than being hard-coded here.
  const replyWords = new RegExp(t('finish.replyContactPattern'), 'i');
  const item = getFormData().items.find((entry) => entry.type === 'link'
    && replyWords.test(`${entry.label} ${entry.value}`)
    && !entry.url && !/(?:\b0[1-9]\d?[ -]?\d{3,4}[ -]?\d{4}\b|\+[1-9][\d ()-]{7,}\d\b|[^\s@]+@[^\s@]+\.[^\s@]+)/.test(entry.value));
  if (!item) return true;
  if (window.confirm(t('finish.confirmReplyContact'))) return true;
  setStudioStage('edit');
  const card = findItemCard(item.id);
  if (card) {
    const group = card.closest('details');
    if (group) group.open = true;
    setItemExpanded(card, true);
    card.querySelector('[data-link-field="url"]').focus();
  }
  return false;
};

const downloadHtml = (html, title) => {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFilename(title)}.html`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const normalizeCreatedAt = (value) => {
  const timestamp = Date.parse(String(value || ""));
  return new Date(Number.isFinite(timestamp) ? timestamp : Date.now()).toISOString();
};

const makeSavedItem = (html, title, source = "generated", legacy = {}) => ({
  id: typeof legacy.id === "string" && legacy.id.trim()
    ? legacy.id
    : createItemId("invitation"),
  title: title || t("library.untitled"),
  createdAt: normalizeCreatedAt(legacy.createdAt),
  source: source === "upload" ? "upload" : "generated",
  html
});

const migrateLegacySaved = async () => {
  let remaining;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return { migrated: 0, retained: 0 };
    const reservedIds = new Set(parsed.flatMap((legacyItem) => {
      const id = legacyItem && typeof legacyItem === "object" && !Array.isArray(legacyItem)
        ? String(legacyItem.id || "").trim()
        : "";
      return id ? [id] : [];
    }));
    const usedIds = new Set();
    remaining = parsed.map((legacyItem) => {
      if (!legacyItem || typeof legacyItem !== "object" || Array.isArray(legacyItem)) return legacyItem;

      const requestedId = typeof legacyItem.id === "string" ? legacyItem.id.trim() : "";
      const usesRequestedId = requestedId && !usedIds.has(requestedId);
      let id = usesRequestedId ? requestedId : createItemId("invitation");
      while (usedIds.has(id) || (!usesRequestedId && reservedIds.has(id))) id = createItemId("invitation");
      usedIds.add(id);
      return legacyItem.id === id ? legacyItem : { ...legacyItem, id };
    });

    if (remaining.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
  } catch {
    return { checkpointed: false, migrated: 0, retained: remaining?.length || 0, synchronized: true };
  }

  let migrated = 0;
  let synchronized = true;
  for (const legacyItem of [...remaining]) {
    const occurrenceIndex = remaining.indexOf(legacyItem);
    if (occurrenceIndex < 0 || !legacyItem || typeof legacyItem.html !== "string") continue;

    let record;
    try {
      const invitation = parseInvitationHtml(legacyItem.html);
      const rebuiltHtml = InvitationCore.buildStandaloneHtml(invitation, standaloneOptionsFor(legacyItem.html));
      const source = legacyItem.source === "upload" ? "upload" : "generated";
      record = makeSavedItem(rebuiltHtml, invitation.title, source, legacyItem);
      await InvitationStorage.put(record);
      upsertSavedState(record);
    } catch {
      continue;
    }

    remaining.splice(occurrenceIndex, 1);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
      migrated += 1;
    } catch {
      remaining.splice(occurrenceIndex, 0, legacyItem);
      continue;
    }

    if (!await synchronizeSaved(record.id)) synchronized = false;
  }

  return { checkpointed: true, migrated, retained: remaining.length, synchronized };
};

const saveCurrent = async () => {
  if (photoSelectionPending || heroImageSelectionPending || saveWritePending) return;
  if (!validateForExport()) return;
  saveWritePending = true;
  syncAddItemAvailability(getItemsData());
  try {
    const invitation = getFormData();
    const html = InvitationCore.buildStandaloneHtml(invitation, studioChrome());
    trackAnalyticsCompletion(invitation);
    const result = await saveRecord(makeSavedItem(html, invitation.title, "generated"));
    dom.saveStatus.textContent = t(result.synchronized ? "status.saved" : "status.savedUnsynchronized");
  } catch {
    dom.saveStatus.textContent = t("status.saveFailed");
  } finally {
    saveWritePending = false;
    syncAddItemAvailability(getItemsData());
  }
};

const openSaved = (item) => {
  const url = `viewer.html?id=${encodeURIComponent(item.id)}`;
  window.open(url, "_blank", "noopener,noreferrer");
};

const handleSavedAction = async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const item = state.saved.find((saved) => saved.id === button.dataset.id);
  if (!item) return;

  if (button.dataset.action === "open") openSaved(item);
  if (button.dataset.action === "download") {
    downloadHtml(item.html, item.title);
    // Record identity is only a local dedup key, never a transmitted property.
    trackAnalytics("html_downloaded", { template_id: undefined, occasion: undefined }, `download:library:${item.id}`);
  }
  if (button.dataset.action === "delete") {
    if (!window.confirm(t("library.confirmRemove", { title: item.title }))) return;
    button.disabled = true;
    try {
      await InvitationStorage.remove(item.id);
      removeSavedState(item.id);
      let synchronized = true;
      try {
        await refreshSaved();
      } catch {
        synchronized = false;
      }
      dom.uploadStatus.textContent = t(synchronized ? "status.removed" : "status.removedUnsynchronized");
    } catch {
      dom.uploadStatus.textContent = t("status.removeFailed");
    } finally {
      button.disabled = false;
    }
  }
};

const registerUploadedHtml = async (file) => {
  if (!file) return;
  dom.uploadStatus.textContent = "";

  if (file.size > MAX_UPLOAD_BYTES) {
    dom.uploadStatus.textContent = t("status.uploadTooLarge");
    dom.upload.value = "";
    return;
  }

  dom.upload.disabled = true;
  let parsedSuccessfully = false;
  try {
    const html = await file.text();
    const invitation = parseInvitationHtml(html);
    const rebuiltHtml = InvitationCore.buildStandaloneHtml(invitation, standaloneOptionsFor(html));
    parsedSuccessfully = true;
    const result = await saveRecord(makeSavedItem(rebuiltHtml, invitation.title, "upload"));
    dom.uploadStatus.textContent = t(result.synchronized ? "status.uploaded" : "status.uploadedUnsynchronized");
  } catch {
    dom.uploadStatus.textContent = t(parsedSuccessfully ? "status.saveFailed" : "status.uploadUnsupported");
  } finally {
    dom.upload.value = "";
    dom.upload.disabled = false;
  }
};

const getOpenItemId = () => dom.contentEditor.querySelector(".content-item-card.is-open")?.dataset.itemId || null;

const getFocusedItemContext = () => {
  const activeElement = document.activeElement;
  const card = activeElement?.closest?.("[data-item-card]");
  if (!card || !dom.contentEditor.contains(card)) return null;

  let selector = null;
  if (activeElement.matches("[data-toggle-item]")) selector = "[data-toggle-item]";
  if (activeElement.dataset.itemAction) selector = `[data-item-action="${activeElement.dataset.itemAction}"]`;
  if (activeElement.dataset.courseField) selector = `[data-course-field="${activeElement.dataset.courseField}"]`;
  if (activeElement.dataset.photoField) selector = `[data-photo-field="${activeElement.dataset.photoField}"]`;
  if (activeElement.dataset.noticeField) selector = `[data-notice-field="${activeElement.dataset.noticeField}"]`;
  if (activeElement.dataset.profileField) selector = `[data-profile-field="${activeElement.dataset.profileField}"]`;
  if (activeElement.dataset.linkField) selector = `[data-link-field="${activeElement.dataset.linkField}"]`;
  return selector ? { itemId: card.dataset.itemId, selector } : null;
};

const focusItemControl = (itemId, selector = "[data-toggle-item]") => {
  const control = findItemCard(itemId)?.querySelector(selector);
  if (!control) return false;
  control.focus();
  return true;
};

const commitItemMove = (fromIndex, toIndex, focusSelector = "[data-toggle-item]") => {
  const items = getItemsData();
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length || fromIndex === toIndex) {
    return null;
  }

  const openId = getOpenItemId();
  const movedId = items[fromIndex].id;
  const movedItems = ContentOrder.move(items, fromIndex, toIndex);
  const previousPositions = captureItemPositions();
  renderContentEditor(movedItems, openId);
  animateItemReorder(previousPositions);
  markAnalyticsEdit();
  renderPreview();
  focusItemControl(movedId, focusSelector);
  return movedId;
};

const mergeCompressedPhotos = (currentItems, compressedPhotos) => {
  const items = currentItems.slice();
  const committed = [];
  const skipped = [];
  let photoCount = items.filter((item) => item.type === "photo").length;

  for (const result of compressedPhotos) {
    if (items.length >= InvitationCore.MAX_ITEMS) {
      skipped.push({ ...result, reason: "items" });
      continue;
    }
    if (photoCount >= InvitationCore.MAX_PHOTOS) {
      skipped.push({ ...result, reason: "photos" });
      continue;
    }
    items.push(result.item);
    photoCount += 1;
    committed.push(result);
  }

  return { committed, items, skipped };
};

const getAvailablePhotoCapacity = () => {
  const items = getItemsData();
  const photoCount = items.filter((item) => item.type === "photo").length;
  return Math.max(0, Math.min(
    InvitationCore.MAX_ITEMS - items.length,
    InvitationCore.MAX_PHOTOS - photoCount
  ));
};

const handlePhotoSelection = async () => {
  const files = [...dom.photoInput.files];
  if (photoSelectionPending || heroImageSelectionPending || saveWritePending) {
    dom.photoInput.value = "";
    return;
  }

  const availableCapacity = getAvailablePhotoCapacity();
  const compressedPhotos = [];
  const statuses = Array(files.length).fill("");

  photoSelectionPending = true;
  syncAddItemAvailability(getItemsData());
  try {
    for (const [index, file] of files.entries()) {
      if (compressedPhotos.length >= availableCapacity) {
        statuses[index] = t("content.photoOverCapacity", { file: file.name });
        continue;
      }
      dom.saveStatus.textContent = t("content.photoProcessing", { file: file.name });
      try {
        const image = await ImageTools.compress(file);
        const item = {
          id: createItemId("photo"),
          type: "photo",
          src: image.src,
          alt: "",
          caption: ""
        };
        compressedPhotos.push({ fileName: file.name, index, item });
      } catch (error) {
        const reason = error instanceof ImageTools.ImageError
          ? error.message
          : t("content.imageFailed");
        statuses[index] = t("content.photoFailed", { file: file.name, reason });
      }
    }

    const focusedItem = getFocusedItemContext();
    const openId = getOpenItemId();
    const currentItems = getItemsData();
    const result = mergeCompressedPhotos(currentItems, compressedPhotos);
    for (const committed of result.committed) {
      statuses[committed.index] = t("content.photoAdded", { file: committed.fileName });
    }
    for (const skipped of result.skipped) {
      const limit = t(skipped.reason === "items" ? "content.limitItems" : "content.limitPhotos");
      statuses[skipped.index] = t("content.photoSkipped", { file: skipped.fileName, limit });
    }

    if (result.committed.length) {
      markAnalyticsEdit();
      const firstNewId = result.committed[0].item.id;
      renderContentEditor(result.items, openId || firstNewId);
      renderPreview();
      if (!focusedItem || !focusItemControl(focusedItem.itemId, focusedItem.selector)) {
        focusItemControl(firstNewId, '[data-photo-field="caption"]');
      }
    } else {
      syncAddItemAvailability(currentItems);
    }
    dom.saveStatus.textContent = statuses.filter(Boolean).join(" ");
  } finally {
    dom.photoInput.value = "";
    photoSelectionPending = false;
    syncAddItemAvailability(getItemsData());
  }
};

const handleHeroImageSelection = async () => {
  const file = dom.heroImageInput.files?.[0];
  if (!file || heroImageSelectionPending || photoSelectionPending || saveWritePending) {
    dom.heroImageInput.value = "";
    return;
  }

  heroImageSelectionPending = true;
  dom.heroImageStatus.textContent = t("hero.processing", { file: file.name });
  syncAddItemAvailability(getItemsData());
  try {
    const image = await ImageTools.compress(file);
    state.heroImage = {
      src: image.src,
      ...HeroImage.normalizeCrop()
    };
    markAnalyticsEdit();
    syncHeroImageEditor();
    renderPreview();
    dom.heroImageStatus.textContent = t("hero.added", { file: file.name });
  } catch (error) {
    const reason = error instanceof ImageTools.ImageError
      ? error.message
      : t("content.imageFailed");
    dom.heroImageStatus.textContent = t("content.photoFailed", { file: file.name, reason });
  } finally {
    dom.heroImageInput.value = "";
    heroImageSelectionPending = false;
    syncAddItemAvailability(getItemsData());
  }
};

const updateHeroImageScale = (value) => {
  if (!state.heroImage) return;
  state.heroImage = {
    src: state.heroImage.src,
    ...HeroImage.normalizeCrop({ ...state.heroImage, scale: value })
  };
  syncHeroImageEditor();
  renderPreview();
};

const resetHeroImage = () => {
  if (!state.heroImage) return;
  markAnalyticsEdit();
  state.heroImage = { src: state.heroImage.src, ...HeroImage.normalizeCrop() };
  syncHeroImageEditor();
  renderPreview();
  dom.heroImageStatus.textContent = t("hero.wasReset");
};

const removeHeroImage = () => {
  if (!state.heroImage) return;
  markAnalyticsEdit();
  state.heroImage = null;
  syncHeroImageEditor();
  renderPreview();
  dom.heroImageStatus.textContent = t("hero.wasRemoved");
};

const beginHeroImageDrag = (event) => {
  if (!state.heroImage || event.button !== 0 || heroImageSelectionPending) return;
  event.preventDefault?.();
  try {
    dom.heroImageFrame.setPointerCapture(event.pointerId);
    heroImageDragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      crop: HeroImage.normalizeCrop(state.heroImage)
    };
    dom.heroImageFrame.classList.add("is-dragging");
  } catch {
    heroImageDragState = null;
  }
};

const moveHeroImageDrag = (event) => {
  if (!heroImageDragState || event.pointerId !== heroImageDragState.pointerId || !state.heroImage) return;
  event.preventDefault?.();
  const bounds = dom.heroImageFrame.getBoundingClientRect();
  const crop = HeroImage.moveByDrag(heroImageDragState.crop, {
    deltaX: event.clientX - heroImageDragState.startX,
    deltaY: event.clientY - heroImageDragState.startY,
    frameWidth: bounds.width,
    frameHeight: bounds.height
  });
  state.heroImage = { src: state.heroImage.src, ...crop };
  markAnalyticsEdit();
  syncHeroImageEditor();
  renderPreview();
};

const moveHeroImageByKeyboard = (event) => {
  if (!state.heroImage || heroImageSelectionPending) return;
  const directions = {
    ArrowLeft: { deltaX: -16, deltaY: 0 },
    ArrowRight: { deltaX: 16, deltaY: 0 },
    ArrowUp: { deltaX: 0, deltaY: -16 },
    ArrowDown: { deltaX: 0, deltaY: 16 }
  };
  const direction = directions[event.key];
  if (!direction) return;

  event.preventDefault?.();
  const bounds = dom.heroImageFrame.getBoundingClientRect();
  const crop = HeroImage.moveByDrag(state.heroImage, {
    ...direction,
    frameWidth: bounds.width,
    frameHeight: bounds.height
  });
  state.heroImage = { src: state.heroImage.src, ...crop };
  markAnalyticsEdit();
  syncHeroImageEditor();
  renderPreview();
};

const finishHeroImageDrag = (event) => {
  if (!heroImageDragState || (event.pointerId !== undefined && event.pointerId !== heroImageDragState.pointerId)) return;
  const { pointerId } = heroImageDragState;
  heroImageDragState = null;
  dom.heroImageFrame.classList.remove("is-dragging");
  try {
    if (dom.heroImageFrame.hasPointerCapture(pointerId)) dom.heroImageFrame.releasePointerCapture(pointerId);
  } catch {
    // Pointer capture can already be released when the control leaves the document.
  }
};

/* Sample content localization ----------------------------------------------
   invitation-data.json is the Korean original and the single source of
   structure. Other languages ship an overlay keyed by the same ids that
   carries only translatable leaves, so ids, course labels, effects, fonts,
   coordinates and zoom can never drift apart between languages. */
const contentOverlays = new Map();

const loadContentOverlay = async (language) => {
  if (contentOverlays.has(language)) return contentOverlays.get(language);
  // Korean is the base data and needs no overlay.
  if (language === (I18n?.DEFAULT_LANGUAGE ?? "ko")) {
    contentOverlays.set(language, null);
    return null;
  }

  let overlay = null;
  try {
    const response = await fetch(`assets/i18n/content-${language}.json`, { cache: "no-store" });
    if (response.ok) overlay = await response.json();
  } catch {
    // Samples falling back to the base language is a blemish, not a failure.
  }
  contentOverlays.set(language, overlay);
  return overlay;
};

const localizeSampleInvitation = (invitation = {}, overlay) => {
  const localized = { ...invitation };
  for (const field of ["title", "subtitle", "host", "location", "message"]) {
    if (overlay?.[field]) localized[field] = overlay[field];
  }
  /* dateTime is the language-neutral instant behind a sample. Only generated
     values are formatted: once an author types into the 일시 / Date and time
     field the invitation carries their dateLabel and no dateTime, so their
     free text survives every language switch untouched. */
  const sampleDate = invitation.dateTime && I18n?.formatSampleDate(invitation.dateTime);
  if (sampleDate) localized.dateLabel = sampleDate;
  localized.items = (invitation.items || []).map((item) => ({ ...item, ...(overlay?.items?.[item.id] || {}) }));
  return localized;
};

const localizeCatalogData = (data, overlay) => ({
  ...data,
  occasions: (data.occasions || []).map((occasion) => ({
    ...occasion,
    name: overlay?.occasions?.[occasion.id] || occasion.name
  })),
  templates: (data.templates || []).map((template) => {
    const localized = overlay?.templates?.[template.id];
    return {
      ...template,
      name: localized?.name || template.name,
      note: localized?.note || template.note,
      defaults: localizeSampleInvitation(template.defaults, localized?.defaults)
    };
  }),
  defaultInvitation: localizeSampleInvitation(data.defaultInvitation, overlay?.defaultInvitation)
});

// Rebuilds the gallery and the starting sample in the active language.
// Returns the localized defaultInvitation so callers can decide whether the
// author's current draft is theirs to keep or ours to replace.
const applyContentLanguage = async () => {
  const language = I18n?.getLanguage() ?? "ko";
  const data = localizeCatalogData(state.rawData || {}, await loadContentOverlay(language));
  state.catalog = TemplateCatalog.normalizeCatalog(data);
  state.templates = state.catalog.templates;
  state.localizedDefault = data.defaultInvitation;
  return data;
};

const loadInitialData = async () => {
  const response = await fetch("invitation-data.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  state.rawData = await response.json();
  const data = await applyContentLanguage();
  state.naverMapClientId = String(data.site?.naverMapClientId || "").trim();
  state.activeTemplate = data.site?.defaultTemplate || state.templates[0]?.id || "royal";
  state.invitation = InvitationCore.normalizeInvitation({
    ...data.defaultInvitation,
    naverMapClientId: state.naverMapClientId
  });
  state.activeTemplate = state.invitation.templateId || state.activeTemplate;
  if (!TemplateCatalog.getPreset(state.catalog, state.activeTemplate)) {
    state.activeTemplate = state.templates[0]?.id || "royal";
    state.invitation = InvitationCore.normalizeInvitation({
      ...state.invitation,
      templateId: state.activeTemplate,
      naverMapClientId: state.naverMapClientId
    });
  }
  state.activeOccasion = TemplateCatalog.getOccasionForTemplate(state.catalog, state.activeTemplate);
  state.pendingTemplateId = state.activeTemplate;
  state.appliedBaseline = PresetApplication.snapshot(state.invitation);
  state.undoSnapshot = null;
};

const init = async () => {
  try { window.InvitationAnalytics?.init(); } catch { /* Optional analytics. */ }
  trackAnalytics("landing_viewed", {}, "landing");
  try {
    InvitationIntro.ensureStyles(document);
    TemplateRenderers.ensureStyles(document);
    mirrorThumbnailHeadingRules(document);
    await mountPreviewFrame();
    await loadInitialData();
    try {
      const draft = await InvitationStorage.getDraft();
      if (draft?.invitation && TemplateCatalog.getPreset(state.catalog, draft.invitation.templateId)) {
        state.invitation = PresetApplication.snapshot(draft.invitation);
        state.activeTemplate = state.invitation.templateId;
        state.pendingTemplateId = state.activeTemplate;
        state.activeOccasion = TemplateCatalog.getOccasionForTemplate(state.catalog, state.activeTemplate);
        state.appliedBaseline = state.invitation;
        personalDraft = true;
        document.querySelector('#draft-status').textContent = t('status.draftRestored');
      }
    } catch {
      document.querySelector('#draft-status').textContent = t('status.draftUnavailable');
    }
    renderTemplates();
    fillForm(state.invitation);
    mountPublishing();
    renderPreview();
    draftReady = true;
    if (personalDraft) setStudioStage('edit');
    renderSaved();

    let database;
    try {
      database = await InvitationStorage.open();
      database.close?.();
    } catch {
      dom.uploadStatus.textContent = t("status.storageUnavailable");
      return;
    }

    try {
      const migration = await migrateLegacySaved();
      const synchronized = await synchronizeSaved();
      if (!migration.checkpointed) {
        dom.uploadStatus.textContent = t("status.migrationUnavailable");
      } else if (!synchronized) {
        dom.uploadStatus.textContent = t("status.syncIncomplete");
      }
    } catch {
      dom.uploadStatus.textContent = t("status.syncFailed");
    }
  } catch {
    if (previewHost) {
      previewHost.innerHTML = `
      <div class="error-panel">
        <strong>${escapeAttribute(t("status.bootFailedTitle"))}</strong>
        <p>${escapeAttribute(t("status.bootFailedBody"))}</p>
        <code>python3 -m http.server 4173</code>
      </div>
    `;
    }
  }
};

dom.form.addEventListener("input", (event) => {
  personalDraft = true;
  if (event.target.type !== "file") markAnalyticsEdit();
  if (event.target === dom.heroImageScale) {
    updateHeroImageScale(event.target.value);
    return;
  }
  if (event.target.matches('[name="particleScale"], [name="particleAmount"]')) {
    syncParticleOutputs();
  }
  if (event.target.matches('[name="mapEnabled"]')) {
    pendingPreviewMapKey = event.target.checked ? "representative" : null;
  }
  if (event.target.matches('[data-course-field="mapEnabled"]')) {
    const clickedItemId = event.target.closest("[data-item-card]")?.dataset.itemId;
    const courses = getFormData().items.filter((item) => item.type === "course");
    const index = courses.findIndex((item) => item.id === clickedItemId);
    pendingPreviewMapKey = index >= 0 && courses[index].mapEnabled ? `stop-${index}` : null;
  }
  if ((event.target.matches('[name="mapUrl"]') || (event.target.matches('[name="location"]') && !dom.form.elements.mapUrl.value.trim())) && dom.form.elements.mapEnabled.checked) {
    mapLookupVersions.set("representative", (mapLookupVersions.get("representative") || 0) + 1);
    dom.form.elements.mapLatitude.value = "";
    dom.form.elements.mapLongitude.value = "";
    dom.form.querySelector("[data-map-message]").dataset.mapLookupState = "pending";
  }
  if (event.target.matches('[data-course-field="place"], [data-course-field="mapUrl"]')) {
    const card = event.target.closest("[data-item-card]");
    if (card?.querySelector('[data-course-field="mapEnabled"]').checked
      && (event.target.matches('[data-course-field="mapUrl"]') || !card.querySelector('[data-course-field="mapUrl"]').value.trim())) {
      mapLookupVersions.set(card.dataset.itemId, (mapLookupVersions.get(card.dataset.itemId) || 0) + 1);
      card.querySelector('[data-course-field="mapLatitude"]').value = "";
      card.querySelector('[data-course-field="mapLongitude"]').value = "";
      card.querySelector("[data-course-map-message]").dataset.mapLookupState = "pending";
    }
  }
  renderPreview();
  if (event.target.name === "introEffect") {
    syncIntroReplayAvailability();
    if (state.invitation.introEffect === "none") { if (previewHost) InvitationIntro.stop(previewHost); }
    else playPreviewIntro();
  }
});

dom.form.addEventListener("change", (event) => {
  if (event.target.matches("[data-course-label-preset]")) {
    syncCourseLabelPreset(event.target);
    renderPreview();
    return;
  }
  if (event.target.matches('[name="mapEnabled"]')) {
    if (event.target.checked) resolveRepresentativeMapLocation();
    else mapLookupVersions.set("representative", (mapLookupVersions.get("representative") || 0) + 1);
    return;
  }
  if ((event.target.matches('[name="mapUrl"]') || (event.target.matches('[name="location"]') && !dom.form.elements.mapUrl.value.trim())) && dom.form.elements.mapEnabled.checked) {
    resolveRepresentativeMapLocation();
    return;
  }

  const card = event.target.closest?.("[data-item-card]");
  if (!card) return;
  if (event.target.matches('[data-course-field="mapEnabled"]')) {
    if (event.target.checked) resolveCourseMapLocation(card);
    else mapLookupVersions.set(card.dataset.itemId, (mapLookupVersions.get(card.dataset.itemId) || 0) + 1);
  } else if (event.target.matches('[data-course-field="place"], [data-course-field="mapUrl"]')
    && card.querySelector('[data-course-field="mapEnabled"]').checked
    && (event.target.matches('[data-course-field="mapUrl"]') || !card.querySelector('[data-course-field="mapUrl"]').value.trim())) {
    resolveCourseMapLocation(card);
  }
});

const addEditableItem = (type) => {
  const items = getItemsData();
  if (items.length >= InvitationCore.MAX_ITEMS) {
    dom.saveStatus.textContent = t("content.limitReached", {
      max: InvitationCore.MAX_ITEMS,
      count: InvitationCore.MAX_ITEMS
    });
    return;
  }
  const item = createEmptyItem(type);
  if (!item) return;
  items.push(item);
  markAnalyticsEdit();
  renderContentEditor(items, item.id);
  renderPreview();
  focusItemControl(item.id, ITEM_FOCUS_SELECTORS[type]);
};

dom.addCourse.addEventListener("click", () => {
  addEditableItem("course");
});

dom.addItemButtons.forEach((button) => {
  button.addEventListener("click", () => addEditableItem(button.dataset.addItem));
});

dom.addPhoto.addEventListener("click", () => dom.photoInput.click());
dom.photoInput.addEventListener("change", handlePhotoSelection);
dom.heroImageSelect.addEventListener("click", () => dom.heroImageInput.click());
dom.heroImageInput.addEventListener("change", handleHeroImageSelection);
dom.heroImageReset.addEventListener("click", resetHeroImage);
dom.heroImageRemove.addEventListener("click", removeHeroImage);
dom.heroImageFrame.addEventListener("pointerdown", beginHeroImageDrag);
dom.heroImageFrame.addEventListener("pointermove", moveHeroImageDrag);
dom.heroImageFrame.addEventListener("pointerup", finishHeroImageDrag);
dom.heroImageFrame.addEventListener("pointercancel", finishHeroImageDrag);
dom.heroImageFrame.addEventListener("lostpointercapture", finishHeroImageDrag);
dom.heroImageFrame.addEventListener("keydown", moveHeroImageByKeyboard);

dom.contentEditor.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-toggle-item]");
  if (toggle) {
    const card = toggle.closest("[data-item-card]");
    setItemExpanded(card, card.querySelector("[data-item-body]").hidden);
    return;
  }

  const button = event.target.closest("[data-item-action]");
  if (!button) return;
  const card = button.closest("[data-item-card]");
  const cards = [...dom.contentEditor.querySelectorAll("[data-item-card]")];
  const index = cards.indexOf(card);
  const action = button.dataset.itemAction;

  if (action === "up" || action === "down") {
    if (button.getAttribute("aria-disabled") === "true") return;
    const toIndex = action === "up" ? index - 1 : index + 1;
    commitItemMove(index, toIndex, `[data-item-action="${action}"]`);
    return;
  }

  if (action !== "delete") return;
  const items = getItemsData();
  const item = items[index];
  const itemName = getDeleteItemName(item, index);
  if (!window.confirm(t("content.confirmRemove", { name: itemName }))) return;

  const openId = getOpenItemId();
  items.splice(index, 1);
  markAnalyticsEdit();
  const focusId = items[Math.min(index, items.length - 1)]?.id || null;
  const nextOpenId = openId === item.id
    ? focusId
    : openId;
  renderContentEditor(items, nextOpenId);
  renderPreview();
  if (!focusId || !focusItemControl(focusId)) dom.addCourse.focus();
});

dom.contentEditor.addEventListener("input", (event) => {
  const card = event.target.closest("[data-item-card]");
  if (!card) return;
  const value = event.target.value.trim();
  if (event.target.dataset.courseField === "place") {
    card.querySelector("[data-item-summary]").textContent = value || t("content.summaryCourse");
  }
  if (event.target.dataset.courseField === "time" || event.target.dataset.courseField === "label") {
    const time = card.querySelector('[data-course-field="time"]').value || t("content.timeUnset");
    const label = card.querySelector('[data-course-field="label"]').value || "PLACE";
    card.querySelector("[data-item-secondary-summary]").textContent = `${time} · ${label}`;
  }
  if (event.target.dataset.photoField === "alt") {
    card.querySelector("[data-photo-thumbnail]").alt = value || t("content.photoThumbnailAlt");
  }
  if (event.target.dataset.photoField === "alt" || event.target.dataset.photoField === "caption") {
    const alt = card.querySelector('[data-photo-field="alt"]').value.trim();
    const caption = card.querySelector('[data-photo-field="caption"]').value.trim();
    card.querySelector("[data-item-summary]").textContent = caption || alt || t("content.summaryPhoto");
  }
  if (event.target.dataset.noticeField) {
    const heading = card.querySelector('[data-notice-field="heading"]').value.trim();
    const body = card.querySelector('[data-notice-field="body"]').value.trim();
    card.querySelector("[data-item-summary]").textContent = heading || body || t("content.summaryNotice");
  }
  if (event.target.dataset.profileField) {
    const name = card.querySelector('[data-profile-field="name"]').value.trim();
    const role = card.querySelector('[data-profile-field="role"]').value.trim();
    card.querySelector("[data-item-summary]").textContent = name || role || t("content.summaryProfile");
    card.querySelector("[data-item-secondary-summary]").textContent = role || "PROFILE";
  }
  if (event.target.dataset.linkField) {
    const label = card.querySelector('[data-link-field="label"]').value.trim();
    const valueText = card.querySelector('[data-link-field="value"]').value.trim();
    const url = card.querySelector('[data-link-field="url"]').value.trim();
    card.querySelector("[data-item-summary]").textContent = label || valueText || url || t("content.summaryLink");
    card.querySelector("[data-item-secondary-summary]").textContent = valueText || url || "LINK";
  }
});


dom.occasions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-occasion-id]");
  if (!button || hasPendingEditorOperation()) return;
  const presets = TemplateCatalog.getPresetsForOccasion(state.catalog, button.dataset.occasionId);
  if (!presets.length) return;
  state.activeOccasion = button.dataset.occasionId;
  state.pendingTemplateId = presets[0].id;
  renderTemplates();
});

dom.templates.addEventListener("click", (event) => {
  const button = event.target.closest("[data-template-id]");
  if (!button || hasPendingEditorOperation()) return;
  if (!setPendingTemplate(button.dataset.templateId)) return;
  renderTemplates();
  focusPresetCard(state.pendingTemplateId);
  renderSamplePreview();
});

// Matches the gallery.continueToEditor / gallery.apply label swap in
// syncTemplateAvailability: re-applying the design you are already on is a
// no-op the author never asked for, so it advances to the editor instead.
const applyOrContinue = () => {
  const pending = globalThis.TemplateCatalog?.getPreset?.(state.catalog, state.pendingTemplateId);
  if (pending && pending.id === state.activeTemplate) {
    if (hasPendingEditorOperation()) return undefined;
    setStudioStage('edit');
    return true;
  }
  return applyPendingTemplate();
};

dom.applyTemplate.addEventListener("click", applyOrContinue);
dom.undoTemplate.addEventListener("click", undoTemplateApplication);
dom.startTemplate.addEventListener('click', () => {
  if (!applyPendingTemplate()) return;
  const title = dom.form.querySelector('[name="title"]');
  const group = title.closest('details');
  if (group) group.open = true;
  title.focus();
  title.scrollIntoView({ block: 'center' });
});
dom.keepDraft.addEventListener('click', () => {
  if (hasPendingEditorOperation()) return;
  state.pendingTemplateId = state.activeTemplate;
  state.activeOccasion = TemplateCatalog.getOccasionForTemplate(state.catalog, state.activeTemplate);
  renderTemplates();
  dom.openDownloadDialog.focus();
});
dom.previewApply.addEventListener('click', () => {
  if (applyPendingTemplate()) dom.form.querySelector('[name="title"]').focus();
});
document.querySelector('#gallery-create').addEventListener('click', () => {
  applyOrContinue();
});
document.querySelector('#gallery-back').addEventListener('click', () => {
  if (hasPendingEditorOperation()) return;
  setMobileView('editor');
});
dom.toggleTemplates.addEventListener('click', () => {
  const expanded = dom.toggleTemplates.getAttribute('aria-expanded') !== 'true';
  dom.toggleTemplates.setAttribute('aria-expanded', String(expanded));
  dom.templates.classList.toggle('is-expanded', expanded);
  dom.templates.scrollLeft = 0;
  dom.templates.scrollTop = 0;
  const count = TemplateCatalog.getPresetsForOccasion(state.catalog, state.activeOccasion).length;
  dom.toggleTemplates.textContent = expanded ? t('gallery.collapse') : t('gallery.showAllCount', { count });
});

dom.replayIntro.addEventListener("click", playPreviewIntro);

const bindDialog = (dialog, trigger) => {
  if (!dialog || !trigger) return;
  trigger.addEventListener("click", () => { dialog.showModal?.(); });
  dialog.querySelectorAll?.("[data-dialog-close]")?.forEach((button) => {
    button.addEventListener("click", () => dialog.close?.());
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close?.();
  });
  dialog.addEventListener("close", () => { trigger.focus?.(); });
};
bindDialog(dom.downloadDialog, dom.openDownloadDialog);
bindDialog(dom.shareDialog, dom.openShareDialog);

dom.download.addEventListener("click", () => {
  if (photoSelectionPending || heroImageSelectionPending) return;
  if (!validateForExport()) return;
  if (!confirmReplyContact()) return;
  const invitation = getFormData();
  const html = InvitationCore.buildStandaloneHtml(invitation, studioChrome());
  trackAnalyticsCompletion(invitation);
  downloadHtml(html, invitation.title);
  trackAnalytics("html_downloaded", {}, `download:editor:${analyticsPageRevision}:${state.activeTemplate}:${analyticsEditRevision}`);
});

dom.save.addEventListener("click", saveCurrent);
dom.savedList.addEventListener("click", handleSavedAction);
dom.upload.addEventListener("change", () => registerUploadedHtml(dom.upload.files[0]));
dom.mobileTabs.forEach((button) => {
  button.addEventListener("pointerdown", rememberMobileViewScroll);
  button.addEventListener("click", () => setMobileView(button.dataset.mobileView));
});

document.querySelectorAll('.studio-steps button').forEach(button => button.addEventListener('click', () => setStudioStage(button.dataset.studioStage)));
document.querySelector('#review-button').addEventListener('click', () => setStudioStage('finish'));

/* Language switching ------------------------------------------------------
   Options are built from the engine's registry, so adding a language means
   adding a dictionary and a content overlay — never touching this file or
   index.html. Each language is named in its own words, because "영어" is no
   help to someone who cannot read Korean. */
const languageSelect = document.querySelector('#language-select');

const populateLanguageSwitcher = () => {
  if (!languageSelect || !I18n) return;
  languageSelect.innerHTML = I18n.getLanguages()
    .map(({ language, label }) =>
      `<option value="${escapeAttribute(language)}">${escapeAttribute(label)}</option>`)
    .join('');
  languageSelect.value = I18n.getLanguage();
};

/* Re-renders every surface that was built from the dictionary or the catalog.
   The author's invitation is deliberately NOT retranslated: what they typed is
   their document, and swapping it out on a language change would be data loss.
   The one exception is an untouched draft, which is still our sample rather
   than their writing — personalDraft is false only until they edit or apply a
   design. */
const handleLanguageChange = async () => {
  if (languageSelect) languageSelect.value = I18n.getLanguage();
  syncStudioHeading();

  if (state.rawData) {
    await applyContentLanguage();
    if (!personalDraft && state.localizedDefault) {
      state.invitation = InvitationCore.normalizeInvitation({
        ...state.localizedDefault,
        templateId: state.activeTemplate,
        naverMapClientId: state.naverMapClientId
      });
      state.appliedBaseline = PresetApplication.snapshot(state.invitation);
      fillForm(state.invitation);
    } else {
      // Re-render the item cards so their field labels and placeholder
      // summaries follow the new language without touching the values.
      renderContentEditor(getItemsData(), getOpenItemId());
    }
    renderTemplates();
    renderPreview();
  }

  renderSaved();
  document.querySelector('#draft-status').textContent = t(draftReady ? 'status.draftSaved' : 'status.draftKept');
};

if (I18n) {
  populateLanguageSwitcher();
  I18n.subscribe(() => { handleLanguageChange(); });
  languageSelect?.addEventListener('change', () => {
    // Persisted: this is the one signal that records a decision made here.
    I18n.setLanguage(languageSelect.value);
    trackAnalytics('language_changed', { language: I18n.getLanguage() }, `language:${I18n.getLanguage()}`);
  });
  // index.html resolves and applies the language in <head> so the document
  // never paints in the wrong one; this second pass covers the body, which
  // had not been parsed yet at that point.
  I18n.applyDom(document);
}

init();
