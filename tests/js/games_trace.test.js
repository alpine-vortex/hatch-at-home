// Director migration slice 10 (games), the characterization half: the game's delayed steps (R22, _gameLater), the flip-clock digit
// swap (R23) and the pet's game-end flavour line (R24), on the fake clock with the card's own methods (plan 5.10). It passes before
// the move (bare timers, s.gameTimers) and after (the ledger, group "game"). What it does not pin: a flip swap still pending when
// the game ends (today it writes the digit into the hidden box; after, _endGame's group stop drops it: invisible, plan R23).
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");

const SPEC = {
  methods: ["_gameLater", "_flipNumber", "_showNumber", "_gameEndType", "_endGame"],
  consts: ["FLIP_SWAP_MS", "GAME_TYPE_MS", "GAME_TYPE_ODDS"],
  globals: { digit: (n) => `d${n}`, FLAVOUR: 1, Math: { random: () => 0 } },
  returns: { _persona: { game_win: "own", game_lose: "own" }, _fresh: "the line" },
  slide: (el) => ({
    game: null, sayUntil: 0, propEl: el("prop"), gameScore: el("score"),
    gameNum: el("num", { removeAttribute: () => {}, innerHTML: "old", dataset: {} }),
    gameBox: el("box", { querySelector: () => null, contains: () => false }),
    buttons: {},
  }),
};
const make = () => {
  const w = world(SPEC);
  w.fired = [];
  w.step = (g, ms, name) => w.card._gameLater(w.slide, g, ms, () => w.fired.push([name, w.now]));
  return w;
};
const lines = (w) => w.calls.filter((c) => c.name === "_line").map((c) => [c.t, c.args[1], c.args[2], c.args[3]]);

test("_gameLater: a step fires at its own time, only if the game is still s.game", () => {
  const w = make();
  const g = {};
  w.slide.game = g;
  w.step(g, 1500, "a");
  w.run(1490);
  assert.deepStrictEqual(w.fired, []);
  w.run(10);
  assert.deepStrictEqual(w.fired, [["a", 1500]]);
});

test("_gameLater: the guard stays in the wrapper: a step whose game is no longer s.game does not run (it is not an error)", () => {
  const w = make();
  const g = {};
  w.slide.game = g;
  w.step(g, 1500, "a");
  w.slide.game = null; // ended without _endGame
  w.run(2000);
  assert.deepStrictEqual(w.fired, []);
});

test("several steps keep their own times and order; equal times fire in the order made", () => {
  const w = make();
  const g = {};
  w.slide.game = g;
  w.step(g, 900, "b");
  w.step(g, 300, "a");
  w.step(g, 900, "c");
  w.step(g, 3000, "d");
  w.run(3000);
  assert.deepStrictEqual(w.fired, [["a", 300], ["b", 900], ["c", 900], ["d", 3000]]);
});

test("_endGame cancels every pending step, and nothing is left on the clock", () => {
  const w = make();
  const g = {};
  w.slide.game = g;
  w.step(g, 900, "a");
  w.step(g, 1500, "b");
  w.step(g, 3000, "c");
  w.run(1000);
  w.card._endGame(w.slide, null);
  assert.strictEqual(w.slide.game, null);
  assert.strictEqual(w.slide.gameBox.hidden, true);
  assert.strictEqual(w.pendingTimers(), 0);
  w.run(5000);
  assert.deepStrictEqual(w.fired, [["a", 900]], "only what fired before the end");
});

test("a replaced game (g2) drops g's steps and keeps its own", () => {
  const w = make();
  const g = {};
  const g2 = {};
  w.slide.game = g;
  w.step(g, 1500, "old");
  w.run(500);
  w.card._endGame(w.slide, null);
  w.slide.game = g2;
  w.step(g2, 1500, "new");
  w.run(3000);
  assert.deepStrictEqual(w.fired, [["new", 2000]]);
});

test("a replaced game without an _endGame in between: g's step is dropped at its time, g2's runs", () => {
  const w = make();
  const g = {};
  const g2 = {};
  w.slide.game = g;
  w.step(g, 1500, "old");
  w.run(500);
  w.slide.game = g2;
  w.step(g2, 1500, "new");
  w.run(3000);
  assert.deepStrictEqual(w.fired, [["new", 2000]]);
});

test("a step may make another (the next prompt after a round's end); a quit in the pause drops the chained step", () => {
  const w = make();
  const g = {};
  const chain = (x) => x.card._gameLater(x.slide, g, 900, () => { x.fired.push(["first", x.now]); x.step(g, 1500, "second"); });
  w.slide.game = g;
  chain(w);
  w.run(3000);
  assert.deepStrictEqual(w.fired, [["first", 900], ["second", 2400]]);
  const w2 = make();
  w2.slide.game = g;
  chain(w2);
  w2.run(1000);
  w2.card._endGame(w2.slide, null);
  w2.run(3000);
  assert.deepStrictEqual(w2.fired, [["first", 900]]);
});

test("the flip swap: the new digit goes in at 80, the old one stays until then; data-n is the new number at once", () => {
  const w = make();
  w.card._flipNumber(w.slide, 7, true);
  assert.strictEqual(w.slide.gameNum.dataset.n, "7");
  w.run(70);
  assert.strictEqual(w.slide.gameNum.innerHTML, "old");
  w.run(10);
  assert.strictEqual(w.slide.gameNum.innerHTML, "d7");
});

test("the flip swap runs only if data-n is still its number (a second flip inside 80 ms wins)", () => {
  const w = make();
  w.card._flipNumber(w.slide, 7);
  w.run(40);
  w.card._flipNumber(w.slide, 8);
  w.run(40); // 80: the first swap sees 8, not 7
  assert.strictEqual(w.slide.gameNum.innerHTML, "old");
  w.run(40); // 120: the second
  assert.strictEqual(w.slide.gameNum.innerHTML, "d8");
});

test("calm motion: the number at once and no timer", () => {
  const w = make();
  w.calm = true;
  w.card._flipNumber(w.slide, 7);
  assert.strictEqual(w.slide.gameNum.innerHTML, "d7");
  assert.strictEqual(w.pendingTimers(), 0);
});

test("the flavour line: 4000 ms after the end, only if no game is on, with the persona's line", () => {
  const w = make();
  w.card._gameEndType(w.slide, true);
  w.run(3990);
  assert.deepStrictEqual(lines(w), []);
  w.run(10);
  assert.deepStrictEqual(lines(w), [[4000, 1, "the line", 3500]]);
});

test("the flavour line is dropped when a game is on at 4000", () => {
  const w = make();
  w.card._gameEndType(w.slide, false);
  w.run(1000);
  w.slide.game = {};
  w.run(4000);
  assert.deepStrictEqual(lines(w), []);
});

test("the flavour line is not cancelled by _endGame: it is the guard that drops it", () => {
  const w = make();
  w.card._gameEndType(w.slide, true);
  w.run(1000);
  w.slide.game = {};
  w.card._endGame(w.slide, null); // a game started and quit inside the 4 s: the line still comes
  w.run(4000);
  assert.deepStrictEqual(lines(w), [[4000, 1, "the line", 3500]]);
});

test("two game ends inside 4 s give two lines, each at its own time (unkeyed)", () => {
  const w = make();
  w.card._gameEndType(w.slide, true);
  w.run(1000);
  w.card._gameEndType(w.slide, false);
  w.run(5000);
  assert.deepStrictEqual(lines(w).map((l) => l[0]), [4000, 5000]);
});
