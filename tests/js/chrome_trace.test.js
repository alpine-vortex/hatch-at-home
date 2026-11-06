// Director migration slice 1 (chrome), the characterization: docs/plan-2026-11-06-director-migration.md 5.1 and
// 6.1. Each trace pins what the player could see, as `{ t, el, op, arg }`, for R1-R5 (the tap, the perk, the
// failed class), R25 (the status note), R26 (the mould frame), R27 (the head swap), R28 (the wipe) and R40 (the
// mode swap). It passes on the unmoved code (bare timers on the fake clock) and passes unchanged after the move
// (the same sites through the ledger). Reduced motion is whatever the unmoved code does, both ways (F13).
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world, trace } = require("./timer_trace");

const short = (log) => log.map((x) => `${x.t} ${x.el} ${x.op}${x.arg === undefined ? "" : ` ${x.arg}`}`);
const only = (log, re) => short(log).filter((x) => re.test(x));

// ---- R1-R3: _tapped, with and without a slide (54 of its 67 callers pass none) ----

const tapSpec = { methods: ["_tapped", "_perk"] };
const toy = (w) => {
  const b = w.el("button");
  b.cls.add("toy");
  return b;
};

test("a tap on a toy: the three classes at once, pressed off at 160, tapped at 400, the ring at 500; a perk on a slide", () => {
  const site = (card, s, w) => card._tapped(toy(w), s);
  for (const calm of [false, true]) {
    assert.deepStrictEqual(short(trace(tapSpec, site, { calm }).log), [
      "0 button class+ tap-feedback", "0 button class+ tapped", "0 button class+ pressed", "0 button append span",
      "0 pet class- perk", "0 pet reflow", "0 pet class+ perk",
      "160 button class- pressed", "320 pet class- perk", "400 button class- tapped", "500 span remove",
    ], `calm ${calm}: no calm() guard`);
  }
});

test("a tap on a plain button: no ring; { perk: false } leaves the pet alone", () => {
  const site = (card, s, w) => card._tapped(w.el("button"), s, { perk: false });
  assert.deepStrictEqual(short(trace(tapSpec, site).log), [
    "0 button class+ tap-feedback", "0 button class+ tapped", "0 button class+ pressed",
    "160 button class- pressed", "400 button class- tapped",
  ]);
});

test("_tapped with no slide: the classes and the ring come and go at 160, 400, 500; _perk does nothing, no throw", () => {
  const site = (card, s, w) => card._tapped(toy(w), s);
  for (const calm of [false, true]) {
    const r = trace(tapSpec, site, { noSlide: true, calm });
    assert.strictEqual(r.threw, null);
    assert.deepStrictEqual(short(r.log), [
      "0 button class+ tap-feedback", "0 button class+ tapped", "0 button class+ pressed", "0 button append span",
      "160 button class- pressed", "400 button class- tapped", "500 span remove",
    ]);
  }
});

test("a disabled button or none is not tapped: nothing happens", () => {
  const off = trace(tapSpec, (card, s, w) => {
    const b = w.el("button");
    b.disabled = true;
    card._tapped(b, s);
    card._tapped(null, s);
  });
  assert.strictEqual(off.threw, null);
  assert.deepStrictEqual(off.log, []);
});

test("the double tap quirk: two taps 100 ms apart give two timers; the first removes pressed at 160, the second's at 260 is a no-op", () => {
  const site = (card, s, w) => {
    const b = toy(w);
    card._tapped(b, s, { perk: false });
    w.advance(100);
    card._tapped(b, s, { perk: false });
  };
  const got = only(trace(tapSpec, site).log, /button class- |span remove/);
  // pressed leaves at 160 (the first tap's timer), though the second tap came at 100; the second tap's own
  // timer then runs at 260 and removes what is already off. The same for tapped (400, 500) and the rings.
  assert.deepStrictEqual(got, [
    "160 button class- pressed", "260 button class- pressed", "400 button class- tapped", "500 span remove",
    "500 button class- tapped", "600 span remove",
  ]);
});

test("a second perk 150 ms after the first: the first timer takes the class off at 320, the second's at 470 is a no-op", () => {
  const spec = { methods: ["_perk"] };
  const site = (card, s, w) => {
    card._perk(s);
    w.advance(150);
    card._perk(s);
  };
  assert.deepStrictEqual(short(trace(spec, site).log), [
    "0 pet class- perk", "0 pet reflow", "0 pet class+ perk",
    "150 pet class- perk", "150 pet reflow", "150 pet class+ perk", // the second call restarts it: off, reflow, on
    "320 pet class- perk", "470 pet class- perk",
  ]);
});

// ---- R5: the failed class (card scope, 400 ms) ----

test("a refused call: failed on, off at 400; with no slide the same", async () => {
  for (const noSlide of [false, true]) {
    const w = world({ methods: ["_call", "_tapped", "_perk"], fields: {
      _hass: { callService: () => Promise.reject(new Error("no")) },
    } });
    const b = w.el("button");
    await w.card._call(b, noSlide ? undefined : w.slide, "light", "turn_on", "light.x");
    w.advance(1000);
    assert.deepStrictEqual(only(w.log, /button class[+-] (failed|pending)/), [
      "0 button class+ pending", "0 button class+ failed", "0 button class- pending", "400 button class- failed",
    ], `noSlide ${noSlide}`);
  }
});

// ---- R25: the status note ----

const noteSpec = { methods: ["_statusMessage"], slide: (el) => {
  const note = el("note");
  let hidden = false;
  let text = "";
  Object.defineProperty(note, "hidden", { get: () => hidden, set: (v) => { hidden = v; note.logged?.("hidden", v); } });
  Object.defineProperty(note, "textContent", { get: () => text, set: (v) => { text = v; note.logged?.("text", v); } });
  note.querySelector = () => null;
  return { status: { querySelector: (q) => (q === ".status-feedback" ? note : null), note,
    getBoundingClientRect: () => ({ top: 0, bottom: 0 }) } };
} };
const noteLog = (w) => {
  const note = w.slide.status.note;
  note.logged = (op, v) => w.log.push({ t: w.t(), el: "note", op, arg: v });
  return note;
};

test("the status note: shown at once, hidden and emptied at 3500", () => {
  for (const calm of [false, true]) {
    const r = trace(noteSpec, (card, s, w) => {
      noteLog(w);
      card._statusMessage(s, "saved");
    }, { calm });
    assert.deepStrictEqual(short(r.log), ["0 note text saved", "0 note hidden false", "3500 note hidden true", "3500 note text "]);
  }
});

test("a second note at 1000 restarts it: the note stays shown to 4500, and the first timer never hides it (A1)", () => {
  const r = trace(noteSpec, (card, s, w) => {
    noteLog(w);
    card._statusMessage(s, "one");
    w.advance(1000);
    card._statusMessage(s, "two");
  });
  assert.deepStrictEqual(short(r.log), [
    "0 note text one", "0 note hidden false",
    "1000 note text two", "1000 note hidden false",
    "4500 note hidden true", "4500 note text ",
  ]);
});

// ---- R40: the mode swap ----

const swapSpec = { methods: ["_modeSwap"] };
const eight = (card, w) => {
  const btns = Array.from({ length: 8 }, (_, i) => w.el(`b${i}`));
  card._modeButtons = () => btns;
  return btns;
};

test("the mode swap: swap on the eight, off at 90; none under calm", () => {
  const site = (card, s, w) => {
    eight(card, w);
    card._modeSwap(s);
  };
  const live = short(trace(swapSpec, site).log);
  assert.deepStrictEqual(live, [
    ...Array.from({ length: 8 }, (_, i) => `0 b${i} class+ swap`),
    ...Array.from({ length: 8 }, (_, i) => `90 b${i} class- swap`),
  ]);
  assert.deepStrictEqual(trace(swapSpec, site, { calm: true }).log, []);
});

test("a second swap at 50: the class stays on to 140, one removal of the eight, the first timer never runs (A1)", () => {
  const r = trace(swapSpec, (card, s, w) => {
    eight(card, w);
    card._modeSwap(s);
    w.advance(50);
    card._modeSwap(s);
  });
  assert.deepStrictEqual(only(r.log, /b0 /), ["0 b0 class+ swap", "50 b0 class+ swap", "140 b0 class- swap"]);
  assert.strictEqual(short(r.log).filter((x) => / class- swap/.test(x)).length, 8);
});

// ---- R28: the wipe ----

const wipeSpec = { methods: ["_wipe"], consts: ["WIPE_UP_MS"], slide: (el) => ({ status: el("status") }) };
const WIPES = ["wipe-side", "wipe-down", "wipe-up"];

test("the wipe: the three classes cleared, a reflow, one added; off at 170 for up, 220 otherwise; the same under calm", () => {
  for (const calm of [false, true]) {
    for (const [kind, ms] of [["up", 170], ["side", 220], ["down", 220]]) {
      const r = trace(wipeSpec, (card, s) => card._wipe(s, kind), { calm });
      assert.deepStrictEqual(short(r.log), [
        ...WIPES.map((c) => `0 status class- ${c}`), "0 status reflow", `0 status class+ wipe-${kind}`,
        ...WIPES.map((c) => `${ms} status class- ${c}`),
      ], `${kind} calm ${calm}`);
    }
    // the default is side
    assert.ok(short(trace(wipeSpec, (card, s) => card._wipe(s), { calm }).log).includes("0 status class+ wipe-side"));
  }
});

test("side then up together: one removal at 170 from the second call; wipe-up is on at 100 ms", () => {
  const w = world(wipeSpec);
  w.card._wipe(w.slide, "side");
  w.card._wipe(w.slide, "up");
  w.advance(100);
  assert.ok(w.slide.status.cls.has("wipe-up"), "wipe-up still on at 100");
  w.advance(100);
  assert.deepStrictEqual([...w.slide.status.cls], []);
  assert.deepStrictEqual(only(w.log, /status class- /).filter((x) => /^(\d+) /.exec(x)[1] !== "0"),
    WIPES.map((c) => `170 status class- ${c}`), "one removal, at 170, from the second call");
});

test("side at 0, up at 100: the class stays on to 270 (the first timer's 220 never takes it off)", () => {
  const w = world(wipeSpec);
  w.card._wipe(w.slide, "side");
  w.advance(100);
  w.card._wipe(w.slide, "up");
  w.advance(160);
  assert.ok(w.slide.status.cls.has("wipe-up"), "on at 260, past the first call's 220");
  w.advance(20);
  assert.deepStrictEqual([...w.slide.status.cls], []);
  assert.deepStrictEqual(only(w.log, /status class- wipe-up/).map((x) => x.split(" ")[0]), ["0", "100", "270"]);
});

// ---- R27 and R26: _renderShelf (the head swap and the mould frame) ----

const shelfSpec = (extra = {}) => ({
  methods: ["_renderShelf"],
  watch: ["_mould"],
  consts: ["STAGE_LABELS"],
  globals: { seasonNow: () => null, STAGE_LABELS: {} },
  fields: { _config: {}, _hass: { devices: {} }, ...extra },
});
const plain = (w, name) => {
  const e = w.el(name);
  e.getAttribute = () => null;
  e.setAttribute = () => {};
  e.style.setProperty = () => {};
  e.querySelector = () => plain(w, `${name}.q`);
  e.querySelectorAll = () => [];
  return e;
};
const slideOf = (w, id, over = {}) => ({
  el: plain(w, `slide-${id}`), device: plain(w, `device-${id}`), screen: plain(w, `screen-${id}`), ids: { device: id },
  world: { backdrop: "a", ground: "b", ink: "c", subink: "d" }, empty: false, ...over,
});
// A card with two slides on show, the second the one rendered; `from` is the pet the title shows.
const shelf = (w, { px = false } = {}) => {
  const card = w.card;
  w.sandbox.document.createElement = (tag) => plain(w, tag); // the dots
  const title = w.el("title");
  const a = w.slide;
  Object.assign(a, slideOf(w, "a", { pet: a.pet }));
  const b = slideOf(w, "b", { pet: w.el("pet-b"), px: px ? 1 : 0 });
  const nodes = { ".title": title, ".emblem": plain(w, "emblem"), ".head .sub": plain(w, "sub"),
    ".statusbtn": plain(w, "statusbtn") };
  card._card = { style: { setProperty() {} }, querySelector: (q) => nodes[q] || plain(w, q), querySelectorAll: () => [] };
  card._viewport = { clientWidth: 400, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  card._track = { style: {} };
  card._dots = { children: [], append(...k) { this.children.push(...k); }, get lastChild() { return this.children.at(-1); } };
  card._slides = [a, b];
  card._index = 1;
  card._headFor = a;
  title.textContent = "A";
  return { a, b, title };
};

test("the head swap: the new pet's name waits 250 ms (half the slide), a second render does not start another timer", () => {
  const w = world(shelfSpec());
  const { a, b, title } = shelf(w);
  w.card._renderShelf();
  assert.strictEqual(title.textContent, "A", "the name has not changed yet");
  assert.strictEqual(w.card._headFor, a);
  assert.strictEqual(w.pendingTimers(), 1);
  w.advance(100);
  w.card._renderShelf(); // a re-render mid-swap: no second timer
  assert.strictEqual(w.pendingTimers(), 1, "still one head timer");
  assert.strictEqual(title.textContent, "A");
  w.advance(149);
  assert.strictEqual(title.textContent, "A");
  assert.strictEqual(w.card._headFor, a);
  w.advance(1);
  assert.strictEqual(w.card._headFor, b, "at 250 the swap runs: _headFor moves to the new pet");
  assert.strictEqual(title.textContent, "Pet", "and the name is drawn");
  assert.strictEqual(w.pendingTimers(), 0, "it fires once");
  w.advance(1000);
  assert.strictEqual(w.pendingTimers(), 0);
});

test("the head swap is not made under calm, for the same pet, or for the empty card: the name is drawn at once", () => {
  for (const [why, calm, mutate] of [["calm", true, () => {}], ["same pet", false, (x) => { x.card._headFor = x.b; }],
    ["empty", false, (x) => { x.b.empty = true; }]]) {
    const w = world(shelfSpec());
    w.calm = calm;
    const x = { ...shelf(w), card: w.card };
    mutate(x);
    w.card._renderShelf();
    assert.strictEqual(w.pendingTimers(), 0, why);
    if (why !== "empty") assert.strictEqual(x.title.textContent, "Pet", why);
  }
});

test("a disconnect during the swap ends it: the name never swaps; the closer is the card's own (R27)", () => {
  const w = world(shelfSpec());
  const { a, title } = shelf(w);
  w.card._renderShelf();
  w.advance(100);
  w.disconnect();
  assert.strictEqual(w.pendingTimers(), 0);
  w.advance(1000);
  assert.strictEqual(w.card._headFor, a);
  assert.strictEqual(title.textContent, "A");
  // and a render after a reattach starts a fresh swap
  w.card._renderShelf();
  assert.strictEqual(w.pendingTimers(), 1);
  w.advance(250);
  assert.strictEqual(title.textContent, "Pet");
});

test("the mould frame: one frame after a layout with a grid, calm both ways; none without the grid", () => {
  for (const calm of [false, true]) {
    const w = world(shelfSpec());
    w.calm = calm;
    shelf(w, { px: true });
    w.card._renderShelf();
    w.advance(100);
    assert.deepStrictEqual(only(w.log, /card call/), ["16 card call _mould"], `calm ${calm}`);
    assert.strictEqual(w.calls.find((c) => c.name === "_mould").args[0], w.card._slides[1]);
  }
  const none = world(shelfSpec());
  shelf(none, { px: false });
  none.card._renderShelf();
  none.advance(100);
  assert.deepStrictEqual(only(none.log, /card call/), []);
});

test("D-keep: the mould frame fires through a disconnect (a frame is not a closer's business)", () => {
  const w = world(shelfSpec());
  shelf(w, { px: true });
  w.card._renderShelf();
  w.disconnect();
  w.advance(100);
  assert.deepStrictEqual(only(w.log, /card call/), ["16 card call _mould"]);
});
