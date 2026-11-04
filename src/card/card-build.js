class HatchPetCardBuild extends HatchPetCardBase {
  // --- Building --------------------------------------------------------------

  _build() {
    this._sharedSeen = sharedScreen(); // what the card last saw (connectedCallback)
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${STYLE}${SCENE_STYLE}</style>${MONO_FILTER}
      <ha-card>
        <div class="head">
          <div><div class="title-row"><img class="emblem" alt=""><div class="title"></div></div>
            <div class="sub"></div>
            <button class="wlink addpet" hidden>${SETUP_COPY.addPet}</button></div>
          <div class="chips">
            <button class="statusbtn" aria-pressed="false">${pixelIcon("icon_status", 24)}<span>Status</span></button>
          </div>
        </div>
        <div class="viewport"><div class="ground"></div>
          <img class="deco left" alt=""><img class="deco right" alt="">
          <div class="track"></div></div>
        <div class="foot">
          <button class="nav prev" aria-label="Previous device">${icon("prev", 20)}</button>
          <div class="dots"></div>
          <button class="nav next" aria-label="Next device">${icon("next", 20)}</button>
        </div>
      </ha-card>`;
    this._card = root.querySelector("ha-card");
    this._syncTheme();
    this._card.classList.toggle("lcd-on", lcdOn());
    // The device-alive director (slice 3B): the server clock for the cues, the device clock for the
    // slides' own timers, and one timer through setTimeout (the card's _tick also calls tick()).
    this._director = HATCH_DIRECTOR.create({
      now: serverNow, deviceNow: Date.now, trusted: serverClockKnown,
      canRender: (s) => lcdOn() && this._dirShown(s),
      scopeOf: (s) => s.ids?.["sensor.life_stage"] || "", // the pet: a seen echo is remembered past this element (s2848 B4)
      schedule: (ms, fn) => {
        const timer = setTimeout(fn, ms);
        return () => clearTimeout(timer);
      },
      recipes: HATCH_DEVICE_FX.RECIPES,
    });
    this._card.classList.toggle("mono", monoOn());
    this._card.classList.toggle("bigtext", bigOn());
    // The shell hardware's art: ui/shell_<part>.png, drawn by art/shell-parts/make_parts.py (see REQUEST.md there).
    const ui = (name) => `url("${BASE}/ui/${name}.png?v=${VERSION}")`;
    for (const k of ["screw", "slot", "stripes", "fleck", "glare", "logo", "plate", "battery", "light_on", "light_off"])
      this._card.style.setProperty(`--hw-${k.replace("_", "-")}`, ui(`shell_${k}`));
    this._card.style.setProperty("--hw-bulb", ui("backlight_bulb"));
    this._card.style.setProperty("--glitter", glitterTile());
    for (const [k, v] of printTiles()) this._card.style.setProperty(k, v);
    this._viewport = root.querySelector(".viewport");
    this._track = root.querySelector(".track");
    // Once a slide comes to rest, its shell's parts are put back on whole device pixels.
    this._track.addEventListener("transitionend", (e) => {
      const s = this._slides[this._index];
      if (s?.px && (e.target === this._track || e.target === s.el)) this._mould(s);
    });
    this._dots = root.querySelector(".dots");
    root.querySelector(".addpet").addEventListener("click", (e) => {
      this._tapped(e.currentTarget);
      goHA(ADD_PET_PATH);
    });
    root.querySelector(".statusbtn").addEventListener("click", () => {
      const s = this._slides[this._index];
      if (s) {
        this._tapped(root.querySelector(".statusbtn"));
        this._toggleStatus(s);
      }
    });
    root.querySelector(".prev").addEventListener("click", (e) => {
      this._tapped(e.currentTarget);
      this._go(this._index - 1);
    });
    root.querySelector(".next").addEventListener("click", (e) => {
      this._tapped(e.currentTarget);
      this._go(this._index + 1);
    });
    let startX = null;
    let startY = 0;
    this._viewport.addEventListener("pointerdown", (e) => {
      startX = e.clientX;
      startY = e.clientY;
      this._swiped = false;
    });
    this._viewport.addEventListener("pointerup", (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      startX = null;
      // A swipe is mostly sideways: a mostly vertical drag is someone reading or selecting (UX fix 2, F6).
      if (Math.abs(dx) > 40 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
        this._swiped = true;
        this._go(this._index + (dx < 0 ? 1 : -1));
      }
    });
    document.addEventListener("visibilitychange", this._onHidden);
    // iOS locks audio again after a reload until a tap: any tap unlocks it
    // (the end of a touch counts as a gesture there, its start doesn't).
    const unlock = () => {
      if (!soundsOn()) return; // babble needs sounds here too
      try {
        unlockAudio();
      } catch (err) {
        // no WebAudio
      }
    };
    for (const type of ["touchend", "pointerup", "click"]) this._card.addEventListener(type, unlock, true);
    // Someone is watching (gaps-seams 5a): a tap or swipe; the first after a gap starts a look.
    this._card.addEventListener("pointerdown", () => {
      const now = Date.now();
      if (!this._touchedAt || now - this._touchedAt >= LINK_TOUCHED_MS) this._lookAt = now;
      this._touchedAt = now;
    }, true);
    this._resize = new ResizeObserver(() => this._layout());
    this._resize.observe(this._viewport);
    this._visible = true;
    this._io = new IntersectionObserver((entries) => {
      this._visible = entries.some((e) => e.isIntersecting);
      this._card.classList.toggle("offscreen", !this._visible); // pauses the loops
      if (!this._visible) this._slides.forEach((x) => this._stopTyping(x));
      if (!this._visible) this._dirPause();
      else this._dirView(this._slides[this._index]); // in view: the first view's echo, or just the ambience
      if (this._visible && this._dirty) this._update(); // catch up on what was skipped
    });
    this._io.observe(this._card);
    this._slides = [];
  }

  _buildSlide() {
    const slide = document.createElement("div");
    slide.className = "slide";
    slide.innerHTML = `
      <div class="device">
        <div class="roof"><i class="mould"></i></div><div class="crescent"><i class="mould"></i></div><div class="loop"><i class="mould"></i></div><div class="lid"><i class="mould"></i><span></span><span></span><span></span></div>
        <div class="body"><i class="mould"></i>
          <i class="hw screws"></i><i class="hw glare"></i>
          <i class="hw grille left"></i><i class="hw grille right"></i><i class="hw logo"></i><i class="hw emblem"></i><i class="hw battery"></i>
          <i class="hw flecks a"></i><i class="hw flecks b"></i><i class="hw flecks c"></i>
          <img class="trim-top" alt=""><img class="trim-top2" alt="">
          <span class="label"></span>
          <div class="bezel"><i class="hw guts"></i><i class="mould"></i><i class="hw stripes"></i><i class="hw light"></i><i class="hw rim" aria-hidden="true"><b></b><b></b><b></b></i><div class="screen">
            <img class="bg" alt="">
            <img class="awaysign" alt=""><div class="awaylabel"></div>
            <div class="season"></div>
            <img class="poop p0" alt="mess"><img class="poop p1" alt="mess"><img class="poop p2" alt="mess">
            <img class="perch" alt="">
            <img class="ghost" alt="">
            <img class="pet" alt="">
            <div class="drape" hidden><img alt=""></div>
            <img class="prop" alt="">
            <img class="murk" alt="">
            <div class="rain"></div>
            <div class="flash"></div>
            <div class="breeze"><span></span><span></span><span></span></div>
            <div class="lcd"></div>
            <div class="glow"></div>
            <i class="hw glass" aria-hidden="true"><b></b><b></b><b></b><b></b><b></b><b></b><b></b><u class="mark"></u></i>
            <img class="attention" alt="wants attention">
            <div class="bubble"></div>
            <div class="sr" role="status"></div>
            <button class="pat" type="button" hidden></button>
            <button class="basket" type="button" aria-label="the basket" hidden><img alt=""></button>
            <div class="game" hidden>
              <div class="gpick" role="group" aria-label="Pick a game">${GAMES.map((g) =>
                `<button data-game="${g.key}">${g.label}</button>`).join("")}</div>
              <img class="gprop" alt="" hidden>
              <span class="gnum" aria-live="polite" hidden></span>
              <button class="gl" aria-label="Guess left">${icon("prev", 22)}</button>
              <span class="gscore" aria-live="polite"></span>
              <button class="gr" aria-label="Guess right">${icon("next", 22)}</button>
              <button class="gx" aria-label="Stop the game">✕</button>
            </div>
            <div class="status" tabindex="-1"></div>
            <i class="batt" data-level="1" aria-hidden="true" hidden><b></b><b></b><b></b></i>
            <button class="boot" hidden><span class="logo"><span class="ink">HATCH</span><span class="fill" aria-hidden="true">HATCH</span></span><span class="go">▶ tap to start</span></button>
          </div><div class="mono-grid"></div><button class="request"></button></div>
          <div class="buttons"></div>
          <img class="trim-corner left" alt=""><img class="trim-corner right" alt="">
        </div>
        <div class="feet"><span><i class="mould"></i></span><span><i class="mould"></i></span></div>
      </div>`;
    const q = (sel) => slide.querySelector(sel);
    const s = {
      el: slide, device: q(".device"), label: q(".label"), screen: q(".screen"), bg: q(".bg"),
      awaysign: q(".awaysign"), awaylabel: q(".awaylabel"), pet: q(".pet"), prop: q(".prop"),
      perch: q(".perch"), drape: q(".drape"), drapeImg: q(".drape img"), ghost: q(".ghost"), monoGrid: q(".mono-grid"), pat: q(".pat"),
      attention: q(".attention"), bubble: q(".bubble"), status: q(".status"),
      poops: [...slide.querySelectorAll(".poop")], murk: q(".murk"), buttons: {}, frame: 0,
      request: q(".request"), gameBox: q(".game"), gameScore: q(".gscore"), gameNum: q(".gnum"),
      propEl: q(".gprop"), live: q(".sr[role=status]"), seasonBox: q(".season"),
      basket: q(".basket"), glass: q(".glass"), mark: q(".glass .mark"), rim: q(".rim"),
    };
    // The glass effect ends with its own clock, the glass's `dir-glass-life` (the director's watchdog is
    // the backstop). The listener filters (F11): `animationend` bubbles, and the layers inside the glass
    // (frost, fog, a drop) and any ambience animation end on their own, so only the glass's own life
    // releases. The token is the one the recipe's start left on the slide, so a stale end does nothing.
    s.glass.addEventListener("animationend", (e) => {
      if (e.target === s.glass && e.animationName === "dir-glass-life" && s.dirEffect) this._director?.release(s, s.dirEffect);
    });
    // The rare glass mark (slice 6) ends on its own clock, `dir-mark-life` on the mark element. It is no lease,
    // so a mark ending releases nothing, and the glass listener above (e.target === s.glass) never hears it.
    s.mark.addEventListener("animationend", (e) => {
      if (e.target === s.mark && e.animationName === "dir-mark-life") this._markEnd(s);
    });
    // The rim cue (3C) ends the same way, on its own layer's clock: the rim's `dir-rim-life` runs as long
    // as the lease, and the lamps inside it are shorter, so their ends (which bubble) do not release it.
    s.rim.addEventListener("animationend", (e) => {
      if (e.target === s.rim && e.animationName === "dir-rim-life" && s.dirEffect) this._director?.release(s, s.dirEffect);
    });
    // The LCD grid: one cell per world art pixel, measured on the screen itself
    // (its width depends on the shell's padding as well as the slide's).
    s.lcdSize = new ResizeObserver(() => this._lcdPitch(s));
    s.lcdSize.observe(s.screen);
    s.lcdSize.observe(q(".body")); // and the shell is cut again when it changes size
    // The backlight: a real button on the shell (each shape has its spot, see
    // _renderSlide). Card only: it lights the screen and nothing else.
    s.backlight = document.createElement("button");
    s.backlight.className = "backlight";
    s.backlight.setAttribute("aria-label", "Backlight");
    s.backlight.title = "Light up the screen";
    s.backlight.addEventListener("click", (e) => {
      if (s !== this._slides[this._index]) return; // a neighbour's: the tap brings it forward
      e.stopPropagation();
      this._backlight(s);
    });
    slide.querySelectorAll("img").forEach((img) => img.addEventListener("error", () => {
      const src = img.getAttribute("src");
      if (src && !WARNED.has(src)) {
        WARNED.add(src);
        console.warn("hatch-pet-card: missing sprite", src);
      }
    }));
    // The perch moves where the pet moves (wandering, the game) and grows with it;
    // so does the ghost, a beat behind (see _ghostTrail).
    const PERCH_MOVES = ["wander-l", "wander-r", "go-left", "go-right"];
    new MutationObserver(() => {
      const moved = PERCH_MOVES.some((c) => s.ghost.classList.contains(c) !== s.pet.classList.contains(c));
      for (const c of PERCH_MOVES) {
        s.perch.classList.toggle(c, s.pet.classList.contains(c));
        s.ghost.classList.toggle(c, s.pet.classList.contains(c));
        s.pat.classList.toggle(c, s.pet.classList.contains(c));
      }
      s.ghost.classList.toggle("look", s.pet.classList.contains("look")); // a turned wander's trace is turned
      s.perch.style.scale = s.ghost.style.scale = s.pat.style.scale = s.pet.style.scale;
      s.screen.style.setProperty("--k", s.pet.style.scale || 1); // go-left / go-right stop at the edge
      if (moved) this._ghostTrail(s);
      this._drapeMirror(s);
    }).observe(s.pet, { attributes: true, attributeFilter: ["class", "style"] });
    // What the pet says to someone (a refusal, a game's result, a moment) is read
    // out by screen readers; its idle chatter isn't. Only the pet on show.
    new MutationObserver(() => {
      if (s.plain !== undefined && s.bubble.textContent === s.plain) return; // _speak announced it
      const text = spoken(s.bubble.textContent);
      if (s.sayUntil && s === this._slides[this._index] && text && s.live.textContent !== text) {
        s.live.textContent = text;
      }
    }).observe(s.bubble, { childList: true, characterData: true, subtree: true });
    // A pat (PR 3b): a tap on the pet itself, card only. A tap beside it still opens the status.
    s.pat.addEventListener("click", (e) => this._pat(s, e));
    // The basket (visitors v2 §3): its own button, never a pat, never the status.
    s.basket.addEventListener("click", (e) => this._basketTap(s, e));
    // The CSS hides it at once for a game, a question or the status; if it had focus,
    // that goes to the Status button rather than to the page.
    s.pat.addEventListener("focusout", (e) => {
      if (!e.relatedTarget && !this._patOn(s)) this._card?.querySelector(".statusbtn")?.focus();
    });
    // Taps on the game mustn't reach the screen behind (which opens the status).
    s.gameBox.addEventListener("click", (e) => e.stopPropagation());
    s.gameBox.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && s.game) this._quitGame(s, this._quitLine(s));
    });
    // The settings sheet and its picker keep the player's place (UX fix 1, F1/F2): a tap
    // that misses a button (a label, a gap, a note) must not fall through to the screen's
    // "tap = Status". The Status chip, "‹ settings" and Escape are the ways out.
    // The journal, finds and every-world pages are deeper pages and keep it the same way
    // (UX fix 2, F1): a tap on a tile or a heading is not a tap on the screen.
    s.status.addEventListener("click", (e) => {
      if ((s.settings || s.journal || s.finds || s.everyWorld || s.nameSheet) && !s.laySheet) e.stopPropagation();
    });
    // Escape steps back one page, like the back link (UX fix 2, F4): a sheet or picker to
    // where it came from, every world and finds to the journal, the journal to the status,
    // and the status closes with focus on its chip. The lay sheet keeps its own way out.
    s.status.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || s.laySheet) return;
      e.preventDefault();
      if (s.nameSheet) { // "keep", whichever control has the focus
        this._nameKeep(s);
        return;
      }
      const back = s.status.querySelector(".sback");
      if (back && (s.settings || s.journal || s.finds || s.everyWorld)) {
        back.click(); // back from the picker, the sheet (F8) or a journal page
        return;
      }
      this._toggleStatus(s);
      this._card.querySelector(".statusbtn")?.focus({ preventScroll: true });
    });
    q(".gl").addEventListener("click", () => this._guess(s, "left"));
    q(".gr").addEventListener("click", () => this._guess(s, "right"));
    q(".gx").addEventListener("click", (e) => {
      this._tapped(e.currentTarget, s);
      this._quitGame(s, this._quitLine(s));
    });
    q(".gpick").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-game]");
      if (b) {
        this._tapped(b, s);
        this._pickGame(s, b.dataset.game);
      }
    });
    s.request.addEventListener("click", () => {
      const key = s.request.dataset.key;
      if (!key) return;
      // With a choice of two or more creatures, laying goes through the lay sheet (S2).
      if (key === "lay_egg" && (this._eggOffer(s)?.offered.length || 0) >= 2) {
        this._tapped(s.request, s);
        this._openLay(s);
        return;
      }
      if (key === "lay_egg") this._tapped(s.request, s);
      if (key === "lay_egg") {
        const armed = confirmArmed(s, key);
        if (!this._confirmed(s, key, s.request, () => this._redraw(s))) {
          // The pet itself answers the first tap (F12); the pill keeps "sure? tap again".
          if (!armed) {
            this._line(s, MINE, TALK_COPY.layArmed, 4000);
            this._animate(s, s.pet, "perk", 320);
          }
          return;
        }
      }
      this._press(s, key);
    });
    // The boot screen takes the tap (a button, so a key works too) and nothing under it.
    s.batt = q(".batt");
    s.boot = q(".boot");
    s.boot.hidden = !this._booting;
    s.boot.addEventListener("click", (e) => {
      e.stopPropagation();
      this._bootEnd(true);
    });
    // A tap on the screen is a shortcut for the Status button; it holds buttons of its
    // own (the game, the bell, the journal), so it isn't a button itself.
    s.screen.addEventListener("click", () => {
      // A game on show keeps its screen: a stray tap must not end it unseen (the
      // Status button still does, on purpose).
      if (s.game) return;
      // A tap on a visit in progress is a pat on the host, not the Status button: it
      // would end the hello (UX8 F1).
      if (s.linking) {
        if (!this._swiped) this._perk(s);
        return;
      }
      // A question's chips take no stray tap (F3); a tap right after an answer is its
      // double tap, not the Status button (F2), so the pet's reply is seen.
      if (this._questionOn(s) || Date.now() - (s.answeredAt || 0) < CONFIRM_GAP_MS) return;
      if (!this._swiped) {
        this._tapped(this._card.querySelector(".statusbtn"));
        this._toggleStatus(s);
      }
    });
    // The device beside the current one is inert; tapping it brings it forward.
    slide.addEventListener("click", () => {
      const i = this._slides.indexOf(s);
      if (i !== this._index && !this._swiped) this._go(i);
    });
    const box = q(".buttons");
    for (const action of ACTIONS) {
      const b = document.createElement("button");
      b.className = "toy";
      b.dataset.action = action.key; // the cap's rebound curve (style.js)
      b.innerHTML = `<span class="cap">${pixelIcon(ACTION_ICONS[action.key])}</span><span>${action.label}</span>`;
      if (action.aria) b.setAttribute("aria-label", action.aria);
      b.addEventListener("click", () =>
        action.key === "play" ? this._startGame(s, b) : this._press(s, action.key));
      box.append(b);
      s.buttons[action.key] = b;
    }
    const lights = document.createElement("button");
    lights.className = "toy";
    lights.dataset.action = "lights";
    lights.innerHTML = `<span class="cap"></span><span class="lbl"></span>`;
    lights.addEventListener("click", () => this._toggleLights(s));
    box.append(lights);
    s.buttons.lights = lights;
    this._track.append(slide);
    return s;
  }

  // --- Low battery after an HA restart ---------------------------------------

  // The channel's house view carries the server's last power-on (`at`), or
  // nothing (no news: the stored marker is never cleared). Compared with this
  // browser's marker for the pet in one synchronous step, so of two slides or
  // tabs only one finds it new. A browser with no marker only stores it.
  _powerNews(s) {
    const at = s.house?.powered_on?.at;
    const t = Date.parse(at);
    const device = s.ids?.device;
    if (!at || Number.isNaN(t) || !device) return;
    let seen = null;
    try {
      seen = localStorage.getItem(POWER_KEY + device);
      if (seen !== null && t <= Date.parse(seen)) return;
      localStorage.setItem(POWER_KEY + device, at);
    } catch (err) {
      return; // no storage: no gag
    }
    if (seen === null || serverNow() - t >= POWER_FRESH_MS) return;
    s.powerPending = at;
  }

  // Once the pet on show is awake and free, the gag plays; an asleep pet waits
  // (at most POWER_DEFER_MS from the boot). A call or a game cuts it short.
  _powerTick(s) {
    if (s.power && (s.asleep || s.calling || s.game)) this._powerEnd(s, true);
    if (!s.powerPending || s.power) return;
    if (serverNow() - Date.parse(s.powerPending) >= POWER_DEFER_MS) {
      s.powerPending = null;
      return;
    }
    if (this._booting || s.asleep || s.calling || s.game || s.scene || s.linking || !s.species ||
        this._eggMinutes(this._state(s, "sensor.life_stage")) !== null ||
        s.screen.classList.contains("show-status") || !this._visible || document.hidden) return;
    s.powerPending = null;
    this._powerGag(s);
  }

  _powerGag(s) {
    const isCalm = calm();
    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    s.power = { timers };
    this._patSync(s, true); // no pat over the gag
    const level = (n, blink) => {
      s.batt.dataset.level = String(n);
      s.batt.classList.toggle("blink", blink && !isCalm);
    };
    const sp = s.species;
    if (sp?.moods?.includes("sleepy") && s.drawn) {
      s.poseFrames = [];
      for (let i = 1; i <= (sp.frames || 1); i++) s.poseFrames.push(`${s.drawn}_sleepy_${i}`);
      s.poseUntil = Date.now() + 2200;
      this._show(s, s.pet, s.poseFrames[0]);
    }
    level(1, true);
    s.batt.hidden = false;
    if (!isCalm) {
      for (const t of [0, 160]) {
        at(t, () => s.screen.classList.add("blank"));
        at(t + 80, () => s.screen.classList.remove("blank"));
      }
    }
    at(0, () => this._speak(s, pick(POWER_LINES.low), 2000));
    at(2200, () => {
      if (s.calling || s.game || s.asleep) return this._powerEnd(s, true);
      s.poseUntil = 0;
      if (!isCalm) level(3, false);
      this._speak(s, pick(POWER_LINES.back), 1800);
      this._animate(s, s.pet, "perk", 320);
    });
    at(4200, () => this._powerEnd(s, false));
  }

  // The gag over, or cut short: the battery goes, and so do lines not yet said.
  _powerEnd(s, abort = true) {
    const power = s.power;
    if (!power) return;
    s.power = null;
    this._patSync(s);
    power.timers.forEach(clearTimeout);
    s.screen.classList.remove("blank");
    s.batt.hidden = true;
    s.poseUntil = 0;
    if (abort) { // cut short: the line in the bubble goes; a finished gag leaves its last line to run out
      this._stopTyping(s);
      s.sayUntil = 0;
    }
  }

  // --- Power-on --------------------------------------------------------------

  _bootStart() {
    this._booting = true;
    this._card.classList.add("booting");
    this._slides.forEach((x) => { x.boot.hidden = false; });
    this._bootTimer = setTimeout(() => this._bootEnd(false), BOOT_WAIT_MS);
  }

  // A tap ends it with the beep (if this browser has sounds on and the pet may
  // make one); no tap for BOOT_WAIT_MS ends it silently. The logo fills in, then
  // the screen cuts to the pet.
  _bootEnd(tapped) {
    if (!this._booting || this._bootEnding) return;
    this._bootEnding = true;
    clearTimeout(this._bootTimer);
    if (tapped) {
      try {
        unlockAudio();
      } catch (err) {
        // no WebAudio
      }
      this._chirp(this._slides[this._index], "boot");
    }
    const finish = () => {
      this._booting = false;
      this._bootEnding = false;
      this._card.classList.remove("booting");
      this._dirView(this._slides[this._index]); // the power-on screen was the only thing in the way
      this._slides.forEach((x) => {
        x.boot.hidden = true;
        x.boot.classList.remove("filling");
      });
      // The channel's moments that came in meanwhile, said now.
      this._slides.forEach((x) => {
        const held = x.bootMoments || [];
        x.bootMoments = [];
        held.forEach((m) => this._moment(x, m));
      });
    };
    if (calm()) {
      finish();
      return;
    }
    this._slides.forEach((x) => x.boot.classList.add("filling"));
    setTimeout(finish, BOOT_FILL_MS);
  }

  // --- Updating --------------------------------------------------------------

  async _update() {
    if (!this._hass || !this._config) return;
    if (!this.shadowRoot) this._build();
    const devices = this._devices();
    const sig = JSON.stringify(devices.map((ids) => Object.keys(ids).map((k) =>
      k === "device"
        ? [ids[k], this._hass.devices?.[ids[k]]?.name_by_user, this._hass.devices?.[ids[k]]?.name]
        : this._hass.states[ids[k]]?.last_updated))) +
      (this._hass.states["sun.sun"]?.state || "");
    if (sig === this._sig) return;
    if (this._visible === false) {
      this._dirty = true; // scrolled away: draw when it's back (the observer calls)
      return;
    }
    this._dirty = false;
    this._sig = sig;

    if (!devices.length) {
      const configured = [].concat(
        this._config.entities || [], this._config.entity || [], this._config.devices || []).length;
      // No pets yet: the first world's toy, empty, with an egg's silhouette on its screen (F5).
      const keep = !configured && this._slides.length === 1 && this._slides[0].empty;
      if (!keep) while (this._slides.length) this._dropSlide(this._slides.pop());
      this._card.classList.add("single");
      this._card.querySelector(".chips").style.display = "none";
      this._card.querySelector(".title").textContent = configured ? "Pet not found" : "No pets yet";
      // Plain card text, not the pet's voice (F6): who can add a pet, and no "entities".
      this._card.querySelector(".head .sub").textContent = configured
        ? "The pets this card shows aren't here any more. Edit the card to pick them again."
        : this._hass.user?.is_admin === false
          ? "Ask whoever runs Home Assistant to add a pet."
          : "Add the Hatch at Home integration to hatch one.";
      // An admin with nothing configured gets a way to the add-integration dialog (S4, N19).
      this._card.querySelector(".addpet").hidden = configured || this._hass.user?.is_admin !== true;
      if (configured) {
        this._emptyToken = null;
      } else if (keep) {
        this._renderSlide(this._slides[0]);
        this._renderShelf();
      } else {
        this._emptyDevice();
      }
      return;
    }
    this._emptyToken = null;
    this._card.querySelector(".addpet").hidden = true;
    if (this._slides[0]?.empty) this._dropSlide(this._slides.pop()); // a pet moved in
    let worlds;
    if (!this._slides.length) this._waiting("Hatch at Home"); // worlds.json pending: not a blank card (F11)
    try {
      worlds = await loadJson("worlds.json");
    } catch (err) {
      this._sig = null; // try again on the next update
      this._waiting("Hatch at Home");
      return;
    }
    this._worlds = worlds; // every world's (a find, its art and lines, is its own world's)
    // Every pet is still reloading and none has shown yet: its world is unknown, so no slide
    // is drawn (not the first world's) until the stage has one. The card keeps its title.
    if (devices.every((d, i) => !this._slides[i]?.world &&
        GONE_STATES.has(this._hass.states[d["sensor.life_stage"]]?.state))) {
      this._waiting("Hatch at Home");
      return;
    }
    this._card.querySelector(".chips").style.display = "";
    while (this._slides.length < devices.length) this._slides.push(this._buildSlide());
    while (this._slides.length > devices.length) this._dropSlide(this._slides.pop());
    if (!this._bootChecked) {
      this._bootChecked = true;
      if (claimBoot()) this._bootStart();
    }
    if (!this._shelfRestored) { // the pet that was on show before a reload (UX fix 2, F8)
      this._shelfRestored = true;
      this._openFrom = Date.now();
      // The pet this person opens on (favourite §5.3) beats the shelf, unless they swiped in this
      // browser session (a view switch brings the card back where they were; FM, audit s2748).
      const open = shelfSwiped(devices) ? null : openOnRead(this._openKey());
      let at = open ? devices.findIndex((d) => d.device === open) : -1;
      this._openedOn = at >= 0;
      if (at < 0) at = devices.findIndex((d) => d.device === shelfRead(devices));
      if (at > 0) this._index = at;
    }
    this._index = Math.min(this._index, devices.length - 1);
    this._shelfDevices = devices.map((d) => d.device);

    for (let i = 0; i < devices.length; i++) {
      const s = this._slides[i];
      if (s.ids && s.ids.device !== devices[i].device) {
        this._forget(s); // another pet now
        s.worldKey = null;
      }
      s.ids = devices[i];
      this._subscribe(s); // its private channel (once: a no-op after that)
      const stage = this._state(s, "sensor.life_stage");
      s.reloading = GONE_STATES.has(stage?.state); // reloading or restarting: no attributes (UX fix 4, F1)
      // A state with no world keeps the slide's last one (a reload must not move the pet home).
      s.worldKey = worlds[stage?.attributes.world] ? stage.attributes.world : (s.worldKey || Object.keys(worlds)[0]);
      s.world = worlds[s.worldKey];
      const roster = stage?.attributes.roster || [];
      // An egg is always drawn as its world's egg (the first species on the roster).
      const speciesId = (stage?.state === "egg" && roster[0]) || stage?.attributes.species || roster[0];
      if (speciesId && speciesId !== s.speciesId) {
        s.speciesId = speciesId;
        s.species = null;
        loadJson(`sprites/${speciesId}/species.json`).then((data) => {
          if (s.speciesId !== speciesId) return; // the slide moved on while this loaded
          s.species = data;
          this._sig = null;
          this._update();
        }).catch(() => {
          console.warn(`hatch-pet-card: missing sprites for ${speciesId}`); // the console, not the bubble (F11)
          if (s.speciesId === speciesId) s.speciesId = null; // try again on the next update
        });
      }
      // Only a slide whose own pet (or the sun) changed is drawn again.
      const own = Object.values(devices[i]).map((id) => this._hass.states[id]?.last_updated).join() +
        `|${this._hass.states["sun.sun"]?.state}|${s.species ? s.speciesId : ""}|${this._epoch || 0}` +
        `|${this._hass.devices?.[devices[i].device]?.name_by_user}|${this._hass.devices?.[devices[i].device]?.name}`;
      if (s.species && own !== s.drawnSig) {
        s.drawnSig = own;
        try {
          this._renderSlide(s);
        } catch (err) {
          console.error("hatch-pet-card: could not draw", s.speciesId, err);
        }
      }
    }
    this._card.classList.toggle("single", devices.length < 2);
    this._renderShelf();
    this._newNeighbour(devices);
  }

  // A pet that moved in while this browser wasn't looking, or while the card was open (UX fix 4, F4):
  // the pet on show says so once. The devices this browser has seen on a shelf are kept
  // (the first time ever is only noted, so a new browser doesn't announce every pet). Only a
  // newcomer still in its egg counts, and never to itself.
  _newNeighbour(devices) {
    let known = null;
    try {
      known = JSON.parse(localStorage.getItem(KNOWN_KEY) || "null");
    } catch (err) {
      return; // no storage: nothing to compare with
    }
    const ids = devices.map((d) => d.device);
    const fresh = Array.isArray(known) ? ids.filter((id) => !known.includes(id)) : [];
    if (fresh.length || !Array.isArray(known)) {
      try {
        localStorage.setItem(KNOWN_KEY, JSON.stringify([...new Set([...(known || []), ...ids])].slice(-60)));
      } catch (err) {
        return;
      }
    }
    const on = this._slides[this._index];
    const eggs = fresh.some((id) => id !== on?.ids?.device &&
      this._hass.states[devices[ids.indexOf(id)]["sensor.life_stage"]]?.state === "egg");
    if (eggs && on && !on.reloading) this._queue(on, NEIGHBOUR_LINE, 4500, { type: "neighbour" }); // kept: said when the pet is free
  }

  // The empty card's toy: the first world's own shell and room with its first creature's egg
  // drawn as a flat silhouette (the journal's "???" look), no buttons, nothing moving. It takes no
  // taps. It is drawn when its art has loaded, unless a pet has moved in or the card has changed.
  async _emptyDevice() {
    const token = (this._emptyToken = {});
    let world;
    let worldKey;
    let species;
    let id;
    try {
      const worlds = await loadJson("worlds.json");
      worldKey = Object.keys(worlds)[0];
      world = worlds[worldKey];
      id = world.roster[0];
      species = await loadJson(`sprites/${id}/species.json`);
    } catch (err) {
      return; // the title and text stand alone
    }
    if (this._emptyToken !== token || this._slides.length) return;
    const s = this._buildSlide();
    s.empty = true;
    s.world = world;
    s.worldKey = worldKey;
    s.species = species;
    s.speciesId = id;
    s.el.classList.add("empty");
    this._slides.push(s);
    this._index = 0;
    this._renderSlide(s);
    this._renderShelf();
  }

  // Nothing to draw yet (worlds.json pending or failed, every pet reloading): the card's
  // title and no pet. With a pet on show it is left alone.
  _waiting(title) {
    if (this._slides.length) return;
    this._card.classList.add("single");
    this._card.querySelector(".chips").style.display = "none";
    this._card.querySelector(".title").textContent = title;
    this._card.querySelector(".head .sub").textContent = "";
    this._card.querySelector(".addpet").hidden = true;
  }

  // Draw again now, though nothing in HA changed: one slide, or all of them.
  _redraw(s = null) {
    if (s) s.drawnSig = null;
    else this._epoch = (this._epoch || 0) + 1;
    this._sig = null;
    this._update();
  }

  _dropSlide(s) {
    this._forget(s); // its game, timers, photos and dialog go with it
    s.unsub?.();
    s.unsub = null;
    s.lcdSize?.disconnect();
    s.el.remove();
  }

  // A slide that now shows another pet starts fresh: nothing of the last
  // pet's (a game, an armed "sure?", the moments already seen) carries over.
  _forget(s) {
    if (s.game) this._endGame(s, null);
    this._sceneEnd(s, { quiet: true });
    s.sceneOwes = s.sceneFade = null;
    // The last pet's blanket: a landing timer must not draw it on this one, and a stale want must not
    // make a pet already tucked fall in on first sight.
    this._drapeStop(s);
    this._drapeHide(s);
    s.wasDrape = undefined;
    this._powerEnd(s);
    s.powerPending = null;
    this._stopTyping(s);
    s.voicedAt = 0;
    s.confirm = null;
    clearTimeout(s.confirmTimer);
    s.lastMoment = s.lastLogAt = undefined;
    s.greeted = false;
    s.excitedSince = 0;
    s.wasCalling = undefined; // a call already on doesn't chirp
    s.journal = false;
    s.finds = false;
    s.everyWorld = false;
    s.settings = false;
    s.settingsChanged = null;
    if (s.laySheet || s.nameSheet) { // another pet's slide: its lay sheet and name sheet go (S2, S3)
      s.laySheet = false;
      s.nameSheet = false;
      s.screen.classList.remove("show-status");
      s.statusOpen = false;
    }
    // Device-alive: another pet's glass, ring and first view are not this one's (the house view that
    // follows sets the ambient state again).
    this._director?.detach(s);
    s.dirViewed = false;
    s.dirRecent = null;
    s.dirEffect = 0;
    s.glass?.classList.remove(...HATCH_DEVICE_FX.CLASSES_BY_LAYER.ambient, ...HATCH_DEVICE_FX.CLASSES);
    this._markEnd(s, true); // the rare glass mark, its counter and its first view are not this pet's
    s.rim?.classList.remove(...HATCH_DEVICE_FX.RIM_CLASSES, ...HATCH_DEVICE_FX.CLASSES_BY_LAYER.rimAmbient);
    this._layDrop(s); // a lay waited for belongs to the last pet
    this._clearNameTimers(s);
    s.nameFrom = null;
    s.nameBusy = false;
    this._closePicker(s);
    this._shellSettled(s);
    s.statusHtml = null;
    s.drawnSig = null;
    // The last pet's private lines and question aren't this one's.
    this._clearAsk(s);
    s.queue = [];
    this._revealEnd(s);
    s.collecting = false; // a reply on its way is the last pet's: dropped
    s.visitedAt = 0;
    s.lookedFirst = false;
    s.giftAgain = false;
    s.wishDay = null;
    this._dropPhotos(s);
    this._dropGift(s);
    this._dropFinds(s);
    // Its other timers, and what each would have tidied away.
    clearTimeout(s.breezeTimer);
    s.screen?.classList.remove("breezy");
    clearTimeout(s.litTimer);
    s.screen?.classList.remove("lit");
    clearTimeout(s.flairTimer);
    s.screen?.querySelector(".flair")?.remove();
    clearTimeout(s.statusMessageTimer);
    const note = s.status?.querySelector(".status-feedback");
    if (note) { note.hidden = true; note.textContent = ""; }
    // The last pet's channel: nothing of it may open this one's first look
    // (its bond, its nickname, a wish aimed at the viewer). The server clock's
    // offset is the page's, not the pet's, so it stays.
    this._unsubscribe(s);
    this._resetChannel(s);
  }

  // What a slide knows from its channel, forgotten (a new pet, or a shared
  // screen asking again).
  _resetChannel(s) {
    s.mine = null;
    s.house = null;
    s.subscribed = false;
    s.subscribeFailed = false;
    s.privateSeen = new Set();
    s.mediaSeen = new Set();
    s.privateMoments = [];
    s.bootMoments = [];
    s.retries = 0;
    s.gone = false;
  }

  // Turning on "shared screen", here or in another card or tab: everything
  // personal on every slide goes, including a line still being typed out.
  _goShared() {
    this._sharedSeen = true;
    for (const slide of this._slides || []) {
      this._clearAsk(slide);
      slide.queue = [];
      this._dropPhotos(slide);
      this._dropGift(slide); // a take on its way is dropped unsaid; the pop goes
      this._dropFinds(slide); // the ♥ is the viewer's own: gone with the page
      this._stopTyping(slide); // writes the whole line in, so it's cleared after
      slide.bubble.textContent = "";
      slide.plain = undefined;
      slide.sayUntil = 0; // the next tick says the mood's line, which names nobody
      slide.live.textContent = "";
      slide.screen.querySelector(".bondhearts")?.remove();
      slide.screen.querySelector(".linkhearts")?.remove(); // a visit's, mid-way
      slide.screen.querySelector(".carehearts")?.remove();
      if (slide.laySheet) this._closeLay(slide); // the shared-screen switch closes the lay sheet (S2)
      if (slide.nameSheet) this._closeName(slide); // and the name sheet (S3)
      slide.journal = false;
      slide.finds = false; // the settings sheet stays, without its personal rows
      slide.everyWorld = false;
      this._closePicker(slide); // and without the picker (read-only here)
      slide.confirm = null; // an armed "forget" is a personal row
      slide.status.innerHTML = ""; // drawn again, without its personal rows
      slide.statusHtml = null;
      slide.drawnSig = null;
      slide.mine = null; // and the channel asked again, as a shared screen
      slide.bootMoments = []; // a held moment may be personal
      this._subscribe(slide, true);
    }
    this._redraw();
  }

  // Personal again: the status screens, and the channel asked again for the
  // viewer's own view (nothing else waits to come back).
  _goPersonal() {
    this._sharedSeen = false;
    for (const slide of this._slides || []) {
      if (slide.laySheet) this._closeLay(slide);
      if (slide.nameSheet) this._closeName(slide);
      this._dropFinds(slide); // the shared screen's page, read again with the viewer's own ♥
      if (slide.finds) this._loadFinds(slide);
      slide.statusHtml = null;
      slide.drawnSig = null;
      this._subscribe(slide, true);
    }
    this._redraw();
  }

  _onSharedEvent = (e) => {
    if (e.detail?.from === this) return; // the card that was tapped already did
    if (e.detail?.on) this._goShared();
    else this._goPersonal();
  };

  _onSharedStorage = (e) => {
    if (e.key !== SHARED_KEY) return;
    if (sharedScreen()) this._goShared();
    else this._goPersonal();
  };

  _onMono = () => {
    this._card?.classList.toggle("mono", monoOn());
    this._card?.classList.toggle("bigtext", bigOn());
    this._slides?.forEach((x) => { // an open sheet's row text and aria-pressed stay true
      if (x.screen.classList.contains("show-status") && !x.picker) this._renderStatus(x, this._state(x, "sensor.last_care")?.attributes.log || []);
    });
  };

  _onMonoStorage = (e) => {
    if (e.key === MONO_KEY || e.key === BIG_KEY || e.key === null) this._onMono(); // null: storage cleared
  };

  // Take an open question off the screen (a game, another pet on this slide).
  _clearAsk(s) {
    s.screen?.querySelector(".askday")?.remove();
    clearTimeout(s.askTimer);
    s.asking = false;
    if (s.queue) s.queue = s.queue.filter((q) => !q.ask); // a question only (a birthday line stays)
  }

  _state(s, key) {
    const id = s.ids?.[key];
    if (!id) return undefined;
    const held = s.scene?.held; // a care scene shows the pet as it was at the tap
    return held && key in held ? held[key] : this._hass.states[id];
  }

  _go(index, auto = false) { // auto: the opening pet's late move, not the player's swipe
    const n = this._slides.length;
    if (!n) return;
    this._userMoved = true; // a swipe, an arrow or a dot: the opening pet no longer moves the card
    const to = (index + n) % n;
    if (this._restOffer && this._restOffer.device !== this._slides[to]?.ids?.device) this._restOffer = null; // offered on the pet left
    this._slides.forEach((x, i) => {
      // A game stops on the slide being left: nobody plays it unseen.
      if (x.game && i !== to) this._quitGame(x, null);
      this._stopTyping(x);
      if (x.laySheet && i !== to) this._closeLay(x); // the lay sheet stays with its pet
      if (x.nameSheet && i !== to) this._closeName(x); // and so does the name sheet (S3)
      if (i !== to) this._layDrop(x); // a lay waited for belongs to the slide it was made on: no sheet opens off-screen
      this._sceneEnd(x); // a swipe ends a care scene, showing how things are now
      if (x.visitor && i !== to) { // a world visitor goes too, after a grace: a slip of the finger keeps it (UX8 F11)
        const V = x.visitor;
        setTimeout(() => {
          if (x.visitor === V && this._slides[this._index] !== x) this._visitorEnd(x);
        }, VISIT_SWIPE_GRACE_MS);
      }
      if (x.picker) { // and leaves the shell picker unsaved: the sheet again
        this._closePicker(x);
        if (x.screen.classList.contains("show-status")) this._renderStatus(x, this._state(x, "sensor.last_care")?.attributes.log || []);
      }
    });
    this._linkEnd(); // a swipe ends the visit at once
    this._index = to;
    this._slides.forEach((x, i) => {
      if (i !== to) {
        this._director?.cancel(x, "left", ["shellImpulse"]);
        this._markEnd(x); // a rare glass mark is not shown on a slide that is not on show; its counter stops (off-slide)
      }
    });
    this._dirView(this._slides[to]); // the glass on the slide that comes forward, and its first view's echo
    if (this._shelfRestored && this._shelfDevices) {
      shelfWrite(this._shelfDevices, to);
      if (!auto) shelfMark(this._shelfDevices);
    }
    this._renderShelf();
  }
}

