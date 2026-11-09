// Art S5: the floor decor pool. The card picks each side's piece with turnPick, once a day;
// the season replaces the right one only; a `deco_item_` piece is drawn big.
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const src = require("./card-source");
const grab = (re) => src.match(re)[0];
const worlds = JSON.parse(fs.readFileSync(path.join(__dirname, "../../custom_components/virtual_pet/frontend/worlds.json"), "utf8"));
const helpers = [
  grab(/\nconst dayOrdinal = [^\n]*\n/),
  grab(/\nconst turnHash = [\s\S]*?\n\};\n/),
  grab(/\nconst turnOrder = [\s\S]*?\n\};\n/),
  grab(/\nconst turnNow = [^\n]*\n/),
  grab(/\nfunction turnPick\([\s\S]*?\n\}\n/),
].join("");
// The deco block of _layout, run on two fake images.
const block = grab(/\n {4}this\._card\.querySelectorAll\("\.deco"\)[\s\S]*?\n {4}\}\);\n/);
// Simple harness: evaluate the block with a fake card. The shift is read off the context's globalThis.
let shiftNow = 0;
const shift = (d) => { shiftNow = d; };
test.afterEach(() => shift(0));
function layoutDeco(worldKey, season) {
  const world = worlds[worldKey];
  const s = { worldKey, world };
  const imgs = [0, 1].map(() => {
    const cls = new Set();
    return { style: {}, attrs: {}, cls, getAttribute(k) { return this.attrs[k]; }, set src(v) { this.attrs.src = v; },
      classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) } };
  });
  const fake = { _card: { querySelectorAll: () => ({ forEach: (f) => imgs.forEach(f) }) } };
  vm.runInNewContext(`${helpers}
    const BASE = "b", VERSION = "v"; const seasonNow = () => season;
    (function () { ${block.replace(/this\._card/, "card._card")} }).call(null);`,
  { card: fake, world, s, season, imgs, Date, __hatchDayShift: shiftNow });
  return imgs.map((i) => ({ src: String(i.attrs.src || "").replace(/^b\/ui\/|\.png\?v=v$/g, ""), big: i.cls.has("big") }));
}



test("the pick is stable within a day", () => {
  for (const w of Object.keys(worlds)) assert.deepStrictEqual(layoutDeco(w, null), layoutDeco(w, null));
});

test("left and right are never the same piece over 30 days, and each item is drawn big", () => {
  for (const w of Object.keys(worlds)) {
    const seen = new Set();
    for (let d = 0; d < 30; d++) {
      shift(d);
      const [l, r] = layoutDeco(w, null);
      assert.notStrictEqual(l.src, r.src, `${w} day ${d}`); seen.add(l.src);
      assert.strictEqual(l.big, l.src.startsWith("deco_item_"));
      assert.strictEqual(r.big, r.src.startsWith("deco_item_"));
    }
    assert.strictEqual(seen.size, 3, `${w}: the left cycles through its pool`);
  }
});

test("a season replaces the right one only", () => {
  for (const w of Object.keys(worlds)) {
    const [l, r] = layoutDeco(w, { key: "winter" });
    assert.strictEqual(r.src, "season_winter_deco");
    assert.strictEqual(r.big, false);
    assert.ok(worlds[w].deco_pool.left.includes(l.src), `${w} ${l.src}`);
  }
});

test("a world with no pool falls back to deco", () => {
  const w = JSON.parse(JSON.stringify(worlds.woodland));
  delete w.deco_pool;
  worlds.__old = w;
  assert.deepStrictEqual(layoutDeco("__old", null).map((i) => i.src), w.deco);
  delete worlds.__old;
});
