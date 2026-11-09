// Crate push (plan docs/plan-2026-11-08-crate-push.md, slice 3): the crate-pushing board. The pet pushes
// crates onto spots. A fork of card-board.js's shape, not a generalization of it: Hop's board is cell
// targets and twists, this one is four letters. It reuses Hop's overlay (the `.hopb` wrap, `.hgrid`
// and `.hc` cells, the pet piece) so _gameView, _hopEnd and the teardown already cover it. The card
// plays locally and parks the move letters; there is no settle and no pay until slice 4.
const CRATE_KEY = "hatch-crate"; // + |device|day|id: the parked letters
const CRATE_WARNED = new Set();
const CRATE_LEVELS = [["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"]];
const CRATE_COPY = {
  row: "Today's boards",
  rowAria: "Today's boards: Hop of the Day or Crate Push",
  boards: "Crate Push",
  boardsAria: "Crate Push, three levels",
  pickBoard: "which board?",
  pick: "which level?",
  level: { easy: "Easy +14", normal: "Normal +20", hard: "Hard +26" },
  levelAria: { easy: "Easy crates", normal: "Normal crates", hard: "Hard crates" },
  step: { left: "Push left", up: "Push up", down: "Push down", right: "Push right" },
  undo: "Take back the last move",
  restart: "Start the board again",
  next: "Next board",
  solved: "all crates home!",
  paid: "all crates home! play again?",
  found: "all crates home, and a neat find!",
  changed: "that board moved on, here is the next one",
  enough: "that's plenty of crates for today",
  failed: "hmm, that didn't work",
  hint: "Show a hint",
  stuck: (n) => `This one's stuck. Take back ${n === 1 ? "1 move" : `${n} moves`}.`,
  notNeat: "Using a hint means no neat find on this board.",
  hintUnknown: "Hmm, I can't see a way from here. Try taking back a few moves.",
  hintNo: "No hint right now.",
  practice: "Practice",
  practiceAria: "practice board, no pay",
  practiceDone: "nice! one more?",
};
const CRATE_CELLS = { ".": "floor", "#": "wall", "~": "water", P: "floor", p: "floor spot", b: "floor", n: "floor spot", B: "floor spot" };
const CRATE_DELTA = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
const CRATE_DIRS = [["left", "l"], ["up", "u"], ["down", "d"], ["right", "r"]];
const crateStore = (key, val) => {
  if (!key) return; // a practice board parks nothing
  try {
    if (val) localStorage.setItem(key, val);
    else localStorage.removeItem(key);
  } catch (err) {
    // no storage: the board just won't be there on return
  }
};
const crateRead = (key) => {
  if (!key) return "";
  try {
    return localStorage.getItem(key) || "";
  } catch (err) {
    return "";
  }
};

class HatchPetCardCrate extends HatchPetCardBoard {
  // One row for the day's boards (the Hop row's place): it offers Hop of the Day and Crate Push in the picker's
  // own area, so the picker's layout never has a second row to fit.
  _hopRowTap(s) {
    this._boardsChoose(s);
  }

  _hopRowSet(s, row) {
    const changed = super._hopRowSet(s, row);
    row.textContent = CRATE_COPY.row;
    row.setAttribute("aria-label", CRATE_COPY.rowAria);
    return changed;
  }

  _boardsChoose(s) {
    const picking = s.game;
    if (!picking?.picking || picking.crateLoading) return;
    const state = s.gameBox.querySelector(".ghop")?.dataset.state || "open";
    const pick = s.gameBox.querySelector(".gpick");
    pick.innerHTML = `<button data-board="hop" aria-label="${HOP_COPY.rowStateAria[state]}">${HOP_COPY.rowState[state]}</button>` +
      `<button data-board="crate" aria-label="${CRATE_COPY.boardsAria}">${CRATE_COPY.boards}</button>`;
    for (const b of pick.querySelectorAll("[data-board]")) {
      b.addEventListener("click", () => {
        this._tapped(b, s);
        if (b.dataset.board === "hop") this._hopOpen(s);
        else this._crateLevels(s);
      });
    }
    picking.prompt = CRATE_COPY.pickBoard;
    this._pickerSay?.(s, picking, CRATE_COPY.pickBoard);
    pick.querySelector("[data-board]")?.focus({ preventScroll: true });
  }

  // The level choice: the picker's own area shows the levels instead of the games; any way out of the
  // picker (the close button, Escape) ends it as before.
  _crateLevels(s) {
    const picking = s.game;
    if (!picking?.picking || picking.crateLoading) return;
    const pick = s.gameBox.querySelector(".gpick");
    pick.innerHTML = CRATE_LEVELS.map(([key]) =>
      `<button data-crate="${key}" aria-label="${CRATE_COPY.levelAria[key]}">${CRATE_COPY.level[key]}</button>`).join("") +
      `<button data-crate="practice" aria-label="${CRATE_COPY.practiceAria}">${CRATE_COPY.practice}</button>`;
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
    if (!picking?.picking || picking.crateLoading || !(level === "practice" || CRATE_LEVELS.some(([k]) => k === level))) return;
    const id = s.ids?.["sensor.mood"];
    if (!id) return;
    picking.crateLoading = true;
    if (s.scene) this._sceneEnd(s, { quiet: true });
    let reply;
    try {
      // no round: the server gives the next one to pay; a practice board has only the card's counter
      reply = await this._crateFetch(id, level, level === "practice" ? this._cratePracticeRound() : null);
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
    this._crateStart(s, reply, level, reply.round);
  }

  // Practice has no server round: the card counts its own (1..99, a page restart starts again).
  _cratePracticeRound() {
    this._cratePractice = (this._cratePractice % 99) + 1 || 1;
    return this._cratePractice;
  }

  // The `hop` service's `board` answer for crate push (the seam a check stubs).
  async _crateFetch(id, level, round) {
    const data = { entity_id: id, action: "board", game: "crate-push", level };
    if (level === "practice") {
      data.practice = true;
      delete data.level;
    }
    if (round) data.round = round;
    const res = await this._hass.callService("virtual_pet", "hop", data, undefined, false, true);
    return res?.response;
  }

  // The `hop` service's `settle` answer: the server replays the letters and pays (the seam a check stubs).
  async _crateSend(id, g) {
    const res = await this._hass.callService("virtual_pet", "hop",
      { entity_id: id, action: "settle", game: "crate-push", level: g.level, round: g.round, id: g.id,
        moves: g.moves.join("") }, undefined, false, true);
    return res?.response;
  }

  // The `hop` service's `hint` answer: the next step for the letters played so far (the seam a check stubs).
  async _crateHintSend(id, g, sent) {
    const data = { entity_id: id, action: "hint", game: "crate-push", level: g.level, round: g.round, id: g.id,
      moves: sent };
    if (g.practice) {
      data.practice = true;
      delete data.level;
    }
    const res = await this._hass.callService("virtual_pet", "hop", data, undefined, false, true);
    return res?.response;
  }

  // The hint key: asks the server for the next step from where the letters stand. The reply is used only if
  // the letters are still the ones sent (a move or an undo meanwhile drops it). A step pulses the matching
  // direction button and the cell the pet would step to, with no sentence; a stuck board says how far to take back.
  async _crateHint(s) {
    const g = s.game;
    const id = s.ids?.["sensor.mood"];
    if (g?.kind !== "crate" || !id || g.done || g.settling || g.crateLoading || g.busy) return;
    const sent = g.moves.join("");
    g.busy = true;
    g.lastAt = Date.now();
    this._crateDraw(s, false);
    let reply;
    try {
      reply = await this._crateHintSend(id, g, sent);
    } catch (err) {
      reply = null;
    }
    if (s.game !== g) return;
    g.busy = false;
    g.lastAt = Date.now();
    if (g.moves.join("") === sent) this._crateHintShow(s, reply);
    this._crateDraw(s, false);
  }

  _crateHintShow(s, reply) {
    const g = s.game;
    if (reply?.result !== "ok") {
      const line = REFUSALS[reply?.result];
      if (reply?.result === "board_changed") crateStore(g.key, null);
      this._write(s, typeof line === "string" ? line : CRATE_COPY.hintNo, 6000);
      return;
    }
    const first = !g.hinted;
    if (reply.kind === "step") g.hinted = true;
    if (reply.kind === "stuck") {
      g.hinted = true;
      this._write(s, CRATE_COPY.stuck(reply.back), 6000);
      return;
    }
    if (reply.kind === "unknown") {
      this._write(s, CRATE_COPY.hintUnknown, 6000);
      return;
    }
    if (reply.kind !== "step") return;
    const dir = CRATE_DIRS.findIndex(([, letter]) => letter === reply.letter);
    if (dir < 0) return;
    if (first && g.neatOpen) this._write(s, CRATE_COPY.notNeat, 6000);
    const [dx, dy] = CRATE_DELTA[reply.letter];
    const { w } = g.board;
    const to = g.st.pet + dy * w + dx;
    const classes = calm() ? ["hint"] : ["hint", "pulse"];
    const button = this._modeButtons(s)[dir];
    if (button) this._hold(s, button, classes, 1600, { key: "crate.hint.btn" });
    const cell = g.el?.cells[to];
    if (cell) this._hold(s, cell, classes, 1600, { key: "crate.hint.cell" });
  }

  // A solved board goes to the server, which replays it and pays. The letters stay parked until it says
  // ok, so a closed card or a lost connection settles on the next open.
  async _crateSettle(s) {
    const g = s.game;
    const id = s.ids?.["sensor.mood"];
    if (g?.kind !== "crate" || g.practice || !g.done || g.settled || g.settling || !id) return;
    g.settling = true;
    let reply;
    try {
      reply = await this._crateSend(id, g);
    } catch (err) {
      g.settling = false;
      return;
    }
    g.settling = false;
    if (s.game !== g) return;
    const result = reply?.result;
    if (result === "ok") {
      g.settled = true;
      g.next = reply.next_round;
      crateStore(g.key, null);
      g.prompt = reply.found ? CRATE_COPY.found : CRATE_COPY.paid;
      this._write(s, g.prompt, 60000);
      s.sayUntil = Date.now() + 60000;
      this._crateDraw(s, false);
    } else if (result === "board_changed" || result === "enough") {
      // Someone else paid this round (another screen), or a new day: the parked letters mean nothing now.
      crateStore(g.key, null);
      g.settled = true;
      g.next = null;
      this._write(s, result === "enough" ? CRATE_COPY.enough : CRATE_COPY.changed, 60000);
      this._crateDraw(s, false);
    } else {
      g.settled = true; // illegal, too_long, asleep, egg ...: not paid; no retry loop
      const line = REFUSALS[result];
      if (line) this._write(s, typeof line === "string" ? line : CRATE_COPY.failed, 6000);
    }
  }

  _crateStart(s, reply, level, round) {
    const board = { w: reply.w, h: reply.h, grid: reply.grid, par: reply.par };
    const practice = reply.practice === true;
    const key = practice ? null : `${CRATE_KEY}|${s.ids?.device}|${reply.day}|${reply.id}`;
    const g = s.game = { kind: "crate", board, level, round, key, id: reply.id, day: reply.day, moves: [],
      st: HATCH_CRATE_PUSH.start(board), done: false, cell: 0, keys: {},
      hinted: !!reply.hinted, neatOpen: !practice && !!reply.neat_open, practice };
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
      this._crateSettle(s);
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
    keys.hint = { enabled: !g.done && !g.settling && !g.crateLoading && !g.busy, label: CRATE_COPY.hint };
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
    else if (k === "hint") this._crateHint(s);
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
      this._reactFrames(s, "praised", { inGame: true });
      this._chirp(s, "win");
      g.prompt = g.practice ? CRATE_COPY.practiceDone : CRATE_COPY.solved;
      this._write(s, g.prompt, 60000);
      s.sayUntil = Date.now() + 60000;
      if (!g.practice) this._crateSettle(s);
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
    if (!g.settled && !g.practice) { // an unpaid board: settle first, so the next one is the one to pay
      await this._crateSettle(s);
      if (s.game !== g || !g.settled) return;
    }
    g.crateLoading = true;
    let reply;
    try {
      reply = await this._crateFetch(id, g.level, g.practice ? this._cratePracticeRound() : null);
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
    this._crateStart(s, reply, g.level, reply.round);
  }
}
