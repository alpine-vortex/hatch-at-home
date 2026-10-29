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
```

PNGs land in `dev/bench/out/` (gitignored; `--out DIR` to move it). A preset
also writes contact sheets to `out/sheets/` (`--no-sheet` to skip): `shells-420`,
`shells-330`, `ui`, and one `species-<id>` per species (rows run stage by stage,
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
| `view` | `card`, `status` (status screen), `games` (game picker) |
| `say` | text put in the bubble (`""` clears it) |
| `clip` | `card` (whole card, default), `device` (the toy), `screen` (the LCD only) |
| `lcd`, `booted` | per-browser settings, see below |
| `storage` | any other localStorage keys to seed |
| `config` | extra card config (`setConfig`) |
| `visit` | the reply the fake `virtual_pet.visit` service gives (`{notes: [...]}` makes the pet tell the viewer things) |
| `seed` | `Math.random` seed (default 7) |
| `group`, `label` | contact-sheet file and caption |

Per-browser settings (localStorage, seeded per shot): `booted` (default true)
sets `hatch-booted` so the power-on boot screen never covers the shot; `--boot`
(or `"booted": false`) shows it (the page reloads for that shot, since the card
shows it once per page load). `lcd` sets `hatch-lcd`: `"off"` turns the LCD
grid and ghosting off, anything else leaves them on. `storage` seeds any other
key. If the card changes these keys or values, update `normalize` in
`scripts/bench.js`.

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
a screen that needs a sensor attribute this fake does not set (journal,
bonds, wishes, photos) shows its empty state. Press-and-play flows are not
driven: `callService`/`callWS` answer with empty replies. The bench calls a
few card internals (`_tick`, `_frames`, `_write`, `_startGame`, `_stopTyping`,
`_slides`, `_timer`); if the card renames one, `page.js` is the place to fix.

Files: `server.js` (static server, no dependencies), `index.html` and
`page.js` (the page and the fake `hass`), `../../scripts/bench.js` (driver).
