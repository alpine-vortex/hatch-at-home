class HatchPetCardLink extends HatchPetCardVisitors {
  // --- The infrared link ------------------------------------------------------
  // Flavour only: once a day, per pair, the pet on show and the slide next to it
  // visit. Nothing is counted or remembered (Q4), and no button starts one (Q3).

  _linkName(s) {
    const d = this._hass?.devices?.[s.ids?.device];
    return d?.name_by_user || d?.name || "friend";
  }

  // Free for a visit: the idle checks, no egg, nothing waiting to be said.
  _linkFree(s) {
    return !!s && this._free(s) && !s.queue?.length &&
      this._state(s, "sensor.life_stage")?.state !== "egg";
  }

  // The neighbour (either side, in a random order) that is free and has not
  // visited this pet today. Uses up the pair's day: call it only to start one.
  _linkPick(host) {
    if (!this._linkFree(host) || !host.lookedFirst) return null;
    const sides = [1, -1].sort(() => Math.random() - 0.5);
    const n = this._slides.length;
    for (const side of sides) {
      // Exactly three pets: the end pets are neighbours too, the way the nav wraps (UX8 F6).
      const guest = this._slides[n === 3 ? (this._index + side + n) % n : this._index + side];
      if (!this._linkFree(guest)) continue;
      const pair = [host.ids?.device, guest.ids?.device].sort().join("-");
      if (oncePerDay(`link-${pair}`)) return guest;
    }
    return null;
  }

  _linkTick(host) {
    const L = this._link;
    // A pet that falls asleep, calls, starts a game or a care scene, or opens the status ends it.
    if (L && (L.host.asleep || L.guest.asleep || L.host.calling || L.host.game || L.host.scene ||
      L.host.screen.classList.contains("show-status"))) this._linkEnd();
    if (this._booting || this._link || this._slides.length < 2) return;
    const now = Date.now();
    const [lo, hi] = LINK_AFTER_MS;
    if (!linkedToday()) {
      const [first, last] = LINK_FIRST_MS;
      this._linkFirstMs ??= first + Math.random() * (last - first);
      const watched = !document.hidden && this._visible !== false && this._touchedAt
        && now - this._touchedAt < LINK_TOUCHED_MS && now - this._lookAt >= this._linkFirstMs;
      if (!watched) return;
    } else {
      this._linkAt ??= now + lo + Math.random() * (hi - lo);
      if (now < this._linkAt) return;
    }
    const guest = this._linkPick(host);
    if (!guest) return;
    this._linkAt = now + lo + Math.random() * (hi - lo);
    if (this._linkStart(host, guest) !== false) this._linkReport(host, guest);
  }

  // The social meter full (top10 §6): said once a week per pet on this device,
  // the week from Monday; nothing else on it changes the pet.
  _socialFull(s) {
    const level = this._state(s, "sensor.life_stage")?.attributes.social_level;
    if (level !== SOCIAL_MAX || s.asleep || s.game || !s.ids?.device) return;
    if (s.sayUntil > Date.now() || s.queue?.some((q) => lineClass(q) >= KEPT)) return;
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    if (!oncePerDay(`social-full-${s.ids.device}`, monday)) return;
    (s.queue ??= []).push({ text: "so many friends this week! ♥", ms: 4500, cls: KEPT, perk: true });
  }

  // Tell the server the two pets met (top10 §6, the social meter): each counts the
  // other once a day there, however many screens report it. Nobody's name goes.
  _linkReport(host, guest) {
    const a = host.ids?.["sensor.life_stage"];
    const b = guest.ids?.["sensor.life_stage"];
    if (!a || !b || a === b) return;
    this._hass.callWS({ type: "virtual_pet/linked", entity_id: a, other: b }).catch(() => {
      // an older integration has no meter: the link is the same
    });
  }

  // One visit: the beam, the visit screen, the two lines, the guest's own slide.
  // Each pet speaks as itself (_lines: baby talk, its type, or the normal line);
  // a kindred pair's host may add a line (2b). Every roll is made here, at the start.
  // Returns false when one is already on.
  _linkStart(host, guest) {
    if (this._link) return false;
    const isCalm = calm();
    const L = this._link = { host, guest, timers: [], hostScale: host.pet.style.scale };
    const at = (ms, fn) => {
      const t = setTimeout(() => this._link === L && fn(), ms);
      L.timers.push(t);
      return t;
    };
    const hostName = this._linkName(host);
    const guestName = this._linkName(guest);
    const hello = this._lines(host, "link_host", this._pick(["hi, {guest}!", "oh! {guest}! hello hello ♪"])
      .replace("{guest}", () => guestName), guestName).text;
    const reply = this._lines(guest, "link_guest", this._pick(["hi hi, {host}! ♪", "*waves* hi, {host}!"])
      .replace("{host}", () => hostName), hostName).text;
    // The kindred extra: its own roll, never through _lines (it has no normal line).
    const own = this._kindred(host, guest) && Math.random() < KINDRED_ODDS && this._pick(PERSONA[this._typeKey(host)].link_kindred);
    const extra = own ? (typeof own === "function" ? own(guestName) : own) : null;
    // Or the guest's news of its day (E9 L-a): public, the pets' own; shared screens too.
    const news = !extra && Math.random() < LINK_NEWS_ODDS ? this._linkNews(guest) : null;
    L.said = [hello, extra, LINK_NEWS_REPLY]; // the host's lines of this visit (a cut-short visit clears them)
    const stretch = extra ? 1000 : news ? LINK_NEWS_MS : 0; // the visit holds a little longer for it
    // With exactly three pets the end pets meet across the wrap: the guest on the far
    // side stands (and the beam goes) the other way, off the end of the row (UX8 F6).
    const hi = this._slides.indexOf(host);
    const gi = this._slides.indexOf(guest);
    const wrapped = this._slides.length === 3 && Math.abs(gi - hi) === 2;
    const toRight = wrapped ? gi < hi : gi > hi;
    const k = 0.7; // the pets stand at 70% of their size on the visit screen
    const gs = guest.species;
    const gStage = guest.drawn || "adult";
    const gScale = (gs?.scale?.[gStage] || 1) * k;
    let gFrames = gs ? this._linkPose(gs, gStage, guest.speciesId, (f) => { gFrames = f; }) : [];
    L.beamMs = isCalm ? 0 : 1500;
    this._moving(host, 9000);
    this._chirp(host, "link");
    if (!isCalm) this._linkBeam(host, guest, toRight, wrapped);
    // the guest's own slide: looking at the host, with a small note
    this._moving(guest, 6500);
    if (toRight) this._look(guest, 6500);
    this._speak(guest, "♪", 6500);
    // the visit screen
    at(L.beamMs ? 1400 : 0, () => {
      host.linking = true;
      const box = document.createElement("div");
      box.className = toRight ? "visit" : "visit left";
      box.setAttribute("aria-hidden", "true");
      if (!isCalm) box.innerHTML = '<div class="vband"><i></i><i></i><i></i><i></i><i></i></div>';
      host.screen.append(box);
      L.box = box;
    });
    const t0 = isCalm ? 200 : 2500;
    at(t0, () => {
      L.box.querySelector(".vband")?.remove();
      host.screen.classList.add("linking");
      host.screen.classList.toggle("linkleft", !toRight);
      if (!toRight) host.pet.classList.add("look"); // faces the guest on its left
      host.linkFrames = this._linkPose(host.species, host.drawn || "adult", host.speciesId, (f) => {
        if (host.linkFrames) host.linkFrames = f;
      });
      host.pet.classList.add("linking");
      host.pet.style.scale = String((Number(L.hostScale) || 1) * k);
      const img = document.createElement("img");
      img.className = "vguest";
      img.alt = "";
      img.style.scale = `${toRight ? -gScale : gScale} ${gScale}`; // faces the host
      this._show(guest, img, gFrames[0]);
      L.box.append(img);
      L.img = img;
      let f = 0;
      if (!isCalm) L.swap = setInterval(() => gFrames.length && this._show(guest, img, gFrames[++f % gFrames.length]), 700);
      // Both host lines queued now, in order; neither is said once the visit is over.
      const still = () => this._link === L;
      if (!extra) this._queue(host, hello, 3400, { still });
      else {
        // 3300 ms: the extra starts no earlier than t0+3300, after the guest's reply (t0+1800) has shown 1.5 s.
        this._queue(host, hello, 3300, { still });
        // Said late (the first line typed slowly): the visit waits for it to be read.
        this._queue(host, extra, 1600, { still, then: () => {
          L.say.hidden = true; // the guest's reply has had its turn: the bubbles would overlap
          const left = host.sayUntil - Date.now();
          if (left <= L.endsIn - Date.now()) return;
          clearTimeout(L.hideAt);
          clearTimeout(L.endAt);
          L.hideAt = at(Math.max(0, left - 600), hide);
          L.endAt = at(left, () => this._linkEnd(true));
        } });
      }
      const say = document.createElement("div");
      say.className = "vsay";
      say.hidden = true;
      L.box.append(say);
      L.say = say;
    });
    at(t0 + 1200, () => {
      if (!isCalm) this._animate(host, host.pet, "greethop", 1400);
    });
    at(t0 + 1800, () => {
      L.say.textContent = reply; // visual only: the visit screen is aria-hidden
      L.say.hidden = false;
      // Under the host's line, wherever it ends (a narrow screen or big text wraps it): UX8 F3.
      const hb = host.bubble.getBoundingClientRect();
      if (host.bubble.textContent && hb.height) {
        const sb = host.screen.getBoundingClientRect();
        const floor = sb.height * 0.27;
        L.say.style.top = `${Math.max(floor, hb.bottom - sb.top + 4)}px`;
      }
      if (!isCalm) this._animate(guest, L.img, "greethop", 1400);
      if (!isCalm) { // both cheer on the "hi hi" line (acts.cheer; none for a child)
        const gBefore = gFrames;
        const gCheer = this._actPose(gs, gStage, guest.speciesId, "cheer", () => {
          if (gFrames !== gCheer) return;
          gFrames = gBefore;
        });
        if (gCheer) gFrames = gCheer;
        const hBefore = host.linkFrames;
        const hCheer = this._actPose(host.species, host.drawn || "adult", host.speciesId, "cheer", () => {
          if (host.linkFrames === hCheer) host.linkFrames = hBefore;
        });
        if (hCheer && host.linkFrames) host.linkFrames = hCheer;
      }
    });
    if (news) {
      at(t0 + 1800 + LINK_NEWS_MS, () => { L.say.textContent = news; });
      at(t0 + 1800 + LINK_NEWS_MS * 2, () => this._queue(host, LINK_NEWS_REPLY, 1800, { still: () => this._link === L }));
    }
    at(t0 + 3400, () => {
      if (!isCalm && !sharedScreen()) this._bondHearts(host, "linkhearts");
    });
    const hide = () => {
      L.say.hidden = true;
      L.img.classList.add("out");
    };
    const endMs = t0 + (isCalm ? 3600 : 4600) + stretch;
    L.hideAt = at(t0 + 4000 + stretch, hide);
    L.endAt = at(endMs, () => this._linkEnd(true));
    L.endsIn = Date.now() + endMs; // when the visit ends, unless the extra stretches it
    return true;
  }

  _pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  // The guest's news over a link (E9 L-a): today's dream as DREAMS says it, else today's
  // visitor seen on the guest's device, else null.
  _linkNews(guest) {
    const said = this._dreamText(guest, this._dreamToday(guest));
    if (said) return said;
    const seen = this._visitSeen(guest);
    return seen ? LINK_VISITOR_NEWS(seen) : null;
  }

  // The beam: a red head with ripples flies along the tops of the devices, a
  // dotted trail behind it, and a burst where it arrives. Pixel-stepped, in world
  // art pixels (WORLD_GRID of them across the pet's 46.5% of the screen).
  _linkBeam(host, guest, toRight, wrapped = false) {
    const L = this._link;
    const track = this._track.getBoundingClientRect();
    const a = host.device.getBoundingClientRect();
    const b = guest.device.getBoundingClientRect();
    // Ride over the highest part of either toy: a tank's lid, a roof, the moon, a top trim
    // (parts a shape hasn't are display: none, with an empty rect), but inside the viewport,
    // which clips: a tank's tall trim keeps it at the very top, over the leaves.
    const top = Math.min(...[host.device, guest.device].flatMap((d) =>
      [d, ...d.querySelectorAll(".lid, .roof, .crescent, .trim-top, .trim-top2")])
      .map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height).map((r) => r.top));
    const u = Math.max(1, Math.round(((host.screen.clientWidth * 0.465) / WORLD_GRID) * 4) / 4);
    const x0 = a.left + a.width / 2 - track.left;
    // A wrapped guest is far across the row: the head flies one slide's pitch toward where
    // it would stand if the row went on, and leaves the card there.
    const x1 = wrapped ? x0 + (toRight ? 1 : -1) * Math.abs(b.left + b.width / 2 - (a.left + a.width / 2)) / 2
      : b.left + b.width / 2 - track.left;
    const dist = x1 - x0;
    const step = 2 * u;
    const n = Math.max(2, Math.round(Math.abs(dist) / step));
    const ms = 1100;
    const beam = document.createElement("div");
    beam.className = "irbeam";
    beam.setAttribute("aria-hidden", "true");
    // (the art starts 11 cells down its 32: the cells above it may hang outside)
    const room = this._track.parentElement.getBoundingClientRect().top - track.top - 11 * u;
    beam.style.cssText = `left:0;top:${Math.max(room, top - track.top - 16 * u + 3)}px;width:1px;height:1px;--u:${u}px;` +
      `--ir-ms:${ms}ms;--ir-steps:${n};--ir-d:${n * step * (toRight ? 1 : -1)}px`;
    const img = (name, cls, cx, cell) => {
      const el = document.createElement("img");
      el.className = cls;
      el.alt = "";
      el.src = `${BASE}/ui/${name}.png?v=${VERSION}`;
      el.style.left = `${cx - cell * u}px`;
      return el;
    };
    // heads sit 12.5 px into the cell facing right, 19.5 facing left
    const head = img("ir_head_1", "head", x0, toRight ? 12.5 : 19.5);
    if (!toRight) head.style.scale = "-1 1"; // translate and scale are separate properties
    for (let d = 5 * u; d < Math.abs(dist) - 4 * u; d += 5 * u) {
      const dot = img("ir_dot", "trail", x0 + d * (toRight ? 1 : -1), 16);
      dot.style.animationDelay = `${Math.round((d / Math.abs(dist)) * ms)}ms`;
      beam.append(dot);
    }
    const arrive = img("ir_burst", "arrive", x1, 16);
    arrive.style.animationDelay = `${ms}ms`;
    beam.append(arrive, head);
    this._track.append(beam);
    L.beam = beam;
    let f = 0;
    L.flap = setInterval(() => head.setAttribute("src", `${BASE}/ui/ir_head_${(++f % 2) + 1}.png?v=${VERSION}`), 200);
    L.timers.push(setTimeout(() => beam.classList.add("gone"), ms + 500));
    L.timers.push(setTimeout(() => beam.remove(), ms + 900));
  }

  // The visit is over (or cut short): leave nothing behind.
  // done: the visit ran its course. Cut short (a sleep, a tap on Status), a hello still
  // on show is cleared with the guest's bubble: no hello to an empty room (UX8 F8).
  _linkEnd(done = false) {
    const L = this._link;
    if (!L) return;
    this._link = null;
    this._linkEndedAt = Date.now(); // a world visitor waits VISIT_AFTER_MS
    L.timers.forEach(clearTimeout);
    clearInterval(L.swap);
    clearInterval(L.flap);
    L.beam?.remove();
    L.box?.remove();
    const { host, guest } = L;
    host.linking = false;
    host.linkFrames = null;
    host.screen.classList.remove("linking", "linkleft");
    host.pet.classList.remove("linking", "greethop", "look");
    host.pet.style.scale = L.hostScale;
    host.screen.querySelector(".linkhearts")?.remove();
    guest.pet.classList.remove("look");
    guest.movingUntil = host.movingUntil = 0;
    guest.sayUntil = 0;
    this._stopTyping?.(guest);
    guest.bubble.textContent = "";
    const said = host.sayEntry?.text;
    if (!done && said && L.said?.includes(said) && host.sayUntil > Date.now()) this._write(host, "", 0);
  }
}

