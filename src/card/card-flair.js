class HatchPetCard extends HatchPetCardLink {
  // --- Trait flair ----------------------------------------------------------

  _flairTick(s) {
    const now = Date.now();
    if (!s.nextFlair) s.nextFlair = now + 8000 + Math.random() * 12000;
    if (now < s.nextFlair) return;
    const [lo, hi] = FLAIR_EVERY_MS;
    s.nextFlair = now + lo + Math.random() * (hi - lo);
    if (this._free(s) || this._askOnly(s)) this._flair(s);
  }

  // One flair moment: each place shows one of the pet's traits there.
  // Returns the traits shown (card-check calls it directly).
  _flair(s, only = null) {
    const stage = this._state(s, "sensor.life_stage");
    const traits = (only ? [only] : stage?.attributes.traits || []).filter((t) => FLAIR[t]);
    if (!traits.length || !s.species || stage?.state === "egg") return [];
    const levels = stage.attributes.trait_levels || {};
    s.flairTurn = (s.flairTurn || 0) + 1;
    const shown = [];
    for (const place of ["head", "air", "ground"]) {
      const here = traits.filter((t) => FLAIR[t].place === place);
      if (here.length) shown.push(here[s.flairTurn % here.length]);
    }
    s.screen.querySelector(".flair")?.remove();
    const box = document.createElement("div");
    box.className = "flair";
    box.style.setProperty("--fl-ms", `${FLAIR_MS}ms`);
    const at = this._flairAnchors(s);
    for (const trait of shown) this._flairPieces(trait, levels[trait] || 1, at, box);
    s.screen.appendChild(box);
    s.flairUntil = Date.now() + FLAIR_MS;
    this._later(s, FLAIR_MS, () => box.remove(), { key: "flair", hidden: "tab", undo: () => box.remove() });
    return shown;
  }

  // Where the pet is on screen: its head point (species.json "head", per drawn
  // stage), the feet line (y=224 of every 256 px frame), and the scene's scale.
  _flairAnchors(s) {
    const r = s.pet.getBoundingClientRect();
    const sr = s.screen.getBoundingClientRect();
    const k = r.height / 256;
    const [hx, hy] = s.species.head?.[s.drawn] || [128, 96];
    return {
      hx: r.left - sr.left + hx * k, hy: r.top - sr.top + hy * k,
      cx: r.left - sr.left + 128 * k, fy: r.top - sr.top + 224 * k,
      half: r.width * 0.32, ks: sr.width / 512, width: sr.width,
    };
  }

  _flairPieces(trait, level, at, box) {
    const { hx, hy, cx, fy, half, ks } = at;
    const url = (n) => `${BASE}/ui/flair_${n}.png?v=${VERSION}`;
    const art = FLAIR[trait].art;
    const img = (variant) => art === "frames"
      ? `<img src="${url(`${trait}_1`)}" alt=""><img src="${url(`${trait}_2`)}" alt="">`
      : `<img src="${url(art === "pair" ? `${trait}_${variant}` : trait)}" alt="">`;
    const put = (x, y, cls, vars = {}, variant = 1) => {
      const el = document.createElement("div");
      el.className = `fx ${art === "frames" ? "frames " : ""}${cls}`;
      el.innerHTML = img(variant);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
      const first = el.querySelector("img");
      // Drawn at the scene's scale, like the props.
      first.addEventListener("load", () => { el.style.width = `${first.naturalWidth * ks}px`; });
      if (first.complete && first.naturalWidth) el.style.width = `${first.naturalWidth * ks}px`;
      box.appendChild(el);
      return el;
    };
    const n = (base) => base + level - 1; // deeper traits show a little more
    const px = (v) => `${Math.round(v)}px`;
    switch (trait) {
      case "storm_watcher":
      case "thunder_heart":
      case "early_bird":
        put(hx + (trait === "thunder_heart" ? 6 : 0), hy - 6 * ks, "bob", { "--d": "1.4s" });
        break;
      case "moon_child":
        put(hx, hy - 6 * ks, "bob", { "--d": "1.6s" }, 1);
        for (let i = 0; i < n(2); i++) {
          put(hx + (i % 2 ? 1 : -1) * (24 + i * 8) * ks, hy - (4 + (i % 3) * 14) * ks, "twinkle",
            { "--d": "1.3s", "--delay": `${-i * 0.4}s` }, 2);
        }
        break;
      case "music_lover":
        for (let i = 0; i < n(3); i++) {
          put(hx + (i % 2 ? 1 : -1) * (14 + i * 6) * ks, hy + 6 * ks, "float",
            { "--d": "2.6s", "--delay": `${-i * 0.8}s`, "--dx": px((i % 2 ? 16 : -14) * ks), "--rise": px(70 * ks) },
            (i % 2) + 1);
        }
        break;
      case "social_butterfly": {
        for (let i = 0; i < n(1); i++) {
          // Round one side of the pet and down to its feet; never over its
          // head, which is the head place's (a storm cloud, a moon...).
          const side = i % 2 ? -1 : 1;
          const mid = (hy + fy) / 2;
          const path = `path("M ${cx + side * half * 2.4} ${hy + 4 * ks} ` +
            `C ${cx + side * half * 1.5} ${hy - 26 * ks}, ${cx + side * half * 2.6} ${mid - 30 * ks}, ` +
            `${cx + side * half * 1.9} ${mid} S ${cx + side * half * 1.5} ${fy - 34 * ks}, ` +
            `${cx + side * half * 1.3} ${fy - 12 * ks}")`;
          put(0, 0, "loop", { "--d": `${FLAIR_MS - 400}ms`, "--delay": `${i * 0.5}s` }).style.offsetPath = path;
        }
        break;
      }
      case "snow_child":
        for (let i = 0; i < n(4); i++) {
          put(cx + (-1.6 + (i * 3.2) / Math.max(1, n(4) - 1)) * half, hy - 30 * ks, "fall",
            { "--d": "2.8s", "--delay": `${-i * 0.7}s`, "--dx": px((i % 2 ? 10 : -8) * ks), "--rise": px((fy - hy) + 20 * ks) },
            (i % 2) + 1);
        }
        break;
      case "breeze_rider":
        for (let i = 0; i < n(2); i++) {
          put(cx - half * 2, hy + (i * 22 - 10) * ks, "drift",
            { "--d": "2.4s", "--delay": `${-i * 1.1}s`, "--dx": px(half * 4), "--rise": px(18 * ks) });
        }
        break;
      case "night_owl":
        for (let i = 0; i < n(3); i++) {
          const a = (i / n(3)) * Math.PI * 2;
          put(cx + Math.cos(a) * half * 1.4, (hy + fy) / 2 + Math.sin(a) * 30 * ks, "twinkle",
            { "--d": "1.8s", "--delay": `${-i * 0.6}s` });
        }
        break;
      case "sun_lover":
        for (let i = 0; i < n(3); i++) {
          put(cx + (i % 2 ? 1 : -1) * half * (0.9 + i * 0.25), hy + (i * 18) * ks, "twinkle",
            { "--d": "1.2s", "--delay": `${-i * 0.4}s` });
        }
        break;
      case "fireside": {
        const glow = document.createElement("div");
        glow.className = "fx glow";
        Object.assign(glow.style, { left: px(cx), top: px(fy - 2 * ks), width: px(half * 3.2), height: px(30 * ks) });
        box.appendChild(glow);
        for (let i = 0; i < n(4); i++) {
          const side = i % 2 ? 1 : -1;
          put(cx + side * (half + (6 + (i % 3) * 8) * ks), fy - (i % 3) * 6 * ks, "float",
            { "--d": "2.4s", "--delay": `${-i * 0.5}s`, "--dx": px(side * (6 + i * 2) * ks), "--rise": px(80 * ks) },
            (i % 2) + 1);
        }
        break;
      }
      case "fog_wanderer":
        put(cx - half * 0.6, fy + 4 * ks, "drift", { "--d": "4.2s", "--dx": px(half * 1.2) });
        break;
      case "helper":
        put(cx + half * 1.35, fy + 2 * ks, "pop", { "--d": ".5s" });
        break;
      case "player":
        put(cx - half * 1.35, fy, "bounce", { "--d": ".45s" });
        break;
      case "homebody":
        put(cx - half * 1.3, fy + 4 * ks, "pop", { "--d": ".5s" });
        break;
      case "couch_potato":
        put(cx + half * 1.35, fy + 2 * ks, "pop", { "--d": ".5s" });
        break;
      default:
        break;
    }
  }

  // The player (or the card, moving off a game) ends a game: the server drops
  // it too, with no reward or penalty, or parks a Berry dig that has shown
  // something, so the next dig carries on. Every card-driven quit (✕, Escape,
  // a swipe, the status sheet, Play mid-game) comes here, so each one parks.
  // Fire and forget; a failed call is silent.
  // What a person's ✕ or Escape says: a dig that has shown something is parked, and says
  // so (F8); anything else is "maybe later!".
  _quitLine(s) {
    const g = s.game;
    return g?.kind === "dig" && (g.round || g.wins || g.basket) ? GAME_COPY.parked : "maybe later!";
  }

  _quitGame(s, line) {
    const kind = s.game?.kind;
    const id = s.ids?.["sensor.mood"];
    if (id && SERVER_GAMES.has(kind)) {
      try {
        Promise.resolve(this._hass.callService(
          "virtual_pet", "play_game", { entity_id: id, game: kind, end: true, ...digShared(kind) },
          undefined, false, true)).catch(() => {});
      } catch (err) { /* silent */ }
    }
    this._endGame(s, line);
  }

  _endGame(s, line) {
    s.gameBox.querySelector(".gwatch")?.remove(); // D-a's visitor goes with the game
    s.propEl.hidden = true;
    s.propEl.style.bottom = ""; // the dig's bee sits higher
    s.gameScore.classList.remove("two");
    s.gameNum.removeAttribute("aria-label"); // the dig's "n leaves left"
    this._hopEnd(s); // the board's grid, keys and observers (card-board.js)
    s.game = null;
    this._stop(s, { group: "game" }); // every delayed step and the flip swap
    // Focus inside the overlay (the picker, the close button) goes back to the play button, not the page's
    // start. A server game's inputs are on the shell: _modeExit puts the focus back from there.
    const focused = s.gameBox.contains(this.shadowRoot?.activeElement);
    s.gameBox.hidden = true;
    if (focused) s.buttons.play?.focus({ preventScroll: true });
    s.pet.classList.remove("go-left", "go-right");
    if (line) this._write(s, line);
    s.sayUntil = line ? Date.now() + 4000 : 0;
    this._modeExit(s, "game"); // its last act: a shell mode the game was in ends with it (a no-op if none)
  }

  _toggleLights(s) {
    const id = s.ids?.["switch.lights_out"];
    if (!id) return;
    const button = s.buttons.lights;
    // A tuck or a wake in progress: a second tap is ignored, the ring and the haptic only; nothing is sent
    // (plan 4.3). Two quick taps with no scene (none predicted) send one call, by _call's own guard.
    if (s.scene?.kind === "lights" || this._inflight?.has(button)) {
      this._tapped(button, s, { perk: false });
      return;
    }
    // Turning the switch off wakes a pet that dozed off with the switch already off.
    const on = this._hass.states[id]?.state === "on" || s.asleep;
    // The entry mirrors _press (plan 4.3b): its refusal's log entry is mine (lights_out answers a lights
    // scene), then the scene starts, which ends any other first, and the call goes out.
    s.pressed = [...(s.pressed || []).filter((p) => Date.now() - p.pressedAt < MINE_MATCH_MS), { action: "lights_out", pressedAt: Date.now() }];
    if (s.scene) this._sceneEnd(s);
    this._sceneStart(s, "lights");
    const sc = s.scene;
    Promise.resolve(this._call(button, s, "switch", on ? "turn_off" : "turn_on", id)).then((ok) => {
      if (!sc || s.scene !== sc) return;
      if (ok === false) this._sceneFail(s); // its exit beat; "that didn't work" is _call's
      else if (ok) sc.called = this._sceneNow(sc); // the quiet exit counts from here (4.3b)
    });
  }
}

