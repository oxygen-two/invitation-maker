const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "assets", "studio", "app.js"), "utf8");
const body = (name) => {
  const start = app.indexOf(`const ${name} = `);
  assert.notEqual(start, -1, `${name} exists`);
  const next = app.indexOf("\nconst ", start + 1);
  return app.slice(start, next === -1 ? undefined : next);
};

test("the NAVER loader waits for the geocoder submodule before the first lookup", () => {
  // maps.js fires onload before naver.maps.Service exists; resolving there
  // made every first lookup after opening the studio report "unavailable".
  const loader = body("loadNaverMaps");
  assert.match(loader, /submodules=geocoder/);
  assert.match(loader, /typeof window\.naver\.maps\.Service\?\.geocode === "function"/);
  assert.match(loader, /clearTimeout\(geocoderPollId\)/);
});

test("a map SDK error while discarding a preview map cannot freeze the preview", () => {
  // NAVER's Marker.setMap(null) threw during a map service switch and aborted
  // updatePreviewMarkup for the rest of the session.
  const cleanup = body("cleanupPreviewMap");
  assert.match(cleanup, /previewMapInstances\.delete\(canvas\);\s*\/\*[\s\S]*?\*\/\s*try \{/);
  assert.match(cleanup, /catch \{/);
});
