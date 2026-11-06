// Director migration slice 4 (pose, props, lean, ghost), after the move: what a forget does to each row (plan 3.14, 6.1 step 3)
// and what a disconnect keeps (D-keep, D-reattach). `detach` is what _forget calls on the slide. R74-R75 the pat lean is "end"
// (one undo takes every lean-* class off at once, directly: A3, no timer started in a drain), R57-R58 the ghost animations are
// "end" (cancelled), R71 the pose end and R72 the prop-out are "drop" (nothing fires on the slide's next pet). B1 is the
// change for the lean: before this slice nothing cleared it at a forget, so the release timer stripped lean-* from the next pet.
// The times are pinned by pose_lean_trace.test.js. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");

const short = (log) => log.map((x) => `${x.t} ${x.el} ${x.op}${x.arg === undefined ? "" : ` ${x.arg}`}`);
const pet = (w) => [...w.slide.pet.cls].sort();
const shows = (w) => w.calls.filter((c) => c.name === "_show").map((c) => `${c.t} ${c.args[2]}`);

const LEAN = { methods: ["_patLean", "_patLeanOff"], slide: () => ({ moodState: "content" }) };
const GHOST = {
  methods: ["_ghostFrame", "_ghostTrail"], returns: { _ghosting: true },
  globals: { getComputedStyle: () => ({ transitionDuration: "0.25s", transitionDelay: "0s" }) },
  slide: (el) => ({ ghost: el("ghost"), ghostUntil: 0 }),
};

test("B1: a forget mid-lean takes every lean-* class off at once; nothing is pending; no lean-rel is left at 10 s (A3)", () => {
  const w = world(LEAN);
  w.card._patLean(w.slide, "l", 1000);
  w.advance(400);
  assert.deepStrictEqual(pet(w), ["lean-l"]);
  assert.strictEqual(w.director.pending(w.slide), 1);
  w.director.detach(w.slide);
  assert.strictEqual(w.director.pending(w.slide), 0);
  assert.deepStrictEqual(pet(w), []);
  assert.strictEqual(w.pendingTimers(), 0, "the undo started no timer");
  const after = w.log.length;
  w.advance(10000);
  assert.deepStrictEqual(w.log.slice(after), [], "no release, no late lean-rel on the next pet");
});

test("a forget mid-release (the lean-rel entry pending) ends it the same way, also for a sick pet", () => {
  for (const mood of ["content", "sick"]) {
    const w = world({ ...LEAN, slide: () => ({ moodState: mood }) });
    w.card._patLean(w.slide, "r", 1000);
    w.advance(1100);
    assert.ok(pet(w).includes("lean-rel"), mood);
    assert.strictEqual(w.director.pending(w.slide), 1);
    w.director.detach(w.slide);
    assert.strictEqual(w.director.pending(w.slide), 0);
    assert.deepStrictEqual(pet(w), [], mood);
    const after = w.log.length;
    w.advance(10000);
    assert.deepStrictEqual(w.log.slice(after), [], mood);
  }
});

test("B1: the next pet's lean on a reused slide is its own, not cut short by the last pet's release", () => {
  const w = world(LEAN);
  w.card._patLean(w.slide, "l", 1000);
  w.advance(600);
  w.director.detach(w.slide);
  w.card._patLean(w.slide, "r", 1000); // 600: due at 1600
  w.advance(600); // 1200: past the last pet's 1000
  assert.deepStrictEqual(pet(w), ["lean-r"]);
  w.advance(500);
  assert.deepStrictEqual(pet(w), ["lean-rel"]);
});

test("an A1 re-arm runs no undo: a second pat leaves one lean entry and takes only the other side's class off", () => {
  const w = world(LEAN);
  w.card._patLean(w.slide, "l", 1000);
  w.advance(300);
  const before = w.log.length;
  w.card._patLean(w.slide, "l", 1000);
  assert.strictEqual(w.director.pending(w.slide), 1);
  assert.deepStrictEqual(pet(w), ["lean-l"]);
  assert.deepStrictEqual(short(w.log.slice(before)), [
    "300 pet class- lean-rel", "300 pet class- lean-r", "300 pet class- lean-sick", "300 pet class+ lean-l",
  ], "the clears are the method's own, not an undo (which would also have taken lean-l off)");
});

test("_patLeanOff stops the hold entry without its undo, and the release is its own entry", () => {
  const w = world(LEAN);
  w.card._patLean(w.slide, "l", 5000);
  w.advance(200);
  w.card._patLeanOff(w.slide);
  assert.strictEqual(w.director.pending(w.slide), 1, "only the release is pending");
  assert.deepStrictEqual(pet(w), ["lean-rel"]);
  w.advance(10000);
  assert.deepStrictEqual(pet(w), []);
  assert.strictEqual(w.director.pending(w.slide), 0);
});

test("a forget cancels a ghost in flight and an unfinished trail; a finished ghost has left the ledger by itself", () => {
  const w = world(GHOST);
  w.card._ghostFrame(w.slide, "old.png");
  assert.strictEqual(w.director.pending(w.slide), 1);
  w.advance(200); // the 180 ms fade finished: its finish event completed the entry
  assert.strictEqual(w.director.pending(w.slide), 0, "F5: pending returns to 0 on its own");
  w.card._ghostTrail(w.slide);
  w.advance(100);
  assert.strictEqual(w.director.pending(w.slide), 1);
  w.director.detach(w.slide);
  assert.strictEqual(w.director.pending(w.slide), 0);
  assert.strictEqual(w.slide.ghost.getAnimations().length, 0, "cancelled");
  assert.deepStrictEqual(short(w.log).slice(-1), ["300 ghost anim-cancel"]);
});

test("a second trail: the first is cancelled by the method, its cancel event completes its own entry, one entry stays", () => {
  const w = world(GHOST);
  w.card._ghostTrail(w.slide);
  w.advance(100);
  w.card._ghostTrail(w.slide);
  assert.strictEqual(w.director.pending(w.slide), 1);
  w.advance(10000);
  assert.strictEqual(w.director.pending(w.slide), 0);
});

test("the pose end and the prop-out are dropped at a forget: the next pet's frame is not set, its prop not put out", () => {
  const w = world({ methods: ["_poseEnd", "_propShow"], returns: { _frames: ["mood_1"] }, screen: true });
  w.slide.poseUntil = w.base + 2500;
  w.card._poseEnd(w.slide);
  w.card._propShow(w.slide, "fox/bowl", 1500);
  w.advance(100);
  assert.strictEqual(w.director.pending(w.slide), 2);
  w.director.detach(w.slide);
  assert.strictEqual(w.director.pending(w.slide), 0);
  const after = w.log.length;
  w.advance(10000);
  assert.deepStrictEqual(short(w.log.slice(after)), []);
  assert.deepStrictEqual(shows(w), ["0 fox/bowl"]);
  assert.strictEqual(w.slide.poseUntil, w.base + 2500, "a drop leaves the state alone");
});

test("a second _propShow replaces the first entry silently: one entry, one prop-out", () => {
  const w = world({ methods: ["_propShow"], screen: true });
  w.card._propShow(w.slide, "fox/a", 1500);
  w.advance(200);
  w.card._propShow(w.slide, "fox/b", 1500);
  assert.strictEqual(w.director.pending(w.slide), 1);
});

test("D-keep: a disconnect ends nothing; the lean, the prop and the pose end land on their own times", () => {
  const w = world({ methods: ["_patLean", "_patLeanOff", "_poseEnd", "_propShow"], returns: { _frames: ["mood_1"] }, screen: true,
    slide: () => ({ moodState: "content" }) });
  w.slide.poseUntil = w.base + 2500;
  w.card._poseEnd(w.slide);
  w.card._propShow(w.slide, "fox/bowl", 1500);
  w.card._patLean(w.slide, "l", 1000);
  w.advance(100);
  w.disconnect();
  w.advance(10000);
  assert.deepStrictEqual(pet(w), []);
  assert.deepStrictEqual(short(w.log).filter((x) => /prop-out|lean-rel|lean-l/.test(x) && /^(1000|1200|1300) /.test(x)), [
    "1000 pet class+ lean-rel", "1000 pet class- lean-l", "1200 prop class+ prop-out", "1300 pet class- lean-rel",
  ]);
  assert.deepStrictEqual(shows(w), ["0 fox/bowl", "2530 mood_1"]);
  assert.strictEqual(w.director.pending(w.slide), 0);
});

test("D-keep for the ghost: a disconnect leaves the fade running to its end", () => {
  const w = world(GHOST);
  w.card._ghostTrail(w.slide);
  w.advance(100);
  w.disconnect();
  assert.strictEqual(w.slide.ghost.getAnimations().length, 1);
  w.advance(1000);
  assert.strictEqual(w.slide.ghost.getAnimations().length, 0);
  assert.strictEqual(w.director.pending(w.slide), 0);
});

test("D-reattach: disconnect, connect 100 ms later, advance to the longest due time: the same end state", () => {
  const w = world({ methods: ["_patLean", "_patLeanOff"], slide: () => ({ moodState: "sick" }) });
  w.card._patLean(w.slide, "r", 1000);
  w.advance(100);
  w.disconnect();
  w.advance(100);
  w.reconnect();
  w.advance(10000);
  assert.deepStrictEqual(pet(w), []);
  assert.strictEqual(w.director.pending(w.slide), 0);
});
