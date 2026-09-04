const test = require("node:test");
const assert = require("node:assert/strict");
const { buildStandaloneHtml, normalizeInvitation } = require("../assets/invitation-core.js");

test("buildStandaloneHtml embeds invitation data without external JSON dependency", () => {
  const html = buildStandaloneHtml({
    templateId: "black-tie",
    title: "서울숲 저녁 초대",
    subtitle: "산책과 와인",
    location: "서울숲",
    mapUrl: "https://map.naver.com/example",
    stops: "18:00|MEET|서울숲역|2번 출구에서 만나요"
  });

  assert.match(html, /<!doctype html>/);
  assert.match(html, /data-template="black-tie"/);
  assert.match(html, /서울숲 저녁 초대/);
  assert.match(html, /서울숲역/);
  assert.match(html, /https:\/\/map\.naver\.com\/example/);
  assert.doesNotMatch(html, /courses\.json/);
});

test("normalizeInvitation parses editable stop lines", () => {
  const invitation = normalizeInvitation({
    stops: "14:00|CAFE|카페|조용한 자리\n16:00|WALK|산책로|천천히 걷기"
  });

  assert.equal(invitation.stops.length, 2);
  assert.deepEqual(invitation.stops[1], {
    time: "16:00",
    label: "WALK",
    place: "산책로",
    note: "천천히 걷기"
  });
});

test("standalone HTML preserves the preview typography", () => {
  const html = buildStandaloneHtml({
    title: "성수에서 보내는 하루",
    subtitle: "카페에서 시작하는 오후",
    message: "함께 오래 기억할 하루를 만들고 싶어요."
  });

  assert.match(html, /fonts\.googleapis\.com\/css2\?family=Cormorant\+Garamond/);
  assert.match(html, /family=Gowun\+Batang/);
  assert.match(html, /family=Noto\+Sans\+KR/);
  assert.match(html, /body\{[^}]*font-family:"Noto Sans KR",sans-serif/);
  assert.match(html, /\.invite-hero h1\{[^}]*font-family:"Cormorant Garamond",serif/);
  assert.match(html, /\.invite-subtitle\{[^}]*font-family:"Gowun Batang",serif/);
});
