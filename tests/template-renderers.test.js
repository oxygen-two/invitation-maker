const test = require("node:test");
const assert = require("node:assert/strict");
const TemplateRenderers = require("../assets/template-renderers.js");
const InvitationCore = require("../assets/invitation-core.js");

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
  "blue-porcelain", "peony-tribute", "red-silk", "golden-years", "first-chapter", "little-star"
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

test("all 18 canonical presets render a unique trusted hero design", () => {
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

  assert.equal(new Set(designs).size, 18);
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
