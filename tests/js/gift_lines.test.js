// The gift's lines (plan visitors v2 §5, §7 V5-V7, §13b #3; V-E2): node --test tests/js
// The card isn't a module: GIFT_MADE, GIFT_LINES and BABY.gift are read from its source.
// V5 names every ordinary find (by `name`: "saved this message in a bottle for you ♥" is
// exactly 40, so the cap has no margin); V6 is for the six gift-only finds, "made" for
// those in GIFT_MADE and "found" for the rest; V7 is the baby's. All pass the no-nagging scan.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FRONTEND = path.join(__dirname, "..", "..", "custom_components", "virtual_pet", "frontend");
const src = require("./card-source");
const grab = (re) => src.match(re)[0];
const ctx = {};
vm.runInNewContext(`${grab(/\nconst GIFT_MADE = .*\n/)}
${grab(/\nconst GIFT_LINES = \{[\s\S]*?\n\};\n/)}
const BABY = ${src.match(/\nconst BABY = (\{[\s\S]*?\n\});/)[1]};
this.GIFT_MADE = GIFT_MADE; this.GIFT_LINES = GIFT_LINES; this.BABY = BABY;`, ctx);
const { GIFT_MADE, GIFT_LINES, BABY } = ctx;
const WORLDS = JSON.parse(fs.readFileSync(path.join(FRONTEND, "worlds.json"), "utf8"));
const finds = Object.values(WORLDS).flatMap((w) => w.finds || []);
const giftOnly = finds.filter((f) => f.gift_only).map((f) => f.id);

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

test("GIFT_MADE names gift-only finds, and made plus found covers all six", () => {
  assert.strictEqual(giftOnly.length, 6);
  for (const id of GIFT_MADE) assert.ok(giftOnly.includes(id), `${id} isn't a gift-only find`);
  assert.deepStrictEqual([...GIFT_MADE].sort(), ["acorncup", "knittedheart", "paperboat"]);
  const found = giftOnly.filter((id) => !GIFT_MADE.includes(id)).sort();
  assert.deepStrictEqual(found, ["pearl", "pressedfern", "telescope"]);
});

test("V5 over every ordinary find passes the scan and fits 40", () => {
  const lines = finds.filter((f) => !f.gift_only).map((f) => GIFT_LINES.find(f.name));
  assert.ok(lines.length >= 54);
  for (const line of lines) assert.deepStrictEqual(scan(line), [], line);
  assert.strictEqual(Math.max(...lines.map((l) => l.length)), 40); // "message in a bottle"
  assert.strictEqual(GIFT_LINES.find("pine cone"), "saved this pine cone for you ♥");
});

test("V6 and V7 are exactly the approved words", () => {
  assert.strictEqual(GIFT_LINES.made, "made this for you ♥");
  assert.strictEqual(GIFT_LINES.found, "found this for you ♥");
  assert.deepStrictEqual([...BABY.gift.baby], ["for you! ♥"]);
  assert.deepStrictEqual(Object.keys(BABY.gift), ["baby"]);
  for (const line of [GIFT_LINES.made, GIFT_LINES.found, ...BABY.gift.baby]) assert.deepStrictEqual(scan(line), [], line);
});
