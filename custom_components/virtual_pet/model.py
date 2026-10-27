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

STATS = ("hunger", "happiness", "energy", "health", "discipline", "weight")

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

UPBRINGINGS = tuple(name for name, _ in R.UPBRINGING_GRADES)

# Results an action can come back with. "ok" means it did something.
OK = "ok"


@dataclass
class Call:
    """An attention call the player has CALL_WINDOW_MINUTES to answer."""

    reason: str  # one of CALL_PRIORITY, or "fake"
    started: float
    deadline: float


@dataclass
class Game:
    """A left/right guessing game in progress (the card's play button)."""

    started: float
    last_at: float  # the last guess; an idle game is dropped
    rounds: int = 0
    wins: int = 0


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
    weight: float = R.WEIGHT_START
    poops: list[float] = field(default_factory=list)  # when each one appeared
    digesting: list[float] = field(default_factory=list)  # when each is due
    sick: bool = False
    asleep: bool = False
    napping: bool = False  # asleep outside sleep hours
    lights_out: bool = False
    lights_before_away: bool | None = None  # flipped while away: applied on return
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
    egg_choice: str | None = None  # the species the next hatch takes; None: a surprise
    raised: list[str] = field(default_factory=list)  # species this device has hatched
    traits: list[str] = field(default_factory=list)  # learned, in order (TRAITS)
    trait_levels: dict[str, int] = field(default_factory=dict)  # 1-3 per trait
    inherited: dict[str, int] = field(default_factory=dict)  # not yet relearned
    inherited_from: str | None = None  # the trait handed down at hatching
    generation: int = 1  # the device's first pet is generation 1
    journal: list[dict[str, Any]] = field(default_factory=list)  # retired parents
    notify_users: list[str] = field(default_factory=list)  # HA user IDs, opted in
    trait_hours: dict[str, float] = field(default_factory=dict)  # exposure, awake
    upbringing: str | None = None  # decided on reaching adulthood (UPBRINGINGS)
    game: Game | None = None
    treats_waiting: int = 0  # chore treats it gets when it's next awake and home
    chore_treats: list[float] = field(default_factory=list)  # when each was earned
    firsts: dict[str, str] = field(default_factory=dict)  # kind -> season it was seen
    memories: list[dict[str, Any]] = field(default_factory=list)  # for the journal

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
        seen = dict(kwargs.get("trait_hours") or {})
        if "music" in seen:  # 0.9-0.11 counted music hours under this name
            seen["dancing"] = seen.get("dancing", 0.0) + seen.pop("music")
            kwargs["trait_hours"] = seen
        call = kwargs.get("call")
        if call is not None:
            call_keys = {f.name for f in fields(Call)}
            call = {k: v for k, v in call.items() if k in call_keys}
            kwargs["call"] = Call(**call) if call.get("reason") in reasons else None
        game = kwargs.get("game")
        if game is not None:
            game_keys = {f.name for f in fields(Game)}
            try:
                kwargs["game"] = Game(
                    **{k: v for k, v in game.items() if k in game_keys}
                )
            except TypeError:
                kwargs["game"] = None
        if not isinstance(kwargs.get("egg_choice"), str):
            kwargs["egg_choice"] = None
        if kwargs.get("upbringing") not in UPBRINGINGS:
            kwargs["upbringing"] = None
        state = cls(**kwargs)
        if state.upbringing is None and life_stage(state) == "adult":
            # Grew up before upbringings existed: judge it on its record so far.
            state.upbringing = upbringing(state)
        return state

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
    state.chore_treats = [t + delta for t in state.chore_treats]
    if state.game is not None:
        state.game.started += delta
        state.game.last_at += delta
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
        changed: Event = {"type": "stage_changed", "stage": stage, "from": was_stage}
        if stage == "adult":
            state.upbringing = upbringing(state)
            changed["upbringing"] = state.upbringing
        events.append(changed)
    if stage == "egg":
        return

    if state.game and t1 - state.game.last_at >= R.GAME_IDLE_MINUTES * 60:
        state.game = None  # nobody finished it
    _sleep(state, t1, settings, events)
    _give_treats(state, t1, events)
    _learn(state, hours, t1, settings, events)
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
    """The egg decides: the owner's choice if it's on the roster, otherwise a
    surprise, preferring species not raised here yet."""
    if state.species is None:
        if state.egg_choice in settings.roster:
            state.species = state.egg_choice
        else:
            fresh = [s for s in settings.roster if s not in state.raised]
            state.species = rng.choice(fresh or list(settings.roster))
    state.egg_choice = None  # each choice is for one egg
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
                _wake(state, events, "rested")
            return
        if state.wake_at is None:
            state.wake_at = next_wake(t, settings)
        if t >= state.wake_at:
            _wake(state, events, "morning")
        return
    if state.energy <= R.COLLAPSE_ENERGY:
        # Worn out: it drops off where it stands. A nap by day, the night's
        # sleep at night. No penalty; the energy call before this was the warning.
        _fall_asleep(state, not night, events, t, settings, "collapsed")
        return
    if (
        settings.home.dark_and_quiet
        and t >= state.kept_up_until
        and (night or minutes_to_bedtime(t, settings) <= R.HOME_BEDTIME_WINDOW_MINUTES)
    ):
        # Bedtime lights off and the house quiet: off to bed. (The house can put
        # the pet to sleep, never wake it.)
        _fall_asleep(state, False, events, t, settings, "house")
        return
    if not night:
        state.stayed_up_since = None
        return
    if state.stayed_up_since is None:
        state.stayed_up_since = t
    elif t - state.stayed_up_since >= _stay_up_minutes(state) * 60:
        # Nobody turned the lights out; it dozes off anyway. No penalty.
        _fall_asleep(state, False, events, t, settings, "dozed")


def _fall_asleep(
    state: PetState,
    napping: bool,
    events: list[Event],
    t: float,
    settings: Settings,
    how: str = "lights",
) -> None:
    """how: "lights" (put to bed), "house" (dark and quiet), "dozed" (stayed
    up too long) or "collapsed" (out of energy)."""
    state.asleep = True
    state.napping = napping
    state.game = None
    state.stayed_up_since = None
    state.wake_at = None if napping else next_wake(t, settings)
    if state.call is not None:
        if state.call.reason == "energy":
            events.append({"type": "call_answered", "reason": "energy"})
        else:
            # Calls pause for sleep; it will ask again after waking.
            _unlatch(state, state.call.reason)
        state.call = None
    events.append({"type": "fell_asleep", "napping": napping, "how": how})


def _wake(state: PetState, events: list[Event], how: str) -> None:
    """how: "morning" (wake time), "rested" (a nap ended), "lights" (woken by
    hand) or "night" (woken by hand during sleep hours, which costs a little)."""
    state.asleep = False
    state.napping = False
    state.lights_out = False
    state.wake_at = None
    events.append({"type": "woke_up", "how": how})


def _decay(state: PetState, hours: float, t: float, settings: Settings) -> None:
    # A devoted adult keeps itself fed and busy better.
    easy = R.DEVOTED_DECAY_FACTOR if state.upbringing == "devoted" else 1.0
    if state.asleep:
        state.hunger -= R.HUNGER_DECAY * R.ASLEEP_HUNGER_FACTOR * easy * hours
        state.happiness -= R.HAPPINESS_DECAY * R.ASLEEP_HAPPINESS_FACTOR * hours
        state.energy += R.ENERGY_REGEN_ASLEEP * hours
    else:
        state.hunger -= R.HUNGER_DECAY * easy * hours
        state.happiness -= R.HAPPINESS_DECAY * easy * hours
        state.energy -= R.ENERGY_DECAY * hours
        state.discipline -= R.DISCIPLINE_DECAY * hours
        state.weight -= R.WEIGHT_BURN * hours

    # The house only ever adds, and never more than the cap per stat.
    if not state.asleep:
        bonus = dict(settings.home.bonus)
        if t < state.cozy_until or t < state.cool_until:
            bonus["happiness"] = bonus.get("happiness", 0.0) + R.COMFORT_HAPPINESS
        for stat, rate in _trait_bonus(state, t, settings).items():
            bonus[stat] = bonus.get(stat, 0.0) + rate
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
        state.weight += R.WEIGHT_STARVING * hours
    health_rate += R.HEALTH_PER_OLD_POOP * old_poops
    if (
        not state.sick
        and not state.poops
        and state.hunger >= R.HEALTHY_HUNGER_MIN
        and weight_band(state) == "healthy"
    ):
        health_rate += R.HEALTH_REGEN
    state.health += health_rate * hours

    for stat in STATS:
        setattr(state, stat, _clamp(getattr(state, stat)))
    state.health = max(state.health, R.HEALTH_FLOOR)


def weight_band(state: PetState) -> str:
    """'light', 'healthy' or 'heavy'."""
    if state.weight > R.WEIGHT_HEAVY_ABOVE:
        return "heavy"
    if state.weight < R.WEIGHT_LIGHT_BELOW:
        return "light"
    return "healthy"


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
        elif weight_band(state) == "heavy" and rng.random() < 1 - math.exp(
            -R.WEIGHT_HEAVY_SICK_HAZARD * hours
        ):
            cause = "weight"
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
        -whine_rate(state) * hours
    ):
        _start_call(state, "fake", t, events)


def whine_rate(state: PetState) -> float:
    """Fake calls per awake hour: discipline makes them rarer, a scrappy
    upbringing more common."""
    rate = R.FAKE_CALL_RATE * (
        1 - R.FAKE_CALL_DISCIPLINE_DAMPING * state.discipline / 100
    )
    if state.upbringing == "scrappy":
        rate *= R.SCRAPPY_WHINE_FACTOR
    return rate


def _wants_to_whine(state: PetState) -> bool:
    return (
        not state.sick
        and not state.poops
        and all(
            getattr(state, s) > R.FAKE_CALL_MIN_STATS
            for s in ("hunger", "happiness", "energy", "health")
        )
    )


# --- Traits -----------------------------------------------------------------

TRAITS = (
    "night_owl",
    "music_lover",
    "homebody",
    *R.TRAIT_FLAG_HOURS,
)
# While its flag is up, each flag trait adds this much happiness per hour (at ★).
_FLAG_TRAIT_HAPPINESS = {
    "music_lover": ("dancing", R.HOME_MUSIC_HAPPINESS),
    "sun_lover": ("sunny", R.HOME_SUN_HAPPINESS),
    "fireside": ("fireside", R.HOME_FIRE_HAPPINESS),
    "moon_child": ("full_moon", R.HOME_MOON_HAPPINESS),
    "storm_watcher": ("rainy", R.TRAIT_HAPPINESS),
    "couch_potato": ("watching_tv", R.TRAIT_HAPPINESS),
    "social_butterfly": ("greeting", 2 * R.TRAIT_HAPPINESS),
}


def trait_level(state: PetState, trait: str) -> int:
    """★ to ★★★; 0 if the pet doesn't have the trait."""
    return state.trait_levels.get(trait, 1) if trait in state.traits else 0


def _scale(state: PetState, trait: str) -> float:
    return R.TRAIT_LEVEL_SCALE.get(trait_level(state, trait), 0.0)


def _learn(
    state: PetState, hours: float, t: float, settings: Settings, events: list[Event]
) -> None:
    """Count what the pet lives through while awake; past a threshold it's a trait.

    Learning a trait it inherited (and hasn't relearned yet) deepens it one level.
    """
    if state.asleep:
        return
    seen = state.trait_hours
    seen["awake"] = seen.get("awake", 0.0) + hours
    if in_sleep_hours(t, settings):
        seen["night"] = seen.get("night", 0.0) + hours
    if settings.home.company:
        seen["company"] = seen.get("company", 0.0) + hours
    for flag in {"dancing", *(f for f, _ in R.TRAIT_FLAG_HOURS.values())}:
        if flag in settings.home.flags:
            seen[flag] = seen.get(flag, 0.0) + hours
    for trait, progress in trait_progress(state).items():
        if progress < 1.0:
            continue
        if trait in state.inherited:
            level = min(state.inherited.pop(trait) + 1, R.TRAIT_MAX_LEVEL)
            state.trait_levels[trait] = level
            events.append({"type": "trait_deepened", "trait": trait, "level": level})
        elif trait not in state.traits:
            state.traits.append(trait)
            state.trait_levels[trait] = 1
            events.append({"type": "trait_learned", "trait": trait, "level": 1})


def trait_progress(state: PetState) -> dict[str, float]:
    """How close the pet is to learning each trait in its own life, 0 to 1.

    An inherited trait shows its own progress until the pet relearns it.
    """
    seen = state.trait_hours
    awake = seen.get("awake", 0.0)
    share = seen.get("company", 0.0) / awake if awake else 0.0
    progress = {
        "night_owl": seen.get("night", 0.0) / R.TRAIT_NIGHT_OWL_HOURS,
        "music_lover": seen.get("dancing", 0.0) / R.TRAIT_MUSIC_LOVER_HOURS,
        "homebody": min(
            share / R.TRAIT_HOMEBODY_SHARE, awake / R.TRAIT_HOMEBODY_MIN_AWAKE_HOURS
        ),
    }
    for trait, (flag, needed) in R.TRAIT_FLAG_HOURS.items():
        progress[trait] = seen.get(flag, 0.0) / needed
    return {
        t: 1.0
        if t in state.traits and t not in state.inherited
        else round(min(p, 1.0), 3)
        for t, p in progress.items()
    }


def _trait_bonus(state: PetState, t: float, settings: Settings) -> dict[str, float]:
    """Small extra happiness per hour from what the pet has come to love."""
    happiness = 0.0
    if in_sleep_hours(t, settings):
        happiness += R.TRAIT_HAPPINESS * _scale(state, "night_owl")
    if settings.home.company:
        happiness += R.TRAIT_HAPPINESS * _scale(state, "homebody")
    for trait, (flag, rate) in _FLAG_TRAIT_HAPPINESS.items():
        if flag in settings.home.flags:
            happiness += rate * _scale(state, trait)
    return {"happiness": happiness} if happiness else {}


def _stay_up_minutes(state: PetState) -> float:
    """A night owl stays up twice as long before dozing off (more at ★★, ★★★)."""
    extra = (R.NIGHT_OWL_STAY_UP_FACTOR - 1) * _scale(state, "night_owl")
    return R.FALL_ASLEEP_ANYWAY_MINUTES * (1 + extra)


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
    """What the pet is asking for (the house's requests, minus what it got),
    then "lay_egg" once it's ready to start the next generation."""
    satisfied = {"blanket": now < state.cozy_until, "fan": now < state.cool_until}
    if state.asleep or state.away or life_stage(state) == "egg":
        return []
    wanted = [r for r in settings.home.requests if not satisfied.get(r)]
    if can_lay_egg(state):
        wanted.append("lay_egg")
    return wanted


# --- Upbringing ---------------------------------------------------------------


def upbringing_score(state: PetState) -> float:
    """0-100 from how it was raised: care misses cost the most, discipline helps."""
    care = max(0.0, 100.0 - R.UPBRINGING_MISS_COST * state.care_misses)
    weight = R.UPBRINGING_CARE_WEIGHT
    return weight * care + (1 - weight) * state.discipline


def upbringing(state: PetState) -> str:
    """The adult's upbringing, or the one it's on track for while growing up."""
    if state.upbringing is not None:
        return state.upbringing
    score = upbringing_score(state)
    return next(name for name, low in R.UPBRINGING_GRADES if score >= low)


# --- Generations --------------------------------------------------------------


def can_lay_egg(state: PetState) -> bool:
    """A week into adulthood the owner may start the next generation, unless the
    pet is sick or away."""
    adult = dict(R.STAGE_STARTS)["adult"]
    return (
        not state.away
        and not state.sick
        and state.age_hours >= adult + R.LAY_EGG_AFTER_ADULT_HOURS
    )


def lay_egg(
    state: PetState, now: float, rng: random.Random
) -> tuple[PetState, list[Event]]:
    """The adult retires to the journal and leaves an egg with one of its traits."""
    if not can_lay_egg(state):
        return state, []
    record = {
        "generation": state.generation,
        "name": state.name,
        "species": state.species,
        "traits": list(state.traits),
        "levels": {t: trait_level(state, t) for t in state.traits},
        "inherited": state.inherited_from,
        "born": state.born,
        "retired": now,
        "age_days": round(state.age_hours / 24, 1),
        "care_misses": state.care_misses,
        "upbringing": upbringing(state),
    }
    egg = PetState.new(state.name, now)
    egg.generation = state.generation + 1
    egg.raised = list(state.raised)
    egg.egg_choice = state.egg_choice  # chosen before laying: for this egg
    egg.journal = [*state.journal, record]
    egg.notify_users = list(state.notify_users)
    egg.firsts = dict(state.firsts)  # the household's season, not the pet's
    egg.memories = list(state.memories)
    inherited = rng.choice(state.traits) if state.traits else None
    if inherited:
        level = trait_level(state, inherited)
        if upbringing(state) == "devoted":
            # A devoted parent hands its trait down one level deeper.
            level = min(level + 1, R.TRAIT_MAX_LEVEL)
        egg.traits = [inherited]
        egg.trait_levels = {inherited: level}
        egg.inherited = {inherited: level}
        egg.inherited_from = inherited
    return egg, [
        {
            "type": "egg_laid",
            "generation": egg.generation,
            "parent_species": state.species,
            "inherited_trait": inherited,
            "level": egg.trait_levels.get(inherited) if inherited else None,
        }
    ]


def action_available(
    state: PetState, action: str, now: float = 0.0, settings: Settings | None = None
) -> bool:
    """Whether the button for an action should be available."""
    if action == "medicine":
        return state.sick
    if action in REQUEST_ACTIONS:
        return settings is not None and action in requests(state, now, settings)
    if action == "lay_egg":
        return can_lay_egg(state)
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
    _log(state, {"at": now, "action": action, "by": by, "result": result})
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
        state.weight = _clamp(state.weight + R.WEIGHT_FEED)
        jitter = rng.uniform(-R.DIGEST_JITTER_MINUTES, R.DIGEST_JITTER_MINUTES)
        state.digesting.append(now + (R.DIGEST_MINUTES + jitter) * 60)
        return OK

    if action == "snack":
        state.hunger = _clamp(state.hunger + R.SNACK_HUNGER)
        state.happiness = _clamp(state.happiness + R.SNACK_HAPPINESS)
        state.weight = _clamp(state.weight + R.WEIGHT_SNACK)
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
        state.weight = _clamp(state.weight + R.WEIGHT_PLAY)
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


def _log(state: PetState, entry: dict[str, Any]) -> None:
    state.care_log.insert(0, entry)
    del state.care_log[R.CARE_LOG_SIZE :]


# --- The left/right game ------------------------------------------------------

SIDES = ("left", "right")


def play_game(
    state: PetState,
    guess: str,
    now: float,
    rng: random.Random,
    by: str | None = None,
) -> tuple[dict[str, Any], list[Event]]:
    """One round: the pet hides left or right, the player guesses.

    The first guess starts a game of GAME_ROUNDS rounds; the last one settles it.
    The caller advances the pet to now first. Returns what the card needs to
    draw the round, and events.
    """
    if guess not in SIDES:
        raise ValueError(f"unknown side {guess}")
    events: list[Event] = []
    game = state.game
    if game is None:
        refusal = _refuse_play(state)
        if refusal:
            _log(state, {"at": now, "action": "game", "by": by, "result": refusal})
            events.append({"type": "care", "action": "game", "result": refusal})
            return {"result": refusal}, events
        game = state.game = Game(started=now, last_at=now)
    went = rng.choice(SIDES)
    game.rounds += 1
    game.wins += went == guess
    game.last_at = now
    info: dict[str, Any] = {
        "result": OK,
        "round": game.rounds,
        "rounds": R.GAME_ROUNDS,
        "wins": game.wins,
        "went": went,
        "correct": went == guess,
        "done": game.rounds >= R.GAME_ROUNDS,
    }
    if not info["done"]:
        return info, events
    state.game = None
    won = game.wins >= R.GAME_WIN_AT
    happiness = R.GAME_WIN_HAPPINESS if won else R.GAME_LOSE_HAPPINESS
    state.happiness = _clamp(state.happiness + happiness)
    state.energy = _clamp(state.energy + R.PLAY_ENERGY)
    state.hunger = _clamp(state.hunger + R.PLAY_HUNGER)
    state.weight = _clamp(state.weight + R.WEIGHT_GAME)
    state.last_excite = now
    result = "won" if won else "lost"
    info["won"] = won
    score = f"{game.wins}/{game.rounds}"
    _log(
        state, {"at": now, "action": "game", "by": by, "result": result, "score": score}
    )
    events.append({"type": "care", "action": "game", "result": result})
    events.append({"type": "game_finished", "won": won, "wins": game.wins})
    _resolve_call(state, now, events)
    return info, events


def _refuse_play(state: PetState) -> str | None:
    if state.away:
        return "away"
    if life_stage(state) == "egg":
        return "egg"
    if state.asleep:
        return "asleep"
    if state.energy < R.PLAY_MIN_ENERGY:
        return "too_tired"
    return None


# --- Seasonal firsts -----------------------------------------------------------

MEMORIES_KEPT = 30


def season_first(state: PetState, kind: str, now: float, tz: tzinfo) -> list[Event]:
    """The first snow (or frost) of the season: a moment once per winter, kept as
    a memory in the journal. A winter runs from July to June."""
    local = datetime.fromtimestamp(now, tz)
    season = str(local.year if local.month >= 7 else local.year - 1)
    if state.firsts.get(kind) == season:
        return []
    state.firsts[kind] = season
    state.memories.append({"kind": f"first_{kind}", "at": now})
    del state.memories[:-MEMORIES_KEPT]
    return [{"type": f"first_{kind}"}]


# --- Chores -------------------------------------------------------------------


def chores_done(state: PetState, count: int, now: float) -> int:
    """Someone finished to-do items: earn treats, up to the daily limit.

    They wait until the pet is awake and home (see _give_treats). Returns how
    many were earned.
    """
    day = 24 * 3600
    state.chore_treats = [t for t in state.chore_treats if now - t < day]
    earned = max(0, min(count, R.CHORE_TREATS_PER_DAY - len(state.chore_treats)))
    state.chore_treats += [now] * earned
    state.treats_waiting = min(state.treats_waiting + earned, R.CHORE_TREATS_WAITING)
    return earned


def give_treats(state: PetState, now: float) -> list[Event]:
    """Hand over waiting chore treats now, if the pet can take them."""
    events: list[Event] = []
    if not state.away and life_stage(state) != "egg":
        _give_treats(state, now, events)
    return events


def _give_treats(state: PetState, t: float, events: list[Event]) -> None:
    if state.asleep or not state.treats_waiting:
        return
    for _ in range(state.treats_waiting):
        state.hunger = _clamp(state.hunger + R.CHORE_TREAT_HUNGER)
        state.happiness = _clamp(state.happiness + R.CHORE_TREAT_HAPPINESS)
        state.weight = _clamp(state.weight + R.WEIGHT_CHORE_TREAT)
        _log(state, {"at": t, "action": "chore_treat", "by": None, "result": OK})
        events.append({"type": "chore_treat"})
    state.treats_waiting = 0
    state.last_excite = t
    _resolve_call(state, t, events)


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
    if state.away:
        if state.lights_before_away is None:
            state.lights_before_away = state.lights_out
        state.lights_out = on  # applied when it comes home
        return events
    state.lights_out = on
    _apply_lights(state, now, settings, events)
    return events


def come_home(state: PetState, now: float, settings: Settings) -> list[Event]:
    """Back from the sitter's: apply a lights-out flip made while it was away."""
    events: list[Event] = []
    before, state.lights_before_away = state.lights_before_away, None
    if before is not None and before != state.lights_out:
        _apply_lights(state, now, settings, events)
    return events


def _apply_lights(
    state: PetState, now: float, settings: Settings, events: list[Event]
) -> None:
    on = state.lights_out
    if life_stage(state) == "egg":
        return  # remembered: the hatchling goes straight to sleep
    if on and not state.asleep:
        _fall_asleep(state, not in_sleep_hours(now, settings), events, now, settings)
    elif not on and state.asleep:
        night = in_sleep_hours(now, settings)
        if night:
            state.happiness = _clamp(state.happiness + R.WAKE_IN_NIGHT_HAPPINESS)
            state.stayed_up_since = now
            state.kept_up_until = now + R.FALL_ASLEEP_ANYWAY_MINUTES * 60
        _wake(state, events, "night" if night else "lights")


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
    if (band := weight_band(state)) != "healthy":
        flags.append(band)
    home = [f for f in settings.home.flags if f not in flags]
    if now < state.cozy_until:
        home.append("cozy")
    if now < state.cool_until:
        home.append("cool")
    if state.cozy_until > now:
        home = [f for f in home if f not in ("rainy", "chilly", "storm")]  # tucked in
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
        # The pet's own body comes before what the house is doing.
        reason = _WEIGHT_REASONS.get(weight_band(state), reason)
    return current, flags, reason


_WEIGHT_REASONS = {
    "heavy": "feeling a bit round...",
    "light": "could use a proper meal",
}


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
