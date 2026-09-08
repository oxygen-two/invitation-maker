// Personal guest-facing invitations. Surprise gifts and host logistics are
// deliberately absent from both visible content and embedded document data.
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../assets/invitation-core.js');
const catalog = require('../invitation-data.json');

const course = (time, label, place, note = '') => ({
  id: `harin-${label.toLowerCase()}`, type: 'course', time, label, place, note,
  mapUrl: '', mapEnabled: false
});
const items = [
  course('13:00–14:30', 'LUNCH', '살롱순라', 'Steak & truffle pasta'),
  course('14:30–14:50', 'PHOTO WALK', '서순라길'),
  course('14:50–15:50', 'COFFEE & TEA', '반쥴'),
  course('15:50–16:10', 'PAUSE', 'A little break'),
  course('16:10–16:40', 'WALK', '청계천'),
  course('17:00', 'CHECK IN', '부티크호텔 K 종로점', 'Our stay · 17:00–22:00'),
  course('17:15–17:40', 'CELEBRATE', 'Make a wish'),
  course('17:40–19:00', 'REST', 'Slow moments'),
  course('19:00–20:00', 'DINNER & WINE', 'A table for two'),
  course('20:00–21:30', 'UNWIND', 'Just us'),
  course('21:30–22:00', 'CHECK OUT', 'Good night')
];
const variants = [
  ['0912.html', 'bloom-portrait', 'Harin’s Birthday', 'September 12 · A day for two'],
  ['0912-peach.html', 'peach-table', 'Harin’s Birthday', 'September 12 · A day for two'],
  ['0912-bloom.html', 'bloom-portrait', 'Harin’s Birthday', 'September 12 · A day for two']
];
for (const [filename, templateId, title, subtitle] of variants) {
  const preset = catalog.templates.find(template => template.id === templateId);
  let html = Core.buildStandaloneHtml({
    ...preset.defaults, templateId, layoutFamily: preset.familyId,
    title, subtitle, dateLabel: '2026.09.12 SAT · 13:00',
    host: 'From rojae', location: '살롱순라',
    message: 'THE AFTERNOON & EVENING',
    introEffect: 'dawn', particleEffect: 'petals', particleScale: 65, particleAmount: 25,
    mapEnabled: false, mapUrl: '', naverMapClientId: '', items
  }).replace('<meta name="viewport"', '<meta name="robots" content="noindex, nofollow, noarchive">\n  <meta name="description" content="하린이의 9월 12일을 위한 생일 초대장. From rojae.">\n  <meta name="viewport"');
  // The shared renderer supplies search links for all course headings. Keep
  // only genuine destinations on this personal itinerary, not poetic labels.
  const destinations = new Set(['살롱순라', '서순라길', '반쥴', '청계천', '부티크호텔 K 종로점']);
  html = html.replace(/<a\b[^>]*href="https:\/\/map\.naver\.com\/p\/search\/([^"\s]+)"[^>]*>[\s\S]*?<\/a>/g,
    (anchor, query) => destinations.has(decodeURIComponent(query)) ? anchor : '');
  html = html.replaceAll('인트로 건너뛰기', 'Skip intro').replaceAll('건너뛰기', 'Skip')
    .replaceAll('대표 지도 열기', 'Meeting point ↗').replaceAll('장소 지도 열기', 'Map ↗');
  html = html.replace('</head>', `<style>
    .particle-layer { opacity: .45; }
    .invitation-card .invite-message { font-family: var(--font-en), serif; font-size: 14px; letter-spacing: .14em; }
    .invitation-card p:empty { display: none; }
    body .invitation-card[data-layout-family][data-design] .invite-hero h1 { line-height: 1.2; word-break: keep-all; overflow-wrap: anywhere; }
    @media (max-width: 480px) {
      body .invitation-card[data-layout-family][data-design] .invite-hero h1 { font-size: clamp(32px, 10vw, 46px); letter-spacing: -.035em; }
    }
  </style></head>`);
  fs.writeFileSync(path.resolve(__dirname, '..', filename), html.replace(/[\t ]+$/gm, ''));
  console.log(`Built ${filename}`);
}
