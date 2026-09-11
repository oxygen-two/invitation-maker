const STORAGE_KEY = "invitation-maker.saved";
const MAX_SAVED = 20;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAP_LOAD_TIMEOUT_MS = 10000;
const PREVIEW_FRAME_TIMEOUT_MS = 5000;
const COURSE_LABEL_PRESETS = ["MEET", "CAFE", "WALK", "DINNER", "DRINK", "ACTIVITY"];
const ITEM_LABELS = Object.freeze({
  course: "코스",
  photo: "사진",
  notice: "안내",
  profile: "인물 소개",
  link: "연락처·링크"
});
const ITEM_FOCUS_SELECTORS = Object.freeze({
  course: '[data-course-field="time"]',
  notice: '[data-notice-field="heading"]',
  profile: '[data-profile-field="name"]',
  link: '[data-link-field="label"]'
});

const state = {
  catalog: { occasions: [], templates: [] },
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
  status.textContent = '초안 저장 중…';
  draftWrite = draftWrite.then(() => InvitationStorage.putDraft(invitation)).then(() => {
    if (edited) trackAnalytics("draft_saved", {}, "draft");
    if (revision === draftRevision) status.textContent = '이 기기에 초안 저장됨';
  }).catch(() => {
    if (revision === draftRevision) status.textContent = '자동 저장 실패 · HTML로 다운로드해 주세요';
  });
};

const setStudioStage = (stage) => {
  if (hasPendingEditorOperation()) return;
  document.body.dataset.studioStage = stage;
  if (stage !== 'finish') {
    dom.downloadDialog?.close?.();
    dom.shareDialog?.close?.();
  }
  document.querySelectorAll('.studio-steps button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.studioStage === stage)));
  document.querySelector('#studio-heading').textContent = stage === 'gallery' ? '어떤 날을 초대할까요?' : '나만의 초대장을 완성하세요';
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
  status.textContent = "지도를 불러오는 중입니다.";
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
  });
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

const formatSavedDate = (value) => {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) return "날짜 정보 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

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
  const typeLabel = ITEM_LABELS[item.type] || ITEM_LABELS.course;
  return `
    <div class="item-editor-actions">
      <button class="item-icon-button" type="button" data-item-action="up" aria-disabled="${index === 0}" aria-label="${typeLabel} 항목 위로 이동" title="위로 이동">↑</button>
      <button class="item-icon-button" type="button" data-item-action="down" aria-disabled="${index === itemCount - 1}" aria-label="${typeLabel} 항목 아래로 이동" title="아래로 이동">↓</button>
      <button class="item-icon-button remove-item-button" type="button" data-item-action="delete" aria-label="${typeLabel} 항목 삭제" title="이 항목 삭제">×</button>
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
        <span>시간</span>
        <input data-course-field="time" type="time" step="600" value="${escapeAttribute(item.time)}">
      </label>
      <label>
        <span>라벨</span>
        <select data-course-label-preset aria-label="코스 라벨">
          ${COURSE_LABEL_PRESETS.map((preset) => `<option value="${preset}"${labelPreset === preset ? " selected" : ""}>${preset}</option>`).join("")}
          <option value="custom"${labelPreset === "custom" ? " selected" : ""}>직접 입력</option>
        </select>
      </label>
      <label class="full custom-label-field" data-custom-label-field${labelPreset === "custom" ? "" : " hidden"}>
        <span>직접 입력</span>
        <input data-course-field="label" type="text" value="${escapeAttribute(labelPreset === "custom" ? label : labelPreset)}" placeholder="예: EXHIBITION" autocomplete="off">
      </label>
      <label class="full">
        <span>장소 또는 주소</span>
        <input data-course-field="place" type="text" value="${escapeAttribute(item.place)}" autocomplete="off">
      </label>
      <label class="full">
        <span>메모</span>
        <textarea data-course-field="note" rows="2">${escapeAttribute(item.note)}</textarea>
      </label>
      <label class="full">
        <span>지도 링크</span>
        <input data-course-field="mapUrl" type="url" value="${escapeAttribute(item.mapUrl)}" placeholder="https://map.naver.com/" autocomplete="off">
      </label>
      <label class="full checkbox-field">
        <input data-course-field="mapEnabled" type="checkbox"${checked}>
        <span>이 코스에 동적 지도 표시</span>
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

  const time = card.querySelector('[data-course-field="time"]').value || "시간 미정";
  card.querySelector("[data-item-secondary-summary]").textContent = `${time} · ${labelInput.value || "PLACE"}`;
};

const renderPhotoFields = (item, bodyId, isOpen) => `
  <div id="${bodyId}" class="photo-editor-grid" data-item-body${isOpen ? "" : " hidden"}>
    <img class="photo-editor-thumbnail" data-photo-thumbnail src="${escapeAttribute(item.src)}" alt="${escapeAttribute(item.alt || "선택한 사진 미리보기")}">
    <label class="full">
      <span>대체 텍스트</span>
      <input data-photo-field="alt" type="text" value="${escapeAttribute(item.alt)}" autocomplete="off">
    </label>
    <label class="full">
      <span>사진 설명</span>
      <textarea data-photo-field="caption" rows="2">${escapeAttribute(item.caption)}</textarea>
    </label>
  </div>
`;

const renderNoticeFields = (item, bodyId, isOpen) => `
  <div id="${bodyId}" class="notice-editor-grid" data-item-body${isOpen ? "" : " hidden"}>
    <label class="full">
      <span>제목</span>
      <input data-notice-field="heading" type="text" value="${escapeAttribute(item.heading)}" autocomplete="off">
    </label>
    <label class="full">
      <span>내용</span>
      <textarea data-notice-field="body" rows="2">${escapeAttribute(item.body)}</textarea>
    </label>
  </div>
`;

const renderProfileFields = (item, bodyId, isOpen) => `
  <div id="${bodyId}" class="profile-editor-grid" data-item-body${isOpen ? "" : " hidden"}>
    <label>
      <span>이름</span>
      <input data-profile-field="name" type="text" value="${escapeAttribute(item.name)}" autocomplete="off">
    </label>
    <label>
      <span>역할</span>
      <input data-profile-field="role" type="text" value="${escapeAttribute(item.role)}" autocomplete="off">
    </label>
    <label class="full">
      <span>소개</span>
      <textarea data-profile-field="description" rows="2">${escapeAttribute(item.description)}</textarea>
    </label>
  </div>
`;

const renderLinkFields = (item, bodyId, isOpen) => `
  <div id="${bodyId}" class="link-editor-grid" data-item-body${isOpen ? "" : " hidden"}>
    <label>
      <span>라벨</span>
      <input data-link-field="label" type="text" value="${escapeAttribute(item.label)}" autocomplete="off">
    </label>
    <label>
      <span>표시값</span>
      <input data-link-field="value" type="text" value="${escapeAttribute(item.value)}" autocomplete="off">
    </label>
    <label class="full">
      <span>URL</span>
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
  document.querySelector('#gallery-selection').textContent = pending ? `선택한 디자인 · ${pending.name}` : '디자인을 선택해 주세요';
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
  dom.startTemplate.textContent = pending ? `${pending.name}로 시작` : "이 디자인으로 시작";
  // A card already badged 적용됨 sitting next to a button offering to apply it
  // reads as a contradiction. When the selection IS the applied design the same
  // button becomes the next step instead — go write the invitation.
  const applyLabel = needsApply ? "이 디자인으로 만들기" : "내용 편집하기";
  dom.applyTemplate.textContent = applyLabel;
  document.querySelector('#gallery-create').textContent = applyLabel;
  dom.pendingPreview.hidden = !needsApply;
  dom.pendingPreviewText.textContent = needsApply
    ? `현재 초안 미리보기입니다. 선택한 ‘${pending.name}’ 디자인은 아직 적용 전입니다.` : "";
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
      return item.caption || item.alt || "설명을 입력하세요";
    case "notice":
      return item.heading || item.body || "안내 내용을 입력하세요";
    case "profile":
      return item.name || item.role || "소개할 인물을 입력하세요";
    case "link":
      return item.label || item.value || item.url || "연락처나 링크를 입력하세요";
    case "course":
    default:
      return item.place || "장소를 입력하세요";
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
      return `${item.time || "시간 미정"} · ${item.label || "PLACE"}`;
  }
};

const getDeleteItemName = (item, index) => {
  switch (item.type) {
    case "photo":
      return item.caption.trim() || item.alt.trim() || `사진 ${index + 1}`;
    case "notice":
      return item.heading.trim() || item.body.trim() || `안내 ${index + 1}`;
    case "profile":
      return item.name.trim() || item.role.trim() || `인물 소개 ${index + 1}`;
    case "link":
      return item.label.trim() || item.value.trim() || item.url.trim() || `연락처·링크 ${index + 1}`;
    case "course":
    default:
      return item.place.trim() || `코스 ${index + 1}`;
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
    dom.contentEditor.innerHTML = '<p class="content-empty">코스나 사진을 추가해 초대장을 구성하세요.</p>';
    return;
  }

  dom.contentEditor.innerHTML = items.map((item, index) => {
    const isOpen = item.id === openId;
    const bodyId = `content-editor-body-${index}`;
    const typeLabel = ITEM_LABELS[item.type] || ITEM_LABELS.course;
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
  dom.particleScaleOutput.textContent = `${scale}%`;
  dom.particleScaleOutput.setAttribute("aria-label", `파티클 크기 ${scale}%`);
  dom.particleAmountOutput.textContent = `${amount}%`;
  dom.particleAmountOutput.setAttribute("aria-label", `파티클 양 ${amount}%`);
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
  dom.heroImageSelect.textContent = heroImage ? "사진 변경" : "배경 사진 추가";

  if (heroImage) {
    const crop = HeroImage.normalizeCrop(heroImage);
    state.heroImage = { src: heroImage.src, ...crop };
    dom.heroImagePreview.setAttribute("src", heroImage.src);
    dom.heroImagePreview.setAttribute(
      "style",
      `--hero-image-scale:${crop.scale / 100};--hero-image-x:${crop.positionX}%;--hero-image-y:${crop.positionY}%`
    );
    dom.heroImageScale.value = String(crop.scale);
    dom.heroImageScaleOutput.textContent = `${crop.scale}%`;
    dom.heroImageScaleOutput.setAttribute("aria-label", `배경 사진 확대 ${crop.scale}%`);
  } else {
    dom.heroImagePreview.removeAttribute?.("src");
    dom.heroImagePreview.removeAttribute?.("style");
    dom.heroImageScale.value = String(HeroImage.MIN_SCALE);
    dom.heroImageScaleOutput.textContent = `${HeroImage.MIN_SCALE}%`;
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
    representativeMessage.textContent = "지도 위치를 확인했습니다.";
    representativeMessage.dataset.mapLookupState = "ready";
  } else if (!dom.form.elements.location.value.trim()) {
    representativeMessage.textContent = "장소 또는 주소를 입력해 주세요.";
    representativeMessage.dataset.mapLookupState = "empty";
  } else if (!representativeMessage.dataset.mapLookupState || representativeMessage.dataset.mapLookupState === "ready") {
    representativeMessage.textContent = "장소 입력을 마치면 지도 위치를 확인합니다.";
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
      message.textContent = "지도 위치를 확인했습니다.";
      message.dataset.mapLookupState = "ready";
    } else if (!place.value.trim()) {
      message.textContent = "장소 또는 주소를 입력해 주세요.";
      message.dataset.mapLookupState = "empty";
    } else if (!message.dataset.mapLookupState || message.dataset.mapLookupState === "ready") {
      message.textContent = "장소 입력을 마치면 지도 위치를 확인합니다.";
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

  statusElement.textContent = "지도를 불러올 수 없습니다. 아래 버튼으로 확인하세요.";
  if (canRetry) {
    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "map-retry-button";
    retryButton.dataset.retryMap = "";
    retryButton.textContent = "지도 다시 시도";
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
  message.textContent = "지도 위치를 찾고 있습니다.";

  try {
    const hasUrl = String(mapUrl || "").trim() || /^https?:\/\//i.test(normalizedQuery);
    const maps = hasUrl ? null : await loadNaverMaps();
    const coordinates = await MapLocation.resolve(maps, normalizedQuery, mapUrl);
    if (mapLookupVersions.get(key) !== version) return;
    latitude.value = String(coordinates.latitude);
    longitude.value = String(coordinates.longitude);
    message.dataset.mapLookupState = "ready";
    message.textContent = "지도 위치를 확인했습니다.";
    pendingPreviewMapKey = typeof mapKey === "function" ? mapKey() : mapKey;
  } catch (error) {
    if (mapLookupVersions.get(key) !== version) return;
    message.dataset.mapLookupState = "error";
    if (error.code === "URL_LOCATION_UNAVAILABLE" || error.code === "INVALID_MAP_URL") {
      message.textContent = error.message;
    } else if (error.code === "SERVICE_UNAVAILABLE") {
      message.textContent = "지도 위치 검색을 사용할 수 없습니다. NAVER Geocoding 설정을 확인해 주세요.";
    } else {
      message.textContent = normalizedQuery
        ? "장소를 찾지 못했습니다. 도로명 주소를 입력해 주세요."
        : "장소 또는 주소를 입력해 주세요.";
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
  });
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
            ${isApplied ? '<small class="template-chip-status">적용됨</small>' : ""}
          </div>
          <p>${escapeAttribute(template.note)}</p>
        </div>
        <button class="template-chip" type="button" data-template-id="${escapeAttribute(template.id)}" aria-label="${escapeAttribute(template.name)} 템플릿 선택${isApplied ? ", 현재 적용됨" : ""}" aria-pressed="${isPending}"></button>
      </article>
    `;
  }).join("");
  syncTemplateThumbnailScales();

  const pending = TemplateCatalog.getPreset(state.catalog, state.pendingTemplateId) || presets[0] || null;
  dom.templateSummary.textContent = pending
    ? (pending.id === state.activeTemplate ? `적용된 디자인: ${pending.name}` : `선택: ${pending.name} · 적용 전까지 현재 초안은 유지됩니다.`)
    : "적용할 템플릿을 선택해 주세요.";
  dom.toggleTemplates.textContent = dom.toggleTemplates.getAttribute('aria-expanded') === 'true'
    ? '접기' : `${presets.length}개 전체 보기`;
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
  updatePreviewMarkup(InvitationCore.renderInvitationBody(sample));
  dom.pendingPreview.hidden = false;
  dom.pendingPreviewText.textContent = '디자인 샘플 · 작성한 내용은 유지됩니다';
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
    dom.saveStatus.textContent = "템플릿을 적용하지 못했습니다. 현재 초안은 그대로 유지됩니다.";
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
  updatePreviewMarkup(InvitationCore.renderInvitationBody(state.invitation));
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
    dom.savedList.innerHTML = `<p class="empty-state">아직 등록된 초대장이 없습니다.</p>`;
    return;
  }

  dom.savedList.innerHTML = state.saved.map((item) => `
    <article class="saved-item">
      <div class="saved-item-copy">
        <strong>${escapeAttribute(item.title)}</strong>
        <div class="saved-item-meta">
          <span class="saved-source">${item.source === "upload" ? "HTML 등록" : "직접 제작"}</span>
          <time datetime="${escapeAttribute(item.createdAt)}">${escapeAttribute(formatSavedDate(item.createdAt))}</time>
        </div>
      </div>
      <div class="saved-actions">
        <button type="button" data-action="open" data-id="${escapeAttribute(item.id)}">열기</button>
        <button type="button" data-action="download" data-id="${escapeAttribute(item.id)}">다운로드</button>
        <button type="button" data-action="delete" data-id="${escapeAttribute(item.id)}">삭제</button>
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
  const item = getFormData().items.find((entry) => entry.type === 'link'
    && /rsvp|회신|참석|연락/i.test(`${entry.label} ${entry.value}`)
    && !entry.url && !/(?:\b0[1-9]\d?[ -]?\d{3,4}[ -]?\d{4}\b|\+[1-9][\d ()-]{7,}\d\b|[^\s@]+@[^\s@]+\.[^\s@]+)/.test(entry.value));
  if (!item) return true;
  if (window.confirm('회신을 요청하는 항목에 연락처나 링크가 없습니다. 연락 수단 없이 다운로드할까요?\n취소하면 연락처 입력으로 이동합니다.')) return true;
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
  title: title || "Untitled Invitation",
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
      const rebuiltHtml = InvitationCore.buildStandaloneHtml(invitation);
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
    const html = InvitationCore.buildStandaloneHtml(invitation);
    trackAnalyticsCompletion(invitation);
    const result = await saveRecord(makeSavedItem(html, invitation.title, "generated"));
    dom.saveStatus.textContent = result.synchronized
      ? "목록에 등록했습니다."
      : "등록은 완료했지만 저장 목록 정리를 마치지 못했습니다.";
  } catch {
    dom.saveStatus.textContent = "브라우저 저장 공간에 기록하지 못해 등록에 실패했습니다.";
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
    if (!window.confirm(`“${item.title}” 초대장을 목록에서 삭제할까요?`)) return;
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
      dom.uploadStatus.textContent = synchronized
        ? "등록된 초대장을 삭제했습니다."
        : "삭제는 완료했지만 저장 목록 새로고침을 마치지 못했습니다.";
    } catch {
      dom.uploadStatus.textContent = "브라우저 저장 공간을 변경하지 못했습니다.";
    } finally {
      button.disabled = false;
    }
  }
};

const registerUploadedHtml = async (file) => {
  if (!file) return;
  dom.uploadStatus.textContent = "";

  if (file.size > MAX_UPLOAD_BYTES) {
    dom.uploadStatus.textContent = "10MB 이하의 초대장 HTML만 등록할 수 있습니다.";
    dom.upload.value = "";
    return;
  }

  dom.upload.disabled = true;
  let parsedSuccessfully = false;
  try {
    const html = await file.text();
    const invitation = parseInvitationHtml(html);
    const rebuiltHtml = InvitationCore.buildStandaloneHtml(invitation);
    parsedSuccessfully = true;
    const result = await saveRecord(makeSavedItem(rebuiltHtml, invitation.title, "upload"));
    dom.uploadStatus.textContent = result.synchronized
      ? "초대장을 등록했습니다."
      : "등록은 완료했지만 저장 목록 정리를 마치지 못했습니다.";
  } catch {
    if (parsedSuccessfully) {
      dom.uploadStatus.textContent = "브라우저 저장 공간에 기록하지 못해 등록에 실패했습니다.";
    } else {
      dom.uploadStatus.textContent = "이 제작기에서 다운로드한 HTML만 등록할 수 있습니다.";
    }
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
        statuses[index] = `${file.name}: 선택 시점의 추가 가능 수를 초과해 처리하지 않았습니다.`;
        continue;
      }
      dom.saveStatus.textContent = `${file.name}: 사진을 처리하고 있습니다.`;
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
        const message = error instanceof ImageTools.ImageError
          ? error.message
          : "이미지를 처리할 수 없습니다.";
        statuses[index] = `${file.name}: ${message}`;
      }
    }

    const focusedItem = getFocusedItemContext();
    const openId = getOpenItemId();
    const currentItems = getItemsData();
    const result = mergeCompressedPhotos(currentItems, compressedPhotos);
    for (const committed of result.committed) {
      statuses[committed.index] = `${committed.fileName}: 사진을 추가했습니다.`;
    }
    for (const skipped of result.skipped) {
      const limit = skipped.reason === "items" ? "초대장 항목" : "사진";
      statuses[skipped.index] = `${skipped.fileName}: 사진 처리를 완료했지만 ${limit} 제한으로 추가하지 않았습니다.`;
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
  dom.heroImageStatus.textContent = `${file.name}: 배경 사진을 처리하고 있습니다.`;
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
    dom.heroImageStatus.textContent = `${file.name}: 배경 사진을 추가했습니다.`;
  } catch (error) {
    const message = error instanceof ImageTools.ImageError
      ? error.message
      : "이미지를 처리할 수 없습니다.";
    dom.heroImageStatus.textContent = `${file.name}: ${message}`;
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
  dom.heroImageStatus.textContent = "배경 사진 위치와 확대를 초기화했습니다.";
};

const removeHeroImage = () => {
  if (!state.heroImage) return;
  markAnalyticsEdit();
  state.heroImage = null;
  syncHeroImageEditor();
  renderPreview();
  dom.heroImageStatus.textContent = "템플릿 기본 배경으로 되돌렸습니다.";
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

const loadInitialData = async () => {
  const response = await fetch("invitation-data.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  state.catalog = TemplateCatalog.normalizeCatalog(data);
  state.templates = state.catalog.templates;
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
        document.querySelector('#draft-status').textContent = '이전 초안을 복구했습니다';
      }
    } catch {
      document.querySelector('#draft-status').textContent = '자동 저장 사용 불가 · HTML로 다운로드해 주세요';
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
      dom.uploadStatus.textContent = "등록 목록 저장소를 열지 못했습니다. 제작과 다운로드는 계속 사용할 수 있습니다.";
      return;
    }

    try {
      const migration = await migrateLegacySaved();
      const synchronized = await synchronizeSaved();
      if (!migration.checkpointed) {
        dom.uploadStatus.textContent = "기존 등록 목록 마이그레이션을 시작하지 못했습니다. 기존 데이터는 그대로 유지됩니다.";
      } else if (!synchronized) {
        dom.uploadStatus.textContent = "등록 목록 동기화를 마치지 못했습니다. 제작과 다운로드는 계속 사용할 수 있습니다.";
      }
    } catch {
      dom.uploadStatus.textContent = "등록 목록 동기화에 실패했습니다. 제작과 다운로드는 계속 사용할 수 있습니다.";
    }
  } catch {
    if (previewHost) {
      previewHost.innerHTML = `
      <div class="error-panel">
        <strong>초기 데이터를 불러오지 못했습니다.</strong>
        <p>별도 JSON 파일을 읽기 때문에 로컬 서버나 배포 환경에서 열어야 합니다.</p>
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
    dom.saveStatus.textContent = `초대장 항목은 최대 ${InvitationCore.MAX_ITEMS}개까지 추가할 수 있습니다.`;
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
  if (!window.confirm(`“${itemName}” 항목을 삭제할까요?`)) return;

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
    card.querySelector("[data-item-summary]").textContent = value || "장소를 입력하세요";
  }
  if (event.target.dataset.courseField === "time" || event.target.dataset.courseField === "label") {
    const time = card.querySelector('[data-course-field="time"]').value || "시간 미정";
    const label = card.querySelector('[data-course-field="label"]').value || "PLACE";
    card.querySelector("[data-item-secondary-summary]").textContent = `${time} · ${label}`;
  }
  if (event.target.dataset.photoField === "alt") {
    card.querySelector("[data-photo-thumbnail]").alt = value || "선택한 사진 미리보기";
  }
  if (event.target.dataset.photoField === "alt" || event.target.dataset.photoField === "caption") {
    const alt = card.querySelector('[data-photo-field="alt"]').value.trim();
    const caption = card.querySelector('[data-photo-field="caption"]').value.trim();
    card.querySelector("[data-item-summary]").textContent = caption || alt || "설명을 입력하세요";
  }
  if (event.target.dataset.noticeField) {
    const heading = card.querySelector('[data-notice-field="heading"]').value.trim();
    const body = card.querySelector('[data-notice-field="body"]').value.trim();
    card.querySelector("[data-item-summary]").textContent = heading || body || "안내 내용을 입력하세요";
  }
  if (event.target.dataset.profileField) {
    const name = card.querySelector('[data-profile-field="name"]').value.trim();
    const role = card.querySelector('[data-profile-field="role"]').value.trim();
    card.querySelector("[data-item-summary]").textContent = name || role || "소개할 인물을 입력하세요";
    card.querySelector("[data-item-secondary-summary]").textContent = role || "PROFILE";
  }
  if (event.target.dataset.linkField) {
    const label = card.querySelector('[data-link-field="label"]').value.trim();
    const valueText = card.querySelector('[data-link-field="value"]').value.trim();
    const url = card.querySelector('[data-link-field="url"]').value.trim();
    card.querySelector("[data-item-summary]").textContent = label || valueText || url || "연락처나 링크를 입력하세요";
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

// Matches the 내용 편집하기 / 이 디자인으로 만들기 label swap in
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
  dom.toggleTemplates.textContent = expanded ? '접기' : `${count}개 전체 보기`;
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
  const html = InvitationCore.buildStandaloneHtml(invitation);
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
init();
