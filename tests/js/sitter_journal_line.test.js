// The sitter's journal line on the card (docs/plan-2026-11-04-sitter-visits.md section 9, decided
// 2026-11-05): node --test tests/js
// "The sitter looked after <name>" (no period, the date after a comma), the row's own pet name
// first and the current one when it has none, escaped; at most 2 sitter_visit rows inside the
// newest 6 memories; other kinds read as before.
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");

const src = require("./card-source");
const grab = (re) => {
  const m = src.match(re);
  assert.ok(m, `not in the card: ${re}`);
  return m[0];
};
const method = (name) => grab(new RegExp(`\\n  (?:async )?${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`)).trim();

const ctx = {};
vm.runInNewContext([
  grab(/\nconst MEMORY_LABELS = \{[\s\S]*?\n\};\n/),
  grab(/\nconst MEMORY_LINES = \{[\s\S]*?\n\};\n/),
  grab(/\nconst MEMORIES_SHOWN = [^\n]*\n/),
  grab(/\nconst SITTER_MEMORIES_SHOWN = [^\n]*\n/),
  grab(/\nfunction escape\([\s\S]*?\n\}\n/),
  `const card = { ${method("_memories")} };`,
  "this.memories = (m, name) => card._memories(m, name);",
].join("\n"), ctx);

// Noon UTC, so the date is the same day anywhere within 12 hours.
const noon = (d) => Date.UTC(2026, 9, d, 12) / 1000;
const visit = (d, name) => ({ kind: "sitter_visit", at: noon(d), ...(name === undefined ? {} : { name }) });
const items = (html) => html.replace(/^.*memories: /, "").replace(/<\/span>.*$/, "").split(" · ");

test("the line is the sitter and the pet's name, no period, then the date", () => {
  const [one] = items(ctx.memories([visit(5, "Pip")], "Mochi"));
  assert.match(one, /^The sitter looked after Pip, Oct 5, 2026$/);
  assert.ok(!/\.,/.test(one));
});

test("an old generation keeps its own pet's name; a row without one uses the current", () => {
  const out = items(ctx.memories([visit(2, "Pip"), visit(3)], "Mochi"));
  assert.match(out[0], /^The sitter looked after Mochi, /); // newest first
  assert.match(out[1], /^The sitter looked after Pip, /);
});

test("the name is escaped, in the row and in the fallback", () => {
  const row = ctx.memories([visit(5, "<b>x</b>")], "Mochi");
  assert.ok(row.includes("looked after &#60;b&#62;x&#60;/b&#62;, "), row);
  assert.ok(!row.includes("<b>"));
  const current = ctx.memories([visit(5)], '"><img src=x>');
  assert.ok(!current.includes("<img"), current);
});

test("at most two sitter rows inside the newest six", () => {
  const rows = [
    { kind: "first_snow", at: noon(1) },
    visit(2, "Pip"), visit(3, "Pip"), visit(4, "Pip"),
    { kind: "season_spring", at: noon(5) },
  ];
  const out = items(ctx.memories(rows, "Pip"));
  assert.deepStrictEqual(out.map((t) => t.replace(/,.*/, "")),
    ["first day of spring", "The sitter looked after Pip", "The sitter looked after Pip", "first snow"]);
  // The two shown are the newest two.
  assert.match(out[1], /Oct 4/);
  assert.match(out[2], /Oct 3/);
});

test("the six are taken first, then the sitter's are limited", () => {
  const rows = [{ kind: "first_frost", at: noon(1) }, ...[2, 3, 4, 5, 6, 7].map((d) => visit(d, "Pip"))];
  const out = items(ctx.memories(rows, "Pip"));
  assert.strictEqual(out.length, 2); // the older first_frost is outside the six
  assert.ok(out.every((t) => t.startsWith("The sitter looked after Pip")));
});

test("other kinds read as before, and an unknown kind falls back", () => {
  const out = items(ctx.memories([{ kind: "first_fog", at: noon(1) }, { kind: "mystery_kind", at: noon(2) }], "Pip"));
  assert.match(out[1], /^first fog, /);
  assert.match(out[0], /^mystery kind, /);
});
