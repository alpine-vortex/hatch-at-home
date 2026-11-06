class HatchPetCardActions extends HatchPetCardMemory {
  // --- Actions ----------------------------------------------------------------

  // Instant feedback for every control: a visible press and ring, a short
  // haptic where the browser supports it, and a perk when the pet is involved.
  // The real reaction (a prop, or a refusal in the bubble) follows on response.
  _tapped(button, s, { perk = true } = {}) {
    if (!button || button.disabled) return;
    const at = button.getBoundingClientRect(); // where it was, for a note that must not cover it (F13)
    this._tapRect = { top: at.top, bottom: at.bottom, at: Date.now() };
    // The card's scope, not a pet's: most callers pass no slide, and a forget leaves button chrome to end
    // on time. Unkeyed on purpose: two quick taps give two timers, as before (the first one's end wins).
    button.classList.add("tap-feedback");
    this._hold(this._dirCard, button, "tapped", 400);
    this._hold(this._dirCard, button, "pressed", 160);
    if (button.classList.contains("toy")) {
      const ring = document.createElement("span");
      ring.className = "burst";
      button.append(ring);
      this._later(this._dirCard, 500, () => ring.remove(), { target: ring, undo: () => ring.remove() });
    }
    if (navigator.vibrate) {
      try { navigator.vibrate(12); } catch (err) { /* Unsupported or blocked by the browser. */ }
    }
    if (perk) this._perk(s);
  }

  // The pet perks up (a quick hop).
  _perk(s) {
    if (!s?.pet) return;
    // Unkeyed: a second perk inside 320 ms ends at the first one's time, as it always has.
    this._hold(s, s.pet, "perk", 320, { restart: true }); // let "hop" run again
  }

  // The pet's word on the last change made in the settings sheet (F14), said when the
  // status closes: once per change, only where it may make a sound (not at night, not
  // asleep: _mayPlay), and never about a personal switch on a shared screen. A change
  // with no line (or one put back) clears it. Only while the sheet is up.
  _settingsChanged(s, key) {
    if (!s.settings) return;
    s.settingsChanged = SETTINGS_REACT[key] ? key : null;
  }

  _settingsReact(s) {
    const key = s.settingsChanged;
    s.settingsChanged = null;
    if (!key || !SETTINGS_REACT[key]) return;
    if (key === "notifyOn" && sharedScreen()) return; // personal
    if (!this._mayPlay(s)) return;
    this._perk(s);
    this._speak(s, SETTINGS_REACT[key], 4000);
  }

  async _call(button, s, domain, service, entityId) {
    this._tapped(button, s);
    this._inflight ??= new WeakSet();
    if (this._inflight.has(button)) return; // one call per button at a time
    this._inflight.add(button);
    button.classList.add("pending");
    try {
      await this._hass.callService(domain, service, { entity_id: entityId });
      return true;
    } catch (err) {
      this._hold(this._dirCard, button, "failed", 400); // adds it; unkeyed, as the bare timer was
      this._write(s, "hmm, that didn't work", 3500);
      return false;
    } finally {
      this._inflight.delete(button);
      button.classList.remove("pending");
    }
  }

  _press(s, action) {
    const id = s.ids?.[`button.${action}`];
    const button = action in s.buttons ? s.buttons[action] : s.request;
    if (s.scene) {
      // A second tap on the same care: a meal (or a bedtime) is ignored, the ring and the
      // haptic only, so the bowl is never left uneaten (plan 4.3); medicine and clean end
      // their scene. Neither is sent again.
      const same = s.scene.kind === sceneKind(action);
      if (same && !SCENES[s.scene.kind]?.skippable) {
        this._tapped(button, s, { perk: false });
        return;
      }
      this._sceneEnd(s);
      if (same) {
        this._tapped(button, s);
        return;
      }
    }
    if (!id) return;
    // A care with the status open happens in view, as a game does (UX fix 2, F7): the sheet
    // closes first, so the meal or the medicine shows and a refusal is read in its bubble.
    if (!s.laySheet && s.screen.classList.contains("show-status")) this._toggleStatus(s);
    // Its log entry is "mine" (PR 2a); a few kept, so two quick taps both count.
    s.pressed = [...(s.pressed || []).filter((p) => Date.now() - p.pressedAt < MINE_MATCH_MS), { action, pressedAt: Date.now() }];
    this._rimCue(s, button?.dataset?.action); // feed's and clean's rim cue; the others have none
    this._sceneStart(s, action);
    const sc = s.scene;
    const layAt = action === "lay_egg" ? this._layWatch(s) : null; // the name sheet waits for the lay (S3)
    Promise.resolve(this._call(button, s, "button", "press", id)).then((ok) => {
      if (ok === false && layAt && s.layAt === layAt) this._layDrop(s); // a failed press: nothing to wait for
      if (ok === false && sc && s.scene === sc) this._sceneFail(s); // its exit beat; "that didn't work" is _call's
    });
  }

  // --- Care scenes ----------------------------------------------------------
  // Medicine and clean play as a little scene of about 2 s, not a click. The call
  // goes out at the tap as ever, but the screen keeps showing the pet as it was
  // (_state holds the slide's states, all but last_care) until the scene ends,
  // then draws the news. One clock: _sceneRender(s, t) sets everything from the
  // time since the tap, so an interruption just ends it (_sceneEnd).

  // Start one if this care will work; refusals stay as they are (the server says no).
  // What a scene does is its SCENES entry (card-care.js); this is the frame they share.
  _sceneStart(s, kind) {
    const entry = SCENES[kind];
    if (!entry || !s.species || this._owned(s) || s.screen.classList.contains("show-status")) return;
    const mood = this._state(s, "sensor.mood");
    const stage = this._state(s, "sensor.life_stage")?.state;
    // Asleep or the lights out stops every scene but the lights' own: a wake is about exactly that.
    if (!mood || stage === "egg" || ((s.asleep || s.lightsOut) && kind !== "lights")) return;
    if (!entry.due.call(this, s, mood, stage)) return; // read after _press ended any scene (plan 4.2)
    if (calm()) {
      s.sceneFade = { kind, until: Date.now() + 10000 }; // no scene: the news fades in
      entry.calm?.call(this, s); // but the pet visibly reacts: its pose (plan 9)
      return;
    }
    const held = {};
    for (const [key, id] of Object.entries(s.ids || {})) {
      if (key !== "sensor.last_care" && key !== "device") held[key] = this._live(s, key);
    }
    // answerAt (ms since the tap) and result come with the answer (_sceneAnswer); a scene with a
    // gate holds there until then (_sceneClock).
    const sc = { kind, held, start: performance.now(), ms: entry.ms, gate: entry.gate ?? null, els: [], frames: null,
      answerAt: null, result: null };
    const add = (tag, cls) => {
      const el = document.createElement(tag);
      el.className = cls;
      if (tag === "img") el.alt = "";
      s.screen.insertBefore(el, s.screen.querySelector(".rain"));
      sc.els.push(el);
      return el;
    };
    const box = s.screen.getBoundingClientRect();
    const pet = s.pet.getBoundingClientRect();
    sc.cheer = this._sceneFrames(s, "cheer");
    entry.setup.call(this, s, sc, { add, box, pet });
    s.scene = sc;
    s.screen.classList.add("in-scene");
    this._patSync(s);
    for (const el of [s.pet, s.perch]) el.style.transition = "none";
    // A tap on the screen ends a skippable one (medicine, clean); it doesn't open the status.
    // A meal's (feed, snack) and a bedtime's leave screen taps alone (plan 4.3, FM decision
    // 2026-11-02): the wanted chip, the basket and the tap on the screen work during a meal. The
    // status sheet, opened over a skippable one, keeps its own taps.
    if (entry.skippable) {
      sc.stop = (e) => {
        if (s.status?.contains(e.target)) return;
        e.stopImmediatePropagation();
        this._sceneEnd(s);
      };
      s.screen.addEventListener("click", sc.stop, true);
    }
    this._sceneRender(s, 0);
    const loop = () => {
      if (s.scene !== sc) return;
      const t = performance.now() - sc.start;
      if (this._sceneOver(s, t)) {
        this._sceneEnd(s);
        return;
      }
      if (!sc.paused) this._sceneRender(s, t); // paused: a check seeks it instead
      sc.raf = requestAnimationFrame(loop);
    };
    sc.raf = requestAnimationFrame(loop);
  }

  // The scene's own clock (plan 4.3), a pure function of t (ms since the tap), sc.answerAt and
  // sc.failAt. Before the gate it is t; with no answer by the gate it sticks there (hold: ms
  // held); an answer resumes it from the answer's time. A hold past SCENE_HOLD_MS, or a failed
  // call (failAt), is the exit beat: exit is ms into it, te where the scene stopped.
  _sceneClock(sc, t) {
    const gate = sc.gate;
    const at = (x) => (gate == null || x < gate ? x
      : sc.answerAt == null ? gate : gate + Math.max(0, x - Math.max(sc.answerAt, gate)));
    let failAt = sc.failAt ?? null;
    if (gate != null && sc.answerAt == null && t >= gate + SCENE_HOLD_MS) failAt = Math.min(failAt ?? Infinity, gate + SCENE_HOLD_MS);
    if (failAt != null && t >= failAt) return { te: at(failAt), exit: t - failAt, late: sc.answerAt == null && sc.failAt == null, hold: 0 };
    return { te: at(t), exit: null, late: false, hold: gate != null && sc.answerAt == null && t >= gate ? t - gate : 0 };
  }

  // Is it over at t? The exit beat, the push-away, or the whole scene played on its clock.
  _sceneOver(s, t) {
    const sc = s.scene;
    const entry = SCENES[sc.kind];
    const c = this._sceneClock(sc, t);
    if (c.exit != null) {
      if (c.exit < SCENE_EXIT_MS) return false;
      sc.late = c.late; // no answer came: a reply within the owe's 10 s plays the floor (4.5)
      sc.failed = !c.late; // a failed call: no reply is coming
      return true;
    }
    if (sc.refuseAt != null) return c.te >= sc.refuseAt + (entry.refuseMs || 0);
    return c.te >= sc.ms;
  }

  // Everything from one clock: t ms since the tap. The entry moves its pieces on its own
  // clock (te) and names the pet's frames (null: its own). Holding at the gate, the pet sways
  // on its own frame (+-2deg, two steps, 600 ms); a refusal plays the entry's push-away from
  // sc.refuseAt; the exit beat is the entry's exit.
  _sceneRender(s, t) {
    const sc = s.scene;
    const entry = SCENES[sc.kind];
    const c = this._sceneClock(sc, t);
    entry.watch?.call(this, s, sc, t); // lights: the live state is the answer (plan 4.3b)
    const helpers = (now) => {
      const ramp = (a, b) => Math.min(1, Math.max(0, (now - a) / (b - a)));
      const ease = (a, b) => {
        const k = ramp(a, b);
        return k * k * (3 - 2 * k);
      };
      return { sw: s.screen.clientWidth, sh: s.screen.clientHeight, ramp, ease, te: c.te };
    };
    let frames;
    if (c.exit != null && entry.exit) {
      entry.render.call(this, s, sc, c.te, helpers(c.te));
      frames = entry.exit.call(this, s, sc, c.exit, helpers(c.exit)) ?? null;
    } else if (sc.refuseAt != null && c.te >= sc.refuseAt && entry.refuse) {
      const u = c.te - sc.refuseAt;
      if (!sc.refuseSaid) {
        sc.refuseSaid = true;
        this._sceneRefusalLine(s, sc.result);
      }
      entry.render.call(this, s, sc, sc.refuseAt, helpers(sc.refuseAt)); // the scene stops where it was
      frames = entry.refuse.call(this, s, sc, u, helpers(u)) ?? null;
    } else {
      frames = entry.render.call(this, s, sc, c.te, helpers(c.te)) || null;
      if (c.hold > 0) {
        s.pet.style.rotate = `${Math.floor(c.hold / 300) % 2 ? 2 : -2}deg`; // the waiting loop
        frames = null;
      }
    }
    sc.frames = frames;
    const shown = frames || s.frames;
    if (shown?.length) this._show(s, s.pet, shown[Math.floor(t / 300) % shown.length]);
  }

  // End it, wherever it got to, and draw the pet as it is now.
  _sceneEnd(s, { quiet = false } = {}) {
    const sc = s.scene;
    if (!sc) return;
    const entry = SCENES[sc.kind];
    cancelAnimationFrame(sc.raf);
    s.scene = null;
    s.screen.classList.remove("in-scene");
    this._patSync(s);
    if (sc.stop) s.screen.removeEventListener("click", sc.stop, true);
    sc.els.forEach((el) => el.remove());
    for (const el of [s.pet, s.perch]) el.style.translate = el.style.rotate = el.style.transition = "";
    entry?.clear?.call(this, s, sc);
    if (sc.looked) s.pet.classList.remove("look"); // a flip the scene made does not outlive it (4.9)
    // The server's answer may come after this (a tap on another care, a swipe, the hold run
    // out): an owe of its kind takes it (_sceneOffer). A failed call leaves none.
    if (!sc.answered && !sc.failed) {
      const now = Date.now();
      s.sceneOwes = [...(s.sceneOwes || []).filter((o) => now < o.until && o.kind !== sc.kind),
        { kind: sc.kind, until: now + SCENE_OWE_MS, playOwed: !!entry?.playOwed, late: !!sc.late }];
    }
    s.frame = 0;
    if (!quiet) this._redraw(s);
    if (!quiet && sc.result === "ok") entry?.done?.call(this, s, sc);
    // The tuck, confirmed (the answer was a yes and the lie-down beat wrote s.wasAsleep): the lamps dim
    // on the rim. A wake wrote false, a refusal has no ok; the scene's own beats are not touched.
    if (!quiet && sc.kind === "lights" && !sc.wake && sc.result === "ok" && s.wasAsleep === true) this._rimCue(s, "lights");
  }

  // The answer reaches the live scene: at is ms since the tap (the bench passes its own).
  // An ok marks it answered and resumes a hold. A refusal is the entry's push-away from where
  // it is (refuseAt, on the scene's clock; one per scene); an entry without one ends, said as
  // ever by _react.
  _sceneAnswer(s, result, at) {
    const sc = s.scene;
    if (!sc) return;
    at ??= this._sceneNow(sc);
    const entry = SCENES[sc.kind];
    if (sc.answerAt == null) sc.answerAt = at;
    if (isYes({ action: sc.kind, result })) {
      sc.answered = true;
      sc.result ??= "ok";
      if (result === "spoiled") sc.spoiled = true; // eaten, then smug (the entry's end beat)
      return;
    }
    if (!entry?.refuse) {
      sc.answered = true; // the refusal is said by _react: no owe left to swallow a later ok
      sc.result = result;
      this._sceneEnd(s);
      return;
    }
    if (sc.refuseAt != null) return;
    sc.answered = true;
    sc.result = result;
    const te = this._sceneClock(sc, at).te;
    sc.refuseAt = entry.refuseAt ? entry.refuseAt.call(this, s, sc, te) : te;
  }

  // The call failed (network, unavailable): the scene takes its exit beat and leaves no owe;
  // one without an exit (medicine, clean) plays on as it always has.
  _sceneFail(s) {
    const sc = s.scene;
    if (!sc || !SCENES[sc.kind]?.exit || sc.failAt != null) return;
    sc.failAt = this._sceneNow(sc);
  }

  // Ms since the tap: the real clock, or the bench's own (sc.at), which seeks a scene on a virtual one.
  _sceneNow(sc) {
    return sc.at ?? performance.now() - sc.start;
  }

  // The refusal's own line, said as the push-away starts (the words and the gesture together).
  _sceneRefusalLine(s, result) {
    const line = REFUSALS[result];
    if (!line) return;
    this._line(s, MINE, this._lines(s, `REFUSALS.${result}`, line).text, Math.max(3500, MINE_MS), { write: true, type: "care" });
  }

  // One care log entry offered to the scenes (plan 4.5): true when a scene has it, and nothing
  // more is played for it. A live scene of its kind takes it when it is the viewer's own
  // (claimed); so does an owe of its kind, swallowing an ok the scene showed (medicine,
  // clean) or passing it on to the floor (feed: playOwed, or a scene that gave up: late).
  // Someone else's care never answers a scene. Under reduced motion the news fades in.
  _sceneOffer(s, entry, claimed) {
    const kind = sceneKind(entry.action);
    const ok = isYes(entry);
    const sc = s.scene;
    if (sc?.kind === kind && claimed && sc.failAt == null) {
      if (ok && sc.answered) return false; // a second ok: the floor's
      this._careMarks(s, entry);
      this._sceneAnswer(s, entry.result);
      return s.scene === sc || ok; // an entry with no push-away ended: _react says the refusal
    }
    const now = Date.now();
    const owes = (s.sceneOwes || []).filter((o) => now < o.until);
    const i = claimed ? owes.findIndex((o) => o.kind === kind) : -1;
    if (i >= 0) {
      const [owe] = owes.splice(i, 1);
      s.sceneOwes = owes;
      if (!ok || owe.playOwed || owe.late) return false;
      this._careMarks(s, entry);
      if (entry.action === "medicine") this._allBetter(s, true); // the scene's cheer is over: said now
      return true;
    }
    s.sceneOwes = owes;
    if (s.sceneFade?.kind === kind && now < s.sceneFade.until) {
      s.sceneFade = null;
      if (ok) {
        for (const el of [s.pet, s.prop]) el.animate?.([{ opacity: 0.2 }, { opacity: 1 }], { duration: 350 });
      }
    }
    return false;
  }
}

