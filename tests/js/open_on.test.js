// The favourite, R2 (docs/plan-2026-11-02-favourite-resting.md §5.3, tests 23 and 28):
// node --test tests/js
// A copy of the person's choice opens the card on its pet, even over the shelf's place; with
// none, the shelf. A swipe holds till the next load. Every snapshot refreshes the copy, and it
// goes when no pet reports it. A shared screen opens on the house default (its own copy). No
// heart on a shared screen; no row with one pet. "Forget my data" takes the copy.
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");

const src = require("./card-source");
const grab = (re) => {
  const m = src.match(re);
  assert.ok(m, `not in the card: ${re}`);
  return m[0];
};
const method = (name) => grab(new RegExp(`\\n  ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`)).trim();

// The card's own code, run on a fake browser.
function load() {
  const store = new Map();
  const session = new Map();
  const ctx = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    sessionStorage: {
      getItem: (k) => (session.has(k) ? session.get(k) : null),
      setItem: (k, v) => session.set(k, String(v)),
    },
    clock: { now: 0 },
  };
  ctx.Date = { now: () => ctx.clock.now };
  const go = grab(/    if \(this\._shelfRestored && this\._shelfDevices\) \{\n      shelfWrite[\s\S]*?\n    \}\n/).replace(/\bto\b/, "index");
  const restore = grab(/if \(!this\._shelfRestored\) \{[\s\S]*?\n {4}\}\n/);
  vm.runInNewContext([
    grab(/\nconst SHARED_KEY = [^\n]*\n/),
    grab(/\nfunction sharedScreen\(\) \{[\s\S]*?\n\}\n/),
    grab(/\nconst OPEN_ON_WAIT_MS = [^\n]*\n/),
    grab(/\nfunction openOnKey\([\s\S]*?\n\}\n/),
    grab(/\nfunction openOnRead\([\s\S]*?\n\}\n/),
    grab(/\nfunction openOnWrite\([\s\S]*?\n\}\n/),
    grab(/\nfunction shelfKey\([\s\S]*?\n\}\n/),
    grab(/\nfunction shelfRead\([\s\S]*?\n\}\n/),
    grab(/\nfunction shelfWrite\([\s\S]*?\n\}\n/),
    grab(/\nfunction shelfMark\([\s\S]*?\n\}\n/),
    grab(/\nfunction shelfSwiped\([\s\S]*?\n\}\n/),
    // A card with the methods this needs: its first draw, a swipe, and the channel's sync.
    `function makeCard(user, devices) {
      const card = {
        _hass: { user: { id: user } },
        _index: 0,
        _slides: devices.map((device) => ({ ids: { device } })),
        _restore(devices) { ${restore} },
        _go(index, auto = false) {
          this._userMoved = true;
          this._index = index;
          ${go}
        },
        ${method("_openKey")},
        ${method("_openOnSync")},
      };
      return card;
    }`,
    "this.out = { makeCard, openOnKey };",
  ].join("\n"), ctx);
  const { makeCard, openOnKey } = ctx.out;
  // A page load: the card's first draw over these devices.
  const open = (user, devices) => {
    const card = makeCard(user, devices);
    const list = devices.map((device) => ({ device }));
    card._restore(list);
    card._shelfDevices = devices;
    return card;
  };
  // A slide's snapshot: what its channel says.
  const hear = (card, i, view) => {
    Object.assign(card._slides[i], { subscribed: true }, view);
    card._openOnSync();
  };
  return { store, session, ctx, open, hear, openOnKey };
}

const PETS = ["dev-pip", "dev-bo", "dev-moss"];

test("a kept choice opens the card on its pet, even over the shelf's place", () => {
  const { store, open } = load();
  store.set("hatch-shelf-dev-pip", "dev-moss"); // on show before the reload
  store.set("hatch-open-u1", "dev-bo");
  assert.strictEqual(open("u1", PETS)._index, 1);
  // Another person's choice is theirs: u2 opens on the shelf.
  assert.strictEqual(open("u2", PETS)._index, 2);
  // A choice of a pet this card doesn't hold: the shelf.
  store.set("hatch-open-u1", "dev-gone");
  assert.strictEqual(open("u1", PETS)._index, 2);
});

test("with no choice, the shelf; with neither, the first", () => {
  const { store, open } = load();
  assert.strictEqual(open("u1", PETS)._index, 0);
  store.set("hatch-shelf-dev-pip", "dev-bo");
  assert.strictEqual(open("u1", PETS)._index, 1);
});

test("a swipe holds against the snapshots, and a new browser session opens on the choice again", () => {
  const { store, session, open, hear } = load();
  store.set("hatch-open-u1", "dev-bo");
  const card = open("u1", PETS);
  card._go(2);
  hear(card, 1, { mine: { open_on: true } }); // the snapshot doesn't move it back
  assert.strictEqual(card._index, 2);
  assert.strictEqual(store.get("hatch-shelf-dev-pip"), "dev-moss");
  session.clear(); // a new session (the swipe flag is the session's)
  assert.strictEqual(open("u1", PETS)._index, 1);
});

test("after a swipe in this browser session, the shelf wins over the choice (FM, audit s2748)", () => {
  const { store, session, open, hear } = load();
  store.set("hatch-open-u1", "dev-bo");
  const card = open("u1", PETS);
  assert.strictEqual(card._index, 1); // no swipe yet: the choice
  card._go(2);
  assert.strictEqual(session.get("hatch-shelf-dev-pip-swiped"), "1");
  // The card is made again (a view switch): back where they swiped, not on the choice.
  assert.strictEqual(open("u1", PETS)._index, 2);
  // A new session (the flag gone) opens on the choice again.
  session.clear();
  assert.strictEqual(open("u1", PETS)._index, 1);
  // The opening pet's own late move is not a swipe.
  const { ctx, session: s2, open: open2, hear: hear2 } = load();
  ctx.clock.now = 10000;
  const late = open2("u1", PETS);
  late._go(2, true);
  assert.strictEqual(s2.size, 0);
});

test("the first time, the channel moves the card only early and before a swipe", () => {
  const { ctx, open, hear } = load();
  ctx.clock.now = 10000;
  const card = open("u1", PETS);
  ctx.clock.now += 400;
  hear(card, 0, { mine: { open_on: false } });
  hear(card, 2, { mine: { open_on: true } });
  assert.strictEqual(card._index, 2);
  // Too late: it stays (the copy is kept for the next load).
  const { ctx: ctx2, store: store2, open: open2, hear: hear2 } = load();
  ctx2.clock.now = 10000;
  const late = open2("u1", PETS);
  ctx2.clock.now += 2000;
  hear2(late, 2, { mine: { open_on: true } });
  assert.strictEqual(late._index, 0);
  assert.strictEqual(store2.get("hatch-open-u1"), "dev-moss");
  // Swiped first: it stays.
  const { ctx: ctx3, open: open3, hear: hear3 } = load();
  ctx3.clock.now = 10000;
  const swiped = open3("u1", PETS);
  swiped._go(1);
  hear3(swiped, 2, { mine: { open_on: true } });
  assert.strictEqual(swiped._index, 1);
});

test("every snapshot refreshes the copy, and it goes when no pet reports it", () => {
  const { store, open, hear } = load();
  store.set("hatch-open-u1", "dev-pip");
  const card = open("u1", PETS);
  // Changed on another phone: Bo reports it, Pip no longer does.
  hear(card, 1, { mine: { open_on: true } });
  assert.strictEqual(store.get("hatch-open-u1"), "dev-bo");
  hear(card, 0, { mine: { open_on: false } });
  assert.strictEqual(store.get("hatch-open-u1"), "dev-bo");
  // Cleared: the pet that held it says no, and none other says yes.
  hear(card, 1, { mine: { open_on: false } });
  hear(card, 2, { mine: { open_on: false } });
  assert.strictEqual(store.has("hatch-open-u1"), false);
  // A slide not heard yet doesn't clear another's copy.
  const fresh = load();
  fresh.store.set("hatch-open-u1", "dev-moss");
  const other = fresh.open("u1", PETS);
  fresh.hear(other, 0, { mine: { open_on: false } });
  assert.strictEqual(fresh.store.get("hatch-open-u1"), "dev-moss");
});

test("a shared screen opens on the house default, under its own copy", () => {
  const { store, open, hear } = load();
  store.set("hatch-shared-screen", "on");
  store.set("hatch-open-u1", "dev-pip"); // the signed-in person's: not on a shared screen
  store.set("hatch-shelf-dev-pip", "dev-bo");
  assert.strictEqual(open("u1", PETS)._index, 1); // no house default: the shelf
  const card = open("u1", PETS);
  hear(card, 2, { mine: null, house: { house_open_on: true } });
  assert.strictEqual(store.get("hatch-open-house"), "dev-moss");
  assert.strictEqual(store.get("hatch-open-u1"), "dev-pip"); // untouched
  assert.strictEqual(open("u1", PETS)._index, 2);
  // A personal mine on a shared screen is never read (the card nulls it, as here).
  hear(card, 2, { mine: { open_on: true }, house: { house_open_on: false } });
  assert.strictEqual(store.has("hatch-open-house"), false);
});

test("no heart on a shared screen or with one pet; the row needs two pets", () => {
  assert.match(src, /dot\.classList\.toggle\("open-on", this\._slides\.length > 1 && !sharedScreen\(\) && this\._slides\[i\]\.mine\?\.open_on === true\)/);
  assert.match(src, /\.dot\.open-on::after \{ content: "♥"/);
  // The settings rows, run as the sheet runs them.
  const block = grab(/const petName = escape\(this\._linkName\(s\)\);[\s\S]*?: ""\);\n/);
  const ctx = {};
  vm.runInNewContext([
    grab(/\nconst SHARED_KEY = [^\n]*\n/),
    grab(/\nfunction sharedScreen\(\) \{[\s\S]*?\n\}\n/),
    grab(/\nfunction escape\([\s\S]*?\n\}\n/),
    grab(/\nconst OPEN_ON_COPY = \{[\s\S]*?\n\};\n/),
    grab(/\nfunction spoken\([\s\S]*?\n\}\n/),
    `function rows(card, s) {
      const row = (iconName, label, value) => \`<div class="row srow"><span>\${label}</span>\${value}</div>\`;
      return (function () { ${block} return openOn; }).call(card);
    }`,
    "this.out = { rows };",
  ].join("\n"), Object.assign(ctx, {
    localStorage: { getItem: (k) => ctx.shared && k === "hatch-shared-screen" ? "on" : null },
  }));
  const card = (n, admin) => ({
    _hass: { user: { is_admin: admin } },
    _slides: Array.from({ length: n }, () => ({ ids: {} })),
    _linkName: () => "Pip",
  });
  const s = { mine: { open_on: true, house_open_on: false } };
  const two = ctx.out.rows(card(2, false), s);
  assert.match(two, /<span>♥ open on Pip<\/span>/);
  assert.match(two, /class="bell openon" aria-label="open on Pip" aria-pressed="true">on</);
  // The pet's own name is spoken as it is: a "~", a "*" or an emoji in it is not stripped.
  const odd = ctx.out.rows(Object.assign(card(2, true), { _linkName: () => "~Pip*🐣" }), s);
  assert.match(odd, /aria-label="open on ~Pip\*🐣"/);
  assert.match(odd, /aria-label="shared screens open on ~Pip\*🐣"/);
  // The dot says which pet the card opens on (FM copy), for the one only.
  assert.match(src, /\$\{opens \? ", your card opens here" : ""\}/);
  assert.doesNotMatch(two, /shared screens open on/); // not an admin
  const admin = ctx.out.rows(card(2, true), s);
  assert.match(admin, /<span>shared screens open on Pip<\/span>/);
  assert.match(admin, /class="bell openhouse"[^>]*aria-pressed="false">off</);
  assert.strictEqual(ctx.out.rows(card(1, true), s), ""); // one pet: no row
  assert.strictEqual(ctx.out.rows(card(2, true), { mine: {} }), ""); // an older server
  ctx.shared = true;
  assert.strictEqual(ctx.out.rows(card(3, true), s), ""); // a shared screen
  // No ranking word in the new lines (plan §1, checklist).
  for (const line of [two, admin]) assert.doesNotMatch(line, /favourite|best|main|top/i);
});

test("forget my data takes the choice, its copy and the heart", () => {
  assert.match(src, /for \(const key of \[[^\]]*"open_on"\]\) this\._setMine\(key, false\)/);
  assert.match(src, /localStorage\.removeItem\(openOnKey\(user, false\)\)/);
  const { openOnKey } = load();
  assert.strictEqual(openOnKey("u1", false), "hatch-open-u1");
  assert.strictEqual(openOnKey("u1", true), "hatch-open-house");
  assert.strictEqual(openOnKey(undefined, false), null);
  // The toggle calls the websocket with its scope.
  assert.match(src, /type: "virtual_pet\/open_on", entity_id: id, enabled, scope, shared: sharedScreen\(\)/);
  // The M0-c favourites go from every slide too (FM, audit s2739).
  assert.match(src, /for \(const key of \["fav_weather", "fav_season", "fav_visitor"\]\) this\._setMine\(key, null\)/);
});
