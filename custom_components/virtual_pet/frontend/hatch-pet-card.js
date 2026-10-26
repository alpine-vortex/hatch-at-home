// Hatch at Home: the device shelf. One card holds every pet device: each is
// a handheld toy themed for its world, standing on that world's backdrop.
// Arrows, dots or a swipe move to the next device. All state lives in Home
// Assistant; the card only draws and presses the pets' buttons and switch.

const VERSION = "0.5.0";
const BASE = "/virtual_pet/frontend";

// Outline icons for the shelf's own arrows; everything on a device is pixel art.
const ICON_PATHS = {
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
};

// Sol's pixel icons (frontend/ui). Drawn on a 24-pixel grid at 4x, so 24 and
// 48 CSS pixels stay crisp.
function pixelIcon(name, size = 24, alt = "") {
  return `<img class="picon" src="${BASE}/ui/${name}.png?v=${VERSION}" width="${size}" height="${size}" alt="${alt}">`;
}

const ACTION_ICONS = {
  feed: "icon_feed", snack: "icon_snack", play: "icon_play", clean: "icon_clean",
  medicine: "icon_medicine", scold: "icon_scold", praise: "icon_praise",
};

function icon(name, size = 22) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

const ACTIONS = [
  { key: "feed", label: "feed", wants: "hungry" },
  { key: "snack", label: "snack" },
  { key: "play", label: "play", wants: "bored" },
  { key: "clean", label: "clean", wants: "dirty" },
  { key: "medicine", label: "meds", aria: "meds: give medicine", wants: "sick" },
  { key: "scold", label: "scold" },
  { key: "praise", label: "praise" },
];

// What the pet says back when a care action did nothing.
const REFUSALS = {
  full: "I'm full!",
  not_needed: "I'm fine, thanks!",
  asleep: "shh... sleeping",
  too_tired: "too tired to play",
  already_clean: "it's already clean!",
  not_sick: "I'm not sick!",
  unfair: "hey, I didn't do anything!",
  spoiled: "hehe, whining works",
  egg: "...",
};

// Home flags that swap the pet into a special pose (species.json "extras").
const POSES = {
  too_bright: "squint", chilly: "shiver", warm: "sweat", masked: "mask",
  dancing: "dance", watching_tv: "watch_tv",
};
const POSE_MOODS = new Set(["content", "excited", "cozy", "bored", "sleepy"]);

const REQUEST_LABELS = { blanket: "blanket?", fan: "fan?" };

const STAGE_LABELS = { egg: "Egg", baby: "Baby", child: "Child", teen: "Teen", adult: "Adult" };

const cache = new Map();
function loadJson(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(`${BASE}/${path}?v=${VERSION}`).then((r) => {
      if (!r.ok) throw new Error(`missing ${path}`);
      return r.json();
    }));
  }
  return cache.get(path);
}

function escape(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * amount)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
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
  :host { display: block; --hp-backdrop: var(--card-background-color, #2f4a3a);
    --hp-ground: transparent; --hp-ink: var(--primary-text-color, #222);
    --hp-subink: var(--secondary-text-color, #555); }
  button:focus-visible, .screen:focus-visible { outline: 3px solid #fff;
    outline-offset: 2px; box-shadow: 0 0 0 6px #1d2a22; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
  ha-card { overflow: hidden; border-radius: var(--ha-card-border-radius, 24px);
    background: var(--hp-backdrop, #2f4a3a); transition: background .5s; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 14px 18px 4px; }
  .title { font: 400 22px 'Tiny5', monospace; color: var(--hp-ink); }
  .sub { font-size: 13px; color: var(--hp-subink); margin-top: 2px; }
  .chips { display: flex; gap: 6px; align-items: center; }
  .compact .chip { display: none; }
  .chip { white-space: nowrap; font: 400 12px 'Tiny5', monospace; letter-spacing: .08em; padding: 6px 10px;
    border-radius: 10px; background: color-mix(in srgb, var(--hp-ink) 14%, transparent);
    color: var(--hp-ink); }
  .statusbtn { display: flex; align-items: center; gap: 6px; height: 44px; padding: 0 12px;
    border: none; border-radius: 22px; cursor: pointer; font: 400 14px 'Tiny5', monospace;
    color: var(--hp-ink); background: color-mix(in srgb, var(--hp-ink) 14%, transparent); }
  .statusbtn[aria-pressed="true"] { background: var(--hp-ink); color: var(--hp-backdrop); }
  .viewport { position: relative; overflow: hidden; padding: 14px 0 22px; touch-action: pan-y; }
  .ground { position: absolute; left: 0; right: 0; bottom: 0; height: 26%;
    background: var(--hp-ground); transition: background .5s; }
  .track { position: relative; display: flex; gap: 16px; align-items: flex-end;
    transition: transform .5s cubic-bezier(.2,.8,.2,1); }
  .slide { flex-shrink: 0; transition: opacity .5s, transform .5s; transform-origin: 50% 100%; }
  .slide.away-slide { opacity: .45; transform: scale(.9); }
  .foot { display: flex; align-items: center; justify-content: space-between; padding: 0 14px 14px; }
  .nav { width: 44px; height: 44px; border: none; border-radius: 22px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; color: var(--hp-ink);
    background: color-mix(in srgb, var(--hp-ink) 14%, transparent); }
  .dots { display: flex; gap: 8px; }
  .dot { width: 24px; height: 24px; border: none; padding: 0; cursor: pointer;
    background: none; display: flex; align-items: center; justify-content: center; }
  .dot::before { content: ""; width: 10px; height: 10px; border-radius: 5px;
    background: color-mix(in srgb, var(--hp-ink) 55%, transparent); transition: width .3s; }
  .dot[aria-current="true"]::before { width: 26px; background: var(--hp-ink); }
  .slide.away-slide { cursor: pointer; }
  .single .foot { display: none; }

  /* One device */
  .device { display: flex; flex-direction: column; align-items: center; font-family: 'Tiny5', monospace; }
  .loop { width: 34px; height: 22px; border: 6px solid var(--d-dark); border-bottom: none;
    border-radius: 20px 20px 0 0; margin-bottom: -12px; }
  .lid { width: 92%; height: 20px; background: var(--d-dark); border-radius: 10px 10px 4px 4px;
    box-shadow: inset 0 4px 0 rgba(255,255,255,.18); display: flex; justify-content: center;
    align-items: center; gap: 6px; }
  .lid span { width: 12%; height: 4px; border-radius: 2px; background: rgba(0,0,0,.25); }
  .feet { width: 82%; display: flex; justify-content: space-between; }
  .feet span { width: 34px; height: 10px; background: var(--d-dark); border-radius: 0 0 6px 6px; }
  .body { width: 100%; box-sizing: border-box; background: var(--d-shell);
    box-shadow: inset 0 -9px 0 var(--d-dark), inset 0 5px 0 rgba(255,255,255,.28), 0 16px 34px rgba(20,15,5,.32);
    display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .egg .body { border-radius: 50% 50% 46% 46% / 30% 30% 18% 18%; padding: 36px 20px 30px; }
  .tank .body { border-radius: 18px; padding: 16px 18px 22px; }
  .label { font-size: 14px; letter-spacing: .12em; color: var(--d-ink); }
  .request { position: absolute; right: 14px; bottom: 14px; z-index: 2; min-height: 44px;
    display: none; align-items: center; gap: 6px; padding: 0 14px; border: 2px solid #3a2a1a;
    border-radius: 22px; background: #ffe9a8; color: #3a2a1a; cursor: pointer;
    font: 400 14px 'Tiny5', monospace; box-shadow: 3px 3px 0 #3a2a1a;
    animation: pulse 1.6s ease-in-out infinite; }
  .request.show { display: flex; }
  .bezel { position: relative; width: 100%; box-sizing: border-box; background: var(--d-bezel); border-radius: 20px;
    padding: 9px; box-shadow: inset 0 3px 0 rgba(0,0,0,.12); }
  .screen { position: relative; aspect-ratio: 4 / 3; border-radius: 12px; overflow: hidden;
    background: #2b2f3a; box-shadow: inset 0 0 0 3px rgba(0,0,0,.35); cursor: pointer; }
  .screen img { position: absolute; image-rendering: pixelated; user-select: none;
    -webkit-user-drag: none; pointer-events: none; }
  .bg { inset: 0; width: 100%; height: 100%; object-fit: cover; transition: filter .6s; }
  .screen.night .bg { filter: brightness(.85); }
  .screen.dim .bg { filter: brightness(.5) saturate(.75); }
  .screen.dim .pet { filter: brightness(.8); }
  .pet { left: 50%; bottom: 4%; height: 62%; margin-left: -23.25%; }
  .pet.hop { animation: hop .7s ease-in-out infinite; }
  @keyframes hop { 50% { transform: translateY(-9%); } }
  .poop { bottom: 5%; height: 15%; }
  .poop.p0 { left: 6%; } .poop.p1 { left: 18%; bottom: 3%; } .poop.p2 { right: 7%; }
  .attention { top: 5%; right: 5%; height: 17%; animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { transform: scale(1.12); } }
  .prop { left: 67%; bottom: 7%; height: 22%; animation: pop .3s ease-out; }
  @keyframes pop { from { transform: scale(.3); opacity: 0; } }
  .awaysign { left: 50%; bottom: 12%; height: 40%; margin-left: -20%; }
  .awaylabel { position: absolute; left: 0; right: 0; bottom: 5%; text-align: center;
    color: #fff; font-size: 15px; text-shadow: 0 1px 3px #000; }
  .bubble { position: absolute; left: 5%; top: 6%; max-width: 64%; padding: 5px 9px;
    background: #fffdf5; color: #3a2a1a; border: 2px solid #3a2a1a; border-radius: 8px;
    font-size: 14px; line-height: 1.2; box-shadow: 3px 3px 0 #3a2a1a; }
  .bubble:empty { display: none; }
  .status { position: absolute; inset: 0; background: #e9e2c6; color: #2f3a24; padding: 9px 12px;
    display: none; flex-direction: column; gap: 4px; font-size: 13px; overflow: auto; }
  .screen.show-status .status { display: flex; }
  .screen.show-status .bubble { display: none; }
  .row { display: grid; grid-template-columns: 78px minmax(0, 1fr); align-items: center; gap: 6px; }
  .bar { height: 9px; border: 2px solid #2f3a24; padding: 1px; }
  .bar div { height: 100%; background: #2f3a24; }
  .hearts { letter-spacing: 2px; }
  .hearts .off { opacity: .25; }
  .log { margin-top: 3px; font-size: 12px; opacity: .85; }
  .buttons { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px 6px; width: 100%; }
  .toy { display: flex; flex-direction: column; align-items: center; gap: 5px; border: none;
    background: none; padding: 0; cursor: pointer; font: 400 13px 'Tiny5', monospace;
    letter-spacing: .02em; border-radius: 12px;
    color: var(--d-ink); -webkit-tap-highlight-color: transparent; }
  .picon { image-rendering: pixelated; display: block; pointer-events: none; }
  .title-row { display: flex; align-items: center; gap: 8px; }
  .emblem { width: 32px; height: 32px; image-rendering: pixelated; }
  .deco { position: absolute; bottom: 6%; width: 48px; height: 48px; image-rendering: pixelated;
    pointer-events: none; transition: opacity .5s; }
  .deco.left { left: 4%; } .deco.right { right: 4%; }
  .compact .deco { display: none; }
  .screen.faded .bg { filter: brightness(.55) saturate(.8); }
  .screen .status img { position: static; } /* not scene sprites */
  .row.icons { grid-template-columns: 18px 76px minmax(0, 1fr); }
  .row .picon { width: 18px; height: 18px; }
  .hearts { display: flex; gap: 3px; }
  .hearts img { width: 18px; height: 18px; image-rendering: pixelated; }
  .toy .cap { width: 46px; height: 46px; display: flex; align-items: center; justify-content: center;
    background: #fff7ec; color: #3a2a1a; box-shadow: 0 5px 0 var(--d-btn-shadow);
    transition: transform .08s, box-shadow .08s, background .2s; }
  .egg .toy .cap { border-radius: 50%; }
  .tank .toy .cap { border-radius: 14px; }
  .toy:active .cap { transform: translateY(4px); box-shadow: 0 1px 0 var(--d-btn-shadow); }
  .toy.wanted .cap { background: #ffe9a8;
    box-shadow: 0 5px 0 var(--d-btn-shadow), 0 0 0 4px #fff3c4, 0 0 16px 5px #ffd76a; }
  .toy.on .cap { background: #3a2a1a; color: #ffe9a8; }
  .toy[disabled] { opacity: .45; cursor: default; }
  .compact .toy .cap { width: 38px; height: 38px; }
  .compact .toy { font-size: 12px; }
  .compact .egg .body { padding: 28px 14px 24px; }
  .warn { padding: 16px; color: var(--error-color, #c00); background: var(--card-background-color); }
`;

class HatchPetCard extends HTMLElement {
  static getConfigForm() {
    return {
      schema: [
        {
          name: "entities",
          selector: { entity: { multiple: true, filter: { integration: "virtual_pet" } } },
        },
      ],
      computeLabel: () => "Pets to show (any entity of each; empty shows all)",
    };
  }

  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    this._config = config || {};
    this._sig = null;
    this._index = this._index || 0;
  }

  getCardSize() {
    return 9;
  }

  getGridOptions() {
    return { columns: 6, min_columns: 6, rows: "auto" };
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  connectedCallback() {
    this._timer = setInterval(() => this._tick(), 700);
    if (this._resize && this._viewport) this._resize.observe(this._viewport);
    if (!document.querySelector("[data-hatch-font]")) {
      // Tiny5 (SIL OFL), served by the integration so it works offline. It
      // stays legible at button-label sizes, where most pixel fonts blur.
      const style = document.createElement("style");
      style.dataset.hatchFont = "";
      style.textContent = `@font-face { font-family: 'Tiny5';
        src: url(${BASE}/fonts/Tiny5.woff2?v=${VERSION}) format('woff2'); font-display: swap; }`;
      document.head.append(style);
    }
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    this._resize?.disconnect();
  }

  // --- Finding the pets --------------------------------------------------------

  _devices() {
    const hass = this._hass;
    const wanted = [].concat(this._config.entities || [], this._config.entity || []);
    const deviceIds = [];
    if (wanted.length) {
      for (const id of wanted) {
        const d = hass.entities?.[id]?.device_id;
        if (d && !deviceIds.includes(d)) deviceIds.push(d);
      }
    } else {
      for (const e of Object.values(hass.entities || {})) {
        if (e.platform === "virtual_pet" && e.translation_key === "life_stage" && e.device_id) {
          deviceIds.push(e.device_id);
        }
      }
    }
    return deviceIds.map((device) => {
      const ids = { device };
      for (const e of Object.values(hass.entities)) {
        if (e.device_id === device && e.platform === "virtual_pet") {
          ids[`${e.entity_id.split(".")[0]}.${e.translation_key}`] = e.entity_id;
        }
      }
      return ids;
    });
  }

  // --- Building --------------------------------------------------------------

  _build() {
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${STYLE}</style>
      <ha-card>
        <div class="head">
          <div><div class="title-row"><img class="emblem" alt=""><div class="title"></div></div>
            <div class="sub"></div></div>
          <div class="chips">
            <span class="chip"></span>
            <button class="statusbtn" aria-pressed="false">${pixelIcon("icon_status", 24)}<span>Status</span></button>
          </div>
        </div>
        <div class="viewport"><div class="ground"></div>
          <img class="deco left" alt=""><img class="deco right" alt="">
          <div class="track"></div></div>
        <div class="foot">
          <button class="nav prev" aria-label="Previous device">${icon("prev", 20)}</button>
          <div class="dots"></div>
          <button class="nav next" aria-label="Next device">${icon("next", 20)}</button>
        </div>
      </ha-card>`;
    this._card = root.querySelector("ha-card");
    this._viewport = root.querySelector(".viewport");
    this._track = root.querySelector(".track");
    this._dots = root.querySelector(".dots");
    root.querySelector(".statusbtn").addEventListener("click", () => {
      const s = this._slides[this._index];
      if (s) this._toggleStatus(s);
    });
    root.querySelector(".prev").addEventListener("click", () => this._go(this._index - 1));
    root.querySelector(".next").addEventListener("click", () => this._go(this._index + 1));
    let startX = null;
    this._viewport.addEventListener("pointerdown", (e) => {
      startX = e.clientX;
      this._swiped = false;
    });
    this._viewport.addEventListener("pointerup", (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 40) {
        this._swiped = true;
        this._go(this._index + (dx < 0 ? 1 : -1));
      }
    });
    this._resize = new ResizeObserver(() => this._layout());
    this._resize.observe(this._viewport);
    this._visible = true;
    new IntersectionObserver((entries) => {
      this._visible = entries.some((e) => e.isIntersecting);
    }).observe(this._card);
    this._slides = [];
  }

  _buildSlide() {
    const slide = document.createElement("div");
    slide.className = "slide";
    slide.innerHTML = `
      <div class="device">
        <div class="loop"></div><div class="lid"><span></span><span></span><span></span></div>
        <div class="body">
          <span class="label"></span>
          <div class="bezel"><div class="screen" role="button" tabindex="0" aria-label="Show status">
            <img class="bg" alt="">
            <img class="awaysign" alt=""><div class="awaylabel"></div>
            <img class="poop p0" alt=""><img class="poop p1" alt=""><img class="poop p2" alt="">
            <img class="pet" alt="">
            <img class="prop" alt="">
            <img class="attention" alt="">
            <div class="bubble"></div>
            <div class="status"></div>
          </div><button class="request"></button></div>
          <div class="buttons"></div>
        </div>
        <div class="feet"><span></span><span></span></div>
      </div>`;
    const q = (sel) => slide.querySelector(sel);
    const s = {
      el: slide, device: q(".device"), label: q(".label"), screen: q(".screen"), bg: q(".bg"),
      awaysign: q(".awaysign"), awaylabel: q(".awaylabel"), pet: q(".pet"), prop: q(".prop"),
      attention: q(".attention"), bubble: q(".bubble"), status: q(".status"),
      poops: [...slide.querySelectorAll(".poop")], buttons: {}, frame: 0,
      request: q(".request"),
    };
    s.request.addEventListener("click", () => {
      if (s.request.dataset.key) this._press(s, s.request.dataset.key);
    });
    s.screen.addEventListener("click", () => {
      if (!this._swiped) this._toggleStatus(s);
    });
    s.screen.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._toggleStatus(s);
      }
    });
    // The device beside the current one is inert; tapping it brings it forward.
    slide.addEventListener("click", () => {
      const i = this._slides.indexOf(s);
      if (i !== this._index && !this._swiped) this._go(i);
    });
    const box = q(".buttons");
    for (const action of ACTIONS) {
      const b = document.createElement("button");
      b.className = "toy";
      b.innerHTML = `<span class="cap">${pixelIcon(ACTION_ICONS[action.key])}</span><span>${action.label}</span>`;
      if (action.aria) b.setAttribute("aria-label", action.aria);
      b.addEventListener("click", () => this._press(s, action.key));
      box.append(b);
      s.buttons[action.key] = b;
    }
    const lights = document.createElement("button");
    lights.className = "toy";
    lights.innerHTML = `<span class="cap"></span><span class="lbl"></span>`;
    lights.addEventListener("click", () => this._toggleLights(s));
    box.append(lights);
    s.buttons.lights = lights;
    this._track.append(slide);
    return s;
  }

  // --- Updating --------------------------------------------------------------

  async _update() {
    if (!this._hass || !this._config) return;
    if (!this.shadowRoot) this._build();
    const devices = this._devices();
    const sig = JSON.stringify(devices.map((ids) => Object.keys(ids).map((k) =>
      k === "device"
        ? [ids[k], this._hass.devices?.[ids[k]]?.name_by_user, this._hass.devices?.[ids[k]]?.name]
        : this._hass.states[ids[k]]?.last_updated))) +
      (this._hass.states["sun.sun"]?.state || "");
    if (sig === this._sig) return;
    this._sig = sig;

    if (!devices.length) {
      while (this._slides.length) this._slides.pop().el.remove();
      this._card.classList.add("single");
      this._card.querySelector(".chips").style.display = "none";
      const configured = [].concat(this._config.entities || [], this._config.entity || []).length;
      this._card.querySelector(".title").textContent = configured ? "Pet not found" : "No pets yet";
      this._card.querySelector(".sub").textContent = configured
        ? "None of this card's entities belong to a virtual pet. Edit the card to pick them again."
        : "Add the Virtual Pet integration to hatch one.";
      return;
    }
    this._card.querySelector(".chips").style.display = "";
    let worlds;
    try {
      worlds = await loadJson("worlds.json");
    } catch (err) {
      return;
    }
    while (this._slides.length < devices.length) this._slides.push(this._buildSlide());
    while (this._slides.length > devices.length) this._slides.pop().el.remove();
    this._index = Math.min(this._index, devices.length - 1);

    for (let i = 0; i < devices.length; i++) {
      const s = this._slides[i];
      s.ids = devices[i];
      const stage = this._state(s, "sensor.life_stage");
      s.world = worlds[stage?.attributes.world] || Object.values(worlds)[0];
      const roster = stage?.attributes.roster || [];
      const speciesId = stage?.attributes.species || roster[0];
      if (speciesId && speciesId !== s.speciesId) {
        s.speciesId = speciesId;
        s.species = null;
        loadJson(`sprites/${speciesId}/species.json`).then((data) => {
          s.species = data;
          this._sig = null;
          this._update();
        }).catch(() => {
          s.bubble.textContent = `missing sprites for ${speciesId}`;
        });
      }
      if (s.species) {
        try {
          this._renderSlide(s);
        } catch (err) {
          console.error("hatch-pet-card: could not draw", s.speciesId, err);
        }
      }
    }
    this._card.classList.toggle("single", devices.length < 2);
    this._renderShelf();
  }

  _state(s, key) {
    const id = s.ids?.[key];
    return id ? this._hass.states[id] : undefined;
  }

  _go(index) {
    const n = this._slides.length;
    if (!n) return;
    this._index = (index + n) % n;
    this._renderShelf();
  }

  _layout() {
    const vw = this._viewport.clientWidth;
    if (!vw) return;
    this._slideW = Math.min(330, vw - 56);
    this._card.classList.toggle("compact", this._slideW < 280);
    for (const s of this._slides) s.el.style.width = `${this._slideW}px`;
    this._renderShelf();
  }

  _renderShelf() {
    const s = this._slides[this._index];
    if (!s || !s.world) return;
    const vw = this._viewport.clientWidth;
    const w = this._slideW || Math.min(330, vw - 56);
    for (const slide of this._slides) slide.el.style.width = `${w}px`;
    this._track.style.transform = `translateX(${(vw - w) / 2 - this._index * (w + 16)}px)`;
    this._slides.forEach((slide, i) => {
      const current = i === this._index;
      slide.el.classList.toggle("away-slide", !current);
      slide.device.inert = !current;
      slide.el.setAttribute("aria-hidden", current ? "false" : "true");
    });

    const world = s.world;
    this._card.style.setProperty("--hp-backdrop", world.backdrop);
    this._card.style.setProperty("--hp-ground", world.ground);
    this._card.style.setProperty("--hp-ink", world.ink);
    this._card.style.setProperty("--hp-subink", world.subink);
    const device = this._hass.devices?.[s.ids.device];
    const stage = this._state(s, "sensor.life_stage");
    const days = stage?.attributes.age_days;
    const kind = stage?.state === "egg" ? "Egg" : s.species?.name || "";
    this._card.querySelector(".title").textContent = device?.name_by_user || device?.name || "Pet";
    const emblem = this._card.querySelector(".emblem");
    if (world.emblem) {
      emblem.src = `${BASE}/ui/${world.emblem}.png?v=${VERSION}`;
      emblem.style.display = "";
    } else {
      emblem.style.display = "none";
    }
    this._card.querySelectorAll(".deco").forEach((img, i) => {
      const name = world.deco?.[i];
      img.style.display = name ? "" : "none";
      if (name) img.src = `${BASE}/ui/${name}.png?v=${VERSION}`;
    });
    this._card.querySelector(".sub").textContent = [world.name, kind,
      stage?.state !== "egg" ? STAGE_LABELS[stage?.state] : null,
      days != null ? `day ${Math.floor(days) + 1}` : null].filter(Boolean).join(" · ");
    const chip = this._card.querySelector(".chip");
    chip.textContent = `${this._index + 1} / ${this._slides.length}`;
    chip.style.display = this._slides.length > 1 ? "" : "none";

    while (this._dots.children.length < this._slides.length) {
      const i = this._dots.children.length;
      const dot = document.createElement("button");
      dot.className = "dot";
      dot.addEventListener("click", () => this._go(i));
      this._dots.append(dot);
    }
    while (this._dots.children.length > this._slides.length) this._dots.lastChild.remove();
    [...this._dots.children].forEach((dot, i) => {
      const name = this._hass.devices?.[this._slides[i].ids?.device];
      dot.setAttribute("aria-label", `Show ${name?.name_by_user || name?.name || `pet ${i + 1}`}`);
      dot.setAttribute("aria-current", i === this._index ? "true" : "false");
    });
    this._card.querySelector(".statusbtn").setAttribute(
      "aria-pressed", s.screen.classList.contains("show-status") ? "true" : "false");
  }

  _show(s, img, sprite) {
    if (!sprite) {
      img.style.display = "none";
      return;
    }
    // "bird/medicine" borrows another species' sprite.
    const path = sprite.includes("/") ? sprite : `${s.speciesId}/${sprite}`;
    const src = `${BASE}/sprites/${path}.png?v=${VERSION}`;
    if (img.getAttribute("src") !== src) img.setAttribute("src", src);
    img.style.display = "";
  }

  _renderSlide(s) {
    const sp = s.species;
    const world = s.world;
    const shell = world.shell || {};
    const color = shell.color || "#e8834a";
    const dev = s.device;
    dev.className = `device ${shell.shape === "tank" ? "tank" : "egg"}`;
    dev.querySelector(".loop").style.display = shell.shape === "tank" ? "none" : "";
    dev.querySelector(".lid").style.display = shell.shape === "tank" ? "" : "none";
    dev.querySelector(".feet").style.display = shell.shape === "tank" ? "" : "none";
    dev.style.setProperty("--d-shell", color);
    dev.style.setProperty("--d-dark", shade(color, 0.72));
    dev.style.setProperty("--d-ink", shade(color, 0.28));
    dev.style.setProperty("--d-btn-shadow", shade(color, 0.6));
    dev.style.setProperty("--d-bezel", shell.bezel || "#f3ead7");
    s.label.textContent = world.label || world.name;

    const mood = this._state(s, "sensor.mood");
    const stageState = this._state(s, "sensor.life_stage");
    const stage = stageState?.state;
    const flags = mood?.attributes.flags || [];
    const calling = this._state(s, "binary_sensor.calling")?.state === "on";
    const lightsOut = this._state(s, "switch.lights_out")?.state === "on";
    const asleep = this._state(s, "binary_sensor.asleep")?.state === "on";
    const away = mood?.state === "away";
    s.asleep = asleep;

    let scene = "day";
    if (flags.includes("rainy")) scene = "rain";
    if (this._hass.states["sun.sun"]?.state === "below_horizon") scene = "night";
    if (asleep || lightsOut) scene = "dim";
    const own = sp.backgrounds?.[scene];
    this._show(s, s.bg, own || sp.backgrounds?.day || Object.values(sp.backgrounds || {})[0]);
    // A species with only a day scene gets it darkened for night and sleep.
    s.screen.classList.toggle("faded", !own && scene !== "day" && scene !== "rain");
    s.screen.classList.toggle("night", scene === "night");
    s.screen.classList.toggle("dim", scene === "dim");

    if (away) {
      s.frames = [];
      this._show(s, s.pet, null);
      this._show(s, s.awaysign, sp.props?.away);
      s.awaylabel.textContent = "At the sitter's";
    } else {
      this._show(s, s.awaysign, null);
      s.awaylabel.textContent = "";
      s.frames = this._petFrames(sp, stage, mood?.state, calling, stageState?.attributes.age_days, flags);
      this._show(s, s.pet, s.frames[s.frame % s.frames.length]);
    }
    s.pet.classList.toggle("hop", mood?.state === "excited");
    s.pet.alt = s.species?.name || "pet";

    const poop = away ? 0 : Number(this._state(s, "sensor.poop")?.state || 0);
    s.poops.forEach((img, i) => this._show(s, img, i < poop ? sp.props?.poop?.[i] : null));
    this._show(s, s.attention, calling && !away ? sp.props?.attention : null);
    if (!s.propUntil || Date.now() > s.propUntil) this._show(s, s.prop, null);

    const log = this._state(s, "sensor.last_care")?.attributes.log || [];
    const latestAt = log[0]?.at ?? null;
    if (s.lastLogAt === undefined) s.lastLogAt = latestAt; // don't react to old care
    if (latestAt !== s.lastLogAt) {
      if (Date.now() - new Date(latestAt) < 15000) this._react(s, log[0]);
      s.lastLogAt = latestAt;
    }
    const egg = stage === "egg";
    s.hatchesAt = egg ? stageState?.attributes.hatches_at : null;
    if (!s.sayUntil || Date.now() > s.sayUntil) s.bubble.textContent = this._say(s, mood, away);

    for (const action of ACTIONS) {
      const b = s.buttons[action.key];
      const ent = this._state(s, `button.${action.key}`);
      b.disabled = !ent || ent.state === "unavailable" || egg || away;
      b.classList.toggle("wanted", !b.disabled && !asleep && !!action.wants && flags.includes(action.wants));
    }
    const wanted = (mood?.attributes.requests || []).find((r) => this._state(s, `button.${r}`));
    s.request.classList.toggle("show", !!wanted && !away && !asleep);
    if (wanted) {
      s.request.dataset.key = wanted;
      s.request.textContent = REQUEST_LABELS[wanted] || `${wanted}?`;
      s.request.setAttribute("aria-label", `Give the pet a ${wanted}`);
    }

    const lights = s.buttons.lights;
    const lightsEnt = this._state(s, "switch.lights_out");
    lights.disabled = !lightsEnt || lightsEnt.state === "unavailable" || away;
    lights.classList.toggle("on", lightsOut);
    lights.classList.toggle("wanted", !lightsOut && !asleep && flags.includes("sleepy") && calling);
    const lightsIcon = lightsOut ? "icon_lights_on" : "icon_lights_out";
    if (lights.dataset.icon !== lightsIcon) {
      lights.querySelector(".cap").innerHTML = pixelIcon(lightsIcon);
      lights.dataset.icon = lightsIcon;
    }
    lights.querySelector(".lbl").textContent = lightsOut ? "wake" : "sleep";
    lights.title = lightsOut ? "Lights on: wake the pet" : "Lights out: put the pet to bed";

    this._renderStatus(s, log);
  }

  _say(s, mood, away) {
    if (away) return "";
    if (s.hatchesAt) {
      const minutes = Math.max(1, Math.ceil((new Date(s.hatchesAt) - Date.now()) / 60000));
      return minutes <= 1 ? "crack... crack..." : `hatching in about ${minutes} min`;
    }
    return mood?.attributes.reason || "";
  }

  _toggleStatus(s) {
    const open = !s.screen.classList.contains("show-status");
    s.screen.classList.toggle("show-status", open);
    s.screen.setAttribute("aria-label", open ? "Hide status" : "Show status");
    if (open) this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
    if (s === this._slides[this._index]) {
      this._card.querySelector(".statusbtn").setAttribute("aria-pressed", open ? "true" : "false");
    }
  }

  _petFrames(sp, stage, mood, calling, days, flags = []) {
    if (stage === "egg") {
      if (!sp.egg) return [];
      if (days != null && days * 24 >= 0.4) return sp.egg.crack;
      return calling ? sp.egg.wiggle : sp.egg.idle;
    }
    let drawn = stage;
    if (!sp.stages.includes(drawn)) drawn = sp.stage_fallback?.[stage] || sp.stages[sp.stages.length - 1];
    // Special poses are drawn for the child; other stages would change size.
    if (drawn === "child" && POSE_MOODS.has(mood)) {
      const flag = flags.find((f) => POSES[f] && sp.extras?.[POSES[f]]);
      if (flag) {
        const pose = sp.extras[POSES[flag]];
        return Array.isArray(pose) ? pose : [pose];
      }
    }
    const m = sp.moods.includes(mood) ? mood : "content";
    const frames = [];
    for (let i = 1; i <= (sp.frames || 1); i++) frames.push(`${drawn}_${m}_${i}`);
    return frames;
  }

  _tick() {
    if (!this._slides || !this._visible || document.hidden) return;
    this._ticks = (this._ticks || 0) + 1;
    for (const s of this._slides) {
      if (s.frames?.length && !(s.asleep && this._ticks % 2)) {
        s.frame = (s.frame + 1) % s.frames.length;
        this._show(s, s.pet, s.frames[s.frame]);
      }
      if (s.propUntil && Date.now() > s.propUntil) {
        this._show(s, s.prop, null);
        s.propUntil = 0;
      }
      if (s.sayUntil && Date.now() > s.sayUntil) s.sayUntil = 0;
      if (!s.sayUntil && s.species) {
        const mood = this._state(s, "sensor.mood");
        s.bubble.textContent = this._say(s, mood, mood?.state === "away");
      }
    }
  }

  _react(s, entry) {
    if (entry.result === "ok") {
      const prop = s.species?.props?.[entry.action];
      if (prop) {
        this._show(s, s.prop, prop);
        s.propUntil = Date.now() + 2500;
      }
      return;
    }
    const line = REFUSALS[entry.result];
    if (line) {
      s.bubble.textContent = line;
      s.sayUntil = Date.now() + 3500;
    }
  }

  _renderStatus(s, log) {
    const value = (key) => {
      const v = Number.parseFloat(this._state(s, `sensor.${key}`)?.state);
      return Number.isFinite(v) ? v : null;
    };
    const hearts = (v) => {
      if (v === null) return "–";
      const halves = Math.ceil(v / 12.5); // 4 hearts, in halves
      const img = (n) => `<img src="${BASE}/ui/stat_heart_${n}.png?v=${VERSION}" alt="">`;
      let out = "";
      for (let i = 0; i < 4; i++) {
        const left = halves - i * 2;
        out += img(left >= 2 ? "full" : left === 1 ? "half" : "empty");
      }
      return `<span class="hearts" role="img" aria-label="${Math.round(v)} of 100">${out}</span>`;
    };
    const ic = (n) => pixelIcon(n, 18);
    const bar = (v) => v === null ? "–" : `<div class="bar"><div style="width:${v}%"></div></div>`;
    const lines = log.slice(0, 3).map((e) =>
      `<div>${escape(e.action)}${e.by ? ` by ${escape(e.by)}` : ""} · ${timeAgo(e.at)}` +
      `${e.result && e.result !== "ok" ? ` (${escape(e.result.replace("_", " "))})` : ""}</div>`);
    s.status.innerHTML = `
      <div class="row icons">${ic("icon_feed")}<span>hunger</span>${hearts(value("hunger"))}</div>
      <div class="row icons">${ic("icon_play")}<span>happy</span>${hearts(value("happiness"))}</div>
      <div class="row icons">${ic("stat_energy")}<span>energy</span>${bar(value("energy"))}</div>
      <div class="row icons">${ic("stat_health")}<span>health</span>${bar(value("health"))}</div>
      <div class="row icons">${ic("stat_discipline")}<span>discipline</span>${bar(value("discipline"))}</div>
      <div class="row icons">${ic("stat_care_miss")}<span>misses</span><span>${value("care_misses") ?? "–"}</span></div>
      <div class="log">${lines.join("") || "<div>No care yet.</div>"}</div>`;
  }

  // --- Actions ----------------------------------------------------------------

  _press(s, action) {
    const id = s.ids?.[`button.${action}`];
    if (id) this._hass.callService("button", "press", { entity_id: id });
  }

  _toggleLights(s) {
    const id = s.ids?.["switch.lights_out"];
    if (!id) return;
    const on = this._hass.states[id]?.state === "on";
    this._hass.callService("switch", on ? "turn_off" : "turn_on", { entity_id: id });
  }
}

// The integration loads this file on every dashboard. If an old manual
// resource also loads it, keep the first definition instead of erroring.
if (!customElements.get("hatch-pet-card")) {
  customElements.define("hatch-pet-card", HatchPetCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "hatch-pet-card")) window.customCards.push({
  type: "hatch-pet-card",
  name: "Hatch at Home pet shelf",
  description: "Your virtual pets, each in its world's handheld device.",
  preview: true,
});

console.info(`%c HATCH-PET-CARD %c ${VERSION} `,
  "background:#c8642a;color:#fff", "background:#333;color:#fff");
