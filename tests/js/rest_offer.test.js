// The rest offer, R3 (docs/plan-2026-11-02-favourite-resting.md §6, tests 29 and 31):
// node --test tests/js
// After a person's first pick of the pet their card opens on, the settings sheet of that pet
// asks "Let the others rest?". Card state only, read at each render; only its buttons answer.
// "rest them" is one `rest` call per other pet that can rest, then `rest_offer`; "not now" is
// `rest_offer` alone. Never for "house", a shared screen, the late move or a move of the pick.
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");

const src = require("./card-source");
const grab = (re) => {
  const m = src.match(re);
  assert.ok(m, `not in the card: ${re}`);
  return m[0];
};
const method = (name) => grab(new RegExp(`\\n  (?:async )?${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`)).trim();

// A button as the card's code uses it.
function fakeButton(siblings) {
  const classes = new Set();
  const attrs = {};
  const b = {
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    setAttribute: (k, v) => { attrs[k] = v; },
    attrs,
    textContent: "",
    parentElement: { querySelectorAll: () => siblings || [b] },
  };
  return b;
}

// A promise and its hand: a call that settles when the test says.
function later() {
  let resolve;
  let reject;
  const promise = new Promise((y, n) => { resolve = y; reject = n; });
  return { promise, resolve, reject };
}

// The card's own offer code, on a fake card of slides {device, stage, resting, mine}.
function load({ shared = false, user = "u1" } = {}) {
  const store = new Map(shared ? [["hatch-shared-screen", "on"]] : []);
  const ctx = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  };
  const go = grab(/\n    if \(this\._restOffer && this\._restOffer\.device !== this\._slides\[to\][^\n]*\n/);
  vm.runInNewContext([
    grab(/\nconst SHARED_KEY = [^\n]*\n/),
    grab(/\nfunction sharedScreen\(\) \{[\s\S]*?\n\}\n/),
    grab(/\nconst SETTINGS_AGAIN = \{[\s\S]*?\n\};\n/),
    grab(/\nconst REST_OFFER_COPY = \{[\s\S]*?\n\};\n/),
    grab(/\nfunction spoken\([\s\S]*?\n\}\n/),
    grab(/\nfunction openOnKey\([\s\S]*?\n\}\n/),
    grab(/\nfunction openOnWrite\([\s\S]*?\n\}\n/),
    `function makeCard(user, pets, calls, answer) {
      const states = {};
      const slides = pets.map((p) => {
        const ids = { device: p.device, "sensor.life_stage": \`sensor.\${p.device}_life_stage\`,
          "switch.resting": \`switch.\${p.device}_resting\` };
        states[ids["sensor.life_stage"]] = p.stage === null ? undefined : { state: p.stage ?? "adult" };
        states[ids["switch.resting"]] = { state: p.resting ? "on" : "off" };
        return { ids, mine: p.mine === undefined ? { open_on: false, rest_offer: false } : p.mine, settings: true,
          shown: [], said: [] };
      });
      return {
        _hass: { user: { id: user, is_admin: true }, states,
          callWS: (msg) => { calls.push(msg); return answer(msg); } },
        _slides: slides,
        _index: 0,
        _state(s, key) { const id = s.ids?.[key]; return id ? this._hass.states[id] : undefined; },
        _openKey() { return openOnKey(this._hass.user?.id, sharedScreen()); },
        _openOnSync() {},
        _renderShelf() {},
        _setMine(key, value) { for (const x of this._slides) if (x.mine) x.mine[key] = value; },
        _statusMessage(s, m) { s.said.push(m); },
        _renderStatus(s) { s.shown.push(s.settings ? this._restOfferRow(s) : ""); },
        _go(to) { ${go} this._index = to; },
        ${method("_othersToRest")},
        ${method("_offerRest")},
        ${method("_answerRestOffer")},
        ${method("_restOfferRow")},
        ${method("_setOpenOn")},
      };
    }`,
    "this.out = { makeCard };",
  ].join("\n"), ctx);
  const calls = [];
  const replies = { fn: () => Promise.resolve({}) };
  const card = (pets) => ctx.out.makeCard(user, pets, calls, (msg) => replies.fn(msg));
  return { card, calls, replies, store };
}

const THREE = [{ device: "pip" }, { device: "bo" }, { device: "moss" }];
const row = (c, s) => c._restOfferRow(s);
const pick = (c, s, enabled = true, scope = "me") => c._setOpenOn(s, enabled, scope, fakeButton());
const plain = (x) => JSON.parse(JSON.stringify(x)); // the card's objects are another realm's
const types = (calls) => calls.map((m) => m.type.replace("virtual_pet/", ""));

test("29a: a first pick offers, under the toggle, with the approved copy and spoken labels", async () => {
  const { card, calls } = load();
  const c = card(THREE);
  const [a] = c._slides;
  await pick(c, a);
  assert.strictEqual(c._restOffer?.device, "pip");
  assert.deepStrictEqual(types(calls), ["open_on"]);
  const html = row(c, a);
  assert.match(html, /role="group" aria-label="Let the others rest\? Resting pets won't get any hungrier, and don't grow up until they're back\. Visit any time\."/);
  assert.match(html, /<span>Let the others rest\?<\/span>/);
  assert.match(html, /<button class="bell restthem" aria-label="rest them">rest them<\/button>/);
  assert.match(html, /<button class="bell restnot" aria-label="not now">not now<\/button>/);
  assert.match(html, /<div class="shellnote restoffernote">Resting pets won't get any hungrier, and don't grow up until they're back\. Visit any time\.<\/div>/);
  // It is drawn right under the "♥ open on" row and before the house's (never under it).
  assert.match(src, /openRow\("openon", OPEN_ON_COPY\.mine, s\.mine\.open_on\)\n\s*\+ this\._restOfferRow\(s\)[^\n]*\n\s*\+ \(this\._hass\.user\?\.is_admin/);
  // The copy promises no refill, "content" or "no calls", and ranks nothing (§6.1, checklist).
  for (const line of Object.values(vm.runInNewContext(`(${grab(/\nconst REST_OFFER_COPY = (\{[\s\S]*?\n\});\n/).replace(/^\nconst REST_OFFER_COPY = /, "").replace(/;\n$/, "")})`))) {
    assert.doesNotMatch(line, /refill|content|no calls|favourite|best|main|top/i);
  }
});

test("29b: the row survives a channel push's redraw", async () => {
  const { card } = load();
  const c = card(THREE);
  const [a] = c._slides;
  await pick(c, a);
  a.statusHtml = null; // a push for A
  Object.assign(a.mine, { open_on: true, rest_offer: false });
  assert.match(row(c, a), /restthem/);
  assert.match(row(c, a), /restthem/);
  assert.strictEqual(c._restOffer?.device, "pip");
});

test("29c: not offered for house, a shared screen, one pet, no pet that can rest, an answer, an old server, a move, a failure", async () => {
  const none = async (pets, opts = {}, how = (c, a) => pick(c, a)) => {
    const { card, replies } = load(opts);
    if (opts.fail) replies.fn = () => Promise.reject(new Error("no"));
    const c = card(pets);
    await how(c, c._slides[0]);
    assert.strictEqual(c._restOffer ?? null, null, JSON.stringify(pets));
    assert.strictEqual(row(c, c._slides[0]), "");
    return c;
  };
  await none(THREE, {}, (c, a) => pick(c, a, true, "house"));
  await none(THREE, { shared: true });
  await none([{ device: "pip" }]);
  await none([{ device: "pip" }, { device: "bo", stage: "egg" }, { device: "moss", resting: true }]);
  await none([{ device: "pip" }, { device: "bo", stage: "unavailable" }, { device: "moss", stage: "unknown" }]);
  await none([{ device: "pip" }, { device: "bo", stage: null }]); // no state at all
  await none([{ device: "pip" }, { device: "bo", mine: { open_on: false, rest_offer: true } }]); // answered (another slide says)
  await none([{ device: "pip", mine: { open_on: false } }, { device: "bo", mine: { open_on: false } }]); // an older server
  await none([{ device: "pip" }, { device: "bo", mine: { open_on: true, rest_offer: false } }, { device: "moss" }]); // a move B -> A
  const failed = await none(THREE, { fail: true });
  assert.strictEqual(failed._slides[0].mine.open_on, false); // the toggle reverted
  // The toggle's own off never offers.
  await none(THREE, {}, (c, a) => pick(c, a, false));
  // _openOnSync's late move never calls it.
  assert.doesNotMatch(method("_openOnSync"), /_offerRest/);
  assert.match(method("_setOpenOn"), /if \(ok\) this\._offerRest\(s, scope, enabled, before\)/);
});

test("29d: the favourite may be an egg or resting; only this card's slides count", async () => {
  for (const me of [{ device: "pip", stage: "egg" }, { device: "pip", resting: true }]) {
    const { card } = load();
    const c = card([me, { device: "bo", stage: "egg" }, { device: "moss" }]);
    await pick(c, c._slides[0]);
    assert.match(row(c, c._slides[0]), /restthem/);
    assert.deepStrictEqual(c._othersToRest(c._slides[0]).map((x) => x.ids.device), ["moss"]);
  }
  // A card limited to two pets (config.devices: its slides are those two): only the other one.
  const { card, calls } = load();
  const c = card([{ device: "pip" }, { device: "bo" }]);
  await pick(c, c._slides[0]);
  await c._answerRestOffer(c._slides[0], true, fakeButton());
  assert.deepStrictEqual(calls.filter((m) => m.type === "virtual_pet/rest").map((m) => m.entity_id), ["sensor.bo_life_stage"]);
  // Empty slides and slides with no ids don't count.
  const { card: card2 } = load();
  const c2 = card2([{ device: "pip" }]);
  c2._slides.push({ empty: true, ids: { device: "x" } }, { mine: null });
  assert.deepStrictEqual(c2._othersToRest(c2._slides[0]), []);
});

test("29e: it clears on every path, and shows on no other sheet", async () => {
  const fresh = async () => {
    const { card } = load();
    const c = card(THREE);
    await pick(c, c._slides[0]);
    assert.ok(c._restOffer);
    return c;
  };
  // Either button.
  for (const rest of [true, false]) {
    const c = await fresh();
    await c._answerRestOffer(c._slides[0], rest, fakeButton());
    assert.strictEqual(c._restOffer, null);
    assert.strictEqual(c._slides[0].shown.at(-1), ""); // redrawn: the row is gone
  }
  // A swipe to another pet (and not a "swipe" to the same one).
  let c = await fresh();
  c._go(0);
  assert.ok(c._restOffer);
  c._go(1);
  assert.strictEqual(c._restOffer, null);
  // The toggle off.
  c = await fresh();
  await pick(c, c._slides[0], false);
  assert.strictEqual(c._restOffer, null);
  // A push that makes the rule false: answered elsewhere, or the others now resting.
  c = await fresh();
  c._slides[0].mine.rest_offer = true;
  assert.strictEqual(row(c, c._slides[0]), "");
  assert.strictEqual(c._restOffer, null);
  c = await fresh();
  c._hass.states["switch.bo_resting"].state = "on";
  c._hass.states["switch.moss_resting"].state = "on";
  assert.strictEqual(row(c, c._slides[0]), "");
  assert.strictEqual(c._restOffer, null);
  // A shared screen's render drops it too (the browser flagged shared since).
  {
    const { card, store } = load();
    const d = card(THREE);
    await pick(d, d._slides[0]);
    store.set("hatch-shared-screen", "on");
    assert.strictEqual(row(d, d._slides[0]), "");
    assert.strictEqual(d._restOffer, null);
  }
  // Not on the other pets' sheets.
  c = await fresh();
  assert.strictEqual(row(c, c._slides[1]), "");
  assert.strictEqual(row(c, c._slides[2]), "");
  assert.ok(c._restOffer); // and drawing them doesn't drop it
  // Back, close and forget (in the sheet's own handlers).
  assert.match(src, /s\.settings = false;\n\s*this\._restOffer = null; \/\/ leaving is not an answer/);
  assert.match(src, /if \(!open\) this\._restOffer = null; \/\/ the sheet closed without a button/);
  assert.match(src, /for \(const key of \[[^\]]*"open_on", "rest_offer"\]\) this\._setMine\(key, false\)/);
  assert.match(src, /this\._openOnSync\(\); [^\n]*\n\s*this\._restOffer = null; \/\/ and an offer on show/);
});

test("29f and 31: rest them is one rest call per other pet that can rest, then the answer; no open_on", async () => {
  const { card, calls } = load();
  const c = card([
    { device: "pip" }, { device: "bo" }, { device: "moss", stage: "egg" },
    { device: "fern", resting: true }, { device: "ivy" }, // ivy away: still rests (§3.4)
  ]);
  const [a] = c._slides;
  await pick(c, a);
  calls.length = 0;
  const { promise, resolve } = later();
  c._hass.callWS = (msg) => { calls.push(msg); return msg.type === "virtual_pet/rest" ? promise : Promise.resolve(); };
  const buttons = [];
  buttons.push(fakeButton(buttons), fakeButton(buttons));
  const tap = c._answerRestOffer(a, true, buttons[0]);
  // Both pending while the calls run, and a second tap (either button) sends nothing.
  assert.ok(buttons.every((b) => b.classList.contains("pending")));
  const again = [c._answerRestOffer(a, true, buttons[0]), c._answerRestOffer(a, false, buttons[1])];
  assert.match(row(c, a), /class="bell restthem pending"/); // a push's redraw keeps them pending
  assert.match(row(c, a), /class="bell restnot pending"/);
  // ...even when that push already says the others rest.
  c._hass.states["switch.bo_resting"].state = "on";
  assert.match(row(c, a), /restthem pending/);
  c._hass.states["switch.bo_resting"].state = "off";
  resolve({ resting: true });
  await tap;
  await Promise.all(again);
  assert.deepStrictEqual(plain(calls), [
    { type: "virtual_pet/rest", entity_id: "sensor.bo_life_stage", enabled: true },
    { type: "virtual_pet/rest", entity_id: "sensor.ivy_life_stage", enabled: true },
    { type: "virtual_pet/rest_offer", entity_id: "sensor.pip_life_stage", shared: false },
  ]);
  assert.strictEqual(a.mine.rest_offer, true);
  assert.ok(c._slides.every((x) => x.mine.rest_offer === true)); // every slide: none offers again
  assert.deepStrictEqual(plain(a.said), []); // no line follows
  assert.strictEqual(a.shown.at(-1), ""); // the row is gone
  // The offer reads and sets no refill time (that is R1's, per pet).
  for (const name of ["_offerRest", "_answerRestOffer", "_restOfferRow", "_othersToRest"]) {
    assert.doesNotMatch(method(name), /last_rest_refill_at|open_on"/);
  }
  // The buttons' handlers ignore a pending tap.
  assert.match(src, /for \(const \[cls, rest\] of \[\["restthem", true\], \["restnot", false\]\]\) \{[\s\S]{0,250}if \(button\.classList\.contains\("pending"\)\) return;[\s\S]{0,120}this\._answerRestOffer\(s, rest, button\)/);
  // A later first pick (off, then on) doesn't offer: answered.
  c._hass.callWS = () => Promise.resolve();
  await pick(c, a, false);
  await pick(c, a, true);
  assert.strictEqual(c._restOffer, null);
});

test("29g: not now marks the person and flips nothing", async () => {
  const { card, calls } = load();
  const c = card(THREE);
  const [a] = c._slides;
  await pick(c, a);
  calls.length = 0;
  await c._answerRestOffer(a, false, fakeButton());
  assert.deepStrictEqual(plain(calls), [{ type: "virtual_pet/rest_offer", entity_id: "sensor.pip_life_stage", shared: false }]);
  assert.strictEqual(a.mine.rest_offer, true);
  assert.deepStrictEqual(plain(a.said), []);
});

test("29h: one failed rest still answers and says so once; all failed: no answer, offered again; a failed answer says so", async () => {
  const setup = async (fn) => {
    const { card, calls, replies } = load();
    const c = card(THREE);
    await pick(c, c._slides[0]);
    calls.length = 0;
    replies.fn = fn;
    await c._answerRestOffer(c._slides[0], true, fakeButton());
    return { c, calls, replies, a: c._slides[0] };
  };
  const failed = "hm, that didn't work. try again soon";
  // One of two rejected.
  let { c, calls, a } = await setup((m) => (m.entity_id === "sensor.bo_life_stage" && m.type === "virtual_pet/rest" ? Promise.reject(new Error("egg")) : Promise.resolve()));
  assert.deepStrictEqual(types(calls), ["rest", "rest", "rest_offer"]);
  assert.deepStrictEqual(plain(a.said), [failed]);
  assert.strictEqual(c._restOffer, null);
  // Both rejected: no answer sent, the message, the row clears, and a later first pick offers again.
  let replies;
  ({ c, calls, a, replies } = await setup((m) => (m.type === "virtual_pet/rest" ? Promise.reject(new Error("no")) : Promise.resolve())));
  assert.deepStrictEqual(types(calls), ["rest", "rest"]);
  assert.deepStrictEqual(plain(a.said), [failed]);
  assert.strictEqual(c._restOffer, null);
  assert.strictEqual(a.mine.rest_offer, false);
  replies.fn = () => Promise.resolve();
  await pick(c, a, false);
  await pick(c, a, true);
  assert.strictEqual(c._restOffer?.device, "pip");
  // The answer itself rejected: the message.
  ({ c, a } = await setup((m) => (m.type === "virtual_pet/rest_offer" ? Promise.reject(new Error("no")) : Promise.resolve())));
  assert.deepStrictEqual(plain(a.said), [failed]);
  assert.strictEqual(a.mine.rest_offer, false);
  // No retry button: the row has the two answers only.
  assert.strictEqual((method("_restOfferRow").match(/button\("/g) || []).length, 2);
});

test("29i: leaving the sheet is not an answer, and the offer comes again at the next first pick", async () => {
  const { card, calls } = load();
  const c = card(THREE);
  const [a] = c._slides;
  await pick(c, a);
  c._restOffer = null; // the sheet's back or close (their handlers, 29e)
  assert.ok(!types(calls).includes("rest_offer"));
  await pick(c, a, false);
  await pick(c, a, true);
  assert.strictEqual(c._restOffer?.device, "pip");
  assert.ok(!types(calls).includes("rest_offer"));
});
