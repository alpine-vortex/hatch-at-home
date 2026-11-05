// The sitter's life on the card (sitter plan S3a, 6.3-6.5; F7, F8, F9): the card's own methods run in
// a vm against a fake slide. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = require("./card-source");
const ROOT = path.join(__dirname, "..", "..");
const grab = (re) => {
  const m = src.match(re);
  assert.ok(m, `not in the card: ${re}`);
  return m[0];
};
const method = (name) => grab(new RegExp(`\\n  ${name}\\([^\\n]*\\{\\n[\\s\\S]*?\\n  \\}\\n`));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "custom_components/virtual_pet/frontend/sitter/sitters.json"), "utf8"));

const world = { calm: false, hidden: false, said: [], props: [], animated: [] };
const sandbox = {
  calm: () => world.calm,
  document: { get hidden() { return world.hidden; } },
  serverNow: () => world.now,
  dayOrdinal: () => 20000,
  loadJson: () => new Promise(() => {}), // the art never loads here: the rules do not need it
  Image: class {},
  BASE: "/b", VERSION: "t",
  HOUSE_LINES: { bits: {} }, HOUSE_CATEGORY: {}, HOUSE_REQUEST: {}, SEASON_START_BITS: {}, FOUND_BITS: 1,
  findsShown: () => false, foundBit: () => null,
  out: null,
};
const names = ["_sitterArt", "_sitterSrc", "_sit", "_sitterOnScreen", "_sitterBusy", "_sitterSync", "_sitterPose", "_sitterRow",
  "_sitterFrames", "_sitterPaint", "_sitterReset", "_sitterArrive", "_sitterLeave", "_sitterCue", "_sitterPlay", "_sitterNext",
  "_sitterSlide", "_sitterTick", "_sitterCheer", "_awayNote", "_dayBits"];
vm.runInNewContext([
  grab(/\nconst HATCH_SITTER = \(\(\) => \{[\s\S]*?\n\}\)\(\);\n/),
  grab(/\nconst SITTER_LINES = \{[\s\S]*?\n\};\n/),
  grab(/\nconst SITTER_ROWS = [^\n]*\n/),
  grab(/\nconst SITTER_NOTE = Object\.freeze\(\{[\s\S]*?\n\}\);\n/),
  `const o = {${names.map(method).join(",\n")}};`,
  "this.out = { o, SITTER_LINES, HATCH_SITTER };",
].join("\n"), sandbox);
const { o, SITTER_LINES, HATCH_SITTER } = sandbox.out;
const base = manifest.sitters[manifest.base];

const el = () => {
  const cls = new Set();
  return { hidden: true, style: {}, offsetWidth: 0, querySelector: () => ({ getAttribute: () => null, setAttribute() {} }), classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle(c, on) { on ? cls.add(c) : cls.delete(c); } }, cls };
};
// A card with one slide on show, the art "loaded" (the base row), a fixed clock.
function make(over = {}) {
  const s = { sitterEl: el(), pet: el(), species: { props: { feed: "bowl_food", play: "play", clean: "bird/sparkle_clean", medicine: "bird/medicine" } },
    subscribed: true, asleep: false, egg: false, scene: null, ids: { device: "dev" }, ...over };
  const card = Object.assign(Object.create(o), {
    _visible: true, _index: 0, _slides: [s], _sitArt: { state: "ready", pick: { id: "base", row: base } },
    _state: () => ({ state: "" }), _owned: () => false,
    _animate: (_s, _el, cls) => world.animated.push(cls),
    _speak: (_s, text) => world.said.push(text),
    _propShow: (_s, sprite) => world.props.push(sprite),
  });
  return { card, s };
}
const view = (last = null) => ({ mood: "content", asleep: false, last });
const reset = () => Object.assign(world, { calm: false, hidden: false, said: [], props: [], animated: [], now: Date.now() });
const sync = (c, s, sitter, scene = "day") => { s.sitter = sitter; c._sitterSync(s, sitter, scene); };

test("F8: it walks in only when this page saw it gone, with the card looking", () => {
  reset();
  const { card, s } = make();
  sync(card, s, null);
  assert.strictEqual(s.sit.in, false);
  sync(card, s, view());
  assert.strictEqual(s.sit.step.pose, "walk");
  assert.ok(s.sitterEl.style.translate === "0 0" && !s.sitterEl.hidden);
  assert.deepStrictEqual([...world.said], [], "Pip speaks at the wave, not the walk");
  card._sitterNext(s, Date.now()); // the walk ends: the wave, and Pip's line
  assert.strictEqual(s.sit.step.pose, "wave");
  assert.strictEqual(world.said.length, 1);
  assert.ok(SITTER_LINES.arrive.includes(world.said[0]));
});

test("F8: a reload, a card built during the visit, a hidden tab, or reduced motion just stands", () => {
  reset();
  let { card, s } = make();
  sync(card, s, view()); // the first draw already has the sitter
  assert.strictEqual(s.sit.step, null);
  assert.ok(!s.sitterEl.hidden);
  reset(); world.hidden = true;
  ({ card, s } = make());
  sync(card, s, null);
  sync(card, s, view()); // it arrived while the tab was hidden
  assert.strictEqual(s.sit.step, null);
  sync(card, s, view()); // and the tab coming back does not replay it
  assert.strictEqual(s.sit.step, null);
  reset(); world.calm = true;
  ({ card, s } = make());
  sync(card, s, null);
  sync(card, s, view());
  assert.strictEqual(s.sit.step, null);
  assert.ok(!s.sitterEl.hidden);
  sync(card, s, null); // and leaves at once
  assert.ok(s.sitterEl.hidden);
});

test("F8: the arrival bubble is not said to a sleeper", () => {
  reset();
  const { card, s } = make({ asleep: true });
  sync(card, s, null);
  sync(card, s, view());
  card._sitterNext(s, Date.now());
  assert.deepStrictEqual([...world.said], []);
});

test("F6: at night it is in the chair already and fades out; no walk, no wave", () => {
  reset();
  const { card, s } = make();
  sync(card, s, null, "night");
  sync(card, s, view(), "night");
  assert.strictEqual(s.sit.step, null);
  assert.ok(!s.sitterEl.hidden);
  assert.strictEqual(card._sitterPose(s, Date.now()), "doze");
  sync(card, s, null, "night");
  assert.strictEqual(s.sit.step.fadeOut, true);
  assert.ok(s.sitterEl.classList.contains("fade-out"));
  card._sitterNext(s, Date.now());
  assert.ok(s.sitterEl.hidden && !s.sit.leaving);
});

test("F6: night to day is a 200 ms cross-fade, not a walk (dim counts as night)", () => {
  reset();
  const { card, s } = make();
  sync(card, s, view(), "dim");
  assert.strictEqual(card._sitterPose(s, Date.now()), "doze");
  sync(card, s, view(), "day");
  assert.deepStrictEqual(world.animated, ["fade"]);
  assert.strictEqual(card._sitterPose(s, Date.now()), "stand");
});

test("leaving by day: a wave, then the walk mirrored; the greeting waits at most 2.5 s", () => {
  reset();
  const { card, s } = make();
  sync(card, s, view());
  const t0 = Date.now();
  sync(card, s, null);
  assert.strictEqual(s.sit.step.pose, "wave");
  assert.deepStrictEqual(world.said.slice(-1), [...SITTER_LINES.leave]);
  assert.ok(card._sitterBusy(s));
  card._sitterNext(s, t0 + 1400);
  assert.strictEqual(s.sit.step.pose, "walk");
  assert.strictEqual(s.sitterEl.style.scale, "-1 1");
  assert.strictEqual(s.sitterEl.style.translate, "-150% 0");
  assert.ok(!s.sitterEl.hidden);
  card._sitterNext(s, t0 + 2800); // the walk is over: gone, its motion put back
  assert.ok(s.sitterEl.hidden);
  assert.strictEqual(s.sitterEl.style.scale, "");
  assert.strictEqual(s.sit.leaving, false);
  assert.ok(!card._sitterBusy(s));
  const late = make().card;
  const { s: s2 } = make();
  s2.sit = { leaving: true, leaveAt: Date.now() - 2600 };
  assert.ok(!late._sitterBusy(s2), "after 2.5 s the greeting goes");
});

test("F7: the first snapshot and a reload never cue; a later round does, once", () => {
  reset();
  const { card, s } = make();
  sync(card, s, view({ at: 100, did: ["feed"] })); // the first snapshot, a round already in it
  assert.strictEqual(s.sit.step, null);
  sync(card, s, view({ at: 100, did: ["feed"] }));
  assert.strictEqual(s.sit.step, null);
  sync(card, s, view({ at: 200, did: ["feed", "play"] }));
  assert.strictEqual(s.sit.step.pose, "feed");
  assert.deepStrictEqual([...world.props], ["bowl_food"], "the existing care prop does the work beside the hands");
  assert.deepStrictEqual(world.said, [...SITTER_LINES.feed]);
  sync(card, s, view({ at: 200, did: ["feed", "play"] }));
  assert.strictEqual(s.sit.steps.length, 1, "the same round is not queued again");
  card._sitterNext(s, Date.now());
  assert.strictEqual(s.sit.step.pose, "play");
  assert.deepStrictEqual(world.said.slice(-1), [...SITTER_LINES.play]);
});

test("F7: with no snapshot yet (a pet seen only by sensors) nothing cues", () => {
  reset();
  const { card, s } = make({ subscribed: false });
  sync(card, s, view({ at: 100, did: ["feed"] }));
  sync(card, s, view({ at: 200, did: ["play"] }));
  assert.strictEqual(s.sit.step, null);
});

test("F7: a round that comes during a cue waits, one deep, the newest wins", () => {
  reset();
  const { card, s } = make();
  sync(card, s, null); // the first snapshot: no visit, so a round after the arrival counts
  sync(card, s, view()); // arrival beat in progress
  sync(card, s, view({ at: 10, did: ["feed"] }));
  sync(card, s, view({ at: 20, did: ["play"] }));
  sync(card, s, view({ at: 30, did: ["medicine"] }));
  assert.deepStrictEqual(Object.assign({}, s.sit.queue).poses ? [...s.sit.queue.poses] : null, ["medicine"]);
});

test("F7: a tidy alone is a half-length clean with no bubble and no prop", () => {
  reset();
  const { card, s } = make();
  sync(card, s, view({ at: 1, did: ["feed"] }));
  sync(card, s, view({ at: 2, did: ["clean"] }));
  assert.strictEqual(s.sit.step.pose, "clean");
  assert.strictEqual(s.sit.step.ms, HATCH_SITTER.MS.tidy);
  assert.deepStrictEqual([...world.said], []);
  assert.deepStrictEqual([...world.props], []);
});

test("F7/F12: no cue for an egg, at night, in a scene, or with the card off screen; a sleeping Pip hears no bubble", () => {
  for (const [over, scene, off] of [[{ egg: true }, "day"], [{}, "night"], [{ scene: {} }, "day"], [{}, "day", true]]) {
    reset();
    const { card, s } = make(over);
    if (off) card._visible = false;
    sync(card, s, view({ at: 1, did: ["feed"] }), scene);
    sync(card, s, view({ at: 2, did: ["feed"] }), scene);
    assert.strictEqual(s.sit.step, null, JSON.stringify([over, scene, off]));
  }
  reset();
  const { card, s } = make({ asleep: true });
  sync(card, s, view({ at: 1, did: ["feed"] }));
  sync(card, s, view({ at: 2, did: ["feed"] }));
  assert.strictEqual(s.sit.step.pose, "feed");
  assert.deepStrictEqual([...world.said], []);
});

test("a cheer when a game is won with the sitter in, by day, and not otherwise", () => {
  reset();
  const { card, s } = make();
  sync(card, s, view());
  card._sitterCheer(s);
  assert.strictEqual(s.sit.step.pose, "cheer");
  reset();
  const b = make();
  sync(b.card, b.s, null);
  b.card._sitterCheer(b.s);
  assert.strictEqual(b.s.sit.step, null, "no sitter, no cheer");
});

test("an idle: at most one every 2 minutes over 10 minutes, none in a beat, a scene or the night", () => {
  reset();
  const { card, s } = make();
  sync(card, s, view());
  const t0 = Date.now();
  const starts = [];
  let was = null;
  for (let t = t0; t < t0 + 10 * 60000; t += 700) {
    card._sitterTick(s, t);
    const step = s.sit.step;
    if (step && step !== was && step.kind === "idle") starts.push(t);
    was = step;
  }
  assert.ok(starts.length >= 2 && starts.length <= 5, `${starts.length} idles in 10 min`);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 120000, "an idle every 2-4 min");
  // a scene: it stands
  s.scene = {};
  s.sit.step = { pose: "tea", kind: "idle", ms: 4200 };
  s.sit.until = Infinity;
  card._sitterTick(s, t0 + 700);
  assert.strictEqual(s.sit.step, null);
  s.scene = null;
  // never in a beat
  sync(card, s, view({ at: 5, did: ["feed"] }));
  s.sit.nextIdle = 1;
  const playing = s.sit.step;
  card._sitterTick(s, t0 + 1400);
  assert.strictEqual(s.sit.step, playing);
  // reduced motion: none
  world.calm = true;
  s.sit.step = null; s.sit.steps = [];
  s.sit.nextIdle = 1;
  card._sitterTick(s, t0 + 2100);
  assert.strictEqual(s.sit.step, null);
});

test("a pose the sitter lacks stands and the prop works; its own frames are used when it has them (F3)", () => {
  const { card } = make();
  const look = { poses: { stand: ["stand_1", "stand_2"], wave: ["wave_1"] } };
  assert.deepStrictEqual([...card._sitterFrames(look, "feed")], ["stand_1", "stand_2"]);
  assert.deepStrictEqual([...card._sitterFrames(base, "feed")], ["feed_1", "feed_2"]);
});

// ---- F9: the away note -------------------------------------------------------------------------
const NOW = Date.parse("2026-11-04T12:00:00Z");
const note = (rows, moments = []) => {
  const { card } = make();
  card._state = () => ({ attributes: { log: rows.map(([action, mins]) => ({ action, at: new Date(NOW - mins * 60000).toISOString(), result: "ok" })),
    moments: moments.map(([type, mins]) => ({ type, at: new Date(NOW - mins * 60000).toISOString() })) } });
  return card._awayNote({}, NOW - 600 * 60000);
};

test("F9: the newest two bits all the sitter's give exactly one approved sentence", () => {
  assert.strictEqual(note([["sitter_play", 60]]), "while you were out, the sitter and I played!");
  assert.strictEqual(note([["sitter_feed", 60]]), "while you were out, the sitter fed me!");
  assert.strictEqual(note([["sitter_play", 60], ["sitter_feed", 120]]), "while you were out, the sitter and I played!"); // a play wins
  assert.strictEqual(note([["sitter_feed", 60], ["sitter_play", 120]]), "while you were out, the sitter and I played!");
  assert.strictEqual(note([["sitter_feed", 60], ["sitter_feed", 120]]), "while you were out, the sitter fed me!");
});

test("F9: a clean or a medicine round adds no bit", () => {
  assert.strictEqual(note([["sitter_clean", 60], ["sitter_medicine", 90]]), null);
  assert.strictEqual(note([["sitter_clean", 60], ["sitter_feed", 90]]), "while you were out, the sitter fed me!");
});

test("F9: mixed with a person's or a moment's bits the template runs on the others only", () => {
  assert.strictEqual(note([["sitter_feed", 60], ["snack", 90]]), "while you were out, I had a snack!");
  assert.strictEqual(note([["sitter_play", 60]], [["watching", 30]]), "while you were out, I watched TV!");
  assert.strictEqual(note([["play", 60]]), "while you were out, I played!");
});

test("F9: privacy on shows the plain rows: the existing wording stays", () => {
  assert.strictEqual(note([["feed", 60]]), "while you were out, I had a meal!");
});
