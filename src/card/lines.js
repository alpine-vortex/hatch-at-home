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
// Care scenes (SCENES, card-care.js; plan care-reactions 4.3-4.5). A log entry's action
// answers the scene of its kind: lights_out answers a lights scene, every other its own.
const WAKE_STRETCH_MS = 2500; // a lights scene's own stretch or tuck line holds the moment's twin off this long (care reactions D)
const SCENE_KIND_OF = { lights_out: "lights" };
const sceneKind = (action) => SCENE_KIND_OF[action] || action;
const SCENE_HOLD_MS = 2000; // the longest a scene waits at its gate for the answer
const SCENE_EXIT_MS = 400; // the exit beat when it gives up, or the call failed
const SCENE_OWE_MS = 10000; // how long an ended scene's answer is still its own
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
// Species nature (docs/plan-2026-11-02-species-nature.md): four facts in species.json, flavour only.
// A missing block or an unknown value is no nature at all, never an error. Pace is not a key:
// it comes from voice.pace (40 or more quick, 29 or less slow, else steady).
const NATURE_VALUES = {
  clock: ["day", "dusk", "night"],
  sky: ["sun", "rain", "snow", "fog", "wind", "fire", "moon"],
  company: ["social", "solo"],
  habit: ["hoarder", "builder", "basker", "groomer", "explorer", "watcher", "performer"],
};
function nature(sp) {
  const n = sp?.nature;
  if (!n || typeof n !== "object") return null;
  return Object.entries(NATURE_VALUES).every(([key, ok]) => ok.includes(n[key])) ? n : null;
}
function paceOf(sp) {
  const pace = sp?.voice?.pace;
  return !(pace > 0) ? "steady" : pace >= 40 ? "quick" : pace <= 29 ? "slow" : "steady";
}
// The idle cadence by pace (at most 25% either way). Not for a calm card, a baby or a species
// with no nature: those keep the common cadence.
const SKY_WAIT_MS = 60000; // the sky reaction holds off this long after a weather line
const PACE_SCALE = { quick: 0.8, steady: 1, slow: 1.25 };
// Idle manner: the copies of existing idle moves a teen or adult's habit adds (at most 3).
const SPECIES_ADDS = {
  hoarder: ["speck", "speck", "munch"],
  builder: ["settle", "wander"],
  basker: ["settle", "settle", "look"],
  groomer: ["rock", "settle"],
  explorer: ["wander", "wander", "look"],
  watcher: ["look", "look", "look"],
  performer: ["perk", "perk", "rock"],
};
// The house flag each sky waits for. The fire has two stand-ins: the heating answering a chill
// ("cozy"), and else the sun, so a house with no fireplace still sees it.
const SKY_FLAGS = {
  sun: ["sunny"], rain: ["rainy"], snow: ["snowy"], fog: ["foggy"], wind: ["windy"],
  fire: ["fireside", "cozy", "sunny"], moon: ["full_moon"],
};
const EGG_WOBBLE_MIN_MS = 40000; // an idle egg rocks once in 40-90 s (_eggWobble)
const EGG_WOBBLE_SPREAD_MS = 50000;
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
  // Resting (R1): the baby keeps lines it already says (cozy, a hello, a cheer).
  "idle.resting": { baby: ["cozy cozy", "♪ la la ♪"] },
  "rest.visit": { baby: ["oh! hi hi ♥"] },
  "rest.back": { baby: ["yay yay!", "hehe!"] },
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
    link_kindred: [(n) => `${n}! two of a kind, you and i ♥`, "such a grand pair we make ♥"],
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
