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
// A world's twist (one per board, never a baby's): "1" "2" stump pairs (stepping onto one puts
// the pet on its twin), "=" rug (a step onto it slides the pet one more cell the same way, if a
// step could enter that cell; a special landing on it does not slide). Neither ever sinks.
// Ship 4b: "c" crackle (a pad that sinks on its second leaving, half-sunk after the first), "%"
// pool (a stone on the move that makes the count of moves odd, water on an even one; never
// sinks), "r" ripple (a pad; leaving it also sinks the ripples to its right and the first plain
// pad "." after them), "?" dark cell and "*" lantern (a dark cell can't be entered until the
// lantern, a pad, is lit: sunk or under the pet; then it is a pad).
// A move names the cell stepped onto, by index in reading order ("a"-"x" on the wire); the
// state is at the landing (the twin, the cell past a rug), which may not be the named cell.
// A state is {pos, sunk (bit mask of sunk pads), uses (specials left), done (in the nest)}, and
// on a pool board `parity` (moves made mod 2), on a crackle board `half` (a mask of the
// half-sunk crackles), on no other board. Undo is a replay of the list without its last move.
// view() is the plain form (sunk and half as lists of cells); fromView() turns it back into a
// state, which is what apply and legalTargets take.
const HATCH_HOP = Object.freeze(
  (() => {
    const LETTERS = "abcdefghijklmnopqrstuvwx";
    const MAX_MOVES = 200; // rates.py HOP_MAX_MOVES
    const PADS = ".fPcr*?"; // hop.py's: sink when left, count toward tidy (a dark cell once lit)
    const CELLS = ".fo~#PN12=c%r?*";
    const NEVER_SINKING = "o12=%"; // hop.py's: walkable, never sinks
    const TWIST_GLYPHS = ["12", "=", "c", "%", "r", "?*"]; // one twist per board (hop.py's TWIST_GLYPHS)
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
          if (family === "swim" && cells[t] === "%") out.push([t, true]); // into a pool in its water phase
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
    // `parity` is the moves made mod 2: a pool is a stone on the move that makes the count odd.
    const entry = (board, cells, pos, t, special, sunk, uses, parity = 0) => {
      const cell = cells[t];
      if (cell === "?" && !lit(cells, sunk, pos)) return false; // dark: nothing enters it, a special neither
      if (special) {
        if (uses < 1) return false;
        if (board.family === "swim") return cell === "~" || (cell === "%" && parity === 1);
        if (board.family === "climb") return cell === "#";
        if (board.family === "squeeze") return PADS.includes(cell) && ((sunk >> t) & 1) === 1;
      }
      if (PADS.includes(cell)) return ((sunk >> t) & 1) === 0;
      if (cell === "%") return parity === 0;
      if (NEVER_SINKING.includes(cell)) return true;
      if (cell === "N") {
        const finds = maskOf(cells, (ch) => ch === "f");
        return (finds & ~(sunk | (1 << pos))) === 0;
      }
      return false;
    };
    // The lantern is lit when it is sunk or under the pet (derived, never stored).
    const lit = (cells, sunk, pos) => {
      const at = cells.indexOf("*");
      return at >= 0 && (at === pos || ((sunk >> at) & 1) === 1);
    };
    // [sunk, half] after the pet leaves `pos`: hop.py's leave(). A pad sinks (a crackle only on its
    // second leaving), and leaving an unsunk ripple sinks the ripples to its right along the row and
    // the first plain pad after them. A cell already sunk sinks nothing new.
    const leave = (board, cells, pos, sunk, half) => {
      const bit = 1 << pos;
      if (!PADS.includes(cells[pos]) || sunk & bit) return [sunk, half];
      if (cells[pos] === "c" && !(half & bit)) return [sunk, half | bit];
      sunk |= bit;
      half &= ~bit;
      if (cells[pos] === "r") {
        for (let j = pos + 1; j % board.w && !((sunk >> j) & 1); j++) {
          if (cells[j] === "r") {
            sunk |= 1 << j;
            continue;
          }
          if (cells[j] === ".") sunk |= 1 << j;
          break;
        }
      }
      return [sunk, half];
    };
    // The cell the pet ends on after entering `t` from `pos` (a legal entry): `t`, a stump's twin,
    // or the cell past a rug a step slid it to. `sunk` is after leaving `pos`. hop.py's land().
    const twinOf = (cells, t) => {
      if (cells[t] !== "1" && cells[t] !== "2") return -1;
      const a = cells.indexOf(cells[t]);
      return a === t ? cells.indexOf(cells[t], t + 1) : a;
    };
    const land = (board, cells, pos, t, special, sunk) => {
      const twin = twinOf(cells, t);
      if (twin >= 0) return twin;
      if (!special && cells[t] === "=") {
        const { w, h } = board;
        const [dr, dc] = [Math.floor(t / w) - Math.floor(pos / w), (t % w) - (pos % w)];
        const [r, c] = [Math.floor(t / w) + dr, (t % w) + dc];
        if (r >= 0 && r < h && c >= 0 && c < w && entry(board, cells, t, r * w + c, false, sunk, 0)) {
          const y = r * w + c;
          const yt = twinOf(cells, y);
          return yt >= 0 ? yt : y;
        }
      }
      return t;
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
      const kinds = TWIST_GLYPHS.filter((g) => cells.some((c) => g.includes(c))).length;
      if (kinds > 1) return false;
      const [ones, twos] = ["1", "2"].map((g) => cells.filter((c) => c === g).length);
      if (![0, 2].includes(ones) || ![0, 2].includes(twos) || (twos && !ones)) return false;
      const lanterns = cells.filter((c) => c === "*").length;
      if (lanterns > 1 || !!lanterns !== cells.includes("?")) return false; // one lantern, with dark cells
      if (!Number.isInteger(specials) || specials < 0 || specials > MAX_SPECIALS) return false;
      return !(kinds && specials === 0); // no twist on a baby's board
    };
    const start = (board) => {
      const cells = cellsOf(board);
      const s = { pos: cells.indexOf("P"), sunk: 0, uses: board.specials, done: false };
      if (cells.includes("%")) s.parity = 0;
      if (cells.includes("c")) s.half = 0;
      return s;
    };
    // The cells the pet may name next, in index order: the stepped-on cell, not the landing.
    const legalTargets = (board, state) => {
      if (state.done) return [];
      const cells = cellsOf(board);
      const out = new Set();
      for (const [t, special] of movesFrom(board, cells, state.pos)) {
        if (entry(board, cells, state.pos, t, special, state.sunk, state.uses, state.parity || 0)) out.add(t);
      }
      return [...out].sort((a, b) => a - b);
    };
    // The state after naming `cell`, or null if it is not a legal move.
    const apply = (board, state, cell) => {
      const cells = cellsOf(board);
      if (state.done || !Number.isInteger(cell) || cell < 0 || cell >= cells.length) return null;
      const parity = state.parity || 0;
      for (const [t, special] of movesFrom(board, cells, state.pos)) {
        if (t !== cell || !entry(board, cells, state.pos, t, special, state.sunk, state.uses, parity)) continue;
        const [sunk, half] = leave(board, cells, state.pos, state.sunk, state.half || 0);
        const to = land(board, cells, state.pos, t, special, sunk);
        const next = { pos: to, sunk, uses: state.uses - (special ? 1 : 0), done: cells[to] === "N" };
        if (cells.includes("%")) next.parity = parity ^ 1;
        if (cells.includes("c")) next.half = half;
        return next;
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
    const view = (state) => {
      const v = { pos: state.pos, sunk: bits(state.sunk), uses: state.uses, done: state.done };
      if (state.parity !== undefined) v.parity = state.parity;
      if (state.half !== undefined) v.half = bits(state.half);
      return v;
    };
    // The state a view() describes (replay's `final`): sunk and half back to bit masks; null if it
    // is not a state. hop.py's State.from_dict. apply, legalTargets and isTidy take this, not a
    // view. A missing parity or half stays missing, which every rule reads as 0.
    const fromView = (v) => {
      const ok = (i) => Number.isInteger(i) && i >= 0 && i < LETTERS.length;
      if (!v || !ok(v.pos) || !Array.isArray(v.sunk) || !v.sunk.every(ok)) return null;
      if (!Number.isInteger(v.uses) || v.uses < 0) return null;
      if (v.parity !== undefined && v.parity !== 0 && v.parity !== 1) return null;
      if (v.half !== undefined && !(Array.isArray(v.half) && v.half.every(ok))) return null;
      const mask = (list) => list.reduce((m, i) => m | (1 << i), 0);
      const s = { pos: v.pos, sunk: mask(v.sunk), uses: v.uses, done: !!v.done };
      if (v.parity !== undefined) s.parity = v.parity;
      if (v.half !== undefined) s.half = mask(v.half);
      return s;
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
    return {
      LETTERS,
      MAX_MOVES,
      PADS,
      valid,
      start,
      legalTargets,
      apply,
      isTidy,
      lit,
      encode,
      decode,
      replay,
      view,
      fromView,
    };
  })(),
);
