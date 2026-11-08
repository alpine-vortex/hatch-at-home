// Director migration slice 13 (channel waits, memory page, confirm lapse), the characterization half
// (docs/plan-2026-11-06-director-migration.md 5.13): the subscribe wait (R8) and retry (R9), the memory
// idle (R38), the two "sure?" lapses (R39, R56), on the fake clock with the card's own methods. It passes
// before the move (bare timers in s.waitTimer, s.retryTimer, s.memoryIdle, s.confirmTimer) and after (the
// ledger, keys sub.wait, sub.retry, memory.idle, confirm). The last block is a characterization only of the
// sheets' call waits (R51-R55) that do NOT move: it pins what the code does today, whatever the plan guessed.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const src = require("./card-source");
const { world } = require("./timer_trace");

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
// Advances in 10 ms steps, letting promises settle between steps (a refused ask's catch arms the retry).
const play = async (w, ms) => { await flush(); for (let left = ms; left > 0; left -= 10) { w.advance(Math.min(10, left)); await flush(); } };
const plain = (v) => JSON.parse(JSON.stringify(v));
const grabFn = (name) => src.match(new RegExp(`\\nfunction ${name}\\([\\s\\S]*?\\n\\}\\n`))[0];

// ---------------------------------------------------------------- the channel (R8, R9)
const CHANNEL = {
  methods: ["_subscribe", "_unsubscribe", "_channel", "_channelHeard", "_forget"],
  consts: ["SUBSCRIBE_WAIT_MS", "SUBSCRIBE_RETRY_LAST_MS", "MEDIA_MOMENTS"],
  watch: ["_redraw", "_memoryPageClose"],
};
// `reply`: "silence" (an ask never answered), "refuse" (every ask refused), "ok" (answered with an unsub).
function channel(reply = "silence") {
  const w = world({ ...CHANNEL, fields: { isConnected: true }, slide: () => ({ ids: { "sensor.life_stage": "sensor.p_life_stage" } }) });
  w.sandbox.SUBSCRIBE_RETRY_MS = undefined;
  require("vm").runInContext("var SUBSCRIBE_RETRY_MS = [2000, 5000, 15000];", w.sandbox);
  w.asks = [];
  w.unsubbed = 0;
  w.card._hass = {
    user: { id: "u" },
    connection: {
      subscribeMessage: (cb, msg) => {
        w.asks.push({ t: w.now, cb, msg });
        if (reply === "refuse") return Promise.reject({ code: "no_pet" });
        if (reply === "ok") return Promise.resolve(() => { w.unsubbed++; });
        return new Promise(() => {});
      },
    },
  };
  w.times = () => w.asks.map((a) => a.t);
  return w;
}

test("R8: the wait runs out at 3000 on silence: subscribeFailed, and one more ask", async () => {
  const w = channel();
  w.card._subscribe(w.slide);
  await play(w, 2990);
  assert.deepStrictEqual([w.slide.subscribeFailed, w.times()], [undefined, [0]]);
  await play(w, 10);
  assert.deepStrictEqual([w.slide.subscribeFailed, w.times()], [true, [0, 3000]]);
  await play(w, 200000);
  assert.deepStrictEqual(w.times(), [0, 3000], "once only: no second wait, no retry");
});

test("R8: a first full snapshot through _channel at 1 s stops the wait: advance 3 s, subscribeFailed false, one ask", async () => {
  const w = channel("ok");
  w.card._subscribe(w.slide);
  await play(w, 1000);
  w.asks[0].cb({ moments: [] });
  assert.strictEqual(w.slide.subscribed, true);
  await play(w, 3000);
  assert.deepStrictEqual([w.slide.subscribeFailed, w.times()], [false, [0]]);
  await play(w, 200000);
  assert.deepStrictEqual([w.slide.subscribeFailed, w.times()], [false, [0]]);
});

test("R8: a snapshot that is not the whole view (a part) leaves the wait standing", async () => {
  const w = channel("ok");
  w.card._subscribe(w.slide);
  await play(w, 1000);
  w.asks[0].cb({ mine: null });
  await play(w, 2000);
  assert.deepStrictEqual([w.slide.subscribeFailed, w.times()], [true, [0, 3000]]);
});

test("R9: a refused ask retries at 2000, 5000, 15000, then every 60000", async () => {
  const w = channel("refuse");
  w.card._subscribe(w.slide);
  await play(w, 150000);
  assert.deepStrictEqual(w.times(), [0, 2000, 7000, 22000, 82000, 142000]);
  assert.strictEqual(w.slide.subscribeFailed, true);
  assert.strictEqual(w.slide.retries, 6);
});

test("R8 + R9: with a retry pending when the wait runs out, the wait does not add an ask", async () => {
  const w = channel("refuse");
  w.card._subscribe(w.slide);
  await play(w, 3500);
  assert.deepStrictEqual(w.times(), [0, 2000]);
});

test("_unsubscribe (all) stops the wait", async () => {
  const w = channel();
  w.card._subscribe(w.slide);
  await play(w, 1000);
  w.card._unsubscribe(w.slide);
  await play(w, 10000);
  assert.deepStrictEqual([w.slide.subscribeFailed, w.times()], [undefined, [0]]);
});

test("_unsubscribe (not all) stops the retry and leaves the wait", async () => {
  const w = channel("silence");
  w.card._subscribe(w.slide);
  await play(w, 1000);
  w.card._unsubscribe(w.slide, false);
  await play(w, 2500); // the wait at 3000 still runs: silence is not an error
  assert.deepStrictEqual(w.times(), [0, 3000]);
  const r = channel("refuse");
  r.card._subscribe(r.slide);
  await play(r, 500);
  r.card._unsubscribe(r.slide);
  await play(r, 100000);
  assert.deepStrictEqual(r.times(), [0], "the retry at 2000 is stopped");
});

test("a stale subGen ignores the retry (and the wait still asks once at 3000)", async () => {
  const w = channel("refuse");
  w.card._subscribe(w.slide);
  await play(w, 1000);
  w.slide.subGen++; // moved on by another ask's generation, not through _unsubscribe
  await play(w, 1500);
  assert.deepStrictEqual(w.times(), [0], "the retry at 2000 finds the generation stale and asks nothing");
  await play(w, 1000);
  assert.deepStrictEqual(w.times(), [0, 3000], "the wait at 3000 sees no retry pending and asks");
});

test("disconnect with a retry pending stops it; reconnect asks again and the retry count restarts", async () => {
  const w = channel("refuse");
  w.card._subscribe(w.slide);
  await play(w, 3000);
  assert.deepStrictEqual(w.times(), [0, 2000], "the second retry (7000) is pending");
  w.disconnect();
  await play(w, 10000);
  assert.deepStrictEqual(w.times(), [0, 2000]);
  w.reconnect();
  await play(w, 2000);
  assert.deepStrictEqual(w.times(), [0, 2000, 13000, 15000], "asked at once on return; the first retry delay (2000) again");
});

test("_forget: nothing of the last pet's wait, retry or confirm is left", async () => {
  const w = channel("silence");
  w.card._subscribe(w.slide);
  await play(w, 500);
  w.card._forget(w.slide);
  await play(w, 130000);
  assert.deepStrictEqual([w.times(), !!w.slide.subscribeFailed], [[0], false]);
  const r = channel("refuse");
  r.card._subscribe(r.slide);
  await play(r, 500);
  r.card._forget(r.slide);
  await play(r, 130000);
  assert.deepStrictEqual(r.times(), [0]);
});

// ---------------------------------------------------------------- the memory page (R38, R39)
const MEMORY = {
  methods: ["_memoryTouch", "_memoryPageClose", "_memoryForget", "_memoryItemKey"],
  consts: ["MEMORY_IDLE_MS", "CONFIRM_MS", "CONFIRM_GAP_MS"],
  watch: ["_memoryRedraw"],
  globals: { MEMORY_PAGE: { forget_sure: "sure?", forget_pattern_sure: "sure?" } },
};
function memory() {
  const w = world({ ...MEMORY, slide: () => ({ memoryPage: "open", memoryEpoch: 1, ids: { "sensor.life_stage": "sensor.p" } }) });
  require("vm").runInContext(grabFn("confirmTap"), w.sandbox);
  w.redraws = () => w.calls.filter((c) => c.name === "_memoryRedraw").map((c) => c.t);
  w.button = () => ({ textContent: "", setAttribute() {}, classList: { contains: () => false, add() {} } });
  w.row = { key: { list: "item", kind: "k" } };
  return w;
}

test("R38: the memory page closes after 120000 idle; a tap restarts the count", async () => {
  const w = memory();
  w.card._memoryTouch(w.slide);
  await play(w, 119990);
  assert.strictEqual(w.slide.memoryPage, "open");
  await play(w, 10);
  assert.strictEqual(w.slide.memoryPage, false, "closed at 120000");
  const v = memory();
  v.card._memoryTouch(v.slide);
  await play(v, 100000);
  v.card._memoryTouch(v.slide); // a tap at 100000
  await play(v, 119990);
  assert.strictEqual(v.slide.memoryPage, "open", "220000 - 10: the first count is gone");
  await play(v, 10);
  assert.strictEqual(v.slide.memoryPage, false, "closed at 100000 + 120000");
});

test("R38: _memoryPageClose stops the idle count (it closes by hand at 5 s: nothing fires later)", async () => {
  const w = memory();
  w.card._memoryTouch(w.slide);
  await play(w, 5000);
  w.card._memoryPageClose(w.slide, false);
  const epoch = w.slide.memoryEpoch;
  w.slide.memoryPage = "open"; // a page opened again by hand: only a stray idle count would close it
  await play(w, 200000);
  assert.deepStrictEqual([w.slide.memoryPage, w.slide.memoryEpoch], ["open", epoch]);
});

test("R38: disconnect with the idle armed stops it (the page is closed by disconnectedCallback)", async () => {
  const w = memory();
  w.card._memoryTouch(w.slide);
  await play(w, 1000);
  w.disconnect();
  assert.strictEqual(w.slide.memoryPage, false);
  const epoch = w.slide.memoryEpoch;
  w.slide.memoryPage = "open"; // only a stray idle count would close it now
  await play(w, 200000);
  assert.deepStrictEqual([w.slide.memoryPage, w.slide.memoryEpoch], ["open", epoch]);
});

test("R39: the memory 'sure?' lapses at 4050 and redraws once; a re-tap inside the gap does not move it", async () => {
  const w = memory();
  await play(w, 777);
  const t0 = w.now;
  w.card._memoryForget(w.slide, w.row, w.button());
  await play(w, 300);
  w.card._memoryForget(w.slide, w.row, w.button()); // inside CONFIRM_GAP_MS: still armed, re-armed on the same formula
  await play(w, 10000);
  assert.deepStrictEqual(w.redraws().map((t) => t - t0), [4050]);
});

test("R39: the redraw is guarded by memoryPage === 'open'", async () => {
  const w = memory();
  w.card._memoryForget(w.slide, w.row, w.button());
  w.slide.memoryPage = false;
  await play(w, 5000);
  assert.deepStrictEqual(w.redraws(), []);
});

test("R39: the memory page's own close drops the armed confirm (the key says memory_item)", async () => {
  const w = memory();
  w.card._memoryForget(w.slide, w.row, w.button());
  w.card._memoryPageClose(w.slide, false);
  assert.strictEqual(w.slide.confirm, null);
});

// ---------------------------------------------------------------- the settings confirm (R56) and R39's shared timer
const CONFIRM = {
  methods: ["_confirmed", ..."_memoryForget _memoryItemKey _forget".split(" ")],
  consts: ["CONFIRM_MS", "CONFIRM_GAP_MS"],
  watch: ["_memoryRedraw"],
  globals: { CONFIRM_ARIA: { a: "a", b: "b" }, MEMORY_PAGE: { forget_sure: "sure?", forget_pattern_sure: "sure?" } },
};
function confirm() {
  const w = world({ ...CONFIRM, slide: () => ({ memoryPage: "open", ids: { "sensor.life_stage": "sensor.p" } }) });
  require("vm").runInContext(grabFn("confirmTap"), w.sandbox);
  w.redraws = [];
  w.button = () => ({ textContent: "", setAttribute() {}, classList: { contains: () => false, add() {} } });
  w.tap = (key, tag = key) => w.card._confirmed(w.slide, key, w.button(), () => w.redraws.push([tag, w.now]));
  return w;
}

test("R56: the settings 'sure?' lapses at 4050 (less ms since the tap) and redraws", async () => {
  const w = confirm();
  await play(w, 1230);
  assert.strictEqual(w.tap("a"), false);
  await play(w, 10000);
  assert.deepStrictEqual(w.redraws, [["a", 1230 + 4050]]);
});

test("R56: a second tap inside the gap keeps the first tap's lapse; another key's tap replaces the timer and redraws the first at once", async () => {
  const w = confirm();
  w.tap("a");
  await play(w, 300);
  w.tap("a");
  await play(w, 10000);
  assert.deepStrictEqual(w.redraws, [["a", 4050]], "one lapse, from the first tap");
  const v = confirm();
  v.tap("a");
  await play(v, 1000);
  v.tap("b", "b"); // the other one disarms: a's redraw runs now, b arms
  await play(v, 10000);
  assert.deepStrictEqual(v.redraws, [["a", 1000], ["b", 5050]], "a's own timer was replaced, b's lapses at 4050 after its tap");
});

test("R39 and R56 share one timer: arming the settings confirm replaces the memory one", async () => {
  const w = confirm();
  w.card._memoryForget(w.slide, { key: { list: "item", kind: "k" } }, w.button());
  await play(w, 1000);
  w.tap("a");
  await play(w, 10000);
  assert.deepStrictEqual(w.calls.filter((c) => c.name === "_memoryRedraw").length, 0, "the memory lapse never fired");
  assert.deepStrictEqual(w.redraws, [["a", 5050]]);
});

test("R39 and R56: _forget drops a pending confirm (neither lapse redraws)", async () => {
  const w = confirm();
  w.tap("a");
  w.card._forget(w.slide);
  await play(w, 10000);
  assert.deepStrictEqual(w.redraws, []);
  const v = confirm();
  v.card._memoryForget(v.slide, { key: { list: "item", kind: "k" } }, v.button());
  v.card._forget(v.slide);
  await play(v, 10000);
  assert.strictEqual(v.calls.filter((c) => c.name === "_memoryRedraw").length, 0);
});

test("a disconnect with a settings 'sure?' pending lets the lapse fire (R56's redraw is unguarded); the memory lapse fires only while the page is open", async () => {
  const w = confirm();
  w.tap("a");
  w.disconnect();
  await play(w, 10000);
  assert.deepStrictEqual(w.redraws, [["a", 4050]], "kept: it redraws a detached slide");
  const v = confirm();
  v.card._memoryForget(v.slide, { key: { list: "item", kind: "k" } }, v.button());
  v.disconnect(); // disconnectedCallback closes the memory page (_memoryPageClose is a stub here: close it by hand)
  v.slide.memoryPage = false;
  await play(v, 10000);
  assert.strictEqual(v.calls.filter((c) => c.name === "_memoryRedraw").length, 0);
});

// ---------------------------------------------------------------- the sheets' call waits (R51-R55): NOT moved
// A characterization only. What follows is what the unmoved code does today, written first and read off the
// run, not copied from the plan's guesses (the report says where they differ).
const SHEETS = {
  methods: ["_saveShell", "_shellSettled", "_layWatch", "_layDrop", "_nameSave", "_clearNameTimers", "_shellChoice"],
  consts: ["NAME_WAIT_MS", "NAME_WAIT_MAX_MS", "NAME_RETRY_MS"],
  watch: ["_pickerNote", "_redraw", "_closeName", "_dress"],
  globals: {
    SHELL_ERRORS: {}, NAME_ERRORS: {}, nameShows: () => true, FINISHES: {},
    SETUP_COPY: { nameBad: "bad", nameFailed: "failed", nameSaved: (n) => `saved ${n}` },
  },
  returns: { _state: { state: "egg", attributes: { generation: 1 } } },
};
function sheets() {
  const w = world({ ...SHEETS, slide: (el) => {
    const input = { value: "Pip", focus() {}, classList: { add() {}, remove() {} } };
    const status = el("status");
    status.querySelector = (q) => (q === ".nameinput" ? input : { classList: { add() {}, remove() {} }, focus() {}, hidden: false, textContent: "" });
    return { ids: { "sensor.life_stage": "sensor.p" }, status, screen: el("screen"), nameSheet: true, nameGen: 1, nameFrom: "status" };
  } });
  w.wsCalls = [];
  w.settle_ = [];
  w.reply = "pending"; // pending | ok | not_ready
  w.card._hass = {
    callWS: (msg) => {
      w.wsCalls.push({ t: w.now, type: msg.type });
      if (w.reply === "ok") return Promise.resolve({ name: "Pip" });
      if (w.reply === "not_ready") { w.reply = "ok"; return Promise.reject({ code: "not_ready" }); }
      if (w.reply === "refuse") return Promise.reject({ code: "shell_locked" });
      return new Promise((resolve, reject) => w.settle_.push({ resolve, reject }));
    },
  };
  w.notes = () => w.calls.filter((c) => c.name === "_pickerNote").map((c) => [c.t, c.args[1]]);
  w.redrawsAt = () => w.calls.filter((c) => c.name === "_redraw").map((c) => c.t);
  return w;
}

test("R51: the shell pick's race rejects at 10000 unless the call finishes; the picker settles with a note", async () => {
  const w = sheets();
  w.card._saveShell(w.slide, "gold");
  assert.strictEqual(w.slide.shellPending, "gold");
  await play(w, 9990);
  assert.deepStrictEqual([w.notes(), w.slide.shellPending], [[], "gold"]);
  await play(w, 10);
  assert.deepStrictEqual([w.notes(), w.slide.shellPending], [[[10000, "that didn't work, try later"]], undefined]);
});

test("R51 + R52: a call that finishes at 1000 clears the race; shellPending clears and redraws at +5000", async () => {
  const w = sheets();
  w.card._saveShell(w.slide, "gold");
  await play(w, 1000);
  w.settle_[0].resolve({});
  await play(w, 4990);
  assert.deepStrictEqual([w.slide.shellPending, w.redrawsAt()], ["gold", []]);
  await play(w, 10);
  assert.deepStrictEqual([w.slide.shellPending, w.redrawsAt()], [undefined, [6000]]);
  assert.deepStrictEqual(w.notes(), [[1000, "shell saved ♪"]], "the race timer was cleared: no timeout note at 10000");
  await play(w, 20000);
  assert.deepStrictEqual(w.notes(), [[1000, "shell saved ♪"]]);
});

test("R52: a success after the slide changed pet does nothing (no pending timer, shellPending stays)", async () => {
  const w = sheets();
  w.card._saveShell(w.slide, "gold");
  await play(w, 500);
  w.slide.ids = { "sensor.life_stage": "sensor.other" };
  w.settle_[0].resolve({});
  await play(w, 20000);
  assert.deepStrictEqual([w.slide.shellPending, w.redrawsAt(), w.notes()], ["gold", [], []]);
});

test("R52: a second pick replaces the first's pending clear (_shellSettled), only the second redraws", async () => {
  const w = sheets();
  w.card._saveShell(w.slide, "gold");
  await play(w, 100);
  w.settle_[0].resolve({});
  await play(w, 1000);
  w.card._saveShell(w.slide, "blue"); // at 1100: settles the first
  await play(w, 100);
  w.settle_[1].resolve({});
  await play(w, 20000);
  assert.deepStrictEqual(w.redrawsAt(), [1200 + 5000]);
});

test("R53: the lay wait ends at 30000; again at +5000 while reloading, up to 120000; _layDrop cancels", async () => {
  const w = sheets();
  assert.ok(w.card._layWatch(w.slide));
  await play(w, 29990);
  assert.ok(w.slide.layAt);
  await play(w, 10);
  assert.strictEqual(w.slide.layAt, null, "dropped at 30000");
  const r = sheets();
  r.slide.reloading = true;
  r.card._layWatch(r.slide);
  await play(r, 119990);
  assert.ok(r.slide.layAt, "still waiting at 119990");
  await play(r, 10);
  assert.strictEqual(r.slide.layAt, null, "dropped at 120000 (30000 + 18 x 5000)");
  const d = sheets();
  d.card._layWatch(d.slide);
  await play(d, 1000);
  d.card._layDrop(d.slide);
  const mark = (d.slide.layAt = { generation: 9 }); // a later wait's mark: a stray check of the first must not clear it
  await play(d, 60000);
  assert.strictEqual(d.slide.layAt, mark, "the dropped wait's timer is gone");
});

test("R55: the rename retries once after NAME_RETRY_MS (2000) on not_ready", async () => {
  const w = sheets();
  w.reply = "not_ready";
  const p = w.card._nameSave(w.slide);
  await play(w, 1990);
  assert.deepStrictEqual(w.wsCalls.map((c) => c.t), [0]);
  assert.strictEqual(w.slide.nameBusy, true);
  await play(w, 10);
  await p;
  assert.deepStrictEqual(w.wsCalls.map((c) => c.t), [0, 2000]);
  assert.strictEqual(w.slide.nameBusy, false);
  assert.deepStrictEqual(w.calls.filter((c) => c.name === "_closeName").length, 1);
});

test("R55: _clearNameTimers (a sheet closed during the retry) stops the retry's timer: the awaiting save never continues", async () => {
  const w = sheets();
  w.reply = "not_ready";
  const p = w.card._nameSave(w.slide);
  await play(w, 500);
  w.card._clearNameTimers(w.slide);
  let done = false;
  p.then(() => { done = true; });
  await play(w, 60000);
  assert.deepStrictEqual([w.wsCalls.length, done], [1, false], "the promise is left unsettled, as the plan's 4.5 warns");
});

// D-keep and D-reattach (A2) for the sheets' waits: disconnect / reconnect leaves them alone, as today.
test("D: disconnect while the shell race is pending, reconnect, 10 s: the race still rejects and the picker settles", async () => {
  const w = sheets();
  w.card._saveShell(w.slide, "gold");
  await play(w, 1000);
  w.disconnect();
  await play(w, 500);
  w.reconnect();
  await play(w, 9000);
  assert.deepStrictEqual([w.notes(), w.slide.shellPending], [[[10000, "that didn't work, try later"]], undefined]);
});

test("D: disconnect during the rename retry: the retry still fires, the save finishes on a detached slide", async () => {
  const w = sheets();
  w.reply = "not_ready";
  const p = w.card._nameSave(w.slide);
  await play(w, 500);
  w.disconnect();
  await play(w, 2000);
  await p;
  assert.deepStrictEqual([w.wsCalls.map((c) => c.t), w.slide.nameBusy], [[0, 2000], false]);
  assert.strictEqual(w.slide.nameRetry !== undefined, true, "nameRetry is the timer id still on the slide (nothing nulled it)");
});

test("D: disconnect while the lay wait runs: layAt is cleared at its own time", async () => {
  const w = sheets();
  w.card._layWatch(w.slide);
  await play(w, 1000);
  w.disconnect();
  await play(w, 1000);
  w.reconnect();
  assert.ok(w.slide.layAt, "kept across the disconnect");
  await play(w, 28000);
  assert.strictEqual(w.slide.layAt, null);
  assert.strictEqual(w.t(), 30000);
});
