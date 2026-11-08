// The timer ratchet (docs/plan-2026-11-06-director-migration.md 5.0, 7.1, Appendix B). Per card part, the
// bare identifiers setTimeout, setInterval, requestAnimationFrame, clearTimeout, clearInterval,
// cancelAnimationFrame and the member `.animate(`, comments stripped (tests/js/timer_count.js). The bare
// word, not the call, so `forEach(clearTimeout)` and an alias (`const t = setTimeout`) count. It fails when a
// count differs in either direction: a new bare timer fails at once, and a slice that moves one onto the
// ledger lowers its number here in the same commit. `node tests/js/timer_count.js` prints the live table.
// Slice 14 replaces this table with the allowlist (7.1). node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { countParts, countText, stripComments, COLUMNS } = require("./timer_count");

const [ST, SI, RAF, CT, CI, CAF, AN] = COLUMNS;
// Appendix B's counts on 531cd101, recounted on 0d6abbea (the same), plus slice 0's own lines, marked.
const PINNED = {
  "card-actions": { [RAF]: 2, [CAF]: 1 }, // slice 1: R1-R5 moved (setTimeout 5 -> 0)
  // + slice 0: `.animate(` 1, in the _waapi adapter
  "card-base": { [ST]: 2, [SI]: 1, [CT]: 3, [CI]: 1, [AN]: 1 },
  // + slice 0: the director's repeat and frame wrappers (setInterval, clearInterval, rAF, cancel 1 each)
  "card-build": { [ST]: 1, [SI]: 1, [RAF]: 1, [CT]: 6, [CI]: 1, [CAF]: 1 }, // slice 5: R76-R77's closer _clearAsk moved (clearTimeout 9 -> 8); slice 8: R11-R13 moved (setTimeout 5 -> 2, clearTimeout 8 -> 6); slice 11: R14 the swipe grace moved (setTimeout 2 -> 1; the 1 left is the director's own schedule)
  // slice 1: card-journal (R25) and card-mode (R40) have no bare timer left; card-base clearTimeout 4 -> 3 (R27's closer)
  "card-layout": { [CT]: 1 }, // slice 1: R26, R27, R28 moved (setTimeout 2 -> 0, rAF 1 -> 0, clearTimeout 2 -> 1)
  "card-link": { [ST]: 3, [SI]: 2, [CT]: 3, [CI]: 2 },
  // slice 5: card-looks (R34-R37) and card-moment (R41, R44) have no bare timer left; their rows are gone
  // slice 6: card-season (R45-R50) has no bare timer left; its row is gone
  // slice 10: card-games (R22-R24: setTimeout 3 -> 0) and card-flair (_endGame's forEach(clearTimeout) and the dead cancelAnimationFrame) have no bare timer left; their rows are gone
  // slice 9: card-care (R15-R20: setTimeout 6 -> 0, clearTimeout 1 -> 0) has no bare timer left; its row is gone
  "card-memory": { [ST]: 2, [CT]: 3 },
  "card-sheets": { [ST]: 6, [CT]: 5 },
  "card-tick": { [SI]: 1, [CI]: 1 }, // slice 3: R60-R68, R70, R73 moved (setTimeout 15 -> 4); slice 4: R57-R58, R71, R72, R74, R75 (setTimeout 4 -> 0, clearTimeout 5 -> 0, .animate( 2 -> 0)
  "card-visit": { [ST]: 1, [CT]: 0 }, // slice 2: R79, R81-R84 moved (setTimeout 9 -> 4, clearTimeout 7 -> 3); slice 5: R76, R77 (setTimeout 4 -> 2, clearTimeout 3 -> 1); slice 7: R80 `_animate` (setTimeout 2 -> 1, clearTimeout 1 -> 0)
};

test("the counter: comments go, strings, templates and regex literals stay whole", () => {
  assert.deepStrictEqual(countText("// setTimeout(x)\n/* clearTimeout */ a();"), {});
  assert.deepStrictEqual(countText("list.forEach(clearTimeout); const t = setTimeout;"), { [CT]: 1, [ST]: 1 });
  assert.deepStrictEqual(countText("x.mySetTimeout(); setTimeouts; $setTimeout; el.animate(k, 9); a.animated"),
    { [AN]: 1 });
  assert.deepStrictEqual(countText('const u = "http://x"; setInterval(f, 1);'), { [SI]: 1 });
  assert.deepStrictEqual(countText("const r = /a\\/\\/b|[/]/g; requestAnimationFrame(f); // setTimeout"), { [RAF]: 1 });
  assert.deepStrictEqual(countText("const s = `a ${b ? `//c` : 'd'} e`; cancelAnimationFrame(i); // clearInterval"),
    { [CAF]: 1 });
  assert.deepStrictEqual(countText("const half = a / 2; setTimeout(f, b / 2); // setTimeout"), { [ST]: 1 });
  assert.strictEqual(stripComments("a // b\nc /* d\ne */ f").split("\n").length, 3, "line breaks kept");
});

test("the ratchet: every card part's bare timer count is pinned, in both directions", () => {
  const live = countParts();
  const rows = new Set([...Object.keys(PINNED), ...Object.keys(live)]);
  const off = [];
  for (const file of [...rows].sort()) {
    for (const k of COLUMNS) {
      const want = PINNED[file]?.[k] || 0;
      const got = live[file]?.[k] || 0;
      if (want !== got) off.push(`${file}.js ${k} ${got} (pinned ${want})`);
    }
  }
  assert.deepStrictEqual(off, [], [
    "A bare timer count changed. A new one goes through the director's ledger (this._later, _hold, _waapi;",
    "docs/plan-2026-11-06-director-migration.md 1.4), not a bare timer. A slice that moved one lowers its",
    "number in PINNED in the same commit. Off:", ...off,
  ].join("\n"));
});
