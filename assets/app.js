const STORAGE_KEY = "invitation-maker.saved";
const MAX_SAVED = 20;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAP_LOAD_TIMEOUT_MS = 10000;
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
  invitation: {},
  saved: []
};

let naverMapsPromise;
let previewRenderId = 0;
let previewMapTimer;
let pendingPreviewMapKey = null;
let dragState = null;
let photoSelectionPending = false;
let saveWritePending = false;
const previewMapInstances = new WeakMap();
const mobileViewScrollPositions = { editor: 0, preview: 0, library: 0 };
const mapLookupVersions = new Map();

const dom = {
  form: document.querySelector("#invitation-form"),
  occasions: document.querySelector("#occasion-list"),
  templates: document.querySelector("#template-list"),
  templateSummary: document.querySelector("#template-summary"),
  applyTemplate: document.querySelector("#apply-template-button"),
  undoTemplate: document.querySelector("#undo-template-button"),
  contentEditor: document.querySelector("#content-editor"),
  addCourse: document.querySelector("#add-course-button"),
  addPhoto: document.querySelector("#add-photo-button"),
  addItemButtons: [...document.querySelectorAll("[data-add-item]")],
  photoInput: document.querySelector("#photo-input"),
  preview: document.querySelector("#preview"),
  introEffect: document.querySelector('[name="introEffect"]'),
  replayIntro: document.querySelector("#replay-intro-button"),
  download: document.querySelector("#download-button"),
  save: document.querySelector("#save-button"),
  saveStatus: document.querySelector("#save-status"),
  upload: document.querySelector("#html-upload"),
  uploadStatus: document.querySelector("#upload-status"),
  savedList: document.querySelector("#saved-list"),
  particleScaleOutput: document.querySelector("[data-particle-scale-output]"),
  particleAmountOutput: document.querySelector("[data-particle-amount-output]"),
  mobileTabs: [...document.querySelectorAll(".mobile-view-tabs button[data-mobile-view]")]
};

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

const syncAddItemAvailability = (items) => {
  const photoCount = items.filter((item) => item.type === "photo").length;
  const itemsFull = items.length >= InvitationCore.MAX_ITEMS;
  dom.addCourse.disabled = itemsFull;
  dom.addItemButtons.forEach((button) => { button.disabled = itemsFull; });
  dom.addPhoto.disabled = photoSelectionPending
    || saveWritePending
    || itemsFull
    || photoCount >= InvitationCore.MAX_PHOTOS;
  dom.download.disabled = photoSelectionPending;
  dom.save.disabled = photoSelectionPending || saveWritePending;
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

const animateItemReorder = (previousPositions, skippedId = null) => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  dom.contentEditor.querySelectorAll("[data-item-card]").forEach((card) => {
    if (card.dataset.itemId === skippedId || typeof card.animate !== "function") return;
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

const renderContentEditor = (items = [], openId = items[0]?.id, { preserveDrag = false } = {}) => {
  if (dragState && !preserveDrag) cancelActiveDrag();
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
        <header class="content-item-header">
          <button class="item-icon-button item-drag-handle" type="button" data-drag-handle aria-label="${typeLabel} 순서 드래그" title="순서 드래그">
            <span class="drag-grip-bars" aria-hidden="true">
              <span class="drag-grip-bar"></span>
              <span class="drag-grip-bar"></span>
              <span class="drag-grip-bar"></span>
            </span>
          </button>
          <button class="content-item-toggle" type="button" data-toggle-item aria-expanded="${isOpen}" aria-controls="${bodyId}">
            <span class="content-item-heading">
              <strong>${escapeAttribute(typeLabel)} · <span data-item-secondary-summary>${escapeAttribute(secondarySummary)}</span></strong>
              <span data-item-summary>${escapeAttribute(primarySummary)}</span>
            </span>
          </button>
          ${renderItemActions(item, index, items.length)}
        </header>
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

const setMobileView = (view, shouldFocus = false) => {
  if (!["editor", "preview", "library"].includes(view)) return;
  const isMobile = window.matchMedia("(max-width: 900px)").matches;
  const currentView = document.body.dataset.mobileView || "editor";
  if (isMobile) mobileViewScrollPositions[currentView] = window.scrollY || 0;
  document.body.dataset.mobileView = view;
  dom.mobileTabs.forEach((button) => {
    const isActive = button.dataset.mobileView === view;
    button.setAttribute("aria-pressed", String(isActive));
    if (isActive && shouldFocus) button.focus();
  });
  if (isMobile) window.scrollTo({ top: mobileViewScrollPositions[view] || 0, behavior: "auto" });
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
  return InvitationCore.normalizeInvitation({
    templateId: state.activeTemplate,
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

const fillForm = (invitation) => {
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
  if (!pendingPreviewMapKey) return;
  const panel = dom.preview.querySelector(`[data-map-key="${pendingPreviewMapKey}"]`);
  if (!panel) return;

  const centeredTop = panel.offsetTop - Math.max(20, (dom.preview.clientHeight - panel.offsetHeight) / 2);
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  dom.preview.scrollTo({ top: Math.max(0, centeredTop), behavior });
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
  dom.preview.querySelectorAll("[data-dynamic-map]").forEach((canvas) => setMapFallback(canvas));
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

const resolveMapFields = async ({ key, query, latitude, longitude, message, mapKey }) => {
  const normalizedQuery = String(query || "").trim();
  const version = (mapLookupVersions.get(key) || 0) + 1;
  mapLookupVersions.set(key, version);
  latitude.value = "";
  longitude.value = "";
  message.dataset.mapLookupState = "loading";
  message.textContent = "지도 위치를 찾고 있습니다.";

  try {
    const maps = await loadNaverMaps();
    const coordinates = await MapLocation.resolve(maps, normalizedQuery);
    if (mapLookupVersions.get(key) !== version) return;
    latitude.value = String(coordinates.latitude);
    longitude.value = String(coordinates.longitude);
    message.dataset.mapLookupState = "ready";
    message.textContent = "지도 위치를 확인했습니다.";
    pendingPreviewMapKey = typeof mapKey === "function" ? mapKey() : mapKey;
  } catch (error) {
    if (mapLookupVersions.get(key) !== version) return;
    message.dataset.mapLookupState = "error";
    if (error.code === "SERVICE_UNAVAILABLE") {
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
  latitude: dom.form.elements.mapLatitude,
  longitude: dom.form.elements.mapLongitude,
  message: dom.form.querySelector("[data-map-message]"),
  mapKey: "representative"
});

const resolveCourseMapLocation = (card) => resolveMapFields({
  key: card.dataset.itemId,
  query: card.querySelector('[data-course-field="place"]').value,
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
  const canvases = [...dom.preview.querySelectorAll("[data-dynamic-map]:not([data-map-state])")];
  if (!canvases.length) {
    revealPendingPreviewMap();
    return;
  }

  try {
    await loadNaverMaps();
    if (renderId !== previewRenderId) return;
    canvases.forEach((canvas) => {
      if (!canvas.isConnected) return;
      const position = new window.naver.maps.LatLng(
        Number(canvas.dataset.latitude),
        Number(canvas.dataset.longitude)
      );
      const map = new window.naver.maps.Map(canvas, {
        center: position,
        zoom: Number(canvas.dataset.zoom)
      });
      const marker = new window.naver.maps.Marker({ map, position });
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
  window.naver?.maps?.Event?.clearInstanceListeners?.(instance.marker);
  window.naver?.maps?.Event?.clearInstanceListeners?.(instance.map);
  previewMapInstances.delete(canvas);
};

const updatePreviewMarkup = (html) => {
  const next = document.createElement("div");
  next.innerHTML = html;
  const activeIntroOverlay = dom.preview.querySelector("[data-intro-overlay]");
  const currentPanels = new Map(
    [...dom.preview.querySelectorAll("[data-map-key]")].map((panel) => [mapSignature(panel), panel])
  );
  const preservedCanvases = new Set();

  next.querySelectorAll("[data-map-key]").forEach((panel) => {
    const current = currentPanels.get(mapSignature(panel));
    if (!current) return;
    preservedCanvases.add(current.querySelector("[data-dynamic-map]"));
    panel.replaceWith(current);
  });

  dom.preview.querySelectorAll("[data-dynamic-map]").forEach((canvas) => {
    if (!preservedCanvases.has(canvas)) cleanupPreviewMap(canvas);
  });
  activeIntroOverlay?.remove();
  dom.preview.replaceChildren(...next.childNodes);
  if (activeIntroOverlay) dom.preview.append(activeIntroOverlay);
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
      <button class="template-chip${isPending ? " is-active" : ""}" type="button" data-template-id="${escapeAttribute(template.id)}" aria-pressed="${isPending}">
        <strong>${escapeAttribute(template.name)}</strong>
        <span>${escapeAttribute(template.note)}</span>
        ${isApplied ? '<small class="template-chip-status">적용됨</small>' : ""}
      </button>
    `;
  }).join("");

  const pending = TemplateCatalog.getPreset(state.catalog, state.pendingTemplateId) || presets[0] || null;
  const occasion = state.catalog.occasions.find((entry) => entry.id === state.activeOccasion);
  dom.templateSummary.textContent = pending
    ? `${occasion?.name || "템플릿"} · ${pending.name}을 선택했습니다. 적용 버튼을 누르면 현재 초안이 교체됩니다.`
    : "적용할 템플릿을 선택해 주세요.";
  dom.applyTemplate.disabled = !pending;
  dom.undoTemplate.hidden = !state.undoSnapshot;
};

const setPendingTemplate = (templateId) => {
  const preset = TemplateCatalog.getPreset(state.catalog, templateId);
  if (!preset) return false;
  state.activeOccasion = preset.occasionId;
  state.pendingTemplateId = preset.id;
  return true;
};

const focusPresetCard = (templateId) => {
  [...dom.templates.querySelectorAll("[data-template-id]")]
    .find((button) => button.dataset.templateId === templateId)
    ?.focus();
};

const applyPendingTemplate = () => {
  const preset = TemplateCatalog.getPreset(state.catalog, state.pendingTemplateId);
  if (!preset) return;

  const current = getFormData();
  if (PresetApplication.isDirty(current, state.appliedBaseline)
    && !window.confirm("현재 편집 중인 초안이 템플릿 내용으로 교체됩니다. 계속할까요?")) {
    return;
  }

  try {
    const { previous, next } = PresetApplication.prepare({
      current,
      preset,
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
  } catch {
    dom.saveStatus.textContent = "템플릿을 적용하지 못했습니다. 현재 초안은 그대로 유지됩니다.";
  }
};

const undoTemplateApplication = () => {
  if (!state.undoSnapshot) return;
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
  document.body.dataset.template = state.activeTemplate;
  document.body.dataset.particle = state.invitation.particleEffect;
  dom.preview.dataset.template = state.activeTemplate;
  dom.preview.setAttribute("style", InvitationCore.getInvitationStyle(state.invitation));
  updatePreviewMarkup(InvitationCore.renderInvitationBody(state.invitation));
  previewRenderId += 1;
  clearTimeout(previewMapTimer);
  previewMapTimer = setTimeout(() => mountPreviewMaps(previewRenderId), 180);
};

const playPreviewIntro = () => {
  const invitation = getFormData();
  InvitationIntro.play(dom.preview, invitation, { preview: true });
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

  const card = invalidField.closest("[data-item-card]");
  if (card) setItemExpanded(card, true);
  invalidField.reportValidity();
  invalidField.focus();
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
  if (photoSelectionPending || saveWritePending) return;
  if (!validateForExport()) return;
  saveWritePending = true;
  syncAddItemAvailability(getItemsData());
  try {
    const invitation = getFormData();
    const html = InvitationCore.buildStandaloneHtml(invitation);
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
  if (button.dataset.action === "download") downloadHtml(item.html, item.title);
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
  if (activeElement.matches("[data-drag-handle]")) selector = "[data-drag-handle]";
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

const commitItemMove = (fromIndex, toIndex, focusSelector = "[data-drag-handle]", { preserveDrag = false } = {}) => {
  const items = getItemsData();
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length || fromIndex === toIndex) {
    return null;
  }

  const openId = getOpenItemId();
  const movedId = items[fromIndex].id;
  const movedItems = ContentOrder.move(items, fromIndex, toIndex);
  const previousPositions = captureItemPositions();
  renderContentEditor(movedItems, openId, { preserveDrag });
  animateItemReorder(previousPositions, preserveDrag ? movedId : null);
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
  if (photoSelectionPending || saveWritePending) {
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

const clearDropIndicators = () => {
  dom.contentEditor.querySelectorAll(".is-drop-before, .is-drop-after").forEach((card) => {
    card.classList.remove("is-drop-before", "is-drop-after");
  });
};

const cancelActiveDrag = () => {
  if (!dragState) return;
  const { handle, card, pointerId } = dragState;
  dragState = null;
  clearDropIndicators();
  card?.classList.remove("is-dragging");
  try {
    if (handle?.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
  } catch {
    // A detached capture target is already released by the browser.
  }
};

const finishItemDrag = (event) => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  if (event.type === "lostpointercapture" && dragState.transferring) return;
  if (event.type === "lostpointercapture" && event.target !== dragState.handle) return;
  cancelActiveDrag();
};

const beginItemDrag = (event) => {
  const handle = event.target.closest("[data-drag-handle]");
  if (!handle || dragState || (event.button !== undefined && event.button !== 0)) return;

  const card = handle.closest("[data-item-card]");
  if (!card) return;
  event.preventDefault();
  handle.setPointerCapture(event.pointerId);
  card.classList.add("is-dragging");
  dragState = { pointerId: event.pointerId, itemId: card.dataset.itemId, handle, card, transferring: false };
};

const moveItemDrag = (event) => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  event.preventDefault();

  const hit = document.elementFromPoint(event.clientX, event.clientY);
  const targetCard = hit?.closest("[data-item-card]");
  if (!targetCard || !dom.contentEditor.contains(targetCard)) {
    clearDropIndicators();
    return;
  }

  const cards = [...dom.contentEditor.querySelectorAll("[data-item-card]")];
  const draggedCard = findItemCard(dragState.itemId);
  const fromIndex = cards.indexOf(draggedCard);
  const toIndex = cards.indexOf(targetCard);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    clearDropIndicators();
    return;
  }

  const targetRect = targetCard.getBoundingClientRect();
  const targetMidpoint = targetRect.top + targetRect.height / 2;
  const movingUp = toIndex < fromIndex;
  clearDropIndicators();
  targetCard.classList.add(movingUp ? "is-drop-before" : "is-drop-after");
  if ((movingUp && event.clientY >= targetMidpoint) || (!movingUp && event.clientY <= targetMidpoint)) return;

  dragState.transferring = true;
  const movedId = commitItemMove(fromIndex, toIndex, "[data-drag-handle]", { preserveDrag: true });
  const movedCard = movedId ? findItemCard(movedId) : null;
  const movedHandle = movedCard?.querySelector("[data-drag-handle]");
  if (!movedCard || !movedHandle) {
    cancelActiveDrag();
    return;
  }

  movedCard.classList.add("is-dragging");
  try {
    movedHandle.setPointerCapture(event.pointerId);
    dragState = {
      pointerId: event.pointerId,
      itemId: movedId,
      handle: movedHandle,
      card: movedCard,
      transferring: false
    };
  } catch {
    cancelActiveDrag();
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
  try {
    InvitationIntro.ensureStyles(document);
    TemplateRenderers.ensureStyles(document);
    await loadInitialData();
    renderTemplates();
    fillForm(state.invitation);
    renderPreview();
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
    dom.preview.innerHTML = `
      <div class="error-panel">
        <strong>초기 데이터를 불러오지 못했습니다.</strong>
        <p>별도 JSON 파일을 읽기 때문에 로컬 서버나 배포 환경에서 열어야 합니다.</p>
        <code>python3 -m http.server 4173</code>
      </div>
    `;
  }
};

dom.form.addEventListener("input", (event) => {
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
  if (event.target.matches('[name="location"]') && dom.form.elements.mapEnabled.checked) {
    dom.form.elements.mapLatitude.value = "";
    dom.form.elements.mapLongitude.value = "";
    dom.form.querySelector("[data-map-message]").dataset.mapLookupState = "pending";
  }
  if (event.target.matches('[data-course-field="place"]')) {
    const card = event.target.closest("[data-item-card]");
    if (card?.querySelector('[data-course-field="mapEnabled"]').checked) {
      card.querySelector('[data-course-field="mapLatitude"]').value = "";
      card.querySelector('[data-course-field="mapLongitude"]').value = "";
      card.querySelector("[data-course-map-message]").dataset.mapLookupState = "pending";
    }
  }
  renderPreview();
  if (event.target.name === "introEffect") {
    syncIntroReplayAvailability();
    if (state.invitation.introEffect === "none") InvitationIntro.stop(dom.preview);
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
  if (event.target.matches('[name="location"]') && dom.form.elements.mapEnabled.checked) {
    resolveRepresentativeMapLocation();
    return;
  }

  const card = event.target.closest?.("[data-item-card]");
  if (!card) return;
  if (event.target.matches('[data-course-field="mapEnabled"]')) {
    if (event.target.checked) resolveCourseMapLocation(card);
    else mapLookupVersions.set(card.dataset.itemId, (mapLookupVersions.get(card.dataset.itemId) || 0) + 1);
  } else if (event.target.matches('[data-course-field="place"]')
    && card.querySelector('[data-course-field="mapEnabled"]').checked) {
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

dom.contentEditor.addEventListener("pointerdown", beginItemDrag);
dom.contentEditor.addEventListener("pointermove", moveItemDrag);
window.addEventListener("pointerup", finishItemDrag);
window.addEventListener("pointercancel", finishItemDrag);
document.addEventListener("lostpointercapture", finishItemDrag, true);

dom.occasions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-occasion-id]");
  if (!button) return;
  const presets = TemplateCatalog.getPresetsForOccasion(state.catalog, button.dataset.occasionId);
  if (!presets.length) return;
  state.activeOccasion = button.dataset.occasionId;
  state.pendingTemplateId = presets[0].id;
  renderTemplates();
});

dom.templates.addEventListener("click", (event) => {
  const button = event.target.closest("[data-template-id]");
  if (!button) return;
  if (setPendingTemplate(button.dataset.templateId)) renderTemplates();
});

dom.applyTemplate.addEventListener("click", applyPendingTemplate);
dom.undoTemplate.addEventListener("click", undoTemplateApplication);

dom.preview.addEventListener("click", (event) => {
  const retryButton = event.target.closest("[data-retry-map]");
  if (!retryButton) return;
  const panel = retryButton.closest("[data-map-key]");
  const canvas = panel?.querySelector("[data-dynamic-map]");
  const status = panel?.querySelector("[data-map-status]");
  if (!canvas || !status) return;

  delete canvas.dataset.mapState;
  status.textContent = "지도를 불러오는 중입니다.";
  naverMapsPromise = undefined;
  previewRenderId += 1;
  mountPreviewMaps(previewRenderId);
});

dom.replayIntro.addEventListener("click", playPreviewIntro);

dom.download.addEventListener("click", () => {
  if (photoSelectionPending) return;
  if (!validateForExport()) return;
  const invitation = getFormData();
  downloadHtml(InvitationCore.buildStandaloneHtml(invitation), invitation.title);
});

dom.save.addEventListener("click", saveCurrent);
dom.savedList.addEventListener("click", handleSavedAction);
dom.upload.addEventListener("change", () => registerUploadedHtml(dom.upload.files[0]));
dom.mobileTabs.forEach((button) => {
  button.addEventListener("click", () => setMobileView(button.dataset.mobileView));
});

init();
