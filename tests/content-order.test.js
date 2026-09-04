const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const { move } = require(path.join(root, "assets/content-order.js"));

test("moves an item to an earlier exact index", () => {
  assert.deepEqual(move(["course", "photo", "dinner"], 1, 0), ["photo", "course", "dinner"]);
});

test("moves an item to a later exact index", () => {
  assert.deepEqual(move(["course", "photo", "dinner"], 0, 2), ["photo", "dinner", "course"]);
});

test("moves an item to the first and last valid positions", () => {
  const items = ["first", "middle", "last"];

  assert.deepEqual(move(items, 2, 0), ["last", "first", "middle"]);
  assert.deepEqual(move(items, 0, 2), ["middle", "last", "first"]);
});

test("returns an unchanged shallow copy for invalid moves", () => {
  const items = ["course", "photo"];
  const invalidMoves = [
    [0, 0],
    [0, 9],
    [-1, 0],
    [0, -1],
    [0.5, 1],
    [0, 1.5],
    ["0", 1],
    [0, null]
  ];

  for (const [fromIndex, toIndex] of invalidMoves) {
    const result = move(items, fromIndex, toIndex);

    assert.deepEqual(result, items);
    assert.notStrictEqual(result, items);
  }
});

test("does not mutate input and preserves unaffected item identities", () => {
  const first = { id: "first" };
  const second = { id: "second" };
  const third = { id: "third" };
  const items = [first, second, third];

  const result = move(items, 0, 2);

  assert.deepEqual(items, [first, second, third]);
  assert.deepEqual(result, [second, third, first]);
  assert.strictEqual(result[0], second);
  assert.strictEqual(result[1], third);
  assert.strictEqual(result[2], first);
});

test("loads before app.js and exposes the browser global", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const contentOrderScript = index.indexOf('src="assets/content-order.js"');
  const appScript = index.indexOf('src="assets/app.js"');

  assert.ok(contentOrderScript >= 0);
  assert.ok(contentOrderScript < appScript);
  assert.strictEqual(globalThis.ContentOrder.move, move);
});
