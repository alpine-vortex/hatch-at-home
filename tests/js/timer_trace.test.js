// The trace harness (tests/js/timer_trace.js; director migration plan 5.0, 6.1): the fake clock itself, and
// the first traces of unmoved card sites, so a slice's move has a pin that passes before it and after it.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world, trace } = require("./timer_trace");

const short = (log) => log.map((x) => `${x.t} ${x.el} ${x.op}${x.arg === undefined ? "" : ` ${x.arg}`}`);

test("the fake clock: exact due times, equal delays in creation order, setTimeout's reading of NaN and < 0", () => {
  const w = world();
  const { setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, Date, performance } = w.sandbox;
  const seen = [];
  setTimeout(() => seen.push(`a ${w.t()}`), 30);
  setTimeout(() => seen.push(`b ${w.t()}`), 30);
  setTimeout(() => seen.push(`nan ${w.t()}`), NaN);
  setTimeout(() => seen.push(`neg ${w.t()}`), -5);
  clearTimeout(setTimeout(() => seen.push("cleared"), 10));
  const iv = setInterval(() => seen.push(`iv ${w.t()}`), 25);
  requestAnimationFrame((t) => seen.push(`raf ${t}`));
  w.advance(10);
  assert.strictEqual(Date.now(), w.base + 10);
  assert.strictEqual(performance.now(), 10);
  w.advance(50);
  clearInterval(iv);
  w.advance(100);
  assert.deepStrictEqual(seen, ["nan 0", "neg 0", "raf 16", "iv 25", "a 30", "b 30", "iv 50"]);
});

test("the sandbox loads the real director and the slice-0 adapters into every world (F2)", () => {
  const w = world();
  for (const name of ["_later", "_hold", "_waapi", "_stop", "_drain", "_has", "_dirPause"]) {
    assert.strictEqual(typeof w.card[name], "function", name);
  }
  assert.strictEqual(typeof w.director.later, "function");
  assert.ok(Object.isFrozen(w.card._dirCard));
  // A card method that is not loaded is a silent stub; a field that is not set stays undefined.
  assert.strictEqual(w.card._endGame(), undefined);
  assert.strictEqual(w.card._notAMethodOfTheCard, undefined);
  assert.strictEqual(w.card._hass, undefined);
});

// ---- traces of unmoved sites (each passes before its slice's move, and after it, unchanged) ----

test("_perk: the quick hop, the same with calm both ways; no slide does nothing (G8)", () => {
  const spec = { methods: ["_perk"] };
  const site = (card, s) => card._perk(s);
  const want = ["0 pet class- perk", "0 pet reflow", "0 pet class+ perk", "320 pet class- perk"];
  assert.deepStrictEqual(short(trace(spec, site).log), want);
  assert.deepStrictEqual(short(trace(spec, site, { calm: true }).log), want, "no calm() guard: the CSS kill covers it");
  const none = trace(spec, site, { noSlide: true });
  assert.strictEqual(none.threw, null);
  assert.deepStrictEqual(none.log, []);
});

test("_tapped with no slide (54 of 67 callers): the button's chrome on its own times (R1-R3)", () => {
  const spec = { methods: ["_tapped", "_perk"] };
  const site = (card, s, w) => {
    const b = w.el("button");
    b.cls.add("toy");
    card._tapped(b, s);
  };
  const r = trace(spec, site, { noSlide: true });
  assert.strictEqual(r.threw, null);
  assert.deepStrictEqual(short(r.log), [
    "0 button class+ tap-feedback", "0 button class+ tapped", "0 button class+ pressed", "0 button append span",
    "160 button class- pressed", "400 button class- tapped", "500 span remove",
  ]);
});

test("_animate and a keyed, restarting _hold give the same trace, once and twice 300 ms apart (slice 7's pin)", () => {
  const spec = { methods: ["_animate"], consts: ["ANIMATE_TIMERS"], slide: (el) => ({ drape: el("drape") }) };
  const twice = (how) => (card, s, w) => {
    how(card, s);
    w.advance(300);
    how(card, s);
  };
  const before = (card, s) => card._animate(s, s.pet, "chew", 450);
  const after = (card, s) => card._hold(s, s.pet, "chew", 450, { key: "chew", restart: true, mirror: s.drape });
  for (const calm of [false, true]) {
    assert.deepStrictEqual(trace(spec, before, { calm }).log, trace(spec, after, { calm }).log);
    const a = trace(spec, twice(before), { calm }).log;
    assert.deepStrictEqual(a, trace(spec, twice(after), { calm }).log);
    assert.deepStrictEqual(short(a).filter((x) => x.includes("pet class-")), ["0 pet class- chew", "300 pet class- chew",
      "750 pet class- chew"], "the class stays to the second one's end");
  }
});

test("_swapFlip twice 100 ms apart: the second flip keeps turn to its own end, 300 (B3, fixed in slice 3)", () => {
  const spec = { methods: ["_swapFlip", "_moving"], consts: ["TURN_MS"] };
  const site = (card, s, w) => {
    card._swapFlip(s, () => w.mark("put 1"));
    w.advance(100);
    card._swapFlip(s, () => w.mark("put 2"));
  };
  const turnOff = short(trace(spec, site).log).filter((x) => / (class- turn|mark)/.test(x));
  assert.deepStrictEqual(turnOff, ["0 pet class- turn", "100 test mark put 1", "100 pet class- turn",
    "200 test mark put 2", "300 pet class- turn"]);
});

// ---- the disconnect policy (G9): D-keep and D-reattach on the shared harness ----

test("D-keep: a disconnect ends nothing a closer does not end; bare timers and ledger entries fire on time", () => {
  const spec = { methods: ["_perk"] };
  const plain = trace(spec, (card, s) => {
    card._perk(s);
    card._later(s, 400, () => s.pet.classList.add("ledger-done"));
  });
  const kept = trace(spec, (card, s, w) => {
    card._perk(s);
    card._later(s, 400, () => s.pet.classList.add("ledger-done"));
    w.advance(100);
    w.disconnect();
    w.advance(10000);
    w.reconnect();
    w.advance(700);
  }, { until: 11000 });
  assert.deepStrictEqual(kept.log, plain.log, "the same effects at the same times");
  assert.ok(kept.w.calls.some((c) => c.name === "_tick"), "a tick runs after the reconnect");
  assert.strictEqual(kept.w.director.pending(), 0);
});

test("D-reattach: disconnect, connect 100 ms later, advance to the longest due time: the same end state", () => {
  const spec = { methods: ["_perk"] };
  const plain = trace(spec, (card, s) => card._perk(s));
  const back = trace(spec, (card, s, w) => {
    card._perk(s);
    w.advance(100);
    w.disconnect();
    w.advance(100);
    w.reconnect();
  }, { until: 1000 });
  assert.deepStrictEqual(back.log, plain.log);
  assert.deepStrictEqual([...back.w.slide.pet.cls], []);
  const ticks = back.w.calls.filter((c) => c.name === "_tick").map((c) => c.t);
  assert.strictEqual(ticks[0], 900, "the reconnect's tick, 700 ms after it");
});
