// Board mode's pure parts (src/card/card-board.js, Hop of the Day ship 2b): which key names
// which move, and what the part must not do (a `.pet` class, a new line of copy, a `s.board`).
// The behaviour on a screen is scripts/card-check.js's `board` section and the bench's.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const engine = read("src/card/hop-engine.js");
const part = read("src/card/card-board.js");
const src = require("./card-source");
const { boards } = JSON.parse(read("tests/fixtures/hop_cases.json"));

// The class on its own, over an empty base: its methods that touch no DOM.
const ctx = {};
vm.runInNewContext(`${engine}\nclass HatchPetCardGames {}\n${part}\nthis.Board = HatchPetCardBoard; this.COPY = HOP_COPY;\n` +
  "this.KEYS = HOP_KEYS; this.DIRS = HOP_DIRS; this.H = HATCH_HOP;", ctx);
const card = new ctx.Board();
const H = ctx.H;
const plain = (x) => JSON.parse(JSON.stringify(x)); // across the vm's realm
const gameOf = (name) => {
  const b = boards[name];
  const board = { w: b.w, h: b.h, grid: b.grid, family: b.family, specials: b.specials };
  return { board, st: H.start(board), moves: [] };
};

test("the part sits between card-games and card-season, which extends it", () => {
  const manifest = read("src/card/manifest.txt").split("\n");
  assert.strictEqual(manifest.indexOf("card-board.js"), manifest.indexOf("card-games.js") + 1);
  assert.strictEqual(manifest.indexOf("card-season.js"), manifest.indexOf("card-board.js") + 1);
  assert.match(read("src/card/card-season.js"), /^class HatchPetCardSeason extends HatchPetCardBoard \{/);
  assert.match(src, /class HatchPetCardBoard extends HatchPetCardGames/);
});

test("the board is s.game, not a new flag", () => {
  assert.doesNotMatch(part, /\bs\.board\b/);
  assert.match(part, /s\.game = \{ kind: "hop"/);
});

test("the piece is not a .pet class: no .pet animation rule and no go-left or go-right for the board", () => {
  assert.doesNotMatch(part, /pet\.classList\.add/);
  assert.doesNotMatch(part, /_animate\(/);
});

test("experimental_hop is read from the YAML config only", () => {
  assert.strictEqual(card._hopOn.call({ _config: {} }), false);
  assert.strictEqual(card._hopOn.call({ _config: { experimental_hop: true } }), true);
  assert.strictEqual(card._hopOn.call({ _config: { experimental_hop: "yes" } }), false);
  assert.doesNotMatch(read("src/card/editor.js"), /experimental_hop/);
  assert.doesNotMatch(read("src/card/card-base.js"), /getStubConfig\(\) \{\s*return \{[^}]*experimental_hop/);
});

test("the copy is the plan's drafts, and the keys carry their aria labels", () => {
  assert.strictEqual(ctx.COPY.row, "Hop of the Day");
  assert.strictEqual(ctx.COPY.rowAria, "Play Hop of the Day");
  assert.deepStrictEqual(plain(ctx.COPY.step),
    { left: "Step left", up: "Step up", down: "Step down", right: "Step right" });
  assert.strictEqual(ctx.COPY.special(2), "Special move, 2 left");
  assert.strictEqual(ctx.COPY.restart, "Start the board again");
  assert.deepStrictEqual(plain(ctx.KEYS.map((k) => k[2])), ["Step left", "Step up", "Step down", "Step right",
    "Special move, 0 left", "Take back the last move", "Start the board again"]);
});

test("the directions are the engine's STEPS: left, up, down, right", () => {
  assert.deepStrictEqual(plain(ctx.DIRS.map((d) => [d[1], d[2]])), [[0, -1], [-1, 0], [1, 0], [0, 1]]);
});

test("a step and a special are told apart by the use it costs (hop: the jump over)", () => {
  const g = gameOf("hop2"); // P at the start, 2 uses
  const t = card._hopTargets(g);
  for (const c of t.plain) assert.strictEqual(H.apply(g.board, g.st, c).uses, g.st.uses);
  for (const c of t.special) assert.strictEqual(H.apply(g.board, g.st, c).uses, g.st.uses - 1);
  assert.deepStrictEqual([...t.plain, ...t.special].sort((a, b) => a - b), plain(H.legalTargets(g.board, g.st)));
});

test("a special's key is its straight direction; a glide's diagonal has none (it is tapped)", () => {
  const g = gameOf("glide2");
  const { special } = card._hopTargets(g);
  assert.ok(special.length > 0);
  for (const c of special) assert.strictEqual(card._hopSpecialDir(g, c), null);
  const h = gameOf("hop2");
  const jump = card._hopTargets(h).special;
  for (const c of jump) assert.ok(["left", "up", "down", "right"].includes(card._hopSpecialDir(h, c)));
});

test("one step in a direction stays on the board", () => {
  const g = gameOf("sample"); // 5 x 4, P at r (row 3, column 2)
  assert.strictEqual(g.st.pos, 17);
  const [left, up, down, right] = ctx.DIRS.map((d) => card._hopAdjacent(g, d));
  assert.deepStrictEqual([left, up, down, right], [16, 12, -1, 18]);
  g.st = { ...g.st, pos: 0 };
  assert.deepStrictEqual(plain(ctx.DIRS.map((d) => card._hopAdjacent(g, d))), [-1, -1, 5, 1]);
});
