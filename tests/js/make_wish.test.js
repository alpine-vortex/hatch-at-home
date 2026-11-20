// Birthday plan 8.1: make a wish. The card's own _blowOut on the fake clock (timer_trace): the ask, a
// beat, then the candles; a second tap or a party gone mid-beat never plays it twice.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");

const spec = ({ party = true, out = false } = {}) => ({
  methods: ["_blowOut"],
  consts: ["PARTY_WISH_ASK", "WISH_BEAT_MS", "PARTY_WISH"],
  watch: ["_speak", "_cakeSpent", "_confetti", "_chirp", "_yourPartyFirst", "_patLean", "_animate"],
  returns: { _owned: false, _candlesOut: out, _yourPartyOn: party, _birthdayName: "Bee" },
  globals: { yourPartyLine: (l, n) => l.replace("{n}", n) },
});
const said = (w) => w.calls.filter((c) => c.name === "_speak").map((c) => c.args[1]);
const named = (w, n) => w.calls.filter((c) => c.name === n).length;

test("the tap asks for a wish, and the candles go out a beat later", () => {
  const w = world(spec());
  const cake = {};
  w.card._blowOut(w.slide, cake);
  assert.strictEqual(cake.disabled, true, "no longer a button at the first tap");
  assert.strictEqual(named(w, "_yourPartyFirst"), 1, "the day's candles spent at once");
  assert.deepStrictEqual(said(w), ["make a wish, Bee! ... ok, blow! ♪"]);
  assert.strictEqual(named(w, "_confetti"), 0, "not yet");
  w.run(2600);
  assert.strictEqual(named(w, "_cakeSpent"), 1);
  assert.strictEqual(named(w, "_confetti"), 1);
  assert.strictEqual(named(w, "_chirp"), 1);
  assert.deepStrictEqual(said(w), ["make a wish, Bee! ... ok, blow! ♪", "yay!! i won't tell anyone your wish ♥"]);
});

test("candles already out: the tap does nothing", () => {
  const w = world(spec({ out: true }));
  w.card._blowOut(w.slide, {});
  w.run(5000);
  assert.deepStrictEqual(said(w), []);
});

test("the party gone mid-beat: the candles go out quietly", () => {
  const w = world(spec());
  w.card._blowOut(w.slide, {});
  w.card._yourPartyOn = () => false;
  w.run(2600);
  assert.strictEqual(named(w, "_cakeSpent"), 1, "out, so a fresh cake shows them out");
  assert.strictEqual(named(w, "_confetti"), 0);
  assert.strictEqual(said(w).length, 1, "only the ask");
});
