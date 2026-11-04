"""Hop of the Day's engine, generator, solver and bots (hop.py; plan
docs/plan-2026-11-02-hop-of-the-day.md, ship 1).

The generator runs on 5 seeded boards per (world, family, stage) here, over the
(world, family) pairs the roster has (ship 4); HOP_FULL=1 runs 1,000 per cell
and prints the table the ship's report quotes (pytest -s). The
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
WORLDS = json.loads((species.FRONTEND_DIR / "worlds.json").read_text(encoding="utf-8"))
# The (world, family) pairs the roster has (plan ship 4: 21 of the 36), from the
# roster and FAMILY_OF rather than a hard-coded list.
PAIRS = sorted(
    {
        (world, H.FAMILY_OF[s])
        for world, data in WORLDS.items()
        for s in data.get("roster", [])
        if s in H.FAMILY_OF
    }
)
TWIST_GLYPH = {"stumps": "1", "rug": "="}


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


def test_fixture_boards_keep_the_touching_rule():
    """A fixture board with two touching never-sinking cells would loop the
    plain walk in test_solve_counts_every_list."""
    for name in CASES["boards"]:
        assert not H.touching_never_sinking(board(name)), name


def test_fixtures_cover_the_twists():
    """Ship 4a: each twist's boards have a legal and an illegal case, a win, and
    a case whose landing is not the named cell."""
    for twist in ("stumps", "rug"):
        names = [n for n in CASES["boards"] if H.twist_of(board(n)) == twist]
        mine = [c for c in CASES["cases"] if c["board"] in names]
        assert any(c["expect"]["won"] for c in mine), twist
        assert any(c["expect"]["bad_index"] is not None for c in mine), twist
        moved = [
            c
            for c in mine
            if c["expect"]["legal"]
            and c["expect"]["final"]["pos"] != H.decode(c["moves"])[-1]
        ]
        assert moved, twist


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


@pytest.mark.parametrize("case", CASES["bad_boards"], ids=lambda c: c["why"])
def test_bad_boards_are_refused(case):
    """The reply shapes both engines refuse (the JS twin's `valid`)."""
    with pytest.raises(ValueError):
        H.Board.from_dict(case["board"])


@pytest.mark.parametrize("specials", [True, 1.5, "1", None, 4, -1])
def test_board_rejects_specials_out_of_range(specials):
    with pytest.raises(ValueError):
        H.Board(4, 3, ("f.N.", "..#.", "P.o."), "hop", specials)


def test_a_view_round_trips_to_a_state():
    """replay()'s `final` rebuilds the State apply and the solver take (it lists
    the sunk cells; the State holds a bit mask). The audit's repro: on the baby
    board, e then f leaves e (cell 4) sunk, so the pet on f may go to b or j."""
    b = board("baby")
    out = H.replay(b, "ef")
    assert out["legal"] is True and out["final"]["sunk"] == [4, 8]
    got = H.State.from_dict(out["final"])
    s = H.apply_move(b, H.apply_move(b, H.start_state(b), 4), 5)
    assert got == s and got.to_dict() == out["final"]
    assert H.legal_targets(b, got) == [1, 9]
    assert H.legal_targets(b, got) == H.legal_targets(b, s)
    assert H.solve(b, got).win_count == H.solve(b, s).win_count
    # Every prefix of every fixture case rebuilds to its own state.
    for case in CASES["cases"]:
        cb = board(case["board"])
        state = H.start_state(cb)
        for cell in H.decode(case["moves"]) or []:
            nxt = H.apply_move(cb, state, cell)
            if nxt is None:
                break
            state = nxt
        assert H.State.from_dict(state.to_dict()) == state


@pytest.mark.parametrize(
    "bad",
    [
        {"pos": 24, "sunk": [], "uses": 0, "done": False},
        {"pos": -1, "sunk": [], "uses": 0, "done": False},
        {"pos": 0, "sunk": [24], "uses": 0, "done": False},
        {"pos": 0, "sunk": ["a"], "uses": 0, "done": False},
        {"pos": 0, "sunk": [], "uses": -1, "done": False},
        {"pos": 0, "sunk": [], "uses": 1.5, "done": False},
    ],
)
def test_state_from_dict_refuses_junk(bad):
    with pytest.raises(ValueError):
        H.State.from_dict(bad)


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
    assert H.touching_never_sinking(b)
    with pytest.raises(H.CycleError):
        H.solve(b)
    assert not H.check(b).ok


@pytest.mark.parametrize(
    ("grid", "why"),
    [
        (("N.f.", ".11.", "P..."), "a stump beside its own twin"),
        (("N.f1", "..o.", "P.1."), "a stump beside a stone"),
        (("N.f1", "...1", "P..."), "a stump beside its twin, a row down"),
        (("N.f.", ".=o.", "P..."), "a rug beside a stone"),
        (("N.f.", ".==.", "P..."), "two rugs touching"),
    ],
)
def test_check_refuses_touching_never_sinking_cells(grid, why):
    """Decided 34: stones, stumps and rugs never touch (a stump and its twin
    neither): check() refuses such a board before it solves."""
    b = H.Board(4, 3, grid, "hop", 1)
    assert H.touching_never_sinking(b), why
    assert H.check(b).why == "touching", why


def test_check_turns_a_loop_into_a_refusal(monkeypatch):
    """A loop the touching rule missed costs the candidate (Verdict "loop"),
    never the day's board call."""
    b = H.Board(3, 2, ("PfN", "oo."), "hop", 0)
    monkeypatch.setattr(H, "touching_never_sinking", lambda board: False)
    verdict = H.check(b)
    assert (verdict.ok, verdict.why) == (False, "loop")


def test_twist_of():
    assert H.twist_of(board("stumps_hop")) == "stumps"
    assert H.twist_of(board("rug_hop")) == "rug"
    assert H.twist_of(SAMPLE) is None
    assert H.twist_of(board("baby")) is None


def _states_from(b, s):
    """Every state a line reaches from `s`, `s` included."""
    seen, todo = {s}, [s]
    while todo:
        x = todo.pop()
        for t in H.legal_targets(b, x):
            nxt = H.apply_move(b, x, t)
            if nxt not in seen:
                seen.add(nxt)
                todo.append(nxt)
    return seen


def test_reach_holds_every_cell_a_line_reaches():
    """The solver's prune: from every state a fixture board reaches, every cell
    the pet can stand on later is in reach() (a stump's twin included)."""
    for name in CASES["boards"]:
        b = board(name)
        rules = H._rules(b)
        for s in _states_from(b, H.start_state(b)):
            later = {x.pos for x in _states_from(b, s) if x != s}
            mask = rules.reach(s.pos, s.sunk, s.uses)
            assert all(mask >> p & 1 for p in later), (name, s)


@pytest.mark.parametrize("world", sorted(H.WORLD_TWIST))
@pytest.mark.parametrize("family", ["hop", "dig", "squeeze"])
def test_solve_counts_every_list_on_twist_boards(world, family):
    """The memoised count, landings and prune included, equals a plain walk of
    every list on small seeded twist boards (a child's Wednesday 4 x 4)."""

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

    for k in range(3):
        b = H.hop_board(f"walk{k}", "2026-11-04", world, family, 1, 4, 4)
        assert H.twist_of(b) == H.WORLD_TWIST[world]
        got = H.solve(b)
        assert (got.win_count, got.tidy_count) == walk(b, H.start_state(b)), b.grid


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


@pytest.mark.parametrize("stage", ["egg", "", "elder", None])
def test_params_for_refuses_a_stage_with_no_board(stage):
    """An egg has no board (2a refuses it first); a clear error, not a KeyError."""
    with pytest.raises(ValueError, match="no board for stage"):
        H.params_for(stage, "2026-11-02")


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
    # A twist world's golden from child up holds its glyph; a baby's and the
    # other worlds' hold none (ship 4a's twists).
    for inputs, row in zip(GOLDEN_INPUTS, rows, strict=True):
        twist = H.WORLD_TWIST.get(inputs[2]) if inputs[4] != "baby" else None
        cells = "".join(row["grid"])
        held = {k for k, glyphs in H.TWIST_GLYPHS.items() if set(glyphs) & set(cells)}
        assert held == ({twist} if twist else set()), inputs
        assert twist is None or TWIST_GLYPH[twist] in cells, inputs


@pytest.mark.parametrize(
    "inputs",
    [GOLDEN_INPUTS[2]]  # tidepool: no twist
    + [
        next(i for i in GOLDEN_INPUTS if i[2] == world and i[4] != "baby")
        for world in sorted(H.WORLD_TWIST)
    ],
    ids=lambda i: f"{i[2]}-{i[4]}",
)
def test_same_inputs_same_board_in_a_fresh_process(inputs):
    """Per twist world (ship 4) and one plain world."""
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
    """The id hashes (GEN_VERSION, pet, day, world, board, n): the same grid for
    two pets, days or worlds (a shared fallback) still has two ids."""
    args = ("pet-a", "2026-11-02", "woodland", 4, 3, ("f.N.", "..#.", "P.o."), "hop", 0)
    one = H.board_id(*args)
    assert len(one) == 10 and int(one, 16) >= 0
    assert H.board_id(*args) == one
    assert H.board_id("pet-b", *args[1:]) != one
    assert H.board_id(args[0], "2026-11-03", *args[2:]) != one
    assert H.board_id(*args[:2], "hearth", *args[3:]) != one
    assert H.board_id(*args[:2], None, *args[3:]) != one
    assert H.board_id(*args, n=1) != one
    monkeypatch.setattr(H, "GEN_VERSION", H.GEN_VERSION + 1)
    assert H.board_id(*args) != one


def test_fallback_id_differs_by_pet_and_day():
    one = H.hop_board("pet-a", "2026-11-02", "woodland", "hop", 0, 4, 3, candidates=0)
    two = H.hop_board("pet-b", "2026-11-02", "woodland", "hop", 0, 4, 3, candidates=0)
    three = H.hop_board("pet-a", "2026-11-03", "woodland", "hop", 0, 4, 3, candidates=0)
    four = H.hop_board("pet-a", "2026-11-02", "hearth", "hop", 0, 4, 3, candidates=0)
    assert one.fallback and one.grid == two.grid == three.grid == four.grid
    assert len({one.id, two.id, three.id, four.id}) == 4


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
def cell_boards(world: str, family: str, stage: str) -> tuple[H.Board, ...]:
    """The seeded boards of a (world, family, stage) cell: PER_CELL pets, days
    spread over four weeks (so a Wednesday's narrower size is in)."""
    return tuple(
        make(
            f"pet{k}",
            (MONDAY + timedelta(days=k % 28)).isoformat(),
            world,
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


def test_pairs_are_the_rosters():
    """Ship 4: 21 (world, family) pairs, every family in some world."""
    assert len(PAIRS) == 21
    assert {f for _, f in PAIRS} == set(H.FAMILIES)
    assert set(H.WORLD_TWIST) <= {w for w, _ in PAIRS}


@pytest.mark.parametrize("stage", STAGES)
@pytest.mark.parametrize(("world", "family"), PAIRS)
def test_generated_boards(world, family, stage):
    """Checks 1-6 hold on every board the generator accepts, and the fallback
    stands in on at most 10% of a (world, family, stage) cell (none at
    PER_CELL 5). No board raises out of hop_board (the loop net: check()
    turns a CycleError into a refusal). With HOP_FULL=1 the bots' brackets
    are asserted per cell too, and the cell's line printed for the report."""
    boards = cell_boards(world, family, stage)
    fallbacks = 0
    states = 0
    for b in boards:
        assert not H.touching_never_sinking(b)
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
            f"\nHOP {world:9} {family:8} {stage:6} boards {PER_CELL} sizes {dict(sizes)}"
            f" fallback {fallbacks / PER_CELL:.3f}"
            f" tries/board {sum(b.tries for b in boards) / PER_CELL:.2f}"
            f" max states {states}"
            f" noisy won {count['noisy_won'] / n:.3f} tidy {count['noisy_tidy'] / n:.3f}"
            f" careful tidy {count['careful_tidy'] / max(count['careful'], 1):.3f}"
        )
        assert count["noisy_won"] / n >= 0.90
        assert count["noisy_tidy"] / n <= 0.20


@pytest.mark.parametrize("stage", ["child", "teen", "adult"])
@pytest.mark.parametrize("world", sorted(H.WORLD_TWIST))
def test_twist_worlds_boards_hold_their_glyph(world, stage):
    """Every seeded board of a twist world from child up holds its twist's
    glyph, and none is a fallback (a fallback has no twist, Decided 30)."""
    for family in sorted({f for w, f in PAIRS if w == world}):
        for b in cell_boards(world, family, stage):
            assert not b.fallback, (world, family, stage)
            assert H.twist_of(b) == H.WORLD_TWIST[world], b.grid
            assert TWIST_GLYPH[H.WORLD_TWIST[world]] in "".join(b.grid)


@pytest.mark.parametrize(("world", "family"), PAIRS)
def test_babies_get_no_twist(world, family):
    """Decided 26: a baby's board is steps, pads and stones in every world."""
    for b in cell_boards(world, family, "baby"):
        assert H.twist_of(b) is None


def test_bot_brackets():
    """Win easy, tidy hard, over every cell's boards: the noisy casual bot (random
    ties, a shuffled find order: a player the filter never saw) wins at least 90%
    and is tidy on at most 20%, over all cells and over each twist world's. Per
    (world, family, stage) cell it is HOP_FULL's (15 noisy games a cell here is
    too few to bracket one cell). The careful bot's tidy rate is reported only
    (a node budget sets it, not the boards)."""
    if FULL:
        pytest.skip("HOP_FULL asserts the brackets per cell")
    count = Counter()
    for world, family in PAIRS:
        mine = Counter()
        for stage in STAGES:
            mine += bot_rates(cell_boards(world, family, stage))
        count += mine
        if world in H.WORLD_TWIST:
            assert mine["noisy_won"] / mine["noisy"] >= 0.90, (world, family)
            assert mine["noisy_tidy"] / mine["noisy"] <= 0.20, (world, family)
    assert count["noisy_won"] / count["noisy"] >= 0.90
    assert count["noisy_tidy"] / count["noisy"] <= 0.20
    print(f"\nHOP careful tidy {count['careful_tidy'] / count['careful']:.3f}")


def test_casual_bot_cannot_hang_on_a_failed_plan(monkeypatch):
    """A planned step the rules refuse ends the bot's play (a failed plan):
    re-planning would draw the same illegal walk forever."""
    b = board("rug_hop")
    monkeypatch.setattr(H._Rules, "step", lambda self, s, t: None)
    moves, won, tidy = H.casual_bot(b)
    assert (moves, won, tidy) == ([], False, False)
    moves, won, _ = H.casual_bot(b, random.Random(1))
    assert (moves, won) == ([], False)


def test_casual_bot_plans_by_the_landing():
    """The bot's walk follows a stump to its twin and a rug's slide, and wins."""
    for name in ("stumps_hop", "stumps_glide", "rug_hop", "rug_climb", "rug_swim"):
        b = board(name)
        moves, won, _ = H.casual_bot(b)
        assert won, name
        assert H.replay(b, H.encode(moves))["won"], name


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
