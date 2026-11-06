// Memory M3b (docs/plan-2026-11-02-memory.md section 9, owner Q1/Q2 2026-11-05): a sticker per
// big_day tag of the six, on and after the tagged day (the server's `today`), never before;
// none for a weekend, work_thing or something_else; no count; each labelled with the tag's
// label; derived from `tags` (a forget removes the entry, so the sticker); the six art files ship.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const src = require("./card-source");

const grab = (re) => { const m = src.match(re); assert.ok(m, `not in the card: ${re}`); return m[0]; };
const method = (name) => grab(new RegExp(`\\n  (?:async )?${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`)).trim();

function load() {
  const ctx = { Date, Set, Array };
  vm.runInNewContext([
    grab(/\nconst MEMORY_STICKER_TAGS = [^\n]*\n/),
    grab(/\nconst MEMORY_TAG_CHIPS = \{[\s\S]*?\n\};\n/),
    "const serverNow = () => Date.now(); const BASE = '/b'; const VERSION = 'v';",
    grab(/\nfunction pixelIcon\([\s\S]*?\n\}\n/),
    grab(/\nfunction escape\([\s\S]*?\n\}\n/),
    `const card = { _hass: {}, ${method("_memoryToday")}, ${method("_memoryStickers")}, ${method("_memoryStickerHtml")} };`,
    "this.card = card;",
  ].join("\n"), ctx);
  return ctx.card;
}
const tag = (day, t, kind = "big_day") => ({ day, kind, tag: t });

test("a sticker shows on and after the tagged day, never before", () => {
  const card = load();
  const data = { today: "2026-11-06", tags: [tag("2026-11-06", "party"), tag("2026-11-07", "show"), tag("2026-10-01", "exam")] };
  assert.deepStrictEqual(Array.from(card._memoryStickers(data)), ["exam", "party"]);
});

test("no sticker for a weekend, work_thing, something_else or an unknown tag", () => {
  const card = load();
  const data = { today: "2026-11-06", tags: [tag("2026-10-01", "trip", "weekend"), tag("2026-10-01", "work_thing"),
    tag("2026-10-01", "something_else"), tag("2026-10-01", "interview"), null, { tag: "exam" }] };
  assert.deepStrictEqual(Array.from(card._memoryStickers(data)), []);
  assert.strictEqual(card._memoryStickerHtml(data), "");
});

test("one per tag, in a fixed order, labelled, with no count; forgetting the entry takes it away", () => {
  const card = load();
  const data = { today: "2026-11-06", tags: ["lesson", "match", "match", "exam", "show", "trip", "party"].map((t, i) => tag(`2026-10-0${i + 1}`, t)) };
  assert.deepStrictEqual(Array.from(card._memoryStickers(data)), ["exam", "match", "show", "trip", "party", "lesson"]);
  const html = card._memoryStickerHtml(data);
  assert.strictEqual((html.match(/class="msticker"/g) || []).length, 6);
  for (const t of ["exam", "match", "show", "trip", "party", "lesson"]) {
    assert.ok(html.includes(`aria-label="${t}"`), t);
    assert.ok(html.includes(`icon_sticker_${t}.png`), t);
  }
  assert.ok(!/\d+ of \d+|\bx\d|streak/i.test(html.replace(/icon_sticker_\w+\.png\?v=v|width="48"|height="48"|\/b\/ui\//g, "")));
  data.tags = data.tags.filter((e) => e.tag !== "show");
  assert.ok(!card._memoryStickers(data).includes("show"));
});

test("the six sticker files ship", () => {
  const dir = path.join(__dirname, "..", "..", "custom_components", "virtual_pet", "frontend", "ui");
  for (const t of ["exam", "match", "show", "trip", "party", "lesson"]) {
    assert.ok(fs.existsSync(path.join(dir, `icon_sticker_${t}.png`)), t);
  }
});
