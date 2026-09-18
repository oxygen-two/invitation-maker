(function exposeTemplateArtIndex(root, factory) {
  const templateArtIndex = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = templateArtIndex;
  }

  root.TemplateArtIndex = templateArtIndex;
})(typeof globalThis === "object" ? globalThis : this, function createTemplateArtIndex() {
  const SOURCES = Object.freeze({
    "baby-garden": "little-forest",
    "bloom-portrait": "bloom-portrait",
    "blue-porcelain": "blue-porcelain",
    "botanical": "romantic-story-cover",
    "first-chapter": "first-chapter-stars",
    "gallery-notice": "gallery-notice",
    "golden-years": "golden-years",
    "home-warm": "romantic-story-cover",
    "little-forest": "little-forest",
    "little-star": "first-chapter-stars",
    "memory-film": "romantic-story-cover",
    "modern-vow": "romantic-story-cover",
    "peach-table": "peach-table",
    "peony-tribute": "peony-tribute",
    "red-silk": "red-silk",
    "silver-afterglow": "silver-afterglow",
    "sunny-classroom": "sunny-classroom"
  });
  const BASE = "/assets/invitation/template-art";

  /* Root-absolute on purpose: an invitation renders inside an about:srcdoc
     frame whose base URL is the page around it, which is "/studio" in the
     studio and "/i/<id>" for a guest. A relative path would resolve against
     the wrong directory for one of them. */
  const getUrl = (templateId) => (SOURCES[templateId] ? `${BASE}/${SOURCES[templateId]}.webp` : "");
  const api = { getUrl, templateIds: Object.freeze(Object.keys(SOURCES)) };

  return Object.freeze(api);
});
