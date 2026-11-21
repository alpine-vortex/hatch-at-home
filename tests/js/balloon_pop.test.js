// Birthday plan 7.1: the balloon bunch is a button, three taps pop it empty. The card's own _balloonBunch,
// _popBalloon and _balloonsGone on the fake clock (timer_trace); the side effects are watched stubs.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");
const src = require("./card-source");

const SPEC = {
  methods: ["_balloonBunch", "_popBalloon", "_balloonsGone", "_balloonRefill"],
  consts: ["PARTY_POP", "BALLOON_SPOTS", "POP_MS", "BALLOON_REFILL_MS"],
  watch: ["_confetti", "_chirp", "_speak", "_animate"],
  returns: { _yourPartyOn: true, _owned: false },
  globals: { pick: (l) => l[l.length - 1] }, // the last line it may say
};
const tap = (btn) => btn.dispatch("click", { stopPropagation: () => {} });
const said = (w) => w.calls.filter((c) => c.name === "_speak").map((c) => c.args[1]);
const art = (img) => img.src.replace(/^\/b\/ui\//, "").replace(/\?v=t$/, "");

test("three taps pop the bunch empty: 3, 2, 1, gone; a fourth tap does nothing", () => {
  const w = world(SPEC);
  const btn = w.card._balloonBunch(w.slide);
  const img = btn.children[0];
  assert.strictEqual(btn.type, "button");
  assert.strictEqual(btn.getAttribute("aria-label"), "pop a balloon");
  assert.strictEqual(btn.getAttribute("aria-hidden"), undefined);
  assert.strictEqual(art(img), "party_balloons.png");
  tap(btn);
  assert.strictEqual(art(img), "party_balloons_2.png");
  assert.strictEqual(btn.children.length, 2, "the puff");
  assert.strictEqual(btn.children[1].className, "yp-pop");
  assert.strictEqual(btn.children[1].getAttribute("aria-hidden"), "true");
  assert.deepStrictEqual([btn.children[1].style.left, btn.children[1].style.top], ["50%", "17%"], "the blue one, on top");
  w.run(460);
  assert.strictEqual(btn.children.length, 1, "the puff is gone after POP_MS");
  tap(btn);
  assert.strictEqual(art(img), "party_balloons_1.png");
  tap(btn);
  assert.strictEqual(img.hidden, true);
  assert.strictEqual(btn.disabled, true);
  assert.strictEqual(btn.tabIndex, -1);
  assert.strictEqual(btn.getAttribute("aria-hidden"), "true");
  assert.strictEqual(btn.hidden, false, "the last puff shows first");
  w.run(460);
  assert.strictEqual(btn.hidden, true);
  assert.strictEqual(w.slide.yPops, 3);
  tap(btn);
  assert.strictEqual(w.slide.yPops, 3);
  const names = (n) => w.calls.filter((c) => c.name === n).length;
  assert.deepStrictEqual([names("_confetti"), names("_chirp"), names("_speak")], [3, 3, 3]);
  assert.ok(w.calls.filter((c) => c.name === "_chirp").every((c) => c.args[1] === "balloon"));
  assert.deepStrictEqual(said(w), ["one more! one more!", "one more! one more!", "eek! that was loud!"], "never 'one more' on the last");
});

test("the count is the slide's: a rebuilt bunch keeps it, a fresh slide is full again", () => {
  const w = world(SPEC);
  const btn = w.card._balloonBunch(w.slide);
  tap(btn);
  tap(btn);
  assert.strictEqual(art(w.card._balloonBunch(w.slide).children[0]), "party_balloons_1.png");
  tap(btn);
  const gone = w.card._balloonBunch(w.slide);
  assert.strictEqual(gone.hidden, true);
  assert.strictEqual(gone.disabled, true);
  assert.strictEqual(art(w.card._balloonBunch({ ...w.slide, yPops: undefined }).children[0]), "party_balloons.png");
  assert.doesNotMatch(src.slice(src.indexOf("\n  _popBalloon("), src.indexOf("\n  _balloonsGone(")), /localStorage/);
});

test("no pop in a scene, a game, off the party, or under calm without the perk", () => {
  for (const [why, spec, slide] of [
    ["scene", SPEC, { scene: {} }],
    ["owned", { ...SPEC, returns: { ...SPEC.returns, _owned: true } }, {}],
    ["no party", { ...SPEC, returns: { ...SPEC.returns, _yourPartyOn: false } }, {}],
  ]) {
    const w = world(spec);
    Object.assign(w.slide, slide);
    tap(w.card._balloonBunch(w.slide));
    assert.strictEqual(w.slide.yPops, undefined, why);
  }
  const w = world(SPEC);
  w.calm = true;
  tap(w.card._balloonBunch(w.slide));
  assert.strictEqual(w.slide.yPops, 1);
  assert.strictEqual(w.calls.filter((c) => c.name === "_animate").length, 0);
});

test("the button is in the props outside any aria-hidden wrapper; the copy is the plan's", () => {
  const props = src.slice(src.indexOf("\n  _yourPartyProps("), src.indexOf("\n  _balloonBunch("));
  assert.match(props, /cake\.before\(this\._balloonBunch\(s\)\)/);
  assert.doesNotMatch(props, /el\.setAttribute\("aria-hidden"/);
  assert.match(src, /const PARTY_POP = \["pop! ♪", "eek! that was loud!", "one more! one more!"\];/);
  assert.match(src, /\.yparty \.yp-balloons \{[^}]*pointer-events: auto/);
});

test("an emptied bunch on a screen that stays up is full again an hour later, not before", () => {
  const w = world(SPEC);
  const btn = w.card._balloonBunch(w.slide);
  let put = null;
  const box = { querySelector: (q) => (q === ".yp-balloons" ? { replaceWith: (b) => (put = b) } : null) };
  tap(btn);
  w.card._balloonRefill(w.slide, box);
  assert.strictEqual(put, null, "a part-popped bunch stays as it is");
  w.run(60 * 60 * 1000);
  w.card._balloonRefill(w.slide, box);
  assert.strictEqual(put, null, "only an empty bunch comes back");
  tap(btn);
  tap(btn);
  w.run(59 * 60 * 1000);
  w.card._balloonRefill(w.slide, box);
  assert.strictEqual(put, null, "not before the hour");
  w.run(60 * 1000);
  w.card._balloonRefill(w.slide, box);
  assert.ok(put, "the hour is up");
  assert.strictEqual(w.slide.yPops, 0);
  assert.strictEqual(art(put.children[0]), "party_balloons.png");
  assert.ok(!put.disabled && !put.hidden);
  tap(put);
  assert.strictEqual(w.slide.yPops, 1, "the new bunch pops");
});
