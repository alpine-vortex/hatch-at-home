// Crate push's card engine (src/card/crate-push-engine.js) against the cases crate_push.py passes too
// (tests/fixtures/crate_push_cases.json): node --test tests/js. The part is run on its own, as the card loads
// it, and in the built card's text, so a part out of the manifest shows here.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const part = fs.readFileSync(path.join(ROOT, "src", "card", "crate-push-engine.js"), "utf8");
const ctx = {};
vm.runInNewContext(`${part}\nthis.HATCH_CRATE_PUSH = HATCH_CRATE_PUSH;`, ctx);
const S = ctx.HATCH_CRATE_PUSH;
const { boards, cases, bad_boards } = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "crate_push_cases.json"), "utf8"));
const plain = (x) => JSON.parse(JSON.stringify(x)); // across the vm's realm

test("the part is in the built card, before the class chain", () => {
  const src = require("./card-source");
  const at = src.indexOf("const HATCH_CRATE_PUSH = Object.freeze(");
  assert.ok(at > 0);
  assert.ok(at < src.indexOf("class HatchPetCardBase"));
});

test("one frozen namespace, no loose globals", () => {
  const names = Object.keys(vm.runInNewContext(`${part}\nthis`, {}));
  assert.deepStrictEqual(names, []);
  const tops = part.match(/^(?:const|let|var|function|class|async)\b[^\n]*/gm);
  assert.deepStrictEqual(tops, ["const HATCH_CRATE_PUSH = Object.freeze("]);
  assert.ok(Object.isFrozen(S));
});

for (const c of cases) {
  test(`${c.board}: ${c.moves.slice(0, 24) || "(empty)"} — ${c.why}`, () => {
    assert.deepStrictEqual(plain(S.replay(boards[c.board], c.moves)), c.expect);
  });
}

test("each prefix (undo) is a step-by-step apply", () => {
  for (const c of cases) {
    if (!c.expect.legal || c.moves.length > 40) continue;
    const board = boards[c.board];
    let state = S.start(board);
    for (let i = 0; i < c.moves.length; i++) {
      state = S.apply(board, state, c.moves[i]);
      assert.ok(state, `${c.board} ${c.moves}: move ${i} applies`);
      assert.deepStrictEqual(plain(S.replay(board, c.moves.slice(0, i + 1)).final), plain(state), `${c.board} prefix ${i + 1}`);
    }
  }
});

test("valid boards are valid, bad ones are not", () => {
  for (const [name, b] of Object.entries(boards)) assert.ok(S.valid(b), name);
  for (const [name, b] of Object.entries(bad_boards)) assert.ok(!S.valid(b), name);
  assert.ok(!S.valid(null));
});

test("legalMoves lists the letters that apply", () => {
  const b = boards.wall;
  assert.deepStrictEqual(plain(S.legalMoves(b, S.start(b))), ["d"]);
});
