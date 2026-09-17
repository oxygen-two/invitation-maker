/* Landing / guide behaviour. Deliberately tiny: the language switcher and
   a couple of analytics events. Anything heavier belongs in the studio. */
(function siteScript(root) {
  const I18n = root.InvitationI18n;
  const analytics = root.InvitationAnalytics;
  const escapeAttribute = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

  const populateLanguageSwitcher = (select) => {
    if (!select || !I18n) return;
    select.innerHTML = I18n.getLanguages()
      .map(({ language, label }) => `<option value="${escapeAttribute(language)}">${escapeAttribute(label)}</option>`)
      .join("");
    select.value = I18n.getLanguage();
    select.addEventListener("change", () => { I18n.setLanguage(select.value); });
    I18n.subscribe(() => { select.value = I18n.getLanguage(); });
  };

  const track = (eventName, props) => {
    try { analytics?.track?.(eventName, props); } catch { /* analytics is optional */ }
  };

  const init = () => {
    try { analytics?.init?.(); } catch { /* optional */ }
    try { root.InvitationErrorReporting?.init?.(); } catch { /* optional */ }
    populateLanguageSwitcher(document.querySelector("#language-select"));
    I18n?.applyDom(document);
    track("site_page_viewed", { page: document.body.dataset.sitePage });
    for (const element of document.querySelectorAll("[data-site-event]")) {
      element.addEventListener("click", () => {
        track(element.dataset.siteEvent, { placement: element.dataset.sitePlacement, page: document.body.dataset.sitePage });
      });
    }
  };

  root.InvitationSite = { init };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(typeof window !== "undefined" ? window : globalThis);
