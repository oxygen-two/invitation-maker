const fs = require("node:fs");
const path = require("node:path");

const ART_DIR = path.resolve(__dirname, "..", "assets", "invitation", "template-art");
const OUTPUT_FILE = path.resolve(__dirname, "..", "assets", "invitation", "template-art.js");
const INDEX_FILE = path.resolve(__dirname, "..", "assets", "invitation", "template-art-index.js");
const ART_URL_BASE = "/assets/invitation/template-art";
const MAX_BYTES = 80 * 1024;

const sourceToTemplates = Object.freeze({
  "silver-afterglow": ["silver-afterglow"],
  "peach-table": ["peach-table"],
  "bloom-portrait": ["bloom-portrait"],
  "romantic-story-cover": ["botanical", "memory-film", "modern-vow", "home-warm"],
  "gallery-notice": ["gallery-notice"],
  "sunny-classroom": ["sunny-classroom"],
  "little-forest": ["little-forest", "baby-garden"],
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

/* The index is what pages load. It carries file names, not image bytes, so a
   studio or a guest's viewer fetches only the one picture it shows instead of
   every template's artwork. The inlined module above is still what a portable
   file gets: a downloaded invitation has to work with no network at all. */
const serializeIndex = (sourceMap) => {
  const lines = Object.keys(sourceMap)
    .sort()
    .map((templateId) => `    ${JSON.stringify(templateId)}: ${JSON.stringify(sourceMap[templateId])}`);

  return `(function exposeTemplateArtIndex(root, factory) {
  const templateArtIndex = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = templateArtIndex;
  }

  root.TemplateArtIndex = templateArtIndex;
})(typeof globalThis === "object" ? globalThis : this, function createTemplateArtIndex() {
  const SOURCES = Object.freeze({
${lines.join(",\n")}
  });
  const BASE = ${JSON.stringify(ART_URL_BASE)};

  /* Root-absolute on purpose: an invitation renders inside an about:srcdoc
     frame whose base URL is the page around it, which is "/studio" in the
     studio and "/i/<id>" for a guest. A relative path would resolve against
     the wrong directory for one of them. */
  const getUrl = (templateId) => (SOURCES[templateId] ? \`\${BASE}/\${SOURCES[templateId]}.webp\` : "");
  const api = { getUrl, templateIds: Object.freeze(Object.keys(SOURCES)) };

  return Object.freeze(api);
});
`;
};

const sourceForTemplate = () => {
  const map = {};
  for (const [basename, templateIds] of Object.entries(sourceToTemplates)) {
    for (const templateId of templateIds) map[templateId] = basename;
  }
  return map;
};

/* The generated pair, as the sources say they should be. Both are pure string
   building over `node:fs` reads — no browser, no network — which is what lets
   CI verify them the way it verifies the error pages. */
const render = () => [
  [OUTPUT_FILE, serialize(readArt())],
  [INDEX_FILE, serializeIndex(sourceForTemplate())]
];

/* --check regenerates in memory and compares, so a decoration that was swapped
   without re-running the generator fails the build instead of shipping a
   template-art.js that disagrees with the .webp files beside it. */
const main = (argv = process.argv.slice(2)) => {
  const check = argv.includes("--check");
  for (const [target, contents] of render()) {
    const name = path.relative(path.resolve(__dirname, ".."), target);
    if (!check) {
      fs.writeFileSync(target, contents);
      continue;
    }
    if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== contents) {
      throw new Error(`Outdated generated file: ${name}. Run \`node scripts/build-template-art.js\`.`);
    }
  }
  console.log(`${check ? "Verified" : "Generated"} ${render().length} template art modules.`);
};

if (require.main === module) main();

module.exports = { INDEX_FILE, OUTPUT_FILE, main, readArt, render, serialize, serializeIndex, sourceForTemplate };
