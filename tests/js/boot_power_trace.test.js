// Director migration slice 8 (boot and power-on), the characterization trace (plan 5.8, 6.1): the power-on gag's steps (R11),
// the boot wait (R12) and the boot fill (R13), pinned on the unmoved code and passing unchanged after the move. The gag's steps
// are at their `at` offsets; a tap or `_powerEnd` drops the rest. The boot wait ends silently at BOOT_WAIT_MS, a tap sooner;
// the fill finishes BOOT_FILL_MS later (none under calm). The boot timers belong to the card, not a slide: a disconnect leaves
// them running (D-keep, D-reattach), as the bare timers do. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");

const SPEC = {
  methods: ["_powerGag", "_powerEnd", "_bootStart", "_bootEnd"],
  consts: ["BOOT_WAIT_MS", "BOOT_FILL_MS"],
  screen: true,
  watch: ["_speak", "_animate", "_chirp", "_dirView", "_stopTyping", "_patSync"],
  globals: {
    POWER_LINES: { low: ["low line"], back: ["back line"] },
    pick: (a) => a[0],
    soundsOn: () => false,
    unlockAudio: () => {},
  },
  slide: (el) => ({ batt: el("batt", { dataset: {} }), boot: el("boot"), poseUntil: 0, sayUntil: 0 }),
};
const short = (log) => log.map((x) => `${x.t} ${x.el} ${x.op}${x.arg === undefined ? "" : ` ${x.arg}`}`);
const calls = (w, name) => w.calls.filter((c) => c.name === name).map((c) => c.t);

function gagWorld(calm = false) {
  const w = world(SPEC);
  w.calm = calm;
  return w;
}
function bootWorld(calm = false) {
  const w = gagWorld(calm);
  w.card._card = w.el("card");
  w.card._booting = false;
  w.card._slides.forEach((x) => { x.bootMoments = []; });
  w.card._bootStart();
  return w;
}

test("the gag: the blank blinks at 0-80 and 160-240, the low line at 0, the back line at 2200, the end at 4200", () => {
  const w = gagWorld();
  w.card._powerGag(w.slide);
  assert.strictEqual(w.slide.batt.dataset.level, "1");
  assert.strictEqual(w.slide.batt.hidden, false);
  w.run(5000);
  const blank = short(w.log).filter((x) => x.includes("screen class"));
  assert.deepStrictEqual(blank, ["0 screen class+ blank", "80 screen class- blank", "160 screen class+ blank",
    "240 screen class- blank", "4200 screen class- blank"]);
  assert.deepStrictEqual(calls(w, "_speak"), [0, 2200]);
  assert.deepStrictEqual(calls(w, "_animate"), [2200]);
  assert.strictEqual(w.slide.batt.dataset.level, "3");
  assert.strictEqual(w.slide.batt.hidden, true, "the end hides the battery");
  assert.strictEqual(w.slide.power, null);
  assert.strictEqual(w.pendingTimers(), 0);
});

test("the gag under calm: no blinks, no level change, the same two lines and the end", () => {
  const w = gagWorld(true);
  w.card._powerGag(w.slide);
  w.run(5000);
  assert.deepStrictEqual(short(w.log).filter((x) => x.includes("screen class")), ["4200 screen class- blank"]);
  assert.deepStrictEqual(calls(w, "_speak"), [0, 2200]);
  assert.strictEqual(w.slide.batt.dataset.level, "1");
  assert.strictEqual(w.slide.power, null);
});

test("a tap during the gag (_powerEnd) drops the rest: no back line, no perk, the battery goes", () => {
  const w = gagWorld();
  w.card._powerGag(w.slide);
  w.run(1000);
  w.card._powerEnd(w.slide, true);
  assert.strictEqual(w.slide.power, null);
  assert.strictEqual(w.slide.batt.hidden, true);
  assert.deepStrictEqual(calls(w, "_stopTyping"), [1000], "cut short: the line in the bubble goes");
  w.run(10000);
  assert.deepStrictEqual(calls(w, "_speak"), [0]);
  assert.deepStrictEqual(calls(w, "_animate"), []);
  assert.strictEqual(w.pendingTimers(), 0);
});

test("a gag that finishes leaves its last line (abort false at 4200: no _stopTyping)", () => {
  const w = gagWorld();
  w.card._powerGag(w.slide);
  w.run(5000);
  assert.deepStrictEqual(calls(w, "_stopTyping"), []);
});

test("the 2200 step ends the gag when the pet is asleep, calling or owned by then", () => {
  const w = gagWorld();
  w.card._powerGag(w.slide);
  w.run(2000);
  w.slide.asleep = true;
  w.run(3000);
  assert.deepStrictEqual(calls(w, "_speak"), [0]);
  assert.strictEqual(w.slide.power, null);
  assert.deepStrictEqual(calls(w, "_stopTyping"), [2200]);
});

test("_powerEnd with no gag does nothing; a forget mid-gag (_powerEnd then detach) leaves nothing pending", () => {
  const w = gagWorld();
  w.card._powerEnd(w.slide);
  assert.deepStrictEqual(w.log, []);
  w.card._powerGag(w.slide);
  w.run(500);
  w.card._powerEnd(w.slide);
  w.director.detach(w.slide);
  assert.strictEqual(w.director.pending(w.slide), 0);
  assert.strictEqual(w.pendingTimers(), 0);
  w.run(10000);
  assert.deepStrictEqual(calls(w, "_speak"), [0]);
});

test("a disconnect closes the gag the way it does now: its own closer, _powerEnd (here, the test calls it)", () => {
  const w = gagWorld();
  w.card._powerGag(w.slide);
  w.run(1000);
  w.card._powerEnd(w.slide);
  w.disconnect();
  w.run(10000);
  assert.deepStrictEqual(calls(w, "_speak"), [0]);
  assert.strictEqual(w.slide.power, null);
});

test("the boot wait ends silently at 5000: the fill starts then, the logo is gone at 5600", () => {
  const w = bootWorld();
  assert.strictEqual(w.card._booting, true);
  assert.strictEqual(w.slide.boot.hidden, false);
  w.run(4999);
  assert.strictEqual(w.card._booting, true);
  w.run(1);
  assert.ok(w.slide.boot.cls.has("filling"));
  assert.deepStrictEqual(calls(w, "_chirp"), [], "silent");
  w.run(599);
  assert.strictEqual(w.card._booting, true);
  w.run(1);
  assert.strictEqual(w.card._booting, false);
  assert.strictEqual(w.slide.boot.hidden, true);
  assert.ok(!w.slide.boot.cls.has("filling"));
  assert.ok(!w.card._card.cls.has("booting"));
  assert.deepStrictEqual(calls(w, "_dirView"), [5600]);
  assert.strictEqual(w.pendingTimers(), 0);
});

test("a tap sooner chirps, fills at once and finishes 600 later; the wait never fires", () => {
  const w = bootWorld();
  w.run(1200);
  w.card._bootEnd(true);
  assert.deepStrictEqual(calls(w, "_chirp"), [1200]);
  assert.ok(w.slide.boot.cls.has("filling"));
  w.run(10000);
  assert.strictEqual(w.card._booting, false);
  assert.deepStrictEqual(calls(w, "_dirView"), [1800]);
  assert.strictEqual(w.card._bootEnding, false);
  assert.strictEqual(w.pendingTimers(), 0);
});

test("a second tap while the fill runs does nothing", () => {
  const w = bootWorld();
  w.card._bootEnd(true);
  w.run(100);
  w.card._bootEnd(true);
  assert.deepStrictEqual(calls(w, "_chirp"), [0]);
  w.run(10000);
  assert.deepStrictEqual(calls(w, "_dirView"), [600]);
});

test("calm: the wait ends at 5000 with no fill, the screen cuts at once; a tap is the same at its time", () => {
  const w = bootWorld(true);
  w.run(4999);
  assert.strictEqual(w.card._booting, true);
  w.run(1);
  assert.strictEqual(w.card._booting, false);
  assert.ok(!w.slide.boot.cls.has("filling"));
  assert.deepStrictEqual(calls(w, "_dirView"), [5000]);
  const v = bootWorld(true);
  v.run(700);
  v.card._bootEnd(true);
  assert.strictEqual(v.card._booting, false);
  assert.deepStrictEqual(calls(v, "_dirView"), [700]);
  v.run(10000);
  assert.deepStrictEqual(calls(v, "_dirView"), [700], "the wait is stopped");
});

test("the moments held while booting are said when the boot ends", () => {
  const w = bootWorld();
  w.slide.bootMoments = ["m1", "m2"];
  w.run(5600);
  assert.deepStrictEqual(w.calls.filter((c) => c.name === "_moment").map((c) => c.args[1]), ["m1", "m2"]);
  assert.deepStrictEqual([...w.slide.bootMoments], []);
});

test("D-keep: a disconnect during the fill leaves it running: 10 s on, _booting is false and the logo is hidden", () => {
  const w = bootWorld();
  w.run(5000);
  assert.ok(w.slide.boot.cls.has("filling"));
  w.disconnect();
  w.advance(10000);
  assert.strictEqual(w.card._booting, false);
  assert.strictEqual(w.slide.boot.hidden, true);
  assert.ok(!w.card._card.cls.has("booting"));
  assert.strictEqual(w.card._bootEnding, false);
});

test("D-keep: a disconnect during the wait leaves it running too: the boot still ends at 5000 and fills to 5600", () => {
  const w = bootWorld();
  w.run(1000);
  w.disconnect();
  w.run(10000);
  assert.strictEqual(w.card._booting, false);
  assert.deepStrictEqual(calls(w, "_dirView"), [5600]);
});

test("D-reattach: disconnect at 4900, reconnect at 5000: the boot ends at 5000 and fills to 5600", () => {
  const w = bootWorld();
  w.run(4900);
  w.disconnect();
  w.run(100);
  w.reconnect();
  assert.ok(w.slide.boot.cls.has("filling"), "the wait fired at 5000");
  assert.strictEqual(w.card._booting, true);
  w.run(599);
  assert.strictEqual(w.card._booting, true);
  w.run(1);
  assert.strictEqual(w.t(), 5600);
  assert.strictEqual(w.card._booting, false);
  assert.strictEqual(w.slide.boot.hidden, true);
});
