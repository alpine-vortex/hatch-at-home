// Species nature N4 (docs/plan-2026-11-02-species-nature.md "N4: the adult signature pose"):
// node --test tests/js. The real _idle and _idleMoves run against a stub card: a child picks from
// its own extras, an adult plays its species.json "signature" frames, a teen and a baby have no pose.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = require("./card-source");
const grab = (re) => {
  const m = src.match(re);
  assert.ok(m, `not in the card: ${re}`);
  return m[0];
};
const method = (name) => grab(new RegExp(`\\n  ${name}\\([^\\n]*\\{\\n[\\s\\S]*?\\n  \\}\\n`));

const ctx = {};
vm.runInNewContext([
  grab(/\nconst IDLE_MIN_MS = [^\n]*\n/),
  grab(/\nconst IDLE_SPREAD_MS = [^\n]*\n/),
  grab(/\nconst IDLE_BODY_MOVES = [^\n]*\n/),
  'const SHARED_POSES = new Set(["squint", "watch_tv"]);',
  "const calm = () => false;",
  // The pose whenever the move list offers it, else a look (a stub body move); a child's pick of its
  // own poses takes the first.
  'const pick = (list) => (list.includes("pose") ? "pose" : list.includes("look") ? "look" : list[0]);',
  `class Card {${["_idle", "_idleMoves"].map(method).join("")}
    _idleScale() { return 1; } _free() { return true; } _promisePractice() { return false; }
    _skyReact() { return false; } _typeAdds() { return []; } _speciesAdds() { return []; }
    _tricks() { return []; } _show(s, el, name) { s.shown = name; } _idleMove(s, m) { s.moved = m; }
    _words() { return {}; } _babySet() { return null; }
  }`,
  "this.out = { Card };",
].join("\n"), ctx);
const { Card } = ctx.out;

const species = {
  extras: { squint: "child_squint", watch_tv: "child_watch_tv", cache: ["child_cache_1", "child_cache_2"] },
  signature: { adult: ["adult_cache_1", "adult_cache_2"] },
};
const run = (drawn, sp = species) => {
  const s = { drawn, species: sp, moodState: "content", nextIdle: 1, screen: { classList: { contains: () => false } } };
  const card = new Card();
  let moves = null;
  const own = card._idleMoves;
  card._idleMoves = function (st, hasPose, isCalm) { moves = own.call(this, st, hasPose, isCalm); return moves; };
  card._idle(s);
  return { s, moves };
};

test("an adult with a signature plays its frames, two pose copies in the list", () => {
  const { s, moves } = run("adult");
  assert.deepStrictEqual([...s.poseFrames], ["adult_cache_1", "adult_cache_2"]);
  assert.strictEqual(s.shown, "adult_cache_1");
  assert.ok(s.poseUntil > Date.now());
  assert.strictEqual(moves.filter((m) => m === "pose").length, 2);
});

test("a child still picks its own extras, never the signature", () => {
  const { s } = run("child");
  assert.deepStrictEqual([...s.poseFrames], ["child_cache_1", "child_cache_2"]);
});

test("a teen, a baby and an adult without the key have no pose move", () => {
  for (const [drawn, sp] of [["teen", species], ["baby", species], ["adult", { extras: species.extras }],
    ["adult", { ...species, signature: { adult: [] } }]]) {
    const { s, moves } = run(drawn, sp);
    assert.ok(!moves.includes("pose"), `${drawn} ${JSON.stringify(sp.signature)}`);
    assert.strictEqual(s.poseFrames, undefined);
  }
});

test("every shipped signature is adult-only, two frames, and the reaction path never reads it", () => {
  const SPRITES = path.join(__dirname, "../../custom_components/virtual_pet/frontend/sprites");
  for (const d of fs.readdirSync(SPRITES)) {
    const f = path.join(SPRITES, d, "species.json");
    if (!fs.existsSync(f)) continue;
    const sig = JSON.parse(fs.readFileSync(f, "utf8")).signature;
    if (!sig) continue;
    assert.deepStrictEqual(Object.keys(sig), ["adult"], d);
    assert.strictEqual(sig.adult.length, 2, d);
  }
  assert.doesNotMatch(method("_react"), /signature/);
});
