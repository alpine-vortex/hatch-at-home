// Director migration slice 5 (looks, gift, ask, moment follow-ups), the characterization:
// docs/plan-2026-11-06-director-migration.md 5.5 and 6.1. Each trace pins what the player could see for R34 (the new
// trick's move after its line), R35 (the promise's payoff move), R36 (the ask's text step), R37 (the gift pop), R41 (the
// new trait's flair), R44 (the smug second rock) and R76-R77 (the question's end, and its focus re-arm). It passes on the
// unmoved code (bare timers on the fake clock) and passes after the move (the same sites through the ledger), unchanged.
// Reduced motion is whatever the unmoved code does, both ways (F13): _firstLook queues the trick's move only when not calm
// (its own `if (!calm())`), the promise's move always (_promiseMove checks calm itself); the gift pop, the ask, the trait's
// flair and the smug rock (`!calm()` in _react) are told in their tests.
// "Called with no slide" (G8) has no case: every one of these reads s.screen or s.* first, and every caller passes a slide.
// A forget mid-flight is a change (B1) or a closer (3.14) and has no trace here: looks_ledger.test.js (the move commit).
// Side effects that are other methods (_trickMove, _promiseMove, _flair, _animate, _line) are stubs; their calls are listed.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");

const short = (log) => log.map((x) => `${x.t} ${x.el} ${x.op}${x.arg === undefined ? "" : ` ${x.arg}`}`);
const calls = (w, ...names) => w.calls.filter((c) => names.includes(c.name))
  .map((c) => `${c.t} ${c.name}${c.name === "_animate" ? ` ${c.args[2]} ${c.args[3]}` : c.name === "_flair" ? ` ${c.args[1]}` : ""}`);

// ---- R34, R35: _firstLook, through its trick and promise lines ----

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

test("_firstLook: a new trick's move runs 600 ms after the look, the promise's too; neither before", () => {
  const w = world(LOOK);
  w.card._firstLook(w.slide);
  assert.deepStrictEqual(calls(w, "_trickMove", "_promiseMove"), []);
  w.run(590);
  assert.deepStrictEqual(calls(w, "_trickMove", "_promiseMove"), []);
  w.settle();
  assert.deepStrictEqual(calls(w, "_trickMove", "_promiseMove"), ["600 _trickMove", "600 _promiseMove"]);
  assert.strictEqual(w.slide.trickSaid, new Date(w.base).toDateString());
});

test("_firstLook under calm: no trick move is queued; the promise's is (its method checks calm itself)", () => {
  const w = world(LOOK);
  w.calm = true;
  w.card._firstLook(w.slide);
  w.settle();
  assert.deepStrictEqual(calls(w, "_trickMove", "_promiseMove"), ["600 _promiseMove"]);
});

test("_firstLook: a promise with no move queues no timer", () => {
  const w = world({ ...LOOK, returns: { ...LOOK.returns, _trickNew: null, _promiseLook: { line: "i will" } } });
  w.card._firstLook(w.slide);
  assert.strictEqual(w.horizon(), 0);
  assert.deepStrictEqual(calls(w, "_trickMove", "_promiseMove"), []);
});

// ---- R41: the new trait's flair, through _moment ----

const TRAIT = {
  methods: ["_moment"], watch: ["_flair", "_sparkle", "_chirp"],
  globals: { MOMENT_CLASS: {}, FLAVOUR: "flavour", KEPT: "kept" },
  fields: { _line: (_s, _cls, _text, _ms, o) => o.then?.() },
};

test("_moment trait_learned: the sparkle and the chirp at once, the flair 700 ms later; trait_deepened the same", () => {
  for (const type of ["trait_learned", "trait_deepened"]) {
    const w = world(TRAIT);
    w.card._moment(w.slide, { type, trait: "brave", level: 2 });
    assert.deepStrictEqual(calls(w, "_flair", "_sparkle", "_chirp"), ["0 _sparkle", "0 _chirp"], type);
    w.run(690);
    assert.deepStrictEqual(calls(w, "_flair"), [], type);
    w.settle();
    assert.deepStrictEqual(calls(w, "_flair"), ["700 _flair brave"], type);
  }
});

test("_moment trait_learned under calm is the same (the flair has its own check); a capture sets no timer", () => {
  const w = world(TRAIT);
  w.calm = true;
  w.card._moment(w.slide, { type: "trait_learned", trait: "brave", level: 1 });
  w.settle();
  assert.deepStrictEqual(calls(w, "_flair"), ["700 _flair brave"]);
  const c = world(TRAIT);
  c.card._moment(c.slide, { type: "trait_learned", trait: "brave", level: 1 }, []);
  assert.strictEqual(c.horizon(), 0);
});

// ---- R44: the smug second rock, through _react ----

const SMUG = {
  methods: ["_react"], screen: true, watch: ["_animate"],
  returns: { _sceneOffer: false, _words: { food: "x" }, _lines: { text: "t" }, _owned: false },
  globals: {
    SPOILED_BY: new Set(["praise"]), PROP_FOR: {}, FALLBACK_PROPS: {}, REFUSALS: { spoiled: "hehe" }, MINE: "mine", BEAT: "beat",
    MINE_MS: 4000, seasonNow: () => null, isHeavy: () => false,
  },
};
const spoiled = { action: "praise", result: "spoiled" };

test("_react spoiled praise: the second rock 1300 ms after the reaction; nothing under calm", () => {
  const w = world(SMUG);
  w.card._react(w.slide, spoiled, { mine: true });
  w.run(1290);
  assert.deepStrictEqual(calls(w, "_animate"), []);
  w.settle();
  assert.deepStrictEqual(calls(w, "_animate"), ["1300 _animate rock2 1250"]);
  const c = world(SMUG);
  c.calm = true;
  c.card._react(c.slide, spoiled, { mine: true });
  c.settle();
  assert.deepStrictEqual(calls(c, "_animate"), []);
  assert.strictEqual(c.horizon(), 0, "calm: no timer at all");
});

test("the smug rock fires only if there is no scene, the pet is awake and the screen is not owned", () => {
  const cases = [["a scene", { scene: { kind: "care" } }, {}], ["asleep", { asleep: true }, {}], ["owned", {}, { _owned: true }]];
  for (const [what, over, ret] of cases) {
    const w = world({ ...SMUG, returns: { ...SMUG.returns, ...ret } });
    w.card._react(w.slide, spoiled, { mine: true });
    Object.assign(w.slide, over);
    w.settle();
    assert.deepStrictEqual(calls(w, "_animate"), [], what);
  }
  const w = world(SMUG);
  w.card._react(w.slide, spoiled, { mine: true });
  w.settle();
  assert.deepStrictEqual(calls(w, "_animate"), ["1300 _animate rock2 1250"]);
});

test("an ordinary praise (not spoiled) has no smug rock", () => {
  const w = world(SMUG);
  w.card._react(w.slide, { action: "praise", result: "ok" }, { mine: true });
  w.settle();
  assert.deepStrictEqual(calls(w, "_animate"), []);
});

// ---- R37: the gift pop ----

// An element whose innerHTML makes its firstChild (the pop's img), as a browser would.
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
const GIFT = { methods: ["_giftPop", "_giftPopEnd"], screen: true, globals: { GIFT_LINE_MS: 5000 } };
const g = { id: "shell", world: "beach" };

test("_giftPop: the pop goes up with the line and comes off at 5000; flairUntil and visitUntil follow", () => {
  const w = gifted(GIFT);
  w.card._giftPop(w.slide, g);
  assert.deepStrictEqual(short(w.log).filter((x) => /append|pop/.test(x)), ["0 imgdiv1 class+ pop", "0 screen append div1"]);
  assert.strictEqual(w.slide.giftPop.until, w.base + 5000);
  assert.strictEqual(w.slide.flairUntil, w.base + 5000);
  assert.strictEqual(w.slide.visitUntil, w.base + 5000);
  w.run(4990);
  assert.ok(w.slide.giftPop);
  w.settle();
  assert.strictEqual(w.slide.giftPop, null);
  assert.deepStrictEqual(short(w.log).slice(-1), ["5000 div1 remove"]);
  assert.strictEqual(w.slide.flairUntil, 0);
  assert.strictEqual(w.slide.visitUntil, 0);
});

test("_giftPop under calm: the same, with no pop class", () => {
  const w = gifted(GIFT);
  w.calm = true;
  w.card._giftPop(w.slide, g);
  w.settle();
  assert.deepStrictEqual(short(w.log).filter((x) => /pop|remove/.test(x)), ["5000 div1 remove"]);
});

test("_giftPopEnd at 3000 takes the pop off and cancels the 5000 timer: nothing at 5000", () => {
  const w = gifted(GIFT);
  w.card._giftPop(w.slide, g);
  w.run(3000);
  w.card._giftPopEnd(w.slide);
  assert.strictEqual(w.slide.giftPop, null);
  assert.strictEqual(w.pendingTimers(), 0);
  const n = w.log.length;
  w.run(10000);
  assert.deepStrictEqual(short(w.log.slice(n)), []);
  assert.deepStrictEqual(short(w.log).filter((x) => /remove/.test(x)), ["3000 div1 remove"]);
  assert.strictEqual(w.slide.flairUntil, 0);
});

test("a second _giftPop at 2000 ends the first (its node goes) and runs its own 5000: the old timer does not cut it short", () => {
  const w = gifted(GIFT);
  w.card._giftPop(w.slide, g);
  w.run(2000);
  w.card._giftPop(w.slide, g);
  w.run(4000); // 6000: past the first's 5000
  assert.ok(w.slide.giftPop, "the second still up");
  w.settle();
  assert.deepStrictEqual(short(w.log).filter((x) => /remove/.test(x)), ["2000 div1 remove", "7000 div2 remove"]);
});

test("_giftPop on a shared screen puts nothing up", () => {
  const w = gifted({ ...GIFT, globals: { ...GIFT.globals, sharedScreen: () => true } });
  w.card._giftPop(w.slide, g);
  assert.strictEqual(w.horizon(), 0);
  assert.strictEqual(w.slide.giftPop, undefined);
});

// ---- R36: the ask's text step ----

const TEXT = {
  methods: ["_askText", "_askTextEnd"], screen: true, returns: { _tagChips: null, _sendFollow: Promise.resolve(false) },
  globals: { ASK_MS: 60000, BIG_DAY: { what: "what is it?", kept: "kept" }, FOLLOW_TEXT_MAX: 40, cleanTyped: (v) => v, covers: () => false },
};
function textStep(w, over = {}) {
  const step = w.slide.textStep = { entity: "sensor.life_stage", kind: "big_day", day: null, sent: false, until: w.base + 120000, ...over };
  w.slide.ids["sensor.life_stage"] = "sensor.life_stage";
  w.slide.asking = true;
  w.card._askText(w.slide, step);
  return step;
}

test("_askText puts the box up and ends the step at ASK_MS with no text (60000); step.until is ASK_MS + 1000 on", () => {
  const w = world(TEXT);
  const step = textStep(w);
  assert.strictEqual(step.until, w.base + 61000);
  assert.ok(w.slide.screen.children.includes(step.box));
  w.run(59990);
  assert.ok(w.slide.textStep, "still up");
  assert.deepStrictEqual(w.calls.filter((c) => c.name === "_sendFollow"), []);
  w.settle();
  assert.strictEqual(w.slide.textStep, null);
  assert.strictEqual(w.slide.asking, false);
  assert.ok(step.sent);
  assert.deepStrictEqual(short(w.log).slice(-1), ["60000 div1 remove"]);
  const sent = w.calls.filter((c) => c.name === "_sendFollow");
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].t, 60000);
  assert.strictEqual(sent[0].args[4], null, "no text");
});

test("_askTextEnd before the time (ok, skip, a slide switch, a hidden tab) cancels the 60000 timer: the step ends once", () => {
  const w = world(TEXT);
  textStep(w);
  w.run(20000);
  w.card._askTextEnd(w.slide, "hello", true);
  assert.strictEqual(w.slide.textStep, null);
  assert.strictEqual(w.pendingTimers(), 0);
  w.run(100000);
  const sent = w.calls.filter((c) => c.name === "_sendFollow");
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].t, 20000);
  assert.strictEqual(sent[0].args[4], "hello");
});

test("the tick ends the text step now on a hidden tab (existing, unchanged): the same call, the timer cancelled", () => {
  const w = world(TEXT);
  textStep(w);
  w.run(5000);
  w.card._askTextEnd(w.slide); // what card-tick's `document.hidden || ...` calls
  assert.strictEqual(w.pendingTimers(), 0);
  assert.strictEqual(w.slide.asking, false);
});

test("_askText for another pet's step, or a stale one, ends it at once and starts no timer", () => {
  const w = world(TEXT);
  const step = w.slide.textStep = { entity: "other", kind: "big_day", sent: false, until: w.base + 1 };
  w.slide.ids["sensor.life_stage"] = "sensor.life_stage";
  w.card._askText(w.slide, step);
  assert.strictEqual(w.slide.textStep, null);
  assert.strictEqual(w.horizon(), 0);
});

// ---- R76, R77: the question's end, and the focus re-arm (A1) ----

const ASK = {
  methods: ["_ask"], screen: true, watch: [],
  globals: {
    ASK_MS: 60000, escape: (x) => String(x), QUESTIONS: { weekend: { q: "weekend?", answers: { yes: ["ok"], no: ["no"] } } },
    MINE: "mine", KEPT: "kept", BIG_DAY: { which: "which" },
  },
};
const EV = { stopPropagation() {} };
const askUp = (w) => w.slide.screen.children.filter((k) => k.cls.has("askday"));
function ask(w) {
  w.slide.ids["sensor.life_stage"] = "sensor.life_stage";
  w.card._ask(w.slide, "weekend", "sensor.life_stage");
  return askUp(w)[0];
}

test("_ask: the box goes at ASK_MS (60000) and asking clears; nothing happens at 59990", () => {
  const w = world(ASK);
  const box = ask(w);
  assert.ok(box);
  w.run(59990);
  assert.strictEqual(askUp(w).length, 1);
  assert.strictEqual(w.slide.asking, undefined, "_ask itself leaves asking to its caller");
  w.slide.asking = true;
  w.settle();
  assert.strictEqual(askUp(w).length, 0);
  assert.strictEqual(w.slide.asking, false);
  assert.deepStrictEqual(short(w.log).slice(-1), ["60000 div1 remove"]);
});

test("A1: a focusin at 30000 restarts the ask to 90000, the box still up at 89990, and it is not closed by the focus", () => {
  const w = world(ASK);
  const box = ask(w);
  w.slide.asking = true;
  w.run(30000);
  box.dispatch("focusin", EV);
  assert.strictEqual(askUp(w).length, 1, "the focus did not close the question");
  assert.strictEqual(w.slide.asking, true);
  assert.deepStrictEqual(short(w.log).filter((x) => /remove/.test(x)), []);
  w.run(59990); // 89990
  assert.strictEqual(askUp(w).length, 1);
  assert.strictEqual(w.slide.asking, true);
  w.settle();
  assert.strictEqual(askUp(w).length, 0);
  assert.strictEqual(w.slide.asking, false);
  assert.deepStrictEqual(short(w.log).filter((x) => /remove/.test(x)), ["90000 div1 remove"]);
  assert.strictEqual(w.pendingTimers(), 0);
});

test("A1: a change and a re-focus re-arm the same way; the old 60000 timer is gone (one removal, at the last re-arm + 60000)", () => {
  const w = world(ASK);
  const box = ask(w);
  w.slide.asking = true;
  w.run(20000);
  box.dispatch("change", EV);
  w.run(20000);
  box.dispatch("focusin", EV);
  w.run(59990); // 99990
  assert.strictEqual(askUp(w).length, 1);
  w.settle();
  assert.deepStrictEqual(short(w.log).filter((x) => /remove/.test(x)), ["100000 div1 remove"]);
});

test("an answer tap closes the box and cancels the end timer: asking is false at once, nothing at 60000", () => {
  const w = world({ ...ASK, globals: { ...ASK.globals, pick: (l) => l[0], QUESTIONS: { weekend: { q: "weekend?", answers: { yes: ["ok"], no: ["no"] }, keep: false } } },
    fields: { _line: () => {}, _tapped: () => {} } });
  const box = ask(w);
  w.slide.asking = true;
  w.run(10000);
  const button = { dataset: { answer: "no" } };
  button.closest = () => button;
  box.dispatch("click", { ...EV, target: { closest: (q) => (q === "button" ? button : null) } });
  assert.strictEqual(askUp(w).length, 0);
  assert.strictEqual(w.slide.asking, false);
  assert.strictEqual(w.pendingTimers(), 0);
});

test("the box taken off by hand leaves the timer, whose done() then sets asking false at 60000", () => {
  const w = world(ASK);
  ask(w);
  w.slide.asking = true;
  w.run(1000);
  askUp(w)[0].remove();
  w.run(40000);
  assert.strictEqual(w.slide.asking, true);
  w.settle();
  assert.strictEqual(w.slide.asking, false);
});

test("D-keep (A2): the question up, disconnect at 1000, reconnect at 2000: still on screen at 59000, gone at 60000, asking false", () => {
  const w = world(ASK);
  ask(w);
  w.slide.asking = true;
  w.slide.queue = [];
  w.run(1000);
  w.disconnect();
  w.run(1000);
  w.reconnect();
  w.run(57000); // 59000
  assert.strictEqual(askUp(w).length, 1, "the box is still on screen");
  assert.strictEqual(w.slide.asking, true);
  w.run(1000); // 60000
  assert.strictEqual(askUp(w).length, 0, "gone at 60000");
  assert.strictEqual(w.slide.asking, false, "asking is a BUSY_OWNERS entry: never stuck");
  assert.deepStrictEqual(short(w.log).filter((x) => /remove/.test(x)), ["60000 div1 remove"]);
});

test("D-keep without a reconnect: the timer still fires on its own time after a disconnect", () => {
  const w = world(ASK);
  ask(w);
  w.slide.asking = true;
  w.run(1000);
  w.disconnect();
  w.run(58990);
  assert.strictEqual(askUp(w).length, 1);
  w.settle();
  assert.strictEqual(askUp(w).length, 0);
  assert.strictEqual(w.slide.asking, false);
});
