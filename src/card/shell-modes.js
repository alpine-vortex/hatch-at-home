// Shell modes (docs/plan-2026-11-04-shell-modes.md, slice 1): the data. A mode swaps all eight round
// buttons on the shell (icon, caption, label, action, enabled rule) for its length, and the card puts
// them back. Pure: no `this`, no DOM, no game words (owner decision D6: the engine is a general shell
// mode; games are its first users, not its subject). The engine is card-mode.js.
//
// An entry (section 3.1):
//   { id,        // "left_right", "hop", later "question", "photo"...
//     slots,     // exactly 8, slots 1-4 the top row: a slot, or null (an "off" slot)
//     tint,      // a key into SHELL_TINTS
//     owns,      // owns the screen (default true): the card's _owned(s), section 3.7
//     busy,      // the director treats the device as busy (default true)
//     exit,      // { slot: 1-8 | null, escape, status: "end" | "keep",
//                //   idleMs, idleAt(s), idleHold(s), on: ["asleep" | "egg"] }
//     announce,  // the lead of the one announcement when the buttons swap
//     onExit }   // optional (card, s, reason): ends whatever the mode started
// A slot: { icon, cap, aria, title, act, enabled, on, keys }. `cap`, `aria` and `title` are a string or a
// pure function of the slide; `enabled(s)` and `on(s)` are pure; `act(card, s)` is all a press does.
// `keys` (slice 4B) is the keyboard: event.key names, matched exactly (so "s", not "S"), that press the
// slot as a tap does (the engine's _modeKey routes them through _modeClick). Escape is not listed on the
// table's slots: exit.escape runs the exit slot. shellCheck rejects a duplicate key within a mode.
// Captions and labels are table copy: a mode never shows a household's free text (AGENTS.md privacy).

const SHELL_SLOTS = 8;
// The reasons a mode may list in exit.on (the always-on ones, a slide change, another pet on the
// slide, the card going, a reload, cannot be turned off and are not listed).
const SHELL_EXIT_ON = Object.freeze(["asleep", "egg"]);
const SHELL_EXIT_STATUS = Object.freeze(["end", "keep"]);
// One colour for every game (owner decision D5), not the world's accent. A later non-game mode may add
// its own key.
const SHELL_TINTS = Object.freeze({ game: "#c4e2f2" });

// The game entries (slices 2 and 3), shellGame and shellHop. The three server games (slice 2): two inputs on the outer slots 1 and 4 (owner decision D3), quit on 8,
// the rest off. Every slot but quit is blocked while a request is out (`g.busy`); the dig's keep also
// while the basket is empty. A game's slot functions read `s.game` (its own state); the engine does not.
// The icons are the pixel icons of slice 4A (frontend/ui/icon_mode_*.png). Escape and the quit slot run
// the game's own quit path (the server's "end" call, then _endGame, which exits the mode); an exit from
// outside the game (idle, asleep, egg, a reload) ends the game with no server call, as the
// card-layout idle block did: the server has dropped it already. The dig's idle line is its bubble.
function shellGame(id, left, right, idleLine) {
  const open = (s) => !s.game?.busy;
  const side = (o, to) => ({ ...o, act: (card, s) => card._guess(s, to), enabled: o.enabled || open });
  return {
    id,
    slots: [
      side(left, "left"), null, null, side(right, "right"), null, null, null,
      { icon: "icon_mode_quit", cap: "quit", aria: "Stop the game", act: (card, s) => card._quitGame(s, card._quitLine(s)) },
    ],
    tint: "game",
    announce: "game buttons on",
    exit: {
      slot: 8, escape: true, status: "end", on: ["asleep", "egg"],
      idleMs: GAME_IDLE_MS, idleAt: (s) => s.game?.lastAt, idleHold: (s) => !!s.game?.busy,
    },
    onExit: (card, s, reason) => {
      if (reason === "game" || reason === "replace" || !s.game) return;
      card._endGame(s, reason === "idle" ? idleLine : null);
    },
  };
}

// Hop of the Day (slice 3), the one game that uses all eight: left, up, down, right on the top row, special
// (with its count), undo, restart and quit below (plan 3.4). The keys' state is `s.game.keys`, written by
// the board's _hopDraw (enabled, label), so these functions are pure reads of the slide. Escape and the quit
// slot run the game's quit path; hop is not a server game, so that makes no call. The idle exit (D7) counts
// from the last accepted input and waits while a settle, the board's load or a request is in flight.
// The special's cap is its bare count (the icon carries the word; "special 2" clipped at narrow widths, plan
// 3.6, FM2) and its aria-label still says "special". Any other exit ends the board with no line; it is resumable from the parked list.
function shellHop() {
  const key = (name, icon, cap, keys) => ({
    icon, cap, keys,
    aria: (s) => s.game?.keys?.[name]?.label || name,
    enabled: (s) => !!s.game?.keys?.[name]?.enabled,
    act: (card, s) => card._hopKey(s, name),
  });
  return {
    id: "hop",
    slots: [
      key("left", "icon_mode_left", "left", ["ArrowLeft"]), key("up", "icon_mode_up", "up", ["ArrowUp"]),
      key("down", "icon_mode_down", "down", ["ArrowDown"]), key("right", "icon_mode_right", "right", ["ArrowRight"]),
      { ...key("special", "icon_mode_special", (s) => `${s.game?.keys?.special?.count ?? 0}`, ["s"]), on: (s) => !!s.game?.special },
      key("undo", "icon_mode_undo", "undo", ["z"]), key("restart", "icon_mode_restart", "restart", ["r"]),
      { icon: "icon_mode_quit", cap: "quit", aria: "Stop the game", act: (card, s) => card._quitGame(s, card._quitLine(s)) },
    ],
    tint: "game",
    announce: "game buttons on",
    exit: {
      slot: 8, escape: true, status: "end", on: ["asleep", "egg"],
      idleMs: GAME_IDLE_MS, idleAt: (s) => s.game?.lastAt,
      idleHold: (s) => !!(s.game?.busy || s.game?.settling || s.game?.hopLoading),
    },
    onExit: (card, s, reason) => {
      if (reason === "game" || reason === "replace" || !s.game) return;
      card._endGame(s, null);
    },
  };
}

// Crate push (slice 3): the same eight as Hop without the special: the four directions, undo, restart (it
// reads "next" on a solved board) and quit. The keys' state is `s.game.keys`, written by _crateDraw.
function shellCrate() {
  const key = (name, icon, cap, keys) => ({
    icon, cap, keys,
    aria: (s) => s.game?.keys?.[name]?.label || name,
    enabled: (s) => !!s.game?.keys?.[name]?.enabled,
    act: (card, s) => card._crateKey(s, name),
  });
  return {
    id: "crate",
    slots: [
      key("left", "icon_mode_left", "left", ["ArrowLeft"]), key("up", "icon_mode_up", "up", ["ArrowUp"]),
      key("down", "icon_mode_down", "down", ["ArrowDown"]), key("right", "icon_mode_right", "right", ["ArrowRight"]),
      null,
      key("undo", "icon_mode_undo", "undo", ["z"]),
      { ...key("restart", "icon_mode_restart", (s) => s.game?.keys?.restart?.cap || "restart", ["r"]) },
      { icon: "icon_mode_quit", cap: "quit", aria: "Stop the game", act: (card, s) => card._quitGame(s, card._quitLine(s)) },
    ],
    tint: "game",
    announce: "game buttons on",
    exit: {
      slot: 8, escape: true, status: "end", on: ["asleep", "egg"],
      idleMs: GAME_IDLE_MS, idleAt: (s) => s.game?.lastAt,
      idleHold: (s) => !!(s.game?.crateLoading || s.game?.busy),
    },
    onExit: (card, s, reason) => {
      if (reason === "game" || reason === "replace" || !s.game) return;
      card._endGame(s, null);
    },
  };
}

// The shipped modes, by id. A probe (the bench's, card-check's, the node test's) is an
// object passed to _modeEnter, not an entry.
const SHELL_MODES = Object.freeze({
  left_right: shellFreeze(shellGame("left_right",
    { icon: "icon_mode_left", cap: "left", aria: "Guess left", keys: ["ArrowLeft"] },
    { icon: "icon_mode_right", cap: "right", aria: "Guess right", keys: ["ArrowRight"] }, null)),
  higher_lower: shellFreeze(shellGame("higher_lower",
    { icon: "icon_mode_down", cap: "lo", aria: "Guess lower", keys: ["ArrowDown", "ArrowLeft"] },
    { icon: "icon_mode_up", cap: "hi", aria: "Guess higher", keys: ["ArrowUp", "ArrowRight"] }, null)),
  dig: shellFreeze(shellGame("dig",
    { icon: "icon_mode_keep", cap: "keep", aria: "Keep the basket", keys: ["ArrowLeft"], enabled: (s) => !s.game?.busy && !!s.game?.basket },
    { icon: "icon_mode_dig", cap: "dig", aria: "Dig a leaf", keys: ["ArrowRight"] }, GAME_COPY.idle)),
  hop: shellFreeze(shellHop()),
  crate: shellFreeze(shellCrate()),
});

// A cap's icon: a frontend/ui pixel icon ("icon_mode_left"), drawn at 24 px (the size the care caps' own pixel
// icons use, so the cap's box does not change from the care state), or a short glyph ("✦", a probe's).
// Empty for an off slot.
function shellIcon(key) {
  if (!key) return "";
  if (/^icon_\w+$/.test(key)) return pixelIcon(key, 24);
  const glyph = String(key).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<b class="glyph" aria-hidden="true">${glyph}</b>`;
}

// A slot's caption, label or title: table copy, or a pure function of the slide.
function shellText(v, s) {
  const out = typeof v === "function" ? v(s) : v;
  return out == null ? "" : String(out);
}

// What is wrong with an entry, as a list of reasons (empty: none). The node test runs it over the table
// and over its own probes; _modeEnter refuses an entry it finds fault with.
function shellCheck(m) {
  const bad = [];
  const fn = (v) => v === undefined || typeof v === "function";
  if (!m || typeof m !== "object") return ["not an object"];
  if (!m.id || typeof m.id !== "string") bad.push("no id");
  if (!Array.isArray(m.slots) || m.slots.length !== SHELL_SLOTS) return [...bad, `slots is not ${SHELL_SLOTS} long`];
  if (!Object.hasOwn(SHELL_TINTS, m.tint)) bad.push(`tint ${m.tint} is not in SHELL_TINTS`);
  const caps = [];
  const keyed = new Set();
  m.slots.forEach((slot, i) => {
    if (slot === null) return;
    const at = `slot ${i + 1}`;
    if (!slot || typeof slot !== "object") return bad.push(`${at} is not a slot or null`);
    if (typeof slot.act !== "function") bad.push(`${at} has no act`);
    if (!fn(slot.enabled)) bad.push(`${at} enabled is not a function`);
    if (!fn(slot.on)) bad.push(`${at} on is not a function`);
    for (const k of ["cap", "aria", "title"]) {
      if (slot[k] !== undefined && typeof slot[k] !== "string" && typeof slot[k] !== "function") bad.push(`${at} ${k} is neither copy nor a function`);
    }
    if (slot.keys !== undefined) {
      if (!Array.isArray(slot.keys)) bad.push(`${at} keys is not a list`);
      else {
        for (const k of slot.keys) {
          if (typeof k !== "string" || !k) bad.push(`${at} has a key that is not a name`);
          else if (keyed.has(k)) bad.push(`two slots share the key ${k}`);
          else keyed.add(k);
          if (typeof k === "string" && k === "Escape" && i !== SHELL_SLOTS - 1) bad.push(`${at} takes Escape, which is slot 8's`);
        }
        if (i === SHELL_SLOTS - 1 && slot.keys.some((k) => k !== "Escape")) bad.push(`${at} takes a key other than Escape`);
      }
    }
    if (typeof slot.aria !== "function" && !shellText(slot.aria).trim()) bad.push(`${at} has no aria label`);
    if (typeof slot.cap === "string") caps.push(slot.cap.trim());
  });
  if (caps.some((c) => !c)) bad.push("an empty caption");
  if (new Set(caps).size !== caps.length) bad.push("two slots share a caption");
  const exit = m.exit || {};
  if (exit.slot != null && !(Number.isInteger(exit.slot) && m.slots[exit.slot - 1])) bad.push(`exit.slot ${exit.slot} is not a slot`);
  if (exit.status !== undefined && !SHELL_EXIT_STATUS.includes(exit.status)) bad.push(`exit.status ${exit.status}`);
  if (exit.on !== undefined && !(Array.isArray(exit.on) && exit.on.every((r) => SHELL_EXIT_ON.includes(r)))) bad.push("exit.on holds an unknown reason");
  if (exit.idleMs != null && !(exit.idleMs > 0)) bad.push("exit.idleMs is not a time");
  if (!fn(exit.idleAt) || !fn(exit.idleHold)) bad.push("exit.idleAt or idleHold is not a function");
  if (!fn(m.onExit)) bad.push("onExit is not a function");
  if (m.announce !== undefined && typeof m.announce !== "string") bad.push("announce is not copy");
  return bad;
}

// An entry frozen deep (the table's are; a probe may be).
function shellFreeze(m) {
  for (const slot of m.slots || []) if (slot) Object.freeze(slot);
  if (m.exit) {
    if (m.exit.on) Object.freeze(m.exit.on);
    Object.freeze(m.exit);
  }
  Object.freeze(m.slots);
  return Object.freeze(m);
}
