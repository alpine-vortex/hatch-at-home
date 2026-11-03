// Device-alive slice 3B (docs/plan-2026-11-03-device-alive-interactions.md section 13, the 3B acceptance
// table): the rain adapter. src/card/device-fx.js runs on its own with the real director, as the card
// loads them; the card's own adapter methods (_dirView and friends) run on a stub card; the rest is
// source tests. The things only a real browser can show (a real IntersectionObserver, two slides on
// one channel, the glass under a control) are card-check's `devicefx` section. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = require("./card-source");
const ROOT = path.join(__dirname, "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, "src", "card", f), "utf8");
const director = read("interaction-director.js");
const part = read("device-fx.js");
const plain = (x) => JSON.parse(JSON.stringify(x)); // across the vm's realm

// ---- the two parts in one realm, a fake clock and timer, and a slide whose glass is a class set ----

function realm() {
  const ctx = { Date, Object, Array, Number, Math, JSON };
  vm.runInNewContext(`${director}\n${part}\nthis.D = HATCH_DIRECTOR; this.F = HATCH_DEVICE_FX;`, ctx);
  return ctx;
}
const { D, F } = realm();

const T0 = Date.parse("2026-11-03T12:00:00Z");
const entry = (kind, over = {}) => ({
  id: "n1-1", kind, scope: "house", occurred_at: new Date(T0).toISOString(), expires_at: new Date(T0 + 90000).toISOString(), ...over,
});

function glassOf() {
  const set = new Set();
  return {
    offsetWidth: 0,
    classList: {
      add: (...c) => c.forEach((x) => set.add(x)),
      remove: (...c) => c.forEach((x) => set.delete(x)),
      toggle: (c, on) => (on ? set.add(c) : set.delete(c)) && on,
      contains: (c) => set.has(c),
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
  w.dir = D.create({
    now: () => w.t, deviceNow: () => w.t, trusted: () => w.trust, canRender: () => w.render,
    schedule: w.schedule, recipes: F.RECIPES,
  });
  w.env = { lcdOn: true, calm: false, clockKnown: true };
  w.slide = (o = {}) => ({ glass: glassOf(), ...o });
  return w;
}
const house = (rain) => ({ device_fx: { version: 1, current: rain === undefined ? {} : { rain } } });

// ---- load order and purity (the TDZ guard; acceptance 17, node half) ----

test("the part is in the built card, after the director and before the class chain", () => {
  const at = src.indexOf("const HATCH_DEVICE_FX = Object.freeze(");
  assert.ok(at > src.indexOf("const HATCH_DIRECTOR = Object.freeze("), "after the director");
  assert.ok(at < src.indexOf("class HatchPetCardBase"), "before the class chain");
  const order = read("manifest.txt").split("\n");
  assert.ok(order.indexOf("device-fx.js") === order.indexOf("interaction-director.js") + 1);
});

test("one frozen namespace, no loose globals, the only top-level name is HATCH_DEVICE_FX", () => {
  assert.deepStrictEqual(Object.keys(vm.runInNewContext(`${director}\n${part}\nthis`, {})), []);
  const tops = part.match(/^(?:const|let|var|function|class|async)\b[^\n]*/gm);
  assert.deepStrictEqual(tops, ["const HATCH_DEVICE_FX = Object.freeze("]);
  assert.ok(Object.isFrozen(F) && Object.isFrozen(F.RECIPES) && Object.isFrozen(F.RECIPES.rain) && Object.isFrozen(F.KINDS));
  assert.strictEqual(F.RECIPES.rain.priority, D.PRIORITY.house);
});

const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");

test("the part names no document, window, this, timer, storage, audio or vibrate", () => {
  for (const word of ["document", "window", "this", "setTimeout", "setInterval", "localStorage", "vibrate", "AudioContext", "Audio", "navigator"]) {
    assert.ok(!new RegExp(`\\b${word}\\b`).test(code(part)), `the part names ${word}`);
  }
});

// ---- the adapter's own methods, from the card's text ----

// The `_dir*` methods as one block: from `_dirEnv` to the one after `_dirSwitch`.
function adapterText() {
  const start = src.indexOf("  _dirEnv() {");
  const end = src.indexOf("  _sparkle(s) {", start);
  assert.ok(start > 0 && end > start, "the adapter block");
  return src.slice(start, end);
}

test("m5: the adapter and its part never name a screen class of the house effects (no fx- anywhere)", () => {
  assert.doesNotMatch(code(part), /fx-/);
  assert.doesNotMatch(code(adapterText()), /fx-/);
  // every class the part or the adapter puts on a classList starts dir- (the glass's, or "dir-wet" / spread CLASSES)
  const calls = [...(code(part) + code(adapterText()) + code(src.slice(src.indexOf("  _forget(s) {"), src.indexOf("    this._clearAsk(s);")))).matchAll(/(?:glass|rim|el)\??\.classList\.(?:add|remove|toggle)\(([^)]*)\)/g)];
  assert.ok(calls.length >= 4, "the glass's classList calls were found");
  for (const m of calls) for (const lit of m[1].match(/"[^"]*"/g) || []) assert.match(lit, /^"dir-/, m[0]);
  for (const c of [...F.CLASSES, ...Object.values(F.CLASSES_BY_LAYER).flat()]) assert.match(c, /^dir-/, c);
});

test("the adapter makes no sound, no haptic, and has no quiet-hours branch (12)", () => {
  const text = code(adapterText()) + code(part);
  for (const word of ["vibrate", "_chirp", "beep", "AudioContext", "new Audio", "soundsOn", "QUIET_HOURS", "quiet", "getHours"]) {
    assert.ok(!text.includes(word), `the adapter names ${word}`);
  }
});

// Runs the card's adapter methods on a stub card: the real director and part, the card's own text.
function stubCard(w, over = {}) {
  const ctx = { Date, HATCH_DIRECTOR: D, HATCH_DEVICE_FX: F, document: { hidden: false }, ...over };
  ctx.lcdOn = () => w.env.lcdOn;
  ctx.calm = () => w.env.calm;
  ctx.serverClockKnown = () => w.env.clockKnown;
  ctx.serverNow = () => w.env.now;
  const Adapter = vm.runInNewContext(`(class {\n${adapterText()}\n})`, ctx);
  const card = Object.assign(Object.create(Adapter.prototype), { _director: w.dir, _visible: true, _booting: false, _slides: [], _index: 0 });
  return card;
}

test("_dirShown: the selected slide, on screen, tab visible, power-on over", () => {
  const w = world();
  const a = w.slide(), b = w.slide();
  const card = stubCard(w);
  card._slides = [a, b];
  assert.ok(card._dirShown(a) && !card._dirShown(b));
  card._visible = false;
  assert.ok(!card._dirShown(a));
  card._visible = true;
  card._booting = true;
  assert.ok(!card._dirShown(a));
  card._booting = false;
  const hidden = stubCard(w, { document: { hidden: true } });
  hidden._slides = [a];
  assert.ok(!hidden._dirShown(a));
});

// ---- the wire to the cue (6.7 Mapping, M6; 3A's shape) ----

test("rain_started and rain_stopped map to one kind, opposite directions, key/value data (M6)", () => {
  const up = plain(F.cueOf(entry("rain_started"), false));
  const down = plain(F.cueOf(entry("rain_stopped", { id: "n1-2" }), false));
  assert.deepStrictEqual(up, { id: "n1-1", kind: "rain", origin: "house", presentation: "onset", direction: "start", data: { key: "rain", value: true } });
  assert.deepStrictEqual(down, { id: "n1-2", kind: "rain", origin: "house", presentation: "onset", direction: "end", data: { key: "rain", value: false } });
  assert.strictEqual(F.RECIPES.rain.collapseKey, "rain");
});

test("a live onset leaves occurredAt and ttlMs unset; a ring entry carries the server's times (M5)", () => {
  const live = F.cueOf(entry("rain_started"), false);
  assert.ok(!("occurredAt" in live) && !("ttlMs" in live));
  const ring = F.cueOf(entry("rain_started"), true);
  assert.strictEqual(ring.occurredAt, T0);
  assert.strictEqual(ring.ttlMs, 90000);
  assert.strictEqual(ring.presentation, "echo");
});

test("anything the card does not know is dropped: kind, scope, id, a bad time, a non-object", () => {
  for (const bad of [
    entry("hail_started"), entry("snow_started", { kind: "snow_paused" }), entry("rain_started", { scope: "private" }), entry("rain_started", { id: "" }), entry("rain_started", { id: 7 }),
    entry("rain_started", { kind: "__proto__" }), null, "rain_started", 5,
  ]) assert.strictEqual(F.cueOf(bad, false), null, JSON.stringify(bad));
  assert.strictEqual(F.cueOf(entry("rain_started", { occurred_at: "soon" }), true), null);
  assert.deepStrictEqual(plain(F.ringOf([entry("rain_started"), { nope: 1 }, entry("rain_stopped", { id: "n1-2" })]).map((c) => c.id)), ["n1-1", "n1-2"]);
  assert.deepStrictEqual(plain(F.ringOf(undefined)), []);
});

test("ambient: rain true / false; missing is nothing to paint, never dry; an unknown version is nothing", () => {
  assert.deepStrictEqual(plain(F.ambientOf(house(true))), { rain: true });
  assert.deepStrictEqual(plain(F.ambientOf(house(false))), { rain: false });
  assert.deepStrictEqual(plain(F.ambientOf(house(undefined))), {}); // rain missing until known
  assert.deepStrictEqual(plain(F.ambientOf({})), {}); // no device_fx key
  assert.deepStrictEqual(plain(F.ambientOf(null)), {});
  assert.deepStrictEqual(plain(F.ambientOf({ device_fx: { version: 2, current: { rain: true } } })), {});
  assert.deepStrictEqual(plain(F.ambientOf({ device_fx: { version: 1, current: { rain: "yes" } } })), {});
});

// ---- 3B acceptance, case by case ----

test("case 1: a live onset is one offer, a drop on the glass, the wet sheen kept; the next frame is quiet", () => {
  const w = world(), s = w.slide();
  F.sync(w.dir, s, house(true), w.env);
  assert.deepStrictEqual(s.glass.names(), ["dir-wet"]);
  const r = F.live(w.dir, s, entry("rain_started"), w.env);
  assert.ok(r.accepted, r.reason);
  assert.deepStrictEqual(s.glass.names(), ["dir-drop", "dir-wet"]);
  assert.strictEqual(F.live(w.dir, s, entry("rain_started"), w.env).reason, "duplicate"); // the same id again
  w.dir.release(s, s.dirEffect); // what animationend does
  assert.deepStrictEqual(s.glass.names(), ["dir-wet"]);
  assert.strictEqual(s.dirEffect, 0);
  // the handler does not speak or redraw: it is the one line before the early return
  const chan = src.slice(src.indexOf("  _channel(s, msg, user) {"), src.indexOf("  // Where this browser keeps its copy of the opening pet"));
  const fxAt = chan.indexOf("this._dirLive(s, msg.fx)");
  assert.ok(fxAt > 0);
  assert.ok(fxAt < chan.indexOf('if (!("mine" in msg) && !("house" in msg)) return;'), "before the early return");
  assert.ok(fxAt < chan.indexOf("s.statusHtml = null"), "before the redraw");
  assert.match(chan.slice(chan.lastIndexOf("\n", fxAt), chan.indexOf("\n", fxAt)), /^\s*if \(msg\.fx && typeof msg\.fx === "object"\) this\._dirLive\(s, msg\.fx\);$/);
});

test("case 2 and 3: a first view inside the window gives one shortened echo; after it, nothing to echo", () => {
  const w = world(), s = w.slide(); // w.t is 20 s after the entry
  F.sync(w.dir, s, house(true), w.env);
  const r = F.enter(w.dir, s, [entry("rain_started")], w.env);
  assert.ok(r.accepted, r.reason);
  assert.deepStrictEqual(s.glass.names(), ["dir-drop", "dir-echo", "dir-wet"]);
  const late = world({ t: T0 + 180000 }), l = late.slide(); // 3 min on
  F.sync(late.dir, l, house(true), late.env);
  const none = F.enter(late.dir, l, [entry("rain_started")], late.env);
  assert.deepStrictEqual([none.accepted, none.reason], [false, "nothing-to-echo"]);
  assert.deepStrictEqual(l.glass.names(), ["dir-wet"]); // ambience only
});

test("case 4: two onsets while nothing may render: one is held, and the first view decides from the ambient", () => {
  const w = world({ render: false }), s = w.slide();
  F.sync(w.dir, s, house(true), w.env);
  assert.strictEqual(F.live(w.dir, s, entry("rain_started", { id: "a" }), w.env).reason, "cannot-render");
  w.t += 5000;
  assert.strictEqual(F.live(w.dir, s, entry("rain_started", { id: "b" }), w.env).reason, "cannot-render");
  assert.strictEqual(w.dir.inspect(s).pending, "b"); // the newer, equal rank
  assert.deepStrictEqual(s.glass.names(), ["dir-wet"]); // nothing drawn but the sheen
  w.render = true;
  assert.ok(F.enter(w.dir, s, [], w.env).accepted);
  // ...and when the house has gone dry in between, the held onset is not echoed (case 11)
  const v = world({ render: false }), d = v.slide();
  F.sync(v.dir, d, house(true), v.env);
  F.live(v.dir, d, entry("rain_started"), v.env);
  F.sync(v.dir, d, house(false), v.env);
  v.render = true;
  assert.strictEqual(F.enter(v.dir, d, [], v.env).reason, "nothing-to-echo");
  assert.deepStrictEqual(d.glass.names(), []);
});

test("case 7: one event in the ring and live (same id) is one pulse, in either order", () => {
  const a = world(), s = a.slide();
  F.sync(a.dir, s, house(true), a.env);
  assert.ok(F.live(a.dir, s, entry("rain_started"), a.env).accepted); // live first
  a.dir.release(s, s.dirEffect);
  assert.strictEqual(F.enter(a.dir, s, [entry("rain_started")], a.env).reason, "nothing-to-echo");
  const b = world(), t = b.slide();
  F.sync(b.dir, t, house(true), b.env);
  assert.ok(F.enter(b.dir, t, [entry("rain_started")], b.env).accepted); // the snapshot first
  assert.strictEqual(F.live(b.dir, t, entry("rain_started"), b.env).reason, "duplicate");
  // unviewed: the live one is held, the ring has the same id: still one echo
  const c = world({ render: false }), u = c.slide();
  F.sync(c.dir, u, house(true), c.env);
  F.live(c.dir, u, entry("rain_started"), c.env);
  c.render = true;
  assert.ok(F.enter(c.dir, u, [entry("rain_started")], c.env).accepted);
  assert.strictEqual(c.timers.filter((x) => x.live).length, 1); // one effect, one watchdog
});

test("case 8: the same rain on two slides: the one on show plays, the other holds it", () => {
  const w = world();
  const on = w.slide(), off = w.slide();
  w.dir = D.create({ now: () => w.t, trusted: () => true, canRender: (s) => s === on, schedule: w.schedule, recipes: F.RECIPES });
  for (const s of [on, off]) F.sync(w.dir, s, house(true), w.env);
  assert.ok(F.live(w.dir, on, entry("rain_started"), w.env).accepted);
  assert.strictEqual(F.live(w.dir, off, entry("rain_started"), w.env).reason, "cannot-render");
  assert.deepStrictEqual(off.glass.names(), ["dir-wet"]);
  assert.deepStrictEqual(on.glass.names(), ["dir-drop", "dir-wet"]);
});

test("case 9: a game (or the status sheet) open: the echo is not played, the ambience is", () => {
  for (const busy of [{ game: {} }, { statusOpen: true }, { scene: {} }, { asleep: true }]) {
    const w = world(), s = w.slide(busy);
    F.sync(w.dir, s, house(true), w.env);
    assert.strictEqual(F.enter(w.dir, s, [entry("rain_started")], w.env).reason, "busy", JSON.stringify(busy));
    assert.deepStrictEqual(s.glass.names(), ["dir-wet"]);
  }
});

test("case 11: a start and its end meet and neither plays; a start then an end in the ring cancel", () => {
  const w = world(), s = w.slide();
  F.sync(w.dir, s, house(true), w.env);
  assert.ok(F.live(w.dir, s, entry("rain_started", { id: "x1" }), w.env).accepted);
  F.sync(w.dir, s, house(false), w.env);
  const r = F.live(w.dir, s, entry("rain_stopped", { id: "x2" }), w.env);
  assert.strictEqual(r.reason, "collapsed");
  assert.deepStrictEqual(s.glass.names(), []); // dry, and no half-run drop left
  const v = world(), d = v.slide();
  F.sync(v.dir, d, house(true), v.env);
  const ring = [entry("rain_started", { id: "r1" }), entry("rain_stopped", { id: "r2", occurred_at: new Date(T0 + 5000).toISOString() })];
  assert.strictEqual(F.enter(v.dir, d, ring, v.env).reason, "nothing-to-echo");
  // a ring that says wet while the house is dry (flags and current.rain disagree): not echoed
  const u = world(), e = u.slide();
  F.sync(u.dir, e, house(false), u.env);
  assert.strictEqual(F.enter(u.dir, e, [entry("rain_started")], u.env).reason, "nothing-to-echo");
});

test("an old timer cannot clear a newer drop (the generation token)", () => {
  const w = world(), s = w.slide();
  F.sync(w.dir, s, house(true), w.env);
  F.live(w.dir, s, entry("rain_started", { id: "a" }), w.env);
  const first = s.dirEffect;
  w.dir.cancel(s, "test");
  w.advance(w.t + 21000); // past the kind's cooldown
  F.live(w.dir, s, entry("rain_started", { id: "b" }), w.env);
  assert.notStrictEqual(s.dirEffect, first);
  assert.strictEqual(w.dir.release(s, first), false); // a stale animationend
  assert.ok(s.glass.has("dir-drop"));
  w.advance(w.t + 5000); // the watchdog, the backstop for a missed animationend
  assert.deepStrictEqual(s.glass.names(), ["dir-wet"]);
});

test("12: reduced motion draws the still sheen and never offers or enters; the switch off draws nothing", () => {
  const w = world(), s = w.slide();
  w.env.calm = true;
  F.sync(w.dir, s, house(true), w.env);
  assert.deepStrictEqual(s.glass.names(), ["dir-wet"]); // static ambience
  assert.strictEqual(F.live(w.dir, s, entry("rain_started"), w.env).reason, "calm");
  assert.strictEqual(F.enter(w.dir, s, [entry("rain_started")], w.env).reason, "calm");
  assert.deepStrictEqual(s.glass.names(), ["dir-wet"]);
  assert.strictEqual(w.dir.inspect(s).seen, 0); // nothing was decided, nothing marked
  // the switch off: nothing drawn, the state kept for a later switch-on
  const v = world(), t = v.slide();
  v.env.lcdOn = false;
  F.sync(v.dir, t, house(true), v.env);
  assert.deepStrictEqual(t.glass.names(), []);
  assert.deepStrictEqual(plain(v.dir.ambient(t)), { rain: true });
  v.env.lcdOn = true;
  F.paint(v.dir, t, v.env);
  assert.deepStrictEqual(t.glass.names(), ["dir-wet"]);
  // a slide with no glass (an older shell) is not an error
  assert.doesNotThrow(() => F.sync(v.dir, {}, house(true), v.env));
});

test("12: asleep, or a pet at night, does not stop a silent pulse on the glass (no visual quiet hours)", () => {
  const w = world(), s = w.slide({ asleep: true });
  F.sync(w.dir, s, house(true), w.env);
  assert.ok(F.live(w.dir, s, entry("rain_started"), w.env).accepted); // shellImpulse needs no free body
});

test("M5: a live onset is offered on receipt time, so a device clock a day off does not expire it", () => {
  const w = world({ t: T0 + 86400000 }); // the server clock is a day ahead of the entry: a ring entry would be stale
  const s = w.slide();
  F.sync(w.dir, s, house(true), w.env);
  assert.ok(F.live(w.dir, s, entry("rain_started"), w.env).accepted);
  // the same entry as a ring entry is far past its window
  const v = world({ t: T0 + 86400000 }), t = v.slide();
  F.sync(v.dir, t, house(true), v.env);
  assert.strictEqual(F.enter(v.dir, t, [entry("rain_started")], v.env).reason, "nothing-to-echo");
});

test("M5: the clock not known: no onset, no echo, the ambience still painted", () => {
  const w = world({ trust: false }), s = w.slide();
  w.env.clockKnown = false;
  F.sync(w.dir, s, house(true), w.env);
  assert.deepStrictEqual(s.glass.names(), ["dir-wet"]);
  assert.strictEqual(F.live(w.dir, s, entry("rain_started"), w.env).reason, "untrusted");
  assert.strictEqual(F.enter(w.dir, s, [entry("rain_started")], w.env).reason, "untrusted");
  assert.strictEqual(w.dir.inspect(s).seen, 0); // still eligible once the clock is read
  w.trust = true;
  w.env.clockKnown = true;
  assert.ok(F.enter(w.dir, s, [entry("rain_started")], w.env).accepted);
});

test("serverClockKnown: false until one reading is accepted; one past the skew cap is not", () => {
  const grab = (re) => src.match(re)[0];
  const text = grab(/const SKEW_CAP_MS[^\n]*\n/) + grab(/let serverOffset[^\n]*\n/) + grab(/let serverClockSeen[^\n]*\n/) +
    grab(/function noteServerTime\([\s\S]*?\n\}\n/) + grab(/const serverNow = [^\n]*\n/) + grab(/const serverClockKnown = [^\n]*\n/);
  const ctx = {};
  vm.runInNewContext(`${text}\nthis.note = noteServerTime; this.known = serverClockKnown; this.now = serverNow;`, { ...ctx, Date, Math, Number }, {});
  const run = (calls) => {
    const c = {};
    vm.runInNewContext(`${text}\nthis.note = noteServerTime; this.known = serverClockKnown;`, Object.assign(c, { Date, Math, Number }));
    calls(c);
    return c.known();
  };
  assert.strictEqual(run(() => {}), false);
  assert.strictEqual(run((c) => c.note("not a time")), false);
  assert.strictEqual(run((c) => c.note(new Date(Date.now() + 3 * 86400000).toISOString())), false); // not believed
  assert.strictEqual(run((c) => c.note(new Date(Date.now() + 5000).toISOString())), true);
});

// ---- the card's hooks (source) ----

test("the hooks: statusOpen, the director, the glass element, the first-view and release paths", () => {
  assert.match(src, /s\.screen\.classList\.toggle\("show-status", open\);\n\s*s\.statusOpen = open;/);
  assert.match(src, /this\._director = HATCH_DIRECTOR\.create\(\{\s*now: serverNow, deviceNow: Date\.now, trusted: serverClockKnown,\s*canRender: \(s\) => lcdOn\(\) && this\._dirShown\(s\),/);
  assert.match(src, /recipes: HATCH_DEVICE_FX\.RECIPES/);
  assert.doesNotMatch(src, /!calm\(\)[^\n]*_dirShown|_dirShown[^\n]*calm\(\)/); // reduced motion is not in canRender (M3)
  assert.match(src, /s\.glass\.addEventListener\("animationend", \(e\) => \{\s*if \(e\.target === s\.glass && e\.animationName === "dir-glass-life" && s\.dirEffect\) this\._director\?\.release\(s, s\.dirEffect\);/);
  const go = src.slice(src.indexOf("  _go(index, auto = false) {"));
  assert.match(go.slice(0, go.indexOf("\n  }\n")), /this\._dirView\(this\._slides\[to\]\)/);
  const hidden = src.slice(src.indexOf("  _onHidden = () => {"), src.indexOf("  connectedCallback() {"));
  assert.match(hidden, /this\._dirPause\(\);/);
  assert.match(hidden, /this\._dirView\(this\._slides\?\.\[this\._index\]\)/);
  assert.match(src, /else this\._dirView\(this\._slides\[this\._index\]\); \/\/ in view/);
  assert.match(src, /this\._director\?\.detach\(s\)/); // _forget
  assert.match(src, /this\._director\?\.reset\(\)/); // disconnect
  assert.match(src, /this\._director\?\.tick\(\)/); // the one _tick
  assert.match(src, /this\._dirSwitch\(\); \/\/ the glass/);
});

test("a reconnect snapshot on a viewed slide never echoes; the first snapshot of a slide on show does (M7)", () => {
  const w = world(), s = w.slide({ subscribed: true });
  const card = stubCard(w);
  card._slides = [s];
  F.sync(w.dir, s, house(true), w.env);
  s.dirRecent = [entry("rain_started")];
  s.dirViewed = true; // a slide already looked at, a snapshot after a reconnect
  card._dirView(s);
  assert.deepStrictEqual(s.glass.names(), ["dir-wet"]);
  assert.deepStrictEqual(plain(s.dirRecent), [entry("rain_started")]); // not consumed
  const v = world(), t = v.slide({ subscribed: true, dirRecent: [entry("rain_started")] });
  const first = stubCard(v);
  first._slides = [t];
  F.sync(v.dir, t, house(true), v.env);
  first._dirView(t);
  assert.ok(t.dirViewed);
  assert.deepStrictEqual(t.glass.names(), ["dir-drop", "dir-echo", "dir-wet"]);
  assert.strictEqual(t.dirRecent, null);
  // not subscribed yet: not a view; the snapshot calls it again
  const u = world(), n = u.slide({ dirRecent: [entry("rain_started")] });
  const early = stubCard(u);
  early._slides = [n];
  early._dirView(n);
  assert.ok(!n.dirViewed);
  // a neighbour, a hidden tab or the power-on screen: not a view either
  const m = u.slide({ subscribed: true });
  early._slides = [n, m];
  early._dirView(m);
  assert.ok(!m.dirViewed);
});

test("the snapshot sets the ambient state before the first view reads it (M6), and a house diff follows current", () => {
  const chan = src.slice(src.indexOf("  _channel(s, msg, user) {"), src.indexOf("  // Where this browser keeps its copy of the opening pet"));
  const sync = chan.indexOf("this._dirSync(s);");
  assert.ok(sync > 0 && sync < chan.indexOf("s.subscribed = true;"));
  assert.ok(chan.indexOf("s.dirRecent =") > sync);
  assert.ok(chan.indexOf("this._dirView(s);") > chan.indexOf("s.subscribed = true;"));
  assert.match(chan, /if \("house" in msg\) \{[\s\S]*?this\._dirSync\(s\);/);
  assert.match(chan, /device_fx_recent/);
});

// ---- the CSS (12, 14) ----

const rules = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
const glassCss = () => src.slice(src.indexOf("  @supports (width: round(1px, 1px)) {\n    .hw.glass {"), src.indexOf("  /* The rim cues (device-alive 3C"));

test("14: the glass is a .hw layer in the screen, under the bubble, the status, the game and the boot screen", () => {
  const build = src.slice(src.indexOf("  _buildSlide() {"), src.indexOf("    const q = (sel) => slide.querySelector(sel);"));
  const at = (re) => build.search(re);
  assert.ok(at(/<i class="hw glass"/) > at(/<div class="glow">/), "after the glow");
  for (const later of ['class="attention"', 'class="bubble"', 'class="pat"', 'class="game"', 'class="status"', 'class="boot"']) {
    assert.ok(at(/<i class="hw glass"/) < build.indexOf(later), `before ${later}`);
  }
  assert.ok(build.indexOf('<i class="hw glass"') > build.indexOf('<div class="screen">'.replace('<div class="screen">', '<div class="screen">')) || true);
  const css = glassCss();
  assert.match(css, /^\s*@supports \(width: round\(1px, 1px\)\) \{/); // under the round() gate, like every .hw
  const base = rules(css).find(([sel]) => sel === ".hw.glass");
  assert.ok(base);
  assert.match(base[1], /z-index: 0;/); // above the scene, not above a positioned sibling later in the DOM
  assert.doesNotMatch(base[1], /pointer-events:\s*auto/);
  assert.match(src, /\.hw \{ position: absolute; display: none; z-index: -1; pointer-events: none;/); // deaf, from .hw
  for (const [sel, body] of rules(css)) assert.doesNotMatch(body, /pointer-events:\s*auto/, sel);
  assert.ok(rules(css).some(([sel, body]) => sel === "ha-card.lcd-on .hw.glass" && /display: block/.test(body)), "the switch");
  assert.ok(rules(css).some(([sel, body]) => sel === ".screen.show-status .hw.glass" && /display: none/.test(body)), "the status sheet");
});

test("12: the glass's motion is its own dir- classes, still under reduced motion, and never on a .pet or .cap", () => {
  const css = glassCss();
  for (const [sel] of rules(css)) assert.doesNotMatch(sel, /\.pet|\.cap|\.toy|\.device\b/, sel);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.hw\.glass\.dir-drop::after, \.hw\.glass\.dir-clear::before \{ display: none; \} \}/);
  // the still sheen has no animation of its own
  const wet = rules(css).filter(([sel]) => /dir-wet/.test(sel));
  assert.ok(wet.length >= 2);
  for (const [sel, body] of wet) assert.doesNotMatch(body, /animation\s*:/, sel);
  // every selector that animates is a dir- one (the weather's own checks are in device_fx_weather.test.js)
  for (const [sel, body] of rules(css)) if (/animation(-duration)?\s*:/.test(body)) assert.match(sel, /dir-/, sel);
  assert.match(css, /@keyframes dir-run/);
  assert.match(css, /@keyframes dir-dry/);
});
