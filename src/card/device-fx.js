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
const HATCH_DEVICE_FX = Object.freeze(
  (() => {
    // The weather keys, in the server map's order (tests/js/device_signal_map.json is checked against
    // this table). Per key: the ambience class (state, still), the onset class for a start and for an
    // end, the onset's length and its echo's (the director's watchdog; the glass's own `dir-glass-life`
    // clock is the real end), the echo rank (the map's `echo_rank`) and the per-kind cooldown. The
    // cooldown stays under the map's `block_s` so a held reverse (45-55 s after its start) is not eaten.
    const row = (ambient, start, end, durationMs, echoMs) =>
      Object.freeze({ ambient, start, end, durationMs, echoMs, echoRank: 2, cooldownMs: 20000 });
    const WEATHER = Object.freeze({
      rain: row("dir-wet", "dir-drop", "dir-clear", 1800, 900), // a drop runs down; the last bead clears
      snow: row("dir-frost", "dir-frost-form", "dir-thaw", 2400, 1200), // corner frost forms / thaws
      fog: row("dir-fog", "dir-fog-in", "dir-fog-out", 2400, 1200), // fog gathers at the rim / clears
      storm: row("dir-storm", "dir-storm-in", "dir-storm-out", 3000, 1800), // a dim shiver, never a flash
      wind: row("dir-wind", "dir-wind-gust", "dir-wind-die", 2000, 1000), // flecks lean across the glass
    });
    const KEY_LIST = Object.freeze(Object.keys(WEATHER));
    // The wire kind to the recipe's key, direction and value (M6): `stillTrue` and the collapse read
    // these, the wire has neither.
    const KINDS = Object.freeze(
      Object.fromEntries(
        KEY_LIST.flatMap((key) => [
          [`${key}_started`, Object.freeze({ key, direction: "start", value: true })],
          [`${key}_stopped`, Object.freeze({ key, direction: "end", value: false })],
        ])
      )
    );
    // The moon, off the wire (FM11): a static halo on the full and the new day, computed from the server's
    // clock. Not a key: it has no edge, no onset, no ring entry, no echo.
    const MOON = Object.freeze({ full: "dir-moon", new: "dir-newmoon" });
    // Every class a recipe or the paint may set, by layer (F11): each recipe's start clears its layer's
    // onset set, the paint owns the ambient set. A test checks it against every `.hw.glass.dir-*` and
    // `.hw.rim.dir-*` rule in style.js.
    const ONSETS = Object.freeze(KEY_LIST.flatMap((key) => [WEATHER[key].start, WEATHER[key].end]).concat("dir-echo"));
    const CLASSES_BY_LAYER = Object.freeze({
      glass: ONSETS,
      ambient: Object.freeze(KEY_LIST.map((key) => WEATHER[key].ambient).concat(Object.values(MOON))),
      rim: Object.freeze(["dir-feed", "dir-play", "dir-clean", "dir-tuck"]),
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
      if (isObj(fx.current)) for (const key of KEY_LIST) if (typeof fx.current[key] === "boolean") out[key] = fx.current[key];
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

    const clear = (glass) => glass.classList.remove(...CLASSES);

    // The recipe, one per key, made from its row. An onset class is set on the glass: the layer of its
    // key animates (a drop runs down the inner glass, frost forms, fog gathers, the dim shivers, flecks
    // lean across) and the glass's own `dir-glass-life` is the lease's clock, so the card releases on
    // that one name only (F11). An echo is the same, shorter. The shell/glass only: never the pet,
    // never a screen class. The director's watchdog is the backstop.
    const weatherRecipe = (key) => {
      const w = WEATHER[key];
      return Object.freeze({
        track: "shellImpulse", priority: HATCH_DIRECTOR.PRIORITY.house, // the director loads first (manifest.txt)
        durationMs: w.durationMs, echoMs: w.echoMs, echoRank: w.echoRank, // a weather onset: after the doorbell and the appliance (6.7)
        cooldownMs: w.cooldownMs, collapseKey: key, cancel: "finish",
        start: (slide, effect) => {
          const glass = slide && slide.glass;
          if (!glass) return;
          clear(glass);
          void glass.offsetWidth; // a replaced effect restarts its animation
          glass.classList.add(effect.data && effect.data.value === false ? w.end : w.start);
          if (effect.presentation === "echo") glass.classList.add("dir-echo");
          slide.dirEffect = effect.id;
        },
        dispose: (slide, effect) => {
          const glass = slide && slide.glass;
          if (glass) clear(glass);
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
    const rimRecipe = (cue) =>
      Object.freeze({
        track: "shellImpulse", priority: HATCH_DIRECTOR.PRIORITY.care, // a press is over a house onset
        durationMs: cue.ms, cancel: "finish",
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
      ...Object.fromEntries(KEY_LIST.map((key) => [key, weatherRecipe(key)])),
      ...Object.fromEntries(Object.values(RIM).map((cue) => [cue.kind, rimRecipe(cue)])),
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

    // The ambience on the glass: one still class per key the house says is true, and the moon, when the
    // switch is on. Painted for any slide (it is still: no animation, nothing to freeze, a transition
    // at most). Returns whether anything is painted.
    const paint = (dir, slide, env) => {
      const glass = slide && slide.glass;
      if (!glass) return false;
      const amb = dir.ambient(slide);
      let any = false;
      for (const key of KEY_LIST) {
        const on = !!env.lcdOn && amb[key] === true;
        glass.classList.toggle(WEATHER[key].ambient, on);
        any = any || on;
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

    return { RECIPES, KINDS, WEATHER, CLASSES, CLASSES_BY_LAYER, RIM, RIM_CLASSES, moonOf, ambientOf, cueOf, ringOf, paint, sync, live, enter, rim };
  })()
);
