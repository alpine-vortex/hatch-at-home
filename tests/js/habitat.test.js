const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../../src/card/card-habitat.js"), "utf8");

function fixture(reduced = false) {
  const api = vm.runInNewContext(
    `${source}\n({ Card: HatchPetCardHabitat, habitatAssign, habitatView })`,
    { HatchPetCardShoreCrab: class {}, calm: () => reduced },
  );
  const card = new api.Card();
  const notes = [];
  const timers = [];
  const peek = () => ({ hidden: true, getBoundingClientRect: () => ({ width: 20 }) });
  const s = {
    species: {}, pet: { getAttribute: () => "bird.png" },
    screen: {
      dataset: {}, classList: { add() {}, remove() {} },
      style: { setProperty() {}, removeProperty() {} },
    },
    habitatHome: {
      layer: { hidden: false }, idleCount: 0,
      spots: [{ id: "hideout", peek: peek() }, { id: "cup", peek: peek() }],
    },
  };
  card._activityReady = () => true;
  card._freeBody = () => true;
  card._questionOn = () => false;
  card._habitatQuiet = () => {};
  card._habitatMessage = (_, line) => notes.push(line);
  card._headCrop = (slide, el) => { el.head = slide.pet.getAttribute("src"); };
  card._moving = () => {};
  card._later = (_, delay, run, options) => timers.push({ delay, run, options });
  card._drain = (_, selector) => {
    const drained = timers.splice(0);
    for (const timer of drained) if (timer.options.group === selector.group) timer.options.undo();
  };
  return { ...api, card, s, notes, timers };
}

test("moving a prop clears its old spot, and unknown or locked props stay hidden", () => {
  const { habitatAssign, habitatView } = fixture();
  const original = ["hideout", "cup"];
  assert.deepEqual(Array.from(habitatAssign(original, 0, "cup")), ["cup", null]);
  assert.deepEqual(Array.from(habitatAssign(original, 0, null)), [null, "cup"]);
  assert.deepEqual(original, ["hideout", "cup"]);
  const layout = (slots, cup = true) => habitatView({ version: 1, revision: 1, slots, cup }).slots;
  assert.deepEqual(Array.from(layout(["hideout", "cup"], false)), ["hideout", null]);
  assert.deepEqual(Array.from(layout([["cup"], "retired"])), [null, null]);
  assert.deepEqual(Array.from(layout(["hideout", "hideout"])), ["hideout", null]);
});

test("both furnishings get a turn with two ordinary idles between their acts", () => {
  const { card, s, timers } = fixture();
  for (const [spot, prop] of ["hideout", "cup", "hideout"].entries()) {
    assert.equal(card._habitatIdle(s), false);
    assert.equal(card._habitatIdle(s), false);
    assert.equal(card._habitatIdle(s), true);
    assert.equal(s.habitatUse.prop, prop, `idle use ${spot}`);
    assert.equal(card._habitatIdle(s), false);
    assert.equal(timers.every((timer) => timer.options.hidden === "tab"), true);
    card._habitatStop(s);
    assert.equal(s.habitatUse, null);
  }
});

test("reduced motion holds distinct still poses and interrupts cleanly", () => {
  const { card, s, notes, timers } = fixture(true);
  card._habitatTap(s, 0);
  assert.equal(s.screen.dataset.habitatAct, "hideout");
  assert.equal(s.screen.dataset.habitatPhase, "use");
  const peek = s.habitatHome.spots[0].peek;
  assert.equal(peek.hidden, false);
  assert.equal(peek.head, "bird.png");
  card._habitatTap(s, 1);
  assert.equal(notes.at(-1), "Already exploring.");
  card._habitatStop(s);
  assert.equal(peek.hidden, true);

  card._habitatTap(s, 1);
  assert.equal(s.screen.dataset.habitatAct, "cup");
  assert.equal(s.screen.dataset.habitatPhase, "use");
  assert.equal(notes.at(-1), "A little sip from the cup.");
  timers.shift().run();
  assert.equal(s.screen.dataset.habitatPhase, "up");
  card._habitatStop(s);
  assert.equal(s.habitatUse, null);
  assert.equal(s.screen.dataset.habitatPhase, undefined);
});
