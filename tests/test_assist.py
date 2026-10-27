"""Talking to the pet through Assist: the intents, the LLM tools, the sentences."""

from __future__ import annotations

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
from homeassistant.helpers import entity_registry as er, intent, llm
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.virtual_pet.const import DOMAIN

from .test_init import STORE_KEY, hatched_pet, setup

SENTENCES = Path(__file__).parent.parent / "docs/custom_sentences/en/virtual_pet.yaml"


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


async def test_status_answers_in_the_pets_voice(
    hass: HomeAssistant, pip: MockConfigEntry
) -> None:
    response = await ask(hass, "VirtualPetStatus", pet="pip")
    assert response.response_type is intent.IntentResponseType.QUERY_ANSWER
    assert speech(response) == "Pip is hungry: a little peckish."
    slots = response.speech_slots
    assert slots["mood"] == "hungry"
    assert slots["hunger"] == 30
    assert slots["stage"] == "child"
    # One pet needs no name.
    assert speech(await ask(hass, "VirtualPetStatus")) == speech(response)


async def test_unknown_and_ambiguous_pets(
    hass: HomeAssistant, pip: MockConfigEntry
) -> None:
    with pytest.raises(intent.IntentHandleError, match="called Moss"):
        await ask(hass, "VirtualPetStatus", pet="Moss")
    moss = MockConfigEntry(
        domain=DOMAIN, title="Moss", data={CONF_NAME: "Moss"}, entry_id="moss"
    )
    moss.add_to_hass(hass)
    assert await hass.config_entries.async_setup(moss.entry_id)
    await hass.async_block_till_done()
    with pytest.raises(intent.IntentHandleError, match="Which pet, Pip or Moss"):
        await ask(hass, "VirtualPetStatus")
    response = await ask(hass, "VirtualPetStatus", pet="Moss")
    assert speech(response).startswith("Moss is still in its egg")


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
    assert speech(response) == "Pip is asleep: zzz."
    response = await ask(hass, "VirtualPetCare", action="feed")
    assert speech(response) == "Pip is asleep."


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
    """The example sentences, copied in as the README says."""
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
    assert await say(hass, "how's Pip doing") == "Pip is hungry: a little peckish."
    assert await say(hass, "check on my pet") == "Pip is hungry: a little peckish."
    assert await say(hass, "give Pip a treat") == "Pip loved the snack."
    assert await say(hass, "feed my pet") == "Pip is eating."
    assert await say(hass, "lights out, Pip") == "Pip is settling down to sleep."
    # Not every "how is" is about the pet.
    assert "Pip" not in await say(hass, "how is the weather")
