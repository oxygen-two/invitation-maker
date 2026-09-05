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
      return '<div class="intro-envelope" aria-hidden="true"><span class="intro-envelope-card"></span><span class="intro-envelope-pocket"></span><span class="intro-envelope-flap"></span><span class="intro-envelope-seal"></span></div>';
    }
    if (effect === "card-shrink") {
      return '<div class="intro-card-plane" aria-hidden="true"></div>';
    }
    if (effect === "dawn") {
      return '<div class="intro-dawn" aria-hidden="true"></div>';
    }
    if (effect === "fireworks") {
      const origins = [
        ["14%", "28%", "#f6dda6", "0s"],
        ["39%", "18%", "#e9a7a2", ".1s"],
        ["67%", "31%", "#f6dda6", ".2s"],
        ["86%", "20%", "#e9a7a2", ".3s"],
        ["53%", "50%", "#f6dda6", ".4s"]
      ];
      return `<div class="intro-bursts" aria-hidden="true">${origins.map(([x, y, tone, delay]) => `<div class="intro-burst" style="--origin-x:${x};--origin-y:${y};--tone:${tone};--burst-delay:${delay}">${Array.from({ length: 18 }, (_, index) => `<span style="--angle:${index * 20}deg;--distance:${58 + (index % 4) * 12}px;--spark-delay:${(index % 4) * .035}s"></span>`).join("")}</div>`).join("")}</div>`;
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
.intro-copy{position:relative;z-index:3;width:min(100%,420px);text-align:center;overflow-wrap:anywhere;pointer-events:none}
.intro-copy h1{margin:0;color:var(--deep,#42101f);font-family:var(--font-en,var(--font-ko,serif));font-size:clamp(32px,10vw,58px);font-style:italic;font-weight:500;line-height:1.1;letter-spacing:0}
.intro-subtitle,.intro-date,.intro-host{margin:12px 0 0;color:var(--soft,#65535a);font-size:14px;line-height:1.55}
.intro-date{color:var(--mid,#7a243b);font-weight:700}.intro-host{font-family:var(--font-en,var(--font-ko,serif))}
.intro-skip{position:absolute;z-index:5;top:max(16px,env(safe-area-inset-top));right:max(16px,env(safe-area-inset-right));min-height:40px;padding:0 14px;border:1px solid rgba(42,23,32,.18);border-radius:999px;background:rgba(255,250,242,.86);color:var(--ink,#2a1720);font:700 13px/1 var(--font-ko,"Noto Sans KR",sans-serif);cursor:pointer}
    .intro-envelope,.intro-card-plane,.intro-dawn,.intro-curtain,.intro-petals,.intro-bursts,.intro-spotlight,.intro-photo,.intro-photo-fallback{position:absolute;z-index:1;inset:0;pointer-events:none}
    .intro-envelope{display:grid;place-items:center}.intro-envelope-card,.intro-envelope-pocket,.intro-envelope-flap,.intro-envelope-seal{position:absolute;width:min(78vw,390px);aspect-ratio:1.48/1;left:50%;bottom:13%;border:1px solid rgba(122,36,59,.22);box-shadow:0 20px 58px rgba(45,11,22,.18);transform:translateX(-50%)}.intro-envelope-card{z-index:1;width:min(66vw,330px);bottom:27%;border-radius:2px;background:linear-gradient(145deg,rgba(255,255,255,.98),var(--paper,#fffaf2));animation:intro-envelope-card 3.2s cubic-bezier(.22,1,.36,1) forwards}.intro-envelope-pocket{z-index:3;background:var(--paper,#fffaf2);clip-path:polygon(0 0,50% 49%,100% 0,100% 100%,0 100%)}.intro-envelope-flap{z-index:4;transform:translateX(-50%);transform-origin:50% 0;background:linear-gradient(145deg,var(--paper,#fffaf2),rgba(246,221,166,.84));clip-path:polygon(0 0,100% 0,50% 58%);animation:intro-envelope-flap 3.2s cubic-bezier(.22,1,.36,1) forwards}.intro-envelope-seal{z-index:5;width:42px;aspect-ratio:1;bottom:calc(13% + min(24vw,120px));border-radius:50%;background:var(--gold,#d9ac54);box-shadow:0 4px 14px rgba(45,11,22,.18);animation:intro-envelope-seal 3.2s ease forwards}
    .intro-card-plane{background:linear-gradient(180deg,var(--deep,#42101f),var(--mid,#7a243b));transform-origin:var(--intro-target-origin,center);animation:intro-card-shrink 3s ease forwards}
.intro-dawn{background:radial-gradient(circle at 50% 32%,rgba(255,245,210,.9),transparent 34%),linear-gradient(180deg,#151015,var(--bg,#ead5ce));animation:intro-dawn 2.6s ease forwards}
.intro-curtain{display:grid;grid-template-columns:1fr 1fr}.intro-curtain span{background:linear-gradient(90deg,var(--deep,#42101f),var(--mid,#7a243b));animation:intro-curtain-left 3s ease forwards}.intro-curtain span+span{animation-name:intro-curtain-right}
    .intro-bursts{background:radial-gradient(circle at 50% 48%,rgba(91,45,56,.38),transparent 42%),linear-gradient(160deg,#100d14,#21121c 54%,#0c0d13)}.intro-burst{position:absolute;left:var(--origin-x);top:var(--origin-y);width:5px;height:5px;border-radius:50%;color:var(--tone);background:currentColor;box-shadow:0 0 16px currentColor;animation:intro-burst-glow 1.9s ease var(--burst-delay) forwards}.intro-burst span{position:absolute;left:1px;top:1px;display:block;width:4px;height:4px;border-radius:50%;background:currentColor;box-shadow:0 0 13px currentColor;transform:rotate(var(--angle)) translateY(0);animation:intro-firework 1.8s cubic-bezier(.16,.84,.32,1) calc(var(--burst-delay) + var(--spark-delay)) forwards}.intro-petals span{position:absolute;left:calc(8% + (var(--i) * 6.4%));top:calc(16% + ((var(--i) % 5) * 14%));display:block;width:8px;height:8px;border-radius:70% 0 70% 0;background:#ef9caf;animation:intro-float 3.2s ease forwards}.invitation-intro[data-intro-effect="fireworks"] .intro-copy h1{color:#fffdf9;text-shadow:0 2px 18px rgba(0,0,0,.48)}.invitation-intro[data-intro-effect="fireworks"] .intro-subtitle,.invitation-intro[data-intro-effect="fireworks"] .intro-date,.invitation-intro[data-intro-effect="fireworks"] .intro-host{color:rgba(255,250,242,.88)}.invitation-intro[data-intro-effect="fireworks"] .intro-skip{border-color:rgba(255,250,242,.32);background:rgba(16,13,20,.7);color:#fffdf9}
.intro-spotlight{background:radial-gradient(circle at 50% 45%,rgba(255,250,242,.95),rgba(255,250,242,.42) 24%,rgba(42,23,32,.68) 70%);animation:intro-spotlight 2.8s ease forwards}
.intro-photo,.intro-photo-fallback{display:grid;place-items:center;background:linear-gradient(145deg,var(--bg,#ead5ce),var(--paper,#fffaf2))}.intro-photo img{width:100%;height:100%;object-fit:cover;filter:blur(16px);transform:scale(1.08);animation:intro-photo-focus 3.6s ease forwards}.intro-photo-fallback{background:radial-gradient(circle at 50% 38%,rgba(217,172,84,.35),transparent 30%),linear-gradient(160deg,var(--paper,#fffaf2),var(--bg,#ead5ce))}
    .invitation-intro.is-finishing{pointer-events:none;animation:intro-fade-out .28s ease forwards}.is-intro-active .particle-layer,.is-intro-active .particle-layer span,.is-intro-active .particle-layer span::before{animation-play-state:paused}
    @keyframes intro-card-shrink{0%{transform:translate3d(0,0,0) scale(1);opacity:1}100%{transform:translate3d(var(--intro-target-x,0px),var(--intro-target-y,0px),0) scale(var(--intro-target-scale,.72));opacity:0}}@keyframes intro-envelope-card{0%,32%{transform:translate(-50%,18%);opacity:0}58%{opacity:1}100%{transform:translate(-50%,-34%);opacity:.3}}@keyframes intro-envelope-flap{0%,24%{transform:translateX(-50%) rotateX(0)}100%{transform:translateX(-50%) rotateX(166deg);opacity:.3}}@keyframes intro-envelope-seal{0%,25%{opacity:1;transform:translateX(-50%) scale(1)}52%,100%{opacity:0;transform:translateX(-50%) scale(.35)}}@keyframes intro-burst-glow{0%,18%{opacity:0}28%{opacity:1}100%{opacity:0}}@keyframes intro-firework{0%,12%{opacity:0;transform:rotate(var(--angle)) translateY(0) scale(.3)}24%{opacity:1}80%{opacity:.78}100%{opacity:0;transform:rotate(var(--angle)) translateY(calc(var(--distance) * -1)) scale(.8)}}@keyframes intro-dawn{0%{filter:brightness(.35)}100%{filter:brightness(1.08);opacity:.26}}@keyframes intro-curtain-left{100%{transform:translateX(-104%)}}@keyframes intro-curtain-right{100%{transform:translateX(104%)}}@keyframes intro-float{100%{opacity:0;transform:translateY(-44px) rotate(140deg) scale(1.4)}}@keyframes intro-spotlight{0%{clip-path:circle(12% at 50% 45%)}100%{clip-path:circle(100% at 50% 45%);opacity:.18}}@keyframes intro-photo-focus{100%{filter:blur(0);transform:scale(1)}}@keyframes intro-fade-out{100%{opacity:0}}
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

  const setCardTarget = (host, overlay) => {
    const card = host.querySelector && host.querySelector(".invitation-card");
    const source = overlay && overlay.getBoundingClientRect
      ? overlay.getBoundingClientRect()
      : host.getBoundingClientRect && host.getBoundingClientRect();
    const target = card && card.getBoundingClientRect && card.getBoundingClientRect();
    if (!overlay?.style?.setProperty || !source || !target || !(source.width > 0) || !(target.width > 0)) return false;

    overlay.style.setProperty("--intro-target-scale", String(target.width / source.width));
    overlay.style.setProperty("--intro-target-x", `${target.left - source.left}px`);
    overlay.style.setProperty("--intro-target-y", `${target.top - source.top}px`);
    overlay.style.setProperty("--intro-target-origin", "top left");
    return true;
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
      if (effect === "card-shrink") setCardTarget(host, overlay);

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
  const setCardTarget = (host, overlay) => {
    const card = host.querySelector(".invitation-card");
    const source = overlay.getBoundingClientRect ? overlay.getBoundingClientRect() : host.getBoundingClientRect();
    const target = card && card.getBoundingClientRect && card.getBoundingClientRect();
    if (!overlay.style || !source || !target || !(source.width > 0) || !(target.width > 0)) return false;
    overlay.style.setProperty("--intro-target-scale", String(target.width / source.width));
    overlay.style.setProperty("--intro-target-x", (target.left - source.left) + "px");
    overlay.style.setProperty("--intro-target-y", (target.top - source.top) + "px");
    overlay.style.setProperty("--intro-target-origin", "top left");
    return true;
  };
  const InvitationIntro = {
    play(host, invitation = {}) {
      InvitationIntro.stop(host);
      const effect = normalizeEffect(invitation.introEffect);
      const overlay = host && host.querySelector("[data-intro-overlay]");
      if (!host || effect === "none" || reducedMotion()) {
        if (overlay) overlay.remove();
        return null;
      }
      if (!overlay) {
        host.classList.remove("is-intro-active");
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
      try {
        host.classList.add("is-intro-active");
        if (effect === "card-shrink") setCardTarget(host, overlay);
        overlay.addEventListener("click", finish);
        document.addEventListener("keydown", onKeyDown);
        timerId = window.setTimeout(finish, Math.round(presets[effect].duration * 1000));
        const controller = { finish };
        activeController.set(host, controller);
        return controller;
      } catch {
        finish();
        return null;
      }
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
