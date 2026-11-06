// Director migration slice 3 (pet body one-shots), after the move: what a forget does to each row (plan 3.14, 6.1 step 3)
// and what a disconnect keeps (D-keep, D-reattach). `detach` is what _forget calls on the slide. R60 look, R61 wander and
// R63 turn are "end" (the class comes off at once); R68 the speck is "end" (the node comes off), R67 its follow-look is
// "drop"; R62 the art put, R64 after-turn, R65 perk2, R66 the chirp, R70 the yawn and R73 the shake are "drop" (nothing
// fires on the slide's next pet). B1 is the change: before this slice none of them was cleared at a forget.
// The times are pinned by pet_oneshots_trace.test.js. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");

const short = (log) => log.map((x) => `${x.t} ${x.el} ${x.op}${x.arg === undefined ? "" : ` ${x.arg}`}`);
const pet = (w) => [...w.slide.pet.cls].sort();

function pw(spec = {}) {
  return world({
    ...spec,
    globals: { TURN_MS: 200, pick: (l) => l[0], ...(spec.globals || {}) },
  });
}
const ALL = ["_look", "_wander", "_swapFlip", "_afterTurn", "_moving", "_trickMove", "_promiseMove"];

test("a forget mid-look, mid-wander and mid-flip takes every class off at once; nothing is left on the ledger", () => {
  const w = pw({ methods: ALL });
  const s = w.slide;
  w.card._look(s, 600);
  w.card._wander(s, 2000);
  w.card._swapFlip(s, () => w.mark("put"));
  w.card._afterTurn(s, () => w.mark("after"));
  w.advance(50);
  assert.deepStrictEqual(pet(w), ["look", "turn", "wander-l"]);
  assert.strictEqual(w.director.pending(s), 5, "look, wander, turn, the art put and the after-turn");
  w.director.detach(s);
  assert.strictEqual(w.director.pending(s), 0);
  assert.deepStrictEqual(pet(w), []);
  const after = w.log.length;
  w.advance(10000);
  assert.deepStrictEqual(w.log.slice(after), [], "no put, no after-turn, no late class change on the next pet");
  assert.strictEqual(w.pendingTimers(), 0);
});

test("B1: the next pet's look on a reused slide is its own, not cut short by the last pet's timer", () => {
  const w = pw({ methods: ALL });
  const s = w.slide;
  w.card._look(s, 600);
  w.advance(300);
  w.director.detach(s); // the slide is reused for another pet
  w.card._look(s, 600); // 300: the next pet's, due at 900
  w.advance(400); // 700: past the last pet's 600
  assert.deepStrictEqual(pet(w), ["look"]);
  w.advance(200);
  assert.deepStrictEqual(pet(w), []);
});

test("a forget mid-flip drops the art put: the next pet's art is not swapped", () => {
  const w = pw({ methods: ALL });
  w.card._swapFlip(w.slide, () => w.mark("put"));
  w.advance(50);
  w.director.detach(w.slide);
  w.advance(1000);
  assert.deepStrictEqual(short(w.log).filter((x) => /mark/.test(x)), []);
  assert.deepStrictEqual(pet(w), []);
});

test("the second timers are dropped at a forget: perk2, the song's chirp", () => {
  const w = pw({ methods: ALL });
  w.card._trickMove(w.slide, "perk2");
  w.card._promiseMove(w.slide, "song");
  w.advance(100);
  w.director.detach(w.slide);
  w.advance(1000);
  assert.deepStrictEqual(w.calls.filter((c) => c.t > 100).map((c) => c.name), [], "no second perk, no second chirp");
});

test("the yawn and the shake are dropped at a forget", () => {
  const w = pw({
    methods: ["_reactFrames", "_reactMove", "_look", "_moving"], consts: ["REACT_MS", "READY_MS"],
    globals: { REACTIONS: { pat: { mood: "excited", move: true } }, STAGE_POSES: {} },
    slide: () => ({ species: { moods: ["sleepy", "excited"], frames: 2 }, drawn: "child", speciesId: "sp", scene: null }),
  });
  w.card._reactFrames(w.slide, "pat", { variant: "yawn" });
  w.card._reactMove(w.slide, "pat", { move: true }, { variant: "shake" });
  w.advance(100);
  w.director.detach(w.slide);
  w.advance(5000);
  assert.deepStrictEqual(w.calls.filter((c) => c.t > 100).map((c) => c.name), [], "no hop at 900, no second flip at 550");
  assert.deepStrictEqual(pet(w), []);
});

test("the speck: a forget takes the node away at once and drops the follow-look", () => {
  const w = pw({
    methods: ["_idle", "_look", "_moving"], screen: true, consts: ["IDLE_MIN_MS", "IDLE_SPREAD_MS", "IDLE_BODY_MOVES"],
    globals: { Math: Object.assign(Object.create(Math), { random: () => 0.1 }) }, // right to left: the look is at 1200
    returns: { _idleMoves: ["speck"], _idleScale: 1, _free: true },
    slide: () => ({ nextIdle: 1, drawn: "adult", species: {} }),
  });
  w.card._idle(w.slide);
  w.advance(500);
  assert.deepStrictEqual(w.slide.screen.children.map((k) => k.name), ["span1"]);
  w.director.detach(w.slide);
  assert.deepStrictEqual(w.slide.screen.children.map((k) => k.name), []);
  assert.strictEqual(w.director.pending(w.slide), 0);
  const after = w.log.length;
  w.advance(10000);
  assert.deepStrictEqual(w.log.slice(after), [], "the pet does not look after a speck that is gone");
});

test("an A1 re-arm runs no undo: a second flip leaves turn on, and one turn entry", () => {
  const w = pw({ methods: ALL });
  w.card._swapFlip(w.slide, () => {});
  w.advance(100);
  const before = w.log.length;
  w.card._swapFlip(w.slide, () => {});
  assert.strictEqual(w.director.pending(w.slide), 2, "one turn entry (the first replaced) and the second flip's art put");
  assert.deepStrictEqual(short(w.log.slice(before)), ["100 pet class- turn", "100 pet reflow", "100 pet class+ turn"],
    "only the restart took the class off");
  assert.deepStrictEqual(pet(w), ["turn"]);
});

test("D-keep: a disconnect ends nothing; the look, the wander and the flip end on their own times", () => {
  const w = pw({ methods: ALL });
  w.card._look(w.slide, 600);
  w.card._wander(w.slide, 2000);
  w.card._swapFlip(w.slide, () => w.mark("put"));
  w.advance(100);
  w.disconnect();
  w.advance(10000);
  assert.deepStrictEqual(pet(w), []);
  assert.deepStrictEqual(short(w.log).filter((x) => /class- (look|turn|wander-l)|mark/.test(x)), [
    "0 pet class- turn", "100 test mark put", "200 pet class- turn", "600 pet class- look", "2000 pet class- wander-l",
    "2000 pet class- look",
  ]);
});

test("D-reattach: disconnect, connect 100 ms later, advance to the longest due time: the same end state", () => {
  const w = pw({ methods: ALL });
  w.card._look(w.slide, 600);
  w.card._wander(w.slide, 2000);
  w.advance(100);
  w.disconnect();
  w.advance(100);
  w.reconnect();
  w.advance(10000);
  assert.deepStrictEqual(pet(w), []);
  assert.strictEqual(w.director.pending(w.slide), 0);
});
