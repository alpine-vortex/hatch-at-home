// The fresh-expand copy scan (scripts/copy-scan.js), as card-check runs it: node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { scanFreshCopy } = require("../../scripts/copy-scan.js");

const src = require("./card-source");

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

test("an aria-only key (`aria`) may run past 40 characters, and still may not nag", () => {
  const swap = (from, to) => {
    const out = src.replace(from, to);
    assert.notStrictEqual(out, src, `no ${from} in the card`);
    return scanFreshCopy(out).bad.join(" | ");
  };
  const long = "w".repeat(45);
  // aria_forget is MEMORY_PAGE's aria-label: long passes, a nag word does not
  assert.doesNotMatch(swap("aria_forget: (row) => `forget this: ${row}`", `aria_forget: (row) => \`${long} \${row}\``), /aria_forget/);
  assert.match(swap("aria_forget: (row) => `forget this: ${row}`", "aria_forget: (row) => `still ${row}`"), /aria_forget: .* nags/);
  // a key on screen in the same table keeps its cap
  assert.match(swap('stop: "stop remembering"', `stop: "${long}"`), /MEMORY_PAGE\.stop: .* 45 long/);
});
