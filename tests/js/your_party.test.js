// Birthday plan 3.1-3.5: your own party day. Source-shape tests (the card needs a browser): the
// trigger is the server's count, the guard sits ahead of the season's branches, one party when the
// pet's birthday is the same day, the copy is the plan's, décor props are aria-hidden (the cake is a button) and not the pet.
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

test("the trigger is the server's count, never the browser's date, never shared or an egg", () => {
  const on = method("_yourPartyOn");
  assert.match(on, /sharedScreen\(\)/);
  assert.match(on, /s\.egg/);
  assert.match(on, /_birthdayPrefs\(s\)\.days === 0/);
  assert.doesNotMatch(on, /new Date|getDate/);
  assert.match(method("_yourPartyKey"), /hatch-yourparty-\$\{tag\}\$\{s\.ids\?\.device\}-\$\{this\._hass\.user\?\.id\}-\$\{this\._birthdayPrefs\(s\)\.year\}/);
  assert.match(method("_yourPartyFirst"), /_yourPartyKey\(s, tag\)/);
});

test("the guard is ahead of the countdown, visitor, treat and costume branches", () => {
  const tick = method("_seasonTick");
  const guard = tick.indexOf("if (this._yourPartyOn(s)) return;");
  assert.ok(guard > 0);
  for (const later of ["season.countdown", "season.visitor", "treatDay", "nextCostume"]) {
    assert.ok(tick.indexOf(later, guard) > guard, later);
  }
  assert.ok(tick.indexOf("_seasonTreat") > guard && tick.indexOf("_costume(") > guard);
});

test("the pet's own party yields: one party, one hat, the line says both", () => {
  assert.match(method("_partyTick"), /if \(this\._yourPartyTick\(s\)\) return;/);
  assert.match(method("_yourPartyTick"), /both \? PARTY_BOTH/);
  assert.match(src, /const PARTY_BOTH = "it's your birthday AND mine!!";/);
});

test("the copy is the plan's, and the name goes in or the line goes without", () => {
  const ctx = vm.createContext({});
  vm.runInContext(`${grab(/\nconst PARTY_YOURS = \[[\s\S]*?\];\n/)}${grab(/\nfunction yourPartyLine\([\s\S]*?\n\}\n/)}this.api = { PARTY_YOURS, yourPartyLine };`, ctx);
  const { yourPartyLine } = ctx.api;
  assert.deepStrictEqual([...ctx.api.PARTY_YOURS], ["best day of the year! it's {n}'s birthday!", "make a wish, {n}! ♥",
    "i saved you the biggest slice ♪", "party party party!! ♪", "you're the best, {n} ♥"]);
  assert.strictEqual(yourPartyLine("make a wish, {n}! ♥", "Bee"), "make a wish, Bee! ♥");
  assert.strictEqual(yourPartyLine("best day of the year! it's {n}'s birthday!", "Bee"), "best day of the year! it's Bee's birthday!");
  for (const l of ctx.api.PARTY_YOURS) assert.ok(!/\{n\}/.test(yourPartyLine(l, "")), l);
  assert.strictEqual(yourPartyLine("best day of the year! it's {n}'s birthday!", ""), "best day of the year! it's your birthday!");
});

test("the first line is the big one, 6 s, with the birthday chirp", () => {
  assert.match(src, /HAPPY BIRTHDAY\$\{name \? `, \$\{name\.toUpperCase\(\)\}` : ""\}!!! 🎂/);
  assert.match(src, /ms: party \? 6000 : 5000/);
  assert.match(src, /_chirp\(s, "birthday"\)/);
});

test("props are aria-hidden, stand beside the pet, and calm() keeps confetti away", () => {
  const props = method("_yourPartyProps");
  assert.match(props, /class="yp-bunting" aria-hidden="true"/);
  assert.match(props, /class="yp-balloons" aria-hidden="true"/);
  assert.doesNotMatch(props, /el\.setAttribute\("aria-hidden"/); // the cake button stays reachable
  assert.match(props, /party_bunting\.png[\s\S]*party_balloons\.png[\s\S]*party_cake_\$\{/);
  assert.match(method("_confetti"), /if \(calm\(\)\) return;/);
  assert.match(method("_greet"), /_yourPartyOn\(s\)\) this\._yourPartyConfetti\(s\)/);
  assert.match(src, /\.yparty \.yp-balloons \{[^}]*animation: yp-bob/);
  assert.doesNotMatch(src, /\.pet\.yp-/);
});

test("4.1: the cake is a button that blows the candles out, once a day, with the plan's line", () => {
  const props = method("_yourPartyProps");
  assert.match(props, /<button type="button" class="yp-cake" aria-label="blow out the candles">/);
  assert.match(props, /e\.stopPropagation\(\)/);
  const blow = method("_blowOut");
  assert.match(blow, /_candlesOut\(s\)/);
  assert.match(blow, /_yourPartyFirst\(s, "candles-"\)/);
  assert.match(blow, /_patLean\(s, "l"/);
  assert.match(blow, /_confetti\(s\)[\s\S]*_chirp\(s, "birthday"\)[\s\S]*PARTY_WISH/);
  assert.match(src, /const PARTY_WISH = "yay!! now your wish comes true ♥";/);
  assert.match(method("_cakeSpent"), /party_cake_lit[\s\S]*party_cake_out/);
});

test("4.2: the feed scene serves the slice on party day, and says the plan's line", () => {
  assert.match(src, /if \(this\._yourPartyOn\(s\) \|\| sc\.leftovers\) \{\s*sc\.bowl\.dataset\.cake = "1";[\s\S]*?party_cake_slice\.png/);
  assert.match(method("_bowlClip"), /if \(img\.dataset\.cake\) return false;/);
  assert.match(method("_mealLine"), /_yourPartyOn\(s\)\) return \[PARTY_CAKE, 2500\]/);
  assert.match(src, /const PARTY_CAKE = "birthday cake for breakfast! ♪";/);
});
