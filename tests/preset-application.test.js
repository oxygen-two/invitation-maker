const test = require("node:test");
const assert = require("node:assert/strict");
const PresetApplication = require("../assets/preset-application.js");

const preset = {
  id: "modern-vow",
  familyId: "wedding-editorial",
  defaults: {
    title: "Minjun & Seoyeon",
    subtitle: "두 사람이 함께 걷는 첫날",
    items: [{ id: "notice-1", type: "notice", heading: "예식 안내", body: "오후 2시" }]
  }
};

test("prepares a normalized replacement without mutating draft or preset", () => {
  const current = { templateId: "royal", title: "현재 초안", items: [{ id: "course-1", type: "course", place: "성수" }] };
  const originalPreset = JSON.stringify(preset);
  const result = PresetApplication.prepare({ current, preset, naverMapClientId: "public-id" });
  assert.equal(result.previous.title, "현재 초안");
  assert.equal(result.next.templateId, "modern-vow");
  assert.equal(result.next.layoutFamily, "wedding-editorial");
  assert.equal(result.next.naverMapClientId, "public-id");
  assert.equal(JSON.stringify(preset), originalPreset);
});

test("dirty comparison uses canonical normalized invitations", () => {
  const baseline = { title: "초대", particleAmount: 100, items: [] };
  assert.equal(PresetApplication.isDirty({ ...baseline }, baseline), false);
  assert.equal(PresetApplication.isDirty({ ...baseline, title: "수정" }, baseline), true);
});

test("rejects malformed presets before creating a replacement", () => {
  assert.throws(() => PresetApplication.prepare({ current: {}, preset: { id: "broken", defaults: null } }), /invalid preset/);
});
