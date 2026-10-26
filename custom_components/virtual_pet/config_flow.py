"""Config flow: name the pet and pick its device's world.

Settings come later as options.
"""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlowWithReload,
)
from homeassistant.const import CONF_NAME, UnitOfTemperature
from homeassistant.core import callback
from homeassistant.data_entry_flow import section
from homeassistant.helpers.selector import (
    BooleanSelector,
    EntitySelector,
    EntitySelectorConfig,
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    TimeSelector,
)
from homeassistant.util.unit_conversion import TemperatureConverter
import voluptuous as vol

from . import rates as R
from .const import (
    CONF_AQI,
    CONF_AWAY_AFTER,
    CONF_BEDTIME,
    CONF_BEDTIME_LIGHTS,
    CONF_CHORES,
    CONF_COMFORT_HIGH,
    CONF_COMFORT_LOW,
    CONF_FIREPLACE,
    CONF_INDOOR_TEMP,
    CONF_LUX,
    CONF_MOON_ALTITUDE,
    CONF_MOON_ILLUMINATION,
    CONF_MOON_PHASE,
    CONF_MOTION,
    CONF_MUSIC,
    CONF_PRIVACY,
    CONF_RAIN,
    CONF_ROOM_LIGHTS,
    CONF_SITTER_SETTLES,
    CONF_SOLAR,
    CONF_TV,
    CONF_WAKE_TIME,
    CONF_WEATHER,
    CONF_WORLD,
    CONF_ZONE,
    DEFAULT_NAME,
    DEFAULT_WORLD,
    DEFAULT_ZONE,
    DOMAIN,
)
from .model import parse_hhmm
from .species import load_catalog
from .watcher import is_temperature

PET_NAMES = ("Pip", "Fern", "Nutmeg", "Mochi", "Juniper", "Pebble", "Bramble", "Clover")


class VirtualPetConfigFlow(ConfigFlow, domain=DOMAIN):
    """Set up a new device with an egg in it."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> PetOptionsFlow:
        """Bedtime, the house and privacy, editable any time."""
        return PetOptionsFlow()

    def _free_name(self) -> str:
        """A default name no other pet has, so entity IDs don't get _2 suffixes."""
        taken = {e.title.casefold() for e in self._async_current_entries()}
        return next((n for n in PET_NAMES if n.casefold() not in taken), DEFAULT_NAME)

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Name the pet and pick a world."""
        if user_input is not None:
            name = user_input[CONF_NAME].strip() or self._free_name()
            return self.async_create_entry(
                title=name,
                data={CONF_NAME: name, CONF_WORLD: user_input[CONF_WORLD]},
            )
        catalog = await self.hass.async_add_executor_job(load_catalog)
        if not catalog.worlds:
            return self.async_abort(reason="no_worlds")
        options = [
            SelectOptionDict(
                value=key,
                label=f"{world['name']}: "
                + ", ".join(catalog.species[s]["name"] for s in catalog.roster(key)),
            )
            for key, world in catalog.worlds.items()
        ]
        default = (
            DEFAULT_WORLD if DEFAULT_WORLD in catalog.worlds else options[0]["value"]
        )
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_NAME, default=self._free_name()): str,
                    vol.Required(CONF_WORLD, default=default): SelectSelector(
                        SelectSelectorConfig(options=options)
                    ),
                }
            ),
        )


def _entities(
    domain: str | list[str] | None = None,
    multiple: bool = False,
    device_class: Any = None,
) -> EntitySelector:
    config = EntitySelectorConfig(multiple=multiple)
    if domain:
        config["domain"] = domain
    if device_class:
        config["device_class"] = device_class
    return EntitySelector(config)


def _number(low: float, high: float, step: float, unit: str) -> NumberSelector:
    return NumberSelector(
        NumberSelectorConfig(
            min=low,
            max=high,
            step=step,
            unit_of_measurement=unit,
            mode=NumberSelectorMode.BOX,
        )
    )


class PetOptionsFlow(OptionsFlowWithReload):
    """Map the house to the pet. Every field is optional; unmapped is skipped."""

    def _sections(self) -> dict[str, list[tuple[str, Any, Any]]]:
        """section -> [(key, selector, default)]. Only fields with a default are required.

        Temperatures are stored in °C and shown in the owner's unit.
        """
        unit = self.hass.config.units.temperature_unit
        low, high = (40, 95) if unit == UnitOfTemperature.FAHRENHEIT else (5, 35)
        return {
            "sleep": [
                (CONF_BEDTIME, TimeSelector(), R.DEFAULT_BEDTIME + ":00"),
                (CONF_WAKE_TIME, TimeSelector(), R.DEFAULT_WAKE_TIME + ":00"),
                (CONF_BEDTIME_LIGHTS, _entities("light", True), None),
                (
                    CONF_MOTION,
                    _entities(
                        "binary_sensor", True, ["motion", "occupancy", "presence"]
                    ),
                    None,
                ),
            ],
            "weather": [
                (
                    CONF_RAIN,
                    _entities(["sensor", "binary_sensor", "input_boolean"]),
                    None,
                ),
                (CONF_WEATHER, _entities("weather"), None),
                (
                    CONF_INDOOR_TEMP,
                    _entities("sensor", device_class="temperature"),
                    None,
                ),
                (
                    CONF_COMFORT_LOW,
                    _number(low, high, 0.5, unit),
                    self._to_unit(R.HOME_COMFORT_LOW_C),
                ),
                (
                    CONF_COMFORT_HIGH,
                    _number(low, high, 0.5, unit),
                    self._to_unit(R.HOME_COMFORT_HIGH_C),
                ),
                (CONF_AQI, _entities("sensor"), None),
                (CONF_SOLAR, _entities("sensor"), None),
            ],
            "room": [
                (CONF_ROOM_LIGHTS, _entities("light", True), None),
                (CONF_FIREPLACE, _entities(), None),
                (CONF_LUX, _entities("sensor", True, "illuminance"), None),
            ],
            "activity": [
                (CONF_ZONE, _entities("zone"), DEFAULT_ZONE),
                (CONF_AWAY_AFTER, _number(0.5, 24, 0.5, "h"), R.HOME_AWAY_AFTER_HOURS),
                (CONF_SITTER_SETTLES, BooleanSelector(), True),
                (CONF_TV, _entities("media_player", True), None),
                (CONF_MUSIC, _entities("media_player", True), None),
                (CONF_CHORES, _entities("todo", True), None),
            ],
            "sky": [
                (CONF_MOON_PHASE, _entities("sensor"), None),
                (CONF_MOON_ILLUMINATION, _entities("sensor"), None),
                (CONF_MOON_ALTITUDE, _entities("sensor"), None),
            ],
            "privacy": [
                (CONF_PRIVACY, BooleanSelector(), True),
            ],
        }

    def _to_unit(self, celsius: float) -> float:
        unit = self.hass.config.units.temperature_unit
        return (
            round(
                TemperatureConverter.convert(celsius, UnitOfTemperature.CELSIUS, unit)
                * 2
            )
            / 2
        )

    def _to_celsius(self, value: float) -> float:
        unit = self.hass.config.units.temperature_unit
        return round(
            TemperatureConverter.convert(value, unit, UnitOfTemperature.CELSIUS), 2
        )

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            flat: dict[str, Any] = {}
            for group in user_input.values():
                flat.update({k: v for k, v in group.items() if v not in (None, "", [])})
            for key in (CONF_COMFORT_LOW, CONF_COMFORT_HIGH):
                if key in flat:
                    flat[key] = self._to_celsius(flat[key])
            if flat.get(CONF_COMFORT_LOW, 0) >= flat.get(CONF_COMFORT_HIGH, 1e9):
                errors["weather"] = "comfort_range"
            if parse_hhmm(flat[CONF_BEDTIME]) == parse_hhmm(flat[CONF_WAKE_TIME]):
                errors["sleep"] = "same_times"
            if is_temperature(self.hass.states.get(flat.get(CONF_FIREPLACE, ""))):
                errors["room"] = "fireplace_temperature"
            if not errors:
                return self.async_create_entry(data=flat)

        current = dict(self.config_entry.options)
        for key in (CONF_COMFORT_LOW, CONF_COMFORT_HIGH):
            if key in current:
                current[key] = self._to_unit(current[key])
        schema: dict[Any, Any] = {}
        for name, fields in self._sections().items():
            inner: dict[Any, Any] = {}
            for key, selector, default in fields:
                if default is not None:
                    inner[vol.Required(key, default=current.get(key, default))] = (
                        selector
                    )
                else:
                    inner[
                        vol.Optional(
                            key, description={"suggested_value": current.get(key)}
                        )
                    ] = selector
            schema[vol.Required(name)] = section(
                vol.Schema(inner), {"collapsed": name not in ("sleep", "weather")}
            )
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(schema),
            errors=errors,
            description_placeholders={"name": self.config_entry.title},
        )
