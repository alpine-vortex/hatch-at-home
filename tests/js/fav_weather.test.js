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
  ${grab(/\nconst MEMORY_TOLD = \{[\s\S]*?\n\};\n/)}
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
  // Door 6's line (memory plan M1b) only when the note says told; else the turn's.
  assert.match(src, /fav_weather: \(n, device\) => \(n\.told && MEMORY_TOLD\[n\.weather\]\) \|\| turnPick\(FAV_WEATHER_LINES\[n\.weather\], `\$\{device\}\|favweather`\)/);
  assert.match(src, /NOTES\[note\.kind\]\?\.\(note, s\.ids\?\.device\)/);
  for (const w of WEATHERS) assert.ok(TABLE[w].includes(NOTE({ weather: w }, "dev1")), w);
});

test("each weather has 4 lines, and none repeats back to back", () => {
  // turnPick's promise (turn_pick.test.js). Not "no repeat within 3 days": a cycle's end can
  // meet the next cycle's start two days on (a, b | a), for n = 4 as for n = 3. Held to
  // the first mate to decide (the report); the memory plan's M0-b acceptance wording asks more.
  for (const w of WEATHERS) assert.strictEqual(TABLE[w].length, 4, w);
  for (const [w, list] of Object.entries(TABLE)) {
    for (const salt of ["dev1|favweather", "dev2|favweather", "x|favweather"]) {
      for (let start = 0; start < 120; start++) {
        const run = Array.from({ length: 5 }, (_, i) => turnPick(list, salt, day(start + i)));
        for (let i = 1; i < run.length; i++) assert.notStrictEqual(run[i], run[i - 1], `${w} ${salt} @${start}`);
      }
    }
  }
});
