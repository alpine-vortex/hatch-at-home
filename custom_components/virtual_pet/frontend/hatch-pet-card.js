// Hatch at Home: the device shelf. One card holds every pet device: each is
// a handheld toy themed for its world, standing on that world's backdrop.
// Arrows, dots or a swipe move to the next device. All state lives in Home
// Assistant; the card only draws and presses the pets' buttons and switch.

const VERSION = "0.36.0b1";
const BASE = "/virtual_pet/frontend";

// Outline icons for the shelf's own arrows; everything on a device is pixel art.
const ICON_PATHS = {
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
};

// Sol's pixel icons (frontend/ui). Drawn on a 24-pixel grid at 4x, so 24 and
// 48 CSS pixels stay crisp.
function pixelIcon(name, size = 24, alt = "") {
  return `<img class="picon" src="${BASE}/ui/${name}.png?v=${VERSION}" width="${size}" height="${size}" alt="${alt}">`;
}

const ACTION_ICONS = {
  feed: "icon_feed", snack: "icon_snack", play: "icon_play", clean: "icon_clean",
  medicine: "icon_medicine", scold: "icon_scold", praise: "icon_praise",
};

// Higher or Lower's numbers: a 5×7 pixel font drawn at whole screen pixels per
// art pixel, so they stay crisp (Tiny5's 3-wide digits make an 8 hard to read).
const DIGITS = {
  1: ["..X..", ".XX..", "..X..", "..X..", "..X..", "..X..", ".XXX."],
  2: [".XXX.", "X...X", "....X", "...X.", "..X..", ".X...", "XXXXX"],
  3: ["XXXX.", "....X", "....X", ".XXX.", "....X", "....X", "XXXX."],
  4: ["...X.", "..XX.", ".X.X.", "X..X.", "XXXXX", "...X.", "...X."],
  5: ["XXXXX", "X....", "XXXX.", "....X", "....X", "X...X", ".XXX."],
  6: ["..XX.", ".X...", "X....", "XXXX.", "X...X", "X...X", ".XXX."],
  7: ["XXXXX", "....X", "...X.", "..X..", ".X...", ".X...", ".X..."],
  8: [".XXX.", "X...X", "X...X", ".XXX.", "X...X", "X...X", ".XXX."],
  9: [".XXX.", "X...X", "X...X", ".XXXX", "....X", "...X.", ".XX.."],
};
function digit(n, px = 6) {
  const rows = DIGITS[n] || DIGITS[8];
  let rects = "";
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === "X") rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }));
  return `<svg width="${5 * px}" height="${7 * px}" viewBox="0 0 5 7" fill="currentColor" ` +
    `shape-rendering="crispEdges" role="img" aria-label="${n}">${rects}</svg>`;
}

// Icons for the game picker.
function gameIcon(key) {
  if (key === "left_right") return `${icon("prev", 16)}${icon("next", 16)}`;
  if (key === "higher_lower") return `${digit(1, 2)}<span class="gi-arrow">↕</span>${digit(9, 2)}`;
  return `<img src="${BASE}/ui/flair_player.png?v=${VERSION}" width="20" height="20" alt="">`;
}

function icon(name, size = 22) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

const ACTIONS = [
  { key: "feed", label: "feed", wants: "hungry" },
  { key: "snack", label: "snack" },
  { key: "play", label: "play", aria: "play a game", wants: "bored" },
  { key: "clean", label: "clean", wants: "dirty" },
  { key: "medicine", label: "meds", aria: "meds: give medicine", wants: "sick" },
  { key: "scold", label: "scold" },
  { key: "praise", label: "praise" },
];

// What the pet says back when a care action did nothing.
// The games the play button offers (virtual_pet.play_game), in picker order.
const GAMES = [
  { key: "left_right", label: "left or right", guesses: ["left", "right"] },
  { key: "higher_lower", label: "higher or lower", guesses: ["lower", "higher"] },
];
const LAST_GAME_KEY = "hatch-last-game";
// Catch, the Giga Pets reflex game: a prototype, offered only with the card
// option experimental_catch: true. The card times the taps; nothing goes to the
// server and it gives no reward.
const CATCH_GAME = { key: "catch", label: "catch!", guesses: ["left", "right"] };
const CATCH = {
  rounds: 5, winAt: 3,
  travel: [1.9, 1.0], // seconds for the prop to reach the pet, round 1 to round 5
  window: [1.2, 0.6], // the last part of its trip in which a tap catches it
  decoyChance: 0.25, // from round 2
};
const BEST_CATCH_KEY = "hatch-best-catch";

// Sounds: little square-wave chirps, off until someone turns them on for this
// device (status screen). Never while the pet sleeps, nor late at night.
const SOUND_KEY = "hatch-sounds";
const QUIET_HOURS = [21, 8]; // from 21:00 to 08:00 local time
const CHIRPS = { // [frequency Hz, length s] notes, played one after another
  call: [[880, 0.08], [0, 0.05], [880, 0.08]],
  hatch: [[523, 0.09], [659, 0.09], [784, 0.09], [1047, 0.16]],
  win: [[784, 0.08], [988, 0.08], [1319, 0.18]],
  trait: [[1047, 0.07], [1319, 0.07], [1568, 0.07], [2093, 0.14]],
  spooky: [[660, 0.12], [622, 0.12], [587, 0.12], [523, 0.26]],
  harvest: [[523, 0.1], [659, 0.1], [784, 0.1], [659, 0.1], [784, 0.22]],
  birthday: [[523, 0.12], [523, 0.1], [587, 0.22], [523, 0.22], [698, 0.22], [659, 0.4]],
};
let audio = null; // one AudioContext for every card on the page

// Voices (species.json "voice"): now and then a line opens with the creature's
// sound ("tweet! hi, Sam!"), never twice within VOICE_QUIET_MS, so a burst of
// lines carries it once. Lines type out at its pace; with "babble" on for this
// browser (off by default), each letter is a tiny syllable at its pitch.
const BABBLE_KEY = "hatch-babble";
const BABBLE_MAX_S = 1.2;
const VOICE_QUIET_MS = 120000;
const VOICE_MAX = 60; // characters: past this the sound is left off
// Lines that open with a sound of their own (whole words, any case).
const OPENERS = /^(?:[*♪…]|\.\.\.|(?:hmm+|hehe|boo|gobble|crack|eep|eek|news|o+h+|brr+|aww+|mm+h?|ew|whe+|la la|yay|zzz|pitter)(?![a-z]))/i;

function babbleOn() {
  try {
    return localStorage.getItem(BABBLE_KEY) === "on";
  } catch (err) {
    return false;
  }
}

function unlockAudio() {
  audio ||= new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === "suspended") audio.resume();
}

// Stop one babble (its oscillators, from babble()).
function stopBabble(oscs) {
  for (const osc of oscs || []) {
    try {
      osc.stop();
    } catch (err) {
      // already done
    }
  }
}

// A babble: a syllable per letter (vowels a little higher), spaces and marks
// a pause, at the creature's pitch and pace; quieter than the chirps. Only
// once a tap has unlocked audio (else it would wait and play out of turn).
// Returns its oscillators, or null.
function babble(text, voice) {
  if (audio?.state !== "running") return null;
  const oscs = [];
  const step = 1 / voice.pace;
  let t = audio.currentTime + 0.01;
  const end = t + BABBLE_MAX_S;
  for (const ch of text) {
    if (t >= end) break;
    if (/\p{L}/u.test(ch)) {
      const lower = ch.toLowerCase();
      const semis = (lower.codePointAt(0) % 7) - 3 + (/[aeiouy]/.test(lower) ? 2 : 0);
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "triangle";
      osc.frequency.value = voice.pitch * 2 ** (semis / 12);
      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.045);
      oscs.push(osc);
    }
    t += step;
  }
  return oscs;
}

function soundsOn() {
  try {
    return localStorage.getItem(SOUND_KEY) === "on";
  } catch (err) {
    return false;
  }
}

// A shared screen (a wall tablet signed in as one person): this browser shows
// nothing personal, no names, notes, questions or bond, and makes no visits.
const SHARED_KEY = "hatch-shared-screen";
// Fired on window when the switch flips, so every card on the page follows.
const SHARED_EVENT = "hatch-shared-changed";
function sharedScreen() {
  try {
    return localStorage.getItem(SHARED_KEY) === "on";
  } catch (err) {
    return false;
  }
}

// Baby talk (the person's own switch, on the server; cached here per user ID so
// the first greeting of a page load already knows): simpler words while a pet
// is a baby or a child. Never on a shared screen.
const BABY_TALK_KEY = "hatch-baby-talk-";
const BABY_TALK = new Map(); // user ID -> on, as last heard on this page (for no storage)
function babyTalk(userId) {
  if (!userId || sharedScreen()) return false;
  try {
    const kept = localStorage.getItem(BABY_TALK_KEY + userId);
    if (kept !== null) return kept === "on";
  } catch (err) {
    // no storage (a private window): what this page heard
  }
  return BABY_TALK.get(userId) === true;
}
function setBabyTalk(userId, on) {
  if (!userId) return;
  BABY_TALK.set(userId, on);
  try {
    localStorage.setItem(BABY_TALK_KEY + userId, on ? "on" : "off");
  } catch (err) {
    // no storage (a private window): this page remembers it
  }
}

// Answers that did not get through (after a quiet retry), kept per person so a
// once-question's try is not lost: sent again when the card next has a user.
// Never on a shared screen, never a birthday, never a dream or a guess.
const ANSWERS_KEY = "hatch-answers-";
const ANSWER_RETRY_MS = 3000;
const ANSWER_RESEND_EVERY_MS = 60000; // after a transport failure
const ANSWER_KEEP_DAYS = 14; // ASK_LIKES_AGAIN_DAYS on the server
const STASHED_QUESTIONS = ["fav_weather", "fav_season", "catchphrase"];
function stashedAnswers(userId) {
  try {
    const list = JSON.parse(localStorage.getItem(ANSWERS_KEY + userId) || "[]");
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
}
function saveStashedAnswers(userId, list) {
  try {
    if (list.length) localStorage.setItem(ANSWERS_KEY + userId, JSON.stringify(list));
    else localStorage.removeItem(ANSWERS_KEY + userId);
  } catch (err) {
    // no storage (a private window): not kept
  }
}

function playChirp(name) {
  const notes = CHIRPS[name];
  if (!notes) return;
  audio ||= new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === "suspended") audio.resume();
  let t = audio.currentTime + 0.01;
  for (const [freq, len] of notes) {
    if (freq) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + len);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + len);
    }
    t += len;
  }
}

// Trait flair (Sol's ui/flair_*): every so often each trait the pet has shows as
// a little flair around it, never on it: above its head, in the air around it,
// or on the ground at its feet. One trait per place per moment; traits sharing a
// place take turns. "frames": a 2-frame animation (_1, _2); "pair": two
// variants (_1 big, _2 small); otherwise one image.
const FEED_FULL_AT = 95; // rates.py FEED_FULL_AT: a meal is refused above this
const TRAIT_CAP = 4; // rates.py TRAIT_CAP, until the server says (life_stage trait_cap)
const FLAIR_EVERY_MS = [50000, 70000]; // between moments (random in this range)
const FLAIR_MS = 4200; // how long a moment lasts
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
//   (thanks: the pet thanks whoever cared for it most); countdown: its name
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
    lines: ["boo!", "happy Halloween!", "spooky~", "trick or treat?", "do I look spooky?"],
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
    snackLines: ["pie!! ♪", "pumpkin pie, my favourite!", "mmm, still warm ♪"],
    flyer: { art: ["goose_1", "goose_2"], cls: "sgoose", ms: 8000, flock: 3 },
    visitor: { art: ["turkey_1", "turkey_2"], cls: "sturkey", ms: 7000, startle: "gobble?!", jump: "perk",
      greet: ["hi, turkey!", "happy Thanksgiving, turkey ♪", "gobble gobble to you too!"] },
    chirp: "harvest",
    bunting: true,
    leaves: true,
  },
];
// Thanksgiving's [month, day] in a year (the fourth Thursday of November),
// moved by `days`.
function thanksgiving(year, days = 0) {
  const first = new Date(year, 10, 1).getDay(); // 0 Sunday ... 4 Thursday
  const at = new Date(year, 10, 1 + ((4 - first + 7) % 7) + 21 + days);
  return [at.getMonth() + 1, at.getDate()];
}
const seasonDate = (when, year) => (typeof when === "function" ? when(year) : when);
const HEAD_TOPS = new Map(); // frame|x -> the top of the head (see _headTop)
const FRAME_IMGS = new Map(); // src -> Image, for measuring frames not on show
const SEASON_COSTUME_MS = [600000, 900000]; // between costume moments (10-15 min)
const SEASON_FLYER_MS = [20000, 45000]; // between bats (or geese) flying by
const SEASON_VISITOR_MS = [240000, 420000]; // between ghosts (or turkeys)
const SEASON_NIGHT_FLYER_MS = [120000, 240000];
// The same pick all day for one pet: a small hash of the device and the date.
const dailyPick = (list, salt = "") => {
  const key = `${salt}|${new Date().toDateString()}`;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
};
// Once per device per day (localStorage; once per page load without it).
function oncePerDay(name) {
  const key = `hatch-${name}-${new Date().toDateString()}`;
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, "1");
  } catch (err) {
    if (oncePerDay.seen?.has(key)) return false;
    (oncePerDay.seen ??= new Set()).add(key);
  }
  return true;
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

// Catch's decoy: Sol's bee (ui/catch_decoy_1, _2: wings up, down), facing left.
const BEE_FRAMES = [1, 2].map((n) => `${BASE}/ui/catch_decoy_${n}.png?v=${VERSION}`);
const BEE_FLAP_MS = 120;

const REFUSALS = {
  full: "I'm full!",
  not_needed: "I'm fine, thanks!",
  asleep: "shh... sleeping",
  too_tired: "too tired to play",
  already_clean: "it's already clean!",
  not_sick: "I'm not sick!",
  unfair: "hey, I didn't do anything!",
  spoiled: "hehe, whining works",
  no_game: "let's start over",
  egg: "...",
  away: "I'm at the sitter's!",
  not_sleepy: "not sleepy yet ♪",
};

// Actions that borrow another action's prop sprite.
const PROP_FOR = { game: "play", chore_treat: "snack" };
// Sol's shared props, for every species that has no own ("../ui/" leaves sprites/).
const FALLBACK_PROPS = { scold: "../ui/prop_scold", praise: "../ui/prop_praise", fan: "../ui/prop_fan" };
// Missing sprites are reported once each in the console.
const WARNED = new Set();

// Home flags that swap the pet into a special pose (species.json "extras").
const POSES = {
  too_bright: "squint", chilly: "shiver", storm: "shiver", warm: "sweat", masked: "mask",
  dancing: "dance", watching_tv: "watch_tv",
};
// Shared house poses; a species' other extras are its own (used for idle life).
const SHARED_POSES = new Set(Object.values(POSES));
// What the journal calls a memory.
const MEMORY_LABELS = { first_snow: "first snow", first_frost: "first frost" };
// Idle life: something small every so often when nothing else is going on.
const IDLE_MIN_MS = 20000;
const IDLE_SPREAD_MS = 25000;
const IDLE_MOODS = new Set(["content", "cozy", "bored", "excited", "sleepy", "hungry", "dirty"]);
const IDLE_LINES = new Set(["sleepy", "bored", "excited", "hungry", "dirty"]); // the rest say the default lines
// A viewer is greeted by name at most this often, per pet.
const GREET_EVERY_MS = 3 * 3600 * 1000;
// Daily check-ins. The day's wish (life_stage "wish"), in the pet's words and
// short for the status screen; its dream (life_stage "dream"); the "while you
// were out" note after this long away (per device).
const WISHES = {
  play: ["I wish we could play a game today!", "play a game together"],
  snack: ["I'd love a snack after lunch!", "a snack after lunch"],
  bath: ["I wish I could have a bubble bath!", "a bubble bath"],
  praise: ["I hope someone says I'm good today", "hear \"good job!\""],
  tuck_in: ["will you tuck me in tonight?", "be tucked in tonight"],
  sunset: ["can we watch the sunset together?", "watch the sunset together"],
  music: ["I wish we could listen to music today ♪", "some music"],
  tv: ["can we watch something together today?", "watch TV together"],
  chore: ["I'd love a treat from a chore today", "a chore treat"],
  rain: ["I hope I get to see the rain today", "see the rain"],
  say_hi: ["will you come say hi this afternoon?", "a hello this afternoon"],
};
// A wish aimed at a close friend (the channel's "mine.wish_for_you"): said to
// them, and short for their status screen. Anyone else sees the plain wish.
const WISHES_FOR = {
  play: ["will you play a game with me today?", (n) => `play a game with ${n}`],
  snack: ["will you bring me a snack after lunch?", (n) => `a snack from ${n}`],
  bath: ["will you give me a bubble bath today?", (n) => `a bubble bath from ${n}`],
  praise: ["will you tell me I'm good today?", (n) => `hear "good job!" from ${n}`],
  say_hi: ["will you come say hi this afternoon?", (n) => `a hello from ${n}`],
};
// "will you play?" + "sunbeam" -> "will you play, sunbeam?"; "night night ♥" -> "night night, sunbeam ♥"
const withName = (line, name) => (name ? line.replace(/([!?.]*)(\s*♥)?$/, `, ${name}$1$2`) : line);
// Baby talk: a line's simpler versions, by the pet's stage (sensor.life_stage),
// for the lines that carry no news (docs/plan-2026-10-28-phase5-baby-talk.md).
// A key or stage that isn't here keeps its normal line. A function takes the
// name or food; names are never rewritten. Only call lines may ask.
const BABY = {
  "greet": { baby: [(n) => `hi hi, ${n}!`, (n) => `${n}!! hi hi!`] },
  "greet.warm": { baby: [(n) => `${n}!! ♥`, (n) => `yay yay, ${n}!`] },
  "greet.nickname": { baby: [(n) => `hi hi, ${n}!`, (n) => `${n}!! ♥`, (n) => `my ${n}!! yay yay`] },
  "idle.sleepy": { baby: ["*yawn*", "sleepy...", "nap time..."] },
  "idle.bored": { baby: ["hmm...", "la la la"] },
  "idle.excited": { baby: ["hehe!", "yay yay!"] },
  "idle.hungry": { baby: ["*tummy rumbles*", "snack time..."] },
  "idle.default": { baby: ["♪ la la ♪", "*looks around*"] },
  "yum": { baby: [(food) => `yum yum, ${food}!`] },
  "favourite_snack": { baby: [(food) => `${food}! yay yay!`] },
  "wish_granted": { baby: ["yay yay! ♥"] },
  "friend_home": { baby: ["you're home! yay yay ♥"] },
  "care_miss": { baby: ["oh! hi hi ♥"] },
  "tucked_in": { baby: ["night night ♥"] }, // withName: "night night, Sam ♥"
  "bond_up": { baby: ["yay, you! ♥"] },
  "WISHES.play": { baby: ["wish... play today"] },
  "WISHES.snack": { baby: ["wish... snack after lunch"] },
  "WISHES.bath": { baby: ["wish... bubble bath!"] },
  "WISHES.tuck_in": { baby: ["wish... tuck me in tonight"] },
  "REFUSALS.full": { baby: ["tummy full!"] },
  "REFUSALS.too_tired": { baby: ["too sleepy to play"] },
  "REFUSALS.not_sleepy": { baby: ["no sleepy!"] },
  // The mood line (sensor.mood reason_key): one line each, as it's redrawn
  // every tick. Statements, except the calls. home_* and weight_* stay normal.
  "reason.call_hunger": { baby: ["hungy!"], child: ["tummy rumbly!"] },
  "reason.call_sick": { baby: ["owie... medicine?"], child: ["feeling icky, medicine?"] },
  "reason.call_dirty": { baby: ["stinky! clean?"], child: ["it's getting stinky!"] },
  "reason.call_energy": { baby: ["sleepy... bedtime?"], child: ["so sleepy... bedtime?"] },
  "reason.call_happiness": { baby: ["play play?"] },
  "reason.sleepy_drowsy": { baby: ["sleepy..."] },
  "reason.sleepy_low": { baby: ["sleepy..."] },
  "reason.hungry": { baby: ["a little hungy"], child: ["a little hungry"] },
  "reason.dirty": { baby: ["messy..."] },
  "reason.bored": { baby: ["la la la"] },
  "reason.excited": { baby: ["yay yay!"], child: ["that was fun! yay!"] },
  "reason.cozy": { baby: ["cozy cozy"] },
  "reason.content": { baby: ["happy!"], child: ["all good!"] },
  // In place of season.lines (the costume bubble); children keep the normal ones.
  "season.halloween": { baby: ["boo!", "boo! hehe", "spooky~", "yay, costume!"] },
  "season.thanksgiving": { baby: ["gobble gobble!", "pie! yum yum", "thank you ♥", "cozy cozy~", "leaves!"] },
};
// Personality (P2a): each type's own lines, for a teen or an adult whose
// life_stage carries a personality (docs/plan-2026-10-28-personality-types.md).
// A fair coin picks between the type's lines and the normal pick, so the voice
// is about half of what's said at each key. A function takes the name or food.
const PERSONA = {
  mellow: {
    reveal: ["I think I'm the mellow kind ♪", "mellow, that's me... ♪"],
    hello: [(n) => `oh hey, ${n}... ♪`, (n) => `${n}... hi hi ♥`, (n) => `mm, ${n}! comfy day ♪`],
    hello_shared: ["oh hey, everyone... ♪", "mm... hi, all ♥"],
    hello_warm: [(n) => `${n}! comfy day, huh ♥`, (n) => `${n}... come sit a while ♥`],
    hello_hearts: [(n) => `${n}... come nap with me ♥`, (n) => `${n}, my nap buddy ♥`],
    good_morning: ["mmh... morning already...", "five more minutes... ♪", "morning... slow and easy"],
    sunset: ["sunset... perfect nap light", "mm, warm and orange...", "a lazy sky tonight ♪"],
    fell_asleep: ["best part of the day... zzz", "comfy... zzz", "night... ♪ zzz"],
    wish_granted: ["my wish! that's so nice ♥", "mm, my wish came true ♥", "a wish come true... nice ♪"],
    favourite_snack: [(food) => `${food}... my favourite... ♥`, (food) => `mm, ${food}... yum ♥`, (food) => `${food}! snack time ♪`],
  },
  sweet: {
    reveal: ["I think I'm the sweet kind ♥", "sweet, that's me ♥"],
    hello: [(n) => `hi, ${n}! glad you're here ♥`, (n) => `hello hello, ${n} ♥`, (n) => `${n}! hi! ♥`],
    hello_shared: ["hi, everyone! ♥", "hello, hello ♥"],
    hello_warm: [(n) => `${n}! you made my day ♥`, (n) => `${n}! I'm so glad you came ♥`],
    hello_hearts: [(n) => `${n}, I saved you a hug ♥`, (n) => `${n}! you feel like home ♥`],
    good_morning: ["good morning! hope you slept well", "morning! ♥ a fresh new day", "morning! I tidied up ♥"],
    sunset: ["the sky's all pink ♥", "what a soft sky ♥", "sunset already, how nice"],
    fell_asleep: ["sweet dreams ♥", "night night ♥", "all tucked in ♥"],
    wish_granted: ["my wish came true ♥", "a wish come true! ♥", "my wish! so happy ♥"],
    favourite_snack: [(food) => `${food}! my favourite ♥`, (food) => `ooh, ${food}! ♥`, (food) => `${food}! yum yum ♥`],
  },
  bouncy: {
    reveal: ["I think I'm the bouncy kind!", "bouncy! that's me! hup!"],
    hello: [(n) => `${n}!! hup hup!`, (n) => `${n}! let's go! ♥`, (n) => `hiya, ${n}! *bounce*`],
    hello_shared: ["hiya, everyone! hup!", "hup hup! hi!"],
    hello_warm: [(n) => `${n}! yay yay! ♥`, (n) => `${n}! I'm all bouncy now ♥`],
    hello_hearts: [(n) => `${n}!! my heart's hopping! ♥`, (n) => `${n}! my hup-hup pal ♥`],
    good_morning: ["morning!! let's go!", "up and hopping!", "morning! ready, set, go!"],
    sunset: ["the sun's racing down!", "zoom, there goes the sun!", "the sky's going orange!"],
    fell_asleep: ["big day! night night", "phew! night night", "all hopped out... zzz"],
    wish_granted: ["my wish!! yes yes!", "wish come true! woo!", "my wish! hup hup! ♥"],
    favourite_snack: [(food) => `${food}! power snack!!`, (food) => `${food}! yes!`, (food) => `${food}! hup hup!`],
  },
  starry: {
    reveal: ["I think I'm the starry kind ★", "a star is born! that's me ★"],
    hello: [(n) => `${n}! you're here! ★`, (n) => `ah, ${n}! my audience ★`, (n) => `${n}! cue the music ★`],
    hello_shared: ["hello, everyone! ★", "welcome, welcome! ★"],
    hello_warm: [(n) => `hi hi, superstar ${n} ★`, (n) => `${n}! take a bow with me ★`],
    hello_hearts: [(n) => `${n}! my front-row friend ★`, (n) => `${n}! my stage lights up ★`],
    good_morning: ["morning! a brand new show ★", "rise and shine! ★", "morning! ♪ la la ♪"],
    sunset: ["the sky's putting on a show!", "what a finale! ★", "bravo, sky! bravo! ★"],
    fell_asleep: ["and... curtain! night ★", "that's a wrap! night ★", "lights down... zzz ★"],
    wish_granted: ["a wish come true! ★", "my wish! encore! ★", "dreams do come true ★"],
    favourite_snack: [(food) => `${food}! a snack for a star ★`, (food) => `${food}! bravo! ★`, (food) => `ooh, ${food}! ★`],
  },
  old_soul: {
    reveal: ["hm. an old soul, I think.", "an old soul. suits me."],
    hello: [(n) => `hello, ${n}.`, (n) => `hello there, ${n}.`, (n) => `${n}. come in, come in.`],
    hello_shared: ["hello, all.", "hm. hello there."],
    hello_warm: [(n) => `ah, ${n}. good to see you ♥`, (n) => `${n}. sit, sit. ♥`],
    hello_hearts: [(n) => `${n}. glad it's you ♥`, (n) => `ah, ${n}. my old friend ♥`],
    good_morning: ["morning. the kettle's on", "morning. a fine day for it", "hm. morning, then."],
    sunset: ["they don't make sunsets like this", "a fine sunset, that.", "hm. lovely, that sky."],
    fell_asleep: ["night, now. sleep well.", "off to bed. night.", "a good day. night ♥"],
    wish_granted: ["well, now. a wish come true ♥", "hm. my wish. how nice ♥", "well. that's a fine thing ♥"],
    favourite_snack: [(food) => `ah, ${food}. the good stuff`, (food) => `${food}. now that's proper`, (food) => `hm. ${food}. very nice`],
  },
  fancy: {
    reveal: ["I think I'm the fancy kind ♥", "fancy, that's me. how lovely ♥"],
    hello: [(n) => `${n}! what a lovely surprise`, (n) => `oh, ${n}! how lovely ♥`, (n) => `${n}! welcome, welcome ♥`],
    hello_shared: ["oh, how lovely! hello ♥", "welcome, darlings ♥"],
    hello_warm: [(n) => `${n}, darling! ♥`, (n) => `${n}! come see my corner ♥`],
    hello_hearts: [(n) => `${n}! you brighten my day ♥`, (n) => `${n}! darling, it's you ♥`],
    good_morning: ["morning! what a pretty day", "morning! time to fluff up ♥", "good morning, darling ♥"],
    sunset: ["pink and gold, my colours", "what a pretty sky ♥", "ooh, so elegant tonight"],
    fell_asleep: ["beauty sleep time ♥", "night night, darlings ♥", "off to my silk pillow ♥"],
    wish_granted: ["a wish, granted! lovely ♥", "my wish! how divine ♥", "a wish come true, darling ♥"],
    favourite_snack: [(food) => `${food}, how elegant ♥`, (food) => `${food}! simply divine ♥`, (food) => `ooh, ${food}! fancy ♥`],
  },
  charming: {
    reveal: ["I'm the charming kind, I think ♥", "charming, that's me ♥"],
    hello: [(n) => `ah, ${n}! a delight`, (n) => `${n}! what an honour ♥`, (n) => `${n}! the room lights up`],
    hello_shared: ["ah, everyone! a delight ♥", "welcome, dear friends ♥"],
    hello_warm: [(n) => `${n}! my dear friend ♥`, (n) => `${n}! what a treat ♥`],
    hello_hearts: [(n) => `${n}, my dear, dear friend ♥`, (n) => `${n}! how grand, it's you ♥`],
    good_morning: ["good morning, sunshine!", "a splendid morning to you", "morning! what an occasion"],
    sunset: ["a sunset, just for us", "how grand, this sky ♥", "a splendid sunset ♥"],
    fell_asleep: ["goodnight, dear friends ♥", "until tomorrow, friends ♥", "a splendid day. night ♥"],
    wish_granted: ["my wish! how splendid ♥", "a wish come true! grand ♥", "what a marvellous wish ♥"],
    favourite_snack: [(food) => `${food}! exquisite ♥`, (food) => `ah, ${food}! splendid ♥`, (food) => `${food}, what a treat ♥`],
  },
  plucky: {
    reveal: ["I'm the plucky kind! hmph ♥", "plucky, that's me! ♥"],
    hello: [(n) => `yo, ${n}!`, (n) => `hey, ${n}! all clear here`, (n) => `${n}! reporting for duty`],
    hello_shared: ["yo, everyone!", "hey hey! all clear here"],
    hello_warm: [(n) => `${n}! I've got your back ♥`, (n) => `${n}! you and me, team ♥`],
    hello_hearts: [(n) => `${n}! my partner ♥`, (n) => `${n}! partners for life ♥`],
    good_morning: ["up and at 'em!", "morning! all clear", "rise and shine, team!"],
    sunset: ["nice sky. I'll keep watch", "sun's down. all quiet", "not bad, sky. not bad"],
    fell_asleep: ["I'll keep watch. night ♥", "night, team ♥", "all safe. sleep tight ♥"],
    wish_granted: ["my wish! heck yes! ♥", "a wish come true! hah ♥", "wish granted! nice ♥"],
    favourite_snack: [(food) => `${food}! now we're talking`, (food) => `${food}! that's the stuff`, (food) => `${food}! fuel up ♥`],
  },
};
const FRIEND_WELCOME_MS = 6 * 3600 * 1000; // "welcome home!" at the next look, this long after
const FIRST_LOOK_LINES = 3; // lines queued at the first look (the visit's notes fill what's left)
// Titles, artists and names cut so a line fits the bubble on a 330 px card.
const short = (text, max = 30) => {
  const chars = Array.from(text || ""); // whole characters: never half an emoji
  return chars.length > max ? `${chars.slice(0, max - 1).join("").trimEnd()}…` : text;
};
const WELCOME_SAME_ARRIVAL_MS = 10 * 60 * 1000; // pets' reports this close: one arrival
// Questions the pet asks; the server picks which and when (visit's "ask"), so
// the daily limit holds across pets and devices. "keep" answers go back to the
// server (virtual_pet/answer); the others stay on the card.
const ASK_MS = 60000; // a question stays this long (it was not asked for, so focus stays put)
const QUESTIONS = {
  how_day: { q: "how was your day?", answers: {
    great: ["yay!! that makes me so happy ♥", "a great day! tell me everything! ♥"],
    ok: ["ok days are good days too ♥", "I'm glad you're here now ♥"],
    tough: ["aww... come here *snuggle* ♥", "I'm here for you ♥ *cuddle*"] } },
  slept: { q: "did you sleep well?", answers: {
    great: ["yay! ♥ good morning!", "me too! ♥"],
    ok: ["a cozy morning then ♥"],
    "not really": ["aww, take it easy today ♥", "a slow morning then... *yawn* ♥"] } },
  fav_weather: { q: "what's your favourite weather?", keep: true, answers: {
    sun: ["sunny days! me too ☀"], rain: ["ooh, cozy rain ☂"], snow: ["snow!! ❄ I'll remember"],
    storms: ["storms! so exciting!"] } },
  fav_season: { q: "what's your favourite season?", keep: true, answers: {
    spring: ["spring! flowers everywhere ♪"], summer: ["summer! sunshine! ☀"],
    autumn: ["autumn! crunchy leaves ♪"], winter: ["winter! snuggly ❄"] } },
  dream: { q: "what should I dream about tonight?", keep: true, answers: {
    stars: ["the stars... ok!"], sea: ["the sea! ok!"], snacks: ["snacks!! yum, ok!"], you: ["you! ♥ ok!"] } },
  guess: { q: "rain or sun tomorrow?", keep: true, answers: {
    rain: ["rain! we'll see ☂"], sun: ["sun! we'll see ☀"] } },
  // Theirs, kept privately on the server ("skip" sticks; forgotten on the status screen).
  birthday: { q: "when's your birthday?", keep: true, answers: { ok: null, skip: null },
    picker: () => `<select class="bmonth" aria-label="month">${MONTHS.map((m, i) =>
      `<option value="${i + 1}">${m}</option>`).join("")}</select>` +
      `<select class="bday" aria-label="day">${dayOptions(31)}</select>`,
    changed: (box, e) => {
      if (!e.target.classList.contains("bmonth")) return;
      const day = box.querySelector(".bday");
      const keep = Number(day.value);
      day.innerHTML = dayOptions(new Date(2000, Number(e.target.value), 0).getDate()); // 2000: 29 Feb
      day.value = String(Math.min(keep, day.options.length));
    },
    value: (box, a) => (a === "skip" ? "skip"
      : `${box.querySelector(".bmonth").value.padStart(2, "0")}-${box.querySelector(".bday").value.padStart(2, "0")}`),
    reply: (a) => (a === "skip" ? "ok! ♥"
      : `${MONTHS[Number(a.slice(0, 2)) - 1]} ${Number(a.slice(3))}! I'll remember ♥`) },
  // The pet's own, from a close friend (the server checks it asked).
  catchphrase: { q: "what should I say at the end of things?", keep: true,
    answers: { hehe: null, yay: null, "and stuff": null, "la la": null, keep: null },
    label: (a, s, mine) => (a === "keep" ? `keep "${mine}"` : a),
    reply: (a, s, mine) => (a === "keep" ? `ok! I'll keep saying "${mine}" ♥` : `ok! I'll say "${a}"! ♥`) },
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayOptions = (n) => Array.from({ length: n }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
// Its yearly birthday: a party hat (the season costume code places it) and confetti.
const PARTY = { key: "party", costumes: [{ art: "hat", sink: 7, width: 56 }],
  lines: ["party hat on! ♪", "do you like my party hat?", "best birthday ever! ♪"] };
// The visit's celebration lines: one a look, and always a place for it.
const CELEBRATION_NOTES = new Set(["your_birthday", "pet_birthday", "birthday_friends", "friends_for"]);
const months = (n) => `${n} month${n === 1 ? "" : "s"}`;
const PLACES = {
  gym: "back from the gym?! so strong!", work: "home from work! ♥",
  school: "back from class? ♥", park: "did you have fun at the park?",
};
const HOME_WEATHER = {
  wet: "it's wet out there! come get cozy ☂", snowy: "snow on your shoes! ❄",
  cold: "brr, was it cold out there?", hot: "you must be thirsty after that heat!",
};
const SEASON_ICONS = { spring: "♪", summer: "☀", autumn: "♥", winter: "❄" };
// What the pet tells only you (virtual_pet.visit's notes), each once.
const NOTES = {
  pet_birthday: (n) => (n.years ? `it's my birthday!! I'm ${n.years} today! ♥` : `I'm ${months(n.months)} old today! ♥`),
  birthday_friends: (n) => `I'm ${months(n.months)} old, and we've been friends all that time! ♥`,
  your_birthday: (n) => (n.quiet ? "happy birthday ♥" : "happy birthday!! ♥"), // _note adds the name
  friends_for: (n) => n.months % 12 === 0
    ? `we've been friends for ${n.months === 12 ? "a whole year" : `${n.months / 12} years`}!! ♥`
    : `we've been friends for ${n.months === 1 ? "a month" : `${n.months} months`}! ♥`,
  tucked_in: () => pick(["thanks for tucking me in last night ♥", "I slept so well after you tucked me in ♥"]),
  steps: (n) => `${n.steps.toLocaleString()} steps?! you've been busy!`,
  more_than_usual: () => pick(["you've walked way more than usual today!", "so many steps today! you've been so active!"]),
  best_day: () => "your most active day in weeks!! ♥",
  bike: () => "were you on a bike?! wheee!",
  run: () => "did you go for a run?! so fast!",
  stairs: (n) => `${n.floors} floors of stairs?! you're a climber!`,
  rested: () => pick(["you got a good sleep! ♥", "you slept so well! ♥"]),
  rain_walk: () => pick(["you walked in the rain?! so brave!", "out in the rain and still so many steps! ☂"]),
  snow_walk: () => "you went walking in the snow?! ❄ so brave!",
  dream: (n) => n.pick === "you"
    ? (n.yours ? "I dreamed about you, like you said! ♥" : "I dreamed about my friends ♥")
    : `I dreamed about ${{ stars: "the stars", sea: "the sea", snacks: "snacks" }[n.pick] || n.pick}${n.yours ? ", like you said! ♥" : "..."}`,
  guess: (n) => n.outcome === "right"
    ? (n.guess === "rain" ? "you were right!! it rained ☂" : "you were right!! sunny ☀")
    : n.outcome === "wrong"
      ? (n.guess === "rain" ? "oh, sunny after all! good guess though ♥" : "oh, it rained after all! good guess though ♥")
      : "it was cloudy all day! nobody wins ♥",
  back_from: (n) => PLACES[n.place],
  fav_weather: (n) => ({ sun: "it's sunny, your favourite! ☀", rain: "it's raining, your favourite! ☂",
    snow: "it's snowing, your favourite!! ❄", storms: "a storm! your favourite!" })[n.weather],
  season: (n) => n.holiday
    ? `${n.holiday === "halloween" ? "Halloween" : "Thanksgiving"} in your favourite season! ♥`
    : `it's ${n.season}, your favourite! ${SEASON_ICONS[n.season] || ""}`.trim(),
  early_alarm: () => "early start tomorrow? sleep well ♥",
  up_early: () => "mmh... you're up before the sun... zzz ♥",
  photo: () => "I made you something! it's in your journal ♥",
};
const DREAMS = {
  watching: (d) => `I dreamed about ${short(d.title)}!`,
  listening: (d) => `♪ I dreamed of ${short(d.title)} ♪`,
  rain_started: () => "I dreamed it was raining...",
  rainbow: () => "I dreamed about a rainbow!",
  snow_started: () => "I dreamed of snow ❄",
  moon: () => "I dreamed I flew to the moon!",
  game: () => "I dreamed we played and I won!",
  chore: () => "I dreamed about treats...",
  wish: () => "I dreamed my wish came true again ♥",
  trait: () => "I had such a big dream last night...",
  flying: () => "I dreamed I could fly!",
  clouds: () => "I dreamed I napped on a cloud...",
  feast: (d, w) => `I dreamed about a mountain of ${w?.food || "snacks"}!`,
};
const AWAY_NOTE_AFTER_MS = 3 * 3600 * 1000;
// A bond with each person (only the viewer's own, from the private channel's
// "mine"). What each level brings, as in rates.py: a warmer hello, a
// hop when they look in, the nickname it picked, its favourite of their games,
// and hearts only for them.
const BOND = { warm: 2, hop: 3, nickname: 4, favourite: 6, hearts: 8, max: 10 };
// The private channel (virtual_pet/subscribe): the viewer's own view of a pet
// and the house's, pushed to this connection only. A failed subscribe (the pet
// mid-reload, or HA still starting) is tried again after each of these, then
// every RETRY_LAST_MS while the slide exists; the first look waits at most
// SUBSCRIBE_WAIT_MS for it.
const SUBSCRIBE_RETRY_MS = [2000, 5000, 15000];
const SUBSCRIBE_RETRY_LAST_MS = 60000;
const SUBSCRIBE_WAIT_MS = 3000;
const MOMENTS_KEPT = 10; // const.py MOMENTS_KEPT
// Moments that come only over the channel: a person's own (const.py
// PERSONAL_EVENTS) and the house's shows and songs (MEDIA_EVENTS). The public
// list may still carry them; the card never reads them there.
const CHANNEL_ONLY = new Set(["bond_up", "bond_record", "bond_favourite", "friend_home", "tucked_in", "watching", "listening"]);
const MEDIA_MOMENTS = new Set(["watching", "listening"]);
const momentKey = (m) => m && `${m.at}|${m.type}`;
const VISIT_EVERY_MS = 3600 * 1000; // virtual_pet.visit, as the server counts it
const VISIT_RETRY_MS = 5 * 60 * 1000; // after a visit that didn't count
const WISH_MENTION_MS = [600000, 900000]; // between reminders of an open wish
const pick = (list) => list[Math.floor(Math.random() * list.length)];
// A line as a screen reader should hear it: no hearts, notes, stars or emoji; a
// bare heart (praise) is "thank you!".
function spoken(text) {
  const plain = String(text || "").replace(/[♥♡♪★☂☀❄~*]|\p{Extended_Pictographic}/gu, "").replace(/\s+/g, " ").trim();
  return plain || (/[♥♡]/.test(text) ? "thank you!" : "");
}
// A line's characters as people see them (an emoji with its joiners is one).
const SEGMENTER = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter() : null;
function graphemes(text) {
  return SEGMENTER ? [...SEGMENTER.segment(text)].map((g) => g.segment) : [...text];
}
// Whole degrees in the owner's unit (the server converts), with a real minus.
const degrees = (n) => (Number.isFinite(n) ? `${n}°`.replace("-", "−") : "");
// How long the happy bounce lasts when the pet gets excited.
const BOUNCE_MS = 10000;
const POSE_MOODS = new Set(["content", "excited", "cozy", "bored", "sleepy"]);

// The same bands as rates.py (WEIGHT_LIGHT_BELOW, WEIGHT_HEAVY_ABOVE).
function weightLabel(v) {
  if (v === null) return "–";
  return `${Math.round(v)} · ${v < 25 ? "a bit light" : v > 75 ? "a bit heavy" : "just right"}`;
}

const REQUEST_LABELS = { blanket: "blanket?", fan: "fan?", lay_egg: "lay an egg?" };
const REQUEST_ARIA = {
  lay_egg: "Lay an egg: the pet retires to the journal and a new egg takes its place",
};
// Two taps for anything that can't be undone (lay an egg, forget my birthday,
// forget my data). The first arms it; the second confirms only within
// CONFIRM_MS of arming, and only after CONFIRM_GAP_MS since the tap before it,
// so a fast double (or triple) tap is one tap. Kept on the slide by control: a
// redraw keeps it, and arming one control can't confirm another.
const CONFIRM_MS = 4000;
const CONFIRM_GAP_MS = 600;
function confirmTap(s, key, now = Date.now()) {
  const c = s.confirm;
  if (c?.key === key && now - c.at < CONFIRM_MS) {
    if (now - c.last >= CONFIRM_GAP_MS) {
      s.confirm = null;
      return true;
    }
    c.last = now; // too soon after the last tap: the same tap, still armed
    return false;
  }
  s.confirm = { key, at: now, last: now };
  return false;
}
const confirmArmed = (s, key) => s.confirm?.key === key && Date.now() - s.confirm.at < CONFIRM_MS;
// Their armed words: the button's text, and its aria-label.
const CONFIRM_ARIA = {
  lay_egg: "Sure? Press again to lay an egg",
  forget_birthday: "Sure? Press again to forget my birthday",
  forget_me: "Sure? Press again to forget my data",
};

const STAGE_LABELS = { egg: "Egg", baby: "Baby", child: "Child", teen: "Teen", adult: "Adult" };

const cache = new Map();
function loadJson(path) {
  if (!cache.has(path)) {
    const request = fetch(`${BASE}/${path}?v=${VERSION}`).then((r) => {
      if (!r.ok) throw new Error(`missing ${path}`);
      return r.json();
    });
    // A failed fetch is forgotten so the next render tries again.
    request.catch(() => { if (cache.get(path) === request) cache.delete(path); });
    cache.set(path, request);
  }
  return cache.get(path);
}

// Images for a canvas (a photo): same origin, so the canvas stays untainted.
const IMAGES = new Map();
function loadImage(src) {
  if (!IMAGES.has(src)) {
    const request = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`missing ${src}`));
      img.src = src;
    });
    request.catch(() => { if (IMAGES.get(src) === request) IMAGES.delete(src); });
    IMAGES.set(src, request);
  }
  return IMAGES.get(src);
}

// A creature's sprite; "bird/medicine" borrows another species' sprite.
function spriteSrc(speciesId, sprite) {
  const path = sprite.includes("/") ? sprite : `${speciesId}/${sprite}`;
  return `${BASE}/sprites/${path}.png?v=${VERSION}`;
}

// A best friend's photo: a print, 300 x 380 (drawn at 2x), the picture a
// square of the creature's day backdrop with the pet as it was then.
const PHOTO = { w: 300, h: 380, px: 2, pic: 268, edge: 16 };
const PHOTO_GROUND = { helper: 1.35, couch_potato: 1.35, player: -1.35, homebody: -1.3, fireside: 1.3, fog_wanderer: -0.6 };
const PHOTO_GROUND_DY = { fog_wanderer: 4, homebody: 4, player: 0 }; // x ks below the feet, as the shelf has them
const inCompanionApp = () => /Home Assistant\//.test(navigator.userAgent || "");
// The Android app can't save a picture from its page (no share, no long-press save).
const inAndroidApp = () => inCompanionApp() && /Android/i.test(navigator.userAgent || "");
// "2026-10-28" as that day where the viewer is (not midnight UTC).
function localDay(iso, locale) {
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString(locale || undefined, { day: "numeric", month: "long", year: "numeric" });
}

function escape(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * amount)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

// The caption ink for a shell: its own colour, darker, and on a dark shell a
// light tint, whichever first reads at 4.5:1 (WCAG AA for small text).
function deviceInk(hex) {
  const n = parseInt(hex.slice(1), 16);
  const rgb = [n >> 16, (n >> 8) & 255, n & 255];
  const lum = (c) => c.reduce((s, v, i) => {
    const x = v / 255;
    return s + [0.2126, 0.7152, 0.0722][i] * (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  }, 0);
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const options = [0.28, 0.12, 0].map((k) => rgb.map((v) => Math.round(v * k)))
    .concat([0.92, 1].map((k) => rgb.map((v) => Math.round(v + (255 - v) * k))));
  const ink = options.find((c) => ratio(c, rgb) >= 4.5) || options[2];
  return `rgb(${ink.join(",")})`;
}

// A trait's flair sprite as a small icon (its first frame or big variant).
function traitIcon(trait) {
  const f = FLAIR[trait];
  return f ? `<img class="ticon" src="${BASE}/ui/flair_${trait}${f.art ? "_1" : ""}.png?v=${VERSION}" alt="">` : "";
}

// Icon and "night owl ★★", with "↓" when it was handed down from the parent.
function traitLabel(trait, level, inherited) {
  return `${traitIcon(trait)}${inherited ? "↓" : ""}${escape(trait.replaceAll("_", " "))} ` +
    `<span role="img" aria-label="level ${level || 1}">${"★".repeat(level || 1)}</span>`;
}

// Games finished, all kinds together (the journal's game counts).
const gamesPlayed = (games) => Object.values(games || {}).reduce((n, c) => n + (c.played || 0), 0);

// The server's clock, as an offset from this device's. It is read from
// something fresh: the time_fired of a state event (see _watchServerClock), and
// later the snapshot's `now` (P3a calls noteServerTime with it). Never from a
// sensor's last_updated, which can be an hour old after a reload. Until a
// reading arrives the device clock is used as it is.
const SKEW_CAP_MS = 24 * 3600 * 1000; // a reading further off than this is not believed
let serverOffset = 0; // server time minus device time, ms
function noteServerTime(iso) {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return;
  const offset = at - Date.now();
  if (Math.abs(offset) <= SKEW_CAP_MS) serverOffset = offset;
}
const serverNow = () => Date.now() + serverOffset;
const SERVER_CLOCK_EVERY_MS = 3600000; // one reading an hour, per connection
const SERVER_CLOCK = new WeakMap(); // connection -> { at: last reading (device ms), busy }

function timeAgo(iso) {
  const minutes = Math.round((serverNow() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

const STYLE = `
  :host { display: block; --hp-backdrop: var(--card-background-color, #2f4a3a);
    --hp-ground: transparent; --hp-ink: var(--primary-text-color, #222);
    --hp-subink: var(--secondary-text-color, #555); }
  button:focus-visible { outline: 3px solid #fff;
    outline-offset: 2px; box-shadow: 0 0 0 6px #1d2a22; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
  ha-card { overflow: hidden; border-radius: var(--ha-card-border-radius, 24px);
    background: var(--hp-backdrop, #2f4a3a); transition: background .5s; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 14px 18px 4px; }
  .title { font: 400 22px 'Tiny5', monospace; color: var(--hp-ink); }
  .title.long { font-size: 17px; } /* a long name keeps to two lines */
  .sub { font-size: 13px; color: var(--hp-subink); margin-top: 2px; }
  .chips { display: flex; gap: 6px; align-items: center; }
  .statusbtn { display: flex; align-items: center; gap: 6px; height: 44px; padding: 0 12px;
    border: none; border-radius: 22px; cursor: pointer; font: 400 14px 'Tiny5', monospace;
    color: var(--hp-ink); background: color-mix(in srgb, var(--hp-ink) 14%, transparent); }
  .statusbtn[aria-pressed="true"] { background: var(--hp-ink); color: var(--hp-backdrop); }
  .tap-feedback { position: relative; overflow: visible; }
  .tap-feedback.pressed { transform: scale(.94); filter: brightness(.9); }
  .toy.tap-feedback.pressed { transform: none; filter: none; }
  .tap-feedback::after { content: ""; position: absolute; inset: 0; border: 2px solid currentColor;
    border-radius: inherit; pointer-events: none; opacity: 0; }
  .tap-feedback.tapped::after { animation: tap-ring .38s ease-out; }
  .toy.tap-feedback::after { display: none; }
  @keyframes tap-ring { 0% { opacity: .65; transform: scale(.82); } 100% { opacity: 0; transform: scale(1.28); } }
  .viewport { position: relative; overflow: hidden; padding: 14px 0 22px; touch-action: pan-y; }
  .ground { position: absolute; left: 0; right: 0; bottom: 0; height: 26%;
    background: var(--hp-ground); transition: background .5s; }
  .track { position: relative; display: flex; gap: 16px; align-items: flex-end;
    transition: transform .5s cubic-bezier(.2,.8,.2,1); }
  .slide { flex-shrink: 0; transition: opacity .5s, transform .5s; transform-origin: 50% 100%; }
  .slide.away-slide { opacity: .5; transform: scale(.94); }
  /* Loops pause where nobody watches: the neighbours, or the card scrolled away. */
  .slide.away-slide .screen *, ha-card.offscreen .screen * { animation-play-state: paused !important; }
  .foot { display: flex; align-items: center; justify-content: space-between; padding: 0 14px 14px; }
  .nav { width: 44px; height: 44px; border: none; border-radius: 22px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; color: var(--hp-ink);
    background: color-mix(in srgb, var(--hp-ink) 14%, transparent); }
  /* Dots share what room the arrows leave; many pets wrap onto a second row. */
  .foot { gap: 8px; }
  .nav { flex-shrink: 0; }
  .dots { display: flex; flex-wrap: wrap; justify-content: center; gap: 0 4px; min-width: 0; }
  .dot { width: 24px; height: 24px; border: none; padding: 0; cursor: pointer;
    background: none; display: flex; align-items: center; justify-content: center; }
  .dot::before { content: ""; width: 10px; height: 10px; border-radius: 5px;
    background: color-mix(in srgb, var(--hp-ink) 55%, transparent); transition: width .3s; }
  .dot[aria-current="true"]::before { width: 20px; background: var(--hp-ink); }
  .slide.away-slide { cursor: pointer; }
  .single .foot { display: none; }

  /* One device */
  .device { display: flex; flex-direction: column; align-items: center; font-family: 'Tiny5', monospace; }
  .loop { width: 34px; height: 22px; border: 6px solid var(--d-dark); border-bottom: none;
    border-radius: 20px 20px 0 0; margin-bottom: -12px; }
  .lid { width: 92%; height: 20px; background: var(--d-dark); border-radius: 10px 10px 4px 4px;
    box-shadow: inset 0 4px 0 rgba(255,255,255,.18); display: flex; justify-content: center;
    align-items: center; gap: 6px; }
  .lid span { width: 12%; height: 4px; border-radius: 2px; background: rgba(0,0,0,.25); }
  /* The lid sits over the body's top bevel, which on a pale shell reads as a gap. */
  .lid { position: relative; z-index: 1; margin-bottom: -5px; }
  .feet { width: 82%; display: flex; justify-content: space-between; }
  .feet span { width: 34px; height: 10px; background: var(--d-dark); border-radius: 0 0 6px 6px; }
  /* House: a pitched roof with a chimney, sitting on the body like a cottage. */
  .roof { position: relative; width: 108%; height: 64px; margin-bottom: -2px; }
  .roof::before { content: ""; position: absolute; right: 20%; top: 6px; width: 22px; height: 40px;
    background: var(--d-dark); box-shadow: inset 0 5px 0 rgba(255,255,255,.18); }
  .roof::after { content: ""; position: absolute; inset: 0; background: var(--d-dark);
    clip-path: polygon(50% 0, 100% 100%, 0 100%); }
  .compact .roof { height: 46px; }
  /* Porthole: a riveted brass ring around a rounded window. */
  .porthole .body { border-radius: 40px; padding: 22px 18px 26px; }
  .porthole .bezel { padding: 14px; border-radius: 30% / 38%;
    background-image: radial-gradient(circle at 50% 7px, var(--d-dark) 0 3px, transparent 4px),
      radial-gradient(circle at 50% calc(100% - 7px), var(--d-dark) 0 3px, transparent 4px),
      radial-gradient(circle at 7px 50%, var(--d-dark) 0 3px, transparent 4px),
      radial-gradient(circle at calc(100% - 7px) 50%, var(--d-dark) 0 3px, transparent 4px),
      radial-gradient(circle at calc(8.8% + 5px) calc(11% + 5px), var(--d-dark) 0 3px, transparent 4px),
      radial-gradient(circle at calc(91.2% - 5px) calc(11% + 5px), var(--d-dark) 0 3px, transparent 4px),
      radial-gradient(circle at calc(8.8% + 5px) calc(89% - 5px), var(--d-dark) 0 3px, transparent 4px),
      radial-gradient(circle at calc(91.2% - 5px) calc(89% - 5px), var(--d-dark) 0 3px, transparent 4px); }
  .porthole .screen { border-radius: 28% / 36%; }
  .porthole .bubble { left: 13%; top: 10%; }
  .porthole .attention { right: 13%; top: 9%; }
  .porthole .toy .cap { border-radius: 50%; box-shadow: 0 5px 0 var(--d-btn-shadow), inset 0 0 0 3px var(--d-bezel); }
  /* Pad: a lily pad, veins fanning from the notch at the top. */
  .pad .body { border-radius: 50% / 30%; padding: 40px 22px 40px;
    background-image: repeating-conic-gradient(from 90deg at 50% 0, transparent 0 13deg,
      rgba(0,0,0,.08) 13deg 14.5deg); }
  .pad .body::before { content: ""; position: absolute; top: -1px; left: 50%; width: 46px;
    height: 34px; margin-left: -23px; background: var(--hp-backdrop);
    clip-path: polygon(0 0, 100% 0, 50% 100%); }
  .pad .toy .cap { border-radius: 50%; }
  .pad .buttons { width: 86%; }
  /* Moon: a crescent riding on top of a rounded body sprinkled with stars. */
  .crescent { width: 64px; height: 64px; border-radius: 50%; margin: 0 0 -26px 26px;
    box-shadow: inset -15px 7px 0 0 var(--d-bezel); transform: rotate(-20deg); position: relative; z-index: 1; }
  .moon .body { border-radius: 34px; padding: 30px 18px 24px;
    background-image: radial-gradient(circle at 12% 20%, rgba(255,255,255,.55) 0 1.5px, transparent 2.5px),
      radial-gradient(circle at 88% 14%, rgba(255,255,255,.45) 0 1.5px, transparent 2.5px),
      radial-gradient(circle at 6% 62%, rgba(255,255,255,.4) 0 1.5px, transparent 2.5px),
      radial-gradient(circle at 94% 56%, rgba(255,255,255,.5) 0 1.5px, transparent 2.5px),
      radial-gradient(circle at 4% 86%, rgba(255,255,255,.35) 0 1.5px, transparent 2.5px),
      radial-gradient(circle at 96% 90%, rgba(255,255,255,.45) 0 1.5px, transparent 2.5px); }
  .moon .toy .cap { border-radius: 50%; }
  .murk { inset: 0; width: 100%; height: 100%; opacity: 0; transition: opacity .8s; }
  .body { width: 100%; box-sizing: border-box; background: var(--d-shell);
    box-shadow: inset 0 -9px 0 var(--d-dark), inset 0 5px 0 rgba(255,255,255,.28), 0 16px 34px rgba(20,15,5,.32);
    display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .body { position: relative; }
  /* Sol's trim (worlds.json "trim"), drawn at each piece's own size (see _trim) and
     placed to suit each shell: over the top edge, on the plate, at the bottom corners. */
  .trim-top, .trim-top2, .trim-corner { position: absolute; pointer-events: none;
    image-rendering: pixelated; z-index: 1; }
  .trim-top { top: -12px; left: 50%; transform: translateX(-50%); }
  .trim-top2 { display: none; }
  .trim-corner { bottom: -18px; }
  .trim-corner.left { left: 14%; } .trim-corner.right { right: 14%; transform: scaleX(-1); }
  /* Tank: a pair standing on the lid's two ends, clear of its grips. */
  .tank .trim-top, .tank .trim-top2 { top: auto; bottom: calc(100% + 15px); transform: none; }
  .tank .trim-top { left: 20px; }
  .tank .trim-top2 { display: block; right: 20px; transform: scaleX(-1); }
  /* House: the wreath hangs in the middle of the roof's gable. */
  .house .trim-top { top: -50px; }
  .house .trim-corner { bottom: -12px; }
  .house .trim-corner.left { left: 4%; } .house .trim-corner.right { right: 4%; }
  /* Lily pad: the garland parts at the notch; the corners sit in on the bottom curve. */
  .pad .trim-top { top: -18px; }
  .pad .trim-corner { bottom: 2px; }
  .pad .trim-corner.left { left: 20%; } .pad .trim-corner.right { right: 20%; }
  /* Moon: the garland's gap sits under the crescent, which rides right of centre. */
  .moon .trim-top { top: -10px; transform: translateX(calc(-50% + 13px)); }
  /* Room under the full-width garlands for the plate, and above the bottom edge for the
     corners, so neither covers the label or the button captions. */
  .porthole .label.plate { margin-top: 44px; }
  .pad .label.plate { margin-top: 30px; }
  .moon .label.plate { margin-top: 30px; }
  .porthole .body, .moon .body { padding-bottom: 44px; }
  .label.plate { display: flex; align-items: center; box-sizing: border-box;
    justify-content: center; background-size: 100% 100%; image-rendering: pixelated;
    color: #fff4dc; text-shadow: 0 2px 0 #3a1e0c; margin-top: 10px; letter-spacing: .08em; }
  .compact .trim-corner { display: none; }
  .egg .body { border-radius: 50% 50% 46% 46% / 30% 30% 18% 18%; padding: 36px 20px 40px; }
  .egg .buttons { width: 88%; }
  .tank .body { border-radius: 18px; padding: 16px 18px 22px; }
  .house .body { border-radius: 0 0 10px 10px; padding: 18px 18px 38px; }
  .label { font-size: 14px; letter-spacing: .12em; color: var(--d-ink); }
  .request { position: absolute; right: 14px; bottom: 14px; z-index: 2; min-height: 44px;
    display: none; align-items: center; gap: 6px; padding: 0 14px; border: 2px solid #3a2a1a;
    border-radius: 22px; background: #ffe9a8; color: #3a2a1a; cursor: pointer;
    font: 400 14px 'Tiny5', monospace; box-shadow: 3px 3px 0 #3a2a1a;
    animation: pulse 1.6s ease-in-out infinite; }
  .request.show { display: flex; }
  .bezel { position: relative; width: 100%; box-sizing: border-box; background: var(--d-bezel); border-radius: 20px;
    padding: 9px; box-shadow: inset 0 3px 0 rgba(0,0,0,.12); }
  .screen { position: relative; aspect-ratio: 4 / 3; border-radius: 12px; overflow: hidden;
    background: #2b2f3a; box-shadow: inset 0 0 0 3px rgba(0,0,0,.35); cursor: pointer; }
  .screen img { position: absolute; image-rendering: pixelated; user-select: none;
    -webkit-user-drag: none; pointer-events: none; }
  .bg { inset: 0; width: 100%; height: 100%; object-fit: cover; transition: filter .6s; }
  .screen.night .bg { filter: brightness(.85); }
  .screen.dim .bg { filter: brightness(.5) saturate(.75); }
  .screen.dim .pet { filter: brightness(.8); }
  .pet, .perch { left: 50%; bottom: 4%; height: 62%; margin-left: -23.25%; transform-origin: 50% 100%; }
  .pet.hop { animation: hop .7s ease-in-out infinite; }
  .pet.greethop { animation: hop .7s ease-in-out 2; } /* its own class: the bounce clears "hop" */
  @keyframes hop { 50% { transform: translateY(-9%); } }
  .poop { bottom: 5%; height: 15%; }
  .poop.p0 { left: 6%; } .poop.p1 { left: 18%; bottom: 3%; } .poop.p2 { right: 7%; }
  .attention { top: 5%; right: 5%; height: 17%; animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { transform: scale(1.12); } }
  .prop { left: 67%; bottom: 7%; height: 22%; animation: pop .3s ease-out; }
  @keyframes pop { from { transform: scale(.3); opacity: 0; } }
  .awaysign { left: 50%; bottom: 12%; height: 40%; margin-left: -20%; }
  .awaylabel { position: absolute; left: 0; right: 0; bottom: 5%; text-align: center;
    color: #fff; font-size: 15px; text-shadow: 0 1px 3px #000; }
  .bubble .untyped { visibility: hidden; } /* laid out whole, so it never grows */
  .bubble { position: absolute; left: 5%; top: 6%; max-width: 64%; padding: 5px 9px;
    background: #fffdf5; color: #3a2a1a; border: 2px solid #3a2a1a; border-radius: 8px;
    font-size: 14px; line-height: 1.2; box-shadow: 3px 3px 0 #3a2a1a; }
  .bubble:empty { display: none; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%);
    white-space: nowrap; }
  /* The left/right game: two big guess buttons and a score over the scene. */
  .game { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
  .game[hidden] { display: none; }
  .game button { pointer-events: auto; position: absolute; display: grid; place-items: center;
    min-width: 44px; min-height: 44px; border-radius: 50%; border: 2px solid #3a2a1a;
    background: #fffdf5; color: #3a2a1a; box-shadow: 2px 2px 0 #3a2a1a; cursor: pointer; padding: 0; }
  .game button[aria-disabled="true"] { opacity: .5; cursor: default; }
  .game button:focus-visible { outline: 3px solid #fffdf5; outline-offset: 2px;
    box-shadow: 0 0 0 6px #1d2a22; }
  .game .gl { left: 4%; bottom: 8%; }
  .game .gr { right: 4%; bottom: 8%; }
  .game .gx { right: 4%; top: 6%; min-width: 44px; min-height: 44px; font: inherit; font-size: 14px; }
  .game .gpick { position: absolute; inset: 22% 0 0; display: flex; flex-direction: column; gap: 8px;
    align-items: center; justify-content: center; }
  .game .gpick[hidden], .game .gnum[hidden], .game .gl[hidden], .game .gr[hidden] { display: none; }
  /* The picker: chunky toy buttons like the device's own (cream, inked, pressing down). */
  .game .gpick button { position: static; display: flex; align-items: center; gap: 8px;
    border-radius: 14px; padding: 4px 14px 4px 10px; font: inherit; font-size: 14px; min-height: 44px;
    min-width: 168px; border: 2px solid #3a2a1a; background: #fffdf5; color: #3a2a1a;
    box-shadow: 0 4px 0 #3a2a1a; transition: transform .08s, box-shadow .08s; }
  .game .gpick button:active { transform: translateY(3px); box-shadow: 0 1px 0 #3a2a1a; }
  .game .gpick .gi { display: inline-flex; align-items: center; justify-content: center; gap: 1px;
    width: 40px; height: 28px; border-radius: 8px; background: var(--hp-screen-tint, #f3e7c9); }
  .game .gpick .gi img { image-rendering: pixelated; }
  .game .gpick .gi-arrow { font-size: 12px; margin: 0 1px; }
  .game .gnum { position: absolute; left: 50%; top: 30%; transform: translateX(-50%);
    display: grid; place-items: center; min-width: 52px; min-height: 56px; padding: 6px 10px;
    border-radius: 10px; background: #fffdf5; color: #3a2a1a; border: 2px solid #3a2a1a;
    box-shadow: 2px 2px 0 #3a2a1a; }
  .game .gnum.flip { animation: perk .3s ease-out; }
  /* Trait flair: placed in JS from the head point and the feet line. Every piece
     must read standing still too (reduced motion turns all animation off). */
  .flair { position: absolute; inset: 0; z-index: 2; pointer-events: none;
    animation: fl-moment var(--fl-ms) ease-in-out both; }
  @keyframes fl-moment { 0% { opacity: 0; } 12%, 85% { opacity: 1; } 100% { opacity: 0; } }
  .flair .fx { position: absolute; transform: translate(-50%, -100%); image-rendering: pixelated;
    animation-duration: var(--d, 2.4s); animation-delay: var(--delay, 0s);
    animation-iteration-count: infinite; animation-fill-mode: both; }
  /* .screen img is absolute; flair images stay in flow so the piece has a height
     and translate(-50%, -100%) stands it on its anchor point. */
  .flair .fx img { position: static; display: block; width: 100%; image-rendering: pixelated; }
  .flair .fx.frames img + img { position: absolute; inset: 0; }
  .flair .fx.frames img { animation: fl-frame-a .6s steps(1) infinite; }
  .flair .fx.frames img + img { animation-name: fl-frame-b; }
  @keyframes fl-frame-a { 50% { opacity: 0; } }
  @keyframes fl-frame-b { 0% { opacity: 0; } 50% { opacity: 1; } }
  .fx.bob { animation-name: fl-bob; animation-timing-function: ease-in-out; animation-direction: alternate; }
  @keyframes fl-bob { from { transform: translate(-50%, -100%); } to { transform: translate(-50%, -112%); } }
  .fx.float { animation-name: fl-float; animation-timing-function: ease-out; }
  @keyframes fl-float { 0% { opacity: 0; transform: translate(-50%, -100%); } 20% { opacity: 1; }
    100% { opacity: 0; transform: translate(calc(-50% + var(--dx, 0px)), calc(-100% - var(--rise, 40px))); } }
  .fx.fall { animation-name: fl-fall; animation-timing-function: linear; }
  @keyframes fl-fall { 0% { opacity: 0; transform: translate(-50%, -100%); } 15% { opacity: 1; }
    100% { opacity: 0; transform: translate(calc(-50% + var(--dx, 0px)), calc(-100% + var(--rise, 40px))); } }
  .fx.drift { animation-name: fl-drift; animation-timing-function: ease-in-out; }
  @keyframes fl-drift { 0% { opacity: 0; transform: translate(-50%, -100%); } 20%, 80% { opacity: 1; }
    100% { opacity: 0; transform: translate(calc(-50% + var(--dx, 40px)), calc(-100% + var(--rise, 0px))); } }
  .fx.twinkle { animation-name: fl-twinkle; animation-timing-function: ease-in-out; }
  @keyframes fl-twinkle { 0%, 100% { opacity: .2; transform: translate(-50%, -100%) scale(.7); }
    50% { opacity: 1; transform: translate(-50%, -100%) scale(1); } }
  .fx.bounce { animation-name: fl-bounce; animation-timing-function: ease-in; animation-direction: alternate; }
  @keyframes fl-bounce { from { transform: translate(-50%, -100%); } to { transform: translate(-50%, -150%); } }
  .fx.pop { animation-name: fl-pop; animation-iteration-count: 1; }
  @keyframes fl-pop { 0% { transform: translate(-50%, -100%) scale(.4); } 60% { transform: translate(-50%, -100%) scale(1.1); }
    100% { transform: translate(-50%, -100%) scale(1); } }
  .fx.loop { offset-rotate: 0deg; transform: translate(-50%, -50%); animation-name: fl-loop;
    animation-iteration-count: 1; animation-timing-function: ease-in-out; }
  @keyframes fl-loop { from { offset-distance: 0%; } to { offset-distance: 100%; } }
  .fx.glow { border-radius: 50%; transform: translate(-50%, -50%);
    background: radial-gradient(closest-side, rgba(255, 160, 70, .7), rgba(255, 160, 70, 0));
    animation-name: fl-glow; animation-direction: alternate; }
  @keyframes fl-glow { to { opacity: .55; } }
  /* Seasonal touches (SEASONS): behind the pet, sized to the screen. */
  .season { position: absolute; inset: 0; pointer-events: none; }
  .season .lantern { right: 5%; bottom: 5%; width: 17%; }
  .season .lantern.lantern-float { bottom: 30%; animation: s-bob 3s ease-in-out infinite alternate; }
  @keyframes s-bob { to { transform: translateY(-8%) rotate(-4deg); } }
  .screen.s-halloween.night .season .lantern, .screen.s-halloween.dim .season .lantern {
    filter: drop-shadow(0 0 6px rgba(255, 170, 60, .95)); animation: s-flicker 1.6s ease-in-out infinite; }
  .screen.s-halloween.night .season .lantern.lantern-float,
  .screen.s-halloween.dim .season .lantern.lantern-float {
    animation: s-flicker 1.6s ease-in-out infinite, s-bob 3s ease-in-out infinite alternate; }
  @keyframes s-flicker { 50% { filter: drop-shadow(0 0 3px rgba(255, 150, 50, .7)); } }
  .season .corner { top: 0; width: 17%; opacity: .85; }
  .season .corner.right { right: 0; }
  .season .corner.left { left: 0; transform: scaleX(-1); }
  .season .sweet { right: 23%; bottom: 5%; width: 7%; }
  .season .sfly { position: absolute; animation: s-fly var(--fly-ms, 5s) linear forwards; }
  .season .sfly img { position: static; display: block; width: 100%; }
  .season .sfly.flap img + img { position: absolute; inset: 0; }
  .season .sfly.flap img { animation: fl-frame-a .3s steps(1) infinite; }
  .season .sfly.flap img + img { animation-name: fl-frame-b; }
  .season .sbat { width: 9%; }
  .season .sghost { width: 13%; top: 30%; opacity: .9; }
  .season .sghost.flap img { animation-duration: .8s; }
  .season .switch { width: 22%; top: 5%; }
  .season .sgoose { width: 10%; }
  /* A walker keeps to the ground: no flight bob, a slower step. */
  .season .sturkey { width: 15%; bottom: 6%; }
  .season .sturkey.flap img { animation-duration: .5s; }
  .season .sfly.walk.ltr { animation-name: s-ltr; } .season .sfly.walk.rtl { animation-name: s-rtl; }
  .season .sfly.ltr { left: -25%; } .season .sfly.rtl { left: 112%; }
  @keyframes s-fly { 25% { translate: 0 30%; } 50% { translate: 0 -20%; } 75% { translate: 0 25%; } }
  .season .sfly.ltr { animation-name: s-fly, s-ltr; } .season .sfly.rtl { animation-name: s-fly, s-rtl; }
  .season .sfly.rtl img { transform: scaleX(-1); } /* the art faces right */
  @keyframes s-ltr { to { left: 112%; } } @keyframes s-rtl { to { left: -25%; } }
  .season .bunting { position: absolute; top: 0; left: 0; right: 0; height: 8.4%;
    background-repeat: repeat-x; background-size: 18.75% 100%; image-rendering: pixelated; }
  .season .mist { position: absolute; left: -10%; right: -10%; bottom: 0; height: 26%; display: none;
    background: radial-gradient(ellipse at 30% 100%, rgba(214, 206, 240, .45), transparent 65%),
      radial-gradient(ellipse at 75% 100%, rgba(214, 206, 240, .4), transparent 60%);
    animation: s-mist 9s ease-in-out infinite alternate; }
  .screen.night .season .mist, .screen.dim .season .mist { display: block; }
  @keyframes s-mist { to { transform: translateX(6%); opacity: .7; } }
  .season .leaf { top: -6%; width: 3.5%; opacity: 0;
    animation: s-leaf var(--leaf-ms, 9s) linear var(--leaf-delay, 0s) infinite; }
  @keyframes s-leaf { 0% { top: -6%; opacity: 0; translate: 0 0; rotate: 0deg; } 8% { opacity: 1; }
    35% { translate: -140% 0; rotate: 90deg; } 70% { translate: 120% 0; rotate: 200deg; }
    90% { opacity: 1; } 100% { top: 100%; opacity: 0; translate: -60% 0; rotate: 300deg; } }
  .costume .fx.hat { transform: translate(-50%, -100%); }
  .confetti { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 2; }
  .confetti i { position: absolute; top: -6%; left: var(--x); width: 5px; height: 8px; background: var(--c);
    animation: confetti 2.6s linear var(--d) forwards; }
  @keyframes confetti { to { top: 106%; rotate: 540deg; } }
  .game .gcatch { position: absolute; bottom: 10%; width: 16%; image-rendering: pixelated;
    pointer-events: none; will-change: left, transform; }
  .game .gcatch[hidden] { display: none; }
  .game .hl { font: inherit; font-size: 14px; }
  .game .gscore { position: absolute; left: 50%; bottom: 4%; transform: translateX(-50%);
    padding: 2px 8px; border-radius: 8px; background: #fffdf5; color: #3a2a1a;
    border: 2px solid #3a2a1a; font-size: 12px; white-space: nowrap; }
  .screen.show-status .flair, .screen.show-status .game, .screen.show-status .rain, .screen.show-status .breeze,
  .screen.show-status .flash, .screen.show-status .speck,
  .screen.show-status .bondhearts { display: none !important; }
  .pet { transition: translate .25s ease-out; }
  /* Reactions to moments (see _moment). */
  .pet.sulk { animation: shake .35s 2; }
  .pet.born { animation: pop .45s ease-out; }
  .pet.stretch { animation: perk .5s ease-out 2; }
  .poop.born { animation: pop .4s ease-out; }
  .screen .burst.big { top: 38%; width: 96px; height: 96px; margin-left: -48px; z-index: 2; }
  /* Stand-ins for house poses that are only drawn for the child. */
  .pet.dance { animation: hop .45s ease-in-out infinite; }
  .pet.shiver { animation: shake .25s linear infinite; }
  /* The fan: wind lines cross the scene and the pet sways. */
  .breeze { position: absolute; inset: 0; pointer-events: none; display: none; z-index: 1; }
  .screen.breezy .breeze, .screen.windy .breeze { display: block; }
  .breeze span { position: absolute; left: 0; height: 2px; width: 34%; border-radius: 1px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.85) 45%, rgba(255,255,255,.6) 80%, transparent);
    animation: wind 1.1s linear infinite; }
  .breeze span:nth-child(1) { top: 30%; }
  .breeze span:nth-child(2) { top: 48%; width: 24%; animation-delay: .35s; }
  .breeze span:nth-child(3) { top: 64%; animation-delay: .7s; }
  @keyframes wind { from { transform: translateX(-120%); } to { transform: translateX(330%); } }
  .screen.breezy .pet { animation: sway .7s ease-in-out infinite; }
  @keyframes sway { 50% { transform: rotate(-4deg); } }
  /* Thunder: now and then the scene flashes. */
  .flash { position: absolute; inset: 0; pointer-events: none; display: none; z-index: 2;
    background: #fff; opacity: 0; }
  .screen.stormy .flash { display: block; animation: lightning 9s linear infinite; }
  @keyframes lightning { 0%, 89%, 92%, 95%, 100% { opacity: 0; } 90% { opacity: .75; } 94% { opacity: .5; } }
  /* Idle life. */
  .pet { transition: translate .25s ease-out, rotate .2s ease-out; }
  .pet.look { rotate: y 180deg; }
  .pet.wander-l { translate: -16% 0; transition-duration: .9s; }
  .pet.wander-r { translate: 16% 0; transition-duration: .9s; }
  .speck { position: absolute; width: 6px; height: 6px; border-radius: 50%; background: #fff6c9;
    box-shadow: 0 0 6px 2px rgba(255,240,170,.8); top: 45%; z-index: 2; pointer-events: none;
    animation: speck 2.6s ease-in-out forwards; }
  .speck.rtl { animation-name: speck-rtl; }
  @keyframes speck { from { left: 8%; top: 30%; } 50% { top: 55%; } to { left: 88%; top: 38%; opacity: .2; } }
  @keyframes speck-rtl { from { left: 88%; top: 35%; } 50% { top: 58%; } to { left: 8%; top: 30%; opacity: .2; } }
  /* Rain for species with no rain scene of their own. */
  .rain { position: absolute; inset: 0; pointer-events: none; display: none; z-index: 1;
    background: repeating-linear-gradient(105deg, transparent 0 13px, rgba(215,230,255,.5) 13px 15px);
    background-size: 40px 40px; animation: rainfall .45s linear infinite; }
  .screen.raining .rain { display: block; }
  .screen.raining .bg { filter: brightness(.82) saturate(.75); }
  @keyframes rainfall { to { background-position: -10px 40px; } }
  /* Water worlds: lighter streaks, and rings where the drops land. */
  .screen.raining.watery .rain { opacity: .6; }
  .screen.raining.watery .rain::after { content: ""; position: absolute; inset: 0;
    background:
      radial-gradient(ellipse 10% 4% at 22% 80%, transparent 55%, rgba(255,255,255,.95) 62%, transparent 75%),
      radial-gradient(ellipse 10% 4% at 72% 70%, transparent 55%, rgba(255,255,255,.95) 62%, transparent 75%),
      radial-gradient(ellipse 10% 4% at 50% 90%, transparent 55%, rgba(255,255,255,.95) 62%, transparent 75%);
    animation: ripple 1.4s ease-out infinite; }
  @keyframes ripple { 0% { opacity: 0; transform: scale(.7); } 30% { opacity: 1; } 100% { opacity: 0; transform: scale(1.25); } }
  .pet.go-left, .perch.go-left { translate: -60% 0; }
  .pet.go-right, .perch.go-right { translate: 60% 0; }
  /* What the pet stands on (species.json "perch"); it follows the pet around. */
  .perch { transition: translate .25s ease-out; }
  .perch.wander-l { translate: -16% 0; transition-duration: .9s; }
  .perch.wander-r { translate: 16% 0; transition-duration: .9s; }
  .status { position: absolute; inset: 0; background: #e9e2c6; color: #2f3a24; padding: 9px 12px;
    display: none; flex-direction: column; gap: 4px; font-size: 13px; overflow: auto; }
  .screen.show-status .status { display: flex; }
  .screen.show-status .bubble { display: none; }
  /* The pet's request waits while the status screen or a game is up (it covered them). */
  .screen.show-status + .request, .screen:has(> .game:not([hidden])) + .request { display: none !important; }
  /* With a game up, the bubble leaves room for its close button. */
  .screen:has(> .game:not([hidden])) .bubble { max-width: 54%; }
  /* A narrow card: status rows fit four hearts. */
  .compact .row { grid-template-columns: 16px 70px minmax(0, 1fr); gap: 5px; }
  .compact .hearts img { width: 14px; height: 14px; }
  /* Every row: an icon slot (maybe empty), the label, the value; all on one grid. */
  .row { display: grid; grid-template-columns: 18px 84px minmax(0, 1fr); align-items: center; gap: 6px; }
  .bar { height: 9px; border: 2px solid #2f3a24; padding: 1px; }
  .bar div { height: 100%; background: #2f3a24; }
  .hearts { letter-spacing: 2px; }
  .hearts .off { opacity: .25; }
  .jlink { align-self: flex-end; margin-top: 2px; border: none; background: none; padding: 6px 0;
    min-height: 28px;
    font: 400 12px 'Tiny5', monospace; color: inherit; text-decoration: underline; cursor: pointer; }
  .bell { border: 2px solid #2f3a24; border-radius: 10px; background: none; color: inherit;
    font: 400 12px 'Tiny5', monospace; padding: 3px 10px; min-width: 44px; min-height: 26px;
    cursor: pointer; }
  .bell[aria-pressed="true"] { background: #2f3a24; color: #e9e2c6; }
  .bell.pending { opacity: .65; }
  .game button[aria-disabled="true"] { opacity: .55; }
  .status-feedback { position: sticky; bottom: 0; margin-top: auto; padding: 5px 7px;
    background: #2f3a24; color: #e9e2c6; font-size: 12px; min-height: 14px; }
  .jhead { display: flex; justify-content: space-between; align-items: baseline; }
  .jgrid { display: flex; flex-wrap: wrap; gap: 6px 10px; }
  .jtile { display: flex; flex-direction: column; align-items: center; width: 64px; font-size: 11px;
    text-align: center; line-height: 1.1; }
  .jtile img { width: 48px; height: 48px; image-rendering: pixelated; }
  .jtile.locked img { filter: brightness(0); opacity: .3; }
  .jlist { font-size: 12px; opacity: .9; display: flex; flex-direction: column; gap: 3px; }
  .photos { display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
  .prow { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 2px; }
  .print { margin: 0; flex: none; display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .screen .status .print img { width: 72px; height: 91px; box-shadow: 2px 2px 0 rgba(58,42,26,.35); }
  .photo-dialog { width: min(300px, 90vw); box-sizing: border-box; padding: 12px; border: 3px solid #3a2a1a;
    border-radius: 12px; background: #e9e2c6; color: #2f3a24; font: 400 13px 'Tiny5', monospace; text-align: center; }
  .photo-dialog::backdrop { background: rgba(20, 16, 10, .65); }
  /* Press and hold to save: nothing here blocks the long-press menu. */
  .photo-dialog .pbig { display: block; width: 100%; height: auto; -webkit-touch-callout: default; user-select: auto; }
  .photo-dialog p { margin: 8px 0 4px; }
  .photo-dialog a { display: block; margin: 4px 0 8px; color: inherit; word-break: break-all; }
  .photo-dialog a[hidden], .photo-dialog p[hidden] { display: none; }
  .jlist .gt { padding-left: 10px; }
  .ticon { width: 14px; height: 14px; object-fit: contain; vertical-align: -3px; margin-right: 2px;
    image-rendering: pixelated; }
  .tnext { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .tnext .bar { flex: 1; min-width: 30px; }
  .jlist .gen.now { font-weight: 700; }
  .log { margin-top: 3px; font-size: 12px; opacity: .85; }
  .buttons { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px 6px; width: 100%; }
  .toy { display: flex; flex-direction: column; align-items: center; gap: 5px; border: none;
    background: none; padding: 0; cursor: pointer; font: 400 13px 'Tiny5', monospace;
    letter-spacing: .02em; border-radius: 12px;
    color: var(--d-ink); -webkit-tap-highlight-color: transparent; }
  .picon { image-rendering: pixelated; display: block; pointer-events: none; }
  .title-row { display: flex; align-items: center; gap: 8px; }
  .emblem { width: 32px; height: 32px; image-rendering: pixelated; }
  .deco { position: absolute; bottom: 6%; width: 48px; height: 48px; image-rendering: pixelated;
    pointer-events: none; transition: opacity .5s; }
  .deco.left { left: 4%; } .deco.right { right: 4%; }
  .compact .deco { display: none; }
  .screen.faded .bg { filter: brightness(.55) saturate(.8); }
  .screen .status img { position: static; } /* not scene sprites */
  .row .picon { width: 18px; height: 18px; }
  .hearts { display: flex; gap: 3px; }
  .hearts img { width: 18px; height: 18px; image-rendering: pixelated; }
  .toy .cap { width: 46px; height: 46px; display: flex; align-items: center; justify-content: center;
    background: #fff7ec; color: #3a2a1a; box-shadow: 0 5px 0 var(--d-btn-shadow);
    transition: transform .08s, box-shadow .08s, background .2s; }
  .egg .toy .cap { border-radius: 50%; }
  .tank .toy .cap { border-radius: 14px; }
  .house .toy .cap { border-radius: 10px 10px 4px 4px; }
  /* Pressed: held down for at least 160 ms so even a quick tap reads as a press. */
  .toy:active .cap, .toy.pressed .cap { transform: translateY(4px);
    box-shadow: 0 1px 0 var(--d-btn-shadow); transition-duration: .04s; }
  .toy.pending .cap { animation: waiting .9s ease-in-out infinite; }
  @keyframes waiting { 50% { filter: brightness(.9); } }
  .toy.failed .cap { animation: shake .35s; }
  @keyframes shake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
  .burst { position: absolute; left: 50%; top: 0; width: 46px; height: 46px; margin-left: -23px;
    border-radius: 50%; pointer-events: none; border: 3px solid #ffe9a8;
    animation: burst .45s ease-out forwards; }
  @keyframes burst { from { transform: scale(.6); opacity: .9; } to { transform: scale(1.5); opacity: 0; } }
  .toy { position: relative; }
  .screen .askday { position: absolute; left: 0; right: 0; bottom: 3%; display: flex; gap: 8px;
    flex-wrap: wrap; justify-content: center; z-index: 3; margin: 0 auto; }
  .screen .askday.many { max-width: 236px; } /* three a row at most */
  .compact .screen .askday { gap: 4px; bottom: 2%; }
  .compact .screen .askday.many { max-width: 100%; }
  .compact .screen .askday button, .compact .screen .askday select { min-height: 40px; min-width: 44px;
    font-size: 12px; padding: 2px 7px; border-radius: 10px; }
  .screen .askday select, .compact .screen .askday select { font-size: 16px; } /* iOS zooms in under 16 px */
  .screen .askday select { font: inherit; font-size: 14px; min-height: 44px; border-radius: 14px;
    border: 2px solid #3a2a1a; background: #fffdf5; color: #3a2a1a; padding: 0 6px; }
  .screen .askday button { font: inherit; font-size: 14px; min-height: 44px; min-width: 64px; padding: 4px 10px;
    border-radius: 14px; border: 2px solid #3a2a1a; background: #fffdf5; color: #3a2a1a;
    box-shadow: 0 4px 0 #3a2a1a; transition: transform .08s, box-shadow .08s; }
  .screen .askday button:active { transform: translateY(3px); box-shadow: 0 1px 0 #3a2a1a; }
  /* Keeping its catchphrase can be a long label ("slow and steady"): smaller, and
     wrapping inside the button if it must, so the five choices stay in two rows. */
  .screen .askday button[data-answer="keep"] { font-size: 12px; white-space: normal;
    max-width: calc(100% - 72px); }
  .screen.show-status .askday { display: none; }
  .screen .bondhearts img { position: absolute; left: calc(50% + var(--x)); top: 52%; width: 18px; height: auto;
    opacity: 0; image-rendering: pixelated; pointer-events: none; z-index: 2; animation: bondheart 1.6s ease-out forwards; }
  @keyframes bondheart { 0% { transform: translateY(0) scale(.7); opacity: 0; } 20% { opacity: 1; }
    100% { transform: translateY(-70px) scale(1); opacity: 0; } }
  .pet.perk { animation: perk .3s ease-out; }
  @keyframes perk { 40% { transform: translateY(-6%) scale(1.04, .96); } }
  .toy.wanted .cap { background: #ffe9a8;
    box-shadow: 0 5px 0 var(--d-btn-shadow), 0 0 0 4px #fff3c4, 0 0 16px 5px #ffd76a; }
  .toy.on .cap { background: #3a2a1a; color: #ffe9a8; }
  .toy[disabled] { opacity: .45; cursor: default; }
  .compact .toy .cap { width: 38px; height: 38px; }
  .compact .toy { font-size: 12px; }
  .compact .egg .body { padding: 28px 14px 32px; }
  .warn { padding: 16px; color: var(--error-color, #c00); background: var(--card-background-color); }
`;

class HatchPetCard extends HTMLElement {
  static getStubConfig() {
    return {};
  }

  static getConfigElement() {
    return document.createElement("hatch-pet-card-editor");
  }

  setConfig(config) {
    this._config = config || {};
    this._sig = null;
    this._epoch = (this._epoch || 0) + 1; // every slide draws again
    this._index = this._index || 0;
  }

  getCardSize() {
    return 9;
  }

  getGridOptions() {
    return { columns: 6, min_columns: 6, rows: "auto" };
  }

  set hass(hass) {
    this._hass = hass;
    this._listenReady(hass?.connection);
    this._watchServerClock(hass);
    this._resendAnswers();
    this._update();
  }

  // Answers kept on this device (a failed save, twice) go out one by one when
  // the card has a user. The server saying it did not ask, or that it is not an
  // answer, drops it (the first try may have arrived and only its reply been
  // lost); any other error keeps it for later.
  async _resendAnswers() {
    const user = this._hass?.user?.id;
    if (!user || this._resending || sharedScreen() || Date.now() < (this._resendAfter || 0)) return;
    let list = stashedAnswers(user);
    if (!list.length) return;
    this._resending = true;
    try {
      const fresh = (a) => a && Date.now() - a.at < ANSWER_KEEP_DAYS * 86400000;
      list = list.filter(fresh);
      for (const a of [...list]) {
        try {
          await this._hass.callWS({ type: "virtual_pet/answer", entity_id: a.entity, question: a.question, answer: a.answer });
        } catch (err) {
          if (err?.code !== "not_asked" && err?.code !== "invalid_answer") {
            this._resendAfter = Date.now() + ANSWER_RESEND_EVERY_MS;
            break;
          }
        }
        list = list.filter((x) => x !== a);
      }
      saveStashedAnswers(user, list);
    } finally {
      this._resending = false;
    }
  }

  // Every state event carries the server's own time_fired: one reading gives
  // the clock offset (noteServerTime), then the subscription is dropped (a
  // standing one would stream every state change in the house to this tab).
  // Read again after an hour, or on a new connection; shared by all cards.
  _watchServerClock(hass) {
    const conn = hass?.connection;
    if (!conn?.subscribeEvents) return;
    const seen = SERVER_CLOCK.get(conn);
    if (seen && (seen.busy || Date.now() - seen.at < SERVER_CLOCK_EVERY_MS)) return;
    const mark = { at: seen?.at ?? 0, busy: true };
    SERVER_CLOCK.set(conn, mark);
    let unsub = null;
    let done = false;
    const finish = () => { if (unsub) unsub(); };
    Promise.resolve(conn.subscribeEvents((ev) => {
      if (done) return;
      done = true;
      noteServerTime(ev?.time_fired);
      Object.assign(mark, { at: Date.now(), busy: false });
      finish();
    }, "state_changed")).then((fn) => {
      unsub = fn;
      if (done) finish();
    }).catch(() => { mark.busy = false; }); // a later card tries again
  }

  // A hidden tab: lines are said whole, and babbles stop.
  _onHidden = () => {
    if (document.hidden) (this._slides || []).forEach((x) => this._stopTyping(x));
  };

  connectedCallback() {
    this._timer = setInterval(() => this._tick(), 700);
    if (this._card) document.addEventListener("visibilitychange", this._onHidden);
    if (this._resize && this._viewport) this._resize.observe(this._viewport);
    if (this._io && this._card) this._io.observe(this._card);
    // A shared screen turned on in another card on this page, or another tab.
    window.addEventListener(SHARED_EVENT, this._onSharedEvent);
    window.addEventListener("storage", this._onSharedStorage);
    // Back on the page: the private channel again (it closed when the card left).
    if (this._hass) {
      this._listenReady(this._hass.connection);
      for (const s of this._slides || []) this._subscribe(s);
    }
    if (!document.querySelector("[data-hatch-font]")) {
      // Tiny5 (SIL OFL), served by the integration so it works offline. It
      // stays legible at button-label sizes, where most pixel fonts blur.
      const style = document.createElement("style");
      style.dataset.hatchFont = "";
      style.textContent = `@font-face { font-family: 'Tiny5';
        src: url(${BASE}/fonts/Tiny5.woff2?v=${VERSION}) format('woff2'); font-display: swap; }`;
      document.head.append(style);
    }
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    this._resize?.disconnect();
    this._io?.disconnect();
    document.removeEventListener("visibilitychange", this._onHidden);
    window.removeEventListener(SHARED_EVENT, this._onSharedEvent);
    window.removeEventListener("storage", this._onSharedStorage);
    this._listenReady(null);
    // A game (Catch's animation loop above all) stops with the card, and so
    // does a line typing out, and the private channel.
    for (const s of this._slides || []) {
      if (s.game) this._endGame(s, null);
      this._stopTyping(s);
      this._dropPhotos(s);
      this._unsubscribe(s);
    }
  }

  // --- The private channel (virtual_pet/subscribe) -----------------------------
  //
  // Each slide subscribes to its pet: the viewer's own view ("mine": their
  // bond and switches), the house's ("house": the latest show or song, a dream
  // of one) and moments told to this connection alone. Subscribed without the
  // library's own resubscribe, which never says when it fails: the card does
  // it on the connection's "ready", through its own retries.

  // The connection whose reconnects resubscribe every slide (null: none).
  _listenReady(conn) {
    if (conn === this._readyConn) return;
    this._readyConn?.removeEventListener?.("ready", this._onReady);
    this._readyConn = conn?.addEventListener ? conn : null;
    this._readyConn?.addEventListener("ready", this._onReady);
  }

  // A new socket: the old subscriptions died with the old one (nothing to
  // unsubscribe), so every slide asks again.
  _onReady = () => {
    for (const s of this._slides || []) {
      s.unsub = null;
      this._subscribe(s, true);
    }
  };

  // Subscribe the slide to its pet, unless it already is (to the same pet, on
  // the same kind of screen). `again`: whatever it had, ask afresh.
  _subscribe(s, again = false) {
    const id = s.ids?.["sensor.life_stage"];
    const conn = this._hass?.connection;
    if (!id || !conn?.subscribeMessage || !this.isConnected) return;
    const shared = sharedScreen();
    const key = `${id}|${shared}`;
    if (!again && s.subKey === key && (s.unsub || s.subPending || s.retryTimer || s.gone)) return;
    this._unsubscribe(s, false);
    if (s.subKey !== key) s.retries = 0;
    s.subKey = key;
    s.gone = false;
    const gen = (s.subGen = (s.subGen || 0) + 1);
    const user = this._hass.user?.id;
    s.subPending = true;
    // The first look waits this long at most for the channel's first word.
    if (!s.subscribed && !s.subscribeFailed && !s.waitTimer) {
      s.waitTimer = setTimeout(() => {
        s.waitTimer = null;
        if (!s.subscribed) s.subscribeFailed = true;
      }, SUBSCRIBE_WAIT_MS);
    }
    Promise.resolve(conn.subscribeMessage((msg) => {
      if (s.subGen === gen) this._channel(s, msg, user);
    }, { type: "virtual_pet/subscribe", entity_id: id, shared }, { resubscribe: false }))
      .then((unsub) => {
        if (s.subGen !== gen) { // moved on while it was asked
          Promise.resolve(unsub?.()).catch(() => {});
          return;
        }
        s.subPending = false;
        s.unsub = () => Promise.resolve(unsub?.()).catch(() => {});
        if (s.gone) this._unsubscribe(s, false); // gone before the reply landed
      })
      .catch(() => {
        // no_pet (mid-reload), unknown_command (HA still starting, or an
        // older server): go ahead without it, and ask again, for good.
        if (s.subGen !== gen) return;
        s.subPending = false;
        s.subscribeFailed = true;
        const n = s.retries || 0;
        s.retries = n + 1;
        s.retryTimer = setTimeout(() => {
          s.retryTimer = null;
          if (s.subGen === gen && this._slides?.includes(s)) this._subscribe(s, true);
        }, SUBSCRIBE_RETRY_MS[n] ?? SUBSCRIBE_RETRY_LAST_MS);
      });
  }

  // Stop the slide's subscription and its retries (`all`: and the wait for it).
  _unsubscribe(s, all = true) {
    s.subGen = (s.subGen || 0) + 1; // a reply still on its way is dropped
    s.subPending = false;
    clearTimeout(s.retryTimer);
    s.retryTimer = null;
    if (all) {
      clearTimeout(s.waitTimer);
      s.waitTimer = null;
      s.subKey = null;
    }
    s.unsub?.();
    s.unsub = null;
  }

  // The channel has spoken (or failed): the first look and hello may go.
  _channelHeard(s) {
    return !!(s.subscribed || s.subscribeFailed);
  }

  // One message on the slide's channel: the whole view (on subscribe, and
  // again after the pet reloads), a part that changed, a moment, or "gone".
  _channel(s, msg, user) {
    if (!msg || typeof msg !== "object") return;
    const shared = sharedScreen();
    if (msg.gone) { // the pet was removed: nothing more will come
      this._unsubscribe(s, false);
      s.gone = true;
      return;
    }
    if (Array.isArray(msg.moments)) {
      // The whole view: a reset, every time. Its moments are what happened
      // already (for the first look), so nothing in it is said now.
      if (msg.now) noteServerTime(msg.now);
      s.mine = shared ? null : msg.mine || null;
      s.house = msg.house || null;
      if (!s.privateSeen) s.privateSeen = new Set();
      if (!s.mediaSeen) s.mediaSeen = new Set();
      for (const m of msg.moments) {
        if (!m?.type) continue;
        if (MEDIA_MOMENTS.has(m.type)) s.mediaSeen.add(m.at);
        else this._keepMoment(s, m);
      }
      if (s.house?.media?.at) s.mediaSeen.add(s.house.media.at);
      s.subscribed = true;
      s.subscribeFailed = false;
      s.retries = 0;
      clearTimeout(s.waitTimer);
      s.waitTimer = null;
    } else {
      if ("mine" in msg) s.mine = shared ? null : msg.mine || null;
      if ("house" in msg) s.house = msg.house || null;
      const m = msg.moment;
      if (m?.type) {
        // Said only if it's new here and just happened (the server's clock).
        const fresh = serverNow() - new Date(m.at).getTime() < 15000;
        if (MEDIA_MOMENTS.has(m.type)) {
          if (!s.mediaSeen) s.mediaSeen = new Set();
          if (!s.mediaSeen.has(m.at)) {
            s.mediaSeen.add(m.at);
            if (fresh) this._moment(s, m);
          }
        } else if (this._keepMoment(s, m) && fresh) {
          this._moment(s, m);
        }
      }
      if (!("mine" in msg) && !("house" in msg)) return; // a moment draws nothing
    }
    // The viewer's own baby talk, kept for the next page load (by whose it is).
    if (s.mine && typeof s.mine.baby_talk === "boolean" && user && user === this._hass?.user?.id) {
      setBabyTalk(user, s.mine.baby_talk);
    }
    s.statusHtml = null;
    this._redraw(s);
  }

  // A private moment, kept for the first look (newest first): false if it was
  // already here.
  _keepMoment(s, m) {
    const key = momentKey(m);
    if (!s.privateSeen) s.privateSeen = new Set();
    if (s.privateSeen.has(key)) return false;
    s.privateSeen.add(key);
    s.privateMoments = [m, ...(s.privateMoments || [])]
      .sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, MOMENTS_KEPT);
    return true;
  }

  // For card-check: what the channel would have said.
  _mineFor(s, mine) {
    s.mine = mine;
    s.statusHtml = null;
    this._redraw(s);
  }

  _houseFor(s, house) {
    s.house = house;
    s.statusHtml = null;
    this._redraw(s);
  }

  // --- Finding the pets --------------------------------------------------------

  // HA hands the card a new hass on every state change in the house, but the
  // registries only change when entities do: the pets' entities are worked out
  // once per registry (and config), not on every update.
  _devices() {
    const hass = this._hass;
    const c = this._devCache;
    if (c && c.entities === hass.entities && c.devices === hass.devices && c.config === this._config) {
      return c.list;
    }
    const list = this._findDevices();
    this._devCache = { entities: hass.entities, devices: hass.devices, config: this._config, list };
    return list;
  }

  _findDevices() {
    const hass = this._hass;
    // Pets picked in the editor (devices), or by any one entity of each (YAML).
    const wanted = [].concat(this._config.entities || [], this._config.entity || []);
    const deviceIds = [...(this._config.devices || [])].filter((d) => hass.devices?.[d]);
    if (wanted.length || this._config.devices?.length) {
      for (const id of wanted) {
        const d = hass.entities?.[id]?.device_id;
        if (d && !deviceIds.includes(d)) deviceIds.push(d);
      }
    } else {
      for (const e of Object.values(hass.entities || {})) {
        if (e.platform === "virtual_pet" && e.translation_key === "life_stage" && e.device_id) {
          deviceIds.push(e.device_id);
        }
      }
    }
    const byDevice = Object.fromEntries(deviceIds.map((device) => [device, { device }]));
    for (const e of Object.values(hass.entities || {})) {
      const ids = e.platform === "virtual_pet" && byDevice[e.device_id];
      if (ids) ids[`${e.entity_id.split(".")[0]}.${e.translation_key}`] = e.entity_id;
    }
    return deviceIds.map((device) => byDevice[device]);
  }

  // --- Building --------------------------------------------------------------

  _build() {
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${STYLE}</style>
      <ha-card>
        <div class="head">
          <div><div class="title-row"><img class="emblem" alt=""><div class="title"></div></div>
            <div class="sub"></div></div>
          <div class="chips">
            <button class="statusbtn" aria-pressed="false">${pixelIcon("icon_status", 24)}<span>Status</span></button>
          </div>
        </div>
        <div class="viewport"><div class="ground"></div>
          <img class="deco left" alt=""><img class="deco right" alt="">
          <div class="track"></div></div>
        <div class="foot">
          <button class="nav prev" aria-label="Previous device">${icon("prev", 20)}</button>
          <div class="dots"></div>
          <button class="nav next" aria-label="Next device">${icon("next", 20)}</button>
        </div>
      </ha-card>`;
    this._card = root.querySelector("ha-card");
    this._viewport = root.querySelector(".viewport");
    this._track = root.querySelector(".track");
    this._dots = root.querySelector(".dots");
    root.querySelector(".statusbtn").addEventListener("click", () => {
      const s = this._slides[this._index];
      if (s) {
        this._tapped(root.querySelector(".statusbtn"));
        this._toggleStatus(s);
      }
    });
    root.querySelector(".prev").addEventListener("click", (e) => {
      this._tapped(e.currentTarget);
      this._go(this._index - 1);
    });
    root.querySelector(".next").addEventListener("click", (e) => {
      this._tapped(e.currentTarget);
      this._go(this._index + 1);
    });
    let startX = null;
    this._viewport.addEventListener("pointerdown", (e) => {
      startX = e.clientX;
      this._swiped = false;
    });
    this._viewport.addEventListener("pointerup", (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 40) {
        this._swiped = true;
        this._go(this._index + (dx < 0 ? 1 : -1));
      }
    });
    document.addEventListener("visibilitychange", this._onHidden);
    // iOS locks audio again after a reload until a tap: any tap unlocks it
    // (the end of a touch counts as a gesture there, its start doesn't).
    const unlock = () => {
      if (!soundsOn() && !babbleOn()) return;
      try {
        unlockAudio();
      } catch (err) {
        // no WebAudio
      }
    };
    for (const type of ["touchend", "pointerup", "click"]) this._card.addEventListener(type, unlock, true);
    this._resize = new ResizeObserver(() => this._layout());
    this._resize.observe(this._viewport);
    this._visible = true;
    this._io = new IntersectionObserver((entries) => {
      this._visible = entries.some((e) => e.isIntersecting);
      this._card.classList.toggle("offscreen", !this._visible); // pauses the loops
      if (!this._visible) this._slides.forEach((x) => this._stopTyping(x));
      if (this._visible && this._dirty) this._update(); // catch up on what was skipped
    });
    this._io.observe(this._card);
    this._slides = [];
  }

  _buildSlide() {
    const slide = document.createElement("div");
    slide.className = "slide";
    slide.innerHTML = `
      <div class="device">
        <div class="roof"></div><div class="crescent"></div><div class="loop"></div><div class="lid"><span></span><span></span><span></span></div>
        <div class="body">
          <img class="trim-top" alt=""><img class="trim-top2" alt="">
          <span class="label"></span>
          <div class="bezel"><div class="screen">
            <img class="bg" alt="">
            <img class="awaysign" alt=""><div class="awaylabel"></div>
            <div class="season"></div>
            <img class="poop p0" alt="mess"><img class="poop p1" alt="mess"><img class="poop p2" alt="mess">
            <img class="perch" alt="">
            <img class="pet" alt="">
            <img class="prop" alt="">
            <img class="murk" alt="">
            <div class="rain"></div>
            <div class="flash"></div>
            <div class="breeze"><span></span><span></span><span></span></div>
            <img class="attention" alt="wants attention">
            <div class="bubble"></div>
            <div class="sr" role="status"></div>
            <div class="game" hidden>
              <div class="gpick" role="group" aria-label="Pick a game">${this._games().map((g) =>
                `<button data-game="${g.key}">${g.label}</button>`).join("")}</div>
              <img class="gcatch" alt="" hidden>
              <span class="gnum" aria-live="polite" hidden></span>
              <button class="gl" aria-label="Guess left">${icon("prev", 22)}</button>
              <span class="gscore" aria-live="polite"></span>
              <button class="gr" aria-label="Guess right">${icon("next", 22)}</button>
              <button class="gx" aria-label="Stop the game">✕</button>
            </div>
            <div class="status"></div>
          </div><button class="request"></button></div>
          <div class="buttons"></div>
          <img class="trim-corner left" alt=""><img class="trim-corner right" alt="">
        </div>
        <div class="feet"><span></span><span></span></div>
      </div>`;
    const q = (sel) => slide.querySelector(sel);
    const s = {
      el: slide, device: q(".device"), label: q(".label"), screen: q(".screen"), bg: q(".bg"),
      awaysign: q(".awaysign"), awaylabel: q(".awaylabel"), pet: q(".pet"), prop: q(".prop"),
      perch: q(".perch"),
      attention: q(".attention"), bubble: q(".bubble"), status: q(".status"),
      poops: [...slide.querySelectorAll(".poop")], murk: q(".murk"), buttons: {}, frame: 0,
      request: q(".request"), gameBox: q(".game"), gameScore: q(".gscore"), gameNum: q(".gnum"),
      catchEl: q(".gcatch"), live: q(".sr[role=status]"), seasonBox: q(".season"),
    };
    slide.querySelectorAll("img").forEach((img) => img.addEventListener("error", () => {
      const src = img.getAttribute("src");
      if (src && !WARNED.has(src)) {
        WARNED.add(src);
        console.warn("hatch-pet-card: missing sprite", src);
      }
    }));
    // The perch moves where the pet moves (wandering, the game) and grows with it.
    const PERCH_MOVES = ["wander-l", "wander-r", "go-left", "go-right"];
    new MutationObserver(() => {
      for (const c of PERCH_MOVES) s.perch.classList.toggle(c, s.pet.classList.contains(c));
      s.perch.style.scale = s.pet.style.scale;
    }).observe(s.pet, { attributes: true, attributeFilter: ["class", "style"] });
    // What the pet says to someone (a refusal, a game's result, a moment) is read
    // out by screen readers; its idle chatter isn't. Only the pet on show.
    new MutationObserver(() => {
      if (s.plain !== undefined && s.bubble.textContent === s.plain) return; // _speak announced it
      const text = spoken(s.bubble.textContent);
      if (s.sayUntil && s === this._slides[this._index] && text && s.live.textContent !== text) {
        s.live.textContent = text;
      }
    }).observe(s.bubble, { childList: true, characterData: true, subtree: true });
    // Taps on the game mustn't reach the screen behind (which opens the status).
    s.gameBox.addEventListener("click", (e) => e.stopPropagation());
    s.gameBox.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && s.game) this._endGame(s, "maybe later!");
    });
    q(".gl").addEventListener("click", () => this._guess(s, "left"));
    q(".gr").addEventListener("click", () => this._guess(s, "right"));
    q(".gx").addEventListener("click", (e) => {
      this._tapped(e.currentTarget, s);
      this._endGame(s, "maybe later!");
    });
    q(".gpick").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-game]");
      if (b) {
        this._tapped(b, s);
        this._pickGame(s, b.dataset.game);
      }
    });
    s.request.addEventListener("click", () => {
      const key = s.request.dataset.key;
      if (!key) return;
      if (key === "lay_egg") this._tapped(s.request, s);
      if (key === "lay_egg" && !this._confirmed(s, key, s.request, () => this._redraw(s))) return;
      this._press(s, key);
    });
    // A tap on the screen is a shortcut for the Status button; it holds buttons of its
    // own (the game, the bell, the journal), so it isn't a button itself.
    s.screen.addEventListener("click", () => {
      if (!this._swiped) {
        this._tapped(this._card.querySelector(".statusbtn"));
        this._toggleStatus(s);
      }
    });
    // The device beside the current one is inert; tapping it brings it forward.
    slide.addEventListener("click", () => {
      const i = this._slides.indexOf(s);
      if (i !== this._index && !this._swiped) this._go(i);
    });
    const box = q(".buttons");
    for (const action of ACTIONS) {
      const b = document.createElement("button");
      b.className = "toy";
      b.innerHTML = `<span class="cap">${pixelIcon(ACTION_ICONS[action.key])}</span><span>${action.label}</span>`;
      if (action.aria) b.setAttribute("aria-label", action.aria);
      b.addEventListener("click", () =>
        action.key === "play" ? this._startGame(s, b) : this._press(s, action.key));
      box.append(b);
      s.buttons[action.key] = b;
    }
    const lights = document.createElement("button");
    lights.className = "toy";
    lights.innerHTML = `<span class="cap"></span><span class="lbl"></span>`;
    lights.addEventListener("click", () => this._toggleLights(s));
    box.append(lights);
    s.buttons.lights = lights;
    this._track.append(slide);
    return s;
  }

  // --- Updating --------------------------------------------------------------

  async _update() {
    if (!this._hass || !this._config) return;
    if (!this.shadowRoot) this._build();
    const devices = this._devices();
    const sig = JSON.stringify(devices.map((ids) => Object.keys(ids).map((k) =>
      k === "device"
        ? [ids[k], this._hass.devices?.[ids[k]]?.name_by_user, this._hass.devices?.[ids[k]]?.name]
        : this._hass.states[ids[k]]?.last_updated))) +
      (this._hass.states["sun.sun"]?.state || "");
    if (sig === this._sig) return;
    if (this._visible === false) {
      this._dirty = true; // scrolled away: draw when it's back (the observer calls)
      return;
    }
    this._dirty = false;
    this._sig = sig;

    if (!devices.length) {
      while (this._slides.length) this._dropSlide(this._slides.pop());
      this._card.classList.add("single");
      this._card.querySelector(".chips").style.display = "none";
      const configured = [].concat(
        this._config.entities || [], this._config.entity || [], this._config.devices || []).length;
      this._card.querySelector(".title").textContent = configured ? "Pet not found" : "No pets yet";
      this._card.querySelector(".sub").textContent = configured
        ? "None of this card's entities belong to a virtual pet. Edit the card to pick them again."
        : "Add the Virtual Pet integration to hatch one.";
      return;
    }
    this._card.querySelector(".chips").style.display = "";
    let worlds;
    try {
      worlds = await loadJson("worlds.json");
    } catch (err) {
      this._sig = null; // try again on the next update
      return;
    }
    while (this._slides.length < devices.length) this._slides.push(this._buildSlide());
    while (this._slides.length > devices.length) this._dropSlide(this._slides.pop());
    this._index = Math.min(this._index, devices.length - 1);

    for (let i = 0; i < devices.length; i++) {
      const s = this._slides[i];
      if (s.ids && s.ids.device !== devices[i].device) this._forget(s); // another pet now
      s.ids = devices[i];
      this._subscribe(s); // its private channel (once: a no-op after that)
      const stage = this._state(s, "sensor.life_stage");
      s.worldKey = worlds[stage?.attributes.world] ? stage.attributes.world : Object.keys(worlds)[0];
      s.world = worlds[s.worldKey];
      const roster = stage?.attributes.roster || [];
      // An egg is always drawn as its world's egg (the first species on the roster).
      const speciesId = (stage?.state === "egg" && roster[0]) || stage?.attributes.species || roster[0];
      if (speciesId && speciesId !== s.speciesId) {
        s.speciesId = speciesId;
        s.species = null;
        loadJson(`sprites/${speciesId}/species.json`).then((data) => {
          if (s.speciesId !== speciesId) return; // the slide moved on while this loaded
          s.species = data;
          this._sig = null;
          this._update();
        }).catch(() => {
          this._write(s, `missing sprites for ${speciesId}`);
          if (s.speciesId === speciesId) s.speciesId = null; // try again on the next update
        });
      }
      // Only a slide whose own pet (or the sun) changed is drawn again.
      const own = Object.values(devices[i]).map((id) => this._hass.states[id]?.last_updated).join() +
        `|${this._hass.states["sun.sun"]?.state}|${s.species ? s.speciesId : ""}|${this._epoch || 0}` +
        `|${this._hass.devices?.[devices[i].device]?.name_by_user}`;
      if (s.species && own !== s.drawnSig) {
        s.drawnSig = own;
        try {
          this._renderSlide(s);
        } catch (err) {
          console.error("hatch-pet-card: could not draw", s.speciesId, err);
        }
      }
    }
    this._card.classList.toggle("single", devices.length < 2);
    this._renderShelf();
  }

  // Draw again now, though nothing in HA changed: one slide, or all of them.
  _redraw(s = null) {
    if (s) s.drawnSig = null;
    else this._epoch = (this._epoch || 0) + 1;
    this._sig = null;
    this._update();
  }

  _dropSlide(s) {
    this._forget(s); // its game, timers, photos and dialog go with it
    s.unsub?.();
    s.unsub = null;
    s.el.remove();
  }

  // A slide that now shows another pet starts fresh: nothing of the last
  // pet's (a game, an armed "sure?", the moments already seen) carries over.
  _forget(s) {
    if (s.game) this._endGame(s, null);
    this._stopTyping(s);
    s.voicedAt = 0;
    s.confirm = null;
    clearTimeout(s.confirmTimer);
    s.lastMoment = s.lastLogAt = undefined;
    s.greeted = false;
    s.excitedSince = 0;
    s.wasCalling = undefined; // a call already on doesn't chirp
    s.journal = false;
    s.statusHtml = null;
    s.drawnSig = null;
    // The last pet's private lines and question aren't this one's.
    this._clearAsk(s);
    s.queue = [];
    s.visitedAt = 0;
    s.lookedFirst = false;
    s.wishDay = null;
    this._dropPhotos(s);
    // Its other timers, and what each would have tidied away.
    clearTimeout(s.breezeTimer);
    s.screen?.classList.remove("breezy");
    clearTimeout(s.flairTimer);
    s.screen?.querySelector(".flair")?.remove();
    clearTimeout(s.statusMessageTimer);
    const note = s.status?.querySelector(".status-feedback");
    if (note) { note.hidden = true; note.textContent = ""; }
    // The last pet's channel: nothing of it may open this one's first look
    // (its bond, its nickname, a wish aimed at the viewer). The server clock's
    // offset is the page's, not the pet's, so it stays.
    this._unsubscribe(s);
    this._resetChannel(s);
  }

  // What a slide knows from its channel, forgotten (a new pet, or a shared
  // screen asking again).
  _resetChannel(s) {
    s.mine = null;
    s.house = null;
    s.subscribed = false;
    s.subscribeFailed = false;
    s.privateSeen = new Set();
    s.mediaSeen = new Set();
    s.privateMoments = [];
    s.retries = 0;
    s.gone = false;
  }

  // Turning on "shared screen", here or in another card or tab: everything
  // personal on every slide goes, including a line still being typed out.
  _goShared() {
    for (const slide of this._slides || []) {
      this._clearAsk(slide);
      slide.queue = [];
      this._dropPhotos(slide);
      this._stopTyping(slide); // writes the whole line in, so it's cleared after
      slide.bubble.textContent = "";
      slide.plain = undefined;
      slide.sayUntil = 0; // the next tick says the mood's line, which names nobody
      slide.live.textContent = "";
      slide.screen.querySelector(".bondhearts")?.remove();
      slide.journal = false;
      slide.confirm = null; // an armed "forget" is a personal row
      slide.status.innerHTML = ""; // drawn again, without its personal rows
      slide.statusHtml = null;
      slide.drawnSig = null;
      slide.mine = null; // and the channel asked again, as a shared screen
      this._subscribe(slide, true);
    }
    this._redraw();
  }

  // Personal again: the status screens, and the channel asked again for the
  // viewer's own view (nothing else waits to come back).
  _goPersonal() {
    for (const slide of this._slides || []) {
      slide.statusHtml = null;
      slide.drawnSig = null;
      this._subscribe(slide, true);
    }
    this._redraw();
  }

  _onSharedEvent = (e) => {
    if (e.detail?.from === this) return; // the card that was tapped already did
    if (e.detail?.on) this._goShared();
    else this._goPersonal();
  };

  _onSharedStorage = (e) => {
    if (e.key !== SHARED_KEY) return;
    if (sharedScreen()) this._goShared();
    else this._goPersonal();
  };

  // Take an open question off the screen (a game, another pet on this slide).
  _clearAsk(s) {
    s.screen?.querySelector(".askday")?.remove();
    clearTimeout(s.askTimer);
    s.asking = false;
    if (s.queue) s.queue = s.queue.filter((q) => !q.ask); // a question only (a birthday line stays)
  }

  _state(s, key) {
    const id = s.ids?.[key];
    return id ? this._hass.states[id] : undefined;
  }

  _go(index) {
    const n = this._slides.length;
    if (!n) return;
    this._slides.forEach((x) => this._stopTyping(x));
    this._index = (index + n) % n;
    this._renderShelf();
  }

  _layout() {
    const vw = this._viewport.clientWidth;
    if (!vw) return;
    this._slideW = Math.min(330, vw - 56);
    const compact = this._slideW < 280;
    if (compact !== this._card.classList.contains("compact")) {
      this._card.classList.toggle("compact", compact);
      this._redraw(); // the trim is sized for the layout: draw every slide again
    }
    for (const s of this._slides) s.el.style.width = `${this._slideW}px`;
    this._renderShelf();
  }

  _renderShelf() {
    const s = this._slides[this._index];
    if (!s || !s.world) return;
    const vw = this._viewport.clientWidth;
    const w = this._slideW || Math.min(330, vw - 56);
    for (const slide of this._slides) slide.el.style.width = `${w}px`;
    this._track.style.transform = `translateX(${(vw - w) / 2 - this._index * (w + 16)}px)`;
    this._slides.forEach((slide, i) => {
      const current = i === this._index;
      slide.el.classList.toggle("away-slide", !current);
      slide.device.inert = !current;
      slide.el.setAttribute("aria-hidden", current ? "false" : "true");
    });

    const world = s.world;
    this._card.style.setProperty("--hp-backdrop", world.backdrop);
    this._card.style.setProperty("--hp-ground", world.ground);
    this._card.style.setProperty("--hp-ink", world.ink);
    this._card.style.setProperty("--hp-subink", world.subink);
    const device = this._hass.devices?.[s.ids.device];
    const stage = this._state(s, "sensor.life_stage");
    const days = stage?.attributes.age_days;
    const kind = stage?.state === "egg" ? "Egg" : s.species?.name || "";
    const title = this._card.querySelector(".title");
    title.textContent = device?.name_by_user || device?.name || "Pet";
    title.classList.toggle("long", title.textContent.length > 14);
    const emblem = this._card.querySelector(".emblem");
    if (world.emblem) {
      const src = `${BASE}/ui/${world.emblem}.png?v=${VERSION}`;
      if (emblem.getAttribute("src") !== src) emblem.src = src;
      emblem.style.display = "";
    } else {
      emblem.style.display = "none";
    }
    const season = seasonNow(this._config);
    this._card.querySelectorAll(".deco").forEach((img, i) => {
      // In season, the right-hand decoration is the season's.
      const name = season && i === 1 ? `season_${season.key}_deco` : world.deco?.[i];
      img.style.display = name ? "" : "none";
      const src = name && `${BASE}/ui/${name}.png?v=${VERSION}`;
      if (src && img.getAttribute("src") !== src) img.src = src;
    });
    // The world is on the device's plate and the emblem, so the line stays short.
    this._card.querySelector(".sub").textContent = [kind,
      stage?.state !== "egg" ? STAGE_LABELS[stage?.state]?.toLowerCase() : null,
      days != null ? `day ${Math.floor(days) + 1}` : null].filter(Boolean).join(" · ");

    while (this._dots.children.length < this._slides.length) {
      const i = this._dots.children.length;
      const dot = document.createElement("button");
      dot.className = "dot";
      dot.addEventListener("click", (e) => {
        this._tapped(e.currentTarget);
        this._go(i);
      });
      this._dots.append(dot);
    }
    while (this._dots.children.length > this._slides.length) this._dots.lastChild.remove();
    [...this._dots.children].forEach((dot, i) => {
      const name = this._hass.devices?.[this._slides[i].ids?.device];
      dot.setAttribute("aria-label", `Show ${name?.name_by_user || name?.name || `pet ${i + 1}`}`);
      dot.setAttribute("aria-current", i === this._index ? "true" : "false");
    });
    this._card.querySelector(".statusbtn").setAttribute(
      "aria-pressed", s.screen.classList.contains("show-status") ? "true" : "false");
  }

  // Size a trim piece (an <img>, or the label wearing the plate as its background) to
  // its art. A plate taller than 44 px has strings or hooks above it, so the label's
  // text keeps to its bottom 44 px.
  _trim(el, src, scale) {
    const size = (w, h) => {
      el.style.width = `${w * scale}px`;
      el.style.height = `${h * scale}px`;
      if (el.tagName !== "IMG") el.style.paddingTop = `${Math.max(0, h - 44)}px`;
    };
    if (el.tagName === "IMG") {
      if (el.getAttribute("src") !== src) {
        el.onload = () => size(el.naturalWidth, el.naturalHeight);
        el.setAttribute("src", src);
      } else if (el.naturalWidth) {
        size(el.naturalWidth, el.naturalHeight);
      }
      return;
    }
    if (el.dataset.trimSrc === src && el.dataset.trimW) {
      size(Number(el.dataset.trimW), Number(el.dataset.trimH));
      return;
    }
    el.dataset.trimSrc = src;
    const probe = new Image();
    probe.onload = () => {
      el.dataset.trimW = probe.naturalWidth;
      el.dataset.trimH = probe.naturalHeight;
      if (el.dataset.trimSrc === src) size(probe.naturalWidth, probe.naturalHeight);
    };
    probe.src = src;
  }

  _show(s, img, sprite) {
    if (!sprite) {
      img.style.display = "none";
      return;
    }
    const src = spriteSrc(s.speciesId, sprite);
    if (img.getAttribute("src") !== src) img.setAttribute("src", src);
    img.style.display = "";
  }

  _renderSlide(s) {
    const sp = s.species;
    const world = s.world;
    const shell = world.shell || {};
    const color = shell.color || "#e8834a";
    const dev = s.device;
    const shape = ["tank", "house", "porthole", "pad", "moon"].includes(shell.shape) ? shell.shape : "egg";
    dev.className = `device ${shape}`;
    dev.querySelector(".roof").style.display = shape === "house" ? "" : "none";
    dev.querySelector(".crescent").style.display = shape === "moon" ? "" : "none";
    dev.querySelector(".loop").style.display = shape === "egg" ? "" : "none";
    dev.querySelector(".lid").style.display = shape === "tank" ? "" : "none";
    dev.querySelector(".feet").style.display = shape === "tank" ? "" : "none";
    dev.style.setProperty("--d-shell", color);
    dev.style.setProperty("--d-dark", shade(color, 0.72));
    dev.style.setProperty("--d-ink", deviceInk(color));
    dev.style.setProperty("--d-btn-shadow", shade(color, 0.6));
    dev.style.setProperty("--d-bezel", shell.bezel || "#f3ead7");
    s.label.textContent = world.label || world.name;
    // Optional pixel-art trim from Sol (worlds.json "trim"), like stickers on the toy.
    const trim = world.trim || {};
    const uiSrc = (name) => `${BASE}/ui/${name}.png?v=${VERSION}`;
    // Tops are drawn at 3/4 size on the egg, tank and house, whose tops are small;
    // the wide flat shells take them full size. A compact card shrinks them again.
    const topScale = (["egg", "tank", "house"].includes(shape) ? 0.75 : 1) *
      (this._card.classList.contains("compact") ? 0.7 : 1);
    dev.querySelectorAll(".trim-top, .trim-top2").forEach((img) => {
      img.style.visibility = trim.top ? "" : "hidden";
      if (trim.top) this._trim(img, uiSrc(trim.top), topScale);
    });
    dev.querySelectorAll(".trim-corner").forEach((img) => {
      img.style.display = trim.corner ? "" : "none";
      if (trim.corner) this._trim(img, uiSrc(trim.corner), 1);
    });
    s.label.classList.toggle("plate", !!trim.plate);
    s.label.style.backgroundImage = trim.plate ? `url(${uiSrc(trim.plate)})` : "";
    if (trim.plate) {
      this._trim(s.label, uiSrc(trim.plate), 1);
    } else {
      s.label.style.width = s.label.style.height = s.label.style.paddingTop = "";
    }

    const mood = this._state(s, "sensor.mood");
    const stageState = this._state(s, "sensor.life_stage");
    const stage = stageState?.state;
    const flags = mood?.attributes.flags || [];
    const calling = this._state(s, "binary_sensor.calling")?.state === "on";
    const lightsOut = this._state(s, "switch.lights_out")?.state === "on";
    const asleep = this._state(s, "binary_sensor.asleep")?.state === "on";
    const away = mood?.state === "away";
    s.asleep = asleep;
    s.lightsOut = lightsOut;
    // A new call chirps once (not on load: wasCalling starts undefined).
    if (calling && s.wasCalling === false && !away) this._chirp(s, "call");
    s.wasCalling = calling;

    let scene = "day";
    if (flags.includes("rainy")) scene = "rain";
    if (this._hass.states["sun.sun"]?.state === "below_horizon") scene = "night";
    if (asleep || lightsOut) scene = "dim";
    const own = sp.backgrounds?.[scene];
    this._show(s, s.bg, own || sp.backgrounds?.day || Object.values(sp.backgrounds || {})[0]);
    // A species with only a day scene gets it darkened for night and sleep.
    s.screen.classList.toggle("faded", !own && scene !== "day" && scene !== "rain");
    s.screen.classList.toggle("night", scene === "night");
    s.screen.classList.toggle("dim", scene === "dim");
    this._renderSeason(s);

    this._show(s, s.perch, away ? null : sp.perch);
    if (away) {
      s.frames = [];
      this._show(s, s.pet, null);
      this._show(s, s.awaysign, sp.props?.away);
      s.awaylabel.textContent = "at the sitter's";
    } else {
      this._show(s, s.awaysign, null);
      s.awaylabel.textContent = "";
      s.frames = this._petFrames(sp, stage, mood?.state, calling, this._eggMinutes(stageState), flags);
      const frames = this._frames(s);
      this._show(s, s.pet, frames[s.frame % frames.length]);
    }
    // Excitement lasts a while (rates.py EXCITED_MINUTES), but the bounce only
    // celebrates its start; after that, idle life adds an occasional hop.
    const excited = mood?.state === "excited";
    if (excited && !s.excitedSince) s.excitedSince = Date.now();
    if (!excited) s.excitedSince = 0;
    s.pet.classList.toggle("hop", excited && Date.now() - s.excitedSince < BOUNCE_MS);
    s.pet.alt = s.species?.name || "pet";
    // Some stages are drawn smaller in the frame (long adults fit 256 px wide by
    // coming out shorter); species.json "scale" sizes them back up, feet fixed.
    const drawn = sp.stages?.includes(stage) ? stage : sp.stage_fallback?.[stage];
    s.drawn = drawn;
    s.pet.style.scale = String(sp.scale?.[drawn] || 1);
    // Baby, teen and adult have no house poses: a hop dances, a shake shivers.
    const standIn = drawn !== "child" && !away && !asleep && POSE_MOODS.has(mood?.state);
    s.pet.classList.toggle("dance", standIn && flags.includes("dancing"));
    s.pet.classList.toggle("shiver", standIn && (flags.includes("chilly") || flags.includes("storm")));
    s.screen.classList.toggle("stormy", flags.includes("storm") && !away);
    s.screen.classList.toggle("windy", flags.includes("windy") && !away);
    s.moodState = mood?.state;
    s.calling = calling;
    const rainScene = scene === "rain" && !!sp.backgrounds?.rain;
    s.screen.classList.toggle("raining", flags.includes("rainy") && !rainScene && !away);
    s.screen.classList.toggle("watery", world.mess === "murk");

    const poop = away ? 0 : Number(this._state(s, "sensor.poop")?.state || 0);
    // Water worlds cloud over instead of showing poop (worlds.json "mess": "murk").
    const murky = world.mess === "murk" && !!sp.murk;
    s.poops.forEach((img, i) => this._show(s, img, !murky && i < poop ? sp.props?.poop?.[i] : null));
    this._show(s, s.murk, murky ? sp.murk : null);
    s.murk.style.opacity = murky ? [0, 0.45, 0.75, 1][Math.min(poop, 3)] : 0;
    this._show(s, s.attention, calling && !away ? sp.props?.attention : null);
    if (!s.propUntil || Date.now() > s.propUntil) this._show(s, s.prop, null);

    const lastCare = this._state(s, "sensor.last_care");
    const log = lastCare?.attributes.log || [];
    // "Just happened" is judged on the server's clock (the sensor's last update),
    // so a device whose own clock is off still shows care and moments.
    const recent = (at) => new Date(lastCare?.last_updated) - new Date(at) < 15000;
    const latestAt = log[0]?.at ?? null;
    if (s.lastLogAt === undefined) s.lastLogAt = latestAt; // don't react to old care
    if (latestAt !== s.lastLogAt) {
      if (recent(latestAt)) this._react(s, log[0]);
      s.lastLogAt = latestAt;
    }
    // A person's own moments and the house's shows come from the channel only.
    const moments = (lastCare?.attributes.moments || []).filter((m) => !CHANNEL_ONLY.has(m.type));
    if (s.lastMoment === undefined) s.lastMoment = momentKey(moments[0]) ?? null; // not old ones
    if (moments.length && momentKey(moments[0]) !== s.lastMoment) {
      const fresh = [];
      for (const m of moments) {
        if (momentKey(m) === s.lastMoment) break;
        fresh.push(m);
      }
      s.lastMoment = momentKey(moments[0]);
      fresh.reverse().filter((m) => recent(m.at))
        .forEach((m) => this._moment(s, m));
    }
    const egg = stage === "egg";
    if (s.game && (asleep || away || egg)) this._endGame(s, null);
    s.hatchesAt = egg ? stageState?.attributes.hatches_at : null;
    if (!s.sayUntil || Date.now() > s.sayUntil) this._write(s, this._say(s, mood, away));

    for (const action of ACTIONS) {
      const b = s.buttons[action.key];
      const ent = this._state(s, `button.${action.key}`);
      b.disabled = !ent || ent.state === "unavailable" || egg || away;
      const wanted = !b.disabled && !asleep && !!action.wants && flags.includes(action.wants);
      b.classList.toggle("wanted", wanted);
      if (wanted) b.setAttribute("aria-description", "wanted now");
      else b.removeAttribute("aria-description");
    }
    const wanted = (mood?.attributes.requests || []).find((r) => this._state(s, `button.${r}`));
    s.request.classList.toggle("show", !!wanted && !away && !asleep);
    if (wanted) {
      s.request.dataset.key = wanted;
      const confirming = wanted === "lay_egg" && confirmArmed(s, wanted);
      s.request.textContent = confirming ? "sure? tap again" : REQUEST_LABELS[wanted] || `${wanted}?`;
      s.request.setAttribute("aria-label", confirming ? CONFIRM_ARIA.lay_egg
        : REQUEST_ARIA[wanted] || `Give the pet a ${wanted}`);
    }

    const lights = s.buttons.lights;
    const lightsEnt = this._state(s, "switch.lights_out");
    lights.disabled = !lightsEnt || lightsEnt.state === "unavailable" || away;
    // Asleep counts even when it dozed off by itself (the switch stays off then).
    const sleeping = lightsOut || asleep;
    lights.classList.toggle("on", sleeping);
    lights.classList.toggle("wanted", !sleeping && flags.includes("sleepy") && calling);
    const lightsIcon = sleeping ? "icon_lights_on" : "icon_lights_out";
    if (lights.dataset.icon !== lightsIcon) {
      lights.querySelector(".cap").innerHTML = pixelIcon(lightsIcon);
      lights.dataset.icon = lightsIcon;
    }
    lights.querySelector(".lbl").textContent = sleeping ? "wake" : "sleep";
    lights.title = sleeping ? "Lights on: wake the pet" : "Lights out: put the pet to bed";

    if (s.screen.classList.contains("show-status")) this._renderStatus(s, log);
  }

  _say(s, mood, away) {
    if (away) return "";
    if (s.hatchesAt) {
      const minutes = Math.max(1, Math.ceil((new Date(s.hatchesAt) - serverNow()) / 60000));
      if (minutes <= 1) return "crack... crack...";
      return minutes < 60 ? `hatching in about ${minutes} min` : `hatching in about ${Math.round(minutes / 60)} h`;
    }
    // The server's sentence, or baby talk keyed by which sentence it is (an
    // older integration sends no key: the sentence as it is).
    const reason = mood?.attributes.reason || "";
    const key = mood?.attributes.reason_key;
    return key ? this._lines(s, `reason.${key}`, reason).text : reason;
  }

  _toggleStatus(s) {
    const open = !s.screen.classList.contains("show-status");
    if (open) this._stopTyping(s); // the bubble hides: the line is said whole
    s.screen.classList.toggle("show-status", open);
    s.journal = false;
    if (open) this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
    if (s === this._slides[this._index]) {
      this._card.querySelector(".statusbtn").setAttribute("aria-pressed", open ? "true" : "false");
    }
  }

  // Minutes until the egg hatches, or null.
  _eggMinutes(stageState) {
    const at = stageState?.state === "egg" ? stageState.attributes.hatches_at : null;
    return at ? (new Date(at) - serverNow()) / 60000 : null;
  }

  _petFrames(sp, stage, mood, calling, eggMinutes, flags = []) {
    if (stage === "egg") {
      if (!sp.egg) return [];
      // HA ticks every 5 minutes, so each phase spans at least one tick.
      if (eggMinutes != null && eggMinutes <= 6) return sp.egg.crack || sp.egg.idle;
      if (eggMinutes != null && eggMinutes <= 15) return sp.egg.wiggle || sp.egg.idle;
      return sp.egg.idle;
    }
    let drawn = stage;
    if (!sp.stages.includes(drawn)) drawn = sp.stage_fallback?.[stage] || sp.stages[sp.stages.length - 1];
    // Special poses are drawn for the child; other stages would change size.
    if (drawn === "child" && POSE_MOODS.has(mood)) {
      const flag = flags.find((f) => POSES[f] && sp.extras?.[POSES[f]]);
      if (flag) {
        const pose = sp.extras[POSES[flag]];
        return Array.isArray(pose) ? pose : [pose];
      }
    }
    const m = sp.moods.includes(mood) ? mood : "content";
    const frames = [];
    for (let i = 1; i <= (sp.frames || 1); i++) frames.push(`${drawn}_${m}_${i}`);
    return frames;
  }

  _tick() {
    if (!this._slides || !this._visible || document.hidden) return;
    this._ticks = (this._ticks || 0) + 1;
    this._slides.forEach((s, i) => {
      if (s.poseUntil && Date.now() > s.poseUntil) s.poseUntil = 0;
      if (s.excitedSince && Date.now() - s.excitedSince >= BOUNCE_MS) s.pet.classList.remove("hop");
      const frames = this._frames(s);
      const seen = Math.abs(i - this._index) <= 1; // the pet on show and the peeking ones
      if (seen && frames.length && !(s.asleep && this._ticks % 2)) {
        s.frame = (s.frame + 1) % frames.length;
        this._show(s, s.pet, frames[s.frame]);
      }
      if (s.propUntil && Date.now() > s.propUntil) {
        this._show(s, s.prop, null);
        s.propUntil = 0;
      }
      if (s.sayUntil && Date.now() > s.sayUntil) s.sayUntil = 0;
      if (s === this._slides[this._index]) {
        this._greet(s);
        this._firstLook(s); // before the visit: it tells the server what's queued
        this._visit(s);
        this._sayQueued(s);
        this._wishMention(s);
        this._seen(s);
        this._idle(s);
        this._flairTick(s);
        this._seasonTick(s);
        this._partyTick(s);
      }
      if (!s.sayUntil && s.species) {
        const mood = this._state(s, "sensor.mood");
        const text = this._say(s, mood, mood?.state === "away");
        if (s.bubble.textContent !== text) this._write(s, text);
      }
    });
  }

  // Nothing else is going on: is the pet free for a small idle behaviour?
  _free(s) {
    const now = Date.now();
    return s.species && !s.asleep && !s.calling && !s.game && IDLE_MOODS.has(s.moodState) &&
      !s.screen.classList.contains("show-status") &&
      !(s.sayUntil > now) && !(s.poseUntil > now) && !(s.propUntil > now) &&
      !(s.flairUntil > now) && !(s.movingUntil > now);
  }

  // A wander or a look moves the pet off its spot for a while; a hat placed
  // then would be left hovering where the pet was.
  _moving(s, ms) {
    s.movingUntil = Math.max(s.movingUntil || 0, Date.now() + ms);
  }

  _look(s, ms) {
    this._moving(s, ms + 250);
    s.pet.classList.add("look");
    setTimeout(() => s.pet.classList.remove("look"), ms);
  }

  // Idle life: every so often, something small. Calm when motion is reduced.
  // Baby talk for this pet and viewer: "baby" or "child" while it's on and the
  // pet is one (its life_stage state: s.drawn is the drawn stage), else null.
  _babyStage(s) {
    const stage = this._state(s, "sensor.life_stage")?.state;
    return (stage === "baby" || stage === "child") && babyTalk(this._hass?.user?.id) ? stage : null;
  }

  // The baby talk lines for a key at this pet's stage, or null (normal lines).
  _babySet(s, key) {
    const stage = this._babyStage(s);
    return (stage && BABY[key]?.[stage]) || null;
  }

  // The pet's own lines by its personality (PERSONA), for a teen or an adult
  // that has one, else null. Babies and children never have a type.
  _persona(s) {
    const st = this._state(s, "sensor.life_stage");
    return (st?.state === "teen" || st?.state === "adult") && PERSONA[st.attributes?.personality] || null;
  }

  // A line in baby talk, else half the time in its personality's words, else
  // the normal one: {text, baby}. A baby line never carries the catchphrase
  // (callers pass catch: !baby); a personality line may, as the normal one does.
  _lines(s, key, normal, arg) {
    const set = this._babySet(s, key);
    const own = !set && this._persona(s)?.[key];
    const line = set ? pick(set) : own && Math.random() < 0.5 ? pick(own) : null;
    if (line === null) return { text: normal, baby: false };
    return { text: typeof line === "function" ? line(arg) : line, baby: !!set };
  }

  _idle(s) {
    const now = Date.now();
    if (!s.nextIdle) s.nextIdle = now + IDLE_MIN_MS / 2 + Math.random() * IDLE_SPREAD_MS;
    if (now < s.nextIdle) return;
    s.nextIdle = now + IDLE_MIN_MS + Math.random() * IDLE_SPREAD_MS;
    if (!this._free(s)) return;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const own = s.drawn === "child"
      ? Object.keys(s.species.extras || {}).filter((k) => !SHARED_POSES.has(k)) : [];
    const moves = ["mumble"];
    if (own.length) moves.push("pose", "pose");
    if (!calm) moves.push("look", "look", "wander", "perk", "speck");
    if (!calm && s.moodState === "excited") moves.push("hop", "hop");
    const move = pick(moves);
    if (move === "pose") {
      const frames = s.species.extras[pick(own)];
      s.poseFrames = Array.isArray(frames) ? frames : [frames];
      s.poseUntil = now + 2500;
      this._show(s, s.pet, s.poseFrames[0]);
    } else if (move === "look") {
      this._look(s, 1800);
    } else if (move === "wander") {
      const side = pick(["wander-l", "wander-r"]);
      s.pet.classList.add(side);
      this._moving(s, 2200 + 900); // out, and the slide back
      setTimeout(() => s.pet.classList.remove(side), 2200);
    } else if (move === "perk") {
      this._animate(s, s.pet, "perk", 320);
    } else if (move === "hop") {
      this._animate(s, s.pet, "hop", 1400); // two happy bounces
    } else if (move === "speck") {
      const speck = document.createElement("span");
      const rtl = Math.random() < 0.5;
      speck.className = `speck${rtl ? " rtl" : ""}`;
      s.screen.append(speck);
      this._moving(s, 2700);
      setTimeout(() => this._look(s, 1300), rtl ? 1200 : 0); // follows it across
      setTimeout(() => speck.remove(), 2700);
    } else {
      const words = this._words(s);
      const lines = this._babySet(s, `idle.${IDLE_LINES.has(s.moodState) ? s.moodState : "default"}`) || {
        sleepy: ["*yawn*", "mm... sleepy", ...(words.home ? [`my ${words.home} looks cozy...`] : [])],
        bored: ["hmm...", "*rolls around*", "anyone wanna play?"],
        excited: ["hehe!", "wheee"],
        hungry: ["*tummy rumbles*", "is it snack time?", ...(words.food ? [`mmm... ${words.food}...`] : [])],
        dirty: ["ew...", "*sniff sniff*"],
      }[s.moodState] || ["♪ hm hm hm ♪", "...", "*looks around*", "la la la"];
      this._write(s, pick(lines), 2500);
      s.plain = s.bubble.textContent; // idle chatter isn't read out
    }
  }

  // Hello to whoever is looking, by first name, now and then (this browser only).
  // --- Daily check-ins ----------------------------------------------------

  // Every line put straight into the bubble. With ms, it holds the bubble that
  // long; without, the hold stays as it was (a game keeps its own).
  _write(s, text, ms) {
    this._stopTyping(s);
    s.plain = undefined;
    s.bubble.textContent = text;
    if (ms !== undefined) s.sayUntil = Date.now() + ms;
  }

  // A line that may carry the creature's sound, typed out at its pace (and
  // babbled, if this browser wants that). Screen readers get the plain line,
  // once; the sound is hidden from them. With catch: true (lines that name
  // nobody), every third such voiced line ends with its catchphrase.
  _speak(s, said, ms = 4500, { catch: catchy = false } = {}) {
    const voice = s.species?.voice;
    const sound = this._soundFor(s, said);
    let text = said;
    if (sound && catchy && !said.includes("?")) {
      s.catchCount = (s.catchCount || 0) + 1;
      const phrase = this._state(s, "sensor.life_stage")?.attributes.catchphrase;
      if (s.catchCount % 3 === 0 && phrase && `${sound} ${said} ${phrase}`.length <= VOICE_MAX) text = `${said} ${phrase}`;
    }
    const onShow = s === this._slides[this._index];
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const pace = voice?.pace;
    this._stopTyping(s);
    if (sound) s.voicedAt = Date.now();
    s.plain = sound ? `${sound} ${text}` : text;
    s.bubble.textContent = "";
    if (sound) {
      const snd = document.createElement("span");
      snd.className = "snd";
      snd.setAttribute("aria-hidden", "true");
      snd.textContent = `${sound} `;
      s.bubble.append(snd);
    }
    let typingMs = 0;
    const status = s.screen.classList.contains("show-status");
    if (onShow && !calm && !status && pace > 0 && this._visible && !document.hidden) {
      const chars = graphemes(text); // an emoji is never split
      const typed = document.createElement("span");
      const rest = document.createElement("span");
      rest.className = "untyped";
      rest.textContent = text;
      s.bubble.append(typed, rest);
      const start = Date.now();
      typingMs = (chars.length / pace) * 1000;
      const job = { finish: () => { typed.textContent = text; rest.textContent = ""; } };
      job.timer = setInterval(() => {
        if (s.typing !== job) return;
        // By the time gone by, so a tab that was held back catches up.
        const n = Math.min(chars.length, Math.floor(((Date.now() - start) / 1000) * pace));
        typed.textContent = chars.slice(0, n).join("");
        rest.textContent = chars.slice(n).join("");
        if (n >= chars.length) this._stopTyping(s, false);
      }, 40);
      s.typing = job;
      s.bubble.dataset.typing = "1";
      if (sound && babbleOn() && this._mayPlay(s) && !s.game) {
        try {
          s.babbling = babble(text, voice);
        } catch (err) {
          // no WebAudio: it types quietly
        }
      }
    } else {
      s.bubble.append(text);
    }
    s.sayUntil = Date.now() + typingMs + ms;
    const plain = spoken(text);
    if (onShow && plain && s.live.textContent !== plain) s.live.textContent = plain;
  }

  // The sound a line opens with, in the mood of its first sentence ("tweet!",
  // "tweet tweet!!", "tweet?", "tweet..."), or null: no voice (or still an
  // egg), said one lately, the line has an opener of its own, or it wouldn't fit.
  _soundFor(s, text) {
    const sound = s.species?.voice?.sound;
    if (!sound || s.hatchesAt || Date.now() - (s.voicedAt || 0) < VOICE_QUIET_MS) return null;
    const line = String(text).trim();
    if (OPENERS.test(line) || line.toLowerCase().startsWith(sound)) return null;
    const mark = line.match(/!!|[!?]|\.\.\./)?.[0]; // not "…": that's a cut title
    const form = mark === "!!" ? `${sound} ${sound}!!`
      : mark === "?" ? `${sound}?`
      : mark === "..." ? `${sound}...`
      : `${sound}!`;
    return form.length + 1 + line.length > VOICE_MAX ? null : form;
  }

  // Typing done at once (the whole line shows); its babble stops too, unless
  // the line simply finished.
  _stopTyping(s, hush = true) {
    const job = s.typing;
    if (job) {
      s.typing = null;
      clearInterval(job.timer);
      job.finish();
      delete s.bubble.dataset.typing;
    }
    if (hush && s.babbling) {
      stopBabble(s.babbling);
      s.babbling = null;
    }
  }

  // Lines waiting for the bubble (a dream, the away note, a wish), said one at
  // a time once nothing else is being said.
  _queue(s, text, ms = 4500, opts = {}) {
    (s.queue ??= []).push({ text, ms, opts });
  }

  _sayQueued(s) {
    const now = Date.now();
    if (s.asleep && s.queue?.length) {
      // Asleep: the lines wait until it's up (they were said once, on the
      // server's side); only a question is dropped, it may come another day.
      if (s.queue.some((q) => q.ask)) this._clearAsk(s);
      return;
    }
    if (!s.queue?.length || s.sayUntil > now || s.game || s.screen.classList.contains("show-status")) return;
    const { text, ms, then, opts } = s.queue.shift();
    this._speak(s, text, ms, opts);
    this._animate(s, s.pet, "perk", 320);
    then?.();
  }

  // The first look at this pet on this device: what happened while you were
  // out, this morning's dream and today's wish (each once a day per device).
  _firstLook(s) {
    if (!this._channelHeard(s)) return; // the viewer's bond and wish first
    const away = this._state(s, "sensor.mood")?.state === "away";
    if (s.lookedFirst || !s.species || s.asleep || away || this._eggMinutes(this._state(s, "sensor.life_stage")) !== null) return;
    s.lookedFirst = true;
    const stage = this._state(s, "sensor.life_stage")?.attributes || {};
    const device = s.ids?.device;
    // At most FIRST_LOOK_LINES lines, in this order; what doesn't fit isn't said
    // (the dream and wish come again at the next first look; the visit's notes
    // are budgeted on the server from what's queued here).
    const lines = [];
    const home = (s.privateMoments || []).find((m) => m.type === "friend_home");
    const at = home && new Date(home.at).getTime();
    if (at && !sharedScreen() && Date.now() - at < FRIEND_WELCOME_MS && this._welcomeDue(s, at)) {
      // A close friend who came home while the card was closed: welcome them first.
      const bond = this._bond(s);
      const first = short(this._hass.user?.name?.trim().split(/\s+/)[0]);
      lines.push([`welcome home, ${(bond?.level >= BOND.nickname && bond.nickname) || first || "friend"}! ♥`, 5000]);
      if (HOME_WEATHER[home.weather]) lines.push([HOME_WEATHER[home.weather], 4500]);
    }
    let seen = 0;
    try {
      seen = Number(localStorage.getItem(`hatch-seen-${device}`) || 0);
    } catch (err) {
      // no storage: no away note
    }
    if (seen && Date.now() - seen >= AWAY_NOTE_AFTER_MS) {
      const note = this._awayNote(s, seen);
      if (note) lines.push([note, 5500, { away: true }]);
    }
    const dreamt = s.house?.dream || stage.dream; // a show or song's, from the house
    const dream = dreamt && DREAMS[dreamt.kind];
    if (dream && lines.length < FIRST_LOOK_LINES && oncePerDay(`dream-${device}`)) {
      lines.push([dream(dreamt, this._words(s)), 5000]);
    }
    const wish = stage.wish?.open !== false && !stage.wish?.granted && stage.wish && this._wishLine(stage.wish, s);
    if (wish && lines.length < FIRST_LOOK_LINES && oncePerDay(`wish-${device}`)) lines.push([this._wishSaid(s, stage.wish, wish), 5000]);
    for (const [text, ms, opts] of lines.slice(0, FIRST_LOOK_LINES)) this._queue(s, text, ms, opts);
  }

  // Each "came home" is welcomed once in this browser, by any pet (seen live,
  // or at the next look).
  _welcomeDue(s, at) {
    const key = `hatch-welcomed-${this._hass.user?.id}`;
    try {
      // Each pet reports the same arrival a moment apart: one welcome for it.
      if (Number(localStorage.getItem(key) || 0) + WELCOME_SAME_ARRIVAL_MS >= at) return false;
      localStorage.setItem(key, String(at));
    } catch (err) {
      // no storage: once per page load
    }
    return true;
  }

  // Today's wish in the pet's words and short: [line, status text], or null.
  // One aimed at the viewer (their own "mine") speaks to them; everyone else,
  // and every shared screen, sees the plain wish.
  _wishLine(wish, s) {
    if (!WISHES[wish.kind]) return null;
    if (!this._aimedAtMe(wish, s)) return WISHES[wish.kind];
    const bond = this._bond(s);
    const aimed = WISHES_FOR[wish.kind];
    return [withName(aimed[0], bond?.level >= BOND.nickname ? bond.nickname : null), aimed[1]("you")];
  }

  _aimedAtMe(wish, s) {
    return !!(WISHES_FOR[wish.kind] && s.mine?.wish_for_you && !sharedScreen());
  }

  // The wish as the pet says it: in baby talk if it's on (not an aimed wish:
  // that keeps its words; the status screen's short text never changes).
  _wishSaid(s, wish, line) {
    if (this._aimedAtMe(wish, s)) return line[0];
    return this._lines(s, `WISHES.${wish.kind}`, line[0]).text;
  }

  // An open wish comes up once more after the first look (never all day), and
  // only while it can still come true (the server's "open").
  _wishMention(s) {
    const now = Date.now();
    const [lo, hi] = WISH_MENTION_MS;
    const today = new Date().toDateString();
    if (s.wishDay !== today) { // a new day (a tablet left on overnight): a new mention
      s.wishDay = today;
      s.nextWish = 0;
    }
    if (!s.nextWish) s.nextWish = now + lo + Math.random() * (hi - lo);
    if (now < s.nextWish || !this._free(s)) return;
    const wish0 = this._state(s, "sensor.life_stage")?.attributes.wish;
    if (!wish0 || wish0.granted || wish0.open === false) return; // not yet, or not now: keep it
    s.nextWish = Infinity;
    const wish = this._state(s, "sensor.life_stage")?.attributes.wish;
    const line = wish && !wish.granted && wish.open !== false && this._wishLine(wish, s);
    if (line && oncePerDay(`wishmention-${s.ids?.device}`)) this._queue(s, this._wishSaid(s, wish, line));
  }

  // When this device last saw the pet (for the away note), every minute.
  _seen(s) {
    const now = Date.now();
    if (s.seenAt && now - s.seenAt < 60000) return;
    s.seenAt = now;
    try {
      localStorage.setItem(`hatch-seen-${s.ids?.device}`, String(now));
    } catch (err) {
      // no storage
    }
  }

  // "while you were out, I napped, watched the rain and had a snack!": up to
  // three things from the moments and care since the device last looked.
  _awayNote(s, since) {
    const lastCare = this._state(s, "sensor.last_care")?.attributes || {};
    const after = (at) => new Date(at).getTime() > since;
    const bits = [];
    const add = (b) => { if (b && !bits.includes(b)) bits.push(b); };
    const MOMENT_BITS = {
      fell_asleep: "napped", woke_up: "napped", watching: "watched TV", listening: "listened to music",
      news: "heard some news", sunset: "watched the sunset", wish_granted: "got my wish",
      trait_learned: "learned something new", first_snow: "saw the first snow",
    };
    const WEATHER_BITS = { rain_started: "watched the rain", snow_started: "saw snow", rainbow: "saw a rainbow", sun_out: "sunbathed" };
    const CARE_BITS = { feed: "had a meal", snack: "had a snack", play: "played", game: "played a game", clean: "had a bath", chore_treat: "got a chore treat" };
    for (const m of [...(lastCare.moments || [])].reverse()) {
      if (!after(m.at)) continue;
      add(m.type === "weather" ? WEATHER_BITS[m.change] : MOMENT_BITS[m.type]);
    }
    for (const e of [...(lastCare.log || [])].reverse()) {
      if (after(e.at) && (e.result === "ok" || e.result === "won" || e.result === "lost")) add(CARE_BITS[e.action]);
    }
    if (!bits.length) return null;
    const list = bits.slice(0, 2); // two at most: a bubble on a 330 px card
    return `while you were out, I ${list.join(" and ")}!`;
  }

  _hourHello(first) {
    const hour = new Date().getHours();
    return !first
      ? (hour < 12 ? "morning!" : hour < 18 ? "hi!" : "evening!")
      : hour < 12 ? `morning, ${first}!` : hour < 18 ? `hi, ${first}!` : `evening, ${first}!`;
  }

  _greet(s) {
    if (s.greeted || !this._channelHeard(s) || !this._free(s)) return;
    s.greeted = true;
    const user = this._hass.user;
    const bond = this._bond(s);
    const level = bond?.level || 0;
    const nickname = level >= BOND.nickname ? bond.nickname : null;
    const shared = sharedScreen(); // no names on a shared screen
    const first = shared ? null : short(user?.name?.trim().split(/\s+/)[0], 16) || nickname;
    if (!first && !shared) return;
    const key = `hatch-greet-${user?.id}-${s.ids?.device}`;
    try {
      if (Date.now() - Number(localStorage.getItem(key) || 0) < GREET_EVERY_MS) return;
      localStorage.setItem(key, String(Date.now()));
    } catch (err) {
      // no storage (private window): greet anyway, once per page load
    }
    const hello = this._hourHello(first);
    // Baby talk (never on a shared screen, so only with a name): each set swaps
    // on its own, and names go in after the choice.
    const baby = (key, name, normal) => this._babySet(s, key)?.map((line) => line(name)) || normal;
    const lines = first ? baby("greet", first, [hello, `${first}!! hi!`, hello]) : [hello, "hi hi!", hello];
    if (level >= BOND.warm) lines.push(...baby("greet.warm", first, [`${first}! I missed you ♥`, `yay, ${first}'s here!`]));
    if (nickname) lines.push(...baby("greet.nickname", nickname, [`hi, ${nickname}!`, `${nickname}!! ♥`, `there's my ${nickname}!`]));
    // Its personality's hellos, filled the same way: half the time, one of
    // those. A shared screen gets the nameless ones; the bond lines need the
    // viewer's own bond (none on a shared screen), never the level alone.
    const type = this._persona(s);
    const own = !type ? [] : first ? type.hello.map((line) => line(first)) : [...type.hello_shared];
    if (type && bond && first && bond.level >= BOND.warm) own.push(...type.hello_warm.map((line) => line(first)));
    if (type && bond && first && bond.level >= BOND.hearts) own.push(...type.hello_hearts.map((line) => line(first)));
    this._speak(s, pick(own.length && Math.random() < 0.5 ? own : lines), 4000);
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (level >= BOND.hop && !calm) this._animate(s, s.pet, "greethop", 1400);
    else this._animate(s, s.pet, "perk", 320);
    if (level >= BOND.hearts && !calm) this._bondHearts(s);
  }

  // The creature's own words (food, home), for its stage (a moth isn't a
  // caterpillar): species.json "words", with per-stage overrides.
  _words(s) {
    const words = s.species?.words || {};
    const stage = this._state(s, "sensor.life_stage")?.state;
    return { food: words.food, home: words.home, ...(words[stage] || {}) };
  }

  // The viewer's own bond with this pet: {level, nickname?, favourite?} or null.
  _bond(s) {
    if (sharedScreen()) return null; // nobody's bond on a shared screen
    return s.mine?.bond || null;
  }

  // Tell the pet who's looking in (for the bond, and a "come say hi" wish).
  _visit(s) {
    const id = s.ids?.["sensor.life_stage"];
    // Not before the first look has run (it needs the creature and the
    // channel's first word): it says what's queued.
    if (!id || !s.species || !this._channelHeard(s) || !this._hass.user || sharedScreen() ||
      Date.now() - (s.visitedAt || 0) < VISIT_EVERY_MS) return;
    s.visitedAt = Date.now();
    const queued = Math.min((s.queue || []).length, 6);
    this._hass.callService("virtual_pet", "visit", { entity_id: id, queued }, undefined, false, true)
      .then((res) => {
        const reply = res?.response || {};
        if (s.ids?.["sensor.life_stage"] !== id) return; // the slide shows another pet now
        if (reply.counted === false) {
          // Not counted (it was asleep, or too soon): try again in a few minutes,
          // so the morning's lines come soon after it wakes.
          s.visitedAt = Date.now() - VISIT_EVERY_MS + VISIT_RETRY_MS;
        }
        if (sharedScreen()) return; // switched while the reply was on its way
        if (typeof reply.my_day === "boolean") this._myDay = reply.my_day;
        if (typeof reply.baby_talk === "boolean") setBabyTalk(this._hass.user?.id, reply.baby_talk);
        if (typeof reply.birthday_kept === "boolean") this._birthdayKept = reply.birthday_kept;
        if (typeof reply.birthday_phone === "boolean") this._birthdayPhone = reply.birthday_phone;
        (reply.notes || []).forEach((note) => this._note(s, note, !!reply.made_room));
        const ask = reply.ask;
        if (QUESTIONS[ask] && !s.asking) {
          s.asking = true;
          (s.queue ??= []).push({ text: QUESTIONS[ask].q, ms: ASK_MS, ask: true, then: () => this._ask(s, ask, id) });
        }
      })
      .catch(() => {
        // an older integration has no visit: no bond yet, nothing else changes
      });
  }

  // Something the pet has to tell only the viewer (from the visit).
  _note(s, note, madeRoom = false) {
    let line = NOTES[note.kind]?.(note);
    if (!line) return;
    if (CELEBRATION_NOTES.has(note.kind) && madeRoom && s.queue) {
      // The look was full and the server made room for a celebration: it
      // takes the away note's place (if that isn't said yet).
      const away = s.queue.findIndex((q) => q.opts?.away);
      if (away >= 0) s.queue.splice(away, 1);
    }
    if (note.kind === "your_birthday") {
      const bond = this._bond(s);
      const name = (bond?.level >= BOND.nickname && bond.nickname) || short(this._hass.user?.name?.trim().split(/\s+/)[0], 16);
      if (!note.quiet && name) line = `happy birthday, ${name}!! ♥`;
      (s.queue ??= []).push({ text: line, ms: 5000, personal: true, then: () => {
        if (!note.quiet) this._chirp(s, "birthday");
        this._sparkle(s);
      } });
      return;
    }
    if (note.kind === "up_early") { // said while it sleeps: not queued behind its sleep
      this._speak(s, line, 5000);
      return;
    }
    this._queue(s, line, 5000, { personal: true });
    if (note.kind === "friends_for") {
      this._sparkle(s);
      if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) this._bondHearts(s);
    }
  }

  // A question with its answers as buttons (the line is already in the bubble).
  _ask(s, kind, entity = s.ids?.["sensor.life_stage"]) {
    const question = QUESTIONS[kind];
    if (!question || s.game || s.ids?.["sensor.life_stage"] !== entity) {
      s.asking = false; // a game, or another pet on this slide now: not now
      return;
    }
    s.screen.querySelector(".askday")?.remove();
    const box = document.createElement("div");
    box.className = "askday";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", question.q);
    const mine = this._state(s, "sensor.life_stage")?.attributes.catchphrase || "mine";
    const answers = Object.keys(question.answers);
    box.classList.toggle("many", answers.length > 3);
    box.innerHTML = (question.picker?.() || "") + answers
      .map((a) => `<button data-answer="${escape(a)}">${escape(question.label?.(a, s, mine) ?? a)}</button>`).join("");
    const done = () => {
      box.remove();
      s.asking = false;
      clearTimeout(s.askTimer);
    };
    // No tap in the box reaches the screen behind (it would open the status),
    // and while someone is picking, it stays.
    for (const type of ["click", "change", "pointerdown", "pointerup"]) box.addEventListener(type, (e) => e.stopPropagation());
    const wait = () => {
      clearTimeout(s.askTimer);
      s.askTimer = setTimeout(done, ASK_MS);
    };
    box.addEventListener("focusin", wait);
    box.addEventListener("change", (e) => {
      wait();
      question.changed?.(box, e);
    });
    box.addEventListener("click", (e) => {
      let answer = e.target.closest("button")?.dataset.answer;
      if (!answer) return;
      if (question.value) answer = question.value(box, answer);
      if (!answer) return;
      this._tapped(e.target.closest("button"));
      done();
      const lines = question.answers[answer] ?? question.answers[e.target.closest("button").dataset.answer];
      this._speak(s, question.reply ? question.reply(answer, s, mine) : pick(lines), 4500);
      const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (["great", "you"].includes(answer) && !calm) this._animate(s, s.pet, "greethop", 1400);
      else if (["tough", "not really"].includes(answer) && !calm) this._bondHearts(s);
      else this._animate(s, s.pet, "perk", 320);
      if (question.keep) this._keepAnswer(s, kind, answer, entity);
    });
    s.screen.append(box);
    s.askTimer = setTimeout(done, ASK_MS);
  }

  // A websocket command, not a service call: answers stay off the event bus.
  // A failure is retried once, quietly. If that fails too, the pet says so and a
  // once-question is kept on this device for later. The bubble is written only
  // while the slide still shows the pet that was asked.
  _keepAnswer(s, kind, answer, entity) {
    const user = this._hass.user?.id;
    const send = () => this._hass.callWS({ type: "virtual_pet/answer", entity_id: entity, question: kind, answer });
    const kept = () => {
      if (kind === "birthday") {
        this._birthdayKept = answer !== "skip";
        this._setMine("birthday_kept", answer !== "skip"); // the channel's push confirms it
      }
    };
    send().then(kept).catch(() => {
      setTimeout(() => {
        send().then(kept).catch((err) => {
          if (s.ids?.["sensor.life_stage"] === entity) this._write(s, "hm, that one slipped away ♪", 3500);
          if (!user || !STASHED_QUESTIONS.includes(kind) || sharedScreen()) return;
          if (err?.code === "not_asked" || err?.code === "invalid_answer") return; // the server will not take it
          const list = stashedAnswers(user).filter((a) => a.question !== kind);
          list.push({ question: kind, answer, at: Date.now(), entity });
          saveStashedAnswers(user, list);
        });
      }, ANSWER_RETRY_MS);
    });
  }

  // Hearts that float up around the pet: only for someone it's very close to.
  _bondHearts(s) {
    s.screen.querySelector(".bondhearts")?.remove();
    const box = document.createElement("div");
    box.className = "bondhearts";
    box.setAttribute("aria-hidden", "true");
    [[-34, 0], [30, 0.35], [-8, 0.7], [16, 1.05]].forEach(([x, delay]) => {
      const img = document.createElement("img");
      img.src = `${BASE}/ui/stat_heart_full.png?v=${VERSION}`;
      img.alt = "";
      img.style.setProperty("--x", `${x}px`);
      img.style.animationDelay = `${delay}s`;
      box.append(img);
    });
    s.screen.append(box);
    setTimeout(() => box.remove(), 2800);
  }

  // The frames to draw now: a reaction pose while one runs, else the mood's.
  _frames(s) {
    return s.poseUntil && Date.now() < s.poseUntil ? s.poseFrames : s.frames || [];
  }

  _animate(s, el, cls, ms) {
    el.classList.remove(cls);
    void el.offsetWidth; // restart the animation
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  // A chirp, if this device turned sounds on and the pet is up at a sane hour.
  // Only the pet on show chirps: the shelf's other slides update too.
  _chirp(s, name) {
    if (!soundsOn() || !this._mayPlay(s)) return;
    try {
      playChirp(name);
    } catch (err) {
      // no WebAudio: stay quiet
    }
  }

  // The pet on show, up at a sane hour, on a page in view: it may make a sound.
  _mayPlay(s) {
    if (s !== this._slides[this._index]) return false;
    const hour = new Date().getHours();
    const late = hour >= QUIET_HOURS[0] || hour < QUIET_HOURS[1];
    return !s.asleep && !s.lightsOut && !late && document.visibilityState === "visible";
  }

  // A sample from a settings tap: _mayPlay's rules. Returns the status note that
  // says why it stayed quiet ("" when it was skipped for another reason), or null
  // when it may play. The tap itself still unlocks audio (see the callers).
  _maySample(s) {
    if (this._mayPlay(s)) return null;
    const hour = new Date().getHours();
    if (hour >= QUIET_HOURS[0] || hour < QUIET_HOURS[1]) return "sounds are on: quiet till morning ♪";
    if (s.lightsOut) return "sounds are on: shh, it's napping"; // lights out puts it to sleep too
    if (s.asleep) return "sounds are on: shh, it's sleeping";
    return "";
  }

  _sparkle(s) {
    const ring = document.createElement("span");
    ring.className = "burst big";
    s.screen.append(ring);
    setTimeout(() => ring.remove(), 600);
  }

  // Something happened in HA: show it. From sensor.last_care "moments", or
  // from the private channel (the viewer's own moments, the house's shows).
  _moment(s, m) {
    const say = (text, ms = 4500) => {
      this._write(s, text, ms);
    };
    const speak = (text, ms = 4500) => this._speak(s, text, ms, { catch: true }); // may carry its sound
    switch (m.type) {
      case "care_miss":
        say(this._lines(s, "care_miss", "...oh, there you are ♥").text, 5000); // never guilt
        this._animate(s, s.pet, "perk", 320);
        break;
      case "discipline_miss":
        say("ok, ok... ♪");
        break;
      case "call_answered":
        if (m.reason === "fake" && m.answer !== "spoiled") { // only a fair scold sulks
          say("ok... sorry");
          this._animate(s, s.pet, "sulk", 800);
        }
        break;
      case "hatched":
        say("hello!");
        this._chirp(s, "hatch");
        this._animate(s, s.pet, "born", 500);
        this._sparkle(s);
        break;
      case "stage_changed":
        if (m.stage === "baby") break; // hatching says hello
        say(m.stage === "adult"
          ? "all grown up! ♥" // the upbringing is on the status screen, not announced
          : `I'm a ${m.stage} now!`);
        // A new teen tells its personality, in a bubble of its own after this one.
        if (m.stage === "teen" && PERSONA[m.personality]) this._queue(s, pick(PERSONA[m.personality].reveal), 4500, { catch: true });
        this._animate(s, s.pet, "stretch", 1100);
        this._sparkle(s);
        break;
      case "trait_learned":
      case "trait_deepened":
        say(`${m.type === "trait_learned" ? "new trait" : "deeper trait"}: ` +
          `${String(m.trait).replaceAll("_", " ")} ${"★".repeat(m.level || 1)}`);
        this._sparkle(s);
        this._chirp(s, "trait");
        // Show what the new trait looks like, so its flair means something later.
        setTimeout(() => this._flair(s, m.trait), 700);
        break;
      case "egg_laid":
        say("see you in the journal!");
        this._animate(s, s.pet, "born", 500);
        this._sparkle(s);
        break;
      case "woke_up":
        if (m.how === "morning") {
          say("*yaaawn*");
          this._animate(s, s.pet, "stretch", 1100);
        } else if (m.how === "night") {
          say("...so sleepy");
        }
        break;
      case "fell_asleep":
        if (m.how === "collapsed") {
          say("so... sleepy... zzz", 5000);
        } else if (m.how === "house" || m.how === "lights") {
          say(this._lines(s, "fell_asleep", pick(["good night...", "night night...", "sleep tight..."])).text, 4000);
        }
        break;
      case "good_morning":
        speak(this._lines(s, "good_morning", pick(["morning!! you're up!", "morning! ♪"])).text);
        this._animate(s, s.pet, "stretch", 1100);
        break;
      case "sunset":
        speak(this._lines(s, "sunset", pick(["ooh, the sunset...", "pretty sky tonight", "the sun's going down"])).text);
        this._look(s, 3000);
        break;
      case "sunrise":
        speak(pick(["the sun's up!", "good morning, sun!"]));
        this._look(s, 2500);
        break;
      case "watching":
        if (!m.title) break;
        // A long title gets the short lines, so the bubble leaves the pet in view.
        const title = short(m.title);
        this._speak(s, pick([`ooh, ${title}!`, `is this ${title}?`, `${title}! I love this one`]), 4500);
        this._animate(s, s.pet, "perk", 320);
        break;
      case "listening":
        if (!m.title) break;
        this._speak(s, m.artist && Math.random() < 0.5
          ? `♪ is this ${short(m.artist)}? ♪`
          : `♪ ${short(m.title)} ♪`);
        break;
      case "news": { // virtual_pet.share_news: a passing moment, like a TV title
        const h = String(m.headline || "");
        if (!h || s.game) break; // a game's prompt owns the bubble: dropped, like asleep
        // A long headline gets only the shortest lead-in (the bubble holds ~60).
        const lines = h.length > 45 ? [`news! ${h}`]
          : [`did you hear? ${h}`, `did you hear? ${h}`, `guess what? ${h}`, `ooh, news! ${h}`];
        // A short topic only, so the bubble stays small ("World News news!" never).
        const topic = String(m.topic || "");
        if (topic && topic.length <= 12 && h.length <= 45 && !/news$/i.test(topic)) {
          lines.push(`${topic} news! ${h}`);
        }
        const line = pick(lines);
        this._speak(s, line, 4000 + line.length * 50); // long enough to read; a headline gets no catchphrase
        this._animate(s, s.pet, "perk", 320);
        break;
      }
      case "weather": { // the weather just changed (or a hot or freezing day)
        if (s.game) break; // a game's prompt owns the bubble
        const t = degrees(m.temperature);
        const lines = {
          rain_started: ["ooh, it's raining!", "pitter patter...", "here comes the rain!"],
          rain_stopped: ["the rain stopped!", "all dry again~"],
          rainbow: ["the rain stopped... a rainbow?!", "sun after rain... rainbow?"],
          snow_started: ["it's snowing!! ❄", "snowflakes!! ❄"],
          sun_out: ["the sun came out!", "ooh, sunshine!"],
          hot: t ? [`${t} out there! phew`, `so hot out... ${t}!`] : ["so hot out there!"],
          cold: t ? [`brr, ${t} outside!`, `${t} out there... brr`] : ["brr, so cold out!"],
        }[m.change];
        if (!lines) break;
        (m.change === "cold" ? say : speak)(pick(lines)); // a sulk gets no cheery sound
        if (m.change === "rainbow" || m.change === "snow_started") this._sparkle(s);
        if (m.change === "cold") this._animate(s, s.pet, "sulk", 800);
        else this._look(s, 2500);
        break;
      }
      case "forecast": { // something worth a word in today's or tomorrow's forecast
        if (s.game) break;
        const today = m.when === "today";
        const hi = degrees(m.high);
        const lines = {
          storm: today ? ["thunder later... eek"] : ["storms tomorrow... eek"],
          snow: today ? ["snow today?!", "it might snow today!!"] : ["snow tomorrow!!", "ooh, snow tomorrow?!"],
          hot: hi ? [today ? `hot one today: ${hi}!` : `${hi} tomorrow! phew`] : [today ? "hot one today!" : "hot tomorrow, phew"],
          cold: hi ? [today ? `cold one today: ${hi}, brr` : `brr, only ${hi} tomorrow`] : [today ? "cold one today, brr" : "cold tomorrow, brr"],
          warmer: hi ? [today ? `warmer today: ${hi}!` : `warmer tomorrow: ${hi}!`] : [today ? "warmer today!" : "warmer tomorrow!"],
          colder: hi ? [today ? `colder today, only ${hi}` : `colder tomorrow... ${hi}`] : [today ? "colder today..." : "colder tomorrow..."],
          rain: today ? ["rain later today...", "rain's coming later"] : ["rain tomorrow... blanket day?"],
          sunny: today ? ["sunny today! yay"] : ["sun tomorrow! yay"],
        }[m.kind];
        if (!lines) break;
        (["storm", "cold", "colder"].includes(m.kind) ? say : speak)(pick(lines), 5000);
        if (m.kind === "cold" || m.kind === "colder") this._animate(s, s.pet, "sulk", 800);
        else this._animate(s, s.pet, "perk", 320);
        break;
      }
      case "wish_granted": // lines that arrive together queue, so none is lost
        this._sparkle(s);
        this._chirp(s, "trait");
        const granted = this._lines(s, "wish_granted", pick(["my wish came true! thank you ♥", "yay, my wish! ♥", "best day ever! ♥"]));
        this._queue(s, granted.text, 4500, { catch: !granted.baby });
        break;
      case "bond_up": { // only the person whose bond it is gets it (the channel)
        if (sharedScreen()) break; // nothing personal on a shared screen
        this._sparkle(s);
        this._chirp(s, "trait");
        const game = GAMES.find((g) => g.key === m.favourite);
        this._queue(s, game ? `${game.label} is our game now! ♥`
          : m.nickname ? `can I call you ${m.nickname}? ♥`
          : m.level >= BOND.max ? "you're my very best friend ♥"
          : m.level === BOND.max - 1 ? "you make every day better ♥"
          : m.level >= BOND.hearts ? "I'm always so happy when you're here ♥"
          : this._lines(s, "bond_up", pick(["I like you a lot, you know ♥", "we're getting close! ♥", "you're the best ♥"])).text, 5000);
        break;
      }
      case "friend_home": { // the viewer, a close friend, came home (the channel)
        if (sharedScreen()) break; // a shared screen has someone_home
        if (!this._welcomeDue(s, new Date(m.at).getTime())) break;
        this._queue(s, this._lines(s, "friend_home", pick(["you're home!! ♥", "yay, you're back! ♥"])).text, 4500);
        if (HOME_WEATHER[m.weather]) this._queue(s, HOME_WEATHER[m.weather], 4500);
        const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        if (!calm) this._animate(s, s.pet, "greethop", 1400);
        s.visitedAt = 0; // look in again now: the pet may want to ask about your day
        this._visit(s);
        break;
      }
      case "someone_home": // anyone signed in came home: nameless, shared screens only
        if (!sharedScreen()) break; // their own card says "you're home!!"
        this._queue(s, "someone's home!! ♥", 4000);
        this._animate(s, s.pet, "perk", 320);
        break;
      case "bond_record": { // only its person
        if (sharedScreen()) break; // nothing personal on a shared screen
        const game = GAMES.find((g) => g.key === m.game);
        this._sparkle(s);
        this._queue(s, `new best at ${game ? game.label : "a game"}! ${m.wins}/5 ♥`);
        break;
      }
      case "tucked_in": {
        if (sharedScreen()) break; // nothing personal on a shared screen
        const bond = this._bond(s);
        const name = short((bond?.level >= BOND.nickname && bond.nickname) ||
          this._hass.user?.name?.trim().split(/\s+/)[0], 16);
        // Instead of the plain goodnight just said, not after it.
        this._speak(s, withName(this._lines(s, "tucked_in", "thank you for tucking me in ♥").text, name), 4000);
        break;
      }
      case "bond_favourite":
        if (!sharedScreen()) {
          this._queue(s, pick(["our favourite game! ♥", "I love playing this with you ♥"]));
        }
        break;
      case "favourite_snack": // at most once a day (the server's); a holiday snack says its own
        if (!seasonNow(this._config)?.snack) {
          const food = short(m.food, 16);
          const line = this._lines(s, "favourite_snack", `${food}, my favourite!!`, food);
          this._queue(s, line.text, 4500, { catch: !line.baby });
        }
        break;
      case "tv_off_late":
        say(pick(["*yawn* bedtime?", "all done? sleepy now..."]));
        break;
      case "first_snow":
        speak("the first snow!! ❄");
        this._sparkle(s);
        this._animate(s, s.pet, "stretch", 1100);
        break;
      case "first_frost":
        speak("brr, frost outside!");
        this._animate(s, s.pet, "sulk", 800);
        break;
      case "pooped": {
        const img = s.poops[(m.count || 1) - 1];
        if (img) this._animate(s, img, "born", 450);
        break;
      }
    }
  }

  _react(s, entry) {
    s.screen.querySelector(".costume")?.remove(); // care takes the stage
    if (entry.action === "chore_treat") {
      this._write(s, "a treat! someone did a chore ♪", 3500);
    }
    if (["ok", "won", "lost"].includes(entry.result)) {
      const key = PROP_FOR[entry.action] || entry.action;
      // The species' own reaction pose, drawn for the child only.
      const pose = s.species?.reactions?.[entry.result === "won" ? "won" : entry.action];
      const poseFrames = s.drawn === "child" && s.species?.extras?.[pose];
      if (poseFrames) {
        s.poseFrames = Array.isArray(poseFrames) ? poseFrames : [poseFrames];
        s.poseUntil = Date.now() + 2500;
        this._show(s, s.pet, s.poseFrames[0]);
      }
      if (entry.action === "fan") { // the fan stands by, and its breeze crosses the scene
        s.screen.classList.add("breezy");
        clearTimeout(s.breezeTimer);
        s.breezeTimer = setTimeout(() => s.screen.classList.remove("breezy"), 2600);
      }
      const food = this._words(s).food;
      if (entry.action === "feed" && food && Math.random() < 0.5) {
        this._write(s, this._lines(s, "yum", `yum, ${food}!`, food).text, 2500); // its own food, in its own words
      }
      if (entry.action === "praise") {
        this._write(s, "♥", 2500);
      }
      const season = seasonNow(this._config);
      const candy = season?.snack && key === "snack" ? `../ui/season_${season.key}_${season.snack}` : null;
      if (candy) {
        this._write(s, pick(season.snackLines || ["a treat! ♪"]), 2500);
      }
      const prop = candy || s.species?.props?.[key] || FALLBACK_PROPS[key];
      if (prop) {
        this._show(s, s.prop, prop);
        s.propUntil = Date.now() + 2500;
      }
      return;
    }
    const line = REFUSALS[entry.result];
    if (line) {
      this._write(s, this._lines(s, `REFUSALS.${entry.result}`, line).text, 3500);
    }
  }

  _renderStatus(s, log) {
    if (s.journal) {
      this._renderJournal(s);
      return;
    }
    const value = (key) => {
      const v = Number.parseFloat(this._state(s, `sensor.${key}`)?.state);
      return Number.isFinite(v) ? v : null;
    };
    const hearts = (v, full = Infinity) => {
      if (v === null) return "–";
      // 4 hearts, in halves, to the nearest; a pet the server calls full is full.
      const halves = v >= full ? 8 : Math.round(v / 12.5);
      const img = (n) => `<img src="${BASE}/ui/stat_heart_${n}.png?v=${VERSION}" alt="">`;
      let out = "";
      for (let i = 0; i < 4; i++) {
        const left = halves - i * 2;
        out += img(left >= 2 ? "full" : left === 1 ? "half" : "empty");
      }
      return `<span class="hearts" role="img" aria-label="${Math.round(v)} of 100">${out}</span>`;
    };
    const stageAttrs = this._state(s, "sensor.life_stage")?.attributes || {};
    const traits = (stageAttrs.traits || []).map((t) => traitLabel(t, stageAttrs.trait_levels?.[t],
      t === stageAttrs.inherited_trait));
    // The trait it's closest to learning, while it has room for another.
    const held = new Set(stageAttrs.traits || []);
    const cap = stageAttrs.trait_cap ?? TRAIT_CAP;
    const nextTrait = held.size < cap
      ? Object.entries(stageAttrs.trait_progress || {})
        .filter(([t, p]) => !held.has(t) && FLAIR[t] && p > 0.05 && p < 1)
        .sort((a, b) => b[1] - a[1])[0]
      : null;
    let bestCatch = 0;
    try {
      bestCatch = this._config?.experimental_catch ? Number(localStorage.getItem(BEST_CATCH_KEY) || 0) : 0;
    } catch (err) {
      // no storage: no best score to show
    }
    // The viewer's own bond, in five hearts (a half heart a level).
    const bond = this._bond(s);
    const bondHearts = (level) => {
      const img = (n) => `<img src="${BASE}/ui/stat_heart_${n}.png?v=${VERSION}" alt="">`;
      let out = "";
      for (let i = 0; i < BOND.max / 2; i++) {
        const left = level - i * 2;
        out += img(left >= 2 ? "full" : left === 1 ? "half" : "empty");
      }
      return `<span class="hearts" role="img" aria-label="bond level ${level} of ${BOND.max}">${out}</span>`;
    };
    const notifying = !!s.mine?.notify_me;
    const myDay = this._mineSwitch(s, "my_day", this._myDay);
    const birthdayKept = this._mineSwitch(s, "birthday_kept", this._birthdayKept);
    const birthdayPhone = this._mineSwitch(s, "birthday_phone", this._birthdayPhone);
    const ic = (n) => pixelIcon(n, 18);
    const bar = (v) => v === null ? "–"
      : `<div class="bar" role="img" aria-label="${Math.round(v)} of 100"><div style="width:${v}%"></div></div>`;
    const lines = log.slice(0, 3).map((e) =>
      `<div>${escape(e.action.replace("_", " "))}${e.by && !sharedScreen() ? ` by ${escape(e.by)}` : ""} · ${timeAgo(e.at)}` +
      `${e.result && e.result !== "ok" ? ` (${escape(e.result.replace("_", " "))}${e.score ? ` ${escape(e.score)}` : ""})` : ""}</div>`);
    const row = (iconName, label, value) =>
      `<div class="row">${iconName ? ic(iconName) : "<span></span>"}<span>${label}</span>${value}</div>`;
    // A two-tap "forget", armed or not (confirmTap).
    const forgetButton = (cls, key, aria) => {
      const sure = confirmArmed(s, key);
      return `<span><button class="bell ${cls}" aria-label="${sure ? CONFIRM_ARIA[key] : aria}">${sure ? "sure? tap again" : "forget"}</button></span>`;
    };
    const adult = this._state(s, "sensor.life_stage")?.state === "adult";
    const teenOrAdult = adult || this._state(s, "sensor.life_stage")?.state === "teen";
    const isEgg = this._state(s, "sensor.life_stage")?.state === "egg";
    // The creature picked for the next egg (if any), and its world if that changes.
    const nextEgg = [stageAttrs.next_egg?.toLowerCase(), stageAttrs.next_world && `in ${stageAttrs.next_world}`]
      .filter(Boolean).join(" ");
    // Today's wish comes first: it changes daily, the rest is there every day.
    const html = `
      ${stageAttrs.wish && WISHES[stageAttrs.wish.kind] ? row(null, "wish", stageAttrs.wish.granted
        ? `<span>♥ came true!</span>` : `<span>♡ ${escape(this._wishLine(stageAttrs.wish, s)[1])}</span>`) : ""}
      ${bond ? row(null, "you two", bondHearts(bond.level)) : ""}
      ${row("icon_feed", "hunger", hearts(value("hunger"), FEED_FULL_AT))}
      ${row("icon_play", "happy", hearts(value("happiness")))}
      ${row("stat_energy", "energy", bar(value("energy")))}
      ${row("stat_health", "health", bar(value("health")))}
      ${row("stat_discipline", "discipline", bar(value("discipline")))}
      ${row(null, "weight", `<span>${weightLabel(value("weight"))}</span>`)}
      ${row("stat_care_miss", "misses", `<span>${value("care_misses") ?? "–"}</span>`)}
      ${row(null, "whines", `<span>${this._state(s, "sensor.care_misses")?.attributes.discipline_misses ?? 0}</span>`)}
      ${row(null, traits.length > cap ? "traits" : `traits ${traits.length}/${cap}`, `<span>${traits.length ? traits.join(" · ") : "none yet"}</span>`)}
      ${bestCatch ? row(null, "best catch", `<span>${bestCatch}/${CATCH.rounds}</span>`) : ""}
      ${nextTrait ? row(null, "learning", `<span class="tnext">${traitIcon(nextTrait[0])}` +
        `${escape(nextTrait[0].replaceAll("_", " "))}${bar(Math.round(nextTrait[1] * 100))}</span>`) : ""}
      ${stageAttrs.upbringing ? row(null, adult ? "raised" : "growing up", `<span>${escape(stageAttrs.upbringing)}</span>`) : ""}
      ${stageAttrs.personality && teenOrAdult ? row(null, "personality", `<span>${escape(stageAttrs.personality.replaceAll("_", " "))}</span>`) : ""}
      ${nextEgg ? row(null, isEgg ? "hatching" : "next egg", `<span>${escape(nextEgg)}</span>`) : ""}
      ${sharedScreen() ? "" : row(null, "notify me", `<span><button class="bell notify" aria-label="notify me" aria-pressed="${notifying}">${notifying ? "on" : "off"}</button></span>`)}
      ${bond && myDay === undefined ? row(null, "my day", `<span>…</span>`) : ""}
      ${bond && myDay !== undefined ? row(null, "my day", `<span><button class="bell myday" aria-label="my day: let the pet notice your steps, sleep, alarm and trips" aria-pressed="${!!myDay}">${myDay ? "on" : "off"}</button></span>`) : ""}
      ${birthdayKept && !sharedScreen() ? row(null, "my birthday", forgetButton("forgetbday", "forget_birthday", "forget my birthday")) +
        row(null, "birthday on my phone", `<span><button class="bell bdayphone" aria-label="birthday on my phone: a happy birthday message on your phone on the day" aria-pressed="${!!birthdayPhone}">${birthdayPhone ? "on" : "off"}</button></span>`) : ""}
      ${sharedScreen() ? "" : row(null, "baby talk", `<span><button class="bell babytalk" aria-label="baby talk: simpler words while a pet is a baby or child" aria-pressed="${babyTalk(this._hass.user?.id)}">${babyTalk(this._hass.user?.id) ? "on" : "off"}</button></span>`)}
      ${sharedScreen() ? "" : row(null, "my data", forgetButton("forgetme", "forget_me", "forget my data: your birthday, answers and settings for every pet; your bonds stay"))}
      ${row(null, "sounds here", `<span><button class="bell sound" aria-label="sounds here" aria-pressed="${soundsOn()}">${soundsOn() ? "on" : "off"}</button></span>`)}
      ${s.species?.voice ? row(null, "babble", `<span><button class="bell babble" aria-label="babble: the pet's voice as it talks, on this device" aria-pressed="${babbleOn()}">${babbleOn() ? "on" : "off"}</button></span>`) : ""}
      ${row(null, "shared screen", `<span><button class="bell shared" aria-label="shared screen: nothing personal on this device" aria-pressed="${sharedScreen()}">${sharedScreen() ? "on" : "off"}</button></span>`)}
      <div class="log">${lines.join("") || "<div>no care yet</div>"}</div>
      <button class="jlink">journal ›</button>
      <div class="status-feedback" role="status" aria-live="polite" hidden></div>`;
    if (!this._setStatus(s, html)) return;
    this._journalLink(s, true);
    s.status.querySelector(".bell.myday")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      this._setMyDay(s, !myDay, e.currentTarget);
    });
    // No "notify me" row on a shared screen.
    s.status.querySelector(".bell.notify")?.addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      this._setNotify(s, !notifying, e.currentTarget);
    });
    s.status.querySelector(".bell.shared").addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      const on = !sharedScreen();
      try {
        localStorage.setItem(SHARED_KEY, on ? "on" : "off");
      } catch (err) {
        this._statusMessage(s, "This browser can't save that setting.");
        return;
      }
      if (on) this._goShared();
      else this._goPersonal();
      window.dispatchEvent(new CustomEvent(SHARED_EVENT, { detail: { on, from: this } }));
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      this._statusMessage(s, on ? "Nothing personal on this screen now." : "This screen is personal again.");
    });
    s.status.querySelector(".bell.sound").addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      const on = !soundsOn();
      try {
        localStorage.setItem(SOUND_KEY, on ? "on" : "off");
      } catch (err) {
        this._statusMessage(s, "This browser can't save sound settings.");
        return; // no storage: sounds stay off
      }
      let skipped = null;
      try {
        if (on) {
          unlockAudio(); // inside the tap: phones need it even when the sample is skipped
          skipped = this._maySample(s);
          if (skipped === null) playChirp("win"); // a sample
        }
      } catch (err) {
        // no WebAudio: the setting stays, and stays quiet
      }
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      if (skipped) this._statusMessage(s, skipped);
    });
    s.status.querySelector(".bell.bdayphone")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      const enabled = !birthdayPhone;
      this._hass.callWS({ type: "virtual_pet/birthday_phone", entity_id: s.ids?.["sensor.life_stage"], enabled })
        .then(() => {
          this._birthdayPhone = enabled;
          this._setMine("birthday_phone", enabled);
          this._statusMessage(s, enabled ? "Your phone will hear it on the day ♥" : "Only here, then.");
          this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
        })
        .catch(() => this._statusMessage(s, "That didn't work. Try again."));
    });
    s.status.querySelector(".bell.babytalk")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      this._setBabyTalk(s, !babyTalk(this._hass.user?.id), e.currentTarget);
    });
    const redrawStatus = () => this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
    s.status.querySelector(".bell.forgetbday")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      if (!this._confirmed(s, "forget_birthday", e.currentTarget, redrawStatus)) return;
      this._hass.callWS({ type: "virtual_pet/forget_birthday", entity_id: s.ids?.["sensor.life_stage"] })
        .then(() => {
          this._birthdayKept = false;
          this._birthdayPhone = false;
          this._setMine("birthday_kept", false);
          this._setMine("birthday_phone", false);
          redrawStatus(); // first: a redraw replaces the message's line
          this._statusMessage(s, "Forgotten. I won't ask again.");
        })
        .catch(() => {
          redrawStatus(); // "forget" again, not "sure?"
          this._statusMessage(s, "That didn't work. Try again.");
        });
    });
    // "forget my data": this person's record in the people store, for every
    // pet (not their bonds), and this browser's copies of it.
    s.status.querySelector(".bell.forgetme")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      if (!this._confirmed(s, "forget_me", e.currentTarget, redrawStatus)) return;
      const user = this._hass.user?.id;
      this._hass.callWS({ type: "virtual_pet/forget_me" })
        .then(() => {
          setBabyTalk(user, false);
          this._myDay = false;
          this._birthdayKept = false;
          this._birthdayPhone = false;
          for (const key of ["my_day", "baby_talk", "birthday_kept", "birthday_phone"]) this._setMine(key, false);
          for (const slide of this._slides || []) { // lines told only to them
            if (slide.queue) slide.queue = slide.queue.filter((q) => !q.personal && !q.opts?.personal && !q.ask);
          }
          try {
            localStorage.removeItem(`hatch-welcomed-${user}`);
            const greets = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key?.startsWith(`hatch-greet-${user}-`)) greets.push(key);
            }
            greets.forEach((key) => localStorage.removeItem(key));
            localStorage.removeItem(ANSWERS_KEY + user);
          } catch (err) {
            // no storage (a private window): nothing kept here
          }
          redrawStatus(); // first: a redraw replaces the message's line
          this._statusMessage(s, "Forgotten. The pets start fresh with you ♥");
        })
        .catch(() => {
          redrawStatus(); // "forget" again, not "sure?"
          this._statusMessage(s, "That didn't work. Try again.");
        });
    });
    s.status.querySelector(".bell.babble")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      const on = !babbleOn();
      try {
        localStorage.setItem(BABBLE_KEY, on ? "on" : "off");
      } catch (err) {
        this._statusMessage(s, "This browser can't save sound settings.");
        return;
      }
      let skipped = null;
      try {
        if (on) { // a sample; this tap also unlocks audio on phones
          unlockAudio();
          skipped = this._maySample(s);
          if (skipped === null) audio.resume().then(() => babble(`${s.species.voice.sound} hello there`, s.species.voice));
        }
      } catch (err) {
        // no WebAudio
      }
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      if (skipped) this._statusMessage(s, skipped);
    });
  }

  // A tap on a two-tap control (confirmTap): true when it confirms. Otherwise
  // the button says "sure? tap again" until the window closes, then redraw().
  _confirmed(s, key, button, redraw) {
    const was = s.confirm?.key;
    if (confirmTap(s, key)) return true;
    if (was && was !== key) s.confirmRedraw?.(); // the other one disarmed
    s.confirmRedraw = redraw;
    button.textContent = "sure? tap again"; // in place: a redraw would drop focus
    button.setAttribute("aria-label", CONFIRM_ARIA[key]);
    s.statusHtml = null; // the screen no longer matches it: the next redraw writes
    clearTimeout(s.confirmTimer);
    s.confirmTimer = setTimeout(redraw, s.confirm.at + CONFIRM_MS + 50 - Date.now());
    return false;
  }

  // "My day" is per person too: steps, stairs and sleep from their own phones.
  async _setMyDay(s, enabled, button) {
    const id = s.ids?.["sensor.life_stage"];
    if (!id) return;
    button.classList.add("pending");
    button.setAttribute("aria-pressed", String(enabled));
    button.textContent = enabled ? "on" : "off";
    this._setMine("my_day", enabled); // at once, so a redraw before the push keeps it
    try {
      await this._callOwn("my_day", { entity_id: id, enabled });
      this._myDay = enabled; // one switch per person, for every pet
      this._statusMessage(s, enabled ? "I'll notice your good days! ♥" : "OK, I won't peek.");
    } catch (err) {
      this._setMine("my_day", !enabled);
      button.setAttribute("aria-pressed", String(!enabled));
      button.textContent = !enabled ? "on" : "off";
      this._statusMessage(s, "That didn't work. Try again.");
    } finally {
      button.classList.remove("pending");
    }
  }

  // Baby talk is the person's, for every pet and device: kept on the server
  // (a websocket command, off the event bus), cached here by user ID.
  async _setBabyTalk(s, enabled, button) {
    const id = s.ids?.["sensor.life_stage"];
    const user = this._hass.user?.id;
    if (!id || !user) return;
    button.classList.add("pending");
    button.setAttribute("aria-pressed", String(enabled));
    button.textContent = enabled ? "on" : "off";
    setBabyTalk(user, enabled); // at once, so a re-render mid-call draws the new state
    this._setMine("baby_talk", enabled);
    try {
      await this._hass.callWS({ type: "virtual_pet/baby_talk", entity_id: id, enabled });
      if (enabled) {
        // The status screen hides the bubble, so the note always shows; a baby
        // or child on screen says hello as well, for when the screen closes.
        this._statusMessage(s, "OK, baby talk for babies and children ♥");
        if (this._babyStage(s)) {
          const name = short(this._hass.user?.name?.trim().split(/\s+/)[0], 16);
          const baby = this._babySet(s, "greet"); // a child's hello is the normal one
          this._speak(s, name ? (baby ? pick(baby)(name) : this._hourHello(name)) : "hi hi!", 4000);
        }
      }
    } catch (err) {
      setBabyTalk(user, !enabled);
      this._setMine("baby_talk", !enabled);
      button.setAttribute("aria-pressed", String(!enabled));
      button.textContent = !enabled ? "on" : "off";
      this._statusMessage(s, "That didn't work. Try again.");
    } finally {
      button.classList.remove("pending");
    }
  }

  // The viewer's own switches: from the channel's "mine" once it has spoken,
  // else as the last visit reply had them (undefined: not known yet).
  _mineSwitch(s, key, fallback) {
    return s.mine ? !!s.mine[key] : fallback;
  }

  // A switch of the viewer's own (one per person, for every pet): every
  // slide's copy at once; the channel's push confirms it.
  _setMine(key, value) {
    for (const slide of this._slides || []) if (slide.mine) slide.mine[key] = value;
  }

  // "notify me" and "my day" as websocket commands (off the event bus). A
  // server older than this card has only the services: those, then.
  async _callOwn(command, data) {
    try {
      return await this._hass.callWS({ type: `virtual_pet/${command}`, ...data });
    } catch (err) {
      if (err?.code !== "unknown_command") throw err;
      return this._hass.callService("virtual_pet", command, data);
    }
  }

  // Phone notifications are per user: this only changes them for whoever is signed in.
  async _setNotify(s, enabled) {
    const id = s.ids?.["sensor.life_stage"];
    if (!id) return;
    const button = s.status.querySelector(".bell.notify");
    if (button) {
      button.classList.add("pending");
      button.setAttribute("aria-pressed", String(enabled));
      button.textContent = enabled ? "on" : "off";
    }
    // At once, so a redraw before the push keeps it (this pet's, not every pet's).
    if (s.mine) s.mine.notify_me = enabled;
    try {
      await this._callOwn("notify_me", { entity_id: id, enabled });
      this._statusMessage(s, enabled ? "I'll ping your phone!" : "Phone pings off.");
    } catch (err) {
      if (s.mine) s.mine.notify_me = !enabled;
      if (button) {
        button.setAttribute("aria-pressed", String(!enabled));
        button.textContent = !enabled ? "on" : "off";
      }
      this._statusMessage(s, "That didn't work. Try again.");
    } finally {
      button?.classList.remove("pending");
    }
  }

  _statusMessage(s, message) {
    const note = s.status.querySelector(".status-feedback");
    if (!note) return;
    note.textContent = message;
    note.hidden = false;
    clearTimeout(s.statusMessageTimer);
    s.statusMessageTimer = setTimeout(() => {
      note.hidden = true;
      note.textContent = "";
    }, 3500);
  }

  // Fill the status screen; false if it already shows this (kept as is, so
  // its scroll position and focus survive the update).
  _setStatus(s, html) {
    if (s.statusHtml === html) return false;
    // Keep focus on the same control (a toggle, the journal link) across the redraw.
    const active = this.shadowRoot?.activeElement;
    const keep = s.status.contains(active) && active.className
      ? `.${active.className.trim().split(/\s+/).join(".")}${active.dataset?.gen ? `[data-gen="${active.dataset.gen}"]` : ""}` : null;
    s.statusHtml = html;
    s.status.innerHTML = html;
    if (keep) s.status.querySelector(keep)?.focus({ preventScroll: true });
    return true;
  }

  _journalLink(s, open) {
    s.status.querySelector(".jlink").addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      s.journal = open;
      if (open) this._loadPhotos(s); // a best friend's photos, theirs only
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      s.status.scrollTop = 0; // a new view starts at its top
    });
  }

  // The world's creatures (unraised ones as silhouettes) and this device's past pets.
  async _renderJournal(s) {
    const loading = `
      <div class="jhead"><span>journal · ${escape(this._worldName(s))}</span><span>opening…</span></div>
      <div class="log">Gathering your pet's memories…</div>
      <button class="jlink">‹ status</button>`;
    if (this._setStatus(s, loading)) this._journalLink(s, false);
    const stage = this._state(s, "sensor.life_stage")?.attributes || {};
    const roster = stage.roster || [];
    const raised = new Set();
    for (const other of this._slides) {
      const st = this._state(other, "sensor.life_stage")?.attributes;
      if (st?.world === stage.world) (st.raised || []).forEach((r) => raised.add(r));
    }
    const now = {
      generation: stage.generation || 1, name: this._hass.devices?.[s.ids?.device]?.name_by_user
        || this._hass.devices?.[s.ids?.device]?.name || "", species: stage.species,
      traits: stage.traits || [], levels: stage.trait_levels || {}, inherited: stage.inherited_trait,
      games: stage.games || {},
      upbringing: this._state(s, "sensor.life_stage")?.state === "adult" ? stage.upbringing : null,
      // Settled only on becoming a teen: a younger one's (a downgrade, a hand
      // edit) isn't shown.
      personality: ["teen", "adult"].includes(this._state(s, "sensor.life_stage")?.state) ? stage.personality : null,
      current: true,
    };
    const past = [...(stage.journal || []), now].slice(-4);
    const ids = [...new Set([...roster, ...past.map((p) => p.species).filter(Boolean)])];
    const names = {};
    await Promise.all(ids.map((id) => loadJson(`sprites/${id}/species.json`)
      .then((d) => { names[id] = d.name; }).catch(() => { names[id] = id; })));
    if (!s.journal) return; // closed while the names loaded
    const tiles = roster.map((id) => {
      const known = raised.has(id);
      return `<div class="jtile${known ? "" : " locked"}">` +
        `<img src="${BASE}/sprites/${id}/child_content_1.png?v=${VERSION}" alt="">` +
        `<span>${known ? escape(names[id]).toLowerCase() : "???"}</span></div>`;
    });
    // The family line, oldest first: each generation and its traits.
    const lines = past.map((p) =>
      `<div class="gen${p.current ? " now" : ""}">gen ${p.generation}${p.current ? " (now)" : ""} · ` +
      `${escape(p.name)} · ${escape((names[p.species] || "egg").toLowerCase())}` +
      `${p.age_days != null ? ` · ${Math.round(p.age_days)} d` : ""}` +
      `${p.upbringing ? ` · ${escape(p.upbringing)}` : ""}` +
      `${p.personality ? ` · ${escape(String(p.personality).replaceAll("_", " "))}` : ""}` +
      `${gamesPlayed(p.games) ? ` · ${gamesPlayed(p.games)} games` : ""}` +
      `${p.traits?.length ? `<br><span class="gt">${p.traits.map((t) =>
        traitLabel(t, p.levels?.[t], t === p.inherited)).join(" ")}</span>` : ""}</div>`);
    const html = `
      <div class="jhead"><span>journal · ${escape(this._worldName(s))}</span>
        <span>gen ${stage.generation || 1}</span></div>
      <div class="jgrid">${tiles.join("")}</div>
      ${this._photoRow(s)}
      <div class="jlist">${lines.join("")}${past.length < 2 ? "<div class=\"gt\">a week into adulthood, a pet can lay an egg</div>" : ""}${this._memories(stage.memories)}</div>
      <button class="jlink">‹ status</button>
      <div class="status-feedback" role="status" aria-live="polite" hidden></div>`;
    if (!this._setStatus(s, html)) return;
    this._journalLink(s, false);
    s.status.querySelectorAll(".psave").forEach((button) => button.addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      this._savePhoto(s, Number(e.currentTarget.dataset.gen));
    }));
  }

  // --- A best friend's photo ---------------------------------------------------
  // Only the viewer's (virtual_pet/photos, never a sensor), never on a shared
  // screen; each drawn once and kept as a Blob behind a short blob: URL.

  // The journal's "photos" row: a print per generation, oldest first.
  _photoRow(s) {
    if (sharedScreen() || !s.photos?.size) return "";
    const prints = [...s.photos.values()].map(({ photo, url }) =>
      `<figure class="print"><img src="${url}" alt="${escape(this._photoAlt(photo))}">` +
      `<button class="bell psave" data-gen="${photo.generation}" ` +
      `aria-label="${escape(`save the photo of ${photo.name}, generation ${photo.generation}`)}">save</button></figure>`);
    return `<div class="photos"><span>photos</span><div class="prow">${prints.join("")}</div></div>`;
  }

  _photoAlt(photo) {
    return `photo of ${photo.name}, best friends, ${localDay(photo.on, this._hass?.locale?.language)}`;
  }

  // Fetch the viewer's photos when the journal opens, and draw the new ones.
  _loadPhotos(s) {
    // One load in flight per slide: a second open shares it.
    if (!s.photoLoad) s.photoLoad = this._fetchPhotos(s).finally(() => { s.photoLoad = null; });
    return s.photoLoad;
  }

  async _fetchPhotos(s) {
    const id = s.ids?.["sensor.life_stage"];
    if (!id || !this._hass.user || sharedScreen()) return;
    const epoch = s.photoEpoch || 0;
    let photos;
    try {
      photos = (await this._hass.callWS({ type: "virtual_pet/photos", entity_id: id }))?.photos || [];
    } catch (err) {
      return; // an older integration: no photos
    }
    const kept = s.photos || new Map();
    const next = new Map();
    const made = [];
    for (const photo of photos) {
      const sig = JSON.stringify(photo);
      const had = kept.get(photo.generation);
      if (had?.sig === sig) {
        next.set(photo.generation, had);
        continue;
      }
      // A tainted canvas (a Cast receiver) or a missing creature: no print.
      const print = await this._printPhoto(photo).catch(() => null);
      if (print) {
        made.push(print);
        next.set(photo.generation, { ...print, sig, photo });
      }
    }
    if ((s.photoEpoch || 0) !== epoch || s.ids?.["sensor.life_stage"] !== id || sharedScreen()) {
      made.forEach((p) => URL.revokeObjectURL(p.url)); // dropped meanwhile
      return;
    }
    for (const [gen, p] of kept) if (next.get(gen) !== p) URL.revokeObjectURL(p.url);
    s.photos = next;
    if (s.journal) this._renderJournal(s);
  }

  // A photo as a PNG: the Blob, its URL, and the File a share sheet takes
  // (made now, so "save" can share straight from the tap).
  async _printPhoto(photo) {
    const canvas = await this._renderPhoto(photo);
    const blob = await new Promise((resolve, reject) => {
      try {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no print"))), "image/png");
      } catch (err) {
        reject(err);
      }
    });
    const name = `${String(photo.name).replace(/[\\/:*?"<>|]+/g, "").trim() || "pet"}-best-friends.png`;
    const file = typeof File === "function" ? new File([blob], name, { type: "image/png" }) : null;
    return { blob, url: URL.createObjectURL(blob), file, name };
  }

  // Draw a photo: a cream print with a thicker bottom edge, the creature's day
  // backdrop cropped square, the pet as it was (its drawn stage, scale and
  // perch, as on the shelf), one flair per place, its name and the day.
  // sprite: false leaves the pet out (card-check compares the two).
  async _renderPhoto(photo, { sprite = true } = {}) {
    const sp = await loadJson(`sprites/${photo.species}/species.json`);
    const { w, h, px, pic, edge } = PHOTO;
    const stage = sp.stages?.includes(photo.stage) ? photo.stage
      : sp.stage_fallback?.[photo.stage] || sp.stages?.[sp.stages.length - 1];
    const traits = (photo.traits || []).filter((t) => FLAIR[t]);
    const shown = ["head", "air", "ground"].map((place) => [place, traits.find((t) => FLAIR[t].place === place)])
      .filter(([, t]) => t);
    const flairSrc = (t) => `${BASE}/ui/flair_${FLAIR[t].art ? `${t}_1` : t}.png?v=${VERSION}`;
    const bg = sp.backgrounds?.day || Object.values(sp.backgrounds || {})[0];
    const [back, pet, perch, ...pieces] = await Promise.all([
      bg ? loadImage(spriteSrc(photo.species, bg)) : null,
      sprite ? loadImage(spriteSrc(photo.species, `${stage}_content_1`)) : null,
      sp.perch ? loadImage(spriteSrc(photo.species, sp.perch)) : null,
      ...shown.map(([, t]) => loadImage(flairSrc(t)).catch(() => null)),
    ]);
    try {
      await document.fonts?.load("22px Tiny5");
    } catch (err) {
      // no font loading: the fallback face draws the words
    }
    const canvas = document.createElement("canvas");
    canvas.width = w * px;
    canvas.height = h * px;
    const g = canvas.getContext("2d");
    g.scale(px, px);
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#f6efdc";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#3a2a1a";
    g.fillRect(edge - 2, edge - 2, pic + 4, pic + 4);
    g.save();
    g.beginPath();
    g.rect(edge, edge, pic, pic);
    g.clip();
    if (back) {
      const side = Math.min(back.naturalWidth, back.naturalHeight);
      g.drawImage(back, (back.naturalWidth - side) / 2, back.naturalHeight - side, side, side, edge, edge, pic, pic);
    } else {
      g.fillStyle = "#2b2f3a";
      g.fillRect(edge, edge, pic, pic);
    }
    // The shelf's pet box: 62% of the scene's height, its feet 4% up, centred;
    // species.json "scale" grows it about its feet. The scene is 384 px tall.
    const ks = pic / 384;
    const box = 0.62 * pic * (sp.scale?.[stage] || 1);
    const cx = edge + pic / 2;
    const left = cx - box / 2;
    const top = edge + pic * 0.96 - box;
    if (perch) g.drawImage(perch, left, top, box, box);
    if (pet) g.drawImage(pet, left, top, box, box);
    const k = box / 256;
    const [hx, hy] = sp.head?.[stage] || [128, 96];
    const head = { x: left + hx * k, y: top + hy * k };
    const fy = top + 224 * k;
    const half = box * 0.32;
    const away = head.x >= cx ? -1 : 1; // the air's flair on the other side from the head
    shown.forEach(([place, t], i) => {
      const img = pieces[i];
      if (!img) return;
      const fw = img.naturalWidth * ks;
      const fh = img.naturalHeight * ks;
      // Placed by its bottom middle, as the shelf's flair is.
      const at = place === "head" ? [head.x + (t === "thunder_heart" ? 6 : 0), head.y - 6 * ks]
        : place === "air" ? [cx + away * half * 1.4, head.y + 18 * ks]
          : [cx + (PHOTO_GROUND[t] ?? 1.35) * half, fy + (PHOTO_GROUND_DY[t] ?? 2) * ks];
      g.drawImage(img, at[0] - fw / 2, at[1] - fh, fw, fh);
    });
    g.restore();
    g.fillStyle = "#3a2a1a";
    g.textAlign = "center";
    g.font = "400 22px Tiny5, monospace";
    g.fillText(photo.name, w / 2, edge + pic + 36, pic);
    g.font = "400 14px Tiny5, monospace";
    g.fillText("best friends ♥", w / 2, edge + pic + 58, pic);
    g.font = "400 12px Tiny5, monospace";
    g.fillStyle = "#6a5a44";
    g.fillText(localDay(photo.on, this._hass?.locale?.language), w / 2, edge + pic + 78, pic);
    return canvas;
  }

  // "save": the share sheet where there is one (straight from the tap: WebKit
  // drops the gesture after an await), else the picture in a dialog.
  _savePhoto(s, gen) {
    const p = s.photos?.get(gen);
    if (!p || sharedScreen()) return;
    const files = p.file ? [p.file] : null;
    if (files && navigator.canShare?.({ files })) {
      navigator.share({ files, title: "best friends ♥" }).then(
        () => this._statusMessage(s, "shared"),
        (err) => { if (err?.name !== "AbortError") this._photoDialog(s, gen); }, // cancelled: done
      );
      return;
    }
    this._photoDialog(s, gen);
  }

  // The picture full size, above everything (a modal <dialog>: focus kept in
  // it, Escape closes), to press and hold; a download link outside the apps.
  _photoDialog(s, gen) {
    const p = s.photos?.get(gen);
    if (!p) return;
    let dialog = this.shadowRoot.querySelector(".photo-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "photo-dialog";
      dialog.innerHTML = `<img class="pbig" alt=""><p>press and hold the picture to save it</p>` +
        `<p class="pcomputer" hidden>you can save it from a computer</p><a class="pdownload"></a><button class="bell pclose">close</button>`;
      // It stops every tap: nothing behind it reacts. A tap outside it closes it.
      dialog.addEventListener("click", (e) => {
        e.stopPropagation();
        const box = dialog.getBoundingClientRect();
        const inside = e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
        if (e.target === dialog && !inside) dialog.close();
      });
      dialog.querySelector(".pclose").addEventListener("click", () => dialog.close());
      dialog.querySelector(".pdownload").addEventListener("click", () => {
        if (this._photoFor) this._statusMessage(this._photoFor.s, "saved");
      });
      dialog.addEventListener("close", () => {
        const was = this._photoFor;
        this._photoFor = null;
        // Back to its "save" (the journal may have been redrawn meanwhile).
        was?.s.status.querySelector(`.psave[data-gen="${was.gen}"]`)?.focus({ preventScroll: true });
      });
      this.shadowRoot.append(dialog);
    }
    const img = dialog.querySelector(".pbig");
    img.src = p.url;
    img.alt = this._photoAlt(p.photo);
    const link = dialog.querySelector(".pdownload");
    link.href = p.url;
    link.download = p.name;
    link.textContent = p.name;
    link.hidden = inCompanionApp(); // the apps don't download; press and hold there
    dialog.querySelector(".pcomputer").hidden = !inAndroidApp();
    this._photoFor = { s, gen };
    if (!dialog.open) {
      if (dialog.showModal) dialog.showModal();
      else dialog.setAttribute("open", "");
    }
  }

  // Forget a slide's photos (another pet on it, or a shared screen now).
  _dropPhotos(s) {
    s.photoEpoch = (s.photoEpoch || 0) + 1;
    s.photoLoad = null; // a load still running will find its epoch stale
    s.photos?.forEach((p) => URL.revokeObjectURL(p.url));
    s.photos = null;
    if (this._photoFor?.s === s) this.shadowRoot.querySelector(".photo-dialog")?.close();
  }

  // Seasonal firsts and other moments the family remembers, newest first.
  _memories(memories) {
    if (!memories?.length) return "";
    const items = [...memories].reverse().slice(0, 6).map((m) => {
      const when = new Date(m.at * 1000).toLocaleDateString(undefined,
        { month: "short", day: "numeric", year: "numeric" });
      return `${escape(MEMORY_LABELS[m.kind] || m.kind.replace("_", " "))}, ${escape(when)}`;
    });
    return `<div class="gen"><span class="gt">memories: ${items.join(" · ")}</span></div>`;
  }

  _worldName(s) {
    return s.world?.name || "";
  }

  // --- Actions ----------------------------------------------------------------

  // Instant feedback for every control: a visible press and ring, a short
  // haptic where the browser supports it, and a perk when the pet is involved.
  // The real reaction (a prop, or a refusal in the bubble) follows on response.
  _tapped(button, s) {
    if (!button || button.disabled) return;
    button.classList.add("tap-feedback", "tapped", "pressed");
    setTimeout(() => button.classList.remove("pressed"), 160);
    setTimeout(() => button.classList.remove("tapped"), 400);
    if (button.classList.contains("toy")) {
      const ring = document.createElement("span");
      ring.className = "burst";
      button.append(ring);
      setTimeout(() => ring.remove(), 500);
    }
    if (navigator.vibrate) {
      try { navigator.vibrate(12); } catch (err) { /* Unsupported or blocked by the browser. */ }
    }
    if (s?.pet) {
      s.pet.classList.remove("perk");
      void s.pet.offsetWidth; // restart the animation
      s.pet.classList.add("perk");
      setTimeout(() => s.pet.classList.remove("perk"), 320); // let "hop" run again
    }
  }

  async _call(button, s, domain, service, entityId) {
    this._tapped(button, s);
    this._inflight ??= new WeakSet();
    if (this._inflight.has(button)) return; // one call per button at a time
    this._inflight.add(button);
    button.classList.add("pending");
    try {
      await this._hass.callService(domain, service, { entity_id: entityId });
    } catch (err) {
      button.classList.add("failed");
      setTimeout(() => button.classList.remove("failed"), 400);
      this._write(s, "hmm, that didn't work", 3500);
    } finally {
      this._inflight.delete(button);
      button.classList.remove("pending");
    }
  }

  _press(s, action) {
    const id = s.ids?.[`button.${action}`];
    const button = action in s.buttons ? s.buttons[action] : s.request;
    if (id) this._call(button, s, "button", "press", id);
  }

  // --- Games ----------------------------------------------------------------
  // The server keeps the game and the score (virtual_pet.play_game); the card
  // only asks, and shows what happened.

  _startGame(s, button) {
    this._tapped(button, s);
    this._clearAsk(s); // a game takes the screen
    const energy = Number.parseFloat(this._state(s, "sensor.energy")?.state);
    const refusal = s.asleep ? REFUSALS.asleep : energy < 15 ? REFUSALS.too_tired : null;
    if (refusal) {
      this._write(s, refusal, 3500);
      return;
    }
    if (s.screen.classList.contains("show-status")) this._toggleStatus(s);
    s.screen.querySelector(".flair")?.remove();
    const games = this._games();
    if (games.length === 1) {
      this._pickGame(s, games[0].key);
      return;
    }
    s.game = { picking: true };
    // Built each time: the card's options decide which games are offered.
    s.gameBox.querySelector(".gpick").innerHTML = games.map((g) =>
      `<button data-game="${g.key}"><span class="gi" aria-hidden="true">${gameIcon(g.key)}</span>` +
      `${g.label}</button>`).join("");
    this._gameView(s, "pick");
    // A narrow card has room for one short line beside the close button.
    this._write(s, this._card.classList.contains("compact") ? "pick a game!" : "what shall we play?", 60000);
    let last = null;
    try {
      last = localStorage.getItem(LAST_GAME_KEY);
    } catch (err) {
      // no storage here (a private window): start from the first game
    }
    const pick = s.gameBox.querySelector(`.gpick [data-game="${last}"]`) ||
      s.gameBox.querySelector(".gpick button");
    pick.focus({ preventScroll: true });
  }

  // The games the play button offers: Catch only with experimental_catch.
  _games() {
    return this._config?.experimental_catch ? [...GAMES, CATCH_GAME] : GAMES;
  }

  // Show the picker ("pick") or a game's buttons (its key) in the game overlay.
  _gameView(s, view) {
    const box = s.gameBox;
    box.hidden = false;
    box.querySelector(".gpick").hidden = view !== "pick";
    s.gameNum.hidden = view !== "higher_lower";
    const [gl, gr] = [box.querySelector(".gl"), box.querySelector(".gr")];
    gl.hidden = gr.hidden = view === "pick";
    s.gameScore.hidden = view === "pick";
    const hl = view === "higher_lower";
    gl.innerHTML = hl ? '<span class="hl">lo</span>' : icon("prev", 22);
    gr.innerHTML = hl ? '<span class="hl">hi</span>' : icon("next", 22);
    const katch = view === "catch";
    gl.setAttribute("aria-label", hl ? "Guess lower" : katch ? "Catch it on the left" : "Guess left");
    gr.setAttribute("aria-label", hl ? "Guess higher" : katch ? "Catch it on the right" : "Guess right");
    box.querySelectorAll(".gl, .gr").forEach((b) => { b.setAttribute("aria-disabled", "false"); });
  }

  async _pickGame(s, kind) {
    if (!s.game) return;
    try {
      localStorage.setItem(LAST_GAME_KEY, kind);
    } catch (err) {
      // no storage: the picker just won't remember
    }
    const g = s.game = { kind, round: 0, wins: 0, busy: false };
    s.pet.classList.remove("go-left", "go-right");
    this._gameView(s, kind);
    s.gameScore.textContent = "round 1/5";
    if (kind === "catch") {
      this._write(s, "catch it! tap its side as it reaches me", 60000);
      s.gameBox.querySelector(".gl").focus({ preventScroll: true });
      this._gameLater(s, g, 900, () => this._catchRound(s));
      return;
    }
    // The server keeps the game: a start while one of this kind runs carries
    // on (same round, wins and number), so the card adopts what it replies.
    g.busy = true;
    s.gameBox.querySelectorAll(".gl, .gr").forEach((b) => { b.setAttribute("aria-disabled", "true"); });
    s.gameScore.textContent = "thinking…";
    const info = await this._playCall(s, { game: kind });
    if (!info) return;
    g.busy = false;
    g.round = info.round;
    g.wins = info.wins;
    s.gameBox.querySelectorAll(".gl, .gr").forEach((b) => { b.setAttribute("aria-disabled", "false"); });
    s.gameScore.textContent = `round ${info.round + 1}/${info.rounds} · ${info.wins} right`;
    if (kind === "left_right") {
      this._write(s, "left or right? guess where I'll go!");
    } else {
      // Higher or Lower shows its number before the next guess.
      this._showNumber(s, info.number);
      this._write(s, "will the next one be higher or lower?");
    }
    s.sayUntil = Date.now() + 60000;
    s.gameBox.querySelector(".gl").focus({ preventScroll: true });
  }

  // A delayed step of game `g`: dropped if the game ended or was replaced, and
  // cleared with the game (_endGame).
  _gameLater(s, g, ms, fn) {
    const timers = s.gameTimers ??= new Set();
    const id = setTimeout(() => {
      timers.delete(id);
      if (s.game === g) fn();
    }, ms);
    timers.add(id);
  }

  _showNumber(s, n) {
    s.gameNum.innerHTML = digit(n);
    s.gameNum.dataset.n = String(n);
  }

  // One play_game call; ends the game (with a line) on a failure or refusal.
  // A reply for a game that was stopped (or replaced) meanwhile is dropped.
  async _playCall(s, data) {
    const id = s.ids?.["sensor.mood"];
    if (!id) return null;
    const game = s.game;
    let info;
    try {
      const res = await this._hass.callService(
        "virtual_pet", "play_game", { entity_id: id, ...data }, undefined, false, true);
      info = res?.response;
    } catch (err) {
      if (s.game === game) this._endGame(s, "hmm, that didn't work");
      return null;
    }
    if (s.game !== game) return null; // stopped while waiting
    if (!info || info.result !== "ok") {
      // A known refusal is said once, by _react, from the care log; only an
      // unknown result gets a line here.
      this._endGame(s, REFUSALS[info?.result] ? null : "not now");
      return null;
    }
    return info;
  }

  async _guess(s, side) {
    if (!s.game || s.game.busy || !s.game.kind) return;
    this._tapped(s.gameBox.querySelector(side === "left" ? ".gl" : ".gr"), s);
    const kind = s.game.kind;
    if (kind === "catch") {
      this._catchTap(s, side);
      return;
    }
    const game = GAMES.find((g) => g.key === kind);
    const guess = game.guesses[side === "left" ? 0 : 1];
    const g = s.game;
    g.busy = true;
    s.gameBox.querySelectorAll(".gl, .gr").forEach((b) => { b.setAttribute("aria-disabled", "true"); });
    s.gameScore.textContent = "thinking…";
    const info = await this._playCall(s, { game: kind, guess });
    if (!info) return;
    if (info.round !== g.round + 1) {
      // Another viewer guessed on the same server game meanwhile.
      this._endGame(s, "oh! someone else is playing with me");
      return;
    }
    g.round = info.round;
    g.wins = info.wins;
    if (kind === "higher_lower") {
      this._showNumber(s, info.number);
      this._animate(s, s.gameNum, "flip", 300);
      this._animate(s, s.pet, "perk", 300);
      this._write(s, info.correct ? `yes! ${info.number}` : `nope, ${info.number}!`);
    } else {
      s.pet.classList.add(`go-${info.went}`);
      this._write(s, info.correct ? "yes! you found me" : `nope, I went ${info.went}!`);
    }
    s.gameScore.textContent = `round ${info.round}/${info.rounds} · ${info.wins} right`;
    this._gameLater(s, g, 900, () => {
      s.pet.classList.remove("go-left", "go-right");
      if (info.done) {
        if (info.won) this._chirp(s, "win");
        this._endGame(s, info.won ? `${info.wins}/${info.rounds}! you win ♪` :
          `${info.wins}/${info.rounds}... again sometime?`);
        return;
      }
      g.busy = false;
      s.gameBox.querySelectorAll(".gl, .gr").forEach((b) => { b.setAttribute("aria-disabled", "false"); });
      s.gameScore.textContent = `round ${info.round + 1}/${info.rounds} · ${info.wins} right`;
      this._write(s, kind === "higher_lower" ? "higher or lower?" : "again! left or right?");
    });
  }

  // --- Seasons --------------------------------------------------------------

  // The season's pieces in the scene (behind the pet): a lantern by its side,
  // cobwebs in the corners, a sweet, falling leaves. Drawn again only when
  // something changes.
  _renderSeason(s) {
    const season = seasonNow(this._config);
    const part = season && seasonPart(season, s.worldKey);
    const sig = season ? `${season.key}|${s.worldKey}|${new Date().toDateString()}` : "";
    if (s.seasonSig === sig) return;
    s.seasonSig = sig;
    s.seasonBox.innerHTML = "";
    for (const c of [...s.screen.classList]) if (c.startsWith("s-")) s.screen.classList.remove(c);
    s.screen.classList.toggle("in-season", !!season);
    if (!season) return;
    s.screen.classList.add(`s-${season.key}`);
    if (season.mist) {
      const mist = document.createElement("div");
      mist.className = "mist";
      s.seasonBox.append(mist);
    }
    if (season.bunting) {
      const bunting = document.createElement("div");
      bunting.className = "bunting";
      bunting.style.backgroundImage = `url(${BASE}/ui/season_${season.key}_bunting.png?v=${VERSION})`;
      s.seasonBox.append(bunting);
    }
    const src = (n) => `${BASE}/ui/season_${season.key}_${n}.png?v=${VERSION}`;
    const add = (name, cls) => {
      const img = document.createElement("img");
      img.className = cls;
      img.alt = "";
      img.src = src(name);
      s.seasonBox.append(img);
    };
    if (part.lantern && season.lanterns) {
      add(dailyPick(season.lanterns, season.key), `lantern lantern-${part.lantern}`);
    }
    if (season.corner) for (const side of part.corners || []) add(season.corner, `corner ${season.corner} ${side}`);
    if (part.sweets && season.sweet) add(season.sweet, `sweet ${season.sweet}`);
    // Leaves drift down, each on its own path and pace.
    if (season.leaves) {
      for (let i = 0; i < 6; i++) {
        add(`leaf_${(i % 3) + 1}`, "leaf");
        const leaf = s.seasonBox.lastChild;
        leaf.style.left = `${8 + i * 15 + Math.random() * 6}%`;
        leaf.style.setProperty("--leaf-ms", `${8 + Math.random() * 5}s`);
        leaf.style.setProperty("--leaf-delay", `${-Math.random() * 12}s`);
      }
    }
  }

  // Now and then, a costume moment: the season's hat on the pet's head and a
  // seasonal line. On the treat day, the first visit gets "trick or treat!".
  // Bats (geese) cross at night, and by day where the world says so.
  _seasonTick(s) {
    const season = seasonNow(this._config);
    if (!season || !s.species) return;
    const spot = this._hatSpot(s) || s.species.head?.[s.drawn];
    if (spot) this._headTopAll(s, spot[0], spot[1]); // measure ahead
    const now = Date.now();
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const part = seasonPart(season, s.worldKey);
    const dark = s.screen.classList.contains("night") || s.screen.classList.contains("dim");
    if (season.flyer) {
      if (!s.nextFlyer) s.nextFlyer = now + 6000 + Math.random() * 10000;
      if (now >= s.nextFlyer) {
        const [lo, hi] = SEASON_FLYER_MS;
        s.nextFlyer = now + lo + Math.random() * (hi - lo);
        if (!calm && (dark || part.dayFlyers)) this._seasonFlyer(s, season);
      }
    }
    if (season.nightFlyer && part.nightFlyer) {
      if (!s.nextNightFlyer) s.nextNightFlyer = now + 20000 + Math.random() * 40000;
      if (now >= s.nextNightFlyer) {
        const [lo, hi] = SEASON_NIGHT_FLYER_MS;
        s.nextNightFlyer = now + lo + Math.random() * (hi - lo);
        const { art, cls, ms } = season.nightFlyer;
        if (!calm && dark) this._seasonFly(s, season, art, cls, ms, { ltr: true });
      }
    }
    if (!this._free(s) || s.pet.classList.contains("hop")) return;
    const today = new Date();
    // The countdown, on the first look of the day.
    const treatOn = season.treat && seasonDate(season.treat, today.getFullYear());
    if (season.countdown && treatOn && !s.counted) {
      s.counted = true;
      const treat = new Date(today.getFullYear(), treatOn[0] - 1, treatOn[1]);
      const days = Math.round((treat - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
      if (days > 0 && days <= 7 && oncePerDay(`count-${season.key}-${s.ids?.device}`)) {
        this._speak(s, days === 1 ? `${season.countdown} is tomorrow!!` : `${days} sleeps till ${season.countdown}!`, 4500);
        this._animate(s, s.pet, "perk", 320);
        return;
      }
    }
    if (season.visitor && !calm) {
      if (!s.nextVisitor) s.nextVisitor = now + 60000 + Math.random() * 60000;
      if (now >= s.nextVisitor) {
        const [lo, hi] = SEASON_VISITOR_MS;
        s.nextVisitor = now + lo + Math.random() * (hi - lo);
        this._seasonVisitor(s, season);
        return;
      }
    }
    if (this._hatSpot(s) === null) return; // a pose no hat can sit on: wait for the next
    const treatDay = treatOn && today.getMonth() + 1 === treatOn[0] && today.getDate() === treatOn[1];
    if (treatDay && !s.treated) {
      s.treated = true;
      const key = `hatch-treat-${season.key}-${s.ids?.device}-${today.toDateString()}`;
      let fresh = true;
      try {
        fresh = !localStorage.getItem(key);
        localStorage.setItem(key, "1");
      } catch (err) {
        // no storage: once per page load
      }
      if (fresh) {
        this._costume(s, season, season.treatLine || pick(season.lines));
        setTimeout(() => this._seasonTreat(s, season), 1600);
        return;
      }
    }
    if (this._state(s, "sensor.life_stage")?.attributes.birthday) return; // the party's day
    if (!s.nextCostume) s.nextCostume = now + 8000 + Math.random() * 12000;
    if (now < s.nextCostume) return;
    const [lo, hi] = SEASON_COSTUME_MS;
    s.nextCostume = now + lo + Math.random() * (hi - lo);
    const fresh = season.costumes && oncePerDay(`costume-${season.key}-${s.ids?.device}`);
    const line = fresh ? { text: "new costume today! do you like it?", baby: false }
      : this._lines(s, `season.${season.key}`, pick(season.lines));
    this._costume(s, season, line.text, !line.baby);
    if (fresh && season.chirp) this._chirp(s, season.chirp);
  }

  // Its yearly birthday (the server's date): confetti and the party hat at
  // the first look of the day on this device (a tablet left on overnight too:
  // the day turning starts it), then the hat now and then. On a holiday's own
  // day that holiday's costume wins: confetti, no party hat.
  _partyTick(s) {
    if (!this._state(s, "sensor.life_stage")?.attributes.birthday) return;
    if (!this._free(s) || s.pet.classList.contains("hop")) return;
    if (this._hatSpot(s) === null) return; // a pose no hat can sit on: wait for the next
    const season = seasonNow(this._config);
    const today = new Date();
    const treatOn = season?.treat && seasonDate(season.treat, today.getFullYear());
    const treatDay = treatOn && today.getMonth() + 1 === treatOn[0] && today.getDate() === treatOn[1];
    const now = Date.now();
    if (this._partyFirst(s)) {
      this._confetti(s);
      if (!treatDay) this._costume(s, PARTY, "party hat on! ♪"); // the visit says "it's my birthday!!"
      s.nextParty = now + SEASON_COSTUME_MS[0];
      return;
    }
    if (treatDay) return;
    if (!s.nextParty) s.nextParty = now + SEASON_COSTUME_MS[0];
    if (now < s.nextParty) return;
    const [lo, hi] = SEASON_COSTUME_MS;
    s.nextParty = now + lo + Math.random() * (hi - lo);
    this._costume(s, PARTY, pick(PARTY.lines));
  }

  // The first party moment of this birthday on this device (keyed by the
  // birthday itself, not the browser's date, which may be another time zone's).
  _partyFirst(s) {
    const stage = this._state(s, "sensor.life_stage")?.attributes || {};
    const key = `hatch-party-${s.ids?.device}-${stage.hatched_on}-${stage.birthday?.years}`;
    try {
      if (localStorage.getItem(key)) return false;
      localStorage.setItem(key, "1");
    } catch (err) {
      if (this._parties?.has(key)) return false;
      (this._parties ??= new Set()).add(key);
    }
    return true;
  }

  _confetti(s) {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const box = document.createElement("div");
    box.className = "confetti";
    box.setAttribute("aria-hidden", "true");
    const colors = ["#f06e96", "#ffd64d", "#5ca8dc", "#8fd17a", "#fffdf5"];
    for (let i = 0; i < 18; i++) {
      const bit = document.createElement("i");
      bit.style.setProperty("--x", `${Math.random() * 100}%`);
      bit.style.setProperty("--d", `${Math.random() * 0.9}s`);
      bit.style.setProperty("--c", colors[i % colors.length]);
      box.append(bit);
    }
    s.screen.append(box);
    setTimeout(() => box.remove(), 3600);
  }

  // Where a hat sits: the top of the head in the frame on show, found by going
  // down the head point's column to the first solid pixel. (The head point is
  // for flair floating above the head, so a hat there would hover.) Cached per
  // frame; null if the frame can't be read.
  _headTop(img, hx, hy) {
    const key = `${img.currentSrc || img.src}|${hx}`;
    if (HEAD_TOPS.has(key)) return HEAD_TOPS.get(key);
    if (!img.complete || !img.naturalWidth) return null;
    let top = null;
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0, 256, 256);
      const from = Math.max(0, Math.round(hy) - 40);
      const x0 = Math.min(251, Math.max(0, Math.round(hx) - 2));
      const data = g.getImageData(x0, from, 5, 256 - from).data;
      for (let y = 0; y < 256 - from && top === null; y++) {
        for (let x = 0; x < 5; x++) {
          if (data[(y * 5 + x) * 4 + 3] > 128) { top = from + y; break; }
        }
      }
    } catch (err) {
      top = null; // no canvas: the head point will do
    }
    HEAD_TOPS.set(key, top);
    return top;
  }

  // The lowest head top across the frames on show (a pet's two idle frames can
  // carry the head a few pixels apart), so a hat never hovers on either: it
  // sits a little deeper on the other. Frames not loaded yet are measured on a
  // later call (_seasonTick calls this every tick to have them ready).
  _headTopAll(s, hx, hy) {
    let low = this._headTop(s.pet, hx, hy);
    for (const sprite of this._frames(s)) {
      const path = sprite.includes("/") ? sprite : `${s.speciesId}/${sprite}`;
      const src = new URL(`${BASE}/sprites/${path}.png?v=${VERSION}`, location.href).href;
      let img = FRAME_IMGS.get(src);
      if (!img) {
        img = new Image();
        img.src = src;
        FRAME_IMGS.set(src, img);
      }
      const top = this._headTop(img, hx, hy);
      if (top !== null && (low === null || top > low)) low = top;
    }
    return low;
  }

  // species.json "hat" for the pose on show ("adult_dirty"), else for the stage:
  // a pose that sits the creature up carries its head well above the stage's point
  // (the opossum frets sitting up). null: no hat fits the pose (its frames bounce
  // between a leap and a crouch), so the costume waits for another pose.
  _hatSpot(s) {
    const pose = (this._frames(s)[0] || "").replace(/_\d+$/, "");
    const hat = s.species.hat || {};
    return pose in hat ? hat[pose] : hat[s.drawn];
  }

  // The hat sits on top of the head, brim sunk in a little.
  _costume(s, season, line, catchy = true) {
    const head = s.species?.head?.[s.drawn];
    if (!head) return; // no head point (an egg): no hat
    s.screen.querySelector(".costume")?.remove();
    const at = this._flairAnchors(s);
    const r = s.pet.getBoundingClientRect();
    const sr = s.screen.getBoundingClientRect();
    // species.json "hat" where ears or antlers rise above the skull (the deer).
    const own = this._hatSpot(s);
    const k = r.height / 256;
    // With a hat point, the lower of it and the frames' top in its column (another
    // mood's frames can carry the head lower).
    const scanned = own ? this._headTopAll(s, own[0], own[1]) : this._headTopAll(s, head[0], head[1]);
    const top = own ? Math.max(own[1], scanned ?? own[1]) : scanned;
    // Today's costume for this pet (the hat, without a list).
    const suits = (season.costumes || []).filter((c) => !c.skip?.includes(s.speciesId));
    const costume = dailyPick(suits.length ? suits : [{ art: "hat", sink: 7, width: 64 }], s.ids?.device);
    const brim = top === null ? at.hy + 14 * at.ks : r.top - sr.top + (top + costume.sink) * k;
    const x = own ? r.left - sr.left + own[0] * k : at.hx;
    const box = document.createElement("div");
    box.className = "flair costume";
    box.style.setProperty("--fl-ms", `${FLAIR_MS + 1800}ms`);
    const hat = document.createElement("div");
    hat.className = "fx hat";
    hat.innerHTML = `<img src="${BASE}/ui/season_${season.key}_${costume.art}.png?v=${VERSION}" alt="">`;
    Object.assign(hat.style, { left: `${x}px`, top: `${brim}px`, width: `${costume.width * at.ks}px` });
    box.append(hat);
    s.screen.appendChild(box);
    s.flairUntil = Date.now() + FLAIR_MS + 1800;
    this._speak(s, line, 4000, { catch: catchy });
    this._animate(s, s.pet, "perk", 320);
    setTimeout(() => box.remove(), FLAIR_MS + 1800);
  }

  // Trick or treat: a sweet pops up at its feet. At Thanksgiving, the pet
  // thanks whoever cared for it most lately.
  _seasonTreat(s, season) {
    const at = this._flairAnchors(s);
    const box = s.screen.querySelector(".costume");
    if (!box) return;
    if (season.sweet) {
      const sweet = document.createElement("div");
      sweet.className = "fx pop";
      sweet.innerHTML = `<img src="${BASE}/ui/season_${season.key}_${season.sweet}.png?v=${VERSION}" alt="">`;
      Object.assign(sweet.style, { left: `${at.cx + at.half * 1.1}px`, top: `${at.fy}px`, width: `${48 * at.ks}px` });
      box.append(sweet);
    }
    this._sparkle(s);
    this._speak(s, season.thanks ? this._thanks(s) : "a treat! thank you!! ♪", 3500);
  }

  // Thanks to everyone: never ranking who did the most.
  _thanks() {
    return "thank you all for taking care of me ♥";
  }

  // The season's flyer: one, or a flock in a V, from one side.
  _seasonFlyer(s, season) {
    const { art, cls, ms, flock = 1 } = season.flyer;
    const ltr = Math.random() < 0.5;
    const top = 8 + Math.random() * 22;
    for (let i = 0; i < flock; i++) {
      const lag = Math.abs(i - (flock - 1) / 2); // the leader in the middle, ahead
      setTimeout(() => this._seasonFly(s, season, art, cls, ms, { ltr, top: top + lag * 6 }), lag * 450);
    }
  }

  // Something crosses the scene (a bat, the witch, the ghost): one image or
  // two flapping frames, from a random side unless told which.
  _seasonFly(s, season, art, cls, ms, { ltr = Math.random() < 0.5, top = null, walk = false } = {}) {
    const el = document.createElement("div");
    el.className = `sfly ${cls} ${ltr ? "ltr" : "rtl"}${walk ? " walk" : ""}`;
    el.style.setProperty("--fly-ms", `${ms}ms`);
    if (top !== null) el.style.top = `${top}%`;
    const frames = Array.isArray(art) ? art : [art];
    el.innerHTML = frames.map((n) =>
      `<img src="${BASE}/ui/season_${season.key}_${n}.png?v=${VERSION}" alt="">`).join("");
    if (frames.length > 1) el.classList.add("flap");
    s.seasonBox.append(el);
    setTimeout(() => el.remove(), ms + 200);
    return el;
  }

  // A visitor comes by (a friendly ghost floats, a turkey walks); the pet
  // startles, then greets it.
  _seasonVisitor(s, season) {
    const { art, cls, ms, startle, jump, greet } = season.visitor;
    this._seasonFly(s, season, art, cls, ms, { walk: cls === "sturkey" });
    s.flairUntil = Date.now() + ms; // nothing else meanwhile
    setTimeout(() => {
      this._write(s, startle, 1800);
      this._animate(s, s.pet, jump, jump === "perk" ? 320 : 800);
      if (season.chirp) this._chirp(s, season.chirp);
    }, 1400);
    setTimeout(() => {
      this._speak(s, pick(greet), 3000);
      this._animate(s, s.pet, "perk", 320);
    }, 3400);
  }

  // --- Trait flair ----------------------------------------------------------

  _flairTick(s) {
    const now = Date.now();
    if (!s.nextFlair) s.nextFlair = now + 8000 + Math.random() * 12000;
    if (now < s.nextFlair) return;
    const [lo, hi] = FLAIR_EVERY_MS;
    s.nextFlair = now + lo + Math.random() * (hi - lo);
    if (this._free(s)) this._flair(s);
  }

  // One flair moment: each place shows one of the pet's traits there.
  // Returns the traits shown (card-check calls it directly).
  _flair(s, only = null) {
    const stage = this._state(s, "sensor.life_stage");
    const traits = (only ? [only] : stage?.attributes.traits || []).filter((t) => FLAIR[t]);
    if (!traits.length || !s.species || stage?.state === "egg") return [];
    const levels = stage.attributes.trait_levels || {};
    s.flairTurn = (s.flairTurn || 0) + 1;
    const shown = [];
    for (const place of ["head", "air", "ground"]) {
      const here = traits.filter((t) => FLAIR[t].place === place);
      if (here.length) shown.push(here[s.flairTurn % here.length]);
    }
    s.screen.querySelector(".flair")?.remove();
    const box = document.createElement("div");
    box.className = "flair";
    box.style.setProperty("--fl-ms", `${FLAIR_MS}ms`);
    const at = this._flairAnchors(s);
    for (const trait of shown) this._flairPieces(trait, levels[trait] || 1, at, box);
    s.screen.appendChild(box);
    s.flairUntil = Date.now() + FLAIR_MS;
    clearTimeout(s.flairTimer);
    s.flairTimer = setTimeout(() => box.remove(), FLAIR_MS);
    return shown;
  }

  // Where the pet is on screen: its head point (species.json "head", per drawn
  // stage), the feet line (y=224 of every 256 px frame), and the scene's scale.
  _flairAnchors(s) {
    const r = s.pet.getBoundingClientRect();
    const sr = s.screen.getBoundingClientRect();
    const k = r.height / 256;
    const [hx, hy] = s.species.head?.[s.drawn] || [128, 96];
    return {
      hx: r.left - sr.left + hx * k, hy: r.top - sr.top + hy * k,
      cx: r.left - sr.left + 128 * k, fy: r.top - sr.top + 224 * k,
      half: r.width * 0.32, ks: sr.width / 512, width: sr.width,
    };
  }

  _flairPieces(trait, level, at, box) {
    const { hx, hy, cx, fy, half, ks } = at;
    const url = (n) => `${BASE}/ui/flair_${n}.png?v=${VERSION}`;
    const art = FLAIR[trait].art;
    const img = (variant) => art === "frames"
      ? `<img src="${url(`${trait}_1`)}" alt=""><img src="${url(`${trait}_2`)}" alt="">`
      : `<img src="${url(art === "pair" ? `${trait}_${variant}` : trait)}" alt="">`;
    const put = (x, y, cls, vars = {}, variant = 1) => {
      const el = document.createElement("div");
      el.className = `fx ${art === "frames" ? "frames " : ""}${cls}`;
      el.innerHTML = img(variant);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
      const first = el.querySelector("img");
      // Drawn at the scene's scale, like the props.
      first.addEventListener("load", () => { el.style.width = `${first.naturalWidth * ks}px`; });
      if (first.complete && first.naturalWidth) el.style.width = `${first.naturalWidth * ks}px`;
      box.appendChild(el);
      return el;
    };
    const n = (base) => base + level - 1; // deeper traits show a little more
    const px = (v) => `${Math.round(v)}px`;
    switch (trait) {
      case "storm_watcher":
      case "thunder_heart":
      case "early_bird":
        put(hx + (trait === "thunder_heart" ? 6 : 0), hy - 6 * ks, "bob", { "--d": "1.4s" });
        break;
      case "moon_child":
        put(hx, hy - 6 * ks, "bob", { "--d": "1.6s" }, 1);
        for (let i = 0; i < n(2); i++) {
          put(hx + (i % 2 ? 1 : -1) * (24 + i * 8) * ks, hy - (4 + (i % 3) * 14) * ks, "twinkle",
            { "--d": "1.3s", "--delay": `${-i * 0.4}s` }, 2);
        }
        break;
      case "music_lover":
        for (let i = 0; i < n(3); i++) {
          put(hx + (i % 2 ? 1 : -1) * (14 + i * 6) * ks, hy + 6 * ks, "float",
            { "--d": "2.6s", "--delay": `${-i * 0.8}s`, "--dx": px((i % 2 ? 16 : -14) * ks), "--rise": px(70 * ks) },
            (i % 2) + 1);
        }
        break;
      case "social_butterfly": {
        for (let i = 0; i < n(1); i++) {
          // Round one side of the pet and down to its feet; never over its
          // head, which is the head place's (a storm cloud, a moon...).
          const side = i % 2 ? -1 : 1;
          const mid = (hy + fy) / 2;
          const path = `path("M ${cx + side * half * 2.4} ${hy + 4 * ks} ` +
            `C ${cx + side * half * 1.5} ${hy - 26 * ks}, ${cx + side * half * 2.6} ${mid - 30 * ks}, ` +
            `${cx + side * half * 1.9} ${mid} S ${cx + side * half * 1.5} ${fy - 34 * ks}, ` +
            `${cx + side * half * 1.3} ${fy - 12 * ks}")`;
          put(0, 0, "loop", { "--d": `${FLAIR_MS - 400}ms`, "--delay": `${i * 0.5}s` }).style.offsetPath = path;
        }
        break;
      }
      case "snow_child":
        for (let i = 0; i < n(4); i++) {
          put(cx + (-1.6 + (i * 3.2) / Math.max(1, n(4) - 1)) * half, hy - 30 * ks, "fall",
            { "--d": "2.8s", "--delay": `${-i * 0.7}s`, "--dx": px((i % 2 ? 10 : -8) * ks), "--rise": px((fy - hy) + 20 * ks) },
            (i % 2) + 1);
        }
        break;
      case "breeze_rider":
        for (let i = 0; i < n(2); i++) {
          put(cx - half * 2, hy + (i * 22 - 10) * ks, "drift",
            { "--d": "2.4s", "--delay": `${-i * 1.1}s`, "--dx": px(half * 4), "--rise": px(18 * ks) });
        }
        break;
      case "night_owl":
        for (let i = 0; i < n(3); i++) {
          const a = (i / n(3)) * Math.PI * 2;
          put(cx + Math.cos(a) * half * 1.4, (hy + fy) / 2 + Math.sin(a) * 30 * ks, "twinkle",
            { "--d": "1.8s", "--delay": `${-i * 0.6}s` });
        }
        break;
      case "sun_lover":
        for (let i = 0; i < n(3); i++) {
          put(cx + (i % 2 ? 1 : -1) * half * (0.9 + i * 0.25), hy + (i * 18) * ks, "twinkle",
            { "--d": "1.2s", "--delay": `${-i * 0.4}s` });
        }
        break;
      case "fireside": {
        const glow = document.createElement("div");
        glow.className = "fx glow";
        Object.assign(glow.style, { left: px(cx), top: px(fy - 2 * ks), width: px(half * 3.2), height: px(30 * ks) });
        box.appendChild(glow);
        for (let i = 0; i < n(4); i++) {
          const side = i % 2 ? 1 : -1;
          put(cx + side * (half + (6 + (i % 3) * 8) * ks), fy - (i % 3) * 6 * ks, "float",
            { "--d": "2.4s", "--delay": `${-i * 0.5}s`, "--dx": px(side * (6 + i * 2) * ks), "--rise": px(80 * ks) },
            (i % 2) + 1);
        }
        break;
      }
      case "fog_wanderer":
        put(cx - half * 0.6, fy + 4 * ks, "drift", { "--d": "4.2s", "--dx": px(half * 1.2) });
        break;
      case "helper":
        put(cx + half * 1.35, fy + 2 * ks, "pop", { "--d": ".5s" });
        break;
      case "player":
        put(cx - half * 1.35, fy, "bounce", { "--d": ".45s" });
        break;
      case "homebody":
        put(cx - half * 1.3, fy + 4 * ks, "pop", { "--d": ".5s" });
        break;
      case "couch_potato":
        put(cx + half * 1.35, fy + 2 * ks, "pop", { "--d": ".5s" });
        break;
      default:
        break;
    }
  }

  // --- Catch (prototype) -----------------------------------------------------
  // Timed in the browser (performance.now, requestAnimationFrame), so network
  // lag can't matter; the 700 ms tick and hass updates don't touch it.

  _catchRound(s) {
    const g = s.game;
    if (!g || g.kind !== "catch") return;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const f = g.round / (CATCH.rounds - 1);
    const lerp = ([a, b]) => a + (b - a) * f;
    const side = Math.random() < 0.5 ? "left" : "right";
    const decoy = g.round > 0 && Math.random() < CATCH.decoyChance;
    const prop = s.species?.props?.play || "";
    const motion = /cricket/.test(prop) ? "hop" : "roll";
    g.cur = {
      side, decoy, motion, done: false, start: performance.now(),
      calm, travel: lerp(CATCH.travel) * (calm ? 1.6 : 1),
      window: lerp(CATCH.window) * (calm ? 2 : 1),
    };
    const el = s.catchEl;
    if (decoy) el.src = BEE_FRAMES[0];
    else this._show(s, el, prop);
    el.hidden = false;
    el.style.display = "";
    s.gameScore.textContent = `round ${g.round + 1}/${CATCH.rounds} · ${g.wins} caught`;
    const step = (now) => {
      const c = s.game?.cur;
      if (!c || c !== g.cur || c.done) return;
      const p = Math.min(Math.max(now - c.start, 0) / 1000 / c.travel, 1);
      // From off the edge to just beside the pet (which stands at 50%).
      const from = c.side === "left" ? -16 : 100;
      const to = c.side === "left" ? 28 : 56;
      el.style.left = `${from + (to - from) * p}%`;
      if (c.calm) { // reduced motion: it only slides along (the bee still faces its way)
        el.style.transform = c.decoy && c.side === "left" ? "scaleX(-1)" : "";
      } else if (c.decoy) { // a bee flies: flapping, bobbing, facing where it goes
        // (rAF's first timestamp can come just before c.start)
        const flap = Math.floor(Math.max(now - c.start, 0) / BEE_FLAP_MS) % 2;
        if (c.flap !== flap) el.src = BEE_FRAMES[(c.flap = flap)];
        el.style.transform = `translateY(${Math.sin(p * Math.PI * 6) * 12}%)` +
          (c.side === "left" ? " scaleX(-1)" : "");
      } else el.style.transform = c.motion === "hop"
        ? `translateY(${-Math.abs(Math.sin(p * Math.PI * 4)) * 40}%)`
        : `rotate(${(c.side === "left" ? 1 : -1) * p * 540}deg)`;
      if (p >= 1) {
        // It reached the pet untouched: a real one got away, a decoy was dodged.
        this._catchResolve(s, c.decoy, c.decoy ? "phew, let the bee go!" : "it got away...");
        return;
      }
      c.raf = requestAnimationFrame(step);
    };
    g.cur.raf = requestAnimationFrame(step);
  }

  _catchTap(s, side) {
    const c = s.game?.cur;
    if (!c || c.done) return;
    const t = (performance.now() - c.start) / 1000;
    if (c.decoy) {
      this._catchResolve(s, false, "bzz! not the bee!");
    } else if (side !== c.side) {
      this._catchResolve(s, false, "other side!");
    } else if (t < c.travel - c.window) {
      this._catchResolve(s, false, "too soon!");
    } else {
      s.pet.classList.add(`go-${side}`);
      this._catchResolve(s, true, "got it!");
    }
  }

  _catchResolve(s, ok, line) {
    const g = s.game;
    const c = g?.cur;
    if (!c || c.done) return;
    c.done = true;
    cancelAnimationFrame(c.raf);
    s.catchEl.hidden = true;
    g.round += 1;
    g.wins += ok ? 1 : 0;
    this._write(s, line);
    if (ok) this._pounce(s);
    s.gameScore.textContent = `round ${g.round}/${CATCH.rounds} · ${g.wins} caught`;
    this._gameLater(s, g, 1000, () => {
      s.pet.classList.remove("go-left", "go-right");
      if (g.round < CATCH.rounds) {
        this._catchRound(s);
        return;
      }
      let best = g.wins;
      try {
        best = Math.max(best, Number(localStorage.getItem(BEST_CATCH_KEY) || 0));
        localStorage.setItem(BEST_CATCH_KEY, String(best));
      } catch (err) {
        // no storage: no best score
      }
      if (g.wins >= CATCH.winAt) this._chirp(s, "win");
      this._endGame(s, `${g.wins}/${CATCH.rounds} caught${g.wins >= CATCH.winAt ? "! ♪" : "..."} · best ${best}/${CATCH.rounds}`);
    });
  }

  // A catch: the species' own "won" pose where one is drawn (child), else a hop.
  _pounce(s) {
    const pose = s.species?.reactions?.won;
    const frames = s.drawn === "child" && s.species?.extras?.[pose];
    if (frames) {
      s.poseFrames = Array.isArray(frames) ? frames : [frames];
      s.poseUntil = Date.now() + 900;
      this._show(s, s.pet, s.poseFrames[0]);
    } else {
      this._animate(s, s.pet, "hop", 700);
    }
  }

  _endGame(s, line) {
    cancelAnimationFrame(s.game?.cur?.raf);
    s.catchEl.hidden = true;
    s.game = null;
    s.gameTimers?.forEach(clearTimeout);
    s.gameTimers?.clear();
    // Focus inside the game goes back to the play button, not the page's start.
    const focused = s.gameBox.contains(this.shadowRoot?.activeElement);
    s.gameBox.hidden = true;
    if (focused) s.buttons.play?.focus({ preventScroll: true });
    s.gameBox.querySelectorAll(".gl, .gr").forEach((b) => { b.setAttribute("aria-disabled", "false"); });
    s.pet.classList.remove("go-left", "go-right");
    if (line) this._write(s, line);
    s.sayUntil = line ? Date.now() + 4000 : 0;
  }

  _toggleLights(s) {
    const id = s.ids?.["switch.lights_out"];
    if (!id) return;
    // Turning the switch off wakes a pet that dozed off with the switch already off.
    const on = this._hass.states[id]?.state === "on" || s.asleep;
    this._call(s.buttons.lights, s, "switch", on ? "turn_off" : "turn_on", id);
  }
}

// The card editor: pick which pets the shelf shows (none picked shows all).
class HatchPetCardEditor extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  setConfig(config) {
    this._config = { ...(config || {}) };
    this._render();
  }

  // Older cards name one entity per pet; show those as their devices.
  _devicesOf(config) {
    if (config.devices) return config.devices;
    const ids = [].concat(config.entities || [], config.entity || []);
    const devices = ids.map((id) => this._hass?.entities?.[id]?.device_id).filter(Boolean);
    return [...new Set(devices)];
  }

  async _render() {
    if (!this._form) {
      // ha-form loads with the frontend's own card editors; make sure it's there.
      if (!customElements.get("ha-form")) {
        const helpers = await window.loadCardHelpers?.();
        const entities = await helpers?.createCardElement({ type: "entities", entities: [] });
        await entities?.constructor?.getConfigElement?.();
      }
      this._form = document.createElement("ha-form");
      this._form.computeLabel = () => "Pets on this shelf";
      this._form.computeHelper = () =>
        "Leave empty to show every pet. The shelf shows them in this order.";
      this._form.schema = [{
        name: "devices",
        selector: { device: { multiple: true, filter: { integration: "virtual_pet" } } },
      }];
      this._form.addEventListener("value-changed", (e) => this._changed(e.detail.value));
      this.append(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = { devices: this._devicesOf(this._config) };
  }

  _changed(value) {
    const config = { ...this._config };
    delete config.entities;
    delete config.entity;
    if (value.devices?.length) config.devices = value.devices;
    else delete config.devices;
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config }, bubbles: true, composed: true,
    }));
  }
}

// For scripts/card-check and scripts/costume-preview.
HatchPetCard.seasons = SEASONS;
HatchPetCard.seasonNow = seasonNow;

// The integration loads this file on every dashboard. If an old manual
// resource also loads it, keep the first definition instead of erroring.
// Wait for <home-assistant> first: once the service worker caches this file
// it can run before the frontend swaps in its own custom element registry,
// and a card defined in the old one is never found ("Configuration error").
customElements.whenDefined("home-assistant").then(() => {
  if (!window.customElements.get("hatch-pet-card")) {
    window.customElements.define("hatch-pet-card", HatchPetCard);
  }
  if (!window.customElements.get("hatch-pet-card-editor")) {
    window.customElements.define("hatch-pet-card-editor", HatchPetCardEditor);
  }
});

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "hatch-pet-card")) window.customCards.push({
  type: "hatch-pet-card",
  name: "Hatch at Home pet shelf",
  description: "Your virtual pets, each in its world's handheld device.",
  preview: true,
});

console.info(`%c HATCH-PET-CARD %c ${VERSION} `,
  "background:#c8642a;color:#fff", "background:#333;color:#fff");
