// Director migration slice 9, after the move: R15 rock2 is group "scene" (drained by a quiet end or a leaving swipe, before
// entry.clear), R16 the murk restore is group "scene.murk" (not drained by _sceneEnd: it keeps its +50 ms; detach takes it),
// R17-R20 the drape are group "drape" (_drapeStop stops them silently; R19's undo sets drapeAnim = false). The B4 cases are the
// change: scene_stragglers.test.js pins what does not move; the times of an unmoved case are its. Plan 5.9, D3, D4, F7. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { sceneWorld, begin, render, rock, played, murk } = require("./scene_world");
const src = require("./card-source");

const groups = (w, s = w.slide) => [...(w.director.inspect(s)?.timers || [])].map((t) => t.group).sort();
const gone = (w) => rock(w).filter(([op]) => op === "class-").map(([, t]) => t);

test("a clean scene past 1800 holds rock2 in group scene (one timer, 1300 ms), the murk restore only after the end", () => {
  const w = sceneWorld();
  const sc = begin(w, w.slide, { murk: true });
  w.run(1800);
  render(w, w.slide, sc, 1800);
  assert.deepStrictEqual(groups(w), ["scene"]);
  w.run(100);
  w.card._sceneEnd(w.slide);
  assert.deepStrictEqual(groups(w), ["scene", "scene.murk"], "a normal end leaves rock2 to run out");
});

test("D3: a quiet end at 1900 cuts rock2 at once; the murk restore is not drained and fires at +50", () => {
  const w = played({ murk: true }, (x, s) => x.card._sceneEnd(s, { quiet: true }));
  assert.deepStrictEqual(rock(w), [["class+", 1800], ["class-", 1900]]);
  assert.deepStrictEqual(groups(w), ["scene.murk"]);
  assert.strictEqual(murk(w), "none", "the net's clearing is held: transition none until +50");
  w.run(49);
  assert.strictEqual(murk(w), "none");
  w.run(1);
  assert.strictEqual(murk(w), "");
  w.run(10000);
  assert.deepStrictEqual(gone(w), [1900], "nothing at 3100 for the next pet");
  assert.strictEqual(w.director.pending(w.slide), 0);
});

test("a quiet end with no scene is a no-op, and drains nothing it does not own", () => {
  const w = sceneWorld();
  w.slide.scene = null;
  w.card._later(w.slide, 100, () => w.mark("other"), { group: "scene" });
  w.card._sceneEnd(w.slide, { quiet: true });
  assert.strictEqual(w.director.pending(w.slide), 1, "the `if (!sc) return` comes first");
});

test("Hop's board load (_sceneEnd quiet) at 1900 cuts rock2 at once; the scene's murk restore still fires at +50", () => {
  const w = played({ murk: true }, (x, s) => x.card._sceneEnd(s, { quiet: true }));
  assert.deepStrictEqual(gone(w), [1900]);
  w.run(50);
  assert.strictEqual(murk(w), "");
});

test("D-keep: the disconnect during a clean scene closes it, rock2 ends with it, the murk restore fires at +50", () => {
  const w = played({ murk: true }, (x) => x.disconnect());
  assert.strictEqual(w.slide.scene, null);
  assert.deepStrictEqual(gone(w), [1900]);
  assert.strictEqual(murk(w), "none");
  w.run(50);
  assert.strictEqual(murk(w), "");
  w.run(10000);
  assert.deepStrictEqual(gone(w), [1900]);
});

test("D-reattach: disconnect at 1900, reconnect 100 ms later: rock2 is already off, the murk restore fires on its time", () => {
  const w = played({ murk: true }, (x) => x.disconnect());
  w.run(100);
  w.reconnect();
  w.run(5000);
  assert.deepStrictEqual(rock(w), [["class+", 1800], ["class-", 1900]]);
  assert.strictEqual(murk(w), "");
});

test("D4/F7: a leaving swipe (two pets) cuts rock2 on the slide left; the murk restore is at +50, not at 0", () => {
  const w = played({ pets: 2, murk: true }, (x) => x.card._go(1));
  assert.strictEqual(w.slide.scene, null);
  assert.deepStrictEqual(gone(w), [1900]);
  assert.strictEqual(murk(w), "none");
  w.run(49);
  assert.strictEqual(murk(w), "none");
  w.run(1);
  assert.strictEqual(murk(w), "");
});

test("D4: a swipe back to the slide with the scene (the other way round) is a leaving swipe too", () => {
  const w = played({ pets: 3 }, (x) => x.card._go(-1)); // wraps to slide 2
  assert.deepStrictEqual(gone(w), [1900]);
});

test("D4: one pet, _go to the same slide (arrow or a tap on the current dot): the scene ends there and keeps rock2 to 3100", () => {
  for (const to of [0, 1, -1]) {
    const w = played({}, (x) => x.card._go(to));
    assert.strictEqual(w.slide.scene, null);
    w.run(2000);
    assert.deepStrictEqual(rock(w), [["class+", 1800], ["class-", 3100]], `_go(${to})`);
  }
});

test("the swipe flag is passed at _go's call only; the press callers do not pass it", () => {
  const go = src.match(/\n  _go\(index[^\n]*\n[\s\S]*?\n  \}\n/)[0];
  assert.match(go, /this\._sceneEnd\(x, \{ swipe: i !== to \}\)/);
  for (const part of ["card-actions", "card-mode", "card-flair"]) {
    const text = require("node:fs").readFileSync(`${__dirname}/../../src/card/${part}.js`, "utf8");
    assert.doesNotMatch(text, /this\._sceneEnd\([^)]*swipe/, part);
  }
  const end = src.match(/\n  _sceneEnd\([^\n]*\n[\s\S]*?\n  \}\n/)[0];
  const at = (re) => end.search(re);
  assert.ok(at(/if \(!sc\) return;/) >= 0 && at(/if \(quiet \|\| swipe\) this\._drain\(s, \{ group: "scene" \}\)/) > at(/if \(!sc\) return;/));
  assert.ok(at(/this\._drain\(s, \{ group: "scene" \}\)/) < at(/entry\?\.clear\?\.call/), "the drain is before entry.clear");
});

test("B1: a forget (the quiet end, then detach) after a press end at 1900: rock2 goes at once, the murk restore is undone, nothing pending", () => {
  const w = played({ murk: true }, (x, s) => x.card._sceneEnd(s));
  assert.deepStrictEqual(groups(w), ["scene", "scene.murk"]);
  w.run(100);
  w.card._sceneEnd(w.slide, { quiet: true });
  w.director.detach(w.slide);
  assert.deepStrictEqual(gone(w), [2000], "the shake-off the press end left is ended by the forget");
  assert.strictEqual(murk(w), "", "the murk restore's undo ran");
  assert.strictEqual(w.director.pending(w.slide), 0);
  w.run(10000);
  assert.deepStrictEqual(gone(w), [2000]);
});

test("B1: a forget mid-scene (a quiet end at 1900, then detach): pending(s) === 0 and the next pet's classes are untouched", () => {
  const w = played({ murk: true }, (x, s) => {
    x.card._sceneEnd(s, { quiet: true });
    x.director.detach(s);
  });
  assert.strictEqual(w.director.pending(w.slide), 0);
  w.slide.pet.classList.add("rock2"); // the next pet's own, made after the forget
  w.run(10000);
  assert.ok(w.slide.pet.classList.contains("rock2"), "no old timer strips it at 3100");
});

// --- The drape ---------------------------------------------------------------------------------------------------------------

test("a fall is three entries in group drape (150, 300, 450); _drapeStop stops them silently, drapeAnim = false", () => {
  const w = sceneWorld();
  const s = w.slide;
  w.card._drapeSync(s, false);
  w.card._drapeSync(s, true);
  assert.deepStrictEqual([...w.director.inspect(s).timers].map((t) => `${t.group}:${t.ms}`), ["drape:150", "drape:300", "drape:450"]);
  w.card._drapeStop(s);
  assert.strictEqual(w.director.pending(s), 0);
  assert.strictEqual(s.drapeAnim, false);
});

test("R19's undo is drapeAnim = false: a drain (detach) without _drapeStop ends the landing flag; nothing else is shown", () => {
  const w = sceneWorld();
  const s = w.slide;
  w.card._drapeSync(s, false);
  w.card._drapeSync(s, true);
  w.run(200);
  w.director.detach(s);
  assert.strictEqual(s.drapeAnim, false);
  assert.strictEqual(w.director.pending(s), 0);
  w.run(5000);
  assert.deepStrictEqual(w.calls.filter((c) => c.name === "_drapeShow").map((c) => c.args[1]), [1, 2], "no frame 3");
});

test("a forget (_drapeStop, then detach) mid-fall and mid-slide-out leaves nothing pending, and the hide never fires", () => {
  for (const out of [false, true]) {
    const w = sceneWorld();
    const s = w.slide;
    w.card._drapeSync(s, out); // out: tucked when the card opens, then a wake; else: a fall
    if (out) { s.drapeFrame = 3; w.card._drapeSync(s, false); } else w.card._drapeSync(s, true);
    w.run(50);
    assert.ok(w.director.pending(s) > 0, out ? "the hide is pending" : "the fall is pending");
    w.card._drapeStop(s);
    w.director.detach(s);
    assert.strictEqual(w.director.pending(s), 0);
    w.run(5000);
    assert.deepStrictEqual(w.calls.filter((c) => c.name === "_drapeHide").length, 0);
  }
});

test("D-keep: the disconnect stops the drape (its own closer) and ends the scene; nothing is left but the murk restore", () => {
  const w = sceneWorld();
  const s = w.slide;
  w.card._drapeSync(s, false);
  w.card._drapeSync(s, true);
  w.run(100);
  w.disconnect();
  assert.strictEqual(s.drapeAnim, false);
  assert.strictEqual(w.director.pending(s), 0);
});

test("no bare timer or drapeTimers in the scene and drape code", () => {
  assert.doesNotMatch(src, /drapeTimers/);
});
