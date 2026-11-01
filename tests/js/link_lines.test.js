// The infrared link's lines (2b, docs/plan-2026-11-01-kindred-pairs.md): PERSONA's
// link_host / link_guest / link_kindred, BABY's link_host / link_guest, and KINDRED.
// The card isn't a module: the tables are read from its source. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8");
const slice = (from, to) => {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `${from} .. ${to}`);
  return src.slice(a, b);
};
const ctx = {};
vm.runInNewContext(`${slice("const BABY = {", "\n};\n")}\n};\n${slice("const PERSONA = {", "const FRIEND_WELCOME_MS")}
this.BABY = BABY; this.PERSONA = PERSONA; this.KINDRED = KINDRED; this.KINDRED_ODDS = KINDRED_ODDS;`, ctx);
const { BABY, PERSONA, KINDRED, KINDRED_ODDS } = ctx;

const TYPES = ["mellow", "sweet", "bouncy", "starry", "old_soul", "fancy", "charming", "plucky"];
const NAME = "Zephyr";
const say = (line) => (typeof line === "function" ? line(NAME) : line);
// The no-nagging scan (experience §5, personality plan): no "!!", no question, no banned word.
const BANNED = ["still", "again", "why", "never", "pleas", "sad", "cry", "alone", "forgot"];
function scan(text, where) {
  assert.ok(!text.includes("!!"), `${where}: "!!" in ${text}`);
  assert.ok(!text.includes("?"), `${where}: "?" in ${text}`);
  assert.ok(!/[{}]/.test(text) && !text.includes("undefined"), `${where}: a raw placeholder in ${text}`);
  for (const w of BANNED) assert.ok(!text.toLowerCase().includes(w), `${where}: "${w}" in ${text}`);
}

test("every type has 2 host lines, 1 guest reply and 2 kindred extras", () => {
  assert.deepStrictEqual(Object.keys(PERSONA).sort(), [...TYPES].sort());
  for (const t of TYPES) {
    assert.strictEqual(PERSONA[t].link_host.length, 2, t);
    assert.strictEqual(PERSONA[t].link_guest.length, 1, t);
    assert.strictEqual(PERSONA[t].link_kindred.length, 2, t);
  }
});

test("host and guest lines are functions that say the other pet's name", () => {
  for (const t of TYPES) {
    for (const key of ["link_host", "link_guest"]) {
      for (const line of PERSONA[t][key]) {
        assert.strictEqual(typeof line, "function", `${t}.${key}`);
        assert.ok(line(NAME).includes(NAME), `${t}.${key}: ${line(NAME)}`);
      }
    }
  }
  for (const key of ["link_host", "link_guest"]) {
    for (const stage of ["baby", "child"]) {
      for (const line of BABY[key][stage]) assert.ok(line(NAME).includes(NAME), `${key}.${stage}`);
    }
  }
});

test("baby and child sets: baby 2 host + 1 guest, child 1 + 1, no kindred", () => {
  assert.strictEqual(BABY.link_host.baby.length, 2);
  assert.strictEqual(BABY.link_guest.baby.length, 1);
  assert.strictEqual(BABY.link_host.child.length, 1);
  assert.strictEqual(BABY.link_guest.child.length, 1);
  assert.strictEqual(BABY.link_kindred, undefined);
});

test("45 lines in all, and every one passes the scan", () => {
  const lines = [];
  for (const t of TYPES) for (const key of ["link_host", "link_guest", "link_kindred"]) for (const l of PERSONA[t][key]) lines.push([`${t}.${key}`, say(l)]);
  for (const key of ["link_host", "link_guest"]) for (const stage of ["baby", "child"]) for (const l of BABY[key][stage]) lines.push([`${key}.${stage}`, say(l)]);
  assert.strictEqual(lines.length, 45);
  for (const [where, text] of lines) scan(text, where);
});

test("KINDRED pairs the eight types two by two, both ways", () => {
  assert.deepStrictEqual(Object.keys(KINDRED).sort(), [...TYPES].sort());
  for (const [a, b] of Object.entries(KINDRED)) {
    assert.notStrictEqual(a, b);
    assert.strictEqual(KINDRED[b], a, `${a} <-> ${b}`);
  }
  assert.deepStrictEqual(
    new Set(Object.entries(KINDRED).map(([a, b]) => [a, b].sort().join("+"))),
    new Set(["mellow+sweet", "bouncy+starry", "fancy+old_soul", "charming+plucky"]),
  );
  assert.strictEqual(KINDRED_ODDS, 0.5);
});
