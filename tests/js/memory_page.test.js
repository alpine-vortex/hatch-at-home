// The "things you told me" page (docs/plan-2026-11-02-memory.md M3a, sections 8, 9, 9a):
// node --test tests/js
// Only card-memory.js names memory_get / memory_forget; the page's rows read the shared
// fixture (tests/fixtures/memory_get.json), so a field renamed on the server fails here; a
// forget sends once, after two taps, with the item's key and shared: false; a reply that
// lands after a close draws nothing (path 4); nothing of it touches the browser's storage.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = require("./card-source");
const ROOT = path.join(__dirname, "..", "..");
const PARTS = path.join(ROOT, "src", "card");
const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "memory_get.json"), "utf8"));

const grab = (re) => {
  const m = src.match(re);
  assert.ok(m, `not in the card: ${re}`);
  return m[0];
};
const method = (name) => grab(new RegExp(`\\n  (?:async )?${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`)).trim();

function load() {
  const ctx = { setTimeout, clearTimeout, Date, Promise, sharedFlag: false };
  vm.runInNewContext([
    grab(/\nconst MEMORY_PAGE = \{[\s\S]*?\n\};\n/),
    grab(/\nconst MEMORY_TAG_CHIPS = \{[\s\S]*?\n\};\n/),
    grab(/\nconst GAMES = \[[\s\S]*?\n\];\n/),
    grab(/\nconst CONFIRM_MS = [^\n]*\n/),
    grab(/\nconst CONFIRM_GAP_MS = [^\n]*\n/),
    grab(/\nfunction confirmTap\([\s\S]*?\n\}\n/),
    "function sharedScreen() { return sharedFlag; }",
    `function makeCard(reply) {
      const card = {
        calls: [], said: [], redraws: 0, resolvers: [],
        _hass: {
          locale: { language: "en-GB" },
          callWS(msg) {
            card.calls.push(msg);
            if (reply === "late") return new Promise((resolve) => card.resolvers.push(resolve));
            return Promise.resolve(msg.type.endsWith("memory_get") ? JSON.parse(JSON.stringify(reply)) : { forgot: 1 });
          },
        },
        _statusMessage(s, text) { card.said.push(text); },
        _memoryRedraw() { card.redraws++; },
        _memoryTouch() {},
        ${method("_memoryFetch")},
        ${method("_memoryDay")},
        ${method("_memoryRows")},
        ${method("_memoryItemKey")},
        ${method("_memoryForget")},
        ${method("_memoryPageClose")},
      };
      return card;
    }`,
    "function makeButton() { const attrs = {}; const cls = new Set(); return { attrs, textContent: '', classList: { add(c) { cls.add(c); }, remove(c) { cls.delete(c); }, contains(c) { return cls.has(c); } }, setAttribute(k, v) { attrs[k] = v; } }; }",
    "this.out = { MEMORY_PAGE, makeCard, makeButton, setShared: (v) => { sharedFlag = v; } };",
  ].join("\n"), ctx);
  return ctx.out;
}

const plain = (v) => JSON.parse(JSON.stringify(v)); // out of the vm's realm
const slide = (extra = {}) => ({ ids: { "sensor.life_stage": "sensor.pip_life_stage" }, memoryPage: "open", ...extra });

test("only card-memory.js names memory_get and memory_forget", () => {
  for (const file of fs.readdirSync(PARTS).filter((f) => f.endsWith(".js"))) {
    const text = fs.readFileSync(path.join(PARTS, file), "utf8");
    const named = /memory_get|memory_forget/.test(text);
    assert.strictEqual(named, file === "card-memory.js", file);
  }
  assert.ok(fs.readFileSync(path.join(PARTS, "manifest.txt"), "utf8").includes("card-journal.js\ncard-memory.js\n"));
  assert.match(src, /class HatchPetCardMemory extends HatchPetCardJournal \{/);
  assert.match(src, /class HatchPetCardActions extends HatchPetCardMemory \{/);
});

test("the page keeps nothing in the browser and draws values as text", () => {
  const part = fs.readFileSync(path.join(PARTS, "card-memory.js"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(part, /localStorage|sessionStorage|_setMine\("memory|s\.mine\.[a-z_]+ =/);
  assert.doesNotMatch(part, /innerHTML\s*=(?!\s*"";)/); // only ever emptied
  assert.match(part, /\.textContent = row\.text/);
  // Every call it makes says it isn't a shared screen.
  for (const m of part.matchAll(/callWS\(\{[^}]*\}/g)) assert.match(m[0], /shared: false/, m[0]);
});

test("the rows read the shared fixture's fields, newest first", () => {
  const { makeCard, MEMORY_PAGE } = load();
  const card = makeCard(FIXTURE);
  const s = slide({ mine: { fav_weather: "snow", fav_season: "autumn" } });
  const rows = card._memoryRows(s, FIXTURE);
  const day = (d) => card._memoryDay(d);
  assert.deepStrictEqual(plain(rows.fav.map((r) => r.text)), [
    MEMORY_PAGE.fav_weather("snow", day("2026-09-12")), MEMORY_PAGE.fav_season("autumn", day("2026-09-13")),
  ]);
  assert.deepStrictEqual(plain(rows.days.map((r) => r.text)), [
    MEMORY_PAGE.day_row("exam", day("2026-10-29")),
    MEMORY_PAGE.day_row("weekend trip", day("2026-10-24")),
    MEMORY_PAGE.day_row("match", day("2026-10-17")),
    MEMORY_PAGE.day_row("match", day("2026-10-10")),
    MEMORY_PAGE.day_row("match", day("2026-10-03")),
  ]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(rows.days[1].key)), { list: "tags", day: "2026-10-24", kind: "weekend" });
  assert.deepStrictEqual(plain(rows.picks.map((r) => r.text)), [
    MEMORY_PAGE.pick_great(day("2026-11-02")),
    MEMORY_PAGE.pick_guess("rain", day("2026-11-01")),
    MEMORY_PAGE.pick_game("berry dig", day("2026-10-31")),
    MEMORY_PAGE.pick_dream("sea", day("2026-10-30")),
  ]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(rows.picks.map((r) => r.key))), [
    { list: "great", day: "2026-11-02" }, { list: "guess", day: "2026-11-01" },
    { list: "game", day: "2026-10-31" }, { list: "dream", day: "2026-10-30" },
  ]);
  assert.deepStrictEqual(plain(rows.patterns.map((r) => r.text)), ["saturdays: you often mention match"]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(rows.patterns[0].key)), { list: "pattern", tag: "match", weekday: 5 });
  // A favourite with no told day, or not in mine, has no row; nothing the server didn't send.
  assert.deepStrictEqual(plain(makeCard(FIXTURE)._memoryRows(slide({ mine: { fav_weather: "snow" } }),
    { ...FIXTURE, since_told: {} }).fav), []);
  for (const r of [...rows.days, ...rows.picks, ...rows.patterns]) assert.doesNotMatch(r.text, /undefined|NaN/);
});

test("a tag or pick off the fixed lists, or markup, is not drawn", () => {
  const { makeCard } = load();
  const card = makeCard(FIXTURE);
  const rows = card._memoryRows(slide(), {
    ...FIXTURE,
    tags: [{ day: "2026-10-01", kind: "big_day", tag: "<b>x</b>" }],
    picks: { dream: [{ day: "2026-10-01", pick: "<img>" }], game: [], guess: [], great: [] },
    patterns: [{ tag: "match", weekday: 9 }, { tag: "<i>", weekday: 1 }],
  });
  assert.deepStrictEqual([rows.days, rows.picks, rows.patterns].map((r) => r.length), [0, 0, 0]);
});

test("forget this: two taps, then one call with the item's key and shared false", async () => {
  const { makeCard, makeButton, MEMORY_PAGE } = load();
  const card = makeCard(FIXTURE);
  const s = slide();
  const row = card._memoryRows(s, FIXTURE).days[1];
  const button = makeButton();
  await card._memoryForget(s, row, button);
  assert.strictEqual(card.calls.length, 0);
  assert.strictEqual(button.textContent, MEMORY_PAGE.forget_sure);
  s.confirm.last -= 1000; // the second tap, past the double-tap guard
  await card._memoryForget(s, row, button);
  const forgets = card.calls.filter((c) => c.type === "virtual_pet/memory_forget");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(forgets)), [{
    type: "virtual_pet/memory_forget", entity_id: "sensor.pip_life_stage", shared: false,
    list: "tags", day: "2026-10-24", kind: "weekend",
  }]);
  // Then the page reads again, and says "done, it's gone" once.
  assert.strictEqual(card.calls.filter((c) => c.type === "virtual_pet/memory_get").length, 1);
  assert.deepStrictEqual(plain(card.said), [MEMORY_PAGE.forgot]);
  clearTimeout(s.confirmTimer);
});

test("a pattern's second tap says it forgets those days, and sends list pattern", async () => {
  const { makeCard, makeButton, MEMORY_PAGE } = load();
  const card = makeCard(FIXTURE);
  const s = slide();
  const row = card._memoryRows(s, FIXTURE).patterns[0];
  const button = makeButton();
  await card._memoryForget(s, row, button);
  assert.strictEqual(button.textContent, MEMORY_PAGE.forget_pattern_sure);
  s.confirm.last -= 1000;
  await card._memoryForget(s, row, button);
  const sent = card.calls.find((c) => c.type === "virtual_pet/memory_forget");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(sent)), {
    type: "virtual_pet/memory_forget", entity_id: "sensor.pip_life_stage", shared: false,
    list: "pattern", tag: "match", weekday: 5,
  });
  clearTimeout(s.confirmTimer);
});

test("path 4: a reply that lands after a close, a pet change or a shared flip draws nothing", async () => {
  const { makeCard, setShared } = load();
  for (const change of ["close", "pet", "shared"]) {
    const card = makeCard("late");
    const s = slide();
    const load = card._memoryFetch(s);
    if (change === "close") card._memoryPageClose(s, false);
    if (change === "pet") s.ids = { "sensor.life_stage": "sensor.moss_life_stage" };
    if (change === "shared") setShared(true);
    card.resolvers.forEach((resolve) => resolve(JSON.parse(JSON.stringify(FIXTURE))));
    await load;
    setShared(false);
    assert.strictEqual(s.memoryData ?? null, null, change);
    assert.strictEqual(card.redraws, 0, change);
  }
});

test("closing drops every field and the cached HTML", () => {
  const { makeCard } = load();
  const card = makeCard(FIXTURE);
  const s = slide({ memoryData: FIXTURE, memoryEpoch: 3, statusHtml: "<div>x</div>", memoryIdle: setTimeout(() => {}, 1e6) });
  assert.strictEqual(card._memoryPageClose(s, false), true);
  assert.strictEqual(s.memoryPage, false);
  assert.strictEqual(s.memoryData, null);
  assert.strictEqual(s.memoryIdle, null);
  assert.strictEqual(s.statusHtml, null); // the DOM half is card-check's
  assert.strictEqual(s.memoryEpoch, 4);
});

test("the five teardown paths are wired where the plan says", () => {
  const body = (name) => method(name);
  assert.match(body("_channel"), /if \(s\.memoryPage && !this\._memoryLinkShown\(s\)\) this\._memoryPageClose\(s, false\);/);
  assert.match(body("_goShared"), /this\._memoryPageClose\(slide, false\);/);
  assert.match(body("_toggleStatus"), /this\._memoryPageClose\(s, false\);/);
  assert.match(body("_forget"), /this\._memoryPageClose\(s, false\);/);
  assert.match(body("_go"), /x\.memoryPage\) this\._memoryPageClose\(x\)/);
  assert.match(grab(/\n  _onHidden = \(\) => \{[\s\S]*?\n  \};\n/), /_memoryPageClose\(x\)/);
  assert.match(src, /const MEMORY_IDLE_MS = 2 \* 60 \* 1000;/);
});

test("F1: a good forget drops the row at once, and a failed re-read keeps the rest", async () => {
  const { makeCard, makeButton, MEMORY_PAGE } = load();
  const card = makeCard(FIXTURE);
  const base = card._hass.callWS;
  card._hass.callWS = (msg) => (msg.type.endsWith("memory_get") ? Promise.reject(new Error("down")) : base(msg));
  const s = slide({ memoryData: plain(FIXTURE) });
  const before = card._memoryRows(s, s.memoryData).days;
  const row = before[1];
  s.confirm = { key: card._memoryItemKey(row.key), at: Date.now(), last: Date.now() - 1000 };
  await card._memoryForget(s, row, makeButton());
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(!s.memoryFailed);
  assert.strictEqual(card._memoryRows(s, s.memoryData).days.length, before.length - 1);
  assert.deepStrictEqual(plain(card.said), [MEMORY_PAGE.forgot]);
  clearTimeout(s.confirmTimer);
});

test("M3b P1: a pattern forget drops that tag's big_day entries on that weekday (the last five), and their stickers", async () => {
  const { makeCard, makeButton } = load();
  const card = makeCard(FIXTURE);
  const base = card._hass.callWS;
  card._hass.callWS = (msg) => (msg.type.endsWith("memory_get") ? Promise.reject(new Error("down")) : base(msg));
  // 2026-10-03/10/17 are Saturdays; 10-06 a Tuesday; 09-05 a Saturday older than the last five.
  const tag = (day, t = "match", kind = "big_day") => ({ day, tag: t, kind });
  const data = {
    today: "2026-10-20",
    tags: [tag("2026-09-05"), tag("2026-10-03"), tag("2026-10-06"), tag("2026-10-10"), tag("2026-10-13"),
      tag("2026-10-17"), tag("2026-10-04", "match", "weekend"), tag("2026-10-03", "show")],
    patterns: [{ tag: "match", weekday: 5 }],
  };
  const s = slide({ memoryData: data });
  const row = { key: { list: "pattern", tag: "match", weekday: 5 } };
  s.confirm = { key: card._memoryItemKey(row.key), at: Date.now(), last: Date.now() - 1000 };
  await card._memoryForget(s, row, makeButton());
  await new Promise((r) => setTimeout(r, 0));
  assert.deepStrictEqual(plain(s.memoryData.patterns), []);
  // The window is the last five match days (10-03 .. 10-17 less 09-05): the Saturdays in it go; the older one stays.
  assert.deepStrictEqual(plain(s.memoryData.tags.filter((e) => e.tag === "match" && e.kind === "big_day").map((e) => e.day)),
    ["2026-09-05", "2026-10-06", "2026-10-13"]);
  assert.strictEqual(s.memoryData.tags.length, 5); // the weekend entry and the show tag stay
  clearTimeout(s.confirmTimer);
});

test("M3b P2: a read that is not the latest is dropped, and a failed latest read keeps the rows", async () => {
  const { makeCard } = load();
  const card = makeCard("late");
  const s = slide({ memoryData: plain(FIXTURE) });
  const first = card._memoryFetch(s, true);
  s.memoryLoad = null; // a forget lands and starts the next read
  const second = card._memoryFetch(s, true);
  assert.strictEqual(card.resolvers.length, 2);
  const fresh = plain(FIXTURE);
  fresh.tags = [];
  card.resolvers[1](fresh);
  await second;
  card.resolvers[0](plain(FIXTURE)); // the older reply lands last
  await first;
  assert.deepStrictEqual(plain(s.memoryData.tags), []);
  // A failed latest read keeps the local rows.
  const card2 = makeCard(FIXTURE);
  card2._hass.callWS = () => Promise.reject(new Error("down"));
  const s2 = slide({ memoryData: plain(FIXTURE) });
  await card2._memoryFetch(s2, true);
  assert.deepStrictEqual(plain(s2.memoryData), plain(FIXTURE));
  assert.ok(!s2.memoryFailed);
});
