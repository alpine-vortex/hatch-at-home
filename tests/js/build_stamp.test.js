// Settings shows "Hatch <VERSION> · <short sha>": the sha is baked in by scripts/build-card.js
// (a git sha, or "dev" with no .git), so a stale card is visible. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const src = require("./card-source.js");

test("the built card has the sha baked in, no placeholder left", () => {
  const m = src.match(/^const BUILD = "([^"]*)";$/m);
  assert.ok(m, "const BUILD is in the card");
  assert.match(m[1], /^([0-9a-f]{4,40}|dev)$/);
  assert.ok(!src.includes("__BUILD_SHA__"));
});

test("Settings ends with the version and build line", () => {
  assert.match(src, /<div class="shellnote buildnote">Hatch \$\{VERSION\} · \$\{BUILD\}<\/div>/);
});
