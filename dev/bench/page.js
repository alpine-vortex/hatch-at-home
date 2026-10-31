// The card bench's page side: a fake `hass` for the real hatch-pet-card.js.
// scripts/bench.js calls window.bench.mount(shot) once per shot; nothing here
// talks to a server beyond static files. Looks only: no server logic.

(() => {
  const BASE = "/virtual_pet/frontend";
  let WORLDS = null; // the one object the card's cache holds; reset per shot
  let HAVE = new Set(); // species with a species.json, as the server's catalog.roster keeps
  const rosterOf = (world) => world.roster.filter((sp) => HAVE.has(sp));

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
      const attrs = { world, roster: rosterOf(worlds[world]), species: pet.species, age_days: pet.age_days ?? 12 };
      if (stage === "egg") attrs.hatches_at = iso(pet.hatch_minutes ?? 600);
      if (shot.journal && i === 0) {
        // The journal's data: every creature of the world raised, the two pets before
        // this one, a trait or two and a memory. `journal: {..}` overrides any of it.
        const roster = rosterOf(worlds[world]);
        const past = (k) => ({ generation: k + 1, name: ["Pip", "Mochi"][k], species: roster[(k + 1) % roster.length],
          age_days: 31 + k * 9, upbringing: ["playful", "caring"][k], personality: ["bold", "gentle"][k], games: { catch: 3 + k },
          traits: ["sunny"], trait_levels: { sunny: 2 } });
        Object.assign(attrs, { raised: roster, generation: 3, traits: ["sunny", "cuddly"], trait_levels: { sunny: 1, cuddly: 3 },
          inherited_trait: "sunny", journal: [past(0), past(1)], memories: [{ kind: "first_frost", at: Math.floor(now.getTime() / 1000) - 5 * 86400 }],
          ...(typeof shot.journal === "object" ? shot.journal : {}) });
      }
      // The shell the server would send (the lead pet): its pick, the finishes it may
      // wear and the locked ones with their stage. Left out, the card hides the row.
      if (i === 0 && shot.shellOptions !== undefined) {
        Object.assign(attrs, { shell_finish: shot.shellFinish ?? null, shell_finish_options: shot.shellOptions,
          shell_locked: shot.shellLocked || {} });
      }
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

  // The infrared link greeting, caught as the visit screen opens (reduced motion:
  // no beam, so it opens at once). `link.waves` is put on both species as a fake
  // species.json "waves" key; leave it out for a species without any.
  async function linkGreeting(card, link) {
    const [host, guest] = card._slides;
    if (link.waves) for (const s of [host, guest]) s.species = { ...s.species, waves: link.waves };
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) => (String(q).includes("reduced-motion") ? { matches: true, addListener() {}, addEventListener() {} } : mm(q));
    card._linkStart(host, guest);
    window.matchMedia = mm;
    for (const t = Date.now() + 3000; !(host.linkFrames && card._link?.img?.getAttribute("src")) && Date.now() < t;) await new Promise((r) => setTimeout(r, 25));
    // Past the sprite check (150 ms), before the guest's first swap (700 ms), unless
    // `link.wait` waits for it: a wave that fails to load is dropped at that swap.
    await new Promise((r) => setTimeout(r, link.wait ?? 150));
    card._show(host, host.pet, host.linkFrames[0]);
    await settled(card);
    // The guest steps in and the host shifts over: bring both to rest.
    for (const a of card.shadowRoot.getAnimations()) if (a.effect.getComputedTiming().iterations !== Infinity) a.finish();
  }

  // The low-battery gag pinned mid-play: "battery" (one blinking bar, first line)
  // or "line" (full battery, second line). The timers stop, the blink holds still.
  function powerGag(card, cur, at) {
    card._powerGag(cur);
    cur.power.timers.forEach(clearTimeout);
    cur.screen.classList.remove("blank");
    cur.batt.classList.remove("blink");
    if (at === "line") {
      cur.batt.dataset.level = "3";
      cur.poseUntil = 0;
      card._write(cur, "all charged! hi! ♥", 1e9);
    } else card._write(cur, "w-whoa... did someone pull my battery?", 1e9);
  }

  // The infrared beam held mid-flight (400 ms of 1100: the head over the host's
  // shell, its trail behind it). Drawn by the card's own _linkBeam, no visit around it.
  function irBeam(card) {
    const [host, guest] = card._slides;
    card._link = { timers: [] };
    card._linkBeam(host, guest, true);
    const L = card._link;
    clearInterval(L.flap);
    L.timers.forEach(clearTimeout);
    for (const a of L.beam.getAnimations({ subtree: true })) { a.pause(); a.currentTime = 400; }
    card._link = null;
  }

  // Put on the costume `art` of `season` (frame 1 or 2 showing) and wait out the
  // pet's little perk, so the shot holds the hat still.
  async function dress(card, cur, { season, art, frame = 1 }) {
    const base = card.constructor.seasons.find((x) => x.key === season);
    const costume = base.costumes.find((c) => c.art === art);
    const frames = card._frames(cur);
    card._show(cur, cur.pet, frames[(frame - 1) % frames.length]);
    card._hatSeat(cur); // load every frame the scan reads
    await new Promise((r) => setTimeout(r, 300));
    card._costume(cur, { ...base, costumes: [costume] }, "boo!", false);
    await new Promise((r) => setTimeout(r, 450));
    const hat = cur.screen.querySelector(".costume .hat").getBoundingClientRect();
    const pet = cur.pet.getBoundingClientRect();
    window.bench.info = {
      frame0: card._frames(cur)[0], shown: frame, drawn: cur.drawn, seat: card._hatSeat(cur),
      brimTop: hat.top, petTop: pet.top, k: pet.height / 256, sink: costume.sink,
    };
  }

  async function mount(shot) {
    await customElements.whenDefined("hatch-pet-card");
    const stage = document.getElementById("stage");
    stage.querySelector("hatch-pet-card")?.remove();
    stage.style.width = `${shot.width}px`;
    Math.random = mulberry32(shot.seed ?? 7);

    // The card keeps the first worlds object it fetched, so refill that one in place.
    const fresh = JSON.parse(await (await realFetch(`${BASE}/worlds.json`)).text());
    if (WORLDS) {
      for (const k of Object.keys(WORLDS)) delete WORLDS[k];
      Object.assign(WORLDS, fresh);
    } else WORLDS = fresh;
    const every = [...new Set(Object.values(WORLDS).flatMap((w) => w.roster || []))];
    HAVE = new Set((await Promise.all(every.map(async (sp) =>
      (await realFetch(`${BASE}/sprites/${sp}/species.json`)).ok ? sp : null))).filter(Boolean));
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
    if (shot.link) await linkGreeting(card, shot.link);
    if (shot.power) powerGag(card, cur, shot.power);
    // The viewer's own view from the private channel (none arrives here): a bond,
    // so "you two" and "my day" show, and the switches behind the settings rows.
    if (shot.mine) {
      const mine = { bond: { level: 6, nickname: null }, notify_me: true, my_day: true, birthday_kept: true, birthday_phone: false };
      slides.forEach((s) => { s.mine = { ...mine, ...(typeof shot.mine === "object" ? shot.mine : {}) }; });
    }
    // A seasonal costume put on through the card's own _costume: {season, art, frame}.
    // The seat it used is kept in bench.info (bench.js writes it beside the shot).
    window.bench.info = null;
    if (shot.costume) await dress(card, cur, shot.costume);
    if (["status", "settings", "picker"].includes(shot.view)) root.querySelector(".statusbtn").click();
    if (shot.view === "settings" || shot.view === "picker") root.querySelector(".gear").click();
    if (shot.view === "picker") {
      root.querySelector(".shellrow").click();
      // `preview`: a tile tapped (its finish on the live shell, unsaved); "" is the world's own.
      if (shot.preview !== undefined) root.querySelector(`.tile[data-finish="${shot.preview}"]`).click();
    }
    // `scroll`: a selector in the status box brought into view (the picker's list scrolls).
    if (shot.scroll) {
      const box = cur.status;
      const el = box.querySelector(shot.scroll);
      const head = box.querySelector(".shead")?.offsetHeight || 0; // just below the sticky back row
      box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - head - 2;
    }
    if (shot.view === "journal") {
      root.querySelector(".statusbtn").click();
      root.querySelector(".jlink").click();
      // The journal loads the species names first: wait for its tiles.
      // (Date is pinned, so count the tries instead of reading the clock.)
      for (let n = 0; !root.querySelector(".jgrid") && n < 120; n++) await new Promise((r) => setTimeout(r, 25));
    }
    if (shot.view === "games") card._startGame(cur, cur.buttons.play); // the button itself can be disabled
    // `classes`: screen states the fake hass cannot pin (`lit`, `faded`...), put on last.
    for (const c of shot.classes || []) cur.screen.classList.add(c);
    if (shot.beam) irBeam(card);
    // Date is pinned, so a line would never finish typing: write each whole.
    slides.forEach((x) => card._stopTyping(x));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // The shelf and slides come to rest at once: a shot mid-slide is off the pixel grid.
    for (const a of root.getAnimations()) if (a instanceof CSSTransition) a.finish();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await settled(card);
    window.bench.screenClass = cur.screen.className;
    return true;
  }

  window.bench = { mount };
})();
