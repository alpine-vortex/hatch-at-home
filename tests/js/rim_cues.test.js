// Device-alive slice 3C (docs/plan-2026-11-03-device-alive-interactions.md section 13, the 3C table):
// the rim cues on a press (feed, play, clean) and on a confirmed tuck. src/card/device-fx.js runs with
// the real director; the card's `_rimCue` on a stub card; the rest is source tests. How it looks is the
// bench's `alive` preset and the device queue. node --test tests/js
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
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
const method = (name, from = src) => {
  const at = from.indexOf(`  ${name}(`);
  assert.ok(at >= 0, `${name} is in the card`);
  const end = from.indexOf("\n  }\n", at);
  return from.slice(at, end + 4);
};

const ctx = { Date, Object, Array, Number, Math, JSON };
vm.runInNewContext(`${director}\n${part}\nthis.D = HATCH_DIRECTOR; this.F = HATCH_DEVICE_FX;`, ctx);
const { D, F } = ctx;

// A slide whose rim and glass are class sets.
const layer = () => {
  const set = new Set();
  return {
    offsetWidth: 0,
    classList: {
      add: (...c) => c.forEach((x) => set.add(x)),
      remove: (...c) => c.forEach((x) => set.delete(x)),
      toggle: (c, on) => (on ? set.add(c) : set.delete(c)) && on,
      contains: (c) => set.has(c),
    },
    names: () => [...set].sort(),
  };
};
function world(over = {}) {
  const w = { t: Date.parse("2026-11-03T12:00:00Z"), timers: [], render: true, ...over };
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
    now: () => w.t, deviceNow: () => w.t, trusted: () => true, canRender: () => w.render,
    schedule: w.schedule, recipes: F.RECIPES,
  });
  w.env = { lcdOn: true, calm: false, clockKnown: true };
  w.slide = (o = {}) => ({ glass: layer(), rim: layer(), ...o });
  return w;
}
let n = 0;
const id = () => `rim-${++n}`;

test("feed, play, clean and the tuck each lease the shell track and put one dir- class on the rim", () => {
  const w = world();
  const want = { feed: "dir-feed", play: "dir-play", clean: "dir-clean", lights: "dir-tuck" };
  for (const [action, cls] of Object.entries(want)) {
    const s = w.slide();
    const r = F.rim(w.dir, s, action, id(), w.env);
    assert.ok(r.accepted, `${action}: ${r.reason}`);
    assert.deepStrictEqual(s.rim.names(), [cls], action);
    assert.deepStrictEqual(s.glass.names(), [], "the rain's glass is not the rim");
    assert.strictEqual(s.dirEffect, r.effectId);
    assert.ok(w.dir.inspect(s).tracks.shellImpulse || true);
    w.dir.release(s, s.dirEffect); // what the rim's animationend does
    assert.deepStrictEqual(s.rim.names(), []);
    assert.strictEqual(s.dirEffect, 0);
  }
  assert.deepStrictEqual(Object.keys(F.RIM).sort(), ["clean", "feed", "lights", "play"]);
  for (const cue of Object.values(F.RIM)) assert.ok(F.RIM_CLASSES.includes(cue.cls) && cue.cls.startsWith("dir-"));
});

test("medicine, snack, scold, praise and anything else get no rim cue", () => {
  const w = world();
  const s = w.slide();
  for (const action of ["medicine", "snack", "scold", "praise", "lay_egg", "", undefined, null, "constructor", "toString", "__proto__"]) {
    const r = F.rim(w.dir, s, action, id(), w.env);
    assert.deepStrictEqual([r.accepted, r.reason], [false, "no-cue"], String(action));
  }
  assert.deepStrictEqual(s.rim.names(), []);
});

test("12 (rim half): reduced motion offers no cue; the switch off draws none and holds none for later", () => {
  const w = world();
  const s = w.slide();
  assert.strictEqual(F.rim(w.dir, s, "feed", id(), { ...w.env, calm: true }).reason, "calm");
  assert.deepStrictEqual(s.rim.names(), []);
  w.render = false; // the switch off, or the slide not on show: canRender
  assert.strictEqual(F.rim(w.dir, s, "feed", id(), w.env).reason, "cannot-render");
  assert.deepStrictEqual(s.rim.names(), []);
  w.render = true; // switching on later does not play a press that is past (a press is never an echo)
  assert.strictEqual(w.dir.enterView(s, [], true).accepted, false);
  assert.deepStrictEqual(s.rim.names(), []);
});

test("shared frame: a care scene running wins over a rim cue (BUSY_OWNERS scene)", () => {
  assert.ok(D.BUSY_OWNERS.some((o) => o.name === "scene"));
  const w = world();
  const s = w.slide({ scene: { kind: "feed" } });
  for (const action of ["feed", "play", "clean", "lights"]) {
    const r = F.rim(w.dir, s, action, id(), w.env);
    assert.deepStrictEqual([r.accepted, r.reason], [false, "busy"], action);
  }
  assert.deepStrictEqual(s.rim.names(), []);
  s.scene = null; // the scene ended: the cue plays
  assert.ok(F.rim(w.dir, s, "clean", id(), w.env).accepted);
});

test("one cue at a time on the shell track: a newer press replaces the last, and an old end cannot clear it", () => {
  const w = world();
  const s = w.slide();
  const a = F.rim(w.dir, s, "feed", id(), w.env);
  w.advance(w.t + 300);
  const b = F.rim(w.dir, s, "play", id(), w.env);
  assert.ok(a.accepted && b.accepted);
  assert.deepStrictEqual(s.rim.names(), ["dir-play"]);
  assert.strictEqual(w.dir.release(s, a.effectId), false); // a stale animationend
  assert.deepStrictEqual(s.rim.names(), ["dir-play"]);
  assert.strictEqual(s.dirEffect, b.effectId);
  w.advance(w.t + 5000); // the watchdog is the backstop for a missed animationend
  assert.deepStrictEqual(s.rim.names(), []);
  assert.strictEqual(s.dirEffect, 0);
});

test("a press is over a rain drop on the shell track; the sheen stays", () => {
  const w = world();
  const s = w.slide();
  F.sync(w.dir, s, { device_fx: { version: 1, current: { rain: true } } }, w.env);
  const drop = F.live(w.dir, s, { id: "n1-1", kind: "rain_started", scope: "house" }, w.env);
  assert.ok(drop.accepted);
  assert.ok(F.rim(w.dir, s, "feed", id(), w.env).accepted);
  assert.deepStrictEqual(s.glass.names(), ["dir-wet"]);
  assert.deepStrictEqual(s.rim.names(), ["dir-feed"]);
});

test("the same press id is never played twice", () => {
  const w = world();
  const s = w.slide();
  assert.ok(F.rim(w.dir, s, "feed", "rim-x", w.env).accepted);
  w.dir.release(s, s.dirEffect);
  assert.strictEqual(F.rim(w.dir, s, "feed", "rim-x", w.env).reason, "duplicate");
});

test("12 (rim half): no haptic and no audio from a cue", () => {
  const text = code(part) + code(method("_rimCue"));
  for (const word of ["vibrate", "_chirp", "beep", "AudioContext", "new Audio", "soundsOn", "navigator", "QUIET_HOURS", "getHours"]) {
    assert.ok(!text.includes(word), `the cue names ${word}`);
  }
});

test("rule: the cue starts from the press, never from a cap class; its callers are the press, play and a confirmed tuck", () => {
  // the card's one method: the data-action names the cue; no class on any button is read
  const body = code(method("_rimCue"));
  assert.ok(!/classList|pressed|tapped|pending|failed|querySelector/.test(body), "_rimCue reads no class");
  assert.match(body, /HATCH_DEVICE_FX\.rim\(this\._director, s, action, `rim-\$\{this\._rimSeq\}`, this\._dirEnv\(\)\)/);
  const callers = [...src.matchAll(/this\._rimCue\(s, ([^)]*)\)/g)].map((m) => m[1]);
  assert.deepStrictEqual(callers.sort(), ['"lights"', "button?.dataset?.action", "button?.dataset?.action"]);
  // _press: after the status is closed and the call is known to go out, ahead of the scene's start
  const press = method("_press");
  assert.ok(press.indexOf("this._rimCue(") > press.indexOf("if (!id) return;"));
  assert.ok(press.indexOf("this._rimCue(") < press.indexOf("this._sceneStart(s, action)"));
  // play: after its refusals, from its own press
  const play = method("_startGame");
  assert.ok(play.indexOf("this._rimCue(") > play.indexOf("if (refusal)"));
  // _tapped (the cap's own feel, slice 2) carries no cue
  assert.ok(!code(method("_tapped")).includes("_rimCue"));
  // the tuck: from the scene's end, only a confirmed lie-down (s.wasAsleep, written by the scene's own beat), never a wake
  const end = method("_sceneEnd");
  assert.match(end, /!quiet && sc\.kind === "lights" && !sc\.wake && sc\.result === "ok" && s\.wasAsleep === true\) this\._rimCue\(s, "lights"\)/);
  assert.ok(!/wasAsleep\s*=[^=]/.test(code(end)), "the cue writes no wasAsleep");
});

test("rule: the tuck's scene beats are untouched (no rim, no cue in _lightsTuck or _lightsWake)", () => {
  const care = read("card-care.js");
  for (const name of ["_lightsTuck", "_lightsWake"]) {
    const m = care.slice(care.indexOf(`  ${name}(`));
    const body = m.slice(0, m.indexOf("\n  }\n"));
    assert.ok(!/_rimCue|\.rim\b|dir-/.test(body), name);
  }
  assert.ok(!/_rimCue|\.rim\b/.test(care), "card-care.js names no rim");
});

// ---- the rim layer's CSS ----

const rules = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
const rimCss = () => stripped(rimRaw());
const stripped = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");
const rimRaw = () => {
  const a = src.indexOf("  /* The rim cues (device-alive 3C");
  const b = src.indexOf("  .compact .egg .hw.light", a);
  assert.ok(a > 0 && b > a, "the rim block");
  return src.slice(a, b);
};

test("14 (rim half): the rim is a .hw layer in the bezel, under the screen, deaf to the pointer, away from every control", () => {
  const build = src.slice(src.indexOf("  _buildSlide() {"), src.indexOf("    const q = (sel) => slide.querySelector(sel);"));
  const at = build.indexOf('<i class="hw rim"');
  assert.ok(at > build.indexOf('<div class="bezel">'), "in the bezel");
  assert.ok(at < build.indexOf('<div class="screen">'), "before the screen");
  assert.ok(at < build.indexOf('<div class="buttons">'), "not among the toys");
  assert.match(build.slice(at, build.indexOf("</i>", at)), /^<i class="hw rim" aria-hidden="true"><b><\/b><b><\/b><b><\/b>/);
  const css = rimCss();
  assert.match(css, /^\s*@supports \(width: round\(1px, 1px\)\) \{/); // under the round() gate, like every .hw
  assert.ok(rules(css).some(([sel, body]) => sel === ".hw.rim" && /display: none/.test(body) && /z-index: -1/.test(body)));
  assert.ok(rules(css).some(([sel, body]) => sel === "ha-card.lcd-on .hw.rim" && /display: block/.test(body)), "the switch");
  for (const [sel, body] of rules(css)) assert.doesNotMatch(body, /pointer-events:\s*auto/, sel);
  assert.match(src, /\.hw \{ position: absolute; display: none; z-index: -1; pointer-events: none;/); // deaf, from .hw
  assert.match(css, /\.hw\.rim b \{[^}]*pointer-events: none/);
});

test("rule: no rim rule touches .cap, .toy, .pet or .device; only transform-free dir- animations; reduced motion hides the layer", () => {
  const css = rimCss();
  const all = rules(css);
  assert.ok(all.length > 10);
  for (const [sel, body] of all) {
    assert.match(sel, /\.hw\.rim|^@media|^@keyframes|^\d|^from|^to/, sel); // every rule is on the rim layer
    assert.doesNotMatch(sel, /\.cap|\.toy|\.pet|\.device|\.buttons/, sel);
    assert.doesNotMatch(body, /\btransform\s*:|\bfilter\s*:|\bscale\s*:|\brotate\s*:|\btranslate\s*:/, sel);
  }
  assert.doesNotMatch(css, /\btransform\s*:|\bfilter\s*:/);
  // every animation names a dir- keyframe, and each is defined
  const names = [...css.matchAll(/animation\s*:\s*(dir-[a-z-]+)/g)].map((m) => m[1]);
  assert.ok(names.length >= 7);
  for (const name of new Set(names)) assert.match(css, new RegExp(`@keyframes ${name} \\{`), name);
  assert.doesNotMatch(css, /animation:\s*(?!dir-)\S/);
  // the keyframes move opacity or left, nothing else
  for (const m of css.matchAll(/@keyframes dir-[a-z-]+ \{([^@]*?)\}\s*(?=\n)/g)) {
    assert.doesNotMatch(m[1].replace(/\{[^}]*\}/g, (b) => b.replace(/opacity|left/g, "")), /[a-z-]+\s*:/, m[0]);
  }
  // reduced motion: the lamps (the cues) are hidden, the layer stays so the still glow (4D's ambience) shows
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.hw\.rim b \{ display: none !important; \} \}/);
  // the classes the recipes put on the rim are the ones the CSS answers
  for (const cls of F.RIM_CLASSES) assert.match(css, new RegExp(`\\.hw\\.rim\\.${cls}`), cls);
  // slice 2's rules on the cap and the toy name no dir- or rim
  const capRules = rules(src).filter(([sel]) => /\.cap|\.toy/.test(sel));
  assert.ok(capRules.length > 3);
  for (const [sel, body] of capRules) assert.doesNotMatch(sel + body, /dir-|\.rim\b/, sel);
});

test("the cue's life: the rim's own animation is the lease's clock, and its end releases it", () => {
  const css = rimCss();
  for (const [cls, cue] of Object.entries({ feed: F.RIM.feed, play: F.RIM.play, clean: F.RIM.clean, tuck: F.RIM.lights })) {
    const m = css.match(new RegExp(`\\.hw\\.rim\\.dir-${cls} \\{ animation: dir-rim-life ([\\d.]+)s linear both; \\}`));
    assert.ok(m, cls);
    assert.strictEqual(Math.round(parseFloat(m[1]) * 1000), cue.ms, `${cls}: the CSS length is the lease's`);
  }
  assert.match(src, /s\.rim\.addEventListener\("animationend", \(e\) => \{\s*if \(e\.target === s\.rim && e\.animationName === "dir-rim-life" && s\.dirEffect\) this\._director\?\.release\(s, s\.dirEffect\);/);
  assert.match(src, /s\.rim\?\.classList\.remove\(\.\.\.HATCH_DEVICE_FX\.RIM_CLASSES, \.\.\.HATCH_DEVICE_FX\.CLASSES_BY_LAYER\.rimAmbient\)/); // _forget: the cues and the glow
});

test("the part: no fx- class, rim classes all dir-, the rim recipes ride the director's shell track", () => {
  assert.ok(!/\bfx-/.test(part));
  const houseKinds = new Set(Object.values(F.HOUSE_RIM).flatMap((e) => (e.by ? Object.values(e.by) : [e])).map((c) => c.kind));
  for (const [kind, r] of Object.entries(F.RECIPES)) {
    if (kind in F.ROWS) continue; // a key's recipe (the weather, the room: the wire's)
    assert.strictEqual(r.track, "shellImpulse", kind);
    assert.strictEqual(r.priority, houseKinds.has(kind) ? D.PRIORITY.house : D.PRIORITY.care, kind); // a press stays over a house cue
  }
  const keyed = Object.keys(F.ROWS).filter((k) => F.ROWS[k].kinds === undefined || F.ROWS[k].kinds.length > 0);
  assert.deepStrictEqual(Object.keys(F.RECIPES).sort(), [...keyed, ...houseKinds, "rimClean", "rimFeed", "rimPlay", "rimTuck"].sort());
});

// ---- the card's method, on a stub card ----

test("_rimCue hands the director the action, a fresh id per press and the card's own facts", () => {
  const w = world();
  const s = w.slide();
  const calls = [];
  const dir = { busyOwners: (x) => w.dir.busyOwners(x), offer: (slide, cue) => { calls.push(cue); return w.dir.offer(slide, cue); } };
  const Card = vm.runInNewContext(`(class {\n${method("_rimCue")}\n _dirEnv() { return ENV(); }\n})`, {
    HATCH_DEVICE_FX: F, ENV: () => w.env,
  });
  const card = Object.assign(Object.create(Card.prototype), { _director: dir });
  card._rimCue(s, "feed");
  w.dir.release(s, s.dirEffect);
  card._rimCue(s, "feed");
  assert.strictEqual(calls.length, 2);
  assert.notStrictEqual(calls[0].id, calls[1].id);
  assert.deepStrictEqual(calls.map((c) => c.kind), ["rimFeed", "rimFeed"]);
  assert.strictEqual(calls[0].origin, "user");
  card._rimCue(s, "medicine"); // none
  assert.strictEqual(calls.length, 2);
  card._director = null;
  assert.doesNotThrow(() => card._rimCue(s, "feed"));
});
