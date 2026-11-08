// Director migration slice 13, the ledger half (docs/plan-2026-11-06-director-migration.md 5.13, 6.1.3a, G9): the
// channel waits, the memory idle and the confirm lapse are entries on the slide's ledger (keys sub.wait, sub.retry,
// memory.idle, confirm). The trace (waits_trace.test.js) pins what the player sees; this pins what the ledger holds:
// who stops each entry, what _forget drains, what a disconnect keeps, and that nothing is left after the longest
// due time. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");
const src = require("./card-source");
const { world } = require("./timer_trace");

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const play = async (w, ms) => { await flush(); for (let left = ms; left > 0; left -= 10) { w.advance(Math.min(10, left)); await flush(); } };
const plain = (v) => JSON.parse(JSON.stringify(v)); // out of the vm's realm
const keys = (w) => plain((w.director.inspect(w.slide)?.timers || []).map((t) => t.key).sort());

function make(reply = "silence") {
  const w = world({
    methods: ["_subscribe", "_unsubscribe", "_channel", "_forget", "_memoryTouch", "_memoryPageClose", "_memoryForget",
      "_memoryItemKey", "_confirmed"],
    consts: ["SUBSCRIBE_WAIT_MS", "SUBSCRIBE_RETRY_LAST_MS", "MEDIA_MOMENTS", "MEMORY_IDLE_MS", "CONFIRM_MS", "CONFIRM_GAP_MS"],
    watch: ["_memoryRedraw"],
    globals: { MEMORY_PAGE: { forget_sure: "sure?", forget_pattern_sure: "sure?" }, CONFIRM_ARIA: { a: "a" } },
    fields: { isConnected: true },
    slide: () => ({ ids: { "sensor.life_stage": "sensor.p_life_stage" }, memoryPage: "open", memoryEpoch: 1 }),
  });
  vm.runInContext("var SUBSCRIBE_RETRY_MS = [2000, 5000, 15000];", w.sandbox);
  vm.runInContext(src.match(/\nfunction confirmTap\([\s\S]*?\n\}\n/)[0], w.sandbox);
  w.asks = [];
  w.card._hass = {
    user: { id: "u" },
    connection: {
      subscribeMessage: (cb) => {
        w.asks.push({ t: w.now, cb });
        return reply === "refuse" ? Promise.reject({ code: "no_pet" }) : new Promise(() => {});
      },
    },
  };
  w.button = () => ({ textContent: "", setAttribute() {}, classList: { contains: () => false, add() {} } });
  w.redraws = () => w.calls.filter((c) => c.name === "_memoryRedraw").length;
  return w;
}
const ROW = { key: { list: "item", kind: "k" } };

test("the keys: the wait is sub.wait, the refused ask's retry sub.retry, the idle memory.idle, the lapse confirm", async () => {
  const w = make("refuse");
  w.card._subscribe(w.slide);
  await play(w, 10);
  assert.deepStrictEqual(keys(w), ["sub.retry", "sub.wait"]);
  w.card._memoryTouch(w.slide);
  w.card._memoryForget(w.slide, ROW, w.button());
  assert.deepStrictEqual(keys(w), ["confirm", "memory.idle", "sub.retry", "sub.wait"]);
  assert.deepStrictEqual(plain(w.director.inspect(w.slide).timers.map((t) => [t.key, t.ms]).sort()),
    [["confirm", 4050], ["memory.idle", 120000], ["sub.retry", 2000], ["sub.wait", 3000]]);
});

test("the first full snapshot stops sub.wait (a part does not)", async () => {
  const w = make();
  w.card._subscribe(w.slide);
  await play(w, 1000);
  w.asks[0].cb({ mine: null });
  assert.deepStrictEqual(keys(w), ["sub.wait"]);
  w.asks[0].cb({ moments: [] });
  assert.deepStrictEqual(keys(w), []);
  await play(w, 5000);
  assert.deepStrictEqual([w.slide.subscribeFailed, w.asks.length], [false, 1]);
});

test("_unsubscribe: (all) stops both keys; (not all) stops the retry only", async () => {
  const w = make("refuse");
  w.card._subscribe(w.slide);
  await play(w, 10);
  w.card._unsubscribe(w.slide, false);
  assert.deepStrictEqual(keys(w), ["sub.wait"]);
  w.card._unsubscribe(w.slide);
  assert.deepStrictEqual(keys(w), []);
});

test("_forget drains the four keys (and the manual confirmTimer clear is gone)", async () => {
  const w = make("refuse");
  w.card._subscribe(w.slide);
  await play(w, 10);
  w.card._memoryTouch(w.slide);
  w.card._memoryForget(w.slide, ROW, w.button());
  assert.strictEqual(keys(w).length, 4);
  w.card._forget(w.slide);
  assert.deepStrictEqual(keys(w), []);
  assert.strictEqual(w.director.pending(w.slide), 0);
  assert.ok(!/confirmTimer/.test(src), "no field is named confirmTimer in the card any more");
  await play(w, 130000);
  assert.deepStrictEqual([w.redraws(), w.asks.length], [0, 1]);
});

test("the leak check: after the longest due time (120 s, memory.idle) the slide's ledger is empty", async () => {
  const w = make();
  w.card._memoryTouch(w.slide);
  w.card._memoryForget(w.slide, ROW, w.button());
  w.card._subscribe(w.slide);
  await play(w, 120000);
  assert.strictEqual(w.slide.memoryPage, false, "the idle closed the page");
  w.asks[0].cb({ moments: [] });
  assert.deepStrictEqual(keys(w), []);
  assert.strictEqual(w.director.pending(w.slide), 0);
});

test("disconnect keeps the confirm (R56 redraws a detached slide), stops memory.idle and the retry; reconnect asks again", async () => {
  const w = make("refuse");
  w.card._subscribe(w.slide);
  await play(w, 10);
  w.card._memoryTouch(w.slide);
  w.card._confirmed(w.slide, "a", w.button(), () => w.redrawn = w.now);
  w.disconnect();
  assert.deepStrictEqual(keys(w), ["confirm"], "wait, retry and idle are closed by their closers; the lapse is kept");
  await play(w, 5000);
  assert.strictEqual(w.redrawn, 4050 + 10, "the settings lapse fired on the detached slide");
  w.reconnect();
  assert.strictEqual(w.asks.length, 2, "asked again on return");
});

test("R39 and R56 share the key: one confirm at a time", async () => {
  const w = make();
  w.card._memoryForget(w.slide, ROW, w.button());
  w.card._confirmed(w.slide, "a", w.button(), () => {});
  assert.deepStrictEqual(keys(w), ["confirm"]);
  assert.strictEqual(w.director.inspect(w.slide).timers[0].ms, 4050);
});

test("the memory page's close stops memory.idle, and a tap restarts it as one entry", async () => {
  const w = make();
  w.card._memoryTouch(w.slide);
  await play(w, 1000);
  w.card._memoryTouch(w.slide);
  assert.deepStrictEqual(keys(w), ["memory.idle"]);
  w.card._memoryPageClose(w.slide, false);
  assert.deepStrictEqual(keys(w), []);
});
