"""Talking to the pet through Assist: how's it doing, and caring for it.

Two intents. The built-in agent reaches them through sentences the owner copies
in (docs/custom_sentences/en/virtual_pet.yaml); LLM agents reach them through
the tools in llm.py. Either way, only pets with an entity exposed to that
assistant can be found.
"""

from __future__ import annotations

import re
from typing import override

from homeassistant.components.homeassistant import async_should_expose
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er, intent
from homeassistant.util import dt as dt_util
import probatio

from . import model
from .const import DOMAIN
from .coordinator import PetConfigEntry, PetCoordinator

INTENT_STATUS = "VirtualPetStatus"
INTENT_CARE = "VirtualPetCare"

SLOT_PET = "pet"
SLOT_ACTION = "action"

LIGHTS_OUT = "lights_out"
CARE_ACTIONS = (*model.ACTIONS, *model.REQUEST_ACTIONS, LIGHTS_OUT)

# "Pip is ...", then what the pet says.
MOOD_WORDS = {
    "away": "at the sitter's",
    "egg": "still in its egg",
    "sick": "sick",
    "asleep": "asleep",
    "calling": "calling for you",
    "hungry": "hungry",
    "dirty": "waiting for a clean-up",
    "sleepy": "sleepy",
    "bored": "bored",
    "excited": "excited",
    "cozy": "cozy",
    "content": "content",
}

# "Pip ..." after a care action that did something.
DONE = {
    "feed": "is eating",
    "snack": "loved the snack",
    "play": "had fun playing",
    "clean": "has a clean home again",
    "medicine": "took the medicine",
    "scold": "got the message",
    "praise": "is beaming",
    "blanket": "is tucked in",
    "fan": "is cooling off",
    LIGHTS_OUT: "is settling down to sleep",
}

# "Pip ..." when an action did nothing, by result code.
REFUSED = {
    "egg": "hasn't hatched yet",
    "asleep": "is asleep",
    "away": "is at the sitter's",
    "full": "is full",
    "too_tired": "is too tired to play",
    "already_clean": "is already clean",
    "not_sick": "isn't sick",
    "unfair": "wasn't misbehaving, so it's a little puzzled",
    "spoiled": "was only fussing for attention, but it loved the praise",
    "not_needed": "doesn't need that right now",
}


def spoken_status(
    name: str, mood: str, reason: str, traits: list[str], nickname: str | None
) -> str:
    """ "Hi, sunbeam! Pip is cozy: toasty by the fire." The greeting first; the
    pet's reason without the marks a voice would read out (*, ~, ♪), and left
    out when it only repeats the mood ("at the sitter's: at the sitter's")."""
    said = re.sub(r"[*~♪♥]", "", reason).strip(" .")
    said = re.sub(r"\s+", " ", said)
    speech = f"{name} is {mood}"
    if (
        said
        and said.casefold() not in mood.casefold()
        and mood.casefold() not in said.casefold()
    ):
        end = "" if said.endswith(("!", "?", "…")) else "."
        speech += f": {said}{end}"
    else:
        speech += "."
    if traits:
        speech += f" Traits: {', '.join(traits)}."
    return f"Hi, {nickname}! {speech}" if nickname else speech


async def async_setup_intents(hass: HomeAssistant) -> None:
    """Register the pet's intents (once, for all pets)."""
    intent.async_register(hass, StatusIntent())
    intent.async_register(hass, CareIntent())


def reachable_pets(hass: HomeAssistant, assistant: str | None) -> list[PetCoordinator]:
    """Loaded pets with at least one entity exposed to the assistant.

    Without an assistant (an intent fired from code) every pet counts.
    """
    entries: list[PetConfigEntry] = hass.config_entries.async_loaded_entries(DOMAIN)
    registry = er.async_get(hass)
    return [
        entry.runtime_data
        for entry in entries
        if entry.runtime_data.state is not None
        and (
            assistant is None
            or any(
                async_should_expose(hass, assistant, e.entity_id)
                for e in er.async_entries_for_config_entry(registry, entry.entry_id)
            )
        )
    ]


def find_pet(intent_obj: intent.Intent, name: str | None) -> PetCoordinator:
    """The pet a sentence or tool call means. One pet needs no name."""
    pets = reachable_pets(intent_obj.hass, intent_obj.assistant)
    if not pets:
        raise intent.IntentHandleError("There's no pet here to talk to")
    if not name:
        if len(pets) == 1:
            return pets[0]
        names = " or ".join(pet_name(p) for p in pets)
        raise intent.IntentHandleError(f"Which pet, {names}?")
    wanted = name.strip().casefold()
    for pet in pets:
        if wanted in (pet_name(pet).casefold(), pet.config_entry.title.casefold()):
            return pet
    raise intent.IntentHandleError(f"I don't know a pet called {name}")


def pet_name(pet: PetCoordinator) -> str:
    assert pet.state is not None
    return pet.state.name or pet.config_entry.title


def _pet_slot() -> probatio.Optional:
    return probatio.Optional(
        SLOT_PET, description="The pet's name; leave out if there is only one pet"
    )


class StatusIntent(intent.IntentHandler):
    """How's the pet? Answers with its mood and what it says."""

    intent_type = INTENT_STATUS
    description = (
        "Asks a virtual pet how it is: its mood, what it says, and its stats "
        "(0-100; weight is healthy between 25 and 75)"
    )
    slot_schema = {_pet_slot(): intent.non_empty_string}

    @override
    async def async_handle(self, intent_obj: intent.Intent) -> intent.IntentResponse:
        slots = self.async_validate_slots(intent_obj.slots)
        pet = find_pet(intent_obj, slots.get(SLOT_PET, {}).get("value"))
        state = pet.state
        assert state is not None
        mood, flags, reason = pet.current_mood()
        name = pet_name(pet)
        response = intent_obj.create_response()
        response.response_type = intent.IntentResponseType.QUERY_ANSWER
        traits = [t.replace("_", " ") for t in state.traits]
        level, nickname = pet.bond_for(intent_obj.context.user_id)
        response.async_set_speech(
            spoken_status(name, MOOD_WORDS[mood], reason, traits, nickname)
        )
        response.async_set_speech_slots(
            {
                "pet": name,
                "mood": mood,
                "reason": reason,
                "flags": flags,
                "stage": model.life_stage(state),
                "species": pet.species_names.get(state.species or "", state.species),
                **{stat: round(getattr(state, stat)) for stat in model.STATS},
                # Learned habits, 1-3 stars each, in the order it learned them.
                "traits": {t: model.trait_level(state, t) for t in state.traits},
                "requests": model.requests(
                    state, dt_util.utcnow().timestamp(), pet.settings
                ),
                # The bond with whoever is asking (1-10), and what it calls them.
                "bond": level or None,
                "nickname": nickname,
            }
        )
        return response


class CareIntent(intent.IntentHandler):
    """Feed the pet, play with it, clean up, and so on, as the buttons do."""

    intent_type = INTENT_CARE
    description = (
        "Cares for a virtual pet, like pressing one of its buttons. blanket and "
        "fan only work when the pet asks for them; scold only helps when it is "
        "whining for attention"
    )
    slot_schema = {
        _pet_slot(): intent.non_empty_string,
        probatio.Required(SLOT_ACTION, description="What to do"): probatio.In(
            CARE_ACTIONS
        ),
    }

    @override
    async def async_handle(self, intent_obj: intent.Intent) -> intent.IntentResponse:
        slots = self.async_validate_slots(intent_obj.slots)
        pet = find_pet(intent_obj, slots.get(SLOT_PET, {}).get("value"))
        action = slots[SLOT_ACTION]["value"]
        name = pet_name(pet)
        if action == LIGHTS_OUT:
            await pet.async_set_lights_out(True, intent_obj.context)
            result = model.OK
        else:
            result = await pet.async_action(action, intent_obj.context)
        response = intent_obj.create_response()
        if result == model.OK:
            nickname = pet.bond_for(intent_obj.context.user_id)[1]
            # No thanks for a scold.
            thanks = f" Thanks, {nickname}!" if nickname and action != "scold" else ""
            response.async_set_speech(f"{name} {DONE[action]}.{thanks}")
        else:
            response.async_set_speech(f"{name} {REFUSED.get(result, 'did nothing')}.")
        response.async_set_speech_slots(
            {"pet": name, "action": action, "result": result}
        )
        return response
