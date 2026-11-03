"""The pet's intents as tools for LLM conversation agents (the Assist API).

Offered only while a pet has an entity exposed to the agent's assistant. The
debug fast-forward is never offered.
"""

from __future__ import annotations

from homeassistant.components.llm import LLMTools
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import intent
from homeassistant.helpers.llm import (
    LLM_API_ASSIST,
    IntentTool,
    LLMContext,
    ToolAnnotations,
)

from .const import DOMAIN
from .intent import INTENT_CARE, INTENT_STATUS, pet_name, reachable_pets

TOOLS = {
    INTENT_STATUS: (
        "status",
        "Ask a virtual pet how it is",
        ToolAnnotations(
            read_only=True, destructive=False, idempotent=True, open_world=False
        ),
    ),
    INTENT_CARE: (
        "care",
        "Care for a virtual pet",
        ToolAnnotations(destructive=False, open_world=False),
    ),
}

PROMPT = (
    "The household keeps virtual pets ({names}). For how a pet is doing, use "
    "the status tool rather than its sensors, and answer in the pet's own voice "
    "from its 'reason', briefly; its 'traits' are habits it learned from the "
    "house; its 'personality' is how it talks: let it colour the voice "
    "lightly. The voice by personality: mellow, relaxed and slow, fond of "
    "snacks and naps; sweet, kind and warm, notices the person; bouncy, "
    "lively and cheerful; starry, theatrical, loves a little song; old_soul, "
    "few words, warm underneath; fancy, delighted by pretty things; "
    "charming, grand words and compliments; plucky, protective and cheerful. "
    "A 'nickname' is what the pet calls the person asking: use it warmly. "
    "'species_note' is how that kind of creature is built, not a taste: let "
    "it colour what you say now and then, never quote it, and never say the "
    "pet likes, loves or prefers something because of it. "
    "Care for it only when asked to. Keep it light and kind: never guilt, "
    "nag or worry the person."
)


@callback
def async_get_tools(
    hass: HomeAssistant, llm_context: LLMContext, api_id: str
) -> LLMTools | None:
    """The pet tools, when a pet is exposed to this assistant."""
    if api_id != LLM_API_ASSIST or not llm_context.assistant:
        return None
    pets = reachable_pets(hass, llm_context.assistant)
    if not pets:
        return None
    tools = [
        IntentTool(
            f"{DOMAIN}__{TOOLS[handler.intent_type][0]}",
            handler,
            title=TOOLS[handler.intent_type][1],
            integration=DOMAIN,
            annotations=TOOLS[handler.intent_type][2],
        )
        for handler in intent.async_get(hass)
        if handler.intent_type in TOOLS
    ]
    names = ", ".join(pet_name(p) for p in pets)
    return LLMTools(tools=tools, prompt=PROMPT.format(names=names))
