// Director migration slice 12 (the infrared link), the characterization half: the visit's `at` steps (R29), the guest's frame swap (R30),
// the head flap (R31) and the beam's gone and removed (R32, R33), on the fake clock with the card's own methods (plan 5.12). It passes
// before the move (bare timers: L.timers, L.swap, L.flap) and after (the ledger, group "link"). What it pins on purpose: a calm visit ends
// at t0 + 3600 (t0 = 200, 3.8 s) and a non-calm one at 2500 + 4600 (7.1 s), plus 1000 (a kindred extra) or LINK_NEWS_MS (news) of stretch;
// the swap every 700 ms (none under calm), the flap every 200 ms; a cut-short leaves nothing running; a queued line whose `then` moves the
// end; and _forget of the host ends the link (owner decision 2026-11-07, plan Section 9 line 13).
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");

const SPEC = {
  methods: ["_linkStart", "_linkBeam", "_linkEnd", "_pick", "_forget"],
  consts: ["LINK_NEWS_MS", "LINK_NEWS_ODDS", "LINK_NEWS_REPLY", "KINDRED_ODDS"],
  watch: ["_animate", "_bondHearts", "_queue", "_show", "_look", "_speak", "_chirp", "_moving"],
  globals: {
    WORLD_GRID: 32, FLAVOUR: 1, PERSONA: { x: { link_kindred: ["and how was your day"] } }, localStorage: { setItem() {} },
  },
  returns: { _lines: { text: "hello" }, _typeKey: "x" },
  screen: true,
  slide: (el) => ({
    ids: { device: "h" }, species: { scale: {} }, speciesId: "a", drawn: "adult", device: el("hdev"), bubble: el("hbub"),
    status: el("hstatus"), seasonBox: el("seasonBox"), basket: el("basket"), visitor: null, reveal: null, game: null, scene: null,
    sayUntil: 0, movingUntil: 0, linking: false, asleep: false,
  }),
};

// `kind`: null (a plain visit), "extra" (a kindred pair's extra line, 1000 ms of stretch) or "news" (the guest's news).
const make = ({ calm = false, kind = null } = {}) => {
  const w = world(SPEC);
  w.calm = calm;
  let n = 0;
  const mk = (tag) => {
    const e = w.el(`${tag}${++n}`);
    e.dataset = {};
    e.querySelector = () => null;
    e.querySelectorAll = () => [];
    e.style.setProperty = () => {};
    return e;
  };
  w.sandbox.document.createElement = mk;
  const host = w.slide;
  host.pet.style.scale = "1";
  host.screen.querySelector = () => null;
  host.screen.getBoundingClientRect = host.bubble.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 });
  host.device.querySelectorAll = () => [];
  host.status.querySelector = () => null;
  const guest = {
    pet: w.el("gpet"), screen: Object.assign(w.el("gscreen"), { querySelector: () => null }), status: Object.assign(w.el("gstatus"), { querySelector: () => null }), bubble: w.el("gbub"), device: w.el("gdev"), ids: { device: "g" },
    species: { scale: {} }, speciesId: "b", drawn: "adult", sayUntil: 0, movingUntil: 0, asleep: false,
  };
  guest.device.querySelectorAll = () => [];
  const track = mk("track");
  track.parentElement = { getBoundingClientRect: () => ({ top: 0 }) };
  track.getBoundingClientRect = () => ({ top: 0, left: 0 });
  Object.assign(w.card, {
    _track: track, _slides: [host, guest], _index: 0,
    _kindred: () => kind === "extra",
    _linkNews: () => (kind === "news" ? "i dreamed of a pond" : null),
    _linkPose: () => [],
    _queue: (s, text, ms, opts) => w.calls.push({ t: w.now, name: "_queue", args: [s, text, ms, opts] }),
  });
  w.sandbox.Math = Object.assign(Object.create(Math), { random: () => 0 }); // every roll lands: the extra, or the news
  w.host = host;
  w.guest = guest;
  w.start = () => w.card._linkStart(host, guest);
  w.intervals = () => w.timers.filter((x) => x.live && x.kind === "interval").length;
  w.stamps = (name) => w.calls.filter((c) => c.name === name).map((c) => c.t);
  w.when = (op, arg, el) => w.log.filter((e) => e.op === op && (arg === undefined || e.arg === arg) && (el === undefined || e.el === el)).map((e) => e.t);
  return w;
};
const imgSrcs = (w) => w.log.filter((e) => e.op === "append").length;

test("a non-calm visit: the screen at 1400, the pose at 2500, the hop at 3700, the reply at 4300, hearts at 5900, out at 6500, over at 7100", () => {
  const w = make();
  assert.strictEqual(w.start(), true);
  assert.strictEqual(w.card._link.beamMs, 1500);
  w.run(1390);
  assert.strictEqual(w.host.linking, false);
  w.run(10);
  assert.strictEqual(w.host.linking, true, "the visit screen at beamMs 1400");
  w.run(1090);
  assert.deepStrictEqual(w.when("class+", "linking", "pet"), []);
  w.run(10);
  assert.deepStrictEqual(w.when("class+", "linking", "pet"), [2500]);
  w.run(1200);
  assert.deepStrictEqual(w.calls.filter((c) => c.name === "_animate").map((c) => [c.t, c.args[2]]), [[3700, "greethop"]]);
  w.run(600);
  assert.deepStrictEqual(w.stamps("_animate"), [3700, 4300], "the reply: the guest's hop");
  assert.strictEqual(w.card._link.say.hidden, false);
  assert.deepStrictEqual(w.stamps("_bondHearts"), []);
  w.run(1600);
  assert.deepStrictEqual(w.stamps("_bondHearts"), [5900]);
  w.run(590);
  assert.deepStrictEqual(w.when("class+", "out"), [], "not before 6500");
  w.run(10);
  assert.deepStrictEqual(w.when("class+", "out"), [6500]);
  w.run(590);
  assert.ok(w.card._link, "still on at 7090");
  assert.strictEqual(w.host.linking, true);
  w.run(10);
  assert.strictEqual(w.card._link, null, "over at 2500 + 4600");
  assert.deepStrictEqual([w.host.linking, w.host.pet.style.scale, w.intervals(), w.pendingTimers()], [false, "1", 0, 0]);
  assert.ok(w.card._linkEndedAt, "the stamp for a world visitor");
});

test("a calm visit: the screen at 0, the pose at 200, no hop, no hearts, no swap, no beam; over at 3800", () => {
  const w = make({ calm: true });
  w.start();
  assert.strictEqual(w.card._link.beamMs, 0);
  w.run(10);
  assert.strictEqual(w.host.linking, true);
  assert.strictEqual(w.intervals(), 0);
  w.run(200);
  assert.deepStrictEqual(w.when("class+", "linking", "pet"), [200]);
  assert.strictEqual(w.intervals(), 0, "no frame swap under calm");
  w.run(3580);
  assert.ok(w.card._link, "still on at 3790");
  w.run(10);
  assert.strictEqual(w.card._link, null, "over at 200 + 3600");
  assert.deepStrictEqual([w.stamps("_animate"), w.stamps("_bondHearts"), w.when("class+", "out")], [[], [], []]);
  assert.strictEqual(w.card._track.children.length, 0);
});

test("a kindred extra holds the visit 1000 ms longer: out at 7500, over at 8100", () => {
  const w = make({ kind: "extra" });
  w.start();
  w.run(7490);
  assert.deepStrictEqual(w.when("class+", "out"), []);
  w.run(10);
  assert.deepStrictEqual(w.when("class+", "out"), [7500]);
  w.run(590);
  assert.ok(w.card._link);
  w.run(10);
  assert.strictEqual(w.card._link, null);
  assert.strictEqual(w.host.linking, false);
});

test("news holds it LINK_NEWS_MS (1500) longer: the text changes at 2500 + 1800 + 1500, the host's reply is queued at + 1500 more, over at 2500 + 4600 + 1500", () => {
  const w = make({ kind: "news" });
  w.start();
  const reply = () => w.calls.filter((c) => c.name === "_queue" && c.args[1] === "ooh, nice! ♪").map((c) => [c.t, c.args[2]]);
  w.run(2500 + 1800 + 1490);
  assert.strictEqual(w.card._link.say.textContent, "hello");
  w.run(10);
  assert.strictEqual(w.card._link.say.textContent, "i dreamed of a pond");
  w.run(1490);
  assert.deepStrictEqual(reply(), []);
  w.run(10);
  assert.deepStrictEqual(reply(), [[7300, 1800]]);
  w.run(2500 + 4600 + 1500 - 7300 - 10);
  assert.ok(w.card._link, "still on one step before the end");
  w.run(10);
  assert.strictEqual(w.card._link, null);
});

test("the frame swap every 700 ms from the pose, the head flap every 200 ms from the start, beam gone at 1600 and removed at 2000", () => {
  const w = make();
  w.start();
  const beam = () => w.card._track.children[0];
  assert.ok(beam(), "the beam is on the track at once");
  assert.strictEqual(w.intervals(), 1, "the flap");
  w.run(1599);
  assert.ok(!beam().cls.has("gone"));
  w.run(1);
  assert.ok(beam().cls.has("gone"), "gone at ms + 500 = 1600");
  w.run(399);
  assert.ok(beam());
  w.run(1);
  assert.strictEqual(w.card._track.children.length, 0, "removed at ms + 900 = 2000");
  assert.strictEqual(w.intervals(), 1, "the flap runs on until the visit ends");
  w.run(500);
  assert.strictEqual(w.intervals(), 2, "the swap from the pose at 2500 (guest frames: none to cycle, but the interval runs)");
  w.run(5000);
  assert.strictEqual(w.card._link, null);
  assert.strictEqual(w.intervals(), 0, "_linkEnd cleared both");
});

test("cut short at 3 s (a sleep, a tap on Status): everything is cleared, nothing pending, nothing fires later", () => {
  const w = make();
  w.start();
  w.run(3000);
  assert.strictEqual(w.intervals(), 2);
  w.card._linkEnd();
  assert.deepStrictEqual([w.card._link, w.host.linking, w.intervals(), w.pendingTimers()], [null, false, 0, 0]);
  assert.strictEqual(w.guest.sayUntil, 0);
  const n = w.log.length;
  w.run(9000);
  assert.strictEqual(w.log.length, n, "no later step touches anything");
  assert.deepStrictEqual([w.stamps("_bondHearts"), w.when("class+", "out")], [[], []]);
});

test("a queued line whose `then` stretches the visit: the end and the hide move to the line's end", () => {
  const w = make({ kind: "extra" });
  w.start();
  w.run(3000);
  const q = w.calls.find((c) => c.name === "_queue" && c.args[1] === "and how was your day");
  assert.ok(q, "the extra is queued at the pose");
  w.host.sayUntil = w.base + w.now + 9000; // the line is long: left 9000 > 8100 - 3000
  q.args[3].then();
  assert.strictEqual(w.card._link.say.hidden, true, "the guest's reply has had its turn");
  // left = 9000 at t = 3000: the hide moves from 7500 to 3000 + 9000 - 600 = 11400, the end from 8100 to 12000
  w.run(8390);
  assert.deepStrictEqual(w.when("class+", "out"), [], "the old hide (7500) was cancelled");
  assert.ok(w.card._link, "and the old end (8100)");
  w.run(10);
  assert.deepStrictEqual(w.when("class+", "out"), [11400]);
  w.run(590);
  assert.ok(w.card._link);
  w.run(10);
  assert.strictEqual(w.card._link, null, "over at 12000");
});

test("the `then` firing after a cut-short changes nothing the player sees", () => {
  const w = make({ kind: "extra" });
  w.start();
  w.run(3000);
  const q = w.calls.find((c) => c.name === "_queue" && c.args[1] === "and how was your day");
  w.card._linkEnd();
  const n = w.log.length;
  w.host.sayUntil = w.base + w.now + 9000;
  q.args[3].then();
  w.run(12000);
  assert.deepStrictEqual([w.card._link, w.host.linking, w.intervals()], [null, false, 0]);
  assert.deepStrictEqual(w.log.slice(n), [], "no class, no remove, no append from the stale line");
});

// TODAY _forget does not reach the link (plan 5.12, B1): a pet-changed or removed-pet forget mid-visit leaves L live to its own end. The move
// commit flips this case to the owner decision (2026-11-07, Section 9 line 13): _forget ends the link before detach.
test("forget the host at ~2 s (today): the link is not touched; it runs to its own end at 7100", () => {
  const w = make();
  w.start();
  w.run(2000);
  w.card._forget(w.host);
  assert.ok(w.card._link, "today the link outlives the forget");
  assert.strictEqual(w.host.linking, true);
  w.run(5100);
  assert.strictEqual(w.card._link, null);
  assert.deepStrictEqual([w.host.linking, w.intervals(), w.pendingTimers()], [false, 0, 0]);
});
