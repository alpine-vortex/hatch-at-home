// Art S3: the snack scene's food pool. node --test tests/js. The real _snackArt runs against a stub
// card with a scripted Math.random.
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");

const src = require("./card-source");
const grab = (re) => {
  const m = src.match(re);
  assert.ok(m, `not in the card: ${re}`);
  return m[0];
};
const method = (name) => grab(new RegExp(`\\n  ${name}\\([^\\n]*\\{\\n[\\s\\S]*?\\n  \\}\\n`));

const env = { rolls: [], calls: 0, fallback: 0.5 };
const ctx = { env };
vm.runInNewContext([
  grab(/\nconst FOODS = \[[^\]]*\];\n/),
  grab(/\nconst FOOD_ODDS = [^\n]*\n/),
  "const Math = Object.create(globalThis.Math, { random: { value: () => { env.calls++; return env.rolls.length ? env.rolls.shift() : env.fallback; } } });",
  `class Card {${method("_snackArt")}}`,
  "this.out = { Card, FOODS, FOOD_ODDS };",
].join("\n"), ctx);
const { Card, FOODS, FOOD_ODDS } = ctx.out;
const card = new Card();
const reset = (rolls = [], fallback = 0.5) => Object.assign(env, { rolls, calls: 0, fallback });

test("twelve unique foods, none a season_ name", () => {
  assert.strictEqual(FOODS.length, 12);
  assert.strictEqual(new Set(FOODS).size, 12);
  for (const f of FOODS) assert.ok(!f.startsWith("season_"), f);
  assert.strictEqual(FOOD_ODDS, 1 / 3);
});

test("a season's candy beats a food, and draws nothing", () => {
  reset();
  const s = { pinFood: "tart" };
  assert.strictEqual(card._snackArt(s, { key: "halloween", snack: "candy" }), "../ui/season_halloween_candy");
  assert.strictEqual(env.calls, 0);
});

test("a pinned name is that food; unknown or none is no food", () => {
  reset();
  assert.strictEqual(card._snackArt({ pinFood: "cocoa" }, null), "../ui/food_cocoa");
  assert.strictEqual(card._snackArt({ pinFood: "none" }, null), null);
  assert.strictEqual(env.calls, 0);
});

test("odds 0 never gives a food, odds 1 always does (the roll is below FOOD_ODDS)", () => {
  reset([], 0.34); // just above 1/3
  for (let i = 0; i < 50; i++) assert.strictEqual(card._snackArt({}, null), null);
  reset([], 0.33);
  for (let i = 0; i < 50; i++) assert.match(card._snackArt({}, null), /^\.\.\/ui\/food_[a-z_]+$/);
});

test("never the same food twice in a row", () => {
  const s = {};
  let last = null;
  for (let i = 0; i < 300; i++) {
    reset([0, Math.random()]);
    const art = card._snackArt(s, null);
    assert.ok(art && art !== last, `${art} after ${last}`);
    assert.strictEqual(s.lastFood, art.split("food_")[1]);
    last = art;
  }
});

test('pinFood:"none" makes no Math.random call', () => {
  reset();
  assert.strictEqual(card._snackArt({ pinFood: "none" }, null), null);
  assert.strictEqual(env.calls, 0);
});
