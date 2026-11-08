// The private channel's first word (card-base.js _subscribe): a subscribe that is neither
// answered nor refused (a send lost on a closing socket) is asked once more when the wait
// runs out. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");

const src = require("./card-source");
const { adapters } = require("./timer_trace");
const grab = (re) => {
  const m = src.match(re);
  assert.ok(m, `not in the card: ${re}`);
  return m[0];
};
const method = (name) => grab(new RegExp(`\\n  ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`)).trim();

// The card's real ledger adapters (_later, _stop, _has) over the real director on a fake clock: `timers`
// holds what was scheduled ({ fn, ms, live }), `fire(timers)` drives the wait through the director.
function load() {
  const timers = [];
  const ctx = {
    localStorage: { getItem: () => null },
    ledger: adapters((ms, fn) => {
      const t = { fn, ms, live: true };
      timers.push(t);
      return () => { t.live = false; };
    }),
  };
  vm.runInNewContext([
    grab(/\nconst SHARED_KEY = [^\n]*\n/),
    grab(/\nfunction sharedScreen\(\) \{[\s\S]*?\n\}\n/),
    grab(/\nconst SUBSCRIBE_RETRY_MS = [^\n]*\n/),
    grab(/\nconst SUBSCRIBE_RETRY_LAST_MS = [^\n]*\n/),
    grab(/\nconst SUBSCRIBE_WAIT_MS = [^\n]*\n/),
    `function makeCard(asks) {
      const card = {
        isConnected: true,
        _hass: { user: { id: "u" }, connection: { subscribeMessage: (cb, msg) => { asks.push({ cb, msg }); return new Promise(() => {}); } } },
        _slides: [],
        ...ledger,
        ${method("_subscribe")},
        ${method("_unsubscribe")},
      };
      return card;
    }`,
    "this.out = { makeCard, SUBSCRIBE_WAIT_MS };",
  ].join("\n"), ctx);
  return { ...ctx.out, timers };
}
const slide = () => ({ ids: { "sensor.life_stage": "sensor.p_life_stage" } });
const fire = (timers) => {
  const t = timers.filter((x) => x.live && x.ms === 3000).pop();
  assert.ok(t, "the wait timer is set");
  t.live = false;
  t.fn();
};

test("silence for the whole wait asks once more, and only once", () => {
  const { makeCard, timers } = load();
  const asks = [];
  const card = makeCard(asks);
  const s = slide();
  card._slides.push(s);
  card._subscribe(s);
  assert.equal(asks.length, 1);
  fire(timers);
  assert.equal(s.subscribeFailed, true, "the first look stops waiting");
  assert.equal(asks.length, 2, "asked again");
  assert.equal(timers.filter((x) => x.live && x.ms === 3000).length, 0, "no second wait timer: once only");
  assert.equal(card._has(s, { key: "sub.wait" }), false, "and none on the ledger");
});

test("a slide that has heard from the channel is not asked again", () => {
  const { makeCard, timers } = load();
  const asks = [];
  const card = makeCard(asks);
  const s = slide();
  card._slides.push(s);
  card._subscribe(s);
  s.subscribed = true;
  fire(timers);
  assert.equal(asks.length, 1);
  assert.notEqual(s.subscribeFailed, true);
});

test("a refused ask keeps its own retry: the wait does not add a second ask", () => {
  const { makeCard, timers } = load();
  const asks = [];
  const card = makeCard(asks);
  const s = slide();
  card._slides.push(s);
  card._subscribe(s);
  card._later(s, 2000, () => {}, { key: "sub.retry" }); // what the catch sets
  fire(timers);
  assert.equal(asks.length, 1);
});

test("a slide that is gone, or no longer on the card, is not asked again", () => {
  for (const undo of [(c, s) => { s.gone = true; }, (c, s) => { c._slides.length = 0; }, (c, s) => { s.subKey = null; }]) {
    const { makeCard, timers } = load();
    const asks = [];
    const card = makeCard(asks);
    const s = slide();
    card._slides.push(s);
    card._subscribe(s);
    undo(card, s);
    fire(timers);
    assert.equal(asks.length, 1);
  }
});
