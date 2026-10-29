"""Copying a damaged save file aside before anything is saved over it.

The copy sits next to the file in .storage, named <key>.damaged.<local time>,
so a second incident never overwrites the first. A repair issue names it, and
the owner can rename it back once it's fixed.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.util import dt as dt_util

from .const import DOMAIN

NOTHING = object()  # no data was read (Store gave None or raised)


async def async_backup(
    hass: HomeAssistant, key: str, version: int, data: Any = NOTHING
) -> str | None:
    """The backup's file name in .storage, or None if there was nothing left.

    The file's own bytes when it's still there. Otherwise what was read from
    it, in the Store's wrapper so a rename restores it. Otherwise (Home
    Assistant moved an undecodable file aside) its newest .corrupt copy.
    """
    stamp = dt_util.now().strftime("%Y%m%d-%H%M%S")

    def copy() -> str | None:
        folder = Path(hass.config.path(".storage"))
        source = folder / key
        if source.is_file():
            content = source.read_bytes()
        elif data is not NOTHING:
            wrapper = {"version": version, "minor_version": 1, "key": key, "data": data}
            content = json.dumps(wrapper, indent=4).encode()
        else:
            corrupt = sorted(folder.glob(f"{key}.corrupt.*"))
            return corrupt[-1].name if corrupt else None
        name, n = f"{key}.damaged.{stamp}", 1
        while (folder / name).exists():  # two in the same second
            name, n = f"{key}.damaged.{stamp}-{n}", n + 1
        folder.mkdir(parents=True, exist_ok=True)
        (folder / name).write_bytes(content)
        return name

    return await hass.async_add_executor_job(copy)


async def async_kept_backup(hass: HomeAssistant, issue_id: str) -> str | None:
    """The backup a raised repair names, if it's still in .storage."""
    found = ir.async_get(hass).async_get_issue(DOMAIN, issue_id)
    name = (found and found.translation_placeholders or {}).get("backup")
    if not name:
        return None
    path = Path(hass.config.path(".storage", name))
    return name if await hass.async_add_executor_job(path.is_file) else None


async def async_clear_if_restored(hass: HomeAssistant, issue_id: str) -> None:
    """After a clean load, clear a damaged-file repair whose backup is gone
    (renamed back over the save, as its steps say). One whose backup is still
    there stays: a salvaged file loads cleanly too. One that names no backup
    (the file was missing) stays until it's dismissed."""
    found = ir.async_get(hass).async_get_issue(DOMAIN, issue_id)
    if found is None or not (found.translation_placeholders or {}).get("backup"):
        return
    if await async_kept_backup(hass, issue_id) is None:
        ir.async_delete_issue(hass, DOMAIN, issue_id)
