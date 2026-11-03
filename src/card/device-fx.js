// The weather adapter for the device-alive director (docs/plan-2026-11-03-device-alive-interactions.md,
// slices 3B and 4B; sections 5.2, 6.3, 6.6, 6.6b, 6.7). It turns what the server's signal bridge sends
// (custom_components/virtual_pet/device_fx.py) into the director's calls, and holds the weather recipes.
// Slice 4B made it a table (`WEATHER`, keyed like the server's DEVICE_SIGNAL_MAP and its JSON export,
// tests/js/device_signal_map.json): `ambientOf`, `cueOf`, `paint` and `sync` read the table, no key is
// named anywhere else. A new key is one row here, one row in the map, and its CSS.
// One frozen namespace, no `this`, no Home Assistant, no timer of its own. The only DOM it reaches
// is the slide's own glass element (`slide.glass`, its classes), through the recipe's two hooks.
//
// The wire, as 3A built it and 4A widened it: house.device_fx = {version: 1, current: {rain, snow, fog,
// storm, wind: bool}} (each missing until the server has known it once; the whole key missing for a
// house with no weather source); snapshot.device_fx_recent, a ring of entries, oldest first; and a live
// {"fx": entry}. An entry is {id, kind, occurred_at, expires_at, scope}, kind `<key>_started` or
// `<key>_stopped`. Anything else is dropped here: the server never sends CSS, selectors or paths, and
// the card picks from what it declares. `current` is the truth and an entry at most one cue (4A: one
// onset per pass), so a missing kind is not an error.
//
// The classes on the glass are the director's own and all start `dir-`: an ambience class per key
// (`dir-wet`, `dir-frost`, `dir-fog`, `dir-storm`, `dir-wind`; still, a transition at most), an onset
// pair per key, `dir-echo` the shortened form, and the client-computed moon (`dir-moon`, `dir-newmoon`,
// off the wire: FM11). Never the screen classes the house effects use (plan FM4, m5): a source test
// keeps the two families apart. CLASSES_BY_LAYER lists them by layer, tested against style.js.
//
// Slice 3C adds the rim cues (plan section 7's last paragraph): feed, play, clean and the tuck, each a
// `shellImpulse` lease on the slide's rim layer (`slide.rim`, a `.hw.rim` in the bezel, deaf to the
// pointer), classes `dir-feed`, `dir-play`, `dir-clean`, `dir-tuck`. They are the user's own press, so
// they come from the card (`rim`, below), not the wire. Never on a `.cap` or `.toy`; no sound, no
// haptic; reduced motion offers none; a care scene already running wins.
//
// Slice 4D adds the room: the 4C keys (`ROOM`: lights, heating, cooling, fireplace, tv, music) in the same
// table, and the moment cues (`HOUSE_RIM`). A row says which layer it paints: lights and fireplace are the
// rim (the bezel's plastic: a persistent glow class on `slide.rim`, `dir-rim-*`, kept apart from the cue
// classes), music and tv the glass (a still layer, as the weather). A row with no kinds (heating, cooling)
// is a tint and nothing else; a row of a closed enum (lights: off|on) paints by member and an unknown
// member paints nothing. The moment cues (doorbell, appliance, vacuum, the heating wash) are offered by the
// card from the same callback as the moment's own screen effect (`offerMoment`): never from the wire.
const HATCH_DEVICE_FX = Object.freeze(
  (() => {
    // The weather keys, in the server map's order (tests/js/device_signal_map.json is checked against
    // this table). Per key: the ambience class (state, still), the onset class for a start and for an
    // end, the onset's length and its echo's (the director's watchdog; the glass's own `dir-glass-life`
    // clock is the real end), the echo rank (the map's `echo_rank`) and the per-kind cooldown. The
    // cooldown stays under the map's `block_s` so a held reverse (45-55 s after its start) is not eaten.
    const row = (ambient, start, end, durationMs, echoMs, more = {}) =>
      Object.freeze({ layer: "glass", ambient, start, end, durationMs, echoMs, echoRank: 2, cooldownMs: 20000, ...more });
    const WEATHER = Object.freeze({
      rain: row("dir-wet", "dir-drop", "dir-clear", 1800, 900), // a drop runs down; the last bead clears
      snow: row("dir-frost", "dir-frost-form", "dir-thaw", 2400, 1200), // corner frost forms / thaws
      fog: row("dir-fog", "dir-fog-in", "dir-fog-out", 2400, 1200), // fog gathers at the rim / clears
      storm: row("dir-storm", "dir-storm-in", "dir-storm-out", 3000, 1800), // a dim shiver, never a flash
      wind: row("dir-wind", "dir-wind-gust", "dir-wind-die", 2000, 1000), // flecks lean across the glass
    });
    // The room, in the server map's order after the weather (slice 4C's keys; section 6.6). `layer` is where
    // it paints. An enum row (`lights`) names its members in `values` (the on edge's first, as the server's
    // `kinds`) and its still look per member in `ambientBy`; a row with `kinds: []` is a tint and has no
    // onset, no echo and no recipe (heating and cooling: their wash is a moment's, F9). The cooldowns are the
    // plan's (6.5): music and tv 5 min, the fireplace 60 s, the lights as the weather. A held reverse inside
    // a cooldown is ambience only, which is the plan's trade for "a started for every song".
    const ROOM = Object.freeze({
      lights: row(null, "dir-lamp-on", "dir-lamp-off", 1500, 600, {
        layer: "rim", ambientBy: Object.freeze({ on: "dir-rim-lit", off: "dir-rim-dim" }), values: ["on", "off"],
        kinds: ["lights_on", "lights_off"], echoRank: 3,
      }), // the lamps brighten in turn / dim in turn; the rim lit or dimmed, never over the backlight
      heating: row("dir-rim-warm", null, null, 0, 0, { layer: "rim", kinds: [], echoRank: null, cooldownMs: 0 }), // a warm tint while running
      cooling: row("dir-rim-cool", null, null, 0, 0, { layer: "rim", kinds: [], echoRank: null, cooldownMs: 0 }), // a cool tint while running
      fireplace: row("dir-rim-fire", "dir-ember-in", "dir-ember-out", 1500, 600, { layer: "rim", echoRank: 3, cooldownMs: 60000 }), // embers light along the bottom / set
      tv: row("dir-tv", "dir-tv-on", "dir-tv-off", 1800, 900, { echoRank: 4, cooldownMs: 300000 }), // a reflected rectangle at the screen's edge
      music: row("dir-bars", "dir-bars-up", "dir-bars-down", 1800, 900, { echoRank: 4, cooldownMs: 300000 }), // a few bars rise / fall
    });
    const ROWS = Object.freeze({ ...WEATHER, ...ROOM });
    const ROW_KEYS = Object.freeze(Object.keys(ROWS));
    // The keys with an onset (a kind pair), and the wire kind of each edge: the row's `kinds` or `<key>_started`
    // / `<key>_stopped`, with the values it stands for (true / false, or the enum's on / off).
    const EDGE_KEYS = Object.freeze(ROW_KEYS.filter((key) => !ROWS[key].kinds || ROWS[key].kinds.length > 0));
    const kindsOf = (key) => ROWS[key].kinds || [`${key}_started`, `${key}_stopped`];
    const valuesOf = (key) => ROWS[key].values || [true, false];
    // The wire kind to the recipe's key, direction and value (M6): `stillTrue` and the collapse read
    // these, the wire has neither.
    const KINDS = Object.freeze(
      Object.fromEntries(
        EDGE_KEYS.flatMap((key) => [
          [kindsOf(key)[0], Object.freeze({ key, direction: "start", value: valuesOf(key)[0] })],
          [kindsOf(key)[1], Object.freeze({ key, direction: "end", value: valuesOf(key)[1] })],
        ])
      )
    );
    // The moon, off the wire (FM11): a static halo on the full and the new day, computed from the server's
    // clock. Not a key: it has no edge, no onset, no ring entry, no echo.
    const MOON = Object.freeze({ full: "dir-moon", new: "dir-newmoon" });
    // The rim cues a moment drives (slice 4D; plan 6.6a, 6.6c), by the moment's type: a cue is {kind, cls, ms,
    // cooldownMs}, the same lamp vocabulary as RIM below (three amber lamps; opacity and `left` only). A moment
    // with a variant (the appliance's kind, the heating or the cooling wash) is {by, fallback}: one cue per
    // variant, and a variant it does not name takes the fallback's. They are offered by the card from the
    // moment's own callback (`offerMoment`), never from the wire, and have no echo.
    const cue = (kind, cls, ms, cooldownMs) => Object.freeze({ kind, cls, ms, cooldownMs });
    const TICK_L = cue("rimTickLeft", "dir-tick-l", 900, 3000);
    const TICK_M = cue("rimTickMid", "dir-tick-m", 900, 3000);
    const TICK_R = cue("rimTickRight", "dir-tick-r", 900, 3000);
    const HOUSE_RIM = Object.freeze({
      doorbell_live: cue("rimChime", "dir-chime", 1200, 5000), // two notes along the top edge
      appliance_done: Object.freeze({ // one tick, the lamp by the kind; any other kind is the middle tick
        by: Object.freeze({ washer: TICK_L, dryer: TICK_M, dishwasher: TICK_R, machine: TICK_M }), fallback: "machine",
      }),
      house_answered: Object.freeze({ // the heating or the cooling came on for the pet: a wash along the top edge
        by: Object.freeze({ heating: cue("rimWashWarm", "dir-wash-warm", 1300, 5000), cooling: cue("rimWashCool", "dir-wash-cool", 1300, 5000) }),
      }),
      robot_out: cue("rimRotorOut", "dir-rotor-out", 1100, 5000), // the rotor turns once
      robot_home: cue("rimRotorHome", "dir-rotor-home", 2200, 5000), // the rotor slows
    });
    const houseCues = Object.freeze(
      [...new Map(Object.values(HOUSE_RIM).flatMap((e) => (e.by ? Object.values(e.by) : [e])).map((c) => [c.kind, c])).values()]
    );
    // The rare glass mark (slice 6; plan section 9): one element (`slide.mark`, a `<u class="mark">` after the glass's
    // seven `<b>`), a generic paw, smudge or edge shadow at one of four fixed spots in the screen's margin band. It is
    // no lease and no track: it never writes `s.dirEffect`, it ends on its own `dir-mark-life` animation (the card's
    // timer is the backstop), and its classes are on that element only, never on the glass. Timings are FM16's; the
    // rarity (FM13) is viewed time, credited at most `creditMs` a tick.
    const MARK = Object.freeze({
      kinds: Object.freeze(["dir-mark-paw", "dir-mark-smudge", "dir-mark-edge"]),
      spots: Object.freeze(["dir-mark-bl", "dir-mark-br", "dir-mark-ml", "dir-mark-mr"]),
      on: "dir-mark-on",
      everyMs: 20 * 60 * 1000, // about one per 20 minutes of viewed time, per pet
      creditMs: 2000, // a tick is credited at most this much: a throttled timer cannot pay out the wait
      showMs: 20000, // on screen
      fadeMs: 2000, // then the fade; the mark is removed after both
    });
    const USER_RIM_CLASSES = ["dir-feed", "dir-play", "dir-clean", "dir-tuck"];
    const layerKeys = (layer) => EDGE_KEYS.filter((key) => ROWS[key].layer === layer);
    // Every class a recipe or the paint may set, by layer (F11): each recipe's start clears its layer's
    // onset set, the paint owns the ambient sets (`ambient` on the glass, `rimAmbient` on the rim: a glow is
    // not a cue, so a cue's start never wipes it). A test checks it against every `.hw.glass.dir-*` and
    // `.hw.rim.dir-*` rule in style.js.
    const ambientOfRow = (row) => (row.ambientBy ? Object.values(row.ambientBy) : [row.ambient]);
    const ambientsOn = (layer) => ROW_KEYS.filter((key) => ROWS[key].layer === layer).flatMap((key) => ambientOfRow(ROWS[key]));
    const onsetsOn = (layer) => layerKeys(layer).flatMap((key) => [ROWS[key].start, ROWS[key].end]);
    const CLASSES_BY_LAYER = Object.freeze({
      glass: Object.freeze(onsetsOn("glass").concat("dir-echo")),
      ambient: Object.freeze(ambientsOn("glass").concat(Object.values(MOON))),
      rim: Object.freeze(USER_RIM_CLASSES.concat(houseCues.map((c) => c.cls), onsetsOn("rim"), "dir-rim-echo")),
      rimAmbient: Object.freeze(ambientsOn("rim")),
      mark: Object.freeze(MARK.kinds.concat(MARK.spots, MARK.on)),
    });
    const CLASSES = CLASSES_BY_LAYER.glass;
    const RIM_CLASSES = CLASSES_BY_LAYER.rim;
    const isObj = (x) => !!x && typeof x === "object";

    // The ambient state the house view carries. Missing is "nothing to paint", never dry; a
    // version this card does not know is the same.
    const ambientOf = (house) => {
      const fx = isObj(house) ? house.device_fx : null;
      if (!isObj(fx) || fx.version !== 1) return {};
      const out = {};
      if (!isObj(fx.current)) return out;
      for (const key of ROW_KEYS) {
        const v = fx.current[key];
        const by = ROWS[key].ambientBy;
        // A bool row takes a bool; an enum row takes only one of its own members (an unknown one is nothing).
        if (by ? typeof v === "string" && Object.prototype.hasOwnProperty.call(by, v) : typeof v === "boolean") out[key] = v;
      }
      return out;
    };

    // One wire entry as a director cue, or null. A live onset leaves `occurredAt` and `ttlMs`
    // unset (receipt time is within 10 s of the truth, and a device clock that is off must not
    // expire it silently, M5); a ring entry carries the server's times, as the echo window needs.
    const cueOf = (entry, ring) => {
      if (!isObj(entry) || typeof entry.id !== "string" || !entry.id) return null;
      if (entry.scope !== undefined && entry.scope !== "house") return null;
      const kind = Object.prototype.hasOwnProperty.call(KINDS, entry.kind) ? KINDS[entry.kind] : null;
      if (!kind) return null;
      const cue = {
        id: entry.id, kind: kind.key, origin: "house", presentation: ring ? "echo" : "onset",
        direction: kind.direction, data: { key: kind.key, value: kind.value },
      };
      if (ring) {
        const at = Date.parse(entry.occurred_at);
        if (!Number.isFinite(at)) return null;
        cue.occurredAt = at;
        const ttl = Date.parse(entry.expires_at) - at;
        if (ttl > 0) cue.ttlMs = ttl;
      }
      return cue;
    };
    const ringOf = (list) => (Array.isArray(list) ? list.map((e) => cueOf(e, true)).filter(Boolean) : []);

    // The recipe, one per key with an onset, made from its row. An onset class is set on the row's layer (the
    // glass for the weather, music and tv; the rim for lights and the fireplace): the layer of its key animates
    // (a drop runs down the inner glass, frost forms, bars rise, the lamps brighten in turn) and the layer's own
    // `dir-glass-life` / `dir-rim-life` is the lease's clock, so the card releases on that one name only (F11).
    // An echo is the same, shorter. The shell/glass only: never the pet, never a screen class. The director's
    // watchdog is the backstop.
    const keyRecipe = (key) => {
      const w = ROWS[key];
      const onRim = w.layer === "rim";
      const where = (slide) => slide && (onRim ? slide.rim : slide.glass);
      const echoClass = onRim ? "dir-rim-echo" : "dir-echo";
      const wipe = (el) => el.classList.remove(...(onRim ? RIM_CLASSES : CLASSES));
      return Object.freeze({
        track: "shellImpulse", priority: HATCH_DIRECTOR.PRIORITY.house, // the director loads first (manifest.txt)
        durationMs: w.durationMs, echoMs: w.echoMs, echoRank: w.echoRank, // the onset rank is the map's (6.7)
        cooldownMs: w.cooldownMs, collapseKey: key, cancel: "finish",
        start: (slide, effect) => {
          const el = where(slide);
          if (!el) return;
          wipe(el);
          void el.offsetWidth; // a replaced effect restarts its animation
          el.classList.add(effect.data && effect.data.value === valuesOf(key)[1] ? w.end : w.start);
          if (effect.presentation === "echo") el.classList.add(echoClass);
          slide.dirEffect = effect.id;
        },
        dispose: (slide, effect) => {
          const el = where(slide);
          if (el) wipe(el);
          if (slide && slide.dirEffect === effect.id) slide.dirEffect = 0;
        },
      });
    };

    // The rim cues, by the toy's data-action: the cue kind, its class on the rim and its length (the
    // CSS animation's own clock is the same). Medicine, snack, scold and praise have none (plan 13).
    const RIM = Object.freeze({
      feed: Object.freeze({ kind: "rimFeed", cls: "dir-feed", ms: 1300 }), // the delivery path, glowing in turn
      play: Object.freeze({ kind: "rimPlay", cls: "dir-play", ms: 900 }), // two points, pulsing twice
      clean: Object.freeze({ kind: "rimClean", cls: "dir-clean", ms: 1100 }), // one sweep along the top
      lights: Object.freeze({ kind: "rimTuck", cls: "dir-tuck", ms: 1800 }), // the lamps dimming in sequence
    });
    const clearRim = (rim) => rim.classList.remove(...RIM_CLASSES);
    const rimRecipe = (cue, priority = HATCH_DIRECTOR.PRIORITY.care) => // a press is over a house onset
      Object.freeze({
        track: "shellImpulse", priority, durationMs: cue.ms, cancel: "finish",
        ...(cue.cooldownMs > 0 ? { cooldownMs: cue.cooldownMs } : {}),
        start: (slide, effect) => {
          const rim = slide && slide.rim;
          if (!rim) return;
          clearRim(rim);
          void rim.offsetWidth; // a replaced cue restarts its animation
          rim.classList.add(cue.cls);
          slide.dirEffect = effect.id;
        },
        dispose: (slide, effect) => {
          const rim = slide && slide.rim;
          if (rim) clearRim(rim);
          if (slide && slide.dirEffect === effect.id) slide.dirEffect = 0;
        },
      });
    const RECIPES = Object.freeze({
      ...Object.fromEntries(EDGE_KEYS.map((key) => [key, keyRecipe(key)])),
      ...Object.fromEntries(Object.values(RIM).map((cue) => [cue.kind, rimRecipe(cue)])),
      ...Object.fromEntries(houseCues.map((c) => [c.kind, rimRecipe(c, HATCH_DIRECTOR.PRIORITY.house)])),
    });

    // A rim cue for the toy `action` (its data-action), from the card's press (or a confirmed tuck).
    // `id` is the press's own (the director dedups by it). Reduced motion: none (it is an onset);
    // an action with no cue: none; a care scene running: it wins. The director decides the rest
    // (canRender: the switch, on show, visible).
    const rim = (dir, slide, action, id, env) => {
      const cue = Object.prototype.hasOwnProperty.call(RIM, action) ? RIM[action] : null;
      if (!cue) return { accepted: false, reason: "no-cue", effectId: 0 };
      if (env.calm) return { accepted: false, reason: "calm", effectId: 0 };
      if (dir.busyOwners(slide).includes("scene")) return { accepted: false, reason: "busy", effectId: 0 };
      return dir.offer(slide, { id, kind: cue.kind, origin: "user", presentation: "onset" });
    };

    // A rim cue for a moment the card has just handled (slice 4D; plan 6.6c): `moment` is the moment's type, `id`
    // its own (a card sequence), `variant` the appliance's kind or the wash's request, called from the same
    // callback as the moment's screen-effect sibling, never from a wire edge. A house cue: `origin: "house"`, the
    // house priority, no `occurredAt` (a moment has no clock dependence, so it is not gated on `clockKnown`).
    // The same gates as `rim`: reduced motion refuses it, a care scene running wins; the director decides the
    // rest (the switch, on show, visible). A moment is not an echo: its cue carries a short `ttlMs`, so one the
    // director held while the slide was off show is never replayed at its first view.
    const MOMENT_TTL_MS = 3000;
    const momentCue = (moment, variant) => {
      const entry = Object.prototype.hasOwnProperty.call(HOUSE_RIM, moment) ? HOUSE_RIM[moment] : null;
      if (!entry) return null;
      if (!entry.by) return entry;
      const by = Object.prototype.hasOwnProperty.call(entry.by, variant) ? entry.by[variant] : entry.by[entry.fallback];
      return by || null;
    };
    const offerMoment = (dir, slide, moment, id, env, variant) => {
      const found = momentCue(moment, variant);
      if (!found) return { accepted: false, reason: "no-cue", effectId: 0 };
      if (env.calm) return { accepted: false, reason: "calm", effectId: 0 };
      if (dir.busyOwners(slide).includes("scene")) return { accepted: false, reason: "busy", effectId: 0 };
      return dir.offer(slide, { id, kind: found.kind, origin: "house", presentation: "onset", ttlMs: MOMENT_TTL_MS });
    };

    // The full or the new moon for a time (ms), or "". The synodic month from a known new moon
    // (2000-01-06 18:14 UTC); the day is within 1.2 days of the phase.
    const SYNODIC_DAYS = 29.530588853;
    const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);
    const moonOf = (ms) => {
      if (typeof ms !== "number" || !Number.isFinite(ms)) return "";
      const age = (((ms - NEW_MOON_MS) / 864e5) % SYNODIC_DAYS + SYNODIC_DAYS) % SYNODIC_DAYS;
      if (age < 1.2 || age > SYNODIC_DAYS - 1.2) return "new";
      return Math.abs(age - SYNODIC_DAYS / 2) < 1.2 ? "full" : "";
    };

    // The ambience: one still class per key the house says is true (an enum's member by value), on the key's own
    // layer, and the moon, when the switch is on. Painted for any slide (it is still: no animation, nothing to
    // freeze, a transition at most), reduced motion included. Returns whether anything is painted.
    const paint = (dir, slide, env) => {
      const glass = slide && slide.glass;
      if (!glass) return false;
      const rim = slide.rim;
      const amb = dir.ambient(slide);
      let any = false;
      for (const key of ROW_KEYS) {
        const w = ROWS[key];
        const el = w.layer === "rim" ? rim : glass;
        if (!el) continue;
        for (const cls of ambientOfRow(w)) {
          const on = !!env.lcdOn && (w.ambientBy ? w.ambientBy[amb[key]] === cls : amb[key] === true);
          el.classList.toggle(cls, on);
          any = any || on;
        }
      }
      const moon = env.lcdOn ? moonOf(env.now) : "";
      for (const phase of Object.keys(MOON)) {
        const on = moon === phase;
        glass.classList.toggle(MOON[phase], on);
        any = any || on;
      }
      return any;
    };

    // A house view arrived (snapshot or diff): the ambient state first, then the paint.
    const sync = (dir, slide, house, env) => {
      dir.setAmbient(slide, ambientOf(house));
      return paint(dir, slide, env);
    };

    // A live {"fx": entry}. Reduced motion: no onset (ambience was set by the house view); the
    // clock not known: ambience only. The director decides the rest (canRender, busy, duplicate).
    const live = (dir, slide, entry, env) => {
      if (env.calm) return { accepted: false, reason: "calm", effectId: 0 };
      const cue = cueOf(entry, false);
      if (!cue) return { accepted: false, reason: "invalid-cue", effectId: 0 };
      if (!env.clockKnown) return { accepted: false, reason: "untrusted", effectId: 0 };
      return dir.offer(slide, cue);
    };

    // The first view of a slide: at most one echo, from the ring and the held onset.
    const enter = (dir, slide, recent, env) => {
      if (env.calm) return { accepted: false, reason: "calm", effectId: 0 };
      return dir.enterView(slide, ringOf(recent), env.clockKnown === true);
    };

    // Draw one mark: its kind and spot, then `dir-mark-on` (which starts `dir-mark-life`). The caller has measured
    // the spot before this (placement); `markClear` takes every mark class off, the animation with it.
    const markDraw = (slide, kind, spot) => {
      const el = slide && slide.mark;
      if (!el || !MARK.kinds.includes(kind) || !MARK.spots.includes(spot)) return false;
      el.classList.remove(...CLASSES_BY_LAYER.mark);
      el.classList.add(kind, spot);
      return true;
    };
    const markStart = (slide) => slide && slide.mark && (slide.mark.classList.add(MARK.on), true);
    const markClear = (slide) => {
      if (slide && slide.mark) slide.mark.classList.remove(...CLASSES_BY_LAYER.mark);
    };

    return { MARK, markDraw, markStart, markClear, RECIPES, KINDS, WEATHER, ROOM, ROWS, CLASSES, CLASSES_BY_LAYER, RIM, HOUSE_RIM, RIM_CLASSES, moonOf, ambientOf, cueOf, ringOf, paint, sync, live, enter, rim, offerMoment };
  })()
);
