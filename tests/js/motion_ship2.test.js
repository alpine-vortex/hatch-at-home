// Motion ship 2 (the flip as a tool: the edge-on sprite swap, the sheet's close wipe, the flip-clock counter,
// a find landing): node --test tests/js. The card's source is read as it ships; the methods run on fakes.
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");

const src = require("./card-source");
const { world, adapters } = require("./timer_trace");
const rule = (sel) => (src.match(new RegExp(`\\n\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{[^}]*\\}`)) || [""])[0];
const method = (name) => src.match(new RegExp(`\\n  (?:async )?${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`))[0];
const classes = () => {
  const set = new Set();
  return { set, classList: { add: (...c) => c.forEach((x) => set.add(x)), remove: (...c) => c.forEach((x) => set.delete(x)),
    toggle: (c, on) => (on ? set.add(c) : set.delete(c)), contains: (c) => set.has(c) }, offsetWidth: 0 };
};

test("the swap flip: turn on, the art swapped at 90 degrees (.1 s), turn off at .2 s", () => {
  assert.match(src, /const TURN_MS = 200;/);
  const timers = [];
  const ctx = { TURN_MS: 200, Date };
  vm.runInNewContext(`const o = {${method("_swapFlip")}, ${method("_afterTurn")}}; this.swap = o._swapFlip; this.after = o._afterTurn;`, ctx);
  const host = adapters((ms, fn) => { timers.push([fn, ms]); return () => {}; });
  const at = (ms) => timers.find((t) => t[1] === ms)[0];
  const pet = classes();
  const s = { pet };
  let moved = 0;
  let put = 0;
  ctx.swap.call({ ...host, _moving: (_s, ms) => { moved = ms; } }, s, () => { put++; });
  assert.ok(pet.set.has("turn"));
  assert.ok(moved >= 200, "a hat waits for it");
  assert.deepStrictEqual(timers.map((t) => t[1]).sort((a, b) => a - b), [100, 200]);
  at(100)();
  assert.strictEqual(put, 1);
  assert.ok(pet.set.has("turn"), "still turning at the swap");
  at(200)();
  assert.ok(!pet.set.has("turn"));
  // the moment's pop and sparkle wait for it, and run at once with no swap going
  let ran = 0;
  timers.length = 0;
  ctx.after.call({ ...host }, s, () => { ran++; });
  assert.strictEqual(ran, 0);
  assert.strictEqual(timers.length, 1);
  assert.ok(timers[0][1] > 0 && timers[0][1] <= 200);
  s.turnUntil = 0;
  ctx.after.call({ ...host }, s, () => { ran++; });
  assert.strictEqual(ran, 1);
});

test("the turn is a keyframe on rotate (individual property, y 0 -> 90 -> 0), .2 s, never under calm motion", () => {
  assert.match(src, /@keyframes turn-swap \{ 0% \{ rotate: y 0deg;[^}]*\}\s*50% \{ rotate: y 90deg;[^}]*\} 100% \{ rotate: y 0deg; \} \}/);
  assert.match(rule(".pet.turn"), /animation: turn-swap \.2s/);
  // only a stage that changes live, on the slide on show, outside calm(), is turned
  assert.match(src, /turning = s\.stageSeen !== undefined && s\.stageSeen !== stage && !calm\(\) && s === this\._slides\?\.\[this\._index\];/);
  assert.match(src, /if \(!turning\) this\._show\(s, s\.pet, frames\[s\.frame % frames\.length\]\);/);
  assert.match(src, /if \(stage\) s\.stageSeen = stage;/);
  assert.match(src, /!\(s\.turnUntil > Date\.now\(\)\)\) \{\n\s+const was = s\.pet/); // the frame loop leaves the swap to _swapFlip
});

test("hatch, stage-up and egg laid put their pop or stretch and sparkle after the turn", () => {
  for (const cls of ["born", "stretch"]) {
    assert.match(src, new RegExp(`this\\._afterTurn\\(s, \\(\\) => \\{\\n\\s+this\\._animate\\(s, s\\.pet, "${cls}", \\d+\\);\\n\\s+this\\._sparkle\\(s\\);`));
  }
  assert.strictEqual((src.match(/this\._afterTurn\(s, /g) || []).length, 3);
});

test("the sheet closes with a wipe up: .16 s, 4 steps, the reverse clip, off on a 170 ms timer, not animationend", () => {
  assert.match(src, /@keyframes lcd-wipe-up \{ from \{ clip-path: inset\(0\); \} to \{ clip-path: inset\(0 0 100% 0\); \} \}/);
  assert.match(rule(".screen .status.wipe-up"), /display: flex; pointer-events: none; animation: lcd-wipe-up \.16s steps\(4\) both/);
  assert.match(src, /const WIPE_UP_MS = 170;/);
  assert.doesNotMatch(method("_wipe") + method("_toggleStatus"), /animationend/);
  // _wipe holds its class through the ledger (director migration slice 1): run it on the trace harness's clock
  const w = world({ methods: ["_wipe"], consts: ["WIPE_UP_MS"], slide: (el) => ({ status: el("status") }) });
  const status = w.slide.status;
  w.card._wipe(w.slide, "up");
  assert.ok(status.cls.has("wipe-up"));
  w.advance(169);
  assert.ok(status.cls.has("wipe-up"), "on until 170");
  w.advance(1);
  assert.strictEqual(status.cls.size, 0);
  // an open cancels it: the down wipe takes wipe-up off, and the timer is replaced
  w.card._wipe(w.slide, "up");
  w.card._wipe(w.slide, "down");
  assert.ok(status.cls.has("wipe-down") && !status.cls.has("wipe-up"));
  w.advance(219);
  assert.ok(status.cls.has("wipe-down"), "the down wipe runs its own 220");
  w.advance(1);
  assert.strictEqual(status.cls.size, 0);
});

test("only a close that moves starts the wipe: the card's own state is closed at once, calm motion has none", () => {
  const m = method("_toggleStatus");
  assert.match(m, /if \(!open && !calm\(\) && s === this\._slides\[this\._index\]\) this\._wipe\(s, "up"\);\n\s+this\._patSync\(s\);/);
  assert.match(m, /s\.screen\.classList\.toggle\("show-status", open\);/); // not held for the wipe
});

test("the game counter is a flip-clock: rotateX away and back in two steps, the swap at the edge, a win keeps the perk", () => {
  assert.match(src, /@keyframes flip-clock \{ 0%, 100% \{ rotate: x 0deg; \} 50% \{ rotate: x 90deg; \} \}/);
  assert.match(rule(".game .gnum.flip"), /animation: flip-clock \.16s steps\(2\);/);
  assert.match(rule(".game .gnum.flip.win"), /animation: flip-clock \.16s steps\(2\), perk \.3s ease-out \.16s;/);
  assert.match(src, /const FLIP_SWAP_MS = 80;/);
  assert.strictEqual((src.match(/this\._animate\(s, s\.gameNum, "flip", 300\)/g) || []).length, 0);
  const run = (isCalm) => {
    const timers = [];
    const num = Object.assign(classes(), { dataset: {}, innerHTML: "old" });
    const animated = [];
    const ctx = { calm: () => isCalm, digit: (n) => `d${n}`, FLIP_SWAP_MS: 80, setTimeout: (fn, ms) => timers.push([fn, ms]) };
    vm.runInNewContext(`const o = {${method("_flipNumber")}}; this.flip = o._flipNumber;`, ctx);
    const self = { _showNumber: (s, n) => { num.innerHTML = `d${n}`; num.dataset.n = String(n); }, _animate: (...a) => animated.push(a) };
    ctx.flip.call(self, { gameNum: num }, 7, true);
    return { num, timers, animated };
  };
  const live = run(false);
  assert.strictEqual(live.num.dataset.n, "7");
  assert.strictEqual(live.num.innerHTML, "old", "the old digit stays until the edge");
  assert.ok(live.num.set.has("win"));
  assert.strictEqual(live.animated[0][2], "flip");
  assert.strictEqual(live.timers[0][1], 80);
  live.timers[0][0]();
  assert.strictEqual(live.num.innerHTML, "d7");
  const still = run(true);
  assert.strictEqual(still.num.innerHTML, "d7", "reduced motion: the number at once");
  assert.strictEqual(still.animated.length, 0);
  assert.strictEqual(still.timers.length, 0);
});

test("a find lands: the basket pops in with its first and rocks once, a fuller one only rocks; live and not calm", () => {
  assert.match(rule(".screen .basket.lands"), /animation: pop \.3s ease-out, rock \.6s steps\(4, jump-none\) \.3s;/);
  assert.match(rule(".screen .basket.lands-more"), /animation: rock \.6s steps\(4, jump-none\);/);
  const m = method("_basketSync");
  assert.match(m, /const before = s\.basketSeen;\n\s+s\.basketSeen = n;/);
  assert.match(m, /if \(show && before !== undefined && n > before && !calm\(\)\) \{[\s\S]*?before === 0 \? "lands" : "lands-more"/);
});
