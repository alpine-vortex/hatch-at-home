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
from homeassistant.core import HomeAssistant, callback
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
    SelectSelectorMode,
    TimeSelector,
)
from homeassistant.util.unit_conversion import TemperatureConverter
import voluptuous as vol

from . import notify, rates as R
from .const import (
    CONF_APPLIANCE_WATTS,
    CONF_APPLIANCES,
    CONF_AQI,
    CONF_AWAY_AFTER,
    CONF_BEDTIME,
    CONF_BEDTIME_LIGHTS,
    CONF_CHORES,
    CONF_COMFORT_HIGH,
    CONF_COMFORT_LOW,
    CONF_COOLING,
    CONF_DASHBOARD,
    CONF_FIREPLACE,
    CONF_HEATING,
    CONF_HOUSE_WORDS_PRIVATE,
    CONF_INDOOR_TEMP,
    CONF_LUX,
    CONF_MEMORY,
    CONF_MOON_ALTITUDE,
    CONF_MOON_ILLUMINATION,
    CONF_MOON_PHASE,
    CONF_MOTION,
    CONF_MUSIC,
    CONF_NEW_PET,
    CONF_NEXT_WORLD,
    CONF_NOTICE_DOORBELL,
    CONF_NOTICE_ROBOT,
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
from .coordinator import RenameError, clean_name
from .defaults import default_weather
from .model import parse_hhmm
from .names import clear_device_name, name_taken, pet_name
from .people import async_erase_unless_allowed
from .species import load_catalog
from .topics import TOPICS
from .watcher import is_temperature

PET_NAMES = ("Pip", "Fern", "Nutmeg", "Mochi", "Juniper", "Pebble", "Bramble", "Clover")


class VirtualPetConfigFlow(ConfigFlow, domain=DOMAIN):
    """Set up a new device with an egg in it."""

    VERSION = 1
    MINOR_VERSION = 2  # 2: new pets start on the house's weather (ha-signals H2)

    _shown: str | None = None  # Reconfigure: the name the form showed when it opened

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> PetOptionsFlow:
        """Bedtime, the house and privacy, editable any time."""
        return PetOptionsFlow()

    def _free_name(self) -> str:
        """A default name no other pet has, so entity IDs don't get _2 suffixes."""
        return next(
            (n for n in PET_NAMES if not name_taken(self.hass, n)),
            DEFAULT_NAME,
        )

    def _household_dashboard(self) -> str | None:
        """The dashboard of the first pet here that has one."""
        for entry in self._async_current_entries():
            path = notify.dashboard_path(entry.options.get(CONF_DASHBOARD))
            if path:
                return path
        return None

    def _first_unused_world(self, keys: list[str]) -> str:
        """The first world, in catalog order, that no pet here lives in or moves to.

        A disabled pet still lives in its world, so entries count by their
        data, not their state. All taken: the default world.
        """
        used: set[str] = set()
        for entry in self._async_current_entries():
            coordinator = getattr(entry, "runtime_data", None)
            world = (
                coordinator.world
                if coordinator is not None
                else entry.data.get(CONF_WORLD)
            )
            used.add(world or DEFAULT_WORLD)
            if entry.data.get(CONF_NEXT_WORLD):
                used.add(entry.data[CONF_NEXT_WORLD])
        free = next((k for k in keys if k not in used), None)
        if free is not None:
            return free
        return DEFAULT_WORLD if DEFAULT_WORLD in keys else keys[0]

    async def _world_options(self) -> list[SelectOptionDict] | None:
        catalog = await self.hass.async_add_executor_job(load_catalog)
        if not catalog.worlds:
            return None
        return [
            SelectOptionDict(
                value=key,
                label=f"{world['name']}: "
                + ", ".join(catalog.species[s]["name"] for s in catalog.roster(key)),
            )
            for key, world in catalog.worlds.items()
        ]

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Rename the pet, or move it to another world (a pet still in its egg)."""
        return await self._reconfigure(user_input)

    async def async_step_reconfigure_hatched(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """The same form for a hatched pet, whose move waits for its next egg."""
        return await self._reconfigure(user_input)

    async def _reconfigure(self, user_input: dict[str, Any] | None) -> ConfigFlowResult:
        """Rename the pet, or move it to another world.

        A pet that has hatched stays a creature of its world; the move applies
        to its next egg. The form says which (two step ids, two labels).
        """
        entry = self._get_reconfigure_entry()
        coordinator = getattr(entry, "runtime_data", None)
        # Entries from before worlds existed keep theirs only in the coordinator;
        # with the pet not loaded, such a world is unknown (None).
        world_now = (
            coordinator.world if coordinator is not None else entry.data.get(CONF_WORLD)
        )
        current = entry.data.get(CONF_NEXT_WORLD) or world_now or DEFAULT_WORLD
        # Unloaded, it may have hatched: a move waits for the next egg.
        unhatched = (
            coordinator is not None
            and coordinator.state is not None
            and coordinator.state.species is None
        )
        if user_input is None or self._shown is None:
            # The name the form showed, kept from when it opened: a card rename
            # while the form is open must not be written back over.
            self._shown = pet_name(self.hass, entry)
        shown = self._shown
        errors: dict[str, str] = {}
        if user_input is not None:
            name = user_input[CONF_NAME].strip() or shown
            renamed = name != shown
            if renamed:
                try:
                    name = clean_name(name)
                except RenameError:
                    errors[CONF_NAME] = "bad_name"
                else:
                    renamed = name != shown
                    if renamed and name_taken(self.hass, name, entry.entry_id):
                        errors[CONF_NAME] = "name_taken"
        if user_input is not None and not errors:
            world = user_input[CONF_WORLD]
            data = {k: v for k, v in entry.data.items() if k != CONF_NEXT_WORLD}
            if world_now is not None:
                data[CONF_WORLD] = world_now
            if world_now is None and world == current:
                # Unknown world, left as shown: keep things as they were.
                if CONF_NEXT_WORLD in entry.data:
                    data[CONF_NEXT_WORLD] = entry.data[CONF_NEXT_WORLD]
            elif world != world_now:
                if unhatched:
                    data[CONF_WORLD] = world  # still an egg: it moves now
                else:
                    data[CONF_NEXT_WORLD] = world
            if renamed:
                # A device-page name would hide the new one everywhere.
                clear_device_name(self.hass, entry)
            else:
                # The name shown came from the device page, or the card renamed
                # the pet meanwhile: the entry's current title stands.
                name = entry.title
            return self.async_update_reload_and_abort(
                entry, title=name, data={**data, CONF_NAME: name}
            )
        options = await self._world_options()
        if options is None:
            return self.async_abort(reason="no_worlds")
        typed = user_input or {}  # what they had typed, when a name is taken
        return self.async_show_form(
            step_id="reconfigure" if unhatched else "reconfigure_hatched",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_NAME, default=typed.get(CONF_NAME, shown)): str,
                    vol.Required(
                        CONF_WORLD, default=typed.get(CONF_WORLD, current)
                    ): SelectSelector(
                        SelectSelectorConfig(
                            options=options, mode=SelectSelectorMode.LIST
                        )
                    ),
                }
            ),
            description_placeholders={"name": self._shown},
            errors=errors,
        )

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Name the pet and pick a world."""
        errors: dict[str, str] = {}
        if user_input is not None:
            name = user_input[CONF_NAME].strip() or self._free_name()
            try:
                name = clean_name(name)
            except RenameError:
                errors[CONF_NAME] = "bad_name"
            else:
                if name_taken(self.hass, name):
                    errors[CONF_NAME] = "name_taken"
        if user_input is not None and not errors:
            dashboard = notify.dashboard_path(user_input.get(CONF_DASHBOARD))
            weather = default_weather(self.hass, from_states=True)
            return self.async_create_entry(
                title=name,
                data={
                    CONF_NAME: name,
                    CONF_WORLD: user_input[CONF_WORLD],
                    CONF_NEW_PET: True,  # welcomed once its first save is made
                },
                options={
                    **({CONF_DASHBOARD: dashboard} if dashboard else {}),
                    **({CONF_WEATHER: weather} if weather else {}),
                },
            )
        options = await self._world_options()
        if options is None:
            return self.async_abort(reason="no_worlds")
        keys = [o["value"] for o in options]
        default = self._first_unused_world(keys)
        typed = user_input or {}  # what they had typed, when a name is taken
        # A second pet carries the household's dashboard; editable, and a cleared
        # field stays cleared when the form comes back for a taken name.
        dashboard_default = (
            self._household_dashboard()
            if user_input is None
            else typed.get(CONF_DASHBOARD)
        )
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_NAME, default=typed.get(CONF_NAME) or self._free_name()
                    ): str,
                    vol.Required(
                        CONF_WORLD, default=typed.get(CONF_WORLD, default)
                    ): SelectSelector(
                        SelectSelectorConfig(
                            options=options, mode=SelectSelectorMode.LIST
                        )
                    ),
                    vol.Optional(
                        CONF_DASHBOARD,
                        description={"suggested_value": dashboard_default},
                    ): _dashboards(self.hass),
                }
            ),
            errors=errors,
        )


def _dashboards(hass: HomeAssistant) -> SelectSelector:
    """The house's dashboards to pick from; any other path can be typed in."""
    options = [SelectOptionDict(value="/lovelace", label="Overview")]
    lovelace = hass.data.get("lovelace")  # read only, so no dependency on it
    for url_path, dashboard in (getattr(lovelace, "dashboards", None) or {}).items():
        config = getattr(dashboard, "config", None) or {}
        if url_path and url_path != "map":
            title = config.get("title") or url_path
            options.append(SelectOptionDict(value=f"/{url_path}", label=title))
    return SelectSelector(SelectSelectorConfig(options=options, custom_value=True))


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
    """Map the house to the pet, one topic at a time. Every field is optional."""

    def _fields(self) -> dict[str, tuple[Any, Any]]:
        """key -> (selector, default). Only fields with a default are required.

        Temperatures are stored in °C and shown in the owner's unit.
        """
        unit = self.hass.config.units.temperature_unit
        low, high = (40, 95) if unit == UnitOfTemperature.FAHRENHEIT else (5, 35)
        return {
            CONF_BEDTIME: (TimeSelector(), R.DEFAULT_BEDTIME + ":00"),
            CONF_WAKE_TIME: (TimeSelector(), R.DEFAULT_WAKE_TIME + ":00"),
            CONF_BEDTIME_LIGHTS: (_entities("light", True), None),
            CONF_MOTION: (
                _entities("binary_sensor", True, ["motion", "occupancy", "presence"]),
                None,
            ),
            CONF_RAIN: (
                _entities(["sensor", "binary_sensor", "input_boolean"]),
                None,
            ),
            CONF_WEATHER: (_entities("weather"), None),
            CONF_INDOOR_TEMP: (_entities("sensor", device_class="temperature"), None),
            CONF_COMFORT_LOW: (
                _number(low, high, 0.5, unit),
                self._to_unit(R.HOME_COMFORT_LOW_C),
            ),
            CONF_COMFORT_HIGH: (
                _number(low, high, 0.5, unit),
                self._to_unit(R.HOME_COMFORT_HIGH_C),
            ),
            CONF_AQI: (_entities("sensor"), None),
            CONF_SOLAR: (_entities("sensor"), None),
            CONF_ROOM_LIGHTS: (_entities("light", True), None),
            CONF_FIREPLACE: (_entities(), None),
            CONF_LUX: (_entities("sensor", True, "illuminance"), None),
            CONF_TV: (_entities("media_player", True), None),
            CONF_MUSIC: (_entities("media_player", True), None),
            CONF_ZONE: (_entities("zone"), DEFAULT_ZONE),
            CONF_AWAY_AFTER: (_number(0.5, 24, 0.5, "hours"), R.HOME_AWAY_AFTER_HOURS),
            CONF_SITTER_SETTLES: (BooleanSelector(), True),
            CONF_PRIVACY: (BooleanSelector(), True),
            CONF_HOUSE_WORDS_PRIVATE: (BooleanSelector(), False),
            CONF_MEMORY: (BooleanSelector(), True),
            CONF_HEATING: (
                _entities(["climate", "switch", "input_boolean"], True),
                None,
            ),
            CONF_COOLING: (
                _entities(["fan", "climate", "switch", "input_boolean"], True),
                None,
            ),
            CONF_NOTICE_ROBOT: (BooleanSelector(), True),
            CONF_NOTICE_DOORBELL: (BooleanSelector(), True),
            CONF_APPLIANCES: (
                _entities(["binary_sensor", "sensor", "switch"], True),
                None,
            ),
            CONF_APPLIANCE_WATTS: (_number(0, 100, 1, "W"), R.APPLIANCE_WATTS),
            CONF_CHORES: (_entities("todo", True), None),
            CONF_MOON_PHASE: (_entities("sensor"), None),
            CONF_MOON_ILLUMINATION: (_entities("sensor"), None),
            CONF_MOON_ALTITUDE: (_entities("sensor"), None),
            CONF_DASHBOARD: (_dashboards(self.hass), None),
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

    def _placeholders(self) -> dict[str, str]:
        return {"name": pet_name(self.hass, self.config_entry)}

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """The menu: one entry per topic."""
        return self.async_show_menu(
            step_id="init",
            menu_options=list(TOPICS),
            description_placeholders=self._placeholders(),
        )

    async def async_step_bedtime(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        return await self._topic_step("bedtime", user_input)

    async def async_step_people(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        return await self._topic_step("people", user_input)

    async def async_step_weather(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        return await self._topic_step("weather", user_input)

    async def async_step_room(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        return await self._topic_step("room", user_input)

    async def async_step_house(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        return await self._topic_step("house", user_input)

    async def async_step_sky(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        return await self._topic_step("sky", user_input)

    async def async_step_notifications(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        return await self._topic_step("notifications", user_input)

    def _merge(self, topic: str, entered: dict[str, Any]) -> dict[str, Any]:
        """The options after saving this topic.

        Every other topic's options are kept exactly; this topic's become what was
        entered (without empty values), in °C. A comfort value that equals the
        rounded display of the stored one keeps the stored one (no drift).
        """
        stored = self.config_entry.options
        keys = TOPICS[topic]
        kept = {k: v for k, v in stored.items() if k not in keys}
        new = dict(entered)
        defaults = {
            CONF_COMFORT_LOW: R.HOME_COMFORT_LOW_C,
            CONF_COMFORT_HIGH: R.HOME_COMFORT_HIGH_C,
        }
        for key, default in defaults.items():
            if key in new:
                if key in stored and new[key] == self._to_unit(stored[key]):
                    new[key] = stored[key]
                elif key not in stored and new[key] == self._to_unit(default):
                    new[key] = default  # the shown default, exactly: no unit drift
                else:
                    new[key] = self._to_celsius(new[key])
        if CONF_DASHBOARD in new:
            new[CONF_DASHBOARD] = notify.dashboard_path(new[CONF_DASHBOARD])
        return kept | new

    def _errors(self, topic: str, new: dict[str, Any]) -> dict[str, str]:
        """Problems with this topic's values, each on a field of the topic."""
        errors: dict[str, str] = {}
        if topic == "weather" and new.get(CONF_COMFORT_LOW, 0) >= new.get(
            CONF_COMFORT_HIGH, 1e9
        ):
            errors[CONF_COMFORT_LOW] = "comfort_range"
        if topic == "bedtime" and parse_hhmm(new[CONF_BEDTIME]) == parse_hhmm(
            new[CONF_WAKE_TIME]
        ):
            errors[CONF_WAKE_TIME] = "same_times"
        if topic == "room" and is_temperature(
            self.hass.states.get(new.get(CONF_FIREPLACE, ""))
        ):
            errors[CONF_FIREPLACE] = "fireplace_temperature"
        return errors

    async def _topic_step(
        self, topic: str, user_input: dict[str, Any] | None
    ) -> ConfigFlowResult:
        """Show one topic's form; on submit, check it and save it."""
        keys = TOPICS[topic]
        errors: dict[str, str] = {}
        if user_input is not None:
            entered = {k: v for k, v in user_input.items() if v not in (None, "", [])}
            new = self._merge(topic, entered)
            errors = self._errors(topic, new)
            if not errors:
                if self.config_entry.options.get(CONF_MEMORY, True) and not new.get(
                    CONF_MEMORY, True
                ):
                    # Memory off here: off on every pet erases everyone's, before
                    # the save (memory plan section 5). Never on a reload.
                    await async_erase_unless_allowed(
                        self.hass, self.config_entry.entry_id
                    )
                return self.async_create_entry(data=new)
            current = entered  # an error: keep what was entered, in the user's unit
        else:
            current = {k: v for k, v in self.config_entry.options.items() if k in keys}
            for key in (CONF_COMFORT_LOW, CONF_COMFORT_HIGH):
                if key in current:
                    current[key] = self._to_unit(current[key])
        fields = self._fields()
        schema: dict[Any, Any] = {}
        for key in keys:
            selector, default = fields[key]
            if default is not None:
                schema[vol.Required(key, default=current.get(key, default))] = selector
            else:
                schema[
                    vol.Optional(key, description={"suggested_value": current.get(key)})
                ] = selector
        return self.async_show_form(
            step_id=topic,
            data_schema=vol.Schema(schema),
            errors=errors,
            description_placeholders=self._placeholders(),
        )
