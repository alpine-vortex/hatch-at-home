// The shared effects pack on the card (art/effects, docs/art-wiring-status.md): _fxPack plays a shipped four-frame
// loop over the screen; _sparkleFx is the ring plus that loop. Cosmetic only. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { world } = require("./timer_trace");
const src = require("./card-source");

const ROOT = path.join(__dirname, "..", "..");
const UI = path.join(ROOT, "custom_components/virtual_pet/frontend/ui");
const PACK = JSON.parse(fs.readFileSync(path.join(ROOT, "art/effects/manifest.json"), "utf8"));
const packOnCard = () => {
  const m = /const FX_PACK = (\{[^}]*\});/.exec(src);
  assert.ok(m, "FX_PACK is in world.js");
  return Function(`return ${m[1]}`)();
};

function fx(spec = {}, { calm = false } = {}) {
  const w = world({
    ...spec, screen: true,
    globals: { FX_PACK: packOnCard(), FX_PACK_MS: 1700, ...(spec.globals || {}) },
  });
  w.calm = calm;
  return w;
}

test("every effect the card ships has its frames in ui/ and is in the drafts' manifest", () => {
  for (const [name, count] of Object.entries(packOnCard())) {
    assert.ok(PACK[name], `${name} is a drafted effect`);
    assert.strictEqual(PACK[name].frames.length, count, `${name} frame count`);
    for (let n = 1; n <= count; n++) assert.ok(fs.existsSync(path.join(UI, `fx_${name}_${n}.png`)), `fx_${name}_${n}.png`);
  }
});

test("_fxPack: a box of the loop's frames, staggered .2 s, removed at FX_PACK_MS", () => {
  const w = fx({ methods: ["_fxPack"] });
  w.card._fxPack(w.slide, "sparkle");
  const box = w.slide.screen.children[0];
  assert.strictEqual(box.className, "fxpack sparkle");
  assert.strictEqual(box.children.length, 4);
  assert.deepStrictEqual(box.children.map((i) => i.style.animationDelay), ["0.0s", "0.2s", "0.4s", "0.6s"]);
  assert.ok(box.children[0].src.includes("/ui/fx_sparkle_1.png"));
  w.settle();
  assert.deepStrictEqual(w.log.map((x) => `${x.t} ${x.op}`).filter((x) => /remove/.test(x)), ["1700 remove"]);
});

test("_fxPack: nothing under calm, nothing for an effect that is not shipped", () => {
  const c = fx({ methods: ["_fxPack"] }, { calm: true });
  c.card._fxPack(c.slide, "sparkle");
  assert.deepStrictEqual(c.log, []);
  const w = fx({ methods: ["_fxPack"] });
  w.card._fxPack(w.slide, "rainbow");
  assert.deepStrictEqual(w.log, []);
  assert.strictEqual(w.pendingTimers(), 0);
});

test("a second _fxPack replaces the first", () => {
  const w = fx({ methods: ["_fxPack"] });
  w.card._fxPack(w.slide, "sparkle");
  w.run(500);
  w.card._fxPack(w.slide, "sparkle");
  assert.strictEqual(w.slide.screen.children.length, 1);
});

test("_sparkleFx: the ring first, then the loop; both celebrations call it", () => {
  const w = fx({ methods: ["_sparkle", "_sparkleFx", "_fxPack"] });
  w.card._sparkleFx(w.slide);
  assert.deepStrictEqual(w.slide.screen.children.map((k) => k.className), ["burst big", "fxpack sparkle"]);
  assert.strictEqual((src.match(/this\._sparkleFx\(s\)/g) || []).length, 2);
});
