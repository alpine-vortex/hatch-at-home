// turnPick (a line said once a day, in turns) and _fresh (never the same line twice
// running), fresh-expand E1: node --test tests/js. The card isn't a module: the helpers
// are read from its source.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const src = fs.readFileSync(path.join(__dirname, "..", "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8");
const grab = (re) => src.match(re)[0];
const helpers = [
  grab(/\nconst dayOrdinal = [^\n]*\n/),
  grab(/\nconst turnHash = [\s\S]*?\n\};\n/),
  grab(/\nconst turnOrder = [\s\S]*?\n\};\n/),
  grab(/\nfunction turnPick\([\s\S]*?\n\}\n/),
].join("");
const fresh = grab(/\n {2}_fresh\(s, key, list\) \{[\s\S]*?\n {2}\}\n/);
const lines = grab(/\n {2}_lines\(s, key, normal, arg, [\s\S]*?\n {2}\}\n/);
const ctx = {};
vm.runInNewContext(`const pick = (list) => list[Math.floor(Math.random() * list.length)];
  ${helpers}
  class Card { ${fresh} ${lines} _babySet() { return null; } _persona(s) { return s.persona; } }
  this.turnPick = turnPick; this.dayOrdinal = dayOrdinal; this.Card = Card;`, ctx);
const { turnPick, Card } = ctx;

const day = (i) => new Date(2026, 10, 1 + i, 12);
const LISTS = [["a", "b"], ["a", "b", "c"], ["a", "b", "c", "d", "e"], Array.from({ length: 12 }, (_, i) => `l${i}`)];

test("n days in a row give n different picks, wherever the run starts", () => {
  for (const list of LISTS) {
    for (const salt of ["dev1|wake", "dev2|wake", "x"]) {
      for (let start = 0; start < 3 * list.length; start++) {
        // A run aligned to a cycle holds every line once; any run of n never has a line twice in a row.
        const run = Array.from({ length: list.length }, (_, i) => turnPick(list, salt, day(start + i)));
        for (let i = 1; i < run.length; i++) assert.notStrictEqual(run[i], run[i - 1], `${salt} ${list.length} @${start}`);
      }
    }
  }
});

test("each cycle holds every line once", () => {
  for (const list of LISTS) {
    const n = list.length;
    let first = 0;
    while (ctx.dayOrdinal(day(first)) % n) first++;
    for (let c = 0; c < 6; c++) {
      const picks = Array.from({ length: n }, (_, i) => turnPick(list, "pet|key", day(first + c * n + i)));
      assert.deepStrictEqual([...picks].sort(), [...list].sort(), `cycle ${c} of ${n}`);
    }
  }
});

test("two salts don't match on every day of a cycle", () => {
  const list = ["a", "b", "c", "d", "e"];
  for (let c = 0; c < 10; c++) {
    const a = Array.from({ length: 5 }, (_, i) => turnPick(list, "dev-a|wake", day(c * 5 + i)));
    const b = Array.from({ length: 5 }, (_, i) => turnPick(list, "dev-b|wake", day(c * 5 + i)));
    assert.notDeepStrictEqual(a, b, `cycle ${c}`);
  }
});

test("the same salt and day give the same pick from a fresh process", () => {
  const list = ["a", "b", "c", "d", "e", "f", "g"];
  const here = Array.from({ length: 14 }, (_, i) => turnPick(list, "dev|wish|play", day(i)));
  const there = JSON.parse(execFileSync(process.execPath, ["-e", `
    const vm = require("vm"); const ctx = {};
    vm.runInNewContext(${JSON.stringify(helpers)} + "; this.turnPick = turnPick;", ctx);
    const list = ${JSON.stringify(list)};
    console.log(JSON.stringify(Array.from({ length: 14 }, (_, i) => ctx.turnPick(list, "dev|wish|play", new Date(2026, 10, 1 + i, 12)))));
  `]).toString());
  assert.deepStrictEqual(here, there);
});

test("a DST day is still one day", () => {
  const list = ["a", "b", "c"];
  // Morning and night of the same date pick the same, across the November change.
  for (let i = 0; i < 10; i++) {
    const am = new Date(2026, 10, 1 + i, 0, 30);
    const pm = new Date(2026, 10, 1 + i, 23, 30);
    assert.strictEqual(turnPick(list, "s", am), turnPick(list, "s", pm));
  }
});

test("_fresh never repeats twice in a row over 200 picks", () => {
  const card = new Card();
  const s = {};
  const list = ["a", "b", "c"];
  let last = null;
  for (let i = 0; i < 200; i++) {
    const line = card._fresh(s, "pat", list);
    assert.notStrictEqual(line, last);
    last = line;
  }
  assert.strictEqual(card._fresh(s, "one", ["only"]), "only");
  assert.strictEqual(card._fresh(s, "one", ["only"]), "only");
});

test("_lines with fresh never says the same text twice running", () => {
  const card = new Card();
  const s = { persona: { pat: ["mm, right there ♪", "*melts a little* ahh ♥"] } };
  let last = null;
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const { text } = card._lines(s, "pat", "hehe ♥", undefined, { fresh: true });
    assert.notStrictEqual(text, last, `pick ${i}`);
    seen.add(text);
    last = text;
  }
  assert.strictEqual(seen.size, 3);
});
