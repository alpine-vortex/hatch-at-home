const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "../../src/card", file), "utf8");
const C = vm.runInNewContext(`
  const hopArtStyle = () => "";
  class HatchPetCardFamilyBedtime {}
  ${read("hop-engine.js")}
  ${read("card-household-hop.js")}
  HatchPetCardHouseholdHop
`, { crypto: require("node:crypto").webcrypto });

const board = { w: 3, h: 2, grid: ["PoN", "..."], family: "hop", specials: 0 };
const empty = { status: "empty", revision: 0, can_start: true };
const active = (revision, moves = "", handoff = false) => ({
  status: "active", revision, moves, handoff, board, rule_version: 1,
});
const complete = { ...active(4, "bc"), status: "complete" };
const settle = () => new Promise(setImmediate);

function harness(initial) {
  const card = new C();
  const requests = [];
  const timers = new Map();
  const gameplay = { pet_ref: "pet-one", household_hop_enabled: true, household_hop: initial };
  const slide = { house: { gameplay }, ids: { "sensor.life_stage": "sensor.pip_life_stage" } };
  card._slides = [slide];
  card._index = 0;
  card._boardsChoosing = () => false;
  card._activityOpen = (s, activity) => {
    s.activity = { ...activity, panel: { classList: { add() {} } } };
    return true;
  };
  card._activityClose = (s, reason) => {
    s.activity.close(reason);
    s.activity = null;
  };
  card._activityUpdate = () => {};
  card._activityFocus = () => {};
  card._later = (_, delay, fn, { key }) => timers.set(key, fn);
  card._stop = (_, { key }) => timers.delete(key);
  card._hass = { callWS: (message) => new Promise((resolve, reject) => requests.push({ message, resolve, reject })) };
  return {
    card, slide, requests,
    async open(canEdit = true) {
      assert.equal(card._householdHopOpen(slide), true);
      requests.at(-1).resolve({ result: "ok", can_edit: canEdit, state: gameplay.household_hop });
      await settle();
      assert.ok(slide.activity);
    },
    push(state) {
      gameplay.household_hop = state;
      card._householdHopSync(slide);
    },
    press(label) {
      const control = slide.activity.buttons().find((item) => item.label === label && !item.disabled);
      assert.ok(control, label);
      control.act();
    },
    timeOut() {
      for (const fn of timers.values()) fn();
    },
  };
}

test("a delayed reply cannot restore an earlier revision and a stale move is never resubmitted", async () => {
  const h = harness(active(1));
  await h.open();
  h.press("Step right");
  assert.equal(h.requests.at(-1).message.cell, 1);
  assert.equal(h.requests.at(-1).message.revision, 1);
  assert.equal(h.slide.activity.text(), "Saving turn…");
  h.push(active(2, "b"));
  assert.equal(h.slide.householdHop.position.pos, 1);
  assert.ok(h.slide.activity.buttons().every((item) => item.disabled));
  h.push(complete);
  h.requests.at(-1).resolve({ result: "changed", state: active(2, "b") });
  await settle();
  assert.equal(h.slide.householdHop.position.pos, 2);
  assert.match(h.slide.activity.text(), /updated.*nest/i);
  assert.equal(h.requests.length, 2);
});

test("retry keeps the original request across a timeout and reopening", async () => {
  const h = harness(empty);
  await h.open();
  h.press("Start Household Hop");
  const lost = h.requests.at(-1);
  assert.match(lost.message.request_id, /^[0-9a-f]{32}$/);
  h.timeOut();
  assert.match(h.slide.activity.text(), /retry/i);
  h.card._activityClose(h.slide, "calling");
  await h.open();
  h.press("Retry this turn");
  const retry = h.requests.at(-1);
  assert.deepEqual(retry.message, lost.message);
  lost.resolve({ result: "ok", state: active(50) });
  retry.resolve({ result: "ok", state: active(1) });
  await settle();
  assert.equal(h.slide.householdHop.view.revision, 1);
  assert.equal(h.slide.householdHop.position.pos, 0);
  assert.equal(h.slide.householdHopRetry, null);
});

test("readers see a saved tile and have no mutation controls", async () => {
  const h = harness(active(3, "b", true));
  await h.open(false);
  assert.equal(h.slide.householdHop.position.pos, 1);
  assert.match(h.slide.activity.text(), /saved turn here/i);
  assert.equal(h.slide.activity.buttons().length, 0);
  h.push({ ...complete, can_start: true });
  assert.equal(h.slide.householdHop.position.pos, 2);
  assert.equal(h.slide.activity.buttons().length, 0);
});

test("supported puzzles resume at their exact tile and restart requires confirmation", async () => {
  const h = harness(active(3, "b", true));
  await h.open();
  h.press("Continue from the saved tile");
  assert.equal(h.requests.length, 1);
  h.press("Restart this board");
  assert.equal(h.requests.length, 1);
  assert.match(h.slide.activity.text(), /clear all moves/i);
  h.press("Confirm restart of this board");
  assert.equal(h.requests.at(-1).message.action, "restart");
  h.requests.at(-1).resolve({ result: "ok", state: active(4) });
  await settle();
  assert.equal(h.slide.householdHop.position.pos, 0);
});

test("Leave for later records the handoff before closing the activity", async () => {
  const h = harness(active(2, "b"));
  await h.open();
  const leave = h.slide.activity.leave();
  assert.equal(leave.aria, "Leave for later");
  leave.act();
  assert.equal(h.requests.at(-1).message.action, "handoff");
  assert.ok(h.slide.activity);
  h.requests.at(-1).resolve({ result: "ok", state: active(3, "b", true) });
  await settle();
  assert.equal(h.slide.activity, null);
});
