// Director migration slice 11 (visitors, reveal, swipe grace), the characterization half: the world visitor's steps (R85), the basket
// reveal's (R86) and its find ring (R87), and the swipe grace (R14), on the fake clock with the card's own methods (plan 5.11). It passes
// before the move (bare timers, V.timers / R.timers) and after (the ledger, groups "visitor" and "reveal"). What it pins on purpose:
// the swipe grace is unkeyed (two swipes away end the visitor at the FIRST + 600, F4); _forget ends a walking visitor itself (review
// s2978 fix 1: s.visitor null, flairUntil and visitUntil 0, the elements gone, nothing pending).
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");
const src = require("./card-source");
const { world } = require("./timer_trace");

// _go has a comment after its brace, which the harness's method reader does not take: cut it here.
const GO = src.match(/\n  _go\(index, auto = false\) \{[^\n]*\n[\s\S]*?\n  \}\n/)[0];

const SPEC = {
  methods: ["_visitorStart", "_visitorEnd", "_revealStart", "_revealEnd", "_revealFind", "_dropFinds", "_forget", "_resetChannel"],
  consts: ["PAIR_BEHIND_MS", "VISIT_IN_MS", "VISIT_STAY_MS", "VISIT_CALM_MS", "VISIT_AFTER_MS", "VISIT_SWIPE_GRACE_MS", "FIND_STEP_MS"],
  watch: ["_look", "_visitorGreet", "_seasonVisitEnd"],
  globals: { localStorage: { setItem() {} }, findOf: () => null, FLAVOUR: 1, FIND_LINE_MS: 4000, digit: () => "" },
  fields: { _index: 0, _swiped: false, _userMoved: false },
  slide: (el) => ({
    seasonBox: el("seasonBox"), basket: el("basket"), screen: el("screen"), visitor: null, reveal: null,
    flairUntil: 0, visitUntil: 0, nextVisitor: 0, worldKey: "garden", ids: { device: "dev" }, game: null, scene: null,
    status: el("status"), bubble: el("bubble"),
  }),
};
const make = ({ calm = false, pair = null, live = true } = {}) => {
  const w = world(SPEC);
  w.calm = calm;
  w.live = live;
  let n = 0;
  const img = w.el("img", { dataset: {}, src: "" });
  const mk = (tag) => {
    const e = w.el(`${tag}${++n}`);
    e.dataset = {};
    e.querySelector = () => img;
    e.classList.replace = (a, b) => { e.classList.remove(a); e.classList.add(b); };
    e.style.setProperty = () => {};
    e.cloneNode = () => mk(tag);
    return e;
  };
  w.sandbox.document.createElement = mk;
  Object.assign(w.card, {
    _visitorLive: (s) => w.live && s === w.card._slides[w.card._index],
    _visitorPair: () => pair,
    _basketSync() {},
    _slides: [w.slide, Object.assign(w.el("other"), { visitor: null, ids: {}, screen: w.el("s2"), status: w.el("st2") })],
  });
  vm.runInContext(`this.go = {${GO}};`, w.sandbox);
  w.card._go = w.sandbox.go._go;
  w.slide.screen.querySelector = w.slide.status.querySelector = () => null;
  w.sandbox.sharedScreen = () => false;
  w.sandbox.calm = () => w.calm;
  w.sandbox.BASE = "/b";
  w.sandbox.VERSION = "t";
  w.stamps = (name) => w.calls.filter((c) => c.name === name).map((c) => c.t);
  w.start = (v, opts = {}) => w.card._visitorStart(w.slide, v, { ltr: true, count: false, ...opts });
  return w;
};
const WALKER = { id: "fox", walk: true };
const CROSSER = { id: "swift", cross: true };
const PAL = { id: "mole", walk: true };
const at = (w, name) => w.calls.filter((c) => c.name === name).map((c) => c.t);
const removed = (w) => w.log.filter((e) => e.op === "remove").map((e) => [e.t, e.el]);
const clean = (w) => [w.slide.visitor, w.slide.flairUntil, w.slide.visitUntil, w.slide.seasonBox.children.length];

test("a walking visitor: look at inMs, the pair behind at PAIR_BEHIND_MS, greet at greetAt, out at greetAt + stay, end at total", () => {
  const w = make({ pair: PAL });
  const V = w.start(WALKER);
  assert.strictEqual(w.slide.visitor, V);
  assert.deepStrictEqual([V.until - w.base, w.slide.flairUntil - w.base, w.slide.visitUntil - w.base], [6800, 6800, 6800]);
  assert.strictEqual(V.greetAt, 2400);
  w.run(1399);
  assert.deepStrictEqual([at(w, "_look"), V.els.length], [[], 1]);
  w.run(1);
  assert.deepStrictEqual(at(w, "_look"), [1400]);
  assert.strictEqual(w.calls.find((c) => c.name === "_look").args[1], 4000, "held through the greet and the stay");
  w.run(99);
  assert.strictEqual(V.els.length, 1, "the pair is not in before 1500");
  w.run(1);
  assert.strictEqual(V.els.length, 2, "the pair, behind by PAIR_BEHIND_MS");
  assert.strictEqual(V.pair, PAL);
  w.run(899);
  assert.deepStrictEqual(at(w, "_visitorGreet"), []);
  w.run(1);
  assert.deepStrictEqual(at(w, "_visitorGreet"), [2400]);
  w.run(2999);
  assert.ok(V.els.every((x) => x.cls.has("in")), "still in at 5399");
  w.run(1);
  assert.ok(V.els.every((x) => x.cls.has("out") && !x.cls.has("in")), "out at greetAt + stay");
  w.run(1399);
  assert.strictEqual(w.slide.visitor, V);
  w.run(1);
  assert.deepStrictEqual(clean(w), [null, 0, 0, 0]);
  assert.deepStrictEqual(removed(w).map((r) => r[0]), [6800, 6800]);
  assert.strictEqual(w.pendingTimers(), 0);
});

test("a visitor that crosses: greet at 60% of inMs, taken off at inMs, end at greetAt + 3000; no look", () => {
  const w = make();
  const V = w.start(CROSSER);
  assert.deepStrictEqual([V.greetAt, V.until - w.base], [1080, 4080]);
  w.run(1079);
  assert.deepStrictEqual(at(w, "_visitorGreet"), []);
  w.run(1);
  assert.deepStrictEqual(at(w, "_visitorGreet"), [1080]);
  w.run(720);
  assert.deepStrictEqual(removed(w), [[1800, "div1"]]);
  w.run(2279);
  assert.strictEqual(w.slide.visitor, V);
  w.run(1);
  assert.deepStrictEqual(clean(w), [null, 0, 0, 0]);
  assert.deepStrictEqual(at(w, "_look"), []);
});

test("calm: the pair at 0 (no look), the greet at 600, gone at VISIT_CALM_MS", () => {
  const w = make({ calm: true, pair: PAL });
  const V = w.start(WALKER);
  w.run(0);
  assert.strictEqual(V.els.length, 1, "the pair step is a timer: not before the clock moves");
  w.run(10);
  assert.strictEqual(V.els.length, 2);
  w.run(580);
  assert.deepStrictEqual(at(w, "_visitorGreet"), []);
  w.run(10);
  assert.deepStrictEqual(at(w, "_visitorGreet"), [600]);
  w.run(4390);
  assert.strictEqual(w.slide.visitor, V);
  w.run(10);
  assert.deepStrictEqual([clean(w), at(w, "_look")], [[null, 0, 0, 0], []]);
});

test("each step re-checks _visitorLive: the first step that finds it false ends the visit, its picture gone", () => {
  const w = make({ pair: PAL });
  w.start(WALKER);
  w.run(1000);
  w.live = false;
  w.run(400);
  assert.deepStrictEqual([w.slide.visitor, removed(w)], [null, [[1400, "div1"]]]);
  assert.deepStrictEqual(at(w, "_look"), [], "the look did not run");
  w.run(6000);
  assert.deepStrictEqual([at(w, "_visitorGreet"), w.pendingTimers()], [[], 0]);
});

test("a new visit ends the one on: its steps do not run on the new one", () => {
  const w = make();
  const a = w.start(WALKER);
  w.run(1000);
  const B = w.start(WALKER);
  assert.notStrictEqual(a, B);
  w.run(1399);
  assert.deepStrictEqual(at(w, "_look"), []);
  w.run(1);
  assert.deepStrictEqual(at(w, "_look"), [2400], "the old look (1400) is gone; the new one is at 1000 + 1400");
  assert.strictEqual(w.slide.visitor, B);
});

// --- the swipe grace (R14) ---
const swipe = (w, to) => w.card._go(to);

test("swipe away at +100 and back at +400: the visitor stays", () => {
  const w = make();
  const V = w.start(WALKER);
  w.run(100);
  swipe(w, 1);
  w.run(300);
  swipe(w, 0);
  w.run(400);
  assert.strictEqual(w.slide.visitor, V);
  w.run(300);
  assert.strictEqual(w.slide.visitor, V, "the 600 ms from the first swipe lapsed with the slide on show");
});

test("swipe away at +100 and not back: the visitor goes at +700 (swipe + VISIT_SWIPE_GRACE_MS), its picture gone", () => {
  const w = make();
  const V = w.start(WALKER);
  w.run(100);
  swipe(w, 1);
  w.run(599);
  assert.strictEqual(w.slide.visitor, V);
  w.run(1);
  assert.deepStrictEqual([clean(w), removed(w)], [[null, 0, 0, 0], [[700, "div1"]]]);
});

test("a crosser: the same grace; a calm visitor: its 600 step finds the slide off show and ends it there, before the grace", () => {
  const c = make();
  c.start(CROSSER);
  c.run(100);
  swipe(c, 1);
  c.run(599);
  assert.notStrictEqual(c.slide.visitor, null);
  c.run(1);
  assert.strictEqual(c.slide.visitor, null);
  const k = make({ calm: true });
  k.start(WALKER);
  k.run(100);
  swipe(k, 1);
  k.run(499);
  assert.notStrictEqual(k.slide.visitor, null);
  k.run(1);
  assert.strictEqual(k.slide.visitor, null, "at 600, not 700");
  const back = make({ calm: true });
  const V = back.start(WALKER);
  back.run(100);
  swipe(back, 1);
  back.run(300);
  swipe(back, 0);
  back.run(5000);
  assert.strictEqual(back.slide.visitor, null);
  assert.deepStrictEqual(at(back, "_visitorGreet"), [600], "back in time: the greet ran");
  assert.ok(V);
});

test("two swipes away inside 600: the visitor ends at the FIRST swipe + 600 (unkeyed, F4)", () => {
  const w = make();
  w.start(WALKER);
  w.run(100);
  swipe(w, 1);
  w.run(100);
  swipe(w, 0);
  w.run(100);
  swipe(w, 1); // the second swipe away, at +300
  w.run(399);
  assert.notStrictEqual(w.slide.visitor, null);
  w.run(1);
  assert.strictEqual(w.slide.visitor, null, "at 700, not 900");
});

test("away at 1300: the visit ends at the 1400 step (it finds the slide off show), not at 1900", () => {
  const w = make({ pair: PAL });
  w.start(WALKER);
  w.run(1300);
  swipe(w, 1);
  w.run(99);
  assert.notStrictEqual(w.slide.visitor, null);
  w.run(1);
  assert.deepStrictEqual([w.slide.visitor, removed(w)], [null, [[1400, "div1"]]]);
  assert.deepStrictEqual(at(w, "_look"), []);
  w.run(1000);
  assert.strictEqual(w.pendingTimers(), 0);
});

// --- forget (review s2978 fix 1) ---
const forgetAt = (ms, { swiped = false } = {}) => {
  const w = make({ pair: PAL });
  w.start(WALKER);
  w.run(100);
  if (swiped) swipe(w, 1);
  w.run(ms - 100);
  w.card._forget(w.slide);
  return w;
};

// Today (the unmoved code) _forget does not end the visitor: it runs on to its own last step (or the swipe grace) over the new pet. The
// move commit has _forget call _visitorEnd before detach, and these two cases then read "ended on the spot" (plan 5.11, fix 1).
test("_forget at +500 of a walking visitor: today the visitor runs on to total", () => {
  const w = forgetAt(500);
  assert.notStrictEqual(w.slide.visitor, null);
  assert.strictEqual(w.slide.flairUntil - w.base, 6800);
  w.run(6299);
  assert.notStrictEqual(w.slide.visitor, null);
  w.run(1);
  assert.deepStrictEqual([clean(w), w.pendingTimers()], [[null, 0, 0, 0], 0]);
});

test("_forget inside a swipe grace: today the grace (or the next step that finds the slide off show) ends it", () => {
  const w = forgetAt(500, { swiped: true });
  assert.notStrictEqual(w.slide.visitor, null);
  w.run(200);
  assert.deepStrictEqual([clean(w), w.pendingTimers()], [[null, 0, 0, 0], 0]);
});

test("after a forget the slide is free for a new visitor, and the old one's steps do not touch it", () => {
  const w = forgetAt(500);
  const B = w.start(WALKER);
  w.run(8000);
  assert.deepStrictEqual(at(w, "_look"), [1900], "only the new one's look (500 + 1400)");
  assert.strictEqual(w.slide.visitor, null);
  assert.ok(B.until);
});

// --- the reveal (R86, R87) ---
const finds = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ world: "garden", id: `f${i}`, ...extra }));
const shown = (w) => w.log.filter((e) => e.op === "append").map((e) => [e.t, e.el, e.arg]);

test("the reveal: find i at i * FIND_STEP_MS, the end at total; flairUntil and visitUntil held to the end", () => {
  const w = make();
  const R = w.card._revealStart(w.slide, finds(3));
  assert.strictEqual(w.slide.reveal, R);
  assert.deepStrictEqual([R.until - w.base, w.slide.flairUntil - w.base, w.slide.basket.hidden], [7500, 7500, true]);
  w.run(0);
  w.run(10);
  assert.deepStrictEqual([...R.shown], ["garden/f0"], "the first find at 0");
  w.run(2480);
  assert.deepStrictEqual(R.shown.length, 1);
  w.run(10);
  assert.deepStrictEqual(R.shown.length, 2, "the second at 2500");
  w.run(2500);
  assert.strictEqual(R.shown.length, 3, "the third at 5000");
  w.run(2499);
  assert.strictEqual(w.slide.reveal, R);
  w.run(1);
  assert.deepStrictEqual([w.slide.reveal, w.slide.flairUntil, w.slide.visitUntil, w.pendingTimers()], [null, 0, 0, 0]);
});

test("the reveal checks _visitorLive at each beat: not live, it ends there, the rest unshown", () => {
  const w = make();
  const R = w.card._revealStart(w.slide, finds(3));
  w.run(2000);
  w.live = false;
  w.run(600);
  assert.deepStrictEqual([w.slide.reveal, R.shown.length, w.pendingTimers()], [null, 1, 0]);
});

test("a new first-ever find: its ring is taken off 600 ms after it pops", () => {
  const w = make();
  w.card._revealStart(w.slide, finds(2, { new: true }));
  w.run(10);
  const rings = () => w.log.filter((e) => e.op === "append" && e.arg.startsWith("span"));
  assert.strictEqual(rings().length, 1);
  w.run(580);
  assert.deepStrictEqual(removed(w).filter((r) => r[1].startsWith("span")), []);
  w.run(20);
  assert.deepStrictEqual(removed(w).filter((r) => r[1].startsWith("span")).map((r) => r[0]), [600]);
});

test("_revealEnd stops the steps: nothing later shows", () => {
  const w = make();
  const R = w.card._revealStart(w.slide, finds(3));
  w.run(1000);
  w.card._revealEnd(w.slide);
  assert.deepStrictEqual([w.slide.reveal, w.slide.flairUntil, w.slide.visitUntil], [null, 0, 0]);
  const n = R.shown.length;
  w.run(9000);
  assert.strictEqual(R.shown.length, n);
});

test("opening the finds page (_dropFinds) does not stop the reveal: its steps run on (G9)", () => {
  const w = make();
  const R = w.card._revealStart(w.slide, finds(3));
  w.run(1000);
  w.card._dropFinds(w.slide);
  assert.strictEqual(w.slide.reveal, R);
  w.run(1500);
  assert.strictEqual(R.shown.length, 2);
  w.run(5000);
  assert.strictEqual(w.slide.reveal, null, "it ends at its own total");
});
