// visitorDay (the card's world-visitor seed) and visitorMissed (the catch-up's pick) as pure functions: node --test tests/js
// The card isn't a module: the function and VISITORS are read from its source.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8");
const fn = src.match(/\nfunction visitorDay\([\s\S]*?\n\}\n/)[0];
const table = src.match(/\nconst VISITORS = (\{[\s\S]*?\n\});/)[1];
const missedFn = src.match(/\nfunction visitorMissed\([\s\S]*?\n\}\n/)[0];
const ctx = {};
vm.runInNewContext(`${fn}; ${missedFn}; this.visitorDay = visitorDay; this.visitorMissed = visitorMissed; this.VISITORS = ${table};`, ctx);
const { visitorDay, visitorMissed, VISITORS } = ctx;

const START = new Date(2026, 0, 1, 12);
const days = (n, from = START) => Array.from({ length: n }, (_, i) => new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, 12));
const DEVICES = ["a1b2c3", "dev-pet-2", "0f9e8d7c6b5a", ""];

test("4 visit days in every 7, over a year", () => {
  for (const device of DEVICES) {
    const year = days(365).map((d) => visitorDay(d, device).visit);
    for (let i = 0; i + 7 <= year.length; i++) assert.strictEqual(year.slice(i, i + 7).filter(Boolean).length, 4, `${device} @${i}`);
  }
});

test("every visitor comes within any 21 days", () => {
  for (const device of DEVICES) {
    const year = days(365 + 21).map((d) => visitorDay(d, device));
    for (let i = 0; i + 21 <= year.length; i++) {
      const who = new Set(year.slice(i, i + 21).filter((d) => d.visit).map((d) => d.who));
      assert.deepStrictEqual([...who].sort(), [0, 1, 2], `${device} @${i}`);
    }
  }
});

test("the same date and device give the same day, at any hour", () => {
  for (const d of days(60)) {
    const a = visitorDay(d, "a1b2c3");
    const b = visitorDay(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 1), "a1b2c3");
    const c = visitorDay(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59), "a1b2c3");
    assert.deepStrictEqual(a, b);
    assert.deepStrictEqual(a, c);
  }
});

test("two devices don't keep the same days", () => {
  const a = days(28).map((d) => JSON.stringify(visitorDay(d, "a1b2c3")));
  const b = days(28).map((d) => JSON.stringify(visitorDay(d, "dev-pet-2")));
  assert.notDeepStrictEqual(a, b);
});

test("windows: day starts 9-15 (ends by 18), night 19 or 20 (ends by 23), and they vary", () => {
  const all = days(365).map((d) => visitorDay(d, "a1b2c3"));
  for (const d of all) {
    assert.ok(d.day >= 9 && d.day + 3 <= 18, `day ${d.day}`);
    assert.ok(d.night === 19 || d.night === 20, `night ${d.night}`);
  }
  assert.ok(new Set(all.map((d) => d.day)).size >= 5);
  assert.strictEqual(new Set(all.map((d) => d.night)).size, 2);
});

test("across the DST change each date is its own day", () => {
  // Day indexes from the calendar date: consecutive dates differ by exactly one.
  const march = days(20, new Date(2026, 2, 1));
  const idx = march.map((d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5));
  for (let i = 1; i < idx.length; i++) assert.strictEqual(idx[i] - idx[i - 1], 1);
  const vis = march.map((d) => visitorDay(d, "a1b2c3").visit);
  for (let i = 0; i + 7 <= vis.length; i++) assert.strictEqual(vis.slice(i, i + 7).filter(Boolean).length, 4);
});

test("VISITORS: 3 a world, 6 worlds, two lines each, day or night", () => {
  assert.deepStrictEqual(Object.keys(VISITORS).sort(), ["hearth", "nightsky", "pond", "terrarium", "tidepool", "woodland"]);
  for (const list of Object.values(VISITORS)) {
    assert.strictEqual(list.length, 3);
    for (const v of list) {
      assert.ok(["day", "night"].includes(v.hours), v.id);
      assert.strictEqual(v.lines.length, 2, v.id);
      for (const n of [1, 2]) {
        const file = path.join(__dirname, "..", "..", "custom_components", "virtual_pet", "frontend", "ui", `visitor_${Object.keys(VISITORS).find((w) => VISITORS[w] === list)}_${v.id}_${n}.png`);
        assert.ok(fs.existsSync(file), file);
      }
    }
  }
});

test("visitorMissed: only on a visit day, once that visitor's window is over, until midnight", () => {
  let dayCase = 0;
  let nightCase = 0;
  for (const world of Object.keys(VISITORS)) {
    const list = VISITORS[world];
    for (const d of days(28)) {
      const at = (h) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 30);
      const seed = visitorDay(d, "a1b2c3");
      if (!seed.visit) {
        for (let h = 0; h < 24; h++) assert.strictEqual(visitorMissed(list, at(h), "a1b2c3"), null);
        continue;
      }
      const v = list[seed.who];
      const start = v.hours === "night" ? seed.night : seed.day;
      if (v.hours === "night") nightCase++;
      else dayCase++;
      for (let h = 0; h < 24; h++) {
        const got = visitorMissed(list, at(h), "a1b2c3");
        assert.strictEqual(got, h >= start + 3 ? v : null, `${world} ${d.toDateString()} ${h}:30 (start ${start})`);
      }
    }
  }
  assert.ok(dayCase > 0 && nightCase > 0);
  assert.strictEqual(visitorMissed(undefined, new Date(), "a1b2c3"), null); // a world with no visitors
});

test("VISITORS: a name each (the catch-up's 'a <name>'), the shooting star its own line", () => {
  for (const list of Object.values(VISITORS)) {
    for (const v of list) {
      assert.ok(typeof v.name === "string" && /^[^aeiouAEIOU]/.test(v.name), v.id); // "a", never "an"
    }
  }
  const star = VISITORS.nightsky.find((v) => v.id === "shootingstar");
  assert.strictEqual(star.catchup, "a shooting star went by! ♪");
  assert.strictEqual(VISITORS.hearth.find((v) => v.id === "robin").name, "robin");
  assert.strictEqual(VISITORS.woodland.find((v) => v.id === "stellersjay").name, "Steller's jay");
});
