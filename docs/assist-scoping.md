# Talking to the pet through Assist: scoping (2026-10-27)

What it would take for people to talk to their pet by voice or text ("how's Pip?",
"feed Pip"), checked against the installed Home Assistant 2026.10.4 (intents package
2026.10.6, hassil 3.12.1). Matches come from reading the sentence templates; no
sentences were run through hassil.

## What works today, with no code

| Phrase | Works? | Why |
| --- | --- | --- |
| "turn on Pip lights out" | yes | Built-in `HassTurnOn` covers switches; switches are exposed by default. |
| "what is Pip mood" | yes, once the sensor is exposed | The built-in state query answers with the raw state ("Pip mood is hungry"), not what the pet says. |
| "press Pip feed" | no | No English sentence covers pressing a `button`; only an LLM agent reaches that intent. |
| "is Pip asleep" | probably not | Binary-sensor questions only cover open/closed and occupied. |
| "how's Pip?" | only with a trick | Names come from entities, not devices. Giving the mood sensor the alias "Pip" lets it match. |

## What an integration can add

- **Intents: supported.** An `intent.py` with `async_setup_intents(hass)` can register
  handlers (`intent.async_register`), and a handler can set its own speech.
- **Sentences: not shippable.** The built-in agent only reads its bundled sentences,
  `<config>/custom_sentences/<lang>/*.yaml`, and `conversation: intents:` in
  configuration.yaml. So sentences for the built-in agent would have to be a YAML file
  that users copy in themselves (English only, unless we write more).
- **LLM agents (Claude, OpenAI, Ollama): supported.** An `llm.py` platform adds tools
  to the built-in "Assist" API, so any agent already allowed to control Home Assistant
  gets them, with no new settings.
  - Tool names must start with `virtual_pet__` (mandatory from 2027.3), and each tool
    must set `integration` (mandatory from 2027.10).
  - Today an LLM can't see the pet's `reason` or `flags`: the built-in live context
    only passes a short list of attributes. A tool fixes that.

## Can the pet answer in its own voice?

- **Built-in agent with copied YAML:** partly. A response template can read
  `{{ state.attributes.reason }}`.
- **Our own intent:** yes. The handler answers with what the pet says, for example
  "a bit hungry, and it's raining!", and returns the stats as response data.
- **LLM agent:** yes, loosely. The tool returns the mood, stats and `reason`, and a
  prompt line asks it to answer as the pet; the model rephrases.

## Options, best value first

1. **Two intents plus `llm.py` tools that wrap them** (medium effort).
   - `VirtualPetStatus` (slot: pet) and `VirtualPetCare` (slots: pet and action: feed,
     snack, play, clean, medicine, scold, praise, lights out).
   - One code path serves LLM agents in any language, and the built-in agent through
     option 2.
2. **An example `custom_sentences/en/virtual_pet.yaml`** for users to copy (low effort),
   e.g. "(how is|how's) {pet}" and "(feed|play with|clean|praise|scold) {pet}". English
   only; it needs option 1's intents for care actions.
3. **Docs only:** how to expose entities and add aliases. No code, but no pet voice
   and no button presses.
4. **The pet as its own conversation agent.** The most in character, but high effort.
5. **Writing into the user's `custom_sentences` from code.** Not recommended:
   unsupported and surprising.

## Recommendation

Option 1, then option 2: about 120 lines for `intent.py`, about 50 for `llm.py`, about
30 of example YAML, and about 150 of tests.

- Resolve the pet by device name, then reuse the existing coordinator actions.
- Mark the status tool read-only and the care tool as an action.
- Never expose `fast_forward` to an LLM.
- Risks: the LLM tool API is changing fast (deadlines in 2027.3, 2027.10 and 2027.11);
  the YAML sentence format is stable. My own tools should respect what the owner
  exposed to Assist.
