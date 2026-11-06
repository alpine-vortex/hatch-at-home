// Director migration slice 2 (screen boxes and classes), after the move: what a forget does to each row (plan 3.14,
// 6.1 step 3). `detach` is what _forget calls on the slide, and every row here is "end": the class or the node comes
// off at once, nothing is left on the ledger, and nothing fires later on the slide's next pet. The mark's backstop is
// the one closer: the entry is dropped by `detach`, and _markEnd(s, true) (which _forget calls next) clears the rest.
// B1: before this slice a house fx and the robot survived a forget (their timers were not cleared there).
// The times are pinned by screen_fx_trace.test.js and are not edited by the move. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { world } = require("./timer_trace");

const ctx0 = { Date, Object, Array, Number, Math, JSON };
vm.runInNewContext(`${fs.readFileSync(path.join(__dirname, "..", "..", "src/card/interaction-director.js"), "utf8")}\n${fs.readFileSync(path.join(__dirname, "..", "..", "src/card/device-fx.js"), "utf8")}\nthis.F = HATCH_DEVICE_FX;`, ctx0);
const M = ctx0.F.MARK;

function fx(spec = {}) {
  return world({
    ...spec, screen: true,
    globals: { FLAIR: { glow: { place: "head" } }, HATCH_DEVICE_FX: ctx0.F, lcdOn: () => true, pick: (l) => l[0], ...(spec.globals || {}) },
    slide: () => ({ species: { head: {} }, glassSeen: true, glassViewed: M.everyMs, glassAt: 0 }),
  });
}

const ALL = {
  methods: ["_houseFx", "_robotFx", "_backlight", "_bondHearts", "_sparkle", "_flair", "_bubblePop", "_rareGlass", "_markEnd", "_react"],
  consts: ["FLAIR_MS", "BACKLIGHT_MS", "BUBBLE_POP_ODDS", "MINE", "MINE_MS", "BEAT"],
  globals: {
    Math: Object.assign(Object.create(Math), { random: () => 0 }),
    SPOILED_BY: new Set(["feed"]), PROP_FOR: {}, REACTIONS: { aired: { ms: 3000 } }, TALK_COPY: { fan: "ahh", blanket: "cosy" },
    FALLBACK_PROPS: {}, seasonNow: () => null, REFUSALS: {}, REACT_REFUSALS: new Set(), isHeavy: () => false, HEAVY_SNACK: [],
  },
  returns: { _words: { food: "x" }, _sceneOffer: false, _markClear: true, _dirShown: true,
    _state: { state: "adult", attributes: { traits: ["glow"], trait_levels: {} } } },
  fields: { _config: {} },
};
const start = (w) => {
  const s = w.slide;
  w.card._houseFx(s, "fx-heat");
  w.card._robotFx(s);
  w.card._backlight(s);
  w.card._bondHearts(s);
  w.card._sparkle(s);
  w.card._flair(s);
  w.card._bubblePop(s);
  w.card._react(s, { action: "fan", result: "ok" }, {});
  w.card._rareGlass(s, w.base + w.now, (kinds) => kinds[0]);
};

test("a forget mid-flight ends every class and box at once (B1: the house fx and the robot too); nothing is left on the ledger", () => {
  const w = fx(ALL);
  const s = w.slide;
  start(w);
  w.advance(10);
  assert.deepStrictEqual([...s.screen.cls].sort(), ["breezy", "fx-heat", "fx-robot", "lit"]);
  assert.ok(s.screen.children.length > 0 && s.mark.cls.size === 3);
  assert.strictEqual(w.director.pending(s), 9, "house, robot, lit, hearts, sparkle, flair, bubble, breezy and the mark's backstop");
  w.director.detach(s);
  assert.strictEqual(w.director.pending(s), 0);
  assert.deepStrictEqual([...s.screen.cls], []);
  assert.deepStrictEqual(s.screen.children.map((k) => k.name), []);
  w.card._markEnd(s, true); // _forget's next line: the mark's own clear (the backstop was dropped by detach)
  assert.strictEqual(s.mark.cls.size, 0);
  assert.strictEqual(s.markUntil, 0);
  const after = w.log.length;
  w.advance(30000);
  assert.deepStrictEqual(w.log.slice(after), [], "nothing fires later on the slide's next pet");
  assert.strictEqual(w.pendingTimers(), 0);
});

test("B1: the next pet's house fx on a reused slide is its own, not cut short by the last pet's timer", () => {
  const w = fx({ methods: ["_houseFx", "_robotFx"] });
  const s = w.slide;
  w.card._houseFx(s, "fx-heat");
  w.card._robotFx(s);
  w.advance(2000);
  w.director.detach(s); // the slide is reused for another pet
  assert.deepStrictEqual([...s.screen.cls], []);
  w.card._houseFx(s, "fx-cool"); // 2000: the next pet's
  w.advance(2400); // 4400: past the last pet's 2500 and well short of its own 4500
  assert.deepStrictEqual([...s.screen.cls], ["fx-cool"]);
  w.advance(100);
  assert.deepStrictEqual([...s.screen.cls], []);
});

test("an A1 re-arm runs no undo: a house fx or backlight re-triggered mid-flight leaves its class on, and one entry", () => {
  const w = fx({ methods: ["_houseFx", "_backlight"], consts: ["BACKLIGHT_MS"] });
  const s = w.slide;
  w.card._houseFx(s, "fx-heat");
  w.card._backlight(s);
  w.advance(1000);
  w.card._houseFx(s, "fx-heat");
  w.card._backlight(s);
  assert.strictEqual(w.director.pending(s), 2, "one entry per key");
  assert.deepStrictEqual([...s.screen.cls].sort(), ["fx-heat", "lit"]);
  assert.deepStrictEqual(w.log.filter((x) => x.op === "class-" && /^(fx-heat|lit)$/.test(x.arg) && x.t === 1000).map((x) => x.arg), ["fx-heat"],
    "only the house fx sweep (its own first line) removed anything at the re-trigger");
});

test("the mark: a forget drops the backstop (no undo), the closer clears the rest, and a reuse draws a fresh mark", () => {
  const w = fx(ALL);
  const s = w.slide;
  w.card._rareGlass(s, w.base + w.now, (kinds) => kinds[0]);
  assert.ok(w.card._has(s, { key: "mark" }));
  w.director.detach(s);
  assert.ok(!w.card._has(s, { key: "mark" }));
  assert.strictEqual(s.mark.cls.size, 3, "detach alone does not clear the glass: that is the closer's line (_markEnd(s, true))");
  w.card._markEnd(s, true);
  assert.strictEqual(s.mark.cls.size, 0);
  assert.strictEqual(s.glassSeen, false);
});
