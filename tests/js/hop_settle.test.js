// Hop of the Day ship 3b's pure parts (src/card/card-board.js): what the card does with each
// `settle` reply (plan ship 3b, the reply table, P1 and P8), the row's state, and the day.
// The behaviour on a screen is scripts/card-check.js's `board` section.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const ctx = {};
vm.runInNewContext(`${read("src/card/hop-engine.js")}\nclass HatchPetCardGames {}\n${read("src/card/card-board.js")}\n` +
  "this.outcome = hopSettleOutcome; this.rowState = hopRowState; this.today = hopToday; this.COPY = HOP_COPY;", ctx);
const plain = (x) => JSON.parse(JSON.stringify(x));
const out = (reply, game = { tidy: false }) => plain(ctx.outcome(reply, game));
const ok = (over) => ({ result: "ok", won: true, tidy: false, paid: true, found: false, already: false, ...over });

test("ok: the list is cleared, the server has it, and the day's tidy is the reply's OR the card's (P1)", () => {
  assert.deepStrictEqual(out(ok()), { kind: "ok", clear: true, reload: false, settled: true, found: false,
    refusal: null, warn: null, tidy: false });
  assert.strictEqual(out(ok({ tidy: true, paid: false, found: true })).tidy, true);
  assert.strictEqual(out(ok({ tidy: true, paid: false, found: true })).found, true);
});

test("ok: `already` is never read (D2): a tidy list with nothing to find is tidy all the same", () => {
  const o = out(ok({ tidy: true, paid: false, found: false, already: true }));
  assert.strictEqual(o.tidy, true);
  assert.strictEqual(o.found, false);
  assert.strictEqual(o.settled, true);
  // and `already: true` alone does not make a plain list tidy
  assert.strictEqual(out(ok({ tidy: false, paid: false, already: true })).tidy, false);
});

test("ok: a plain list after a tidy day leaves the day tidy (P1: never lowered)", () => {
  const o = out(ok({ tidy: false, paid: false, already: true }), { tidy: true });
  assert.strictEqual(o.tidy, true);
  assert.strictEqual(o.settled, true);
});

test("board_changed: the list goes and the board is loaded again", () => {
  const o = out({ result: "board_changed" });
  assert.strictEqual(o.kind, "reload");
  assert.strictEqual(o.reload, true);
  assert.strictEqual(o.clear, true);
  assert.strictEqual(o.settled, false);
  assert.strictEqual(o.warn, null);
});

test("egg and asleep: the list is kept and the refusal is said, nothing is warned", () => {
  for (const result of ["egg", "asleep"]) {
    const o = out({ result });
    assert.deepStrictEqual([o.kind, o.clear, o.settled, o.refusal, o.warn], ["refused", false, false, result, null]);
  }
});

test("illegal, not_won, too_long, a thrown call and a reply with no result: kept, \"hmm\", one warning", () => {
  for (const result of ["illegal", "not_won", "too_long"]) {
    const o = out({ result });
    assert.deepStrictEqual([o.kind, o.clear, o.settled, o.refusal, o.reload], ["failed", false, false, null, false]);
    assert.deepStrictEqual(o.warn, { code: result });
  }
  assert.deepStrictEqual(out({ result: "illegal", bad_index: 7 }).warn, { code: "illegal", bad_index: 7 });
  assert.deepStrictEqual(out({ result: "thrown" }).warn, { code: "thrown" });
  assert.deepStrictEqual(out(undefined).warn, { code: "no_reply" });
  assert.deepStrictEqual(out(null).warn, { code: "no_reply" });
  assert.deepStrictEqual(out({ result: "too_tired" }).warn, { code: "unknown" }); // Decided 17: never sent
  assert.strictEqual(ctx.COPY.failed, "hmm, that didn't work");
});

test("no refusal changes the day's tidy, and the warning never names the move list", () => {
  for (const reply of [{ result: "asleep" }, { result: "illegal", bad_index: 3, moves: "abc" }, null]) {
    assert.strictEqual(out(reply, { tidy: true }).tidy, true);
    assert.strictEqual(out(reply, { tidy: false }).tidy, false);
    assert.doesNotMatch(JSON.stringify(out(reply).warn), /abc/);
  }
});

test("the row: open, solved, tidy from the records that know today; another day says nothing", () => {
  const day = "2026-11-03";
  const st = (...records) => ctx.rowState(records, day);
  assert.strictEqual(st(undefined, undefined), "open");
  assert.strictEqual(st({ day, stage: "child", done: false, tidy: false }), "open");
  assert.strictEqual(st({ day, done: true, tidy: false }), "solved");
  assert.strictEqual(st({ day, done: true, tidy: true }), "tidy");
  assert.strictEqual(st({ day: "2026-11-02", done: true, tidy: true }), "open"); // a stale day
  assert.strictEqual(st({}), "open"); // a new egg: {}
  assert.strictEqual(st({ day: "2026-11-02", done: true, tidy: true }, { day, done: true, tidy: false }), "solved");
  assert.strictEqual(st({ day, done: true, tidy: false }, { day, done: true, tidy: true }), "tidy"); // never lowered
  assert.strictEqual(ctx.COPY.rowState.open, "Hop of the Day");
});

test("today: the date in HA's time zone, else this device's; an unknown zone does not throw (Q1)", () => {
  const now = new Date("2026-11-03T23:30:00Z");
  assert.strictEqual(ctx.today("Pacific/Auckland", now), "2026-11-04");
  assert.strictEqual(ctx.today("America/Los_Angeles", now), "2026-11-03");
  assert.match(ctx.today("Not/AZone", now), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(ctx.today(undefined, now), /^\d{4}-\d{2}-\d{2}$/);
});
