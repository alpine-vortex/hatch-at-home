"""The pet itself: state, the passage of time, and care actions.

Pure Python with no Home Assistant imports, so the time math can be tested
directly. Times are UTC epoch seconds (floats). The coordinator owns one
PetState, calls advance() on every tick and apply_action() for care, and fires
whatever events these return.
"""

from __future__ import annotations

import calendar
import copy
from dataclasses import asdict, dataclass, field, fields
from datetime import UTC, date, datetime, time, timedelta, tzinfo
import math
import random
from typing import Any

from . import rates as R
from .home import COZY_FLAGS, EXCITED_FLAGS, REASONS, HomeEffect

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
NOT_SLEEPY = "not_sleepy"
LIGHTS_OUT = "lights_out"


class DamagedSave(ValueError):
    """A save whose root isn't a pet at all (a string, a number, a list)."""


def is_pet_root(data: Any) -> bool:
    """A save root a pet can be read from: an object, or one in a list."""
    return isinstance(data, dict) or (
        isinstance(data, list) and len(data) == 1 and isinstance(data[0], dict)
    )


# --- Reading a save that may be damaged --------------------------------------
# Each known key is type-checked or defaulted; a wrong type never stops a load.

# PR 0e's timestamps: each moves with shift_times, none later than the save.
UPBRINGING_TIMES = (
    "last_sample_at",
    "miss_day_at",
    "last_care_at",
    "praised_care",
    "praise_window_at",
    "praise_day_at",
)
_FLOATS = {
    "age_hours": 0.0,
    "hunger": 80.0,
    "happiness": 80.0,
    "energy": 80.0,
    "health": 100.0,
    "discipline": 0.0,
    "weight": R.WEIGHT_START,
    "kept_up_until": 0.0,
    "cozy_until": 0.0,
    "cool_until": 0.0,
    "last_excite": 0.0,
    "last_recall_at": 0.0,
    "discipline_sum": 0.0,
    "wellbeing_sum": 0.0,
    **{key: 0.0 for key in UPBRINGING_TIMES},
}
_RANGES = {
    "age_hours": (0.0, math.inf),
    **{s: (0.0, 100.0) for s in STATS},
    "discipline_sum": (0.0, math.inf),
    "wellbeing_sum": (0.0, math.inf),
}
_INTS = {  # key: (default, lowest)
    "care_misses": (0, 0),
    "discipline_misses": (0, 0),
    "generation": (1, 1),
    "treats_waiting": (0, 0),
    "discipline_samples": (0, 0),
    "wellbeing_samples": (0, 0),
    "counted_misses": (0, 0),
    "miss_day_count": (0, 0),
    "praise_count": (0, 0),
    "praise_day_count": (0, 0),
}


def _num(v: Any) -> bool:
    """A finite number (not a bool)."""
    return isinstance(v, int | float) and not isinstance(v, bool) and math.isfinite(v)


def _str(v: Any) -> bool:
    return isinstance(v, str)


def _float(v: Any, default: Any, low: float = -math.inf, high: float = math.inf) -> Any:
    return float(min(max(v, low), high)) if _num(v) else default


def _int(v: Any, default: int, low: int | None = None) -> int:
    if not _num(v):
        return default
    return int(v) if low is None else max(low, int(v))


def _opt_str(v: Any) -> str | None:
    return v if isinstance(v, str) else None


def _mapping(v: Any) -> dict[Any, Any]:
    return v if isinstance(v, dict) else {}


def _numbers(v: Any) -> list[float]:
    return [float(x) for x in v if _num(x)] if isinstance(v, list) else []


def _strings(v: Any) -> list[str]:
    return [x for x in v if isinstance(x, str)] if isinstance(v, list) else []


def _str_map(v: Any) -> dict[str, str]:
    return {k: x for k, x in _mapping(v).items() if _str(k) and _str(x)}


def _int_map(v: Any) -> dict[str, int]:
    return {k: int(x) for k, x in _mapping(v).items() if _str(k) and _num(x)}


def _float_map(v: Any) -> dict[str, float]:
    return {k: float(x) for k, x in _mapping(v).items() if _str(k) and _num(x)}


def _records(v: Any, **need: Any) -> list[dict[str, Any]]:
    """The dicts in a list that carry what their readers index."""
    if not isinstance(v, list):
        return []
    return [
        r
        for r in v
        if isinstance(r, dict) and all(check(r.get(k)) for k, check in need.items())
    ]


def _retired(record: dict[str, Any]) -> dict[str, Any]:
    """A journal record (a retired parent) with the shapes the card reads."""
    out = dict(record)
    out["traits"] = _strings(record.get("traits"))
    out["levels"] = _int_map(record.get("levels"))
    if out.get("upbringing", UPBRINGINGS[0]) not in UPBRINGINGS:
        del out["upbringing"]  # damaged: not shown
    out["games"] = {
        k: c for k, c in _mapping(record.get("games")).items() if isinstance(c, dict)
    }
    return out


def _game(v: Any) -> Game | None:
    """A game in progress, or None if it's damaged or a kind this version
    doesn't know."""
    if not isinstance(v, dict) or v.get("kind", "left_right") not in GAMES:
        return None
    if not (_num(v.get("started")) and _num(v.get("last_at"))):
        return None
    number = v.get("number")
    if v.get("kind") == "higher_lower" and not (
        _num(number) and int(number) in NUMBERS
    ):
        return None  # nothing to guess against
    return Game(
        started=float(v["started"]),
        last_at=float(v["last_at"]),
        rounds=_int(v.get("rounds"), 0, 0),
        wins=_int(v.get("wins"), 0, 0),
        kind=v.get("kind", "left_right"),
        number=int(number) if _num(number) else None,
    )


def _bond(bond: dict[str, Any]) -> dict[str, Any]:
    """One bond as loaded: every key in use type-checked, a damaged one
    dropped; keys this version doesn't know kept as they are."""
    out = dict(bond)
    points = bond.get("points")
    if isinstance(points, str) and points.strip().lstrip("-").isdecimal():
        points = int(points)  # an old hand edit: "12"
    out["points"] = _int(points, 0)
    checks: dict[str, Any] = {
        "nickname": _str,
        "favourite": _str,
        "since": _str,
        "day": _str,
        "tucked_at": _num,
    }
    for key, check in checks.items():
        if key in out and not check(out[key]):
            del out[key]
    for key in ("games", "best"):
        if key in out:
            out[key] = _int_map(out[key])
    if "noted" in out:  # read only by != comparisons; "tucked" is a float
        out["noted"] = {
            k: x
            for k, x in _mapping(out["noted"]).items()
            if _str(k) and (_str(x) or _num(x))
        }
    if "today" in out:
        out["today"] = _int(out["today"], 0, 0)
    if "visited" in out:  # add_bond reads it without a default on the same day
        out["visited"] = out["visited"] is True
    if "photos" in out:
        out["photos"] = _photos(out["photos"])
    ask = out.get("catchphrase")
    if "catchphrase" in out and not (
        isinstance(ask, dict) and isinstance(ask.get("asked"), list)
    ):
        del out["catchphrase"]  # a broken question is asked afresh
    return out


def bonds_from(v: Any) -> dict[str, dict[str, Any]]:
    """Every bond that can be read; a damaged one is dropped alone."""
    out = {}
    for user, bond in _mapping(v).items():
        if not isinstance(bond, dict):
            continue
        try:
            out[str(user)] = _bond(bond)
        except Exception:  # noqa: BLE001 - one bad bond never costs the others
            continue
    return out


@dataclass
class Call:
    """An attention call the player has CALL_WINDOW_MINUTES to answer."""

    reason: str  # one of CALL_PRIORITY, or "fake"
    started: float
    deadline: float
    recall: bool = False  # a latched need asking again (RECALL_HOURS)


@dataclass
class Game:
    """A game in progress (the card's play button)."""

    started: float
    last_at: float  # the last guess; an idle game is dropped
    rounds: int = 0
    wins: int = 0
    kind: str = "left_right"  # one of GAMES
    number: int | None = None  # Higher or Lower: the number on show


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
    latched_at: dict[str, float] = field(default_factory=dict)  # last missed
    last_recall_at: float = 0.0  # one re-call clock per pet
    care_misses: int = 0
    discipline_misses: int = 0
    recent_misses: list[float] = field(default_factory=list)
    # Upbringing, sampled each waking hour from hatching to adulthood.
    discipline_sum: float = 0.0
    discipline_samples: int = 0
    wellbeing_sum: float = 0.0  # samples it was well (0 or 1 each)
    wellbeing_samples: int = 0
    last_sample_at: float = 0.0
    counted_misses: int = 0  # at most MISSES_COUNTED_PER_DAY a local day
    miss_day_at: float = 0.0  # the first miss of the day it's counting
    miss_day_count: int = 0
    # Grown before the score was reworked: the grade it had then, capped at
    # steady, until its first counted miss after (no pet drops a grade
    # because the rules changed).
    upbringing_floor: str | None = None
    last_care_at: float = 0.0  # care that met a need: praise after it teaches
    praised_care: float = 0.0  # the care praise last paid discipline for
    praise_window_at: float = 0.0  # the praise window began
    praise_count: int = 0  # presses in it
    praise_day_at: float = 0.0  # the first praise of the day it's counting
    praise_day_count: int = 0  # presses that gave happiness that day
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
    early_morning_on: str | None = None  # local date of the last early-bird morning
    temperament: dict[str, float] = field(default_factory=dict)  # trait -> factor
    upbringing: str | None = None  # decided on reaching adulthood (UPBRINGINGS)
    personality: str | None = None  # settled on becoming a teen (PERSONALITIES)
    game: Game | None = None
    # Higher or Lower's number on show when its game was dropped unguessed, and
    # when: the next start shows it again for OPENING_KEEP_MINUTES (no reroll).
    opening: int | None = None
    opening_at: float | None = None
    games: dict[str, dict[str, int]] = field(default_factory=dict)  # kind -> counts
    sick_unannounced: str | None = (
        None  # cause, if it fell sick asleep (told on waking)
    )
    treats_waiting: int = 0  # chore treats it gets when it's next awake and home
    chore_treats: list[float] = field(default_factory=list)  # when each was earned
    firsts: dict[str, str] = field(default_factory=dict)  # kind -> season it was seen
    memories: list[dict[str, Any]] = field(default_factory=list)  # for the journal
    # Daily check-ins: today's wish {kind, day, granted, by, at}; the day's
    # moments a dream can be about; this morning's dream {kind, title?, day}.
    wish: dict[str, Any] | None = None
    dream_seeds: list[dict[str, Any]] = field(default_factory=list)
    dream: dict[str, Any] | None = None
    # "What should I dream about tonight?": {user, pick, at}, used at the wake.
    dream_picks: list[dict[str, Any]] = field(default_factory=list)
    # HA user ID -> {points, day, today, visited, games, nickname?, favourite?}.
    # The household's, not the pet's: carried into the next generation.
    bonds: dict[str, dict[str, Any]] = field(default_factory=dict)
    # Its own favourites, picked once from its creature's likes: {"snack": ...}.
    favourites: dict[str, str] = field(default_factory=dict)
    favourite_said: str | None = None  # local date it last said so
    # What it says at the end of things, from a close friend (None: its own).
    catchphrase: str | None = None
    hatched_on: str | None = None  # local date it hatched: its birthday

    def to_dict(self) -> dict[str, Any]:
        """Serialize for the Store, with any keys this version doesn't know."""
        return {**getattr(self, "unknown", {}), **asdict(self)}

    @classmethod
    def from_dict(
        cls, data: Any, default_name: str = "Pet", now: float | None = None
    ) -> PetState:
        """Load from the Store: defaults for new keys, and every known key
        type-checked, so a damaged but readable save still loads. Keys this
        version doesn't know are kept for the next save (a downgrade keeps a
        later version's). A root that isn't a pet at all raises DamagedSave."""
        if not is_pet_root(data):
            raise DamagedSave(f"the save is a {type(data).__name__}, not a pet")
        if isinstance(data, list):
            data = data[0]  # one pet, wrapped in a list by a hand edit
        known = {f.name for f in fields(cls)}
        kwargs = {k: v for k, v in data.items() if k in known}
        unknown = {k: v for k, v in data.items() if k not in known}
        now = _float(now, 0.0) if now is not None else 0.0
        if not isinstance(kwargs.get("name"), str):
            kwargs["name"] = default_name
        for key, default in _FLOATS.items():
            kwargs[key] = _float(kwargs.get(key), default, *_RANGES.get(key, ()))
        kwargs["last_updated"] = _float(kwargs.get("last_updated"), now)
        kwargs["born"] = _float(
            kwargs.get("born"), kwargs["last_updated"] - kwargs["age_hours"] * 3600
        )
        for key, (default, low) in _INTS.items():
            kwargs[key] = _int(kwargs.get(key), default, low)
        for key in ("sick", "asleep", "napping", "lights_out", "away"):
            kwargs[key] = kwargs.get(key) is True
        if not isinstance(kwargs.get("lights_before_away"), bool):
            kwargs["lights_before_away"] = None
        for key in ("stayed_up_since", "wake_at"):
            kwargs[key] = _float(kwargs.get(key), None)
        for key in ("species", "inherited_from"):
            kwargs[key] = _opt_str(kwargs.get(key))
        for key in ("poops", "digesting", "recent_misses", "chore_treats"):
            kwargs[key] = _numbers(kwargs.get(key))
        for key in ("raised", "notify_users"):
            kwargs[key] = _strings(kwargs.get(key))
        kwargs["traits"] = [t for t in _strings(kwargs.get("traits")) if t in TRAITS]
        kwargs["care_log"] = _records(kwargs.get("care_log"), at=_num, action=_str)
        kwargs["journal"] = [_retired(r) for r in _records(kwargs.get("journal"))]
        kwargs["memories"] = _records(kwargs.get("memories"), at=_num, kind=_str)
        kwargs["dream_seeds"] = _records(kwargs.get("dream_seeds"), at=_num, kind=_str)
        kwargs["dream_picks"] = _records(
            kwargs.get("dream_picks"), user=_str, pick=_str, at=_num
        )
        kwargs["inherited"] = {
            t: n
            for t, n in _mapping(kwargs.get("inherited")).items()
            if isinstance(n, int) and not isinstance(n, bool)
        }
        kwargs["firsts"] = _str_map(kwargs.get("firsts"))
        for key in ("wish", "dream"):
            day = kwargs.get(key)
            ok = isinstance(day, dict) and all(
                isinstance(day.get(k), str) for k in ("kind", "day")
            )
            kwargs[key] = day if ok else None
        # Drop anything a newer or older version knew about and this one doesn't.
        reasons = set(CALL_PRIORITY) | {"fake"}
        # A whine never latches (only real needs do).
        kwargs["latched"] = [
            r for r in _strings(kwargs.get("latched")) if r in CALL_PRIORITY
        ]
        # A latch from before re-calls counts from the save's own clock, which
        # catch_up moves to the load: it may call again RECALL_HOURS after the
        # update (the release notes say so).
        # None later than the save itself: a damaged one can't hush re-calls.
        saved = kwargs["last_updated"]
        since = _float_map(kwargs.get("latched_at"))
        kwargs["latched_at"] = {
            r: min(since.get(r, saved), saved) for r in kwargs["latched"]
        }
        kwargs["last_recall_at"] = min(kwargs["last_recall_at"], saved)
        for key in UPBRINGING_TIMES:
            kwargs[key] = min(kwargs[key], saved)
        # A sum its samples couldn't reach is damaged: the average starts over.
        for key, most in (("discipline", 100.0), ("wellbeing", 1.0)):
            if kwargs[f"{key}_sum"] > most * kwargs[f"{key}_samples"]:
                kwargs[f"{key}_sum"], kwargs[f"{key}_samples"] = 0.0, 0
        floor = kwargs.get("upbringing_floor")
        kwargs["upbringing_floor"] = _capped(floor) if floor in UPBRINGINGS else None
        seen = {
            k: float(v)
            for k, v in _mapping(kwargs.get("trait_hours")).items()
            if _num(v)
        }
        if "music" in seen:  # 0.9-0.11 counted music hours under this name
            seen["dancing"] = seen.get("dancing", 0.0) + seen.pop("music")
        kwargs["trait_hours"] = seen
        call = kwargs.get("call")
        kwargs["call"] = None  # damaged or incomplete: the next tick calls again
        if isinstance(call, dict) and call.get("reason") in reasons:
            if _num(call.get("started")) and _num(call.get("deadline")):
                kwargs["call"] = Call(
                    call["reason"],
                    float(call["started"]),
                    float(call["deadline"]),
                    call.get("recall") is True,
                )
        kwargs["game"] = _game(kwargs.get("game"))
        opening, opening_at = (
            kwargs.get("opening"),
            _float(kwargs.get("opening_at"), None),
        )
        kwargs["opening"], kwargs["opening_at"] = (None, None)
        if _num(opening) and int(opening) in NUMBERS and opening_at is not None:
            kwargs["opening"], kwargs["opening_at"] = int(opening), opening_at
        kwargs["games"] = {
            kind: {
                k: int(n) if isinstance(n, int | float) else 0
                for k, n in {"played": 0, "won": 0, **counts}.items()
                if k in ("played", "won", "dropped")
            }
            for kind, counts in _mapping(kwargs.get("games")).items()
            if isinstance(counts, dict)
        }
        kwargs["temperament"] = {
            t: float(f)
            for t, f in _mapping(kwargs.get("temperament")).items()
            if t in TRAITS and _num(f)
        }
        kwargs["trait_levels"] = {
            t: n
            for t, n in _mapping(kwargs.get("trait_levels")).items()
            if isinstance(n, int) and not isinstance(n, bool) and 1 <= n <= 3
        }
        if not isinstance(kwargs.get("egg_choice"), str):
            kwargs["egg_choice"] = None
        if not isinstance(kwargs.get("early_morning_on"), str):
            kwargs["early_morning_on"] = None
        if kwargs.get("upbringing") not in UPBRINGINGS:
            kwargs["upbringing"] = None
        if kwargs.get("personality") not in PERSONALITIES:
            kwargs["personality"] = None
        kwargs["bonds"] = bonds_from(kwargs.get("bonds"))
        kwargs["favourites"] = _str_map(kwargs.get("favourites"))
        for key in (
            "favourite_said",
            "catchphrase",
            "hatched_on",
            "sick_unannounced",
        ):
            if not isinstance(kwargs.get(key), str):
                kwargs[key] = None
        try:
            if kwargs["hatched_on"]:
                date.fromisoformat(kwargs["hatched_on"])
        except ValueError:
            kwargs["hatched_on"] = None  # damaged: worked out again at load
        state = cls(**kwargs)
        unknown.pop("last_praise", None)  # replaced by the praise window (PR 0e)
        state.unknown = unknown
        if "discipline_samples" not in data and life_stage(state) != "egg":
            _migrate_upbringing(state)
        if state.upbringing is None and life_stage(state) == "adult":
            # Grew up before upbringings existed: judge it on its record so far.
            state.upbringing = upbringing(state)
            state.upbringing_floor = None
        if state.personality is None and life_stage(state) in ("teen", "adult"):
            # Became a teen before personalities existed: settled now, quietly.
            state.personality = personality_for(state)
        return state

    @classmethod
    def salvage(cls, data: Any, default_name: str, now: float) -> PetState:
        """What can still be read from a save from_dict couldn't load: its name,
        family, journal, memories and bonds, each on its own. The rest starts
        fresh, as a new egg's would. Never raises."""
        if not is_pet_root(data):
            data = {}
        elif isinstance(data, list):
            data = data[0]
        state = cls.new(default_name, now)
        if isinstance(data.get("name"), str):
            state.name = data["name"]
        readers: dict[str, Any] = {
            "generation": lambda v: _int(v, 1, 1),
            "species": _opt_str,
            "raised": _strings,
            "journal": lambda v: [_retired(r) for r in _records(v)],
            "memories": lambda v: _records(v, at=_num, kind=_str),
            "bonds": bonds_from,
        }
        for key, read in readers.items():
            try:
                setattr(state, key, read(data.get(key)))
            except Exception:  # noqa: BLE001 - salvage what can be, field by field
                continue
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
    wake_at stays: it's the morning's wake time on the wall clock, so a pet
    asleep across the freeze still wakes in the morning (or at once if the
    morning has passed), not hours late.
    """
    state.poops = [t + delta for t in state.poops]
    state.digesting = [t + delta for t in state.digesting]
    state.recent_misses = [t + delta for t in state.recent_misses]
    state.chore_treats = [t + delta for t in state.chore_treats]
    if state.game is not None:
        state.game.started += delta
        state.game.last_at += delta
    if state.opening_at is not None:
        state.opening_at += delta
    if state.call is not None:
        state.call.started += delta
        state.call.deadline += delta
    if state.stayed_up_since is not None:
        state.stayed_up_since += delta
    state.latched_at = {r: at + delta for r, at in state.latched_at.items()}
    state.last_recall_at += delta
    for key in UPBRINGING_TIMES:
        setattr(state, key, getattr(state, key) + delta)
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
        if stage in ("teen", "adult") and state.personality is None:
            # Before this step's _learn: the traits it had as it crossed over.
            state.personality = personality_for(state)
            changed["personality"] = state.personality
        if stage == "adult":
            state.upbringing = upbringing(state)
            state.upbringing_floor = None
            changed["upbringing"] = state.upbringing
        events.append(changed)
    if stage == "egg":
        return

    if state.game and t1 - state.game.last_at >= R.GAME_IDLE_MINUTES * 60:
        events += drop_game(state, t1)  # nobody finished it
    _sleep(state, t1, settings, events)
    _give_treats(state, t1, events)
    _learn(state, hours, t1, settings, events)
    _decay(state, hours, t1, settings)
    _digest(state, t1, events)
    _sickness(state, hours, t1, rng, events)
    _calls(state, t1, hours, rng, events, settings.tz)
    if stage != "adult":
        _sample(state, t1)


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
    if not state.temperament:
        low, high = R.TEMPERAMENT_RANGE
        state.temperament = {t: round(rng.uniform(low, high), 2) for t in TRAITS}
    if state.species not in state.raised:
        state.raised.append(state.species)
    state.hatched_on = datetime.fromtimestamp(t, settings.tz).date().isoformat()
    events.append({"type": "hatched", "species": state.species})
    if state.lights_out:
        # Someone put the egg to bed; the hatchling goes straight to sleep.
        _fall_asleep(state, not in_sleep_hours(t, settings), events, t, settings)


def fast_forward(
    state: PetState, now: float, hours: float, settings: Settings, rng: random.Random
) -> list[Event]:
    """Live through `hours` right now: advance, then pull the simulated future
    back to `now`. A pet asleep at the end wakes at the next morning's wake
    time (shift_times leaves wake_at on the wall clock, which would be a day or
    more away), unless it is only napping."""
    seconds = hours * 3600
    was_egg = life_stage(state) == "egg"
    events = advance(state, now + seconds, settings, rng, max_gap=None)
    shift_times(state, -seconds)
    if was_egg and state.hatched_on is not None:
        # hatched_on is a date, so shift_times can't move it: redo it from
        # the rebased hatch time, in the configured time zone.
        hatch = state.born + dict(R.STAGE_STARTS)["baby"] * 3600 - seconds
        state.hatched_on = datetime.fromtimestamp(hatch, settings.tz).date().isoformat()
    if state.asleep and not state.napping:
        state.wake_at = next_wake(now, settings)
    return events


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
                _wake(state, events, "rested", t)
            return
        if state.wake_at is None:
            state.wake_at = next_wake(t, settings)
        if t >= state.wake_at:
            _wake(state, events, "morning", t)
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
    events += drop_game(state, t)
    state.stayed_up_since = None
    state.wake_at = None if napping else next_wake(t, settings)
    # An open call pauses with the pet (see _calls and _wake), whatever it is.
    events.append({"type": "fell_asleep", "napping": napping, "how": how})


def _wake(
    state: PetState, events: list[Event], how: str, t: float | None = None
) -> None:
    """how: "morning" (wake time), "rested" (a nap ended), "lights" (woken by
    hand) or "night" (woken by hand during sleep hours, which costs a little).

    A natural wake (t given) ends an energy call and gives any other paused
    call at least RESUME_MIN_MINUTES; the morning one is also sent again."""
    state.asleep = False
    state.napping = False
    state.lights_out = False
    state.wake_at = None
    events.append({"type": "woke_up", "how": how})
    if state.sick and state.sick_unannounced:
        events.append({"type": "became_sick", "cause": state.sick_unannounced})
    state.sick_unannounced = None
    call = state.call
    if call is None or t is None or how not in ("morning", "rested"):
        return
    if call.reason == "energy":
        state.call = None
        events.append({"type": "call_answered", "reason": "energy"})
        return
    call.deadline = max(call.deadline, t + R.RESUME_MIN_MINUTES * 60)
    if how == "morning":
        # The phones were cleared when it fell asleep: ask again, quietly.
        event: Event = {
            "type": "call_started",
            "reason": "happiness" if call.reason == "fake" else call.reason,
            "resumed": True,
        }
        if call.recall:
            event["recall"] = True
        events.append(event)


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
        state.weight -= (
            R.WEIGHT_BURN
            * (1 + R.WEIGHT_RESTORE * max(0.0, state.weight - R.WEIGHT_START))
            * hours
        )

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
        if state.asleep:
            # No alert it can't act on: it's told when the pet wakes.
            state.sick_unannounced = cause
        else:
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


def _latch(state: PetState, reason: str, t: float) -> None:
    """Missed: no new call about this until it re-arms, but a re-call
    RECALL_HOURS from now if it still holds."""
    if reason not in state.latched:
        state.latched.append(reason)
    state.latched_at[reason] = t


def still_asking(state: PetState, t: float) -> list[str]:
    """Needs missed and still unmet, most urgent first: the pet keeps asking
    about them on the card, and re-calls about them."""
    return [
        r for r in CALL_PRIORITY if r in state.latched and _call_condition(state, r, t)
    ]


def _unlatch(state: PetState, reason: str) -> None:
    if reason in state.latched:
        state.latched.remove(reason)
    state.latched_at.pop(reason, None)


def _calls(
    state: PetState,
    t: float,
    hours: float,
    rng: random.Random,
    events: list[Event],
    tz: tzinfo = UTC,
) -> None:
    for reason in list(state.latched):
        if _rearmed(state, reason):
            _unlatch(state, reason)

    if state.asleep:
        call = state.call
        if call is not None:
            call.deadline += hours * 3600  # a call pauses while it sleeps
            if (
                call.reason == "energy"
                and state.energy > R.CALL_THRESHOLDS["energy"][1]
            ):
                state.call = None  # real rest answers it
                events.append({"type": "call_answered", "reason": "energy"})
        return

    call = state.call
    if call is not None:
        if call.reason != "happiness" and not _call_condition(state, call.reason, t):
            # A happiness call is answered only by a care action that raises
            # happiness (_resolve_call), never by a passive gain.
            state.call = None
            events.append({"type": "call_answered", "reason": call.reason})
        elif t >= call.deadline:
            state.call = None
            if call.reason == "fake":
                state.discipline_misses += 1
                events.append({"type": "discipline_miss"})
            elif call.recall:
                # One neglect is one miss: a missed re-call only waits
                # another RECALL_HOURS.
                _latch(state, call.reason, t)
                events.append(
                    {"type": "call_expired", "reason": call.reason, "recall": True}
                )
            else:
                state.care_misses += 1
                _count_miss(state, t, tz)
                state.recent_misses.append(t)
                # One neglect is one miss: no new call about this until it
                # recovers past the re-arm level, bar a re-call.
                _latch(state, call.reason, t)
                events.append(
                    {
                        "type": "care_miss",
                        "reason": call.reason,
                        "care_misses": state.care_misses,
                    }
                )
        elif _urgent_need(state, call.reason, t):
            state.call = None  # replaced by a more urgent need: no miss
        else:
            return

    for reason in CALL_PRIORITY:
        if reason not in state.latched and _call_condition(state, reason, t):
            _start_call(state, reason, t, events)
            return

    # A missed need still unmet asks again, the one waiting longest first (so
    # each gets its turn; first mate, 0b audit), at most once per RECALL_HOURS
    # per pet. It stays latched: answering it or missing it again is not a
    # new miss.
    wait = R.RECALL_HOURS * 3600
    if t - state.last_recall_at >= wait:
        due = [
            r for r in still_asking(state, t) if t - state.latched_at.get(r, t) >= wait
        ]
        if due:
            reason = min(due, key=lambda r: state.latched_at.get(r, t))
            state.last_recall_at = t
            _start_call(state, reason, t, events, recall=True)
            return

    if (
        "happiness" not in state.latched
        and R.CALL_THRESHOLDS["happiness"][0]
        <= state.happiness
        < R.CALL_THRESHOLDS["happiness"][1]
        and rng.random() < 1 - math.exp(-R.LONELY_CALL_RATE * hours)
    ):
        _start_call(state, "happiness", t, events)
        return

    if _wants_to_whine(state, t) and rng.random() < 1 - math.exp(
        -whine_rate(state) * hours
    ):
        _start_call(state, "fake", t, events)


def _urgent_need(state: PetState, reason: str, t: float) -> bool:
    """Whether a real need of higher priority than this open call holds."""
    above = (
        CALL_PRIORITY
        if reason == "fake"
        else CALL_PRIORITY[: CALL_PRIORITY.index(reason)]
    )
    return any(r not in state.latched and _call_condition(state, r, t) for r in above)


def whine_rate(state: PetState) -> float:
    """Fake calls per awake hour: discipline makes them rarer, a scrappy
    upbringing more common."""
    rate = R.FAKE_CALL_RATE * (
        1 - R.FAKE_CALL_DISCIPLINE_DAMPING * state.discipline / 100
    )
    if state.upbringing == "scrappy":
        rate *= R.SCRAPPY_WHINE_FACTOR
    return rate


def _wants_to_whine(state: PetState, t: float) -> bool:
    """A whine passes the gate a real happiness call passes: no real need holds."""
    return not any(_call_condition(state, r, t) for r in CALL_PRIORITY)


# --- Traits -----------------------------------------------------------------

TRAITS = (
    "night_owl",
    "music_lover",
    "homebody",
    "early_bird",
    "helper",
    "player",
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
    "snow_child": ("snowy", R.TRAIT_HAPPINESS),
    "breeze_rider": ("windy", R.TRAIT_HAPPINESS),
    "fog_wanderer": ("foggy", R.TRAIT_HAPPINESS),
    "thunder_heart": ("storm", R.TRAIT_HAPPINESS),
}


def game_counts(state: PetState) -> dict[str, dict[str, int]]:
    """Games played and won, by kind (a copy, for the journal and sensors)."""
    return {kind: dict(counts) for kind, counts in state.games.items()}


def games_played(state: PetState) -> int:
    """Every game this pet has finished, of any kind. A dropped game stays in
    "played" (for the win rate) but isn't finished, so it doesn't count here."""
    return sum(
        counts["played"] - counts.get("dropped", 0) for counts in state.games.values()
    )


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
            before = state.inherited.pop(trait)
            level = min(before + 1, R.TRAIT_MAX_LEVEL)
            state.trait_levels[trait] = level
            if level > before:
                events.append(
                    {"type": "trait_deepened", "trait": trait, "level": level}
                )
        elif trait not in state.traits and len(state.traits) < R.TRAIT_CAP:
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
    progress["early_bird"] = (
        seen.get("early_mornings", 0.0) / R.TRAIT_EARLY_BIRD_MORNINGS
    )
    progress["helper"] = seen.get("chores", 0.0) / R.TRAIT_HELPER_CHORES
    progress["player"] = games_played(state) / R.TRAIT_PLAYER_GAMES
    for trait, (flag, needed) in R.TRAIT_FLAG_HOURS.items():
        progress[trait] = seen.get(flag, 0.0) / needed
    # Temperament: a factor on each threshold (pets from before it have none).
    progress = {t: p / state.temperament.get(t, 1.0) for t, p in progress.items()}
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
    if 0 <= _minutes_since_wake(t, settings) < R.EARLY_BIRD_MORNING_MINUTES:
        happiness += R.TRAIT_HAPPINESS * _scale(state, "early_bird")
    for trait, (flag, rate) in _FLAG_TRAIT_HAPPINESS.items():
        if flag in settings.home.flags:
            happiness += rate * _scale(state, trait)
    return {"happiness": happiness} if happiness else {}


def _minutes_since_wake(ts: float, settings: Settings) -> int:
    """Minutes since today's wake time (local), 0-1439."""
    now = _minutes_of_day(ts, settings.tz)
    wake = settings.wake_time.hour * 60 + settings.wake_time.minute
    return (now - wake) % (24 * 60)


def morning_stir(state: PetState, now: float, settings: Settings) -> None:
    """The house's first stir of the morning (the good_morning moment): soon
    after wake time, it counts toward early bird, once a day (the moment can
    come again after a restart)."""
    today = datetime.fromtimestamp(now, settings.tz).date().isoformat()
    if (
        state.early_morning_on != today
        and _minutes_since_wake(now, settings) < R.TRAIT_EARLY_BIRD_WINDOW_MINUTES
    ):
        state.early_morning_on = today
        seen = state.trait_hours
        seen["early_mornings"] = seen.get("early_mornings", 0.0) + 1


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


def _start_call(
    state: PetState, reason: str, t: float, events: list[Event], recall: bool = False
) -> None:
    state.call = Call(reason, t, t + R.CALL_WINDOW_MINUTES * 60, recall)
    # A fake call looks like a plea to play from outside; the status screen
    # (happiness is fine) is how a player catches it.
    event: Event = {
        "type": "call_started",
        "reason": "happiness" if reason == "fake" else reason,
    }
    if recall:
        event["recall"] = True  # notifies bundled, as a normal push
    events.append(event)


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


def _count_miss(state: PetState, t: float, tz: tzinfo) -> None:
    """A care miss for the upbringing: at most MISSES_COUNTED_PER_DAY a local
    day. The first one counted ends an old pet's floor."""
    if not _same_day(state.miss_day_at, t, tz):
        state.miss_day_at, state.miss_day_count = t, 0
    if state.miss_day_count < R.MISSES_COUNTED_PER_DAY:
        state.miss_day_count += 1
        state.counted_misses += 1
        state.upbringing_floor = None


def _same_day(a: float, b: float, tz: tzinfo) -> bool:
    return datetime.fromtimestamp(a, tz).date() == datetime.fromtimestamp(b, tz).date()


def upbringing_score(state: PetState) -> float:
    """0-100 from how it was raised: mostly how well it was kept (waking hours
    well, and misses, a few a day at most), the rest its discipline averaged
    over growing up. With no samples yet: today's discipline, and wellbeing
    estimated from its misses."""
    n = state.discipline_samples
    discipline = state.discipline_sum / n if n else state.discipline
    n = state.wellbeing_samples
    well = state.wellbeing_sum / n if n else _wellbeing_estimate(state)
    misses = max(0.0, 100.0 - R.UPBRINGING_MISS_COST * state.counted_misses)
    share = R.UPBRINGING_MISS_SHARE
    care = (1 - share) * 100.0 * well + share * misses
    weight = R.UPBRINGING_CARE_WEIGHT
    return weight * care + (1 - weight) * discipline


def _grade(score: float) -> str:
    return next(name for name, low in R.UPBRINGING_GRADES if score >= low)


def _capped(grade: str) -> str:
    """A floor is at most steady: uncapped, it would carry an exploit's
    devoted grade from the old rules forward."""
    return grade if grade != "devoted" else "steady"


def _better(a: str, b: str | None) -> str:
    return a if b is None or UPBRINGINGS.index(a) <= UPBRINGINGS.index(b) else b


def upbringing(state: PetState) -> str:
    """The adult's upbringing, or the one it's on track for while growing up:
    the better of the score's grade and a standing floor."""
    if state.upbringing is not None:
        return state.upbringing
    return _better(_grade(upbringing_score(state)), state.upbringing_floor)


def _days_lived(state: PetState) -> int:
    """Days since hatching, counting today (at least 1)."""
    hours = state.age_hours - dict(R.STAGE_STARTS)["baby"]
    return max(1, math.ceil(hours / 24))


def _wellbeing_estimate(state: PetState) -> float:
    """0-1: the share of waking hours it was well, guessed from its misses."""
    return _clamp(1 - 0.06 * state.care_misses / _days_lived(state), 0.0, 1.0)


def _migrate_upbringing(state: PetState) -> None:
    """A pet hatched before the score was reworked (PR 0e). Growing up, its
    hours so far count at half weight, from today's discipline and a
    wellbeing estimate, and it keeps the grade the old rule gave it, capped
    at steady, until its first counted miss. An adult keeps its upbringing."""
    days = _days_lived(state)
    state.counted_misses = min(state.care_misses, R.MISSES_COUNTED_PER_DAY * days)
    if life_stage(state) == "adult":
        if state.upbringing is None:
            state.upbringing_floor = _capped(_old_grade(state))
        return
    hours = max(0.0, state.age_hours - dict(R.STAGE_STARTS)["baby"])
    samples = round(hours * 2 / 3 / 2)  # awake about two thirds, half weight
    state.discipline_samples = state.wellbeing_samples = samples
    state.discipline_sum = state.discipline * samples
    state.wellbeing_sum = samples * _wellbeing_estimate(state)
    state.upbringing_floor = _capped(_old_grade(state))


def _old_grade(state: PetState) -> str:
    """The grade before PR 0e: 6 care points a miss, 70% care, 30% today's
    discipline."""
    care = max(0.0, 100.0 - 6.0 * state.care_misses)
    return _grade(0.7 * care + 0.3 * state.discipline)


def _sample(state: PetState, t: float) -> None:
    """Once a waking hour while growing up: its discipline, and whether it's
    well (not sick, every meter at UPBRINGING_WELL_MIN or more)."""
    if state.asleep or t - state.last_sample_at < 3600:
        return
    state.last_sample_at = t
    state.discipline_sum += state.discipline
    state.discipline_samples += 1
    meters = (state.hunger, state.happiness, state.energy, state.health)
    well = not state.sick and min(meters) >= R.UPBRINGING_WELL_MIN
    state.wellbeing_sum += well
    state.wellbeing_samples += 1


# --- Personality ----------------------------------------------------------------

# How it talks and idles: flavour only, never a rate, a stat or a care result.
PERSONALITIES = (
    "mellow",
    "sweet",
    "bouncy",
    "starry",
    "old_soul",
    "fancy",
    "charming",
    "plucky",
)
# Each trait nudges two types; every type is leaned toward by four traits.
PERSONALITY_LEANINGS: dict[str, tuple[str, str]] = {
    "night_owl": ("mellow", "old_soul"),
    "music_lover": ("starry", "charming"),
    "homebody": ("sweet", "mellow"),
    "early_bird": ("bouncy", "sweet"),
    "helper": ("sweet", "plucky"),
    "player": ("bouncy", "starry"),
    "sun_lover": ("bouncy", "fancy"),
    "fireside": ("old_soul", "sweet"),
    "moon_child": ("charming", "fancy"),
    "storm_watcher": ("plucky", "old_soul"),
    "couch_potato": ("mellow", "starry"),
    "social_butterfly": ("starry", "charming"),
    "snow_child": ("fancy", "bouncy"),
    "breeze_rider": ("plucky", "fancy"),  # a breeze ruffles feathers
    "fog_wanderer": ("old_soul", "mellow"),
    "thunder_heart": ("plucky", "charming"),
}


def personality_for(state: PetState) -> str:
    """Its type: an even pick, nudged by the traits it holds.

    Reads only its birth time and traits, never how it was cared for (the type
    is not a grade), and draws from its own generator, never the shared rng.
    """
    weights = dict.fromkeys(PERSONALITIES, 1)
    for trait in state.traits:
        for kind in PERSONALITY_LEANINGS.get(trait, ()):
            weights[kind] += trait_level(state, trait)
    rng = random.Random(f"personality-{float(state.born)}")
    return rng.choices(PERSONALITIES, weights=[weights[k] for k in PERSONALITIES])[0]


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
        "personality": state.personality,
        "games": game_counts(state),
    }
    egg = PetState.new(state.name, now)
    egg.generation = state.generation + 1
    egg.raised = list(state.raised)
    egg.egg_choice = state.egg_choice  # chosen before laying: for this egg
    egg.journal = [*state.journal, record]
    egg.notify_users = list(state.notify_users)
    egg.bonds = copy.deepcopy(state.bonds)  # the family stays close to the device
    egg.firsts = dict(state.firsts)  # the household's season, not the pet's
    egg.unknown = dict(getattr(state, "unknown", {}))  # a later version's keys
    egg.memories = list(state.memories)
    # Chore treats earned today wait for the hatchling, and count toward today's limit.
    egg.chore_treats = list(state.chore_treats)
    egg.treats_waiting = state.treats_waiting
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
    happiness_before = state.happiness
    needed = _meets_need(state, action)
    if action in REQUEST_ACTIONS:
        result = _answer_request(state, action, now, settings, events)
    else:
        tz = settings.tz if settings is not None else UTC
        result = _do_action(state, action, now, rng, events, tz)
    if needed and result == OK:
        state.last_care_at = now
    _log(state, {"at": now, "action": action, "by": by, "result": result})
    events.append({"type": "care", "action": action, "result": result})
    if result == OK:
        _resolve_call(state, now, events, state.happiness > happiness_before)
    return result, events


def _meets_need(state: PetState, action: str) -> bool:
    """Whether this care, done now, meets a need: praise just after it teaches
    (a meal when hungry, a clean with poop there, play when bored, medicine
    when sick)."""
    if action == "feed":
        return state.hunger < 60
    if action == "clean":
        return bool(state.poops)
    if action == "play":
        return state.happiness < 60
    return action == "medicine" and state.sick


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
    tz: tzinfo = UTC,
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
        if state.hunger >= R.FEED_FULL_AT:
            return "full"
        state.hunger = _clamp(state.hunger + R.SNACK_HUNGER)
        state.happiness = _clamp(state.happiness + R.SNACK_HAPPINESS)
        state.weight = _clamp(state.weight + R.WEIGHT_SNACK)
        state.health = max(_clamp(state.health + R.SNACK_HEALTH), R.HEALTH_FLOOR)
        state.last_excite = now
        if rng.random() < R.SNACK_POOP_CHANCE:
            state.digesting.append(now + R.DIGEST_MINUTES * 60)
        if state.call is not None and state.call.reason == "fake":
            # A snack is not a safe probe: it spoils a whine too.
            state.discipline = _clamp(state.discipline + R.PRAISE_WHINING_DISCIPLINE)
            state.call = None
            events.append(
                {"type": "call_answered", "reason": "fake", "answer": "spoiled"}
            )
            return "spoiled"
        return OK

    if action == "play":
        if state.energy < R.PLAY_MIN_ENERGY:
            return "too_tired"
        state.happiness = _clamp(state.happiness + R.PLAY_HAPPINESS)
        state.energy = _clamp(state.energy + R.PLAY_ENERGY)
        state.hunger = _clamp(state.hunger + R.PLAY_HUNGER)
        state.weight = _clamp(state.weight + R.WEIGHT_PLAY)
        state.last_excite = now
        if state.call is not None and state.call.reason == "fake":
            # Played with, it has what it whined for: same as praising it.
            state.discipline = _clamp(state.discipline + R.PRAISE_WHINING_DISCIPLINE)
            state.call = None
            events.append(
                {"type": "call_answered", "reason": "fake", "answer": "spoiled"}
            )
            return "spoiled"
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
            events.append(
                {"type": "call_answered", "reason": "fake", "answer": "scold"}
            )
            return OK
        state.happiness = _clamp(state.happiness + R.SCOLD_UNFAIR_HAPPINESS)
        return "unfair"

    if action == "praise":
        state.happiness = _clamp(state.happiness + _praise_gain(state, now, tz))
        if state.call is not None and state.call.reason == "fake":
            # Rewarding the whining teaches it to whine.
            state.discipline = _clamp(state.discipline + R.PRAISE_WHINING_DISCIPLINE)
            state.call = None
            events.append(
                {"type": "call_answered", "reason": "fake", "answer": "spoiled"}
            )
            return "spoiled"
        care = state.last_care_at
        if (
            care
            and now - care <= R.PRAISE_AFTER_CARE_MINUTES * 60
            and state.praised_care != care
        ):
            # Praise right after good care teaches, once per care.
            state.discipline = _clamp(state.discipline + R.PRAISE_DISCIPLINE)
            state.praised_care = care
        state.last_excite = now
        return OK

    raise ValueError(f"unknown action {action}")


def _praise_gain(state: PetState, now: float, tz: tzinfo) -> float:
    """Happiness from one more praise: less each press within a window, and
    little once the day's first few have given some."""
    if now - state.praise_window_at >= R.PRAISE_COOLDOWN_MINUTES * 60:
        state.praise_window_at, state.praise_count = now, 0
    if not _same_day(state.praise_day_at, now, tz):
        state.praise_day_at, state.praise_day_count = now, 0
    gains = R.PRAISE_WINDOW_GAINS
    gain = gains[state.praise_count] if state.praise_count < len(gains) else 0.0
    state.praise_count += 1
    if state.praise_day_count >= R.PRAISE_FULL_PER_DAY:
        return min(gain, R.PRAISE_TIRED_HAPPINESS)
    if gain:
        state.praise_day_count += 1
    return gain


def _log(state: PetState, entry: dict[str, Any]) -> None:
    state.care_log.insert(0, entry)
    del state.care_log[R.CARE_LOG_SIZE :]


# --- Games (the card's play button) -------------------------------------------

SIDES = ("left", "right")
# Each game and the guesses it takes. left_right is luck (the first-generation
# Tamagotchi's game); higher_lower is odds (the second generation's).
GAMES: dict[str, tuple[str, ...]] = {
    "left_right": SIDES,
    "higher_lower": ("lower", "higher"),
}
NUMBERS = range(1, 10)  # Higher or Lower's numbers


def start_game(
    state: PetState, kind: str, now: float, rng: random.Random, by: str | None = None
) -> tuple[dict[str, Any], list[Event]]:
    """Start a game of this kind (dropping any game in progress, except one of
    this kind with no guess yet, which carries on), and return its opening:
    Higher or Lower's first number. The caller advances the pet to now first."""
    if kind not in GAMES:
        raise ValueError(f"unknown game {kind}")
    events: list[Event] = []
    refusal = _refuse_play(state)
    if refusal:
        _log(state, {"at": now, "action": "game", "by": by, "result": refusal})
        events.append({"type": "care", "action": "game", "result": refusal})
        return {"result": refusal}, events
    _spoil_whine(state, events)
    game = state.game
    if game is not None and game.kind == kind:
        # Carry on with the same game, guessed or not: the same round, score
        # and number, so starting over can't fish for an easy opening.
        game.last_at = now
        return _round_info(game), events
    events += drop_game(state, now, by, switched=True)
    game = state.game = Game(started=now, last_at=now, kind=kind)
    if kind == "higher_lower":
        kept = state.opening
        if (
            kept is not None
            and state.opening_at is not None
            and now - state.opening_at < R.OPENING_KEEP_MINUTES * 60
        ):
            game.number = kept
        else:
            game.number = rng.choice(NUMBERS)
        state.opening = state.opening_at = None
    return _round_info(game), events


def drop_game(
    state: PetState, now: float, by: str | None = None, switched: bool = False
) -> list[Event]:
    """Drop the game in progress (switched away from, idle, asleep, away). One
    with a guess counts as a loss: played, its energy, the losing happiness, and
    a game_finished marked dropped (no wish, record or bond). A Higher or Lower
    opening with no guess costs nothing, but is kept so a restart can't reroll it.
    Only a person switching games (switched) makes it care: its happiness may
    answer a call and it is logged. A drop nobody caused (idle, asleep, away)
    answers nothing, so it can't test whether a call is real, and isn't logged."""
    game, state.game = state.game, None
    if game is None:
        return []
    if game.rounds == 0:
        if game.kind == "higher_lower" and game.number is not None:
            state.opening, state.opening_at = game.number, now
        return []
    happiness_before = state.happiness
    state.happiness = _clamp(state.happiness + R.GAME_LOSE_HAPPINESS)
    state.energy = _clamp(state.energy + R.PLAY_ENERGY)
    state.hunger = _clamp(state.hunger + R.PLAY_HUNGER)
    state.weight = _clamp(state.weight + R.WEIGHT_GAME)
    counts = state.games.setdefault(game.kind, {"played": 0, "won": 0})
    counts["played"] += 1
    counts["dropped"] = counts.get("dropped", 0) + 1
    if switched or by is not None:
        _log(
            state,
            {
                "at": now,
                "action": "game",
                "by": by,
                "result": "lost",
                "score": f"{game.wins}/{game.rounds}",
                "game": game.kind,
            },
        )
    events: list[Event] = [
        {
            "type": "game_finished",
            "game": game.kind,
            "won": False,
            "wins": game.wins,
            "dropped": True,
        }
    ]
    if switched:
        _resolve_call(state, now, events, state.happiness > happiness_before)
    return events


def _spoil_whine(state: PetState, events: list[Event]) -> None:
    """A game played for a fake call gives the whining what it wanted."""
    if state.call is not None and state.call.reason == "fake":
        state.discipline = _clamp(state.discipline + R.PRAISE_WHINING_DISCIPLINE)
        state.call = None
        events.append({"type": "call_answered", "reason": "fake", "answer": "spoiled"})


def play_game(
    state: PetState,
    guess: str,
    now: float,
    rng: random.Random,
    by: str | None = None,
    kind: str = "left_right",
) -> tuple[dict[str, Any], list[Event]]:
    """One round of a game; the last one settles it.

    left_right: the pet hides left or right and the player guesses; the first
    guess starts a game. higher_lower: the player guesses whether the next
    number (1-9, never the same) is higher or lower; start_game shows the
    first. The caller advances the pet to now first. Returns what the card
    needs to draw the round, and events.
    """
    if guess not in GAMES.get(kind, ()):
        raise ValueError(f"{guess} is not a guess in {kind}")
    events: list[Event] = []
    game = state.game
    refusal = _refuse_play(state)
    if refusal is None or (
        refusal == "too_tired" and game is not None and game.kind == kind
    ):
        _spoil_whine(state, events)  # any game call that isn't refused
    if game is not None and (game.kind != kind or state.away or state.asleep):
        # Switched games, or left unfinished when it went away or to sleep.
        events += drop_game(state, now, by, switched=game.kind != kind)
        game = None
    if game is None:
        if kind != "left_right":
            # Nothing to guess against yet; the card starts the game first.
            return {"result": "no_game"}, events
        info, started = start_game(state, kind, now, rng, by)
        events += started
        if info["result"] != OK:
            return info, events
        game = state.game
        assert game is not None
    if kind == "higher_lower":
        assert game.number is not None
    game.rounds += 1
    game.last_at = now
    if kind == "higher_lower":
        shown = game.number
        game.number = rng.choice([n for n in NUMBERS if n != shown])
        correct = (game.number > shown) == (guess == "higher")
        extra: dict[str, Any] = {"shown": shown, "number": game.number}
    else:
        went = rng.choice(SIDES)
        correct = went == guess
        extra = {"went": went}
    game.wins += correct
    info = {**_round_info(game), **extra, "correct": correct}
    if not info["done"]:
        return info, events
    state.game = None
    won = game.wins >= R.GAME_WIN_AT
    if not won:
        happiness = R.GAME_LOSE_HAPPINESS
    elif kind == "left_right":
        happiness = R.GAME_WIN_HAPPINESS
    else:
        happiness = R.SKILL_GAME_WIN_HAPPINESS
    if won:
        happiness += R.PLAYER_WIN_HAPPINESS * _scale(state, "player")
    happiness_before = state.happiness
    if _meets_need(state, "play"):
        state.last_care_at = now  # a finished game is play
    state.happiness = _clamp(state.happiness + happiness)
    state.energy = _clamp(state.energy + R.PLAY_ENERGY)
    state.hunger = _clamp(state.hunger + R.PLAY_HUNGER)
    state.weight = _clamp(state.weight + R.WEIGHT_GAME)
    state.last_excite = now
    counts = state.games.setdefault(kind, {"played": 0, "won": 0})
    counts["played"] += 1
    counts["won"] += won
    result = "won" if won else "lost"
    info["won"] = won
    score = f"{game.wins}/{game.rounds}"
    _log(
        state,
        {
            "at": now,
            "action": "game",
            "by": by,
            "result": result,
            "score": score,
            "game": kind,
        },
    )
    events.append({"type": "care", "action": "game", "result": result})
    events.append(
        {"type": "game_finished", "game": kind, "won": won, "wins": game.wins}
    )
    _resolve_call(state, now, events, state.happiness > happiness_before)
    return info, events


def _round_info(game: Game) -> dict[str, Any]:
    """Where a game stands, for the card."""
    info: dict[str, Any] = {
        "result": OK,
        "game": game.kind,
        "round": game.rounds,
        "rounds": R.GAME_ROUNDS,
        "wins": game.wins,
        "done": game.rounds >= R.GAME_ROUNDS,
    }
    if game.kind == "higher_lower":
        info["number"] = game.number
    return info


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


# --- Daily check-ins: a wish and a dream ---------------------------------------

# What the pet can wish for, and what grants it. Each needs the house to be able
# to grant it (coordinator.wish_options): no music wish without a music player.
WISHES = (
    "play",
    "snack",
    "bath",
    "praise",
    "tuck_in",
    "sunset",
    "music",
    "tv",
    "chore",
    "rain",
    "say_hi",
)
ALWAYS_WISHES = {"play", "snack", "bath", "praise", "tuck_in", "sunset", "say_hi"}
# Wishes a person grants, so the pet may wish one of them on a close friend
# ("I hope Sam plays with me today"). Anyone can still grant it.
AIMED_WISHES = {"play", "snack", "bath", "praise", "say_hi"}
# Wishes that can't come true once it's bedtime (the card stops mentioning them).
DAYTIME_WISHES = {"say_hi", "snack"}


def pick_wish(
    state: PetState,
    today: str,
    rng: random.Random,
    options: set[str],
    friends: dict[str, str] | None = None,
) -> list[Event]:
    """Today's wish, once a day, from what the house can grant (never yesterday's
    again), now and then aimed at one of its close friends ({user ID: first
    name}). Missing a wish costs nothing: tomorrow brings a new one."""
    if state.wish and state.wish.get("day") == today:
        return []
    last = state.wish.get("kind") if state.wish else None
    choices = [k for k in WISHES if k in options and k != last] or [
        k for k in WISHES if k in options
    ]
    if not choices:
        return []
    kind = rng.choice(choices)
    state.wish = {"kind": kind, "day": today, "granted": False}
    if friends and kind in AIMED_WISHES and rng.random() < R.WISH_FOR_CHANCE:
        user = rng.choice(sorted(friends))
        state.wish.update({"for": user, "for_name": friends[user]})
        return [{"type": "wish_made", "kind": kind, "for": user}]
    return [{"type": "wish_made", "kind": kind}]


def grant_wish(
    state: PetState, trigger: str, now: float, today: str, hour: int, by: str | None
) -> list[Event]:
    """Something happened that may be today's wish: grant it, once."""
    wish = state.wish
    if not wish or wish.get("granted") or wish.get("day") != today:
        return []
    if wish.get("kind") != trigger:
        return []
    if trigger == "snack" and hour < R.WISH_SNACK_AFTER_HOUR:
        return []  # "a snack after lunch"
    if trigger == "say_hi" and hour < R.WISH_SAY_HI_AFTER_HOUR:
        return []  # "come say hi this afternoon"
    wish.update(granted=True, at=now, by=by)
    state.happiness = _clamp(state.happiness + R.WISH_HAPPINESS)
    return [{"type": "wish_granted", "kind": trigger}]


def pick_dream(state: PetState, user: str, pick: str, now: float) -> None:
    """Someone chose what the pet dreams about tonight (their latest choice)."""
    state.dream_picks = [p for p in state.dream_picks if p["user"] != user]
    state.dream_picks.append({"user": user, "pick": pick, "at": now})


def dream_seed(state: PetState, seed: dict[str, Any], now: float) -> None:
    """Remember a moment of the day the pet might dream about tonight."""
    state.dream_seeds.append({**seed, "at": now})
    del state.dream_seeds[: -R.DREAM_SEEDS_KEPT]


def dream_on_waking(
    state: PetState, now: float, today: str, rng: random.Random
) -> list[Event]:
    """In the morning, the pet dreamed of one of yesterday's moments (or, with
    none, maybe of something plain). The seeds are used up either way."""
    fresh = [s for s in state.dream_seeds if now - s["at"] < R.DREAM_SEED_HOURS * 3600]
    state.dream_seeds = []
    picks = [p for p in state.dream_picks if now - p["at"] < R.DREAM_PICK_HOURS * 3600]
    state.dream_picks = []
    if picks:
        # Someone asked for this dream (one of them, if several did).
        chosen = rng.choice(picks)
        state.dream = {
            "kind": "picked",
            "pick": chosen["pick"],
            "user": chosen["user"],
            "day": today,
        }
        return [{"type": "dreamed", "kind": "picked", "pick": chosen["pick"]}]
    if fresh:
        seed = rng.choice(fresh)
        state.dream = {k: v for k, v in seed.items() if k != "at"} | {"day": today}
    elif rng.random() < R.DREAM_PLAIN_CHANCE:
        state.dream = {"kind": rng.choice(["flying", "clouds", "feast"]), "day": today}
    else:
        return []
    return [{"type": "dreamed", **state.dream}]


# --- Bonds: the pet knows each person, separately ------------------------------

# What a person did, and the bond points it earns. Care and games share a daily
# limit per person, so a run of praise doesn't buy a bond.
BOND_POINTS = {
    "visit": R.BOND_VISIT_POINTS,  # once a day
    "care": R.BOND_CARE_POINTS,
    "game": R.BOND_GAME_POINTS,
    "wish": R.BOND_WISH_POINTS,  # granted their wish (once a day anyway)
}
BOND_DAILY_KINDS = ("care", "game")
# What the pet may call someone once they're close (BOND_NICKNAME_LEVEL).
NICKNAMES = (
    "sunbeam",
    "buddy",
    "sprout",
    "bean",
    "pebble",
    "honeybee",
    "button",
    "starlight",
    "pumpkin",
    "pal",
)


def bond_level(points: int) -> int:
    """1-10, slow at the top (rates.BOND_LEVELS)."""
    return sum(1 for need in R.BOND_LEVELS if points >= need)


def bond_of(state: PetState, user: str) -> dict[str, Any]:
    """One person's bond, created on first use."""
    return state.bonds.setdefault(user, {"points": 0})


def pet_birthday(hatched_on: str | None, today: str) -> dict[str, int] | None:
    """Its birthday, if today is one: monthly in its first year ({"months": n}),
    then yearly ({"years": n}); the 31st falls on a short month's last day."""
    months = friends_for(hatched_on, today)
    if not months:
        return None
    if months < 12:
        return {"months": months}
    return {"years": months // 12} if months % 12 == 0 else None


def valid_birthday(value: str) -> bool:
    """A real month and day, "MM-DD" (29 February too)."""
    if len(value) != 5 or value[2] != "-" or not (value[:2] + value[3:]).isdigit():
        return False
    try:
        date(2000, int(value[:2]), int(value[3:]))  # 2000: a leap year
    except ValueError:
        return False
    return True


def birthday_today(birthday: str | None, today: str) -> bool:
    """Whether a "MM-DD" birthday is today; 29 February is the 28th in
    other years."""
    if not birthday or not valid_birthday(birthday):
        return False
    day = date.fromisoformat(today)
    if birthday == "02-29" and not calendar.isleap(day.year):
        return today[5:] == "02-28"
    return today[5:] == birthday


def friends_for(since: str | None, today: str) -> int | None:
    """Whole months since they first met, if today is the day ("we've been
    friends for a month!"); the 31st falls on a short month's last day."""
    if not since:
        return None
    first, now = date.fromisoformat(since), date.fromisoformat(today)
    months = (now.year - first.year) * 12 + now.month - first.month
    if months < 1:
        return None
    next_month = date(now.year + now.month // 12, now.month % 12 + 1, 1)
    last_day = (next_month - timedelta(days=1)).day
    return months if now.day == min(first.day, last_day) else None


# A best friend's photo: what the pet was like the day it was taken.
PHOTO_FIELDS = ("name", "species", "stage", "on")
PHOTO_STAGES = ("teen", "adult")  # not a baby that inherited a close bond


def take_photo(state: PetState, user: str, today: str) -> bool:
    """At bond level 10, once per generation, the pet makes its best friend a
    photo of itself (teen or older). Only the snapshot; the card draws it."""
    bond = state.bonds.get(user)
    if (
        not bond
        or bond_level(bond["points"]) < R.BOND_PHOTO_LEVEL
        or life_stage(state) not in PHOTO_STAGES
        or not state.species
    ):
        return False
    photos = bond.setdefault("photos", {})
    if str(state.generation) in photos:
        return False
    photos[str(state.generation)] = {
        "name": state.name,
        "species": state.species,
        "stage": life_stage(state),
        "traits": list(state.traits[: R.TRAIT_CAP]),
        "on": today,
    }
    return True


def _photos(value: Any) -> dict[str, dict[str, Any]]:
    """A bond's photos as loaded: damaged ones are dropped, the bond kept."""
    if not isinstance(value, dict):
        return {}
    out = {}
    for gen, photo in value.items():
        if (
            not isinstance(gen, str)
            or not (gen.isdecimal() and str(int(gen)) == gen)
            or not isinstance(photo, dict)
            or not all(isinstance(photo.get(k), str) for k in PHOTO_FIELDS)
        ):
            continue
        traits = photo.get("traits")
        out[gen] = {
            **{k: photo[k] for k in PHOTO_FIELDS},
            "traits": [t for t in traits if isinstance(t, str)][: R.TRAIT_CAP]
            if isinstance(traits, list)
            else [],
        }
    return out


def game_record(state: PetState, user: str, game: str, wins: int) -> list[Event]:
    """Each person's best at each game; beating it is worth a word to them."""
    best = bond_of(state, user).setdefault("best", {})
    before = best.get(game)
    best[game] = max(wins, before or 0)
    if before is None or wins <= before:
        return []  # the first game only sets the mark
    return [{"type": "bond_record", "user": user, "game": game, "wins": wins}]


def add_bond(
    state: PetState,
    user: str,
    kind: str,
    today: str,
    rng: random.Random,
    game: str | None = None,
) -> list[Event]:
    """Bond points for one person; they never go down. A new level may unlock
    something for that person: a nickname, a favourite game of theirs."""
    bond = bond_of(state, user)
    bond.setdefault("since", today)  # the day they first met
    if bond.get("day") != today:
        bond.update(day=today, today=0, visited=False)
    if kind == "game" and game:
        games = bond.setdefault("games", {})
        games[game] = games.get(game, 0) + 1
    points = BOND_POINTS[kind]
    if kind == "visit":
        if bond["visited"]:
            return []
        bond["visited"] = True
    elif kind in BOND_DAILY_KINDS:
        points = min(points, R.BOND_DAILY_LIMIT - bond["today"])
        if points <= 0:
            return []
        bond["today"] += points
    before = bond_level(bond["points"])
    bond["points"] += points
    level = bond_level(bond["points"])
    if level == before:
        return []
    event: Event = {"type": "bond_up", "user": user, "level": level}
    if level >= R.BOND_NICKNAME_LEVEL and not bond.get("nickname"):
        taken = {b.get("nickname") for b in state.bonds.values()}
        bond["nickname"] = rng.choice(
            [n for n in NICKNAMES if n not in taken] or list(NICKNAMES)
        )
        event["nickname"] = bond["nickname"]
    if level >= R.BOND_FAVOURITE_LEVEL and not bond.get("favourite"):
        # The game they've played most together, or one it just likes.
        played = bond.get("games") or {}
        known = [g for g in GAMES if played.get(g)]
        bond["favourite"] = (
            max(known, key=lambda g: played[g]) if known else rng.choice(list(GAMES))
        )
        event["favourite"] = bond["favourite"]
    return [event]


def favourite_game(state: PetState, user: str, game: str, today: str) -> list[Event]:
    """They finished the pet's favourite game with them: it says so, once a day
    (flavour only; a bond never changes the stats)."""
    bond = state.bonds.get(user, {})
    if bond.get("favourite") != game or bond.get("favourite_said") == today:
        return []
    bond["favourite_said"] = today
    return [{"type": "bond_favourite", "user": user, "game": game}]


# --- Its favourite snack --------------------------------------------------------


def pick_favourite(state: PetState, likes: list[str], rng: random.Random) -> bool:
    """Once it has hatched, it picks a favourite snack from its creature's likes,
    for good. Whether it picked one now."""
    if "snack" in state.favourites or not likes or life_stage(state) == "egg":
        return False
    state.favourites["snack"] = rng.choice(likes)
    return True


def favourite_snack(
    state: PetState, today: str, rng: random.Random, own_food: bool = False
) -> list[Event]:
    """Now and then a snack is its favourite: it says so, at most once a day.
    Not at a stage with food of its own (a moth)."""
    food = state.favourites.get("snack")
    if not food or own_food or state.favourite_said == today:
        return []
    if rng.random() >= R.FAVOURITE_SNACK_CHANCE:
        return []
    state.favourite_said = today
    return [{"type": "favourite_snack", "food": food}]


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
        state.happiness = _clamp(
            state.happiness
            + R.CHORE_TREAT_HAPPINESS
            + R.HELPER_TREAT_HAPPINESS * _scale(state, "helper")
        )
        state.trait_hours["chores"] = state.trait_hours.get("chores", 0.0) + 1
        state.weight = _clamp(state.weight + R.WEIGHT_CHORE_TREAT)
        _log(state, {"at": t, "action": "chore_treat", "by": None, "result": OK})
        events.append({"type": "chore_treat"})
    state.treats_waiting = 0
    state.last_excite = t
    _resolve_call(state, t, events)  # passive: a happiness call stays open


def _resolve_call(
    state: PetState, now: float, events: list[Event], raised: bool = False
) -> None:
    """Close the open call if a care action answered it. A happiness call
    needs the action to have raised happiness to the call level."""
    call = state.call
    if call is None:
        return
    if call.reason == "happiness":
        answered = raised and state.happiness >= R.CALL_THRESHOLDS["happiness"][0]
    else:
        answered = not _call_condition(state, call.reason, now)
    if answered:
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
    result = _apply_lights(state, now, settings, events)
    if result != OK:
        _log(state, {"at": now, "action": LIGHTS_OUT, "by": None, "result": result})
        events.append({"type": "care", "action": LIGHTS_OUT, "result": result})
    return events


def come_home(state: PetState, now: float, settings: Settings) -> list[Event]:
    """Back from the sitter's: apply a lights-out flip made while it was away."""
    events: list[Event] = []
    before, state.lights_before_away = state.lights_before_away, None
    if before is not None and before != state.lights_out:
        _apply_lights(state, now, settings, events)  # a refusal is dropped
    return events


def _apply_lights(
    state: PetState, now: float, settings: Settings, events: list[Event]
) -> str:
    """Make the pet match state.lights_out; the result code ("ok", or
    "not_sleepy" when a nap was refused, which also puts lights_out back off)."""
    on = state.lights_out
    if life_stage(state) == "egg":
        return OK  # remembered: the hatchling goes straight to sleep
    if on and not state.asleep:
        night = in_sleep_hours(now, settings)
        if (
            not night
            and state.energy >= R.NAP_WAKE_ENERGY
            and minutes_to_bedtime(now, settings) > R.NAP_INTO_NIGHT_MINUTES
        ):
            state.lights_out = False
            return NOT_SLEEPY
        _fall_asleep(state, not in_sleep_hours(now, settings), events, now, settings)
    elif not on and state.asleep:
        night = in_sleep_hours(now, settings)
        if night:
            state.happiness = _clamp(state.happiness + R.WAKE_IN_NIGHT_HAPPINESS)
            state.stayed_up_since = now
            state.kept_up_until = now + R.FALL_ASLEEP_ANYWAY_MINUTES * 60
        _wake(state, events, "night" if night else "lights")
    return OK


# --- Mood -------------------------------------------------------------------


def mood(state: PetState, now: float, settings: Settings) -> tuple[str, list[str], str]:
    """Resolve (mood, active flags, short reason) by fixed priority."""
    current, flags, reason, _ = mood_keyed(state, now, settings)
    return current, flags, reason


def mood_keyed(
    state: PetState, now: float, settings: Settings
) -> tuple[str, list[str], str, str]:
    """mood(), plus a key for the reason: which sentence it is, so the card
    can say it in its own words (baby talk) without matching on English.
    call_<reason>, sleepy_drowsy/sleepy_low, the mood, home_<flag> or
    weight_<band>: whichever branch chose the sentence."""
    flags: list[str] = []
    if state.away:
        flags.append("away")
    if life_stage(state) == "egg":
        flags.append("egg")
    if state.sick:
        flags.append("sick")
    if state.asleep:
        flags.append("asleep")
    if state.call is not None and not state.asleep:
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
    reason, key = _reason(state, current, drowsy)
    if current in ("content", "cozy", "excited", "sleepy", "bored") and not (
        now - state.last_excite < R.EXCITED_MINUTES * 60
    ):
        # Say what the house is doing, so the connection is visible.
        effect = HomeEffect(flags=[f for f in flags if f in home])
        if flag := effect.reason_flag():
            reason, key = REASONS[flag], f"home_{flag}"
        # The pet's own body comes before what the house is doing.
        if (band := weight_band(state)) in _WEIGHT_REASONS:
            reason, key = _WEIGHT_REASONS[band], f"weight_{band}"
    return current, flags, reason, key


_WEIGHT_REASONS = {
    "heavy": "feeling a bit round...",
    "light": "could use a proper meal",
}


_CALL_REASONS = {
    "sick": "feeling sick, medicine please?",
    "hunger": "tummy rumbling!",
    "dirty": "it's getting stinky in here",
    "energy": "so tired... sleep time?",
    "happiness": "play with me?",
}

_MOOD_REASONS = {
    "away": "at the sitter's",
    "egg": "*wiggle wiggle*",
    "sick": "feeling sick",
    "asleep": "zzz",
    "hungry": "a little peckish",
    "dirty": "a bit messy in here...",
    "bored": "nothing to do",
    "excited": "that was fun!",
    "cozy": "nice and cozy",
    "content": "all good",
}


def _reason(state: PetState, current: str, drowsy: bool) -> tuple[str, str]:
    """The sentence for the mood, and its key."""
    if current == "calling" and state.call is not None:
        # A whine publishes the key of a real happiness call.
        reason = "happiness" if state.call.reason == "fake" else state.call.reason
        return _CALL_REASONS[reason], f"call_{reason}"
    if current == "sleepy":
        if drowsy:
            return "getting late, eyes drooping", "sleepy_drowsy"
        return "running low on energy", "sleepy_low"
    return _MOOD_REASONS.get(current, ""), current
