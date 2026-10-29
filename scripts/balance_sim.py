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
--check exits 1 if any band fails. The bands are Wave 0's targets: on the
code before Wave 0 most of them fail, which is the point.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
import random
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

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


def careful(s: M.PetState, t: float, rng: random.Random) -> None:
    """Looks every five minutes: answers calls, feeds and plays ahead, praises
    right after a real call is answered, and puts it to bed."""
    if s.asleep:
        return
    if answer(s, t, rng, suspicious=True):
        act(s, "praise", t, rng)
    if s.sick:
        act(s, "medicine", t, rng)
    if s.poops:
        act(s, "clean", t, rng)
    if s.hunger < 40:
        act(s, "feed", t, rng)
    if s.happiness < 40 and s.energy > 20:
        act(s, "play", t, rng)
    bedtime(s, t)


CASUAL_VISITS = (8, 12, 17, 21)  # local hours a casual player opens the card


def casual(s: M.PetState, t: float, rng: random.Random) -> None:
    """Opens the card four times a day and sees to whatever is up, a nap
    included if it looks worn out. Calls in between go unanswered."""
    local = datetime.fromtimestamp(t, SETTINGS.tz)
    if local.hour not in CASUAL_VISITS or local.minute >= TICK // 60 or s.asleep:
        return
    answer(s, t, rng, suspicious=False)
    if s.sick:
        act(s, "medicine", t, rng)
    if s.poops:
        act(s, "clean", t, rng)
    if s.hunger < 60:
        act(s, "feed", t, rng)
    if s.happiness < 60 and s.energy > 20:
        act(s, "play", t, rng)
    if local.hour == CASUAL_VISITS[-1] or s.energy < 30:
        M.set_lights_out(s, True, t, SETTINGS)


def neglect(s: M.PetState, t: float, rng: random.Random) -> None:
    pass


def responder(s: M.PetState, t: float, rng: random.Random) -> None:
    """Answers every call with the textbook answer, and does nothing else."""
    if not s.asleep:
        answer(s, t, rng, suspicious=True)


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


def launder_praise(s: M.PetState, t: float, rng: random.Random) -> None:
    launder(s, t, rng)
    if not s.asleep and int(t) % 1800 < TICK:
        act(s, "praise", t, rng)


STRATEGIES: dict[str, Policy] = {
    "careful": careful,
    "casual": casual,
    "neglect": neglect,
    "responder": responder,
    "responder_miss1": responder_miss1,
    "launder": launder,
    "praise_bot": praise_bot,
    "launder_praise": launder_praise,
}


def run(policy: Policy, seed: int) -> dict[str, object]:
    rng = random.Random(seed)
    s = M.PetState.new("p", T0)
    t = T0
    out: dict[str, object] = {"min_health": 100.0, "light_day": None, "off_band_h": 0}
    responder_miss1.missed = {}
    while s.age_hours < HOURS:
        t += TICK
        M.advance(s, t, SETTINGS, rng)
        out["min_health"] = min(out["min_health"], s.health)
        if M.life_stage(s) == "egg":
            continue
        policy(s, t, rng)
        band = M.weight_band(s)
        if band != "healthy":
            out["off_band_h"] += TICK / 3600
        if band == "light" and out["light_day"] is None:
            out["light_day"] = round((t - T0) / 86400, 1)
    out.update(
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
    M.advance(s, base + secs, SETTINGS, rng, max_gap=None)
    M.shift_times(s, -secs)
    t = base
    while s.asleep and t < base + 72 * 3600:
        t += TICK
        M.advance(s, t, SETTINGS, rng)
    return round((t - base) / 3600, 1)


# --- Target bands (Wave 0's Done) --------------------------------------------

GRADES = ("scrappy", "steady", "devoted")


def at_least(grade: str) -> Callable[[dict], bool]:
    return lambda r: GRADES.index(r["upbringing"]) >= GRADES.index(grade)


def at_most(grade: str) -> Callable[[dict], bool]:
    return lambda r: GRADES.index(r["upbringing"]) <= GRADES.index(grade)


def weight_in(low: float, high: float) -> Callable[[dict], bool]:
    return lambda r: low <= r["weight"] <= high


BANDS: dict[str, list[tuple[str, Callable[[dict], bool]]]] = {
    "careful": [
        ("devoted", at_least("devoted")),
        ("no care misses", lambda r: r["care_misses"] == 0),
        ("weight 40-60", weight_in(40, 60)),
        ("never light", lambda r: r["light_day"] is None),
        ("min health >= 50", lambda r: r["min_health"] >= 50),
    ],
    "casual": [
        ("steady or better", at_least("steady")),
        ("weight 30-70", weight_in(30, 70)),
        ("min health >= 40", lambda r: r["min_health"] >= 40),
    ],
    "neglect": [("scrappy", at_most("scrappy"))],
    "responder": [
        ("steady or better", at_least("steady")),
        ("weight 30-70", weight_in(30, 70)),
        ("min health >= 40", lambda r: r["min_health"] >= 40),
    ],
    "responder_miss1": [
        ("min health >= 20", lambda r: r["min_health"] >= 20),
        ("not devoted", at_most("steady")),
    ],
    "launder": [("scrappy", at_most("scrappy"))],
    "praise_bot": [("not devoted", at_most("steady"))],
    "launder_praise": [("scrappy", at_most("scrappy"))],
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seeds", type=int, default=3)
    parser.add_argument("--check", action="store_true", help="test the target bands")
    args = parser.parse_args()

    cols = (
        "upbringing score care_misses disc_misses discipline "
        "hunger happiness health min_health weight light_day off_band_h sick"
    ).split()
    print("strategy        seed " + " ".join(f"{c:>11}" for c in cols))
    failed: list[str] = []
    for name, policy in STRATEGIES.items():
        for seed in range(1, args.seeds + 1):
            r = run(policy, seed)
            r["min_health"] = round(r["min_health"])
            r["off_band_h"] = round(r["off_band_h"])
            print(f"{name:15} {seed:4} " + " ".join(f"{r[c]!s:>11}" for c in cols))
            for label, ok in BANDS.get(name, []):
                if not ok(r):
                    failed.append(f"{name} seed {seed}: {label}")

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
    exploits = [
        ("abandoning doesn't raise the win rate", abandon <= honest + 0.03),
        ("no sure higher/lower opening by restarting", fished is None),
        ("praise spam gives at most 16 happiness", spam <= 16),
        ("fast-forward wakes within 12 h", woke <= 12),
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
