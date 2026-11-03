# Card bench

Screenshots of the **real** `hatch-pet-card.js` (built from `src/card/` by
`scripts/bench.js` itself) without Home Assistant: fast
(about 100 ms a shot) and deterministic. For art reviews, shell work and README
shots. It loads the card unchanged, gives it a fake `hass`, and serves sprites,
`worlds.json` and fonts from this repo. Nothing leaves localhost.

## Run

The repo has no `node_modules`; point `NODE_PATH` at a checkout with Playwright
(and its Chromium):

```sh
export NODE_PATH=/home/poe/github/relink/node_modules
node scripts/bench.js --preset shells     # 144 shots, ~8 s
node scripts/bench.js --preset species    # 1230 shots, ~35 s
node scripts/bench.js --preset nature     # species nature N1: each sky's reaction line (both lines, 330 and 300, calm), the sunset and morning lines per clock, a baby and a child with none
node scripts/bench.js --preset ui         # status, game picker, bubble
node scripts/bench.js --preset finishes   # 576 shots: every shell finish, every world
node scripts/bench.js --preset settings         # the gear's sheet, 420/330, day/night
node scripts/bench.js --preset settings-shared  # the same on a shared screen
node scripts/bench.js --preset resting    # 21 shots (R1): the label and breathing pose at 420/330/300, night, mono, idle and baby lines, sick and asleep (no label), the status line, the settings row at 420/330/300, night, mono, big text, off, shared (read-only)
node scripts/bench.js --preset settings-s7 # 18 shots: the sheet's sub-headings, bedtime row (12/24 h) and N24 at 330 and 300, day, night, mono, big text
node scripts/bench.js --preset lay        # 9 shots: the lay sheet (settings S2), two worlds at 420/330, big text, a pick, a pick made in HA, a waiting world
node scripts/bench.js --preset name        # 25 shots: the name sheet (settings S3) at 420/330/300, empty and 20-character, each error line, baby, night, dim, big text, mono; the status page's name row
node scripts/bench.js --preset picker     # the shell picker: egg (locked) and teen, 420/330
node scripts/bench.js --preset winter     # winter lights at 330: worlds day/night, mono night, hats, snow hare, auto, holiday names
node scripts/bench.js --preset seasons    # ha-signals H7: the eight season-start lines at 330, the journal's season labels at 420/330
node scripts/bench.js --preset visitors   # 28 shots at 330: every world visitor greeting, beats, night, calm, baby, child
node scripts/bench.js --preset visitors-friends --sheet   # 18 shots: every visitor greeting as a friend (fresh-expand E3), a sheet per world
node scripts/bench.js --preset visitors-rare --sheet      # 11 shots: a pair day per world and a guest from the next world (fresh-expand E10)
node scripts/bench.js --preset finds      # 74 shots: every find at reveal size, the baskets, sparkle, V3, baby, calm, compact
node scripts/bench.js --preset gifts      # 11 shots: a gift's first look, V5 (longest name), V6 made/found, V7 baby, calm, compact, asleep
node scripts/bench.js --preset look       # 8 shots at 330: a fresh morning look and a resumed tab at 5, 10, 20, 30 s (fresh-moment)
node scripts/bench.js --preset collection # 21 shots: the finds page, each world at 420/330, shared, empty, all met, mono, an older server
node scripts/bench.js --preset bigtext    # 18 shots: "big text" on, every status-box page at 420, 330 and 260
node scripts/bench.js --preset everyworld # 10 shots: the journal's "every world" page, none / some / all raised, 420 and 330, big text
node scripts/bench.js --preset dig        # 22 shots: the Berry dig at 420/330/300, calm bee, the picker at 300-420
node scripts/bench.js --preset feed       # care B1: 135 shots of the feed scene: variants A-D every 200 ms, the push-away before and after the gate, the hold and exit, 300 px with poops, the child ladder, water and night-sky worlds, extras, breakfast and supper, resting, big text, mono, reduced motion
node scripts/bench.js --preset bowls      # care B1: 480 close-ups, every feed bowl at full, 2/3, 1/3, gone (330/420, day/night), a sheet per world and scene, and the clip's pass rule (bowl-pass.json)
node scripts/bench.js --preset mono       # the mono screen: 2498 shots, ~2.5 min, plus the pass rule
```

PNGs land in `dev/bench/out/` (gitignored; `--out DIR` to move it). A preset
also writes contact sheets to `out/sheets/` (`--no-sheet` to skip): `shells-420`,
`shells-330`, `ui`, `picker-card` and `picker-screen`, one `finishes-<world>` per world (each finish on that
world's own shape, 420 and 330, day and night), and one `species-<id>` per species (rows run stage by stage,
columns mood by mood). `--only TEXT` keeps only shots whose name contains TEXT.

## One-off shots

```sh
node scripts/bench.js --species fox --stage adult --mood hungry --world woodland \
  --shape moon --color '#aa3366' --scene night --width 330 --dpr 2 --name fox-night
node scripts/bench.js --shots my-shots.json
```

A shot list is an array of shots, or `{ "defaults": {...}, "shots": [...] }`.
A shot (all optional):

| field | meaning |
| --- | --- |
| `name` | output path under `out/`, without `.png` |
| `species`, `stage`, `mood`, `world` | the first pet (default: the world's first species, adult, content, woodland). Stages: egg baby child teen adult. |
| `pet` | more of the first pet: `name`, `age_days`, `flags`, `energy`, `weight` (none by default: the row shows –), `hunger` (none by default; a feed scene needs one), `hatch_minutes`, `raised` (ids, or `"world"`: three of its world's), `next_egg` (a name), `next_world` (a name), `lay` (`true` or `{egg_world}`: the lay request, the next-egg select and `egg_roster`; settings S2)... |
| `pets` | a number (extra pets are children from the world's roster) or an array of pet overrides; the first is on show, the card gets its dots |
| `empty`, `admin` | `empty: true`: no pets at all (the first-run card, its "add a pet ›" for an admin); `admin: false`: the viewer is not an admin (default admin). The fake devices carry a `config_entries` id |
| `shell` | `{shape, color, bezel, finish}` over the world's own; `finish: "none"` drops it. Shapes: egg tank house porthole pad moon |
| `scene` | `day` (default), `night`, `dim` (lights out), `rain` |
| `season` | `false` (default: no seasonal touches), `"auto"` (by `time`), or a season key such as `halloween` |
| `time` | pinned clock, ISO (default `2026-06-15T12:00:00Z`; the browser runs in UTC) |
| `width` | card width in px (420, or 330 for the compact layout); `dpr` pixel ratio |
| `view` | `card`, `status` (status screen), `settings` (the status screen's gear sheet), `picker` (the sheet's shell picker; needs `shellOptions`), `journal` (see below), `everyworld` (the journal's "every world ›" page; `journal: {raised}` sets what's drawn), `collection` (the journal's "finds ›" page; see `collection`), `games` (game picker), `lay` (the lay sheet: needs `pet: {lay: true}`), `name` (the name sheet a lay opens, settings S3: an egg or baby pet with a `generation`; `nameText` is what is typed in the field, `rename` an error code the fake server answers a tap on "name it" with) |
| `shellOptions`, `shellFinish`, `shellLocked` | the lead pet's `shell_finish_options` (finish keys it may wear), `shell_finish` (its pick, default none: the world's own) and `shell_locked` (`{key: stage}`). Without `shellOptions` the card has no shell row, as with an older server |
| `preview` | in the picker, the tile tapped: that finish on the live shell, unsaved (`""` is the world's own) |
| `scroll` | a selector in the status box brought into view (the picker scrolls), e.g. `.tile.now` or `.sec[data-group="specials"]` (its top just under the back row) |
| `journal` | `true` (`--journal`, which also sets `view: "journal"`) or an object over the journal attributes the card reads (`raised`, `journal`, `generation`, `traits`, `memories`) |
| `mine` | `true` (`--mine`) or an object over it: the viewer's own view the private channel would send (a bond, notify me, my day, my birthday kept), so `you two` and the sheet's personal rows show. An array gives each pet its own (`[{open_on: true}, {}]`: the favourite's heart on the first pet's dot only) |
| `power` | the low-battery gag pinned mid-play: `battery` (one bar, first line) or `line` (full battery, second line) |
| `costume` | `{season, art, frame}`: the costume put on through the card's own `_costume` (frame 1 or 2 showing). `bench.js` writes the seat it used (`_frames(s)[0]`, `drawn`, `_hatSeat`) to `<name>.json` beside the PNG |
| `pet.personality`, `hatched_on`, `upbringing` | the first pet's type (teen or adult), birth date and upbringing as `sensor.life_stage` carries them; `pet.reason` / `pet.reason_key` put the server's mood sentence on `sensor.mood`, so the mood line (P2b) shows through the card's own `_say` |
| `idle` | `{mood, draw}`: the pet's idle mumble through the card's own `_idle` (a mumble, the type's side of the coin). With the pet's sky flag up (`pet.flags`) it is the sky reaction instead (species nature N1); `draw` (0..1) is the draw after the delay, which picks one of its two lines |
| `moment` | a public moment (`{type: "sunset"}`, `{type: "good_morning"}`) put through the card's own `_moment`, the line it says shown in the bubble (species nature N1: the clock lines) |
| `ask` | a question kind (`catchphrase`) put through the card's own `_ask`, so its answer buttons show |
| `note` | on `settings` / `picker`: a line shown in the feedback bubble (the pet's head and the note, under the back row), through the card's own `_statusMessage` |
| `afterChange`, `afterWait` | on `settings`: the sheet closed after that change (a `SETTINGS_REACT` key: `monoOn`, `monoOff`, `effectsOff`, `shell`, `sharedOn`, `notifyOn`), through the card's own `_settingsChanged` and Status chip, so the pet perks and says its line (settings UX F14); `afterWait` ms to let it type (default 1500) |
| `haDark`, `os` | HA's dark mode (`hass.themes.darkMode`: `true`, `false`; unset = HA says nothing) and the OS's colour scheme (`"dark"` / `"light"`), for the glow finish's dark look (UX7 F6) |
| `say` | text put in the bubble (`""` clears it) |
| `fx` | a house effect class held on the screen (`fx-heat`, `fx-cool`, `fx-suds`, `fx-tumble`, `fx-chime`), its animation paused 1 s in; with `motion: reduce` there is none, so it just shows |
| `clip` | `card` (whole card, default), `device` (the toy), `screen` (the LCD only) |
| `crop`, `tile` | `crop`: `[x0, y0, x1, y1]`, fractions of the clip, for a close-up (the bowls preset's bowl); `tile`: its width in px on a contact sheet |
| `motion` | `reduce` emulates `prefers-reduced-motion: reduce` (`--motion reduce`) |
| `game`, `digReplies`, `digTaps` | `game: "dig"`: a Berry dig started through the picker, answered by `digReplies` (play_game replies in order; default: round 2, 2 banked, basket 2), then `digTaps` (`"dig"`/`"keep"`) played; held on the last reply (a bee still shows). `game: "left_right"` / `"higher_lower"` the same way (default start: round 0, number 5; `digTaps` `"left"`/`"right"`, or `"lower"`/`"higher"`; a reply is `{result: "ok", game, round, rounds: 5, wins, correct, went / number}`) |
| `lcd`, `booted`, `mono` | per-browser settings, see below |
| `senses` | the kinds the house shows the pet (`["weather", "tv"]`; `[]`: "just the clock"), for the sheet's "notices" row |
| `sleepTimes`, `timeFormat` | the sheet's "bedtime" row (settings S7): `sleepTimes` is `{bedtime, wake}` as `sensor.life_stage` carries them (default 23:00 and 07:00; `false`: an older server, no row); `timeFormat` is `hass.locale.time_format` (`"12"`, `"24"`; unset: the language's own) |
| `social` | the social meter's level, 0-10 (`7`: three and a half hearts), for the status page's "friends" row |
| `bigText` | `true` (`--big-text`): the "big text" switch on (larger words on the status box's pages) |
| `classes` | an array of classes put on `.screen` last, before the transitions finish: `faded`, `raining`, `lit`... (the bench's `scene: "rain"` is woodland's rain backdrop without `raining`) |
| `petClasses`, `petAt` | classes put on the pet itself (`["droop"]`), and `petAt` ms to pause its animations at (keyframes and the pet's own CSS transitions: `look`, `wander-l`), so a mid-motion frame is the same every run |
| `attentionAt` | ms: the call icon as it arrives (`.attention.arrive`: the pop, then the pulse), paused that many ms in. Needs a calling pet (`mood: "calling"`) |
| `petStretch` | a mockup only (gaps-seams Q2): the pet drawn that many times wider (`1.06`), its height kept, over the species' own scale |
| `react` | `fed`, `praised`, `refused` or `tucked`: that care reaction (PR 3c, teen/adult/baby only) started through the card's own `_reactFrames`: the stage's excited/bored/cozy frame and its move; `petAt` pauses the move mid-way |
| `patBox` | `true`: the pat's clear hit box (PR 3b) outlined in dashed magenta; it moves with `petClasses` such as `go-left` or `wander-r`, and a state that hides it shows no outline |
| `beam` | `true`: the infrared beam held mid-flight (400 ms in, the head over the host's shell) by the card's own `_linkBeam`, no visit around it. Use `pets: 2` and `clip: "card"` |
| `link` | the infrared visit greeting caught as the visit screen opens: `{waves, wait, rolls, say}` (`waves` is put on both species, `wait` is ms to hold, default 150; `rolls`: what `Math.random` gives `_linkStart` first, all 0 for type lines and a kindred extra; `say: "host"` or `"extra"` puts the host's queued line in its bubble and holds the visit there; with `wait: 1900` the guest's reply shows too, until the extra hides it). Give the guest `pets: [{}, {stage: "adult", personality: "sweet"}]` for a kindred pair |
| `care`, `careAt` | a `medicine`, `clean` or `feed` scene paused at `careAt` ms (default 1500); a scene over before `careAt` is ended, so the shot is the card after it. A feed needs `pet.hunger` (under 95). It is played from 0 on the bench's own clock (10 ms steps; a beat's timers and CSS animations seeked with it), so a shot is byte-identical every run |
| `bowlStep`, `bowlRim` | the feed bowl on the floor at step 0 (full) to 3 (the food above the rim gone) of its clip, through the card's own `_bowlClip`; `bowlRim` stands in for species.json `bowl_rim` |
| `answer` | `{at, result}`, or a list of them (an ok, then a full: the push-away after the gate): the server's answer to a `care` scene at that scene ms, through the card's own `_sceneAnswer` (`"ok"`, `"full"`...). With none, a scene with a gate (feed 650 ms) holds there: `careAt` past the gate is the waiting sway, 2000 ms past it the exit beat |
| `acts`, `missing`, `reactWait` | a fake species.json `acts` (`{eat: [stages], cheer: [...]}`) on every pet; sprite names (`adult_eat_1`) the server 404s; ms to wait for sprite probes before the shot. `link.cheer: true` runs the full visit (not calm) so the "hi hi" cheer plays: use `wait: 2000` |
| `bubblePop` | a clean's extra bubble (fresh-expand M-b) through the card's own `_bubblePop`, paused at a share of its 1.2 s (`true`: .7, up and about to pop) |
| `patTap` | `true`: one pat through the card's own `_pat` (R2: `acts.pat` shows ~900 ms). With `acts`, the new poses (`pat refuse aww ready splash`) are served the species' `eat` frames, bench only. `react` also takes `lost` (acts.aww) and `ready` (acts.ready); `care: "clean"` with `careAt: 2000` shows `acts.splash` |
| `visitor` | a world visitor pinned through the card's own `_visitorStart`/`_visitorGreet`, timers stopped, moves paused: `{id, beat: "arrive"\|"greet"\|"leave", frame: 1\|2, side: "left"\|"right"}` (default its world's first, `greet`, left). With `motion: reduce` it is the still visit. Baby talk needs `storage: {"hatch-baby-talk-bench-user": "on"}`. `friend: true` seeds this pet's sighting days (E3) so the greet is a friend line. `pair: true` makes it a pair day (E10 V-b: a friend of its world comes in from the other side); `guest: "<world>"` brings `id` from that world as a guest (V-c) |
| `seasonVisitor` | the season's own visitor (the turkey, the snow hare) through the card's own `_seasonFly`, paused: `{season, at, frame, side}` (`at` 0-1 of its crossing, default .45; its first greet in the bubble) |
| `collection` | the finds page's `virtual_pet/collection` reply (`--collection` also sets `view: "collection"`): `true`, part met (two visitors; three plain finds and one with a `when`; gifts on a met find, an unfound one and the gift-only one), `"empty"`, `"error"` (an older server: the page goes back to the journal), or `{visitors, finds, gifts}` (`finds` ids or an `{id: day}` map). `gifts` reach only an unshared screen, as from the server. `scrollEnd: true` scrolls the status box to its foot |
| `house`, `basket` | the house view the private channel would send (`house`, an object over it), and `basket`: how many finds wait (`house.basket`, 0-3), so the basket shows (visitors v2 §3) |
| `look` | a look played over time by the card's own tick: `{at, resumed, seenAgo}`. The driver moves the pinned clock in 250 ms steps to `at` seconds and ticks each step (the first look, greeting, idle and flair run; the channel counts as heard). `resumed: true` is a tab back after 3 h hidden (fresh-moment 1); `seenAgo` is hours since this device last looked (the away note). Writes `<shot>.json`: `{said, moves}`. The pet's `wish`, `dream`, `traits`, `trait_levels` and `moments` (`[{type, ago}]`, minutes) fill it |
| `gift` | a gift waiting for the viewer (visitors v2 §5): `{id, world}` set as `mine.gift`, the card's own first look forced (its other lines dropped), the take answered by the fake `callWS` (only `collect {gift: true, shared: false}`), the line said and the pop paused just in. `--gift woodland/pinecone` on the command line. Writes `<shot>.json` beside the PNG: `{lookedFirst, said, pop}`. An asleep, away or egg pet's first look doesn't run, so nothing is said |
| `findsShown` | sets the card's `FINDS_SHOWN` release switch (on by default; `false` shows the off path: no basket, reveal, gift or finds grid). `--finds-shown` on the command line sets it true; `--preset finds`, `gifts` and `collection` set it themselves |
| `reveal` | the basket's reveal pinned through the card's own `_revealStart`/`_revealFind`, timers stopped: `{id, world?, new?, from?}` (one find; `world` defaults to the pet's) or `{finds: [...], at}` (shown up to the find at `at`). Its line in the bubble, its pop and a `new` find's sparkle paused just in; with `motion: reduce` it is still |
| `storage` | any other localStorage keys to seed (`hatch-named-holidays: "off"` turns holiday names off) |
| `config` | extra card config (`setConfig`) |
| `visit` | the reply the fake `virtual_pet.visit` service gives (`{notes: [...]}` makes the pet tell the viewer things) |
| `seed` | `Math.random` seed (default 7) |
| `group`, `label` | contact-sheet file and caption |

Per-browser settings (localStorage, seeded per shot): `booted` (default true)
sets `hatch-booted` so the power-on boot screen never covers the shot; `--boot`
(or `"booted": false`) shows it (the page reloads for that shot, since the card
shows it once per page load). `lcd` sets `hatch-lcd`: `"off"` turns the LCD
grid and ghosting off, anything else leaves them on. `mono` (`--mono on`; `--mono off`
leaves it off) sets `hatch-mono` to `"4"`, the mono screen switch, and the shot is
measured for the pass rule below. `storage` seeds any other key. If the card changes these keys or values, update `normalize` in
`scripts/bench.js`.

## The mono preset

`--preset mono` shoots the species sheet (frame 1, as `species`) and then a 19-shot
state strip of one adult in woodland, at 420 and 330, all with the mono screen on:
day, night, dim, faded, raining, rain-scene, lit, lit-night, lit-rain-scene, status,
journal, picker, games, bubble, boot, sick, dirty, attention, effects-off and beam
(2498 shots, about 2.5 minutes). Sheets land in `out/sheets/` as `mono-species-<id>-<width>`
and `mono-strip-<width>`.

Each shot is measured against the card's four tones and the run prints the failures
and the ten worst, and writes `mono-pass.json` to the out dir (every shot's numbers
and its `.screen` classes). The numbers:

- `apart`: the mean tone steps between each pet pixel and the pixel behind it (0
  where the pet is lost). A pet fails under 0.5.
- `lost`: the share of pet pixels that came out the same tone as the background.
- `delta`: the mean luma difference between pet and background, in tone steps.
- flat: one tone over 97 % of the screen. A flat shot fails.

The run also checks the backlight: each lit strip shot (day, night, rain) must differ
from its unlit twin on more than 5 % of its pixels, or the run exits non-zero.

## What is pinned

- `Date` is fixed (so seasons, countdowns and "day N" text hold still) and
  `Math.random` is seeded.
- The status's LCD wipes (open and between its pages) are run to their end before a shot, so a
  shot never catches a half-drawn page.
- The card's tick timer is stopped after one manual tick: frame 1 of every
  animation, no wandering, no idle chatter, no hop. The greeting from that one
  tick is what the bubble shows unless you set `say`.
- Lines are written whole (typing needs a running clock).

## Limits

Looks only. There is no server logic: no mood or care rules, no privacy
checks, no restarts, no real Home Assistant theme or fonts around the card
(it sits on a dark page). The fake entities are the minimum the card reads;
a screen that needs data this fake does not set (the private channel's
bond and aimed wish, wishes, photos) shows its empty state. The shell picker's `use`, `world default`
and its error lines need the server: card-check covers them. The journal has a fixture: `--journal`
(`journal: true` or an object over it) fills the lead pet's `life_stage` with
every creature of the world raised, two past generations, traits and a
memory, and opens the journal screen (`view: "journal"`). It has no photos row,
and the roster keeps only species that have a species.json (the beetle is left
out), as the server's `catalog.roster` does. Press-and-play flows are not
driven: `callService`/`callWS` answer with empty replies. The bench calls a
few card internals (`_tick`, `_frames`, `_write`, `_startGame`, `_stopTyping`,
`_slides`, `_timer`, `_powerGag`); if the card renames one, `page.js` is the place to fix.

Files: `server.js` (static server, no dependencies), `index.html` and
`page.js` (the page and the fake `hass`), `../../scripts/bench.js` (driver).
