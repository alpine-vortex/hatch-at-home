// Care reactions ship C, touch (docs/plan-2026-11-02-care-reactions.md 5.4, 13): the zone maths, the run
// counter (patStep) and the card's _pat ladder, with no DOM.
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");
const { adapters } = require("./timer_trace");

const src = require("./card-source");
const method = (name) => src.match(new RegExp(`\\n  ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n  \\}\\n`))[0];
// A one-line const (its comment may follow the `;`), else the block to the first `;` at a line end.
const konst = (name) => (src.match(new RegExp(`\\nconst ${name} = [^\\n]*;[^\\n]*\\n`)) || src.match(new RegExp(`\\nconst ${name} = [\\s\\S]*?;\\n`)))[0];
const func = (name) => src.match(new RegExp(`\\nfunction ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}\\n`))[0];

const CONSTS = ["PAT_RUN_GAP_MS", "PAT_RUN_MAX_MS", "PAT_QUIET_MS", "PAT_FLOP_AT", "PAT_HEAD", "PAT_LEAN_MS", "PAT_LEAN_LONG_MS",
  "PAT_SPOT_MAX_N", "PAT_SPOT_ODDS", "PAT_COOLDOWN_MS", "PAT_MS", "EGG_PAT_LINE", "PAT_LINES", "REACT_MS", "READY_MS", "REACTIONS", "MINE"];
const base = () => {
  const ctx = { Date, Number, Math };
  vm.runInNewContext(`${CONSTS.map(konst).join("")}${func("patZone")}${func("patStep")}` +
    `const PAT_SPOT = "that's the spot!! ♥"; const PAT_RUN_LINES = ${konst("PAT_RUN_LINES").replace(/^\nconst PAT_RUN_LINES = /, "").replace(/;\n$/, "")};` +
    `this.patZone = patZone; this.patStep = patStep; this.PAT_RUN_LINES = PAT_RUN_LINES;`, ctx);
  return ctx;
};
const { patZone, patStep } = base();

test("the zone maths: the top 40% is the head, the side is left or right of the middle", () => {
  const rect = { left: 100, top: 200, width: 100, height: 200 };
  assert.deepStrictEqual({ ...patZone(rect, 120, 210, 1) }, { zone: "head", side: "l" });
  assert.deepStrictEqual({ ...patZone(rect, 180, 279, 1) }, { zone: "head", side: "r" });
  assert.deepStrictEqual({ ...patZone(rect, 120, 281, 1) }, { zone: "body", side: "l" });
  assert.deepStrictEqual({ ...patZone(rect, 180, 399, 1) }, { zone: "body", side: "r" });
});

test("a key, a missing or a non-finite point, and an empty box are the head with no side, never NaN", () => {
  const rect = { left: 0, top: 0, width: 100, height: 100 };
  const head = { zone: "head", side: null };
  for (const got of [patZone(rect, 10, 90, 0), patZone(rect, undefined, undefined, undefined), patZone(rect, NaN, 5, 1),
    patZone(rect, 5, Infinity, 1), patZone(null, 5, 5, 1), patZone({ ...rect, width: 0 }, 5, 5, 1), patZone(rect, 5, 5, 0)]) {
    assert.deepStrictEqual({ ...got }, head);
  }
});

test("patStep: pats within 5 s make a run, n counts them, the tenth flops", () => {
  let run = null;
  const ns = [];
  for (let i = 0; i < 10; i++) {
    const r = patStep(run, 1000 + i * 2000); // every 2 s
    ns.push(r.n);
    run = r.run;
    assert.strictEqual(r.flop, i === 9);
    assert.strictEqual(r.quiet, false);
  }
  assert.deepStrictEqual(ns, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.strictEqual(run.n, 11);
  assert.strictEqual(run.quietUntil, 1000 + 9 * 2000 + 8000);
});

test("patStep: a gap over 5 s starts a new run, and a run ends 30 s after its first pat", () => {
  let r = patStep(null, 0);
  r = patStep(r.run, 5000); // exactly 5 s is still the run
  assert.strictEqual(r.n, 2);
  r = patStep(r.run, 10001);
  assert.strictEqual(r.n, 1);
  let run = patStep(null, 0).run;
  let at = 0;
  let n = 0;
  while (at < 28000) { at += 4000; const x = patStep(run, at); run = x.run; n = x.n; } // 4 s apart: n 2..8 by 28 s
  assert.strictEqual(n, 8);
  assert.strictEqual(patStep(run, 32000).n, 1, "a 30 s old run starts again even with pats 4 s apart");
});

test("patStep: 11+ is the quiet; pats in it do not count or extend it; the first after it is n = 1", () => {
  let run = null;
  let flopAt = 0;
  for (let i = 0; i < 10; i++) { flopAt = i * 1000; run = patStep(run, flopAt).run; }
  const until = run.quietUntil;
  assert.strictEqual(until, flopAt + 8000);
  for (const dt of [500, 2000, 7999]) {
    const r = patStep(run, flopAt + dt);
    assert.strictEqual(r.quiet, true);
    assert.strictEqual(r.n, 11);
    assert.strictEqual(r.flop, false);
    assert.strictEqual(r.run.quietUntil, until, "not extended");
    run = r.run;
  }
  const after = patStep(run, until); // a pat 2 s after the last quiet one, whatever the 5 s window says
  assert.strictEqual(after.n, 1);
  assert.strictEqual(after.quiet, false);
  assert.strictEqual(after.run.quietUntil, 0);
  // a user tapping every 2 s sees ten pats, a flop, the quiet, then the ladder from the top: never a loop of flops
  let r2 = null;
  const flops = [];
  for (let t = 0; t < 50000; t += 2000) { const x = patStep(r2, t); r2 = x.run; if (x.flop) flops.push(t); }
  assert.deepStrictEqual(flops, [18000, 44000]);
});

// A card with the real _pat ladder around stubs that record what happens.
function card({ calm = false, random = 0.99, klass = [], mood = "content", drawn = "adult", egg = false, asleep = false } = {}) {
  const log = { reacted: [], animated: [], lines: [], hearts: 0, looks: 0, poses: 0 };
  const classes = new Set(klass);
  const ctx = {
    calm: () => calm, Date, Number, Math: { ...Math, random: () => random }, MINE: 4, pick: (l) => l[0],
  };
  vm.runInNewContext(`${CONSTS.map(konst).join("")}${func("patZone")}${func("patStep")}` +
    `const PAT_SPOT = "that's the spot!! ♥"; const PAT_RUN_LINES = ${konst("PAT_RUN_LINES").replace(/^\nconst PAT_RUN_LINES = /, "").replace(/;\n$/, "")};` +
    `this.api = {${["_pat", "_patMove", "_patFlop", "_patLean", "_patLeanOff", "_patAsleep", "_patEgg", "_patSay"].map(method).join(",\n")}};`, ctx);
  const s = { pet: { classList: { contains: (c) => classes.has(c), add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), [Symbol.iterator]: () => classes[Symbol.iterator]() } },
    pat: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) },
    species: { moods: ["content", "sleepy", "cozy"], frames: 2, extras: {}, reactions: {} },
    moodState: mood, drawn, egg, asleep, poseUntil: 0 };
  const self = {
    ...ctx.api, ...adapters(), // the ledger the lean's timers go on (nothing is scheduled)
    _patOn: () => true, _swiped: false, _tapped: () => {}, _chirp: () => {}, _look: () => { log.looks++; },
    _animate: (_s, _el, cls) => log.animated.push(cls), _moving: () => {},
    _reactFrames: (_s, kind, opts) => log.reacted.push([kind, opts]),
    _patPose: () => { log.poses++; }, _bondHearts: () => { log.hearts++; },
    _patMayTalk: () => true, _line: (_s, _c, text) => log.lines.push(text), _fresh: (_s, _k, list) => list[0],
    _lines: (_s, _k, normal) => ({ text: normal }), _state: () => ({ state: "adult" }), _show: () => {}, _poseEnd: () => {},
  };
  const tap = (x, y, at) => {
    const real = Date.now;
    Date.now = () => 1e12 + at;
    try { ctx.api._pat.call(self, s, { stopPropagation() {}, detail: x === undefined ? 0 : 1, clientX: x, clientY: y }); } finally { Date.now = real; }
  };
  return { s, log, tap, classes };
}
const HEAD_L = [20, 10];
const BODY_R = [80, 80];

test("the head's lean: +-5deg toward the tapped side, and none while .look or a wander is on the pet", () => {
  const c = card();
  c.tap(...HEAD_L, 1000);
  assert.ok(c.classes.has("lean-l") && !c.classes.has("lean-r"));
  const r = card();
  r.tap(80, 10, 1000);
  assert.ok(r.classes.has("lean-r"));
  for (const k of ["look", "wander-l", "wander-r"]) {
    const x = card({ klass: [k] });
    x.tap(...HEAD_L, 1000);
    assert.ok(!x.classes.has("lean-l") && !x.classes.has("lean-r"), `no lean while ${k}`);
  }
  const key = card();
  key.tap(undefined, undefined, 1000);
  assert.ok(!key.classes.has("lean-l") && !key.classes.has("lean-r"), "a key pat has no side, so no lean");
  assert.strictEqual(key.log.poses, 1, "but it is the head: the pat pose");
});

test("reduced motion: the pose and the line, no lean, no wiggle", () => {
  const c = card({ calm: true });
  c.tap(...HEAD_L, 1000);
  assert.ok(!c.classes.has("lean-l"));
  const b = card({ calm: true });
  for (let i = 0; i < 2; i++) b.tap(...BODY_R, 1000 + i * 500);
  assert.deepStrictEqual(b.log.animated, []);
});

test("the table: the body wiggles, its third pat is ticklish, 4-6 the habit move, 7-9 a purr, the tenth flops", () => {
  const b = card();
  const kinds = [];
  for (let i = 0; i < 10; i++) {
    b.log.reacted.length = 0;
    b.tap(...BODY_R, 1000 + i * 1000);
    kinds.push(b.log.reacted.map((r) => r[0]).join() || b.log.animated.at(-1));
  }
  // n=1,2 wiggle (rock2); 3 ticklish; 4,5,6: the habit move and the pats it suppresses (reacting is not
  // set by the stubs, so each plays); 7-9 patted; 10 flopped
  assert.deepStrictEqual(kinds, ["rock2", "rock2", "tickled", "praised", "praised", "praised", "patted", "patted", "patted", "flopped"]);
  assert.ok(b.log.lines.includes("hehe, that tickles ♥"), "the ticklish line breaks the 4 s cooldown");
  assert.ok(["ok ok ♥ ...so cozy", "*melts into a puddle*"].includes(b.log.lines.at(-1)), "the flop's line");
  const q = card();
  for (let i = 0; i < 12; i++) q.tap(...HEAD_L, 1000 + i * 1000);
  assert.deepStrictEqual(q.log.animated.slice(-2), ["pat-soft", "pat-soft"], "past 10: pat-soft only");
  assert.strictEqual(q.log.reacted.filter((r) => r[0] === "flopped").length, 1, "one flop");
});

test("the head's third pat gives a heart; PAT_SPOT only for n <= 3", () => {
  const h = card({ random: 0 }); // the sweet spot would fire every time it is allowed
  const said = [];
  for (let i = 0; i < 5; i++) {
    h.log.lines.length = 0;
    h.tap(...HEAD_L, 1000 + i * 5000 - 0); // 5 s apart: each past the cooldown, one run
    said.push(h.log.lines[0]);
  }
  assert.strictEqual(said[0], "that's the spot!! ♥");
  assert.notStrictEqual(said[3], "that's the spot!! ♥", "n = 4: the habit move owns the beat");
  assert.notStrictEqual(said[4], "that's the spot!! ♥");
});

test("a sleepy or sick pet keeps its one line; a child's habit move is its own pose where it has one", () => {
  const sick = card({ mood: "sick" });
  for (let i = 0; i < 10; i++) sick.tap(...BODY_R, 1000 + i * 4100);
  assert.ok(sick.log.lines.every((l) => l === "thanks... ♥"));
  const kid = card({ drawn: "child" });
  kid.s.species.extras = { knead: ["child_knead_1", "child_knead_2"] };
  kid.s.species.reactions = { praise: "knead" };
  for (let i = 0; i < 4; i++) kid.tap(...HEAD_L, 1000 + i * 1000);
  const habit = kid.log.reacted.find((r) => r[0] === "praised");
  assert.deepStrictEqual([...habit[1].frames], ["child_knead_1", "child_knead_2"]);
});

test("asleep: the third pat stirs (the sleepy face, a turn) and it stays asleep; an egg's third is a double rock", () => {
  const a = card({ asleep: true });
  for (let i = 0; i < 3; i++) a.tap(...HEAD_L, 1000 + i * 1000);
  assert.strictEqual(a.log.looks, 1);
  assert.strictEqual(a.s.poseUntil, 1e12 + 3000 + 500);
  assert.deepStrictEqual([...a.s.poseFrames], ["adult_sleepy_1", "adult_sleepy_2"]);
  assert.strictEqual(a.s.asleep, true);
  assert.deepStrictEqual(a.log.animated, ["pat-slow", "pat-slow", "pat-slow"]);
  const e = card({ egg: true });
  e.s.species.egg = { wiggle: ["egg_wiggle_1", "egg_wiggle_2"] };
  for (let i = 0; i < 3; i++) e.tap(...HEAD_L, 1000 + i * 1000);
  assert.deepStrictEqual(e.log.animated, ["rock", "rock", "rock2"]);
  assert.deepStrictEqual([...e.s.poseFrames], ["egg_wiggle_1", "egg_wiggle_2"]);
});

test("a milestone line may replace the pat's own line on show, nothing else's", () => {
  const ctx = { Date, KEPT: 3, lineClass: (q) => q.cls || 0 };
  vm.runInNewContext(`this.mayTalk = ${method("_patMayTalk").trim().replace(/^_patMayTalk/, "function")};` +
    `this.owned = {${method("_owned")}}._owned;`, ctx);
  const self = { _questionOn: () => false, _owned: ctx.owned };
  const held = (text, patSaid) => ({ sayUntil: Date.now() + 2000, sayClass: 4, sayEntry: { text }, patSaid, queue: [] });
  assert.strictEqual(ctx.mayTalk.call(self, held("hehe ♥", "hehe ♥")), false, "a plain pat may not talk over it");
  assert.strictEqual(ctx.mayTalk.call(self, held("hehe ♥", "hehe ♥"), true), true, "a milestone may");
  assert.strictEqual(ctx.mayTalk.call(self, held("yum!", "hehe ♥"), true), false, "but not over a care line");
  assert.strictEqual(ctx.mayTalk.call(self, { ...held("hehe ♥", "hehe ♥"), calling: true }, true), false, "nor over a call");
});
