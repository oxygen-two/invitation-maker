(function (root) {
  const safeImagePattern = /^data:image\/(?:jpeg|png|webp);base64,(?:(?:[A-Za-z0-9+/]{4})+|(?:[A-Za-z0-9+/]{4})*[A-Za-z0-9+/]{3}=|(?:[A-Za-z0-9+/]{4})*[A-Za-z0-9+/]{2}==)$/;
  const controllers = new WeakMap();

  const PRESETS = Object.freeze({
    envelope: Object.freeze({ label: "봉투 열기", duration: 3.2 }),
    "card-shrink": Object.freeze({ label: "전체 화면 카드", duration: 3.0 }),
    dawn: Object.freeze({ label: "어둠에서 밝아지기", duration: 2.6 }),
    fireworks: Object.freeze({ label: "골드 폭죽", duration: 3.4 }),
    curtain: Object.freeze({ label: "커튼 열기", duration: 3.0 }),
    petals: Object.freeze({ label: "꽃잎 사이로", duration: 3.2 }),
    spotlight: Object.freeze({ label: "스포트라이트", duration: 2.8 }),
    "photo-focus": Object.freeze({ label: "사진 초점 전환", duration: 3.6 })
  });

  const escapeHtml = (value = "") =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);

  const normalizeEffect = (value) => Object.hasOwn(PRESETS, value) ? value : "none";

  const firstSafePhoto = (invitation = {}) => {
    const items = Array.isArray(invitation.items) ? invitation.items : [];
    return items.find((item) => item && item.type === "photo" && safeImagePattern.test(String(item.src || ""))) || null;
  };

  const renderDecor = (effect, invitation) => {
    if (effect === "envelope") {
      return '<div class="intro-envelope" aria-hidden="true"><span></span><span></span><span></span></div>';
    }
    if (effect === "card-shrink") {
      return '<div class="intro-card-plane" aria-hidden="true"></div>';
    }
    if (effect === "dawn") {
      return '<div class="intro-dawn" aria-hidden="true"></div>';
    }
    if (effect === "fireworks") {
      return `<div class="intro-bursts" aria-hidden="true">${Array.from({ length: 14 }, (_, index) => `<span style="--i:${index}"></span>`).join("")}</div>`;
    }
    if (effect === "curtain") {
      return '<div class="intro-curtain" aria-hidden="true"><span></span><span></span></div>';
    }
    if (effect === "petals") {
      return `<div class="intro-petals" aria-hidden="true">${Array.from({ length: 10 }, (_, index) => `<span style="--i:${index}"></span>`).join("")}</div>`;
    }
    if (effect === "spotlight") {
      return '<div class="intro-spotlight" aria-hidden="true"></div>';
    }
    if (effect === "photo-focus") {
      const photo = firstSafePhoto(invitation);
      return photo
        ? `<figure class="intro-photo" data-intro-photo aria-hidden="true"><img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.alt || "")}"></figure>`
        : '<div class="intro-photo-fallback" data-photo-fallback aria-hidden="true"></div>';
    }
    return "";
  };

  const renderMarkup = (invitation = {}, options = {}) => {
    const effect = normalizeEffect(invitation.introEffect);
    if (effect === "none") return "";
    const preset = PRESETS[effect];
    const preview = options.preview ? " data-intro-preview" : "";

    return `<div class="invitation-intro" data-intro-overlay data-intro-effect="${escapeHtml(effect)}" data-intro-duration="${preset.duration}"${preview}>
  ${renderDecor(effect, invitation)}
  <div class="intro-copy">
    <p class="intro-kicker">Invitation</p>
    <h1>${escapeHtml(invitation.title || "")}</h1>
    <p class="intro-subtitle">${escapeHtml(invitation.subtitle || "")}</p>
    <p class="intro-date">${escapeHtml(invitation.dateLabel || "")}</p>
    <p class="intro-host">${escapeHtml(invitation.host || "")}</p>
  </div>
  <button class="intro-skip" type="button" data-intro-skip aria-label="인트로 건너뛰기">건너뛰기</button>
</div>`;
  };

  const getStyles = () => `
.invitation-intro{position:fixed;z-index:1000;inset:0;display:grid;place-items:center;overflow:hidden;padding:24px;background:var(--paper,#fffaf2);color:var(--ink,#2a1720);font-family:var(--font-ko,"Noto Sans KR",serif);isolation:isolate;cursor:pointer}
.invitation-intro[data-intro-preview]{position:absolute}
.intro-copy{position:relative;z-index:3;width:min(88vw,420px);text-align:center;overflow-wrap:anywhere;pointer-events:none}
.intro-kicker{margin:0 0 12px;color:var(--gold,#d9ac54);font-family:var(--font-en,serif);font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
.intro-copy h1{margin:0;color:var(--deep,#42101f);font-family:var(--font-en,var(--font-ko,serif));font-size:clamp(32px,10vw,58px);font-style:italic;font-weight:500;line-height:1.1;letter-spacing:0}
.intro-subtitle,.intro-date,.intro-host{margin:12px 0 0;color:var(--soft,#65535a);font-size:14px;line-height:1.55}
.intro-date{color:var(--mid,#7a243b);font-weight:700}.intro-host{font-family:var(--font-en,var(--font-ko,serif))}
.intro-skip{position:absolute;z-index:5;top:max(16px,env(safe-area-inset-top));right:max(16px,env(safe-area-inset-right));min-height:40px;padding:0 14px;border:1px solid rgba(42,23,32,.18);border-radius:999px;background:rgba(255,250,242,.86);color:var(--ink,#2a1720);font:700 13px/1 var(--font-ko,"Noto Sans KR",sans-serif);cursor:pointer}
.intro-envelope,.intro-card-plane,.intro-dawn,.intro-curtain,.intro-petals,.intro-bursts,.intro-spotlight,.intro-photo,.intro-photo-fallback{position:absolute;z-index:1;inset:0;pointer-events:none}
.intro-envelope{display:grid;place-items:center}.intro-envelope span{position:absolute;width:min(72vw,360px);height:min(48vw,240px);background:var(--paper,#fffaf2);border:1px solid rgba(122,36,59,.2);box-shadow:0 22px 70px rgba(45,11,22,.18);transform:skewY(-7deg)}.intro-envelope span:nth-child(2){transform:translateY(22%) skewY(7deg)}.intro-envelope span:nth-child(3){height:min(24vw,120px);background:var(--gold,#d9ac54);opacity:.45;transform:translateY(-34%) rotate(45deg)}
.intro-card-plane{background:linear-gradient(180deg,var(--deep,#42101f),var(--mid,#7a243b));animation:intro-card-shrink 3s ease forwards}
.intro-dawn{background:radial-gradient(circle at 50% 32%,rgba(255,245,210,.9),transparent 34%),linear-gradient(180deg,#151015,var(--bg,#ead5ce));animation:intro-dawn 2.6s ease forwards}
.intro-curtain{display:grid;grid-template-columns:1fr 1fr}.intro-curtain span{background:linear-gradient(90deg,var(--deep,#42101f),var(--mid,#7a243b));animation:intro-curtain-left 3s ease forwards}.intro-curtain span+span{animation-name:intro-curtain-right}
.intro-bursts span,.intro-petals span{position:absolute;left:calc(8% + (var(--i) * 6.4%));top:calc(16% + ((var(--i) % 5) * 14%));display:block;width:8px;height:8px;background:var(--gold,#d9ac54);animation:intro-float 3.2s ease forwards}.intro-bursts span{border-radius:50%;box-shadow:0 0 18px rgba(217,172,84,.72)}.intro-petals span{border-radius:70% 0 70% 0;background:#ef9caf}
.intro-spotlight{background:radial-gradient(circle at 50% 45%,rgba(255,250,242,.95),rgba(255,250,242,.42) 24%,rgba(42,23,32,.68) 70%);animation:intro-spotlight 2.8s ease forwards}
.intro-photo,.intro-photo-fallback{display:grid;place-items:center;background:linear-gradient(145deg,var(--bg,#ead5ce),var(--paper,#fffaf2))}.intro-photo img{width:100%;height:100%;object-fit:cover;filter:blur(16px);transform:scale(1.08);animation:intro-photo-focus 3.6s ease forwards}.intro-photo-fallback{background:radial-gradient(circle at 50% 38%,rgba(217,172,84,.35),transparent 30%),linear-gradient(160deg,var(--paper,#fffaf2),var(--bg,#ead5ce))}
.invitation-intro.is-finishing{pointer-events:none;animation:intro-fade-out .28s ease forwards}.is-intro-active .particle-layer{animation-play-state:paused}
@keyframes intro-card-shrink{0%{transform:scale(1);opacity:1}100%{transform:scale(.72);opacity:0}}@keyframes intro-dawn{0%{filter:brightness(.35)}100%{filter:brightness(1.08);opacity:.26}}@keyframes intro-curtain-left{100%{transform:translateX(-104%)}}@keyframes intro-curtain-right{100%{transform:translateX(104%)}}@keyframes intro-float{100%{opacity:0;transform:translateY(-44px) rotate(140deg) scale(1.4)}}@keyframes intro-spotlight{0%{clip-path:circle(12% at 50% 45%)}100%{clip-path:circle(100% at 50% 45%);opacity:.18}}@keyframes intro-photo-focus{100%{filter:blur(0);transform:scale(1)}}@keyframes intro-fade-out{100%{opacity:0}}
@media(prefers-reduced-motion:reduce){.invitation-intro{display:none}}
`;

  const ensureStyles = (document) => {
    const existing = document.querySelector("style[data-intro-styles]");
    if (existing) return existing;
    const style = document.createElement("style");
    style.setAttribute("data-intro-styles", "");
    style.textContent = getStyles();
    document.head.append(style);
    return style;
  };

  const environmentFor = (host, environment = {}) => {
    const document = host.ownerDocument || root.document;
    const view = document && (document.defaultView || document.parentWindow);
    return {
      clearTimeout: environment.clearTimeout || (view && view.clearTimeout ? view.clearTimeout.bind(view) : clearTimeout),
      document,
      matchReducedMotion: environment.matchReducedMotion || (() => Boolean(view && view.matchMedia && view.matchMedia("(prefers-reduced-motion: reduce)").matches)),
      setTimeout: environment.setTimeout || (view && view.setTimeout ? view.setTimeout.bind(view) : setTimeout)
    };
  };

  const stop = (host) => {
    const controller = controllers.get(host);
    if (controller) controller.finish();
  };

  const play = (host, invitation = {}, environment = {}) => {
    if (!host) return null;
    stop(host);

    const effect = normalizeEffect(invitation.introEffect);
    if (effect === "none") return null;
    const env = environmentFor(host, environment);
    if (env.matchReducedMotion()) return null;

    let overlay = null;
    let timerId = null;
    let finished = false;
    let onClick = null;
    let onKeyDown = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      if (timerId !== null) env.clearTimeout(timerId);
      if (overlay && overlay.removeEventListener && onClick) overlay.removeEventListener("click", onClick);
      if (env.document && env.document.removeEventListener && onKeyDown) env.document.removeEventListener("keydown", onKeyDown);
      if (overlay && overlay.classList && overlay.classList.add) overlay.classList.add("is-finishing");
      if (overlay && overlay.remove) overlay.remove();
      host.classList.remove("is-intro-active");
      controllers.delete(host);
    };

    try {
      host.classList.add("is-intro-active");
      host.insertAdjacentHTML("afterbegin", renderMarkup(invitation, environment.preview ? { preview: true } : {}));
      overlay = host.querySelector("[data-intro-overlay]");
      if (!overlay) throw new Error("Intro overlay did not mount");

      onClick = (event) => {
        if (event && event.preventDefault) event.preventDefault();
        finish();
      };
      onKeyDown = (event) => {
        if (event && event.key === "Escape") finish();
      };

      if (overlay.addEventListener) overlay.addEventListener("click", onClick);
      const skip = overlay.querySelector && overlay.querySelector("[data-intro-skip]");
      if (skip && skip.addEventListener) skip.addEventListener("click", onClick);
      if (env.document && env.document.addEventListener) env.document.addEventListener("keydown", onKeyDown);

      timerId = env.setTimeout(finish, Math.round(PRESETS[effect].duration * 1000));
      const controller = { finish };
      controllers.set(host, controller);
      return controller;
    } catch {
      finish();
      return null;
    }
  };

  const getStandaloneRuntime = () => `<script data-intro-runtime>
(() => {
  const presets = ${JSON.stringify(Object.fromEntries(Object.entries(PRESETS).map(([id, preset]) => [id, { duration: preset.duration }])))};
  const activeController = new WeakMap();
  const normalizeEffect = (value) => Object.hasOwn(presets, value) ? value : "none";
  const reducedMotion = () => Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const InvitationIntro = {
    play(host, invitation = {}) {
      InvitationIntro.stop(host);
      const effect = normalizeEffect(invitation.introEffect);
      const overlay = host && host.querySelector("[data-intro-overlay]");
      if (!host || effect === "none" || reducedMotion()) {
        if (overlay) overlay.remove();
        return null;
      }
      let finished = false;
      let timerId = null;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (timerId !== null) window.clearTimeout(timerId);
        overlay.removeEventListener("click", finish);
        document.removeEventListener("keydown", onKeyDown);
        overlay.classList.add("is-finishing");
        overlay.remove();
        host.classList.remove("is-intro-active");
        activeController.delete(host);
      };
      const onKeyDown = (event) => {
        if (event.key === "Escape") finish();
      };
      host.classList.add("is-intro-active");
      overlay.addEventListener("click", finish);
      document.addEventListener("keydown", onKeyDown);
      timerId = window.setTimeout(finish, Math.round(presets[effect].duration * 1000));
      const controller = { finish };
      activeController.set(host, controller);
      return controller;
    },
    stop(host) {
      const controller = activeController.get(host);
      if (controller) controller.finish();
    }
  };
  const start = () => {
    try {
      const payload = document.getElementById("invitation-data");
      InvitationIntro.play(document.body, payload ? JSON.parse(payload.textContent || "{}") : {});
    } catch {
      InvitationIntro.stop(document.body);
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
</script>`;

  const api = {
    PRESETS,
    normalizeEffect,
    renderMarkup,
    getStyles,
    ensureStyles,
    getStandaloneRuntime,
    play,
    stop
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.InvitationIntro = api;
})(typeof window !== "undefined" ? window : globalThis);
