// Director migration slice 1 (chrome), after the move: what a forget does to each row (plan 3.14, 6.1 step 3).
// `detach` is what _forget calls on the slide. R1-R3 and R5 (card scope) are left to end on time; R4, R25, R28 and
// R40 end (their class or note comes off at once); R26's frame is dropped; R27's head is the card's own.
// The traces in chrome_trace.test.js pin the times and are not edited by the move. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");

test("a forget mid-flight ends the slide's own chrome at once: perk, wipe, mode swap; nothing is left on the ledger", () => {
  const w = world({ methods: ["_perk", "_wipe", "_modeSwap"], consts: ["WIPE_UP_MS"], slide: (el) => ({ status: el("status") }) });
  const btns = Array.from({ length: 8 }, (_, i) => w.el(`b${i}`));
  w.card._modeButtons = () => btns;
  const s = w.slide;
  w.card._perk(s);
  w.card._wipe(s, "up");
  w.card._modeSwap(s);
  assert.strictEqual(w.director.pending(s), 3);
  w.advance(10);
  w.director.detach(s);
  assert.strictEqual(w.director.pending(s), 0);
  assert.deepStrictEqual([...s.pet.cls], []);
  assert.deepStrictEqual([...s.status.cls], []);
  assert.ok(btns.every((b) => b.cls.size === 0));
  const before = w.log.length;
  w.advance(10000);
  assert.strictEqual(w.log.length, before, "nothing fires later on the next pet");
});

test("a forget hides the status note at once (the keyed entry's undo), and the timer never runs", () => {
  const note = { hidden: false, textContent: "x", style: {}, classList: { contains: () => false } };
  const w = world({ methods: ["_statusMessage"], slide: () => ({ status: { querySelector: () => note, getBoundingClientRect: () => ({}) } }) });
  w.card._statusMessage(w.slide, "saved");
  assert.strictEqual(note.hidden, false);
  w.director.detach(w.slide);
  assert.strictEqual(note.hidden, true);
  assert.strictEqual(note.textContent, "");
  assert.strictEqual(w.director.pending(w.slide), 0);
});

test("button chrome is the card's: a forget leaves it to end on time (R1-R3, R5)", () => {
  const w = world({ methods: ["_tapped", "_perk"] });
  const b = w.el("button");
  b.cls.add("toy");
  w.card._tapped(b, w.slide);
  w.director.detach(w.slide);
  assert.ok(b.cls.has("pressed") && b.cls.has("tapped"), "not touched by the slide's forget");
  assert.strictEqual(w.director.pending(w.card._dirCard), 3, "pressed, tapped and the ring");
  w.advance(500);
  assert.strictEqual(b.cls.has("pressed") || b.cls.has("tapped"), false);
  assert.strictEqual(w.director.pending(w.card._dirCard), 0);
});

test("the head swap is the card's entry, kept by the director's reset, ended by the disconnect's closer", () => {
  const w = world({ methods: [] });
  w.card._later(w.card._dirCard, 250, () => w.mark("head"), { key: "head" });
  assert.ok(w.card._has(w.card._dirCard, { key: "head" }));
  w.director.reset();
  assert.ok(w.card._has(w.card._dirCard, { key: "head" }), "reset drains nothing (G9)");
  w.disconnect();
  assert.ok(!w.card._has(w.card._dirCard, { key: "head" }));
  w.advance(1000);
  assert.deepStrictEqual(w.log.filter((x) => x.op === "mark"), []);
});

test("the mould frame is dropped by a forget: _mould is not called for the slide's next pet", () => {
  const w = world({ methods: [], watch: ["_mould"] });
  w.director.frame(w.slide, () => w.card._mould(w.slide));
  w.director.detach(w.slide);
  w.advance(100);
  assert.deepStrictEqual(w.calls.filter((c) => c.name === "_mould"), []);
});
