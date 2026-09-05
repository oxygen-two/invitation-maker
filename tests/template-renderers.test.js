const test = require("node:test");
const assert = require("node:assert/strict");
const TemplateRenderers = require("../assets/template-renderers.js");
const InvitationCore = require("../assets/invitation-core.js");

const slots = {
  articleAttributes: 'data-template="sample"',
  particles: "PARTICLES",
  kicker: "INVITATION",
  title: "TITLE",
  subtitle: "SUBTITLE",
  message: "MESSAGE",
  meta: "META",
  items: "ITEMS",
  map: "MAP",
  mapLink: "MAP_LINK"
};

test("renders every family with the complete safe slot set", () => {
  for (const family of ["romantic-story", "celebration-poster", "kids-storybook", "wedding-editorial", "korean-heritage"]) {
    const html = TemplateRenderers.render(family, slots);
    assert.match(html, new RegExp(`data-layout-family="${family}"`));
    for (const marker of ["PARTICLES", "TITLE", "MESSAGE", "META", "ITEMS", "MAP", "MAP_LINK"]) {
      assert.match(html, new RegExp(marker));
    }
  }
});

test("unknown families fall back to romantic-story", () => {
  assert.match(TemplateRenderers.render("unknown", slots), /data-layout-family="romantic-story"/);
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
