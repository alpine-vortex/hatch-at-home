class HatchPetCardActions extends HatchPetCardJournal {
  // --- Actions ----------------------------------------------------------------

  // Instant feedback for every control: a visible press and ring, a short
  // haptic where the browser supports it, and a perk when the pet is involved.
  // The real reaction (a prop, or a refusal in the bubble) follows on response.
  _tapped(button, s) {
    if (!button || button.disabled) return;
    const at = button.getBoundingClientRect(); // where it was, for a note that must not cover it (F13)
    this._tapRect = { top: at.top, bottom: at.bottom, at: Date.now() };
    button.classList.add("tap-feedback", "tapped", "pressed");
    setTimeout(() => button.classList.remove("pressed"), 160);
    setTimeout(() => button.classList.remove("tapped"), 400);
    if (button.classList.contains("toy")) {
      const ring = document.createElement("span");
      ring.className = "burst";
      button.append(ring);
      setTimeout(() => ring.remove(), 500);
    }
    if (navigator.vibrate) {
      try { navigator.vibrate(12); } catch (err) { /* Unsupported or blocked by the browser. */ }
    }
    this._perk(s);
  }

  // The pet perks up (a quick hop).
  _perk(s) {
    if (!s?.pet) return;
    s.pet.classList.remove("perk");
    void s.pet.offsetWidth; // restart the animation
    s.pet.classList.add("perk");
    setTimeout(() => s.pet.classList.remove("perk"), 320); // let "hop" run again
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
      button.classList.add("failed");
      setTimeout(() => button.classList.remove("failed"), 400);
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
      // A second tap on the same care ends its scene and isn't sent again.
      const same = s.scene.kind === action;
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
    this._sceneStart(s, action);
    const layAt = action === "lay_egg" ? this._layWatch(s) : null; // the name sheet waits for the lay (S3)
    Promise.resolve(this._call(button, s, "button", "press", id)).then((ok) => {
      if (ok === false && layAt && s.layAt === layAt) this._layDrop(s); // a failed press: nothing to wait for
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
    if (!entry || !s.species || s.game || s.screen.classList.contains("show-status")) return;
    const mood = this._state(s, "sensor.mood");
    const stage = this._state(s, "sensor.life_stage")?.state;
    if (!mood || mood.state === "away" || stage === "egg" || s.asleep || s.lightsOut) return;
    if (!entry.due.call(this, s, mood, stage)) return;
    if (calm()) {
      s.sceneFade = { kind, until: Date.now() + 10000 }; // no scene: the news fades in
      return;
    }
    const held = {};
    for (const [key, id] of Object.entries(s.ids || {})) {
      if (key !== "sensor.last_care" && key !== "device") held[key] = this._hass.states[id];
    }
    const sc = { kind, held, start: performance.now(), ms: entry.ms, els: [], frames: null };
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
    this._patSync(s);
    for (const el of [s.pet, s.perch]) el.style.transition = "none";
    if (entry.skippable) {
      // A tap on the screen ends it (and doesn't open the status).
      sc.stop = (e) => {
        e.stopImmediatePropagation();
        this._sceneEnd(s);
      };
      s.screen.addEventListener("click", sc.stop, true);
    }
    this._sceneRender(s, 0);
    const loop = () => {
      if (s.scene !== sc) return;
      const t = performance.now() - sc.start;
      if (t >= sc.ms) {
        this._sceneEnd(s);
        return;
      }
      if (!sc.paused) this._sceneRender(s, t); // paused: a check seeks it instead
      sc.raf = requestAnimationFrame(loop);
    };
    sc.raf = requestAnimationFrame(loop);
  }

  // Everything from one clock: t ms since the tap. The entry moves its pieces and names the
  // pet's frames (null: its own).
  _sceneRender(s, t) {
    const sc = s.scene;
    const ramp = (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
    const ease = (a, b) => {
      const k = ramp(a, b);
      return k * k * (3 - 2 * k);
    };
    const k = { sw: s.screen.clientWidth, sh: s.screen.clientHeight, ramp, ease };
    const frames = SCENES[sc.kind].render.call(this, s, sc, t, k) || null;
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
    this._patSync(s);
    if (sc.stop) s.screen.removeEventListener("click", sc.stop, true);
    sc.els.forEach((el) => el.remove());
    for (const el of [s.pet, s.perch]) el.style.translate = el.style.rotate = el.style.transition = "";
    entry?.clear?.call(this, s, sc);
    // The server's answer may come after this: it's shown, not acted again.
    if (!sc.answered) s.sceneOwes = { kind: sc.kind, until: Date.now() + 10000 };
    s.frame = 0;
    if (!quiet) this._redraw(s);
    if (!quiet && sc.answered) entry?.done?.call(this, s, sc);
  }

  // The server's answer to a scene's tap (_react). The scene shows an "ok" itself;
  // a refusal ends it, said as ever. Under reduced motion the news fades in.
  _sceneAnswered(s, entry) {
    const ok = entry.result === "ok";
    if (s.scene?.kind === entry.action) {
      if (ok) {
        s.scene.answered = true;
        return true;
      }
      this._sceneEnd(s);
      return false;
    }
    const now = Date.now();
    if (s.sceneOwes?.kind === entry.action && now < s.sceneOwes.until) {
      s.sceneOwes = null;
      return ok;
    }
    if (s.sceneFade?.kind === entry.action && now < s.sceneFade.until) {
      s.sceneFade = null;
      if (ok) {
        for (const el of [s.pet, s.prop]) el.animate?.([{ opacity: 0.2 }, { opacity: 1 }], { duration: 350 });
      }
    }
    return false;
  }
}

