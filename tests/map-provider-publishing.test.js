const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeForPublishing } = require("../server/validation.cjs");

test("published invitations keep the author's map service", () => {
  const { invitation } = normalizeForPublishing({ body: { invitation: { title: "Paris", mapProvider: "google", googleMapsApiKey: "AIzaPublicKey" } } });
  assert.equal(invitation.mapProvider, "google");
  assert.equal(invitation.googleMapsApiKey, "AIzaPublicKey");
});

test("publishing without a map service stores NAVER, as every earlier publication was", () => {
  const { invitation } = normalizeForPublishing({ body: { invitation: { title: "서울" } } });
  assert.equal(invitation.mapProvider, "naver");
});

test("publishing rejects a map service the viewer cannot render", () => {
  for (const mapProvider of ["kakao", "", 1]) {
    assert.throws(
      () => normalizeForPublishing({ body: { invitation: { title: "x", mapProvider } } }),
      (error) => error.statusCode === 400 || error.status === 400 || /mapProvider/.test(error.message)
    );
  }
});
