// Care reactions ship A, the floor (docs/plan-2026-11-02-care-reactions.md section 10 A):
// node --test tests/js. The card's source is read as it ships; the reaction methods run
// on a fake pet in a vm.
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");

const src = require("./card-source");
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
  const methods = ["_reactFrames", "_reactMove", "_poseEnd", "_propShow", "_careVariant"].map(method).join(",\n");
  vm.runInNewContext(`${consts}\nthis.api = {${methods}};\nthis.REACTIONS = REACTIONS; this.REACT_REFUSALS = REACT_REFUSALS;` +
    `this.REFUSAL_VARIANTS = REFUSAL_VARIANTS; this.SPOILED_BY = SPOILED_BY; this.STAGE_POSES = STAGE_POSES;`, ctx);
  const sp = species || { moods: ["content", "excited", "cozy", "bored", "sleepy"], frames: 2, acts: { eat: ["baby", "teen", "adult"], refuse: ["baby", "teen", "adult"] } };
  const classes = new Set();
  const s = {
    species: sp, drawn, speciesId: "fox", poseUntil: 0, poseFrames: [], frame: 0, frames: [`${drawn}_content_1`],
    pet: { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) } },
    prop: { classList: { add: (c) => classes.add(`prop:${c}`) }, style: {}, offsetWidth: 0 },
  };
  const self = Object.assign(Object.create(ctx.api), {
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

test("the guard still holds off a scene, sleep, away, the egg, a link and a game", () => {
  for (const flag of ["scene", "asleep", "away", "egg", "linking", "power", "game"]) {
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

test("unfair joins the reacting refusals; asleep, egg, away and no_game still do not; spoiled is a reaction", () => {
  const { ctx } = card();
  assert.ok(ctx.REACT_REFUSALS.has("unfair"));
  for (const r of ["asleep", "egg", "away", "no_game", "spoiled"]) assert.ok(!ctx.REACT_REFUSALS.has(r), r);
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
  assert.match(src, /excitedNow && !calm\(\) && !asleep && !away && !s\.scene[^;]*this\._animate\(s, s\.pet, "greethop", 1400\)/);
});

test("lights on stretches the pet (no line); the play beat, meds sniff and clean hop are wired", () => {
  assert.match(src, /m\.how === "lights"\) \{\n\s+now\(\(\) => \{ if \(!s\.asleep && !s\.scene && !calm\(\)\) this\._animate\(s, s\.pet, "stretch", 1100\)/);
  assert.match(src, /this\._reactFrames\(s, "played"\)/);
  assert.match(src, /sc\.sniff = this\._careVariant\(s, "medicine"/);
  assert.match(src, /const hopK = near < 1 && sweep < 1/);
  assert.match(src, /s\.pet\.classList\.add\("rock2"\)/); // the shake-off after the broom
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
  const methods = ["_sceneClock", "_sceneOver", "_sceneAnswer", "_sceneFail", "_sceneOffer", "_sceneEnd", "_sceneRefusalLine",
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
    _tapped: (_b, _s, o) => log.tapped.push(o?.perk !== false),
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
  // The shared guard (asleep, egg, away, lights out) runs before any due: today's _sceneStart line.
  assert.match(method("_sceneStart"), /if \(!mood \|\| mood\.state === "away" \|\| stage === "egg" \|\| s\.asleep \|\| s\.lightsOut\) return;\n.*entry\.due/);
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
  const timers = [];
  let id = 0;
  const ctx = {
    WeakMap, Map,
    setTimeout: (fn, ms) => { timers.push({ id: ++id, fn, ms }); return id; },
    clearTimeout: (i) => { const k = timers.findIndex((t) => t.id === i); if (k >= 0) timers.splice(k, 1); },
  };
  vm.runInNewContext(`${konst("ANIMATE_TIMERS")}\nthis.api = {${method("_animate")}};`, ctx);
  const classes = new Set();
  const el = { offsetWidth: 0, classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) } };
  ctx.api._animate({}, el, "chomp", 280);
  assert.ok(classes.has("chomp"));
  const first = timers[0];
  ctx.api._animate({}, el, "chomp", 280); // variant C: the next chomp, 250 ms on
  assert.strictEqual(timers.length, 1, "the first timer is cleared");
  assert.notStrictEqual(timers[0], first);
  assert.ok(classes.has("chomp"));
  timers.shift().fn(); // it fires, and is gone
  assert.ok(!classes.has("chomp"));
  // Another class, or another element, keeps its own.
  ctx.api._animate({}, el, "chomp", 280);
  ctx.api._animate({}, el, "perk", 320);
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
