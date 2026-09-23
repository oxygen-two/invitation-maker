/* Landing / guide behaviour. Deliberately tiny: the language switcher and
   a couple of analytics events. Anything heavier belongs in the studio. */
(function siteScript(root) {
  const I18n = root.InvitationI18n;
  const analytics = root.InvitationAnalytics;
  const { escapeHtml } = root.InvitationText;

  const populateLanguageSwitcher = (select) => {
    if (!select || !I18n) return;
    select.innerHTML = I18n.getLanguages()
      .map(({ language, label }) => `<option value="${escapeHtml(language)}">${escapeHtml(label)}</option>`)
      .join("");
    select.value = I18n.getLanguage();
    select.addEventListener("change", () => { I18n.setLanguage(select.value); });
    I18n.subscribe(() => { select.value = I18n.getLanguage(); });
  };

  const track = (eventName, props) => {
    try { analytics?.track?.(eventName, props); } catch { /* analytics is optional */ }
  };

  /* The language swap itself is defined by the inline block in each page's
     <head>, which settles the pictures before the browser decides what to
     download — by the time this deferred file runs, those requests are long
     gone. What is left for site.js is the part that only matters later:
     re-applying on a language change, which is the switcher right above, and
     covering any element the head observer did not see because it was added
     after the document was parsed. */
  const applySiteMedia = (language = I18n?.getLanguage?.()) => root.InvitationSiteMedia?.apply?.(language);

  const init = () => {
    try { analytics?.init?.(); } catch { /* optional */ }
    try { root.InvitationErrorReporting?.init?.(); } catch { /* optional */ }
    populateLanguageSwitcher(document.querySelector("#language-select"));
    I18n?.applyDom(document);
    /* The head has already applied the resolved language; this re-run is for
       anything parsed after the observer disconnected, and the subscription
       is what follows the switcher. */
    applySiteMedia();
    I18n?.subscribe?.((language) => applySiteMedia(language));
    track("site_page_viewed", { page: document.body.dataset.sitePage });
    for (const element of document.querySelectorAll("[data-site-event]")) {
      element.addEventListener("click", () => {
        track(element.dataset.siteEvent, { placement: element.dataset.sitePlacement, page: document.body.dataset.sitePage });
      });
    }
  };

  root.InvitationSite = { applySiteMedia, init };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(typeof window !== "undefined" ? window : globalThis);
