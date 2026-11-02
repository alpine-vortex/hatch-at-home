// Hatch at Home: the device shelf. One card holds every pet device: each is
// a handheld toy themed for its world, standing on that world's backdrop.
// Arrows, dots or a swipe move to the next device. All state lives in Home
// Assistant; the card only draws and presses the pets' buttons and switch.

const VERSION = "0.44.0";
const BASE = "/virtual_pet/frontend";
// The world's grid: cells across the pet's box (46.5% of the screen's width).
// The shell (--px), the LCD and the link beam are cut on it, and the props, UI
// and hats are drawn on it (4 frame px a cell). It is not the creatures' grid:
// they are on 64 or 128 (2 frame px a cell), whichever their frames are cut on.
const WORLD_GRID = 64;

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

// The settings gear: 12 art pixels, drawn at two screen pixels each.
const GEAR_ICON = (() => {
  const rows = [
    "....XXXX....",
    ".XX.XXXX.XX.",
    ".XXXXXXXXXX.",
    "..XXX..XXX..",
    "XXXX....XXXX",
    "XXX......XXX",
    "XXX......XXX",
    "XXXX....XXXX",
    "..XXX..XXX..",
    ".XXXXXXXXXX.",
    ".XX.XXXX.XX.",
    "....XXXX....",
  ];
  let d = "";
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === "X") d += `M${x} ${y}h1v1h-1z`; }));
  return `<svg viewBox="0 0 12 12" width="24" height="24" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
})();

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
  { key: "dig", label: "berry dig", guesses: ["keep", "dig"] },
];
// The server games (all of GAMES).
const SERVER_GAMES = new Set(GAMES.map((g) => g.key));
// Matches rates.GAME_IDLE_MINUTES: the server drops a server game left idle
// this long, and the card closes its own copy then, silently.
const GAME_IDLE_MS = 3 * 60 * 1000;
const LAST_GAME_KEY = "hatch-last-game";
// The game of the day (fresh-expand G-a): a type leans to one game (twice in a list
// of four, the others once); a pet with no type, to left or right.
const GAME_LEAN = { bouncy: "dig", plucky: "dig", old_soul: "higher_lower", fancy: "higher_lower" };
const gameDayList = (type) => {
  const lean = GAME_LEAN[type] || "left_right";
  return [lean, lean, ...GAMES.map((g) => g.key).filter((k) => k !== lean)];
};
const SHINY_ODDS = 1 / 25; // a berry's chance of being the shiny one (D-b, a card roll)
const LINK_NEWS_ODDS = 1 / 3; // a link's chance of the guest's news (E9 L-a)
const LINK_NEWS_MS = 1500; // after the guest's reply; the visit holds this much longer
const LONG_AWAY_MS = 48 * 3600 * 1000; // a first look this long after the last: a welcome (E8 A-a)
// An adult's tricks (E8 LS-a): one more each month from its 14th day, all three by month 3,
// in its idle moves. CSS moves only (no art): a spin, a double perk, a look around.
const TRICKS = ["spin", "perk2", "look"];
const ADULT_FROM_DAY = 14;
const trickMonth = (ageDays) => Math.max(0, Math.floor((Number(ageDays) - ADULT_FROM_DAY) / 30));
const tricksBy = (month) => TRICKS.slice(0, Math.min(month, TRICKS.length)); // month 1: spin; 2: + perk2; 3: all
const GAME_TYPE_ODDS = 0.5; // a game's end: the type's own line after the count, 4 s on (G-c)
const GAME_TYPE_MS = 4000;
const PICK_SHORT = "pick a game!"; // the picker's line where a longer one doesn't fit (UX fix 6, F6)
const GAME_READ_MS = 2500; // a game's result stays in the bubble this long after a tap (UX fix 6, F1)
const GAME_END_MS = 1800; // a game's last result is read this long before its end line
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
  click: [[1760, 0.04]], // the backlight
  tap: [[1319, 0.04], [1568, 0.06]], // a pat on the egg (UX fix 4, F2): soft
  link: [[1319, 0.06], [0, 0.03], [1760, 0.09]], // the infrared link
  boot: [[523, 0.08], [784, 0.08], [1047, 0.2]],
  buzz: [[330, 0.06], [262, 0.1]], // a bee, a wrong guess (UX fix 6, F14)
};
let audio = null; // one AudioContext for every card on the page

// Power-on: the first time this browser shows the card (and again after a card
// update that bumps BOOT_VERSION, only when a release should "power on"), the
// screens show a boot screen that waits for a tap. The tap unlocks the sound.
const BOOT_KEY = "hatch-booted";
const BOOT_VERSION = "1";
const BOOT_WAIT_MS = 5000; // nobody taps (a wall tablet): it finishes by itself, silently
const POWER_KEY = "hatch-power-"; // + the pet's device: the last power-on this browser reacted to
const POWER_FRESH_MS = 15 * 60000; // the gag plays only if the server booted this recently
const POWER_DEFER_MS = 12 * 3600000; // an asleep pet waits for it this long, counted from the boot
const POWER_LINES = {
  low: ["w-whoa... did someone pull my battery?", "low batt... ♪ ... oh! we're back"],
  back: ["all charged! hi! ♥", "power's back! ♪"],
};
const BOOT_FILL_MS = 600; // the logo fills in, then the screen cuts to the pet

// True once per page load, and only if this browser hasn't booted this version.
function claimBoot() {
  if (claimBoot.done) return false;
  claimBoot.done = true;
  try {
    if (localStorage.getItem(BOOT_KEY) === BOOT_VERSION) return false;
    localStorage.setItem(BOOT_KEY, BOOT_VERSION);
  } catch (err) {
    // no storage: it shows once per page load
  }
  return true;
}

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

// Reduced motion: the one place the OS setting is read (the CSS block below is the
// other). Read live, so a change applies at the next thing that looks.
function calm() {
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

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

// Screen effects (the LCD grid, ghosting): on unless turned off for this browser.
const LCD_KEY = "hatch-lcd";

function lcdOn() {
  try {
    return localStorage.getItem(LCD_KEY) !== "off";
  } catch (err) {
    return true;
  }
}

// Mono screen: the LCD in four green tones (the #hatch-mono4 filter); off unless
// turned on for this browser.
const MONO_KEY = "hatch-mono";
const MONO_EVENT = "hatch-mono-changed";

function monoOn() {
  try {
    return localStorage.getItem(MONO_KEY) === "4";
  } catch (err) {
    return false;
  }
}

// Big text: the status box's pages (status, journal, settings, picker) in larger
// words; off unless turned on for this browser (top10 4b). It rides on the mono
// screen's event and storage listeners (MONO_EVENT, _onMono): both are this
// screen's look.
const BIG_KEY = "hatch-big-text";

function bigOn() {
  try {
    return localStorage.getItem(BIG_KEY) === "on";
  } catch (err) {
    return false;
  }
}

// Holiday names: on unless turned off for this browser (only "off" is kept). Off,
// no line names a festival: the season's dated lines go, and so does any line
// FESTIVAL_NAMES matches (that pattern is the tag); the generic lines stay.
const NAMED_KEY = "hatch-named-holidays";
const FESTIVAL_NAMES = /Halloween|Thanksgiving|Christmas|Hanukkah|new year/i;

function namedHolidays() {
  try {
    return localStorage.getItem(NAMED_KEY) !== "off";
  } catch (err) {
    return true;
  }
}

// A list without the festival names when they're off.
const unnamed = (list, named = namedHolidays()) => (named ? list : list.filter((x) => !FESTIVAL_NAMES.test(x)));

// The four tones, darkest to lightest, and how many of 20 even luma steps each
// takes: breaks at .25, .5 and .65. Each tone keeps its own band, so the card's
// own LCD colours stay put; .65, not .75, was tuned in the bench (bench.js monoPass).
const MONO_TONES = [["#2f3a24", 5], ["#6f7f4f", 5], ["#9aaa72", 3], ["#c6d4a0", 7]];
const monoTable = (at) => MONO_TONES.flatMap(([hex, n]) =>
  Array(n).fill((parseInt(hex.slice(at, at + 2), 16) / 255).toFixed(3))).join(" ");
// Luma, then the tables: sRGB, so they give the tones as they are.
// The backlight lifts the luma by about one tone (.22 of 1) before the tables.
const monoFilter = (id, lift) => `<filter id="${id}" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values=".299 .587 .114 0 ${lift}  .299 .587 .114 0 ${lift}  .299 .587 .114 0 ${lift}  0 0 0 1 0"/>
    <feComponentTransfer>
      <feFuncR type="discrete" tableValues="${monoTable(1)}"/>
      <feFuncG type="discrete" tableValues="${monoTable(3)}"/>
      <feFuncB type="discrete" tableValues="${monoTable(5)}"/>
    </feComponentTransfer>
  </filter>`;
const MONO_FILTER = `<svg class="monodefs" width="0" height="0" aria-hidden="true" focusable="false">
  ${monoFilter("hatch-mono4", 0)}${monoFilter("hatch-mono4-lit", 0.22)}</svg>`;

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
// A shared screen's Berry dig is the household's, not the signed-in user's:
// put aside with ✕, it is carried on by the household (play_game shared).
function digShared(kind) {
  return kind === "dig" && sharedScreen() ? { shared: true } : {};
}

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
const STASHED_QUESTIONS = ["fav_weather", "fav_season", "catchphrase", "fav_visitor"];
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
const STAGE_DAYS = { teen: 5, adult: 14 }; // rates.py STAGE_STARTS (120 h, 336 h), from the egg
const LINK_AFTER_MS = [600000, 1500000]; // the infrared link: 10-25 min after the page loads (random)
// The day's first link waits for someone watching (gaps-seams 5a, owner Q7): 1-3 min into
// a look (the first tap or swipe on a shown card, after none for LINK_TOUCHED_MS), and
// only while the last one was under LINK_TOUCHED_MS ago. Never on a hidden tab or an
// untouched wall tablet. Later links keep LINK_AFTER_MS.
// An idle line about a neighbour on the shelf (gaps-seams 5b), 1 in 6 idle lines.
const NEIGHBOUR_ODDS = 1 / 6;
const NEIGHBOUR_LINES = [(n) => `wonder what ${n} is up to ♪`, (n) => `*waves toward ${n}*`, (n) => `I hope ${n} is having a nice day`];
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

// The dig's bee: Sol's bee (ui/catch_decoy_1, _2: wings up, down), facing left.
const BEE_FRAMES = [1, 2].map((n) => `${BASE}/ui/catch_decoy_${n}.png?v=${VERSION}`);

const REFUSALS = {
  full: "i'm full!",
  not_needed: "i'm fine, thanks!",
  asleep: "shh... sleeping",
  too_tired: "too tired to play",
  already_clean: "it's already clean!",
  not_sick: "i'm not sick!",
  unfair: "hey, i didn't do anything!",
  spoiled: "hehe, whining works",
  no_game: "let's start over",
  egg: "...",
  away: "i'm at the sitter's!",
  not_sleepy: "not sleepy yet ♪",
};

// Actions that borrow another action's prop sprite.
const PROP_FOR = { game: "play", chore_treat: "snack" };
// Sol's shared props, for every species that has no own ("../ui/" leaves sprites/).
const FALLBACK_PROPS = { scold: "../ui/prop_scold", praise: "../ui/prop_praise", fan: "../ui/prop_fan" };
// Care scenes (_sceneStart): how long each plays, in ms from the tap.
const SCENE_MS = { medicine: 2200, clean: 2300 };
// Their props, two frames each (art/props/cut_clean_props.py). A species may bring
// its own in species.json "props" under the same key.
const SCENE_PROPS = {
  broom: ["../ui/prop_broom_1", "../ui/prop_broom_2"],
  dust: ["../ui/prop_dust_1", "../ui/prop_dust_2"],
  net: ["../ui/prop_net_1", "../ui/prop_net_2"],
  bubbles: ["../ui/prop_bubbles_1", "../ui/prop_bubbles_2"],
};
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
const MEMORY_LABELS = {
  first_snow: "first snow", first_frost: "first frost", first_warm: "first warm day", first_fog: "first fog",
  season_spring: "first day of spring", season_summer: "first day of summer", // ha-signals H7
  season_autumn: "first day of autumn", season_winter: "first day of winter",
};
// Idle life: something small every so often when nothing else is going on.
const IDLE_MIN_MS = 20000;
const IDLE_SPREAD_MS = 25000;
const IDLE_MOODS = new Set(["content", "cozy", "bored", "excited", "sleepy", "hungry", "dirty"]);
const IDLE_LINES = new Set(["sleepy", "bored", "excited", "hungry", "dirty"]); // the rest say the default lines
// A viewer is greeted by name at most this often, per pet.
const GREET_EVERY_MS = 3 * 3600 * 1000;
const KNOWN_KEY = "hatch-known-pets"; // the devices this browser has seen on a shelf (F4)
const NEIGHBOUR_LINE = "ooh, a new egg next door! ♪"; // a second pet moved in (F4)
const GONE_LINE = "one moment... ♪"; // F1: the bubble while a pet's entities reload
const GONE_STATES = new Set(["unavailable", "unknown"]); // a pet whose entities are reloading
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
  "soft": { baby: ["*snuggle* hi hi ♥"] }, // E13's softer morning
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
  "visit": { baby: ["hi hi!", "oh! hi hi ♥", "yay yay!", "hehe!"] }, // a world visitor (any of them)
  "find": { baby: ["yay yay!", "hehe!"] }, // a find in the basket's reveal: visit's own, not its greetings
  "gift": { baby: ["for you! ♥"] }, // a gift at the first look (V7), any find
  // The infrared link (_linkStart): host greets the guest by name, the guest replies with the host's.
  "link_host": { baby: [(n) => `hi hi, ${n}! ♪`, (n) => `${n}! yay yay!`], child: [(n) => `hi, ${n}! hello ♪`] },
  "link_guest": { baby: [(n) => `hi hi, ${n}! ♪`], child: [(n) => `hi hi, ${n}! ♪`] },
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
  // The lights (SEASONS key "winter"), not the weather's winter (fav_season): no festival names.
  "season.winter": { baby: ["pretty! pretty!", "lights!", "cozy cozy~", "yum yum"] },
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
    idle: ["mmm... what's for lunch...", "*yawns*", "la... la... ♪"],
    idle_bored: ["a nap sounds nice...", "*stretches out*"],
    idle_excited: ["hehe! ok, nap now", "mm! that was fun ♪", "hehe, nice ♥"],
    mood_content: ["taking it easy", "comfy and calm"],
    mood_excited: ["hehe, that was nice", "mm, that was fun"],
    mood_cozy: ["mm, perfect nap spot", "warm and comfy... ♪"],
    mood_bored: ["a nap sounds nice...", "just lazing about"],
    today: ["a slow, cozy sort of day ♪", "mm, a comfy kind of day", "today was nice and lazy ♪"], // the evening's line about its day (fresh-moment 4)
    visit: ["oh, hi there... ♪", "mm, a visitor... nice"], // a world visitor's greet (gaps-seams 4b)
    link_host: [(n) => `oh hey, ${n}... ♪`, (n) => `${n}... come sit a while ♥`],
    link_guest: [(n) => `mm, hi, ${n}... ♪`],
    link_kindred: [(n) => `${n}, we do cosy well ♥`, "mm, a nap with you sounds nice ♪"],
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
    idle: ["♪ tidy tidy ♪", "*smooths its corner*", "hmm hmm ♪"],
    idle_bored: ["*tidies up a little*", "*hums softly*"],
    idle_excited: ["hehe, so happy!", "yay! ♥", "that was lovely ♥"],
    mood_content: ["all warm and happy", "nice and homey ♥"],
    mood_excited: ["that was lovely!", "hehe, that was fun ♥"],
    mood_cozy: ["all snug ♥", "warm and happy ♥"],
    mood_bored: ["wish someone would visit ♥", "waiting for a friend ♥"],
    today: ["today was a lovely day ♥", "such a warm, homey day ♥", "a nice, gentle day today ♥"], // the evening's line about its day (fresh-moment 4)
    visit: ["a visitor! welcome ♥", "hello, little friend ♥"], // a world visitor's greet (gaps-seams 4b)
    link_host: [(n) => `${n}! hi! so glad you came ♥`, (n) => `hello hello, ${n} ♥`],
    link_guest: [(n) => `hi, ${n}! ♥ hello ♥`],
    link_kindred: [(n) => `${n}, we think alike ♥`, "it's nice to meet a kind heart ♥"],
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
    idle: ["*hops in place*", "hup! hup!", "*jogs on the spot*"],
    idle_bored: ["*bounces around*", "*does a little spin*"],
    idle_excited: ["wheee! hup hup!", "woo! yes!", "*bounce bounce*"],
    mood_content: ["full of beans", "ready for anything"],
    mood_excited: ["that was great!", "woo! so much fun!"],
    mood_cozy: ["cozy... but ready to hop!", "warm paws, happy hops"],
    mood_bored: ["need to hop about!", "so... much... sitting"],
    today: ["today was a hoppy one!", "what a zippy day! hup!", "today went boing boing! ♪"], // the evening's line about its day (fresh-moment 4)
    visit: ["a visitor! hup hup, hi!", "hiya, friend! *bounce*"], // a world visitor's greet (gaps-seams 4b)
    link_host: [(n) => `${n}! hup hup, hi!`, (n) => `hiya, ${n}! *bounce*`],
    link_guest: [(n) => `hup! hi, ${n}!`],
    link_kindred: [(n) => `${n}! race you to the corner! hup`, "two of us, twice the hops!"],
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
    idle: ["♪ la la laaa ♪", "*hums a tune*", "*twirls*"],
    idle_bored: ["*practises a bow*", "*sings to itself*"],
    idle_excited: ["ta-da! ★", "what a show! ★", "♪ tra la la! ♪"],
    mood_content: ["humming a little tune", "ready for my close-up ★"],
    mood_excited: ["what a show!", "bravo! that was fun ★"],
    mood_cozy: ["cozy, like backstage ★", "a warm spotlight ♪"],
    mood_bored: ["no audience today...", "waiting for my cue ★"],
    today: ["today was a little show ★", "a day worth an encore ★", "today had its own sparkle ★"], // the evening's line about its day (fresh-moment 4)
    visit: ["a guest star! ★", "welcome to the show! ★"], // a world visitor's greet (gaps-seams 4b)
    link_host: [(n) => `${n}! my co-star ★`, (n) => `ah, ${n}! cue the music ★`],
    link_guest: [(n) => `hello, ${n}! ★ take a bow`],
    link_kindred: [(n) => `${n}! a duet, you and me ★`, "we shine best together ★"],
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
    idle: ["hm, hm.", "*settles in*", "in my day... hm."],
    idle_bored: ["*watches the clouds*", "*sits quietly*"],
    idle_excited: ["heh. not bad at all.", "heh. well, well.", "ha. that was fun."],
    mood_content: ["all's well", "a fine day"],
    mood_excited: ["heh. that was nice", "well, that was fun"],
    mood_cozy: ["a fine warm spot", "cozy. as it should be."],
    mood_bored: ["hm. quiet day.", "nothing doing. hm."],
    today: ["hm. a good, quiet day.", "a fine day, all told.", "hm. today was well spent."], // the evening's line about its day (fresh-moment 4)
    visit: ["well, hello there.", "ah. a visitor. welcome."], // a world visitor's greet (gaps-seams 4b)
    link_host: [(n) => `hello, ${n}. come in.`, (n) => `${n}. good to see you.`],
    link_guest: [(n) => `hm. hello, ${n}.`],
    link_kindred: [(n) => `hm. ${n}. we understand each other.`, "good company, you."],
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
    idle: ["*fluffs up*", "*admires its reflection*", "la la, lovely ♪"],
    idle_bored: ["*picks a pretty spot*", "*rearranges a ribbon*"],
    idle_excited: ["oh, how lovely!", "divine! ♥", "*twirls prettily*"],
    mood_content: ["looking my best", "all pretty and calm ♥"],
    mood_excited: ["oh, how lovely!", "that was divine ♥"],
    mood_cozy: ["cozy and fabulous ♥", "warm and lovely ♥"],
    mood_bored: ["how dull...", "nothing lovely to do"],
    today: ["a rather elegant day ♥", "today was simply divine ♥", "such a stylish day, darling ♥"], // the evening's line about its day (fresh-moment 4)
    visit: ["oh, a visitor! how lovely ♥", "welcome, welcome, dear ♥"], // a world visitor's greet (gaps-seams 4b)
    link_host: [(n) => `${n}, darling! how lovely ♥`, (n) => `oh, ${n}! welcome, welcome ♥`],
    link_guest: [(n) => `${n}, darling! ♥`],
    link_kindred: [(n) => `${n}, darling, we have such taste ♥`, "a fellow connoisseur ♥"],
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
    idle: ["*strikes a pose*", "*bows to no one*", "splendid, splendid ♪"],
    idle_bored: ["*hums something grand*", "*practises a grand bow*"],
    idle_excited: ["simply splendid!", "marvellous! ♥", "what an occasion!"],
    mood_content: ["life is splendid", "all quite marvellous"],
    mood_excited: ["simply splendid!", "what a marvellous time"],
    mood_cozy: ["splendidly cozy", "warm as a welcome"],
    mood_bored: ["a bit dull today, I must say", "awaiting company"],
    today: ["what a splendid day it was ♥", "a marvellous little day ♥", "today was quite grand ♥"], // the evening's line about its day (fresh-moment 4)
    visit: ["a visitor! what an honour", "do come in, friend ♥"], // a world visitor's greet (gaps-seams 4b)
    link_host: [(n) => `ah, ${n}! a delight ♥`, (n) => `${n}! what an honour ♥`],
    link_guest: [(n) => `${n}! how splendid ♥`],
    link_kindred: [(n) => `${n}! two of a kind, you and I ♥`, "such a grand pair we make ♥"],
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
    idle: ["*stands guard*", "*looks around, alert*", "all clear ♪"],
    idle_bored: ["*kicks a pebble*", "*paces a little*"],
    idle_excited: ["hah! nailed it!", "yes! heck yes!", "hah! go team!"],
    mood_content: ["all under control", "all clear here"],
    mood_excited: ["hah! that was great", "heck yes, that was fun"],
    mood_cozy: ["cozy post, all clear", "warm and on watch"],
    mood_bored: ["nothing to guard...", "waiting for orders!"],
    today: ["today was a good run! hah", "all handled today ♥", "today went great. heck yes!"], // the evening's line about its day (fresh-moment 4)
    visit: ["who goes there? oh, hi!", "visitor spotted! hi! ♥"], // a world visitor's greet (gaps-seams 4b)
    link_host: [(n) => `yo, ${n}! all clear here`, (n) => `${n}! reporting in ♥`],
    link_guest: [(n) => `hey, ${n}! ♥ hi hi`],
    link_kindred: [(n) => `${n}! good team, you and me ♥`, "we've got each other's backs ♥"],
  },
};
// --- fresh-expand copy (docs/plan-2026-11-01-fresh-expand.md; APPROVED 2026-11-01) ---
// Every table from here to the end marker is plain data and is named in
// scripts/copy-scan.js's COPY_TABLES, which card-check and node scan line by line.
// PERSONA_FRESH: each type's lines for the new keys, merged into PERSONA below.
// pat (P-a): a spoken pat while content or excited; praise (P-c): in place of "♥";
// game_win / game_lose (G-c): after a game's count line; reply_* (Q-a): how_day's answers;
// dream_<pick> (F2): the type's own story of a picked dream, with DREAM_STORIES' shared two;
// bigday_am / bigday_pm (F1): a big day's morning and evening; soft (E13): a softer morning.
const PERSONA_FRESH = {
  mellow: {
    pat: ["mm, right there ♪", "*melts a little* ahh ♥"],
    praise: ["mm, thanks... ♥", "aw, that's nice to hear ♪"],
    game_win: ["mm, nice game ♪"],
    game_lose: ["close one! that was cozy ♥"],
    reply_great: ["mm, a good day. nice ♥"],
    reply_ok: ["ok days can be cozy too ♪"],
    reply_tough: ["*leans on you* I'm here ♥"],
    dream_stars: ["I napped on a star all night ★"], dream_sea: ["I floated on the sea all night ♪"],
    dream_snacks: ["I dreamed I napped in a soft bun ♪"], dream_you: ["we napped in the sun in my dream ♥"],
    bigday_am: ["deep breath... you'll be ok ♥"], bigday_pm: ["phew, big day. sit with me ♥"],
    soft: ["let's go slow and easy today ♥", "mm, a soft day for you ♥"],
  },
  sweet: {
    pat: ["aw, you ♥", "that's so nice ♥ hehe"],
    praise: ["hehe, you're sweet ♥", "you make me so happy ♥"],
    game_win: ["you're so good at this ♥"],
    game_lose: ["that was fun anyway ♥"],
    reply_great: ["yay! I'm so glad ♥"],
    reply_ok: ["ok is nice too ♥"],
    reply_tough: ["*sits close* I'm here ♥"],
    dream_stars: ["I dreamed a star tucked me in ★"], dream_sea: ["I dreamed a seal gave me a hug ♥"],
    dream_snacks: ["I dreamed I shared cake with friends ♥"], dream_you: ["I dreamed we held paws all night ♥"],
    bigday_am: ["sending you a big hug for today ♥"], bigday_pm: ["a hug for after your big day ♥"],
    soft: ["I saved you a hug today ♥", "a softer day for you, I hope ♥"],
  },
  bouncy: {
    pat: ["hee! that tickles!", "pat pat! hup! ♪"],
    praise: ["yes! *happy hop*", "woo! I'm good! hup!"],
    game_win: ["woo! what a game! hup!"],
    game_lose: ["phew! rematch soon! hup"],
    reply_great: ["woo! great day! high five! hup"],
    reply_ok: ["ok! more hops tomorrow, then!"],
    reply_tough: ["*hops over softly* I'm here ♥"],
    dream_stars: ["I bounced right up to the stars!"], dream_sea: ["I surfed a giant wave! wheee!"],
    dream_snacks: ["I dreamed of a snack race! I won!"], dream_you: ["we raced in my dream! you won! ♥"],
    bigday_am: ["big day! hup hup, go go! ♥"], bigday_pm: ["big day over! rest those paws ♥"],
    soft: ["*gentle hop* morning, pal ♥", "let's have an easy day, pal ♥"],
  },
  starry: {
    pat: ["a pat for the star! ★", "my favourite kind of applause ★"],
    praise: ["a bow, thank you ★", "I'll take a bow for that ★"],
    game_win: ["a winning show! ★"],
    game_lose: ["bravo, both of us ★"],
    reply_great: ["a great day! bravo ★"],
    reply_ok: ["every show has quiet nights ★"],
    reply_tough: ["you're my star anyway ★"],
    dream_stars: ["I dreamed the stars gave me a bow ★"], dream_sea: ["the sea sang me a song in my dream ★"],
    dream_snacks: ["a cake threw me a party ★"], dream_you: ["you were my co-star last night ★"],
    bigday_am: ["today's your big show! ★"], bigday_pm: ["curtain's down. you showed up ★"],
    soft: ["today, you're the star ★", "here's to a brighter show today ★"],
  },
  old_soul: {
    pat: ["hm. that's rather nice.", "ah. just the thing."],
    praise: ["hm. kind of you.", "much obliged, friend."],
    game_win: ["a fine match, well played."],
    game_lose: ["hm. a good game, all told."],
    reply_great: ["hm. good to hear."],
    reply_ok: ["hm. ok days count too, friend."],
    reply_tough: ["hm. sit with me a while ♥"],
    dream_stars: ["I dreamed I counted the stars. hm."], dream_sea: ["I dreamed of a quiet, wide sea."],
    dream_snacks: ["I dreamed of soup. it was good."], dream_you: ["we had tea in my dream. nice ♥"],
    bigday_am: ["steady on today, friend."], bigday_pm: ["hm. a long day. rest now."],
    soft: ["hm. a kinder day ahead.", "take today slowly, friend."],
  },
  fancy: {
    pat: ["how very kind ♥", "mind the fluff! ♥ hehe"],
    praise: ["oh, you flatter me ♥", "I do try, darling ♥"],
    game_win: ["you play beautifully ♥"],
    game_lose: ["a lovely little game ♥"],
    reply_great: ["how marvellous, darling ♥"],
    reply_ok: ["ok is perfectly fine, darling ♥"],
    reply_tough: ["come here, darling ♥"],
    dream_stars: ["I dreamed I wore a star crown ★"], dream_sea: ["I dreamed of a pearl just my size ♥"],
    dream_snacks: ["I dreamed of a fancy tea party ♥"], dream_you: ["we went to a ball in my dream ♥"],
    bigday_am: ["go shine today, darling ♥"], bigday_pm: ["feet up, darling. what a day ♥"],
    soft: ["a gentle day, darling ♥", "only nice things today ♥"],
  },
  charming: {
    pat: ["oh, how delightful ♥", "a splendid pat, thank you"],
    praise: ["how lovely of you ♥", "what a splendid thing to say ♥"],
    game_win: ["a splendid victory ♥"],
    game_lose: ["a grand game, truly ♥"],
    reply_great: ["splendid news! ♥"],
    reply_ok: ["a fair day, then ♥"],
    reply_tough: ["tea and a cuddle, then ♥"],
    dream_stars: ["I danced with a comet last night ★"], dream_sea: ["I sailed a teacup across the sea ♪"],
    dream_snacks: ["I dreamed of a grand snack ball ♥"], dream_you: ["we waltzed all night in my dream ♥"],
    bigday_am: ["go on, have a splendid day ♥"], bigday_pm: ["here's to you, big day and all ♥"],
    soft: ["a lovely day to you ♥", "here's to a kinder day ♥"],
  },
  plucky: {
    pat: ["hah! good pat ♥", "heh, not bad at all ♥"],
    praise: ["I'll do it even better! ♪", "heck yes, I'm good! hah"],
    game_win: ["hah! great game! ♥"],
    game_lose: ["rematch tomorrow. you're on! hah"],
    reply_great: ["heck yes! good day ♥"],
    reply_ok: ["ok's a win in my book ♥"],
    reply_tough: ["I've got you. *hug* ♥"],
    dream_stars: ["I raced a shooting star. I won! ★"], dream_sea: ["I dreamed I steered a big ship! hah"],
    dream_snacks: ["I climbed a mountain of muffins! hah"], dream_you: ["we were a team in my dream! hah ♥"],
    bigday_am: ["go get 'em today! hah ♥"], bigday_pm: ["you faced your big day! rest up ♥"],
    soft: ["fresh day, fresh start ♥", "I'm on your side today ♥"],
  },
};
// P-b: now and then a spoken pat finds the sweet spot (any stage but a baby).
const PAT_SPOT = "that's the spot!! ♥";
// V-a (E3): a visitor seen here on VISIT_FRIEND_AFTER days is a friend; its greet is one
// of these half the time, in turns (turnPick). They name the visitor, never a person.
const VISIT_FRIENDS = {
  chickadee: ["my chickadee pal! dee-dee ♪", "chickadee! you came by ♪", "hi, little chickadee friend ♥"],
  stellersjay: ["my blue jay friend! hi!", "ooh, it's my jay pal ♪", "jay! looking so blue today ♥"],
  snail: ["the snail! my slow pal ♪", "hi, snail buddy, no rush ♥", "my snail friend! take it easy~"],
  pillbug: ["my pill bug pal! hi hi ♪", "oh, my roly-poly friend! ♥", "pill bug! good to see you ♪"],
  ladybird: ["my ladybird friend! ♪", "hi, spotty pal! ♥", "ladybird! my lucky friend ♪"],
  moth: ["my fuzzy moth friend ♪", "moth pal! hello, hello ♥", "hi, moth! my night buddy ♪"],
  robin: ["robin! my window pal ♪", "hi, robin friend! ♥", "my robin! looking cheery ♪"],
  mouse: ["shh... hi, mouse pal ♥", "my mouse friend! hi hi ♪", "mouse pal! a crumb's waiting ♪"],
  cricket: ["my cricket pal! cri-cri ♪", "cricket! my little singer ♥", "hi, cricket friend ♪"],
  gull: ["my gull pal! hello ♪", "gull friend! fresh from the sea ♪", "hi, gull! my sky buddy ♥"],
  shorecrab: ["hi hi, little crab pal ♪", "my sideways friend! ♥", "crab pal! snip snip ♪"],
  seastar: ["my sea star friend ✦", "hi, starry pal! ♥", "sea star! good to see you ♪"],
  dragonfly: ["my dragonfly pal! zoom ♪", "hi, shiny friend! ♥", "dragonfly! my zippy pal ♪"],
  strider: ["strider pal! hi hi ♪", "my water-walking friend ♥", "hi, strider buddy ♪"],
  heron: ["my tall heron friend ♥", "heron pal! happy fishing ♪", "hi, heron! my quiet pal ♪"],
  shootingstar: ["oh! my shooting star ✦", "my wishing star friend ✦", "my star friend! whoosh ✦"],
  nighthawk: ["my nighthawk pal ♪", "nighthawk! my night friend ♥", "hi, sky buddy! swoop ♪"],
  raccoon: ["the raccoon! my night buddy", "my masked friend! hi hi ♥", "raccoon pal! hello ♪"],
};
// S-a (E4): a morning's wake line, in turns; the last one only on a day with a dream
// (on another day its turn says the first).
const WAKE_LINES = ["*yaaawn*", "*yawn* ...morning already ♪", "*stretch* mm, cozy night ♪", "*yaaawn* ...hi, day ♪",
  "*blink blink* morning ♪", "*yawn* I had the best dream"];
// S-b: lights out after a visitor seen here today (by its name), else after today's sunset.
const NIGHT_VISITOR = [(v) => `night, little ${v} ♪`, (v) => `sweet dreams, ${v} ♪`];
const NIGHT_SUNSET = "night... what a nice sunset ♥";
// F-a: a meal by the device's clock (none from 22 to 05: "yum" only).
const MEAL_LINES = {
  breakfast: ["breakfast! ♪", "a good start to the day ♪", "morning munchies! yum", "breakfast time, yum ♥"],
  lunch: ["lunch! just what I needed", "a midday munch ♪", "lunch! yum yum ♪", "mm, a hearty lunch ♥"],
  supper: ["mm, a cozy supper ♥", "supper time! yum ♪", "a warm supper, mm ♥", "dinner! just right ♪"],
};
// F-b: now and then, on a day a visitor came by here.
const CRUMB_LINE = (v) => `saving a crumb for the ${v} ♪`;
// M-a: the day after a cure, at the first look. Never says "sick".
const CURED_LINES = ["feeling much better today ♪", "I feel all better today ♥"];
// G-a (E5): the game of the day, said once a day as the picker opens; a pet with no
// type yet says the generic one.
const GAME_PICK_LINES = {
  dig: "ooh, berry dig today ♪",
  left_right: "i'm extra sneaky today ♪",
  higher_lower: "i feel lucky today ♪",
  generic: "i picked a game for us ♪",
};
const LUCKY_LINE = "my lucky number! ★"; // G-b, over higher or lower's number
const DIG_WATCH = (v) => `the ${v} is watching ♪`; // D-a, a dig on a day it came by
const SHINY_LINE = "a shiny one! ✦"; // D-b, in place of "a berry!"
// W-a (E6): more ways to say a wish, in turns with its first line (WISHES[kind][0]).
const WISH_MORE = {
  play: ["a game today would be fun ♪", "I'm in a playing mood today ♪"],
  snack: ["a snack after lunch sounds nice ♥", "I've got room for an afternoon snack"],
  bath: ["I hope it's a bubble bath day ♪", "I'd love some bubbles today ♥"],
  praise: ["I'm hoping for a kind word today", "a little praise would be nice ♥"],
  tuck_in: ["a tuck-in tonight would be cozy ♥", "I'd love to be tucked in tonight"],
  sunset: ["a sunset together would be nice ♥", "I'd love to watch the sky tonight ♪"],
  music: ["some music today would be nice ♪", "I'm in the mood for a song ♪"],
  tv: ["a show together would be fun ♪", "I'd love some TV time today ♪"],
  chore: ["a chore treat would be lovely ♥", "I'm hoping for a chore treat ♪"],
  rain: ["I'd love to see some rain today ☂", "rain today would be fun to watch ☂"],
  say_hi: ["a hello this afternoon would be nice", "I'm hoping for an afternoon hello ♥"],
};
// A-a (E8): a first look after two days or more away; names nobody, says nothing of the gap.
const WELCOME_BACK = ["you're here! ♥ hop hop", "yay, a visit! ♥", "hello hello! ♥ come in"];
// B-a: a best friend's (bond 10) own screen, at most once a week. Never on a shared one.
const FAV_LINES = ["I made up a song for you ♪", "you're my favourite ♥", "I saved you the comfy spot ♥", "*hums your song* ♪"];
// LS-a: an adult's new trick, the first look of each month it learns one.
const TRICK_LINES = ["look what I can do! ♪", "ta-da! a new trick ♪", "I learned a new move! ♪"];
// L-a (E9): over an infrared link, now and then the guest's news of today's visitor
// (or its dream, in DREAMS' words), and the host's answer.
const LINK_VISITOR_NEWS = (v) => `a ${v} came to see me today ♪`;
const LINK_NEWS_REPLY = "ooh, nice! ♪";
// V-b (E10): now and then a planned visitor brings a friend of its world; in place of the greet.
const PAIR_LINES = ["oh! a pair of friends ♪", "two visitors at once! ♪", "a little parade! hi hi ♪"];
// V-c: on a day with no visit, now and then a guest from another world, by its home world.
const VISIT_GUEST = {
  woodland: "a guest from the woods! ♪",
  terrarium: "a guest from the terrarium! ♪",
  hearth: "a visitor from a cozy house! ♪",
  tidepool: "a guest from the seaside! ♪",
  pond: "a guest from the pond! ♪",
  nightsky: "a guest from the night sky ✦",
};
// F3: the pet's own promise, every screen: [said on day 0, the payoff on day 4], by topic.
const PROMISE_LINES = {
  hop: ["I'm practising my hop! ♪", "I can hop higher now ♪"],
  spin: ["I'm practising a spin ♪", "look, a whole spin now! ♪"],
  song: ["I'm learning a new song ♪", "I learned my song! ♪ la la"],
};
const PROMISE_MID = "hup! getting there ♪"; // days 1-3, now and then, with the move done small
// Se-a (E12): the year's first warm day and the season's first fog, live.
const SEASON_FIRST_LINES = { warm: "first warm day! ☀ ♪", fog: "ooh, the first fog ♪" };
// ha-signals H7: a season's first day (season_start {season}); its lines and today bit.
const SEASON_START_LINES = {
  spring: ["first day of spring! ♪", "spring's here! hop hop ♪"],
  summer: ["summer's here! ☀ ♪", "first day of summer! ☀"],
  autumn: ["autumn's here! crunchy leaves ♪", "first day of autumn ♪"],
  winter: ["winter's here! ❄", "first day of winter! ❄"],
};
const SEASON_START_BITS = {
  spring: "saw spring begin", summer: "saw summer begin", autumn: "saw autumn begin", winter: "saw winter begin",
};
// F2: a picked dream's story (the sensor says what was picked, never who): the shared two
// and the type's own, in turns. Everyone hears it at the first look but "you", which only
// the asker's note tells (everyone else hears DREAM_FRIENDS); the asker's note then says
// only the tail. A stars, sea or snacks story comes back once, 2-4 days later.
const DREAM_STORIES = {
  stars: ["I dreamed I hopped star to star ★", "a star waved at me in my dream ★"],
  sea: ["I dreamed a wave carried me home ♪", "a little fish showed me a shell ♪"],
  snacks: ["I dreamed a cookie said hello! ♪", "I found a pie tree in my dream ♪"],
  you: ["I dreamed we had a picnic ♥", "you were in my dream! we sang ♪"],
};
const DREAM_TAIL = ["you picked it! ♥", "your idea! thank you ♥"];
const DREAM_CALLBACK = {
  stars: "my star dream was the best ★",
  sea: "I keep thinking of my sea dream ♪",
  snacks: "that snack dream... yum ♪",
};
// F1 big day (B7a): the question, its replies, the optional typed answer ({it}: their
// words, cut to 20), and the due day's morning and evening lines, with the text or not.
// Warm either way: never "you did it". Asked Sundays and Mondays for the week ahead, with
// the day picked next (owner Q3 A, opp #2); that day's evening asks how it went (opp #1).
const BIG_DAY = {
  q: "anything big this week?",
  which: "which day? ♪",
  yes: ["ooh! i'll cheer for you ♥"],
  no: ["a cozy week, then ♪"],
  what: "what is it?",
  how: "how did the big day go?",
  howText: (it) => `how did ${it} go?`,
  kept: "ok! i'll remember ♥",
  amText: [(it) => `good luck with ${it}! ♥`, (it) => `it's ${it} day! go go ♥`, (it) => `cheering you on: ${it} ♥`],
  am: ["good luck today! ♥", "big day! i'm cheering for you ♥", "you've got this today ♥"],
  pmText: [(it) => `hugs after ${it} ♥`, (it) => `${it} is done. rest up ♥`, (it) => `hugs, however ${it} went`],
  pm: ["big day done. come rest ♥", "however it went, i'm here ♥", "i saved you a cozy spot ♥"],
};
// E13: the morning after a tough day, on the answerer's own screen, once. It names nothing.
const SOFT_MORNING = ["hope today's a softer one ♥", "i'm right here today ♥", "a gentle day to you ♥",
  "i saved you a cozy spot ♥"];
// F4: the favourite visitor (B7d): its question, the reply, and its greet on that
// person's own screen, 1 visit in 2 (over a friend's line, E3).
const FAVV_LINES = {
  q: "who's your favourite visitor?",
  reply: (v) => `the ${v}! good pick ♪`,
  // Its greet, two by the day (owner Q3 A, critique gap 5), and the first look's line when
  // it came by while they were out (opp #4): on their own screen only.
  greet: [(v) => `your favourite, the ${v}! ♥`, (v) => `look who it is! your ${v} ♥`],
  missed: (v) => `your ${v} came by today ♥`,
};
// F5 weekend (B7d): asked on Fridays; "yes" takes the big day's typed step. Monday's
// line, with their words ({it}) or not.
const WEEKEND = {
  q: "anything fun this weekend?",
  yes: ["ooh, fun! ♪"],
  no: ["a restful one, then ♥"],
  monText: [(it) => `back from ${it}! ♥`, (it) => `hope ${it} was fun ♥`],
  mon: ["welcome back from the weekend ♪", "i saved you a Monday hug ♥"],
};
// F6 game (B7d): tomorrow's pick, and the picker's line the day after.
const GAME_TOMORROW = {
  q: "what should we play tomorrow?",
  reply: "ok! i'll get ready ♪",
  day: ["let's play your pick today ♪", "ready for your game ♪"],
};
// F7 trick (B7d): "yes" and it shows a trick it hadn't learned, 3 to 5 days on.
const TRICK_ASK = {
  q: "should i learn a new trick?",
  yes: ["ok! i'll practise ♪"],
  later: ["ok! another time ♪"],
  shown: ["i learned it! look ♪", "you said i should! ta-da ♪"],
};
// HOUSE_LINES (ha-signals H3, owner-approved set D, 2026-11-01): the house answered the
// pet's request, not a person. heating = the blanket ask, cooling = the fan ask; bits are
// the evening's "today" and the away note's phrases. robot_out / robot_home: a robot
// vacuum started a run / went home (H4). washer / dishwasher / dryer / machine: a
// machine finished its cycle (H6, plan copy F). doorbell: a press (H5, plan copy G; said live, no bit). No PERSONA keys: every type says these.
const HOUSE_LINES = {
  heating: ["the heater's on! toasty ♪", "ooh, the house heard me! ♥", "warm air! that's better ♪"],
  cooling: ["ahh, a breeze! that's better ♪", "the house heard me! ahh ♪", "cool air! much better ♪"],
  robot_out: ["ooh, the robot's out! vroom", "here it comes! *hop hop*", "vroom vroom! ♪"],
  robot_home: ["the robot's back home ♪", "bye, robot! nap well ♪"],
  washer: ["the washer's finished! ♪"],
  dishwasher: ["the dishes are all done! ♪"],
  dryer: ["the dryer's done! warm socks ♪"],
  machine: ["ding! a machine finished ♪", "ooh, something's done! ♪"],
  doorbell: ["ding dong! eep!", "ooh, the doorbell! ♪", "ding dong! *perks up*"], // H5, channel only: no bit
  bits: { heating: "felt the house warm up", cooling: "felt the house cool down", robot: "watched the robot clean", machine: "heard a machine finish" },
};
// HOUSE_MOMENT_LINES (ha-signals H8, virtual_pet.react; DRAFT for the FM's review): what
// the pet says when the house moment blueprint (or an automation) names what changed, by
// category (const.py HOUSE_CATEGORIES). Not the house_answered lines: nothing was asked
// for. Plan Z's lines are folded in where they fit. custom: by reaction, when the player
// typed no words of their own (and an old card's only line for them).
const HOUSE_MOMENT_LINES = {
  heater: ["ooh, the heater's on! toasty ♪", "warm air coming! ♪", "cozy time! the heat's on ♪"],
  ac: ["the cool air's on! ahh ♪", "ooh, nice and cool ♪", "cool air! ahh, lovely ♪"],
  fan: ["whoosh! a breeze ♪", "the fan's on! wheee ♪", "ooh, windy! ♪"],
  washer: ["the washer's finished! ♪", "the laundry's all clean! ♪", "the washer's done! fresh ♪"],
  dryer: ["the dryer's done! warm socks ♪", "toasty laundry! ♪", "fluffy and warm! ♪"],
  dishwasher: ["the dishes are all done! ♪", "sparkly dishes! ♪", "all clean in there! ♪"],
  oven: ["ding! the oven's done ♪", "mm, something smells yummy ♪", "ooh, something's baked! ♪"],
  coffee: ["the coffee's ready! ♪", "mmm, coffee smell ♪", "bubble bubble! coffee ♪"],
  printer: ["ooh, the printer made something! ♪", "it's finished printing! ♪", "a new thing! ooh ♪"],
  ev: ["all charged up! ♪", "bzzt! all charged ♪", "the car's all full of zap ♪"],
  feeder: ["someone got dinner! ♪", "munch munch! dinnertime ♪", "ooh, food's served! ♪"],
  plants: ["the plants had a drink ♪", "glug glug! happy plants ♪", "the leaves look perky ♪"],
  delivery: ["ooh, a delivery came! ♪", "a parcel! ooh ♪", "something came for us! ♪"],
  timer: ["ding! time's up! ♪", "ding ding! ♪", "the timer rang! ♪"],
  internet: ["the internet's back! ♪", "we're back online! ♪", "the wifi's back! yay ♪"],
  custom: { hop: ["*hop hop* ♪"], cheer: ["yay! hooray! ♪"], cozy: ["mm, cozy ♪"], dance: ["♪ dance time! ♪"], startle: ["eep! oh! ♪"] },
};
// Settings and new-pet setup (docs/plan-2026-11-02-settings-setup.md §2, S2; copy
// APPROVED 2026-11-02): the lay sheet's static lines. N6, the lay button's aria-label,
// is built where it is drawn (it names the pet).
const SETUP_COPY = {
  laySheetHeading: "a new egg", // N1
  layPrompt: "pick who hatches", // N2
  laySurprise: "surprise me", // N3
  layConfirm: "lay the egg", // N4
  layBack: "‹ not yet", // N5
  layRefused: "this login can't choose, sorry", // C13'
  layOutside: "set in home assistant", // N25
  eggSurprise: "surprise", // N7
  eggComing: (creature) => `a ${creature.toLowerCase()} is coming`, // C15'
};
// Settings UX fix 1 (review 1, F12/F14/F16; copy APPROVED by the first mate 2026-11-02, owner
// delegated): the sheet's notes in the pet's voice, lowercase, and the pet's word when the
// sheet closes after a change. Scanned like the rest.
const SETTINGS_COPY = {
  backToStatus: "‹ status", // F16: the sheet's back button (the picker keeps "‹ settings")
  notifyOn: "i'll ping your phone! ♪",
  notifyOff: "no phone pings, ok ♪",
  myDayOff: "ok, i won't peek",
  sharedOn: "shh, nothing personal here now",
  cantKeep: "this screen can't keep that, sorry",
  cantKeepSounds: "this screen can't keep sounds, sorry",
  myDayOn: "i'll notice your good days! ♥",
  phoneOn: "your phone will hear it on the day ♥",
  phoneOff: "just here, then ♪",
  babyTalkOn: "ok, baby talk for babies and kids ♥",
};
const SETTINGS_REACT = {
  monoOn: "ooh, all green! like the old days ♪",
  monoOff: "colours back! ♪",
  effectsOff: "nice and crisp ♪",
  shell: "new shell! i look so nice ♥",
  sharedOn: "ok! i'll keep our secrets ♥",
  notifyOn: "i'll ring if i need you ♥",
};
// Status UX fix 2 (review 2, F12/F14; copy APPROVED by the first mate 2026-11-02, owner
// delegated): an egg's hatching row, and the pet's word on a journal tile. Scanned like the rest.
const STATUS_COPY = {
  eggGrowing: "warm and growing ♪", // F12: more than 15 minutes to go
  eggSoon: "wiggling! any minute ♪", // 15 or fewer
  eggCracking: "cracking! ♥", // 6 or fewer
  tileRaised: (name) => `${name}! my old pal ♥`, // F14 (FM 2026-11-02: 40 with the longest name)
  tileUnmet: "not met one of those yet",
};
// Talking with the pet, UX fix 3 (review 3, F11/F12/F14; copy APPROVED by the first mate
// 2026-11-02, owner delegated): the blanket and the fan answered, the lay's "sure?" in the
// pet's voice, and "today" among the big day's days. Scanned like the rest.
const TALK_COPY = {
  blanket: "so cozy now... thank you ♥", // F11
  fan: "ahh, a breeze! thank you ♪", // F11
  layArmed: "i'll wait for you in the journal ♥", // F12
  today: "today", // F14
};
// Games and playtime UX fix 6 (review 6; first mate's decisions 2026-11-02, owner delegated
// copy): a parked dig kept, a resumed one, a tap on an empty basket's keep, and the card
// closing an idle dig (F8, F12, Q8). Scanned like the rest.
const GAME_COPY = {
  parked: "ok! i'll keep our pile safe ♪", // F8, a ✕ that parks the dig
  back: "we're back! dig or keep ♪", // F8, a dig carried on
  empty: "dig first! the basket's empty", // F12, keep on an empty basket
  idle: "let's dig another time ♪", // Q8, the card closes a dig left idle
};
// --- end fresh-expand copy ---
// Approved lines the scan's nag words ("again", "forgot...") would refuse: a retry, "just us",
// and the two that say a forget worked. Not nagging, so unscanned.
const SETTINGS_AGAIN = {
  failed: "hm, that didn't work. try again soon",
  sharedOff: "just us again ♥",
  forgotBirthday: "ok, forgotten. i won't ask ♪",
  forgotMe: "forgotten. we'll start fresh ♥",
};
const HOUSE_REQUEST = { blanket: "heating", fan: "cooling" }; // the request the house answered
// The house moment's categories (H8; const.py HOUSE_CATEGORIES, card-check holds the two
// together): the pet's reaction and the house effect (an existing fx stand-in; the fan's
// breeze is fx-cool until house_breeze lands, the chime waits for H5's). custom: the
// player picks the reaction. bit: the evening's "today" phrase (HOUSE_LINES.bits), none
// for the channel-only ones and Custom.
const HOUSE_CATEGORY = {
  heater: { react: "cozy", fx: "fx-heat", bit: "heating" },
  ac: { react: "cozy", fx: "fx-cool", bit: "cooling" },
  fan: { react: "hop", fx: "fx-cool", bit: "cooling" },
  washer: { react: "cheer", fx: "fx-suds", bit: "machine" },
  dryer: { react: "cheer", fx: "fx-tumble", bit: "machine" },
  dishwasher: { react: "cheer", fx: "fx-suds", bit: "machine" },
  oven: { react: "cheer" }, // channel only (says someone's home)
  coffee: { react: "hop" }, // channel only
  printer: { react: "cheer", bit: "machine" },
  ev: { react: "cheer" }, // channel only
  feeder: { react: "hop" },
  plants: { react: "cozy" },
  delivery: { react: "startle" }, // channel only
  timer: { react: "startle" }, // channel only (a kitchen timer: someone is cooking)
  internet: { react: "dance" },
  custom: {},
};
// Each reaction's move: an existing CSS move (cheer adds the sparkle), for every stage.
const REACT_POSE = {
  hop: { move: "greethop", ms: 1400 },
  cheer: { move: "bighop", ms: 1400, sparkle: true },
  cozy: { move: "settle", ms: 2500 },
  dance: { move: "jig", ms: 1800 },
  startle: { move: "startle", ms: 700 },
};
for (const [type, keys] of Object.entries(PERSONA_FRESH)) Object.assign(PERSONA[type], keys);
// Kindred pairs (2b, docs/plan-2026-11-01-kindred-pairs.md): two teen/adult pets whose
// types are partners here, or the same type, are kindred. On KINDRED_ODDS of their
// links the host adds a line of its own (link_kindred). Nothing is counted or kept.
const KINDRED = { mellow: "sweet", sweet: "mellow", bouncy: "starry", starry: "bouncy",
  old_soul: "fancy", fancy: "old_soul", charming: "plucky", plucky: "charming" };
const KINDRED_ODDS = 0.5; // a kindred link's chance of the host's extra line
const FRIEND_WELCOME_MS = 6 * 3600 * 1000; // "welcome home!" at the next look, this long after
const FIRST_LOOK_LINES = 3; // lines queued at the first look (the visit's notes fill what's left)
// An adult's say on how it was raised (P2b): all happy, any type, at most once a
// week per pet, at a first look that has room (docs/plan-2026-10-28-personality-types.md).
const UPBRINGING_LINES = {
  devoted: "you always looked after me ♥",
  steady: "I turned out just right ♪",
  scrappy: "I'm a bit of a rascal, hehe ♥",
};
const UPBRINGING_EVERY_MS = 7 * 24 * 3600 * 1000;
// True (and marks it) when this pet's upbringing line is due: a week since the last.
function upbringingDue(device) {
  const key = `hatch-upbringing-${device}`;
  const now = Date.now();
  try {
    if (now - Number(localStorage.getItem(key) || 0) < UPBRINGING_EVERY_MS) return false;
    localStorage.setItem(key, String(now));
  } catch (err) {
    if (now - (upbringingDue.at?.[key] || 0) < UPBRINGING_EVERY_MS) return false;
    (upbringingDue.at ??= {})[key] = now;
  }
  return true;
}
// Titles, artists and names cut so a line fits the bubble on a 330 px card.
const short = (text, max = 30) => {
  const chars = Array.from(text || ""); // whole characters: never half an emoji
  return chars.length > max ? `${chars.slice(0, max - 1).join("").trimEnd()}…` : text;
};
const WELCOME_SAME_ARRIVAL_MS = 10 * 60 * 1000; // pets' reports this close: one arrival
// F1: a typed answer as sent and said: control and format characters gone, whitespace
// collapsed, at most FOLLOW_TEXT_MAX code points (the server cleans it again). Null if empty.
const FOLLOW_TEXT_MAX = 20;
// From 19 a big day's evening beat (the server's hour; this browser's clock only times the
// in-tab check, so a traveller's tab may ask at the wrong hour and get {}, critique #10).
const FOLLOW_EVENING_HOUR = 19;
const FOLLOW_RETRY_MS = 5 * 60 * 1000; // a deferred or failed evening try: again after this
// Said inside a line ("good luck with {it}! ♥"): no trailing punctuation or emoticon of
// its own (critique #8), as the server's clean_text.
const TYPED_TAIL = /(?:\s*(?:[.!?,;:]+|[:;=]-?[()DPpOo/|\\[\]]|<3))+$/u;
// The typing browser's own copy of a big day's or weekend's words (owner Q1 A on critique
// s2632): one key per person, {kind, it, until}, gone after its event's last day or at
// "forget my data" here. Never on Home Assistant's disk; a restart there doesn't lose it.
const FOLLOW_TEXT_KEY = "hatch-followtext-";
// The big day's buttons (opp #2): a day n days from today, as the local date, and its label.
const DAY_SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
// E14, the journal's week strip: a day's glyphs and its words for screen readers. Only the
// days that hold something; a visitor only while finds are shown (review #16); no wish.
const WEEK_GLYPH = { rain: "☂", snow: "❄", sun: "☀", storm: "⚡", fog: "☁" };
const WEEK_WORD = { rain: "rain", snow: "snow", sun: "sun", storm: "a storm", fog: "fog", dream: "a dream" };
function daysAhead(n, today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function followTextKeep(user, kind, it, until) {
  try {
    localStorage.setItem(FOLLOW_TEXT_KEY + user, JSON.stringify({ kind, it, until }));
  } catch (err) {
    // no storage: the server's copy only
  }
}
// The words typed here for this kind, while its event lasts (by the local date), or null.
function followTextRead(user, kind, today = new Date()) {
  try {
    const kept = JSON.parse(localStorage.getItem(FOLLOW_TEXT_KEY + user) || "null");
    if (!kept) return null;
    const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    if (typeof kept.until !== "string" || kept.until < day) {
      localStorage.removeItem(FOLLOW_TEXT_KEY + user);
      return null;
    }
    return kept.kind === kind && typeof kept.it === "string" ? kept.it : null;
  } catch (err) {
    return null;
  }
}
// Every person's kept words whose event is over (by the local date), or unreadable, gone:
// at card start and at each first look (audit s2635 M1), so none outlives its day unread.
function followTextSweep(today = new Date()) {
  try {
    const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(FOLLOW_TEXT_KEY)) continue;
      let kept = null;
      try {
        kept = JSON.parse(localStorage.getItem(key));
      } catch (err) {
        kept = null;
      }
      if (!kept || typeof kept.until !== "string" || typeof kept.it !== "string" || kept.until < day) localStorage.removeItem(key);
    }
  } catch (err) {
    // no storage: nothing kept
  }
}
// A phone, or the Home Assistant app: where typed words may be said back without this
// browser having typed them (owner Q2 A). A desktop or tablet browser gets the plain line.
function phoneLike(ua = navigator.userAgent || "") {
  return /Home ?Assistant\//.test(ua) || /iPhone|Android.+Mobile/.test(ua);
}
const cleanTyped = (value) => {
  const kept = String(value ?? "").replace(/\p{C}/gu, "").replace(/\s+/g, " ").trim().replace(TYPED_TAIL, "");
  return Array.from(kept).slice(0, FOLLOW_TEXT_MAX).join("").trim().replace(TYPED_TAIL, "") || null;
};
// Questions the pet asks; the server picks which and when (visit's "ask"), so
// the daily limit holds across pets and devices. "keep" answers go back to the
// server (virtual_pet/answer); the others stay on the card.
const ASK_MS = 60000; // a question stays this long (it was not asked for, so focus stays put)
const QUESTIONS = {
  // F4: one a world; the buttons are this pet's world's visitors (options), by name.
  fav_visitor: { q: FAVV_LINES.q, keep: true, answers: {},
    options: (s) => visitorList(s.world).filter((v) => v.name).slice(0, 3).map((v) => v.id),
    label: (a, s) => visitorList(s.world).find((v) => v.id === a)?.name || a,
    reply: (a, s) => FAVV_LINES.reply(visitorList(s.world).find((v) => v.id === a)?.name || a) },
  // F1: asked Sundays and Mondays (opp #2); "yes" asks which day (the next 6, as
  // buttons), and the day's tap opens the optional typed answer.
  big_day: { q: BIG_DAY.q, answers: { yes: [], no: BIG_DAY.no },
    label: (a) => (a === "no" ? "not really" : a) },
  big_day_day: { q: BIG_DAY.which, answers: {}, options: () => [0, 1, 2, 3, 4, 5, 6].map((n) => daysAhead(n)),
    label: (a) => (a === daysAhead(0) ? TALK_COPY.today : DAY_SHORT[new Date(`${a}T12:00`).getDay()]), reply: () => pick(BIG_DAY.yes) },
  // Opp #1: the big day's evening, from 19, in its follow beat's place: how_day's answers.
  big_how: { q: BIG_DAY.how, answers: {} },
  // F5-F7: the weekend (Fridays; "yes" as the big day's), tomorrow's game, a new trick.
  weekend: { q: WEEKEND.q, answers: { yes: WEEKEND.yes, no: WEEKEND.no },
    label: (a) => (a === "no" ? "not really" : a) },
  game: { q: GAME_TOMORROW.q, answers: {}, options: () => GAMES.map((g) => g.key),
    label: (a) => GAMES.find((g) => g.key === a)?.label || a, reply: () => GAME_TOMORROW.reply },
  trick: { q: TRICK_ASK.q, answers: { yes: TRICK_ASK.yes, later: TRICK_ASK.later },
    label: (a) => (a === "later" ? "maybe later" : a) },
  how_day: { q: "how was your day?", answers: {
    great: ["yay!! that makes me so happy ♥", "a great day! that makes me glow ♥"],
    ok: ["ok days are good days too ♥", "i'm glad you're here now ♥"],
    tough: ["aww... come here *snuggle* ♥", "i'm here for you ♥ *cuddle*"] } },
  slept: { q: "did you sleep well?", answers: {
    great: ["yay! ♥ good morning!", "me too! ♥"],
    ok: ["a cozy morning then ♥"],
    "not really": ["aww, take it easy today ♥", "a slow morning then... *yawn* ♥"] } },
  fav_weather: { q: "what's your favourite weather?", keep: true, answers: {
    sun: ["sunny days! me too ☀"], rain: ["ooh, rain is so cozy ☂"], snow: ["snow!! ❄ i'll remember"],
    storms: ["storms! so exciting!"] } },
  fav_season: { q: "what's your favourite season?", keep: true, answers: {
    spring: ["spring! flowers everywhere ♪"], summer: ["summer! all that sunshine ☀"],
    autumn: ["autumn! crunchy leaves ♪"], winter: ["winter! snuggle season ❄"] } },
  // Asked once ever, after a missed call, of someone with the HA app (top10 1a; the
  // server decides). "yes" turns on "notify me" for this pet (_ask).
  phone: { q: "can i call your phone when i need you?", answers: {
    yes: ["yay! i'll ring you ♥"], "not now": ["ok! you can say yes in settings ♥"] },
  label: (a) => (a === "yes" ? "yes ♥" : a) },
  dream: { q: "what should i dream about tonight?", keep: true, answers: {
    stars: ["ooh, the stars. ok! ★"], sea: ["the sea it is! ♪"], snacks: ["snacks!! yum, ok!"], you: ["you! ♥ i'd like that"] } },
  guess: { q: "rain or sun tomorrow?", keep: true, answers: {
    rain: ["rain! we'll see ☂"], sun: ["sun! we'll see ☀"] } },
  // Theirs, kept privately on the server ("skip" sticks; forgotten on the status screen).
  birthday: { q: "when's your birthday?", keep: true, answers: { ok: null, skip: null },
    // Two steppers in the chips' own look, "‹ Feb ›" and "‹ 29 ›" (UX fix 3, F10). The value
    // sits in each <output>'s data-v; a month change keeps the day inside the month (29 Feb ok).
    picker: () => `<span class="stepper" role="group" aria-label="month">${stepBtn("month", -1)}` +
      `<output class="bmonth" data-v="1">${MONTHS[0]}</output>${stepBtn("month", 1)}</span>` +
      `<span class="stepper" role="group" aria-label="day">${stepBtn("day", -1)}` +
      `<output class="bday" data-v="1">1</output>${stepBtn("day", 1)}</span>`,
    step: (box, which, dir) => {
      const month = box.querySelector(".bmonth");
      const day = box.querySelector(".bday");
      if (which === "month") month.dataset.v = String((Number(month.dataset.v) - 1 + dir + 12) % 12 + 1);
      else day.dataset.v = String(Number(day.dataset.v) + dir);
      const max = new Date(2000, Number(month.dataset.v), 0).getDate(); // 2000: 29 Feb
      const n = Number(day.dataset.v);
      // A day step wraps round the month; a month step only keeps the day inside it.
      day.dataset.v = String(which === "month" ? Math.min(n, max) : n < 1 ? max : n > max ? 1 : n);
      month.textContent = MONTHS[Number(month.dataset.v) - 1];
      day.textContent = day.dataset.v;
    },
    value: (box, a) => (a === "skip" ? "skip"
      : `${box.querySelector(".bmonth").dataset.v.padStart(2, "0")}-${box.querySelector(".bday").dataset.v.padStart(2, "0")}`),
    reply: (a) => (a === "skip" ? "ok! ♥"
      : `${MONTHS[Number(a.slice(0, 2)) - 1]} ${Number(a.slice(3))}! i'll remember ♥`) },
  // The pet's own, from a close friend (the server checks it asked).
  catchphrase: { q: "what should i say at the end of things?", keep: true,
    answers: { hehe: null, yay: null, "and stuff": null, "la la": null, keep: null },
    label: (a, s, mine) => (a === "keep" ? `keep "${mine}"` : a),
    reply: (a, s, mine) => (a === "keep" ? `ok! i'll keep saying "${mine}" ♥` : `ok! i'll say "${a}"! ♥`) },
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const stepBtn = (which, dir) => `<button type="button" class="stepb" data-step="${which}" data-dir="${dir}" ` +
  `aria-label="${dir < 0 ? "earlier" : "later"} ${which}">${dir < 0 ? "‹" : "›"}</button>`;
// Its yearly birthday: a party hat (the season costume code places it) and confetti.
const PARTY = { key: "party", costumes: [{ art: "hat", sink: 7, width: 56 }],
  lines: ["party hat on! ♪", "look, I'm all dressed up! ♪", "best birthday ever! ♪"] };
// The visit's celebration lines: one a look, and always a place for it.
const CELEBRATION_NOTES = new Set(["your_birthday", "pet_birthday", "birthday_friends", "friends_for"]);
const months = (n) => `${n} month${n === 1 ? "" : "s"}`;
const berries = (n) => (n ? `${n} ${n === 1 ? "berry" : "berries"}` : "no berries"); // the dig's count, said
const PLACES = {
  gym: "back from the gym! so strong!", work: "home from work! ♥",
  school: "back from class! ♥", park: "I hope the park was fun! ♪",
};
const HOME_WEATHER = {
  wet: "it's wet out there! come get cozy ☂", snowy: "snow on your shoes! ❄",
  cold: "brr, it looks cold out there!", hot: "you must be thirsty after that heat!",
};
const SEASON_ICONS = { spring: "♪", summer: "☀", autumn: "♥", winter: "❄" };
// What the pet tells only you (virtual_pet.visit's notes), each once.
const NOTES = {
  pet_birthday: (n) => (n.years ? `it's my birthday!! i'm ${n.years} today! ♥` : `i'm ${months(n.months)} old today! ♥`),
  birthday_friends: (n) => `i'm ${months(n.months)} old! friends from day one ♥`,
  your_birthday: (n) => (n.quiet ? "happy birthday ♥" : "happy birthday!! ♥"), // _note adds the name
  friends_for: (n) => n.months % 12 === 0
    ? `we've been friends for ${n.months === 12 ? "a whole year" : `${n.months / 12} years`}!! ♥`
    : `we've been friends for ${n.months === 1 ? "a month" : `${n.months} months`}! ♥`,
  tucked_in: () => pick(["thanks for tucking me in last night ♥", "i slept so well after you tucked me in ♥"]),
  steps: (n) => `wow, ${n.steps.toLocaleString()} steps! you've been busy!`,
  more_than_usual: () => pick(["you've walked way more than usual today!", "so many steps! you've been on the go!"]),
  best_day: () => "your most active day in weeks!! ♥",
  bike: () => "you went for a bike ride! wheee!",
  run: () => "you went for a run! so fast!",
  stairs: (n) => `${n.floors} floors of stairs! what a climber!`,
  rested: () => pick(["you got a good sleep! ♥", "you slept so well! ♥"]),
  rain_walk: () => pick(["you walked in the rain! so brave! ☂", "rain or not, look at all those steps! ☂"]),
  snow_walk: () => "a walk in the snow! ❄ so brave!",
  dream: (n) => n.pick === "you"
    ? (n.yours ? "i dreamed about you, like you said! ♥" : DREAM_FRIENDS)
    : `i dreamed about ${{ stars: "the stars", sea: "the sea", snacks: "snacks" }[n.pick] || n.pick}${n.yours ? ", like you said! ♥" : "..."}`,
  guess: (n) => n.outcome === "right"
    ? (n.guess === "rain" ? "you were right!! it rained ☂" : "you were right!! sunny ☀")
    : n.outcome === "wrong"
      ? (n.guess === "rain" ? "oh, sunny after all! good guess though ♥" : "oh, it rained after all! good guess though ♥")
      : "it was cloudy all day! nobody wins ♥",
  back_from: (n) => PLACES[n.place],
  fav_weather: (n) => ({ sun: "it's sunny, your favourite! ☀", rain: "it's raining, your favourite! ☂",
    snow: "it's snowing, your favourite!! ❄", storms: "a storm! your favourite!" })[n.weather],
  season: (n) => n.holiday && namedHolidays()
    ? `${n.holiday === "halloween" ? "Halloween" : "Thanksgiving"} in your favourite season! ♥`
    : `it's ${n.season}, your favourite! ${SEASON_ICONS[n.season] || ""}`.trim(),
  early_alarm: () => "early start tomorrow! sleep well ♥",
  up_early: () => "mmh... you're up before the sun... zzz ♥",
  photo: () => "i made you something! it's in your journal ♥",
};
const DREAM_FRIENDS = "I dreamed about my friends ♥"; // a "you" dream, to everyone but its asker
const DREAM_CALLBACK_DAYS = [2, 3, 4]; // a told story's callback, days later (F2), by the pet and day
const DREAMS = {
  watching: (d) => `I dreamed about ${short(d.title)}!`,
  listening: (d) => `♪ I dreamed of ${short(d.title)} ♪`,
  rain_started: () => "I dreamed it was raining...",
  rainbow: () => "I dreamed about a rainbow!",
  snow_started: () => "I dreamed of snow ❄",
  moon: () => "I dreamed I flew to the moon!",
  game: () => "I dreamed we played and I won!",
  chore: () => "I dreamed about treats...",
  wish: () => "I dreamed about my wish all night ♥",
  trait: () => "I had such a big dream last night...",
  flying: () => "I dreamed I could fly!",
  clouds: () => "I dreamed I napped on a cloud...",
  feast: (d, w) => `I dreamed about a mountain of ${w?.food || "snacks"}!`,
  // Plain dreams (fresh-moment 6; model.PLAIN_DREAMS turns through them, one a morning).
  swim_fish: () => "I dreamed I swam with the fish ♪",
  acorn: () => "I dreamed of a giant acorn!",
  tall: () => "I dreamed I was really, really tall!",
  stars_sang: () => "I dreamed the stars sang to me ★",
  blanket: () => "I dreamed of a big warm blanket...",
  secret_door: () => "I dreamed I found a secret door!",
  leaf_ride: () => "I dreamed I rode a leaf down a stream",
  bubbles: () => "I dreamed of bubbles, so many bubbles!",
  birds_talk: () => "I dreamed I could talk to birds ♪",
  tiny_boat: () => "I dreamed I was a tiny boat ♪",
  pillow_hill: () => "I dreamed of a hill made of pillows",
  moon_dance: () => "I dreamed I danced in the moonlight ★",
  pie: () => "I dreamed I baked the biggest pie!",
  rainbow_slide: () => "I dreamed I slid down a rainbow ♪",
  candy_clouds: () => "I dreamed the clouds were candy floss",
  tiny_hat: () => "I dreamed I wore a teeny tiny hat ♪",
  giant_sock: () => "I dreamed I hid in a giant sock!",
  parade: () => "I dreamed of a parade just for me ★",
  juggling: () => "I dreamed I juggled shiny pebbles!",
  pink_sky: () => "I dreamed I painted the sky pink ♪",
  big_puddle: () => "I dreamed of a puddle as big as a lake",
  sing_along: () => "I dreamed I sang and everyone joined ♪",
  bean: () => "I dreamed I was the size of a bean!",
  cake_house: () => "I dreamed of a house made of cake!",
  jelly: () => "I dreamed I bounced on a big jelly ♪",
  lantern: () => "I dreamed of a lantern that hummed ♪",
  whistle: () => "I dreamed I learned to whistle ♪",
  // Yesterday's world visitor (top10 6d), by its name in worlds.json; none known: no dream line.
  visitor: (d, w, worlds) => {
    const v = worlds?.[d.world]?.visitors?.find((x) => x.id === d.id);
    return v?.name ? `I dreamed about the ${v.name}! ♪` : null;
  },
};
const AWAY_NOTE_AFTER_MS = 3 * 3600 * 1000;
// The evening's line about its own day (fresh-moment 4, owner 2026-11-01): from this hour,
// at the first look; a granted wish's line by kind (tuck_in is granted at bedtime, after).
const TODAY_FROM_HOUR = 17;
const TODAY_WISH = {
  play: "I got to play a game today! ♪",
  snack: "I got a snack after lunch! ♥",
  bath: "I got my bubble bath today! ♥",
  praise: "somebody said I'm good today ♥",
  sunset: "I got to watch the sunset today ♥",
  music: "I got some music today ♪",
  tv: "I got to watch TV today ♪",
  chore: "I got a chore treat today! ♥",
  rain: "I got to see the rain today! ♪",
  say_hi: "I got a hello this afternoon ♥",
};
const RESUME_HOLD_MS = 5000; // a tab back after AWAY_NOTE_AFTER_MS: its first look waits for fresh states
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
// PERSONAL_EVENTS) and the house's shows and songs (MEDIA_EVENTS). Only an old
// server's public list carries them; the card never reads them there.
// house_live / news_live (const.py LIVE_EVENTS): a channel-only house moment, and house
// words kept off the sensor, said live and kept nowhere (H8); doorbell_live: a doorbell press (H5).
const CHANNEL_ONLY = new Set(["bond_up", "bond_record", "bond_favourite", "friend_home", "tucked_in", "watching", "listening",
  "house_live", "news_live", "doorbell_live"]);
const MEDIA_MOMENTS = new Set(["watching", "listening"]);
const momentKey = (m) => m && `${m.at}|${m.type}`;
// Every line has a class (PR 2a). A higher class may interrupt a lower one; one
// that can't waits in s.queue (kept, care and beats) or, flavour, is dropped if
// it would wait more than FLAVOUR_WAIT_MS. During a kept line, a game or an open
// question nothing below kept interrupts. 0 is the rest (a greeting, the mood line).
const MINE = 4; // the viewer's own care press: never overwritten for MINE_MS
const KEPT = 3; // never dropped, may wait
const SOCIAL_MAX = 10; // the social meter's top (rates.SOCIAL_MAX): five hearts, in halves
const BEAT = 2; // care by someone else, calls, sleep
const FLAVOUR = 1; // may be dropped, never replayed as a barrage
const MINE_MS = 3000;
// A pat (C10), by mood; any other mood says the content line. Babies and children too.
const PAT_LINES = { content: "hehe ♥", excited: "hehe! ♪", sleepy: "mmm...", sick: "thanks... ♥" };
const PAT_SPOT_ODDS = 1 / 12; // a spoken pat's chance of the sweet spot (fresh-expand P-b)
const PAT_COOLDOWN_MS = 4000; // a pat in this time after a spoken one wiggles, no line
const PAT_MS = 2500;
const EGG_PAT_LINE = "♪"; // an egg's pat: the one sound it makes (UX fix 4, F2)
// Reactions to care at baby, teen and adult (PR 3c, O02): the stage's own mood frames
// (no new art) and a bounded CSS move, for one length at every stage.
const REACT_MS = 2500;
const REACTIONS = {
  fed: { mood: "excited", move: "munch", ms: 1500 },
  praised: { mood: "excited", move: "greethop", ms: 1400 },
  greet: { mood: "excited", move: "greethop", ms: 1400 }, // a world visitor (acts.cheer, else this)
  refused: { mood: "bored", move: "look", ms: 1200 },
  tucked: { mood: "cozy", move: "settle", ms: REACT_MS },
  // Only with the species' own act (STAGE_POSES): without it these do nothing (R2).
  lost: { mood: "content", move: "settle", ms: 1200 }, // a good sport (acts.aww, else content frames: UX fix 6, F5); the log can land before the game closes
  ready: { mood: "content", move: null, ms: 1200, poseOnly: true }, // a game just began
};
const READY_MS = 1200;
const PAT_POSE_MS = 900; // acts.pat on a pat; apart from poseUntil so the next pat's `reacting` is unchanged
// Which species.json "acts" pose a reaction plays at baby, teen and adult (R1, R2).
// refused and lost: the act, else the mood frame; ready: the act, else nothing (the game perks instead).
const STAGE_POSES = { fed: "eat", praised: "cheer", greet: "cheer", refused: "refuse", lost: "aww", ready: "ready" };
// Idle manner (P3): the copies of moves each type adds to _idle's list, in the
// plan's order (docs/plan-2026-10-28-personality-types.md, "Idle manner"). Only
// existing moves, reweighted. Bouncy's hop is on even when content.
const IDLE_ADDS = {
  mellow: ["mumble", "mumble"],
  sweet: [],
  bouncy: ["hop"],
  starry: ["mumble", "perk"],
  old_soul: ["look", "look"],
  fancy: ["perk", "perk"],
  charming: ["look", "perk"],
  plucky: ["wander", "perk"],
};
// Only these refusals react; asleep, egg, away, no_game, unfair and spoiled do not.
const REACT_REFUSALS = new Set(["full", "not_needed", "already_clean", "not_sick", "not_sleepy", "too_tired"]);
const MINE_MATCH_MS = 10000; // a press is matched to the first new log entry within this
const FLAVOUR_WAIT_MS = 8000;
// Every moment type, coming (became_sick) or channel-only, has a class: card-check
// holds this against coordinator MOMENTS, const PERSONAL_EVENTS and MEDIA_EVENTS.
const MOMENT_CLASS = {
  hatched: KEPT, stage_changed: KEPT, egg_laid: KEPT, trait_learned: KEPT, trait_deepened: KEPT,
  wish_granted: KEPT, bond_up: KEPT, bond_record: KEPT, bond_favourite: KEPT, friend_home: KEPT,
  tucked_in: KEPT, favourite_snack: KEPT, first_snow: KEPT, first_frost: KEPT, first_warm: KEPT, first_fog: KEPT, care_miss: KEPT,
  season_start: KEPT, // {season}: the first day of spring, summer, autumn or winter (H7)
  call_answered: BEAT, woke_up: BEAT, fell_asleep: BEAT, good_morning: BEAT, discipline_miss: BEAT,
  became_sick: BEAT, someone_home: BEAT,
  sunrise: FLAVOUR, sunset: FLAVOUR, weather: FLAVOUR, forecast: FLAVOUR, news: FLAVOUR,
  house_answered: FLAVOUR, // {request}: the heating or the fan came on for the pet (H3)
  robot_out: FLAVOUR, robot_home: FLAVOUR, // a robot vacuum started / ended a run (H4)
  appliance_done: FLAVOUR, // {kind}: a washer, dryer or dishwasher finished (H6)
  house_moment: FLAVOUR, house_live: FLAVOUR, // {category[, reaction, text]}: virtual_pet.react (H8)
  news_live: FLAVOUR, // share_news's headline with house_words_private on (H8)
  doorbell_live: FLAVOUR, // a doorbell press: said live, kept nowhere (H5)
  pooped: FLAVOUR, tv_off_late: FLAVOUR, watching: FLAVOUR, listening: FLAVOUR,
  tv_on: FLAVOUR, music_on: FLAVOUR, // public: no line (the channel's watching/listening says it)
  found: FLAVOUR, // a find went in the basket: the away note's "found <a find>" (V8); no line
};
// Kept moments the catch-up leaves out: the look welcomes a friend home itself,
// and a thank-you for the tuck-in reads oddly the next morning (first mate, 2026-10-31).
const CATCHUP_SKIP = new Set(["friend_home", "tucked_in"]);
const lineClass = (q) => q.cls ?? KEPT; // a queued line with no class is kept (notes, questions)
// Two kinds of care in one update (C4): "<first> and <second>! ♥".
const CARE_NOUNS = { feed: "a meal", snack: "snacks", clean: "a bath", medicine: "medicine", play: "play",
  blanket: "a blanket", fan: "a fan" };
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
const BACKLIGHT_MS = 3000; // a tap on the shell's backlight button lights the screen this long
const POSE_MOODS = new Set(["content", "excited", "cozy", "bored", "sleepy"]);

// The same bands as rates.py (WEIGHT_LIGHT_BELOW, WEIGHT_HEAVY_ABOVE).
function weightLabel(v) {
  if (v === null) return "–";
  return `${Math.round(v)} · ${v < 25 ? "a bit light · a meal would help" : v > 75 ? "a bit heavy · snacks add up" : "just right"}`;
}
const isHeavy = (v) => v !== null && v > 75; // rates.py WEIGHT_HEAVY_ABOVE
// A heavy pet's snack, half the time (gaps-seams 2a): snacks are what tip it.
// Sick from weight (gaps-seams 2b, owner Q3), and in baby talk.
const SICK_WEIGHT = ["ugh... too many snacks, I think", "my tummy's grumbly... too many snacks"];
const SICK_WEIGHT_BABY = "tummy hurts... too many snacks";
const HEAVY_SNACK = ["one more and I'll be round as a ball!", "*pats tummy* getting a bit round..."];

// The status row counting down to the next stage (gaps-seams 1a), or null: a child
// to teen, a teen to grown up. "About", since ageing pauses while it's away.
function growsUp(stage, ageDays) {
  const next = { child: "teen", teen: "adult" }[stage];
  if (!next || typeof ageDays !== "number") return null;
  const left = Math.round(STAGE_DAYS[next] - ageDays);
  if (left < 1) return null;
  const when = left === 1 ? "tomorrow" : `in about ${left} days`;
  return next === "adult" ? ["grows up", when] : ["next", `teen ${when}`];
}

// What it would like, in the status sheet (2c, C9): a call's need, else medicine
// if sick, else the first request. Plain words, no "?", no clock.
const WANT_WORDS = { call_hunger: "a meal", call_dirty: "a bath", call_energy: "a nap", call_sick: "medicine",
  call_happiness: "play", sick: "medicine", blanket: "a blanket", fan: "a fan" };
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

// a over b, weight w of a, as #rrggbb.
function mixHex(a, b, w) {
  const n = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [p, q] = [n(a), n(b)];
  return `#${p.map((v, i) => Math.round(v * w + q[i] * (1 - w)).toString(16).padStart(2, "0")).join("")}`;
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

// --- The moulded shell -------------------------------------------------------
// Every part of a shell (body, bezel, lid, feet, loop, roof, crescent, the caps) is
// cut on the world's on-screen pixel grid (WORLD_GRID): --px CSS px a cell, a
// whole number of device pixels. mouldCells sorts a part's cells into tones; the
// part gets a clip-path for its stepped outline and an SVG of see-through light
// and shade over its plastic. The plastic itself (the world's colour, or a finish) stays CSS, so
// any shell colour works.
const TONE = { plain: 1, line: 2, lit: 3, glint: 4, shade: 5, dither: 6, deep: 7, seam: 8, side: 9 };
const TONE_PAINT = [
  [TONE.line, "rgba(34,20,10,.86)"], [TONE.lit, "rgba(255,255,255,.34)"], [TONE.glint, "rgba(255,255,255,.75)"],
  [TONE.shade, "rgba(24,12,4,.2)"], [TONE.dither, "rgba(24,12,4,.2)"], [TONE.deep, "rgba(24,12,4,.34)"],
  [TONE.seam, "rgba(24,12,4,.24)"],
];
const MOULDS = new Map(); // cut parts, by kind and size

// Inside a w x h box with CSS corner radii ([h, v] per corner, top-left first).
function inRound(x, y, w, h, rad) {
  if (x < 0 || y < 0 || x > w || y > h) return false;
  const f = Math.min(1, w / (rad[0][0] + rad[1][0] || 1), w / (rad[3][0] + rad[2][0] || 1),
    h / (rad[0][1] + rad[3][1] || 1), h / (rad[1][1] + rad[2][1] || 1));
  const c = rad.map(([a, b]) => [a * f, b * f]);
  const corner = (cx, cy, [a, b], sx, sy) => !a || !b || sx * (x - cx) < 0 || sy * (y - cy) < 0 ||
    ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 <= 1;
  return corner(c[0][0], c[0][1], c[0], -1, -1) && corner(w - c[1][0], c[1][1], c[1], 1, -1) &&
    corner(w - c[2][0], h - c[2][1], c[2], 1, 1) && corner(c[3][0], h - c[3][1], c[3], -1, 1);
}

// An element's corner radii, in cells of size g.
function cssRadii(el, w, h, g) {
  const st = getComputedStyle(el);
  return ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].map((k) => {
    const [a, b = a] = st[`border${k}Radius`].split(" ");
    const v = (s, size) => (s.endsWith("%") ? (parseFloat(s) / 100) * size : parseFloat(s) || 0) / g;
    return [v(a, w), v(b, h)];
  });
}

// Sort a W x H grid of cells into tones; inside(x, y) takes a cell's centre. Raised
// plastic is lit along its top and left and shaded, then dithered, along its bottom
// and right; sunk plastic (a recess) the other way round. With core(x, y), the
// cells around the core are a recess's lip: in shadow above, lit below. glint adds
// a highlight at the top left, seam a parting line that many cells in, veins(x, y)
// lines of its own.
function mouldCells(W, H, inside, { sunk = false, glint = false, seam = 0, core = null, veins = null } = {}) {
  const ins = new Uint8Array(W * H);
  let x0 = W, x1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x + 0.5, y + 0.5)) continue;
    ins[y * W + x] = core && !core(x + 0.5, y + 0.5) ? 2 : 1;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
  }
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && ins[y * W + x] === 1;
  const run = (x, y, dx, dy) => { let n = 0; while (n < 12 && at(x + dx * (n + 1), y + dy * (n + 1))) n++; return n; };
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (ins[i] === 2) { out[i] = x / W + y / H < 1 ? TONE.deep : TONE.lit; continue; }
    if (!ins[i]) continue;
    const u = run(x, y, 0, -1), d = run(x, y, 0, 1), l = run(x, y, -1, 0), r = run(x, y, 1, 0);
    if (!u || !d || !l || !r) { out[i] = TONE.line; continue; }
    let t = TONE.plain;
    const near = Math.min(u, d, l, r) - 1; // plain cells between this one and the outline
    if (sunk) t = u === 1 || l === 1 ? TONE.deep : d === 1 || r === 1 ? TONE.lit : t;
    else {
      if (u <= 2 || l === 1) t = TONE.lit;
      else if (d <= 2 || r === 1) t = TONE.shade;
      else if (d <= 4 && (x + y) % 2 === 0) t = TONE.dither;
      const fx = (x - x0) / (x1 - x0 + 1);
      if (glint && (u === 3 || u === 4) && fx > 0.16 && fx < (u === 3 ? 0.34 : 0.3)) t = TONE.glint;
      if (glint && u === 3 && fx > 0.37 && fx < 0.4) t = TONE.glint;
      if (seam && near === seam) t = TONE.seam;
      else if (seam && near === seam + 1 && (d === seam + 2 || r === seam + 2)) t = TONE.lit;
      if (veins && near > seam + 1 && veins(x + 0.5, y + 0.5)) t = TONE.seam;
    }
    out[i] = t;
  }
  return out;
}

// A button cap n cells across, raised depth cells off its socket: the face, its side
// below (TONE.side, which CSS paints) and the outline round both.
function capCells(n, depth, rad) {
  const W = n, H = n + depth;
  const face = (x, y) => inRound(x, y, n, n, rad);
  const ins = (x, y) => x >= 0 && y >= 0 && x < W && y < H &&
    Array.from({ length: depth + 1 }, (_, k) => k).some((k) => face(x + 0.5, y + 0.5 - k));
  const onFace = (x, y) => face(x + 0.5, y + 0.5);
  const run = (x, y, dy) => { let k = 0; while (k < 12 && onFace(x, y + dy * (k + 1))) k++; return k; };
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!ins(x, y)) continue;
    const i = y * W + x;
    if (!ins(x - 1, y) || !ins(x + 1, y) || !ins(x, y - 1) || !ins(x, y + 1)) out[i] = TONE.line;
    else if (!onFace(x, y)) out[i] = TONE.side;
    else {
      const u = run(x, y, -1), d = run(x, y, 1);
      out[i] = u <= 1 ? TONE.lit : u === 2 && x > n * 0.22 && x < n * 0.42 ? TONE.glint
        : d === 0 ? TONE.shade : TONE.plain;
    }
  }
  return out;
}

// The cells that pass test, as one SVG path (runs along a row, merged down the rows
// while they repeat), scaled by g and shifted by (ox, oy).
function cellsPath(cells, W, H, test, g = 1, ox = 0, oy = 0) {
  const f = (v, o) => +(v * g + o).toFixed(3);
  let d = "", prev = null, top = 0, runs = [];
  const flush = (bottom) => {
    for (let k = 0; k < runs.length; k += 2) {
      d += `M${f(runs[k], ox)} ${f(top, oy)}H${f(runs[k + 1], ox)}V${f(bottom, oy)}H${f(runs[k], ox)}Z`;
    }
  };
  for (let y = 0; y <= H; y++) {
    const row = [];
    for (let x = 0; y < H && x < W; x++) {
      if (!test(cells[y * W + x])) continue;
      const start = x;
      while (x < W && test(cells[y * W + x])) x++;
      row.push(start, x);
    }
    const key = row.join();
    if (key !== prev) { if (prev !== null) flush(y); prev = key; runs = row; top = y; }
  }
  return d;
}

// A clip-path of those cells; none at all is an empty clip, not an invalid path.
const clipPath = (d) => (d ? `path("${d}")` : "inset(50%)");

// The light and shade over a part, as a CSS image a cell per SVG unit.
function toneImage(cells, W, H) {
  const paths = TONE_PAINT.map(([t, paint]) => {
    const d = cellsPath(cells, W, H, (v) => v === t);
    return d ? `<path fill='${paint}' d='${d}'/>` : "";
  }).join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' preserveAspectRatio='none' ` +
    `shape-rendering='crispEdges'>${paths}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// Glitter in the plastic: a tile of single-cell flecks, each with a dark cell beside
// it so it shows on a pale shell too. Tiled at the grid's size by CSS.
const glitterTile = () => {
  const W = 29, H = 23, colours = ["#fff8d5", "#ffd9e9", "#d4f8ec", "#ffffff"];
  let rects = "";
  for (let k = 0; k < 7; k++) {
    const x = (k * 13 + 5) % W, y = (k * 17 + 3) % H;
    rects += `<rect x='${x}' y='${y}' width='1' height='1' fill='${colours[k % 4]}'/>` +
      `<rect x='${(x + 1) % W}' y='${(y + 1) % H}' width='1' height='1' fill='rgba(48,24,64,.35)'/>`;
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' shape-rendering='crispEdges'>${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

// A printed tile, a cell per character: rows of keys into paints, "." left clear.
function printTile(rows, paints) {
  let rects = "";
  rows.forEach((row, y) => [...row].forEach((k, x) => {
    if (paints[k]) rects += `<rect x='${x}' y='${y}' width='1' height='1' fill='${paints[k]}'/>`;
  }));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${rows[0].length} ${rows.length}' ` +
    `shape-rendering='crispEdges'>${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// Shell finishes (worlds.json shell.finish): each world's own, the 1990s editions,
// and prints any world can wear. The CSS draws them (.finish-<key>); here is what
// the captions are inked against: `face(colour)` the plastic's main colour, set as
// --d-face for the CSS too, or a fixed `ink`; `seen` mixes see-through plastic with
// the backdrop first. A print's tile is --print-<key>, tiled at the grid's size.
const PRINT_W = "rgba(255,255,255,.5)";
const FINISHES = {
  woodland: {}, aqua: {}, grove: {}, celestial: {}, dune: {},
  clear: { seen: (c) => c, see: 0.34 }, glitter: {}, glow: {},
  speckle: { face: (c) => mixHex(c, "#fff4e2", 0.62),
    tile: [["......d.......", ".........w....", "..w...........", "...........d..", "....d.........",
      "..........w...", "w.............", "......w....d..", "..d...........", "..........w..."],
    { d: "rgba(48,26,12,.62)", w: "rgba(255,255,255,.85)" }] },
  stripes: { face: (c) => c,
    tile: [["wwww....", ".wwww...", "..wwww..", "...wwww.", "....wwww", "w....www", "ww....ww", "www....w"], { w: PRINT_W }] },
  hearts: { face: (c) => mixHex(c, "#ffd5e4", 0.7),
    tile: [["............", ".hh..hh.....", "hhhhhhhh....", "hhhhhhhh....", ".hhhhhh.....", "..hhhh......",
      "...hh.......", "............", "............", "............", "............", "............"],
    { h: "rgba(255,182,206,.9)" }] },
  stars: { face: (c) => mixHex(c, "#3b3d99", 0.35),
    tile: [["......y.........", "......y.........", "....yyyyy.......", ".....yyy........", ".....y.y........",
      "................", "................", "............w...", "................", "................",
      "..w.............", "................"], { y: "rgba(255,240,150,.95)", w: "rgba(255,255,255,.7)" }] },
  gingham: { face: (c) => mixHex(c, "#fff5e0", 0.6),
    tile: [["wwww....", "wwww....", "wwww....", "wwww....", "....dddd", "....dddd", "....dddd", "....dddd"],
      { w: "rgba(255,255,255,.34)", d: "rgba(30,16,8,.2)" }] },
  dots: { face: (c) => c,
    tile: [["..........", ".ww.......", ".ww.......", "..........", "..........", ".......ww.", ".......ww.",
      "..........", "..........", ".........."], { w: PRINT_W }] },
  camo: { face: () => "#8fbe62",
    tile: [["dddd......gggg........", "ddddd....ggggg....dd..", ".dddd.....gg.....ddd..", "......dd........dddd..",
      "..gg..ddd....gg......k", ".gggg.......ggggg....k", ".ggg....kk...ggg......", ".......kkkk...........",
      "..dd....kk....gggg....", ".dddd.........gggg....", "..ddd...gg....gg......", "........ggg..........."],
    { d: "#5e9447", g: "#c4df8c", k: "#3f6a3a" }] },
  waves: { face: (c) => mixHex(c, "#5fb6d8", 0.55),
    tile: [["..ww....", ".w..w...", "w....w.w", "......w.", "........", "........", "........", "........"],
      { w: "rgba(255,255,255,.55)" }] },
  scales: { face: (c) => mixHex(c, "#4fa7c8", 0.6) },
  leaves: { face: () => "#f6efd6",
    tile: [[".......l....", "......lml...", ".....lmmll..", "......lml...", ".......m....", "............",
      "..l.........", ".lml........", "lmmll.......", ".lml........", "..m.........", "............"],
    { l: "#78b35a", m: "#4f8a43" }] },
  paws: { face: (c) => mixHex(c, "#ffe3c2", 0.75),
    tile: [["..........", ".w..w.....", "..........", "..www.....", ".wwwww....", ".wwwww....", "..w.w.....",
      "..........", "..........", ".........."], { w: PRINT_W }] },
  constellation: { face: () => "#3a3990",
    tile: [["..............................", "....w.........................", "....:.:.:.....w.......w.......",
      ".........:.:.w....:.:.:.......", "..............................", "..w...........................",
      "...................y..........", "...........w..................", "..............................",
      "..............................", "..............................", "..............................",
      "........................w.....", "..............................", "y.............................",
      ".............................."], { w: "#ffffff", y: "#fff0a0", ":": "rgba(255,255,255,.4)" }] },
  rainbow: { ink: "#3b2440" },
  twotone: { face: (c) => mixHex(c, "#fff4e6", 0.16), top: (c) => c },
  sunset: { ink: "#3a1631" },
  smoke: { seen: () => "#282230", see: 0.62 },
};
// Each print's tile as a CSS image, for --print-<key> on the card.
const printTiles = () => Object.entries(FINISHES).filter(([, f]) => f.tile)
  .map(([k, f]) => [`--print-${k}`, printTile(...f.tile)]);
// The shell picker's groups, in FINISHES order; the prints are the rest.
const SHELL_GROUPS = [["world plastics", ["woodland", "aqua", "grove", "celestial", "dune"]],
  ["specials", ["clear", "glitter", "glow"]]];
SHELL_GROUPS.push(["prints", Object.keys(FINISHES).filter((k) => !SHELL_GROUPS.some(([, keys]) => keys.includes(k)))]);
const finishName = (key) => (key === "twotone" ? "two-tone" : key);
// A finish's swatch in the picker: its print over its face, or bands of its plastic
// (the colours of its .finish-<key> CSS), drawn with the world's own colour.
const SWATCH_BANDS = {
  woodland: (c) => ["#f49a55", c, "#e07a40"], aqua: () => ["#80e3df", "#36b9c2", "#168d9c"],
  grove: () => ["#a9df68", "#74bd62", "#4e965c"], celestial: () => ["#777be0", "#6255bb", "#413c91"],
  dune: (c) => ["#ecc88f", c, "#cc9d62"], glow: (c) => [`color-mix(in srgb, ${c} 52%, #d4f0b4)`],
  rainbow: () => ["#ffa3b1", "#ffd08f", "#fff08f", "#a8e6a6", "#9ed4f2", "#c9aef0"],
  sunset: () => ["#ffd66e", "#ffbb63", "#ff9f62", "#ff8a78", "#f37e98", "#c96fa8"],
  clear: (c) => [`color-mix(in srgb, ${c} 40%, transparent)`], smoke: () => ["rgba(40,34,48,.75)"],
};
function finishSwatch(key, color) {
  if (!Object.hasOwn(FINISHES, key)) return color; // the world's plain plastic
  const look = FINISHES[key];
  const face = look.face ? look.face(color) : color;
  if (look.tile) return `var(--print-${key}) 0 0 / ${look.tile[0][0].length * 2}px ${look.tile[0].length * 2}px, ${face}`;
  if (key === "glitter") return `var(--glitter) 0 0 / 58px 46px, color-mix(in srgb, ${color} 80%, #fff2c9)`;
  if (key === "twotone") return `linear-gradient(180deg, ${color} 0 50%, ${face} 0)`;
  const bands = SWATCH_BANDS[key]?.(color) || [face];
  const stops = bands.map((b, i) => `${b} 0 ${Math.round(((i + 1) * 100) / bands.length)}%`);
  return `linear-gradient(180deg, ${stops.join(", ")})`;
}
// The sheet's and the picker's notes (F13): the pet speaking, a bubble with its head, hung under
// the back band (inside it, so it sticks with it and moves nothing), never over a row's taps.
const SAY_NOTE = `<div class="status-feedback say" role="status" aria-live="polite" hidden></div>`;
// Classes a button wears only for a moment (a tap, a call in flight): never part of the selector
// that puts focus back after a redraw.
const PASSING_CLASSES = new Set(["tap-feedback", "tapped", "pressed", "pending"]);
// A failed shell save, by the server's error code; anything else is the generic line.
const SHELL_ERRORS = {
  no_pet: "can't find this pet",
  shell_locked: "not grown into that one yet",
  unknown_command: "can't change the shell here",
};
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
    .pet.droop { transform: translateY(4px) rotate(-4deg) scaleY(.94); transform-origin: 50% 100%; }
  }
  ha-card { overflow: hidden; border-radius: var(--ha-card-border-radius, 24px);
    background: var(--hp-backdrop, #2f4a3a); transition: background .5s; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 14px 18px 4px; }
  .title { font: 400 24px 'Tiny5', monospace; color: var(--hp-ink); }
  .title.long { font-size: 16px; } /* a long name keeps to two lines */
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
  /* No text selection from a mouse swipe (UX fix 2, F6); the typed-text box still takes typing. */
  .track { user-select: none; -webkit-user-select: none; position: relative; display: flex; gap: 16px; align-items: flex-end;
    transition: transform .5s cubic-bezier(.2,.8,.2,1); }
  .track input { user-select: text; -webkit-user-select: text; }
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
  .dots { display: flex; flex-wrap: wrap; justify-content: center; gap: 0; min-width: 0; }
  /* 44 x 44 hit area (4c's size); the drawn dot is still 10 px, and the boxes sit edge to edge. */
  .dot { width: 44px; height: 44px; border: none; padding: 0; cursor: pointer;
    background: none; display: flex; align-items: center; justify-content: center; }
  .dot::before { content: ""; width: 10px; height: 10px; border-radius: 5px;
    background: color-mix(in srgb, var(--hp-ink) 55%, transparent); transition: width .3s; }
  .dot[aria-current="true"]::before { width: 20px; background: var(--hp-ink); }
  /* A pet this browser hasn't shown yet (UX fix 4, F4): a small pulse till its slide is first shown
     (reduced motion: no pulse, a darker dot). */
  .dot.fresh::before { background: var(--hp-ink); animation: dotpulse 1.6s ease-in-out infinite; }
  @keyframes dotpulse { 50% { transform: scale(1.5); } }
  .slide.away-slide { cursor: pointer; }
  /* The empty card's toy (UX fix 4, F5): an egg's silhouette (the journal's "???" look), no buttons. */
  .slide.empty .pet { filter: brightness(0); opacity: .25; }
  .slide.empty .buttons, .slide.empty .backlight, .slide.empty .lcd, .slide.empty .glow { display: none; }
  .single .foot { display: none; }

  /* One device */
  .device { display: flex; flex-direction: column; align-items: center; font-family: 'Tiny5', monospace; }
  /* The moulded shell (_mould): each part's plastic is a .mould cut on the grid
     (--px a cell), its own colour in CSS with the cut light and shade (--tones) over
     it. The parts themselves only give the size and shape. */
  .mould { position: absolute; left: 0; top: 0; z-index: -1; pointer-events: none;
    background: var(--d-dark); }
  .mould::after { content: ""; position: absolute; inset: 0; background: var(--tones) 0 0 / 100% 100%; }
  .loop, .roof, .feet span, .bezel { isolation: isolate; }
  .loop { position: relative; width: 46px; height: 28px; margin-bottom: -12px; }
  .lid { width: 92%; height: 20px; border-radius: 10px 10px 4px 4px; display: flex; justify-content: center;
    align-items: center; gap: 6px; }
  .lid span { width: 12%; height: calc(var(--px, 2px) * 2); background: rgba(24,12,4,.34);
    box-shadow: 0 var(--px, 2px) 0 rgba(255,255,255,.22); }
  /* The lid sits over the body's top edge. */
  .lid { position: relative; z-index: 1; margin-bottom: -5px; }
  .feet { width: 82%; display: flex; justify-content: space-between; }
  .feet span { position: relative; width: 34px; height: 10px; border-radius: 0 0 6px 6px; }
  /* House: a pitched roof with a chimney, sitting on the body like a cottage. */
  .roof { position: relative; width: 108%; height: 64px; margin-bottom: -2px; }
  .compact .roof { height: 46px; }
  /* Porthole: a riveted ring (the rivets are cut with the bezel) around a rounded window. */
  .porthole .body { border-radius: 40px; padding: 22px 18px 26px; }
  .porthole .bezel { padding: 14px; border-radius: 30% / 38%; }
  /* --edge: how far the porthole's round corners eat into the screen (a share of its width;
     heights take ~.75 of it); what stands in a corner or on the ground keeps that far in.
     --go: how far go-left / go-right carry the pet (of its own width); less in the round window. */
  .porthole .screen { border-radius: 28% / 36%; --edge: 12%; --go: 45%; }
  /* Clear of the round corners, as wide as on the other shapes (the window is a little narrower). */
  .porthole .bubble { left: 11%; top: 11%; max-width: 66%; }
  .porthole .screen { container-type: inline-size; }
  .porthole .status { --sy: 6cqw; --sx: 11cqw; } /* the sheet's padding, its bands kept flush */
  /* Text fades at the lens's rim rather than being sliced mid-letter by the round corners (UX fix 2, F9). */
  .porthole .status { -webkit-mask-image: linear-gradient(transparent, #000 10px, #000 calc(100% - 10px), transparent);
    mask-image: linear-gradient(transparent, #000 10px, #000 calc(100% - 10px), transparent); }
  .porthole .attention { right: 13%; top: 9%; }
  /* Pad: a lily pad, its notch and veins cut with the body. */
  .pad .body { border-radius: 50% / 30%; padding: 40px 22px 40px; }
  .pad .buttons { width: 86%; }
  /* Moon: a crescent riding on top of a rounded body sprinkled with stars. */
  .crescent { width: 64px; height: 64px; border-radius: 50%; margin: 0 0 -26px 26px;
    position: relative; z-index: 1; }
  .crescent > .mould { background: var(--d-bezel); }
  .moon .body { border-radius: 34px; padding: 30px 18px 24px; }
  @supports (width: round(1px, 1px)) {
  .moon .body > .mould {
    --star: linear-gradient(rgba(255,255,255,.6), rgba(255,255,255,.6));
    background: var(--star) round(12%, var(--px)) round(20%, var(--px)) / var(--px) var(--px) no-repeat,
      var(--star) round(88%, var(--px)) round(14%, var(--px)) / var(--px) var(--px) no-repeat,
      var(--star) round(6%, var(--px)) round(62%, var(--px)) / var(--px) var(--px) no-repeat,
      var(--star) round(94%, var(--px)) round(56%, var(--px)) / var(--px) var(--px) no-repeat,
      var(--star) round(5%, var(--px)) round(86%, var(--px)) / var(--px) var(--px) no-repeat,
      var(--star) round(95%, var(--px)) round(90%, var(--px)) / var(--px) var(--px) no-repeat, var(--d-shell); }
  }
  .murk { inset: 0; width: 100%; height: 100%; opacity: 0; transition: opacity .8s; }
  .body { width: 100%; box-sizing: border-box; box-shadow: 0 16px 34px rgba(20,15,5,.32);
    display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .body { position: relative; isolation: isolate; }
  .body > .mould { background: var(--d-shell); }
  /* Shell finishes recolour the moulded plastic, in hard bands on the grid; the cut
     light and shade stay over them. They leave .bezel and .screen geometry alone:
     the screen is a fixed opening. A speck is a square of whole cells. */
  .device { --sq: calc(var(--px) * 2); }
  @supports (width: round(1px, 1px)) {
  .finish-woodland .body > .mould {
    background: linear-gradient(180deg, #f49a55 0 round(down, 20%, var(--px)), var(--d-shell) 0 round(down, 72%, var(--px)),
      #e07a40 0 round(down, 86%, var(--px)), #d76a35 0); }
  }
  @supports (width: round(1px, 1px)) {
  .finish-aqua .body > .mould {
    background: linear-gradient(180deg, #80e3df 0 round(down, 16%, var(--px)), #52cbcf 0 round(down, 32%, var(--px)),
      #36b9c2 0 round(down, 68%, var(--px)), #1fa0ae 0 round(down, 84%, var(--px)), #168d9c 0); }
  }
  .finish-aqua .toy:nth-child(4n + 1) .cap { background: #ffd9dc; }
  .finish-aqua .toy:nth-child(4n + 2) .cap { background: #fff0b7; }
  .finish-aqua .toy:nth-child(4n + 3) .cap { background: #dcd4ff; }
  .finish-aqua .toy:nth-child(4n) .cap { background: #c8f1d8; }
  @supports (width: round(1px, 1px)) {
  .finish-grove .body > .mould { --sun: linear-gradient(#ffec8f, #ffec8f);
    background: var(--sun) round(12%, var(--px)) round(23%, var(--px)) / var(--sq) var(--sq) no-repeat,
      var(--sun) round(88%, var(--px)) round(37%, var(--px)) / var(--sq) var(--sq) no-repeat,
      var(--sun) round(16%, var(--px)) round(73%, var(--px)) / var(--px) var(--px) no-repeat,
      var(--sun) round(84%, var(--px)) round(81%, var(--px)) / var(--px) var(--px) no-repeat,
      linear-gradient(180deg, #a9df68 0 round(down, 22%, var(--px)), #8dcd64 0 round(down, 46%, var(--px)),
        #74bd62 0 round(down, 78%, var(--px)), #4e965c 0); }
  }
  .finish-grove .toy .cap { background: #fff0a8; }
  .finish-grove .toy:nth-child(3n + 2) .cap { background: #ffd1b5; }
  @supports (width: round(1px, 1px)) {
  .finish-celestial .body > .mould { --star: linear-gradient(#fff4bb, #fff4bb); --dot: linear-gradient(#fff, #fff);
    background: var(--star) round(13%, var(--px)) round(16%, var(--px)) / var(--sq) var(--sq) no-repeat,
      var(--star) round(87%, var(--px)) round(24%, var(--px)) / var(--sq) var(--sq) no-repeat,
      var(--dot) round(9%, var(--px)) round(66%, var(--px)) / var(--px) var(--px) no-repeat,
      var(--dot) round(91%, var(--px)) round(75%, var(--px)) / var(--px) var(--px) no-repeat,
      linear-gradient(180deg, #777be0 0 round(down, 24%, var(--px)), #6255bb 0 round(down, 74%, var(--px)), #413c91 0); }
  }
  .finish-celestial .toy .cap { background: #f4d7fa; }
  .finish-celestial .toy:nth-child(3n + 2) .cap { background: #d4e7ff; }
  @supports (width: round(1px, 1px)) {
  .finish-dune .body > .mould { --grain: linear-gradient(rgba(150,104,52,.32), rgba(150,104,52,.32));
    background: var(--grain) round(10%, var(--px)) round(82%, var(--px)) / var(--sq) var(--sq) no-repeat,
      var(--grain) round(90%, var(--px)) round(70%, var(--px)) / var(--sq) var(--sq) no-repeat,
      linear-gradient(180deg, #ecc88f 0 round(down, 20%, var(--px)), var(--d-shell) 0 round(down, 74%, var(--px)),
        #cc9d62 0 round(down, 88%, var(--px)), #c39257 0); }
  }
  .finish-dune .toy .cap { background: #fbefd0; }
  .finish-dune .toy:nth-child(3n + 2) .cap { background: #f3d6a6; }
  /* 1990s special editions (any world, any shape). Clear: see-through plastic, the
     board and its glare showing; the outlines and the cut shade keep it solid. */
  .finish-clear .body > .mould { --gold: rgba(236,200,104,.6); --bp: calc(var(--bz-x) - var(--px) * 5) calc(var(--bz-y) - var(--px) * 5);
    --bs: calc(var(--bz-w) + var(--px) * 10) calc(var(--bz-h) + var(--px) * 10);
    background:
      repeating-linear-gradient(180deg, transparent 0 calc(var(--px) * 5), var(--gold) 0 calc(var(--px) * 6)) var(--bp) / var(--bs) no-repeat,
      repeating-linear-gradient(90deg, transparent 0 calc(var(--px) * 13), var(--gold) 0 calc(var(--px) * 14)) var(--bp) / var(--bs) no-repeat,
      linear-gradient(rgba(40,128,84,.55), rgba(40,128,84,.55)) var(--bp) / var(--bs) no-repeat,
      color-mix(in srgb, var(--d-shell) 34%, transparent); }
  .finish-clear .body > .mould::before { content: ""; position: absolute; width: calc(var(--px) * 8); height: calc(var(--px) * 8);
    top: round(7%, var(--px)); left: round(down, 84% - var(--px) * 8, var(--px)); opacity: .6; image-rendering: pixelated;
    background: #fff; -webkit-mask: var(--hw-glare) 0 0 / 100% 100%; mask: var(--hw-glare) 0 0 / 100% 100%; }
  .finish-clear .bezel > .mould::before { background: color-mix(in srgb, var(--d-bezel) 78%, transparent); }
  .finish-clear .crescent > .mould { background: color-mix(in srgb, var(--d-bezel) 50%, transparent); }
  .finish-clear .loop > .mould, .finish-clear .lid > .mould, .finish-clear .feet .mould,
  .finish-clear .roof > .mould { background: color-mix(in srgb, var(--d-dark) 48%, transparent); }
  .finish-clear .body { box-shadow: none; }
  .finish-clear .toy .cap { background: color-mix(in srgb, #e6f8ec 72%, transparent); }
  /* Glitter: sparkle in the plastic, a few flecks twinkling slowly. */
  .finish-glitter .body > .mould { background: var(--glitter) 0 0 / calc(var(--px) * 29) calc(var(--px) * 23),
    color-mix(in srgb, var(--d-shell) 80%, #fff2c9); }
  .finish-glitter .loop > .mould, .finish-glitter .lid > .mould, .finish-glitter .feet .mould,
  .finish-glitter .roof > .mould { background: color-mix(in srgb, var(--d-dark) 76%, #ffe9ad); }
  .finish-glitter .hw.flecks { display: block; }
  .finish-glitter .toy .cap { background: #fff0ce; }
  /* Glow: pale green by day; at night (or in a dark theme) the plastic itself lights up. */
  .finish-glow .body > .mould { background: color-mix(in srgb, var(--d-shell) 52%, #d4f0b4); }
  .finish-glow .loop > .mould, .finish-glow .lid > .mould, .finish-glow .feet .mould,
  .finish-glow .roof > .mould { background: color-mix(in srgb, var(--d-dark) 55%, #bfe4a0); }
  .finish-glow .toy .cap { background: #e7f3c8; }
  .finish-glow .toy:nth-child(3n + 2) .cap { background: #d5e8ae; }
  .finish-glow:has(.screen.night) .body > .mould, .finish-glow:has(.screen.dim) .body > .mould {
    background: color-mix(in srgb, var(--d-shell) 18%, #c6f79c); }
  .finish-glow:has(.screen.night) .body, .finish-glow:has(.screen.dim) .body {
    box-shadow: 0 0 18px 4px rgba(173,238,126,.5), 0 16px 34px rgba(20,15,5,.32); }
  .finish-glow:has(.screen.night) :is(.loop, .lid, .roof) > .mould, .finish-glow:has(.screen.night) .feet .mould,
  .finish-glow:has(.screen.dim) :is(.loop, .lid, .roof) > .mould, .finish-glow:has(.screen.dim) .feet .mould {
    background: #9fdc7c; }
  .finish-glow:has(.screen.night) .crescent > .mould, .finish-glow:has(.screen.dim) .crescent > .mould { background: #d3f7ad; }
  @media (prefers-color-scheme: dark) {
    .finish-glow .body > .mould { background: color-mix(in srgb, var(--d-shell) 18%, #c6f79c); }
    .finish-glow .body { box-shadow: 0 0 18px 4px rgba(173,238,126,.5), 0 16px 34px rgba(20,15,5,.32); }
    .finish-glow :is(.loop, .lid, .roof) > .mould, .finish-glow .feet .mould { background: #9fdc7c; }
    .finish-glow .crescent > .mould { background: #d3f7ad; }
  }
  /* Prints any world can wear (FINISHES): a tile of whole cells (--print-<key>) over the
     plastic's face (--d-face), tiled at the grid's size. */
  .finish-speckle .body > .mould { background: var(--print-speckle) 0 0 / calc(var(--px) * 14) calc(var(--px) * 10), var(--d-face); }
  .finish-stripes .body > .mould { background: var(--print-stripes) 0 0 / calc(var(--px) * 8) calc(var(--px) * 8), var(--d-face); }
  .finish-hearts .body > .mould { background: var(--print-hearts) 0 0 / calc(var(--px) * 12) calc(var(--px) * 12), var(--d-face); }
  .finish-stars .body > .mould { background: var(--print-stars) 0 0 / calc(var(--px) * 16) calc(var(--px) * 12), var(--d-face); }
  .finish-gingham .body > .mould { background: var(--print-gingham) 0 0 / calc(var(--px) * 8) calc(var(--px) * 8), var(--d-face); }
  .finish-dots .body > .mould { background: var(--print-dots) 0 0 / calc(var(--px) * 10) calc(var(--px) * 10), var(--d-face); }
  .finish-camo .body > .mould { background: var(--print-camo) 0 0 / calc(var(--px) * 22) calc(var(--px) * 12), var(--d-face); }
  .finish-waves .body > .mould { background: var(--print-waves) 0 0 / calc(var(--px) * 8) calc(var(--px) * 8), var(--d-face); }
  .finish-scales .body > .mould { background: radial-gradient(circle at 50% 100%, transparent 0 calc(var(--px) * 3),
    rgba(255,255,255,.38) 0 calc(var(--px) * 4), transparent 0) 0 0 / calc(var(--px) * 8) calc(var(--px) * 5), var(--d-face); }
  .finish-leaves .body > .mould { background: var(--print-leaves) 0 0 / calc(var(--px) * 12) calc(var(--px) * 12), var(--d-face); }
  .finish-paws .body > .mould { background: var(--print-paws) 0 0 / calc(var(--px) * 10) calc(var(--px) * 10), var(--d-face); }
  .finish-constellation .body > .mould { background: var(--print-constellation) 0 0 / calc(var(--px) * 30) calc(var(--px) * 16),
    linear-gradient(180deg, #45449f 0 var(--cut2, 40%), var(--d-face) 0); }
  /* A print stops a cell short of a caption's letters, so no mark runs into them. */
  :is(.finish-speckle, .finish-stripes, .finish-hearts, .finish-stars, .finish-gingham, .finish-dots, .finish-camo,
    .finish-waves, .finish-scales, .finish-leaves, .finish-paws, .finish-constellation) .toy {
    text-shadow: var(--px) 0 var(--d-face), calc(var(--px) * -1) 0 var(--d-face), 0 var(--px) var(--d-face),
      0 calc(var(--px) * -1) var(--d-face); }
  /* Bands change colour only in the gaps between the label, the bezel and the button
     rows (_bands), so none cuts a row of buttons or its captions. */
  .finish-rainbow .body > .mould { background: linear-gradient(180deg, #ffa3b1 0 var(--cut1), #ffd08f 0 var(--cut2),
    #fff08f 0 var(--cut3), #a8e6a6 0 var(--cut4), #9ed4f2 0 var(--cut5), #c9aef0 0); }
  .finish-sunset .body > .mould { background: linear-gradient(180deg, #ffd66e 0 var(--cut1), #ffbb63 0 var(--cut2),
    #ff9f62 0 var(--cut3), #ff8a78 0 var(--cut4), #f37e98 0 var(--cut5), #c96fa8 0); }
  /* Two-tone: the world's colour over cream, split behind the bezel. */
  .finish-twotone .body > .mould { background: linear-gradient(180deg, var(--d-shell) 0 var(--cut2), var(--d-face) 0); }
  .finish-twotone .label { color: var(--d-ink-top); }
  /* Smoke: dark see-through plastic, the board behind the bezel showing through it.
     The board is drawn in the body's own plastic, so the body's outline clips it. */
  .finish-smoke .body > .mould { --gold: rgba(236,200,104,.6); --bp: calc(var(--bz-x) - var(--px) * 5) calc(var(--bz-y) - var(--px) * 5);
    --bs: calc(var(--bz-w) + var(--px) * 10) calc(var(--bz-h) + var(--px) * 10);
    background: linear-gradient(rgba(40,34,48,.62), rgba(40,34,48,.62)),
      repeating-linear-gradient(180deg, transparent 0 calc(var(--px) * 5), var(--gold) 0 calc(var(--px) * 6)) var(--bp) / var(--bs) no-repeat,
      repeating-linear-gradient(90deg, transparent 0 calc(var(--px) * 13), var(--gold) 0 calc(var(--px) * 14)) var(--bp) / var(--bs) no-repeat,
      linear-gradient(rgba(40,128,84,.55), rgba(40,128,84,.55)) var(--bp) / var(--bs) no-repeat; }
  .finish-smoke .bezel > .mould::before { background: rgba(60,56,66,.78); }
  .finish-smoke .loop > .mould, .finish-smoke .lid > .mould, .finish-smoke .feet .mould,
  .finish-smoke .roof > .mould, .finish-smoke .crescent > .mould { background: rgba(30,26,38,.7); }
  .finish-smoke .body { box-shadow: none; }
  .finish-smoke .toy .cap { background: #d9d6e2; }
  /* A finish only tints idle buttons: the lit/asleep (.on) and wanted states keep their own look. */
  .device[class*="finish-"] .toy.wanted .cap { background: #ffe9a8; }
  .device[class*="finish-"] .toy.on .cap { background: #3a2a1a; color: #ffe9a8; }
  /* Sol's trim (worlds.json "trim"), drawn at each piece's own size (see _trim) and
     placed to suit each shell: over the top edge, on the plate, at the bottom corners. */
  .trim-top, .trim-top2, .trim-corner { position: absolute; pointer-events: none;
    image-rendering: pixelated; z-index: 1; }
  .trim-top { top: -12px; left: 50%; transform: translateX(-50%); }
  .trim-top2 { display: none; }
  /* Egg (woodland): the garland flipped so it arches with the dome, not against it (owner, 2026-10-30). */
  .egg .trim-top { transform: translateX(-50%) scaleY(-1); }
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
  .tank .body { border-radius: 18px; padding: 16px 18px 36px; }
  .house .body { border-radius: 0 0 10px 10px; padding: 18px 18px 38px; }
  .label { font-size: 14px; letter-spacing: .12em; color: var(--d-ink); }
  .request { position: absolute; right: 14px; bottom: 14px; z-index: 2; min-height: 44px;
    display: none; align-items: center; gap: 6px; padding: 0 14px; border: 2px solid #3a2a1a;
    border-radius: 22px; background: #ffe9a8; color: #3a2a1a; cursor: pointer;
    font: 400 14px 'Tiny5', monospace; box-shadow: 3px 3px 0 #3a2a1a;
    animation: pulse 1.6s ease-in-out infinite; }
  .request.show { display: flex; }
  .bezel { position: relative; width: 100%; box-sizing: border-box; border-radius: 20px; padding: 9px; }
  .bezel > .mould { background: none; }
  .bezel > .mould::before { content: ""; position: absolute; inset: 0; background: var(--d-bezel); clip-path: var(--core); }
  .bezel > .screen { z-index: 1; }
  .screen { position: relative; aspect-ratio: 4 / 3; border-radius: 12px; overflow: hidden;
    background: #2b2f3a; box-shadow: inset 0 0 0 3px rgba(0,0,0,.35); cursor: pointer; }
  .screen img { position: absolute; image-rendering: pixelated; user-select: none;
    -webkit-user-drag: none; pointer-events: none; }
  .bg { inset: 0; width: 100%; height: 100%; object-fit: cover; transition: filter .6s; }
  .screen.night .bg { filter: brightness(.85); }
  .screen.dim .bg { filter: brightness(.5) saturate(.75); }
  .screen.dim .pet { filter: brightness(.8); }
  .pet, .perch, .screen .pat { left: 50%; bottom: 4%; height: 62%; margin-left: -23.25%; transform-origin: 50% 100%; }
  /* Heavy (gaps-seams 2c): 6% wider, height and feet kept, still centred. */
  .pet.heavy, .ghost.heavy { aspect-ratio: 1.06; margin-left: -24.645%; }
  /* The pat (PR 3b): a clear button over the pet's box (the img takes no taps), above the
     bubble and below a question, a game, the status and the boot screen. Written as
     ".screen .pat" so _tapped's .tap-feedback (position: relative) can't move it. */
  .screen .pat { position: absolute; z-index: 2; width: 46.5%; padding: 0; border: 0; border-radius: 12px;
    background: transparent; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .screen .pat[hidden], .screen.show-status .pat, .screen.linking .pat, .screen:has(> .askday) .pat,
  .screen:has(> .game:not([hidden])) .pat, .screen:has(> .boot:not([hidden])) .pat,
  .slide.away-slide .pat { display: none; }
  .screen .pat.tap-feedback.pressed { transform: none; filter: none; }
  .screen .pat.tap-feedback::after { display: none; }
  .screen .pat:focus-visible { outline-offset: -3px; box-shadow: inset 0 0 0 6px #1d2a22; }
  .pet.pat-soft { animation: pat-soft .3s ease-out; }
  @keyframes pat-soft { 40% { transform: translateY(-2%) scale(1.02, .98); } }
  .pet.pat-slow { animation: perk 1.1s ease-in-out; }
  .pet.rock { animation: rock .6s steps(4, jump-none) 1; transform-origin: 50% 90%; }
  @keyframes rock { 0% { transform: rotate(-4deg); } 33% { transform: rotate(4deg); } 66% { transform: rotate(-3deg); } 100% { transform: rotate(0); } }
  .pet.hop { animation: hop .7s ease-in-out infinite; }
  .pet.munch { animation: munch .5s ease-in-out 3; }
  @keyframes munch { 50% { transform: translateY(-4%) scale(1.04, .96); } }
  .pet.settle { animation: settle 2.5s ease-in-out; }
  @keyframes settle { 25%, 75% { transform: translateY(3%) scale(.97, .95); } }
  .pet.greethop { animation: hop .7s ease-in-out 2; } /* its own class: the bounce clears "hop" */
  @keyframes hop { 50% { transform: translateY(-9%); } }
  .poop { bottom: 5%; height: 15%; }
  .poop.p0 { left: 6%; } .poop.p1 { left: 18%; bottom: 3%; } .poop.p2 { right: 7%; }
  .attention { top: 5%; right: 5%; height: 17%; animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { transform: scale(1.12); } }
  .prop { left: 67%; bottom: 7%; height: 22%; animation: pop .3s ease-out; }
  /* A clean's extra bubble (fresh-expand M-b): up 30 px over 1.2 s, then it pops. */
  .bubblepop { position: absolute; left: 74%; bottom: 24%; height: 16%; image-rendering: pixelated; pointer-events: none;
    animation: bubblepop 1.2s ease-out forwards; }
  @keyframes bubblepop { 0% { transform: translateY(0); opacity: 1; } 80% { transform: translateY(-30px) scale(1); opacity: 1; }
    100% { transform: translateY(-30px) scale(0); opacity: 0; } }
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
    background: #fffdf5; color: #3a2a1a; box-shadow: 2px 2px 0 #3a2a1a; cursor: pointer; padding: 0;
    font: inherit; } /* the card's own font, not the browser's button font (F3) */
  .game button[aria-disabled="true"] { opacity: .5; cursor: default; }
  /* F4: while the pet shows where it went, the guess buttons fade out of its way. */
  .game.showgo .gl, .game.showgo .gr { opacity: .15; }
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
  /* _fitPicker puts the picker's top under the close button. When a column of
     games doesn't fit there, they wrap into rows of labels (no icons), still
     44 px tall (4c's tap size). */
  .game .gpick.wrap { left: 3%; right: 3%; flex-flow: row wrap; align-content: center; gap: 6px 4px; }
  .game .gpick.wrap button { min-width: 0; padding: 0 10px; font-size: 12px; justify-content: center; }
  .game .gpick.wrap.tight { left: 1%; right: 1%; gap: 4px 3px; } /* still too tall: two a row */
  .game .gpick.wrap.tight button { padding: 0 6px; font-size: 11px; }
  /* F2: the pile's leaves, or higher or lower's number, beside the pet (opposite the bubble,
     under the close button), so its face shows all game. */
  .game .gnum { position: absolute; right: 5%; top: 34%;
    display: grid; place-items: center; min-width: 30px; min-height: 36px; padding: 5px 7px;
    border-radius: 10px; background: #fffdf5; color: #3a2a1a; border: 2px solid #3a2a1a;
    box-shadow: 2px 2px 0 #3a2a1a; }
  .game .gnum.flip { animation: perk .3s ease-out; }
  /* D-a: today's visitor watching a dig, still, behind the buttons (fresh-expand E5). */
  .game .gwatch { position: absolute; right: 4%; bottom: 26%; height: 18%; image-rendering: pixelated;
    pointer-events: none; transform: scaleX(-1); }
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
  .season .lantern { right: calc(5% + var(--edge, 0%)); bottom: calc(5% + var(--edge, 0%) * .25); width: 17%; }
  .season .lantern.lantern-float { bottom: 30%; animation: s-bob 3s ease-in-out infinite alternate; }
  @keyframes s-bob { to { transform: translateY(-8%) rotate(-4deg); } }
  .screen.s-halloween.night .season .lantern, .screen.s-halloween.dim .season .lantern {
    filter: drop-shadow(0 0 6px rgba(255, 170, 60, .95)); animation: s-flicker 1.6s ease-in-out infinite; }
  .screen.s-halloween.night .season .lantern.lantern-float,
  .screen.s-halloween.dim .season .lantern.lantern-float {
    animation: s-flicker 1.6s ease-in-out infinite, s-bob 3s ease-in-out infinite alternate; }
  @keyframes s-flicker { 50% { filter: drop-shadow(0 0 3px rgba(255, 150, 50, .7)); } }
  /* Winter lights: a soft warm-white glow, the float's bob kept. */
  .screen.s-winter.night .season .lantern, .screen.s-winter.dim .season .lantern {
    filter: drop-shadow(0 0 6px rgba(255, 238, 196, .95)); animation: s-shine 3.2s ease-in-out infinite; }
  .screen.s-winter.night .season .lantern.lantern-float,
  .screen.s-winter.dim .season .lantern.lantern-float {
    animation: s-shine 3.2s ease-in-out infinite, s-bob 3s ease-in-out infinite alternate; }
  @keyframes s-shine { 50% { filter: drop-shadow(0 0 4px rgba(255, 230, 180, .75)); } }
  .screen.s-winter .season .bunting { animation: s-twinkle 2.4s steps(1) infinite; }
  @keyframes s-twinkle { 50% { filter: brightness(1.2); } }
  .season .corner { top: calc(var(--edge, 0%) * .45); width: 17%; opacity: .85; }
  .season .corner.right { right: calc(var(--edge, 0%) * .75); }
  .season .corner.left { left: calc(var(--edge, 0%) * .75); transform: scaleX(-1); }
  .season .sweet { right: calc(23% + var(--edge, 0%)); bottom: calc(5% + var(--edge, 0%) * .25); width: 7%; }
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
  .season .stwinkle { width: 10%; }
  .season .stwinkle.flap img { animation-duration: .6s; }
  /* A walker keeps to the ground: no flight bob, a slower step. */
  .season .sturkey { width: 15%; bottom: 6%; }
  .season .sturkey.flap img { animation-duration: .5s; }
  .season .snowhare { width: 15%; bottom: 6%; }
  .season .snowhare.flap img { animation-duration: .4s; }
  .season .sfly.walk.ltr { animation-name: s-ltr; } .season .sfly.walk.rtl { animation-name: s-rtl; }
  .season .sfly.ltr { left: -25%; } .season .sfly.rtl { left: 112%; }
  @keyframes s-fly { 25% { translate: 0 30%; } 50% { translate: 0 -20%; } 75% { translate: 0 25%; } }
  .season .sfly.ltr { animation-name: s-fly, s-ltr; } .season .sfly.rtl { animation-name: s-fly, s-rtl; }
  .season .sfly.rtl img { transform: scaleX(-1); } /* the art faces right */
  @keyframes s-ltr { to { left: 112%; } } @keyframes s-rtl { to { left: -25%; } }
  /* A world visitor (visitorList): 18 world cells wide (--px a cell: whole device pixels),
     resting at the scene's edge (--stop). It comes in from --from and leaves back to it;
     a crosser carries on to --to. Under reduced motion it just stands at --stop. */
  .season .vis { position: absolute; width: calc(var(--px, 2px) * 18); left: var(--stop);
    --from: -25%; --stop: calc(5% + var(--edge, 0%)); --to: 112%; }
  .season .vis.rtl { --from: 112%; --stop: calc(95% - var(--edge, 0%) - var(--px, 2px) * 18); --to: -25%; }
  .season .vis img { position: static; display: block; width: 100%; }
  .season .vis.flap img + img { position: absolute; inset: 0; }
  .season .vis.flap img { animation: fl-frame-a .5s steps(1) infinite; }
  .season .vis.flap img + img { animation-name: fl-frame-b; }
  .season .vis.in { animation: v-in var(--in-ms, 1.4s) ease-out both; }
  .season .vis.out { animation: v-out var(--in-ms, 1.4s) ease-in both; }
  .season .vis.cross { animation: v-cross var(--in-ms, 1.4s) linear both; }
  @keyframes v-in { from { left: var(--from); } to { left: var(--stop); } }
  @keyframes v-out { from { left: var(--stop); } to { left: var(--from); } }
  @keyframes v-cross { from { left: var(--from); } to { left: var(--to); } }
  .season .vis.fly { top: 36%; } .season .vis.walk { bottom: 6%; }
  .season .vis.vis-shootingstar { top: 28%; } /* under the bubble, over the pet's head */
  /* The art faces right; leaving, it turns back the way it came. */
  .season .vis.rtl img, .season .vis.ltr.out img { transform: scaleX(-1); }
  .season .vis.rtl.out img { transform: none; }
  /* The basket (visitors v2 §3): 12 world cells wide on the floor line, bottom right
     (inside the porthole's corners), over the pet's tap box; its own tap box is 44 px at
     least. Not live (asleep, a call, a neighbour's): taps go through to the screen. The
     reveal: the basket drawn once, and each find over it, 16 cells wide (its art's scale). */
  .screen .basket, .screen .reveal { position: absolute; z-index: 3; bottom: 6%;
    right: calc(5% + var(--edge, 0%)); width: calc(var(--px, 2px) * 12); padding: 0; border: 0;
    background: none; -webkit-tap-highlight-color: transparent; }
  .screen .basket { cursor: pointer; }
  .screen .basket::before { content: ""; position: absolute; left: 50%; top: 50%;
    width: max(44px, 100%); height: max(44px, 100%); translate: -50% -50%; }
  .screen .basket.idle, .screen .reveal { pointer-events: none; }
  .screen .basket img, .screen .reveal .rb { position: static; display: block; width: 100%; pointer-events: none; }
  .screen .reveal .rf { position: absolute; left: 50%; bottom: 60%; width: calc(var(--px, 2px) * 16);
    margin-left: calc(var(--px, 2px) * -8); image-rendering: pixelated; }
  .screen .reveal .rf.pop { animation: pop .3s ease-out; transform-origin: 50% 100%; }
  .screen .reveal .burst { top: auto; bottom: 90%; }
  /* A gift (visitors v2 §5): the find alone, 16 cells, no basket, up by the pet's head on
     the right: straight above the pet is the bubble's (left-anchored, up to 69% wide),
     where its line is said. Shown in compact too, as the basket and its reveal are. */
  .screen .reveal.gift { left: auto; right: calc(6% + var(--edge, 0%)); bottom: 46%;
    width: calc(var(--px, 2px) * 16); }
  .screen .reveal.gift .rf { position: static; display: block; width: 100%; margin: 0; }
  .season .bunting { position: absolute; top: calc(var(--edge, 0%) * .3); left: var(--edge, 0%);
    right: var(--edge, 0%); height: 8.4%;
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
  .game .gprop { position: absolute; bottom: 10%; width: 16%; image-rendering: pixelated;
    pointer-events: none; will-change: left, transform; }
  .game .gprop[hidden] { display: none; }
  .game .hl { font: inherit; font-size: 14px; }
  .game .gscore { position: absolute; left: 50%; bottom: 4%; transform: translateX(-50%);
    padding: 2px 8px; border-radius: 8px; background: #fffdf5; color: #3a2a1a;
    border: 2px solid #3a2a1a; font-size: 12px; white-space: nowrap; }
  .game .gscore.two { white-space: pre; text-align: center; line-height: 1.25; } /* the dig: round, then bank and basket */
  /* The dig at 300 px: the two-line score between keep and dig, clear of both. */
  .compact .game .gscore.two { font-size: 10px; padding: 1px 3px; bottom: 3%; letter-spacing: -.3px; }
  .compact .game.dig .gl { left: 1.5%; }
  .compact .game.dig .gr { right: 1.5%; }
  .screen.show-status .flair, .screen.show-status .game, .screen.show-status .rain, .screen.show-status .breeze,
  .screen.show-status .flash, .screen.show-status .speck, .screen.show-status .lcd, .screen.show-status .glow,
  .screen.show-status .bondhearts, .screen.show-status .linkhearts,
  .screen.show-status .basket, .screen.show-status .reveal { display: none !important; }
  .pet { transition: translate .25s ease-out; }
  /* Reactions to moments (see _moment). */
  .pet.sulk { animation: shake .35s 2; }
  /* Feeling poorly (2b): sags and settles back, once. Reduced motion holds the sag. */
  .pet.droop { animation: droop 2.8s ease-in-out 1; transform-origin: 50% 100%; }
  @keyframes droop { 0%, 100% { transform: none; }
    35%, 70% { transform: translateY(4px) rotate(-4deg) scaleY(.94); } }
  .pet.born { animation: pop .45s ease-out; }
  .pet.stretch { animation: perk .5s ease-out 2; }
  .poop.born { animation: pop .4s ease-out; }
  .screen .burst.big { top: 38%; width: 96px; height: 96px; margin-left: -48px; z-index: 2; }
  /* Stand-ins for house poses that are only drawn for the child. */
  .pet.dance { animation: hop .45s ease-in-out infinite; }
  .pet.jig { animation: hop .45s ease-in-out 4; } /* a house moment's dance (H8): bounded, unlike .dance */
  .pet.startle { animation: perk .3s ease-out 2; } /* a house moment's startle (H8): a quick double jolt */
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
  /* The LCD: a faint dot-matrix grid over the scene, one cell per world art pixel
     (WORLD_GRID, see _lcdPitch), under the weather, the bubble, the game and the status. */
  .lcd { position: absolute; inset: 0; pointer-events: none; display: none;
    background-color: rgba(255,228,170,.035);
    background-image:
      repeating-linear-gradient(0deg, rgba(20,24,12,.08) 0 var(--lcd-line, 1px), transparent var(--lcd-line, 1px) var(--lcd-pitch, 4px)),
      repeating-linear-gradient(90deg, rgba(20,24,12,.08) 0 var(--lcd-line, 1px), transparent var(--lcd-line, 1px) var(--lcd-pitch, 4px));
    background-position: var(--lcd-x, 0) var(--lcd-y, 0); }
  ha-card.lcd-on .lcd { display: block; }
  /* Ghosting (_ghostFrame, _ghostTrail): the pet's geometry, not its class. */
  .ghost { left: 50%; bottom: 4%; height: 62%; margin-left: -23.25%; transform-origin: 50% 100%;
    opacity: 0; display: none; transition: translate .25s ease-out .12s; }
  ha-card.lcd-on .ghost { display: block; }
  .ghost.wander-l { translate: -16% 0; transition-duration: .9s; }
  .ghost.wander-r { translate: 16% 0; transition-duration: .9s; }
  .screen.dim .ghost { filter: brightness(.8); }
  /* The backlight (_backlight): an Indiglo glow over the scene, under the bubble.
     It comes on at once and fades out; the dimmed scene brightens under it. */
  .glow { position: absolute; inset: 0; pointer-events: none; opacity: 0; mix-blend-mode: screen;
    background: radial-gradient(ellipse at 50% 55%, #4fe3c1 0%, rgba(79,227,193,.8) 45%, rgba(79,227,193,.35) 100%);
    transition: opacity .6s ease-out; }
  .screen.lit .glow { opacity: .55; transition: none; }
  /* By day a real backlight barely shows: a faint lift, not a mint wash. */
  .screen.lit:not(.night):not(.dim):not(.faded) .glow { opacity: .14; }
  .screen.lit:not(.night):not(.dim):not(.faded):not(.raining) .bg { filter: brightness(1.07); }
  .screen.lit.dim .bg, .screen.lit.faded .bg { filter: brightness(.9) saturate(.75); }
  .screen.lit.dim .pet, .screen.lit.dim .ghost { filter: brightness(.9); }
  /* Its button: a 44 px target, transparent, around a small domed cap cut on the grid
     (::before, see _mould) with a bulb on it in the shell's dark tone (::after). Each
     spot (--bx, --by: the cap's centre) keeps the target clear of the screen, the
     buttons and the label, and inside the slide. */
  .backlight { position: absolute; z-index: 1; width: 44px; height: 44px; padding: 0; border: none;
    border-radius: 8px; background: none; cursor: pointer; --bx: 22px; --by: 22px; }
  .backlight::before, .backlight::after { content: ""; position: absolute;
    left: round(var(--bx) - var(--px, 2px) * 4.5, var(--dpx, 1px)); top: round(var(--by) - var(--px, 2px) * 5, var(--dpx, 1px)); }
  .backlight::before { width: calc(var(--px, 2px) * 9); height: calc(var(--px, 2px) * 11);
    background: var(--bl-tones) 0 0 / 100% 100%, #fff7ec; clip-path: var(--bl-clip); }
  .backlight::after { width: calc(var(--px, 2px) * 5); height: calc(var(--px, 2px) * 7);
    margin: var(--px, 2px) 0 0 calc(var(--px, 2px) * 2); background: var(--d-dark);
    -webkit-mask: var(--hw-bulb) 0 0 / 100% 100%; mask: var(--hw-bulb) 0 0 / 100% 100%; }
  .backlight:active::before, .backlight:active::after { translate: 0 var(--px, 2px); }
  .device:has(.screen.lit) .backlight::before { background: var(--bl-tones) 0 0 / 100% 100%, #dffbf2; }
  .device:has(.screen.lit) .backlight::after { background: #1fbf9a; }
  /* Egg: on the shoulder, just above the screen's right corner. */
  .egg .backlight { right: -18px; top: -34px; --bx: 26px; --by: 27px; }
  .compact .egg .backlight { right: -14px; }
  /* Tank: on the lid's right grip. */
  .lid .backlight { left: calc(62% + 6px - 22px); top: -4px; --by: 14px; }
  .lid:has(.backlight) span:nth-of-type(3) { visibility: hidden; }
  /* House: on the chimney (over the roof's triangle). */
  .roof .backlight { right: calc(20% - 11px); top: 0; --by: 22px; }
  /* Porthole: the top-right rivet's place on the ring. */
  .porthole .backlight { left: calc(91.2% - 8px); top: calc(11% - 31px); --bx: 3px; --by: 36px; }
  /* Pad: on the upper right rim. */
  .pad .backlight { right: 18%; top: 4px; }
  /* Moon: on the crescent. */
  .crescent .backlight { left: 0; top: 10px; }
  /* Shell hardware (ui/shell_*.png; art/shell-parts/REQUEST.md): each slot is its greyscale
     --art, tinted from the shell by hard-light and cut out by the art's own alpha.
     Places are rounded to the grid, from the top left of the part. */
  .hw { position: absolute; display: none; z-index: -1; pointer-events: none; image-rendering: pixelated;
    --tint: var(--d-shell); --art: none; background: var(--art) 0 0 / 100% 100%, var(--tint);
    background-blend-mode: hard-light, normal;
    -webkit-mask: var(--art) 0 0 / 100% 100%; mask: var(--art) 0 0 / 100% 100%; }
  /* Screws at the corners of the boxy shells (the egg and the pad snap shut). */
  .hw.screws { inset: calc(var(--px) * 4); --s: calc(var(--px) * 5); --a: var(--hw-screw);
    background: var(--a) 0 0 / var(--s) var(--s) no-repeat, var(--a) 100% 0 / var(--s) var(--s) no-repeat,
      var(--a) 0 100% / var(--s) var(--s) no-repeat, var(--a) 100% 100% / var(--s) var(--s) no-repeat, var(--tint);
    background-blend-mode: hard-light, hard-light, hard-light, hard-light, normal;
    -webkit-mask: var(--a) 0 0 / var(--s) var(--s) no-repeat, var(--a) 100% 0 / var(--s) var(--s) no-repeat,
      var(--a) 0 100% / var(--s) var(--s) no-repeat, var(--a) 100% 100% / var(--s) var(--s) no-repeat;
    mask: var(--a) 0 0 / var(--s) var(--s) no-repeat, var(--a) 100% 0 / var(--s) var(--s) no-repeat,
      var(--a) 0 100% / var(--s) var(--s) no-repeat, var(--a) 100% 100% / var(--s) var(--s) no-repeat; }
  :is(.tank, .house, .porthole, .moon) .hw.screws { display: block; }
  .porthole .hw.screws { inset: calc(var(--px) * 7); }
  .moon .hw.screws { inset: calc(var(--px) * 6) calc(var(--px) * 5); }
  /* The egg mark between two speaker grilles, bottom centre, --hw-b cells up. */
  .body { --hw-b: 8; }
  .tank .body { --hw-b: 7; } .pad .body { --hw-b: 9; }
  .hw.logo, .hw.grille { display: block; top: round(down, 100% - var(--px) * (var(--hw-b) + 9), var(--px)); }
  .hw.logo { --art: var(--hw-logo); width: calc(var(--px) * 7); height: calc(var(--px) * 9);
    left: round(down, 50% - var(--px) * 3.5, var(--px)); }
  .hw.grille { --art: var(--hw-slot); width: calc(var(--px) * 10); height: calc(var(--px) * 5);
    margin-top: calc(var(--px) * 2); background-size: calc(var(--px) * 2) 100%, auto; background-repeat: repeat-x;
    -webkit-mask-size: calc(var(--px) * 2) 100%; mask-size: calc(var(--px) * 2) 100%;
    -webkit-mask-repeat: repeat-x; mask-repeat: repeat-x; }
  .hw.grille.left { left: round(down, 50% - var(--px) * 15.5, var(--px)); }
  .hw.grille.right { left: round(down, 50% + var(--px) * 5.5, var(--px)); }
  /* The world's emblem (full colour, so no tint and no mask) left of the grille, and the
     battery door's seam right of it, both on the grille's row. */
  .hw.emblem, .hw.battery { display: block; }
  .hw.emblem { --art: var(--hw-emblem); width: calc(var(--px) * 9); height: calc(var(--px) * 9);
    top: round(down, 100% - var(--px) * (var(--hw-b) + 9), var(--px)); left: round(down, 50% - var(--px) * 27.5, var(--px));
    background: var(--art) 0 0 / 100% 100%; -webkit-mask: none; mask: none; }
  .hw.battery { --art: var(--hw-battery); width: calc(var(--px) * 24); height: calc(var(--px) * 12);
    top: round(down, 100% - var(--px) * (var(--hw-b) + 11), var(--px)); left: round(down, 50% + var(--px) * 18.5, var(--px)); }
  /* No room for the seam where the bottom-corner trim sits on it (a compact card has none),
     nor beside the curve of the pad, or of a narrow egg. */
  .device.has-corner .hw.battery, .pad .hw.battery, .compact .egg .hw.battery { display: none; }
  /* Printed stripes across the top of the bezel (the porthole's ring has rivets). */
  .hw.stripes { display: block; --art: var(--hw-stripes); --tint: var(--d-bezel); top: var(--px);
    left: round(18%, var(--px)); width: round(down, 64%, var(--px)); height: calc(var(--px) * 3);
    background-size: var(--px) 100%, auto; background-repeat: repeat-x;
    -webkit-mask-size: var(--px) 100%; mask-size: var(--px) 100%; -webkit-mask-repeat: repeat-x; mask-repeat: repeat-x; }
  .porthole .hw.stripes { display: none; }
  /* The power light, left of the screen; dark with the lights out. */
  .hw.light { display: block; --art: var(--hw-light-on); --tint: #e8584a; left: calc(var(--px) * -7);
    top: round(down, 50% - var(--px) * 2.5, var(--px)); width: calc(var(--px) * 5); height: calc(var(--px) * 5); }
  .device:has(.screen.dim) .hw.light { --art: var(--hw-light-off); }
  @supports not (width: round(1px, 1px)) { .hw { display: none !important; } } /* placed on the grid with round() */
  .compact .egg .hw.light { display: none; } /* no margin left beside a narrow egg's screen */
  /* Clear: the board behind the screen, seen through the plastic round the bezel,
     and a glare on the plastic. */
  .hw.guts { inset: calc(var(--px) * -5); z-index: -2; -webkit-mask: none; mask: none; --gold: rgba(236,200,104,.6);
    background: repeating-linear-gradient(180deg, transparent 0 calc(var(--px) * 5), var(--gold) 0 calc(var(--px) * 6)),
      repeating-linear-gradient(90deg, transparent 0 calc(var(--px) * 13), var(--gold) 0 calc(var(--px) * 14)),
      rgba(40,128,84,.55);
    box-shadow: inset 0 0 0 var(--px) var(--gold); }
  .hw.glare { --art: var(--hw-glare); --tint: #fff; opacity: .6; width: calc(var(--px) * 8); height: calc(var(--px) * 8);
    top: round(7%, var(--px)); left: round(down, 84% - var(--px) * 8, var(--px)); }
  /* Glitter: three sets of flecks, each twinkling slowly on its own beat. */
  .hw.flecks { inset: 0; background: var(--tint); --f: calc(var(--px) * 5); --a: var(--hw-fleck);
    filter: drop-shadow(var(--px) var(--px) 0 rgba(48,24,64,.45)); animation: twinkle 3.2s step-end infinite; }
  .hw.flecks.a { --tint: #fff6c8;
    -webkit-mask: var(--a) round(30%, var(--px)) round(4%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(8%, var(--px)) round(40%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(93%, var(--px)) round(66%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(62%, var(--px)) round(96%, var(--px)) / var(--f) var(--f) no-repeat;
    mask: var(--a) round(30%, var(--px)) round(4%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(8%, var(--px)) round(40%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(93%, var(--px)) round(66%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(62%, var(--px)) round(96%, var(--px)) / var(--f) var(--f) no-repeat; }
  .hw.flecks.b { --tint: #ffd2e6; animation-duration: 4.4s; animation-delay: -1.3s;
    -webkit-mask: var(--a) round(70%, var(--px)) round(5%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(5%, var(--px)) round(72%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(94%, var(--px)) round(30%, var(--px)) / var(--f) var(--f) no-repeat;
    mask: var(--a) round(70%, var(--px)) round(5%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(5%, var(--px)) round(72%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(94%, var(--px)) round(30%, var(--px)) / var(--f) var(--f) no-repeat; }
  .hw.flecks.c { --tint: #c8f6e6; animation-duration: 5.6s; animation-delay: -2.1s;
    -webkit-mask: var(--a) round(46%, var(--px)) round(3%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(92%, var(--px)) round(48%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(6%, var(--px)) round(55%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(36%, var(--px)) round(95%, var(--px)) / var(--f) var(--f) no-repeat;
    mask: var(--a) round(46%, var(--px)) round(3%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(92%, var(--px)) round(48%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(6%, var(--px)) round(55%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(36%, var(--px)) round(95%, var(--px)) / var(--f) var(--f) no-repeat; }
  @keyframes twinkle { 0% { opacity: 1; } 40% { opacity: .25; } 55% { opacity: 1; } }
  .slide.away-slide .hw.flecks, ha-card.offscreen .hw.flecks { animation-play-state: paused; }
  @media (prefers-contrast: more) { ha-card.lcd-on .lcd, ha-card.lcd-on .ghost { display: none; } }
  /* Idle life. */
  .pet { transition: translate .25s ease-out, rotate .2s ease-out, scale .25s steps(2); }
  .pet.look { rotate: y 180deg; }
  .pet.wander-l { translate: -16% 0; transition-duration: .9s; }
  .pet.wander-r { translate: 16% 0; transition-duration: .9s; }
  /* The infrared link (_linkStart): the beam runs over the track between the two
     devices' top edges, where the backlight buttons sit, so it takes no taps. One
     world art pixel is --u; the sprites are 32 of them square. */
  .irbeam { position: absolute; pointer-events: none; z-index: 6; }
  .irbeam img { position: absolute; image-rendering: pixelated; pointer-events: none;
    width: calc(var(--u) * 32); height: calc(var(--u) * 32); }
  .irbeam .head { animation: ir-fly var(--ir-ms) steps(var(--ir-steps), end) forwards; }
  .irbeam .trail { opacity: 0; animation: ir-trail .01s steps(1, end) forwards; }
  .irbeam .arrive { opacity: 0; animation: ir-arrive .5s steps(4, end) forwards; }
  .irbeam.gone { opacity: 0; transition: opacity .3s steps(3, end); }
  /* Mono screen: the LCD (the screen, and the beam that flies over the glass) in the
     four tones; the plastic (shell, bezel, buttons, label, .request) keeps its colour.
     The beam's box is 1 px, so each of its images takes the filter. The backlight's
     blend, the grid and the ghost would flip or snap under the quantise: hidden here,
     and .mono-grid draws the grid again over the result. */
  .monodefs { position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none; }
  ha-card.mono .screen, ha-card.mono .irbeam img { filter: url(#hatch-mono4); }
  /* The backlight, in mono: the glow is hidden, so the lit screen takes a filter that
     lifts the scene about one tone before the quantise. */
  ha-card.mono .screen.lit { filter: url(#hatch-mono4-lit); }
  ha-card.mono .screen .glow, ha-card.mono .screen .lcd, ha-card.mono .screen .ghost { display: none; }
  .mono-grid { position: absolute; z-index: 1; pointer-events: none; display: none;
    left: var(--mg-x, 9px); top: var(--mg-y, 9px); width: var(--mg-w, 0); height: var(--mg-h, 0); border-radius: var(--mg-r, 12px);
    background-image:
      repeating-linear-gradient(0deg, rgba(20,24,12,.08) 0 var(--lcd-line, 1px), transparent var(--lcd-line, 1px) var(--lcd-pitch, 4px)),
      repeating-linear-gradient(90deg, rgba(20,24,12,.08) 0 var(--lcd-line, 1px), transparent var(--lcd-line, 1px) var(--lcd-pitch, 4px));
    background-position: var(--lcd-x, 0) var(--lcd-y, 0); }
  ha-card.lcd-on.mono .mono-grid { display: block; }
  /* Hidden where .lcd is covered in colour: the sheet, the boot screen and a game. */
  ha-card.lcd-on.mono .screen.show-status ~ .mono-grid,
  ha-card.lcd-on.mono .screen:has(.boot:not([hidden])) ~ .mono-grid,
  ha-card.lcd-on.mono .screen:has(.game:not([hidden])) ~ .mono-grid { display: none; }
  @media (prefers-contrast: more) { ha-card.lcd-on.mono .mono-grid { display: none; } }
  @keyframes ir-fly { to { translate: var(--ir-d) 0; } }
  @keyframes ir-trail { to { opacity: 1; } }
  @keyframes ir-arrive { 0% { opacity: 1; scale: .6; } 100% { opacity: 0; scale: 1.3; } }
  .visit { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
  .visit .vband { position: absolute; left: 0; right: 0; top: 38%; height: 20%; display: flex;
    align-items: center; justify-content: center; gap: 7%; background: color-mix(in srgb, var(--d-ink) 82%, transparent); }
  .visit .vband i { width: 4%; aspect-ratio: 1; background: #ffe9ec; animation: ir-dots .9s steps(1, end) infinite; }
  .visit .vband i:nth-child(2) { animation-delay: .15s; } .visit .vband i:nth-child(3) { animation-delay: .3s; }
  .visit .vband i:nth-child(4) { animation-delay: .45s; } .visit .vband i:nth-child(5) { animation-delay: .6s; }
  @keyframes ir-dots { 0%, 100% { opacity: .25; } 40% { opacity: 1; } }
  .visit .vguest { position: absolute; left: 70%; bottom: 4%; height: 62%; margin-left: -23.25%;
    transform-origin: 50% 100%; image-rendering: pixelated; animation: ir-in .5s steps(5, end) both; }
  .visit .vguest.out { animation: ir-out .5s steps(5, end) forwards; }
  .visit .vguest.greethop { animation: hop .7s ease-in-out 2; }
  @keyframes ir-in { from { translate: 160% 0; } }
  @keyframes ir-out { to { translate: 160% 0; } }
  /* The guest came from the left (UX8 F5): the visit is mirrored, the guest at 30% facing
     right, the host on the right facing left, the reply on the left. */
  .visit.left .vguest { left: 30%; animation-name: ir-in-l; }
  .visit.left .vguest.greethop { animation: hop .7s ease-in-out 2; }
  .visit.left .vguest.out { animation: ir-out-l .5s steps(5, end) forwards; }
  @keyframes ir-in-l { from { translate: -160% 0; } }
  @keyframes ir-out-l { to { translate: -160% 0; } }
  .visit.left .vsay { right: auto; left: 5%; }
  .visit .vsay { position: absolute; right: 5%; top: 27%; max-width: 46%; padding: 5px 9px; border-radius: 10px;
    background: #fff; color: #2a2a2a; font-size: 13px; line-height: 1.25; }
  ha-card.bigtext .visit .vsay { font-size: 15px; } /* UX8 F3 */
  .screen.linking .perch { display: none; }
  .pet.linking { translate: -43% 0; transition-duration: .5s; }
  .screen.linkleft .pet.linking { translate: 43% 0; }
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
  /* The house answers (H3): heat shimmer / cool wisps for 2.5 s. A stand-in for the art. */
  .screen.fx-heat::after, .screen.fx-cool::after { content: ""; position: absolute; inset: 0; z-index: 3;
    pointer-events: none; animation: house-fx 2.5s ease-in-out both; }
  .screen.fx-heat::after { background: repeating-linear-gradient(0deg, rgba(255,170,90,.0) 0 7px,
    rgba(255,150,60,.5) 7px 12px); background-size: 100% 22px; }
  .screen.fx-cool::after { background: repeating-linear-gradient(100deg, rgba(200,235,255,0) 0 12px,
    rgba(210,240,255,.6) 12px 16px); background-size: 40px 100%; }
  @keyframes house-fx { 0% { opacity: 0; transform: translateY(6px); } 8%, 70% { opacity: 1; }
    100% { opacity: 0; transform: translateY(-10px); } }
  @media (prefers-reduced-motion: reduce) { .screen.fx-heat::after, .screen.fx-cool::after { animation: none; opacity: .5; } }
  /* The robot vacuum (H4): a 22x12 rounded box, dark grey with a light rim and a blinking dot,
     gliding across the floor line in 6 s. A stand-in for the house_robot art. */
  .screen.fx-robot::before { content: ""; position: absolute; left: 0; bottom: 3%; z-index: 1; width: 22px; height: 12px;
    box-sizing: border-box; border-radius: 6px; border: 2px solid #ddd; pointer-events: none;
    background: radial-gradient(circle at 70% 50%, #f55 0 1.5px, transparent 2px) #444;
    animation: robot-cross 6s linear both, robot-blink 1s steps(1) infinite; }
  @keyframes robot-cross { from { translate: -30px 0; } to { translate: calc(var(--robot-w, 400px) + 30px) 0; } }
  @keyframes robot-blink { 50% { background-color: #444; background-image: none; } }
  /* A machine finished (H6): suds rise beside the pet (the bath scene's prop_bubbles, half size, reused
     as is) for washer and dishwasher; dryer is a warm swirl, a CSS stand-in for house_tumble. 2.5 s. */
  .screen.fx-suds::before, .screen.fx-suds::after { content: ""; position: absolute; bottom: 14%; z-index: 3; width: 38px; height: 64px;
    background: center bottom / contain no-repeat; image-rendering: pixelated; pointer-events: none;
    animation: suds-rise 2.5s ease-out both; }
  .screen.fx-suds::before { left: 72%; background-image: url(${BASE}/ui/prop_bubbles_1.png?v=${VERSION}); }
  .screen.fx-suds::after { left: 81%; background-image: url(${BASE}/ui/prop_bubbles_2.png?v=${VERSION}); animation-delay: .3s; }
  @keyframes suds-rise { 0% { opacity: 0; transform: translateY(14px); } 15%, 70% { opacity: 1; }
    100% { opacity: 0; transform: translateY(-34px); } }
  .screen.fx-tumble::after { content: ""; position: absolute; left: 74%; bottom: 22%; z-index: 3; width: 48px; height: 48px;
    border-radius: 50%; pointer-events: none; animation: tumble-spin 2.5s ease-in-out both;
    background: radial-gradient(circle at 70% 30%, #e86a8a 0 5px, transparent 6px),
      conic-gradient(from 0deg, rgba(255,200,120,.85), rgba(255,160,90,.2), rgba(255,200,120,.85)); }
  @keyframes tumble-spin { 0% { opacity: 0; transform: rotate(0) scale(.5); } 15%, 70% { opacity: 1; }
    100% { opacity: 0; transform: rotate(540deg) scale(1.1); } }
  @media (prefers-reduced-motion: reduce) { .screen.fx-suds::before, .screen.fx-suds::after, .screen.fx-tumble::after { animation: none; opacity: .7; } }
  @media (prefers-reduced-motion: reduce) { .screen.fx-robot::before { animation: none; left: 40%; } }
  /* A doorbell press (H5): two notes pop up above the pet's head for 1.8 s. A text stand-in for
     the house_chime art (H9). Still, and visible, under reduced motion. */
  .screen.fx-chime::after { content: "♪ ♫"; position: absolute; left: 58%; top: 26%; z-index: 3; translate: -50% 0;
    font-size: 20px; line-height: 1; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.6), 0 0 6px rgba(255,230,140,.8);
    pointer-events: none; animation: chime-pop 1.8s ease-out both; }
  @keyframes chime-pop { 0% { opacity: 0; transform: translateY(10px) scale(.6); } 15%, 70% { opacity: 1; transform: none; }
    100% { opacity: 0; transform: translateY(-12px); } }
  @media (prefers-reduced-motion: reduce) { .screen.fx-chime::after { animation: none; opacity: 1; } }
  /* Water worlds: lighter streaks, and rings where the drops land. */
  .screen.raining.watery .rain { opacity: .6; }
  .screen.raining.watery .rain::after { content: ""; position: absolute; inset: 0;
    background:
      radial-gradient(ellipse 10% 4% at 22% 80%, transparent 55%, rgba(255,255,255,.95) 62%, transparent 75%),
      radial-gradient(ellipse 10% 4% at 72% 70%, transparent 55%, rgba(255,255,255,.95) 62%, transparent 75%),
      radial-gradient(ellipse 10% 4% at 50% 90%, transparent 55%, rgba(255,255,255,.95) 62%, transparent 75%);
    animation: ripple 1.4s ease-out infinite; }
  @keyframes ripple { 0% { opacity: 0; transform: scale(.7); } 30% { opacity: 1; } 100% { opacity: 0; transform: scale(1.25); } }
  /* Off to one side, but never past the screen's edge: the pet's box is 46.5% of the screen,
     grown by --k (its scale) about its middle, so its edge reaches 0 at 107.5% - k * 50%. */
  .pet.go-left, .perch.go-left, .ghost.go-left, .screen .pat.go-left {
    translate: max(var(--go, 60%) * -1, var(--k, 1) * 50% - 107.5%) 0; }
  .pet.go-right, .perch.go-right, .ghost.go-right, .screen .pat.go-right {
    translate: min(var(--go, 60%), 107.5% - var(--k, 1) * 50%) 0; }
  /* What the pet stands on (species.json "perch"); it follows the pet around. */
  .perch, .screen .pat { transition: translate .25s ease-out; }
  .perch.wander-l, .screen .pat.wander-l { translate: -16% 0; transition-duration: .9s; }
  .perch.wander-r, .screen .pat.wander-r { translate: 16% 0; transition-duration: .9s; }
  .status { --sheet-bg: #e9e2c6; position: absolute; inset: 0; background: var(--sheet-bg); color: #2f3a24; padding: var(--sy, 9px) var(--sx, 12px);
    display: none; flex-direction: column; gap: 4px; font-size: 13px; overflow: auto; }
  .screen.show-status .status { display: flex; }
  /* The status draws as a handheld's menu does (UX fix 2, F13): four steps down on open, four
     across between its pages. Reduced motion makes both instant (the global rule). */
  @keyframes lcd-wipe-down { from { clip-path: inset(0 0 100% 0); } to { clip-path: inset(0); } }
  @keyframes lcd-wipe-side { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0); } }
  .status:focus { outline: none; } /* focused by a tap inside it, so Escape reaches it (UX fix 2, F4) */
  .screen .status.wipe-down { animation: lcd-wipe-down .16s steps(4) both; }
  .screen .status.wipe-side { animation: lcd-wipe-side .16s steps(4) both; }
  /* The backlight lights the menus too (F10): the sheet and its back band lift toward the glow's
     mint, a faint lift by day and a stronger one in the dark, fading out with the glow. */
  .status, .shead { transition: background-color .6s ease-out; }
  .screen.lit .status { --sheet-bg: color-mix(in srgb, #e9e2c6 55%, #dffbf2); }
  .screen.lit.night .status, .screen.lit.dim .status, .screen.lit.faded .status { --sheet-bg: color-mix(in srgb, #e9e2c6 15%, #dffbf2); }
  .screen.lit .status, .screen.lit .shead { transition: none; }
  .screen.show-status .bubble { display: none; }
  /* Power-on: a plain pale-green LCD with the logo, over everything on the screen. */
  .boot { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 14px; margin: 0; padding: 0; border: 0;
    border-radius: inherit; cursor: pointer; font: 400 14px 'Tiny5', monospace; color: #2f3a24;
    background: linear-gradient(rgba(47,58,36,.1) 1px, transparent 1px) 0 0 / 4px 4px,
      linear-gradient(90deg, rgba(47,58,36,.1) 1px, transparent 1px) 0 0 / 4px 4px, #c6d4a0; }
  .boot[hidden] { display: none; }
  /* The low-battery gag: a pixel battery (empty, one bar, full) top-right; the screen blanks twice. */
  .batt { position: absolute; top: 8px; right: 12px; z-index: 4; width: 36px; height: 18px;
    box-sizing: border-box; border: 3px solid #2f3a24; background: #c6d4a0; display: flex; gap: 3px;
    padding: 3px; pointer-events: none; }
  .batt[hidden] { display: none; }
  .batt::after { content: ""; position: absolute; right: -6px; top: 3px; width: 3px; height: 6px;
    background: #2f3a24; }
  .batt b { flex: 1; background: #2f3a24; visibility: hidden; }
  .batt[data-level="1"] b:first-child, .batt[data-level="3"] b { visibility: visible; }
  .batt[data-level="1"].blink b:first-child { animation: bootblink .8s steps(1) infinite; }
  .screen.blank > *:not(.batt) { visibility: hidden; }
  .booting .buttons, .booting .request { visibility: hidden; }
  .boot .logo { position: relative; font-size: 46px; line-height: 1; letter-spacing: 2px; }
  .boot .logo span { display: block; text-shadow: 2px 2px 0 rgba(47,58,36,.35); }
  .boot .logo .ink { color: #9aaa72; }
  .boot .logo .fill { position: absolute; inset: 0; color: #2f3a24; clip-path: inset(0 100% 0 0);
    transition: clip-path ${BOOT_FILL_MS}ms steps(8); }
  .boot.filling .logo .fill { clip-path: inset(0); }
  .boot .go { animation: bootblink 1.2s steps(1) infinite; }
  @keyframes bootblink { 50% { opacity: 0; } }
  /* The pet's request waits while the status screen or a game is up (it covered them). */
  .screen.show-status ~ .request, .screen:has(> .game:not([hidden])) ~ .request { display: none !important; }
  /* So does an open question: the pill sat over the third answer (UX fix 3, F1). */
  .screen:has(> .askday) ~ .request { display: none !important; }
  /* With a game up, the bubble leaves room for its close button. */
  .screen:has(> .game:not([hidden])) .bubble { max-width: 54%; }
  /* A narrow card: status rows fit four hearts. */
  .compact .row { grid-template-columns: 16px 70px minmax(0, 1fr); gap: 5px; }
  .compact .hearts img { flex-basis: 14px; width: 14px; }
  /* Every row: an icon slot (maybe empty), the label, the value; all on one grid. */
  .row { display: grid; grid-template-columns: 18px 84px minmax(0, 1fr); align-items: center; gap: 6px; }
  ha-card:not(.bigtext) .porthole .row { grid-template-columns: 16px 60px minmax(0, 1fr); gap: 5px; } /* the rim cuts the value column (UX8 F7) */
  .bar { height: 9px; border: 2px solid #2f3a24; padding: 1px; }
  .bar div { height: 100%; background: #2f3a24; }
  .hearts { letter-spacing: 2px; }
  .hearts .off { opacity: .25; }
  .jolder { display: block; border: none; background: none; padding: 0; min-height: 44px; min-width: 44px;
    font: 400 12px 'Tiny5', monospace; color: inherit; text-decoration: underline; cursor: pointer; }
  .jlink { align-self: flex-end; margin-top: 2px; border: none; background: none; padding: 0;
    min-height: 44px; min-width: 44px;
    font: 400 12px 'Tiny5', monospace; color: inherit; text-decoration: underline; cursor: pointer; }
  /* A sheet row (UX fix 1, F5): the label takes the room, the switch sits at the right edge,
     so the switches line up in one column; no empty icon slot. */
  .row.srow, .compact .row.srow { grid-template-columns: minmax(0, 1fr) fit-content(60%); }
  .srow > :last-child { justify-self: end; text-align: right; }
  /* The status view's gear and the settings sheet's back row and headings. */
  .shead { position: sticky; top: calc(var(--sy, 9px) * -1); z-index: 1; display: flex; align-items: center;
    margin-top: calc(var(--sy, 9px) * -1); padding-top: calc(var(--sy, 9px) - 6px); background: var(--sheet-bg); }
  /* The pet's head and name at the status band's left (UX fix 2, F10). */
  .who { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 13px; }
  .whohead { flex: none; width: 28px; height: 28px; image-rendering: pixelated;
    background: var(--say-img, none) var(--say-at, 0 0) / 128px 128px no-repeat; }
  .whoname { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gear { margin-left: auto; display: flex; align-items: center; justify-content: center;
    min-width: 44px; min-height: 44px; padding: 0 5px; border: none; background: none;
    color: inherit; cursor: pointer; }
  /* A deeper page's heading (journal, finds, every world), right of its back link (UX fix 2, F3). */
  .stitle { margin-left: auto; min-width: 0; padding: 0 0 0 8px; text-align: right; font-size: 12px; line-height: 1.1; }
  .sec.lc { text-transform: none; font-size: 12px; letter-spacing: 0; }
  .sback { border: none; background: none; padding: 0; min-height: 44px; min-width: 44px; color: inherit;
    font: 400 12px 'Tiny5', monospace; text-decoration: underline; cursor: pointer; }
  .sec { margin-top: 4px; padding-bottom: 2px; border-bottom: 2px dotted #2f3a24;
    font-size: 11px; letter-spacing: 1px; text-transform: uppercase; }
  /* The pet's shell: a swatch and its name; on a shared screen dimmed and dashed. */
  .sw { display: inline-block; flex: none; box-sizing: border-box; width: 26px; height: 20px;
    border: 2px solid #2f3a24; image-rendering: pixelated; }
  .shellrow, .shellro { display: inline-flex; align-items: center; gap: 5px; }
  .shellrow .sw, .shellro .sw { width: 18px; height: 14px; }
  .shellro { opacity: .6; }
  .shellro .sw { border-style: dashed; }
  .shellnote { font-size: 11px; }
  /* The shell picker: three tiles a row; a locked one dimmed and dashed. */
  .tiles { flex: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 4px; }
  .tiles:last-of-type { padding-bottom: 6px; } /* the last row scrolls clear of the bar */
  .tile { display: flex; flex-direction: column; align-items: center; gap: 0; min-width: 0;
    box-sizing: border-box; min-height: 44px; justify-content: center;
    padding: 1px; border: 2px solid transparent; border-radius: 6px; background: none; color: inherit;
    font: 400 11px 'Tiny5', monospace; line-height: 1; text-align: center; cursor: pointer; }
  .tile .tname { max-width: 100%; overflow-wrap: anywhere; }
  .tile .tsub { font-size: 10px; }
  .tile .tsub:empty { display: none; }
  .tile.sel { border-color: #2f3a24; }
  .tile.locked .sw { opacity: .45; border-style: dashed; }
  .tile.locked .tname { opacity: .65; }
  /* The picker's back row ("use" at its right end): a full-width band of the screen's own
     colour, so the list scrolls out of sight under it; its headings sit closer. */
  .status:has(.pback) { gap: 2px; }
  .status:has(.pback) .sec { margin-top: 1px; }
  .shead:has(.pback) { z-index: 2; margin: calc(var(--sy, 9px) * -1) calc(var(--sx, 12px) * -1) 0;
    padding: calc(var(--sy, 9px) - 9px) var(--sx, 12px) 0; }
  .puse { margin-left: auto; }
  .bell[aria-disabled="true"] { opacity: .55; cursor: default; }
  /* A narrow card: tighter still, so two whole rows of tiles show under the back row. */
  .compact .status:has(.pback) { gap: 1px; }
  .compact .status:has(.pback) .sec { margin-top: 0; padding-bottom: 1px; }
  .compact .tile { padding: 0 1px; font-size: 10px; }
  .compact .tile .tsub { font-size: 9px; }
  .bell { border: 2px solid #2f3a24; border-radius: 10px; background: none; color: inherit;
    font: 400 12px 'Tiny5', monospace; padding: 3px 10px; min-width: 44px; min-height: 44px;
    cursor: pointer; }
  .bell[aria-pressed="true"] { background: #2f3a24; color: #e9e2c6; }
  .bell.pending { opacity: .65; }
  /* The lay sheet (plan S2): the offer as a list; a choice made in HA is dashed, read-only. */
  .laylist { display: flex; flex-direction: column; gap: 4px; padding-bottom: 6px; }
  .laygo { margin-left: auto; }
  .layrow { box-sizing: border-box; width: 100%; text-align: left; }
  .layrow.ro { display: flex; align-items: center; border-style: dashed; cursor: default;
    background: #2f3a24; color: #e9e2c6; }
  .game button[aria-disabled="true"] { opacity: .55; }
  .status-feedback { position: sticky; bottom: 0; margin-top: auto; padding: 5px 7px;
    background: #2f3a24; color: #e9e2c6; font-size: 12px; min-height: 14px; }
  /* The pet speaking (F13): a bubble with its head, hung under the back band; taps go through. */
  .status-feedback.say { position: absolute; top: 100%; left: 0; right: 0; bottom: auto; margin: 2px 0 0;
    z-index: 3; pointer-events: none; display: flex; align-items: center; gap: 6px; min-height: 34px;
    box-sizing: border-box; padding: 3px 8px 3px 5px; border: 2px solid #2f3a24; border-radius: 10px;
    background: #fbf7e6; color: #2f3a24; line-height: 1.15; }
  .status-feedback.say[hidden] { display: none; }
  .status-feedback.say::before { content: ""; flex: none; width: 28px; height: 28px;
    background: var(--say-img, none) var(--say-at, 0 0) / 128px 128px no-repeat; image-rendering: pixelated; }
  .shead:has(.pback) .status-feedback.say { left: var(--sx, 12px); right: var(--sx, 12px); }
  .jdream, .stoday { font-size: 13px; color: var(--hp-subink); margin: 2px 0 4px; } /* today's dream, today's line (E9) */
  .jweek { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 13px; margin: 0 0 6px; } /* E14 */
  .jweek .wday { display: inline-flex; align-items: center; gap: 3px; }
  .jweek .wday b { font-weight: 600; font-size: 11px; opacity: .8; }
  .jweek img { width: 18px; height: 18px; image-rendering: pixelated; }
  .jgrid { display: flex; flex-wrap: wrap; gap: 6px 10px; }
  .jtile { display: flex; flex-direction: column; align-items: center; width: 64px; font-size: 11px;
    text-align: center; line-height: 1.1; }
  .jtile img { width: 48px; height: 48px; image-rendering: pixelated; }
  .jtile.locked img { filter: brightness(0); opacity: .3; }
  /* The journal's foot (back to the status, on to the finds) and the finds page (V-D):
     a visitor at 18 cells and a find at 16 (--px a cell: their art 1:1 in whole device
     pixels), the unmet ones dark silhouettes with no name, the viewer's gifts with a ♥. */
  .jfoot { display: flex; justify-content: flex-end; align-items: flex-end; }
  .flink, .wlink { align-self: flex-end; margin-top: 2px; border: none; background: none; padding: 0;
    min-height: 44px; min-width: 44px;
    font: 400 12px 'Tiny5', monospace; color: inherit; text-decoration: underline; cursor: pointer; }
  .fgrid { display: flex; flex-wrap: wrap; gap: 6px 8px; }
  .fgrid + .fgrid { margin-top: 4px; padding-top: 6px; border-top: 2px dotted #2f3a24; }
  .ftile { position: relative; display: flex; flex-direction: column; align-items: center;
    width: max(calc(var(--px, 2px) * 18), 62px); font-size: 11px; text-align: center; line-height: 1.1;
    overflow-wrap: break-word; }
  .ftile img { width: calc(var(--px, 2px) * 16); height: calc(var(--px, 2px) * 16); image-rendering: pixelated; }
  .ftile.vis img { width: calc(var(--px, 2px) * 18); height: calc(var(--px, 2px) * 18); }
  .ftile.locked img { filter: brightness(0); opacity: .3; }
  ha-card.mono .ftile.locked img { opacity: .5; }
  .ftile .fheart { position: absolute; top: 0; right: 0; font-size: 12px; line-height: 1; }
  .jlist { font-size: 12px; opacity: .9; display: flex; flex-direction: column; gap: 3px; }
  /* Big text (top10 4b): every size on the status box's pages, about 3 px up. */
  ha-card.bigtext .status { font-size: 16px; }
  ha-card.bigtext .status .log, ha-card.bigtext .status .jlist, ha-card.bigtext .status .photos,
  ha-card.bigtext .status .status-feedback, ha-card.bigtext .status .sback, ha-card.bigtext .status .jlink,
  ha-card.bigtext .status .flink, ha-card.bigtext .status .wlink, ha-card.bigtext .status .jolder,
  ha-card.bigtext .status .fheart { font-size: 15px; }
  ha-card.bigtext .status .layrow, ha-card.bigtext .status .laygo { font-size: 15px; }
  ha-card.bigtext .status .sec, ha-card.bigtext .status .shellnote, ha-card.bigtext .status .jtile,
  ha-card.bigtext .status .ftile, ha-card.bigtext .status .tile { font-size: 13px; }
  ha-card.bigtext .status .tile .tsub { font-size: 12px; }
  ha-card.bigtext.compact .status .tile { font-size: 12px; } /* "tidepool" whole in the porthole's three columns */
  ha-card.bigtext.compact .status .tile .tsub { font-size: 11px; }
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
  /* A long trait wraps rather than push its bar off the box (big text at 330, fm-batch-043). */
  .tnext .tname { min-width: 0; overflow-wrap: anywhere; }
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
  /* The hearts shrink to the value column (UX8 F7): five of them clipped in the porthole at 300. */
  .hearts img { flex: 0 1 18px; min-width: 0; width: 18px; height: auto; aspect-ratio: 1; image-rendering: pixelated; }
  /* A cap is a domed button cut on the grid (_mould): its face is the cap's own
     background, its side (below the box) and the light on it are pseudo-elements, and
     it sinks two cells when pressed. */
  .toy { gap: calc(var(--px, 2px) * 3 + 2px); }
  .toy .cap { position: relative; width: calc(var(--px, 2px) * var(--cap-n, 23));
    height: calc(var(--px, 2px) * var(--cap-n, 23)); display: flex; align-items: center; justify-content: center;
    background: #fff7ec; color: #3a2a1a; clip-path: var(--cap-clip); transition: transform .08s, background .2s; }
  .toy .cap::before, .toy .cap::after { content: ""; position: absolute; left: 0; top: 0; width: 100%;
    height: calc(var(--px, 2px) * (var(--cap-n, 23) + 3)); z-index: -1; pointer-events: none; }
  .toy .cap::before { background: var(--d-btn-shadow); clip-path: var(--cap-side); }
  .toy .cap::after { background: var(--cap-tones) 0 0 / 100% 100%; }
  .toy .cap > * { position: relative; }
  /* Pressed: held down for at least 160 ms so even a quick tap reads as a press. */
  .toy:active .cap, .toy.pressed .cap { transform: translateY(calc(var(--px, 2px) * 2));
    clip-path: var(--cap-clip-dn); transition-duration: .04s; }
  .toy:active .cap::before, .toy.pressed .cap::before { clip-path: var(--cap-side-dn); }
  .toy:active .cap::after, .toy.pressed .cap::after { background-image: var(--cap-tones-dn);
    height: calc(var(--px, 2px) * (var(--cap-n, 23) + 1)); }
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
  .screen .askday.many.wide { max-width: 100%; }
  .screen .askday.wide button { min-width: 52px; padding: 4px 6px; }
  .screen .askday.asktext input { font: inherit; font-size: 16px; min-height: 44px; width: 9.5em; max-width: 46%;
    border-radius: 14px; border: 2px solid #3a2a1a; padding: 2px 10px; box-sizing: border-box; } /* F1; 16 px: no iOS zoom */
  .compact .screen .askday { gap: 4px; bottom: 2%; }
  .compact .screen .askday.many { max-width: 100%; }
  .compact .screen .askday button { min-height: 44px; min-width: 44px;
    font-size: 12px; padding: 2px 7px; border-radius: 10px; }
  /* The birthday's steppers (F10): "‹ Feb ›", one chip each, 44 px keys either side. */
  .screen .askday .stepper { display: flex; align-items: center; border: 2px solid #3a2a1a; border-radius: 14px;
    background: #fffdf5; box-shadow: 0 4px 0 #3a2a1a; color: #3a2a1a; }
  .screen .askday .stepper output { min-width: 24px; padding: 0 3px; text-align: center; font-size: 14px; }
  .compact .screen .askday .stepper output { padding: 0; font-size: 13px; } /* both steppers fit one row at 330 */
  .screen .askday .stepper button.stepb { min-width: 44px; padding: 0; border: 0; background: transparent;
    box-shadow: none; font-size: 22px; border-radius: 12px; }
  .compact .screen .askday .stepper button.stepb { min-width: 40px; font-size: 20px; }
  /* The birthday: steppers, ok and skip in one row where the screen is wide enough (420), with
     slimmer keys (still 44 px tall); at 330 the steppers take one row and ok, skip the next. */
  ha-card:not(.compact) .screen .askday.bdaybox { gap: 4px; }
  .screen .askday.bdaybox .stepper button.stepb { min-width: 34px; }
  .screen .askday.bdaybox .stepper output { min-width: 0; padding: 0 2px; }
  ha-card:not(.compact) .screen .askday.bdaybox > button { min-width: 40px; padding: 4px 6px; }
  .screen .askday .stepper button.stepb:active { transform: none; background: #ffe9a8; }
  .screen .askday button { font: inherit; font-size: 14px; min-height: 44px; min-width: 64px; padding: 4px 10px;
    border-radius: 14px; border: 2px solid #3a2a1a; background: #fffdf5; color: #3a2a1a;
    box-shadow: 0 4px 0 #3a2a1a; transition: transform .08s, box-shadow .08s; }
  .screen .askday button:active { transform: translateY(3px); box-shadow: 0 1px 0 #3a2a1a; }
  /* Keeping its catchphrase can be a long label ("slow and steady"): smaller, and
     wrapping inside the button if it must, so the five choices stay in two rows. */
  .screen .askday button[data-answer="keep"] { font-size: 12px; white-space: normal;
    max-width: calc(100% - 72px); }
  .screen.show-status .askday { display: none; }
  /* In the porthole the round rim cuts a full-width row: the chips take the bubble's inset (F7). */
  .porthole .screen .askday { left: 4%; right: 4%; bottom: 6%; gap: 3px; }
  /* While it asks, the pet steps back (2 steps; none under reduced motion) so the chips
     don't hide it, and its perk then looks at you (F8). --k is its own scale. */
  .screen:has(> .askday) .pet, .screen:has(> .askday) .perch, .screen:has(> .askday) .ghost {
    translate: var(--ask-dx, 0px) var(--ask-dy, -14%); /* _askPlace measures the chips and the bubble */
    scale: calc(var(--k, 1) * var(--ask-f, .9)) !important; } /* !important: the species scale is inline */
  .screen:has(> .askday) .pet { transition: translate .25s steps(2), rotate .2s ease-out, scale .25s steps(2); }
  /* Big text reaches the pet's words too (F9). */
  ha-card.bigtext .bubble { font-size: 16px; }
  /* Big text reaches the game (UX fix 6, F10): the score, the guess labels and the picker. */
  ha-card.bigtext .game .gscore { font-size: 14px; }
  ha-card.bigtext.compact .game .gscore.two { font-size: 12px; }
  ha-card.bigtext .game .hl { font-size: 16px; }
  ha-card.bigtext .game .gpick.wrap button { font-size: 14px; }
  ha-card.bigtext .game .gpick.wrap.tight button { font-size: 13px; }
  ha-card.bigtext .screen .askday button { font-size: 15px; }
  .screen .bondhearts img, .screen .linkhearts img { position: absolute; left: calc(50% + var(--x)); top: 52%; width: 18px; height: auto;
    opacity: 0; image-rendering: pixelated; pointer-events: none; z-index: 2; animation: bondheart 1.6s ease-out forwards; }
  @keyframes bondheart { 0% { transform: translateY(0) scale(.7); opacity: 0; } 20% { opacity: 1; }
    100% { transform: translateY(-70px) scale(1); opacity: 0; } }
  .pet.perk { animation: perk .3s ease-out; }
  .pet.spin { animation: spin .9s ease-in-out; } /* an adult's trick (fresh-expand LS-a) */
  .pet.bighop { animation: bighop .7s ease-in-out 2; } /* the promise's payoff (F3): 1.4x a hop */
  @keyframes bighop { 50% { transform: translateY(-12.6%); } }
  @keyframes spin { to { rotate: y 360deg; } }
  @keyframes perk { 40% { transform: translateY(-6%) scale(1.04, .96); } }
  .toy.wanted .cap { background: #ffe9a8; }
  /* Wanted: a ring of light round the cap, cut on the grid too. */
  .toy.wanted::before { content: ""; position: absolute; top: calc(var(--px) * -2); left: calc(var(--cap-x, 0px) - var(--px) * 2);
    z-index: -1; width: calc(var(--px) * (var(--cap-n) + 4)); height: calc(var(--px) * (var(--cap-n) + 7));
    background: #ffd76a; clip-path: var(--cap-halo);
    pointer-events: none; }
  .toy.on .cap { background: #3a2a1a; color: #ffe9a8; }
  .toy[disabled] { opacity: .45; cursor: default; }
  .compact .toy { font-size: 12px; }
  .compact .egg .body { padding: 28px 14px 32px; }
  .warn { padding: 16px; color: var(--error-color, #c00); background: var(--card-background-color); }
`;

// Care scenes (_sceneStart): their props come and go with the scene and are placed
// each frame by _sceneRender; art is sized by its art pixels (_sceneArt).
const SCENE_STYLE = `
  .screen img.scene { left: 0; bottom: 3%; height: 0; }
  .screen img.scene-pill { left: 74%; bottom: 6%; height: 22%; }
  .screen .scene-gone { visibility: hidden; }
  .scene-spark { position: absolute; width: 6%; aspect-ratio: 1; opacity: 0; pointer-events: none;
    background: #fff6c8; filter: drop-shadow(0 0 2px #ffd76a);
    clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%); }
`;

class HatchPetCard extends HTMLElement {
  static getStubConfig() {
    return {};
  }

  static getConfigElement() {
    return document.createElement("hatch-pet-card-editor");
  }

  setConfig(config) {
    if (!pruneDatedKeys.done) {
      pruneDatedKeys.done = true;
      this._pruneKeys();
    }
    this._config = config || {};
    this._sig = null;
    this._epoch = (this._epoch || 0) + 1; // every slide draws again
    this._index = this._index || 0;
  }

  _pruneKeys() {
    pruneDatedKeys();
  }

  getCardSize() {
    return 9;
  }

  getGridOptions() {
    return { columns: 6, min_columns: 6, rows: "auto" };
  }

  set hass(hass) {
    this._hass = hass;
    if (this._resumedAt && !document.hidden && hass?.states !== this._resumeStates) {
      this._resumedAt = this._resumeStates = null; // fresh states: the look may begin
    }
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
    if (document.hidden) {
      (this._slides || []).forEach((x) => this._stopTyping(x));
      this._hiddenAt ??= Date.now();
      return;
    }
    // Back after a long while (owner Q1): a new look, as a fresh page would have, a gift
    // waiting too (fresh-moment 1). The look waits for fresh states (RESUME_HOLD_MS at
    // most): a phone back from sleep holds yesterday's, and a set hass with the same
    // states object (a connection change) isn't fresh.
    if (this._hiddenAt && Date.now() - this._hiddenAt >= AWAY_NOTE_AFTER_MS) {
      this._newLook(this._slides || [], { resumed: true });
      this._resumedAt = Date.now();
      this._resumeStates = this._hass?.states;
    }
    this._hiddenAt = null;
    this._touchedAt = null; // a new look begins at its first touch (gaps-seams 5a)
  };

  connectedCallback() {
    followTextSweep(); // M1: no typed words past their day
    this._timer = setInterval(() => this._tick(), 700);
    if (this._card) document.addEventListener("visibilitychange", this._onHidden);
    if (this._resize && this._viewport) this._resize.observe(this._viewport);
    if (this._io && this._card) this._io.observe(this._card);
    // A shared screen turned on in another card on this page, or another tab.
    window.addEventListener(SHARED_EVENT, this._onSharedEvent);
    window.addEventListener("storage", this._onSharedStorage);
    // Mono screen turned on or off in another card on this page, or another tab
    // (or while the card was away).
    window.addEventListener(MONO_EVENT, this._onMono);
    window.addEventListener("storage", this._onMonoStorage);
    this._card?.classList.toggle("mono", monoOn());
    this._card?.classList.toggle("bigtext", bigOn());
    // Shared screen turned on or off while the card was away (its listeners
    // were off): catch up now, before a queued personal line is said.
    if (this._slides?.length && sharedScreen() !== this._sharedSeen) {
      if (sharedScreen()) this._goShared();
      else this._goPersonal();
    }
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
    this._linkEnd();
    this._resize?.disconnect();
    this._io?.disconnect();
    document.removeEventListener("visibilitychange", this._onHidden);
    window.removeEventListener(SHARED_EVENT, this._onSharedEvent);
    window.removeEventListener("storage", this._onSharedStorage);
    window.removeEventListener(MONO_EVENT, this._onMono);
    window.removeEventListener("storage", this._onMonoStorage);
    this._listenReady(null);
    // A game stops with the card, and so
    // does a line typing out, and the private channel.
    for (const s of this._slides || []) {
      if (s.game) this._endGame(s, null);
      this._stopTyping(s);
      this._powerEnd(s);
      s.powerPending = null;
      this._dropPhotos(s);
      this._giftPopEnd(s); // a take on its way, or its line, is still said on return
      this._dropFinds(s);
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
      if (!s.gone) this._subscribe(s, true); // a removed pet stays unasked
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
      this._powerEnd(s);
      s.powerPending = null;
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
      this._powerNews(s);
      s.subscribed = true;
      s.subscribeFailed = false;
      s.retries = 0;
      clearTimeout(s.waitTimer);
      s.waitTimer = null;
    } else {
      if ("mine" in msg) s.mine = shared ? null : msg.mine || null;
      if ("house" in msg) {
        s.house = msg.house || null;
        this._powerNews(s);
        this._basketSync(s); // a basket emptied on another screen just goes, no line
      }
      const m = msg.moment;
      if (m?.type) {
        // Said only if it's new here and just happened (the server's clock).
        const fresh = serverNow() - new Date(m.at).getTime() < 15000;
        if (MEDIA_MOMENTS.has(m.type)) {
          if (!s.mediaSeen) s.mediaSeen = new Set();
          if (!s.mediaSeen.has(m.at)) {
            s.mediaSeen.add(m.at);
            if (fresh) this._channelMoment(s, m);
          }
        } else if (this._keepMoment(s, m) && fresh) {
          this._channelMoment(s, m);
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

  // A channel moment is said now, or after the boot screen (only the speaking
  // waits, as _greet does).
  _channelMoment(s, m) {
    if (this._booting) (s.bootMoments ||= []).push(m);
    else this._moment(s, m);
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
    this._sharedSeen = sharedScreen(); // what the card last saw (connectedCallback)
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${STYLE}${SCENE_STYLE}</style>${MONO_FILTER}
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
    this._card.classList.toggle("lcd-on", lcdOn());
    this._card.classList.toggle("mono", monoOn());
    this._card.classList.toggle("bigtext", bigOn());
    // The shell hardware's art: ui/shell_<part>.png, drawn by art/shell-parts/make_parts.py (see REQUEST.md there).
    const ui = (name) => `url("${BASE}/ui/${name}.png?v=${VERSION}")`;
    for (const k of ["screw", "slot", "stripes", "fleck", "glare", "logo", "plate", "battery", "light_on", "light_off"])
      this._card.style.setProperty(`--hw-${k.replace("_", "-")}`, ui(`shell_${k}`));
    this._card.style.setProperty("--hw-bulb", ui("backlight_bulb"));
    this._card.style.setProperty("--glitter", glitterTile());
    for (const [k, v] of printTiles()) this._card.style.setProperty(k, v);
    this._viewport = root.querySelector(".viewport");
    this._track = root.querySelector(".track");
    // Once a slide comes to rest, its shell's parts are put back on whole device pixels.
    this._track.addEventListener("transitionend", (e) => {
      const s = this._slides[this._index];
      if (s?.px && (e.target === this._track || e.target === s.el)) this._mould(s);
    });
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
    let startY = 0;
    this._viewport.addEventListener("pointerdown", (e) => {
      startX = e.clientX;
      startY = e.clientY;
      this._swiped = false;
    });
    this._viewport.addEventListener("pointerup", (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      startX = null;
      // A swipe is mostly sideways: a mostly vertical drag is someone reading or selecting (UX fix 2, F6).
      if (Math.abs(dx) > 40 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
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
    // Someone is watching (gaps-seams 5a): a tap or swipe; the first after a gap starts a look.
    this._card.addEventListener("pointerdown", () => {
      const now = Date.now();
      if (!this._touchedAt || now - this._touchedAt >= LINK_TOUCHED_MS) this._lookAt = now;
      this._touchedAt = now;
    }, true);
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
        <div class="roof"><i class="mould"></i></div><div class="crescent"><i class="mould"></i></div><div class="loop"><i class="mould"></i></div><div class="lid"><i class="mould"></i><span></span><span></span><span></span></div>
        <div class="body"><i class="mould"></i>
          <i class="hw screws"></i><i class="hw glare"></i>
          <i class="hw grille left"></i><i class="hw grille right"></i><i class="hw logo"></i><i class="hw emblem"></i><i class="hw battery"></i>
          <i class="hw flecks a"></i><i class="hw flecks b"></i><i class="hw flecks c"></i>
          <img class="trim-top" alt=""><img class="trim-top2" alt="">
          <span class="label"></span>
          <div class="bezel"><i class="hw guts"></i><i class="mould"></i><i class="hw stripes"></i><i class="hw light"></i><div class="screen">
            <img class="bg" alt="">
            <img class="awaysign" alt=""><div class="awaylabel"></div>
            <div class="season"></div>
            <img class="poop p0" alt="mess"><img class="poop p1" alt="mess"><img class="poop p2" alt="mess">
            <img class="perch" alt="">
            <img class="ghost" alt="">
            <img class="pet" alt="">
            <img class="prop" alt="">
            <img class="murk" alt="">
            <div class="rain"></div>
            <div class="flash"></div>
            <div class="breeze"><span></span><span></span><span></span></div>
            <div class="lcd"></div>
            <div class="glow"></div>
            <img class="attention" alt="wants attention">
            <div class="bubble"></div>
            <div class="sr" role="status"></div>
            <button class="pat" type="button" hidden></button>
            <button class="basket" type="button" aria-label="the basket" hidden><img alt=""></button>
            <div class="game" hidden>
              <div class="gpick" role="group" aria-label="Pick a game">${GAMES.map((g) =>
                `<button data-game="${g.key}">${g.label}</button>`).join("")}</div>
              <img class="gprop" alt="" hidden>
              <span class="gnum" aria-live="polite" hidden></span>
              <button class="gl" aria-label="Guess left">${icon("prev", 22)}</button>
              <span class="gscore" aria-live="polite"></span>
              <button class="gr" aria-label="Guess right">${icon("next", 22)}</button>
              <button class="gx" aria-label="Stop the game">✕</button>
            </div>
            <div class="status" tabindex="-1"></div>
            <i class="batt" data-level="1" aria-hidden="true" hidden><b></b><b></b><b></b></i>
            <button class="boot" hidden><span class="logo"><span class="ink">HATCH</span><span class="fill" aria-hidden="true">HATCH</span></span><span class="go">▶ tap to start</span></button>
          </div><div class="mono-grid"></div><button class="request"></button></div>
          <div class="buttons"></div>
          <img class="trim-corner left" alt=""><img class="trim-corner right" alt="">
        </div>
        <div class="feet"><span><i class="mould"></i></span><span><i class="mould"></i></span></div>
      </div>`;
    const q = (sel) => slide.querySelector(sel);
    const s = {
      el: slide, device: q(".device"), label: q(".label"), screen: q(".screen"), bg: q(".bg"),
      awaysign: q(".awaysign"), awaylabel: q(".awaylabel"), pet: q(".pet"), prop: q(".prop"),
      perch: q(".perch"), ghost: q(".ghost"), monoGrid: q(".mono-grid"), pat: q(".pat"),
      attention: q(".attention"), bubble: q(".bubble"), status: q(".status"),
      poops: [...slide.querySelectorAll(".poop")], murk: q(".murk"), buttons: {}, frame: 0,
      request: q(".request"), gameBox: q(".game"), gameScore: q(".gscore"), gameNum: q(".gnum"),
      propEl: q(".gprop"), live: q(".sr[role=status]"), seasonBox: q(".season"),
      basket: q(".basket"),
    };
    // The LCD grid: one cell per world art pixel, measured on the screen itself
    // (its width depends on the shell's padding as well as the slide's).
    s.lcdSize = new ResizeObserver(() => this._lcdPitch(s));
    s.lcdSize.observe(s.screen);
    s.lcdSize.observe(q(".body")); // and the shell is cut again when it changes size
    // The backlight: a real button on the shell (each shape has its spot, see
    // _renderSlide). Card only: it lights the screen and nothing else.
    s.backlight = document.createElement("button");
    s.backlight.className = "backlight";
    s.backlight.setAttribute("aria-label", "Backlight");
    s.backlight.title = "Light up the screen";
    s.backlight.addEventListener("click", (e) => {
      if (s !== this._slides[this._index]) return; // a neighbour's: the tap brings it forward
      e.stopPropagation();
      this._backlight(s);
    });
    slide.querySelectorAll("img").forEach((img) => img.addEventListener("error", () => {
      const src = img.getAttribute("src");
      if (src && !WARNED.has(src)) {
        WARNED.add(src);
        console.warn("hatch-pet-card: missing sprite", src);
      }
    }));
    // The perch moves where the pet moves (wandering, the game) and grows with it;
    // so does the ghost, a beat behind (see _ghostTrail).
    const PERCH_MOVES = ["wander-l", "wander-r", "go-left", "go-right"];
    new MutationObserver(() => {
      const moved = PERCH_MOVES.some((c) => s.ghost.classList.contains(c) !== s.pet.classList.contains(c));
      for (const c of PERCH_MOVES) {
        s.perch.classList.toggle(c, s.pet.classList.contains(c));
        s.ghost.classList.toggle(c, s.pet.classList.contains(c));
        s.pat.classList.toggle(c, s.pet.classList.contains(c));
      }
      s.perch.style.scale = s.ghost.style.scale = s.pat.style.scale = s.pet.style.scale;
      s.screen.style.setProperty("--k", s.pet.style.scale || 1); // go-left / go-right stop at the edge
      if (moved) this._ghostTrail(s);
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
    // A pat (PR 3b): a tap on the pet itself, card only. A tap beside it still opens the status.
    s.pat.addEventListener("click", (e) => this._pat(s, e));
    // The basket (visitors v2 §3): its own button, never a pat, never the status.
    s.basket.addEventListener("click", (e) => this._basketTap(s, e));
    // The CSS hides it at once for a game, a question or the status; if it had focus,
    // that goes to the Status button rather than to the page.
    s.pat.addEventListener("focusout", (e) => {
      if (!e.relatedTarget && !this._patOn(s)) this._card?.querySelector(".statusbtn")?.focus();
    });
    // Taps on the game mustn't reach the screen behind (which opens the status).
    s.gameBox.addEventListener("click", (e) => e.stopPropagation());
    s.gameBox.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && s.game) this._quitGame(s, this._quitLine(s));
    });
    // The settings sheet and its picker keep the player's place (UX fix 1, F1/F2): a tap
    // that misses a button (a label, a gap, a note) must not fall through to the screen's
    // "tap = Status". The Status chip, "‹ settings" and Escape are the ways out.
    // The journal, finds and every-world pages are deeper pages and keep it the same way
    // (UX fix 2, F1): a tap on a tile or a heading is not a tap on the screen.
    s.status.addEventListener("click", (e) => {
      if ((s.settings || s.journal || s.finds || s.everyWorld) && !s.laySheet) e.stopPropagation();
    });
    // Escape steps back one page, like the back link (UX fix 2, F4): a sheet or picker to
    // where it came from, every world and finds to the journal, the journal to the status,
    // and the status closes with focus on its chip. The lay sheet keeps its own way out.
    s.status.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || s.laySheet) return;
      e.preventDefault();
      const back = s.status.querySelector(".sback");
      if (back && (s.settings || s.journal || s.finds || s.everyWorld)) {
        back.click(); // back from the picker, the sheet (F8) or a journal page
        return;
      }
      this._toggleStatus(s);
      this._card.querySelector(".statusbtn")?.focus({ preventScroll: true });
    });
    q(".gl").addEventListener("click", () => this._guess(s, "left"));
    q(".gr").addEventListener("click", () => this._guess(s, "right"));
    q(".gx").addEventListener("click", (e) => {
      this._tapped(e.currentTarget, s);
      this._quitGame(s, this._quitLine(s));
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
      // With a choice of two or more creatures, laying goes through the lay sheet (S2).
      if (key === "lay_egg" && (this._eggOffer(s)?.offered.length || 0) >= 2) {
        this._tapped(s.request, s);
        this._openLay(s);
        return;
      }
      if (key === "lay_egg") this._tapped(s.request, s);
      if (key === "lay_egg") {
        const armed = confirmArmed(s, key);
        if (!this._confirmed(s, key, s.request, () => this._redraw(s))) {
          // The pet itself answers the first tap (F12); the pill keeps "sure? tap again".
          if (!armed) {
            this._line(s, MINE, TALK_COPY.layArmed, 4000);
            this._animate(s, s.pet, "perk", 320);
          }
          return;
        }
      }
      this._press(s, key);
    });
    // The boot screen takes the tap (a button, so a key works too) and nothing under it.
    s.batt = q(".batt");
    s.boot = q(".boot");
    s.boot.hidden = !this._booting;
    s.boot.addEventListener("click", (e) => {
      e.stopPropagation();
      this._bootEnd(true);
    });
    // A tap on the screen is a shortcut for the Status button; it holds buttons of its
    // own (the game, the bell, the journal), so it isn't a button itself.
    s.screen.addEventListener("click", () => {
      // A game on show keeps its screen: a stray tap must not end it unseen (the
      // Status button still does, on purpose).
      if (s.game) return;
      // A tap on a visit in progress is a pat on the host, not the Status button: it
      // would end the hello (UX8 F1).
      if (s.linking) {
        if (!this._swiped) this._perk(s);
        return;
      }
      // A question's chips take no stray tap (F3); a tap right after an answer is its
      // double tap, not the Status button (F2), so the pet's reply is seen.
      if (this._questionOn(s) || Date.now() - (s.answeredAt || 0) < CONFIRM_GAP_MS) return;
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

  // --- Low battery after an HA restart ---------------------------------------

  // The channel's house view carries the server's last power-on (`at`), or
  // nothing (no news: the stored marker is never cleared). Compared with this
  // browser's marker for the pet in one synchronous step, so of two slides or
  // tabs only one finds it new. A browser with no marker only stores it.
  _powerNews(s) {
    const at = s.house?.powered_on?.at;
    const t = Date.parse(at);
    const device = s.ids?.device;
    if (!at || Number.isNaN(t) || !device) return;
    let seen = null;
    try {
      seen = localStorage.getItem(POWER_KEY + device);
      if (seen !== null && t <= Date.parse(seen)) return;
      localStorage.setItem(POWER_KEY + device, at);
    } catch (err) {
      return; // no storage: no gag
    }
    if (seen === null || serverNow() - t >= POWER_FRESH_MS) return;
    s.powerPending = at;
  }

  // Once the pet on show is awake and free, the gag plays; an asleep pet waits
  // (at most POWER_DEFER_MS from the boot). A call or a game cuts it short.
  _powerTick(s) {
    if (s.power && (s.asleep || s.calling || s.game)) this._powerEnd(s, true);
    if (!s.powerPending || s.power) return;
    if (serverNow() - Date.parse(s.powerPending) >= POWER_DEFER_MS) {
      s.powerPending = null;
      return;
    }
    if (this._booting || s.asleep || s.calling || s.game || s.scene || s.linking || !s.species ||
        this._eggMinutes(this._state(s, "sensor.life_stage")) !== null ||
        s.screen.classList.contains("show-status") || !this._visible || document.hidden) return;
    s.powerPending = null;
    this._powerGag(s);
  }

  _powerGag(s) {
    const isCalm = calm();
    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    s.power = { timers };
    this._patSync(s, true); // no pat over the gag
    const level = (n, blink) => {
      s.batt.dataset.level = String(n);
      s.batt.classList.toggle("blink", blink && !isCalm);
    };
    const sp = s.species;
    if (sp?.moods?.includes("sleepy") && s.drawn) {
      s.poseFrames = [];
      for (let i = 1; i <= (sp.frames || 1); i++) s.poseFrames.push(`${s.drawn}_sleepy_${i}`);
      s.poseUntil = Date.now() + 2200;
      this._show(s, s.pet, s.poseFrames[0]);
    }
    level(1, true);
    s.batt.hidden = false;
    if (!isCalm) {
      for (const t of [0, 160]) {
        at(t, () => s.screen.classList.add("blank"));
        at(t + 80, () => s.screen.classList.remove("blank"));
      }
    }
    at(0, () => this._speak(s, pick(POWER_LINES.low), 2000));
    at(2200, () => {
      if (s.calling || s.game || s.asleep) return this._powerEnd(s, true);
      s.poseUntil = 0;
      if (!isCalm) level(3, false);
      this._speak(s, pick(POWER_LINES.back), 1800);
      this._animate(s, s.pet, "perk", 320);
    });
    at(4200, () => this._powerEnd(s, false));
  }

  // The gag over, or cut short: the battery goes, and so do lines not yet said.
  _powerEnd(s, abort = true) {
    const power = s.power;
    if (!power) return;
    s.power = null;
    this._patSync(s);
    power.timers.forEach(clearTimeout);
    s.screen.classList.remove("blank");
    s.batt.hidden = true;
    s.poseUntil = 0;
    if (abort) { // cut short: the line in the bubble goes; a finished gag leaves its last line to run out
      this._stopTyping(s);
      s.sayUntil = 0;
    }
  }

  // --- Power-on --------------------------------------------------------------

  _bootStart() {
    this._booting = true;
    this._card.classList.add("booting");
    this._slides.forEach((x) => { x.boot.hidden = false; });
    this._bootTimer = setTimeout(() => this._bootEnd(false), BOOT_WAIT_MS);
  }

  // A tap ends it with the beep (if this browser has sounds on and the pet may
  // make one); no tap for BOOT_WAIT_MS ends it silently. The logo fills in, then
  // the screen cuts to the pet.
  _bootEnd(tapped) {
    if (!this._booting || this._bootEnding) return;
    this._bootEnding = true;
    clearTimeout(this._bootTimer);
    if (tapped) {
      try {
        unlockAudio();
      } catch (err) {
        // no WebAudio
      }
      this._chirp(this._slides[this._index], "boot");
    }
    const finish = () => {
      this._booting = false;
      this._bootEnding = false;
      this._card.classList.remove("booting");
      this._slides.forEach((x) => {
        x.boot.hidden = true;
        x.boot.classList.remove("filling");
      });
      // The channel's moments that came in meanwhile, said now.
      this._slides.forEach((x) => {
        const held = x.bootMoments || [];
        x.bootMoments = [];
        held.forEach((m) => this._moment(x, m));
      });
    };
    if (calm()) {
      finish();
      return;
    }
    this._slides.forEach((x) => x.boot.classList.add("filling"));
    setTimeout(finish, BOOT_FILL_MS);
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
      const configured = [].concat(
        this._config.entities || [], this._config.entity || [], this._config.devices || []).length;
      // No pets yet: the first world's toy, empty, with an egg's silhouette on its screen (F5).
      const keep = !configured && this._slides.length === 1 && this._slides[0].empty;
      if (!keep) while (this._slides.length) this._dropSlide(this._slides.pop());
      this._card.classList.add("single");
      this._card.querySelector(".chips").style.display = "none";
      this._card.querySelector(".title").textContent = configured ? "Pet not found" : "No pets yet";
      // Plain card text, not the pet's voice (F6): who can add a pet, and no "entities".
      this._card.querySelector(".sub").textContent = configured
        ? "The pets this card shows aren't here any more. Edit the card to pick them again."
        : this._hass.user?.is_admin === false
          ? "Ask whoever runs Home Assistant to add a pet."
          : "Add the Virtual Pet integration to hatch one.";
      if (configured) {
        this._emptyToken = null;
      } else if (keep) {
        this._renderSlide(this._slides[0]);
        this._renderShelf();
      } else {
        this._emptyDevice();
      }
      return;
    }
    this._emptyToken = null;
    if (this._slides[0]?.empty) this._dropSlide(this._slides.pop()); // a pet moved in
    let worlds;
    if (!this._slides.length) this._waiting("Hatch at Home"); // worlds.json pending: not a blank card (F11)
    try {
      worlds = await loadJson("worlds.json");
    } catch (err) {
      this._sig = null; // try again on the next update
      this._waiting("Hatch at Home");
      return;
    }
    this._worlds = worlds; // every world's (a find, its art and lines, is its own world's)
    // Every pet is still reloading and none has shown yet: its world is unknown, so no slide
    // is drawn (not the first world's) until the stage has one. The card keeps its title.
    if (devices.every((d, i) => !this._slides[i]?.world &&
        GONE_STATES.has(this._hass.states[d["sensor.life_stage"]]?.state))) {
      this._waiting("Hatch at Home");
      return;
    }
    this._card.querySelector(".chips").style.display = "";
    while (this._slides.length < devices.length) this._slides.push(this._buildSlide());
    while (this._slides.length > devices.length) this._dropSlide(this._slides.pop());
    if (!this._bootChecked) {
      this._bootChecked = true;
      if (claimBoot()) this._bootStart();
    }
    if (!this._shelfRestored) { // the pet that was on show before a reload (UX fix 2, F8)
      this._shelfRestored = true;
      const at = devices.findIndex((d) => d.device === shelfRead(devices));
      if (at > 0) this._index = at;
    }
    this._index = Math.min(this._index, devices.length - 1);
    this._shelfDevices = devices.map((d) => d.device);

    for (let i = 0; i < devices.length; i++) {
      const s = this._slides[i];
      if (s.ids && s.ids.device !== devices[i].device) {
        this._forget(s); // another pet now
        s.worldKey = null;
      }
      s.ids = devices[i];
      this._subscribe(s); // its private channel (once: a no-op after that)
      const stage = this._state(s, "sensor.life_stage");
      s.reloading = GONE_STATES.has(stage?.state); // reloading or restarting: no attributes (UX fix 4, F1)
      // A state with no world keeps the slide's last one (a reload must not move the pet home).
      s.worldKey = worlds[stage?.attributes.world] ? stage.attributes.world : (s.worldKey || Object.keys(worlds)[0]);
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
          console.warn(`hatch-pet-card: missing sprites for ${speciesId}`); // the console, not the bubble (F11)
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
    this._newNeighbour(devices);
  }

  // A pet that moved in while this browser wasn't looking, or while the card was open (UX fix 4, F4):
  // the pet on show says so once. The devices this browser has seen on a shelf are kept
  // (the first time ever is only noted, so a new browser doesn't announce every pet). Only a
  // newcomer still in its egg counts, and never to itself.
  _newNeighbour(devices) {
    let known = null;
    try {
      known = JSON.parse(localStorage.getItem(KNOWN_KEY) || "null");
    } catch (err) {
      return; // no storage: nothing to compare with
    }
    const ids = devices.map((d) => d.device);
    const fresh = Array.isArray(known) ? ids.filter((id) => !known.includes(id)) : [];
    if (fresh.length || !Array.isArray(known)) {
      try {
        localStorage.setItem(KNOWN_KEY, JSON.stringify([...new Set([...(known || []), ...ids])].slice(-60)));
      } catch (err) {
        return;
      }
    }
    const on = this._slides[this._index];
    const eggs = fresh.some((id) => id !== on?.ids?.device &&
      this._hass.states[devices[ids.indexOf(id)]["sensor.life_stage"]]?.state === "egg");
    if (eggs && on && !on.reloading) this._queue(on, NEIGHBOUR_LINE, 4500, { type: "neighbour" }); // kept: said when the pet is free
  }

  // The empty card's toy: the first world's own shell and room with its first creature's egg
  // drawn as a flat silhouette (the journal's "???" look), no buttons, nothing moving. It takes no
  // taps. It is drawn when its art has loaded, unless a pet has moved in or the card has changed.
  async _emptyDevice() {
    const token = (this._emptyToken = {});
    let world;
    let worldKey;
    let species;
    let id;
    try {
      const worlds = await loadJson("worlds.json");
      worldKey = Object.keys(worlds)[0];
      world = worlds[worldKey];
      id = world.roster[0];
      species = await loadJson(`sprites/${id}/species.json`);
    } catch (err) {
      return; // the title and text stand alone
    }
    if (this._emptyToken !== token || this._slides.length) return;
    const s = this._buildSlide();
    s.empty = true;
    s.world = world;
    s.worldKey = worldKey;
    s.species = species;
    s.speciesId = id;
    s.el.classList.add("empty");
    this._slides.push(s);
    this._index = 0;
    this._renderSlide(s);
    this._renderShelf();
  }

  // Nothing to draw yet (worlds.json pending or failed, every pet reloading): the card's
  // title and no pet. With a pet on show it is left alone.
  _waiting(title) {
    if (this._slides.length) return;
    this._card.classList.add("single");
    this._card.querySelector(".chips").style.display = "none";
    this._card.querySelector(".title").textContent = title;
    this._card.querySelector(".sub").textContent = "";
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
    s.lcdSize?.disconnect();
    s.el.remove();
  }

  // A slide that now shows another pet starts fresh: nothing of the last
  // pet's (a game, an armed "sure?", the moments already seen) carries over.
  _forget(s) {
    if (s.game) this._endGame(s, null);
    this._sceneEnd(s, { quiet: true });
    s.sceneOwes = s.sceneFade = null;
    this._powerEnd(s);
    s.powerPending = null;
    this._stopTyping(s);
    s.voicedAt = 0;
    s.confirm = null;
    clearTimeout(s.confirmTimer);
    s.lastMoment = s.lastLogAt = undefined;
    s.greeted = false;
    s.excitedSince = 0;
    s.wasCalling = undefined; // a call already on doesn't chirp
    s.journal = false;
    s.finds = false;
    s.everyWorld = false;
    s.settings = false;
    s.settingsChanged = null;
    if (s.laySheet) { // another pet's slide: its lay sheet goes (S2)
      s.laySheet = false;
      s.screen.classList.remove("show-status");
    }
    this._closePicker(s);
    this._shellSettled(s);
    s.statusHtml = null;
    s.drawnSig = null;
    // The last pet's private lines and question aren't this one's.
    this._clearAsk(s);
    s.queue = [];
    this._revealEnd(s);
    s.collecting = false; // a reply on its way is the last pet's: dropped
    s.visitedAt = 0;
    s.lookedFirst = false;
    s.giftAgain = false;
    s.wishDay = null;
    this._dropPhotos(s);
    this._dropGift(s);
    this._dropFinds(s);
    // Its other timers, and what each would have tidied away.
    clearTimeout(s.breezeTimer);
    s.screen?.classList.remove("breezy");
    clearTimeout(s.litTimer);
    s.screen?.classList.remove("lit");
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
    s.bootMoments = [];
    s.retries = 0;
    s.gone = false;
  }

  // Turning on "shared screen", here or in another card or tab: everything
  // personal on every slide goes, including a line still being typed out.
  _goShared() {
    this._sharedSeen = true;
    for (const slide of this._slides || []) {
      this._clearAsk(slide);
      slide.queue = [];
      this._dropPhotos(slide);
      this._dropGift(slide); // a take on its way is dropped unsaid; the pop goes
      this._dropFinds(slide); // the ♥ is the viewer's own: gone with the page
      this._stopTyping(slide); // writes the whole line in, so it's cleared after
      slide.bubble.textContent = "";
      slide.plain = undefined;
      slide.sayUntil = 0; // the next tick says the mood's line, which names nobody
      slide.live.textContent = "";
      slide.screen.querySelector(".bondhearts")?.remove();
      slide.screen.querySelector(".linkhearts")?.remove(); // a visit's, mid-way
      if (slide.laySheet) this._closeLay(slide); // the shared-screen switch closes the lay sheet (S2)
      slide.journal = false;
      slide.finds = false; // the settings sheet stays, without its personal rows
      slide.everyWorld = false;
      this._closePicker(slide); // and without the picker (read-only here)
      slide.confirm = null; // an armed "forget" is a personal row
      slide.status.innerHTML = ""; // drawn again, without its personal rows
      slide.statusHtml = null;
      slide.drawnSig = null;
      slide.mine = null; // and the channel asked again, as a shared screen
      slide.bootMoments = []; // a held moment may be personal
      this._subscribe(slide, true);
    }
    this._redraw();
  }

  // Personal again: the status screens, and the channel asked again for the
  // viewer's own view (nothing else waits to come back).
  _goPersonal() {
    this._sharedSeen = false;
    for (const slide of this._slides || []) {
      if (slide.laySheet) this._closeLay(slide);
      this._dropFinds(slide); // the shared screen's page, read again with the viewer's own ♥
      if (slide.finds) this._loadFinds(slide);
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

  _onMono = () => {
    this._card?.classList.toggle("mono", monoOn());
    this._card?.classList.toggle("bigtext", bigOn());
    this._slides?.forEach((x) => { // an open sheet's row text and aria-pressed stay true
      if (x.screen.classList.contains("show-status") && !x.picker) this._renderStatus(x, this._state(x, "sensor.last_care")?.attributes.log || []);
    });
  };

  _onMonoStorage = (e) => {
    if (e.key === MONO_KEY || e.key === BIG_KEY || e.key === null) this._onMono(); // null: storage cleared
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
    if (!id) return undefined;
    const held = s.scene?.held; // a care scene shows the pet as it was at the tap
    return held && key in held ? held[key] : this._hass.states[id];
  }

  _go(index) {
    const n = this._slides.length;
    if (!n) return;
    const to = (index + n) % n;
    this._slides.forEach((x, i) => {
      // A game stops on the slide being left: nobody plays it unseen.
      if (x.game && i !== to) this._quitGame(x, null);
      this._stopTyping(x);
      if (x.laySheet && i !== to) this._closeLay(x); // the lay sheet stays with its pet
      this._sceneEnd(x); // a swipe ends a care scene, showing how things are now
      if (x.visitor && i !== to) { // a world visitor goes too, after a grace: a slip of the finger keeps it (UX8 F11)
        const V = x.visitor;
        setTimeout(() => {
          if (x.visitor === V && this._slides[this._index] !== x) this._visitorEnd(x);
        }, VISIT_SWIPE_GRACE_MS);
      }
      if (x.picker) { // and leaves the shell picker unsaved: the sheet again
        this._closePicker(x);
        if (x.screen.classList.contains("show-status")) this._renderStatus(x, this._state(x, "sensor.last_care")?.attributes.log || []);
      }
    });
    this._linkEnd(); // a swipe ends the visit at once
    this._index = to;
    if (this._shelfRestored && this._shelfDevices) shelfWrite(this._shelfDevices, to);
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
    for (const s of this._slides) if (s.game?.picking) this._fitPicker(s);
    this._renderShelf();
  }

  // The pet is 62% of the screen high and square, so 46.5% of it wide, and
  // WORLD_GRID cells across: one per art pixel of a creature on the 64 grid, one
  // per 2 × 2 on the 128 grid. Where a cell would be under 3 device pixels the
  // grid moirés, so it doubles there. Lines line up with the pet's box.
  _lcdPitch(s) {
    const w = s.screen.clientWidth;
    if (!w) return;
    const dpr = window.devicePixelRatio || 1;
    let pitch = (w * 0.465) / WORLD_GRID;
    if (pitch * dpr < 3) pitch = Math.max(3, Math.round(pitch * 2 * dpr)) / dpr; // whole device pixels
    const line = Math.max(1, Math.round(pitch * dpr * 0.25)) / dpr;
    const left = w * (0.5 - 0.2325);
    const top = w * 0.75 * (1 - 0.04 - 0.62);
    s.screen.style.setProperty("--lcd-pitch", `${pitch}px`);
    s.screen.style.setProperty("--lcd-line", `${line}px`);
    s.screen.style.setProperty("--lcd-x", `${left % pitch}px`);
    s.screen.style.setProperty("--lcd-y", `${top % pitch}px`);
    // The mono screen's grid sits over the screen, not in it: the same lines on its box.
    const g = s.monoGrid.style;
    for (const k of ["--lcd-pitch", "--lcd-line", "--lcd-x", "--lcd-y"]) g.setProperty(k, s.screen.style.getPropertyValue(k));
    g.setProperty("--mg-x", `${s.screen.offsetLeft}px`);
    g.setProperty("--mg-y", `${s.screen.offsetTop}px`);
    g.setProperty("--mg-w", `${s.screen.offsetWidth}px`);
    g.setProperty("--mg-h", `${s.screen.offsetHeight}px`);
    g.setProperty("--mg-r", getComputedStyle(s.screen).borderRadius);
    // The shell's grid: the same world grid, but always whole device pixels.
    const px = Math.max(1, Math.round(((w * 0.465) / WORLD_GRID) * dpr)) / dpr;
    if (px !== s.px) {
      s.px = px;
      s.device.style.setProperty("--px", `${px}px`);
    }
    this._mould(s);
  }

  // Where a banded finish may change colour without cutting through the label, a
  // button row or its captions: the gaps between them and the bezel's middle, in px
  // down the body on the grid (--cut1..5), and the bezel's box for a see-through
  // board (--bz-*). Only a finish that uses them asks.
  _bands(s) {
    const dev = s.device;
    if (!/finish-(rainbow|sunset|twotone|smoke|clear)\b/.test(dev.className)) return;
    const g = s.px;
    const body = dev.querySelector(".body").getBoundingClientRect();
    const box = (el) => el.getBoundingClientRect();
    const bezel = box(dev.querySelector(".bezel"));
    const label = s.label.offsetHeight ? box(s.label) : null;
    const rows = [];
    for (const t of dev.querySelectorAll(".buttons .toy")) {
      const r = box(t);
      if (!r.height) continue;
      const row = rows.find((w) => Math.abs(w.top - r.top) < 4);
      if (row) row.bottom = Math.max(row.bottom, r.bottom);
      else rows.push({ top: r.top, bottom: r.bottom });
    }
    rows.sort((a, b) => a.top - b.top);
    const mid = (a, b) => Math.round(((a + b) / 2 - body.top) / g) * g;
    const first = rows[0] || { top: body.bottom, bottom: body.bottom }, last = rows.at(-1) || first;
    const cuts = [
      mid(label ? label.bottom : body.top, bezel.top), mid(bezel.top, bezel.bottom), mid(bezel.bottom, first.top),
      rows[1] ? mid(first.bottom, rows[1].top) : mid(first.top, first.bottom), mid(last.bottom, body.bottom),
    ];
    cuts.forEach((v, i) => dev.style.setProperty(`--cut${i + 1}`, `${v}px`));
    const at = (v) => `${Math.round(v / g) * g}px`;
    dev.style.setProperty("--bz-x", at(bezel.left - body.left));
    dev.style.setProperty("--bz-y", at(bezel.top - body.top));
    dev.style.setProperty("--bz-w", at(bezel.width));
    dev.style.setProperty("--bz-h", at(bezel.height));
  }

  // Cut each part of the shell on the grid, from its laid-out size (see mouldCells).
  // Parts and caps are cached by kind and size, so a call with nothing changed is cheap.
  _mould(s) {
    const g = s.px;
    const dev = s.device;
    if (!g || !dev.offsetWidth) return;
    const shape = s.shape || "egg";
    // Each cut part starts on a whole device pixel, wherever its box landed: lids,
    // feet, roofs and caps are sized in percentages and grid columns.
    const dpr = window.devicePixelRatio || 1;
    const over = (v) => v - Math.round(v * dpr) / dpr;
    dev.style.setProperty("--dpx", `${1 / dpr}px`);
    const cut = (key, make) => {
      if (!MOULDS.has(key)) {
        if (MOULDS.size > 300) MOULDS.clear();
        MOULDS.set(key, make());
      }
      return MOULDS.get(key);
    };
    for (const m of dev.querySelectorAll(".mould")) {
      const part = m.parentElement;
      const w = part.offsetWidth, h = part.offsetHeight;
      if (!w || !h) continue;
      const kind = ["body", "bezel", "loop", "lid", "roof", "crescent"].find((k) => part.classList.contains(k)) || "foot";
      const lip = kind === "bezel" ? 2 : 0;
      const W = Math.max(1, Math.round(w / g)) + lip * 2, H = Math.max(1, Math.round(h / g)) + lip * 2;
      const key = `${kind}|${shape}|${W}|${H}|${g}|${this._card.classList.contains("compact")}`;
      const box = part.getBoundingClientRect();
      const at = `left:${-lip * g - over(box.left)}px;top:${-lip * g - over(box.top)}px;`;
      if (m.dataset.key === key) {
        if (m.dataset.at !== at) { m.dataset.at = at; m.style.left = `${-lip * g - over(box.left)}px`; m.style.top = `${-lip * g - over(box.top)}px`; }
        continue;
      }
      m.dataset.key = key;
      m.dataset.at = at;
      const { clip, tones, core } = cut(key, () => {
        const rad = cssRadii(part, w, h, g);
        const w0 = W - lip * 2, h0 = H - lip * 2;
        let inside = (x, y) => inRound(x, y, W, H, rad), opts = {};
        if (kind === "body") {
          opts = { glint: true, seam: 3 };
          // The lily pad's notch, and its veins fanning from it.
          if (shape === "pad") {
            const notch = 23 / g, deep = 34 / g;
            inside = (x, y) => inRound(x, y, W, H, rad) && !(y < deep && Math.abs(x - W / 2) < notch * (1 - y / deep));
            opts.veins = (x, y) => {
              const a = (Math.atan2(y, x - W / 2) * 180) / Math.PI;
              const k = (((a - 90 - 13.75) % 14.5) + 14.5) % 14.5;
              return Math.min(k, 14.5 - k) * (Math.PI / 180) * Math.hypot(x - W / 2, y) < 0.5;
            };
          }
        } else if (kind === "bezel") {
          inside = (x, y) => inRound(x, y, W, H, rad.map(([a, b]) => [a + lip, b + lip]));
          opts = { sunk: true, core: (x, y) => inRound(x - lip, y - lip, w0, h0, rad) };
        } else if (kind === "loop") {
          const t = Math.round(6 / g);
          inside = (x, y) => inRound(x, y, W, H, rad) && !inRound(x - t, y - t, W - t * 2, H, rad.map(([a, b]) => [a - t, b - t]));
        } else if (kind === "roof") {
          const cw = 22 / g, cx = W * 0.8;
          inside = (x, y) => Math.abs(x - W / 2) <= (y / H) * (W / 2) ||
            (x > cx - cw && x < cx && y > 6 / g && y < 46 / g);
        } else if (kind === "crescent") {
          // A disc less the same disc moved (-15, 7) px, turned -20°.
          const R = W / 2, a = (-20 * Math.PI) / 180;
          const ox = (-15 * Math.cos(a) - 7 * Math.sin(a)) / g, oy = (-15 * Math.sin(a) + 7 * Math.cos(a)) / g;
          inside = (x, y) => (x - R) ** 2 + (y - R) ** 2 <= R * R && (x - R - ox) ** 2 + (y - R - oy) ** 2 > R * R;
        }
        const cells = mouldCells(W, H, inside, opts);
        // The screen sits sunk in the bezel: a ring of shadow above and left of the
        // opening, light below and right, on the bezel round the glass.
        if (kind === "bezel") {
          const scr = part.querySelector(".screen");
          const sx = scr.offsetLeft / g + lip, sy = scr.offsetTop / g + lip;
          const sw = scr.offsetWidth / g, sh = scr.offsetHeight / g, srad = cssRadii(scr, scr.offsetWidth, scr.offsetHeight, g);
          const inScreen = (x, y) => inRound(x - sx, y - sy, sw, sh, srad);
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x;
            if (cells[i] !== TONE.plain || inScreen(x + 0.5, y + 0.5)) continue;
            const near = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]
              .find(([dx, dy]) => inScreen(x + 0.5 + dx, y + 0.5 + dy));
            if (near) cells[i] = (x + 0.5 - sx) / sw + (y + 0.5 - sy) / sh < 1 ? TONE.deep : TONE.lit;
          }
        }
        // The porthole's rivets: studs of 2 x 2 cells round the ring.
        if (kind === "bezel" && shape === "porthole") {
          const at = [[w / 2, 7], [w / 2, h - 7], [7, h / 2], [w - 7, h / 2], [0.088 * w + 5, 0.11 * h + 5],
            [0.912 * w - 5, 0.11 * h + 5], [0.088 * w + 5, 0.89 * h - 5], [0.912 * w - 5, 0.89 * h - 5]];
          for (const [ax, ay] of at) {
            const cx = Math.round(lip + ax / g) - 1, cy = Math.round(lip + ay / g) - 1;
            [[0, 0, TONE.lit], [1, 0, TONE.line], [0, 1, TONE.line], [1, 1, TONE.line]].forEach(([dx, dy, t]) => {
              const i = (cy + dy) * W + cx + dx;
              if (cells[i]) cells[i] = t;
            });
          }
        }
        // A recess's lip is the shell's own plastic, in light and shade: only the core is filled.
        const core = lip ? cells.map((v, i) => (v && inside((i % W) + 0.5, Math.floor(i / W) + 0.5) &&
          opts.core((i % W) + 0.5, Math.floor(i / W) + 0.5) ? 1 : 0)) : null;
        return { clip: clipPath(cellsPath(cells, W, H, (v) => v > 0, g)), tones: toneImage(cells, W, H),
          core: core ? clipPath(cellsPath(core, W, H, (v) => v > 0, g)) : "none" };
      });
      m.style.cssText = `${at}width:${W * g}px;height:${H * g}px;` +
        `clip-path:${clip};--tones:${tones};--core:${core}`;
    }
    this._bands(s);
    // The button caps, all one size on a device, and the backlight's little one.
    const n = Math.round((this._card.classList.contains("compact") ? 38 : 46) / g);
    const capKey = `cap|${shape}|${n}|${g}`;
    if (dev.dataset.caps !== capKey) {
      dev.dataset.caps = capKey;
      const caps = cut(capKey, () => {
        const r = shape === "tank" ? [14, 14, 14, 14] : shape === "house" ? [10, 10, 4, 4] : null;
        const rad = r ? r.map((v) => [(v / 46) * n, (v / 46) * n]) : Array(4).fill([n / 2, n / 2]);
        const out = {};
        for (const [tag, depth] of [["", 3], ["-dn", 1]]) {
          const cells = capCells(n, depth, rad);
          out[`--cap-clip${tag}`] = clipPath(cellsPath(cells, n, n + depth, (v) => v > 0, g));
          out[`--cap-side${tag}`] = clipPath(cellsPath(cells, n, n + depth, (v) => v === TONE.side, g));
          out[`--cap-tones${tag}`] = toneImage(cells, n, n + depth);
          if (!tag) {
            // The wanted glow: a ring two cells wide round the raised cap.
            const W = n + 4, H = n + depth + 4, ring = new Uint8Array(W * H);
            const has = (x, y) => x >= 0 && y >= 0 && x < n && y < n + depth && cells[y * n + x] > 0;
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
              if (has(x - 2, y - 2)) continue;
              for (let dy = -2; dy <= 2 && !ring[y * W + x]; dy++) for (let dx = -2; dx <= 2; dx++) {
                if (Math.abs(dx) + Math.abs(dy) <= 3 && has(x - 2 + dx, y - 2 + dy)) { ring[y * W + x] = 1; break; }
              }
            }
            out["--cap-halo"] = clipPath(cellsPath(ring, W, H, (v) => v > 0, g));
          }
        }
        const bl = capCells(9, 2, Array(4).fill([4.5, 4.5]));
        out["--bl-clip"] = clipPath(cellsPath(bl, 9, 11, (v) => v > 0, g));
        out["--bl-tones"] = toneImage(bl.map((v) => (v === TONE.side ? TONE.deep : v)), 9, 11);
        return out;
      });
      dev.style.setProperty("--cap-n", n);
      for (const [k, v] of Object.entries(caps)) dev.style.setProperty(k, v);
    }
    for (const cap of dev.querySelectorAll(".toy .cap")) {
      const r = cap.getBoundingClientRect();
      const x = r.left - (parseFloat(cap.style.left) || 0), y = r.top - (parseFloat(cap.style.top) || 0);
      cap.style.left = `${-over(x)}px`;
      cap.style.top = `${-over(y)}px`;
      // The wanted ring is drawn by the toy, round the cap where it now sits.
      cap.parentElement.style.setProperty("--cap-x", `${x - over(x) - cap.parentElement.getBoundingClientRect().left}px`);
    }
    const b = s.backlight, br = b.getBoundingClientRect();
    if (br.width) {
      const [tx, ty] = (b.style.translate || "0px 0px").split(" ").map((v) => parseFloat(v) || 0);
      b.style.translate = `${-over(br.left - tx)}px ${-over(br.top - ty)}px`;
    }
  }

  _renderShelf() {
    const s = this._slides[this._index];
    if (!s || !s.world) return;
    const vw = this._viewport.clientWidth;
    const w = this._slideW || Math.min(330, vw - 56);
    for (const slide of this._slides) slide.el.style.width = `${w}px`;
    // On whole device pixels, so the pet and the shell's grid stay crisp.
    const dpr = window.devicePixelRatio || 1;
    const vr = this._viewport.getBoundingClientRect();
    const tx = Math.round((vr.left + (vw - w) / 2) * dpr) / dpr - vr.left - this._index * (w + 16);
    const ty = Math.round(vr.top * dpr) / dpr - vr.top;
    this._track.style.transform = `translate(${tx}px, ${ty}px)`;
    if (s.px) requestAnimationFrame(() => this._mould(s)); // the parts' places moved with it
    this._slides.forEach((slide, i) => {
      const current = i === this._index;
      slide.el.classList.toggle("away-slide", !current);
      slide.device.inert = !current || !!slide.empty;
      this._patSync(slide);
      slide.el.setAttribute("aria-hidden", current ? "false" : "true");
    });

    const world = s.world;
    this._card.style.setProperty("--hp-backdrop", world.backdrop);
    this._card.style.setProperty("--hp-ground", world.ground);
    this._card.style.setProperty("--hp-ink", world.ink);
    this._card.style.setProperty("--hp-subink", world.subink);
    const device = this._hass.devices?.[s.ids?.device];
    const stage = this._state(s, "sensor.life_stage");
    const days = stage?.attributes.age_days;
    const kind = stage?.state === "egg" ? "Egg" : s.species?.name || "";
    const title = this._card.querySelector(".title");
    if (!s.empty) { // the empty card keeps its own title and line (_update)
      title.textContent = device?.name_by_user || device?.name || "Pet";
      title.classList.toggle("long", title.textContent.length > 9);
    }
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
    if (!s.empty) {
      this._card.querySelector(".sub").textContent = [kind,
        stage?.state !== "egg" ? STAGE_LABELS[stage?.state]?.toLowerCase() : null,
        days != null ? `day ${Math.floor(days) + 1}` : null].filter(Boolean).join(" · ");
    }

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
    (this._shown ??= new Set()).add(s.ids?.device);
    [...this._dots.children].forEach((dot, i) => {
      const device = this._slides[i].ids?.device;
      dot.classList.toggle("fresh", this._slides.length > 1 && !this._shown.has(device) && !this._seenRead(device));
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

  // The finish the shell wears: the picker's preview, else the pet's pick, else
  // its world's own (worlds.json shell.finish).
  _shellKey(s) {
    const own = s.world.shell?.finish;
    if (s.previewFinish !== undefined) return s.previewFinish ?? own;
    return this._shellChoice(s) ?? own;
  }

  // The pet's pick (null: its world's own): one just saved, until the sensor says
  // so or 5 s pass (so closing the picker before the push doesn't flicker), else
  // the sensor's. A key this card doesn't draw counts as none.
  _shellChoice(s) {
    const key = this._state(s, "sensor.life_stage")?.attributes.shell_finish;
    const saved = Object.hasOwn(FINISHES, key ?? "") ? key : null;
    if (s.shellPending !== undefined) {
      if (saved !== s.shellPending) return s.shellPending;
      this._shellSettled(s);
    }
    return saved;
  }

  _shellSettled(s) {
    s.shellPending = undefined;
    clearTimeout(s.shellPendingTimer);
  }

  // Put a finish on the shell: its class and the ink for its captions. Called by
  // _renderSlide and by the picker's preview; touches nothing else on the device.
  _dress(s, key) {
    const dev = s.device;
    const color = s.world.shell?.color || "#e8834a";
    const known = Object.hasOwn(FINISHES, key);
    const look = known ? FINISHES[key] : {};
    for (const c of [...dev.classList]) if (c.startsWith("finish-")) dev.classList.remove(c);
    if (known) dev.classList.add(`finish-${key}`);
    // The captions are inked for the plastic under them; see-through plastic shows the
    // backdrop, so they are inked for the mix.
    const face = look.face ? look.face(color) : color;
    dev.style.setProperty("--d-face", face);
    const seen = look.seen && /^#[0-9a-f]{6}$/i.test(s.world.backdrop || "")
      ? mixHex(look.seen(color), s.world.backdrop, look.see) : look.seen ? look.seen(color) : face;
    dev.style.setProperty("--d-ink", look.ink || deviceInk(seen));
    if (look.top) dev.style.setProperty("--d-ink-top", deviceInk(look.top(color))); // a label on another colour
    else dev.style.removeProperty("--d-ink-top");
  }

  _renderSlide(s) {
    const sp = s.species;
    const world = s.world;
    const shell = world.shell || {};
    const color = shell.color || "#e8834a";
    const dev = s.device;
    const shape = ["tank", "house", "porthole", "pad", "moon"].includes(shell.shape) ? shell.shape : "egg";
    dev.className = `device ${shape}`;
    s.shape = shape;
    dev.querySelector(".roof").style.display = shape === "house" ? "" : "none";
    dev.querySelector(".crescent").style.display = shape === "moon" ? "" : "none";
    dev.querySelector(".loop").style.display = shape === "egg" ? "" : "none";
    dev.querySelector(".lid").style.display = shape === "tank" ? "" : "none";
    dev.querySelector(".feet").style.display = shape === "tank" ? "" : "none";
    // The backlight's spot: a nub by the egg's screen, the tank lid's right grip, a
    // lamp on the chimney, a rivet, a dewdrop on the pad's rim, a star on the moon.
    const spot = { egg: ".bezel", tank: ".lid", house: ".roof", porthole: ".bezel", pad: ".body", moon: ".crescent" };
    const holder = dev.querySelector(spot[shape]);
    if (s.backlight.parentElement !== holder) {
      if (shape === "tank") holder.insertBefore(s.backlight, holder.lastElementChild);
      else holder.append(s.backlight);
    }
    dev.style.setProperty("--d-shell", color);
    dev.style.setProperty("--d-dark", shade(color, 0.72));
    this._dress(s, this._shellKey(s));
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
    dev.classList.toggle("has-corner", !!trim.corner && !this._card.classList.contains("compact"));
    dev.querySelectorAll(".trim-corner").forEach((img) => {
      img.style.display = trim.corner ? "" : "none";
      if (trim.corner) this._trim(img, uiSrc(trim.corner), 1);
    });
    // The emblem is the shell's world's own, whatever colour the shell wears.
    dev.style.setProperty("--hw-emblem", s.world.emblem ? `url("${BASE}/ui/${s.world.emblem.replace("emblem_", "emblem9_")}.png?v=${VERSION}")` : "none");
    s.label.classList.toggle("plate", !!trim.plate);
    s.label.style.backgroundImage = trim.plate ? `url(${uiSrc(trim.plate)})` : "";
    if (trim.plate) {
      this._trim(s.label, uiSrc(trim.plate), 1);
    } else {
      s.label.style.width = s.label.style.height = s.label.style.paddingTop = "";
    }
    this._mould(s); // a new shape can keep the same size, so no resize says so

    if (s.empty) { // the empty card's toy (F5): the room and the egg, flat and still
      this._show(s, s.bg, sp.backgrounds?.day || Object.values(sp.backgrounds || {})[0]);
      this._show(s, s.perch, null);
      this._show(s, s.awaysign, null);
      for (const img of [...s.poops, s.murk, s.attention, s.prop]) this._show(s, img, null);
      s.frames = [];
      this._show(s, s.pet, sp.egg?.idle?.[0]);
      s.pet.alt = "";
      return;
    }
    // Reloading (every Options save, a restart): the last pose stays, drawn faded, with
    // buttons and the pat off, one line in the bubble and the status page as it was (F1).
    if (s.reloading) {
      s.wasGone = true;
      s.screen.classList.add("faded");
      for (const b of Object.values(s.buttons)) b.disabled = true;
      s.request.classList.remove("show");
      this._patSync(s);
      if (s.bubble.textContent !== GONE_LINE) this._write(s, GONE_LINE, 60000);
      return;
    }
    if (s.wasGone) { // back: the held line goes, the real one is said at once
      s.wasGone = false;
      s.sayUntil = 0;
    }

    const mood = this._state(s, "sensor.mood");
    const stageState = this._state(s, "sensor.life_stage");
    const stage = stageState?.state;
    const flags = mood?.attributes.flags || [];
    const calling = this._state(s, "binary_sensor.calling")?.state === "on";
    const lightsOut = this._state(s, "switch.lights_out")?.state === "on";
    const asleep = this._state(s, "binary_sensor.asleep")?.state === "on";
    const away = mood?.state === "away";
    s.away = away;
    s.egg = stage === "egg";
    const haDevice = this._hass.devices?.[s.ids?.device]; // its given name, as on the title
    s.pat.setAttribute("aria-label", `pat ${haDevice?.name_by_user || haDevice?.name || sp.name || "pet"}`);
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
      const key = s.frames.join(",");
      if (calm() && s.framesKey !== key) s.frame = 0; // a new mood or stage: its first frame
      s.framesKey = key;
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
    // A heavy pet is drawn a little wider (gaps-seams 2c, owner: x1.06, only while heavy).
    const weight = Number.parseFloat(this._state(s, "sensor.weight")?.state);
    const heavy = stage !== "egg" && isHeavy(Number.isFinite(weight) ? weight : null);
    s.pet.classList.toggle("heavy", heavy);
    s.ghost?.classList.toggle("heavy", heavy);
    // Baby, teen and adult have no house poses: a hop dances, a shake shivers.
    const standIn = drawn !== "child" && !away && !asleep && POSE_MOODS.has(mood?.state);
    s.pet.classList.toggle("dance", standIn && flags.includes("dancing"));
    s.pet.classList.toggle("shiver", standIn && (flags.includes("chilly") || flags.includes("storm")));
    s.screen.classList.toggle("stormy", flags.includes("storm") && !away);
    s.screen.classList.toggle("windy", flags.includes("windy") && !away);
    s.vroom = flags.includes("vroom") && !away && !asleep; // a robot is cleaning (H4): idle sends it across
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
      // Every fresh entry since the last one seen (a burst), newest first.
      const fresh = [];
      for (const e of log) {
        if (e.at === s.lastLogAt) break;
        if (recent(e.at)) fresh.push(e);
      }
      if (fresh.length) this._care(s, fresh);
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
      const batch = fresh.reverse().filter((m) => recent(m.at));
      // A pet that wakes sick says so before the cheer (the cheer waits).
      const sick = batch.findIndex((m) => m.type === "became_sick");
      const morning = batch.findIndex((m) => m.type === "good_morning");
      if (sick > morning && morning >= 0) batch.splice(morning, 0, ...batch.splice(sick, 1));
      batch.forEach((m) => this._moment(s, m));
    }
    const egg = stage === "egg";
    if (s.game && (asleep || away || egg)) this._endGame(s, null);
    else if (s.game && SERVER_GAMES.has(s.game.kind) &&
        !s.game.busy && s.game.lastAt && Date.now() - s.game.lastAt >= GAME_IDLE_MS) {
      // the server has dropped it already: no call. A dig left idle says so (Q8).
      this._endGame(s, s.game.kind === "dig" ? GAME_COPY.idle : null);
    }
    s.hatchesAt = egg ? stageState?.attributes.hatches_at : null;
    if (!s.sayUntil || Date.now() > s.sayUntil) {
      if (s.game?.prompt) this._write(s, s.game.prompt, 60000); // a game waiting on a guess asks again
      else {
        const coming = egg ? this._eggComing(s) : null; // the egg's first look (S2, C15')
        if (coming) this._write(s, coming, 8000);
        else this._write(s, this._say(s, mood, away));
      }
    }

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
    // The pet can't lay any more (stage, or the entry reloaded after a world change): no sheet.
    if (s.laySheet && !(mood?.attributes.requests || []).includes("lay_egg")) this._closeLay(s);
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
    this._patSync(s);

    if (s.screen.classList.contains("show-status")) this._renderStatus(s, log);
  }

  _say(s, mood, away) {
    if (away) return "";
    if (s.hatchesAt) {
      const minutes = Math.max(1, Math.ceil((new Date(s.hatchesAt) - serverNow()) / 60000));
      if (minutes <= 1) return "crack... crack...";
      if (minutes <= 6) return STATUS_COPY.eggCracking; // as the status page says it (UX fix 4, F10)
      // The number and its unit stay together: big text never leaves "min" alone on a line.
      return minutes < 60 ? `hatching in about ${minutes}\u00a0min` : `hatching in about ${Math.round(minutes / 60)}\u00a0h`;
    }
    // The server's sentence, or baby talk keyed by which sentence it is (an
    // older integration sends no key: the sentence as it is).
    const reason = mood?.attributes.reason || "";
    const key = mood?.attributes.reason_key;
    if (!key) return reason;
    const mine = this._moodOwn(s, key);
    // Hashed with the pet's birth (hatched_on), the key and the local date.
    const born = this._state(s, "sensor.life_stage")?.attributes?.hatched_on || s.ids?.device;
    return mine ? dailyPick([reason, reason, ...mine], `${born}|${key}`) : this._lines(s, `reason.${key}`, reason).text;
  }

  // A teen or adult's own content, excited, cozy or bored mood line (P2b; cozy and
  // bored since gaps-seams 4a), or null. It is picked by dailyPick (no Math.random):
  // the sentence is redrawn every tick, so it must not change until the date does.
  // Babies and children keep baby talk.
  _moodOwn(s, key) {
    if (!["content", "excited", "cozy", "bored"].includes(key)) return null;
    return this._persona(s)?.[`mood_${key}`] || null;
  }

  // A page change draws as a handheld's menu does: a four-step wipe, sideways between the
  // pages (UX fix 2, F13). Reduced motion turns the animation off (the global rule).
  _wipe(s, kind = "side") {
    s.status.classList.remove("wipe-side", "wipe-down");
    void s.status.offsetWidth; // restart it
    s.status.classList.add(`wipe-${kind}`);
    clearTimeout(s.wipeTimer);
    s.wipeTimer = setTimeout(() => s.status.classList.remove("wipe-side", "wipe-down"), 220);
  }

  _toggleStatus(s, lay = false) {
    const open = !s.screen.classList.contains("show-status");
    const wasSettings = !open && s.settings && !s.laySheet;
    if (open && this._link?.host === s) this._linkEnd(); // the guest never stands over the page (UX8 F1)
    if (open) this._stopTyping(s); // the bubble hides: the line is said whole
    if (open && s.game) this._quitGame(s, null); // the sheet covers it: nobody plays it unseen
    s.screen.classList.toggle("show-status", open);
    s.journal = false;
    s.finds = false;
    s.everyWorld = false;
    s.refocus = null;
    s.tileSaid = null;
    s.settings = false;
    s.laySheet = open && lay; // the lay sheet closes with the status (S2)
    this._closePicker(s);
    if (open) {
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      this._wipe(s, "down");
    }
    this._patSync(s); // back at once when the status closes, not at the next tick
    if (wasSettings) this._settingsReact(s); // closed from the sheet: the pet's word on a change
    else if (!open) {
      s.settingsChanged = null;
      this._perk(s); // the pet is back: it perks up (F13)
    }
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

  // The link greeting's frames: species.json "waves" for the stage (teen, adult, baby;
  // never the child) when every sprite loads, else the excited frames. A wave that
  // fails to load is remembered and swaps itself for excited, even mid-greeting.
  _linkPose(sp, stage, speciesId, apply) {
    const excited = this._petFrames(sp, stage, "excited", false, null, []);
    const waves = stage !== "child" && sp.waves?.[stage];
    if (!Array.isArray(waves) || !waves.length || waves.some((w) => typeof w !== "string")) return excited;
    this._waveOk ||= new Map();
    const key = `${speciesId}/${stage}`;
    const known = this._waveOk.get(key);
    if (known === false) return excited;
    if (known === undefined) {
      const loads = waves.map((w) => new Promise((ok) => {
        const img = new Image();
        img.onload = () => ok(true);
        img.onerror = () => ok(false);
        img.src = spriteSrc(speciesId, w);
      }));
      Promise.all(loads).then((r) => {
        this._waveOk.set(key, r.every(Boolean));
        if (!r.every(Boolean)) apply(excited);
      });
    }
    return waves;
  }

  // A species' own act frames (species.json "acts", never the child) for a stage, or null.
  // Every sprite is probed once, remembered in _poseOk by species/stage/act (not the
  // wave's keys). Unknown plays; a failed load calls `apply` once so the caller swaps
  // back to the frames it had, and later calls get null. Never a broken image. A call
  // while the probe is out (stored as undefined) starts no new one: its `apply` waits too.
  _actPose(sp, stage, speciesId, act, apply) {
    const stages = sp?.acts?.[act];
    if (!act || !stage || stage === "child" || !(stages === true || (Array.isArray(stages) && stages.includes(stage)))) return null;
    const names = [`${stage}_${act}_1`, `${stage}_${act}_2`];
    this._poseOk ||= new Map();
    this._poseWait ||= new Map();
    const key = `${speciesId}/${stage}/${act}`;
    const known = this._poseOk.get(key);
    if (known === false) return null;
    if (!this._poseOk.has(key)) {
      this._poseOk.set(key, undefined);
      this._poseWait.set(key, [apply]);
      Promise.all(names.map((n) => new Promise((ok) => {
        const img = new Image();
        img.onload = () => ok(true);
        img.onerror = () => ok(false);
        img.src = spriteSrc(speciesId, n);
      }))).then((r) => {
        const good = r.every(Boolean);
        this._poseOk.set(key, good);
        const waiting = this._poseWait.get(key) || [];
        this._poseWait.delete(key);
        if (!good) waiting.forEach((fn) => fn());
      });
    } else if (known === undefined) {
      this._poseWait.get(key)?.push(apply);
    }
    return names;
  }

  _tick() {
    if (!this._slides || !this._visible || document.hidden) return;
    this._ticks = (this._ticks || 0) + 1;
    // A screen left on overnight (a wall tablet never hides): a new day is a new look.
    const day = new Date().toDateString();
    if (this._lookDay !== day) {
      if (this._lookDay) this._newLook(this._slides);
      this._lookDay = day;
    }
    this._slides.forEach((s, i) => {
      if (s.poseUntil && Date.now() > s.poseUntil) s.poseUntil = 0;
      if (s.patPoseUntil && Date.now() > s.patPoseUntil) s.patPoseUntil = 0;
      if (s.excitedSince && Date.now() - s.excitedSince >= BOUNCE_MS) s.pet.classList.remove("hop");
      const frames = this._frames(s);
      const seen = Math.abs(i - this._index) <= 1; // the pet on show and the peeking ones
      if (seen && frames.length && !s.scene && !(s.asleep && this._ticks % 2)) {
        const was = s.pet.getAttribute("src");
        s.frame = (s.frame + 1) % frames.length;
        this._show(s, s.pet, frames[s.frame]);
        if (was && was !== s.pet.getAttribute("src")) this._ghostFrame(s, was);
      }
      if (s.propUntil && Date.now() > s.propUntil) {
        this._show(s, s.prop, null);
        s.propUntil = 0;
      }
      if (s.sayUntil && Date.now() > s.sayUntil) s.sayUntil = 0;
      // F1: the typed step ends (with no text) on a slide switch, a hidden tab or its time.
      if (s.textStep && (document.hidden || s !== this._slides[this._index] || Date.now() > s.textStep.until)) {
        this._askTextEnd(s);
      }
      this._patSync(s);
      this._basketSync(s);
      if (s === this._slides[this._index] && !s.reloading && !s.empty) { // a reloading pet greets and asks nothing
        if (!this._booting) this._greet(s); // the boot screen waits: only the speaking does
        this._powerTick(s);
        this._firstLook(s); // before the visit: it tells the server what's queued
        this._giftReturn(s);
        this._followEvening(s);
        this._visit(s);
        if (!this._booting) {
          this._sayQueued(s);
          this._wishMention(s);
          this._socialFull(s);
        }
        this._seen(s);
        this._idle(s);
        this._flairTick(s);
        this._firstMove(s);
        this._seasonTick(s);
        this._partyTick(s);
        this._linkTick(s);
        this._visitorTick(s);
      }
      if (!s.sayUntil && s.species && !s.reloading && !s.empty) {
        const mood = this._state(s, "sensor.mood");
        // A game waiting on a guess asks again (a care line said over it is done).
        const prompt = s.game?.prompt;
        const text = prompt || this._say(s, mood, mood?.state === "away");
        if (prompt) this._write(s, text, 60000);
        else if (s.bubble.textContent !== text) this._write(s, text);
      }
    });
  }

  // Ghosting: a slow LCD leaves a fading trace where the pet was. Only the pet on
  // show, with screen effects on, never with reduced motion or more contrast, and
  // The fades are Web Animations,
  // which the reduced-motion CSS rule doesn't reach: hence the checks here.
  _ghosting(s) {
    const media = (q) => window.matchMedia?.(q).matches;
    return s === this._slides[this._index] && this._visible && !document.hidden && !s.linking &&
      this._card.classList.contains("lcd-on") && s.pet.style.display !== "none" && !s.scene &&
      !calm() &&
      !media("(prefers-contrast: more)");
  }

  // A frame swap: the old frame fades from 35% to nothing. Not while the pet is
  // turned or mid-animation (a hop, a sway, a move), where the trace would sit
  // where the pet isn't.
  _ghostFrame(s, src) {
    if (!this._ghosting(s) || s.pet.classList.contains("look") || s.pet.getAnimations().length ||
      s.ghostUntil > Date.now()) return;
    s.ghost.setAttribute("src", src);
    s.ghost.animate([{ opacity: 0.35 }, { opacity: 0 }], { duration: 180, easing: "linear" });
  }

  // A wander or a game move: the ghost follows the pet 120 ms behind (its CSS
  // transition-delay), at 30%, leaving a short smear that catches up.
  _ghostTrail(s) {
    s.ghost.getAnimations().forEach((a) => a.cancel());
    if (!this._ghosting(s)) return;
    const move = parseFloat(getComputedStyle(s.pet).transitionDuration) * 1000 || 250;
    const duration = move + 120 + 180;
    s.ghost.setAttribute("src", s.pet.getAttribute("src"));
    s.ghost.animate([{ opacity: 0.3 }, { opacity: 0.3, offset: (move + 120) / duration }, { opacity: 0 }],
      { duration });
    s.ghostUntil = Date.now() + duration;
  }

  // The backlight: the screen glows for a while; a second tap starts the while
  // again. Nothing else changes (no lights out, no waking, no line).
  _backlight(s) {
    clearTimeout(s.litTimer);
    s.screen.classList.add("lit");
    this._chirp(s, "click");
    s.litTimer = setTimeout(() => s.screen.classList.remove("lit"), BACKLIGHT_MS);
  }

  // Nothing else is going on: is the pet free for a small idle behaviour?
  _free(s) {
    const now = Date.now();
    return s.species && !s.asleep && !s.calling && !s.game && !s.scene && IDLE_MOODS.has(s.moodState) &&
      !s.screen.classList.contains("show-status") &&
      !(s.sayUntil > now) && !(s.poseUntil > now) && !(s.propUntil > now) &&
      !(s.flairUntil > now) && !(s.movingUntil > now);
  }

  // Free but for a line being said: a move with no words may play over it (fresh-moment 7).
  _freeBody(s) {
    const now = Date.now();
    return s.species && !s.asleep && !s.calling && !s.game && !s.scene && !s.linking && !s.power && !s.visitor &&
      IDLE_MOODS.has(s.moodState) && !s.screen.classList.contains("show-status") &&
      !(s.poseUntil > now) && !(s.propUntil > now) && !(s.flairUntil > now) && !(s.movingUntil > now);
  }

  // Only a question on show, its 60 s hold the one thing busy: a visitor or flair may
  // still come (fresh-moment 5a), the question keeping its bubble and buttons.
  _askOnly(s) {
    return this._questionOn(s) && !!this._freeBody(s) && !s.queue?.length &&
      this._state(s, "sensor.life_stage")?.state !== "egg";
  }

  // A first look's one early move (fresh-moment 7), so a 30 s look sees the pet do
  // something, not only talk: its flair (traits), else a look around (not when calm).
  // Over a line, as it has no bubble. Then flair and idle keep their own timers.
  _firstMove(s) {
    const now = Date.now();
    if (!s.firstMoveAt || now < s.firstMoveAt) return;
    if (!this._freeBody(s)) {
      if (now - s.firstMoveAt > FIRST_MOVE_LATE_MS) s.firstMoveAt = 0;
      return;
    }
    s.firstMoveAt = 0;
    if (this._flair(s).length) {
      const [lo, hi] = FLAIR_EVERY_MS;
      s.nextFlair = now + lo + Math.random() * (hi - lo);
    } else if (!calm()) {
      this._look(s, 1800);
    }
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

  // The pet's personality key, for a teen or an adult whose type the card knows, else null.
  _typeKey(s) {
    const st = this._state(s, "sensor.life_stage");
    const key = st?.attributes?.personality;
    return (st?.state === "teen" || st?.state === "adult") && Object.hasOwn(PERSONA, key) ? key : null;
  }

  // Kindred (2b): both have a type, and it's the same or KINDRED's partner.
  _kindred(a, b) {
    const [x, y] = [this._typeKey(a), this._typeKey(b)];
    return !!x && !!y && (x === y || KINDRED[x] === y);
  }

  // A line in baby talk, else half the time in its personality's words, else
  // the normal one: {text, baby}. A baby line never carries the catchphrase
  // (callers pass catch: !baby); a personality line may, as the normal one does.
  // { fresh: true } (fresh-expand E1): the type's lines by _fresh, and never the same
  // text as this key said last on this slide (the other side of the coin instead).
  _lines(s, key, normal, arg, { fresh = false } = {}) {
    const set = this._babySet(s, key);
    const own = !set && this._persona(s)?.[key];
    const take = (list) => (fresh ? this._fresh(s, key, list) : pick(list));
    const fill = (line) => (typeof line === "function" ? line(arg) : line);
    let line = set ? take(set) : own && Math.random() < 0.5 ? take(own) : null;
    if (fresh && !set && own) {
      const said = (s.lastPick ??= {})[`${key}:said`];
      const text = line === null ? normal : fill(line);
      if (text === said) line = line === null ? take(own) : null;
      s.lastPick[`${key}:said`] = line === null ? normal : fill(line);
    }
    if (line === null) return { text: normal, baby: false };
    return { text: fill(line), baby: !!set };
  }

  // A random line, never the one this key gave last on this slide (memory only).
  _fresh(s, key, list) {
    if (!list?.length) return undefined;
    const last = (s.lastPick ??= {})[key];
    const pool = list.length > 1 ? list.filter((line) => line !== last) : list;
    const line = pick(pool.length ? pool : list);
    s.lastPick[key] = line;
    return line;
  }

  // The moves _idle picks from (P3): the common ones, and the copies this
  // pet's type adds (IDLE_ADDS). Calm leaves only mumble and pose, whatever the type.
  _idleMoves(s, hasPose, isCalm) {
    const moves = ["mumble"];
    if (hasPose) moves.push("pose", "pose");
    if (!isCalm) {
      moves.push("look", "look", "wander", "perk", "speck");
      if (s.moodState === "excited") moves.push("hop", "hop");
      moves.push(...this._typeAdds(s));
      moves.push(...this._tricks(s)); // an adult's monthly tricks (E8 LS-a)
    }
    return moves;
  }

  // --- Fresh-expand E8: an adult's tricks, a best friend's line ---------------------

  // The tricks an adult has learned (one a month from its 14th day), else none.
  _tricks(s) {
    const st = this._state(s, "sensor.life_stage");
    const learned = st?.state === "adult" ? tricksBy(trickMonth(st.attributes?.age_days)) : [];
    // F7: the trick it showed someone today joins them for the day.
    const shown = s.followTrick?.day === new Date().toDateString() ? s.followTrick.move : null;
    return shown && !learned.includes(shown) ? [...learned, shown] : learned;
  }

  // The trick new this month, the first look of the month on this browser (once), or null.
  _trickNew(s, stage) {
    if (this._state(s, "sensor.life_stage")?.state !== "adult") return null;
    const month = trickMonth(stage.age_days);
    if (month < 1 || month > TRICKS.length) return null;
    return onceEver(`trick-${s.ids?.device}-${stage.generation || 1}-${month}`) ? TRICKS[month - 1] : null;
  }

  // One trick: a spin, a double perk or a look around (CSS moves; none when calm).
  _trickMove(s, move) {
    if (calm()) return;
    if (move === "spin") {
      this._animate(s, s.pet, "spin", 900);
      this._moving(s, 900);
    } else if (move === "perk2") {
      this._animate(s, s.pet, "perk", 320);
      setTimeout(() => this._animate(s, s.pet, "perk", 320), 420);
    } else {
      this._look(s, 1800);
    }
  }

  // A best friend (bond 10) on their own screen: a line at most once a week, or null.
  _favLine(s) {
    if (sharedScreen() || this._bond(s)?.level !== BOND.max) return null;
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const week = monday.toDateString();
    const key = `hatch-fav-${s.ids?.device}`;
    try {
      if (localStorage.getItem(key) === week) return null;
      localStorage.setItem(key, week);
    } catch (err) {
      return null;
    }
    return turnPick(FAV_LINES, `${s.ids?.device}|fav`);
  }

  // --- Fresh-expand F3: the pet's own promise ------------------------------------

  // At a first look, a teen or adult's promise beat today: {line, move} or null. Day 0
  // the promise; days 4-7 the payoff once a cycle (one overwritten key per pet).
  _promiseLook(s, date = turnNow()) {
    const stage = this._state(s, "sensor.life_stage")?.state;
    if (stage !== "teen" && stage !== "adult") return null;
    const device = s.ids?.device;
    const p = promiseDay(device, date);
    const paidKey = `hatch-promise-${device}`;
    if (p.day === 0) {
      return oncePerDay(`promise-${device}`, date) ? { line: PROMISE_LINES[p.topic][0], move: null } : null;
    }
    if (p.day < PROMISE_PAYOFF[0] || p.day > PROMISE_PAYOFF[1]) return null;
    try {
      if (localStorage.getItem(paidKey) === String(p.cycle)) return null;
      if (!oncePerDay(`promise-${device}`, date)) return null;
      localStorage.setItem(paidKey, String(p.cycle));
    } catch (err) {
      return null;
    }
    return { line: PROMISE_LINES[p.topic][1], move: p.topic };
  }

  // Practice, days 1-3: now and then an idle does the move small, with its line once a day.
  _promisePractice(s, date = turnNow()) {
    const stage = this._state(s, "sensor.life_stage")?.state;
    if (stage !== "teen" && stage !== "adult") return false;
    const p = promiseDay(s.ids?.device, date);
    if (p.day < 1 || p.day > 3 || Math.random() >= PROMISE_PRACTICE_ODDS) return false;
    if (!oncePerDay(`promise-${s.ids?.device}`, date)) return false;
    this._line(s, FLAVOUR, PROMISE_MID, 3000);
    this._promiseMove(s, p.topic, true);
    return true;
  }

  // The topic's move: small (practice) or the payoff's (a hop 1.4x as high, a full spin,
  // two chirps). None when calm (the line still comes).
  _promiseMove(s, topic, small = false) {
    if (topic === "song") {
      this._chirp(s, "win");
      if (!small) setTimeout(() => this._chirp(s, "win"), 500);
      return;
    }
    if (calm()) return;
    if (topic === "hop") this._animate(s, s.pet, small ? "perk" : "bighop", small ? 320 : 1400);
    else this._animate(s, s.pet, small ? "pat-soft" : "spin", small ? 300 : 900);
    this._moving(s, small ? 400 : 1400);
  }

  // The moves a teen or adult's type adds to its idle list (IDLE_ADDS), in the table's order.
  _typeAdds(s) {
    const st = this._state(s, "sensor.life_stage");
    return (st?.state === "teen" || st?.state === "adult") && IDLE_ADDS[st.attributes?.personality] || [];
  }

  _idle(s) {
    const now = Date.now();
    if (!s.nextIdle) s.nextIdle = now + IDLE_MIN_MS / 2 + Math.random() * IDLE_SPREAD_MS;
    if (now < s.nextIdle) return;
    s.nextIdle = now + IDLE_MIN_MS + Math.random() * (s.vroom ? 20000 : IDLE_SPREAD_MS); // vroom: every 20-40 s
    if (!this._free(s)) return;
    const isCalm = calm();
    const own = s.drawn === "child"
      ? Object.keys(s.species.extras || {}).filter((k) => !SHARED_POSES.has(k)) : [];
    if (this._promisePractice(s)) return; // the promise's practice, days 1-3 (F3)
    // While a robot is cleaning (vroom) it is the choice: across the floor, and the pet perks.
    const move = s.vroom && !isCalm && !s.screen.classList.contains("fx-robot")
      ? "robot" : pick(this._idleMoves(s, own.length > 0, isCalm));
    if (move === "robot") {
      this._robotFx(s);
      this._animate(s, s.pet, "perk", 320);
    } else if (move === "pose") {
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
    } else if (move === "spin" || move === "perk2") {
      this._trickMove(s, move);
    } else if (move === "hop") {
      this._animate(s, s.pet, "greethop", 1400); // two happy bounces (_render clears "hop")
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
        bored: ["hmm...", "*rolls around*", "I could go for a game ♪"],
        excited: ["hehe!", "wheee"],
        hungry: ["*tummy rumbles*", "a snack sounds good...", ...(words.food ? [`mmm... ${words.food}...`] : [])],
        dirty: ["ew...", "*sniff sniff*"],
      }[s.moodState] || ["♪ hm hm hm ♪", "...", "*looks around*", "la la la"];
      // A teen or adult says its type's idle lines half the time, except for the
      // body's own (sleepy, hungry, dirty, sick), which stay normal.
      const bodily = ["sleepy", "hungry", "dirty", "sick"].includes(s.moodState);
      const key = s.moodState === "bored" ? "idle_bored" : s.moodState === "excited" ? "idle_excited" : "idle";
      // Now and then a neighbour on the shelf, by name (gaps-seams 5b): flavour, nothing counted.
      const others = this._slides.filter((x) => x !== s);
      const neighbour = !bodily && !this._babyStage(s) && others.length && Math.random() < NEIGHBOUR_ODDS
        && this._linkName(pick(others));
      const normal = pick(lines);
      this._write(s, neighbour ? pick(NEIGHBOUR_LINES)(neighbour) : bodily ? normal : this._lines(s, key, normal).text, 2500);
      s.plain = s.bubble.textContent; // idle chatter isn't read out
    }
  }

  // Hello to whoever is looking, by first name, now and then (this browser only).
  // --- Daily check-ins ----------------------------------------------------

  // Every line put straight into the bubble. With ms, it holds the bubble that
  // long; without, the hold stays as it was (a game keeps its own).
  _write(s, text, ms, cls = 0) {
    this._stopTyping(s);
    s.plain = undefined;
    s.bubble.textContent = text;
    if (ms !== undefined) s.sayUntil = Date.now() + ms;
    s.sayClass = cls; // what's held in the bubble (PR 2a)
    s.sayEntry = null;
  }

  // A line that may carry the creature's sound, typed out at its pace (and
  // babbled, if this browser wants that). Screen readers get the plain line,
  // once; the sound is hidden from them. With catch: true (lines that name
  // nobody), every third such voiced line ends with its catchphrase.
  _speak(s, said, ms = 4500, { catch: catchy = false, cls = 0 } = {}) {
    const voice = s.species?.voice;
    const sound = this._soundFor(s, said);
    if (bigOn() && ms <= 10000) ms = Math.round(ms * 1.5); // larger words are read slower (F9); a question keeps its own 60 s
    let text = said;
    if (sound && catchy && !said.includes("?")) {
      s.catchCount = (s.catchCount || 0) + 1;
      const phrase = this._state(s, "sensor.life_stage")?.attributes.catchphrase;
      if (s.catchCount % 3 === 0 && phrase && `${sound} ${said} ${phrase}`.length <= VOICE_MAX) text = `${said} ${phrase}`;
    }
    const onShow = s === this._slides[this._index];
    const isCalm = calm();
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
    if (onShow && !isCalm && !status && pace > 0 && this._visible && !document.hidden) {
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
    s.sayClass = cls;
    s.sayEntry = null;
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
  // a time once nothing else is being said. Kept unless opts.cls says otherwise.
  // still() false drops it unsaid; then() runs when it is said.
  _queue(s, text, ms = 4500, opts = {}) {
    const { cls = KEPT, at, type, still, then, ...rest } = opts;
    (s.queue ??= []).push({ text, ms, opts: rest, cls, at, type, still, then, perk: true });
  }

  // A reaction to care for baby, teen and adult (the child has species poses): that
  // stage's mood frame for REACT_MS and a bounded move. Not over a scene, a link, the
  // low-battery gag, sleep, away or the egg; a game only with `inGame`.
  // Under reduced motion only the frame changes (calm() shows its first). With ms
  // (a win beat), the frame and the move both last that long.
  _reactFrames(s, kind, { inGame = false, ms } = {}) {
    const r = REACTIONS[kind];
    if (!r || !s.species || s.drawn === "child" || s.scene || s.linking || s.power ||
      s.asleep || s.away || s.egg || (s.game && !inGame)) return;
    const sp = s.species;
    if (r.poseOnly && !(Array.isArray(sp.acts?.[STAGE_POSES[kind]]) || sp.acts?.[STAGE_POSES[kind]] === true)) return;
    const mood = sp.moods?.includes(r.mood) ? r.mood : "content";
    const moodFrames = [];
    for (let i = 1; i <= (sp.frames || 1); i++) moodFrames.push(`${s.drawn}_${mood}_${i}`);
    const own = this._actPose(sp, s.drawn, s.speciesId, STAGE_POSES[kind], () => {
      if (s.poseFrames !== own) return;
      if (r.poseOnly) { // no mood stand-in: the reaction just ends
        s.poseUntil = 0;
        s.poseFrames = [];
        this._show(s, s.pet, s.frames?.[0]);
        return;
      }
      s.poseFrames = moodFrames; // the act's art did not load: back to the mood frames
      this._show(s, s.pet, moodFrames[0]);
    });
    if (r.poseOnly && !own) return; // the act's art failed before: nothing, a running reaction untouched
    s.poseFrames = own || moodFrames;
    s.poseUntil = Date.now() + (kind === "ready" ? READY_MS : ms ?? REACT_MS);
    this._show(s, s.pet, s.poseFrames[0]);
    if (calm() || !r.move) return;
    const move = kind === "praised" ? this._praiseMove(s, inGame) : r.move;
    const moveMs = ms ?? r.ms;
    if (move === "wander") {
      const side = pick(["wander-l", "wander-r"]);
      s.pet.classList.add(side);
      this._moving(s, moveMs + 900);
      setTimeout(() => s.pet.classList.remove(side), moveMs);
      return;
    }
    this._animate(s, s.pet, move, moveMs);
    if (move === "look") this._moving(s, moveMs + 250);
  }

  // "Praised" moves the way its type likes (P3): the first move the type's row
  // adds that looks happy (not mumble, which is speech, nor look, the refusal's
  // turn-away), else the plain greethop. A hop is played as greethop (_render
  // clears "hop" on every update); in a game a wander is a perk, so the pet is
  // back in the middle for the next round.
  _praiseMove(s, inGame = false) {
    const move = this._typeAdds(s).find((m) => m !== "mumble" && m !== "look") || REACTIONS.praised.move;
    if (move === "hop") return "greethop";
    return inGame && move === "wander" ? "perk" : move;
  }

  // An open question is on show (its answer buttons).
  _questionOn(s) {
    return !!s.screen?.querySelector(".askday");
  }

  // The pat's box is up: the pet on show, out and about, with nothing over it (the CSS
  // also hides it at once for the status, a game, a question, a link and the boot screen).
  _patOn(s) {
    return !!s.species && !s.reloading && !s.empty && s === this._slides[this._index] && !this._booting && !s.scene && !s.linking &&
      !s.power && !s.game && !s.away && !this._questionOn(s) &&
      !s.screen.classList.contains("show-status");
  }

  // The pat's box shown or hidden (each tick, and at once where something covers it).
  // Hidden with focus on it: the focus moves to the Status button, not the page.
  _patSync(s, hide = !this._patOn(s)) {
    if (hide && !s.pat.hidden && this.shadowRoot?.activeElement === s.pat) this._card?.querySelector(".statusbtn")?.focus();
    s.pat.hidden = hide;
  }

  // May a pat say its line? Not over a kept line or one waiting, a game, a question, a
  // call, the low-battery gag or a visitor (world or seasonal): then it is a wiggle only
  // (rapid pats can't cut off news, nor a pat the greeting).
  _patMayTalk(s) {
    return !s.calling && !s.power && !s.game && !this._questionOn(s) && !(s.visitUntil > Date.now()) &&
      !(s.sayUntil > Date.now() && s.sayClass >= KEPT) && !s.queue?.some((q) => lineClass(q) >= KEPT);
  }

  // acts.pat for ~900 ms on a pat (R2), kept in s.patPoseUntil so `reacting` in the
  // next pat is as before. Not over a reaction, a call, or a child; unloadable: today's pat only.
  _patPose(s, reacting) {
    if (reacting || s.calling || s.drawn === "child" || s.asleep) return;
    const own = this._actPose(s.species, s.drawn, s.speciesId, "pat", () => {
      if (s.patPoseFrames !== own) return;
      s.patPoseUntil = 0;
      s.patPoseFrames = null;
      this._show(s, s.pet, s.frames?.[0]);
    });
    if (!own) return;
    s.patPoseFrames = own;
    s.patPoseUntil = Date.now() + PAT_POSE_MS;
    this._show(s, s.pet, own[0]);
  }

  // A pat (PR 3b, O01): card only, nothing is sent or stored. A perk and the tap's
  // haptic; a C10 line by mood, at most one per PAT_COOLDOWN_MS. Asleep: a slow perk
  // and nothing said. Under reduced motion only the line and the haptic.
  _pat(s, e) {
    if (!this._patOn(s)) return; // let the tap reach the screen (status) or bring the slide forward
    e.stopPropagation();
    if (e.detail !== 0 && this._swiped) return; // the end of a swipe; a key after one still pats
    const now = Date.now();
    const still = calm();
    if (s.egg) { // an egg rocks a little and chirps: no bond, no server call, one "♪" (F2)
      this._tapped(s.pat);
      if (!still) {
        this._animate(s, s.pet, "rock", 600);
        this._moving(s, 600);
      }
      if (now - (s.patAt || 0) >= PAT_COOLDOWN_MS || !s.sayUntil || now > s.sayUntil) {
        s.patAt = now;
        this._chirp(s, "tap");
        this._line(s, MINE, EGG_PAT_LINE, PAT_MS);
      }
      return;
    }
    if (s.asleep) {
      this._tapped(s.pat);
      if (!still) {
        this._animate(s, s.pet, "pat-slow", 1100);
        this._moving(s, 1100);
      }
      return;
    }
    // A reaction running plays whole: the pat still speaks, but adds no move of its own.
    const reacting = s.poseUntil > now;
    this._patPose(s, reacting);
    if (now - (s.patAt || 0) < PAT_COOLDOWN_MS || !this._patMayTalk(s)) {
      this._tapped(s.pat);
      if (!still && !reacting) {
        this._animate(s, s.pet, "pat-soft", 300);
        this._moving(s, 400);
      }
      return;
    }
    this._tapped(s.pat, reacting ? undefined : s);
    s.patAt = now;
    // Sleepy and sick keep their one line (it's news); otherwise the type's own words in
    // turn with the mood's (P-a), and now and then the sweet spot (P-b): never counted.
    const plain = !["sleepy", "sick"].includes(s.moodState);
    const lastSaid = (s.lastPick ??= {})["pat:said"];
    if (plain && this._state(s, "sensor.life_stage")?.state !== "baby" && lastSaid !== PAT_SPOT && Math.random() < PAT_SPOT_ODDS) {
      s.lastPick["pat:said"] = PAT_SPOT;
      this._line(s, MINE, PAT_SPOT, PAT_MS);
      if (!still && !reacting) {
        this._animate(s, s.pet, "greethop", 1400);
        this._bondHearts(s);
      }
      return;
    }
    const mood = PAT_LINES[s.moodState] || PAT_LINES.content;
    this._line(s, MINE, plain ? this._lines(s, "pat", mood, undefined, { fresh: true }).text : mood, PAT_MS);
  }

  // May a line of this class go into the bubble now? Only a higher class
  // interrupts what's held, and nothing below kept interrupts a game or a
  // question. A line waiting in the queue at this class or above goes first.
  // A call holds lines below kept, except its own news (C6, which comes with the sick call).
  _mayInterrupt(s, cls, type) {
    if (cls >= MINE) return true;
    if (s.game || this._questionOn(s) || (s.calling && cls < KEPT && type !== "became_sick")) return false;
    if (s.queue?.some((q) => lineClass(q) >= cls)) return false;
    return !(s.sayUntil > Date.now()) || cls > (s.sayClass || 0);
  }

  // One classed line (PR 2a): said now if it may interrupt, else it waits in
  // the queue (kept, care, beats) or, flavour, waits a little or is dropped.
  // then runs when it is said (its sparkle, chirp, move); at is a kept
  // moment's time, noted as said for the catch-up.
  _line(s, cls, text, ms = 4500, { then, at, write, type, perk, still, ...opts } = {}) {
    const entry = { text, ms, cls, then, at, write, type, perk, still, opts };
    // A kept line for a slide that is not on show waits in its queue (said, and
    // marked said, when the slide comes to show) instead of being spent unseen.
    const offShow = cls === KEPT && s !== this._slides?.[this._index];
    if (!offShow && this._mayInterrupt(s, cls, type)) {
      this._sayLine(s, entry);
      return;
    }
    const now = Date.now();
    if (cls === FLAVOUR) {
      // During a kept line, a game or a question (or with a kept line next): dropped.
      if (s.game || this._questionOn(s) || (s.sayUntil > now && s.sayClass >= KEPT) ||
        s.queue?.some((q) => lineClass(q) >= KEPT)) return;
      const wait = Math.max(0, (s.sayUntil || 0) - now) +
        (s.queue || []).reduce((n, q) => n + (q.ms || 0), 0);
      if (wait > FLAVOUR_WAIT_MS) return;
      entry.dropAt = now + FLAVOUR_WAIT_MS;
    }
    (s.queue ??= []).push(entry);
    if (offShow) this._capOffShow(s);
  }

  // A slide that is not on show keeps at most FIRST_LOOK_LINES kept moments
  // waiting (the newest), and one care miss (the newest), as the catch-up
  // merges them. The dropped ones are older than what stays: saying the newer
  // marks them said, so the catch-up never brings them back.
  _capOffShow(s) {
    const time = (q) => new Date(q.at).getTime() || 0;
    const kept = s.queue.filter((q) => q.cls === KEPT && q.at).sort((a, b) => time(b) - time(a));
    const drop = new Set();
    let miss = false;
    const rest = [];
    for (const q of kept) {
      if (q.type === "care_miss") {
        if (miss) { drop.add(q); continue; }
        miss = true;
      }
      rest.push(q);
    }
    rest.slice(FIRST_LOOK_LINES).forEach((q) => drop.add(q));
    if (drop.size) s.queue = s.queue.filter((q) => !drop.has(q));
  }

  // Into the bubble: a queued line or one said at once.
  _sayLine(s, q) {
    const now = Date.now();
    const cls = lineClass(q);
    const was = s.sayEntry;
    if (cls >= MINE && was && lineClass(was) === KEPT && s.sayUntil > now &&
      now - was.shownAt < was.ms / 2) {
      // The viewer's own press cut off a kept line early: it's said again after.
      // For what is left of its time, and a question's only while it is still open (F15).
      const left = was.shownAt + was.ms - now;
      if (left > 0 && (!was.ask || this._questionOn(s))) {
        (s.queue ??= []).unshift({ ...was, ms: left, then: null, shownAt: undefined });
      }
    }
    if (q.write) this._write(s, q.text, q.ms, cls);
    else this._speak(s, q.text, q.ms, { ...q.opts, cls });
    s.sayEntry = { ...q, shownAt: now };
    if (q.perk) this._animate(s, s.pet, "perk", 320);
    if (q.at && cls === KEPT) this._markSaid(s, q.at);
    q.then?.();
  }

  _sayQueued(s) {
    const now = Date.now();
    if (!s.queue?.length) return;
    s.queue = s.queue.filter((q) => !(q.dropAt < now)); // flavour that waited too long
    // Asleep: kept lines wait until it's up (they were said once, on the
    // server's side); only a question is dropped, it may come another day. A
    // beat ("good night...") or flavour may still be said, as it would have been.
    if (s.asleep && s.queue.some((q) => q.ask)) this._clearAsk(s);
    if (!s.queue.length || s.sayUntil > now || s.game || s.power || s.screen.classList.contains("show-status")) return;
    let ready = s.asleep ? s.queue.filter((q) => lineClass(q) < KEPT) : s.queue;
    // A call's own words hold: while it's calling, only a kept line (not a wish) is said (2c).
    if (s.calling) ready = ready.filter((q) => q.type === "became_sick" || (lineClass(q) >= KEPT && q.type !== "wish"));
    if (!ready.length) return;
    // The highest class first; in a class, the queue's order. A line whose
    // still() says it no longer fits (e.g. 2b's C6 once it's well) is dropped.
    const top = Math.max(...ready.map(lineClass));
    const next = ready.find((q) => lineClass(q) === top);
    s.queue.splice(s.queue.indexOf(next), 1);
    if (next.still && !next.still()) {
      this._sayQueued(s);
      return;
    }
    this._sayLine(s, next);
  }

  // hatch-seen-<device>: { seen, said }. seen is when this device last looked
  // (its own clock, for the away note); said is the newest kept moment's at
  // this browser has said (the server's clock, for the catch-up). An older card
  // stored seen alone, as a number.
  _seenRead(device) {
    try {
      const raw = localStorage.getItem(`hatch-seen-${device}`);
      if (!raw) return null;
      const v = JSON.parse(raw);
      if (typeof v === "number") return { seen: v, said: null };
      return { seen: Number(v?.seen) || 0, said: typeof v?.said === "number" ? v.said : null };
    } catch (err) {
      return null; // no storage, or not ours
    }
  }

  _seenWrite(device, patch) {
    try {
      const was = this._seenRead(device) || {};
      localStorage.setItem(`hatch-seen-${device}`, JSON.stringify({ ...was, ...patch }));
    } catch (err) {
      // no storage
    }
  }

  // A kept moment was said here: the catch-up won't say it (or anything older) again.
  _markSaid(s, at) {
    const t = new Date(at).getTime();
    const device = s.ids?.device;
    if (!Number.isFinite(t) || !device) return;
    const said = this._seenRead(device)?.said;
    if (said === null || said === undefined || t > said) this._seenWrite(device, { said: t });
  }

  // A new look on the same page (fresh-moment 1): the greeting, the first look, the visit
  // and the wish mention start over; each line's own once-key still stops a double. A
  // tab back from hiding also says a gift waiting, and leaves what happened meanwhile
  // to the catch-up (no live replay of moments, as _forget).
  _newLook(slides, { resumed = false } = {}) {
    for (const x of slides) {
      x.lookedFirst = x.greeted = false;
      x.visitedAt = x.nextWish = 0;
      if (resumed) {
        x.giftAgain = true;
        x.lastMoment = x.lastLogAt = undefined;
      }
    }
  }

  // A tab just back after a long while, its states not yet fresh (fresh-moment 1).
  _resumeHeld() {
    return !!this._resumedAt && Date.now() - this._resumedAt < RESUME_HOLD_MS;
  }

  // The first look at this pet on this device: what happened while you were
  // out, this morning's dream and today's wish (each once a day per device).
  _firstLook(s) {
    if (!this._channelHeard(s)) return; // the viewer's bond and wish first
    if (this._resumeHeld()) return; // fresh states first
    const away = this._state(s, "sensor.mood")?.state === "away";
    if (s.lookedFirst || !s.species || s.asleep || away || this._eggMinutes(this._state(s, "sensor.life_stage")) !== null) return;
    s.lookedFirst = true;
    followTextSweep(); // M1, again at each first look
    s.firstMoveAt = Date.now() + FIRST_MOVE_MS;
    const stage = this._state(s, "sensor.life_stage")?.attributes || {};
    const device = s.ids?.device;
    // At most FIRST_LOOK_LINES lines, in this order, the newest first; what doesn't fit isn't said
    // (the dream and wish come again at the next first look; the visit's notes
    // are budgeted on the server from what's queued here).
    const lines = [];
    const mark = this._seenRead(device);
    // The fresh-expand extras below (the cure, L10, the trick, the promise) leave a waiting
    // gift its slot (audit 2026-11-01b B1): the gift's place in the look stays as it was.
    const extras = FIRST_LOOK_LINES - (this._giftDue(s) ? 1 : 0);
    const home = (s.privateMoments || []).find((m) => m.type === "friend_home");
    const at = home && new Date(home.at).getTime();
    const homeWelcome = at && !sharedScreen() && Date.now() - at < FRIEND_WELCOME_MS && this._welcomeDue(s, at);
    // Back after two days or more (E8 A-a): a hop and a welcome first, the news before the
    // care misses, and no away note (this takes its slot). Once per return: seen is rewritten.
    // A close friend's own "welcome home" says it instead (one welcome, room for the news).
    const longAway = !!mark?.seen && Date.now() - mark.seen >= LONG_AWAY_MS;
    if (longAway) {
      if (!homeWelcome) lines.push([turnPick(WELCOME_BACK, `${device}|welcome`), 4500]);
      if (!calm()) this._animate(s, s.pet, "greethop", 1400);
    }
    if (homeWelcome) {
      // A close friend who came home while the card was closed: welcome them first.
      const bond = this._bond(s);
      const first = short(this._hass.user?.name?.trim().split(/\s+/)[0]);
      lines.push([`welcome home, ${(bond?.level >= BOND.nickname && bond.nickname) || first || "friend"}! ♥`, 5000]);
      if (HOME_WEATHER[home.weather]) lines.push([HOME_WEATHER[home.weather], 4500]);
    }
    let wishTold = false;
    // Kept milestones said nowhere here (the card was closed): once, as lines of
    // this look. A browser with no record yet starts from now, so a new one
    // never replays the house's history.
    if (typeof mark?.said === "number") {
      for (const [text, at, type] of this._catchUp(s, mark.said, FIRST_LOOK_LINES - lines.length, { news: longAway })) {
        lines.push([text, 5000, { at }]);
        if (type === "wish_granted") wishTold = true; // the today line won't tell it again
      }
    } else {
      this._seenWrite(device, { said: serverNow() });
    }
    // A week old (gaps-seams 1b): on a first look during its 8th day, once per pet and
    // generation on this browser.
    if (stage.age_days >= 7 && stage.age_days < 8 && lines.length < FIRST_LOOK_LINES && onceEver(`week-${device}-${stage.generation || 1}`)) {
      lines.push([this._pick(WEEK_OLD), 5000]);
    }
    const dreamt = s.house?.dream || stage.dream; // a show or song's, from the house
    // The hold ran out on states that may be yesterday's: no dream or wish this look (their
    // keys stay unused for the next).
    const stale = !!this._resumedAt;
    const dreamLine = !stale && this._dreamText(s, dreamt);
    if (dreamLine && lines.length < FIRST_LOOK_LINES && oncePerDay(`dream-${device}`)) {
      lines.push([dreamLine, 5000]);
      if (dreamt.kind === "picked") this._dreamStoryTold(s, dreamt.pick); // its callback (F2)
    }
    const wish = !stale && stage.wish?.open !== false && !stage.wish?.granted && stage.wish && this._wishLine(stage.wish, s);
    if (wish && lines.length < FIRST_LOOK_LINES && oncePerDay(`wish-${device}`)) lines.push([this._wishSaid(s, stage.wish, wish), 5000, { type: "wish" }]);
    // The day after a cure seen here (E4 M-a): after the wish, before the away note.
    const cured = lines.length < extras && this._curedLine(s);
    if (cured) lines.push([cured, 4500]);
    // A follow-up beat for the viewer (F1, E13, F5, F7), when their mine says one may wait:
    // its slot kept here, as the gift's (the reply is async), after the cure and before
    // the rest (FM Q2 A on the reconcile). A reply of {} leaves it unsaid.
    // A waiting gift keeps its own slot over it, as over the other fresh-expand extras.
    let follow = this._followWanted(s, "look") && lines.length < extras;
    const cap = FIRST_LOOK_LINES - (follow ? 1 : 0);
    const capExtras = extras - (follow ? 1 : 0);
    // What happened while you were out comes after what's new (fresh-moment 2, owner Q2).
    // From TODAY_FROM_HOUR, once a day here: a line about its day, in the away note's place.
    const today = !longAway && this._evening() && lines.length < cap && this._todayLine(s, wishTold);
    const seen = mark?.seen || 0;
    if (today && oncePerDay(`today-${device}`)) lines.push([today, 5000, { away: true }]);
    else if (!longAway && seen && Date.now() - seen >= AWAY_NOTE_AFTER_MS && lines.length < cap) {
      const note = this._awayNote(s, seen);
      if (note) lines.push([note, 5500, { away: true }]);
    }
    // A best friend's own screen, at most once a week (E8 B-a).
    const fav = lines.length < capExtras && this._favLine(s);
    if (fav) {
      lines.push([fav, 4500]);
      this._chirp(s, "win");
    }
    // An adult's new trick, the first look of the month it learns one (E8 LS-a).
    const trick = lines.length < capExtras && this._trickNew(s, stage);
    if (trick) {
      lines.push([turnPick(TRICK_LINES, `${device}|trick`), 4500]);
      s.trickSaid = new Date().toDateString(); // F7's payoff skips this look's (Q5 A)
      if (!calm()) setTimeout(() => this._trickMove(s, trick), 600);
    }
    // A dream story told here 2-4 days ago, once (F2).
    const callback = !stale && lines.length < capExtras && this._dreamCallback(s);
    if (callback) lines.push([callback, 4500]);
    // The pet's own promise (F3): day 0 says it, day 4 (to 7) the payoff, with the move.
    const promise = lines.length < capExtras && this._promiseLook(s);
    if (promise) {
      lines.push([promise.line, 4500]);
      if (promise.move) setTimeout(() => this._promiseMove(s, promise.move), 600);
    }
    // Last, and only if there is room: an adult on how it was raised, once a week.
    const raised = this._state(s, "sensor.life_stage")?.state === "adult" && UPBRINGING_LINES[stage.upbringing];
    if (raised && lines.length < cap && upbringingDue(device)) lines.push([raised, 5000]);
    // Then a gift waiting for the viewer (visitors v2 §5): its slot is kept here, as the
    // reply that says it is async; it wins over the missed visitor (review Q3).
    let gift = this._giftDue(s) && lines.length < cap;
    if (!gift && follow && this._giftDue(s) && lines.length < FIRST_LOOK_LINES) {
      follow = false; // the gift's place stays as it was: the beat waits for a later look
      gift = true;
    }
    const room = FIRST_LOOK_LINES - (gift ? 1 : 0) - (follow ? 1 : 0);
    // Very last, flavour: today's visitor came and went with nobody here to see it
    // (its window over, the day's visit flag unset). Said once, and the flag used up,
    // so the visit can't also play; only with room, so it never pushes a line out.
    // A day visitor on a day screen isn't told: it comes by live instead (_visitorLate).
    const missed = !this._visitorLate(s) && this._visitorMissed(s);
    if (missed && lines.length < room && oncePerDay(`visit-${device}`, this._visitDay(s))) {
      const baby = this._babyStage(s) === "baby";
      // Their favourite, on their own screen, in its own line (opp #4).
      const fav = !baby && !sharedScreen() && s.mine?.fav_visitor === missed.id && FAVV_LINES.missed(missed.name);
      lines.push([baby ? "hi hi! ♪" : fav || missed.catchup || `a ${missed.name} came by today ♪`, 4500, { cls: FLAVOUR }]);
    }
    for (const [text, ms, opts] of lines.slice(0, FIRST_LOOK_LINES)) this._queue(s, text, ms, opts);
    // A missed day visitor comes by right after this look's first line, not after them
    // all (fresh-moment 3, review s2622 #7): _visitorTick starts it once the queue is down
    // to the rest and the line on show is done.
    s.lateVisit = this._visitorLate(s) ? { left: Math.max(Math.min(lines.length, FIRST_LOOK_LINES) - 1, 0), made: Date.now() } : null;
    s.giftAgain = false; // this look is the one a tab coming back would have had
    if (gift) this._giftTake(s);
    if (follow) this._followFetch(s);
  }

  // --- Follow-ups (fresh-expand F1, E13) ------------------------------------------
  // The viewer's own: never on a shared screen. The text they type is sent once over the
  // websocket (never a service, so never on the bus), said back only in the reply to
  // them, and written as text. Nothing of it is kept in this browser.

  // at: "look" (a first look, a tab's return, the evening) or "picker" (F6); only when
  // the viewer's own mine says a beat may wait there today.
  _followWanted(s, at = "look") {
    return !sharedScreen() && !!this._hass?.user && !!s.ids?.["sensor.life_stage"] && !s.following &&
      Array.isArray(s.mine?.follow_at) && s.mine.follow_at.includes(at);
  }

  // One virtual_pet/follow: the server marks the beat said for this person (their other
  // screens get {}). An older server has no command: nothing is said.
  async _followFetch(s, at = "look") {
    const entity = s.ids?.["sensor.life_stage"];
    if (!this._followWanted(s, at)) return null;
    const clock = this._followClock(s);
    // Audit 0.43.0 F-01: an evening's "how did it go?" would take the open question's
    // answer (and may not show): wait for a later tick, not consumed.
    if (at === "look" && clock.eve && (s.asking || s.game)) return null;
    s.following = true;
    let reply = null;
    try {
      reply = await this._hass.callWS({ type: "virtual_pet/follow", entity_id: entity, at });
      // F-02: the evening is tried once a day, but only once the server has answered.
      // A deferred evening (the server's open question first) isn't tried yet.
      if (at === "look" && clock.eve && !reply?.deferred) s.followEve = clock.day;
      else if (at === "look" && clock.eve) s.followRetry = Date.now() + FOLLOW_RETRY_MS;
    } catch (err) {
      reply = null; // an older server: no follow-ups; a failed call tries again later
      if (at === "look" && clock.eve) s.followRetry = Date.now() + FOLLOW_RETRY_MS;
    }
    s.following = false;
    if (!reply?.kind || sharedScreen() || s.ids?.["sensor.life_stage"] !== entity) return null;
    if (at === "picker") return reply; // F6: the picker says it
    // Audit s2635 H1: a big day's evening is its "how did it go?" (opp #1), asked in this
    // slot with how_day's buttons; the plain evening line only when an ask can't show.
    if (reply.ask === "big_how" && !s.asking && !s.game) {
      const it = this._followIt(reply);
      s.asking = true;
      (s.queue ??= []).push({ text: it ? BIG_DAY.howText(it) : BIG_DAY.how, ms: ASK_MS, ask: true, cls: KEPT, perk: true,
        then: () => this._ask(s, "big_how", entity) });
      return reply;
    }
    // F7: one trick line a look: LS-a's monthly one said here today wins (Q5 A).
    if (reply.kind === "trick" && s.trickSaid === new Date().toDateString()) return null;
    const line = this._followLine(s, reply);
    if (!line) return null;
    const soft = reply.kind === "soft";
    const move = reply.kind === "trick" && this._trickToShow(s);
    if (move) s.followTrick = { move, day: new Date().toDateString() }; // in its idle moves today
    this._queue(s, line, 5000, {
      personal: true, type: "follow", still: () => !sharedScreen(),
      then: soft && !calm() ? () => this._bondHearts(s) : move && !calm() ? () => this._trickMove(s, move) : undefined,
    });
    return reply;
  }

  // F7: a trick the pet hasn't learned yet (a teen's first; an adult's next), or null.
  _trickToShow(s) {
    const st = this._state(s, "sensor.life_stage");
    const learned = st?.state === "adult" ? tricksBy(trickMonth(st.attributes?.age_days)) : [];
    return TRICKS.find((t) => !learned.includes(t)) || null;
  }

  // The day and whether it is the evening, by Home Assistant's clock (audit 0.43.0 F-03):
  // the server decides the beats by it, so the gate and the daily marker follow it. An
  // older server sends none: this browser's clock, as before.
  _followClock(s) {
    const m = s.mine;
    if (typeof m?.follow_day === "string" && typeof m.follow_evening === "boolean") {
      return { day: m.follow_day, eve: m.follow_evening };
    }
    const now = new Date();
    return { day: now.toDateString(), eve: now.getHours() >= FOLLOW_EVENING_HOUR };
  }

  // Once at the first tick from FOLLOW_EVENING_HOUR on a day (a big day's evening beat).
  _followEvening(s) {
    const clock = this._followClock(s);
    if (!s.lookedFirst || s.asleep || !clock.eve) return;
    if (s.followEve === clock.day || !this._followWanted(s) || !this._channelHeard(s)) return;
    if (s.queue?.length || s.asking || s.game) return; // the first look's lines first: a fourth would crowd them
    if (s.followRetry && Date.now() < s.followRetry) return; // a deferred or failed try waits, not every tick
    this._followFetch(s);
  }

  // A beat's line: E13's soft morning (the type's 2 and the shared 4; a baby's own), or
  // a big day's morning or evening, with their words or the type's and the shared 3.
  _followLine(s, reply) {
    const device = s.ids?.device;
    const type = PERSONA[this._typeKey(s)] || {};
    if (reply.kind === "soft") {
      const baby = this._babySet(s, "soft");
      return baby ? pick(baby) : turnPick([...(type.soft || []), ...SOFT_MORNING], `${device}|soft`);
    }
    if (reply.kind === "big_day" && (reply.beat === "morning" || reply.beat === "evening")) {
      const am = reply.beat === "morning";
      const it = this._followIt(reply);
      const salt = `${device}|bigday|${reply.beat}`;
      if (it) return turnPick(am ? BIG_DAY.amText : BIG_DAY.pmText, salt)(it);
      return turnPick([...((am ? type.bigday_am : type.bigday_pm) || []), ...(am ? BIG_DAY.am : BIG_DAY.pm)], salt);
    }
    if (reply.kind === "weekend" && reply.beat === "monday") {
      const it = this._followIt(reply);
      return it ? turnPick(WEEKEND.monText, `${device}|weekend`)(it) : turnPick(WEEKEND.mon, `${device}|weekend`);
    }
    if (reply.kind === "trick" && reply.beat === "shown") return turnPick(TRICK_ASK.shown, `${device}|trickshown`);
    return null;
  }

  // Their words for this beat: this browser's own copy (it typed them), else the server's
  // on a phone or the app only (owner Q2 A); else none, and the plain line is said.
  _followIt(reply, server = true) {
    const user = this._hass?.user?.id;
    const own = user && followTextRead(user, reply.kind);
    if (own) return cleanTyped(own);
    return server && phoneLike() ? cleanTyped(reply.text) : null;
  }

  // A follow-up answer, fire and forget: only to a server that takes them, never on a
  // shared screen, never stashed or retried.
  _sendFollow(s, entity, question, answer, text = null, day = null) {
    if (!this._followOk || sharedScreen() || !entity) return Promise.resolve(false);
    const msg = { type: "virtual_pet/answer", entity_id: entity, question, answer };
    if (text) msg.text = text;
    if (day) msg.day = day; // the big day's (opp #2)
    return this._hass.callWS(msg).then((r) => r || true, () => false);
  }

  // After a big day's "yes": "what is it?", then one input with "ok" and "skip". However
  // it ends (ok, skip, empty, the time, a slide switch, the tab hiding) the "yes" is sent
  // once, with the text only if there is one.
  _askTextStart(s, entity, kind = "big_day", day = null) {
    if (!this._followOk || sharedScreen()) {
      this._sendFollow(s, entity, kind, "yes", null, day);
      return;
    }
    const step = s.textStep = { entity, kind, day, sent: false, until: Date.now() + ASK_MS * 2 };
    s.asking = true;
    (s.queue ??= []).push({ text: BIG_DAY.what, ms: ASK_MS, ask: true, cls: KEPT, perk: true, then: () => this._askText(s, step) });
  }

  _askText(s, step) {
    if (s.textStep !== step || s.ids?.["sensor.life_stage"] !== step.entity || sharedScreen()) {
      this._askTextEnd(s);
      return;
    }
    s.screen.querySelector(".askday")?.remove();
    const box = document.createElement("div");
    box.className = "askday asktext";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", BIG_DAY.what);
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = FOLLOW_TEXT_MAX;
    input.autocomplete = "off";
    input.setAttribute("enterkeyhint", "done");
    input.setAttribute("aria-label", BIG_DAY.what);
    const ok = document.createElement("button");
    ok.textContent = "ok";
    const skip = document.createElement("button");
    skip.textContent = "skip";
    // Nothing typed here reaches the screen behind, or HA's own shortcuts (e, c, a, m).
    for (const type of ["click", "change", "pointerdown", "pointerup", "keydown", "keyup", "keypress"]) {
      box.addEventListener(type, (e) => e.stopPropagation());
    }
    ok.addEventListener("click", () => this._askTextEnd(s, cleanTyped(input.value), true));
    skip.addEventListener("click", () => this._askTextEnd(s, null, true));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._askTextEnd(s, cleanTyped(input.value), true);
    });
    box.append(input, ok, skip);
    s.screen.append(box);
    this._askPlace(s, box);
    step.box = box;
    step.until = Date.now() + ASK_MS + 1000;
    step.timer = setTimeout(() => this._askTextEnd(s), ASK_MS);
  }

  _askTextEnd(s, text = null, said = false) {
    const step = s.textStep;
    if (!step || step.sent) return;
    step.sent = true;
    s.textStep = null;
    step.box?.remove();
    clearTimeout(step.timer);
    s.asking = false;
    if (s.queue?.length) s.queue = s.queue.filter((q) => q.text !== BIG_DAY.what || !q.ask);
    // "I'll remember" only once the server kept it (a step ending past midnight is refused).
    const kind = step.kind || "big_day";
    const user = this._hass?.user?.id;
    this._sendFollow(s, step.entity, kind, "yes", text, step.day).then((ok) => {
      if (ok && text && user && typeof ok.until === "string") followTextKeep(user, kind, text, ok.until);
      else if (ok && user) followTextKeep(user, kind, "", "0000-00-00"); // no words: an old copy goes
      if (ok && said && s.ids?.["sensor.life_stage"] === step.entity) this._line(s, MINE, BIG_DAY.kept, 3500);
    });
  }

  // --- Gifts (plan visitors v2 §5) ----------------------------------------------
  // Only the viewer's own `mine.gift`, never on a shared screen (there it waits), and
  // nothing of it in localStorage. Said at a first look, or when the tab comes back
  // after being hidden at least AWAY_NOTE_AFTER_MS (owner Q1); never while watching.

  _giftDue(s) {
    return findsShown() && !!s.mine?.gift && !sharedScreen() && !s.gifting;
  }

  // The take: one virtual_pet/collect {gift}, and only a non-empty reply speaks (another
  // screen of the same person may have taken it: {gift: null}). The reply alone decides:
  // the server's push of mine.gift = null to this screen arrives before it. An error (an
  // older server, or `shared`) is no gift.
  async _giftTake(s) {
    const entity = s.ids?.["sensor.life_stage"];
    if (!entity || !this._hass || !findsShown()) return;
    s.gifting = true;
    const epoch = s.giftEpoch = (s.giftEpoch || 0) + 1;
    let gift = null;
    try {
      const reply = await this._hass.callWS({ type: "virtual_pet/collect", entity_id: entity, gift: true, shared: false });
      gift = reply?.gift || null;
    } catch (err) {
      console.warn("hatch-pet-card: the gift", err?.message || err);
    }
    if (s.giftEpoch !== epoch || s.ids?.["sensor.life_stage"] !== entity) return; // dropped meanwhile
    s.gifting = false;
    const find = gift && typeof gift.world === "string" && findOf(this._worlds, gift.world, gift.id);
    if (!find || sharedScreen()) return; // one this card doesn't know: nothing
    const g = { id: find.id, world: gift.world };
    this._queue(s, this._giftLine(s, find), GIFT_LINE_MS, {
      type: "gift", still: () => !sharedScreen(), then: () => this._giftPop(s, g),
    });
  }

  // V5 for an ordinary find, V6 for a gift-only one, V7 (BABY.gift) for a baby.
  _giftLine(s, find) {
    const normal = !find.gift_only ? GIFT_LINES.find(find.name)
      : GIFT_MADE.includes(find.id) ? GIFT_LINES.made : GIFT_LINES.found;
    const baby = this._babySet(s, "gift");
    return baby ? pick(baby) : normal;
  }

  // The gift pops up above the pet as its line is said (a reveal's look, with no basket,
  // the basket left as it is, no sparkle); still under reduced motion. Gone with the line.
  _giftPop(s, g) {
    this._giftPopEnd(s);
    if (sharedScreen() || !s.screen) return;
    const el = document.createElement("div");
    el.className = "reveal gift";
    el.innerHTML = '<img class="rf" alt="">';
    const img = el.firstChild;
    img.src = `${BASE}/ui/find_${g.world}_${g.id}.png?v=${VERSION}`;
    img.dataset.find = `${g.world}/${g.id}`;
    if (!calm()) img.classList.add("pop");
    s.screen.append(el);
    const until = Date.now() + GIFT_LINE_MS;
    const P = s.giftPop = { el, until, timer: setTimeout(() => this._giftPopEnd(s), GIFT_LINE_MS) };
    if (!(s.flairUntil > until)) s.flairUntil = P.until; // a pat wiggles; nothing else starts
    if (!(s.visitUntil > until)) s.visitUntil = P.until;
  }

  // The pop gone (its line's time is up, or the slide's gift is dropped).
  _giftPopEnd(s) {
    const P = s.giftPop;
    if (P) {
      s.giftPop = null;
      clearTimeout(P.timer);
      P.el.remove();
      if (s.flairUntil === P.until) s.flairUntil = 0;
      if (s.visitUntil === P.until) s.visitUntil = 0;
    }
  }

  // The gift's state on a slide forgotten: the pop, its line, and a take still on its
  // way (its reply is dropped). On a shared screen, another pet, or the card leaving.
  _dropGift(s) {
    this._giftPopEnd(s);
    s.giftEpoch = (s.giftEpoch || 0) + 1;
    s.gifting = false;
    if (s.queue?.length) s.queue = s.queue.filter((q) => q.type !== "gift");
  }

  // Owner Q1: the tab came back after being hidden at least AWAY_NOTE_AFTER_MS, and a
  // gift waits: taken now, under the first look's own conditions (each tick until they
  // hold, for the slide on show). A first look in between uses it up.
  _giftReturn(s) {
    if (!s.giftAgain || !s.lookedFirst || !this._channelHeard(s)) return;
    const away = this._state(s, "sensor.mood")?.state === "away";
    if (!s.species || s.asleep || away || this._eggMinutes(this._state(s, "sensor.life_stage")) !== null) return;
    s.giftAgain = false;
    if (this._giftDue(s)) this._giftTake(s);
    if (this._followWanted(s)) this._followFetch(s); // F1: a beat may be due now
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
  _wishSaid(s, wish, line, date = turnNow()) {
    if (this._aimedAtMe(wish, s)) return line[0];
    // W-a (fresh-expand E6): its first line and WISH_MORE's take turns, a day each.
    const more = WISH_MORE[wish.kind];
    const said = more ? turnPick([line[0], ...more], `${s.ids?.device}|wish|${wish.kind}`, date) : line[0];
    return this._lines(s, `WISHES.${wish.kind}`, said).text;
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
    if (line && oncePerDay(`wishmention-${s.ids?.device}`)) this._queue(s, this._wishSaid(s, wish, line), 4500, { type: "wish" });
  }

  // When this device last saw the pet (for the away note), every minute.
  _seen(s) {
    const now = Date.now();
    if (this._resumeHeld()) return; // a tab back: its first look reads the old mark first (fresh-moment 1)
    if (s.seenAt && now - s.seenAt < 60000) return;
    s.seenAt = now;
    this._seenWrite(s.ids?.device, { seen: now }); // said stays as it is
  }

  // The kept moments since said that this look should catch up: [line, at],
  // oldest first, the newest room of them. The public list, and on a personal
  // screen the viewer's own (s.privateMoments); never friend_home or tucked_in
  // (CATCHUP_SKIP) and never flavour; at most one care_miss.
  _catchUp(s, said, room, { news = false } = {}) {
    if (room <= 0) return [];
    const pub = (this._state(s, "sensor.last_care")?.attributes.moments || []).filter((m) => !CHANNEL_ONLY.has(m.type));
    const own = sharedScreen() ? [] : s.privateMoments || [];
    // Already waiting in the queue (a kept line queued while off show): not said twice.
    const waiting = new Set((s.queue || []).filter((q) => q.at).map((q) => new Date(q.at).getTime()));
    const seen = new Set();
    const missed = [...pub, ...own]
      .filter((m) => m?.type && MOMENT_CLASS[m.type] === KEPT && !CATCHUP_SKIP.has(m.type) &&
        new Date(m.at).getTime() > said && !waiting.has(new Date(m.at).getTime()) && !seen.has(momentKey(m)) && seen.add(momentKey(m)))
      .sort((a, b) => new Date(b.at) - new Date(a.at));
    // Back after days (E8 A-a): what happened goes before the care misses.
    if (news) missed.sort((a, b) => (a.type === "care_miss") - (b.type === "care_miss"));
    const out = [];
    let miss = false;
    for (const m of missed) {
      if (out.length >= room) break;
      // Care misses say one line between them (the newest), leaving room for the rest.
      if (m.type === "care_miss" && miss) continue;
      if (m.type === "care_miss") miss = true;
      const text = this._catchUpLine(s, m);
      if (text) out.push([text, m.at, m.type]);
    }
    return out.reverse();
  }

  // A missed milestone in the words of the next look (C5), or its own line.
  _catchUpLine(s, m) {
    if (m.type === "stage_changed") {
      if (m.stage === "baby" || !m.stage) return null; // hatching says hello
      const a = /^[aeiou]/.test(m.stage) ? "an" : "a";
      return this._lines(s, "catchup_stage", `guess what! i'm ${a} ${m.stage} now!`).text;
    }
    if (m.type === "trait_learned") {
      return this._lines(s, "catchup_trait", `I learned something: ${String(m.trait).replaceAll("_", " ")}!`).text;
    }
    if (m.type === "hatched") return this._lines(s, "catchup_hatched", "hello! i hatched while you were away").text;
    // The rest say what they would have said then (nothing else happens).
    const said = [];
    this._moment(s, m, said);
    return said[0] || null;
  }

  // "while you were out, I napped, watched the rain and had a snack!": up to
  // three things from the moments and care since the device last looked.
  _awayNote(s, since) {
    const bits = this._dayBits(s, since);
    // A nap alone isn't news (fresh-moment 2, owner Q2): no note.
    if (bits.every((b) => b === "napped")) return null;
    const list = bits.slice(0, 2); // two at most: a bubble on a 330 px card
    return `while you were out, I ${list.join(" and ")}!`;
  }

  // What the pet did since then, newest first, as bits ("watched TV"): its moments, the
  // finds while shown, then care unless care is false (the away note's, and the
  // evening's today line's, which leaves care out).
  _dayBits(s, since, care = true) {
    const lastCare = this._state(s, "sensor.last_care")?.attributes || {};
    const after = (at) => new Date(at).getTime() > since;
    const bits = [];
    const add = (b) => { if (b && !bits.includes(b)) bits.push(b); };
    const MOMENT_BITS = {
      fell_asleep: "napped", woke_up: "napped", watching: "watched TV", listening: "listened to music",
      tv_on: "watched TV", music_on: "listened to music", // the public stand-ins, with no title
      news: "heard some news", sunset: "watched the sunset", wish_granted: "got my wish",
      trait_learned: "learned something new", first_snow: "saw the first snow",
      first_warm: "felt the first warm day", first_fog: "saw the first fog", // E12 Se-a
      robot_out: HOUSE_LINES.bits.robot, robot_home: HOUSE_LINES.bits.robot, // H4
      appliance_done: HOUSE_LINES.bits.machine, // H6
    };
    const houseBit = (m) => HOUSE_LINES.bits[Object.hasOwn(HOUSE_CATEGORY, m.category ?? "") ? HOUSE_CATEGORY[m.category].bit : ""]; // H8
    const WEATHER_BITS = { rain_started: "watched the rain", snow_started: "saw snow", rainbow: "saw a rainbow", sun_out: "sunbathed" };
    const CARE_BITS = { feed: "had a meal", snack: "had a snack", play: "played", game: "played a game", clean: "had a bath", chore_treat: "got a chore treat" };
    let found = 0; // "found <a find>": one a find (V8), newest first, FOUND_BITS at most
    for (const m of [...(lastCare.moments || [])].reverse()) {
      if (!after(m.at)) continue;
      if (m.type === "found") {
        if (findsShown() && found < FOUND_BITS && foundBit(this._worlds, m)) {
          found++;
          add(foundBit(this._worlds, m));
        }
        continue;
      }
      add(m.type === "weather" ? WEATHER_BITS[m.change]
        : m.type === "house_answered" ? HOUSE_LINES.bits[HOUSE_REQUEST[m.request]]
        : m.type === "season_start" ? Object.hasOwn(SEASON_START_BITS, m.season ?? "") && SEASON_START_BITS[m.season]
        : m.type === "house_moment" ? houseBit(m) : MOMENT_BITS[m.type]);
    }
    for (const e of care ? [...(lastCare.log || [])].reverse() : []) {
      if (after(e.at) && (e.result === "ok" || e.result === "won" || e.result === "lost")) add(CARE_BITS[e.action]);
    }
    return bits;
  }

  // The evening's line about the pet's own day (fresh-moment 4, owner Q4), a teen's or
  // adult's: today's wish come true (unless this look's catch-up just told it), else a
  // visitor seen here today, else the newest of today's moments as a bit (not a nap, no
  // care), else its type's line. Names nobody and never an open wish, so a shared
  // screen gets it too. null: nothing to say (the away note's turn).
  _todayLine(s, wishTold = false) {
    const life = this._state(s, "sensor.life_stage");
    if (life?.state !== "teen" && life?.state !== "adult") return null;
    const wish = life.attributes?.wish;
    const toldLive = usedToday(`todaywish-${s.ids?.device}`); // said live already (E6 W-b)
    if (wish?.granted && !wishTold && !toldLive && TODAY_WISH[wish.kind]) return TODAY_WISH[wish.kind];
    const seen = this._visitSeen(s);
    if (seen) return `a ${seen} visited me today ♪`;
    const midnight = new Date().setHours(0, 0, 0, 0);
    const bit = this._dayBits(s, midnight, false) // a find's bit, once shown, only if the line fits
      .find((b) => b !== "napped" && b !== "got my wish" && `today I ${b}! ♪`.length <= 40);
    if (bit) return `today I ${bit}! ♪`;
    const type = this._persona(s);
    return type ? dailyPick(type.today, `${s.ids?.device}|today`) : null;
  }

  // The evening, for the today line: from TODAY_FROM_HOUR on this device's clock.
  _evening() {
    return new Date().getHours() >= TODAY_FROM_HOUR;
  }

  // The name of today's world visitor if it came by live on this device (for the today
  // line), else null. One key per device, overwritten: nothing piles up.
  _visitSeen(s) {
    try {
      const seen = JSON.parse(localStorage.getItem(`hatch-visitseen-${s.ids?.device}`) || "null");
      return seen?.day === this._visitDay(s).toDateString() ? seen.name : null;
    } catch (err) {
      return null;
    }
  }

  _hourHello(first) {
    const hour = new Date().getHours();
    return !first
      ? (hour < 12 ? "morning!" : hour < 18 ? "hi!" : "evening!")
      : hour < 12 ? `morning, ${first}!` : hour < 18 ? `hi, ${first}!` : `evening, ${first}!`;
  }

  // Today's greeting is said already (the hatch's hello): no "hi, <name>!" for this person on this device.
  _greetSpent(s) {
    s.greeted = true;
    try {
      localStorage.setItem(`hatch-greet-${this._hass.user?.id}-${s.ids?.device}`, String(Date.now()));
    } catch (err) {
      // no storage: once per page load, as _greet
    }
  }

  _greet(s) {
    if (s.greeted || !this._channelHeard(s) || !this._free(s)) return;
    // An egg doesn't talk (C15'): the greeting waits for the hatch, and its key stays unwritten (F2).
    if (this._state(s, "sensor.life_stage")?.state === "egg") return;
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
    const isCalm = calm();
    if (level >= BOND.hop && !isCalm) this._animate(s, s.pet, "greethop", 1400);
    else this._animate(s, s.pet, "perk", 320);
    if (level >= BOND.hearts && !isCalm) this._bondHearts(s);
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
      Date.now() - (s.visitedAt || 0) < VISIT_EVERY_MS || this._resumeHeld()) return;
    s.visitedAt = Date.now();
    // Only kept lines count: a waiting beat or flavour may yet be dropped.
    const queued = Math.min((s.queue || []).filter((q) => lineClass(q) >= KEPT).length + (s.following ? 1 : 0), 6);
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
        if (reply.follow === 1) this._followOk = true; // F1: it takes typed text and follow-ups
        (reply.notes || []).forEach((note) => this._note(s, note, !!reply.made_room));
        const ask = reply.ask;
        if (QUESTIONS[ask] && !s.asking) {
          s.asking = true;
          (s.queue ??= []).push({ text: this._askLine(ask), ms: ASK_MS, ask: true, cls: KEPT, perk: true, then: () => this._ask(s, ask, id) });
        }
      })
      .catch(() => {
        // an older integration has no visit: no bond yet, nothing else changes
      });
  }

  // Something the pet has to tell only the viewer (from the visit).
  _note(s, note, madeRoom = false) {
    // F2 (FM Q4 A): with the dream's pick on the sensor, the first look tells everyone its
    // story once a day here (dream-<device>). The asker's note carries it: the story too
    // when the look had no room for it (the key unspent, so spent now), then the tail
    // ("you": their own story, then the tail). Nobody else's note repeats it.
    const picked = note.kind === "dream" && this._state(s, "sensor.life_stage")?.attributes?.dream;
    if (picked?.kind === "picked" && picked.pick === note.pick && Object.hasOwn(DREAM_STORIES, note.pick)) {
      if (!note.yours) return;
      const device = s.ids?.device;
      const untold = oncePerDay(`dream-${device}`);
      if (untold && note.pick !== "you") {
        this._queue(s, this._dreamStory(s, note.pick), 5000, { personal: true });
        this._dreamStoryTold(s, note.pick);
      }
      if (note.pick === "you") this._queue(s, turnPick(this._storyList(s, "you"), `${device}|dream|you`), 5000, { personal: true });
      this._queue(s, turnPick(DREAM_TAIL, `${device}|dreamtail`), 4000, { personal: true });
      return;
    }
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
      (s.queue ??= []).push({ text: line, ms: 5000, personal: true, cls: KEPT, perk: true, then: () => {
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
      if (!calm()) this._bondHearts(s);
    }
  }

  // E14: the week strip, oldest first, from the life stage sensor's `week`: no fixed seven
  // slots, no blanks, no counts. Each day's label says what its glyphs show.
  _weekStrip(s) {
    const week = this._state(s, "sensor.life_stage")?.attributes.week;
    if (!Array.isArray(week)) return "";
    const list = visitorList(this._worlds?.[s.worldKey]);
    const cells = week.map((c) => {
      if (!c || typeof c.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(c.day)) return "";
      const v = findsShown() && c.visit && list.find((x) => x.id === c.visit && x.name);
      const words = [c.dream && WEEK_WORD.dream, WEEK_WORD[c.weather], v && `the ${v.name}`].filter(Boolean);
      if (!words.length) return "";
      const day = DAY_SHORT[new Date(`${c.day}T12:00`).getDay()];
      const icons = (c.dream ? "✦" : "") + (WEEK_GLYPH[c.weather] || "") +
        (v ? `<img src="${BASE}/ui/visitor_${s.worldKey}_${v.id}_1.png?v=${VERSION}" alt="">` : "");
      return `<span class="wday" role="listitem" aria-label="${escape(`${day}: ${words.join(", ")}`)}">` +
        `<b aria-hidden="true">${day}</b><span aria-hidden="true">${icons}</span></span>`;
    }).filter(Boolean);
    return cells.length ? `<div class="jweek" role="list" aria-label="this week">${cells.join("")}</div>` : "";
  }

  // A question's line from the visit's ask. (The big day's evening comes as its follow
  // beat now, audit s2635 H1, which names it as the beats do; here only this browser's copy.)
  _askLine(kind) {
    const it = kind === "big_how" && this._followIt({ kind: "big_day" }, false);
    return it ? BIG_DAY.howText(it) : QUESTIONS[kind].q;
  }

  // While it asks, the pet steps back (F8): up so its feet stand on the chips' top, smaller to fit
  // under the bubble, or, when the bubble and the chips leave no room, beside the bubble. Measured
  // once the chips and the line are on show; the CSS (--ask-dx/dy/f) does the move, in 2 steps.
  _askPlace(s, box) {
    const scr = s.screen;
    const pet = s.pet;
    if (!pet || pet.offsetParent !== scr || !scr.clientHeight) return;
    const k = Number(pet.style.scale) || 1;
    const W = scr.clientWidth;
    const petH = pet.offsetHeight * k;
    const petW = pet.offsetWidth * k;
    const stand = box.offsetTop - 4; // where its feet go
    const bubble = s.bubble.offsetHeight ? s.bubble : null;
    const under = bubble ? bubble.offsetTop + bubble.offsetHeight + 2 : 0;
    let f = Math.min(0.9, (stand - under) / petH);
    let dx = 0;
    if (f < 0.6) { // no room under the bubble: beside it, above the chips
      f = Math.min(0.9, Math.max(0.4, (stand - 4) / petH));
      const w = petW * f;
      const right = bubble ? bubble.offsetLeft + bubble.offsetWidth + 4 + w / 2 : W / 2;
      dx = Math.min(W - 2 - w / 2, Math.max(W / 2, right)) - W / 2;
    }
    const dy = Math.min(0, stand - (pet.offsetTop + pet.offsetHeight));
    scr.style.setProperty("--ask-dx", `${Math.round(dx)}px`);
    scr.style.setProperty("--ask-dy", `${Math.round(dy)}px`);
    scr.style.setProperty("--ask-f", f.toFixed(2));
  }

  // A question with its answers as buttons (the line is already in the bubble).
  _ask(s, kind, entity = s.ids?.["sensor.life_stage"]) {
    const question = QUESTIONS[kind];
    if (!question || s.game || s.ids?.["sensor.life_stage"] !== entity) {
      s.asking = false; // a game, or another pet on this slide now: not now
      return;
    }
    s.screen.querySelector(".askday")?.remove();
    if (s.confirm?.key === "lay_egg") s.confirm = null; // an armed lay can't carry on under a question (F1)
    const box = document.createElement("div");
    box.className = "askday";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", question.q);
    const mine = this._state(s, "sensor.life_stage")?.attributes.catchphrase || "mine";
    const answers = question.options ? question.options(s)
      : Object.keys(kind === "big_how" ? QUESTIONS.how_day.answers : question.answers);
    box.classList.toggle("many", answers.length > 3);
    box.classList.toggle("bdaybox", kind === "birthday");
    box.classList.toggle("wide", answers.length > 6); // seven days: four and three, not three rows
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
    box.addEventListener("change", wait);
    box.addEventListener("click", (e) => {
      const stepper = e.target.closest("button[data-step]");
      if (stepper) {
        wait();
        question.step?.(box, stepper.dataset.step, Number(stepper.dataset.dir));
        this._tapped(stepper);
        return;
      }
      let answer = e.target.closest("button")?.dataset.answer;
      if (!answer) return;
      if (question.value) answer = question.value(box, answer);
      if (!answer) return;
      this._tapped(e.target.closest("button"));
      done();
      s.answeredAt = Date.now();
      // The question line's own hold ends with its answer (F4): the next line is not kept
      // waiting behind it.
      s.sayUntil = 0;
      // The big day's "yes": which day, as its own ask (opp #2); no reply line before it.
      if (kind === "big_day" && answer === "yes") {
        s.asking = true;
        (s.queue ??= []).push({ text: BIG_DAY.which, ms: ASK_MS, ask: true, cls: KEPT, perk: true,
          then: () => this._ask(s, "big_day_day", entity) });
        this._sayQueued(s);
        return;
      }
      const howLike = kind === "how_day" || kind === "big_how"; // opp #1: how_day's replies
      const lines = howLike ? QUESTIONS.how_day.answers[answer]
        : question.answers[answer] ?? question.answers[e.target.closest("button").dataset.answer];
      // how_day's answers in the type's own words half the time (fresh-expand E7, Q-a).
      // The reply is the viewer's own act: kept like a care press, so no flavour line or
      // beat replaces it a moment later (F5).
      this._line(s, MINE, question.reply ? question.reply(answer, s, mine)
        : howLike ? this._lines(s, `reply_${answer}`, pick(lines)).text : pick(lines), 4500);
      const isCalm = calm();
      if (["great", "you"].includes(answer) && !isCalm) this._animate(s, s.pet, "greethop", 1400);
      else if (["tough", "not really"].includes(answer) && !isCalm) this._bondHearts(s);
      else this._animate(s, s.pet, "perk", 320);
      if (question.keep) this._keepAnswer(s, kind, answer, entity);
      // Follow-ups (F1, E13): a tough day goes to the server (memory only, a softer
      // morning tomorrow); a big day's "yes" asks what it is first. Never stashed.
      if (howLike && answer === "tough") this._sendFollow(s, entity, kind, "tough");
      if (kind === "big_day_day") this._askTextStart(s, entity, "big_day", answer);
      if (kind === "weekend" && answer === "yes") this._askTextStart(s, entity, kind);
      if (kind === "game") this._sendFollow(s, entity, "game", answer); // F6: the choice
      if (kind === "trick" && answer === "yes") this._sendFollow(s, entity, "trick", "yes");
      if (kind === "phone" && answer === "yes") {
        this._setNotify(s, true).then((ok) => {
          if (!ok && s.ids?.["sensor.life_stage"] === entity) this._write(s, "hm, that one slipped away ♪", 3500);
        });
      }
    });
    s.screen.append(box);
    this._askPlace(s, box);
    s.askTimer = setTimeout(done, ASK_MS);
    // The phone question is asked for good only once it's on screen (top10 1a): one
    // dropped before this comes again another day. A websocket answer, off the bus.
    if (kind === "phone") {
      this._hass.callWS({ type: "virtual_pet/answer", entity_id: entity, question: "phone", answer: "shown" })
        .catch(() => {}); // an older server, or a lost reply: it may ask again, once
    }
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
          // The server will not take it (the same person answered on another screen, or the
          // question ran out): the pet said it will remember, and nothing slipped. Silent (F6).
          if (err?.code === "not_asked" || err?.code === "invalid_answer") return;
          // A stashed kind is resent quietly later (_resendAnswers): not lost either.
          if (user && STASHED_QUESTIONS.includes(kind) && !sharedScreen()) {
            const list = stashedAnswers(user).filter((a) => a.question !== kind);
            list.push({ question: kind, answer, at: Date.now(), entity });
            saveStashedAnswers(user, list);
            return;
          }
          if (s.ids?.["sensor.life_stage"] === entity) this._line(s, MINE, "hm, that one slipped away ♪", 3500, { write: true });
        });
      }, ANSWER_RETRY_MS);
    });
  }

  // Hearts that float up around the pet: only for someone it's very close to.
  // The infrared link's hearts are "linkhearts", so they never touch a bond's.
  _bondHearts(s, kind = "bondhearts") {
    s.screen.querySelector(`.${kind}`)?.remove();
    const box = document.createElement("div");
    box.className = kind;
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
    const all = s.scene ? s.scene.frames || s.frames || []
      : s.linking && s.linkFrames?.length ? s.linkFrames
      : s.poseUntil && Date.now() < s.poseUntil ? s.poseFrames
      : s.patPoseUntil > Date.now() && s.patPoseFrames ? s.patPoseFrames : s.frames || [];
    return all.length > 1 && calm() ? all.slice(0, 1) : all; // calm: a still picture
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

  // Heat shimmer (fx-heat) or cool wisps (fx-cool) over the screen for 2.5 s as the house
  // answers: a CSS stand-in until the art (house_heat, house_cool) lands.
  // One house effect at a time: a new one replaces the last.
  _houseFx(s, cls) {
    s.screen.classList.remove("fx-heat", "fx-cool", "fx-suds", "fx-tumble", "fx-chime");
    s.screen.classList.add(cls);
    clearTimeout(s.houseFxTimer);
    s.houseFxTimer = setTimeout(() => s.screen.classList.remove(cls), 2500);
  }

  // The robot vacuum's stand-in (fx-robot, 6 s across the floor line) until the art
  // (house_robot) lands; the screen's width sets how far it goes.
  _robotFx(s) {
    s.screen.style.setProperty("--robot-w", `${(s.screen.clientWidth || 400) - 22}px`);
    s.screen.classList.add("fx-robot");
    clearTimeout(s.robotTimer);
    s.robotTimer = setTimeout(() => s.screen.classList.remove("fx-robot"), 6000);
  }

  _sparkle(s) {
    const ring = document.createElement("span");
    ring.className = "burst big";
    s.screen.append(ring);
    setTimeout(() => ring.remove(), 600);
  }

  // Something happened in HA: show it. From sensor.last_care "moments", or
  // from the private channel (the viewer's own moments, the house's shows).
  _moment(s, m, capture = null) {
    // Each line goes out with the moment's class (PR 2a): said now, or queued,
    // or (flavour) dropped; fx is what happens as it is said. With capture (the
    // catch-up), only the words are kept: nothing is said and nothing moves.
    const cls = MOMENT_CLASS[m.type] ?? FLAVOUR;
    const at = cls === KEPT ? m.at : undefined;
    let lined = false;
    const line = (text, ms = 4500, fx, opts = {}) => {
      lined = true;
      if (capture) capture.push(text);
      else this._line(s, cls, text, ms, { then: fx, at, type: m.type, ...opts });
    };
    const say = (text, ms, fx) => line(text, ms, fx, { write: true });
    const speak = (text, ms, fx) => line(text, ms, fx, { catch: true }); // may carry its sound
    const now = (fx) => { if (!capture) fx(); }; // no line: it happens at once
    switch (m.type) {
      case "care_miss":
        // Only the catch-up says it: live, the viewer was here all along. Unsaid,
        // it is marked said, so the catch-up won't bring it back either.
        if (capture) say(this._lines(s, "care_miss", "...oh, there you are ♥").text, 5000); // never guilt
        break;
      case "discipline_miss":
        say("ok, ok... ♪");
        break;
      case "became_sick": // feeling poorly (2b): said once, dropped if it's well by then
        // From weight, the public moment keeps its cause (gaps-seams 2b): it says why.
        line(m.cause === "weight" ? (this._babyStage(s) ? SICK_WEIGHT_BABY : pick(SICK_WEIGHT))
          : this._lines(s, "became_sick", "I don't feel so good...").text, 4500,
          () => this._animate(s, s.pet, "droop", 2800),
          { write: true, still: () => this._isSick(s) });
        break;
      case "call_answered":
        if (m.reason === "fake" && m.answer !== "spoiled") { // only a fair scold sulks
          say("ok... sorry", 4500, () => this._animate(s, s.pet, "sulk", 800));
        }
        break;
      case "hatched":
        // The first meeting (UX fix 4, F3): on a personal screen it says the viewer's name, then
        // "nice to meet you". That spends today's greeting, so the normal one doesn't repeat it.
        {
          const first = sharedScreen() ? null : short(this._hass.user?.name?.trim().split(/\s+/)[0], 16);
          say(first ? `hello, ${first}! ♥` : "hello!", 4500, () => {
            this._chirp(s, "hatch");
            this._animate(s, s.pet, "born", 500);
            this._sparkle(s);
          });
          if (!capture) {
            this._line(s, KEPT, "nice to meet you ♥", 4500, { type: m.type });
            this._greetSpent(s);
          }
        }
        break;
      case "stage_changed":
        if (m.stage === "baby") break; // hatching says hello
        say(m.stage === "adult"
          ? "all grown up! ♥" // the upbringing is on the status screen, not announced
          : `i'm a ${m.stage} now!`, 4500, () => {
          this._animate(s, s.pet, "stretch", 1100);
          this._sparkle(s);
        });
        // A new teen tells its personality, in a bubble of its own after this one
        // (kept too, so it waits its turn).
        if (m.stage === "teen" && PERSONA[m.personality] && !capture) {
          this._line(s, KEPT, pick(PERSONA[m.personality].reveal), 4500, { catch: true, type: m.type, perk: true });
        }
        break;
      case "trait_learned":
      case "trait_deepened":
        say(`${m.type === "trait_learned" ? "new trait" : "deeper trait"}: ` +
          `${String(m.trait).replaceAll("_", " ")} ${"★".repeat(m.level || 1)}`, 4500, () => {
          this._sparkle(s);
          this._chirp(s, "trait");
          // Show what the new trait looks like, so its flair means something later.
          setTimeout(() => this._flair(s, m.trait), 700);
        });
        break;
      case "egg_laid":
        say("see you in the journal!", 4500, () => {
          this._animate(s, s.pet, "born", 500);
          this._sparkle(s);
        });
        break;
      case "woke_up":
        if (m.how === "morning") {
          say(this._wakeLine(s), 4500, () => this._animate(s, s.pet, "stretch", 1100));
          if (!capture) this._newLook([s]); // up for the day, seen live: the morning's look begins (fresh-moment 1)
        } else if (m.how === "night") {
          say("...so sleepy");
        }
        break;
      case "fell_asleep":
        if (m.how === "collapsed") {
          say("so... sleepy... zzz", 5000);
        } else if (m.how === "house" || m.how === "lights") {
          say(this._nightLine(s) || this._lines(s, "fell_asleep", pick(["good night...", "night night...", "sleep tight..."])).text, 4000);
        }
        break;
      case "good_morning":
        speak(this._lines(s, "good_morning", pick(["morning!! you're up!", "morning! ♪"])).text, 4500,
          () => this._animate(s, s.pet, "stretch", 1100));
        break;
      case "sunset":
        speak(this._lines(s, "sunset", pick(["ooh, the sunset...", "pretty sky tonight", "the sun's going down"])).text, 4500,
          () => this._look(s, 3000));
        break;
      case "sunrise":
        speak(pick(["the sun's up!", "good morning, sun!"]), 4500, () => this._look(s, 2500));
        break;
      case "watching": {
        if (!m.title) break;
        // A long title gets the short lines, so the bubble leaves the pet in view.
        const title = short(m.title);
        line(pick([`ooh, ${title}!`, `*watches ${title}*`, `${title}! I love this one`]), 4500,
          () => this._animate(s, s.pet, "perk", 320));
        break;
      }
      case "listening":
        if (!m.title) break;
        line(m.artist && Math.random() < 0.5
          ? `♪ ooh, ${short(m.artist)}! ♪`
          : `♪ ${short(m.title)} ♪`);
        break;
      case "news_live": // the same, said on the channel only (house_words_private, H8)
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
        const said = pick(lines);
        // Long enough to read; a headline gets no catchphrase.
        line(said, 4000 + said.length * 50, () => this._animate(s, s.pet, "perk", 320));
        break;
      }
      case "weather": { // the weather just changed (or a hot or freezing day)
        if (s.game) break; // a game's prompt owns the bubble
        const t = degrees(m.temperature);
        const lines = {
          rain_started: ["ooh, it's raining!", "pitter patter...", "here comes the rain!"],
          rain_stopped: ["the rain stopped!", "all dry now~"],
          rainbow: ["the rain stopped... a rainbow!", "ooh, a rainbow! so pretty"],
          snow_started: ["it's snowing!! ❄", "snowflakes!! ❄"],
          sun_out: ["the sun came out!", "ooh, sunshine!"],
          hot: t ? [`${t} out there! phew`, `so hot out... ${t}!`] : ["so hot out there!"],
          cold: t ? [`brr, ${t} outside!`, `${t} out there... brr`] : ["brr, so cold out!"],
        }[m.change];
        if (!lines) break;
        (m.change === "cold" ? say : speak)(pick(lines), 4500, () => { // a sulk gets no cheery sound
          if (m.change === "rainbow" || m.change === "snow_started") this._sparkle(s);
          if (m.change === "cold") this._animate(s, s.pet, "sulk", 800);
          else this._look(s, 2500);
        });
        break;
      }
      case "house_answered": { // the heating (cooling) came on for a chilly (warm) pet (H3)
        if (s.game) break;
        const kind = HOUSE_REQUEST[m.request];
        if (!kind) break;
        speak(pick(HOUSE_LINES[kind]), 4500, () => {
          this._animate(s, s.pet, "perk", 320);
          this._houseFx(s, kind === "heating" ? "fx-heat" : "fx-cool");
        });
        break;
      }
      case "robot_out": // a robot vacuum started a run: the stand-in crosses the floor (H4)
      case "robot_home": { // ... and went home: a word, no robot
        if (s.game) break;
        speak(pick(HOUSE_LINES[m.type]), 4500, () => {
          this._animate(s, s.pet, "perk", 320);
          if (m.type === "robot_out") this._robotFx(s);
        });
        break;
      }
      case "appliance_done": { // a washer, dryer or dishwasher finished its cycle (H6)
        if (s.game) break;
        const kind = ["washer", "dishwasher", "dryer"].includes(m.kind) ? m.kind : "machine"; // only the kind comes in
        const lines = HOUSE_LINES[kind];
        speak(pick(lines), 4500, () => {
          this._animate(s, s.pet, "perk", 320);
          this._houseFx(s, kind === "dryer" ? "fx-tumble" : "fx-suds");
        });
        break;
      }
      case "doorbell_live": { // a doorbell press, said live and kept nowhere: a startle and two notes (H5)
        if (s.game) break; // a game's prompt owns the bubble
        // The startle and the chime are the bell's own: at once, not waiting on the
        // line (a FLAVOUR line can wait up to FLAVOUR_WAIT_MS, or be dropped).
        now(() => {
          this._animate(s, s.pet, REACT_POSE.startle.move, REACT_POSE.startle.ms);
          this._houseFx(s, "fx-chime");
        });
        speak(pick(HOUSE_LINES.doorbell), 4500);
        break;
      }
      case "house_moment": // virtual_pet.react: something in the house, by category (H8)
      case "house_live": { // ... said on the channel only: it says someone's home, or the words are kept off the sensor
        if (s.game) break; // a game's prompt owns the bubble
        const cat = Object.hasOwn(HOUSE_CATEGORY, m.category ?? "") ? HOUSE_CATEGORY[m.category] : null;
        if (!cat) break;
        const custom = m.category === "custom";
        const reaction = custom ? (Object.hasOwn(REACT_POSE, m.reaction ?? "") ? m.reaction : "hop") : cat.react;
        const pose = REACT_POSE[reaction];
        const fx = () => {
          this._animate(s, s.pet, pose.move, pose.ms);
          if (pose.sparkle) this._sparkle(s);
          if (cat.fx) this._houseFx(s, cat.fx);
        };
        const words = custom ? String(m.text || "") : "";
        // The player's own words get no catchphrase (as a headline); the pet's lines may.
        if (words) line(words, 4000 + words.length * 50, fx);
        else speak(pick(custom ? HOUSE_MOMENT_LINES.custom[reaction] : HOUSE_MOMENT_LINES[m.category]), 4500, fx);
        break;
      }
      case "forecast": { // something worth a word in today's or tomorrow's forecast
        if (s.game) break;
        const today = m.when === "today";
        const hi = degrees(m.high);
        const lines = {
          storm: today ? ["thunder later... eek"] : ["storms tomorrow... eek"],
          snow: today ? ["ooh, snow today!", "it might snow today!!"] : ["snow tomorrow!!", "snow tomorrow! I can't wait ❄"],
          hot: hi ? [today ? `hot one today: ${hi}!` : `${hi} tomorrow! phew`] : [today ? "hot one today!" : "hot tomorrow, phew"],
          cold: hi ? [today ? `cold one today: ${hi}, brr` : `brr, only ${hi} tomorrow`] : [today ? "cold one today, brr" : "cold tomorrow, brr"],
          warmer: hi ? [today ? `warmer today: ${hi}!` : `warmer tomorrow: ${hi}!`] : [today ? "warmer today!" : "warmer tomorrow!"],
          colder: hi ? [today ? `colder today, only ${hi}` : `colder tomorrow... ${hi}`] : [today ? "colder today..." : "colder tomorrow..."],
          rain: today ? ["rain later today...", "rain's coming later"] : ["rain tomorrow... a blanket day ♪"],
          sunny: today ? ["sunny today! yay"] : ["sun tomorrow! yay"],
        }[m.kind];
        if (!lines) break;
        (["storm", "cold", "colder"].includes(m.kind) ? say : speak)(pick(lines), 5000, () => {
          if (m.kind === "cold" || m.kind === "colder") this._animate(s, s.pet, "sulk", 800);
          else this._animate(s, s.pet, "perk", 320);
        });
        break;
      }
      case "wish_granted": { // lines that arrive together queue, so none is lost
        // W-b (fresh-expand E6): half the time live, what it got (TODAY_WISH); the evening's
        // today line then doesn't tell the wish again.
        const got = !capture && TODAY_WISH[m.kind] && !this._babySet(s, "wish_granted") && Math.random() < 0.5;
        if (got) oncePerDay(`todaywish-${s.ids?.device}`);
        const granted = got ? { text: TODAY_WISH[m.kind], baby: false }
          : this._lines(s, "wish_granted", pick(["my wish came true! thank you ♥", "yay, my wish! ♥", "best day ever! ♥"]));
        line(granted.text, 4500, () => {
          this._sparkle(s);
          this._chirp(s, "trait");
        }, { catch: !granted.baby, perk: true });
        break;
      }
      case "bond_up": { // only the person whose bond it is gets it (the channel)
        if (sharedScreen()) break; // nothing personal on a shared screen
        const game = GAMES.find((g) => g.key === m.favourite);
        line(game ? `${game.label} is our game now! ♥`
          : m.nickname ? `I'll call you ${m.nickname} now ♥`
          : m.level >= BOND.max ? "you're my very best friend ♥"
          : m.level === BOND.max - 1 ? "you make every day better ♥"
          : m.level >= BOND.hearts ? "I'm always so happy when you're here ♥"
          : this._lines(s, "bond_up", pick(["I like you a lot, you know ♥", "we're getting close! ♥", "you're the best ♥"])).text, 5000, () => {
          this._sparkle(s);
          this._chirp(s, "trait");
        }, { perk: true });
        break;
      }
      case "friend_home": { // the viewer, a close friend, came home (the channel)
        if (sharedScreen() || capture) break; // a shared screen has someone_home
        if (!this._welcomeDue(s, new Date(m.at).getTime())) break;
        line(this._lines(s, "friend_home", pick(["you're home!! ♥", "yay, you're back! ♥"])).text, 4500, () => {
          if (!calm()) this._animate(s, s.pet, "greethop", 1400);
        });
        if (HOME_WEATHER[m.weather]) this._line(s, KEPT, HOME_WEATHER[m.weather], 4500, { type: m.type, perk: true });
        s.visitedAt = 0; // look in again now: the pet may want to ask about your day
        this._visit(s);
        break;
      }
      case "someone_home": // anyone signed in came home: nameless, shared screens only
        if (!sharedScreen()) break; // their own card says "you're home!!"
        line("someone's home!! ♥", 4000, () => this._animate(s, s.pet, "perk", 320));
        break;
      case "bond_record": { // only its person
        if (sharedScreen()) break; // nothing personal on a shared screen
        const game = GAMES.find((g) => g.key === m.game);
        const best = m.game === "dig" ? berries(m.wins) : `${m.wins}/5`; // the dig's best is berries banked
        line(`new best at ${game ? game.label : "a game"}! ${best} ♥`, 4500, () => this._sparkle(s), { perk: true });
        break;
      }
      case "tucked_in": {
        if (sharedScreen()) break; // nothing personal on a shared screen
        const bond = this._bond(s);
        const name = short((bond?.level >= BOND.nickname && bond.nickname) ||
          this._hass.user?.name?.trim().split(/\s+/)[0], 16);
        // Instead of the plain goodnight just said (or waiting), not after it.
        if (!capture && s.queue) s.queue = s.queue.filter((q) => q.type !== "fell_asleep");
        line(withName(this._lines(s, "tucked_in", "thank you for tucking me in ♥").text, name), 4000);
        break;
      }
      case "bond_favourite":
        if (!sharedScreen()) line(pick(["our favourite game! ♥", "i love playing this with you ♥"]), 4500, null, { perk: true });
        break;
      case "favourite_snack": // at most once a day (the server's); a holiday snack says its own
        if (!seasonNow(this._config)?.snack) {
          const food = short(m.food, 16);
          const said = this._lines(s, "favourite_snack", `${food}, my favourite!!`, food);
          line(said.text, 4500, null, { catch: !said.baby, perk: true });
        }
        break;
      case "tv_off_late":
        say(pick(["*yawn* bedtime soon...", "all done! sleepy now..."]));
        break;
      case "first_snow":
        speak("the first snow!! ❄", 4500, () => {
          this._sparkle(s);
          this._animate(s, s.pet, "stretch", 1100);
        });
        break;
      case "first_frost":
        speak("brr, frost outside!", 4500, () => this._animate(s, s.pet, "sulk", 800));
        break;
      case "first_warm": // E12 Se-a
        speak(SEASON_FIRST_LINES.warm, 4500, () => this._animate(s, s.pet, "stretch", 1100));
        break;
      case "first_fog":
        speak(SEASON_FIRST_LINES.fog, 4500, () => this._look(s, 900));
        break;
      case "season_start": // ha-signals H7: a season's first day, with a sparkle
        if (Object.hasOwn(SEASON_START_LINES, m.season ?? "")) speak(pick(SEASON_START_LINES[m.season]), 4500, () => this._sparkle(s));
        break;
      case "pooped":
        now(() => {
          const img = s.poops[(m.count || 1) - 1];
          if (img) this._animate(s, img, "born", 450);
        });
        break;
    }
    // A kept moment with no line here (a baby's stage, a shared screen) is
    // done with all the same: the catch-up won't bring it back.
    if (!capture && !lined && at) this._markSaid(s, at);
  }

  // Fresh care (newest first): the viewer's own press is "mine" (the first new
  // entry with its action that arrives within MINE_MATCH_MS of it: by arrival,
  // never the two clocks, and never by the shared display name). Two kinds in
  // one update give the newest's reaction with one combined line (C4).
  _care(s, fresh) {
    // The viewer's recent presses, oldest first: two quick taps both count.
    // Each fresh entry uses up one matching press, so none is left to claim later care.
    const pressed = (s.pressed || []).filter((p) => Date.now() - p.pressedAt < MINE_MATCH_MS);
    let mine = false;
    for (const e of fresh) {
      const i = pressed.findIndex((p) => p.action === e.action);
      if (i >= 0) {
        pressed.splice(i, 1);
        mine = true;
      }
    }
    s.pressed = pressed;
    const [newest] = fresh;
    const other = fresh.find((e) => e.action !== newest.action);
    const both = other && CARE_NOUNS[other.action] && CARE_NOUNS[newest.action] &&
      ["ok", "won", "lost"].includes(other.result) && ["ok", "won", "lost"].includes(newest.result)
      ? `${CARE_NOUNS[other.action]} and ${CARE_NOUNS[newest.action]}! ♥` : null;
    this._react(s, newest, { mine, both });
  }

  _isSick(s) {
    return (this._state(s, "sensor.mood")?.attributes.flags || []).includes("sick");
  }

  // --- Fresh-expand E4: wake, bedtime, meals, medicine ---------------------------

  // Today's dream, if the states are today's (as the first look reads it).
  _dreamToday(s) {
    return !this._resumedAt && (s.house?.dream || this._state(s, "sensor.life_stage")?.attributes?.dream) || null;
  }

  // Today's dream as the first look says it (DREAMS), or null (E9 J-a, St-a).
  _dreamSaid(s) {
    return this._dreamText(s, this._dreamToday(s));
  }

  // --- Fresh-expand F2: dream stories ------------------------------------------------

  // A dream as said: a picked one's story (F2), else its DREAMS line; null if none.
  _dreamText(s, dream, date = turnNow()) {
    if (!dream) return null;
    if (dream.kind === "picked") return this._dreamStory(s, dream.pick, date);
    return DREAMS[dream.kind]?.(dream, this._words(s), this._worlds) || null;
  }

  // A picked dream's story for everyone: the shared two and the type's own, in turns per
  // pet; "you" names no one (DREAM_FRIENDS). Null with no pick (an older server).
  _dreamStory(s, pick, date = turnNow()) {
    if (!Object.hasOwn(DREAM_STORIES, pick)) return null;
    if (pick === "you") return DREAM_FRIENDS;
    return turnPick(this._storyList(s, pick), `${s.ids?.device}|dream|${pick}`, date);
  }

  _storyList(s, pick) {
    return [...DREAM_STORIES[pick], ...(PERSONA[this._typeKey(s)]?.[`dream_${pick}`] || [])];
  }

  // A told stars, sea or snacks story, kept to come back once (one key per pet, overwritten).
  _dreamStoryTold(s, pick, date = turnNow()) {
    if (!Object.hasOwn(DREAM_CALLBACK, pick)) return;
    try {
      localStorage.setItem(`hatch-dreamstory-${s.ids?.device}`, JSON.stringify({ pick, day: dayOrdinal(date) }));
    } catch (err) {
      // private mode: no callback
    }
  }

  // Its callback, 2-4 days after the story (by the pet and the story's day), once; a week
  // on, it lapses.
  _dreamCallback(s, date = turnNow()) {
    const key = `hatch-dreamstory-${s.ids?.device}`;
    try {
      const told = JSON.parse(localStorage.getItem(key) || "null");
      if (!told || !Object.hasOwn(DREAM_CALLBACK, told.pick) || !Number.isInteger(told.day)) return null;
      const ago = dayOrdinal(date) - told.day;
      const wait = DREAM_CALLBACK_DAYS[turnHash(`${s.ids?.device}|dreamcb|${told.day}`) % DREAM_CALLBACK_DAYS.length];
      if (ago < wait) return null;
      localStorage.removeItem(key);
      return ago <= 7 ? DREAM_CALLBACK[told.pick] : null;
    } catch (err) {
      return null;
    }
  }

  // S-a: a morning wake, in turns per pet; the dream line only on a dream day.
  _wakeLine(s, date = turnNow()) {
    const line = turnPick(WAKE_LINES, `${s.ids?.device}|wake`, date);
    return line === WAKE_LINES[WAKE_LINES.length - 1] && !this._dreamToday(s) ? WAKE_LINES[0] : line;
  }

  // S-b: lights out after a visitor seen here today, else after today's sunset: once a
  // day on this device. Null: the usual line.
  _nightLine(s) {
    const seen = this._visitSeen(s);
    const midnight = new Date().setHours(0, 0, 0, 0);
    const sunset = (this._state(s, "sensor.last_care")?.attributes?.moments || [])
      .some((m) => m.type === "sunset" && new Date(m.at).getTime() > midnight);
    if (!seen && !sunset) return null;
    if (!oncePerDay(`nightcb-${s.ids?.device}`)) return null;
    return seen ? turnPick(NIGHT_VISITOR, `${s.ids?.device}|night`)(seen) : NIGHT_SUNSET;
  }

  // F-a, F-b: a feed's line, [text, ms] or null. The crumb now and then on a day a
  // visitor came by here (once a day); else half "yum" (its own food, in its own words),
  // half the meal of the hour. Baby talk keeps "yum".
  _mealLine(s, food, hour = new Date().getHours()) {
    const seen = this._visitSeen(s);
    if (seen && Math.random() < CRUMB_ODDS && oncePerDay(`crumb-${s.ids?.device}`)) {
      return [CRUMB_LINE(seen), 2500];
    }
    const part = mealPart(hour);
    const yum = food && (!part || this._babySet(s, "yum") || Math.random() < 0.5);
    if (yum) return [this._lines(s, "yum", `yum, ${food}!`, food).text, 2500];
    return part ? [this._fresh(s, "meal", MEAL_LINES[part]), 2500] : null;
  }

  // M-a: a cure seen here marks the day; the next day's first look says a line, once.
  _curedMark(s) {
    try {
      localStorage.setItem(`hatch-cured-${s.ids?.device}`, new Date().toDateString());
    } catch (err) {
      // no storage: no line tomorrow
    }
  }

  // The day-after line, or null (and a cure older than yesterday is forgotten).
  _curedLine(s) {
    const key = `hatch-cured-${s.ids?.device}`;
    try {
      const day = localStorage.getItem(key);
      if (!day) return null;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (day === new Date().toDateString()) return null; // tomorrow
      localStorage.removeItem(key);
      if (day !== yesterday.toDateString() || this._isSick(s) || !oncePerDay(`curedcb-${s.ids?.device}`)) return null;
      return turnPick(CURED_LINES, `${s.ids?.device}|cured`);
    } catch (err) {
      return null;
    }
  }

  // M-b: now and then a clean's extra bubble drifts up and pops. No line; none when calm.
  _bubblePop(s) {
    if (calm() || Math.random() >= BUBBLE_POP_ODDS) return;
    const img = document.createElement("img");
    img.className = "bubblepop";
    img.alt = "";
    img.src = `${BASE}/ui/prop_bubbles_1.png?v=${VERSION}`;
    s.prop.after(img);
    return { img, timer: setTimeout(() => img.remove(), 1300) };
  }

  // Medicine that worked (2b, C8): the viewer's own is theirs, someone else's a beat.
  _allBetter(s, mine) {
    this._line(s, mine ? MINE : BEAT, this._lines(s, "all_better", "all better! ♪").text,
      mine ? Math.max(3000, MINE_MS) : 3000, { write: true, type: "care" });
  }

  _react(s, entry, { mine = false, both = null } = {}) {
    s.screen.querySelector(".costume")?.remove(); // care takes the stage
    const cured = entry.action === "medicine" && entry.result === "ok";
    if (cured) this._curedMark(s); // E4 M-a: a line at tomorrow's first look
    if (entry.action === "clean" && entry.result === "ok") this._bubblePop(s); // E4 M-b
    const sceneLive = s.scene?.kind === entry.action;
    if (this._sceneAnswered(s, entry)) {
      // The scene's cheer says it when it ends; a scene already over says it now.
      if (cured && !sceneLive) this._allBetter(s, true);
      return;
    }
    // One line at the end, of the press's class: the viewer's own is never
    // overwritten for MINE_MS; someone else's care waits its turn.
    let said = null;
    const out = () => {
      if (both) said = [both, 2500];
      if (!said) return;
      const [text, ms] = said;
      this._line(s, mine ? MINE : BEAT, text, mine ? Math.max(ms, MINE_MS) : ms, { write: true, type: "care" });
    };
    if (entry.action === "chore_treat") {
      said = ["a treat! someone did a chore ♪", 3500];
    }
    if (cured) said = [this._lines(s, "all_better", "all better! ♪").text, 3000];
    if (["ok", "won", "lost"].includes(entry.result)) {
      const key = PROP_FOR[entry.action] || entry.action;
      // The species' own reaction pose, drawn for the child only.
      const pose = s.species?.reactions?.[entry.result === "won" ? "won" : entry.action];
      const poseFrames = s.drawn === "child" && s.species?.extras?.[pose];
      if (poseFrames) {
        s.poseFrames = Array.isArray(poseFrames) ? poseFrames : [poseFrames];
        s.poseUntil = Date.now() + 2500;
        this._show(s, s.pet, s.poseFrames[0]);
      } else {
        const ok = entry.result === "ok";
        // A lost game: a good sport, acts.aww, else the content frames settle.
        const kind = entry.result === "lost" ? "lost" : entry.result === "won" ? "praised"
          : ok && (entry.action === "feed" || entry.action === "snack") ? "fed"
          : ok && entry.action === "praise" ? "praised"
          : ok && entry.action === "blanket" ? "tucked" : null;
        // A won game's log can land just before the card closes the game: still its reaction.
        if (kind) this._reactFrames(s, kind, { inGame: entry.result === "won" || entry.result === "lost" });
      }
      if (entry.action === "fan") { // the fan stands by, and its breeze crosses the scene
        s.screen.classList.add("breezy");
        clearTimeout(s.breezeTimer);
        s.breezeTimer = setTimeout(() => s.screen.classList.remove("breezy"), 2600);
      }
      const food = this._words(s).food;
      // The pet asked for the blanket or the fan by name: it thanks you (F11).
      if (entry.result === "ok" && (entry.action === "blanket" || entry.action === "fan")) {
        said = [TALK_COPY[entry.action], 3000];
      }
      if (entry.action === "feed" && entry.result === "ok") said = this._mealLine(s, food); // E4 F-a, F-b
      if (entry.action === "praise") {
        said = [this._lines(s, "praise", "♥", undefined, { fresh: true }).text, 2500]; // P-c: a baby keeps "♥"
      }
      const season = seasonNow(this._config);
      const candy = season?.snack && key === "snack" ? `../ui/season_${season.key}_${season.snack}` : null;
      if (candy) {
        said = [pick(season.snackLines || ["a treat! ♪"]), 2500];
      }
      const weight = Number.parseFloat(this._state(s, "sensor.weight")?.state);
      if (entry.action === "snack" && isHeavy(Number.isFinite(weight) ? weight : null) && Math.random() < 0.5) {
        said = [pick(HEAVY_SNACK), 3000];
      }
      const prop = candy || s.species?.props?.[key] || FALLBACK_PROPS[key];
      if (prop) {
        this._show(s, s.prop, prop);
        s.propUntil = Date.now() + 2500;
      }
      out();
      return;
    }
    const line = REFUSALS[entry.result];
    if (REACT_REFUSALS.has(entry.result)) this._reactFrames(s, "refused");
    if (line) {
      said = [this._lines(s, `REFUSALS.${entry.result}`, line).text, 3500];
    }
    out();
  }

  _renderStatus(s, log) {
    if (s.laySheet) {
      this._renderLaySheet(s);
      return;
    }
    if (s.everyWorld) {
      this._renderEveryWorld(s);
      return;
    }
    if (s.finds) {
      this._renderFinds(s);
      return;
    }
    if (s.journal) {
      this._renderJournal(s);
      return;
    }
    if (s.settings) {
      if (s.picker && !this._shellPickable(s)) this._closePicker(s);
      if (s.picker) this._renderPicker(s);
      else this._renderSettings(s);
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
    // The social meter (top10 §6): the pet's week beyond the house, five hearts in
    // halves; hidden at 0 and from an older server.
    const social = Number(stageAttrs.social_level) || 0;
    const socialHearts = (level) => {
      const img = (n) => `<img src="${BASE}/ui/stat_heart_${n}.png?v=${VERSION}" alt="">`;
      let out = "";
      for (let i = 0; i < SOCIAL_MAX / 2; i++) {
        const left = level - i * 2;
        out += img(left >= 2 ? "full" : left === 1 ? "half" : "empty");
      }
      return `<span class="hearts" role="img" aria-label="friends this week: ${level} of ${SOCIAL_MAX}">${out}</span>`;
    };
    const ic = (n) => pixelIcon(n, 18);
    const bar = (v) => v === null ? "–"
      : `<div class="bar" role="img" aria-label="${Math.round(v)} of 100"><div style="width:${v}%"></div></div>`;
    const lines = log.slice(0, 3).map((e) =>
      `<div>${escape(e.action.replace("_", " "))}${e.by && !sharedScreen() ? ` by ${escape(e.by)}` : ""} · ${timeAgo(e.at)}` +
      `${e.result && e.result !== "ok" ? ` (${escape(e.result.replace("_", " "))}${e.score ? ` ${escape(e.score)}` : ""})` : ""}</div>`);
    const row = (iconName, label, value) =>
      `<div class="row">${iconName ? ic(iconName) : "<span></span>"}<span>${label}</span>${value}</div>`;
    const adult = this._state(s, "sensor.life_stage")?.state === "adult";
    const teenOrAdult = adult || this._state(s, "sensor.life_stage")?.state === "teen";
    const isEgg = this._state(s, "sensor.life_stage")?.state === "egg";
    // The creature picked for the next egg (if any), and its world if that changes.
    // Only an offered one (raised, S2) is named: a pick made in HA outside the offer reads as
    // a surprise, and an adult always has the row (S2, N7).
    const offerNow = this._eggOffer(s);
    const picked = offerNow?.choice?.name.toLowerCase();
    const heldPick = stageAttrs.next_egg && !picked ? SETUP_COPY.eggSurprise : null; // any stage
    const nextEgg = [picked || heldPick || (adult ? SETUP_COPY.eggSurprise : null),
      stageAttrs.next_world && `in ${stageAttrs.next_world}`].filter(Boolean).join(" ");
    const nextStage = growsUp(this._state(s, "sensor.life_stage")?.state, stageAttrs.age_days);
    // What it would like most, above today's wish; none asleep, away or in the egg.
    const moodNow = this._state(s, "sensor.mood");
    const wantKey = moodNow?.attributes.reason_key;
    const wantsNow = (moodNow?.attributes.flags || []).includes("sick") ? "sick"
      : (moodNow?.attributes.requests || []).find((r) => r !== "lay_egg" && WANT_WORDS[r]
        && this._state(s, `button.${r}`));
    const want = s.asleep || moodNow?.state === "away" || isEgg ? null
      : (String(wantKey).startsWith("call_") && WANT_WORDS[wantKey]) || WANT_WORDS[wantsNow]
        || (isHeavy(value("weight")) ? "a game, to run it off" : null);
    // How care is going, beside the upbringing it shapes (top10 4a; was in settings).
    const careMisses = this._state(s, "sensor.care_misses");
    // A new pet's page doesn't open on zeros that count failures: the two rows come with the first miss (UX fix 4, F12).
    const missed = Number.parseFloat(careMisses?.state) || 0;
    const whined = Number(careMisses?.attributes.discipline_misses) || 0;
    const misses = missed || whined
      ? row(null, "missed calls", `<span>${missed}</span>`) + row(null, "ignored whines", `<span>${whined}</span>`) : "";
    // Today's wish comes first of the rest: it changes daily, the rest is there every day.
    // Its day so far (E9 St-a): the evening's today line, else today's dream. A page, not a bubble.
    const today = !isEgg && ((this._evening() && this._todayLine(s)) || this._dreamSaid(s));
    // An egg has no meters or traits to read: "you two" and when it hatches (UX fix 2, F12).
    // The status is the pet's own page: its head and name at the band's left (UX fix 2, F10).
    const petName = this._hass.devices?.[s.ids?.device]?.name_by_user || this._hass.devices?.[s.ids?.device]?.name || "";
    const who = petName ? `<span class="who">${isEgg ? "" : `<span class="whohead"></span>`}<span class="whoname">${escape(petName)}</span></span>` : "";
    const band = `<div class="shead">${who}${this._gearButton()}</div>`;
    const eggLeft = isEgg ? this._eggMinutes(this._state(s, "sensor.life_stage")) : null;
    const eggRow = eggLeft === null ? "" : row(null, "hatching", `<span>${escape(eggLeft <= 6 ? STATUS_COPY.eggCracking
      : eggLeft <= 15 ? STATUS_COPY.eggSoon : STATUS_COPY.eggGrowing)}</span>`);
    const html = isEgg ? `
      ${band}
      ${bond ? row(null, "you two", bondHearts(bond.level)) : ""}
      ${eggRow}
      <button class="jlink">journal ›</button>
      <div class="status-feedback" role="status" aria-live="polite" hidden></div>` : `
      ${band}
      ${today ? `<div class="stoday">${escape(today)}</div>` : ""}
      ${want ? row(null, "would like", `<span>${escape(want)}</span>`) : ""}
      ${stageAttrs.wish && WISHES[stageAttrs.wish.kind] ? row(null, "wish", stageAttrs.wish.granted
        ? `<span>♥ came true!</span>` : `<span>♡ ${escape(this._wishLine(stageAttrs.wish, s)[1])}</span>`) : ""}
      ${bond ? row(null, "you two", bondHearts(bond.level)) : ""}
      ${social > 0 && !isEgg ? row(null, "friends", socialHearts(social)) : ""}
      ${row("icon_feed", "hunger", hearts(value("hunger"), FEED_FULL_AT))}
      ${row("icon_play", "happy", hearts(value("happiness")))}
      ${row("stat_energy", "energy", bar(value("energy")))}
      ${row("stat_health", "health", bar(value("health")))}
      ${row("stat_discipline", "discipline", bar(value("discipline")))}
      ${row(null, "weight", `<span>${weightLabel(value("weight"))}</span>`)}
      ${row(null, traits.length > cap ? "traits" : `traits ${traits.length}/${cap}`, `<span>${traits.length ? traits.join(" · ") : "none yet"}</span>`)}
      ${nextTrait ? row(null, "learning", `<span class="tnext">${traitIcon(nextTrait[0])}` +
        `<span class="tname">${escape(nextTrait[0].replaceAll("_", " "))}</span>${bar(Math.round(nextTrait[1] * 100))}</span>`) : ""}
      ${stageAttrs.upbringing ? row(null, adult ? "raised" : "growing up", `<span>${escape(stageAttrs.upbringing)}</span>`) : ""}
      ${isEgg ? "" : misses}
      ${stageAttrs.personality && teenOrAdult ? row(null, "personality", `<span>${escape(stageAttrs.personality.replaceAll("_", " "))}</span>`) : ""}
      ${nextStage ? row(null, nextStage[0], `<span>${nextStage[1]}</span>`) : ""}
      ${nextEgg ? row(null, "next egg", `<span>${escape(nextEgg)}</span>`) : ""}
      <div class="log">${lines.join("") || "<div>all new here ♪</div>"}</div>
      <button class="jlink">journal ›</button>
      <div class="status-feedback" role="status" aria-live="polite" hidden></div>`;
    if (!this._setStatus(s, html)) return;
    const head = s.status.querySelector(".whohead");
    if (head) this._headCrop(s, head, 14, 3);
    this._journalLink(s, true);
    this._gearLink(s);
  }

  // The settings sheet, in the status box like the journal: the viewer's own
  // switches (none on a shared screen), then this browser's.
  _renderSettings(s) {
    const bond = this._bond(s);
    const notifying = !!s.mine?.notify_me;
    const myDay = this._mineSwitch(s, "my_day", this._myDay);
    const birthdayKept = this._mineSwitch(s, "birthday_kept", this._birthdayKept);
    const birthdayPhone = this._mineSwitch(s, "birthday_phone", this._birthdayPhone);
    const row = (iconName, label, value) =>
      `<div class="row srow"><span>${label}</span>${value}</div>`;
    // A two-tap "forget", armed or not (confirmTap).
    const forgetButton = (cls, key, aria) => {
      const sure = confirmArmed(s, key);
      return `<span><button class="bell ${cls}" aria-label="${sure ? CONFIRM_ARIA[key] : aria}">${sure ? "sure? tap again" : "forget"}</button></span>`;
    };
    // The pet's shell, for everyone who sees it: only if the server offers it, and
    // read-only (no pet name either) on a shared screen.
    const shellOptions = this._state(s, "sensor.life_stage")?.attributes.shell_finish_options;
    const shellName = escape(this._shellName(s, this._shellChoice(s)));
    const shellSwatch = `<span class="sw" style="background: ${finishSwatch(this._shellKey(s), s.world.shell?.color || "#e8834a")}"></span>`;
    // What the house shows it (top10 2b): the kinds the server lists, never an
    // entity; everyone sees it, and an admin gets a link to the options.
    const senses = this._state(s, "sensor.life_stage")?.attributes.senses;
    const notices = !Array.isArray(senses) ? ""
      : row(null, "notices", `<span class="senses">${senses.length ? senses.map(escape).join(" · ") : "just the clock"}</span>`)
        + (this._hass.user?.is_admin && !sharedScreen() ? `<button class="wlink connect">connect more ›</button>` : "");
    // The pet's group: what it notices, then the shell, where the server offers it
    // (read-only on a shared screen). Misses and whines moved to the status page
    // (top10 4a), so an older server's sheet has no pet group at all.
    const hasShell = Array.isArray(shellOptions);
    const shellRows = !hasShell && !notices ? ""
      : sharedScreen()
        ? `<div class="sec">for the pet</div>
      ${notices}
      ${hasShell ? `${row(null, "shell", `<span class="shellro">${shellSwatch}${shellName}</span>`)}
      <div class="shellnote">ask a grown-up to change it</div>` : ""}`
        : `<div class="sec">for ${escape(this._linkName(s))}</div>
      ${notices}
      ${hasShell ? row(null, "shell", `<span><button class="bell shellrow" aria-label="shell: ${shellName}, change">${shellSwatch}${shellName}</button></span>`) : ""}`;
    // Who each part changes: the pet (everyone), the viewer (follows their login),
    // or this browser.
    const html = `
      <div class="shead"><button class="sback">${SETTINGS_COPY.backToStatus}</button>${SAY_NOTE}</div>
      ${shellRows}
      ${sharedScreen() ? "" : `<div class="sec">for you</div>`}
      ${sharedScreen() ? "" : row(null, "notify me", `<span><button class="bell notify" aria-label="notify me" aria-pressed="${notifying}">${notifying ? "on" : "off"}</button></span>`)}
      ${bond && myDay === undefined ? row(null, "my day", `<span>…</span>`) : ""}
      ${bond && myDay !== undefined ? row(null, "my day", `<span><button class="bell myday" aria-label="my day: let the pet notice your steps, sleep, alarm and trips" aria-pressed="${!!myDay}">${myDay ? "on" : "off"}</button></span>`) : ""}
      ${birthdayKept && !sharedScreen() ? row(null, "my birthday", forgetButton("forgetbday", "forget_birthday", "forget my birthday")) +
        row(null, "birthday on my phone", `<span><button class="bell bdayphone" aria-label="birthday on my phone: a happy birthday message on your phone on the day" aria-pressed="${!!birthdayPhone}">${birthdayPhone ? "on" : "off"}</button></span>`) : ""}
      ${sharedScreen() ? "" : row(null, "baby talk", `<span><button class="bell babytalk" aria-label="baby talk: simpler words while a pet is a baby or child" aria-pressed="${babyTalk(this._hass.user?.id)}">${babyTalk(this._hass.user?.id) ? "on" : "off"}</button></span>`)}
      ${sharedScreen() ? "" : row(null, "my data", forgetButton("forgetme", "forget_me", "forget my data: your birthday, answers and settings for every pet; your bonds stay"))}
      <div class="sec">this screen</div>
      ${row(null, "sounds here", `<span><button class="bell sound" aria-label="sounds here" aria-pressed="${soundsOn()}">${soundsOn() ? "on" : "off"}</button></span>`)}
      ${s.species?.voice ? row(null, "babble", `<span><button class="bell babble" aria-label="babble: the pet's voice as it talks, on this device" aria-pressed="${babbleOn()}">${babbleOn() ? "on" : "off"}</button></span>`) : ""}
      ${row(null, "screen effects here", `<span><button class="bell lcdfx" aria-label="screen effects here" aria-pressed="${lcdOn()}">${lcdOn() ? "on" : "off"}</button></span>`)}
      ${row(null, "holiday names", `<span><button class="bell named" aria-label="holiday names" aria-pressed="${namedHolidays()}">${namedHolidays() ? "on" : "off"}</button></span>`)}
      ${row(null, "mono screen", `<span><button class="bell mono" aria-label="mono screen: ${monoOn() ? "on" : "off"}, change" aria-pressed="${monoOn()}">${monoOn() ? "on" : "off"}</button></span>`)}
      ${row(null, "big text", `<span><button class="bell bigtext" aria-label="big text: larger words on this screen's pages" aria-pressed="${bigOn()}">${bigOn() ? "on" : "off"}</button></span>`)}
      ${row(null, "shared screen", `<span><button class="bell shared" aria-label="shared screen: nothing personal on this device" aria-pressed="${sharedScreen()}">${sharedScreen() ? "on" : "off"}</button></span>`)}
      <div class="shellnote sharednote">a family tablet? give it its own login, and we'll make friends ♥</div>`;
    if (!this._setStatus(s, html)) return;
    s.status.querySelector(".sback").addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      s.settings = false;
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      s.status.scrollTop = 0; // a new view starts at its top
      this._wipe(s);
      s.status.querySelector(".gear")?.focus({ preventScroll: true });
    });
    // A heading (or the back row beside its button) is not a button: a tap on it
    // leaves the sheet open.
    s.status.querySelectorAll(".sec, .shead, .shellnote").forEach((h) => h.addEventListener("click", (e) => e.stopPropagation()));
    s.status.querySelector(".bell.shellrow")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      s.picker = true;
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      s.status.scrollTop = 0; // a new view starts at its top
      this._wipe(s);
      s.status.querySelector(".pback")?.focus({ preventScroll: true });
    });
    // An admin's way to the pet's options (Settings → Devices & services → Virtual Pet).
    s.status.querySelector(".connect")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      history.pushState(null, "", "/config/integrations/integration/virtual_pet");
      window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
    });
    s.status.querySelector(".bell.myday")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const button = e.currentTarget;
      if (button.classList.contains("pending")) return; // a call is in flight (F3)
      this._tapped(button);
      this._setMyDay(s, button.getAttribute("aria-pressed") !== "true", button); // its value now, not at draw
    });
    // No "notify me" row on a shared screen.
    s.status.querySelector(".bell.notify")?.addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      const button = e.currentTarget;
      if (button.classList.contains("pending")) return; // a call is in flight (F3)
      this._tapped(button);
      this._setNotify(s, button.getAttribute("aria-pressed") !== "true", button); // its value now, not at draw
    });
    s.status.querySelector(".bell.shared").addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      const on = !sharedScreen();
      try {
        localStorage.setItem(SHARED_KEY, on ? "on" : "off");
      } catch (err) {
        this._statusMessage(s, SETTINGS_COPY.cantKeep);
        return;
      }
      if (on) this._goShared();
      else this._goPersonal();
      this._settingsChanged(s, on ? "sharedOn" : null);
      window.dispatchEvent(new CustomEvent(SHARED_EVENT, { detail: { on, from: this } }));
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      this._statusMessage(s, on ? SETTINGS_COPY.sharedOn : SETTINGS_AGAIN.sharedOff);
    });
    s.status.querySelector(".bell.sound").addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      const on = !soundsOn();
      try {
        localStorage.setItem(SOUND_KEY, on ? "on" : "off");
      } catch (err) {
        this._statusMessage(s, SETTINGS_COPY.cantKeepSounds);
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
    s.status.querySelector(".bell.lcdfx").addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      const on = !lcdOn();
      try {
        localStorage.setItem(LCD_KEY, on ? "on" : "off");
      } catch (err) {
        this._statusMessage(s, SETTINGS_COPY.cantKeep); // F9: not silent
        return; // no storage: the effects stay as they are
      }
      this._card.classList.toggle("lcd-on", on);
      this._settingsChanged(s, on ? null : "effectsOff");
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
    });
    s.status.querySelector(".bell.named").addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      const on = !namedHolidays();
      try {
        if (on) localStorage.removeItem(NAMED_KEY);
        else localStorage.setItem(NAMED_KEY, "off");
      } catch (err) {
        this._statusMessage(s, SETTINGS_COPY.cantKeep);
        return;
      }
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
    });
    s.status.querySelector(".bell.mono").addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      const on = !monoOn();
      try {
        if (on) localStorage.setItem(MONO_KEY, "4");
        else localStorage.removeItem(MONO_KEY);
      } catch (err) {
        this._statusMessage(s, SETTINGS_COPY.cantKeep); // F9: not silent
        return; // no storage: the screen stays as it is
      }
      this._card.classList.toggle("mono", on);
      this._settingsChanged(s, on ? "monoOn" : "monoOff");
      window.dispatchEvent(new CustomEvent(MONO_EVENT)); // any other card on this page
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
    });
    s.status.querySelector(".bell.bigtext").addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      const on = !bigOn();
      try {
        if (on) localStorage.setItem(BIG_KEY, "on");
        else localStorage.removeItem(BIG_KEY);
      } catch (err) {
        this._statusMessage(s, SETTINGS_COPY.cantKeep);
        return;
      }
      this._card.classList.toggle("bigtext", on);
      window.dispatchEvent(new CustomEvent(MONO_EVENT)); // any other card on this page (_onMono)
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
    });
    s.status.querySelector(".bell.bdayphone")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const button = e.currentTarget;
      if (button.classList.contains("pending")) return; // a call is in flight (F3)
      this._tapped(button);
      const enabled = button.getAttribute("aria-pressed") !== "true";
      button.classList.add("pending");
      button.setAttribute("aria-pressed", String(enabled)); // at once, so a second tap undoes it
      button.textContent = enabled ? "on" : "off";
      this._hass.callWS({ type: "virtual_pet/birthday_phone", entity_id: s.ids?.["sensor.life_stage"], enabled })
        .then(() => {
          this._birthdayPhone = enabled;
          this._setMine("birthday_phone", enabled);
          this._statusMessage(s, enabled ? SETTINGS_COPY.phoneOn : SETTINGS_COPY.phoneOff);
          this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
        })
        .catch(() => {
          button.setAttribute("aria-pressed", String(!enabled));
          button.textContent = !enabled ? "on" : "off";
          this._statusMessage(s, SETTINGS_AGAIN.failed);
        })
        .finally(() => button.classList.remove("pending"));
    });
    s.status.querySelector(".bell.babytalk")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const button = e.currentTarget;
      if (button.classList.contains("pending")) return; // a call is in flight (F3)
      this._tapped(button);
      this._setBabyTalk(s, button.getAttribute("aria-pressed") !== "true", button);
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
          this._statusMessage(s, SETTINGS_AGAIN.forgotBirthday);
        })
        .catch(() => {
          redrawStatus(); // "forget" again, not "sure?"
          this._statusMessage(s, SETTINGS_AGAIN.failed);
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
            localStorage.removeItem(FOLLOW_TEXT_KEY + user); // their typed words (Q1 A)
          } catch (err) {
            // no storage (a private window): nothing kept here
          }
          redrawStatus(); // first: a redraw replaces the message's line
          this._statusMessage(s, SETTINGS_AGAIN.forgotMe);
        })
        .catch(() => {
          redrawStatus(); // "forget" again, not "sure?"
          this._statusMessage(s, SETTINGS_AGAIN.failed);
        });
    });
    s.status.querySelector(".bell.babble")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      const on = !babbleOn();
      try {
        localStorage.setItem(BABBLE_KEY, on ? "on" : "off");
      } catch (err) {
        this._statusMessage(s, SETTINGS_COPY.cantKeepSounds);
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

  // --- The shell picker (in the settings sheet) --------------------------------

  // The picker opens only on a personal screen, and only if the server offers shells.
  _shellPickable(s) {
    return !sharedScreen() && Array.isArray(this._state(s, "sensor.life_stage")?.attributes.shell_finish_options);
  }

  // A pick's name: a finish, or (null, or the world's own key) the world's own.
  _shellName(s, key) {
    return key == null || key === s.world.shell?.finish ? `${this._worldName(s).toLowerCase()} (default)` : finishName(key);
  }

  // A tile's data-finish: "" is the world's own, listed first.
  _tileId(s, key) {
    return key == null || key === s.world.shell?.finish ? "" : key;
  }

  // Leave the picker: an unsaved preview goes and the shell wears its pick again.
  // Every exit calls it: back, the status closing (_toggleStatus), a swipe (_go),
  // another pet (_forget), a shared screen (_goShared).
  _closePicker(s) {
    s.picker = false;
    s.pickerNote = null;
    if (s.previewFinish === undefined) return;
    s.previewFinish = undefined;
    if (s.device && s.world) this._dress(s, this._shellKey(s));
  }

  // The picker: the world's own first, then every finish by group; a locked one shows
  // the stage that opens it. Drawn from the saved pick only, so a hass update leaves
  // it (and its scroll) alone; the preview's mark is put on in place (_pickerMarks).
  _renderPicker(s) {
    const stage = this._state(s, "sensor.life_stage")?.attributes || {};
    const options = new Set(stage.shell_finish_options || []);
    const locked = stage.shell_locked || {};
    const own = s.world.shell?.finish;
    const color = s.world.shell?.color || "#e8834a";
    const now = this._tileId(s, this._shellChoice(s));
    const tile = (key) => {
      const id = this._tileId(s, key);
      const isOwn = key == null || key === own;
      const name = isOwn ? this._worldName(s).toLowerCase() : finishName(key); // the world's own: its name only (F6)
      const open = key == null || options.has(key);
      const at = open ? null : locked[key];
      const aria = at ? `${name} shell, opens at ${at}` : `${name} shell`;
      return `<button class="tile${id === now ? " now" : ""}${open ? "" : " locked"}" data-finish="${id}" ` +
        `aria-label="${escape(aria)}"><span class="sw" style="background: ${finishSwatch(key ?? own, color)}"></span>` +
        `<span class="tname">${escape(name)}</span><span class="tsub">${isOwn ? (id === now ? "default · now" : "default") : id === now ? "now" : at ? escape(at) : ""}</span></button>`;
    };
    const groups = SHELL_GROUPS.map(([head, keys], i) => `<div class="sec" data-group="${head}">${head}</div><div class="tiles">` +
      `${i === 0 ? tile(null) : ""}${keys.filter((k) => k !== own).map(tile).join("")}</div>`).join("");
    const html = `
      <div class="shead"><button class="sback pback" aria-label="back to settings">‹ settings</button>
        <button class="bell puse" aria-label="${escape(this._useAria(s, this._shellChoice(s)))}" aria-disabled="true">use</button>${SAY_NOTE}</div>
      ${groups}`;
    if (!this._setStatus(s, html)) return;
    this._pickerMarks(s);
    if (s.pickerNote && Date.now() < s.pickerNote.until) this._statusMessage(s, s.pickerNote.text); // a redraw dropped it
    const log = () => this._state(s, "sensor.last_care")?.attributes.log || [];
    s.status.querySelectorAll(".sec, .shead").forEach((h) => h.addEventListener("click", (e) => e.stopPropagation()));
    s.status.querySelector(".pback").addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      this._closePicker(s);
      this._renderStatus(s, log());
      s.status.scrollTop = 0;
      s.status.querySelector(".shellrow")?.focus({ preventScroll: true });
    });
    s.status.querySelectorAll(".tile").forEach((t) => t.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(t);
      if (t.classList.contains("locked")) {
        this._pickerNote(s, "I get this one as a teen ♪");
        return;
      }
      // The live shell is the preview: no save, no redraw of the view.
      s.previewFinish = t.dataset.finish || null;
      this._dress(s, this._shellKey(s));
      this._pickerMarks(s);
    }));
    s.status.querySelector(".puse").addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.currentTarget.getAttribute("aria-disabled") === "true") return; // nothing new to save (F7)
      this._tapped(e.currentTarget);
      this._saveShell(s, s.previewFinish);
    });
  }

  // The tile on the shell now (a preview, else the pick) is marked, and `use` names it.
  _pickerMarks(s) {
    if (!s.picker) return;
    const key = s.previewFinish !== undefined ? s.previewFinish : this._shellChoice(s);
    const sel = this._tileId(s, key);
    const now = this._tileId(s, this._shellChoice(s));
    s.status.querySelectorAll(".tile").forEach((t) => {
      const on = t.dataset.finish === sel;
      t.classList.toggle("sel", on);
      t.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const use = s.status.querySelector(".puse");
    use?.setAttribute("aria-label", this._useAria(s, key));
    // `use` is the confirm step: dimmed until the preview differs from the saved pick (F7).
    use?.setAttribute("aria-disabled", String(s.previewFinish === undefined || this._tileId(s, s.previewFinish) === now));
  }

  // `use`'s label: the finish it saves, or the world's own.
  _useAria(s, key) {
    return this._tileId(s, key) === "" ? "use the world's own shell" : `use ${finishName(key)} shell`;
  }

  // A picker line that a redraw (the sensor's push after a save) puts back.
  _pickerNote(s, text) {
    s.pickerNote = { text, until: Date.now() + 3500 };
    this._statusMessage(s, text);
  }

  // Save a pick (null: the world's own) through the websocket only: no service
  // fallback, since a service call is logged with who made it. The shell wears the
  // pick from the tap (so closing before the reply doesn't flicker); a failure puts
  // it back on the saved one and keeps the picker open.
  _saveShell(s, key) {
    const id = s.ids?.["sensor.life_stage"];
    this._shellSettled(s);
    s.shellPending = key;
    const failed = (code) => {
      if (s.ids?.["sensor.life_stage"] !== id) return; // another pet by now
      if (s.shellPending === key) this._shellSettled(s);
      s.previewFinish = undefined;
      this._dress(s, this._shellKey(s));
      if (code === "shell_locked") s.statusHtml = null; // its options moved on: draw them again
      if (s.picker) this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      this._pickerMarks(s);
      this._pickerNote(s, SHELL_ERRORS[code] || "that didn't work, try later");
    };
    if (!id) {
      failed("no_pet");
      return;
    }
    let timer;
    const late = new Promise((_, reject) => { timer = setTimeout(() => reject({ code: "timeout" }), 10000); });
    Promise.race([this._hass.callWS({ type: "virtual_pet/set_shell", entity_id: id, finish: key }), late])
      .finally(() => clearTimeout(timer))
      .then(() => {
        if (s.ids?.["sensor.life_stage"] !== id) return;
        clearTimeout(s.shellPendingTimer);
        if (s.shellPending === key) s.shellPendingTimer = setTimeout(() => {
          s.shellPending = undefined;
          this._redraw(s);
        }, 5000);
        s.previewFinish = undefined;
        this._dress(s, this._shellKey(s));
        if (s.picker) this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []); // `now` moves
        this._pickerNote(s, key === null ? "back to the world's own ♪" : "shell saved ♪");
        this._settingsChanged(s, "shell");
      })
      .catch((err) => failed(err?.code));
  }

  // The gear in the status view's corner: opens the settings sheet.
  _gearButton() {
    return `<button class="gear" aria-label="settings">${GEAR_ICON}</button>`;
  }

  _gearLink(s) {
    s.status.querySelector(".gear").addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      s.settings = true;
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      s.status.scrollTop = 0; // a new view starts at its top
      this._wipe(s);
      s.status.querySelector(".sback")?.focus({ preventScroll: true });
    });
  }

  // --- The lay sheet (plan-2026-11-02-settings-setup S2) ------------------------------
  // The creatures the next egg may be: the server's `egg_roster` (id and select option,
  // in catalog order) that this card's pets have raised in the egg's world (the pending
  // world's if one waits, else the current one). Never cached: every draw asks the state.
  // null: an older server, or no select to choose with. `surprise` is the select's own
  // first option, sent verbatim; `choice` the offered creature picked now (if any);
  // `outside` a pick made in Home Assistant that is not offered (never named here).
  _eggOffer(s) {
    const stage = this._state(s, "sensor.life_stage")?.attributes;
    const select = this._hass.states[s.ids?.["select.next_egg"]];
    if (!Array.isArray(stage?.egg_roster) || !select?.attributes.options?.length) return null;
    const world = stage.next_world
      ? Object.keys(this._worlds || {}).find((k) => this._worlds[k]?.name === stage.next_world)
      : stage.world;
    if (!world) return null;
    const raised = new Set();
    for (const other of this._slides || []) {
      const st = this._state(other, "sensor.life_stage")?.attributes;
      if (st?.world === world) (st.raised || []).forEach((r) => raised.add(r));
    }
    const offered = stage.egg_roster.filter((r) => raised.has(r.id));
    const picked = stage.next_egg ?? null;
    const choice = offered.find((r) => r.name === picked) || null;
    return { offered, choice, outside: !!picked && !choice, surprise: select.attributes.options[0],
      entity: select.entity_id };
  }

  // C15': the egg's first look, when an offered creature was chosen for it: a line on the
  // screen (an egg doesn't talk), once on this device for this generation.
  _eggComing(s) {
    const choice = this._eggOffer(s)?.choice;
    if (!choice) return null;
    const generation = this._state(s, "sensor.life_stage")?.attributes.generation ?? 1;
    return onceEver(`eggcoming-${s.ids?.device}-${generation}`) ? SETUP_COPY.eggComing(choice.name) : null;
  }

  // Open the lay sheet in the status box (a status already up is redrawn as the sheet).
  _openLay(s) {
    s.confirm = null;
    s.screen.classList.remove("show-status");
    this._toggleStatus(s, true);
    s.laySheetAt = Date.now();
    s.status.scrollTop = 0;
    s.status.querySelector(".layback")?.focus({ preventScroll: true });
  }

  // Close it: every exit comes here (or through _toggleStatus, which clears the flag).
  _closeLay(s) {
    if (s.screen.classList.contains("show-status")) this._toggleStatus(s);
    s.laySheet = false;
  }

  _renderLaySheet(s) {
    const offer = this._eggOffer(s);
    if (!offer || offer.offered.length < 2) { // a world change, an older save: the old two taps
      this._closeLay(s);
      return;
    }
    const row = (id, label, on) =>
      `<button class="bell layrow" data-id="${escape(id)}" aria-pressed="${on}">${escape(label)}</button>`;
    const device = this._hass.devices?.[s.ids?.device];
    const name = device?.name_by_user || device?.name || "Pet";
    const html = `
      <div class="shead"><button class="sback layback">${SETUP_COPY.layBack}</button>
        <button class="bell laygo" aria-label="${escape(`${SETUP_COPY.layConfirm}: ${name} retires to the journal and a new egg takes its place`)}">${SETUP_COPY.layConfirm}</button></div>
      <div class="sec">${SETUP_COPY.laySheetHeading}</div>
      <div class="shellnote">${SETUP_COPY.layPrompt}</div>
      <div class="laylist">
        ${row("", SETUP_COPY.laySurprise, !offer.choice && !offer.outside)}
        ${offer.outside ? `<div class="bell layrow ro" aria-current="true">${SETUP_COPY.layOutside}</div>` : ""}
        ${offer.offered.map((r) => row(r.id, r.name.toLowerCase(), offer.choice?.id === r.id)).join("")}
      </div>
      <div class="status-feedback" role="status" aria-live="polite" hidden></div>`;
    if (!this._setStatus(s, html)) return;
    s.status.querySelectorAll(".sec, .shead, .shellnote, .laylist").forEach((h) => h.addEventListener("click", (e) => e.stopPropagation()));
    s.status.querySelector(".layback").addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      this._closeLay(s); // nothing is laid; the pick stays the next egg's
    });
    s.status.querySelectorAll(".layrow[data-id]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(b);
      this._layPick(s, b.dataset.id);
    }));
    s.status.querySelector(".laygo").addEventListener("click", (e) => {
      e.stopPropagation();
      // The tap that opened the sheet must not also lay (a fast double tap).
      if (Date.now() - (s.laySheetAt || 0) < CONFIRM_GAP_MS) return;
      this._tapped(e.currentTarget, s);
      this._press(s, "lay_egg");
      this._closeLay(s);
    });
  }

  // A row: the select's own option string, at once ("" is the surprise: options[0]).
  async _layPick(s, id) {
    const offer = this._eggOffer(s);
    const option = id === "" ? offer?.surprise : offer?.offered.find((r) => r.id === id)?.name;
    if (!option) return; // it left the offer meanwhile: the next draw shows what is
    try {
      await this._hass.callService("select", "select_option", { entity_id: offer.entity, option });
    } catch (err) {
      // A read-only login is refused: the choice stays as it was.
      const refused = /unauthori|forbidden|permission/i.test(`${err?.code} ${err?.message}`);
      this._statusMessage(s, refused ? SETUP_COPY.layRefused : SETTINGS_AGAIN.failed);
    }
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
      this._statusMessage(s, enabled ? SETTINGS_COPY.myDayOn : SETTINGS_COPY.myDayOff);
    } catch (err) {
      this._setMine("my_day", !enabled);
      button.setAttribute("aria-pressed", String(!enabled));
      button.textContent = !enabled ? "on" : "off";
      this._statusMessage(s, SETTINGS_AGAIN.failed);
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
        this._statusMessage(s, SETTINGS_COPY.babyTalkOn);
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
      this._statusMessage(s, SETTINGS_AGAIN.failed);
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
    if (!id) return false;
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
      this._statusMessage(s, enabled ? SETTINGS_COPY.notifyOn : SETTINGS_COPY.notifyOff);
      this._settingsChanged(s, enabled ? "notifyOn" : null);
      return true;
    } catch (err) {
      if (s.mine) s.mine.notify_me = !enabled;
      if (button) {
        button.setAttribute("aria-pressed", String(!enabled));
        button.textContent = !enabled ? "on" : "off";
      }
      this._statusMessage(s, SETTINGS_AGAIN.failed);
      return false;
    } finally {
      button?.classList.remove("pending");
    }
  }

  // Set the pet's head, cropped from the sprite on show, as the background of `el` (28 px, the
  // crop the settings bubble uses); (cx, cy) is where the head's centre and top sit in it.
  _headCrop(s, el, cx, cy) {
    if (!s.pet?.src || !s.drawn) return false;
    const [hx, hy] = s.species?.head?.[s.drawn] || [128, 96];
    let top = this._headTop(s.pet, hx, hy); // the head's top, where a hat sits
    if (top === null && !s.pet.complete) { // not drawn yet (a status opened at once): crop again when it is
      s.pet.addEventListener("load", () => { if (el.isConnected) this._headCrop(s, el, cx, cy); }, { once: true });
    }
    top ??= hy;
    el.style.setProperty("--say-img", `url("${s.pet.src}")`);
    el.style.setProperty("--say-at", `${cx - hx / 2}px ${cy - top / 2}px`);
    return true;
  }

  _statusMessage(s, message) {
    const note = s.status.querySelector(".status-feedback");
    if (!note) return;
    note.textContent = message;
    if (note.classList.contains("say")) this._headCrop(s, note, 14, 3); // its head, cropped from the sprite on show
    note.hidden = false;
    note.style.top = "";
    const tap = this._tapRect && Date.now() - this._tapRect.at < 6000 ? this._tapRect : null;
    if (tap && note.classList.contains("say")) { // never hide the row just changed: the bubble drops to the foot
      const hits = (top, bottom) => bottom > tap.top - 2 && top < tap.bottom + 2;
      const box = note.getBoundingClientRect();
      const foot = s.status.getBoundingClientRect().bottom - 4 - box.height;
      if (hits(box.top, box.bottom) && !hits(foot, foot + box.height)) {
        note.style.top = `${foot - s.status.querySelector(".shead").getBoundingClientRect().top}px`;
      }
    }
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
    const keep = !s.status.contains(active) ? null
      : active.dataset?.finish !== undefined ? `.tile[data-finish="${active.dataset.finish}"]` // its marks move
        : active.className
          // not the classes a tap puts on for a moment (_tapped), or the redrawn button never matches (F4)
          ? `.${active.className.trim().split(/\s+/).filter((c) => !PASSING_CLASSES.has(c)).join(".")}${active.dataset?.gen ? `[data-gen="${active.dataset.gen}"]` : ""}` : null;
    s.statusHtml = html;
    s.status.innerHTML = html;
    if (keep) s.status.querySelector(keep)?.focus({ preventScroll: true });
    return true;
  }

  // "journal ›" on the status page (open) or "‹ status" in the journal's top band (back).
  _journalLink(s, open) {
    s.status.querySelector(open ? ".jlink" : ".sback")?.addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      s.journal = open;
      s.finds = false;
      s.olderOpen = false; // older generations fold up with the journal
      s.tileSaid = null;
      s.refocus = null;
      if (open) this._loadPhotos(s); // a best friend's photos, theirs only
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      s.status.scrollTop = 0; // a new view starts at its top
      this._wipe(s);
      // Open: the band's back link, at the top where the view is (F5). Back: the link just used.
      s.status.querySelector(open ? ".sback" : ".jlink")?.focus({ preventScroll: true });
    });
  }

  // The top band of a deeper page, as the settings sheet has (UX fix 2, F3): the way back at
  // the left, the page's heading at the right, sticky. `page` marks which page is on show.
  _pageBand(back, title, page, note = "") {
    return `<div class="shead" data-page="${page}"><button class="sback">${back}</button>` +
      `<span class="stitle">${title}</span>${note}</div>`;
  }

  // Is this page (not its loading view) already on show? Then a redraw keeps it and its place (F2).
  _pageShown(s, page) {
    return !!s.status.querySelector(`.shead[data-page="${page}"]`);
  }

  // Focus a control once the page that has it is drawn (the back link lands on the door it used).
  _refocus(s) {
    if (!s.refocus) return;
    s.status.querySelector(s.refocus)?.focus({ preventScroll: true });
    s.refocus = null;
  }

  // The world's creatures (unraised ones as silhouettes) and this device's past pets.
  async _renderJournal(s) {
    const heading = `journal · ${escape(this._worldName(s).toLowerCase())}`;
    const loading = `
      ${this._pageBand("‹ status", `${heading} · opening…`, "loading")}
      <div class="log">Gathering your pet's memories…</div>`;
    // Already drawn: a redraw (a tick, a message, the photos) replaces it in one go and keeps
    // its place, instead of passing through the short loading view (F2).
    if (!this._pageShown(s, "journal") && this._setStatus(s, loading)) this._journalLink(s, false);
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
    const every = [...(stage.journal || []), now];
    const past = every.slice(-4);
    const older = every.slice(0, -4); // behind "older generations (N)"
    const ids = [...new Set([...roster, ...every.map((p) => p.species).filter(Boolean)])];
    const names = {};
    await Promise.all(ids.map((id) => loadJson(`sprites/${id}/species.json`)
      .then((d) => { names[id] = d.name; }).catch(() => { names[id] = id; })));
    if (!s.journal || s.finds) return; // closed (or on to the finds) while the names loaded
    const tiles = roster.map((id) => {
      const known = raised.has(id);
      return `<div class="jtile${known ? "" : " locked"}" data-id="${escape(id)}" data-name="${known ? escape(names[id]).toLowerCase() : ""}">` +
        `<img src="${BASE}/sprites/${id}/child_content_1.png?v=${VERSION}" alt="">` +
        `<span>${known ? escape(names[id]).toLowerCase() : "???"}</span></div>`;
    });
    // The family line, oldest first: each generation and its traits.
    const line = (p) =>
      `<div class="gen${p.current ? " now" : ""}">gen ${p.generation}${p.current ? " (now)" : ""} · ` +
      `${escape(p.name)} · ${escape((names[p.species] || "egg").toLowerCase())}` +
      `${p.age_days != null ? ` · ${Math.round(p.age_days)} days` : ""}` +
      `${p.upbringing ? ` · ${escape(p.upbringing)}` : ""}` +
      `${p.personality ? ` · ${escape(String(p.personality).replaceAll("_", " "))}` : ""}` +
      `${gamesPlayed(p.games) ? ` · ${gamesPlayed(p.games)} games` : ""}` +
      `${p.traits?.length ? `<br><span class="gt">${p.traits.map((t) =>
        traitLabel(t, p.levels?.[t], t === p.inherited)).join(" ")}</span>` : ""}</div>`;
    const lines = past.map(line);
    // The rest, oldest first, above the newest four; opened for as long as the journal is.
    const olderLink = older.length
      ? `<button class="jolder">older generations (${older.length})</button>` : "";
    const html = `
      ${this._pageBand("‹ status", `${heading} · gen ${stage.generation || 1}`, "journal", SAY_NOTE)}
      ${this._dreamSaid(s) ? `<div class="jdream">${escape(this._dreamSaid(s))}</div>` : ""}
      ${this._weekStrip(s)}
      <div class="jgrid">${tiles.join("")}</div>
      <button class="wlink">every world ›</button>
      ${this._photoRow(s)}
      <div class="jlist">${olderLink}<div class="jmore"></div>${lines.join("")}${past.length < 2 ? "<div class=\"gt\">a week into adulthood, a pet can lay an egg</div>" : ""}${this._memories(stage.memories)}</div>
      <div class="jfoot"><button class="flink">${findsShown() ? "finds" : "visitors"} ›</button></div>`;
    const top = s.status.scrollTop;
    if (!this._setStatus(s, html)) return;
    s.status.scrollTop = top; // the place a redraw found it at
    this._journalLink(s, false);
    this._findsLink(s, true);
    this._everyWorldLink(s, true);
    this._tileLines(s);
    this._refocus(s);
    const showOlder = () => {
      s.status.querySelector(".jmore").innerHTML = older.map(line).join("");
      s.status.querySelector(".jolder")?.remove();
      s.olderOpen = true;
    };
    const focusOlder = () => { // the button is gone: focus moves to the first revealed generation
      const first = s.status.querySelector(".jmore .gen");
      if (!first) return;
      first.tabIndex = -1;
      first.focus({ preventScroll: true });
    };
    s.status.querySelector(".jolder")?.addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      showOlder();
      focusOlder();
    });
    if (older.length && s.olderOpen) showOlder();
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
    if (s.journal && !s.finds) this._renderJournal(s); // never over the finds page
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

  // --- Every world (top10 8a) ---------------------------------------------------
  // Each world's creatures, one row a world: drawn and named if a pet on this card has
  // raised it (any world: a device that changed world keeps its `raised`), "???" if
  // not, as in the journal. Nothing locked, nothing counted (owner Q6), no new state.

  // "every world ›" under the journal's grid (open) or "‹ journal" on the page (back).
  _everyWorldLink(s, open) {
    s.status.querySelector(open ? ".wlink" : ".sback")?.addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      s.everyWorld = open;
      s.journal = !open;
      s.tileSaid = null;
      // Open: the band's back link (F5). Back: the journal's "every world ›", once it's drawn.
      s.refocus = open ? null : ".wlink";
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      s.status.scrollTop = 0; // a new view starts at its top
      this._wipe(s);
      if (open) s.status.querySelector(".sback")?.focus({ preventScroll: true });
    });
  }

  async _renderEveryWorld(s) {
    const loading = this._pageBand("‹ journal", "every world · opening…", "loading");
    if (!this._pageShown(s, "every") && this._setStatus(s, loading)) this._everyWorldLink(s, false); // F2
    const raised = new Set();
    for (const other of this._slides) (this._state(other, "sensor.life_stage")?.attributes.raised || []).forEach((r) => raised.add(r));
    // The pet's own world first, then the rest in catalog order (F11).
    const worlds = Object.entries(this._worlds || {})
      .sort(([a], [b]) => (b === s.worldKey) - (a === s.worldKey));
    // A creature whose species.json won't load isn't ready: no tile (never a broken image).
    const names = {};
    await Promise.all(worlds.flatMap(([, w]) => (w.roster || []).map((id) => loadJson(`sprites/${id}/species.json`)
      .then((d) => { names[id] = d.name || id; }).catch(() => {}))));
    if (!s.everyWorld) return; // closed (or back to the journal) while the names loaded
    const rows = worlds.map(([, w]) => {
      const tiles = (w.roster || []).filter((id) => names[id]).map((id) => {
        const known = raised.has(id);
        return `<div class="jtile${known ? "" : " locked"}" data-id="${escape(id)}" data-name="${known ? escape(names[id]).toLowerCase() : ""}">` +
          `<img src="${BASE}/sprites/${id}/child_content_1.png?v=${VERSION}" alt="">` +
          `<span>${known ? escape(names[id]).toLowerCase() : "???"}</span></div>`;
      });
      return tiles.length ? `<div class="sec lc">${escape((w.name || "").toLowerCase())}</div><div class="jgrid">${tiles.join("")}</div>` : "";
    });
    const html = `
      ${this._pageBand("‹ journal", "every world", "every", SAY_NOTE)}
      ${rows.join("")}`;
    const top = s.status.scrollTop;
    if (!this._setStatus(s, html)) return;
    s.status.scrollTop = top; // F2: a redraw keeps its place
    this._everyWorldLink(s, false);
    this._tileLines(s);
    this._refocus(s);
  }

  // A tap on a creature's tile: the pet says one line, once a tile for as long as the page
  // is open (UX fix 2, F14). A raised one it names, an unmet one is still a silhouette.
  _tileLines(s) {
    s.status.querySelectorAll(".jtile").forEach((tile) => tile.addEventListener("click", () => {
      const said = (s.tileSaid ??= new Set());
      if (said.has(tile.dataset.id)) return;
      said.add(tile.dataset.id);
      const at = tile.getBoundingClientRect(); // the bubble must not cover the tile just tapped
      this._tapRect = { top: at.top, bottom: at.bottom, at: Date.now() };
      this._statusMessage(s, tile.classList.contains("locked") ? STATUS_COPY.tileUnmet
        : STATUS_COPY.tileRaised(tile.dataset.name));
    }));
  }

  // --- The finds page (visitors v2 §4, V-D) --------------------------------------
  // This world's visitors and finds, read on open from virtual_pet/collection (never a
  // sensor) and kept only while the page is: never in localStorage. The viewer's gifts
  // (`gifts`, sent only when `shared` is false) put a ♥ on their tiles, on their own
  // screen only; a shared screen's flip drops the page and its ♥ (_dropFinds).

  // "finds ›" in the journal's foot (open) or "‹ journal" on the page (back).
  _findsLink(s, open) {
    s.status.querySelector(open ? ".flink" : ".sback")?.addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      s.finds = open;
      s.journal = !open;
      s.tileSaid = null;
      s.refocus = open ? null : ".flink"; // back lands on "finds ›" once the journal is drawn
      if (open) {
        this._dropFinds(s); // read again on each open: the page only grows
        this._loadFinds(s);
      }
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      s.status.scrollTop = 0; // a new view starts at its top
      this._wipe(s);
    });
  }

  // Read the page once per open (one read in flight a slide); a reply for another pet,
  // or from before a shared-screen flip, is dropped. An error (an older server) goes
  // back to the journal, with nothing said.
  _loadFinds(s) {
    if (!s.findsLoad) {
      const load = this._fetchFinds(s).finally(() => { if (s.findsLoad === load) s.findsLoad = null; });
      s.findsLoad = load;
    }
    return s.findsLoad;
  }

  async _fetchFinds(s) {
    const id = s.ids?.["sensor.life_stage"];
    const epoch = s.findsEpoch || 0;
    const shared = sharedScreen();
    const stale = () => (s.findsEpoch || 0) !== epoch || s.ids?.["sensor.life_stage"] !== id || sharedScreen() !== shared;
    let reply = null;
    try {
      if (!id) throw new Error("no pet");
      reply = await this._hass.callWS({ type: "virtual_pet/collection", entity_id: id, shared });
      if (!reply || typeof reply !== "object") throw new Error("no page");
    } catch (err) {
      if (stale() || !s.finds) return;
      s.finds = false;
      s.journal = true;
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      return;
    }
    if (stale()) return;
    s.findsData = { reply, own: !shared };
    if (s.finds) this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
  }

  _renderFinds(s) {
    const data = s.findsData;
    if (!data && !s.findsLoad) this._loadFinds(s); // dropped meanwhile (a shared-screen flip)
    const key = data?.reply?.world || s.worldKey;
    const world = this._worlds?.[key];
    // Named by what it shows: visitors only when FINDS_SHOWN is off (top10 7a).
    const head = `${findsShown() ? "finds" : "visitors"} · ${escape((world?.name || this._worldName(s)).toLowerCase())}`;
    let html;
    if (!data) {
      html = this._pageBand("‹ journal", `${head} · opening…`, "loading");
    } else {
      const own = data.own && !sharedScreen();
      const tile = (t) => {
        const src = t.kind === "visitor" ? `${BASE}/ui/visitor_${key}_${t.id}_1.png?v=${VERSION}`
          : `${BASE}/ui/find_${key}_${t.id}.png?v=${VERSION}`;
        const cls = `ftile${t.kind === "visitor" ? " vis" : ""}${t.met ? "" : " locked"}`;
        // An unmet one: the art's silhouette, with no name, no alt and no label.
        if (!t.met) return `<div class="${cls}"><img src="${src}" alt=""></div>`;
        return `<div class="${cls}"><img src="${src}" alt=""><span>${escape(t.name || "")}</span>` +
          `${t.heart ? `<span class="fheart">♥</span>` : ""}</div>`;
      };
      const tiles = collectionTiles(world, data.reply, own);
      html = `
      ${this._pageBand("‹ journal", head, "finds", SAY_NOTE)}
      <div class="fgrid">${tiles.filter((t) => t.kind === "visitor").map(tile).join("")}</div>
      ${findsShown() ? `<div class="fgrid">${tiles.filter((t) => t.kind === "find").map(tile).join("")}</div>` : ""}`;
    }
    if (!this._setStatus(s, html)) return;
    this._findsLink(s, false);
  }

  // Forget a slide's finds page (another pet, a shared-screen flip, the sheet closed).
  _dropFinds(s) {
    s.findsEpoch = (s.findsEpoch || 0) + 1;
    s.findsLoad = null; // a read still running will find its epoch stale
    s.findsData = null;
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
    const at = button.getBoundingClientRect(); // where it was, for a note that must not cover it (F13)
    this._tapRect = { top: at.top, bottom: at.bottom, at: Date.now() };
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
    this._perk(s);
  }

  // The pet perks up (a quick hop).
  _perk(s) {
    if (!s?.pet) return;
    s.pet.classList.remove("perk");
    void s.pet.offsetWidth; // restart the animation
    s.pet.classList.add("perk");
    setTimeout(() => s.pet.classList.remove("perk"), 320); // let "hop" run again
  }

  // The pet's word on the last change made in the settings sheet (F14), said when the
  // status closes: once per change, only where it may make a sound (not at night, not
  // asleep: _mayPlay), and never about a personal switch on a shared screen. A change
  // with no line (or one put back) clears it. Only while the sheet is up.
  _settingsChanged(s, key) {
    if (!s.settings) return;
    s.settingsChanged = SETTINGS_REACT[key] ? key : null;
  }

  _settingsReact(s) {
    const key = s.settingsChanged;
    s.settingsChanged = null;
    if (!key || !SETTINGS_REACT[key]) return;
    if (key === "notifyOn" && sharedScreen()) return; // personal
    if (!this._mayPlay(s)) return;
    this._perk(s);
    this._speak(s, SETTINGS_REACT[key], 4000);
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
    if (s.scene) {
      // A second tap on the same care ends its scene and isn't sent again.
      const same = s.scene.kind === action;
      this._sceneEnd(s);
      if (same) {
        this._tapped(button, s);
        return;
      }
    }
    if (!id) return;
    // A care with the status open happens in view, as a game does (UX fix 2, F7): the sheet
    // closes first, so the meal or the medicine shows and a refusal is read in its bubble.
    if (!s.laySheet && s.screen.classList.contains("show-status")) this._toggleStatus(s);
    // Its log entry is "mine" (PR 2a); a few kept, so two quick taps both count.
    s.pressed = [...(s.pressed || []).filter((p) => Date.now() - p.pressedAt < MINE_MATCH_MS), { action, pressedAt: Date.now() }];
    this._sceneStart(s, action);
    this._call(button, s, "button", "press", id);
  }

  // --- Care scenes ----------------------------------------------------------
  // Medicine and clean play as a little scene of about 2 s, not a click. The call
  // goes out at the tap as ever, but the screen keeps showing the pet as it was
  // (_state holds the slide's states, all but last_care) until the scene ends,
  // then draws the news. One clock: _sceneRender(s, t) sets everything from the
  // time since the tap, so an interruption just ends it (_sceneEnd).

  // Start one if this care will work; refusals stay as they are (the server says no).
  _sceneStart(s, kind) {
    if (!SCENE_MS[kind] || !s.species || s.game || s.screen.classList.contains("show-status")) return;
    const mood = this._state(s, "sensor.mood");
    const stage = this._state(s, "sensor.life_stage")?.state;
    if (!mood || mood.state === "away" || stage === "egg" || s.asleep || s.lightsOut) return;
    const due = kind === "medicine" ? (mood.attributes.flags || []).includes("sick")
      : Number(this._state(s, "sensor.poop")?.state || 0) > 0;
    if (!due) return;
    if (calm()) {
      s.sceneFade = { kind, until: Date.now() + 10000 }; // no scene: the news fades in
      return;
    }
    const held = {};
    for (const [key, id] of Object.entries(s.ids || {})) {
      if (key !== "sensor.last_care" && key !== "device") held[key] = this._hass.states[id];
    }
    const sc = { kind, held, start: performance.now(), ms: SCENE_MS[kind], els: [], frames: null };
    const add = (tag, cls) => {
      const el = document.createElement(tag);
      el.className = cls;
      if (tag === "img") el.alt = "";
      s.screen.insertBefore(el, s.screen.querySelector(".rain"));
      sc.els.push(el);
      return el;
    };
    const box = s.screen.getBoundingClientRect();
    const pet = s.pet.getBoundingClientRect();
    sc.cheer = this._sceneFrames(s, "cheer");
    if (kind === "clean") this._actPose(s.species, s.drawn, s.speciesId, "splash", () => {}); // warm the load probe
    if (kind === "medicine") {
      sc.pill = add("img", "scene scene-pill");
      sc.pill.setAttribute("src", spriteSrc(s.speciesId, s.species.props?.medicine || "bird/medicine"));
      // It steps up until its front (most of the way across its frame) is at the pill.
      const pill = sc.pill.getBoundingClientRect();
      const front = pet.left + pet.width * 0.72;
      sc.step = Math.max(0, Math.min(box.width * 0.22, pill.left + pill.width / 2 - front));
      sc.eat = this._sceneFrames(s, "eat");
      const extras = s.drawn === "child" && s.species.extras?.squint;
      const excited = s.species.moods?.includes("excited") && s.drawn &&
        Array.from({ length: s.species.frames || 1 }, (_, i) => `${s.drawn}_excited_${i + 1}`);
      sc.cheer ||= extras ? [].concat(extras) : excited || null;
      // A few sparkles about its head, where it stands.
      sc.sparks = [[0.22, 0.2], [0.78, 0.12], [0.66, 0.42]].map(([x, y]) => {
        const el = add("div", "scene-spark");
        el.style.left = `${pet.left - box.left + pet.width * x}px`;
        el.style.top = `${pet.top - box.top + pet.height * y}px`;
        return el;
      });
    } else {
      sc.water = s.world?.mess === "murk";
      const own = (key) => [].concat(s.species.props?.[key] || SCENE_PROPS[key]);
      sc.toolArt = own(sc.water ? "net" : "broom");
      if (!sc.water) sc.dustArt = own("dust");
      if (sc.water) sc.bubbleArt = own("bubbles");
      if (sc.dustArt) sc.dust = add("img", "scene scene-dust");
      sc.tool = add("img", `scene scene-${sc.water ? "net" : "broom"}`);
      if (sc.bubbleArt) sc.bubbles = add("img", "scene scene-bubbles");
      // Each mess on show goes as the broom (or net) passes its middle.
      sc.mess = s.poops.filter((el) => el.style.display !== "none").map((el) => {
        const r = el.getBoundingClientRect();
        return { el, x: r.left - box.left + r.width / 2 };
      });
      sc.murk = s.murk.style.display !== "none" && Number(s.murk.style.opacity) > 0;
    }
    s.scene = sc;
    this._patSync(s);
    for (const el of [s.pet, s.perch]) el.style.transition = "none";
    // A tap on the screen ends it (and doesn't open the status).
    sc.stop = (e) => {
      e.stopImmediatePropagation();
      this._sceneEnd(s);
    };
    s.screen.addEventListener("click", sc.stop, true);
    this._sceneRender(s, 0);
    const loop = () => {
      if (s.scene !== sc) return;
      const t = performance.now() - sc.start;
      if (t >= sc.ms) {
        this._sceneEnd(s);
        return;
      }
      if (!sc.paused) this._sceneRender(s, t); // paused: a check seeks it instead
      sc.raf = requestAnimationFrame(loop);
    };
    sc.raf = requestAnimationFrame(loop);
  }

  // A species' own care frames, when its art has them: species.json "acts", like
  // {"eat": ["baby", "teen", "adult"], "cheer": true} (true: every stage), drawn as
  // <stage>_eat_1 and <stage>_eat_2. Else null, and the scene uses what all have.
  _sceneFrames(s, act) {
    const stages = s.species?.acts?.[act];
    const st = s.drawn;
    if (!st || !(stages === true || (Array.isArray(stages) && stages.includes(st)))) return null;
    return [`${st}_${act}_1`, `${st}_${act}_2`];
  }

  // Scene art (props) on the world's grid: its PNG is 4 frame px per art px, and
  // an art px is 1/64 of the pet's 62% of the screen's height. That is the
  // pet's frame scale (256 frame px), whichever grid the creature is drawn on.
  _sceneArt(s, img, sprite) {
    const src = spriteSrc(s.speciesId, sprite);
    if (img.getAttribute("src") === src) return;
    img.onload = () => {
      img.style.height = `${(img.naturalHeight / 4) * 62 / 64}%`;
    };
    img.setAttribute("src", src);
  }

  _sceneRender(s, t) {
    const sc = s.scene;
    const sw = s.screen.clientWidth;
    const sh = s.screen.clientHeight;
    const ramp = (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
    const ease = (a, b) => {
      const k = ramp(a, b);
      return k * k * (3 - 2 * k);
    };
    let frames = null;
    if (sc.kind === "medicine") {
      // Notice the pill, step up, lean in and take it, step back, a happy hop.
      const step = sc.step * (ease(350, 850) - ease(1500, 1900));
      const hop = -0.06 * sh * Math.sin(Math.PI * ramp(1450, 1750));
      s.pet.style.translate = `${step}px ${hop}px`;
      s.perch.style.translate = `${step}px 0`;
      s.pet.style.rotate = `${(sc.eat ? 4 : 9) * (ease(850, 1000) - ease(1250, 1400))}deg`;
      const gulp = ease(1000, 1250);
      sc.pill.style.opacity = String(1 - gulp);
      sc.pill.style.scale = String((0.3 + 0.7 * ease(0, 200)) * (1 - 0.7 * gulp));
      sc.pill.style.translate = `${-0.3 * sc.step * gulp}px 0`;
      if (t >= 850 && t < 1400) frames = sc.eat;
      if (t >= 1400) frames = sc.cheer;
      sc.sparks.forEach((el, i) => {
        const k = ramp(1450 + i * 150, 2050 + i * 150);
        el.style.opacity = k > 0 && k < 1 ? String(1 - k * k) : "0";
        el.style.scale = String(0.4 + k);
      });
    } else {
      // The broom (on water worlds, a net) crosses the floor left to right.
      const sweep = ramp(0, 1800);
      this._sceneArt(s, sc.tool, sc.toolArt[Math.floor(t / 180) % sc.toolArt.length]);
      const tw = sc.tool.getBoundingClientRect().width || sw * 0.25;
      const left = -tw + (sw + tw) * sweep;
      const point = left + tw / 2;
      sc.tool.style.left = `${left}px`;
      sc.tool.style.display = sweep < 1 ? "" : "none";
      if (sc.water) sc.tool.style.translate = `0 ${Math.sin(t / 150) * 0.02 * sh}px`;
      if (sc.dust) {
        // Dust kicks up behind it.
        this._sceneArt(s, sc.dust, sc.dustArt[Math.floor(t / 220) % sc.dustArt.length]);
        sc.dust.style.left = `${left - sc.dust.getBoundingClientRect().width * 0.55}px`;
        sc.dust.style.opacity = String(0.9 * ramp(60, 260) * (1 - ramp(1650, 2000)));
      }
      for (const { el, x } of sc.mess) {
        const k = Math.min(1, Math.max(0, (point - x) / (0.05 * sw)));
        el.style.opacity = String(1 - k);
        el.classList.toggle("scene-gone", k >= 1);
      }
      if (sc.murk) {
        // The water clears behind the net, with a soft edge.
        const p = Math.min(106, Math.max(-6, (point / sw) * 100));
        s.murk.style.maskImage = `linear-gradient(90deg, transparent ${p - 6}%, #000 ${p + 6}%)`;
      }
      if (sc.bubbles) {
        // Then bubbles rise where the water was cleared.
        const k = ramp(1600, 2300);
        this._sceneArt(s, sc.bubbles, sc.bubbleArt[Math.floor(t / 200) % sc.bubbleArt.length]);
        sc.bubbles.style.left = `${sw * 0.62}px`;
        sc.bubbles.style.translate = `0 ${-0.35 * sh * k}px`;
        sc.bubbles.style.opacity = String(k > 0 ? 1 - ramp(2000, 2300) : 0);
      }
      if (t >= 1800 && !sc.shone) {
        sc.shone = true;
        const prop = s.species.props?.clean;
        if (prop) {
          this._show(s, s.prop, prop);
          s.propUntil = Date.now() + 1500;
        }
        this._sparkle(s);
      }
      if (t >= 1800) frames = this._actPose(s.species, s.drawn, s.speciesId, "splash", () => {}) || sc.cheer;
    }
    sc.frames = frames;
    const shown = frames || s.frames;
    if (shown?.length) this._show(s, s.pet, shown[Math.floor(t / 300) % shown.length]);
  }

  // End it, wherever it got to, and draw the pet as it is now.
  _sceneEnd(s, { quiet = false } = {}) {
    const sc = s.scene;
    if (!sc) return;
    cancelAnimationFrame(sc.raf);
    s.scene = null;
    this._patSync(s);
    s.screen.removeEventListener("click", sc.stop, true);
    sc.els.forEach((el) => el.remove());
    for (const el of [s.pet, s.perch]) el.style.translate = el.style.rotate = el.style.transition = "";
    for (const el of s.poops) {
      el.style.opacity = "";
      el.classList.remove("scene-gone");
    }
    if (sc.murk) {
      // What the net cleared stays clear: no fading back in from the held murk.
      s.murk.style.transition = "none";
      s.murk.style.opacity = "0";
      s.murk.style.maskImage = "";
      setTimeout(() => { s.murk.style.transition = ""; }, 50);
    }
    // The server's answer may come after this: it's shown, not acted again.
    if (!sc.answered) s.sceneOwes = { kind: sc.kind, until: Date.now() + 10000 };
    s.frame = 0;
    if (!quiet) this._redraw(s);
    if (!quiet && sc.answered && sc.kind === "medicine") this._allBetter(s, true); // the cheer is over
  }

  // The server's answer to a scene's tap (_react). The scene shows an "ok" itself;
  // a refusal ends it, said as ever. Under reduced motion the news fades in.
  _sceneAnswered(s, entry) {
    const ok = entry.result === "ok";
    if (s.scene?.kind === entry.action) {
      if (ok) {
        s.scene.answered = true;
        return true;
      }
      this._sceneEnd(s);
      return false;
    }
    const now = Date.now();
    if (s.sceneOwes?.kind === entry.action && now < s.sceneOwes.until) {
      s.sceneOwes = null;
      return ok;
    }
    if (s.sceneFade?.kind === entry.action && now < s.sceneFade.until) {
      s.sceneFade = null;
      if (ok) {
        for (const el of [s.pet, s.prop]) el.animate?.([{ opacity: 0.2 }, { opacity: 1 }], { duration: 350 });
      }
    }
    return false;
  }

  // --- Games ----------------------------------------------------------------
  // The server keeps the game and the score (virtual_pet.play_game); the card
  // only asks, and shows what happened.

  _startGame(s, button) {
    this._tapped(button, s);
    if (s.game) this._quitGame(s, null); // Play mid-game starts over
    this._clearAsk(s); // a game takes the screen
    const energy = Number.parseFloat(this._state(s, "sensor.energy")?.state);
    const refusal = s.asleep ? REFUSALS.asleep : energy < 15 ? REFUSALS.too_tired : null;
    if (refusal) {
      this._write(s, refusal, 3500);
      return;
    }
    if (s.screen.classList.contains("show-status")) this._toggleStatus(s);
    s.screen.querySelector(".flair")?.remove();
    // The pet's game of the day leads the list (G-a); the last game played keeps the focus.
    const today = this._gameOfDay(s);
    const games = [...GAMES].sort((a, b) => (b.key === today) - (a.key === today));
    if (games.length === 1) {
      this._pickGame(s, games[0].key);
      return;
    }
    // The long prompt wraps to two lines (over the picker) on a slide under 300 px.
    // Once a day the wide prompt is the game of the day's line (G-a); the day after
    // someone picked tomorrow's game, it's that game's line instead (F6), once.
    const picked = this._followGame(s);
    // F6: at any width. Where the games can't sit clear of a long line, it is said for 2 s,
    // then "pick a game!" (see _pickerSay).
    const pickLine = picked && !picked.said && (picked.said = true) && picked.line;
    const dayLine = pickLine || (oncePerDay(`gamepick-${s.ids?.device}`) &&
      (this._typeKey(s) ? GAME_PICK_LINES[today] : GAME_PICK_LINES.generic));
    s.game = { picking: true, prompt: dayLine || (this._slideW < 300 ? PICK_SHORT : "what shall we play?") };
    // Built each time: the card's options decide which games are offered.
    s.gameBox.querySelector(".gpick").innerHTML = games.map((g) =>
      `<button data-game="${g.key}">${g.label}</button>`).join("");
    this._gameView(s, "pick");
    // A narrow card has room for one short line beside the close button.
    this._pickerSay(s, s.game, s.game.prompt);
    let last = null;
    try {
      last = localStorage.getItem(LAST_GAME_KEY);
    } catch (err) {
      // no storage here (a private window): start from the first game
    }
    const pick = s.gameBox.querySelector(`.gpick [data-game="${last}"]`) ||
      s.gameBox.querySelector(".gpick button");
    pick.focus({ preventScroll: true });
    if (!picked) this._pickerFollow(s); // F6: tomorrow's game, picked yesterday
  }

  // F6: the game someone picked yesterday for today (from this pet's follow-up), or null.
  _followGame(s) {
    const f = s.followGame;
    return f && f.day === new Date().toDateString() && GAMES.some((g) => g.key === f.key) ? f : null;
  }

  // Fetched as the picker opens (the server marks it said): the picked game moves to the
  // front with the focus, and the wide prompt becomes its line.
  async _pickerFollow(s) {
    const reply = await this._followFetch(s, "picker");
    if (reply?.kind !== "game" || !GAMES.some((g) => g.key === reply.choice)) return;
    const line = turnPick(GAME_TOMORROW.day, `${s.ids?.device}|gamepick`);
    s.followGame = { key: reply.choice, day: new Date().toDateString(), line, said: false };
    if (!s.game?.picking) return;
    const list = s.gameBox.querySelector(".gpick");
    const button = list?.querySelector(`[data-game="${reply.choice}"]`);
    if (!button) return;
    list.prepend(button);
    button.focus({ preventScroll: true });
    s.followGame.said = true;
    this._pickerSay(s, s.game, line);
  }

  // The picker's line in the bubble, with the games fitted under it. A long line the games
  // can't sit clear of (a phone's narrow screen) is said for 2 s, then "pick a game!" (F6).
  _pickerSay(s, g, line) {
    g.prompt = line;
    this._write(s, line, 60000);
    if (this._fitPicker(s) || line === PICK_SHORT) return;
    this._gameLater(s, g, 2000, () => {
      g.prompt = PICK_SHORT;
      this._write(s, PICK_SHORT, 60000);
      this._fitPicker(s);
    });
  }

  // The picker sits under the close button (and the one-line prompt beside
  // it), down to the screen's foot. A column of games that doesn't fit there
  // wraps into rows (.wrap), so no width from 300 to 420 hides or covers one.
  // True when the games sit clear of the prompt and the close button (F6).
  _fitPicker(s) {
    const pick = s.gameBox.querySelector(".gpick");
    const gx = s.gameBox.querySelector(".gx");
    if (!pick || !gx || pick.hidden) return true;
    const box = s.gameBox.getBoundingClientRect();
    if (!box.height) return true;
    pick.classList.remove("wrap", "tight");
    const buttons = [...pick.querySelectorAll("button")];
    // First the plain column where it has always been, if it covers nothing: not
    // the close button, not the prompt, and none cut off at the foot.
    pick.style.top = pick.style.bottom = "";
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const keep = [gx, s.bubble].filter((el) => el && !el.hidden).map((el) => el.getBoundingClientRect())
      .filter((r) => r.height);
    if (buttons.every((b) => {
      const r = b.getBoundingClientRect();
      return r.bottom + 4 <= box.bottom && !keep.some((k) => hit(r, k));
    })) return true;
    pick.style.bottom = "2%";
    // The games' height, from the first one's top to the last one's foot, + the press shadow.
    const need = () => Math.max(...buttons.map((b) => b.offsetTop + b.offsetHeight)) -
      Math.min(...buttons.map((b) => b.offsetTop)) + 4;
    const rows = () => {
      pick.classList.remove("wrap", "tight");
      if (need() > pick.clientHeight) pick.classList.add("wrap");
      if (need() > pick.clientHeight) pick.classList.add("tight");
      return need() <= pick.clientHeight;
    };
    // Under the close button and, if it fits there, under a wrapped prompt too (F6).
    const bubble = keep.find((r) => r.left < box.left + box.width / 2);
    const under = Math.max(gx.getBoundingClientRect().bottom, bubble?.bottom || 0);
    pick.style.top = `${Math.round(under - box.top + 6)}px`;
    let clear = rows();
    if (!clear) {
      pick.style.top = `${Math.round(gx.getBoundingClientRect().bottom - box.top + 6)}px`;
      rows();
    }
    return clear;
  }

  // Show the picker ("pick") or a game's buttons (its key) in the game overlay.
  _gameView(s, view) {
    const box = s.gameBox;
    box.hidden = false;
    box.classList.toggle("dig", view === "dig");
    box.querySelector(".gpick").hidden = view !== "pick";
    s.gameNum.hidden = view !== "higher_lower" && view !== "dig";
    const [gl, gr] = [box.querySelector(".gl"), box.querySelector(".gr")];
    gl.hidden = gr.hidden = view === "pick";
    s.gameScore.hidden = view === "pick";
    const hl = view === "higher_lower";
    const dig = view === "dig";
    gl.innerHTML = hl ? '<span class="hl">lo</span>' : dig ? '<span class="hl">keep</span>' : icon("prev", 22);
    gr.innerHTML = hl ? '<span class="hl">hi</span>' : dig ? '<span class="hl">dig</span>' : icon("next", 22);
    gl.setAttribute("aria-label", hl ? "Guess lower" : dig ? "Keep the basket" : "Guess left");
    gr.setAttribute("aria-label", hl ? "Guess higher" : dig ? "Dig a leaf" : "Guess right");
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
    s.gameBox.classList.remove("showgo");
    this._gameView(s, kind);
    // Playing together is the hello (F7): the day's "hi, <name>!" doesn't wait out the game.
    if (!s.greeted) this._greetSpent(s);
    this._reactFrames(s, "ready", { inGame: true }); // acts.ready, if the species has it
    const ready = s.species?.acts?.ready;
    if (!(Array.isArray(ready) || ready === true) && !calm()) this._animate(s, s.pet, "perk", 300); // F5: else a perk
    s.gameScore.textContent = "round 1/5";
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
    g.lastAt = Date.now();
    s.gameBox.querySelectorAll(".gl, .gr").forEach((b) => { b.setAttribute("aria-disabled", "false"); });
    s.gameScore.textContent = `round ${info.round + 1}/${info.rounds} · ${info.wins} right`;
    // The prompt is kept on the game: a care line said over it gives way to it again.
    if (kind === "dig") {
      // A fresh pile, or a parked dig carried on: the same round, bank and basket.
      g.basket = info.basket;
      this._digShow(s, info);
      g.prompt = "dig or keep?";
      const watcher = this._digWatcher(s);
      // A parked dig carried on says so first (F8), then the visitor, then the prompt.
      const resumed = !!(info.round || info.wins || info.basket);
      const said = [resumed && GAME_COPY.back, watcher && DIG_WATCH(watcher.name), g.prompt].filter(Boolean);
      this._write(s, said[0]);
      said.slice(1).forEach((line, i) => this._gameLater(s, g, 1500 * (i + 1), () => this._write(s, line, 60000)));
      s.sayUntil = Date.now() + 60000;
      // Keep is disabled on an empty basket: start on dig then.
      s.gameBox.querySelector(info.basket ? ".gl" : ".gr").focus({ preventScroll: true });
      return;
    } else if (kind === "left_right") {
      this._write(s, (g.prompt = "left or right? guess where i'll go!"));
    } else {
      // Higher or Lower shows its number before the next guess.
      this._showNumber(s, info.number);
      g.prompt = "will the next one be higher or lower?";
      if (!this._luckyNumber(s, g, info.number)) this._write(s, g.prompt);
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
    s.gameNum.innerHTML = digit(n, 3);
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
        "virtual_pet", "play_game", { entity_id: id, ...data, ...digShared(data.game) }, undefined, false, true);
      info = res?.response;
    } catch (err) {
      if (s.game === game) this._endGame(s, "hmm, that didn't work");
      return null;
    }
    if (s.game !== game) return null; // stopped while waiting
    if (!info || info.result !== "ok") {
      // A known refusal is said once, by _react, from the care log; only an
      // unknown result gets a line here. no_game is never logged (a Higher or
      // Lower game the server dropped for idling): said here.
      // A dig: keep on an empty basket means another screen kept it first; no
      // game while theirs is parked means another screen put it aside.
      if (info?.result === "no_game" && !info.parked && data.guess && data.game !== "dig") {
        // F13: the server lost this game (a restart, the idle drop): the line comes true, a
        // new game starts after it (taps are ignored meanwhile: the game is still busy).
        this._write(s, REFUSALS.no_game, 60000);
        this._gameLater(s, game, 1500, () => this._pickGame(s, data.game));
        return null;
      }
      this._endGame(s, info?.result === "empty_basket" ? "oh! someone else is playing with me"
        : info?.result === "no_game" && info.parked ? "maybe later!"
        : info?.result === "no_game" ? REFUSALS.no_game : REFUSALS[info?.result] ? null : "not now");
      return null;
    }
    return info;
  }

  async _guess(s, side) {
    if (!s.game || s.game.busy || !s.game.kind) return;
    this._tapped(s.gameBox.querySelector(side === "left" ? ".gl" : ".gr"), s);
    const kind = s.game.kind;
    const game = GAMES.find((g) => g.key === kind);
    const guess = game.guesses[side === "left" ? 0 : 1];
    if (kind === "dig") {
      await this._digTap(s, guess); // a tap isn't a round: its own checks, not the ones below
      return;
    }
    const g = s.game;
    g.busy = true;
    const mark = g.tap = (g.tap || 0) + 1;
    s.gameBox.querySelectorAll(".gl, .gr").forEach((b) => { b.setAttribute("aria-disabled", "true"); });
    s.gameScore.textContent = "thinking…";
    const info = await this._playCall(s, { game: kind, guess });
    if (!info) return;
    // Round 1 while we are past it can only be a new game (the server's `restarted`
    // flag is lost across an HA restart): adopt it the same way.
    if (info.restarted || (info.round === 1 && g.round > 0)) {
      // The server dropped our game for idling and this guess began a new one:
      // it is round 1 of that game, said as any round.
      g.round = 0;
      g.wins = 0;
    }
    if (info.round !== g.round + 1) {
      // Another viewer guessed on the same server game meanwhile.
      this._endGame(s, "oh! someone else is playing with me");
      return;
    }
    g.round = info.round;
    g.wins = info.wins;
    g.lastAt = Date.now();
    if (kind === "higher_lower") {
      this._showNumber(s, info.number);
      this._animate(s, s.gameNum, "flip", 300);
      this._animate(s, s.pet, "perk", 300);
      this._write(s, info.correct ? `yes! ${info.number}` : `nope, ${info.number}!`);
    } else {
      s.pet.classList.add(`go-${info.went}`);
      s.gameBox.classList.add("showgo"); // F4: the guess buttons fade, so the pet shows
      this._write(s, info.correct ? "yes! you found me" : `nope, i went ${info.went}!`);
    }
    this._chirp(s, info.correct ? "tap" : "buzz"); // F14
    s.gameScore.textContent = `round ${info.round}/${info.rounds} · ${info.wins} right`;
    const prompt = kind === "higher_lower" ? "higher or lower?" : "one more! left or right?";
    const at = Date.now();
    // F1: the buttons come back as before, but the result stays in the bubble until it can
    // be read (GAME_READ_MS since this guess); a game's last guess waits longer (GAME_END_MS).
    this._gameLater(s, g, info.done ? GAME_END_MS : 900, () => {
      s.pet.classList.remove("go-left", "go-right");
      s.gameBox.classList.remove("showgo");
      if (info.done) {
        if (info.won) this._chirp(s, "win");
        this._endGame(s, info.won ? `${info.wins}/${info.rounds}! you win ♪` :
          `${info.wins}/${info.rounds}. let's play another time ♪`);
        this._gameEndType(s, info.won);
        return;
      }
      g.busy = false;
      s.gameBox.querySelectorAll(".gl, .gr").forEach((b) => { b.setAttribute("aria-disabled", "false"); });
      s.gameScore.textContent = `round ${info.round + 1}/${info.rounds} · ${info.wins} right`;
      g.prompt = prompt;
      if (kind === "higher_lower" && this._luckyNumber(s, g, info.number)) return;
      this._promptLater(s, g, mark, at);
    });
  }

  // F1: the bubble asks again only when nothing has been tapped since `mark` for
  // GAME_READ_MS (counted from that tap): a tap in between has its own result to show.
  _promptLater(s, g, mark, since = Date.now()) {
    const wait = Math.max(0, GAME_READ_MS - (Date.now() - since));
    this._gameLater(s, g, wait, () => {
      if (g.tap === mark && !g.busy) this._write(s, g.prompt, 60000);
    });
  }

  // --- Fresh-expand E5: games and dig --------------------------------------------

  // G-a: this pet's game of the day (the same all day; a type leans to its game).
  _gameOfDay(s) {
    const picked = this._followGame(s); // F6: someone's pick for today leads
    return picked ? picked.key : dailyPick(gameDayList(this._typeKey(s)), `${s.ids?.device}|game`);
  }

  // G-b: this pet's lucky number today, 1-9 (the server's numbers).
  _lucky(s) {
    return dailyPick([1, 2, 3, 4, 5, 6, 7, 8, 9], `${s.ids?.device}|lucky`);
  }

  // When higher or lower shows the lucky number: a sparkle and the line over the
  // number for 1.5 s, then the prompt; once a game, no score change. True: said.
  _luckyNumber(s, g, n) {
    if (g.lucky || n !== this._lucky(s)) return false;
    g.lucky = true;
    this._sparkle(s);
    this._write(s, LUCKY_LINE);
    this._gameLater(s, g, 1500, () => this._write(s, g.prompt, 60000));
    return true;
  }

  // G-c: the count line stays; half the time a teen or adult's own line 4 s later.
  _gameEndType(s, won) {
    const key = won ? "game_win" : "game_lose";
    const own = this._persona(s)?.[key];
    if (!own || Math.random() >= GAME_TYPE_ODDS) return;
    const line = this._fresh(s, key, own);
    setTimeout(() => { if (!s.game) this._line(s, FLAVOUR, line, 3500); }, GAME_TYPE_MS);
  }

  // D-a: a walking day visitor that came by here today watches a dig on a day screen:
  // its first frame, still, at the pile's other side, behind the buttons. The visitor, or null.
  _digWatcher(s) {
    const name = this._visitSeen(s);
    const v = name && visitorList(s.world).find((x) => x.name === name);
    if (!v || !v.walk || v.hours === "night" || this._screenDark(s)) return null;
    const img = document.createElement("img");
    img.className = "gwatch";
    img.alt = "";
    img.dataset.visitor = `${s.worldKey}/${v.id}`;
    img.src = `${BASE}/ui/visitor_${s.worldKey}_${v.id}_1.png?v=${VERSION}`;
    s.gameBox.prepend(img);
    return v;
  }

  // Berry dig: the pile's leaves left in .gnum, the bank and basket on the
  // score line, keep only with something in the basket.
  _digShow(s, info) {
    this._showNumber(s, info.leaves);
    s.gameNum.setAttribute("aria-label", `${info.leaves} leaves left`);
    s.gameScore.classList.add("two");
    s.gameScore.textContent = `round ${Math.min(info.round + 1, info.rounds)}/${info.rounds}\n` +
      `${info.wins} banked · basket ${info.basket}`;
    s.gameBox.querySelector(".gl").setAttribute("aria-disabled", info.basket ? "false" : "true");
    s.gameBox.querySelector(".gr").setAttribute("aria-disabled", "false");
  }

  // One tap of a Berry dig. A dig that finds a berry doesn't finish a round, so
  // the reply must follow from the card's own game: a berry is the same round
  // and bank with one more in the basket; a bee is the next round, the same
  // bank; a keep (or the sixth berry) is the next round with the basket banked.
  // Anything else means someone else is playing the same server game.
  async _digTap(s, guess) {
    const g = s.game;
    if (guess === "keep" && !g.basket) {
      // Nothing to keep: the server would refuse it. Say so (F12), then the prompt again.
      const mark = g.tap = (g.tap || 0) + 1;
      this._write(s, GAME_COPY.empty, 60000, MINE);
      this._gameLater(s, g, 2000, () => {
        if (g.tap === mark && !g.busy) this._write(s, g.prompt, 60000);
      });
      return;
    }
    g.busy = true;
    const mark = g.tap = (g.tap || 0) + 1;
    s.gameBox.querySelectorAll(".gl, .gr").forEach((b) => { b.setAttribute("aria-disabled", "true"); });
    s.gameScore.textContent = "thinking…";
    const info = await this._playCall(s, { game: "dig", guess });
    if (!info) return;
    const next = info.round === g.round + 1 && info.basket === 0;
    const fits = info.found === "berry" && !info.round_over
      ? info.round === g.round && info.wins === g.wins && info.basket === g.basket + 1
      : info.found === "bee" ? next && info.wins === g.wins
      : info.found === "kept" ? next && info.wins === g.wins + g.basket
      : info.found === "berry" && next && info.wins === g.wins + g.basket + 1;
    if (!fits) {
      this._endGame(s, "oh! someone else is playing with me");
      return;
    }
    g.round = info.round;
    g.wins = info.wins;
    g.basket = info.basket;
    g.lastAt = Date.now();
    this._digShow(s, info);
    s.gameBox.querySelectorAll(".gl, .gr").forEach((b) => { b.setAttribute("aria-disabled", "true"); });
    this._animate(s, s.gameNum, "flip", 300);
    if (info.found === "bee") {
      s.propEl.src = BEE_FRAMES[0];
      s.propEl.style.left = "10%"; // beside the pile, clear of the score and the buttons
      s.propEl.style.bottom = "40%";
      s.propEl.style.transform = "";
      s.propEl.hidden = false;
      this._write(s, "bzz! the berries rolled away");
      this._reactFrames(s, "refused", { inGame: true }); // F5: a bored look at the bee
      this._chirp(s, "buzz"); // F14
    } else if (info.round_over) {
      this._animate(s, s.pet, "perk", 300);
      this._write(s, "safe in the basket ♪");
      this._chirp(s, "tap");
    } else if (Math.random() < SHINY_ODDS) {
      this._sparkle(s); // D-b: a shiny one, said only (the berry is the server's, the same)
      this._write(s, SHINY_LINE);
      this._animate(s, s.pet, "perk", 300); // F5
      this._chirp(s, "tap");
    } else {
      this._write(s, "a berry!");
      this._animate(s, s.pet, "perk", 300); // F5
      this._chirp(s, "tap");
    }
    const at = Date.now();
    // F1: keep and dig come back on the same timers as before; the result stays in the
    // bubble until GAME_READ_MS after the tap, and the game's last one a little longer.
    this._gameLater(s, g, info.done ? GAME_END_MS : info.round_over ? 900 : 300, () => {
      s.propEl.hidden = true;
      if (info.done) {
        if (info.won) this._chirp(s, "win");
        this._endGame(s, info.won ? `${info.wins} berries! you win ♪` : `${berries(info.wins)}. let's dig another time ♪`);
        this._gameEndType(s, info.won);
        return;
      }
      g.busy = false;
      this._digShow(s, info);
      g.prompt = "dig or keep?";
      this._promptLater(s, g, mark, at);
      // Keep is disabled on an empty basket: focus on it moves to dig.
      const gl = s.gameBox.querySelector(".gl");
      if (!g.basket && this.shadowRoot?.activeElement === gl) {
        s.gameBox.querySelector(".gr").focus({ preventScroll: true });
      }
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
    const isCalm = calm();
    const part = seasonPart(season, s.worldKey);
    const dark = s.screen.classList.contains("night") || s.screen.classList.contains("dim");
    if (season.flyer) {
      if (!s.nextFlyer) s.nextFlyer = now + 6000 + Math.random() * 10000;
      if (now >= s.nextFlyer) {
        const [lo, hi] = SEASON_FLYER_MS;
        s.nextFlyer = now + lo + Math.random() * (hi - lo);
        if (!isCalm && (dark || part.dayFlyers) && !(s.visitUntil > now)) this._seasonFlyer(s, season);
      }
    }
    if (season.nightFlyer && part.nightFlyer) {
      if (!s.nextNightFlyer) s.nextNightFlyer = now + 20000 + Math.random() * 40000;
      if (now >= s.nextNightFlyer) {
        const [lo, hi] = SEASON_NIGHT_FLYER_MS;
        s.nextNightFlyer = now + lo + Math.random() * (hi - lo);
        const { art, cls, ms } = season.nightFlyer;
        if (!isCalm && dark && !(s.visitUntil > now)) this._seasonFly(s, season, art, cls, ms, { ltr: true });
      }
    }
    if (!this._free(s) || s.pet.classList.contains("hop") || s.pet.classList.contains("greethop")) return;
    const today = new Date();
    // The countdown, on the first look of the day.
    const treatOn = season.treat && seasonDate(season.treat, today.getFullYear());
    if (season.countdown && treatOn && !s.counted && namedHolidays()) {
      s.counted = true;
      const treat = new Date(today.getFullYear(), treatOn[0] - 1, treatOn[1]);
      const days = Math.round((treat - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
      if (days > 0 && days <= 7 && oncePerDay(`count-${season.key}-${s.ids?.device}`)) {
        this._speak(s, days === 1 ? `${season.countdown} is tomorrow!!` : `${days} sleeps till ${season.countdown}!`, 4500);
        this._animate(s, s.pet, "perk", 320);
        return;
      }
    }
    // A walker waits while the basket shows (the same floor line).
    if (season.visitor && !isCalm && !(season.visitor.walk && this._basketShows(s))) {
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
        const named = season.treatLine && unnamed([season.treatLine]).length;
        this._costume(s, season, named ? season.treatLine : seasonLine(season, today));
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
    const line = fresh ? { text: "new costume today! look at me ♪", baby: false }
      : this._lines(s, `season.${season.key}`, seasonLine(season, today));
    this._costume(s, season, line.text, !line.baby);
    if (fresh && season.chirp) this._chirp(s, season.chirp);
  }

  // Its yearly birthday (the server's date): confetti and the party hat at
  // the first look of the day on this device (a tablet left on overnight too:
  // the day turning starts it), then the hat now and then. On a holiday's own
  // day that holiday's costume wins: confetti, no party hat.
  _partyTick(s) {
    if (!this._state(s, "sensor.life_stage")?.attributes.birthday) return;
    if (!this._free(s) || s.pet.classList.contains("hop") || s.pet.classList.contains("greethop")) return;
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
    if (calm()) return;
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

  // Where the hat's brim top sits: {x, top} in sprite pixels, null when the head
  // can't be measured. A [x, y, "exact"] entry seats it at y with no scan (a point
  // alone can only push a hat lower, never lift it); a [x, y] entry is the lower
  // of y and the frames' head top; no entry scans the head point.
  _hatSeat(s) {
    const own = this._hatSpot(s);
    const head = s.species?.head?.[s.drawn];
    if (Array.isArray(own) && own[2] === "exact") return { x: own[0], top: own[1] };
    const p = own || head;
    if (!p) return null;
    const scanned = this._headTopAll(s, p[0], p[1]);
    const top = own ? Math.max(own[1], scanned ?? own[1]) : scanned;
    return top === null ? null : { x: p[0], top };
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
    const top = this._hatSeat(s)?.top ?? null;
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
    this._speak(s, season.thanks ? this._thanks(s) : season.treatSay ?? "a treat! thank you!! ♪", 3500);
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
  // startles, then greets it. Both lines are flavour, said now or not at all (a
  // kept line, a game or a question wins), and each beat checks _visitorLive:
  // else the visit ends at once, its picture gone, like a world visitor's.
  _seasonVisitor(s, season) {
    const { art, cls, ms, startle, jump, greet } = season.visitor;
    this._seasonVisitEnd(s);
    const el = this._seasonFly(s, season, art, cls, ms, { walk: !!season.visitor.walk });
    s.flairUntil = Date.now() + ms; // nothing else meanwhile
    s.visitUntil = s.flairUntil; // a pat wiggles, no line
    s.nextVisitCheck = Math.max(s.nextVisitCheck || 0, s.flairUntil + VISIT_AFTER_MS); // a world one later
    const V = s.seasonVisit = { el, timers: [], until: s.flairUntil };
    const at = (t, fn) => V.timers.push(setTimeout(() => {
      if (s.seasonVisit !== V) return;
      if (this._visitorLive(s)) fn();
      else this._seasonVisitEnd(s);
    }, t));
    at(1400, () => {
      if (!this._mayInterrupt(s, FLAVOUR)) return;
      this._line(s, FLAVOUR, startle, 1800, { write: true });
      this._animate(s, s.pet, jump, jump === "perk" ? 320 : 800);
      if (season.chirp) this._chirp(s, season.chirp);
    });
    at(3400, () => {
      if (!this._mayInterrupt(s, FLAVOUR)) return;
      this._line(s, FLAVOUR, pick(unnamed(greet)), 3000);
      this._animate(s, s.pet, "perk", 320);
    });
    at(ms, () => this._seasonVisitEnd(s, { passed: true }));
  }

  // The seasonal visit's timers stop; cut short, its picture goes too.
  _seasonVisitEnd(s, { passed = false } = {}) {
    const V = s.seasonVisit;
    if (!V) return;
    s.seasonVisit = null;
    V.timers.forEach(clearTimeout);
    if (!passed) V.el.remove();
    if (s.flairUntil === V.until) s.flairUntil = 0;
    if (s.visitUntil === V.until) s.visitUntil = 0;
  }

  // --- World visitors (docs/plan-2026-10-31-visitors.md, v2) ----------------
  // Flavour only: nothing is sent or counted (the server credits the visit at its
  // window's end, seen or not). The card keeps only the day's localStorage flag
  // (hatch-visit-<device>-<day>), used up when a visit starts or is told missed.

  // The server's plan for today (house.visit: {day, id, hours, from, until}, epoch
  // seconds), null on a day with none. Undefined only for a true old server (the
  // channel up, its house with no visit key): then v1's own pick. With no channel
  // (not up yet, or failed: HA starting or reloading) null, so nothing is said or
  // played and the day's flag is left for the server's visit (v1's pick hashes the
  // device, the server's the entry, so they differ).
  _visitPlan(s) {
    if (s.house && "visit" in s.house) return s.house.visit || null;
    return s.subscribed ? undefined : null;
  }

  // The day the visit flag is keyed by: the server's day (finding #22: a browser in
  // another time zone crosses its own midnight inside one HA day), else the browser's.
  _visitDay(s) {
    const plan = this._visitPlan(s);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(plan?.day || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
  }

  // Today's visitor for this pet, if it may come now: the server's plan inside its
  // window (or v1's pick: a visit day, inside its hours), and the screen's kind (night
  // or dim for a night visitor, else day).
  _visitorDue(s, date) {
    const list = visitorList(s.world);
    if (!list.length) return null;
    const dark = this._screenDark(s);
    const plan = this._visitPlan(s);
    if (plan !== undefined) {
      const v = plan && list.find((x) => x.id === plan.id);
      if (!v || (v.hours === "night") !== dark) return null;
      const t = (date ? date.getTime() : serverNow()) / 1000;
      return t >= plan.from && t < plan.until ? v : null;
    }
    date ||= new Date();
    const d = visitorDay(date, s.ids?.device);
    if (!d.visit) return null;
    const v = list[d.who];
    if (!v || (v.hours === "night") !== dark) return null;
    const start = v.hours === "night" ? d.night : d.day;
    return date.getHours() >= start && date.getHours() < start + 3 ? v : null;
  }

  // A first look's missed day visitor (s.lateVisit): once its first line is said and done,
  // it comes by, the look's other lines going on (its greet is a move, no line, while
  // they wait). Not over a link, game, call, the basket or a busy pet; given up after
  // LATE_VISIT_MS, when the usual check may still bring it. True: it started.
  _lateVisitTick(s, now) {
    const late = s.lateVisit;
    if (now - late.made > LATE_VISIT_MS) {
      s.lateVisit = null;
      return false;
    }
    if ((s.queue?.length || 0) > late.left) return false; // the first line not said yet
    late.after ??= Math.max(s.sayUntil || 0, now); // the line on show is done
    if (now < late.after || s !== this._slides[this._index] || this._booting || this._link || s.linking ||
      s.power || s.calling || s.away || this._basketShows(s) || !this._freeBody(s)) return false;
    s.lateVisit = null;
    const v = this._visitorLate(s);
    if (!v || !oncePerDay(`visit-${s.ids?.device}`, this._visitDay(s))) return false;
    this._visitorStart(s, v);
    return true;
  }

  // A night (or dim) screen: night visitors only.
  _screenDark(s) {
    return s.screen.classList.contains("night") || s.screen.classList.contains("dim");
  }

  // A day visitor whose window is over with nobody here to see it (the day's flag, used
  // by the caller, unset on this device): it comes by live at a daytime look instead of
  // the catch-up line (fresh-moment 3, owner Q3). Never on a dark screen (Q7).
  _visitorLate(s) {
    const v = this._visitorMissed(s);
    return v && v.hours !== "night" && !this._screenDark(s) ? v : null;
  }

  // Today's visitor if its window is over (the first look's catch-up line).
  _visitorMissed(s, date) {
    const list = visitorList(s.world);
    const plan = this._visitPlan(s);
    if (plan !== undefined) {
      const v = plan && list.find((x) => x.id === plan.id);
      return v && (date ? date.getTime() : serverNow()) / 1000 >= plan.until ? v : null;
    }
    return visitorMissed(list, date || new Date(), s.ids?.device);
  }

  // May a visit start? The pet on show VISIT_SHOWN_MS and past its first look, free
  // (_linkFree: idle and awake, nothing queued or said, no game, scene, status or egg),
  // no link, low-battery gag or call, not within VISIT_AFTER_MS of a link, and no
  // basket on show.
  _visitorFree(s, now = Date.now()) {
    return s === this._slides[this._index] && !this._booting && !!s.lookedFirst && !s.visitor &&
      !this._link && !s.linking && !s.power && !s.calling && !s.away && (this._linkFree(s) || this._askOnly(s)) &&
      !this._basketShows(s) && // the basket's floor line: the visitor waits (review C7)
      now - (this._visitShown?.s === s ? this._visitShown.at : now) >= VISIT_SHOWN_MS &&
      now - (this._linkEndedAt ?? -Infinity) >= VISIT_AFTER_MS;
  }

  // Still fine to go on (each beat checks): the slide on show, awake, no game, scene,
  // link, gag, call or status. Else the visit ends at once, its picture gone.
  _visitorLive(s) {
    return s === this._slides[this._index] && !s.asleep && !s.game && !s.scene && !s.linking &&
      !s.power && !s.calling && !s.away && !s.screen.classList.contains("show-status");
  }

  // From _tick, for the slide on show: at most one look every VISIT_CHECK_MS.
  _visitorTick(s) {
    const now = Date.now();
    if (this._visitShown?.s !== s) this._visitShown = { s, at: now };
    if (s.seasonVisit && !this._visitorLive(s)) this._seasonVisitEnd(s);
    if (s.visitor) {
      if (!this._visitorLive(s)) this._visitorEnd(s);
      return;
    }
    if (s.lateVisit && this._lateVisitTick(s, now)) return;
    if (now < (s.nextVisitCheck || 0)) return;
    s.nextVisitCheck = now + VISIT_CHECK_MS;
    if (!this._visitorFree(s, now)) return;
    const v = this._visitorDue(s) || this._visitorLate(s);
    if (v && oncePerDay(`visit-${s.ids?.device}`, this._visitDay(s))) {
      this._visitorStart(s, v);
      return;
    }
    // A no-visit day's rare guest from another world (E10 V-c): once a day, in its window.
    const g = !v && this._visitorGuest(s);
    if (g && oncePerDay(`guest-${s.ids?.device}`, this._visitDay(s))) this._visitorStart(s, g.v, { world: g.world, guest: true });
  }

  // --- Fresh-expand E10: a rare pair, a guest from another world (card only) --------

  // This pet's roll for a rare kind of day (pure: the device, the day and the kind).
  _rareDay(s, kind, odds) {
    return turnHash(`${s.ids?.device}|${this._visitDay(s).toDateString()}|${kind}`) % odds === 0;
  }

  // V-b: on a pair day, a friend of the planned visitor: its world's, the same hours, not
  // a crosser. Null otherwise. Not counted, not written anywhere.
  _visitorPair(s, v) {
    if (v.cross || !this._rareDay(s, "pair", PAIR_ODDS)) return null;
    return visitorList(s.world).find((x) => x.id !== v.id && x.hours === v.hours && !x.cross) || null;
  }

  // V-c: on a day the server plans no visit, a guest day: in the day or night window of
  // this screen's kind, a visitor from another world with those hours. {v, world} or null.
  _visitorGuest(s, date = new Date()) {
    if (!s.house || !("visit" in s.house) || s.house.visit !== null || !this._rareDay(s, "guest", GUEST_ODDS)) return null;
    const hours = this._screenDark(s) ? "night" : "day";
    const from = GUEST_HOURS[hours];
    if (date.getHours() < from || date.getHours() >= from + 3) return null;
    const all = Object.entries(this._worlds || {}).filter(([w]) => w !== s.worldKey)
      .flatMap(([w, world]) => visitorList(world).filter((x) => x.hours === hours).map((x) => ({ v: x, world: w })));
    if (!all.length) return null;
    return all[turnHash(`${s.ids?.device}|${this._visitDay(s).toDateString()}|guestwho`) % all.length];
  }

  // One visit: in from a side to the edge, the pet looks, then greets it (one line),
  // and it goes back the way it came; a crosser streaks straight over. Reduced motion:
  // the first frame, standing still at the edge for VISIT_CALM_MS; the greet's frame
  // and the line, no look or hop.
  _visitorStart(s, v, { ltr = Math.random() < 0.5, count = true, world = s.worldKey, guest = false } = {}) {
    this._visitorEnd(s);
    if (count && !guest) this._visitFriendCount(s, v);
    const isCalm = calm();
    const inMs = v.in || (v.cross ? 1800 : VISIT_IN_MS);
    const stay = (v.stay || VISIT_STAY_MS) * (sharedScreen() ? 2 : 1); // a shared screen: longer (E8 Sh-a)
    const greetAt = isCalm ? 600 : v.cross ? Math.round(inMs * 0.6) : inMs + 1000;
    const total = isCalm ? VISIT_CALM_MS : v.cross ? greetAt + 3000 : greetAt + stay + inMs;
    const frames = isCalm ? [1] : [1, 2];
    const el = document.createElement("div");
    el.className = `vis vis-${v.id} ${v.walk ? "walk" : "fly"} ${ltr ? "ltr" : "rtl"}` +
      `${frames.length > 1 ? " flap" : ""}${isCalm ? "" : v.cross ? " cross" : " in"}`;
    el.dataset.visitor = `${world}/${v.id}`;
    el.style.setProperty("--in-ms", `${inMs}ms`);
    el.innerHTML = frames.map((n) =>
      `<img src="${BASE}/ui/visitor_${world}_${v.id}_${n}.png?v=${VERSION}" alt="">`).join("");
    s.seasonBox.append(el);
    const now = Date.now();
    const V = s.visitor = { el, els: [el], v, timers: [], until: now + total, greetAt, guest: guest ? world : null };
    if (!v.cross && !guest) { // seen here today, for the evening's today line (fresh-moment 4)
      try {
        localStorage.setItem(`hatch-visitseen-${s.ids?.device}`, JSON.stringify({ day: this._visitDay(s).toDateString(), name: v.name }));
      } catch (err) {
        // no storage: no visitor in the today line
      }
    }
    s.flairUntil = s.visitUntil = V.until; // nothing else meanwhile; a pat wiggles, no line
    s.nextVisitor = Math.max(s.nextVisitor || 0, now + total + VISIT_AFTER_MS); // a seasonal one later
    const at = (ms, fn) => V.timers.push(setTimeout(() => {
      if (s.visitor !== V) return;
      if (this._visitorLive(s)) fn();
      else this._visitorEnd(s);
    }, ms));
    // The art faces right, so only a visitor on the left is faced (UX8 F2): held through
    // the greet and the stay, never turned away from one coming in on the right.
    if (!isCalm && !v.cross && ltr) at(inMs, () => this._look(s, greetAt + stay - inMs));
    // A friend of its world along, now and then (E10 V-b): the other side, a little behind.
    const pal = !guest && this._visitorPair(s, v);
    if (pal) {
      V.pair = pal;
      at(isCalm ? 0 : PAIR_BEHIND_MS, () => {
        const el2 = el.cloneNode(false);
        el2.className = el.className.replace(/\bvis-\S+/, `vis-${pal.id}`).replace(/\b(ltr|rtl)\b/, ltr ? "rtl" : "ltr")
          .replace(/\b(walk|fly)\b/, pal.walk ? "walk" : "fly");
        el2.dataset.visitor = `${world}/${pal.id}`;
        el2.innerHTML = frames.map((n) =>
          `<img src="${BASE}/ui/visitor_${world}_${pal.id}_${n}.png?v=${VERSION}" alt="">`).join("");
        s.seasonBox.append(el2);
        V.els.push(el2);
      });
    }
    at(greetAt, () => this._visitorGreet(s, v));
    if (v.cross && !isCalm) at(inMs, () => el.remove());
    else if (!isCalm) at(greetAt + stay, () => V.els.forEach((x) => x.classList.replace("in", "out")));
    at(total, () => this._visitorEnd(s));
    return V;
  }

  // The greet: acts.cheer (else the excited frame and a hop; a child, the line only)
  // and one flavour line, said now or not at all (a kept line, a game or a question
  // wins; the visitor still passes). A baby says baby talk.
  _visitorGreet(s, v) {
    const asking = this._questionOn(s); // its bubble stays: the greet is a move, no line (5a)
    if (!asking && !this._mayInterrupt(s, FLAVOUR)) return;
    const before = s.poseUntil;
    this._reactFrames(s, "greet");
    // The wave frames (the link greeting's loader and fallbacks) replace the greet
    // pose when it ran; a child, or a species without waves, keeps the greet as it was.
    if (s.poseUntil && s.poseUntil !== before && s.drawn !== "child" && s.species?.waves?.[s.drawn]) {
      const mine = this._linkPose(s.species, s.drawn, s.speciesId, (f) => {
        if (s.poseFrames === mine) { s.poseFrames = f; this._show(s, s.pet, f[0]); }
      });
      s.poseFrames = mine;
      this._show(s, s.pet, mine[0]);
    }
    if (asking) return;
    const V = s.visitor;
    const baby = this._babySet(s, "visit");
    // A guest says where it's from; a pair, that there are two (E10); else the viewer's
    // favourite (F4); else a friend's line (E3), else the usual. Baby talk stays.
    const rare = !baby && (V?.guest ? VISIT_GUEST[V.guest] : V?.pair ? turnPick(PAIR_LINES, `${s.ids?.device}|pair`) : null);
    // The favourite: on the viewer's own screen, 1 visit in 2, with a hop and hearts.
    if (!baby && !rare && !sharedScreen() && s.mine?.fav_visitor === v.id && Math.random() < 0.5) {
      this._line(s, FLAVOUR, turnPick(FAVV_LINES.greet, `${s.ids?.device}|favv`)(v.name), 3000);
      if (!calm()) {
        this._animate(s, s.pet, "greethop", 1400);
        this._bondHearts(s);
      }
      return;
    }
    const friend = !rare && this._visitFriendLine(s, v);
    const { text } = rare || friend ? { text: rare || friend } : this._lines(s, "visit", pick([...VISIT_LINES, ...v.lines]));
    this._line(s, FLAVOUR, text, 3000);
  }

  // Visitors become friends (fresh-expand E3, V-a). This pet's sighting days of each
  // visitor on this browser: {id: {n, day}}, one key per pet and generation (a new
  // generation hasn't met anyone yet). Never shown or sent; names no person.
  _visitFriendKey(s) {
    return `hatch-visitfriends-${s.ids?.device}-${this._state(s, "sensor.life_stage")?.attributes?.generation || 1}`;
  }

  _visitFriends(s) {
    try {
      const tally = JSON.parse(localStorage.getItem(this._visitFriendKey(s)) || "{}");
      return tally && typeof tally === "object" ? tally : {};
    } catch (err) {
      return {};
    }
  }

  // A live visit adds 1 on a day this visitor wasn't counted yet; this pet's keys from
  // other generations go, so one key per pet.
  _visitFriendCount(s, v) {
    const key = this._visitFriendKey(s);
    const day = this._visitDay(s).toDateString();
    const tally = this._visitFriends(s);
    if (tally[v.id]?.day === day) return;
    tally[v.id] = { n: Math.min((Number(tally[v.id]?.n) || 0) + 1, 99), day };
    try {
      const mine = new RegExp(`^hatch-visitfriends-${s.ids?.device}-\\d+$`);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k !== key && mine.test(k)) localStorage.removeItem(k);
      }
      localStorage.setItem(key, JSON.stringify(tally));
    } catch (err) {
      // no storage: no friends, the usual greet
    }
  }

  // A friend's greet half the time (not a baby: it keeps its baby talk), else null.
  _visitFriendLine(s, v) {
    const lines = VISIT_FRIENDS[v.id];
    if (!lines || this._babySet(s, "visit") || (Number(this._visitFriends(s)[v.id]?.n) || 0) < VISIT_FRIEND_AFTER) return null;
    return Math.random() < 0.5 ? turnPick(lines, `${s.ids?.device}|${v.id}`) : null;
  }

  _visitorEnd(s) {
    const V = s.visitor;
    if (!V) return;
    s.visitor = null;
    V.timers.forEach(clearTimeout);
    (V.els || [V.el]).forEach((x) => x.remove());
    if (s.flairUntil === V.until) s.flairUntil = 0;
    if (s.visitUntil === V.until) s.visitUntil = 0;
  }

  // --- The basket (docs/plan-2026-11-01-visitors-v2.md §3) ---------------------
  // The server rolls finds into the basket; house.basket says how many wait (0-3, no
  // ids: an older server sends no key, so no basket). Opening the card says nothing. A
  // tap sends virtual_pet/collect (a websocket command: who tapped isn't recorded) and
  // the reply's finds are shown one by one over the basket, the pet saying a line for
  // each (flavour). The server empties the basket for every screen at once; a screen
  // that didn't tap (or lost the race: an empty reply) just loses the basket, quietly.

  // How many wait, as the picture shows them (no number anywhere).
  _basketCount(s) {
    if (!findsShown()) return 0; // FINDS_SHOWN off: no basket, no tap, no reveal
    const n = s.house?.basket;
    return Number.isInteger(n) && n > 0 ? Math.min(n, 3) : 0;
  }

  // May the basket be tapped? The pet on show and free as for a visitor (_visitorLive:
  // awake, no game, scene, link, gag, call or status), out of its egg, not booting, and
  // no tap or reveal already going. Else a tap never reaches the server (review C1: a
  // basket emptied unseen is lost to this screen), and goes through to the screen.
  _basketLive(s) {
    return this._basketCount(s) > 0 && !s.egg && !!s.species && !this._booting &&
      !s.collecting && !s.reveal && this._visitorLive(s);
  }
  // Shown with something in it, live or not (compact too; the CSS hides it under the
  // status). While a tap waits on its reply, the picture is held as it was:
  // the server's publish of the empty basket can come first (review C2).
  _basketSync(s) {
    const b = s.basket;
    if (!b || s.collecting) return;
    const n = this._basketCount(s);
    const show = n > 0 && !s.reveal && !s.egg && !!s.species && !s.away && !s.game && !s.scene;
    if (show) {
      const src = `${BASE}/ui/basket_${n}.png?v=${VERSION}`;
      const img = b.firstElementChild;
      if (img.getAttribute("src") !== src) img.src = src;
    }
    if (b.hidden === show) b.hidden = !show;
    const live = show && this._basketLive(s);
    b.classList.toggle("idle", !live);
    b.tabIndex = live ? 0 : -1;
  }

  // Is the basket on show (a visitor waits while it is: the same floor line)?
  _basketShows(s) {
    return !!s.reveal || !!s.collecting ||
      (!!s.basket && !s.basket.hidden && getComputedStyle(s.basket).display !== "none");
  }

  // The tap: once (re-entry guarded until the reply), then the reveal. An error keeps
  // the basket; an empty reply (another screen was first) shows nothing and says nothing.
  async _basketTap(s, e) {
    e?.stopPropagation(); // not the status, not a pat
    if (s !== this._slides[this._index] || (e && e.detail !== 0 && this._swiped)) return;
    this._basketSync(s);
    if (!this._basketLive(s)) return;
    const entity = s.ids?.["sensor.life_stage"];
    if (!entity) return;
    s.collecting = true;
    this._tapped(s.basket);
    let finds = null;
    try {
      const reply = await this._hass.callWS({ type: "virtual_pet/collect", entity_id: entity });
      finds = Array.isArray(reply?.finds) ? reply.finds : [];
    } catch (err) {
      console.warn("hatch-pet-card: the basket", err?.message || err);
    }
    if (s.ids?.["sensor.life_stage"] !== entity) return; // another pet here now
    s.collecting = false;
    // Only finds this card knows (a newer server's are skipped), at most the basket's three.
    const known = (finds || []).filter((f) => findOf(this._worlds, f?.world, f?.id)).slice(0, 3);
    if (finds && finds.length) {
      s.house = { ...(s.house || {}), basket: 0 }; // gone here too, whatever came first
    }
    if (known.length && s === this._slides[this._index]) this._revealStart(s, known);
    this._basketSync(s);
  }

  // The reveal: the basket drawn once, and every FIND_STEP_MS the next find pops up over
  // it, the pet says its line, and a first-ever find sparkles. Calm: the find appears,
  // still. Flavour, started by a person: a line goes out only when the bubble is free of
  // anyone else's; once one can't, the rest of the reveal is shown without lines. A pat
  // meanwhile wiggles; nothing else starts. Each beat checks _visitorLive, else it ends.
  _revealStart(s, finds) {
    this._revealEnd(s);
    const isCalm = calm();
    const el = document.createElement("div");
    el.className = "reveal";
    el.innerHTML = `<img class="rb" alt="" src="${BASE}/ui/basket_${Math.min(finds.length, 3)}.png?v=${VERSION}">` +
      '<img class="rf" alt="" hidden>';
    s.screen.append(el);
    const total = finds.length * FIND_STEP_MS;
    const R = s.reveal = { el, finds, timers: [], until: Date.now() + total, quiet: false, said: null, shown: [] };
    s.flairUntil = s.visitUntil = R.until; // a pat wiggles, no line; nothing else meanwhile
    s.basket.hidden = true;
    const at = (ms, fn) => R.timers.push(setTimeout(() => {
      if (s.reveal !== R) return;
      if (this._visitorLive(s)) fn();
      else this._revealEnd(s);
    }, ms));
    finds.forEach((f, i) => at(i * FIND_STEP_MS, () => this._revealFind(s, R, f, isCalm)));
    at(total, () => this._revealEnd(s));
    return R;
  }

  // One find out of the basket: its picture, its sparkle (first-ever), its line.
  _revealFind(s, R, f, isCalm) {
    const img = R.el.querySelector(".rf");
    img.classList.remove("pop");
    img.src = `${BASE}/ui/find_${f.world}_${f.id}.png?v=${VERSION}`;
    img.dataset.find = `${f.world}/${f.id}`;
    img.hidden = false;
    if (!isCalm) {
      void img.offsetWidth; // restart the pop
      img.classList.add("pop");
    }
    R.shown.push(`${f.world}/${f.id}`);
    if (f.new) {
      const ring = document.createElement("span");
      ring.className = "burst";
      R.el.append(ring);
      setTimeout(() => ring.remove(), 600);
    }
    if (R.quiet) return;
    // The reveal's own line still up doesn't hold the next one; anyone else's does.
    const own = R.said && s.sayEntry?.text === R.said && s.sayUntil > Date.now();
    if (own) s.sayUntil = 0;
    if (!this._mayInterrupt(s, FLAVOUR)) {
      R.quiet = true;
      return;
    }
    R.said = this._findLine(s, f);
    this._line(s, FLAVOUR, R.said, FIND_LINE_MS);
  }

  // A find's line (§7): V3 when a visitor left it (its roster name, a new one too: the
  // sparkle says new), else V2 for a first-ever find, else one of V1 for the day. Baby
  // talk: BABY.find. Each from the find's own world (an old world's find, its own line).
  _findLine(s, f) {
    const find = findOf(this._worlds, f.world, f.id);
    const a = find?.a || find?.name || "something";
    const roster = this._worlds?.[f.world]?.visitors;
    const who = f.from && Array.isArray(roster) && roster.find((v) => v?.id === f.from)?.name;
    const normal = who ? FIND_LINES.left[0](a, who)
      : f.new ? FIND_LINES.fresh[0](a)
        : dailyPick(FIND_LINES.find, `${f.world}|${f.id}`)(a);
    return this._lines(s, "find", normal).text;
  }

  _revealEnd(s) {
    const R = s.reveal;
    if (!R) return;
    s.reveal = null;
    R.timers.forEach(clearTimeout);
    R.el.remove();
    if (s.flairUntil === R.until) s.flairUntil = 0;
    if (s.visitUntil === R.until) s.visitUntil = 0;
    this._basketSync(s);
  }

  // --- The infrared link ------------------------------------------------------
  // Flavour only: once a day, per pair, the pet on show and the slide next to it
  // visit. Nothing is counted or remembered (Q4), and no button starts one (Q3).

  _linkName(s) {
    const d = this._hass?.devices?.[s.ids?.device];
    return d?.name_by_user || d?.name || "friend";
  }

  // Free for a visit: the idle checks, no egg, nothing waiting to be said.
  _linkFree(s) {
    return !!s && this._free(s) && !s.queue?.length &&
      this._state(s, "sensor.life_stage")?.state !== "egg";
  }

  // The neighbour (either side, in a random order) that is free and has not
  // visited this pet today. Uses up the pair's day: call it only to start one.
  _linkPick(host) {
    if (!this._linkFree(host) || !host.lookedFirst) return null;
    const sides = [1, -1].sort(() => Math.random() - 0.5);
    for (const side of sides) {
      const guest = this._slides[this._index + side];
      if (!this._linkFree(guest)) continue;
      const pair = [host.ids?.device, guest.ids?.device].sort().join("-");
      if (oncePerDay(`link-${pair}`)) return guest;
    }
    return null;
  }

  _linkTick(host) {
    const L = this._link;
    // A pet that falls asleep, calls, starts a game or a care scene, or opens the status ends it.
    if (L && (L.host.asleep || L.guest.asleep || L.host.calling || L.host.game || L.host.scene ||
      L.host.screen.classList.contains("show-status"))) this._linkEnd();
    if (this._booting || this._link || this._slides.length < 2) return;
    const now = Date.now();
    const [lo, hi] = LINK_AFTER_MS;
    if (!linkedToday()) {
      const [first, last] = LINK_FIRST_MS;
      this._linkFirstMs ??= first + Math.random() * (last - first);
      const watched = !document.hidden && this._visible !== false && this._touchedAt
        && now - this._touchedAt < LINK_TOUCHED_MS && now - this._lookAt >= this._linkFirstMs;
      if (!watched) return;
    } else {
      this._linkAt ??= now + lo + Math.random() * (hi - lo);
      if (now < this._linkAt) return;
    }
    const guest = this._linkPick(host);
    if (!guest) return;
    this._linkAt = now + lo + Math.random() * (hi - lo);
    if (this._linkStart(host, guest) !== false) this._linkReport(host, guest);
  }

  // The social meter full (top10 §6): said once a week per pet on this device,
  // the week from Monday; nothing else on it changes the pet.
  _socialFull(s) {
    const level = this._state(s, "sensor.life_stage")?.attributes.social_level;
    if (level !== SOCIAL_MAX || s.asleep || s.game || !s.ids?.device) return;
    if (s.sayUntil > Date.now() || s.queue?.some((q) => lineClass(q) >= KEPT)) return;
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    if (!oncePerDay(`social-full-${s.ids.device}`, monday)) return;
    (s.queue ??= []).push({ text: "so many friends this week! ♥", ms: 4500, cls: KEPT, perk: true });
  }

  // Tell the server the two pets met (top10 §6, the social meter): each counts the
  // other once a day there, however many screens report it. Nobody's name goes.
  _linkReport(host, guest) {
    const a = host.ids?.["sensor.life_stage"];
    const b = guest.ids?.["sensor.life_stage"];
    if (!a || !b || a === b) return;
    this._hass.callWS({ type: "virtual_pet/linked", entity_id: a, other: b }).catch(() => {
      // an older integration has no meter: the link is the same
    });
  }

  // One visit: the beam, the visit screen, the two lines, the guest's own slide.
  // Each pet speaks as itself (_lines: baby talk, its type, or the normal line);
  // a kindred pair's host may add a line (2b). Every roll is made here, at the start.
  // Returns false when one is already on.
  _linkStart(host, guest) {
    if (this._link) return false;
    const isCalm = calm();
    const L = this._link = { host, guest, timers: [], hostScale: host.pet.style.scale };
    const at = (ms, fn) => {
      const t = setTimeout(() => this._link === L && fn(), ms);
      L.timers.push(t);
      return t;
    };
    const hostName = this._linkName(host);
    const guestName = this._linkName(guest);
    const hello = this._lines(host, "link_host", this._pick(["hi, {guest}!", "oh! {guest}! hello hello ♪"])
      .replace("{guest}", () => guestName), guestName).text;
    const reply = this._lines(guest, "link_guest", this._pick(["hi hi, {host}! ♪", "*waves* hi, {host}!"])
      .replace("{host}", () => hostName), hostName).text;
    // The kindred extra: its own roll, never through _lines (it has no normal line).
    const own = this._kindred(host, guest) && Math.random() < KINDRED_ODDS && this._pick(PERSONA[this._typeKey(host)].link_kindred);
    const extra = own ? (typeof own === "function" ? own(guestName) : own) : null;
    // Or the guest's news of its day (E9 L-a): public, the pets' own; shared screens too.
    const news = !extra && Math.random() < LINK_NEWS_ODDS ? this._linkNews(guest) : null;
    L.said = [hello, extra, LINK_NEWS_REPLY]; // the host's lines of this visit (a cut-short visit clears them)
    const stretch = extra ? 1000 : news ? LINK_NEWS_MS : 0; // the visit holds a little longer for it
    const toRight = this._slides.indexOf(guest) > this._slides.indexOf(host);
    const k = 0.7; // the pets stand at 70% of their size on the visit screen
    const gs = guest.species;
    const gStage = guest.drawn || "adult";
    const gScale = (gs?.scale?.[gStage] || 1) * k;
    let gFrames = gs ? this._linkPose(gs, gStage, guest.speciesId, (f) => { gFrames = f; }) : [];
    L.beamMs = isCalm ? 0 : 1500;
    this._moving(host, 9000);
    this._chirp(host, "link");
    if (!isCalm) this._linkBeam(host, guest, toRight);
    // the guest's own slide: looking at the host, with a small note
    this._moving(guest, 6500);
    if (toRight) this._look(guest, 6500);
    this._speak(guest, "♪", 6500);
    // the visit screen
    at(L.beamMs ? 1400 : 0, () => {
      host.linking = true;
      const box = document.createElement("div");
      box.className = toRight ? "visit" : "visit left";
      box.setAttribute("aria-hidden", "true");
      if (!isCalm) box.innerHTML = '<div class="vband"><i></i><i></i><i></i><i></i><i></i></div>';
      host.screen.append(box);
      L.box = box;
    });
    const t0 = isCalm ? 200 : 2500;
    at(t0, () => {
      L.box.querySelector(".vband")?.remove();
      host.screen.classList.add("linking");
      host.screen.classList.toggle("linkleft", !toRight);
      if (!toRight) host.pet.classList.add("look"); // faces the guest on its left
      host.linkFrames = this._linkPose(host.species, host.drawn || "adult", host.speciesId, (f) => {
        if (host.linkFrames) host.linkFrames = f;
      });
      host.pet.classList.add("linking");
      host.pet.style.scale = String((Number(L.hostScale) || 1) * k);
      const img = document.createElement("img");
      img.className = "vguest";
      img.alt = "";
      img.style.scale = `${toRight ? -gScale : gScale} ${gScale}`; // faces the host
      this._show(guest, img, gFrames[0]);
      L.box.append(img);
      L.img = img;
      let f = 0;
      if (!isCalm) L.swap = setInterval(() => gFrames.length && this._show(guest, img, gFrames[++f % gFrames.length]), 700);
      // Both host lines queued now, in order; neither is said once the visit is over.
      const still = () => this._link === L;
      if (!extra) this._queue(host, hello, 3400, { still });
      else {
        // 3300 ms: the extra starts no earlier than t0+3300, after the guest's reply (t0+1800) has shown 1.5 s.
        this._queue(host, hello, 3300, { still });
        // Said late (the first line typed slowly): the visit waits for it to be read.
        this._queue(host, extra, 1600, { still, then: () => {
          L.say.hidden = true; // the guest's reply has had its turn: the bubbles would overlap
          const left = host.sayUntil - Date.now();
          if (left <= L.endsIn - Date.now()) return;
          clearTimeout(L.hideAt);
          clearTimeout(L.endAt);
          L.hideAt = at(Math.max(0, left - 600), hide);
          L.endAt = at(left, () => this._linkEnd(true));
        } });
      }
      const say = document.createElement("div");
      say.className = "vsay";
      say.hidden = true;
      L.box.append(say);
      L.say = say;
    });
    at(t0 + 1200, () => {
      if (!isCalm) this._animate(host, host.pet, "greethop", 1400);
    });
    at(t0 + 1800, () => {
      L.say.textContent = reply; // visual only: the visit screen is aria-hidden
      L.say.hidden = false;
      // Under the host's line, wherever it ends (a narrow screen or big text wraps it): UX8 F3.
      const hb = host.bubble.getBoundingClientRect();
      if (host.bubble.textContent && hb.height) {
        const sb = host.screen.getBoundingClientRect();
        const floor = sb.height * 0.27;
        L.say.style.top = `${Math.max(floor, hb.bottom - sb.top + 4)}px`;
      }
      if (!isCalm) this._animate(guest, L.img, "greethop", 1400);
      if (!isCalm) { // both cheer on the "hi hi" line (acts.cheer; none for a child)
        const gBefore = gFrames;
        const gCheer = this._actPose(gs, gStage, guest.speciesId, "cheer", () => {
          if (gFrames !== gCheer) return;
          gFrames = gBefore;
        });
        if (gCheer) gFrames = gCheer;
        const hBefore = host.linkFrames;
        const hCheer = this._actPose(host.species, host.drawn || "adult", host.speciesId, "cheer", () => {
          if (host.linkFrames === hCheer) host.linkFrames = hBefore;
        });
        if (hCheer && host.linkFrames) host.linkFrames = hCheer;
      }
    });
    if (news) {
      at(t0 + 1800 + LINK_NEWS_MS, () => { L.say.textContent = news; });
      at(t0 + 1800 + LINK_NEWS_MS * 2, () => this._queue(host, LINK_NEWS_REPLY, 1800, { still: () => this._link === L }));
    }
    at(t0 + 3400, () => {
      if (!isCalm && !sharedScreen()) this._bondHearts(host, "linkhearts");
    });
    const hide = () => {
      L.say.hidden = true;
      L.img.classList.add("out");
    };
    const endMs = t0 + (isCalm ? 3600 : 4600) + stretch;
    L.hideAt = at(t0 + 4000 + stretch, hide);
    L.endAt = at(endMs, () => this._linkEnd(true));
    L.endsIn = Date.now() + endMs; // when the visit ends, unless the extra stretches it
    return true;
  }

  _pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  // The guest's news over a link (E9 L-a): today's dream as DREAMS says it, else today's
  // visitor seen on the guest's device, else null.
  _linkNews(guest) {
    const said = this._dreamText(guest, this._dreamToday(guest));
    if (said) return said;
    const seen = this._visitSeen(guest);
    return seen ? LINK_VISITOR_NEWS(seen) : null;
  }

  // The beam: a red head with ripples flies along the tops of the devices, a
  // dotted trail behind it, and a burst where it arrives. Pixel-stepped, in world
  // art pixels (WORLD_GRID of them across the pet's 46.5% of the screen).
  _linkBeam(host, guest, toRight) {
    const L = this._link;
    const track = this._track.getBoundingClientRect();
    const a = host.device.getBoundingClientRect();
    const b = guest.device.getBoundingClientRect();
    // Ride over the highest part of either toy: a tank's lid, a roof, the moon, a top trim
    // (parts a shape hasn't are display: none, with an empty rect), but inside the viewport,
    // which clips: a tank's tall trim keeps it at the very top, over the leaves.
    const top = Math.min(...[host.device, guest.device].flatMap((d) =>
      [d, ...d.querySelectorAll(".lid, .roof, .crescent, .trim-top, .trim-top2")])
      .map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height).map((r) => r.top));
    const u = Math.max(1, Math.round(((host.screen.clientWidth * 0.465) / WORLD_GRID) * 4) / 4);
    const x0 = a.left + a.width / 2 - track.left;
    const x1 = b.left + b.width / 2 - track.left;
    const dist = x1 - x0;
    const step = 2 * u;
    const n = Math.max(2, Math.round(Math.abs(dist) / step));
    const ms = 1100;
    const beam = document.createElement("div");
    beam.className = "irbeam";
    beam.setAttribute("aria-hidden", "true");
    // (the art starts 11 cells down its 32: the cells above it may hang outside)
    const room = this._track.parentElement.getBoundingClientRect().top - track.top - 11 * u;
    beam.style.cssText = `left:0;top:${Math.max(room, top - track.top - 16 * u + 3)}px;width:1px;height:1px;--u:${u}px;` +
      `--ir-ms:${ms}ms;--ir-steps:${n};--ir-d:${n * step * (toRight ? 1 : -1)}px`;
    const img = (name, cls, cx, cell) => {
      const el = document.createElement("img");
      el.className = cls;
      el.alt = "";
      el.src = `${BASE}/ui/${name}.png?v=${VERSION}`;
      el.style.left = `${cx - cell * u}px`;
      return el;
    };
    // heads sit 12.5 px into the cell facing right, 19.5 facing left
    const head = img("ir_head_1", "head", x0, toRight ? 12.5 : 19.5);
    if (!toRight) head.style.scale = "-1 1"; // translate and scale are separate properties
    for (let d = 5 * u; d < Math.abs(dist) - 4 * u; d += 5 * u) {
      const dot = img("ir_dot", "trail", x0 + d * (toRight ? 1 : -1), 16);
      dot.style.animationDelay = `${Math.round((d / Math.abs(dist)) * ms)}ms`;
      beam.append(dot);
    }
    const arrive = img("ir_burst", "arrive", x1, 16);
    arrive.style.animationDelay = `${ms}ms`;
    beam.append(arrive, head);
    this._track.append(beam);
    L.beam = beam;
    let f = 0;
    L.flap = setInterval(() => head.setAttribute("src", `${BASE}/ui/ir_head_${(++f % 2) + 1}.png?v=${VERSION}`), 200);
    L.timers.push(setTimeout(() => beam.classList.add("gone"), ms + 500));
    L.timers.push(setTimeout(() => beam.remove(), ms + 900));
  }

  // The visit is over (or cut short): leave nothing behind.
  // done: the visit ran its course. Cut short (a sleep, a tap on Status), a hello still
  // on show is cleared with the guest's bubble: no hello to an empty room (UX8 F8).
  _linkEnd(done = false) {
    const L = this._link;
    if (!L) return;
    this._link = null;
    this._linkEndedAt = Date.now(); // a world visitor waits VISIT_AFTER_MS
    L.timers.forEach(clearTimeout);
    clearInterval(L.swap);
    clearInterval(L.flap);
    L.beam?.remove();
    L.box?.remove();
    const { host, guest } = L;
    host.linking = false;
    host.linkFrames = null;
    host.screen.classList.remove("linking", "linkleft");
    host.pet.classList.remove("linking", "greethop", "look");
    host.pet.style.scale = L.hostScale;
    host.screen.querySelector(".linkhearts")?.remove();
    guest.pet.classList.remove("look");
    guest.movingUntil = host.movingUntil = 0;
    guest.sayUntil = 0;
    this._stopTyping?.(guest);
    guest.bubble.textContent = "";
    const said = host.sayEntry?.text;
    if (!done && said && L.said?.includes(said) && host.sayUntil > Date.now()) this._write(host, "", 0);
  }

  // --- Trait flair ----------------------------------------------------------

  _flairTick(s) {
    const now = Date.now();
    if (!s.nextFlair) s.nextFlair = now + 8000 + Math.random() * 12000;
    if (now < s.nextFlair) return;
    const [lo, hi] = FLAIR_EVERY_MS;
    s.nextFlair = now + lo + Math.random() * (hi - lo);
    if (this._free(s) || this._askOnly(s)) this._flair(s);
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

  // The player (or the card, moving off a game) ends a game: the server drops
  // it too, with no reward or penalty, or parks a Berry dig that has shown
  // something, so the next dig carries on. Every card-driven quit (✕, Escape,
  // a swipe, the status sheet, Play mid-game) comes here, so each one parks.
  // Fire and forget; a failed call is silent.
  // What a person's ✕ or Escape says: a dig that has shown something is parked, and says
  // so (F8); anything else is "maybe later!".
  _quitLine(s) {
    const g = s.game;
    return g?.kind === "dig" && (g.round || g.wins || g.basket) ? GAME_COPY.parked : "maybe later!";
  }

  _quitGame(s, line) {
    const kind = s.game?.kind;
    const id = s.ids?.["sensor.mood"];
    if (id && SERVER_GAMES.has(kind)) {
      try {
        Promise.resolve(this._hass.callService(
          "virtual_pet", "play_game", { entity_id: id, game: kind, end: true, ...digShared(kind) },
          undefined, false, true)).catch(() => {});
      } catch (err) { /* silent */ }
    }
    this._endGame(s, line);
  }

  _endGame(s, line) {
    cancelAnimationFrame(s.game?.cur?.raf);
    s.gameBox.querySelector(".gwatch")?.remove(); // D-a's visitor goes with the game
    s.propEl.hidden = true;
    s.propEl.style.bottom = ""; // the dig's bee sits higher
    s.gameScore.classList.remove("two");
    s.gameNum.removeAttribute("aria-label"); // the dig's "n leaves left"
    s.game = null;
    s.gameTimers?.forEach(clearTimeout);
    s.gameTimers?.clear();
    // Focus inside the game goes back to the play button, not the page's start.
    const focused = s.gameBox.contains(this.shadowRoot?.activeElement);
    s.gameBox.hidden = true;
    if (focused) s.buttons.play?.focus({ preventScroll: true });
    s.gameBox.querySelectorAll(".gl, .gr").forEach((b) => { b.setAttribute("aria-disabled", "false"); });
    s.pet.classList.remove("go-left", "go-right");
    s.gameBox.classList.remove("showgo");
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
      const LABELS = { devices: "Pets on this shelf", seasonal: "Seasonal decorations" };
      const HELPERS = {
        devices: "Leave empty to show every pet. The shelf shows them in this order.",
        // gaps-seams 7a: the YAML `seasonal: false`, in the editor.
        seasonal: "Halloween, Thanksgiving and winter lights on this card. Off hides them on this card only.",
      };
      this._form.computeLabel = (field) => LABELS[field.name];
      this._form.computeHelper = (field) => HELPERS[field.name];
      this._form.schema = [{
        name: "devices",
        selector: { device: { multiple: true, filter: { integration: "virtual_pet" } } },
      }, { name: "seasonal", selector: { boolean: {} } }];
      this._form.addEventListener("value-changed", (e) => this._changed(e.detail.value));
      this.append(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = { devices: this._devicesOf(this._config), seasonal: this._config.seasonal !== false };
  }

  _changed(value) {
    const config = { ...this._config };
    delete config.entities;
    delete config.entity;
    if (value.devices?.length) config.devices = value.devices;
    else delete config.devices;
    // Off is `seasonal: false`; on drops the key, but keeps a preview (`seasonal: "winter"`).
    if (value.seasonal === false) config.seasonal = false;
    else if (typeof config.seasonal !== "string") delete config.seasonal;
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config }, bubbles: true, composed: true,
    }));
  }
}

// For scripts/card-check and scripts/costume-preview.
HatchPetCard.seasons = SEASONS;
HatchPetCard.hanukkah = hanukkah;
HatchPetCard.seasonLines = seasonLines;
HatchPetCard.findsShown = FINDS_SHOWN; // card-check and the bench can set it
HatchPetCard.findLines = FIND_LINES;
HatchPetCard.giftLines = GIFT_LINES;
HatchPetCard.giftMade = GIFT_MADE;
HatchPetCard.collectionTiles = collectionTiles;
HatchPetCard.houseCategories = Object.keys(HOUSE_CATEGORY); // card-check: == const HOUSE_CATEGORIES
HatchPetCard.houseMomentLines = HOUSE_MOMENT_LINES;
HatchPetCard.momentClasses = Object.fromEntries(Object.entries(MOMENT_CLASS)
  .map(([type, c]) => [type, { [KEPT]: "kept", [BEAT]: "beat", [FLAVOUR]: "flavour" }[c]]));
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
