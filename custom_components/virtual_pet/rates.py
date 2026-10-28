"""Every tunable number for the pet, in one place.

Rates are *per hour* and are applied over the real time that has passed, so
changing the tick interval never changes how fast the pet lives. Stats run
0-100. Hunger is a fullness meter: 100 is stuffed, 0 is starving.
"""

from __future__ import annotations

# --- Clock -----------------------------------------------------------------

TICK_MINUTES = 5  # how often the coordinator advances the pet
MAX_STEP_SECONDS = 300  # the simulation never takes a bigger bite than this
# A gap longer than this while HA is running (the clock jumped: an NTP sync,
# a resumed VM) is frozen like downtime instead of lived through. Restart
# downtime is always frozen entirely, so it needs no cap.
MAX_LIVE_GAP_MINUTES = 30
NAP_INTO_NIGHT_MINUTES = 60  # a nap this close to bedtime lasts the night

# --- Decay while awake (per hour) ----------------------------------------

HUNGER_DECAY = 5.0  # full to calling in ~15 h: three or four meals a day
HAPPINESS_DECAY = 4.0
ENERGY_DECAY = 5.0
DISCIPLINE_DECAY = 0.25  # per awake hour: habits fade unless reminded (~4 a day)

# --- While asleep (per hour) ----------------------------------------------

ASLEEP_HUNGER_FACTOR = 0.4  # hunger drains at 40% speed overnight
ASLEEP_HAPPINESS_FACTOR = 0.0  # dreams are neutral
ENERGY_REGEN_ASLEEP = 12.0  # an 8 h night refills ~96 energy
NAP_WAKE_ENERGY = 95.0  # a daytime nap ends here

# --- Health (per hour) ----------------------------------------------------

HEALTH_REGEN = 1.0  # when fed, clean and well
HEALTH_STARVING = -3.0  # while hunger is 0
HEALTH_PER_OLD_POOP = -1.0  # each poop older than POOP_OLD_MINUTES
HEALTH_SICK = -2.0
HAPPINESS_SICK = -1.0
HEALTH_FLOOR = 1.0  # the pet never dies by default
HEALTHY_HUNGER_MIN = 30.0  # regen needs at least this much in the tummy

# --- Care actions -----------------------------------------------------------

FEED_HUNGER = 35.0
FEED_FULL_AT = 95.0  # refuses a meal above this
SNACK_HUNGER = 10.0
SNACK_HAPPINESS = 15.0
SNACK_HEALTH = -2.0
SNACK_POOP_CHANCE = 0.3
PLAY_HAPPINESS = 20.0
PLAY_ENERGY = -10.0
PLAY_HUNGER = -5.0
PLAY_MIN_ENERGY = 15.0
MEDICINE_HEALTH = 25.0
MEDICINE_HAPPINESS = -5.0  # it tastes bad
PRAISE_HAPPINESS = 8.0
PRAISE_DISCIPLINE = 2.0
PRAISE_COOLDOWN_MINUTES = 30  # discipline from praise only once per window
SCOLD_DISCIPLINE = 25.0  # scolding a fake call
SCOLD_UNFAIR_HAPPINESS = -10.0  # scolding for nothing
PRAISE_WHINING_DISCIPLINE = -10.0  # praising a fake call
WAKE_IN_NIGHT_HAPPINESS = -5.0  # turning lights-out off during sleep hours

# --- Weight (0-100; a healthy pet stays in the middle band) ----------------
# Three meals a day roughly balance a day's burn; snacks tip it up, play and
# games bring it down.

WEIGHT_START = 50.0
WEIGHT_FEED = 4.0
WEIGHT_SNACK = 6.0
WEIGHT_PLAY = -3.0
WEIGHT_GAME = -4.0
WEIGHT_CHORE_TREAT = 2.0
WEIGHT_BURN = 0.7  # per awake hour
WEIGHT_STARVING = -1.0  # per hour while hunger is 0
WEIGHT_HEAVY_ABOVE = 75.0  # heavy: no health regen, and a risk of getting sick
WEIGHT_LIGHT_BELOW = 25.0  # light: no health regen until it's fed up again
WEIGHT_HEAVY_SICK_HAZARD = 0.02  # chance per hour of getting sick while heavy

# --- Games (the card's play button) -------------------------------------------

GAME_ROUNDS = 5
GAME_WIN_AT = 3  # right guesses out of GAME_ROUNDS
GAME_WIN_HAPPINESS = 25.0  # left/right is luck: a win pays more than plain play
# Higher or Lower is mostly skill (a good player wins ~92% of games), so a win
# pays like plain play; at 25 it would be the best happiness button there is.
SKILL_GAME_WIN_HAPPINESS = PLAY_HAPPINESS
GAME_LOSE_HAPPINESS = 10.0
GAME_IDLE_MINUTES = 3  # an unfinished game is dropped after this

# --- Chores: a done to-do item earns the pet a treat --------------------------

CHORE_TREAT_HUNGER = 10.0
CHORE_TREAT_HAPPINESS = 10.0
CHORE_TREATS_PER_DAY = 5
CHORE_TREATS_WAITING = 3  # kept for it while it sleeps or is away

# --- Poop -------------------------------------------------------------------

DIGEST_MINUTES = 120  # a meal comes out about this long after eating
DIGEST_JITTER_MINUTES = 30
MAX_POOPS = 3
POOP_CALL_MINUTES = 30  # the pet complains once a poop has sat this long
POOP_OLD_MINUTES = 60  # older poop hurts health and risks sickness
POOP_SICK_HAZARD = 0.08  # chance per hour, per old poop, of getting sick

# --- Calls ------------------------------------------------------------------

CALL_WINDOW_MINUTES = 20
# reason: (calls below, re-arms above)
CALL_THRESHOLDS: dict[str, tuple[float, float]] = {
    "hunger": (25.0, 40.0),
    "happiness": (25.0, 40.0),
    "energy": (20.0, 40.0),
}
FAKE_CALL_RATE = 0.12  # fake calls per awake hour while everything is fine
FAKE_CALL_MIN_STATS = 50.0  # only whines when all core stats are above this
# Discipline makes whining rarer: at 100 it whines this much less often.
FAKE_CALL_DISCIPLINE_DAMPING = 0.75

# --- Sickness ---------------------------------------------------------------

SICK_BELOW_HEALTH = 25.0
SICK_MISSES = 4  # this many care misses in a day makes the pet sick
SICK_MISS_WINDOW_HOURS = 24

# --- Sleep ------------------------------------------------------------------

DEFAULT_BEDTIME = "23:00"
DEFAULT_WAKE_TIME = "07:00"
DROWSY_BEFORE_BED_MINUTES = 30
FALL_ASLEEP_ANYWAY_MINUTES = 60  # left up past bedtime, it dozes off itself
COLLAPSE_ENERGY = 0.0  # at or below this, it falls asleep where it is

# --- Mood -------------------------------------------------------------------

HUNGRY_BELOW = 35.0
SLEEPY_BELOW = 30.0
BORED_BELOW = 35.0
EXCITED_MINUTES = 15  # play, praise or a snack keeps it excited this long

# --- Life stages (hours of age, aging pauses while away) --------------------

STAGE_STARTS: list[tuple[str, float]] = [
    ("egg", 0.0),
    ("baby", 0.5),
    ("child", 24.0),
    ("teen", 120.0),
    ("adult", 336.0),  # about two weeks
]

# --- Upbringing: decided on reaching adulthood, kept for life ---------------

UPBRINGING_MISS_COST = 6.0  # care points lost per care miss while growing up
UPBRINGING_CARE_WEIGHT = 0.7  # the rest of the score is discipline
# Highest first: the first grade whose score the pet reaches.
UPBRINGING_GRADES: list[tuple[str, float]] = [
    ("devoted", 80.0),
    ("steady", 50.0),
    ("scrappy", 0.0),
]
DEVOTED_DECAY_FACTOR = 0.8  # a devoted adult gets hungry and bored more slowly
SCRAPPY_WHINE_FACTOR = 1.5  # a scrappy adult whines more (it never hurts it)

# --- Log --------------------------------------------------------------------

CARE_LOG_SIZE = 20

# --- Home influences (phase 3). Bonuses only; the house never drains. -------

HOME_BONUS_CAP = 3.0  # per hour, per stat, all home signals combined
HOME_SUN_HAPPINESS = 1.0
HOME_SNOW_HAPPINESS = 1.5
HOME_MUSIC_HAPPINESS = 1.5
HOME_TV_HAPPINESS = 0.5
HOME_SUNNY_SOLAR = 300.0  # W/m² from a weather station means proper sun
HOME_COMFORT_LOW_C = 18.0  # below: shivers, asks for a blanket
HOME_COMFORT_HIGH_C = 26.5  # above: sweats, asks for a fan
HOME_BRIGHT_LEVEL = 0.5  # a room light at half brightness or more, at night
HOME_BRIGHT_LUX_AT_NIGHT = 100.0
HOME_DIM_LEVEL = 0.35  # evening lights this low feel cozy
HOME_BAD_AQI = 100.0
HOME_MOON_HAPPINESS = 1.0  # awake under a full moon
HOME_FULL_MOON_ILLUMINATION = 0.97  # lit fraction that counts as full
HOME_NEW_MOON_ILLUMINATION = 0.03
# --- Generations (phase 4) ---------------------------------------------------

LAY_EGG_AFTER_ADULT_HOURS = 7 * 24.0  # the owner may let it lay an egg after this

# --- Traits (phase 4): learned from the house, kept for life. Bonuses only. ---

TRAIT_NIGHT_OWL_HOURS = 10.0  # awake inside sleep hours
TRAIT_MUSIC_LOVER_HOURS = 12.0  # awake with music playing
TRAIT_HOMEBODY_SHARE = 0.75  # of awake time with someone home...
TRAIT_HOMEBODY_MIN_AWAKE_HOURS = 48.0  # ...over at least this much awake time
TRAIT_HAPPINESS = 0.5  # per hour: a night owl up late, a homebody with company
NIGHT_OWL_STAY_UP_FACTOR = 2.0  # stays up this much longer before dozing off
# Hours awake under a house flag that teach the other traits.
TRAIT_FLAG_HOURS: dict[str, tuple[str, float]] = {
    "sun_lover": ("sunny", 20.0),
    "fireside": ("fireside", 10.0),
    "moon_child": ("full_moon", 3.0),  # a full moon only lasts a night or two
    "storm_watcher": ("rainy", 15.0),
    "couch_potato": ("watching_tv", 12.0),
    "social_butterfly": ("greeting", 2.5),  # about 15 arrivals of 10 minutes
    "snow_child": ("snowy", 6.0),
    "breeze_rider": ("windy", 10.0),
    "fog_wanderer": ("foggy", 8.0),
    "thunder_heart": ("storm", 2.0),  # thunder is rare: a couple of hours of it
}
# Traits counted in events rather than hours.
TRAIT_EARLY_BIRD_MORNINGS = 7  # mornings the house stirred soon after wake time
TRAIT_EARLY_BIRD_WINDOW_MINUTES = 60  # "soon": the first stir within this of wake time
TRAIT_HELPER_CHORES = 10  # chore treats handed over
TRAIT_PLAYER_GAMES = 15  # games finished
EARLY_BIRD_MORNING_MINUTES = 120  # an early bird is happier this long after wake time
HELPER_TREAT_HAPPINESS = 4.0  # a helper's extra per chore treat (at ★)
PLAYER_WIN_HAPPINESS = 4.0  # a player's extra per won game (at ★)
# A pet keeps at most this many traits for life; an inherited one counts.
TRAIT_CAP = 4
# Temperament: rolled at hatching, a factor on each trait's threshold, so pets in
# the same house don't all learn the same traits first.
TEMPERAMENT_RANGE = (0.6, 1.6)
# Effects grow with the level (★ to ★★★): an inherited trait the pet also learns
# for itself goes up one level.
TRAIT_MAX_LEVEL = 3
TRAIT_LEVEL_SCALE = {1: 1.0, 2: 1.5, 3: 2.0}

HOME_BEDTIME_WINDOW_MINUTES = 60  # dark-and-quiet works this long before bedtime
HOME_QUIET_MINUTES = 10  # no motion for this long counts as quiet
HOME_HOLD_MINUTES = 10  # an unavailable sensor keeps its last value this long
HOME_DEBOUNCE_SECONDS = 10.0
HOME_GREETING_MINUTES = 10
HOME_MEDIA_COOLDOWN_MINUTES = 20  # between comments on what's on TV or playing
NEWS_COOLDOWN_MINUTES = 30  # between bits of news shared with virtual_pet.share_news
NEWS_HEADLINE_MAX = 60  # characters, so the bubble leaves the pet in view
NEWS_TOPIC_MAX = 20
HOME_GREETING_COOLDOWN_MINUTES = 30  # GPS jitter shouldn't cause repeat greetings
# Weather the pet remarks on (cosmetic). Wind from the weather entity's speed,
# for providers that seldom report the "windy" condition.
HOME_WINDY_KMH = 30.0  # sustained, about Beaufort 5
HOME_GUSTY_KMH = 50.0
HOME_WEATHER_GAP_MINUTES = 20  # between any two weather remarks (absorbs showers)
HOME_WEATHER_COOLDOWN_MINUTES = 90  # before the same remark again
HOME_SUN_OUT_AFTER_HOURS = 2.0  # of daytime cloud before "the sun came out!"
HOME_HOT_DAY_C = 30.0  # outdoors, now or the forecast high
HOME_COLD_SNAP_C = -10.0  # outdoors, now or the forecast low
HOME_COLD_DAY_HIGH_C = 0.0  # a forecast high this low is a cold day too
HOME_FORECAST_SWING_C = 8.0  # a high this far from the day before is worth a word
HOME_FORECAST_REFRESH_MINUTES = 60
HOME_FORECAST_DELAY_MINUTES = 3  # after good morning, so the two don't collide
HOME_FORECAST_EVENING_HOURS = 3.0  # tomorrow's forecast, this long before bedtime
HOME_AWAY_AFTER_HOURS = 2.0  # empty this long: off to the sitter's

# Answering a request
BLANKET_HAPPINESS = 10.0
FAN_HAPPINESS = 8.0
COMFORT_MINUTES = 120  # cozy (blanket) or cool (fan) lasts this long
COMFORT_HAPPINESS = 1.0  # per hour while cozy or cool
HOME_FIRE_HAPPINESS = 1.0  # a lit fireplace (counts toward the cap)

# Daily check-ins: a wish a day, and a dream in the morning (cosmetic but for
# the small happiness a granted wish gives).
WISH_HAPPINESS = 8.0  # once, when the day's wish comes true
WISH_SNACK_AFTER_HOUR = 12  # "a snack after lunch": local hour from which it counts
WISH_SAY_HI_AFTER_HOUR = 12  # "come say hi this afternoon"
WISH_FOR_CHANCE = 0.35  # a person's wish is aimed at a close friend
DREAM_SEEDS_KEPT = 12  # the day's moments a dream can be about
DREAM_SEED_HOURS = 30.0  # older seeds are forgotten
DREAM_PLAIN_CHANCE = 0.5  # with nothing to dream about: a plain dream, or none
FAVOURITE_SNACK_CHANCE = 0.4  # a snack is its favourite (said at most once a day)

# A bond with each person (HA user). Points never go down. A typical day (a
# visit, a few care actions, a game) earns about 8.
BOND_VISIT_POINTS = 2  # the first look of the day
BOND_CARE_POINTS = 1
BOND_GAME_POINTS = 2
BOND_WISH_POINTS = 3  # granted the day's wish
BOND_DAILY_LIMIT = 8  # care and games, per person per day
# Points needed for levels 1-10: a week to level 5, about a month to level 10.
BOND_LEVELS = (0, 4, 10, 20, 34, 52, 75, 105, 145, 200)
BOND_NICKNAME_LEVEL = 4  # it picks a nickname for them
BOND_FAVOURITE_LEVEL = 6  # it picks its favourite of their games
BOND_FRIEND_LEVEL = 3  # close enough to cheer when they come home, or wish on them
BOND_VISIT_EVERY_MINUTES = 60  # the card's visit call, per person (in memory)
FRIEND_HOME_EVERY_MINUTES = 30  # the cheer when a friend arrives, per person
TUCK_IN_EVENING_HOUR = 18  # lights out by hand from here (to 3 am) is tucking in
TUCK_IN_THANKS_HOURS = (4.0, 18.0)  # "you tucked me in last night", this long after

# "My day" (opt-in per person, wellbeing.py): what the pet notices, by bond level.
MY_DAY_STEPS_LEVEL = 2
MY_DAY_STEPS = 10000  # a milestone day
MY_DAY_USUAL_LEVEL = 4
MY_DAY_USUAL_DAYS = 14  # "usual": their median over this many days
MY_DAY_USUAL_MIN_DAYS = 5  # fewer days than this: no "usual" yet
MY_DAY_USUAL_MIN_STEPS = 1000  # a usual this low says nothing
MY_DAY_MORE = 1.3  # "more than usual": this many times their usual
MY_DAY_MORE_MIN_STEPS = 1500  # and at least this many steps more
MY_DAY_ACTIVE_LEVEL = 5  # a bike ride, a run, lots of stairs
MY_DAY_STAIRS = 10  # floors
MY_DAY_BEST_LEVEL = 7
MY_DAY_BEST_DAYS = 30  # "your most active day in weeks"
MY_DAY_BEST_MIN_DAYS = 7
MY_DAY_BEST_MIN_STEPS = 5000
MY_DAY_WEATHER_WALK_STEPS = 5000  # out in the rain or snow, without a usual
MY_DAY_SLEEP_LEVEL = 8
MY_DAY_RESTED_HOURS = 7.0  # and at least their usual

# Bond connections (people.py): what the pets know about each person, shared.
NOTES_PER_VISIT = 2  # private lines said at one look; the rest wait
LOOK_LINES = 3  # lines at one look, the card's own and the notes together
PEOPLE_WEATHER_DAYS = 4  # days of the house's weather kept
SEASON_TROPICS_LATITUDE = 23.5  # nearer the equator: no season talk
ASK_LEVEL = 2  # questions ("how was your day?") from this bond level
ASK_MORNING_FROM = 5  # "did you sleep well?" from this hour to noon
ASK_LIKES_LEVEL = 3  # "what's your favourite weather?", then season
# One-time questions (favourite weather and season, your birthday, its
# catchphrase): in the later slot, in this window, a few days apart.
ASK_LIKES_FROM, ASK_LIKES_UNTIL = 11, 20
ASK_LIKES_TRIES = 2  # an unanswered one-time question: asked once more...
ASK_LIKES_AGAIN_DAYS = 14  # ...this many days later, then never
ASK_ONCE_GAP_DAYS = 3  # days between one person's one-time questions
BIRTHDAY_ASK_LEVEL = 4  # "when's your birthday?"
CATCHPHRASE_LEVEL = 7  # "what should I say at the end of things?"
ASK_DAY_FROM = 16  # "how was your day?" on its rotation day
ASK_DREAM_BEFORE_BED_MINUTES = 180  # "what should I dream about?"
ASK_GUESS_FROM = 17  # "rain or sun tomorrow?"
GUESS_FROM_HOUR = 18  # the guessed day is judged from here, or the day after
JUST_HOME_HOURS = 2.0  # "how was your day?" after coming home, within this
ZONE_REMEMBER_HOURS = 8.0  # "back from the gym?!" if they came home within this
ZONE_LEVEL = 3
HOME_COLD_C = 5.0  # coming home: "was it cold out there?"
HOME_HOT_C = 28.0  # coming home: "you must be thirsty!"
SENDOFF_LEVEL = 3
SENDOFF_HOURS = (6, 12)  # mornings only
SENDOFF_PER_WEEK = 3
ALARM_LEVEL = 3
ALARM_EVENING_FROM = 19
ALARM_USUAL_MIN = 5  # alarms seen before there's a "usual"
ALARM_KEPT = 10
ALARM_EARLY_MINUTES = 45  # this much before their usual is early
ALARM_EARLY_WITHOUT_USUAL = 5 * 60 + 30  # before 5:30
UP_EARLY_FROM = 3  # "you're up before the sun!" from 3 am
DREAM_PICK_HOURS = 16.0  # last night's dream picks: made within this before waking
