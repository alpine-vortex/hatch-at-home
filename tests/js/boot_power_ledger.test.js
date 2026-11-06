// Director migration slice 8, after the move: the gag's steps are group "power" on the slide, the boot wait (key "boot.wait") and
// the fill (unkeyed) are on the card's scope, which no detach or reset drains. The times are boot_power_trace.test.js's. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");
const src = require("./card-source");

const SPEC = {
  methods: ["_powerGag", "_powerEnd", "_bootStart", "_bootEnd"],
  consts: ["BOOT_WAIT_MS", "BOOT_FILL_MS"],
  screen: true,
  globals: { POWER_LINES: { low: ["l"], back: ["b"] }, pick: (a) => a[0], soundsOn: () => false, unlockAudio: () => {} },
  slide: (el) => ({ batt: el("batt", { dataset: {} }), boot: el("boot"), poseUntil: 0, sayUntil: 0, bootMoments: [] }),
};

test("no bare timer and no s.power.timers or _bootTimer in the boot and power code", () => {
  assert.doesNotMatch(src, /power\.timers|_bootTimer/);
});

test("the gag: its steps are group power on the slide; _powerEnd stops them all, silently; a forget leaves nothing", () => {
  const w = world(SPEC);
  w.card._powerGag(w.slide);
  const steps = w.director.pending(w.slide);
  assert.strictEqual(steps, 7, "four blanks, the low line, the back line, the end");
  assert.deepStrictEqual([...new Set(w.director.inspect(w.slide).timers.map((t) => t.group))], ["power"]);
  w.run(500);
  w.card._powerEnd(w.slide);
  assert.strictEqual(w.director.pending(w.slide), 0);
  w.director.detach(w.slide);
  assert.strictEqual(w.director.pending(w.slide), 0);
  assert.strictEqual(w.pendingTimers(), 0);
});

test("the boot: the wait is key boot.wait on the card scope, the fill is unkeyed there; a slide's forget leaves both", () => {
  const w = world(SPEC);
  w.card._card = w.el("card");
  w.card._bootStart();
  assert.deepStrictEqual([...w.director.inspect(w.card._dirCard).timers].map((t) => t.key), ["boot.wait"]);
  w.director.detach(w.slide);
  assert.strictEqual(w.director.pending(w.card._dirCard), 1);
  w.card._bootEnd(true);
  assert.strictEqual(w.director.pending(w.card._dirCard), 1, "the wait is gone, the fill is there");
  assert.strictEqual(w.director.inspect(w.card._dirCard).timers[0].key, undefined);
  w.run(10000);
  assert.strictEqual(w.director.pending(w.card._dirCard), 0);
  assert.strictEqual(w.card._booting, false);
});
