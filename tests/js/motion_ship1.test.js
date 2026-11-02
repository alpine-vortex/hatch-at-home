// Motion ship 1 (turn before travel, call pop, sleep settle, egg wobble, season visitor look):
// node --test tests/js. The card's source is read as it ships; the wander runs on a fake pet.
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");

const src = require("./card-source");
const rule = (sel) => (src.match(new RegExp(`\\n\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{[^}]*\\}`)) || [""])[0];

// The method's text, to the next two-space-indented "}" line.
const method = (name) => src.match(new RegExp(`\\n  ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`))[0];

test("a wander left turns first (look with it), a wander right does not", () => {
  const timers = [];
  const ctx = { pick: (list) => list[ctx.i], i: 0, setTimeout: (fn, ms) => timers.push([fn, ms]) };
  vm.runInNewContext(`const o = {${method("_wander")}}; this.wander = o._wander;`, ctx);
  for (const [i, side, turns] of [[0, "wander-l", true], [1, "wander-r", false]]) {
    ctx.i = i;
    const set = new Set();
    const s = { pet: { classList: { add: (...c) => c.forEach((x) => set.add(x)), remove: (...c) => c.forEach((x) => set.delete(x)) } } };
    timers.length = 0;
    ctx.wander.call({ _moving() {} }, s, 2200);
    assert.ok(set.has(side));
    assert.strictEqual(set.has("look"), turns, side);
    assert.strictEqual(timers[0][1], 2200);
    timers[0][0](); // the way home: both classes go on the same timer
    assert.strictEqual(set.size, 0, side);
  }
});

test("the left wander's translate waits for the .2 s flip, and the perch, pat box and ghost wait with it", () => {
  assert.match(rule(".pet.wander-l"), /transition: translate \.9s ease-out \.2s, rotate \.2s/);
  assert.doesNotMatch(rule(".pet.wander-r"), /ease-out \.2s,/);
  assert.match(src, /\.perch\.wander-l, \.screen \.pat\.wander-l \{[^}]*transition-delay: \.2s/);
  assert.match(rule(".ghost.wander-l"), /transition-delay: \.32s/);
  assert.match(src, /\.ghost\.look \{ rotate: y 180deg; \}/);
});

test("every wander goes through _wander, which both callers have gated on calm()", () => {
  assert.strictEqual((src.match(/classList\.add\(side\)/g) || []).length, 1);
  assert.strictEqual((src.match(/this\._wander\(s, /g) || []).length, 2);
});

test("the call icon pops once, when a call arrives, then pulses as before", () => {
  assert.match(rule(".attention.arrive"), /animation: pop \.3s ease-out, pulse 1s ease-in-out \.3s infinite/);
  assert.match(src, /const newCall = calling && s\.wasCalling === false && !away;/);
  assert.match(src, /else if \(newCall\) \{[^}]*classList\.add\("arrive"\)/);
  assert.match(src, /if \(!calling \|\| away\) s\.attention\.classList\.remove\("arrive"\)/);
});

test("falling asleep seen live settles the pet; load, an egg and calm motion do not", () => {
  assert.match(src, /asleep && s\.wasAsleep === false && !s\.egg && !calm\(\)\) this\._animate\(s, s\.pet, "settle", 2500\)/);
});

test("an egg rocks by itself every 40-90 s, twice when cracking; never under calm motion", () => {
  assert.match(src, /const EGG_WOBBLE_MIN_MS = 40000;/);
  assert.match(src, /const EGG_WOBBLE_SPREAD_MS = 50000;/);
  assert.match(rule(".pet.rock2"), /animation: rock \.6s steps\(4, jump-none\) 2/);
  const m = method("_eggWobble");
  assert.match(m, /if \(!s\.egg \|\| calm\(\)\) return;/);
  assert.match(m, /<= 6/); // the crack stage, as _petFrames
  assert.match(src, /this\._idle\(s\);\n\s+this\._eggWobble\(s\);/);
});

test("a season visitor from the left is faced, never under calm motion", () => {
  assert.match(src, /const ltr = Math\.random\(\) < 0\.5;\n\s+const el = this\._seasonFly\(s, season, art, cls, ms, \{ ltr,/);
  assert.match(src, /if \(ltr && !calm\(\)\) this\._look\(s, /);
});
