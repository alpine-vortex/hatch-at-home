# Shell modes: the shell buttons become inputs

**Date:** 2026-11-04
**Status:** Plan only. No code in this document's commit. Four slices, none started.
**Basis:** `5e7616c0` (`fm-hop-exp`). Every "built" claim carries a file and line from that
tree; recheck when a slice starts (the card parts move often).
**Source:** the s2875 design study (`report.md` and two mocks, `today-330.png` and
`proposed-330.png`, archived with that worker). Its five questions are answered in section 1.

The goal: the eight round buttons on the shell stop being "care only". A **shell mode** swaps
all eight (icon, caption, label, action, enabled rule) for the length of the mode, and the
card puts them back. Games are the first users, and the first win is Hop of the Day: its board
loses the 2x4 key block, so the cell grows from 19/22/28 px to 31/36/44 px. The engine is a
general mode, not a game feature, so later modes (section 5) need no change to it.

## 1. Decided

All six are the owner's, 2026-11-04. Cite them as "owner decision D#".

| # | Decision |
|---|---|
| D1 | **Care buttons are swapped out during a game.** The game owns the shell: feed, clean and the rest are not pressable mid-game. (Today they are: `_press` has no game guard, only the scene is skipped, `card-actions.js:74-110`, `_sceneStart` `s.game`.) |
| D2 | **The picker stays as it is**, on screen. The shell changes only once a game starts (the picker's buttons carry long labels and a prompt; they are not icon material). |
| D3 | **Two-button games use the outer slots 1 and 4**, the old `.gl`/`.gr` positions and Hop's left/right. Slots 2 and 3 are dimmed and inert. |
| D4 | **Hop's arrows are one row, slots 1-4: left, up, down, right** (the `HOP_KEYS` order, `card-board.js:83`). Special, undo, restart and quit are slots 5-8. |
| D5 | **Existing icons and glyphs first, pixel icons later; one game tint colour.** The first slices ship the current SVG icons and glyphs (`icon("prev")` etc., `prefs.js:17-20`; the "✦ ↶ ↻ ✕" the mock used). The pixel icons follow in slice 4. The tint is one colour for every game, not the world's accent. |
| D6 | **The engine is a general shell mode.** The owner: "We may use this for other modes and features in the future outside of games, so keep that in mind during design." So a mode is a table entry (8 slots, a tint, an exit rule) with its own enter and exit; games call them. Nothing in slice 1 may assume a game. |

Nothing here needs the server: the three server games already take 2 inputs plus close, and
Hop's seven keys plus close are exactly eight.

## 2. What exists (base `5e7616c0`)

- **The buttons.** `ACTIONS` (`prefs.js:81`) = feed, snack, play, clean, meds, scold, praise,
  plus `lights` (`card-build.js:379-385`): eight `.toy` buttons in `.buttons`, a 4-column grid,
  two rows (`style.js:1561`). Each is a `.cap` (pixel icon from `ACTION_ICONS`, 46 art-px wide,
  38 compact: `card-layout.js:42`) and a caption; the `.toy` is the hit area. Slot order is
  `ACTIONS` order then lights: slot 3 is Play, slot 8 is lights.
- **Click handlers are bound at build** (`card-build.js:370-374`): `play` goes to `_startGame`,
  the rest to `_press(s, key)`; lights to `_toggleLights`. `data-action` on each `.toy` drives
  the cap's rebound curve (`style.js`) and `_rimCue` (`card-actions.js:100`).
- **Repaint.** `_update` rewrites the lights icon, caption, `title`, `disabled` and `.on`
  every time (`card-layout.js:720-731`) and the lay/request button's `aria-label`
  (`:714`); a reload disables all (`:518`). A swap has to survive these.
- **The game overlay.** `.game` (`card-build.js:157-166`): `.gpick` (one button per game),
  `.ghop` row (behind `experimental_hop`, `card-games.js:50`), `.gl` and `.gr` (the two
  inputs, `card-games.js:370-380`, `:506`), `.gscore`, `.gnum`, `.gx` close.
- **One exit funnel.** Everything that ends a game goes through `_endGame`
  (`card-flair.js:194`): quit (`:191`), game over (`card-games.js:426`, `:583`), idle
  (`card-layout.js:683-686`, `GAME_IDLE_MS` = 3 min, `prefs.js:102`), asleep/away/egg
  (`:681`), slide change (`card-build.js:752`, `card-base.js:186`), Hop's board
  (`card-board.js:180-193`). Escape is wired at `card-build.js:270`.
- **The director.** `BUSY_OWNERS` (`interaction-director.js:53-70`) lists `game` as busy, so
  ambience and rim cues stay off while a game runs.
- **Hop's key block.** `_hopLayout` (`card-board.js:355-382`) sizes `kk` (24-44 px), reserves
  `keysW = 2kk + 3`, and gives the grid the rest. That block is what crowds the board.

## 3. The design

### 3.1 A mode is a table entry

`SHELL_MODES` is one frozen table in a new data part (pure, no `this`, no DOM, like
`HATCH_HOP`). An entry:

```
{ id,            // "left_right", "hop", later "question", "photo"...
  kind,          // "game" now; any other string is a non-game mode
  slots,         // exactly 8: { icon, cap, aria, act, enabled } or null (dimmed, inert)
  tint,          // a key into the one tint set; "game" for every game
  exit,          // { slot: 8 | null, escape: bool, idleMs: n | null, on: [...reasons] }
  busy,          // does the director treat the device as busy (default true)
  announce }     // the one status line when the buttons swap
```

- `slots[i].cap` and `.aria` may be a string or a pure function of the slide (Hop's "Step
  left, blocked", Hop's special with its use count, the dig's "keep" on an empty basket).
- `enabled(s)` is pure. A blocked or empty slot is `aria-disabled="true"`, never `disabled`,
  so focus is not lost (as `_hopKey` does, `card-board.js:515`).
- `act(card, s)` is the only thing a press does. It is the mode's own: a game slot calls the
  game's step, a quit slot calls `exit`.
- A `null` slot is dimmed and inert, and a press on it does nothing and sends nothing.

### 3.2 The engine is four methods, one part, no game words

`s.mode` is the slide's current mode (null at rest). It is per slide, as `s.game` is: a
neighbour slide keeps its care caps.

| method | does |
|---|---|
| `_modeEnter(s, mode, { from })` | Ends any care scene (as `_press` does); replaces a mode already on (calls its `onExit`); remembers each button's home state; paints the eight slots; sets the tint class; announces once; moves focus to the first live slot; remembers `from` (the pressed button) for the way back. |
| `_modeSync(s)` | Repaints the slots from `slot` functions after any state change (a Hop move, a basket going empty). Cheap and idempotent. |
| `_modeExit(s, reason)` | Idempotent: a no-op if `s.mode` is null; sets `s.mode = null` first, then calls the mode's `onExit(reason)`, then restores every button from the **current** pet state (not a snapshot: the pet may have changed meanwhile) and puts focus back on `from`. |
| `_modeClick(s, i)` | The router. One click handler per button, bound once at build, asks `s.mode`: null goes to the care handler as now, otherwise to `slots[i].act` if `enabled`. |

Rules the engine keeps:

1. **Entry and exit belong to the mode. Games call them.** `_startGame` calls `_modeEnter`
   with the game's mode; `_endGame` calls `_modeExit(s, "game")`. The quit slot and Escape call
   `mode.exit`, which for a game is the existing quit path (`_endGame` through the server
   call at `card-flair.js:185-191`) and for any other mode is `_modeExit` directly. No path
   needs `_endGame` to leave a non-game mode, and `_modeExit` never calls `_endGame` (it
   would loop). The game's `onExit` is what ends the game, if the exit came from outside it.
2. **The repaint paths ask the mode.** `_update`'s lights and request repaint
   (`card-layout.js:714-731`) and the reload disable (`:518`) go through one `_paintCaps`
   helper that, while `s.mode` is set, updates the home state it will restore and leaves the
   DOM alone. (Risk R2.)
3. **One mode per slide, no stack.** A second `_modeEnter` replaces the first. A mode that
   wants to be modal says so in `exit`, not by stacking.
4. **Same box.** A swapped cap keeps the cap's size; only the icon, caption, `aria-label`,
   `title` and tint change. `_bands` and `_mould` read `.toy` rects and `--cap-*`
   (R3).
5. **The director.** A mode appears in `BUSY_OWNERS` as `{ name: "mode", busy: s => !!s.mode &&
   s.mode.busy !== false }`. `game` stays (its busy window is longer than the mode's by the
   result beat). The completeness test that scans the table for the fields it names is
   updated in the same slice.
6. **No game words in the engine.** The part holds no `s.game`, `_endGame` or `GAMES`. A
   node test greps the part's source for them (section 6, slice 1).
7. **Fixed copy.** A mode's captions and labels are table copy. A mode never shows a
   household's free text on the shell (the privacy bar in AGENTS.md holds by construction).

### 3.3 The feel of the swap

- The eight caps change icon and caption together with one cap-press-style rebound, then a
  tint (a game-mode cap colour, a new tone beside `--cap-tones`) so the change reads at a
  glance. One colour for every game (D5). Under `calm()` and the OS reduced-motion rule
  (the top of `style.js`) there is no rebound and no fade: it is an instant change.
- The swap uses `translate`/`scale`/colour only, no `transform`, so the AGENTS.md motion
  rule does not bite (caps already use `translate`). If slice 1 finds it needs a keyframe on
  `transform`, it checks `tests/js/motion_rule.test.js` first.
- The pet-side feedback stays where it is: the score, the number, `.gnum`, the bubble and
  the prompt. Only the inputs move. A 2-input game's lit "go" fade (`style.js:431`) becomes
  "the live slots are lit, the rest are dimmed".

### 3.4 The mapping (4x2 grid, slots 1-4 top, 5-8 bottom)

| mode | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| left_right | left | - | - | right | - | - | - | quit |
| higher_lower | lo | - | - | hi | - | - | - | quit |
| dig | keep | - | - | dig | - | - | - | quit |
| hop | left | up | down | right | special (n) | undo | restart | quit |

`-` is a `null` slot. Hop's 5-8 stay live after the board is solved or lost (restart and
quit remain until the player leaves, as the board's `end` does today). Nothing exceeds eight;
a future mode that wants more keeps its own on-screen keys. The picker is not a mode (D2).

### 3.5 Exits and interruptions

Quit is slot 8 (also Escape, and the old `.gx` while it exists). Every other way out already
ends in `_endGame` and so in `_modeExit`:

| way out | covered by |
|---|---|
| quit slot, Escape | `mode.exit` |
| game over, Hop solved or lost | the game's result beat, then `_endGame` |
| idle (`GAME_IDLE_MS`, 3 min) | `card-layout.js:683-686`, then `_endGame` |
| asleep, away, egg | `card-layout.js:681`, then `_endGame` |
| slide change, `_forget` | `card-build.js:752`, `card-base.js:186` |
| reload (`s.reloading`) | `:518`: all disabled, restored on the rebuild |
| the status sheet | covers the shell (`card-layout.js:785`); the mode is still on under it |
| another mode | replaced by `_modeEnter` |

A **non-game** mode has no `_endGame`. Its exits are listed in its table entry (`exit.on`),
and the engine, not the game code, listens for asleep, away, slide change and idle for it
(slice 1 moves those three hooks to a small `_modeGuard(s)` the tick already calls; the game
hooks stay and call `_modeExit` through `_endGame`).

### 3.6 Access

- **aria.** On enter each `.toy` gets the slot's `aria-label` and `title`; on exit the home
  label comes back. One announcement for the swap through the existing `.sr[role=status]`
  (once, not per button). Blocked and empty slots are `aria-disabled`. Hop reuses today's
  labels (`HOP_COPY`, the bench's `keyState`).
- **Focus.** The focus is on the pressed Play cap (slot 3) at enter. It moves to the first
  live slot (slot 1), as `_hopRefocus` does, and goes back to `from` at exit (replacing
  `_endGame`'s `s.buttons.play?.focus`, `card-flair.js:208`).
- **Touch.** The `.toy` hit area is wider than 44 px at every width, and beats today's Hop
  keys (32 px at 300, 38 px at 330). A gain for fingers.
- **Keyboard.** Today only Tab and Escape work (no arrow handler on the board). Slice 4 adds
  a mode-level `keys` map (arrows and WASD are Hop's directions, `Z` is undo, Esc is quit),
  active only when focus is in the card.

## 4. Hop's board after the swap

The adult board is the widest (the server allows at most 6 x 4, `hop.py:122`, `:197`), so the
cell is width-bound by 6 columns and every smaller board gets a larger cell. With no key
block, `c = min((W - 8) / 6, (H - 8) / 4)` for the overlay's W x H (bench json 198x148 /
228x171 / 272x204):

| card width | cell today | cell after | note |
|---|---|---|---|
| 300 | 19 | 31 | +12 |
| 330 | 22 | 36 | measured in the mock |
| 420 | 28 | 44 | computed; reaches the one-tap threshold (`g.cell >= 44`, `card-board.js:554`) |

At 420 a tap commits at once; at 300 and 330 it still lights first. The height has slack, so
the board centres. `.gx`, `.hkeys` and `--hk --hr --hb` (`style.js:535-541`,
`card-board.js:360-372`) go, and `_hopLayout` gets simpler. Keep the `Math.max(12, ...)` floor.

## 5. What a future non-game mode needs

Not built, but named so slice 1 does not close the door. Candidates: a question's answers
(two to four choices on the shell, `QUESTIONS` in `ui-copy.js`), the infrared link
(`card-link.js`), a visitor reply (pet / shoo / give), a photo mode (shutter, flip, close),
a yes/no confirm for the lay sheet, a journal or finds browser (prev, next, close).

What each needs from the engine, and where slice 1 provides it:

| need | slice 1 |
|---|---|
| a way in that is not Play | `_modeEnter(s, mode)` is called by anyone; the caller is not checked |
| a way out that is not `_endGame` | `_modeExit(s, reason)` and `mode.exit`; the game hook is one caller |
| slots that change as state changes | slot functions plus `_modeSync` |
| its own exit rules (no idle, or a different idle; survives the sheet) | `exit` in the entry |
| to opt out of "busy" (a long ambient mode that should let ambience run) | `busy` in the entry |
| to know about asleep, away, slide change | `_modeGuard` (3.5), not game code |
| fewer than eight inputs | `null` slots |
| more than eight inputs | not supported: the mode keeps on-screen keys |
| its own tint | `tint` is a key into a set; only `"game"` ships |
| its own announcement and copy | `announce` and slot copy are table copy |
| save across reload | not supported: a mode is card state and ends with the card |

A mode that needs a thing outside this table adds a field to the entry and a node-test row,
not a branch in the engine.

## 6. The slices

Order: 1 → 2 → 3 → 4. Slices 2 and 3 each start after 1; 3 may start after 2 or in parallel
if the key hooks of `_hopKey` are not touched by both. Each slice states what card-check
and node tests must show. A slice that changes card methods runs `scripts/gate --auto`;
the first mate gates the merged batch with `scripts/ci-gate`. Each slice that adds a part
adds it to `src/card/manifest.txt` and to the part table in AGENTS.md, and runs card-check
once for the TDZ order (`node --check` sees syntax only).

### Slice 1: the mode engine (no game changes)

New parts: `shell-modes` (the data; after `ui-copy`) and `card-mode` (the four methods and
`_paintCaps`, `_modeGuard`; after `card-actions`, before `card-care`). The final position is
for the slice to settle with card-check. `_startGame`, `_endGame` and the games are
unchanged except that `_endGame` also calls `_modeExit` (a no-op while no game uses a mode).
Escape and the three guard hooks move into the engine (3.5).

Acceptance:
1. `tests/js/shell_modes.test.js` (node, reads the joined text): every `SHELL_MODES` entry has
   exactly 8 `slots` (an object or null); resolved captions are non-empty and unique within a
   mode; every `aria` is non-empty; every non-null `act` is a function; `exit.slot`, when
   set, is a non-null slot; the table is frozen deep; `tint` names a known tint.
2. The same test fails if the `card-mode` part contains `s.game`, `_endGame` or `GAMES`
   (the no-game-assumption check, D6), and passes a schema check on a probe entry whose `kind`
   is not `"game"` (the test supplies it).
3. `tests/js/interaction_director.test.js` (its completeness scan) passes with the `mode`
   owner added to `BUSY_OWNERS`.
4. A card-check section `shellmode`, driving the engine through `card.evaluate` with the
   probe mode as an object (the table names only shipped modes): after `_modeEnter`, all 8
   `.toy` show the probe's icon, caption, `aria-label` and tint class, and the `.sr` status
   holds the announcement once; a press on a care slot sends no `button.press` call (spy on
   `callService`); a press on a live slot runs its `act`; a press on a `null` slot does
   nothing; focus is on the first live slot.
5. The same section proves each exit restores all eight buttons to a snapshot taken before
   (icon, caption, `aria-label`, `title`, `disabled`, `data-icon`, classes): `_modeExit`
   direct, Escape, the quit slot, idle (`exit.idleMs` with the clock set back), asleep,
   slide change, and a reload. Focus returns to `from`. A second `_modeExit` is a no-op.
6. While the probe mode is on, a `_update` that flips the lights entity does not change the
   DOM, and after the exit the lights button shows the **new** state (R2).
7. A second slide keeps its care caps while the first is in a mode.
8. Under emulated reduced motion, no rebound class is set on enter or exit.
9. With the probe off, every existing card-check section is unchanged (no assertion edited).

### Slice 2: the three server games on the shell

`left_right`, `higher_lower` and `dig` get table entries (3.4). `.gl` and `.gr` leave the
overlay; `.game` keeps `.gscore`, `.gnum`, the prompt and (for now) `.gx`. `_startGame`'s pick
calls `_modeEnter`. The keep slot keeps its `aria-disabled` rule on an empty basket
(`card-games.js:506`). The glyphs and SVG icons ship (D5). The lit "go" fade becomes the
live/dimmed slots.

Acceptance (card-check, the three games' existing sections updated, plus `shellmode` rows):
1. After the pick, within one frame, the 8 buttons show the game's slots; slots 1 and 4
   play the two moves; 2, 3, 5, 6, 7 are inert; 8 quits. `.gl` and `.gr` are not in the DOM.
2. Pressing a care slot during a game sends no `button.press` and starts no scene (D1).
3. Every exit of section 3.5 restores the snapshot: quit, Escape, game over, idle,
   asleep, slide change, reload, and Play again.
4. Dig's keep: with an empty basket slot 1 is `aria-disabled="true"`, not `disabled`, and
   keeps focus.
5. A node test on the three entries: slot 1 and 4 only live; captions are the study's
   (below) and unique.
6. The picker is unchanged: the Hop row and `.gpick` are still on screen and the shell is
   care until a game starts (D2).

### Slice 3: Hop on the shell

`hop` gets its table entry. The `.hkeys` block, `.gx`, `--hk --hr --hb` and `HOP_KEYS`'s
rendering go; `_hopKey`, `_hopTap`, `_hopRefocus` stay and are driven by `act`. The board
takes the whole overlay. The bench's `hopInfo` and `keyState` and the Hop card-check
sections move from `.hk` to `.toy`. Goldens are regenerated.

Acceptance:
1. `tests/js/hop_board.test.js`: the layout function returns a cell of at least 31 / 36 / 44
   px for overlays of 198x148 / 228x171 / 272x204, and never below the floor of 12; a smaller
   board (any of the six families, smaller than 6 x 4) gets a cell no smaller than the 6 x 4
   one.
2. Bench `--preset ui` shot at 300, 330 and 420 (card widths): `hopInfo` reads those cells
   from the real card; the board is centred; no element is clipped.
3. Card-check Hop sections: slots 1-4 move left/up/down/right; blocked moves are
   `aria-disabled` with the existing "blocked" labels; 5 is special and shows its count; 6
   undoes; 7 restarts; 8 quits; a cell tap still works (lights first below 44 px, commits at
   once at 420).
4. A solved board leaves 7 and 8 live; leaving restores the snapshot.
5. `.hkeys`, `.hk` and `.gx` are gone from `style.js` and the card (grep in the node test).
6. The Hop settle-other and the Hop sections of the card-check keep their assertions, or each
   change is listed in the commit.

### Slice 4: the pixel icons, and the keys

Optional and last. The table's icon keys change from the SVG/glyph stopgaps to pixel icons
(24 grid at 4x, drawn like `pixelIcon`): left, right, up, down, keep, dig, special, undo,
restart, quit (about 10). The art goes through the art pipeline, not this plan. The
mode-level `keys` map (arrows/WASD, `Z`, Esc) lands here, as part of the engine.

Acceptance:
1. A node test: every icon key in the table exists in `frontend/ui` (or the stopgap glyph
   still resolves); no key is missing.
2. A card-check row per key in Hop: the key moves the pet, only when focus is in the card;
   outside the card it does nothing; Esc quits every mode.
3. Bench `--preset ui` shows the icons at 300/330/420 with the cap size unchanged (R3).

## 7. Risks

| # | Risk | How it is covered |
|---|---|---|
| R1 | Care buttons are unavailable mid-game: a behaviour change (D1). | Decided. Slice 2 acceptance 2 proves it; the swap and the announcement say so. |
| R2 | `_update` repaints the lights/request buttons (`card-layout.js:714-731`) and `:518` disables all, which would paint over a swap or leave a stale label. | `_paintCaps` is the one writer; slice 1 acceptance 6 proves a state change during a mode shows correctly at exit. |
| R3 | A swapped icon changes the cap box, and `_bands`/`_mould` (which read `.toy` rects and `--cap-*`) misplace the shell. | Same box rule (3.2 rule 4); slice 1 compares rects before, during and after; slice 4 re-checks with the pixel icons. The compact cap is 38 px: captions are one word. |
| R4 | A stale cap after an exit path nobody tested. | Every exit funnels into `_modeExit`, which restores from live state; slice 1 and 2 prove each path in 3.5. |
| R5 | Bench `keyState`/`hopInfo` and the Hop card-check sections read `.hk`. | Slice 3 re-points them; its acceptance 6 forbids silent assertion edits. |
| R6 | Screen-reader users lose the Hop labels. | The swap carries the labels (3.6); slice 3 acceptance 3 checks `aria-disabled` and the labels; one announcement only. |
| R7 | A first-time player sees the old picker until they pick. | D2: by design. |
| R8 | An engine that knows only games would force the next mode to fork it. | D6: the part has no game words (slice 1 acceptance 2), `_modeExit` never calls `_endGame`, the probe mode in the tests is not a game. |
| R9 | `click` handlers bound at build fire care on a swapped button. | One router (`_modeClick`) is the only handler; slice 1 acceptance 4. |
| R10 | `data-action` still names the old care, so the rebound curve and `_rimCue` fire the care's. | The mode sets `data-slot` and the router calls no `_rimCue`; the rebound uses the mode's own class. Slice 1 checks no rim class lands during a mode. |
| R11 | A new part in `manifest.txt` hits a TDZ error. | Card-check in slice 1 (AGENTS.md). |
| R12 | The cell sizes in section 4 are for the adult board and from a bench json; other families' sizes were not measured. | Smaller boards get larger cells (the server's maximum is 6 x 4); slice 3 acceptance 1 tests it. |
| R13 | Motion: a rebound on the caps meets the shared-transform rule. | 3.3: translate/scale/colour only, `calm()` honoured; `motion_rule.test.js` run with the slice. |

## 8. The Hop art

Art ship **s2874** (pixel art for every Hop board) is paused at the woodland family on
`crew/hatch-at-home-s2874-hop-board-art-pixel-art-for-ev@1ec8cd29`. It was drawn for cells of
19/22/28 px. It resumes **after slice 3**, at the new cells of **31/36/44 px** (up to 57-64%
larger). The first mate tells s2874 the size changes before slice 3 lands. For the art:
keep the cell art on the 12 px floor, expect the board to centre in the overlay with no right
column, and re-check the woodland tiles already drawn at the larger sizes.

## 9. Player copy (proposals; need first-mate copy approval before they ship)

The study proposed only these, as proposals. Nothing else here is player-facing.

- The swap announcement for the status line: "game buttons on" (the engine's `announce`).
- The quit caption: "quit" or "done" (the study leaned to "quit").
- The special caption: "special", with its use count.
- The slot captions: "keep" and "dig" (dig), "lo" and "hi" (higher_lower, today's `.gl`/`.gr`
  text), and the Hop labels from `HOP_COPY`, which stay as built. The left_right slots reuse
  the existing prev/next arrows with no caption.

## 10. Open questions

None. The five from the study are answered (D1-D5) and D6 sets the shape. Two small things the
slices settle on their own, not the owner's: the final manifest position of the two new parts
(slice 1 finds it with card-check), and whether the tint is a CSS custom property or a class
(slice 1; either serves the one colour of D5).
