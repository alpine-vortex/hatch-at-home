// The fresh-expand copy scan (scripts/copy-scan.js), as card-check runs it: node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { scanFreshCopy } = require("../../scripts/copy-scan.js");

const src = fs.readFileSync(path.join(__dirname, "..", "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8");

test("every fresh-expand table is scanned and every line passes", () => {
  const { bad, tables } = scanFreshCopy(src);
  assert.deepStrictEqual(bad, []);
  assert.ok(tables.includes("PERSONA_FRESH"));
});

test("the scan catches a table left out, a long line, a nag and a question", () => {
  const extra = src.replace("// --- end fresh-expand copy ---",
    'const SNEAKY = ["is it still raining?", "' + "w".repeat(41) + '", "day 2"];\n// --- end fresh-expand copy ---');
  const { bad } = scanFreshCopy(extra);
  const text = bad.join(" | ");
  assert.match(text, /SNEAKY: not in COPY_TABLES/);
  assert.match(text, /nags/);
  assert.match(text, /asks/);
  assert.match(text, /41 long/);
  assert.match(text, /digit/);
});
