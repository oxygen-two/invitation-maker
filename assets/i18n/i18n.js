/* Language engine for the studio.

   Deliberately dependency-free and split three ways:
     i18n.js          the engine — resolution, persistence, lookup, Intl
     dictionary-*.js  one file per language, self-registering
     content-*.json   sample-content overlay onto invitation-data.json

   Splitting the engine from the dictionaries means the resolution rules can be
   tested without loading a single translated string, and adding a language is
   purely additive: drop in dictionary-xx.js, content-xx.json, and one entry in
   LOCALES. Nothing here knows what surfaces exist. */
(function exposeI18n(root, factory) {
  const i18n = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = i18n;
  }

  root.InvitationI18n = i18n;
})(typeof globalThis === "object" ? globalThis : this, function createI18n(root) {
  const DEFAULT_LANGUAGE = "ko";
  const STORAGE_KEY = "invitation-maker.language";
  const QUERY_KEY = "lang";

  /* The only place a new language is named. `locale` drives every Intl call;
     `label` names the language in its own words, because a switcher that says
     "영어" to someone who cannot read Korean is useless. */
  const LOCALES = Object.freeze({
    ko: Object.freeze({ locale: "ko-KR", label: "한국어", hour12: false }),
    en: Object.freeze({ locale: "en-US", label: "English", hour12: true })
  });

  const SUPPORTED = Object.freeze(Object.keys(LOCALES));

  const dictionaries = new Map();
  const listeners = new Set();
  let activeLanguage = DEFAULT_LANGUAGE;

  const register = (language, dictionary) => {
    if (!LOCALES[language] || !dictionary || typeof dictionary !== "object") return;
    dictionaries.set(language, dictionary);
  };

  /* "ko-KR", "KO", "ko_kr" and "ko" all mean Korean. Anything we do not ship a
     dictionary for resolves to null so the caller can fall through. */
  const normalizeLanguage = (value) => {
    const base = String(value || "").trim().toLowerCase().replace(/_/g, "-").split("-")[0];
    return SUPPORTED.includes(base) ? base : null;
  };

  const readStoredLanguage = () => {
    try {
      return normalizeLanguage(root.localStorage?.getItem(STORAGE_KEY));
    } catch {
      // Private-mode Safari throws on any localStorage access. Not fatal.
      return null;
    }
  };

  const writeStoredLanguage = (language) => {
    try {
      root.localStorage?.setItem(STORAGE_KEY, language);
      return true;
    } catch {
      return false;
    }
  };

  const readQueryLanguage = (search) => {
    const raw = search ?? root.location?.search ?? "";
    if (!raw) return null;
    try {
      return normalizeLanguage(new URLSearchParams(raw).get(QUERY_KEY));
    } catch {
      return null;
    }
  };

  const readNavigatorLanguage = (languages) => {
    const candidates = languages
      ?? root.navigator?.languages
      ?? (root.navigator?.language ? [root.navigator.language] : []);
    for (const candidate of candidates || []) {
      const normalized = normalizeLanguage(candidate);
      if (normalized) return normalized;
    }
    return null;
  };

  /* Resolution order, highest first:

     1. ?lang= in the URL. An explicit instruction attached to THIS page view.
        It is honoured but never written to storage, which is the whole point:
        a link someone shares can show you their language for one visit and
        still leave the choice you made on this device exactly as you left it.
     2. The stored override. The only thing the switcher writes, so it is the
        only signal that represents a decision this person actually made here.
     3. navigator.languages, first supported entry. The visitor's own
        browser-level preference — the best guess available before they
        have told us anything.
     4. Korean. The product's home language; Korean invitation convention is
        what the templates are designed around.

     Returned as {language, source} so callers can behave differently for a
     transient URL choice than for a remembered one. */
  const resolve = ({ search, stored, navigatorLanguages } = {}) => {
    const fromQuery = readQueryLanguage(search);
    if (fromQuery) return { language: fromQuery, source: "query" };

    const fromStorage = stored === undefined ? readStoredLanguage() : normalizeLanguage(stored);
    if (fromStorage) return { language: fromStorage, source: "stored" };

    const fromNavigator = readNavigatorLanguage(navigatorLanguages);
    if (fromNavigator) return { language: fromNavigator, source: "navigator" };

    return { language: DEFAULT_LANGUAGE, source: "default" };
  };

  const getLanguage = () => activeLanguage;
  const getLocale = (language = activeLanguage) => (LOCALES[language] || LOCALES[DEFAULT_LANGUAGE]).locale;
  const getLanguageLabel = (language) => (LOCALES[language] || LOCALES[DEFAULT_LANGUAGE]).label;
  const getLanguages = () => SUPPORTED.map((language) => ({ language, label: LOCALES[language].label }));

  const lookup = (dictionary, key) => {
    let cursor = dictionary;
    for (const segment of String(key).split(".")) {
      if (!cursor || typeof cursor !== "object") return undefined;
      cursor = cursor[segment];
    }
    return cursor;
  };

  const interpolate = (template, values) => String(template).replace(
    /\{(\w+)\}/g,
    (match, name) => (values && name in values ? String(values[name]) : match)
  );

  /* A dictionary entry may be a string, or an object of Intl plural categories
     ({one, other, ...}) selected against `count`. Keeping plural selection in
     the data rather than in call sites is what lets English say "1 design" and
     "12 designs" while Korean keeps one form for both. */
  const selectPluralForm = (entry, values, language) => {
    if (typeof entry === "string") return entry;
    if (!entry || typeof entry !== "object") return undefined;
    const count = Number(values?.count);
    if (!Number.isFinite(count)) return entry.other;
    try {
      const category = new Intl.PluralRules(getLocale(language)).select(count);
      return entry[category] ?? entry.other;
    } catch {
      return entry.other;
    }
  };

  /* A missing key returns the key itself.

     The alternative — falling back to Korean — renders something that looks
     deliberate, so a hole in the English dictionary would ship looking merely
     untranslated rather than broken. `gallery.showAll` on screen is
     unmistakably a bug and gets fixed. It also never renders "undefined".

     This is the last line of defence, not the first: the dictionaries are
     held to identical key sets by test, so a missing key should never reach
     a browser at all. */
  const translate = (key, values, language = activeLanguage) => {
    const entry = lookup(dictionaries.get(language), key);
    const form = selectPluralForm(entry, values, language);
    if (typeof form !== "string") return String(key);
    return interpolate(form, values);
  };

  const hasKey = (key, language = activeLanguage) =>
    typeof selectPluralForm(lookup(dictionaries.get(language), key), { count: 1 }, language) === "string";

  const intlCache = new Map();
  const cached = (kind, language, options, build) => {
    const cacheKey = `${kind}:${language}:${JSON.stringify(options)}`;
    if (!intlCache.has(cacheKey)) intlCache.set(cacheKey, build());
    return intlCache.get(cacheKey);
  };

  const toDate = (value) => {
    const date = value instanceof Date ? value : new Date(String(value ?? ""));
    return Number.isFinite(date.getTime()) ? date : null;
  };

  const formatDateTime = (value, options = {}, language = activeLanguage) => {
    const date = toDate(value);
    if (!date) return null;
    try {
      return cached("datetime", language, options, () =>
        new Intl.DateTimeFormat(getLocale(language), options)).format(date);
    } catch {
      return null;
    }
  };

  const formatNumber = (value, options = {}, language = activeLanguage) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return String(value ?? "");
    try {
      return cached("number", language, options, () =>
        new Intl.NumberFormat(getLocale(language), options)).format(numeric);
    } catch {
      return String(numeric);
    }
  };

  /* Callers hold percentages as whole numbers (a 100 range slider), so divide
     before handing them to Intl — which is what makes the unit render in the
     locale's own position and notation instead of a concatenated "%". */
  const formatPercent = (value, language = activeLanguage) =>
    formatNumber(Number(value) / 100, { style: "percent", maximumFractionDigits: 0 }, language);

  /* Sample and placeholder dates only.

     A dateLabel the author typed is free text and is rendered verbatim
     everywhere; nothing in the studio may reformat it. This builds the
     generated ones instead, and assembles them from Intl parts rather than
     handing Intl the whole job, because the invitation heroes give the date
     one line: the parts give correct month names, weekday names, day periods
     and hour cycle per locale while the layout stays roughly the width the
     templates were designed against. */
  const formatSampleDate = (value, language = activeLanguage) => {
    const date = toDate(value);
    if (!date) return "";
    const { hour12 } = LOCALES[language] || LOCALES[DEFAULT_LANGUAGE];
    let parts;
    try {
      parts = cached("sampledate", language, { hour12 }, () => new Intl.DateTimeFormat(getLocale(language), {
        year: "numeric",
        month: "short",
        day: "2-digit",
        weekday: "short",
        // A padded hour is right for a 24-hour clock ("14:00") and wrong for a
        // 12-hour one, where "02:00 PM" reads like a typo.
        hour: hour12 ? "numeric" : "2-digit",
        minute: "2-digit",
        hour12
      })).formatToParts(date);
    } catch {
      return "";
    }

    const part = (type) => parts.find((entry) => entry.type === type)?.value || "";
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const time = `${part("hour")}:${part("minute")}`;

    if (language === "ko") {
      return `${date.getFullYear()}.${month}.${day} (${part("weekday")}) ${time}`;
    }
    return `${part("weekday")}, ${part("month")} ${day}, ${date.getFullYear()} · ${time} ${part("dayPeriod")}`.trim();
  };

  /* DOM application -------------------------------------------------------
     data-i18n="key"                          replaces textContent
     data-i18n-attr="aria-label:key;title:key" replaces those attributes

     Everything is guarded because app.js also runs under a hand-built fake DOM
     in the contract tests, where documentElement and querySelectorAll may be
     absent. A translation layer must never be the reason a page fails to boot. */
  const parseAttributeBindings = (value) => String(value || "")
    .split(";")
    .map((pair) => pair.split(":"))
    .filter((pair) => pair.length === 2)
    .map(([attribute, key]) => [attribute.trim(), key.trim()])
    .filter(([attribute, key]) => attribute && key);

  const applyDom = (scope, language = activeLanguage) => {
    const target = scope || root.document;
    if (!target || typeof target.querySelectorAll !== "function") return;

    for (const node of target.querySelectorAll("[data-i18n]")) {
      node.textContent = translate(node.dataset?.i18n ?? node.getAttribute?.("data-i18n"), undefined, language);
    }
    for (const node of target.querySelectorAll("[data-i18n-attr]")) {
      const bindings = node.dataset?.i18nAttr ?? node.getAttribute?.("data-i18n-attr");
      for (const [attribute, key] of parseAttributeBindings(bindings)) {
        node.setAttribute?.(attribute, translate(key, undefined, language));
      }
    }
  };

  /* Screen readers pick their voice from this, and browser translation offers
     itself based on it, so it has to be the language actually on screen.

     The tab title comes from meta.title unless the page names its own key in
     <html data-i18n-title="...">. Every page that loads this engine is a
     different thing in a tab strip — the studio, a guest's invitation, the
     operator console — and a shared "Invitation Studio" on all of them would
     be wrong on two of the three. Same data-i18n convention as the elements,
     just hung on the element that already carries `lang`. */
  const DEFAULT_TITLE_KEY = "meta.title";
  const documentTitleKey = () =>
    root.document?.documentElement?.getAttribute?.("data-i18n-title") || DEFAULT_TITLE_KEY;

  const syncDocumentLanguage = (language = activeLanguage) => {
    const element = root.document?.documentElement;
    if (element?.setAttribute) element.setAttribute("lang", language);
    const titleKey = documentTitleKey();
    if (root.document?.title !== undefined && hasKey(titleKey, language)) {
      root.document.title = translate(titleKey, undefined, language);
    }
  };

  const subscribe = (listener) => {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const setLanguage = (value, { persist = true, notify = true } = {}) => {
    const language = normalizeLanguage(value);
    if (!language) return activeLanguage;
    const changed = language !== activeLanguage;
    activeLanguage = language;
    if (persist) writeStoredLanguage(language);
    syncDocumentLanguage(language);
    applyDom(root.document, language);
    if (notify) {
      for (const listener of listeners) {
        try {
          listener(language, { changed });
        } catch {
          // One bad subscriber must not strand the rest on the old language.
        }
      }
    }
    return activeLanguage;
  };

  /* Called once at boot. Persists nothing unless the visitor already had a
     stored choice, so a ?lang= link stays a one-visit thing. */
  const init = (options = {}) => {
    const { language, source } = resolve(options);
    setLanguage(language, { persist: source === "stored", notify: false });
    return { language, source };
  };

  return {
    DEFAULT_LANGUAGE,
    QUERY_KEY,
    STORAGE_KEY,
    SUPPORTED,
    applyDom,
    formatDateTime,
    formatNumber,
    formatPercent,
    formatSampleDate,
    getLanguage,
    getLanguageLabel,
    getLanguages,
    getLocale,
    hasKey,
    init,
    normalizeLanguage,
    register,
    resolve,
    setLanguage,
    subscribe,
    syncDocumentLanguage,
    t: translate
  };
});
