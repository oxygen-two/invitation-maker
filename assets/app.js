const STORAGE_KEY = "invitation-maker.saved";

const state = {
  templates: [],
  activeTemplate: "royal",
  invitation: {},
  saved: []
};

const dom = {
  form: document.querySelector("#invitation-form"),
  templates: document.querySelector("#template-list"),
  preview: document.querySelector("#preview"),
  download: document.querySelector("#download-button"),
  save: document.querySelector("#save-button"),
  upload: document.querySelector("#html-upload"),
  savedList: document.querySelector("#saved-list")
};

const sanitizeFilename = (value) =>
  String(value || "invitation")
    .trim()
    .replace(/[^\w가-힣-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "invitation";

const stopsToText = (stops = []) =>
  stops.map((stop) => [stop.time, stop.label, stop.place, stop.note].join("|")).join("\n");

const readSaved = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

const writeSaved = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.saved));
};

const getFormData = () => {
  const data = new FormData(dom.form);
  return InvitationCore.normalizeInvitation({
    templateId: state.activeTemplate,
    title: data.get("title"),
    subtitle: data.get("subtitle"),
    dateLabel: data.get("dateLabel"),
    host: data.get("host"),
    location: data.get("location"),
    mapUrl: data.get("mapUrl"),
    message: data.get("message"),
    stops: data.get("stops")
  });
};

const fillForm = (invitation) => {
  dom.form.elements.title.value = invitation.title || "";
  dom.form.elements.subtitle.value = invitation.subtitle || "";
  dom.form.elements.dateLabel.value = invitation.dateLabel || "";
  dom.form.elements.host.value = invitation.host || "";
  dom.form.elements.location.value = invitation.location || "";
  dom.form.elements.mapUrl.value = invitation.mapUrl || "";
  dom.form.elements.message.value = invitation.message || "";
  dom.form.elements.stops.value = stopsToText(invitation.stops);
};

const renderTemplates = () => {
  dom.templates.innerHTML = state.templates.map((template) => {
    const activeClass = template.id === state.activeTemplate ? " is-active" : "";
    return `
      <button class="template-chip${activeClass}" type="button" data-template-id="${template.id}">
        <strong>${template.name}</strong>
        <span>${template.note}</span>
      </button>
    `;
  }).join("");
};

const renderPreview = () => {
  state.invitation = getFormData();
  document.body.dataset.template = state.activeTemplate;
  dom.preview.dataset.template = state.activeTemplate;
  dom.preview.innerHTML = InvitationCore.renderInvitationBody(state.invitation);
};

const renderSaved = () => {
  if (!state.saved.length) {
    dom.savedList.innerHTML = `<p class="empty-state">아직 등록된 초대장이 없습니다.</p>`;
    return;
  }

  dom.savedList.innerHTML = state.saved.map((item) => `
    <article class="saved-item">
      <div>
        <strong>${item.title}</strong>
        <span>${item.createdAt}</span>
      </div>
      <div class="saved-actions">
        <button type="button" data-action="open" data-id="${item.id}">열기</button>
        <button type="button" data-action="download" data-id="${item.id}">다운로드</button>
        <button type="button" data-action="delete" data-id="${item.id}">삭제</button>
      </div>
    </article>
  `).join("");
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
  html
});

const saveCurrent = () => {
  const invitation = getFormData();
  const html = InvitationCore.buildStandaloneHtml(invitation);
  state.saved.unshift(makeSavedItem(html, invitation.title));
  state.saved = state.saved.slice(0, 20);
  writeSaved();
  renderSaved();
};

const openSaved = (item) => {
  const blob = new Blob([item.html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

const handleSavedAction = (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const item = state.saved.find((saved) => saved.id === button.dataset.id);
  if (!item) return;

  if (button.dataset.action === "open") openSaved(item);
  if (button.dataset.action === "download") downloadHtml(item.html, item.title);
  if (button.dataset.action === "delete") {
    state.saved = state.saved.filter((saved) => saved.id !== item.id);
    writeSaved();
    renderSaved();
  }
};

const registerUploadedHtml = async (file) => {
  if (!file) return;
  const html = await file.text();
  state.saved.unshift(makeSavedItem(html, file.name.replace(/\.html?$/i, "")));
  writeSaved();
  renderSaved();
  dom.upload.value = "";
};

const loadInitialData = async () => {
  const response = await fetch("invitation-data.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  state.templates = Array.isArray(data.templates) ? data.templates : [];
  state.activeTemplate = data.site?.defaultTemplate || state.templates[0]?.id || "royal";
  state.invitation = InvitationCore.normalizeInvitation(data.defaultInvitation);
  state.activeTemplate = state.invitation.templateId || state.activeTemplate;
};

const init = async () => {
  try {
    await loadInitialData();
    state.saved = readSaved();
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

dom.form.addEventListener("input", renderPreview);

dom.templates.addEventListener("click", (event) => {
  const button = event.target.closest("[data-template-id]");
  if (!button) return;
  state.activeTemplate = button.dataset.templateId;
  renderTemplates();
  renderPreview();
});

dom.download.addEventListener("click", () => {
  const invitation = getFormData();
  downloadHtml(InvitationCore.buildStandaloneHtml(invitation), invitation.title);
});

dom.save.addEventListener("click", saveCurrent);
dom.savedList.addEventListener("click", handleSavedAction);
dom.upload.addEventListener("change", () => registerUploadedHtml(dom.upload.files[0]));

init();
