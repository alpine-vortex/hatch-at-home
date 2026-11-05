// The sitter's rules (sitter plan S3a, docs/plan-2026-11-04-sitter-visits.md 6.2-6.4, 8). One
// frozen namespace, pure: no `this`, no DOM, no clock of its own (every `now` comes in). The card's
// card-sitter.js is its adapter: the timers, the element and the bubble live there.
const HATCH_SITTER = (() => {
  // The round's cue poses, in the order the round lists them (6.3).
  const CUES = Object.freeze(["feed", "play", "clean", "medicine"]);
  // The idles, one at random (6.3). A sitter's own list comes from its manifest row: `idles`.
  const IDLES = Object.freeze(["stretch", "tea", "laugh", "water", "window", "tidy", "pat"]);
  // Every duration in ms. The frames and the steps are advanced by the card's 700 ms tick.
  const MS = Object.freeze({
    walk: 1400, wave: 1400, cue: 2100, tidy: 700, idle: 4200, fade: 200,
    idleMin: 120000, idleMax: 240000, // an idle every 2-4 min
    readAfter: 20 * 60000, readEvery: 90000, // read: no care for 20 min; one change per 90 s
    greetWait: 2500, // the greeting waits for the walk-out, at most this long (6.4)
  });
  // The pose table's "when" (6.3, F5) as data, so a test can read it.
  const UNUSED = Object.freeze(["tuck", "shoo"]); // the art stays; the card never plays them

  // Whose sitter (6.6): the manifest's `by_finish` names it (a full sitter beats a look, the sync
  // decides); a finish it does not list, null, or "base" gets the base sitter.
  function pick(manifest, finish) {
    const rows = manifest?.sitters;
    const base = rows?.[manifest?.base];
    if (!base) return null;
    const id = Object.hasOwn(manifest.by_finish || {}, finish ?? "") ? manifest.by_finish[finish] : null;
    if (id && rows[id]) return { id, row: rows[id] };
    return { id: manifest.base, row: base };
  }

  // The frame stems of a pose in a sitter's row ([] when the sitter does not have it).
  function frames(row, pose) {
    const list = row?.poses?.[pose];
    return Array.isArray(list) ? list : [];
  }

  // Whether the sitter has a pose, or must stand and let the prop work (6.2).
  function has(row, pose) {
    return frames(row, pose).length > 0;
  }

  // The frames to draw for a pose (6.2, S3 review F3): the sitter's own; a sitter never swaps to
  // another person, so a pose it lacks is its stand, and the care prop does the work. A pose of
  // one frame (a look's wave) alternates with the first stand frame so it still moves.
  function show(row, pose) {
    const own = frames(row, pose);
    const stand = frames(row, "stand");
    if (!own.length) return stand;
    if (own.length === 1 && pose !== "chair" && pose !== "stand" && stand.length) return [own[0], stand[0]];
    return own;
  }

  // Night with no doze frames (a look, 6.2): the sitter stands still, its second stand frame,
  // with the empty chair behind it, leaning a little (CSS). A sitter with `doze` dozes instead.
  function still(row, night) {
    return !!night && !!row && !has(row, "doze");
  }

  // A round's `did` as a cue: the poses (the card's own four, in the round's order, two at most),
  // and `tidy` for a round that is only the tidy (half length, no bubble). null: nothing to play.
  function cue(did) {
    if (!Array.isArray(did)) return null;
    const poses = [...new Set(did.filter((d) => CUES.includes(d)))].slice(0, 2);
    if (!poses.length) return null;
    return { poses, tidy: poses.length === 1 && poses[0] === "clean" && did.length === 1 };
  }

  // F7: a round is news when its `at` is later than the newest `at` this card has seen. `seen` is
  // undefined before the first snapshot: the first snapshot, a reload, never cues.
  function isNew(seen, last) {
    return typeof seen === "number" && typeof last?.at === "number" && last.at > seen;
  }

  // The arrival bubble (F8): a pure function of the visit's start, in ms: "the sitter's here!" on
  // an even minute, "hi, sitter!" otherwise. 0 or 1, an index into SITTER_LINES.arrive.
  function arriveLine(startMs) {
    return Math.floor(startMs / 60000) % 2;
  }

  // A small seeded generator: the same seed and count give the same number in [0, 1).
  function rand(seed, n) {
    let h = 2166136261;
    for (const ch of `${seed}|${n}`) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  }

  // The nth idle of a day (6.3): which pose and how long until the next, seeded by the card's
  // day-seed so a day replays the same. `idles` is the sitter's own list, if it has one.
  // An idle that goes on into other poses (the granny: knit, lower the work, lift the book, read).
  // The tail is only what the sitter's art has; a missing pose ends the idle there.
  const CHAINS = Object.freeze({ knit: Object.freeze([["knitread", 1400], ["read", 4200]]) });
  function chain(row, pose) {
    const out = [];
    for (const [p, ms] of CHAINS[pose] || []) {
      if (!has(row, p)) break;
      out.push({ pose: p, ms });
    }
    return out;
  }

  function idle(seed, n, row) {
    const list = (Array.isArray(row?.idles) ? row.idles : IDLES).filter((p) => has(row, p));
    if (!list.length) return null;
    return {
      pose: list[Math.floor(rand(seed, `p${n}`) * list.length)],
      wait: MS.idleMin + Math.round(rand(seed, `w${n}`) * (MS.idleMax - MS.idleMin)),
    };
  }

  // The pose the sitter holds when no beat, cue or idle is on (6.3, 6.4): doze at night; read when
  // awake in the chair (Pip asleep before bedtime, or no care for 20 min), changing at most once
  // per 90 s; stand otherwise, and always during a scene or a game.
  // `in`: { night, asleep, busy (a scene or a game), quietMs (since the last care), now }
  // `prev`: { pose, at } the last hold and when it was chosen.
  function hold(row, inn, prev) {
    if (inn.night && has(row, "doze")) return { pose: "doze", at: prev?.pose === "doze" ? prev.at : inn.now };
    if (inn.night) return prev?.pose === "stand" ? prev : { pose: "stand", at: inn.now }; // a look: still (6.2)
    const want = !inn.busy && has(row, "read") && (inn.asleep || inn.quietMs >= MS.readAfter) ? "read" : "stand";
    if (prev && (prev.pose === "read" || prev.pose === "stand") && prev.pose !== want && inn.now - prev.at < MS.readEvery) {
      return prev; // one change per 90 s
    }
    return prev && prev.pose === want ? prev : { pose: want, at: inn.now };
  }

  // The steps of a beat (6.4). `walk` slides in or out over its own time; leaving is the walk
  // mirrored (`flip`), never frames of its own (F10).
  function beat(kind, row) {
    const wave = !row || has(row, "wave") ? [{ pose: "wave", ms: MS.wave }] : []; // no row yet: the art is still loading
    if (kind === "arrive") return [{ pose: "walk", ms: MS.walk, enter: true }, ...wave];
    if (kind === "leave") return [...wave, { pose: "walk", ms: MS.walk, exit: true, flip: true }];
    return [];
  }

  // Lazy frames (perf s2933): the poses to fetch right after the first stand frame (the arrival beat
  // starts at once), and the pose the hold may switch to next (night: doze; day: read).
  function upfront(row) {
    return ["stand", "chair", "walk", "wave"].filter((p) => has(row, p));
  }
  function holdNext(row, night) {
    return [night ? "doze" : "read"].filter((p) => has(row, p));
  }

  return Object.freeze({ upfront, holdNext, CUES, IDLES, MS, UNUSED, pick, frames, has, show, still, cue, isNew, arriveLine, rand, idle, chain, hold, beat });
})();
