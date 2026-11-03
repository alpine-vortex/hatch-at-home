// The motion composition rule (AGENTS.md "Motion on the card"): a one-shot body move is one
// `.pet.<cls> { animation }` on transform, one at a time. A new `.pet.*` animation rule must
// be added to ALLOWED on purpose. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");

const src = require("./card-source");

// Every class that some `.pet.<cls>` rule gives an `animation`.
const ALLOWED = new Set([
  // one-shots (and bounded repeats) on transform; _animate runs one at a time
  "bighop", "born", "breath", "breath-long", "chomp", "droop", "greethop", "jig", "lean", "lie",
  "munch", "pat-slow", "pat-soft", "perk", "puff", "rock", "rock2", "settle", "sigh", "startle",
  "stretch", "sulk",
  // flips on `rotate` (the individual property, so they compose with a transform keyframe)
  "spin", "twirl", "turn",
  // loops the existing code stops itself: hop/dance while excited, shiver while cold, resting breath
  "hop", "dance", "shiver", "resting",
]);

const animated = (css) => {
  const found = new Set();
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/\banimation\s*:/.test(m[2])) continue;
    for (const sel of m[1].split(",")) for (const c of sel.match(/\.pet\.[\w-]+/g) || []) found.add(c.slice(5));
  }
  return found;
};

test("every .pet.<cls> animation rule is on the allowed list", () => {
  const extra = [...animated(src)].filter((c) => !ALLOWED.has(c));
  assert.deepStrictEqual(extra, [], `new .pet animation class(es) ${extra.join(", ")}: read AGENTS.md "Motion on the card", then add to ALLOWED`);
});

test("the allowed list has no stale entries", () => {
  const found = animated(src);
  assert.deepStrictEqual([...ALLOWED].filter((c) => !found.has(c)), []);
});

test("the checker sees a new rule, a comma list and ignores comments", () => {
  assert.deepStrictEqual([...animated(".pet.zap { animation: zap 1s; }")], ["zap"]);
  assert.deepStrictEqual([...animated(".pet.a, .drape.a, .pet.b { animation: x 1s; }")].sort(), ["a", "b"]);
  assert.deepStrictEqual([...animated("/* .pet.no { animation: x } */ .pet.k { translate: 0 0; }")], []);
});
