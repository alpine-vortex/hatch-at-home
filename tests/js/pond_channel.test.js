const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../../src/card/card-pond-channel.js"), "utf8");

const replyDelivered = () => new Promise(setImmediate);

const harness = () => {
  let time = 0;
  const timers = new Map();
  const requests = [];
  const Card = vm.runInNewContext(`class HatchPetCardFetch {}\n${source}\nHatchPetCardPondChannel`, {
    performance: { now: () => time },
  });
  const card = new Card();
  card._activityOpen = (s, args) => { s.activity = args; return true; };
  card._activityUpdate = () => {};
  card._activityFocus = () => {};
  card._activityClose = (s, reason) => { s.activity.close(reason); s.activity = null; };
  card._later = (s, delay, fn, { key }) => timers.set(key, { at: time + delay, fn });
  card._stop = (s, { key }) => timers.delete(key);
  card._hass = { callWS: (msg) => new Promise((resolve, reject) => requests.push({ msg, resolve, reject })) };
  const slide = { worldKey: "pond", house: { gameplay: { pond_channel: true, pet_ref: "pet:1" } },
    ids: { "sensor.life_stage": "sensor.pip_life_stage" } };
  const open = () => card._pondChannel(slide);
  const layout = () => slide.pondChannel.round.layout;
  const phase = () => slide.pondChannel.round.phase;
  const controls = () => Array.from(slide.activity.buttons());
  const press = (id) => {
    const button = controls().find((control) => control.id === id);
    assert.ok(button && !button.disabled, `expected an active ${id} button`);
    button.act();
  };
  const advance = (ms, runTimers = true) => {
    time += ms;
    if (runTimers) {
      for (const [key, timer] of timers) {
        if (timer.at > time) continue;
        timers.delete(key);
        timer.fn();
      }
    }
  };
  return { card, slide, requests, open, layout, phase, controls, press, advance };
};

test("Pond Channel pins the wet layout and lets the player recover from the eddy", async () => {
  const h = harness();
  assert.ok(h.open());
  assert.deepEqual(h.controls(), []);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].msg.type, "virtual_pet/pond_channel");
  assert.equal(h.requests[0].msg.pet_ref, "pet:1");
  h.requests[0].resolve({ layout: "wet" });
  await replyDelivered();
  assert.equal(h.layout(), "wet");
  assert.deepEqual(h.controls().map(({ id }) => id), ["left", "right", "release"]);
  assert.equal(h.controls().find(({ id }) => id === "release").disabled, true);
  h.press("right");
  assert.equal(h.controls().find(({ id }) => id === "right").selected, true);
  h.press("release");
  assert.equal(h.phase(), "eddy");
  assert.match(h.slide.activity.text(), /in the eddy/);
  h.slide.house = { gameplay: h.slide.house.gameplay, device_fx: { current: { rain: false } } };
  h.press("reset");
  h.press("left");
  h.press("release");
  h.press("bring");
  assert.equal(h.phase(), "done");
  assert.match(h.slide.activity.text(), /brings you the seed pod/);
  assert.equal(h.layout(), "wet");
  h.press("again");
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve({ layout: "dry" });
  await replyDelivered();
  assert.equal(h.layout(), "dry");
});

test("Pond Channel handles an out-of-order dry step and still finishes when disconnected", async () => {
  const h = harness();
  assert.ok(h.open());
  h.requests[0].reject(new Error("disconnected"));
  await replyDelivered();
  assert.equal(h.layout(), "dry");
  assert.deepEqual(h.controls().map(({ id }) => id), ["near", "far"]);
  h.press("far");
  assert.match(h.slide.activity.text(), /too far/i);
  assert.equal(h.slide.pondChannel.round.stone, 0);
  h.press("near");
  assert.equal(h.slide.pondChannel.round.stone, 1);
  h.press("far");
  assert.equal(h.slide.pondChannel.round.stone, 2);
  h.press("bring");
  assert.equal(h.phase(), "done");
});

test("late replies cannot repaint a timed-out or care-interrupted round", async () => {
  const h = harness();
  assert.ok(h.open());
  h.advance(1999);
  assert.equal(h.layout(), undefined);
  h.advance(1);
  assert.equal(h.layout(), "dry");
  h.requests[0].resolve({ layout: "wet" });
  await replyDelivered();
  assert.equal(h.layout(), "dry");

  h.card._activityClose(h.slide, "calling");
  assert.ok(h.open());
  h.card._activityClose(h.slide, "calling");
  assert.ok(h.open());
  h.requests[1].resolve({ layout: "wet" });
  await replyDelivered();
  assert.equal(h.layout(), undefined);
  h.advance(2500, false); // the reply is delivered before a throttled timer fires
  h.requests[2].resolve({ layout: "wet" });
  await replyDelivered();
  assert.equal(h.layout(), "dry");
});

test("a different incarnation or explicit authorization refusal closes the activity", async () => {
  const h = harness();
  assert.ok(h.open());
  h.slide.house.gameplay.pet_ref = "pet:2";
  h.requests[0].resolve({ layout: "wet" });
  await replyDelivered();
  assert.equal(h.slide.activity, null);
  assert.ok(h.open());
  h.requests[1].reject({ code: "forbidden" });
  await replyDelivered();
  assert.equal(h.slide.activity, null);
});
