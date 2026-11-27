const HOUSEHOLD_HOP_STYLE = `
  .activity-panel.household-hop { padding: 5px 7%; gap: 3px; }
  .household-hop-board { position: absolute; inset: 0; container-type: size;
    display: grid; place-items: center; }
  .household-hop-grid { display: grid; grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
    width: min(100cqw, calc(100cqh * var(--columns) / var(--rows)));
    aspect-ratio: var(--columns) / var(--rows); }
  .household-hop-grid .hc { position: relative; display: block; appearance: none; padding: 0;
    min-width: 0; min-height: 0; box-sizing: border-box; background-color: #344b42;
    border: 1px solid #182d25; }
  .household-hop-grid button { cursor: pointer; }
  .household-hop-grid .hc.legal:focus-visible { outline: 2px solid #fff7db;
    outline-offset: -3px; z-index: 2; }
  .household-hop-grid .hc.here::before { content: ""; position: absolute; inset: 2px;
    border: 1px solid #14231d; outline: 1px solid #fff7db; z-index: 1; pointer-events: none; }
  .household-hop-grid .hc.handoff::before { border: 2px dashed #14231d; }
  .household-hop-grid .household-hop-piece { width: 90%; height: 90%; inset: 5%;
    object-fit: contain; z-index: 1; filter: drop-shadow(0 1px 1px #211d16); }
` + hopArtStyle().replaceAll(".game .hopb", ".household-hop-board");

const HOUSEHOLD_HOP_TIMEOUT = "household-hop.response";
const HOUSEHOLD_HOP_RULE_VERSION = 1;
const HOUSEHOLD_HOP_DIRECTIONS = [
  ["left", "ArrowLeft", 0, -1],
  ["up", "ArrowUp", -1, 0],
  ["down", "ArrowDown", 1, 0],
  ["right", "ArrowRight", 0, 1],
];
const HOUSEHOLD_HOP_DIAGONALS = [
  ["up-left", "Home", -1, -1],
  ["up-right", "PageUp", -1, 1],
  ["down-left", "End", 1, -1],
  ["down-right", "PageDown", 1, 1],
];
const HOUSEHOLD_HOP_TILE = {
  ".": "pad", f: "find", o: "stone", "~": "water", "#": "wall", P: "start", N: "nest",
  "?": "pad", "*": "lantern", "1": "stump", "2": "stump", "=": "rug", c: "crackle pad", r: "ripple pad",
  "%": "tide pool",
};

function householdHopPosition(view) {
  if (!view || !["active", "complete"].includes(view.status) ||
      view.rule_version !== HOUSEHOLD_HOP_RULE_VERSION) return null;
  const { board, moves } = view;
  if (!HATCH_HOP.valid(board) || typeof moves !== "string") return null;
  if (!moves) return view.status === "active" ? HATCH_HOP.start(board) : null;
  const run = HATCH_HOP.replay(board, moves);
  return run.legal && run.won === (view.status === "complete") ? HATCH_HOP.fromView(run.final) : null;
}

function householdHopTargetGroups(board, st) {
  const normal = [];
  const special = [];
  for (const cell of HATCH_HOP.legalTargets(board, st)) {
    const next = HATCH_HOP.apply(board, st, cell);
    (next.uses === st.uses ? normal : special).push(cell);
  }
  return { normal, special };
}

class HatchPetCardHouseholdHop extends HatchPetCardFamilyBedtime {
  _householdHopEntry(s, button) {
    const view = s.house?.gameplay?.household_hop;
    if (!button || !view) return;
    const suffix = view.status === "complete" ? " ✓" : "";
    button.textContent = "Household Hop" + suffix;
    button.setAttribute("aria-label", view.status === "complete" ? "Household Hop, complete" : "Household Hop");
  }

  _householdHopOpen(s, from) {
    const gameplay = s.house?.gameplay;
    const entity = s.ids?.["sensor.life_stage"];
    if (!gameplay?.household_hop_enabled || !gameplay.pet_ref || !entity || s.householdHop) return false;
    const game = s.householdHop = {
      ref: gameplay.pet_ref, entity, view: null, position: null, accessing: true,
      canEdit: false, retry: null, pending: null, menu: null, special: false,
      handoffSeen: false, news: "", failure: "",
    };
    this._householdHopAccept(game, gameplay.household_hop);
    const opened = this._activityOpen(s, {
      id: "household-hop", from, title: "Household Hop", holdCapFocus: true,
      text: () => this._householdHopText(game),
      buttons: () => this._householdHopButtons(s, game),
      leave: () => this._householdHopLeave(s, game),
      render: (box) => this._householdHopRender(box, s, game),
      close: () => {
        this._stop(s, { key: HOUSEHOLD_HOP_TIMEOUT });
        s.householdHop = null;
      },
    });
    if (!opened) {
      s.householdHop = null;
      return false;
    }
    s.activity.panel.classList.add("household-hop");
    void this._householdHopInspect(s, game);
    return true;
  }

  _householdHopCurrent(s, game) {
    return s.householdHop === game && s.activity?.id === "household-hop" &&
      s.house?.gameplay?.pet_ref === game.ref && !s.gone &&
      s === this._slides?.[this._index];
  }

  _householdHopSync(s) {
    const game = s.householdHop;
    const view = s.house?.gameplay?.household_hop;
    if (this._boardsChoosing(s)) this._householdHopEntry(s, s.gameBox.querySelector('[data-board="household"]'));
    if (!game || !this._householdHopCurrent(s, game) || !view) return;
    const advanced = game.view && view.revision > game.view.revision;
    if (this._householdHopAccept(game, view)) {
      if (advanced && !game.pending) game.news = "Board updated.";
      this._activityUpdate(s);
    }
  }

  _householdHopAccept(game, view) {
    if (!view || !Number.isSafeInteger(view.revision) || view.revision < 0) return false;
    const current = game.view;
    if (current && view.revision === current.revision && view.can_start !== current.can_start) {
      game.view = { ...current, can_start: view.can_start };
      return true;
    }
    if (current && view.revision <= current.revision) return false;
    game.view = view;
    game.position = householdHopPosition(view);
    game.targets = game.position ? householdHopTargetGroups(view.board, game.position) : null;
    game.handoffSeen = false;
    game.menu = null;
    game.special = false;
    return true;
  }

  _householdHopCall(game, request) {
    return this._hass.callWS({
      type: "virtual_pet/household_hop",
      entity_id: game.entity,
      pet_ref: game.ref,
      ...request,
    });
  }

  async _householdHopInspect(s, game) {
    game.accessing = true;
    game.failure = "";
    const attempt = game.pending = {};
    this._activityUpdate(s);
    const failed = () => {
      if (!this._householdHopCurrent(s, game) || game.pending !== attempt) return;
      this._stop(s, { key: HOUSEHOLD_HOP_TIMEOUT });
      game.pending = null;
      game.accessing = false;
      game.failure = "Couldn’t open the board.";
      this._activityUpdate(s);
    };
    this._later(s, 7000, failed, { key: HOUSEHOLD_HOP_TIMEOUT });
    try {
      const reply = await this._householdHopCall(game, { action: "view" });
      if (!this._householdHopCurrent(s, game) || game.pending !== attempt) return;
      if (reply?.result === "pet_changed") {
        this._activityClose(s, "changed");
        return;
      }
      if (reply?.result !== "ok") {
        failed();
        return;
      }
      this._stop(s, { key: HOUSEHOLD_HOP_TIMEOUT });
      game.pending = null;
      this._householdHopAccept(game, reply.state);
      game.canEdit = reply.can_edit === true;
      game.accessing = false;
      if (s.householdHopRetry?.ref === game.ref && game.canEdit) {
        game.retry = s.householdHopRetry.request;
        game.failure = "The reply didn’t arrive. Retry this turn.";
      } else s.householdHopRetry = null;
      this._activityUpdate(s);
      this._activityFocus(s);
    } catch {
      failed();
    }
  }

  async _householdHopAct(s, game, action, cell) {
    if (!this._householdHopCurrent(s, game) || game.pending || !game.canEdit ||
        game.retry && action !== undefined) return;
    const request = game.retry || {
      action, revision: game.view.revision,
      request_id: Array.from(crypto.getRandomValues(new Uint8Array(16)),
        (n) => n.toString(16).padStart(2, "0")).join(""),
      ...(cell === undefined ? {} : { cell }),
    };
    game.retry = request;
    s.householdHopRetry = { ref: game.ref, request };
    const attempt = game.pending = { request };
    game.failure = "";
    game.news = "";
    this._activityUpdate(s);
    const failed = () => {
      if (!this._householdHopCurrent(s, game) || game.pending !== attempt) return;
      this._stop(s, { key: HOUSEHOLD_HOP_TIMEOUT });
      game.pending = null;
      game.failure = "The reply didn’t arrive. Retry this turn.";
      this._activityUpdate(s);
      this._activityFocus(s);
    };
    this._later(s, request.action === "start" ? 14000 : 7000, failed, { key: HOUSEHOLD_HOP_TIMEOUT });
    let reply;
    try {
      reply = await this._householdHopCall(game, request);
    } catch {
      failed();
      return;
    }
    if (!this._householdHopCurrent(s, game) || game.pending !== attempt) return;
    if (!reply || !["ok", "changed", "illegal", "not_now", "pet_changed", "read_only"].includes(reply.result)) {
      failed();
      return;
    }
    this._stop(s, { key: HOUSEHOLD_HOP_TIMEOUT });
    game.pending = null;
    game.retry = null;
    s.householdHopRetry = null;
    if (reply.result === "pet_changed") {
      this._activityClose(s, "changed");
      return;
    }
    this._householdHopAccept(game, reply.state);
    if (reply.result === "ok" && request.action === "handoff") {
      this._activityClose(s, "handoff");
      return;
    }
    game.menu = null;
    game.special = false;
    if (reply.result === "read_only") game.canEdit = false;
    game.news = {
      changed: "Board updated.",
      illegal: "That move is unavailable. Choose again.",
      not_now: "Your pet needs a break.",
    }[reply.result] || "";
    this._activityUpdate(s);
  }

  _householdHopText(game) {
    if (game.accessing) return "Opening board…";
    if (game.pending) return game.pending.request?.action === "start" ? "Making a board…" : "Saving turn…";
    if (game.failure) return game.failure;
    const { view, position } = game;
    if (!view) return "Board unavailable.";
    if (view.status === "complete") return game.news
      ? "Board updated. You reached the nest!" : "Together, you reached the nest!";
    if (game.menu === "restart") return "Clear all moves?";
    if (view.status === "unsupported" || view.board && !position) return "This board needs a fresh start.";
    if (view.handoff && !game.handoffSeen) return game.canEdit ? "Resume here?" : "Saved turn here.";
    if (game.news) return game.news;
    if (!game.canEdit) return "Read-only board.";
    if (!view.board) return "Start a board to share.";
    if (view.moves.length === HATCH_HOP.MAX_MOVES) return "Move limit reached. Undo or restart.";
    if (game.special) return "Choose a special move.";
    if (!game.targets.normal.length) {
      return game.targets.special.length ? "Try a special move." : "No moves left. Undo or restart.";
    }
    return "Pick a tile.";
  }

  _householdHopButtons(s, game) {
    const { view, position, pending } = game;
    const perform = (action, cell) => this._householdHopAct(s, game, action, cell);
    const show = (settings) => {
      Object.assign(game, settings, { news: "" });
      this._activityUpdate(s);
    };
    const control = (label, cap, icon, act, keys = []) => ({ label, cap, icon, act, keys, disabled: !!pending });
    if (game.accessing) return [];
    if (game.failure && !game.retry) {
      return [control("Try opening the board again", "Retry", "icon_mode_restart",
        () => this._householdHopInspect(s, game))];
    }
    if (!game.canEdit || !view) return [];
    if (game.retry && !pending) return [control("Retry this turn", "Retry", "icon_mode_restart", () => perform())];
    if (view.status !== "active") {
      if (!view.can_start) return [];
      const label = view.status === "empty" ? "Start Household Hop" : "Start new board";
      return [control(label, "Start", "icon_mode_restart", () => perform("start"))];
    }
    if (!position) return [];
    if (view.handoff && !game.handoffSeen) {
      return [control("Continue from the saved tile", "Continue", "icon_mode_right", () => show({ handoffSeen: true }))];
    }
    const back = control("Back to the board", "Back", "icon_mode_left", () => show({ menu: null }));
    if (game.menu === "restart") {
      return [control("Confirm restart of this board", "Restart", "icon_mode_restart", () => perform("restart")), back];
    }
    const { board, moves } = view;
    const { normal, special } = game.targets;
    const targets = game.special ? special : normal;
    const diagonal = game.special && board.family === "glide";
    const rowAt = (cell) => Math.floor(cell / board.w);
    const colAt = (cell) => cell % board.w;
    const row = rowAt(position.pos);
    const col = colAt(position.pos);
    const directions = diagonal ? HOUSEHOLD_HOP_DIAGONALS : HOUSEHOLD_HOP_DIRECTIONS;
    const movement = directions.map(([name, key, dy, dx]) => {
      const target = targets.find((cell) => Math.sign(rowAt(cell) - row) === dy && Math.sign(colAt(cell) - col) === dx);
      const move = control(`${game.special ? "Special move" : "Step"} ${name}`,
        diagonal ? ({ "up-left": "↖", "up-right": "↗", "down-left": "↙", "down-right": "↘" })[name] : name,
        diagonal ? "" : `icon_mode_${name}`, () => perform("move", target), [key]);
      move.disabled ||= target === undefined || moves.length >= HATCH_HOP.MAX_MOVES;
      return move;
    });
    const chooseSpecial = control(`Special moves, ${position.uses} left`, `Special ${position.uses}`,
      "icon_mode_special", () => show({ special: !game.special }), ["s"]);
    chooseSpecial.selected = game.special;
    chooseSpecial.disabled ||= !special.length || moves.length >= HATCH_HOP.MAX_MOVES;
    const undo = control("Take back the last move", "Undo", "icon_mode_undo", () => perform("undo"), ["z"]);
    const restart = control("Restart this board", "Restart", "icon_mode_restart", () => show({ menu: "restart" }), ["r"]);
    undo.disabled ||= !moves;
    restart.disabled ||= !moves;
    return [...movement, chooseSpecial, undo, restart];
  }

  _householdHopLeave(s, game) {
    const { view, position } = game;
    if (!game.canEdit || game.pending || game.retry || game.menu ||
        view?.status !== "active" || !position || !view.moves || view.handoff) return null;
    return {
      cap: "Save", aria: "Leave for later", icon: "icon_mode_keep",
      act: () => this._householdHopAct(s, game, "handoff"),
    };
  }

  _householdHopRender(box, s, game) {
    const { view, position: st } = game;
    if (!view?.board || !st) return;
    const { board, moves } = view;
    const grid = board.grid.join("");
    const wrapper = document.createElement("div");
    wrapper.className = "household-hop-board";
    wrapper.dataset.world = board.world;
    wrapper.dataset.position = String(st.pos);
    const tiles = document.createElement("div");
    tiles.className = "household-hop-grid";
    tiles.setAttribute("role", "group");
    tiles.setAttribute("aria-label", "Puzzle tiles");
    tiles.style.setProperty("--columns", board.w);
    tiles.style.setProperty("--rows", board.h);
    const canMove = game.canEdit && !game.pending && !game.retry && !game.menu &&
      (!view.handoff || game.handoffSeen) && !st.done && moves.length < HATCH_HOP.MAX_MOVES;
    const targets = canMove ? (game.special ? game.targets.special : game.targets.normal) : [];
    const nestOpen = st.done || [...grid].every((tile, i) => tile !== "f" ||
      i === st.pos || (st.sunk >> i) & 1);
    const lit = HATCH_HOP.lit(grid, st.sunk, st.pos);
    for (const [i, tile] of [...grid].entries()) {
      const legal = targets.includes(i);
      const el = document.createElement(legal ? "button" : "span");
      const here = i === st.pos;
      const sunk = !!((st.sunk >> i) & 1);
      el.className = `hc ${HOP_CELLS[tile]}`;
      el.classList.toggle("legal", legal);
      el.classList.toggle("here", here);
      el.classList.toggle("handoff", here && view.handoff);
      el.classList.toggle("sunk", sunk);
      el.classList.toggle("open", tile === "N" && nestOpen);
      el.classList.toggle("dark", tile === "?" && !lit);
      el.classList.toggle("wet", tile === "%" && st.parity === 1);
      el.classList.toggle("half", tile === "c" && !!((st.half >> i) & 1));
      const surface = sunk ? "sunk pad" : hopCellLabel(board, st, i) || HOUSEHOLD_HOP_TILE[tile];
      const name = `Row ${Math.floor(i / board.w) + 1}, column ${i % board.w + 1}, ${surface}`;
      const presence = here ? (view.handoff ? "Saved turn, pet here. " : "Pet here. ") : "";
      const move = legal ? (game.special ? "Special move. " : "Move. ") : "";
      el.setAttribute("aria-label", presence + move + name);
      if (legal) {
        el.type = "button";
        el.dataset.householdCell = String(i);
        el.addEventListener("click", () => this._householdHopAct(s, game, "move", i));
      } else el.setAttribute("role", "img");
      if (here) {
        const actor = document.createElement("img");
        actor.className = "household-hop-piece";
        actor.alt = "";
        const source = s.pet.getAttribute("src");
        if (source) actor.src = source;
        el.append(actor);
      }
      tiles.append(el);
    }
    wrapper.append(tiles);
    box.append(wrapper);
  }
}
