const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { MAX_ITEMS, MAX_PHOTOS, MAX_STOPS, buildStandaloneHtml, getInvitationStyle, normalizeInvitation } = require("../assets/invitation-core.js");
const InvitationIntro = require("../assets/intro-effects.js");
const InvitationCore = require("../assets/invitation-core.js");
const TemplateCatalog = require("../assets/template-catalog.js");
const TemplateArt = require("../assets/template-art.js");

const root = path.resolve(__dirname, "..");
const SAFE_JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const SAFE_PNG = "data:image/png;base64,iVBORw0KGgo=";
const SAFE_WEBP = "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/vuUAAA=";
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const invitationDataFrom = (html) => {
  const match = html.match(/<script id="invitation-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match);
  return JSON.parse(match[1]);
};
const invitationCardOpeningTagFrom = (html) => {
  const match = html.match(/<article class="invitation-card"[^>]*>/);
  assert.ok(match);
  return match[0];
};
const cssRule = (css, selector) => {
  const start = css.indexOf(`${selector}{`);
  assert.notEqual(start, -1, `Missing CSS rule: ${selector}`);
  return css.slice(start, css.indexOf("}", start) + 1);
};
const loadCoreWithoutIntro = () => {
  const module = { exports: {} };
  const missingIntro = (request) => {
    const error = new Error(`Cannot find module '${request}'`);
    error.code = "MODULE_NOT_FOUND";
    throw error;
  };

  vm.runInNewContext(read("assets/invitation-core.js"), {
    globalThis: {},
    module,
    require: missingIntro
  }, { filename: "assets/invitation-core.js" });

  return module.exports;
};

test("normalizeInvitation allowlists intro effects", () => {
  assert.equal(normalizeInvitation({ introEffect: "curtain" }).introEffect, "curtain");
  assert.equal(normalizeInvitation({ introEffect: "script" }).introEffect, "none");
});

test("InvitationCore fails open when the intro dependency is unavailable", () => {
  const unavailableCore = loadCoreWithoutIntro();
  const invitation = unavailableCore.normalizeInvitation({ introEffect: "curtain", title: "Fallback invite" });
  const html = unavailableCore.buildStandaloneHtml({ introEffect: "curtain", title: "Fallback invite" });

  assert.equal(invitation.introEffect, "none");
  assert.equal(invitationDataFrom(html).introEffect, "none");
  assert.match(html, /Fallback invite/);
  assert.doesNotMatch(html, /data-intro-overlay|data-intro-runtime|invitation-intro/);
});

test("active standalone intro is self-contained and canonical", () => {
  const html = buildStandaloneHtml({ introEffect: "envelope", title: "Invite" });

  assert.match(html, /data-intro-effect="envelope"/);
  assert.match(html, /data-intro-runtime/);
  assert.equal(invitationDataFrom(html).introEffect, "envelope");
});

test("standalone intro inherits the selected template palette and fonts from its body host", () => {
  const html = buildStandaloneHtml({
    introEffect: "dawn",
    templateId: "botanical",
    englishFont: "great-vibes",
    koreanFont: "gmarket-sans"
  });

  assert.equal(getInvitationStyle({ englishFont: "great-vibes", koreanFont: "gmarket-sans" }), "--font-en:'Great Vibes';--font-ko:'Gmarket Sans'");
  assert.match(html, /<body[^>]*data-template="botanical"[^>]*style="--font-en:'Great Vibes';--font-ko:'Gmarket Sans'"/);
  assert.match(html, /var\(--paper,var\(--cream-50,#fffaf2\)\)/);
  assert.match(html, /var\(--deep,var\(--wine-900,#42101f\)\)/);
  assert.match(html, /var\(--font-en,var\(--font-ko,serif\)\)/);
});

test("none omits standalone intro markup styles and runtime", () => {
  const html = buildStandaloneHtml({ introEffect: "none" });

  assert.doesNotMatch(html, /data-intro-overlay|data-intro-runtime|invitation-intro/);
});

test("every intro preset exports its canonical overlay", () => {
  for (const effect of Object.keys(InvitationIntro.PRESETS)) {
    const html = buildStandaloneHtml({ introEffect: effect });

    assert.match(html, new RegExp(`data-intro-effect="${effect}"`));
    assert.equal(invitationDataFrom(html).introEffect, effect);
  }
});

test("photo-focus standalone export reuses a safe photo and falls back without one", () => {
  const withPhoto = buildStandaloneHtml({
    introEffect: "photo-focus",
    items: [{ id: "intro-photo", type: "photo", src: SAFE_WEBP, alt: "Focus photo" }]
  });
  const withoutPhoto = buildStandaloneHtml({ introEffect: "photo-focus" });

  assert.match(withPhoto, /data-intro-photo/);
  assert.match(withPhoto, new RegExp(SAFE_WEBP));
  assert.doesNotMatch(withPhoto, /data-photo-fallback/);
  assert.match(withoutPhoto, /data-photo-fallback/);
  assert.doesNotMatch(withoutPhoto, /data-intro-photo/);
});

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

test("preview body and standalone HTML resolve the same layout family", () => {
  for (const layoutFamily of TemplateCatalog.FAMILY_IDS) {
    const input = {
      layoutFamily,
      title: layoutFamily,
      items: [{ id: "notice", type: "notice", heading: "안내", body: "내용" }]
    };
    assert.match(invitationCardOpeningTagFrom(InvitationCore.renderInvitationBody(input)), new RegExp(`data-layout-family="${layoutFamily}"`));
    assert.match(invitationCardOpeningTagFrom(InvitationCore.buildStandaloneHtml(input)), new RegExp(`data-layout-family="${layoutFamily}"`));
  }
});

test("standalone HTML embeds only the selected template art data URL", () => {
  const colorPopArt = TemplateArt.getDataUrl("color-pop");
  const bluePorcelainArt = TemplateArt.getDataUrl("blue-porcelain");
  const html = buildStandaloneHtml({ templateId: "color-pop" });

  assert.notEqual(colorPopArt, "");
  assert.notEqual(bluePorcelainArt, "");
  assert.match(html, new RegExp(colorPopArt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(html, new RegExp(bluePorcelainArt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("normalizes a safe hero image independently from ordered content photos", () => {
  const invitation = normalizeInvitation({
    heroImage: {
      src: SAFE_WEBP,
      scale: 178,
      positionX: -4,
      positionY: 81.239
    },
    items: Array.from({ length: MAX_PHOTOS + 1 }, (_, index) => ({
      id: `photo-${index}`,
      type: "photo",
      src: SAFE_PNG
    }))
  });

  assert.deepEqual(invitation.heroImage, {
    src: SAFE_WEBP,
    scale: 180,
    positionX: 0,
    positionY: 81.24
  });
  assert.equal(invitation.items.filter((item) => item.type === "photo").length, MAX_PHOTOS);
});

test("rejects unsafe hero images and keeps legacy invitations on template art", () => {
  const unsafe = normalizeInvitation({
    templateId: "color-pop",
    heroImage: {
      src: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      scale: 200,
      positionX: 10,
      positionY: 90
    }
  });
  const legacy = normalizeInvitation({ templateId: "color-pop" });

  assert.equal(unsafe.heroImage, null);
  assert.equal(legacy.heroImage, null);
  assert.match(InvitationCore.renderInvitationBody(legacy), new RegExp(TemplateArt.getDataUrl("color-pop").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("custom hero image replaces template art in preview and standalone output", () => {
  const input = {
    templateId: "color-pop",
    heroImage: {
      src: SAFE_WEBP,
      scale: 175,
      positionX: 24.5,
      positionY: 72.25
    }
  };
  const templateArt = TemplateArt.getDataUrl("color-pop");
  const preview = InvitationCore.renderInvitationBody(input);
  const standalone = buildStandaloneHtml(input);
  const exported = invitationDataFrom(standalone);

  for (const html of [preview, standalone]) {
    assert.match(html, new RegExp(SAFE_WEBP.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(html, new RegExp(templateArt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(html, /data-custom-hero-image/);
    assert.match(html, /--hero-image-scale:1\.75/);
    assert.match(html, /--hero-image-x:24\.5%/);
    assert.match(html, /--hero-image-y:72\.25%/);
  }
  assert.deepEqual(exported.heroImage, input.heroImage);
});

test("every production preset normalizes and renders through the canonical output paths", () => {
  const data = JSON.parse(read("invitation-data.json"));
  const catalog = TemplateCatalog.normalizeCatalog(data);

  for (const preset of catalog.templates) {
    const invitation = normalizeInvitation({
      ...preset.defaults,
      templateId: preset.id,
      layoutFamily: preset.familyId
    });

    assert.equal(invitation.templateId, preset.id);
    assert.equal(invitation.layoutFamily, preset.familyId);
    assert.ok(invitation.title.trim(), `${preset.id} has a title`);
    assert.ok(invitation.message.trim(), `${preset.id} has a message`);
    assert.ok(invitation.items.length > 0, `${preset.id} has ordered content`);
    assert.match(InvitationCore.renderInvitationBody(invitation), new RegExp(`data-template="${preset.id}"`));
    assert.match(InvitationCore.buildStandaloneHtml(invitation), /<script id="invitation-data" type="application\/json">/);
  }
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

test("normalizeInvitation preserves ordered course and photo items", () => {
  const invitation = normalizeInvitation({
    items: [
      { id: "course-1", type: "course", time: "14:00", place: "서울숲" },
      { id: "photo-1", type: "photo", src: SAFE_WEBP, alt: "산책 사진", caption: "첫 산책" },
      { id: "course-2", type: "course", time: "16:00", place: "성수 카페" }
    ]
  });

  assert.deepEqual(invitation.items.map(({ id, type }) => ({ id, type })), [
    { id: "course-1", type: "course" },
    { id: "photo-1", type: "photo" },
    { id: "course-2", type: "course" }
  ]);
  assert.equal(invitation.items[1].src, SAFE_WEBP);
  assert.equal(invitation.items[1].alt, "산책 사진");
  assert.equal(invitation.items[1].caption, "첫 산책");
});

test("normalizes all five ordered item types and preserves their order", () => {
  const invitation = normalizeInvitation({
    templateId: "wedding",
    items: [
      { id: "profile-1", type: "profile", name: "김민준", role: "신랑", description: "서로의 평생 친구" },
      { id: "notice-1", type: "notice", heading: "주차 안내", body: "지하 2층을 이용해주세요." },
      { id: "course-1", type: "course", time: "14:00", place: "그랜드홀" },
      { id: "link-1", type: "link", label: "참석 여부", value: "9월 30일까지", url: "https://example.com/rsvp" },
      { id: "photo-1", type: "photo", src: SAFE_WEBP, alt: "두 사람" }
    ]
  });

  assert.equal(invitation.layoutFamily, "wedding-editorial");
  assert.deepEqual(invitation.items.map(({ type }) => type), ["profile", "notice", "course", "link", "photo"]);
});

test("rejects executable item links and keeps safe contact schemes", () => {
  const invitation = normalizeInvitation({ items: [
    { id: "bad", type: "link", label: "Bad", url: "javascript:alert(1)" },
    { id: "tel", type: "link", label: "전화", url: "tel:01012345678" },
    { id: "sms", type: "link", label: "문자", url: "sms:01012345678" }
  ] });

  assert.equal(invitation.items[0].url, "");
  assert.equal(invitation.items[1].url, "tel:01012345678");
  assert.equal(invitation.items[2].url, "sms:01012345678");
});

test("renders new item text escaped and unsafe links as non-clickable information", () => {
  const html = buildStandaloneHtml({ items: [
    { id: "notice", type: "notice", heading: "<img src=x>", body: "준비물" },
    { id: "profile", type: "profile", name: "하린", role: "주인공", description: "첫 생일" },
    { id: "link", type: "link", label: "회신", value: "문의", url: "javascript:alert(1)" }
  ] });

  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /invite-profile/);
  assert.match(html, /invite-link-info/);
  assert.doesNotMatch(html, /href="javascript:/);
});

test("normalizeInvitation migrates legacy stops to course items only when items are absent", () => {
  const legacy = normalizeInvitation({ stops: [{ place: "성수역" }] });
  const canonical = normalizeInvitation({
    items: [{ id: "course-1", type: "course", place: "서울숲" }],
    stops: [{ place: "성수역" }]
  });

  assert.equal(legacy.items[0].type, "course");
  assert.equal(legacy.items[0].place, "성수역");
  assert.deepEqual(canonical.items.map(({ id, place }) => ({ id, place })), [
    { id: "course-1", place: "서울숲" }
  ]);
});

test("normalizeInvitation keeps ordered item IDs unique and drops unknown or unsafe variants", () => {
  const invitation = normalizeInvitation({
    items: [
      { id: "same-id", type: "course", place: "서울숲" },
      { id: "same-id", type: "photo", src: SAFE_WEBP, alt: "중복 ID 사진" },
      { type: "course", place: "성수 카페" },
      { id: "unsafe-photo", type: "photo", src: "https://example.com/photo.webp" },
      { id: "unknown", type: "video", src: SAFE_WEBP },
      { id: "empty-course", type: "course", label: "" }
    ]
  });

  assert.deepEqual(invitation.items.map(({ type, place, alt }) => ({ type, place, alt })), [
    { type: "course", place: "서울숲", alt: undefined },
    { type: "photo", place: undefined, alt: "중복 ID 사진" },
    { type: "course", place: "성수 카페", alt: undefined }
  ]);
  assert.equal(new Set(invitation.items.map((item) => item.id)).size, 3);
  assert.equal(invitation.items.every((item) => typeof item.id === "string" && item.id.length > 0), true);
  assert.equal(invitation.items[0].id, "same-id");
});

test("normalizeInvitation accepts JPEG PNG and WebP photo source data URLs", () => {
  const invitation = normalizeInvitation({
    items: [
      { id: "jpeg", type: "photo", src: SAFE_JPEG },
      { id: "png", type: "photo", src: SAFE_PNG },
      { id: "webp", type: "photo", src: SAFE_WEBP }
    ]
  });

  assert.deepEqual(invitation.items.map((item) => item.id), ["jpeg", "png", "webp"]);
});

test("normalizeInvitation rejects malformed photo source data URLs", () => {
  const unsafeSources = [
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "https://example.com/photo.webp",
    "data:image/png;base64,AAAA*",
    "data:image/png;base64,A===",
    "data:image/png;base64,AA==AAAA",
    "data:image/png;base64,A",
    "data:image/png;base64,AAA"
  ];
  const invitation = normalizeInvitation({
    items: unsafeSources.map((src, index) => ({
      id: `unsafe-${index}`,
      type: "photo",
      src
    }))
  });

  assert.equal(invitation.items.length, 0);
});

test("unsafe photo sources are dropped before mixed invitation rendering", () => {
  const html = buildStandaloneHtml({
    items: [
      { id: "course-safe", type: "course", place: "SAFE COURSE" },
      { id: "photo-unsafe", type: "photo", src: "data:image/svg+xml;base64,PHN2Zz4=" }
    ]
  });

  assert.match(html, /SAFE COURSE/);
  assert.doesNotMatch(html, /photo-unsafe|image\/svg\+xml|<figure class="invite-photo">/);
});

test("mixed invitation items render in exact order and number courses only", () => {
  const html = buildStandaloneHtml({
    items: [
      { id: "course-first", type: "course", place: "FIRST COURSE" },
      { id: "photo-middle", type: "photo", src: SAFE_WEBP, alt: "MIDDLE PHOTO" },
      { id: "course-second", type: "course", place: "SECOND COURSE" }
    ]
  });
  const firstCourseIndex = html.indexOf("FIRST COURSE");
  const photoIndex = html.indexOf('<figure class="invite-photo">');
  const secondCourseIndex = html.indexOf("SECOND COURSE");

  assert.ok(firstCourseIndex < photoIndex);
  assert.ok(photoIndex < secondCourseIndex);
  assert.deepEqual([...html.matchAll(/invite-stop-number">(\d{2})/g)].map((match) => match[1]), ["01", "02"]);
});

test("mixed invitation photos escape text and omit blank captions", () => {
  const html = buildStandaloneHtml({
    items: [
      {
        id: "photo-captioned",
        type: "photo",
        src: SAFE_WEBP,
        alt: '\"><img src=x onerror="ALT_ATTACK">',
        caption: '<b data-attack="CAPTION_ATTACK">Us & them</b>'
      },
      { id: "photo-blank", type: "photo", src: SAFE_PNG, alt: "Blank caption", caption: "" }
    ]
  });

  assert.match(html, /alt="&quot;&gt;&lt;img src=x onerror=&quot;ALT_ATTACK&quot;&gt;"/);
  assert.match(html, /<figcaption>&lt;b data-attack=&quot;CAPTION_ATTACK&quot;&gt;Us &amp; them&lt;\/b&gt;<\/figcaption>/);
  assert.equal((html.match(/<figure class="invite-photo">/g) || []).length, 2);
  assert.equal((html.match(/<figcaption>/g) || []).length, 1);
  assert.doesNotMatch(html, /<img src=x onerror="ALT_ATTACK">|<b data-attack="CAPTION_ATTACK">/);
});

test("standalone canonical JSON stores items without stops and preserves Base64 photos", () => {
  const html = buildStandaloneHtml({
    items: [
      { id: "course-json", type: "course", place: "SERIALIZED COURSE" },
      { id: "photo-json", type: "photo", src: SAFE_WEBP, alt: "Exported photo", caption: "Exact bytes" }
    ]
  });
  const invitationData = invitationDataFrom(html);

  assert.equal(Object.hasOwn(invitationData, "stops"), false);
  assert.deepEqual(invitationData.items.map(({ id, type }) => ({ id, type })), [
    { id: "course-json", type: "course" },
    { id: "photo-json", type: "photo" }
  ]);
  assert.equal(invitationData.items[1].src, SAFE_WEBP);
});

test("mixed canonical item maps use one shared NAVER loader", () => {
  const html = buildStandaloneHtml({
    naverMapClientId: "public-client-id",
    items: [
      {
        id: "course-map-first",
        type: "course",
        place: "FIRST MAP",
        mapEnabled: true,
        mapLatitude: 37.5446,
        mapLongitude: 127.0559
      },
      { id: "photo-between-maps", type: "photo", src: SAFE_WEBP },
      {
        id: "course-map-second",
        type: "course",
        place: "SECOND MAP",
        mapEnabled: true,
        mapLatitude: 37.548,
        mapLongitude: 127.041
      }
    ]
  });
  const firstMapIndex = html.indexOf('data-map-key="stop-0"');
  const photoIndex = html.indexOf('<figure class="invite-photo">');
  const secondMapIndex = html.indexOf('data-map-key="stop-1"');

  assert.equal((html.match(/data-dynamic-map data-latitude/g) || []).length, 2);
  assert.equal((html.match(/oapi\.map\.naver\.com\/openapi\/v3\/maps\.js/g) || []).length, 1);
  assert.notEqual(firstMapIndex, -1);
  assert.notEqual(photoIndex, -1);
  assert.notEqual(secondMapIndex, -1);
  assert.ok(firstMapIndex < photoIndex);
  assert.ok(photoIndex < secondMapIndex);
});

test("mixed photo styles share a natural aspect ratio and overflow contract", () => {
  const previewCss = read("assets/style.css").replace(/\s+/g, "");
  const standaloneCss = buildStandaloneHtml({
    items: [{ id: "photo-style", type: "photo", src: SAFE_WEBP }]
  }).match(/<style>([\s\S]*?)<\/style>/)?.[1].replace(/\s+/g, "") || "";

  for (const css of [previewCss, standaloneCss]) {
    const figureRule = cssRule(css, ".invite-photo");
    const imageRule = cssRule(css, ".invite-photoimg");
    const captionRule = cssRule(css, ".invite-photofigcaption");

    assert.match(figureRule, /max-width:100%/);
    assert.match(figureRule, /overflow:hidden/);
    assert.doesNotMatch(figureRule, /border|background|box-shadow|border-radius/);
    assert.match(imageRule, /display:block/);
    assert.match(imageRule, /width:100%/);
    assert.match(imageRule, /height:auto/);
    assert.match(captionRule, /max-width:100%/);
    assert.match(captionRule, /padding:8px4px0/);
    assert.match(captionRule, /overflow-wrap:anywhere/);
  }
});

test("normalizeInvitation enforces photo limits and total ordered item limit", () => {
  const items = [
    ...Array.from({ length: MAX_PHOTOS + 1 }, (_, index) => ({
      id: `photo-${index}`,
      type: "photo",
      src: SAFE_WEBP,
      alt: `사진 ${index}`
    })),
    ...Array.from({ length: MAX_ITEMS }, (_, index) => ({
      id: `course-${index}`,
      type: "course",
      place: `장소 ${index}`
    }))
  ];
  const invitation = normalizeInvitation({ items });

  assert.equal(invitation.items.length, MAX_ITEMS);
  assert.equal(invitation.items.filter((item) => item.type === "photo").length, MAX_PHOTOS);
  assert.deepEqual(invitation.items.slice(0, 2).map((item) => item.id), ["photo-0", "photo-1"]);
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
    sparkle: /box-shadow:0 0 8px 2px var\(--particle-glow\)/,
    petals: /border-radius:70% 0 70% 0/,
    hearts: /content:"❤"/,
    fireflies: /particle-pulse var\(--pulse-duration\)/,
    bubbles: /border:1px solid var\(--particle-edge\)/,
    snow: /background:var\(--tone\)/,
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

test("preview and standalone keep the full selected particle amount on mobile", () => {
  const previewCss = read("assets/style.css");
  const standaloneCss = buildStandaloneHtml({ particleEffect: "fireflies" }).match(/<style>([\s\S]*?)<\/style>/)?.[1] || "";

  assert.doesNotMatch(previewCss, /\.particle-layer span:nth-child\(n\+/);
  assert.doesNotMatch(standaloneCss, /\.particle-layer span:nth-child\(n\+/);
  assert.equal((buildStandaloneHtml({ particleEffect: "fireflies", particleAmount: 500 }).match(/<span style="--x:/g) || []).length, 80);
});

test("particle palettes adapt to each template and render above all invitation content", () => {
  const previewCss = read("assets/style.css");
  const standaloneCss = buildStandaloneHtml({ particleEffect: "sparkle" }).match(/<style>([\s\S]*?)<\/style>/)?.[1] || "";

  for (const css of [previewCss, standaloneCss]) {
    assert.match(css, /--particle-light:/);
    assert.match(css, /--particle-accent:/);
    assert.match(css, /--particle-edge:/);
    assert.match(css, /\.particle-layer\s*\{[^}]*z-index:\s*10[^}]*pointer-events:\s*none/s);
    assert.doesNotMatch(css, /\.invitation-card\s*>\s*:not\(\.particle-layer\)[^{]*\{[^}]*z-index/s);
    assert.match(css, /background:\s*var\(--particle-light\)/);
  }
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
