const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
test('initial HTML exposes one complete social card without running JavaScript', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').split('</head>')[0];
  const tags = [...html.matchAll(/<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"/g)];
  const metadata = Object.fromEntries(tags.map(m => [m[1], m[2]]));
  for (const key of ['og:title', 'og:description', 'og:type', 'og:url', 'og:image', 'og:image:alt', 'twitter:card', 'twitter:image']) {
    assert.equal(tags.filter(m => m[1] === key).length, 1, key);
    assert.ok(metadata[key].length > 0);
  }
  assert.equal(metadata['og:url'], 'https://invitation-maker-one.vercel.app/');
  assert.equal(metadata['og:type'], 'website');
  assert.equal(metadata['twitter:card'], 'summary_large_image');
  assert.equal(metadata['twitter:image'], metadata['og:image']);
  const image = new URL(metadata['og:image']);
  assert.equal(image.origin, 'https://invitation-maker-one.vercel.app');
  const png = fs.readFileSync(path.join(root, image.pathname));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.equal(metadata['og:image:width'], '1200');
  assert.equal(metadata['og:image:height'], '630');
  assert.ok(png.length < 1024 * 1024);
});
