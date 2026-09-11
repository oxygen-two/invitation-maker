(function (root) {
  const InvitationCore = (() => {
    if (typeof module !== "undefined" && module.exports) {
      try { return require("../invitation/core.js"); } catch { return null; }
    }
    return root.InvitationCore || null;
  })();
  const strings = Object.freeze({
    loading: "초대장을 불러오는 중입니다.",
    errors: {
      // Wrong/typo'd link, or a link that never existed.
      notFound: Object.freeze({
        eyebrow: "A LITTLE DETOUR",
        title: "초대장을 찾을 수 없습니다.",
        description: "주소가 달라졌거나, 더 이상 사용할 수 없는 링크일 수 있어요.",
        hint: "초대장을 받으셨다면 보내준 분에게 링크를 다시 확인해 주세요."
      }),
      // The record carried a set viewing window and that window has passed
      // (HTTP 410). A manual revoke deletes the record outright, so that
      // case surfaces through the 404 branch above instead.
      gone: Object.freeze({
        eyebrow: "THIS CHAPTER IS CLOSED",
        title: "초대장이 만료되었습니다.",
        description: "설정된 열람 기간이 지나 더 이상 볼 수 없어요.",
        hint: "초대장을 보내준 분에게 새로운 링크를 요청해 주세요."
      }),
      // Network hiccup or server error — worth a retry, not a dead link.
      failed: Object.freeze({
        eyebrow: "A BRIEF PAUSE",
        title: "초대장을 불러오지 못했습니다.",
        description: "일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
        hint: "오류가 계속되면 잠시 후 다시 방문해 주세요."
      })
    }
  });
  const resolveId = (location = root.location) => {
    const match = String(location?.pathname || "").match(/\/i\/([A-Za-z0-9]{1,64})\/?$/);
    return match?.[1] || "";
  };
  const renderFrame = (frame, invitation) => {
    if (!InvitationCore?.buildStandaloneHtml) throw new Error("InvitationCore is unavailable");
    frame.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.srcdoc = InvitationCore.buildStandaloneHtml(invitation);
    frame.hidden = false;
  };
  const mount = async ({
    document = root.document,
    fetch = root.fetch?.bind(root),
    location = root.location
  } = {}) => {
    const rootNode = document?.querySelector?.("#shared-invitation-root");
    const frame = document?.querySelector?.("#shared-invitation-frame");
    const status = document?.querySelector?.("#shared-invitation-status");
    if (!rootNode || !frame || typeof fetch !== "function") return null;
    const header = document?.querySelector?.("#shared-invitation-header");
    const footer = document?.querySelector?.("#shared-invitation-footer");
    const errorPanel = document?.querySelector?.("#shared-invitation-error");
    const errorEyebrow = document?.querySelector?.("#shared-invitation-error-eyebrow");
    const errorTitle = document?.querySelector?.("#shared-invitation-error-title");
    const errorDescription = document?.querySelector?.("#shared-invitation-error-description");
    const errorHint = document?.querySelector?.("#shared-invitation-error-hint");
    const setStatus = (message) => { if (status) status.textContent = message; };
    // Reveal the full header/footer/error-page chrome. Kept off the success
    // and loading states so a working invitation's iframe still fills the
    // viewport with no chrome around it.
    const showError = (key) => {
      const copy = strings.errors[key] || strings.errors.failed;
      setStatus("");
      if (errorEyebrow) errorEyebrow.textContent = copy.eyebrow;
      if (errorTitle) errorTitle.textContent = copy.title;
      if (errorDescription) errorDescription.textContent = copy.description;
      if (errorHint) errorHint.textContent = copy.hint;
      if (errorPanel) errorPanel.hidden = false;
      if (header) header.hidden = false;
      if (footer) footer.hidden = false;
    };
    const id = resolveId(location);
    setStatus(strings.loading);
    if (!id) {
      showError("notFound");
      return null;
    }
    try {
      const response = await fetch(`/api/invitations/${encodeURIComponent(id)}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        referrerPolicy: "no-referrer"
      });
      if (!response.ok) {
        showError(response.status === 410 ? "gone" : response.status === 404 ? "notFound" : "failed");
        return null;
      }
      const data = await response.json();
      renderFrame(frame, data.invitation);
      setStatus(data.expiresAt ? `만료: ${data.expiresAt}` : "");
      return data;
    } catch {
      showError("failed");
      return null;
    }
  };
  const api = { mount, renderFrame, resolveId };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SharedInvitation = api;
  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", () => mount());
    else mount();
  }
})(typeof window !== "undefined" ? window : globalThis);
