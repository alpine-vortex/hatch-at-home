// Director migration slice 9 (care scene stragglers and the drape), the characterization half: what the clean scene's rock2
// shake-off (R15), its murk restore (R16) and the drape's timers (R17-R20) do, passing before and after the move (plan 5.9, D3,
// D4, F7). The cases B4 changes (a quiet or leaving end used to leave rock2 to run out for 1.3 s; the move cuts it at once) were
// pinned here as BEFORE cases on the unmoved code (9983ab0d) and are in scene_ledger.test.js as their after. The scene is driven
// through the real SCENES.clean render and clear and the real _sceneEnd (scene_world.js).
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { sceneWorld, begin, rock, played, murk } = require("./scene_world");

test("a normal end at 2000: rock2 goes on at 1800 and off at 3100, the shake-off plays out", () => {
  const w = played({}, (x, s) => x.card._sceneEnd(s), 2000);
  w.run(2000);
  assert.deepStrictEqual(rock(w), [["class+", 1800], ["class-", 3100]]);
  assert.strictEqual(w.slide.scene, null);
});

test("the murk: the end writes transition none, the restore is 50 ms later (a normal end)", () => {
  const w = played({ murk: true }, (x, s) => x.card._sceneEnd(s), 2000);
  assert.strictEqual(murk(w), "none");
  w.run(49);
  assert.strictEqual(murk(w), "none");
  w.run(1);
  assert.strictEqual(murk(w), "", "restored at +50");
});

test("a press end at 1900 (not quiet, not a swipe) leaves rock2 to 3100", () => {
  const w = played({}, (x, s) => x.card._sceneEnd(s));
  w.run(1500);
  assert.deepStrictEqual(rock(w), [["class+", 1800], ["class-", 3100]]);
});

test("the murk restore after a quiet end still fires at +50 (it is not drained)", () => {
  const w = played({ murk: true }, (x, s) => x.card._sceneEnd(s, { quiet: true }));
  assert.strictEqual(murk(w), "none");
  w.run(49);
  assert.strictEqual(murk(w), "none");
  w.run(1);
  assert.strictEqual(murk(w), "");
});

test("a one-pet card: _go to the same slide (a swipe, a tap on the current dot) ends the scene and keeps rock2 to 3100 (D4)", () => {
  const w = played({}, (x) => x.card._go(0));
  assert.strictEqual(w.slide.scene, null, "the scene ends there as today");
  w.run(1500);
  assert.deepStrictEqual(rock(w), [["class+", 1800], ["class-", 3100]]);
  const wrap = played({}, (x) => x.card._go(1)); // one pet: the arrow wraps to the same slide
  wrap.run(1500);
  assert.deepStrictEqual(rock(wrap), [["class+", 1800], ["class-", 3100]]);
});

test("a scene ended before 1800 never adds rock2", () => {
  const w = sceneWorld();
  begin(w);
  w.run(1000);
  w.card._sceneEnd(w.slide, { quiet: true });
  w.run(5000);
  assert.deepStrictEqual(rock(w), []);
});

// --- The drape (R17-R20) --------------------------------------------------------------------------------------------------

const shows = (w) => w.calls.filter((c) => c.name === "_drapeShow").map((c) => [c.t, ...c.args.slice(1)]);
const hides = (w) => w.calls.filter((c) => c.name === "_drapeHide").map((c) => c.t);

test("a fall is frame 1 now, frames 2 and 3 at 150 and 300, and drapeAnim = false at 450", () => {
  const w = sceneWorld();
  const s = w.slide;
  w.card._drapeSync(s, false);
  w.card._drapeSync(s, true);
  assert.strictEqual(s.drapeAnim, true);
  assert.deepStrictEqual(shows(w), [[0, 1]]);
  w.run(149);
  assert.deepStrictEqual(shows(w), [[0, 1]]);
  w.run(1);
  w.run(150);
  assert.deepStrictEqual(shows(w), [[0, 1], [150, 2], [300, 3]]);
  w.run(149);
  assert.strictEqual(s.drapeAnim, true, "449");
  w.run(1);
  assert.strictEqual(s.drapeAnim, false, "450");
  assert.strictEqual(w.pendingTimers(), 0);
});

test("_drapeStop cancels all of a fall's frames and clears drapeAnim at once", () => {
  const w = sceneWorld();
  const s = w.slide;
  w.card._drapeSync(s, false);
  w.card._drapeSync(s, true);
  w.run(200);
  w.card._drapeStop(s);
  assert.strictEqual(s.drapeAnim, false);
  w.run(5000);
  assert.deepStrictEqual(shows(w), [[0, 1], [150, 2]], "no frame 3");
});

test("a landing in progress is not restarted by a second pass (drapeAnim)", () => {
  const w = sceneWorld();
  const s = w.slide;
  w.card._drapeSync(s, false);
  w.card._drapeSync(s, true);
  w.run(100);
  w.card._drapeSync(s, true);
  w.run(1000);
  assert.deepStrictEqual(shows(w), [[0, 1], [150, 2], [300, 3]]);
});

test("a lights-on slide-out: frame 2 dropped now, hidden at 150", () => {
  const w = sceneWorld();
  const s = w.slide;
  w.card._drapeSync(s, true); // a pet tucked when the card opens: the final frame
  s.drapeFrame = 3;
  w.card._drapeSync(s, false);
  assert.deepStrictEqual(shows(w).at(-1), [0, 2, 12]);
  assert.deepStrictEqual(hides(w), []);
  w.run(149);
  assert.deepStrictEqual(hides(w), []);
  w.run(1);
  assert.deepStrictEqual(hides(w), [150]);
});

test("a slide-out stopped by _drapeStop never hides", () => {
  const w = sceneWorld();
  const s = w.slide;
  w.card._drapeSync(s, true);
  s.drapeFrame = 3;
  w.card._drapeSync(s, false);
  w.run(100);
  w.card._drapeStop(s);
  w.run(1000);
  assert.deepStrictEqual(hides(w), []);
});

test("calm: a fall is frame 3 at once and a wake hides at once, no timer", () => {
  const w = sceneWorld();
  w.calm = true;
  const s = w.slide;
  w.card._drapeSync(s, false);
  w.card._drapeSync(s, true);
  assert.deepStrictEqual(shows(w), [[0, 3]]);
  s.drapeFrame = 3;
  w.card._drapeSync(s, false);
  assert.deepStrictEqual(hides(w), [0]);
  assert.strictEqual(w.pendingTimers(), 0);
});

test("a wake starts while a fall is in progress: the fall's frames are cancelled", () => {
  const w = sceneWorld();
  const s = w.slide;
  w.card._drapeSync(s, false);
  w.card._drapeSync(s, true);
  w.run(100);
  s.drapeFrame = 1;
  w.card._drapeSync(s, false);
  assert.strictEqual(s.drapeAnim, false);
  w.run(5000);
  assert.deepStrictEqual(shows(w).map((x) => x[1]), [1, 2], "frame 1 of the fall, then the slide-out's frame 2; never frame 3");
  assert.deepStrictEqual(hides(w), [250]);
});
