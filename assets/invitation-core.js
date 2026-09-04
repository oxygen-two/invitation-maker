(function (root) {
  const defaultInvitation = {
    templateId: "royal",
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
    confetti: ["#f4c95d", "#ea7f8d", "#6cb7a7", "#8f7cc2"],
    fireflies: ["#fff4a3", "#d8ffd2", "#f5ffbd"],
    hearts: ["#f27c9a", "#d94b73", "#ffb3c6"],
    leaves: ["#769b4e", "#b99b43", "#4f7f59"],
    snow: [".46", ".62", ".78", ".92"],
    default: ["#f8d9df", "#f3b9c4", "#fff1d0"]
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
      const type = item.type === "photo" ? "photo" : item.type === "course" ? "course" : "";
      if (!type || (type === "photo" && photoCount >= MAX_PHOTOS)) continue;

      const id = normalizeItemId(item.id, type, usedIds);
      const normalizedItem = type === "photo"
        ? normalizePhoto(item, id)
        : normalizeCourse(item, id);
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

  const renderInvitationBody = (input = {}) => {
    const invitation = normalizeInvitation(input);
    const englishFont = englishFonts[invitation.englishFont];
    const koreanFont = koreanFonts[invitation.koreanFont];
    let courseNumber = 0;
    const items = invitation.items.map((item) => {
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

    return `
      <article class="invitation-card" data-particle="${escapeHtml(invitation.particleEffect)}" data-english-font="${escapeHtml(invitation.englishFont)}" data-korean-font="${escapeHtml(invitation.koreanFont)}" style="--font-en:'${englishFont}';--font-ko:'${koreanFont}'">
        ${renderParticles(invitation.particleEffect, invitation.particleScale, invitation.particleAmount)}
        <header class="invite-hero">
          <p class="invite-kicker">Invitation</p>
          <h1>${escapeHtml(invitation.title)}</h1>
          <p class="invite-subtitle">${escapeHtml(invitation.subtitle)}</p>
        </header>
        <section class="invite-section invite-message">
          <p>${escapeHtml(invitation.message)}</p>
        </section>
        <section class="invite-section invite-meta">
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
        </section>
        <section class="invite-section invite-timeline">
          ${items}
        </section>
        ${renderDynamicMap(invitation)}
        ${renderMapLink(getMapFallbackUrl(invitation, invitation.location), "invite-map", "대표 지도 열기")}
      </article>
    `;
  };

  const standaloneCss = `
    @font-face{font-family:"Gmarket Sans";font-style:normal;font-weight:500;font-display:swap;src:url("https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/GmarketSansMedium.woff") format("woff")}@font-face{font-family:"Gmarket Sans";font-style:normal;font-weight:700;font-display:swap;src:url("https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/GmarketSansBold.woff") format("woff")}
    :root{--bg:#ead5ce;--paper:#fffaf2;--ink:#2a1720;--soft:#65535a;--deep:#42101f;--mid:#7a243b;--gold:#d9ac54;--line:rgba(101,58,65,.16)}
    body[data-template="wedding"]{--bg:#f2e8d8;--paper:#fffaf1;--ink:#33241a;--soft:#705d4c;--deep:#6d4f31;--mid:#9b7551;--gold:#c7a15d}
    body[data-template="black-tie"]{--bg:#d8d3ca;--paper:#f8f4ec;--ink:#17191f;--soft:#5f6876;--deep:#08090b;--mid:#353b48;--gold:#c9a45e}
    body[data-template="botanical"]{--bg:#e4ead8;--paper:#fbfbef;--ink:#102018;--soft:#52695b;--deep:#1f3a2c;--mid:#407055;--gold:#b89d50}
    body[data-template="modern"]{--bg:#efe9e3;--paper:#fffaf5;--ink:#1f1b1a;--soft:#6d625b;--deep:#34302d;--mid:#766b62;--gold:#b17846}
    *{box-sizing:border-box}body{margin:0;padding:28px 14px;background:linear-gradient(145deg,var(--bg),#fff);color:var(--ink);font-family:"Noto Sans KR",sans-serif;line-height:1.7}.invitation-card{max-width:430px;margin:0 auto;overflow:hidden;overflow-wrap:anywhere;background:var(--paper);box-shadow:0 26px 80px rgba(45,11,22,.22);font-family:var(--font-ko),"Noto Sans KR",sans-serif}.invite-hero{min-height:420px;display:grid;align-content:center;padding:48px 28px;text-align:center;color:#fff;background:radial-gradient(circle at 50% 30%,rgba(217,172,84,.32),transparent 34%),linear-gradient(180deg,var(--deep),var(--mid))}.invite-kicker{margin:0 0 14px;color:#f6dda6;font-family:var(--font-en),serif;text-transform:uppercase;letter-spacing:.22em;font-size:12px}.invite-hero h1{margin:0;font-family:var(--font-en),var(--font-ko),serif;font-size:39px;line-height:1.15;font-style:italic;font-weight:500}.invitation-card[data-english-font="dm-serif-display"] .invite-hero h1,.invitation-card[data-english-font="great-vibes"] .invite-hero h1{font-style:normal;font-weight:400}.invite-subtitle{margin:18px 0 0;font-family:var(--font-ko),serif;font-size:14px;opacity:.86}.invite-section{padding:28px 24px;border-bottom:1px solid var(--line)}.invite-message{font-family:var(--font-ko),serif;font-size:17px;text-align:center}.invite-meta{display:grid;gap:12px}.invite-meta div{padding:14px;border:1px solid var(--line)}.invite-meta span{display:block;color:var(--gold);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.14em}.invite-meta strong{display:block;margin-top:3px}.invite-timeline{display:grid;gap:14px}.invite-stop{display:grid;grid-template-columns:42px 1fr;gap:12px}.invite-stop-number{display:grid;width:38px;height:38px;place-items:center;border:1px solid var(--gold);border-radius:50%;color:var(--mid);font-family:var(--font-en),serif;font-weight:700}.invite-stop-time{margin:0 0 3px;color:var(--mid);font-size:12px;font-weight:700;letter-spacing:.08em}.invite-stop h3{margin:0;font-family:var(--font-ko),serif;font-size:18px}.invite-stop p{margin:4px 0 0;color:var(--soft);font-size:14px}.invite-photo{max-width:100%;min-width:0;margin:0;overflow:hidden}.invite-photo img{display:block;width:100%;height:auto}.invite-photo figcaption{max-width:100%;padding:8px 4px 0;color:var(--soft);font-size:13px;line-height:1.5;overflow-wrap:anywhere}.invite-map{display:flex;min-height:52px;align-items:center;justify-content:center;margin:24px;color:#fff;background:var(--deep);border-radius:8px;text-decoration:none;font-weight:700}@media(max-width:480px){body{padding:0}.invitation-card{box-shadow:none}}
    .invitation-card{position:relative;isolation:isolate}.particle-layer{position:absolute;z-index:2;inset:0;overflow:hidden;pointer-events:none}.particle-layer span{position:absolute;top:0;left:var(--x);display:block;width:calc(var(--size) * var(--particle-scale));height:100%;opacity:0;animation:particle-fall var(--duration) linear var(--delay) infinite;will-change:transform}.particle-layer span::before{display:block;width:100%;height:calc(var(--size) * var(--particle-scale));animation:particle-spin 5s linear var(--delay) infinite;content:""}.particle-layer[data-effect="fireflies"] span,.particle-layer[data-effect="bubbles"] span{animation-name:particle-rise}.particle-layer[data-effect="snow"] span{animation-duration:calc(var(--duration) * 1.35)}.particle-layer[data-effect="sparkle"] span::before{border-radius:50%;background:#fff8d9;box-shadow:0 0 8px 2px rgba(255,242,188,.78)}.particle-layer[data-effect="petals"] span::before{border-radius:70% 0 70% 0;background:var(--tone)}.particle-layer[data-effect="hearts"] span::before{display:grid;place-items:center;color:var(--tone);font-size:calc(var(--size) * var(--particle-scale) * 1.55);line-height:1;text-shadow:0 2px 8px rgba(122,36,59,.22);content:"❤"}.particle-layer[data-effect="fireflies"] span::before{border-radius:50%;background:var(--tone);box-shadow:0 0 12px 4px var(--tone);animation:particle-spin 6s linear var(--delay) infinite,particle-pulse var(--pulse-duration) ease-in-out var(--pulse-delay) infinite}.particle-layer[data-effect="bubbles"] span::before{border:1px solid rgba(255,255,255,.72);border-radius:50%;background:rgba(255,255,255,.18);box-shadow:inset -3px -4px 8px rgba(255,255,255,.24);animation:particle-pulse 5.6s ease-in-out var(--pulse-delay) infinite}.particle-layer[data-effect="snow"] span::before{border-radius:50%;background:rgba(255,255,255,var(--tone));box-shadow:0 0 7px rgba(255,255,255,.42);animation:none}.particle-layer[data-effect="leaves"] span::before{border-radius:80% 0 70% 10%;background:var(--tone);box-shadow:inset -3px -2px 0 rgba(42,23,32,.12);animation:particle-spin 3.8s linear var(--delay) infinite}.particle-layer[data-effect="confetti"] span::before{height:calc(var(--size) * var(--particle-scale) * .48);border-radius:1px;background:var(--tone)}@keyframes particle-fall{0%{opacity:0;transform:translate3d(0,-24px,0)}12%,84%{opacity:.78}50%{transform:translate3d(var(--sway),48%,0)}100%{opacity:0;transform:translate3d(var(--drift),calc(100% + 24px),0)}}@keyframes particle-rise{0%{opacity:0;transform:translate3d(0,calc(100% + 24px),0)}14%,82%{opacity:.74}50%{transform:translate3d(var(--sway),42%,0)}100%{opacity:0;transform:translate3d(var(--drift),-32px,0)}}@keyframes particle-spin{from{transform:rotate(var(--turn))}to{transform:rotate(calc(var(--turn) + 480deg))}}@keyframes particle-pulse{0%,100%{opacity:.45;transform:scale(.72)}50%{opacity:1;transform:scale(1.18)}}@media(max-width:540px){.particle-layer span:nth-child(n+17){display:none}}@media(prefers-reduced-motion:reduce){.particle-layer{display:none}}
    .invite-map-panel{position:relative;height:260px;margin:24px;overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#eee7df}.invite-map-panel.is-stop-map{height:180px;margin:14px 0 0}.invite-map-canvas{width:100%;height:100%}.invite-map-status{position:absolute;inset:0;display:grid;place-items:center;margin:0;padding:24px;color:var(--soft);background:rgba(255,250,242,.94);text-align:center;font-size:13px}.invite-map-canvas[data-map-state="ready"]+.invite-map-status{display:none}.invite-stop-map-link{display:inline-flex;min-height:44px;align-items:center;margin-top:4px;color:var(--mid);font-size:13px;font-weight:700}@media(max-width:480px){.invite-map-panel{height:220px;margin:18px}.invite-map-panel.is-stop-map{height:170px;margin:12px 0 0}}
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
  <style>${standaloneCss}</style>
</head>
<body data-template="${escapeHtml(invitation.templateId)}" data-particle="${escapeHtml(invitation.particleEffect)}">
${renderInvitationBody(invitation)}
<script id="invitation-data" type="application/json">${invitationData}</script>
${renderStandaloneMapScript(invitation)}
</body>
</html>`;
  };

  const api = {
    MAX_ITEMS,
    MAX_PHOTOS,
    MAX_STOPS,
    defaultInvitation,
    normalizeInvitation,
    renderInvitationBody,
    buildStandaloneHtml
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.InvitationCore = api;
})(typeof window !== "undefined" ? window : globalThis);
