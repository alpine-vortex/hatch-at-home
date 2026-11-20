// Birthday plan 7.4: the day after your party. Mine's birthday_after (with the birthday's year) is
// read through _birthdayPrefs; the first look's thanks and the feed scene's leftover slice are each
// once, keyed on the device, the person and the server's year, never on a shared screen or an egg,
// never while the party is on.
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");

const src = require("./card-source");
const grab = (re) => src.match(re)[0];
function method(name) {
  const start = src.indexOf(`\n  ${name}(`);
  assert.ok(start >= 0, name);
  return src.slice(start, src.indexOf("\n  }\n", start) + 4);
}

function card({ shared = false, party = false, user = "u1" } = {}) {
  const store = new Map();
  const localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  const run = vm.createContext({ sharedScreen: () => shared, localStorage, Set });
  const names = ["_birthdayPrefs", "_leftoversYear", "_leftoversKey", "_leftoversDue", "_leftoversFirst"];
  vm.runInContext(`this.m = { ${names.map((n) => method(n).trim()).join(",\n")} };`, run);
  const c = { _hass: { user: user ? { id: user } : null }, _yourPartyOn: () => party, store, ...run.m };
  return c;
}
const slide = (mine, extra = {}) => ({ ids: { device: "dev1" }, species: {}, mine, ...extra });
const after = { birthday_after: true, birthday_after_year: "2026" };

test("mine's day after is read with its year, and a shared screen has none", () => {
  const c = card();
  assert.strictEqual(c._birthdayPrefs(slide(after)).after, "2026");
  assert.strictEqual(c._birthdayPrefs(slide(after)).days, null);
  assert.strictEqual(c._birthdayPrefs(slide({})).after, null);
  assert.strictEqual(c._birthdayPrefs(slide({ birthday_after: true })).after, null); // no year: not trusted
  assert.strictEqual(c._birthdayPrefs(slide({ birthday_after: "yes", birthday_after_year: "2026" })).after, null);
  assert.strictEqual(c._birthdayPrefs(slide({ birthday_after: true, birthday_after_year: "26" })).after, null);
  assert.strictEqual(c._birthdayPrefs(slide(null, { bdayReply: { after: "2027" } })).after, "2027"); // the visit's reply
  assert.strictEqual(card({ shared: true })._birthdayPrefs(slide(after)).after, null);
  assert.match(src, /after: reply\.birthday_after === true \? reply\.birthday_after_year : null/);
});

test("each leftover moment is once, keyed on device, person and the server's year", () => {
  const c = card();
  const s = slide(after);
  assert.strictEqual(c._leftoversKey(s, "look-"), "hatch-leftovers-look-dev1-u1-2026");
  assert.ok(c._leftoversDue(s, "look-"));
  assert.ok(c._leftoversFirst(s, "look-"));
  assert.ok(!c._leftoversFirst(s, "look-"));
  assert.ok(!c._leftoversDue(s, "look-"));
  assert.ok(c._leftoversDue(s, "cake-")); // the slice is its own once
  assert.ok(c._leftoversFirst(s, "cake-") && !c._leftoversFirst(s, "cake-"));
  // Next year's day after is another key.
  assert.ok(c._leftoversFirst(slide({ ...after, birthday_after_year: "2027" }), "look-"));
  // Another device is its own.
  assert.ok(c._leftoversFirst(slide(after, { ids: { device: "dev2" } }), "look-"));
  assert.doesNotMatch(method("_leftoversKey"), /new Date|toDateString/);
});

test("none on a shared screen, an egg, no user, no day after, or while the party is on", () => {
  for (const [what, c, s] of [
    ["shared", card({ shared: true }), slide(after)],
    ["egg", card(), slide(after, { egg: true })],
    ["no species", card(), slide(after, { species: null })],
    ["no user", card({ user: null }), slide(after)],
    ["not the day after", card(), slide({ birthday_in: 3, birthday_year: "2026" })],
    ["party on", card({ party: true }), slide(after)],
  ]) {
    assert.ok(!c._leftoversDue(s, "look-") && !c._leftoversFirst(s, "cake-"), what);
    assert.strictEqual(c.store.size, 0, what);
  }
});

test("the copy is the plan's, with the name or without it", () => {
  const ctx = vm.createContext({});
  vm.runInContext(`${grab(/\nconst LEFTOVERS = \{[^\n]*\n/)}${grab(/\nfunction yourPartyLine\([\s\S]*?\n\}\n/)}this.api = { LEFTOVERS, yourPartyLine };`, ctx);
  const { LEFTOVERS, yourPartyLine } = ctx.api;
  assert.strictEqual(LEFTOVERS.look, "best party ever!! thank you, {n} ♥");
  assert.strictEqual(LEFTOVERS.cake, "leftover cake! still yummy ♪");
  assert.strictEqual(yourPartyLine(LEFTOVERS.look, "Bee"), "best party ever!! thank you, Bee ♥");
  assert.strictEqual(yourPartyLine(LEFTOVERS.look, ""), "best party ever!! thank you ♥");
});

test("the first look says the thanks once, with the birthday name", () => {
  const look = method("_firstLook");
  // checked when queued, spent only when said (then), so a card closed first says it next time
  assert.match(look, /lines\.length < FIRST_LOOK_LINES && this\._leftoversDue\(s, "look-"\)\) \{[\s\S]*?lines\.push\(\[yourPartyLine\(LEFTOVERS\.look, this\._birthdayName\(s\)\), 5000, \{ then: \(\) => this\._leftoversFirst\(s, "look-"\) \}\]\)/);
});

test("the feed scene serves the party's slice once, and its line wins over the extra", () => {
  assert.match(src, /sc\.leftovers = this\._leftoversDue\(s, "cake-"\);\s*(\/\/[^\n]*\n\s*)?if \(this\._yourPartyOn\(s\) \|\| sc\.leftovers\) \{\s*sc\.bowl\.dataset\.cake = "1";/);
  assert.match(src, /if \(sc\.leftovers\) sc\.extra = "none";/);
  // Spent with its line, on an ok answer only.
  assert.match(src, /sc\.result === "ok" && once\("line"\)\) \{\s*const line = sc\.leftovers && this\._leftoversFirst\(s, "cake-"\) \? \[LEFTOVERS\.cake, 2500\]/);
  assert.doesNotMatch(method("_mealLine"), /LEFTOVERS/); // someone else's feed never spends it
});
