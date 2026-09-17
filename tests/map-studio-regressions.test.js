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

test("preview maps live in their own frames, so discarding one cannot throw from a map SDK", () => {
  // NAVER's Marker.setMap(null) threw during a map service switch and aborted
  // updatePreviewMarkup for the rest of the session. Preview maps no longer
  // create SDK objects in the preview document at all.
  const cleanup = body("cleanupPreviewMap");
  assert.doesNotMatch(cleanup, /setMap|clearInstanceListeners/);
  const mount = body("mountPreviewMaps");
  assert.match(mount, /naver-map\.html/);
  assert.match(mount, /google-map\.html/);
  assert.doesNotMatch(app, /loadPreviewNaverMaps/);
});
