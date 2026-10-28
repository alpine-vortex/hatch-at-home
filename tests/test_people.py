"""What the pets know about each person: the pure rules."""

from __future__ import annotations

from datetime import date

from custom_components.virtual_pet import people as P


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


def test_the_likes_come_once_each_on_different_days():
    person: dict = {}
    assert ask(person, hour=12) == "fav_weather"
    person["likes_asked"] = {"fav_weather": ["2026-10-28"]}
    person["likes"] = {"fav_weather": "rain"}
    assert ask(person, hour=12) != "fav_season"  # not the same day
    assert ask(person, today="2026-10-29", hour=12) == "fav_season"
    assert ask(person, today="2026-10-29", hour=12, level=2) is None


def test_an_unanswered_favourite_is_asked_once_more_weeks_later():
    person: dict = {"likes_asked": {"fav_weather": ["2026-10-28"]}}
    assert ask(person, today="2026-10-29", hour=12) != "fav_weather"
    assert ask(person, today="2026-11-11", hour=12) == "fav_weather"
    person["likes_asked"]["fav_weather"].append("2026-11-11")
    assert ask(person, today="2026-12-30", hour=12) != "fav_weather"  # never again
    # The season waits for the weather question to be done with.
    assert ask(person, today="2026-12-30", hour=12) != "fav_season"


def test_the_later_question_rotates_by_day():
    person = {"likes": {"fav_weather": "sun", "fav_season": "autumn"}}
    seen = {}
    for day in range(1, 4):
        today = f"2026-11-0{day}"
        kind = P.rotation(date.fromisoformat(today))
        seen[kind] = (
            ask(person, today=today, hour=17),
            ask(person, today=today, hour=22, to_bed_minutes=60),
        )
    assert seen["how_day"][0] == "how_day"
    assert seen["guess"][0] == "guess"
    assert seen["dream"] == (None, "dream")  # only near bedtime
    guess_day = next(
        f"2026-11-0{d}" for d in range(1, 4) if P.rotation(date(2026, 11, d)) == "guess"
    )
    assert ask(person, today=guess_day, hour=17, has_forecast=False) is None
