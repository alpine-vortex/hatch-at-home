// Birthday plan 7.3: party guests. The card's own _partyGuestTick, _partyGuestLog, _partyGuestPick and
// _partyGuestOf on the fake clock (timer_trace); the visits they start are watched stubs.
// node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const { world } = require("./timer_trace");
const src = require("./card-source");

const WOODS = { visitors: [{ id: "chickadee", name: "chickadee" }, { id: "stellersjay", name: "jay" },
  { id: "snail", name: "snail" }, { id: "comet", name: "comet", cross: true }] };
const TURKEY = { key: "thanksgiving", visitor: { art: ["turkey_1", "turkey_2"], greet: ["hi"], party: { art: ["turkey_party_1"], greet: ["party!"] } } };
const store = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};
const spec = ({ season = TURKEY, party = true, free = true, ls = store() } = {}) => ({
  methods: ["_partyGuestTick", "_partyGuestLog", "_partyGuestPick", "_partyGuestOf"],
  consts: ["PARTY_GUEST_ART", "PARTY_GUEST_TURNS", "PARTY_GUESTS_MAX", "PARTY_GUEST_GAP_MS", "VISIT_CHECK_MS"],
  watch: ["_visitorStart", "_seasonVisitor"],
  returns: { _yourPartyOn: party, _visitorFree: free, _yourPartyKey: "hatch-yourparty-guests-dev-u-2026", _birthdayPrefs: { year: 2026 } },
  globals: { localStorage: ls, seasonNow: () => season, visitorList: (w) => w?.visitors || [], turnHash: (t) => t.length },
  slide: () => ({ worldKey: "woodland", world: WOODS }),
});
const visits = (w) => w.calls.filter((c) => c.name === "_visitorStart" || c.name === "_seasonVisitor");
const started = (w) => visits(w).map((c) => c.name);
const tick = (w) => w.card._partyGuestTick(w.slide, w.base + w.t()); // the fake clock
const HOUR = 3600000;

test("guests come in turn, an hour apart, four a day at most: a hatted visitor, then the season's", () => {
  const w = world(spec());
  assert.strictEqual(tick(w), true, "the first at the first free look");
  const v = visits(w)[0];
  assert.strictEqual(v.name, "_visitorStart");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(v.args[2])), { ltr: true, count: false, party: true }, "never counted: not the day's visit, a friend or the meter");
  assert.ok(["chickadee", "stellersjay", "snail"].includes(v.args[1].id), "a visitor with hatted art, never a crosser");
  w.run(30 * 60000);
  assert.strictEqual(tick(w), false, "not within the hour");
  w.run(30 * 60000);
  assert.strictEqual(tick(w), true);
  assert.strictEqual(started(w)[1], "_seasonVisitor", "no stranger pet yet: the season's visitor takes the turn");
  const season = visits(w)[1].args[1];
  assert.deepStrictEqual([...season.visitor.art], ["turkey_party_1"]);
  assert.deepStrictEqual([...season.visitor.greet], ["party!"]);
  for (let i = 0; i < 6; i++) {
    w.run(HOUR);
    tick(w);
  }
  assert.strictEqual(started(w).length, 4, "PARTY_GUESTS_MAX");
});

test("off the party, while a visit is on, or not free: no guest, nothing kept", () => {
  for (const [why, opts] of [["no party", { party: false }], ["not free", { free: false }]]) {
    const ls = store();
    const w = world(spec({ ...opts, ls }));
    assert.strictEqual(tick(w), false, why);
    assert.strictEqual(ls.m.size, 0, why);
  }
  const w = world(spec());
  w.slide.seasonVisit = {};
  assert.strictEqual(tick(w), false, "a season visit on");
  assert.strictEqual(visits(w).length, 0);
});

test("the count is kept per device, person and year; a reload goes on from it; no storage keeps it in memory", () => {
  const ls = store();
  const w = world(spec({ ls }));
  tick(w);
  assert.deepStrictEqual(JSON.parse(ls.m.get("hatch-yourparty-guests-dev-u-2026")).n, 1);
  const again = world(spec({ ls }));
  assert.strictEqual(tick(again), false, "a reload within the hour: no second guest");
  const broken = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } };
  const w2 = world(spec({ ls: broken }));
  assert.strictEqual(tick(w2), true);
  w2.run(10 * 60000);
  assert.strictEqual(tick(w2), false, "remembered in memory");
});

test("no hatted art for the world and no season guest: nobody comes", () => {
  const w = world(spec({ season: null }));
  w.slide.worldKey = "pond";
  assert.strictEqual(tick(w), false);
  assert.strictEqual(visits(w).length, 0);
});

test("the art, the CSS lift and the greet are wired", () => {
  assert.match(src, /visitor_\$\{world\}_\$\{v\.id\}\$\{party \? "_party" : ""\}_\$\{n\}\.png/);
  assert.match(src, /\.season \.vis\.party\.fly \{ margin-top: calc\(var\(--px, 2px\) \* -6\); \}/);
  assert.match(src, /V\?\.party \? pick\(PARTY_GUEST_LINES\)/);
  const fs = require("fs");
  const path = require("path");
  const ui = path.join(__dirname, "../../custom_components/virtual_pet/frontend/ui");
  for (const id of ["chickadee", "stellersjay", "snail"]) for (const n of [1, 2]) {
    assert.ok(fs.existsSync(path.join(ui, `visitor_woodland_${id}_party_${n}.png`)), `${id} ${n}`);
  }
  for (const n of [1, 2]) assert.ok(fs.existsSync(path.join(ui, `season_thanksgiving_turkey_party_${n}.png`)));
});
