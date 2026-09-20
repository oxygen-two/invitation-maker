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

  /* Language-aware images.

     The landing and the guide photograph the studio, and the studio is
     translated, so the pictures are translated too: scripts/build-site-media.cjs
     renders every one of them once per site language. An element that takes
     part names both renders — data-src-ko / data-src-en, and the matching
     data-srcset-* when it has candidates — and this moves the live attribute
     between them whenever the language resolves or changes.

     The Korean render is what the markup ships in `src`, so it is what the
     document serves on its own. That is deliberate: a reader with no
     JavaScript, and every crawler that does not run one, gets a real picture
     rather than an empty frame, and the swap is only ever a move from that
     default to the other member of the pair — never from nothing to something.

     Both <img> and <source> are matched, so wrapping the hero in a <picture>
     later swaps its <source srcset> as one unit with the <img src> underneath
     and no candidate is left behind from the previous language. Nothing is
     touched when a language names no file: the served default stays, which is
     a picture in the wrong language but still a picture. */
  const datasetKey = (prefix, language) => `${prefix}${language.charAt(0).toUpperCase()}${language.slice(1)}`;

  const applySiteMedia = (language = I18n?.getLanguage?.()) => {
    if (!language) return;
    const srcKey = datasetKey("src", language);
    const srcsetKey = datasetKey("srcset", language);
    for (const node of document.querySelectorAll("[data-site-media]")) {
      for (const [attribute, key] of [["src", srcKey], ["srcset", srcsetKey]]) {
        const value = node.dataset?.[key];
        if (value && node.getAttribute(attribute) !== value) node.setAttribute(attribute, value);
      }
    }
  };

  const init = () => {
    try { analytics?.init?.(); } catch { /* optional */ }
    try { root.InvitationErrorReporting?.init?.(); } catch { /* optional */ }
    populateLanguageSwitcher(document.querySelector("#language-select"));
    I18n?.applyDom(document);
    /* init() resolves the language in <head> with notify:false, so the first
       swap has to be called rather than waited for; the subscription covers
       every change after it. */
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
