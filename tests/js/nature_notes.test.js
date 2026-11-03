// Species nature N3 (docs/plan-2026-11-02-species-nature.md section 8 and 10): the 30 field notes
// in species.json, held to the card's copy rule, and the status page's one "nature" row.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { NAG } = require("../../scripts/copy-scan.js");
const src = require("./card-source");

const SPRITES = path.join(__dirname, "../../custom_components/virtual_pet/frontend/sprites");
const species = fs.readdirSync(SPRITES).filter((d) => fs.existsSync(path.join(SPRITES, d, "species.json")))
  .map((id) => ({ id, ...JSON.parse(fs.readFileSync(path.join(SPRITES, id, "species.json"), "utf8")) }));
// The hard ceiling. The bench measured no note that fits two lines at 330 (the value column is about 19
// characters wide there: the shortest, fox at 47, wraps to three), so no lower cap holds all 30; the
// measured counts are in the N3 report and the plan.
const CEILING = 60;
const BANNED = /\b(favou?rite|fond|loves?|best)\b/i;

test("every species has one field note, distinct, within the ceiling", () => {
  assert.strictEqual(species.length, 30);
  const notes = species.map((s) => s.field_note);
  for (const [i, note] of notes.entries()) {
    assert.ok(typeof note === "string" && note.length > 0, `${species[i].id} has a note`);
    assert.ok(note.length <= CEILING, `${species[i].id}: ${note.length} characters`);
  }
  assert.strictEqual(new Set(notes).size, notes.length, "two species share a note");
});

test("the notes keep the card's copy rule: no nag word, digit, ? or !, no liking word", () => {
  for (const s of species) {
    assert.ok(!NAG.test(s.field_note), `${s.id} nags: ${s.field_note}`);
    assert.ok(!/[0-9?!]/.test(s.field_note), `${s.id}: ${s.field_note}`);
    assert.ok(!BANNED.test(s.field_note), `${s.id} says a liking: ${s.field_note}`);
    assert.strictEqual(s.field_note.split(" · ").length, 3, `${s.id}: three clauses`);
  }
  // Word boundaries: "glove" and "clover" are fine.
  assert.ok(!BANNED.test("a glove in the clover") && BANNED.test("loves rain"));
});

test("a light performer does not hum or sing, and no solo species is alert at visitors", () => {
  for (const id of ["firefly", "lunamoth"]) {
    assert.ok(!/\b(hums?|sings?)\b/.test(species.find((s) => s.id === id).field_note), id);
  }
  for (const s of species.filter((x) => x.nature?.company === "solo")) {
    assert.ok(!/visitor|alert|sniffs the air/.test(s.field_note), s.id);
  }
});

test("the status page has one nature row, after the personality line, for a hatched pet and never the egg", () => {
  const start = src.indexOf("  _renderStatus(");
  assert.ok(start > 0);
  const body = src.slice(start, src.indexOf("\n  }\n", start));
  // Read from the pet's own species, only when it is not an egg (an egg's s.species is its world's first).
  assert.match(body, /const fieldNote = !isEgg && typeof s\.species\?\.field_note === "string" \? s\.species\.field_note : "";/);
  const rows = body.match(/\$\{fieldNote \?/g) || [];
  assert.strictEqual(rows.length, 1, "one nature row");
  const eggAt = body.indexOf("const html = isEgg ? `");
  const hatchedAt = body.indexOf("` : `", eggAt);
  const rowAt = body.indexOf("${fieldNote ?");
  assert.ok(rowAt > hatchedAt, "the row is in the hatched template, not the egg's");
  assert.ok(rowAt > body.indexOf('row(null, "personality"'), "after the personality line");
  assert.ok(rowAt < body.indexOf("${nextStage ?"), "before the next-stage row");
  // Not inside the teen-or-adult test: every hatched stage shows it.
  const line = body.slice(body.lastIndexOf("\n", rowAt), body.indexOf("\n", rowAt));
  assert.ok(!line.includes("teenOrAdult"), "no stage test on the row");
  assert.match(line, /naturerow/);
});
