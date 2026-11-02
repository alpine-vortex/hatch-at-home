// The pet's own promise (fresh-expand F3): promiseDay's schedule, read from the card's
// source (it isn't a module): node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8");
const grab = (re) => src.match(re)[0];
const ctx = {};
vm.runInNewContext([
  grab(/\nconst dayOrdinal = [^\n]*\n/),
  grab(/\nconst turnHash = [\s\S]*?\n\};\n/),
  grab(/\nconst PROMISE_CYCLE = [^\n]*\n/),
  grab(/\nconst PROMISE_TOPICS = [^\n]*\n/),
  grab(/\nfunction promiseDay\([\s\S]*?\n\}\n/),
  "this.promiseDay = promiseDay; this.PROMISE_CYCLE = PROMISE_CYCLE;",
].join(""), ctx);
const { promiseDay, PROMISE_CYCLE } = ctx;
const day = (i) => new Date(2026, 10, 1 + i, 12);

test("each pet has one day 0 and one day 4 in every 21 days, 4 days apart, and topics take turns", () => {
  for (const device of ["a1b2c3", "dev-pet-2", "0f9e8d7c6b5a"]) {
    const days = Array.from({ length: PROMISE_CYCLE * 6 }, (_, i) => promiseDay(device, day(i)));
    for (let i = 0; i + PROMISE_CYCLE <= days.length; i++) {
      const win = days.slice(i, i + PROMISE_CYCLE);
      assert.strictEqual(win.filter((d) => d.day === 0).length, 1, `${device} @${i}`);
      assert.strictEqual(win.filter((d) => d.day === 4).length, 1, `${device} @${i}`);
    }
    days.forEach((d, i) => { if (d.day === 0 && i + 4 < days.length) assert.strictEqual(days[i + 4].day, 4); });
    const topics = days.filter((d) => d.day === 0).map((d) => d.topic);
    topics.forEach((t, i) => { if (i) assert.notStrictEqual(t, topics[i - 1]); });
  }
});

test("two pets aren't locked together", () => {
  const a = Array.from({ length: 60 }, (_, i) => promiseDay("a1b2c3", day(i)).day);
  const b = Array.from({ length: 60 }, (_, i) => promiseDay("0f9e8d7c6b5a", day(i)).day);
  assert.notDeepStrictEqual(a, b);
});

test("the same pet and date give the same day, morning or night", () => {
  for (let i = 0; i < 30; i++) {
    const am = new Date(2026, 10, 1 + i, 0, 30);
    const pm = new Date(2026, 10, 1 + i, 23, 30);
    assert.deepStrictEqual({ ...promiseDay("x", am) }, { ...promiseDay("x", pm) });
  }
});
