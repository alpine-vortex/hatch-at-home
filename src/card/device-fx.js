// The rain adapter for the device-alive director (docs/plan-2026-11-03-device-alive-interactions.md,
// slice 3B; sections 5.2, 6.3, 6.6, 6.7). It turns what the server's signal bridge sends
// (custom_components/virtual_pet/device_fx.py) into the director's calls, and holds the rain recipe.
// One frozen namespace, no `this`, no Home Assistant, no timer of its own. The only DOM it reaches
// is the slide's own glass element (`slide.glass`, its classes), through the recipe's two hooks.
//
// The wire, as 3A built it: house.device_fx = {version: 1, current: {rain: bool}} (rain missing
// until the server has known it once; the whole key missing for a house with no weather source);
// snapshot.device_fx_recent, a ring of entries, oldest first; and a live {"fx": entry}. An entry
// is {id, kind, occurred_at, expires_at, scope}, kind rain_started or rain_stopped. Anything else
// is dropped here: the server never sends CSS, selectors or paths, and the card picks from what it
// declares.
//
// The classes on the glass are the director's own and all start `dir-`: `dir-wet` is the ambience
// (state), `dir-drop` / `dir-clear` the onset, `dir-echo` its shortened form. Never the screen
// classes the house effects use (plan FM4, m5): a source test keeps the two families apart.
const HATCH_DEVICE_FX = Object.freeze(
  (() => {
    const COLLAPSE = "rain"; // a start and its end share it: they cancel, neither plays
    // The wire kind to the recipe's kind, direction and data (M6): `stillTrue` and the collapse
    // read these, the wire has neither.
    const KINDS = Object.freeze({
      rain_started: Object.freeze({ direction: "start", value: true }),
      rain_stopped: Object.freeze({ direction: "end", value: false }),
    });
    const CLASSES = Object.freeze(["dir-drop", "dir-clear", "dir-echo"]);
    const isObj = (x) => !!x && typeof x === "object";

    // The ambient state the house view carries. Missing is "nothing to paint", never dry; a
    // version this card does not know is the same.
    const ambientOf = (house) => {
      const fx = isObj(house) ? house.device_fx : null;
      if (!isObj(fx) || fx.version !== 1) return {};
      const rain = isObj(fx.current) ? fx.current.rain : undefined;
      return typeof rain === "boolean" ? { rain } : {};
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
        id: entry.id, kind: "rain", origin: "house", presentation: ring ? "echo" : "onset",
        direction: kind.direction, data: { key: "rain", value: kind.value },
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

    // The recipe. A drop forms and runs down the inner glass (start), or the last bead clears
    // (end); an echo is the same, shorter. The shell/glass only: never the pet, never a screen
    // class. The hooks put the classes on the slide's glass; the animation's end releases it
    // (the card listens), and the director's watchdog is the backstop.
    const RAIN = Object.freeze({
      track: "shellImpulse", priority: HATCH_DIRECTOR.PRIORITY.house, // the director loads first (manifest.txt)
      durationMs: 1800, echoMs: 900, echoRank: 2, // a weather onset: after the doorbell and the appliance (6.7)
      collapseKey: COLLAPSE, cancel: "finish",
      start: (slide, effect) => {
        const glass = slide && slide.glass;
        if (!glass) return;
        clear(glass);
        void glass.offsetWidth; // a replaced effect restarts its animation
        glass.classList.add(effect.data && effect.data.value === false ? "dir-clear" : "dir-drop");
        if (effect.presentation === "echo") glass.classList.add("dir-echo");
        slide.dirEffect = effect.id;
      },
      dispose: (slide, effect) => {
        const glass = slide && slide.glass;
        if (glass) clear(glass);
        if (slide && slide.dirEffect === effect.id) slide.dirEffect = 0;
      },
    });

    // The ambience on the glass: the wet sheen, when the switch is on and the house says rain.
    // Painted for any slide (it is still: no animation, nothing to freeze).
    const paint = (dir, slide, env) => {
      const glass = slide && slide.glass;
      if (!glass) return false;
      const wet = !!env.lcdOn && dir.ambient(slide).rain === true;
      glass.classList.toggle("dir-wet", wet);
      return wet;
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

    return { RECIPES: Object.freeze({ rain: RAIN }), KINDS, CLASSES, ambientOf, cueOf, ringOf, paint, sync, live, enter };
  })()
);
