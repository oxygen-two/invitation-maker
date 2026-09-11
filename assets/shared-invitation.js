(function (root) {
  const InvitationCore = (() => {
    if (typeof module !== "undefined" && module.exports) {
      try { return require("./invitation-core.js"); } catch { return null; }
    }
    return root.InvitationCore || null;
  })();
  const strings = Object.freeze({
    failed: "초대장을 불러오지 못했습니다.",
    loading: "초대장을 불러오는 중입니다.",
    notFound: "초대장을 찾을 수 없습니다."
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
    const setStatus = (message) => { if (status) status.textContent = message; };
    const id = resolveId(location);
    setStatus(strings.loading);
    if (!id) {
      setStatus(strings.notFound);
      return null;
    }
    try {
      const response = await fetch(`/api/invitations/${encodeURIComponent(id)}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        referrerPolicy: "no-referrer"
      });
      if (!response.ok) {
        setStatus(response.status === 404 || response.status === 410 ? strings.notFound : strings.failed);
        return null;
      }
      const data = await response.json();
      renderFrame(frame, data.invitation);
      setStatus(data.expiresAt ? `만료: ${data.expiresAt}` : "");
      return data;
    } catch {
      setStatus(strings.failed);
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
