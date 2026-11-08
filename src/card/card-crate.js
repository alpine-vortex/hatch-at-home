// Crate push (plan docs/plan-2026-11-08-crate-push.md, slice 3): the crate-pushing board. The pet pushes
// crates onto spots. A fork of card-board.js's shape, not a generalization of it: Hop's board is cell
// targets and twists, this one is four letters. It reuses Hop's overlay (the `.hopb` wrap, `.hgrid`
// and `.hc` cells, the pet piece) so _gameView, _hopEnd and the teardown already cover it. The card
// plays locally and parks the move letters; there is no settle and no pay until slice 4.
const CRATE_KEY = "hatch-crate"; // + |device|day|id: the parked letters
const CRATE_DONE_KEY = "hatch-crate-done"; // + |device|day|level: rounds finished today on this device (slice 4: the server's)
const CRATE_WARNED = new Set();
const CRATE_LEVELS = [["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"]];
const CRATE_COPY = {
  row: "Crates",
  rowAria: "Play crate push",
  pick: "which level?",
  level: { easy: "Easy", normal: "Normal", hard: "Hard" },
  levelAria: { easy: "Easy crates", normal: "Normal crates", hard: "Hard crates" },
  step: { left: "Push left", up: "Push up", down: "Push down", right: "Push right" },
  undo: "Take back the last move",
  restart: "Start the board again",
  next: "Next board",
  solved: "all crates home!",
  failed: "hmm, that didn't work",
};
const CRATE_CELLS = { ".": "floor", "#": "wall", "~": "water", P: "floor", p: "floor spot", b: "floor", n: "floor spot", B: "floor spot" };
const CRATE_DIRS = [["left", "l"], ["up", "u"], ["down", "d"], ["right", "r"]];
const crateStore = (key, val) => {
  try {
    if (val) localStorage.setItem(key, val);
    else localStorage.removeItem(key);
  } catch (err) {
    // no storage: the board just won't be there on return
  }
};
const crateRead = (key) => {
  try {
    return localStorage.getItem(key) || "";
  } catch (err) {
    return "";
  }
};

class HatchPetCardCrate extends HatchPetCardBoard {
  // The row beside Hop's (built when the picker opens): it swaps the picker's games for the three levels.
  _crateRow(s) {
    let row = s.gameBox.querySelector(".gcrate");
    if (!row) {
      row = document.createElement("button");
      row.className = "gcrate";
      row.type = "button";
      row.textContent = CRATE_COPY.row;
      row.setAttribute("aria-label", CRATE_COPY.rowAria);
      row.addEventListener("click", () => {
        this._tapped(row, s);
        this._crateLevels(s);
      });
      s.gameBox.append(row);
    }
    row.hidden = false;
    s.gameBox.querySelector(".ghop")?.classList.add("pair");
  }

  // The level choice: the picker's own area shows the levels instead of the games; any way out of the
  // picker (the close button, Escape) ends it as before.
  _crateLevels(s) {
    const picking = s.game;
    if (!picking?.picking || picking.crateLoading) return;
    const pick = s.gameBox.querySelector(".gpick");
    pick.innerHTML = CRATE_LEVELS.map(([key]) =>
      `<button data-crate="${key}" aria-label="${CRATE_COPY.levelAria[key]}">${CRATE_COPY.level[key]}</button>`).join("");
    for (const b of pick.querySelectorAll("[data-crate]")) {
      b.addEventListener("click", () => {
        this._tapped(b, s);
        this._crateOpen(s, b.dataset.crate);
      });
    }
    picking.levels = true;
    picking.prompt = CRATE_COPY.pick;
    this._pickerSay?.(s, picking, CRATE_COPY.pick);
    pick.querySelector("[data-crate]")?.focus({ preventScroll: true });
  }

  _crateToday() {
    return typeof hopToday === "function" ? hopToday(this._hass?.config?.time_zone) : new Date().toISOString().slice(0, 10);
  }

  async _crateOpen(s, level) {
    const picking = s.game;
    if (!picking?.picking || picking.crateLoading || !CRATE_LEVELS.some(([k]) => k === level)) return;
    const id = s.ids?.["sensor.mood"];
    if (!id) return;
    picking.crateLoading = true;
    if (s.scene) this._sceneEnd(s, { quiet: true });
    const done = parseInt(crateRead(`${CRATE_DONE_KEY}|${s.ids?.device}|${this._crateToday()}|${level}`), 10) || 0;
    const round = Math.min(99, done + 1);
    let reply;
    try {
      reply = await this._crateFetch(id, level, round);
    } catch (err) {
      if (s.game === picking) this._endGame(s, CRATE_COPY.failed);
      return;
    }
    if (s.game !== picking) return; // stopped while waiting
    if (reply?.result && reply.result !== "ok") {
      this._endGame(s, REFUSALS[reply.result] ?? null);
      return;
    }
    if (!HATCH_CRATE_PUSH.valid(reply) || typeof reply.id !== "string" || typeof reply.day !== "string") {
      if (!CRATE_WARNED.has("board")) {
        CRATE_WARNED.add("board");
        console.warn("hatch-pet-card: the crate push board reply is not a board the rules can play");
      }
      this._endGame(s, null);
      return;
    }
    this._crateStart(s, reply, level, round);
  }

  // The `hop` service's `board` answer for crate push (the seam a check stubs).
  async _crateFetch(id, level, round) {
    const res = await this._hass.callService("virtual_pet", "hop",
      { entity_id: id, action: "board", game: "crate-push", level, round }, undefined, false, true);
    return res?.response;
  }

  _crateStart(s, reply, level, round) {
    const board = { w: reply.w, h: reply.h, grid: reply.grid, par: reply.par };
    const key = `${CRATE_KEY}|${s.ids?.device}|${reply.day}|${reply.id}`;
    const g = s.game = { kind: "crate", board, level, round, key, id: reply.id, day: reply.day, moves: [],
      st: HATCH_CRATE_PUSH.start(board), done: false, cell: 0, keys: {} };
    const parked = crateRead(key);
    if (parked) {
      const run = HATCH_CRATE_PUSH.replay(board, [...parked]);
      if (run.legal) {
        g.moves = [...parked];
        g.st = HATCH_CRATE_PUSH.start(board);
        for (const m of g.moves) g.st = HATCH_CRATE_PUSH.apply(board, g.st, m);
        g.done = run.solved;
      } else crateStore(key, null);
    }
    s.pet.classList.remove("go-left", "go-right");
    this._crateBuild(s);
    this._gameView(s, "hop");
    if (!s.greeted) this._greetSpent(s);
    this._reactFrames(s, g.done ? "praised" : "ready", { inGame: true });
    this._crateLayout(s);
    this._crateDraw(s, false);
    this._modeEnter(s, SHELL_MODES.crate, { from: s.buttons.play });
    if (g.done) {
      g.prompt = CRATE_COPY.solved;
      this._write(s, g.prompt, 60000);
      s.sayUntil = Date.now() + 60000;
    } else {
      s.sayUntil = 0;
    }
    g.lastAt = Date.now();
    g.el.grid.focus?.({ preventScroll: true });
  }

  _crateBuild(s) {
    const g = s.game;
    const box = s.gameBox;
    this._hopTeardown(s);
    const wrap = document.createElement("div");
    wrap.className = "hopb crate";
    wrap.dataset.world = s.worldKey || "";
    wrap.innerHTML = `<div class="hgrid" tabindex="-1"><img class="hpiece" alt=""></div>`;
    box.prepend(wrap);
    const grid = wrap.querySelector(".hgrid");
    grid.prepend(...[...g.board.grid.join("")].map((ch, i) => {
      const el = document.createElement("i");
      el.className = `hc ${CRATE_CELLS[ch]}`;
      el.dataset.i = String(i);
      return el;
    }));
    g.el = { wrap, grid, piece: grid.querySelector(".hpiece"), cells: [...grid.querySelectorAll(".hc")] };
    grid.addEventListener("click", (e) => this._crateTap(s, e));
    const mirror = () => { g.el.piece.src = s.pet.getAttribute("src") || ""; };
    mirror();
    g.mo = new MutationObserver(mirror);
    g.mo.observe(s.pet, { attributes: true, attributeFilter: ["src"] });
    g.ro = new ResizeObserver(() => { if (s.game === g) this._crateLayout(s); });
    g.ro.observe(box);
  }

  _crateLayout(s) {
    const g = s.game;
    if (g?.kind !== "crate" || !g.el) return;
    const rect = s.gameBox.getBoundingClientRect();
    const [W, H] = [rect.width, rect.height];
    if (!W || !H) return;
    const { w, h } = g.board;
    const c = hopCell(W, H, w, h);
    g.cell = c;
    g.el.grid.style.cssText = `left:${Math.round((W - c * w) / 2)}px;top:${Math.round((H - c * h) / 2)}px;` +
      `width:${c * w}px;height:${c * h}px;--c:${c}px;grid-template-columns:repeat(${w},${c}px)`;
    g.el.wrap.dataset.cell = String(c);
    this._cratePlace(s);
  }

  _cratePlace(s, move = false) {
    const g = s.game;
    const { piece } = g.el;
    const x = (g.st.pet % g.board.w) * g.cell;
    const y = Math.floor(g.st.pet / g.board.w) * g.cell;
    const size = Math.round(g.cell * 0.86);
    const off = Math.round((g.cell - size) / 2);
    piece.style.width = piece.style.height = `${size}px`;
    piece.style.transition = move && !calm() ? "" : "none";
    piece.style.translate = `${x + off}px ${y + off}px`;
  }

  // The crates on their cells, the piece, and the keys' state on `g.keys` (the `crate` shell mode reads it).
  _crateDraw(s, move = true) {
    const g = s.game;
    if (g?.kind !== "crate" || !g.el) return;
    const crates = new Set(g.st.crates);
    g.el.cells.forEach((el, i) => el.classList.toggle("crate", crates.has(i)));
    g.el.wrap.classList.toggle("won", g.done);
    this._cratePlace(s, move);
    const legal = new Set(HATCH_CRATE_PUSH.legalMoves(g.board, g.st));
    const keys = {};
    for (const [name, letter] of CRATE_DIRS) keys[name] = { enabled: !g.done && legal.has(letter), label: CRATE_COPY.step[name] };
    keys.undo = { enabled: !g.done && g.moves.length > 0, label: CRATE_COPY.undo };
    keys.restart = { enabled: g.moves.length > 0, label: g.done ? CRATE_COPY.next : CRATE_COPY.restart,
      cap: g.done ? "next" : "restart" };
    g.keys = keys;
    this._modeSync(s);
  }

  _crateKey(s, k) {
    const g = s.game;
    if (g?.kind !== "crate" || !g.keys?.[k]?.enabled) return;
    g.lastAt = Date.now();
    const dir = CRATE_DIRS.find(([name]) => name === k);
    if (dir) this._crateMove(s, dir[1]);
    else if (k === "undo") this._crateReplay(s, g.moves.slice(0, -1));
    else if (k === "restart") {
      if (g.done) this._crateNext(s);
      else this._crateReplay(s, []);
    }
  }

  // A tap on a cell next to the pet pushes that way; any other tap does nothing (plan: no walking).
  _crateTap(s, e) {
    const g = s.game;
    if (g?.kind !== "crate" || g.done) return;
    const cell = e.target.closest?.(".hc");
    if (!cell) return;
    const to = parseInt(cell.dataset.i, 10);
    const { w } = g.board;
    const [dx, dy] = [(to % w) - (g.st.pet % w), Math.floor(to / w) - Math.floor(g.st.pet / w)];
    const name = dx === -1 && dy === 0 ? "left" : dx === 1 && dy === 0 ? "right" : dy === -1 && dx === 0 ? "up"
      : dy === 1 && dx === 0 ? "down" : null;
    if (name) this._crateKey(s, name);
  }

  _crateMove(s, letter) {
    const g = s.game;
    const next = HATCH_CRATE_PUSH.apply(g.board, g.st, letter);
    if (!next) return;
    g.lastAt = Date.now();
    g.moves.push(letter);
    g.st = next;
    crateStore(g.key, g.moves.join(""));
    if (HATCH_CRATE_PUSH.isSolved(g.board, next)) {
      g.done = true;
      const dk = `${CRATE_DONE_KEY}|${s.ids?.device}|${g.day}|${g.level}`;
      crateStore(dk, String((parseInt(crateRead(dk), 10) || 0) + 1));
      this._reactFrames(s, "praised", { inGame: true });
      this._chirp(s, "win");
      g.prompt = CRATE_COPY.solved;
      this._write(s, g.prompt, 60000);
      s.sayUntil = Date.now() + 60000;
    } else this._chirp(s, "tap");
    this._crateDraw(s, true);
  }

  // Undo and restart: the state from the start with these letters.
  _crateReplay(s, moves) {
    const g = s.game;
    g.moves = moves;
    g.st = HATCH_CRATE_PUSH.start(g.board);
    for (const m of moves) g.st = HATCH_CRATE_PUSH.apply(g.board, g.st, m);
    crateStore(g.key, moves.length ? moves.join("") : null);
    this._crateDraw(s, false);
  }

  // The next round of the level, on the same overlay: the picker's guard needs a picking game, so the
  // board is asked for with the finished one standing in.
  async _crateNext(s) {
    const g = s.game;
    if (g?.kind !== "crate" || g.crateLoading) return;
    const id = s.ids?.["sensor.mood"];
    if (!id) return;
    g.crateLoading = true;
    const round = Math.min(99, g.round + 1);
    let reply;
    try {
      reply = await this._crateFetch(id, g.level, round);
    } catch (err) {
      g.crateLoading = false;
      return;
    }
    if (s.game !== g) return;
    if (!HATCH_CRATE_PUSH.valid(reply) || typeof reply.id !== "string" || typeof reply.day !== "string") {
      g.crateLoading = false;
      return;
    }
    this._hopTeardown(s);
    this._crateStart(s, reply, g.level, round);
  }
}
