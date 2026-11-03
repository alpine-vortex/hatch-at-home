// Hop of the Day's rules, the card's twin of custom_components/virtual_pet/hop.py (plan
// 2026-11-02-hop-of-the-day). The card plays a board locally; the server replays the move
// list with its own copy and pays. tests/fixtures/hop_cases.json holds cases both engines
// must agree on (tests/test_hop.py, tests/js/hop_engine.test.js). No generator and no
// solver here: the server builds the board. One frozen namespace, no loose globals: the
// card is a classic script, so a top-level name is shared with every other card on the page.
//
// A board is the server's reply: {w, h, grid (rows, top first), family, specials}. Cells:
// "." pad (sinks when left), "f" find pad, "o" stone (never sinks), "~" water, "#" wall,
// "P" start (a pad), "N" nest (open once every find is in; entering it ends the board).
// A move names the cell stepped onto, by index in reading order ("a"-"x" on the wire).
// A state is {pos, sunk (bit mask of sunk pads), uses (specials left), done (in the nest)}.
// Undo is a replay of the list without its last move. view() is the plain form (sunk as a list
// of cells); fromView() turns it back into a state, which is what apply and legalTargets take.
const HATCH_HOP = Object.freeze(
  (() => {
    const LETTERS = "abcdefghijklmnopqrstuvwx";
    const MAX_MOVES = 200; // rates.py HOP_MAX_MOVES
    const PADS = ".fP";
    const CELLS = ".fo~#PN";
    const FAMILIES = ["hop", "glide", "swim", "dig", "climb", "squeeze"];
    const MAX_SPECIALS = 3; // hop.py's
    const STEPS = [
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ]; // ◀ ▲ ▼ ▶, as hop.py
    const DIAGONALS = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    const cellsOf = (board) => board.grid.join("");
    const maskOf = (cells, test) => {
      let m = 0;
      for (let i = 0; i < cells.length; i++) if (test(cells[i])) m |= 1 << i;
      return m;
    };
    const bits = (mask) => {
      const out = [];
      for (let i = 0; i < 24; i++) if ((mask >> i) & 1) out.push(i);
      return out;
    };
    // Every [target, special] a cell can name, in hop.py's order.
    const movesFrom = (board, cells, pos) => {
      const { w, h, family } = board;
      const r = Math.floor(pos / w);
      const c = pos % w;
      const out = [];
      for (const [dr, dc] of STEPS) {
        let rr = r + dr;
        let cc = c + dc;
        if (rr >= 0 && rr < h && cc >= 0 && cc < w) {
          const t = rr * w + cc;
          out.push([t, (family === "swim" && cells[t] === "~") || (family === "climb" && cells[t] === "#")]);
          if (family === "squeeze" && PADS.includes(cells[t])) out.push([t, true]); // back onto it once sunk
        }
        if (family === "hop" || family === "dig") {
          rr = r + 2 * dr;
          cc = c + 2 * dc;
          if (rr >= 0 && rr < h && cc >= 0 && cc < w) {
            const mid = (r + dr) * w + c + dc;
            if (family === "hop" || cells[mid] === "#") out.push([rr * w + cc, true]);
          }
        }
      }
      if (family === "glide") {
        for (const [dr, dc] of DIAGONALS) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && rr < h && cc >= 0 && cc < w) out.push([rr * w + cc, true]);
        }
      }
      return out;
    };
    const entry = (board, cells, pos, t, special, sunk, uses) => {
      const cell = cells[t];
      if (special) {
        if (uses < 1) return false;
        if (board.family === "swim") return cell === "~";
        if (board.family === "climb") return cell === "#";
        if (board.family === "squeeze") return PADS.includes(cell) && ((sunk >> t) & 1) === 1;
      }
      if (PADS.includes(cell)) return ((sunk >> t) & 1) === 0;
      if (cell === "o") return true;
      if (cell === "N") {
        const finds = maskOf(cells, (ch) => ch === "f");
        return (finds & ~(sunk | (1 << pos))) === 0;
      }
      return false;
    };
    // hop.py's Board checks: is this reply a board the rules can play?
    const valid = (board) => {
      if (!board || typeof board !== "object") return false;
      const { w, h, grid, family, specials } = board;
      if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || w > 6 || h < 1 || h > 4) return false;
      if (!Array.isArray(grid) || grid.length !== h || grid.some((r) => typeof r !== "string" || r.length !== w))
        return false;
      const cells = [...grid.join("")];
      if (cells.some((c) => !CELLS.includes(c))) return false;
      if (cells.filter((c) => c === "P").length !== 1 || cells.filter((c) => c === "N").length !== 1) return false;
      if (!FAMILIES.includes(family)) return false;
      return Number.isInteger(specials) && specials >= 0 && specials <= MAX_SPECIALS;
    };
    const start = (board) => ({ pos: cellsOf(board).indexOf("P"), sunk: 0, uses: board.specials, done: false });
    // The cells the pet may name next, in index order.
    const legalTargets = (board, state) => {
      if (state.done) return [];
      const cells = cellsOf(board);
      const out = new Set();
      for (const [t, special] of movesFrom(board, cells, state.pos)) {
        if (entry(board, cells, state.pos, t, special, state.sunk, state.uses)) out.add(t);
      }
      return [...out].sort((a, b) => a - b);
    };
    // The state after naming `cell`, or null if it is not a legal move.
    const apply = (board, state, cell) => {
      const cells = cellsOf(board);
      if (state.done || !Number.isInteger(cell) || cell < 0 || cell >= cells.length) return null;
      for (const [t, special] of movesFrom(board, cells, state.pos)) {
        if (t !== cell || !entry(board, cells, state.pos, t, special, state.sunk, state.uses)) continue;
        const pads = maskOf(cells, (ch) => PADS.includes(ch));
        return {
          pos: t,
          sunk: state.sunk | (pads & (1 << state.pos)),
          uses: state.uses - (special ? 1 : 0),
          done: cells[t] === "N",
        };
      }
      return null;
    };
    const isTidy = (board, state) => {
      const pads = maskOf(cellsOf(board), (ch) => PADS.includes(ch));
      return state.done && (pads & ~state.sunk) === 0;
    };
    const encode = (list) => list.map((i) => LETTERS[i]).join("");
    // Letters to cells (-1 for a letter outside a-x); null over MAX_MOVES (too_long).
    // Letters count as code points, as Python's len (a UTF-16 length would differ for an emoji).
    const decode = (moves) => {
      const chars = [...moves];
      return chars.length > MAX_MOVES ? null : chars.map((ch) => LETTERS.indexOf(ch));
    };
    const view = (state) => ({ pos: state.pos, sunk: bits(state.sunk), uses: state.uses, done: state.done });
    // The state a view() describes (replay's `final`): sunk back to a bit mask; null if it is
    // not a state. hop.py's State.from_dict. apply, legalTargets and isTidy take this, not a view.
    const fromView = (v) => {
      const ok = (i) => Number.isInteger(i) && i >= 0 && i < LETTERS.length;
      if (!v || !ok(v.pos) || !Array.isArray(v.sunk) || !v.sunk.every(ok)) return null;
      if (!Number.isInteger(v.uses) || v.uses < 0) return null;
      return { pos: v.pos, sunk: v.sunk.reduce((m, i) => m | (1 << i), 0), uses: v.uses, done: !!v.done };
    };
    // hop.py's replay: {legal, bad_index, won, tidy, final, too_long}.
    const replay = (board, moves) => {
      const out = { legal: false, bad_index: null, won: false, tidy: false, final: null, too_long: false };
      const cells = decode(moves);
      if (cells === null) {
        out.too_long = true;
        return out;
      }
      let state = start(board);
      let bad = cells.length ? null : 0;
      for (let i = 0; i < cells.length; i++) {
        const next = apply(board, state, cells[i]);
        if (!next) {
          bad = i;
          break;
        }
        state = next;
      }
      out.final = view(state);
      if (bad !== null) {
        out.bad_index = bad;
        return out;
      }
      out.legal = true;
      out.won = state.done;
      out.tidy = isTidy(board, state);
      return out;
    };
    return { LETTERS, MAX_MOVES, valid, start, legalTargets, apply, isTidy, encode, decode, replay, view, fromView };
  })(),
);
