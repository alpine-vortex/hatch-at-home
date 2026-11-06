// Director migration slice 4 (pose, props, lean, ghost), the characterization: docs/plan-2026-11-06-director-migration.md
// 5.4 and 6.1. Each trace pins what the player could see, as `{ t, el, op, arg }`, for R71 (_poseEnd), R72 (_propShow's
// prop-out), R74-R75 (the pat lean and its release) and R57-R58 (the ghost frame and the ghost trail). It passes on the
// unmoved code (bare timers and a bare `animate` on the fake clock) and passes after the move (the same sites through the
// ledger), unchanged.
// Reduced motion is whatever the unmoved code does, both ways (F13): _poseEnd has no calm() of its own; _propShow adds the
// prop but never `prop-out` under calm; _patLean returns false with nothing done; _ghostFrame and _ghostTrail go through
// `_ghosting` (calm is one of its reasons), which these traces stub.
// "Called with no slide" (G8) has no case: every one of these reads s.pet, s.prop or s.ghost first and all their callers
// pass a slide.
// A forget mid-flight is a change (B1: the lean) or new (the ghost), so it has no trace here: pose_lean_ledger.test.js
// (the move commit) carries it.
// Side effects that are other methods (_show, _frames, _moving, _ghosting) are stubs; their calls are listed as `t name`.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");

const short = (log) => log.map((x) => `${x.t} ${x.el} ${x.op}${x.arg === undefined ? "" : ` ${x.arg}`}`);
const only = (log, re) => short(log).filter((x) => re.test(x));
const pet = (w) => [...w.slide.pet.cls].sort();
const shows = (w) => w.calls.filter((c) => c.name === "_show").map((c) => `${c.t} ${c.args[2]}`);

function pw(spec = {}, { calm = false } = {}) {
  const w = world(spec);
  w.calm = calm;
  return w;
}

// ---- R71: _poseEnd ----

const poseSpec = { methods: ["_poseEnd"], returns: { _frames: ["mood_1"] } };

test("_poseEnd puts the mood frame back at poseUntil + 30, clears the pose and the frame; calm does not change it", () => {
  for (const calm of [false, true]) {
    const w = pw({ ...poseSpec, slide: () => ({ frame: 3 }) }, { calm });
    w.slide.poseUntil = w.base + 2500;
    w.card._poseEnd(w.slide);
    w.settle();
    assert.deepStrictEqual(shows(w), ["2530 mood_1"], `calm ${calm}`);
    assert.strictEqual(w.slide.poseUntil, 0);
    assert.strictEqual(w.slide.frame, 0);
  }
});

test("_poseEnd with a pose already past, or none, does it at once (+30) or not at all", () => {
  const w = pw({ ...poseSpec });
  w.card._poseEnd(w.slide); // no poseUntil
  assert.strictEqual(w.horizon(), 0, "no timer");
  w.slide.poseUntil = w.base - 500; // already over: max(0, ...) + 30
  w.card._poseEnd(w.slide);
  w.settle();
  assert.deepStrictEqual(shows(w), ["30 mood_1"]);
});

test("_poseEnd does nothing when a newer pose owns the end: the older timer is a no-op, the newer puts the frame back", () => {
  const w = pw({ ...poseSpec });
  w.slide.poseUntil = w.base + 2000;
  w.card._poseEnd(w.slide);
  w.run(500);
  w.slide.poseUntil = w.base + 3000; // a newer pose
  w.card._poseEnd(w.slide);
  w.settle();
  assert.deepStrictEqual(shows(w), ["3030 mood_1"], "the 2030 timer found a newer pose and did nothing");
  assert.strictEqual(w.slide.poseUntil, 0);
});

test("_poseEnd does not show the frame under a scene, and not when there are no frames", () => {
  const a = pw({ ...poseSpec, slide: () => ({ scene: { kind: "care" } }) });
  a.slide.poseUntil = a.base + 100;
  a.card._poseEnd(a.slide);
  a.settle();
  assert.deepStrictEqual(shows(a), []);
  assert.strictEqual(a.slide.poseUntil, 0, "the pose is still over");
  const b = pw({ methods: ["_poseEnd"], returns: { _frames: [] } });
  b.slide.poseUntil = b.base + 100;
  b.card._poseEnd(b.slide);
  b.settle();
  assert.deepStrictEqual(shows(b), []);
});

// ---- R72: _propShow ----

const propSpec = { methods: ["_propShow"], screen: true };

test("_propShow shows the prop and adds prop-out at ms - 300; not under calm", () => {
  const w = pw(propSpec);
  w.card._propShow(w.slide, "fox/bowl", 1500);
  w.settle();
  assert.deepStrictEqual(only(w.log, /class\+ prop-out/), ["1200 prop class+ prop-out"]);
  assert.deepStrictEqual(shows(w), ["0 fox/bowl"]);
  assert.strictEqual(w.slide.propUntil, w.base + 1500);
  const c = pw(propSpec, { calm: true });
  c.card._propShow(c.slide, "fox/bowl", 1500);
  c.settle();
  assert.deepStrictEqual(only(c.log, /class\+ prop-out/), [], "calm: the prop stays, the timer does nothing");
  assert.deepStrictEqual(shows(c), ["0 fox/bowl"]);
});

test("a second _propShow at 200 cancels the first's timer: prop-out comes once, at the second's ms - 300", () => {
  const w = pw(propSpec);
  w.card._propShow(w.slide, "fox/a", 1500);
  w.run(200);
  w.card._propShow(w.slide, "fox/b", 1500);
  w.settle();
  assert.deepStrictEqual(only(w.log, /class\+ prop-out/), ["1400 prop class+ prop-out"]);
  assert.deepStrictEqual(shows(w), ["0 fox/a", "200 fox/b"]);
});

test("a prop shown for less than 300 ms: the out timer is due at once", () => {
  const w = pw(propSpec);
  w.card._propShow(w.slide, "fox/a", 100);
  w.settle();
  assert.deepStrictEqual(only(w.log, /class\+ prop-out/), ["0 prop class+ prop-out"]);
});

test("prop-out is not added when propUntil has moved on (another caller owns the prop), and the class string is the caller's", () => {
  const w = pw(propSpec);
  w.card._propShow(w.slide, "fox/a", 1500, "above wag");
  assert.strictEqual(w.slide.prop.className, "prop above wag");
  w.run(100);
  w.slide.propUntil = 0; // something else took the prop
  w.settle();
  assert.deepStrictEqual(only(w.log, /class\+ prop-out/), []);
});

// ---- R74-R75: the pat lean ----

const leanSpec = { methods: ["_patLean", "_patLeanOff"], slide: () => ({ moodState: "content" }) };
const lean = (log) => only(log, /class[+-] lean/);

test("_patLean adds lean-l and releases at holdMs: lean-rel on, lean-l off, then lean-rel gone at 300", () => {
  const w = pw(leanSpec);
  assert.strictEqual(w.card._patLean(w.slide, "l", 1000), true);
  assert.deepStrictEqual(pet(w), ["lean-l"]);
  w.settle();
  assert.deepStrictEqual(lean(w.log), [
    "0 pet class- lean-rel", "0 pet class- lean-r", "0 pet class- lean-sick", "0 pet class+ lean-l",
    "1000 pet class+ lean-rel", "1000 pet class- lean-l", "1000 pet class- lean-r",
    "1300 pet class- lean-rel", "1300 pet class- lean-sick",
  ]);
  assert.deepStrictEqual(pet(w), []);
  assert.deepStrictEqual(w.calls.filter((c) => c.name === "_moving").map((c) => `${c.t} ${c.args[1]}`), ["0 1300"]);
});

test("a sick pet leans slower: lean-sick is on, and lean-rel goes at 450", () => {
  const w = pw({ ...leanSpec, slide: () => ({ moodState: "sick" }) });
  w.card._patLean(w.slide, "r", 800);
  assert.deepStrictEqual(pet(w), ["lean-r", "lean-sick"]);
  w.settle();
  assert.deepStrictEqual(lean(w.log).slice(-5), [
    "800 pet class+ lean-rel", "800 pet class- lean-l", "800 pet class- lean-r",
    "1250 pet class- lean-rel", "1250 pet class- lean-sick",
  ]);
  assert.deepStrictEqual(pet(w), []);
});

test("a new pat inside the hold clears both timers: the lean is held to the new holdMs, and switches side", () => {
  const w = pw(leanSpec);
  w.card._patLean(w.slide, "l", 1000);
  w.run(600);
  w.card._patLean(w.slide, "r", 1000);
  w.run(500); // 1100: past the first hold's end
  assert.deepStrictEqual(pet(w), ["lean-r"], "the first release never came");
  w.settle();
  assert.deepStrictEqual(only(w.log, /class\+ lean-rel/), ["1600 pet class+ lean-rel"]);
  assert.deepStrictEqual(pet(w), []);
});

test("a new pat during the release (lean-rel on, 100 ms in) clears the release timer: lean-rel is not dropped at 300", () => {
  const w = pw(leanSpec);
  w.card._patLean(w.slide, "l", 1000);
  w.run(1100); // released at 1000, lean-rel to go at 1300
  assert.deepStrictEqual(pet(w), ["lean-rel"]);
  w.card._patLean(w.slide, "l", 1000); // 1100
  w.run(250); // 1350: past the old release
  assert.deepStrictEqual(pet(w), ["lean-l"], "lean-rel was taken off by the new pat, not by the old timer, and lean-l stays");
  w.settle();
  assert.deepStrictEqual(only(w.log, /class\+ lean-rel/), ["1000 pet class+ lean-rel", "2100 pet class+ lean-rel"]);
  assert.deepStrictEqual(pet(w), []);
});

test("_patLeanOff by hand lets go at once and clears the hold timer; it does nothing with no lean on", () => {
  const w = pw(leanSpec);
  w.card._patLeanOff(w.slide);
  assert.deepStrictEqual(lean(w.log), [], "no lean, nothing");
  w.card._patLean(w.slide, "l", 5000);
  w.run(200);
  w.card._patLeanOff(w.slide);
  assert.deepStrictEqual(pet(w), ["lean-rel"]);
  w.settle();
  assert.deepStrictEqual(only(w.log, /^(200|500) pet class[+-] lean-(rel|l)/), [
    "200 pet class+ lean-rel", "200 pet class- lean-l", "500 pet class- lean-rel",
  ]);
  assert.strictEqual(only(w.log, /class\+ lean-rel/).length, 1, "the 5000 hold timer never fired its own release");
});

test("no lean under calm, with no side (a key), on .look, or on a wander; each returns false and starts nothing", () => {
  const cases = [
    [{ calm: true }, "l", () => {}],
    [{}, undefined, () => {}],
    [{}, "l", (w) => w.slide.pet.classList.add("look")],
    [{}, "r", (w) => w.slide.pet.classList.add("wander-l")],
  ];
  for (const [opt, side, setup] of cases) {
    const w = pw(leanSpec, opt);
    setup(w);
    const before = w.log.length;
    assert.strictEqual(w.card._patLean(w.slide, side, 1000), false, JSON.stringify([opt, side]));
    assert.deepStrictEqual(short(w.log.slice(before)), []);
    assert.strictEqual(w.horizon(), 0, "no timer");
  }
});

// ---- R57-R58: the ghost ----

const ghostSpec = {
  methods: ["_ghostFrame", "_ghostTrail"], returns: { _ghosting: true },
  globals: { getComputedStyle: () => ({ transitionDuration: "0.25s", transitionDelay: "0s" }) },
  slide: (el) => ({ ghost: el("ghost"), ghostUntil: 0 }),
};

test("a frame swap sets the ghost's src and fades it from 35% in 180 ms", () => {
  const w = pw(ghostSpec);
  w.card._ghostFrame(w.slide, "old.png");
  assert.strictEqual(w.slide.ghost.attrs.src, "old.png");
  assert.deepStrictEqual(short(w.log), ["0 ghost animate 180"]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(w.slide.ghost.getAnimations().map((a) => a.frames))), [[{ opacity: 0.35 }, { opacity: 0 }]]);
  w.settle();
  assert.deepStrictEqual(w.slide.ghost.getAnimations().length, 0, "it finished");
});

test("a frame swap does nothing while the pet is animating, turned, or the ghost is still in its trail, or not ghosting", () => {
  const busy = pw(ghostSpec);
  busy.slide.pet.animate([], 1000);
  busy.card._ghostFrame(busy.slide, "old.png");
  assert.deepStrictEqual(only(busy.log, /ghost animate/), [], "a pet animation is running");
  const look = pw(ghostSpec);
  look.slide.pet.classList.add("look");
  look.card._ghostFrame(look.slide, "old.png");
  assert.deepStrictEqual(only(look.log, /ghost animate/), [], "turned");
  const trailing = pw(ghostSpec);
  trailing.slide.ghostUntil = trailing.base + 300;
  trailing.card._ghostFrame(trailing.slide, "old.png");
  assert.deepStrictEqual(only(trailing.log, /ghost animate/), [], "ghostUntil is ahead");
  trailing.run(300);
  trailing.card._ghostFrame(trailing.slide, "old.png");
  assert.deepStrictEqual(only(trailing.log, /ghost animate/), ["300 ghost animate 180"], "and then it may");
  const off = pw({ ...ghostSpec, returns: { _ghosting: false } });
  off.card._ghostFrame(off.slide, "old.png");
  assert.deepStrictEqual(off.log, []);
  assert.strictEqual(off.slide.ghost.attrs.src, undefined);
});

test("a trail follows the pet: duration turn + move + 300, 30% to the catch-up offset, ghostUntil set", () => {
  const w = pw(ghostSpec);
  w.slide.pet.setAttribute("src", "pet.png");
  w.card._ghostTrail(w.slide);
  assert.deepStrictEqual(short(w.log), ["0 ghost animate 550"]);
  assert.strictEqual(w.slide.ghost.attrs.src, "pet.png");
  assert.strictEqual(w.slide.ghostUntil, w.base + 550);
  const [a] = w.slide.ghost.getAnimations();
  assert.strictEqual(a.frames[1].offset, 370 / 550);
  w.settle();
  assert.strictEqual(w.slide.ghost.getAnimations().length, 0);
});

test("a wander left turns first: the trail is turn + move + 300 = 900 (the transition delay is the turn)", () => {
  const w = pw({ ...ghostSpec, globals: { getComputedStyle: () => ({ transitionDuration: "0.4s", transitionDelay: "0.2s" }) } });
  w.card._ghostTrail(w.slide);
  assert.deepStrictEqual(short(w.log), ["0 ghost animate 900"]);
});

test("a second trail at 200 cancels the earlier animations (the ghost's own getAnimations().forEach(cancel)), then makes its own", () => {
  const w = pw(ghostSpec);
  w.card._ghostTrail(w.slide);
  w.run(200);
  w.card._ghostTrail(w.slide);
  assert.deepStrictEqual(short(w.log), ["0 ghost animate 550", "200 ghost anim-cancel", "200 ghost animate 550"]);
  assert.strictEqual(w.slide.ghost.getAnimations().length, 1);
  assert.strictEqual(w.slide.ghostUntil, w.base + 750);
  w.settle();
  assert.strictEqual(w.slide.ghost.getAnimations().length, 0);
});

test("a trail when not ghosting cancels the earlier animations and makes none", () => {
  const spec = { ...ghostSpec, returns: { _ghosting: true } };
  const w = pw(spec);
  w.card._ghostTrail(w.slide);
  w.run(100);
  spec.returns._ghosting = false;
  w.card._ghostTrail(w.slide);
  assert.deepStrictEqual(short(w.log), ["0 ghost animate 550", "100 ghost anim-cancel"]);
  assert.strictEqual(w.slide.ghost.getAnimations().length, 0);
});
