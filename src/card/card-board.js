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
  tryTidy: "try for tidy",
  solved: "solved",
  tidy: "tidy",
};
// ◀ ▲ ▼ ▶ as hop-engine's STEPS: [name, row step, column step, glyph].
const HOP_DIRS = [["left", 0, -1, "◀"], ["up", -1, 0, "▲"], ["down", 1, 0, "▼"], ["right", 0, 1, "▶"]];
// The keys in their 2 x 4 block, reading order; the close button is the eighth (ship 5's hint).
const HOP_KEYS = [
  ["left", "◀", HOP_COPY.step.left], ["up", "▲", HOP_COPY.step.up],
  ["down", "▼", HOP_COPY.step.down], ["right", "▶", HOP_COPY.step.right],
  ["special", "✦", HOP_COPY.special(0)], ["undo", "↶", "Take back the last move"],
  ["restart", "↻", HOP_COPY.restart],
];
const HOP_CELLS = { ".": "pad", f: "pad find", o: "stone", "~": "water", "#": "wall", P: "pad start", N: "nest" };

class HatchPetCardBoard extends HatchPetCardGames {
  // --- Board mode: Hop of the Day (plan 2026-11-02-hop-of-the-day, ship 2b) ---------------------
  // Behind the YAML-only `experimental_hop` key. The board is `s.game` ({kind: "hop"}), so every
  // quit path that already tests `s.game` ends it: _endGame clears it (_hopEnd), and the server
  // never hears of it (hop is not in SERVER_GAMES). The keys are in the game overlay, as the
  // dig's are; the care pad is not touched. The rules are HATCH_HOP's (hop-engine.js); the
  // card plays every move locally and writes the move list to localStorage on every move.
  // Nothing is paid or settled in this ship.

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
      row.textContent = HOP_COPY.row;
      row.setAttribute("aria-label", HOP_COPY.rowAria);
      row.addEventListener("click", () => {
        this._tapped(row, s);
        this._hopOpen(s);
      });
      s.gameBox.append(row);
    }
    row.hidden = false;
  }

  // Ask for today's board and open it. Until the reply the picker stays up (and a second press
  // is ignored). A refusal is the ordinary refusal line; a reply the rules cannot play shows
  // nothing and logs once.
  async _hopOpen(s) {
    const picking = s.game;
    if (!picking?.picking || picking.hopLoading) return;
    const id = s.ids?.["sensor.mood"];
    if (!id) return;
    picking.hopLoading = true;
    if (s.scene) this._sceneEnd(s, { quiet: true }); // a live care scene leaves no bowl or prop under the grid
    let reply;
    try {
      reply = await this._hopFetch(id);
    } catch (err) {
      if (s.game === picking) this._endGame(s, "hmm, that didn't work");
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
    const g = s.game = { kind: "hop", board, key, moves: [], st: HATCH_HOP.start(board), lit: null,
      special: false, done: false, tidy: false, cell: 0 };
    this._hopForgetOld(s, key);
    const parked = this._hopParked(key);
    const run = parked && HATCH_HOP.replay(board, parked);
    if (run?.legal && !run.won) {
      g.moves = HATCH_HOP.decode(parked);
      g.st = HATCH_HOP.fromView(run.final);
    } else if (parked) {
      this._hopStore(key, null);
    }
    s.pet.classList.remove("go-left", "go-right");
    s.gameBox.classList.remove("showgo");
    this._hopBuild(s);
    this._gameView(s, "hop");
    if (!s.greeted) this._greetSpent(s); // playing together is the hello (F7), as any game
    this._reactFrames(s, "ready", { inGame: true });
    this._hopLayout(s);
    this._hopDraw(s, false);
    s.sayUntil = 0;
    g.prompt = null;
    this._hopFocus(s);
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

  // The overlay's board: the grid with its piece, and the keys (2 columns by 4 rows; the close
  // button is the eighth, where ship 5's hint will go).
  _hopBuild(s) {
    const g = s.game;
    const box = s.gameBox;
    this._hopTeardown(s);
    const wrap = document.createElement("div");
    wrap.className = "hopb";
    const keys = HOP_KEYS.map(([k, glyph, aria]) =>
      `<button class="hk" data-k="${k}" aria-label="${aria}">${glyph}</button>`).join("");
    wrap.innerHTML = `<div class="hgrid" tabindex="-1"><svg class="hpath" aria-hidden="true"><path/></svg>` +
      `<img class="hpiece" alt=""></div><div class="hkeys" role="group">${keys}</div>`;
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
      cells: [...grid.querySelectorAll(".hc")], keys: wrap.querySelector(".hkeys") };
    grid.addEventListener("click", (e) => this._hopTap(s, e));
    g.el.keys.addEventListener("click", (e) => {
      const b = e.target.closest("button.hk");
      if (b) this._hopKey(s, b);
    });
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
    s.gameBox.style.removeProperty("--hk");
    s.gameBox.style.removeProperty("--hr");
    s.gameBox.style.removeProperty("--hb");
  }

  // Called by _endGame, whichever way the board went.
  _hopEnd(s) {
    this._hopTeardown(s);
  }

  // The cell size the board is drawn at, from the overlay: the keys on the right (a key is at
  // most 44 px, less where the LCD is short), the grid in what is left. `g.cell` is what was
  // drawn: a tap commits at once from 44 px up, below that it lights first.
  _hopLayout(s) {
    const g = s.game;
    if (g?.kind !== "hop" || !g.el) return;
    const rect = s.gameBox.getBoundingClientRect();
    const [W, H] = [rect.width, rect.height];
    if (!W || !H) return;
    const [pad, gap] = [4, 3];
    const kk = Math.max(24, Math.min(44, Math.floor((H - 2 * pad - 3 * gap) / 4)));
    const keysW = 2 * kk + gap;
    const keysH = 4 * kk + 3 * gap;
    const top = Math.max(pad, Math.round((H - keysH) / 2));
    const { w, h } = g.board;
    const c = Math.max(12, Math.floor(Math.min((W - keysW - 3 * pad) / w, (H - 2 * pad) / h)));
    g.cell = c;
    const left = Math.round(pad + (W - keysW - 3 * pad - c * w) / 2);
    const css = s.gameBox.style;
    css.setProperty("--hk", `${kk}px`);
    css.setProperty("--hr", `${pad}px`);
    css.setProperty("--hb", `${top}px`);
    const el = g.el;
    el.grid.style.cssText = `left:${left}px;top:${Math.round((H - c * h) / 2)}px;width:${c * w}px;height:${c * h}px;` +
      `--c:${c}px;grid-template-columns:repeat(${w},${c}px)`;
    el.keys.style.cssText = `top:${top}px;right:${pad}px`;
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

  // The keys' look and state from the board's (aria-disabled, as the dig's keep is).
  _hopDraw(s, move = true) {
    const g = s.game;
    if (g?.kind !== "hop" || !g.el) return;
    const { cells, keys } = g.el;
    const { w } = g.board;
    const targets = g.done ? { plain: [], special: [] } : this._hopTargets(g);
    const legal = new Set([...targets.plain, ...targets.special]);
    const finds = [...g.board.grid.join("")].map((ch, i) => (ch === "f" ? i : -1)).filter((i) => i >= 0);
    const open = finds.every((i) => (g.st.sunk >> i) & 1 || i === g.st.pos);
    cells.forEach((el, i) => {
      const ch = g.board.grid.join("")[i];
      el.classList.toggle("sunk", ((g.st.sunk >> i) & 1) === 1);
      el.classList.toggle("legal", legal.has(i) && (!g.special || targets.special.includes(i)));
      el.classList.toggle("lit", g.lit === i);
      el.classList.toggle("open", ch === "N" && open);
    });
    const byKey = (k) => keys.querySelector(`[data-k="${k}"]`);
    const set = (k, enabled, label) => {
      const b = byKey(k);
      b.setAttribute("aria-disabled", enabled ? "false" : "true");
      if (label) b.setAttribute("aria-label", label);
    };
    for (const dir of HOP_DIRS) {
      const [name, , , glyph] = dir;
      const adj = this._hopAdjacent(g, dir);
      let enabled = false;
      if (!g.done) {
        enabled = g.special
          ? targets.special.some((t) => this._hopSpecialDir(g, t) === name)
          : targets.plain.includes(adj);
      }
      const cell = adj >= 0 ? g.board.grid.join("")[adj] : "";
      const sunk = adj >= 0 && ((g.st.sunk >> adj) & 1) === 1 && ".fP".includes(cell);
      const base = HOP_COPY.step[name];
      set(name, enabled, enabled || g.done ? base : `${base}, ${sunk ? HOP_COPY.sunk : HOP_COPY.blocked}`);
      byKey(name).textContent = glyph;
    }
    const left = g.st.uses;
    const sp = byKey("special");
    set("special", !g.done && left > 0, HOP_COPY.special(left));
    sp.textContent = `✦${left}`;
    sp.classList.toggle("on", g.special);
    set("undo", !g.done && g.moves.length > 0);
    set("restart", g.done ? !g.tidy : g.moves.length > 0, g.done && !g.tidy ? HOP_COPY.tryTidy : HOP_COPY.restart);
    s.gameBox.classList.toggle("end", g.done);
    this._hopPlace(s, move);
  }

  _hopFocus(s) {
    const g = s.game;
    const key = g.el.keys.querySelector('.hk[aria-disabled="false"]');
    (key || g.el.grid).focus({ preventScroll: true });
  }

  _hopKey(s, button) {
    const g = s.game;
    if (g?.kind !== "hop" || g.done) {
      if (g?.done && button.dataset.k === "restart" && button.getAttribute("aria-disabled") !== "true") this._hopRestart(s);
      return;
    }
    if (button.getAttribute("aria-disabled") === "true") return; // blocked or sunk: nothing, as the dig's keep
    this._tapped(button, s);
    const k = button.dataset.k;
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
    this._hopDraw(s, false);
  }

  _hopMove(s, cell) {
    const g = s.game;
    const was = g.st;
    const next = HATCH_HOP.apply(g.board, was, cell);
    if (!next) return;
    g.moves.push(cell);
    g.st = next;
    g.lit = null;
    g.special = false;
    if (next.done) {
      g.done = true;
      g.tidy = HATCH_HOP.isTidy(g.board, next);
      this._hopStore(g.key, null); // a board that ended parks nothing
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
  }

  // A key that went dark takes the focus with it: it moves to one that works.
  _hopRefocus(s) {
    const active = this.shadowRoot?.activeElement;
    if (active?.classList?.contains("hk") && active.getAttribute("aria-disabled") === "true") this._hopFocus(s);
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
    g.tidy = false;
    g.prompt = null;
    s.sayUntil = 0;
    this._hopReplay(s, []);
    this._hopFocus(s);
  }
}
