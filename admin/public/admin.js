(() => {
  const state = { page: 1, pageSize: 20, query: "", csrfToken: "", totalPages: 0 };
  const $ = (selector) => document.querySelector(selector);
  const loginView = $("#login-view");
  const appView = $("#app-view");
  const I18n = globalThis.InvitationI18n;
  const t = (key, values) => I18n?.t(`admin.${key}`, values) ?? `admin.${key}`;
  /* Server error code → dictionary key. The console never shows the operator a
     bare CSRF_INVALID; a test cross-checks every code admin/http.cjs can
     return against this map, so adding a code server-side without adding copy
     fails the suite. The sentences themselves live in admin-i18n.js. */
  const ERROR_KEYS = { ADMIN_AUTH_REQUIRED: "errorAdminAuthRequired", INVALID_ADMIN_PASSWORD: "errorInvalidAdminPassword", LOGIN_RATE_LIMITED: "errorLoginRateLimited", CSRF_INVALID: "errorCsrfInvalid", NOT_FOUND: "errorNotFound", REPOSITORY_UNAVAILABLE: "errorRepositoryUnavailable", BAD_REQUEST: "errorBadRequest", METHOD_NOT_ALLOWED: "errorMethodNotAllowed" };
  const describeError = (code) => t(ERROR_KEYS[code] || "errorFallback");
  const request = async (url, options = {}) => {
    const response = await fetch(url, { credentials: "same-origin", ...options });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(describeError(body?.error));
    return body;
  };
  const showApp = () => { loginView.hidden = true; appView.hidden = false; };
  const showLogin = () => { loginView.hidden = false; appView.hidden = true; };
  const formatDate = (value) => value ? (I18n?.formatDateTime(value, { dateStyle: "medium", timeStyle: "short" }) ?? String(value)) : t("noDate");
  const loadList = async () => {
    const result = await request(`/admin/api/publications?page=${state.page}&pageSize=${state.pageSize}&q=${encodeURIComponent(state.query)}`);
    state.totalPages = result.pagination.totalPages;
    $("#rows").innerHTML = result.items.length ? result.items.map((item) => `<tr><td>${escapeHtml(item.title)}</td><td><code>${item.id}</code></td><td>${escapeHtml(formatDate(item.createdAt))}</td><td>${escapeHtml(formatDate(item.expiresAt))}</td><td class="actions"><button data-detail="${item.id}">${escapeHtml(t("rowDetail"))}</button><a href="${item.publicUrl}" target="_blank" rel="noreferrer"><button class="secondary">${escapeHtml(t("rowOpen"))}</button></a><button class="danger" data-revoke="${item.id}">${escapeHtml(t("rowRevoke"))}</button></td></tr>`).join("") : `<tr><td colspan="5">${escapeHtml(t("listEmpty"))}</td></tr>`;
    $("#status").textContent = t("listStatus", { total: result.pagination.totalItems, page: result.pagination.page, pages: Math.max(1, result.pagination.totalPages) });
    $("#page-label").textContent = `${state.page} / ${Math.max(1, state.totalPages)}`;
    $("#prev").disabled = state.page <= 1;
    $("#next").disabled = state.page >= state.totalPages;
  };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[char]));
  const detailRow = (label, value) => value ? `<dt>${escapeHtml(label)}</dt><dd>${value}</dd>` : "";
  const detailCourseItems = (items) => (items || []).filter((item) => item.type === "course").map((item) => `<li><strong>${escapeHtml(item.time || "")} ${escapeHtml(item.label || "")}</strong>${item.place ? ` · ${escapeHtml(item.place)}` : ""}${item.note ? `<br>${escapeHtml(item.note)}` : ""}</li>`).join("");
  const renderDetail = (body) => {
    const invitation = body.invitation || {};
    const fields = [
      detailRow(t("fieldTitle"), escapeHtml(body.title)),
      detailRow(t("fieldId"), `<code>${escapeHtml(body.id)}</code>`),
      detailRow(t("fieldCreated"), escapeHtml(formatDate(body.createdAt))),
      detailRow(t("fieldExpires"), escapeHtml(formatDate(body.expiresAt))),
      detailRow(t("fieldPublicUrl"), `<a href="${escapeHtml(body.publicUrl)}" target="_blank" rel="noreferrer">${escapeHtml(body.publicUrl)}</a>`)
    ].join("");
    /* The invitation's own fields are the author's words and are printed
       verbatim; only the labels beside them follow the operator's language. */
    const invitationFields = [
      detailRow(t("fieldHost"), invitation.host && escapeHtml(invitation.host)),
      detailRow(t("fieldDate"), invitation.dateLabel && escapeHtml(invitation.dateLabel)),
      detailRow(t("fieldLocation"), invitation.location && escapeHtml(invitation.location)),
      detailRow(t("fieldMessage"), invitation.message && escapeHtml(invitation.message)),
      detailRow(t("fieldTemplate"), invitation.templateId && escapeHtml(invitation.templateId)),
      detailRow(t("fieldLayout"), invitation.layoutFamily && escapeHtml(invitation.layoutFamily)),
      detailRow(t("fieldIntro"), invitation.introEffect && escapeHtml(invitation.introEffect)),
      detailRow(t("fieldParticle"), invitation.particleEffect && escapeHtml(invitation.particleEffect)),
      detailRow(t("fieldFonts"), (invitation.koreanFont || invitation.englishFont) && escapeHtml([invitation.koreanFont, invitation.englishFont].filter(Boolean).join(" / ")))
    ].join("");
    const courseItems = detailCourseItems(invitation.items);
    return `<dl class="detail-fields">${fields}</dl><h3>${escapeHtml(t("detailInvitation"))}</h3><dl class="detail-fields">${invitationFields}</dl>${courseItems ? `<h3>${escapeHtml(t("detailCourses"))}</h3><ol class="detail-courses">${courseItems}</ol>` : ""}<details class="detail-raw"><summary>${escapeHtml(t("detailRaw"))}</summary><pre>${escapeHtml(JSON.stringify(body, null, 2))}</pre></details>`;
  };
  $("#login-form").addEventListener("submit", async (event) => { event.preventDefault(); $("#login-error").textContent = ""; try { const body = await request("/admin/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: $("#password").value }) }); state.csrfToken = body.csrfToken; $("#password").value = ""; showApp(); await loadList(); } catch (error) { $("#login-error").textContent = error.message; } });
  $("#logout").addEventListener("click", async () => { try { await request("/admin/api/logout", { method: "POST", headers: { "x-admin-csrf": state.csrfToken } }); state.csrfToken = ""; showLogin(); } catch (error) { $("#status").textContent = error.message; } });
  $("#refresh").addEventListener("click", () => loadList().catch((error) => { $("#status").textContent = error.message; }));
  $("#search").addEventListener("change", () => { state.query = $("#search").value.trim(); state.page = 1; loadList().catch((error) => { $("#status").textContent = error.message; }); });
  $("#page-size").addEventListener("change", () => { state.pageSize = Number($("#page-size").value); state.page = 1; loadList().catch((error) => { $("#status").textContent = error.message; }); });
  $("#prev").addEventListener("click", () => { if (state.page > 1) { state.page -= 1; loadList().catch((error) => { $("#status").textContent = error.message; }); } });
  $("#next").addEventListener("click", () => { if (state.page < state.totalPages) { state.page += 1; loadList().catch((error) => { $("#status").textContent = error.message; }); } });
  $("#close-detail").addEventListener("click", () => { $("#detail").hidden = true; state.detailTrigger?.focus(); });
  $("#rows").addEventListener("click", async (event) => { const detailId = event.target.dataset.detail; const revokeId = event.target.dataset.revoke; try { if (detailId) { const body = await request(`/admin/api/publications/${detailId}`); $("#detail-body").innerHTML = renderDetail(body); state.detailTrigger = event.target; $("#detail").hidden = false; $("#detail").focus(); $("#detail").scrollIntoView({ behavior: "smooth", block: "start" }); } if (revokeId && confirm(t("confirmRevoke"))) { await request(`/admin/api/publications/${revokeId}/revoke`, { method: "POST", headers: { "x-admin-csrf": state.csrfToken } }); if (state.page > 1 && state.page > state.totalPages) state.page -= 1; await loadList(); } } catch (error) { $("#status").textContent = error.message; } });

  /* Options come from the engine's registry, exactly as in the studio, and the
     choice is written to the same storage key — so switching here is the same
     decision as switching there. The table is re-rendered because its cells
     are built from the dictionary rather than bound with data-i18n; a failure
     is reported rather than swallowed. */
  const languageSelect = $("#language-select");
  if (I18n && languageSelect) {
    languageSelect.innerHTML = I18n.getLanguages().map(({ language, label }) => `<option value="${escapeHtml(language)}">${escapeHtml(label)}</option>`).join("");
    languageSelect.value = I18n.getLanguage();
    languageSelect.addEventListener("change", () => { I18n.setLanguage(languageSelect.value); });
    I18n.subscribe(() => {
      languageSelect.value = I18n.getLanguage();
      if (appView.hidden) return;
      loadList().catch((error) => { $("#status").textContent = error.message; });
    });
    // index.html applies the language in <head>, before the body was parsed.
    I18n.applyDom(document);
  }

  request("/admin/api/session").then((body) => { state.csrfToken = body.csrfToken; showApp(); return loadList(); }).catch(() => showLogin());
})();
