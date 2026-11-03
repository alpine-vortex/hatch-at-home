// The device-alive director (src/card/interaction-director.js, plan 2026-11-03 sections
// 5.2-5.3, slice 1 acceptance a-f): node --test tests/js. The part is run on its own, as the
// card loads it, and in the built card's text, so a part out of the manifest shows here.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const part = fs.readFileSync(path.join(ROOT, "src", "card", "interaction-director.js"), "utf8");
const ctx = {};
// A top-level const is not on the context: hand it out at the end.
vm.runInNewContext(`${part}\nthis.HATCH_DIRECTOR = HATCH_DIRECTOR;`, ctx);
const D = ctx.HATCH_DIRECTOR;
// The part runs in its own realm, so its errors and objects are not this realm's: match by name.
const typeError = (e) => e.name === "TypeError";

// ---- a fake world: a clock, a timer that fires only when told, and recipes that log ----

function world(over = {}) {
  const w = { t: 1000000, timers: [], log: [], render: true, trust: true };
  w.schedule = (ms, fn) => {
    const timer = { at: w.t + ms, fn, live: true };
    w.timers.push(timer);
    return () => {
      timer.live = false;
    };
  };
  // Fires every live timer due by `to`, oldest first, and moves the clock there.
  w.advance = (to) => {
    for (const timer of w.timers.filter((x) => x.live && x.at <= to).sort((a, b) => a.at - b.at)) {
      timer.live = false;
      timer.fn();
    }
    w.t = to;
  };
  // Fires a timer as a late callback would, cancelled or not (a stale one the card kept).
  w.fireAll = () => w.timers.forEach((x) => x.fn());
  const rec = (name, r) => ({
    durationMs: 1000,
    start: (s, e) => w.log.push(`start ${name} ${e.id}`),
    dispose: (s, e, why, reason) => w.log.push(`dispose ${name} ${e.id} ${why}${reason ? `:${reason}` : ""}`),
    ...r,
  });
  const recipes = over.recipes || {
    rain: rec("rain", { track: "shellImpulse", priority: D.PRIORITY.house, collapseKey: "rain", cooldownMs: 5000, echoRank: 20 }),
    rainEnd: rec("rainEnd", { track: "shellImpulse", priority: D.PRIORITY.house, collapseKey: "rain" }),
    bell: rec("bell", { track: "shellImpulse", priority: D.PRIORITY.house + 1, echoRank: 1 }),
    glance: rec("glance", { track: "petBody", priority: D.PRIORITY.house }),
    scene: rec("scene", { track: "petBody", priority: D.PRIORITY.care }),
    morph: rec("morph", { track: "screenFx", priority: D.PRIORITY.echo }),
    press: rec("press", { track: "control", priority: D.PRIORITY.input, durationMs: 200 }),
  };
  w.dir = D.create({
    now: () => w.t,
    trusted: () => w.trust,
    canRender: () => w.render,
    schedule: w.schedule,
    recipes,
  });
  return w;
}
const slideOf = (over = {}) => ({ species: "cat", ...over });
let n = 0;
const cue = (kind, over = {}) => ({ id: `c${++n}`, kind, origin: "house", presentation: "onset", ...over });

// ---- acceptance d, c: the part's load order and its purity ----

test("the part is in the built card, before the class chain", () => {
  const src = require("./card-source");
  const at = src.indexOf("const HATCH_DIRECTOR = Object.freeze(");
  assert.ok(at > 0);
  assert.ok(at < src.indexOf("class HatchPetCardBase"));
});

test("one frozen namespace, no loose globals", () => {
  const names = Object.keys(vm.runInNewContext(`${part}\nthis`, {}));
  assert.deepStrictEqual(names, []);
  const tops = part.match(/^(?:const|let|var|function|class|async)\b[^\n]*/gm);
  assert.deepStrictEqual(tops, ["const HATCH_DIRECTOR = Object.freeze("]);
  assert.ok(Object.isFrozen(D));
  assert.ok(Object.isFrozen(D.BUSY_OWNERS));
  assert.ok(D.BUSY_OWNERS.every((o) => Object.isFrozen(o)));
  assert.ok(Object.isFrozen(world().dir));
});

test("the part names no document, window, this, Date, setTimeout, setInterval or localStorage", () => {
  const code = part.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
  for (const word of ["document", "window", "this", "Date", "setTimeout", "setInterval", "localStorage"]) {
    assert.ok(!new RegExp(`\\b${word}\\b`).test(code), `the part names ${word}`);
  }
});

// ---- acceptance b: the busy list is complete ----

const NOT_BUSY = {
  species: "a trait, not an owner",
  moodState: "a mood the idle gate tests, not an owner",
  propUntil: "a timer for a prop; the body gate reads it, the director need not",
  flairUntil: "a timer for flair, which the director's own recipes replace",
  movingUntil: "a timer for a move, which the pet body track covers",
  pet: "an element",
  screen: "an element",
};
const fieldsOf = (fn) => [...String(fn).matchAll(/\bs\.(\w+)/g)].map((m) => m[1]);
const busyFields = new Set(D.BUSY_OWNERS.flatMap((o) => fieldsOf(o.busy)));

function methodBody(src, name) {
  const start = src.search(new RegExp(`^  ${name}\\(s[,)]`, "m"));
  assert.ok(start >= 0, `${name} is in the card`);
  const end = src.indexOf("\n  }\n", start);
  return src.slice(start, end);
}

test("every slide field _freeBody and _ghosting test is a busy owner or classed as not one", () => {
  const src = require("./card-source");
  for (const method of ["_freeBody", "_ghosting"]) {
    const fields = [...new Set([...methodBody(src, method).matchAll(/\bs\.(\w+)/g)].map((m) => m[1]))];
    assert.ok(fields.length >= 3 && fields.includes("scene") && fields.includes("linking"), `${method} was read`);
    for (const f of fields) {
      assert.ok(busyFields.has(f) || f in NOT_BUSY, `${method} tests s.${f}: add it to BUSY_OWNERS or to NOT_BUSY with a reason`);
    }
  }
  for (const [f, why] of Object.entries(NOT_BUSY)) {
    assert.ok(why.length > 5, `NOT_BUSY ${f} has a reason`);
    assert.ok(!busyFields.has(f), `${f} is in both lists`);
  }
});

test("every BUSY_OWNERS field is assigned somewhere in src/card (a rename leaves no dead read)", () => {
  const dir = path.join(ROOT, "src", "card");
  const all = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js") && f !== "interaction-director.js")
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
    .join("\n");
  // statusOpen has no setter until slice 3's adapter (_toggleStatus); the table test sets it by hand.
  const NO_SETTER_YET = new Set(["statusOpen"]);
  for (const f of busyFields) {
    if (NO_SETTER_YET.has(f)) {
      assert.ok(!new RegExp(`\\.${f}\\s*=[^=]`).test(all), `${f} has a setter now: drop it from NO_SETTER_YET`);
      continue;
    }
    assert.ok(new RegExp(`\\.${f}\\s*=[^=]`).test(all), `no src/card part assigns .${f}`);
  }
});

test("isBusy: each owner alone makes the slide busy, none makes it free", () => {
  const NOW = 5000;
  const on = {
    game: { game: "hop" }, scene: { scene: {} }, power: { power: {} }, powerPending: { powerPending: true },
    visitor: { visitor: {} }, asking: { asking: true }, laySheet: { laySheet: {} }, picker: { picker: {} },
    linking: { linking: true }, calling: { calling: true }, asleep: { asleep: true },
    pose: { poseUntil: NOW + 1 }, status: { statusOpen: true },
  };
  assert.deepStrictEqual(Object.keys(on).sort(), [...D.BUSY_OWNERS.map((o) => o.name)].sort(), "one case per owner");
  const free = { species: "cat", moodState: "content", poseUntil: NOW, asking: false, screen: {}, pet: {} };
  assert.strictEqual(D.isBusy(free, NOW), false);
  assert.strictEqual(D.isBusy({}, NOW), false);
  for (const [name, fields] of Object.entries(on)) {
    assert.strictEqual(D.isBusy({ ...free, ...fields }, NOW), true, `${name} alone`);
    assert.deepStrictEqual([...D.busyOwners({ ...free, ...fields }, NOW)], [name]);
  }
  // an expired pose and a plain question (s.ask is the question itself, not the flag) are free
  assert.strictEqual(D.isBusy({ ...free, poseUntil: NOW - 1, ask: { q: 1 } }, NOW), false);
  const w = world();
  assert.strictEqual(w.dir.isBusy(slideOf({ scene: {} })), true);
});

// ---- acceptance a: the director's methods ----

test("create refuses what it cannot run without, and a malformed recipe", () => {
  assert.throws(() => D.create({}), typeError);
  assert.throws(() => D.create({ now: () => 0 }), typeError);
  const ok = { now: () => 0, schedule: () => () => {} };
  assert.throws(() => D.create({ ...ok, recipes: { x: { track: "text", priority: 1, durationMs: 1 } } }), /track/);
  assert.throws(() => D.create({ ...ok, recipes: { x: { track: "shellAmbient", priority: 1, durationMs: 1 } } }), /track/);
  assert.throws(() => D.create({ ...ok, recipes: { x: { track: "petBody", priority: 1, durationMs: 0 } } }), /durationMs/);
  assert.throws(() => D.create({ ...ok, recipes: { x: { track: "petBody", priority: "hi", durationMs: 1 } } }), /priority/);
  assert.doesNotThrow(() => D.create(ok));
  assert.throws(() => world().dir.setAmbient("not-a-slide", {}), typeError);
});

test("offer: a bad cue, an unknown kind and an ambient presentation are refused", () => {
  const w = world();
  const s = slideOf();
  assert.strictEqual(w.dir.offer(s, null).reason, "invalid-cue");
  assert.strictEqual(w.dir.offer(s, { id: "x", kind: "rain", origin: "sky", presentation: "onset" }).reason, "invalid-cue");
  assert.strictEqual(w.dir.offer(s, cue("meteor")).reason, "no-recipe");
  assert.strictEqual(w.dir.offer(s, cue("rain", { presentation: "ambient" })).reason, "use-setAmbient");
  assert.strictEqual(w.dir.offer(s, cue("rain", { data: "css" })).reason, "invalid-cue");
  assert.deepStrictEqual(w.log, []);
});

test("track exclusivity: one effect per track; a higher priority replaces, an equal one does not on petBody", () => {
  const w = world();
  const s = slideOf();
  const a = w.dir.offer(s, cue("glance"));
  assert.ok(a.accepted);
  const b = w.dir.offer(s, cue("glance"));
  assert.deepStrictEqual([b.accepted, b.reason, b.effectId], [false, "track-busy", a.effectId]);
  const c = w.dir.offer(s, cue("scene"));
  assert.ok(c.accepted);
  assert.ok(w.log.includes(`start glance ${a.effectId}`));
  assert.ok(w.log.some((l) => l.startsWith(`dispose glance ${a.effectId} replaced`)));
  assert.ok(w.log.includes(`start scene ${c.effectId}`));
  assert.strictEqual(w.dir.inspect(s).tracks.petBody.id, c.effectId);
  // a lower one is dropped, not queued
  const d = w.dir.offer(s, cue("glance"));
  assert.strictEqual(d.reason, "track-busy");
  w.advance(w.t + 5000);
  assert.strictEqual(w.dir.inspect(s).tracks.petBody, undefined);
  assert.strictEqual(w.log.filter((l) => l.startsWith("start glance")).length, 1);
});

test("shellImpulse: the latest compatible event replaces an equal one; tracks do not block each other", () => {
  const w = world();
  const s = slideOf();
  const a = w.dir.offer(s, cue("bell"));
  const b = w.dir.offer(s, cue("bell"));
  assert.ok(a.accepted && b.accepted);
  assert.notStrictEqual(a.effectId, b.effectId);
  assert.ok(w.log.some((l) => l.startsWith(`dispose bell ${a.effectId} replaced`)));
  // a lower shell pulse does not replace a higher one
  const c = w.dir.offer(s, cue("rain"));
  assert.strictEqual(c.reason, "track-busy");
  // a pet look and a cap press sit beside the pulse
  assert.ok(w.dir.offer(s, cue("glance")).accepted);
  assert.ok(w.dir.offer(s, cue("press", { origin: "user", presentation: "interaction" })).accepted);
  assert.deepStrictEqual(Object.keys(w.dir.inspect(s).tracks).sort(), ["control", "petBody", "shellImpulse"]);
});

test("a busy body drops petBody and screenFx, never a shell pulse or a cap", () => {
  const w = world();
  const s = slideOf({ game: { name: "hop" } });
  assert.strictEqual(w.dir.offer(s, cue("glance")).reason, "busy");
  assert.strictEqual(w.dir.offer(s, cue("morph")).reason, "busy");
  assert.ok(w.dir.offer(s, cue("bell")).accepted);
  assert.ok(w.dir.offer(s, cue("press", { origin: "user", presentation: "interaction" })).accepted);
  s.game = null;
  assert.ok(w.dir.offer(s, cue("glance")).accepted);
});

test("generation tokens: an old timer or animationend cannot clear a newer effect", () => {
  const w = world();
  const s = slideOf();
  const a = w.dir.offer(s, cue("bell"));
  const b = w.dir.offer(s, cue("bell"));
  assert.notStrictEqual(a.effectId, b.effectId);
  w.fireAll(); // every watchdog, even the cancelled one for `a`, fires late
  // a's watchdog was cancelled with its effect; b's fired and ended b: nothing else was touched
  assert.deepStrictEqual(w.log.filter((l) => l.startsWith("dispose")).map((l) => l.split(" ").slice(0, 3).join(" ")), [
    `dispose bell ${a.effectId}`, `dispose bell ${b.effectId}`,
  ]);
  // now: a stale token on a fresh effect is a no-op
  const c = w.dir.offer(s, cue("bell"));
  assert.strictEqual(w.dir.release(s, a.effectId), false);
  assert.strictEqual(w.dir.release(s, b.effectId), false);
  assert.ok(w.dir.inspect(s).tracks.shellImpulse.id === c.effectId);
  assert.strictEqual(w.dir.release(s, c.effectId), true);
  assert.strictEqual(w.dir.release(s, c.effectId), false, "once");
  assert.strictEqual(w.dir.inspect(s).tracks.shellImpulse, undefined);
});

test("the watchdog ends an effect whose animationend never came, and is cancelled with the effect", () => {
  const w = world();
  const s = slideOf();
  const a = w.dir.offer(s, cue("press", { origin: "user", presentation: "interaction" }));
  assert.ok(a.accepted);
  w.advance(w.t + 200); // the duration alone is not the watchdog; tick is
  assert.ok(w.dir.inspect(s).tracks.control);
  w.advance(w.t + D.WATCHDOG_MS);
  assert.strictEqual(w.dir.inspect(s).tracks.control, undefined);
  assert.ok(w.log.some((l) => l === `dispose press ${a.effectId} watchdog`));
  // an effect released early leaves no live timer behind
  const b = w.dir.offer(s, cue("press", { origin: "user", presentation: "interaction" }));
  w.dir.release(s, b.effectId);
  assert.ok(w.timers.filter((x) => x.live).length === 0);
});

test("once-only by cue id: a repeat is a duplicate, also after the effect ended", () => {
  const w = world();
  const s = slideOf();
  const c = cue("bell");
  assert.ok(w.dir.offer(s, c).accepted);
  assert.strictEqual(w.dir.offer(s, c).reason, "duplicate");
  w.advance(w.t + 5000);
  w.dir.tick(w.t);
  assert.strictEqual(w.dir.offer(s, c).reason, "duplicate");
  // a dropped cue is decided too: it is not owed later
  const x = cue("glance");
  const t = slideOf({ game: {} });
  assert.strictEqual(w.dir.offer(t, x).reason, "busy");
  t.game = null;
  assert.strictEqual(w.dir.offer(t, x).reason, "duplicate");
  // the memory is bounded
  for (let i = 0; i < D.SEEN_MAX + 40; i++) w.dir.offer(s, cue("meteor", { id: `m${i}` }));
  const many = slideOf();
  for (let i = 0; i < D.SEEN_MAX + 40; i++) w.dir.offer(many, { ...cue("bell"), id: `b${i}` });
  assert.strictEqual(w.dir.inspect(many).seen, D.SEEN_MAX);
});

test("TTL: a cue past its ttl is expired; an effect ends on the injected clock via tick", () => {
  const w = world();
  const s = slideOf();
  assert.strictEqual(w.dir.offer(s, cue("bell", { occurredAt: w.t - 5000, ttlMs: 4000 })).reason, "expired");
  const a = w.dir.offer(s, cue("bell", { occurredAt: w.t - 1000, ttlMs: 4000 }));
  assert.ok(a.accepted);
  assert.strictEqual(w.dir.tick(w.t + 999), 0);
  assert.ok(w.dir.inspect(s).tracks.shellImpulse);
  assert.strictEqual(w.dir.tick(w.t + 1000), 1);
  assert.strictEqual(w.dir.inspect(s).tracks.shellImpulse, undefined);
  assert.ok(w.log.includes(`dispose bell ${a.effectId} expired`));
  assert.strictEqual(w.dir.tick(w.t + 9999), 0);
  // tick with no argument asks the clock
  const b = w.dir.offer(s, cue("press", { origin: "user", presentation: "interaction" }));
  w.t += 200;
  assert.strictEqual(w.dir.tick(), 1);
  assert.ok(w.log.includes(`dispose press ${b.effectId} expired`));
});

test("cooldown: the same cooldown key is quiet for its time, per slide", () => {
  const w = world();
  const s = slideOf();
  assert.ok(w.dir.offer(s, cue("rain")).accepted);
  w.dir.tick(w.t + 1000);
  assert.strictEqual(w.dir.offer(s, cue("rain")).reason, "cooldown");
  assert.ok(w.dir.offer(slideOf(), cue("rain")).accepted, "another slide has its own");
  w.t += 5000;
  assert.ok(w.dir.offer(s, cue("rain")).accepted);
});

test("opposite transitions collapse: an end meeting its own running start leaves nothing", () => {
  const w = world();
  const s = slideOf();
  const a = w.dir.offer(s, cue("rain", { direction: "start" }));
  assert.ok(a.accepted);
  const b = w.dir.offer(s, cue("rainEnd", { direction: "end" }));
  assert.deepStrictEqual([b.accepted, b.reason, b.effectId], [false, "collapsed", a.effectId]);
  assert.strictEqual(w.dir.inspect(s).tracks.shellImpulse, undefined);
  assert.ok(w.log.some((l) => l.startsWith(`dispose rain ${a.effectId} collapsed`)));
  // the same direction twice is a replace, not a collapse
  const w2 = world();
  const t = slideOf();
  assert.ok(w2.dir.offer(t, cue("rain", { direction: "start" })).accepted);
  assert.ok(w2.dir.offer(t, cue("rainEnd", { direction: "start" })).accepted);
  // a start after the end has finished is its own pulse
  const w3 = world();
  const u = slideOf();
  w3.dir.offer(u, cue("rain", { direction: "start" }));
  w3.dir.tick(w3.t + 1000);
  assert.ok(w3.dir.offer(u, cue("rainEnd", { direction: "end" })).accepted);
});

test("cancel: named tracks only, all leased tracks by default, never the ambient state", () => {
  const w = world();
  const s = slideOf();
  w.dir.setAmbient(s, { rain: true });
  w.dir.offer(s, cue("bell"));
  w.dir.offer(s, cue("glance"));
  w.dir.offer(s, cue("press", { origin: "user", presentation: "interaction" }));
  assert.strictEqual(w.dir.cancel(s, "swipe", ["control", "text", "shellAmbient"]), 1);
  assert.deepStrictEqual(Object.keys(w.dir.inspect(s).tracks).sort(), ["petBody", "shellImpulse"]);
  assert.ok(w.log.some((l) => /^dispose press \d+ cancel:swipe$/.test(l)));
  assert.strictEqual(w.dir.cancel(s, "scene"), 2);
  assert.deepStrictEqual(Object.keys(w.dir.inspect(s).tracks), []);
  assert.deepStrictEqual({ ...w.dir.ambient(s) }, { rain: true });
  assert.strictEqual(w.dir.cancel(slideOf(), "never seen"), 0);
});

test("detach frees the slide: effects disposed, timers cancelled, state gone", () => {
  const w = world();
  const s = slideOf();
  const other = slideOf();
  w.dir.setAmbient(s, { rain: true });
  const a = w.dir.offer(s, cue("bell"));
  w.dir.offer(other, cue("bell"));
  w.dir.detach(s);
  assert.ok(w.log.includes(`dispose bell ${a.effectId} detach`));
  assert.strictEqual(w.dir.inspect(s), null);
  assert.strictEqual(w.timers.filter((x) => x.live).length, 1, "only the other slide's watchdog is left");
  assert.strictEqual(w.dir.release(s, a.effectId), false);
  assert.ok(w.dir.inspect(other).tracks.shellImpulse);
  assert.doesNotThrow(() => w.dir.detach(slideOf()));
  w.dir.detach(s); // twice is fine
  assert.deepStrictEqual({ ...w.dir.setAmbient(s, {}) }, { changed: false, render: true });
});

test("reset ends every effect on every slide and forgets them", () => {
  const w = world();
  const [s, t] = [slideOf(), slideOf()];
  const a = w.dir.offer(s, cue("bell"));
  const b = w.dir.offer(t, cue("glance"));
  w.dir.setAmbient(s, { night: true });
  w.dir.reset();
  assert.ok(w.log.includes(`dispose bell ${a.effectId} reset`));
  assert.ok(w.log.includes(`dispose glance ${b.effectId} reset`));
  assert.strictEqual(w.timers.filter((x) => x.live).length, 0);
  assert.strictEqual(w.dir.inspect(s), null);
  assert.deepStrictEqual({ ...w.dir.ambient(s) }, {});
  assert.ok(w.dir.offer(s, cue("bell")).accepted, "usable again");
});

test("a hook that throws does not leave the effect stuck", () => {
  const w = world({
    recipes: {
      bad: { track: "petBody", priority: 1, durationMs: 100, start: () => { throw new Error("x"); } },
      worse: { track: "shellImpulse", priority: 1, durationMs: 100, dispose: () => { throw new Error("y"); } },
    },
  });
  const s = slideOf();
  assert.strictEqual(w.dir.offer(s, cue("bad")).reason, "start-failed");
  assert.strictEqual(w.dir.inspect(s).tracks.petBody, undefined);
  assert.ok(w.dir.offer(s, cue("worse")).accepted);
  assert.strictEqual(w.dir.cancel(s, "x"), 1);
  assert.strictEqual(w.dir.inspect(s).tracks.shellImpulse, undefined);
});

test("setAmbient stores the state even when nothing may render, and reports a change", () => {
  const w = world();
  const s = slideOf();
  w.render = false;
  assert.deepStrictEqual({ ...w.dir.setAmbient(s, { rain: true, night: false }) }, { changed: true, render: false });
  assert.deepStrictEqual({ ...w.dir.ambient(s) }, { rain: true, night: false });
  assert.strictEqual(w.dir.setAmbient(s, { rain: true, night: false }).changed, false);
  w.render = true;
  assert.deepStrictEqual({ ...w.dir.setAmbient(s, { rain: true, night: true }) }, { changed: true, render: true });
  assert.ok(Object.isFrozen(w.dir.ambient(s)));
  const src = { rain: true };
  w.dir.setAmbient(s, src);
  src.rain = false;
  assert.strictEqual(w.dir.ambient(s).rain, true, "a copy, not the caller's object");
});

test("canRender false: no onset, no pulse, ambient kept; the best live onset is held as an echo", () => {
  const w = world();
  const s = slideOf();
  w.render = false;
  w.dir.setAmbient(s, { rain: true });
  const r = w.dir.offer(s, cue("rain", { occurredAt: w.t - 1000, data: { key: "rain", value: true } }));
  assert.deepStrictEqual([r.accepted, r.reason], [false, "cannot-render"]);
  assert.strictEqual(w.dir.offer(s, cue("press", { origin: "user", presentation: "interaction" })).reason, "cannot-render");
  assert.deepStrictEqual(w.log, []);
  assert.deepStrictEqual(Object.keys(w.dir.inspect(s).tracks), []);
  assert.deepStrictEqual({ ...w.dir.ambient(s) }, { rain: true });
  // the doorbell outranks the rain as the held candidate; only one is held
  const bell = cue("bell", { occurredAt: w.t - 500 });
  w.dir.offer(s, bell);
  assert.strictEqual(w.dir.inspect(s).pending, bell.id);
  w.dir.offer(s, cue("rain", { occurredAt: w.t - 100 }));
  assert.strictEqual(w.dir.inspect(s).pending, bell.id);
  // on show with rendering back: that one echo plays, shortened
  w.render = true;
  const e = w.dir.enterView(s, []);
  assert.ok(e.accepted);
  assert.strictEqual(w.dir.inspect(s).tracks.shellImpulse.expiresAt, w.t + 500);
  assert.strictEqual(w.dir.inspect(s).pending, null);
});

// ---- enterView ----

const echoWorld = () => {
  const w = world();
  const s = slideOf();
  w.dir.setAmbient(s, { rain: true, night: false });
  const recent = (kind, ago, over = {}) =>
    cue(kind, { presentation: "echo", occurredAt: w.t - ago, data: { key: "rain", value: true }, ...over });
  return { w, s, recent };
};

test("enterView: one echo, shortened, only inside the 90 s window and while the state still matches", () => {
  const { w, s, recent } = echoWorld();
  const fresh = recent("rain", 20000);
  const stale = recent("rain", D.ECHO_WINDOW_MS + 1);
  const gone = recent("rain", 10000, { data: { key: "rain", value: false } });
  const r = w.dir.enterView(s, [stale, gone, fresh], true);
  assert.ok(r.accepted);
  assert.strictEqual(w.dir.inspect(s).tracks.shellImpulse.expiresAt, w.t + 500, "half of 1000 ms");
  assert.ok(w.log.includes(`start rain ${r.effectId}`));
  // the same ring on a second view plays nothing: they are all decided
  w.dir.cancel(s, "next");
  w.t += 10000;
  assert.strictEqual(w.dir.enterView(s, [stale, gone, fresh], true).reason, "nothing-to-echo");
  assert.strictEqual(w.dir.offer(s, fresh).reason, "duplicate", "snapshot and delta share one dedup");
});

test("enterView: trusted false gives ambience only, and decides nothing", () => {
  const { w, s, recent } = echoWorld();
  const c = recent("rain", 20000);
  assert.strictEqual(w.dir.enterView(s, [c], false).reason, "untrusted");
  w.trust = false;
  assert.strictEqual(w.dir.enterView(s, [c]).reason, "untrusted", "the create-time clock check, called each time");
  assert.strictEqual(w.dir.enterView(s, [c], undefined).reason, "untrusted");
  assert.deepStrictEqual(w.log, []);
  assert.deepStrictEqual({ ...w.dir.ambient(s) }, { rain: true, night: false });
  w.trust = true;
  assert.ok(w.dir.enterView(s, [c]).accepted, "it was not spent");
  // unknown is untrusted
  const bare = D.create({ now: () => w.t, schedule: w.schedule, recipes: { rain: { track: "shellImpulse", priority: 1, durationMs: 10 } } });
  assert.strictEqual(bare.enterView(slideOf(), [c]).reason, "untrusted");
});

test("enterView: canRender false is ambience only; the echo stays possible", () => {
  const { w, s, recent } = echoWorld();
  const c = recent("rain", 20000);
  w.render = false;
  assert.strictEqual(w.dir.enterView(s, [c], true).reason, "cannot-render");
  w.render = true;
  assert.ok(w.dir.enterView(s, [c], true).accepted);
});

test("enterView: a busy body, a game, a scene or a user press leaves ambience only, and the echo is spent", () => {
  for (const busy of [{ game: {} }, { scene: {} }, { asking: true }, { statusOpen: true }]) {
    const { w, s, recent } = echoWorld();
    Object.assign(s, busy);
    const c = recent("rain", 20000);
    assert.strictEqual(w.dir.enterView(s, [c], true).reason, "busy", JSON.stringify(busy));
    assert.deepStrictEqual(w.log, []);
    assert.strictEqual(w.dir.offer(s, c).reason, "duplicate");
  }
  const { w, s, recent } = echoWorld();
  w.dir.offer(s, cue("press", { origin: "user", presentation: "interaction" }));
  assert.strictEqual(w.dir.enterView(s, [recent("rain", 1000)], true).reason, "user-action");
});

test("enterView: the best echo wins by rank, then recency; opposite pairs in the ring cancel", () => {
  const { w, s, recent } = echoWorld();
  const bell = recent("bell", 60000, { data: undefined });
  const rain = recent("rain", 1000);
  const r = w.dir.enterView(s, [rain, bell], true);
  assert.ok(r.accepted);
  assert.ok(w.log.includes(`start bell ${r.effectId}`), "doorbell outranks weather");

  const t = echoWorld();
  const start = t.recent("rain", 40000, { direction: "start" });
  const end = t.recent("rainEnd", 20000, { direction: "end", data: { key: "rain", value: true } });
  assert.strictEqual(t.w.dir.enterView(t.s, [end, start], true).reason, "nothing-to-echo", "started then ended: neither");
  const u = echoWorld();
  const a = u.recent("rain", 60000, { direction: "start" });
  const b = u.recent("rainEnd", 40000, { direction: "end" });
  const c = u.recent("rain", 10000, { direction: "start" });
  const got = u.w.dir.enterView(u.s, [a, b, c], true);
  assert.ok(got.accepted, "a later start stands");
  assert.strictEqual(u.w.dir.inspect(u.s).tracks.shellImpulse.id, got.effectId);
  assert.strictEqual(u.w.log.filter((l) => l.startsWith("start")).length, 1, "at most one echo");
});

test("enterView: a cue from the future or without a time is not an echo", () => {
  const { w, s, recent } = echoWorld();
  const ahead = recent("rain", -60000);
  const noTime = cue("rain", { presentation: "echo", data: { key: "rain", value: true } });
  assert.strictEqual(w.dir.enterView(s, [ahead, noTime, null, "x"], true).reason, "nothing-to-echo");
});
