// Winter lights (SEASONS key "winter") as pure functions: node --test tests/js
// Dates, Hanukkah from the Hebrew calendar, named-day lines and the holiday-names
// switch. The card isn't a module: the pieces are read from its source.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "..", "custom_components", "virtual_pet", "frontend", "hatch-pet-card.js"), "utf8");
const slice = (from, to) => {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `${from} .. ${to}`);
  return src.slice(a, b);
};
const named = slice("const NAMED_KEY", "// The four tones");
const seasons = slice("const SEASONS = [", "const HEAD_TOPS");
const now = slice("function seasonNow(", "\n}\n") + "\n}\n";

function load(intl = Intl) {
  const store = new Map();
  const ctx = {
    Intl,
    Math,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k) },
    pick: (list) => list[Math.floor(Math.random() * list.length)],
  };
  ctx.Intl = intl;
  vm.runInNewContext(`${named}\n${seasons}\n${now}\nObject.assign(this, { SEASONS, hanukkah, hanukkahDays, seasonLines,
    seasonLine, seasonNow, namedHolidays, unnamed, FESTIVAL_NAMES, NAMED_KEY });`, ctx);
  return ctx;
}
const at = (y, m, d) => new Date(y, m - 1, d, 12);

test("winter runs 1-31 December, after Thanksgiving", () => {
  const { seasonNow } = load();
  const key = (y, m, d) => seasonNow({}, at(y, m, d))?.key || "-";
  assert.strictEqual(key(2026, 11, 30), "-");
  assert.strictEqual(key(2027, 1, 1), "-");
  assert.strictEqual(key(2026, 12, 1), "winter");
  assert.strictEqual(key(2026, 12, 31), "winter");
  assert.strictEqual(key(2024, 12, 1), "thanksgiving"); // the fourth Thursday was 28 Nov
  assert.strictEqual(key(2030, 12, 1), "thanksgiving");
  assert.strictEqual(key(2024, 12, 2), "winter");
  assert.strictEqual(seasonNow({ seasonal: "winter" }, at(2026, 7, 1))?.key, "winter");
  assert.strictEqual(seasonNow({ seasonal: false }, at(2026, 12, 5)), null);
});

test("Hanukkah's first day, 2025-2032", () => {
  const { hanukkah } = load();
  const want = { 2025: "12/15", 2026: "12/5", 2027: "12/25", 2028: "12/13", 2029: "12/2", 2030: "12/21",
    2031: "12/10", 2032: "11/28" };
  for (const [y, d] of Object.entries(want)) assert.strictEqual(hanukkah(Number(y))?.join("/"), d, y);
});

test("without a Hebrew calendar there is no Hanukkah, never a wrong one", () => {
  const gregorian = { DateTimeFormat: function (_, opts) { return new Intl.DateTimeFormat("en", opts); } };
  const broken = { DateTimeFormat: function () { throw new RangeError("no calendars"); } };
  for (const intl of [gregorian, broken]) {
    const { hanukkah, hanukkahDays, seasonLines, SEASONS } = load(intl);
    const winter = SEASONS.find((x) => x.key === "winter");
    assert.strictEqual(hanukkah(2026), null);
    assert.deepStrictEqual([...hanukkahDays(2026)], []);
    assert.deepStrictEqual([...seasonLines(winter, at(2026, 12, 5), true).dated], []);
  }
});

test("named days add their lines; same-day festivals add both", () => {
  const { seasonLines, SEASONS } = load();
  const winter = SEASONS.find((x) => x.key === "winter");
  const dated = (y, m, d) => [...seasonLines(winter, at(y, m, d), true).dated];
  assert.deepStrictEqual(dated(2026, 12, 3), []);
  assert.deepStrictEqual(dated(2026, 12, 24), ["merry Christmas! ♥", "Christmas Eve! ♪"]);
  assert.deepStrictEqual(dated(2026, 12, 31), ["happy new year soon!", "new year's eve! ♪"]);
  assert.deepStrictEqual(dated(2026, 12, 12), ["happy Hanukkah! ♥", "the lights are glowing ♪"]); // day 8
  assert.deepStrictEqual(dated(2026, 12, 13), []);
  assert.deepStrictEqual(dated(2027, 12, 25), ["merry Christmas! ♥", "Christmas Eve! ♪", "happy Hanukkah! ♥",
    "the lights are glowing ♪"]);
  assert.strictEqual(seasonLines(winter, at(2026, 12, 24), true).lines.length, 6);
});

test("a named day's lines are about 1 in 3 of the bubbles", () => {
  const { seasonLine, SEASONS } = load();
  const winter = SEASONS.find((x) => x.key === "winter");
  let n = 0;
  for (let i = 0; i < 3000; i++) if (/Christmas/.test(seasonLine(winter, at(2026, 12, 25), true))) n++;
  assert.ok(n > 800 && n < 1200, String(n));
});

test("holiday names off: no festival name in any season's lines, treat, greet or dated line", () => {
  const ctx = load();
  const { SEASONS, seasonLines, unnamed, FESTIVAL_NAMES, namedHolidays, localStorage, NAMED_KEY } = ctx;
  assert.strictEqual(namedHolidays(), true); // on by default
  localStorage.setItem(NAMED_KEY, "off");
  assert.strictEqual(namedHolidays(), false);
  for (const season of SEASONS) {
    for (const date of [at(2026, 12, 25), at(2026, 12, 5), at(2026, 12, 31), at(2026, 10, 31)]) {
      const { lines, dated } = seasonLines(season, date);
      assert.deepStrictEqual([...dated], [], season.key);
      assert.ok(lines.length >= 3 && lines.every((x) => !FESTIVAL_NAMES.test(x)), `${season.key}: ${lines}`);
    }
    if (season.visitor) assert.ok(unnamed(season.visitor.greet).length >= 1, season.key);
  }
  // The tag catches every name the seasons carry.
  const lines = (k) => SEASONS.find((x) => x.key === k).lines;
  assert.ok(!unnamed(lines("halloween")).includes("happy Halloween!"));
  assert.ok(!unnamed(lines("thanksgiving")).includes("happy Thanksgiving!"));
  assert.ok(unnamed(lines("winter")).includes("happy holidays! ♥")); // generic lines stay
  for (const season of SEASONS) for (const d of season.dated || []) assert.ok(d.lines.length >= 2);
});

test("winter's copy names no thanks and no longest night; the snow hare walks", () => {
  const { SEASONS } = load();
  const winter = SEASONS.find((x) => x.key === "winter");
  const all = [...winter.lines, winter.treatLine, winter.treatSay, ...winter.snackLines, ...winter.visitor.greet];
  assert.ok(all.every((x) => !/thank|longest night/i.test(x)), all.join(" | "));
  assert.strictEqual(winter.thanks, undefined);
  assert.strictEqual(winter.visitor.walk, true);
  assert.strictEqual(SEASONS.find((x) => x.key === "thanksgiving").visitor.walk, true);
  assert.strictEqual(SEASONS.map((x) => x.key).join(), "halloween,thanksgiving,winter");
});
