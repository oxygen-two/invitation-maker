(function exposeTemplateRenderers(root, factory) {
  const templateRenderers = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = templateRenderers;
  }

  root.TemplateRenderers = templateRenderers;
})(typeof globalThis === "object" ? globalThis : this, function createTemplateRenderers() {
  const STYLE_ID = "invitation-template-family-styles";
  const fallbackFamily = "romantic-story";
  const presetDesigns = Object.freeze({
    botanical: { ornament: "❧" },
    "midnight-cinema": { ornament: "☾", extra: '<span class="invite-hero-stub" aria-hidden="true">ⅡⅡⅠⅡⅡⅠⅡⅠⅡⅡⅠⅠⅡ</span>' },
    modern: { ornament: "◌" },
    "color-pop": { ornament: "✳" },
    royal: { ornament: "✦" },
    "memory-film": { ornament: "" },
    "black-tie": { ornament: "◆" },
    "gallery-notice": { ornament: "▰" },
    "sunny-classroom": { ornament: "☀" },
    "little-forest": { ornament: "❧" },
    wedding: { ornament: "♡" },
    "modern-vow": { ornament: "" },
    "blue-porcelain": { ornament: "古稀" },
    "peony-tribute": { ornament: "❀" },
    "red-silk": { ornament: "還甲" },
    "golden-years": { ornament: "✦" },
    "first-chapter": { ornament: "1" },
    "little-star": { ornament: "✧" }
  });

  const slot = (slots, name) => String(slots?.[name] ?? "");
  const designIdFrom = (slots) => {
    const templateId = slot(slots, "templateId");
    return Object.hasOwn(presetDesigns, templateId) ? templateId : "";
  };
  const art = (slots) => {
    const src = slot(slots, "art");
    const attributes = slot(slots, "artAttributes");
    return src ? `<img class="invite-hero-art" src="${src}" alt="" aria-hidden="true"${attributes ? ` ${attributes}` : ""}>` : "";
  };

  const article = (familyId, slots, content, designId = "") => `
      <article class="invitation-card" ${slot(slots, "articleAttributes")} data-layout-family="${familyId}"${designId ? ` data-design="${designId}"` : ""}>
        ${slot(slots, "particles")}
        ${content}
      </article>
    `;

  const hero = (slots, designId = "") => {
    const design = presetDesigns[designId];
    const ornament = design?.ornament
      ? `<span class="invite-hero-ornament" aria-hidden="true">${design.ornament}</span>`
      : "";
    const image = art(slots);
    const framedImage = image && ["memory-film", "golden-years"].includes(designId)
      ? `<div class="invite-hero-photo-frame">${image}</div>`
      : image;
    const details = design ? `
            <div class="invite-hero-details">
              <span class="invite-hero-date">${slot(slots, "dateLabel")}</span>
              <span class="invite-hero-location">${slot(slots, "location")}</span>
              <span class="invite-hero-host">${slot(slots, "host")}</span>
            </div>` : "";

    return `
        <header class="invite-hero${design ? ` invite-hero--${designId}` : ""}">
          ${framedImage}
          <div class="invite-hero-copy">
            <p class="invite-kicker">${slot(slots, "kicker")}</p>
            ${ornament}
            <h1>${slot(slots, "title")}</h1>
            <p class="invite-subtitle">${slot(slots, "subtitle")}</p>
            ${details}
          </div>
          ${design?.extra || ""}
        </header>
    `;
  };

  const message = (slots) => `
        <section class="invite-section invite-message">
          <p>${slot(slots, "message")}</p>
        </section>
    `;

  const meta = (slots) => `
        <section class="invite-section invite-meta">
          ${slot(slots, "meta")}
        </section>
    `;

  const items = (slots) => `
        <section class="invite-section invite-timeline">
          ${slot(slots, "items")}
        </section>
    `;

  const renderRomanticStory = (slots) => article("romantic-story", slots, `
        ${hero(slots, designIdFrom(slots))}
        ${message(slots)}
        ${meta(slots)}
        ${items(slots)}
        ${slot(slots, "map")}
        ${slot(slots, "mapLink")}
  `, designIdFrom(slots));

  const renderCelebrationPoster = (slots) => article("celebration-poster", slots, `
        ${hero(slots, designIdFrom(slots))}
        ${meta(slots)}
        ${message(slots)}
        ${items(slots)}
        ${slot(slots, "map")}
        ${slot(slots, "mapLink")}
  `, designIdFrom(slots));

  const renderKidsStorybook = (slots) => article("kids-storybook", slots, `
        ${hero(slots, designIdFrom(slots))}
        ${message(slots)}
        ${items(slots)}
        ${meta(slots)}
        ${slot(slots, "map")}
        ${slot(slots, "mapLink")}
  `, designIdFrom(slots));

  const renderWeddingEditorial = (slots) => article("wedding-editorial", slots, `
        ${hero(slots, designIdFrom(slots))}
        ${meta(slots)}
        ${message(slots)}
        ${items(slots)}
        ${slot(slots, "map")}
        ${slot(slots, "mapLink")}
  `, designIdFrom(slots));

  const renderKoreanHeritage = (slots) => article("korean-heritage", slots, `
        ${hero(slots, designIdFrom(slots))}
        ${message(slots)}
        ${meta(slots)}
        ${items(slots)}
        ${slot(slots, "map")}
        ${slot(slots, "mapLink")}
  `, designIdFrom(slots));

  const renderers = Object.freeze({
    "romantic-story": renderRomanticStory,
    "celebration-poster": renderCelebrationPoster,
    "kids-storybook": renderKidsStorybook,
    "wedding-editorial": renderWeddingEditorial,
    "korean-heritage": renderKoreanHeritage
  });

  const getStyles = () => `
    .invitation-card[data-layout-family]{--paper:#fffaf2;--ink:#2a1720;--soft:#65535a;--deep:#42101f;--mid:#7a243b;--gold:#d9ac54;--line:rgba(101,58,65,.16);--white:var(--paper);--ink-soft:var(--soft);--wine-950:var(--deep);--wine-900:var(--deep);--wine-800:var(--mid);--wine-700:var(--mid);--wine-600:var(--gold);--cream-50:var(--paper);--cream-100:#fbf1df;--gold-500:var(--gold);--gold-300:#f6dda6;--rose-100:#f5d9d5;--hero-end:var(--mid);--particle-light:#fff0ba;--particle-accent:var(--mid);--particle-alt:#4f8778;--particle-edge:rgba(66,16,31,.5);--particle-glow:rgba(255,232,157,.72);--family-pad:24px;--family-radius:8px;--family-frame:1px solid var(--line);--family-soft:rgba(255,253,249,.82);color:var(--ink);background:var(--paper)}
    .invitation-card[data-layout-family] .invite-hero{position:relative;isolation:isolate;height:auto;overflow:hidden;overflow-wrap:anywhere}
    .invitation-card[data-layout-family] .invite-hero-art{position:absolute;z-index:0;inset:0;width:100%;height:100%;object-fit:cover;object-position:var(--hero-image-x,50%) var(--hero-image-y,50%);transform:scale(var(--hero-image-scale,1));transform-origin:var(--hero-image-x,50%) var(--hero-image-y,50%);pointer-events:none}
    .invitation-card[data-layout-family] .invite-hero::after{position:absolute;z-index:0;inset:0;background:linear-gradient(180deg,rgba(45,11,22,.08),rgba(45,11,22,.42));content:""}
    .invitation-card[data-layout-family] .invite-hero-copy{position:relative;z-index:1;min-width:0}
    .invitation-card[data-layout-family] .invite-hero h1{word-break:keep-all;overflow-wrap:anywhere}
    .invitation-card[data-layout-family] .invite-hero-ornament{display:block;margin:20px auto;color:currentColor;font-family:var(--font-en,serif);font-size:54px;line-height:1}
    .invitation-card[data-layout-family] .invite-hero-details{display:grid;gap:4px;margin-top:28px;font-size:13px;line-height:1.6}
    .invitation-card[data-layout-family] .invite-hero-date{font-weight:700;letter-spacing:.08em}
    .invitation-card[data-layout-family] .invite-hero-location,.invitation-card[data-layout-family] .invite-hero-host{opacity:.84}
    .invitation-card[data-layout-family] .invite-hero-photo-frame{position:relative;z-index:1;overflow:hidden}
    .invitation-card[data-layout-family] .invite-hero-photo-frame .invite-hero-art{position:relative;inset:auto;height:100%}
    .invitation-card[data-layout-family] .invite-meta div,.invitation-card[data-layout-family] .invite-notice,.invitation-card[data-layout-family] .invite-profile,.invitation-card[data-layout-family] .invite-link-info,.invitation-card[data-layout-family] .invite-link-action{border-radius:var(--family-radius)}
    .invitation-card[data-layout-family] .invite-notice,.invitation-card[data-layout-family] .invite-profile,.invitation-card[data-layout-family] .invite-link-info,.invitation-card[data-layout-family] .invite-link-action{display:block;min-width:0;padding:16px;border:var(--family-frame);background:var(--family-soft);text-decoration:none}
    .invitation-card[data-layout-family] .invite-notice h3,.invitation-card[data-layout-family] .invite-profile h3{margin:0;font-family:var(--font-ko,serif);font-size:18px}
    .invitation-card[data-layout-family] .invite-notice p,.invitation-card[data-layout-family] .invite-profile p,.invitation-card[data-layout-family] .invite-link-info p,.invitation-card[data-layout-family] .invite-link-action p{margin:4px 0 0;color:var(--ink-soft);font-size:14px}
    .invitation-card[data-layout-family] .invite-item-eyebrow,.invitation-card[data-layout-family] .invite-profile-role{margin:0;color:var(--wine-600);font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    .invitation-card[data-layout-family] .invite-link-info strong,.invitation-card[data-layout-family] .invite-link-action strong{display:block;color:var(--ink);font-size:16px}
    .invitation-card[data-layout-family="romantic-story"] .invite-hero{min-height:470px;align-content:end;padding-bottom:58px;text-align:center;background:linear-gradient(180deg,var(--wine-950),var(--wine-700))}
    .invitation-card[data-layout-family="romantic-story"] .invite-hero::after{background:linear-gradient(180deg,rgba(45,11,22,.06) 18%,rgba(45,11,22,.78))}
    .invitation-card[data-layout-family="romantic-story"] .invite-message{padding:34px 30px;font-size:18px;line-height:1.85}
    .invitation-card[data-layout-family="romantic-story"] .invite-timeline{gap:18px}
    .invitation-card[data-layout-family="romantic-story"] .invite-stop{padding-block:4px}
    .invitation-card[data-layout-family="romantic-story"][data-template="memory-film"] .invite-hero::after{background:linear-gradient(180deg,rgba(20,18,22,.16),rgba(20,18,22,.82))}
    .invitation-card[data-layout-family="celebration-poster"] .invite-hero{min-height:310px;align-content:end;text-align:left;background:linear-gradient(145deg,var(--wine-950),var(--wine-700) 58%,var(--gold-500))}
    .invitation-card[data-layout-family="celebration-poster"] .invite-hero::after{background:linear-gradient(90deg,rgba(255,253,249,.9) 0 46%,rgba(255,253,249,.32) 72%,rgba(45,11,22,.16))}
    .invitation-card[data-layout-family="celebration-poster"] .invite-kicker,.invitation-card[data-layout-family="celebration-poster"] .invite-subtitle,.invitation-card[data-layout-family="celebration-poster"] .invite-hero h1{color:var(--wine-950)}
    .invitation-card[data-layout-family="celebration-poster"] .invite-hero h1{font-size:44px;font-style:normal;text-transform:uppercase}
    .invitation-card[data-layout-family="celebration-poster"] .invite-meta{grid-template-columns:1fr;gap:0;padding:0;border-bottom:0;background:var(--wine-950)}
    .invitation-card[data-layout-family="celebration-poster"] .invite-meta div{border-width:0 0 1px;border-radius:0;background:var(--wine-950);color:var(--cream-50)}
    .invitation-card[data-layout-family="celebration-poster"] .invite-meta span,.invitation-card[data-layout-family="celebration-poster"] .invite-meta strong{color:var(--cream-50)}
    .invitation-card[data-layout-family="celebration-poster"] .invite-timeline{gap:10px}
    .invitation-card[data-layout-family="celebration-poster"] .invite-stop,.invitation-card[data-layout-family="celebration-poster"] .invite-notice,.invitation-card[data-layout-family="celebration-poster"] .invite-profile,.invitation-card[data-layout-family="celebration-poster"] .invite-link-info,.invitation-card[data-layout-family="celebration-poster"] .invite-link-action{border:2px solid var(--wine-900);background:var(--white)}
    .invitation-card[data-layout-family="celebration-poster"] .invite-stop{padding:12px}
    .invitation-card[data-layout-family="celebration-poster"][data-template="gallery-notice"] .invite-hero::after{background:linear-gradient(90deg,rgba(248,244,236,.9) 0 40%,rgba(248,244,236,.2) 74%)}
    .invitation-card[data-layout-family="kids-storybook"]{--family-radius:8px;--family-frame:2px dashed rgba(155,61,84,.38);--family-soft:rgba(251,241,223,.72)}
    .invitation-card[data-layout-family="kids-storybook"] .invite-hero{min-height:360px;align-content:center;text-align:left;background:radial-gradient(circle at 20% 22%,var(--gold-300),transparent 24%),linear-gradient(160deg,var(--wine-700),var(--hero-end))}
    .invitation-card[data-layout-family="kids-storybook"] .invite-hero::after{background:linear-gradient(90deg,rgba(255,250,242,.92),rgba(255,250,242,.58) 62%,rgba(255,250,242,.18))}
    .invitation-card[data-layout-family="kids-storybook"] .invite-kicker,.invitation-card[data-layout-family="kids-storybook"] .invite-subtitle,.invitation-card[data-layout-family="kids-storybook"] .invite-hero h1{color:var(--wine-900)}
    .invitation-card[data-layout-family="kids-storybook"] .invite-hero h1{font-style:normal}
    .invitation-card[data-layout-family="kids-storybook"] .invite-meta{grid-template-columns:1fr 1fr}
    .invitation-card[data-layout-family="kids-storybook"] .invite-meta div:first-child{grid-column:1 / -1}
    .invitation-card[data-layout-family="kids-storybook"] .invite-stop{padding:14px;border:var(--family-frame);border-radius:var(--family-radius);background:var(--family-soft)}
    .invitation-card[data-layout-family="kids-storybook"] .invite-notice{font-size:15px;line-height:1.65}
    .invitation-card[data-layout-family="kids-storybook"][data-template="little-forest"] .invite-hero::after{background:linear-gradient(90deg,rgba(255,250,242,.86),rgba(255,250,242,.48) 64%,rgba(255,250,242,.12))}
    .invitation-card[data-layout-family="wedding-editorial"] .invite-hero{min-height:500px;align-content:center;text-align:center;background:linear-gradient(180deg,var(--cream-100),var(--rose-100));color:var(--ink)}
    .invitation-card[data-layout-family="wedding-editorial"] .invite-hero::after{background:linear-gradient(180deg,rgba(255,250,242,.76),rgba(255,250,242,.92))}
    .invitation-card[data-layout-family="wedding-editorial"] .invite-kicker,.invitation-card[data-layout-family="wedding-editorial"] .invite-subtitle,.invitation-card[data-layout-family="wedding-editorial"] .invite-hero h1{color:var(--ink)}
    .invitation-card[data-layout-family="wedding-editorial"] .invite-meta{grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;padding:0;background:var(--line)}
    .invitation-card[data-layout-family="wedding-editorial"] .invite-meta div{border:0;border-radius:0;background:var(--cream-50);text-align:center}
    .invitation-card[data-layout-family="wedding-editorial"] .invite-message{text-align:left}
    .invitation-card[data-layout-family="wedding-editorial"] .invite-profile{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}
    .invitation-card[data-layout-family="wedding-editorial"] .invite-profile .invite-profile-role{grid-column:1 / -1}
    .invitation-card[data-layout-family="wedding-editorial"] .invite-stop{grid-template-columns:1fr;padding:18px 0;border-bottom:1px solid var(--line)}
    .invitation-card[data-layout-family="wedding-editorial"] .invite-stop-number{width:auto;height:auto;place-items:start;border:0;border-radius:0;background:transparent}
    .invitation-card[data-layout-family="wedding-editorial"][data-template="modern-vow"] .invite-hero::after{background:linear-gradient(180deg,rgba(255,255,255,.7),rgba(255,255,255,.95))}
    .invitation-card[data-layout-family="korean-heritage"]{--family-radius:0;--family-frame:1px solid rgba(66,16,31,.24);--family-soft:rgba(255,250,242,.9)}
    .invitation-card[data-layout-family="korean-heritage"] .invite-hero{min-height:400px;text-align:center;background:linear-gradient(180deg,var(--wine-900),var(--wine-950))}
    .invitation-card[data-layout-family="korean-heritage"] .invite-hero::after{background:linear-gradient(90deg,rgba(66,16,31,.78) 0 18px,rgba(255,250,242,.86) 18px,rgba(255,250,242,.62))}
    .invitation-card[data-layout-family="korean-heritage"][data-template="blue-porcelain"] .invite-hero::after{background:linear-gradient(90deg,rgba(11,45,92,.72) 0 18px,rgba(255,255,255,.9) 18px,rgba(255,255,255,.66))}
    .invitation-card[data-layout-family="korean-heritage"] .invite-kicker,.invitation-card[data-layout-family="korean-heritage"] .invite-subtitle,.invitation-card[data-layout-family="korean-heritage"] .invite-hero h1{color:var(--wine-950)}
    .invitation-card[data-layout-family="korean-heritage"] .invite-hero h1{font-family:var(--font-ko,serif);font-style:normal}
    .invitation-card[data-layout-family="korean-heritage"] .invite-meta{gap:8px;padding-inline:30px}
    .invitation-card[data-layout-family="korean-heritage"] .invite-meta div{border-width:1px 0;border-radius:0;background:transparent;text-align:center}
    .invitation-card[data-layout-family="korean-heritage"] .invite-timeline{padding-inline:30px}
    .invitation-card[data-layout-family="korean-heritage"] .invite-stop{padding:14px 0;border-bottom:var(--family-frame)}
    .invitation-card[data-layout-family="korean-heritage"] .invite-stop-number{border-radius:0}
    .invitation-card[data-template="botanical"]{--paper:#fbfbef;--ink:#102018;--soft:#52695b;--deep:#1f3a2c;--mid:#407055;--gold:#b89d50;--line:rgba(64,112,85,.2);--cream-100:#edf1d9;--gold-300:#ead99d;--rose-100:#eef5de;--particle-alt:#ba6674}
    .invitation-card[data-template="midnight-cinema"]{--paper:#fff8ef;--ink:#20161a;--soft:#6b5458;--deep:#171a31;--mid:#555c91;--gold:#d8bd72;--line:rgba(216,189,114,.26);--cream-100:#f6e5d6;--gold-300:#f1d59c;--rose-100:#f8ddd8;--particle-alt:#6b8b7f}
    .invitation-card[data-template="modern"]{--paper:#f2e7da;--ink:#27231f;--soft:#70675e;--deep:#34302d;--mid:#8b7767;--gold:#b17846;--line:rgba(52,48,45,.18);--cream-100:#eadbca;--gold-300:#e3bd8b;--rose-100:#f0e3da;--particle-alt:#4e7a73}
    .invitation-card[data-template="color-pop"]{--paper:#fffdf7;--ink:#161b2f;--soft:#536071;--deep:#123c8d;--mid:#d4312b;--gold:#e7b900;--line:rgba(15,24,52,.2);--cream-100:#e5ef77;--gold-300:#ffe36f;--rose-100:#fff1d2;--particle-alt:#1664d8}
    .invitation-card[data-template="royal"]{--paper:#fff8ef;--ink:#2d1727;--soft:#74596a;--deep:#462b42;--mid:#79566e;--gold:#d6bd7c;--line:rgba(70,43,66,.22);--cream-100:#f2e4dc;--gold-300:#efd9a1;--rose-100:#ead8e2;--particle-alt:#7b8f79}
    .invitation-card[data-template="memory-film"]{--paper:#eee8dc;--ink:#2c2822;--soft:#70685d;--deep:#39332d;--mid:#776c5d;--gold:#ad8950;--line:rgba(57,51,45,.18);--cream-100:#e2d9c8;--gold-300:#dbc798;--rose-100:#efe0d7;--particle-alt:#758b7e}
    .invitation-card[data-template="black-tie"]{--paper:#f8f4ec;--ink:#17191f;--soft:#5f6876;--deep:#08090b;--mid:#353b48;--gold:#c9a45e;--line:rgba(201,164,94,.25);--cream-100:#e7ded0;--gold-300:#f3dda1;--rose-100:#f4ead8;--particle-alt:#70a99a}
    .invitation-card[data-template="gallery-notice"]{--paper:#fbf7ef;--ink:#202020;--soft:#65605a;--deep:#111;--mid:#a4312e;--gold:#b28a45;--line:rgba(17,17,17,.2);--cream-100:#e9dfd1;--gold-300:#dcc386;--rose-100:#efe7dc;--particle-alt:#45413c}
    .invitation-card[data-template="sunny-classroom"]{--paper:#fffbed;--ink:#775132;--soft:#7d6c4e;--deep:#3f6f5a;--mid:#e36f4b;--gold:#e0ad3d;--line:rgba(119,81,50,.18);--cream-100:#fff1bc;--gold-300:#ffd978;--rose-100:#fff2d5;--particle-alt:#63a6c7}
    .invitation-card[data-template="little-forest"]{--paper:#f7f5e5;--ink:#354c39;--soft:#667052;--deep:#284b39;--mid:#66885f;--gold:#bd9e48;--line:rgba(53,76,57,.2);--cream-100:#edf0dc;--gold-300:#e9d47d;--rose-100:#f5e4d1;--particle-alt:#79a5b0}
    .invitation-card[data-template="wedding"]{--paper:#fffaf1;--ink:#33241a;--soft:#705d4c;--deep:#6d4f31;--mid:#9b7551;--gold:#c7a15d;--line:rgba(109,79,49,.2);--cream-100:#f7ead6;--gold-300:#f4dba5;--rose-100:#fff4e6;--particle-alt:#6f8570}
    .invitation-card[data-template="modern-vow"]{--paper:#fffaf1;--ink:#2f291f;--soft:#74695a;--deep:#4a3928;--mid:#9d8058;--gold:#c4a060;--line:rgba(47,41,31,.2);--cream-100:#f4e7d4;--gold-300:#ecd09a;--rose-100:#fff6e8;--particle-alt:#7d927a}
    .invitation-card[data-template="blue-porcelain"]{--paper:#fbfdff;--ink:#17253f;--soft:#586982;--deep:#123a82;--mid:#2363c9;--gold:#b5964c;--line:rgba(18,58,130,.2);--cream-100:#e8f1fb;--gold-300:#e2c987;--rose-100:#edf5ff;--particle-alt:#6e91bd}
    .invitation-card[data-template="peony-tribute"]{--paper:#fff6e9;--ink:#512c35;--soft:#755c4f;--deep:#67161d;--mid:#a93c3f;--gold:#c49a4f;--line:rgba(103,22,29,.2);--cream-100:#f6e9df;--gold-300:#e6c47c;--rose-100:#f7dfcf;--particle-alt:#77815f}
    .invitation-card[data-template="red-silk"]{--paper:#fff6e9;--ink:#321c1c;--soft:#755c4f;--deep:#67161d;--mid:#a93c3f;--gold:#d4af65;--line:rgba(103,22,29,.22);--cream-100:#f2dfc2;--gold-300:#ecd08e;--rose-100:#f7dfcf;--particle-alt:#77815f}
    .invitation-card[data-template="golden-years"]{--paper:#f7f0e3;--ink:#46392a;--soft:#776957;--deep:#5e4a31;--mid:#9b7848;--gold:#c49a4f;--line:rgba(94,74,49,.2);--cream-100:#eadcc5;--gold-300:#e6c47c;--rose-100:#f3e0cf;--particle-alt:#77815f}
    .invitation-card[data-template="first-chapter"]{--paper:#f8efdf;--ink:#775543;--soft:#796958;--deep:#6f4936;--mid:#b97143;--gold:#d3a348;--line:rgba(119,85,67,.2);--cream-100:#f4e9d7;--gold-300:#ecd28a;--rose-100:#fae6d3;--particle-alt:#63a6c7}
    .invitation-card[data-template="little-star"]{--paper:#f7f2e6;--ink:#293957;--soft:#66708a;--deep:#18253f;--mid:#425b86;--gold:#d9bd72;--line:rgba(41,57,87,.22);--cream-100:#e7e8e5;--gold-300:#f6e4b0;--rose-100:#e7dfde;--particle-alt:#7191b4}

    .invitation-card[data-layout-family][data-design="botanical"] .invite-hero{min-height:520px;align-content:center;padding-inline:42px;background:linear-gradient(145deg,#edf1d9,#fbfbef);color:#102018}
    .invitation-card[data-layout-family][data-design="botanical"] .invite-hero::after{background:rgba(251,251,239,.78)}
    .invitation-card[data-layout-family][data-design="botanical"] .invite-hero-ornament{font-size:72px}
    .invitation-card[data-layout-family][data-design="midnight-cinema"] .invite-hero{min-height:500px;align-content:start;padding:42px 34px 68px;text-align:left;background:#242b4b;color:#f1d698}
    .invitation-card[data-layout-family][data-design="midnight-cinema"] .invite-hero::after{background:linear-gradient(100deg,rgba(19,23,48,.93),rgba(36,43,75,.72))}
    .invitation-card[data-layout-family][data-design="midnight-cinema"] .invite-hero-art:not([data-custom-hero-image]){display:none}
    .invitation-card[data-layout-family][data-design="midnight-cinema"] .invite-kicker{padding-bottom:16px;border-bottom:1px solid #9c966f}
    .invitation-card[data-layout-family][data-design="midnight-cinema"] .invite-hero h1{margin-top:74px;font-size:55px;line-height:.98;text-transform:uppercase}
    .invitation-card[data-layout-family][data-design="midnight-cinema"] .invite-hero-ornament{position:absolute;top:72px;right:0;font-size:76px}
    .invitation-card[data-layout-family][data-design="midnight-cinema"] .invite-hero-details{padding-top:16px;border-top:1px dashed #aaacba}
    .invitation-card[data-layout-family][data-design="midnight-cinema"] .invite-hero-stub{position:absolute;z-index:1;bottom:12px;left:34px;font-size:10px;letter-spacing:5px}
    .invitation-card[data-layout-family][data-design="modern"] .invite-hero{min-height:480px;align-content:start;padding:40px;text-align:left;background:#eadbca;color:#27231f}
    .invitation-card[data-layout-family][data-design="modern"] .invite-hero::after{background:rgba(234,219,202,.78)}
    .invitation-card[data-layout-family][data-design="modern"] .invite-hero-ornament{margin:52px 0 8px;font-size:150px;letter-spacing:-20px}
    .invitation-card[data-layout-family][data-design="modern"] .invite-hero-details{padding-top:14px;border-top:1px solid #a3917a}
    .invitation-card[data-layout-family][data-design="color-pop"] .invite-hero{min-height:480px;align-content:start;padding:36px;text-align:left;background:#e5ef77;color:#173daf}
    .invitation-card[data-layout-family][data-design="color-pop"] .invite-hero::after{background:rgba(229,239,119,.78)}
    .invitation-card[data-layout-family][data-design="color-pop"] .invite-hero-art:not([data-custom-hero-image]){display:none}
    .invitation-card[data-layout-family][data-design="color-pop"] .invite-hero h1{max-width:330px;margin-top:52px;font-family:var(--font-en,sans-serif),var(--font-ko,sans-serif),sans-serif;font-size:clamp(42px,12vw,54px);font-weight:900;line-height:.9;letter-spacing:-3px;text-transform:uppercase}
    .invitation-card[data-layout-family][data-design="color-pop"] .invite-hero-ornament{position:absolute;top:235px;right:18px;color:#e36b44;font-size:100px;transform:rotate(16deg)}
    .invitation-card[data-layout-family][data-design="color-pop"] .invite-hero-details{font-family:var(--font-en,sans-serif),var(--font-ko,sans-serif),sans-serif;font-size:15px;font-weight:800}
    .invitation-card[data-layout-family][data-design="royal"] .invite-hero{min-height:520px;align-content:center;background:#462b42;color:#f0dba7}
    .invitation-card[data-layout-family][data-design="royal"] .invite-hero::after{background:radial-gradient(circle,rgba(121,86,110,.15),rgba(29,14,27,.48))}
    .invitation-card[data-layout-family][data-design="royal"] .invite-kicker{padding-block:10px;border-block:1px solid #a18473}
    .invitation-card[data-layout-family][data-design="royal"] .invite-hero-ornament{font-size:78px}
    .invitation-card[data-layout-family][data-design="memory-film"] .invite-hero{min-height:570px;display:flex;flex-direction:column;align-items:flex-start;gap:24px;padding:42px 32px;text-align:left;background:#eee8dc;color:#2c2822}
    .invitation-card[data-layout-family][data-design="memory-film"] .invite-hero::after{background:transparent}
    .invitation-card[data-layout-family][data-design="memory-film"] .invite-hero-photo-frame{width:100%;height:320px;min-height:0;padding:12px 12px 42px;background:#fff;box-shadow:0 8px 18px #0002;transform:rotate(-4deg)}
    .invitation-card[data-layout-family][data-design="memory-film"] .invite-hero-copy{width:100%;padding-top:12px}
    .invitation-card[data-layout-family][data-design="memory-film"] .invite-hero h1{font-size:32px}
    .invitation-card[data-layout-family][data-design="black-tie"] .invite-hero{min-height:540px;align-content:center;background:#202727;color:#e5d7b2}
    .invitation-card[data-layout-family][data-design="black-tie"] .invite-hero::after{inset:30px 40px;border:1px solid #938568;border-radius:48% 48% 0 0;background:rgba(10,14,14,.28)}
    .invitation-card[data-layout-family][data-design="black-tie"] .invite-hero-ornament{font-size:30px}
    .invitation-card[data-layout-family][data-design="gallery-notice"] .invite-hero{min-height:540px;align-content:start;padding:36px;text-align:left;background:#ede9df;color:#202020}
    .invitation-card[data-layout-family][data-design="gallery-notice"] .invite-hero::after{background:linear-gradient(180deg,#ede9df 0 34%,transparent 34% 76%,#ede9df 76%)}
    .invitation-card[data-layout-family][data-design="gallery-notice"] .invite-hero-art{inset:34% 0 auto;height:42%}
    .invitation-card[data-layout-family][data-design="gallery-notice"] .invite-hero h1{font-family:var(--font-en,sans-serif),var(--font-ko,sans-serif),sans-serif;font-size:58px;font-weight:900;line-height:.9;letter-spacing:-3px;text-transform:uppercase}
    .invitation-card[data-layout-family][data-design="gallery-notice"] .invite-hero h1,.invitation-card[data-layout-family][data-design="gallery-notice"] .invite-subtitle{width:fit-content;max-width:100%;padding:4px 12px 4px 0;background:var(--paper);box-shadow:10px 0 0 var(--paper)}
    .invitation-card[data-layout-family][data-design="gallery-notice"] .invite-hero-details{margin-top:250px}
    .invitation-card[data-layout-family][data-design="sunny-classroom"] .invite-hero{min-height:500px;align-content:start;background:#fff1bc;color:#3f6f5a}
    .invitation-card[data-layout-family][data-design="sunny-classroom"] .invite-hero::after{background:linear-gradient(#fff1bc 10%,rgba(255,241,188,.94) 44%,rgba(255,241,188,.08))}
    .invitation-card[data-layout-family][data-design="sunny-classroom"] .invite-hero-art{top:auto;height:55%;object-position:center bottom}
    .invitation-card[data-layout-family][data-design="sunny-classroom"] .invite-hero h1{font-family:var(--font-en,sans-serif),var(--font-ko,sans-serif),sans-serif;font-weight:800}
    .invitation-card[data-layout-family][data-design="sunny-classroom"] .invite-hero-details{display:inline-grid;padding:8px 18px;border-radius:999px;background:rgba(255,251,237,.88)}
    .invitation-card[data-layout-family][data-design="little-forest"] .invite-hero{min-height:520px;align-content:center;background:#edf0dc;color:#354c39}
    .invitation-card[data-layout-family][data-design="little-forest"] .invite-hero::after{background:linear-gradient(rgba(241,244,220,.9),rgba(241,244,220,.3) 52%,rgba(241,244,220,.86))}
    .invitation-card[data-layout-family][data-design="little-forest"] .invite-hero-ornament{width:106px;height:106px;padding:20px;border:1px solid #72885f;border-radius:50%}
    .invitation-card[data-layout-family][data-design="wedding"] .invite-hero{min-height:570px;align-content:center;margin:22px;border:1px solid #aeb89a;background:#fffaf1;color:#33241a}
    .invitation-card[data-layout-family][data-design="wedding"] .invite-hero::after{background:rgba(255,250,241,.88)}
    .invitation-card[data-layout-family][data-design="wedding"] .invite-hero-ornament{font-size:38px}
    .invitation-card[data-layout-family][data-design="modern-vow"] .invite-hero{min-height:620px;align-content:end;padding:52px 32px;text-align:left;color:#fff8ed}
    .invitation-card[data-layout-family][data-design="modern-vow"] .invite-hero::after{background:linear-gradient(rgba(36,25,18,.16),transparent 28%,rgba(33,25,16,.88))}
    .invitation-card[data-layout-family][data-design="modern-vow"] .invite-hero h1{font-size:58px;line-height:1}
    .invitation-card[data-layout-family][data-design="modern-vow"] .invite-hero-details{padding-top:15px;border-top:1px solid #fff8}
    .invitation-card[data-layout-family][data-design="blue-porcelain"] .invite-hero{min-height:550px;align-content:center;margin:22px;border:1px solid #6889a3;background:#f4f4e9;color:#274e78}
    .invitation-card[data-layout-family][data-design="blue-porcelain"] .invite-hero::after{background:rgba(250,248,237,.68)}
    .invitation-card[data-layout-family][data-design="blue-porcelain"] .invite-hero-ornament{font-family:var(--font-ko,serif);font-size:96px;letter-spacing:12px;writing-mode:vertical-rl}
    .invitation-card[data-layout-family][data-design="peony-tribute"] .invite-hero{min-height:560px;align-content:start;padding:46px 36px 190px;text-align:left;background:#f6e9df;color:#6e3442}
    .invitation-card[data-layout-family][data-design="peony-tribute"] .invite-hero::after{background:linear-gradient(#f6e9df 10%,rgba(246,233,223,.74) 56%,rgba(246,233,223,.18))}
    .invitation-card[data-layout-family][data-design="peony-tribute"] .invite-hero-art{top:auto;height:56%}
    .invitation-card[data-layout-family][data-design="peony-tribute"] .invite-hero-ornament{margin-left:0;font-size:64px}
    .invitation-card[data-layout-family][data-design="red-silk"] .invite-hero{min-height:560px;align-content:center;background:#792f32;color:#f5dbab}
    .invitation-card[data-layout-family][data-design="red-silk"] .invite-hero::after{background:repeating-linear-gradient(90deg,rgba(121,47,50,.7) 0 2px,rgba(70,25,28,.64) 2px 4px)}
    .invitation-card[data-layout-family][data-design="red-silk"] .invite-hero-ornament{font-family:var(--font-ko,serif);font-size:112px;writing-mode:vertical-rl}
    .invitation-card[data-layout-family][data-design="golden-years"] .invite-hero{min-height:600px;display:flex;flex-direction:column;align-items:center;padding:38px;background:#f0e9db;color:#5c5038}
    .invitation-card[data-layout-family][data-design="golden-years"] .invite-hero::after{background:transparent}
    .invitation-card[data-layout-family][data-design="golden-years"] .invite-hero-photo-frame{width:74%;height:315px;border:5px solid #dfc48c;border-radius:48% 48% 0 0}
    .invitation-card[data-layout-family][data-design="golden-years"] .invite-hero-copy{padding-top:24px}
    .invitation-card[data-layout-family][data-design="golden-years"] .invite-hero-ornament{display:none}
    .invitation-card[data-layout-family][data-design="first-chapter"] .invite-hero{min-height:550px;align-content:start;padding:42px;text-align:left;background:#f4e9d7;color:#775543}
    .invitation-card[data-layout-family][data-design="first-chapter"] .invite-hero::after{background:linear-gradient(transparent,rgba(244,233,215,.8))}
    .invitation-card[data-layout-family][data-design="first-chapter"] .invite-hero-art{opacity:.28}
    .invitation-card[data-layout-family][data-design="first-chapter"] .invite-hero-ornament{margin:32px 0 0;color:#b97143;font-size:180px}
    .invitation-card[data-layout-family][data-design="first-chapter"] .invite-hero h1{font-size:42px}
    .invitation-card[data-layout-family][data-design="little-star"] .invite-hero{min-height:560px;align-content:center;background:#293957;color:#f6e4b0}
    .invitation-card[data-layout-family][data-design="little-star"] .invite-hero::after{background:radial-gradient(circle at 20% 18%,#fff7 0 1px,transparent 2px),radial-gradient(circle at 78% 32%,#fff9 0 1px,transparent 2px),radial-gradient(circle at 63% 72%,#fff7 0 1px,transparent 2px),rgba(24,37,63,.72);background-size:61px 67px,83px 91px,107px 73px,auto}
    .invitation-card[data-layout-family][data-design="little-star"] .invite-hero-ornament{font-size:112px}
    .invitation-card[data-layout-family][data-design] .invite-kicker,.invitation-card[data-layout-family][data-design] .invite-hero h1,.invitation-card[data-layout-family][data-design] .invite-subtitle,.invitation-card[data-layout-family][data-design] .invite-hero-details{color:inherit}
    @media(max-width:480px){.invitation-card[data-layout-family="wedding-editorial"] .invite-meta,.invitation-card[data-layout-family="kids-storybook"] .invite-meta,.invitation-card[data-layout-family="wedding-editorial"] .invite-profile{grid-template-columns:1fr}.invitation-card[data-layout-family="celebration-poster"] .invite-hero h1{font-size:38px}.invitation-card[data-layout-family][data-design="memory-film"] .invite-hero,.invitation-card[data-layout-family][data-design="golden-years"] .invite-hero{padding-inline:24px}}
  `;

  const ensureStyles = (documentRef) => {
    if (!documentRef?.head || typeof documentRef.createElement !== "function") return null;
    const existing = documentRef.getElementById?.(STYLE_ID);
    if (existing) return existing;

    const style = documentRef.createElement("style");
    style.id = STYLE_ID;
    style.textContent = getStyles();
    documentRef.head.append(style);
    return style;
  };

  const render = (familyId, slots) => (renderers[familyId] || renderers[fallbackFamily])(slots);

  return Object.freeze({
    ensureStyles,
    getStyles,
    render
  });
});
