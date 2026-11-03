// Hop of the Day's card engine (src/card/hop-engine.js) against the cases hop.py passes too
// (tests/fixtures/hop_cases.json): node --test tests/js. The part is run on its own, as the
// card loads it, and in the built card's text, so a part out of the manifest shows here.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const part = fs.readFileSync(path.join(ROOT, "src", "card", "hop-engine.js"), "utf8");
const ctx = {};
// A top-level const is not on the context: hand it out at the end.
vm.runInNewContext(`${part}\nthis.HATCH_HOP = HATCH_HOP;`, ctx);
const H = ctx.HATCH_HOP;
const { boards, cases, bad_boards } = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "hop_cases.json"), "utf8"));
const plain = (x) => JSON.parse(JSON.stringify(x)); // across the vm's realm

test("the part is in the built card, before the class chain", () => {
  const src = require("./card-source");
  const at = src.indexOf("const HATCH_HOP = Object.freeze(");
  assert.ok(at > 0);
  assert.ok(at < src.indexOf("class HatchPetCardBase"));
});

test("one frozen namespace, no loose globals", () => {
  const names = Object.keys(vm.runInNewContext(`${part}\nthis`, {}));
  assert.deepStrictEqual(names, []);
  const tops = part.match(/^(?:const|let|var|function|class|async)\b[^\n]*/gm);
  assert.deepStrictEqual(tops, ["const HATCH_HOP = Object.freeze("]);
  assert.ok(Object.isFrozen(H));
});

for (const c of cases) {
  test(`${c.board}: ${c.moves.slice(0, 24) || "(empty)"} — ${c.why}`, () => {
    assert.deepStrictEqual(plain(H.replay(boards[c.board], c.moves)), c.expect);
  });
}

test("each prefix (undo) is a step-by-step apply", () => {
  for (const c of cases) {
    const board = boards[c.board];
    const cells = H.decode(c.moves);
    if (cells === null) continue;
    let state = H.start(board);
    for (let i = 0; i < cells.length; i++) {
      const next = H.apply(board, state, cells[i]);
      const got = plain(H.replay(board, c.moves.slice(0, i + 1)));
      if (!next) {
        assert.strictEqual(got.bad_index, i, `${c.board} ${c.moves}`);
        assert.deepStrictEqual(got.final, plain(H.view(state)));
        break;
      }
      assert.ok(H.legalTargets(board, state).includes(cells[i]));
      assert.deepStrictEqual(got.final, plain(H.view(next)));
      state = next;
    }
  }
});

test("legalTargets names exactly the cells apply takes", () => {
  for (const board of Object.values(boards)) {
    const todo = [H.start(board)];
    const seen = new Set();
    while (todo.length) {
      const s = todo.pop();
      const key = JSON.stringify(s);
      if (seen.has(key)) continue;
      seen.add(key);
      const takes = [];
      for (let t = 0; t < board.w * board.h; t++) if (H.apply(board, s, t)) takes.push(t);
      assert.deepStrictEqual(plain(H.legalTargets(board, s)), takes);
      for (const t of takes) todo.push(H.apply(board, s, t));
    }
  }
});

test("decode and encode", () => {
  assert.deepStrictEqual(plain(H.decode("abx")), [0, 1, 23]);
  assert.deepStrictEqual(plain(H.decode("aY")), [0, -1]);
  assert.strictEqual(H.decode("a".repeat(H.MAX_MOVES + 1)), null);
  assert.strictEqual(H.decode("a".repeat(H.MAX_MOVES)).length, H.MAX_MOVES);
  assert.strictEqual(H.encode([0, 1, 23]), "abx");
});

test("MAX_MOVES is rates.py's HOP_MAX_MOVES", () => {
  const rates = fs.readFileSync(path.join(ROOT, "custom_components", "virtual_pet", "rates.py"), "utf8");
  assert.strictEqual(Number(rates.match(/^HOP_MAX_MOVES = (\d+)/m)[1]), H.MAX_MOVES);
});

test("decode counts letters as code points, as hop.py's len", () => {
  const emoji = "\u{1F600}";
  assert.strictEqual(H.decode(emoji.repeat(H.MAX_MOVES)).length, H.MAX_MOVES);
  assert.deepStrictEqual(plain(H.decode(emoji + "a")), [-1, 0]);
  assert.strictEqual(H.decode(emoji.repeat(H.MAX_MOVES + 1)), null);
});

test("bad boards are refused, and the good ones are not", () => {
  for (const c of bad_boards) assert.strictEqual(H.valid(c.board), false, c.why);
  for (const [name, b] of Object.entries(boards)) assert.strictEqual(H.valid(b), true, name);
  assert.strictEqual(H.valid(null), false);
  assert.strictEqual(H.valid({ ...boards.baby, specials: "0" }), false);
  assert.strictEqual(H.valid({ ...boards.baby, specials: 1.5 }), false);
});

test("a view round-trips to a state (the audit's e, f repro)", () => {
  const b = boards.baby;
  const out = plain(H.replay(b, "ef"));
  assert.deepStrictEqual(out.final.sunk, [4, 8]);
  const s = H.fromView(out.final);
  assert.deepStrictEqual(plain(s), plain(H.apply(b, H.apply(b, H.start(b), 4), 5)));
  assert.deepStrictEqual(plain(H.legalTargets(b, s)), [1, 9]);
  assert.deepStrictEqual(plain(H.view(s)), out.final);
});

test("fromView refuses what is not a view", () => {
  const ok = { pos: 0, sunk: [1], uses: 0, done: false };
  assert.ok(H.fromView(ok));
  const bads = [null, {}, { ...ok, pos: 24 }, { ...ok, pos: -1 }, { ...ok, sunk: [24] }];
  bads.push({ ...ok, sunk: 3 }, { ...ok, uses: -1 }, { ...ok, uses: 1.5 });
  for (const bad of bads) assert.strictEqual(H.fromView(bad), null, JSON.stringify(bad));
});
