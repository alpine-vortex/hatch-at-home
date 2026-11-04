"""Sitter-visit tuning simulation (docs/plan-2026-11-04-sitter-visits.md, 3.2 and 3.8).

Runs the REAL model.advance (away off, so it steps) and applies the plan's sitter round
after each 5-minute step, tidying poop at once. Prints the numbers the plan quotes.
With --model it runs the shipped sitter instead (away on, model.sitter_round with the
constants in rates.py; the constant flags are ignored): the two must agree (3.8).

    .venv/bin/python dev/sitter_sim.py [--days 30] [--tz UTC] [--bed 23:00] [--wake 07:00]
        [--seeds 5] [--play-energy -5] [--play-weight -1.5] [--play-below 65]
        [--play-hunger -2.5] [--feed-below 65] [--supper-below 80] [--model]

The sitter itself is in model.py (slice S1); this pins the constants.
"""

import argparse
from datetime import datetime, timedelta
from pathlib import Path
import random
import sys
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from custom_components.virtual_pet import model as M, rates as R  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--days", type=int, default=30)
ap.add_argument("--tz", default="UTC")
ap.add_argument("--bed", default="23:00")
ap.add_argument("--wake", default="07:00")
ap.add_argument("--seeds", type=int, default=5)
ap.add_argument("--species", default="bird")
ap.add_argument("--play-energy", type=float, default=-5.0)  # SITTER_PLAY_ENERGY
ap.add_argument("--play-weight", type=float, default=-1.5)  # SITTER_PLAY_WEIGHT
ap.add_argument("--play-hunger", type=float, default=-2.5)  # SITTER_PLAY_HUNGER
ap.add_argument("--play-gain", type=float, default=R.PLAY_HAPPINESS)
ap.add_argument("--play-below", type=float, default=65.0)  # SITTER_PLAY_BELOW
ap.add_argument("--play-min-energy", type=float, default=R.PLAY_MIN_ENERGY)
ap.add_argument("--feed-below", type=float, default=65.0)  # SITTER_FEED_BELOW
ap.add_argument("--supper-below", type=float, default=80.0)  # SITTER_SUPPER_BELOW
ap.add_argument("--hours", default="1,5,9,13")  # SITTER_ROUNDS_HOURS
ap.add_argument(
    "--no-clamp",
    dest="clamp",
    action="store_false",
    help="last slot = wake+13h even when bedtime is earlier (default: min(wake+13h, bedtime-1h))",
)
ap.add_argument(
    "--trace", default="", help="YYYY-MM-DD: print the pet every 30 min that local day"
)
ap.add_argument("--start", default="2026-01-05T09:00")
ap.add_argument(
    "--model",
    action="store_true",
    help="run model.py's sitter (away on), not the stand-in",
)
a = ap.parse_args()

TZ = ZoneInfo(a.tz)
S = M.Settings(
    tz=TZ,
    roster=(a.species,),
    bedtime=M.parse_hhmm(a.bed),
    wake_time=M.parse_hhmm(a.wake),
)
HOURS = tuple(float(h) for h in a.hours.split(","))


def slot_at(day, h):
    """Wall-clock slot: wake on `day` + h hours, as an aware local time, then a timestamp."""
    t = (datetime.combine(day, S.wake_time, tzinfo=TZ) + timedelta(hours=h)).timestamp()
    if (
        a.clamp and h == HOURS[-1]
    ):  # the last slot never falls within an hour of bedtime
        bed = datetime.combine(day, S.bedtime, tzinfo=TZ)
        if S.bedtime <= S.wake_time:
            bed += timedelta(days=1)
        t = min(t, (bed - timedelta(hours=1)).timestamp())
    return t


def due(served, now):
    """Latest slot at or before now (looked for today and yesterday), if later than `served`.

    No day window: a supper slept through is served the moment the pet wakes (3.2). Returns
    (slot, is_last_slot_of_its_day) or None.
    """
    d = datetime.fromtimestamp(now, TZ).date()
    best = None
    for day in (d - timedelta(days=1), d):
        for h in HOURS:
            t = slot_at(day, h)
            if t <= now and t > served and (best is None or t > best[0]):
                best = (t, h == HOURS[-1])
    return best


def round_(s, now, slot, supper, log):
    did = []
    if s.sick:
        s.health = min(100, s.health + R.MEDICINE_HEALTH)
        s.happiness += R.MEDICINE_HAPPINESS
        s.sick = False
        s.recent_misses = []
        did.append("medicine")
    if s.poops:
        s.poops = []
        did.append("clean")
    if s.hunger < (a.supper_below if supper else a.feed_below):
        s.hunger = min(100, s.hunger + R.FEED_HUNGER)
        s.weight += R.WEIGHT_FEED
        s.digesting.append(now + R.DIGEST_MINUTES * 60)
        did.append("feed")
    if s.happiness < a.play_below and s.energy >= a.play_min_energy:
        s.happiness = min(100, s.happiness + a.play_gain)
        s.energy = max(0.0, s.energy + a.play_energy)
        s.hunger = max(0.0, s.hunger + a.play_hunger)
        s.weight += a.play_weight
        did.append("play")
    s.sitter_served = slot
    log.append(did)


def run(seed):
    rng = random.Random(seed)
    t0 = datetime.fromisoformat(a.start).replace(tzinfo=TZ).timestamp()
    s = M.PetState.new("p", t0)
    s.age_hours = 400.0
    s.species = a.species
    s.hatched_on = "2025-12-01"
    s.hunger = s.happiness = 80.0
    s.energy = 90.0
    s.sitter_served = t0
    s.away = a.model
    t, log = t0, []
    st = dict(
        hunger=100,
        happy=100,
        weight=100,
        wmax=0,
        health=100,
        miss=0,
        calls=0,
        sick=0,
        hungry_flag=0,
        bored_flag=0,
        sleepy_flag=0,
        steps=0,
        wake_hunger=100,
    )
    was_asleep = s.asleep
    while t < t0 + a.days * 86400:
        t += 300
        served = s.sitter_served
        events = M.advance(s, t, S, rng)
        if a.model and s.sitter_served != served:
            log.append(
                next((e["did"] for e in events if e["type"] == "sitter_round"), [])
            )
        for e in events:
            if e["type"] == "care_miss":
                st["miss"] += (
                    1  # counted only to show the sim's stand-in works: expect the model to make none
                )
            if e["type"] == "call_started":
                st["calls"] += 1
            if e["type"] == "became_sick":
                st["sick"] += 1
        if not a.model:
            s.call = None  # no calls while the sitter is here (3.4); misses stay 0
            s.poops = []  # tidied the moment it appears (3.3)
            if not s.asleep and (d := due(s.sitter_served, t)):
                round_(s, t, d[0], d[1], log)
        if was_asleep and not s.asleep:
            st["wake_hunger"] = min(st["wake_hunger"], s.hunger)
        was_asleep = s.asleep
        if (
            a.trace
            and t % 1800 == 0
            and datetime.fromtimestamp(t, TZ).date().isoformat() == a.trace
        ):
            print(
                datetime.fromtimestamp(t, TZ).strftime("%H:%M"),
                "asleep" if s.asleep else "awake",
                f"hunger {s.hunger:.1f} happy {s.happiness:.1f} energy {s.energy:.1f}",
            )
        st["steps"] += 1
        if s.hunger < st["hunger"]:
            st["hunger_at"] = datetime.fromtimestamp(t, TZ).strftime("%m-%d %H:%M")
        st["hunger"] = min(st["hunger"], s.hunger)
        if s.happiness < st["happy"]:
            st["happy_at"] = datetime.fromtimestamp(t, TZ).strftime("%m-%d %H:%M")
        st["happy"] = min(st["happy"], s.happiness)
        st["weight"] = min(st["weight"], s.weight)
        st["wmax"] = max(st["wmax"], s.weight)
        st["health"] = min(st["health"], s.health)
        st["hungry_flag"] += s.hunger < R.HUNGRY_BELOW
        st["bored_flag"] += s.happiness < R.BORED_BELOW
        st["sleepy_flag"] += (not s.asleep) and s.energy < R.SLEEPY_BELOW
    plays = sum("play" in d for d in log)
    feeds = sum("feed" in d for d in log)
    return st, s, plays, feeds, len(log)


worst = dict(hunger=100, happy=100, weight=100, wmax=0, health=100, wake_hunger=100)
tot = dict(miss=0, sick=0, hungry_flag=0, bored_flag=0, sleepy_flag=0)
for seed in range(1, a.seeds + 1):
    st, s, plays, feeds, n = run(seed)
    for k in worst:
        worst[k] = max(worst[k], st[k]) if k == "wmax" else min(worst[k], st[k])
    for k in tot:
        tot[k] += st[k]
    print(
        f"seed {seed}: min hunger {st['hunger']:.1f} at {st['hunger_at']} (wake {st['wake_hunger']:.1f}) min happy {st['happy']:.1f} at {st['happy_at']} "
        f"weight {st['weight']:.1f}..{st['wmax']:.1f} (end {s.weight:.1f}, {M.weight_band(s)}) health>={st['health']:.0f} "
        f"sick {st['sick']} miss {st['miss']} flags hungry {st['hungry_flag']} bored {st['bored_flag']} sleepy {st['sleepy_flag']} "
        f"rounds {n} plays {plays} feeds {feeds}"
    )
print(
    "WORST",
    {k: round(v, 1) for k, v in worst.items()},
    tot,
    a.tz,
    a.bed,
    a.days,
    "days",
)
