// Resting, R1 (docs/plan-2026-11-02-favourite-resting.md §4.3-§4.6, test 19): node --test tests/js
// The lines pass the copy scan and each has a baby variant; the label shows for the "resting"
// flag only when the pet is up and home (never with the sitter's sign); the settings row is
// read-only on a shared screen; a "rest_ended" moment has its case.
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");
const { scanFreshCopy, COPY_TABLES } = require("../../scripts/copy-scan.js");

const src = require("./card-source");
const grab = (re) => {
  const m = src.match(re);
  assert.ok(m, `not in the card: ${re}`);
  return m[0];
};
const ctx = {};
vm.runInNewContext([
  grab(/\nconst RESTING_IDLE = [^\n]*\n/),
  grab(/\nconst REST_LINES = \{[\s\S]*?\n\};\n/),
  grab(/\nconst REST_LABEL = [^\n]*\n/),
  grab(/\nconst REST_HELP = [^\n]*\n/),
  grab(/\nfunction restLabel\([\s\S]*?\n\}\n/),
  grab(/\nfunction restRow\([\s\S]*?\n\}\n/),
  grab(/\nfunction escape\([\s\S]*?\n\}\n/),
  grab(/\nconst BABY = \{[\s\S]*?\n\};\n/),
  "this.out = { RESTING_IDLE, REST_LINES, REST_LABEL, restLabel, restRow, BABY };",
].join("\n"), ctx);
const { RESTING_IDLE, REST_LINES, REST_LABEL, restLabel, restRow, BABY } = ctx.out;

test("the resting lines are scanned and pass", () => {
  assert.ok(COPY_TABLES.RESTING_IDLE && COPY_TABLES.REST_LINES);
  const { bad, tables } = scanFreshCopy(src);
  assert.deepStrictEqual(bad, []);
  assert.ok(tables.includes("RESTING_IDLE") && tables.includes("REST_LINES"));
  assert.strictEqual(RESTING_IDLE.length, 4);
  for (const line of [...RESTING_IDLE, REST_LINES.visit, ...REST_LINES.back]) {
    assert.doesNotMatch(line, /neglect|waiting for you|missed you|\d/i, line);
  }
});

test("every resting line has a baby variant", () => {
  for (const key of ["idle.resting", "rest.visit", "rest.back"]) {
    assert.ok(BABY[key]?.baby?.length, key);
  }
});

test("the label shows for the resting flag only, up and about", () => {
  assert.strictEqual(restLabel(["resting"]), REST_LABEL);
  assert.strictEqual(REST_LABEL, "resting ☁");
  assert.strictEqual(restLabel(["resting", "cozy"]), REST_LABEL);
  assert.strictEqual(restLabel([]), "");
  assert.strictEqual(restLabel(["resting", "away"]), REST_LABEL, "the sitter's here: the resting label still shows (3.1)");
  assert.strictEqual(restLabel(["resting", "asleep"], { asleep: true }), "");
  assert.strictEqual(restLabel(["resting", "sick"]), "");
  assert.strictEqual(restLabel(["resting"], { egg: true }), "");
  assert.strictEqual(restLabel(undefined), "");
});

test("the old sign is never drawn; the resting label wins over the sitter's own", () => {
  const branch = grab(/this\._show\(s, s\.perch, sp\.perch\);[\s\S]*?s\.frames = this\._petFrames/);
  assert.doesNotMatch(branch, /awaysign/); // S4: the element is gone, not just hidden
  assert.doesNotMatch(branch, /props\?\.away/);
  assert.match(branch, /restLabel\(flags, \{ asleep, egg: s\.egg \}\)/);
  assert.match(branch, /rest \|\| \(sitter \? SITTER_LABEL : ""\)/);
});

test("the settings row: a switch at home, its state only on a shared screen", () => {
  const own = restRow(true, false, "Pip");
  assert.match(own, /<button class="bell resting"[^>]*aria-pressed="true"[^>]*>on<\/button>/);
  assert.match(own, /Pip won't get any hungrier, and doesn't grow up until it's back\. Visit any time\./);
  const shared = restRow(false, true, "Pip");
  assert.doesNotMatch(shared, /<button/);
  assert.match(shared, /<span class="restro">off<\/span>/);
  assert.match(shared, /Visit any time\./);
  assert.match(restRow(true, true, "<b>"), /&#60;b&#62; won't get any hungrier/); // the name is escaped
});

test("rest_ended has a moment case and a class; the row calls the websocket", () => {
  assert.match(src, /case "rest_ended":[\s\S]{0,200}REST_LINES\.back/);
  assert.match(src, /rest_ended: BEAT/);
  assert.match(src, /rest_started: FLAVOUR/);
  assert.match(src, /type: "virtual_pet\/rest", entity_id: id, enabled/);
});
