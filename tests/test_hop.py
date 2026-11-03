"""Hop of the Day's engine, generator, solver and bots (hop.py; plan
docs/plan-2026-11-02-hop-of-the-day.md, ship 1).

The generator runs on 5 seeded boards per (family, stage) here; HOP_FULL=1 runs
1,000 per cell and prints the table the ship's report quotes (pytest -s). The
tests count solver states, never wall-clock time. HOP_GOLDEN_WRITE=1 rewrites
tests/fixtures/hop_golden.json after an intended generator change (with a
GEN_VERSION bump).
"""

from __future__ import annotations

from collections import Counter
from datetime import date, timedelta
import functools
import json
import os
from pathlib import Path
import random
import subprocess
import sys

import pytest

from custom_components.virtual_pet import hop as H, rates as R, species

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "tests" / "fixtures"
CASES = json.loads((FIXTURES / "hop_cases.json").read_text(encoding="utf-8"))
GOLDEN = FIXTURES / "hop_golden.json"
FULL = os.environ.get("HOP_FULL") == "1"
PER_CELL = 1000 if FULL else 5
STAGES = ("baby", "child", "teen", "adult")
MONDAY = date(2026, 11, 2)

SAMPLE = H.Board(5, 4, ("N.~f.", ".o..~", "f.~o.", "..P.f"), "hop", 1)


def board(name: str) -> H.Board:
    return H.Board.from_dict(CASES["boards"][name])


# --- The rules: the shared fixtures ------------------------------------------------


@pytest.mark.parametrize(
    "case", CASES["cases"], ids=lambda c: f"{c['board']}:{c['moves'][:24]}"
)
def test_fixture_case(case):
    b = board(case["board"])
    assert H.replay(b, case["moves"]) == case["expect"], case["why"]


@pytest.mark.parametrize(
    "case", CASES["cases"], ids=lambda c: f"{c['board']}:{c['moves'][:24]}"
)
def test_prefix_is_stepwise_apply(case):
    """A list and each prefix of it (undo) give the state a step-by-step apply does."""
    b = board(case["board"])
    cells = H.decode(case["moves"])
    if cells is None:
        return
    state = H.start_state(b)
    for i, cell in enumerate(cells):
        nxt = H.apply_move(b, state, cell)
        got = H.replay(b, case["moves"][: i + 1])
        if nxt is None:
            assert got["bad_index"] == i and got["final"] == state.to_dict()
            break
        assert cell in H.legal_targets(b, state)
        assert got["legal"] and got["final"] == nxt.to_dict()
        state = nxt


def test_fixtures_cover_the_rules():
    """Plan ship 1: a legal and an illegal case per family, the sample's lines."""
    cases = CASES["cases"]
    for family in H.FAMILIES:
        mine = [c for c in cases if CASES["boards"][c["board"]]["family"] == family]
        assert any(c["expect"]["legal"] for c in mine), family
        assert any(c["expect"]["bad_index"] is not None for c in mine), family
    assert any(c["expect"]["too_long"] for c in cases)
    assert any(c["moves"] == "" for c in cases)
    assert sum(c["expect"]["tidy"] for c in cases) >= 3


def test_legal_targets_are_the_moves():
    """legal_targets names exactly the cells apply_move takes, from every state
    a replay reaches."""
    for name in CASES["boards"]:
        b = board(name)
        todo = [H.start_state(b)]
        seen = set()
        while todo:
            s = todo.pop()
            if s in seen:
                continue
            seen.add(s)
            takes = [t for t in range(b.w * b.h) if H.apply_move(b, s, t)]
            assert H.legal_targets(b, s) == takes
            todo.extend(H.apply_move(b, s, t) for t in takes)


def test_decode_and_encode():
    assert H.decode("abx") == [0, 1, 23]
    assert H.decode("aY") == [0, -1]
    assert H.decode("a" * R.HOP_MAX_MOVES) == [0] * R.HOP_MAX_MOVES
    assert H.decode("a" * (R.HOP_MAX_MOVES + 1)) is None
    assert H.encode([0, 1, 23]) == "abx"


def test_board_rejects_a_bad_grid():
    for grid, w, h in (
        (("P.N",), 3, 2),
        (("P.Nx",), 4, 1),
        (("P..",), 3, 1),
        (("P......N",), 8, 1),
    ):
        with pytest.raises(ValueError):
            H.Board(w, h, grid, "hop", 0)


# --- The solver ---------------------------------------------------------------------


def test_sample_counts():
    """Plan 2d: 20 winning lists at 1 hop, 3 tidy; shortest 12, tidy 16; none
    with no hop."""
    got = H.solve(SAMPLE)
    assert (got.win_count, got.tidy_count) == (20, 3)
    assert (got.min_win, got.min_tidy) == (12, 16)
    assert H.replay(SAMPLE, H.encode(got.win))["won"]
    tidy = H.replay(SAMPLE, H.encode(got.tidy))
    assert tidy["won"] and tidy["tidy"]
    bare = H.solve(SAMPLE, H.State(SAMPLE.start, 0, 0))
    assert bare.win_count == 0


def test_solve_counts_every_list():
    """The memoised count equals a plain walk of every list (small boards)."""

    def walk(b, s):
        win = tidy = 0
        for t in H.legal_targets(b, s):
            nxt = H.apply_move(b, s, t)
            if nxt.done:
                win += 1
                tidy += H.is_tidy(b, nxt)
            else:
                w, td = walk(b, nxt)
                win, tidy = win + w, tidy + td
        return win, tidy

    for name in CASES["boards"]:
        b = board(name)
        got = H.solve(b)
        assert (got.win_count, got.tidy_count) == walk(b, H.start_state(b)), name


def test_solve_from_any_state():
    """Ship 5's hint solves from where the pet is: a list from a mid-board
    state, put after the moves that led there, wins."""
    for prefix in ("st", "sto", "stoe"):
        s = H.start_state(SAMPLE)
        for cell in H.decode(prefix):
            s = H.apply_move(SAMPLE, s, cell)
        got = H.solve(SAMPLE, s)
        assert got.win_count >= 1
        assert H.replay(SAMPLE, prefix + H.encode(got.win))["won"]
    # Dead ends: two steps left strand the find at t; the early hop strands it too.
    for prefix in ("qp", "hgf"):
        s = H.start_state(SAMPLE)
        for cell in H.decode(prefix):
            s = H.apply_move(SAMPLE, s, cell)
        assert H.solve(SAMPLE, s).win_count == 0


def test_touching_stones_raise_not_loop():
    """Two touching stones make a free loop (endless lists): the solver raises,
    and the generator never draws one."""
    b = H.Board(3, 2, ("PfN", "oo."), "hop", 0)
    assert H.touching_stones(b)
    with pytest.raises(H.CycleError):
        H.solve(b)
    assert not H.check(b).ok


def test_state_cap():
    with pytest.raises(H.TooBig):
        H.solve(SAMPLE, cap=50)


# --- Families, stages, sizes -------------------------------------------------------


def test_family_of_covers_every_species():
    catalog = species.load_catalog()
    worlds = json.loads(
        (species.FRONTEND_DIR / "worlds.json").read_text(encoding="utf-8")
    )
    rosters = {s for w in worlds.values() for s in w.get("roster", [])}
    assert set(catalog.species) <= set(H.FAMILY_OF), "a ready species has no family"
    assert set(H.FAMILY_OF) <= rosters, "a family line names no species in worlds.json"
    assert set(H.FAMILY_OF.values()) == set(H.FAMILIES)
    for family in H.FAMILIES:
        assert any(H.FAMILY_OF[s] == family for s in catalog.species), family
    assert H.family_of("nosuchspecies") == H.DEFAULT_FAMILY
    assert H.family_of(None) == H.DEFAULT_FAMILY


def test_params_for():
    assert H.params_for("baby", "2026-11-02") == (0, 4, 3)
    assert H.params_for("child", "2026-11-02") == (1, 5, 4)
    assert H.params_for("teen", "2026-11-03") == (2, 6, 4)
    assert H.params_for("adult", "2026-11-05") == (3, 6, 4)
    # Wednesday: one column narrower, never below 4 wide.
    assert H.params_for("baby", "2026-11-04") == (0, 4, 3)
    assert H.params_for("child", "2026-11-04") == (1, 4, 4)
    assert H.params_for("teen", "2026-11-04") == (2, 5, 4)
    assert H.params_for("adult", "2026-11-04") == (3, 5, 4)


# --- Determinism and the id --------------------------------------------------------

GOLDEN_INPUTS = [
    ("pet-a", "2026-11-02", "woodland", "hop", "child", 0),
    ("pet-a", "2026-11-03", "woodland", "glide", "teen", 0),
    ("pet-b", "2026-11-02", "tidepool", "swim", "adult", 0),
    ("pet-b", "2026-11-04", "hearth", "dig", "child", 0),
    ("pet-c", "2026-11-04", "terrarium", "climb", "teen", 0),
    ("pet-c", "2026-11-04", "pond", "squeeze", "adult", 0),
    ("pet-d", "2026-11-05", "hearth", "hop", "baby", 0),
    ("pet-d", "2026-11-04", "pond", "swim", "baby", 0),
    ("pet-e", "2026-11-06", "nightsky", "hop", "adult", 0),
    ("pet-e", "2026-11-07", "nightsky", "glide", "child", 0),
    ("pet-f", "2026-11-08", "woodland", "squeeze", "teen", 0),
    ("pet-f", "2026-11-08", "hearth", "dig", "adult", 1),
]


def make(pet, day, world, family, stage, n=0):
    specials, w, h = H.params_for(stage, day)
    return H.hop_board(pet, day, world, family, specials, w, h, n)


def test_golden_boards():
    """12 pinned boards: an accidental generator change shows here; an intended
    one bumps GEN_VERSION and rewrites the file (HOP_GOLDEN_WRITE=1)."""
    rows = []
    for inputs in GOLDEN_INPUTS:
        b = make(*inputs)
        rows.append(
            {
                "in": list(inputs),
                "grid": list(b.grid),
                "id": b.id,
                "fallback": b.fallback,
            }
        )
    if os.environ.get("HOP_GOLDEN_WRITE") == "1":
        body = ",\n".join(f"  {json.dumps(r)}" for r in rows)
        GOLDEN.write_text(
            f'{{"gen_version": {H.GEN_VERSION}, "boards": [\n{body}\n]}}\n',
            encoding="utf-8",
        )
    pinned = json.loads(GOLDEN.read_text(encoding="utf-8"))
    assert pinned["gen_version"] == H.GEN_VERSION
    assert pinned["boards"] == rows


def test_same_inputs_same_board_in_a_fresh_process():
    inputs = GOLDEN_INPUTS[2]
    b = make(*inputs)
    assert make(*inputs) == b
    code = (
        "from custom_components.virtual_pet import hop as H\n"
        f"s, w, h = H.params_for({inputs[4]!r}, {inputs[1]!r})\n"
        f"b = H.hop_board({inputs[0]!r}, {inputs[1]!r}, {inputs[2]!r}, "
        f"{inputs[3]!r}, s, w, h)\n"
        "print(b.id, '/'.join(b.grid))"
    )
    out = subprocess.run(
        [sys.executable, "-c", code],
        cwd=ROOT,
        env={**os.environ, "PYTHONHASHSEED": "12345"},
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()
    assert out == [b.id, "/".join(b.grid)]


def test_one_input_changed_changes_the_board():
    base = ("pet-a", "2026-11-02", "woodland", "hop", "teen", 0)
    b = make(*base)
    for i, other in (
        (0, "pet-z"),
        (1, "2026-11-03"),
        (2, "hearth"),
        (3, "glide"),
        (4, "adult"),
        (5, 1),
    ):
        changed = list(base)
        changed[i] = other
        c = make(*changed)
        assert c.id != b.id, i
        assert (c.grid, c.family, c.specials) != (b.grid, b.family, b.specials), i


def test_board_id_binds_pet_day_and_version(monkeypatch):
    """The id hashes (GEN_VERSION, pet, day, board, n): the same grid for two
    pets or two days (a shared fallback) still has two ids."""
    args = ("pet-a", "2026-11-02", 4, 3, ("f.N.", "..#.", "P.o."), "hop", 0)
    one = H.board_id(*args)
    assert len(one) == 10 and int(one, 16) >= 0
    assert H.board_id(*args) == one
    assert H.board_id("pet-b", *args[1:]) != one
    assert H.board_id(args[0], "2026-11-03", *args[2:]) != one
    assert H.board_id(*args, n=1) != one
    monkeypatch.setattr(H, "GEN_VERSION", H.GEN_VERSION + 1)
    assert H.board_id(*args) != one


def test_fallback_id_differs_by_pet_and_day():
    one = H.hop_board("pet-a", "2026-11-02", "woodland", "hop", 0, 4, 3, candidates=0)
    two = H.hop_board("pet-b", "2026-11-02", "woodland", "hop", 0, 4, 3, candidates=0)
    three = H.hop_board("pet-a", "2026-11-03", "woodland", "hop", 0, 4, 3, candidates=0)
    assert one.fallback and one.grid == two.grid == three.grid
    assert len({one.id, two.id, three.id}) == 3


# --- The generator and the bots ----------------------------------------------------


def size_keys():
    keys = []
    for stage in STAGES:
        specials, w, h = H.STAGES[stage]
        keys.append((specials, w, h))
        narrow = max(H.MIN_WIDTH, w - 1)
        if narrow != w:
            keys.append((specials, narrow, h))
    return keys


@pytest.mark.parametrize(
    ("key", "specials", "w", "h"),
    [
        ("base" if s == 0 else f, s, w, h)
        for s, w, h in size_keys()
        for f in (H.FAMILIES if s else ("hop",))
    ],
)
def test_fallback_boards_pass(key, specials, w, h):
    family = "hop" if key == "base" else key
    b = H.Board(w, h, H.fallback_grid(family, specials, w, h), family, specials)
    verdict = H.check(b, needs_special=specials == 1)
    assert verdict.ok, verdict.why


@functools.cache
def cell_boards(family: str, stage: str) -> tuple[H.Board, ...]:
    """The seeded boards of a (family, stage) cell: PER_CELL pets, days spread
    over four weeks (so a Wednesday's narrower size is in)."""
    return tuple(
        make(
            f"pet{k}",
            (MONDAY + timedelta(days=k % 28)).isoformat(),
            "woodland",
            family,
            stage,
        )
        for k in range(PER_CELL)
    )


def bot_rates(boards) -> Counter:
    count = Counter()
    for b in boards:
        if b.fallback:
            continue
        for j in range(3):
            _, won, tidy = H.casual_bot(b, random.Random(f"noisy|{b.id}|{j}"))
            count["noisy"] += 1
            count["noisy_won"] += won
            count["noisy_tidy"] += tidy
        _, won, tidy = H.careful_bot(b)
        count["careful"] += 1
        count["careful_tidy"] += tidy
    return count


@pytest.mark.parametrize("stage", STAGES)
@pytest.mark.parametrize("family", H.FAMILIES)
def test_generated_boards(family, stage):
    """Checks 1-6 hold on every board the generator accepts, and the fallback
    stands in on at most 10% of a cell. With HOP_FULL=1 the bots' brackets
    are asserted per cell too, and the cell's line printed for the report."""
    boards = cell_boards(family, stage)
    fallbacks = 0
    states = 0
    for b in boards:
        assert not H.touching_stones(b)
        if b.fallback:
            fallbacks += 1
            continue
        verdict = H.check(b)
        assert verdict.ok, (b.grid, verdict.why)
        assert verdict.solve.states < R.HOP_STATE_CAP
        states = max(states, verdict.states)
    assert fallbacks <= 0.10 * PER_CELL
    if FULL:
        count = bot_rates(boards)
        n = count["noisy"] or 1
        sizes = Counter(f"{b.w}x{b.h}" for b in boards)
        print(
            f"\nHOP {family:8} {stage:6} boards {PER_CELL} sizes {dict(sizes)}"
            f" fallback {fallbacks / PER_CELL:.3f}"
            f" tries/board {sum(b.tries for b in boards) / PER_CELL:.2f}"
            f" max states {states}"
            f" noisy won {count['noisy_won'] / n:.3f} tidy {count['noisy_tidy'] / n:.3f}"
            f" careful tidy {count['careful_tidy'] / max(count['careful'], 1):.3f}"
        )
        assert count["noisy_won"] / n >= 0.90
        assert count["noisy_tidy"] / n <= 0.20


def test_bot_brackets():
    """Win easy, tidy hard, over every cell's boards: the noisy casual bot (random
    ties, a shuffled find order: a player the filter never saw) wins at least 90%
    and is tidy on at most 20%. The careful bot's tidy rate is reported only (a
    node budget sets it, not the boards)."""
    if FULL:
        pytest.skip("HOP_FULL asserts the brackets per cell")
    count = Counter()
    for family in H.FAMILIES:
        for stage in STAGES:
            count += bot_rates(cell_boards(family, stage))
    assert count["noisy_won"] / count["noisy"] >= 0.90
    assert count["noisy_tidy"] / count["noisy"] <= 0.20
    print(f"\nHOP careful tidy {count['careful_tidy'] / count['careful']:.3f}")


def test_hop_solve_script():
    reply = {"board": {**SAMPLE.to_dict(), "id": "x"}}
    out = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "hop_solve.py"), "--json"],
        input=json.dumps(reply),
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    got = json.loads(out)
    assert (got["win_count"], got["tidy_count"]) == (20, 3)
    assert H.replay(SAMPLE, got["win"])["won"]
    assert H.replay(SAMPLE, got["tidy"])["tidy"]
