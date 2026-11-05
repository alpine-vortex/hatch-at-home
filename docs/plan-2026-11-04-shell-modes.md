# Shell modes: the shell buttons become inputs

**Date:** 2026-11-04
**Status:** Plan only, revised 2026-11-04 after the adversarial review (s2878, findings P1-P22,
folded in here and cited as "review P#"). Four slices; **slices 1 (the engine), 2 (the three
server games) and 3 (Hop) are built and on main** (slice 1 `a698d6d7`). **Slice 4 is split
(2026-11-05, from the s2907 review, cited "review S4 #n"): 4A, the pixel icons, is BUILT and on
main (`7af36efd`, s2911; its deviations are in section 6); 4B, the keys, is built** (s2919, owner
answers of 2026-11-05 in section 6; it was parked, D11, until the Hop art and the icon wiring were done).
**Basis:** `5e7616c0` (`fm-hop-exp`) for sections 2 and 4 (the "as it was" tree). Where a ref in
sections 3.5-3.6 and 6 names a line that slice 1 moved, it has been re-pointed to main
(`a75f00e1`, 2026-11-04); recheck when a slice starts (the card parts move often).
**Owner decisions** D1-D6 are in section 1. D7-D10 (the owner's answers to the review's four
questions, 2026-11-04) are cited where they bite, listed in section 10 and in the section 1 table.
**Source:** the s2875 design study (`report.md` and two mocks, `today-330.png` and
`proposed-330.png`, archived with that worker). Its five questions are answered in section 1.

## Reconcile after slice 1 (s2886, 2026-11-04)

Slice 1 shipped as built (report: s2880, `report.md` in the archive; merged `a698d6d7`, with
the shard 4 fix). The engine is `src/card/shell-modes.js` (data, schema `shellCheck`,
`shellIcon`, `shellText`, `shellFreeze`), `src/card/card-mode.js` (`HatchPetCardMode`:
`_modeEnter/_modeExit/_modeSync/_modeClick/_modeGuard/_modeEscape`, `_paintCaps`), `_owned` in
`card-base`, and `tests/js/shell_modes.test.js`, `owned_reads.test.js`. `SHELL_MODES` is empty.
What changed in this document:

- **Wrong claim fixed: the 44 px touch target (3.6, slice 1 acceptance 10, R3).** The `.toy` is
  **39.5 px wide at card width 284 and 43.02 px at 300** (49.61 at 330, 59.3 at 420; grid
  `repeat(4, minmax(0,1fr))`, 6 px gap), so "at least 44 px" and "beats Hop's keys" do not hold at
  the two narrow widths. Slice 1 changed no layout (R3, goldens) and the engine still ships. What
  slice 2 does about it is **question Q-A** below; until answered, slice 2 builds on the
  measured widths and changes no layout.
- **Caption fit:** "special 2" clips at 284 and 300 everywhere, and at 330 on the `pad` mould;
  slice 3 uses the fallback "✦2" (3.6, section 9). Keep every caption at or under about 40 px at
  284 (`mode-pass-widths.json` has `column` and `captionW`).
- **Acceptance 11 names `--preset finishes`**, not only `shells` (`shells` has no see-through
  finish).
- **Slice 2 was missing `.gl`/`.gr` sites** (focus calls, the tap feedback, the `showgo` fade,
  the click listeners, the CSS), and had the lit "go" fade backwards. Corrected in slice 2.
- **Line refs re-pointed** in 3.5, 3.6 and slices 2-3 (the engine moved Escape to the device and
  added the sibling `_modeExit` calls); the idle row now says what `_modeGuard` reads.
- **Shard 4 lesson (a new rule, section 6):** a card-check step that taps or reads the pet
  over a second or two must hold the card's idle still with `quietIdle(card)` (card-check.js:167)
  when a section shifts. Two CI failures that got slice 1 reverted were idle moves landing in a
  check's wait (touch: an idle `look` between two head taps; visitors: a move in the 150 ms
  between `vprep` and `__vtick`), on a slow runner. The fix was `quietIdle` round those steps,
  no assertion edited. Slices 2 and 3 move sections around and add steps: use it.

**Open for the FM (neither is the owner's unless the FM says so):**

**Answered 2026-11-04 (FM, as recommended):** Q-A: **accept** 39.5/43 px at 284/300; no layout change. Q-B: captions **"left"** and **"right"**, approved copy.

- **Q-A, touch at 284 and 300.** Accept 39.5/43 px (drop the 44 px claim; the shell's round
  buttons are the same targets players use for care today) or have slice 2 (or a slice 1b) widen
  the grid at narrow widths (a layout and golden change, R3)? Recommendation: accept; Hop's
  keys today are 32 px at 300 and 38 at 330, so the swap is still larger than they were, and the
  care buttons already live at this size.
- **Q-B, left_right's captions.** Section 9 gave its two slots "no caption", but the schema test
  (`shell_modes.test.js` `entryProblems`) and acceptance 1 need non-empty, unique resolved
  captions. Recommendation: caption them "left" and "right" (in the voice of "lo"/"hi", "keep"/
  "dig"). That is new player copy, so it needs FM approval before slice 2 ships it.

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
| D5 | **Existing icons and glyphs first, pixel icons later; one game tint colour.** The first slices ship the current SVG icons and glyphs (`icon("prev")` etc., `prefs.js:17-20`; the "✦ ↶ ↻ ✕" the mock used). The pixel icons followed in slice 4A (built, `7af36efd`). The tint is one colour for every game, not the world's accent. |
| D6 | **The engine is a general shell mode.** The owner: "We may use this for other modes and features in the future outside of games, so keep that in mind during design." So a mode is a table entry (8 slots, a tint, an exit rule) with its own enter and exit; games call them. Nothing in slice 1 may assume a game. |
| D7 | **Hop idles out after 3 minutes**, like the server games; the care buttons come back on its quit, so a forgotten board can't lock the shell. (Owner 2026-11-04, review Q1.) |
| D8 | **Opening the status sheet keeps ending a game** (`card-layout.js:786`, as built). A non-game mode chooses per mode (`exit.status`). (Owner 2026-11-04, review Q2.) |
| D9 | **Hop's future hint goes on the board** (a tap on the nest or a long-press), never a ninth key; the 8 slots stay. (Owner 2026-11-04, review Q3.) |
| D10 | **An integration reload (`s.reloading`) ends the mode.** Modes are not saved across a reload. (Owner 2026-11-04, review Q4.) |
| D11 | ~~Slice 4B (keys) is parked~~ **Lifted 2026-11-05** (owner): the Hop art (s2874) and the icon wiring (4A) are done; 4B is built (s2919). |
| FM2 | **Q3 (2026-11-05):** Hop's special cap is the **bare count** once it has a pixel icon (the "✦2" goes); its `aria-label` keeps the word "special". For 4B: **S = special, R = restart**. First mate. |
| FM3 | **Q4 (2026-11-05):** the mode icons are drawn for the pale-blue `#c4e2f2` face only (D5 gives one game tint); **the owner signs the art** before merge. First mate. |
| FM | Server games enter the mode at `_gameView` (before the server answers) and accept a one-beat swap-and-restore on a refusal (review P11). First mate, 2026-11-04. |

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
  the prompt. Only the inputs move. A 2-input game's "go" fade (`.game.showgo .gl, .gr {
  opacity: .15 }`, `style.js:431`, set at `card-games.js:412`) exists so the pet shows from under
  the two on-screen buttons; once the inputs are on the shell nothing covers the pet, so
  `showgo` goes with `.gl`/`.gr` (slice 2). The slots are already dimmed while the guess is out,
  by the blocked state (`g.busy`, `.toy[aria-disabled="true"]`, `style.js:1728`, opacity .6).

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
(owner decision D9): a tap on the nest or a long-press, which that ship designs. Slice 3 has
landed with all eight slots used and no hint slot (`shellHop` in `shell-modes.js`). The Hop
plan's reserved eighth cell or shared slot for `hint` (`docs/plan-2026-11-02-hop-of-the-day.md:126-128,
1157, 1209`, and "the hint key is a ninth key" at `:1774`) is released by this plan; the Hop plan
was updated to say so (s2912, 2026-11-05). The
picker is not a mode (D2).

### 3.5 Exits and interruptions

Quit is slot 8 (also Escape, and the old `.gx` while it exists). The exit rows, keyed by the
call site that fires them. "Game" is what happens to `s.game` today (it stays); "mode" is what
the engine adds. Reasons in **bold** are always on for every mode; the others are the entry's
`exit.on` / `exit.status` / `exit.idleMs`.

| call site | way out | game (as built, stays) | mode (new) |
|---|---|---|---|
| `card-build.js:273-277` | Escape | `_quitGame(s, _quitLine(s))` (`:276`) | **built (slice 1):** on `.device`, `_modeEscape` runs `exit.slot`'s act (below) |
| `card-build.js:306-308` | the `.gx` click | `_quitGame` | unchanged until slice 3 removes `.gx` |
| quit slot (new) | slot 8 | n/a | `exit.slot`'s act: `_quitGame` for a game, `_modeExit(s,"quit")` otherwise |
| `card-build.js:951` (`_go`) | **slide change**, a swipe, an arrow or a dot (`x.game && i !== to`) | `_quitGame(x, null)` | **built:** `_modeExit(x, "slide")` beside it (`:952`) |
| `card-build.js:762` (`_forget`) | **the slide now shows another pet** | `_endGame(s, null)` | **built:** `_modeExit(s, "forget")` beside it (`:763`) |
| `card-base.js:193` | **card teardown (disconnect)** | `_endGame(s, null)` | **built:** `_modeExit(s, "teardown")` beside it (`:194`) |
| `card-layout.js:515-518` (`s.reloading`) | **integration reload** (owner decision D10) | none today: the screen fades and the game stays | **built:** `_modeExit(s, "reload")` (`:518`) before the loop that disables the eight; a game's `onExit` ends the game (a game-side change, slice 2) |
| `card-layout.js:683` | asleep, away, egg | `_endGame(s, null)` | **built:** `_modeGuard` reasons `asleep`/`away`/`egg`, if listed in `exit.on` (games list all three); `_modeGuard` is called at `card-layout.js:732` and `card-tick.js:32` |
| `card-layout.js:684-687` | idle | the three server games: `lastAt` and `!busy` (`GAME_IDLE_MS`, 3 min); the dig's idle line is `GAME_COPY.idle` | **built:** `_modeGuard`: `exit.idleMs` with `idleAt(s)` (default `s.modeAt`; a falsy `idleAt` never idles, as an unset `lastAt` today) and `idleHold(s)` (default false); slice 2 moves the block (the dig's idle line moves to its `onExit`, which gets reason `"idle"`). Hop gets 3 min (owner decision D7): `idleAt` is its last accepted press, `idleHold` is `g.busy`, a settle in flight and `hopLoading`; the exit is the quit path, so the board parks as it does on a quit. Slice 3 sets `lastAt` on every Hop input. |
| `card-layout.js:786-788` (`_toggleStatus`) | the status sheet opening | `_quitGame(s, null)` (`:786`, D8: this stays) | **built (`:788`):** `exit.status`: `"end"` (the games, `_modeExit(s,"status")`) or `"keep"` (the mode stays, and a press on a swapped cap closes the sheet first). A non-game mode picks per mode in its table entry (D8). |
| `card-games.js:426, :583` | game over (win, loss) | `_endGame` after the result | `_endGame` calls `_modeExit(s,"game")` |
| `card-games.js:365, :400, :543`; `card-board.js:180/185/193` | a refusal, someone else playing, a reply that cannot be played | `_endGame(s, line)` | the same. The server games enter at `_pickGame`, before the answer, so a refusal swaps the shell and restores it within a few frames: accepted (review P11), and slice 2 proves the restore. Hop enters at `_hopStart`, after the answer, so Hop's open failures never swap. |
| `card-games.js:6` (`_startGame`) | Play pressed during the picker | `_quitGame` and a new picker | **Changed in slice 3 (FM, 2026-11-04):** Play pressed while the picker is open **closes** it (`_endGame`), because the picker has no close button once `.gx` goes. Only reachable with no mode on: with D1 the Play cap is swapped during a game. No mode exit. |
| `card-build.js` (the screen's click) | a tap on the screen outside the picker's list (slice 3, FM 2026-11-04) | none (a tap with a game on show did nothing) | **Closes the picker** (`_endGame`), never opens the status sheet; a swipe does not. A started game keeps its screen. |
| `_modeEnter` | another mode | n/a | replaced (3.2) |

Escape (review P5, **built in slice 1**): the handler moved from `s.gameBox` (it was `card-build.js:269-271`) to the device
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
  3), and goes back to `from` at exit (`_modeExit`'s rule, 3.2; `_endGame`'s own `s.buttons.play?.focus`,
  `card-flair.js:207`, only fires when focus was inside `.game`, so it is a no-op once the inputs
  are on the shell; slice 2 removes it).
- **Touch (measured in slice 1, review P16; the 44 px claim did not hold).** The `.toy` is
  **39.5 px wide at card width 284, 43.02 at 300, 49.61 at 330 and 59.3 at 420** (woodland
  default mould, every dpr and big text; over the presets 330 is 44.94-55 and 420 is
  56.98-69). So the buttons are under 44 px at the two narrow widths, and above it from 330.
  They are still wider than Hop's keys today (32 px at 300, 38 px at 330) at 300 and up, and
  the same size as the care buttons players already press. What to do at 284/300 is **Q-A**
  (top of this document); slice 2 changes no layout until it is answered. Captions are one
  line, clipped rather than wrapped, each at or under about 40 px at 284. Hop's special
  carries its count and **"special 2" clips at 284 and 300 everywhere and at 330 on the `pad`
  mould**, so slice 3 used the glyph and the count, "✦2" (it fits at 420). **With the pixel icon (4A,
  built) the cap is the bare count (FM2, 2026-11-05), so the clip is gone**; the `aria-label` still
  says "special".
- **Keyboard.** Today only Tab and Escape work (no arrow handler on the board). Escape is
  **built** (slice 1): it works from the moment the handler is on the device, including with
  focus on a swapped cap, and the table modes all set `escape: true` on slot 8. The arrow and
  letter keys are **slice 4B, built** (section 6): a `keys` array on each slot, routed through
  `_modeClick`, with the design notes and acceptance recorded there.

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
- **As built (slice 1):** 32 reads became `_owned(s)`, and 18 stay `s.game`, each on the allow-list
with its reason (the list, not "about 40", is the count to trust). A node test (`tests/js/owned_reads.test.js`) reads the joined text: every `s.game` read
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

Order: 1 → 2 → 3 → 4A → 4B. Slices 1-3, 4A and 4B are built. Each slice states what card-check, the
bench and node tests must show; every acceptance line below is one of those three. A slice that
changes card methods runs `scripts/gate --auto`, but slices 1-3 change methods every slide
calls, so `scripts/pick-sections` will likely pick `all`: budget `scripts/ci-gate` (review P17);
the first mate gates the merged batch with it. Each slice that adds a part adds it to
`src/card/manifest.txt` and to the part table in AGENTS.md, and runs card-check once for the TDZ
order (`node --check` sees syntax only).

**Card-check timing rule (the shard 4 lesson).** Slice 1's first merge was reverted when CI's
shard 4 failed on a slow runner: idle moves (`look`, `wander`) landed in a check's wait, between
two head taps in `touch` and between `vprep` and `__vtick` in the visitors' reduced-motion step.
The fix was `quietIdle(card)` before the step and `quietIdle(card, false)` after
(`scripts/card-check.js:167`; no assertion edited). Slices 2-4 re-point and add sections, so a
touch, visitor or timed-read step that a slice moves or adds is wrapped the same way, and the
same flake is likely on any section whose steps wait a second or two on a pet that can move.
A local pass does not prove it (the runner was 3-4x slower than a green one); wrapping is cheap.

### Slice 1: the mode engine (no game changes) - BUILT, merged `a698d6d7`

As written before the build; the as-built differences are in "Reconcile after slice 1" at the top
(acceptance 10 and 11 are corrected below, the rest held).

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
10. Bench (`--mode probe`, widths 284, 300, 330, 420): the `.toy` width and the longest
    caption's fit (`scrollWidth <= clientWidth`) are recorded at every width, and the captions
    fit; `.cap` and `.toy` rects are equal before, during and after the mode (R3); written to
    the json the bench already makes (`mode-pass.json`). **As built: the plan's "each `.toy` is
    at least 44 px" is dropped; it is 39.5 px at 284 and 43.02 at 300 (3.6, Q-A).**
11. Bench `--preset shells --mode probe` and `--preset finishes --mode probe` (`shells` has no
    see-through finish): for every finish, including the five see-through ones, the computed `background-color` of all 8 caps equals the tint (a numeric
    read, not a look), and `--cap-tones` is unchanged.
12. With the probe off, every existing card-check section passes with no assertion edited
    (slice 1 changes no game behaviour; the game's reload and Hop's idle land in slices 2 and 3).

### Slice 2: the three server games on the shell

`left_right`, `higher_lower` and `dig` get table entries in `SHELL_MODES` (3.4; they are empty
today, and the node test's "slice 1 ships the engine only" assertion on `Object.keys(SHELL_MODES)`
changes with it). Each entry: `tint: "game"`, `exit: { slot: 8, escape: true, status: "end",
on: ["asleep", "away", "egg"], idleMs: GAME_IDLE_MS, idleAt: s => s.game.lastAt, idleHold: s =>
s.game.busy }`, and an `onExit(card, s, reason)` that does nothing for `"game"` and `"replace"`
and otherwise (idle, asleep, away, egg, reload) calls `card._endGame(s, line)` if `s.game` is
still set (3.2 rule 1: `_endGame` ends with `_modeExit(s, "game")`, which cannot loop). It is
`_endGame`, **not** `_quitGame`: as built, idle, asleep, away and egg make no server call
(`card-layout.js:683`, `:684-687`: "the server has dropped it already"). The sites that do call
`_quitGame` (Escape, the quit slot, `_go`, the status sheet) run it first, and its `_endGame`
exits the mode before the sibling `_modeExit` fires. The quit slot's `act` is
`_quitGame(s, _quitLine(s))`, as Escape's is today. The dig's idle line (`GAME_COPY.idle`) is the
`line` for reason `"idle"` on the dig only. `card-layout.js:683` (asleep/away/egg) stays: it still
serves the picker and Hop (no mode yet) and runs before `_modeGuard`, so for a game the two are
equal and `_modeExit` is idempotent.

How the card enters: `_gameView` is where the views are set (`card-games.js:223`; it is also
called with `"pick"` and `"hop"`, which must not enter a mode), so the three kinds call
`this._modeEnter(s, SHELL_MODES[kind], { from: s.buttons.play })` from `_pickGame` right after
`_gameView(s, kind)` (`:256`), with every slot but quit blocked while `g.busy`. The F13 restart
path (`_pickGame(s, data.game)` after the server lost the game, `card-games.js:362`) re-enters the
same kind while the mode is on: the same id only repaints (no `onExit`, no new announcement,
`from` kept), and `_pickGame` has already replaced `s.game`, so `idleAt` reads the new game's
`lastAt`. Slice 2 gets a card-check row for it.

What leaves the overlay and where each reference goes (the complete list, from a grep at main):
`.gl` and `.gr` leave `.game`; `.gscore`, `.gnum`, the prompt and (for now) `.gx` stay.
- `_gameView` (`card-games.js:234-243`): the innerHTML, `aria-label` and `hidden` writes become
  the entries' icons ("prev"/"next" for left_right, the stopgap glyphs, D5), captions and labels.
- The nine `aria-disabled` writes (`card-games.js:243/266/274/386/432/506-507/528/552`,
  `card-flair.js:209`) become `g.busy` flips and `_modeSync` calls (review P11); the keep slot
  keeps its empty-basket rule (`card-games.js:506`) as its `enabled(s)`.
- Focus calls on `.gl`/`.gr` (`card-games.js:290, 301, 592-594, 611`): "move focus to keep or
  dig" is now "focus slot 1 or 4"; `_modeEnter` already moves focus to the first live slot at the
  enter, so these only matter for the dig on an empty basket (focus must go to slot 4 when slot 1
  is blocked) and the post-reply re-check at `:592-594` (focus moves off a keep that just went blocked).
- `_guess`'s tap feedback (`card-games.js:375`, `this._tapped(.gl|.gr, s)`) points at the slot
  button instead (`s.buttons.<care key of slot 1 / 4>`), or is dropped; the press itself is
  `_modeClick`'s.
- The listeners `card-build.js:304-305` go. The `showgo` fade (`card-games.js:255/412/423`,
  `card-flair.js:211`, `card-board.js:245`, `style.js:431`) goes (3.3). The `.gl`/`.gr` CSS
  (`style.js:431-439, 708-709`) goes.
- `_endGame`'s own play-focus (`card-flair.js:207`) goes (3.6 Focus).

`_update`'s idle block (`card-layout.js:684-687`) moves into the entries' `exit.idleMs`, reading
`lastAt` as today; the matching `owned_reads.test.js` allow-list lines (`card-layout.js` idle x3)
go in the same commit, and the test fails on a listed read that is gone. The reload branch ends a
game (D10): the entry's `onExit` with reason `"reload"`. The glyphs and SVG icons ship (D5).

Card-check sections that change, and no others: `play`, `resume` and `board` (the lines that
read `.gl`/`.gr` are 3 in `play`, 16 in `resume`, 2 in `board`: 21 lines at main, recounted by
`grep -F`; each is re-pointed to the slot, and the commit lists them, review P17). The `.hk`,
`.gx` and `.hkeys` lines (1, 2 and 12: 15 at main) wait for slice 3. Every re-pointed or added
step that taps and waits wraps `quietIdle` (the shard 4 rule above).

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
9. The F13 restart path (3.5 table, slice 2 text): with the server answering `no_game` to a
   guess, the same kind is re-entered with the mode kept: one announcement only, `from` kept,
   the stable-field snapshot restored at the end. The idle exits end the game with `_endGame`
   (no `end` call on the spy) and the dig's idle line is the bubble.
10. Every new or re-pointed card-check step that waits on a pet that can move is inside
    `quietIdle` (the shard 4 rule in section 6); the commit lists the sections it touched.

### Slice 3: Hop on the shell

`hop` gets its table entry, entered at `_hopStart`. The `.hkeys` block, `.gx`, `--hk --hr --hb`
and `HOP_KEYS`'s rendering go; `_hopKey`, `_hopTap`, `_hopRefocus` stay and are driven by `act`
(`_hopRefocus` tests the slot, not `.hk`); `_hopDraw` ends with `_modeSync`, the one place that
sets Hop's key state. `g.lastAt` is set on every accepted Hop input and Hop gets
`exit.idleMs = GAME_IDLE_MS` (D7). The board takes the whole overlay. The bench's `hopInfo`
(`dev/bench/page.js:774-798`) and `keyState` and the Hop sections of card-check (the `.hk`,
`.gx` and `.hkeys` lines: 12 in `board`, 2 in `resume`, 1 in `play`; **the slice 3 worker found three more `.gx` lines than these counts**, so trust a fresh `grep -F`, not the numbers) move to `.toy`. There is
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

### Slice 4: the pixel icons (4A, built) and the keys (4B, built)

Optional and last. Folded in from the s2907 review (2026-11-05; cited "review S4 #n"). It is two
ships with no code in common: **4A** swaps the stopgap glyphs for pixel icons (an art job, then
a small code ship) and is **BUILT, on main `7af36efd`** (s2911; deviations below); **4B** adds keyboard keys and is **BUILT** (s2919; it was
parked, D11, lifted by the owner 2026-11-05). 4B does not need 4A, nor 4A 4B.
Escape needs neither: it is built (3.5, 3.6).

#### 4A: the pixel icons - BUILT, merged `7af36efd` (s2911, 2026-11-05)

The text below is the spec as briefed; the table's "today" column is the stopgap table before
4A. It shipped as specified, with these deviations and notes (s2911 `report.md`; ci-gate PASS on
the branch):

- **The probes use the glyphs ◀ ▶, not the SVG names `prev`/`next`.** The spec said probes keep
  "their glyphs and SVG names", but with the `ICON_PATHS` branch of `shellIcon` gone (as the spec
  asked) `prev`/`next` would render as the literal words. The bench's `PROBE_CAPS`, card-check's
  probe `ICONS` and its `want`, and the node test's probe all use ◀ ▶; the node test's two
  slots that tested the SVG use `icon_mode_left`/`icon_mode_right`. `shellIcon` is now: an
  `^icon_\w+$` key is `pixelIcon(key, 24)`, anything else a glyph. `ICON_PATHS` and `icon()` stay
  in `prefs.js` for the carousel arrows only.
- **Bench: the floor is per width, and there is a `mode-icons` preset.** `MODE_MIN_TOY` became
  `MODE_MIN_TOY_AT` (39.5 at 284, 43 at 300, 44 from 330; commit `c2e6788a`, first, acceptance 4).
  `mode-icons` is 51 shots over the real `SHELL_MODES` entries with a stub game (`mode: "table"`),
  at widths 284, 300, 330 and 420 (**284 added**; the spec listed 300, 330, 420), dpr 1-3, plus
  Hop armed, Hop blocked and dig blocked. `modePass` now covers table shots too (an armed cap's
  held-down `.cap` offset is left out of the `.cap` compare). 51 of 51 pass.
- **Version: the card's `VERSION` only (0.46.0 → 0.46.1).** `const.py`, `manifest.json` and
  `docs/features.md` still say 0.46.0, left to release prep (a manifest change would need its own
  gate).
- **R3 pair: a 0.28 px jitter at 300 dpr 3.** Of 1224 `.toy`/`.cap` rect comparisons, `.toy` rects
  differ nowhere and `.cap` rects are equal within 0.05 px except at card width 300, dpr 3, where
  the cap's y differs by up to 0.28 px. It shows in the no-mode state too and differs between two
  runs, so it was read as sub-pixel render jitter, not the icons; the old card was not re-rendered
  to prove it. The icon box went 12.3x20 glyph (22x22 for the left_right SVG) → 24x24 `<img>`.
- **Hop's special cap is `${count}`**, its `aria-label` unchanged (contains "special"); a card-check
  row asserts both.


**The icon table.** Every slot of all four modes maps to one of ten icons (review S4 #1). The
"today" column is `shell-modes.js` at `b7b5884d`; lo/hi reuse down/up (no extra art), and
left/right replace both the SVG `prev`/`next` of left_right and Hop's `◀`/`▶` glyphs.

| mode | slot | glyph today | icon key after |
|---|---|---|---|
| left_right | 1 | `prev` (SVG, `ICON_PATHS`) | `icon_mode_left` |
| left_right | 4 | `next` (SVG, `ICON_PATHS`) | `icon_mode_right` |
| higher_lower | 1 (lo) | `▼` | `icon_mode_down` |
| higher_lower | 4 (hi) | `▲` | `icon_mode_up` |
| dig | 1 (keep) | `✓` | `icon_mode_keep` |
| dig | 4 (dig) | `✱` | `icon_mode_dig` |
| hop | 1 (left) | `◀` | `icon_mode_left` |
| hop | 2 (up) | `▲` | `icon_mode_up` |
| hop | 3 (down) | `▼` | `icon_mode_down` |
| hop | 4 (right) | `▶` | `icon_mode_right` |
| hop | 5 (special) | `✦` | `icon_mode_special` |
| hop | 6 (undo) | `↶` | `icon_mode_undo` |
| hop | 7 (restart) | `↻` | `icon_mode_restart` |
| every mode | 8 (quit) | `✕` | `icon_mode_quit` |

That is **ten files**: `icon_mode_{left,right,up,down,keep,dig,special,undo,restart,quit}.png`
in `custom_components/virtual_pet/frontend/ui/` (review S4 #2). The `mode_` infix keeps them clear
of a future care icon (`icon_dig`, `icon_play` already exists). `shellIcon` already loads any
`^icon_\w+$` key as `${BASE}/ui/<key>.png?v=${VERSION}` (`pixelIcon`, `prefs.js:24-26`), so the
table only changes its strings.

**What goes dead, and what does not (checked at `b7b5884d`; this corrects the review, which
called `ICON_PATHS` and `icon()` dead).** The `ICON_PATHS` branch of `shellIcon`
(`shell-modes.js:114`) has no caller left once left_right stops using `prev`/`next`: **4A removes
that branch** and the words about it in the comment above `shellIcon`. `ICON_PATHS` itself and
`icon()` (`prefs.js:17`, `:78`) are **not** dead: the card's own carousel arrows use them
(`icon("prev", 20)`, `icon("next", 20)`, `card-build.js:22`, `:24`), so they stay. The glyph
branch of `shellIcon` stays for probes (the bench's, card-check's and the node test's), which are
objects and not table modes.

**Art spec** (review S4 #4). For the art job; the ship worker does not draw.

- **Size and grid:** a 24-cell grid at 4x, a 96x96 PNG, like every `frontend/ui` icon (`pixelIcon`
  draws it at 24 CSS px; the `.picon` rule is `image-rendering: pixelated`, `style.js:1583`).
- **Palette:** 4-bit (16 colours at most), the same as `icon_feed` and `icon_status`.
  Transparent background.
- **Silhouette first.** A mode cap is 39.5 px wide at card width 284 (Q-A), so the glyph must read
  as one shape: a clear outline, no fine interior detail, no text or letters in the art (the
  caption carries the words).
- **Drawn for the `#c4e2f2` face only** (FM3). The mode tint is one colour (`--mode-tint`, default
  `#c4e2f2`, with `color: #3a2a1a`, `style.js:1735`), the same in both Home Assistant themes
  and on every finish, so there is **no dark variant**. A PNG ignores `currentColor`: the icon
  is a fixed colour, so nothing asserts a tint on the `<img>` (R14).
- **Legible in the states the cap has:** live; `.armed` (Hop's special, a held-down face,
  `style.js:1740-1742`); and blocked at 0.6 opacity (`.toy[aria-disabled="true"]`,
  `style.js:1744`). The contact sheet shows all three.
- **Pipeline:** the sheets go through `art/ui/cut_ui.py` (3x3 sheets cut to the 24 grid, 96x96
  PNGs; `ICONS = {"icons_1": [9 names], "icons_2": [9 names]}`). Ten icons do not fit one sheet:
  4A adds **`icons_3`** (nine names) and **`icons_4`** (the tenth). Image-model prompts, logs
  and run scripts stay in the gitignored `private-content/art/runs/<run>/` (AGENTS.md, "Art
  runs stay local"); only the finished PNGs and the `cut_ui.py` change are committed.
- **Contact sheet:** `cut_ui.py` draws its contact sheet on cream buttons (`CREAM`, 255,247,236)
  and a dark row; neither is the mode face. 4A adds a row on `#c4e2f2` (live, `.armed`, and
  0.6 opacity) at 24 and 48 px, and **the owner signs this sheet** (FM3) before the PNGs merge.

**The code ship.** The table's icon strings become the keys above; `shellIcon` loses the
`ICON_PATHS` branch; Hop's special caption becomes the bare count (`${count}`, FM2) with its
`aria-label` unchanged; `shellIcon` passes its size explicitly (24, the size the care caps' own
pixel icons already use, so the box does not change from the care state, review S4 #5); the card's
`VERSION` is bumped so `?v=` busts the cache (`prefs.js:6`). The PNGs ship: `release.yml` zips all
of `custom_components/virtual_pet`, so `frontend/ui` goes with it (no packaging list to edit).

Acceptance (review S4 #3, #5, #6):
1. **A node test that can fail** (review S4 #3). It walks every slot of every `SHELL_MODES` entry:
   each non-null slot's `icon` must match `^icon_mode_\w+$` (no glyph, no SVG name, not empty), and
   `custom_components/virtual_pet/frontend/ui/<icon>.png` must exist and be 96x96. (The old
   wording, "exists, or the stopgap glyph still resolves", could not fail: `shellIcon` turns any
   string into a glyph.) The set of names the table uses is exactly the ten above. Probes keep
   their glyphs and are not walked.
2. **Bench, the right preset** (review S4 #6). `--preset ui` is "status, game picker, bubble"
   (`dev/bench/README.md:20`) and shows no mode. A table mode shows in the Hop `view: "board"`
   shots (`--preset hop`) and the server games' shots; `--mode probe` is the probe only. So 4A
   adds a preset, **`mode-icons`**: each of the four table modes at widths 300, 330 and 420, dpr
   1, 2 and 3, written with the `mode-pass.json` checks (the `.toy` and `.cap` rects, the caption
   inside its column), and it makes the contact sheet of acceptance 5.
3. **R3, a before and after pair** (review S4 #5). The `.toy` and `.cap` rects are compared
   between a **stopgap** render (the glyph table, at the parent commit) and the **pixel** render,
   per mode, slot and width, not against slice 1's probe numbers (those are the probe's, not the
   shipped modes'). The icon box is the one deliberate change: the glyph is `font 20px`
   (`style.js:1745`), the left_right SVG is 22, the pixel icon 24. The `.toy` and `.cap` rects
   must be equal; the commit lists the icon box before and after.
4. **The bench's width floor is fixed first** (review S4 #6). `MODE_MIN_TOY = 44`
   (`scripts/bench.js:1793`, used at `:1813` and `:1828`, comment at `:1790`) still fails the
   accepted widths: the `.toy` is **39.5 px at 284 and 43.02 at 300** (Q-A, accepted 2026-11-04).
   4A sets the floor to those (or a per-width table: 39.5 at 284, 43 at 300, 44 from 330) and
   fixes the summary line, so `mode-pass.json` can pass before the icons rely on it.
5. **Contact sheet, signed.** The ten icons on `#c4e2f2`, live / armed / 0.6 opacity, at 24 and
   48 px, copied to the worker dir; the owner signs it off before merge (FM3).
6. **Card-check** `shellmode` and `board` rows pass, with the changed icon assertions listed in
   the commit. The probe's `ICONS` array (`card-check.js:5335`) keeps its glyphs and SVG names: a
   probe is not a table mode. A row proves Hop's special cap is the bare count and its
   `aria-label` still contains "special".
7. **Esc, one node assertion** (review S4 #11; nothing new is built): every `SHELL_MODES` entry
   has `exit.escape === true` and `exit.slot === 8`. The behaviour is already covered by
   card-check (`shellmode`, the Escape rows). Esc with the status sheet open stays the sheet's,
   by design.
8. `motion_rule` and `owned_reads` still pass; `scripts/ci-gate` on the ship branch, as for any
   card change.

#### 4B: the keys (BUILT, s2919)

The park (D11) is lifted: the Hop art (s2874) and 4A (the icon wiring) are done. The design notes
and acceptance are the review's defects 7-10. Keys help desktop dashboards only; wall tablets (D7's
case) have no keys (review Q5).

**Answered 2026-11-05 (owner):**
- **Q1, keys for the other three games.** left_right: slot 1 `ArrowLeft`, slot 4 `ArrowRight`.
  higher_lower: lo (slot 1) is `ArrowDown` and `ArrowLeft`, hi (slot 4) is `ArrowUp` and
  `ArrowRight`. dig: keep (slot 1) is `ArrowLeft`, dig (slot 4) is `ArrowRight`. No letter keys for
  these three.
- **Q2, WASD.** No WASD. Hop: the four arrows on slots 1-4, `s` = special, `z` = undo, `r` =
  restart (FM2), `Escape` = quit (built). So the real-HA check of `a`/`d` is not needed.

Letter keys are matched exactly on `event.key`: lower-case only, so Shift+S or Caps Lock does not
act (and is not handled).

**Design notes** (review S4 #7-#10):
- **#7, where the map lives.** A `keys: [event.key names]` array on each slot in the table (e.g.
  `left: ["ArrowLeft"]`). The schema `shellCheck` (`shell-modes.js:128`) has no such field
  today. It rejects duplicate keys within a mode, a non-string, and any key on slot 8 other than
  `Escape`. The engine builds the map from `s.mode.slots`; it holds no key names itself, so rule 6
  of 3.2 (no game words) holds. The map, subject to Q1: left_right slot 1 `ArrowLeft`, slot 4
  `ArrowRight`; hop slots 1-4 on the four arrows, 5 `s`, 6 `z`, 7 `r`.
- **#8, one gate: through `_modeClick`, not `_hopKey`.** The key resolves to a slot index and calls
  `_modeClick(s, i)` (`card-mode.js:164`). `_hopKey` (`card-board.js:486`) is only the slot's `act`
  and guards `g.keys[k].enabled` alone; `_modeClick` also skips a blocked or off slot, closes an
  open status sheet, stamps `s.modeAt` and calls `_tapped(b, s, { perk: false })` (the cap press).
  The three server games' `act` is `_guess`, which has no busy guard of its own, so a key calling
  it directly would fire a guess while a request is in flight. (The plan's earlier line, "hooks
  onto `_hopKey(s, name)`", was wrong.)
- **#9, the handler and Home Assistant.** Listen on `s.device`, as Escape does
  (`card-build.js:271`). `preventDefault()` and `stopPropagation()` every key it handles (arrows
  would scroll the page or the dashboard). Ignore events with ctrl, meta or alt, `e.isComposing`,
  `e.repeat`, an input, textarea, select or contenteditable target, and while `show-status` or
  `s.laySheet` is up. If Space or Enter is ever mapped it must `preventDefault`, or it fires twice
  with the native click.
- **#10, "only when focus is in the card" has no mechanism yet.** A listener on `s.device` is
  scoped, but a tap on the screen or the board background drops focus (`.game` and `.device` are
  not focusable; only `.hgrid` has `tabindex=-1`, `card-board.js:305`, and `.status` has -1,
  `card-build.js:172`). The keys then stop working with the mode still on. The ship picks one and
  writes it here: the engine focuses `.device` (or the first live slot) on enter and after a
  screen tap, or `.game` gets `tabindex=-1` so a click on the board keeps focus.

**Acceptance** (review S4 #7-#10; Playwright's `page.keyboard.press` goes to the focused element):
1. **Node:** every table mode's keys resolve to live slot indices; no duplicates; modifiers,
   repeat, composing and input targets are ignored; a blocked slot sends nothing; `card-mode.js`
   still has no game words (slice 1 acceptance 2).
2. **Card-check, each Hop key:** with focus on a swapped cap, and on the grid, the key moves the
   pet / toggles special / undoes / restarts; with focus on a real element **outside** the card
   (a sibling input in the dashboard; the `dispatchEvent` pattern at `card-check.js:5463` only
   proves bubbling), or after `blur()`, nothing happens; with the status sheet open, nothing; a
   key during `g.busy` sends nothing; a held key (`e.repeat`) acts once.
3. **A handled key does not scroll** (`defaultPrevented`), and, if WASD is kept, `a` and `d` do
   not open HA's Assist or device search on a real HA.
4. The Q1 keys for the three server games, once answered, get the same rows.
5. `motion_rule` and `owned_reads` still pass.

## 7. Risks

| # | Risk | How it is covered |
|---|---|---|
| R1 | Care buttons are unavailable mid-game: a behaviour change (D1). | Decided. Slice 2 acceptance 2 proves it; the swap and the announcement say so. |
| R2 | `_update` repaints `disabled`, `.wanted`, `.on`, `aria-description`, the icon and the caption of all eight (`card-layout.js:697-731`) and the reload loop disables them (`:518`); a swap would be painted over, or a quit slot natively disabled. | `_paintCaps` is the one writer (3.2 rule 2); slice 1 acceptances 6 and 7 prove an entity going `unavailable` mid-mode, and the new state at exit. |
| R3 | A swapped icon changes the cap box, and `_bands`/`_mould` (which read `.toy` rects and `--cap-*`) misplace the shell. | Same box rule (3.2 rule 4); slice 1 acceptance 10 compares rects before, during and after and records the hit area (39.5 px at 284) and caption fit; slice 4A re-checks with the pixel icons, as a before/after pair per mode at an explicit icon size (24), since the stopgap glyph box (20/22) differs from the pixel one (24). |
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
| R14 | The tint loses to a finish rule, or vanishes on a see-through shell. | Slice 1 acceptance 11 reads the computed colour of every cap over every finish. That proves the **cap face** only: the pixel icons of 4A are fixed-colour PNGs that ignore `currentColor`, so nothing asserts a tint on the `<img>`; they are drawn for the one face colour and signed off on a contact sheet (4A, FM3). |
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
  column clips it (3.6). With the pixel icon (4A) it is the **bare count** and the `aria-label`
  keeps "special" (FM2, 2026-11-05).
- The slot captions: "keep" and "dig" (dig), "lo" and "hi" (higher_lower, today's `.gl`/`.gr`
  text), and the Hop labels from `HOP_COPY`, which stay as built. The left_right slots reuse
  the existing prev/next arrows. **Their captions are open (Q-B, top of this document):** this
  line said "no caption", but the schema and slice 1's acceptance 1 need non-empty, unique
  captions. Proposed: "left" and "right". Needs first-mate copy approval like the rest.
- Hop's captions (FM copy approval, 2026-11-04): "left", "up", "down", "right", the special's glyph and count ("✦2"; the bare count from 4A, FM2), "undo", "restart", "quit".
- Off slots have no caption and no label.

## 10. Owner decisions on the review, and what is open

Answered 2026-11-04 (the first mate adds them to the section 1 table as D7-D10):

| # | Decision | Where it lands |
|---|---|---|
| D7 | **Hop gets a 3-min idle exit, like the server games; the care buttons come back on its quit.** | 3.5 idle row, slice 3 acceptance 5, R15 |
| D8 | **Opening the status sheet keeps ending a game; a non-game mode chooses per mode** (the `exit.status` field of its table entry). | 3.1 `exit`, 3.5 status row, slice 1 acceptance 7 |
| D9 | **Hop's future hint goes on the board (a tap on the nest, or a long-press), never a ninth key; the 8 slots stay.** | 3.4 |
| D10 | **An integration reload (`s.reloading`) ends the mode.** | 3.5 reload row, slice 1 acceptance 7, slice 2 acceptance 4 |

Answered 2026-11-05 (owner and first mate): slice 4B parked, then unparked (D11); Q3 the special's bare
count, S and R for 4B (FM2); Q4 icons drawn for `#c4e2f2` only, the owner signs the art (FM3); **Q1 and
Q2 (owner, 2026-11-05): the arrow map of slice 4B, no letters on the three server games, no WASD
(section 6, 4B).** Slice 1's Q-A and Q-B were answered 2026-11-04 (top of this document). Nothing is
open for the owner. The two small things the slices settle on their own: the final
manifest position of the two new parts (slice 1 finds it with card-check), and whether the
`.moded` tint is a custom property or a class (slice 1 settled both: the parts sit after `ui-copy`
and after `card-actions`, and the tint is a class, `.device.moded .buttons > .toy.tinted .cap`,
with a `--mode-tint` property it reads).
The one decision this revision took without the owner, for the first mate to confirm: the
server games enter the mode at `_gameView`, before the server answers, and accept a one-beat
swap-and-restore on a refusal (3.5), rather than moving the entry after `_playCall`.
