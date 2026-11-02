// The plain dreams (fresh-moment 6): node --test tests/js
// model.PLAIN_DREAMS turns through its kinds, one a morning with nothing to dream about;
// each must have a line in the card's DREAMS, read from its source, that passes the
// no-nagging scan, asks nothing and fits a 330 px bubble (40 at most).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PET = path.join(__dirname, "..", "..", "custom_components", "virtual_pet");
const src = fs.readFileSync(path.join(PET, "frontend", "hatch-pet-card.js"), "utf8");
const ctx = {};
vm.runInNewContext(`const short = (t) => t;
${src.match(/\nconst DREAMS = \{[\s\S]*?\n\};\n/)[0]}
this.DREAMS = DREAMS;`, ctx);
const { DREAMS } = ctx;
const model = fs.readFileSync(path.join(PET, "model.py"), "utf8");
const PLAIN = [...model.match(/\nPLAIN_DREAMS = \(([\s\S]*?)\n\)/)[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);

const NAG = /\b(still|again|why|never|pleas\w*|sad|cry|alone|forgot\w*)\b/i;

test("model.PLAIN_DREAMS: 30 kinds, none twice", () => {
  assert.strictEqual(PLAIN.length, 30);
  assert.strictEqual(new Set(PLAIN).size, PLAIN.length);
});

test("every plain dream has a card line: no nagging, no asking, 40 at most", () => {
  const bad = [];
  for (const kind of PLAIN) {
    const line = DREAMS[kind]?.({}, { food: "berries" });
    if (!line) { bad.push(`${kind}: no line`); continue; }
    if (NAG.test(line)) bad.push(`${kind}: nags`);
    if (line.includes("?")) bad.push(`${kind}: asks`);
    if (line.length > 40) bad.push(`${kind}: ${line.length} long`);
  }
  assert.deepStrictEqual(bad, []);
});

test("plain dream lines are all different", () => {
  const lines = PLAIN.map((k) => DREAMS[k]({}, { food: "berries" }));
  assert.strictEqual(new Set(lines).size, lines.length);
});
