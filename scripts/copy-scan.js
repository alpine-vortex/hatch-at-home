// The fresh-expand copy scan (docs/plan-2026-11-01-fresh-expand.md, E1): every table in
// the card's fresh-expand block must be named in COPY_TABLES, so a new table can't skip
// the scan, and every line in them is checked: no nagging words, 40 characters at most
// with the longest fill, no "?" outside a question, no "!!!", no digits. Card-check runs
// it (section "types"), and so does node --test (tests/js/fresh_copy.test.js).
// A table's spec: `fill` (the one slot's kind), `fills` (a key's slots, in order), `asks`
// (keys that may hold "?"), `aria` (keys that are only an aria-label: not on screen, so
// no 40-character cap; the nag, digit and "!!!" rules still hold).
const vm = require("vm");

const NAG = /\b(still|again|why|never|pleas\w*|sad|cry|alone|forgot\w*)\b/i;
// The longest fill for each kind of slot: a visitor's name, a pet's name, typed text.
const FILL = {
  visitor: "hearth cricket", // the longest visitor name in worlds.json
  name: "Wwwwwwwwwwww", // 12
  it: "Wwwwwwwwwwwwwwwwwwww", // 20, the typed text's cap (FM dialogue pass)
  creature: "Mexican red-knee tarantula", // 26, the longest creature name
  pick: "higher or lower", // 15, the longest pick label a memory door says (GAMES)
  season: "spring", // 6, as long as every season's name
  home: "vivarium", // 8, the longest words.home of the 30 species
  day: "Wwwwwww", // 7, the memory page's short date ("30 Sept"): its digits are a date, not a count
  weekday: "wednesday",
  label: "something else", // the longest MEMORY_TAG_CHIPS label
  plabel: "lesson", // the longest label a weekday pattern can have (match, show, lesson)
  // The longest row a memory page "forget this" names: a pattern's.
  row: "wednesdays: you often mention lesson",
};
// Each table: the fill its functions take, and the keys (at any depth) that may ask.
// `fills`: a line with more than one slot, by its key: the fill of each, in order.
const COPY_TABLES = {
  PERSONA_FRESH: {},
  PAT_SPOT: {},
  PAT_RUN_LINES: {}, // care reactions C: the touch ladder's lines
  VISIT_FRIENDS: {},
  WAKE_LINES: {},
  NIGHT_VISITOR: { fill: "visitor" },
  NIGHT_SUNSET: {},
  FIRST_NIGHT: {},
  MEAL_LINES: {},
  CRUMB_LINE: { fill: "visitor" },
  CURED_LINES: {},
  GAME_PICK_LINES: {},
  LUCKY_LINE: {},
  DIG_WATCH: { fill: "visitor" },
  SHINY_LINE: {},
  WISH_MORE: {},
  WELCOME_BACK: {},
  FAV_LINES: {},
  FAV_WEATHER_LINES: {},
  TRICK_LINES: {},
  LINK_VISITOR_NEWS: { fill: "visitor" },
  LINK_NEWS_REPLY: {},
  PAIR_LINES: {},
  VISIT_GUEST: {},
  PROMISE_LINES: {},
  PROMISE_MID: {},
  SEASON_FIRST_LINES: {},
  DREAM_STORIES: {},
  DREAM_TAIL: {},
  DREAM_CALLBACK: {},
  BIG_DAY: { fill: "it", asks: ["q", "which", "what", "how", "howText"] },
  SOFT_MORNING: {},
  FAVV_LINES: { fill: "visitor", asks: ["q"] },
  WEEKEND: { fill: "it", asks: ["q"] },
  GAME_TOMORROW: { asks: ["q"] },
  TRICK_ASK: { asks: ["q"] },
  MEMORY_ASK: { asks: ["q"] }, // memory plan M1b: the one-time ask
  MEMORY_DOORS: { fill: "pick" }, // doors 2, 4, 5, 12
  MEMORY_TOLD: { fill: "season" }, // door 6
  MEMORY_TAG_CHIPS: { asks: ["q"] }, // memory plan M2: the tag chips
  MEMORY_TAG_DOORS: {}, // doors 1, 3, 10, 11
  HOUSE_LINES: {},
  SEASON_START_LINES: {}, // ha-signals H7
  SEASON_START_BITS: {},
  HOUSE_MOMENT_LINES: {}, // H8: virtual_pet.react, by category
  SETTINGS_COPY: {}, // settings UX fix 1 (F12, F16)
  SETTINGS_REACT: {}, // settings UX fix 1 (F14)
  STATUS_COPY: { fill: "creature" }, // status UX fix 2 (F12, F14)
  TALK_COPY: {}, // talking UX fix 3 (F11, F12, F14)
  GAME_COPY: {}, // games UX fix 6 (F8, F12, Q8)
  SETUP_COPY: { fill: "creature" }, // settings S2: the lay sheet (the longest name is C15')
  RESTING_IDLE: {}, // resting R1 (plan favourite-resting §4.6)
  REST_LINES: {},
  SKY_REACT: {}, // species nature N1 (plan-2026-11-02-species-nature.md)
  CLOCK_LINES: {},
  FEED_LINES: {}, // care reactions B1 (plan-2026-11-02-care-reactions.md 14)
  SNACK_LINES: {}, // care reactions B2
  LIGHTS_LINES: {}, // care reactions D: the tuck and the wake
  SPECIES_LINES: { fill: "home" }, // species nature N2: the habit action lines
  SITTER_LINES: {}, // sitter plan 9 (S3a): Pip's lines about the sitter
  MEMORY_PAGE: { // memory plan M3a: the "things you told me" page
    asks: ["gate_q", "forget_sure", "forget_pattern_sure"],
    aria: ["aria_forget"], // aria labels are not on screen: length only is exempt (first mate 2026-11-05)
    fills: {
      since: ["day"], fav_weather: ["season", "day"], fav_season: ["season", "day"],
      day_row: ["label", "day"], pick_dream: ["pick", "day"], pick_game: ["pick", "day"],
      pick_guess: ["pick", "day"], pick_great: ["day"], pattern: ["weekday", "plabel"],
      aria_forget: ["row"],
    },
  },
};

function lines(value, path, out) {
  if (typeof value === "string" || typeof value === "function") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => lines(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) if (k !== "move") lines(v, `${path}.${k}`, out); // a move name is not copy
  }
  return out;
}

// The card's source -> { bad: [problems], count: lines scanned, tables: [names] }.
function scanFreshCopy(src) {
  const bad = [];
  const parts = src.split("\n// --- fresh-expand copy");
  if (parts.length !== 2) return { bad: ["no single fresh-expand copy block"], count: 0, tables: [] };
  const block = parts[1].split("\n// --- end fresh-expand copy")[0];
  const tables = [...block.matchAll(/\nconst ([A-Z_]+) = /g)].map((m) => m[1]);
  for (const name of tables) if (!COPY_TABLES[name]) bad.push(`${name}: not in COPY_TABLES`);
  for (const name of Object.keys(COPY_TABLES)) if (!tables.includes(name)) bad.push(`${name}: in COPY_TABLES, not in the card`);
  const values = vm.runInNewContext(`${block.replace(/^[^\n]*\n/, "")}\n({${tables.join(", ")}})`);
  let count = 0;
  for (const name of tables) {
    const spec = COPY_TABLES[name] || {};
    for (const [where, entry] of lines(values[name], name, [])) {
      const slots = spec.fills?.[where.split(".").pop()];
      const line = typeof entry !== "function" ? entry
        : slots ? entry(...slots.map((k) => FILL[k])) : entry(FILL[spec.fill] ?? FILL.name);
      count++;
      if (typeof line !== "string" || !line.trim()) { bad.push(`${where}: not a line`); continue; }
      const asks = (spec.asks || []).some((k) => where.includes(`.${k}`));
      const aria = (spec.aria || []).includes(where.split(".").pop());
      if (NAG.test(line)) bad.push(`${where}: "${line}" nags`);
      if (line.includes("?") && !asks) bad.push(`${where}: "${line}" asks`);
      if (/!!!/.test(line)) bad.push(`${where}: "${line}" !!!`);
      if (/\d/.test(line)) bad.push(`${where}: "${line}" has a digit`);
      if ([...line].length > 40 && !aria) bad.push(`${where}: "${line}" ${[...line].length} long`);
    }
  }
  return { bad, count, tables };
}

module.exports = { scanFreshCopy, COPY_TABLES, FILL, NAG };
