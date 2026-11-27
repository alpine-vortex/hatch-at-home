const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../../src/card/card-shore-crab.js"), "utf8");

function fixture() {
  let now = 100;
  const context = {
    HatchPetCardOuting: class {},
    calm: () => true,
    serverNow: () => 1000 * now,
  };
  const Card = vm.runInNewContext(`${source}\nHatchPetCardShoreCrab`, context);
  const card = new Card();
  const offer = { id: "visit", starts_at: 100, expires_at: 200 };
  const slide = { worldKey: "tidepool", house: { gameplay: { pet_ref: "pet", shore_crab: offer } } };
  card._activityReady = () => true;
  card._patOn = () => true;
  card._activityOpen = (_, options) => (slide.activity = options, true);
  card._activityUpdate = () => true;
  card._stop = () => {};
  return { card, slide, offer, setNow: value => { now = value; } };
}

test("only an eligible Tidepool pet can open during the offer interval", () => {
  const { card, slide, offer, setNow } = fixture();
  setNow(99);
  assert.equal(card._shoreCrabOpen(slide, null), false);
  setNow(100);
  assert.equal(card._shoreCrabOffer(slide), offer);
  slide.worldKey = "pond";
  assert.equal(card._shoreCrabOpen(slide, null), false);
  slide.worldKey = "tidepool";
  card._activityReady = () => false;
  assert.equal(card._shoreCrabOpen(slide, null), false);
  card._activityReady = () => true;
  setNow(200);
  assert.equal(card._shoreCrabOpen(slide, null), false);
});

test("the entrance side controls each route, and an open board survives expiry", () => {
  const { card, slide, setNow } = fixture();
  assert.equal(card._shoreCrabOpen(slide, null), true);
  const press = i => slide.activity.buttons()[i].act();
  setNow(200);
  press(4);
  assert.match(slide.activity.text(), /taps the left shell/);
  press(0);
  press(4);
  assert.match(slide.activity.text(), /found shade/);
  press(1);
  press(4);
  assert.match(slide.activity.text(), /dips its claws/);
  press(3);
  press(4);
  assert.match(slide.activity.text(), /taps the right shell/);
  press(1);
  press(4);
  assert.match(slide.activity.text(), /found shade/);
});
