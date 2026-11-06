// Director migration slice 3 (pet body one-shots in _tick), the characterization: docs/plan-2026-11-06-director-migration.md
// 5.3 and 6.1. Each trace pins what the player could see, as `{ t, el, op, arg }`, for R60 (_look), R61 (_wander), R62-R63
// (_swapFlip), R64 (_afterTurn), R65 (perk2, through _trickMove), R66 (the song's second chirp, through _promiseMove),
// R67-R68 (the idle speck, through _idle), R70 (the yawn, through _reactFrames) and R73 (the head shake, through
// _reactMove). It passes on the unmoved code (bare timers on the fake clock) and passes after the move (the same sites
// through the ledger), with one edit: the B3 case below, which the move commit replaced.
// Reduced motion is whatever the unmoved code does, both ways (F13): _look, _wander, _swapFlip, _afterTurn and _idle's
// speck make their moves with no calm() check of their own (their callers check); _trickMove, _promiseMove's
// payoff and _reactMove return early under calm. "Called with no slide" (G8) has no case: every one of these reads
// s.pet or s.screen first and all their callers pass a slide.
// A forget mid-flight is a change (B1), so it has no trace here: pet_oneshots_ledger.test.js (the move commit) carries it.
// Side effects that are other methods (_animate, _chirp, _show) are stubs; their calls are listed as `t name arg`.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");

const short = (log) => log.map((x) => `${x.t} ${x.el} ${x.op}${x.arg === undefined ? "" : ` ${x.arg}`}`);
const only = (log, re) => short(log).filter((x) => re.test(x));
// The stubbed card methods that were called, as `t name arg`.
const calls = (w, ...names) => w.calls.filter((c) => names.includes(c.name))
  .map((c) => `${c.t} ${c.name}${c.name === "_animate" ? ` ${c.args[2]} ${c.args[3]}` : c.name === "_chirp" ? ` ${c.args[1]}` : ""}`);
const pet = (w) => [...w.slide.pet.cls].sort();

// A world; `side` "wander-l" makes pick() the first of the list, else the last.
function pw(spec = {}, { calm = false, side = "wander-l" } = {}) {
  const w = world({
    ...spec,
    globals: { TURN_MS: 200, pick: (l) => (side === "wander-l" ? l[0] : l[l.length - 1]), ...(spec.globals || {}) },
  });
  w.calm = calm;
  return w;
}

// ---- R60: _look ----

const lookSpec = { methods: ["_look", "_moving"] };

test("_look adds look at once and removes it at ms; no reflow; calm both ways", () => {
  for (const calm of [false, true]) {
    const w = pw(lookSpec, { calm });
    w.card._look(w.slide, 600);
    w.settle();
    assert.deepStrictEqual(short(w.log), ["0 pet class+ look", "600 pet class- look"], `calm ${calm}`);
    assert.ok(w.slide.movingUntil >= w.base + 850, "a hat waits: movingUntil is ms + 250 on");
  }
});

test("a second _look at 300 does NOT extend the first: the first timer removes look at 600, the second's at 900 is a no-op", () => {
  const w = pw(lookSpec);
  w.card._look(w.slide, 600);
  w.run(300);
  w.card._look(w.slide, 600);
  w.run(400); // 700: past the first timer
  assert.deepStrictEqual(pet(w), [], "the first call's timer took the class off at 600");
  w.settle();
  assert.deepStrictEqual(only(w.log, /class[+-]/), [
    "0 pet class+ look", "300 pet class+ look", "600 pet class- look", "900 pet class- look",
  ]);
});

// ---- R61: _wander ----

const wanderSpec = { methods: ["_wander", "_moving"] };

test("_wander left adds wander-l and look, removes both at ms; calm both ways", () => {
  for (const calm of [false, true]) {
    const w = pw(wanderSpec, { calm, side: "wander-l" });
    w.card._wander(w.slide, 2000);
    w.settle();
    assert.deepStrictEqual(short(w.log), [
      "0 pet class+ wander-l", "0 pet class+ look", "2000 pet class- wander-l", "2000 pet class- look",
    ], `calm ${calm}`);
  }
});

test("_wander right adds only wander-r and still removes the side and look at ms", () => {
  const w = pw(wanderSpec, { side: "wander-r" });
  w.card._wander(w.slide, 2000);
  w.settle();
  assert.deepStrictEqual(short(w.log), ["0 pet class+ wander-r", "2000 pet class- wander-r", "2000 pet class- look"]);
});

test("a second _wander at 1000 does not extend the first: the first removes both at 2000, the second's at 3000 is a no-op", () => {
  const w = pw(wanderSpec, { side: "wander-l" });
  w.card._wander(w.slide, 2000);
  w.run(1000);
  w.card._wander(w.slide, 2000);
  w.run(1500); // 2500
  assert.deepStrictEqual(pet(w), []);
  w.settle();
  assert.deepStrictEqual(only(w.log, /class-/), [
    "2000 pet class- wander-l", "2000 pet class- look", "3000 pet class- wander-l", "3000 pet class- look",
  ]);
});

// ---- R62-R63: _swapFlip (200 ms; put at 100) ----

const flipSpec = { methods: ["_swapFlip", "_moving"] };

test("_swapFlip: turn on with a reflow, put at 100, turn off at 200; calm both ways", () => {
  for (const calm of [false, true]) {
    const w = pw(flipSpec, { calm });
    w.card._swapFlip(w.slide, () => w.mark("put"));
    w.settle();
    assert.deepStrictEqual(short(w.log), [
      "0 pet class- turn", "0 pet reflow", "0 pet class+ turn", "100 test mark put", "200 pet class- turn",
    ], `calm ${calm}`);
    assert.strictEqual(w.slide.turnUntil, w.base + 200);
  }
});

// B3 (the audit bug, plan 0), AFTER the move: the removal is keyed and the second flip replaces the first silently, so
// the class the second flip added stays to its own end, 300. (Before the move this trace ended `turn` at 200, cut
// short by the first flip's timer: "0 ... 100 put1, class- turn, reflow, class+ turn ... 200 class- turn, put2".)
test("B3 (after): two flips 100 ms apart; the second flip's turn stays to its own end, 300", () => {
  const w = pw(flipSpec);
  w.card._swapFlip(w.slide, () => w.mark("put1"));
  w.run(100);
  w.card._swapFlip(w.slide, () => w.mark("put2"));
  w.run(150); // 250: past the first flip's 200
  assert.deepStrictEqual(pet(w), ["turn"], "B3: still turning at 250");
  w.settle();
  assert.deepStrictEqual(short(w.log), [
    "0 pet class- turn", "0 pet reflow", "0 pet class+ turn",
    "100 test mark put1", "100 pet class- turn", "100 pet reflow", "100 pet class+ turn",
    "200 test mark put2", "300 pet class- turn",
  ]);
});

test("two flips 300 ms apart: each turn runs its own 200 ms, nothing is cut", () => {
  const w = pw(flipSpec);
  w.card._swapFlip(w.slide, () => w.mark("put1"));
  w.run(300);
  w.card._swapFlip(w.slide, () => w.mark("put2"));
  w.settle();
  assert.deepStrictEqual(only(w.log, /mark|class[+-] turn/), [
    "0 pet class- turn", "0 pet class+ turn", "100 test mark put1", "200 pet class- turn",
    "300 pet class- turn", "300 pet class+ turn", "400 test mark put2", "500 pet class- turn",
  ]);
});

// ---- R64: _afterTurn ----

const afterSpec = { methods: ["_swapFlip", "_afterTurn", "_moving"] };

test("_afterTurn with no flip runs fn at once; calm both ways", () => {
  for (const calm of [false, true]) {
    const w = pw(afterSpec, { calm });
    w.card._afterTurn(w.slide, () => w.mark("fn"));
    assert.deepStrictEqual(short(w.log), ["0 test mark fn"], `calm ${calm}`);
    assert.strictEqual(w.pendingTimers(), 0);
  }
});

test("_afterTurn after a flip at 0 runs fn at the flip's remainder: 200 from 0, 150 from 50", () => {
  for (const [after, due] of [[0, 200], [50, 200]]) {
    const w = pw(afterSpec);
    w.card._swapFlip(w.slide, () => {});
    w.run(after);
    w.card._afterTurn(w.slide, () => w.mark("fn"));
    w.settle();
    assert.deepStrictEqual(only(w.log, /mark/), [`${due} test mark fn`], `asked at ${after}`);
  }
});

test("_afterTurn once the flip is done runs fn at once", () => {
  const w = pw(afterSpec);
  w.card._swapFlip(w.slide, () => {});
  w.run(250);
  w.card._afterTurn(w.slide, () => w.mark("fn"));
  assert.deepStrictEqual(only(w.log, /mark/), ["250 test mark fn"]);
});

// ---- R65: perk2, through _trickMove ----

test("a perk2 trick: a perk now and a second at 420; nothing under calm", () => {
  const w = pw({ methods: ["_trickMove"] });
  w.card._trickMove(w.slide, "perk2");
  w.settle();
  assert.deepStrictEqual(calls(w, "_animate"), ["0 _animate perk 320", "420 _animate perk 320"]);
  const c = pw({ methods: ["_trickMove"] }, { calm: true });
  c.card._trickMove(c.slide, "perk2");
  c.settle();
  assert.deepStrictEqual(calls(c, "_animate"), []);
  assert.strictEqual(c.horizon(), 0);
});

// ---- R66: the song promise's second chirp, through _promiseMove ----

test("a song payoff chirps now and again at 500; the practice chirps once; under calm the chirps still come", () => {
  for (const calm of [false, true]) {
    const w = pw({ methods: ["_promiseMove"] }, { calm });
    w.card._promiseMove(w.slide, "song");
    w.settle();
    assert.deepStrictEqual(calls(w, "_chirp"), ["0 _chirp win", "500 _chirp win"], `calm ${calm}`);
    const p = pw({ methods: ["_promiseMove"] }, { calm });
    p.card._promiseMove(p.slide, "song", true);
    p.settle();
    assert.deepStrictEqual(calls(p, "_chirp"), ["0 _chirp win"], `calm ${calm} practice`);
  }
});

// ---- R67-R68: the idle speck, through _idle ----

function speck(rtl, { calm = false } = {}) {
  const w = pw({
    methods: ["_idle", "_look", "_moving"], screen: true,
    consts: ["IDLE_MIN_MS", "IDLE_SPREAD_MS", "IDLE_BODY_MOVES"],
    globals: { Math: Object.assign(Object.create(Math), { random: () => (rtl ? 0.1 : 0.9) }) },
    returns: { _idleMoves: ["speck"], _idleScale: 1, _free: true },
    slide: () => ({ nextIdle: 1, drawn: "adult", species: {} }),
  }, { calm });
  w.card._idle(w.slide);
  w.settle();
  return w;
}

test("the speck: the pet looks at once (ltr) and the speck goes at 2700; calm both ways", () => {
  for (const calm of [false, true]) {
    const w = speck(false, { calm });
    assert.deepStrictEqual(only(w.log, /append|remove|class[+-] look/), [
      "0 screen append span1", "0 pet class+ look", "1300 pet class- look", "2700 span1 remove",
    ], `calm ${calm}`);
  }
});

test("the speck going right to left: the pet follows it at 1200 (look to 2500) and the speck goes at 2700", () => {
  const w = speck(true);
  assert.deepStrictEqual(only(w.log, /append|remove|class[+-] look/), [
    "0 screen append span1", "1200 pet class+ look", "2500 pet class- look", "2700 span1 remove",
  ]);
});

// ---- R70: the yawn, through _reactFrames ----

function yawn({ calm = false, change = false, over = false } = {}) {
  const w = pw({
    methods: ["_reactFrames"], consts: ["REACT_MS", "READY_MS"],
    globals: { REACTIONS: { pat: { mood: "excited" } }, STAGE_POSES: {} },
    slide: () => ({ species: { moods: ["sleepy", "excited"], frames: 2 }, drawn: "child", speciesId: "sp", scene: null }),
  }, { calm });
  w.card._reactFrames(w.slide, "pat", { variant: "yawn" });
  if (change) { w.run(500); w.slide.poseFrames = ["other"]; }
  if (over) { w.run(500); w.slide.poseUntil = 0; }
  w.settle();
  return w;
}
const shows = (w) => w.calls.filter((c) => c.name === "_show").map((c) => `${c.t} ${c.args[2]}`);

test("a yawn: the sleepy face now, the excited one with a greethop at 900; the pose end is asked for once", () => {
  const w = yawn();
  assert.deepStrictEqual(shows(w), ["0 child_sleepy_1", "900 child_excited_1"]);
  assert.deepStrictEqual(calls(w, "_animate"), ["900 _animate greethop 700"]);
  assert.deepStrictEqual(calls(w, "_poseEnd"), ["0 _poseEnd"]);
});

test("a yawn under calm: no yawn at all, the mood frame and the move path run instead", () => {
  const w = yawn({ calm: true });
  assert.deepStrictEqual(shows(w), ["0 child_excited_1"]);
  assert.deepStrictEqual(calls(w, "_animate"), []);
  assert.strictEqual(w.horizon(), 0, "no timer");
});

test("a yawn is cut: a newer pose at 500, or the pose over at 500, and the 900 timer does nothing", () => {
  for (const opt of [{ change: true }, { over: true }]) {
    const w = yawn(opt);
    assert.deepStrictEqual(shows(w), ["0 child_sleepy_1"], JSON.stringify(opt));
    assert.deepStrictEqual(calls(w, "_animate"), []);
  }
});

// ---- R73: the head shake, through _reactMove ----

function shake({ calm = false, newer = false } = {}) {
  const w = pw({ methods: ["_reactMove", "_look", "_moving"], slide: () => ({ poseUntil: 99999 }) }, { calm });
  w.card._reactMove(w.slide, "refused", { move: true }, { variant: "shake" });
  if (newer) { w.run(200); w.slide.poseUntil = 12345; }
  w.settle();
  return w;
}

test("a head shake: look 300 now and again at 550 while the reaction is the one on show", () => {
  const w = shake();
  assert.deepStrictEqual(short(w.log), [
    "0 pet class+ look", "300 pet class- look", "550 pet class+ look", "850 pet class- look",
  ]);
});

test("a head shake with a newer pose at 200: the second flip at 550 does not happen", () => {
  const w = shake({ newer: true });
  assert.deepStrictEqual(short(w.log), ["0 pet class+ look", "300 pet class- look"]);
});

test("a head shake under calm: nothing, no timer", () => {
  const w = shake({ calm: true });
  assert.deepStrictEqual(short(w.log), []);
  assert.strictEqual(w.horizon(), 0);
});
