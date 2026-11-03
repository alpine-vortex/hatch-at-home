// The device's interaction director (docs/plan-2026-11-03-device-alive-interactions.md,
// sections 5.1-5.4). It decides which small shell, glass or body effect may run on a slide
// right now, and it draws nothing: a recipe's start and dispose hooks (declared by the card's
// adapters, later slices) touch the DOM. Pure like hop-engine.js: no DOM, no Home Assistant,
// no clock or timer of its own. The card passes `now` (the server clock), `trusted`,
// `canRender` and `schedule(ms, fn) -> cancel`; tests pass fakes. One frozen namespace, no
// loose globals: the card is a classic script, so a top-level name is shared with every other
// card on the page. Nothing in the card calls it yet (slice 1); adapters come in slice 3.
//
// Tracks. `control`, `shellImpulse`, `screenFx` and `petBody` are leased: one effect each per
// slide, a generation token on every effect. `shellAmbient` is state (setAmbient), never
// leased and never cancelled. `text` and `modal` belong to the card; the director reads them
// as busy (BUSY_OWNERS) and never touches them. Nothing queues: a request that cannot run now
// is dropped, and a missed cue is never owed (the one exception is the held echo, below).
//
// A recipe, keyed by cue kind: { track, priority, durationMs, cooldownKey?, cooldownMs?,
// collapseKey?, cancel ('finish'|'fade'|'reset'), echoMs?, echoRank?, stillTrue?(ambient,
// cue), start?(slide, effect), dispose?(slide, effect, why, reason) }. The hooks are the only
// way the director reaches the card; a throw in one is swallowed (the visual is disposable).
const HATCH_DIRECTOR = Object.freeze(
  (() => {
    const TRACKS = Object.freeze(["control", "shellAmbient", "shellImpulse", "screenFx", "petBody", "text", "modal"]);
    // The tracks a recipe may lease. Equal priority replaces on these two ("the latest
    // compatible event may replace"); petBody and screenFx are exclusive, only a higher wins.
    const LEASED = Object.freeze(["control", "shellImpulse", "screenFx", "petBody"]);
    const REPLACES_EQUAL = Object.freeze(["control", "shellImpulse"]);
    // These two need a free body; a shell pulse or a cap does not (section 5.1).
    const NEEDS_FREE = Object.freeze(["screenFx", "petBody"]);
    const ORIGINS = Object.freeze(["user", "house", "pet", "idle"]);
    const PRESENTATIONS = Object.freeze(["onset", "echo", "ambient", "interaction"]);
    const CANCEL_MODES = Object.freeze(["finish", "fade", "reset"]);
    // Section 5.1's priority, lowest first, for recipe authors; a number is all a recipe needs.
    const PRIORITY = Object.freeze({ ambience: 1, idle: 2, echo: 3, house: 4, moment: 5, care: 6, input: 7 });

    const ECHO_WINDOW_MS = 90000; // section 6.7: a first view within 90 s of the server's occurredAt
    const CLOCK_SKEW_MS = 5000; // a cue this far ahead of the clock is not trusted as "recent"
    const WATCHDOG_MS = 250; // past an effect's duration; the bounded backstop for a missed animationend
    const SEEN_MAX = 128; // cue ids remembered per slide (section 5.3)

    // The busy list, section 5.3: one frozen table, read at the moment of asking. The card's
    // adapters set nothing. Each `busy` is a pure read over plain slide fields, with `s` the
    // slide; the completeness test scans these functions for the fields they name.
    const BUSY_OWNERS = Object.freeze(
      [
        { name: "game", busy: (s) => !!s.game },
        { name: "scene", busy: (s) => !!s.scene },
        { name: "power", busy: (s) => !!s.power },
        { name: "powerPending", busy: (s) => !!s.powerPending },
        { name: "visitor", busy: (s) => !!s.visitor },
        { name: "asking", busy: (s) => !!s.asking },
        { name: "laySheet", busy: (s) => !!s.laySheet },
        { name: "picker", busy: (s) => !!s.picker },
        { name: "linking", busy: (s) => !!s.linking },
        { name: "calling", busy: (s) => !!s.calling },
        { name: "asleep", busy: (s) => !!s.asleep },
        { name: "pose", busy: (s, now) => s.poseUntil > now },
        // statusOpen is set by the adapter in _toggleStatus (slice 3); until then, by hand.
        { name: "status", busy: (s) => !!s.statusOpen },
      ].map((o) => Object.freeze(o))
    );
    const busyOwners = (slide, now) => BUSY_OWNERS.filter((o) => o.busy(slide, now)).map((o) => o.name);
    const isBusy = (slide, now) => BUSY_OWNERS.some((o) => o.busy(slide, now));

    const isObj = (x) => !!x && typeof x === "object";
    const sameState = (a, b) => {
      const ka = Object.keys(a);
      return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
    };
    const opposite = (a, b) => a !== undefined && b !== undefined && a !== b;

    const checkRecipe = (kind, r) => {
      const bad = (why) => {
        throw new TypeError(`director recipe "${kind}": ${why}`);
      };
      if (!isObj(r)) bad("not an object");
      if (!LEASED.includes(r.track)) bad(`track must be one of ${LEASED.join(", ")}`);
      if (!Number.isFinite(r.priority)) bad("priority must be a number");
      if (!(r.durationMs > 0) || !Number.isFinite(r.durationMs)) bad("durationMs must be a positive number");
      if (r.cancel !== undefined && !CANCEL_MODES.includes(r.cancel)) bad("cancel must be finish, fade or reset");
      for (const hook of ["start", "dispose", "stillTrue"]) {
        if (r[hook] !== undefined && typeof r[hook] !== "function") bad(`${hook} must be a function`);
      }
    };

    // A cue's shape, not its meaning. Returns a reason or "".
    const cueProblem = (cue) => {
      if (!isObj(cue)) return "invalid-cue";
      if (typeof cue.id !== "string" || !cue.id || typeof cue.kind !== "string" || !cue.kind) return "invalid-cue";
      if (!ORIGINS.includes(cue.origin) || !PRESENTATIONS.includes(cue.presentation)) return "invalid-cue";
      if (cue.occurredAt !== undefined && !Number.isFinite(cue.occurredAt)) return "invalid-cue";
      if (cue.ttlMs !== undefined && !(cue.ttlMs > 0)) return "invalid-cue";
      if (cue.data !== undefined && !isObj(cue.data)) return "invalid-cue";
      return "";
    };

    const create = ({ now, deviceNow, trusted, canRender, schedule, recipes } = {}) => {
      if (typeof now !== "function") throw new TypeError("director: now() is required");
      if (typeof schedule !== "function") throw new TypeError("director: schedule(ms, fn) is required");
      // The slide's own timers (poseUntil) are on the device clock, `now` is the server's: the
      // busy read takes the device one. With no second clock they are the same.
      const dnow = typeof deviceNow === "function" ? deviceNow : now;
      const render = typeof canRender === "function" ? canRender : () => true;
      const book = {};
      for (const [kind, r] of Object.entries(recipes || {})) {
        checkRecipe(kind, r);
        book[kind] = r;
      }
      const recipeOf = (kind) => (Object.prototype.hasOwnProperty.call(book, kind) ? book[kind] : null);

      let states = new WeakMap(); // slide -> per-slide state, freed with the slide
      const live = new Set(); // the effects running now: short-lived, so reset() can reach them
      let generation = 0; // one counter for the director: no two effects share a token

      const stateOf = (slide) => {
        if (!isObj(slide)) throw new TypeError("director: the slide must be an object");
        let st = states.get(slide);
        if (!st) {
          st = {
            ambient: Object.freeze({}),
            tracks: new Map(), // track -> the effect leasing it
            seen: new Set(), // cue ids, oldest first, at most SEEN_MAX
            cooldowns: new Map(), // cooldownKey -> the time it frees
            pending: null, // the one held echo candidate: { cue, rank }
            lastMicroBeat: 0, // when an idle or pet beat last started
          };
          states.set(slide, st);
        }
        return st;
      };

      const see = (st, id) => {
        st.seen.delete(id);
        st.seen.add(id);
        if (st.seen.size > SEEN_MAX) st.seen.delete(st.seen.values().next().value);
      };

      const isTrusted = (arg) => {
        const v = arg === undefined ? trusted : arg;
        return (typeof v === "function" ? v() : v) === true; // unknown is not trusted
      };

      const view = (e) =>
        Object.freeze({
          id: e.id, cueId: e.cueId, kind: e.kind, track: e.track, origin: e.origin,
          presentation: e.presentation, cancelMode: e.cancelMode, data: e.data,
        });

      // The one way an effect ends. True once; a second call, or a token that is no longer
      // current, is a no-op, so an old timer or animationend cannot clear a newer effect.
      const endEffect = (e, why, reason) => {
        if (e.done) return false;
        e.done = true;
        live.delete(e);
        const st = states.get(e.slide);
        if (st && st.tracks.get(e.track) === e) st.tracks.delete(e.track);
        try {
          e.stop();
        } catch {
          /* a cancel that throws leaves nothing to undo */
        }
        try {
          if (e.recipe.dispose) e.recipe.dispose(e.slide, view(e), why, reason || "");
        } catch {
          /* the visual is disposable */
        }
        return true;
      };

      const no = (reason, effectId) => ({ accepted: false, reason, effectId: effectId || 0 });

      // Starts the effect on its track, after the checks. `echo` plays the shortened form.
      const admit = (slide, st, cue, recipe, t, echo) => {
        const track = recipe.track;
        see(st, cue.id);
        if (NEEDS_FREE.includes(track) && isBusy(slide, dnow())) return no("busy");

        // Opposite transitions collapse: a "start" whose "end" arrives while its pulse still
        // runs (or the reverse) leaves nothing on the glass.
        if (recipe.collapseKey !== undefined) {
          for (const e of st.tracks.values()) {
            if (e.collapseKey === recipe.collapseKey && opposite(e.direction, cue.direction)) {
              endEffect(e, "collapsed", cue.id);
              return no("collapsed", e.id);
            }
          }
        }

        const coolKey = recipe.cooldownKey || cue.kind;
        if ((st.cooldowns.get(coolKey) || 0) > t) return no("cooldown");

        const priority = echo ? Math.min(recipe.priority, PRIORITY.echo) : recipe.priority;
        const held = st.tracks.get(track);
        if (held) {
          const wins = priority > held.priority || (priority === held.priority && REPLACES_EQUAL.includes(track));
          if (!wins) return no("track-busy", held.id);
          endEffect(held, "replaced", cue.id);
        }

        const ms = echo ? recipe.echoMs || Math.max(1, Math.round(recipe.durationMs / 2)) : recipe.durationMs;
        const e = {
          id: ++generation, cueId: cue.id, kind: cue.kind, track, priority, origin: cue.origin,
          presentation: echo ? "echo" : cue.presentation, data: cue.data, slide, recipe,
          collapseKey: recipe.collapseKey, direction: cue.direction,
          cancelMode: recipe.cancel || "finish", startedAt: t, expiresAt: t + ms,
          done: false, stop: () => {},
        };
        st.tracks.set(track, e);
        live.add(e);
        e.stop = schedule(ms + WATCHDOG_MS, () => endEffect(e, "watchdog"));
        if (recipe.cooldownMs > 0) st.cooldowns.set(coolKey, t + recipe.cooldownMs);
        if (cue.origin === "idle" || cue.origin === "pet") st.lastMicroBeat = t;
        try {
          if (recipe.start) recipe.start(slide, view(e));
        } catch {
          endEffect(e, "failed");
          return no("start-failed");
        }
        return { accepted: true, reason: "ok", effectId: e.id };
      };

      // Whether the thing an echo would recall is still true.
      const stillTrue = (st, cue, recipe) => {
        if (recipe.stillTrue) return !!recipe.stillTrue(st.ambient, cue);
        if (cue.data && "key" in cue.data && "value" in cue.data) return st.ambient[cue.data.key] === cue.data.value;
        return true;
      };

      const rankOf = (cue) => {
        const r = recipeOf(cue.kind);
        return r && Number.isFinite(r.echoRank) ? r.echoRank : 100;
      };
      // Best echo candidate: the lower rank, then the newer.
      const better = (a, b) => rankOf(a) < rankOf(b) || (rankOf(a) === rankOf(b) && a.occurredAt > b.occurredAt);

      const api = {
        // The current normalized state, kept even when nothing may render, so a later switch-on
        // can paint it. Returns whether it changed and whether the card may draw it now.
        setAmbient: (slide, state) => {
          const st = stateOf(slide);
          const next = Object.freeze({ ...(isObj(state) ? state : {}) });
          const changed = !sameState(st.ambient, next);
          st.ambient = next;
          return { changed, render: !!render(slide) };
        },

        ambient: (slide) => stateOf(slide).ambient,

        // A live cue: {id, kind, origin, presentation, occurredAt?, ttlMs?, direction?, data?}.
        offer: (slide, cue) => {
          const st = stateOf(slide);
          if (cueProblem(cue)) return no("invalid-cue");
          if (cue.presentation === "ambient") return no("use-setAmbient");
          const recipe = recipeOf(cue.kind);
          if (!recipe) return no("no-recipe");
          if (st.seen.has(cue.id)) return no("duplicate");
          const t = now();
          const at = cue.occurredAt === undefined ? t : cue.occurredAt;
          if (cue.ttlMs !== undefined && t > at + cue.ttlMs) {
            see(st, cue.id);
            return no("expired");
          }
          if (!render(slide)) {
            // Not seen, so it is still an echo candidate; only the best one is kept.
            const held = { ...cue, occurredAt: at };
            if (cue.origin === "house" && t - at <= ECHO_WINDOW_MS && (!st.pending || better(held, st.pending))) {
              st.pending = held;
            }
            return no("cannot-render");
          }
          return admit(slide, st, { ...cue, occurredAt: at }, recipe, t, cue.presentation === "echo");
        },

        // The slide came on show: at most one echo, from the held candidate and `recent` (the
        // snapshot's ring). Ambience is always the setAmbient state; this adds nothing to it.
        // The decided candidates are marked seen, played or skipped; one that could not be
        // decided (nothing may render, the clock is not trusted) stays eligible within its window.
        enterView: (slide, recent, trustedArg) => {
          const st = stateOf(slide);
          const t = now();
          if (!render(slide)) return no("cannot-render");
          if (!isTrusted(trustedArg)) return no("untrusted");

          const byId = new Map();
          const consider = (cue) => {
            if (cueProblem(cue) || cue.occurredAt === undefined || !recipeOf(cue.kind)) return;
            if (st.seen.has(cue.id) || byId.has(cue.id)) return;
            const age = t - cue.occurredAt;
            if (age < -CLOCK_SKEW_MS || age > ECHO_WINDOW_MS) return;
            if (cue.ttlMs !== undefined && age > cue.ttlMs) return;
            byId.set(cue.id, cue);
          };
          if (st.pending) consider(st.pending);
          st.pending = null;
          for (const cue of Array.isArray(recent) ? recent : []) consider(cue);

          // Opposite transitions in the ring cancel in time order, so "started" then "ended"
          // leaves neither; a "started" after them stands.
          const ordered = [...byId.values()].sort((a, b) => a.occurredAt - b.occurredAt);
          const stacks = new Map();
          for (const cue of ordered) {
            const key = recipeOf(cue.kind).collapseKey;
            if (key === undefined) continue;
            const stack = stacks.get(key) || [];
            const top = stack[stack.length - 1];
            if (top && opposite(top.direction, cue.direction)) stack.pop();
            else stack.push(cue);
            stacks.set(key, stack);
          }
          const survivors = ordered.filter((cue) => {
            const key = recipeOf(cue.kind).collapseKey;
            return key === undefined || stacks.get(key).includes(cue);
          });
          for (const cue of ordered) see(st, cue.id); // decided from here on, whatever happens

          const fits = survivors.filter((cue) => stillTrue(st, cue, recipeOf(cue.kind)));
          if (!fits.length) return no("nothing-to-echo");
          // A user action at the same instant, or a busy body, leaves ambience only.
          if (st.tracks.has("control")) return no("user-action");
          if (isBusy(slide, dnow())) return no("busy");
          const best = fits.reduce((a, b) => (better(b, a) ? b : a));
          return admit(slide, st, best, recipeOf(best.kind), t, true);
        },

        // Ends a running effect by its token (an animationend, say). False for a stale token.
        release: (slide, effectId, why) => {
          const st = states.get(slide);
          if (!st) return false;
          for (const e of st.tracks.values()) {
            if (e.id === effectId) return endEffect(e, why || "finish");
          }
          return false;
        },

        // Ends the effects on `tracks` (default: every leased track) and, with no tracks named,
        // drops the held echo. Returns how many ended. shellAmbient is never cancelled.
        cancel: (slide, reason, tracks) => {
          const st = states.get(slide);
          if (!st) return 0;
          const want = Array.isArray(tracks) ? tracks.filter((x) => LEASED.includes(x)) : LEASED;
          if (!Array.isArray(tracks)) st.pending = null;
          let n = 0;
          for (const track of want) {
            const e = st.tracks.get(track);
            if (e && endEffect(e, "cancel", reason)) n++;
          }
          return n;
        },

        // Expires effects past their time on the injected clock; the card's _tick calls it.
        // The held echo is checked against its window when it is used, so it needs no sweep.
        tick: (t) => {
          const at = t === undefined ? now() : t;
          let n = 0;
          for (const e of [...live]) if (e.expiresAt <= at && endEffect(e, "expired")) n++;
          return n;
        },

        // The slide is going: timers, effects, ambient state and memory, all of it.
        detach: (slide) => {
          const st = states.get(slide);
          if (!st) return;
          for (const e of [...st.tracks.values()]) endEffect(e, "detach");
          states.delete(slide);
        },

        // The card disconnected: every effect on every slide, and the state.
        reset: () => {
          for (const e of [...live]) endEffect(e, "reset");
          live.clear();
          states = new WeakMap();
        },

        isBusy: (slide) => isBusy(slide, dnow()),
        busyOwners: (slide) => busyOwners(slide, dnow()),

        // A plain look at one slide, for tests and the bench.
        inspect: (slide) => {
          const st = states.get(slide);
          if (!st) return null;
          const tracks = {};
          for (const [track, e] of st.tracks) tracks[track] = { id: e.id, kind: e.kind, expiresAt: e.expiresAt };
          return {
            ambient: st.ambient, tracks, seen: st.seen.size, pending: st.pending ? st.pending.id : null,
            lastMicroBeat: st.lastMicroBeat,
          };
        },
      };
      return Object.freeze(api);
    };

    return {
      create, BUSY_OWNERS, isBusy, busyOwners, PRIORITY, TRACKS, LEASED,
      ECHO_WINDOW_MS, SEEN_MAX, WATCHDOG_MS,
    };
  })()
);
