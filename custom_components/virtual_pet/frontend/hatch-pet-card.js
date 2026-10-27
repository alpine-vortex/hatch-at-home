// Hatch at Home: the device shelf. One card holds every pet device: each is
// a handheld toy themed for its world, standing on that world's backdrop.
// Arrows, dots or a swipe move to the next device. All state lives in Home
// Assistant; the card only draws and presses the pets' buttons and switch.

const VERSION = "0.21.0";
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
  { key: "play", label: "play", aria: "play: a left or right guessing game", wants: "bored" },
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
  away: "I'm at the sitter's!",
};

// Actions that borrow another action's prop sprite.
const PROP_FOR = { game: "play", chore_treat: "snack" };
// Shared pixel icons for props no species has drawn yet ("../ui/" leaves sprites/).
const FALLBACK_PROPS = { scold: "../ui/icon_scold", praise: "../ui/icon_praise" };
// Missing sprites are reported once each in the console.
const WARNED = new Set();

// Home flags that swap the pet into a special pose (species.json "extras").
const POSES = {
  too_bright: "squint", chilly: "shiver", storm: "shiver", warm: "sweat", masked: "mask",
  dancing: "dance", watching_tv: "watch_tv",
};
// Shared house poses; a species' other extras are its own (used for idle life).
const SHARED_POSES = new Set(Object.values(POSES));
// What the journal calls a memory.
const MEMORY_LABELS = { first_snow: "first snow", first_frost: "first frost" };
// Idle life: something small every so often when nothing else is going on.
const IDLE_MIN_MS = 20000;
const IDLE_SPREAD_MS = 25000;
const IDLE_MOODS = new Set(["content", "cozy", "bored", "excited", "sleepy", "hungry", "dirty"]);
// A viewer is greeted by name at most this often, per pet.
const GREET_EVERY_MS = 3 * 3600 * 1000;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
// How long the happy bounce lasts when the pet gets excited.
const BOUNCE_MS = 10000;
const POSE_MOODS = new Set(["content", "excited", "cozy", "bored", "sleepy"]);

// The same bands as rates.py (WEIGHT_LIGHT_BELOW, WEIGHT_HEAVY_ABOVE).
function weightLabel(v) {
  if (v === null) return "–";
  return `${Math.round(v)} · ${v < 25 ? "a bit light" : v > 75 ? "a bit heavy" : "just right"}`;
}

const REQUEST_LABELS = { blanket: "blanket?", fan: "fan?", lay_egg: "lay an egg?" };
const REQUEST_ARIA = {
  lay_egg: "Lay an egg: the pet retires to the journal and a new egg takes its place",
};
const CONFIRM_MS = 4000; // laying an egg ends this pet's turn, so it takes two taps

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

// "night owl ★★", with "↓" when it was handed down from the parent.
function traitLabel(trait, level, inherited) {
  return `${inherited ? "↓" : ""}${escape(trait.replace("_", " "))} ${"★".repeat(level || 1)}`;
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
  .slide.away-slide { opacity: .5; transform: scale(.94); }
  .foot { display: flex; align-items: center; justify-content: space-between; padding: 0 14px 14px; }
  .nav { width: 44px; height: 44px; border: none; border-radius: 22px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; color: var(--hp-ink);
    background: color-mix(in srgb, var(--hp-ink) 14%, transparent); }
  /* Dots share what room the arrows leave; many pets wrap onto a second row. */
  .foot { gap: 8px; }
  .nav { flex-shrink: 0; }
  .dots { display: flex; flex-wrap: wrap; justify-content: center; gap: 0 4px; min-width: 0; }
  .dot { width: 22px; height: 24px; border: none; padding: 0; cursor: pointer;
    background: none; display: flex; align-items: center; justify-content: center; }
  .dot::before { content: ""; width: 10px; height: 10px; border-radius: 5px;
    background: color-mix(in srgb, var(--hp-ink) 55%, transparent); transition: width .3s; }
  .dot[aria-current="true"]::before { width: 20px; background: var(--hp-ink); }
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
  /* The lid sits over the body's top bevel, which on a pale shell reads as a gap. */
  .lid { position: relative; z-index: 1; margin-bottom: -5px; }
  .feet { width: 82%; display: flex; justify-content: space-between; }
  .feet span { width: 34px; height: 10px; background: var(--d-dark); border-radius: 0 0 6px 6px; }
  /* House: a pitched roof with a chimney, sitting on the body like a cottage. */
  .roof { position: relative; width: 108%; height: 64px; margin-bottom: -2px; }
  .roof::before { content: ""; position: absolute; right: 20%; top: 6px; width: 22px; height: 40px;
    background: var(--d-dark); box-shadow: inset 0 5px 0 rgba(255,255,255,.18); }
  .roof::after { content: ""; position: absolute; inset: 0; background: var(--d-dark);
    clip-path: polygon(50% 0, 100% 100%, 0 100%); }
  .compact .roof { height: 46px; }
  /* Porthole: a riveted brass ring around a rounded window. */
  .porthole .body { border-radius: 40px; padding: 22px 18px 26px; }
  .porthole .bezel { padding: 14px; border-radius: 30% / 38%;
    background-image: radial-gradient(circle at 50% 7px, var(--d-dark) 0 3px, transparent 4px),
      radial-gradient(circle at 50% calc(100% - 7px), var(--d-dark) 0 3px, transparent 4px),
      radial-gradient(circle at 7px 50%, var(--d-dark) 0 3px, transparent 4px),
      radial-gradient(circle at calc(100% - 7px) 50%, var(--d-dark) 0 3px, transparent 4px),
      radial-gradient(circle at calc(8.8% + 5px) calc(11% + 5px), var(--d-dark) 0 3px, transparent 4px),
      radial-gradient(circle at calc(91.2% - 5px) calc(11% + 5px), var(--d-dark) 0 3px, transparent 4px),
      radial-gradient(circle at calc(8.8% + 5px) calc(89% - 5px), var(--d-dark) 0 3px, transparent 4px),
      radial-gradient(circle at calc(91.2% - 5px) calc(89% - 5px), var(--d-dark) 0 3px, transparent 4px); }
  .porthole .screen { border-radius: 28% / 36%; }
  .porthole .bubble { left: 13%; top: 10%; }
  .porthole .attention { right: 13%; top: 9%; }
  .porthole .toy .cap { border-radius: 50%; box-shadow: 0 5px 0 var(--d-btn-shadow), inset 0 0 0 3px var(--d-bezel); }
  /* Pad: a lily pad, veins fanning from the notch at the top. */
  .pad .body { border-radius: 50% / 30%; padding: 40px 22px 40px;
    background-image: repeating-conic-gradient(from 90deg at 50% 0, transparent 0 13deg,
      rgba(0,0,0,.08) 13deg 14.5deg); }
  .pad .body::before { content: ""; position: absolute; top: -1px; left: 50%; width: 46px;
    height: 34px; margin-left: -23px; background: var(--hp-backdrop);
    clip-path: polygon(0 0, 100% 0, 50% 100%); }
  .pad .toy .cap { border-radius: 50%; }
  .pad .buttons { width: 86%; }
  /* Moon: a crescent riding on top of a rounded body sprinkled with stars. */
  .crescent { width: 64px; height: 64px; border-radius: 50%; margin: 0 0 -26px 26px;
    box-shadow: inset -15px 7px 0 0 var(--d-bezel); transform: rotate(-20deg); position: relative; z-index: 1; }
  .moon .body { border-radius: 34px; padding: 30px 18px 24px;
    background-image: radial-gradient(circle at 12% 20%, rgba(255,255,255,.55) 0 1.5px, transparent 2.5px),
      radial-gradient(circle at 88% 14%, rgba(255,255,255,.45) 0 1.5px, transparent 2.5px),
      radial-gradient(circle at 6% 62%, rgba(255,255,255,.4) 0 1.5px, transparent 2.5px),
      radial-gradient(circle at 94% 56%, rgba(255,255,255,.5) 0 1.5px, transparent 2.5px),
      radial-gradient(circle at 4% 86%, rgba(255,255,255,.35) 0 1.5px, transparent 2.5px),
      radial-gradient(circle at 96% 90%, rgba(255,255,255,.45) 0 1.5px, transparent 2.5px); }
  .moon .toy .cap { border-radius: 50%; }
  .murk { inset: 0; width: 100%; height: 100%; opacity: 0; transition: opacity .8s; }
  .body { width: 100%; box-sizing: border-box; background: var(--d-shell);
    box-shadow: inset 0 -9px 0 var(--d-dark), inset 0 5px 0 rgba(255,255,255,.28), 0 16px 34px rgba(20,15,5,.32);
    display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .body { position: relative; }
  .trim-top { position: absolute; top: -12px; left: 50%; width: 192px; height: 57px;
    margin-left: -96px; pointer-events: none; image-rendering: pixelated; }
  .trim-corner { position: absolute; bottom: -18px; width: 64px; height: 44px;
    pointer-events: none; image-rendering: pixelated; }
  .trim-corner.left { left: 14%; } .trim-corner.right { right: 14%; transform: scaleX(-1); }
  .label.plate { width: 192px; height: 44px; display: flex; align-items: center;
    justify-content: center; background-size: 100% 100%; image-rendering: pixelated;
    color: #fff4dc; text-shadow: 0 2px 0 #3a1e0c; margin-top: 10px; letter-spacing: .08em; }
  .compact .trim-top { width: 128px; height: 38px; margin-left: -64px; top: -8px; }
  .compact .trim-corner { display: none; }
  .egg .body { border-radius: 50% 50% 46% 46% / 30% 30% 18% 18%; padding: 36px 20px 40px; }
  .egg .buttons { width: 88%; }
  .tank .body { border-radius: 18px; padding: 16px 18px 22px; }
  .house .body { border-radius: 0 0 10px 10px; padding: 18px 18px 24px; }
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
  .pet, .perch { left: 50%; bottom: 4%; height: 62%; margin-left: -23.25%; transform-origin: 50% 100%; }
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
  /* The left/right game: two big guess buttons and a score over the scene. */
  .game { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
  .game[hidden] { display: none; }
  .game button { pointer-events: auto; position: absolute; display: grid; place-items: center;
    min-width: 44px; min-height: 44px; border-radius: 50%; border: 2px solid #3a2a1a;
    background: #fffdf5; color: #3a2a1a; box-shadow: 2px 2px 0 #3a2a1a; cursor: pointer; padding: 0; }
  .game button:disabled { opacity: .5; cursor: default; }
  .game button:focus-visible { outline: 3px solid #fffdf5; outline-offset: 2px; }
  .game .gl { left: 4%; bottom: 8%; }
  .game .gr { right: 4%; bottom: 8%; }
  .game .gx { right: 4%; top: 6%; min-width: 32px; min-height: 32px; font: inherit; font-size: 14px; }
  .game .gscore { position: absolute; left: 50%; bottom: 4%; transform: translateX(-50%);
    padding: 2px 8px; border-radius: 8px; background: #fffdf5; color: #3a2a1a;
    border: 2px solid #3a2a1a; font-size: 12px; white-space: nowrap; }
  .screen.show-status .game, .screen.show-status .rain, .screen.show-status .breeze,
  .screen.show-status .flash, .screen.show-status .speck { display: none !important; }
  .pet { transition: translate .25s ease-out; }
  /* Reactions to moments (see _moment). */
  .pet.sulk { animation: shake .35s 2; }
  .pet.born { animation: pop .45s ease-out; }
  .pet.stretch { animation: perk .5s ease-out 2; }
  .poop.born { animation: pop .4s ease-out; }
  .screen .burst.big { top: 38%; width: 96px; height: 96px; margin-left: -48px; z-index: 2; }
  /* Stand-ins for house poses that are only drawn for the child. */
  .pet.dance { animation: hop .45s ease-in-out infinite; }
  .pet.shiver { animation: shake .25s linear infinite; }
  /* The fan: wind lines cross the scene and the pet sways. */
  .breeze { position: absolute; inset: 0; pointer-events: none; display: none; z-index: 1; }
  .screen.breezy .breeze, .screen.windy .breeze { display: block; }
  .breeze span { position: absolute; left: -40%; height: 2px; width: 34%; border-radius: 1px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.85) 45%, rgba(255,255,255,.6) 80%, transparent);
    animation: wind 1.1s linear infinite; }
  .breeze span:nth-child(1) { top: 30%; }
  .breeze span:nth-child(2) { top: 48%; width: 24%; animation-delay: .35s; }
  .breeze span:nth-child(3) { top: 64%; animation-delay: .7s; }
  @keyframes wind { to { left: 110%; } }
  .screen.breezy .pet { animation: sway .7s ease-in-out infinite; }
  @keyframes sway { 50% { transform: rotate(-4deg); } }
  /* Thunder: now and then the scene flashes. */
  .flash { position: absolute; inset: 0; pointer-events: none; display: none; z-index: 2;
    background: #fff; opacity: 0; }
  .screen.stormy .flash { display: block; animation: lightning 9s linear infinite; }
  @keyframes lightning { 0%, 89%, 92%, 95%, 100% { opacity: 0; } 90% { opacity: .75; } 94% { opacity: .5; } }
  /* Idle life. */
  .pet { transition: translate .25s ease-out, rotate .2s ease-out; }
  .pet.look { rotate: y 180deg; }
  .pet.wander-l { translate: -16% 0; transition-duration: .9s; }
  .pet.wander-r { translate: 16% 0; transition-duration: .9s; }
  .speck { position: absolute; width: 6px; height: 6px; border-radius: 50%; background: #fff6c9;
    box-shadow: 0 0 6px 2px rgba(255,240,170,.8); top: 45%; z-index: 2; pointer-events: none;
    animation: speck 2.6s ease-in-out forwards; }
  .speck.rtl { animation-name: speck-rtl; }
  @keyframes speck { from { left: 8%; top: 30%; } 50% { top: 55%; } to { left: 88%; top: 38%; opacity: .2; } }
  @keyframes speck-rtl { from { left: 88%; top: 35%; } 50% { top: 58%; } to { left: 8%; top: 30%; opacity: .2; } }
  /* Rain for species with no rain scene of their own. */
  .rain { position: absolute; inset: 0; pointer-events: none; display: none; z-index: 1;
    background: repeating-linear-gradient(105deg, transparent 0 13px, rgba(215,230,255,.5) 13px 15px);
    background-size: 40px 40px; animation: rainfall .45s linear infinite; }
  .screen.raining .rain { display: block; }
  .screen.raining .bg { filter: brightness(.82) saturate(.75); }
  @keyframes rainfall { to { background-position: -10px 40px; } }
  /* Water worlds: lighter streaks, and rings where the drops land. */
  .screen.raining.watery .rain { opacity: .6; }
  .screen.raining.watery .rain::after { content: ""; position: absolute; inset: 0;
    background:
      radial-gradient(ellipse 10% 4% at 22% 80%, transparent 55%, rgba(255,255,255,.95) 62%, transparent 75%),
      radial-gradient(ellipse 10% 4% at 72% 70%, transparent 55%, rgba(255,255,255,.95) 62%, transparent 75%),
      radial-gradient(ellipse 10% 4% at 50% 90%, transparent 55%, rgba(255,255,255,.95) 62%, transparent 75%);
    animation: ripple 1.4s ease-out infinite; }
  @keyframes ripple { 0% { opacity: 0; transform: scale(.7); } 30% { opacity: 1; } 100% { opacity: 0; transform: scale(1.25); } }
  .pet.go-left, .perch.go-left { translate: -60% 0; }
  .pet.go-right, .perch.go-right { translate: 60% 0; }
  /* What the pet stands on (species.json "perch"); it follows the pet around. */
  .perch { transition: translate .25s ease-out; }
  .perch.wander-l { translate: -16% 0; transition-duration: .9s; }
  .perch.wander-r { translate: 16% 0; transition-duration: .9s; }
  .status { position: absolute; inset: 0; background: #e9e2c6; color: #2f3a24; padding: 9px 12px;
    display: none; flex-direction: column; gap: 4px; font-size: 13px; overflow: auto; }
  .screen.show-status .status { display: flex; }
  .screen.show-status .bubble { display: none; }
  /* Every row: an icon slot (maybe empty), the label, the value; all on one grid. */
  .row { display: grid; grid-template-columns: 18px 84px minmax(0, 1fr); align-items: center; gap: 6px; }
  .bar { height: 9px; border: 2px solid #2f3a24; padding: 1px; }
  .bar div { height: 100%; background: #2f3a24; }
  .hearts { letter-spacing: 2px; }
  .hearts .off { opacity: .25; }
  .jlink { align-self: flex-end; margin-top: 2px; border: none; background: none; padding: 2px 0;
    font: 400 12px 'Tiny5', monospace; color: inherit; text-decoration: underline; cursor: pointer; }
  .bell { border: 2px solid #2f3a24; border-radius: 10px; background: none; color: inherit;
    font: 400 12px 'Tiny5', monospace; padding: 1px 10px; min-width: 44px; cursor: pointer; }
  .bell[aria-pressed="true"] { background: #2f3a24; color: #e9e2c6; }
  .jhead { display: flex; justify-content: space-between; align-items: baseline; }
  .jgrid { display: flex; flex-wrap: wrap; gap: 6px 10px; }
  .jtile { display: flex; flex-direction: column; align-items: center; width: 64px; font-size: 11px;
    text-align: center; line-height: 1.1; }
  .jtile img { width: 48px; height: 48px; image-rendering: pixelated; }
  .jtile.locked img { filter: brightness(0); opacity: .3; }
  .jlist { font-size: 12px; opacity: .9; display: flex; flex-direction: column; gap: 3px; }
  .jlist .gt { opacity: .8; padding-left: 10px; }
  .jlist .gen.now { font-weight: 700; }
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
  .row .picon { width: 18px; height: 18px; }
  .hearts { display: flex; gap: 3px; }
  .hearts img { width: 18px; height: 18px; image-rendering: pixelated; }
  .toy .cap { width: 46px; height: 46px; display: flex; align-items: center; justify-content: center;
    background: #fff7ec; color: #3a2a1a; box-shadow: 0 5px 0 var(--d-btn-shadow);
    transition: transform .08s, box-shadow .08s, background .2s; }
  .egg .toy .cap { border-radius: 50%; }
  .tank .toy .cap { border-radius: 14px; }
  .house .toy .cap { border-radius: 10px 10px 4px 4px; }
  /* Pressed: held down for at least 160 ms so even a quick tap reads as a press. */
  .toy:active .cap, .toy.pressed .cap { transform: translateY(4px);
    box-shadow: 0 1px 0 var(--d-btn-shadow); transition-duration: .04s; }
  .toy.pending .cap { animation: waiting .9s ease-in-out infinite; }
  @keyframes waiting { 50% { filter: brightness(.9); } }
  .toy.failed .cap { animation: shake .35s; }
  @keyframes shake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
  .burst { position: absolute; left: 50%; top: 0; width: 46px; height: 46px; margin-left: -23px;
    border-radius: 50%; pointer-events: none; border: 3px solid #ffe9a8;
    animation: burst .45s ease-out forwards; }
  @keyframes burst { from { transform: scale(.6); opacity: .9; } to { transform: scale(1.5); opacity: 0; } }
  .toy { position: relative; }
  .pet.perk { animation: perk .3s ease-out; }
  @keyframes perk { 40% { transform: translateY(-6%) scale(1.04, .96); } }
  .toy.wanted .cap { background: #ffe9a8;
    box-shadow: 0 5px 0 var(--d-btn-shadow), 0 0 0 4px #fff3c4, 0 0 16px 5px #ffd76a; }
  .toy.on .cap { background: #3a2a1a; color: #ffe9a8; }
  .toy[disabled] { opacity: .45; cursor: default; }
  .compact .toy .cap { width: 38px; height: 38px; }
  .compact .toy { font-size: 12px; }
  .compact .egg .body { padding: 28px 14px 32px; }
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

  static getConfigElement() {
    return document.createElement("hatch-pet-card-editor");
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
    // Pets picked in the editor (devices), or by any one entity of each (YAML).
    const wanted = [].concat(this._config.entities || [], this._config.entity || []);
    const deviceIds = [...(this._config.devices || [])].filter((d) => hass.devices?.[d]);
    if (wanted.length || this._config.devices?.length) {
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
        <div class="roof"></div><div class="crescent"></div><div class="loop"></div><div class="lid"><span></span><span></span><span></span></div>
        <div class="body">
          <img class="trim-top" alt="">
          <span class="label"></span>
          <div class="bezel"><div class="screen" role="button" tabindex="0" aria-label="Show status">
            <img class="bg" alt="">
            <img class="awaysign" alt=""><div class="awaylabel"></div>
            <img class="poop p0" alt=""><img class="poop p1" alt=""><img class="poop p2" alt="">
            <img class="perch" alt="">
            <img class="pet" alt="">
            <img class="prop" alt="">
            <img class="murk" alt="">
            <div class="rain"></div>
            <div class="flash"></div>
            <div class="breeze"><span></span><span></span><span></span></div>
            <img class="attention" alt="">
            <div class="bubble"></div>
            <div class="game" hidden>
              <button class="gl" aria-label="Guess left">${icon("prev", 22)}</button>
              <span class="gscore" aria-live="polite"></span>
              <button class="gr" aria-label="Guess right">${icon("next", 22)}</button>
              <button class="gx" aria-label="Stop the game">✕</button>
            </div>
            <div class="status"></div>
          </div><button class="request"></button></div>
          <div class="buttons"></div>
          <img class="trim-corner left" alt=""><img class="trim-corner right" alt="">
        </div>
        <div class="feet"><span></span><span></span></div>
      </div>`;
    const q = (sel) => slide.querySelector(sel);
    const s = {
      el: slide, device: q(".device"), label: q(".label"), screen: q(".screen"), bg: q(".bg"),
      awaysign: q(".awaysign"), awaylabel: q(".awaylabel"), pet: q(".pet"), prop: q(".prop"),
      perch: q(".perch"),
      attention: q(".attention"), bubble: q(".bubble"), status: q(".status"),
      poops: [...slide.querySelectorAll(".poop")], murk: q(".murk"), buttons: {}, frame: 0,
      request: q(".request"), gameBox: q(".game"), gameScore: q(".gscore"),
    };
    slide.querySelectorAll("img").forEach((img) => img.addEventListener("error", () => {
      const src = img.getAttribute("src");
      if (src && !WARNED.has(src)) {
        WARNED.add(src);
        console.warn("hatch-pet-card: missing sprite", src);
      }
    }));
    // The perch moves where the pet moves (wandering, the game) and grows with it.
    const PERCH_MOVES = ["wander-l", "wander-r", "go-left", "go-right"];
    new MutationObserver(() => {
      for (const c of PERCH_MOVES) s.perch.classList.toggle(c, s.pet.classList.contains(c));
      s.perch.style.scale = s.pet.style.scale;
    }).observe(s.pet, { attributes: true, attributeFilter: ["class", "style"] });
    // Taps on the game mustn't reach the screen behind (which opens the status).
    s.gameBox.addEventListener("click", (e) => e.stopPropagation());
    q(".gl").addEventListener("click", () => this._guess(s, "left"));
    q(".gr").addEventListener("click", () => this._guess(s, "right"));
    q(".gx").addEventListener("click", () => this._endGame(s, "maybe later!"));
    s.request.addEventListener("click", () => {
      const key = s.request.dataset.key;
      if (!key) return;
      if (key === "lay_egg" && !(Date.now() < s.confirmUntil)) {
        s.confirmUntil = Date.now() + CONFIRM_MS;
        s.request.textContent = "sure? tap again";
        setTimeout(() => { this._sig = null; this._update(); }, CONFIRM_MS + 50);
        return;
      }
      s.confirmUntil = 0;
      this._press(s, key);
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
      b.addEventListener("click", () =>
        action.key === "play" ? this._startGame(s, b) : this._press(s, action.key));
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
      const configured = [].concat(
        this._config.entities || [], this._config.entity || [], this._config.devices || []).length;
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
      // An egg is always drawn as its world's egg (the first species on the roster).
      const speciesId = (stage?.state === "egg" && roster[0]) || stage?.attributes.species || roster[0];
      if (speciesId && speciesId !== s.speciesId) {
        s.speciesId = speciesId;
        s.species = null;
        loadJson(`sprites/${speciesId}/species.json`).then((data) => {
          if (s.speciesId !== speciesId) return; // the slide moved on while this loaded
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
    // The world is on the device's plate and the emblem, so the line stays short.
    this._card.querySelector(".sub").textContent = [kind,
      stage?.state !== "egg" ? STAGE_LABELS[stage?.state]?.toLowerCase() : null,
      days != null ? `day ${Math.floor(days) + 1}` : null].filter(Boolean).join(" · ");

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
    const shape = ["tank", "house", "porthole", "pad", "moon"].includes(shell.shape) ? shell.shape : "egg";
    dev.className = `device ${shape}`;
    dev.querySelector(".roof").style.display = shape === "house" ? "" : "none";
    dev.querySelector(".crescent").style.display = shape === "moon" ? "" : "none";
    dev.querySelector(".loop").style.display = shape === "egg" ? "" : "none";
    dev.querySelector(".lid").style.display = shape === "tank" ? "" : "none";
    dev.querySelector(".feet").style.display = shape === "tank" ? "" : "none";
    dev.style.setProperty("--d-shell", color);
    dev.style.setProperty("--d-dark", shade(color, 0.72));
    dev.style.setProperty("--d-ink", shade(color, 0.28));
    dev.style.setProperty("--d-btn-shadow", shade(color, 0.6));
    dev.style.setProperty("--d-bezel", shell.bezel || "#f3ead7");
    s.label.textContent = world.label || world.name;
    // Optional pixel-art trim from Sol (worlds.json "trim"), like stickers on the toy.
    const trim = world.trim || {};
    const uiSrc = (name) => `${BASE}/ui/${name}.png?v=${VERSION}`;
    dev.querySelector(".trim-top").style.display = trim.top ? "" : "none";
    if (trim.top) dev.querySelector(".trim-top").src = uiSrc(trim.top);
    dev.querySelectorAll(".trim-corner").forEach((img) => {
      img.style.display = trim.corner ? "" : "none";
      if (trim.corner) img.src = uiSrc(trim.corner);
    });
    s.label.classList.toggle("plate", !!trim.plate);
    s.label.style.backgroundImage = trim.plate ? `url(${uiSrc(trim.plate)})` : "";

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

    this._show(s, s.perch, away ? null : sp.perch);
    if (away) {
      s.frames = [];
      this._show(s, s.pet, null);
      this._show(s, s.awaysign, sp.props?.away);
      s.awaylabel.textContent = "At the sitter's";
    } else {
      this._show(s, s.awaysign, null);
      s.awaylabel.textContent = "";
      s.frames = this._petFrames(sp, stage, mood?.state, calling, this._eggMinutes(stageState), flags);
      const frames = this._frames(s);
      this._show(s, s.pet, frames[s.frame % frames.length]);
    }
    // Excitement lasts a while (rates.py EXCITED_MINUTES), but the bounce only
    // celebrates its start; after that, idle life adds an occasional hop.
    const excited = mood?.state === "excited";
    if (excited && !s.excitedSince) s.excitedSince = Date.now();
    if (!excited) s.excitedSince = 0;
    s.pet.classList.toggle("hop", excited && Date.now() - s.excitedSince < BOUNCE_MS);
    s.pet.alt = s.species?.name || "pet";
    // Some stages are drawn smaller in the frame (long adults fit 256 px wide by
    // coming out shorter); species.json "scale" sizes them back up, feet fixed.
    const drawn = sp.stages?.includes(stage) ? stage : sp.stage_fallback?.[stage];
    s.drawn = drawn;
    s.pet.style.scale = String(sp.scale?.[drawn] || 1);
    // Baby, teen and adult have no house poses: a hop dances, a shake shivers.
    const standIn = drawn !== "child" && !away && !asleep && POSE_MOODS.has(mood?.state);
    s.pet.classList.toggle("dance", standIn && flags.includes("dancing"));
    s.pet.classList.toggle("shiver", standIn && (flags.includes("chilly") || flags.includes("storm")));
    s.screen.classList.toggle("stormy", flags.includes("storm") && !away);
    s.screen.classList.toggle("windy", flags.includes("windy") && !away);
    s.moodState = mood?.state;
    s.calling = calling;
    const rainScene = scene === "rain" && !!sp.backgrounds?.rain;
    s.screen.classList.toggle("raining", flags.includes("rainy") && !rainScene && !away);
    s.screen.classList.toggle("watery", world.mess === "murk");

    const poop = away ? 0 : Number(this._state(s, "sensor.poop")?.state || 0);
    // Water worlds cloud over instead of showing poop (worlds.json "mess": "murk").
    const murky = world.mess === "murk" && !!sp.murk;
    s.poops.forEach((img, i) => this._show(s, img, !murky && i < poop ? sp.props?.poop?.[i] : null));
    this._show(s, s.murk, murky ? sp.murk : null);
    s.murk.style.opacity = murky ? [0, 0.45, 0.75, 1][Math.min(poop, 3)] : 0;
    this._show(s, s.attention, calling && !away ? sp.props?.attention : null);
    if (!s.propUntil || Date.now() > s.propUntil) this._show(s, s.prop, null);

    const log = this._state(s, "sensor.last_care")?.attributes.log || [];
    const latestAt = log[0]?.at ?? null;
    if (s.lastLogAt === undefined) s.lastLogAt = latestAt; // don't react to old care
    if (latestAt !== s.lastLogAt) {
      if (Date.now() - new Date(latestAt) < 15000) this._react(s, log[0]);
      s.lastLogAt = latestAt;
    }
    const moments = this._state(s, "sensor.last_care")?.attributes.moments || [];
    const momentKey = (m) => m && `${m.at}|${m.type}`;
    if (s.lastMoment === undefined) s.lastMoment = momentKey(moments[0]) ?? null; // not old ones
    if (moments.length && momentKey(moments[0]) !== s.lastMoment) {
      const fresh = [];
      for (const m of moments) {
        if (momentKey(m) === s.lastMoment) break;
        fresh.push(m);
      }
      s.lastMoment = momentKey(moments[0]);
      fresh.reverse().filter((m) => Date.now() - new Date(m.at) < 15000)
        .forEach((m) => this._moment(s, m));
    }
    const egg = stage === "egg";
    if (s.game && (asleep || away || egg)) this._endGame(s, null);
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
      const confirming = wanted === "lay_egg" && Date.now() < s.confirmUntil;
      s.request.textContent = confirming ? "sure? tap again" : REQUEST_LABELS[wanted] || `${wanted}?`;
      s.request.setAttribute("aria-label", REQUEST_ARIA[wanted] || `Give the pet a ${wanted}`);
    }

    const lights = s.buttons.lights;
    const lightsEnt = this._state(s, "switch.lights_out");
    lights.disabled = !lightsEnt || lightsEnt.state === "unavailable" || away;
    // Asleep counts even when it dozed off by itself (the switch stays off then).
    const sleeping = lightsOut || asleep;
    lights.classList.toggle("on", sleeping);
    lights.classList.toggle("wanted", !sleeping && flags.includes("sleepy") && calling);
    const lightsIcon = sleeping ? "icon_lights_on" : "icon_lights_out";
    if (lights.dataset.icon !== lightsIcon) {
      lights.querySelector(".cap").innerHTML = pixelIcon(lightsIcon);
      lights.dataset.icon = lightsIcon;
    }
    lights.querySelector(".lbl").textContent = sleeping ? "wake" : "sleep";
    lights.title = sleeping ? "Lights on: wake the pet" : "Lights out: put the pet to bed";

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
    s.journal = false;
    if (open) this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
    if (s === this._slides[this._index]) {
      this._card.querySelector(".statusbtn").setAttribute("aria-pressed", open ? "true" : "false");
    }
  }

  // Minutes until the egg hatches, or null.
  _eggMinutes(stageState) {
    const at = stageState?.state === "egg" ? stageState.attributes.hatches_at : null;
    return at ? (new Date(at) - Date.now()) / 60000 : null;
  }

  _petFrames(sp, stage, mood, calling, eggMinutes, flags = []) {
    if (stage === "egg") {
      if (!sp.egg) return [];
      // HA ticks every 5 minutes, so each phase spans at least one tick.
      if (eggMinutes != null && eggMinutes <= 6) return sp.egg.crack || sp.egg.idle;
      if (eggMinutes != null && eggMinutes <= 15) return sp.egg.wiggle || sp.egg.idle;
      return sp.egg.idle;
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
      if (s.poseUntil && Date.now() > s.poseUntil) s.poseUntil = 0;
      if (s.excitedSince && Date.now() - s.excitedSince >= BOUNCE_MS) s.pet.classList.remove("hop");
      const frames = this._frames(s);
      if (frames.length && !(s.asleep && this._ticks % 2)) {
        s.frame = (s.frame + 1) % frames.length;
        this._show(s, s.pet, frames[s.frame]);
      }
      if (s.propUntil && Date.now() > s.propUntil) {
        this._show(s, s.prop, null);
        s.propUntil = 0;
      }
      if (s.sayUntil && Date.now() > s.sayUntil) s.sayUntil = 0;
      if (s === this._slides[this._index]) {
        this._greet(s);
        this._idle(s);
      }
      if (!s.sayUntil && s.species) {
        const mood = this._state(s, "sensor.mood");
        s.bubble.textContent = this._say(s, mood, mood?.state === "away");
      }
    }
  }

  // Nothing else is going on: is the pet free for a small idle behaviour?
  _free(s) {
    const now = Date.now();
    return s.species && !s.asleep && !s.calling && !s.game && IDLE_MOODS.has(s.moodState) &&
      !s.screen.classList.contains("show-status") &&
      !(s.sayUntil > now) && !(s.poseUntil > now) && !(s.propUntil > now);
  }

  _look(s, ms) {
    s.pet.classList.add("look");
    setTimeout(() => s.pet.classList.remove("look"), ms);
  }

  // Idle life: every so often, something small. Calm when motion is reduced.
  _idle(s) {
    const now = Date.now();
    if (!s.nextIdle) s.nextIdle = now + IDLE_MIN_MS / 2 + Math.random() * IDLE_SPREAD_MS;
    if (now < s.nextIdle) return;
    s.nextIdle = now + IDLE_MIN_MS + Math.random() * IDLE_SPREAD_MS;
    if (!this._free(s)) return;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const own = s.drawn === "child"
      ? Object.keys(s.species.extras || {}).filter((k) => !SHARED_POSES.has(k)) : [];
    const moves = ["mumble"];
    if (own.length) moves.push("pose", "pose");
    if (!calm) moves.push("look", "look", "wander", "perk", "speck");
    if (!calm && s.moodState === "excited") moves.push("hop", "hop");
    const move = pick(moves);
    if (move === "pose") {
      const frames = s.species.extras[pick(own)];
      s.poseFrames = Array.isArray(frames) ? frames : [frames];
      s.poseUntil = now + 2500;
      this._show(s, s.pet, s.poseFrames[0]);
    } else if (move === "look") {
      this._look(s, 1800);
    } else if (move === "wander") {
      const side = pick(["wander-l", "wander-r"]);
      s.pet.classList.add(side);
      setTimeout(() => s.pet.classList.remove(side), 2200);
    } else if (move === "perk") {
      this._animate(s, s.pet, "perk", 320);
    } else if (move === "hop") {
      this._animate(s, s.pet, "hop", 1400); // two happy bounces
    } else if (move === "speck") {
      const speck = document.createElement("span");
      const rtl = Math.random() < 0.5;
      speck.className = `speck${rtl ? " rtl" : ""}`;
      s.screen.append(speck);
      setTimeout(() => this._look(s, 1300), rtl ? 1200 : 0); // follows it across
      setTimeout(() => speck.remove(), 2700);
    } else {
      const lines = {
        sleepy: ["*yawn*", "mm... sleepy"],
        bored: ["hmm...", "*sigh*", "anyone wanna play?"],
        excited: ["hehe!", "wheee"],
        hungry: ["*tummy rumbles*", "is it snack time?"],
        dirty: ["ew...", "*sniff sniff*"],
      }[s.moodState] || ["♪ hm hm hm ♪", "...", "*looks around*", "la la la"];
      s.bubble.textContent = pick(lines);
      s.sayUntil = now + 2500;
    }
  }

  // Hello to whoever is looking, by first name, now and then (this browser only).
  _greet(s) {
    if (s.greeted || !this._free(s)) return;
    s.greeted = true;
    const user = this._hass.user;
    const first = user?.name?.trim().split(/\s+/)[0];
    if (!first) return;
    const key = `hatch-greet-${user.id}-${s.ids?.device}`;
    try {
      if (Date.now() - Number(localStorage.getItem(key) || 0) < GREET_EVERY_MS) return;
      localStorage.setItem(key, String(Date.now()));
    } catch (err) {
      // no storage (private window): greet anyway, once per page load
    }
    const hour = new Date().getHours();
    const hello = hour < 12 ? `morning, ${first}!` : hour < 18 ? `hi ${first}!` : `evening, ${first}!`;
    s.bubble.textContent = pick([hello, `${first}!! hi!`, hello]);
    s.sayUntil = Date.now() + 4000;
    this._animate(s, s.pet, "perk", 320);
  }

  // The frames to draw now: a reaction pose while one runs, else the mood's.
  _frames(s) {
    return s.poseUntil && Date.now() < s.poseUntil ? s.poseFrames : s.frames || [];
  }

  _animate(s, el, cls, ms) {
    el.classList.remove(cls);
    void el.offsetWidth; // restart the animation
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  _sparkle(s) {
    const ring = document.createElement("span");
    ring.className = "burst big";
    s.screen.append(ring);
    setTimeout(() => ring.remove(), 600);
  }

  // Something happened in HA (sensor.last_care "moments"): show it.
  _moment(s, m) {
    const say = (text, ms = 4500) => {
      s.bubble.textContent = text;
      s.sayUntil = Date.now() + ms;
    };
    switch (m.type) {
      case "care_miss":
        say("...nobody came", 6000);
        this._animate(s, s.pet, "sulk", 800);
        break;
      case "discipline_miss":
        say("...fine, I'll stop");
        break;
      case "call_answered":
        if (m.reason === "fake") { // only a fair scold answers a fake call
          say("ok... sorry");
          this._animate(s, s.pet, "sulk", 800);
        }
        break;
      case "hatched":
        say("hello!");
        this._animate(s, s.pet, "born", 500);
        this._sparkle(s);
        break;
      case "stage_changed":
        if (m.stage === "baby") break; // hatching says hello
        say(m.stage === "adult"
          ? `all grown up${m.upbringing ? `: ${m.upbringing}` : ""}!`
          : `I'm a ${m.stage} now!`);
        this._animate(s, s.pet, "stretch", 1100);
        this._sparkle(s);
        break;
      case "trait_learned":
      case "trait_deepened":
        say(`${m.type === "trait_learned" ? "new trait" : "deeper"}: ` +
          `${String(m.trait).replace("_", " ")} ${"★".repeat(m.level || 1)}`);
        this._sparkle(s);
        break;
      case "egg_laid":
        say("see you in the journal!");
        this._animate(s, s.pet, "born", 500);
        this._sparkle(s);
        break;
      case "woke_up":
        if (m.how === "morning") {
          say("*yaaawn*");
          this._animate(s, s.pet, "stretch", 1100);
        } else if (m.how === "night") {
          say("...so sleepy");
        }
        break;
      case "fell_asleep":
        if (m.how === "collapsed") {
          say("so... tired... zzz", 5000);
          this._animate(s, s.pet, "sulk", 800);
        } else if (m.how === "house" || m.how === "lights") {
          say(pick(["good night...", "night night...", "sleep tight..."]), 4000);
        }
        break;
      case "good_morning":
        say(pick(["good morning!", "morning!! you're up!", "hi! sleep well?"]));
        this._animate(s, s.pet, "stretch", 1100);
        break;
      case "sunset":
        say(pick(["ooh, the sunset...", "pretty sky tonight", "the sun's going down"]));
        this._look(s, 3000);
        break;
      case "sunrise":
        say(pick(["the sun's up!", "good morning, sun!"]));
        this._look(s, 2500);
        break;
      case "watching":
        say(pick([`ooh, ${m.title}!`, `is this ${m.title}?`, `${m.title}! I love this one`]));
        this._animate(s, s.pet, "perk", 320);
        break;
      case "listening":
        say(m.artist && Math.random() < 0.5
          ? `♪ is this ${m.artist}? ♪`
          : `♪ ${m.title} ♪`);
        break;
      case "tv_off_late":
        say(pick(["*yawn* bedtime?", "all done? sleepy now..."]));
        break;
      case "first_snow":
        say("the first snow!! ❄");
        this._sparkle(s);
        this._animate(s, s.pet, "stretch", 1100);
        break;
      case "first_frost":
        say("brr, frost outside!");
        this._animate(s, s.pet, "sulk", 800);
        break;
      case "pooped": {
        const img = s.poops[(m.count || 1) - 1];
        if (img) this._animate(s, img, "born", 450);
        break;
      }
    }
  }

  _react(s, entry) {
    if (entry.action === "chore_treat") {
      s.bubble.textContent = "a treat! someone did a chore ♪";
      s.sayUntil = Date.now() + 3500;
    }
    if (["ok", "won", "lost"].includes(entry.result)) {
      const key = PROP_FOR[entry.action] || entry.action;
      // The species' own reaction pose, drawn for the child only.
      const pose = s.species?.reactions?.[entry.result === "won" ? "won" : entry.action];
      const poseFrames = s.drawn === "child" && s.species?.extras?.[pose];
      if (poseFrames) {
        s.poseFrames = Array.isArray(poseFrames) ? poseFrames : [poseFrames];
        s.poseUntil = Date.now() + 2500;
        this._show(s, s.pet, s.poseFrames[0]);
      }
      if (entry.action === "fan" && !s.species?.props?.fan) {
        s.screen.classList.add("breezy");
        clearTimeout(s.breezeTimer);
        s.breezeTimer = setTimeout(() => s.screen.classList.remove("breezy"), 2600);
      }
      if (entry.action === "praise") {
        s.bubble.textContent = "♥";
        s.sayUntil = Date.now() + 2500;
      }
      const prop = s.species?.props?.[key] || FALLBACK_PROPS[key];
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
    if (s.journal) {
      this._renderJournal(s);
      return;
    }
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
    const stageAttrs = this._state(s, "sensor.life_stage")?.attributes || {};
    const traits = (stageAttrs.traits || []).map((t) => traitLabel(t, stageAttrs.trait_levels?.[t],
      t === stageAttrs.inherited_trait));
    const notifying = (this._state(s, "sensor.life_stage")?.attributes.notify_users || [])
      .includes(this._hass.user?.id);
    const ic = (n) => pixelIcon(n, 18);
    const bar = (v) => v === null ? "–" : `<div class="bar"><div style="width:${v}%"></div></div>`;
    const lines = log.slice(0, 3).map((e) =>
      `<div>${escape(e.action.replace("_", " "))}${e.by ? ` by ${escape(e.by)}` : ""} · ${timeAgo(e.at)}` +
      `${e.result && e.result !== "ok" ? ` (${escape(e.result.replace("_", " "))}${e.score ? ` ${escape(e.score)}` : ""})` : ""}</div>`);
    const row = (iconName, label, value) =>
      `<div class="row">${iconName ? ic(iconName) : "<span></span>"}<span>${label}</span>${value}</div>`;
    const adult = this._state(s, "sensor.life_stage")?.state === "adult";
    s.status.innerHTML = `
      ${row("icon_feed", "hunger", hearts(value("hunger")))}
      ${row("icon_play", "happy", hearts(value("happiness")))}
      ${row("stat_energy", "energy", bar(value("energy")))}
      ${row("stat_health", "health", bar(value("health")))}
      ${row("stat_discipline", "discipline", bar(value("discipline")))}
      ${row(null, "weight", `<span>${weightLabel(value("weight"))}</span>`)}
      ${row("stat_care_miss", "misses", `<span>${value("care_misses") ?? "–"}</span>`)}
      ${row(null, "whines", `<span>${this._state(s, "sensor.care_misses")?.attributes.discipline_misses ?? 0} ignored</span>`)}
      ${row(null, "traits", `<span>${traits.length ? traits.join(" · ") : "none yet"}</span>`)}
      ${stageAttrs.upbringing ? row(null, adult ? "raised" : "growing up", `<span>${escape(stageAttrs.upbringing)}</span>`) : ""}
      ${stageAttrs.next_world ? row(null, "next egg", `<span>in ${escape(stageAttrs.next_world)}</span>`) : ""}
      ${row(null, "notify me", `<span><button class="bell" aria-pressed="${notifying}">${notifying ? "on" : "off"}</button></span>`)}
      <div class="log">${lines.join("") || "<div>No care yet.</div>"}</div>
      <button class="jlink">journal ›</button>`;
    this._journalLink(s, true);
    s.status.querySelector(".bell").addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._setNotify(s, !notifying);
    });
  }

  // Phone notifications are per user: this only changes them for whoever is signed in.
  async _setNotify(s, enabled) {
    const id = s.ids?.["sensor.life_stage"];
    if (!id) return;
    try {
      await this._hass.callService("virtual_pet", "notify_me", { entity_id: id, enabled });
      s.bubble.textContent = enabled ? "I'll ping your phone!" : "ok, no more pings";
    } catch (err) {
      s.bubble.textContent = "hmm, that didn't work";
    }
    s.sayUntil = Date.now() + 3500;
  }

  _journalLink(s, open) {
    s.status.querySelector(".jlink").addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      s.journal = open;
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      s.status.scrollTop = 0; // a new view starts at its top
    });
  }

  // The world's creatures (unraised ones as silhouettes) and this device's past pets.
  async _renderJournal(s) {
    const stage = this._state(s, "sensor.life_stage")?.attributes || {};
    const roster = stage.roster || [];
    const raised = new Set();
    for (const other of this._slides) {
      const st = this._state(other, "sensor.life_stage")?.attributes;
      if (st?.world === stage.world) (st.raised || []).forEach((r) => raised.add(r));
    }
    const now = {
      generation: stage.generation || 1, name: this._hass.devices?.[s.ids?.device]?.name_by_user
        || this._hass.devices?.[s.ids?.device]?.name || "", species: stage.species,
      traits: stage.traits || [], levels: stage.trait_levels || {}, inherited: stage.inherited_trait,
      upbringing: this._state(s, "sensor.life_stage")?.state === "adult" ? stage.upbringing : null,
      current: true,
    };
    const past = [...(stage.journal || []), now].slice(-4);
    const ids = [...new Set([...roster, ...past.map((p) => p.species).filter(Boolean)])];
    const names = {};
    await Promise.all(ids.map((id) => loadJson(`sprites/${id}/species.json`)
      .then((d) => { names[id] = d.name; }).catch(() => { names[id] = id; })));
    if (!s.journal) return; // closed while the names loaded
    const tiles = roster.map((id) => {
      const known = raised.has(id);
      return `<div class="jtile${known ? "" : " locked"}">` +
        `<img src="${BASE}/sprites/${id}/child_content_1.png?v=${VERSION}" alt="">` +
        `<span>${known ? escape(names[id]).toLowerCase() : "???"}</span></div>`;
    });
    // The family line, oldest first: each generation and its traits.
    const lines = past.map((p) =>
      `<div class="gen${p.current ? " now" : ""}">gen ${p.generation}${p.current ? " (now)" : ""} · ` +
      `${escape(p.name)} · ${escape((names[p.species] || "egg").toLowerCase())}` +
      `${p.age_days != null ? ` · ${Math.round(p.age_days)} d` : ""}` +
      `${p.upbringing ? ` · ${escape(p.upbringing)}` : ""}` +
      `${p.traits?.length ? `<br><span class="gt">${p.traits.map((t) =>
        traitLabel(t, p.levels?.[t], t === p.inherited)).join(", ")}</span>` : ""}</div>`);
    s.status.innerHTML = `
      <div class="jhead"><span>journal · ${escape(this._worldName(s))}</span>
        <span>gen ${stage.generation || 1}</span></div>
      <div class="jgrid">${tiles.join("")}</div>
      <div class="jlist">${lines.join("")}${past.length < 2 ? "<div class=\"gt\">A week into adulthood, a pet can lay an egg.</div>" : ""}${this._memories(stage.memories)}</div>
      <button class="jlink">‹ status</button>`;
    s.status.scrollTop = 0;
    this._journalLink(s, false);
  }

  // Seasonal firsts and other moments the family remembers, newest first.
  _memories(memories) {
    if (!memories?.length) return "";
    const items = [...memories].reverse().slice(0, 6).map((m) => {
      const when = new Date(m.at * 1000).toLocaleDateString(undefined,
        { month: "short", day: "numeric", year: "numeric" });
      return `${escape(MEMORY_LABELS[m.kind] || m.kind.replace("_", " "))}, ${escape(when)}`;
    });
    return `<div class="gen"><span class="gt">memories: ${items.join(" · ")}</span></div>`;
  }

  _worldName(s) {
    return s.world?.name || "";
  }

  // --- Actions ----------------------------------------------------------------

  // Instant feedback on every tap: the button stays pressed long enough to
  // see, a ring bursts out, the phone ticks, and the pet perks up. The real
  // reaction (a prop, or a refusal in the bubble) follows when HA confirms.
  _tapped(button, s) {
    button.classList.add("pressed");
    setTimeout(() => button.classList.remove("pressed"), 160);
    const ring = document.createElement("span");
    ring.className = "burst";
    button.append(ring);
    setTimeout(() => ring.remove(), 500);
    if (navigator.vibrate) navigator.vibrate(12);
    if (s?.pet) {
      s.pet.classList.remove("perk");
      void s.pet.offsetWidth; // restart the animation
      s.pet.classList.add("perk");
      setTimeout(() => s.pet.classList.remove("perk"), 320); // let "hop" run again
    }
  }

  async _call(button, s, domain, service, entityId) {
    this._tapped(button, s);
    button.classList.add("pending");
    try {
      await this._hass.callService(domain, service, { entity_id: entityId });
    } catch (err) {
      button.classList.add("failed");
      setTimeout(() => button.classList.remove("failed"), 400);
      s.bubble.textContent = "hmm, that didn't work";
      s.sayUntil = Date.now() + 3500;
    } finally {
      button.classList.remove("pending");
    }
  }

  _press(s, action) {
    const id = s.ids?.[`button.${action}`];
    const button = action in s.buttons ? s.buttons[action] : s.request;
    if (id) this._call(button, s, "button", "press", id);
  }

  // --- The left/right game --------------------------------------------------
  // The server hides the pet and keeps score (virtual_pet.play_game); the card
  // only asks, and shows where the pet went.

  _startGame(s, button) {
    this._tapped(button, s);
    const energy = Number.parseFloat(this._state(s, "sensor.energy")?.state);
    const refusal = s.asleep ? REFUSALS.asleep : energy < 15 ? REFUSALS.too_tired : null;
    if (refusal) {
      s.bubble.textContent = refusal;
      s.sayUntil = Date.now() + 3500;
      return;
    }
    if (s.screen.classList.contains("show-status")) this._toggleStatus(s);
    s.game = { round: 0, wins: 0, busy: false };
    s.gameBox.hidden = false;
    s.gameScore.textContent = `round 1/5`;
    s.bubble.textContent = "left or right? guess where I'll go!";
    s.sayUntil = Date.now() + 60000;
    s.gameBox.querySelector(".gl").focus({ preventScroll: true });
  }

  async _guess(s, side) {
    const id = s.ids?.["sensor.mood"];
    if (!s.game || s.game.busy || !id) return;
    s.game.busy = true;
    s.gameBox.querySelectorAll(".gl, .gr").forEach((b) => { b.disabled = true; });
    let info;
    try {
      const res = await this._hass.callService(
        "virtual_pet", "play_game", { entity_id: id, guess: side }, undefined, false, true);
      info = res?.response;
    } catch (err) {
      this._endGame(s, "hmm, that didn't work");
      return;
    }
    if (!s.game) return; // stopped while waiting
    if (!info || info.result !== "ok") {
      this._endGame(s, REFUSALS[info?.result] || "not now");
      return;
    }
    s.game.round = info.round;
    s.game.wins = info.wins;
    s.pet.classList.add(`go-${info.went}`);
    s.bubble.textContent = info.correct ? "yes! you found me" : `nope, I went ${info.went}!`;
    s.gameScore.textContent = `round ${info.round}/${info.rounds} · ${info.wins} right`;
    if (navigator.vibrate && info.correct) navigator.vibrate([12, 40, 12]);
    setTimeout(() => {
      s.pet.classList.remove("go-left", "go-right");
      if (!s.game) return;
      if (info.done) {
        this._endGame(s, info.won ? `${info.wins}/${info.rounds}! you win ♪` :
          `${info.wins}/${info.rounds}... again sometime?`);
        return;
      }
      s.game.busy = false;
      s.gameBox.querySelectorAll(".gl, .gr").forEach((b) => { b.disabled = false; });
      s.gameScore.textContent = `round ${info.round + 1}/${info.rounds} · ${info.wins} right`;
      s.bubble.textContent = "again! left or right?";
    }, 900);
  }

  _endGame(s, line) {
    s.game = null;
    s.gameBox.hidden = true;
    s.gameBox.querySelectorAll(".gl, .gr").forEach((b) => { b.disabled = false; });
    s.pet.classList.remove("go-left", "go-right");
    if (line) s.bubble.textContent = line;
    s.sayUntil = line ? Date.now() + 4000 : 0;
  }

  _toggleLights(s) {
    const id = s.ids?.["switch.lights_out"];
    if (!id) return;
    // Turning the switch off wakes a pet that dozed off with the switch already off.
    const on = this._hass.states[id]?.state === "on" || s.asleep;
    this._call(s.buttons.lights, s, "switch", on ? "turn_off" : "turn_on", id);
  }
}

// The card editor: pick which pets the shelf shows (none picked shows all).
class HatchPetCardEditor extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  setConfig(config) {
    this._config = { ...(config || {}) };
    this._render();
  }

  // Older cards name one entity per pet; show those as their devices.
  _devicesOf(config) {
    if (config.devices) return config.devices;
    const ids = [].concat(config.entities || [], config.entity || []);
    const devices = ids.map((id) => this._hass?.entities?.[id]?.device_id).filter(Boolean);
    return [...new Set(devices)];
  }

  async _render() {
    if (!this._form) {
      // ha-form loads with the frontend's own card editors; make sure it's there.
      if (!customElements.get("ha-form")) {
        const helpers = await window.loadCardHelpers?.();
        const entities = await helpers?.createCardElement({ type: "entities", entities: [] });
        await entities?.constructor?.getConfigElement?.();
      }
      this._form = document.createElement("ha-form");
      this._form.computeLabel = () => "Pets on this shelf";
      this._form.computeHelper = () =>
        "Leave empty to show every pet. The shelf shows them in this order.";
      this._form.schema = [{
        name: "devices",
        selector: { device: { multiple: true, filter: { integration: "virtual_pet" } } },
      }];
      this._form.addEventListener("value-changed", (e) => this._changed(e.detail.value));
      this.append(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = { devices: this._devicesOf(this._config) };
  }

  _changed(value) {
    const config = { ...this._config };
    delete config.entities;
    delete config.entity;
    if (value.devices?.length) config.devices = value.devices;
    else delete config.devices;
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config }, bubbles: true, composed: true,
    }));
  }
}

// The integration loads this file on every dashboard. If an old manual
// resource also loads it, keep the first definition instead of erroring.
// Wait for <home-assistant> first: once the service worker caches this file
// it can run before the frontend swaps in its own custom element registry,
// and a card defined in the old one is never found ("Configuration error").
customElements.whenDefined("home-assistant").then(() => {
  if (!window.customElements.get("hatch-pet-card")) {
    window.customElements.define("hatch-pet-card", HatchPetCard);
  }
  if (!window.customElements.get("hatch-pet-card-editor")) {
    window.customElements.define("hatch-pet-card-editor", HatchPetCardEditor);
  }
});

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "hatch-pet-card")) window.customCards.push({
  type: "hatch-pet-card",
  name: "Hatch at Home pet shelf",
  description: "Your virtual pets, each in its world's handheld device.",
  preview: true,
});

console.info(`%c HATCH-PET-CARD %c ${VERSION} `,
  "background:#c8642a;color:#fff", "background:#333;color:#fff");
