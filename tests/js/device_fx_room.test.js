// Device-alive slice 4D (docs/plan-2026-11-03-device-alive-interactions.md sections 6.5, 6.6, 6.6a, 6.6c, 6.7 and the
// 4D acceptance row): the room's keys (4C) on the rim and the glass, and the rim cues a moment drives (the doorbell,
// the appliance's tick, the vacuum's rotor, the heating's wash). device-fx.js is one table keyed like the server's
// DEVICE_SIGNAL_MAP; this file checks it against tests/js/device_signal_map.json, runs each key and each moment
// through the real director (and the card's real _moment), and holds the CSS to the motion rule.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = require("./card-source");
const ROOT = path.join(__dirname, "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const director = read("src/card/interaction-director.js");
const part = read("src/card/device-fx.js");
const MAP = JSON.parse(read("tests/js/device_signal_map.json"));
const plain = (x) => JSON.parse(JSON.stringify(x));
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");

const ctx = { Date, Object, Array, Number, Math, JSON };
vm.runInNewContext(`${director}\n${part}\nthis.D = HATCH_DIRECTOR; this.F = HATCH_DEVICE_FX;`, ctx);
const { D, F } = ctx;
const WEATHER = ["rain", "snow", "fog", "storm", "wind"];
const ROOM = Object.keys(MAP.keys).filter((k) => !WEATHER.includes(k)); // lights, heating, cooling, fireplace, tv, music
const EDGE = ROOM.filter((k) => MAP.keys[k].kinds.length > 0); // lights, fireplace, tv, music
const AMBIENT_ONLY = ROOM.filter((k) => MAP.keys[k].kinds.length === 0); // heating, cooling

const T0 = Date.parse("2026-11-03T12:00:00Z");
const entry = (kind, over = {}) => ({
  id: "n1-1", kind, scope: "house", occurred_at: new Date(T0).toISOString(), expires_at: new Date(T0 + 90000).toISOString(), ...over,
});
function elOf() {
  const set = new Set();
  return {
    offsetWidth: 0,
    classList: {
      add: (...c) => c.forEach((x) => set.add(x)),
      remove: (...c) => c.forEach((x) => set.delete(x)),
      toggle: (c, on) => (on ? set.add(c) : set.delete(c)) && on,
    },
    has: (c) => set.has(c),
    names: () => [...set].sort(),
  };
}
function world(over = {}) {
  const w = { t: T0 + 20000, timers: [], render: true, trust: true, ...over };
  w.schedule = (ms, fn) => {
    const timer = { at: w.t + ms, fn, live: true };
    w.timers.push(timer);
    return () => { timer.live = false; };
  };
  w.advance = (to) => {
    for (const timer of w.timers.filter((x) => x.live && x.at <= to).sort((a, b) => a.at - b.at)) {
      timer.live = false;
      timer.fn();
    }
    w.t = to;
  };
  w.dir = D.create({ now: () => w.t, deviceNow: () => w.t, trusted: () => w.trust, canRender: () => w.render, schedule: w.schedule, recipes: F.RECIPES });
  w.env = { lcdOn: true, calm: false, clockKnown: true, now: Date.UTC(2026, 10, 3) }; // no full or new moon
  w.slide = (o = {}) => ({ glass: elOf(), rim: elOf(), ...o });
  return w;
}
const house = (current) => ({ device_fx: { version: 1, current } });
const layerOf = (s, k) => (F.ROWS[k].layer === "rim" ? s.rim : s.glass);
// The value a key is "on" at, and its "off": a bool, or the enum's members.
const ON = (k) => (MAP.keys[k].type === "bool" ? true : "on");
const OFF = (k) => (MAP.keys[k].type === "bool" ? false : "off");

// ---- the parity test (6.2, 6.5): the JS table against the map's export, 4C's rows ----

test("the table has a row for every key of the export, in the map's order, and the layer holds what the plan wants", () => {
  assert.deepStrictEqual(Object.keys(F.ROWS), Object.keys(MAP.keys));
  assert.deepStrictEqual(Object.keys(F.ROOM), ROOM);
  // lights and the fireplace are the rim (the dimmed or lit rim, the warm rim); music and the tv the glass (bars, the reflection);
  // heating and cooling the rim's tint (the warm and the cool)
  assert.deepStrictEqual(Object.fromEntries(ROOM.map((k) => [k, F.ROWS[k].layer])),
    { lights: "rim", heating: "rim", cooling: "rim", fireplace: "rim", tv: "glass", music: "glass" });
});

test("every kind of the room's rows has a KINDS and a RECIPES entry; an ambient-only row has neither", () => {
  for (const k of EDGE) {
    const [on, off] = MAP.keys[k].kinds; // the first is the "on" edge (the server's kinds[0])
    assert.deepStrictEqual(plain(F.KINDS[on]), { key: k, direction: "start", value: ON(k) }, on);
    assert.deepStrictEqual(plain(F.KINDS[off]), { key: k, direction: "end", value: OFF(k) }, off);
    assert.ok(F.RECIPES[k], `a recipe for ${k}`);
    assert.ok(Object.isFrozen(F.RECIPES[k]), k);
    assert.strictEqual(F.RECIPES[k].collapseKey, k);
    assert.strictEqual(F.RECIPES[k].echoRank, MAP.keys[k].echo_rank, `${k}'s onset rank is the map's`);
    assert.strictEqual(F.RECIPES[k].priority, D.PRIORITY.house);
  }
  for (const k of AMBIENT_ONLY) {
    assert.deepStrictEqual(MAP.keys[k].kinds, []);
    assert.ok(!(k in F.RECIPES), `${k} is a tint: no recipe`);
    assert.ok(!Object.values(F.KINDS).some((v) => v.key === k), `${k} has no kind`);
    assert.strictEqual(F.ROWS[k].start, null);
    for (const kind of [`${k}_started`, `${k}_stopped`, `${k}_on`, `${k}_off`]) {
      const r = F.live(world().dir, world().slide(), entry(kind), world().env);
      assert.strictEqual(r.accepted, false, `${kind} plays nothing`);
    }
  }
  // the wire's whole kind list, the weather first, is exactly what the card knows
  const wire = Object.values(MAP.keys).flatMap((row) => row.kinds);
  assert.deepStrictEqual(Object.keys(F.KINDS), wire);
});

test("the per-kind cooldowns are the plan's: music and the tv 5 min, the fireplace 60 s, the lights as the weather; the ranks are the map's", () => {
  assert.strictEqual(F.ROWS.music.cooldownMs, 300000);
  assert.strictEqual(F.ROWS.tv.cooldownMs, 300000);
  assert.strictEqual(F.ROWS.fireplace.cooldownMs, 60000);
  assert.ok(F.ROWS.lights.cooldownMs > 0 && F.ROWS.lights.cooldownMs < MAP.keys.lights.block_s * 1000, "the lights' is under their block, so a held reverse is not eaten");
  for (const k of EDGE) {
    assert.strictEqual(F.ROWS[k].echoRank, MAP.keys[k].echo_rank, k);
    assert.strictEqual(F.RECIPES[k].cooldownMs, F.ROWS[k].cooldownMs, k);
  }
  assert.deepStrictEqual(plain(Object.fromEntries(EDGE.map((k) => [k, F.ROWS[k].echoRank]))), { lights: 3, fireplace: 3, tv: 4, music: 4 });
});

test("a per-kind cooldownMs holds: a second start of the same kind inside it is ambience only, a different kind plays", () => {
  for (const k of EDGE) {
    const [on] = MAP.keys[k].kinds;
    const w = world(), s = w.slide();
    F.sync(w.dir, s, house({ [k]: ON(k) }), w.env);
    assert.ok(F.live(w.dir, s, entry(on), w.env).accepted, k);
    w.dir.release(s, s.dirEffect);
    assert.strictEqual(F.live(w.dir, s, entry(on, { id: "n1-2" }), w.env).reason, "cooldown", k);
    w.advance(w.t + F.ROWS[k].cooldownMs - 1000);
    assert.strictEqual(F.live(w.dir, s, entry(on, { id: "n1-3" }), w.env).reason, "cooldown", `${k} still held just before`);
    w.advance(w.t + 2000);
    assert.ok(F.live(w.dir, s, entry(on, { id: "n1-4" }), w.env).accepted, `${k} plays after it`);
  }
  const w = world(), s = w.slide();
  F.sync(w.dir, s, house({ fireplace: true, tv: true }), w.env);
  assert.ok(F.live(w.dir, s, entry("fireplace_started"), w.env).accepted);
  w.dir.release(s, s.dirEffect);
  assert.ok(F.live(w.dir, s, entry("tv_started", { id: "n1-2" }), w.env).accepted, "the tv is not under the fireplace's cooldown");
});

// ---- ambientOf strictness, and paint (enum, ambient-only, layers) ----

test("ambientOf takes a bool for a bool row and only a member for the enum; an unknown member is nothing", () => {
  assert.deepStrictEqual(plain(F.ambientOf(house({ lights: "on", heating: true, music: false }))), { lights: "on", heating: true, music: false });
  for (const bad of ["dim", "ON", "", true, 1, null, ["on"], { on: 1 }, "__proto__", "constructor"]) {
    assert.deepStrictEqual(plain(F.ambientOf(house({ lights: bad }))), {}, `lights ${JSON.stringify(bad)}`);
  }
  for (const k of ["heating", "cooling", "fireplace", "tv", "music"]) {
    for (const bad of ["on", "yes", 1, 0, null]) assert.deepStrictEqual(plain(F.ambientOf(house({ [k]: bad }))), {}, `${k} ${JSON.stringify(bad)}`);
  }
  assert.deepStrictEqual(plain(F.ambientOf(house({ lights: "on", kettle: true }))), { lights: "on" }, "an unknown key is nothing");
  assert.deepStrictEqual(plain(F.ambientOf({ device_fx: { version: 2, current: { lights: "on" } } })), {});
});

test("every room key paints its own still class on its own layer; the enum paints by member; false and off are not painted over", () => {
  const seen = new Set();
  for (const k of ROOM) {
    const w = world(), s = w.slide();
    F.sync(w.dir, s, house({ [k]: ON(k) }), w.env);
    const row = F.ROWS[k];
    const want = row.ambientBy ? row.ambientBy.on : row.ambient;
    assert.deepStrictEqual(layerOf(s, k).names(), [want], `${k} on`);
    assert.deepStrictEqual((F.ROWS[k].layer === "rim" ? s.glass : s.rim).names(), [], `${k} paints nothing on the other layer`);
    assert.ok(!seen.has(want), "one class per look");
    seen.add(want);
    F.sync(w.dir, s, house({ [k]: OFF(k) }), w.env);
    assert.deepStrictEqual(layerOf(s, k).names(), k === "lights" ? [row.ambientBy.off] : [], `${k} off`);
  }
  // the lights: lit and dimmed are the two members, never both; no member (not known yet) is neither
  const w = world(), s = w.slide();
  F.sync(w.dir, s, house({ lights: "off" }), w.env);
  assert.deepStrictEqual(s.rim.names(), ["dir-rim-dim"]);
  F.sync(w.dir, s, house({}), w.env);
  assert.deepStrictEqual(s.rim.names(), [], "a house that does not say paints nothing");
  // the fireplace and the heating at once: the rim carries both looks (the CSS lays one over the other)
  F.sync(w.dir, s, house({ lights: "on", fireplace: true, heating: true }), w.env);
  assert.deepStrictEqual(s.rim.names(), ["dir-rim-fire", "dir-rim-lit", "dir-rim-warm"]);
});

test("a rim cue's start never wipes the rim's glow, and a glow is never in the cue set", () => {
  const w = world(), s = w.slide();
  F.sync(w.dir, s, house({ fireplace: true, heating: true }), w.env);
  assert.ok(F.live(w.dir, s, entry("fireplace_started"), w.env).accepted);
  assert.deepStrictEqual(s.rim.names(), ["dir-ember-in", "dir-rim-fire", "dir-rim-warm"].sort());
  w.dir.release(s, s.dirEffect);
  assert.deepStrictEqual(s.rim.names(), ["dir-rim-fire", "dir-rim-warm"], "the glow stays when the cue is gone");
  for (const c of F.CLASSES_BY_LAYER.rimAmbient) assert.ok(!F.CLASSES_BY_LAYER.rim.includes(c), c);
  for (const c of F.CLASSES_BY_LAYER.rimAmbient) assert.ok(!F.RIM_CLASSES.includes(c), c);
});

// ---- per key: an onset, an echo with the ambient flipped, reduced motion, the switch ----

for (const k of EDGE) {
  const [onKind, offKind] = MAP.keys[k].kinds;
  const row = F.ROWS[k];
  const ambOn = row.ambientBy ? row.ambientBy.on : row.ambient;
  const ambOff = row.ambientBy ? row.ambientBy.off : null;
  const echo = row.layer === "rim" ? "dir-rim-echo" : "dir-echo";
  test(`${k}: a start is one onset on the ${row.layer} with the ambience kept; the end plays the other class`, () => {
    const w = world(), s = w.slide();
    F.sync(w.dir, s, house({ [k]: ON(k) }), w.env);
    const r = F.live(w.dir, s, entry(onKind), w.env);
    assert.ok(r.accepted, r.reason);
    assert.deepStrictEqual(layerOf(s, k).names(), [row.start, ambOn].sort());
    w.dir.release(s, s.dirEffect);
    assert.deepStrictEqual(layerOf(s, k).names(), [ambOn]);
    w.advance(w.t + 400000);
    F.sync(w.dir, s, house({ [k]: OFF(k) }), w.env);
    assert.ok(F.live(w.dir, s, entry(offKind, { id: "n1-2" }), w.env).accepted);
    assert.deepStrictEqual(layerOf(s, k).names(), [row.end, ambOff].filter(Boolean).sort());
  });

  test(`${k}: a first view inside the window is one shortened echo; with the ambient flipped it does not play`, () => {
    const w = world(), s = w.slide();
    F.sync(w.dir, s, house({ [k]: ON(k) }), w.env);
    const r = F.enter(w.dir, s, [entry(onKind)], w.env);
    assert.ok(r.accepted, r.reason);
    assert.deepStrictEqual(layerOf(s, k).names(), [row.start, echo, ambOn].sort());
    const v = world(), t = v.slide();
    F.sync(v.dir, t, house({ [k]: OFF(k) }), v.env); // it changed since
    assert.strictEqual(F.enter(v.dir, t, [entry(onKind)], v.env).accepted, false);
    assert.deepStrictEqual(layerOf(t, k).names(), ambOff ? [ambOff] : []);
  });

  test(`${k}: a start and its end meet while it runs and neither plays`, () => {
    const w = world(), s = w.slide();
    F.sync(w.dir, s, house({ [k]: ON(k) }), w.env);
    assert.ok(F.live(w.dir, s, entry(onKind), w.env).accepted);
    assert.strictEqual(F.live(w.dir, s, entry(offKind, { id: "n1-2" }), w.env).reason, "collapsed");
  });

  test(`${k}: reduced motion paints the still look and offers no onset or echo; the switch off draws nothing`, () => {
    const w = world(), s = w.slide();
    w.env.calm = true;
    F.sync(w.dir, s, house({ [k]: ON(k) }), w.env);
    assert.deepStrictEqual(layerOf(s, k).names(), [ambOn], "the tint is kept");
    assert.strictEqual(F.live(w.dir, s, entry(onKind), w.env).reason, "calm");
    assert.strictEqual(F.enter(w.dir, s, [entry(onKind)], w.env).reason, "calm");
    assert.deepStrictEqual(layerOf(s, k).names(), [ambOn]);
    w.env.lcdOn = false;
    F.sync(w.dir, s, house({ [k]: ON(k) }), w.env);
    assert.deepStrictEqual([...s.glass.names(), ...s.rim.names()], [], "nothing drawn");
  });
}

for (const k of AMBIENT_ONLY) {
  test(`${k}: a tint and nothing else: painted from current, kept under reduced motion, none with the switch off, no onset`, () => {
    const w = world(), s = w.slide();
    w.env.calm = true;
    F.sync(w.dir, s, house({ [k]: true }), w.env);
    assert.deepStrictEqual(s.rim.names(), [F.ROWS[k].ambient]);
    w.env.calm = false;
    F.sync(w.dir, s, house({ [k]: false }), w.env);
    assert.deepStrictEqual(s.rim.names(), []);
    w.env.lcdOn = false;
    F.sync(w.dir, s, house({ [k]: true }), w.env);
    assert.deepStrictEqual(s.rim.names(), []);
    assert.strictEqual(F.enter(world().dir, world().slide(), [entry(`${k}_started`)], world().env).accepted, false);
  });
}

test("no recipe in device-fx.js names an fx- class, and the part names no wire kind the export lacks", () => {
  assert.doesNotMatch(code(part), /\bfx-/);
  const named = new Set(code(part).match(/\b[a-z]+_(?:started|stopped)\b/g) || []);
  for (const n of named) assert.ok(Object.keys(F.KINDS).includes(n), `${n} is not in the export`);
});

// ---- the moment cues: offerMoment, by moment ----

const MOMENTS = [
  ["doorbell_live", undefined, "dir-chime"],
  ["appliance_done", "washer", "dir-tick-l"],
  ["appliance_done", "dryer", "dir-tick-m"],
  ["appliance_done", "dishwasher", "dir-tick-r"],
  ["appliance_done", "machine", "dir-tick-m"],
  ["house_answered", "heating", "dir-wash-warm"],
  ["house_answered", "cooling", "dir-wash-cool"],
  ["robot_out", undefined, "dir-rotor-out"],
  ["robot_home", undefined, "dir-rotor-home"],
];

test("each house rim cue calls offer with origin house, presentation onset, house priority, and no clock gate", () => {
  for (const [moment, variant, cls] of MOMENTS) {
    const w = world({ trust: false }); // an untrusted server clock does not matter to a moment
    w.env.clockKnown = false;
    const calls = [];
    const spy = { busyOwners: (x) => w.dir.busyOwners(x), offer: (slide, cue) => { calls.push(cue); return w.dir.offer(slide, cue); } };
    const s = w.slide();
    const r = F.offerMoment(spy, s, moment, "moment-1", w.env, variant);
    assert.ok(r.accepted, `${moment} ${variant}: ${r.reason}`);
    assert.strictEqual(calls.length, 1, "one offer");
    assert.strictEqual(calls[0].origin, "house");
    assert.strictEqual(calls[0].presentation, "onset");
    assert.strictEqual(calls[0].occurredAt, undefined, "no clock dependence");
    assert.deepStrictEqual(s.rim.names(), [cls]);
    assert.deepStrictEqual(s.glass.names(), [], "never the glass");
    assert.strictEqual(F.RECIPES[calls[0].kind].priority, D.PRIORITY.house);
    assert.ok(F.CLASSES_BY_LAYER.rim.includes(cls), `${cls} is in the rim's cue set`);
  }
});

test("the cue table: the appliance has exactly four keys, an unknown kind (oven) is the middle tick; the wash has two", () => {
  assert.deepStrictEqual(Object.keys(F.HOUSE_RIM.appliance_done.by).sort(), ["dishwasher", "dryer", "machine", "washer"]);
  assert.deepStrictEqual(Object.keys(F.HOUSE_RIM.house_answered.by).sort(), ["cooling", "heating"]);
  assert.deepStrictEqual(Object.keys(F.HOUSE_RIM).sort(), ["appliance_done", "doorbell_live", "house_answered", "robot_home", "robot_out"]);
  const mid = F.HOUSE_RIM.appliance_done.by;
  assert.strictEqual(mid.machine, mid.dryer, "machine and dryer are the one middle tick");
  for (const odd of ["oven", "coffee", "", undefined, "__proto__", "constructor"]) {
    const w = world(), s = w.slide();
    assert.ok(F.offerMoment(w.dir, s, "appliance_done", `m-${odd}`, w.env, odd).accepted, String(odd));
    assert.deepStrictEqual(s.rim.names(), ["dir-tick-m"], `${odd} is the middle tick`);
  }
  // a washer, a dryer and a dishwasher: three lamps, three classes; the cue never makes a fourth recipe
  const ticks = Object.values(mid).map((c) => c.cls);
  assert.deepStrictEqual([...new Set(ticks)].sort(), ["dir-tick-l", "dir-tick-m", "dir-tick-r"]);
  // an unknown wash request has no cue
  const w = world();
  assert.strictEqual(F.offerMoment(w.dir, w.slide(), "house_answered", "m-1", w.env, "fireplace").reason, "no-cue");
  assert.strictEqual(F.offerMoment(w.dir, w.slide(), "__proto__", "m-2", w.env).reason, "no-cue");
  assert.strictEqual(F.offerMoment(w.dir, w.slide(), "house_moment", "m-3", w.env).reason, "no-cue");
});

test("reduced motion offers no moment cue; a care scene running wins; the switch off draws nothing", () => {
  for (const [moment, variant] of MOMENTS) {
    const w = world(), s = w.slide();
    w.env.calm = true;
    assert.strictEqual(F.offerMoment(w.dir, s, moment, "m-1", w.env, variant).reason, "calm", moment);
    assert.deepStrictEqual(s.rim.names(), []);
    const b = world(), t = b.slide({ scene: { kind: "feed" } });
    const busy = { busyOwners: () => ["scene"], offer: () => assert.fail("offered under a scene") };
    assert.strictEqual(F.offerMoment(busy, t, moment, "m-2", b.env, variant).reason, "busy", moment);
    const o = world({ render: false }), u = o.slide();
    assert.strictEqual(F.offerMoment(o.dir, u, moment, "m-3", o.env, variant).reason, "cannot-render", moment); // the director's canRender: the switch, on show
    assert.deepStrictEqual(u.rim.names(), []);
  }
});

test("a moment is not an echo: one the director held while the slide was off show never plays at its first view", () => {
  const w = world({ render: false }), s = w.slide();
  F.offerMoment(w.dir, s, "doorbell_live", "m-1", w.env);
  w.render = true;
  w.advance(w.t + 10000); // the slide comes on show later: the held candidate is older than a moment's own life
  F.enter(w.dir, s, [], w.env);
  assert.deepStrictEqual(s.rim.names(), []);
});

test("the same moment's cue twice inside its cooldown plays once; two different moments are not under each other's", () => {
  const w = world(), s = w.slide();
  assert.ok(F.offerMoment(w.dir, s, "robot_out", "m-1", w.env).accepted);
  w.dir.release(s, s.dirEffect);
  assert.strictEqual(F.offerMoment(w.dir, s, "robot_out", "m-2", w.env).reason, "cooldown");
  assert.ok(F.offerMoment(w.dir, s, "doorbell_live", "m-3", w.env).accepted);
  w.dir.release(s, s.dirEffect);
  assert.strictEqual(F.offerMoment(w.dir, s, "doorbell_live", "m-4", w.env).reason, "cooldown");
  for (const cue of [F.HOUSE_RIM.doorbell_live, F.HOUSE_RIM.robot_out, F.HOUSE_RIM.robot_home, ...Object.values(F.HOUSE_RIM.appliance_done.by), ...Object.values(F.HOUSE_RIM.house_answered.by)]) {
    assert.ok(F.RECIPES[cue.kind].cooldownMs > 0, `${cue.kind} has a cooldown`);
    assert.strictEqual(F.RECIPES[cue.kind].cooldownMs, cue.cooldownMs);
  }
});

test("robot_out turns the rotor and robot_home slows it: no echo, no server key", () => {
  assert.ok(!("robot" in MAP.keys) && !Object.keys(MAP.keys).some((k) => /robot|vacuum|doorbell|appliance/.test(k)), "the moments are not wire keys");
  assert.ok(!Object.keys(F.KINDS).some((k) => /robot|vacuum|doorbell|appliance|house_answered/.test(k)));
  const out = F.HOUSE_RIM.robot_out, home = F.HOUSE_RIM.robot_home;
  assert.ok(home.ms > out.ms, "slows: the home cue is the longer one");
  for (const c of [out, home]) assert.strictEqual(F.RECIPES[c.kind].echoMs, undefined, "no echo form");
  // never in an echo: the ring cannot carry it, and entering a view plays none
  const w = world(), s = w.slide();
  assert.strictEqual(F.enter(w.dir, s, [entry("robot_out_started"), entry("doorbell_live")], w.env).accepted, false);
  assert.deepStrictEqual(s.rim.names(), []);
});

// ---- the card: the call sites ----

const method = (name) => src.match(new RegExp(`\\n  ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n  \\}\\n`))[0];

// The real _moment, run with stub fx and a director spy: what each handler calls, in which callback, in which order.
function momentCard() {
  const log = { order: [], rim: [] };
  const mctx = {
    Date, calm: () => false, MOMENT_CLASS: {}, FLAVOUR: 1, KEPT: 3, pick: (l) => l[0],
    HOUSE_REQUEST: { blanket: "heating", fan: "cooling" }, HOUSE_LINES: new Proxy({}, { get: () => ["a line"] }),
    REACT_POSE: { startle: { move: "startle", ms: 400 } },
  };
  vm.runInNewContext(`const o = {${method("_moment")}, ${method("_owned")}}; this.moment = o._moment; this.owned = o._owned;`, mctx);
  const self = {
    _owned: mctx.owned, // the card's own "who owns the screen" (shell modes 3.7)
    // a line runs its fx at once (the real one waits for the bubble)
    _line: (s, cls, text, ms, opts) => { log.order.push("line"); if (opts.then) opts.then(); },
    _animate: () => {},
    _look: () => {},
    _houseFx: (s, fx) => log.order.push(`houseFx:${fx}`),
    _robotFx: () => log.order.push("robotFx"),
    _momentCue: (s, moment, variant) => { log.order.push(`rim:${moment}${variant ? `:${variant}` : ""}`); log.rim.push([moment, variant]); },
  };
  return { log, run: (s, m, capture) => mctx.moment.call(self, s, m, capture) };
}

test("one cue per event: each moment makes one rim call and one screen call, in the same callback, and the lamp is by the kind", () => {
  const cases = [
    [{ type: "doorbell_live" }, ["houseFx:fx-chime", "rim:doorbell_live"]],
    [{ type: "appliance_done", kind: "washer" }, ["houseFx:fx-suds", "rim:appliance_done:washer"]],
    [{ type: "appliance_done", kind: "dryer" }, ["houseFx:fx-tumble", "rim:appliance_done:dryer"]],
    [{ type: "appliance_done", kind: "dishwasher" }, ["houseFx:fx-suds", "rim:appliance_done:dishwasher"]],
    [{ type: "appliance_done", kind: "oven" }, ["houseFx:fx-suds", "rim:appliance_done:machine"]], // the handler reduces an unknown kind
    [{ type: "house_answered", request: "blanket" }, ["houseFx:fx-heat", "rim:house_answered:heating"]],
    [{ type: "house_answered", request: "fan" }, ["houseFx:fx-cool", "rim:house_answered:cooling"]],
    [{ type: "robot_out" }, ["robotFx", "rim:robot_out"]],
    [{ type: "robot_home" }, ["rim:robot_home"]],
  ];
  for (const [m, want] of cases) {
    const { log, run } = momentCard();
    run({ game: null }, m);
    assert.deepStrictEqual(log.order.filter((x) => x !== "line"), want, JSON.stringify(m));
    assert.strictEqual(log.rim.length, 1, `${m.type}: one rim call`);
    assert.strictEqual(log.order.filter((x) => x.startsWith("houseFx") || x === "robotFx").length, want.length - 1, `${m.type}: one screen call`);
  }
});

test("a game suppresses the rim cue with the screen's; a catch-up (capture) never cues", () => {
  const types = [{ type: "doorbell_live" }, { type: "appliance_done", kind: "washer" }, { type: "house_answered", request: "blanket" }, { type: "robot_out" }, { type: "robot_home" }];
  for (const m of types) {
    const g = momentCard();
    g.run({ game: { kind: "x" } }, m);
    assert.deepStrictEqual(g.log.order, [], `${m.type} under a game`);
    const c = momentCard();
    const said = [];
    c.run({ game: null }, m, said);
    assert.deepStrictEqual(c.log.rim, [], `${m.type} in a catch-up`);
    assert.deepStrictEqual(c.log.order, [], `${m.type} in a catch-up moves nothing`);
  }
});

test("source: for each of the four handlers the rim call and the fx- call sit in the same callback body", () => {
  const m = method("_moment");
  const block = (label) => {
    const a = m.indexOf(label);
    assert.ok(a > 0, label);
    return m.slice(a, m.indexOf("break;\n      }", a));
  };
  // The doorbell's two sit in now(); the other three in the speak callback. The rim call is the line after the fx call.
  const doorbell = block('case "doorbell_live"');
  assert.match(doorbell, /now\(\(\) => \{[^}]*this\._houseFx\(s, "fx-chime"\);\s*this\._momentCue\(s, "doorbell_live"\);[^}]*\}\);/);
  const appliance = block('case "appliance_done"');
  assert.match(appliance, /speak\(pick\(lines\), 4500, \(\) => \{[^}]*this\._houseFx\(s, kind === "dryer" \? "fx-tumble" : "fx-suds"\);\s*this\._momentCue\(s, "appliance_done", kind\);[^}]*\}\);/);
  const answered = block('case "house_answered"');
  assert.match(answered, /speak\(pick\(HOUSE_LINES\[kind\]\), 4500, \(\) => \{[^}]*this\._houseFx\(s, kind === "heating" \? "fx-heat" : "fx-cool"\);\s*this\._momentCue\(s, "house_answered", kind\);[^}]*\}\);/);
  const robot = block('case "robot_out"');
  assert.match(robot, /speak\(pick\(HOUSE_LINES\[m\.type\]\), 4500, \(\) => \{[^}]*this\._robotFx\(s\);\s*this\._momentCue\(s, m\.type\);[^}]*\}\);/);
  // nothing else in _moment calls it, and nothing calls it outside the handlers
  assert.strictEqual((m.match(/_momentCue\(/g) || []).length, 4);
  assert.strictEqual((src.match(/\._momentCue\(/g) || []).length, 4, "only the four handlers call it");
});

test("the _houseFx call sites are unchanged (FM10: the rim cue sits beside them, they do not move) and the idle _robotFx offers no rim cue", () => {
  const calls = (src.match(/this\._houseFx\([^)]*\)/g) || []).map((x) => x.replace(/\s+/g, " "));
  for (const want of ['this._houseFx(s, "fx-chime")', 'this._houseFx(s, kind === "dryer" ? "fx-tumble" : "fx-suds")', 'this._houseFx(s, kind === "heating" ? "fx-heat" : "fx-cool")', "this._houseFx(s, cat.fx)"]) {
    assert.ok(calls.includes(want), want);
  }
  // card-tick's idle move (a pet idle move while vroom) is not an event: no rim cue near it
  const tick = fs.readFileSync(path.join(ROOT, "src/card/card-tick.js"), "utf8");
  assert.ok(/this\._robotFx\(s\)/.test(tick));
  assert.doesNotMatch(tick, /_momentCue|offerMoment|_rimCue|HATCH_DEVICE_FX/);
  // the _robotFx method itself cues nothing
  assert.doesNotMatch(method("_robotFx"), /_momentCue|offerMoment|_rimCue/);
  assert.doesNotMatch(method("_houseFx"), /_momentCue|offerMoment|_rimCue/);
});

test("_momentCue hands the director the moment, a fresh id and the card's own facts; a slide off show gets none", () => {
  const w = world();
  const s = w.slide();
  const calls = [];
  const dir = { busyOwners: (x) => w.dir.busyOwners(x), offer: (slide, cue) => { calls.push(cue); return w.dir.offer(slide, cue); } };
  const Card = vm.runInNewContext(`(class {\n${method("_momentCue")}\n _dirEnv() { return ENV(); }\n _dirShown(s) { return SHOWN(s); }\n})`, {
    HATCH_DEVICE_FX: F, ENV: () => w.env, SHOWN: (x) => x === s,
  });
  const card = Object.assign(Object.create(Card.prototype), { _director: dir });
  card._momentCue(s, "house_answered", "cooling");
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(s.rim.names(), ["dir-wash-cool"]);
  w.dir.release(s, s.dirEffect);
  card._momentCue(w.slide(), "doorbell_live"); // another slide, not on show
  assert.strictEqual(calls.length, 1, "not offered");
  card._momentCue(s, "doorbell_live");
  assert.notStrictEqual(calls[0].id, calls[1].id, "a fresh id each time");
  card._director = null;
  card._momentCue(s, "robot_out"); // no director: nothing, no throw
  assert.strictEqual(calls.length, 2);
});

// ---- the CSS: the tints are still, the cues are the care cues' vocabulary, reduced motion keeps the glow ----

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = (t) => [...strip(t).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
const rimStart = src.indexOf("  /* The rim cues (device-alive 3C");
const rimCss = src.slice(rimStart, src.indexOf("  .compact .egg .hw.light", rimStart));
const glassCss = src.slice(src.indexOf("  @supports (width: round(1px, 1px)) {\n    .hw.glass {"), rimStart);

test("the rim's glow classes are still: no animation, no transform, only a transition on opacity", () => {
  for (const [sel, body] of rules(rimCss)) {
    if (!F.CLASSES_BY_LAYER.rimAmbient.some((c) => new RegExp(`\\.${c}(?![a-z-])`).test(sel))) continue;
    assert.doesNotMatch(body, /animation\s*:|transform\s*:|filter\s*:/, sel);
  }
  assert.match(strip(rimCss), /\.hw\.rim::before, \.hw\.rim::after \{[^}]*transition: opacity \.8s ease-out;/);
  // the room's glass looks (bars, the reflection) are still at rest: the resting classes carry no animation
  for (const [sel, body] of rules(glassCss)) {
    if (/\.hw\.glass\.dir-(bars|tv)\s+b/.test(sel)) assert.doesNotMatch(body, /animation\s*:/, sel);
  }
});

test("the glow steps aside for the backlight: the lights' rim is not drawn over .lit", () => {
  assert.match(strip(rimCss), /\.bezel:has\(\.screen\.lit\) \.hw\.rim\.dir-rim-lit::before, \.bezel:has\(\.screen\.lit\) \.hw\.rim\.dir-rim-dim::before \{ opacity: 0; \}/);
  // and only the lights' (the fire and the climate tints are added to it)
  assert.doesNotMatch(strip(rimCss), /\.screen\.lit\) \.hw\.rim\.dir-rim-(fire|warm|cool)/);
});

test("reduced motion: the rim's lamps are hidden and the glow stays; the glow is in no reduced-motion rule", () => {
  const m = strip(rimCss).match(/@media \(prefers-reduced-motion: reduce\) \{ \.hw\.rim b \{ display: none !important; \} \}/);
  assert.ok(m, "the lamps are the cues; none is offered under reduced motion");
  for (const c of F.CLASSES_BY_LAYER.rimAmbient) assert.ok(!m[0].includes(c), c);
  assert.doesNotMatch(strip(rimCss), /prefers-reduced-motion: reduce\) \{ \.hw\.rim \{/, "the layer itself is not hidden");
});

test("the room's cues are the care cues' vocabulary: dir-rim-life as the clock, the lease's length, opacity and left only", () => {
  const cues = [...F.HOUSE_RIM.appliance_done ? [F.HOUSE_RIM.doorbell_live, F.HOUSE_RIM.robot_out, F.HOUSE_RIM.robot_home] : [],
    ...Object.values(F.HOUSE_RIM.appliance_done.by), ...Object.values(F.HOUSE_RIM.house_answered.by)];
  for (const c of cues) {
    const own = rules(rimCss).filter(([sel, body]) => new RegExp(`(^|,\\s*)\\.hw\\.rim\\.${c.cls}(\\s*,|$)`).test(sel) && /animation:\s*dir-rim-life/.test(body));
    assert.ok(own.length >= 1, `${c.cls} has dir-rim-life`);
    const m = own[0][1].match(/animation:\s*dir-rim-life ([\d.]+)s linear both/);
    assert.ok(m, c.cls);
    assert.strictEqual(Math.round(parseFloat(m[1]) * 1000), c.ms, `${c.cls}: the CSS length is the lease's`);
  }
  for (const k of ["lights", "fireplace"]) {
    for (const cls of [F.ROWS[k].start, F.ROWS[k].end]) {
      const m = strip(rimCss).match(new RegExp(`\\.hw\\.rim\\.${cls}[^{]*\\{ animation: dir-rim-life ([\\d.]+)s linear both; \\}`));
      assert.ok(m, `${cls} has dir-rim-life`);
      assert.strictEqual(Math.round(parseFloat(m[1]) * 1000), F.ROWS[k].durationMs, `${cls}: the lease's length`);
    }
  }
  // the lamps: no cue rule sets a transform, a filter or a size animation
  for (const [sel, body] of rules(rimCss)) {
    assert.doesNotMatch(body, /\btransform\s*:|\bfilter\s*:|\bscale\s*:|\brotate\s*:|\btranslate\s*:/, sel);
    assert.doesNotMatch(sel, /\.pet|\.cap|\.toy|\.device\b|fx-/, sel);
  }
});

test("the rim's cues are one-shots: nothing in the rim's CSS repeats, and every animation is a dir- name", () => {
  for (const [, body] of rules(rimCss)) for (const m of body.matchAll(/animation:\s*([^;]+);/g)) {
    assert.doesNotMatch(m[1], /infinite/);
    assert.match(m[1], /^dir-/);
  }
  // the lamps move by opacity or left alone
  for (const m of strip(rimCss).matchAll(/@keyframes dir-[a-z-]+ \{([^@]*?)\}\s*(?=\n)/g)) {
    assert.doesNotMatch(m[1].replace(/\{[^}]*\}/g, (b) => b.replace(/opacity|left/g, "")), /[a-z-]+\s*:/, m[0]);
  }
});

test("the doorbell's chime, an appliance's tick and the rim cues never sit on a toy or a cap, and the cues share the care cues' amber lamps", () => {
  assert.match(strip(rimCss), /\.hw\.rim b \{[^}]*background: var\(--lit\)/);
  for (const [sel] of rules(rimCss)) assert.doesNotMatch(sel, /\.cap|\.toy/, sel);
});

test("a rim cue never lands on the glass and a glass look never on the rim (the layers' sets are disjoint)", () => {
  const glass = new Set([...F.CLASSES_BY_LAYER.glass, ...F.CLASSES_BY_LAYER.ambient]);
  const rim = new Set([...F.CLASSES_BY_LAYER.rim, ...F.CLASSES_BY_LAYER.rimAmbient]);
  for (const c of rim) assert.ok(!glass.has(c), c);
  for (const c of F.CLASSES_BY_LAYER.mark) assert.ok(!glass.has(c) && !rim.has(c), `${c}: a mark class is on the mark element only`);
  assert.strictEqual(rim.size, F.CLASSES_BY_LAYER.rim.length + F.CLASSES_BY_LAYER.rimAmbient.length, "no class twice");
});

test("the card's _forget clears the glow with the cues; the rim's ambient set is painted by paint, not by a cue", () => {
  assert.match(src, /s\.rim\?\.classList\.remove\(\.\.\.HATCH_DEVICE_FX\.RIM_CLASSES, \.\.\.HATCH_DEVICE_FX\.CLASSES_BY_LAYER\.rimAmbient\);/);
  assert.match(src, /<i class="hw glass" aria-hidden="true">(?:<b><\/b>){7}<u class="mark"><\/u><\/i>/);
});
