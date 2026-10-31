# Card bench

Screenshots of the **real** `hatch-pet-card.js` without Home Assistant: fast
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
node scripts/bench.js --preset ui         # status, game picker, bubble
node scripts/bench.js --preset finishes   # 576 shots: every shell finish, every world
node scripts/bench.js --preset settings         # the gear's sheet, 420/330, day/night
node scripts/bench.js --preset settings-shared  # the same on a shared screen
node scripts/bench.js --preset picker     # the shell picker: egg (locked) and teen, 420/330
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
| `pet` | more of the first pet: `name`, `age_days`, `flags`, `energy`, `hatch_minutes`... |
| `pets` | a number (extra pets are children from the world's roster) or an array of pet overrides; the first is on show, the card gets its dots |
| `shell` | `{shape, color, bezel, finish}` over the world's own; `finish: "none"` drops it. Shapes: egg tank house porthole pad moon |
| `scene` | `day` (default), `night`, `dim` (lights out), `rain` |
| `season` | `false` (default: no seasonal touches), `"auto"` (by `time`), or a season key such as `halloween` |
| `time` | pinned clock, ISO (default `2026-06-15T12:00:00Z`; the browser runs in UTC) |
| `width` | card width in px (420, or 330 for the compact layout); `dpr` pixel ratio |
| `view` | `card`, `status` (status screen), `settings` (the status screen's gear sheet), `picker` (the sheet's shell picker; needs `shellOptions`), `journal` (see below), `games` (game picker) |
| `shellOptions`, `shellFinish`, `shellLocked` | the lead pet's `shell_finish_options` (finish keys it may wear), `shell_finish` (its pick, default none: the world's own) and `shell_locked` (`{key: stage}`). Without `shellOptions` the card has no shell row, as with an older server |
| `preview` | in the picker, the tile tapped: that finish on the live shell, unsaved (`""` is the world's own) |
| `scroll` | a selector in the status box brought into view (the picker scrolls), e.g. `.tile.now` or `.sec[data-group="specials"]` (its top just under the back row) |
| `journal` | `true` (`--journal`, which also sets `view: "journal"`) or an object over the journal attributes the card reads (`raised`, `journal`, `generation`, `traits`, `memories`) |
| `mine` | `true` (`--mine`) or an object over it: the viewer's own view the private channel would send (a bond, notify me, my day, my birthday kept), so `you two` and the sheet's personal rows show |
| `power` | the low-battery gag pinned mid-play: `battery` (one bar, first line) or `line` (full battery, second line) |
| `costume` | `{season, art, frame}`: the costume put on through the card's own `_costume` (frame 1 or 2 showing). `bench.js` writes the seat it used (`_frames(s)[0]`, `drawn`, `_hatSeat`) to `<name>.json` beside the PNG |
| `say` | text put in the bubble (`""` clears it) |
| `clip` | `card` (whole card, default), `device` (the toy), `screen` (the LCD only) |
| `motion` | `reduce` emulates `prefers-reduced-motion: reduce` (`--motion reduce`) |
| `lcd`, `booted`, `mono` | per-browser settings, see below |
| `classes` | an array of classes put on `.screen` last, before the transitions finish: `faded`, `raining`, `lit`... (the bench's `scene: "rain"` is woodland's rain backdrop without `raining`) |
| `beam` | `true`: the infrared beam held mid-flight (400 ms in, the head over the host's shell) by the card's own `_linkBeam`, no visit around it. Use `pets: 2` and `clip: "card"` |
| `link` | the infrared visit greeting caught as the visit screen opens: `{waves, wait}` (`waves` is put on both species, `wait` is ms to hold, default 150) |
| `storage` | any other localStorage keys to seed |
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
