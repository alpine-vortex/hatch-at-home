// Memory M2 on the card (docs/plan-2026-11-02-memory.md sections 6a, 8, 10): the tag chips
// inside the big day's (and weekend's) typed step. node --test tests/js
// The row is there only while their memory is on, this pet allows it and the screen is
// their own; a tap picks one tag into step.tag (again, or "no tag", clears it); however the
// step ends, the one "yes" is sent once, with the tag so far and shared: false; with memory
// off the box is as it was and the send has no tag.
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");

const src = require("./card-source");
const grab = (re) => {
  const m = src.match(re);
  assert.ok(m, `not in the card: ${re}`);
  return m[0];
};
const method = (name) => grab(new RegExp(`\\n  (?:async )?${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`)).trim();
const table = (name) => grab(new RegExp(`\\nconst ${name} = \\{[\\s\\S]*?\\n\\};\\n`));

// Just enough DOM for the typed step's box: elements, attributes, listeners that bubble.
const DOM = `
class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.dataset = {};
    this.listeners = {}; this.className = ""; this.textContent = ""; this.value = ""; this.parent = null;
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  append(...kids) { for (const k of kids) { k.parent = this; this.children.push(k); } }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  closest(sel) {
    const [tag, cls] = sel.split(".");
    for (let e = this; e; e = e.parent) if (e.tagName === tag.toUpperCase() && e.className.split(" ").includes(cls)) return e;
    return null;
  }
  querySelector() { return null; }
  all() { return [this, ...this.children.flatMap((c) => c.all())]; }
  fire(type, extra = {}) {
    const ev = { target: this, stopPropagation() {}, ...extra };
    for (let e = this; e; e = e.parent) for (const fn of e.listeners[type] || []) fn(ev);
  }
}
const document = { createElement: (tag) => new El(tag), hidden: false };
`;

function load({ shared = false } = {}) {
  const store = new Map();
  const timers = [];
  const ctx = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: (id) => { if (id) timers[id - 1] = null; },
    Date,
  };
  vm.runInNewContext([
    DOM,
    table("MEMORY_TAG_CHIPS"),
    grab(/\nconst SHARED_KEY = [^\n]*\n/),
    grab(/\nfunction sharedScreen\(\) \{[\s\S]*?\n\}\n/),
    `const ASK_MS = 60000; const FOLLOW_TEXT_MAX = 40; const KEPT = "kept"; const MINE = "mine";
     const BIG_DAY = { what: "what is it?", kept: "i'll remember ♥" };
     const cleanTyped = (t) => (typeof t === "string" && t.trim()) || null;
     const followTextKeep = () => {};`,
    `function makeCard(mine) {
      const card = {
        calls: [], said: [], tapped: 0,
        _followOk: true,
        _memoryOn: undefined,
        _hass: { user: { id: "ada" }, callWS(msg) { card.calls.push(msg); return Promise.resolve({ until: "2026-11-10" }); } },
        _line(s, who, text) { card.said.push(text); },
        _askPlace() {},
        _tapped() { card.tapped += 1; },
        ${method("_mineSwitch")},
        ${method("_sendFollow")},
        ${method("_askTextStart")},
        ${method("_askText")},
        ${method("_tagChips")},
        ${method("_askTextEnd")},
      };
      const s = { mine, memoryAllowed: undefined, ids: { "sensor.life_stage": "e" }, screen: new El("div") };
      return { card, s };
    }`,
    "this.out = { makeCard, SHARED_KEY, MEMORY_TAG_CHIPS };",
  ].join("\n"), ctx);
  if (shared) store.set(ctx.out.SHARED_KEY, "on");
  return { ...ctx.out, timers };
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const flush = () => new Promise((r) => setImmediate(r));
const ON = { memory_on: true, memory_allowed: true };

// The box the step put on the screen once its line has been said.
function open(out, mine = ON, kind = "big_day", day = "2026-11-06") {
  const { card, s } = out.makeCard(mine);
  card._askTextStart(s, "e", kind, day);
  if (s.queue?.length) s.queue.shift().then();
  const box = s.screen.children.find((c) => c.className === "askday asktext");
  const chips = box ? box.all().filter((e) => e.className === "tag") : [];
  const button = (label) => box.children.find((c) => c.tagName === "BUTTON" && c.textContent === label);
  const input = box?.children.find((c) => c.tagName === "INPUT");
  return { card, s, box, chips, button, input, chip: (key) => chips.find((c) => c.dataset.tag === key) };
}

test("the chips have the approved words: the prompt, no tag first, then the eight", () => {
  const out = load();
  const { box, chips } = open(out);
  const prompt = box.children.find((c) => c.className === "tagq");
  assert.equal(prompt.textContent, "what kind of day is it?");
  assert.deepEqual(chips.map((c) => c.textContent),
    ["no tag", "exam", "match", "show", "trip", "party", "lesson", "work thing", "something else"]);
  assert.deepEqual(chips.map((c) => c.dataset.tag),
    ["", "exam", "match", "show", "trip", "party", "lesson", "work_thing", "something_else"]);
  assert.deepEqual(chips.map((c) => c.getAttribute("aria-label")), chips.map((c) => c.textContent));
  assert.equal(chips[0].getAttribute("aria-pressed"), "true"); // "no tag", the default
  assert.ok(chips.slice(1).every((c) => c.getAttribute("aria-pressed") === "false"));
  // In the one box, before its input, ok and skip: no stage of its own.
  assert.deepEqual(box.children.map((c) => c.className || c.tagName), ["tagq", "tags", "INPUT", "BUTTON", "BUTTON"]);
});

test("the row is there only with memory on, allowed here, on their own screen", () => {
  for (const mine of [{ memory_on: false, memory_allowed: true }, { memory_on: true, memory_allowed: false }, {}, null]) {
    const { box, chips } = open(load(), mine);
    assert.equal(chips.length, 0, JSON.stringify(mine));
    assert.deepEqual(box.children.map((c) => c.tagName), ["INPUT", "BUTTON", "BUTTON"]); // as it was
  }
  // The visit reply's flags stand in until the channel's mine (what the settings row reads).
  const out = load();
  const { card, s } = out.makeCard(undefined);
  card._memoryOn = true;
  s.memoryAllowed = true;
  card._askTextStart(s, "e", "weekend");
  s.queue.shift().then();
  assert.ok(s.textStep.box.all().some((e) => e.className === "tag"));
});

test("a shared screen gets no box and no chips: the yes goes at once, with no tag", async () => {
  const out = load({ shared: true });
  const { card, s } = out.makeCard(ON);
  card._askTextStart(s, "e", "big_day", "2026-11-06");
  assert.equal(s.textStep, undefined);
  assert.equal(s.screen.children.length, 0);
  assert.deepEqual(card.calls, []); // a shared screen sends no follow-up at all
});

test("a tap picks one tag; the same chip again, or no tag, clears it", () => {
  const { s, chip, card } = open(load());
  chip("show").fire("click");
  assert.equal(s.textStep.tag, "show");
  assert.equal(chip("show").getAttribute("aria-pressed"), "true");
  assert.equal(chip("").getAttribute("aria-pressed"), "false");
  chip("trip").fire("click");
  assert.equal(s.textStep.tag, "trip");
  assert.equal(chip("show").getAttribute("aria-pressed"), "false");
  chip("trip").fire("click");
  assert.equal(s.textStep.tag, null);
  assert.equal(chip("").getAttribute("aria-pressed"), "true");
  chip("lesson").fire("click");
  chip("").fire("click");
  assert.equal(s.textStep.tag, null);
  assert.equal(card.tapped, 5);
  assert.equal(card.calls.length, 0); // a tap sends nothing
});

// Every way the typed step ends: ok, skip, an empty ok, Enter, the timer, and the tick's
// end (a slide switch or a hidden tab both call _askTextEnd(s) with nothing).
const ENDS = {
  ok: (o) => { o.input.value = "the play"; o.button("ok").fire("click"); },
  skip: (o) => o.button("skip").fire("click"),
  empty: (o) => o.button("ok").fire("click"),
  enter: (o) => { o.input.value = "the play"; o.input.fire("keydown", { key: "Enter" }); },
  timer: (o, out) => out.timers.filter(Boolean).at(-1)?.(),
  tick: (o) => o.card._askTextEnd(o.s),
};

for (const [name, end] of Object.entries(ENDS)) {
  test(`${name}: the one yes carries the tag and shared: false, once`, async () => {
    const out = load();
    const o = open(out);
    o.chip("match").fire("click");
    end(o, out);
    end(o, out); // a second end is nothing
    o.card._askTextEnd(o.s);
    await flush();
    assert.equal(o.card.calls.length, 1);
    const msg = plain(o.card.calls[0]);
    assert.equal(msg.tag, "match");
    assert.equal(msg.shared, false);
    assert.equal(msg.answer, "yes");
    assert.equal(msg.question, "big_day");
    assert.equal(msg.day, "2026-11-06");
    assert.equal(msg.text, ["ok", "enter"].includes(name) ? "the play" : undefined);
    assert.equal(o.box.parent, null); // the box is gone
  });

  test(`${name}: with no tag picked the yes has no tag key`, async () => {
    const out = load();
    const o = open(out);
    end(o, out);
    await flush();
    assert.equal(o.card.calls.length, 1);
    assert.ok(!("tag" in o.card.calls[0]));
  });
}

test("with memory off the box has no chips and the send has no tag key", async () => {
  const p = open(load(), { memory_on: false, memory_allowed: true });
  assert.equal(p.chips.length, 0);
  p.button("skip").fire("click");
  await flush();
  assert.equal(p.card.calls.length, 1);
  assert.ok(!("tag" in p.card.calls[0]));
});

test("a weekend's step sends its tag the same way, with no day", async () => {
  const o = open(load(), ON, "weekend", null);
  o.chip("something_else").fire("click");
  o.button("skip").fire("click");
  await flush();
  assert.deepEqual(plain(o.card.calls), [{ type: "virtual_pet/answer", entity_id: "e", question: "weekend",
    answer: "yes", shared: false, tag: "something_else" }]);
});

test("a tap after the step has ended changes nothing", async () => {
  const o = open(load());
  o.button("skip").fire("click");
  o.chip("show").fire("click");
  await flush();
  assert.equal(o.card.calls.length, 1);
  assert.ok(!("tag" in o.card.calls[0]));
});

test("the chip labels are text, never markup", () => {
  assert.match(method("_tagChips"), /chip\.textContent = label/);
  assert.match(method("_tagChips"), /prompt\.textContent = MEMORY_TAG_CHIPS\.q/);
  assert.doesNotMatch(method("_tagChips"), /innerHTML/);
});

// Doors 1, 3 and 11 (plan 6a): the approved line by the note's tag; a tag with no line
// says nothing (door 1, 3) or the usual line (door 11); not at 24 months.
function notes() {
  const entry = (text, key) => {
    const m = text.match(new RegExp(`\\n  ${key}: [\\s\\S]*?,\\n(?=  (?://|\\w+:)|\\};)`));
    assert.ok(m, `no ${key}`);
    return m[0].trim();
  };
  const ctx = {};
  vm.runInNewContext([
    table("MEMORY_TAG_DOORS"),
    grab(/\nconst tagDoor = [^\n]*\n/),
    `const months = (n) => n + " months";`,
    `const NOTES = { ${["friends_for", "door1", "door3", "door10"].map((k) => entry(table("NOTES"), k)).join("\n")} };`,
    "this.out = { NOTES, MEMORY_TAG_DOORS };",
  ].join("\n"), ctx);
  return ctx.out;
}

test("doors 1 and 3 say their approved line by tag, and nothing for a tag with none", () => {
  const { NOTES } = notes();
  assert.equal(NOTES.door1({ kind: "door1", tag: "show" }), "thinking of the show you told me about");
  assert.equal(NOTES.door1({ kind: "door1", tag: "exam" }), "thinking of the exam you told me about");
  assert.equal(NOTES.door3({ kind: "door3", tag: "trip" }), "a year ago you told me about a trip ♥");
  for (const t of ["exam", "work_thing", "something_else", "toString", undefined, "<b>x</b>"]) {
    assert.ok(!NOTES.door3({ kind: "door3", tag: t }), String(t));
  }
  for (const t of ["work_thing", "something_else", "constructor", undefined]) assert.ok(!NOTES.door1({ kind: "door1", tag: t }), String(t));
});

test("door 10 says its approved line for match, show and lesson only", () => {
  const { NOTES } = notes();
  assert.equal(NOTES.door10({ kind: "door10", tag: "match" }), "maybe a match tomorrow! go you ♥");
  assert.equal(NOTES.door10({ kind: "door10", tag: "show" }), "maybe a show tomorrow! break a leg ♥");
  assert.equal(NOTES.door10({ kind: "door10", tag: "lesson" }), "maybe a lesson tomorrow! have fun ♥");
  for (const t of ["exam", "trip", "party", "work_thing", "something_else", "valueOf", undefined]) {
    assert.ok(!NOTES.door10({ kind: "door10", tag: t }), String(t));
  }
});

test("door 11: the 12-month friends note with a tag says the recap, else the usual line", () => {
  const { NOTES } = notes();
  assert.equal(NOTES.friends_for({ kind: "friends_for", months: 12, tag: "lesson" }), "a whole year! you told me about a lesson");
  assert.equal(NOTES.friends_for({ kind: "friends_for", months: 12, tag: "exam" }), "a whole year! you told me about an exam");
  const usual = "we've been friends for a whole year!! ♥";
  assert.equal(NOTES.friends_for({ kind: "friends_for", months: 12 }), usual);
  assert.equal(NOTES.friends_for({ kind: "friends_for", months: 12, tag: "work_thing" }), usual);
  assert.equal(NOTES.friends_for({ kind: "friends_for", months: 12, tag: "valueOf" }), usual);
  assert.equal(NOTES.friends_for({ kind: "friends_for", months: 24, tag: "show" }), "we've been friends for 2 years!! ♥");
  assert.equal(NOTES.friends_for({ kind: "friends_for", months: 3, tag: "show" }), "we've been friends for 3 months! ♥");
});

test("every door line is at most 40 characters and says 'told me', never that it happened", () => {
  const { MEMORY_TAG_DOORS } = notes();
  for (const [door, lines] of Object.entries(MEMORY_TAG_DOORS)) {
    for (const [tag, line] of Object.entries(lines)) {
      assert.ok([...line].length <= 40, `${door}.${tag}`);
      if (door !== "door10") assert.match(line, /you told me about/, `${door}.${tag}`);
    }
  }
  assert.deepEqual(Object.keys(MEMORY_TAG_DOORS.door3), ["match", "show", "trip", "party", "lesson"]);
  assert.deepEqual(Object.keys(MEMORY_TAG_DOORS.door10), ["match", "show", "lesson"]);
});
