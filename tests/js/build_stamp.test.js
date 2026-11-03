// Settings shows "Hatch <VERSION> · <id>": the id is baked in by scripts/build-card.js (7 hex of the
// sha256 of the joined parts, placeholder in; no git), so a stale card is visible. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const src = require("./card-source.js");

test("the built card has the content id baked in, no placeholder left", () => {
  const m = src.match(/^const BUILD = "([^"]*)";$/m);
  assert.ok(m, "const BUILD is in the card");
  assert.match(m[1], /^[0-9a-f]{7}$/);
  assert.ok(!src.includes("__BUILD_ID__"));
});

test("the id is the content id: the joined text with the placeholder, hashed", () => {
  const { HEADER, SRC } = require("../../scripts/build-card.js");
  const fs = require("fs");
  const path = require("path");
  const raw = HEADER + fs.readFileSync(path.join(SRC, "manifest.txt"), "utf8").split("\n").map((l) => l.trim()).filter(Boolean)
    .map((f) => fs.readFileSync(path.join(SRC, f), "utf8")).join("");
  const id = require("crypto").createHash("sha256").update(raw).digest("hex").slice(0, 7);
  assert.strictEqual(src.match(/^const BUILD = "([^"]*)";$/m)[1], id);
});

test("Settings ends with the version and build line", () => {
  assert.match(src, /<div class="shellnote buildnote">Hatch \$\{VERSION\} · \$\{BUILD\}<\/div>/);
});
