// Run manually after editing. Commit generated HTML; Vercel needs no build step.
//
// WHY THESE PAGES CARRY THEIR OWN TRANSLATION
//
// An error page is the one document that has to work when nothing else does.
// It may be the first thing a guest from anywhere sees, and it may be served
// while the assets directory, the API or the network itself is unavailable. So
// it fetches nothing: no i18n.js, no dictionary, no font, no stylesheet.
//
// That leaves two jobs for this generator. It bakes the Korean copy into the
// markup, so a visitor with JavaScript disabled still reads a sentence and a
// crawler still sees real text. And it inlines BOTH languages as JSON beside a
// tiny resolver that repeats the rules in assets/i18n/i18n.js — ?lang, then the
// stored choice, then navigator.languages, then Korean — so an English reader
// gets English and <html lang> tells the truth.
//
// Copy has exactly one home: the errorPages namespace in the dictionaries,
// required below. Change a sentence there, rerun this script, commit the HTML.
const fs = require('node:fs');
const path = require('node:path');

const dictionaries = {
  ko: require('../assets/i18n/dictionary-ko.js'),
  en: require('../assets/i18n/dictionary-en.js')
};

// The temporary failures are the only ones a reload can plausibly fix, so they
// are the only ones that offer one — user-triggered, never automatic.
const pages = [400, 401, 403, 404, 408, 410, 429, 500, 502, 503, 504].map((code) => ({
  code,
  retry: [408, 429, 500, 502, 503, 504].includes(code)
}));

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const documentTitle = (code, title) => `${code} · ${title} | Invitation Studio`;

/* One record per language: everything on the page that is a sentence rather
   than a brand mark or a number. The <noscript> reload hint is deliberately
   absent — a visitor without JavaScript necessarily stays on the served Korean
   page, so that line can only ever be read in one language.

   `offline` is the one entry with no counterpart in the markup: the notice is
   served as an empty live region and this record is where the boot script
   reads the sentence from when the connection actually drops. */
const copyFor = ({ code, retry }) => Object.fromEntries(Object.entries(dictionaries).map(([language, dictionary]) => {
  const { common } = dictionary.errorPages;
  const page = dictionary.errorPages[code];
  return [language, {
    documentTitle: documentTitle(code, page.title),
    skipToContent: common.skipToContent,
    brandHome: common.brandHome,
    headerNote: common.headerNote,
    eyebrow: page.eyebrow,
    title: page.title,
    description: page.description,
    offline: common.offline,
    action: page.action,
    ...(retry ? { reload: page.reload } : {}),
    hint: page.hint,
    footerNote: common.footerNote
  }];
}));

// Inside <script type="application/json"> only "</script" can end the block,
// and escaping every "<" as a JSON unicode escape makes that impossible.
const inlineJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const css = `
:root{color-scheme:light;--paper:#f7f7f4;--ink:#282b29;--green:#314e41;--muted:#59645e;--line:#dce1d8;--surface:#ffffff;--halo:#e9eee6;--halo-line:#e0e6dc;--halo-dash:#b7c3b5;--on-green:#ffffff;--edge:#b9c4b9;--glow:#314e4125;--shadow:#283d3217}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.7;min-height:100vh;min-height:100svh;display:flex;flex-direction:column}
a{color:inherit}a:focus-visible,button:focus-visible{outline:3px solid var(--green);outline-offset:5px}
.skip{position:absolute;left:20px;top:-80px;background:var(--surface);color:var(--ink);padding:10px;z-index:5}.skip:focus{top:10px}
header,footer{width:min(1200px,100%);margin-inline:auto;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:28px 40px}
.brand{font-size:19px;font-weight:700;letter-spacing:-.6px;text-decoration:none;min-height:44px;display:inline-flex;align-items:center;gap:10px}.brand svg{width:25px;height:25px}.header-note,.footer-note{font-size:12px;color:var(--muted)}
main{width:min(1100px,100%);margin:auto;display:grid;grid-template-columns:1fr 1.05fr;align-items:center;gap:70px;padding:56px 40px 80px}
.art{position:relative;aspect-ratio:1;display:grid;place-items:center}.halo{position:absolute;inset:3%;border-radius:50%;background:var(--halo);border:1px solid var(--halo-line)}.halo:after{content:"";position:absolute;inset:19px;border:1px dashed var(--halo-dash);border-radius:50%}
.envelope{position:relative;width:82%;transform:rotate(-8deg);filter:drop-shadow(0 22px 22px var(--shadow))}.envelope svg{display:block;width:100%;height:auto}
.seal{position:absolute;right:4%;bottom:12%;border-radius:50%;background:var(--green);color:var(--on-green);width:66px;height:66px;display:grid;place-items:center;font-size:25px;border:5px solid var(--paper)}
.eyebrow{font-size:11px;letter-spacing:2.2px;font-weight:700;color:var(--green);margin:0 0 12px}.code{font-family:Georgia,"Times New Roman",serif;font-size:clamp(86px,9vw,126px);letter-spacing:-6px;line-height:1;font-weight:400;margin:0 0 24px;color:var(--green)}
h1{font-size:clamp(25px,2.6vw,33px);line-height:1.45;letter-spacing:-1px;word-break:keep-all;margin:0 0 16px}.description{max-width:420px;color:var(--muted);font-size:16px;word-break:keep-all;overflow-wrap:anywhere;margin:0}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:30px}.actions a,.actions button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;border-radius:9px;padding:11px 20px;font:inherit;font-size:14px;font-weight:650;text-decoration:none;border:1px solid var(--edge);background:transparent;color:var(--green);cursor:pointer}.actions .primary{background:var(--green);color:var(--on-green);border-color:var(--green)}.actions a:hover,.actions button:hover{box-shadow:0 0 0 2px var(--glow)}.actions button:disabled{opacity:.6;cursor:wait}
.hint{border-top:1px solid var(--line);margin:30px 0 0;padding-top:19px;color:var(--muted);font-size:13px;max-width:420px;word-break:keep-all}.offline{border-left:3px solid var(--green);padding:10px 14px;background:var(--halo);font-size:14px;margin:20px 0 0}.offline:empty{display:none}[hidden]{display:none!important}
footer{border-top:1px solid var(--line);font-size:11px;letter-spacing:1px;color:var(--muted);padding-bottom:max(24px,env(safe-area-inset-bottom))}.footer-note{letter-spacing:0}
@media(max-width:700px){header{padding:18px 24px}.header-note{display:none}main{grid-template-columns:1fr;gap:24px;padding:8px 24px 44px;max-width:470px}.art{width:210px;margin-inline:auto}.seal{width:46px;height:46px;font-size:19px;border-width:4px}.content{text-align:center}.eyebrow{font-size:10px;letter-spacing:1.6px}.code{font-size:80px;margin-bottom:18px}h1{font-size:25px}.description{font-size:15px}.actions{justify-content:center;margin-top:24px}.hint{text-align:left;margin-top:24px}.offline{text-align:left}footer{padding:20px 24px;flex-wrap:wrap;gap:4px}.brand{font-size:17px}}
@media(max-width:350px){main{padding-inline:20px}.art{width:175px}h1{font-size:23px}.actions{flex-direction:column}.actions a,.actions button{width:100%}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
/* Dark scheme. The site chrome's dark palette is a separate task; these pages
   are excluded from it because they ship as standalone documents, so the whole
   palette lives here. Only tokens change, plus the illustration's fills, which
   are presentation attributes on the SVG and so are overridden by these rules.
   The accent lightens to #9ec9ab: #314e41 on a dark ground reads as black. */
@media(prefers-color-scheme:dark){
:root{color-scheme:dark;--paper:#15181a;--ink:#e9ede9;--green:#9ec9ab;--muted:#a9b5ac;--line:#2c3331;--surface:#1d2123;--halo:#1c2220;--halo-line:#2b3330;--halo-dash:#41504a;--on-green:#10211a;--edge:#4c584f;--glow:#9ec9ab33;--shadow:#00000066}
.env-back{fill:#2b342e}.env-card{fill:#242a28;stroke:#3a433d}.env-card-inner{stroke:#333c37}.env-heart{fill:#8fb795}.env-lines{stroke:#4d584f}.env-front{fill:#39453d;stroke:#4c584f}.env-flap{fill:#303b35;stroke:#4c584f}
}
`;

const envelope = `<svg viewBox="0 0 360 330" fill="none"><path class="env-back" d="M24 144 180 32l156 112v153H24Z" fill="#c6d1c1"/><rect class="env-card" x="61" y="62" width="238" height="222" rx="5" fill="#fffdf8" stroke="#d8ded1"/><rect class="env-card-inner" x="75" y="76" width="210" height="194" rx="2" stroke="#e3e5da"/><path class="env-heart" d="M180 153c-42-24-26-51-10-35l10 10 10-10c16-16 32 11-10 35Z" fill="#7e957b"/><path class="env-lines" d="M133 180h94M152 195h56" stroke="#b6c1ad" stroke-width="2" stroke-linecap="round"/><path class="env-front" d="m24 144 156 96 156-96v153H24Z" fill="#d9e1d1" stroke="#b7c5b2"/><path class="env-flap" d="m24 297 134-97c13-10 31-10 44 0l134 97" fill="#e5eadf" stroke="#b7c5b2"/></svg>`;

/* Runs in <head>, before anything is painted, so the language is settled and
   <html lang> is correct by the time the first pixel lands. It reads exactly
   one query parameter and maps it through an allow-list; nothing from the URL
   is ever written into the document, and an error page never remembers a
   choice, so there is no storage write here. */
const resolver = `
(() => {
  const supported = ["ko", "en"];
  const base = (value) => {
    const tag = String(value || "").trim().toLowerCase().replace(/_/g, "-").split("-")[0];
    return supported.includes(tag) ? tag : null;
  };
  const queried = () => { try { return base(new URLSearchParams(location.search).get("lang")); } catch { return null; } };
  const stored = () => { try { return base(localStorage.getItem("invitation-maker.language")); } catch { return null; } };
  const offered = () => {
    for (const tag of navigator.languages || [navigator.language]) { const hit = base(tag); if (hit) return hit; }
    return null;
  };
  const language = queried() || stored() || offered() || "ko";
  document.documentElement.lang = language;
  document.documentElement.dataset.errorLang = language;
})();`;

const boot = `
(() => {
  // The head already chose the language; this only applies it, then wires the
  // connection notice and the manual reload. Text is set as text, never markup.
  const language = document.documentElement.lang;
  const copies = JSON.parse(document.querySelector('[data-error-copy]').textContent);
  const copy = copies[language] || copies.ko;
  document.title = copy.documentTitle;
  for (const node of document.querySelectorAll('[data-error-text]')) {
    const value = copy[node.dataset.errorText];
    if (value) node.textContent = value;
  }
  for (const node of document.querySelectorAll('[data-error-label]')) {
    const value = copy[node.dataset.errorLabel];
    if (value) node.setAttribute('aria-label', value);
  }
  // The notice is rendered empty and stays in the tree: a role="status" region
  // only announces what appears INSIDE it after it is being observed, so a
  // pre-filled node revealed by flipping the hidden attribute changes nothing a
  // screen reader is listening for, and is silent exactly when it matters.
  // Writing the sentence in — and clearing it again — is the change that gets
  // announced. .offline:empty keeps the empty region out of the visual layout.
  //
  // The first pass waits a frame. A write that happens while the document is
  // still parsing is indistinguishable from markup to a screen reader, which
  // would leave the one case that matters most — arriving here already offline
  // — as silent as the pre-filled version was. Every later pass is synchronous:
  // by then the region is established and an event is what triggered it.
  const offline = document.querySelector('[data-offline]');
  const update = () => { offline.textContent = navigator.onLine === false ? copy.offline : ''; };
  addEventListener('online', update); addEventListener('offline', update);
  requestAnimationFrame(update);
  const retry = document.querySelector('[data-retry]');
  if (retry) {
    retry.hidden = false;
    retry.addEventListener('click', () => {
      if (navigator.onLine === false) { update(); return; }
      retry.disabled = true;
      location.reload();
    });
    addEventListener('pageshow', () => { retry.disabled = false; update(); });
  }
})();`;

function renderPage(page) {
  const { code, retry } = page;
  const copy = copyFor(page);
  const ko = copy.ko;
  const text = (key) => escapeHtml(ko[key]);

  return `<!doctype html>
<!-- Generated by scripts/build-error-pages.cjs; edit the generator or the errorPages dictionary namespace, then regenerate. -->
<html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#f7f7f4" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#15181a" media="(prefers-color-scheme: dark)">
<title>${escapeHtml(documentTitle(code, ko.title))}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ctext y='48' font-size='46'%3E%F0%9F%92%8C%3C/text%3E%3C/svg%3E">
<style>${css}</style>
<script type="application/json" data-error-copy>${inlineJson(copy)}</script>
<script data-error-lang>${resolver}
</script></head><body>
<a class="skip" href="#main" data-error-text="skipToContent">${text('skipToContent')}</a>
<header><a class="brand" href="/" data-error-label="brandHome" aria-label="${text('brandHome')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></svg>Invitation Studio</a><span class="header-note" data-error-text="headerNote">${text('headerNote')}</span></header>
<main id="main" tabindex="-1"><div class="art" aria-hidden="true"><div class="halo"></div><div class="envelope">${envelope}</div><span class="seal">✳</span></div>
<section class="content" aria-labelledby="error-title"><p class="eyebrow" data-error-text="eyebrow">${text('eyebrow')}</p><p class="code" data-error-code>${code}</p><h1 id="error-title" data-error-text="title">${text('title')}</h1><p class="description" data-error-text="description">${text('description')}</p>
<p class="offline" data-offline role="status"></p>
<div class="actions"><a class="primary" href="/"><span data-error-text="action">${text('action')}</span><span aria-hidden="true">&nbsp;↗</span></a>${retry ? `<button type="button" data-retry data-error-text="reload" hidden>${text('reload')}</button>` : ''}</div>
<p class="hint" data-error-text="hint">${text('hint')}</p>${retry ? `<noscript><p class="hint">${escapeHtml(dictionaries.ko.errorPages.common.reloadHint)}</p></noscript>` : ''}</section></main>
<footer><span>INVITATION STUDIO</span><span class="footer-note" data-error-text="footerNote">${text('footerNote')}</span></footer>
<script>${boot}
</script></body></html>\n`;
}

if (require.main === module) {
  const check = process.argv.includes('--check');
  for (const page of pages) {
    const target = path.resolve(__dirname, '..', `${page.code}.html`);
    const html = renderPage(page);
    if (check) {
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== html) {
        throw new Error(`Outdated error page: ${page.code}.html`);
      }
    } else fs.writeFileSync(target, html);
  }
  console.log(`${check ? 'Verified' : 'Generated'} ${pages.length} standalone error pages.`);
}
module.exports = { pages, renderPage, copyFor };
