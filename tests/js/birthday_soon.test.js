// Birthday plan 2.1-2.3: the countdown's copy, its name rule, the idle line's gates and its
// once-a-day keys (the server's year and count, never the browser's date).
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");

const src = require("./card-source");
const grab = (re) => src.match(re)[0];

function method(name) {
  const start = src.indexOf(`\n  ${name}(`);
  assert.ok(start >= 0, name);
  const end = src.indexOf("\n  }\n", start) + 4;
  return src.slice(start, end);
}

const ctx = vm.createContext({ Date, Math, Number, String, Map, Set, Object, console });
vm.runInContext(`
  ${grab(/\nconst BIRTHDAY_SOON = \{[\s\S]*?\n\};\n/)}
  ${grab(/\nconst BIRTHDAY_SOON_IDLE_MAX = [^\n]*\n/)}
  ${grab(/\nconst BIRTHDAY_SOON_EVERY_MS = [^\n]*\n/)}
  ${grab(/\nfunction birthdaySoonLine\([\s\S]*?\n\}\n/)}
  ${grab(/\nfunction usedUpTo\([\s\S]*?\n\}\n/)}
  this.api = { BIRTHDAY_SOON, birthdaySoonLine, usedUpTo, MAX: BIRTHDAY_SOON_IDLE_MAX, EVERY: BIRTHDAY_SOON_EVERY_MS };
`, ctx);
const { birthdaySoonLine, usedUpTo, MAX } = ctx.api;
const EVERY = [...ctx.api.EVERY];
const BIRTHDAY_SOON = JSON.parse(JSON.stringify(ctx.api.BIRTHDAY_SOON)); // out of the vm realm

test("the table has every count, at least three lines each, all distinct", () => {
  assert.deepStrictEqual(Object.keys(BIRTHDAY_SOON), ["1", "2", "3", "4", "5"]);
  for (const [d, list] of Object.entries(BIRTHDAY_SOON)) {
    assert.ok(list.length >= 3, `day ${d}: ${list.length} lines`); // the note plus two idles, no repeat
    assert.strictEqual(new Set(list).size, list.length, `day ${d}: a line twice`);
  }
  assert.ok(BIRTHDAY_SOON[5].includes("psst {n}... your birthday is in 5 days! ♪"));
  assert.ok(BIRTHDAY_SOON[1].includes("tomorrow's your birthday, {n}!! ♥"));
});

test("an idle line is never the one just said", () => {
  assert.match(src, /s\.lastBdaySoon = line;[\s\S]*?birthdaySoonLine\(line/);
  assert.match(method("_birthdaySoonTick"), /filter\(\(l\) => l !== s\.lastBdaySoon\)/);
});

test("the name goes in, or the line goes without it", () => {
  assert.strictEqual(birthdaySoonLine("2 days to go, {n}! i can't sit still!", "Bee"), "2 days to go, Bee! i can't sit still!");
  assert.strictEqual(birthdaySoonLine("2 days to go, {n}! i can't sit still!", ""), "2 days to go! i can't sit still!");
  assert.strictEqual(birthdaySoonLine("psst {n}... your birthday is in 5 days! ♪", ""), "psst... your birthday is in 5 days! ♪");
  assert.strictEqual(birthdaySoonLine("tomorrow's your birthday, {n}!! ♥", null), "tomorrow's your birthday!! ♥");
  for (const list of Object.values(BIRTHDAY_SOON)) for (const l of list) assert.ok(!birthdaySoonLine(l, "").includes("{n}"), l);
});

test("a count is kept per key up to the cap, and keys are separate", () => {
  assert.strictEqual(MAX, 2);
  assert.ok(usedUpTo("k-a", 2));
  assert.ok(usedUpTo("k-a", 2));
  assert.ok(!usedUpTo("k-a", 2));
  assert.ok(usedUpTo("k-b", 2)); // another year or count: its own
});

test("the note takes the name rule, call_me then nickname then first name, only for birthday lines", () => {
  const name = method("_birthdayName");
  assert.match(name, /callMe[\s\S]*bond\?\.level >= BOND\.nickname[\s\S]*this\._hass\.user\?\.name/);
  assert.match(src, /your_birthday"\) \{\s*const name = this\._birthdayName\(s\)/);
  assert.match(src, /note\.kind === "birthday_soon"\) \{[\s\S]*?this\._birthdayName\(s\)/);
  // No other line reads call_me.
  const users = [...src.matchAll(/call_me|callMe/g)].length;
  assert.ok(users > 0);
  assert.ok(!/callMe/.test(method("_speak")) && !/callMe/.test(method("_queue")));
});

function card(extra = {}) {
  const log = [];
  const c = {
    _hass: { user: { id: "u1", name: "Sam Smith" } },
    _free: () => true,
    _speak: (s, line) => log.push(["say", line]),
    _chirp: (s, name) => log.push(["chirp", name]),
    _bond: () => null,
    log,
    ...extra,
  };
  const run = vm.createContext({ ...ctx, sharedScreen: () => false, short: (v) => v, BOND: { nickname: 3 }, pick: (l) => l[0],
    BIRTHDAY_SOON, BIRTHDAY_SOON_EVERY_MS: EVERY, BIRTHDAY_SOON_IDLE_MAX: MAX, birthdaySoonLine, usedUpTo, Date });
  vm.runInContext(`this.m = { ${["_birthdayPrefs", "_birthdaySoonTick", "_birthdayName"].map((n) => method(n).trim()).join(",\n")} };`, run);
  Object.assign(c, run.m);
  return c;
}
const slide = (mine, extra = {}) => ({ ids: { device: "dev1" }, mine, nextBdaySoon: 1, ...extra });

test("mine's count and year are read, and a shared screen has none", () => {
  const c = card();
  assert.deepStrictEqual({ ...c._birthdayPrefs(slide({ birthday_in: 3, birthday_year: "2026", call_me: "Bee" })) }, { days: 3, year: "2026", callMe: "Bee" });
  assert.strictEqual(c._birthdayPrefs(slide({})).days, null); // mine has spoken: none
  assert.strictEqual(c._birthdayPrefs(slide({ birthday_in: 9, birthday_year: "2026" })).days, null);
  assert.strictEqual(c._birthdayPrefs(slide({ birthday_in: 2 })).days, null); // no year: not trusted
  // Before the channel speaks: the visit's reply.
  assert.strictEqual(c._birthdayPrefs(slide(null, { bdayReply: { in: 4, year: "2027", callMe: null } })).days, 4);
});

test("an idle line: only when free, capped per count, a chirp on the last day", () => {
  const c = card();
  const s = slide({ birthday_in: 1, birthday_year: "2026", call_me: "Bee" });
  c._birthdaySoonTick(s);
  assert.deepStrictEqual(c.log, [["say", "tomorrow's your birthday, Bee!! ♥"], ["chirp", "tap"]]);
  assert.ok(s.nextBdaySoon > Date.now()); // the next one is later
  s.nextBdaySoon = 1;
  c._birthdaySoonTick(s);
  s.nextBdaySoon = 1;
  c._birthdaySoonTick(s); // the third: over the cap
  assert.strictEqual(c.log.filter((l) => l[0] === "say").length, MAX);
  // Another count is another key.
  const t = slide({ birthday_in: 2, birthday_year: "2026" });
  c._birthdaySoonTick(t);
  assert.strictEqual(c.log.filter((l) => l[0] === "say").length, MAX + 1);
  assert.ok(!c.log.some((l) => l[0] === "chirp" && l !== c.log[1]) || c.log.filter((l) => l[0] === "chirp").length === MAX);
});

test("no idle line when busy, an egg or resting, on 0 or no count", () => {
  const mine = { birthday_in: 3, birthday_year: "2026" };
  for (const [what, c, s] of [
    ["busy", card({ _free: () => false }), slide(mine)],
    ["egg", card(), slide(mine, { egg: true })],
    ["resting", card(), slide(mine, { resting: true })],
    ["day 0", card(), slide({ birthday_in: 0, birthday_year: "2026" })],
    ["none", card(), slide({})],
    ["not yet", card(), slide(mine, { nextBdaySoon: Date.now() + 60000 })],
  ]) {
    c._birthdaySoonTick(s);
    assert.deepStrictEqual([...c.log], [], what);
  }
});

test("the keys carry the server's year and count, never the browser's date", () => {
  const tick = method("_birthdaySoonTick");
  assert.match(tick, /usedUpTo\(`bdaysoon-\$\{s\.ids\?\.device\}-\$\{this\._hass\.user\.id\}-\$\{year\}-\$\{days\}`/);
  assert.ok(!/oncePerDay|toDateString|new Date/.test(tick));
  assert.match(src, /this\._birthdaySoonTick\(s\);/); // card-tick calls it
});
