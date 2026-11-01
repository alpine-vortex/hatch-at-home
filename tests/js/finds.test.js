// worlds.json finds (plan visitors v2 §2 Data), as the card will read them: node --test tests/js
// Every find has an article ("a ", "an ", "some "), so no line says "a acorn"; every `when`
// token is a known flag (a typo would be a find that never comes); a visitor's `leaves`
// names a find of its own world.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const WORLDS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "custom_components", "virtual_pet", "frontend", "worlds.json"), "utf8"));
const TOKENS = new Set(["rainy", "snowy", "sunny", "foggy", "night", "full_moon", "autumn", "winter"]);

test("every world has 10 finds, one of them gift-only", () => {
  for (const [key, world] of Object.entries(WORLDS)) {
    assert.strictEqual(world.finds.length, 10, key);
    assert.strictEqual(world.finds.filter((f) => f.gift_only === true).length, 1, key);
  }
});

test("every find has a name and an article", () => {
  for (const [key, world] of Object.entries(WORLDS)) {
    for (const f of world.finds) {
      assert.ok(typeof f.name === "string" && f.name, `${key}/${f.id}`);
      assert.match(f.a, /^(a|an|some) /, `${key}/${f.id}: ${f.a}`);
      assert.ok(f.a.endsWith(f.name), `${key}/${f.id}: "${f.a}" names "${f.name}"`);
      const vowel = /^[aeiou]/.test(f.name);
      if (f.a.startsWith("a ")) assert.ok(!vowel, `${key}/${f.id}: "${f.a}"`);
      if (f.a.startsWith("an ")) assert.ok(vowel, `${key}/${f.id}: "${f.a}"`);
    }
  }
});

test("every when token is a known flag; [] and [[]] are not conditions", () => {
  for (const [key, world] of Object.entries(WORLDS)) {
    for (const f of world.finds) {
      if (f.when === null) continue;
      assert.ok(Array.isArray(f.when) && f.when.length, `${key}/${f.id}`);
      for (const clause of f.when) {
        assert.ok(Array.isArray(clause) && clause.length, `${key}/${f.id}`);
        for (const t of clause) assert.ok(TOKENS.has(t.replace(/^!/, "")), `${key}/${f.id}: ${t}`);
      }
    }
  }
});

test("find ids are unique across worlds, and a visitor leaves a find of its world", () => {
  const ids = Object.values(WORLDS).flatMap((w) => w.finds.map((f) => f.id));
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const [key, world] of Object.entries(WORLDS)) {
    const own = new Set(world.finds.filter((f) => !f.gift_only).map((f) => f.id));
    for (const v of world.visitors) if (v.leaves) assert.ok(own.has(v.leaves), `${key}/${v.id}: ${v.leaves}`);
  }
});
