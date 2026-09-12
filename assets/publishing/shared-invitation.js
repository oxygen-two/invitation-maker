(function (root) {
  const InvitationCore = (() => {
    if (typeof module !== "undefined" && module.exports) {
      try { return require("../invitation/core.js"); } catch { return null; }
    }
    return root.InvitationCore || null;
  })();
  const I18n = (() => {
    if (typeof module !== "undefined" && module.exports) {
      try {
        const engine = require("../i18n/i18n.js");
        try {
          engine.register("ko", require("../i18n/dictionary-ko.js"));
          engine.register("en", require("../i18n/dictionary-en.js"));
        } catch {
          // Resolution still works without dictionaries.
        }
        return engine;
      } catch {
        return null;
      }
    }
    return root.InvitationI18n || null;
  })();

  /* Two languages live on this page, and conflating them is the bug this file
     exists to avoid.

     THE PAGE CHROME — the loading line, the not-found / expired / failed
     panels, the header and footer revealed alongside them — is the product
     speaking to a GUEST. That guest arrived from a link, has never opened the
     studio, and made no choice in it. So the chrome follows their own browser
     language (shared.html runs InvitationI18n.init() before this file loads).
     On the not-found path there is not even an author to defer to: nothing was
     found, so the only person in the room is the reader.

     THE INVITATION INSIDE THE FRAME is somebody else's finished document. Its
     baked chrome ("안내", the map button, the skip button) belongs to the
     author, exactly as it does in a downloaded file — a Korean invitation must
     not sprout English labels because an English speaker opened the link, and
     an English one must not sprout Korean ones. But a PUBLISHED invitation
     carries no record of the language its author was working in: the stored
     document is whatever normalizeInvitation emits, and adding a field to it
     would mean changing the publish payload, server/validation.cjs and every
     stored record. So the frame is rendered in the product's home language,
     which is what every publication to date was in fact authored and previewed
     in. It is emphatically NOT the guest's language, because that would be
     translating a stranger's document to suit the reader. */
  const pageLanguage = (override) =>
    (I18n?.normalizeLanguage?.(override) ?? null)
    || I18n?.getLanguage?.()
    || I18n?.DEFAULT_LANGUAGE
    || "ko";
  const FRAME_LANGUAGE = I18n?.DEFAULT_LANGUAGE || "ko";
  const t = (key, values, language) => I18n?.t(key, values, language) ?? String(key);

  /* Which panel answers which failure:
       notFound — wrong or typo'd link, or one that never existed. A manual
         revoke deletes the record outright and an expired publication on the
         MongoDB-backed API is hidden by the read, so both land here too.
       gone — HTTP 410, for any deployment that answers with a closed viewing
         window rather than hiding the record.
       failed — network hiccup or server error. Worth a retry, not a dead link.

     Anything else falls back to `failed`, which is the only one of the three
     that invites the guest to try again. */
  const ERROR_KINDS = Object.freeze(["notFound", "gone", "failed"]);
  const resolveId = (location = root.location) => {
    const match = String(location?.pathname || "").match(/\/i\/([A-Za-z0-9]{1,64})\/?$/);
    return match?.[1] || "";
  };
  const renderFrame = (frame, invitation, { language = FRAME_LANGUAGE } = {}) => {
    if (!InvitationCore?.buildStandaloneHtml) throw new Error("InvitationCore is unavailable");
    frame.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.srcdoc = InvitationCore.buildStandaloneHtml(invitation, { language });
    frame.hidden = false;
  };
  const mount = async ({
    document = root.document,
    fetch = root.fetch?.bind(root),
    language,
    location = root.location
  } = {}) => {
    const reader = pageLanguage(language);
    const say = (key, values) => t(`shared.${key}`, values, reader);
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
      const kind = ERROR_KINDS.includes(key) ? key : "failed";
      setStatus("");
      if (errorEyebrow) errorEyebrow.textContent = say(`${kind}Eyebrow`);
      if (errorTitle) errorTitle.textContent = say(`${kind}Title`);
      if (errorDescription) errorDescription.textContent = say(`${kind}Description`);
      if (errorHint) errorHint.textContent = say(`${kind}Hint`);
      if (errorPanel) errorPanel.hidden = false;
      if (header) header.hidden = false;
      if (footer) footer.hidden = false;
    };
    const id = resolveId(location);
    setStatus(say("loading"));
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
      // Formatted for the reader — an expiry date is the product telling the
      // guest something, not part of the author's document.
      setStatus(data.expiresAt
        ? say("expires", {
          date: I18n?.formatDateTime(data.expiresAt, { dateStyle: "medium", timeStyle: "short" }, reader)
            || data.expiresAt
        })
        : "");
      return data;
    } catch {
      showError("failed");
      return null;
    }
  };
  const api = { mount, renderFrame, resolveId };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SharedInvitation = api;
  /* shared.html resolves and applies the language in <head> so <html lang> and
     the tab title are right for the first paint; the body had not been parsed
     at that point, so its bound nodes get this second pass. */
  const boot = () => {
    I18n?.applyDom?.(root.document);
    mount();
  };
  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
