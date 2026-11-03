# Hatch at Home: feature catalog

What a player can see and do, feature by feature, with what switches it and whether it
is on. For the full rules and numbers read the [guide](guide.md); this page is the map.

**Reflects:** version 0.45.0.

**Keeping it current:** update this page with each release. Read the release's commits,
change the rows they touch, then re-check the "Where the docs and the code disagree"
list at the end.

Shorthands: **card** = `src/card/` (built into `frontend/hatch-pet-card.js`);
**model**, **coord**, **rates**, **notify**, **people**, **wellbeing**, **home**,
**watcher**, **intent** = the `.py` files of the same name in
`custom_components/virtual_pet/`. "Guide" = [guide.md](guide.md); "How-to" =
`docs/howto/how-to-play.html`. Code pointers are file and function names only, because
line numbers rot.

State: **live** = on by default for every player. **hidden** = built, but switched off
or not offered. **partial** = only part of it is built or reachable, or its art is a
stand-in. **not built** = planned, nothing in the code.

---

## 1. Care loop

| Feature | What the player sees or does | Where | Switches | State |
|---|---|---|---|---|
| Eight toy buttons | feed, snack, play, clean, meds, scold, praise, sleep/wake. Each button sinks and a ring pops, then the real reaction follows. A rejected press shakes. | card `ACTIONS`, `_press`; `button.py` | none | live |
| Button glow when needed | Feed glows when hungry, play when bored, and so on. Meds is greyed unless the pet is sick (entity unavailable). | card `_renderSlide` | none | live |
| Refusals | "i'm full!", "i'm not sick", and so on, in the bubble | card `REFUSALS`; model `_do_action` | none | live |
| Care scenes | medicine and clean play a short scene; feeding shows a bowl prop | card `_sceneStart`, `SCENE_PROPS` | none | live |
| Calls (real) | hunger or happiness under 25, energy under 20, poop over 30 min, or sick: the pet calls, with **20 min** to answer. A miss is a care miss; it asks again every 4 h. Each need has three phrasings, one a day. An asking pet gets its own column beside the bubble; with no room (a narrow card) its head goes in the bubble instead. | model `_calls`, `_start_call` | none | live |
| Fake calls / whines | nothing is wrong; scold teaches discipline, praise spoils | model `_wants_to_whine` | sitter settles whines (option) | live |
| Discipline | a bar; fades about 4 a day; less whining when high | model `_decay`, rates | none | live |
| Praise falloff | 8, 4, 2, 0 within 30 min | model `_praise_gain` | none | live |
| Poop | about 2 h after a meal; old poop costs health. Tidepool's water "clouds" instead. | model `_digest`, `_old_poops`; worlds.json `mess` | none | live |
| Sleep | lights-out switch / sleep button; naps; dozes off an hour past bedtime; energy-out falls asleep | model `_sleep`, `set_lights_out`; `switch.py` | bedtime, wake time (options) | live |
| Weight | 0–100, healthy 25–75; snacks tip it; extremes stop healing or make it sick. Status shows a word and a hint; a heavy pet is drawn about 6% wider, says so after a snack, and a game helps run it off. When too many snacks made it sick, the bubble says so. | model `weight_band`; card `weightLabel` | none | live |
| Sickness | health under 25, 4 misses in a day, old poop, too heavy; medicine cures; **never dies** | model `_sickness` | none | live |
| Sitter / away | nobody home for 2 h: frozen, no decay | model `come_home`; home `Presence` | away after (h), privacy | live |
| Resting | a per-pet switch, off by default: entering refills hunger, happiness and energy to 55 and settles an open call, at most once in 12 h (`REST_REFILL_HOURS`; a rest inside that only pauses); then no decay, no aging (no growing up, no laying, no birthday; the hatch day moves on by the days rested), no new calls, misses or sickness. Care, games, the link, visitors and finds go on; its day and night too. Eggs can't rest; the sitter's freeze wins. Card: "resting ☁" under the pet, slow breathing, its own idle lines and a leave line; a settings row (read-only on a shared screen). Assist: "taking it easy" | model `set_resting`, `_rest_step`, `_hold_times`; `switch.py` `RestingSwitch`; ws `rest`; card `restLabel`, `restRow`, `RESTING_IDLE`, `REST_LINES` | the switch (per pet) | live |
| Pat | tap the pet: wiggle and "hehe ♥"; the line takes turns day by day and now and then finds "the spot" | card `_pat`, `PAT_LINES` | none | live |
| Blanket / fan requests | the house makes it ask (rain, thunder, too cold or warm); buttons appear only then | model `requests`, `_answer_request`; card `REQUEST_LABELS` | comfort range (options) | live |
| The house answers | if mapped heating comes on while the pet is chilly (or cooling while it is warm), the house tucks it in as a blanket or fan would, at most twice a day (heat shows as a warm glow from the floor, cool as a frost in the top corners; neither crosses the pet, and both stay under reduced motion); fires `virtual_pet_house_answered`. A blanket for rain or thunder stays the player's. | model `_answer_request`; home | options: Heating, Cooling | live (needs mapping) |
| Chore treats | a ticked to-do item gives a treat (up to 5 a day) | model `give_treats`, `chores_done` | chore lists (options) | live |
| Fast-forward | admin debug action | `services.yaml` `fast_forward`; model `fast_forward` | admin only | live (dev) |

## 2. Moods and needs

| Feature | What the player sees | Where | State |
|---|---|---|---|
| Mood | egg, away, sick, asleep, calling, hungry, dirty, sleepy, bored, excited, cozy, content: a sprite and a bubble line (`reason`). Mood lines read as plain speech, and cozy and bored have lines per personality type. | model `mood_keyed`, `_reason`; `sensor.<pet>_mood` | live |
| "would like" row | the top need on the status page | card `_renderStatus` | live |
| Idle life | looks around, wanders, chases a speck, mutters, poses; a bounce after treats; now and then a line about a neighbour on the shelf | card `_idle`, `IDLE_ADDS` | live |
| Reactions to moments | hatching, growing up, a new trait, a missed call ("…oh, there you are ♥", never guilt); a new baby's first bedtime says "my first night here... ♥" once (live, on a baby under a day old, once per pet and generation on this browser) | card `_moment`, `FIRST_NIGHT` | live |
| Per-species child acts | e.g. the squirrel stuffs its cheeks | species.json `acts`; card `_reactFrames` | live (where art exists) |

## 3. Life stages and species

| Feature | What the player sees | Where | Switches | State |
|---|---|---|---|---|
| Stages | egg 30 min → baby → child (1 d) → teen (5 d) → adult (14 d). The header shows "Bird · adult · day 13"; a child's or teen's status page counts down to the next stage ("grows up: in about 3 days"). | model `life_stage`, rates `STAGE_STARTS` | none | live |
| 30 species, 6 worlds | 5 per world (the roster file lists 6 for Terrarium) | worlds.json `roster`; 30 `species.json` with `ready: true` | none | live |
| Beetle | on Terrarium's roster with sprites but no species.json, so filtered out | sprites/beetle; species.py `load_catalog` | none | hidden/partial |
| Egg choice | `select.<pet>_next_egg`: Surprise me or a creature of the egg's world. The lay confirm also offers the creatures this device has raised in that world, plus "surprise me" ("set in home assistant" if the pick was made there); the egg's screen says "a <creature> is coming". | `select.py`; model `lay_egg`; card `_eggOffer`, `SETUP_COPY`; `egg_roster` on the life stage sensor | the lay sheet, or the select | live |
| Lay an egg / generations | from day 21, well and home: a "lay an egg?" request button, then a lay sheet ("a new egg", "pick who hatches", "lay the egg" / "‹ not yet"). The request waits out of the way while the pet asks. The adult retires to the journal; one trait is inherited. | card `REQUEST_LABELS`, `_confirmed`; model `can_lay_egg` | none | live |
| Traits (16, ★–★★★) | learned from the house, up to 4; inherited ones deepen | model `_learn`, `trait_progress`; rates | depends on mapped entities | live |
| Trait flair | drawn around the pet (clouds, notes, embers…) about once a minute | card `FLAIR`, `_flair` | reduced motion: still | live |
| Upbringing | devoted / steady / scrappy, set at adulthood; small stat effect | model `upbringing`, `_score` | none | live |
| Temperament | per-pet trait-threshold multipliers ×0.6–1.6 | model (hatch) | none | live (invisible) |
| Birthdays | monthly in year one, then a yearly party with hat and confetti | model `pet_birthday`; card `PARTY` | none | live |
| Favourite snack | picked at hatch; "hazelnuts, my favourite!!" at most once a day | model `favourite_snack` | none | live |
| Tricks and promises | an adult learns a trick a month for its first three months and shows it off; every three weeks a teen or adult promises to practise something and shows it days later | model (fresh-expand); card | none | live |
| World change / rename in HA | Reconfigure (⋮ next to the pet): "Rename {name} or change its world". A pet still in its egg moves at once; a hatched pet's form labels the world "World for the next egg" and its next egg hatches there. A rename keeps the entity IDs; a name another pet here already has is refused (`name_taken`), and a card rename made while the form is open is not written back over. | `config_flow.py` `reconfigure`, `reconfigure_hatched`; `CONF_NEXT_WORLD` | HA dialog | live |
| Name the new generation | an egg or a baby can be named by anyone who may control the pet: after "lay the egg" a name sheet opens ("a name for the egg", "name it" / "keep <name>"), and the status page has a "name" row with "change" for the first day. The pet answers "<name>! i like it ♥". 1–20 characters with at least one visible one; refused with "another pet here has that name", "keep it short, and not blank", "only a new egg or baby can be named" or "this login can't name, sorry". | card `_renderNameSheet`, `_openName`, `SETUP_COPY`; `virtual_pet/rename`; `coordinator.async_rename`; `names.py` | per pet, first day only | live |

## 4. Worlds and shells

| Feature | What the player sees | Where | Switches | State |
|---|---|---|---|---|
| Six device shapes | egg, tank, house, porthole, lily pad, moon, each with a backdrop, deco and trim | worlds.json `shell/backdrop/deco/trim`; card `_mould`, `_dress` | none | live |
| Scene follows the sun and lights | day, night, dim; rain overlay; wind; at night and dim the status sheet and the bubble sink into the dark LCD; the backlight still lifts the sheet. | card `_renderSlide`; home `evaluate` | `sun.sun` | live |
| Shell picker | settings → "shell": world plastics, specials, prints; preview, then **use** (the world's own is the first tile) | card `_renderPicker`, `_saveShell`; `virtual_pet/set_shell`; model `shell_options` | per pet; read-only on a shared screen | live |
| "Earned" shells | glitter, glow, smoke, sunset, constellation, stars unlock **at teen by age** (the glow finish lights up in Home Assistant's dark theme, the OS's when HA has none) | model `shell_unlocked`, rates `SHELL_UNLOCKS` | none | live |

## 5. Games

| Feature | What the player does | Where | Switches | State |
|---|---|---|---|---|
| Game picker | play opens a picker (three games, fits 300–420 px) that remembers the last game | card `_pickGame`, `LAST_GAME_KEY` | none | live |
| Left or right | 5 rounds, 3 wins; mostly luck; a win cheers more than plain play | card `GAMES`, `_guess`; model `play_game`; rates | none | live |
| Higher or lower | 1–9, guess lo or hi; mostly skill | same | none | live |
| Berry dig | each round a leaf pile hides 6 berries and 2 bees: **dig** a leaf or **keep** the basket; 5 berries banked wins; pays a little more than higher or lower. ✕ **parks** a started dig: your next dig resumes it, however much later; each person has their own, and a second screen of the same person joins the dig already going ("oh! you dug there too ♪"). | card `GAMES` (`dig`); model `play_game` | none | live |
| Game of the day | each day a favourite game leads the list; a lucky number sparkles in Higher or Lower; a shiny berry now and then in the dig; a teen or adult sometimes adds a word after a game | card (fresh-expand); model | none | live |
| Game records | per-person best, favourite game (bond 6), games played and won in the journal | model `game_record`, `favourite_game` | none | live |
| `play_game` service | play from automations (`guess` / `end` rules per game) | `services.yaml` | none | live |
| Catch | removed | — | — | removed (was a hidden prototype) |

## 6. Personality and lines

| Feature | What the player hears | Where | Switches | State |
|---|---|---|---|---|
| 8 personalities (teen+) | mellow, sweet, bouncy, starry, old soul, fancy, charming, plucky. About half the time they reword hello, good morning, good night, sunset, a granted wish and the favourite snack. Idle moves are reweighted; cozy and bored mood lines and visitor greetings have lines per type. | card `PERSONA`, `_persona`, `IDLE_ADDS`; model `personality_for` | none | **partial** by design: idle chatter keeps the plain words (guide "Personality") |
| Upbringing lines | at most weekly, e.g. "you always looked after me ♥" | card `UPBRINGING_LINES` | none | live |
| Its own words, in turns | most everyday lines (waking, pat, praise, meals, wish, answer to "how was your day?") take turns day by day; a teen or adult often says them its own way | card `turnPick`, `_fresh` | none | live |
| Voice and typing | per-species opener ("tweet!"), typed at its own speed | card `_speak`, `OPENERS` | babble (this screen) | live |
| Babble | a tiny sound per letter, ramped in; its settings row shows "needs sounds" and is disabled while "sounds here" is off | card `BABBLE_KEY` | off by default, per browser; needs sounds here | live |
| Catchphrase | a per-species tag; at bond 7 the friend picks a new one | card `QUESTIONS`; rates `CATCHPHRASE_LEVEL` | none | live |
| Baby talk | simpler lines for babies and children | card `BABY`, `_babySet`; `virtual_pet/baby_talk` | per person, off by default | live |
| Greeting by name | "morning, Alex!" at most every few hours | card `_greet` | shared screen: no name | live |
| Wish of the day | up to 11 kinds, only ones the house can grant; reminded once; granting gives a sparkle and happiness | model `pick_wish`, `grant_wish`; card `WISHES`, `_wishMention` | depends on mapping | live |
| Dreams | about yesterday (a show, rain, a won game, a wish…), a visitor on a quiet day, or a dream of its own (a different one each morning for a month); the journal shows today's dream | model `dream_on_waking`; coord `DREAM_OF`; card `DREAMS` | none | live |
| Its day, in the evening | from 17:00 a teen or adult tells its day once per screen; the status page shows it too (before 17:00, today's dream) | card `_renderStatus` (`stoday`) | none | live |
| While you were out | after 3 h away, at most two bits; after two days away, a hop and the news first | card `_awayNote` | none | live |
| Passing moments | sunrise and sunset, TV ("ooh, Bluey!"), weather changes, forecasts, first snow, frost, fog and the first warm day | home `HouseMoments`, `forecast_moment`; coord | mapping | live |
| Season starts | "first day of spring! ♪" once a season (first three days, awake; none in the tropics), a sparkle and a journal memory; today bit "saw spring begin" | people `season_start`, model `season_start`; card `SEASON_START_LINES` | none | live |
| House signals | a robot vacuum goes by ("a robot's zooming around!"), a washer, dryer or dishwasher finishes ("the dishes are all done!"); a doorbell press makes it startle (Notice doorbells, on by default, existing pets too; any `event.*` with device class doorbell; at most one per 30 minutes per pet; said live on open cards and kept nowhere, never on the bus); the moon from the date when no sensor is mapped (full and new moon nights) | home (vacuum, appliance and moon logic); card | options: Notice robot vacuums (on), Notice doorbells (on), Washer/dryer/dishwasher, Idle power, Moon | live (appliances need mapping) |
| News | `virtual_pet.share_news` headline in the bubble. It sits on the last-care sensor for a while unless Keep house words off sensors is on (then open cards only). | home `news_text`; `services.yaml` | automation; privacy: Keep house words off sensors (off) | live |
| House moments | `virtual_pet.react` or the house moment blueprint: pick an entity and what it is (15 categories plus Custom; no garage door), and the pet says a line, reacts and shows a house effect. Oven, coffee, EV charger, delivery and timer are card only (never on a sensor or event). Steps aside (`native`) for entities in its Heating, Cooling or appliance settings. | `react.py` (rules); coord `react`; card `HOUSE_MOMENT_LINES`, `HOUSE_CATEGORY`; guide "House moments" | automation or blueprint; privacy: Keep house words off sensors (off) | live |

## 7. Bonds and people (per HA login)

| Feature | What the player sees | Where | Switches | State |
|---|---|---|---|---|
| Bond levels 1–10 | "you two" in 5 hearts; warmer hello (2), hop (3), nickname (4), favourite game (6), catchphrase choice (7), hearts (8), photo (10) | model `add_bond`, `bond_level`; rates; card `BOND` | not on a shared screen | live |
| Friend home | cheers when you come home (level 3+) | coord; card `CHANNEL_ONLY` | person linked to the login | live |
| Aimed wish | some wishes are "for" a close friend | model `pick_wish` (`WISH_FOR_CHANCE`) | none | live |
| Questions | sleep, day, dream pick, rain or sun guess, favourite weather, season and visitor; at most one in the morning and one later; level 2+ | people `choose_question`; card `QUESTIONS`, `_ask` | level 2+ | live |
| Follow-ups | "anything big this week?" (cheers you on that day, asks how it went), "anything fun this weekend?", "what should we play tomorrow?", "should I learn a new trick?"; a softer morning after a tough day. Only the date or the pick is kept. | people; `virtual_pet/follow`; guide "Privacy" | level 2+ | live |
| Remembered favourites | "it's snowing, your favourite!!"; your favourite visitor gets its own hello | card `NOTES.fav_weather/season` | none | live |
| Your birthday | asked at level 4; a line and a tune on the day; optional phone message | model `birthday_today`; card settings rows | birthday on my phone (off) | live |
| Friendship anniversary | "we've been friends for a month! ♥" | model `friends_for` | none | live |
| Best-friend photo | level 10, teen+, once per generation; in the journal; save | model `take_photo`; card `_renderPhoto` | not on a shared screen | live |
| My day | positive notes from phone health data (steps, bike, sleep, rain walk, zone return, early alarm, send-off) | wellbeing `notice`; people; card `NOTES` | per person, opt-in | live |
| Friends this week | status row of 5 hearts for the pet's week beyond the house: a visitor the card played (any screen, `virtual_pet/greeted`; a look inside the window still counts), a neighbour met over the infrared link. A tap on the row says what it counts. Cosmetic, hides until there is a friend. | model (social days); card `_renderStatus`, `_visitorReport`; `virtual_pet/greeted` | none | live |
| Shared screen | per browser: nothing personal, no visit counted; a note under the switch says which setup suits a family tablet | card `SHARED_KEY`, `_goShared` | settings → this screen | live |
| Memory | per person: picks and fixed tags with dates, kept until forgotten (no typed words, no names); the household's option per pet. settings row "remember me" (two-tap off); M1a: the record, the switch, the option and its erase; M1b: the one-time ask at bond 4 ("can i remember what you tell me?", held while baby talk is on), "great" kept for door 2, picks from the person's own screen, doors 2, 4, 5, 12 and door 6 (favourite weather or season, once each) | people `memory`, `remember`, `memory_door`, `memory_ask_due`; `virtual_pet/memory`; options "Pets may remember"; card `MEMORY_ASK`, `MEMORY_DOORS`, `MEMORY_TOLD`; guide "Privacy" | per person (off); per pet option (on) | live |
| Favourite pet (open on) | per person: the pet their card opens on (beats the shelf's place on every load; a copy under `hatch-open-<user>` opens it before the channel speaks), a ♥ on its head dot (own screens, 2+ pets), the settings row "♥ open on <pet>"; it speaks for them on the phone for the birthday and the send-off when it may. An admin's household default "shared screens open on <pet>" (copy `hatch-open-house`). No ranking word; never on a state, the bus or diagnostics; "forget my data" takes the person's, not the house's | people `open_on`, `house`; coordinator `async_set_open_on`, `_voice_pet`; ws `open_on` (scope me / house, admins only); card `_openOnSync`, `openOnKey` | settings → for you (2+ pets) | live |
| Forget my data / birthday | two-tap erase | `virtual_pet/forget_me`, `forget_birthday` | not on a shared screen | live |
| Private channel | the bond and the rest only over the user's own websocket | `channel.py`; `virtual_pet/subscribe` | none | live |
| "Can I call your phone?" | after a missed call, asks once (HA app users, never someone already notified) to turn "notify me" on | card `QUESTIONS` (`phone`) | asked once | live |

## 8. Visitors, finds and gifts

| Feature | What the player sees | Where | Switches | State |
|---|---|---|---|---|
| World visitors | 4 days in 7, a world creature (robin, heron, shooting star…; 3 per world, 18 in all) drops by in a 3 h window. The pet greets it. A visitor whose window passed unseen still comes by live when you next look in that day (a night or dimmed screen gets a line instead). | model `daily_visit`, `credit_visit`; card `VISITOR_PLAY`, `_visitorStart`, `_visitorGreet`, `_visitorMissed` | none | live |
| Visitors become friends | seen on three days on a screen, a visitor greets with its own lines; stays longer on a shared screen; rare days bring two together, or a guest from another world; the pet may save a crumb, let it watch a dig or tell a linked pet | model; card (fresh-expand) | none | live |
| Finds and basket | about 2.4 finds a day go in a basket on the screen; a tap reveals them | model `roll_find`, `pick_find`, `collect_basket`; card `_basketTap`; `virtual_pet/collect` | release switch `FINDS_SHOWN` in the card is **on** | live |
| Visitor leaves a find | a third of the time when its window ends | model `leave_find` | same | live |
| Gifts | bond 3+: every 6–8 days a find set aside for one person; "made this for you ♥" | model `gift_tick`, `pick_gift`, `take_gift`; card `_giftTake` | with the switch off a gift **waits on the server** | live |
| Collection page | journal → "visitors ›" (reads "finds ›" while finds are shown): the world's visitors (met or silhouette) and its finds | card `_renderFinds`, `collectionTiles`; `virtual_pet/collection` | with the switch off: **visitors only** | live |
| Find art | the find and basket pictures are final in all six worlds | frontend/ui | none | live |
| Bird visits from BirdNET-Pi | on the roadmap | guide "Roadmap" | none | not built |

## 9. Seasons and holidays

| Feature | What the player sees | Where | Switches | State |
|---|---|---|---|---|
| Halloween (20–31 Oct) | bunting, a carved jack-o'-lantern of the day, cobwebs, bats, mist, costumes, a ghost, candy snacks, countdown, trick or treat | card `SEASONS`, `_renderSeason`, `_costume`, `_seasonVisitor` | card `seasonal: false` or the editor's "Seasonal decorations"; holiday names | live |
| Thanksgiving (US, 12 days before to the Sunday after) | garland, leaves, geese, a turkey, pumpkin pie, thanks | same | same | live |
| Winter lights (1–31 December) | lights, a lamp, frost, a snow hare, star cookies; names Christmas, Hanukkah and New Year's Eve | same; `HANUKKAH` | holiday names | live |
| Holiday phone mornings | Halloween, Thanksgiving, and winter lights on 1 and 21 December | notify `HOLIDAY_MORNINGS` | notify me | live |
| Seasons for favourites | "it's autumn, your favourite!"; no season talk in the tropics | people `season` | none | live |
| Spring and summer events | none | `SEASONS` has 3 entries | none | not built |

## 10. Device charm

| Feature | What the player sees | Where | Switches | State |
|---|---|---|---|---|
| Power-on boot | pale LCD, the HATCH logo, "▶ tap to start"; once per browser and version | card `_bootStart`, `BOOT_KEY` | reduced motion skips the fill | live |
| LCD grid | dot-matrix overlay | card `LCD_KEY`, `_lcdPitch` | screen effects here; off with high contrast | live |
| Ghosting | a fading trace on moves | card `_ghosting` | screen effects; off on mono and with reduced motion | live |
| Mono screen | four greens | card `MONO_KEY` | per browser; Safari and iOS can't draw it | live/partial (no Safari) |
| Backlight | a shell nub lights the screen for 3 s | card `_backlight`, `BACKLIGHT_MS` | none | live |
| Infrared link | two or more pets: once a day per pair, a beam and a visit; kindred personality pairs get an extra line; the day's first waits for someone watching; with exactly three pets the end pets meet across the wrap; a guest from the left mirrors the visit | card `_linkStart`, `KINDRED`, `LINK_AFTER_MS` | none | live |
| Low battery after an HA restart | flicker and a battery gag | card `_powerGag`, `POWER_KEY` | reduced motion: no flicker | live |
| Sounds (chirps) | call, hatch, trait, win; quiet 21:00–08:00. Chirps stay square but run through one 3 kHz lowpass and ramp in over 5 ms; two cards on one pet chirp once. "sounds here" is the master: babble plays only with it on. | card `SOUND_KEY`, `_chirp` | sounds here (off) | live |
| Swipe, arrows, dots | multi-pet shelf; the dots are the pets' heads (the one on show in full colour); on a swipe the name and line change when the new pet is half there | card `_layout` | card `devices` | live |

## 11. Journal, collection, status and settings

| Screen | Contents | Where | State |
|---|---|---|---|
| Header | name, species · stage · day N, "Status" pill; a long name wraps and the pill keeps its size | card `_build` | live |
| Status (tap the screen or the pill) | would like, wish, today (its day, or the dream), you two, name (an egg or a baby: "change"), friends (below the meters, a 44 px target), hunger and happy hearts, energy, health and discipline bars, weight word and hint, traits n/4, learning, upbringing with "missed calls" and "ignored whines", personality, next egg and stage countdown, last 3 care lines, journal › | card `_renderStatus` | live |
| Settings (gear) | In this order. **This screen**, in two parts: *sound* (sounds here, babble) and *look* (screen effects here, holiday names, mono screen, big text). **For you** (not on a shared screen): notify me, my day, my birthday, birthday on my phone, baby talk, the remembered favourites, ♥ open on <pet> (2+ pets; admins also "shared screens open on <pet>"), my data. **For <pet>**: notices (the kinds of thing the house shows it, never an entity; admins get "connect more ›", which opens that pet's own entry), bedtime (read only, "about … · up …" in the viewer's 12 or 24 hour format, also on a shared screen), shell (read only on a shared screen). **Shared screen**, at the foot: the switch, a note about a family tablet, and for an admin "sensor privacy is in the pet's options". | card `_renderSettings`, `sleepLine`; life stage sensor `sleep_times` | live |
| Big text | larger words on status, journal and settings; per browser, off by default | card `bigtext` class | live |
| Journal | "this week" strip (dream, weather, and the visitor once finds are shown), the world's roster (silhouettes if unraised in this home), "every world ›" page, photos, generations (latest 4 + older), memories (first snow, frost, fog, first warm day, each season's first day), visitors/finds › | card `_renderJournal`, `_weekStrip`, `_renderEveryWorld` | live |
| Collection | see §8 | card `_renderFinds` | live |
| Card editor | picks devices and has a "Seasonal decorations" switch | card `HatchPetCardEditor` | live |
| Empty card | no pet found: an admin gets "add a pet ›", which opens Home Assistant's add-integration dialog for this integration | card `SETUP_COPY.addPet`, `ADD_PET_PATH` | live |

## 12. Notifications and phones

| Feature | What | Where | Switches | State |
|---|---|---|---|---|
| Calls with action buttons | Feed, Medicine, Lights out, Play or Scold; cleared when answered | notify `CALLS`, `actions` | notify me (per person, per pet) | live |
| Re-call | an ordinary notification | notify `Recalls` | same | live |
| Life events | hatch, grow up, traits, first snow and frost, new egg | notify `message` | same | live |
| Holiday mornings | Halloween, Thanksgiving, winter lights (1 and 21 December) | notify `HOLIDAY_MORNINGS` | same | live |
| Send-off | "rain today, take an umbrella", at most 3 a week, from the closest pet or the one the person's card opens on | notify | notify me + my day | live |
| Birthday | from the closest pet | notify `birthday` | birthday on my phone | live |
| Welcome | sidebar note (titled "<name> moved in ♥") + phones of people who turned on notify me for another pet. The note says where the pet shows: with no dashboard named by any setup it asks you to add the pet shelf card to one; the first pet with a dashboard gets the link plus "If it isn't there, add the Hatch at Home pet shelf card."; a later pet on a dashboard the house already named gets the link alone. | notify `welcome`, `welcome_no_dashboard`; coord `_welcome` | none | live |
| Dashboard to open | the tap target | options → notifications | config | live |
| Visitors, finds, gifts, appliances, robots | **no** phone message | — | — | not built |

## 13. HA side

| Feature | Where | State |
|---|---|---|
| Sensors: hunger, happiness, energy, health, discipline, weight, mood, life_stage (many attributes, incl. `senses`, `sleep_times` and `week`), poop, care_misses, last_care, debug (off by default) | `sensor.py`; strings.json `entity.sensor` | live |
| Binary sensors asleep, calling, sick; switches lights_out and resting; select next_egg | `binary_sensor.py`, `switch.py`, `select.py` | live |
| Buttons feed, snack, play, clean, medicine, scold, praise, blanket, fan, lay_egg | `button.py` | live |
| Services fast_forward, notify_me, visit, my_day, set_shell, play_game, share_news, react | `services.yaml` | live |
| Websocket commands answer, follow, forget_birthday, birthday_phone, baby_talk, photos, forget_me, subscribe, notify_me, linked, greeted, my_day, rest, set_shell, rename, collect, collection | `__init__.py` | live |
| About 50 bus events (`virtual_pet_*`), including `virtual_pet_season_start`, `virtual_pet_house_answered`, `_robot_out`, `_robot_home`, `_appliance_done`, `_house_moment`, `_call_settled`, `_found`, `_rest_started`, `_rest_ended` | coord `_fire`; guide "Events" | live (all in the guide) |
| Options "What <name> notices": a menu of seven topics, each its own page: Bedtime (bedtime, wake time, bedtime lights, motion), People and privacy (home zone, off to the sitter's after, sitter calms a fussy pet, keep presence private, keep house words off sensors), Weather and air, The pet's room (lights, fireplace, light sensors, TVs, music), The house helps (heating, cooling, robot vacuums, doorbells, machines, idle power, chore lists), Moon and sky, Where notifications open | `config_flow.py` `PetOptionsFlow`; `topics.py`; strings.json | live |
| Repairs: missing entities (fixable: submit to forget them; the text names the topics to open instead), world not ready, damaged save (×3), people damaged | strings.json `issues`; `repairs.py`; `backup.py` | live |
| Diagnostics (redacted) | `diagnostics.py` | live |
| The card file: served at `?v=<version>-<8 hex of the file's hash>`, so a changed card is fetched even when the version was not bumped (taken once at start-up; a missing file is logged, and the URL carries the version alone) | `__init__.py` `_card_hash` | live |
| Display name "Hatch at Home" in `manifest.json` and `hacs.json` (domain `virtual_pet` and every entity ID unchanged) | manifest | live |
| Assist: VirtualPetStatus and VirtualPetCare intents (stage and day, wish, the day's visitor; a word that fits two pets gets "Which pet, A or B?"), sentences file, LLM tools | `intent.py`, `llm.py`, `docs/custom_sentences` | live (English only) |
| Blueprint "Hatch at Home: calls into the house" (lamps, sound) | `blueprints/automation/virtual_pet/call_response.yaml` | live (import by hand) |
| Blueprint "Hatch at Home: house moment" (an entity and what it is) | `blueprints/automation/virtual_pet/house_moment.yaml` | live (import by hand) |

## 14. Accessibility

| Feature | Where | State |
|---|---|---|
| Reduced motion: calm visitors, link, battery, no typing, no ghosting, still flair | card (`prefers-reduced-motion` rules, each checked by the card-check) | live |
| 44 px hit areas: toys, game buttons, back rows, journal links, backlight, slide dots | card CSS | live |
| aria labels on hearts and bars ("54 of 100"), aria-pressed switches, `role=status` feedback | card `_renderStatus`, `_renderSettings` | live |
| Screen readers hear words, not babble | guide "Its voice" | live |
| Big text switch for status, journal and settings | card `bigtext` | live |
| Text size: status, journal and collection text is a 10–13 px pixel font (Tiny5) inside the LCD | card CSS | live; readability is a concern, big text helps |

---

## Where the docs and the code disagree

Checked against the guide, README and how-to at `f2c5e8a8`. Items fixed since 0.41.0
(switch locations, care misses on the status page, rosters, `virtual_pet_found` in the
events list, how-to button names and meters, Catch and its YAML flag) are gone from this
list.

1. **Games in the guide's intro and roadmap.** The "Status" paragraph at the top says
   "two games (left or right, higher or lower)", and roadmap line 6 lists only those two.
   There are three: the berry dig is in "Using the card" and the README.
2. **Finds, basket, gifts and the collection page** are in none of the README, guide or
   how-to. The guide's Events entry no longer says finds are hidden,
   and the journal paragraph mentions "while finds are shown", but nothing describes the
   "visitors ›" page the journal links to.
3. **Roadmap is thin.** Phase 4 still says "in progress" with BirdNET-Pi visits to come;
   phase 7 does not name the daily extras (evening line, tricks, promises, dream stories),
   the friends-this-week row, or the house signals (robot vacuums, machines, the house
   answering a request).
4. **"screen effects here" location.** "Little touches" says the switch is "on the status
   screen"; it is in the settings sheet's "this screen" part, under "look" (the other
   paragraphs say so correctly).
5. **How-to status view.** It promises "age" on the status view. Age is in the header
   ("day 13"); the status page has a countdown to the next stage instead.
6. **Time-relative wording in the guide.** The weather-forecast option row says "a pet
   made before this update"; "this update" has no date and will mislead later readers.
7. **Terrarium's beetle.** `worlds.json` lists six Terrarium creatures; the beetle has
   sprites but no `species.json`, so the game offers five and the guide's "five per
   world, 30 in all" is right in practice.
