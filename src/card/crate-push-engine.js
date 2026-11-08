// Crate push's rules, the card's twin of custom_components/virtual_pet/crate_push.py (plan
// 2026-11-08-crate-push, slice 1). The card plays a board locally; the server replays the move list
// with its own copy and pays. tests/fixtures/crate_push_cases.json holds cases both engines must agree on
// (tests/test_crate_push.py, tests/js/crate_push_engine.test.js). No generator and no solver here: the server
// builds the board. One frozen namespace, no loose globals: the card is a classic script, so a top-level
// name is shared with every other card on the page.
//
// A board is the server's reply: {w, h, grid (rows, top first), par?}. Cells: "." floor, "#" wall, "~"
// void (both blocked), "P" start, "p" start on a spot, "b" crate, "n" spot, "B" crate on a spot. A move is
// a letter: "u" "d" "l" "r". A step into a crate pushes it one cell the same way, if that cell is floor or
// a spot with no wall and no other crate; otherwise the move is illegal. There is no pull. The board ends
// when every spot holds a crate: a letter after that is illegal. Undo is a replay of the list without its
// last move. A state is {pet, crates (sorted cell indexes)}.
const HATCH_CRATE_PUSH = Object.freeze(
  (() => {
    const MAX_MOVES = 400; // crate_push.py MAX_MOVES
    const CELLS = ".#~PpbnB";
    const BLOCKED = "#~";
    const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
    const cellsOf = (board) => board.grid.join("");
    const spotsOf = (board) => {
      const cells = cellsOf(board);
      const out = [];
      for (let i = 0; i < cells.length; i++) if ("npB".includes(cells[i])) out.push(i);
      return out;
    };
    // The server's reply is checked as the server checks it (Board.from_dict): a board that is not valid is not drawn.
    const valid = (board) => {
      if (!board || !Number.isInteger(board.w) || !Number.isInteger(board.h) || !Array.isArray(board.grid)) return false;
      if (board.w < 1 || board.w > 6 || board.h < 1 || board.h > 4) return false;
      if (board.grid.length !== board.h || board.grid.some((r) => typeof r !== "string" || r.length !== board.w)) return false;
      const cells = cellsOf(board);
      if ([...cells].some((c) => !CELLS.includes(c))) return false;
      const count = (set) => [...cells].filter((c) => set.includes(c)).length;
      if (count("Pp") !== 1) return false;
      const crates = count("bB");
      if (crates < 1 || crates !== count("npB")) return false;
      if (board.par != null && !(Number.isInteger(board.par) && board.par >= 0)) return false;
      return true;
    };
    const start = (board) => {
      const cells = cellsOf(board);
      const crates = [];
      for (let i = 0; i < cells.length; i++) if ("bB".includes(cells[i])) crates.push(i);
      return { pet: [...cells].findIndex((c) => "Pp".includes(c)), crates };
    };
    const isSolved = (board, state) => {
      const spots = spotsOf(board);
      return state.crates.length === spots.length && spots.every((s) => state.crates.includes(s));
    };
    // One move: the next state, or null if it is illegal (off the board, a wall, a crate that cannot move, or solved).
    const apply = (board, state, letter) => {
      const d = DIRS[letter];
      if (!d || isSolved(board, state)) return null;
      const cells = cellsOf(board);
      const x = (state.pet % board.w) + d[0];
      const y = Math.floor(state.pet / board.w) + d[1];
      if (x < 0 || x >= board.w || y < 0 || y >= board.h) return null;
      const to = y * board.w + x;
      if (BLOCKED.includes(cells[to])) return null;
      if (!state.crates.includes(to)) return { pet: to, crates: state.crates.slice() };
      const bx = x + d[0];
      const by = y + d[1];
      if (bx < 0 || bx >= board.w || by < 0 || by >= board.h) return null;
      const beyond = by * board.w + bx;
      if (BLOCKED.includes(cells[beyond]) || state.crates.includes(beyond)) return null;
      return { pet: to, crates: state.crates.filter((c) => c !== to).concat(beyond).sort((a, b) => a - b) };
    };
    const legalMoves = (board, state) => [..."udlr"].filter((m) => apply(board, state, m) !== null);
    // Replay a list from the start: {legal, bad_index, solved, neat, final, too_long}, as crate_push.py's replay.
    const replay = (board, moves) => {
      const out = { legal: false, bad_index: null, solved: false, neat: false, final: null, too_long: false };
      if (moves.length > MAX_MOVES) {
        out.too_long = true;
        return out;
      }
      let state = start(board);
      let bad = moves.length === 0 ? 0 : null;
      for (let i = 0; i < moves.length; i++) {
        const next = apply(board, state, moves[i]);
        if (next === null) {
          bad = i;
          break;
        }
        state = next;
      }
      out.final = { pet: state.pet, crates: state.crates.slice().sort((a, b) => a - b) };
      if (bad !== null) {
        out.bad_index = bad;
        return out;
      }
      out.legal = true;
      out.solved = isSolved(board, state);
      out.neat = out.solved && board.par != null && moves.length <= board.par;
      return out;
    };
    return { MAX_MOVES, valid, start, isSolved, apply, legalMoves, replay };
  })(),
);
