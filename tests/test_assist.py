"""Talking to the pet through Assist: the intents, the LLM tools, the sentences."""

from __future__ import annotations

import inspect
import json
from pathlib import Path
import shutil
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.components import conversation
from homeassistant.components.homeassistant.exposed_entities import (
    async_expose_entity,
)
from homeassistant.const import CONF_NAME
from homeassistant.core import Context, HomeAssistant
from homeassistant.helpers import (
    device_registry as dr,
    entity_registry as er,
    intent,
    llm,
)
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.virtual_pet import model
from custom_components.virtual_pet.const import CONF_PRIVACY, DOMAIN
from custom_components.virtual_pet.coordinator import async_rename
from custom_components.virtual_pet.llm import PROMPT

from .test_init import STORE_KEY, hatched_pet, setup

SENTENCES = Path(__file__).parent.parent / "docs/custom_sentences/en/virtual_pet.yaml"
SPRITES = (
    Path(__file__).parent.parent / "custom_components/virtual_pet/frontend/sprites"
)


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    freezer.move_to("2026-10-26 14:00:00+00:00")
    return dt_util.utcnow().timestamp()


@pytest.fixture
async def pip(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> MockConfigEntry:
    """Pip, hatched and a little hungry, with Assist's pieces loaded."""
    hass_storage[STORE_KEY] = hatched_pet(now, hunger=30.0)
    assert await async_setup_component(hass, "homeassistant", {})
    assert await async_setup_component(hass, "intent", {})
    return await setup(hass)


async def ask(
    hass: HomeAssistant,
    intent_type: str,
    assistant: str | None = None,
    context: Context | None = None,
    **slots: str,
) -> intent.IntentResponse:
    return await intent.async_handle(
        hass,
        "test",
        intent_type,
        {k: {"value": v} for k, v in slots.items()},
        context=context,
        assistant=assistant,
    )


def speech(response: intent.IntentResponse) -> str:
    return response.speech["plain"]["speech"]


async def test_status_keeps_the_reasons_own_punctuation(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, happiness=10.0)
    assert await async_setup_component(hass, "intent", {})
    await setup(hass)
    text = speech(await ask(hass, "VirtualPetStatus"))
    assert not text.endswith(("?.", "!.", "~.", "..")), text


async def test_status_answers_in_the_pets_voice(
    hass: HomeAssistant, pip: MockConfigEntry
) -> None:
    response = await ask(hass, "VirtualPetStatus", pet="pip")
    assert response.response_type is intent.IntentResponseType.QUERY_ANSWER
    assert speech(response).startswith(
        "Pip is hungry: a little peckish. It's a child, day "
    )
    slots = response.speech_slots
    assert slots["mood"] == "hungry"
    assert slots["hunger"] == 30
    assert slots["stage"] == "child"
    assert slots["traits"] == {}
    # One pet needs no name.
    assert speech(await ask(hass, "VirtualPetStatus")) == speech(response)


async def test_status_names_the_pets_traits(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(
        now,
        hunger=30.0,
        traits=["sun_lover", "player"],
        trait_levels={"sun_lover": 2},
    )
    assert await async_setup_component(hass, "intent", {})
    await setup(hass)
    response = await ask(hass, "VirtualPetStatus")
    assert speech(response).endswith(" Traits: sun lover, player.")
    assert response.speech_slots["traits"] == {"sun_lover": 2, "player": 1}


async def test_unknown_and_ambiguous_pets(
    hass: HomeAssistant, pip: MockConfigEntry
) -> None:
    with pytest.raises(intent.IntentHandleError, match="called Moss"):
        await ask(hass, "VirtualPetStatus", pet="Moss")
    moss = MockConfigEntry(
        domain=DOMAIN,
        title="Moss",
        data={CONF_NAME: "Moss", "new_pet": True},
        entry_id="moss",
    )
    moss.add_to_hass(hass)
    assert await hass.config_entries.async_setup(moss.entry_id)
    await hass.async_block_till_done()
    with pytest.raises(intent.IntentHandleError, match="Which pet, Pip or Moss"):
        await ask(hass, "VirtualPetStatus")
    response = await ask(hass, "VirtualPetStatus", pet="Moss")
    assert speech(response).startswith("Moss is snug in its egg")


async def test_a_word_two_pets_answer_to_asks_which(
    hass: HomeAssistant, now: float
) -> None:
    """A renamed pet's old title can match too; never the first pet by luck."""
    assert await async_setup_component(hass, "intent", {})
    pip = await setup(hass)  # a fresh egg: it can still be named
    fern = MockConfigEntry(
        domain=DOMAIN,
        title="Moss",
        data={CONF_NAME: "Moss", "new_pet": True},
        entry_id="moss",
    )
    fern.add_to_hass(hass)
    assert await hass.config_entries.async_setup(fern.entry_id)
    await hass.async_block_till_done()
    hass.config_entries.async_update_entry(fern, title="Fern")
    device = dr.async_get(hass).async_get_device_by_identifier(
        (DOMAIN, fern.entry_id), fern.entry_id
    )
    dr.async_get(hass).async_update_device(device.id, name_by_user="Bog")
    await hass.async_block_till_done()
    fern.runtime_data._sync_name()
    # Fern is Moss's title, shown as Bog: one pet answers to Fern.
    response = await ask(hass, "VirtualPetStatus", pet="Fern")
    assert speech(response).startswith("Bog is snug in its egg")
    # Pip is renamed Fern (its old title is free): now two pets answer to Fern.
    await async_rename(hass, pip.entry_id, "Fern")
    with pytest.raises(intent.IntentHandleError, match="Which pet, Fern or Bog"):
        await ask(hass, "VirtualPetStatus", pet="Fern")
    response = await ask(hass, "VirtualPetStatus", pet="Bog")
    assert speech(response).startswith("Bog is snug in its egg")


async def test_care_presses_the_button_for_you(
    hass: HomeAssistant, pip: MockConfigEntry, hass_admin_user
) -> None:
    context = Context(user_id=hass_admin_user.id)
    response = await ask(hass, "VirtualPetCare", context=context, action="feed")
    assert speech(response) == "Pip is eating."
    assert int(hass.states.get("sensor.pip_hunger").state) > 30
    log = hass.states.get("sensor.pip_last_care").attributes["log"]
    assert log[0]["action"] == "feed"
    assert log[0]["by"] == hass_admin_user.name

    response = await ask(hass, "VirtualPetCare", action="scold")
    assert speech(response).startswith("Pip wasn't misbehaving")
    assert response.speech_slots["result"] == "unfair"

    response = await ask(hass, "VirtualPetCare", action="lights_out")
    assert speech(response) == "Pip is settling down to sleep."
    assert hass.states.get("switch.pip_lights_out").state == "on"
    response = await ask(hass, "VirtualPetCare", action="play")
    assert speech(response) == "Pip is asleep."

    with pytest.raises(intent.InvalidSlotInfo):
        await ask(hass, "VirtualPetCare", action="fast_forward")


async def test_privacy_keeps_the_sitter_quiet(
    hass: HomeAssistant, pip: MockConfigEntry
) -> None:
    pip.runtime_data.state.away = True
    response = await ask(hass, "VirtualPetStatus")
    assert speech(response) == "Pip is asleep."
    response = await ask(hass, "VirtualPetCare", action="feed")
    assert speech(response) == "Pip is asleep."


async def test_without_privacy_the_sitter_is_named_and_care_works(
    hass: HomeAssistant, pip: MockConfigEntry
) -> None:
    hass.config_entries.async_update_entry(
        pip, options={**pip.options, CONF_PRIVACY: False}
    )
    await hass.async_block_till_done()
    pip.runtime_data.state.away = True
    response = await ask(hass, "VirtualPetStatus")
    assert speech(response).startswith("Pip is with the sitter.")
    response = await ask(hass, "VirtualPetCare", action="feed")
    assert speech(response) == "Pip is eating."


def unexpose_all(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    registry = er.async_get(hass)
    for entity in er.async_entries_for_config_entry(registry, entry.entry_id):
        async_expose_entity(hass, "conversation", entity.entity_id, False)


async def test_only_exposed_pets_can_be_reached(
    hass: HomeAssistant, pip: MockConfigEntry
) -> None:
    # The lights-out switch is exposed by default.
    response = await ask(hass, "VirtualPetStatus", assistant="conversation")
    assert speech(response).startswith("Pip is hungry")
    unexpose_all(hass, pip)
    with pytest.raises(intent.IntentHandleError, match="no pet"):
        await ask(hass, "VirtualPetStatus", assistant="conversation")
    # Called from code, with no assistant, the pet is still there.
    assert await ask(hass, "VirtualPetStatus")


def llm_context(assistant: str = "conversation") -> llm.LLMContext:
    return llm.LLMContext(
        platform="test",
        context=Context(),
        language="en",
        assistant=assistant,
        device_id=None,
    )


async def test_llm_agents_get_two_tools(
    hass: HomeAssistant, pip: MockConfigEntry
) -> None:
    assert await async_setup_component(hass, "llm", {})
    api = await llm.async_get_api(hass, llm.LLM_API_ASSIST, llm_context())
    tools = {t.name: t for t in api.tools if t.name.startswith(f"{DOMAIN}__")}
    assert set(tools) == {"virtual_pet__status", "virtual_pet__care"}
    assert tools["virtual_pet__status"].annotations.read_only
    assert not tools["virtual_pet__care"].annotations.read_only
    assert all(t.integration == DOMAIN for t in tools.values())
    assert "(Pip)" in api.api_prompt

    result = await api.async_call_tool(
        llm.ToolInput("virtual_pet__status", {"pet": "Pip"})
    )
    assert result.data["speech_slots"]["reason"] == "a little peckish"
    result = await api.async_call_tool(
        llm.ToolInput("virtual_pet__care", {"action": "snack"})
    )
    assert result.data["speech"]["plain"]["speech"] == "Pip loved the snack."

    unexpose_all(hass, pip)
    api = await llm.async_get_api(hass, llm.LLM_API_ASSIST, llm_context())
    assert not [t for t in api.tools if t.name.startswith(f"{DOMAIN}__")]


@pytest.fixture
async def with_sentences(hass: HomeAssistant, tmp_path: Path) -> None:
    """The example sentences, copied in as docs/guide.md says."""
    target = tmp_path / "custom_sentences/en"
    target.mkdir(parents=True)
    shutil.copy(SENTENCES, target / "virtual_pet.yaml")
    hass.config.config_dir = str(tmp_path)


async def say(hass: HomeAssistant, text: str) -> str:
    result = await conversation.async_converse(
        hass, text, None, Context(), language="en"
    )
    return result.response.speech["plain"]["speech"]


async def test_example_sentences_with_the_built_in_agent(
    hass: HomeAssistant, with_sentences: None, pip: MockConfigEntry
) -> None:
    assert await async_setup_component(hass, "conversation", {})
    assert (await say(hass, "how's Pip doing")).startswith(
        "Pip is hungry: a little peckish. It's a child, day "
    )
    assert (await say(hass, "check on my pet")).startswith(
        "Pip is hungry: a little peckish. It's a child, day "
    )
    assert await say(hass, "give Pip a treat") == "Pip loved the snack."
    assert await say(hass, "feed my pet") == "Pip is eating."
    assert await say(hass, "lights out, Pip") == "Pip is settling down to sleep."
    # Not every "how is" is about the pet.
    assert "Pip" not in await say(hass, "how is the weather")


async def test_the_pet_calls_a_friend_by_nickname(
    hass: HomeAssistant, pip: MockConfigEntry
) -> None:
    me = await hass.auth.async_create_user("Me", group_ids=["system-admin"])
    pip.runtime_data.state.bonds[me.id] = {"points": 40, "nickname": "sunbeam"}
    response = await ask(hass, "VirtualPetStatus", context=Context(user_id=me.id))
    assert speech(response).startswith("Hi, sunbeam! Pip is ")
    assert response.speech_slots["nickname"] == "sunbeam"
    response = await ask(
        hass, "VirtualPetCare", context=Context(user_id=me.id), action="feed"
    )
    assert speech(response) == "Pip is eating. Thanks, sunbeam!"
    assert "sunbeam" not in speech(await ask(hass, "VirtualPetStatus"))


def test_spoken_about_the_stage_wish_and_visitor():
    """gaps-seams 6a: the stage and day, today's wish (plain kind only) and a
    visitor whose window is over; nothing for an egg's stage."""
    from custom_components.virtual_pet.intent import WISH_SPOKEN, spoken_about

    assert spoken_about("teen", 5.4, None, None) == ["It's a teen, day 6."]
    assert spoken_about("adult", 20.0, None, None) == ["It's an adult, day 21."]
    assert spoken_about("egg", 0.1, {"kind": "play"}, None) == [
        "Today it wishes for a game together."
    ]
    assert spoken_about("teen", 5.4, {"kind": "bath"}, "robin") == [
        "It's a teen, day 6.",
        "Today it wishes for a bubble bath.",
        "A robin came by today.",
    ]
    assert spoken_about("teen", 5.4, {"kind": "rain"}, None)[1] == (
        "Today it wishes to see the rain."
    )
    assert spoken_about("teen", 5.4, {"kind": "play", "granted": True}, None)[1] == (
        "Its wish came true today."
    )
    assert spoken_about("teen", 5.4, None, "owl")[1] == "An owl came by today."
    assert spoken_about("teen", 5.4, None, "shooting star")[1] == (
        "A shooting star went by today."
    )
    from custom_components.virtual_pet import model

    assert set(WISH_SPOKEN) == set(model.WISHES)


async def test_status_says_the_wish_and_a_visitor_after_its_window(
    hass: HomeAssistant, pip: MockConfigEntry
) -> None:
    """The aimed wish's friend is never said; the visitor only once credited;
    asleep (and the sitter's privacy, which says asleep) adds nothing."""
    coordinator = pip.runtime_data
    state = coordinator.state
    today = dt_util.now().date().isoformat()
    state.wish = {"day": today, "kind": "bath", "for": "someone"}
    visitor = coordinator.visitors[0]
    state.visit = {
        "day": today,
        "world": coordinator.world,
        "id": visitor["id"],
        "from": 0,
        "until": 1,
        "credited": False,
    }
    text = speech(await ask(hass, "VirtualPetStatus"))
    assert "Today it wishes for a bubble bath." in text
    assert "someone" not in text and visitor["name"] not in text
    state.visit["credited"] = True
    text = speech(await ask(hass, "VirtualPetStatus"))
    said = (
        "A shooting star went by today."
        if visitor["name"] == "shooting star"
        else f"{'An' if visitor['name'][:1] in 'aeiou' else 'A'} {visitor['name']} came by today."
    )
    assert text.endswith(said)
    state.asleep = True
    assert speech(await ask(hass, "VirtualPetStatus")) == "Pip is asleep."


def test_spoken_status_reads_well_aloud():
    from custom_components.virtual_pet.intent import spoken_status

    assert spoken_status("Pip", "cozy", "toasty by the fire~", [], "sunbeam") == (
        "Hi, sunbeam! Pip is cozy: toasty by the fire."
    )
    # A reason that only repeats the mood isn't said twice.
    assert spoken_status("Pip", "with the sitter", "with the sitter", [], None) == (
        "Pip is with the sitter."
    )
    assert spoken_status("Pip", "excited", "♪ dancing ♪", ["night owl"], None) == (
        "Pip is excited: dancing. Traits: night owl."
    )
    assert "*" not in spoken_status("Pip", "egg", "*wiggle wiggle*", [], None)
    assert spoken_status("Pip", "asleep", "zzz", [], None) == "Pip is asleep."
    # Whole words: "on" inside "content" isn't a repeat.
    assert spoken_status("Pip", "content", "on top of the world", [], None) == (
        "Pip is content: on top of the world."
    )
    assert spoken_status("Pip", "cozy", "sunny ☀ and warm", [], None) == (
        "Pip is cozy: sunny and warm."
    )


async def test_no_thanks_for_a_scold(hass: HomeAssistant, pip: MockConfigEntry) -> None:
    me = await hass.auth.async_create_user("Me", group_ids=["system-admin"])
    pip.runtime_data.state.bonds[me.id] = {"points": 40, "nickname": "sunbeam"}
    response = await ask(
        hass, "VirtualPetCare", context=Context(user_id=me.id), action="scold"
    )
    assert "Thanks" not in speech(response)


async def test_lights_out_refused_says_not_sleepy(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, energy=100.0)
    assert await async_setup_component(hass, "homeassistant", {})
    assert await async_setup_component(hass, "intent", {})
    await setup(hass)
    response = await ask(hass, "VirtualPetCare", action="lights_out")
    assert speech(response) == "Pip isn't sleepy yet."
    assert response.speech_slots["result"] == "not_sleepy"


VOICE_NOTES = (
    "relaxed and slow, fond of snacks and naps",
    "kind and warm, notices the person",
    "lively and cheerful",
    "theatrical, loves a little song",
    "few words, warm underneath",
    "delighted by pretty things",
    "grand words and compliments",
    "protective and cheerful",
)


@pytest.mark.parametrize(("age", "stage"), [(200.0, "teen"), (400.0, "adult")])
async def test_status_data_carries_the_personality(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    age: float,
    stage: str,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(
        now, hunger=30.0, age_hours=age, born=now - age * 3600
    )
    assert await async_setup_component(hass, "intent", {})
    await setup(hass)
    response = await ask(hass, "VirtualPetStatus")
    assert response.speech_slots["stage"] == stage
    assert response.speech_slots["personality"] in model.PERSONALITIES
    # The type is a voice for the LLM, not a fact to recite.
    assert response.speech_slots["personality"] not in speech(response)


async def test_status_has_no_personality_before_teen(
    hass: HomeAssistant, pip: MockConfigEntry
) -> None:
    response = await ask(hass, "VirtualPetStatus")
    assert response.speech_slots["personality"] is None
    assert speech(response).startswith(
        "Pip is hungry: a little peckish. It's a child, day "
    )


async def test_llm_prompt_has_the_voice_notes(
    hass: HomeAssistant, pip: MockConfigEntry
) -> None:
    assert await async_setup_component(hass, "llm", {})
    api = await llm.async_get_api(hass, llm.LLM_API_ASSIST, llm_context())
    for note in VOICE_NOTES:
        assert note in api.api_prompt
    assert "{" not in PROMPT.format(names="Pip")
    assert PROMPT.endswith("never guilt, nag or worry the person.")
    assert PROMPT.format(names="Pip") in api.api_prompt


# Species nature, N3 (plan-2026-11-02-species-nature.md section 8): the field note.
SPECIES_NOTE_SENTENCE = (
    "'species_note' is how that kind of creature is built, not a taste: let "
    "it colour what you say now and then, never quote it, and never say the "
    "pet likes, loves or prefers something because of it."
)


def test_the_species_notes_map_is_the_files(pip: MockConfigEntry) -> None:
    coordinator = pip.runtime_data
    files = {
        p.parent.name: json.loads(p.read_text())["field_note"]
        for p in SPRITES.glob("*/species.json")
        if "field_note" in json.loads(p.read_text())
    }
    assert len(files) == 30
    assert coordinator.species_notes == files
    # A species outside this world's roster still has its note (a world change
    # leaves the old pet in place).
    outside = set(files) - set(coordinator.roster)
    assert outside, "the world's roster is all 30 species"
    assert all(s in coordinator.species_notes for s in outside)


async def test_status_data_carries_the_species_note(
    hass: HomeAssistant, pip: MockConfigEntry
) -> None:
    coordinator = pip.runtime_data
    coordinator.state.species = "owl"
    response = await ask(hass, "VirtualPetStatus")
    assert response.speech_slots["species_note"] == (
        "livelier after dark · goes quiet in fog · keeps watch"
    )
    # A species fact only: the spoken status does not say it.
    assert "keeps watch" not in speech(response)


async def test_status_has_no_species_note_for_an_egg_or_a_species_without_one(
    hass: HomeAssistant, pip: MockConfigEntry
) -> None:
    coordinator = pip.runtime_data
    coordinator.state.species = None  # an egg
    response = await ask(hass, "VirtualPetStatus")
    assert response.speech_slots["species_note"] is None
    coordinator.state.species = "owl"
    del coordinator.species_notes["owl"]  # a species with no field_note
    response = await ask(hass, "VirtualPetStatus")
    assert response.speech_slots["species_note"] is None


def test_spoken_status_takes_no_species_note() -> None:
    from custom_components.virtual_pet.intent import spoken_status

    # The golden (test_spoken_status_reads_well_aloud) is unchanged; the note
    # is for the LLM's slots, not for the spoken sentence.
    assert list(inspect.signature(spoken_status).parameters) == [
        "name",
        "mood",
        "reason",
        "traits",
        "nickname",
        "about",
    ]


def test_llm_prompt_has_the_species_note_sentence() -> None:
    assert SPECIES_NOTE_SENTENCE in PROMPT
    assert PROMPT.index(SPECIES_NOTE_SENTENCE) < PROMPT.index(
        "Care for it only when asked to."
    )
    # The sentence added no brace: only {names} is a field.
    assert PROMPT.count("{") == PROMPT.count("}") == 1
