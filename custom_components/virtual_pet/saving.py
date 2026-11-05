"""A delayed save with a ceiling, shared by the pet's and the people's stores.

Home Assistant's Store.async_delay_save moves its write back on every call made
before the write is due, so a house sensor that changes every few seconds (each
change saves) would put the write off until shutdown, and a crash would lose
everything since the last start. CappedSave keeps the delayed save on every
call, and once a change has waited R.SAVE_MAX_DELAY it writes at once.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from homeassistant.core import CoreState, HomeAssistant, callback
from homeassistant.helpers.storage import Store

from . import rates as R


class CappedSave:
    """store.async_delay_save(data_func, R.SAVE_DELAY), never put off for more
    than R.SAVE_MAX_DELAY. data_func must late-bind (read the owner's current
    data when called): the owner may replace its data object after a load."""

    def __init__(
        self,
        hass: HomeAssistant,
        store: Store[Any],
        data_func: Callable[[], Any],
    ) -> None:
        self._hass = hass
        self._store = store
        self._data_func = data_func
        # Loop time of the oldest change not yet written, or None when written.
        self._dirty_since: float | None = None

    def _data(self) -> Any:
        # Called by the Store when it really writes: nothing is waiting any more.
        self._dirty_since = None
        return self._data_func()

    @callback
    def save(self) -> None:
        """Save soon; at once if a change has waited the ceiling already."""
        self._store.async_delay_save(self._data, R.SAVE_DELAY)
        if self._hass.state is CoreState.stopping:
            return  # the Store's final write takes the newest data
        now = self._hass.loop.time()
        if self._dirty_since is None:
            self._dirty_since = now
        elif now - self._dirty_since >= R.SAVE_MAX_DELAY:
            self._dirty_since = None
            self._hass.async_create_task(
                self._store.async_save(self._data_func()), eager_start=True
            )
