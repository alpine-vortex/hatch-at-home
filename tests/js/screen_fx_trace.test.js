// Director migration slice 2 (screen boxes and classes), the characterization: docs/plan-2026-11-06-director-migration.md
// 5.2 and 6.1. Each trace pins what the player could see, as `{ t, el, op, arg }`, for R21 (the trait flair box), R42
// (a clean's bubble pop), R43 (breezy, through _react), R59 (the backlight), R79 (the hearts box), R81 (the house fx
// class), R82 (the robot), R83 (the glass mark's backstop) and R84 (the sparkle ring). It passes on the unmoved code
// (bare timers on the fake clock) and passes unchanged after the move (the same sites through the ledger).
// Reduced motion is whatever the unmoved code does, both ways (F13): _flair, _backlight, _houseFx, _robotFx, _sparkle
// and _bondHearts have no calm() check of their own (their callers do), _bubblePop makes nothing under calm.
// "Called with no slide" (G8) has no case: every one of these reads s.screen first, and all their callers pass a slide
// (grep "_sparkle(\|_bondHearts(\|_houseFx(\|_robotFx(\|_backlight(\|_flair(\|_bubblePop(" src/card).
// Box elements are named in creation order (div1, div2, ...), so a trace says which box a removal is for.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { world } = require("./timer_trace");

const ROOT = path.join(__dirname, "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const ctx0 = { Date, Object, Array, Number, Math, JSON };
vm.runInNewContext(`${read("src/card/interaction-director.js")}\n${read("src/card/device-fx.js")}\nthis.F = HATCH_DEVICE_FX;`, ctx0);
const F = ctx0.F;
const M = F.MARK;

const short = (log) => log.map((x) => `${x.t} ${x.el} ${x.op}${x.arg === undefined ? "" : ` ${x.arg}`}`);
const only = (log, re) => short(log).filter((x) => re.test(x));

// A world with a screen that can hold boxes, and a document that makes named, styled elements.
function fx(spec = {}, { calm = false } = {}) {
  const w = world({
    ...spec,
    globals: { FLAIR: { glow: { place: "head" } }, HATCH_DEVICE_FX: F, lcdOn: () => true, pick: (l) => l[0], ...(spec.globals || {}) },
    slide: (el) => {
      const screen = el("screen");
      screen.style.setProperty = (k, v) => { screen.style[k] = v; };
      screen.clientWidth = 400;
      screen.querySelector = (q) => screen.children.find((k) => k.cls.has(q.slice(1))) || null;
      screen.appendChild = (k) => screen.append(k);
      return { screen, species: {}, mark: el("mark"), empty: false, ...(spec.slide ? spec.slide(el) : {}) };
    },
  });
  w.calm = calm;
  let n = 0;
  w.sandbox.document.createElement = (tag) => {
    const e = w.el(`${tag}${++n}`);
    e.style.setProperty = (k, v) => { e.style[k] = v; };
    e.setAttribute = () => {};
    return e;
  };
  const prop = w.el("prop");
  prop.after = (k) => { k.parent = { children: [k] }; w.log.push({ t: w.t(), el: "prop", op: "after", arg: k.name }); };
  w.slide.prop = prop;
  w.run = (ms) => { for (let left = ms; left > 0; left -= 10) w.advance(Math.min(10, left)); };
  w.settle = () => { while (w.now < w.horizon() + 500) w.advance(10); };
  return w;
}
const shown = (w) => [...w.slide.screen.cls].sort();
const boxes = (w) => w.slide.screen.children.map((k) => k.name);

// ---- R81: the house fx class (2.5 s; one at a time) ----

const houseSpec = { methods: ["_houseFx"] };

test("_houseFx adds the class at once and removes it at 2500; calm both ways", () => {
  for (const calm of [false, true]) {
    const w = fx(houseSpec, { calm });
    w.card._houseFx(w.slide, "fx-heat");
    w.settle();
    assert.deepStrictEqual(short(w.log), [
      "0 screen class- fx-heat", "0 screen class- fx-cool", "0 screen class- fx-suds", "0 screen class- fx-tumble",
      "0 screen class- fx-chime", "0 screen class+ fx-heat", "2500 screen class- fx-heat",
    ], `calm ${calm}`);
  }
});

test("a second house fx at 1000 sweeps the first class at once; the second goes at 3500 and the first timer never fires", () => {
  const w = fx(houseSpec);
  w.card._houseFx(w.slide, "fx-heat");
  w.run(1000);
  w.card._houseFx(w.slide, "fx-suds");
  assert.deepStrictEqual(shown(w), ["fx-suds"]);
  w.run(2000); // 3000: the first call's 2500 has passed
  assert.deepStrictEqual(shown(w), ["fx-suds"], "the first timer did not take the second class off");
  w.settle();
  // the sweep logs each of the five names on every call; only the two that matter are kept here
  assert.deepStrictEqual(only(w.log, /^\d+ screen class[+-] fx-(heat|suds)$/), [
    "0 screen class- fx-heat", "0 screen class- fx-suds", "0 screen class+ fx-heat",
    "1000 screen class- fx-heat", "1000 screen class- fx-suds", "1000 screen class+ fx-suds",
    "3500 screen class- fx-suds",
  ]);
  assert.deepStrictEqual(shown(w), []);
});

test("A1: _houseFx with the same class twice keeps it until the second call plus 2500", () => {
  const w = fx(houseSpec);
  w.card._houseFx(w.slide, "fx-heat");
  w.run(1000);
  w.card._houseFx(w.slide, "fx-heat");
  w.run(1600); // 2600: the first call's end has passed
  assert.deepStrictEqual(shown(w), ["fx-heat"], "still on");
  w.run(900); // 3500
  assert.deepStrictEqual(shown(w), []);
  assert.deepStrictEqual(only(w.log, /class- fx-heat/).slice(-1), ["3500 screen class- fx-heat"]);
});

// ---- R82: the robot (6 s, owner Q3) ----

const robotSpec = { methods: ["_robotFx"] };

test("_robotFx: the width is set, the class goes on and comes off at 6000 (Q3); calm both ways", () => {
  for (const calm of [false, true]) {
    const w = fx(robotSpec, { calm });
    w.card._robotFx(w.slide);
    assert.strictEqual(w.slide.screen.style["--robot-w"], "378px");
    w.settle();
    assert.deepStrictEqual(short(w.log), ["0 screen class+ fx-robot", "6000 screen class- fx-robot"], `calm ${calm}`);
  }
});

test("a second robot at 1000 keeps the class to 7000; the first timer never takes it off", () => {
  const w = fx(robotSpec);
  w.card._robotFx(w.slide);
  w.run(1000);
  w.card._robotFx(w.slide);
  w.run(5500); // 6500
  assert.deepStrictEqual(shown(w), ["fx-robot"]);
  w.settle();
  assert.deepStrictEqual(only(w.log, /class-/), ["7000 screen class- fx-robot"]);
});

// ---- R21: the trait flair box (4.2 s) ----

const flairSpec = {
  methods: ["_flair"], consts: ["FLAIR_MS"], slide: () => ({ species: { head: {} }, pet: undefined }),
  returns: { _state: { state: "adult", attributes: { traits: ["glow"], trait_levels: {} } } },
};

test("a flair adds one box and removes it at 4200; calm both ways", () => {
  for (const calm of [false, true]) {
    const w = fx(flairSpec, { calm });
    w.slide.pet = w.el("pet");
    const shownTraits = w.card._flair(w.slide);
    assert.deepStrictEqual([...shownTraits], ["glow"]);
    assert.deepStrictEqual(boxes(w), ["div1"]);
    assert.strictEqual(w.slide.flairUntil, w.base + 4200);
    w.settle();
    assert.deepStrictEqual(only(w.log, /screen append|div\d remove/), ["0 screen append div1", "4200 div1 remove"], `calm ${calm}`);
    assert.deepStrictEqual(boxes(w), []);
  }
});

test("a second flair at 1000 removes the first box at once and replaces its timer; the first never removes the new box", () => {
  const w = fx(flairSpec);
  w.card._flair(w.slide);
  w.run(1000);
  w.card._flair(w.slide);
  assert.deepStrictEqual(boxes(w), ["div2"]);
  w.run(3500); // 4500: past the first box's 4200
  assert.deepStrictEqual(boxes(w), ["div2"], "the first timer did not remove the second box");
  w.settle();
  assert.deepStrictEqual(only(w.log, /screen append|div\d remove/), [
    "0 screen append div1", "1000 div1 remove", "1000 screen append div2", "5200 div2 remove",
  ]);
});

test("no traits, no species, or an egg: no box and no timer", () => {
  const w = fx({ ...flairSpec, returns: { _state: { state: "egg", attributes: { traits: ["glow"] } } } });
  assert.deepStrictEqual([...w.card._flair(w.slide)], []);
  assert.strictEqual(w.pendingTimers(), 0);
});

// ---- R59: the backlight (3 s) ----

const lightSpec = { methods: ["_backlight"], consts: ["BACKLIGHT_MS"], watch: ["_chirp"] };

test("the backlight: lit on with the click chirp, off at 3000; calm both ways", () => {
  for (const calm of [false, true]) {
    const w = fx(lightSpec, { calm });
    w.card._backlight(w.slide);
    w.settle();
    assert.deepStrictEqual(short(w.log), ["0 screen class+ lit", "0 card call _chirp", "3000 screen class- lit"], `calm ${calm}`);
    assert.deepStrictEqual(w.calls.find((c) => c.name === "_chirp").args.slice(1), ["click"]);
  }
});

test("A1: a backlight re-tap at 1000 keeps lit until 4000; the first timer never takes it off", () => {
  const w = fx(lightSpec);
  w.card._backlight(w.slide);
  w.run(1000);
  w.card._backlight(w.slide);
  w.run(2500); // 3500: past the first tap's 3000
  assert.deepStrictEqual(shown(w), ["lit"]);
  w.run(400); // 3900
  assert.deepStrictEqual(shown(w), ["lit"]);
  w.settle();
  assert.deepStrictEqual(only(w.log, /class-/), ["4000 screen class- lit"]);
});

// ---- R43: breezy, through _react (2.6 s) ----

const reactSpec = {
  methods: ["_react"],
  consts: ["MINE", "MINE_MS", "BEAT"],
  globals: {
    SPOILED_BY: new Set(["feed"]), PROP_FOR: {}, REACTIONS: { aired: { ms: 3000 } }, TALK_COPY: { fan: "ahh", blanket: "cosy" },
    FALLBACK_PROPS: {}, seasonNow: () => null, REFUSALS: {}, REACT_REFUSALS: new Set(), isHeavy: () => false, HEAVY_SNACK: [],
  },
  slide: () => ({ species: { props: {} }, drawn: "adult" }),
  returns: { _words: { food: "x" }, _sceneOffer: false },
  fields: { _config: {} },
};
const fan = { action: "fan", result: "ok" };

test("a fan: breezy goes on with the reaction and comes off at 2600; calm both ways", () => {
  for (const calm of [false, true]) {
    const w = fx(reactSpec, { calm });
    w.card._react(w.slide, fan, {});
    w.settle();
    assert.deepStrictEqual(only(w.log, /class/), ["0 screen class+ breezy", "2600 screen class- breezy"], `calm ${calm}`);
  }
});

test("a fan while busy (a scene has the stage) adds no breezy", () => {
  const w = fx(reactSpec);
  w.card._react(w.slide, fan, { busy: true });
  w.settle();
  assert.deepStrictEqual(only(w.log, /class/), []);
});

test("A1: a second breezy at 1000 keeps the class to 3600; the first timer never takes it off", () => {
  const w = fx(reactSpec);
  w.card._react(w.slide, fan, {});
  w.run(1000);
  w.card._react(w.slide, fan, {});
  w.run(2000); // 3000: past the first's 2600
  assert.deepStrictEqual(shown(w), ["breezy"]);
  w.settle();
  assert.deepStrictEqual(only(w.log, /class-/), ["3600 screen class- breezy"]);
});

// ---- R79: the hearts box (2.8 s) ----

const heartSpec = { methods: ["_bondHearts"] };

test("_bondHearts: a box of hearts appended at once, removed at 2800; calm makes no difference to the method", () => {
  for (const calm of [false, true]) {
    const w = fx(heartSpec, { calm });
    w.card._bondHearts(w.slide);
    assert.deepStrictEqual(boxes(w), ["div1"]);
    assert.strictEqual(w.slide.screen.children[0].className, "bondhearts");
    assert.strictEqual(w.slide.screen.children[0].children.length, 4);
    w.settle();
    assert.deepStrictEqual(only(w.log, /screen append|div1 remove/), ["0 screen append div1", "2800 div1 remove"], `calm ${calm}`);
  }
});

test("a care heart or a link heart is its own box: one heart for n = 1, class carehearts", () => {
  const w = fx(heartSpec);
  w.card._bondHearts(w.slide, "carehearts", 1);
  assert.strictEqual(w.slide.screen.children[0].className, "carehearts");
  assert.strictEqual(w.slide.screen.children[0].children.length, 1);
});

test("a second call removes the old box at once; its timer still fires at 2800 (a no-op on a detached node); the new one goes at 3800", () => {
  const w = fx(heartSpec);
  w.card._bondHearts(w.slide);
  w.run(1000);
  w.card._bondHearts(w.slide);
  assert.deepStrictEqual(boxes(w), ["div6"], "the old box is out, the new one in (the first box and its four hearts took div1-div5)");
  w.settle();
  // The call count is what is pinned: one removal per call at its own time, plus the sweep.
  assert.deepStrictEqual(only(w.log, /screen append|div(1|6) remove/), [
    "0 screen append div1", "1000 div1 remove", "1000 screen append div6", "2800 div1 remove", "3800 div6 remove",
  ]);
  assert.deepStrictEqual(boxes(w), []);
});

// ---- R42: a clean's bubble pop (1.3 s) ----

const bubbleSpec = { methods: ["_bubblePop"], consts: ["BUBBLE_POP_ODDS"], globals: { Math: Object.assign(Object.create(Math), { random: () => 0 }) } };

test("_bubblePop: the image is put after the prop and removed at 1300", () => {
  const w = fx(bubbleSpec);
  const made = w.card._bubblePop(w.slide);
  assert.strictEqual(made.img.name, "img1");
  w.settle();
  assert.deepStrictEqual(short(w.log), ["0 prop after img1", "1300 img1 remove"]);
});

test("_bubblePop under calm, or on a roll over the odds: nothing is made", () => {
  const c = fx(bubbleSpec, { calm: true });
  assert.strictEqual(c.card._bubblePop(c.slide), undefined);
  assert.deepStrictEqual(c.log, []);
  assert.strictEqual(c.pendingTimers(), 0);
  const w = fx({ ...bubbleSpec, globals: { Math: Object.assign(Object.create(Math), { random: () => 0.9 }) } });
  assert.strictEqual(w.card._bubblePop(w.slide), undefined);
  assert.deepStrictEqual(w.log, []);
});

// ---- R84: the sparkle ring (0.6 s) ----

test("_sparkle: the ring is appended at once and removed at 600; calm both ways", () => {
  for (const calm of [false, true]) {
    const w = fx({ methods: ["_sparkle"] }, { calm });
    w.card._sparkle(w.slide);
    assert.strictEqual(w.slide.screen.children[0].className, "burst big");
    w.settle();
    assert.deepStrictEqual(short(w.log), ["0 screen append span1", "600 span1 remove"], `calm ${calm}`);
  }
});

test("two sparkles 100 ms apart: two rings, each removed 600 ms after its own call", () => {
  const w = fx({ methods: ["_sparkle"] });
  w.card._sparkle(w.slide);
  w.run(100);
  w.card._sparkle(w.slide);
  w.settle();
  assert.deepStrictEqual(only(w.log, /remove/), ["600 span1 remove", "700 span2 remove"]);
});

// ---- R83: the glass mark's backstop (showMs + fadeMs + 500) ----

const markSpec = {
  methods: ["_rareGlass", "_markEnd"], returns: { _markClear: true, _dirShown: true },
  slide: () => ({ glassSeen: true, glassViewed: M.everyMs, glassAt: 0 }),
};
const backstop = M.showMs + M.fadeMs + 500;
const showMark = (w) => w.card._rareGlass(w.slide, w.base + w.now, (kinds) => kinds[0]);

test("the mark is drawn on a due tick, and the backstop ends it at showMs + fadeMs + 500 if nothing else does", () => {
  const w = fx(markSpec);
  showMark(w);
  assert.strictEqual(w.slide.markUntil, w.base + M.showMs + M.fadeMs);
  assert.ok(w.slide.mark.cls.has(M.on));
  w.settle();
  const out = only(w.log, /class-/).filter((x) => !x.startsWith("0 ")); // t 0: the draw clears its layer first
  assert.ok(out.length > 0 && out.every((x) => x.startsWith(`${backstop} mark class- `)), out.join("\n"));
  assert.strictEqual(w.slide.markUntil, 0);
  assert.strictEqual(w.slide.mark.cls.size, 0);
});

test("_markEnd cancels the backstop: nothing happens at showMs + fadeMs + 500 afterwards", () => {
  const w = fx(markSpec);
  showMark(w);
  w.run(1000);
  w.card._markEnd(w.slide);
  const at = w.log.length;
  assert.strictEqual(w.slide.mark.cls.size, 0);
  w.run(backstop + 500);
  assert.deepStrictEqual(short(w.log.slice(at)), []);
  assert.strictEqual(w.pendingTimers(), 0);
});

test("the mark under calm is not drawn (it waits): no class and no backstop", () => {
  const w = fx(markSpec, { calm: true });
  showMark(w);
  w.run(backstop + 500);
  assert.deepStrictEqual(w.log, []);
  assert.strictEqual(w.slide.markUntil, undefined);
});

test("a second draw while one is showing re-arms nothing: the first backstop is the only one", () => {
  const w = fx(markSpec);
  showMark(w);
  w.run(1000);
  w.slide.glassViewed = M.everyMs;
  showMark(w); // markUntil is set: one at a time
  w.settle();
  assert.deepStrictEqual(only(w.log, /class-/).filter((x) => !x.startsWith(`${backstop} `) && !x.startsWith("0 ")), []);
});

// ---- D-keep: a disconnect ends none of these; they all end on time ----

test("D-keep: a disconnect at 500 ms, then 10 s (the mark 23 s): every class and box is gone at its own time, as before", () => {
  const w = fx({
    methods: ["_houseFx", "_robotFx", "_backlight", "_bondHearts", "_sparkle", "_flair", "_bubblePop", "_rareGlass", "_markEnd", "_react"],
    consts: ["FLAIR_MS", "BACKLIGHT_MS", "BUBBLE_POP_ODDS", "MINE", "MINE_MS", "BEAT"],
    globals: { ...reactSpec.globals, Math: Object.assign(Object.create(Math), { random: () => 0 }) },
    returns: { ...reactSpec.returns, ...flairSpec.returns, ...markSpec.returns },
    slide: () => ({ glassSeen: true, glassViewed: M.everyMs, glassAt: 0, species: { props: {}, head: {} }, drawn: "adult" }),
    fields: { _config: {} },
  });
  w.slide.pet = w.el("pet");
  const s = w.slide;
  w.card._houseFx(s, "fx-heat");
  w.card._robotFx(s);
  w.card._backlight(s);
  w.card._bondHearts(s);
  w.card._sparkle(s);
  w.card._flair(s);
  w.card._bubblePop(s);
  w.card._react(s, fan, {});
  showMark(w);
  w.run(500);
  w.disconnect();
  assert.deepStrictEqual(shown(w), ["breezy", "fx-heat", "fx-robot", "lit"], "a disconnect takes none of it off");
  const at = w.log.length;
  w.run(10000); // the plan's 10 s: all but the glass mark (its backstop is at 22.5 s) are over
  assert.deepStrictEqual(shown(w), []);
  assert.strictEqual(s.mark.cls.size, 3, "the mark is still up at 10.5 s");
  w.run(13000);
  assert.deepStrictEqual(boxes(w), []);
  assert.strictEqual(s.mark.cls.size, 0);
  assert.strictEqual(s.markUntil, 0);
  assert.strictEqual(w.pendingTimers(), 0);
  // Element names carry the creation count; the kind is what is said. The hearts and flair boxes are both divs.
  const gone = short(w.log.slice(at)).filter((x) => /class- (fx-heat|fx-robot|lit|breezy)$| remove$/.test(x))
    .map((x) => x.replace(/(div|span|img)\d+/, "$1")).filter((x) => !/^\d+ (screen|mark) class- dir/.test(x));
  assert.deepStrictEqual(gone.sort((a, b) => parseInt(a) - parseInt(b)), [
    "600 span remove", "1300 img remove", "2500 screen class- fx-heat", "2600 screen class- breezy", "2800 div remove",
    "3000 screen class- lit", "4200 div remove", "6000 screen class- fx-robot",
  ]);
});

test("D-reattach: a disconnect and a connect 100 ms later change nothing about when they end", () => {
  const w = fx({ methods: ["_houseFx", "_backlight", "_bondHearts"], consts: ["BACKLIGHT_MS"] });
  w.card._houseFx(w.slide, "fx-cool");
  w.card._backlight(w.slide);
  w.card._bondHearts(w.slide);
  w.run(500);
  w.disconnect();
  w.run(100);
  w.reconnect();
  w.settle();
  assert.deepStrictEqual(only(w.log, /^\d+ (screen class- (fx-cool|lit)|div1 remove)$/).filter((x) => !x.startsWith("0 ")), [
    "2500 screen class- fx-cool", "2800 div1 remove", "3000 screen class- lit",
  ]);
  assert.deepStrictEqual(shown(w), []);
});
