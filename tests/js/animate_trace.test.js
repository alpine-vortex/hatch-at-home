// Director migration slice 7 (the _animate helper), the characterization: docs/plan-2026-11-06-director-migration.md 5.7
// and 6.1. R80: _animate(s, el, cls, ms) adds `cls` now (a remove, a reflow and an add, so a running animation restarts)
// and takes it off at `ms`; one timer per element and class, so a second call on the same class restarts it and the first
// call's timer must not take the class off the second (A1: a snack's chews come 300 ms apart). The pet's blanket
// (s.drape) restarts with it unless cls is "lie" or the drape is hidden. This runs on the unmoved code (a bare setTimeout
// and the module's WeakMap on the fake clock) and passes after the move (a keyed, restarting _hold), unchanged.
// The (cls, ms) table is read out of the card's source by regex, so a new caller with a literal class and time is a new row
// with no edit here; a caller whose class or time is computed must be added to DYNAMIC (and the count below) by hand.
// _animate has no calm() of its own (its callers check), so calm changes nothing; both ways are run.
// A forget mid-move is a change (B1), so it is not here: animate_ledger.test.js (the move commit) carries it.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");
const src = require("./card-source");

const short = (log) => log.map((x) => `${x.t} ${x.el} ${x.op}${x.arg === undefined ? "" : ` ${x.arg}`}`);
// The unmoved _animate reads the module's WeakMap; the moved one has no such const, so the world takes it only where it is.
const consts = /\nconst ANIMATE_TIMERS = /.test(src) ? ["ANIMATE_TIMERS"] : [];
const SPEC = { methods: ["_animate"], consts, slide: (el) => ({ drape: el("drape"), gameNum: el("num"), sitterEl: el("sitter") }) };

// ---- the table: every (cls, ms) the card calls _animate with ----

const plain = new Map();
for (const m of src.matchAll(/this\._animate\(\w+, [\w.]+, "([\w-]+)", (\d+)\)/g)) plain.set(`${m[1]} ${m[2]}`, [m[1], Number(m[2])]);
// Computed class or time: the literal choices at each site (a ternary reads both), by hand.
const DYNAMIC = [
  ["breath-long", 1600], ["breath", 1000], ["rock2", 1250], ["bighop", 1400], ["greethop", 1400], ["flip", 500],
  ["flip", 250], ["perk", 320], ["jump", 800], ["pat-soft", 300], ["spin", 900], ["rock2", 1200], ["rock", 600],
  ["lands", 1000], ["lands-more", 1000], ["settle", 2500], ["fade", 200],
];
// The call sites that are not a literal pair (card-care 329 and 516, card-games 329, card-moment 222 and 238, card-season
// 383, card-sitter 154, card-tick 409, 410, 446, 773, 782 and 1041, card-visitors 370).
const DYNAMIC_SITES = 14;
const ROWS = [...plain.values(), ...DYNAMIC.filter(([c, ms]) => !plain.has(`${c} ${ms}`))];

test("the table is read from the source: every call site is a literal row or one of the listed computed ones", () => {
  const all = [...src.matchAll(/this\._animate\(/g)].length;
  const literal = [...src.matchAll(/this\._animate\(\w+, [\w.]+, "[\w-]+", \d+\)/g)].length;
  assert.strictEqual(all - literal, DYNAMIC_SITES, "a new computed caller is a new case here: add its choices to DYNAMIC");
  assert.ok(ROWS.length >= 25, `only ${ROWS.length} rows`);
  for (const [cls, ms] of ROWS) assert.ok(cls && ms > 0, `${cls} ${ms}`);
});

const cls = (w) => [...w.slide.pet.cls].sort();
const onPet = (log, c) => short(log).filter((x) => x.startsWith(`${x.split(" ")[0]} pet `) && (x.endsWith(` ${c}`) || x.endsWith("reflow")));

test("each row: the class goes on at 0 (remove, reflow, add) and off at ms; calm changes nothing", () => {
  for (const calm of [false, true]) {
    for (const [c, ms] of ROWS) {
      const w = world(SPEC);
      w.calm = calm;
      w.card._animate(w.slide, w.slide.pet, c, ms);
      w.advance(ms - 1);
      assert.deepStrictEqual(cls(w), [c], `${c} ${ms} still on at ms - 1`);
      w.advance(1);
      assert.deepStrictEqual(cls(w), [], `${c} ${ms} off at ms`);
      assert.deepStrictEqual(onPet(w.log, c), ["0 pet class- " + c, "0 pet reflow", "0 pet class+ " + c, `${ms} pet class- ${c}`],
        `${c} ${ms}`);
    }
  }
});

test("each row, called again at ms / 2: the class restarts and stays to 1.5 * ms, the first timer takes nothing off (A1)", () => {
  for (const [c, ms] of ROWS) {
    const half = Math.floor(ms / 2);
    const w = world(SPEC);
    w.card._animate(w.slide, w.slide.pet, c, ms);
    w.advance(half);
    w.card._animate(w.slide, w.slide.pet, c, ms);
    w.advance(ms - half); // the first call's end
    assert.deepStrictEqual(cls(w), [c], `${c} ${ms} still on where the first timer would have ended`);
    w.advance(half - 1);
    assert.deepStrictEqual(cls(w), [c], `${c} ${ms} still on at the second one's end - 1`);
    w.advance(1);
    assert.deepStrictEqual(cls(w), [], `${c} ${ms} off at ${half + ms}`);
    assert.deepStrictEqual(onPet(w.log, c), [
      `0 pet class- ${c}`, "0 pet reflow", `0 pet class+ ${c}`,
      `${half} pet class- ${c}`, `${half} pet reflow`, `${half} pet class+ ${c}`,
      `${half + ms} pet class- ${c}`,
    ], `${c} ${ms}`);
  }
});

test("a snack's chews 300 ms apart: the second chew's class is not taken off by the first chew's timer (A1)", () => {
  const w = world(SPEC);
  w.card._animate(w.slide, w.slide.pet, "puff", 450);
  w.advance(300);
  w.card._animate(w.slide, w.slide.pet, "puff", 450);
  w.advance(150);
  assert.deepStrictEqual(cls(w), ["puff"], "at 450, where the first chew would have ended");
  w.advance(299);
  assert.deepStrictEqual(cls(w), ["puff"]);
  w.advance(1);
  assert.deepStrictEqual(cls(w), []);
  assert.deepStrictEqual(short(w.log).filter((x) => x.includes("pet class-")), ["0 pet class- puff", "300 pet class- puff",
    "750 pet class- puff"]);
});

test("a second call after the first has ended is a plain new one; a third inside the second restarts again", () => {
  const w = world(SPEC);
  w.card._animate(w.slide, w.slide.pet, "perk", 320);
  w.advance(400);
  assert.deepStrictEqual(cls(w), []);
  w.card._animate(w.slide, w.slide.pet, "perk", 320);
  w.advance(100);
  w.card._animate(w.slide, w.slide.pet, "perk", 320);
  w.advance(319);
  assert.deepStrictEqual(cls(w), ["perk"]);
  w.advance(1);
  assert.deepStrictEqual(cls(w), []);
  assert.deepStrictEqual(short(w.log).filter((x) => x.includes("pet class-") && !x.startsWith("0")),
    ["320 pet class- perk", "400 pet class- perk", "500 pet class- perk", "820 pet class- perk"]);
});

test("another class on the same element is its own: a restart of one leaves the other's timer alone", () => {
  const w = world(SPEC);
  w.card._animate(w.slide, w.slide.pet, "perk", 320);
  w.advance(100);
  w.card._animate(w.slide, w.slide.pet, "greethop", 1400);
  w.advance(100);
  w.card._animate(w.slide, w.slide.pet, "perk", 320); // 200: perk restarts; greethop is not touched
  assert.deepStrictEqual(cls(w), ["greethop", "perk"]);
  w.advance(319);
  assert.deepStrictEqual(cls(w), ["greethop", "perk"], "perk to 520");
  w.advance(1);
  assert.deepStrictEqual(cls(w), ["greethop"]);
  w.advance(979); // 1499
  assert.deepStrictEqual(cls(w), ["greethop"], "greethop runs to 100 + 1400");
  w.advance(1);
  assert.deepStrictEqual(cls(w), []);
  assert.deepStrictEqual(short(w.log).filter((x) => x.includes("pet class-") && !x.startsWith("0 ")),
    ["100 pet class- greethop", "200 pet class- perk", "520 pet class- perk", "1500 pet class- greethop"]);
});

test("the same class on two elements (the pet and the game number) is two timers", () => {
  const w = world(SPEC);
  w.card._animate(w.slide, w.slide.pet, "flip", 500);
  w.advance(200);
  w.card._animate(w.slide, w.slide.gameNum, "flip", 250);
  w.advance(50);
  assert.deepStrictEqual([[...w.slide.pet.cls], [...w.slide.gameNum.cls]], [["flip"], ["flip"]]);
  w.advance(200); // 450: the number's flip is over at 450, the pet's at 500
  assert.deepStrictEqual([[...w.slide.pet.cls], [...w.slide.gameNum.cls]], [["flip"], []]);
  w.advance(50);
  assert.deepStrictEqual([[...w.slide.pet.cls], [...w.slide.gameNum.cls]], [[], []]);
  assert.deepStrictEqual(short(w.log).filter((x) => /class-/.test(x) && !/^0 /.test(x) && !/^200 /.test(x)),
    ["450 num class- flip", "500 pet class- flip"]);
});

test("a restart of the number's flip leaves the pet's flip timer alone", () => {
  const w = world(SPEC);
  w.card._animate(w.slide, w.slide.pet, "flip", 500);
  w.card._animate(w.slide, w.slide.gameNum, "flip", 250);
  w.advance(100);
  w.card._animate(w.slide, w.slide.gameNum, "flip", 250);
  w.advance(249); // 349
  assert.deepStrictEqual([[...w.slide.pet.cls], [...w.slide.gameNum.cls]], [["flip"], ["flip"]]);
  w.advance(1); // 350: the number's restarted flip is over (it would have been off at 250)
  assert.deepStrictEqual([[...w.slide.pet.cls], [...w.slide.gameNum.cls]], [["flip"], []]);
  w.advance(150);
  assert.deepStrictEqual([[...w.slide.pet.cls], [...w.slide.gameNum.cls]], [[], []], "the pet's flip ends at 500");
});

// ---- the drape mirror ----

const drapeOf = (w) => short(w.log).filter((x) => / drape /.test(x));

test("the pet's blanket gets the class (remove, then add) with the pet; it is not taken off at the end", () => {
  const w = world(SPEC);
  w.card._animate(w.slide, w.slide.pet, "perk", 320);
  w.advance(400);
  assert.deepStrictEqual(drapeOf(w), ["0 drape class- perk", "0 drape class+ perk"]);
  assert.deepStrictEqual([...w.slide.drape.cls], ["perk"], "left to _drapeMirror");
});

test("the blanket restarts with the pet on a second call, and not for the lie squash", () => {
  const w = world(SPEC);
  w.card._animate(w.slide, w.slide.pet, "perk", 320);
  w.advance(160);
  w.card._animate(w.slide, w.slide.pet, "perk", 320);
  assert.deepStrictEqual(drapeOf(w), ["0 drape class- perk", "0 drape class+ perk", "160 drape class- perk", "160 drape class+ perk"]);
  const lie = world(SPEC);
  lie.card._animate(lie.slide, lie.slide.pet, "lie", 300);
  lie.advance(400);
  assert.deepStrictEqual(drapeOf(lie), []);
  assert.deepStrictEqual(short(lie.log).filter((x) => x.includes(" pet class")), ["0 pet class- lie", "0 pet class+ lie", "300 pet class- lie"]);
});

test("no blanket copy: a hidden drape, an element that is not the pet, or no drape at all", () => {
  const hidden = world(SPEC);
  hidden.slide.drape.hidden = true;
  hidden.card._animate(hidden.slide, hidden.slide.pet, "perk", 320);
  assert.deepStrictEqual(drapeOf(hidden), []);
  const other = world(SPEC);
  other.card._animate(other.slide, other.slide.gameNum, "flip", 250);
  other.card._animate(other.slide, other.slide.sitterEl, "fade", 600);
  assert.deepStrictEqual(drapeOf(other), []);
  const none = world({ methods: ["_animate"], consts });
  none.card._animate(none.slide, none.slide.pet, "perk", 320);
  none.advance(400);
  assert.deepStrictEqual(cls(none), []);
});

// ---- the edges ----

test("ms of 0: the class goes on and comes off at the next turn of the clock, at 0", () => {
  const w = world(SPEC);
  w.card._animate(w.slide, w.slide.pet, "perk", 0);
  assert.deepStrictEqual(cls(w), ["perk"], "on until the clock turns");
  w.advance(0);
  assert.deepStrictEqual(cls(w), [], "off at once");
  assert.deepStrictEqual(onPet(w.log, "perk"), ["0 pet class- perk", "0 pet reflow", "0 pet class+ perk", "0 pet class- perk"]);
});

test("an element that left the DOM: the class still comes off at ms, nothing throws", () => {
  const w = world(SPEC);
  w.card._animate(w.slide, w.slide.gameNum, "flip", 250);
  w.slide.gameNum.remove();
  w.advance(250);
  assert.deepStrictEqual([...w.slide.gameNum.cls], []);
  assert.deepStrictEqual(short(w.log).filter((x) => x.startsWith("250 ")), ["250 num class- flip"]);
});

test("called with no slide (G8): the element still gets its class and loses it at ms; no blanket, no throw", () => {
  const w = world(SPEC);
  const el = w.el("loose");
  w.card._animate(undefined, el, "perk", 320);
  assert.deepStrictEqual([...el.cls], ["perk"]);
  w.advance(319);
  assert.deepStrictEqual([...el.cls], ["perk"]);
  w.advance(1);
  assert.deepStrictEqual([...el.cls], []);
  assert.deepStrictEqual(drapeOf(w), []);
});

test("called with no slide, twice: the second restarts and keeps the class to its own end (A1 on the card scope)", () => {
  const w = world(SPEC);
  const el = w.el("loose");
  w.card._animate(undefined, el, "perk", 320);
  w.advance(160);
  w.card._animate(undefined, el, "perk", 320);
  w.advance(160);
  assert.deepStrictEqual([...el.cls], ["perk"], "the first call's end");
  w.advance(159);
  assert.deepStrictEqual([...el.cls], ["perk"]);
  w.advance(1);
  assert.deepStrictEqual([...el.cls], []);
});

test("a slide that is not the element's own (the link's guest image on the host's slide) is just an element", () => {
  const w = world(SPEC);
  const img = w.el("img");
  w.card._animate(w.slide, img, "greethop", 1400);
  w.advance(1400);
  assert.deepStrictEqual(short(w.log).filter((x) => x.startsWith("img ") || / img /.test(x)),
    ["0 img class- greethop", "0 img reflow", "0 img class+ greethop", "1400 img class- greethop"]);
  assert.deepStrictEqual(drapeOf(w), []);
});

test("D-keep: a disconnect ends no move; the class goes off on time", () => {
  const w = world(SPEC);
  w.card._animate(w.slide, w.slide.pet, "greethop", 1400);
  w.advance(100);
  w.disconnect();
  w.advance(1300);
  assert.deepStrictEqual(cls(w), []);
  assert.ok(short(w.log).includes("1400 pet class- greethop"));
});
