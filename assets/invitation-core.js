(function (root) {
  const defaultInvitation = {
    templateId: "royal",
    title: "우리의 특별한 하루",
    subtitle: "당신을 위해 준비한 초대장",
    dateLabel: "2026.09.12 SAT 14:00",
    host: "From. Rin",
    location: "장소를 입력하세요",
    mapUrl: "https://map.naver.com/",
    message: "함께 걷고, 이야기하고, 오래 기억할 하루를 준비했어요.",
    stops: [
      { time: "14:00", label: "MEET", place: "만남 장소", note: "첫 만남 위치를 적어주세요." },
      { time: "15:00", label: "CAFE", place: "카페", note: "대화하기 좋은 장소를 넣어주세요." },
      { time: "17:00", label: "WALK", place: "산책", note: "날씨에 맞는 동선을 적어주세요." },
      { time: "19:00", label: "DINNER", place: "저녁", note: "예약 정보나 추천 메뉴를 적어주세요." }
    ]
  };

  const escapeHtml = (value = "") =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);

  const normalizeStops = (value) => {
    if (Array.isArray(value)) {
      return value
        .filter((stop) => stop && (stop.time || stop.place || stop.note || stop.label))
        .map((stop) => ({
          time: stop.time || "",
          label: stop.label || "PLACE",
          place: stop.place || "",
          note: stop.note || ""
        }));
    }

    return String(value || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [time = "", label = "PLACE", place = "", note = ""] = line.split("|").map((part) => part.trim());
        return { time, label, place, note };
      });
  };

  const normalizeInvitation = (input = {}) => ({
    ...defaultInvitation,
    ...input,
    stops: normalizeStops(input.stops || defaultInvitation.stops)
  });

  const renderInvitationBody = (input = {}) => {
    const invitation = normalizeInvitation(input);
    const stops = invitation.stops.map((stop, index) => `
      <article class="invite-stop">
        <div class="invite-stop-number">${String(index + 1).padStart(2, "0")}</div>
        <div>
          <p class="invite-stop-time">${escapeHtml(stop.time)} · ${escapeHtml(stop.label)}</p>
          <h3>${escapeHtml(stop.place)}</h3>
          <p>${escapeHtml(stop.note)}</p>
        </div>
      </article>
    `).join("");

    return `
      <article class="invitation-card">
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
          ${stops}
        </section>
        <a class="invite-map" href="${escapeHtml(invitation.mapUrl)}" target="_blank" rel="noopener noreferrer">지도 열기</a>
      </article>
    `;
  };

  const standaloneCss = `
    :root{--bg:#ead5ce;--paper:#fffaf2;--ink:#2a1720;--soft:#65535a;--deep:#42101f;--mid:#7a243b;--gold:#d9ac54;--line:rgba(101,58,65,.16)}
    body[data-template="wedding"]{--bg:#f2e8d8;--paper:#fffaf1;--ink:#33241a;--soft:#705d4c;--deep:#6d4f31;--mid:#9b7551;--gold:#c7a15d}
    body[data-template="black-tie"]{--bg:#d8d3ca;--paper:#f8f4ec;--ink:#17191f;--soft:#5f6876;--deep:#08090b;--mid:#353b48;--gold:#c9a45e}
    body[data-template="botanical"]{--bg:#e4ead8;--paper:#fbfbef;--ink:#102018;--soft:#52695b;--deep:#1f3a2c;--mid:#407055;--gold:#b89d50}
    body[data-template="modern"]{--bg:#efe9e3;--paper:#fffaf5;--ink:#1f1b1a;--soft:#6d625b;--deep:#34302d;--mid:#766b62;--gold:#b17846}
    *{box-sizing:border-box}body{margin:0;padding:28px 14px;background:linear-gradient(145deg,var(--bg),#fff);color:var(--ink);font-family:"Noto Sans KR",sans-serif;line-height:1.7}.invitation-card{max-width:430px;margin:0 auto;overflow:hidden;background:var(--paper);box-shadow:0 26px 80px rgba(45,11,22,.22)}.invite-hero{min-height:420px;display:grid;align-content:center;padding:48px 28px;text-align:center;color:#fff;background:radial-gradient(circle at 50% 30%,rgba(217,172,84,.32),transparent 34%),linear-gradient(180deg,var(--deep),var(--mid))}.invite-kicker{margin:0 0 14px;color:#f6dda6;font-family:"Cormorant Garamond",serif;text-transform:uppercase;letter-spacing:.22em;font-size:12px}.invite-hero h1{margin:0;font-family:"Cormorant Garamond",serif;font-size:39px;line-height:1.15;font-style:italic;font-weight:500}.invite-subtitle{margin:18px 0 0;font-family:"Gowun Batang",serif;font-size:14px;opacity:.86}.invite-section{padding:28px 24px;border-bottom:1px solid var(--line)}.invite-message{font-family:"Gowun Batang",serif;font-size:17px;text-align:center}.invite-meta{display:grid;gap:12px}.invite-meta div{padding:14px;border:1px solid var(--line)}.invite-meta span{display:block;color:var(--gold);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.14em}.invite-meta strong{display:block;margin-top:3px}.invite-timeline{display:grid;gap:14px}.invite-stop{display:grid;grid-template-columns:42px 1fr;gap:12px}.invite-stop-number{display:grid;width:38px;height:38px;place-items:center;border:1px solid var(--gold);border-radius:50%;color:var(--mid);font-family:"Cormorant Garamond",serif;font-weight:700}.invite-stop-time{margin:0 0 3px;color:var(--mid);font-size:12px;font-weight:700;letter-spacing:.08em}.invite-stop h3{margin:0;font-family:"Gowun Batang",serif;font-size:18px}.invite-stop p{margin:4px 0 0;color:var(--soft);font-size:13px}.invite-map{display:flex;min-height:52px;align-items:center;justify-content:center;margin:24px;color:#fff;background:var(--deep);border-radius:8px;text-decoration:none;font-weight:700}@media(max-width:480px){body{padding:0}.invitation-card{box-shadow:none}}
  `;

  const buildStandaloneHtml = (input = {}) => {
    const invitation = normalizeInvitation(input);
    return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#42101f">
  <title>${escapeHtml(invitation.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&amp;family=Gowun+Batang:wght@400;700&amp;family=Noto+Sans+KR:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
  <style>${standaloneCss}</style>
</head>
<body data-template="${escapeHtml(invitation.templateId)}">
${renderInvitationBody(invitation)}
</body>
</html>`;
  };

  const api = {
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
