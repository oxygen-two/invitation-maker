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
