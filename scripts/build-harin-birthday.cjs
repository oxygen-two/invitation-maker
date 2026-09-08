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
  course('13:00–14:30', 'LUNCH', '살롱순라', '오후 1시에 만나자. 채끝 등심 스테이크와 트러플 화이트 라구 파스타를 나눠 먹기. 점심에는 가벼운 음료를 곁들이고, 와인은 저녁에 함께 즐기자.'),
  course('14:30–14:50', 'PHOTO WALK', '서순라길', '예쁜 골목에서 서로의 사진을 남기고, 천천히 카페로 걸어가자.'),
  course('14:50–15:50', 'CAFE', '반쥴', '차나 커피를 마시며 편하게 이야기하자. 디저트는 가볍게, 대화는 느긋하게.'),
  course('15:50–16:10', 'A LITTLE PAUSE', '잠깐의 여유', '잠시 쉬어 가자. 음료가 더 마시고 싶고 시간 여유가 있을 때만 스타벅스 테이크아웃도 한 잔.'),
  course('16:10–16:40', 'BY THE STREAM', '청계천', '천천히 걷다가 편하게 멈출 수 있는 곳에서 사진을 남기자. 산책을 마치면 호텔 방향으로 이동하기.'),
  course('17:00', 'CHECK IN', '부티크호텔 K 종로점', '오후 5시부터 밤 10시까지 함께 머무는 시간. 짐을 내려놓고 잠깐 정리하며 쉬어 가자.'),
  course('17:15–17:40', 'MAKE A WISH', '생일을 축하하는 시간', '오늘의 주인공을 위한 달콤한 시간. 생일을 축하하고, 함께 사진도 남기자.'),
  course('17:40–19:00', 'REST', '우리 둘의 쉼표', '음악을 듣거나 이야기하면서 둘이 편하게 쉬어 가자.'),
  course('19:00–20:00', 'DINNER & WINE', '저녁과 와인', '둘이 먹고 싶은 저녁 메뉴와 와인을 함께 즐기자. 음식과 와인을 즐길 장소는 호텔 반입 가능 여부에 맞춰 정할게.'),
  course('20:00–21:30', 'JUST US', '우리 둘의 자유 시간', '영화나 예능을 보거나, 도란도란 대화하며 쉬기. 우리에게 편안한 방식으로 보내자.'),
  course('21:30–22:00', 'GOOD NIGHT', '하루를 마무리하며', '소지품을 챙기고 귀가 교통을 확인하자. 천천히 정리하고 밤 10시까지 퇴실하기.'),
  { id: 'comfort', type: 'notice', heading: '오늘의 약속', body: '걷기 편한 신발과 편안한 마음만 챙겨 와.\n시간이 밀리면 스타벅스와 산책을 줄이고, 식사와 대화는 여유롭게 즐기자.\n와인을 마시는 날이니 이동은 대중교통이나 택시로. 가장 중요한 건 네가 행복한 하루를 보내는 거니까.' },
  { id: 'letter', type: 'notice', heading: '생일 축하해, 하린아', body: '네가 웃으면 평범한 하루도 특별해져.\n오늘은 내가 네 하루를 조금 더 다정하게 만들어 주고 싶어.\n태어나 줘서, 내 곁에 있어 줘서 고마워.\n앞으로도 네 생일을 가장 가까이에서 축하해 줄게.\n\n많이 좋아해.\nFrom rojae' }
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
    host: 'From rojae', location: '살롱순라',
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
  fs.writeFileSync(path.resolve(__dirname, '..', filename), html.replace(/[\t ]+$/gm, ''));
  console.log(`Built ${filename}`);
}
