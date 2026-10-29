"""Balance sims: two weeks of play, hatch to adult, against the pure model.

Built from the 2026-10-28 gameplay balance audit's sims (sim.py to sim4.py),
which ran on a copy of model.py; this runs on the real package, so each change
to the model shows here at once. See docs/plan-2026-10-28-experience.md, Wave 0.

Strategies decide from what a person can see: the meters and the mood
sensor's reason_key, never the call's hidden reason. So a whine that is truly
disguised can fool them, as it would a person.

Run from the repo root with the dev venv (the package imports Home Assistant):
    .venv/bin/python scripts/balance_sim.py            # the table
    .venv/bin/python scripts/balance_sim.py --check    # plus the target bands
    .venv/bin/python scripts/balance_sim.py --notify   # phone pings, 1-4 pets
--check exits 1 if any band fails. The bands are Wave 0's targets: on the
code before Wave 0 most of them fail, which is the point.

BALANCE_SIM_ROOT=<dir> runs against another copy of the package (a scratch
prototype with custom_components/virtual_pet under <dir>), not this repo's.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable
from datetime import UTC, datetime
import math
import os
from pathlib import Path
import random
import sys

ROOT = os.environ.get("BALANCE_SIM_ROOT") or str(Path(__file__).resolve().parent.parent)
sys.path.insert(0, ROOT)

from custom_components.virtual_pet import model as M  # noqa: E402

T0 = datetime(2026, 1, 5, 9, 0, tzinfo=UTC).timestamp()  # a Monday morning
TICK = 300  # seconds: a careful player looks every five minutes
HOURS = 336 + 1  # to adulthood (rates.STAGE_STARTS)
SETTINGS = M.Settings(tz=UTC, roster=("bird",))

Policy = Callable[[M.PetState, float, random.Random], None]


# --- What a person sees -------------------------------------------------------


def shown_call(s: M.PetState) -> str | None:
    """The call as the sensors show it: the binary sensor says a call is on,
    and the reason_key it would publish (minus "call_") says what for. A
    whine shows whatever key the model gives fakes (today "call_fake")."""
    if s.call is None:
        return None
    return M._reason(s, "calling", False)[1].removeprefix("call_")


def act(s: M.PetState, action: str, t: float, rng: random.Random) -> str:
    return M.apply_action(s, action, t, rng)[0]


def answer(s: M.PetState, t: float, rng: random.Random, suspicious: bool) -> bool:
    """Answer the call on show. suspicious: a happiness call while the hearts
    look fine is taken for a whine and scolded. True if it answered a real need."""
    reason = shown_call(s)
    if reason is None:
        return False
    if reason == "fake" or (reason == "happiness" and suspicious and s.happiness >= 50):
        act(s, "scold", t, rng)
        return False
    if reason == "energy":
        M.set_lights_out(s, True, t, SETTINGS)
        return True
    action = {
        "hunger": "feed",
        "happiness": "play",
        "dirty": "clean",
        "sick": "medicine",
    }[reason]
    return act(s, action, t, rng) == M.OK


def bedtime(s: M.PetState, t: float) -> None:
    if M.minutes_to_bedtime(t, SETTINGS) < 5:
        M.set_lights_out(s, True, t, SETTINGS)


# --- Strategies ---------------------------------------------------------------


def play(s: M.PetState, t: float, rng: random.Random, games: bool) -> bool:
    """Play, or with games on, every other time a whole game of Left or Right
    (the card's Play button opens a game). True if it played."""
    if games:
        play.turn = not play.turn
    if not (games and play.turn):
        return act(s, "play", t, rng) in (M.OK, "spoiled")
    while True:
        info, _ = M.play_game(s, "left", t, rng)
        if info.get("result") != M.OK:
            return False
        if info.get("done"):
            return True


play.turn = False


def careful(s: M.PetState, t: float, rng: random.Random, games: bool = False) -> None:
    """Looks every five minutes: answers calls, feeds and plays ahead, praises
    right after any care it gave, and puts it to bed."""
    if s.asleep:
        return
    cared = answer(s, t, rng, suspicious=True)
    if s.sick:
        cared |= act(s, "medicine", t, rng) == M.OK
    if s.poops:
        cared |= act(s, "clean", t, rng) == M.OK
    if s.hunger < 40:
        cared |= act(s, "feed", t, rng) == M.OK
    if s.happiness < 40 and s.energy > 20:
        cared |= play(s, t, rng, games)
    if cared:
        act(s, "praise", t, rng)
    bedtime(s, t)


def careful_games(s: M.PetState, t: float, rng: random.Random) -> None:
    careful(s, t, rng, games=True)


CASUAL_VISITS = (8, 12, 17, 21)  # local hours a casual player opens the card
BUSY_VISITS = (8, 18)  # twice a day: where re-calls start to matter


def casual(
    s: M.PetState,
    t: float,
    rng: random.Random,
    games: bool = False,
    visits: tuple[int, ...] = CASUAL_VISITS,
) -> None:
    """Opens the card four times a day and sees to whatever is up, a nap
    included if it looks worn out. Calls in between go unanswered."""
    local = datetime.fromtimestamp(t, SETTINGS.tz)
    if local.hour not in visits or local.minute >= TICK // 60 or s.asleep:
        return
    answer(s, t, rng, suspicious=False)
    if s.sick:
        act(s, "medicine", t, rng)
    if s.poops:
        act(s, "clean", t, rng)
    if s.hunger < 60:
        act(s, "feed", t, rng)
    if s.happiness < 60 and s.energy > 20:
        play(s, t, rng, games)
    if local.hour == visits[-1] or s.energy < 30:
        M.set_lights_out(s, True, t, SETTINGS)


def casual_games(s: M.PetState, t: float, rng: random.Random) -> None:
    casual(s, t, rng, games=True)


def twice_a_day(s: M.PetState, t: float, rng: random.Random) -> None:
    casual(s, t, rng, visits=BUSY_VISITS)


def neglect(s: M.PetState, t: float, rng: random.Random) -> None:
    pass


def responder(s: M.PetState, t: float, rng: random.Random) -> None:
    """Answers every call with the textbook answer, and does nothing else."""
    if not s.asleep:
        answer(s, t, rng, suspicious=True)


def responder_praise(s: M.PetState, t: float, rng: random.Random) -> None:
    """Answers every call correctly and praises right after; nothing else.
    (Under a rule that pays praise only after an answered call, this waits
    for calls to farm discipline.)"""
    if not s.asleep and answer(s, t, rng, suspicious=True):
        act(s, "praise", t, rng)


def responder_miss1(s: M.PetState, t: float, rng: random.Random) -> None:
    """A responder who lets the first real call of each day go."""
    day = int((t - T0) // 86400)
    if s.call is not None and shown_call(s) != "fake":
        responder_miss1.missed.setdefault(day, s.call.started)
        if responder_miss1.missed[day] == s.call.started:
            return
    responder(s, t, rng)


responder_miss1.missed = {}


def launder(s: M.PetState, t: float, rng: random.Random) -> None:
    """No care at all: lights out and on again whenever it calls."""
    if s.call is not None and not s.asleep:
        M.set_lights_out(s, True, t, SETTINGS)
        M.set_lights_out(s, False, t, SETTINGS)


def sleeper(s: M.PetState, t: float, rng: random.Random) -> None:
    """No care: back to bed whenever it is awake (calls pause while asleep),
    the moment the nap rule allows."""
    if not s.asleep:
        M.set_lights_out(s, True, t, SETTINGS)


def praise_bot(s: M.PetState, t: float, rng: random.Random) -> None:
    """An automation: feeds, cleans and doses as needed, praises every 30 min."""
    if s.asleep:
        return
    if s.hunger < 40:
        act(s, "feed", t, rng)
    if s.poops:
        act(s, "clean", t, rng)
    if s.sick:
        act(s, "medicine", t, rng)
    if int(t) % 1800 < TICK:
        act(s, "praise", t, rng)


def care_bot(s: M.PetState, t: float, rng: random.Random) -> None:
    """An automation: feeds, cleans and doses as needed and praises right
    after; never plays and never answers a call."""
    if s.asleep:
        return
    cared = False
    if s.hunger < 40:
        cared |= act(s, "feed", t, rng) == M.OK
    if s.poops:
        cared |= act(s, "clean", t, rng) == M.OK
    if s.sick:
        cared |= act(s, "medicine", t, rng) == M.OK
    if cared:
        act(s, "praise", t, rng)


def launder_praise(s: M.PetState, t: float, rng: random.Random) -> None:
    launder(s, t, rng)
    if not s.asleep and int(t) % 1800 < TICK:
        act(s, "praise", t, rng)


STRATEGIES: dict[str, Policy] = {
    "careful": careful,
    "careful_games": careful_games,
    "casual": casual,
    "casual_games": casual_games,
    "twice_a_day": twice_a_day,
    "neglect": neglect,
    "responder": responder,
    "responder_praise": responder_praise,
    "responder_miss1": responder_miss1,
    "launder": launder,
    "sleeper": sleeper,
    "praise_bot": praise_bot,
    "care_bot": care_bot,
    "launder_praise": launder_praise,
}

# Phone notifications: what a pet event sends to everyone with "notify me" on.
NOTIFYING = {"call_started", "became_sick"}


def ping_kind(event: dict) -> str:
    """first (a new call, a whine, sickness), resumed (a paused call going on
    after a natural wake) or recall (a missed need asking again)."""
    if event.get("recall"):
        return "recall"
    return "resumed" if event.get("resumed") else "first"


def _avg(s: M.PetState, total: str, samples: str, scale: float) -> float | None:
    n = getattr(s, samples, 0)
    return round(scale * getattr(s, total) / n, 1) if n else None


def run(policy: Policy, seed: int) -> dict[str, object]:
    rng = random.Random(seed)
    s = M.PetState.new("p", T0)
    t = T0
    out: dict[str, object] = {"min_health": 100.0, "light_day": None, "off_band_h": 0}
    pings: list[tuple[float, str]] = []
    counts = {"whines": 0, "happy_calls": 0, "energy_misses": 0}
    hatched_at = None
    responder_miss1.missed = {}
    play.turn = False
    while s.age_hours < HOURS:
        t += TICK
        events = M.advance(s, t, SETTINGS, rng)
        out["min_health"] = min(out["min_health"], s.health)
        if M.life_stage(s) == "egg":
            continue
        if hatched_at is None:
            hatched_at = t
        pings += [(t, ping_kind(e)) for e in events if e["type"] in NOTIFYING]
        for e in events:
            if e["type"] == "care_miss" and e.get("reason") == "energy":
                counts["energy_misses"] += 1
        if s.call is not None and s.call.started == t:
            if s.call.reason == "fake":
                counts["whines"] += 1
            elif s.call.reason == "happiness":
                counts["happy_calls"] += 1
        policy(s, t, rng)
        band = M.weight_band(s)
        if band != "healthy":
            out["off_band_h"] += TICK / 3600
        if band == "light" and out["light_day"] is None:
            out["light_day"] = round((t - T0) / 86400, 1)
    days = (t - hatched_at) / 86400
    out.update(
        pings=pings,
        notify_day=round(len(pings) / days, 1),
        recall_day=round(sum(kind == "recall" for _, kind in pings) / days, 1),
        happy_calls_day=round(counts["happy_calls"] / days, 2),
        whines_day=round(counts["whines"] / days, 2),
        energy_misses=counts["energy_misses"],
        # PR 0e's averages (None before it lands).
        disc_avg=_avg(s, "discipline_sum", "discipline_samples", 1),
        well=_avg(s, "wellbeing_sum", "wellbeing_samples", 100),
        upbringing=s.upbringing,
        score=round(M.upbringing_score(s), 1),
        care_misses=s.care_misses,
        disc_misses=s.discipline_misses,
        discipline=round(s.discipline, 1),
        hunger=round(s.hunger),
        happiness=round(s.happiness),
        health=round(s.health),
        weight=round(s.weight),
        sick=s.sick,
    )
    return out


# --- Exploits -----------------------------------------------------------------


def left_right(abandon: bool, n: int = 20000, seed: int = 2) -> float:
    """Won per game the pet counts as played. abandon: walk away once a win
    is out of reach, by starting another kind (the switch drops the old one)."""
    rng = random.Random(seed)
    s = M.PetState.new("p", T0)
    s.age_hours = 30
    for _ in range(n):
        s.energy = 100
        while True:
            info, _ = M.play_game(s, "left", T0, rng)
            if info.get("done"):
                break
            if abandon and info["round"] - info["wins"] >= 3:
                M.start_game(s, "higher_lower", T0, rng)
                s.game = None
                break
    counts = M.game_counts(s).get("left_right", {"played": 0, "won": 0})
    return counts["won"] / max(1, counts["played"])


def higher_lower_fishing(limit: int = 50, seed: int = 3) -> int | None:
    """Restarts until Higher or Lower opens on a sure 1 or 9 (None: never)."""
    rng = random.Random(seed)
    s = M.PetState.new("p", T0)
    s.age_hours, s.energy = 30, 100
    for tries in range(1, limit + 1):
        info, _ = M.start_game(s, "higher_lower", T0, rng)
        if info.get("number") in (1, 9):
            return tries
        M.start_game(s, "left_right", T0, rng)
    return None


def praise_spam(presses: int = 20) -> float:
    """Happiness from praise pressed once a second, 20 times, from 0."""
    rng = random.Random(0)
    s = M.PetState.new("p", T0)
    s.age_hours, s.happiness, s.energy, s.hunger = 30, 0, 50, 50
    for n in range(presses):
        act(s, "praise", T0 + n, rng)
    return round(s.happiness, 1)


def fast_forward_wake() -> float:
    """Fast-forward 30 h from 20:00 as the coordinator does, then the real
    hours until it wakes."""
    rng = random.Random(0)
    base = datetime(2026, 10, 28, 20, 0, tzinfo=UTC).timestamp()
    s = M.PetState.new("p", base - 40 * 3600)
    s.age_hours, s.last_updated = 40, base
    s.hunger = s.happiness = s.energy = 90
    secs = 30 * 3600
    if hasattr(M, "fast_forward"):  # PR 0g: one model helper the coordinator shares
        M.fast_forward(s, base, 30, SETTINGS, rng)
    else:
        M.advance(s, base + secs, SETTINGS, rng, max_gap=None)
        M.shift_times(s, -secs)
    t = base
    while s.asleep and t < base + 72 * 3600:
        t += TICK
        M.advance(s, t, SETTINGS, rng)
    return round((t - base) / 3600, 1)


def adult_whines(seed: int, days: int = 7) -> float:
    """Whines per awake day from a scrappy adult (SCRAPPY_WHINE_FACTOR), kept
    in good shape by careful play: the most room a whine gate gives."""
    rng = random.Random(seed)
    s = M.PetState.new("p", T0)
    s.age_hours, s.upbringing, s.species = HOURS, "scrappy", "bird"
    s.last_updated = t = T0
    whines = awake = 0
    while t < T0 + days * 86400:
        t += TICK
        M.advance(s, t, SETTINGS, rng)
        if s.call is not None and s.call.started == t and s.call.reason == "fake":
            whines += 1
        awake += not s.asleep
        careful(s, t, rng)
    return round(whines / (awake * TICK / 3600 / 16), 2)


# --- Phone notifications for a house of pets ---------------------------------

RECALL_GAP = 4 * 3600  # options (a) and (c): at most one re-call ping per 4 h
HOUSE_BUDGET = 2  # option (b): re-call pings per person per day, all pets


def house_pings(timelines: list[list[tuple[float, str]]], option: str) -> list[str]:
    """The pings one person gets, by kind, from every pet in the house.

    today/a: as the model sends them (a: the model's own re-call rule).
    b: re-calls past HOUSE_BUDGET a day, house-wide, go to the card only.
    c: re-calls bundled into one ping naming every pet still asking, at most
       one per RECALL_GAP across the house.
    d: re-calls go to the card only."""
    merged = sorted((t, kind) for line in timelines for t, kind in line)
    sent: list[str] = []
    budget: dict[int, int] = {}
    last_bundle = -math.inf
    for t, kind in merged:
        if kind != "recall" or option in ("today", "a"):
            sent.append(kind)
        elif option == "b":
            day = int(t // 86400)
            if budget.get(day, 0) < HOUSE_BUDGET:
                budget[day] = budget.get(day, 0) + 1
                sent.append(kind)
        elif option == "c" and t - last_bundle >= RECALL_GAP:
            last_bundle = t
            sent.append(kind)
    return sent


def notify_table(houses: int) -> None:
    """Pings per person per day of childhood (14 days), for 1, 2 and 4 pets
    raised the same way. Each pet is its own seed."""
    options = ("a", "b", "c", "d")
    print(
        "phone pings per person per day: mean (min-max over houses); first+resumed / re-call"
    )
    print(f"{'play':11} {'pets':>4} " + " ".join(f"{o:>24}" for o in options))
    for name in ("careful", "casual", "twice_a_day", "neglect"):
        runs = [run(STRATEGIES[name], seed) for seed in range(1, houses + 4)]
        for pets in (1, 2, 4):
            cells = []
            for option in options:
                firsts, recalls = [], []
                for h in range(houses):
                    lines = [runs[(h + i) % len(runs)]["pings"] for i in range(pets)]
                    sent = house_pings(lines, option)
                    firsts.append(sum(k != "recall" for k in sent) / 14)
                    recalls.append(sum(k == "recall" for k in sent) / 14)
                total = [f + r for f, r in zip(firsts, recalls, strict=True)]
                cells.append(
                    f"{sum(total) / houses:4.1f} ({min(total):.1f}-{max(total):.1f}) "
                    f"{sum(firsts) / houses:.1f}/{sum(recalls) / houses:.1f}"
                )
            print(f"{name:11} {pets:4} " + " ".join(f"{c:>24}" for c in cells))


# --- Target bands (Wave 0's Done) --------------------------------------------

GRADES = ("scrappy", "steady", "devoted")


def at_least(grade: str) -> Callable[[dict], bool]:
    return lambda r: GRADES.index(r["upbringing"]) >= GRADES.index(grade)


def at_most(grade: str) -> Callable[[dict], bool]:
    return lambda r: GRADES.index(r["upbringing"]) <= GRADES.index(grade)


def weight_in(low: float, high: float) -> Callable[[dict], bool]:
    return lambda r: low <= r["weight"] <= high


# Phone pings per pet per day of childhood, the first calls and the model's
# re-calls together (PR 0b's band; the owner's re-call pick may lower it).
NOTIFY_MAX = {"careful": 4, "casual": 6, "neglect": 6.5, "sleeper": 6.5}

BANDS: dict[str, list[tuple[str, Callable[[dict], bool]]]] = {
    "careful": [
        ("devoted", at_least("devoted")),
        ("no care misses", lambda r: r["care_misses"] == 0),
        ("weight 40-60", weight_in(40, 60)),
        ("never light", lambda r: r["light_day"] is None),
        ("min health >= 50", lambda r: r["min_health"] >= 50),
    ],
    "careful_games": [
        ("devoted", at_least("devoted")),
        ("weight 40-60", weight_in(40, 60)),
    ],
    "casual": [
        ("steady", lambda r: r["upbringing"] == "steady"),
        ("weight 30-70", weight_in(30, 70)),
        ("min health >= 40", lambda r: r["min_health"] >= 40),
    ],
    "casual_games": [
        ("steady", lambda r: r["upbringing"] == "steady"),
        ("weight 30-70", weight_in(30, 70)),
    ],
    "neglect": [("scrappy", at_most("scrappy"))],
    "responder": [
        ("steady or better", at_least("steady")),
        ("weight 30-70", weight_in(30, 70)),
        ("min health >= 40", lambda r: r["min_health"] >= 40),
    ],
    "responder_praise": [("steady or better", at_least("steady"))],
    "responder_miss1": [
        ("min health >= 20", lambda r: r["min_health"] >= 20),
        ("steady", lambda r: r["upbringing"] == "steady"),
    ],
    "launder": [("scrappy", at_most("scrappy"))],
    "sleeper": [("scrappy", at_most("scrappy"))],
    "praise_bot": [
        ("not devoted", at_most("steady")),
        ("weight <= 75", lambda r: r["weight"] <= 75),
        ("a real happiness call a day", lambda r: r["happy_calls_day"] >= 1),
    ],
    "care_bot": [("not devoted", at_most("steady"))],
    "launder_praise": [("scrappy", at_most("scrappy"))],
}
for _name, _most in NOTIFY_MAX.items():
    BANDS[_name].append(
        (f"<= {_most} pings a day", lambda r, m=_most: r["notify_day"] <= m)
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seeds", type=int, help="default 3, or 10 with --check")
    parser.add_argument("--check", action="store_true", help="test the target bands")
    parser.add_argument(
        "--notify", action="store_true", help="phone pings for 1, 2 and 4 pets"
    )
    args = parser.parse_args()
    if args.notify:
        notify_table(args.seeds or 10)
        return 0
    seeds = args.seeds or (10 if args.check else 3)

    cols = (
        "upbringing score care_misses disc_misses discipline "
        "hunger happiness health min_health weight light_day off_band_h sick "
        "disc_avg well notify_day recall_day happy_calls_day whines_day energy_misses"
    ).split()
    print("strategy        seed " + " ".join(f"{c:>11}" for c in cols))
    failed: list[str] = []
    energy_misses: dict[tuple[str, int], int] = {}
    for name, policy in STRATEGIES.items():
        for seed in range(1, seeds + 1):
            r = run(policy, seed)
            energy_misses[name, seed] = r["energy_misses"]
            r["min_health"] = round(r["min_health"])
            r["off_band_h"] = round(r["off_band_h"])
            print(f"{name:15} {seed:4} " + " ".join(f"{r[c]!s:>11}" for c in cols))
            for label, ok in BANDS.get(name, []):
                if not ok(r):
                    failed.append(f"{name} seed {seed}: {label}")

    failed += [
        f"launder seed {seed}: no fewer energy misses than neglect"
        for seed in range(1, seeds + 1)
        if energy_misses["launder", seed] < energy_misses["neglect", seed]
    ]
    whines = max(adult_whines(seed) for seed in range(1, seeds + 1))
    honest, abandon = left_right(False), left_right(True)
    fished = higher_lower_fishing()
    spam = praise_spam()
    woke = fast_forward_wake()
    print()
    print(
        f"left/right won per game counted: honest {honest:.2f}, abandon {abandon:.2f}"
    )
    print(f"higher/lower sure opening after restarts: {fished}")
    print(f"praise x20 in 20 s, happiness from 0: {spam}")
    print(f"fast-forward 30 h from 20:00, real hours until it wakes: {woke}")
    print(f"scrappy adult, whines per awake day (worst seed): {whines}")
    exploits = [
        ("abandoning doesn't raise the win rate", abandon <= honest + 0.03),
        ("no sure higher/lower opening by restarting", fished is None),
        ("praise spam gives at most 16 happiness", spam <= 16),
        ("fast-forward wakes within 12 h", woke <= 12),
        ("a scrappy adult whines at most 3 times a day", whines <= 3),
    ]
    failed += [label for label, ok in exploits if not ok]

    if args.check:
        print()
        print("bands:", "all pass" if not failed else f"{len(failed)} fail")
        for line in failed:
            print("  FAIL", line)
        return 1 if failed else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
