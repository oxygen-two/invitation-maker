const test = require("node:test");
const assert = require("node:assert/strict");
const { MAX_STOPS, buildStandaloneHtml, normalizeInvitation } = require("../assets/invitation-core.js");

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
    note: "천천히 걷기",
    mapUrl: "",
    mapEnabled: false,
    mapLatitude: null,
    mapLongitude: null,
    mapZoom: 16
  });
});

test("normalizeInvitation preserves independent map settings for each stop", () => {
  const invitation = normalizeInvitation({
    stops: [
      {
        time: "14:00",
        label: "CAFE",
        place: "첫 번째 장소",
        note: "커피",
        mapUrl: "https://map.naver.com/first",
        mapEnabled: true,
        mapLatitude: "37.5446",
        mapLongitude: "127.0559",
        mapZoom: "18"
      },
      {
        time: "16:00",
        label: "WALK",
        place: "두 번째 장소",
        mapEnabled: true,
        mapLatitude: "120",
        mapLongitude: "127.1"
      }
    ]
  });

  assert.equal(invitation.stops[0].mapEnabled, true);
  assert.equal(invitation.stops[0].mapLatitude, 37.5446);
  assert.equal(invitation.stops[0].mapLongitude, 127.0559);
  assert.equal(invitation.stops[0].mapZoom, 18);
  assert.equal(invitation.stops[0].mapUrl, "https://map.naver.com/first");
  assert.equal(invitation.stops[1].mapEnabled, false);
  assert.equal(normalizeInvitation({ stops: [{ label: "MAP", mapUrl: "javascript:alert(1)" }] }).stops.length, 0);
  assert.equal(Object.hasOwn(normalizeInvitation({ clientSecret: "must-not-survive" }), "clientSecret"), false);
});

test("normalizeInvitation preserves supported particle effects and rejects unknown values", () => {
  for (const effect of ["none", "petals", "hearts", "sparkle", "fireflies", "bubbles", "snow", "leaves", "confetti"]) {
    assert.equal(normalizeInvitation({ particleEffect: effect }).particleEffect, effect);
  }

  assert.equal(normalizeInvitation({ particleEffect: "unknown" }).particleEffect, "none");
  assert.equal(normalizeInvitation({}).particleEffect, "none");
});

test("normalizeInvitation preserves supported fonts and rejects unknown font values", () => {
  const invitation = normalizeInvitation({
    englishFont: "great-vibes",
    koreanFont: "gmarket-sans"
  });

  assert.equal(invitation.englishFont, "great-vibes");
  assert.equal(invitation.koreanFont, "gmarket-sans");
  assert.equal(normalizeInvitation({ englishFont: "comic-sans" }).englishFont, "cormorant-garamond");
  assert.equal(normalizeInvitation({ koreanFont: "unknown" }).koreanFont, "gowun-batang");
});

test("normalizeInvitation clamps particle scales and migrates legacy particle sizes", () => {
  const invitation = normalizeInvitation({
    particleScale: "175",
    particleAmount: "150"
  });

  assert.equal(invitation.particleScale, 175);
  assert.equal(invitation.particleAmount, 150);
  assert.equal(normalizeInvitation({ particleScale: 400 }).particleScale, 200);
  assert.equal(normalizeInvitation({ particleAmount: 900 }).particleAmount, 500);
  assert.equal(normalizeInvitation({ particleAmount: 0 }).particleAmount, 25);
  assert.equal(normalizeInvitation({ particleScale: "invalid" }).particleScale, 100);
  assert.equal(normalizeInvitation({ particleAmount: "invalid" }).particleAmount, 100);
  assert.equal(normalizeInvitation({ particleSize: "small" }).particleScale, 70);
  assert.equal(normalizeInvitation({ particleSize: "large" }).particleScale, 145);
});

test("normalizeInvitation validates dynamic map settings", () => {
  const invitation = normalizeInvitation({
    mapEnabled: true,
    mapLatitude: "37.5446",
    mapLongitude: "127.0559",
    mapZoom: "99"
  });

  assert.equal(invitation.mapEnabled, true);
  assert.equal(invitation.mapLatitude, 37.5446);
  assert.equal(invitation.mapLongitude, 127.0559);
  assert.equal(invitation.mapZoom, 21);
  assert.equal(normalizeInvitation({ mapEnabled: true, mapLatitude: 120, mapLongitude: 127 }).mapEnabled, false);
  assert.equal(normalizeInvitation({ mapUrl: "" }).mapUrl, "");
});

test("normalizeInvitation bounds the number of course cards", () => {
  const stops = Array.from({ length: MAX_STOPS + 5 }, (_, index) => ({
    label: `STOP-${index}`,
    place: `장소 ${index}`
  }));

  assert.equal(normalizeInvitation({ stops }).stops.length, MAX_STOPS);
});

test("normalizeInvitation drops course cards with no meaningful content", () => {
  const invitation = normalizeInvitation({
    stops: [
      { label: "PLACE" },
      { time: "", label: "", place: "", note: "", mapUrl: "" },
      { mapEnabled: true },
      { time: "15:00", label: "CAFE", place: "연무장길 카페" }
    ]
  });

  assert.equal(invitation.stops.length, 1);
  assert.equal(invitation.stops[0].place, "연무장길 카페");
});

test("standalone HTML embeds the selected particle effect with reduced motion support", () => {
  const html = buildStandaloneHtml({
    title: "꽃잎이 흐르는 초대",
    particleEffect: "petals",
    particleScale: 175,
    particleAmount: 150
  });

  assert.match(html, /data-particle="petals"/);
  assert.match(html, /data-scale="175"/);
  assert.match(html, /data-amount="150"/);
  assert.match(html, /--particle-scale:1\.75/);
  assert.match(html, /class="particle-layer"/);
  assert.equal((html.match(/<span style="--x:/g) || []).length, 24);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /will-change:transform/);
  assert.doesNotMatch(html, /will-change:top/);
});

test("standalone HTML handles every particle effect and amount scale", () => {
  for (const effect of ["sparkle", "petals", "hearts", "fireflies", "bubbles", "snow", "leaves", "confetti"]) {
    for (const amount of [25, 100, 200, 500]) {
      const html = buildStandaloneHtml({ particleEffect: effect, particleAmount: amount });
      assert.match(html, new RegExp(`data-effect="${effect}"`));
      assert.match(html, new RegExp(`data-amount="${amount}"`));
      assert.equal((html.match(/<span style="--x:/g) || []).length, Math.round(16 * amount / 100));
    }
  }

  assert.doesNotMatch(buildStandaloneHtml({ particleEffect: "none" }), /class="particle-layer"/);
});

test("standalone particle profiles include effect markers and transform-only animations", () => {
  const profileMarkers = {
    sparkle: /box-shadow:0 0 8px 2px rgba\(255,242,188,\.78\)/,
    petals: /border-radius:70% 0 70% 0/,
    hearts: /content:"❤"/,
    fireflies: /particle-pulse var\(--pulse-duration\)/,
    bubbles: /border:1px solid rgba\(255,255,255,\.72\)/,
    snow: /background:rgba\(255,255,255,var\(--tone\)\)/,
    leaves: /border-radius:80% 0 70% 10%/
  };

  for (const [effect, marker] of Object.entries(profileMarkers)) {
    const html = buildStandaloneHtml({ particleEffect: effect });

    assert.match(html, new RegExp(`data-effect="${effect}"`));
    assert.match(html, marker);
  }

  const css = buildStandaloneHtml({ particleEffect: "fireflies" }).match(/<style>([\s\S]*?)<\/style>/)?.[1] || "";
  assert.match(css, /@keyframes particle-fall/);
  assert.match(css, /@keyframes particle-rise/);
  assert.match(css, /@keyframes particle-pulse/);
  const particleKeyframes = css.match(/@keyframes particle-fall[\s\S]*?@media/)?.[0] || "";
  assert.doesNotMatch(particleKeyframes, /(?:top|left|width|height)\s*:/);
});

test("standalone HTML conditionally embeds NAVER Dynamic Map", () => {
  const enabledHtml = buildStandaloneHtml({
    naverMapClientId: "public-client-id",
    clientSecret: "must-not-be-embedded",
    mapEnabled: true,
    mapLatitude: 37.5446,
    mapLongitude: 127.0559,
    mapZoom: 16,
    mapUrl: "https://map.naver.com/example"
  });
  const disabledHtml = buildStandaloneHtml({
    naverMapClientId: "public-client-id",
    mapEnabled: false
  });

  assert.match(enabledHtml, /data-dynamic-map/);
  assert.match(enabledHtml, /data-map-status role="status" aria-live="polite"/);
  assert.match(enabledHtml, /oapi\.map\.naver\.com\/openapi\/v3\/maps\.js\?ncpKeyId=public-client-id/);
  assert.match(enabledHtml, /37\.5446/);
  assert.match(enabledHtml, /127\.0559/);
  assert.match(enabledHtml, /location\.protocol === "file:"/);
  assert.match(enabledHtml, /window\.navermap_authFailure = fail/);
  assert.match(enabledHtml, /script\.onerror = \(\) => finish\(failAll\)/);
  assert.match(enabledHtml, /setTimeout\(\(\) => finish\(failAll\), 10000\)/);
  assert.match(enabledHtml, /https:\/\/map\.naver\.com\/example/);
  assert.match(enabledHtml, /id="invitation-data" type="application\/json"/);
  assert.doesNotMatch(enabledHtml, /must-not-be-embedded|clientSecret/);
  assert.doesNotMatch(disabledHtml, /oapi\.map\.naver\.com/);
});

test("standalone HTML renders multiple course maps with one shared API loader", () => {
  const html = buildStandaloneHtml({
    naverMapClientId: "public-client-id",
    stops: [
      {
        time: "14:00",
        label: "CAFE",
        place: "첫 장소",
        mapUrl: "https://map.naver.com/first",
        mapEnabled: true,
        mapLatitude: 37.5446,
        mapLongitude: 127.0559,
        mapZoom: 17
      },
      {
        time: "17:00",
        label: "WALK",
        place: "두 번째 장소",
        mapUrl: "https://map.naver.com/second",
        mapEnabled: true,
        mapLatitude: 37.548,
        mapLongitude: 127.041,
        mapZoom: 15
      }
    ]
  });

  assert.equal((html.match(/data-dynamic-map data-latitude/g) || []).length, 2);
  assert.equal((html.match(/oapi\.map\.naver\.com\/openapi\/v3\/maps\.js/g) || []).length, 1);
  assert.match(html, /data-latitude="37\.5446"/);
  assert.match(html, /data-latitude="37\.548"/);
  assert.match(html, /https:\/\/map\.naver\.com\/first/);
  assert.match(html, /https:\/\/map\.naver\.com\/second/);
  assert.match(html, /querySelectorAll\("\[data-dynamic-map\]"\)/);
});

test("enabled course maps get a place-search fallback when no map URL is provided", () => {
  const html = buildStandaloneHtml({
    naverMapClientId: "public-client-id",
    stops: [{
      place: "성수연방 카페",
      mapEnabled: true,
      mapLatitude: 37.5446,
      mapLongitude: 127.0559
    }]
  });

  assert.match(html, /https:\/\/map\.naver\.com\/p\/search\/%EC%84%B1%EC%88%98%EC%97%B0%EB%B0%A9%20%EC%B9%B4%ED%8E%98/);
});

test("place names get useful NAVER search links without manual map URLs", () => {
  const html = buildStandaloneHtml({
    location: "성수역 3번 출구",
    mapEnabled: false,
    stops: [{ time: "14:00", label: "MEET", place: "서울숲" }]
  });

  assert.match(html, /https:\/\/map\.naver\.com\/p\/search\/%EC%84%B1%EC%88%98%EC%97%AD%203%EB%B2%88%20%EC%B6%9C%EA%B5%AC/);
  assert.match(html, /https:\/\/map\.naver\.com\/p\/search\/%EC%84%9C%EC%9A%B8%EC%88%B2/);
});

test("every enabled map keeps a fallback even when its label and URL are blank", () => {
  const html = buildStandaloneHtml({
    naverMapClientId: "public-client-id",
    location: "",
    mapUrl: "",
    mapEnabled: true,
    mapLatitude: 37.5446,
    mapLongitude: 127.0559,
    stops: [{
      label: "MAP",
      mapEnabled: true,
      mapLatitude: 37.548,
      mapLongitude: 127.041
    }]
  });

  assert.equal((html.match(/href="https:\/\/map\.naver\.com\/"/g) || []).length, 2);
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
  assert.match(html, /--font-en:'Cormorant Garamond'/);
  assert.match(html, /--font-ko:'Gowun Batang'/);
  assert.match(html, /\.invite-hero h1\{[^}]*font-family:var\(--font-en\),var\(--font-ko\),serif/);
  assert.match(html, /\.invite-subtitle\{[^}]*font-family:var\(--font-ko\),serif/);
  assert.match(html, /overflow-wrap:anywhere/);
});

test("standalone HTML preserves selected English and Korean fonts", () => {
  const html = buildStandaloneHtml({
    title: "A Day in Seongsu",
    englishFont: "great-vibes",
    koreanFont: "gmarket-sans"
  });

  assert.match(html, /--font-en:'Great Vibes'/);
  assert.match(html, /--font-ko:'Gmarket Sans'/);
  assert.match(html, /"englishFont":"great-vibes"/);
  assert.match(html, /"koreanFont":"gmarket-sans"/);
  assert.match(html, /GmarketSansMedium\.woff/);
});
