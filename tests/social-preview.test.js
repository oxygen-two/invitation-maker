const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

// Minimal well-formedness check without pulling in an XML parser: every
// opening tag must have a matching closing tag in proper nesting order, and
// entities must be escaped. Good enough to catch a broken sitemap.
const assertWellFormedXml = (xml) => {
  assert.match(xml, /^<\?xml\s+version="1\.0"\s+encoding="UTF-8"\?>/);
  assert.doesNotMatch(xml, /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/, 'unescaped "&" in XML');
  const stack = [];
  for (const [, closing, name, selfClosing] of xml.matchAll(/<(\/)?([a-zA-Z][\w:-]*)\b[^<>]*?(\/)?>/g)) {
    if (selfClosing) continue;
    if (closing) {
      assert.equal(stack.pop(), name, `mismatched closing tag </${name}>`);
    } else {
      stack.push(name);
    }
  }
  assert.equal(stack.length, 0, 'unclosed XML tags');
};
// Attribute-order independent: the meta tags carry data-i18n-attr bindings
// between the name and the content, and a crawler does not care what order
// attributes appear in either.
const readMetaTags = (html) => [...html.matchAll(/<meta\b[^>]*>/g)]
  .map(([tag]) => {
    const attributes = {};
    for (const match of tag.matchAll(/\s([a-z][\w:-]*)\s*=\s*"([^"]*)"/gi)) {
      attributes[match[1].toLowerCase()] = match[2];
    }
    return attributes;
  })
  .filter((attributes) => (attributes.property || attributes.name) && attributes.content !== undefined)
  .map((attributes) => [attributes.property || attributes.name, attributes.content]);

test('initial HTML exposes one complete social card without running JavaScript', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').split('</head>')[0];
  const tags = readMetaTags(html);
  const metadata = Object.fromEntries(tags);
  for (const key of ['og:title', 'og:description', 'og:type', 'og:url', 'og:image', 'og:image:alt', 'twitter:card', 'twitter:image']) {
    assert.equal(tags.filter(([name]) => name === key).length, 1, key);
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

test('robots.txt allows the landing page and blocks individual invitations and the API', () => {
  const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');

  assert.match(robots, /^User-agent:\s*\*/m);
  assert.match(robots, /^Allow:\s*\/\s*$/m);
  assert.match(robots, /^Disallow:\s*\/i\/\s*$/m);
  assert.match(robots, /^Sitemap:\s*https:\/\/invitation-maker-one\.vercel\.app\/sitemap\.xml\s*$/m);
});

test('sitemap.xml is well-formed and lists only public, indexable pages', () => {
  const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');

  assertWellFormedXml(sitemap);
  assert.match(sitemap, /<urlset\b[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.ok(locs.length > 0, 'sitemap lists at least one URL');
  assert.equal(locs.includes('https://invitation-maker-one.vercel.app/'), true);
  for (const loc of locs) {
    assert.doesNotMatch(loc, /\/i\//, `sitemap must never enumerate individual invitations: ${loc}`);
  }
});

// Regression guard: published invitations must never become indexable.
// shared.html is the page every /i/:id link renders — if this noindex tag
// ever gets "cleaned up", real names, dates, venues and phone numbers from
// people's invitations would start showing up in search results.
test('shared.html keeps its noindex meta tag (published invitations must stay unsearchable)', () => {
  const shared = fs.readFileSync(path.join(root, 'shared.html'), 'utf8');

  assert.match(shared, /<meta\s+name="robots"\s+content="noindex"\s*\/?>/);
});

test('build:public ships robots.txt and sitemap.xml to the deployed output', () => {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build-public.cjs')], { cwd: root });

  const publicRobots = fs.readFileSync(path.join(root, 'public', 'robots.txt'), 'utf8');
  const publicSitemap = fs.readFileSync(path.join(root, 'public', 'sitemap.xml'), 'utf8');

  assert.equal(publicRobots, fs.readFileSync(path.join(root, 'robots.txt'), 'utf8'));
  assert.equal(publicSitemap, fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8'));
  assert.match(publicRobots, /Disallow:\s*\/i\//);
  assertWellFormedXml(publicSitemap);
});
