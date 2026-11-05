// Hatch at Home: the device shelf. One card holds every pet device: each is
// a handheld toy themed for its world, standing on that world's backdrop.
// Arrows, dots or a swipe move to the next device. All state lives in Home
// Assistant; the card only draws and presses the pets' buttons and switch.

const VERSION = "0.46.3";
// scripts/build-card.js swaps this for the card's content id (7 hex of its own sha256): Settings shows it.
const BUILD = "__BUILD_ID__";
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
const WIPE_UP_MS = 170; // the status sheet closing (_wipe "up"): the .16 s wipe, then off
const FLIP_SWAP_MS = 80; // a game counter's flip-clock swap: halfway through its .16 s (_flipNumber)
const TURN_MS = 200; // the edge-on sprite swap (_swapFlip): .1 s away, .1 s back
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
      gain.gain.setValueAtTime(0, t); // a 5 ms ramp in: a note that starts at full gain clicks (UX7 F7)
      gain.gain.linearRampToValueAtTime(0.04, t + 0.005);
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

let lastChirp = {}; // the last chirp any card played: {card, name, device, at} (see _chirp)

// Every chirp goes through one lowpass at about 3 kHz (UX7 F10): the toy's square beep, less shrill
// next to the voice's soft triangle babble.
let chirpBus = null;
function chirpOut() {
  if (!chirpBus || chirpBus.context !== audio) {
    chirpBus = audio.createBiquadFilter();
    chirpBus.type = "lowpass";
    chirpBus.frequency.value = 3000;
    chirpBus.connect(audio.destination);
  }
  return chirpBus;
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
      gain.gain.setValueAtTime(0, t); // a 5 ms ramp in: a note that starts at full gain clicks (UX7 F7)
      gain.gain.linearRampToValueAtTime(0.05, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, t + len);
      osc.connect(gain).connect(chirpOut());
      osc.start(t);
      osc.stop(t + len);
    }
    t += len;
  }
}

