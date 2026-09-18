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
