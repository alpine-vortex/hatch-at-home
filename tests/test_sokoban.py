"""Sokoban's engine, generator, solver and bots (sokoban.py; plan
docs/plan-2026-11-08-sokoban-board.md, slice 1).

The generator runs on 5 seeded boards per level here; SOKOBAN_FULL=1 runs 300
per level and prints the table the slice's report quotes (pytest -s). The tests
count solver states, never wall-clock time.
"""

from __future__ import annotations

from datetime import date, timedelta
import json
import os
from pathlib import Path
import random

import pytest

from custom_components.virtual_pet import sokoban as S

ROOT = Path(__file__).resolve().parent.parent
CASES = json.loads(
    (ROOT / "tests" / "fixtures" / "sokoban_cases.json").read_text(encoding="utf-8")
)
FULL = bool(os.environ.get("SOKOBAN_FULL"))
N = 300 if FULL else 5
LEVELS = list(S.LEVELS)


def _board(name: str) -> S.Board:
    return S.Board.from_dict(CASES["boards"][name])


# --- The rules: the shared fixtures -----------------------------------------------


@pytest.mark.parametrize(
    "case", CASES["cases"], ids=lambda c: f"{c['board']}:{c['moves'][:12]}"
)
def test_replay_matches_the_fixture(case):
    assert S.replay(_board(case["board"]), case["moves"]) == case["expect"]


@pytest.mark.parametrize(
    "case", CASES["cases"], ids=lambda c: f"{c['board']}:{c['moves'][:12]}"
)
def test_each_prefix_is_a_step_by_step_apply(case):
    if not case["expect"]["legal"] or len(case["moves"]) > 40:
        return
    board = _board(case["board"])
    state = S.start_state(board)
    for i, letter in enumerate(case["moves"]):
        state = S.apply_move(board, state, letter)
        assert state is not None
        assert S.replay(board, case["moves"][: i + 1])["final"] == state.to_dict()


@pytest.mark.parametrize("name", list(CASES["bad_boards"]))
def test_bad_boards_are_refused(name):
    with pytest.raises(ValueError):
        S.Board.from_dict(CASES["bad_boards"][name])


def test_a_push_never_changes_the_crate_count():
    for level in LEVELS:
        board = S.sokoban_board("pet", "2026-11-09", "woodland", level)
        state = S.start_state(board)
        rng = random.Random(1)
        n = len(state.crates)
        for _ in range(200):
            moves = S.legal_moves(board, state)
            if not moves:
                break
            state = S.apply_move(board, state, rng.choice(moves))
            assert len(state.crates) == n
            assert state.pet not in state.crates


# --- The solver ---------------------------------------------------------------------


def test_the_solver_finds_the_fixture_solves():
    s = S.solve(_board("push"))
    assert s is not None and s.moves == "rr" and s.pushes == 2
    assert S.solve(_board("presolved")).moves == ""


def test_an_unsolvable_board_returns_none():
    # the crate is in a corner, not on the spot
    board = S.Board(3, 2, ("Pn.", "..b"))
    assert S.solve(board) is None


def test_a_solution_replays_as_solved():
    for level in LEVELS:
        board = S.sokoban_board("pet", "2026-11-09", None, level)
        s = S.solve(board)
        out = S.replay(board, s.moves)
        assert out["legal"] and out["solved"] and out["neat"]


# --- The generator ------------------------------------------------------------------


def _days(n: int):
    d = date(2026, 11, 9)
    return [(d + timedelta(days=i)).isoformat() for i in range(n)]


@pytest.mark.parametrize("level", LEVELS)
def test_the_generator_accepts_and_the_board_passes_its_gate(level):
    crates_n, w, h = S.params_for(level)
    lo, hi, pushes, _ = S.GATES[level]
    fallbacks = 0
    tries = []
    for day in _days(N):
        board = S.sokoban_board("pet", day, "woodland", level)
        fallbacks += board.fallback
        tries.append(board.tries)
        assert (board.w, board.h) == (w, h) or board.fallback
        s = S.solve(board)
        assert s is not None, "solvable"
        if not board.fallback:
            assert lo <= len(s.moves) <= hi and s.pushes >= pushes
            assert board.cells.count("b") + board.cells.count("B") == crates_n
            assert board.par == len(s.moves) + S.PAR_SLACK
    assert fallbacks == 0, f"{level}: the hand-made board stood in"
    if FULL:
        print(f"\n{level}: tries mean {sum(tries) / len(tries):.1f} max {max(tries)}")


def test_a_board_is_a_function_of_pet_day_world_level():
    a = S.sokoban_board("pet", "2026-11-09", "woodland", "normal")
    b = S.sokoban_board("pet", "2026-11-09", "woodland", "normal")
    assert a.grid == b.grid and a.id == b.id and a.par == b.par
    others = {
        S.sokoban_board("pet2", "2026-11-09", "woodland", "normal").id,
        S.sokoban_board("pet", "2026-11-10", "woodland", "normal").id,
        S.sokoban_board("pet", "2026-11-09", "hearth", "normal").id,
    }
    assert a.id not in others and len(others) == 3


def test_an_unknown_level_has_no_board():
    with pytest.raises(ValueError):
        S.sokoban_board("pet", "2026-11-09", None, "egg")


@pytest.mark.parametrize("level", LEVELS)
def test_the_fallback_board_is_valid_and_solvable(level):
    grid = S.FALLBACK[level]
    board = S.Board(len(grid[0]), len(grid), grid)
    assert S.solve(board) is not None


def test_the_board_reply_has_no_pet_id():
    board = S.sokoban_board("secret-entry-id", "2026-11-09", None, "easy")
    assert "secret-entry-id" not in json.dumps(board.to_dict())


# --- The bots -----------------------------------------------------------------------


def test_the_bots_win_rarely_on_hard_boards_and_never_break_the_rules():
    wins_casual = wins_greedy = total = 0
    for level in ("normal", "hard"):
        for day in _days(max(N, 10)):
            board = S.sokoban_board("pet", day, None, level)
            for bot in (lambda b: S.casual_bot(b, random.Random(7)), S.greedy_bot):
                moves, won = bot(board)
                out = S.replay(board, moves)
                assert out["legal"] or moves == ""
                assert out["solved"] == won
            wins_casual += S.casual_bot(board, random.Random(7))[1]
            wins_greedy += S.greedy_bot(board)[1]
            total += 1
    if FULL:
        print(f"\ncasual wins {wins_casual}/{total}, greedy wins {wins_greedy}/{total}")
    assert wins_casual < total * 0.5, "a random walker should not win most hard boards"
    assert wins_greedy < total, "the greedy bot does not win every hard board"
