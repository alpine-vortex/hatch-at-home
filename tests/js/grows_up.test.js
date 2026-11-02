// The status page's countdown to the next stage (gaps-seams 1a): node --test tests/js
// The card isn't a module: STAGE_DAYS and growsUp are read from its source.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(
  path.join(__dirname, "..", "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8");
const grab = (re) => src.match(re)[0];
const ctx = {};
vm.runInNewContext(`${grab(/\nconst STAGE_DAYS = .*\n/)}
${grab(/\nfunction growsUp\([\s\S]*?\n\}\n/)}
this.growsUp = growsUp;`, ctx);
const { growsUp } = ctx;

test("a teen counts down to grown up, about, in whole days", () => {
  assert.deepStrictEqual([...growsUp("teen", 5.2)], ["grows up", "in about 9 days"]);
  assert.deepStrictEqual([...growsUp("teen", 12.4)], ["grows up", "in about 2 days"]);
  assert.deepStrictEqual([...growsUp("teen", 13.1)], ["grows up", "tomorrow"]);
});

test("a child counts down to teen", () => {
  assert.deepStrictEqual([...growsUp("child", 1.0)], ["next", "teen in about 4 days"]);
  assert.deepStrictEqual([...growsUp("child", 4.2)], ["next", "teen tomorrow"]);
});

test("no row under half a day out, or for an egg, a baby, an adult or no age", () => {
  assert.strictEqual(growsUp("teen", 13.6), null);
  assert.strictEqual(growsUp("teen", 15), null);
  for (const stage of ["egg", "baby", "adult", undefined]) assert.strictEqual(growsUp(stage, 3), null);
  assert.strictEqual(growsUp("teen", undefined), null);
});

test("STAGE_DAYS matches rates.py STAGE_STARTS", () => {
  const rates = fs.readFileSync(
    path.join(__dirname, "..", "..", "custom_components", "virtual_pet", "rates.py"), "utf8");
  for (const [stage, days] of [["teen", 5], ["adult", 14]]) {
    const hours = Number(rates.match(new RegExp(`\\("${stage}", ([\\d.]+)\\)`))[1]);
    assert.strictEqual(hours / 24, days);
  }
});
