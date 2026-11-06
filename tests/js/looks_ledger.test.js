// Director migration slice 5 (looks, gift, ask, moment follow-ups), after the move: what a forget does to each row (plan
// 3.14, 6.1 step 3) and what a disconnect keeps (D-keep, D-reattach). `detach` is what _forget calls on the slide.
// R34/R35 the trick and promise moves, R41 the trait flair and R44 the smug rock are "drop" (nothing fires on the slide's
// next pet); R36 the ask's text step is "drop" too (_clearAsk does not touch s.textStep; the tick ends it); R37 the gift
// pop and R76-R77 the question's end are "closer" (_giftPopEnd, _clearAsk), so the node and the flag are cleared by the
// closer before detach (a drop would leave s.asking, a BUSY_OWNERS entry, stuck). A disconnect keeps all but the pop.
// B1 is the change: before this slice a forget stopped only the ask (clearTimeout in _clearAsk) and the pop (_dropGift).
// The times are pinned by looks_trace.test.js. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");

const short = (log) => log.map((x) => `${x.t} ${x.el} ${x.op}${x.arg === undefined ? "" : ` ${x.arg}`}`);
const calls = (w, ...names) => w.calls.filter((c) => names.includes(c.name)).map((c) => `${c.t} ${c.name}`);
const EV = { stopPropagation() {} };

const LOOK = {
  methods: ["_firstLook"],
  returns: { _channelHeard: true, _resumeHeld: false, _eggMinutes: null, _trickNew: "spin", _promiseLook: { line: "i will", move: "hop" } },
  watch: ["_trickMove", "_promiseMove"],
  globals: {
    FIRST_LOOK_LINES: 4, FIRST_MOVE_MS: 1000, TRICK_LINES: ["a trick"], turnPick: (l) => l[0], serverNow: () => 0,
    UPBRINGING_LINES: {}, upbringingDue: () => false,
  },
  slide: () => ({ species: {} }),
};
const TRAIT = {
  methods: ["_moment"], watch: ["_flair", "_sparkle", "_chirp"],
  globals: { MOMENT_CLASS: {}, FLAVOUR: "flavour", KEPT: "kept" },
  fields: { _line: (_s, _cls, _text, _ms, o) => o.then?.() },
};
const SMUG = {
  methods: ["_react"], screen: true, watch: ["_animate"],
  returns: { _sceneOffer: false, _words: { food: "x" }, _lines: { text: "t" }, _owned: false },
  globals: {
    SPOILED_BY: new Set(["praise"]), PROP_FOR: {}, FALLBACK_PROPS: {}, REFUSALS: { spoiled: "hehe" }, MINE: "mine", BEAT: "beat",
    MINE_MS: 4000, seasonNow: () => null, isHeavy: () => false,
  },
};
const ASK = {
  methods: ["_ask", "_clearAsk"], screen: true,
  globals: {
    ASK_MS: 60000, escape: (x) => String(x), QUESTIONS: { weekend: { q: "weekend?", answers: { yes: ["ok"], no: ["no"] } } },
    MINE: "mine", KEPT: "kept", BIG_DAY: { which: "which" },
  },
};
const TEXT = {
  methods: ["_askText", "_askTextEnd"], screen: true, returns: { _tagChips: null, _sendFollow: Promise.resolve(false) },
  globals: { ASK_MS: 60000, BIG_DAY: { what: "what is it?", kept: "kept" }, FOLLOW_TEXT_MAX: 40, cleanTyped: (v) => v, covers: () => false },
};
const GIFT = { methods: ["_giftPop", "_giftPopEnd", "_dropGift"], screen: true, globals: { GIFT_LINE_MS: 5000 } };

const askUp = (w) => w.slide.screen.children.filter((k) => k.cls.has("askday"));
function ask(w) {
  w.slide.ids["sensor.life_stage"] = "sensor.life_stage";
  w.card._ask(w.slide, "weekend", "sensor.life_stage");
  w.slide.asking = true;
  return askUp(w)[0];
}
function gifted(spec) {
  const w = world(spec);
  const make = w.sandbox.document.createElement;
  w.sandbox.document.createElement = (tag) => {
    const e = make(tag);
    Object.defineProperty(e, "innerHTML", { set() {
      e.firstChild = w.el(`img${e.name}`);
      e.firstChild.dataset = {};
    } });
    return e;
  };
  return w;
}
function textStep(w) {
  const step = w.slide.textStep = { entity: "sensor.life_stage", kind: "big_day", day: null, sent: false, until: w.base + 120000 };
  w.slide.ids["sensor.life_stage"] = "sensor.life_stage";
  w.slide.asking = true;
  w.card._askText(w.slide, step);
  return step;
}

test("B1: a forget drops the trick's and the promise's moves, the trait's flair and the smug rock: nothing fires on the next pet", () => {
  const a = world(LOOK);
  a.card._firstLook(a.slide);
  const b = world(TRAIT);
  b.card._moment(b.slide, { type: "trait_learned", trait: "brave", level: 1 });
  const c = world(SMUG);
  c.card._react(c.slide, { action: "praise", result: "spoiled" }, { mine: true });
  for (const w of [a, b, c]) {
    w.advance(100);
    assert.strictEqual(w.director.pending(w.slide), 1 + (w === a), "one entry (two for the look)");
    w.director.detach(w.slide);
    assert.strictEqual(w.director.pending(w.slide), 0);
    w.advance(10000);
  }
  assert.deepStrictEqual(calls(a, "_trickMove", "_promiseMove"), []);
  assert.deepStrictEqual(calls(b, "_flair"), []);
  assert.deepStrictEqual(calls(c, "_animate"), []);
});

test("the moves are unkeyed: two looks give two entries, each on its own time (no replace)", () => {
  const w = world(LOOK);
  w.card._firstLook(w.slide);
  w.advance(200);
  w.slide.lookedFirst = false;
  w.card._firstLook(w.slide);
  assert.strictEqual(w.director.pending(w.slide), 4);
  w.advance(10000);
  assert.deepStrictEqual(calls(w, "_trickMove", "_promiseMove"), ["600 _trickMove", "600 _promiseMove", "800 _trickMove", "800 _promiseMove"]);
});

test("D-keep: a disconnect ends none of them; the moves, the flair and the rock land on their own times", () => {
  const a = world(LOOK);
  a.card._firstLook(a.slide);
  const b = world(TRAIT);
  b.card._moment(b.slide, { type: "trait_learned", trait: "brave", level: 1 });
  const c = world(SMUG);
  c.card._react(c.slide, { action: "praise", result: "spoiled" }, { mine: true });
  for (const w of [a, b, c]) {
    w.advance(100);
    w.disconnect();
    w.advance(10000);
    assert.strictEqual(w.director.pending(w.slide), 0);
  }
  assert.deepStrictEqual(calls(a, "_trickMove", "_promiseMove"), ["600 _trickMove", "600 _promiseMove"]);
  assert.deepStrictEqual(calls(b, "_flair"), ["700 _flair"]);
  assert.deepStrictEqual(calls(c, "_animate"), ["1300 _animate"]);
});

test("B1: _clearAsk (a forget's closer) takes the box off, clears asking and the timer; nothing is pending, nothing at 60 s", () => {
  const w = world(ASK);
  ask(w);
  w.advance(1000);
  assert.strictEqual(w.director.pending(w.slide), 1);
  w.card._clearAsk(w.slide);
  w.director.detach(w.slide);
  assert.strictEqual(askUp(w).length, 0);
  assert.strictEqual(w.slide.asking, false);
  assert.strictEqual(w.director.pending(w.slide), 0);
  const after = w.log.length;
  w.advance(100000);
  assert.deepStrictEqual(w.log.slice(after), [], "no late done() on the next pet");
});

test("B1: the next pet's question on a reused slide is its own, not cut short by the last pet's timer", () => {
  const w = world(ASK);
  ask(w);
  w.advance(30000);
  w.card._clearAsk(w.slide);
  w.director.detach(w.slide);
  ask(w); // 30000: due at 90000
  w.advance(40000); // 70000: past the last pet's 60000
  assert.strictEqual(askUp(w).length, 1);
  assert.strictEqual(w.slide.asking, true);
  w.advance(20000);
  assert.strictEqual(askUp(w).length, 0);
  assert.strictEqual(w.slide.asking, false);
});

test("A1: a focusin re-arm is a silent replace (one entry, no done); an answer or _clearAsk stops it", () => {
  const w = world(ASK);
  const box = ask(w);
  w.advance(10000);
  for (let i = 0; i < 3; i++) box.dispatch("focusin", EV);
  assert.strictEqual(w.director.pending(w.slide), 1);
  assert.strictEqual(askUp(w).length, 1);
  assert.strictEqual(w.slide.asking, true);
  w.card._clearAsk(w.slide);
  assert.strictEqual(w.director.pending(w.slide), 0);
});

test("a second _ask over a first one replaces its timer: the new box goes at its own 60 s (the old done() would have stopped it)", () => {
  const w = world(ASK);
  ask(w);
  w.advance(20000);
  ask(w); // the first box is taken off by _ask itself; its timer would have been due at 60000
  w.advance(45000); // 65000
  assert.strictEqual(askUp(w).length, 1, "the first timer did not close the second box");
  assert.strictEqual(w.director.pending(w.slide), 1);
  w.advance(20000);
  assert.strictEqual(askUp(w).length, 0);
  assert.strictEqual(w.slide.asking, false);
});

test("D-reattach: disconnect, connect 100 ms later, advance to the longest due time: the same end state (box gone, asking false)", () => {
  const w = world(ASK);
  ask(w);
  w.advance(500);
  w.disconnect();
  w.advance(100);
  w.reconnect();
  w.advance(10000);
  assert.strictEqual(askUp(w).length, 1);
  w.advance(60000);
  assert.strictEqual(askUp(w).length, 0);
  assert.strictEqual(w.slide.asking, false);
  assert.strictEqual(w.director.pending(w.slide), 0);
});

test("the text step is dropped at a forget (3.14 R36): the tick ends it; the stopped timer does not send at 60 s", () => {
  const w = world(TEXT);
  const step = textStep(w);
  w.advance(1000);
  assert.strictEqual(w.director.pending(w.slide), 1);
  w.director.detach(w.slide);
  assert.strictEqual(w.director.pending(w.slide), 0);
  assert.ok(w.slide.textStep === step && !step.sent, "the step is the tick's to end");
  w.advance(100000);
  assert.deepStrictEqual(w.calls.filter((c) => c.name === "_sendFollow"), []);
  w.card._askTextEnd(w.slide); // the tick's end, within 700 ms of the forget
  assert.strictEqual(w.slide.asking, false);
  assert.strictEqual(w.calls.filter((c) => c.name === "_sendFollow").length, 1);
});

test("the text step is kept through a disconnect: it ends with no text at its own 60 s", () => {
  const w = world(TEXT);
  textStep(w);
  w.advance(1000);
  w.disconnect();
  w.advance(1000);
  w.reconnect();
  w.advance(57990); // 59990
  assert.ok(w.slide.textStep);
  w.advance(20);
  assert.strictEqual(w.slide.textStep, null);
  assert.strictEqual(w.slide.asking, false);
  assert.strictEqual(w.calls.filter((c) => c.name === "_sendFollow").length, 1);
});

test("R37: the gift pop is ended by _dropGift (a forget's closer): node gone, flags clear, nothing pending, nothing at 5 s", () => {
  const w = gifted(GIFT);
  w.card._giftPop(w.slide, { id: "shell", world: "beach" });
  w.advance(1000);
  assert.strictEqual(w.director.pending(w.slide), 1);
  w.card._dropGift(w.slide);
  w.director.detach(w.slide);
  assert.strictEqual(w.slide.giftPop, null);
  assert.deepStrictEqual(short(w.log).filter((x) => /remove/.test(x)), ["1000 div1 remove"]);
  assert.strictEqual(w.director.pending(w.slide), 0);
  assert.strictEqual(w.slide.flairUntil, 0);
  const after = w.log.length;
  w.advance(10000);
  assert.deepStrictEqual(w.log.slice(after), []);
});

test("R37: a disconnect is a closer too (card-base calls _giftPopEnd): the pop goes at once, nothing is pending", () => {
  const w = gifted(GIFT);
  w.card._giftPop(w.slide, { id: "shell", world: "beach" });
  w.advance(1000);
  w.card._giftPopEnd(w.slide); // what disconnectedCallback does for each slide
  assert.strictEqual(w.director.pending(w.slide), 0);
  w.advance(10000);
  assert.deepStrictEqual(short(w.log).filter((x) => /remove/.test(x)), ["1000 div1 remove"]);
});

test("R37: the next pet's pop on a reused slide is its own", () => {
  const w = gifted(GIFT);
  w.card._giftPop(w.slide, { id: "shell", world: "beach" });
  w.advance(3000);
  w.card._dropGift(w.slide);
  w.director.detach(w.slide);
  w.card._giftPop(w.slide, { id: "pearl", world: "beach" }); // 3000: due at 8000
  w.advance(3000); // 6000: past the last pet's 5000
  assert.ok(w.slide.giftPop);
  w.advance(2100);
  assert.strictEqual(w.slide.giftPop, null);
});
