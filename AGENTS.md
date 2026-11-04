# Notes for coding agents

## The card is built

The card is `src/card/*.js`, joined in the order of `src/card/manifest.txt` by
`scripts/build-card.js` into `custom_components/virtual_pet/frontend/hatch-pet-card.js`
(gitignored, unminified, same name and URL). Edit the parts, never the built file: the
next build overwrites a hand edit and says so. A new part goes in `manifest.txt`.

- The manifest's order is load order. A reorder can hit a TDZ error that only card-check
  shows; `node --check` sees syntax only.
- The class is an extends chain, one link per `card-*` part (`HatchPetCardBase` ...
  `HatchPetCard`, the last link, the one defined). A method sits in one part.
- The build runs by itself from `scripts/test`, pytest, `scripts/gate`, `scripts/develop`,
  the bench and card-check. For a quick look: `node scripts/build-card.js` (`--watch`
  rebuilds on save; HA still needs a restart).
- Console stacks and card-check failures point at the built file:
  `node scripts/build-card.js --where <line>` gives the part and line.
- JS tests read the joined text through `tests/js/card-source.js`.
- History before the move: `git blame -C -C src/card/<part>.js` follows the lines into
  the old file (`.git-blame-ignore-revs` lists the move commit).

Where things live:

| part | holds |
|---|---|
| prefs | VERSION, BOOT_VERSION, icons, actions, games, sound/lcd/mono/shared prefs, chirps |
| world | odds, ms, flair, SEASONS, hanukkah, turn/visitor day, once-per-day, season helpers |
| hop-engine | `HATCH_HOP`, Hop of the Day's rules (one frozen namespace; hop.py's twin, no `this`) |
| interaction-director | `HATCH_DIRECTOR`, the device-alive director: track leases, generation tokens, `BUSY_OWNERS` (one frozen namespace, pure, no `this`, no DOM; the card creates one per card in `_build`, device-fx.js is its first adapter) |
| device-fx | `HATCH_DEVICE_FX`, the adapter for the director (slices 3B, 3C): wire entry to cue, the rain recipe (`dir-*` classes on the slide's `.hw.glass`), ambience paint, `live`, `enter`; and the rim cues (feed, play, clean, the confirmed tuck: `RIM`, `rim`, `dir-*` classes on the slide's `.hw.rim`) (one frozen namespace, no `this`, no DOM beyond the glass and the rim; the card's `_dir*` methods and `_rimCue` in card-visit call it) |
| lines | poses, wishes, BABY, PERSONA |
| lines-fresh | the fresh-expand copy block (scripts/copy-scan.js's COPY_TABLES) |
| ui-copy | screen copy, kindred, follow text, QUESTIONS, notes, dreams, moment consts, helpers |
| shell-data | moulded shell, finishes, traits, server clock, `timeAgo` |
| style | `STYLE`, `SCENE_STYLE` (CSS strings; the one part over 1,000 lines) |
| card-base | setConfig, hass, connect, channel, finding pets |
| card-build | `_build`, `_buildSlide`, low battery, power-on, `_update`, `_forget`, `_go` |
| card-layout | `_layout`, `_mould`, `_renderShelf`, `_dress`, `_renderSlide`, `_say`, frames |
| card-tick | `_tick`, ghosting, idle, tricks, promise, `_speak`, `_pat`, `_sayLine` |
| card-looks | `_firstLook`, follow-ups, gifts, welcome, wishes |
| card-visit | `_catchUp`, greet, `_visit`, `_ask`, hearts, chirp, fx |
| card-moment | `_moment`, `_care`, dreams, night/meal, `_react` |
| card-status | `_renderStatus`, `_renderSettings` |
| card-sheets | shell picker, lay sheet, name sheet, `_set*` |
| card-journal | journal, photos, every world, finds page |
| card-actions | actions, the care scenes' shared frame (`_sceneStart`, `_sceneRender`, `_sceneEnd`, the answer) |
| card-care | `SCENES` (one entry per care scene: medicine, clean, feed), the bowl clip (`bowlCuts`), `_sceneFrames`, `_sceneArt` |
| card-games | games, dig |
| card-board | Hop of the Day's board mode (`HatchPetCardBoard`): the picker row (the day's state), the board and its keys in the `gameBox` overlay, park/resume, undo, the settle and its reply handler (`hopSettleOutcome`) |
| card-season | seasons, party, costume |
| card-visitors | world visitors, basket, reveal |
| card-link | infrared link |
| card-flair | trait flair, quit/end game; ends the class (`HatchPetCard`) |
| editor | `HatchPetCardEditor` |
| boot | statics on the card, `customElements.define`, `customCards`, banner |

`scripts/split-card.js` cut the old one-file card and ports a branch made before the
move: `node scripts/split-card.js --port <merge-base> <branch>` (see
docs/plan-2026-11-02-card-split.md section 6). It goes once no such branch is left.

## Privacy bar (owner, 2026-11-03)

Hatch is a game inside one household's own Home Assistant. Plan and build to two
privacy concerns only: **nothing leaves the household** (network calls, push text sent
off the box, shipped logs, public commits or art), and **free-text answers are never
shared** (shown to another person, put on a sensor, or logged). Anything Home Assistant
already shows the household is fair game for the card, including echoes of what happened
while nobody watched. Existing player-facing privacy options (keep presence private, keep
house words off sensors, remember me) keep working as built. Don't add privacy reviews,
owner questions or limits beyond these two.

## Motion on the card (composition rule)

The pet's `transform` is shared, so two moves can silently cancel each other. The rule:

- **Persistent state uses the individual properties.** `translate` = position (wander,
  go-left/right, the link slide), `rotate` = a flip or a lean (`look`, `twirl`, `spin`),
  `scale` = size (the species scale, `--k`). They compose with each other and with a
  keyframe on `transform`.
- **A one-shot body move is one `.pet.<cls> { animation }` on `transform`**, one at a
  time. `_animate` restarts only the class it is given, it does not clear another one. Two
  classes with an `animation` on at once means the later rule in the CSS wins and the
  other move is lost, so a new move waits for, or replaces, the last.
- A new flip is a `@keyframes` (the bench's `petAt` can pause it), never only a
  `transition`. A new one-shot is not an infinite loop; every motion honours the OS
  reduced-motion rule at the top of `style.js`, and a JS-started one checks `calm()`.
- `tests/js/motion_rule.test.js` fails when a `.pet.<cls>` rule with an `animation` is
  not on its list. A new class goes on the list only after you have checked it cannot be
  on with another one (or says so in a comment next to the rule).

## Screenshots: use the card bench, not Home Assistant

The default for any screenshot, render, contact sheet or visual review of the card
is the **card bench** (owner, 2026-10-29). It runs the real `hatch-pet-card.js`
with a fake `hass`, with no Home Assistant, and pins every state exactly:

    NODE_PATH=/home/poe/github/relink/node_modules node scripts/bench.js --preset shells
    # --preset species | ui, or one-off shots by flags or a JSON shot list

See `dev/bench/README.md`. A preset takes seconds. A throwaway HA takes minutes and
its dev pets drift.

Use a real HA (`scripts/develop`, `scripts/card-check`) only for **behaviour**: the
card-check gate, server calls, the private channel and privacy, restarts and
reloads, subscriptions, and anything the bench's README lists under Limits. If a
look needs a state the bench can't pin yet, add it to the bench rather than
falling back to HA.

## Running card-check on your own HA

`scripts/gate` does all of the below for you: lint and tests, then a throwaway HA
from `dev/config` with a fresh `.storage` on a free port (never 8123), card-check with
`HA_URL`/`HA_CONFIG`/`HA_START` set, and cleanup. Arguments after `--` go to
card-check. Prefer it over a hand-built scratch HA. It prints card-check's seconds per
section, and a range that changes only Markdown and `docs/` since a gated tree skips HA
and card-check. To have commits refuse unformatted Python, run
`git config core.hooksPath scripts/hooks` once.

`scripts/ci-gate` runs the same checks on GitHub instead (push, the Validate workflow,
wait) and writes the same gate-passed marker on a pass. Prefer it for the batch gate:
it takes none of this machine's CPU, so workers aren't slowed while it runs.

The manual route, if you need it:

- Never use port 8123, or another worker's port. Copy `dev/config` to a scratch
  dir. Start HA once, stop it, then set `data.stable.server_port` and
  `data.pending = null` in `<config>/.storage/http` and start it again. The yaml
  `http:` port alone reverts to 8123 after 5 minutes.
- Use a fresh `.storage` for a full run, because long-lived dev pets drift.
- With `HA_URL`, also set `HA_CONFIG=<scratch>` and
  `HA_START="exec <main>/.venv/bin/hass --config <scratch>"`. Card-check stops and
  restarts that HA to seed dev's bond and an aimed wish (section 8). Without them
  those checks FAIL. With no `HA_URL` they default to `dev/config` and
  `scripts/develop`.
- Playwright resolves with `NODE_PATH=/home/poe/github/relink/node_modules`.
- The venv is the main checkout's `.venv`. Symlink it into a worktree, and never
  commit the link.

## Partial card-check runs

`scripts/card-check.js --list` prints its section names; `--only a,b` runs just those.
Ship workers run `scripts/gate --auto`: `scripts/pick-sections` reads the diff against
origin/main (the card methods and constants it changes, the card-check lines it
edits, art) and runs just the sections that use them, printing why. Add a neighbour
with `scripts/gate -- --only <list>` when a section needs one. If it picks `all`
(server code), use `scripts/ci-gate`. A partial run writes no gate marker. The full
gate is the first mate's, once per merged batch, through `scripts/ci-gate`; CI runs
card-check as four parallel shards (`--shard k/4`), about 5-6 min. Login, the dashboard, stubs and the pet-finding prelude always
run, and `restart` puts dev's seeded bond and wish back. Sections lean on state their
predecessors leave (the open sheet, the bond, the slide on show), so a lone section may
need its neighbour in `--only`; `oldcard` pulls in `restart` by itself.
