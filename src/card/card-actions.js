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
  _sceneStart(s, kind) {
    if (!SCENE_MS[kind] || !s.species || s.game || s.screen.classList.contains("show-status")) return;
    const mood = this._state(s, "sensor.mood");
    const stage = this._state(s, "sensor.life_stage")?.state;
    if (!mood || mood.state === "away" || stage === "egg" || s.asleep || s.lightsOut) return;
    const due = kind === "medicine" ? (mood.attributes.flags || []).includes("sick")
      : Number(this._state(s, "sensor.poop")?.state || 0) > 0;
    if (!due) return;
    if (calm()) {
      s.sceneFade = { kind, until: Date.now() + 10000 }; // no scene: the news fades in
      return;
    }
    const held = {};
    for (const [key, id] of Object.entries(s.ids || {})) {
      if (key !== "sensor.last_care" && key !== "device") held[key] = this._hass.states[id];
    }
    const sc = { kind, held, start: performance.now(), ms: SCENE_MS[kind], els: [], frames: null };
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
    if (kind === "clean") this._actPose(s.species, s.drawn, s.speciesId, "splash", () => {}); // warm the load probe
    if (kind === "medicine") {
      sc.pill = add("img", "scene scene-pill");
      sc.pill.setAttribute("src", spriteSrc(s.speciesId, s.species.props?.medicine || "bird/medicine"));
      // It steps up until its front (most of the way across its frame) is at the pill.
      const pill = sc.pill.getBoundingClientRect();
      const front = pet.left + pet.width * 0.72;
      sc.step = Math.max(0, Math.min(box.width * 0.22, pill.left + pill.width / 2 - front));
      sc.eat = this._sceneFrames(s, "eat");
      sc.sniff = this._floorVariant(s, "medicine", ["plain", "sniff"]) === "sniff"; // a lean to sniff it first (plan 5.5)
      const extras = s.drawn === "child" && s.species.extras?.squint;
      const excited = s.species.moods?.includes("excited") && s.drawn &&
        Array.from({ length: s.species.frames || 1 }, (_, i) => `${s.drawn}_excited_${i + 1}`);
      sc.cheer ||= extras ? [].concat(extras) : excited || null;
      // A few sparkles about its head, where it stands.
      sc.sparks = [[0.22, 0.2], [0.78, 0.12], [0.66, 0.42]].map(([x, y]) => {
        const el = add("div", "scene-spark");
        el.style.left = `${pet.left - box.left + pet.width * x}px`;
        el.style.top = `${pet.top - box.top + pet.height * y}px`;
        return el;
      });
    } else {
      sc.water = s.world?.mess === "murk";
      const own = (key) => [].concat(s.species.props?.[key] || SCENE_PROPS[key]);
      sc.toolArt = own(sc.water ? "net" : "broom");
      if (!sc.water) sc.dustArt = own("dust");
      if (sc.water) sc.bubbleArt = own("bubbles");
      if (sc.dustArt) sc.dust = add("img", "scene scene-dust");
      sc.tool = add("img", `scene scene-${sc.water ? "net" : "broom"}`);
      if (sc.bubbleArt) sc.bubbles = add("img", "scene scene-bubbles");
      // Each mess on show goes as the broom (or net) passes its middle.
      sc.mess = s.poops.filter((el) => el.style.display !== "none").map((el) => {
        const r = el.getBoundingClientRect();
        return { el, x: r.left - box.left + r.width / 2 };
      });
      sc.murk = s.murk.style.display !== "none" && Number(s.murk.style.opacity) > 0;
      sc.petX = pet.left - box.left + pet.width / 2; // where the pet stands, for the hop over the broom
    }
    s.scene = sc;
    this._patSync(s);
    for (const el of [s.pet, s.perch]) el.style.transition = "none";
    // A tap on the screen ends it (and doesn't open the status).
    sc.stop = (e) => {
      e.stopImmediatePropagation();
      this._sceneEnd(s);
    };
    s.screen.addEventListener("click", sc.stop, true);
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

  // A species' own care frames, when its art has them: species.json "acts", like
  // {"eat": ["baby", "teen", "adult"], "cheer": true} (true: every stage), drawn as
  // <stage>_eat_1 and <stage>_eat_2. Else null, and the scene uses what all have.
  _sceneFrames(s, act) {
    const stages = s.species?.acts?.[act];
    const st = s.drawn;
    if (!st || !(stages === true || (Array.isArray(stages) && stages.includes(st)))) return null;
    return [`${st}_${act}_1`, `${st}_${act}_2`];
  }

  // Scene art (props) on the world's grid: its PNG is 4 frame px per art px, and
  // an art px is 1/64 of the pet's 62% of the screen's height. That is the
  // pet's frame scale (256 frame px), whichever grid the creature is drawn on.
  _sceneArt(s, img, sprite) {
    const src = spriteSrc(s.speciesId, sprite);
    if (img.getAttribute("src") === src) return;
    img.onload = () => {
      img.style.height = `${(img.naturalHeight / 4) * 62 / 64}%`;
    };
    img.setAttribute("src", src);
  }

  _sceneRender(s, t) {
    const sc = s.scene;
    const sw = s.screen.clientWidth;
    const sh = s.screen.clientHeight;
    const ramp = (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
    const ease = (a, b) => {
      const k = ramp(a, b);
      return k * k * (3 - 2 * k);
    };
    let frames = null;
    if (sc.kind === "medicine") {
      // Notice the pill, step up, lean in and take it, step back, a happy hop.
      const step = sc.step * (ease(350, 850) - ease(1500, 1900));
      const hop = -0.06 * sh * Math.sin(Math.PI * ramp(1450, 1750));
      s.pet.style.translate = `${step}px ${hop}px`;
      s.perch.style.translate = `${step}px 0`;
      const sniff = sc.sniff ? 5 * (ease(550, 650) - ease(850, 950)) : 0; // 300 ms: lean in, look, back
      s.pet.style.rotate = `${(sc.eat ? 4 : 9) * (ease(850, 1000) - ease(1250, 1400)) + sniff}deg`;
      const gulp = ease(1000, 1250);
      sc.pill.style.opacity = String(1 - gulp);
      sc.pill.style.scale = String((0.3 + 0.7 * ease(0, 200)) * (1 - 0.7 * gulp));
      sc.pill.style.translate = `${-0.3 * sc.step * gulp}px 0`;
      if (t >= 850 && t < 1400) frames = sc.eat;
      if (t >= 1400) frames = sc.cheer;
      sc.sparks.forEach((el, i) => {
        const k = ramp(1450 + i * 150, 2050 + i * 150);
        el.style.opacity = k > 0 && k < 1 ? String(1 - k * k) : "0";
        el.style.scale = String(0.4 + k);
      });
    } else {
      // The broom (on water worlds, a net) crosses the floor left to right.
      const sweep = ramp(0, 1800);
      this._sceneArt(s, sc.tool, sc.toolArt[Math.floor(t / 180) % sc.toolArt.length]);
      const tw = sc.tool.getBoundingClientRect().width || sw * 0.25;
      const left = -tw + (sw + tw) * sweep;
      const point = left + tw / 2;
      sc.tool.style.left = `${left}px`;
      sc.tool.style.display = sweep < 1 ? "" : "none";
      if (sc.water) sc.tool.style.translate = `0 ${Math.sin(t / 150) * 0.02 * sh}px`;
      // The pet hops over the broom as it passes (the medicine hop's maths); on water it bobs on the
      // net's wake. Then, as the broom leaves, a two-step shake-off.
      const near = Math.abs(point - sc.petX) / (0.14 * sw);
      const hopK = near < 1 && sweep < 1 ? Math.sin(Math.PI * (1 - near) / 2) : 0;
      const lift = sc.water ? Math.sin(t / 150) * 0.015 * sh * hopK : -0.07 * sh * hopK;
      s.pet.style.translate = `0 ${lift}px`;
      if (t >= 1800 && !sc.shook) {
        sc.shook = true;
        s.pet.classList.add("rock2");
        setTimeout(() => s.pet.classList.remove("rock2"), 1300);
      }
      if (sc.dust) {
        // Dust kicks up behind it.
        this._sceneArt(s, sc.dust, sc.dustArt[Math.floor(t / 220) % sc.dustArt.length]);
        sc.dust.style.left = `${left - sc.dust.getBoundingClientRect().width * 0.55}px`;
        sc.dust.style.opacity = String(0.9 * ramp(60, 260) * (1 - ramp(1650, 2000)));
      }
      for (const { el, x } of sc.mess) {
        const k = Math.min(1, Math.max(0, (point - x) / (0.05 * sw)));
        el.style.opacity = String(1 - k);
        el.classList.toggle("scene-gone", k >= 1);
      }
      if (sc.murk) {
        // The water clears behind the net, with a soft edge.
        const p = Math.min(106, Math.max(-6, (point / sw) * 100));
        s.murk.style.maskImage = `linear-gradient(90deg, transparent ${p - 6}%, #000 ${p + 6}%)`;
      }
      if (sc.bubbles) {
        // Then bubbles rise where the water was cleared.
        const k = ramp(1600, 2300);
        this._sceneArt(s, sc.bubbles, sc.bubbleArt[Math.floor(t / 200) % sc.bubbleArt.length]);
        sc.bubbles.style.left = `${sw * 0.62}px`;
        sc.bubbles.style.translate = `0 ${-0.35 * sh * k}px`;
        sc.bubbles.style.opacity = String(k > 0 ? 1 - ramp(2000, 2300) : 0);
      }
      if (t >= 1800 && !sc.shone) {
        sc.shone = true;
        const prop = s.species.props?.clean;
        if (prop) {
          this._show(s, s.prop, prop);
          s.propUntil = Date.now() + 1500;
        }
        this._sparkle(s);
      }
      if (t >= 1800) frames = this._actPose(s.species, s.drawn, s.speciesId, "splash", () => {}) || sc.cheer;
    }
    sc.frames = frames;
    const shown = frames || s.frames;
    if (shown?.length) this._show(s, s.pet, shown[Math.floor(t / 300) % shown.length]);
  }

  // End it, wherever it got to, and draw the pet as it is now.
  _sceneEnd(s, { quiet = false } = {}) {
    const sc = s.scene;
    if (!sc) return;
    cancelAnimationFrame(sc.raf);
    s.scene = null;
    this._patSync(s);
    s.screen.removeEventListener("click", sc.stop, true);
    sc.els.forEach((el) => el.remove());
    for (const el of [s.pet, s.perch]) el.style.translate = el.style.rotate = el.style.transition = "";
    for (const el of s.poops) {
      el.style.opacity = "";
      el.classList.remove("scene-gone");
    }
    if (sc.murk) {
      // What the net cleared stays clear: no fading back in from the held murk.
      s.murk.style.transition = "none";
      s.murk.style.opacity = "0";
      s.murk.style.maskImage = "";
      setTimeout(() => { s.murk.style.transition = ""; }, 50);
    }
    // The server's answer may come after this: it's shown, not acted again.
    if (!sc.answered) s.sceneOwes = { kind: sc.kind, until: Date.now() + 10000 };
    s.frame = 0;
    if (!quiet) this._redraw(s);
    if (!quiet && sc.answered && sc.kind === "medicine") this._allBetter(s, true); // the cheer is over
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

