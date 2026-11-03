// Species nature N2 (docs/plan-2026-11-02-species-nature.md sections 5.4, 5.5, 10): the action-line
// layer. SPECIES_LINES' shape and lookup order, the opt-in roll in _lines (the cap, the draw count,
// no baby/child), the _idle path (only the idle key, the move, calm), and the three call sites.
// The card isn't a module: its source is read and run against a stub. node --test tests/js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = require("./card-source");
const grab = (re) => {
  const m = src.match(re);
  assert.ok(m, `not in the card: ${re}`);
  return m[0];
};
const method = (name) => grab(new RegExp(`\\n  ${name}\\([^\\n]*\\{\\n[\\s\\S]*?\\n  \\}\\n`));

const SPRITES = path.join(__dirname, "../../custom_components/virtual_pet/frontend/sprites");
const species = Object.fromEntries(fs.readdirSync(SPRITES)
  .filter((d) => fs.existsSync(path.join(SPRITES, d, "species.json")))
  .map((d) => [d, JSON.parse(fs.readFileSync(path.join(SPRITES, d, "species.json"), "utf8"))])
  .filter(([, sp]) => sp.ready !== false));

// A scripted Math.random: the queue first, then `fallback` (a number, or null for "throw").
const dice = { queue: [], fallback: 0.5, calls: 0 };
const random = () => {
  dice.calls++;
  if (dice.queue.length) return dice.queue.shift();
  assert.notStrictEqual(dice.fallback, null, "an unexpected Math.random draw");
  return dice.fallback;
};
const ctx = { Math: Object.assign(Object.create(Math), { random }), calm: () => false, calmNow: false };
ctx.calm = () => ctx.calmNow;
vm.runInNewContext([
  grab(/\nconst NATURE_VALUES = \{[\s\S]*?\n\};\n/),
  grab(/\nfunction nature\([\s\S]*?\n\}\n/),
  grab(/\nconst SPECIES_LINE_ODDS = [^\n]*\n/),
  grab(/\nconst IDLE_BODY_MOVES = [^\n]*\n/),
  grab(/\nconst IDLE_LINES = [^\n]*\n/),
  grab(/\nconst IDLE_MIN_MS = [^\n]*\n/),
  grab(/\nconst IDLE_SPREAD_MS = [^\n]*\n/),
  grab(/\nconst NEIGHBOUR_ODDS = [^\n]*\n/),
  grab(/\nconst SPECIES_LINES = \{[\s\S]*?\n\};\n/),
  grab(/\nconst RESTING_IDLE = [^\n]*\n/),
  grab(/\nconst NEIGHBOUR_LINES = [^\n]*\n/),
  "const SHARED_POSES = new Set();",
  "const pick = (list) => list[Math.floor(Math.random() * list.length)];",
  `class Card {${["_lines", "_natureCells", "_natureCell", "_idleMove", "_idle", "_words"].map(method).join("")}}`,
  "this.out = { Card, nature, SPECIES_LINES, SPECIES_LINE_ODDS, NATURE_VALUES, IDLE_BODY_MOVES };",
].join("\n"), ctx);
const { Card, nature, SPECIES_LINES, SPECIES_LINE_ODDS, NATURE_VALUES } = ctx.out;
const plain = (v) => JSON.parse(JSON.stringify(v));

const MOVES = ["perk", "settle", "munch", "rock", "look", "wander"];
const KEYS = ["idle", "find", "visit", "link_host"];
const dealt = (queue, fallback = null) => { dice.queue = [...queue]; dice.fallback = fallback; dice.calls = 0; };

// A stub card: a pet of `sp` at `stage`, the persona list (or none), baby talk off unless given.
function card({ id = "otter", stage = "adult", persona = null, babySet = null, mood = "content", others = 0, resting = false } = {}) {
  const c = new Card();
  const s = { species: species[id], speciesId: id, ids: { device: "d1" }, moodState: mood, resting, bubble: {}, pet: {}, nextIdle: 1, drawn: stage };
  const log = { written: [], moves: [], looked: [], wandered: [], animated: [] };
  c._state = () => ({ state: stage });
  c._persona = () => persona;
  c._babySet = () => babySet;
  c._babyStage = () => (babySet ? stage : null);
  c._write = (_s, text) => { log.written.push(text); s.bubble.textContent = text; };
  c._look = (_s, ms) => log.looked.push(ms);
  c._wander = (_s, ms) => log.wandered.push(ms);
  c._animate = (_s, _el, cls, ms) => log.animated.push([cls, ms]);
  c._free = () => true;
  c._idleScale = () => 1;
  c._promisePractice = () => false;
  c._skyReact = () => false;
  c._idleMoves = () => ["mumble"];
  c._linkName = (x) => x.name;
  s.others = others;
  c._slides = [s, ...Array.from({ length: others }, (_, i) => ({ name: `n${i}` }))];
  return { c, s, log };
}
const texts = (cells) => Array.from(cells, (c) => c.text); // a host-realm array (the card runs in a vm)

test("SPECIES_LINES: the cell shape, the closed moves (idle only), 22 distinct lines", () => {
  assert.deepStrictEqual(Object.keys(SPECIES_LINES).sort(), ["company", "habit", "own"]);
  const seen = new Set();
  const walk = (level, keyed) => {
    for (const [who, byKey] of Object.entries(keyed)) {
      for (const [key, cells] of Object.entries(byKey)) {
        assert.ok(KEYS.includes(key), `${level}.${who}.${key} is not an N2 key`);
        assert.ok(Array.isArray(cells) && cells.length >= 1, `${level}.${who}.${key} is not a list`);
        for (const cell of cells) {
          assert.ok(typeof cell.text === "string" || typeof cell.text === "function", `${level}.${who}.${key}.text`);
          assert.deepStrictEqual(Object.keys(cell).filter((k) => k !== "text" && k !== "move"), []);
          if (cell.move !== undefined) {
            assert.ok(MOVES.includes(cell.move), `${level}.${who}.${key}: ${cell.move}`);
            assert.strictEqual(key, "idle", `${level}.${who}.${key} has a move`);
          }
          const text = typeof cell.text === "function" ? cell.text("burrow") : cell.text;
          assert.match(text, /^\*[^*]+\*$/, `${text} is not an action line`);
          seen.add(text);
        }
      }
    }
  };
  walk("habit", SPECIES_LINES.habit);
  walk("company", SPECIES_LINES.company);
  walk("own", SPECIES_LINES.own);
  assert.strictEqual(seen.size, 22);
  assert.deepStrictEqual(Object.keys(SPECIES_LINES.habit).sort(), [...NATURE_VALUES.habit].sort());
  assert.deepStrictEqual(Object.keys(SPECIES_LINES.company), ["solo"]);
  assert.deepStrictEqual(Object.keys(SPECIES_LINES.own).sort(), ["firefly", "lunamoth"]);
});

test("the lookup: own over company over habit, whole; the visit map of the plan", () => {
  const visit = {};
  for (const id of Object.keys(species)) {
    const { c, s } = card({ id });
    visit[id] = texts(c._natureCells(s, "visit"));
  }
  const n = (id) => nature(species[id]);
  const solo = Object.keys(species).filter((id) => n(id).company === "solo");
  assert.strictEqual(solo.length, 15);
  for (const id of solo) assert.deepStrictEqual(visit[id], ["*peeks first, then waves*"], id);
  assert.deepStrictEqual(visit.deer, ["*ears up*"]);
  assert.deepStrictEqual(visit.corgi, ["*sniffs the air*"]);
  assert.deepStrictEqual(visit.duckling, ["*sniffs the air*"]);
  for (const id of Object.keys(species).filter((x) => !solo.includes(x) && !["deer", "corgi", "duckling"].includes(x))) {
    assert.deepStrictEqual(visit[id], [], `${id} says the usual greeting`);
  }
  // own wins whole: firefly and lunamoth glow; bird, treefrog and bat hum
  for (const id of ["firefly", "lunamoth"]) {
    const { c, s } = card({ id });
    assert.deepStrictEqual(texts(c._natureCells(s, "idle")), ["*glows a little brighter*", "*flickers in a tiny loop*"], id);
  }
  for (const id of ["bird", "treefrog", "bat"]) {
    const { c, s } = card({ id });
    assert.deepStrictEqual(texts(c._natureCells(s, "idle")), ["*hums a little tune*", "*does a tiny twirl*"], id);
  }
  // find: hoarder and explorer only; link_host: builder only
  for (const id of Object.keys(species)) {
    const { c, s } = card({ id });
    const find = texts(c._natureCells(s, "find"));
    assert.deepStrictEqual(find, n(id).habit === "hoarder" ? ["*stashes it, happily*"]
      : n(id).habit === "explorer" ? ["*came back with something*"] : [], id);
    const host = texts(c._natureCells(s, "link_host"));
    assert.strictEqual(host.length, n(id).habit === "builder" ? 1 : 0, id);
    for (const key of ["snack", "clean", "tuck", "pat", "idle_bored", "idle_excited", "link_guest", "wish"]) {
      assert.deepStrictEqual(plain(c._natureCells(s, key)), [], `${id}.${key}`);
    }
  }
});

test("no nature, no key, or a level without the key gives no cell", () => {
  const { c, s } = card();
  s.species = { ...s.species, nature: undefined };
  assert.deepStrictEqual(plain(c._natureCells(s, "idle")), []);
  s.species = { ...species.otter, nature: { clock: "day" } }; // an incomplete block is no nature
  assert.deepStrictEqual(plain(c._natureCells(s, "idle")), []);
  const q = card({ id: "otter" });
  assert.deepStrictEqual(plain(q.c._natureCells(q.s, "nonsense")), []);
});

test("the {home} fill: the builders' words, a stage's words; a missing one drops the cell", () => {
  for (const id of Object.keys(species)) {
    for (const stage of ["teen", "adult"]) {
      const { c, s } = card({ id, stage });
      const words = { food: species[id].words?.food, home: species[id].words?.home, ...(species[id].words?.[stage] || {}) };
      for (const key of KEYS) {
        for (const cell of c._natureCells(s, key)) {
          assert.ok(!/undefined|null|[{}]/.test(cell.text), `${id}.${key}: ${cell.text}`);
          assert.ok(cell.text.length <= 40, cell.text);
        }
      }
      if (nature(species[id]).habit === "builder") {
        assert.ok(texts(c._natureCells(s, "link_host"))[0].includes(words.home), id);
      }
    }
  }
  const { c, s } = card({ id: "tarantula" });
  assert.deepStrictEqual(texts(c._natureCells(s, "idle")), [`*fixes up the ${species.tarantula.words.home}*`, "*nudges a bit into place*"]);
  s.species = { ...s.species, words: {} }; // no home word at all
  assert.deepStrictEqual(texts(c._natureCells(s, "idle")), ["*nudges a bit into place*"]);
  assert.deepStrictEqual(plain(c._natureCells(s, "link_host")), []);
  // an empty pool draws nothing, whatever the dice
  dealt([]);
  assert.deepStrictEqual(plain(c._lines(s, "link_host", "hi", undefined, { nature: "link_host" })), { text: "hi", baby: false, move: null });
  assert.strictEqual(dice.calls, 0);
});

test("the cap: a species line for r < SPECIES_LINE_ODDS of the draws that reach the roll, never otherwise", () => {
  assert.strictEqual(SPECIES_LINE_ODDS, 0.25);
  const { c, s } = card({ id: "kitten" }); // groomer
  let said = 0;
  const N = 100;
  for (let i = 0; i < N; i++) {
    const r = i / N;
    dealt([r, 0.99]);
    const out = c._lines(s, "idle", "normal", undefined, { nature: "idle" });
    if (r < SPECIES_LINE_ODDS) {
      said++;
      assert.strictEqual(dice.calls, 2, "the roll, then the pick");
      assert.ok(["*grooms*", "*smooths itself down*"].includes(out.text), out.text);
      assert.strictEqual(out.baby, false);
    } else {
      assert.strictEqual(dice.calls, 1, "the roll alone");
      assert.deepStrictEqual(plain(out), { text: "normal", baby: false, move: null });
    }
  }
  assert.strictEqual(said, 25);
  // the pick takes the cell, with its move
  dealt([0.1, 0]);
  assert.deepStrictEqual(plain(c._lines(s, "idle", "normal", undefined, { nature: "idle" })), { text: "*grooms*", baby: false, move: "rock" });
  dealt([0.1, 0.99]);
  assert.deepStrictEqual(plain(c._lines(s, "idle", "normal", undefined, { nature: "idle" })), { text: "*smooths itself down*", baby: false, move: null });
});

test("never for an egg, a baby or a child (baby talk on or off), a pet's persona coin that took the line, or a baby set", () => {
  for (const stage of ["egg", "baby", "child"]) {
    for (const babySet of [null, ["goo"]]) {
      const { c, s } = card({ id: "kitten", stage, babySet });
      dealt([0.0, 0.0], 0.0);
      const out = c._lines(s, "idle", "normal", undefined, { nature: "idle" });
      assert.ok(!out.text.startsWith("*grooms") && out.text !== "*smooths itself down*", `${stage}/${babySet}: ${out.text}`);
      assert.strictEqual(out.move, null);
    }
  }
  // a baby set takes its line before any species roll; nothing is drawn but its pick
  const baby = card({ id: "kitten", stage: "teen", babySet: ["goo"] });
  dealt([0.0]);
  assert.deepStrictEqual(plain(baby.c._lines(baby.s, "idle", "normal", undefined, { nature: "idle" })), { text: "goo", baby: true, move: null });
  assert.strictEqual(dice.calls, 1);
  // the persona's coin: passes (< 0.5) -> its list (pick), no species roll; fails -> the species roll
  const typed = card({ id: "kitten", persona: { idle: ["persona line"] } });
  dealt([0.4, 0]);
  assert.strictEqual(typed.c._lines(typed.s, "idle", "normal", undefined, { nature: "idle" }).text, "persona line");
  assert.strictEqual(dice.calls, 2, "coin + pick, no roll");
  dealt([0.9, 0.1, 0]);
  const out = typed.c._lines(typed.s, "idle", "normal", undefined, { nature: "idle" });
  assert.deepStrictEqual(plain(out), { text: "*grooms*", baby: false, move: "rock" });
  assert.strictEqual(dice.calls, 3, "coin, roll, pick");
  // a persona with no list for the key: the roll is the first draw
  const other = card({ id: "kitten", persona: { wish: ["x"] } });
  dealt([0.1, 0]);
  assert.strictEqual(other.c._lines(other.s, "idle", "normal", undefined, { nature: "idle" }).text, "*grooms*");
  assert.strictEqual(dice.calls, 2);
});

test("a call without nature draws what it drew before and returns no move; a key with no cell too", () => {
  const typed = card({ id: "kitten", persona: { idle: ["persona line"] } });
  dealt([0.9], null);
  assert.deepStrictEqual(plain(typed.c._lines(typed.s, "idle", "normal")), { text: "normal", baby: false });
  assert.strictEqual(dice.calls, 1, "only the persona's coin");
  dealt([0.4, 0], null);
  assert.deepStrictEqual(plain(typed.c._lines(typed.s, "idle", "normal")), { text: "persona line", baby: false });
  assert.strictEqual(dice.calls, 2);
  const bare = card({ id: "kitten" });
  dealt([], null);
  assert.deepStrictEqual(plain(bare.c._lines(bare.s, "idle", "normal")), { text: "normal", baby: false });
  assert.strictEqual(dice.calls, 0);
  // a nature key with no cell for this species (a kitten finds nothing): no draw either
  dealt([], null);
  assert.deepStrictEqual(plain(bare.c._lines(bare.s, "find", "normal", undefined, { nature: "find" })), { text: "normal", baby: false, move: null });
  assert.strictEqual(dice.calls, 0);
  // nature: null (the V3 and V2 finds) is the plain call
  assert.deepStrictEqual(plain(bare.c._lines(bare.s, "find", "normal", undefined, { nature: null })), { text: "normal", baby: false });
});

test("_idle: the idle key only, the line bare, then the move after the write; calm says the line only", () => {
  // the draws: the delay, the move (mumble = 0), pick(lines), [coin], roll, pick(cell)
  const run = ({ id = "kitten", calmNow = false, persona = null, mood = "content", stage = "adult", rolls = [0.1, 0], resting = false, others = 0 } = {}) => {
    const t = card({ id, persona, mood, stage, resting, others });
    ctx.calmNow = calmNow;
    dealt([0, 0, 0.1, ...(persona ? [0.9] : []), ...rolls], 0.5);
    t.c._idle(t.s);
    ctx.calmNow = false;
    return t;
  };
  let t = run();
  assert.deepStrictEqual(t.log.written, ["*grooms*"]);
  assert.deepStrictEqual(t.log.animated, [["rock", 600]]);
  t = run({ id: "owl" });
  assert.deepStrictEqual(t.log.written, ["*watches closely*"]);
  assert.deepStrictEqual(t.log.looked, [1800]);
  assert.deepStrictEqual(t.log.animated, []);
  t = run({ id: "fox" });
  assert.deepStrictEqual(t.log.written, ["*sniffs around*"]);
  assert.deepStrictEqual(t.log.wandered, [2200]);
  t = run({ id: "squirrel" });
  assert.deepStrictEqual(t.log.written, ["*tucks something away*"]);
  assert.deepStrictEqual(t.log.animated, [["munch", 1500]]);
  t = run({ id: "firefly", persona: { idle: ["x"] } });
  assert.deepStrictEqual(t.log.written, ["*glows a little brighter*"]);
  assert.deepStrictEqual(t.log.animated, [["perk", 320]]);
  t = run({ id: "tortoise" });
  assert.deepStrictEqual(t.log.animated, [["settle", 2500]]);
  // a cell with no move: line only
  t = run({ rolls: [0.1, 0.99] });
  assert.deepStrictEqual(t.log.written, ["*smooths itself down*"]);
  assert.deepStrictEqual(t.log.animated, []);
  // calm: the line is said, the move is not
  t = run({ calmNow: true, id: "owl" });
  assert.deepStrictEqual(t.log.written, ["*watches closely*"]);
  assert.deepStrictEqual(t.log.looked.concat(t.log.animated, t.log.wandered), []);
  // roll missed: the normal line, no move
  t = run({ rolls: [0.9] });
  assert.notStrictEqual(t.log.written[0], "*grooms*");
  assert.deepStrictEqual(t.log.animated, []);
  // not on the bored and excited keys, a bodily mood (no _lines), a resting pet, a baby or a child
  for (const mood of ["bored", "excited"]) {
    t = run({ mood });
    assert.ok(!t.log.written[0].startsWith("*grooms"), mood);
    assert.deepStrictEqual(t.log.animated, []);
  }
  for (const stage of ["baby", "child"]) {
    t = run({ stage });
    assert.ok(!/^\*grooms|smooths/.test(t.log.written[0]), stage);
  }
  const bodily = card({ id: "kitten", mood: "hungry" });
  dealt([0, 0, 0.1], null); // delay, move, pick(lines): nothing after
  bodily.c._idle(bodily.s);
  assert.strictEqual(dice.calls, 3);
  const resting = card({ id: "kitten", resting: true });
  dealt([0, 0, 0.1, 0.1], null); // delay, move, pick(lines), pick(resting)
  resting.c._idle(resting.s);
  assert.strictEqual(dice.calls, 4, "a resting pet takes no species roll");
  assert.deepStrictEqual(resting.log.animated, []);
  // a neighbour line: the neighbour roll hits, no species roll
  const near = card({ id: "kitten", others: 1 });
  dealt([0, 0, 0, 0, 0, 0], null); // delay, move, neighbour roll, pick(others), pick(lines), pick(NEIGHBOUR_LINES)
  near.c._idle(near.s);
  assert.ok(!near.log.written[0].startsWith("*grooms"), near.log.written[0]);
});

test("_idleMove plays the move _idle's branches played: classes and ms", () => {
  const { c, s, log } = card();
  for (const m of MOVES) c._idleMove(s, m);
  c._idleMove(s, "nonsense");
  assert.deepStrictEqual(log.looked, [1800]);
  assert.deepStrictEqual(log.wandered, [2200]);
  assert.deepStrictEqual(log.animated, [["perk", 320], ["settle", 2500], ["munch", 1500], ["rock", 600]]);
  const idle = method("_idle");
  assert.match(idle, /else if \(IDLE_BODY_MOVES\.has\(move\)\) \{\s*this\._idleMove\(s, move\);/);
  assert.deepStrictEqual([...ctx.out.IDLE_BODY_MOVES].sort(), [...MOVES].sort());
  // the mumble branch writes first, then moves, and only when not calm
  assert.match(idle, /nature: "idle"/);
  assert.match(idle, /key === "idle"/);
  assert.match(idle, /if \(said\?\.move && !isCalm\) this\._idleMove\(s, said\.move\);/);
  assert.ok(idle.indexOf("this._write(s, restful") < idle.indexOf("this._idleMove(s, said.move)"));
});

test("the call sites opt in, each with its own key, and nothing else does", () => {
  const find = method("_findLine");
  assert.match(find, /nature: who \|\| f\.new \? null : "find"/);
  const greet = method("_visitorGreet");
  assert.match(greet, /this\._lines\(s, "visit", pick\(\[\.\.\.VISIT_LINES, \.\.\.v\.lines\]\), undefined, \{ nature: "visit" \}\)/);
  // the visit line is the last branch: after the guest, pair, favourite and friend lines
  assert.ok(greet.indexOf("VISIT_GUEST") < greet.indexOf("nature:"));
  assert.ok(greet.indexOf("FAVV_LINES") < greet.indexOf("nature:"));
  assert.ok(greet.indexOf("_visitFriendLine") < greet.indexOf("nature:"));
  const link = method("_linkStart");
  assert.match(link, /this\._lines\(host, "link_host"[\s\S]*?\{ nature: "link_host" \}\)\.text/);
  assert.doesNotMatch(link, /this\._lines\(guest, "link_guest"[^;]*nature/);
  // every opted-in call in the card
  const calls = [...src.matchAll(/nature: ("[a-z_]+"|who[^}]*)/g)].map((m) => m[1].trim());
  assert.deepStrictEqual(calls.sort(), ['"idle"', '"link_host"', '"visit"', 'who || f.new ? null : "find"'].sort());
});

test("no new .pet.<cls> rule and no CSS: the moves are existing classes", () => {
  for (const m of ["perk", "settle", "munch", "rock"]) assert.match(src, new RegExp(`\\.pet\\.${m}\\b`), m);
});
