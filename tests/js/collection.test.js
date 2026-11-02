// The finds page's tiles (plan visitors v2 §4, V-D): node --test tests/js
// The card isn't a module: collectionTiles (and visitorList, which it uses) are read from
// its source. Per world: the three visitors, met ones drawn and the rest silhouettes; a
// find with a `when` and a gift-only find have no tile until met (owner, 2026-11-02); the
// viewer's gifts are drawn with a ♥ on their own screen only (V-E review #19/#20); a
// gift-only id in the house's `finds` map, and ids worlds.json lacks, never show (D7).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FRONTEND = path.join(__dirname, "..", "..", "custom_components", "virtual_pet", "frontend");
const src = require("./card-source");
const grab = (re) => src.match(re)[0];
const ctx = {};
vm.runInNewContext(`const VISITOR_PLAY = ${src.match(/\nconst VISITOR_PLAY = (\{[\s\S]*?\n\});/)[1]};
${grab(/\nconst visitorList = [\s\S]*?;\n/)}
${grab(/\nconst collectionTiles = [\s\S]*?\n\};\n/)}
this.collectionTiles = collectionTiles;`, ctx);
const { collectionTiles } = ctx;
const WORLDS = JSON.parse(fs.readFileSync(path.join(FRONTEND, "worlds.json"), "utf8"));
const plain = (w) => w.finds.filter((f) => !f.gift_only && !(f.when && f.when.length));
const hidden = (w) => w.finds.filter((f) => !f.gift_only && f.when && f.when.length);
const giftOnly = (w) => w.finds.find((f) => f.gift_only);
const finds = (tiles) => tiles.filter((t) => t.kind === "find");
const byId = (tiles, id) => tiles.find((t) => t.id === id);

for (const [key, w] of Object.entries(WORLDS)) {
  test(`${key}: an empty page is three visitor silhouettes and its plain finds as silhouettes`, () => {
    const tiles = collectionTiles(w, { world: key, visitors: [], finds: {} }, true);
    const vis = tiles.filter((t) => t.kind === "visitor");
    assert.strictEqual(vis.length, 3);
    assert.ok(vis.every((t) => !t.met && !t.heart));
    assert.deepStrictEqual(finds(tiles).map((t) => t.id), plain(w).map((f) => f.id));
    assert.ok(finds(tiles).every((t) => !t.met && !t.heart));
  });

  test(`${key}: met tiles are drawn; a when-find shows once met; the gift-only and unknown ids never (D7)`, () => {
    const p = plain(w);
    const h = hidden(w)[0];
    const g = giftOnly(w);
    const reply = { world: key, visitors: [w.visitors[0].id, "latervisitor"],
      finds: { [p[0].id]: "2026-11-01", ...(h ? { [h.id]: "2026-11-01" } : {}), [g.id]: "2026-11-01", laterfind: "2026-11-01" } };
    const tiles = collectionTiles(w, reply, true);
    assert.strictEqual(byId(tiles, w.visitors[0].id).met, true);
    assert.strictEqual(byId(tiles, w.visitors[1].id).met, false);
    assert.strictEqual(byId(tiles, p[0].id).met, true);
    if (h) assert.strictEqual(byId(tiles, h.id).met, true);
    for (const other of hidden(w).slice(1)) assert.strictEqual(byId(tiles, other.id), undefined, other.id);
    assert.strictEqual(byId(tiles, g.id), undefined, "a gift-only id in the house map has no tile");
    assert.strictEqual(byId(tiles, "laterfind"), undefined);
    assert.strictEqual(byId(tiles, "latervisitor"), undefined);
    assert.ok(tiles.every((t) => !t.heart));
  });

  test(`${key}: the viewer's gifts get a ♥ on their own screen, drawn even if the house never found them`, () => {
    const p = plain(w);
    const h = hidden(w)[0];
    const g = giftOnly(w);
    const reply = { world: key, visitors: [], finds: { [p[0].id]: "2026-11-01" },
      gifts: [p[0].id, p[1].id, g.id, ...(h ? [h.id] : []), "laterfind"] };
    const own = collectionTiles(w, reply, true);
    for (const id of [p[0].id, p[1].id, g.id, ...(h ? [h.id] : [])]) {
      assert.deepStrictEqual([byId(own, id)?.met, byId(own, id)?.heart], [true, true], id);
    }
    assert.strictEqual(byId(own, p[2].id).heart, false);
    assert.strictEqual(byId(own, "laterfind"), undefined);
    // The gift-only find keeps its place, last.
    assert.strictEqual(finds(own).at(-1).id, g.id);
    // Not the viewer's own screen: gifts are ignored even if a reply carried them.
    const shared = collectionTiles(w, reply, false);
    assert.ok(shared.every((t) => !t.heart));
    assert.strictEqual(byId(shared, g.id), undefined);
    assert.strictEqual(byId(shared, p[1].id).met, false, "a gift alone never credits the house");
    if (h) assert.strictEqual(byId(shared, h.id), undefined);
  });
}

test("a bad or missing reply draws silhouettes, never throws", () => {
  const w = WORLDS.woodland;
  for (const reply of [null, {}, { visitors: "x", finds: null, gifts: "acorncup" }]) {
    const tiles = collectionTiles(w, reply, true);
    assert.ok(tiles.every((t) => !t.met && !t.heart));
  }
  assert.deepStrictEqual(Array.from(collectionTiles(undefined, {}, true)), []);
});
