// The basket's reveal lines (plan visitors v2 §7, V-C): node --test tests/js
// The card isn't a module: FIND_LINES, findOf, foundBit and BABY.find are read from its
// source. Every line, over every find that can be revealed (not the gift-only ones) and
// every visitor's own left find, passes the no-nagging scan and fits 40 characters (no
// margin: "the nighthawk left a nighthawk feather ♪" is exactly 40).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FRONTEND = path.join(__dirname, "..", "..", "custom_components", "virtual_pet", "frontend");
const src = fs.readFileSync(path.join(FRONTEND, "hatch-pet-card.js"), "utf8");
const grab = (re) => src.match(re)[0];
const ctx = {};
vm.runInNewContext(`${grab(/\nconst FIND_LINES = \{[\s\S]*?\n\};\n/)}
${grab(/\nconst FOUND_BITS = .*\n/)}
${grab(/\nconst findOf = [\s\S]*?;\n/)}
${grab(/\nconst foundBit = [\s\S]*?\n\};\n/)}
const BABY = ${src.match(/\nconst BABY = (\{[\s\S]*?\n\});/)[1]};
this.FIND_LINES = FIND_LINES; this.findOf = findOf; this.foundBit = foundBit; this.BABY = BABY;
this.FOUND_BITS = FOUND_BITS;`, ctx);
const { FIND_LINES, findOf, foundBit, BABY, FOUND_BITS } = ctx;
const same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b); // vm's arrays are another realm's
const WORLDS = JSON.parse(fs.readFileSync(path.join(FRONTEND, "worlds.json"), "utf8"));

const NAG = /\b(still|again|why|never|pleas\w*|sad|cry|alone|forgot\w*)\b/i;
function scan(line) {
  const bad = [];
  const words = line.toLowerCase().match(/[a-z']+/g) || [];
  if (/!!!/.test(line)) bad.push("!!!");
  if (NAG.test(line)) bad.push("nags");
  if (words.some((w, i) => i > 1 && w === words[i - 1] && w === words[i - 2])) bad.push("three in a row");
  if (line.includes("?")) bad.push("asks");
  if (line.length > 40) bad.push(`${line.length} long`);
  return bad;
}

// Every line the reveal can say: V1 and V2 over each revealable find, V3 over each
// visitor's own left find (the server leaves only that one).
function allLines() {
  const out = [];
  for (const [world, w] of Object.entries(WORLDS)) {
    for (const f of w.finds.filter((x) => !x.gift_only)) {
      for (const fn of [...FIND_LINES.find, ...FIND_LINES.fresh]) out.push(fn(f.a));
    }
    for (const v of w.visitors) {
      if (!v.leaves) continue;
      const f = findOf(WORLDS, world, v.leaves);
      for (const fn of FIND_LINES.left) out.push(fn(f.a, v.name));
    }
  }
  return out;
}

test("the reveal's lines: the plan's words, no nagging, no asking, 40 at most", () => {
  same(FIND_LINES.find.map((fn) => fn("a pine cone")), ["a pine cone! ♪", "look, a pine cone ♪", "ooh, a pine cone~"]);
  same(FIND_LINES.fresh.map((fn) => fn("a pine cone")), ["a pine cone! a new one ✦"]);
  same(FIND_LINES.left.map((fn) => fn("a jay feather", "Steller's jay")), ["the Steller's jay left a jay feather ♪"]);
  const lines = allLines();
  assert.ok(lines.length > 150, `${lines.length} lines`);
  const bad = lines.flatMap((l) => scan(l).map((why) => `"${l}" ${why}`));
  assert.deepStrictEqual(bad, []);
});

test("a baby's reveal: visit's own cheers, no greetings, no new words", () => {
  same(Object.keys(BABY.find), ["baby"]);
  same(BABY.find.baby, ["yay yay!", "hehe!"]);
  for (const l of BABY.find.baby) assert.ok(BABY.visit.baby.includes(l), l);
});

test("the away note's bit: a known find by its own world, else nothing", () => {
  assert.strictEqual(foundBit(WORLDS, { type: "found", id: "pinecone", world: "woodland" }), "found a pine cone");
  assert.strictEqual(foundBit(WORLDS, { type: "found", id: "stardust", world: "nightsky" }), "found some stardust");
  assert.strictEqual(foundBit(WORLDS, { type: "found", id: "pinecone", world: "pond" }), null);
  assert.strictEqual(foundBit(WORLDS, { type: "found", id: "laterfind", world: "woodland" }), null);
  assert.strictEqual(foundBit(WORLDS, null), null);
  assert.strictEqual(FOUND_BITS, 3);
});
