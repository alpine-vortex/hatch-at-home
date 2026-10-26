// Hatch at Home: the pet's face. A Lovelace card that reads the pet's
// entities and draws it. All state lives in Home Assistant; the card only
// draws and presses the pet's buttons and switch.

const VERSION = "0.2.0";
const BASE = "/virtual_pet/frontend";

const ACTIONS = [
  { key: "feed", icon: "mdi:food-drumstick", label: "Feed" },
  { key: "snack", icon: "mdi:candy", label: "Snack" },
  { key: "play", icon: "mdi:tennis-ball", label: "Play" },
  { key: "clean", icon: "mdi:broom", label: "Clean" },
  { key: "medicine", icon: "mdi:pill", label: "Medicine" },
  { key: "scold", icon: "mdi:hand-back-left", label: "Scold" },
  { key: "praise", icon: "mdi:star-face", label: "Praise" },
];

// What the pet says back when a care action did nothing.
const REFUSALS = {
  full: "I'm full!",
  asleep: "shh... sleeping",
  too_tired: "too tired to play",
  already_clean: "it's already clean!",
  not_sick: "I'm not sick!",
  unfair: "hey, I didn't do anything!",
  spoiled: "hehe, whining works",
  egg: "...",
  away: "",
};

const STAGE_LABELS = {
  egg: "Egg",
  baby: "Baby",
  child: "Child",
  teen: "Teen",
  adult: "Adult",
};

const speciesCache = new Map();

function loadSpecies(id) {
  if (!speciesCache.has(id)) {
    speciesCache.set(
      id,
      fetch(`${BASE}/sprites/${id}/species.json?v=${VERSION}`).then((r) => {
        if (!r.ok) throw new Error(`no species ${id}`);
        return r.json();
      }),
    );
  }
  return speciesCache.get(id);
}

function escape(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function timeAgo(iso) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

const STYLE = `
  :host { display: block; }
  ha-card { overflow: hidden; padding: 12px; }
  .head { display: flex; align-items: baseline; justify-content: space-between;
    padding: 0 4px 8px; }
  .name { font-size: 1.15em; font-weight: 600; color: var(--primary-text-color); }
  .stage { font-size: 0.85em; color: var(--secondary-text-color); }
  .screen { position: relative; aspect-ratio: 4 / 3; border-radius: 14px;
    overflow: hidden; cursor: pointer; background: #2b2f3a;
    box-shadow: inset 0 0 0 3px rgba(0,0,0,.35), 0 0 0 4px var(--divider-color, #8884); }
  .screen img { position: absolute; image-rendering: pixelated; user-select: none;
    -webkit-user-drag: none; pointer-events: none; }
  .bg { inset: 0; width: 100%; height: 100%; object-fit: cover; transition: filter .6s; }
  .screen.night .bg { filter: brightness(.85); }
  .screen.dim .bg { filter: brightness(.45) saturate(.7); }
  .pet { left: 50%; bottom: 4%; height: 64%; transform: translateX(-50%); }
  .pet.bounce { animation: bounce .7s ease-in-out infinite; }
  @keyframes bounce { 0%,100% { transform: translateX(-50%) translateY(0); }
    50% { transform: translateX(-50%) translateY(-7%); } }
  .screen.dim .pet { filter: brightness(.7); }
  .poop { bottom: 5%; height: 15%; }
  .poop.p0 { left: 6%; } .poop.p1 { left: 18%; bottom: 3%; } .poop.p2 { right: 7%; }
  .attention { top: 5%; right: 5%; height: 18%; animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { transform: scale(1.12); } }
  .prop { left: 64%; bottom: 6%; height: 22%; animation: pop .35s ease-out; }
  @keyframes pop { from { transform: scale(.3); opacity: 0; } }
  .away { left: 50%; bottom: 10%; height: 40%; transform: translateX(-50%); }
  .awaylabel { position: absolute; left: 0; right: 0; bottom: 4%; text-align: center;
    color: #fff; font-weight: 600; text-shadow: 0 1px 3px #000; }
  .bubble { position: absolute; left: 5%; top: 6%; max-width: 62%; padding: 6px 10px;
    background: #fffdf5; color: #3a2a1a; border: 2px solid #3a2a1a; border-radius: 10px;
    font-size: .9em; line-height: 1.25; box-shadow: 2px 2px 0 #3a2a1a; }
  .bubble:empty { display: none; }
  .bubble::after { content: ""; position: absolute; left: 22px; bottom: -9px;
    border: 8px solid transparent; border-top-color: #3a2a1a; border-bottom: 0; }
  .status { position: absolute; inset: 0; padding: 12px 14px; overflow: auto;
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color); font-size: .88em; display: none; }
  .screen.show-status .status { display: block; }
  .screen.show-status .bubble { display: none; }
  .row { display: flex; align-items: center; gap: 8px; margin: 3px 0; }
  .row .label { width: 78px; color: var(--secondary-text-color); }
  .hearts { letter-spacing: 2px; color: #e0525a; }
  .hearts .off { color: var(--disabled-text-color, #bbb); }
  .meter { flex: 1; height: 8px; border-radius: 4px; background: var(--divider-color, #ddd); }
  .meter > div { height: 100%; border-radius: 4px; background: var(--primary-color); }
  .log { margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--divider-color); }
  .log div { color: var(--secondary-text-color); }
  .buttons { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 10px; }
  button { display: flex; flex-direction: column; align-items: center; gap: 2px;
    padding: 6px 2px; border: none; border-radius: 10px; cursor: pointer; font: inherit;
    font-size: .75em; color: var(--primary-text-color);
    background: var(--secondary-background-color, #eee); }
  button:hover { filter: brightness(1.08); }
  button:active { transform: translateY(1px); }
  button[disabled] { opacity: .35; cursor: default; }
  button.on { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  button.request { outline: 2px solid var(--accent-color, #ff9800); }
  .warn { padding: 16px; color: var(--error-color); }
`;

class HatchPetCard extends HTMLElement {
  static getConfigForm() {
    return {
      schema: [
        {
          name: "entity",
          required: true,
          selector: { entity: { filter: { integration: "virtual_pet" } } },
        },
      ],
      computeLabel: () => "Any entity of your pet",
    };
  }

  static getStubConfig(hass) {
    const mood = Object.values(hass.entities || {}).find(
      (e) => e.platform === "virtual_pet" && e.translation_key === "mood",
    );
    return { entity: mood ? mood.entity_id : "" };
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("Pick any entity of your virtual pet");
    }
    this._config = config;
    this._ids = null;
    this._sig = null;
  }

  getCardSize() {
    return 7;
  }

  getGridOptions() {
    return { columns: 6, min_columns: 4, rows: "auto" };
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  connectedCallback() {
    this._timer = setInterval(() => this._tick(), 700);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  // --- Finding the pet's entities -------------------------------------------

  _resolve() {
    const hass = this._hass;
    const entry = hass.entities?.[this._config.entity];
    if (!entry || !entry.device_id) return null;
    if (this._ids && this._ids.device === entry.device_id) return this._ids;
    const ids = { device: entry.device_id };
    for (const e of Object.values(hass.entities)) {
      if (e.device_id === entry.device_id && e.platform === "virtual_pet") {
        ids[`${e.entity_id.split(".")[0]}.${e.translation_key}`] = e.entity_id;
      }
    }
    this._ids = ids;
    return ids;
  }

  _state(key) {
    const id = this._ids?.[key];
    return id ? this._hass.states[id] : undefined;
  }

  // --- Rendering -------------------------------------------------------------

  _build() {
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${STYLE}</style>
      <ha-card>
        <div class="head"><span class="name"></span><span class="stage"></span></div>
        <div class="screen" title="Tap for status">
          <img class="bg" alt="">
          <img class="away" alt="">
          <div class="awaylabel"></div>
          <img class="poop p0" alt=""><img class="poop p1" alt=""><img class="poop p2" alt="">
          <img class="pet" alt="">
          <img class="prop" alt="">
          <img class="attention" alt="">
          <div class="bubble"></div>
          <div class="status"></div>
        </div>
        <div class="buttons"></div>
      </ha-card>`;
    this._el = {};
    for (const name of ["name", "stage", "screen", "bg", "away", "awaylabel",
      "pet", "prop", "attention", "bubble", "status", "buttons"]) {
      this._el[name] = root.querySelector(`.${name}`);
    }
    this._el.poops = [...root.querySelectorAll(".poop")];
    this._el.screen.addEventListener("click", () =>
      this._el.screen.classList.toggle("show-status"));

    for (const action of ACTIONS) {
      const b = document.createElement("button");
      b.innerHTML = `<ha-icon icon="${action.icon}"></ha-icon><span>${action.label}</span>`;
      b.addEventListener("click", () => this._press(action.key));
      b.dataset.key = action.key;
      this._el.buttons.append(b);
    }
    const lights = document.createElement("button");
    lights.innerHTML = `<ha-icon icon="mdi:lightbulb-night"></ha-icon><span>Lights out</span>`;
    lights.addEventListener("click", () => this._toggleLights());
    this._el.buttons.append(lights);
    this._el.lights = lights;
  }

  _show(img, sprite) {
    if (!sprite) {
      img.style.display = "none";
      return;
    }
    const src = `${BASE}/sprites/${this._speciesId}/${sprite}.png?v=${VERSION}`;
    if (img.getAttribute("src") !== src) img.setAttribute("src", src);
    img.style.display = "";
  }

  _update() {
    if (!this._hass || !this._config) return;
    if (!this.shadowRoot) this._build();
    const ids = this._resolve();
    if (!ids) {
      this._el.name.textContent = "";
      this._el.stage.textContent = "";
      this._el.bubble.textContent = `Can't find the pet for ${this._config.entity}`;
      return;
    }
    // Only redraw when one of the pet's entities (or the sun) changed.
    const keys = Object.keys(ids).filter((k) => k !== "device");
    const sig = keys.map((k) => this._state(k)?.last_updated).join("|") +
      (this._hass.states["sun.sun"]?.state || "");
    if (sig === this._sig) return;
    this._sig = sig;

    const stage = this._state("sensor.life_stage");
    const species = stage?.attributes.species || "bird";
    if (species !== this._speciesId) {
      this._speciesId = species;
      this._species = null;
      loadSpecies(species)
        .then((data) => {
          this._species = data;
          this._sig = null;
          this._update();
        })
        .catch(() => {
          this._el.bubble.textContent = `Missing sprites for ${species}`;
        });
    }
    if (!this._species) return;
    this._render();
  }

  _render() {
    const el = this._el;
    const sp = this._species;
    const mood = this._state("sensor.mood");
    const stageState = this._state("sensor.life_stage");
    const stage = stageState?.state;
    const flags = mood?.attributes.flags || [];
    const calling = this._state("binary_sensor.calling")?.state === "on";
    const lightsOut = this._state("switch.lights_out")?.state === "on";
    const asleep = this._state("binary_sensor.asleep")?.state === "on";
    const away = mood?.state === "away";

    const device = this._hass.devices?.[this._ids.device];
    el.name.textContent = device?.name_by_user || device?.name || "Pet";
    const days = stageState?.attributes.age_days;
    el.stage.textContent = `${STAGE_LABELS[stage] || ""}${days != null ? ` · day ${Math.floor(days) + 1}` : ""}`;

    // Scene
    let scene = "day";
    if (flags.includes("rainy")) scene = "rain";
    if (this._hass.states["sun.sun"]?.state === "below_horizon") scene = "night";
    if (asleep || lightsOut) scene = "dim";
    this._show(el.bg, sp.backgrounds?.[scene] || sp.backgrounds?.day);
    el.screen.classList.toggle("night", scene === "night");
    el.screen.classList.toggle("dim", scene === "dim");

    // The pet
    if (away) {
      this._frames = [];
      this._show(el.pet, null);
      this._show(el.away, sp.props?.away);
      el.awaylabel.textContent = "At the sitter's";
    } else {
      this._show(el.away, null);
      el.awaylabel.textContent = "";
      this._frames = this._petFrames(stage, mood?.state, calling, days);
      this._frame = this._frame || 0;
      this._show(el.pet, this._frames[this._frame % this._frames.length]);
    }
    el.pet.classList.toggle("bounce", mood?.state === "excited");

    // Poop and the attention icon
    const poop = away ? 0 : Number(this._state("sensor.poop")?.state || 0);
    el.poops.forEach((img, i) => this._show(img, i < poop ? sp.props?.poop?.[i] : null));
    this._show(el.attention, calling && !away ? sp.props?.attention : null);
    if (!this._propUntil || Date.now() > this._propUntil) this._show(el.prop, null);

    // Speech
    const log = this._state("sensor.last_care")?.attributes.log || [];
    const latest = log[0];
    if (latest && latest.at !== this._lastLogAt) {
      if (this._lastLogAt !== undefined && Date.now() - new Date(latest.at) < 15000) {
        this._react(latest);
      }
      this._lastLogAt = latest.at;
    }
    if (!this._sayUntil || Date.now() > this._sayUntil) {
      el.bubble.textContent = away ? "" : mood?.attributes.reason || "";
    }

    // Buttons
    for (const b of el.buttons.querySelectorAll("button[data-key]")) {
      const ent = this._state(`button.${b.dataset.key}`);
      b.disabled = !ent || ent.state === "unavailable";
    }
    el.lights.classList.toggle("on", lightsOut);
    el.lights.querySelector("span").textContent = lightsOut ? "Lights on" : "Lights out";
    el.lights.querySelector("ha-icon").setAttribute(
      "icon", lightsOut ? "mdi:lightbulb-on" : "mdi:lightbulb-night");
    el.lights.classList.toggle("request", calling && flags.includes("sleepy"));

    this._renderStatus(log);
  }

  _petFrames(stage, mood, calling, days) {
    const sp = this._species;
    if (stage === "egg") {
      const nearlyHatched = days != null && days * 24 >= 0.4;
      if (nearlyHatched) return sp.egg.crack;
      return calling ? sp.egg.wiggle : sp.egg.idle;
    }
    let drawn = stage;
    if (!sp.stages.includes(drawn)) {
      drawn = sp.stage_fallback?.[stage] || sp.stages[sp.stages.length - 1];
    }
    const m = sp.moods.includes(mood) ? mood : "content";
    const frames = [];
    for (let i = 1; i <= (sp.frames || 1); i++) frames.push(`${drawn}_${m}_${i}`);
    return frames;
  }

  _tick() {
    if (!this._frames || !this._frames.length || !this._el) return;
    const asleep = this._state("binary_sensor.asleep")?.state === "on";
    this._ticks = (this._ticks || 0) + 1;
    if (asleep && this._ticks % 2) return; // slower breathing while asleep
    this._frame = ((this._frame || 0) + 1) % this._frames.length;
    this._show(this._el.pet, this._frames[this._frame]);
    if (this._propUntil && Date.now() > this._propUntil) {
      this._show(this._el.prop, null);
      this._propUntil = 0;
    }
    if (this._sayUntil && Date.now() > this._sayUntil) {
      this._sayUntil = 0;
      this._el.bubble.textContent =
        this._state("sensor.mood")?.attributes.reason || "";
    }
  }

  _react(entry) {
    const sp = this._species;
    if (entry.result === "ok") {
      const prop = sp.props?.[entry.action];
      if (prop) {
        this._show(this._el.prop, prop);
        this._propUntil = Date.now() + 2500;
      }
      return;
    }
    const line = REFUSALS[entry.result];
    if (line) {
      this._el.bubble.textContent = line;
      this._sayUntil = Date.now() + 3500;
    }
  }

  _renderStatus(log) {
    const value = (key) => Number(this._state(`sensor.${key}`)?.state || 0);
    const hearts = (v) => {
      const full = Math.ceil(v / 25);
      return `<span class="hearts">${"♥".repeat(full)}<span class="off">${"♥".repeat(4 - full)}</span></span>`;
    };
    const meter = (v) => `<div class="meter"><div style="width:${v}%"></div></div>`;
    const lines = log.slice(0, 5).map((e) =>
      `<div>${escape(e.action)}${e.by ? ` by ${escape(e.by)}` : ""} · ${timeAgo(e.at)}${e.result !== "ok" ? ` (${escape(e.result.replace("_", " "))})` : ""}</div>`);
    this._el.status.innerHTML = `
      <div class="row"><span class="label">Hunger</span>${hearts(value("hunger"))}</div>
      <div class="row"><span class="label">Happy</span>${hearts(value("happiness"))}</div>
      <div class="row"><span class="label">Energy</span>${meter(value("energy"))}</div>
      <div class="row"><span class="label">Health</span>${meter(value("health"))}</div>
      <div class="row"><span class="label">Discipline</span>${meter(value("discipline"))}</div>
      <div class="row"><span class="label">Care misses</span>${value("care_misses")}</div>
      <div class="log">${lines.join("") || "<div>No care yet.</div>"}</div>`;
  }

  // --- Actions ----------------------------------------------------------------

  _press(action) {
    const id = this._ids?.[`button.${action}`];
    if (id) this._hass.callService("button", "press", { entity_id: id });
  }

  _toggleLights() {
    const id = this._ids?.["switch.lights_out"];
    if (!id) return;
    const on = this._hass.states[id]?.state === "on";
    this._hass.callService("switch", on ? "turn_off" : "turn_on", { entity_id: id });
  }
}

customElements.define("hatch-pet-card", HatchPetCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "hatch-pet-card",
  name: "Hatch at Home pet",
  description: "Your virtual pet, drawn from its Home Assistant entities.",
  preview: true,
});

console.info(`%c HATCH-PET-CARD %c ${VERSION} `,
  "background:#c8642a;color:#fff", "background:#333;color:#fff");
