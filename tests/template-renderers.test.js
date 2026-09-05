const test = require("node:test");
const assert = require("node:assert/strict");
const TemplateRenderers = require("../assets/template-renderers.js");
const InvitationCore = require("../assets/invitation-core.js");

const slots = {
  articleAttributes: 'data-template="sample"',
  particles: "[[PARTICLES]]",
  art: "data:image/webp;base64,AA==",
  kicker: "INVITATION",
  title: "[[TITLE]]",
  subtitle: "[[SUBTITLE]]",
  message: "[[MESSAGE]]",
  meta: "[[META]]",
  items: "[[ITEMS]]",
  map: "[[MAP]]",
  mapLink: "[[MAP_LINK]]"
};
const fullSlotMarkers = ["[[PARTICLES]]", "[[TITLE]]", "[[SUBTITLE]]", "[[MESSAGE]]", "[[META]]", "[[ITEMS]]", "[[MAP]]", "[[MAP_LINK]]"];
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
