// The card bench's page side: a fake `hass` for the real hatch-pet-card.js.
// scripts/bench.js calls window.bench.mount(shot) once per shot; nothing here
// talks to a server beyond static files. Looks only: no server logic.

(() => {
  const BASE = "/virtual_pet/frontend";
  let WORLDS = null; // the one object the card's cache holds; reset per shot

  // The card reads worlds.json through fetch and keeps the parsed object, so
  // serve it from here: a shot can then override one world's shell.
  const realFetch = window.fetch.bind(window);
  window.fetch = (url, ...rest) => {
    if (String(url).includes("/worlds.json") && WORLDS) {
      return Promise.resolve({ ok: true, json: async () => WORLDS });
    }
    return realFetch(url, ...rest);
  };

  const mulberry32 = (a) => () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const NAMES = ["Pip", "Mochi", "Bean", "Juniper", "Waffle", "Comet", "Nori", "Sprout"];

  function buildHass(shot, worlds) {
    const now = new Date(shot.time);
    const iso = (min) => new Date(now.getTime() + min * 60000).toISOString();
    const states = {};
    const entities = {};
    const devices = {};
    states["sun.sun"] = { state: shot.scene === "night" ? "below_horizon" : "above_horizon", attributes: {}, last_updated: iso(-60) };
    shot.pets.forEach((pet, i) => {
      const device = `bench_dev_${i}`;
      const base = `bench_${i}`;
      const world = worlds[pet.world] ? pet.world : Object.keys(worlds)[0];
      devices[device] = { id: device, name: pet.name || NAMES[i % NAMES.length], name_by_user: null };
      const put = (domain, key, state, attributes = {}) => {
        const id = `${domain}.${base}_${key}`;
        entities[id] = { entity_id: id, platform: "virtual_pet", translation_key: key, device_id: device };
        states[id] = { entity_id: id, state, attributes, last_updated: iso(-30 - i) };
      };
      const stage = pet.stage || "adult";
      const attrs = { world, roster: worlds[world].roster, species: pet.species, age_days: pet.age_days ?? 12 };
      if (stage === "egg") attrs.hatches_at = iso(pet.hatch_minutes ?? 600);
      put("sensor", "life_stage", stage, attrs);
      const mood = pet.mood || "content";
      // The mood's own need shows as a flag (the button it wants lights up).
      const flags = [...new Set([...(["hungry", "bored", "dirty", "sick", "sleepy"].includes(mood) ? [mood] : []), ...(pet.flags || [])])];
      if (shot.scene === "rain" && !flags.includes("rainy")) flags.push("rainy");
      put("sensor", "mood", mood, { flags });
      put("sensor", "last_care", iso(-45), { log: pet.log || [] });
      put("sensor", "energy", String(pet.energy ?? 80));
      put("sensor", "poop", String(pet.poop ?? (mood === "dirty" ? 2 : 0)));
      put("sensor", "care_misses", "0");
      put("binary_sensor", "calling", pet.calling || mood === "calling" ? "on" : "off");
      put("binary_sensor", "asleep", mood === "asleep" ? "on" : "off");
      for (const key of ["feed", "snack", "play", "clean", "medicine", "scold", "praise"]) put("button", key, "unknown");
      put("switch", "lights_out", shot.scene === "dim" ? "on" : "off");
    });
    const noop = () => Promise.resolve(() => {});
    return {
      states, entities, devices,
      user: { id: "bench-user", name: "Sam Bench", is_admin: true },
      locale: { language: "en" }, language: "en",
      themes: {}, selectedTheme: null,
      // The card asks once for a server clock reading; none arrives here.
      connection: { subscribeEvents: noop, subscribeMessage: noop },
      callService: async (domain, service) => ({ response: service === "visit" ? (shot.visit || { counted: true }) : {} }),
      callWS: async (msg) => (msg.type === "virtual_pet/photos" ? { photos: [] } : {}),
      callApi: async () => ({}),
    };
  }

  async function settled(card) {
    const deadline = Date.now() + 8000;
    for (;;) {
      const imgs = [...card.shadowRoot.querySelectorAll("img")].filter((i) => i.getAttribute("src"));
      const slides = card._slides || [];
      const busy = !slides.length || slides.some((s) => !s.species || !s.world) || imgs.some((i) => !i.complete);
      if (!busy) return;
      if (Date.now() > deadline) throw new Error("card never settled (sprites missing?)");
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  async function mount(shot) {
    await customElements.whenDefined("hatch-pet-card");
    const stage = document.getElementById("stage");
    stage.querySelector("hatch-pet-card")?.remove();
    stage.style.width = `${shot.width}px`;
    Math.random = mulberry32(shot.seed ?? 7);

    WORLDS = JSON.parse(await (await realFetch(`${BASE}/worlds.json`)).text());
    const world = WORLDS[shot.pets[0].world];
    if (world && shot.shell) {
      world.shell = { ...world.shell, ...shot.shell };
      if (shot.shell.finish === "none") delete world.shell.finish;
    }

    const card = document.createElement("hatch-pet-card");
    card.setConfig({ seasonal: shot.season === "auto" ? undefined : shot.season, ...(shot.config || {}) });
    card.hass = buildHass(shot, WORLDS);
    stage.append(card);
    await settled(card);
    await document.fonts.ready;

    // Freeze: no ticking timer, so no frame flips, wanders or idle chatter.
    clearInterval(card._timer);
    const slides = card._slides;
    slides.forEach((s) => { s.voicedAt = Date.now() + 1e9; s.nextIdle = Date.now() + 1e9; });
    card._tick();
    slides.forEach((s) => { s.frame = 0; const f = card._frames(s); if (f.length) card._show(s, s.pet, f[0]); });
    const cur = slides[card._index];
    if (shot.say !== undefined) card._write(cur, shot.say, 1e9);
    const root = card.shadowRoot;
    if (shot.view === "status") root.querySelector(".statusbtn").click();
    if (shot.view === "games") card._startGame(cur, cur.buttons.play); // the button itself can be disabled
    // Date is pinned, so a line would never finish typing: write each whole.
    slides.forEach((x) => card._stopTyping(x));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await settled(card);
    return true;
  }

  window.bench = { mount };
})();
