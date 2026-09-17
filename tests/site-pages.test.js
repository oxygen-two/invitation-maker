const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { staticFileFor } = require("../server/http/static.cjs");

test("clean URLs resolve to the right static files on the local server", () => {
  assert.equal(staticFileFor(root, "/"), path.join(root, "index.html"));
  assert.equal(staticFileFor(root, "/welcome"), path.join(root, "index.html"));
  assert.equal(staticFileFor(root, "/studio"), path.join(root, "studio.html"));
  assert.equal(staticFileFor(root, "/guide"), path.join(root, "guide.html"));
  assert.equal(staticFileFor(root, "/sample"), path.join(root, "sample.html"));
});

test("vercel routes the clean URLs before the filesystem handler", () => {
  const { routes } = JSON.parse(read("vercel.json"));
  const filesystemIndex = routes.findIndex((route) => route.handle === "filesystem");
  const expected = {
    "/studio": "/studio.html",
    "/welcome": "/index.html",
    "/guide": "/guide.html",
    "/sample": "/sample.html"
  };
  for (const [src, dest] of Object.entries(expected)) {
    const index = routes.findIndex((route) => route.src === src && route.dest === dest);
    assert.ok(index >= 0, `${src} → ${dest} route missing`);
    assert.ok(index < filesystemIndex, `${src} route must precede handle: filesystem`);
  }
});

test("the studio lives at studio.html and no longer carries the root's search-console tags", () => {
  const studio = read("studio.html");
  assert.match(studio, /<link rel="canonical" href="https:\/\/invitation-maker-one\.vercel\.app\/studio">/);
  assert.doesNotMatch(studio, /google-site-verification/);
  assert.doesNotMatch(studio, /naver-site-verification/);
  assert.match(studio, /<a href="\/studio">Invitation Studio/);
});

test("the studio records that this browser has used it", () => {
  const app = read("assets/studio/app.js");
  assert.match(app, /localStorage\.setItem\("invitation-studio:visited"/);
});
