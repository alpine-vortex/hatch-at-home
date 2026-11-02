"""The house's influence on the pet, without Home Assistant."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from custom_components.virtual_pet import home, model, rates as R
from custom_components.virtual_pet.home import Presence, Readings, evaluate

HOUR = 3600.0
MIN = 60.0


def at(hour: int, minute: int = 0, day: int = 1) -> float:
    return datetime(2026, 10, day, hour, minute, tzinfo=UTC).timestamp()


def test_rain_gauge_beats_the_forecast():
    assert (
        "rainy"
        in evaluate(Readings(night=False, condition="sunny", rain_rate=0.1)).flags
    )
    dry = evaluate(Readings(night=False, condition="rainy", rain_rate=0.0, sun_up=True))
    assert "rainy" not in dry.flags


def test_rain_asks_for_a_blanket():
    e = evaluate(Readings(night=False, condition="rainy"))
    assert e.requests == ["blanket"]
    assert e.reason() == "rainy day... a blanket would be nice"


def test_bonuses_never_exceed_the_cap_and_never_drain():
    e = evaluate(Readings(night=False, solar=900, music=True, tv=True))
    assert e.bonus["happiness"] <= R.HOME_BONUS_CAP
    for r in [
        Readings(
            night=True, condition="rainy", indoor_c=5, aqi=300, room_light_level=1.0
        ),
        Readings(night=False, condition="pouring", indoor_c=40),
    ]:
        assert all(v >= 0 for v in evaluate(r).bonus.values())


def test_daylight_is_never_too_bright():
    assert (
        "too_bright"
        not in evaluate(Readings(night=False, lux=5000, room_light_level=1)).flags
    )
    assert (
        "too_bright"
        in evaluate(Readings(night=True, late=True, room_light_level=0.8)).flags
    )
    # The hour before bedtime: lights at full are normal in many homes.
    assert (
        "too_bright" not in evaluate(Readings(night=True, room_light_level=1.0)).flags
    )
    assert (
        "too_bright" not in evaluate(Readings(night=True, room_light_level=0.2)).flags
    )


def test_cold_and_warm_make_requests():
    assert evaluate(Readings(night=False, indoor_c=15)).requests == ["blanket"]
    assert evaluate(Readings(night=False, indoor_c=29)).requests == ["fan"]
    assert evaluate(Readings(night=False, indoor_c=21)).requests == []


def test_dark_and_quiet_needs_lights_known_off():
    off = Readings(night=True, bedtime_lights_on=False, motion_recent=False)
    assert evaluate(off).dark_and_quiet
    # A dropped-out light sensor (None) is not "off".
    assert not evaluate(Readings(night=True, bedtime_lights_on=None)).dark_and_quiet
    assert not evaluate(
        Readings(night=True, bedtime_lights_on=False, motion_recent=True)
    ).dark_and_quiet
    assert not evaluate(Readings(night=False, bedtime_lights_on=False)).dark_and_quiet


def test_greeting_with_cooldown():
    p = Presence()
    t = at(9)
    p.update(1, t, False)
    p.update(0, t + MIN, False)
    p.update(1, t + 2 * MIN, False)
    assert p.greeting(t + 3 * MIN)
    # GPS jitter: gone and back again within the cooldown, no new greeting.
    p.update(0, t + 15 * MIN, False)
    p.update(1, t + 16 * MIN, False)
    assert not p.greeting(t + 16 * MIN + R.HOME_GREETING_MINUTES * MIN)


def test_away_after_two_empty_hours_and_back():
    p = Presence()
    t = at(9)
    assert p.update(0, t, False) is False
    assert p.update(0, t + 1.9 * HOUR, False) is False
    assert p.update(0, t + 2.1 * HOUR, False) is True
    assert p.update(None, t + 3 * HOUR, True) is True  # no signal: no change
    assert p.update(1, t + 4 * HOUR, True) is False
    assert p.greeting(t + 4 * HOUR)


def settings_with(effect: home.HomeEffect) -> model.Settings:
    return model.Settings(tz=UTC, home=effect)


def hatched(now: float, **stats: float) -> model.PetState:
    pet = model.PetState.new("Pip", now)
    pet.age_hours = 30.0
    pet.hunger = pet.happiness = pet.energy = 90.0
    for key, value in stats.items():
        setattr(pet, key, value)
    return pet


class NoLuck:
    def random(self) -> float:
        return 0.999999

    def uniform(self, a: float, b: float) -> float:
        return (a + b) / 2

    def choice(self, seq):
        return seq[0]


def test_house_puts_pet_to_bed_but_never_wakes_it():
    quiet = settings_with(home.HomeEffect(dark_and_quiet=True))
    pet = hatched(at(22, 30))
    events = model.advance(pet, at(22, 40), quiet, NoLuck(), max_gap=None)
    assert pet.asleep and "fell_asleep" in [e["type"] for e in events]
    # Lights back on at 6 am: the house can't wake it; wake time does.
    loud = settings_with(home.HomeEffect(dark_and_quiet=False))
    model.advance(pet, at(6, 0, day=2), loud, NoLuck(), max_gap=None)
    assert pet.asleep


def test_waking_by_hand_beats_the_dark_house():
    quiet = settings_with(home.HomeEffect(dark_and_quiet=True))
    pet = hatched(at(23, 30))
    model.set_lights_out(pet, True, at(23, 30), quiet)
    model.set_lights_out(pet, False, at(23, 40), quiet)
    model.advance(pet, at(23, 55), quiet, NoLuck(), max_gap=None)
    assert not pet.asleep  # the switch is the top authority for a while


def test_blanket_request_answered():
    rainy = settings_with(home.HomeEffect(flags=["rainy"], requests=["blanket"]))
    now = at(14)
    pet = hatched(now, happiness=50.0)
    assert model.action_available(pet, "blanket", now, rainy)
    assert model.mood(pet, now, rainy)[2] == "rainy day... a blanket would be nice"
    result, _ = model.apply_action(pet, "blanket", now, NoLuck(), settings=rainy)
    assert result == model.OK
    assert pet.happiness == pytest.approx(50 + R.BLANKET_HAPPINESS)
    assert not model.action_available(pet, "blanket", now, rainy)
    mood, flags, reason = model.mood(pet, now + MIN, rainy)
    assert mood == "cozy" and reason == "nice and cozy"


def test_unneeded_request_does_nothing():
    pet = hatched(at(14))
    assert (
        model.apply_action(
            pet, "fan", at(14), NoLuck(), settings=settings_with(home.HomeEffect())
        )[0]
        == "not_needed"
    )


def test_home_bonus_applied_while_awake_only():
    sunny = settings_with(home.HomeEffect(flags=["sunny"], bonus={"happiness": 1.0}))
    pet = hatched(at(12), happiness=50.0)
    model.advance(pet, at(14), sunny, NoLuck(), max_gap=None)
    assert pet.happiness == pytest.approx(50 - 2 * (R.HAPPINESS_DECAY - 1.0))


def test_lit_fireplace_is_cozy_and_beats_the_chill():
    e = evaluate(Readings(night=False, fireplace=True, indoor_c=15))
    assert "fireside" in e.flags
    assert "chilly" not in e.flags and e.requests == []
    assert e.bonus["happiness"] == R.HOME_FIRE_HAPPINESS


@pytest.mark.parametrize(
    ("phase", "illumination", "expected"),
    [
        ("full_moon", None, "full_moon"),
        ("Full Moon", None, "full_moon"),
        ("full", None, "full_moon"),
        ("New Moon", None, "new_moon"),
        ("waxing_gibbous", 0.99, "waxing_gibbous"),  # the phase name wins
        (None, 0.98, "full_moon"),
        (None, 0.01, "new_moon"),
        (None, 0.5, None),
        (None, None, None),
    ],
)
def test_moon_phase_from_a_name_or_the_lit_fraction(phase, illumination, expected):
    assert home.moon_phase(phase, illumination) == expected


def test_full_moon_at_night_makes_it_happy():
    e = evaluate(Readings(night=True, sun_up=False, moon_phase="full_moon"))
    assert "full_moon" in e.flags
    assert e.bonus["happiness"] == R.HOME_MOON_HAPPINESS
    assert e.reason() == home.REASONS["full_moon"]


def test_the_moon_only_counts_at_night_while_it_is_up():
    day = evaluate(Readings(night=False, sun_up=True, moon_phase="full_moon"))
    assert "full_moon" not in day.flags and "happiness" not in day.bonus
    below = evaluate(
        Readings(night=True, sun_up=False, moon_phase="full_moon", moon_up=False)
    )
    assert "full_moon" not in below.flags


def test_new_moon_is_a_starry_night_without_a_bonus():
    e = evaluate(Readings(night=True, sun_up=False, moon_illumination=0.0))
    assert "new_moon" in e.flags
    assert e.bonus == {}


def _utc(y, m, d) -> float:
    import datetime as dt

    return dt.datetime(y, m, d, tzinfo=dt.UTC).timestamp()


@pytest.mark.parametrize(
    ("when", "expected"),
    [
        (_utc(2026, 11, 24), "full_moon"),  # age 14.1 d
        (_utc(2026, 11, 9), "new_moon"),  # age 28.6 d: the window wraps the month end
        (_utc(2026, 11, 11), "new_moon"),  # just past age 0
        (_utc(2026, 11, 17), None),  # a quarter
        (_utc(2026, 12, 2), None),  # the other quarter
    ],
)
def test_moon_by_date_full_and_new_windows_wrap(when, expected):
    assert home.moon_by_date(when) == expected


def test_moon_from_the_date_when_no_sensor_is_mapped():
    e = evaluate(Readings(night=True, sun_up=False, moon_date="full_moon"))
    assert "full_moon" in e.flags
    assert e.bonus["happiness"] == R.HOME_MOON_HAPPINESS
    new = evaluate(Readings(night=True, sun_up=False, moon_date="new_moon"))
    assert "new_moon" in new.flags


def test_a_mapped_moon_sensor_wins_over_the_date():
    e = evaluate(
        Readings(
            night=True,
            sun_up=False,
            moon_phase="waxing_crescent",
            moon_date="full_moon",
        )
    )
    assert "full_moon" not in e.flags


def test_the_date_moon_needs_night():
    day = evaluate(Readings(night=False, sun_up=True, moon_date="full_moon"))
    assert "full_moon" not in day.flags and "happiness" not in day.bonus


def test_thunder_hides_it_under_a_blanket_and_wind_is_noticed():
    storm = evaluate(Readings(night=False, condition="lightning"))
    assert "storm" in storm.flags and storm.requests == ["blanket"]
    both = evaluate(Readings(night=False, condition="lightning-rainy"))
    assert {"storm", "rainy"} <= set(both.flags) and both.requests == ["blanket"]
    assert "windy" in evaluate(Readings(night=False, condition="windy")).flags


def test_passing_moments_sunset_morning_and_tv():
    from custom_components.virtual_pet.home import HouseMoments

    m = HouseMoments()
    day = Readings(night=False, sun_up=True)
    assert m.update(day, 0, True, False, "d1") == []  # first look: nothing to compare
    dusk = Readings(night=False, sun_up=False)
    assert m.update(dusk, 60, True, False, "d1") == [{"type": "sunset"}]
    # Asleep through sunrise: no comment, but it's remembered.
    assert m.update(day, 120, False, False, "d2") == []

    stir = Readings(night=False, sun_up=True, motion_recent=True)
    assert m.update(stir, 200, True, True, "d2") == [{"type": "good_morning"}]
    assert m.update(stir, 300, True, True, "d2") == []  # once a day

    show = Readings(night=False, sun_up=True, tv=True, tv_title="Bluey")
    assert m.update(show, 400, True, False, "d2") == [
        {"type": "watching", "title": "Bluey"}
    ]
    other = Readings(night=False, sun_up=True, tv=True, tv_title="News")
    assert m.update(other, 500, True, False, "d2") == []  # too soon after the last
    song = Readings(
        night=True, sun_up=False, music_title="Clair de lune", music_artist="Debussy"
    )
    later = 400 + 21 * 60
    assert m.update(song, later, True, False, "d2") == [
        {"type": "sunset"},
        {"type": "listening", "title": "Clair de lune", "artist": "Debussy"},
        {"type": "tv_off_late"},
    ]


def test_news_text_tidies_and_cuts_at_a_word():
    assert home.news_text("  Tamagotchi\n turns   30! ", 80) == "Tamagotchi turns 30!"
    assert home.news_text(None, 80) == ""
    long = "Digimon " * 20
    cut = home.news_text(long, R.NEWS_HEADLINE_MAX)
    assert len(cut) <= R.NEWS_HEADLINE_MAX
    assert cut.endswith("Digimon…")
    # One very long word is cut where it has to be.
    assert home.news_text("x" * 100, 10) == "x" * 9 + "…"


def test_moon_illumination_in_percent_is_read_by_its_unit():
    from homeassistant.core import State

    from custom_components.virtual_pet.watcher import Watcher

    def lit(value: str, unit: str | None) -> float | None:
        attrs = {"unit_of_measurement": unit} if unit else {}
        return Watcher._fraction(State("sensor.moon", value, attrs))

    assert lit("1", "%") == 0.01  # almost new, not full
    assert lit("0.5", "%") == 0.005
    assert lit("50", None) == 0.5
    assert lit("0.5", None) == 0.5


def test_wind_speed_makes_it_windy_whatever_the_condition():
    assert "windy" not in evaluate(Readings(night=False, wind_kmh=12)).flags
    assert "windy" in evaluate(Readings(night=False, wind_kmh=R.HOME_WINDY_KMH)).flags
    gusts = Readings(night=False, condition="rainy", wind_kmh=20, gust_kmh=60)
    assert {"rainy", "windy"} <= set(evaluate(gusts).flags)


def weather(**kw) -> Readings:
    return Readings(night=False, sun_up=True, **kw)


def test_rain_starting_and_stopping_is_remarked_on_once_in_a_while():
    m = home.HouseMoments()
    assert m.update(weather(condition="cloudy"), 0, True, False, "d1") == []
    rain = weather(condition="rainy")
    assert m.update(rain, MIN, True, False, "d1") == [
        {"type": "weather", "change": "rain_started"}
    ]
    # A shower stopping soon after: too soon for another remark, and missed.
    assert m.update(weather(condition="cloudy"), 5 * MIN, True, False, "d1") == []
    assert m.update(weather(condition="cloudy"), 30 * MIN, True, False, "d1") == []
    # Rain again within the cooldown for that remark: nothing.
    assert m.update(rain, 40 * MIN, True, False, "d1") == []
    # Rain stopping with the sun out: a rainbow.
    sun = weather(condition="sunny")
    assert m.update(sun, 60 * MIN, True, False, "d1") == [
        {"type": "weather", "change": "rainbow"}
    ]


def test_weather_changes_while_asleep_are_noted_not_remarked_on():
    m = home.HouseMoments()
    m.update(weather(condition="cloudy"), 0, True, False, "d1")
    assert m.update(weather(condition="rainy"), MIN, False, False, "d1") == []
    # Still raining when it wakes: nothing new to say.
    assert m.update(weather(condition="rainy"), HOUR, True, False, "d1") == []
    stop = weather(condition="cloudy")
    assert m.update(stop, 2 * HOUR, True, False, "d1") == [
        {"type": "weather", "change": "rain_stopped"}
    ]


def test_the_sun_coming_out_needs_a_long_grey_spell():
    m = home.HouseMoments()
    grey, sun = weather(condition="cloudy"), weather(condition="sunny")
    m.update(grey, 0, True, False, "d1")
    assert m.update(sun, HOUR, True, False, "d1") == []  # a short spell
    m.update(grey, 2 * HOUR, True, False, "d1")
    assert m.update(sun, 4 * HOUR + MIN, True, False, "d1") == [
        {"type": "weather", "change": "sun_out"}
    ]
    # Sunrise into sun isn't "the sun came out".
    m = home.HouseMoments()
    m.update(
        Readings(night=True, sun_up=False, condition="cloudy"), 0, True, False, "d1"
    )
    assert m.update(sun, 5 * HOUR, True, False, "d1") == [{"type": "sunrise"}]


def test_snow_starting():
    m = home.HouseMoments()
    m.update(weather(condition="cloudy"), 0, True, False, "d1")
    assert m.update(weather(condition="snowy"), MIN, True, False, "d1") == [
        {"type": "weather", "change": "snow_started"}
    ]


def test_a_hot_or_freezing_day_is_said_once_a_day():
    m = home.HouseMoments()
    hot = weather(outdoor_c=33.0)
    assert m.update(hot, 0, True, False, "d1") == [
        {"type": "weather", "change": "hot", "temp_c": 33.0}
    ]
    assert m.update(hot, 3 * HOUR, True, False, "d1") == []
    assert m.update(hot, 24 * HOUR, True, False, "d2")[0]["change"] == "hot"
    cold = weather(outdoor_c=-12.0)
    assert m.update(cold, 48 * HOUR, False, False, "d3") == []  # asleep: later
    assert m.update(cold, 50 * HOUR, True, False, "d3")[0]["change"] == "cold"


def day(condition=None, high=None, low=None) -> home.DayForecast:
    return home.DayForecast(condition, high, low)


@pytest.mark.parametrize(
    ("today", "before", "kind"),
    [
        (day("lightning-rainy", 20), None, "storm"),
        (day("snowy", -1, -5), None, "snow"),
        (day("sunny", 32), None, "hot"),
        (day("cloudy", -2, -6), None, "cold"),
        (day("cloudy", 3, -11), None, "cold"),
        (day("cloudy", 22), day("cloudy", 12), "warmer"),
        (day("cloudy", 8), day("cloudy", 17), "colder"),
        (day("rainy", 14), day("rainy", 15), "rain"),
        (day("sunny", 16), day("rainy", 13), "sunny"),
        (day("sunny", 16), day("sunny", 15), None),  # an ordinary day
        (day("cloudy"), None, None),
        (None, None, None),
    ],
)
def test_forecast_talk_only_for_days_worth_a_word(today, before, kind):
    talk = home.forecast_moment(today, before, "tomorrow")
    assert (talk and talk["kind"]) == kind
    if talk:
        assert talk["type"] == "forecast" and talk["when"] == "tomorrow"


def test_waking_by_hand_before_bedtime_beats_the_dark_house():
    # Bedtime 18:00: at 17:10 the house may already put it to bed (the hour
    # before bedtime). A hand wake then must hold, like one in the night.
    quiet = settings_with(home.HomeEffect(dark_and_quiet=True))
    quiet = model.Settings(tz=UTC, home=quiet.home, bedtime=model.parse_hhmm("18:00"))
    pet = hatched(at(17, 0))
    model.advance(pet, at(17, 10), quiet, NoLuck(), max_gap=None)
    assert pet.asleep  # the house put it to bed
    model.set_lights_out(pet, False, at(17, 10), quiet)
    assert not pet.asleep
    model.advance(pet, at(17, 25), quiet, NoLuck(), max_gap=None)
    assert not pet.asleep  # the switch is the top authority for a while


# --- ha-signals H3: the house answers blanket and fan requests ---------------


def test_heating_on_stops_the_chilly_blanket_ask():
    cold = evaluate(Readings(night=False, indoor_c=15))
    assert cold.requests == ["blanket"] and cold.reason() == "brr... a blanket?"
    warmed = evaluate(Readings(night=False, indoor_c=15, heating_on=True))
    assert warmed.requests == []
    assert warmed.reason() == "nice and cozy"  # the owner's Q-B: cozy, not chilly


def test_rain_still_asks_for_a_blanket_while_the_heating_is_on():
    e = evaluate(Readings(night=False, condition="rainy", indoor_c=15, heating_on=True))
    assert e.requests == ["blanket"]
    storm = evaluate(
        Readings(night=False, condition="lightning", indoor_c=21, heating_on=True)
    )
    assert storm.requests == ["blanket"]


def test_cooling_on_stops_the_warm_fan_ask():
    assert evaluate(Readings(night=False, indoor_c=29)).requests == ["fan"]
    cooled = evaluate(Readings(night=False, indoor_c=29, cooling_on=True))
    assert cooled.requests == []
    assert cooled.reason() == "ahh, that breeze"
    # The heating being on says nothing about a warm room.
    assert evaluate(Readings(night=False, indoor_c=29, heating_on=True)).requests == [
        "fan"
    ]


def moments(m, r, today="2026-11-01", **kw):
    return [e for e in m.update(r, 0.0, kw.pop("awake", True), False, today, **kw)]


def cold(**kw):
    return Readings(night=False, indoor_c=15, **kw)


def test_heating_turning_on_while_chilly_is_a_house_moment():
    m = home.HouseMoments()
    assert moments(m, cold()) == []  # the first reading is a baseline
    assert moments(m, cold(heating_on=True)) == [
        {"type": "house_answered", "request": "blanket"}
    ]
    assert moments(m, cold(heating_on=True)) == []  # still on: nothing new


def test_heating_already_on_or_a_comfortable_room_gives_no_moment():
    m = home.HouseMoments()
    assert moments(m, cold(heating_on=True)) == []  # on at the first reading
    m = home.HouseMoments()
    moments(m, Readings(night=False, indoor_c=21))
    assert moments(m, Readings(night=False, indoor_c=21, heating_on=True)) == []
    m = home.HouseMoments()
    moments(m, cold(fireplace=True))
    assert moments(m, cold(fireplace=True, heating_on=True)) == []  # not asking


def test_the_house_waits_for_an_awake_pet_and_an_open_request():
    m = home.HouseMoments()
    moments(m, cold())
    assert moments(m, cold(heating_on=True), awake=False) == []
    m = home.HouseMoments()
    moments(m, cold())
    assert (
        moments(m, cold(heating_on=True), satisfied=frozenset({"blanket"})) == []
    )  # already tucked in


def test_cooling_turning_on_while_warm_is_a_house_moment():
    m = home.HouseMoments()
    warm = Readings(night=False, indoor_c=29)
    moments(m, warm)
    assert moments(m, Readings(night=False, indoor_c=29, cooling_on=True)) == [
        {"type": "house_answered", "request": "fan"}
    ]


def test_the_house_answers_at_most_twice_a_day():
    m = home.HouseMoments()
    moments(m, cold())
    heard = 0
    for _ in range(3):
        heard += len(moments(m, cold(heating_on=True)))
        moments(m, cold())
    assert heard == R.HOUSE_ANSWERS_PER_DAY == 2
    moments(m, cold())
    assert len(moments(m, cold(heating_on=True), today="2026-11-02")) == 1


def test_the_house_tucks_the_pet_in_without_a_care_entry():
    pet = hatched(at(12, 0))
    before = pet.happiness
    events = model.house_answer(pet, "blanket", at(12, 0))
    assert events == [{"type": "house_answered", "request": "blanket"}]
    assert pet.cozy_until == at(12, 0) + R.COMFORT_MINUTES * 60
    assert pet.happiness == min(100.0, before + R.BLANKET_HAPPINESS)
    assert pet.care_log == []
    assert model.house_answer(pet, "blanket", at(12, 30)) == []  # already cozy
    fan = model.house_answer(pet, "fan", at(12, 30))
    assert fan == [{"type": "house_answered", "request": "fan"}]
    pet.asleep = True
    assert model.house_answer(pet, "fan", at(18, 0)) == []
