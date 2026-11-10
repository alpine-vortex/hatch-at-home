// Regression tests for small card fixes: _flair with no life_stage, and _dayBits newest-first.
// (The _modeKey letter case and the crate idleHold are in shell_modes.test.js.)
// node --test tests/js.
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");

const src = require("./card-source");
const method = (name) => src.match(new RegExp(`\\n {2}${name}\\([^)]*\\) \\{[\\s\\S]*?\\n {2}\\}\\n`))[0];

test("_flair: a missing life_stage shows nothing, a stage with no traits shows nothing", () => {
  const ctx = { FLAIR: { brave: { place: "head" } }, Date };
  vm.runInNewContext(`class C {${method("_flair")}}; this.C = C;`, ctx);
  const card = new ctx.C();
  const s = { species: "x" };
  card._state = () => undefined;
  assert.deepStrictEqual([...card._flair(s, "brave")], [], "no life_stage sensor");
  card._state = () => ({ state: "egg", attributes: {} });
  assert.deepStrictEqual([...card._flair(s, "brave")], [], "an egg");
  card._state = () => ({ state: "adult", attributes: {} });
  assert.deepStrictEqual([...card._flair(s)], [], "no traits");
});

test("_dayBits: bits come newest first (the sensor lists its moments and log newest first)", () => {
  const ctx = {
    HOUSE_LINES: { bits: { robot: "met the robot", machine: "heard the machine" } },
    HOUSE_CATEGORY: {}, HOUSE_REQUEST: {}, SEASON_START_BITS: {}, SITTER_ROWS: {},
    FOUND_BITS: 3, findsShown: () => false, foundBit: () => null, Date,
  };
  vm.runInNewContext(`class C {${method("_dayBits")}}; this.C = C;`, ctx);
  const card = new ctx.C();
  const at = (m) => new Date(Date.UTC(2026, 10, 10, 12, m)).toISOString();
  const attributes = {
    moments: [{ type: "sunset", at: at(30) }, { type: "news", at: at(20) }, { type: "watching", at: at(10) },
      { type: "news", at: at(5) }, { type: "tv_on", at: at(1) }],
    log: [{ action: "feed", result: "ok", at: at(40) }, { action: "play", result: "ok", at: at(35) },
      { action: "clean", result: "refused", at: at(34) }, { action: "game", result: "won", at: at(33) }],
  };
  card._state = () => ({ attributes });
  const since = Date.UTC(2026, 10, 10, 12, 0);
  // moments first (newest first, a repeat once), then care (newest first)
  assert.deepStrictEqual([...card._dayBits({}, since)],
    ["watched the sunset", "heard some news", "watched TV", "had a meal", "played", "played a game"]);
  assert.deepStrictEqual([...card._dayBits({}, since, false)], ["watched the sunset", "heard some news", "watched TV"]);
  // "since" filters out the older ones
  assert.deepStrictEqual([...card._dayBits({}, Date.UTC(2026, 10, 10, 12, 25), false)], ["watched the sunset"]);
});
