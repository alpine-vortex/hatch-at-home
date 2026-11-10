// The director's ledger (docs/plan-2026-11-06-director-migration.md 1.3-1.5, slice 0): owned timers, keyed
// replacement, groups, a silent stop, an undo that runs only on a drain. L1-L20 and the adapter tests.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { world: cardWorld } = require("./timer_trace");

const ROOT = path.join(__dirname, "..", "..");
const part = fs.readFileSync(path.join(ROOT, "src", "card", "interaction-director.js"), "utf8");
const ctx = {};
vm.runInNewContext(`${part}\nthis.HATCH_DIRECTOR = HATCH_DIRECTOR;`, ctx);
const D = ctx.HATCH_DIRECTOR;
const typeError = (e) => e.name === "TypeError"; // another realm's TypeError

// A fake world: timers that fire when told, in due order then creation order; repeat and frame too.
function world({ recipes } = {}) {
  const w = { t: 0, server: 5000000, seq: 0, timers: [], log: [] };
  const arm = (kind, ms, fn) => {
    const x = { kind, at: w.t + ms, every: ms, fn, live: true, seq: ++w.seq };
    w.timers.push(x);
    return () => {
      x.live = false;
    };
  };
  w.schedule = (ms, fn) => arm("timeout", ms, fn);
  w.repeat = (ms, fn) => arm("interval", ms, fn);
  w.frame = (fn) => arm("frame", 16, fn);
  w.advance = (ms) => {
    const to = w.t + ms;
    for (;;) {
      const due = w.timers.filter((x) => x.live && x.at <= to).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!due) break;
      w.t = due.at;
      if (due.kind === "interval") {
        due.at += due.every;
        due.seq = ++w.seq;
      } else due.live = false;
      due.fn(w.t);
    }
    w.t = to;
  };
  w.live = () => w.timers.filter((x) => x.live).length;
  w.dir = D.create({
    now: () => w.server, deviceNow: () => w.t, trusted: () => true, canRender: () => true,
    schedule: w.schedule, repeat: w.repeat, frame: w.frame,
    recipes: recipes || {
      glance: { track: "petBody", priority: 4, durationMs: 1000, dispose: (s, e, why) => w.log.push(`dispose ${why}`) },
    },
  });
  w.note = (what) => () => w.log.push(what);
  return w;
}
const cue = (id, kind = "glance") => ({ id, kind, origin: "house", presentation: "interaction" });

test("L1, L2: fires once at the passed ms, not before; equal ms fire in creation order", () => {
  const w = world();
  const s = {};
  w.dir.later(s, 300, w.note("a"));
  w.dir.later(s, 300, w.note("b"));
  w.dir.later(s, 100, w.note("c"));
  w.advance(99);
  assert.deepStrictEqual(w.log, []);
  w.advance(1);
  assert.deepStrictEqual(w.log, ["c"]);
  w.advance(199);
  assert.deepStrictEqual(w.log, ["c"]);
  w.advance(1);
  assert.deepStrictEqual(w.log, ["c", "a", "b"]);
  w.advance(10000);
  assert.deepStrictEqual(w.log, ["c", "a", "b"], "once");
  assert.strictEqual(w.dir.pending(), 0);
});

test("L3: a key replaces silently: the earlier fn and its undo never run (A1)", () => {
  const w = world();
  const s = {};
  w.dir.later(s, 300, w.note("fn1"), { key: "k", undo: w.note("undo1") });
  w.advance(100);
  w.dir.later(s, 300, w.note("fn2"), { key: "k", undo: w.note("undo2") });
  assert.strictEqual(w.dir.pending(s), 1);
  w.advance(1000);
  assert.deepStrictEqual(w.log, ["fn2"]);
  // An unkeyed pair stays two (section 2: key only where today's code clears).
  w.dir.later(s, 10, w.note("x"));
  w.dir.later(s, 10, w.note("y"));
  assert.strictEqual(w.dir.pending(s), 2);
});

test("L4, L4b: stop by handle, key, target and group is silent and idempotent; undo never runs on a fire", () => {
  const w = world();
  const s = {};
  const el = {};
  const h = w.dir.later(s, 10, w.note("h"), { undo: w.note("undo h") });
  w.dir.later(s, 10, w.note("k"), { key: "k", undo: w.note("undo k") });
  w.dir.later(s, 10, w.note("t"), { key: "x", target: el, undo: w.note("undo t") });
  w.dir.later(s, 10, w.note("g1"), { group: "g", undo: w.note("undo g1") });
  w.dir.later(s, 10, w.note("g2"), { group: "g", undo: w.note("undo g2") });
  w.dir.later(s, 10, w.note("fires"), { undo: w.note("undo fires") });
  assert.strictEqual(h.stop(), true);
  assert.strictEqual(h.stop(), false, "a second stop is a no-op");
  assert.strictEqual(w.dir.stop(s, { key: "k" }), 1);
  assert.strictEqual(w.dir.stop(s, { key: "k" }), 0);
  assert.strictEqual(w.dir.stop(s, { target: el }), 1);
  assert.strictEqual(w.dir.stop(s, { group: "g" }), 2);
  w.advance(100);
  assert.deepStrictEqual(w.log, ["fires"], "L4b: no undo on a fire");
  assert.strictEqual(w.live(), 0, "the native timers were cancelled");
});

test("L5, L6: drain runs each undo once and never fn; no undo is a drop; detach drains a and leaves b", () => {
  const w = world();
  const a = {};
  const b = {};
  const el = {};
  w.dir.later(a, 10, w.note("fn k"), { key: "k", undo: w.note("undo k") });
  w.dir.later(a, 10, w.note("fn t"), { key: "k", target: el, undo: w.note("undo t") });
  w.dir.later(a, 10, w.note("fn g"), { group: "g", undo: w.note("undo g") });
  w.dir.later(a, 10, w.note("fn drop"), { group: "g" });
  assert.strictEqual(w.dir.drain(a, { key: "k", target: a }), 1);
  assert.strictEqual(w.dir.drain(a, { target: el }), 1);
  assert.strictEqual(w.dir.drain(a, { group: "g" }), 2);
  assert.deepStrictEqual(w.log, ["undo k", "undo t", "undo g"]);
  w.log.length = 0;
  assert.throws(() => w.dir.drain(a, {}), typeError, "no selector drains the whole scope");
  w.dir.later(a, 10, w.note("fn a"), { undo: w.note("undo a") });
  w.dir.later(b, 10, w.note("fn b"), { undo: w.note("undo b") });
  w.dir.detach(a);
  assert.deepStrictEqual(w.log, ["undo a"]);
  w.advance(100);
  assert.deepStrictEqual(w.log, ["undo a", "fn b"]);
});

test("L7, L7b: reset() leaves the ledger pending and firing, ends tracks as before; drainAll drains all", () => {
  const w = world();
  const s = {};
  w.dir.offer(s, cue("c1"));
  w.dir.later(s, 100, w.note("fn"), { undo: w.note("undo") });
  w.dir.reset();
  assert.deepStrictEqual(w.log, ["dispose reset"]);
  assert.strictEqual(w.dir.pending(s), 1);
  w.dir.later(s, 50, w.note("after reset"));
  w.advance(200);
  assert.deepStrictEqual(w.log, ["dispose reset", "after reset", "fn"]);
  const t = {};
  w.dir.later(s, 10, w.note("x"), { undo: w.note("undo x") });
  w.dir.later(t, 10, w.note("y"), { undo: w.note("undo y") });
  w.dir.later(t, 10, w.note("z"));
  assert.strictEqual(w.dir.drainAll(), 3);
  assert.deepStrictEqual(w.log.slice(3), ["undo x", "undo y"]);
  assert.strictEqual(w.dir.pending(), 0);
});

test("L8: hidden('tab') drains a tab entry and keeps a keep one; hidden('offscreen') keeps both", () => {
  const w = world();
  const s = {};
  w.dir.later(s, 100, w.note("keep fn"), { undo: w.note("keep undo") });
  w.dir.later(s, 100, w.note("tab fn"), { hidden: "tab", undo: w.note("tab undo") });
  assert.strictEqual(w.dir.hidden("offscreen"), 0);
  assert.strictEqual(w.dir.pending(s), 2);
  assert.strictEqual(w.dir.hidden("tab"), 1);
  assert.deepStrictEqual(w.log, ["tab undo"]);
  w.advance(200);
  assert.deepStrictEqual(w.log, ["tab undo", "keep fn"]);
  assert.throws(() => w.dir.later(s, 1, () => {}, { hidden: "finish" }), typeError, "no finish policy");
});

test("L9: a throwing fn leaves nothing pending and reaches the schedule callback's caller", () => {
  const w = world();
  const s = {};
  w.dir.later(s, 10, () => {
    throw new Error("boom");
  });
  assert.throws(() => w.advance(10), /boom/);
  assert.strictEqual(w.dir.pending(), 0);
});

test("L10: a re-arm inside fn with the same key survives", () => {
  const w = world();
  const s = {};
  let n = 0;
  const step = () => {
    n++;
    if (n < 3) w.dir.later(s, 100, step, { key: "loop" });
  };
  w.dir.later(s, 100, step, { key: "loop" });
  w.advance(1000);
  assert.strictEqual(n, 3);
  assert.strictEqual(w.dir.pending(), 0);
});

test("L11: every and frame go through the injected repeat and frame, and are drained", () => {
  const w = world();
  const s = {};
  w.dir.every(s, 100, w.note("tick"), { group: "link", undo: w.note("undo every") });
  w.dir.frame(s, (t) => w.log.push(`frame ${t}`));
  w.advance(250);
  assert.deepStrictEqual(w.log, ["frame 16", "tick", "tick"]);
  assert.strictEqual(w.dir.pending(s), 1, "an interval stays until stopped");
  w.dir.frame(s, w.note("never"), { undo: w.note("undo frame") });
  w.dir.detach(s);
  w.advance(500);
  assert.deepStrictEqual(w.log, ["frame 16", "tick", "tick", "undo every", "undo frame"]);
  assert.strictEqual(w.live(), 0);
  const bare = D.create({ now: () => 0, schedule: () => () => {} });
  assert.throws(() => bare.every(s, 10, () => {}), typeError, "every needs repeat");
  assert.throws(() => bare.frame(s, () => {}), typeError, "frame needs frame");
});

test("L12: adopt cancels once on a drain; done() leaves without cancel, per handle and idempotent (F5)", () => {
  const w = world();
  const s = {};
  let cancels = 0;
  const h = w.dir.adopt(s, { cancel: () => cancels++, key: "ghost" });
  w.dir.drain(s, { key: "ghost" });
  w.dir.drain(s, { key: "ghost" });
  assert.strictEqual(cancels, 1);
  assert.strictEqual(h.done(), false, "a late cancel event after the drain does nothing");
  const old = w.dir.adopt(s, { cancel: () => cancels++, key: "ghost" });
  const fresh = w.dir.adopt(s, { cancel: () => cancels++, key: "ghost" });
  assert.strictEqual(cancels, 1, "a same-key adopt replaces without calling cancel");
  assert.strictEqual(old.done(), false, "the replaced one's finish never removes the newer entry");
  assert.strictEqual(w.dir.pending(s), 1);
  assert.strictEqual(fresh.done(), true);
  assert.strictEqual(fresh.done(), false);
  assert.strictEqual(w.dir.pending(), 0);
  assert.throws(() => w.dir.adopt(s, {}), typeError, "adopt needs a cancel");
});

test("L13: target indexes: the same key on two elements is two entries", () => {
  const w = world();
  const s = {};
  const pet = {};
  const gnum = {};
  w.dir.later(s, 100, w.note("pet"), { key: "bump", target: pet });
  w.dir.later(s, 100, w.note("gnum"), { key: "bump", target: gnum });
  w.dir.later(s, 100, w.note("pet again"), { key: "bump", target: pet });
  assert.strictEqual(w.dir.pending(s), 2);
  w.advance(100);
  assert.deepStrictEqual(w.log, ["gnum", "pet again"]);
});

test("L14: inspect().timers and pending(); dueAt is on the device clock, not the server's (F18)", () => {
  const w = world();
  const s = {};
  const el = {};
  w.t = 1000;
  w.dir.later(s, 300, () => {}, { key: "k", group: "g" });
  w.dir.later(s, 50, () => {}, { target: el });
  w.server += 999999; // noteServerTime jumps the server clock; dueAt does not move
  const look = w.dir.inspect(s);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(look.timers)), [
    { key: "k", group: "g", ms: 300, dueAt: 1300 },
    { ms: 50, dueAt: 1050, target: {} },
  ]);
  assert.strictEqual(look.timers[1].target, el);
  assert.strictEqual(w.dir.pending(s), 2);
  assert.strictEqual(w.dir.pending({}), 0);
  assert.strictEqual(w.dir.pending(), 2);
  w.advance(300);
  assert.strictEqual(w.dir.inspect(s), null, "no state and no timer: null, as before");
  w.dir.offer(s, cue("c1"));
  assert.strictEqual(w.dir.inspect(s).timers.length, 0);
});

test("L15: bad arguments throw TypeError; ms is never validated", () => {
  const w = world();
  for (const scope of [undefined, null, 3, "s"]) {
    assert.throws(() => w.dir.later(scope, 10, () => {}), typeError);
    assert.throws(() => w.dir.stop(scope, { key: "k" }), typeError);
    assert.throws(() => w.dir.drain(scope, { key: "k" }), typeError);
    assert.throws(() => w.dir.has(scope, { key: "k" }), typeError);
  }
  assert.throws(() => w.dir.later({}, 10, "not a function"), typeError);
  assert.throws(() => w.dir.later({}, 10, () => {}, { key: 3 }), typeError);
  const seen = [];
  const dir = D.create({ now: () => 0, schedule: (ms) => (seen.push(ms), () => {}) });
  dir.later({}, NaN, () => {});
  dir.later({}, -5, () => {});
  dir.later({}, "7", () => {});
  assert.deepStrictEqual(seen, [NaN, -5, "7"], "passed to schedule unchanged");
});

test("L16: cancel() (tracks) does not touch the ledger, and the ledger does not touch tracks", () => {
  const w = world();
  const s = {};
  w.dir.offer(s, cue("c1"));
  w.dir.later(s, 100, w.note("fn"), { undo: w.note("undo") });
  assert.strictEqual(w.dir.cancel(s, "test"), 1);
  assert.strictEqual(w.dir.pending(s), 1);
  w.dir.offer(s, cue("c2"));
  const before = w.dir.inspect(s);
  w.dir.drain(s, { target: s });
  w.dir.later(s, 10, () => {});
  w.dir.stop(s, { target: s });
  const after = w.dir.inspect(s);
  assert.deepStrictEqual(after.tracks, before.tracks);
  assert.strictEqual(after.seen, before.seen);
  assert.strictEqual(w.dir.tick(w.server), 0, "tick sweeps effects only");
  assert.strictEqual(w.dir.keptCount(s), 0);
  assert.deepStrictEqual(w.log, ["dispose cancel", "undo"]);
});

test("L17: detach order: the ledger's undos, then the tracks end, then the state goes", () => {
  const w = world();
  const s = {};
  w.dir.offer(s, cue("c1"));
  w.dir.later(s, 100, w.note("fn"), { undo: () => w.log.push(`undo, state ${w.dir.inspect(s) ? "kept" : "gone"}`) });
  w.dir.detach(s);
  assert.deepStrictEqual(w.log, ["undo, state kept", "dispose detach"]);
  assert.strictEqual(w.dir.inspect(s), null);
  assert.doesNotThrow(() => w.dir.detach(undefined));
});

test("L18: a drain runs to empty (A3): an undo's new entry is drained; the cap; another scope; hidden", () => {
  const w = world();
  const s = {};
  w.dir.later(s, 100, w.note("fn1"), {
    group: "g",
    undo: () => {
      w.log.push("undo1");
      w.dir.later(s, 100, w.note("fn2"), { group: "g", undo: w.note("undo2") });
    },
  });
  w.dir.drain(s, { group: "g" });
  assert.deepStrictEqual(w.log, ["undo1", "undo2"]);
  assert.strictEqual(w.dir.pending(s), 0);

  // L18b: an undo that reschedules itself forever stops at the cap, nothing left.
  let n = 0;
  const again = () => {
    n++;
    w.dir.later(s, 10, w.note("never"), { undo: again });
  };
  w.dir.later(s, 10, w.note("never"), { undo: again });
  w.dir.detach(s);
  assert.strictEqual(n, D.LEDGER_PASSES);
  assert.strictEqual(w.dir.pending(s), 0);

  // L18c: an undo that adds to another scope leaves that entry pending.
  const other = {};
  w.dir.later(s, 10, () => {}, { undo: () => w.dir.later(other, 10, w.note("other fires")) });
  w.dir.detach(s);
  assert.strictEqual(w.dir.pending(other), 1);
  w.advance(10);
  assert.ok(w.log.includes("other fires"));

  // L18d: a hidden undo that adds a tab entry: the new one is kept (a snapshot).
  w.dir.later(s, 10, () => {}, { hidden: "tab", undo: () => w.dir.later(s, 10, w.note("new tab"), { hidden: "tab" }) });
  assert.strictEqual(w.dir.hidden("tab"), 1);
  assert.strictEqual(w.dir.pending(s), 1);
  w.advance(10);
  assert.ok(w.log.includes("new tab"));
  assert.ok(!w.log.includes("never"));
});

test("L18e: an undo that throws does not stop the drain; the first throw comes after", () => {
  const w = world();
  const s = {};
  w.dir.offer(s, cue("c1"));
  w.dir.later(s, 10, () => {}, { undo: () => { throw new Error("bad undo"); } });
  w.dir.later(s, 10, () => {}, { undo: w.note("second undo") });
  assert.throws(() => w.dir.detach(s), /bad undo/);
  assert.deepStrictEqual(w.log, ["second undo", "dispose detach"]);
  assert.strictEqual(w.dir.inspect(s), null);
});

test("L19: has is true while pending, false once it fires (inside fn too) or is stopped", () => {
  const w = world();
  const s = {};
  w.dir.later(s, 10, () => w.log.push(`inside ${w.dir.has(s, { key: "k" })}`), { key: "k" });
  assert.strictEqual(w.dir.has(s, { key: "k" }), true);
  w.advance(10);
  assert.deepStrictEqual(w.log, ["inside false"]);
  assert.strictEqual(w.dir.has(s, { key: "k" }), false);
  w.dir.later(s, 10, () => {}, { group: "g" });
  w.dir.stop(s, { group: "g" });
  assert.strictEqual(w.dir.has(s, { group: "g" }), false);
});

// ---- the card adapters (card-base.js), in the trace harness's sandbox ----

const classes = (el) => [...el.cls].sort();

test("adapters: _hold adds and removes; restart reflows; mirror follows; drain removes at once", () => {
  const w = cardWorld({ slide: (el) => ({ drape: el("drape") }) });
  const { card, slide: s } = w;
  card._hold(s, s.pet, "perk", 320);
  assert.deepStrictEqual(classes(s.pet), ["perk"]);
  w.advance(319);
  assert.deepStrictEqual(classes(s.pet), ["perk"]);
  w.advance(1);
  assert.deepStrictEqual(classes(s.pet), []);

  w.log.length = 0;
  card._hold(s, s.pet, "chew", 300, { restart: true, mirror: s.drape, key: "chew" });
  assert.deepStrictEqual(w.log.map((x) => `${x.el} ${x.op} ${x.arg ?? ""}`.trim()),
    ["pet class- chew", "drape class- chew", "pet reflow", "pet class+ chew", "drape class+ chew"]);
  card._drain(s, { key: "chew" });
  assert.deepStrictEqual(classes(s.pet), [], "the drain took it off at once");
  assert.strictEqual(w.director.pending(), 0);

  // opts.remove: adds one, takes off all (the _wipe shape).
  card._hold(s, s.pet, "wipe-up", 200, { remove: ["wipe-up", "wipe-side", "wipe-down"], restart: true });
  s.pet.classList.add("wipe-side");
  w.advance(200);
  assert.deepStrictEqual(classes(s.pet), []);
});

test("L20: a second _hold with the same key leaves the class on until the second timer (A1)", () => {
  const cases = [
    ["backlight", 700, 300], ["note", 2400, 1000], ["chew", 450, 300], ["turn", 200, 100], ["house-fx", 2000, 900],
  ];
  for (const [cls, ms, gap] of cases) {
    const w = cardWorld();
    const { card, slide: s } = w;
    card._hold(s, s.pet, cls, ms, { key: cls, restart: true });
    w.advance(gap);
    card._hold(s, s.pet, cls, ms, { key: cls, restart: true });
    w.advance(ms - 1);
    assert.ok(s.pet.cls.has(cls), `${cls}: still on just before the second's end`);
    w.advance(1);
    assert.ok(!s.pet.cls.has(cls), `${cls}: off at the second's end`);
    assert.strictEqual(w.log.filter((x) => x.op === "class-" && x.t > 0 && x.t < gap + ms).length, 1,
      `${cls}: only the restart's own remove ran; no undo on the replacement`);
  }
  // The wipe: `side` then `up` under one key; the second's add stays to its end.
  const w = cardWorld();
  const { card, slide: s } = w;
  const all = ["wipe-side", "wipe-up", "wipe-down"];
  card._hold(s, s.pet, "wipe-side", 220, { key: "wipe", remove: all, restart: true });
  w.advance(100);
  card._hold(s, s.pet, "wipe-up", 170, { key: "wipe", remove: all, restart: true });
  w.advance(169);
  assert.deepStrictEqual(classes(s.pet), ["wipe-up"]);
  w.advance(1);
  assert.deepStrictEqual(classes(s.pet), []);
});

test("adapters: the card's own scope works with no slide; an undefined scope throws before any class", () => {
  const w = cardWorld();
  const { card } = w;
  const button = w.el("button");
  card._hold(card._dirCard, button, "pressed", 160);
  assert.ok(button.cls.has("pressed"));
  w.advance(160);
  assert.ok(!button.cls.has("pressed"));
  assert.throws(() => card._hold(undefined, button, "pressed", 160), typeError);
  assert.ok(!button.cls.has("pressed"), "nothing was added");
  assert.throws(() => card._later(undefined, 10, () => {}), typeError);
  // The card's scope is not a slide: a forget (detach of the slide) leaves it.
  card._later(card._dirCard, 100, () => w.mark("card timer"));
  w.director.detach(w.slide);
  w.advance(100);
  assert.deepStrictEqual(w.log.at(-1), { t: 260, el: "test", op: "mark", arg: "card timer" });
});

test("adapters: _later, _stop, _has; _waapi's finish and cancel take it off, a drain cancels it", () => {
  const w = cardWorld();
  const { card, slide: s } = w;
  card._later(s, 50, () => w.mark("later"), { key: "k" });
  assert.strictEqual(card._has(s, { key: "k" }), true);
  assert.strictEqual(card._stop(s, { key: "k" }), 1);
  assert.strictEqual(card._has(s, { key: "k" }), false);
  const ghost = w.el("ghost");
  const a = card._waapi(s, ghost, [{ opacity: 1 }, { opacity: 0 }], { duration: 180 }, { key: "ghost" });
  assert.strictEqual(w.director.pending(s), 1);
  w.advance(180);
  assert.strictEqual(a.playState, "finished");
  assert.strictEqual(w.director.pending(), 0, "finish took it off the ledger (F5)");
  const b = card._waapi(s, ghost, [], 180, { key: "ghost" });
  b.cancel();
  assert.strictEqual(w.director.pending(), 0, "its own cancel too");
  const c = card._waapi(s, ghost, [], 180, { key: "ghost" });
  assert.strictEqual(card._drain(s, { key: "ghost" }), 1);
  assert.strictEqual(c.playState, "idle");
  assert.strictEqual(w.log.filter((x) => x.op === "anim-cancel").length, 2);
  assert.ok(!w.log.some((x) => x.op === "mark"));
});

test("adapters: _dirPause('tab') drains a tab entry, _dirPause('offscreen') does not; both cancel the shell pulse", () => {
  const w = cardWorld();
  const { card, slide: s } = w;
  card._hold(s, s.pet, "flair", 4200, { hidden: "tab" });
  card._hold(s, s.pet, "perk", 4200);
  card._dirPause("offscreen");
  assert.deepStrictEqual(classes(s.pet), ["flair", "perk"]);
  card._dirPause("tab");
  assert.deepStrictEqual(classes(s.pet), ["perk"]);
  assert.strictEqual(w.director.pending(), 1);
});

// ---- the card's wiring (source) ----

test("the card makes _dirCard and passes the three wrappers; _dirPause hears tab and offscreen", () => {
  const src = require("./card-source");
  assert.match(src, /this\._dirCard = Object\.freeze\(\{ card: true \}\);\n\s*this\._director = HATCH_DIRECTOR\.create\(\{/);
  assert.match(src, /repeat: \(ms, fn\) => \{\n\s*const timer = setInterval\(fn, ms\);\n\s*return \(\) => clearInterval\(timer\);/);
  assert.match(src, /frame: \(fn\) => \{\n\s*const id = requestAnimationFrame\(fn\);\n\s*return \(\) => cancelAnimationFrame\(id\);/);
  assert.match(src, /this\._dirPause\("tab"\);/);
  assert.match(src, /if \(!this\._visible\) this\._dirPause\("offscreen"\);/);
  assert.match(src, /_dirPause\(why\) \{[\s\S]*?this\._director\?\.hidden\(why\);/);
  // reset() drains nothing (G9): its body names no ledger call.
  const reset = part.slice(part.indexOf("        reset: () => {"), part.indexOf("        keptCount:"));
  assert.doesNotMatch(reset, /drain|entries|ledger\./);
});

test("R15: a cancel that throws does not strand a drain or a detach; a throwing arm leaves no entry", () => {
  const w = world();
  const s = {};
  w.dir.adopt(s, { cancel: () => { throw new Error("cancel"); }, key: "a" });
  w.dir.later(s, 100, w.note("fn"), { key: "b", undo: w.note("undo-b") });
  assert.throws(() => w.dir.detach(s), /cancel/);
  assert.deepStrictEqual(w.log, ["undo-b"], "the second entry was still drained");
  assert.strictEqual(w.dir.pending(s), 0);
  const bad = D.create({ now: () => 1, schedule: () => { throw new Error("arm"); } });
  assert.throws(() => bad.later(s, 5, () => {}), /arm/);
  assert.strictEqual(bad.pending(), 0);
});
