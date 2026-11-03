// Memory M1b on the card (docs/plan-2026-11-02-memory.md sections 5, 6, 8, 10): the one-time
// ask, the "great" send, the doors and door 6. node --test tests/js
// Every answer that may reach memory says shared: false from the person's own screen (M1 B1);
// the ask is never stashed; "great" is sent only while memory is on and the pet allows it; a
// door says its approved line, by its pick's label; the doors come only from the visit, which
// a shared screen never calls.
const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");

const src = require("./card-source");
const grab = (re) => {
  const m = src.match(re);
  assert.ok(m, `not in the card: ${re}`);
  return m[0];
};
const method = (name) => grab(new RegExp(`\\n  (?:async )?${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`)).trim();
const table = (name) => grab(new RegExp(`\\nconst ${name} = \\{[\\s\\S]*?\\n\\};\\n`));
// One entry of a table's text, to the next entry or comment at its depth.
const entry = (text, key) => {
  const m = text.match(new RegExp(`\\n  ${key}: [\\s\\S]*?,\\n(?=  (?://|\\w+:)|\\};)`));
  assert.ok(m, `no ${key}`);
  return m[0].trim();
};

function load(shared = false) {
  const store = new Map();
  const ctx = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    setTimeout: (fn) => fn(),
  };
  vm.runInNewContext([
    table("MEMORY_ASK"), table("MEMORY_DOORS"), table("MEMORY_TOLD"),
    grab(/\nconst MEMORY_DREAM_LABEL = [^\n]*\n/),
    grab(/\nconst GAMES = \[[\s\S]*?\n\];\n/),
    grab(/\nconst STASHED_QUESTIONS = [^\n]*\n/),
    grab(/\nconst ANSWER_RETRY_MS = [^\n]*\n/),
    grab(/\nconst SHARED_KEY = [^\n]*\n/),
    grab(/\nfunction sharedScreen\(\) \{[\s\S]*?\n\}\n/),
    // Only the entries these tests read, from the real tables.
    `const SEASON_ICONS = { spring: "♪", summer: "☀", autumn: "♥", winter: "❄" };
     const FAV_WEATHER_LINES = { snow: ["plain snow line"] };
     const turnPick = (list) => list[0];
     const namedHolidays = () => true;
     const MINE = "mine";`,
    `const NOTES = { ${["fav_weather", "season", "door2", "door4", "door5", "door12"]
      .map((k) => entry(table("NOTES"), k)).join("\n")} };`,
    `const QUESTIONS = { ${grab(/\n  memory: \{[\s\S]*?\} \},\n/).trim()} };`,
    `function makeCard(fail) {
      const card = {
        calls: [], said: [],
        _followOk: true,
        _slides: [{ mine: { memory_on: false } }],
        _hass: {
          user: { id: "ada" },
          callWS(msg) { card.calls.push(msg); return fail ? Promise.reject({ code: "x" }) : Promise.resolve(null); },
        },
        _line(s, who, text) { card.said.push(text); },
        _setMine(key, value) { for (const slide of this._slides) if (slide.mine) slide.mine[key] = value; },
        ${method("_keepAnswer")},
        ${method("_sendFollow")},
      };
      return card;
    }`,
    "this.out = { QUESTIONS, NOTES, STASHED_QUESTIONS, MEMORY_ASK, makeCard, SHARED_KEY };",
  ].join("\n"), ctx);
  if (shared) store.set(ctx.out.SHARED_KEY, "on");
  return { ...ctx.out, store };
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const flush = () => new Promise((r) => setImmediate(r));

test("the ask has the approved words, keeps its answer and is never stashed", () => {
  const { QUESTIONS, STASHED_QUESTIONS } = load();
  const q = QUESTIONS.memory;
  assert.equal(q.q, "can i remember what you tell me?");
  assert.deepEqual(Object.keys(q.answers), ["yes", "not_now"]); // the server's answers
  assert.deepEqual(Object.keys(q.answers).map((a) => q.label(a)), ["yes", "not now"]);
  assert.deepEqual(plain(q.answers), { yes: ["ok! i'll keep it safe ♥"], not_now: ["ok, no rush ♥"] });
  assert.equal(q.keep, true);
  assert.ok(!STASHED_QUESTIONS.includes("memory"));
});

test("a kept answer says shared: false, and the ask's yes turns memory on here", async () => {
  const { makeCard } = load();
  const card = makeCard(false);
  card._keepAnswer({}, "memory", "yes", "sensor.pip_life_stage");
  await flush();
  assert.deepEqual(plain(card.calls), [{ type: "virtual_pet/answer", entity_id: "sensor.pip_life_stage",
    question: "memory", answer: "yes", shared: false }]);
  assert.equal(card._memoryOn, true);
  assert.equal(card._slides[0].mine.memory_on, true);
  const other = makeCard(false);
  other._keepAnswer({}, "memory", "not_now", "e");
  await flush();
  assert.equal(other._slides[0].mine.memory_on, false);
});

test("a failed memory answer is not kept on this device", async () => {
  const { makeCard, store } = load();
  const card = makeCard(true);
  card._keepAnswer({ ids: { "sensor.life_stage": "e" } }, "memory", "yes", "e");
  await flush();
  await flush();
  assert.equal(card.calls.length, 2); // the one quiet retry
  assert.equal([...store.keys()].length, 0);
  assert.equal(card._slides[0].mine.memory_on, false);
});

test("on a shared screen a kept answer says so (memory keeps nothing)", async () => {
  const { makeCard } = load(true);
  const card = makeCard(false);
  card._keepAnswer({}, "dream", "sea", "e");
  await flush();
  assert.equal(card.calls[0].shared, true);
});

test("a follow-up answer says shared: false, and none goes from a shared screen", async () => {
  const { makeCard } = load();
  const card = makeCard(false);
  await card._sendFollow({}, "e", "how_day", "great");
  assert.deepEqual(plain(card.calls), [{ type: "virtual_pet/answer", entity_id: "e", question: "how_day",
    answer: "great", shared: false }]);
  const shared = load(true).makeCard(false);
  assert.equal(await shared._sendFollow({}, "e", "how_day", "great"), false);
  assert.equal(shared.calls.length, 0);
});

test("great is sent only while memory is on and this pet allows it; shown says shared: false", () => {
  const ask = method("_ask");
  assert.match(ask, /howLike && answer === "great" && this\._mineSwitch\(s, "memory_on", this\._memoryOn\) &&\s*this\._mineSwitch\(s, "memory_allowed", s\.memoryAllowed\)\) this\._sendFollow\(s, entity, kind, "great"\)/);
  assert.match(ask, /kind === "memory" && !sharedScreen\(\)\) \{\s*this\._hass\.callWS\(\{ type: "virtual_pet\/answer", entity_id: entity, question: "memory", answer: "shown", shared: false \}\)/);
  // The stashed resend says shared: false too (it never runs on a shared screen).
  assert.match(method("_resendAnswers"), /answer: a\.answer,\s*shared: false \}/);
});

test("the doors and door 6 come only from the visit, which a shared screen never calls", () => {
  const visit = method("_visit");
  assert.match(visit, /!this\._hass\.user \|\| sharedScreen\(\) \|\|/);
  assert.match(visit, /if \(sharedScreen\(\)\) return; \/\/ switched while the reply was on its way/);
});

test("each door says its approved line by its pick's label; an unknown pick says nothing", () => {
  const { NOTES } = load();
  assert.equal(NOTES.door2({ kind: "door2" }), "yesterday was a great one! ♥");
  assert.equal(NOTES.door4({ pick: "stars" }), "dreaming of the stars lately, hehe");
  assert.equal(NOTES.door4({ pick: "you" }), "dreaming of you lately, hehe");
  assert.equal(NOTES.door5({ pick: "sun" }), "you like to say sun! ♥");
  assert.equal(NOTES.door12({ pick: "dig" }), "berry dig is your pick, i'm ready!");
  assert.equal(NOTES.door12({ pick: "higher_lower" }), "higher or lower is your pick, i'm ready!");
  for (const kind of ["door4", "door5", "door12"]) assert.ok(!NOTES[kind]({ pick: "<b>x</b>" }), kind);
});

test("door 6 swaps in its line only when the note says told", () => {
  const { NOTES } = load();
  assert.equal(NOTES.fav_weather({ weather: "snow" }, "d"), "plain snow line");
  assert.equal(NOTES.fav_weather({ weather: "snow", told: true }, "d"), "snow! you said it's the best ♥");
  assert.equal(NOTES.fav_weather({ weather: "sun", told: true }, "d"), "sunshine! you said it's the best ♥");
  assert.equal(NOTES.season({ season: "winter" }), "it's winter, your favourite! ❄");
  assert.equal(NOTES.season({ season: "winter", told: true }), "winter! you told me it's the best");
  assert.equal(NOTES.season({ season: "<i>", told: true }), "it's <i>, your favourite!");
});
