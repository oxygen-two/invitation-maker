const STORAGE_KEY = "invitation-maker.saved";
const MAX_SAVED = 20;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAP_LOAD_TIMEOUT_MS = 10000;

const state = {
  templates: [],
  activeTemplate: "royal",
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
const previewMapInstances = new WeakMap();

const dom = {
  form: document.querySelector("#invitation-form"),
  templates: document.querySelector("#template-list"),
  contentEditor: document.querySelector("#content-editor"),
  addCourse: document.querySelector("#add-course-button"),
  addPhoto: document.querySelector("#add-photo-button"),
  photoInput: document.querySelector("#photo-input"),
  preview: document.querySelector("#preview"),
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

const createItemId = (type) => {
  if (globalThis.crypto?.randomUUID) return `${type}-${globalThis.crypto.randomUUID()}`;
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const emptyCourse = () => ({
  id: createItemId("course"),
  type: "course",
  time: "",
  label: "",
  place: "",
  note: "",
  mapUrl: "",
  mapEnabled: false,
  mapLatitude: "",
  mapLongitude: "",
  mapZoom: 16
});

const getItemsData = () => [...dom.contentEditor.querySelectorAll("[data-item-card]")].map((card) => {
  const id = card.dataset.itemId;
  const type = card.dataset.itemType;
  if (card.dataset.itemType === "photo") {
    return {
      id: card.dataset.itemId,
      type: card.dataset.itemType,
      src: card.querySelector("[data-photo-thumbnail]").getAttribute("src") || "",
      alt: card.querySelector('[data-photo-field="alt"]').value,
      caption: card.querySelector('[data-photo-field="caption"]').value
    };
  }

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
});

const renderItemActions = (item, index, itemCount) => {
  const typeLabel = item.type === "photo" ? "사진" : "코스";
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
  return `
    <div id="${bodyId}" class="course-editor-grid" data-item-body${isOpen ? "" : " hidden"}>
      <label>
        <span>시간</span>
        <input data-course-field="time" type="time" step="600" value="${escapeAttribute(item.time)}">
      </label>
      <label>
        <span>라벨</span>
        <input data-course-field="label" type="text" value="${escapeAttribute(item.label)}" placeholder="PLACE" autocomplete="off">
      </label>
      <label class="full">
        <span>장소</span>
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
        <label>
          <span>위도</span>
          <input data-course-field="mapLatitude" type="number" min="-90" max="90" step="any" inputmode="decimal" value="${escapeAttribute(item.mapLatitude ?? "")}">
        </label>
        <label>
          <span>경도</span>
          <input data-course-field="mapLongitude" type="number" min="-180" max="180" step="any" inputmode="decimal" value="${escapeAttribute(item.mapLongitude ?? "")}">
        </label>
        <label>
          <span>지도 줌</span>
          <input data-course-field="mapZoom" type="number" min="6" max="21" step="1" inputmode="numeric" value="${escapeAttribute(item.mapZoom || 16)}">
        </label>
        <small class="full stop-map-message" data-course-map-message role="status" aria-live="polite" hidden></small>
      </div>
    </div>
  `;
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

const syncAddItemAvailability = (items) => {
  const photoCount = items.filter((item) => item.type === "photo").length;
  dom.addCourse.disabled = items.length >= InvitationCore.MAX_ITEMS;
  dom.addPhoto.disabled = photoSelectionPending
    || items.length >= InvitationCore.MAX_ITEMS
    || photoCount >= InvitationCore.MAX_PHOTOS;
};

const renderContentEditor = (items = [], openId = items[0]?.id, { preserveDrag = false } = {}) => {
  if (dragState && !preserveDrag) cancelActiveDrag();
  syncAddItemAvailability(items);

  if (!items.length) {
    dom.contentEditor.innerHTML = '<p class="content-empty">코스나 사진을 추가해 초대장을 구성하세요.</p>';
    return;
  }

  let courseNumber = 0;
  dom.contentEditor.innerHTML = items.map((item, index) => {
    const isPhoto = item.type === "photo";
    if (!isPhoto) courseNumber += 1;
    const isOpen = item.id === openId;
    const bodyId = `content-editor-body-${index}`;
    const typeLabel = isPhoto ? "사진" : `코스 ${courseNumber}`;
    const primarySummary = isPhoto
      ? item.caption || item.alt || "설명을 입력하세요"
      : item.place || "장소를 입력하세요";
    const secondarySummary = isPhoto
      ? "PHOTO"
      : `${item.time || "시간 미정"} · ${item.label || "PLACE"}`;
    return `
      <article class="content-item-card ${isPhoto ? "photo-editor-card" : "course-editor-card"}${isOpen ? " is-open" : ""}" data-item-card data-item-id="${escapeAttribute(item.id)}" data-item-type="${item.type}">
        <header class="content-item-header">
          <button class="item-icon-button item-drag-handle" type="button" data-drag-handle aria-label="${typeLabel} 순서 드래그" title="순서 드래그">⋮⋮</button>
          <button class="content-item-toggle" type="button" data-toggle-item aria-expanded="${isOpen}" aria-controls="${bodyId}">
            <span class="content-item-number">${String(index + 1).padStart(2, "0")}</span>
            <span class="content-item-heading">
              <strong>${escapeAttribute(typeLabel)} · <span data-item-secondary-summary>${escapeAttribute(secondarySummary)}</span></strong>
              <span data-item-summary>${escapeAttribute(primarySummary)}</span>
            </span>
          </button>
          ${renderItemActions(item, index, items.length)}
        </header>
        ${isPhoto ? renderPhotoFields(item, bodyId, isOpen) : renderCourseFields(item, bodyId, isOpen)}
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
  document.body.dataset.mobileView = view;
  dom.mobileTabs.forEach((button) => {
    const isActive = button.dataset.mobileView === view;
    button.setAttribute("aria-pressed", String(isActive));
    if (isActive && shouldFocus) button.focus();
  });
  if (window.matchMedia("(max-width: 900px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
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
  dom.particleScaleOutput.textContent = `${dom.form.elements.particleScale.value}%`;
  dom.particleAmountOutput.textContent = `${dom.form.elements.particleAmount.value}%`;
};

const fillForm = (invitation) => {
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
  renderContentEditor(invitation.items);
};

const syncMapSettingsVisibility = () => {
  const representativeEnabled = dom.form.elements.mapEnabled.checked;
  dom.form.querySelector("[data-map-settings]").hidden = !representativeEnabled;
  dom.form.elements.mapLatitude.required = representativeEnabled;
  dom.form.elements.mapLongitude.required = representativeEnabled;
  const representativeMessage = dom.form.querySelector("[data-map-message]");
  const representativeCoordinatesValid = dom.form.elements.mapLatitude.value !== ""
    && dom.form.elements.mapLongitude.value !== ""
    && dom.form.elements.mapLatitude.validity.valid
    && dom.form.elements.mapLongitude.validity.valid;
  representativeMessage.hidden = !representativeEnabled || representativeCoordinatesValid;
  representativeMessage.textContent = representativeMessage.hidden
    ? ""
    : "위도와 경도를 입력하면 미리보기에 지도가 표시됩니다.";
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
    latitude.required = checkbox.checked;
    longitude.required = checkbox.checked;
    const message = card.querySelector("[data-course-map-message]");
    const hasValidCoordinates = latitude.value !== "" && longitude.value !== ""
      && latitude.validity.valid && longitude.validity.valid;
    message.hidden = !checkbox.checked || hasValidCoordinates;
    message.textContent = message.hidden ? "" : "위도와 경도를 입력하면 미리보기에 지도가 표시됩니다.";
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
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(state.naverMapClientId)}`;
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
  dom.preview.replaceChildren(...next.childNodes);
};

const renderTemplates = () => {
  dom.templates.innerHTML = state.templates.map((template) => {
    const activeClass = template.id === state.activeTemplate ? " is-active" : "";
    const isActive = template.id === state.activeTemplate;
    return `
      <button class="template-chip${activeClass}" type="button" data-template-id="${escapeAttribute(template.id)}" aria-pressed="${isActive}">
        <strong>${escapeAttribute(template.name)}</strong>
        <span>${escapeAttribute(template.note)}</span>
      </button>
    `;
  }).join("");
};

const renderPreview = () => {
  syncMapSettingsVisibility();
  state.invitation = getFormData();
  document.body.dataset.template = state.activeTemplate;
  document.body.dataset.particle = state.invitation.particleEffect;
  dom.preview.dataset.template = state.activeTemplate;
  updatePreviewMarkup(InvitationCore.renderInvitationBody(state.invitation));
  previewRenderId += 1;
  clearTimeout(previewMapTimer);
  previewMapTimer = setTimeout(() => mountPreviewMaps(previewRenderId), 180);
};

const renderSaved = () => {
  if (!state.saved.length) {
    dom.savedList.innerHTML = `<p class="empty-state">아직 등록된 초대장이 없습니다.</p>`;
    return;
  }

  dom.savedList.innerHTML = state.saved.map((item) => `
    <article class="saved-item">
      <div>
        <strong>${escapeAttribute(item.title)}</strong>
        <span>${escapeAttribute(item.createdAt)}</span>
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
  if (!validateForExport()) return;
  dom.save.disabled = true;
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
    dom.save.disabled = false;
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
  renderContentEditor(movedItems, openId, { preserveDrag });
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
  const availableCapacity = getAvailablePhotoCapacity();
  const compressedPhotos = [];
  const statuses = Array(files.length).fill("");

  photoSelectionPending = true;
  dom.addPhoto.disabled = true;
  try {
    for (const [index, file] of files.entries()) {
      if (index >= availableCapacity) {
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
  } finally {
    dom.photoInput.value = "";
    photoSelectionPending = false;
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
  state.templates = Array.isArray(data.templates) ? data.templates : [];
  state.naverMapClientId = String(data.site?.naverMapClientId || "").trim();
  state.activeTemplate = data.site?.defaultTemplate || state.templates[0]?.id || "royal";
  state.invitation = InvitationCore.normalizeInvitation({
    ...data.defaultInvitation,
    naverMapClientId: state.naverMapClientId
  });
  state.activeTemplate = state.invitation.templateId || state.activeTemplate;
};

const init = async () => {
  try {
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
  renderPreview();
});

dom.addCourse.addEventListener("click", () => {
  const items = getItemsData();
  if (items.length >= InvitationCore.MAX_ITEMS) {
    dom.saveStatus.textContent = `초대장 항목은 최대 ${InvitationCore.MAX_ITEMS}개까지 추가할 수 있습니다.`;
    return;
  }
  const course = emptyCourse();
  items.push(course);
  renderContentEditor(items, course.id);
  renderPreview();
  findItemCard(course.id)?.querySelector("[data-course-field='time']")?.focus();
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
  const itemName = item.type === "photo"
    ? item.caption.trim() || item.alt.trim() || `사진 ${index + 1}`
    : item.place.trim() || `코스 ${index + 1}`;
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
});

dom.contentEditor.addEventListener("pointerdown", beginItemDrag);
dom.contentEditor.addEventListener("pointermove", moveItemDrag);
window.addEventListener("pointerup", finishItemDrag);
window.addEventListener("pointercancel", finishItemDrag);
document.addEventListener("lostpointercapture", finishItemDrag, true);

dom.templates.addEventListener("click", (event) => {
  const button = event.target.closest("[data-template-id]");
  if (!button) return;
  state.activeTemplate = button.dataset.templateId;
  renderTemplates();
  renderPreview();
});

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

dom.download.addEventListener("click", () => {
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
