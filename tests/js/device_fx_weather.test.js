// Device-alive slice 4B (docs/plan-2026-11-03-device-alive-interactions.md sections 6.6b and 13, the 4B
// acceptance row): the weather keys on the glass. device-fx.js is a table keyed like the server's
// DEVICE_SIGNAL_MAP; this file checks it against tests/js/device_signal_map.json (the map's export,
// which tests/test_device_fx.py keeps in sync), runs each key through the real director, and holds the
// CSS to the storm's non-flashing rule. node --test tests/js
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

const ctx = { Date, Object, Array, Number, Math, JSON };
vm.runInNewContext(`${director}\n${part}\nthis.D = HATCH_DIRECTOR; this.F = HATCH_DEVICE_FX;`, ctx);
const { D, F } = ctx;
// 4B's keys: the weather. The map also carries 4C's activity keys (lights, fireplace, tv, music, heating,
// cooling); the card ignores those until 4D (plan 13, 4C row), and a test below says so.
const KEYS = ["rain", "snow", "fog", "storm", "wind"];
const ACTIVITY = Object.keys(MAP.keys).filter((k) => !KEYS.includes(k));

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
  w.env = { lcdOn: true, calm: false, clockKnown: true, now: Date.UTC(2026, 10, 3) }; // 2026-11-03 is no full or new moon
  w.slide = (o = {}) => ({ glass: glassOf(), rim: glassOf(), ...o });
  return w;
}
const house = (current) => ({ device_fx: { version: 1, current } });

// ---- the parity test (6.2 item 2): the JS table against the map's export ----

test("every wire kind in the export has a KINDS and a RECIPES entry, in the map's order", () => {
  assert.strictEqual(MAP.version, 1);
  assert.deepStrictEqual(Object.keys(F.WEATHER), KEYS);
  const wire = KEYS.flatMap((k) => MAP.keys[k].kinds);
  assert.deepStrictEqual(Object.keys(F.KINDS), wire);
  for (const k of KEYS) {
    assert.ok(F.RECIPES[k], `a recipe for ${k}`);
    assert.strictEqual(F.RECIPES[k].collapseKey, k);
    assert.ok(Object.isFrozen(F.RECIPES[k]), k);
    assert.deepStrictEqual(MAP.keys[k].kinds, [`${k}_started`, `${k}_stopped`]);
    assert.strictEqual(MAP.keys[k].type, "bool");
    assert.deepStrictEqual(plain(F.KINDS[`${k}_started`]), { key: k, direction: "start", value: true });
    assert.deepStrictEqual(plain(F.KINDS[`${k}_stopped`]), { key: k, direction: "end", value: false });
  }
});

test("the map's first keys are the weather, in the table's order; the rest are 4C's and the card ignores them", () => {
  assert.deepStrictEqual(Object.keys(MAP.keys).slice(0, KEYS.length), KEYS);
  for (const k of ACTIVITY) {
    for (const kind of MAP.keys[k].kinds) assert.ok(!(kind in F.KINDS), `${kind} waits for 4D`);
    assert.ok(!(k in F.RECIPES), `${k} has no recipe yet`);
    const w = world(), s = w.slide();
    F.sync(w.dir, s, house({ [k]: true }), w.env);
    assert.deepStrictEqual(s.glass.names(), [], `${k} paints nothing`);
    for (const kind of MAP.keys[k].kinds) {
      const r = F.live(w.dir, s, entry(kind), w.env);
      assert.ok(!r || !r.ok, `${kind} plays nothing`);
      assert.deepStrictEqual(s.glass.names(), [], `${kind} paints nothing`);
    }
  }
});

test("the JS names no kind absent from the export (no <key>_started in the part outside the table)", () => {
  const named = new Set(part.match(/\b[a-z]+_(?:started|stopped)\b/g) || []);
  for (const n of named) assert.ok(Object.keys(F.KINDS).includes(n), `${n} is not in the export`);
});

test("the table's rank and cooldown follow the map: rank equal, the cooldown under block_s so a held reverse is not eaten", () => {
  for (const k of KEYS) {
    assert.strictEqual(F.WEATHER[k].echoRank, MAP.keys[k].echo_rank, k);
    assert.strictEqual(F.RECIPES[k].echoRank, MAP.keys[k].echo_rank, k);
    assert.ok(F.WEATHER[k].cooldownMs > 0, `${k} has a cooldown`);
    assert.strictEqual(F.RECIPES[k].cooldownMs, F.WEATHER[k].cooldownMs);
    assert.ok(F.WEATHER[k].cooldownMs < MAP.keys[k].block_s * 1000, `${k}'s cooldown is under its block`);
    assert.strictEqual(F.RECIPES[k].priority, D.PRIORITY.house);
  }
});

test("every ambient key is read by ambientOf and painted by paint, each on its own class", () => {
  const classes = new Set();
  for (const k of KEYS) {
    const w = world(), s = w.slide();
    assert.deepStrictEqual(plain(F.ambientOf(house({ [k]: true }))), { [k]: true });
    assert.deepStrictEqual(plain(F.ambientOf(house({ [k]: false }))), { [k]: false });
    F.sync(w.dir, s, house({ [k]: true }), w.env);
    assert.deepStrictEqual(s.glass.names(), [F.WEATHER[k].ambient], k);
    assert.ok(!classes.has(F.WEATHER[k].ambient), "one class per key");
    classes.add(F.WEATHER[k].ambient);
    F.sync(w.dir, s, house({ [k]: false }), w.env);
    assert.deepStrictEqual(s.glass.names(), [], `${k} false is dry`);
  }
});

test("a missing key, a non-boolean and an unknown key are nothing to paint (4A: a key is missing until known)", () => {
  assert.deepStrictEqual(plain(F.ambientOf(house({ snow: "yes", fog: 1, hail: true }))), {});
  assert.deepStrictEqual(plain(F.ambientOf(house({ rain: true, wind: false }))), { rain: true, wind: false });
  assert.deepStrictEqual(plain(F.ambientOf({ device_fx: { version: 2, current: { snow: true } } })), {});
  const w = world(), s = w.slide();
  F.sync(w.dir, s, house({ rain: true, storm: true }), w.env); // lightning-rainy: two keys at once
  assert.deepStrictEqual(s.glass.names(), ["dir-storm", "dir-wet"]);
});

test("every key has a bench shot in the alive preset (rain's literal, the others a row of WEATHER_LOOKS), and the moon too", () => {
  const bench = read("scripts/bench.js");
  const alive = bench.slice(bench.indexOf("  alive() {"));
  assert.match(alive, /alive\/rain-\$\{width\}-\$\{name\}/);
  const looks = alive.slice(alive.indexOf("const WEATHER_LOOKS = {"), alive.indexOf("const weather = "));
  for (const k of KEYS.filter((x) => x !== "rain")) assert.match(looks, new RegExp(`\\n      ${k}: \\{ current: \\{ ${k}: true \\}`), `${k} has a row in WEATHER_LOOKS`);
  assert.match(alive, /`alive\/\$\{key\}-\$\{width\}-\$\{name\}`/);
  assert.match(alive, /alive\/moon-\$\{width\}-\$\{name\}/);
});

// ---- per key: an onset, an echo, a flipped ambient, a kind with no recipe ----

for (const k of KEYS) {
  const w0 = F.WEATHER[k];
  test(`${k}: a start is one onset on the glass with its ambience kept; the end plays the other class`, () => {
    const w = world(), s = w.slide();
    F.sync(w.dir, s, house({ [k]: true }), w.env);
    const r = F.live(w.dir, s, entry(`${k}_started`), w.env);
    assert.ok(r.accepted, r.reason);
    assert.deepStrictEqual(s.glass.names(), [w0.start, w0.ambient].sort());
    w.dir.release(s, s.dirEffect); // what the glass's dir-glass-life ending does
    assert.deepStrictEqual(s.glass.names(), [w0.ambient]);
    w.advance(w.t + 50000);
    F.sync(w.dir, s, house({ [k]: false }), w.env);
    assert.ok(F.live(w.dir, s, entry(`${k}_stopped`, { id: "n1-2" }), w.env).accepted);
    assert.deepStrictEqual(s.glass.names(), [w0.end]);
  });

  test(`${k}: a first view inside the window is one shortened echo; with the ambient flipped it does not play`, () => {
    const w = world(), s = w.slide();
    F.sync(w.dir, s, house({ [k]: true }), w.env);
    const r = F.enter(w.dir, s, [entry(`${k}_started`)], w.env);
    assert.ok(r.accepted, r.reason);
    assert.deepStrictEqual(s.glass.names(), [w0.start, "dir-echo", w0.ambient].sort());
    const v = world(), t = v.slide();
    F.sync(v.dir, t, house({ [k]: false }), v.env); // it stopped since
    assert.strictEqual(F.enter(v.dir, t, [entry(`${k}_started`)], v.env).accepted, false);
    assert.deepStrictEqual(t.glass.names(), []);
  });

  test(`${k}: a start and its end meet while it runs and neither plays; the same kind inside its cooldown is ambience only`, () => {
    const w = world(), s = w.slide();
    F.sync(w.dir, s, house({ [k]: true }), w.env);
    assert.ok(F.live(w.dir, s, entry(`${k}_started`), w.env).accepted);
    const r = F.live(w.dir, s, entry(`${k}_stopped`, { id: "n1-2" }), w.env);
    assert.strictEqual(r.reason, "collapsed");
    assert.deepStrictEqual(s.glass.names(), [w0.ambient]);
    // the cooldown (per kind): a later start of the same kind, inside it, does not play
    const c = world(), u = c.slide();
    assert.ok(F.live(c.dir, u, entry(`${k}_started`), c.env).accepted);
    c.dir.release(u, u.dirEffect);
    assert.strictEqual(F.live(c.dir, u, entry(`${k}_started`, { id: "n1-3" }), c.env).reason, "cooldown");
    c.advance(c.t + w0.cooldownMs + 1);
    assert.ok(F.live(c.dir, u, entry(`${k}_started`, { id: "n1-4" }), c.env).accepted);
  });

  test(`${k}: reduced motion paints the still ambience and offers no onset or echo; the switch off draws nothing`, () => {
    const w = world(), s = w.slide();
    w.env.calm = true;
    F.sync(w.dir, s, house({ [k]: true }), w.env);
    assert.deepStrictEqual(s.glass.names(), [w0.ambient]);
    assert.strictEqual(F.live(w.dir, s, entry(`${k}_started`), w.env).reason, "calm");
    assert.strictEqual(F.enter(w.dir, s, [entry(`${k}_started`)], w.env).reason, "calm");
    assert.deepStrictEqual(s.glass.names(), [w0.ambient]);
    w.env.lcdOn = false;
    F.sync(w.dir, s, house({ [k]: true }), w.env);
    assert.deepStrictEqual(s.glass.names(), []);
  });
}

test("two different kinds of the same priority keep their own cooldowns, and a kind with no recipe is ignored", () => {
  const w = world(), s = w.slide();
  F.sync(w.dir, s, house({ snow: true, fog: true }), w.env);
  assert.ok(F.live(w.dir, s, entry("snow_started"), w.env).accepted);
  w.dir.release(s, s.dirEffect);
  assert.ok(F.live(w.dir, s, entry("fog_started", { id: "n1-2" }), w.env).accepted); // fog is not under snow's cooldown
  // a future kind: no cue, nothing drawn, ambience unchanged
  w.dir.release(s, s.dirEffect);
  const before = s.glass.names();
  assert.strictEqual(F.live(w.dir, s, entry("hail_started", { id: "n1-9" }), w.env).reason, "invalid-cue");
  assert.deepStrictEqual(s.glass.names(), before);
  assert.strictEqual(w.dir.offer(s, { id: "x", kind: "hail", origin: "house", presentation: "onset" }).reason, "no-recipe");
});

test("one onset per pass: current is the truth, a rain echo whose current flipped is dropped by its own stillTrue", () => {
  // rainy to snowy: the server sends only snow_started and rain has gone false in current
  const w = world(), s = w.slide();
  F.sync(w.dir, s, house({ rain: false, snow: true }), w.env);
  assert.deepStrictEqual(s.glass.names(), ["dir-frost"]);
  const r = F.enter(w.dir, s, [entry("rain_started", { id: "n1-1" }), entry("snow_started", { id: "n1-2" })], w.env);
  assert.ok(r.accepted, r.reason);
  assert.ok(s.glass.has("dir-frost-form") && !s.glass.has("dir-drop"));
});

// ---- the glass's animationend (F11) ----

// The card's listener, from the built text, run on a stub glass and a real director.
function listenerFor(w) {
  const m = src.match(/s\.glass\.addEventListener\("animationend", (\(e\) => \{[\s\S]*?\n    \})\);/);
  assert.ok(m, "the glass listener");
  const make = vm.runInNewContext(`(function (s, self) { return ${m[1].replace(/this\./g, "self.")}; })`, {});
  return (s) => make(s, { _director: w.dir });
}

test("F11: only the glass's own dir-glass-life releases; an ambience or layer animation ending (or bubbling) does not", () => {
  const w = world(), s = w.slide();
  F.sync(w.dir, s, house({ snow: true }), w.env);
  assert.ok(F.live(w.dir, s, entry("snow_started"), w.env).accepted);
  const onEnd = listenerFor(w)(s);
  onEnd({ target: s.glass, animationName: "dir-layer-in" }); // a layer's, bubbled: the lease keeps running
  onEnd({ target: {}, animationName: "dir-glass-life" }); // a child element
  onEnd({ target: s.glass, animationName: "pulse-something" }); // not ours
  assert.ok(s.glass.has("dir-frost-form"), "still running");
  onEnd({ target: s.glass, animationName: "dir-glass-life" });
  assert.ok(!s.glass.has("dir-frost-form"), "released by its own clock");
});

test("F11: the glass's animationend never releases a running rim cue (they are different elements and names)", () => {
  const w = world(), s = w.slide();
  F.sync(w.dir, s, house({ rain: true }), w.env);
  assert.ok(F.rim(w.dir, s, "feed", "rim-1", w.env).accepted);
  assert.ok(s.rim.has("dir-feed"));
  const onEnd = listenerFor(w)(s);
  // an ambience animation finishing on the glass (a transition's twin, a frost layer) while the rim cue runs
  onEnd({ target: s.glass, animationName: "dir-layer-in" });
  onEnd({ target: s.glass, animationName: "dir-run" });
  assert.ok(s.rim.has("dir-feed"), "the rim cue still runs");
});

test("a recipe's start clears its whole layer's onset set (CLASSES_BY_LAYER), and the rim's its own", () => {
  const w = world(), s = w.slide();
  for (const c of F.CLASSES_BY_LAYER.glass) s.glass.classList.add(c);
  F.sync(w.dir, s, house({ wind: true }), w.env);
  assert.ok(F.live(w.dir, s, entry("wind_started"), w.env).accepted);
  assert.deepStrictEqual(s.glass.names(), ["dir-wind", "dir-wind-gust"]);
  for (const c of F.CLASSES_BY_LAYER.rim) s.rim.classList.add(c);
  assert.ok(F.rim(w.dir, s, "play", "rim-2", w.env).accepted);
  assert.deepStrictEqual(s.rim.names(), ["dir-play"]);
});

// ---- CLASSES_BY_LAYER against style.js ----

const css = src.slice(src.indexOf("  @supports (width: round(1px, 1px)) {\n    .hw.glass {"), src.indexOf("  /* The rim cues (device-alive 3C"));
const rimStart = src.indexOf("  /* The rim cues (device-alive 3C");
const rimCss = src.slice(rimStart, src.indexOf("@media (prefers-reduced-motion: reduce) { .hw.rim", rimStart));
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = (t) => [...strip(t).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);

test("CLASSES_BY_LAYER: every .hw.glass.dir-* and .hw.rim.dir-* class in style.js has an owner, and every owner is used", () => {
  const glassUsed = new Set([...strip(css).matchAll(/\.hw\.glass((?:\.dir-[a-z-]+)+)/g)].flatMap((m) => m[1].split(".").filter(Boolean)));
  const rimUsed = new Set([...strip(rimCss).matchAll(/\.hw\.rim((?:\.dir-[a-z-]+)+)/g)].flatMap((m) => m[1].split(".").filter(Boolean)));
  const glassOwned = new Set([...F.CLASSES_BY_LAYER.glass, ...F.CLASSES_BY_LAYER.ambient]);
  assert.deepStrictEqual([...glassUsed].filter((c) => !glassOwned.has(c)), [], "a glass class with no owner");
  assert.deepStrictEqual([...glassOwned].filter((c) => !glassUsed.has(c)), [], "an owner with no glass rule");
  assert.deepStrictEqual([...rimUsed].filter((c) => !F.CLASSES_BY_LAYER.rim.includes(c)), [], "a rim class with no owner");
  assert.deepStrictEqual(plain(F.CLASSES_BY_LAYER.rim.filter((c) => !rimUsed.has(c))), [], "an owner with no rim rule");
  // no class twice, across the glass's two sets
  assert.strictEqual(glassOwned.size, F.CLASSES_BY_LAYER.glass.length + F.CLASSES_BY_LAYER.ambient.length);
  assert.strictEqual(new Set(F.CLASSES_BY_LAYER.glass).size, F.CLASSES_BY_LAYER.glass.length);
});

test("the table's classes are the ones the CSS animates: each onset class has a lease clock on the glass", () => {
  for (const k of KEYS) for (const c of [F.WEATHER[k].start, F.WEATHER[k].end]) {
    const own = rules(css).filter(([sel, body]) => new RegExp(`(^|,\\s*)\\.hw\\.glass\\.${c}(\\s*,|$)`).test(sel) && /animation:\s*dir-glass-life [\d.]+s linear both/.test(body));
    assert.ok(own.length >= 1, `${c} carries dir-glass-life on the glass`);
  }
});

// ---- the CSS: ambience is still, layers never repeat, the storm is not a flash ----

test("ambience is a transition or a custom property on a persistent class, never an animation (F11)", () => {
  for (const [sel, body] of rules(css)) {
    const ambient = F.CLASSES_BY_LAYER.ambient.some((c) => new RegExp(`\\.${c}(?![a-z-])`).test(sel)) && !/-(form|in|out|gust|die)\b/.test(sel);
    if (ambient) assert.doesNotMatch(body, /animation\s*:/, sel);
  }
  assert.match(css, /\.hw\.glass b \{[^}]*transition: opacity \.8s ease-out;/);
});

test("no glass animation repeats (a finite one-shot), and it is a dir- name", () => {
  for (const [, body] of rules(css)) for (const m of body.matchAll(/animation:\s*([^;]+);/g)) {
    assert.doesNotMatch(m[1], /infinite/);
    assert.match(m[1], /^dir-/);
  }
});

const keyframes = (name) => {
  const m = strip(css).match(new RegExp(`@keyframes ${name} \\{((?:[^{}]*\\{[^{}]*\\})+)\\s*\\}`));
  assert.ok(m, `@keyframes ${name}`);
  return [...m[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, stops, body]) => {
    const o = body.match(/opacity:\s*([\d.]+)/);
    return stops.split(",").map((s) => ({ at: s.trim() === "from" ? 0 : s.trim() === "to" ? 100 : parseFloat(s), opacity: o ? parseFloat(o[1]) : null }));
  }).sort((a, b) => a.at - b.at);
};

test("the storm is not a flash: the shiver's wobble stays under .2, no stop is closer than a quarter second, nothing repeats", () => {
  // the storm rules: every rule that names dir-storm
  const storm = rules(css).filter(([sel]) => /dir-storm/.test(sel));
  assert.ok(storm.length >= 4);
  const durations = [];
  for (const [sel, body] of storm) {
    assert.doesNotMatch(body, /infinite|animation-iteration-count:\s*(?!1\b)/, sel);
    for (const m of body.matchAll(/(?:animation:\s*[a-z-]+\s+|animation-duration:\s*)([\d.]+)s/g)) durations.push(parseFloat(m[1]));
  }
  assert.ok(durations.length >= 4 && Math.min(...durations) >= 1.8, `storm durations ${durations}`);
  const shortest = Math.min(...durations);
  const stops = keyframes("dir-storm-shiver");
  for (let i = 1; i < stops.length; i += 1) {
    const secs = ((stops[i].at - stops[i - 1].at) / 100) * shortest;
    assert.ok(secs >= 0.25, `stops ${stops[i - 1].at}-${stops[i].at}% last ${secs.toFixed(2)} s: over 2 Hz`);
  }
  // the wobble: the opacity that goes back down, between a rise and the next rise
  let worst = 0;
  for (let i = 1; i < stops.length; i += 1) if (stops[i].opacity < stops[i - 1].opacity) worst = Math.max(worst, stops[i - 1].opacity - stops[i].opacity);
  assert.ok(worst > 0 && worst < 0.2, `the dip is ${worst}`);
  // and the tint itself is soft: the layer's own alpha is at most .4
  const tint = rules(css).find(([sel, body]) => /b:nth-child\(3\)$/.test(sel) && /background/.test(body));
  for (const a of tint[1].matchAll(/rgba\([^)]*,\s*([\d.]+)\)/g)) assert.ok(parseFloat(a[1]) <= 0.4);
  // no CSS animation on the glass ever runs above 3 Hz: every glass duration is at least .6 s
  for (const [, body] of rules(css)) for (const m of body.matchAll(/animation(?:-duration)?:\s*(?:[a-z-]+\s+)?([\d.]+)s/g)) assert.ok(parseFloat(m[1]) >= 0.6, body);
});

test("reduced motion keeps every still look: nothing in the reduced-motion block hides an ambience class", () => {
  const block = css.match(/@media \(prefers-reduced-motion: reduce\) \{([^}]*\{[^}]*\})+\s*\}/);
  assert.ok(block);
  for (const c of F.CLASSES_BY_LAYER.ambient) assert.ok(!block[0].includes(c), c);
  assert.match(block[0], /dir-drop::after, \.hw\.glass\.dir-clear::before \{ display: none; \}/);
});

test("no glass rule touches a .pet, .cap, .toy or a fx- class", () => {
  for (const [sel] of rules(css)) assert.doesNotMatch(sel, /\.pet|\.cap|\.toy|\.device\b|fx-/, sel);
});

// ---- the moon (FM11): client-computed, a static halo, no wire ----

const day = (y, m, d, h = 12) => Date.UTC(y, m - 1, d, h);

test("moonOf: the full and the new days, from the clock alone", () => {
  assert.strictEqual(F.moonOf(Date.UTC(2000, 0, 6, 18, 14)), "new"); // the epoch
  assert.strictEqual(F.moonOf(day(2024, 1, 11)), "new"); // new moon 2024-01-11 ~11:57 UTC
  assert.strictEqual(F.moonOf(day(2024, 1, 25, 18)), "full"); // full moon 2024-01-25 ~17:54 UTC
  assert.strictEqual(F.moonOf(day(2026, 11, 24)), "full"); // 2026-11-24 ~14:53 UTC (a known full moon)
  assert.strictEqual(F.moonOf(day(2024, 1, 18)), ""); // a quarter
  assert.strictEqual(F.moonOf(NaN), "");
  assert.strictEqual(F.moonOf(undefined), "");
  // over a year about 12 or 13 of each, about 2.4 days wide
  let full = 0, nw = 0;
  for (let i = 0; i < 365; i += 1) { const p = F.moonOf(day(2025, 1, 1) + i * 864e5); if (p === "full") full += 1; if (p === "new") nw += 1; }
  assert.ok(full >= 25 && full <= 35 && nw >= 25 && nw <= 35, `${full} full days, ${nw} new days`);
});

test("the moon is painted from env.now alone: a halo class, static, switch off draws nothing, no wire needed", () => {
  const w = world(), s = w.slide();
  w.env.now = day(2024, 1, 25, 18);
  F.sync(w.dir, s, {}, w.env); // a house with no device_fx at all
  assert.deepStrictEqual(s.glass.names(), ["dir-moon"]);
  w.env.now = day(2024, 1, 11);
  F.sync(w.dir, s, {}, w.env);
  assert.deepStrictEqual(s.glass.names(), ["dir-newmoon"]);
  w.env.now = day(2024, 1, 18);
  F.sync(w.dir, s, {}, w.env);
  assert.deepStrictEqual(s.glass.names(), []);
  w.env.now = day(2024, 1, 25, 18);
  w.env.lcdOn = false;
  F.sync(w.dir, s, {}, w.env);
  assert.deepStrictEqual(s.glass.names(), []);
  // it works under reduced motion (still) and has no onset, no echo, no cue kind
  w.env.lcdOn = true;
  w.env.calm = true;
  F.sync(w.dir, s, {}, w.env);
  assert.deepStrictEqual(s.glass.names(), ["dir-moon"]);
  assert.ok(!("moon" in F.RECIPES) && !Object.keys(F.KINDS).some((k) => /moon/.test(k)));
  assert.ok(!KEYS.includes("moon"), "the moon is not a key of the map");
});

test("the moon sits beside weather: a rainy full moon is both", () => {
  const w = world(), s = w.slide();
  w.env.now = day(2024, 1, 25, 18);
  F.sync(w.dir, s, house({ rain: true }), w.env);
  assert.deepStrictEqual(s.glass.names(), ["dir-moon", "dir-wet"]);
});

test("the card hands the part the server's now, and the markup has the five layers", () => {
  assert.match(src, /return \{ lcdOn: lcdOn\(\), calm: calm\(\), clockKnown: serverClockKnown\(\), now: serverNow\(\) \};/);
  assert.match(src, /<i class="hw glass" aria-hidden="true"><b><\/b><b><\/b><b><\/b><b><\/b><b><\/b><\/i>/);
  // _forget clears every glass class, the ambient set too
  assert.match(src, /s\.glass\?\.classList\.remove\(\.\.\.HATCH_DEVICE_FX\.CLASSES_BY_LAYER\.ambient, \.\.\.HATCH_DEVICE_FX\.CLASSES\);/);
});

// ---- what 4D needs from the adapter (plan 6.6c, F16): a moment-driven entry point beside rim ----

test("offerMoment: the entry point exists with the rim's gates; the 4B table is empty, so every moment has no cue yet", () => {
  assert.strictEqual(typeof F.offerMoment, "function");
  assert.deepStrictEqual(Object.keys(F.HOUSE_RIM), []);
  const w = world(), s = w.slide();
  assert.strictEqual(F.offerMoment(w.dir, s, "doorbell_live", "m-1", w.env).reason, "no-cue");
  assert.strictEqual(F.offerMoment(w.dir, s, "__proto__", "m-2", w.env).reason, "no-cue");
  assert.deepStrictEqual(s.rim.names(), []);
});

test("offerMoment with a house row (a stand-in table in a fresh realm): house origin, house priority, calm and a scene refuse it, no clock gate", () => {
  const c2 = { Date, Object, Array, Number, Math, JSON };
  const patched = part.replace("const HOUSE_RIM = Object.freeze({});",
    'const HOUSE_RIM = Object.freeze({ doorbell_live: Object.freeze({ kind: "rimBell", cls: "dir-bell", ms: 900, cooldownMs: 5000 }) });');
  assert.notStrictEqual(patched, part);
  vm.runInNewContext(`${director}\n${patched}\nthis.D = HATCH_DIRECTOR; this.F = HATCH_DEVICE_FX;`, c2);
  const { D: D2, F: F2 } = c2;
  assert.ok(F2.CLASSES_BY_LAYER.rim.includes("dir-bell"), "the house class is in the rim layer's set");
  assert.strictEqual(F2.RECIPES.rimBell.priority, D2.PRIORITY.house);
  assert.strictEqual(F2.RECIPES.rimBell.cooldownMs, 5000);
  assert.strictEqual(F2.RECIPES.rimFeed.priority, D2.PRIORITY.care, "a press stays over a house cue");
  const t = { v: T0 };
  const dir = D2.create({ now: () => t.v, deviceNow: () => t.v, trusted: () => false, canRender: () => true, schedule: () => () => {}, recipes: F2.RECIPES });
  const mk = () => ({ glass: glassOf(), rim: glassOf() });
  const env = { lcdOn: true, calm: false, clockKnown: false }; // an unknown clock does not matter for a moment
  const s = mk();
  const r = F2.offerMoment(dir, s, "doorbell_live", "m-1", env);
  assert.ok(r.accepted, r.reason);
  assert.deepStrictEqual(s.rim.names(), ["dir-bell"]);
  assert.strictEqual(F2.offerMoment(dir, mk(), "doorbell_live", "m-2", { ...env, calm: true }).reason, "calm");
  assert.deepStrictEqual(Object.keys(F2.RIM), Object.keys(F.RIM), "offerMoment adds no user rows");
});
