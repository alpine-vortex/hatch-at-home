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
  "*blink blink* morning ♪", "*yawn* i had the best dream"];
// S-b: lights out after a visitor seen here today (by its name), else after today's sunset.
const NIGHT_VISITOR = [(v) => `night, little ${v} ♪`, (v) => `sweet dreams, ${v} ♪`];
const NIGHT_SUNSET = "night... what a nice sunset ♥";
// A new pet's first bedtime, said once (owner, 2026-11-02, UX review 4 Q5).
const FIRST_NIGHT = "my first night here... ♥";
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
// M0-b (memory plan section 7): the favourite-weather note, said once a day on a matching day,
// now a list per weather in turns (turnPick, `${device}|favweather`) so it doesn't repeat word
// for word. One approved line each so far; the plan's 3 per weather are owed (its copy is DRAFT).
const FAV_WEATHER_LINES = {
  sun: ["it's sunny, your favourite! ☀"],
  rain: ["it's raining, your favourite! ☂"],
  snow: ["it's snowing, your favourite!! ❄"],
  storms: ["a storm! your favourite!"],
};
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
  // S3: naming the new generation (N12, the field's aria-label, is built where it is drawn).
  nameHeading: "a name for the egg", // N8
  nameSave: "name it", // N9
  nameKeep: (name) => `keep ${name}`, // N10
  nameRow: "name", // N11
  nameChange: "change", // N11
  nameSaved: (name) => `${name}! i like it ♥`, // N13
  nameBad: "keep it short, and not blank", // N14 (plan §13)
  nameTaken: "another pet here has that name", // N15
  nameNotNow: "only a new egg or baby can be named", // N16
  nameReadOnly: "this login can't name, sorry", // N17
  nameFailed: "hm, that name didn't stick ♪", // N18
  // S4: first run. The empty card's button for an admin (N19).
  addPet: "add a pet ›", // N19
  // S7: the shared screen's heading holds its switch, its note and, for an admin, this (N24, plan §13).
  sharedPrivacy: "sensor privacy is in the pet's options", // N24
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
  friendsHint: "visitors and neighbours this week ♪", // UX8 F9 (FM 2026-11-02, owner delegated): a tap on the friends row
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
  dugThere: "oh! you dug there too ♪", // UX6 F16, a screen adopts the same person's other screen's dig
};
// --- end fresh-expand copy ---
