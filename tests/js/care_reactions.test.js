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
  const methods = ["_reactFrames", "_reactMove", "_poseEnd", "_propShow", "_floorVariant"].map(method).join(",\n");
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

test("_floorVariant never gives the same one twice in a row, and a pin wins", () => {
  const { self, s, ctx } = card();
  ctx.pick = (list) => list[0];
  let last = null;
  for (let i = 0; i < 6; i++) {
    const v = self._floorVariant(s, "k", ["a", "b"]);
    assert.notStrictEqual(v, last);
    last = v;
  }
  s.pinVariant = { k: "b" };
  assert.strictEqual(self._floorVariant(s, "k", ["a", "b"]), "b");
  assert.strictEqual(self._floorVariant(s, "one", ["only"]), "only");
  assert.strictEqual(self._floorVariant(s, "one", ["only"]), "only");
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
  assert.match(src, /sc\.sniff = this\._floorVariant\(s, "medicine"/);
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
  const consts = ["SCENE_KIND_OF", "sceneKind", "SCENE_HOLD_MS", "SCENE_EXIT_MS", "SCENE_OWE_MS"].map(line).join("");
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
    buttons: { feed: {}, medicine: {} }, screen: { removeEventListener() {}, classList: { contains: () => false } },
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
