// Device-alive slice 6 (docs/plan-2026-11-03-device-alive-interactions.md section 9, FM13, FM16, and the
// "Slice 6 acceptance" table): the rare glass mark. The card's real _rareGlass, _markClear and _markEnd run here on a
// fake slide with an injected clock and pick; the CSS and the markup are held by source tests. The card-check
// geometry assertion (real Chromium) is in the devicefx section of scripts/card-check.js.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = require("./card-source");
const ROOT = path.join(__dirname, "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const ctx0 = { Date, Object, Array, Number, Math, JSON };
vm.runInNewContext(`${read("src/card/interaction-director.js")}\n${read("src/card/device-fx.js")}\nthis.D = HATCH_DIRECTOR; this.F = HATCH_DEVICE_FX;`, ctx0);
const { D, F } = ctx0;
const M = F.MARK;
const method = (name) => src.match(new RegExp(`\\n  ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n  \\}\\n`))[0];
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = (t) => [...strip(t).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);

const T = Date.UTC(2026, 10, 3, 12);
const TICK = 700;

function elOf(rect) {
  const set = new Set();
  return {
    hidden: false,
    classList: {
      add: (...c) => c.forEach((x) => set.add(x)),
      remove: (...c) => c.forEach((x) => set.delete(x)),
      contains: (c) => set.has(c),
    },
    names: () => [...set].sort(),
    getBoundingClientRect: () => (typeof rect === "function" ? rect(set) : rect || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
  };
}
const box = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });
// Each spot is a fixed box on a 400 x 300 screen, as the CSS places it.
const SPOT_BOX = { "dir-mark-bl": box(12, 210, 48, 250), "dir-mark-br": box(352, 210, 388, 250), "dir-mark-ml": box(8, 108, 44, 148), "dir-mark-mr": box(356, 108, 392, 148) };
const markEl = () => elOf((set) => SPOT_BOX[[...set].find((c) => SPOT_BOX[c])] || box(0, 0, 0, 0));

// A card with the three real methods and a fake director, on one slide.
function rig(over = {}) {
  const w = { t: T, timers: [], now: T, lcd: true, calm: false, shown: true };
  const dir = D.create({ now: () => w.now, deviceNow: () => w.now, trusted: () => true, canRender: () => true, schedule: (ms, fn) => { const x = { at: w.now + ms, fn, live: true }; w.timers.push(x); return () => { x.live = false; }; }, recipes: F.RECIPES });
  const fake = {
    setTimeout: (fn, ms) => { const x = { at: w.now + ms, fn, live: true, id: w.timers.length + 1 }; w.timers.push(x); return x; },
    clearTimeout: (x) => { if (x && typeof x === "object") x.live = false; },
  };
  const Card = vm.runInNewContext(`(class {\n${method("_rareGlass")}\n${method("_markClear")}\n${method("_markEnd")}\n_dirShown(s) { return SHOWN(s); }\n})`, {
    HATCH_DEVICE_FX: F, lcdOn: () => w.lcd, calm: () => w.calm, SHOWN: (s) => w.shown && s === w.slide,
    pick: (l) => l[0], setTimeout: fake.setTimeout, clearTimeout: fake.clearTimeout, Math, Date,
  });
  const card = Object.assign(Object.create(Card.prototype), { _director: dir });
  const s = {
    mark: markEl(), glass: elOf(), rim: elOf(), pet: elOf(box(140, 100, 260, 290)), attention: elOf(box(320, 15, 385, 66)),
    bubble: elOf(box(20, 18, 200, 80)), pat: elOf(), request: elOf(), basket: elOf(), gameBox: elOf(), perch: elOf(), ...over,
  };
  w.slide = s;
  w.dir = dir;
  w.card = card;
  // Tick the gate every 700 ms from now to `to` ms later, with the pick `choose`.
  w.run = (ms, choose) => {
    const end = w.now + ms;
    while (w.now < end) {
      w.now = Math.min(w.now + TICK, end);
      for (const x of w.timers.filter((y) => y.live && y.at <= w.now)) { x.live = false; x.fn(); }
      card._rareGlass(s, w.now, choose);
    }
  };
  return w;
}
const MIN = 60000;
const ENV = { lcdOn: true, calm: false, clockKnown: true, now: Date.UTC(2026, 10, 3) };
const entry = (kind, over = {}) => ({ id: "n1-1", kind, scope: "house", occurred_at: new Date(T).toISOString(), expires_at: new Date(T + 90000).toISOString(), ...over });
const showing = (w) => w.slide.mark.names().filter((c) => c.startsWith("dir-mark-"));

// ---- gate, clamp, lifetime ----

test("gate: no mark before the viewed-time threshold; one at it; the next not before another full threshold; never the same kind twice; never on the first view", () => {
  const w = rig();
  w.run(1, () => { throw new Error("no pick before the first credit"); }); // the first tick: first view, credit 0
  assert.strictEqual(w.slide.glassViewed, 0);
  w.run(M.everyMs - 2 * TICK, (l) => l[0]);
  assert.deepStrictEqual(showing(w), [], "not before the threshold");
  w.run(4 * TICK, (l) => l[0]);
  assert.strictEqual(showing(w).length, 3, "one mark: kind, spot, on");
  assert.ok(showing(w).includes("dir-mark-paw") && showing(w).includes(M.on));
  const first = showing(w).find((c) => M.kinds.includes(c));
  w.run(M.showMs + M.fadeMs + 2 * TICK, (l) => l[0]);
  assert.deepStrictEqual(showing(w), [], "gone after its life");
  w.run(M.everyMs - 2 * M.creditMs, (l) => l[0]);
  assert.deepStrictEqual(showing(w), [], "not before another full threshold");
  let picked = null;
  w.run(M.creditMs * 3, (l) => { picked = l; return l[0]; });
  const second = showing(w).find((c) => M.kinds.includes(c));
  assert.ok(second && second !== first, `not ${first} twice in a row`);
  assert.ok(!picked.includes(first), "the pick is offered a list without the last kind");
});

test("gate: the first view never draws, even with a counter already past the threshold; one mark at a time", () => {
  const w = rig();
  w.slide.glassViewed = M.everyMs * 3;
  w.card._rareGlass(w.slide, w.now, (l) => l[0]);
  assert.deepStrictEqual(showing(w), [], "the first tick is the first view");
  w.now += TICK;
  w.card._rareGlass(w.slide, w.now, (l) => l[0]);
  assert.strictEqual(showing(w).filter((c) => M.kinds.includes(c)).length, 1);
  const before = showing(w).join();
  w.slide.glassViewed = M.everyMs * 3; // due again while it shows
  for (let i = 0; i < 10; i++) { w.now += TICK; w.card._rareGlass(w.slide, w.now, (l) => l[l.length - 1]); }
  assert.strictEqual(showing(w).join(), before, "the one on screen is left alone");
});

test("clamp: a call credits at most 2 s; a 10-minute gap adds 2 s, not 10 minutes", () => {
  const w = rig();
  w.card._rareGlass(w.slide, w.now);
  w.now += TICK;
  w.card._rareGlass(w.slide, w.now);
  assert.strictEqual(w.slide.glassViewed, TICK);
  w.now += 10 * MIN;
  w.card._rareGlass(w.slide, w.now);
  assert.strictEqual(w.slide.glassViewed, TICK + M.creditMs);
});

test("lifetime: on screen 20 s, a 2 s fade, gone at 22 s with the counter at zero and the timer backstop cleared", () => {
  const w = rig();
  w.run(1);
  w.slide.glassViewed = M.everyMs;
  w.run(TICK);
  assert.ok(showing(w).includes(M.on));
  assert.strictEqual(w.slide.markUntil - w.now < M.showMs + M.fadeMs + 1, true);
  const drawn = w.now;
  w.run(M.showMs + M.fadeMs - 2 * TICK - (w.now - drawn));
  assert.ok(showing(w).includes(M.on), "still on just before 22 s");
  w.run(2 * TICK);
  assert.deepStrictEqual(showing(w), []);
  assert.strictEqual(w.slide.glassViewed, 0, "restarts at zero");
  assert.ok(!w.slide.markUntil);
});

test("lifetime: the timer is the backstop when the tick and the animationend are both missed", () => {
  const w = rig();
  w.run(1);
  w.slide.glassViewed = M.everyMs;
  w.run(TICK);
  const timer = w.timers.filter((x) => x.live).pop();
  assert.ok(timer.at - w.now >= M.showMs + M.fadeMs, "fires after the whole life");
  w.now = timer.at;
  timer.fn();
  assert.deepStrictEqual(showing(w), []);
});

// ---- the conditions that freeze the counter, and the ones that stop a draw ----

const freezes = {
  "the page is hidden / the slide is not on show (the card's _dirShown)": (w) => { w.shown = false; },
  "the switch is off": (w) => { w.lcd = false; },
  "the pet is asleep (a BUSY_OWNERS owner)": (w) => { w.slide.asleep = true; },
  "the status sheet is open": (w) => { w.slide.statusOpen = true; },
  "a care scene": (w) => { w.slide.scene = {}; },
  "a game": (w) => { w.slide.game = {}; },
  "a question": (w) => { w.slide.asking = true; },
  "a visitor": (w) => { w.slide.visitor = {}; },
  "the power-on screen": (w) => { w.slide.power = true; },
};
for (const [name, set] of Object.entries(freezes)) {
  test(`frozen: ${name} does not count and draws nothing`, () => {
    const w = rig();
    w.run(1);
    w.run(10 * TICK);
    const was = w.slide.glassViewed;
    set(w);
    w.run(5 * MIN);
    assert.strictEqual(w.slide.glassViewed, was, "the counter did not run");
    assert.deepStrictEqual(showing(w), []);
    w.slide.glassViewed = M.everyMs; // due, but not eligible while the owner holds
    w.run(10 * TICK);
    assert.deepStrictEqual(showing(w), [], "nothing drawn while it holds");
  });
}

test("reduced motion draws nothing, even when due; the mark waits and comes when motion is allowed", () => {
  const w = rig();
  w.run(1);
  w.calm = true;
  w.slide.glassViewed = M.everyMs;
  w.run(20 * TICK);
  assert.deepStrictEqual(showing(w), []);
  w.calm = false;
  w.run(TICK);
  assert.ok(showing(w).includes(M.on));
});

test("a shellImpulse track (an onset or echo on the glass or the rim) blocks the mark; persistent ambience does not", () => {
  const w = rig();
  w.run(1);
  w.dir.setAmbient(w.slide, { rain: true }); // wet: a still sheen
  w.slide.glassViewed = M.everyMs;
  w.run(TICK);
  assert.ok(showing(w).includes(M.on), "a paw on a wet window is allowed");
  w.card._markEnd(w.slide);
  const r = F.live(w.dir, w.slide, entry("rain_started", { id: "n1-1" }), ENV);
  assert.ok(r.accepted, JSON.stringify(r));
  assert.ok(w.dir.inspect(w.slide).tracks.shellImpulse);
  w.slide.glassViewed = M.everyMs;
  w.run(2 * TICK); // the drop's lease is 1.8 s
  assert.deepStrictEqual(showing(w), [], "blocked while the onset runs");
  w.run(4 * TICK);
  assert.ok(showing(w).includes(M.on), "and drawn once it is over (still due)");
});

test("no lease: a mark never writes s.dirEffect or offers the director anything, and a cue that starts mid-mark leaves it showing", () => {
  const w = rig();
  w.run(1);
  w.slide.glassViewed = M.everyMs;
  const offered = [];
  const real = w.dir.offer;
  w.card._director = { ...w.dir, offer: (...a) => { offered.push(a); return real(...a); } };
  w.run(TICK);
  assert.ok(showing(w).includes(M.on));
  assert.ok(!w.slide.dirEffect, "s.dirEffect untouched");
  assert.deepStrictEqual(offered, []);
  assert.strictEqual(w.dir.inspect(w.slide), null, "no track at all");
  const r = F.live(w.dir, w.slide, entry("rain_started", { id: "n2-1" }), ENV);
  assert.ok(r.accepted, JSON.stringify(r));
  w.run(5 * TICK);
  assert.ok(showing(w).includes(M.on), "the rain's start leaves the mark alone");
  w.dir.release(w.slide, w.slide.dirEffect);
  assert.ok(showing(w).includes(M.on), "and so does its release");
});

// ---- placement ----

test("placement: the first fixed spot clear of the pet and the things read or pressed; none clear means it waits, still due", () => {
  const w = rig();
  w.run(1);
  w.slide.glassViewed = M.everyMs;
  w.slide.pet = elOf(box(0, 100, 200, 300)); // the pet wandered to the left edge
  w.run(TICK);
  assert.ok(!showing(w).includes("dir-mark-bl") && !showing(w).includes("dir-mark-ml"), showing(w).join());
  assert.ok(showing(w).includes("dir-mark-br"), "the next spot that is clear");
  w.card._markEnd(w.slide);
  w.slide.glassViewed = M.everyMs;
  w.slide.basket = elOf(box(0, 0, 400, 300)); // something shown over the whole screen
  w.run(3 * TICK);
  assert.deepStrictEqual(showing(w), [], "no spot clear: nothing drawn, no stale classes");
  assert.ok(w.slide.glassViewed >= M.everyMs, "still due");
  w.slide.basket = elOf();
  w.run(TICK);
  assert.ok(showing(w).includes(M.on));
});

test("placement: each fixed spot is the one drawn when the spots before it are taken, through the real gate", () => {
  const order = [...M.spots];
  order.forEach((want, i) => {
    const w = rig();
    w.run(1);
    w.slide.glassViewed = M.everyMs;
    w.slide.pet = elOf(); // off the spots
    w.slide.attention = elOf();
    w.slide.bubble = elOf();
    // the spots before `want` are covered by things shown (one thing per spot)
    const holders = ["basket", "request", "gameBox", "pat"];
    order.slice(0, i).forEach((c, j) => { w.slide[holders[j]] = elOf(SPOT_BOX[c]); });
    w.run(TICK);
    assert.deepStrictEqual(showing(w).filter((c) => M.spots.includes(c)), [want]);
  });
});

// ---- reset points ----

test("reset: _markEnd(full) mid-mark clears the mark, the counter and the first-view flag, so the next pet starts at zero", () => {
  const w = rig();
  w.run(1);
  w.slide.glassViewed = M.everyMs;
  w.run(TICK);
  assert.ok(showing(w).includes(M.on));
  w.card._markEnd(w.slide, true);
  assert.deepStrictEqual(showing(w), []);
  assert.strictEqual(w.slide.glassViewed, 0);
  assert.strictEqual(w.slide.glassSeen, false);
  assert.strictEqual(w.slide.glassAt, 0);
  assert.ok(!w.slide.markUntil);
  w.slide.glassViewed = M.everyMs * 2; // a stale value cannot draw on the new pet's first view
  w.card._rareGlass(w.slide, w.now + TICK);
  assert.deepStrictEqual(showing(w), []);
});

test("reset: a swipe away hides the mark and the counter stops; the switch off clears it", () => {
  const w = rig();
  w.run(1);
  w.slide.glassViewed = M.everyMs;
  w.run(TICK);
  w.card._markEnd(w.slide); // _go on the slide that goes
  w.shown = false; // and it is no longer the one on show
  assert.deepStrictEqual(showing(w), []);
  const was = w.slide.glassViewed;
  w.run(5 * MIN);
  assert.strictEqual(w.slide.glassViewed, was);
  w.shown = true;
  w.run(1);
  w.slide.glassViewed = M.everyMs;
  w.run(TICK);
  assert.ok(showing(w).includes(M.on));
  w.lcd = false;
  const switchBody = src.match(/\n  _dirSwitch\(\) \{[\s\S]*?\n  \}\n/)[0];
  assert.match(switchBody, /if \(!lcdOn\(\)\) \{[\s\S]*this\._markEnd\(s\);/);
  w.card._markEnd(w.slide);
  assert.deepStrictEqual(showing(w), []);
});

test("source: _forget, _dirSwitch and _go call _markEnd; _tick calls the gate for the selected slide only", () => {
  assert.match(src, /this\._markEnd\(s, true\); \/\/ the rare glass mark/);
  assert.match(src, /this\._markEnd\(x\); \/\/ a rare glass mark is not shown/);
  assert.match(src, /if \(s === this\._slides\[this\._index\]\) this\._rareGlass\(s, Date\.now\(\)\);/);
});

// ---- no release ----

test("no release: a mark's animationend does not release a running lease, and a weather animation ending does not clear a mark", () => {
  const listeners = {};
  const glass = { addEventListener: (n, f) => { listeners.glass = f; } };
  const mark = { addEventListener: (n, f) => { listeners.mark = f; } };
  // The two real listeners, from the card's _buildSlide source.
  const glassL = src.match(/s\.glass\.addEventListener\("animationend", \(e\) => \{[\s\S]*?\n    \}\);/)[0];
  const markL = src.match(/s\.mark\.addEventListener\("animationend", \(e\) => \{[\s\S]*?\n    \}\);/)[0];
  const released = [];
  const ended = [];
  const self = { _director: { release: (...a) => released.push(a) }, _markEnd: (s) => ended.push(s) };
  const s = { glass, mark, dirEffect: 7 };
  vm.runInNewContext(`(function () { ${glassL}\n${markL} })`, { s })?.call(self);
  // A mark's end bubbles to the glass: the glass filter (e.target === s.glass) ignores it.
  listeners.glass({ target: mark, animationName: "dir-mark-life" });
  assert.deepStrictEqual(released, [], "a mark ending released nothing");
  // A weather layer's end on its <b> bubbles to the glass and never reaches the mark's own listener (a sibling).
  listeners.glass({ target: { nodeName: "B" }, animationName: "dir-layer-in" });
  assert.deepStrictEqual(ended, []);
  // The mark's own end ends it; another animation name on it does not.
  listeners.mark({ target: mark, animationName: "dir-mark-life" });
  listeners.mark({ target: mark, animationName: "dir-glass-life" });
  assert.strictEqual(ended.length, 1);
  // and the glass's own end still releases (the 3B behaviour is untouched)
  listeners.glass({ target: glass, animationName: "dir-glass-life" });
  assert.strictEqual(released.length, 1);
});

// ---- memory only ----

test("memory only: the gate reads no save field and writes no PetState, no localStorage, nothing on the wire", () => {
  const body = [method("_rareGlass"), method("_markClear"), method("_markEnd")].join("\n").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(body, /localStorage|callService|callWS|sendMessage|subscribe|fetch\(|_state\(|\.states\b|PetState|_hass|prefs|sessionStorage/);
  for (const f of ["glassViewed", "glassAt", "glassSeen", "markUntil", "markLast", "markTimer"]) assert.match(body, new RegExp(`s\\.${f}\\b`));
});

// ---- markup, layers, CSS ----

const glassStart = src.indexOf("  @supports (width: round(1px, 1px)) {\n    .hw.glass {");
const rimStart = src.indexOf("  /* The rim cues (device-alive 3C");
const glassCss = src.slice(glassStart, rimStart);
const markCss = rules(glassCss).filter(([sel]) => /\.mark\b/.test(sel));

test("markup: the glass is the seven <b> plus one <u class=\"mark\"> after them, and the slide holds it as s.mark", () => {
  assert.match(src, /<i class="hw glass" aria-hidden="true">(?:<b><\/b>){7}<u class="mark"><\/u><\/i>/);
  assert.match(src, /mark: q\("\.glass \.mark"\)/);
});

test("layers: CLASSES_BY_LAYER.mark is the kinds, the spots and dir-mark-on, all dir-mark-*, none on the glass or the rim", () => {
  assert.deepStrictEqual([...F.CLASSES_BY_LAYER.mark].sort(), [...M.kinds, ...M.spots, M.on].sort());
  for (const c of F.CLASSES_BY_LAYER.mark) assert.match(c, /^dir-mark-/);
  assert.deepStrictEqual([...M.kinds].map((c) => c.slice(9)), ["paw", "smudge", "edge"]);
  for (const [sel] of rules(glassCss)) {
    if (/\.mark\b/.test(sel)) continue;
    assert.doesNotMatch(sel, /dir-mark/, `a mark class on the glass or its layers: ${sel}`);
  }
  assert.doesNotMatch(strip(src.slice(rimStart)).split("</style>")[0].slice(0, 20000), /\.hw\.rim[^{]*dir-mark/);
});

test("CSS: every mark class has a rule on .hw.glass .mark; the mark uses neither pseudo-element, no fx-, no filter or blur, no infinite animation, no transform", () => {
  const text = markCss.map(([s, b]) => `${s} {${b}}`).join("\n");
  for (const c of F.CLASSES_BY_LAYER.mark) assert.match(text, new RegExp(`\\.${c}(?![a-z-])`), c);
  for (const [sel, body] of markCss) {
    assert.match(sel, /^(\.hw\.glass \.mark[.a-z-]*(, )?)+$/, sel);
    assert.doesNotMatch(sel, /::?(before|after)/);
    assert.doesNotMatch(`${sel} ${body}`, /\bfx-|filter|blur|infinite/);
    assert.doesNotMatch(body, /transform/, sel);
  }
  assert.ok(markCss.some(([s, b]) => /^\.hw\.glass \.mark$/.test(s) && /pointer-events:\s*none/.test(b)), "deaf to the pointer");
  const anim = markCss.filter(([, b]) => /animation/.test(b));
  assert.strictEqual(anim.length, 1);
  assert.match(anim[0][1], /animation:\s*dir-mark-life 22s linear both/);
  assert.match(glassCss, /@keyframes dir-mark-life \{[^}]*\{[^}]*opacity: 0[^}]*\}[^}]*\{[^}]*opacity: 1/);
  assert.match(glassCss, /90\.9% \{ opacity: 1; \}/, "20 of 22 s");
});

test("CSS: the .b rules and nth-child rules do not reach the mark, and reduced motion hides it", () => {
  const mark = "u"; // a <u>, not a <b>
  for (const [sel] of rules(glassCss)) if (/\.hw\.glass b/.test(sel)) assert.doesNotMatch(sel, /\.mark/);
  assert.match(glassCss, /@media \(prefers-reduced-motion: reduce\) \{ \.hw\.glass \.mark \{ display: none; \} \}/);
  assert.strictEqual(mark, "u");
});

test("CSS: nothing on a .cap or .toy gets a transform, animation or filter from the mark's rules", () => {
  for (const [sel] of markCss) assert.doesNotMatch(sel, /\.cap|\.toy/);
});

test("the spots are in the margin band: a side offset of 3% or less (plus the porthole's --edge), so the middle of the screen is never taken", () => {
  let n = 0;
  for (const [sel, body] of markCss) {
    if (!/dir-mark-(bl|br|ml|mr)\s*(\{|,|$)/.test(sel) || /paw|smudge|edge/.test(sel)) continue;
    n++;
    const side = body.match(/(?:left|right):\s*(?:calc\()?([\d.]+)%(?: \+ var\(--edge, 0%\)(?: \* \.25)?\))?;/);
    assert.ok(side && Number(side[1]) <= 3, `${sel}: ${body}`);
  }
  assert.strictEqual(n, 4, "one rule per spot");
});
