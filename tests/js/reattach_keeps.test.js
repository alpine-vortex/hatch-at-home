// A2, global (docs/plan-2026-11-06-director-migration.md 5.14, 7.2): a card that leaves the page and comes back 100 ms
// later (a view switch) keeps what it had: `reset()` drains nothing, so ledger entries fire on their time, and the
// slide's own fields are not touched by the disconnect/connect pair. On the timer_trace.js sandbox. The end state
// below was taken on main with slice 14 reverted (the same trace, before _forget's dead clears went) and is
// the same after; slice 14 changes nothing a re-attach touches. The differences from 531cd101 (D1-D4: the B3
// second flip, B1's forget, the rock2 cut at a quiet end, the leaving swipe, and slice 12's _forget ending the
// link) are not exercised here: this trace has no flip, no scene, no swipe and no link.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");

test("every kept timer fires on its time across a disconnect and a connect 100 ms later", () => {
  const w = world({ screen: true });
  const { card, slide: s, director } = w;
  const fired = [];
  card._later(s, 2600, () => fired.push("slide 2600"), { key: "k1" });
  card._hold(s, s.screen, ["breezy"], 2600, { key: "breezy" });
  card._hold(s, s.screen, ["lit"], 3000, { key: "lit" });
  card._later(card._dirCard, 5000, () => fired.push("boot 5000"), { key: "boot.wait" });
  card._later(card._dirCard, 900, () => fired.push("head 900"), { key: "head" });
  s.asking = "q1"; s.layAt = { generation: 2 }; s.nameBusy = true; card._booting = true; s.drapeAnim = "d";
  w.run(50);
  w.disconnect();
  // reset() drains nothing; only the closers end things (the head is stopped by the disconnect itself).
  assert.strictEqual(director.pending(s), 3, "the slide's entries are kept");
  w.run(50);
  w.reconnect();
  const longest = 5000;
  w.run(longest + 100);
  assert.deepStrictEqual(fired.sort(), ["boot 5000", "slide 2600"]);
  assert.deepStrictEqual(
    { asking: s.asking, layAt: s.layAt, nameBusy: s.nameBusy, booting: card._booting, drapeAnim: s.drapeAnim,
      breezy: s.screen.cls.has("breezy"), lit: s.screen.cls.has("lit") },
    { asking: "q1", layAt: { generation: 2 }, nameBusy: true, booting: true, drapeAnim: "d", breezy: false, lit: false });
  assert.strictEqual(director.pending(), 0, "after the longest due time (the card-scope waits included) nothing is left");
});
