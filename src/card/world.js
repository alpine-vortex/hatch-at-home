// Trait flair (Sol's ui/flair_*): every so often each trait the pet has shows as
// a little flair around it, never on it: above its head, in the air around it,
// or on the ground at its feet. One trait per place per moment; traits sharing a
// place take turns. "frames": a 2-frame animation (_1, _2); "pair": two
// variants (_1 big, _2 small); otherwise one image.
const FEED_FULL_AT = 95; // rates.py FEED_FULL_AT: a meal is refused above this
const TRAIT_CAP = 4; // rates.py TRAIT_CAP, until the server says (life_stage trait_cap)
const STAGE_DAYS = { teen: 5, adult: 14 }; // rates.py STAGE_STARTS (120 h, 336 h), from the egg
const LINK_AFTER_MS = [600000, 1500000]; // the infrared link: 10-25 min after the page loads (random)
// The day's first link waits for someone watching (gaps-seams 5a, owner Q7): 1-3 min into
// a look (the first tap or swipe on a shown card, after none for LINK_TOUCHED_MS), and
// only while the last one was under LINK_TOUCHED_MS ago. Never on a hidden tab or an
// untouched wall tablet. Later links keep LINK_AFTER_MS.
// An idle line about a neighbour on the shelf (gaps-seams 5b), 1 in 6 idle lines.
const NEIGHBOUR_ODDS = 1 / 6;
const NEIGHBOUR_LINES = [(n) => `wonder what ${n} is up to ♪`, (n) => `*waves toward ${n}*`, (n) => `i hope ${n} is having a nice day`];
const LINK_FIRST_MS = [60000, 180000];
const LINK_TOUCHED_MS = 300000;
// A link already today on this browser (oncePerDay's `hatch-link-<pair>-<day>` keys).
function linkedToday(day = new Date()) {
  const end = `-${day.toDateString()}`;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("hatch-link-") && key.endsWith(end)) return true;
    }
  } catch (err) {
    // no storage: oncePerDay's own memory
  }
  return [...(oncePerDay.seen || [])].some((key) => key.startsWith("hatch-link-") && key.endsWith(end));
}
const FLAIR_EVERY_MS = [50000, 70000]; // between moments (random in this range)
const FLAIR_MS = 4200; // how long a moment lasts
// A first look's one early move (fresh-moment 7): this long after the look begins (the
// greeting's line done, the first look's first one on), and given up if not free by
// FIRST_MOVE_LATE_MS after.
const FIRST_MOVE_MS = 6000;
const FIRST_MOVE_LATE_MS = 15000;
// A first look's missed day visitor waits at most this long for its turn (fresh-moment 3).
const LATE_VISIT_MS = 60000;
const FLAIR = {
  storm_watcher: { place: "head", art: "frames" },
  thunder_heart: { place: "head", art: "frames" },
  early_bird: { place: "head" },
  moon_child: { place: "head", art: "pair" },
  music_lover: { place: "air", art: "pair" },
  social_butterfly: { place: "air", art: "frames" },
  snow_child: { place: "air", art: "pair" },
  breeze_rider: { place: "air", art: "frames" },
  night_owl: { place: "air", art: "frames" },
  sun_lover: { place: "air" },
  fireside: { place: "ground", art: "pair" },
  fog_wanderer: { place: "ground" },
  helper: { place: "ground" },
  player: { place: "ground" },
  homebody: { place: "ground" },
  couch_potato: { place: "ground" },
};
// Seasonal touches, by the viewer's own date (month, day; inclusive; or a
// function of the year for a holiday that moves). Each world can differ ("*"
// is every other world). Card option `seasonal: false` turns them off;
// `seasonal: <key>` shows one now (a preview, and card-check).
//
// What a season can have (its art is ui/season_<key>_<name>.png):
// - lanterns: a ground piece of the day (part.lantern: "ground" or "float")
// - corner: a piece in the top corners (part.corners: the sides)
// - sweet: by the door (part.sweets) and popped at the pet's feet on the treat day
// - costumes: a hat of the day; sink: how far into the head it sits, in frame
//   pixels; width at the scene's scale; skip: creatures it doesn't suit
// - flyer: crosses the sky at night, and by day where part.dayFlyers (flock: how many)
// - nightFlyer: crosses the night sky where part.nightFlyer (the witch)
// - visitor: comes by now and then; the pet startles, then greets it
// - snack: the snack prop, with snackLines; treat: the treat day, with treatLine
//   (thanks: the pet thanks whoever cared for it most; else treatSay); countdown: its name
// - dated: lines for named days ({on: [[m, d], ...] or (year) => [[m, d], ...]}),
//   about 1 in 3 of the costume lines on the day, only with holiday names on
// - bunting, mist (at night), leaves (falling), chirp
const SEASONS = [
  {
    key: "halloween", from: [10, 20], to: [10, 31],
    worlds: {
      "*": { lantern: "ground", corners: ["right"], dayFlyers: false, sweets: false },
      tidepool: { lantern: "float" }, // the lantern bobs in the water
      pond: { lantern: "float" },
      hearth: { sweets: true }, // a sweet by the door
      terrarium: { corners: ["left", "right"] }, // a tarantula's tank
      nightsky: { dayFlyers: true, nightFlyer: true }, // bats by day too; the witch at night
    },
    lines: ["boo!", "happy Halloween!", "spooky~", "trick or treat! hehe", "look how spooky I am!"],
    treat: [10, 31],
    treatLine: "trick or treat!",
    countdown: "Halloween", // "3 sleeps till Halloween!" before the treat day
    costumes: [
      { art: "hat", sink: 7, width: 64 },
      { art: "pumpkin_cap", sink: 10, width: 60 },
      { art: "cat_ears", sink: 10, width: 76,
        skip: ["kitten", "bunny", "deer", "bat", "squirrel", "lunamoth"] },
      { art: "horns", sink: 9, width: 68, skip: ["deer"] },
    ],
    lanterns: ["pumpkin", "pumpkin_2", "pumpkin_3"], // a new face every day
    corner: "web",
    sweet: "sweet",
    snack: "candy",
    snackLines: ["candy!! ♪", "ooh, candy corn!", "a treat! ♪"],
    flyer: { art: ["bat_1", "bat_2"], cls: "sbat", ms: 5200 },
    nightFlyer: { art: "witch", cls: "switch", ms: 7500 },
    visitor: { art: ["ghost_1", "ghost_2"], cls: "sghost", ms: 6500, startle: "eep!!", jump: "sulk",
      greet: ["hehe, hi ghost!", "oh, it's just a friendly ghost~", "boo to you too!"] },
    chirp: "spooky",
    bunting: true,
    mist: true,
  },
  {
    // US Thanksgiving (the fourth Thursday of November): from 12 days before
    // to the Sunday after.
    key: "thanksgiving", from: (y) => thanksgiving(y, -12), to: (y) => thanksgiving(y, 3),
    worlds: {
      "*": { lantern: "ground", corners: ["right"], dayFlyers: true, sweets: false },
      hearth: { sweets: true }, // a plate by the door
      terrarium: { corners: ["left", "right"] },
    },
    lines: ["gobble gobble!", "happy Thanksgiving!", "I'm thankful for you ♥", "smells like pie...",
      "so cozy~", "look at all the leaves!"],
    treat: (y) => thanksgiving(y),
    treatLine: "happy Thanksgiving! ♥",
    thanks: true,
    countdown: "Thanksgiving",
    costumes: [
      { art: "pilgrim_hat", sink: 7, width: 64 },
      { art: "leaf_crown", sink: 9, width: 76 },
      { art: "feather_band", sink: 9, width: 68 },
      { art: "acorn_cap", sink: 10, width: 60 },
    ],
    lanterns: ["cornucopia", "gourds", "basket"],
    corner: "leaves",
    sweet: "plate",
    snack: "pie",
    snackLines: ["pie!! ♪", "pumpkin pie, my favourite!", "mmm, warm from the oven ♪"],
    flyer: { art: ["goose_1", "goose_2"], cls: "sgoose", ms: 8000, flock: 3 },
    visitor: { art: ["turkey_1", "turkey_2"], cls: "sturkey", ms: 7000, walk: true, startle: "gobble?!", jump: "perk",
      greet: ["hi, turkey!", "happy Thanksgiving, turkey ♪", "gobble gobble to you too!"] },
    chirp: "harvest",
    bunting: true,
    leaves: true,
  },
  {
    // Winter lights: 1-31 December, after Thanksgiving (which wins 1 Dec in the
    // years it reaches it). Card only: no server holiday, no phone greeting. By the
    // viewer's date, so a hot December gets it too (northern bias, accepted).
    key: "winter", from: [12, 1], to: [12, 31],
    worlds: {
      "*": { lantern: "ground", corners: ["right"], dayFlyers: false, sweets: false }, // nightsky too
      tidepool: { lantern: "float" },
      pond: { lantern: "float" },
      hearth: { sweets: true }, // a mug by the door
      terrarium: { corners: ["left", "right"] },
    },
    lines: ["happy holidays! ♥", "merry everything ♪", "so many lights!", "twinkle twinkle ♪",
      "happy winter!", "cozy lights~"],
    dated: [
      { on: [[12, 24]], lines: ["Christmas Eve! ♪", "merry Christmas! ♥"] },
      { on: [[12, 25]], lines: ["merry Christmas! ♥"] },
      { on: (y) => hanukkahDays(y), lines: ["happy Hanukkah! ♥", "the lights are glowing ♪"] },
      { on: [[12, 31]], lines: ["happy new year soon!", "new year's eve! ♪"] },
    ],
    treat: [12, 21],
    treatLine: "so many lights! ♥",
    treatSay: "a little treat ♪",
    costumes: [
      { art: "knit_cap", sink: 8, width: 64 },
      { art: "earmuffs", sink: 9, width: 76 },
      { art: "light_wreath", sink: 9, width: 76 },
      { art: "star_cap", sink: 8, width: 60 },
    ],
    lanterns: ["paper_lantern", "star_lamp", "snow_lantern"],
    corner: "frost",
    sweet: "mug",
    snack: "cookie",
    snackLines: ["cookie!! ♪", "a star cookie, yay!"],
    flyer: { art: ["twinkle_1", "twinkle_2"], cls: "stwinkle", ms: 6500 },
    visitor: { art: ["hare_1", "hare_2"], cls: "snowhare", ms: 7000, walk: true, startle: "oh!", jump: "perk",
      greet: ["hi, little hare!"] },
    chirp: "harvest",
    bunting: true,
  },
];
// Hanukkah's first day ([month, day]: the civil date of 25 Kislev) in a year,
// from the browser's Hebrew calendar; null without one (then no Hanukkah lines,
// never wrong ones). Its eight days run on into January some years.
const HANUKKAH = new Map();
function hanukkah(year) {
  if (HANUKKAH.has(year)) return HANUKKAH.get(year);
  let at = null;
  try {
    const fmt = new Intl.DateTimeFormat("en-u-ca-hebrew", { month: "long", day: "numeric" });
    if (fmt.resolvedOptions().calendar === "hebrew") {
      for (let d = new Date(year, 10, 20); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
        const parts = fmt.formatToParts(d);
        const month = parts.find((x) => x.type === "month")?.value;
        const day = Number(parts.find((x) => x.type === "day")?.value);
        if (month === "Kislev" && day === 25) {
          at = [d.getMonth() + 1, d.getDate()];
          break;
        }
      }
    }
  } catch (err) {
    at = null; // no Intl calendars
  }
  HANUKKAH.set(year, at);
  return at;
}
// Hanukkah's days in December of a year (and the end of November when it starts early).
function hanukkahDays(year) {
  const first = hanukkah(year);
  if (!first) return [];
  return Array.from({ length: 8 }, (_, i) => {
    const d = new Date(year, first[0] - 1, first[1] + i);
    return [d.getMonth() + 1, d.getDate()];
  });
}
// The costume lines on a date: { lines, dated }, without festival names when off.
function seasonLines(season, date = new Date(), named = namedHolidays()) {
  const lines = unnamed(season.lines || [], named);
  if (!named || !season.dated) return { lines, dated: [] };
  const y = date.getFullYear();
  const today = (on) => (typeof on === "function" ? on(y) : on)
    .some(([m, d]) => m === date.getMonth() + 1 && d === date.getDate());
  return { lines, dated: season.dated.filter((x) => today(x.on)).flatMap((x) => x.lines) };
}
// One costume line: a named day's about 1 in 3, else the season's own.
function seasonLine(season, date = new Date(), named = namedHolidays()) {
  const { lines, dated } = seasonLines(season, date, named);
  return dated.length && Math.random() < 1 / 3 ? pick(dated) : pick(lines);
}
// Thanksgiving's [month, day] in a year (the fourth Thursday of November),
// moved by `days`.
function thanksgiving(year, days = 0) {
  const first = new Date(year, 10, 1).getDay(); // 0 Sunday ... 4 Thursday
  const at = new Date(year, 10, 1 + ((4 - first + 7) % 7) + 21 + days);
  return [at.getMonth() + 1, at.getDate()];
}
const seasonDate = (when, year) => (typeof when === "function" ? when(year) : when);
const HEAD_SPRITE = 75; // px the sprite is drawn at inside a head crop (UX7 F2)
const HEAD_TOPS = new Map(); // frame|x -> the top of the head (see _headTop)
const FRAME_IMGS = new Map(); // src -> Image, for measuring frames not on show
const SEASON_COSTUME_MS = [600000, 900000]; // between costume moments (10-15 min)
const SEASON_FLYER_MS = [20000, 45000]; // between bats (or geese) flying by
const SEASON_VISITOR_MS = [240000, 420000]; // between ghosts (or turkeys)
const SEASON_NIGHT_FLYER_MS = [120000, 240000];
// The same pick all day for one pet: a small hash of the device and the date.
// The day lines take turns by (dailyPick, turnPick, the promise, a dream's callback): today,
// moved by whole days only under card-check (window.__hatchDayShift), so a run can stand
// on any day. Nothing else reads it.
const turnNow = () => new Date(Date.now() + (Number(globalThis.__hatchDayShift) || 0) * 864e5);
const dailyPick = (list, salt = "") => {
  const key = `${salt}|${turnNow().toDateString()}`;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
};
// Fresh-expand E1 (docs/plan-2026-11-01-fresh-expand.md): a line said once a day, in
// turns. The local date as a day number (read as UTC, so a DST day is still one day).
const dayOrdinal = (date = turnNow()) => Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
const turnHash = (text) => {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return h;
};
// One cycle's order of n: a shuffle seeded by the salt and the cycle.
const turnOrder = (n, salt, cycle) => {
  const order = [...Array(n).keys()];
  let x = turnHash(`${salt}|${cycle}`) || 1;
  for (let i = n - 1; i > 0; i--) {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    const j = x % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
};
// The list in turns, a day each: no line twice within n days, each cycle of n days in
// its own order (a cycle never opens with the last one's last line), and two salts
// (pets, keys) not in step. Pure: the same list, salt and day give the same line.
function turnPick(list, salt = "", date = turnNow()) {
  const n = list?.length || 0;
  if (n < 2) return list?.[0];
  const day = dayOrdinal(date);
  if (n === 2) return list[(day + turnHash(salt)) % 2];
  const cycle = Math.floor(day / n);
  const order = turnOrder(n, salt, cycle);
  if (order[0] === turnOrder(n, salt, cycle - 1)[n - 1]) [order[0], order[1]] = [order[1], order[0]];
  return list[order[day % n]];
}
// World visitors (docs/plan-2026-10-31-visitors.md, v2: plan-2026-11-01-visitors-v2.md):
// on about 4 days in 7 a small creature from the pet's world drops by at the scene's
// edge and the pet greets it. The server picks the day's visit and its window
// (house.visit); the card plays it, and keeps only "this screen played it" (the day's
// localStorage flag). With no house.visit (a subscribed older server) the card picks
// as v1 did (visitorDay). The roster (id, name, hours: "day" on a day screen, "night"
// on a night or dim one) is worlds.json's; the play data is here, by id: walk (on the
// ground line, else it flies in), cross (no stop: straight over), in (ms to arrive),
// stay (ms at the edge), lines (its two; VISIT_LINES are everyone's), catchup (its own
// catch-up line instead of "a <name> came by today ♪").
// Art: frontend/ui/visitor_<world>_<id>_<1|2>.png, 72 x 72 (18 x 18 world cells
// at 4 px a cell, as the props), shown 18 cells wide.
const VISIT_LINES = ["oh! a visitor ♪", "hi there, friend!"];
const VISITOR_PLAY = {
  chickadee: { lines: ["chick-a-dee-dee! ♪", "hello, little chickadee!"] },
  stellersjay: { lines: ["ooh, so blue!", "hi, jay! ♪"] },
  snail: { walk: true, in: 2600, stay: 4200, lines: ["take your time, snail~", "hello, slow friend"] },
  pillbug: { walk: true, lines: ["hi, pill bug! don't roll away~", "you look like a tiny armadillo!"] },
  ladybird: { lines: ["a ladybird! lucky ♪", "hi, ladybird! nice spots ♪"] },
  moth: { lines: ["hi, moth! the light's over there~", "hello, fuzzy friend ♪"] },
  robin: { walk: true, lines: ["hello, robin! ♪", "a robin at the window!"] },
  mouse: { walk: true, in: 900, lines: ["shh... hi, mouse ♪", "here, have a crumb ♪"] },
  cricket: { walk: true, lines: ["cri-cri! ♪", "sing me a song, cricket"] },
  gull: { lines: ["hi, gull! no snacks here~", "you smell like the sea ♪"] },
  shorecrab: { walk: true, lines: ["sideways hello! ♪", "hi, little crab!"] },
  seastar: { walk: true, in: 2600, stay: 4800, lines: ["a star in the water!", "hello, sea star~"] },
  dragonfly: { in: 900, lines: ["zoom! hi, dragonfly ♪", "so shiny!"] },
  strider: { walk: true, lines: ["whoa, it walks on water!", "hi, strider ♪"] },
  heron: { walk: true, in: 2000, lines: ["a heron! so tall...", "shh, it's fishing~"] },
  shootingstar: { catchup: "a shooting star went by! ♪", cross: true, lines: ["a shooting star! make a wish ✦", "whoa, look at it go! ✦"] },
  nighthawk: { lines: ["hi, nighthawk ♪", "my night flyer friend! ♪"] },
  raccoon: { walk: true, lines: ["hello, masked friend!", "a raccoon! say hi ♪"] },
};
// A world's visitors: worlds.json's roster ({id, name, hours, leaves?}, the server's
// too), in its order, each with its play data here; one with none is skipped.
const visitorList = (world) => (Array.isArray(world?.visitors) ? world.visitors : [])
  .filter((v) => VISITOR_PLAY[v?.id]).map((v) => ({ ...VISITOR_PLAY[v.id], ...v }));
// Finds (plan visitors v2 §3, §7): the reveal's lines, over a find's `a` from worlds.json
// ("a pine cone"). find (V1): one per find, by dailyPick salted with world|id; fresh (V2):
// a first-ever find; left (V3): a find a visitor left, by its roster name as is (a new one
// it left gets this line and the sparkle). A baby says BABY.find (V4).
const FIND_LINES = {
  find: [(a) => `${a}! ♪`, (a) => `look, ${a} ♪`, (a) => `ooh, ${a}~`],
  fresh: [(a) => `${a}! a new one ✦`],
  left: [(a, who) => `the ${who} left ${a} ♪`],
};
const FIND_STEP_MS = 2500; // the reveal: one find each
const FIND_LINE_MS = 2200; // its line, gone before the next find's
const FOUND_BITS = 3; // the away note's "found <a find>" bits, newest first
// Release switch (owner, 2026-11-01): on with V-F's final art. While on, the card shows
// the basket, reveal and find line (V1-V4), the "found" bit in the away note (V8), the
// gift take, line and pop (V5-V7), and the finds on the finds page. Turned off, it shows
// none of them (it never sends collect {gift}, so a gift waits on the server) and the
// finds page draws its visitors only. The server is the same either way: finds and gifts
// keep accruing. Read through findsShown(), so card-check and the bench can set it
// (HatchPetCard.findsShown).
const FINDS_SHOWN = true;
const findsShown = () => !!HatchPetCard.findsShown;
// Gifts (plan visitors v2 §5, §7 V5-V7): said once, on the receiver's own screen, at a
// first look. V5 names the find (its `name`, so "message in a bottle" is 40 characters);
// a gift-only find has no name in the line: "made" for the three in GIFT_MADE, "found"
// for the other three (V6). A baby says BABY.gift (V7). No personality words, no nickname.
const GIFT_MADE = ["acorncup", "knittedheart", "paperboat"];
const GIFT_LINES = {
  find: (name) => `saved this ${name} for you ♥`,
  made: "made this for you ♥",
  found: "found this for you ♥",
};
const GIFT_LINE_MS = 5000; // the line, and the pop above the pet with it
// A find in worlds.json ({id, name, a, ...}), or null for one this card doesn't know.
const findOf = (worlds, world, id) => (Array.isArray(worlds?.[world]?.finds) &&
  worlds[world].finds.find((f) => f?.id === id)) || null;
// The collection page's tiles (plan visitors v2 §4, V-D) for one world (worlds.json's
// entry) from the virtual_pet/collection reply ({visitors: [id], finds: {id: day},
// gifts?}); `own` is the viewer's own unshared screen, the only one that reads `gifts`.
// Each tile is {kind: "visitor"|"find", id, name, met, heart}: met is drawn with its
// name, unmet is a silhouette with none. A find with a `when` and a gift-only one get no
// tile until met (owner, 2026-11-02); a find the viewer got as a gift is drawn with a ♥
// on their own screen, found by the house or not. Ids worlds.json lacks are skipped.
const collectionTiles = (world, reply, own) => {
  const seen = new Set(Array.isArray(reply?.visitors) ? reply.visitors : []);
  const found = reply?.finds && typeof reply.finds === "object" ? reply.finds : {};
  const gifts = new Set(own && Array.isArray(reply?.gifts) ? reply.gifts : []);
  const out = visitorList(world).map((v) => ({ kind: "visitor", id: v.id, name: v.name, met: seen.has(v.id), heart: false }));
  for (const f of Array.isArray(world?.finds) ? world.finds : []) {
    if (!f?.id) continue;
    const heart = gifts.has(f.id);
    const met = (!f.gift_only && Object.hasOwn(found, f.id)) || heart;
    if (!met && (f.gift_only || (Array.isArray(f.when) && f.when.length))) continue; // hidden until met
    out.push({ kind: "find", id: f.id, name: f.name, met, heart });
  }
  return out;
};
// The away note's bit for a `found` moment ({id, world}), or null.
const foundBit = (worlds, m) => {
  const f = findOf(worlds, m?.world, m?.id);
  return f?.a ? `found ${f.a}` : null;
};
const VISIT_FRIEND_AFTER = 3; // sighting days on this screen before a visitor is a friend (E3)
// Rare visits, card only (E10): no credit, nothing kept but the guest's day flag.
const PAIR_ODDS = 15; // a planned visit brings a friend 1 day in this many (V-b)
const GUEST_ODDS = 30; // a no-visit day brings a guest 1 day in this many (V-c)
const PAIR_BEHIND_MS = 1500; // the friend comes in this far behind, from the other side
const GUEST_HOURS = { day: 9, night: 19 }; // the guest's window starts: 3 hours each
// The pet's promise (F3): a 21-day cycle per pet (offset by its device), the topic by cycle.
// Day 0 the promise, days 1-3 practice now and then, day 4 the payoff (to day 7 if missed).
const PROMISE_CYCLE = 21;
const PROMISE_TOPICS = ["hop", "spin", "song"];
const PROMISE_PAYOFF = [4, 7]; // the first look from day 4, up to day 7, then it lapses
const PROMISE_PRACTICE_ODDS = 1 / 3; // an idle's chance of practice, days 1-3
function promiseDay(device, date = turnNow()) {
  const n = dayOrdinal(date) + (turnHash(`promise|${device || ""}`) % PROMISE_CYCLE);
  const cycle = Math.floor(n / PROMISE_CYCLE);
  return { day: n % PROMISE_CYCLE, cycle, topic: PROMISE_TOPICS[cycle % PROMISE_TOPICS.length] };
}
const CRUMB_ODDS = 1 / 15; // a feed's chance of the crumb line, once a day (E4 F-b)
const BUBBLE_POP_ODDS = 1 / 8; // a clean's chance of one bubble drifting up and popping (E4 M-b)
// The meal by the hour on this device (E4 F-a): null from 22 to 05.
const mealPart = (hour) => (hour >= 5 && hour < 11 ? "breakfast" : hour >= 11 && hour < 16 ? "lunch" : hour >= 16 && hour < 22 ? "supper" : null);
const VISIT_IN_MS = 1400; // to arrive (or leave), unless the visitor says
const VISIT_STAY_MS = 3000; // at the edge, past the greet's start
const VISIT_SWIPE_GRACE_MS = 600; // a swipe away and back within it keeps the visitor
const VISIT_CALM_MS = 5000; // reduced motion: still, then gone
const VISIT_CHECK_MS = 20000; // between looks for a visit
const VISIT_SHOWN_MS = 10000; // the slide on show this long first
const VISIT_AFTER_MS = 120000; // after an infrared link, before a visitor; a seasonal one after this
// One pet's day: is it a visit day, which of its world's three comes, and the
// start hour of each kind's 3-hour window. A day index (the local calendar date,
// read as UTC, so a DST day is still one day) plus an offset from the device:
// 4 visit days in every 7, and the three take turns, so any 21 days hold every
// visitor (12 visit days). Pure: the same date and device give the same day.
function visitorDay(date, device) {
  const day = Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
  let h = 0;
  for (const ch of `visit|${device || ""}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const n = day + (h % 7);
  const pos = n % 7;
  const visit = pos < 4;
  const who = visit ? (Math.floor(n / 7) * 4 + pos + (h >>> 3)) % 3 : null;
  let w = h ^ day;
  w = Math.imul(w ^ (w >>> 15), 0x2c1b3c6d) >>> 0;
  return { visit, who, day: 9 + (w % 7), night: 19 + ((w >>> 8) % 2) };
}
// Today's visitor once its 3-hour window is over (that day's or night's), else null:
// the catch-up's pick (the screen's kind doesn't matter, only the clock). Pure.
function visitorMissed(list, date, device) {
  const d = visitorDay(date, device);
  const v = d.visit && list?.[d.who];
  if (!v) return null;
  return date.getHours() >= (v.hours === "night" ? d.night : d.day) + 3 ? v : null;
}
// Once per device per day (localStorage; once per page load without it). The day is
// the browser's today, or a given one (a Date: the server's day for a visit).
function oncePerDay(name, day = new Date()) {
  const key = `hatch-${name}-${day.toDateString()}`;
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, "1");
  } catch (err) {
    if (oncePerDay.seen?.has(key)) return false;
    (oncePerDay.seen ??= new Set()).add(key);
  }
  return true;
}
// Which pet is on show, kept per browser (UX fix 2, F8): a reload, a phone waking a dropped tab
// or a rebuilt dashboard view comes back to it, not to the first. Keyed by the card's first
// device, so two cards don't share a place; a device that is gone is ignored.
function shelfKey(devices) {
  return `hatch-shelf-${devices[0]?.device || devices[0]}`;
}
function shelfRead(devices) {
  try {
    return localStorage.getItem(shelfKey(devices));
  } catch (err) {
    return null;
  }
}
function shelfWrite(ids, index) {
  try {
    localStorage.setItem(shelfKey(ids), ids[index]);
  } catch (err) {
    // no storage: the place is not kept
  }
}
// The pet this person's card opens on (the favourite, plan favourite-resting §5.3), by its
// device: a copy of the server's, so a page load opens there before the channel speaks. A
// shared screen keeps the household's default instead (no person). Every snapshot refreshes it.
const OPEN_ON_WAIT_MS = 1500; // the first time (no copy yet): the channel may still move the card
function openOnKey(user, shared) {
  return shared ? "hatch-open-house" : user ? `hatch-open-${user}` : null;
}
function openOnRead(key) {
  try {
    return key ? localStorage.getItem(key) : null;
  } catch (err) {
    return null;
  }
}
function openOnWrite(key, device) {
  try {
    if (!key) return;
    if (device) localStorage.setItem(key, device);
    else localStorage.removeItem(key);
  } catch (err) {
    // no storage: the card opens as it would with no choice
  }
}
// Was oncePerDay(name) used today on this browser? (Read only.)
function usedToday(name, day = new Date()) {
  const key = `hatch-${name}-${day.toDateString()}`;
  try {
    return !!localStorage.getItem(key);
  } catch (err) {
    return !!oncePerDay.seen?.has(key);
  }
}
// Once on this browser, ever (a key that isn't per day, so pruning leaves it).
function onceEver(name) {
  const key = `hatch-${name}`;
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, "1");
  } catch (err) {
    if (onceEver.seen?.has(key)) return false;
    (onceEver.seen ??= new Set()).add(key);
  }
  return true;
}
// Whether onceEver(name) has already been spent, without spending it.
function onceSeen(name) {
  const key = `hatch-${name}`;
  try {
    return !!localStorage.getItem(key);
  } catch (err) {
    return !!onceEver.seen?.has(key);
  }
}
const WEEK_OLD = ["one week old today! ♥", "a whole week together! ♥"]; // gaps-seams 1b
// The card's own per-day keys (oncePerDay's `hatch-<name>-<Date.toDateString()>`, and the
// treat's `hatch-treat-...-<toDateString>`) older than PRUNE_DAYS go, once at card start.
// Only keys that start "hatch-" and end in a day like "Fri Oct 31 2026" are touched.
const PRUNE_DAYS = 14;
const DATED_KEY = /^hatch-.+-((?:Sun|Mon|Tue|Wed|Thu|Fri|Sat) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{2} \d{4})$/;
function pruneDatedKeys(now = Date.now()) {
  try {
    const old = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const day = key && DATED_KEY.exec(key);
      const at = day && new Date(day[1]).getTime();
      if (at && now - at > PRUNE_DAYS * 86400000) old.push(key);
    }
    old.forEach((key) => localStorage.removeItem(key));
  } catch (err) {
    // no storage: nothing piles up
  }
}
const seasonPart = (season, world) => ({ ...season.worlds["*"], ...season.worlds[world] });
function seasonNow(config, date = new Date()) {
  if (config?.seasonal === false) return null;
  if (typeof config?.seasonal === "string") return SEASONS.find((x) => x.key === config.seasonal) || null;
  const md = [date.getMonth() + 1, date.getDate()];
  const after = (a, b) => a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1]);
  const year = date.getFullYear();
  return SEASONS.find((x) => after(md, seasonDate(x.from, year)) && after(seasonDate(x.to, year), md)) || null;
}

