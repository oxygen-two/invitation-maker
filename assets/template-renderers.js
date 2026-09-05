(function exposeTemplateRenderers(root, factory) {
  const templateRenderers = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = templateRenderers;
  }

  root.TemplateRenderers = templateRenderers;
})(typeof globalThis === "object" ? globalThis : this, function createTemplateRenderers() {
  const STYLE_ID = "invitation-template-family-styles";
  const fallbackFamily = "romantic-story";

  const slot = (slots, name) => String(slots?.[name] ?? "");

  const article = (familyId, slots, content) => `
      <article class="invitation-card" ${slot(slots, "articleAttributes")} data-layout-family="${familyId}">
        ${slot(slots, "particles")}
        ${content}
      </article>
    `;

  const hero = (slots) => `
        <header class="invite-hero">
          <p class="invite-kicker">${slot(slots, "kicker")}</p>
          <h1>${slot(slots, "title")}</h1>
          <p class="invite-subtitle">${slot(slots, "subtitle")}</p>
        </header>
    `;

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
        ${hero(slots)}
        ${message(slots)}
        ${meta(slots)}
        ${items(slots)}
        ${slot(slots, "map")}
        ${slot(slots, "mapLink")}
  `);

  const renderCelebrationPoster = (slots) => article("celebration-poster", slots, `
        ${hero(slots)}
        ${meta(slots)}
        ${message(slots)}
        ${items(slots)}
        ${slot(slots, "map")}
        ${slot(slots, "mapLink")}
  `);

  const renderKidsStorybook = (slots) => article("kids-storybook", slots, `
        ${hero(slots)}
        ${message(slots)}
        ${items(slots)}
        ${meta(slots)}
        ${slot(slots, "map")}
        ${slot(slots, "mapLink")}
  `);

  const renderWeddingEditorial = (slots) => article("wedding-editorial", slots, `
        ${hero(slots)}
        ${meta(slots)}
        ${message(slots)}
        ${items(slots)}
        ${slot(slots, "map")}
        ${slot(slots, "mapLink")}
  `);

  const renderKoreanHeritage = (slots) => article("korean-heritage", slots, `
        ${hero(slots)}
        ${message(slots)}
        ${meta(slots)}
        ${items(slots)}
        ${slot(slots, "map")}
        ${slot(slots, "mapLink")}
  `);

  const renderers = Object.freeze({
    "romantic-story": renderRomanticStory,
    "celebration-poster": renderCelebrationPoster,
    "kids-storybook": renderKidsStorybook,
    "wedding-editorial": renderWeddingEditorial,
    "korean-heritage": renderKoreanHeritage
  });

  const getStyles = () => `
    .invitation-card[data-layout-family]{--family-pad:24px;--family-radius:8px;--family-frame:1px solid var(--line);--family-soft:rgba(255,253,249,.82)}
    .invitation-card[data-layout-family] .invite-meta div,.invitation-card[data-layout-family] .invite-notice,.invitation-card[data-layout-family] .invite-profile,.invitation-card[data-layout-family] .invite-link-info,.invitation-card[data-layout-family] .invite-link-action{border-radius:var(--family-radius)}
    .invitation-card[data-layout-family] .invite-notice,.invitation-card[data-layout-family] .invite-profile,.invitation-card[data-layout-family] .invite-link-info,.invitation-card[data-layout-family] .invite-link-action{display:block;min-width:0;padding:16px;border:var(--family-frame);background:var(--family-soft);text-decoration:none}
    .invitation-card[data-layout-family] .invite-notice h3,.invitation-card[data-layout-family] .invite-profile h3{margin:0;font-family:var(--font-ko),serif;font-size:18px}
    .invitation-card[data-layout-family] .invite-notice p,.invitation-card[data-layout-family] .invite-profile p,.invitation-card[data-layout-family] .invite-link-info p,.invitation-card[data-layout-family] .invite-link-action p{margin:4px 0 0;color:var(--ink-soft);font-size:14px}
    .invitation-card[data-layout-family] .invite-item-eyebrow,.invitation-card[data-layout-family] .invite-profile-role{margin:0;color:var(--wine-600);font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    .invitation-card[data-layout-family] .invite-link-info strong,.invitation-card[data-layout-family] .invite-link-action strong{display:block;color:var(--ink);font-size:16px}
    .invitation-card[data-layout-family="romantic-story"] .invite-hero{text-align:center}
    .invitation-card[data-layout-family="romantic-story"] .invite-message{padding:34px 30px}
    .invitation-card[data-layout-family="romantic-story"] .invite-timeline{gap:16px}
    .invitation-card[data-layout-family="celebration-poster"] .invite-hero{min-height:360px;align-content:end;text-align:left;background:linear-gradient(145deg,var(--wine-950),var(--wine-700) 58%,var(--gold-500))}
    .invitation-card[data-layout-family="celebration-poster"] .invite-hero h1{font-size:44px;font-style:normal;text-transform:uppercase}
    .invitation-card[data-layout-family="celebration-poster"] .invite-meta{grid-template-columns:1fr;gap:0;padding:0;border-bottom:0}
    .invitation-card[data-layout-family="celebration-poster"] .invite-meta div{border-width:0 0 1px;border-radius:0;background:var(--cream-100)}
    .invitation-card[data-layout-family="celebration-poster"] .invite-timeline{gap:10px}
    .invitation-card[data-layout-family="celebration-poster"] .invite-stop,.invitation-card[data-layout-family="celebration-poster"] .invite-notice,.invitation-card[data-layout-family="celebration-poster"] .invite-profile,.invitation-card[data-layout-family="celebration-poster"] .invite-link-info,.invitation-card[data-layout-family="celebration-poster"] .invite-link-action{border:2px solid var(--wine-900);background:var(--white)}
    .invitation-card[data-layout-family="kids-storybook"]{--family-radius:8px;--family-frame:2px dashed rgba(155,61,84,.38);--family-soft:rgba(251,241,223,.72)}
    .invitation-card[data-layout-family="kids-storybook"] .invite-hero{min-height:380px;align-content:center;text-align:left;background:radial-gradient(circle at 20% 22%,var(--gold-300),transparent 24%),linear-gradient(160deg,var(--wine-700),var(--hero-end))}
    .invitation-card[data-layout-family="kids-storybook"] .invite-hero h1{font-style:normal}
    .invitation-card[data-layout-family="kids-storybook"] .invite-meta{grid-template-columns:1fr 1fr}
    .invitation-card[data-layout-family="kids-storybook"] .invite-meta div:first-child{grid-column:1 / -1}
    .invitation-card[data-layout-family="kids-storybook"] .invite-stop{padding:14px;border:var(--family-frame);border-radius:var(--family-radius);background:var(--family-soft)}
    .invitation-card[data-layout-family="wedding-editorial"] .invite-hero{min-height:500px;align-content:end;text-align:center;background:linear-gradient(180deg,var(--cream-100),var(--rose-100));color:var(--ink)}
    .invitation-card[data-layout-family="wedding-editorial"] .invite-kicker,.invitation-card[data-layout-family="wedding-editorial"] .invite-subtitle,.invitation-card[data-layout-family="wedding-editorial"] .invite-hero h1{color:var(--ink)}
    .invitation-card[data-layout-family="wedding-editorial"] .invite-meta{grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;padding:0;background:var(--line)}
    .invitation-card[data-layout-family="wedding-editorial"] .invite-meta div{border:0;border-radius:0;background:var(--cream-50);text-align:center}
    .invitation-card[data-layout-family="wedding-editorial"] .invite-message{text-align:left}
    .invitation-card[data-layout-family="wedding-editorial"] .invite-stop{grid-template-columns:1fr;padding:18px 0;border-bottom:1px solid var(--line)}
    .invitation-card[data-layout-family="wedding-editorial"] .invite-stop-number{width:auto;height:auto;place-items:start;border:0;border-radius:0;background:transparent}
    .invitation-card[data-layout-family="korean-heritage"]{--family-radius:0;--family-frame:1px solid rgba(66,16,31,.24);--family-soft:rgba(255,250,242,.9)}
    .invitation-card[data-layout-family="korean-heritage"] .invite-hero{min-height:400px;text-align:center;background:linear-gradient(180deg,var(--wine-900),var(--wine-950))}
    .invitation-card[data-layout-family="korean-heritage"] .invite-meta{gap:8px;padding-inline:30px}
    .invitation-card[data-layout-family="korean-heritage"] .invite-meta div{border-width:1px 0;border-radius:0;background:transparent;text-align:center}
    .invitation-card[data-layout-family="korean-heritage"] .invite-timeline{padding-inline:30px}
    .invitation-card[data-layout-family="korean-heritage"] .invite-stop{padding:14px 0;border-bottom:var(--family-frame)}
    .invitation-card[data-layout-family="korean-heritage"] .invite-stop-number{border-radius:0}
    @media(max-width:480px){.invitation-card[data-layout-family="wedding-editorial"] .invite-meta,.invitation-card[data-layout-family="kids-storybook"] .invite-meta{grid-template-columns:1fr}.invitation-card[data-layout-family="celebration-poster"] .invite-hero h1{font-size:38px}}
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
