// Director migration slice 9 (care scene stragglers and the drape), the characterization half: what the clean scene's rock2
// shake-off (R15), its murk restore (R16) and the drape's timers (R17-R20) do today, on the unmoved code. The cases marked
// BEFORE are the ones B4 changes (a quiet or leaving end used to leave rock2 to run out; the move cuts it at once): the move
// commit takes them out and pins the new behaviour in scene_ledger.test.js. Every other case here passes unchanged after the
// move (plan 5.9, D3, D4, F7). The scene is driven through the real SCENES.clean render and clear and the real _sceneEnd.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const vm = require("node:vm");
const { world } = require("./timer_trace");
const src = require("./card-source");

const SCENES_BLOCK = src.slice(src.indexOf("const SCENES = {"), src.indexOf("\n};\n", src.indexOf("const SCENES = {")) + 4);
const GO = src.match(/\n  _go\(index[^\n]*\n[\s\S]*?\n  \}\n/)[0];
const SPEC = {
  methods: ["_sceneEnd", "_drapeStop", "_drapeSync"],
  consts: ["SCENE_OWE_MS", "DRAPE_FALL_MS", "DRAPE_SLIDE_PX"],
  screen: true,
  watch: ["_drapeShow", "_drapeHide"],
  returns: { _drapeInfo: { size: "l" } },
  slide: (el) => ({ poops: [], murk: el("murk"), perch: el("perch"), drape: el("drape"), drapeImg: el("drapeImg") }),
};

function sceneWorld({ pets = 1 } = {}) {
  const w = world(SPEC);
  vm.runInContext(`${SCENES_BLOCK}\nthis.SCENES = SCENES;`, w.sandbox);
  // _go's head line ends in a comment, which the harness's method reader does not take: loaded here, onto the card's own object.
  vm.runInContext(`this.go = {${GO}};`, w.sandbox);
  w.card._go = w.sandbox.go._go;
  w.slides = [w.slide];
  for (let i = 1; i < pets; i++) {
    const x = { ...w.slide, pet: w.el(`pet${i}`), murk: w.el(`murk${i}`), perch: w.el(`perch${i}`), ids: { device: `dev${i}` } };
    w.slides.push(x);
  }
  w.card._slides = w.slides;
  return w;
}
// A clean scene as _sceneStart leaves it (the boxes are the browser's), at the world's now.
const begin = (w, s = w.slide, { murk = false } = {}) => {
  const sc = { kind: "clean", start: w.now, els: [], mess: [], tool: w.el("tool"), toolArt: ["broom"], water: false, murk, petX: 0, answered: false };
  s.scene = sc;
  return sc;
};
// The render at scene time t: from 1800 on it adds rock2 once.
const render = (w, s, sc, t) => {
  const ramp = (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  w.sandbox.SCENES.clean.render.call(w.card, s, sc, t, { sw: 400, sh: 300, ramp });
};
const rock = (w, name = "pet") => w.log.filter((x) => x.el === name && x.arg === "rock2").map((x) => [x.op, x.t]);
// A clean scene played to `t` (rendered at 1800 so rock2 goes on), then ended by `end(w, s)`.
function played(opts, end, at = 1900) {
  const w = sceneWorld(opts);
  const sc = begin(w, w.slide, { murk: opts?.murk });
  w.run(1800);
  render(w, w.slide, sc, 1800);
  w.run(at - 1800);
  end(w, w.slide);
  return w;
}
const murk = (w) => w.slide.murk.style.transition;

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

test("BEFORE: a quiet end at 1900 (a forget, the disconnect, Hop's board) leaves rock2 to 3100", () => {
  const w = played({}, (x, s) => x.card._sceneEnd(s, { quiet: true }));
  w.run(1500);
  assert.deepStrictEqual(rock(w), [["class+", 1800], ["class-", 3100]], "stripped at 3100, from whatever pet is there then");
});

test("the murk restore after a quiet end still fires at +50 (it is not drained)", () => {
  const w = played({ murk: true }, (x, s) => x.card._sceneEnd(s, { quiet: true }));
  assert.strictEqual(murk(w), "none");
  w.run(49);
  assert.strictEqual(murk(w), "none");
  w.run(1);
  assert.strictEqual(murk(w), "");
});

test("BEFORE: the disconnect during a clean scene closes it and leaves rock2 to 3100; the murk restore fires at +50", () => {
  const w = played({ murk: true }, (x) => x.disconnect());
  assert.strictEqual(w.slide.scene, null, "the scene is closed by the disconnect");
  assert.strictEqual(murk(w), "none");
  w.run(50);
  assert.strictEqual(murk(w), "");
  w.run(1500);
  assert.deepStrictEqual(rock(w), [["class+", 1800], ["class-", 3100]]);
});

test("BEFORE: swiping away from a scene on a card with two pets leaves rock2 on the slide left to 3100; the murk restore is at +50", () => {
  const w = played({ pets: 2, murk: true }, (x) => x.card._go(1));
  assert.strictEqual(w.slide.scene, null);
  assert.strictEqual(murk(w), "none");
  w.run(50);
  assert.strictEqual(murk(w), "");
  w.run(1500);
  assert.deepStrictEqual(rock(w), [["class+", 1800], ["class-", 3100]]);
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
