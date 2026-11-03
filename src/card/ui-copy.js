// S4: an admin's way into HA's own screens, the way "connect more ›" has always gone
// (history.pushState + location-changed). The first is HA's "My" redirect to the
// add-integration dialog; the second is this pet's entry on the integration page.
const ADD_PET_PATH = "/_my_redirect/config_flow_start?domain=virtual_pet";
const goHA = (path) => {
  history.pushState(null, "", path);
  window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
};
// Approved lines the scan's nag words ("again", "forgot...") would refuse: a retry, "just us",
// and the two that say a forget worked. Not nagging, so unscanned.
const SETTINGS_AGAIN = {
  failed: "hm, that didn't work. try again soon",
  sharedOff: "just us again ♥",
  forgotBirthday: "ok, forgotten. i won't ask ♪",
  forgotMe: "forgotten. we'll start fresh ♥",
  askAgain: "ask me again", // the favourites' button (memory plan M0-c, label DRAFT)
  // Memory's switch (memory plan M1a; first-mate copy 2026-11-02, exact). Here with the
  // other erase lines, not the scanned fresh block: over its 40 characters, and "forgotten".
  memoryOn: "the pets will remember what you tell them ♪",
  memoryOff: "forgotten. the pets keep nothing you told them",
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
  // The one-time memory ask (memory plan M1b), at bond level 4, once; the server decides.
  // The card says "shown" when it is on screen (_ask). Kept, never stashed (not in
  // STASHED_QUESTIONS): a failed send leaves nothing on this device. "yes" turns memory on.
  memory: { q: MEMORY_ASK.q, keep: true, answers: { yes: [MEMORY_ASK.yesReply], not_now: [MEMORY_ASK.notNowReply] },
    label: (a) => (a === "yes" ? MEMORY_ASK.yes : MEMORY_ASK.notNow) },
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
  // Door 6 (memory plan M1b): "told", the first time a favourite told while memory was on
  // comes back; else the turn's line, as ever.
  fav_weather: (n, device) => (n.told && MEMORY_TOLD[n.weather]) || turnPick(FAV_WEATHER_LINES[n.weather], `${device}|favweather`),
  season: (n) => n.holiday && namedHolidays()
    ? `${n.holiday === "halloween" ? "Halloween" : "Thanksgiving"} in your favourite season! ♥`
    : n.told && SEASON_ICONS[n.season] ? MEMORY_TOLD.season(n.season)
      : `it's ${n.season}, your favourite! ${SEASON_ICONS[n.season] || ""}`.trim(),
  // Memory's doors (plan section 6), each with at most one pick, said by its label; a pick
  // the card doesn't know says nothing.
  door2: () => MEMORY_DOORS.door2,
  door4: (n) => MEMORY_DREAM_LABEL[n.pick] && MEMORY_DOORS.door4(MEMORY_DREAM_LABEL[n.pick]),
  door5: (n) => ["rain", "sun"].includes(n.pick) && MEMORY_DOORS.door5(n.pick),
  door12: (n) => { const game = GAMES.find((g) => g.key === n.pick); return game && MEMORY_DOORS.door12(game.label); },
  early_alarm: () => "early start tomorrow! sleep well ♥",
  up_early: () => "mmh... you're up before the sun... zzz ♥",
  photo: () => "i made you something! it's in your journal ♥",
};
const MEMORY_DREAM_LABEL = { stars: "the stars", sea: "the sea", snacks: "snacks", you: "you" }; // door 4's {pick}
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
// Touch (care reactions ship C, docs/plan-2026-11-02-care-reactions.md 5.4). A run is the pats within
// PAT_RUN_GAP_MS of each other, at most PAT_RUN_MAX_MS from its first; the PAT_FLOP_AT-th flops, and
// the PAT_QUIET_MS after it are soft pats that do not count. The head is the top PAT_HEAD of the box.
const PAT_RUN_GAP_MS = 5000;
const PAT_RUN_MAX_MS = 30000;
const PAT_QUIET_MS = 8000;
const PAT_FLOP_AT = 10;
const PAT_HEAD = 0.4;
const PAT_LEAN_DEG = 5;
// A lean is let go this long after the last pat (a longer one at n 2-3).
const PAT_LEAN_MS = 900;
const PAT_LEAN_LONG_MS = 1500;
// The sweet spot stays out of the ladder from the fourth pat.
const PAT_SPOT_MAX_N = 3;

// Where a tap landed: { zone: "head" | "body", side: "l" | "r" | null }. `rect` is the pat box read at
// the tap. A keyboard pat (detail 0), a missing or non-finite point and a box with no size are the
// head with no side: never NaN (a bench or card-check pat passes only `detail: 0`).
function patZone(rect, x, y, detail) {
  const head = { zone: "head", side: null };
  if (detail === 0 || !rect || !(rect.width > 0) || !(rect.height > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return head;
  const fy = (y - rect.top) / rect.height;
  const fx = (x - rect.left) / rect.width;
  return { zone: fy < PAT_HEAD ? "head" : "body", side: fx < 0.5 ? "l" : "r" };
}

// The run after a pat at `now`, from the run before it (null: none). Pure; the card stores the result
// in s.patRun. Returns { run, n, flop, quiet }: n is this pat's place in its run (11 inside the quiet).
//  - inside the quiet a pat is soft: it does not count and does not extend it;
//  - the first pat after the quiet, a gap over PAT_RUN_GAP_MS, or a run older than PAT_RUN_MAX_MS
//    starts a new run at 1;
//  - the PAT_FLOP_AT-th flops, and the run becomes { n: 11, quietUntil }.
function patStep(run, now) {
  if (run && run.quietUntil > now) return { run, n: PAT_FLOP_AT + 1, flop: false, quiet: true };
  const fresh = !run || run.quietUntil || now - run.at > PAT_RUN_GAP_MS || now - run.start > PAT_RUN_MAX_MS;
  const n = fresh ? 1 : run.n + 1;
  const start = fresh ? now : run.start;
  if (n >= PAT_FLOP_AT) return { run: { n: PAT_FLOP_AT + 1, at: now, start, quietUntil: now + PAT_QUIET_MS }, n: PAT_FLOP_AT, flop: true, quiet: false };
  return { run: { n, at: now, start, quietUntil: 0 }, n, flop: false, quiet: false };
}
// Reactions to care at baby, teen and adult (PR 3c, O02): the stage's own mood frames
// (no new art) and a bounded CSS move, for one length at every stage.
const REACT_MS = 2500;
const REACTIONS = {
  fed: { mood: "excited", move: "munch", ms: 1500 },
  praised: { mood: "excited", move: "greethop", ms: 1400 },
  greet: { mood: "excited", move: "greethop", ms: 1400 }, // a world visitor (acts.cheer, else this)
  refused: { mood: "bored", move: "look", ms: 1200 },
  tucked: { mood: "cozy", move: "settle", ms: REACT_MS },
  // Ship A, the floor (docs/plan-2026-11-02-care-reactions.md 5.5): a fair scold flinches and sulks
  // (the refuse act, else the bored frame); the fan is leant into (the cozy frame); a game start
  // is a one-pose beat before the picker (the cheer act, else the excited frame).
  scolded: { mood: "bored", move: "startle", ms: 1200 },
  aired: { mood: "cozy", move: "lean", ms: 2600 },
  played: { mood: "excited", move: "perk", ms: 600 },
  // Ship C, touch (plan 5.4): a purr (the pat act held, else the cozy frame), the tenth pat's flop (the
  // cozy frame, kept for the quiet by _patFlop) and the body's third pat, a giggle (the excited frame).
  patted: { mood: "cozy", move: "settle", ms: 2000 },
  flopped: { mood: "cozy", move: "settle", ms: 2500 },
  tickled: { mood: "excited", move: "rock2", ms: 1250 },
  // Only with the species' own act (STAGE_POSES): without it these do nothing (R2).
  lost: { mood: "content", move: "settle", ms: 1200 }, // a good sport (acts.aww, else content frames: UX fix 6, F5); the log can land before the game closes
  ready: { mood: "content", move: null, ms: 1200, poseOnly: true }, // a game just began
};
const READY_MS = 1200;
const PAT_POSE_MS = 900; // acts.pat on a pat; apart from poseUntil so the next pat's `reacting` is unchanged
// Which species.json "acts" pose a reaction plays at baby, teen and adult (R1, R2).
// refused and lost: the act, else the mood frame; ready: the act, else nothing (the game perks instead).
const STAGE_POSES = { fed: "eat", praised: "cheer", greet: "cheer", refused: "refuse", lost: "aww", ready: "ready", scolded: "refuse", played: "cheer", patted: "pat" };
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
// Only these refusals react; asleep, egg, away and no_game do not (spoiled is a reaction of its
// own, see SPOILED_BY; an unfair scold turns the pet away).
const REACT_REFUSALS = new Set(["full", "not_needed", "already_clean", "not_sick", "not_sleepy", "too_tired", "unfair"]);
// What a refusal does besides the turn-away (ship A, plan 5.5), picked without repeating:
// a head shake is two flips; not_sleepy yawns then hops; too_tired flops.
const REFUSAL_VARIANTS = { not_sleepy: ["yawn", "look"], too_tired: ["flop", "look"], unfair: ["look"] };
const REFUSAL_POOL = ["look", "shake"];
// A fake call whined for the praise, snack or play: the care is taken as an ok, then the pet is smug.
const SPOILED_BY = new Set(["praise", "snack", "play"]);
// Is this care entry a yes for a scene (plan care-reactions 4.4)? An ok; and a spoiled snack, which a
// scene eats (then is smug). A spoiled praise or play stays on the floor, and so does a spoiled
// medicine (never: only SPOILED_BY's three are spoiled at all).
const isYes = (entry) => entry.result === "ok" || (entry.result === "spoiled" && entry.action === "snack");
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
  rest_started: FLAVOUR, // the resting switch on (R1): no line
  rest_ended: BEAT, // ... and off: "good stretch! i'm back ♪" (REST_LINES.back)
};
// Resting (plan favourite-resting §4.3-§4.4, R1): the small label under the pet, the
// settings row's helper. The label shows only when the pet is up and about at home: away
// shows the sitter's sign, and asleep, sick and egg poses win.
const REST_LABEL = "resting ☁";
const REST_DAYDREAM_ODDS = 0.25; // a resting pet's hello is "i was just daydreaming" this often
const REST_HELP = (name) => `${name} won't get any hungrier, and doesn't grow up until it's back. Visit any time.`;
function restLabel(flags, { away = false, asleep = false, egg = false } = {}) {
  if (!Array.isArray(flags) || !flags.includes("resting") || away || asleep || egg) return "";
  return flags.includes("sick") || flags.includes("away") ? "" : REST_LABEL;
}
// The opening-pet rows (favourite §5.3, first-mate-approved lines): no ranking word, just
// where this card opens, and (admins) where shared screens open.
const OPEN_ON_COPY = {
  mine: (name) => `♥ open on ${name}`,
  house: (name) => `shared screens open on ${name}`,
};
// The settings row: a switch on a personal screen; on a shared one its state only (decided).
function restRow(on, shared, name) {
  const value = shared
    ? `<span class="restro">${on ? "on" : "off"}</span>`
    : `<span><button class="bell resting" aria-label="resting: ${on ? "on" : "off"}, change" aria-pressed="${on}">${on ? "on" : "off"}</button></span>`;
  return `<div class="row srow restrow"><span>resting</span>${value}</div>
      <div class="shellnote restnote">${REST_HELP(escape(name))}</div>`;
}
// "remember me" (memory plan M1a; first-mate copy 2026-11-02): the person's memory switch,
// on their own screen only. Off erases, so it takes the two-tap confirm (armed: "sure?").
function memoryRow(on, armed) {
  const aria = armed ? CONFIRM_ARIA.memory_off : `remember me: the pets keep what you tell them, ${on ? "on" : "off"}, change`;
  const text = armed ? "sure? tap again" : on ? "on" : "off";
  return `<div class="row srow memoryrow"><span>remember me</span><span><button class="bell memory" aria-label="${aria}" aria-pressed="${!!on}">${text}</button></span></div>`;
}
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
// Naming the new generation (settings S3): the lay is waited for 30 s (longer while the entry
// reloads, up to 2 minutes), a not_ready answer is retried once after 2 s, the field takes 20.
const NAME_WAIT_MS = 30000;
const NAME_WAIT_MAX_MS = 120000;
const NAME_RETRY_MS = 2000;
const NAME_MAX = 20;
// A name needs one character you can see: a letter, number, punctuation or symbol (the server's
// clean_name holds the same rule). Format characters and the blank "filler" letters show nothing.
const NAME_FILLERS = new Set(["\u3164", "\u115F", "\u1160", "\u2800"]);
const nameShows = (text) => Array.from(text).some((c) => /[\p{L}\p{N}\p{P}\p{S}]/u.test(c) && !NAME_FILLERS.has(c));
const NAME_ERRORS = { bad_name: "nameBad", taken: "nameTaken", not_now: "nameNotNow", read_only: "nameReadOnly" };
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
  memory_off: "Sure? Press again to forget what the pets remember about you",
  ask_again_fav_weather: "Sure? Press again to be asked about your favourite weather",
  ask_again_fav_season: "Sure? Press again to be asked about your favourite season",
  ask_again_fav_visitor: "Sure? Press again to be asked about your favourite visitor",
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
// The pet's bedtime row (settings S7, N21): a target, "about" so, in the viewer's own HA time
// format (hass.locale.time_format: "12", "24", or the language's own). Built at run time from
// digits, so it is not a scanned line.
function sleepLine(sleep, hass) {
  const fmt = hass?.locale?.time_format;
  // "system" follows the browser's own locale (as HA does); "language" follows HA's language.
  const tag = fmt === "system" ? undefined : hass?.locale?.language || undefined;
  const show = (hhmm) => {
    const [h, m] = String(hhmm).split(":").map(Number);
    const at = new Date(2000, 0, 1, h || 0, m || 0);
    const opts = fmt === "24" ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
      : fmt === "12" ? { hour: "numeric", minute: "2-digit", hour12: true }
        : { hour: "numeric", minute: "2-digit" };
    try {
      return at.toLocaleTimeString(tag, opts).toLowerCase();
    } catch (err) { // a language tag the browser rejects must not blank the sheet
      return at.toLocaleTimeString(undefined, opts).toLowerCase();
    }
  };
  return `about ${show(sleep.bedtime)} · up ${show(sleep.wake)}`;
}

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

