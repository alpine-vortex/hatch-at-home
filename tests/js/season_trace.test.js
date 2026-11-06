// Director migration slice 6 (season), the characterization: docs/plan-2026-11-06-director-migration.md 5.6 and 6.1. Each
// trace pins what the player could see for R45 (the treat, 1600 ms after the costume), R46 (the confetti box, 3600), R47
// (the costume box, FLAIR_MS + 1800), R48 (each flyer of a flock, by its lag), R49 (a flyer's removal, ms + 200) and R50
// (the seasonal visit's steps at 1400, 3400 and ms, and what _seasonVisitEnd does). It passes on the unmoved code (bare
// timers on the fake clock) and passes after the move (the same sites through the ledger), unchanged.
// Reduced motion is whatever the unmoved code does (F13, the audit's finding 5): the costume, the treat, the flock and the
// visit run under calm exactly as they do otherwise; only the confetti (`if (calm()) return`), the tick's flyers and the
// look turn at the startle (`ltr && !calm()`) stand down. Pinned, not changed.
// "Called with no slide" (G8) has no case: every site reads s.screen or s.seasonBox first, and every caller passes a slide.
// A forget mid-visit is the closer (3.14): season_ledger.test.js (the move commit).
// Side effects that are other methods (_speak, _animate, _sparkle, _line, _look, _chirp) are stubs; their calls are listed.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");

const FLAIR_MS = 4200;
// the log, as [t, op, arg] for one element name
const of = (w, name) => w.log.filter((x) => x.el === name).map((x) => `${x.t} ${x.op}${x.arg === undefined ? "" : ` ${x.arg}`}`);
const calls = (w, ...names) => w.calls.filter((c) => names.includes(c.name))
  .map((c) => `${c.t} ${c.name}${c.name === "_animate" ? ` ${c.args[2]}` : ""}`);
const gone = (w, name) => of(w, name).filter((x) => x.endsWith("remove"));
const seasonBox = (el) => ({ seasonBox: el("seasonBox") });
// Math.random fixed: the flyer comes from the left (ltr) when below .5
const fixed = (r) => Object.create(Math, { random: { value: () => r } });

// ---- R47, R45: _costume, and _seasonTick's treat ----

const COSTUME = {
  methods: ["_costume"], screen: true, watch: ["_speak", "_animate"],
  returns: { _flairAnchors: { hx: 10, hy: 20, ks: 1, cx: 30, half: 5, fy: 40 }, _hatSeat: { x: 1, top: 5 }, _hatSpot: null },
  globals: { FLAIR_MS, dailyPick: (l) => l[0] },
  slide: () => ({ species: { head: { adult: [1, 2] } }, drawn: "adult" }),
};

test("_costume: the box is removed FLAIR_MS + 1800 after it goes up, and not before; the same under calm", () => {
  for (const calm of [false, true]) {
    const w = world(COSTUME);
    w.calm = calm;
    w.card._costume(w.slide, { key: "x" }, "a line");
    assert.deepStrictEqual(gone(w, "div1"), []);
    assert.deepStrictEqual(of(w, "screen"), ["0 append div1"]);
    w.run(FLAIR_MS + 1790);
    assert.deepStrictEqual(gone(w, "div1"), [], `calm ${calm}`);
    w.settle();
    assert.deepStrictEqual(gone(w, "div1"), [`${FLAIR_MS + 1800} remove`], `calm ${calm}`);
    assert.strictEqual(w.slide.flairUntil, w.base + FLAIR_MS + 1800);
  }
});

test("_costume: a second costume sweeps the first away at once; each box still has its own timer (no key)", () => {
  const w = world(COSTUME);
  w.card._costume(w.slide, { key: "x" }, "one");
  w.run(1000);
  w.card._costume(w.slide, { key: "x" }, "two");
  assert.deepStrictEqual(gone(w, "div1"), ["1000 remove"], "the sweep");
  w.settle();
  assert.deepStrictEqual(gone(w, "div1"), ["1000 remove", `${FLAIR_MS + 1800} remove`], "the first box's own timer is harmless");
  assert.deepStrictEqual(gone(w, "div3"), [`${1000 + FLAIR_MS + 1800} remove`]);
});

const TICK = {
  methods: ["_seasonTick"], watch: ["_costume", "_seasonTreat", "_chirp"],
  returns: { _hatSpot: [1, 1], _free: true, _headTopAll: 0, _lines: { text: "t" } },
  globals: {
    seasonNow: () => ({ key: "x", treat: "t", treatLine: null }), seasonPart: () => ({}),
    seasonDate: () => { const d = new Date(1767225600000); return [d.getMonth() + 1, d.getDate()]; }, namedHolidays: () => true, oncePerDay: () => false, unnamed: () => [], seasonLine: () => "l",
    SEASON_FLYER_MS: [1, 2], SEASON_NIGHT_FLYER_MS: [1, 2], SEASON_VISITOR_MS: [1, 2], SEASON_COSTUME_MS: [1, 2],
    localStorage: { getItem: () => null, setItem: () => {} },
  },
  slide: (el) => ({ screen: el("screen"), pet: el("pet"), species: { head: {} } }),
};

test("_seasonTick on the treat day: the costume at once, the treat 1600 ms later; the same under calm", () => {
  for (const calm of [false, true]) {
    const w = world(TICK);
    w.calm = calm;
    w.card._config = {};
    w.card._seasonTick(w.slide);
    assert.deepStrictEqual(calls(w, "_costume", "_seasonTreat"), ["0 _costume"], `calm ${calm}`);
    w.run(1590);
    assert.deepStrictEqual(calls(w, "_seasonTreat"), [], `calm ${calm}`);
    w.settle();
    assert.deepStrictEqual(calls(w, "_costume", "_seasonTreat"), ["0 _costume", "1600 _seasonTreat"], `calm ${calm}`);
  }
});

test("_seasonTick: the treat is once per day on this device (a seen day queues no timer)", () => {
  const w = world({ ...TICK, globals: { ...TICK.globals, localStorage: { getItem: () => "1", setItem: () => {} } } });
  w.card._config = {};
  w.card._seasonTick(w.slide);
  assert.strictEqual(w.slide.treated, true);
  assert.deepStrictEqual(calls(w, "_seasonTreat"), []);
  w.settle();
  assert.deepStrictEqual(calls(w, "_seasonTreat"), []);
});

// ---- R46: _confetti ----

test("_confetti: the box goes up with 18 bits and is removed 3600 ms later; under calm there is nothing", () => {
  const w = world({ methods: ["_confetti"], screen: true });
  w.card._confetti(w.slide);
  const box = w.slide.screen.children[0];
  assert.strictEqual(box.children.length, 18);
  w.run(3590);
  assert.deepStrictEqual(of(w, box.name).filter((x) => x.endsWith("remove")), []);
  w.settle();
  assert.deepStrictEqual(of(w, box.name).filter((x) => x.endsWith("remove")), ["3600 remove"]);
  const c = world({ methods: ["_confetti"], screen: true });
  c.calm = true;
  c.card._confetti(c.slide);
  assert.strictEqual(c.horizon(), 0);
  assert.strictEqual(c.slide.screen.children.length, 0);
});

// ---- R48, R49: _seasonFlyer, _seasonFly ----

const FLY = { methods: ["_seasonFlyer", "_seasonFly"], screen: true, slide: seasonBox, globals: { Math: fixed(0.9) } };
const season = { key: "x", flyer: { art: "bat", cls: "bat", ms: 8000, flock: 5 } };

test("a flock of 5: the leader at once, the next two at 450 ms, the last two at 900 ms; each removed at its own start + ms + 200", () => {
  const w = world(FLY);
  w.card._seasonFlyer(w.slide, season);
  w.run(10);
  assert.deepStrictEqual(of(w, "seasonBox"), ["0 append div1"], "lag 0: the leader, in the middle of the V");
  w.settle();
  const box = w.log.filter((x) => x.el === "seasonBox").map((x) => `${x.t} ${x.arg}`);
  assert.deepStrictEqual(box, ["0 div1", "450 div2", "450 div3", "900 div4", "900 div5"]);
  const gone = w.log.filter((x) => x.op === "remove").map((x) => `${x.t} ${x.el}`);
  assert.deepStrictEqual(gone, ["8200 div1", "8650 div2", "8650 div3", "9100 div4", "9100 div5"]);
});

test("a flock leaves nothing behind; a two-frame flyer flaps and goes at ms + 200; calm does not change either", () => {
  for (const calm of [false, true]) {
    const w = world(FLY);
    w.calm = calm;
    w.card._seasonFlyer(w.slide, season);
    w.settle();
    assert.strictEqual(w.slide.seasonBox.children.length, 0, "all gone");
    const one = world(FLY);
    one.calm = calm;
    one.card._seasonFlyer(one.slide, { key: "x", flyer: { art: ["a", "b"], cls: "bat", ms: 5000 } });
    one.run(10);
    assert.deepStrictEqual(of(one, "div1"), ["0 class+ flap"]);
    assert.strictEqual(one.slide.seasonBox.children.length, 1);
    one.run(5170);
    assert.strictEqual(one.slide.seasonBox.children.length, 1);
    one.run(20);
    assert.strictEqual(one.slide.seasonBox.children.length, 0, "gone at ms + 200");
  }
});

// ---- R50: _seasonVisitor, _seasonVisitEnd ----

const VISIT = {
  methods: ["_seasonVisitor", "_seasonVisitEnd", "_seasonFly"], screen: true, slide: seasonBox,
  watch: ["_line", "_animate", "_look", "_chirp"],
  returns: { _visitorLive: true, _mayInterrupt: true },
  globals: { Math: fixed(0.1), FLAVOUR: "flavour", VISIT_AFTER_MS: 120000, pick: (l) => l[0], unnamed: (l) => l },
};
const ghost = { key: "x", chirp: "boo", visitor: { art: "ghost", cls: "ghost", ms: 9000, startle: "eek", jump: "perk", greet: ["hello"] } };
const lines = (w) => w.calls.filter((c) => c.name === "_line").map((c) => `${c.t} ${c.args[3]} ${c.args[2]}`);

test("the visit: the startle at 1400, the greet at 3400, the end at ms; the flyer leaves at ms + 200", () => {
  const w = world(VISIT);
  w.card._seasonVisitor(w.slide, ghost);
  const V = w.slide.seasonVisit;
  assert.strictEqual(V.until, w.base + 9000);
  assert.strictEqual(w.slide.flairUntil, w.base + 9000);
  assert.strictEqual(w.slide.visitUntil, w.base + 9000);
  w.run(1390);
  assert.deepStrictEqual(calls(w, "_line", "_animate", "_chirp", "_look"), []);
  w.run(10);
  assert.deepStrictEqual(calls(w, "_line", "_animate", "_chirp", "_look"), ["1400 _look", "1400 _line", "1400 _animate perk", "1400 _chirp"]);
  assert.deepStrictEqual(w.calls.find((c) => c.name === "_look").args.slice(1), [9000 - 1400 - 600], "the look is held through the greet");
  assert.deepStrictEqual(lines(w), ["1400 1800 eek"]);
  w.run(1990);
  assert.deepStrictEqual(lines(w), ["1400 1800 eek"]);
  w.run(10);
  assert.deepStrictEqual(lines(w), ["1400 1800 eek", "3400 3000 hello"]);
  w.run(5590);
  assert.strictEqual(w.slide.seasonVisit, V, "still on");
  w.run(10);
  assert.strictEqual(w.slide.seasonVisit, null, "ended passed at ms");
  assert.strictEqual(w.slide.flairUntil, 0);
  assert.strictEqual(w.slide.visitUntil, 0);
  assert.deepStrictEqual(gone(w, V.el.name), [], "passed: the picture is left to the flyer's own timer");
  w.run(190);
  assert.deepStrictEqual(gone(w, V.el.name), []);
  w.run(10);
  assert.deepStrictEqual(gone(w, V.el.name), ["9200 remove"]);
});

test("the visit under calm runs the same steps; only the look turn stands down", () => {
  const w = world(VISIT);
  w.calm = true;
  w.card._seasonVisitor(w.slide, ghost);
  w.settle();
  assert.deepStrictEqual(calls(w, "_line", "_animate", "_chirp", "_look"), ["1400 _line", "1400 _animate perk", "1400 _chirp", "3400 _line", "3400 _animate perk"]);
});

test("a visitor from the right is not faced (no look); a season with no chirp does not chirp", () => {
  const w = world({ ...VISIT, globals: { ...VISIT.globals, Math: fixed(0.9) } });
  w.card._seasonVisitor(w.slide, { ...ghost, chirp: null });
  w.settle();
  assert.deepStrictEqual(calls(w, "_look", "_chirp"), []);
});

test("_seasonVisitEnd cut short (at 2000): the picture goes, the flags clear, the greet and the end never come", () => {
  const w = world(VISIT);
  w.card._seasonVisitor(w.slide, ghost);
  w.run(2000);
  const V = w.slide.seasonVisit;
  w.card._seasonVisitEnd(w.slide);
  assert.strictEqual(w.slide.seasonVisit, null);
  assert.strictEqual(w.slide.flairUntil, 0);
  assert.strictEqual(w.slide.visitUntil, 0);
  assert.deepStrictEqual(gone(w, V.el.name), ["2000 remove"]);
  w.settle();
  assert.deepStrictEqual(lines(w), ["1400 1800 eek"], "no greet");
});

test("_seasonVisitEnd keeps flairUntil and visitUntil when something else has set them since", () => {
  const w = world(VISIT);
  w.card._seasonVisitor(w.slide, ghost);
  w.run(2000);
  w.slide.flairUntil = 12345;
  w.slide.visitUntil = 6789;
  w.card._seasonVisitEnd(w.slide);
  assert.strictEqual(w.slide.flairUntil, 12345);
  assert.strictEqual(w.slide.visitUntil, 6789);
  w.card._seasonVisitEnd(w.slide); // none left: a no-op
});

test("a beat that finds the visitor not live ends the visit at once, the picture gone, and the later beats are cancelled", () => {
  const w = world(VISIT);
  w.card._seasonVisitor(w.slide, ghost);
  const V = w.slide.seasonVisit;
  w.run(1000);
  w.card._visitorLive = () => false;
  w.run(500);
  assert.strictEqual(w.slide.seasonVisit, null);
  assert.deepStrictEqual(gone(w, V.el.name), ["1400 remove"]);
  w.settle();
  assert.deepStrictEqual(lines(w), []);
});

test("a beat that may not interrupt says nothing but the visit goes on to its end", () => {
  const w = world({ ...VISIT, returns: { _visitorLive: true, _mayInterrupt: false } });
  w.card._seasonVisitor(w.slide, ghost);
  w.settle();
  assert.deepStrictEqual(lines(w), []);
  assert.strictEqual(w.slide.seasonVisit, null);
});

test("a second visitor over a first ends the first (picture gone) and the first's steps never fire", () => {
  const w = world(VISIT);
  w.card._seasonVisitor(w.slide, ghost);
  const first = w.slide.seasonVisit;
  w.run(1000);
  w.card._seasonVisitor(w.slide, ghost);
  assert.deepStrictEqual(gone(w, first.el.name), ["1000 remove"]);
  w.settle();
  assert.deepStrictEqual(lines(w), ["2400 1800 eek", "4400 3000 hello"], "only the second's beats");
});
