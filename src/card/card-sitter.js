// The sitter's life on the card (sitter plan S3a, 6.2-6.6; rules in sitter-engine.js). One element
// (`.sitter`, in the screen, behind the pet) with its own motion: `translate` slides it, `scale`
// mirrors it, a frame swap changes its picture; Pip's `transform` and `.pet` classes are untouched
// (AGENTS.md "Motion on the card") except the existing `look` flip while it waves. Every frame and
// step goes through `_sitterTick`, which `_tick` calls: one timer, cleared with the slide (`_forget`).
class HatchPetCardSitter extends HatchPetCardLayout {
  // The art (F4). The manifest loads once for the card, when a sitter is first shown; then the frames
  // of each sitter a slide asks for, only those (`_sitterLoad`): the base, or the pet's look, or a
  // full sitter, by `by_finish` (6.6). The S2 CSS placeholder shows until the first frame decodes, and
  // again if anything fails ("failed"): no empty box, no retry loop, and never another person's frames.
  _sitterArt() {
    if (this._sitArt) return this._sitArt;
    const art = (this._sitArt = { state: "loading", manifest: null, rows: {} });
    const again = () => this._slides?.forEach((s) => this._sitterPaint(s));
    loadJson("sitter/sitters.json").then((manifest) => {
      if (!HATCH_SITTER.pick(manifest, null)) throw new Error("no base sitter");
      art.manifest = manifest;
      art.state = "ready";
    }).then(again, () => { art.state = "failed"; again(); });
    return art;
  }

  // One sitter's frames, once: "loading" until its first stand frame decodes, then "ready", or "failed".
  _sitterLoad(id) {
    const art = this._sitArt;
    if (art.rows[id]) return art.rows[id];
    art.rows[id] = "loading";
    const row = art.manifest.sitters[id];
    const set = (state) => {
      art.rows[id] = state;
      this._slides?.forEach((s) => this._sitterPaint(s));
    };
    const first = HATCH_SITTER.frames(row, "stand")[0];
    const img = new Image();
    img.onerror = () => set("failed");
    img.src = this._sitterSrc(row, first);
    const chair = this._sitterChair(row);
    if (chair) { const c = new Image(); c.src = chair; } // a look at night sits before it (6.2); no state, it just warms the cache
    img.decode().then(() => {
      (art.have ||= new Set()).add(`${row.dir}/${first}`);
      if (art.rows[id] === "loading") set("ready");
      this._sitterWarm(row, HATCH_SITTER.upfront(row)); // the first beat's poses, right behind the stand
    }, () => set("failed"));
    return "loading";
  }

  // Frames on demand (perf s2933): a pose's frames are fetched when something is about to need
  // them, not all ~39 up front. `art.have` is what has loaded (keys `dir/stem`), `art.pend` what is
  // in flight; no Image is kept, the browser's cache holds the bytes. `_sitterPaint` shows a frame
  // only once it is in `have`, so a pose never shows blank, at worst the last frame a tick longer.
  _sitterWarm(row, poses) {
    const art = this._sitArt;
    if (!art || !row) return;
    const have = (art.have ||= new Set());
    const pend = (art.pend ||= new Set());
    for (const pose of poses) {
      for (const stem of HATCH_SITTER.frames(row, pose)) {
        const key = `${row.dir}/${stem}`;
        if (have.has(key) || pend.has(key)) continue;
        pend.add(key);
        const img = new Image();
        img.onload = () => { pend.delete(key); have.add(key); this._slides?.forEach((s) => this._sitterPaint(s)); };
        img.onerror = () => {}; // a lost frame stays in `pend`: never asked for again this page, the last frame stays
        img.src = this._sitterSrc(row, stem);
      }
    }
  }

  // The empty chair a sitter with no doze stands before at night: base art, not a person (6.2).
  _sitterChair(row) {
    const manifest = this._sitArt?.manifest;
    const base = manifest?.sitters?.[manifest.base];
    const stem = HATCH_SITTER.frames(base, "chair")[0];
    return stem && !HATCH_SITTER.has(row, "doze") ? this._sitterSrc(base, stem) : null;
  }

  // Whose sitter (6.6): the pet's own shell, read at each draw; the picker's preview does not change it.
  // `_sitterLook` is the bench's --sitter-look (a finish, or "base"), nothing else sets it.
  _sitterFinish(s) {
    if (this._sitterLook) return this._sitterLook;
    return this._shellChoice(s) ?? s.world?.shell?.finish ?? null;
  }

  // The row to draw for a slide, or null: nothing loaded yet, or the placeholder (a failed load). A shell
  // that changes mid-visit swaps at the next paint once the new sitter is ready, with no beat; until
  // then the slide keeps the one it showed.
  _sitterRow(s) {
    const art = this._sitArt;
    if (!art?.manifest || !s) return null;
    const pick = HATCH_SITTER.pick(art.manifest, this._sitterFinish(s));
    const state = this._sitterLoad(pick.id);
    const st = s.sit;
    if (state === "ready") {
      if (st) st.shown = pick.id;
      return pick.row;
    }
    if (state === "loading" && st?.shown && art.rows[st.shown] === "ready") return art.manifest.sitters[st.shown];
    return null;
  }

  // Settled, for the bench: a row to draw, or a failure (the placeholder is what shows).
  _sitterSettled(s) {
    const art = this._sitArt;
    if (art?.state === "failed" || this._sitterRow(s)) return true;
    const pick = art?.manifest && HATCH_SITTER.pick(art.manifest, this._sitterFinish(s));
    return art?.rows?.[pick?.id] === "failed";
  }

  _sitterSrc(row, stem) {
    return `${BASE}/sitter/${row.dir}/${stem}.png?v=${VERSION}`;
  }

  _sit(s) {
    return (s.sit ||= { in: undefined, seen: undefined, steps: [], step: null, until: 0, frame: 0, ticks: 0,
      hold: null, queue: null, nextIdle: 0, idleN: 0, leaving: false, leaveAt: 0, night: undefined });
  }

  // On screen: the card is visible, the tab is not hidden and this is the pet on show (6.4, F8).
  _sitterOnScreen(s) {
    return !!this._visible && !document.hidden && s === this._slides?.[this._index];
  }

  // The greeting waits for the walk-out, at most 2.5 s (F8).
  _sitterBusy(s) {
    const st = s.sit;
    return !!(st?.leaving && Date.now() - st.leaveAt < HATCH_SITTER.MS.greetWait);
  }

  // Called by every draw of the slide (_renderSlide) with the visit's view (or null) and the scene.
  _sitterSync(s, sitter, scene) {
    const st = this._sit(s);
    const night = scene === "night" || scene === "dim";
    const now = Date.now();
    const play = this._sitterOnScreen(s) && !calm() && !!s.species;
    if (s.subscribed && st.seen === undefined) st.seen = sitter?.last?.at ?? 0; // F7: the first snapshot never cues
    if (sitter) {
      this._sitterArt();
      if (st.in === false) { // F8: it was seen gone, and the card is looking
        if (play) this._sitterArrive(s, night, now);
        else this._sitterReset(s);
      }
      st.in = true;
      if (HATCH_SITTER.isNew(st.seen, sitter.last)) {
        st.seen = sitter.last.at;
        if (play && !s.egg && !night) this._sitterCue(s, sitter.last, now);
      }
    } else if (st.in === true) {
      st.in = false;
      if (play) this._sitterLeave(s, night, now);
      else this._sitterReset(s);
    } else if (st.in !== undefined || s.subscribed || s.subscribeFailed) {
      st.in = false; // seen gone: only once the channel has spoken (a mood-sensor "no sitter" before the snapshot is not a sighting; with the privacy mask a reload would walk it in)
    }
    if (st.night === true && !night && sitter && play) this._animate(s, s.sitterEl, "fade", HATCH_SITTER.MS.fade); // F6: no stand-up frames
    st.night = night;
    s.sitterEl.classList.toggle("doze", night); // the placeholder's lean
    s.sitterEl.hidden = !(sitter || st.leaving);
    this._sitterPaint(s);
  }

  // What the sitter is doing now: a step's pose, else the hold (doze, read, stand).
  _sitterPose(s, now) {
    const st = s.sit;
    if (st.step) return st.step.pose;
    const care = Date.parse(this._state(s, "sensor.last_care")?.state || "");
    const hold = HATCH_SITTER.hold(this._sitterRow(s), {
      night: st.night, asleep: !!s.asleep, busy: !!s.scene || this._owned(s),
      quietMs: Number.isFinite(care) ? Math.max(0, serverNow() - care) : 0, now,
    }, st.hold);
    st.hold = hold;
    return hold.pose;
  }

  // The frames to show for a pose: the sitter's own, else it stands (6.2: it never swaps person).
  _sitterFrames(row, pose) {
    return HATCH_SITTER.show(row, pose);
  }

  _sitterPaint(s) {
    const el = s.sitterEl;
    const row = this._sitArt?.manifest && !el.hidden && s.sit ? this._sitterRow(s) : null;
    el.classList.toggle("art", !!row);
    if (!row || el.hidden || !s.sit) return;
    const still = HATCH_SITTER.still(row, s.sit.night);
    const stems = this._sitterFrames(row, this._sitterPose(s, Date.now()));
    if (!stems.length) return;
    let stem = stems[still ? Math.min(1, stems.length - 1) : (calm() ? 0 : s.sit.frame) % stems.length]; // still: stand_2, no swaying
    const img = el.querySelector(".sit-img");
    const have = this._sitArt.have;
    if (have && !have.has(`${row.dir}/${stem}`)) { // not loaded yet: fetch it, keep the last frame (the stand if none)
      this._sitterWarm(row, [this._sitterPose(s, Date.now())]);
      stem = img.getAttribute("src") ? null : HATCH_SITTER.frames(row, "stand")[0];
    }
    const src = stem && this._sitterSrc(row, stem);
    if (src && img.getAttribute("src") !== src) img.setAttribute("src", src);
    const chair = still ? this._sitterChair(row) : null; // a look at night: the empty chair behind it
    el.classList.toggle("seat", !!chair);
    const seat = el.querySelector(".sit-seat");
    if (chair && seat.getAttribute("src") !== chair) seat.setAttribute("src", chair);
  }

  _sitterReset(s) {
    const st = this._sit(s);
    st.steps = [];
    st.step = null;
    st.queue = null;
    st.leaving = false;
    const el = s.sitterEl;
    el.classList.remove("fade-out");
    el.style.transition = el.style.translate = el.style.scale = "";
    if (!s.scene) s.pet.classList.remove("look");
  }

  // The arrival beat (6.4): by day it walks in and waves; at night it is in the chair already.
  _sitterArrive(s, night, now) {
    this._sitterReset(s);
    if (night) return;
    const st = this._sit(s);
    st.arrivedAt = now;
    st.steps = HATCH_SITTER.beat("arrive", this._sitterRow(s)).map((x) => (x.pose === "wave" ? { ...x, say: "arrive", look: true } : x));
    this._sitterNext(s, now);
  }

  // The leave beat: it waves, then the walk mirrored takes it out (the greeting waits, _sitterBusy);
  // at night it only fades out.
  _sitterLeave(s, night, now) {
    this._sitterReset(s);
    const st = this._sit(s);
    st.leaving = true;
    st.leaveAt = now;
    st.steps = night
      ? [{ pose: "doze", ms: 400, fadeOut: true, exit: true }]
      : HATCH_SITTER.beat("leave", this._sitterRow(s)).map((x) => (x.pose === "wave" ? { ...x, say: "leave", look: true } : x));
    this._sitterNext(s, now);
  }

  // A round's cue (6.3, F7). One deep: a cue that comes while another plays waits, the newest wins.
  _sitterCue(s, last, now) {
    const plan = HATCH_SITTER.cue(last.did);
    if (!plan || s.scene || this._owned(s)) return;
    const st = this._sit(s);
    if (st.step || st.steps.length) { st.queue = plan; return; }
    this._sitterPlay(s, plan, now);
  }

  _sitterPlay(s, plan, now) {
    const st = this._sit(s);
    this._sitterWarm(this._sitterRow(s), plan.poses);
    st.steps = plan.poses.map((pose) => ({ pose, ms: plan.tidy ? HATCH_SITTER.MS.tidy : HATCH_SITTER.MS.cue, kind: "cue", tidy: plan.tidy }));
    this._sitterNext(s, now);
  }

  // The next step (or the end of the beat).
  _sitterNext(s, now) {
    const st = this._sit(s);
    const el = s.sitterEl;
    const done = st.step;
    if (done?.look && !s.scene) s.pet.classList.remove("look");
    if (done?.exit) { // gone: hide it, put its motion back
      st.leaving = false;
      this._sitterReset(s);
      el.hidden = !s.sitter;
    }
    st.step = st.steps.shift() || null;
    if (!st.step && st.queue) {
      const plan = st.queue;
      st.queue = null;
      if (!calm() && !s.egg && !s.scene && !this._owned(s)) { this._sitterPlay(s, plan, now); return; }
    }
    const step = st.step;
    st.frame = 0;
    if (!step) return;
    st.until = now + step.ms;
    if (step.enter || step.exit) this._sitterSlide(s, step);
    if (step.fadeOut) el.classList.add("fade-out");
    if (step.look && !s.scene) s.pet.classList.add("look"); // Pip turns to the sitter (the existing flip)
    if (step.kind === "cue" && !step.tidy && s.species?.props?.[step.pose]) this._propShow(s, s.species.props[step.pose], step.ms);
    const said = step.say || (step.kind === "cue" && !step.tidy ? step.pose : null);
    if (said && !s.asleep && SITTER_LINES[said]) {
      const lines = SITTER_LINES[said];
      this._speak(s, lines[said === "arrive" ? HATCH_SITTER.arriveLine(s.sit.arrivedAt || now) : 0], 3200);
    }
  }

  // The walk in or out: `translate` slides it over the step's time; out, the walk is mirrored (`scale`).
  _sitterSlide(s, step) {
    const el = s.sitterEl;
    const gone = "-150% 0";
    if (step.enter) {
      el.style.transition = "none";
      el.style.translate = gone;
      void el.offsetWidth;
      el.style.transition = `translate ${step.ms}ms linear`;
      el.style.translate = "0 0";
    } else {
      el.style.transition = `translate ${step.ms}ms linear`;
      el.style.scale = "-1 1";
      el.style.translate = gone;
    }
  }

  // One tick (700 ms) of the sitter: the step's end, the frame, an idle's turn.
  _sitterTick(s, now = Date.now()) {
    const st = s.sit;
    if (!st || s.sitterEl.hidden) return;
    st.ticks++;
    const busy = !!s.scene || this._owned(s);
    if (st.step && now >= st.until) this._sitterNext(s, now);
    if (st.step?.kind === "idle" && busy) { st.step = null; st.steps = st.steps.filter((x) => x.kind !== "idle"); } // a scene or a game: it stands (6.3)
    const pose = this._sitterPose(s, now);
    const row = this._sitterRow(s);
    this._sitterWarm(row, [...HATCH_SITTER.holdNext(row, st.night), ...(busy ? ["cheer"] : [])]); // the next hold, and a cheer while a game runs
    const frames = this._sitterFrames(row, pose);
    if (frames.length > 1 && !calm() && !HATCH_SITTER.still(row, st.night) && !(pose === "doze" && st.ticks % 2)) st.frame = (st.frame + 1) % frames.length;
    if (!st.step && !st.steps.length && pose === "stand" && !st.night && !busy && !calm() && this._sitterOnScreen(s)) {
      const seed = `${dayOrdinal()}|${s.ids?.device}`;
      const next = HATCH_SITTER.idle(seed, st.idleN, row);
      if (next && !st.nextIdle) st.nextIdle = now + next.wait;
      if (next) this._sitterWarm(row, [next.pose, ...HATCH_SITTER.chain(row, next.pose).map((x) => x.pose)]); // an idle is minutes away: its frames come first
      if (next && now >= st.nextIdle) {
        st.step = { pose: next.pose, ms: HATCH_SITTER.MS.idle, kind: "idle" };
        st.steps = HATCH_SITTER.chain(row, next.pose).map((x) => ({ ...x, kind: "idle" })); // knit goes on to knitread, read
        st.until = now + st.step.ms;
        st.frame = 0;
        st.idleN++;
        st.nextIdle = st.until + st.steps.reduce((a, x) => a + x.ms, 0) + HATCH_SITTER.idle(seed, st.idleN, row).wait;
      }
    }
    this._sitterPaint(s);
  }

  // A game won while the sitter is in: it cheers (6.3). Only by day, only when nothing else plays.
  _sitterCheer(s) {
    const st = s.sit;
    if (!st || !s.sitter || s.sitterEl.hidden || st.step || st.steps.length || st.night || calm()) return;
    if (!this._sitterOnScreen(s) || !HATCH_SITTER.has(this._sitterRow(s), "cheer")) return;
    this._sitterWarm(this._sitterRow(s), ["cheer"]);
    st.steps = [{ pose: "cheer", ms: HATCH_SITTER.MS.cue, kind: "cheer" }];
    this._sitterNext(s, Date.now());
  }

  // The bench: the sitter's state at `ms` into a beat, with nothing running (a fixed clock). `kind`
  // is arrive, leave or round-<cue>; the position is the step's share of the slide.
  _sitterAt(s, kind, ms) {
    const st = this._sit(s);
    const row = this._sitterRow(s);
    if (calm()) { // reduced motion: no walk, no wave, no cue; it is there, or it is not
      this._sitterReset(s);
      s.sitterEl.hidden = kind === "leave";
      this._sitterPaint(s);
      return;
    }
    const steps = kind === "arrive" ? HATCH_SITTER.beat("arrive", row)
      : kind === "leave" ? HATCH_SITTER.beat("leave", row)
      : (HATCH_SITTER.cue([kind.replace(/^round-/, "")])?.poses || []).map((pose) => ({ pose, ms: HATCH_SITTER.MS.cue, kind: "cue" }));
    this._sitterReset(s);
    let at = ms;
    let step = null;
    for (const x of steps) {
      step = x;
      if (at < x.ms) break;
      at -= x.ms;
    }
    if (!step) return;
    at = Math.min(at, step.ms);
    const el = s.sitterEl;
    st.step = step;
    st.until = Infinity;
    st.frame = Math.floor(at / 700);
    el.hidden = false;
    el.style.transition = "none";
    const share = at / step.ms;
    if (step.enter) el.style.translate = `${-150 * (1 - share)}% 0`;
    if (step.exit) { el.style.scale = "-1 1"; el.style.translate = `${-150 * share}% 0`; }
    if (step.kind === "cue" && s.species?.props?.[step.pose]) this._propShow(s, s.species.props[step.pose], 600000);
    this._sitterPaint(s);
  }
}
