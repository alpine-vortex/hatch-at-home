// The sitter's rules (src/card/sitter-engine.js; sitter plan S3a, 6.2-6.4, F3, F5, F7, F8): pure,
// run on the part as the card loads it. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const part = fs.readFileSync(path.join(ROOT, "src", "card", "sitter-engine.js"), "utf8");
const ctx = {};
vm.runInNewContext(`${part}\nthis.S = HATCH_SITTER;`, ctx);
const S = ctx.S;
const plain = (x) => JSON.parse(JSON.stringify(x)); // across the vm's realm
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "custom_components/virtual_pet/frontend/sitter/sitters.json"), "utf8"));
const base = manifest.sitters[manifest.base];
// A look: stand and wave only (the art of looks/<finish>), the shape F3 is about.
const look = { poses: { stand: ["stand_1", "stand_2"], wave: ["wave_1"] } };

test("the part is in the built card, before the class chain, and is one frozen namespace", () => {
  const src = require("./card-source");
  assert.ok(src.indexOf("const HATCH_SITTER = (") > 0);
  assert.ok(src.indexOf("const HATCH_SITTER = (") < src.indexOf("class HatchPetCardBase"));
  assert.deepStrictEqual(Object.keys(vm.runInNewContext(`${part}\nthis`, {})), []);
  assert.deepStrictEqual(part.match(/^(?:const|let|var|function|class|async)\b[^\n]*/gm), ["const HATCH_SITTER = (() => {"]);
  assert.ok(Object.isFrozen(S));
});

test("the part touches no DOM and no clock", () => {
  assert.doesNotMatch(part.replace(/\/\/[^\n]*/g, ""), /(?<!")\b(document|window|Date\.now|setTimeout|Math\.random|this)\b(?!")/);
});

test("S3a picks the base sitter for any shell (S3b reads by_finish here)", () => {
  for (const finish of [null, "gingham", "nonsense"]) assert.strictEqual(S.pick(manifest, finish).id, manifest.base);
  assert.strictEqual(S.pick({}, null), null);
});

test("every pose the rules play is in the base sitter; tuck and shoo are not played", () => {
  for (const pose of [...S.CUES, ...S.IDLES, "walk", "wave", "stand", "read", "doze", "cheer", "chair"]) assert.ok(S.has(base, pose), pose);
  assert.deepStrictEqual(plain(S.UNUSED), ["tuck", "shoo"]);
  for (const pose of S.UNUSED) assert.ok(![...S.CUES, ...S.IDLES].includes(pose));
});

test("a look has only stand and wave: the other poses are missing, never swapped (F3)", () => {
  assert.ok(!S.has(look, "feed"));
  assert.deepStrictEqual(plain(S.frames(look, "feed")), []);
  assert.deepStrictEqual(plain(S.idle("seed", 0, look)), null, "no idle without a pose of its own");
});

test("a round's cue: its poses in order, two at most, and the tidy alone is half length (F7)", () => {
  assert.deepStrictEqual(plain(S.cue(["feed", "play", "clean"])), { poses: ["feed", "play"], tidy: false });
  assert.deepStrictEqual(plain(S.cue(["clean"])), { poses: ["clean"], tidy: true });
  assert.deepStrictEqual(plain(S.cue(["clean", "medicine"])), { poses: ["clean", "medicine"], tidy: false });
  assert.deepStrictEqual(plain(S.cue(["feed", "feed"])), { poses: ["feed"], tidy: false });
  assert.strictEqual(S.cue([]), null);
  assert.strictEqual(S.cue(["nap", "tuck"]), null);
  assert.strictEqual(S.cue(null), null);
});

test("F7: the first snapshot never cues; a later round does; the same round does not repeat", () => {
  assert.strictEqual(S.isNew(undefined, { at: 100, did: ["feed"] }), false);
  assert.strictEqual(S.isNew(0, { at: 100 }), true);
  assert.strictEqual(S.isNew(100, { at: 100 }), false);
  assert.strictEqual(S.isNew(100, { at: 99 }), false);
  assert.strictEqual(S.isNew(100, null), false);
});

test("F8: the arrival bubble is a pure function of the visit's start minute", () => {
  assert.strictEqual(S.arriveLine(Date.UTC(2026, 10, 4, 9, 0, 5)), 0);
  assert.strictEqual(S.arriveLine(Date.UTC(2026, 10, 4, 9, 1, 5)), 1);
  assert.strictEqual(S.arriveLine(Date.UTC(2026, 10, 4, 9, 2, 59)), 0);
});

test("idles: a day's seed gives the same ones; each wait is 2 to 4 minutes; only the idle poses", () => {
  const a = Array.from({ length: 30 }, (_, n) => plain(S.idle("20000|dev", n, base)));
  assert.deepStrictEqual(a, Array.from({ length: 30 }, (_, n) => plain(S.idle("20000|dev", n, base))));
  assert.notDeepStrictEqual(a.map((x) => x.pose), Array.from({ length: 30 }, (_, n) => S.idle("20001|dev", n, base).pose));
  for (const { pose, wait } of a) {
    assert.ok(S.IDLES.includes(pose));
    assert.ok(wait >= 120000 && wait <= 240000, wait);
  }
  assert.ok(new Set(a.map((x) => x.pose)).size > 3, "a day is not one idle");
  assert.deepStrictEqual(plain(S.idle("s", 0, { ...base, idles: ["tea"] })).pose, "tea"); // a sitter's own list (the granny's knit)
});

test("hold: doze at night; read when Pip sleeps or after 20 quiet minutes; stand in a scene; one change per 90 s", () => {
  const day = { night: false, asleep: false, busy: false, quietMs: 0, now: 1000 };
  assert.strictEqual(S.hold(base, { ...day, night: true }, null).pose, "doze");
  assert.strictEqual(S.hold(base, day, null).pose, "stand");
  assert.strictEqual(S.hold(base, { ...day, asleep: true }, null).pose, "read");
  assert.strictEqual(S.hold(base, { ...day, quietMs: 20 * 60000 }, null).pose, "read");
  assert.strictEqual(S.hold(base, { ...day, quietMs: 19 * 60000 }, null).pose, "stand");
  assert.strictEqual(S.hold(base, { ...day, asleep: true, busy: true }, null).pose, "stand", "a scene or a game: it stands");
  const stood = S.hold(base, day, null);
  const held = S.hold(base, { ...day, asleep: true, now: 1000 + 89000 }, stood);
  assert.strictEqual(held.pose, "stand", "under 90 s: no change");
  assert.strictEqual(S.hold(base, { ...day, asleep: true, now: 1000 + 90000 }, stood).pose, "read");
  assert.strictEqual(S.hold(look, { ...day, night: true }, null).pose, "stand", "a look without a doze stands (6.2)");
});

test("beats: arrival is the walk then a wave; leaving is a wave, then the walk mirrored (no frames of its own)", () => {
  const arrive = plain(S.beat("arrive", base));
  assert.deepStrictEqual(arrive.map((x) => x.pose), ["walk", "wave"]);
  assert.ok(arrive[0].enter);
  const leave = plain(S.beat("leave", base));
  assert.deepStrictEqual(leave.map((x) => x.pose), ["wave", "walk"]);
  assert.ok(leave[1].exit && leave[1].flip);
  assert.ok(!S.has({ poses: { walk: ["walk_1"] } }, "walk_out"), "no separate walk-out pose");
  assert.deepStrictEqual(plain(S.beat("arrive", look)).map((x) => x.pose), ["walk", "wave"], "a look's walk is its stand frames, sliding");
  assert.ok(S.MS.walk + S.MS.wave <= 3000);
});
