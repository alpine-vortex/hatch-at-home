// The sitter's life on the card (sitter plan S3a, 6.2-6.6; rules in sitter-engine.js). One element
// (`.sitter`, in the screen, behind the pet) with its own motion: `translate` slides it, `scale`
// mirrors it, a frame swap changes its picture; Pip's `transform` and `.pet` classes are untouched
// (AGENTS.md "Motion on the card") except the existing `look` flip while it waves. Every frame and
// step goes through `_sitterTick`, which `_tick` calls: one timer, cleared with the slide (`_forget`).
class HatchPetCardSitter extends HatchPetCardLayout {
  // The art, loaded once for the card, only when a sitter is first shown (F4): the manifest, then
  // the frames of the active sitter. The S2 CSS placeholder shows until the first frame decodes
  // (state "ready"), and again if anything fails ("failed"): no empty box, no retry loop.
  _sitterArt() {
    if (this._sitArt) return this._sitArt;
    const art = (this._sitArt = { state: "loading", manifest: null, pick: null });
    const done = (state) => {
      art.state = state;
      this._slides?.forEach((s) => this._sitterPaint(s));
    };
    loadJson("sitter/sitters.json").then((manifest) => {
      const pick = HATCH_SITTER.pick(manifest, null);
      if (!pick) throw new Error("no base sitter");
      art.manifest = manifest;
      art.pick = pick;
      const first = HATCH_SITTER.frames(pick.row, "stand")[0];
      const stems = [...new Set(Object.values(pick.row.poses).flat())];
      const imgs = stems.map((stem) => {
        const img = new Image();
        img.onerror = () => done("failed");
        img.src = this._sitterSrc(pick.row, stem);
        return [stem, img];
      });
      return imgs.find(([stem]) => stem === first)[1].decode();
    }).then(() => { if (art.state === "loading") done("ready"); }, () => done("failed"));
    return art;
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
    } else {
      st.in = false;
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
    const hold = HATCH_SITTER.hold(this._sitterRow(), {
      night: st.night, asleep: !!s.asleep, busy: !!s.scene || this._owned(s),
      quietMs: Number.isFinite(care) ? Math.max(0, serverNow() - care) : 0, now,
    }, st.hold);
    st.hold = hold;
    return hold.pose;
  }

  _sitterRow() {
    return this._sitArt?.pick?.row || null;
  }

  // The frames to show for a pose: the sitter's own, else it stands (6.2: it never swaps person).
  _sitterFrames(row, pose) {
    const own = HATCH_SITTER.frames(row, pose);
    return own.length ? own : HATCH_SITTER.frames(row, "stand");
  }

  _sitterPaint(s) {
    const el = s.sitterEl;
    const art = this._sitArt;
    const row = art?.state === "ready" ? art.pick.row : null;
    el.classList.toggle("art", !!row);
    if (!row || el.hidden || !s.sit) return;
    const stems = this._sitterFrames(row, this._sitterPose(s, Date.now()));
    if (!stems.length) return;
    const stem = stems[(calm() ? 0 : s.sit.frame) % stems.length];
    const img = el.querySelector(".sit-img");
    const src = this._sitterSrc(row, stem);
    if (img.getAttribute("src") !== src) img.setAttribute("src", src);
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
    st.steps = HATCH_SITTER.beat("arrive", this._sitterRow()).map((x) => (x.pose === "wave" ? { ...x, say: "arrive", look: true } : x));
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
      : HATCH_SITTER.beat("leave", this._sitterRow()).map((x) => (x.pose === "wave" ? { ...x, say: "leave", look: true } : x));
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
    if (st.step?.kind === "idle" && busy) st.step = null; // a scene or a game: it stands (6.3)
    const pose = this._sitterPose(s, now);
    const frames = this._sitterFrames(this._sitterRow(), pose);
    if (frames.length > 1 && !calm() && !(pose === "doze" && st.ticks % 2)) st.frame = (st.frame + 1) % frames.length;
    if (!st.step && !st.steps.length && pose === "stand" && !busy && !calm() && this._sitterOnScreen(s)) {
      const seed = `${dayOrdinal()}|${s.ids?.device}`;
      const next = HATCH_SITTER.idle(seed, st.idleN, this._sitterRow());
      if (next && !st.nextIdle) st.nextIdle = now + next.wait;
      if (next && now >= st.nextIdle) {
        st.step = { pose: next.pose, ms: HATCH_SITTER.MS.idle, kind: "idle" };
        st.until = now + st.step.ms;
        st.frame = 0;
        st.idleN++;
        st.nextIdle = st.until + HATCH_SITTER.idle(seed, st.idleN, this._sitterRow()).wait;
      }
    }
    this._sitterPaint(s);
  }

  // A game won while the sitter is in: it cheers (6.3). Only by day, only when nothing else plays.
  _sitterCheer(s) {
    const st = s.sit;
    if (!st || !s.sitter || s.sitterEl.hidden || st.step || st.steps.length || st.night || calm()) return;
    if (!this._sitterOnScreen(s) || !HATCH_SITTER.has(this._sitterRow(), "cheer")) return;
    st.steps = [{ pose: "cheer", ms: HATCH_SITTER.MS.cue, kind: "cheer" }];
    this._sitterNext(s, Date.now());
  }

  // The bench: the sitter's state at `ms` into a beat, with nothing running (a fixed clock). `kind`
  // is arrive, leave or round-<cue>; the position is the step's share of the slide.
  _sitterAt(s, kind, ms) {
    const st = this._sit(s);
    const row = this._sitterRow();
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
