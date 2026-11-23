// Exercise the joined card with a clock and a stubbed Home Assistant transport.
const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const source = require("./card-source");

const flush = () => new Promise((resolve) => setImmediate(resolve));
const until = Date.parse("2026-11-25T08:00:00Z") / 1000;
const greeting = "HAPPY BIRTHDAY, BEE!!! 🎂";

async function fixture(initial = "2026-11-24T17:00:00Z") {
  let now = Date.parse(initial);
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const elements = new Map();
  const storage = new Map();
  const customElements = {
    whenDefined: () => Promise.resolve(),
    get: (key) => elements.get(key),
    define: (key, value) => elements.set(key, value),
  };
  const document = { hidden: false };
  vm.runInNewContext(source, {
    customElements, window: { customElements }, document, HTMLElement: class {},
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    Date: Clock, console: { info() {} },
  });
  await flush();

  const card = Object.create(elements.get("hatch-pet-card").prototype);
  const mine = { birthday_in: 0, birthday_year: "2026", birthday_until: until, birthday_due: true, call_me: "Bee" };
  const slide = {
    ids: { device: "p", "sensor.life_stage": "sensor.test" }, species: {}, subscribed: true,
    screen: { classList: { contains: () => false } }, mine,
    queue: [],
  };
  const calls = [];
  const visible = [];
  const frames = [];
  card.isConnected = true;
  card._director = { frame: (_s, callback) => frames.push(callback) };
  card._hass = { user: { id: "u", name: "Bee" } };
  card._slides = [slide];
  card._index = 0;
  card._visible = true;
  card._owned = () => false;
  card._questionOn = () => false;
  card._sitterBusy = () => false;
  card._sparkle = () => {};
  card._chirp = () => {};
  card._animate = () => {};
  card._state = () => null;
  card._speak = (s, text, ms, opts) => {
    visible.push({ text, immediate: opts.immediate });
    s.sayUntil = now + ms;
  };
  card._hass.callWS = async (msg) => {
    calls.push(msg);
    if (msg.shown) {
      assert.equal(visible.at(-1)?.text, greeting);
      return { acknowledged: true };
    }
    return { ...mine, note: { kind: "your_birthday" }, token: "test-token", valid_for: 12 };
  };
  return { card, slide, calls, visible, document, storage, frames,
    advance: (ms) => { now += ms; }, paint: () => frames.shift()?.() };
}

test("a private birthday line displays ahead of ordinary speech and is then acknowledged", async () => {
  const { card, slide, calls, visible, paint } = await fixture();
  card._queue(slide, "ordinary update");
  assert.equal(card._birthdayFirst(slide), true);
  card._sayQueued(slide, true);
  assert.equal(visible.length, 0);
  await flush();
  assert.deepEqual(visible, [{ text: greeting, immediate: true }]);
  assert.equal(calls.length, 1);
  paint();
  assert.equal(calls.length, 1);
  paint();
  assert.equal(calls[1].shown, "test-token");
  assert.equal(slide.queue[0].text, "ordinary update");
});

test("a failed channel can discover birthday delivery without cached preferences", async () => {
  const { card, slide, paint, visible } = await fixture();
  slide.subscribed = false;
  slide.subscribeFailed = true;
  slide.mine = null;
  slide.birthdayRetry = null;
  assert.equal(card._birthdayFirst(slide), true);
  await flush();
  paint();
  paint();
  assert.equal(visible[0].text, greeting);
});

test("a hidden, busy or shared screen may not display and acknowledge a reserved greeting", async () => {
  for (const hide of [
    ({ document }) => { document.hidden = true; },
    ({ slide }) => { slide.scene = {}; },
    ({ storage }) => storage.set("hatch-shared-screen", "on"),
    ({ card }) => { card.isConnected = false; },
  ]) {
    const f = await fixture();
    assert.equal(f.card._birthdayFirst(f.slide), true);
    hide(f);
    await flush();
    assert.equal(f.visible.length, 0);
    assert.equal(f.calls.length, 1);
  }
});

test("a card removed between rendering and paint never acknowledges the greeting", async () => {
  const { card, slide, visible, paint, calls } = await fixture();
  card._birthdayFirst(slide);
  await flush();
  assert.equal(visible.length, 1);
  paint();
  card.isConnected = false;
  paint();
  assert.equal(calls.length, 1);
});

test("a competing lease keeps ordinary speech behind the due line through retry", async () => {
  const { card, slide, advance, paint, visible } = await fixture();
  const accept = card._hass.callWS;
  card._hass.callWS = async () => ({ ...slide.mine, retry_after: 10 });
  assert.equal(card._birthdayFirst(slide), true);
  await flush();
  advance(5000);
  assert.equal(card._birthdayFirst(slide), true);
  assert.equal(visible.length, 0);
  advance(5001);
  card._hass.callWS = accept;
  assert.equal(card._birthdayFirst(slide), true);
  await flush();
  paint();
  paint();
  assert.equal(visible[0].text, greeting);
});

test("live wake speech and a power-on gag both wait for the birthday", async () => {
  const { card, slide, paint, visible } = await fixture();
  slide.powerPending = "2026-11-24T17:00:00Z";
  card._eggMinutes = () => null;
  card._wakeLine = () => "ordinary wake";
  let gags = 0;
  card._powerGag = () => { gags++; };
  card._moment(slide, { type: "woke_up", how: "morning" });
  assert.equal(visible.length, 0);
  assert.equal(slide.queue[0].text, "ordinary wake");
  assert.equal(card._birthdayFirst(slide), true);
  card._powerTick(slide, true);
  assert.equal(gags, 0);
  await flush();
  paint();
  paint();
  card._powerTick(slide);
  assert.equal(gags, 0);
  assert.equal(visible[0].text, greeting);
});

test("a new server day expires an old queued countdown and accepts the birthday", async () => {
  const { card, slide, calls, visible, advance, paint } = await fixture("2026-11-24T07:59:59Z");
  slide.mine = { ...slide.mine, birthday_in: 1, birthday_until: until - 86400 };
  card._note(slide, { kind: "birthday_soon", days: 1 });
  const before = slide.queue[0];
  assert.equal(before.still(), true);
  advance(1001);
  assert.equal(before.still(), false);
  assert.equal(card._birthdayFirst(slide), true);
  await flush();
  assert.deepEqual(visible.map(({text}) => text), [greeting]);
  paint();
  paint();
  assert.equal(calls.length, 2);
});

test("a collected birthday gift can reveal the find after midnight without birthday wording", async () => {
  const { card, slide, visible, advance } = await fixture("2026-11-25T07:59:59Z");
  slide.mine.birthday_due = false;
  slide.mine.birthday_gift = true;
  slide.mine.gift = { id: "flowercrown", world: "woodland" };
  card._worlds = { woodland: { finds: [{ id: "flowercrown" }] } };
  card._hass.callWS = async () => ({ gift: slide.mine.gift });
  card._giftLine = () => "for you";
  let confetti = 0;
  card._confetti = () => { confetti++; };
  card._giftPop = () => {};
  await card._giftTake(slide);
  assert.equal(slide.queue.length, 2);
  advance(1001);
  card._sayQueued(slide);
  assert.deepEqual(visible.map(({text}) => text), ["for you"]);
  assert.equal(confetti, 0);
});

test("an already-open card takes a late birthday gift once its greeting is done", async () => {
  const { card, slide } = await fixture();
  slide.lookedFirst = true;
  slide.mine.gift = { id: "flowercrown", world: "woodland" };
  let requests = 0;
  card._giftTake = (s) => { requests++; s.gifting = true; };
  assert.equal(card._birthdayGiftTick(slide), false);
  slide.mine.birthday_gift = true;
  assert.equal(card._birthdayGiftTick(slide), false);
  slide.mine.birthday_due = false;
  assert.equal(card._giftDue(slide), false);
  assert.equal(card._birthdayGiftTick(slide), true);
  assert.equal(card._birthdayGiftTick(slide), true);
  assert.equal(requests, 1);
});

test("a saved present resumes and acknowledges only the visible unwrapped art", async () => {
  const { card, slide, calls, paint, advance } = await fixture();
  slide.mine.birthday_due = false;
  slide.mine.birthday_reveal = { id: "flowercrown", world: "woodland", token: "reveal-token" };
  card._worlds = { woodland: { finds: [{ id: "flowercrown" }] } };
  card._giftLine = () => "you found a crown";
  card._confetti = () => {};
  card._has = () => false;
  card._giftPop = (s, _gift, wrapped) => {
    s.giftPop = { el: { firstChild: { complete: false, naturalWidth: 0 } }, wrapped };
  };
  card._hass.callWS = async (message) => { calls.push(message); return { acknowledged: true }; };
  card._birthdayGiftTick(slide);
  assert.equal(slide.queue.length, 2);
  card._sayQueued(slide);
  assert.equal(slide.giftPop.wrapped, true);
  card._birthdayGiftTick(slide);
  assert.equal(calls.length, 0);

  advance(3001);
  card._sayQueued(slide);
  assert.equal(slide.giftPop.presentToken, "reveal-token");
  card._birthdayGiftTick(slide);
  assert.equal(calls.length, 0);
  Object.assign(slide.giftPop.el.firstChild, { complete: true, naturalWidth: 64 });
  card._birthdayGiftTick(slide);
  paint();
  assert.equal(calls.length, 0);
  paint();
  assert.equal(calls[0].present_shown, "reveal-token");
  assert.equal(calls[0].shared, false);
});
