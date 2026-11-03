// The card bench's page side: a fake `hass` for the real hatch-pet-card.js.
// scripts/bench.js calls window.bench.mount(shot) once per shot; nothing here
// talks to a server beyond static files. Looks only: no server logic.

(() => {
  const BASE = "/virtual_pet/frontend";
  let WORLDS = null; // the one object the card's cache holds; reset per shot
  let HAVE = new Set(); // species with a species.json, as the server's catalog.roster keeps
  let SPECIES_NAME = {}; // id -> its species.json name, for the lay sheet's egg_roster
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
  // A dig shot's start with no `digReplies`: round 2, 2 banked, 2 in the basket.
  const DIG_REPLY = { result: "ok", game: "dig", round: 1, rounds: 5, wins: 2, basket: 2, leaves: 6, win_at: 5, done: false };

  // The virtual_pet/collection reply for the lead pet's world. `collection`: true, a
  // part-met page (two visitors; three plain finds and one with a `when`; gifts: one met,
  // one the house never found, the gift-only one); "empty"; or an object
  // {visitors, finds, gifts} given as is (`finds` a list of ids or an {id: day} map).
  function collectionOf(spec, worlds, world) {
    const w = worlds[world] || {};
    const day = "2026-10-30";
    if (spec && typeof spec === "object") {
      const finds = Array.isArray(spec.finds) ? Object.fromEntries(spec.finds.map((id) => [id, day])) : (spec.finds || {});
      return { world, visitors: [...(spec.visitors || [])], finds, gifts: [...(spec.gifts || [])] };
    }
    if (spec === "empty") return { world, visitors: [], finds: {}, gifts: [] };
    const fs = w.finds || [];
    const plain = fs.filter((f) => !f.gift_only && !f.when?.length);
    const timed = fs.filter((f) => !f.gift_only && f.when?.length);
    const gift = fs.find((f) => f.gift_only);
    const v = w.visitors || [];
    return {
      world,
      visitors: [v[0], v[2]].filter(Boolean).map((x) => x.id),
      finds: Object.fromEntries([plain[0], plain[1], plain[2], timed[0]].filter(Boolean).map((f) => [f.id, day])),
      gifts: [plain[0], plain[4], gift].filter(Boolean).map((f) => f.id),
    };
  }

  function buildHass(shot, worlds) {
    const now = new Date(shot.time);
    const base0World = worlds[shot.pets[0]?.world] ? shot.pets[0].world : Object.keys(worlds)[0];
    const iso = (min) => new Date(now.getTime() + min * 60000).toISOString();
    const states = {};
    const entities = {};
    const devices = {};
    states["sun.sun"] = { state: shot.scene === "night" ? "below_horizon" : "above_horizon", attributes: {}, last_updated: iso(-60) };
    (shot.empty ? [] : shot.pets).forEach((pet, i) => { // `empty`: no pets at all (first run)
      const device = `bench_dev_${i}`;
      const base = `bench_${i}`;
      const world = worlds[pet.world] ? pet.world : Object.keys(worlds)[0];
      devices[device] = { id: device, name: pet.name || NAMES[i % NAMES.length], name_by_user: null, config_entries: [`bench_entry_${i}`] };
      const put = (domain, key, state, attributes = {}) => {
        const id = `${domain}.${base}_${key}`;
        entities[id] = { entity_id: id, platform: "virtual_pet", translation_key: key, device_id: device };
        states[id] = { entity_id: id, state, attributes, last_updated: iso(-30 - i) };
      };
      const stage = pet.stage || "adult";
      const attrs = { world, roster: rosterOf(worlds[world]), species: pet.species, age_days: pet.age_days ?? 12 };
      if (stage === "egg") attrs.hatches_at = iso(pet.hatch_minutes ?? 600);
      if (pet.personality) attrs.personality = pet.personality; // a teen or adult's type (P2a/P2b)
      if (pet.hatched_on) attrs.hatched_on = pet.hatched_on;
      if (pet.upbringing) attrs.upbringing = pet.upbringing;
      // Today's wish and dream (`{kind, granted}`, `{kind}`) and traits, for a `look` shot.
      for (const key of ["wish", "dream", "traits", "trait_levels", "raised", "generation", "next_egg", "next_world"]) {
        if (pet[key]) attrs[key] = pet[key];
      }
      // The lay sheet (settings S2): `lay: true` (or `{next_world, outside}`) makes this pet ask to
      // lay: egg_roster for the egg's world, the next-egg select and the lay_egg request.
      // `raised` (ids, default the first three of the world's) sets the offer.
      if (attrs.raised === "world") attrs.raised = rosterOf(worlds[world]).slice(0, 3); // a few of its own world's
      if (pet.lay) {
        const lay = pet.lay === true ? {} : pet.lay;
        const eggWorld = worlds[lay.egg_world || world];
        attrs.egg_roster = rosterOf(eggWorld).map((id) => ({ id, name: SPECIES_NAME[id] || id }));
        if (!attrs.raised) attrs.raised = rosterOf(worlds[world]).slice(0, 3);
      }
      if (shot.journal && i === 0) {
        // The journal's data: every creature of the world raised, the two pets before
        // this one, a trait or two and a memory. `journal: {..}` overrides any of it.
        const roster = rosterOf(worlds[world]);
        const past = (k) => ({ generation: k + 1, name: ["Pip", "Mochi"][k], species: roster[(k + 1) % roster.length],
          age_days: 31 + k * 9, upbringing: ["playful", "caring"][k], personality: ["bold", "gentle"][k], games: { left_right: 3 + k },
          traits: ["sunny"], trait_levels: { sunny: 2 } });
        Object.assign(attrs, { raised: roster, generation: 3, traits: ["sunny", "cuddly"], trait_levels: { sunny: 1, cuddly: 3 },
          inherited_trait: "sunny", journal: [past(0), past(1)], memories: [{ kind: "first_frost", at: Math.floor(now.getTime() / 1000) - 5 * 86400 }],
          ...(typeof shot.journal === "object" ? shot.journal : {}) });
      }
      // The shell the server would send (the lead pet): its pick, the finishes it may
      // wear and the locked ones with their stage. Left out, the card hides the row.
      if (i === 0 && shot.senses !== undefined) attrs.senses = shot.senses; // top10 2b: the kinds the house shows it
      // S7: the pet's bedtime target (the options' defaults unless the shot says; `false`: an older server).
      if (i === 0 && shot.sleepTimes !== false) attrs.sleep_times = shot.sleepTimes || { bedtime: "23:00", wake: "07:00" };
      if (i === 0 && shot.social !== undefined) attrs.social_level = shot.social; // top10 §6: the social meter, 0-10
      if (i === 0 && shot.shellOptions !== undefined) {
        Object.assign(attrs, { shell_finish: shot.shellFinish ?? null, shell_finish_options: shot.shellOptions,
          shell_locked: shot.shellLocked || {} });
      }
      put("sensor", "life_stage", stage, attrs);
      const mood = pet.mood || "content";
      // The mood's own need shows as a flag (the button it wants lights up).
      const flags = [...new Set([...(["hungry", "bored", "dirty", "sick", "sleepy"].includes(mood) ? [mood] : []), ...(pet.flags || [])])];
      if (shot.scene === "rain" && !flags.includes("rainy")) flags.push("rainy");
      if (pet.resting && !flags.includes("resting")) flags.push("resting"); // R1: the mood's flag
      put("sensor", "mood", mood, { flags, ...(pet.lay ? { requests: ["lay_egg"] } : {}), ...(pet.reason ? { reason: pet.reason, reason_key: pet.reason_key } : {}) });
      // `moments`: [{type, ago (minutes), ...}], the public moments the away note reads.
      const moments = (pet.moments || []).map(({ ago = 30, ...m }) => ({ ...m, at: iso(-ago) }));
      put("sensor", "last_care", iso(-45), { log: pet.log || [], ...(pet.moments ? { moments } : {}) });
      put("sensor", "energy", String(pet.energy ?? 80));
      if (pet.weight !== undefined) put("sensor", "weight", String(pet.weight));
      if (pet.hunger !== undefined) put("sensor", "hunger", String(pet.hunger)); // a feed scene's prediction (care B1)
      put("sensor", "poop", String(pet.poop ?? (mood === "dirty" ? 2 : 0)));
      put("sensor", "care_misses", "0");
      put("binary_sensor", "calling", pet.calling || mood === "calling" ? "on" : "off");
      put("binary_sensor", "asleep", mood === "asleep" ? "on" : "off");
      for (const key of ["feed", "snack", "play", "clean", "medicine", "scold", "praise", ...(pet.lay ? ["lay_egg"] : [])]) put("button", key, "unknown");
      if (pet.lay) { // the select: "Surprise me" then the names, its state the pick
        const names = attrs.egg_roster.map((r) => r.name);
        put("select", "next_egg", attrs.next_egg || "Surprise me", { options: ["Surprise me", ...names] });
      }
      put("switch", "lights_out", shot.scene === "dim" ? "on" : "off");
      // R1: `pet.resting` (true/false) adds the resting switch; left out, an older server's none.
      if (pet.resting !== undefined) put("switch", "resting", pet.resting ? "on" : "off");
    });
    const noop = () => Promise.resolve(() => {});
    return {
      states, entities, devices,
      user: { id: "bench-user", name: "Sam Bench", is_admin: shot.admin !== false },
      locale: { language: "en", ...(shot.timeFormat ? { time_format: shot.timeFormat } : {}) }, language: "en",
      themes: shot.haDark === undefined ? {} : { darkMode: !!shot.haDark }, selectedTheme: null,
      // The card asks once for a server clock reading; none arrives here.
      connection: { subscribeEvents: noop, subscribeMessage: noop },
      // `digReplies`: play_game answers, in order, for a `game: "dig"` shot (the server's dig is random).
      callService: async (domain, service) => ({ response: service === "visit" ? (shot.visit || { counted: true })
        : service === "play_game" && shot.digReplies?.length ? shot.digReplies.shift() : {} }),
      callWS: async (msg) => {
        if (msg.type === "virtual_pet/photos") return { photos: [] };
        // The name sheet (settings S3): `rename` is an error code the server would answer with.
        if (msg.type === "virtual_pet/rename") {
          if (shot.rename) throw { code: shot.rename };
          return { name: msg.name };
        }
        // The finds page (visitors v2 §4): `collection` ({visitors, finds, gifts?}, see
        // collectionOf); its gifts only to an unshared screen, as the server sends them.
        if (msg.type === "virtual_pet/collection") {
          if (shot.collection === "error") throw { code: "unknown_command" };
          const page = collectionOf(shot.collection, worlds, base0World);
          if (msg.shared) delete page.gifts;
          return page;
        }
        // A gift's take (`gift` shot field) answers as the server would for its own person.
        if (msg.type === "virtual_pet/collect" && msg.gift === true && msg.shared === false) return { gift: shot.gift || null };
        return {};
      },
      callApi: async () => ({}),
    };
  }

  // The basket's reveal through the card's own _revealStart and _revealFind, timers
  // stopped: `{finds: [{id, world?, new?, from?}], at}` (or one find as the object), shown
  // up to the find at `at` (default the last), its line in the bubble and its pop and
  // sparkle paused just in. world defaults to the pet's. Under motion "reduce" the
  // find is still, as the card shows it.
  async function revealShot(card, s, rv) {
    const finds = (rv.finds || [rv]).map((f) => ({ world: s.worldKey, new: false, ...f }));
    for (const f of finds) if (!findOf(card._worlds, f.world, f.id)) throw new Error(`no find ${f.world}/${f.id}`);
    Object.assign(s, { sayUntil: 0, queue: [] }); // the greeting's line gives way
    const R = card._revealStart(s, finds);
    R.timers.forEach(clearTimeout);
    const last = Math.min(rv.at ?? finds.length - 1, finds.length - 1);
    for (let i = 0; i <= last; i++) card._revealFind(s, R, finds[i], calm());
    await settled(card);
    for (const el of R.el.querySelectorAll(".rf, .burst")) {
      for (const a of el.getAnimations()) {
        a.pause();
        a.currentTime = el.classList.contains("burst") ? 120 : 300;
      }
    }
  }

  // A gift waiting for the viewer (`gift: {id, world}`, visitors v2 §5) at the card's own
  // first look: mine.gift set, the look forced (its other lines dropped, so the gift's is
  // the one said), the take answered by the fake callWS, the line said and the pop paused
  // just in. An asleep, away or egg pet's first look doesn't run: nothing is taken or said.
  async function giftShot(card, s, gift) {
    s.mine = { bond: { level: 6, nickname: null }, ...(s.mine || {}), gift };
    Object.assign(s, { subscribed: true, lookedFirst: false, queue: [], sayUntil: 0 });
    card._firstLook(s);
    s.queue = (s.queue || []).filter((q) => q.type === "gift");
    for (let n = 0; s.gifting && n < 200; n++) await new Promise((r) => setTimeout(r, 5));
    card._sayQueued(s);
    if (s.giftPop) clearTimeout(s.giftPop.timer); // held for the shot
    window.bench.info = { lookedFirst: !!s.lookedFirst, said: s.sayEntry?.type === "gift" ? s.sayEntry.text : null,
      pop: s.giftPop ? s.giftPop.el.querySelector(".rf").dataset.find : null };
    await settled(card);
    for (const el of s.screen.querySelectorAll(".reveal.gift .rf")) {
      for (const a of el.getAnimations()) {
        a.pause();
        a.currentTime = 300;
      }
    }
  }

  // `look`: a look played over time by the card's own tick (the driver moves the pinned
  // clock and calls bench.step): {at: seconds in, resumed: a tab back after 3 h hidden
  // (fresh-moment 1), seenAgo: hours since this device last looked (the away note)}.
  // The first look, greeting, idle and flair run; the channel counts as heard.
  function lookStart(card, s, look) {
    for (const k of Object.keys(localStorage)) if (/^hatch-greet-/.test(k)) localStorage.removeItem(k);
    window.bench.info = { said: [], moves: [], t0: Date.now() };
    if (look.seenAgo !== undefined) {
      localStorage.setItem(`hatch-seen-${s.ids.device}`, JSON.stringify({ seen: Date.now() - look.seenAgo * 3600e3, said: Date.now() }));
    }
    Object.assign(s, { subscribed: true, queue: [], sayUntil: 0, nextIdle: 0, nextFlair: 0, voicedAt: 0, visitedAt: Date.now() });
    if (look.resumed) {
      Object.assign(s, { lookedFirst: true, greeted: true }); // this page looked before it was hidden
      card._hiddenAt = Date.now() - 3 * 3600e3 - 1000;
      card._onHidden(); // visible again
      card.hass = { ...card._hass, states: { ...card._hass.states } }; // fresh states
    } else {
      Object.assign(s, { lookedFirst: false, greeted: false });
    }
  }

  // One step of a `look`: a tick, each line written whole (typing needs a running clock).
  function step() {
    const card = document.querySelector("hatch-pet-card");
    card._tick();
    card._slides.forEach((x) => card._stopTyping(x));
    // What the bubble said and the moves made, in order (written beside the shot).
    const s = card._slides[card._index];
    const info = window.bench.info ||= { said: [], moves: [] };
    const text = s.bubble.textContent;
    if (text && s.sayUntil > Date.now() && info.said.at(-1) !== text) info.said.push(text);
    const move = s.screen.querySelector(".flair") ? "flair" : s.poseUntil > Date.now() ? "pose" : s.movingUntil > Date.now() ? "move" : null;
    if (move && info.moves.at(-1)?.[0] !== move) info.moves.push([move, Date.now()]);
    if (move === "flair" && !info.flairAt) info.flairAt = Date.now();
  }

  // The end of a `look`: a flair's CSS runs on the real clock, so it is seeked to the
  // pinned clock's time since it began, and held.
  function lookEnd() {
    const card = document.querySelector("hatch-pet-card");
    const s = card._slides[card._index];
    const info = window.bench.info || {};
    for (const el of s.screen.querySelectorAll(".flair, .flair *")) {
      for (const a of el.getAnimations()) {
        a.pause();
        a.currentTime = Date.now() - (info.flairAt || Date.now());
      }
    }
  }

  // Care B2 (the snack catch sheet): the snack's centre and the pet's opaque box on screen, for the pass rule.
  async function snackBox(cur, sc) {
    const img = cur.pet;
    await img.decode().catch(() => {}); // the beat's frame may have just been set
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    const r = img.getBoundingClientRect();
    const flipped = img.classList.contains("look");
    const sx = r.width / c.width;
    const sy = r.height / c.height;
    const left = flipped ? r.left + (c.width - 1 - x1) * sx : r.left + x0 * sx;
    const right = flipped ? r.left + (c.width - x0) * sx : r.left + (x1 + 1) * sx;
    const s = sc.snack.getBoundingClientRect();
    return { cx: s.left + s.width / 2, cy: s.top + s.height / 2, box: [left, r.top + y0 * sy, right, r.top + (y1 + 1) * sy], head: cur.species?.head?.[cur.drawn] || null };
  }

  // A care scene seeked on the bench's own clock, so a shot is the same every run (plan
  // care-reactions 4.1). The card's rAF loop is stopped (it would end the scene on real time),
  // and the scene is played from 0 to `careAt` in 10 ms steps with the page's timers on a
  // virtual clock: a beat's setTimeout (a class taken off, a prop's leave) runs at its scene
  // time or not at all, and a CSS animation a beat starts is paused at `careAt` minus the
  // step it began on. Timers still pending at `careAt` are dropped.
  // The scene's own prop is decoded first: the card measures it at the tap, and an image
  // still loading has no width (a first tap in a browser can differ; the bench must not).
  async function careSeek(card, cur, shot) {
    const at = shot.careAt ?? 1500;
    const own = {
      medicine: cur.species?.props?.medicine || "bird/medicine",
      feed: cur.species?.props?.feed || "bird/bowl_food",
      // B2: snack
      snack: cur.species?.props?.snack || "snack",
    }[shot.care];
    if (own) {
      const img = new Image();
      img.src = spriteSrc(cur.speciesId, own);
      await img.decode().catch(() => {});
      window.bench.warm = img; // kept, so it stays in the page's image cache
    }
    const before = new Set(cur.screen.getAnimations({ subtree: true }));
    const born = new Map();
    const realSet = window.setTimeout;
    const realClear = window.clearTimeout;
    const queue = [];
    let now = 0;
    let next = 1;
    const tag = () => {
      for (const a of cur.screen.getAnimations({ subtree: true })) if (!before.has(a) && !born.has(a)) born.set(a, now);
    };
    window.setTimeout = (fn, ms = 0, ...args) => {
      const id = `bench-${next++}`;
      queue.push({ id, due: now + Math.max(0, Number(ms) || 0), fn: () => fn(...args) });
      return id;
    };
    window.clearTimeout = (id) => {
      const i = queue.findIndex((q) => q.id === id);
      if (i >= 0) queue.splice(i, 1);
      else realClear(id);
    };
    const runDue = (t) => {
      for (;;) {
        queue.sort((a, b) => a.due - b.due);
        if (!queue.length || queue[0].due > t) return;
        const q = queue.shift();
        now = q.due;
        q.fn();
        tag();
      }
    };
    try {
      card._sceneStart(cur, shot.care);
      const sc = cur.scene;
      if (sc) {
        cancelAnimationFrame(sc.raf);
        sc.paused = true;
        tag();
        // `answer`: {at, result} answers it at that scene ms, through the card's own _sceneAnswer
        // (with none, a scene with a gate holds there, then gives up 2 s on: plan 4.3).
        // A list of them is each in turn (an ok, then a full: the push-away after the gate).
        const answers = [].concat(shot.answer || []);
        let spent = 0;
        let renderMs = 0;
        let renders = 0;
        for (let t = 0; cur.scene === sc; t = Math.min(at, t + 10)) {
          runDue(t);
          now = t;
          while (spent < answers.length && t >= answers[spent].at) {
            card._sceneAnswer(cur, answers[spent].result || "ok", answers[spent].at);
            spent++;
            tag();
          }
          if (cur.scene !== sc) break;
          const r0 = performance.now();
          card._sceneRender(cur, t);
          renderMs += performance.now() - r0;
          renders++;
          tag();
          if (t >= at) break;
          if (card._sceneOver(cur, t)) { // over before careAt: the shot is what the card shows after it
            card._sceneEnd(cur);
            tag();
            break;
          }
        }
        // What one frame of the scene costs here (plan 8: the first mate reads it once).
        window.bench.info = { renderMs: renders ? renderMs / renders : 0, els: sc.els.length };
        // `snackCatch` (care B2): where the snack's centre is and the pet's opaque box is, in screen px, at
        // this beat: the catch point's pass rule (bench.js snackCatchPass) is the first inside the second.
        if (shot.snackCatch && sc.snack && cur.scene === sc) window.bench.info.snack = await snackBox(cur, sc);
      }
    } finally {
      window.setTimeout = realSet;
      window.clearTimeout = realClear;
    }
    for (const [a, t] of born) {
      if (a instanceof CSSTransition) continue;
      a.pause();
      a.currentTime = Math.max(0, at - t);
    }
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

  // A world visitor (the card's visitorList) through the card's own _visitorStart and _visitorGreet,
  // its timers stopped and its moves paused, so a beat is the same every run:
  // {id, beat: "arrive"|"greet"|"leave", frame: 1|2, side: "left"|"right"}. The id is
  // looked up in the pet's world (default: its first visitor). Under motion "reduce"
  // the card shows the still visit (one frame, at its edge) on its own.
  async function visitorShot(card, s, vis, petAt) {
    // `guest: "<world>"` (fresh-expand E10 V-c): a visitor from that world, its home
    // world's guest line. `pair: true` (V-b): the day is a pair day, so a friend of its
    // world comes in behind from the other side.
    const home = vis.guest ? card._worlds?.[vis.guest] : s.world;
    if (vis.guest && !home) throw new Error(`no world ${vis.guest}`);
    const list = visitorList(home);
    const v = list.find((x) => x.id === vis.id) || list[0];
    if (!v) throw new Error(`no visitor ${vis.id} in ${vis.guest || s.worldKey}`);
    // `friend` (fresh-expand E3): seen here on enough days already, so the greet is a
    // friend line (the coin pinned to the friend side).
    if (vis.friend) {
      localStorage.setItem(card._visitFriendKey(s), JSON.stringify({ [v.id]: { n: 3, day: card._visitDay(s).toDateString() } }));
    }
    const rare = card._rareDay;
    if (vis.pair) card._rareDay = (sl, kind, odds) => kind === "pair" || rare.call(card, sl, kind, odds);
    let V;
    try {
      V = card._visitorStart(s, v, vis.guest
        ? { ltr: vis.side !== "right", world: vis.guest, guest: true }
        : { ltr: vis.side !== "right" });
    } finally {
      card._rareDay = rare;
    }
    if (vis.pair && !V.pair) throw new Error(`no pair for ${v.id} in ${s.worldKey}`);
    // The friend comes in on its own timer (PAIR_BEHIND_MS; before the greet's).
    if (vis.pair) for (let i = 0; i < 80 && V.els.length < 2; i++) await new Promise((r) => setTimeout(r, 25));
    V.timers.forEach(clearTimeout);
    const beat = vis.beat || "greet";
    if (beat === "leave") V.el.classList.replace("in", "out");
    const random = Math.random;
    if (vis.friend) Math.random = () => 0;
    try {
      if (beat === "greet") card._visitorGreet(s, v);
    } finally {
      Math.random = random;
    }
    await settled(card);
    const inMs = parseFloat(V.el.style.getPropertyValue("--in-ms")) || 1400;
    for (const el of V.els) {
      for (const a of el.getAnimations()) {
        a.pause();
        a.currentTime = beat === "greet" ? (v.cross ? V.greetAt : inMs) : inMs / 2;
      }
    }
    for (const img of V.els.flatMap((el) => [...el.querySelectorAll("img")])) {
      for (const a of img.getAnimations()) {
        a.pause();
        a.currentTime = vis.frame === 2 ? 250 : 0; // the flap: .5s, frame b from 250 ms
      }
    }
    if (petAt === undefined) for (const a of s.pet.getAnimations()) { a.pause(); a.currentTime = 0; }
  }

  // The infrared link greeting, caught as the visit screen opens (reduced motion:
  // no beam, so it opens at once). `link.waves` is put on both species as a fake
  // species.json "waves" key; leave it out for a species without any.
  async function linkGreeting(card, link) {
    const [host, guest] = card._slides;
    if (link.waves) for (const s of [host, guest]) s.species = { ...s.species, waves: link.waves };
    const mm = window.matchMedia.bind(window);
    // `link.cheer`: the full visit (beam and all, ~2.5 s) so the cheer at "hi hi" plays; wait ~1900 past the screen.
    if (!link.cheer) window.matchMedia = (q) => (String(q).includes("reduced-motion") ? { matches: true, addListener() {}, addEventListener() {} } : mm(q));
    // `link.rolls`: what Math.random gives _linkStart first (all its rolls are made there),
    // in order: the host's normal pick, its type coin and pick, the guest's the same, then
    // the kindred odds and pick. E.g. [0, 0, 0, 0, 0, 0, 0, 0] is type lines and the extra.
    const seeded = Math.random;
    const rolls = [...(link.rolls || [])];
    Math.random = () => (rolls.length ? rolls.shift() : seeded());
    card._linkStart(host, guest);
    Math.random = seeded;
    window.matchMedia = mm;
    for (const t = Date.now() + 3000; !(host.linkFrames && card._link?.img?.getAttribute("src")) && Date.now() < t;) await new Promise((r) => setTimeout(r, 25));
    // Past the sprite check (150 ms), before the guest's first swap (700 ms), unless
    // `link.wait` waits for it: a wave that fails to load is dropped at that swap.
    await new Promise((r) => setTimeout(r, link.wait ?? 150));
    // `link.say`: "host" or "extra", the host's queued line on show (the tick is stopped,
    // so the bench says it through the card's own _sayQueued). The visit is held there.
    if (link.say) {
      card._link.timers.forEach(clearTimeout);
      for (let n = link.say === "extra" ? 2 : 1; n > 0; n--) {
        host.sayUntil = 0;
        card._sayQueued(host);
      }
      card._stopTyping?.(host, false);
    }
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

  // The season's visitor (SEASONS visitor: the turkey, the snow hare) put on through
  // the card's own _seasonFly and paused `at` (0-1 of its crossing, default .45),
  // frame 1 or 2, with its first greet in the bubble: {season, at, frame, side}.
  async function seasonVisitorShot(card, cur, sv) {
    const season = card.constructor.seasons.find((x) => x.key === sv.season);
    const { art, cls, ms, walk, greet } = season.visitor;
    const el = card._seasonFly(cur, season, art, cls, ms, { ltr: sv.side !== "right", walk: !!walk });
    await settled(card);
    for (const a of el.getAnimations()) {
      a.pause();
      a.currentTime = ms * (sv.at ?? 0.45);
    }
    for (const img of el.querySelectorAll("img")) {
      for (const a of img.getAnimations()) {
        a.pause();
        a.currentTime = sv.frame === 2 ? a.effect.getTiming().duration / 2 : 0;
      }
    }
    card._write(cur, greet[0], 1e9);
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
    card._costume(cur, { ...base, costumes: [costume] }, base.treatLine || base.lines?.[0] || "", false);
    await new Promise((r) => setTimeout(r, 450));
    const hat = cur.screen.querySelector(".costume .hat").getBoundingClientRect();
    const pet = cur.pet.getBoundingClientRect();
    window.bench.info = {
      frame0: card._frames(cur)[0], shown: frame, drawn: cur.drawn, seat: card._hatSeat(cur),
      brimTop: hat.top, petTop: pet.top, k: pet.height / 256, sink: costume.sink,
    };
  }

  let FINDS_DEFAULT;
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
    SPECIES_NAME = {};
    HAVE = new Set((await Promise.all(every.map(async (sp) => {
      const res = await realFetch(`${BASE}/sprites/${sp}/species.json`);
      if (res.ok) SPECIES_NAME[sp] = (await res.json()).name || sp;
      return res.ok ? sp : null;
    }))).filter(Boolean));
    const world = WORLDS[shot.pets[0].world];
    if (world && shot.shell) {
      world.shell = { ...world.shell, ...shot.shell };
      if (shot.shell.finish === "none") delete world.shell.finish;
    }

    // FINDS_SHOWN (the card's release switch): `findsShown: true` turns it
    // on for this shot; every other shot gets the card's own default back.
    const Card = customElements.get("hatch-pet-card");
    if (FINDS_DEFAULT === undefined) FINDS_DEFAULT = Card.findsShown;
    Card.findsShown = shot.findsShown === undefined ? FINDS_DEFAULT : !!shot.findsShown;

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
    // `acts`: a fake species.json "acts" put on every pet's species (`{eat: [stages], cheer: [...]}`).
    if (shot.acts) for (const s of slides) s.species = { ...s.species, acts: shot.acts };
    if (shot.look) lookStart(card, cur, shot.look);
    if (shot.ask) card._ask(cur, shot.ask);
    if (shot.say !== undefined) card._write(cur, shot.say, 1e9);
    // `fx`: a house effect class (fx-heat, fx-cool, fx-suds, fx-tumble, fx-chime) held on the screen, its
    // animation paused 1 s in (at full strength; reduced motion has none, so it just shows).
    if (shot.fx) {
      cur.screen.classList.add(shot.fx);
      for (const a of cur.screen.getAnimations({ subtree: true })) { a.pause(); a.currentTime = 1000; }
    }
    if (shot.ask && shot.say !== undefined) card._askPlace(cur, cur.screen.querySelector(".askday")); // the line is in the bubble now
    // `idle`: the pet's idle mumble through the card's own _idle, the first move (a mumble)
    // and the type's side of the coin forced (draws: next-idle delay, move, coin).
    if (shot.idle) {
      const real = Math.random;
      let n = 0;
      // `idle.draw`: the draw after the delay, for the sky reaction's line pick (0 the first line, .99 the second).
      Math.random = () => { const i = n++; return i === 1 && shot.idle.draw !== undefined ? shot.idle.draw : i < 2 ? 0 : 0.1; };
      Object.assign(cur, { moodState: shot.idle.mood || "content", nextIdle: 1, sayUntil: 0, poseUntil: 0, movingUntil: 0 });
      card._idle(cur);
      Math.random = real;
      cur.sayUntil = Date.now() + 1e9;
    }
    // `moment`: a public moment (`{type: "sunset"}`) put through the card's own _moment, so the line it says is shown.
    if (shot.moment) {
      Object.assign(cur, { sayUntil: 0, sayEntry: null, queue: [] });
      card._moment(cur, { at: new Date().toISOString(), ...shot.moment });
      card._stopTyping(cur);
      cur.sayUntil = Date.now() + 1e9;
    }
    const root = card.shadowRoot;
    if (shot.link) await linkGreeting(card, shot.link);
    if (shot.power) powerGag(card, cur, shot.power);
    // The viewer's own view from the private channel (none arrives here): a bond,
    // so "you two" and "my day" show, and the switches behind the settings rows.
    if (shot.mine) {
      const mine = { bond: { level: 6, nickname: null }, notify_me: true, my_day: true, birthday_kept: true, birthday_phone: false };
      // An array is one view per pet (the favourite's heart is one pet's, R2).
      const over = (i) => (Array.isArray(shot.mine) ? shot.mine[i] || {} : typeof shot.mine === "object" ? shot.mine : {});
      slides.forEach((s, i) => { s.mine = { ...mine, ...over(i) }; });
    }
    // The house view the channel would send (`house`, an object over it), and `basket`:
    // how many finds wait (house.basket, 0-3), so the basket shows through _basketSync.
    if (shot.house || shot.basket !== undefined) {
      slides.forEach((s) => {
        s.house = { ...(s.house || {}), ...(typeof shot.house === "object" ? shot.house : {}) };
        if (shot.basket !== undefined) s.house.basket = shot.basket;
        card._basketSync(s);
      });
    }
    // A seasonal costume put on through the card's own _costume: {season, art, frame}.
    // The seat it used is kept in bench.info (bench.js writes it beside the shot).
    window.bench.info = null;
    if (shot.costume) await dress(card, cur, shot.costume);
    if (["status", "settings", "picker"].includes(shot.view)) root.querySelector(".statusbtn").click();
    if (shot.view === "settings" || shot.view === "picker") root.querySelector(".gear").click();
    if (shot.view === "lay") cur.request.click(); // settings S2: the lay sheet opens
    // Settings S3: the name sheet, opened as a lay that hatched a new egg opens it. `nameText` is what
    // is typed in the field; `rename` an error code the fake server answers a tap on "name it" with.
    if (shot.view === "name") {
      card._openName(cur, "lay");
      const field = cur.status.querySelector(".nameinput");
      if (shot.nameText !== undefined) field.value = shot.nameText;
      if (shot.rename) {
        cur.nameSheetAt = 0;
        await card._nameSave(cur);
      }
    }
    if (shot.view === "picker") {
      root.querySelector(".shellrow").click();
      // `preview`: a tile tapped (its finish on the live shell, unsaved); "" is the world's own.
      if (shot.preview !== undefined) root.querySelector(`.tile[data-finish="${shot.preview}"]`).click();
    }
    // `note`: a line in the sheet's or picker's feedback bubble, as the card's own _statusMessage shows it.
    if (shot.note && ["settings", "picker"].includes(shot.view)) card._statusMessage(cur, shot.note);
    // `afterChange`: the sheet closed after that change (a SETTINGS_REACT key such as "monoOn"), through the
    // card's own _settingsChanged and Status chip: the pet perks and says its line (settings UX F14).
    if (shot.afterChange && shot.view === "settings") {
      card._settingsChanged(cur, shot.afterChange);
      root.querySelector(".statusbtn").click();
      await new Promise((r) => setTimeout(r, shot.afterWait ?? 1500));
    }
    // `scrollEnd` on the status box's own views: its end (the bigtext preset's status-end).
    if (shot.scrollEnd && ["status", "settings", "picker"].includes(shot.view)) cur.status.scrollTop = cur.status.scrollHeight;
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
      if (shot.scrollEnd) cur.status.scrollTop = cur.status.scrollHeight; // the memories line (H7's seasons preset)
    }
    // The journal's "every world ›" page (top10 8a); `journal: {raised: [..]}` sets what's drawn.
    if (shot.view === "everyworld") {
      root.querySelector(".statusbtn").click();
      root.querySelector(".jlink").click();
      for (let n = 0; !root.querySelector(".wlink") && n < 120; n++) await new Promise((r) => setTimeout(r, 25));
      root.querySelector(".wlink").click();
      for (let n = 0; !root.querySelector(".jgrid") && n < 120; n++) await new Promise((r) => setTimeout(r, 25));
      await Promise.all([...root.querySelectorAll(".jgrid img")].map((img) => img.decode().catch(() => {})));
      if (shot.scrollEnd) cur.status.scrollTop = cur.status.scrollHeight;
    }
    if (shot.view === "collection") {
      root.querySelector(".statusbtn").click();
      root.querySelector(".jlink").click();
      for (let n = 0; !root.querySelector(".flink") && n < 120; n++) await new Promise((r) => setTimeout(r, 25));
      root.querySelector(".flink").click();
      // The page reads virtual_pet/collection: wait for its tiles, then their art.
      for (let n = 0; !root.querySelector(".fgrid") && n < 120; n++) await new Promise((r) => setTimeout(r, 25));
      await Promise.all([...root.querySelectorAll(".fgrid img")].map((img) => img.decode().catch(() => {})));
      if (shot.scrollEnd) cur.status.scrollTop = cur.status.scrollHeight; // the foot's links
    }
    if (shot.view === "games") card._startGame(cur, cur.buttons.play); // the button itself can be disabled
    // `game: "dig"`: a Berry dig started through the card's own picker, then `digTaps`
    // ("dig" or "keep") played, each answered by the next of `digReplies` (scripted).
    // Held on the last reply, before its pause (a bee still shows).
    // `game: "left_right"` or `"higher_lower"` the same way (UX fix 6): `digReplies` answers the
    // start (default: round 0, number 5) and the guesses; `digTaps` are "left" / "right" (or
    // "lower" / "higher"). A held shot is taken at the last reply.
    if (shot.game === "dig" || shot.game === "left_right" || shot.game === "higher_lower") {
      const start = shot.game === "dig" ? DIG_REPLY
        : { result: "ok", game: shot.game, round: 0, rounds: 5, wins: 0, number: 5 };
      shot.digReplies = [...(shot.digReplies || [start])];
      card._startGame(cur, cur.buttons.play);
      await card._pickGame(cur, shot.game);
      for (const tap of shot.digTaps || []) {
        await card._guess(cur, tap === "keep" || tap === "left" || tap === "lower" ? "left" : "right");
      }
    }
    // `classes`: screen states the fake hass cannot pin (`lit`, `faded`...), put on last.
    for (const c of shot.classes || []) cur.screen.classList.add(c);
    // `petClasses`: classes on the pet itself (a reaction such as `droop`); `petAt` pauses
    // its animation that many ms in, so a mid-motion frame is the same every run.
    // `visitor`: one world visit pinned (see visitorShot).
    if (shot.visitor) await visitorShot(card, cur, shot.visitor, shot.petAt);
    if (shot.seasonVisitor) await seasonVisitorShot(card, cur, shot.seasonVisitor);
    // `reveal`: the basket's reveal pinned (see revealShot).
    if (shot.reveal) await revealShot(card, cur, shot.reveal);
    // `gift`: a gift said at the first look (see giftShot).
    if (shot.gift) await giftShot(card, cur, shot.gift);
    // A flush first, so a class that is a CSS transition (`look`, `wander-l`) starts one `petAt` can seek.
    void cur.pet.offsetWidth;
    for (const c of shot.petClasses || []) cur.pet.classList.add(c);
    // `petStretch`: a mockup only (gaps-seams Q2): the pet drawn that much wider, its
    // height kept, over the species' own scale.
    if (shot.petStretch) {
      const k = Number(cur.pet.style.scale) || 1;
      cur.pet.style.scale = `${k * shot.petStretch} ${k}`;
    }
    if (shot.petAt !== undefined) {
      for (const a of cur.pet.getAnimations()) {
        a.pause();
        a.currentTime = shot.petAt;
      }
    }
    // `attentionAt`: the call icon as it arrives (`.arrive`, the pop then the pulse), paused that many ms in.
    if (shot.attentionAt !== undefined) {
      cur.attention.classList.add("arrive");
      for (const a of cur.attention.getAnimations()) {
        a.pause();
        a.currentTime = shot.attentionAt;
      }
    }
    // `react`: a care reaction (PR 3c) started through the card's own `_reactFrames`
    // (`fed`, `praised`, `refused`, `tucked`); `petAt` pauses its move mid-way.
    if (shot.react) card._reactFrames(cur, shot.react);
    // `reactEntry`: a care log entry (`{action, result}`) through the card's own `_react`, the whole
    // floor path (frames, move, prop, hearts, line); `variant` pins its picks (`{"refused.full": "shake"}`,
    // `{praise: "spin"}`, `{medicine: "sniff"}`); `reactAt` pauses every animation on the screen that many ms in.
    if (shot.variant) cur.pinVariant = shot.variant;
    if (shot.reactEntry) {
      card._react(cur, { at: Date.now() / 1000, ...shot.reactEntry });
      await new Promise((r) => setTimeout(r, 80)); // the prop's sprite and any pose probe
      if (shot.reactAt !== undefined) {
        for (const a of cur.screen.getAnimations({ subtree: true })) {
          if (a instanceof CSSTransition) continue;
          a.pause();
          a.currentTime = shot.reactAt;
        }
      }
    }
    // `care`: a care scene started through _sceneStart, paused and seeked to `careAt` ms (careSeek).
    if (shot.care) await careSeek(card, cur, shot);
    // `bowlStep`: the feed bowl on the floor at step 0 (full) to 3 of its clip, through the card's own
    // _bowlClip (plan care-reactions 5.1); `bowlRim` stands in for species.json "bowl_rim".
    if (shot.bowlStep !== undefined) {
      if (shot.bowlRim !== undefined) cur.species = { ...cur.species, bowl_rim: shot.bowlRim };
      card._propShow(cur, cur.species.props?.feed || "bird/bowl_food", 1e9);
      await cur.prop.decode().catch(() => {});
      for (const a of cur.prop.getAnimations()) a.finish();
      card._bowlClip(cur, cur.prop, shot.bowlStep);
    }
    // `reactWait`: ms to let sprite probes (and a failed one's swap back) finish before the shot.
    if (shot.reactWait) await new Promise((r) => setTimeout(r, shot.reactWait));
    // `patTap`: a pat on the pet through the card's own `_pat` (acts.pat shows for ~900 ms).
    if (shot.patTap) card._pat(cur, { stopPropagation() {}, detail: 0 });
    // `patBox`: the pat's clear hit box outlined, so a shot shows where a tap pats (or, in a
    // state that hides it, that there is none).
    if (shot.patBox) cur.pat.style.outline = "2px dashed #ff00d0";
    // `bubblePop`: a clean's extra bubble (fresh-expand M-b) through the card's own
    // `_bubblePop`, its roll pinned, paused at `bubblePop` (0-1 of its 1.2 s; true: .7, up and about to pop).
    if (shot.bubblePop) {
      const random = Math.random;
      Math.random = () => 0;
      let made;
      try { made = card._bubblePop(cur); } finally { Math.random = random; }
      clearTimeout(made?.timer);
      const pop = made.img;
      await pop.decode().catch(() => {});
      for (const a of pop?.getAnimations() || []) { a.pause(); a.currentTime = 1200 * (shot.bubblePop === true ? 0.7 : shot.bubblePop); }
    }
    if (shot.beam) irBeam(card);
    // Date is pinned, so a line would never finish typing: write each whole.
    slides.forEach((x) => card._stopTyping(x));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // The shelf and slides come to rest at once: a shot mid-slide is off the pixel grid.
    // (Not the pet's own when `petAt` pauses it: a turn or a wander is a transition, seeked there.)
    for (const a of root.getAnimations()) {
      if (a instanceof CSSTransition && !(shot.petAt !== undefined && a.effect.target === cur.pet)) a.finish();
    }
    // The status's LCD wipes (UX fix 2, F13) run to their end too: a shot never catches a half-drawn page.
    for (const a of root.getAnimations()) if (/^lcd-wipe/.test(a.animationName || "")) a.finish();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await settled(card);
    window.bench.screenClass = cur.screen.className;
    return true;
  }

  window.bench = { mount, step, lookEnd };
})();
