// The bedtime row's time line (settings S7, N21): node --test tests/js
// sleepLine is read from the card's source. 12/24 follow HA's time format; a language tag the
// browser rejects falls back to the default locale instead of blanking the sheet.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8");
const ctx = {};
vm.runInNewContext(`${src.match(/\nfunction sleepLine\([\s\S]*?\n\}\n/)[0]}\nthis.sleepLine = sleepLine;`, ctx);
const { sleepLine } = ctx;
const times = { bedtime: "23:00", wake: "07:05" };

test("24 hour and 12 hour follow HA's setting", () => {
  assert.match(sleepLine(times, { locale: { language: "en", time_format: "24" } }), /^about 23:00 · up 07:05$/);
  assert.match(sleepLine(times, { locale: { language: "en", time_format: "12" } }), /^about 11:00 pm · up 7:05 am$/);
});

test("a language tag the browser rejects still draws a line", () => {
  for (const language of ["en_US", "not a tag", "x"]) {
    const line = sleepLine(times, { locale: { language, time_format: "24" } });
    assert.match(line, /^about .*23.*00.* · up .*07.*05/, line);
  }
});

test("no locale at all still draws a line; system ignores HA's language", () => {
  assert.match(sleepLine(times, undefined), /^about .*11.*00/);
  assert.match(sleepLine(times, { locale: { language: "en_US", time_format: "system" } }), /^about /);
});
