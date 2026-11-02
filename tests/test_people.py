"""What the pets know about each person: the pure rules."""

from __future__ import annotations

from datetime import date, timedelta

from custom_components.virtual_pet import people as P, rates as R


def test_seasons_follow_the_hemisphere_and_skip_the_tropics():
    assert P.season(date(2026, 10, 28), 47.6) == "autumn"
    assert P.season(date(2026, 10, 28), -33.9) == "spring"
    assert P.season(date(2026, 1, 10), 47.6) == "winter"
    assert P.season(date(2026, 1, 10), -33.9) == "summer"
    assert P.season(date(2026, 10, 28), 10.0) is None
    # A winter is one season across New Year.
    assert P.season_key(date(2026, 12, 25), 47.6) == "winter-2026"
    assert P.season_key(date(2027, 1, 5), 47.6) == "winter-2026"


def test_only_known_places_are_named():
    assert P.zone_word("Gym") == "gym"
    assert P.zone_word("Mom's Office") == "work"
    assert P.zone_word("Lincoln High School") == "school"
    assert P.zone_word("Hospital") is None
    assert P.zone_word(None) is None


def test_a_guess_is_judged_by_the_days_weather():
    assert P.guess_outcome("rain", {"rain", "sun"}) == "right"
    assert P.guess_outcome("rain", {"sun"}) == "wrong"
    assert P.guess_outcome("sun", {"sun"}) == "right"
    assert P.guess_outcome("sun", {"snow"}) == "wrong"
    assert P.guess_outcome("sun", set()) == "cloudy"


def test_early_is_early_for_them():
    usual = [6 * 60] * 6
    assert P.early_alarm(5 * 60, usual)
    assert not P.early_alarm(5 * 60 + 30, usual)
    assert P.early_alarm(5 * 60, [])  # no usual yet: before 5:30
    assert not P.early_alarm(6 * 60, [])


def ask(person, today="2026-10-28", hour=17, **kw):
    args = {
        "level": 3,
        "to_bed_minutes": 400,
        "has_forecast": True,
        "came_home": None,
        "rested": False,
    } | kw
    return P.choose_question(person, today, hour, **args)


def test_one_question_a_morning_and_one_later():
    person = {"likes": {"fav_weather": "sun", "fav_season": "autumn"}}
    assert ask(person, hour=8) == "slept"
    P.mark_asked(person, "2026-10-28", 8)
    assert ask(person, hour=9) is None
    assert ask(person, hour=9, rested=False) is None
    assert ask({}, hour=8, rested=True) is None  # it just said "well rested"
    assert ask(person, hour=18, came_home="work") == "how_day"
    P.mark_asked(person, "2026-10-28", 18)
    assert ask(person, hour=19, came_home="work") is None
    assert ask(person, today="2026-10-29", hour=8) == "slept"  # a new day
    assert ask(person, level=1, today="2026-10-30", hour=8) is None


def test_the_likes_come_once_each_days_apart():
    person: dict = {}
    assert ask(person, hour=12) == "fav_weather"
    P.mark_once(person, "fav_weather", "2026-10-28")
    person["likes"] = {"fav_weather": "rain"}
    assert ask(person, today="2026-10-29", hour=12) != "fav_season"  # days apart
    assert ask(person, today="2026-10-31", hour=12) == "fav_season"
    assert ask(person, today="2026-10-31", hour=12, level=2) is None


def test_an_unanswered_favourite_is_asked_once_more_weeks_later():
    person: dict = {}
    P.mark_once(person, "fav_weather", "2026-10-28")
    assert ask(person, today="2026-10-29", hour=12) != "fav_weather"
    # It doesn't hold up the season (it used to: the stall).
    assert ask(person, today="2026-10-31", hour=12) == "fav_season"
    P.mark_once(person, "fav_season", "2026-10-31")
    assert ask(person, today="2026-11-11", hour=12) == "fav_weather"
    P.mark_once(person, "fav_weather", "2026-11-11")
    assert ask(person, today="2026-11-14", hour=12) == "fav_season"
    P.mark_once(person, "fav_season", "2026-11-14")
    later = ask(person, today="2026-12-30", hour=12)
    assert later not in ("fav_weather", "fav_season")  # never again


def test_a_one_time_question_comes_first_in_the_evening_too():
    """Someone out all day, home at six: asked after the morning's question."""
    person: dict = {"likes": {"fav_weather": "sun", "fav_season": "autumn"}}
    P.mark_asked(person, "2026-10-28", 8)  # "did you sleep well?" this morning
    assert ask(person, hour=18, came_home="work", level=4) == "birthday"
    assert ask(person, hour=21, came_home="work", level=4) == "how_day"  # too late
    person["birthday_skipped"] = True
    assert ask(person, hour=18, came_home="work", level=4) == "how_day"


def test_the_pets_own_one_time_question_comes_after_the_persons():
    person: dict = {"likes": {"fav_weather": "sun", "fav_season": "autumn"}}
    assert ask(person, hour=12, level=7, pet_once=("catchphrase",)) == "birthday"
    person["birthday"] = "03-14"
    assert ask(person, hour=12, level=7, pet_once=("catchphrase",)) == "catchphrase"
    P.mark_once(person, "catchphrase", "2026-10-28")
    assert ask(
        person, today="2026-10-29", hour=12, level=7, pet_once=("catchphrase",)
    ) != ("catchphrase")


def _rotation_day(kind: str) -> str:
    """The first day from 2026-11-01 of this kind that how_day may stand in on."""
    first = date(2026, 11, 1)
    return next(
        d.isoformat()
        for d in (first + timedelta(days=i) for i in range(60))
        if P.rotation(d) == kind and P.fallback_day(d)
    )


# A big day already open (fresh-expand F1): no follow-up takes the fallback's slot, so
# these see the rotation and its how_day stand-in alone (test_follow has the follow-ups).
BUSY = {"follow": {"event": {"kind": "big_day"}}}


def test_the_later_question_rotates_by_day():
    person = {"likes": {"fav_weather": "sun", "fav_season": "autumn"}, **BUSY}
    seen = {}
    for kind in P.ROTATION:
        today = _rotation_day(kind)
        seen[kind] = (
            ask(person, today=today, hour=17),
            ask(person, today=today, hour=22, to_bed_minutes=60),
        )
    assert seen["how_day"][0] == "how_day"
    assert seen["guess"][0] == "guess"
    # The dream only near bedtime; before, how_day stands in (fresh-moment 5b).
    assert seen["dream"] == ("how_day", "dream")
    guess_day = _rotation_day("guess")
    assert ask(person, today=guess_day, hour=17, has_forecast=False) == "how_day"


def test_a_later_question_on_most_evenings():
    """Fresh-moment 5b (owner Q6): the dream question from 4 h before bed, so a
    19:30 look before a 23:00 bed gets it; a kind that can't be asked now falls
    back to how_day; still one later question per person a day."""
    person = {"likes": {"fav_weather": "sun", "fav_season": "autumn"}, **BUSY}
    dream_day, guess_day = _rotation_day("dream"), _rotation_day("guess")
    assert R.ASK_DREAM_BEFORE_BED_MINUTES == 240
    assert ask(person, today=dream_day, hour=19, to_bed_minutes=210) == "dream"
    assert ask(person, today=dream_day, hour=17, to_bed_minutes=360) == "how_day"
    assert ask(person, today=guess_day, hour=17, has_forecast=False) == "how_day"
    assert (
        ask(person, today=guess_day, hour=16, has_forecast=True) == "how_day"
    )  # too early to guess
    assert ask(person, today=guess_day, hour=17, has_forecast=True) == "guess"
    # No fallback before how_day's own hour.
    assert ask(person, today=dream_day, hour=15, to_bed_minutes=480) is None
    P.mark_asked(person, dream_day, 19)
    assert (
        ask(person, today=dream_day, hour=20, to_bed_minutes=180) is None
    )  # one a day


def test_the_how_day_stand_in_comes_at_most_4_evenings_in_7():
    """Fresh-moment 5b (review s2622 #5, FM): the stand-in for an unaskable dream
    or guess isn't nightly: on ASK_FALLBACK_DAYS of every 7 days only, by the
    day. The rotation's own how_day days are always asked, cap or not."""
    person = {"likes": {"fav_weather": "sun", "fav_season": "autumn"}, **BUSY}
    first = date(2026, 11, 1).toordinal()
    stand_ins = 0
    own = 0
    for day in (date.fromordinal(first + i) for i in range(21)):
        got = ask(
            person,
            today=day.isoformat(),
            hour=17,
            to_bed_minutes=360,
            has_forecast=False,
        )
        if P.rotation(day) == "how_day":
            assert got == "how_day"  # never capped (FM regression check)
            own += not P.fallback_day(day)
            continue
        assert got in ("how_day", None)
        assert (got == "how_day") == P.fallback_day(day)
        stand_ins += got == "how_day"
    assert own > 0  # a how_day day off the cap's days was covered
    assert R.ASK_FALLBACK_DAYS == 4 and stand_ins <= 3 * 4


def test_the_stand_in_days_are_4_a_week_on_weekdays_drawn_per_week():
    """Audit 2026-11-01b B4: 4 days of each ISO week, not the same weekdays
    every week (it was always Sunday to Wednesday)."""
    monday = date(2026, 11, 2)
    weeks = [
        frozenset(
            d.weekday()
            for d in (monday + timedelta(days=7 * w + i) for i in range(7))
            if P.fallback_day(d)
        )
        for w in range(8)
    ]
    assert all(len(w) == R.ASK_FALLBACK_DAYS for w in weeks)
    assert len(set(weeks)) > 1


def test_sleep_question_on_alternate_dream_mornings():
    """Fresh-moment 5b (FM): a dream to tell stands in for "did you sleep well?"
    on alternate days only, so with a dream nearly every morning (slice 6) the
    question still comes about half the mornings; with no dream, every morning."""
    first = date(2026, 11, 1).toordinal()
    days = [date.fromordinal(first + i).isoformat() for i in range(14)]
    asked = [ask({}, today=d, hour=8, dreamed=True) for d in days]
    assert asked.count("slept") == 7 and asked.count(None) == 7
    assert all(a != b for a, b in zip(asked, asked[1:], strict=False))  # alternate
    assert all(ask({}, today=d, hour=8, dreamed=False) == "slept" for d in days)


def test_a_damaged_record_keeps_what_its_readers_can_use():
    record = P._person(
        {
            "zone": 3,
            "noted": [],
            "birthday": "13-40",
            "alarms": [["2026-10-01", 420], "x", ["2026-10-02"]],
            "asked": {"day": "2026-10-01", "morning": True},
            "likes": {"fav_weather": "rain", "x": 1},
            "likes_asked": {"fav_weather": ["2026-10-01", 3], "x": "y"},
            "sendoffs": "x",
            "my_day": "yes",
            "later": {"kept": True},
        }
    )
    assert record == {
        "noted": {},
        "alarms": [["2026-10-01", 420]],
        "asked": {"day": "2026-10-01", "morning": True},
        "likes": {"fav_weather": "rain"},
        "likes_asked": {"fav_weather": ["2026-10-01"]},
        "sendoffs": [],
        "later": {"kept": True},
    }


def test_an_old_save_drops_a_zone_when_my_day_is_off():
    zone = {"name": "Gym", "at": 1.0}
    assert "zone" not in P._person({"zone": zone})
    assert "zone" not in P._person({"zone": zone, "my_day": False})
    assert P._person({"zone": zone, "my_day": True})["zone"] == zone
