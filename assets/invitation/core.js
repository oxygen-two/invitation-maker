(function (root) {
  const noIntro = Object.freeze({
    normalizeEffect: () => "none",
    renderMarkup: () => "",
    getStyles: () => "",
    getStandaloneRuntime: () => ""
  });
  const noTemplateCatalog = Object.freeze({
    normalizeFamily: () => "romantic-story"
  });
  const noTemplateRenderers = Object.freeze({
    ensureStyles: () => null,
    getStyles: () => "",
    render: (_familyId, slots = {}) => `
      <article class="invitation-card" ${slots.articleAttributes || ""} data-layout-family="romantic-story">
        ${slots.particles || ""}
        <header class="invite-hero">
          <p class="invite-kicker">${slots.kicker || ""}</p>
          <h1>${slots.title || ""}</h1>
          <p class="invite-subtitle">${slots.subtitle || ""}</p>
        </header>
        <section class="invite-section invite-message">
          <p>${slots.message || ""}</p>
        </section>
        <section class="invite-section invite-meta">
          ${slots.meta || ""}
        </section>
        <section class="invite-section invite-timeline">
          ${slots.items || ""}
        </section>
        ${slots.map || ""}
        ${slots.mapLink || ""}
      </article>
    `
  });
  const noTemplateArt = Object.freeze({
    getDataUrl: () => ""
  });
  const noHeroImage = Object.freeze({
    normalizeCrop: () => ({ scale: 100, positionX: 50, positionY: 50 })
  });
  const InvitationIntro = (() => {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./intro-effects.js");
      } catch {
        return noIntro;
      }
    }
    return root.InvitationIntro || noIntro;
  })();
  const TemplateCatalog = (() => {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./template-catalog.js");
      } catch {
        return noTemplateCatalog;
      }
    }
    return root.TemplateCatalog || noTemplateCatalog;
  })();
  const TemplateRenderers = (() => {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./template-renderers.js");
      } catch {
        return noTemplateRenderers;
      }
    }
    return root.TemplateRenderers || noTemplateRenderers;
  })();
  const TemplateArt = (() => {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("./template-art.js");
      } catch {
        return noTemplateArt;
      }
    }
    return root.TemplateArt || noTemplateArt;
  })();
  const HeroImage = (() => {
    if (typeof module !== "undefined" && module.exports) {
      try {
        return require("../media/hero-image.js");
      } catch {
        return noHeroImage;
      }
    }
    return root.HeroImage || noHeroImage;
  })();
  /* The invitation's own chrome — the "안내" eyebrow, the map status, the map
     link, the intro skip button — is looked up here.

     Under Node the dictionaries are pulled in and registered so the renderer
     is fully functional without a page around it; in a browser the engine is
     already on the page. If neither is present the lookups fall through to the
     key, which is loud rather than silently Korean. */
  const I18n = (() => {
    if (typeof module !== "undefined" && module.exports) {
      try {
        const engine = require("../i18n/i18n.js");
        try {
          engine.register("ko", require("../i18n/dictionary-ko.js"));
          engine.register("en", require("../i18n/dictionary-en.js"));
        } catch {
          // An engine with no dictionaries still resolves languages correctly.
        }
        return engine;
      } catch {
        return null;
      }
    }
    return root.InvitationI18n || null;
  })();

  /* The language every render defaults to when a caller does not name one.

     Deliberately the product default rather than the engine's *active*
     language: a rendered invitation is a document, and which document you get
     must not depend on what the switcher happened to be set to when this
     module was last touched. Callers that have a language — the studio
     exporting the author's file, the viewer rebuilding a saved one — pass it
     explicitly. */
  const DEFAULT_CHROME_LANGUAGE = I18n?.DEFAULT_LANGUAGE || "ko";
  const chromeLanguage = (value) =>
    (I18n?.normalizeLanguage?.(value) ?? null) || DEFAULT_CHROME_LANGUAGE;
  const t = (key, language, values) => I18n?.t(key, values, language) ?? String(key);

  /* The blank invitation. Its structure lives here; its words do not.

     Everything a person reads — title, subtitle, location, message, and the
     four course placeholders — is a dictionary key resolved when the default
     is actually taken, so a studio opened in English starts in English instead
     of showing the Korean the product was designed in. The four course LABELS
     (MEET/CAFE/WALK/DINNER) stay as they are: they are the same letterspaced
     typography the templates print, not copy (see docs/i18n.md).

     Unlike the invitation's baked chrome, this resolves against the ACTIVE
     language rather than DEFAULT_CHROME_LANGUAGE. A finished invitation is a
     document and must not re-language itself; a blank one is a starting point
     and should meet its author in their own language. */
  const DEFAULT_COURSES = Object.freeze([
    Object.freeze({ time: "14:00", label: "MEET", key: "Meet" }),
    Object.freeze({ time: "15:00", label: "CAFE", key: "Cafe" }),
    Object.freeze({ time: "17:00", label: "WALK", key: "Walk" }),
    Object.freeze({ time: "19:00", label: "DINNER", key: "Dinner" })
  ]);

  const defaultInvitation = {
    templateId: "royal",
    heroImage: null,
    introEffect: "none",
    particleEffect: "none",
    particleScale: 100,
    particleAmount: 100,
    englishFont: "cormorant-garamond",
    koreanFont: "gowun-batang",
    naverMapClientId: "",
    googleMapsApiKey: "",
    mapProvider: "naver",
    mapEnabled: false,
    mapLatitude: null,
    mapLongitude: null,
    mapZoom: 16,
    titleKey: "invitation.defaultTitle",
    subtitleKey: "invitation.defaultSubtitle",
    dateLabel: "2026.09.12 SAT 14:00",
    host: "From. Rin",
    locationKey: "invitation.defaultLocation",
    mapUrl: "",
    messageKey: "invitation.defaultMessage"
  };

  /* The blank invitation's words, for one language. `defaultInvitation` above
     holds only the parts that are the same in every language; this is what
     callers and normalizeInvitation actually fall back to. */
  const createDefaultInvitation = (language) => {
    const lang = chromeLanguage(language ?? I18n?.getLanguage?.());
    const { titleKey, subtitleKey, locationKey, messageKey, ...structure } = defaultInvitation;

    return {
      ...structure,
      title: t(titleKey, lang),
      subtitle: t(subtitleKey, lang),
      location: t(locationKey, lang),
      message: t(messageKey, lang),
      stops: DEFAULT_COURSES.map(({ time, label, key }) => ({
        time,
        label,
        place: t(`invitation.defaultCourse${key}Place`, lang),
        note: t(`invitation.defaultCourse${key}Note`, lang)
      }))
    };
  };

  const particleEffects = new Set(["none", "petals", "hearts", "sparkle", "fireflies", "bubbles", "snow", "leaves", "confetti"]);
  const particleTones = Object.freeze({
    confetti: ["var(--particle-light)", "var(--particle-accent)", "var(--particle-alt)"],
    fireflies: ["var(--particle-light)", "var(--particle-alt)"],
    hearts: ["var(--particle-accent)", "var(--particle-light)"],
    leaves: ["var(--particle-alt)", "var(--particle-accent)"],
    snow: ["var(--particle-light)", "var(--particle-light)", "var(--particle-accent)"],
    default: ["var(--particle-accent)", "var(--particle-alt)", "var(--particle-light)"]
  });
  const legacyParticleScales = Object.freeze({ small: 70, medium: 100, large: 145 });
  /* Every family is paired with a system fallback stack for its script, so a
     blocked or slow font CDN still renders legible type instead of the
     browser's tofu default. Each stack ends in a generic family (`serif`,
     `sans-serif` or `cursive`) as CSS requires. */
  /* Single-quoted (never double-quoted) because this stack is interpolated,
     unescaped, straight into a double-quoted `style="..."` HTML attribute in
     buildStandaloneHtml below — a double quote here would truncate the
     attribute. */
  const LATIN_SERIF_STACK = "Georgia, 'Times New Roman', serif";
  const LATIN_SCRIPT_STACK = "'Brush Script MT', cursive";
  const LATIN_SANS_STACK = "system-ui, sans-serif";
  const KOREAN_SERIF_STACK = "'Nanum Myeongjo', Batang, AppleMyungjo, serif";
  const KOREAN_SANS_STACK = "'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif";

  const englishFonts = Object.freeze({
    "cormorant-garamond": Object.freeze({ family: "Cormorant Garamond", fallback: LATIN_SERIF_STACK }),
    "playfair-display": Object.freeze({ family: "Playfair Display", fallback: LATIN_SERIF_STACK }),
    "dm-serif-display": Object.freeze({ family: "DM Serif Display", fallback: LATIN_SERIF_STACK }),
    "libre-baskerville": Object.freeze({ family: "Libre Baskerville", fallback: LATIN_SERIF_STACK }),
    "great-vibes": Object.freeze({ family: "Great Vibes", fallback: LATIN_SCRIPT_STACK }),
    "gmarket-sans": Object.freeze({ family: "Gmarket Sans", fallback: LATIN_SANS_STACK })
  });
  const koreanFonts = Object.freeze({
    "gowun-batang": Object.freeze({ family: "Gowun Batang", fallback: KOREAN_SERIF_STACK }),
    "noto-serif-kr": Object.freeze({ family: "Noto Serif KR", fallback: KOREAN_SERIF_STACK }),
    "nanum-myeongjo": Object.freeze({ family: "Nanum Myeongjo", fallback: KOREAN_SERIF_STACK }),
    "nanum-gothic": Object.freeze({ family: "Nanum Gothic", fallback: KOREAN_SANS_STACK }),
    "song-myung": Object.freeze({ family: "Song Myung", fallback: KOREAN_SERIF_STACK }),
    "gmarket-sans": Object.freeze({ family: "Gmarket Sans", fallback: KOREAN_SANS_STACK })
  });

  /* Noto Sans KR is the chrome font (body copy, meta labels) on every
     standalone document regardless of which two families the author picked,
     so it always joins the fonts request. Gmarket Sans is intentionally
     absent: it is self-hosted via @font-face in `standaloneCss` below, not
     served from Google Fonts. */
  const CHROME_FONT_FAMILY = "Noto Sans KR";
  const googleFontSpecs = Object.freeze({
    "Cormorant Garamond": "Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600",
    "DM Serif Display": "DM+Serif+Display",
    "Playfair Display": "Playfair+Display:ital,wght@0,500;0,600;1,500;1,600",
    "Libre Baskerville": "Libre+Baskerville:ital,wght@0,400;0,700;1,400",
    "Great Vibes": "Great+Vibes",
    "Gowun Batang": "Gowun+Batang:wght@400;700",
    "Noto Serif KR": "Noto+Serif+KR:wght@400;600;700",
    "Nanum Myeongjo": "Nanum+Myeongjo:wght@400;700",
    "Nanum Gothic": "Nanum+Gothic:wght@400;700",
    "Song Myung": "Song+Myung",
    [CHROME_FONT_FAMILY]: "Noto+Sans+KR:wght@400;500;600;700"
  });

  /* Only the families an invitation actually uses, plus the chrome font.
     A family with no Google Fonts entry (Gmarket Sans) is skipped here; it
     loads through its own @font-face block instead. */
  const buildFontsUrl = (invitation) => {
    const families = new Set();
    for (const family of [
      englishFonts[invitation.englishFont]?.family,
      koreanFonts[invitation.koreanFont]?.family,
      CHROME_FONT_FAMILY
    ]) {
      if (family && Object.hasOwn(googleFontSpecs, family)) families.add(family);
    }

    const query = [...families].sort().map((family) => `family=${googleFontSpecs[family]}`).join("&");
    return `https://fonts.googleapis.com/css2?${query}&display=swap`;
  };
  const MAX_ITEMS = 50;
  const MAX_PHOTOS = 8;
  const MAX_STOPS = MAX_ITEMS;
  const base64PayloadPattern = "(?:(?:[A-Za-z0-9+/]{4})+|(?:[A-Za-z0-9+/]{4})*[A-Za-z0-9+/]{3}=|(?:[A-Za-z0-9+/]{4})*[A-Za-z0-9+/]{2}==)";
  const safeImagePattern = new RegExp(`^data:image/(?:jpeg|png|webp);base64,${base64PayloadPattern}$`);

  const normalizeParticleEffect = (value) =>
    particleEffects.has(value) ? value : "none";

  const normalizeScale = (value, min, max, step, fallback) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    const bounded = Math.min(max, Math.max(min, number));
    return Math.round(bounded / step) * step;
  };

  const normalizeFont = (value, fonts, fallback) =>
    Object.hasOwn(fonts, value) ? value : fallback;

  const normalizeCoordinate = (value, min, max) => {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
  };

  const normalizeClientId = (value) => {
    const clientId = String(value || "").trim();
    return /^[A-Za-z0-9_-]+$/.test(clientId) ? clientId : "";
  };

  /* Which service draws the invitation's maps and answers its "open in maps"
     buttons. Absent on every invitation saved before Google support existed,
     and all of those were NAVER, so absence means NAVER. */
  const mapProviders = Object.freeze(["naver", "google"]);
  const normalizeMapProvider = (value) => (mapProviders.includes(value) ? value : "naver");

  const normalizeMapUrl = (value, fallback = "") => {
    const mapUrl = String(value || "").trim();
    if (!mapUrl) return fallback;

    try {
      const parsed = new URL(mapUrl);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? mapUrl : fallback;
    } catch {
      return fallback;
    }
  };

  const escapeHtml = (value = "") =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);

  /* The instant the built-in sample invitation is set at. A dateLabel the
     author typed is free text and is rendered verbatim everywhere — nothing
     reformats it. This is the generated placeholder, so it goes through Intl
     and reads correctly in whichever language the studio is in. The designed
     literal stays as the fallback: the standalone export and the viewer do
     not load the i18n module, and they must still produce a date. */
  const SAMPLE_DATE_ISO = "2026-09-12T14:00:00";
  const sampleDateLabel = () =>
    root.InvitationI18n?.formatSampleDate?.(SAMPLE_DATE_ISO) || defaultInvitation.dateLabel;

  /* The instant an author picked, as the date field hands it over: a local
     wall-clock time with no offset. That is deliberate. An invitation happens
     at seven in the evening *where it happens*, and `timeZone` names where
     that is; storing a UTC instant instead would make the stored value depend
     on the machine the author happened to be sitting at. */
  const normalizeDateTime = (value) => {
    const match = String(value ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/);
    if (!match) return "";
    const [, year, month, day, hour, minute] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
    // Rejects 2026-02-31 and friends, which the pattern alone lets through.
    if (date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return "";
    return `${year}-${month}-${day}T${hour}:${minute}`;
  };

  /* Intl is the only authority on which zone names a browser knows, so ask it
     rather than shipping a list that rots. A name it rejects is dropped: an
     invitation with no zone is a floating time everyone reads locally, which
     is merely vague, while a zone nothing can resolve is wrong. */
  const normalizeTimeZone = (value) => {
    const timeZone = String(value ?? "").trim();
    if (!timeZone) return "";
    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
      return timeZone;
    } catch {
      return "";
    }
  };

  /* The date a guest actually reads.

     Words the author typed win outright and are never reformatted — that is
     the rule the whole date field is built around (docs/i18n.md). Only when
     they left the sentence empty is the picked instant formatted, here, at
     render time, for the language and region this rendering is for. That is
     why switching the studio's language re-renders the date and switching it
     back restores it exactly: nothing was ever written down. */
  const resolveDateLabel = (invitation, dateLocale) => {
    if (invitation.dateLabel) return invitation.dateLabel;
    if (!invitation.dateTime) return "";
    return I18n?.formatSampleDate?.(invitation.dateTime, dateLocale)
      || invitation.dateTime.replace("T", " ");
  };

  const dateLocaleFor = (language) => I18n?.getDateLocale?.(language) || chromeLanguage(language);

  const normalizeStop = (stop = {}) => {
    const mapLatitude = normalizeCoordinate(stop.mapLatitude, -90, 90);
    const mapLongitude = normalizeCoordinate(stop.mapLongitude, -180, 180);
    const requestedZoom = Number(stop.mapZoom);
    const requestedMap = stop.mapEnabled === true || stop.mapEnabled === "true" || stop.mapEnabled === "on";

    return {
      time: stop.time || "",
      label: stop.label || "PLACE",
      place: stop.place || "",
      note: stop.note || "",
      mapUrl: normalizeMapUrl(stop.mapUrl),
      mapEnabled: requestedMap && mapLatitude !== null && mapLongitude !== null,
      mapLatitude,
      mapLongitude,
      mapZoom: Number.isFinite(requestedZoom)
        ? Math.min(21, Math.max(6, Math.round(requestedZoom)))
        : defaultInvitation.mapZoom
    };
  };

  const normalizeStops = (value) => {
    const normalized = Array.isArray(value)
      ? value.filter(Boolean).map(normalizeStop)
      : String(value || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
        const [time = "", label = "PLACE", place = "", note = ""] = line.split("|").map((part) => part.trim());
        return normalizeStop({ time, label, place, note });
      });

    return normalized
      .filter((stop) => stop.time || stop.place || stop.note || stop.mapUrl || stop.mapEnabled)
      .slice(0, MAX_STOPS);
  };

  const generateItemId = (type) => {
    const cryptoApi = root.crypto || globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
      return `${type}-${cryptoApi.randomUUID()}`;
    }
    return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  };

  const normalizeItemId = (value, type, usedIds) => {
    let id = String(value || "").trim();
    while (!id || usedIds.has(id)) {
      id = generateItemId(type);
    }
    usedIds.add(id);
    return id;
  };

  const normalizeCourse = (item, id) => {
    const stop = normalizeStop(item);
    if (!stop.time && !stop.place && !stop.note && !stop.mapUrl && !stop.mapEnabled) {
      return null;
    }
    return { id, type: "course", ...stop };
  };

  const normalizePhoto = (item, id) => safeImagePattern.test(String(item.src || ""))
    ? { id, type: "photo", src: item.src, alt: String(item.alt || ""), caption: String(item.caption || "") }
    : null;

  const normalizeHeroImage = (value) => {
    if (!value || !safeImagePattern.test(String(value.src || ""))) return null;
    return { src: value.src, ...HeroImage.normalizeCrop(value) };
  };

  const normalizeNotice = (item, id) => {
    const heading = String(item.heading || "").trim();
    const body = String(item.body || "").trim();
    return heading || body ? { id, type: "notice", heading, body } : null;
  };

  const normalizeProfile = (item, id) => {
    const name = String(item.name || "").trim();
    const role = String(item.role || "").trim();
    const description = String(item.description || "").trim();
    return name || role || description ? { id, type: "profile", name, role, description } : null;
  };

  const normalizeActionUrl = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      return ["http:", "https:", "tel:", "sms:"].includes(parsed.protocol) ? raw : "";
    } catch {
      return "";
    }
  };

  const normalizeLink = (item, id) => {
    const label = String(item.label || "").trim();
    const value = String(item.value || "").trim();
    const url = normalizeActionUrl(item.url);
    return label || value || url ? { id, type: "link", label, value, url } : null;
  };

  const itemToStop = (item) => ({
    time: item.time,
    label: item.label,
    place: item.place,
    note: item.note,
    mapUrl: item.mapUrl,
    mapEnabled: item.mapEnabled,
    mapLatitude: item.mapLatitude,
    mapLongitude: item.mapLongitude,
    mapZoom: item.mapZoom
  });

  const normalizeItems = (input, blank = createDefaultInvitation()) => {
    const sourceItems = Array.isArray(input.items)
      ? input.items
      : normalizeStops(input.stops || blank.stops).map((stop) => ({ type: "course", ...stop }));
    const usedIds = new Set();
    let photoCount = 0;
    const normalized = [];

    for (const item of sourceItems) {
      if (!item || normalized.length >= MAX_ITEMS) continue;
      const type = ["course", "photo", "notice", "profile", "link"].includes(item.type) ? item.type : "";
      if (!type || (type === "photo" && photoCount >= MAX_PHOTOS)) continue;

      const id = normalizeItemId(item.id, type, usedIds);
      const normalizedItem = ({
        course: normalizeCourse,
        photo: normalizePhoto,
        notice: normalizeNotice,
        profile: normalizeProfile,
        link: normalizeLink
      })[type](item, id);
      if (!normalizedItem) {
        usedIds.delete(id);
        continue;
      }
      if (normalizedItem.type === "photo") photoCount += 1;
      normalized.push(normalizedItem);
    }

    return normalized;
  };

  const normalizeInvitation = (input = {}) => {
    const mapLatitude = normalizeCoordinate(input.mapLatitude, -90, 90);
    const mapLongitude = normalizeCoordinate(input.mapLongitude, -180, 180);
    const requestedZoom = Number(input.mapZoom);
    const mapZoom = Number.isFinite(requestedZoom)
      ? Math.min(21, Math.max(6, Math.round(requestedZoom)))
      : defaultInvitation.mapZoom;
    const requestedMap = input.mapEnabled === true || input.mapEnabled === "true" || input.mapEnabled === "on";
    const particleScale = input.particleScale ?? legacyParticleScales[input.particleSize];
    const dateTime = normalizeDateTime(input.dateTime);
    const blank = createDefaultInvitation();
    const items = normalizeItems(input, blank);
    const stops = items
      .filter((item) => item.type === "course")
      .map(itemToStop);

    return {
      templateId: input.templateId ?? defaultInvitation.templateId,
      heroImage: normalizeHeroImage(input.heroImage),
      layoutFamily: TemplateCatalog.normalizeFamily(input.layoutFamily, input.templateId ?? defaultInvitation.templateId),
      introEffect: InvitationIntro.normalizeEffect(input.introEffect),
      particleEffect: normalizeParticleEffect(input.particleEffect),
      particleScale: normalizeScale(particleScale, 50, 200, 5, defaultInvitation.particleScale),
      particleAmount: normalizeScale(input.particleAmount, 25, 500, 25, defaultInvitation.particleAmount),
      englishFont: normalizeFont(input.englishFont, englishFonts, defaultInvitation.englishFont),
      koreanFont: normalizeFont(input.koreanFont, koreanFonts, defaultInvitation.koreanFont),
      naverMapClientId: normalizeClientId(input.naverMapClientId),
      googleMapsApiKey: normalizeClientId(input.googleMapsApiKey),
      mapProvider: normalizeMapProvider(input.mapProvider),
      title: input.title ?? blank.title,
      subtitle: input.subtitle ?? blank.subtitle,
      dateTime,
      timeZone: dateTime ? normalizeTimeZone(input.timeZone) : "",
      /* Empty is a real answer here: it means "use the date I picked". Only an
         invitation that named neither falls back to the sample's label, which
         is what a brand-new blank studio is. */
      dateLabel: input.dateLabel ?? (dateTime ? "" : sampleDateLabel()),
      host: input.host ?? defaultInvitation.host,
      location: input.location ?? blank.location,
      mapUrl: normalizeMapUrl(input.mapUrl, input.mapUrl === undefined ? defaultInvitation.mapUrl : ""),
      mapEnabled: requestedMap && mapLatitude !== null && mapLongitude !== null,
      mapLatitude,
      mapLongitude,
      mapZoom,
      message: input.message ?? blank.message,
      items,
      stops
    };
  };

  const fontDeclaration = (font) => `'${font.family}', ${font.fallback}`;

  const invitationStyleFrom = (invitation) =>
    `--font-en:${fontDeclaration(englishFonts[invitation.englishFont])};--font-ko:${fontDeclaration(koreanFonts[invitation.koreanFont])}`;

  const getInvitationStyle = (input = {}) => invitationStyleFrom(normalizeInvitation(input));

  const renderParticles = (effect, scale, amount) => {
    if (effect === "none") return "";

    const count = Math.round(16 * amount / 100);
    const colors = particleTones[effect] || particleTones.default;
    const particles = Array.from({ length: count }, (_, index) => {
      const position = Math.min(97, Math.max(3,
        ((index + 0.5) * 100 / count) + ((index % 3) - 1) * 1.2
      )).toFixed(2);
      const size = 5 + (index % 4) * 2;
      const drift = ((index % 5) - 2) * 15;
      const duration = 8 + (index % 5);
      const delay = (index * 0.9) % duration;
      const turn = (index * 47) % 180;
      const sway = ((index % 7) - 3) * 8;
      const pulseDelay = ((index * 0.37) % 2.4).toFixed(2);
      const pulseDuration = (2.4 + (index % 4) * 0.28).toFixed(2);
      return `<span style="--x:${position}%;--size:${size}px;--drift:${drift}px;--duration:${duration}s;--delay:-${delay.toFixed(1)}s;--turn:${turn}deg;--tone:${colors[index % colors.length]};--sway:${sway}px;--pulse-delay:-${pulseDelay}s;--pulse-duration:${pulseDuration}s"></span>`;
    }).join("");

    return `<div class="particle-layer" data-effect="${effect}" data-scale="${scale}" data-amount="${amount}" style="--particle-scale:${scale / 100}" aria-hidden="true">${particles}</div>`;
  };

  const mapKeyFor = (settings) => normalizeMapProvider(settings.mapProvider) === "google"
    ? settings.googleMapsApiKey
    : settings.naverMapClientId;

  const renderDynamicMap = (mapSettings, variant = "global", mapKey = "representative", language = DEFAULT_CHROME_LANGUAGE) => {
    if (!mapSettings.mapEnabled) return "";

    const status = escapeHtml(t(mapKeyFor(mapSettings) ? "map.loading" : "map.unavailable", language));
    const variantClass = variant === "stop" ? " is-stop-map" : "";
    return `
        <section class="invite-map-panel${variantClass}" data-map-key="${mapKey}" data-map-provider="${normalizeMapProvider(mapSettings.mapProvider)}" aria-label="${escapeHtml(t("invitation.mapRegionLabel", language))}">
          <div class="invite-map-canvas" data-dynamic-map data-latitude="${mapSettings.mapLatitude}" data-longitude="${mapSettings.mapLongitude}" data-zoom="${mapSettings.mapZoom}"></div>
          <p class="invite-map-status" data-map-status role="status" aria-live="polite">${status}</p>
        </section>
    `;
  };

  const renderMapLink = (mapUrl, className, label) => mapUrl
    ? `<a class="${className}" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener noreferrer">${label}</a>`
    : "";

  /* The button a guest taps. An author's own link always wins; otherwise the
     search goes to the invitation's map service, because a guest abroad has
     no use for a NAVER search page and a guest in Korea is best served by it.
     Google search also accepts a bare coordinate pair, so a map with no label
     still opens on the pinned spot instead of the world map. */
  const getMapFallbackUrl = (mapSettings, place, provider = "naver") => {
    if (mapSettings.mapUrl) return mapSettings.mapUrl;
    const hasCoordinates = mapSettings.mapEnabled
      && mapSettings.mapLatitude !== null && mapSettings.mapLongitude !== null;
    if (normalizeMapProvider(provider) === "google") {
      const query = place || (hasCoordinates ? `${mapSettings.mapLatitude},${mapSettings.mapLongitude}` : "");
      return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
    }
    return place
      ? `https://map.naver.com/p/search/${encodeURIComponent(place)}`
      : mapSettings.mapEnabled
        ? "https://map.naver.com/"
        : "";
  };

  const renderInvitationItems = (invitation, language = DEFAULT_CHROME_LANGUAGE) => {
    let courseNumber = 0;
    return invitation.items.map((item) => {
      if (item.type === "photo") {
        const caption = item.caption.trim()
          ? `<figcaption>${escapeHtml(item.caption)}</figcaption>`
          : "";
        return `
      <figure class="invite-photo">
        <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt)}">
        ${caption}
      </figure>
        `;
      }

      if (item.type === "notice") {
        return `
      <section class="invite-notice">
        <p class="invite-item-eyebrow">${escapeHtml(t("invitation.noticeEyebrow", language))}</p>
        <h3>${escapeHtml(item.heading)}</h3>
        <p>${escapeHtml(item.body)}</p>
      </section>
        `;
      }

      if (item.type === "profile") {
        return `
      <section class="invite-profile">
        <p class="invite-profile-role">${escapeHtml(item.role)}</p>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.description)}</p>
      </section>
        `;
      }

      if (item.type === "link") {
        const content = `
          <p class="invite-item-eyebrow">${escapeHtml(item.label)}</p>
          <strong>${escapeHtml(item.value)}</strong>
        `;
        return item.url
          ? `<a class="invite-link-action" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${content}</a>`
          : `<section class="invite-link-info">${content}</section>`;
      }

      const courseIndex = courseNumber;
      courseNumber += 1;
      return `
      <article class="invite-stop">
        <div class="invite-stop-number">${String(courseNumber).padStart(2, "0")}</div>
        <div class="invite-stop-content">
          <p class="invite-stop-time">${escapeHtml(item.time)} · ${escapeHtml(item.label)}</p>
          <h3>${escapeHtml(item.place)}</h3>
          <p>${escapeHtml(item.note)}</p>
          ${renderDynamicMap({ ...item, naverMapClientId: invitation.naverMapClientId, googleMapsApiKey: invitation.googleMapsApiKey, mapProvider: invitation.mapProvider }, "stop", `stop-${courseIndex}`, language)}
          ${renderMapLink(getMapFallbackUrl(item, item.place, invitation.mapProvider), "invite-stop-map-link", escapeHtml(t("invitation.openMap", language)))}
        </div>
      </article>
      `;
    }).join("");
  };

  /* An .ics file, built by hand because the alternative is a dependency this
     project does not have and does not want. RFC 5545 is small at this size:
     escape the text values, keep every line inside 75 octets, and give the
     event a stable identity.

     The event is two hours long. Nothing in the studio asks an author when
     their party ends, and a zero-length entry shows up as a reminder rather
     than an occasion in most calendars, so this is the honest default. */
  const CALENDAR_EVENT_MINUTES = 120;
  const CALENDAR_PRODUCT_ID = "-//Invitation Maker//Invitation//EN";

  /* RFC 5545 gives , ; and \ meaning inside a text value, and a raw newline
     ends the property line. Backslashes go first so the escapes this adds are
     not escaped again. */
  const calendarText = (value) => String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");

  const utf8Length = (character) => {
    const code = character.codePointAt(0);
    if (code < 0x80) return 1;
    if (code < 0x800) return 2;
    if (code < 0x10000) return 3;
    return 4;
  };

  /* Content lines are limited to 75 octets and continue on a line starting
     with a space. Folding by code point rather than by index is what keeps a
     Korean title from being cut in half mid-character. */
  const foldCalendarLine = (line) => {
    const folded = [];
    let current = "";
    let bytes = 0;
    for (const character of line) {
      const size = utf8Length(character);
      // A continuation's leading space spends one of the 75 octets.
      if (bytes + size > (folded.length ? 74 : 75)) {
        folded.push(current);
        current = "";
        bytes = 0;
      }
      current += character;
      bytes += size;
    }
    folded.push(current);
    return folded.join("\r\n ");
  };

  /* A stable identity for the event, so re-downloading an invitation updates
     the entry a guest already saved instead of adding a second one. FNV-1a
     over the fields a calendar shows: change the party, change the event. */
  const calendarHash = (value) => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  };

  const calendarStamp = (milliseconds) =>
    new Date(milliseconds).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "");

  const buildCalendarFile = ({ dateTime, timeZone, title, location }) => {
    const [, year, month, day, hour, minute] = dateTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    /* Date.UTC is arithmetic here, not a claim about the instant: it turns the
       author's wall clock into numbers we can add two hours to without the
       machine running this render having any say. TZID tells a calendar which
       clock those numbers belong to; with no zone they stay floating, which
       reads as "seven, wherever you are" — vague, but never the wrong hour. */
    const start = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    /* This file carries a bare TZID with no accompanying VTIMEZONE component.
       That is deliberate: the major calendar clients a guest is likely to use
       to open this file (Google, Apple, Outlook) all resolve IANA zone names
       like "Asia/Seoul" on their own, and shipping a hand-rolled VTIMEZONE
       block would add real complexity for readers who already have it. */
    const zone = timeZone ? `;TZID=${timeZone}` : "";
    const identity = `${dateTime}|${timeZone}|${title}|${location}`;
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      `PRODID:${CALENDAR_PRODUCT_ID}`,
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${calendarHash(identity)}-${calendarStamp(start)}@invitation-maker`,
      /* DTSTAMP is "when this object was written". Using the event's own start
         rather than the clock keeps a regenerated invitation byte-identical to
         the last one, which is what lets a generated file be checked in. */
      `DTSTAMP:${calendarStamp(start)}Z`,
      `DTSTART${zone}:${calendarStamp(start)}`,
      /* DTEND is the wall-clock start plus two hours, added to the numeric
         components rather than to a zone-aware instant. If a DST transition
         falls inside that window, the event still reports as exactly two
         hours long by the clock rather than by elapsed real time — a known
         simplification, not an oversight. */
      `DTEND${zone}:${calendarStamp(start + CALENDAR_EVENT_MINUTES * 60000)}`,
      `SUMMARY:${calendarText(title)}`
    ];
    if (location) lines.push(`LOCATION:${calendarText(location)}`);
    lines.push("END:VEVENT", "END:VCALENDAR");
    return `${lines.map(foldCalendarLine).join("\r\n")}\r\n`;
  };

  /* The "add to calendar" link. A data: URI rather than a hosted file because
     a standalone invitation has no server behind it — it is one HTML file that
     may be opened from a phone's downloads folder years from now, and the
     calendar has to come out of the document itself. Percent-encoding leaves
     nothing that could close the attribute or the element it sits in. */
  const renderCalendarLink = (invitation = {}, language = DEFAULT_CHROME_LANGUAGE) => {
    const dateTime = normalizeDateTime(invitation.dateTime);
    if (!dateTime) return "";

    const file = buildCalendarFile({
      dateTime,
      timeZone: normalizeTimeZone(invitation.timeZone),
      title: invitation.title ?? "",
      location: invitation.location ?? ""
    });
    const href = `data:text/calendar;charset=utf-8,${encodeURIComponent(file)}`;
    const label = escapeHtml(t("invitation.addToCalendar", chromeLanguage(language)));
    return `<a class="invite-calendar-link" href="${escapeHtml(href)}" download="invitation.ics">${label}</a>`;
  };

  /* Written into the document hidden, and revealed only on a device whose own
     zone disagrees (see renderStandaloneTimeZoneScript). A guest in the same
     city as the party does not need to be told what time zone they are in. */
  const renderTimeZoneNote = (invitation, language) => {
    const timeZone = normalizeTimeZone(invitation.timeZone);
    if (!normalizeDateTime(invitation.dateTime) || !timeZone) return "";
    const note = escapeHtml(t("invitation.timeZoneNote", language, { zone: timeZone }));
    return `<p class="invite-timezone-note" data-invitation-time-zone="${escapeHtml(timeZone)}" hidden>${note}</p>`;
  };

  /* `language` selects the invitation's own chrome only. Every field the
     author typed is rendered verbatim in whatever language they wrote it —
     nothing here translates their document. */
  const renderInvitationBody = (input = {}, { language } = {}) => {
    const invitation = normalizeInvitation(input);
    const chrome = chromeLanguage(language);
    /* The chrome language and the date locale are two different questions:
       `language` may arrive as "en-GB", which is English chrome and a British
       date. Everything but the date uses `chrome`. */
    const dateLocale = dateLocaleFor(language || chrome);
    const dateLabel = resolveDateLabel(invitation, dateLocale);
    const customHero = invitation.heroImage;
    const art = customHero?.src || TemplateArt.getDataUrl(invitation.templateId);
    const artAttributes = customHero
      ? `data-custom-hero-image style="--hero-image-scale:${customHero.scale / 100};--hero-image-x:${customHero.positionX}%;--hero-image-y:${customHero.positionY}%"`
      : "";
    const slots = {
      templateId: invitation.templateId,
      articleAttributes: `data-template="${escapeHtml(invitation.templateId)}" data-particle="${escapeHtml(invitation.particleEffect)}" data-english-font="${escapeHtml(invitation.englishFont)}" data-korean-font="${escapeHtml(invitation.koreanFont)}" style="${invitationStyleFrom(invitation)}"`,
      particles: renderParticles(invitation.particleEffect, invitation.particleScale, invitation.particleAmount),
      art: escapeHtml(art),
      artAttributes,
      kicker: "Invitation",
      title: escapeHtml(invitation.title),
      subtitle: escapeHtml(invitation.subtitle),
      dateLabel: escapeHtml(dateLabel),
      location: escapeHtml(invitation.location),
      host: escapeHtml(invitation.host),
      message: escapeHtml(invitation.message),
      meta: `
          <div>
            <span>Date</span>
            <strong>${escapeHtml(dateLabel)}</strong>
            ${renderTimeZoneNote(invitation, chrome)}
            ${renderCalendarLink(invitation, chrome)}
          </div>
          <div>
            <span>Place</span>
            <strong>${escapeHtml(invitation.location)}</strong>
          </div>
          <div>
            <span>Host</span>
            <strong>${escapeHtml(invitation.host)}</strong>
          </div>
      `,
      items: renderInvitationItems(invitation, chrome),
      map: renderDynamicMap(invitation, "global", "representative", chrome),
      mapLink: renderMapLink(getMapFallbackUrl(invitation, invitation.location, invitation.mapProvider), "invite-map", escapeHtml(t("invitation.openMainMap", chrome)))
    };

    return TemplateRenderers.render(invitation.layoutFamily, slots);
  };

  const standaloneCss = `
    @font-face{font-family:"Gmarket Sans";font-style:normal;font-weight:500;font-display:swap;src:url("https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/GmarketSansMedium.woff") format("woff")}@font-face{font-family:"Gmarket Sans";font-style:normal;font-weight:700;font-display:swap;src:url("https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/GmarketSansBold.woff") format("woff")}
    :root{--bg:#ead5ce;--paper:#fffaf2;--ink:#2a1720;--soft:#65535a;--deep:#42101f;--mid:#7a243b;--gold:#d9ac54;--line:rgba(101,58,65,.16);--white:#fffdf9;--ink-soft:#65535a;--wine-950:#2d0b16;--wine-900:#42101f;--wine-800:#5d182c;--wine-700:#7a243b;--wine-600:#9b3d54;--cream-50:#fffaf2;--cream-100:#fbf1df;--gold-500:#d9ac54;--gold-300:#f6dda6;--rose-100:#f5d9d5;--hero-end:#a04d55;--particle-light:#fff0ba;--particle-accent:#c84f70;--particle-alt:#4f8778;--particle-edge:rgba(66,16,31,.5);--particle-glow:rgba(255,232,157,.72)}
    body[data-template="wedding"]{--bg:#f2e8d8;--paper:#fffaf1;--ink:#33241a;--soft:#705d4c;--deep:#6d4f31;--mid:#9b7551;--gold:#c7a15d;--ink-soft:#705d4c;--wine-950:#3a2a1d;--wine-900:#6d4f31;--wine-700:#9b7551;--wine-600:#b58b61;--cream-50:#fffaf1;--cream-100:#f7ead6;--gold-500:#c7a15d;--gold-300:#f4dba5;--rose-100:#fff4e6;--hero-end:#b89268;--particle-light:#ffe6a8;--particle-accent:#9a5e36;--particle-alt:#6f8570;--particle-edge:rgba(58,42,29,.5);--particle-glow:rgba(255,225,151,.72)}
    body[data-template="black-tie"]{--bg:#d8d3ca;--paper:#f8f4ec;--ink:#17191f;--soft:#5f6876;--deep:#08090b;--mid:#353b48;--gold:#c9a45e;--ink-soft:#5f6876;--wine-950:#08090b;--wine-900:#17191f;--wine-700:#353b48;--wine-600:#5f6876;--cream-50:#f8f4ec;--cream-100:#e7ded0;--gold-500:#c9a45e;--gold-300:#f3dda1;--rose-100:#f4ead8;--hero-end:#2e323c;--particle-light:#f4d47f;--particle-accent:#b55063;--particle-alt:#70a99a;--particle-edge:rgba(8,9,11,.72);--particle-glow:rgba(244,212,127,.68)}
    body[data-template="botanical"]{--bg:#e4ead8;--paper:#fbfbef;--ink:#102018;--soft:#52695b;--deep:#1f3a2c;--mid:#407055;--gold:#b89d50;--ink-soft:#52695b;--wine-950:#102018;--wine-900:#1f3a2c;--wine-700:#407055;--wine-600:#5f8b6d;--cream-50:#fbfbef;--cream-100:#edf1d9;--gold-500:#b89d50;--gold-300:#ead99d;--rose-100:#eef5de;--hero-end:#66845d;--particle-light:#f0cf77;--particle-accent:#567c4b;--particle-alt:#ba6674;--particle-edge:rgba(16,32,24,.58);--particle-glow:rgba(240,207,119,.65)}
    body[data-template="modern"]{--bg:#efe9e3;--paper:#fffaf5;--ink:#1f1b1a;--soft:#6d625b;--deep:#34302d;--mid:#766b62;--gold:#b17846;--ink-soft:#6d625b;--wine-950:#1f1b1a;--wine-900:#34302d;--wine-700:#766b62;--wine-600:#8d7c70;--cream-50:#fffaf5;--cream-100:#f0e8df;--gold-500:#b17846;--gold-300:#e3bd8b;--rose-100:#f0e3da;--hero-end:#8a786d;--particle-light:#f3c47f;--particle-accent:#8f4e52;--particle-alt:#4e7a73;--particle-edge:rgba(31,27,26,.56);--particle-glow:rgba(243,196,127,.66)}
    *{box-sizing:border-box}body{margin:0;padding:28px 14px;background:linear-gradient(145deg,var(--bg),#fff);color:var(--ink);font-family:"Noto Sans KR",sans-serif;line-height:1.7}.invitation-card{max-width:430px;margin:0 auto;overflow:hidden;overflow-wrap:anywhere;background:var(--paper);box-shadow:0 26px 80px rgba(45,11,22,.22);font-family:var(--font-ko),"Noto Sans KR",sans-serif}.invite-hero{min-height:420px;display:grid;align-content:center;padding:48px 28px;text-align:center;color:#fff;background:radial-gradient(circle at 50% 30%,rgba(217,172,84,.32),transparent 34%),linear-gradient(180deg,var(--deep),var(--mid))}.invite-kicker{margin:0 0 14px;color:#f6dda6;font-family:var(--font-en),serif;text-transform:uppercase;letter-spacing:.22em;font-size:12px}.invite-hero h1{margin:0;font-family:var(--font-en),var(--font-ko),serif;font-size:39px;line-height:1.15;font-style:italic;font-weight:500}.invitation-card[data-english-font="dm-serif-display"] .invite-hero h1,.invitation-card[data-english-font="great-vibes"] .invite-hero h1{font-style:normal;font-weight:400}.invite-subtitle{margin:18px 0 0;font-family:var(--font-ko),serif;font-size:14px;opacity:.86}.invite-section{padding:28px 24px;border-bottom:1px solid var(--line)}.invite-message{font-family:var(--font-ko),serif;font-size:17px;text-align:center}.invite-meta{display:grid;gap:12px}.invite-meta div{padding:14px;border:1px solid var(--line)}.invite-meta span{display:block;color:var(--gold);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.14em}.invite-meta strong{display:block;margin-top:3px}.invite-timeline{display:grid;gap:14px}.invite-stop{display:grid;grid-template-columns:42px 1fr;gap:12px}.invite-stop-number{display:grid;width:38px;height:38px;place-items:center;border:1px solid var(--gold);border-radius:50%;color:var(--mid);font-family:var(--font-en),serif;font-weight:700}.invite-stop-time{margin:0 0 3px;color:var(--mid);font-size:12px;font-weight:700;letter-spacing:.08em}.invite-stop h3{margin:0;font-family:var(--font-ko),serif;font-size:18px}.invite-stop p{margin:4px 0 0;color:var(--soft);font-size:14px}.invite-photo{max-width:100%;min-width:0;margin:0;overflow:hidden}.invite-photo img{display:block;width:100%;height:auto}.invite-photo figcaption{max-width:100%;padding:8px 4px 0;color:var(--soft);font-size:13px;line-height:1.5;overflow-wrap:anywhere}.invite-map{display:flex;min-height:52px;align-items:center;justify-content:center;margin:24px;color:#fff;background:var(--deep);border-radius:8px;text-decoration:none;font-weight:700}@media(max-width:480px){body{padding:0}.invitation-card{box-shadow:none}}
    .invitation-card{position:relative;isolation:isolate}.particle-layer{position:absolute;z-index:10;inset:0;overflow:hidden;pointer-events:none}.particle-layer span{position:absolute;top:0;left:var(--x);display:block;width:calc(var(--size) * var(--particle-scale));height:100%;opacity:0;animation:particle-fall var(--duration) linear var(--delay) infinite;will-change:transform}.particle-layer span::before{display:block;width:100%;height:calc(var(--size) * var(--particle-scale));animation:particle-spin 5s linear var(--delay) infinite;filter:drop-shadow(0 1px 1px var(--particle-edge));content:""}.particle-layer[data-effect="fireflies"] span,.particle-layer[data-effect="bubbles"] span{animation-name:particle-rise}.particle-layer[data-effect="snow"] span{animation-duration:calc(var(--duration) * 1.35)}.particle-layer[data-effect="sparkle"] span::before{border:1px solid var(--particle-edge);border-radius:50%;background:var(--particle-light);box-shadow:0 0 8px 2px var(--particle-glow)}.particle-layer[data-effect="petals"] span::before{border:1px solid var(--particle-edge);border-radius:70% 0 70% 0;background:var(--tone)}.particle-layer[data-effect="hearts"] span::before{display:grid;place-items:center;color:var(--tone);font-size:calc(var(--size) * var(--particle-scale) * 1.55);line-height:1;text-shadow:0 2px 8px var(--particle-edge);content:"❤"}.particle-layer[data-effect="fireflies"] span::before{border-radius:50%;background:var(--tone);box-shadow:0 0 12px 4px var(--tone);animation:particle-spin 6s linear var(--delay) infinite,particle-pulse var(--pulse-duration) ease-in-out var(--pulse-delay) infinite}.particle-layer[data-effect="bubbles"] span::before{border:1px solid var(--particle-edge);border-radius:50%;background:rgba(255,255,255,.2);box-shadow:inset -3px -4px 8px rgba(255,255,255,.28);animation:particle-pulse 5.6s ease-in-out var(--pulse-delay) infinite}.particle-layer[data-effect="snow"] span::before{border:1px solid var(--particle-edge);border-radius:50%;background:var(--tone);box-shadow:0 0 7px var(--particle-glow);animation:none}.particle-layer[data-effect="leaves"] span::before{border-radius:80% 0 70% 10%;background:var(--tone);box-shadow:inset -3px -2px 0 rgba(42,23,32,.12);animation:particle-spin 3.8s linear var(--delay) infinite}.particle-layer[data-effect="confetti"] span::before{height:calc(var(--size) * var(--particle-scale) * .48);border-radius:1px;background:var(--tone)}@keyframes particle-fall{0%{opacity:0;transform:translate3d(0,-24px,0)}12%,84%{opacity:.78}50%{transform:translate3d(var(--sway),48%,0)}100%{opacity:0;transform:translate3d(var(--drift),calc(100% + 24px),0)}}@keyframes particle-rise{0%{opacity:0;transform:translate3d(0,calc(100% + 24px),0)}14%,82%{opacity:.74}50%{transform:translate3d(var(--sway),42%,0)}100%{opacity:0;transform:translate3d(var(--drift),-32px,0)}}@keyframes particle-spin{from{transform:rotate(var(--turn))}to{transform:rotate(calc(var(--turn) + 480deg))}}@keyframes particle-pulse{0%,100%{opacity:.45;transform:scale(.72)}50%{opacity:1;transform:scale(1.18)}}@media(prefers-reduced-motion:reduce){.particle-layer{display:none}}
    .invite-map-panel{position:relative;height:260px;margin:24px;overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#eee7df}.invite-map-panel.is-stop-map{height:180px;margin:14px 0 0}.invite-map-canvas{width:100%;height:100%}.invite-map-status{position:absolute;inset:0;display:grid;place-items:center;margin:0;padding:24px;color:var(--soft);background:rgba(255,250,242,.94);text-align:center;font-size:13px}.invite-map-canvas[data-map-state="ready"]+.invite-map-status{display:none}.invite-stop-map-link{display:inline-flex;min-height:44px;align-items:center;margin-top:4px;color:var(--mid);font-size:13px;font-weight:700}@media(max-width:480px){.invite-map-panel{height:220px;margin:18px}.invite-map-panel.is-stop-map{height:170px;margin:12px 0 0}}
    .invite-timezone-note{margin:4px 0 0;color:var(--soft);font-size:12px;letter-spacing:0;text-transform:none}.invite-calendar-link{display:inline-flex;min-height:44px;align-items:center;margin-top:2px;color:var(--mid);font-size:13px;font-weight:700;letter-spacing:0;text-decoration:underline;text-transform:none;text-underline-offset:3px}.invite-calendar-link:hover,.invite-calendar-link:focus-visible{color:var(--deep)}
  `;

  const standaloneTemplatePaletteCss = `
    body[data-template="wedding"]{--wine-800:#8a6844}body[data-template="black-tie"]{--wine-800:#242833}body[data-template="botanical"]{--wine-800:#2f5641}body[data-template="modern"]{--wine-800:#504943}
    body[data-template="midnight-cinema"],body[data-template="memory-film"]{--bg:#e8d4ca;--paper:#fff8ef;--ink:#20161a;--soft:#6b5458;--deep:#30131d;--mid:#7a3147;--gold:#c89b55;--ink-soft:#6b5458;--wine-950:#170f14;--wine-900:#30131d;--wine-800:#512031;--wine-700:#7a3147;--wine-600:#a64e66;--cream-50:#fff8ef;--cream-100:#f6e5d6;--gold-500:#c89b55;--gold-300:#f1d59c;--rose-100:#f8ddd8;--hero-end:#3a1c2b;--particle-light:#ffe6a6;--particle-accent:#c55373;--particle-alt:#6b8b7f;--particle-edge:rgba(32,22,26,.52);--particle-glow:rgba(255,222,158,.72)}
    body[data-template="color-pop"]{--bg:#f8f0d8;--paper:#fffdf7;--ink:#161b2f;--soft:#536071;--deep:#123c8d;--mid:#d4312b;--gold:#e7b900;--ink-soft:#536071;--wine-950:#0f1834;--wine-900:#123c8d;--wine-800:#1558c7;--wine-700:#d4312b;--wine-600:#e94c3f;--cream-50:#fffdf7;--cream-100:#f7f0d9;--gold-500:#e7b900;--gold-300:#ffe36f;--rose-100:#fff1d2;--hero-end:#e0bc19;--particle-light:#ffe04d;--particle-accent:#e73335;--particle-alt:#1664d8;--particle-edge:rgba(15,24,52,.48);--particle-glow:rgba(255,224,77,.76)}
    body[data-template="gallery-notice"]{--bg:#dfd7cc;--paper:#fbf7ef;--ink:#202020;--soft:#65605a;--deep:#111111;--mid:#a4312e;--gold:#b28a45;--ink-soft:#65605a;--wine-950:#111111;--wine-900:#2e2e2e;--wine-800:#494540;--wine-700:#a4312e;--wine-600:#c4463c;--cream-50:#fbf7ef;--cream-100:#e9dfd1;--gold-500:#b28a45;--gold-300:#dcc386;--rose-100:#efe7dc;--hero-end:#3a3835;--particle-light:#e4c577;--particle-accent:#b83a36;--particle-alt:#45413c;--particle-edge:rgba(17,17,17,.62);--particle-glow:rgba(228,197,119,.6)}
    body[data-template="sunny-classroom"],body[data-template="little-forest"],body[data-template="first-chapter"],body[data-template="little-star"]{--bg:#f1e6bd;--paper:#fffbed;--ink:#243027;--soft:#667052;--deep:#3f6f5a;--mid:#e36f4b;--gold:#e0ad3d;--ink-soft:#667052;--wine-950:#234238;--wine-900:#3f6f5a;--wine-800:#669861;--wine-700:#e36f4b;--wine-600:#ef8a5f;--cream-50:#fffbed;--cream-100:#f7edc9;--gold-500:#e0ad3d;--gold-300:#ffd978;--rose-100:#fff2d5;--hero-end:#73a981;--particle-light:#ffe18a;--particle-accent:#ef8a5f;--particle-alt:#63a6c7;--particle-edge:rgba(36,48,39,.42);--particle-glow:rgba(255,225,138,.72)}
    body[data-template="modern-vow"]{--bg:#f1e7d8;--paper:#fffaf1;--ink:#2f291f;--soft:#74695a;--deep:#735a3d;--mid:#b48d5d;--gold:#c4a060;--ink-soft:#74695a;--wine-950:#4a3928;--wine-900:#735a3d;--wine-800:#9d8058;--wine-700:#b48d5d;--wine-600:#c8a475;--cream-50:#fffaf1;--cream-100:#f4e7d4;--gold-500:#c4a060;--gold-300:#ecd09a;--rose-100:#fff6e8;--hero-end:#c8ad87;--particle-light:#ffe1a0;--particle-accent:#a8784f;--particle-alt:#7d927a;--particle-edge:rgba(47,41,31,.46);--particle-glow:rgba(255,225,160,.68)}
    body[data-template="blue-porcelain"]{--bg:#e6eef8;--paper:#fbfdff;--ink:#17253f;--soft:#586982;--deep:#123a82;--mid:#2363c9;--gold:#b5964c;--ink-soft:#586982;--wine-950:#0c234f;--wine-900:#123a82;--wine-800:#1850a9;--wine-700:#2363c9;--wine-600:#3e7adf;--cream-50:#fbfdff;--cream-100:#e8f1fb;--gold-500:#b5964c;--gold-300:#e2c987;--rose-100:#edf5ff;--hero-end:#d8e7f8;--particle-light:#f4d785;--particle-accent:#1e58b8;--particle-alt:#6e91bd;--particle-edge:rgba(12,35,79,.46);--particle-glow:rgba(244,215,133,.62)}
    body[data-template="peony-tribute"],body[data-template="red-silk"],body[data-template="golden-years"]{--bg:#ead7bc;--paper:#fff6e9;--ink:#321c1c;--soft:#755c4f;--deep:#67161d;--mid:#a93c3f;--gold:#c49a4f;--ink-soft:#755c4f;--wine-950:#3b0e14;--wine-900:#67161d;--wine-800:#90242c;--wine-700:#a93c3f;--wine-600:#bc5956;--cream-50:#fff6e9;--cream-100:#f2dfc2;--gold-500:#c49a4f;--gold-300:#e6c47c;--rose-100:#f7dfcf;--hero-end:#7b2727;--particle-light:#f3cf83;--particle-accent:#b93c47;--particle-alt:#77815f;--particle-edge:rgba(50,28,28,.56);--particle-glow:rgba(243,207,131,.66)}
  `;

  /* A translated sentence inlined into a <script> body. `<` is escaped so no
     dictionary entry can ever close the script element early. */
  const scriptLiteral = (value) => JSON.stringify(String(value))
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

  const renderStandaloneMapScript = (invitation, language = DEFAULT_CHROME_LANGUAGE) => {
    const hasDynamicMaps = invitation.mapEnabled
      || invitation.items.some((item) => item.type === "course" && item.mapEnabled);
    const provider = normalizeMapProvider(invitation.mapProvider);
    const key = mapKeyFor(invitation);
    if (!hasDynamicMaps || !key) return "";

    /* Maps are never drawn in this document. Invitations are shown inside
       about:srcdoc frames (studio preview, published viewer), and both map
       services reject that page when they authorize the key:
       - NAVER sends "about:srcdoc" as the page URL and answers
         "Open API 인증이 실패했습니다" (500).
       - Google reports the site as "null" in a delayed check about forty
         seconds after the map appears (RefererNotAllowedMapError).
       Each map is therefore a frame of assets/integrations/naver-map.html or
       google-map.html, which have a real URL, and reports back with
       postMessage. Coordinates and the public key travel in the fragment,
       which is never sent to a server. A rejected key, a load error or
       fifteen seconds of silence leaves the "use the button below" status. */
    const page = provider === "google" ? "google-map.html" : "naver-map.html";
    return `<script>
(() => {
  const canvases = [...document.querySelectorAll("[data-dynamic-map]")];
  const fail = (canvas) => {
    canvas.dataset.mapState = "fallback";
    const status = canvas.nextElementSibling;
    if (status) status.textContent = ${scriptLiteral(t("map.unavailable", language))};
  };
  if (!canvases.length || location.protocol === "file:") {
    canvases.forEach(fail);
    return;
  }
  const frames = new Map();
  window.addEventListener("message", (event) => {
    const canvas = frames.get(event.source);
    if (!canvas || event.data?.type !== "invitation-map") return;
    if (event.data.state === "ready" && canvas.dataset.mapState !== "fallback") canvas.dataset.mapState = "ready";
    else if (event.data.state === "failed") fail(canvas);
  });
  canvases.forEach((canvas) => {
    const frame = document.createElement("iframe");
    const hash = new URLSearchParams({
      lat: canvas.dataset.latitude,
      lng: canvas.dataset.longitude,
      zoom: canvas.dataset.zoom,
      lang: ${scriptLiteral(language)},
      key: ${scriptLiteral(key)}
    });
    frame.src = new URL(${scriptLiteral(`/assets/integrations/${page}`)}, document.baseURI).href + "#" + hash;
    frame.title = ${scriptLiteral(t("invitation.mapRegionLabel", language))};
    frame.loading = "lazy";
    frame.style.cssText = "display:block;width:100%;height:100%;border:0";
    canvas.append(frame);
    frames.set(frame.contentWindow, canvas);
    setTimeout(() => { if (!canvas.dataset.mapState) fail(canvas); }, 15000);
  });
})();
</script>`;
  };

  /* The invitation's times are the party's own; a guest reading it from
     another country has no way to know that from the page alone. Their device
     does know, so the document asks it once and reveals the note only when the
     two disagree — nothing to read for everyone in the same place, and no
     silent conversion of the times themselves, which would turn the author's
     "7pm" into someone else's "11am" and be wrong the moment a calendar
     rule changed. */
  const renderStandaloneTimeZoneScript = (invitation) => {
    if (!normalizeDateTime(invitation.dateTime) || !normalizeTimeZone(invitation.timeZone)) return "";
    return `<script>
(() => {
  const note = document.querySelector("[data-invitation-time-zone]");
  if (!note) return;
  try {
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (here && here !== note.dataset.invitationTimeZone) note.hidden = false;
  } catch {
    // No Intl, no way to compare, no note.
  }
})();
</script>`;
  };

  /* A finished, self-contained document. It is generated once and then
     travels — downloaded, mailed, re-uploaded, reopened years later — so every
     word of chrome in it is frozen at this moment and can never adapt again.
     That is exactly why `language` belongs here and not in the invitation
     data: it describes this rendering, and the rendering records it in
     <html lang> so the file stays self-describing. readStandaloneLanguage()
     reads it back, which is what lets a re-import or a viewer rebuild
     reproduce the file the author actually made instead of quietly
     re-languaging it to whatever the studio is set to today. */
  const buildStandaloneHtml = (input = {}, { language } = {}) => {
    const invitation = normalizeInvitation(input);
    const chrome = chromeLanguage(language);
    const hasIntro = invitation.introEffect !== "none";
    const introStyles = hasIntro ? InvitationIntro.getStyles() : "";
    // The intro reprints the date, so it gets the resolved one rather than a
    // blank line when the author left the wording to us.
    const introMarkup = hasIntro
      ? InvitationIntro.renderMarkup(
        { ...invitation, dateLabel: resolveDateLabel(invitation, dateLocaleFor(language || chrome)) },
        { language: chrome }
      )
      : "";
    const introRuntime = hasIntro ? InvitationIntro.getStandaloneRuntime() : "";
    const canonicalInvitation = { ...invitation, stops: undefined };
    const invitationData = JSON.stringify(canonicalInvitation)
      .replace(/&/g, "\\u0026")
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    return `<!doctype html>
<html lang="${escapeHtml(chrome)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#42101f">
  <title>${escapeHtml(invitation.title)}</title>
  <link rel="icon" href="data:,">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${buildFontsUrl(invitation).replace(/&/g, "&amp;")}" rel="stylesheet">
  <style>${standaloneCss}${standaloneTemplatePaletteCss}${TemplateRenderers.getStyles()}${introStyles}</style>
</head>
<body data-template="${escapeHtml(invitation.templateId)}" data-particle="${escapeHtml(invitation.particleEffect)}" style="${invitationStyleFrom(invitation)}">
${introMarkup}
${renderInvitationBody(invitation, { language: language || chrome })}
<script id="invitation-data" type="application/json">${invitationData}</script>
${renderStandaloneTimeZoneScript(invitation)}
${renderStandaloneMapScript(invitation, chrome)}
${introRuntime}
</body>
</html>`;
  };

  /* The other half of the round trip. Given a standalone file — or the parsed
     document of one — return the chrome language it was built with, so a
     re-import or a viewer rebuild reproduces the same document rather than
     re-languaging someone's finished invitation.

     Files exported before this existed carry lang="ko", which is precisely
     what they were built in, so old files round-trip correctly too. */
  const readStandaloneLanguage = (source) => {
    const declared = typeof source === "string"
      ? source.match(/<html[^>]*\slang\s*=\s*"([^"]*)"/i)?.[1]
      : source?.documentElement?.getAttribute?.("lang");
    return chromeLanguage(declared);
  };

  const api = {
    MAX_ITEMS,
    MAX_PHOTOS,
    MAX_STOPS,
    defaultInvitation,
    createDefaultInvitation,
    getInvitationStyle,
    normalizeInvitation,
    readStandaloneLanguage,
    renderCalendarLink,
    renderInvitationBody,
    buildStandaloneHtml,
    buildFontsUrl,
    englishFonts,
    koreanFonts
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.InvitationCore = api;
})(typeof window !== "undefined" ? window : globalThis);
