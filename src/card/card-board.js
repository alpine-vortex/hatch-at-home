// Board mode's constants. The copy is the plan's drafts (section 1 and ship 2b); a line the plan
// does not quote is not here.
const HOP_KEY = "hatch-hop"; // + |device|day|board id: the parked move list
const HOP_WARNED = new Set();
const HOP_COPY = {
  row: "Hop of the Day",
  rowAria: "Play Hop of the Day",
  step: { left: "Step left", up: "Step up", down: "Step down", right: "Step right" },
  blocked: "blocked",
  sunk: "sunk",
  special: (n) => `Special move, ${n} left`,
  restart: "Start the board again",
  undo: "Take back the last move",
  tryTidy: "try for tidy",
  solved: "solved",
  tidy: "tidy",
  // The row says where today stands (plan section 5: open, solved, tidy).
  rowState: { open: "Hop of the Day", solved: "Hop ✓", tidy: "Hop ✓ tidy" },
  rowStateAria: { open: "Play Hop of the Day", solved: "Hop of the Day, solved. Try for tidy",
    tidy: "Hop of the Day, tidy" },
  failed: "hmm, that didn't work", // a settle that came to nothing (also the board call's)
  found: "ooh, I found something ♪", // a find from the settle's `found: true` (Q3, draft)
  // A twist cell's aria label (plan 2c "Player copy"; the plain cells keep none, a lit dark cell neither).
  cell: { stump: "stump hole, leads to its twin", rug: "rug, slides you one more",
    crackle: "crackle pad, holds two visits", crackleHalf: "crackle pad, cracked, one visit left",
    poolStone: "tide pool, a stone on the next move", poolWater: "tide pool, water on the next move",
    ripple: "ripple pad, sinks the pads to its right", dark: "dark cell, not lit yet",
    lantern: "lantern, step here to light the dark cells" },
};
// Ship 3b: the pure parts, no `this` and no DOM (tests/js/hop_settle.test.js reads them).
// The server's day is the HA local date: Intl with hass.config.time_zone (Q1), else this device's.
const hopToday = (tz, now = new Date()) => {
  const ymd = (opts) => {
    const parts = new Intl.DateTimeFormat("en-CA", { ...opts, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now);
    const at = (t) => parts.find((p) => p.type === t)?.value;
    return `${at("year")}-${at("month")}-${at("day")}`;
  };
  try {
    return ymd(tz ? { timeZone: tz } : {});
  } catch (err) {
    return ymd({}); // an unknown zone: this device's date; the board reply corrects the row
  }
};
// The row's state from the records that know today ({day, done, tidy}: the sensor's attribute and
// the board reply this card saw): open | solved | tidy. A record of another day says nothing.
const hopRowState = (records, today) => {
  let done = false;
  let tidy = false;
  for (const r of records) {
    if (!r || typeof r !== "object" || r.day !== today) continue;
    done = done || r.done === true;
    tidy = tidy || r.tidy === true;
  }
  return tidy ? "tidy" : done ? "solved" : "open";
};
// What the card does with a `settle` reply (null or {result: "thrown"} for a call that threw), as
// a pure function of (reply, game): `clear` the parked list; `reload` the board (it changed);
// `refusal` the REFUSALS key to say; `warn` {code, bad_index?} for a bug; `tidy` the day's tidy
// (never lowered, P1: the reply's `tidy` is this list's); `settled` the server has it; `found`.
// `already` is not read (D2).
const HOP_NOTHING = { kind: "failed", clear: false, reload: false, settled: false, found: false, refusal: null,
  warn: null };
const hopSettleOutcome = (reply, game) => {
  const tidy = game?.tidy === true;
  const result = reply && typeof reply === "object" ? reply.result : undefined;
  if (result === "ok") {
    return { ...HOP_NOTHING, kind: "ok", clear: true, settled: true, tidy: tidy || reply.tidy === true,
      found: reply.found === true };
  }
  if (result === "board_changed") return { ...HOP_NOTHING, kind: "reload", clear: true, reload: true, tidy };
  if (result === "egg" || result === "asleep") {
    return { ...HOP_NOTHING, kind: "refused", refusal: result, tidy };
  }
  const known = ["illegal", "not_won", "too_long", "thrown"].includes(result) ? result
    : result === undefined ? "no_reply" : "unknown";
  const warn = { code: known };
  if (known === "illegal" && Number.isInteger(reply.bad_index)) warn.bad_index = reply.bad_index;
  return { ...HOP_NOTHING, tidy, warn };
};
// ◀ ▲ ▼ ▶ as hop-engine's STEPS: [name, row step, column step, glyph].
const HOP_DIRS = [["left", 0, -1, "◀"], ["up", -1, 0, "▲"], ["down", 1, 0, "▼"], ["right", 0, 1, "▶"]];
// The cell the board is drawn at, from the overlay's W x H and the board's w x h: the board takes the whole
// overlay (the keys are the shell's eight buttons now), 4 px of pad on each side, never under 12 px. The
// widest board (the server allows 6 x 4) sets the smallest cell; a smaller one gets a cell no smaller.
const hopCell = (W, H, w, h, pad = 4) => Math.max(12, Math.floor(Math.min((W - 2 * pad) / w, (H - 2 * pad) / h)));
const HOP_CELLS = { ".": "pad", f: "pad find", o: "stone", "~": "water", "#": "wall", P: "pad start", N: "nest",
  1: "stump", 2: "stump two", "=": "rug", c: "pad crackle", "%": "pool", r: "pad ripple", "?": "pad dark",
  "*": "pad lantern" };
// A twist cell's label in a state (role="img" with it; null: no label). Ship 4b's follow the state: a
// crackle's half, a pool's phase on the next move, a dark cell's lantern. A sunk pad of any kind reads as
// a sunk pad (no label), as a lit dark cell does.
const hopCellLabel = (board, st, i) => {
  const cells = board.grid.join("");
  const ch = cells[i];
  const c = HOP_COPY.cell;
  if (ch === "1" || ch === "2") return c.stump;
  if (ch === "=") return c.rug;
  if (ch === "%") return (st.parity || 0) === 1 ? c.poolWater : c.poolStone;
  if (!"cr*?".includes(ch) || (st.sunk >> i) & 1) return null;
  if (ch === "c") return ((st.half || 0) >> i) & 1 ? c.crackleHalf : c.crackle;
  if (ch === "r") return c.ripple;
  if (ch === "*") return c.lantern;
  return HATCH_HOP.lit(cells, st.sunk, st.pos) ? null : c.dark;
};

class HatchPetCardBoard extends HatchPetCardGames {
  // --- Board mode: Hop of the Day (plan 2026-11-02-hop-of-the-day, ship 2b) ---------------------
  // Behind the YAML-only `experimental_hop` key. The board is `s.game` ({kind: "hop"}), so every
  // quit path that already tests `s.game` ends it: _endGame clears it (_hopEnd), and the server
  // never hears of it (hop is not in SERVER_GAMES). The keys are the shell's eight buttons (the
  // `hop` entry of SHELL_MODES, shell-modes.js; shell modes slice 3): _hopDraw writes their state
  // on `g.keys` and calls _modeSync, and a press runs _hopKey. The rules are HATCH_HOP's (hop-engine.js); the
  // card plays every move locally and writes the move list to localStorage on every move. A
  // nest entry shows the solved view at once and sends the list (`settle`, ship 3b): the server
  // replays it and pays; the list stays parked until the server has answered `ok`.

  _hopOn() {
    return this._config?.experimental_hop === true;
  }

  // The row beside the picker (plan section 5): built when the picker opens and the flag is on,
  // removed when it is off, so a flag-off card has none. Pressing it asks `hop` for the board.
  _hopRow(s) {
    let row = s.gameBox.querySelector(".ghop");
    if (!this._hopOn()) {
      row?.remove();
      return;
    }
    if (!row) {
      row = document.createElement("button");
      row.className = "ghop";
      row.type = "button";
      row.addEventListener("click", () => {
        this._tapped(row, s);
        this._hopOpen(s);
      });
      s.gameBox.append(row);
    }
    this._hopRowSet(s, row);
    row.hidden = false;
  }

  // The row's day: the life-stage sensor's `hop_day` and the last board reply this card saw, read
  // against today in HA's time zone. Returns whether the label changed (the picker refits then).
  _hopRowSet(s, row) {
    const state = hopRowState([this._state(s, "sensor.life_stage")?.attributes?.hop_day, s.hopSeen],
      hopToday(this._hass?.config?.time_zone));
    const changed = row.dataset.state !== state;
    row.dataset.state = state;
    row.textContent = HOP_COPY.rowState[state];
    row.setAttribute("aria-label", HOP_COPY.rowStateAria[state]);
    return changed;
  }

  // Another screen settled while the picker is open (the sensor's attribute changed): the row
  // follows. Called from _update.
  _hopRowRefresh(s) {
    const row = s.gameBox?.querySelector(".ghop");
    if (row && !row.hidden && s.game?.picking && this._hopRowSet(s, row)) this._fitPicker(s);
  }

  // Ask for today's board and open it. Until the reply the picker stays up (and a second press
  // is ignored). A refusal is the ordinary refusal line; a reply the rules cannot play shows
  // nothing and logs once.
  async _hopOpen(s, from = null) {
    // `from` is a board whose settle answered board_changed: the new board replaces it.
    const picking = from || s.game;
    if (from ? s.game !== from : !picking?.picking) return;
    if (picking.hopLoading) return;
    const id = s.ids?.["sensor.mood"];
    if (!id) return;
    picking.hopLoading = true;
    if (s.scene) this._sceneEnd(s, { quiet: true }); // a live care scene leaves no bowl or prop under the grid
    let reply;
    try {
      reply = await this._hopFetch(id);
    } catch (err) {
      if (s.game === picking) this._endGame(s, HOP_COPY.failed);
      return;
    }
    if (s.game !== picking) return; // stopped while waiting
    if (reply?.result && reply.result !== "ok") {
      this._endGame(s, REFUSALS[reply.result] ?? null);
      return;
    }
    if (!HATCH_HOP.valid(reply) || typeof reply.id !== "string" || typeof reply.day !== "string") {
      if (!HOP_WARNED.has("board")) {
        HOP_WARNED.add("board");
        console.warn("hatch-pet-card: the hop board reply is not a board the rules can play");
      }
      this._endGame(s, null);
      return;
    }
    if (from) this._hopTeardown(s); // the old board's observers go before the new one is built
    this._hopStart(s, reply);
  }

  // The `hop` service's `board` answer for this pet (the one seam a check stubs).
  async _hopFetch(id) {
    const res = await this._hass.callService("virtual_pet", "hop", { entity_id: id, action: "board" },
      undefined, false, true);
    return res?.response;
  }

  // The board is in hand: open it, with this device's parked moves if they are still a legal
  // list on this very board (another id, day or generator drops them without comment).
  _hopStart(s, reply) {
    const board = { w: reply.w, h: reply.h, grid: reply.grid, family: reply.family, specials: reply.specials };
    const key = `${HOP_KEY}|${s.ids?.device}|${reply.day}|${reply.id}`;
    const g = s.game = { kind: "hop", board, key, id: reply.id, day: reply.day, moves: [],
      st: HATCH_HOP.start(board), lit: null, special: false, done: false, tidy: false, settled: true, cell: 0 };
    this._hopForgetOld(s, key);
    // What the server says of today (the board reply, and the sensor's attribute for this very
    // day); the tidy never goes down (P1). The row reads it as well.
    const attr = this._state(s, "sensor.life_stage")?.attributes?.hop_day;
    const same = attr && attr.day === reply.day ? attr : null;
    const seen = s.hopSeen?.day === reply.day ? s.hopSeen : null;
    const dayDone = reply.done === true || same?.done === true || seen?.done === true;
    const dayTidy = reply.tidy === true || same?.tidy === true || seen?.tidy === true;
    s.hopSeen = { day: reply.day, done: dayDone || dayTidy, tidy: dayTidy };
    const parked = this._hopParked(key);
    const run = parked && HATCH_HOP.replay(board, parked);
    if (dayTidy) {
      // Nothing is left to pay: a parked list goes, and the tidy view opens without a path.
      if (parked) this._hopStore(key, null);
      this._hopNest(g);
      g.tidy = true;
    } else if (run?.legal && run.won) {
      // A won list that was never answered (asleep, a closed tab): the solved view, and the settle again (P2).
      g.moves = HATCH_HOP.decode(parked);
      g.st = HATCH_HOP.fromView(run.final);
      g.done = true;
      g.tidy = run.tidy;
      g.settled = false;
    } else if (run?.legal) {
      g.moves = HATCH_HOP.decode(parked); // a try for tidy that was left half way
      g.st = HATCH_HOP.fromView(run.final);
    } else {
      if (parked) this._hopStore(key, null);
      if (dayDone) this._hopNest(g); // a reload on a solved day: the pet in the nest, no path (P9)
    }
    s.pet.classList.remove("go-left", "go-right");
    this._hopBuild(s);
    this._gameView(s, "hop");
    if (!s.greeted) this._greetSpent(s); // playing together is the hello (F7), as any game
    this._reactFrames(s, g.done ? "praised" : "ready", { inGame: true });
    this._hopLayout(s);
    this._hopDraw(s, false); // the keys' state is on g before the shell takes them
    this._modeEnter(s, SHELL_MODES.hop, { from: s.buttons.play }); // the same mode again (a reloaded board) repaints
    if (g.done) {
      g.prompt = g.tidy ? HOP_COPY.tidy : HOP_COPY.solved;
      this._write(s, g.prompt, 60000);
      s.sayUntil = Date.now() + 60000;
    } else {
      s.sayUntil = 0;
      g.prompt = null;
    }
    this._hopFocus(s);
    g.lastAt = Date.now();
    if (g.done && !g.settled) this._hopSend(s);
  }

  // The nest state without a path: a solved day the server knows, opened on a reload.
  _hopNest(g) {
    g.st = HATCH_HOP.fromView({ pos: g.board.grid.join("").indexOf("N"), sunk: [], uses: 0, done: true });
    g.done = true;
    g.settled = true;
  }

  _hopParked(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch (err) {
      return ""; // no storage here: nothing parks
    }
  }

  _hopStore(key, moves) {
    try {
      if (moves) localStorage.setItem(key, moves);
      else localStorage.removeItem(key);
    } catch (err) {
      // no storage: the board just won't be there on return
    }
  }

  // Other boards' lists of this pet (another day or id) go, so none piles up.
  _hopForgetOld(s, keep) {
    try {
      const mine = `${HOP_KEY}|${s.ids?.device}|`;
      for (const k of Object.keys(localStorage)) if (k.startsWith(mine) && k !== keep) localStorage.removeItem(k);
    } catch (err) {
      // no storage
    }
  }

  // The overlay's board: the grid with its piece. The keys are the shell's.
  _hopBuild(s) {
    const g = s.game;
    const box = s.gameBox;
    this._hopTeardown(s);
    const wrap = document.createElement("div");
    wrap.className = "hopb";
    wrap.dataset.world = s.worldKey || ""; // the cells' art (style.js's HOP_ART)
    wrap.innerHTML = `<div class="hgrid" tabindex="-1"><svg class="hpath" aria-hidden="true"><path/></svg>` +
      `<img class="hpiece" alt=""></div>`;
    box.prepend(wrap);
    const grid = wrap.querySelector(".hgrid");
    const cells = [...g.board.grid.join("")];
    grid.prepend(...cells.map((ch, i) => {
      const el = document.createElement("i");
      el.className = `hc ${HOP_CELLS[ch]}`;
      el.dataset.i = String(i);
      return el;
    }));
    g.el = { wrap, grid, piece: grid.querySelector(".hpiece"), path: grid.querySelector(".hpath path"),
      cells: [...grid.querySelectorAll(".hc")] };
    grid.addEventListener("click", (e) => this._hopTap(s, e));
    // The piece is the pet: the real sprite stays where it is and only swaps frames (the care
    // reactions' own); the piece wears whichever frame is on show.
    const mirror = () => { g.el.piece.src = s.pet.getAttribute("src") || ""; };
    mirror();
    g.mo = new MutationObserver(mirror);
    g.mo.observe(s.pet, { attributes: true, attributeFilter: ["src"] });
    g.ro = new ResizeObserver(() => { if (s.game === g) this._hopLayout(s); });
    g.ro.observe(box);
  }

  _hopTeardown(s) {
    const g = s.game;
    g?.mo?.disconnect();
    g?.ro?.disconnect();
    s.gameBox.querySelector(".hopb")?.remove();
    s.gameBox.classList.remove("hop", "end");
  }

  // Called by _endGame, whichever way the board went.
  _hopEnd(s) {
    this._hopTeardown(s);
  }

  // The cell size the board is drawn at, from the overlay (hopCell): the board takes all of it and is
  // centred. `g.cell` is what was drawn: a tap commits at once from 44 px up, below that it lights first.
  _hopLayout(s) {
    const g = s.game;
    if (g?.kind !== "hop" || !g.el) return;
    const rect = s.gameBox.getBoundingClientRect();
    const [W, H] = [rect.width, rect.height];
    if (!W || !H) return;
    const { w, h } = g.board;
    const c = hopCell(W, H, w, h);
    g.cell = c;
    g.el.grid.style.cssText = `left:${Math.round((W - c * w) / 2)}px;top:${Math.round((H - c * h) / 2)}px;` +
      `width:${c * w}px;height:${c * h}px;--c:${c}px;grid-template-columns:repeat(${w},${c}px)`;
    g.el.wrap.dataset.cell = String(c);
    this._hopPlace(s);
  }

  _hopXY(g, i) {
    return [(i % g.board.w) * g.cell, Math.floor(i / g.board.w) * g.cell];
  }

  // The piece on its cell (a transition on `translate`, none under calm()), the lit path.
  _hopPlace(s, move = false) {
    const g = s.game;
    const { piece, path } = g.el;
    const [x, y] = this._hopXY(g, g.st.pos);
    const size = Math.round(g.cell * 0.86);
    piece.style.width = piece.style.height = `${size}px`;
    piece.style.transition = move && !calm() ? "" : "none";
    piece.style.translate = `${x + Math.round((g.cell - size) / 2)}px ${y + Math.round((g.cell - size) / 2)}px`;
    if (g.lit == null) {
      path.removeAttribute("d");
      return;
    }
    const [lx, ly] = this._hopXY(g, g.lit);
    const half = g.cell / 2;
    const [x1, y1, x2, y2] = [x + half, y + half, lx + half, ly + half];
    const far = Math.hypot(x2 - x1, y2 - y1) > g.cell * 1.5;
    path.setAttribute("d", far ? `M${x1} ${y1} Q${(x1 + x2) / 2} ${Math.min(y1, y2) - g.cell * 0.9} ${x2} ${y2}`
      : `M${x1} ${y1} L${x2} ${y2}`);
  }

  // The moves the board allows now: {plain, special} (cell indexes). A move that costs a use is special.
  _hopTargets(g) {
    const out = { plain: [], special: [] };
    for (const t of HATCH_HOP.legalTargets(g.board, g.st)) {
      const next = HATCH_HOP.apply(g.board, g.st, t);
      (next.uses < g.st.uses ? out.special : out.plain).push(t);
    }
    return out;
  }

  // The cell one step in a direction (-1 off the board).
  _hopAdjacent(g, dir) {
    const { w, h } = g.board;
    const r = Math.floor(g.st.pos / w) + dir[1];
    const c = (g.st.pos % w) + dir[2];
    return r >= 0 && r < h && c >= 0 && c < w ? r * w + c : -1;
  }

  // Which key names a special target: its straight direction; a diagonal (the glide) is tapped.
  _hopSpecialDir(g, t) {
    const { w } = g.board;
    const dr = Math.floor(t / w) - Math.floor(g.st.pos / w);
    const dc = (t % w) - (g.st.pos % w);
    if (dr === 0) return dc < 0 ? "left" : "right";
    if (dc === 0) return dr < 0 ? "up" : "down";
    return null;
  }

  // The cells' look from the board's, and the keys' state: written on `g.keys` (enabled, label) for the
  // `hop` entry's slot functions, then _modeSync paints the shell's buttons from them (blocked ones are
  // aria-disabled, as the dig's keep is). The one place that sets the keys' state.
  _hopDraw(s, move = true) {
    const g = s.game;
    if (g?.kind !== "hop" || !g.el) return;
    const { cells } = g.el;
    const { w } = g.board;
    const targets = g.done ? { plain: [], special: [] } : this._hopTargets(g);
    const legal = new Set([...targets.plain, ...targets.special]);
    const grid = g.board.grid.join("");
    const finds = [...grid].map((ch, i) => (ch === "f" ? i : -1)).filter((i) => i >= 0);
    const open = g.done || finds.every((i) => (g.st.sunk >> i) & 1 || i === g.st.pos);
    // Ship 4b's state on the cells: a pool in the next move's phase, a half-sunk crackle, the dark cells
    // until the lantern is lit (then they are pads to look at).
    const wet = (g.st.parity || 0) === 1;
    const shine = HATCH_HOP.lit(grid, g.st.sunk, g.st.pos);
    cells.forEach((el, i) => {
      const ch = grid[i];
      el.classList.toggle("sunk", ((g.st.sunk >> i) & 1) === 1);
      el.classList.toggle("legal", legal.has(i) && (!g.special || targets.special.includes(i)));
      el.classList.toggle("lit", g.lit === i);
      el.classList.toggle("open", ch === "N" && open);
      if (ch === "%") el.classList.toggle("wet", wet);
      if (ch === "c") el.classList.toggle("half", (((g.st.half || 0) >> i) & 1) === 1);
      if (ch === "?") el.classList.toggle("dark", !shine);
      const label = hopCellLabel(g.board, g.st, i);
      if (label) {
        el.setAttribute("role", "img");
        el.setAttribute("aria-label", label);
      } else {
        el.removeAttribute("role");
        el.removeAttribute("aria-label");
      }
    });
    const keys = {};
    for (const dir of HOP_DIRS) {
      const [name] = dir;
      const adj = this._hopAdjacent(g, dir);
      let enabled = false;
      if (!g.done) {
        enabled = g.special
          ? targets.special.some((t) => this._hopSpecialDir(g, t) === name)
          : targets.plain.includes(adj);
      }
      const cell = adj >= 0 ? grid[adj] : "";
      // "sunk" for a pad of any kind that has sunk (a crackle only fully); else "blocked" (water, a wall, a
      // pool in its water phase, an unlit dark cell).
      const sunk = adj >= 0 && ((g.st.sunk >> adj) & 1) === 1 && HATCH_HOP.PADS.includes(cell);
      const base = HOP_COPY.step[name];
      keys[name] = { enabled, label: enabled || g.done ? base : `${base}, ${sunk ? HOP_COPY.sunk : HOP_COPY.blocked}` };
    }
    const left = g.st.uses;
    keys.special = { enabled: !g.done && left > 0, label: HOP_COPY.special(left), count: left };
    keys.undo = { enabled: !g.done && g.moves.length > 0, label: HOP_COPY.undo };
    // A won board the server has not answered keeps its list: no restart until it has (Q2, Decided 23).
    keys.restart = { enabled: g.done ? !g.tidy && g.settled : g.moves.length > 0,
      label: g.done && !g.tidy ? HOP_COPY.tryTidy : HOP_COPY.restart };
    g.keys = keys;
    this._modeSync(s);
    s.gameBox.classList.toggle("end", g.done);
    this._hopPlace(s, move);
  }

  // The focus to the first live key (slot 1-7), else the grid; the shell's buttons are the keys.
  _hopFocus(s) {
    const g = s.game;
    const all = this._modeButtons(s);
    const key = all.find((b, i) => i < 7 && b.getAttribute("aria-disabled") !== "true" && !b.disabled);
    (key || g.el.grid).focus({ preventScroll: true });
  }

  // A key's press (`act` of the `hop` entry; _modeClick has already skipped a blocked slot and
  // tapped the button): the key's name, one of left up down right special undo restart.
  _hopKey(s, k) {
    const g = s.game;
    if (g?.kind !== "hop" || !g.keys?.[k]?.enabled) return;
    g.lastAt = Date.now();
    if (k === "special") {
      g.special = !g.special;
      g.lit = null;
    } else if (k === "undo") {
      this._hopReplay(s, g.moves.slice(0, -1));
      return;
    } else if (k === "restart") {
      this._hopRestart(s);
      return;
    } else {
      const dir = HOP_DIRS.find((d) => d[0] === k);
      const t = g.special
        ? this._hopTargets(g).special.find((c) => this._hopSpecialDir(g, c) === k)
        : this._hopAdjacent(g, dir);
      if (t !== undefined && t >= 0) this._hopMove(s, t);
      return;
    }
    this._hopDraw(s, false);
  }

  // A tap on the grid: the legal cell nearest the tap, if within 22 px of its centre (a legal
  // cell's reach is a 44 px square at most, grown into its empty neighbours). Under 44 px the
  // first tap lights it and a second on the same cell commits; from 44 px up one tap commits.
  _hopTap(s, e) {
    const g = s.game;
    if (g?.kind !== "hop" || g.done) return;
    const targets = this._hopTargets(g);
    const pool = g.special ? targets.special : [...targets.plain, ...targets.special];
    let best = -1;
    let bestD = 22.01;
    for (const i of pool) {
      const r = g.el.cells[i].getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      if (d < bestD) [best, bestD] = [i, d];
    }
    if (best < 0) return;
    if (g.cell >= 44 || g.lit === best) {
      this._hopMove(s, best);
      return;
    }
    g.lit = best;
    g.lastAt = Date.now();
    this._hopDraw(s, false);
  }

  _hopMove(s, cell) {
    const g = s.game;
    const was = g.st;
    const next = HATCH_HOP.apply(g.board, was, cell);
    if (!next) return;
    g.lastAt = Date.now(); // an accepted input (D7: the idle exit counts from it)
    g.moves.push(cell);
    g.st = next;
    g.lit = null;
    g.special = false;
    if (next.done) {
      g.done = true;
      g.tidy = g.tidy || HATCH_HOP.isTidy(g.board, next); // never lowered (P1)
      g.settled = false;
      this._hopStore(g.key, HATCH_HOP.encode(g.moves)); // kept until the server has answered `ok`
      this._reactFrames(s, "praised", { inGame: true });
      this._chirp(s, "win");
      g.prompt = g.tidy ? HOP_COPY.tidy : HOP_COPY.solved;
      this._write(s, g.prompt, 60000);
      s.sayUntil = Date.now() + 60000;
    } else {
      this._hopStore(g.key, HATCH_HOP.encode(g.moves));
      if (next.uses < was.uses) this._reactFrames(s, "played", { inGame: true }); // the special's own beat
      this._chirp(s, "tap");
    }
    this._hopDraw(s, true);
    if (!g.done) this._hopRefocus(s);
    else this._hopSend(s);
  }

  // The `hop` service's `settle` answer for this list (the seam a check stubs; like _hopFetch).
  async _hopSettle(entity, boardId, moves) {
    const res = await this._hass.callService("virtual_pet", "hop", { entity_id: entity, action: "settle",
      id: boardId, moves, ...(sharedScreen() ? { shared: true } : {}) }, undefined, false, true);
    return res?.response;
  }

  // The won list goes to the server, behind the solved view that is already up. The reply is
  // handled against the board it was for, whoever is on screen by then.
  async _hopSend(s) {
    const g = s.game;
    const entity = s.ids?.["sensor.mood"];
    if (!entity || g?.kind !== "hop") return;
    const moves = HATCH_HOP.encode(g.moves);
    let reply;
    g.settling = true; // the idle exit waits for the answer (D7)
    try {
      reply = await this._hopSettle(entity, g.id, moves);
    } catch (err) {
      reply = { result: "thrown" };
    }
    g.settling = false;
    this._hopSettled(s, g, moves, reply);
  }

  // A settle reply (hopSettleOutcome says what it means). The parked list is dropped on `ok` and
  // `board_changed` only, and only if it is still the list that was sent; a stale reply (the
  // player restarted, quit or opened another board) changes nothing on screen.
  _hopSettled(s, g, sent, reply) {
    const attr = this._state(s, "sensor.life_stage")?.attributes?.hop_day;
    if (attr?.day === g.day && attr.tidy === true) g.tidy = true; // another screen made the day tidy meanwhile (P1)
    const out = hopSettleOutcome(reply, g);
    if (out.warn && !HOP_WARNED.has(`settle:${out.warn.code}`)) {
      HOP_WARNED.add(`settle:${out.warn.code}`);
      console.warn(`hatch-pet-card: the hop settle came to nothing (${out.warn.code}` +
        `${out.warn.bad_index !== undefined ? `, bad_index ${out.warn.bad_index}` : ""})`);
    }
    if (out.clear && this._hopParked(g.key) === sent) this._hopStore(g.key, null);
    if (out.settled) s.hopSeen = { day: g.day, done: true, tidy: out.tidy }; // the row follows the reply
    if (s.game !== g || !g.done) return;
    if (out.reload) {
      this._hopOpen(s, g);
      return;
    }
    g.tidy = out.tidy;
    g.settled = out.settled;
    if (out.settled) {
      g.prompt = out.found ? this._lines(s, "find", HOP_COPY.found).text : g.tidy ? HOP_COPY.tidy : HOP_COPY.solved;
    } else {
      g.prompt = out.refusal ? REFUSALS[out.refusal] : HOP_COPY.failed;
    }
    this._write(s, g.prompt, 60000);
    s.sayUntil = Date.now() + 60000;
    this._hopDraw(s, false);
  }

  // A key that went dark takes the focus with it: it moves to one that works (the shell slot).
  _hopRefocus(s) {
    const active = this.shadowRoot?.activeElement;
    if (this._modeButtons(s).includes(active) && active.getAttribute("aria-disabled") === "true") this._hopFocus(s);
  }

  // The state after a list (undo): a replay from the start, so a sunk pad and a spent use come back.
  _hopReplay(s, moves) {
    const g = s.game;
    g.moves = moves;
    g.st = HATCH_HOP.start(g.board);
    for (const m of moves) g.st = HATCH_HOP.apply(g.board, g.st, m);
    g.lit = null;
    g.special = false;
    this._hopStore(g.key, moves.length ? HATCH_HOP.encode(moves) : null);
    this._hopDraw(s, true);
    this._hopRefocus(s);
  }

  // Back to the start (free). From the solved view it is the way to try again for tidy.
  _hopRestart(s) {
    const g = s.game;
    g.done = false;
    g.prompt = null;
    s.sayUntil = 0;
    this._hopReplay(s, []);
    this._hopFocus(s);
  }
}
