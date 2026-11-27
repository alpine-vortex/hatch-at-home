const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../../src/card/card-tasting.js"), "utf8");
const token = "c".repeat(32);

function fixture(storage = new Map()) {
  let next = 0;
  const Card = vm.runInNewContext(`${source}\nHatchPetCardTasting`, {
    HatchPetCardHouseholdHop: class {},
    sessionStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    crypto: { getRandomValues: (array) => array.fill(++next) },
    performance: { now: () => 0 },
    REFUSALS: { full: "I'm full!" },
  });
  const card = new Card();
  const s = {
    worldKey: "hearth", speciesId: "corgi", drawn: "adult",
    ids: { "sensor.life_stage": "sensor.pip_life_stage" },
    house: { gameplay: { pet_ref: "x", tasting: { version: 1, preferred: null } } },
  };
  const requests = [];
  const timeline = new Map();
  const phases = [];
  card._hass = {
    user: { id: "test" },
    callWS: (request) => new Promise((resolve, reject) => requests.push({ request, resolve, reject })),
  };
  card._slides = [s];
  card._index = 0;
  card._activityOpen = (_, options) => {
    s.activity = { ...options, panel: { classList: { add() {} } } };
    return true;
  };
  card._activityUpdate = () => phases.push(s.tasting.phase);
  card._activityClose = (_, reason) => {
    s.activity?.close(reason);
    s.activity = null;
  };
  card._later = (_, ms, fn, { key }) => timeline.set(key, fn);
  card._stop = (_, { key }) => timeline.delete(key);
  const open = () => card._tastingOpen(s, null);
  const select = (index) => s.activity.buttons()[index].act();
  const serve = () => card._tastingServe(s, s.tasting);
  const close = () => card._activityClose(s, "calling");
  const reply = (index, details, overrides = {}) => {
    const { request, resolve } = requests[index];
    resolve({ serve_id: request.serve_id, recipe: request.recipe, ...details, ...overrides });
  };
  return { card, s, timeline, requests, phases, open, select, serve, close, reply };
}

test("retry after disconnect reuses the issued token and Make again creates the next intent", async () => {
  const storage = new Map();
  const f = fixture(storage);
  assert.equal(f.open(), true);
  assert.equal(f.s.activity.buttons()[2].disabled, true);
  f.select(1);
  assert.equal(f.s.activity.text(), "Pumpkin biscuit");
  const first = f.serve();
  f.reply(0, { result: "ready", token });
  await new Promise(setImmediate);
  const original = f.requests[1].request;
  f.requests[1].reject(new Error("network interrupted"));
  await first;
  assert.equal(f.s.tasting.phase, "uncertain");
  assert.equal(f.s.activity.text(), "No reply yet. Retry serving.");
  f.close();
  f.card._tastingAttempts = null; // browser storage carries the intent across a rebuild
  assert.equal(f.open(), true);
  const retry = f.serve();
  assert.deepEqual(f.requests[2].request, original);
  f.reply(2, { result: "ok", preferred: true });
  await retry;
  f.timeline.get("tasting.beat")();
  assert.equal(f.s.tasting.phase, "bite");
  f.timeline.get("tasting.beat")();
  assert.equal(f.s.tasting.phase, "result");
  assert.match(f.s.activity.text(), /favourite/i);
  assert.equal(storage.size, 0);
  f.select(2);
  assert.equal(f.s.tasting.recipe, "pumpkin");
  assert.equal(f.requests.length, 3);
  const deliberate = f.serve();
  assert.notEqual(f.requests[3].request.serve_id, original.serve_id);
  f.reply(3, { result: "full" });
  await deliberate;
  assert.equal(f.s.activity.text(), "I'm full!");
});

test("a mismatched typed reply cannot finish the recipe", async () => {
  const f = fixture();
  f.open();
  f.select(0);
  const pending = f.serve();
  f.reply(0, { result: "ready", token });
  await new Promise(setImmediate);
  assert.equal(f.s.tasting.phase, "serving");
  f.reply(1, { result: "ok" }, { serve_id: "other" });
  await pending;
  assert.equal(f.s.tasting.phase, "uncertain");
  assert.deepEqual(f.phases, ["prepare", "serving", "uncertain"]);
  assert.equal(f.timeline.size, 0);
});

test("a call closes the scene and a late successful serve leaves live controls alone", async () => {
  const f = fixture();
  f.open();
  f.select(0);
  const pending = f.serve();
  f.reply(0, { result: "ready", token });
  await new Promise(setImmediate);
  f.close();
  f.reply(1, { result: "spoiled", preferred: true });
  await pending;
  assert.equal(f.s.tasting, null);
  assert.equal(f.s.activity, null);
  assert.deepEqual(f.phases, ["prepare", "serving"]);
  assert.equal(f.timeline.size, 0);
  f.open();
  assert.equal(f.s.tasting.phase, "prepare");
});

test("the first valid reply after a timeout settles the active retry once", async () => {
  const f = fixture();
  f.open();
  f.select(0);
  const original = f.serve();
  f.reply(0, { result: "ready", token });
  await new Promise(setImmediate);
  f.timeline.get("tasting.response")();
  const retry = f.serve();
  assert.deepEqual(f.requests[1].request, f.requests[2].request);
  f.reply(1, { result: "ok" });
  await original;
  f.requests[2].reject(new Error("connection interrupted"));
  await retry;
  f.timeline.get("tasting.beat")();
  assert.equal(f.s.tasting.phase, "bite");
  f.timeline.get("tasting.beat")();
  assert.equal(f.s.tasting.phase, "result");
});
