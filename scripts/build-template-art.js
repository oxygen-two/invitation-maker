const fs = require("node:fs");
const path = require("node:path");

const ART_DIR = path.resolve(__dirname, "..", "assets", "template-art");
const OUTPUT_FILE = path.resolve(__dirname, "..", "assets", "template-art.js");
const MAX_BYTES = 80 * 1024;

const sourceToTemplates = Object.freeze({
  "romantic-story-cover": ["midnight-cinema", "memory-film"],
  "color-pop": ["color-pop"],
  "gallery-notice": ["gallery-notice"],
  "sunny-classroom": ["sunny-classroom"],
  "little-forest": ["little-forest"],
  "wedding-paper": ["modern-vow"],
  "blue-porcelain": ["blue-porcelain"],
  "peony-tribute": ["peony-tribute"],
  "red-silk": ["red-silk"],
  "golden-years": ["golden-years"],
  "first-chapter-stars": ["first-chapter", "little-star"]
});

const readArt = () => {
  const art = {};

  for (const [basename, templateIds] of Object.entries(sourceToTemplates)) {
    const filePath = path.join(ART_DIR, `${basename}.webp`);
    const bytes = fs.readFileSync(filePath);
    if (bytes.byteLength > MAX_BYTES) {
      throw new Error(`${path.relative(process.cwd(), filePath)} exceeds ${MAX_BYTES} bytes`);
    }

    const dataUrl = `data:image/webp;base64,${bytes.toString("base64")}`;
    for (const templateId of templateIds) {
      art[templateId] = dataUrl;
    }
  }

  return art;
};

const serialize = (art) => {
  const lines = Object.keys(art)
    .sort()
    .map((templateId) => `    ${JSON.stringify(templateId)}: ${JSON.stringify(art[templateId])}`);

  return `(function exposeTemplateArt(root, factory) {
  const templateArt = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = templateArt;
  }

  root.TemplateArt = templateArt;
})(typeof globalThis === "object" ? globalThis : this, function createTemplateArt() {
  const ART = Object.freeze({
${lines.join(",\n")}
  });

  const getDataUrl = (templateId) => ART[templateId] || "";
  const api = { getDataUrl, templateIds: Object.freeze(Object.keys(ART)) };

  return Object.freeze(api);
});
`;
};

fs.writeFileSync(OUTPUT_FILE, serialize(readArt()));
