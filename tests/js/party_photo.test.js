// Birthday plan 7.2: the journal's party print. The seat and cake math run here; the loader's
// guards (epoch, shared screen, journal closed) and the URL revokes are source-shape checks.
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");

const src = require("./card-source");
const grab = (re) => src.match(re)[0];
function method(name) {
  let start = src.indexOf(`\n  ${name}(`);
  if (start < 0) start = src.indexOf(`\n  async ${name}(`);
  assert.ok(start >= 0, name);
  return src.slice(start, src.indexOf("\n  }\n", start) + 4);
}
const ctx = vm.createContext({});
vm.runInContext(`${grab(/\nfunction partyHatSeat\([\s\S]*?\n\}\n/)}${grab(/\nfunction partyCakeBox\([\s\S]*?\n\}\n/)}` +
  "this.api = { partyHatSeat, partyCakeBox };", ctx);
const { partyHatSeat, partyCakeBox } = ctx.api;

test("the hat seat follows species.json as the costume does", () => {
  const none = () => null;
  // An exact point: no scan.
  assert.deepStrictEqual({ ...partyHatSeat({ hat: { adult: [120, 40, "exact"] } }, "adult", () => 99) }, { x: 120, top: 40 });
  // A point: the lower of it and the scanned head top.
  assert.deepStrictEqual({ ...partyHatSeat({ hat: { adult: [120, 40] } }, "adult", () => 52) }, { x: 120, top: 52 });
  assert.deepStrictEqual({ ...partyHatSeat({ hat: { adult: [120, 40] } }, "adult", none) }, { x: 120, top: 40 });
  // The content pose's own point wins over the stage's.
  assert.strictEqual(partyHatSeat({ hat: { adult: [120, 40], adult_content: [90, 30] } }, "adult", none).x, 90);
  // No hat point: the head point, scanned; nothing readable or a null pose: no hat.
  assert.deepStrictEqual({ ...partyHatSeat({ head: { child: [128, 96] } }, "child", () => 70) }, { x: 128, top: 70 });
  assert.strictEqual(partyHatSeat({ head: { child: [128, 96] } }, "child", none), null);
  assert.strictEqual(partyHatSeat({ hat: { adult_content: null }, head: { adult: [1, 2] } }, "adult", () => 5), null);
  assert.strictEqual(partyHatSeat({}, "adult", () => 5), null);
});

test("the cake stands beside the pet, inside the picture", () => {
  const at = { edge: 16, pic: 268, cx: 150, ratio: 160 / 140 };
  for (const box of [166, 300]) {
    for (const away of [-1, 1]) {
      const c = partyCakeBox({ ...at, box, away });
      assert.ok(c.x >= at.edge && c.x + c.w <= at.edge + at.pic, `${box} ${away}`);
      assert.ok(Math.abs(c.y + c.h - (at.edge + at.pic * 0.96)) < 1e-9);
      assert.ok(away > 0 ? c.x > at.cx : c.x + c.w < at.cx);
    }
  }
});

test("the row is own screen only and falls back to the cake icon", () => {
  const row = method("_partyRow");
  assert.match(row, /if \(sharedScreen\(\)\) return "";/);
  assert.match(row, /party_cake_lit\.png/);
  assert.match(row, /<figcaption>\$\{line\}<\/figcaption>/);
  assert.doesNotMatch(row, /psave|data-gen/); // no clash with the best-friend prints' save buttons
  assert.match(method("_partyPrintWant"), /stage === "egg" \|\| s\.egg/);
});

test("the draw bails when dropped, shared or closed, and every URL is revoked", () => {
  const draw = method("_drawPartyPrints");
  assert.match(draw, /const epoch = s\.photoEpoch \|\| 0;/);
  assert.match(draw, /\(s\.photoEpoch \|\| 0\) !== epoch[^\n]*sharedScreen\(\)[^\n]*!s\.journal\)/);
  assert.match(draw, /made\.forEach\(\(url\) => URL\.revokeObjectURL\(url\)\)/);
  assert.match(draw, /next\.get\(y\) !== p && p\.url\) URL\.revokeObjectURL/);
  assert.match(draw, /\{ party: \{ year: y \} \}/);
  const drop = method("_dropPhotos");
  assert.match(drop, /s\.partyPrints\?\.forEach\(\(p\) => \{ if \(p\.url\) URL\.revokeObjectURL\(p\.url\); \}\)/);
  assert.match(drop, /s\.partyLoad = null;/);
});

test("a best friend's photo is drawn as before (no party art without the flag)", () => {
  const render = method("_renderPhoto");
  assert.match(render, /\{ sprite = true, party = null \} = \{\}/);
  assert.match(render, /if \(party\) \{\n\s*const props = /);
  assert.match(render, /party \? PARTY_PRINT : "best friends ♥"/);
  assert.match(method("_printPhoto"), /this\._renderPhoto\(photo\)/);
});
