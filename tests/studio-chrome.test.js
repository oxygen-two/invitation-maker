const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const studio = fs.readFileSync(path.join(root, "assets/studio/studio.css"), "utf8");

test("studio.css declares the chrome token set", () => {
  for (const token of ["--studio-paper", "--studio-ink", "--studio-ink-muted", "--studio-accent", "--studio-accent-ink", "--studio-line", "--studio-surface", "--studio-surface-alt", "--studio-warn-bg", "--studio-warn-ink", "--studio-danger"]) {
    assert.match(studio, new RegExp(`${token}:\\s*#[0-9a-f]{3,8}`, "i"), `${token} missing`);
  }
});

test("the document background is the studio paper, not an invitation palette", () => {
  assert.match(studio, /html\s*{[^}]*background:\s*var\(--studio-paper\)/);
});

test("editor components that used to inherit invitation colours are pinned to chrome tokens", () => {
  for (const selector of [".add-item-button", ".range-heading", ".panel-title .eyebrow", ".library-panel .eyebrow", ".upload-box label", ".hero-image-empty", ".hero-image-select-button"]) {
    assert.ok(studio.includes(selector), `${selector} has no chrome rule`);
  }
});

test("studio.css uses no raw green/ink hex outside the token block", () => {
  const body = studio.slice(studio.indexOf("}") + 1); // everything after the :root block
  assert.doesNotMatch(body, /#314e41|#282b29|#59645e|#647168/i, "raw chrome hex found; use var(--studio-*)");
});

/* The consent banner is fixed to the bottom of the viewport at a z-index the
   studio cannot outrank, so the studio's own fixed bars have to step up by its
   height instead of stacking against it, and every stage has to spend the same
   number on its bottom padding. consent.js publishes that height on <html> as
   --consent-height; these are the rules that read it. */
test("the studio steps its fixed bars and stage paddings over the consent banner", () => {
  assert.ok(studio.includes("bottom: var(--consent-height, 0px);"), "no fixed bar reads the banner height");
  for (const selector of ['body[data-studio-stage] #gallery-dock', 'body[data-mobile-view="editor"] .action-row']) {
    assert.ok(studio.includes(selector), `${selector} is not lifted above the banner`);
  }
  for (const stage of ["gallery", "edit", "finish"]) {
    assert.match(
      studio,
      new RegExp(`body\\[data-studio-stage="${stage}"\\] \\{ padding-bottom: calc\\([^}]*var\\(--consent-height, 0px\\)\\)`),
      `the ${stage} stage reserves no room for the banner`
    );
  }
});

test("the consent banner is painted from studio chrome tokens, never the invitation palette", () => {
  const rule = studio.slice(studio.indexOf("body[data-studio-stage] #invitation-consent"));
  assert.ok(rule.startsWith("body[data-studio-stage] #invitation-consent {"), "the banner has no studio-token override");
  const block = rule.slice(0, rule.indexOf("}"));
  for (const token of ["--studio-surface", "--studio-ink", "--studio-line"]) {
    assert.ok(block.includes(`var(${token})`), `the banner override does not set ${token}`);
  }
  assert.doesNotMatch(block, /var\(--(?:card|ink|line)\b/, "the banner must not read the invitation palette");
});

/* Brace balance (regression guard).

   studio.css is appended to by several branches at once and merged with a
   union strategy, which means a new block inserted just above an existing
   `}` can quietly adopt it as its own closer and leave the block above
   unterminated. That happened once: `@media (max-width: 420px)` lost its
   closing brace, so every rule after it — the #sample-sheet bottom sheet and
   the phone header's status label among them — was swallowed into a query
   that is false on any screen wider than 420px. The browser reports nothing;
   the rules simply do not exist. This walks each stylesheet the way a parser
   does and fails on the first brace that cannot be balanced. */
const braceScan = (source) => {
  let depth = 0;
  let line = 1;
  let openedAt = [];
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === "\n") {
      line += 1;
      continue;
    }
    // Comments: only /* */ is a comment in CSS; `//` is not.
    if (char === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") line += 1;
        i += 1;
      }
      i += 1;
      continue;
    }
    // Strings may hold braces: content: "}" is a declaration, not a block.
    if (char === '"' || char === "'") {
      i += 1;
      while (i < source.length && source[i] !== char && source[i] !== "\n") {
        if (source[i] === "\\") i += 1;
        i += 1;
      }
      if (source[i] === "\n") line += 1;
      continue;
    }
    if (char === "{") {
      depth += 1;
      openedAt.push(line);
    } else if (char === "}") {
      depth -= 1;
      openedAt.pop();
      if (depth < 0) return { depth, line, unclosed: [] };
    }
  }
  return { depth, line: null, unclosed: openedAt };
};

/* The guard is only worth as much as this scanner, so the scanner is pinned
   too: a brace inside a string or a comment is not a block, and the shape the
   regression actually had has to read as unbalanced. */
test("the brace scanner counts blocks, not braces inside strings and comments", () => {
  const cases = [
    ['a { content: "}"; }', 0, "close brace inside a string"],
    ["a { content: '{'; }", 0, "open brace inside a single-quoted string"],
    ["/* } */ a { color: red; }", 0, "brace inside a comment"],
    ['a { content: "\\""; }', 0, "escaped quote inside a string"],
    ['a::before { content: "/*"; } b { color: red; }', 0, "comment opener inside a string"],
    ["@media (max-width: 420px) { a { b: c } ", 1, "the unclosed @media this test exists for"],
  ];
  for (const [css, depth, name] of cases) {
    assert.equal(braceScan(css).depth, depth, name);
  }
  assert.ok(braceScan("a { b: c } }").depth < 0, "a stray } has to read as unbalanced");
});

const cssFiles = (() => {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".css")) found.push(path.relative(root, full));
    }
  };
  walk(path.join(root, "assets"));
  return found.sort();
})();

test("every stylesheet under assets/ has balanced braces", () => {
  assert.ok(cssFiles.length >= 3, `expected the studio and site stylesheets, found ${cssFiles.length}`);
  for (const file of cssFiles) {
    const scan = braceScan(fs.readFileSync(path.join(root, file), "utf8"));
    if (scan.depth < 0) assert.fail(`${file}: stray } at line ${scan.line}`);
    assert.equal(scan.depth, 0, `${file}: ${scan.depth} unclosed { — opened at line(s) ${scan.unclosed.join(", ")}`);
  }
});

test("the inline <style> of every root page has balanced braces", () => {
  const pages = fs.readdirSync(root).filter((name) => name.endsWith(".html")).sort();
  assert.ok(pages.length >= 5, `expected the root pages, found ${pages.length}`);
  let checked = 0;
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    const blocks = html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi);
    for (const [, css] of blocks) {
      const scan = braceScan(css);
      if (scan.depth < 0) assert.fail(`${page}: stray } in a <style> block, line ${scan.line} of the block`);
      assert.equal(scan.depth, 0, `${page}: ${scan.depth} unclosed { in a <style> block — line(s) ${scan.unclosed.join(", ")} of the block`);
      checked += 1;
    }
  }
  assert.ok(checked >= 5, `expected inline <style> blocks to check, found ${checked}`);
});

test("the sample sheet and the phone header rules sit at the top level, not inside a narrower query", () => {
  // The exact shape of the regression: these blocks parsed, but only below
  // 420px. Depth 0 at their opening brace is what makes them apply at all.
  const depthAt = (needle) => {
    const at = studio.indexOf(needle);
    assert.notEqual(at, -1, `${needle} missing from studio.css`);
    return braceScan(studio.slice(0, at)).depth;
  };
  assert.equal(depthAt(".studio-sheet {"), 0, ".studio-sheet is nested inside another block");
  assert.equal(depthAt("@media (max-width: 900px) {"), 0, "the phone breakpoint is nested inside another block");
  assert.equal(depthAt(".draft-status-short { display: none; }"), 0, "the header status rules are nested inside another block");
});
