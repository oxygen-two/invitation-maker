const STORAGE_KEY = "invitation-maker.saved";
const MAX_SAVED = 20;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
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
const previewMapInstances = new WeakMap();

const dom = {
  form: document.querySelector("#invitation-form"),
  templates: document.querySelector("#template-list"),
  stopsEditor: document.querySelector("#stops-editor"),
  addStop: document.querySelector("#add-stop-button"),
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

const emptyStop = () => ({
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

const getStopsData = () => [...dom.stopsEditor.querySelectorAll("[data-stop-card]")].map((card) => {
  const value = (field) => card.querySelector(`[data-stop-field="${field}"]`).value;
  return {
    time: value("time"),
    label: value("label"),
    place: value("place"),
    note: value("note"),
    mapUrl: value("mapUrl"),
    mapEnabled: card.querySelector('[data-stop-field="mapEnabled"]').checked,
    mapLatitude: value("mapLatitude"),
    mapLongitude: value("mapLongitude"),
    mapZoom: value("mapZoom")
  };
});

const renderStopsEditor = (stops = [], openIndex = 0) => {
  if (!stops.length) {
    dom.stopsEditor.innerHTML = '<p class="stops-empty">코스를 추가해 일정을 구성하세요.</p>';
    dom.addStop.disabled = false;
    return;
  }

  dom.addStop.disabled = stops.length >= InvitationCore.MAX_STOPS;

  dom.stopsEditor.innerHTML = stops.map((stop, index) => {
    const checked = stop.mapEnabled ? " checked" : "";
    const hidden = stop.mapEnabled ? "" : " hidden";
    const isOpen = index === openIndex;
    const bodyId = `stop-editor-body-${index}`;
    return `
      <article class="stop-editor-card${isOpen ? " is-open" : ""}" data-stop-card>
        <header class="stop-editor-card-header">
          <button class="stop-editor-toggle" type="button" data-toggle-stop aria-expanded="${isOpen}" aria-controls="${bodyId}">
            <span class="stop-editor-number">${String(index + 1).padStart(2, "0")}</span>
            <span class="stop-editor-heading">
              <strong><span data-stop-time-summary>${escapeAttribute(stop.time || "시간 미정")}</span><span aria-hidden="true"> · </span><span data-stop-label-summary>${escapeAttribute(stop.label || "PLACE")}</span></strong>
              <span data-stop-summary>${escapeAttribute(stop.place || "장소를 입력하세요")}</span>
            </span>
          </button>
          <button class="remove-stop-button" type="button" data-remove-stop="${index}" aria-label="코스 ${index + 1} 삭제" title="이 코스 삭제">×</button>
        </header>
        <div id="${bodyId}" class="stop-editor-grid" data-stop-body${isOpen ? "" : " hidden"}>
          <label>
            <span>시간</span>
            <input data-stop-field="time" type="time" value="${escapeAttribute(stop.time)}">
          </label>
          <label>
            <span>라벨</span>
            <input data-stop-field="label" type="text" value="${escapeAttribute(stop.label)}" placeholder="PLACE" autocomplete="off">
          </label>
          <label class="full">
            <span>장소</span>
            <input data-stop-field="place" type="text" value="${escapeAttribute(stop.place)}" autocomplete="off">
          </label>
          <label class="full">
            <span>메모</span>
            <textarea data-stop-field="note" rows="2">${escapeAttribute(stop.note)}</textarea>
          </label>
          <label class="full">
            <span>지도 링크</span>
            <input data-stop-field="mapUrl" type="url" value="${escapeAttribute(stop.mapUrl)}" placeholder="https://map.naver.com/" autocomplete="off">
          </label>
          <label class="full checkbox-field">
            <input data-stop-field="mapEnabled" type="checkbox"${checked}>
            <span>이 코스에 동적 지도 표시</span>
          </label>
          <div class="full map-settings stop-map-settings" data-stop-map-settings${hidden}>
            <label>
              <span>위도</span>
              <input data-stop-field="mapLatitude" type="number" min="-90" max="90" step="any" inputmode="decimal" value="${escapeAttribute(stop.mapLatitude ?? "")}">
            </label>
            <label>
              <span>경도</span>
              <input data-stop-field="mapLongitude" type="number" min="-180" max="180" step="any" inputmode="decimal" value="${escapeAttribute(stop.mapLongitude ?? "")}">
            </label>
            <label>
              <span>지도 줌</span>
              <input data-stop-field="mapZoom" type="number" min="6" max="21" step="1" inputmode="numeric" value="${escapeAttribute(stop.mapZoom || 16)}">
            </label>
            <small class="full stop-map-message" data-stop-map-message role="status" aria-live="polite" hidden></small>
          </div>
        </div>
      </article>
    `;
  }).join("");
};

const setStopExpanded = (card, isOpen) => {
  const body = card.querySelector("[data-stop-body]");
  const toggle = card.querySelector("[data-toggle-stop]");
  body.hidden = !isOpen;
  card.classList.toggle("is-open", isOpen);
  toggle.setAttribute("aria-expanded", String(isOpen));
};

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
  const payload = documentNode.querySelector('#invitation-data[type="application/json"]');
  if (!payload) throw new Error("unsupported invitation file");
  const data = JSON.parse(payload.textContent);
  if (Array.isArray(data.stops) && data.stops.length > InvitationCore.MAX_STOPS) {
    throw new Error("too many course cards");
  }
  return InvitationCore.normalizeInvitation({
    ...data,
    naverMapClientId: state.naverMapClientId
  });
};

const readSaved = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) return [];

    return saved.slice(0, MAX_SAVED).flatMap((item) => {
      if (!item || typeof item.html !== "string") return [];
      try {
        const invitation = parseInvitationHtml(item.html);
        return [{
          id: typeof item.id === "string" ? item.id : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          title: invitation.title,
          createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
          source: "generated",
          html: InvitationCore.buildStandaloneHtml(invitation)
        }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
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
    stops: getStopsData()
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
  renderStopsEditor(invitation.stops);
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
  dom.stopsEditor.querySelectorAll("[data-stop-card]").forEach((card) => {
    const checkbox = card.querySelector('[data-stop-field="mapEnabled"]');
    card.querySelector("[data-stop-map-settings]").hidden = !checkbox.checked;
    const latitude = card.querySelector('[data-stop-field="mapLatitude"]');
    const longitude = card.querySelector('[data-stop-field="mapLongitude"]');
    const time = card.querySelector('[data-stop-field="time"]');
    const place = card.querySelector('[data-stop-field="place"]');
    const hasCourseContent = ["time", "place", "note", "mapUrl"]
      .some((field) => card.querySelector(`[data-stop-field="${field}"]`).value.trim())
      || checkbox.checked;
    time.required = hasCourseContent;
    place.required = hasCourseContent;
    latitude.required = checkbox.checked;
    longitude.required = checkbox.checked;
    const message = card.querySelector("[data-stop-map-message]");
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

const persistSaved = (nextSaved) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSaved));
    state.saved = nextSaved;
    renderSaved();
    return true;
  } catch {
    return false;
  }
};

const validateForExport = () => {
  syncMapSettingsVisibility();
  const invalidField = dom.form.querySelector(":invalid");
  if (!invalidField) return true;

  const card = invalidField.closest("[data-stop-card]");
  if (card) setStopExpanded(card, true);
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

const makeSavedItem = (html, title) => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  title: title || "Untitled Invitation",
  createdAt: new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date()),
  source: "generated",
  html
});

const saveCurrent = () => {
  if (!validateForExport()) return;
  const invitation = getFormData();
  const html = InvitationCore.buildStandaloneHtml(invitation);
  const nextSaved = [makeSavedItem(html, invitation.title), ...state.saved].slice(0, MAX_SAVED);
  dom.saveStatus.textContent = persistSaved(nextSaved)
    ? "목록에 등록했습니다."
    : "브라우저 저장 공간에 기록하지 못했습니다.";
};

const openSaved = (item) => {
  const url = `viewer.html?id=${encodeURIComponent(item.id)}`;
  window.open(url, "_blank", "noopener,noreferrer");
};

const handleSavedAction = (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const item = state.saved.find((saved) => saved.id === button.dataset.id);
  if (!item) return;

  if (button.dataset.action === "open") openSaved(item);
  if (button.dataset.action === "download") downloadHtml(item.html, item.title);
  if (button.dataset.action === "delete") {
    if (!window.confirm(`“${item.title}” 초대장을 목록에서 삭제할까요?`)) return;
    const nextSaved = state.saved.filter((saved) => saved.id !== item.id);
    dom.uploadStatus.textContent = persistSaved(nextSaved)
      ? "등록된 초대장을 삭제했습니다."
      : "브라우저 저장 공간을 변경하지 못했습니다.";
  }
};

const registerUploadedHtml = async (file) => {
  if (!file) return;
  dom.uploadStatus.textContent = "";

  if (file.size > MAX_UPLOAD_BYTES) {
    dom.uploadStatus.textContent = "2MB 이하의 초대장 HTML만 등록할 수 있습니다.";
    dom.upload.value = "";
    return;
  }

  try {
    const html = await file.text();
    const invitation = parseInvitationHtml(html);
    const rebuiltHtml = InvitationCore.buildStandaloneHtml(invitation);
    const nextSaved = [makeSavedItem(rebuiltHtml, invitation.title), ...state.saved].slice(0, MAX_SAVED);
    dom.uploadStatus.textContent = persistSaved(nextSaved)
      ? "초대장을 등록했습니다."
      : "브라우저 저장 공간에 기록하지 못했습니다.";
  } catch {
    dom.uploadStatus.textContent = "이 제작기에서 다운로드한 HTML만 등록할 수 있습니다.";
  } finally {
    dom.upload.value = "";
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
    const restoredSaved = readSaved();
    if (!persistSaved(restoredSaved)) state.saved = restoredSaved;
    renderTemplates();
    fillForm(state.invitation);
    renderPreview();
    renderSaved();
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
  if (event.target.matches('[data-stop-field="mapEnabled"]')) {
    const cards = [...dom.stopsEditor.querySelectorAll("[data-stop-card]")];
    const index = cards.indexOf(event.target.closest("[data-stop-card]"));
    pendingPreviewMapKey = event.target.checked && index >= 0 ? `stop-${index}` : null;
  }
  renderPreview();
});

dom.addStop.addEventListener("click", () => {
  const currentStops = getStopsData();
  if (currentStops.length >= InvitationCore.MAX_STOPS) {
    dom.saveStatus.textContent = `코스는 최대 ${InvitationCore.MAX_STOPS}개까지 추가할 수 있습니다.`;
    return;
  }
  const stops = [...currentStops, emptyStop()];
  renderStopsEditor(stops, stops.length - 1);
  renderPreview();
  dom.stopsEditor.querySelector("[data-stop-card]:last-child [data-stop-field='time']")?.focus();
});

dom.stopsEditor.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-toggle-stop]");
  if (toggle) {
    const card = toggle.closest("[data-stop-card]");
    setStopExpanded(card, card.querySelector("[data-stop-body]").hidden);
    return;
  }

  const button = event.target.closest("[data-remove-stop]");
  if (!button) return;
  const stops = getStopsData();
  const removedIndex = Number(button.dataset.removeStop);
  const stopName = stops[removedIndex]?.place.trim() || `코스 ${removedIndex + 1}`;
  if (!window.confirm(`“${stopName}” 코스를 삭제할까요?`)) return;
  stops.splice(removedIndex, 1);
  renderStopsEditor(stops, Math.min(removedIndex, stops.length - 1));
  renderPreview();
});

dom.stopsEditor.addEventListener("input", (event) => {
  const card = event.target.closest("[data-stop-card]");
  if (!card) return;
  const value = event.target.value.trim();
  if (event.target.dataset.stopField === "place") {
    card.querySelector("[data-stop-summary]").textContent = value || "장소를 입력하세요";
  }
  if (event.target.dataset.stopField === "time") {
    card.querySelector("[data-stop-time-summary]").textContent = value || "시간 미정";
  }
  if (event.target.dataset.stopField === "label") {
    card.querySelector("[data-stop-label-summary]").textContent = value || "PLACE";
  }
});

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
