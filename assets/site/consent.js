/* Cookie and analytics consent.

   One job: hold a single durable answer to "may we load analytics?" and show
   a banner until the visitor has given one. Dependency-free on purpose — it
   is loaded by the landing, the guide, the two legal pages, the studio, the
   guest page and the local viewer, and only the first four of those share a
   stylesheet, so this file brings its own markup and its own CSS.

   The answer lives in localStorage["invitation-maker.consent"] as exactly
   "granted" or "denied"; anything else (including a value another script
   wrote) reads as "no answer yet" and the banner comes back. Nothing is
   queued before an answer: an event that happened while analytics were off
   stays un-sent rather than being replayed after a later "accept".

   Error diagnostics are deliberately NOT gated on this. They carry a closed
   set of error categories, a shipped script path and a line number, and no
   authored content (see the header of assets/analytics/error-reporting.js),
   so they are treated as necessary to keep the service working. The privacy
   page says so in its own words.

   Colours come from whichever token layer the host page defines — the site
   chrome's --card/--ink/--line/--green (which flip for dark mode) or the
   studio's --studio-* (which are light-only by design). The literal at the
   end of each var() chain is the last resort for a page with neither. */
(function exposeConsent(root) {
  const STORAGE_KEY = "invitation-maker.consent";
  const GRANTED = "granted";
  const DENIED = "denied";
  const CHOICES = [GRANTED, DENIED];
  const STYLE_ID = "invitation-consent-style";
  const BANNER_ID = "invitation-consent";
  const SETTINGS_SELECTOR = "[data-consent-settings]";

  const listeners = new Set();
  let banner = null;
  let previousBodyPadding = null;

  const documentRef = () => root.document || null;

  const storage = () => {
    try {
      return root.localStorage || null;
    } catch {
      // Private-mode Safari throws on any localStorage access.
      return null;
    }
  };

  const get = () => {
    try {
      const value = storage()?.getItem(STORAGE_KEY);
      return CHOICES.includes(value) ? value : "";
    } catch {
      return "";
    }
  };

  const notify = (choice) => {
    for (const listener of listeners) {
      try {
        listener(choice);
      } catch {
        // One bad subscriber must not strand the rest on the old choice.
      }
    }
  };

  /* Analytics modules read the stored value themselves, so they do not depend
     on this file being loaded. What they cannot do is notice a choice made
     after they booted — hence this nudge, and only in the granting direction:
     a provider that was never initialised has nothing to tear down. */
  const startAnalytics = () => {
    try {
      root.InvitationAnalytics?.init?.();
    } catch {
      // Analytics must never interrupt the page.
    }
    try {
      root.InvitationAnalyticsGA4?.init?.();
    } catch {
      // Same.
    }
  };

  const set = (value) => {
    if (!CHOICES.includes(value)) return false;
    try {
      storage()?.setItem(STORAGE_KEY, value);
    } catch {
      // A visitor with storage denied gets asked again next page. That is
      // better than silently behaving as if they had accepted.
    }
    hide();
    if (value === GRANTED) startAnalytics();
    notify(value);
    return true;
  };

  const onChange = (listener) => {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const translate = (key, fallback) => {
    try {
      const value = root.InvitationI18n?.t?.(key);
      return typeof value === "string" && value && value !== key ? value : fallback;
    } catch {
      return fallback;
    }
  };

  const CSS = `
#${BANNER_ID} {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2147483000;
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px 20px;
  margin: 0;
  padding: 12px 20px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  background: var(--card, var(--studio-surface, #ffffff));
  color: var(--ink, var(--studio-ink, #282b29));
  border-top: 1px solid var(--line, var(--studio-line, #dce1d8));
  box-shadow: 0 -10px 30px rgba(0, 0, 0, .14);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.6;
  word-break: keep-all;
}
#${BANNER_ID}[hidden] { display: none; }
#${BANNER_ID} .invitation-consent-text { margin: 0; flex: 1 1 320px; }
#${BANNER_ID} a {
  color: var(--green, var(--studio-accent, #314e41));
  font-weight: 600;
  white-space: nowrap;
}
#${BANNER_ID} .invitation-consent-actions { display: flex; flex-wrap: wrap; gap: 10px; }
#${BANNER_ID} button {
  min-height: 44px;
  min-width: 44px;
  padding: 10px 18px;
  border-radius: 9px;
  border: 1px solid transparent;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
#${BANNER_ID} .invitation-consent-accept {
  background: var(--green, var(--studio-accent, #314e41));
  color: var(--accent-ink, var(--studio-accent-ink, #ffffff));
}
#${BANNER_ID} .invitation-consent-deny {
  background: transparent;
  color: inherit;
  border-color: var(--ring, var(--studio-control-line, #b7c3b5));
}
#${BANNER_ID} a:focus-visible,
#${BANNER_ID} button:focus-visible {
  outline: 3px solid var(--green, var(--studio-accent, #314e41));
  outline-offset: 3px;
}
@media (max-width: 600px) {
  #${BANNER_ID} { justify-content: stretch; }
  #${BANNER_ID} .invitation-consent-actions { width: 100%; }
  #${BANNER_ID} .invitation-consent-actions button { flex: 1 1 auto; }
}
`;

  const injectStyle = (doc) => {
    if (doc.getElementById?.(STYLE_ID)) return true;
    const head = doc.head || doc.documentElement;
    if (!head?.append) return false;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    head.append(style);
    return true;
  };

  const bind = (node, key, fallback) => {
    node.setAttribute("data-i18n", key);
    node.textContent = translate(key, fallback);
    return node;
  };

  const build = (doc) => {
    const region = doc.createElement("aside");
    region.id = BANNER_ID;
    region.setAttribute("role", "region");
    region.setAttribute("tabindex", "-1");
    region.setAttribute("data-i18n-attr", "aria-label:consent.regionLabel");
    region.setAttribute("aria-label", translate("consent.regionLabel", "Cookie and analytics choice"));

    const text = doc.createElement("p");
    text.className = "invitation-consent-text";
    text.append(
      bind(doc.createElement("span"), "consent.message", "May we turn on visit analytics? What you write in an invitation is never sent to them."),
      doc.createTextNode(" ")
    );
    const link = doc.createElement("a");
    link.href = "/privacy";
    text.append(bind(link, "consent.privacyLink", "Read the privacy policy"));

    const actions = doc.createElement("div");
    actions.className = "invitation-consent-actions";
    const accept = doc.createElement("button");
    accept.type = "button";
    accept.className = "invitation-consent-accept";
    accept.addEventListener("click", () => set(GRANTED));
    const deny = doc.createElement("button");
    deny.type = "button";
    deny.className = "invitation-consent-deny";
    deny.addEventListener("click", () => set(DENIED));
    actions.append(
      bind(accept, "consent.accept", "Accept analytics"),
      bind(deny, "consent.deny", "Essential only")
    );

    region.append(text, actions);
    return region;
  };

  /* The banner is fixed to the bottom of the viewport, which on a short page
     sits on top of the footer — including the privacy link it points at. So
     while it is open the body reserves exactly its height, and gives that
     space back when it closes. An inline style rather than a class because
     the six pages that load this file lay their bodies out three different
     ways and none of them should have to know about this element. */
  const reserveSpace = (open) => {
    const body = documentRef()?.body;
    if (!body?.style) return;
    if (!open) {
      body.style.paddingBottom = previousBodyPadding;
      return;
    }
    if (previousBodyPadding === null) previousBodyPadding = body.style.paddingBottom || "";
    const height = Number(banner?.offsetHeight) || 0;
    if (height > 0) body.style.paddingBottom = `${height}px`;
  };

  const hide = () => {
    if (!banner) return;
    banner.hidden = true;
    reserveSpace(false);
  };

  /* `focus` is true only when a person asked for the banner back from the
     privacy page. On a first visit the banner must not steal focus from the
     page the visitor came to read. */
  const open = ({ focus = false } = {}) => {
    const doc = documentRef();
    if (!doc?.createElement || !doc.body?.append) return false;
    if (!banner || !banner.isConnected) {
      if (!injectStyle(doc)) return false;
      banner = build(doc);
      doc.body.append(banner);
    }
    banner.hidden = false;
    reserveSpace(true);
    if (focus) {
      try {
        banner.querySelector("button")?.focus();
      } catch {
        // Focus is a nicety, not a requirement.
      }
    }
    return true;
  };

  const bindSettingsControls = (doc) => {
    if (typeof doc.querySelectorAll !== "function") return;
    for (const control of doc.querySelectorAll(SETTINGS_SELECTOR)) {
      control.addEventListener("click", () => open({ focus: true }));
    }
  };

  const init = () => {
    const doc = documentRef();
    if (!doc) return "";
    const choice = get();
    bindSettingsControls(doc);
    if (choice === GRANTED) startAnalytics();
    if (!choice) open();
    return choice;
  };

  const api = {
    DENIED,
    GRANTED,
    STORAGE_KEY,
    get,
    init,
    onChange,
    open,
    set
  };

  root.InvitationConsent = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  const doc = documentRef();
  if (doc) {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
