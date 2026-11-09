// Care reactions ship A, the floor (docs/plan-2026-11-02-care-reactions.md section 10 A):
// node --test tests/js. The card's source is read as it ships; the reaction methods run
// on a fake pet in a vm.
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");

const src = require("./card-source");
const { adapters } = require("./timer_trace");
const rule = (sel) => (src.match(new RegExp(`\\n\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{[^}]*\\}`)) || [""])[0];
const method = (name) => src.match(new RegExp(`\\n  ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n  \\}\\n`))[0];
const konst = (name) => src.match(new RegExp(`\\nconst ${name} = [\\s\\S]*?;\\n`))[0];

// A card with the real reaction methods and constants, and a pet that records what it is shown.
function card({ calm = false, species, drawn = "child" } = {}) {
  const log = { shown: [], animated: [], timers: [] };
  const ctx = {
    calm: () => calm,
    pick: (list) => list[0],
    setTimeout: (fn, ms) => log.timers.push([fn, ms]),
    clearTimeout: () => {},
    Date,
  };
  const consts = ["REACT_MS", "READY_MS", "REACTIONS", "STAGE_POSES", "REACT_REFUSALS", "REFUSAL_VARIANTS", "REFUSAL_POOL", "SPOILED_BY"]
    .map(konst).join("");
  const methods = ["_reactFrames", "_reactMove", "_poseEnd", "_propShow", "_careVariant", "_owned"].map(method).join(",\n");
  vm.runInNewContext(`${consts}\nthis.api = {${methods}};\nthis.REACTIONS = REACTIONS; this.REACT_REFUSALS = REACT_REFUSALS;` +
    `this.REFUSAL_VARIANTS = REFUSAL_VARIANTS; this.SPOILED_BY = SPOILED_BY; this.STAGE_POSES = STAGE_POSES;`, ctx);
  const sp = species || { moods: ["content", "excited", "cozy", "bored", "sleepy"], frames: 2, acts: { eat: ["baby", "teen", "adult"], refuse: ["baby", "teen", "adult"] } };
  const classes = new Set();
  const s = {
    species: sp, drawn, speciesId: "fox", poseUntil: 0, poseFrames: [], frame: 0, frames: [`${drawn}_content_1`],
    pet: { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) } },
    prop: { classList: { add: (c) => classes.add(`prop:${c}`) }, style: {}, offsetWidth: 0 },
  };
  // The ledger adapters over the real director; a timer it schedules is recorded as [fn, ms], as setTimeout's was.
  const ledger = adapters((ms, fn) => { log.timers.push([fn, ms]); return () => {}; });
  const self = Object.assign(Object.create(ctx.api), ledger, {
    _actPose: (sp0, stage, id, act) => (!act || stage === "child" ? null : [`${stage}_${act}_1`, `${stage}_${act}_2`]),
    _show: (_s, _el, f) => log.shown.push(f),
    _animate: (_s, _el, c, ms) => log.animated.push([c, ms]),
    _look: (_s, ms) => log.animated.push(["look", ms]),
    _moving() {},
    _wander() {},
    _praiseMove: () => "greethop",
    _frames: (s0) => s0.frames,
  });
  return { self, s, log, ctx, classes };
}

test("a child reacts to care with its mood frame (rung 3) and the stage's move", () => {
  for (const [kind, mood, move] of [["fed", "excited", "munch"], ["tucked", "cozy", "settle"], ["praised", "excited", "greethop"], ["refused", "bored", "look"]]) {
    const { self, s, log } = card();
    self._reactFrames(s, kind);
    assert.deepStrictEqual([...s.poseFrames], [`child_${mood}_1`, `child_${mood}_2`], kind);
    assert.ok(s.poseUntil > Date.now(), kind);
    assert.strictEqual(log.animated[0][0], move, kind);
  }
});

test("a child's own species pose (rung 1) keeps its frames and gains the move", () => {
  const { self, s, log } = card();
  s.poseFrames = ["child_tail_wrap_1", "child_tail_wrap_2"];
  s.poseUntil = Date.now() + 2500;
  self._reactFrames(s, "praised", { frames: s.poseFrames });
  assert.deepStrictEqual([...s.poseFrames], ["child_tail_wrap_1", "child_tail_wrap_2"]);
  assert.strictEqual(log.animated[0][0], "greethop");
});

test("a child under reduced motion shows the frame and moves not at all", () => {
  const { self, s, log } = card({ calm: true });
  self._reactFrames(s, "fed");
  assert.deepStrictEqual([...s.poseFrames], ["child_excited_1", "child_excited_2"]);
  assert.strictEqual(log.animated.length, 0);
});

test("the guard lift is for care: a child's visitor greet and a game's bored look stay as they were", () => {
  const a = card();
  a.self._reactFrames(a.s, "greet");
  assert.strictEqual(a.s.poseUntil, 0);
  const b = card();
  b.self._reactFrames(b.s, "refused", { inGame: true });
  assert.strictEqual(b.s.poseUntil, 0);
});

test("the guard still holds off a scene, sleep, the egg, a link and a game", () => {
  for (const flag of ["scene", "asleep", "egg", "linking", "power", "game"]) {
    const { self, s } = card();
    s[flag] = flag === "scene" || flag === "game" ? {} : true;
    self._reactFrames(s, "fed");
    assert.strictEqual(s.poseUntil, 0, flag);
  }
});

test("the house-flag poses are chosen by _petFrames, not by the guard: sweat at child", () => {
  const ctx = { POSES: { sweaty: "sweat" }, POSE_MOODS: new Set(["content"]) };
  vm.runInNewContext(`const o = {${method("_petFrames")}}; this.f = o._petFrames;`, Object.assign(ctx, { POSES: ctx.POSES }));
  const sp = { stages: ["child"], moods: ["content"], frames: 2, extras: { sweat: "child_sweat" } };
  assert.deepStrictEqual([...ctx.f.call({}, sp, "child", "content", false, null, ["sweaty"])], ["child_sweat"]);
});

test("a fan is leant into, a fair scold flinches, a game start perks: kinds in REACTIONS and STAGE_POSES", () => {
  const { ctx } = card();
  assert.strictEqual(ctx.REACTIONS.aired.mood, "cozy");
  assert.strictEqual(ctx.REACTIONS.aired.move, "lean");
  assert.strictEqual(ctx.REACTIONS.scolded.mood, "bored");
  assert.strictEqual(ctx.REACTIONS.scolded.move, "startle");
  assert.strictEqual(ctx.STAGE_POSES.scolded, "refuse");
  assert.strictEqual(ctx.STAGE_POSES.played, "cheer");
  assert.strictEqual(ctx.STAGE_POSES.aired, undefined);
});

test("unfair joins the reacting refusals; asleep, egg and no_game still do not; spoiled is a reaction", () => {
  const { ctx } = card();
  assert.ok(ctx.REACT_REFUSALS.has("unfair"));
  for (const r of ["asleep", "egg", "no_game", "spoiled"]) assert.ok(!ctx.REACT_REFUSALS.has(r), r);
  assert.deepStrictEqual([...ctx.SPOILED_BY].sort(), ["play", "praise", "snack"]);
});

test("a refusal variant: a head shake is two flips, a flop is a settle, a yawn is a sleepy face then a hop", () => {
  const shake = card({ drawn: "adult" });
  shake.self._reactFrames(shake.s, "refused", { variant: "shake" });
  assert.strictEqual(shake.log.animated.filter(([c]) => c === "look").length, 1);
  assert.strictEqual(shake.log.timers.filter(([, ms]) => ms === 550).length, 1); // the second flip
  shake.log.timers.find(([, ms]) => ms === 550)[0]();
  assert.strictEqual(shake.log.animated.filter(([c]) => c === "look").length, 2);

  const flop = card({ drawn: "adult" });
  flop.self._reactFrames(flop.s, "refused", { variant: "flop" });
  assert.strictEqual(flop.log.animated[0][0], "settle");

  const yawn = card({ drawn: "adult" });
  yawn.self._reactFrames(yawn.s, "refused", { variant: "yawn" });
  assert.deepStrictEqual([...yawn.s.poseFrames], ["adult_sleepy_1", "adult_sleepy_2"]);
  yawn.log.timers.find(([, ms]) => ms === 900)[0]();
  assert.deepStrictEqual([...yawn.s.poseFrames], ["adult_excited_1", "adult_excited_2"]);
  assert.strictEqual(yawn.log.animated.at(-1)[0], "greethop");
});

test("_careVariant never gives the same one twice in a row, and a pin wins", () => {
  const { self, s, ctx } = card();
  ctx.pick = (list) => list[0];
  let last = null;
  for (let i = 0; i < 6; i++) {
    const v = self._careVariant(s, "k", ["a", "b"]);
    assert.notStrictEqual(v, last);
    last = v;
  }
  s.pinVariant = { k: "b" };
  assert.strictEqual(self._careVariant(s, "k", ["a", "b"]), "b");
  assert.strictEqual(self._careVariant(s, "one", ["only"]), "only");
  assert.strictEqual(self._careVariant(s, "one", ["only"]), "only");
});

test("the prop leaves in two steps by a timer at propUntil minus 300 ms; the pose ends on a beat", () => {
  const { self, s, log, classes } = card({ drawn: "adult" });
  s.prop.className = "";
  self._propShow(s, "fox/praise", 2500, "above rise");
  const out = log.timers.find(([, ms]) => ms === 2200);
  assert.ok(out, "a timer at 2200");
  out[0]();
  assert.ok(classes.has("prop:prop-out"));
  self._reactFrames(s, "fed");
  assert.ok(log.timers.some(([, ms]) => ms >= 2400 && ms <= 2600), "a pose-end timer");
  s.poseUntil = Date.now() + 1; // a newer pose elsewhere is not cut by this timer
});

test("the praise twirl has its own class (not the adult trick's .spin) and never draws an edge-on angle", () => {
  const css = src.match(/@keyframes twirl \{[^}]*(\}[^}]*)*?\}\n/)[0];
  assert.match(rule(".pet.twirl"), /animation: twirl \.6s step-end/);
  assert.deepStrictEqual([...css.matchAll(/rotate: y (\d+)deg/g)].map((m) => Number(m[1]) % 180), [0, 0, 0, 0]);
  assert.match(method("_reactMove"), /"twirl", 600/);
});

test("the prop drops and leaves in steps; the star rises, the finger wags, the fan slides; sway is gone", () => {
  assert.match(rule(".prop"), /animation: drop \.4s steps\(4, jump-none\)/);
  assert.match(rule(".prop.prop-out"), /prop-out \.3s steps\(2, jump-none\) forwards/);
  assert.match(rule(".prop.rise"), /prop-rise 1s steps\(6/);
  assert.match(rule(".prop.wag"), /wag \.3s steps\(2, jump-none\) \.4s 3/);
  assert.match(rule(".prop.slide"), /prop-slide/);
  assert.doesNotMatch(src, /animation: sway|@keyframes sway/);
  assert.doesNotMatch(src, /\.screen\.breezy \.pet/);
  assert.match(rule(".pet.lean"), /animation: lean 2\.6s ease-in-out;/); // bounded: no infinite
  assert.doesNotMatch(rule(".pet.lean"), /infinite/);
});

test("the excited bounce is one greethop at the start, not a 10 s hop loop", () => {
  assert.doesNotMatch(src, /BOUNCE_MS/);
  assert.match(src, /excitedNow && !calm\(\) && !asleep && !s\.scene[^;]*this\._animate\(s, s\.pet, "greethop", 1400\)/);
});

test("lights on stretches the pet (no line); the play beat, meds sniff and clean hop are wired", () => {
  assert.match(src, /m\.how === "lights"\) \{\n[^\n]*\n\s+now\(\(\) => \{ if \(!s\.asleep && !s\.scene && !calm\(\) && !\(Date\.now\(\) - \(s\.stretched \|\| 0\) < WAKE_STRETCH_MS\)\) this\._animate\(s, s\.pet, "stretch", 1100\)/);
  assert.match(src, /this\._reactFrames\(s, "played"\)/);
  assert.match(src, /sc\.sniff = this\._careVariant\(s, "medicine"/);
  assert.match(src, /const hopK = near < 1 && sweep < 1/);
  assert.match(src, /this\._hold\(s, s\.pet, \["rock2"\], 1300, \{ group: "scene" \}\)/); // the shake-off after the broom (R15)
});

test("_react: praise gets the star above, hearts (not for spoiled); a spoiled care ends smug with its own line", () => {
  const m = method("_react");
  assert.match(m, /const spoiled = entry\.result === "spoiled" && SPOILED_BY\.has\(entry\.action\)/);
  assert.match(m, /praise && !spoiled && !calm\(\) && !s\.asleep\) this\._bondHearts\(s, "carehearts"/);
  assert.match(m, /entry\.action === "praise" \? "above rise" : entry\.action === "scold" \? "above wag"/);
  assert.match(m, /if \(spoiled\) said = \[this\._lines\(s, "REFUSALS\.spoiled"/);
  assert.match(m, /this\._animate\(s, s\.pet, "rock2", 1250\)/);
  assert.match(m, /entry\.result === "unfair"/);
});

// --- Ship B1: the scene engine's answer path (plan 4.2-4.5, 4.9) ---------------------------
// The real shared frame (_sceneClock, _sceneOver, _sceneAnswer, _sceneFail, _sceneOffer,
// _sceneEnd, _care, _press) on a fake slide. `registry` stands in for SCENES where a test
// needs an entry the card does not have yet (a lights scene is ship D's).
function sceneCard({ registry, now = 0 } = {}) {
  const log = { reacted: [], lines: [], calls: 0, tapped: [], redraws: 0, done: 0, started: [] };
  const clock = { now };
  const ctx = {
    performance: { now: () => clock.now },
    Date: { now: () => 1e12 + clock.now },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    setTimeout() {},
    calm: () => false,
    MINE: 4, MINE_MS: 3000, MINE_MATCH_MS: 10000,
    REFUSALS: { full: "i'm full!", not_sick: "i feel fine!", not_sleepy: "not sleepy yet" },
  };
  const line = (name) => src.match(new RegExp(`\\nconst ${name} = [^\\n]*`))[0];
  const consts = ["SCENE_KIND_OF", "sceneKind", "SCENE_HOLD_MS", "SCENE_EXIT_MS", "SCENE_OWE_MS", "SPOILED_BY", "isYes"].map(line).join("");
  const methods = ["_sceneClock", "_sceneOver", "_sceneAnswer", "_sceneFail", "_sceneNow", "_sceneOffer", "_sceneEnd", "_sceneRefusalLine",
    "_care", "_press"].map(method).join(",\n");
  vm.runInNewContext(`${consts}\nthis.api = {${methods}};`, ctx);
  ctx.SCENES = registry || {
    medicine: { ms: 2200, skippable: true, done() { log.done++; } },
    feed: { ms: 2750, gate: 650, playOwed: true, refuseMs: 900, refuse() {}, exit() {},
      refuseAt: (s0, sc, te) => (te < 650 ? Math.max(te, 450) : 650 + Math.ceil((te - 650) / 400) * 400) },
    lights: { ms: 2400, gate: 400, playOwed: true, refuseMs: 700, refuse() {}, exit() {} },
  };
  const el = () => ({ style: {}, classList: { remove() {}, add() {}, contains: () => false } });
  const s = {
    pet: el(), perch: el(), poops: [], pressed: [], ids: { "button.feed": "button.feed", "button.medicine": "button.medicine" },
    buttons: { feed: {}, medicine: {} }, screen: { removeEventListener() {}, classList: { contains: () => false, add() {}, remove() {} } },
  };
  const self = Object.assign(Object.create(ctx.api), {
    _react: (_s, entry, opts) => log.reacted.push({ entry, ...opts }),
    _careMarks() {},
    _allBetter: () => log.lines.push("all better"),
    _line: (_s, _cls, text) => log.lines.push(text),
    _lines: (_s, _key, text) => ({ text }),
    _patSync() {},
    _redraw: () => log.redraws++,
    _rimCue() {}, _tapped: (_b, _s, o) => log.tapped.push(o?.perk !== false),
    _call: () => { log.calls++; return Promise.resolve(true); },
    _layWatch: () => null,
    _toggleStatus() {},
    // A scene as _sceneStart makes one (its elements and the rAF are the browser's).
    _sceneStart(s0, kind) {
      log.started.push(kind);
      const entry = ctx.SCENES[kind];
      if (!entry) return;
      s0.scene = { kind, start: clock.now, ms: entry.ms, gate: entry.gate ?? null, els: [], answerAt: null, result: null };
    },
  });
  return { self, s, log, clock, ctx };
}
const fed = (action, result = "ok", by = "Dev") => ({ action, result, by, at: "now" });
const plain = (x) => JSON.parse(JSON.stringify(x ?? null)); // a value made in the vm, compared here

test("the scene clock: real time to the gate, stuck there with no answer, resumed from the answer", () => {
  const { self } = sceneCard();
  const sc = { gate: 650, answerAt: null };
  assert.deepStrictEqual([300, 650, 900, 2000].map((t) => self._sceneClock(sc, t).te), [300, 650, 650, 650]);
  assert.strictEqual(self._sceneClock(sc, 900).hold, 250);
  sc.answerAt = 1000;
  assert.deepStrictEqual([300, 900, 1000, 1400].map((t) => self._sceneClock(sc, t).te), [300, 650, 650, 1050]);
  sc.answerAt = 200; // in before the gate: one continuous beat
  assert.deepStrictEqual([300, 650, 1400].map((t) => self._sceneClock(sc, t).te), [300, 650, 1400]);
  assert.strictEqual(self._sceneClock({ gate: null, answerAt: null }, 5000).te, 5000); // medicine, clean: no gate
});

test("a hold past 2 s is the exit beat, then the scene ends with a late owe", () => {
  const { self, s } = sceneCard();
  self._sceneStart(s, "feed");
  const c = self._sceneClock(s.scene, 650 + 2000 + 100);
  assert.deepStrictEqual([c.te, c.exit, c.late], [650, 100, true]);
  assert.strictEqual(self._sceneOver(s, 650 + 2000 + 399), false);
  assert.strictEqual(self._sceneOver(s, 650 + 2000 + 400), true);
  self._sceneEnd(s);
  assert.strictEqual(s.scene, null);
  assert.deepStrictEqual(plain(s.sceneOwes.map((o) => [o.kind, o.late, o.playOwed])), [["feed", true, true]]);
});

test("a failed call takes the exit beat and leaves no owe; medicine plays on as before", () => {
  const { self, s, clock } = sceneCard();
  self._sceneStart(s, "feed");
  clock.now = 300;
  self._sceneFail(s);
  assert.strictEqual(self._sceneClock(s.scene, 500).exit, 200);
  assert.strictEqual(self._sceneOver(s, 700), true);
  self._sceneEnd(s);
  assert.deepStrictEqual(plain(s.sceneOwes || []), []);
  self._sceneStart(s, "medicine");
  self._sceneFail(s);
  assert.strictEqual(s.scene.failAt, undefined);
});

test("my feed and a partner's praise in one update: the feed answers the scene, the praise is said only", () => {
  const { self, s, log } = sceneCard();
  self._press(s, "feed");
  self._care(s, [fed("praise", "ok", "Other"), fed("feed")]);
  assert.strictEqual(s.scene.answered, true);
  assert.strictEqual(s.scene.result, "ok");
  assert.strictEqual(log.reacted.length, 1);
  assert.strictEqual(log.reacted[0].entry.action, "praise");
  assert.strictEqual(log.reacted[0].busy, true);
  assert.strictEqual(log.reacted[0].mine, false);
});

test("a partner's unclaimed feed does not answer my scene; my claimed one does", () => {
  const { self, s, log } = sceneCard();
  self._sceneStart(s, "feed"); // a scene with no press of mine left to claim
  self._care(s, [fed("feed", "ok", "Other")]);
  assert.strictEqual(s.scene.answerAt, null);
  assert.strictEqual(log.reacted[0].busy, true);
  s.pressed = [{ action: "feed", pressedAt: 1e12 }];
  self._care(s, [fed("feed")]);
  assert.strictEqual(s.scene.result, "ok");
  assert.strictEqual(log.reacted.length, 1);
});

test("an ok then a full for one feed: the push-away comes after the gate, once the bite in progress is done", () => {
  const { self, s, clock, log } = sceneCard();
  self._press(s, "feed");
  self._press(s, "feed"); // a second tap: ignored, ring and haptic only, nothing sent
  assert.strictEqual(log.calls, 1);
  assert.deepStrictEqual(log.tapped, [false]);
  clock.now = 200;
  self._care(s, [fed("feed")]);
  clock.now = 900;
  s.pressed = [{ action: "feed", pressedAt: 1e12 }];
  self._care(s, [fed("feed", "full")]);
  assert.strictEqual(s.scene.result, "full");
  assert.strictEqual(s.scene.refuseAt, 1050); // te 900 is in bite 1 (650-1050): it finishes first
  assert.strictEqual(log.reacted.length, 0); // the scene says "i'm full!" as its push-away starts
  assert.strictEqual(self._sceneOver(s, 1050 + 899), false);
  assert.strictEqual(self._sceneOver(s, 1050 + 900), true);
});

test("a full before the gate is a push-away from the landed bowl", () => {
  const { self, s, clock } = sceneCard();
  self._press(s, "feed");
  clock.now = 150;
  self._care(s, [fed("feed", "full")]);
  assert.strictEqual(s.scene.refuseAt, 450);
});

test("a medicine refusal still ends its scene hard and is said by the floor, leaving no owe", () => {
  const { self, s, log } = sceneCard();
  self._press(s, "medicine");
  self._care(s, [fed("medicine", "not_sick")]);
  assert.strictEqual(s.scene, null);
  assert.deepStrictEqual(plain(s.sceneOwes || []), []);
  assert.strictEqual(log.reacted[0].entry.result, "not_sick");
  assert.strictEqual(log.done, 0); // no "all better"
});

test("two presses on two cares leave two owes, and each reply takes its own", () => {
  const { self, s, log } = sceneCard();
  self._press(s, "feed");
  self._press(s, "medicine"); // ends the feed scene unanswered: a feed owe
  self._sceneEnd(s); // a swipe: a medicine owe
  assert.deepStrictEqual(plain(s.sceneOwes.map((o) => o.kind).sort()), ["feed", "medicine"]);
  self._care(s, [fed("medicine")]);
  assert.deepStrictEqual(plain(s.sceneOwes.map((o) => o.kind)), ["feed"]); // the medicine reply did not take the feed's
  assert.deepStrictEqual(log.lines, ["all better"]); // swallowed: the scene showed it, its cheer said now
  assert.strictEqual(log.reacted.length, 0);
  self._care(s, [fed("feed")]);
  assert.deepStrictEqual(plain(s.sceneOwes), []);
  assert.strictEqual(log.reacted.length, 1); // playOwed: the floor plays the meal
  assert.strictEqual(log.reacted[0].entry.action, "feed");
  assert.strictEqual(log.reacted[0].busy, false);
  assert.strictEqual(log.reacted[0].mine, true);
});

test("a late owe plays the floor whatever playOwed says; an unclaimed reply does not take an owe", () => {
  const { self, s, log } = sceneCard();
  s.sceneOwes = [{ kind: "medicine", until: 1e12 + 5000, playOwed: false, late: true }];
  self._care(s, [fed("medicine", "ok", "Other")]);
  assert.strictEqual(s.sceneOwes.length, 1);
  s.pressed = [{ action: "medicine", pressedAt: 1e12 }];
  self._care(s, [fed("medicine")]);
  assert.strictEqual(s.sceneOwes.length, 0);
  assert.strictEqual(log.reacted.length, 2);
  assert.strictEqual(log.reacted[1].mine, true);
});

test("a refusal logged as lights_out answers a lights scene (the kind map)", () => {
  const { self, s } = sceneCard();
  s.pressed = [{ action: "lights_out", pressedAt: 1e12 }];
  self._sceneStart(s, "lights");
  self._care(s, [fed("lights_out", "not_sleepy")]);
  assert.strictEqual(s.scene.result, "not_sleepy");
  assert.ok(s.scene.refuseAt != null);
});

test("no path leaves a scene set: the end clears it, and a tap on another care ends the first", () => {
  const { self, s } = sceneCard();
  self._press(s, "feed");
  self._press(s, "medicine");
  assert.strictEqual(s.scene.kind, "medicine");
  self._press(s, "medicine"); // medicine's second tap ends it
  assert.strictEqual(s.scene, null);
});

test("bowlCuts: three even bites on the art grid, the last at the rim; no rim or no food above it: none", () => {
  const ctx = {};
  const block = src.slice(src.indexOf("const BOWL_ROWS = new Map()"), src.indexOf("class HatchPetCardCare"));
  vm.runInNewContext(`${block}\nthis.bowlCuts = bowlCuts;`, ctx);
  const rows = [...Array(8).fill(0), ...Array(24).fill(10), ...Array(96).fill(50)]; // food rows 8-31, the bowl from 32
  assert.deepStrictEqual(plain(ctx.bowlCuts(rows, 0.25)), [16, 24, 32]);
  for (const c of ctx.bowlCuts(rows, 0.25)) assert.strictEqual(c % 4, 0);
  assert.strictEqual(ctx.bowlCuts(rows, undefined), null);
  assert.strictEqual(ctx.bowlCuts(rows, 1.2), null);
  assert.strictEqual(ctx.bowlCuts(Array(128).fill(0), 0.4), null);
  assert.match(method("_bowlClip"), /inset\(\$\{\(cut \/ img\.naturalHeight\) \* 100\}% 0 0 0\)/);
});

// The real feed entry (SCENES.feed) on a fake slide: its prediction, its variants, its beats.
function feedEntry() {
  const block = src.slice(src.indexOf("const SCENES = {"), src.indexOf("\n};\n", src.indexOf("const SCENES = {")) + 4);
  const line = (name) => src.match(new RegExp(`\\nconst ${name} = [^\\n]*`))[0];
  const fn = (name) => src.match(new RegExp(`\\nfunction ${name}\\([\\s\\S]*?\\n\\}\\n`))[0];
  const ctx = { Math, Number, Array, Set, spriteSrc: (id, sp) => `${id}/${sp}`, Date, bowlColour: () => "#8a5a2b" };
  vm.runInNewContext([line("FEED_FULL_AT"), line("FEED_GOBBLE"), line("FEED_MAX_MS"), line("FEED_EXTRA_ODDS"), line("PACE_SCALE"),
    line("mealPart"), line("isHeavy"), konst("NATURE_VALUES"), fn("nature"), fn("paceOf"), block,
    "this.SCENES = SCENES;"].join("\n"), ctx);
  return ctx.SCENES.feed;
}
function feedSlide({ hunger = "60", missing = false, habit, moods = ["content", "excited", "hungry", "bored", "sleepy"], drawn = "adult", world } = {}) {
  const els = [];
  const el = () => ({ style: {}, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {} });
  const s = {
    drawn, speciesId: "fox", world: world || { mess: null }, worldKey: "woodland", lastVariant: {},
    species: { moods, frames: 2, props: { feed: "bowl_food" }, acts: { eat: ["adult"] }, voice: { pace: 35 }, ...(habit ? { nature: { clock: "day", sky: "sun", company: "solo", habit } } : {}) },
  };
  const states = { "sensor.hunger": missing ? undefined : { state: hunger } };
  const self = {
    _state: (_s, k) => states[k],
    _sceneFrames: (s0, act) => (s0.species.acts?.[act]?.includes(s0.drawn) ? [`${s0.drawn}_${act}_1`, `${s0.drawn}_${act}_2`] : null),
    _careVariant: ctx0.api._careVariant,
    _careFrames: careFramesApi._careFrames,
    _snackRollOut: careFramesApi._snackRollOut,
  };
  const setup = (entry, sc = {}) => {
    entry.setup.call(self, s, sc, { add: () => { const e = el(); els.push(e); return e; },
      box: { width: 330, height: 247, left: 0, top: 0 }, pet: { left: 88, width: 153, top: 40, height: 153 } });
    return sc;
  };
  return { s, self, setup, els };
}
const careFramesApi = (() => {
  const ctx = {};
  vm.runInNewContext(`this.api = {${method("_careFrames")},\n${method("_snackRollOut")}};`, ctx);
  return ctx.api;
})();
const ctx0 = (() => {
  const ctx = { pick: (l) => l[Math.floor(Math.random() * l.length)] };
  vm.runInNewContext(`this.api = {${method("_careVariant")}};`, ctx);
  return ctx;
})();

test("feed's prediction: hunger under 95 (the server's >=), parsed; unavailable, unknown, missing, NaN: no scene", () => {
  const feed = feedEntry();
  const due = (h) => feed.due.call(feedSlide({ hunger: h, missing: h === undefined }).self, {});
  assert.strictEqual(due("94"), true);
  assert.strictEqual(due("94.99"), true);
  assert.strictEqual(due("95"), false);
  for (const h of ["unavailable", "unknown", undefined, "NaN"]) assert.strictEqual(due(h), false, String(h));
  // The shared guard (asleep, egg, lights out; the sitter is no reason, 6.1) runs before any due: today's _sceneStart line.
  assert.match(method("_sceneStart"), /if \(!mood \|\| stage === "egg" \|\| \(\(s\.asleep \|\| s\.lightsOut\) && kind !== "lights"\)\) return;\n.*entry\.due/);
});

test("feed's variants: C (gobble) only under hunger 30, a pin wins, never the same twice in a row", () => {
  const feed = feedEntry();
  const seen = new Set();
  const f = feedSlide();
  let last = null;
  for (let i = 0; i < 40; i++) {
    const sc = f.setup(feed);
    seen.add(sc.variant);
    assert.notStrictEqual(sc.variant, last);
    last = sc.variant;
  }
  assert.ok(!seen.has("C"), [...seen].join());
  const hungry = feedSlide({ hunger: "20" });
  const got = new Set(Array.from({ length: 40 }, () => hungry.setup(feed).variant));
  assert.ok(got.has("C"));
  const pinned = feedSlide();
  pinned.s.pinVariant = { feed: "D", "feed.extra": "lick" };
  const sc = pinned.setup(feed);
  assert.strictEqual(sc.variant, "D");
  assert.strictEqual(sc.extra, "lick");
});

test("feed's beats: the gate is the first bite, the bites step the clip 1-2-3, nothing past 3.2 s", () => {
  const feed = feedEntry();
  for (const [v, gate, n] of [["A", 650, 3], ["B", 950, 3], ["C", 650, 4], ["D", 650, 3]]) {
    const f = feedSlide({ hunger: "20" });
    f.s.pinVariant = { feed: v };
    const sc = f.setup(feed);
    assert.strictEqual(sc.gate, gate, v);
    assert.strictEqual(sc.bites.length, n, v);
    assert.strictEqual(sc.bites[0].at, gate, v);
    assert.deepStrictEqual(plain(sc.bites.map((b) => b.step)), n === 4 ? [1, 2, 3, 3] : [1, 2, 3], v);
    assert.ok(sc.ms <= 3200, `${v} ${sc.ms}`);
    assert.ok(f.els.length <= 12, `${v} ${f.els.length} nodes`);
  }
  const slow = feedSlide();
  slow.s.species.voice.pace = 20;
  slow.s.pinVariant = { feed: "D" };
  const sc = slow.setup(feed);
  assert.ok(sc.ms <= 3200 && sc.bites[0].len > 400, `${sc.ms} ${sc.bites[0].len}`); // slower, still capped
});

test("feed's push-away: from the landed bowl before the gate; after it, the bite in progress finishes", () => {
  const feed = feedEntry();
  const f = feedSlide();
  f.s.pinVariant = { feed: "A" };
  const sc = f.setup(feed);
  assert.strictEqual(feed.refuseAt(f.s, sc, 200), 450);
  assert.strictEqual(feed.refuseAt(f.s, sc, 500), 500);
  const b = sc.bites[0];
  assert.strictEqual(feed.refuseAt(f.s, sc, b.at + 10), b.at + b.len);
  assert.ok(feed.refuseMs <= 900);
});

test("a nature hook is a no-op with no nature block; a child with no own pose eats on its excited frames", () => {
  const feed = feedEntry();
  const plain0 = feedSlide();
  const sc = plain0.setup(feed);
  assert.strictEqual(sc.performer, false);
  const kid = feedSlide({ drawn: "child" });
  const ksc = kid.setup(feed);
  assert.deepStrictEqual(plain(ksc.eat), ["child_excited_1", "child_excited_2"]);
  kid.s.species.reactions = { feed: "cheeks" };
  kid.s.species.extras = { cheeks: ["child_cheeks_1", "child_cheeks_2"] };
  assert.deepStrictEqual(plain(kid.setup(feed).eat), ["child_cheeks_1", "child_cheeks_2"]); // rung 1
});

test("feed is not skippable and plays an owed ok; a game's won or lost is never taken by a scene", () => {
  const feed = feedEntry();
  assert.strictEqual(feed.skippable, false);
  assert.strictEqual(feed.playOwed, true);
  const { self, s } = sceneCard();
  self._press(s, "feed");
  for (const result of ["won", "lost"]) assert.strictEqual(self._sceneOffer(s, fed("game", result), true), false);
  assert.match(method("_sceneEnd"), /if \(sc\.looked\) s\.pet\.classList\.remove\("look"\)/);
});

test("feed's nature hook: a watcher savours (D) more often, a hoarder gobbles only when hungry", () => {
  const feed = feedEntry();
  const count = (opts, v) => {
    const f = feedSlide(opts);
    delete f.s.lastVariant; // a fresh slide has none yet
    return Array.from({ length: 600 }, () => f.setup(feed).variant).filter((x) => x === v).length;
  };
  assert.ok(count({ habit: "watcher" }, "D") > count({}, "D"));
  assert.strictEqual(count({ habit: "hoarder" }, "C"), 0); // not hungry: no gobble at all
  assert.ok(count({ habit: "hoarder", hunger: "20" }, "C") > 0);
});

// B2: a bowl with no rim to clip dips whole at each chomp; one with a rim is clipped, not dipped.
test("feed's per-bite dip: a no-rim bowl squashes at each chomp and is whole again; a clipped bowl never dips", () => {
  const feed = feedEntry();
  const run = (clipped, t) => {
    const f = feedSlide();
    f.s.pinVariant = { feed: "A" };
    const sc = f.setup(feed);
    const style = {};
    const node = () => ({ style: {}, classList: { toggle() {}, add() {}, remove() {} } });
    sc.bowl = { style };
    sc.crumbs = [node(), node(), node()];
    sc.dust = [node(), node()];
    sc.fired = new Set();
    f.s.pet = node();
    f.s.perch = node();
    f.self._bowlClip = () => clipped;
    f.self._animate = () => {};
    f.self._perk = () => {};
    f.self._words = () => ({});
    const ramp = (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
    feed.render.call(f.self, f.s, sc, t, { sw: 330, sh: 247, ramp, ease: ramp });
    const refuse = { style: {} };
    return { style, sc, refuse };
  };
  const b0 = run(false, 0).sc.bites[0];
  const [, sy0] = String(run(false, b0.at).style.scale || "").split(" ");
  assert.strictEqual(sy0, undefined, "before the chomp: whole"); // no dip yet (scale is the squash's: "")
  const mid = run(false, b0.at + 220).style.scale.split(" ").map(Number);
  assert.ok(mid[1] < 0.95 && mid[0] > 1, `dipped at the chomp's middle: ${mid}`);
  const after = run(false, b0.at + 330).style.scale;
  assert.ok(!after || Number(after.split(" ")[1]) > 0.999, `whole again: ${after}`);
  assert.ok(!run(true, b0.at + 220).style.scale, "a clipped bowl is not dipped");
  assert.match(feed.refuse.toString(), /sc\.bowl\.style\.scale = ""/);
  assert.match(feed.exit.toString(), /sc\.bowl\.style\.scale = ""/);
});

// B1 validation findings (first mate), fixed in B2.
test("feed's refuseAt: a full that came after a hold is refused at the gate, before bite 1", () => {
  const feed = feedEntry();
  const f = feedSlide();
  f.s.pinVariant = { feed: "A" };
  const sc = f.setup(feed);
  sc.answerAt = 1400; // held at the gate, the reply came 750 ms late
  assert.strictEqual(feed.refuseAt(f.s, sc, sc.gate), sc.gate);
  const pre = { style: { translate: "0px 0px" }, classList: { toggle() {} } };
  sc.refuseAt = sc.gate;
  sc.bowl = { style: {} };
  sc.crumbs = [];
  f.s.pet = pre;
  f.s.perch = { style: {} };
  const frames = feed.refuse.call(f.self, f.s, sc, 100, { sw: 330, ramp: () => 0, ease: () => 0 });
  assert.deepStrictEqual(plain(frames), plain(sc.hungry), "it sniffs from its waiting frame, as before the gate");
  // A full after the first bite began is still the bite in progress's.
  sc.answerAt = 700;
  assert.strictEqual(feed.refuseAt(f.s, sc, sc.gate + 10), sc.bites[0].at + sc.bites[0].len);
});

test("_animate: one timer per element and class; a re-add keeps the class to the second timer's end", () => {
  // The ledger adapters over the real director; its schedule is recorded, and a cancel takes the timer out.
  const timers = [];
  const ctx = {};
  vm.runInNewContext(`this.api = {${method("_animate")}};`, ctx);
  const self = Object.assign(Object.create(ctx.api), adapters((ms, fn) => {
    const t = { fn, ms };
    timers.push(t);
    return () => { const k = timers.indexOf(t); if (k >= 0) timers.splice(k, 1); };
  }));
  const slide = {};
  const classes = new Set();
  const el = { offsetWidth: 0, classList: { add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)) } };
  self._animate(slide, el, "chomp", 280);
  assert.ok(classes.has("chomp"));
  const first = timers[0];
  self._animate(slide, el, "chomp", 280); // variant C: the next chomp, 250 ms on
  assert.strictEqual(timers.length, 1, "the first timer is cleared");
  assert.notStrictEqual(timers[0], first);
  assert.ok(classes.has("chomp"), "the replacement runs no undo: the class stays for the second one");
  timers.shift().fn(); // it fires, and is gone
  assert.ok(!classes.has("chomp"));
  // Another class, or another element, keeps its own.
  self._animate(slide, el, "chomp", 280);
  self._animate(slide, el, "perk", 320);
  assert.strictEqual(timers.length, 2);
});

test("a gobble's chomps are not cut: variant C's second chomp outlives the first one's timer", () => {
  // C's bites are 250 ms (x pace) apart and a chomp runs 280 ms: the beat's own _animate call.
  const feed = feedEntry();
  const f = feedSlide({ hunger: "20" });
  f.s.pinVariant = { feed: "C" };
  const sc = f.setup(feed);
  assert.ok(sc.bites[1].at - sc.bites[0].at < 280, "the bites are closer than a chomp is long");
  assert.match(src, /this\._animate\(s, s\.pet, "chomp", 280\)/);
});

test("the screen-tap stop is installed for a skippable scene only; the status sheet keeps its taps", () => {
  const start = method("_sceneStart");
  assert.match(start, /if \(entry\.skippable\) \{\n\s+sc\.stop = /);
  assert.ok(!/sc\.stop = [^]*if \(entry\.skippable\) this\._sceneEnd/.test(start));
  assert.match(start, /if \(s\.status\?\.contains\(e\.target\)\) return;/);
  assert.match(method("_sceneEnd"), /if \(sc\.stop\) s\.screen\.removeEventListener/);
});

// --- B2: snack ---------------------------------------------------------------------------------
// The real SCENES.snack on a fake slide, as feedEntry does for feed.
function snackEntry(over = {}) {
  const block = src.slice(src.indexOf("const SCENES = {"), src.indexOf("\n};\n", src.indexOf("const SCENES = {")) + 4);
  const line = (name) => src.match(new RegExp(`\\nconst ${name} = [^\\n]*`))[0];
  const fn = (name) => src.match(new RegExp(`\\nfunction ${name}\\([\\s\\S]*?\\n\\}\\n`))[0];
  const ctx = { Math, Number, Array, Set, spriteSrc: (id, sp) => `${id}/${sp}`, Date, bowlColour: () => "#000", pick: (l) => l[0],
    seasonNow: () => over.season || null, MINE: 4, MINE_MS: 3000, REFUSALS: { spoiled: "hehe, whining works" }, ...over.ctx };
  vm.runInNewContext([line("FEED_FULL_AT"), line("FEED_GOBBLE"), line("FEED_MAX_MS"), line("FEED_EXTRA_ODDS"), line("SNACK_LINE_ODDS"),
    line("SNACK_NIBBLES"), line("PACE_SCALE"), line("mealPart"), line("isHeavy"), konst("NATURE_VALUES"), konst("HEAVY_SNACK"), konst("SNACK_LINES"),
    fn("nature"), fn("paceOf"), fn("catchPoint"), block, "this.SCENES = SCENES; this.catchPoint = catchPoint;"].join("\n"), ctx);
  return ctx;
}
// The test's own override of the dice: Math.random() is `r` in the entry (0.1 is under every odds, 0.9 over).
const dice = (r) => ({ ctx: { Math: Object.assign(Object.create(Math), { random: () => r }) } });
function snackSlide(opts = {}) {
  const f = feedSlide(opts);
  f.s.species.head = { adult: [160, 70], child: [128, 96] };
  f.s.species.props.snack = "snack";
  f.s.species.reactions = {};
  f.self._config = {};
  f.self._sceneArt = () => {};
  f.self._snackArt = (_s, season) => (season?.snack ? `../ui/season_${season.key}_${season.snack}` : null); // the food pool has its own test (food_pool.test.js)
  return f;
}
const snackBox = { width: 330, height: 247, left: 0, top: 0 };
function snackRun(f, sc, t, extra = {}) {
  const node = () => ({ style: {}, classList: { toggle() {}, add() {}, remove() {} } });
  sc.snack = node();
  f.s.pet = Object.assign(node(), { classList: { toggle() {}, add() {}, remove() {}, contains: () => false } });
  f.s.perch = node();
  const log = { animated: [], lines: [], hearts: 0, sparkles: 0 };
  f.self._animate = (_s, _el, c) => log.animated.push(c);
  f.self._line = (_s, _cls, text) => log.lines.push(text);
  f.self._bondHearts = () => log.hearts++;
  f.self._sparkle = () => log.sparkles++;
  f.self._lines = (_s, _k, text) => ({ text });
  const ramp = (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const ease = (a, b) => { const k = ramp(a, b); return k * k * (3 - 2 * k); };
  const frames = extra.entry.render.call(f.self, f.s, sc, t, { sw: 330, sh: 247, ramp, ease });
  return { log, frames };
}

test("isYes: an ok, and a spoiled snack; a spoiled praise, play or medicine is not", () => {
  const ctx = {};
  vm.runInNewContext(`${konst("SPOILED_BY")}\n${src.match(/\nconst isYes = [^\n]*/)[0]}\nthis.isYes = isYes;`, ctx);
  const yes = (action, result) => ctx.isYes({ action, result });
  assert.ok(yes("snack", "ok") && yes("feed", "ok") && yes("snack", "spoiled"));
  for (const a of ["praise", "play", "medicine", "feed"]) assert.ok(!yes(a, "spoiled"), a);
  for (const r of ["full", "won", "lost", "unfair"]) assert.ok(!yes("snack", r), r);
  // And it is the one test the answer path uses.
  assert.match(method("_sceneAnswer"), /isYes\(\{ action: sc\.kind, result \}\)/);
  assert.match(method("_sceneOffer"), /const ok = isYes\(entry\)/);
});

test("a spoiled snack answers its scene as an ok: one scene, no floor reaction, sc.spoiled set", () => {
  const { self, s, log } = sceneCard({ registry: { snack: { ms: 1950, gate: 650, playOwed: true, refuse() {}, exit() {}, done() { log.done++; } } } });
  self._press(s, "snack");
  s.ids["button.snack"] = "button.snack";
  s.buttons.snack = {};
  self._press(s, "snack");
  assert.strictEqual(s.scene?.kind, "snack");
  const sc = s.scene;
  assert.strictEqual(self._sceneOffer(s, fed("snack", "spoiled"), true), true); // taken: _react never sees it
  assert.strictEqual(sc.answered, true);
  assert.strictEqual(sc.result, "ok");
  assert.strictEqual(sc.spoiled, true);
  assert.strictEqual(s.scene, sc, "the scene plays on");
  // Only a snack: a spoiled praise on the floor is the floor's.
  assert.strictEqual(self._sceneOffer(s, fed("praise", "spoiled"), true), false);
});

test("a late or owed spoiled snack goes to the floor path (it eats and is smug there)", () => {
  const { self, s } = sceneCard({ registry: { snack: { ms: 1950, gate: 650, playOwed: true, refuse() {}, exit() {} } } });
  s.sceneOwes = [{ kind: "snack", until: Date.now() + 5000, playOwed: true, late: false }];
  assert.strictEqual(self._sceneOffer(s, fed("snack", "spoiled"), true), false);
  assert.match(method("_react"), /const spoiled = entry\.result === "spoiled" && SPOILED_BY\.has\(entry\.action\)/);
});

test("snack's prediction is feed's: hunger under 95", () => {
  const { SCENES } = snackEntry();
  const due = (h) => SCENES.snack.due.call(snackSlide({ hunger: h }).self, {});
  assert.strictEqual(due("94"), true);
  assert.strictEqual(due("95"), false);
  assert.strictEqual(due("unavailable"), false);
});

test("snack's variants: one pick for a pinned one; D is a hoarder's; never the same twice; the nature hooks", () => {
  const { SCENES } = snackEntry();
  const snack = SCENES.snack;
  const f = snackSlide();
  f.s.pinVariant = { snack: "B" };
  for (let i = 0; i < 5; i++) assert.strictEqual(f.setup(snack).variant, "B");
  f.s.pinVariant = { snack: "D" }; // a bench may pin D on anyone
  assert.strictEqual(f.setup(snack).variant, "D");
  const seen = new Set();
  const g = snackSlide();
  let last = null;
  for (let i = 0; i < 60; i++) {
    const v = g.setup(snack, {}).variant;
    seen.add(v);
    assert.notStrictEqual(v, last);
    last = v;
  }
  assert.ok(!seen.has("D") && seen.has("A") && seen.has("B") && seen.has("C"), [...seen].join());
  const count = (habit, v) => {
    const h = snackSlide({ habit });
    delete h.s.lastVariant;
    return Array.from({ length: 600 }, () => h.setup(snack, {}).variant).filter((x) => x === v).length;
  };
  assert.ok(count("hoarder", "D") > 150, "a hoarder stashes");
  assert.ok(count("performer", "B") > count(undefined, "B"));
  assert.ok(count("watcher", "C") > count(undefined, "C"));
});

test("snack's beats: the gate, the catch at 700, nothing over 3.2 s, at most 12 elements, one nibble set for C", () => {
  const { SCENES } = snackEntry();
  for (const [v, n] of [["A", 2], ["B", 2], ["C", 3], ["D", 1]]) {
    const f = snackSlide();
    f.s.pinVariant = { snack: v };
    const sc = f.setup(SCENES.snack);
    assert.strictEqual(sc.chews.length, n, v);
    assert.ok(sc.chews[0].at >= (v === "B" ? 850 : 700), v);
    assert.ok(sc.ms <= 3200 && sc.ms > sc.delightAt, `${v} ${sc.ms}`);
    assert.ok(f.els.length <= 12, v);
  }
  const f = snackSlide();
  f.s.pinVariant = { snack: "A" };
  assert.strictEqual(f.setup(SCENES.snack).ms, 1950); // the plan's total for the catch
  const heavy = snackSlide();
  heavy.s.pinVariant = { snack: "A" };
  heavy.self._state = (_s, k) => (k === "sensor.weight" ? { state: "90" } : { state: "60" });
  const hsc = heavy.setup(SCENES.snack);
  assert.strictEqual(hsc.lookAt, 700);
  assert.strictEqual(hsc.chews[0].at, 1100); // a look at it for 400 ms first
});

test("snack's delight: exactly one greethop across the scene; a favourite day is a bighop and a sparkle; spoiled is two rocks", () => {
  const { SCENES } = snackEntry(dice(0.1)); // the line's 1-in-4 comes up
  const run = (mutate) => {
    const f = snackSlide();
    f.s.pinVariant = { snack: "A" };
    const sc = f.setup(SCENES.snack);
    sc.result = "ok";
    mutate?.(sc);
    const hops = [];
    let hearts = 0;
    let sparkles = 0;
    const lines = [];
    for (let t = 0; t <= sc.ms; t += 10) {
      const r = snackRun(f, sc, t, { entry: SCENES.snack });
      hops.push(...r.log.animated.filter((c) => ["greethop", "bighop", "rock2", "hop"].includes(c)));
      hearts += r.log.hearts;
      sparkles += r.log.sparkles;
      lines.push(...r.log.lines);
    }
    return { hops, hearts, sparkles, lines, sc };
  };
  const plainRun = run();
  assert.deepStrictEqual(plain(plainRun.hops), ["greethop"]);
  assert.deepStrictEqual(plain(plainRun.lines), ["*gotcha!*"]);
  assert.strictEqual(plainRun.hearts, 1);
  const fav = run((sc) => { sc.fav = true; });
  assert.deepStrictEqual(plain(fav.hops), ["bighop"]);
  assert.strictEqual(fav.sparkles, 1);
  assert.deepStrictEqual(plain(fav.lines), [], "the moment says its own line");
  const smug = run((sc) => { sc.spoiled = true; });
  assert.deepStrictEqual(plain(smug.hops), ["rock2"]);
  assert.deepStrictEqual(plain(smug.lines), ["hehe, whining works"]);
  assert.strictEqual(smug.hearts, 0);
  // The layout's own greethop for the mood it brings is told it was spent.
  const f = snackSlide();
  f.s.pinVariant = { snack: "A" };
  const sc = f.setup(SCENES.snack);
  sc.fired.add("delight");
  SCENES.snack.clear.call(f.self, f.s, sc);
  assert.ok(f.s.excitedSince > 0);
});

test("snack's line: the season's candy line beats heavy beats SNACK_LINES; a miss says the other row", () => {
  const { SCENES } = snackEntry({ season: { key: "halloween", snack: "candy", snackLines: ["candy!! ♪"] } });
  const f = snackSlide();
  f.s.pinVariant = { snack: "A" };
  const sc = f.setup(SCENES.snack);
  assert.strictEqual(sc.line, "candy!! ♪");
  assert.strictEqual(sc.candy, "../ui/season_halloween_candy");
  const b = snackEntry(dice(0.1));
  const g = snackSlide();
  g.s.pinVariant = { snack: "B" };
  const bsc = g.setup(b.SCENES.snack);
  bsc.result = "ok";
  const lines = [];
  for (let t = 0; t <= bsc.ms; t += 10) lines.push(...snackRun(g, bsc, t, { entry: b.SCENES.snack }).log.lines);
  assert.deepStrictEqual(plain(lines), ["*pounce!*"]);
  const heavy = snackEntry({ ctx: { Math: Object.assign(Object.create(Math), { random: () => 0.1 }) } });
  const h = snackSlide();
  h.s.pinVariant = { snack: "A" };
  h.self._state = (_s, k) => (k === "sensor.weight" ? { state: "90" } : { state: "60" });
  const hsc = h.setup(heavy.SCENES.snack);
  assert.ok(/round/.test(hsc.line), hsc.line);
});

test("snack's push-away: before the gate the snack leaves; after it the catch (to 700) or the chew is finished", () => {
  const { SCENES } = snackEntry();
  const snack = SCENES.snack;
  const f = snackSlide();
  f.s.pinVariant = { snack: "A" };
  const sc = f.setup(snack, { gate: snack.gate }); // _sceneStart sets the gate from the entry
  assert.strictEqual(snack.refuseAt(f.s, sc, 200), 550);
  assert.strictEqual(snack.refuseAt(f.s, sc, 600), 600);
  sc.answerAt = 1500; // a reply after a hold
  assert.strictEqual(snack.refuseAt(f.s, sc, 650), 650);
  sc.answerAt = 300;
  assert.strictEqual(snack.refuseAt(f.s, sc, 660), 700, "the catch is finished");
  const b = sc.chews[0];
  assert.strictEqual(snack.refuseAt(f.s, sc, b.at + 10), b.at + b.len);
  // Pre-gate: the snack is shown at refuseAt and rolls out; post-gate it is gone already.
  snackRun(f, sc, 600, { entry: snack });
  const k = { sw: 330, sh: 247, ramp: (a, c) => Math.min(1, Math.max(0, (400 - a) / (c - a))), ease: (a, c) => Math.min(1, Math.max(0, (400 - a) / (c - a))) };
  sc.refuseAt = 600;
  snack.refuse.call(f.self, f.s, sc, 400, k);
  assert.ok(Number(sc.snack.style.opacity) < 1 || /calc\(-?\d/.test(sc.snack.style.translate));
  assert.ok(Number.parseFloat(sc.snack.style.translate.match(/calc\((-?[\d.]+)px/)[1]) < sc.pos.x, "it rolled toward the pad");
  snackRun(f, sc, 700, { entry: snack });
  assert.strictEqual(sc.snack.style.opacity, "0");
});

test("catchPoint: a fixed 8% of the height below the head point, on the drawn rect; face where given; mirrored when flipped", () => {
  const { catchPoint } = snackEntry();
  const rect = { left: 100, top: 40, width: 150, height: 150 };
  const s = { drawn: "adult", species: { head: { adult: [160, 64] } }, pet: { classList: { contains: () => false } } };
  const p = catchPoint(s, rect, { left: 0, top: 0 });
  assert.ok(Math.abs(p.x - (100 + (160 * 150) / 256)) < 1e-6);
  assert.ok(Math.abs(p.y - (40 + (64 * 150) / 256 + 0.08 * 150)) < 1e-6);
  const flipped = catchPoint({ ...s, pet: { classList: { contains: () => true } } }, rect, { left: 0, top: 0 });
  assert.ok(Math.abs(flipped.x - (100 + (96 * 150) / 256)) < 1e-6);
  const face = catchPoint({ ...s, species: { head: s.species.head, face: { adult: [200, 190, 64] } } }, rect, { left: 10, top: 0 });
  assert.ok(Math.abs(face.x - (90 + (200 * 150) / 256)) < 1e-6);
  assert.ok(Math.abs(face.y - (40 + (190 * 150) / 256 + 0.03 * 150)) < 1e-6);
});

test("a favourite snack's moment, while a snack scene plays, marks it and does not perk the pet a second time", () => {
  const m = method("_moment");
  assert.match(m, /const scene = s\.scene\?\.kind === "snack" \? s\.scene : null;\n\s+if \(scene\) scene\.fav = true;/);
  assert.match(m, /\{ catch: !said\.baby, perk: !scene \}/);
});

test("snack is not skippable and plays an owed ok, as feed", () => {
  const { SCENES } = snackEntry();
  assert.strictEqual(SCENES.snack.skippable, false);
  assert.strictEqual(SCENES.snack.playOwed, true);
  assert.strictEqual(SCENES.snack.gate, 650);
  assert.ok(SCENES.snack.refuseMs <= 900);
});

test("snack's line is 1 in 4 (SNACK_LINE_ODDS), like feed's extra; the dice over it say nothing", () => {
  assert.strictEqual(src.match(/\nconst SNACK_LINE_ODDS = ([\d.]+);/)[1], "0.25");
  assert.strictEqual(src.match(/\nconst FEED_EXTRA_ODDS = ([\d.]+);/)[1], "0.25");
  const said = (r) => {
    const { SCENES } = snackEntry(dice(r));
    const f = snackSlide();
    f.s.pinVariant = { snack: "A" };
    const sc = f.setup(SCENES.snack);
    sc.result = "ok";
    const lines = [];
    for (let t = 0; t <= sc.ms; t += 10) lines.push(...snackRun(f, sc, t, { entry: SCENES.snack }).log.lines);
    return plain(lines);
  };
  assert.deepStrictEqual(said(0.2), ["*gotcha!*"]);
  assert.deepStrictEqual(said(0.3), []);
});

// --- Ship D: tuck and wake, the drape (plan 4.3b, 5.3, 12) ------------------------------------
// The real lights entry, its answer path and the drape on a fake slide, in a vm.
function lightsCard({ calm = false, energy = "60", asleep = false, lights = false, sleepTimes } = {}) {
  const log = { lines: [], animated: [], timers: [], tapped: [], calls: [], shown: [], bg: [], sceneEnds: 0 };
  const states = {
    "binary_sensor.asleep": { state: asleep ? "on" : "off" },
    "switch.lights_out": { state: lights ? "on" : "off" },
    "sensor.energy": { state: energy },
    "sensor.mood": { state: "content", attributes: { flags: [] } },
    "sensor.life_stage": { state: "adult", attributes: { sleep_times: sleepTimes } },
  };
  const clock = { now: 0 };
  const el = () => {
    const cls = new Set();
    return { style: {}, hidden: false, className: "", remove() {}, classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), add: (c) => cls.add(c), remove: (c) => cls.delete(c),
      contains: (c) => cls.has(c), [Symbol.iterator]: () => cls[Symbol.iterator]() }, setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k] ?? null; }, removeAttribute(k) { delete this[k]; } };
  };
  const FakeDate = class extends Date { static now() { return 1e12 + clock.now; } };
  const ctx = { calm: () => calm, performance: { now: () => clock.now }, Date: FakeDate, Math, Number, Array, Set, Promise, document: { createElement: () => el() },
    setTimeout: (fn, ms) => log.timers.push([fn, ms]), clearTimeout() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    BASE: "/f", VERSION: "t", MINE: 4, MINE_MS: 3000, MINE_MATCH_MS: 10000, pick: (l) => l[0], REFUSALS: { not_sleepy: "not sleepy yet" }, Image: class { set src(v) { this.s = v; } } };
  const consts = ["SCENE_KIND_OF", "sceneKind", "SCENE_HOLD_MS", "SCENE_EXIT_MS", "SCENE_OWE_MS", "SPOILED_BY", "isYes", "LIGHTS_TIRED_AT", "LIGHTS_QUIET_MS",
    "DRAPE_FALL_MS", "DRAPE_SLIDE_PX", "WAKE_STRETCH_MS", "DRAPE_RETRY_MS", "DRAPE_ART", "DRAPE_ART_BOX", "LIGHTS_NIGHT_ODDS"].map((n) => src.match(new RegExp(`\\nconst ${n} = [^\\n]*`))[0]);
  const fn = (name) => src.match(new RegExp(`\\nfunction ${name}\\([\\s\\S]*?\\n\\}\\n`))[0];
  const block = src.slice(src.indexOf("const SCENES = {"), src.indexOf("\n};\n", src.indexOf("const SCENES = {")) + 4);
  const methods = ["_sceneClock", "_sceneOver", "_sceneAnswer", "_sceneFail", "_sceneNow", "_sceneOffer", "_sceneEnd", "_sceneRefusalLine", "_toggleLights", "_lightsLive",
    "_lightsWatch", "_lightsTuck", "_lightsWake", "_lightsSay", "_moodFrames", "_drapeInfo", "_drapeSrc", "_drapePreload", "_drapeShow", "_drapeHide", "_drapeStop", "_drapeMirror",
    "_drapeSync", "_sceneKey", "_bgApply"].map(method).join(",\n");
  vm.runInNewContext([...consts, konst("DRAPE"), konst("LIGHTS_LINES"), konst("NATURE_VALUES"), fn("drapeOf"), fn("inSleepWindow"), fn("nature"), block,
    `this.api = {${methods}}; this.SCENES = SCENES; this.drapeOf = drapeOf; this.inSleepWindow = inSleepWindow; this.DRAPE_ART = DRAPE_ART;`].join("\n"), ctx);
  const s = {
    species: { moods: ["content", "sleepy", "asleep", "excited", "bored"], frames: 2, backgrounds: { day: "bg_day", dim: "bg_dim", night: "bg_night" } },
    drawn: "adult", speciesId: "fox", ids: Object.fromEntries(Object.keys(states).map((k) => [k, k])), pressed: [], buttons: { lights: { id: "lights" } },
    pet: el(), perch: el(), drape: el(), drapeImg: el(), bg: Object.assign(el(), { after() {} }), screen: Object.assign(el(), { getBoundingClientRect: () => ({}) }),
    game: null, frames: ["adult_content_1"], poseFrames: [], poseUntil: 0,
  };
  s.screen.classList = Object.assign(s.screen.classList, { contains: () => false });
  // The ledger adapters over the real director (slice 9: the drape's timers are group "drape"); a timer it schedules is
  // recorded as [fn, ms], as the stubbed setTimeout's was, and a cancel takes it out.
  const ledger = adapters((ms, fn) => {
    const t = [fn, ms];
    log.timers.push(t);
    return () => { const k = log.timers.indexOf(t); if (k >= 0) log.timers.splice(k, 1); };
  });
  const self = Object.assign(Object.create(ctx.api), ledger, {
    _hass: { states }, _state: (_s, k) => states[k], _live: (_s, k) => states[k],
    _rimCue() {}, _tapped: (_b, _s, o) => log.tapped.push(o?.perk !== false), _careMarks() {},
    _call: () => { log.calls.push(1); return Promise.resolve(self.callResult ?? true); },
    _line: (_s, _c, text) => log.lines.push(text), _lines: (_s, _k, text) => ({ text }),
    _animate: (_s, _e, c) => log.animated.push(c), _perk() {}, _patSync() {}, _redraw() {}, _careVariant: (_s, _k, pool) => s.pinVariant?.lights || pool[0],
    _careFrames(s0, sc) { sc.excited = ["adult_excited_1"]; sc.sleepy = ["adult_sleepy_1"]; sc.content = ["adult_content_1"]; sc.refuse = ["adult_bored_1"]; },
    _show: (_s, _e, f) => log.shown.push(f), _tuckLine: () => ({ text: "night night...", ms: 4000 }), _firstNightKey: () => null, _nightLine: () => null,
    _sceneStart(s0, kind) { // as _sceneStart makes one (the elements and the rAF are the browser's)
      const entry = ctx.SCENES[kind];
      if (!entry.due.call(self, s0, states["sensor.mood"], "adult")) return;
      const sc = { kind, start: clock.now, ms: entry.ms, gate: entry.gate ?? null, els: [], answerAt: null, result: null, held: {} };
      entry.setup.call(self, s0, sc, {});
      s0.scene = sc;
    },
    _bgApply: (_s, key) => log.bg.push(key),
  });
  return { self, s, log, ctx, states, clock };
}
const flipLive = (f, asleep, lights = asleep) => {
  f.states["binary_sensor.asleep"] = { state: asleep ? "on" : "off" };
  f.states["switch.lights_out"] = { state: lights ? "on" : "off" };
};
const lightsTap = (f) => { f.s.asleep = f.states["binary_sensor.asleep"].state === "on"; f.s.lightsOut = f.states["switch.lights_out"].state === "on"; f.self._toggleLights(f.s); };

test("lights: a night creature's one-more-look is 1 in 4 (LIGHTS_NIGHT_ODDS); the others never, a pin wins", () => {
  assert.strictEqual(src.match(/\nconst LIGHTS_NIGHT_ODDS = ([\d.]+);/)[1], "0.25");
  const setup = (clock, roll, pin) => {
    const f = lightsCard();
    f.s.species.nature = { clock, sky: "sun", company: "solo", habit: "explorer" };
    f.ctx.Math = Object.assign(Object.create(Math), { random: () => roll }); // the odds override: a pinned roll
    if (pin) f.s.pinVariant = { "lights.night": pin };
    lightsTap(f);
    return f.s.scene.night;
  };
  assert.strictEqual(setup("night", 0.24), true, "under the odds: it looks round");
  assert.strictEqual(setup("night", 0.25), false, "at the odds or over: the thanks as usual");
  assert.strictEqual(setup("day", 0), false, "a day creature never");
  assert.strictEqual(setup("dusk", 0), false, "a dusk creature never");
  assert.strictEqual(setup("night", 0.9, "on"), true, "a bench pin on");
  assert.strictEqual(setup("night", 0, "off"), false, "a bench pin off");
});

test("lights: due for a tuck when tired or at the pet's night, never on a bad reading; always for a wake", () => {
  const due = (o) => { const f = lightsCard(o); f.s.asleep = !!o.asleep; f.s.lightsOut = !!o.lights; return f.ctx.SCENES.lights.due.call(f.self, f.s); };
  assert.strictEqual(due({ energy: "94.9" }), true);
  assert.strictEqual(due({ energy: "95" }), false);
  for (const e of ["unavailable", "unknown", "NaN", null]) assert.strictEqual(due({ energy: e }), false, String(e));
  assert.strictEqual(due({ asleep: true, energy: "unknown" }), true, "a wake");
  assert.strictEqual(due({ lights: true, energy: "unknown" }), true, "lights out, the pet awake: still a wake");
  const at = (h, m) => new Date(2026, 5, 15, h, m);
  const win = { bedtime: "23:00", wake: "07:00" };
  const { ctx } = lightsCard();
  assert.deepStrictEqual([at(21, 59), at(22, 0), at(23, 30), at(3, 0), at(6, 59), at(7, 0), at(12, 0)].map((d) => ctx.inSleepWindow(win, d)),
    [false, true, true, true, true, false, false]);
  assert.strictEqual(ctx.inSleepWindow(undefined, at(23, 30)), false, "an older server: no sleep_times");
});

test("lights: a tap sends one call and starts the scene; the entry mirrors _press", async () => {
  const f = lightsCard();
  lightsTap(f);
  assert.strictEqual(f.log.calls.length, 1);
  assert.strictEqual(f.s.scene.kind, "lights");
  assert.deepStrictEqual(plain(f.s.pressed.map((p) => p.action)), ["lights_out"]);
  assert.strictEqual(f.s.scene.wake, false);
  assert.strictEqual(f.s.scene.gate, 400);
  await Promise.resolve();
  await Promise.resolve();
  assert.strictEqual(f.s.scene.called, 0, "the call came back: the quiet exit counts from it");
});

test("lights: a second tap while the scene lives is ignored: the ring only, nothing sent, no scene ended", () => {
  const f = lightsCard();
  lightsTap(f);
  const sc = f.s.scene;
  lightsTap(f);
  assert.strictEqual(f.log.calls.length, 1);
  assert.strictEqual(f.s.scene, sc);
  assert.deepStrictEqual(plain(f.log.tapped), [false], "the ring and the haptic, no perk");
  assert.strictEqual(f.s.pressed.length, 1);
});

test("lights is not skippable: no screen-tap stop, and a tap behind the status sheet starts nothing", () => {
  const { ctx } = lightsCard();
  assert.strictEqual(ctx.SCENES.lights.skippable, false);
  assert.strictEqual(ctx.SCENES.lights.playOwed, undefined);
  assert.match(method("_sceneStart"), /if \(entry\.skippable\) \{\n\s+sc\.stop = /); // the stop is installed only for a skippable scene
  assert.match(method("_sceneStart"), /s\.screen\.classList\.contains\("show-status"\)\) return;/); // with the sheet open no scene starts
});

test("lights: the live asleep answers a tuck; the call coming back alone does not", () => {
  const f = lightsCard();
  lightsTap(f);
  const sc = f.s.scene;
  f.clock.now = 120;
  sc.at = 120;
  sc.called = 60;
  f.self._lightsWatch(f.s);
  assert.strictEqual(sc.answerAt, null, "no change yet");
  flipLive(f, true);
  sc.at = 180;
  f.self._lightsWatch(f.s);
  assert.deepStrictEqual([sc.answerAt, sc.result, sc.answered], [180, "ok", true]);
  assert.strictEqual(sc.failAt, undefined);
  assert.strictEqual(f.self._sceneClock(sc, 900).te, 900 - 0, "answered before the gate: one continuous beat");
});

test("lights: 600 ms with no change after the call is the quiet exit, not the 2 s hold", () => {
  const f = lightsCard();
  lightsTap(f);
  const sc = f.s.scene;
  sc.called = 60;
  sc.at = 659;
  f.self._lightsWatch(f.s);
  assert.strictEqual(sc.failAt, undefined);
  sc.at = 660;
  f.self._lightsWatch(f.s);
  assert.deepStrictEqual([sc.failAt, sc.quiet], [660, true]);
  assert.strictEqual(f.self._sceneOver(f.s, 660 + 399), false);
  assert.strictEqual(f.self._sceneOver(f.s, 660 + 400), true, "the exit beat is 400 ms");
  f.self._sceneEnd(f.s);
  assert.deepStrictEqual(plain(f.s.sceneOwes || []), [], "a failed or quiet exit leaves no owe");
  assert.deepStrictEqual(plain(f.log.lines), [], "no line");
});

test("lights: a wake of a pet that is already awake takes the same quiet exit", () => {
  const f = lightsCard({ asleep: true, lights: true });
  lightsTap(f);
  const sc = f.s.scene;
  assert.strictEqual(sc.wake, true);
  assert.strictEqual(sc.gate, 300);
  flipLive(f, false); // it was awake already: the switch goes off, the pet was up before the tap's picture
  // The change from the start is the answer when the live state differs from what the card thought:
  sc.start0 = { asleep: false, lights: false }; // woken a beat before the tap: no change from here
  sc.called = 50;
  sc.at = 650;
  f.self._lightsWatch(f.s);
  assert.deepStrictEqual([sc.answerAt, sc.quiet], [null, true]);
});

test("lights: a wake is answered when the pet and the switch are both off", () => {
  const f = lightsCard({ asleep: true, lights: true });
  lightsTap(f);
  const sc = f.s.scene;
  flipLive(f, false, true); // awake, the switch still on: not yet
  sc.at = 100;
  f.self._lightsWatch(f.s);
  assert.strictEqual(sc.answerAt, null);
  flipLive(f, false, false);
  f.self._lightsWatch(f.s);
  assert.deepStrictEqual([sc.answerAt, sc.result], [100, "ok"]);
});

test("lights: a false from _call takes the failure exit", async () => {
  const f = lightsCard();
  f.self.callResult = false;
  lightsTap(f);
  const sc = f.s.scene;
  await Promise.resolve();
  await Promise.resolve();
  assert.notStrictEqual(sc.failAt, undefined);
  assert.strictEqual(f.self._sceneOver(f.s, sc.failAt + 400), true);
});

test("lights: not_sleepy, claimed as mine, is the head shake and the hop; nothing to undo", () => {
  const f = lightsCard();
  lightsTap(f);
  const sc = f.s.scene;
  f.self._care = undefined;
  assert.strictEqual(f.self._sceneOffer(f.s, { action: "lights_out", result: "not_sleepy" }, true), true);
  assert.deepStrictEqual([sc.result, sc.refuseAt, sc.answered], ["not_sleepy", 0, true]);
  const entry = f.ctx.SCENES.lights;
  const frames = (u) => plain(entry.refuse.call(f.self, f.s, sc, u));
  assert.deepStrictEqual(frames(100), ["adult_sleepy_1"]);
  assert.strictEqual(f.s.pet.classList.contains("look"), true, "the first flip");
  frames(300);
  assert.strictEqual(f.s.pet.classList.contains("look"), false, "the second");
  assert.deepStrictEqual(frames(600), ["adult_excited_1"], "then a hop");
  assert.strictEqual(f.self._sceneOver(f.s, 400 + 900), true, "900 ms from the refusal");
  assert.strictEqual(f.self._sceneOffer(f.s, { action: "lights_out", result: "not_sleepy" }, false), false, "a partner's refusal is not mine");
});

test("lights: the scene writes wasAsleep once at the lie-down and once at the blink, and says nothing at the sigh until answered", () => {
  const f = lightsCard();
  lightsTap(f);
  const sc = f.s.scene;
  const k = (t) => ({ ramp: (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a))), ease: (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a))) });
  f.s.wasAsleep = false;
  sc.dusk = { style: {} };
  sc.drape = null;
  for (const t of [100, 400, 549]) f.self._lightsTuck(f.s, sc, t, k(t));
  assert.strictEqual(f.s.wasAsleep, false);
  f.self._lightsTuck(f.s, sc, 550, k(550));
  assert.strictEqual(f.s.wasAsleep, true);
  f.s.wasAsleep = "later";
  f.self._lightsTuck(f.s, sc, 560, k(560));
  assert.strictEqual(f.s.wasAsleep, "later", "once");
  assert.strictEqual(f.log.animated.filter((c) => c === "lie").length, 1);
  f.self._lightsTuck(f.s, sc, 1800, k(1800));
  assert.deepStrictEqual(plain(f.log.lines), [], "no answer, no thanks");
  sc.result = "ok";
  sc.fired.delete("sigh");
  f.self._lightsTuck(f.s, sc, 1810, k(1810));
  assert.deepStrictEqual(plain(f.log.lines), ["night night..."]);
  const w = lightsCard({ asleep: true, lights: true });
  lightsTap(w);
  const wc = w.s.scene;
  wc.dusk = { style: {} };
  w.s.wasAsleep = true;
  w.self._lightsWake(w.s, wc, 699);
  assert.strictEqual(w.s.wasAsleep, true);
  w.self._lightsWake(w.s, wc, 700);
  assert.strictEqual(w.s.wasAsleep, false);
  assert.deepStrictEqual(plain(w.log.lines), [], "awake in the day: the stretch's line is later");
  w.self._lightsWake(w.s, wc, 1150);
  assert.deepStrictEqual(plain(w.log.lines), ["*stretches*"]);
  assert.ok(w.s.stretched > 0, "the moment's own stretch is held off");
  const hm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const nowD = new Date();
  const g = lightsCard({ asleep: true, lights: true, sleepTimes: { bedtime: hm(new Date(nowD - 5 * 60000)), wake: hm(new Date(+nowD + 120 * 60000)) } }); // it is the pet's night right now
  lightsTap(g);
  g.s.scene.dusk = { style: {} };
  g.self._lightsWake(g.s, g.s.scene, 700);
  assert.deepStrictEqual(plain(g.log.lines), ["*blinks, squinting*"], "in the sleep window the blink is groggy, the stretch is plain");
});

test("lights: _layout leaves the background, the settle and wasAsleep to the scene while it lives", () => {
  const m = method("_renderSlide");
  assert.match(m, /const lightsScene = s\.scene\?\.kind === "lights";\n\s+if \(lightsScene\) this\._lightsWatch\(s\);/);
  assert.match(m, /if \(!lightsScene\) \{\n\s+if \(asleep && s\.wasAsleep === false && !s\.egg && !calm\(\)\) this\._animate\(s, s\.pet, "settle", 2500\);\n\s+s\.wasAsleep = asleep;/);
  assert.match(m, /if \(!lightsScene\) this\._bgApply\(s, scene\);/);
  assert.match(m, /if \(!lightsScene\) this\._drapeSync\(s, asleep && lightsOut && !s\.egg\);/);
  // The scene keys as the layout did: dim wins, then night, then rain.
  const { self } = lightsCard();
  const sun = (state) => ({ "sun.sun": { state } });
  assert.deepStrictEqual([self._sceneKey(sun("above_horizon"), [], false), self._sceneKey(sun("above_horizon"), ["rainy"], false), self._sceneKey(sun("below_horizon"), ["rainy"], false),
    self._sceneKey(sun("below_horizon"), [], true)], ["day", "rain", "night", "dim"]);
});

test("the woke_up lights moment does not stretch twice, nor say a tuck line the scene said", () => {
  const m = method("_moment");
  assert.match(m, /!\(Date\.now\(\) - \(s\.stretched \|\| 0\) < WAKE_STRETCH_MS\)\) this\._animate\(s, s\.pet, "stretch", 1100\)/);
  assert.match(m, /if \(m\.how === "lights" && !capture && \(s\.scene\?\.kind === "lights" \|\| Date\.now\(\) - \(s\.tuckedAt \|\| 0\) < WAKE_STRETCH_MS\)\) break;/);
  // Run it: a stretch moment after a wake scene's own stretch, and a fell_asleep during a scene.
  const ctx = { Date, calm: () => false, WAKE_STRETCH_MS: 2500, MOMENT_CLASS: {}, FLAVOUR: 1, KEPT: 3, pick: (l) => l[0] };
  vm.runInNewContext(`const o = {${m}}; this.moment = o._moment;`, ctx);
  const run = (s, moment) => {
    const log = { animated: [], lines: [] };
    const self = { _animate: (_s, _e, c) => log.animated.push(c), _line: (_s, _c, text) => log.lines.push(text), _tuckLine: () => ({ text: "night night...", ms: 4000 }) };
    ctx.moment.call(self, s, moment);
    return log;
  };
  assert.deepStrictEqual(plain(run({ asleep: false, scene: null }, { type: "woke_up", how: "lights" }).animated), ["stretch"], "a wake from elsewhere stretches as before");
  assert.deepStrictEqual(plain(run({ asleep: false, scene: null, stretched: Date.now() - 1000 }, { type: "woke_up", how: "lights" }).animated), [], "just after a wake scene's stretch");
  assert.deepStrictEqual(plain(run({ asleep: false, scene: { kind: "lights" } }, { type: "woke_up", how: "lights" }).animated), []);
  assert.deepStrictEqual(plain(run({ scene: { kind: "lights" } }, { type: "fell_asleep", how: "lights" }).lines), [], "the scene says its own");
  // N4: a hand wake at night is the scene's groggy line, not "...so sleepy" first.
  const night = { type: "woke_up", how: "night" };
  assert.deepStrictEqual(plain(run({ scene: { kind: "lights" } }, night).lines), [], "while a lights scene lives");
  assert.deepStrictEqual(plain(run({ scene: null, stretched: Date.now() - 500 }, night).lines), [], "just after one");
  assert.deepStrictEqual(plain(run({ scene: null }, night).lines), ["...so sleepy"], "a wake from elsewhere is today's");
  assert.deepStrictEqual(plain(run({ scene: null, tuckedAt: Date.now() - 500 }, { type: "fell_asleep", how: "lights" }).lines), []);
  assert.deepStrictEqual(plain(run({ scene: null }, { type: "fell_asleep", how: "lights" }).lines), ["night night..."], "a tuck seen from elsewhere is today's");
  assert.deepStrictEqual(plain(run({ scene: { kind: "lights" } }, { type: "fell_asleep", how: "house" }).lines), ["night night..."], "only a lights tuck is the scene's");
});

test("the drape: others' tuck falls in DRAPE_FALL_MS, a wake slides off in two steps whatever woke it, calm is instant", () => {
  const f = lightsCard();
  f.self._drapeSync(f.s, false); // the first pass: nothing
  assert.strictEqual(f.s.drapeFrame, undefined);
  f.self._drapeSync(f.s, true);
  assert.strictEqual(f.s.drapeFrame, 1, "asleep and the lights out turned on: it falls");
  const drape = (g) => plain((g.self._director.inspect(g.s)?.timers || []).filter((x) => x.group === "drape").map((x) => x.ms));
  assert.deepStrictEqual(plain(f.log.timers.map(([, ms]) => ms)), [150, 300, 450]);
  assert.deepStrictEqual(drape(f), [150, 300, 450], "the ledger group drape");
  f.log.timers.slice().forEach(([fn]) => fn());
  assert.deepStrictEqual(drape(f), [], "nothing left once they have run");
  f.log.timers.length = 0; // the recorded schedule, not the ledger
  assert.deepStrictEqual([f.s.drapeFrame, f.s.drapeAnim], [3, false]);
  assert.match(f.s.drapeImg.src, /drape_l_3\.png/);
  f.self._drapeSync(f.s, false); // a wake: lights on, or a natural morning that cleared them: the same
  assert.strictEqual(f.s.drapeFrame, 2);
  assert.ok(f.s.drapeImg.style.translate, "frame 2, dropped");
  assert.deepStrictEqual(plain(f.log.timers.map(([, ms]) => ms)), [150]);
  assert.deepStrictEqual(drape(f), [150]);
  f.log.timers[0][0]();
  assert.strictEqual(f.s.drape.hidden, true);
  // A pet tucked when the card opens shows the final frame; calm is on or off at once.
  const open = lightsCard();
  open.self._drapeSync(open.s, true);
  assert.strictEqual(open.s.drapeFrame, 3);
  const still = lightsCard({ calm: true });
  still.self._drapeSync(still.s, false);
  still.self._drapeSync(still.s, true);
  assert.strictEqual(still.s.drapeFrame, 3);
  assert.strictEqual(still.log.timers.length, 0);
  still.self._drapeSync(still.s, false);
  assert.strictEqual(still.s.drape.hidden, true);
  // An opt-out species and a missing file: no blanket, no error.
  const bat = lightsCard();
  bat.s.speciesId = "bat";
  bat.self._drapeSync(bat.s, false);
  bat.self._drapeSync(bat.s, true);
  assert.strictEqual(bat.s.drapeFrame ?? 0, 0);
  const none = lightsCard();
  none.ctx.DRAPE_ART.ok = false;
  none.ctx.DRAPE_ART.at = 1e12;
  none.self._drapeSync(none.s, true);
  assert.strictEqual(none.s.drapeFrame ?? 0, 0);
});

test("the drape mirrors the pet's classes and motion, but not the lie-down squash", () => {
  const f = lightsCard();
  f.self._drapeShow(f.s, 3);
  for (const c of ["pet", "settle", "heavy", "lie"]) f.s.pet.classList.add(c);
  Object.assign(f.s.pet.style, { translate: "1px 2px", rotate: "3deg", scale: "1.05", transition: "none" });
  f.self._drapeMirror(f.s);
  assert.strictEqual(f.s.drape.className, "drape settle heavy");
  assert.deepStrictEqual([f.s.drape.style.translate, f.s.drape.style.rotate, f.s.drape.style.scale, f.s.drape.style.transition], ["1px 2px", "3deg", "1.05", "none"]);
});

test("lights, reduced motion: no scene, the pose only (sleepy for a tuck, content for a wake)", () => {
  const f = lightsCard({ calm: true });
  f.ctx.SCENES.lights.calm.call(f.self, f.s);
  assert.deepStrictEqual(plain(f.s.poseFrames), ["adult_sleepy_1", "adult_sleepy_2"]);
  f.s.asleep = true;
  f.ctx.SCENES.lights.calm.call(f.self, f.s);
  assert.deepStrictEqual(plain(f.s.poseFrames), ["adult_content_1", "adult_content_2"]);
  assert.match(method("_sceneStart"), /s\.sceneFade = \{ kind, until: Date\.now\(\) \+ 10000 \};[^\n]*\n\s+entry\.calm\?\.call\(this, s\);/);
});

// --- Care D audit fixes (the tier-2 audit, 2026-11-02) ------------------------------------------
test("audit P1: the tucked_in thanks is the scene's sigh line, not a second one around the goodnight", () => {
  const m = method("_moment");
  const ctx = { Date, calm: () => false, MOMENT_CLASS: {}, FLAVOUR: 1, KEPT: 3, sharedScreen: () => false, withName: (t) => t, short: (t) => t, BOND: { nickname: 3 }, pick: (l) => l[0] };
  vm.runInNewContext(`const o = {${m}}; this.moment = o._moment;`, ctx);
  const run = (s, moment, capture = null) => {
    const lines = [];
    const self = { _line: (_s, _c, text) => lines.push(text), _bond: () => null, _hass: { user: { name: "Dev" } }, _lines: (_s, _k, text) => ({ text }) };
    ctx.moment.call(self, s, moment, capture);
    return lines;
  };
  const tucked = { type: "tucked_in" };
  // Before the sigh, a tuck scene keeps the thanks for its own line: nothing said now.
  const s = { scene: { kind: "lights", wake: false, fired: new Set(["lie"]) } };
  assert.deepStrictEqual(plain(run(s, tucked)), []);
  assert.deepStrictEqual(plain(s.scene.thanks), { text: "thank you for tucking me in ♥", ms: 4000 });
  // The sigh beat says it in place of the goodnight (variant C's too).
  const f = lightsCard();
  lightsTap(f);
  const sc = f.s.scene;
  sc.thanks = { text: "thank you for tucking me in ♥", ms: 4000 };
  sc.result = "ok";
  sc.dusk = f.s.pet; sc.asleep = []; sc.sleepy = [];
  const opts = { ramp: () => 0, ease: () => 0 };
  f.self._lightsTuck(f.s, sc, 1800, opts);
  assert.deepStrictEqual(plain(f.log.lines), ["thank you for tucking me in ♥"]);
  // After the sigh (or with no scene), it is said as before; a wake scene or the catch-up keep today's.
  assert.deepStrictEqual(plain(run({ scene: { kind: "lights", wake: false, fired: new Set(["sigh"]) } }, tucked)), ["thank you for tucking me in ♥"]);
  assert.deepStrictEqual(plain(run({ scene: null }, tucked)), ["thank you for tucking me in ♥"]);
  assert.deepStrictEqual(plain(run({ scene: { kind: "lights", wake: true, fired: new Set() } }, tucked)), ["thank you for tucking me in ♥"]);
  assert.deepStrictEqual(plain(run({ scene: { kind: "lights", wake: false, fired: new Set() } }, tucked, [])), []);
});

test("audit P2: one failed drape load disables the blanket only if none ever loaded, and then for 60 s", () => {
  // A file loaded before: a dropped fetch hides this blanket, and the next tuck shows one.
  const a = lightsCard();
  a.self._drapeShow(a.s, 3);
  a.s.drapeImg.onload();
  a.s.drapeImg.onerror();
  assert.strictEqual(a.ctx.DRAPE_ART.ok, true);
  assert.strictEqual(a.s.drape.hidden, true);
  assert.strictEqual(a.s.drapeImg.getAttribute("src"), null, "the broken src is dropped so a show asks again");
  assert.strictEqual(a.self._drapeShow(a.s, 3), true);
  assert.match(a.s.drapeImg.src, /drape_l_3\.png/);
  // None ever loaded: no blanket for DRAPE_RETRY_MS, then it looks again.
  const b = lightsCard();
  b.self._drapeShow(b.s, 3);
  b.s.drapeImg.onerror();
  assert.strictEqual(b.ctx.DRAPE_ART.ok, false);
  assert.strictEqual(b.self._drapeInfo(b.s), null);
  b.clock.now = 59999;
  assert.strictEqual(b.self._drapeInfo(b.s), null);
  b.clock.now = 60000;
  assert.strictEqual(b.self._drapeInfo(b.s).size, "l");
  assert.strictEqual(b.ctx.DRAPE_ART.ok, undefined);
});

test("audit N1/N5: nothing past the gate plays while the scene holds on it: lie, lit, dusk, the night look", () => {
  const opts = { ramp: () => 0, ease: () => 0 };
  const tuck = lightsCard();
  lightsTap(tuck);
  const sc = tuck.s.scene;
  Object.assign(sc, { dusk: tuck.s.pet, asleep: [], sleepy: [], night: true });
  assert.strictEqual(sc.gate, 400);
  assert.strictEqual(tuck.self._sceneClock(sc, 1000).te, 400, "held at the gate");
  tuck.self._lightsTuck(tuck.s, sc, 400, opts);
  assert.deepStrictEqual(plain(tuck.log.animated), [], "no squash at the gate");
  assert.deepStrictEqual(plain(tuck.log.lines), [], "no look-round line at the gate");
  tuck.self._lightsTuck(tuck.s, sc, 400.01, opts);
  assert.deepStrictEqual(plain(tuck.log.animated), ["lie"]);
  assert.strictEqual(tuck.log.lines.length, 1, "the look-round line comes after the gate");
  const wake = lightsCard({ asleep: true, lights: true });
  lightsTap(wake);
  const w = wake.s.scene;
  Object.assign(w, { dusk: wake.s.pet, asleep: [], sleepy: [], content: [], lit: "day" });
  assert.strictEqual(w.gate, 300);
  wake.self._lightsWake(wake.s, w, 300);
  assert.deepStrictEqual(plain(wake.log.bg), [], "the room stays dim at the gate");
  assert.strictEqual(w.dusk.style.opacity, "0");
  wake.self._lightsWake(wake.s, w, 300.01);
  assert.deepStrictEqual(plain(wake.log.bg), ["day"]);
  assert.strictEqual(w.dusk.style.opacity, ".3");
});

test("audit N6: an unavailable, unknown or missing asleep entity is no change, not an answer", () => {
  for (const bad of ["unavailable", "unknown", undefined]) {
    const f = lightsCard({ asleep: true, lights: true });
    lightsTap(f);
    const sc = f.s.scene;
    assert.strictEqual(sc.wake, true);
    f.states["binary_sensor.asleep"] = bad === undefined ? undefined : { state: bad };
    f.states["switch.lights_out"] = { state: "off" };
    sc.at = 100;
    f.self._lightsWatch(f.s);
    assert.strictEqual(sc.answerAt, null, `a wake with asleep ${bad}`);
    flipLive(f, false); // the entities are back, the pet is awake: now it is the answer
    sc.at = 200;
    f.self._lightsWatch(f.s);
    assert.strictEqual(sc.result, "ok");
  }
  const t = lightsCard();
  lightsTap(t);
  t.states["binary_sensor.asleep"] = { state: "unavailable" };
  t.s.scene.at = 100;
  t.self._lightsWatch(t.s);
  assert.strictEqual(t.s.scene.answerAt, null, "a tuck is not answered by an unavailable one either");
  assert.deepStrictEqual(plain(t.self._lightsLive(t.s)), { asleep: null, lights: false });
});

test("audit N2, N7, N9: _forget clears the drape, a lights scene drops .resting, disconnect ends scene and drape timers", () => {
  const forget = method("_forget");
  assert.match(forget, /this\._drapeStop\(s\);\s+this\._drapeHide\(s\);\s+s\.wasDrape = undefined;/);
  assert.match(src, /toggle\("resting", !!rest && !lightsScene\)/);
  const bye = src.match(/\n  disconnectedCallback\(\) \{[\s\S]*?\n  \}\n/)[0];
  assert.match(bye, /this\._sceneEnd\(s, \{ quiet: true \}\);/);
  assert.match(bye, /this\._drapeStop\(s\);/);
  // And what the clear does: a landing timer is cancelled and the blanket is down.
  const f = lightsCard();
  f.self._drapeSync(f.s, false);
  f.self._drapeSync(f.s, true);
  assert.strictEqual(f.s.drapeAnim, true);
  f.self._drapeStop(f.s);
  f.self._drapeHide(f.s);
  assert.deepStrictEqual([f.s.drapeAnim, f.s.drape.hidden, f.s.drapeFrame, plain(f.self._director.inspect(f.s)?.timers ?? [])], [false, true, 0, []]);
});

test("audit N3: _animate restarts the blanket with the pet (not the lie squash); startle, jig, droop, sulk share the drape's rules", () => {
  const ops = [];
  const ctx = {};
  vm.runInNewContext(`this.api = {${method("_animate")}};`, ctx);
  const self = Object.assign(Object.create(ctx.api), adapters());
  const el = (name) => ({ get offsetWidth() { ops.push(`${name}:reflow`); return 0; }, hidden: false, classList: { add: (c) => ops.push(`${name}+${c}`), remove: (c) => ops.push(`${name}-${c}`) } });
  const pet = el("pet");
  const drape = el("drape");
  self._animate({ pet, drape }, pet, "perk", 320);
  assert.deepStrictEqual(ops, ["pet-perk", "drape-perk", "pet:reflow", "pet+perk", "drape+perk"], "removed from both, one reflow, added to both");
  ops.length = 0;
  self._animate({ pet, drape }, pet, "lie", 300);
  assert.deepStrictEqual(ops, ["pet-lie", "pet:reflow", "pet+lie"], "the squash is the pet's alone");
  ops.length = 0;
  self._animate({ pet, drape: Object.assign(el("drape"), { hidden: true }) }, pet, "perk", 320);
  assert.ok(!ops.some((o) => o.startsWith("drape")), "a hidden blanket is left alone");
  ops.length = 0;
  self._animate({ pet, drape }, el("prop"), "perk", 320);
  assert.ok(!ops.some((o) => o.startsWith("drape")), "only the pet's own element");
  for (const c of ["startle", "jig", "droop", "sulk"]) {
    assert.match(src, new RegExp(`\\.pet\\.${c}, \\.drape\\.${c} \\{`), c);
  }
  assert.match(src, /\.pet\.droop, \.drape\.droop \{ transform: translateY\(4px\)/, "reduced motion holds the sag on both");
});
