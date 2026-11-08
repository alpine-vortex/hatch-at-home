// Director migration slice X1 (B2, docs/plan-2026-11-06-director-migration.md 5.X1, G6): a hidden TAB ends the
// decorative one-shots at once, so a timer held back by the browser cannot leave a stale flair, box or class on
// return. Each listed entry is drained by hidden("tab") (its undo runs, once) and does nothing again at its due
// time; hidden("offscreen") changes nothing; entries that are not listed (the backlight, the breeze, state
// side effects) still fire on time. Fake clock, the card's own methods. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { world } = require("./timer_trace");

const ROOT = path.join(__dirname, "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const ctx0 = { Date, Object, Array, Number, Math, JSON };
vm.runInNewContext(`${read("src/card/interaction-director.js")}\n${read("src/card/device-fx.js")}\nthis.F = HATCH_DEVICE_FX;`, ctx0);
const F = ctx0.F;

const removes = (w, name) => w.log.filter((e) => e.el === name && /remove|class-/.test(e.op));
const boxOf = (w) => w.slide.screen.children[w.slide.screen.children.length - 1];

// Each case arms one listed entry and says how long it lives and how to see it gone.
const CASES = [
  { name: "flair box", ms: 4200, spec: { methods: ["_flair"], consts: ["FLAIR_MS"], slide: () => ({ species: { head: {} }, pet: undefined }),
    returns: { _state: { state: "adult", attributes: { traits: ["glow"], trait_levels: {} } } }, globals: { FLAIR: { glow: { place: "head" } } } },
    arm: (w) => w.card._flair(w.slide, "glow") },
  { name: "confetti", ms: 3600, spec: { methods: ["_confetti"] }, arm: (w) => w.card._confetti(w.slide) },
  { name: "hearts", ms: 2800, spec: { methods: ["_bondHearts"] }, arm: (w) => w.card._bondHearts(w.slide, "carehearts", 2) },
  { name: "sparkle ring", ms: 600, spec: { methods: ["_sparkle"] }, arm: (w) => w.card._sparkle(w.slide) },
  { name: "bubble pop", ms: 1300, spec: { methods: ["_bubblePop"], consts: ["BUBBLE_POP_ODDS"],
    globals: { Math: Object.assign(Object.create(Math), { random: () => 0 }), BASE: "", VERSION: "1" } },
    arm: (w) => w.card._bubblePop(w.slide) },
];

for (const c of CASES) {
  test(`${c.name}: hidden("tab") takes it away at once and nothing happens at its due time`, () => {
    const w = world({ screen: true, ...c.spec, globals: { HATCH_DEVICE_FX: F, lcdOn: () => true, ...(c.spec.globals || {}) } });
    c.arm(w);
    w.run(10);
    const before = w.director.pending(w.slide);
    assert.ok(before >= 1, "armed");
    const logged = w.log.length;
    w.director.hidden("tab");
    const gone = w.log.slice(logged).filter((e) => /remove/.test(e.op));
    assert.strictEqual(gone.length, 1, "the node is removed once, at once");
    assert.strictEqual(w.director.pending(w.slide), 0);
    w.settle();
    assert.strictEqual(w.log.filter((e) => /remove/.test(e.op) && e.el === gone[0].el).length, 1, "and not again at its due time");
  });
  test(`${c.name}: hidden("offscreen") changes nothing; it ends on time`, () => {
    const w = world({ screen: true, ...c.spec, globals: { HATCH_DEVICE_FX: F, lcdOn: () => true, ...(c.spec.globals || {}) } });
    c.arm(w);
    w.run(10);
    const logged = w.log.length;
    w.director.hidden("offscreen");
    assert.strictEqual(w.log.length, logged);
    w.run(c.ms - 10 - 1);
    assert.strictEqual(w.log.filter((e) => /remove/.test(e.op)).length, 0, "still up just before its end");
    w.settle();
    assert.strictEqual(w.log.filter((e) => /remove/.test(e.op)).length, 1, "removed at its end");
  });
}

test("house fx and robot: the class is off at once on a hidden tab, and not again at its end; a scroll-off keeps it", () => {
  for (const [method, cls, ms] of [["_houseFx", "fx-heat", 2500], ["_robotFx", "fx-robot", 6000]]) {
    const w = world({ methods: [method], screen: true });
    w.card[method](w.slide, cls);
    w.run(100);
    w.director.hidden("offscreen");
    assert.ok(w.slide.screen.cls.has(cls), `${method} kept on offscreen`);
    w.director.hidden("tab");
    assert.ok(!w.slide.screen.cls.has(cls), `${method} off on a hidden tab`);
    const n = w.log.filter((e) => e.op === "class-" && e.arg === cls).length;
    w.settle();
    assert.strictEqual(w.log.filter((e) => e.op === "class-" && e.arg === cls).length, n, `${method} not again at ${ms}`);
  }
});

test("entries that are not listed still fire on time after a hidden tab (backlight, breeze)", () => {
  const w = world({ methods: [], screen: true });
  w.card._hold(w.slide, w.slide.screen, ["lit"], 3000, { key: "lit" });
  w.card._hold(w.slide, w.slide.screen, ["breezy"], 2600, { key: "breezy" });
  w.director.hidden("tab");
  assert.ok(w.slide.screen.cls.has("lit") && w.slide.screen.cls.has("breezy"), "both still on");
  w.run(2600);
  assert.ok(!w.slide.screen.cls.has("breezy") && w.slide.screen.cls.has("lit"));
  w.run(400);
  assert.ok(!w.slide.screen.cls.has("lit"));
});

test("the listed sites carry hidden: \"tab\" and the unlisted state-changing ones do not (source guard)", () => {
  const files = ["card-flair", "card-season", "card-moment", "card-visit", "card-tick", "card-visitors"];
  const tabbed = files.reduce((n, f) => n + (read(`src/card/${f}.js`).match(/hidden: "tab"/g) || []).length, 0);
  assert.strictEqual(tabbed, 11, "flair 1, season 3, bubble pop 1, hearts, sparkle, house fx, robot, speck, find ring");
  const all = fs.readdirSync(path.join(ROOT, "src/card")).filter((f) => f.endsWith(".js") && f !== "interaction-director.js")
    .reduce((n, f) => n + (read(`src/card/${f}`).match(/hidden: "tab"/g) || []).length, 0);
  assert.strictEqual(all, 11 + 0, "no other site is on the tab policy");
});
