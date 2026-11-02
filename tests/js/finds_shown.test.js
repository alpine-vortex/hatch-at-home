// The release switch (owner, 2026-11-01): FINDS_SHOWN is on with V-F's final art, and
// the card reads it only through HatchPetCard.findsShown (card-check and the bench can
// set it false to test the off path). node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = require("./card-source");

test("FINDS_SHOWN ships on, and the static starts from it", () => {
  assert.match(src, /\nconst FINDS_SHOWN = true;\n/);
  assert.match(src, /\nHatchPetCard\.findsShown = FINDS_SHOWN;/);
  assert.match(src, /\nconst findsShown = \(\) => !!HatchPetCard\.findsShown;\n/);
});

test("the basket, the gift take, the away note's found bit and the finds grid all ask findsShown()", () => {
  const body = (name) => src.match(new RegExp(`\\n  (?:async )?${name}\\(s[^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`))[0];
  assert.match(body("_basketCount"), /if \(!findsShown\(\)\) return 0;/);
  assert.match(body("_giftDue"), /findsShown\(\) &&/);
  assert.match(body("_giftTake"), /!findsShown\(\)\) return;/);
  assert.match(body("_renderFinds"), /findsShown\(\) \? `<div class="fgrid">\$\{tiles\.filter\(\(t\) => t\.kind === "find"\)/);
  assert.match(src, /if \(m\.type === "found"\) \{\n\s+if \(findsShown\(\) && found < FOUND_BITS/);
});
