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
        return require("./hero-image.js");
      } catch {
        return noHeroImage;
      }
    }
    return root.HeroImage || noHeroImage;
  })();
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
    mapEnabled: false,
    mapLatitude: null,
    mapLongitude: null,
    mapZoom: 16,
    title: "우리의 특별한 하루",
    subtitle: "당신을 위해 준비한 초대장",
    dateLabel: "2026.09.12 SAT 14:00",
    host: "From. Rin",
    location: "장소를 입력하세요",
    mapUrl: "",
    message: "함께 걷고, 이야기하고, 오래 기억할 하루를 준비했어요.",
    stops: [
      { time: "14:00", label: "MEET", place: "만남 장소", note: "첫 만남 위치를 적어주세요." },
      { time: "15:00", label: "CAFE", place: "카페", note: "대화하기 좋은 장소를 넣어주세요." },
      { time: "17:00", label: "WALK", place: "산책", note: "날씨에 맞는 동선을 적어주세요." },
      { time: "19:00", label: "DINNER", place: "저녁", note: "예약 정보나 추천 메뉴를 적어주세요." }
    ]
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
  const englishFonts = Object.freeze({
    "cormorant-garamond": "Cormorant Garamond",
    "playfair-display": "Playfair Display",
    "dm-serif-display": "DM Serif Display",
    "libre-baskerville": "Libre Baskerville",
    "great-vibes": "Great Vibes"
  });
  const koreanFonts = Object.freeze({
    "gowun-batang": "Gowun Batang",
    "noto-serif-kr": "Noto Serif KR",
    "nanum-myeongjo": "Nanum Myeongjo",
    "nanum-gothic": "Nanum Gothic",
    "song-myung": "Song Myung",
    "gmarket-sans": "Gmarket Sans"
  });
  const googleFontsUrl = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=DM+Serif+Display&family=Gowun+Batang:wght@400;700&family=Great+Vibes&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Nanum+Gothic:wght@400;700&family=Nanum+Myeongjo:wght@400;700&family=Noto+Sans+KR:wght@400;500;600;700&family=Noto+Serif+KR:wght@400;600;700&family=Playfair+Display:ital,wght@0,500;0,600;1,500;1,600&family=Song+Myung&display=swap";
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

  const normalizeItems = (input) => {
    const sourceItems = Array.isArray(input.items)
      ? input.items
      : normalizeStops(input.stops || defaultInvitation.stops).map((stop) => ({ type: "course", ...stop }));
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
    const items = normalizeItems(input);
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
      title: input.title ?? defaultInvitation.title,
      subtitle: input.subtitle ?? defaultInvitation.subtitle,
      dateLabel: input.dateLabel ?? defaultInvitation.dateLabel,
      host: input.host ?? defaultInvitation.host,
      location: input.location ?? defaultInvitation.location,
      mapUrl: normalizeMapUrl(input.mapUrl, input.mapUrl === undefined ? defaultInvitation.mapUrl : ""),
      mapEnabled: requestedMap && mapLatitude !== null && mapLongitude !== null,
      mapLatitude,
      mapLongitude,
      mapZoom,
      message: input.message ?? defaultInvitation.message,
      items,
      stops
    };
  };

  const invitationStyleFrom = (invitation) =>
    `--font-en:'${englishFonts[invitation.englishFont]}';--font-ko:'${koreanFonts[invitation.koreanFont]}'`;

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

  const renderDynamicMap = (mapSettings, variant = "global", mapKey = "representative") => {
    if (!mapSettings.mapEnabled) return "";

    const status = mapSettings.naverMapClientId
      ? "지도를 불러오는 중입니다."
      : "지도를 불러올 수 없습니다. 아래 버튼으로 확인하세요.";
    const variantClass = variant === "stop" ? " is-stop-map" : "";
    return `
        <section class="invite-map-panel${variantClass}" data-map-key="${mapKey}" aria-label="약속 장소 지도">
          <div class="invite-map-canvas" data-dynamic-map data-latitude="${mapSettings.mapLatitude}" data-longitude="${mapSettings.mapLongitude}" data-zoom="${mapSettings.mapZoom}"></div>
          <p class="invite-map-status" data-map-status role="status" aria-live="polite">${status}</p>
        </section>
    `;
  };

  const renderMapLink = (mapUrl, className, label) => mapUrl
    ? `<a class="${className}" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener noreferrer">${label}</a>`
    : "";

  const getMapFallbackUrl = (mapSettings, place) => mapSettings.mapUrl || (place
    ? `https://map.naver.com/p/search/${encodeURIComponent(place)}`
    : mapSettings.mapEnabled
      ? "https://map.naver.com/"
      : "");

  const renderInvitationItems = (invitation) => {
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
        <p class="invite-item-eyebrow">안내</p>
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
          ${renderDynamicMap({ ...item, naverMapClientId: invitation.naverMapClientId }, "stop", `stop-${courseIndex}`)}
          ${renderMapLink(getMapFallbackUrl(item, item.place), "invite-stop-map-link", "장소 지도 열기")}
        </div>
      </article>
      `;
    }).join("");
  };

  const renderInvitationBody = (input = {}) => {
    const invitation = normalizeInvitation(input);
    const customHero = invitation.heroImage;
    const art = customHero?.src || TemplateArt.getDataUrl(invitation.templateId);
    const artAttributes = customHero
      ? `data-custom-hero-image style="--hero-image-scale:${customHero.scale / 100};--hero-image-x:${customHero.positionX}%;--hero-image-y:${customHero.positionY}%"`
      : "";
    const slots = {
      articleAttributes: `data-template="${escapeHtml(invitation.templateId)}" data-particle="${escapeHtml(invitation.particleEffect)}" data-english-font="${escapeHtml(invitation.englishFont)}" data-korean-font="${escapeHtml(invitation.koreanFont)}" style="${invitationStyleFrom(invitation)}"`,
      particles: renderParticles(invitation.particleEffect, invitation.particleScale, invitation.particleAmount),
      art: escapeHtml(art),
      artAttributes,
      kicker: "Invitation",
      title: escapeHtml(invitation.title),
      subtitle: escapeHtml(invitation.subtitle),
      message: escapeHtml(invitation.message),
      meta: `
          <div>
            <span>Date</span>
            <strong>${escapeHtml(invitation.dateLabel)}</strong>
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
      items: renderInvitationItems(invitation),
      map: renderDynamicMap(invitation),
      mapLink: renderMapLink(getMapFallbackUrl(invitation, invitation.location), "invite-map", "대표 지도 열기")
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

  const renderStandaloneMapScript = (invitation) => {
    const hasDynamicMaps = invitation.mapEnabled
      || invitation.items.some((item) => item.type === "course" && item.mapEnabled);
    if (!hasDynamicMaps || !invitation.naverMapClientId) return "";

    const apiUrl = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(invitation.naverMapClientId)}`;
    return `<script>
(() => {
  const canvases = [...document.querySelectorAll("[data-dynamic-map]")];
  const fail = (canvas) => {
    if (canvas) canvas.dataset.mapState = "fallback";
    const status = canvas?.nextElementSibling;
    if (status) status.textContent = "지도를 불러올 수 없습니다. 아래 버튼으로 확인하세요.";
  };
  const failAll = () => canvases.forEach(fail);
  const mount = () => {
    canvases.forEach((canvas) => {
      try {
        const position = new window.naver.maps.LatLng(
          Number(canvas.dataset.latitude),
          Number(canvas.dataset.longitude)
        );
        const map = new window.naver.maps.Map(canvas, {
          center: position,
          zoom: Number(canvas.dataset.zoom)
        });
        new window.naver.maps.Marker({ map, position });
        canvas.dataset.mapState = "ready";
      } catch (error) {
        fail(canvas);
      }
    });
  };
  let timeoutId;
  const finish = (callback) => {
    clearTimeout(timeoutId);
    script.onload = null;
    script.onerror = null;
    script.remove();
    callback();
  };
  window.navermap_authFailure = failAll;
  if (!canvases.length || location.protocol === "file:") {
    failAll();
    return;
  }
  const script = document.createElement("script");
  script.src = "${apiUrl}";
  script.async = true;
  script.onload = () => finish(mount);
  script.onerror = () => finish(failAll);
  timeoutId = setTimeout(() => finish(failAll), 10000);
  document.head.append(script);
})();
</script>`;
  };

  const buildStandaloneHtml = (input = {}) => {
    const invitation = normalizeInvitation(input);
    const hasIntro = invitation.introEffect !== "none";
    const introStyles = hasIntro ? InvitationIntro.getStyles() : "";
    const introMarkup = hasIntro ? InvitationIntro.renderMarkup(invitation) : "";
    const introRuntime = hasIntro ? InvitationIntro.getStandaloneRuntime() : "";
    const canonicalInvitation = { ...invitation, stops: undefined };
    const invitationData = JSON.stringify(canonicalInvitation)
      .replace(/&/g, "\\u0026")
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#42101f">
  <title>${escapeHtml(invitation.title)}</title>
  <link rel="icon" href="data:,">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${googleFontsUrl.replace(/&/g, "&amp;")}" rel="stylesheet">
  <style>${standaloneCss}${standaloneTemplatePaletteCss}${TemplateRenderers.getStyles()}${introStyles}</style>
</head>
<body data-template="${escapeHtml(invitation.templateId)}" data-particle="${escapeHtml(invitation.particleEffect)}" style="${invitationStyleFrom(invitation)}">
${introMarkup}
${renderInvitationBody(invitation)}
<script id="invitation-data" type="application/json">${invitationData}</script>
${renderStandaloneMapScript(invitation)}
${introRuntime}
</body>
</html>`;
  };

  const api = {
    MAX_ITEMS,
    MAX_PHOTOS,
    MAX_STOPS,
    defaultInvitation,
    getInvitationStyle,
    normalizeInvitation,
    renderInvitationBody,
    buildStandaloneHtml
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.InvitationCore = api;
})(typeof window !== "undefined" ? window : globalThis);
