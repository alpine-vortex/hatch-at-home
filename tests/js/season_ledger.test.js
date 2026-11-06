// Director migration slice 6 (season), after the move: what a forget does to each row (plan 3.14, 6.1 step 3) and what a
// disconnect keeps. `detach` is what _forget calls on the slide. R46 the confetti, R47 the costume box and R49 a flyer are
// "end" (their undo removes the node at once); R45 the treat and R48 a flock's later flyers are "drop"; R50 the visit is a
// "closer": _forget calls _seasonVisitEnd before detach, so s.seasonVisit is null and the flyer gone (a drop would leave
// s.seasonVisit set). A disconnect keeps all of them. B1 is the change: before this slice a forget stopped none of them.
// The times are pinned by season_trace.test.js. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");
const src = require("./card-source");

const gone = (w, name) => w.log.filter((x) => x.el === name && x.op === "remove").map((x) => x.t);
const seasonBox = (el) => ({ seasonBox: el("seasonBox") });
const fixed = (r) => Object.create(Math, { random: { value: () => r } });
const FLAIR_MS = 4200;

const VISIT = {
  methods: ["_seasonVisitor", "_seasonVisitEnd", "_seasonFly"], screen: true, slide: seasonBox,
  watch: ["_line"], returns: { _visitorLive: true, _mayInterrupt: true },
  globals: { Math: fixed(0.9), FLAVOUR: "flavour", VISIT_AFTER_MS: 120000, pick: (l) => l[0], unnamed: (l) => l },
};
const ghost = { key: "x", visitor: { art: "ghost", cls: "ghost", ms: 9000, startle: "eek", jump: "perk", greet: ["hello"] } };
const FLY = { methods: ["_seasonFlyer", "_seasonFly"], screen: true, slide: seasonBox, globals: { Math: fixed(0.9) } };
const flock = { key: "x", flyer: { art: "bat", cls: "bat", ms: 8000, flock: 5 } };
const COSTUME = {
  methods: ["_costume"], screen: true,
  returns: { _flairAnchors: { hx: 10, hy: 20, ks: 1, cx: 30, half: 5, fy: 40 }, _hatSeat: { x: 1, top: 5 }, _hatSpot: null },
  globals: { FLAIR_MS, dailyPick: (l) => l[0] },
  slide: () => ({ species: { head: { adult: [1, 2] } }, drawn: "adult" }),
};
// _forget's two lines, in order: the closer, then detach
const forget = (w) => {
  w.card._seasonVisitEnd(w.slide);
  w.director.detach(w.slide);
};

test("_forget calls _seasonVisitEnd before detach (the closer for R50)", () => {
  const body = src.match(/\n  _forget\([^\n]*\{\n[\s\S]*?\n  \}\n/)[0];
  const end = body.indexOf("this._seasonVisitEnd(s)");
  const detach = body.indexOf("this._director?.detach(s)");
  assert.ok(end > 0 && detach > end, "the closer comes first");
});

test("B1: a forget mid-visit (at 2000): s.seasonVisit null, the flyer gone, nothing pending, nothing fires on the next pet", () => {
  const w = world(VISIT);
  w.card._seasonVisitor(w.slide, ghost);
  w.advance(2000);
  const V = w.slide.seasonVisit;
  assert.strictEqual(w.director.pending(w.slide), 3, "the greet, the end and the flyer's removal");
  forget(w);
  assert.strictEqual(w.slide.seasonVisit, null);
  assert.strictEqual(w.slide.flairUntil, 0);
  assert.strictEqual(w.slide.visitUntil, 0);
  assert.deepStrictEqual(gone(w, V.el.name).slice(0, 1), [2000], "the picture goes at once");
  assert.strictEqual(w.director.pending(w.slide), 0);
  const before = w.log.length;
  w.advance(10000);
  assert.strictEqual(w.log.length, before, "no later effect");
  assert.deepStrictEqual(w.calls.filter((c) => c.name === "_line").map((c) => c.t), [1400], "no greet");
});

test("a visit that has passed leaves the flyer's own removal pending (it is group season, not the visit's)", () => {
  const w = world(VISIT);
  w.card._seasonVisitor(w.slide, ghost);
  w.advance(9000);
  assert.strictEqual(w.slide.seasonVisit, null);
  assert.strictEqual(w.director.pending(w.slide), 1);
  assert.deepStrictEqual(gone(w, w.slide.seasonBox.children[0].name), []);
  w.advance(200);
  assert.strictEqual(w.director.pending(w.slide), 0);
  assert.strictEqual(w.slide.seasonBox.children.length, 0);
});

test("B1: a forget takes a flock off at once and drops the flyers still to come", () => {
  const w = world(FLY);
  w.card._seasonFlyer(w.slide, flock);
  w.advance(500); // the leader and the first pair are up
  assert.strictEqual(w.slide.seasonBox.children.length, 3);
  forget(w);
  assert.strictEqual(w.slide.seasonBox.children.length, 0);
  assert.strictEqual(w.director.pending(w.slide), 0);
  w.advance(10000);
  assert.strictEqual(w.slide.seasonBox.children.length, 0, "the last pair never comes");
});

test("B1: a forget takes the costume box and the confetti off; the treat (a drop) never comes", () => {
  const c = world(COSTUME);
  c.card._costume(c.slide, { key: "x" }, "a line");
  assert.strictEqual(c.director.pending(c.slide), 1);
  c.advance(1000);
  forget(c);
  assert.deepStrictEqual(gone(c, "div1"), [1000]);
  assert.strictEqual(c.director.pending(c.slide), 0);
  c.advance(10000);
  assert.deepStrictEqual(gone(c, "div1"), [1000], "the timer does not fire again");
  const k = world({ methods: ["_confetti"], screen: true });
  k.card._confetti(k.slide);
  const box = k.slide.screen.children[0];
  k.advance(1000);
  forget(k);
  assert.strictEqual(k.slide.screen.children.length, 0);
  assert.deepStrictEqual(gone(k, box.name), [1000]);
  assert.strictEqual(k.director.pending(k.slide), 0);
  const t = world({ methods: ["_costume"], screen: true, returns: COSTUME.returns, globals: COSTUME.globals, slide: COSTUME.slide });
  t.card._later(t.slide, 1600, () => t.card._seasonTreat(t.slide), { group: "season" });
  t.card._seasonTreat = () => t.calls.push({ name: "treat" });
  forget(t);
  t.advance(10000);
  assert.deepStrictEqual(t.calls.filter((x) => x.name === "treat"), []);
});

test("D-keep: a disconnect ends none of them; the flock and the visit run their times", () => {
  const w = world(VISIT);
  w.card._seasonVisitor(w.slide, ghost);
  w.advance(1000);
  w.disconnect();
  w.advance(500);
  assert.deepStrictEqual(w.calls.filter((c) => c.name === "_line").map((c) => c.t), [1400], "the startle still comes");
  w.advance(8000);
  assert.strictEqual(w.slide.seasonVisit, null);
  assert.strictEqual(w.slide.seasonBox.children.length, 0, "the flyer left at ms + 200");
  const f = world(FLY);
  f.card._seasonFlyer(f.slide, flock);
  f.advance(100);
  f.disconnect();
  f.advance(10000);
  assert.strictEqual(f.slide.seasonBox.children.length, 0);
  assert.strictEqual(f.director.pending(f.slide), 0);
});

test("D-reattach: a disconnect and a connect 100 ms later leave the same end state", () => {
  const w = world(VISIT);
  w.card._seasonVisitor(w.slide, ghost);
  w.advance(1000);
  w.disconnect();
  w.advance(100);
  w.reconnect();
  w.advance(9000);
  assert.deepStrictEqual(w.calls.filter((c) => c.name === "_line").map((c) => c.t), [1400, 3400]);
  assert.strictEqual(w.slide.seasonVisit, null);
  assert.strictEqual(w.slide.seasonBox.children.length, 0);
  assert.strictEqual(w.director.pending(w.slide), 0);
});
