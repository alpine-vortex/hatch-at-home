// Director migration slice 7 (the _animate helper), after the move: what a forget does to a move in flight (plan 3.14, 6.1
// step 3) and what a disconnect keeps. R80 is "end": the entry's undo takes the class off the element at once (B1; before this
// slice a forget left the timer to strip the class from the slide's next pet at its due time). The key is "anim:" + cls and the
// target the element, so a restart replaces silently (A1: no undo, the class stays to the second call's end), two elements
// and two classes are separate entries, and a named key on the same sprite ("turn") is not touched. No slide: the card's own
// scope (G8), which no detach drains. The times are pinned by animate_trace.test.js. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");
const src = require("./card-source");

const short = (log) => log.map((x) => `${x.t} ${x.el} ${x.op}${x.arg === undefined ? "" : ` ${x.arg}`}`);
const SPEC = { methods: ["_animate"], slide: (el) => ({ drape: el("drape"), gameNum: el("num") }) };
const cls = (e) => [...e.cls].sort();

test("the helper is the ledger's: no WeakMap, no bare timer, the key is anim: + cls", () => {
  assert.doesNotMatch(src, /ANIMATE_TIMERS/);
  const body = src.match(/\n  _animate\([^\n]*\{\n[\s\S]*?\n  \}\n/)[0];
  assert.match(body, /this\._hold\(s \?\? this\._dirCard, el, cls, ms, \{ key: `anim:\$\{cls\}`, restart: true, mirror: drape \}\)/);
  assert.doesNotMatch(body, /setTimeout|clearTimeout/);
});

test("the entries: key anim:<cls> on the slide, one per element and class; a restart replaces, it does not add", () => {
  const w = world(SPEC);
  w.card._animate(w.slide, w.slide.pet, "perk", 320);
  w.card._animate(w.slide, w.slide.pet, "greethop", 1400);
  w.card._animate(w.slide, w.slide.gameNum, "perk", 320);
  assert.strictEqual(w.director.pending(w.slide), 3);
  assert.deepStrictEqual([...w.director.inspect(w.slide).timers].map((t) => t.key).sort(), ["anim:greethop", "anim:perk", "anim:perk"]);
  w.advance(100);
  w.card._animate(w.slide, w.slide.pet, "perk", 320);
  assert.strictEqual(w.director.pending(w.slide), 3, "the pet's perk was replaced");
  w.advance(10000);
  assert.strictEqual(w.director.pending(w.slide), 0);
});

test("A1: a restart runs no undo: no class- between the second call and the second one's end", () => {
  const w = world(SPEC);
  w.card._animate(w.slide, w.slide.pet, "puff", 450);
  w.advance(300);
  const at = w.log.length;
  w.card._animate(w.slide, w.slide.pet, "puff", 450);
  w.advance(449);
  // the restart's own remove (pet and blanket), reflow and add at 300, and nothing after it until 750
  assert.deepStrictEqual(short(w.log.slice(at)), ["300 pet class- puff", "300 drape class- puff", "300 pet reflow",
    "300 pet class+ puff", "300 drape class+ puff"]);
  w.advance(1);
  assert.deepStrictEqual(short(w.log.slice(at)).slice(-1), ["750 pet class- puff"]);
});

test("B1: a forget mid-move takes the class off at once, nothing is pending, and nothing fires on the next pet", () => {
  const w = world(SPEC);
  w.card._animate(w.slide, w.slide.pet, "greethop", 1400);
  w.advance(500);
  assert.deepStrictEqual(cls(w.slide.pet), ["greethop"]);
  w.director.detach(w.slide);
  assert.deepStrictEqual(cls(w.slide.pet), []);
  assert.strictEqual(w.director.pending(w.slide), 0);
  assert.strictEqual(w.pendingTimers(), 0, "the undo started no timer");
  assert.ok(short(w.log).includes("500 pet class- greethop"));
  // the slide's next pet moves, and the dead entry does not cut it short
  w.card._animate(w.slide, w.slide.pet, "greethop", 1400);
  const at = w.log.length;
  w.advance(10000);
  assert.deepStrictEqual(short(w.log.slice(at)), ["1900 pet class- greethop"], "only its own end");
});

test("B1: every class and element in flight goes at once; the blanket is left, as at the natural end", () => {
  const w = world(SPEC);
  w.card._animate(w.slide, w.slide.pet, "perk", 320);
  w.card._animate(w.slide, w.slide.pet, "greethop", 1400);
  w.card._animate(w.slide, w.slide.gameNum, "flip", 500);
  w.advance(100);
  w.director.detach(w.slide);
  assert.deepStrictEqual([cls(w.slide.pet), cls(w.slide.gameNum)], [[], []]);
  assert.deepStrictEqual(cls(w.slide.drape), ["greethop", "perk"], "_drapeMirror owns the blanket's classes");
  assert.strictEqual(w.director.pending(w.slide), 0);
  const at = w.log.length;
  w.advance(10000);
  assert.deepStrictEqual(w.log.slice(at), []);
});

test("a forget after the move is over has nothing to do; a forget at the exact end is the same", () => {
  const w = world(SPEC);
  w.card._animate(w.slide, w.slide.pet, "perk", 320);
  w.advance(320);
  const at = w.log.length;
  assert.strictEqual(w.director.pending(w.slide), 0);
  w.director.detach(w.slide);
  assert.deepStrictEqual(w.log.slice(at), []);
});

test("a named key on the same sprite is not the helper's: turn (R63) and anim:turn are two entries", () => {
  const w = world(SPEC);
  w.card._later(w.slide, 300, () => w.slide.pet.classList.remove("turn"), { key: "turn", target: w.slide.pet });
  w.card._animate(w.slide, w.slide.pet, "turn", 200);
  assert.strictEqual(w.director.pending(w.slide), 2);
  w.advance(200);
  assert.strictEqual(w.director.pending(w.slide), 1, "the named one is still there");
});

test("no slide (G8): the entry is on the card's scope; a slide's forget does not touch it; a disconnect keeps it", () => {
  const w = world(SPEC);
  const el = w.el("loose");
  w.card._animate(undefined, el, "perk", 320);
  assert.strictEqual(w.director.pending(w.card._dirCard), 1);
  assert.strictEqual(w.director.pending(w.slide), 0);
  w.director.detach(w.slide);
  assert.deepStrictEqual(cls(el), ["perk"]);
  w.advance(100);
  w.disconnect();
  w.advance(100);
  assert.deepStrictEqual(cls(el), ["perk"], "reset drains nothing (G9)");
  w.reconnect();
  w.advance(119);
  assert.deepStrictEqual(cls(el), ["perk"]);
  w.advance(1);
  assert.deepStrictEqual(cls(el), []);
  assert.strictEqual(w.director.pending(w.card._dirCard), 0);
});

test("D-keep and D-reattach: a disconnect ends no move; a reconnect 100 ms on finds it running and it ends on time", () => {
  const w = world(SPEC);
  w.card._animate(w.slide, w.slide.pet, "greethop", 1400);
  w.advance(100);
  w.disconnect();
  w.advance(100);
  assert.deepStrictEqual(cls(w.slide.pet), ["greethop"]);
  w.reconnect();
  w.advance(1199);
  assert.deepStrictEqual(cls(w.slide.pet), ["greethop"]);
  w.advance(1);
  assert.deepStrictEqual(cls(w.slide.pet), []);
  assert.ok(short(w.log).includes("1400 pet class- greethop"));
});
