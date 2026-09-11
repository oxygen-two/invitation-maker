(() => {
  const state = { page: 1, pageSize: 20, query: "", csrfToken: "", totalPages: 0 };
  const $ = (selector) => document.querySelector(selector);
  const loginView = $("#login-view");
  const appView = $("#app-view");
  const ERROR_MESSAGES = { ADMIN_AUTH_REQUIRED: "로그인이 필요합니다.", INVALID_ADMIN_PASSWORD: "비밀번호가 올바르지 않습니다.", LOGIN_RATE_LIMITED: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.", CSRF_INVALID: "요청이 만료되었습니다. 새로고침 후 다시 시도해주세요.", NOT_FOUND: "요청한 항목을 찾을 수 없습니다.", REPOSITORY_UNAVAILABLE: "일시적으로 서비스를 사용할 수 없습니다.", BAD_REQUEST: "요청이 올바르지 않습니다.", METHOD_NOT_ALLOWED: "허용되지 않는 요청입니다." };
  const describeError = (code) => ERROR_MESSAGES[code] || "요청에 실패했습니다.";
  const request = async (url, options = {}) => {
    const response = await fetch(url, { credentials: "same-origin", ...options });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(describeError(body?.error));
    return body;
  };
  const showApp = () => { loginView.hidden = true; appView.hidden = false; };
  const showLogin = () => { loginView.hidden = false; appView.hidden = true; };
  const formatDate = (value) => value ? new Date(value).toLocaleString("ko-KR") : "없음";
  const loadList = async () => {
    const result = await request(`/admin/api/publications?page=${state.page}&pageSize=${state.pageSize}&q=${encodeURIComponent(state.query)}`);
    state.totalPages = result.pagination.totalPages;
    $("#rows").innerHTML = result.items.length ? result.items.map((item) => `<tr><td>${escapeHtml(item.title)}</td><td><code>${item.id}</code></td><td>${formatDate(item.createdAt)}</td><td>${formatDate(item.expiresAt)}</td><td class="actions"><button data-detail="${item.id}">상세</button><a href="${item.publicUrl}" target="_blank" rel="noreferrer"><button class="secondary">열기</button></a><button class="danger" data-revoke="${item.id}">폐기</button></td></tr>`).join("") : `<tr><td colspan="5">발행된 초대장이 없습니다.</td></tr>`;
    $("#status").textContent = `${result.pagination.totalItems}개 발행 · ${result.pagination.page} / ${Math.max(1, result.pagination.totalPages)} 페이지`;
    $("#page-label").textContent = `${state.page} / ${Math.max(1, state.totalPages)}`;
    $("#prev").disabled = state.page <= 1;
    $("#next").disabled = state.page >= state.totalPages;
  };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[char]));
  const detailRow = (label, value) => value ? `<dt>${label}</dt><dd>${value}</dd>` : "";
  const detailCourseItems = (items) => (items || []).filter((item) => item.type === "course").map((item) => `<li><strong>${escapeHtml(item.time || "")} ${escapeHtml(item.label || "")}</strong>${item.place ? ` · ${escapeHtml(item.place)}` : ""}${item.note ? `<br>${escapeHtml(item.note)}` : ""}</li>`).join("");
  const renderDetail = (body) => {
    const invitation = body.invitation || {};
    const fields = [
      detailRow("제목", escapeHtml(body.title)),
      detailRow("ID", `<code>${escapeHtml(body.id)}</code>`),
      detailRow("발행일", formatDate(body.createdAt)),
      detailRow("만료", formatDate(body.expiresAt)),
      detailRow("공개 링크", `<a href="${escapeHtml(body.publicUrl)}" target="_blank" rel="noreferrer">${escapeHtml(body.publicUrl)}</a>`)
    ].join("");
    const invitationFields = [
      detailRow("주최자", invitation.host && escapeHtml(invitation.host)),
      detailRow("날짜", invitation.dateLabel && escapeHtml(invitation.dateLabel)),
      detailRow("장소", invitation.location && escapeHtml(invitation.location)),
      detailRow("메시지", invitation.message && escapeHtml(invitation.message)),
      detailRow("템플릿", invitation.templateId && escapeHtml(invitation.templateId)),
      detailRow("레이아웃", invitation.layoutFamily && escapeHtml(invitation.layoutFamily)),
      detailRow("인트로 효과", invitation.introEffect && escapeHtml(invitation.introEffect)),
      detailRow("파티클 효과", invitation.particleEffect && escapeHtml(invitation.particleEffect)),
      detailRow("폰트", (invitation.koreanFont || invitation.englishFont) && escapeHtml([invitation.koreanFont, invitation.englishFont].filter(Boolean).join(" / ")))
    ].join("");
    const courseItems = detailCourseItems(invitation.items);
    return `<dl class="detail-fields">${fields}</dl><h3>초대장 정보</h3><dl class="detail-fields">${invitationFields}</dl>${courseItems ? `<h3>코스 안내</h3><ol class="detail-courses">${courseItems}</ol>` : ""}<details class="detail-raw"><summary>원본 데이터 보기</summary><pre>${escapeHtml(JSON.stringify(body, null, 2))}</pre></details>`;
  };
  $("#login-form").addEventListener("submit", async (event) => { event.preventDefault(); $("#login-error").textContent = ""; try { const body = await request("/admin/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: $("#password").value }) }); state.csrfToken = body.csrfToken; $("#password").value = ""; showApp(); await loadList(); } catch (error) { $("#login-error").textContent = error.message; } });
  $("#logout").addEventListener("click", async () => { try { await request("/admin/api/logout", { method: "POST", headers: { "x-admin-csrf": state.csrfToken } }); state.csrfToken = ""; showLogin(); } catch (error) { $("#status").textContent = error.message; } });
  $("#refresh").addEventListener("click", () => loadList().catch((error) => { $("#status").textContent = error.message; }));
  $("#search").addEventListener("change", () => { state.query = $("#search").value.trim(); state.page = 1; loadList().catch((error) => { $("#status").textContent = error.message; }); });
  $("#page-size").addEventListener("change", () => { state.pageSize = Number($("#page-size").value); state.page = 1; loadList().catch((error) => { $("#status").textContent = error.message; }); });
  $("#prev").addEventListener("click", () => { if (state.page > 1) { state.page -= 1; loadList().catch((error) => { $("#status").textContent = error.message; }); } });
  $("#next").addEventListener("click", () => { if (state.page < state.totalPages) { state.page += 1; loadList().catch((error) => { $("#status").textContent = error.message; }); } });
  $("#close-detail").addEventListener("click", () => { $("#detail").hidden = true; state.detailTrigger?.focus(); });
  $("#rows").addEventListener("click", async (event) => { const detailId = event.target.dataset.detail; const revokeId = event.target.dataset.revoke; try { if (detailId) { const body = await request(`/admin/api/publications/${detailId}`); $("#detail-body").innerHTML = renderDetail(body); state.detailTrigger = event.target; $("#detail").hidden = false; $("#detail").focus(); $("#detail").scrollIntoView({ behavior: "smooth", block: "start" }); } if (revokeId && confirm("이 발행 링크를 폐기할까요?")) { await request(`/admin/api/publications/${revokeId}/revoke`, { method: "POST", headers: { "x-admin-csrf": state.csrfToken } }); if (state.page > 1 && state.page > state.totalPages) state.page -= 1; await loadList(); } } catch (error) { $("#status").textContent = error.message; } });
  request("/admin/api/session").then((body) => { state.csrfToken = body.csrfToken; showApp(); return loadList(); }).catch(() => showLogin());
})();
