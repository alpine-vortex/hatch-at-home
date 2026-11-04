# Shell modes: the shell buttons become inputs

**Date:** 2026-11-04
**Status:** Plan only, revised 2026-11-04 after the adversarial review (s2878, findings P1-P22,
folded in here and cited as "review P#"). No code in this document's commit. Four slices, none
started.
**Basis:** `5e7616c0` (`fm-hop-exp`). Every "built" claim carries a file and line from that
tree; recheck when a slice starts (the card parts move often).
**Owner decisions** D1-D6 are in section 1. D7-D10 (the owner's answers to the review's four
questions, 2026-11-04) are cited where they bite and listed in section 10; the first mate
records them in the section 1 table.
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
  the cap's rebound curve (`style.js:1602-1606`, pinned by `tests/js/cap_press.test.js:45`) and
  `_rimCue` (`card-actions.js:100`).
- **Repaint: `_update` writes the eight on every hass push** (review P1). The loop at
  `card-layout.js:697-704` sets, for each `ACTIONS` button, `disabled` (no entity, `unavailable`,
  egg, away), the `.wanted` class and `aria-description="wanted now"`. The lights block
  (`:717-731`) sets `disabled`, `.on`, `.wanted`, the icon and `data-icon`, the caption and
  `title`. A reload (`s.reloading`, `:515-519`) disables all eight and returns. The request
  chip's `aria-label` (`:714`) is not one of the eight. A swap has to own all of these.
- **The game overlay.** `.game` (`card-build.js:157-166`): `.gpick` (one button per game),
  `.ghop` row (behind `experimental_hop`, `card-board.js:120`), `.gl` and `.gr` (the two inputs,
  `card-games.js:370-380`, `:506`), `.gscore`, `.gnum`, `.gx` close. `s.game` exists from the
  moment the picker opens (`{ picking: true }`, `card-games.js:~40`), long before a game starts.
- **The exits.** Not one funnel: a table keyed by call site is section 3.5. In short,
  `_quitGame` (`card-flair.js:181`, the server "end" call, then `_endGame`) has five callers
  (`card-build.js:270` Escape, `:302` the `.gx` click, `:940` `_go`, `card-layout.js:785`
  the status sheet, `card-games.js:8` Play mid-picker) and `_endGame` (`card-flair.js:194`)
  has twelve more (game over, refusals, `_update`'s asleep/away/egg and idle, `_forget`,
  teardown, Hop's open failures). Escape is bound on `s.gameBox` only (`card-build.js:269-271`).
- **"The game owns the screen" is `s.game`, read in about 40 places outside the game parts**
  (review P3; a grep at this tree): `card-moment.js:150-249` (every moment dropped),
  `card-tick.js:117/126/436/587/654/797/819/1046/1067/1129` (idle, wander, chatter, the
  babble, the queue), `card-visitors.js:109/357`, `card-looks.js:161/179/224`,
  `card-link.js:36/61`, `card-build.js:347/416/422/456`, `card-actions.js:119` (`_sceneStart`),
  `card-moment.js:691`, `card-visit.js:378`. They keep bubbles, visitors, power-on, scenes and
  moments off while a game runs. The director's `BUSY_OWNERS` (`interaction-director.js:53-70`)
  lists `game` separately, for ambience and rim cues.
- **Idle.** Only the three server games idle out: `card-layout.js:682-686` tests
  `SERVER_GAMES` (`prefs.js:99`), `!g.busy` and `g.lastAt`, which only they set
  (`card-games.js:273/405/550/605`). Hop has no idle exit today (review P4). The check sits in
  `_update` (a hass push), not in `_tick`.
- **Hop's key block.** `_hopLayout` (`card-board.js:355-382`) sizes `kk` (24-44 px), reserves
  `keysW = 2kk + 3`, and gives the grid the rest. That block is what crowds the board.
  Hop's board is entered at `_hopStart`, after the server's reply (`_hopOpen`,
  `card-board.js:~159-200`); the three server games enter at `_pickGame`
  (`card-games.js:~250`), before `_playCall` answers.

## 3. The design

### 3.1 A mode is a table entry

`SHELL_MODES` is one frozen table in a new data part (pure, no `this`, no DOM, like
`HATCH_HOP`). An entry:

```
{ id,        // "left_right", "hop", later "question", "photo"...
  slots,     // exactly 8: a slot object, or null (an "off" slot)
  tint,      // a key into the one tint set; "game" for every game
  owns,      // does it own the screen (default true): section 3.7
  busy,      // does the director treat the device as busy (default true)
  exit,      // { slot: 8 | null, escape: bool,
             //   status: "end" | "keep",          // opening the status sheet (D8)
             //   idleMs, idleAt(s), idleHold(s),  // null idleMs = never
             //   on: [ "asleep" | "away" | "egg" ] }   // optional reasons, section 3.5
  announce,  // the lead of the one announcement when the buttons swap
  onExit }   // optional, (card, s, reason): ends whatever the mode started
```

A slot: `{ icon, cap, aria, act, enabled, on }`.

- `cap` and `aria` may be a string or a pure function of the slide (Hop's "Step left,
  blocked", Hop's special with its use count, the dig's "keep" on an empty basket).
- `enabled(s)` and `on(s)` are pure. `on` is a slot's pressed state (Hop's special while armed,
  `card-board.js:~512`, review P7); the engine paints it as `aria-pressed` and an `.armed`
  class with its own style, never the shell's `.on` (the lights' dark cap, `style.js:286`,
  which reads as "asleep").
- A slot is in one of three states, and `_paintCaps` writes each the same way:
  **live** (focusable, a press runs `act`); **blocked** (`enabled(s)` is false, or a request
  is out: `aria-disabled="true"`, focusable, a press does nothing; Hop's blocked moves, the
  dig's keep on an empty basket, and every slot but quit while `s.game.busy`); **off** (the
  `null` slot: native `disabled`, `aria-hidden="true"`, an empty `aria-label`, dimmed, out of
  the tab order; review P8). The quit slot is never blocked by a request.
- No live or blocked slot is ever natively `disabled`, so no entity state can drop focus
  (review P1).
- `act(card, s)` is the only thing a press does. It is the mode's own: a game slot calls the
  game's step, the quit slot calls the exit (3.5).
- There is no `kind` field (review P20): nothing in the engine reads it. "Not a game" is
  "has no game linked to it", which the node test checks by supplying a probe.
- The slot functions may read `s.game` (they are the game's copy of its own state); the
  engine part may not (3.2 rule 6).

### 3.2 The engine is five methods, one part, no game words

`s.mode` is the slide's current mode (null at rest). It is per slide, as `s.game` is: a
neighbour slide keeps its care caps.

| method | does |
|---|---|
| `_modeEnter(s, mode, { from })` | Ends any care scene (as `_press` does); remembers `from` (the care button pressed, or null); paints the eight slots through `_paintCaps`; sets the tint class; writes the announcement to its own live node; moves focus to the first live slot. Entering the **same** `id` again only repaints: no `onExit`, no new announcement, `from` kept. Entering **another** id calls the old mode's `onExit(card, s, "replace")` first; a game's `onExit` ignores `"replace"` and `"game"` (it must not end the game that is replacing it), and `from` stays the care button, never a swapped cap. |
| `_modeSync(s)` | Repaints the slots from the slot functions. Cheap and idempotent. Called by every writer in 3.2 rule 2 and by `_paintCaps` on each hass push. |
| `_modeExit(s, reason)` | Idempotent: a no-op if `s.mode` is null. Sets `s.mode = null` first, then calls `onExit(card, s, reason)`, then restores the eight through `_paintCaps` from `s.careHome`, the care state of the last `_update`, never a snapshot taken at enter. Focus: if it was on one of the eight, it goes to `from` if that is live, else to the first live care button; if it was elsewhere, it stays. |
| `_modeClick(s, i)` | The router. One click handler per button, bound once at build, asks `s.mode`: null goes to the care handler as now. Otherwise: a live slot runs `act` (after closing an open status sheet first, as `_press` does at `card-actions.js:98`, review P2); a blocked or off slot does nothing, sends nothing, and calls no `_rimCue`. Every accepted press stamps `s.modeAt`. |
| `_modeGuard(s, now)` | The engine's own reasons for a non-game mode to end: idle and the optional `asleep`/`away`/`egg`. Called from `_update` (for the care-state reasons, where the flags are computed) and from `_tick` (for idle, which must not wait for a hass push; `_tick` returns early while `document.hidden`, so a hidden board ends on the first visible tick, which is fine). It is new in slice 1: neither hook exists in `_tick` today (review P4). |

Rules the engine keeps:

1. **Entry and exit belong to the mode. Games call them.** A game's `onExit` ends the game when
   the exit came from outside (`reason` other than `"game"` and `"replace"`); `_endGame` calls
   `_modeExit(s, "game")` as its last act. `_modeExit` never calls `_endGame` itself, and
   idempotence plus "`s.mode = null` first" is what stops the loop. The quit slot and Escape run
   `exit.slot`'s `act`, which for a game is the existing quit path (`_quitGame`, the server call,
   then `_endGame`) and for a non-game mode is `_modeExit(s, "quit")`.
2. **`_paintCaps` owns the eight buttons while a mode is on** (review P1). It is the one writer
   of `disabled`, `.wanted`, `.on`, `.armed`, `aria-description`, `aria-pressed`, `aria-label`,
   `title`, `aria-hidden`, the caption and the icon (with `data-icon`). `_update` stops writing
   them: it computes the care state (`{ disabled, wanted, on, icon, cap, title }` per button) and
   hands it to `_paintCaps(s, care)`. With `s.mode` null, `_paintCaps` writes that state to the
   DOM as `_update` does today. With a mode on, it stores it as `s.careHome`, writes **no** care
   value, and calls `_modeSync`. The sites it replaces: `card-layout.js:697-704`, `:717-731`,
   and the reload loop at `:518`. A swapped cap never shows a care `.wanted` ring or "wanted now"
   (review P1); both come back at the exit from `careHome`. The reload branch ends the mode
   first (D10, 3.5), so its loop writes care alone again.
3. **One mode per slide, no stack.** A mode that wants to be modal says so in `exit`, not by
   stacking.
4. **Same box.** A swapped cap keeps the cap's size; only the icon, caption, `aria-label`,
   `title` and tint change. `_bands` and `_mould` read `.toy` rects and `--cap-*` (R3).
5. **The director.** A mode appears in `BUSY_OWNERS` as `{ name: "mode", busy: s => !!s.mode &&
   s.mode.busy !== false }`. `game` stays: it covers the picker and Hop's loading window, when
   `s.game` is set and `s.mode` is not. After the entry the two windows are equal, since
   `_endGame` clears `s.game` and exits the mode in the same call (review P19: there is no
   "result beat" to bridge). The completeness test that scans the table for the fields it names
   is updated in the same slice.
6. **No game words in the engine.** The `card-mode` part holds no `s.game`, `_endGame` or
   `GAMES`. A node test greps its source for them (section 6, slice 1). `_owned` (3.7) lives in
   `card-base`, which may.
7. **Fixed copy.** A mode's captions and labels are table copy. A mode never shows a
   household's free text on the shell (the privacy bar in AGENTS.md holds by construction).
8. **The announcement is its own node** (review P9). `s.live` (`.sr[role=status]`,
   `card-build.js:160`) is rewritten by `_write` (`:254`) and `card-tick.js:601`, and a game's
   first prompt follows its entry at once (`card-games.js:~288`), so the swap line would be
   replaced before it is read. The engine adds a second `.sr[role=status]` (`s.modeLive`) that
   nothing else writes. Its text is built by the engine as `"<announce>: <the live slots'
   labels>"`, e.g. "game buttons on: left, right, quit", so a screen reader learns which
   buttons. It is written once at the enter and cleared at the exit.

### 3.3 The feel of the swap

- The eight caps change icon and caption together with one cap-press-style rebound, then a
  tint so the change reads at a glance. One colour for every game (D5). Under `calm()` and the
  OS reduced-motion rule (the top of `style.js`) there is no rebound and no fade: it is an
  instant change.
- **The tint is a custom property on `.device` and one rule that outranks the finishes**
  (review P10). The caps are painted by the `.finish-*` rules (`style.js:154-286`, which use
  `:nth-child`), by `.device[class*="finish-"] .toy.wanted/.on .cap` (`:285-286`) and by
  `--cap-tones` (`card-layout.js:~203`, per device). The rule is `.device.moded .toy .cap {
  background: var(--mode-tint) }` with a selector at least as specific as the strongest of
  those (the slice proves it with a numeric check, below), written after them. `--cap-tones`
  stays (the shading keeps the shell's volume); only the colour changes. The see-through
  finishes (`clear`, `rainbow`, `sunset`, `twotone`, `smoke`) that `_bands` cuts are in the
  check.
- The swap uses `translate`/`scale`/colour only, no `transform`, so the AGENTS.md motion
  rule does not bite (caps already use `translate`). If slice 1 finds it needs a keyframe on
  `transform`, it checks `tests/js/motion_rule.test.js` first.
- A swapped `.toy` keeps its `data-action` (review P21): the rebound curve stays the care's
  (feed's curve on slot 1), and `_modeClick` calls no `_rimCue`, so no rim class lands.
  `tests/js/cap_press.test.js` is extended to say so.
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

`-` is an off slot. Hop's 5-8 follow the board, as its keys do today (`card-board.js:~496-498`,
review P6): on a **solved** board, 5 (special) and 6 (undo) are blocked, 7 (restart) is live
only when the board is not tidy and the server has settled it (blocked otherwise), and 8
(quit) is live. There is no "lost" state: `done` comes from the nest only. Special is a toggle:
its slot `on` is `g.special`.

Nothing exceeds eight, and Hop uses all eight. A future mode that wants more keeps its own
on-screen keys. **Hop's future hint (Hop ship 5) goes on the board, not on a ninth key**
(owner decision D9): a tap on the nest or a long-press, which that ship designs. The Hop plan's
reserved eighth cell or shared slot for `hint` (`docs/plan-2026-11-02-hop-of-the-day.md:126-128,
1157, 1209`) is released by this plan; the first mate updates that doc when slice 3 lands. The
picker is not a mode (D2).

### 3.5 Exits and interruptions

Quit is slot 8 (also Escape, and the old `.gx` while it exists). The exit rows, keyed by the
call site that fires them. "Game" is what happens to `s.game` today (it stays); "mode" is what
the engine adds. Reasons in **bold** are always on for every mode; the others are the entry's
`exit.on` / `exit.status` / `exit.idleMs`.

| call site | way out | game (as built, stays) | mode (new) |
|---|---|---|---|
| `card-build.js:269-271` | Escape | `_quitGame(s, _quitLine)` | moves to the device (below); runs `exit.slot`'s act |
| `card-build.js:302` | the `.gx` click | `_quitGame` | unchanged until slice 3 removes `.gx` |
| quit slot (new) | slot 8 | n/a | `exit.slot`'s act: `_quitGame` for a game, `_modeExit(s,"quit")` otherwise |
| `card-build.js:940` (`_go`) | **slide change**, a swipe, an arrow or a dot (`x.game && i !== to`) | `_quitGame(x, null)` | `_modeExit(x, "slide")` beside it |
| `card-build.js:752` (`_forget`) | **the slide now shows another pet** | `_endGame(s, null)` | `_modeExit(s, "forget")` beside it |
| `card-base.js:186` | **card teardown (disconnect)** | `_endGame(s, null)` | `_modeExit(s, "teardown")` beside it |
| `card-layout.js:515-519` (`s.reloading`) | **integration reload** (owner decision D10) | none today: the screen fades and the game stays | `_modeExit(s, "reload")` before the loop that disables the eight; a game's `onExit` ends the game (a game-side change, slice 2) |
| `card-layout.js:681` | asleep, away, egg | `_endGame(s, null)` | `_modeGuard` reasons `asleep`/`away`/`egg`, if listed in `exit.on` (games list all three) |
| `card-layout.js:682-686` | idle | the three server games: `lastAt` and `!busy` (`GAME_IDLE_MS`, 3 min) | `_modeGuard`: `exit.idleMs` with `idleAt(s)` (default `s.modeAt`) and `idleHold(s)` (default false). Hop gets 3 min (owner decision D7): `idleAt` is its last accepted press, `idleHold` is `g.busy`, a settle in flight and `hopLoading`; the exit is the quit path, so the board parks as it does on a quit. Slice 3 sets `lastAt` on every Hop input. |
| `card-layout.js:785` (`_toggleStatus`) | the status sheet opening | `_quitGame(s, null)` (D8: this stays) | `exit.status`: `"end"` (the games, `_modeExit(s,"status")`) or `"keep"` (the mode stays, and a press on a swapped cap closes the sheet first). A non-game mode picks per mode in its table entry (D8). |
| `card-games.js:426, :583` | game over (win, loss) | `_endGame` after the result | `_endGame` calls `_modeExit(s,"game")` |
| `card-games.js:365, :400, :543`; `card-board.js:180/185/193` | a refusal, someone else playing, a reply that cannot be played | `_endGame(s, line)` | the same. The server games enter at `_pickGame`, before the answer, so a refusal swaps the shell and restores it within a few frames: accepted (review P11), and slice 2 proves the restore. Hop enters at `_hopStart`, after the answer, so Hop's open failures never swap. |
| `card-games.js:8` (`_startGame`) | Play pressed during the picker | `_quitGame` and a new picker | only reachable with no mode on: with D1 the Play cap is swapped during a game. No mode exit. |
| `_modeEnter` | another mode | n/a | replaced (3.2) |

Escape (review P5): the handler moves from `s.gameBox` (`card-build.js:269-271`) to the device
element (`.device`, which holds `.game` and `.buttons` in the template at `card-build.js:133`),
bound once at build in slice 1, because focus sits on a swapped cap (outside `.game`) after the
enter. It acts when `s.mode?.exit.escape` or `s.game` (the picker, as today) and the status
sheet is closed; with the sheet open the sheet's own handler (`card-build.js:~281`) keeps
Escape. The `gameBox` listener goes in the same slice so Escape never fires twice.

### 3.6 Access

- **aria.** On enter each `.toy` gets the slot's `aria-label` and `title`; on exit the home
  label comes back from `careHome`. One announcement for the swap, in its own live node (3.2
  rule 8). Blocked slots are `aria-disabled`; off slots are native `disabled`, `aria-hidden`,
  with an empty label, so a screen reader does not read "Feed" on a dead slot and Tab skips
  them. In a two-button game the Tab order is slot 1, slot 4, slot 8 (review P8). The
  focus-loss worry applies only to a live slot going dead, which `_paintCaps` never does
  natively. Hop reuses today's labels (`HOP_COPY`, the bench's `keyState`).
- **Focus.** The focus is on the pressed Play cap (slot 3) at enter. It moves to the first
  live slot (slot 1), as `_hopRefocus` does (which tests the slot instead of `.hk` from slice
  3), and goes back to `from` at exit (replacing `_endGame`'s `s.buttons.play?.focus`,
  `card-flair.js:208`; rule in 3.2).
- **Touch.** The `.toy` hit area is measured, not assumed (review P16): slice 1 records the
  `.toy` rect and the longest caption's fit at the bench's card widths 284, 300, 330 and 420.
  The claim "wider than 44 px, beats Hop's keys today (32 px at 300, 38 px at 330)" stays only
  if that measurement holds; the 284 px narrow card is checked first. Captions are one word,
  except Hop's special, which carries its count: its caption is whatever fits the measured
  width (a glyph and the count, "✦2", if "special 2" clips).
- **Keyboard.** Today only Tab and Escape work (no arrow handler on the board). Escape works
  from the moment the handler is on the device (slice 1), including with focus on a swapped
  cap. Slice 4 adds a mode-level `keys` map (arrows and WASD are Hop's directions, `Z` is
  undo, Esc is quit), active only when focus is in the card.

### 3.7 Who owns the screen (review P3, D6)

Today "a game owns the screen" is `s.game`, read in about 40 places outside the game parts
(section 2). A mode that sets only `s.mode` would let moments overwrite the bubble, a visitor
arrive and the pet wander, and the first non-game mode would fork the engine. So slice 1 adds
one predicate and replaces the reads mechanically:

```
_owned(s)  =  !!s.game  ||  !!(s.mode && s.mode.owns !== false)      // card-base
```

- Every read that asks "may this happen while something owns the screen" becomes `_owned(s)`:
  all of `card-moment`, `card-visitors`, `card-looks`, `card-link`, `card-actions.js:119`, and
  `card-tick` / `card-build` / `card-visit` except the allow-list below. `card-tick.js:654`'s
  `(s.game && !inGame)` becomes `(_owned(s) && !inGame)`: a non-game mode passes no `inGame`, so
  reactions are off under it.
- Reads that need the game object stay `s.game`: the prompt (`card-layout.js:689`,
  `card-tick.js:60`), the picker (`card-layout.js:12`, `card-build.js:547`), the exit sites
  (3.5), `_startGame`, the game parts themselves.
- `owns: false` is the opt-out for an ambient mode: it suppresses nothing on this list. There is
  no finer grain; a mode that needs a partial list adds a field and a node-test row (section 5).
- What a non-game mode therefore suppresses, as one list the plan owns: bubble moments and the
  babble (`card-moment`, `card-tick`), idle and wander, chatter and the queue, visitors and
  their basket, the first look and the follow-ups, the link, power-on and low-battery turns,
  care scenes, `_reactFrames` outside a game. The care request chip is not one of the eight and
  not in the swap; slice 1 checks its CSS state while a mode is on and lists what it finds.
- A node test (`tests/js/owned_reads.test.js`) reads the joined text: every `s.game` read
  outside `card-games`, `card-board` and `card-flair` is on an allow-list in the test (file,
  snippet, reason), and the count of `_owned(` calls is at least the number of replaced reads.
  A new `s.game` read fails with "use `_owned(s)` or list it with a reason".

## 4. Hop's board after the swap

The adult board is the widest (the server allows at most 6 x 4, `hop.py:122`, `:197`), so the
cell is width-bound by 6 columns and every smaller board gets a larger cell. With no key
block, `c = floor(min((W - 8) / 6, (H - 8) / 4))` for the overlay's W x H (the same formula as
`_hopLayout` minus `keysW`; bench json 198x148 / 228x171 / 272x204):

| bench card width | overlay W x H | cell today | cell after | note |
|---|---|---|---|---|
| 300 | 198 x 148 | 19 | 31 | +12 |
| 330 | 228 x 171 | 22 | 36 | measured in the mock |
| 420 | 272 x 204 | 28 | 44 (exactly 44.0 before the floor) | computed |

These are **bench values at one device pixel ratio** (review P15, P18). The shell's width is
rounded to whole device pixels (`px = round(... * dpr) / dpr`, `card-layout.js:42`), so the
overlay differs by a fraction at other ratios, and 272 - 8 = 264 / 6 = 44.0 exactly means a
fractional shortfall floors to 43 and the one-tap rule (`g.cell >= 44`, `card-board.js:~554`)
flips to "light first" at 420. So: the bench measures Hop at dpr 1, 2 and 3 at 300, 330 and 420
and at the Home Assistant column widths it lists, records the overlay and the cell for each,
and the plan states the cell as a **range**. The one-tap threshold stays `>= 44`; what is
proved is that the behaviour at each measured cell follows the rule, not that 420 is always 44.
The art (section 8) is drawn for the low end of each range.

The height has slack, so the board centres. `.gx`, `.hkeys` and `--hk --hr --hb`
(`style.js:535-541`, `card-board.js:360-372`) go, and `_hopLayout` gets simpler. Keep the
`Math.max(12, ...)` floor. Hop stays behind `experimental_hop` (`card-board.js:120`) through
all four slices; this plan does not lift the flag.

## 5. What a future non-game mode needs

Not built, but named so slice 1 does not close the door. Candidates: a question's answers
(two to four choices on the shell, `QUESTIONS` in `ui-copy.js`), the infrared link
(`card-link.js`), a visitor reply (pet / shoo / give), a photo mode (shutter, flip, close),
a yes/no confirm for the lay sheet, a journal or finds browser (prev, next, close).

What each needs from the engine, and where slice 1 provides it:

| need | slice 1 |
|---|---|
| a way in that is not Play | `_modeEnter(s, mode)` is called by anyone; the caller is not checked |
| a way out that is not `_endGame` | `_modeExit(s, reason)` and `exit.slot`; the game hook is one caller |
| slots that change as state changes | slot functions plus `_modeSync` |
| to be the one thing on screen | `owns` and `_owned(s)` (3.7): moments, visitors, wander, scenes, link all stand down |
| its own exit rules (a different idle, survives the sheet) | `exit` in the entry; the always-on reasons (slide, forget, teardown, reload) cannot be turned off |
| to opt out of "busy" (a long ambient mode that should let ambience run) | `busy` in the entry |
| to know about asleep, away, slide change | `_modeGuard` (3.2) and the 3.5 sites, not game code |
| fewer than eight inputs | off slots |
| more than eight inputs | not supported: the mode keeps on-screen keys |
| a slot that stays pressed | `on` and `aria-pressed` on the slot |
| its own tint | `tint` is a key into a set; only `"game"` ships |
| its own announcement and copy | `announce` and slot copy are table copy |
| save across reload | not supported: a reload ends the mode (D10) |

A mode that needs a thing outside this table adds a field to the entry and a node-test row,
not a branch in the engine.

## 6. The slices

Order: 1 → 2 → 3 → 4. Slices 2 and 3 each start after 1; 3 may start after 2 or in parallel
if the key hooks of `_hopKey` are not touched by both. Each slice states what card-check, the
bench and node tests must show; every acceptance line below is one of those three. A slice that
changes card methods runs `scripts/gate --auto`, but slices 1-3 change methods every slide
calls, so `scripts/pick-sections` will likely pick `all`: budget `scripts/ci-gate` (review P17);
the first mate gates the merged batch with it. Each slice that adds a part adds it to
`src/card/manifest.txt` and to the part table in AGENTS.md, and runs card-check once for the TDZ
order (`node --check` sees syntax only).

### Slice 1: the mode engine (no game changes)

New parts: `shell-modes` (the data; after `ui-copy`) and `card-mode` (the five methods and
`_paintCaps`; after `card-actions`, before `card-care`). `_owned` goes in `card-base`. The final
manifest position is for the slice to settle with card-check. The games are unchanged except
that `_endGame` ends with `_modeExit(s, "game")` (a no-op while no game uses a mode). The slice
also: moves `_update`'s care-button writes into `_paintCaps` (3.2 rule 2); replaces the
~40 `s.game` reads with `_owned` (3.7); moves Escape to the device (3.5); adds the sibling
`_modeExit` calls at `_go`, `_forget`, teardown, the reload branch and `_toggleStatus`; adds
`_modeGuard` to `_update` and `_tick`; adds the second live node; adds the tint rule; and adds
a `--mode probe` option to the bench (the probe mode is an object the bench injects, not a
table entry).

Acceptance:
1. `tests/js/shell_modes.test.js` (node, reads the joined text): every `SHELL_MODES` entry has
   exactly 8 `slots` (an object or null); resolved captions are non-empty and unique within a
   mode; every `aria` is non-empty; every non-null `act` is a function; `enabled` and `on`, when
   given, are functions; `exit.slot`, when set, is a non-null slot; `exit.status` is `end` or
   `keep`; `exit.on` holds only `asleep`, `away`, `egg`; the table is frozen deep; `tint` names a
   known tint.
2. The same test fails if the `card-mode` part contains `s.game`, `_endGame` or `GAMES`, and
   passes the schema check on a probe entry with no game linked (the test supplies it), one
   with `owns: false`, and one with `exit.status: "keep"`.
3. `tests/js/owned_reads.test.js` (3.7) passes, and fails when a probe `s.game` read is added
   outside the allow-list.
4. `tests/js/interaction_director.test.js` (its completeness scan) passes with the `mode`
   owner added to `BUSY_OWNERS`, and `tests/js/cap_press.test.js` passes with the added
   assertion that a mode leaves `data-action` unchanged (review P21).
5. Card-check section `shellmode`, driving the engine through `card.evaluate` with the probe
   mode as an object (the table names only shipped modes): after `_modeEnter`, all 8 `.toy`
   show the probe's icon, caption, `aria-label`, `title` and the tint class; off slots are
   native `disabled`, `aria-hidden`, with an empty label; the Tab order walks the live slots
   only; the mode's live node holds the announcement with the live slots' labels, and still
   holds it after a `_write(prompt)`; a press on a care slot sends no `button.press` (spy on
   `callService`), a press on a live slot runs its `act`, a press on a blocked or off slot
   does nothing and adds no rim class; focus is on the first live slot.
6. In the same section, `_paintCaps` (review P1): with the probe on, flip `button.feed` and
   `switch.lights_out` to `unavailable` and push: slots 1 and 8 stay live, not `disabled`, and
   keep focus; a pet flag that would set `.wanted` leaves no `.wanted` or `aria-description` on
   any swapped cap; after the exit, feed is disabled, the lights show the **new** state, and the
   wanted ring is back (R2).
7. In the same section, every row of 3.5 that applies to a non-game mode, one probe run each:
   `_modeExit` direct, the quit slot, Escape with focus on a swapped cap (and with focus
   inside `.game`, and with the status sheet open, where only the sheet closes), idle
   (`exit.idleMs` with the clock set back, with `idleHold` true first to prove it holds),
   asleep, away, egg, status with `"end"` and with `"keep"` (and a press under the open sheet
   closes it first), `_go` to another slide, `_forget`, teardown, reload (D10), and a
   replace. Each proves the eight buttons match the snapshot taken before the enter on the
   **stable fields** only (review P12): `data-icon`, caption text, `aria-label`, `title`,
   `disabled`, `aria-description`, `aria-pressed`, `aria-hidden`, and the classes `wanted`,
   `on`, `armed`, the tint class. Transient classes and children are ignored by name:
   `tap-feedback`, `tapped`, `pressed`, `pending`, `failed`, and `.burst` spans. Focus is on
   `from` (or the first live care button), a second `_modeExit` is a no-op, and a replace by the
   same id sends no `onExit` and no second announcement.
8. A second slide keeps its care caps while the first is in a mode.
9. Under emulated reduced motion, no rebound class is set on enter or exit.
10. Bench (`--mode probe`, widths 284, 300, 330, 420): each `.toy` rect is at least 44 px wide
    and the longest caption fits its column (`scrollWidth <= clientWidth`) at every width;
    `.cap` and `.toy` rects are equal before, during and after the mode (R3); both written to
    the json the bench already makes.
11. Bench `--preset shells --mode probe`: for every finish in the preset, including the five
    see-through ones, the computed `background-color` of all 8 caps equals the tint (a numeric
    read, not a look), and `--cap-tones` is unchanged.
12. With the probe off, every existing card-check section passes with no assertion edited
    (slice 1 changes no game behaviour; the game's reload and Hop's idle land in slices 2 and 3).

### Slice 2: the three server games on the shell

`left_right`, `higher_lower` and `dig` get table entries (3.4). `.gl` and `.gr` leave the
overlay; `.game` keeps `.gscore`, `.gnum`, the prompt and (for now) `.gx`. `_pickGame` calls
`_modeEnter` from `_gameView`, with every slot but quit blocked while `g.busy`. The nine
`.gl/.gr` `aria-disabled` writes (`card-games.js:243/266/274/386/432/506-507/528/552`,
`card-flair.js:209`) become `g.busy` flips and `_modeSync` calls (review P11); the keep slot
keeps its empty-basket rule (`card-games.js:506`). `_update`'s idle block (`card-layout.js:
681-686`) moves into `_modeGuard`, reading `lastAt` as today. The reload branch ends a game
(D10). The glyphs and SVG icons ship (D5). The lit "go" fade becomes the live/dimmed slots.

Card-check sections that change, and no others: `play`, `resume` and `board` (the lines that
read `.gl`/`.gr` are 3 in `play`, 16 in `resume`, 2 in `board`; each is re-pointed to the slot,
and the commit lists them, review P17). The `.hk`, `.gx` and `.hkeys` lines (1, 2 and 12) wait
for slice 3.

Acceptance:
1. After the pick, within one frame, the 8 buttons show the game's slots; slots 1 and 4 play
   the two moves; 2, 3, 5, 6, 7 are off; 8 quits. `.gl` and `.gr` are not in the DOM.
2. Pressing a care slot, by click or by Enter on the focused cap, sends no `button.press` and
   starts no scene (D1).
3. While `g.busy`, slots 1 and 4 are `aria-disabled="true"` and a double tap sends one
   `play_game` call (spy); quit stays live.
4. Every row of 3.5 restores the stable-field snapshot for each of the three games: quit, Escape
   (focus on a swapped cap), game over (win and loss), idle (the existing rule), asleep, away,
   egg, `_go`, `_forget`, teardown, reload (the game now ends, D10), the status sheet (the game
   ends, D8), and a refusal at the entry (restored within the beat, no `play_game` left
   pending). After a game over, the care Play cap is back and opens the picker.
5. Dig's keep: with an empty basket slot 1 is `aria-disabled="true"`, not `disabled`, and
   keeps focus.
6. A node test on the three entries: slots 1 and 4 only live (the rest off), captions are the
   study's (below) and unique, `exit.status` is `end`, `exit.on` has all three, and the Tab
   order is slot 1, slot 4, slot 8.
7. The picker is unchanged: the Hop row and `.gpick` are still on screen and the shell is
   care until a game starts (D2).
8. Two cards on the same pet (review P22; the three games share `digShared`,
   `prefs.js:339`): card A in a dig and card B at rest keeps its care caps; B's Play then dig
   gets the "someone else is playing" refusal, restores its caps, and leaves A's untouched.

### Slice 3: Hop on the shell

`hop` gets its table entry, entered at `_hopStart`. The `.hkeys` block, `.gx`, `--hk --hr --hb`
and `HOP_KEYS`'s rendering go; `_hopKey`, `_hopTap`, `_hopRefocus` stay and are driven by `act`
(`_hopRefocus` tests the slot, not `.hk`); `_hopDraw` ends with `_modeSync`, the one place that
sets Hop's key state. `g.lastAt` is set on every accepted Hop input and Hop gets
`exit.idleMs = GAME_IDLE_MS` (D7). The board takes the whole overlay. The bench's `hopInfo`
(`dev/bench/page.js:782-798`) and `keyState` and the Hop sections of card-check (the `.hk`,
`.gx` and `.hkeys` lines: 12 in `board`, 2 in `resume`, 1 in `play`) move to `.toy`. There is
no visual golden to regenerate: the only Hop golden, `tests/fixtures/hop_golden.json`, is
server boards, which this change cannot touch (review P17).

Acceptance:
1. `tests/js/hop_board.test.js`: the layout function returns a cell of at least 31 / 36 / 44
   px for overlays of 198x148 / 228x171 / 272x204, never below the floor of 12, and one pixel
   narrower than 272 returns 43; a smaller board (any of the six families, smaller than 6 x 4)
   gets a cell no smaller than the 6 x 4 one.
2. Bench Hop shots at card widths 300, 330 and 420, at dpr 1, 2 and 3: `hopInfo` records the
   overlay and the cell for each (the ranges of section 4); the board is centred; no element is
   clipped.
3. Card-check Hop sections: slots 1-4 move left/up/down/right; blocked moves are
   `aria-disabled` with the existing "blocked" labels; 5 is special, shows its count and
   toggles `aria-pressed`; 6 undoes; 7 restarts; 8 quits; a cell tap still works and follows
   the rule `g.cell >= 44` at the measured cell (lights first below, commits at once at or
   above).
4. A solved board (review P6): 5 and 6 are blocked, 7 is live only when the board is not tidy
   and settled (blocked on a tidy or unsettled one), 8 is live; leaving restores the snapshot.
5. Hop's idle (D7): a board left for `GAME_IDLE_MS` with the clock set back ends, the care
   buttons are back, the board is resumable from the parked list; the same clock does not end
   it while `g.busy`, a settle or `hopLoading` is in flight.
6. The same exit rows as slice 2 for Hop (3.5), including the status sheet ending it and a
   reload ending it.
7. `.hkeys`, `.hk` and `.gx` are gone from `style.js` and the card (grep in the node test).
8. The Hop settle-other and the Hop sections of the card-check keep their assertions, or each
   change is listed in the commit.
9. Hop is still behind `experimental_hop` (a flag-off card has no Hop row and no Hop mode).

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
3. Bench `--preset ui` shows the icons at 300/330/420 with the `.cap` and `.toy` rects
   unchanged from slice 1's numbers (R3).

## 7. Risks

| # | Risk | How it is covered |
|---|---|---|
| R1 | Care buttons are unavailable mid-game: a behaviour change (D1). | Decided. Slice 2 acceptance 2 proves it; the swap and the announcement say so. |
| R2 | `_update` repaints `disabled`, `.wanted`, `.on`, `aria-description`, the icon and the caption of all eight (`card-layout.js:697-731`) and the reload loop disables them (`:518`); a swap would be painted over, or a quit slot natively disabled. | `_paintCaps` is the one writer (3.2 rule 2); slice 1 acceptances 6 and 7 prove an entity going `unavailable` mid-mode, and the new state at exit. |
| R3 | A swapped icon changes the cap box, and `_bands`/`_mould` (which read `.toy` rects and `--cap-*`) misplace the shell. | Same box rule (3.2 rule 4); slice 1 acceptance 10 compares rects before, during and after and measures the hit area and caption fit; slice 4 re-checks with the pixel icons. |
| R4 | A stale cap after an exit path nobody tested. | The 3.5 table lists every real call site; slices 1-3 prove each row on the stable-field snapshot; `_modeExit` restores from `careHome`. |
| R5 | Bench `keyState`/`hopInfo` and the Hop card-check sections read `.hk`. | Slice 3 re-points them; its acceptance 8 forbids silent assertion edits; the lines are counted in the slice text. |
| R6 | Screen-reader users lose the Hop labels, or hear "Feed" on a dead slot. | The swap carries the labels (3.6); off slots are `disabled`, `aria-hidden`, unlabelled; one announcement in its own node, listing the live buttons. Slice 3 acceptance 3 checks the labels. |
| R7 | A first-time player sees the old picker until they pick. | D2: by design. |
| R8 | An engine that knows only games would force the next mode to fork it, through `s.game`'s ~40 reads. | D6: `_owned` and the allow-list test (3.7); the engine part has no game words (slice 1 acceptance 2); `_modeExit` never calls `_endGame`; the probe mode is not a game. |
| R9 | `click` handlers bound at build fire care on a swapped button. | One router (`_modeClick`) is the only handler; slice 1 acceptance 5. |
| R10 | `data-action` still names the old care, so the rebound curve and `_rimCue` fire the care's. | `data-action` is left alone: the curve stays the care's by design (3.3), the router calls no `_rimCue`, and `cap_press.test.js` says so. |
| R11 | A new part in `manifest.txt` hits a TDZ error. | Card-check in slice 1 (AGENTS.md). |
| R12 | The cell sizes in section 4 are for the adult board, from one bench overlay, at one dpr. | Ranges, not points; the bench measures dpr 1-3; smaller boards get larger cells; slice 3 acceptances 1 and 2. |
| R13 | Motion: a rebound on the caps meets the shared-transform rule. | 3.3: translate/scale/colour only, `calm()` honoured; `motion_rule.test.js` run with the slice. |
| R14 | The tint loses to a finish rule, or vanishes on a see-through shell. | Slice 1 acceptance 11 reads the computed colour of every cap over every finish. |
| R15 | A wall tablet left on a Hop board has dead care buttons for ever. | D7: Hop idles out at 3 min; slice 3 acceptance 5. |
| R16 | A reload or a status-sheet open leaves a mode half on. | D10 and D8: both end the mode; slice 1 acceptance 7 and slice 2 acceptance 4. |

## 8. The Hop art

Art ship **s2874** (pixel art for every Hop board) is paused at the woodland family on
`crew/hatch-at-home-s2874-hop-board-art-pixel-art-for-ev@1ec8cd29`. It was drawn for cells of
19/22/28 px. It resumes **after slice 3**, at the new cells of roughly **31/36/44 px** (up to
57-64% larger): these are bench values, and the shell's width depends on the device pixel ratio
(section 4), so the art takes the low end of each measured range from slice 3 acceptance 2, not
the three round numbers. The first mate tells s2874 the size changes before slice 3 lands. For
the art: keep the cell art on the 12 px floor, expect the board to centre in the overlay with
no right column, and re-check the woodland tiles already drawn at the larger sizes. Hop stays
behind `experimental_hop` throughout.

## 9. Player copy (proposals; need first-mate copy approval before they ship)

The study proposed only these, as proposals. Nothing else here is player-facing.

- The swap announcement for the status line: "game buttons on" (the engine's `announce`), which
  the engine extends with the live slots' labels: "game buttons on: left, right, quit".
- The quit caption: "quit" or "done" (the study leaned to "quit").
- The special caption: "special", with its use count, or a glyph and the count if the measured
  column clips it (3.6).
- The slot captions: "keep" and "dig" (dig), "lo" and "hi" (higher_lower, today's `.gl`/`.gr`
  text), and the Hop labels from `HOP_COPY`, which stay as built. The left_right slots reuse
  the existing prev/next arrows with no caption.
- Off slots have no caption and no label.

## 10. Owner decisions on the review, and what is open

Answered 2026-11-04 (the first mate adds them to the section 1 table as D7-D10):

| # | Decision | Where it lands |
|---|---|---|
| D7 | **Hop gets a 3-min idle exit, like the server games; the care buttons come back on its quit.** | 3.5 idle row, slice 3 acceptance 5, R15 |
| D8 | **Opening the status sheet keeps ending a game; a non-game mode chooses per mode** (the `exit.status` field of its table entry). | 3.1 `exit`, 3.5 status row, slice 1 acceptance 7 |
| D9 | **Hop's future hint goes on the board (a tap on the nest, or a long-press), never a ninth key; the 8 slots stay.** | 3.4 |
| D10 | **An integration reload (`s.reloading`) ends the mode.** | 3.5 reload row, slice 1 acceptance 7, slice 2 acceptance 4 |

Open: none for the owner. The two small things the slices settle on their own: the final
manifest position of the two new parts (slice 1 finds it with card-check), and whether the
`.moded` tint is a custom property or a class (slice 1; either serves the one colour of D5).
The one decision this revision took without the owner, for the first mate to confirm: the
server games enter the mode at `_gameView`, before the server answers, and accept a one-beat
swap-and-restore on a refusal (3.5), rather than moving the entry after `_playCall`.
