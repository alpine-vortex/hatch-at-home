// Species nature, N1 (docs/plan-2026-11-02-species-nature.md sections 5.1-5.3, 10): node --test tests/js
// The helpers, the sky and clock copy, the idle adds, and the sky reaction's rules, read from the
// card's source and run against a stub card.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { scanFreshCopy, COPY_TABLES } = require("../../scripts/copy-scan.js");

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

const ctx = { calm: () => false, rand: 0.5 };
vm.runInNewContext([
  grab(/\nconst SKY_WAIT_MS = [^\n]*\n/),
  grab(/\nconst NATURE_VALUES = \{[\s\S]*?\n\};\n/),
  grab(/\nfunction nature\([\s\S]*?\n\}\n/),
  grab(/\nfunction paceOf\([\s\S]*?\n\}\n/),
  grab(/\nconst PACE_SCALE = [^\n]*\n/),
  grab(/\nconst SPECIES_ADDS = \{[\s\S]*?\n\};\n/),
  grab(/\nconst SKY_FLAGS = \{[\s\S]*?\n\};\n/),
  grab(/\nconst SKY_REACT = \{[\s\S]*?\n\};\n/),
  grab(/\nconst CLOCK_LINES = \{[\s\S]*?\n\};\n/),
  grab(/\nfunction oncePerDay\([\s\S]*?\n\}\n/),
  grab(/\nfunction usedToday\([\s\S]*?\n\}\n/),
  "const pick = (list) => list[Math.floor(Math.random() * list.length)];",
  `class Card {${["_speciesAdds", "_idleScale", "_clockLines", "_skyReact"].map(method).join("")}}`,
  "this.out = { Card, nature, paceOf, NATURE_VALUES, SPECIES_ADDS, SKY_FLAGS, SKY_REACT, CLOCK_LINES, PACE_SCALE, oncePerDay, usedToday };",
].join("\n"), ctx);
const { Card, nature, paceOf, NATURE_VALUES, SPECIES_ADDS, SKY_FLAGS, SKY_REACT, CLOCK_LINES, PACE_SCALE, oncePerDay } = ctx.out;
const bare = (o) => JSON.parse(JSON.stringify(o));

const tableLines = () => [
  ...Object.entries(SKY_REACT).flatMap(([k, v]) => v.map((l) => [`SKY_REACT.${k}`, l])),
  ...Object.entries(CLOCK_LINES).flatMap(([m, by]) => Object.entries(by).flatMap(([c, v]) => v.map((l) => [`${m}.${c}`, l]))),
];

test("the sky and clock tables are in the copy scan, and pass it", () => {
  const { bad, tables } = scanFreshCopy(src);
  assert.deepStrictEqual(bad, []);
  assert.ok(tables.includes("SKY_REACT") && tables.includes("CLOCK_LINES"));
  assert.ok("SKY_REACT" in COPY_TABLES && "CLOCK_LINES" in COPY_TABLES);
});

test("every sky has two lines and every clock a line in both moments", () => {
  assert.deepStrictEqual(Object.keys(SKY_REACT).sort(), [...NATURE_VALUES.sky].sort());
  for (const sky of NATURE_VALUES.sky) assert.strictEqual(SKY_REACT[sky].length, 2, sky);
  assert.deepStrictEqual(Object.keys(CLOCK_LINES).sort(), ["good_morning", "sunset"]);
  for (const moment of Object.keys(CLOCK_LINES)) {
    assert.deepStrictEqual(Object.keys(CLOCK_LINES[moment]).sort(), [...NATURE_VALUES.clock].sort());
    for (const clock of NATURE_VALUES.clock) assert.ok(CLOCK_LINES[moment][clock].length >= 1, `${moment}.${clock}`);
  }
});

test("no line says favourite, fond, love or best; sky lines are body action lines", () => {
  for (const [where, line] of tableLines()) {
    assert.doesNotMatch(line, /favou?rite|\bfond\b|\blove\w*|\bbest\b|my kind of/i, `${where}: ${line}`);
    assert.doesNotMatch(line, /\?|\d|undefined|[{}]/, `${where}: ${line}`);
    assert.ok([...line].length <= 40, `${where}: ${line}`);
  }
  for (const [sky, lines] of Object.entries(SKY_REACT)) {
    for (const line of lines) assert.ok(/^\*[^*]+\*$/.test(line), `${sky}: ${line} is not an *action*`);
  }
});

test("paceOf follows voice.pace: 40 and up quick, 29 and down slow", () => {
  const p = (pace) => paceOf({ voice: { pace } });
  assert.deepStrictEqual([p(45), p(40), p(39), p(30), p(29), p(25)], ["quick", "quick", "steady", "steady", "slow", "slow"]);
  assert.strictEqual(paceOf({}), "steady");
  assert.strictEqual(paceOf(null), "steady");
  assert.deepStrictEqual(bare(PACE_SCALE), { quick: 0.8, steady: 1, slow: 1.25 });
});

test("a missing nature, or an unknown value, is no nature", () => {
  assert.strictEqual(nature(undefined), null);
  assert.strictEqual(nature({}), null);
  assert.strictEqual(nature({ nature: { clock: "day", sky: "sun", company: "solo" } }), null);
  assert.strictEqual(nature({ nature: { clock: "day", sky: "sun", company: "solo", habit: "napper" } }), null);
  const ok = { clock: "day", sky: "sun", company: "solo", habit: "basker" };
  assert.strictEqual(nature({ nature: ok }), ok);
});

test("all 30 ready species read as a nature, and pace comes from voice.pace", () => {
  assert.strictEqual(Object.keys(species).length, 30);
  for (const [id, sp] of Object.entries(species)) {
    assert.ok(nature(sp), id);
    assert.ok(["quick", "steady", "slow"].includes(paceOf(sp)), id);
  }
});

test("SPECIES_ADDS names only moves _idle handles, three copies at most, one row per habit", () => {
  const idle = method("_idle");
  const handled = new Set([...idle.matchAll(/move === "(\w+)"/g)].map((m) => m[1]));
  assert.deepStrictEqual(Object.keys(SPECIES_ADDS).sort(), [...NATURE_VALUES.habit].sort());
  for (const [habit, moves] of Object.entries(SPECIES_ADDS)) {
    assert.ok(moves.length >= 1 && moves.length <= 3, habit);
    for (const m of moves) assert.ok(m === "mumble" || handled.has(m), `${habit}: ${m} is not an _idle move`);
    assert.ok(!moves.includes("mumble"), habit); // mumble stays element 0 and in its usual share
  }
});

test("every sky waits for a flag the house raises; the fire has stand-ins", () => {
  assert.deepStrictEqual(bare(SKY_FLAGS.sun), ["sunny"]);
  assert.deepStrictEqual(bare(SKY_FLAGS.moon), ["full_moon"]);
  assert.deepStrictEqual(bare(SKY_FLAGS.fire), ["fireside", "cozy", "sunny"]);
  assert.deepStrictEqual(Object.keys(SKY_FLAGS).sort(), [...NATURE_VALUES.sky].sort());
});

// --- the stub card -------------------------------------------------------------------------

const otter = species.otter; // rain, quick, groomer
const tortoise = species.tortoise; // sun, slow, basker
function card({ sp = otter, stage = "adult", flags = ["rainy"], babyTalk = false, resting = false, device = "d1" } = {}) {
  const c = new Card();
  const s = { species: sp, ids: { device }, resting, egg: stage === "egg", bubble: {}, pet: {}, written: [], moved: [] };
  c._state = (_s, id) => id === "sensor.life_stage" ? { state: stage } : { attributes: { flags } };
  c._babyStage = () => (babyTalk ? stage : null);
  c._write = (_s, text) => { s.written.push(text); s.bubble.textContent = text; };
  c._animate = (_s, _el, cls) => s.moved.push(cls);
  return { c, s };
}
const fresh = () => { oncePerDay.seen = new Set(); };

test("the sky reaction runs once a day, with a perk and a line for its own sky", () => {
  fresh();
  const { c, s } = card();
  assert.strictEqual(c._skyReact(s, false), true);
  assert.ok(SKY_REACT.rain.includes(s.written[0]));
  assert.deepStrictEqual(s.moved, ["perk"]);
  assert.strictEqual(c._skyReact(s, false), false, "not twice in a day");
  assert.strictEqual(s.written.length, 1);
});

test("a slow species settles instead of perking; a calm card gets the line only", () => {
  fresh();
  const slow = card({ sp: tortoise, flags: ["sunny"] });
  assert.strictEqual(slow.c._skyReact(slow.s, false), true);
  assert.deepStrictEqual(slow.s.moved, ["settle"]);
  fresh();
  const still = card();
  assert.strictEqual(still.c._skyReact(still.s, true), true);
  assert.deepStrictEqual(still.s.moved, []);
  assert.strictEqual(still.s.written.length, 1);
});

test("only the pet's own sky reacts: no dislike, nothing on another flag", () => {
  fresh();
  for (const flags of [["sunny"], ["snowy"], ["windy"], [], ["fireside"]]) {
    const { c, s } = card({ flags });
    assert.strictEqual(c._skyReact(s, false), false, flags.join());
    assert.deepStrictEqual(s.written, []);
  }
});

test("the fire falls back to the heating answering, then to the sun", () => {
  const gecko = species.gecko; // fire
  assert.strictEqual(nature(gecko).sky, "fire");
  for (const flags of [["fireside"], ["cozy"], ["sunny"]]) {
    fresh();
    const { c, s } = card({ sp: gecko, flags });
    assert.strictEqual(c._skyReact(s, false), true, flags.join());
    assert.ok(SKY_REACT.fire.includes(s.written[0]));
  }
  fresh();
  const none = card({ sp: gecko, flags: ["rainy"] });
  assert.strictEqual(none.c._skyReact(none.s, false), false);
});

test("not for an egg, a baby, baby talk, a resting pet or a species with no nature", () => {
  for (const opts of [{ stage: "egg" }, { stage: "baby" }, { stage: "child", babyTalk: true }, { resting: true },
    { sp: { ...otter, nature: undefined } }, { sp: { ...otter, nature: { ...otter.nature, sky: "lava" } } }]) {
    fresh();
    const { c, s } = card(opts);
    assert.strictEqual(c._skyReact(s, false), false, JSON.stringify(opts).slice(0, 60));
    assert.deepStrictEqual(s.written, []);
    assert.strictEqual(oncePerDay("sky-d1"), true, "the day's key is not spent"); // still unspent
  }
});

test("a child with no baby talk reacts (it gets the lines)", () => {
  fresh();
  const { c, s } = card({ stage: "child" });
  assert.strictEqual(c._skyReact(s, false), true);
});

test("a weather line in the last minute holds it off, without spending the key", () => {
  fresh();
  const { c, s } = card();
  s.skySaid = Date.now() - 30000;
  assert.strictEqual(c._skyReact(s, false), false);
  assert.strictEqual(oncePerDay("sky-d1"), true);
  fresh();
  s.skySaid = Date.now() - 61000;
  assert.strictEqual(c._skyReact(s, false), true);
});

test("the look rule: a day with the person's favourite-weather note said has no reaction, and the key waits", () => {
  fresh();
  const { c, s } = card();
  oncePerDay("favweather-said-d1"); // _note records it when the note is queued
  assert.strictEqual(c._skyReact(s, false), false);
  assert.deepStrictEqual(s.written, []);
  assert.strictEqual(oncePerDay("sky-d1"), true, "the key is unspent");
  fresh(); // a later day (or one without the note)
  assert.strictEqual(c._skyReact(s, false), true);
});

test("_note records the favourite-weather note under the key the reaction reads", () => {
  assert.match(method("_note"), /note\.kind === "fav_weather"\) oncePerDay\(`favweather-said-\$\{s\.ids\?\.device\}`\)/);
});

test("the weather and forecast moments stamp skySaid; sunset and morning read the clock lines", () => {
  const moment = method("_moment");
  assert.strictEqual((moment.match(/s\.skySaid = Date\.now\(\)/g) || []).length, 2);
  assert.match(moment, /_clockLines\(s, "sunset"\)/);
  assert.match(moment, /_clockLines\(s, "good_morning"\)/);
});

test("the clock lines follow nature.clock; no nature gives null (the usual lines)", () => {
  const { c, s } = card();
  assert.deepStrictEqual(bare(c._clockLines(s, "sunset")), bare(CLOCK_LINES.sunset.day));
  const owl = card({ sp: species.owl });
  assert.deepStrictEqual(bare(owl.c._clockLines(owl.s, "good_morning")), bare(CLOCK_LINES.good_morning.night));
  const none = card({ sp: { ...otter, nature: undefined } });
  assert.strictEqual(none.c._clockLines(none.s, "sunset"), null);
});

test("species adds: teen and adult only; the cadence scales for a quick or slow adult, a child too, a baby not", () => {
  const adult = card({ sp: species.squirrel }); // hoarder, quick
  assert.deepStrictEqual(bare(adult.c._speciesAdds(adult.s)), ["speck", "speck", "munch"]);
  const teen = card({ stage: "teen" });
  assert.deepStrictEqual(bare(teen.c._speciesAdds(teen.s)), bare(SPECIES_ADDS.groomer));
  for (const stage of ["egg", "baby", "child"]) {
    const x = card({ stage });
    assert.deepStrictEqual(bare(x.c._speciesAdds(x.s)), [], stage);
  }
  const scale = (o) => { const x = card(o); return x.c._idleScale(x.s); };
  assert.strictEqual(scale({ sp: species.squirrel }), 0.8);
  assert.strictEqual(scale({ sp: tortoise }), 1.25);
  assert.strictEqual(scale({ sp: species.deer }), 1);
  assert.strictEqual(scale({ sp: tortoise, stage: "child" }), 1.25);
  assert.strictEqual(scale({ sp: tortoise, stage: "baby" }), 1);
  assert.strictEqual(scale({ sp: { ...tortoise, nature: undefined } }), 1);
  ctx.calm = () => true;
  assert.strictEqual(scale({ sp: tortoise }), 1, "calm: the cadence is as it was");
  ctx.calm = () => false;
});

test("_idle draws nothing for the cadence scale, and the sky check comes after the promise", () => {
  const idle = method("_idle");
  assert.match(idle, /const scale = s\.vroom \? 1 : this\._idleScale\(s\)/);
  assert.ok(idle.indexOf("_promisePractice") < idle.indexOf("_skyReact"));
  assert.ok(idle.indexOf("_skyReact") < idle.indexOf("_idleMoves"));
  assert.match(grab(/\n  _idleMoves\([\s\S]*?\n  \}\n/), /"mumble"\]/); // mumble stays element 0
});
