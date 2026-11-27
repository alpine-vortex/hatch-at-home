const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../../src/card/card-fetch.js"), "utf8");

function fixture(reduced = false) {
  const context = {
    HatchPetCardActivity: class {},
    calm: () => reduced,
    performance: { now: () => 0 },
  };
  const { FetchCard, home, farEdge, rolls, point, comeBack } = vm.runInNewContext(
    `${source}
    ({ FetchCard: HatchPetCardFetch, home: FETCH_HOME, farEdge: FETCH_FAR_EDGE,
       rolls: FETCH_ROLLS, point: fetchPoint, comeBack: fetchReturn })`,
    context,
  );
  const card = new FetchCard();
  const timeline = [];
  const updates = [];
  const s = {
    fetch: {
      phase: "aim", poses: ["adult_ball_fetch_1", "adult_ball_fetch_2"], pose: "adult_ball_fetch_1",
      dog: home.dog, ball: home.ball,
    },
    screen: { classList: { remove() {} } },
  };
  card._activityUpdate = () => updates.push(s.fetch.phase);
  card._fetchMoveFocus = () => {};
  card._fetchPaint = () => {};
  card._director = { frame: (_, callback, options) => timeline.push({ callback, options }) };
  card._stop = (_, selector) => {
    for (const item of timeline) {
      if (item.options.key === selector.key) item.stopped = true;
    }
  };
  return { card, timeline, updates, s, home, farEdge, rolls, point, comeBack };
}

test("straight intercepts near the ball while the bank reverses at the safe edge", () => {
  const { point, rolls, farEdge } = fixture();
  const { straight, bank } = rolls;
  assert.equal(point(straight.dog, 580)[0], 32);
  assert.ok(point(straight.ball, 580)[0] > point(straight.ball, straight.duration)[0]);
  assert.equal(point(bank.ball, 290)[0], farEdge);
  assert.ok(point(bank.ball, 400)[0] < farEdge);
  assert.equal(point(bank.dog, 559)[2], 1);
  assert.equal(point(bank.dog, 560)[2], -1);
  assert.ok(point(bank.dog, 720)[0] < point(bank.dog, 560)[0]);
  assert.notEqual(point(bank.ball, bank.duration)[1], point(straight.ball, straight.duration)[1]);
});

test("both routes return the corgi and ball to their launch position", () => {
  const { home, rolls, point, comeBack } = fixture();
  for (const roll of Object.values(rolls)) {
    const back = comeBack(roll);
    assert.deepEqual(point(back.ball, 0).slice(0, 2), point(roll.ball, roll.duration));
    assert.deepEqual(point(back.dog, 0), point(roll.dog, roll.duration));
    assert.deepEqual(point(back.ball, back.duration), home.ball);
    assert.deepEqual(point(back.dog, back.duration), home.dog);
  }
});

test("reduced motion exposes each still outcome and makes both rolls replayable", () => {
  const { card, timeline, updates, s, home, rolls, point } = fixture(true);
  for (const [direction, roll] of Object.entries(rolls)) {
    card._fetchRoll(s, direction);
    assert.equal(s.fetch.phase, "settled");
    assert.equal(card._fetchText(s.fetch), roll.outcome);
    assert.deepEqual(s.fetch.ball, point(roll.ball, roll.duration));
    card._fetchRecall(s);
    assert.equal(s.fetch.phase, "aim");
    assert.deepEqual(s.fetch.ball, home.ball);
  }
  assert.deepEqual(timeline, []);
  assert.deepEqual(updates, ["settled", "aim", "settled", "aim"]);
});

test("a late frame cannot paint another session after an interrupted roll", () => {
  const { card, timeline, updates, s, home } = fixture();
  card._fetchRoll(s, "bank");
  const frame = timeline[0];
  assert.equal(frame.options.hidden, "tab");
  card._fetchClosed(s);
  assert.ok(frame.stopped);
  s.fetch = { phase: "aim", ball: home.ball };
  frame.callback(2000);
  frame.options.undo();
  assert.equal(s.fetch.phase, "aim");
  assert.deepEqual(s.fetch.ball, home.ball);
  assert.deepEqual(updates, ["rolling"]);
});
