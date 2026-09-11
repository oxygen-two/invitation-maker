const test = require("node:test");
const assert = require("node:assert/strict");
const TemplateRenderers = require("../assets/invitation/template-renderers.js");
const InvitationCore = require("../assets/invitation/core.js");

const slots = {
  templateId: "sample",
  articleAttributes: 'data-template="sample"',
  particles: "[[PARTICLES]]",
  art: "data:image/webp;base64,AA==",
  kicker: "INVITATION",
  title: "[[TITLE]]",
  subtitle: "[[SUBTITLE]]",
  dateLabel: "[[DATE]]",
  location: "[[LOCATION]]",
  host: "[[HOST]]",
  message: "[[MESSAGE]]",
  meta: "[[META]]",
  items: "[[ITEMS]]",
  map: "[[MAP]]",
  mapLink: "[[MAP_LINK]]"
};
const fullSlotMarkers = ["[[PARTICLES]]", "[[TITLE]]", "[[SUBTITLE]]", "[[MESSAGE]]", "[[META]]", "[[ITEMS]]", "[[MAP]]", "[[MAP_LINK]]"];
const presetIds = [
  "botanical", "midnight-cinema", "modern", "color-pop", "royal", "memory-film",
  "black-tie", "gallery-notice", "sunny-classroom", "little-forest", "wedding", "modern-vow",
  "blue-porcelain", "peony-tribute", "red-silk", "golden-years", "first-chapter", "little-star",
  "cherry-muse", "silver-afterglow", "peach-table", "midnight-toast", "bloom-portrait", "signature-birthday"
];
const birthdayPresets = [
  { id: "cherry-muse", family: "celebration-poster", composition: "invite-cherry-motif" },
  { id: "silver-afterglow", family: "celebration-poster", composition: "invite-hero-photo-strip" },
  { id: "peach-table", family: "romantic-story", composition: "invite-hero-table-inset" },
  { id: "midnight-toast", family: "celebration-poster", composition: "invite-toast-lines" },
  { id: "bloom-portrait", family: "wedding-editorial", composition: "invite-hero-portrait-arch" },
  { id: "signature-birthday", family: "wedding-editorial", composition: "invite-signature-line" }
];
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const count = (html, value) => (html.match(new RegExp(escapeRegExp(value), "g")) || []).length;
const cssRule = (css, selector) => {
  const start = css.indexOf(`${selector}{`);
  assert.notEqual(start, -1, `Missing CSS rule: ${selector}`);
  return css.slice(start, css.indexOf("}", start) + 1);
};

test("renders every family with the complete safe slot set", () => {
  for (const family of ["romantic-story", "celebration-poster", "kids-storybook", "wedding-editorial", "korean-heritage"]) {
    const html = TemplateRenderers.render(family, slots);
    assert.match(html, new RegExp(`data-layout-family="${family}"`));
    for (const marker of fullSlotMarkers) {
      assert.match(html, new RegExp(escapeRegExp(marker)));
    }
  }
});

test("renders each required slot exactly once for every family", () => {
  for (const family of ["romantic-story", "celebration-poster", "kids-storybook", "wedding-editorial", "korean-heritage"]) {
    const html = TemplateRenderers.render(family, slots);

    for (const marker of fullSlotMarkers) {
      assert.equal(count(html, marker), 1, `${family} renders ${marker} once`);
    }
  }
});

test("unknown families fall back to romantic-story", () => {
  assert.match(TemplateRenderers.render("unknown", slots), /data-layout-family="romantic-story"/);
});

test("all 24 canonical presets render a unique trusted hero design", () => {
  const designs = presetIds.map((templateId) => {
    const html = TemplateRenderers.render("romantic-story", { ...slots, templateId });
    const design = html.match(/data-design="([^"]+)"/)?.[1];

    assert.equal(design, templateId, `${templateId} selects its canonical composition`);
    assert.match(html, /class="invite-hero[^" ]*/);
    assert.match(html, /\[\[DATE\]\]/);
    assert.match(html, /\[\[LOCATION\]\]/);
    assert.match(html, /\[\[HOST\]\]/);
    return design;
  });

  assert.equal(new Set(designs).size, 24);
});

test("birthday presets keep their approved families and genuinely distinct hero compositions", () => {
  for (const { id, family, composition } of birthdayPresets) {
    const html = TemplateRenderers.render(family, { ...slots, templateId: id });

    assert.match(html, new RegExp(`data-layout-family="${family}"`));
    assert.match(html, new RegExp(`data-design="${id}"`));
    assert.match(html, new RegExp(`class="[^"]*${composition}`));
    for (const marker of fullSlotMarkers) {
      assert.equal(count(html, marker), 1, `${id} renders ${marker} once`);
    }
  }
});

test("every birthday composition preserves custom hero crop attributes", () => {
  for (const { id, family } of birthdayPresets) {
    const html = TemplateRenderers.render(family, {
      ...slots,
      templateId: id,
      artAttributes: 'data-custom-hero-image style="--hero-image-scale:1.75;--hero-image-x:18%;--hero-image-y:82%"'
    });

    assert.match(html, /<img class="invite-hero-art"[^>]+data-custom-hero-image[^>]+--hero-image-scale:1\.75/);
    assert.equal(count(html, "data-custom-hero-image"), 1, `${id} renders one custom hero image`);
  }
});

test("birthday palettes, growing heroes, and exact hero text colors stay article scoped", () => {
  const css = TemplateRenderers.getStyles().replace(/\s+/g, "");
  const heroColors = {
    "cherry-muse": "#a61f32",
    "silver-afterglow": "#f7f2ff",
    "peach-table": "#5b302d",
    "midnight-toast": "#ead8a6",
    "bloom-portrait": "#f8efe4",
    "signature-birthday": "#651f2b"
  };

  for (const { id } of birthdayPresets) {
    assert.match(css, new RegExp(`\\.invitation-card\\[data-template="${id}"\\]\\{[^}]*--paper:`));
    const heroRule = cssRule(css, `.invitation-card[data-layout-family][data-design="${id}"].invite-hero`);
    assert.match(heroRule, /height:auto/);
    assert.match(heroRule, /min-height:/);
    assert.match(heroRule, new RegExp(`color:${heroColors[id]}`));
  }
});

test("birthday custom photos retain readable copy while typography-only art stays custom-only", () => {
  const css = TemplateRenderers.getStyles().replace(/\s+/g, "");

  for (const { id } of birthdayPresets) {
    const overlay = cssRule(css, `.invitation-card[data-layout-family][data-design="${id}"].invite-hero::after`);
    assert.match(overlay, /background:/, `${id} supplies a custom-photo contrast layer`);
  }
  for (const id of ["cherry-muse", "midnight-toast", "signature-birthday"]) {
    assert.match(css, new RegExp(`data-design="${id}"[^}]+invite-hero-art:not\\(\\[data-custom-hero-image\\]\\)\\{display:none\\}`));
  }
});

test("silver and midnight default titles get a phone-safe measure without disabling long-copy wrapping", () => {
  const css = TemplateRenderers.getStyles().replace(/\s+/g, "");
  const silverCopy = cssRule(css, '.invitation-card[data-layout-family][data-design="silver-afterglow"].invite-hero-copy');
  const silverTitle = cssRule(css, '.invitation-card[data-layout-family][data-design="silver-afterglow"].invite-heroh1');
  const midnightTitle = cssRule(css, '.invitation-card[data-layout-family][data-design="midnight-toast"].invite-heroh1');

  assert.match(silverCopy, /width:100%/);
  assert.match(silverTitle, /font-size:clamp\(40px,11vw,54px\)/);
  assert.match(midnightTitle, /font-size:clamp\(38px,11vw,48px\)/);
  assert.doesNotMatch(`${silverTitle}${midnightTitle}`, /white-space:nowrap/);
});

test("birthday hero details stay readable and long English title words stay intact on phones", () => {
  const css = TemplateRenderers.getStyles().replace(/\s+/g, "");

  for (const { id } of birthdayPresets) {
    const details = cssRule(css, `.invitation-card[data-layout-family][data-design="${id}"].invite-hero-details`);
    assert.match(details, /font-size:15px/, `${id} keeps date, place, and host at 15px`);
  }

  for (const id of ["silver-afterglow", "midnight-toast"]) {
    const title = cssRule(css, `.invitation-card[data-layout-family][data-design="${id}"].invite-heroh1`);
    assert.match(title, /word-break:normal/);
    assert.match(title, /overflow-wrap:normal/);
  }
});

test("birthday information labels and peach and bloom map links use accessible scoped colors", () => {
  const css = TemplateRenderers.getStyles().replace(/\s+/g, "");
  const darkMetaIds = ["cherry-muse", "silver-afterglow", "midnight-toast"];
  const lightMetaIds = ["peach-table", "bloom-portrait", "signature-birthday"];

  for (const id of darkMetaIds) {
    assert.match(css, new RegExp(`data-template="${id}"[^}]+invite-metaspan[^}]+color:var\\(--cream-50\\)`));
  }
  for (const id of lightMetaIds) {
    assert.match(css, new RegExp(`data-template="${id}"[^}]+invite-metaspan[^}]+color:var\\(--deep\\)`));
  }
  for (const id of ["peach-table", "bloom-portrait"]) {
    assert.match(css, new RegExp(`data-template="${id}"[^}]+invite-stop-map-link[^}]+color:var\\(--deep\\)`));
    assert.match(css, new RegExp(`data-template="${id}"[^}]+invite-map\\{[^}]*background:var\\(--deep\\)`));
  }
});

test("bloom and signature use normal title styling only when the rendered title contains Hangul", () => {
  for (const id of ["bloom-portrait", "signature-birthday"]) {
    const family = birthdayPresets.find((preset) => preset.id === id).family;
    const korean = TemplateRenderers.render(family, { ...slots, templateId: id, title: "하린의 생일" });
    const english = TemplateRenderers.render(family, { ...slots, templateId: id, title: "BIRTHDAY PORTRAIT" });

    assert.match(korean, /<h1 data-title-script="ko">하린의 생일<\/h1>/);
    assert.match(english, /<h1>BIRTHDAY PORTRAIT<\/h1>/);
  }

  const css = TemplateRenderers.getStyles().replace(/\s+/g, "");
  for (const id of ["bloom-portrait", "signature-birthday"]) {
    const koreanTitle = cssRule(css, `.invitation-card[data-layout-family][data-design="${id}"].invite-heroh1[data-title-script="ko"]`);
    assert.match(koreanTitle, /font-style:normal/);
  }
});

test("unknown preset IDs retain the generic family hero without trusting the ID as a design marker", () => {
  const html = TemplateRenderers.render("kids-storybook", { ...slots, templateId: 'not-a-preset\" onmouseover="bad' });

  assert.match(html, /data-layout-family="kids-storybook"/);
  assert.doesNotMatch(html, /data-design=/);
  assert.doesNotMatch(html, /onmouseover/);
  assert.doesNotMatch(TemplateRenderers.render("romantic-story", { ...slots, templateId: "__proto__" }), /data-design=/);
});

test("heritage heroes use the approved occasion symbols without inventing people", () => {
  assert.match(TemplateRenderers.render("korean-heritage", { ...slots, templateId: "blue-porcelain" }), />古稀<\/span>/);
  assert.match(TemplateRenderers.render("korean-heritage", { ...slots, templateId: "red-silk" }), />還甲<\/span>/);
});

test("built-in art is rendered only when an art data URL is supplied", () => {
  const withArt = TemplateRenderers.render("celebration-poster", slots);
  const withoutArt = TemplateRenderers.render("celebration-poster", { ...slots, art: "" });

  assert.match(withArt, /<img class="invite-hero-art" src="data:image\/webp;base64,AA==" alt="" aria-hidden="true">/);
  assert.doesNotMatch(withoutArt, /invite-hero-art/);
});

test("custom hero art carries normalized crop variables without changing built-in art markup", () => {
  const custom = TemplateRenderers.render("romantic-story", {
    ...slots,
    artAttributes: 'data-custom-hero-image style="--hero-image-scale:1.5;--hero-image-x:20%;--hero-image-y:80%"'
  });
  const builtIn = TemplateRenderers.render("romantic-story", slots);

  assert.match(custom, /<img class="invite-hero-art"[^>]+data-custom-hero-image[^>]+--hero-image-scale:1\.5/);
  assert.doesNotMatch(builtIn, /data-custom-hero-image|--hero-image-scale/);
});

test("hero art styles preserve cover cropping and apply the custom focal point", () => {
  const css = TemplateRenderers.getStyles().replace(/\s+/g, "");
  const rule = cssRule(css, '.invitation-card[data-layout-family].invite-hero-art');

  assert.match(rule, /object-fit:cover/);
  assert.match(rule, /object-position:var\(--hero-image-x,50%\)var\(--hero-image-y,50%\)/);
  assert.match(rule, /transform:scale\(var\(--hero-image-scale,1\)\)/);
  assert.match(rule, /transform-origin:var\(--hero-image-x,50%\)var\(--hero-image-y,50%\)/);
});

test("canonical hero styles expand for long editable text and scope every preset palette to its article", () => {
  const css = TemplateRenderers.getStyles().replace(/\s+/g, "");
  const heroRule = cssRule(css, ".invitation-card[data-layout-family].invite-hero");

  assert.match(heroRule, /height:auto/);
  assert.match(heroRule, /overflow-wrap:anywhere/);
  for (const templateId of presetIds) {
    assert.match(css, new RegExp(`\\.invitation-card\\[data-template="${templateId}"\\]\\{[^}]*--paper:`));
  }
});

test("memory-film keeps its approved full-width vertical album composition", () => {
  const css = TemplateRenderers.getStyles().replace(/\s+/g, "");
  const heroRule = cssRule(css, '.invitation-card[data-layout-family][data-design="memory-film"].invite-hero');
  const frameRule = cssRule(css, '.invitation-card[data-layout-family][data-design="memory-film"].invite-hero-photo-frame');

  assert.match(heroRule, /flex-direction:column/);
  assert.match(frameRule, /width:100%/);
});

test("mobile styles preserve the canonical portrait heroes and poster art stays custom-only", () => {
  const css = TemplateRenderers.getStyles().replace(/\s+/g, "");

  assert.doesNotMatch(css, /@media\(max-width:480px\)\{\.invitation-card\[data-layout-family\]\.invite-hero\{min-height:330px/);
  assert.match(css, /data-design="midnight-cinema"[^}]+invite-hero-art:not\(\[data-custom-hero-image\]\)\{display:none\}/);
  assert.match(css, /data-design="color-pop"[^}]+invite-hero-art:not\(\[data-custom-hero-image\]\)\{display:none\}/);
});

test("canonical preset rules outrank family-specific overlays and colors", () => {
  const css = TemplateRenderers.getStyles().replace(/\s+/g, "");

  for (const templateId of presetIds) {
    assert.match(css, new RegExp(`\\.invitation-card\\[data-layout-family\\]\\[data-design="${templateId}"\\]`));
  }
  assert.match(css, /\[data-design\]\.invite-kicker,[^{]+\{color:inherit\}/);
  assert.match(cssRule(css, '.invitation-card[data-layout-family][data-design="botanical"].invite-hero'), /color:#102018/);
});

test("poster and storybook typography remain legible at the approved phone width", () => {
  const css = TemplateRenderers.getStyles().replace(/\s+/g, "");
  const heading = cssRule(css, ".invitation-card[data-layout-family].invite-heroh1");
  const posterTitle = cssRule(css, '.invitation-card[data-layout-family][data-design="color-pop"].invite-heroh1');
  const storybookArt = cssRule(css, '.invitation-card[data-layout-family][data-design="first-chapter"].invite-hero-art');

  assert.match(heading, /word-break:keep-all/);
  assert.match(heading, /overflow-wrap:anywhere/);
  assert.match(posterTitle, /font-size:clamp\(/);
  assert.match(storybookArt, /opacity:\.28/);
});

test("color-pop and classroom retain their approved accent copy colors", () => {
  const css = TemplateRenderers.getStyles().replace(/\s+/g, "");

  assert.match(cssRule(css, '.invitation-card[data-layout-family][data-design="color-pop"].invite-hero'), /color:#173daf/);
  assert.match(cssRule(css, '.invitation-card[data-layout-family][data-design="sunny-classroom"].invite-hero'), /color:#3f6f5a/);
});

test("gallery title and subtitle keep an opaque paper field above its artwork", () => {
  const css = TemplateRenderers.getStyles().replace(/\s+/g, "");
  const copyRule = cssRule(css, '.invitation-card[data-layout-family][data-design="gallery-notice"].invite-heroh1,.invitation-card[data-layout-family][data-design="gallery-notice"].invite-subtitle');

  assert.match(copyRule, /background:var\(--paper\)/);
  assert.match(copyRule, /width:fit-content/);
  assert.match(copyRule, /max-width:100%/);
});

test("modern and color-pop tint arbitrary custom photos behind dark copy", () => {
  const css = TemplateRenderers.getStyles().replace(/\s+/g, "");
  const modernOverlay = cssRule(css, '.invitation-card[data-layout-family][data-design="modern"].invite-hero::after');
  const colorPopOverlay = cssRule(css, '.invitation-card[data-layout-family][data-design="color-pop"].invite-hero::after');

  assert.match(modernOverlay, /background:rgba\(234,219,202,\.78\)/);
  assert.match(colorPopOverlay, /background:rgba\(229,239,119,\.78\)/);
});

test("ensureStyles inserts one reusable family style element", () => {
  const appended = [];
  const document = {
    head: { append: (node) => appended.push(node) },
    createElement: () => ({ id: "", textContent: "" }),
    getElementById: () => null
  };
  TemplateRenderers.ensureStyles(document);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].id, "invitation-template-family-styles");
  assert.match(appended[0].textContent, /data-layout-family="korean-heritage"/);
});

test("renderer styles only use standalone-defined variables or explicit fallbacks", () => {
  const standaloneCss = InvitationCore.buildStandaloneHtml().match(/<style>([\s\S]*?)<\/style>/)?.[1] || "";
  const rendererCss = TemplateRenderers.getStyles();
  const definedTokens = new Set([...standaloneCss.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
  const unresolved = [];

  for (const match of rendererCss.matchAll(/var\(\s*(--[\w-]+)([^)]*)\)/g)) {
    const [, token, tail] = match;
    if (!definedTokens.has(token) && !tail.trim().startsWith(",")) {
      unresolved.push(token);
    }
  }

  assert.deepEqual([...new Set(unresolved)].sort(), []);
});
