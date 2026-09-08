// Personal guest-facing invitations. Surprise gifts and host logistics are
// deliberately absent from both visible content and embedded document data.
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../assets/invitation-core.js');
const catalog = require('../invitation-data.json');

const course = (time, label, place, note) => ({
  id: `harin-${label.toLowerCase()}`, type: 'course', time, label, place, note,
  mapUrl: '', mapEnabled: false
});
const items = [
  { id: 'hello', type: 'notice', heading: 'TO. 오하린', body: '9월 12일, 오늘의 주인공은 너야.\n맛있는 한 끼부터 밤의 마지막 인사까지, 네 곁에서 함께할게.' },
  course('13:00–14:30', 'LUNCH & WINE', '살롱순라', '맛있는 음식과 와인으로 시작하는 우리 둘의 생일 데이트.'),
  course('14:30–14:50', 'PHOTO WALK', '서순라길', '예쁜 골목에서 서로의 사진을 남기고, 천천히 카페로 걸어가자.'),
  course('14:50–15:50', 'CAFE', '반쥴', '좋아하는 음료 한 잔. 서두르지 않고 네 이야기를 듣는 시간.'),
  course('15:50–16:10', 'A LITTLE PAUSE', '잠깐의 여유', '잠시 쉬어 가자. 여유가 있으면 테이크아웃 커피도 한 잔.'),
  course('16:10–16:40', 'BY THE STREAM', '청계천', '물소리를 들으며 나란히 걷기. 마음에 드는 곳에서는 잠깐 멈춰 사진도 찍자.'),
  course('17:00', 'CHECK IN', '부티크호텔 K 종로점', '많이 걸었으니까, 이제 우리만의 공간에서 편하게 쉬어 가자.'),
  course('17:15', 'MAKE A WISH', '생일 소원을 비는 시간', '눈을 감고 소원 하나. 오늘의 행복이 네 곁에 오래 머물기를.'),
  course('17:40–21:30', 'JUST US', '우리 둘의 느긋한 저녁', '쉬기도 하고, 저녁도 먹고. 정해진 순서 없이 함께 보내는 시간.'),
  course('21:30–22:00', 'GOOD NIGHT', '하루를 마무리하며', '천천히 정리하고 퇴실하기. 오늘의 예쁜 장면들을 오래 기억하자.'),
  { id: 'comfort', type: 'notice', heading: '오늘의 약속', body: '걷기 편한 신발과 편안한 마음만 챙겨 와.\n시간은 네 컨디션에 맞춰 조금씩 바꿔도 좋아. 가장 중요한 건 네가 행복한 하루를 보내는 거니까.' },
  { id: 'letter', type: 'notice', heading: '생일 축하해, 하린아', body: '네가 웃으면 평범한 하루도 특별해져.\n오늘은 내가 네 하루를 조금 더 다정하게 만들어 주고 싶어.\n태어나 줘서, 내 곁에 있어 줘서 고마워.\n앞으로도 네 생일을 가장 가까이에서 축하해 줄게.\n\n많이 좋아해.\nFrom rojae · 로재가' }
];
const variants = [
  ['0912.html', 'cherry-muse', '하린아, 생일 축하해', '오늘은 온통 너를 위한 날'],
  ['0912-peach.html', 'peach-table', '너와 보내는 생일', '다정한 오후, 그리고 우리 둘'],
  ['0912-bloom.html', 'bloom-portrait', '너라는 가장 예쁜 날', '9월 12일, 하린이에게 보내는 초대장']
];
for (const [filename, templateId, title, subtitle] of variants) {
  const preset = catalog.templates.find(template => template.id === templateId);
  let html = Core.buildStandaloneHtml({
    ...preset.defaults, templateId, layoutFamily: preset.familyId,
    title, subtitle, dateLabel: '2026.09.12 SAT · 13:00',
    host: 'From rojae · 로재가', location: '살롱순라',
    message: '사랑하는 하린이에게.\n네가 태어난 날을 너와 함께 보낼 수 있어서 참 좋아.\n맛있는 순간, 예쁜 골목, 나란히 걷는 발걸음까지.\n오늘은 우리 둘의 속도로 행복하자.',
    introEffect: 'none', particleEffect: 'none',
    mapEnabled: false, mapUrl: '', naverMapClientId: '', items
  }).replace('<meta name="viewport"', '<meta name="robots" content="noindex, nofollow, noarchive">\n  <meta name="description" content="하린이의 9월 12일을 위한 생일 초대장. From rojae.">\n  <meta name="viewport"');
  // The shared renderer supplies search links for all course headings. Keep
  // only genuine destinations on this personal itinerary, not poetic labels.
  const destinations = new Set(['살롱순라', '서순라길', '반쥴', '청계천', '부티크호텔 K 종로점']);
  html = html.replace(/<a\b[^>]*href="https:\/\/map\.naver\.com\/p\/search\/([^"\s]+)"[^>]*>[\s\S]*?<\/a>/g,
    (anchor, query) => destinations.has(decodeURIComponent(query)) ? anchor : '');
  html = html.replace('</head>', `<style>
    body .invitation-card[data-layout-family][data-design] .invite-hero h1 { line-height: 1.2; word-break: keep-all; overflow-wrap: anywhere; }
    @media (max-width: 480px) {
      body .invitation-card[data-layout-family][data-design] .invite-hero h1 { font-size: clamp(32px, 10vw, 46px); letter-spacing: -.035em; }
    }
  </style></head>`);
  fs.writeFileSync(path.resolve(__dirname, '..', filename), html);
  console.log(`Built ${filename}`);
}
