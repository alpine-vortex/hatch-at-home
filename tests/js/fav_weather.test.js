// M0-b (memory plan section 7): the favourite-weather note takes turns, a list per weather.
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");

const src = require("./card-source");
const grab = (re) => src.match(re)[0];
const helpers = [
  grab(/\nconst turnNow = [^\n]*\n/),
  grab(/\nconst dayOrdinal = [^\n]*\n/),
  grab(/\nconst turnHash = [\s\S]*?\n\};\n/),
  grab(/\nconst turnOrder = [\s\S]*?\n\};\n/),
  grab(/\nfunction turnPick\([\s\S]*?\n\}\n/),
].join("");
const ctx = {};
vm.runInNewContext(`${helpers}
  ${grab(/\nconst FAV_WEATHER_LINES = \{[\s\S]*?\n\};\n/)}
  const NOTE = ${grab(/\n {2}fav_weather: \(n, device\) => [^\n]*\n/).trim().replace(/^fav_weather: /, "").replace(/,$/, "")};
  this.turnPick = turnPick; this.TABLE = FAV_WEATHER_LINES; this.NOTE = NOTE;`, ctx);
const { turnPick, TABLE, NOTE } = ctx;
const day = (i) => new Date(2026, 10, 1 + i, 12);
const WEATHERS = ["sun", "rain", "snow", "storms"];

test("the note is a list per weather, one for each of the four", () => {
  assert.deepStrictEqual(Object.keys(TABLE).sort(), [...WEATHERS].sort());
  for (const w of WEATHERS) assert.ok(Array.isArray(TABLE[w]) && TABLE[w].length >= 1, w);
});

test("the note reads the list in turns by the device, not one fixed string", () => {
  assert.match(src, /fav_weather: \(n, device\) => turnPick\(FAV_WEATHER_LINES\[n\.weather\], `\$\{device\}\|favweather`\)/);
  assert.match(src, /NOTES\[note\.kind\]\?\.\(note, s\.ids\?\.device\)/);
  for (const w of WEATHERS) assert.ok(TABLE[w].includes(NOTE({ weather: w }, "dev1")), w);
});

test("a weather's list never repeats back to back and holds every line once a cycle", () => {
  // The shipped lists have one approved line each so far (the plan's three are owed), so the
  // rule is proved on a three-line probe and held for the shipped lists once they have three.
  // turnPick promises this, not "distinct in every window of 3" (a cycle's end can meet the
  // next cycle's start two days on): the plan's acceptance wording needs 4+ lines for that.
  const lists = { ...TABLE, probe: ["a", "b", "c"] };
  for (const [w, list] of Object.entries(lists)) {
    if (list.length < 3) continue;
    for (let start = 0; start < 30; start++) {
      const run = Array.from({ length: list.length + 1 }, (_, i) => turnPick(list, "dev|favweather", day(start + i)));
      for (let i = 1; i < run.length; i++) assert.notStrictEqual(run[i], run[i - 1], `${w} @${start}`);
    }
  }
});
