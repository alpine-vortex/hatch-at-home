"""The pet itself: state, the passage of time, and care actions.

Pure Python with no Home Assistant imports, so the time math can be tested
directly. Times are UTC epoch seconds (floats). The coordinator owns one
PetState, calls advance() on every tick and apply_action() for care, and fires
whatever events these return.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, fields
from datetime import datetime, time, timedelta, tzinfo
import math
import random
from typing import Any

from . import rates as R
from .home import COZY_FLAGS, EXCITED_FLAGS, HomeEffect

STATS = ("hunger", "happiness", "energy", "health", "discipline")

ACTIONS = ("feed", "snack", "play", "clean", "medicine", "scold", "praise")
# Answers to what the house makes the pet ask for (see home.py).
REQUEST_ACTIONS = ("blanket", "fan")

# Highest priority first. The mood sensor is the first of these that applies.
MOODS = (
    "away",
    "egg",
    "sick",
    "asleep",
    "calling",
    "hungry",
    "dirty",
    "sleepy",
    "bored",
    "excited",
    "cozy",
    "content",
)

LIFE_STAGES = tuple(name for name, _ in R.STAGE_STARTS)

CALL_PRIORITY = ("sick", "hunger", "dirty", "energy", "happiness")

# Results an action can come back with. "ok" means it did something.
OK = "ok"


@dataclass
class Call:
    """An attention call the player has CALL_WINDOW_MINUTES to answer."""

    reason: str  # one of CALL_PRIORITY, or "fake"
    started: float
    deadline: float


@dataclass
class PetState:
    """Everything that is saved to the Store."""

    name: str
    born: float
    last_updated: float
    age_hours: float = 0.0
    hunger: float = 80.0
    happiness: float = 80.0
    energy: float = 80.0
    health: float = 100.0
    discipline: float = 0.0
    poops: list[float] = field(default_factory=list)  # when each one appeared
    digesting: list[float] = field(default_factory=list)  # when each is due
    sick: bool = False
    asleep: bool = False
    napping: bool = False  # asleep outside sleep hours
    lights_out: bool = False
    stayed_up_since: float | None = None  # awake inside sleep hours since
    wake_at: float | None = None  # when the night's sleep ends (fixed at bedtime)
    kept_up_until: float = 0.0  # woken by hand: the house can't put it back to bed yet
    cozy_until: float = 0.0  # tucked in with a blanket
    cool_until: float = 0.0  # enjoying the fan
    call: Call | None = None
    latched: list[str] = field(default_factory=list)  # called, not re-armed
    care_misses: int = 0
    discipline_misses: int = 0
    recent_misses: list[float] = field(default_factory=list)
    last_praise: float = 0.0
    last_excite: float = 0.0
    away: bool = False
    care_log: list[dict[str, Any]] = field(default_factory=list)
    species: str | None = None  # decided when the egg hatches
    raised: list[str] = field(default_factory=list)  # species this device has hatched

    def to_dict(self) -> dict[str, Any]:
        """Serialize for the Store."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PetState:
        """Load from the Store, ignoring unknown keys and defaulting new ones."""
        known = {f.name for f in fields(cls)}
        kwargs = {k: v for k, v in data.items() if k in known}
        # Drop anything a newer or older version knew about and this one doesn't.
        reasons = set(CALL_PRIORITY) | {"fake"}
        kwargs["latched"] = [r for r in kwargs.get("latched", []) if r in reasons]
        call = kwargs.get("call")
        if call is not None:
            call_keys = {f.name for f in fields(Call)}
            call = {k: v for k, v in call.items() if k in call_keys}
            kwargs["call"] = Call(**call) if call.get("reason") in reasons else None
        return cls(**kwargs)

    @classmethod
    def new(cls, name: str, now: float) -> PetState:
        """A freshly laid egg."""
        return cls(name=name, born=now, last_updated=now)


@dataclass
class Settings:
    """Per-pet settings from the config entry options."""

    tz: tzinfo
    roster: tuple[str, ...] = ("bird",)  # what this device's eggs can hatch into
    bedtime: time = field(default_factory=lambda: parse_hhmm(R.DEFAULT_BEDTIME))
    wake_time: time = field(default_factory=lambda: parse_hhmm(R.DEFAULT_WAKE_TIME))
    home: HomeEffect = field(default_factory=HomeEffect)  # what the house is doing


def parse_hhmm(value: str) -> time:
    hours, minutes = value.split(":")[:2]
    return time(int(hours), int(minutes))


Event = dict[str, Any]


# --- Helpers ----------------------------------------------------------------


def life_stage(state: PetState) -> str:
    """Life stage from age; aging pauses while away."""
    stage = LIFE_STAGES[0]
    for name, start in R.STAGE_STARTS:
        if state.age_hours >= start:
            stage = name
    return stage


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _minutes_of_day(ts: float, tz: tzinfo) -> int:
    local = datetime.fromtimestamp(ts, tz)
    return local.hour * 60 + local.minute


def in_sleep_hours(ts: float, settings: Settings) -> bool:
    """Whether ts falls between bedtime and wake time (local)."""
    now = _minutes_of_day(ts, settings.tz)
    bed = settings.bedtime.hour * 60 + settings.bedtime.minute
    wake = settings.wake_time.hour * 60 + settings.wake_time.minute
    if bed == wake:
        return False
    if bed < wake:
        return bed <= now < wake
    return now >= bed or now < wake


def minutes_to_bedtime(ts: float, settings: Settings) -> int:
    """Minutes until the next bedtime (0-1439)."""
    now = _minutes_of_day(ts, settings.tz)
    bed = settings.bedtime.hour * 60 + settings.bedtime.minute
    return (bed - now) % 1440


def shift_times(state: PetState, delta: float) -> None:
    """Move every pending timestamp forward by delta seconds.

    Used to freeze the pet: while away, or across HA downtime, the world
    stops for the pet, so deadlines and schedules slide along with the clock.
    """
    state.poops = [t + delta for t in state.poops]
    state.digesting = [t + delta for t in state.digesting]
    state.recent_misses = [t + delta for t in state.recent_misses]
    if state.call is not None:
        state.call.started += delta
        state.call.deadline += delta
    if state.stayed_up_since is not None:
        state.stayed_up_since += delta
    if state.wake_at is not None:
        state.wake_at += delta
    state.last_praise += delta
    state.last_excite += delta
    state.kept_up_until += delta
    state.cozy_until += delta
    state.cool_until += delta
    state.last_updated += delta


def catch_up(state: PetState, now: float) -> None:
    """Account for time HA was not running.

    Downtime uses the away (frozen) rates: nothing decays, ages or expires, so
    a restart can never make the pet sick or cost a care miss.
    """
    elapsed = now - state.last_updated
    if elapsed <= 0:
        state.last_updated = now
        return
    shift_times(state, elapsed)
    state.last_updated = now


# --- Time passing -----------------------------------------------------------


def advance(
    state: PetState,
    now: float,
    settings: Settings,
    rng: random.Random,
    max_gap: float | None = R.MAX_LIVE_GAP_MINUTES * 60,
) -> list[Event]:
    """Advance the pet from state.last_updated to now in small steps.

    A gap longer than max_gap means the clock jumped; the excess is frozen.
    Fast-forward passes max_gap=None to live through every hour on purpose.
    """
    events: list[Event] = []
    if now <= state.last_updated:
        # No time passed, or the clock went back: move the timers back with it.
        shift_times(state, now - state.last_updated)
        return events
    if max_gap is not None and now - state.last_updated > max_gap:
        shift_times(state, now - state.last_updated - max_gap)
    t = state.last_updated
    while t < now:
        t_next = min(now, t + R.MAX_STEP_SECONDS)
        if state.away:
            shift_times(state, t_next - t)  # also moves last_updated
        else:
            _step(state, t, t_next, settings, rng, events)
            state.last_updated = t_next
        t = t_next
    return events


def react(state: PetState, now: float, settings: Settings) -> list[Event]:
    """Respond right away to a change in the house (no time passes).

    The caller advances the pet to now first, under the old house state.
    """
    events: list[Event] = []
    if not state.away and life_stage(state) != "egg":
        _sleep(state, now, settings, events)
    return events


def _step(
    state: PetState,
    t0: float,
    t1: float,
    settings: Settings,
    rng: random.Random,
    events: list[Event],
) -> None:
    hours = (t1 - t0) / 3600
    was_stage = life_stage(state)
    state.age_hours += hours
    stage = life_stage(state)
    if stage != was_stage:
        if was_stage == "egg":
            if not settings.roster:
                # Nothing it could hatch into (no ready species): stay an egg.
                state.age_hours = R.STAGE_STARTS[1][1] - 1e-6
                return
            _hatch(state, settings, rng, events, t1)
        events.append({"type": "stage_changed", "stage": stage, "from": was_stage})
    if stage == "egg":
        return

    _sleep(state, t1, settings, events)
    _decay(state, hours, t1, settings)
    _digest(state, t1, events)
    _sickness(state, hours, t1, rng, events)
    _calls(state, t1, hours, rng, events)


def _hatch(
    state: PetState,
    settings: Settings,
    rng: random.Random,
    events: list[Event],
    t: float,
) -> None:
    """The egg decides: a surprise, preferring species not raised here yet."""
    if state.species is None:
        fresh = [s for s in settings.roster if s not in state.raised]
        state.species = rng.choice(fresh or list(settings.roster))
    if state.species not in state.raised:
        state.raised.append(state.species)
    events.append({"type": "hatched", "species": state.species})
    if state.lights_out:
        # Someone put the egg to bed; the hatchling goes straight to sleep.
        _fall_asleep(state, not in_sleep_hours(t, settings), events, t, settings)


def next_wake(ts: float, settings: Settings) -> float:
    """The next wake time after ts, as a timestamp (DST-safe)."""
    local = datetime.fromtimestamp(ts, settings.tz)
    wake = datetime.combine(local.date(), settings.wake_time, tzinfo=settings.tz)
    if wake.timestamp() <= ts:
        wake = datetime.combine(
            local.date() + timedelta(days=1), settings.wake_time, tzinfo=settings.tz
        )
    return wake.timestamp()


def _sleep(state: PetState, t: float, settings: Settings, events: list[Event]) -> None:
    night = in_sleep_hours(t, settings)
    if state.asleep:
        if state.napping:
            if night:
                # A late nap turns into the night's sleep.
                state.napping = False
                state.wake_at = next_wake(t, settings)
            elif state.energy >= R.NAP_WAKE_ENERGY and (
                minutes_to_bedtime(t, settings) > R.NAP_INTO_NIGHT_MINUTES
            ):
                _wake(state, events)
            return
        if state.wake_at is None:
            state.wake_at = next_wake(t, settings)
        if t >= state.wake_at:
            _wake(state, events)
        return
    if (
        settings.home.dark_and_quiet
        and t >= state.kept_up_until
        and (night or minutes_to_bedtime(t, settings) <= R.HOME_BEDTIME_WINDOW_MINUTES)
    ):
        # Bedtime lights off and the house quiet: off to bed. (The house can put
        # the pet to sleep, never wake it.)
        _fall_asleep(state, False, events, t, settings)
        return
    if not night:
        state.stayed_up_since = None
        return
    if state.stayed_up_since is None:
        state.stayed_up_since = t
    elif t - state.stayed_up_since >= R.FALL_ASLEEP_ANYWAY_MINUTES * 60:
        # Nobody turned the lights out; it dozes off anyway. No penalty.
        _fall_asleep(state, False, events, t, settings)


def _fall_asleep(
    state: PetState, napping: bool, events: list[Event], t: float, settings: Settings
) -> None:
    state.asleep = True
    state.napping = napping
    state.stayed_up_since = None
    state.wake_at = None if napping else next_wake(t, settings)
    if state.call is not None:
        if state.call.reason == "energy":
            events.append({"type": "call_answered", "reason": "energy"})
        else:
            # Calls pause for sleep; it will ask again after waking.
            _unlatch(state, state.call.reason)
        state.call = None
    events.append({"type": "fell_asleep", "napping": napping})


def _wake(state: PetState, events: list[Event]) -> None:
    state.asleep = False
    state.napping = False
    state.lights_out = False
    state.wake_at = None
    events.append({"type": "woke_up"})


def _decay(state: PetState, hours: float, t: float, settings: Settings) -> None:
    if state.asleep:
        state.hunger -= R.HUNGER_DECAY * R.ASLEEP_HUNGER_FACTOR * hours
        state.happiness -= R.HAPPINESS_DECAY * R.ASLEEP_HAPPINESS_FACTOR * hours
        state.energy += R.ENERGY_REGEN_ASLEEP * hours
    else:
        state.hunger -= R.HUNGER_DECAY * hours
        state.happiness -= R.HAPPINESS_DECAY * hours
        state.energy -= R.ENERGY_DECAY * hours
    state.discipline -= R.DISCIPLINE_DECAY * hours

    # The house only ever adds, and never more than the cap per stat.
    if not state.asleep:
        bonus = dict(settings.home.bonus)
        if t < state.cozy_until or t < state.cool_until:
            bonus["happiness"] = bonus.get("happiness", 0.0) + R.COMFORT_HAPPINESS
        for stat, rate in bonus.items():
            setattr(
                state, stat, getattr(state, stat) + min(rate, R.HOME_BONUS_CAP) * hours
            )

    health_rate = 0.0
    old_poops = _old_poops(state, t)
    if state.sick:
        health_rate += R.HEALTH_SICK
        state.happiness += R.HAPPINESS_SICK * hours
    if state.hunger <= 0:
        health_rate += R.HEALTH_STARVING
    health_rate += R.HEALTH_PER_OLD_POOP * old_poops
    if not state.sick and not state.poops and state.hunger >= R.HEALTHY_HUNGER_MIN:
        health_rate += R.HEALTH_REGEN
    state.health += health_rate * hours

    for stat in STATS:
        setattr(state, stat, _clamp(getattr(state, stat)))
    state.health = max(state.health, R.HEALTH_FLOOR)


def _old_poops(state: PetState, t: float) -> int:
    return sum(1 for p in state.poops if t - p >= R.POOP_OLD_MINUTES * 60)


def _digest(state: PetState, t: float, events: list[Event]) -> None:
    due = [d for d in state.digesting if d <= t]
    if not due:
        return
    state.digesting = [d for d in state.digesting if d > t]
    for when in due:
        if len(state.poops) < R.MAX_POOPS:
            state.poops.append(when)
            events.append({"type": "pooped", "count": len(state.poops)})


def _sickness(
    state: PetState,
    hours: float,
    t: float,
    rng: random.Random,
    events: list[Event],
) -> None:
    window = R.SICK_MISS_WINDOW_HOURS * 3600
    state.recent_misses = [m for m in state.recent_misses if t - m < window]
    if state.sick:
        return
    cause = None
    if state.health < R.SICK_BELOW_HEALTH:
        cause = "low_health"
    elif len(state.recent_misses) >= R.SICK_MISSES:
        cause = "neglect"
    else:
        old = _old_poops(state, t)
        if old and rng.random() < 1 - math.exp(-R.POOP_SICK_HAZARD * old * hours):
            cause = "poop"
    if cause:
        state.sick = True
        events.append({"type": "became_sick", "cause": cause})


def _call_condition(state: PetState, reason: str, t: float) -> bool:
    if reason == "sick":
        return state.sick
    if reason == "dirty":
        return bool(state.poops) and t - state.poops[0] >= R.POOP_CALL_MINUTES * 60
    if reason == "fake":
        return True
    low, _ = R.CALL_THRESHOLDS[reason]
    return getattr(state, reason) < low


def _rearmed(state: PetState, reason: str) -> bool:
    if reason == "sick":
        return not state.sick
    if reason == "dirty":
        return not state.poops
    _, high = R.CALL_THRESHOLDS[reason]
    return getattr(state, reason) > high


def _unlatch(state: PetState, reason: str) -> None:
    if reason in state.latched:
        state.latched.remove(reason)


def _calls(
    state: PetState,
    t: float,
    hours: float,
    rng: random.Random,
    events: list[Event],
) -> None:
    for reason in list(state.latched):
        if _rearmed(state, reason):
            _unlatch(state, reason)

    if state.asleep:
        return

    call = state.call
    if call is not None:
        if not _call_condition(state, call.reason, t):
            state.call = None
            events.append({"type": "call_answered", "reason": call.reason})
        elif t >= call.deadline:
            state.call = None
            if call.reason == "fake":
                state.discipline_misses += 1
                events.append({"type": "discipline_miss"})
            else:
                state.care_misses += 1
                state.recent_misses.append(t)
                # One neglect is one miss: no new call about this until it
                # recovers past the re-arm level.
                state.latched.append(call.reason)
                events.append(
                    {
                        "type": "care_miss",
                        "reason": call.reason,
                        "care_misses": state.care_misses,
                    }
                )
        else:
            return

    for reason in CALL_PRIORITY:
        if reason not in state.latched and _call_condition(state, reason, t):
            _start_call(state, reason, t, events)
            return

    if _wants_to_whine(state) and rng.random() < 1 - math.exp(
        -R.FAKE_CALL_RATE * hours
    ):
        _start_call(state, "fake", t, events)


def _wants_to_whine(state: PetState) -> bool:
    return (
        not state.sick
        and not state.poops
        and state.discipline < 100
        and all(
            getattr(state, s) > R.FAKE_CALL_MIN_STATS
            for s in ("hunger", "happiness", "energy", "health")
        )
    )


def sitter_settles(state: PetState) -> bool:
    """The sitter answers a whine (fake call) the pet left with; real needs stay."""
    if state.call is not None and state.call.reason == "fake":
        state.call = None
        return True
    return False


def _start_call(state: PetState, reason: str, t: float, events: list[Event]) -> None:
    state.call = Call(reason, t, t + R.CALL_WINDOW_MINUTES * 60)
    # A fake call looks like a plea to play from outside; the status screen
    # (happiness is fine) is how a player catches it.
    events.append(
        {"type": "call_started", "reason": "happiness" if reason == "fake" else reason}
    )


# --- Care actions -----------------------------------------------------------


def requests(state: PetState, now: float, settings: Settings) -> list[str]:
    """What the pet is asking for because of the house, minus what it got."""
    satisfied = {"blanket": now < state.cozy_until, "fan": now < state.cool_until}
    if state.asleep or state.away or life_stage(state) == "egg":
        return []
    return [r for r in settings.home.requests if not satisfied.get(r)]


def action_available(
    state: PetState, action: str, now: float = 0.0, settings: Settings | None = None
) -> bool:
    """Whether the button for an action should be available."""
    if action == "medicine":
        return state.sick
    if action in REQUEST_ACTIONS:
        return settings is not None and action in requests(state, now, settings)
    return True


def apply_action(
    state: PetState,
    action: str,
    now: float,
    rng: random.Random,
    by: str | None = None,
    settings: Settings | None = None,
) -> tuple[str, list[Event]]:
    """Apply a care action. The caller advances the pet to now first.

    Returns a result code ("ok", or why nothing happened) and events.
    """
    events: list[Event] = []
    if action in REQUEST_ACTIONS:
        result = _answer_request(state, action, now, settings, events)
    else:
        result = _do_action(state, action, now, rng, events)
    state.care_log.insert(0, {"at": now, "action": action, "by": by, "result": result})
    del state.care_log[R.CARE_LOG_SIZE :]
    events.append({"type": "care", "action": action, "result": result})
    if result == OK:
        _resolve_call(state, now, events)
    return result, events


def _answer_request(
    state: PetState,
    action: str,
    now: float,
    settings: Settings | None,
    events: list[Event],
) -> str:
    if settings is None or action not in requests(state, now, settings):
        return "not_needed"
    until = now + R.COMFORT_MINUTES * 60
    if action == "blanket":
        state.happiness = _clamp(state.happiness + R.BLANKET_HAPPINESS)
        state.cozy_until = until
    else:
        state.happiness = _clamp(state.happiness + R.FAN_HAPPINESS)
        state.cool_until = until
    events.append({"type": "request_answered", "request": action})
    return OK


def _do_action(
    state: PetState,
    action: str,
    now: float,
    rng: random.Random,
    events: list[Event],
) -> str:
    if state.away:
        return "away"
    if life_stage(state) == "egg":
        return "egg"
    if state.asleep:
        return "asleep"

    if action == "feed":
        if state.hunger >= R.FEED_FULL_AT:
            return "full"
        state.hunger = _clamp(state.hunger + R.FEED_HUNGER)
        jitter = rng.uniform(-R.DIGEST_JITTER_MINUTES, R.DIGEST_JITTER_MINUTES)
        state.digesting.append(now + (R.DIGEST_MINUTES + jitter) * 60)
        return OK

    if action == "snack":
        state.hunger = _clamp(state.hunger + R.SNACK_HUNGER)
        state.happiness = _clamp(state.happiness + R.SNACK_HAPPINESS)
        state.health = max(_clamp(state.health + R.SNACK_HEALTH), R.HEALTH_FLOOR)
        state.last_excite = now
        if rng.random() < R.SNACK_POOP_CHANCE:
            state.digesting.append(now + R.DIGEST_MINUTES * 60)
        return OK

    if action == "play":
        if state.energy < R.PLAY_MIN_ENERGY:
            return "too_tired"
        state.happiness = _clamp(state.happiness + R.PLAY_HAPPINESS)
        state.energy = _clamp(state.energy + R.PLAY_ENERGY)
        state.hunger = _clamp(state.hunger + R.PLAY_HUNGER)
        state.last_excite = now
        return OK

    if action == "clean":
        if not state.poops:
            return "already_clean"
        state.poops = []
        return OK

    if action == "medicine":
        if not state.sick:
            return "not_sick"
        state.sick = False
        state.health = _clamp(state.health + R.MEDICINE_HEALTH)
        state.happiness = _clamp(state.happiness + R.MEDICINE_HAPPINESS)
        state.recent_misses = []
        events.append({"type": "recovered"})
        return OK

    if action == "scold":
        if state.call is not None and state.call.reason == "fake":
            state.discipline = _clamp(state.discipline + R.SCOLD_DISCIPLINE)
            state.call = None
            events.append({"type": "call_answered", "reason": "fake"})
            return OK
        state.happiness = _clamp(state.happiness + R.SCOLD_UNFAIR_HAPPINESS)
        return "unfair"

    if action == "praise":
        if state.call is not None and state.call.reason == "fake":
            # Rewarding the whining teaches it to whine.
            state.discipline = _clamp(state.discipline + R.PRAISE_WHINING_DISCIPLINE)
            state.happiness = _clamp(state.happiness + R.PRAISE_HAPPINESS)
            state.call = None
            return "spoiled"
        state.happiness = _clamp(state.happiness + R.PRAISE_HAPPINESS)
        if now - state.last_praise >= R.PRAISE_COOLDOWN_MINUTES * 60:
            state.discipline = _clamp(state.discipline + R.PRAISE_DISCIPLINE)
        state.last_praise = now
        state.last_excite = now
        return OK

    raise ValueError(f"unknown action {action}")


def _resolve_call(state: PetState, now: float, events: list[Event]) -> None:
    call = state.call
    if call is not None and not _call_condition(state, call.reason, now):
        state.call = None
        events.append({"type": "call_answered", "reason": call.reason})


def set_lights_out(
    state: PetState, on: bool, now: float, settings: Settings
) -> list[Event]:
    """Flip the lights-out switch. The caller advances the pet to now first.

    The switch is the top authority for sleep: on puts the pet to bed (a nap
    outside sleep hours), off wakes it. Waking it during sleep hours costs a
    little happiness.
    """
    events: list[Event] = []
    if on == state.lights_out and on == state.asleep:
        return events
    state.lights_out = on
    if state.away:
        return events
    if life_stage(state) == "egg":
        return events  # remembered: the hatchling goes straight to sleep
    if on and not state.asleep:
        _fall_asleep(state, not in_sleep_hours(now, settings), events, now, settings)
    elif not on and state.asleep:
        night = in_sleep_hours(now, settings)
        if night:
            state.happiness = _clamp(state.happiness + R.WAKE_IN_NIGHT_HAPPINESS)
            state.stayed_up_since = now
            state.kept_up_until = now + R.FALL_ASLEEP_ANYWAY_MINUTES * 60
        _wake(state, events)
    return events


# --- Mood -------------------------------------------------------------------


def mood(state: PetState, now: float, settings: Settings) -> tuple[str, list[str], str]:
    """Resolve (mood, active flags, short reason) by fixed priority."""
    flags: list[str] = []
    if state.away:
        flags.append("away")
    if life_stage(state) == "egg":
        flags.append("egg")
    if state.sick:
        flags.append("sick")
    if state.asleep:
        flags.append("asleep")
    if state.call is not None:
        flags.append("calling")
    if state.hunger < R.HUNGRY_BELOW:
        flags.append("hungry")
    if state.poops:
        flags.append("dirty")
    drowsy = not state.asleep and (
        in_sleep_hours(now, settings)
        or minutes_to_bedtime(now, settings) <= R.DROWSY_BEFORE_BED_MINUTES
    )
    if state.energy < R.SLEEPY_BELOW or drowsy:
        flags.append("sleepy")
    if state.happiness < R.BORED_BELOW:
        flags.append("bored")
    home = [f for f in settings.home.flags if f not in flags]
    if now < state.cozy_until:
        home.append("cozy")
    if now < state.cool_until:
        home.append("cool")
    if state.cozy_until > now:
        home = [f for f in home if f not in ("rainy", "chilly")]  # tucked in now
    if state.cool_until > now:
        home = [f for f in home if f != "warm"]
    if not state.asleep:
        flags += [f for f in home if f not in flags]
    if now - state.last_excite < R.EXCITED_MINUTES * 60 or EXCITED_FLAGS & set(flags):
        flags.append("excited")
    if COZY_FLAGS & set(flags):
        flags.append("cozy")

    current = next((m for m in MOODS if m in flags), "content")
    reason = _reason(state, current, drowsy)
    if current in ("content", "cozy", "excited", "sleepy", "bored") and not (
        now - state.last_excite < R.EXCITED_MINUTES * 60
    ):
        # Say what the house is doing, so the connection is visible.
        effect = HomeEffect(flags=[f for f in flags if f in home])
        reason = effect.reason() or reason
    return current, flags, reason


_CALL_REASONS = {
    "sick": "feeling sick, medicine please?",
    "hunger": "tummy rumbling!",
    "dirty": "it's getting stinky in here",
    "energy": "so tired... lights out?",
    "happiness": "play with me?",
    "fake": "play with me?",
}

_MOOD_REASONS = {
    "away": "at the sitter's",
    "egg": "wiggling in its shell",
    "sick": "feeling sick",
    "asleep": "zzz",
    "hungry": "a little peckish",
    "dirty": "someone should tidy up",
    "bored": "nothing to do",
    "excited": "that was fun!",
    "cozy": "nice and cozy",
    "content": "all good",
}


def _reason(state: PetState, current: str, drowsy: bool) -> str:
    if current == "calling" and state.call is not None:
        return _CALL_REASONS[state.call.reason]
    if current == "sleepy":
        return "getting late, eyes drooping" if drowsy else "running low on energy"
    return _MOOD_REASONS.get(current, "")
