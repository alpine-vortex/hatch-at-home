"""The missing-entities repair: find what's gone, and let the owner forget it."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from homeassistant.components.repairs import RepairsFlow, RepairsFlowResult
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
import voluptuous as vol

from .const import CONF_CHORES, DEFAULT_ZONE
from .names import pet_name
from .topics import topics_text
from .watcher import Watcher


def missing_entity_ids(hass: HomeAssistant, options: Mapping[str, Any]) -> list[str]:
    """Mapped entities that no longer exist (renamed or removed), sorted.

    An entity that exists but is unavailable is fine: the watcher holds its last
    value for a while and then ignores it. sun.sun and the default zone are always
    watched, not picked by the owner.
    """
    registry = er.async_get(hass)
    mapped = [
        e
        for e in Watcher(hass, options).entity_ids()
        if e not in ("sun.sun", DEFAULT_ZONE)
    ]
    mapped += options.get(CONF_CHORES) or []
    return sorted(
        e
        for e in set(mapped)
        if hass.states.get(e) is None and registry.async_get(e) is None
    )


def placeholders(
    hass: HomeAssistant, entry: ConfigEntry, missing: list[str]
) -> dict[str, str]:
    """The words the repair's texts fill in."""
    return {
        "pet": pet_name(hass, entry),
        "entities": ", ".join(missing),
        "topics": topics_text(entry.options, missing),
    }


def forget(options: Mapping[str, Any], missing: list[str]) -> dict[str, Any]:
    """The options without the missing entity ids, everything else as it was.

    A list drops those items (and the key, if nothing is left); a single value
    that is one of them drops the key.
    """
    gone = set(missing)
    kept: dict[str, Any] = {}
    for key, value in options.items():
        if isinstance(value, list) and gone.intersection(
            v for v in value if isinstance(v, str)
        ):
            rest = [v for v in value if not (isinstance(v, str) and v in gone)]
            if rest:
                kept[key] = rest
        elif isinstance(value, str) and value in gone:
            continue
        else:
            kept[key] = value
    return kept


class ForgetMissingFlow(RepairsFlow):
    """One step, no fields: forget the entities that are gone."""

    def __init__(self, entry_id: str) -> None:
        self._entry_id = entry_id

    def _entry(self) -> ConfigEntry | None:
        return self.hass.config_entries.async_get_entry(self._entry_id)

    async def async_step_init(
        self, user_input: dict[str, str] | None = None
    ) -> RepairsFlowResult:
        return await self.async_step_confirm()

    async def async_step_confirm(
        self, user_input: dict[str, str] | None = None
    ) -> RepairsFlowResult:
        entry = self._entry()
        if entry is None:
            return self.async_abort(reason="entry_gone")
        # Recomputed now, not read from the issue: one that came back is kept.
        missing = missing_entity_ids(self.hass, entry.options)
        if user_input is None:
            return self.async_show_form(
                step_id="confirm",
                data_schema=vol.Schema({}),
                description_placeholders=placeholders(self.hass, entry, missing),
            )
        if missing:
            self.hass.config_entries.async_update_entry(
                entry, options=forget(entry.options, missing)
            )
            await self.hass.config_entries.async_reload(entry.entry_id)
        return self.async_create_entry(data={})


async def async_create_fix_flow(
    hass: HomeAssistant,
    issue_id: str,
    data: dict[str, str | int | float | None] | None,
) -> RepairsFlow:
    """The fix for a pet's missing-entities issue (its data names the entry)."""
    return ForgetMissingFlow(str((data or {}).get("entry_id", "")))
