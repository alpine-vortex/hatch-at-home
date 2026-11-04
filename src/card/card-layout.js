class HatchPetCardLayout extends HatchPetCardBuild {
  _layout() {
    const vw = this._viewport.clientWidth;
    if (!vw) return;
    this._slideW = Math.min(330, vw - 56);
    const compact = this._slideW < 280;
    if (compact !== this._card.classList.contains("compact")) {
      this._card.classList.toggle("compact", compact);
      this._redraw(); // the trim is sized for the layout: draw every slide again
    }
    for (const s of this._slides) s.el.style.width = `${this._slideW}px`;
    for (const s of this._slides) if (s.game?.picking) this._fitPicker(s);
    this._renderShelf();
  }

  // The pet is 62% of the screen high and square, so 46.5% of it wide, and
  // WORLD_GRID cells across: one per art pixel of a creature on the 64 grid, one
  // per 2 × 2 on the 128 grid. Where a cell would be under 3 device pixels the
  // grid moirés, so it doubles there. Lines line up with the pet's box.
  _lcdPitch(s) {
    const w = s.screen.clientWidth;
    if (!w) return;
    const dpr = window.devicePixelRatio || 1;
    let pitch = (w * 0.465) / WORLD_GRID;
    if (pitch * dpr < 3) pitch = Math.max(3, Math.round(pitch * 2 * dpr)) / dpr; // whole device pixels
    const line = Math.max(1, Math.round(pitch * dpr * 0.25)) / dpr;
    const left = w * (0.5 - 0.2325);
    const top = w * 0.75 * (1 - 0.04 - 0.62);
    s.screen.style.setProperty("--lcd-pitch", `${pitch}px`);
    s.screen.style.setProperty("--lcd-line", `${line}px`);
    s.screen.style.setProperty("--lcd-x", `${left % pitch}px`);
    s.screen.style.setProperty("--lcd-y", `${top % pitch}px`);
    // The mono screen's grid sits over the screen, not in it: the same lines on its box.
    const g = s.monoGrid.style;
    for (const k of ["--lcd-pitch", "--lcd-line", "--lcd-x", "--lcd-y"]) g.setProperty(k, s.screen.style.getPropertyValue(k));
    g.setProperty("--mg-x", `${s.screen.offsetLeft}px`);
    g.setProperty("--mg-y", `${s.screen.offsetTop}px`);
    g.setProperty("--mg-w", `${s.screen.offsetWidth}px`);
    g.setProperty("--mg-h", `${s.screen.offsetHeight}px`);
    g.setProperty("--mg-r", getComputedStyle(s.screen).borderRadius);
    // The shell's grid: the same world grid, but always whole device pixels.
    const px = Math.max(1, Math.round(((w * 0.465) / WORLD_GRID) * dpr)) / dpr;
    if (px !== s.px) {
      s.px = px;
      s.device.style.setProperty("--px", `${px}px`);
    }
    this._mould(s);
  }

  // Where a banded finish may change colour without cutting through the label, a
  // button row or its captions: the gaps between them and the bezel's middle, in px
  // down the body on the grid (--cut1..5), and the bezel's box for a see-through
  // board (--bz-*). Only a finish that uses them asks.
  _bands(s) {
    const dev = s.device;
    if (!/finish-(rainbow|sunset|twotone|smoke|clear)\b/.test(dev.className)) return;
    const g = s.px;
    const body = dev.querySelector(".body").getBoundingClientRect();
    const box = (el) => el.getBoundingClientRect();
    const bezel = box(dev.querySelector(".bezel"));
    const label = s.label.offsetHeight ? box(s.label) : null;
    const rows = [];
    for (const t of dev.querySelectorAll(".buttons .toy")) {
      const r = box(t);
      if (!r.height) continue;
      const row = rows.find((w) => Math.abs(w.top - r.top) < 4);
      if (row) row.bottom = Math.max(row.bottom, r.bottom);
      else rows.push({ top: r.top, bottom: r.bottom });
    }
    rows.sort((a, b) => a.top - b.top);
    const mid = (a, b) => Math.round(((a + b) / 2 - body.top) / g) * g;
    const first = rows[0] || { top: body.bottom, bottom: body.bottom }, last = rows.at(-1) || first;
    const cuts = [
      mid(label ? label.bottom : body.top, bezel.top), mid(bezel.top, bezel.bottom), mid(bezel.bottom, first.top),
      rows[1] ? mid(first.bottom, rows[1].top) : mid(first.top, first.bottom), mid(last.bottom, body.bottom),
    ];
    cuts.forEach((v, i) => dev.style.setProperty(`--cut${i + 1}`, `${v}px`));
    const at = (v) => `${Math.round(v / g) * g}px`;
    dev.style.setProperty("--bz-x", at(bezel.left - body.left));
    dev.style.setProperty("--bz-y", at(bezel.top - body.top));
    dev.style.setProperty("--bz-w", at(bezel.width));
    dev.style.setProperty("--bz-h", at(bezel.height));
  }

  // Cut each part of the shell on the grid, from its laid-out size (see mouldCells).
  // Parts and caps are cached by kind and size, so a call with nothing changed is cheap.
  _mould(s) {
    const g = s.px;
    const dev = s.device;
    if (!g || !dev.offsetWidth) return;
    const shape = s.shape || "egg";
    // Each cut part starts on a whole device pixel, wherever its box landed: lids,
    // feet, roofs and caps are sized in percentages and grid columns.
    const dpr = window.devicePixelRatio || 1;
    const over = (v) => v - Math.round(v * dpr) / dpr;
    dev.style.setProperty("--dpx", `${1 / dpr}px`);
    const cut = (key, make) => {
      if (!MOULDS.has(key)) {
        if (MOULDS.size > 300) MOULDS.clear();
        MOULDS.set(key, make());
      }
      return MOULDS.get(key);
    };
    for (const m of dev.querySelectorAll(".mould")) {
      const part = m.parentElement;
      const w = part.offsetWidth, h = part.offsetHeight;
      if (!w || !h) continue;
      const kind = ["body", "bezel", "loop", "lid", "roof", "crescent"].find((k) => part.classList.contains(k)) || "foot";
      const lip = kind === "bezel" ? 2 : 0;
      const W = Math.max(1, Math.round(w / g)) + lip * 2, H = Math.max(1, Math.round(h / g)) + lip * 2;
      const key = `${kind}|${shape}|${W}|${H}|${g}|${this._card.classList.contains("compact")}`;
      const box = part.getBoundingClientRect();
      const at = `left:${-lip * g - over(box.left)}px;top:${-lip * g - over(box.top)}px;`;
      if (m.dataset.key === key) {
        if (m.dataset.at !== at) { m.dataset.at = at; m.style.left = `${-lip * g - over(box.left)}px`; m.style.top = `${-lip * g - over(box.top)}px`; }
        continue;
      }
      m.dataset.key = key;
      m.dataset.at = at;
      const { clip, tones, core } = cut(key, () => {
        const rad = cssRadii(part, w, h, g);
        const w0 = W - lip * 2, h0 = H - lip * 2;
        let inside = (x, y) => inRound(x, y, W, H, rad), opts = {};
        if (kind === "body") {
          opts = { glint: true, seam: 3 };
          // The lily pad's notch, and its veins fanning from it.
          if (shape === "pad") {
            const notch = 23 / g, deep = 34 / g;
            inside = (x, y) => inRound(x, y, W, H, rad) && !(y < deep && Math.abs(x - W / 2) < notch * (1 - y / deep));
            opts.veins = (x, y) => {
              const a = (Math.atan2(y, x - W / 2) * 180) / Math.PI;
              const k = (((a - 90 - 13.75) % 14.5) + 14.5) % 14.5;
              return Math.min(k, 14.5 - k) * (Math.PI / 180) * Math.hypot(x - W / 2, y) < 0.5;
            };
          }
        } else if (kind === "bezel") {
          inside = (x, y) => inRound(x, y, W, H, rad.map(([a, b]) => [a + lip, b + lip]));
          opts = { sunk: true, core: (x, y) => inRound(x - lip, y - lip, w0, h0, rad) };
        } else if (kind === "loop") {
          const t = Math.round(6 / g);
          inside = (x, y) => inRound(x, y, W, H, rad) && !inRound(x - t, y - t, W - t * 2, H, rad.map(([a, b]) => [a - t, b - t]));
        } else if (kind === "roof") {
          const cw = 22 / g, cx = W * 0.8;
          inside = (x, y) => Math.abs(x - W / 2) <= (y / H) * (W / 2) ||
            (x > cx - cw && x < cx && y > 6 / g && y < 46 / g);
        } else if (kind === "crescent") {
          // A disc less the same disc moved (-15, 7) px, turned -20°.
          const R = W / 2, a = (-20 * Math.PI) / 180;
          const ox = (-15 * Math.cos(a) - 7 * Math.sin(a)) / g, oy = (-15 * Math.sin(a) + 7 * Math.cos(a)) / g;
          inside = (x, y) => (x - R) ** 2 + (y - R) ** 2 <= R * R && (x - R - ox) ** 2 + (y - R - oy) ** 2 > R * R;
        }
        const cells = mouldCells(W, H, inside, opts);
        // The screen sits sunk in the bezel: a ring of shadow above and left of the
        // opening, light below and right, on the bezel round the glass.
        if (kind === "bezel") {
          const scr = part.querySelector(".screen");
          const sx = scr.offsetLeft / g + lip, sy = scr.offsetTop / g + lip;
          const sw = scr.offsetWidth / g, sh = scr.offsetHeight / g, srad = cssRadii(scr, scr.offsetWidth, scr.offsetHeight, g);
          const inScreen = (x, y) => inRound(x - sx, y - sy, sw, sh, srad);
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x;
            if (cells[i] !== TONE.plain || inScreen(x + 0.5, y + 0.5)) continue;
            const near = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]
              .find(([dx, dy]) => inScreen(x + 0.5 + dx, y + 0.5 + dy));
            if (near) cells[i] = (x + 0.5 - sx) / sw + (y + 0.5 - sy) / sh < 1 ? TONE.deep : TONE.lit;
          }
        }
        // The porthole's rivets: studs of 2 x 2 cells round the ring.
        if (kind === "bezel" && shape === "porthole") {
          const at = [[w / 2, 7], [w / 2, h - 7], [7, h / 2], [w - 7, h / 2], [0.088 * w + 5, 0.11 * h + 5],
            [0.912 * w - 5, 0.11 * h + 5], [0.088 * w + 5, 0.89 * h - 5], [0.912 * w - 5, 0.89 * h - 5]];
          for (const [ax, ay] of at) {
            const cx = Math.round(lip + ax / g) - 1, cy = Math.round(lip + ay / g) - 1;
            [[0, 0, TONE.lit], [1, 0, TONE.line], [0, 1, TONE.line], [1, 1, TONE.line]].forEach(([dx, dy, t]) => {
              const i = (cy + dy) * W + cx + dx;
              if (cells[i]) cells[i] = t;
            });
          }
        }
        // A recess's lip is the shell's own plastic, in light and shade: only the core is filled.
        const core = lip ? cells.map((v, i) => (v && inside((i % W) + 0.5, Math.floor(i / W) + 0.5) &&
          opts.core((i % W) + 0.5, Math.floor(i / W) + 0.5) ? 1 : 0)) : null;
        return { clip: clipPath(cellsPath(cells, W, H, (v) => v > 0, g)), tones: toneImage(cells, W, H),
          core: core ? clipPath(cellsPath(core, W, H, (v) => v > 0, g)) : "none" };
      });
      m.style.cssText = `${at}width:${W * g}px;height:${H * g}px;` +
        `clip-path:${clip};--tones:${tones};--core:${core}`;
    }
    this._bands(s);
    // The button caps, all one size on a device, and the backlight's little one.
    const n = Math.round((this._card.classList.contains("compact") ? 38 : 46) / g);
    const capKey = `cap|${shape}|${n}|${g}`;
    if (dev.dataset.caps !== capKey) {
      dev.dataset.caps = capKey;
      const caps = cut(capKey, () => {
        const r = shape === "tank" ? [14, 14, 14, 14] : shape === "house" ? [10, 10, 4, 4] : null;
        const rad = r ? r.map((v) => [(v / 46) * n, (v / 46) * n]) : Array(4).fill([n / 2, n / 2]);
        const out = {};
        for (const [tag, depth] of [["", 3], ["-dn", 1]]) {
          const cells = capCells(n, depth, rad);
          out[`--cap-clip${tag}`] = clipPath(cellsPath(cells, n, n + depth, (v) => v > 0, g));
          out[`--cap-side${tag}`] = clipPath(cellsPath(cells, n, n + depth, (v) => v === TONE.side, g));
          out[`--cap-tones${tag}`] = toneImage(cells, n, n + depth);
          if (!tag) {
            // The wanted glow: a ring two cells wide round the raised cap.
            const W = n + 4, H = n + depth + 4, ring = new Uint8Array(W * H);
            const has = (x, y) => x >= 0 && y >= 0 && x < n && y < n + depth && cells[y * n + x] > 0;
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
              if (has(x - 2, y - 2)) continue;
              for (let dy = -2; dy <= 2 && !ring[y * W + x]; dy++) for (let dx = -2; dx <= 2; dx++) {
                if (Math.abs(dx) + Math.abs(dy) <= 3 && has(x - 2 + dx, y - 2 + dy)) { ring[y * W + x] = 1; break; }
              }
            }
            out["--cap-halo"] = clipPath(cellsPath(ring, W, H, (v) => v > 0, g));
          }
        }
        const bl = capCells(9, 2, Array(4).fill([4.5, 4.5]));
        out["--bl-clip"] = clipPath(cellsPath(bl, 9, 11, (v) => v > 0, g));
        out["--bl-tones"] = toneImage(bl.map((v) => (v === TONE.side ? TONE.deep : v)), 9, 11);
        return out;
      });
      dev.style.setProperty("--cap-n", n);
      for (const [k, v] of Object.entries(caps)) dev.style.setProperty(k, v);
    }
    for (const cap of dev.querySelectorAll(".toy .cap")) {
      const r = cap.getBoundingClientRect();
      const x = r.left - (parseFloat(cap.style.left) || 0), y = r.top - (parseFloat(cap.style.top) || 0);
      cap.style.left = `${-over(x)}px`;
      cap.style.top = `${-over(y)}px`;
      // The wanted ring is drawn by the toy, round the cap where it now sits.
      cap.parentElement.style.setProperty("--cap-x", `${x - over(x) - cap.parentElement.getBoundingClientRect().left}px`);
    }
    const b = s.backlight, br = b.getBoundingClientRect();
    if (br.width) {
      const [tx, ty] = (b.style.translate || "0px 0px").split(" ").map((v) => parseFloat(v) || 0);
      b.style.translate = `${-over(br.left - tx)}px ${-over(br.top - ty)}px`;
    }
  }

  _renderShelf() {
    const s = this._slides[this._index];
    if (!s || !s.world) return;
    const vw = this._viewport.clientWidth;
    const w = this._slideW || Math.min(330, vw - 56);
    for (const slide of this._slides) slide.el.style.width = `${w}px`;
    // On whole device pixels, so the pet and the shell's grid stay crisp.
    const dpr = window.devicePixelRatio || 1;
    const vr = this._viewport.getBoundingClientRect();
    const tx = Math.round((vr.left + (vw - w) / 2) * dpr) / dpr - vr.left - this._index * (w + 16);
    const ty = Math.round(vr.top * dpr) / dpr - vr.top;
    this._track.style.transform = `translate(${tx}px, ${ty}px)`;
    if (s.px) requestAnimationFrame(() => this._mould(s)); // the parts' places moved with it
    this._slides.forEach((slide, i) => {
      const current = i === this._index;
      slide.el.classList.toggle("away-slide", !current);
      slide.device.inert = !current || !!slide.empty;
      this._patSync(slide);
      slide.el.setAttribute("aria-hidden", current ? "false" : "true");
    });

    const world = s.world;
    this._card.style.setProperty("--hp-backdrop", world.backdrop);
    this._card.style.setProperty("--hp-ground", world.ground);
    this._card.style.setProperty("--hp-ink", world.ink);
    this._card.style.setProperty("--hp-subink", world.subink);
    const device = this._hass.devices?.[s.ids?.device];
    const stage = this._state(s, "sensor.life_stage");
    const days = stage?.attributes.age_days;
    const kind = stage?.state === "egg" ? "Egg" : s.species?.name || "";
    const title = this._card.querySelector(".title");
    // On a swipe the name and the line change when the new pet is half there (250 ms into the
    // slide), not at once over the old pet (UX7 F4). Under reduced motion they change at once.
    const swapHead = !!this._headFor && this._headFor !== s && !s.empty && !calm();
    if (swapHead && !this._headTimer) {
      this._headTimer = setTimeout(() => {
        this._headTimer = 0;
        this._headFor = null;
        this._renderShelf();
      }, 250);
    }
    const headNow = !this._headTimer;
    if (headNow && !s.empty) this._headFor = s;
    if (headNow && !s.empty) { // the empty card keeps its own title and line (_update)
      title.textContent = device?.name_by_user || device?.name || "Pet";
      title.classList.toggle("long", title.textContent.length > 9);
    }
    const emblem = this._card.querySelector(".emblem");
    if (world.emblem) {
      const src = `${BASE}/ui/${world.emblem}.png?v=${VERSION}`;
      if (emblem.getAttribute("src") !== src) emblem.src = src;
      emblem.style.display = "";
    } else {
      emblem.style.display = "none";
    }
    const season = seasonNow(this._config);
    this._card.querySelectorAll(".deco").forEach((img, i) => {
      // In season, the right-hand decoration is the season's.
      const name = season && i === 1 ? `season_${season.key}_deco` : world.deco?.[i];
      img.style.display = name ? "" : "none";
      const src = name && `${BASE}/ui/${name}.png?v=${VERSION}`;
      if (src && img.getAttribute("src") !== src) img.src = src;
    });
    // The world is on the device's plate and the emblem, so the line stays short.
    if (headNow && !s.empty) {
      this._card.querySelector(".head .sub").textContent = [kind,
        stage?.state !== "egg" ? STAGE_LABELS[stage?.state]?.toLowerCase() : null,
        days != null ? `day ${Math.floor(days) + 1}` : null].filter(Boolean).join(" · ");
    }

    while (this._dots.children.length < this._slides.length) {
      const i = this._dots.children.length;
      const dot = document.createElement("button");
      dot.className = "dot";
      dot.addEventListener("click", (e) => {
        this._tapped(e.currentTarget);
        this._go(i);
      });
      this._dots.append(dot);
    }
    while (this._dots.children.length > this._slides.length) this._dots.lastChild.remove();
    (this._shown ??= new Set()).add(s.ids?.device);
    [...this._dots.children].forEach((dot, i) => {
      const device = this._slides[i].ids?.device;
      dot.classList.toggle("fresh", this._slides.length > 1 && !this._shown.has(device) && !this._seenRead(device));
      // A heart on the pet this person's card opens on (favourite §5.3): their own screen only
      // (a mark anyone could see would rank), and only with 2+ pets.
      dot.classList.toggle("open-on", this._slides.length > 1 && !sharedScreen() && this._slides[i].mine?.open_on === true);
      const name = this._hass.devices?.[this._slides[i].ids?.device];
      const who = name?.name_by_user || name?.name || `pet ${i + 1}`;
      // The pet the card opens on says so (FM copy), for a screen reader as the heart does for the eye.
      const opens = this._slides.length > 1 && !sharedScreen() && this._slides[i].mine?.open_on === true;
      dot.setAttribute("aria-label", `Show ${who}${opens ? ", your card opens here" : ""}`);
      this._headCrop(this._slides[i], dot, 8, 1.7); // its head, as the dot's mark (UX7 F8)
      dot.setAttribute("aria-current", i === this._index ? "true" : "false");
    });
    this._card.querySelector(".statusbtn").setAttribute(
      "aria-pressed", s.screen.classList.contains("show-status") ? "true" : "false");
  }

  // Size a trim piece (an <img>, or the label wearing the plate as its background) to
  // its art. A plate taller than 44 px has strings or hooks above it, so the label's
  // text keeps to its bottom 44 px.
  _trim(el, src, scale) {
    const size = (w, h) => {
      el.style.width = `${w * scale}px`;
      el.style.height = `${h * scale}px`;
      if (el.tagName !== "IMG") el.style.paddingTop = `${Math.max(0, h - 44)}px`;
    };
    if (el.tagName === "IMG") {
      if (el.getAttribute("src") !== src) {
        el.onload = () => size(el.naturalWidth, el.naturalHeight);
        el.setAttribute("src", src);
      } else if (el.naturalWidth) {
        size(el.naturalWidth, el.naturalHeight);
      }
      return;
    }
    if (el.dataset.trimSrc === src && el.dataset.trimW) {
      size(Number(el.dataset.trimW), Number(el.dataset.trimH));
      return;
    }
    el.dataset.trimSrc = src;
    const probe = new Image();
    probe.onload = () => {
      el.dataset.trimW = probe.naturalWidth;
      el.dataset.trimH = probe.naturalHeight;
      if (el.dataset.trimSrc === src) size(probe.naturalWidth, probe.naturalHeight);
    };
    probe.src = src;
  }

  // Which background the pet's day is in: the day's, the rain's, the night's, or the dim (asleep or
  // the lights out). `states` is the hass states (the scene reads the live ones, not the held).
  _sceneKey(states, flags, sleeping) {
    if (sleeping) return "dim";
    if (states["sun.sun"]?.state === "below_horizon") return "night";
    return flags.includes("rainy") ? "rain" : "day";
  }

  // The background for a scene key, and the classes that go with it (the dim's art, a darkened day
  // art for a species with no scene of its own).
  _bgApply(s, scene) {
    const sp = s.species;
    const own = sp.backgrounds?.[scene];
    this._show(s, s.bg, own || sp.backgrounds?.day || Object.values(sp.backgrounds || {})[0]);
    // A species with only a day scene gets it darkened for night and sleep.
    s.screen.classList.toggle("faded", !own && scene !== "day" && scene !== "rain");
    s.screen.classList.toggle("night", scene === "night");
    s.screen.classList.toggle("dim", scene === "dim");
  }

  _show(s, img, sprite) {
    if (!sprite) {
      img.style.display = "none";
      return;
    }
    const src = spriteSrc(s.speciesId, sprite);
    if (img.getAttribute("src") !== src) img.setAttribute("src", src);
    img.style.display = "";
  }

  // The finish the shell wears: the picker's preview, else the pet's pick, else
  // its world's own (worlds.json shell.finish).
  _shellKey(s) {
    const own = s.world.shell?.finish;
    if (s.previewFinish !== undefined) return s.previewFinish ?? own;
    return this._shellChoice(s) ?? own;
  }

  // The pet's pick (null: its world's own): one just saved, until the sensor says
  // so or 5 s pass (so closing the picker before the push doesn't flicker), else
  // the sensor's. A key this card doesn't draw counts as none.
  _shellChoice(s) {
    const key = this._state(s, "sensor.life_stage")?.attributes.shell_finish;
    const saved = Object.hasOwn(FINISHES, key ?? "") ? key : null;
    if (s.shellPending !== undefined) {
      if (saved !== s.shellPending) return s.shellPending;
      this._shellSettled(s);
    }
    return saved;
  }

  _shellSettled(s) {
    s.shellPending = undefined;
    clearTimeout(s.shellPendingTimer);
  }

  // Put a finish on the shell: its class and the ink for its captions. Called by
  // _renderSlide and by the picker's preview; touches nothing else on the device.
  _dress(s, key) {
    const dev = s.device;
    const color = s.world.shell?.color || "#e8834a";
    const known = Object.hasOwn(FINISHES, key);
    const look = known ? FINISHES[key] : {};
    for (const c of [...dev.classList]) if (c.startsWith("finish-")) dev.classList.remove(c);
    if (known) dev.classList.add(`finish-${key}`);
    // The captions are inked for the plastic under them; see-through plastic shows the
    // backdrop, so they are inked for the mix.
    const face = look.face ? look.face(color) : color;
    dev.style.setProperty("--d-face", face);
    const seen = look.seen && /^#[0-9a-f]{6}$/i.test(s.world.backdrop || "")
      ? mixHex(look.seen(color), s.world.backdrop, look.see) : look.seen ? look.seen(color) : face;
    dev.style.setProperty("--d-ink", look.ink || deviceInk(seen));
    if (look.top) dev.style.setProperty("--d-ink-top", deviceInk(look.top(color))); // a label on another colour
    else dev.style.removeProperty("--d-ink-top");
  }

  _renderSlide(s) {
    const sp = s.species;
    const world = s.world;
    const shell = world.shell || {};
    const color = shell.color || "#e8834a";
    const dev = s.device;
    const shape = ["tank", "house", "porthole", "pad", "moon"].includes(shell.shape) ? shell.shape : "egg";
    dev.className = `device ${shape}`;
    s.shape = shape;
    dev.querySelector(".roof").style.display = shape === "house" ? "" : "none";
    dev.querySelector(".crescent").style.display = shape === "moon" ? "" : "none";
    dev.querySelector(".loop").style.display = shape === "egg" ? "" : "none";
    dev.querySelector(".lid").style.display = shape === "tank" ? "" : "none";
    dev.querySelector(".feet").style.display = shape === "tank" ? "" : "none";
    // The backlight's spot: a nub by the egg's screen, the tank lid's right grip, a
    // lamp on the chimney, a rivet, a dewdrop on the pad's rim, a star on the moon.
    const spot = { egg: ".bezel", tank: ".lid", house: ".roof", porthole: ".bezel", pad: ".body", moon: ".crescent" };
    const holder = dev.querySelector(spot[shape]);
    if (s.backlight.parentElement !== holder) {
      if (shape === "tank") holder.insertBefore(s.backlight, holder.lastElementChild);
      else holder.append(s.backlight);
    }
    dev.style.setProperty("--d-shell", color);
    dev.style.setProperty("--d-dark", shade(color, 0.72));
    this._dress(s, this._shellKey(s));
    dev.style.setProperty("--d-btn-shadow", shade(color, 0.6));
    dev.style.setProperty("--d-bezel", shell.bezel || "#f3ead7");
    s.label.textContent = world.label || world.name;
    // Optional pixel-art trim from Sol (worlds.json "trim"), like stickers on the toy.
    const trim = world.trim || {};
    const uiSrc = (name) => `${BASE}/ui/${name}.png?v=${VERSION}`;
    // Tops are drawn at 3/4 size on the egg, tank and house, whose tops are small;
    // the wide flat shells take them full size. A compact card shrinks them again.
    const topScale = (["egg", "tank", "house"].includes(shape) ? 0.75 : 1) *
      (this._card.classList.contains("compact") ? 0.7 : 1);
    dev.querySelectorAll(".trim-top, .trim-top2").forEach((img) => {
      img.style.visibility = trim.top ? "" : "hidden";
      if (trim.top) this._trim(img, uiSrc(trim.top), topScale);
    });
    dev.classList.toggle("has-corner", !!trim.corner && !this._card.classList.contains("compact"));
    dev.querySelectorAll(".trim-corner").forEach((img) => {
      img.style.display = trim.corner ? "" : "none";
      if (trim.corner) this._trim(img, uiSrc(trim.corner), 1);
    });
    // The emblem is the shell's world's own, whatever colour the shell wears.
    dev.style.setProperty("--hw-emblem", s.world.emblem ? `url("${BASE}/ui/${s.world.emblem.replace("emblem_", "emblem9_")}.png?v=${VERSION}")` : "none");
    s.label.classList.toggle("plate", !!trim.plate);
    s.label.style.backgroundImage = trim.plate ? `url(${uiSrc(trim.plate)})` : "";
    if (trim.plate) {
      this._trim(s.label, uiSrc(trim.plate), 1);
    } else {
      s.label.style.width = s.label.style.height = s.label.style.paddingTop = "";
    }
    this._mould(s); // a new shape can keep the same size, so no resize says so

    if (s.empty) { // the empty card's toy (F5): the room and the egg, flat and still
      this._show(s, s.bg, sp.backgrounds?.day || Object.values(sp.backgrounds || {})[0]);
      this._show(s, s.perch, null);
      this._show(s, s.awaysign, null);
      for (const img of [...s.poops, s.murk, s.attention, s.prop]) this._show(s, img, null);
      s.frames = [];
      this._show(s, s.pet, sp.egg?.idle?.[0]);
      s.pet.alt = "";
      return;
    }
    // Reloading (every Options save, a restart): the last pose stays, drawn faded, with
    // buttons and the pat off, one line in the bubble and the status page as it was (F1).
    if (s.reloading) {
      s.wasGone = true;
      s.screen.classList.add("faded");
      this._modeExit(s, "reload"); // a reload ends a shell mode (owner decision D10): not kept across it
      const home = s.careHome || this._careRest();
      this._paintCaps(s, Object.fromEntries(Object.entries(home).map(([k, v]) => [k, { ...v, disabled: true }])));
      s.request.classList.remove("show");
      this._patSync(s);
      if (s.bubble.textContent !== GONE_LINE) this._write(s, GONE_LINE, 60000);
      return;
    }
    if (s.wasGone) { // back: the held line goes, the real one is said at once
      s.wasGone = false;
      s.sayUntil = 0;
    }

    const mood = this._state(s, "sensor.mood");
    const stageState = this._state(s, "sensor.life_stage");
    const stage = stageState?.state;
    this._nameWatch(s, stageState); // a lay made here opens the name sheet (S3)
    const flags = mood?.attributes.flags || [];
    const calling = this._state(s, "binary_sensor.calling")?.state === "on";
    const lightsOut = this._state(s, "switch.lights_out")?.state === "on";
    const asleep = this._state(s, "binary_sensor.asleep")?.state === "on";
    const away = mood?.state === "away";
    s.away = away;
    s.resting = flags.includes("resting") && !away; // its idle lines (card-tick), the odd hello
    s.egg = stage === "egg";
    const haDevice = this._hass.devices?.[s.ids?.device]; // its given name, as on the title
    s.pat.setAttribute("aria-label", `pat ${haDevice?.name_by_user || haDevice?.name || sp.name || "pet"}`);
    s.asleep = asleep;
    s.lightsOut = lightsOut;
    // A new call chirps once (not on load: wasCalling starts undefined).
    const newCall = calling && s.wasCalling === false && !away;
    if (newCall) this._chirp(s, "call");
    s.wasCalling = calling;
    // A lights scene (care reactions D, plan 4.9) owns the sleep transition and the background for its
    // life: the held state says awake, so neither the settle nor the bg swap may run on it, and its
    // lie-down and blink write s.wasAsleep themselves. It reads the live (unheld) state each pass too.
    const lightsScene = s.scene?.kind === "lights";
    if (lightsScene) this._lightsWatch(s);
    // Falling asleep seen live: the pet settles in step with the dim (.6 s). Not on load.
    if (!lightsScene) {
      if (asleep && s.wasAsleep === false && !s.egg && !calm()) this._animate(s, s.pet, "settle", 2500);
      s.wasAsleep = asleep;
    }

    let turning = false;
    const scene = this._sceneKey(this._hass.states, flags, asleep || lightsOut);
    if (!lightsScene) this._bgApply(s, scene);
    this._renderSeason(s);

    this._show(s, s.perch, away ? null : sp.perch);
    if (away) {
      s.frames = [];
      s.pet.classList.remove("resting");
      this._show(s, s.pet, null);
      this._show(s, s.awaysign, sp.props?.away);
      s.awaylabel.textContent = "at the sitter's";
    } else {
      this._show(s, s.awaysign, null);
      // Resting (R1): a quiet label where the sitter's sign has its own, and slow breathing on
      // the idle pose; asleep, sick and the egg win (restLabel).
      const rest = restLabel(flags, { away, asleep, egg: s.egg });
      s.awaylabel.textContent = rest;
      s.pet.classList.toggle("resting", !!rest && !lightsScene); // not breathing through a tuck or a wake
      s.frames = this._petFrames(sp, stage, mood?.state, calling, this._eggMinutes(stageState), flags);
      const key = s.frames.join(",");
      if (calm() && s.framesKey !== key) s.frame = 0; // a new mood or stage: its first frame
      s.framesKey = key;
      const frames = this._frames(s);
      // A stage that changes while it is on show comes in edge-on (_swapFlip, at the scale below).
      turning = s.stageSeen !== undefined && s.stageSeen !== stage && !calm() && s === this._slides?.[this._index];
      if (!turning) this._show(s, s.pet, frames[s.frame % frames.length]);
    }
    if (stage) s.stageSeen = stage;
    // Excitement lasts a while (rates.py EXCITED_MINUTES), but the bounce only
    // celebrates its start; after that, idle life adds an occasional hop.
    // The bounce celebrates the start once: one greethop, not a 10 s loop (care reactions, ship A),
    // and not over a reaction or a scene already moving the pet.
    const excited = mood?.state === "excited";
    const excitedNow = excited && !s.excitedSince;
    if (excitedNow) s.excitedSince = Date.now();
    if (!excited) s.excitedSince = 0;
    s.pet.classList.remove("hop");
    if (excitedNow && !calm() && !asleep && !away && !s.scene && !(s.poseUntil > Date.now())) this._animate(s, s.pet, "greethop", 1400);
    s.pet.alt = s.species?.name || "pet";
    // Some stages are drawn smaller in the frame (long adults fit 256 px wide by
    // coming out shorter); species.json "scale" sizes them back up, feet fixed.
    const drawn = sp.stages?.includes(stage) ? stage : sp.stage_fallback?.[stage];
    s.drawn = drawn;
    const petScale = String(sp.scale?.[drawn] || 1);
    if (turning) {
      this._swapFlip(s, () => {
        const f = this._frames(s);
        if (f.length) this._show(s, s.pet, f[s.frame % f.length]);
        s.pet.style.scale = petScale;
      });
    } else s.pet.style.scale = petScale;
    if (!lightsScene) this._drapeSync(s, asleep && lightsOut && !away && !s.egg);
    // A heavy pet is drawn a little wider (gaps-seams 2c, owner: x1.06, only while heavy).
    const weight = Number.parseFloat(this._state(s, "sensor.weight")?.state);
    const heavy = stage !== "egg" && isHeavy(Number.isFinite(weight) ? weight : null);
    s.pet.classList.toggle("heavy", heavy);
    s.ghost?.classList.toggle("heavy", heavy);
    // Baby, teen and adult have no house poses: a hop dances, a shake shivers.
    const standIn = drawn !== "child" && !away && !asleep && POSE_MOODS.has(mood?.state);
    s.pet.classList.toggle("dance", standIn && flags.includes("dancing"));
    s.pet.classList.toggle("shiver", standIn && (flags.includes("chilly") || flags.includes("storm")));
    s.screen.classList.toggle("stormy", flags.includes("storm") && !away);
    s.screen.classList.toggle("windy", flags.includes("windy") && !away);
    s.vroom = flags.includes("vroom") && !away && !asleep; // a robot is cleaning (H4): idle sends it across
    s.moodState = mood?.state;
    s.calling = calling;
    const rainScene = scene === "rain" && !!sp.backgrounds?.rain;
    s.screen.classList.toggle("raining", flags.includes("rainy") && !rainScene && !away);
    s.screen.classList.toggle("watery", world.mess === "murk");

    const poop = away ? 0 : Number(this._state(s, "sensor.poop")?.state || 0);
    // Water worlds cloud over instead of showing poop (worlds.json "mess": "murk").
    const murky = world.mess === "murk" && !!sp.murk;
    s.poops.forEach((img, i) => this._show(s, img, !murky && i < poop ? sp.props?.poop?.[i] : null));
    this._show(s, s.murk, murky ? sp.murk : null);
    s.murk.style.opacity = murky ? [0, 0.45, 0.75, 1][Math.min(poop, 3)] : 0;
    this._show(s, s.attention, calling && !away ? sp.props?.attention : null);
    if (!calling || away) s.attention.classList.remove("arrive");
    else if (newCall) { // the icon pops in once, as the call arrives
      s.attention.classList.remove("arrive");
      void s.attention.offsetWidth;
      s.attention.classList.add("arrive");
    }
    if (!s.propUntil || Date.now() > s.propUntil) this._show(s, s.prop, null);

    const lastCare = this._state(s, "sensor.last_care");
    const log = lastCare?.attributes.log || [];
    // "Just happened" is judged on the server's clock (the sensor's last update),
    // so a device whose own clock is off still shows care and moments.
    const recent = (at) => new Date(lastCare?.last_updated) - new Date(at) < 15000;
    const latestAt = log[0]?.at ?? null;
    if (s.lastLogAt === undefined) s.lastLogAt = latestAt; // don't react to old care
    if (latestAt !== s.lastLogAt) {
      // Every fresh entry since the last one seen (a burst), newest first.
      const fresh = [];
      for (const e of log) {
        if (e.at === s.lastLogAt) break;
        if (recent(e.at)) fresh.push(e);
      }
      if (fresh.length) this._care(s, fresh);
      s.lastLogAt = latestAt;
    }
    // A person's own moments and the house's shows come from the channel only.
    const moments = (lastCare?.attributes.moments || []).filter((m) => !CHANNEL_ONLY.has(m.type));
    if (s.lastMoment === undefined) s.lastMoment = momentKey(moments[0]) ?? null; // not old ones
    if (moments.length && momentKey(moments[0]) !== s.lastMoment) {
      const fresh = [];
      for (const m of moments) {
        if (momentKey(m) === s.lastMoment) break;
        fresh.push(m);
      }
      s.lastMoment = momentKey(moments[0]);
      const batch = fresh.reverse().filter((m) => recent(m.at));
      // A pet that wakes sick says so before the cheer (the cheer waits).
      const sick = batch.findIndex((m) => m.type === "became_sick");
      const morning = batch.findIndex((m) => m.type === "good_morning");
      if (sick > morning && morning >= 0) batch.splice(morning, 0, ...batch.splice(sick, 1));
      batch.forEach((m) => this._moment(s, m));
    }
    const egg = stage === "egg";
    // The picker (no mode) ends here; a server game's idle and these reasons are its shell mode's exit
    // (_modeGuard below, SHELL_MODES): the server has dropped it already, so no call.
    if (s.game && (asleep || away || egg)) this._endGame(s, null);
    s.hatchesAt = egg ? stageState?.attributes.hatches_at : null;
    if (!s.sayUntil || Date.now() > s.sayUntil) {
      if (s.game?.prompt) this._write(s, s.game.prompt, 60000); // a game waiting on a guess asks again
      else {
        const coming = egg ? this._eggComing(s) : null; // the egg's first look (S2, C15')
        if (coming) this._write(s, coming, 8000);
        else this._write(s, this._say(s, mood, away));
      }
    }

    // The eight buttons' care state, painted by _paintCaps (card-mode.js), the one writer: with a shell
    // mode on it is kept for the mode's exit and the mode's slots stay on show.
    const care = this._careRest();
    for (const action of ACTIONS) {
      const c = care[action.key];
      const ent = this._state(s, `button.${action.key}`);
      c.disabled = !ent || ent.state === "unavailable" || egg || away;
      c.wanted = !c.disabled && !asleep && !!action.wants && flags.includes(action.wants);
      c.desc = c.wanted ? "wanted now" : null;
    }
    const wanted = (mood?.attributes.requests || []).find((r) => this._state(s, `button.${r}`));
    // The pet can't lay any more (stage, or the entry reloaded after a world change): no sheet.
    if (s.laySheet && !(mood?.attributes.requests || []).includes("lay_egg")) this._closeLay(s);
    s.request.classList.toggle("show", !!wanted && !away && !asleep);
    if (wanted) {
      s.request.dataset.key = wanted;
      const confirming = wanted === "lay_egg" && confirmArmed(s, wanted);
      s.request.textContent = confirming ? "sure? tap again" : REQUEST_LABELS[wanted] || `${wanted}?`;
      s.request.setAttribute("aria-label", confirming ? CONFIRM_ARIA.lay_egg
        : REQUEST_ARIA[wanted] || `Give the pet a ${wanted}`);
    }

    const lights = care.lights;
    const lightsEnt = this._state(s, "switch.lights_out");
    lights.disabled = !lightsEnt || lightsEnt.state === "unavailable" || away;
    // Asleep counts even when it dozed off by itself (the switch stays off then).
    const sleeping = lightsOut || asleep;
    lights.on = sleeping;
    lights.wanted = !sleeping && flags.includes("sleepy") && calling;
    lights.icon = sleeping ? "icon_lights_on" : "icon_lights_out";
    lights.cap = sleeping ? "wake" : "sleep";
    lights.title = sleeping ? "Lights on: wake the pet" : "Lights out: put the pet to bed";
    this._paintCaps(s, care);
    this._modeGuard(s); // asleep, away, egg (when the mode lists them) and idle, on this push's flags
    this._patSync(s);

    if (s.screen.classList.contains("show-status")) this._renderStatus(s, log);
  }

  _say(s, mood, away) {
    if (away) return "";
    if (s.hatchesAt) {
      const minutes = Math.max(1, Math.ceil((new Date(s.hatchesAt) - serverNow()) / 60000));
      if (minutes <= 1) return "crack... crack...";
      if (minutes <= 6) return STATUS_COPY.eggCracking; // as the status page says it (UX fix 4, F10)
      // The number and its unit stay together: big text never leaves "min" alone on a line.
      return minutes < 60 ? `hatching in about ${minutes}\u00a0min` : `hatching in about ${Math.round(minutes / 60)}\u00a0h`;
    }
    // The server's sentence, or baby talk keyed by which sentence it is (an
    // older integration sends no key: the sentence as it is).
    const reason = mood?.attributes.reason || "";
    const key = mood?.attributes.reason_key;
    if (!key) return reason;
    const mine = this._moodOwn(s, key);
    // Hashed with the pet's birth (hatched_on), the key and the local date.
    const born = this._state(s, "sensor.life_stage")?.attributes?.hatched_on || s.ids?.device;
    return mine ? dailyPick([reason, reason, ...mine], `${born}|${key}`) : this._lines(s, `reason.${key}`, reason).text;
  }

  // A teen or adult's own content, excited, cozy or bored mood line (P2b; cozy and
  // bored since gaps-seams 4a), or null. It is picked by dailyPick (no Math.random):
  // the sentence is redrawn every tick, so it must not change until the date does.
  // Babies and children keep baby talk.
  _moodOwn(s, key) {
    if (!["content", "excited", "cozy", "bored"].includes(key)) return null;
    return this._persona(s)?.[`mood_${key}`] || null;
  }

  // A page change draws as a handheld's menu does: a four-step wipe, sideways between the
  // pages (UX fix 2, F13). Reduced motion turns the animation off (the global rule).
  // Closing is "up": the same wipe backwards. The sheet is already closed in the card's own state
  // (show-status is off, the pat box and the bubble are back); the page only lingers, drawn over them
  // and deaf to taps (.wipe-up), until the timer takes it off. A timer, not animationend: reduced
  // motion runs no animation (and _toggleStatus does not start one then). An open cancels it (below).
  _wipe(s, kind = "side") {
    s.status.classList.remove("wipe-side", "wipe-down", "wipe-up");
    void s.status.offsetWidth; // restart it
    s.status.classList.add(`wipe-${kind}`);
    clearTimeout(s.wipeTimer);
    s.wipeTimer = setTimeout(() => s.status.classList.remove("wipe-side", "wipe-down", "wipe-up"), kind === "up" ? WIPE_UP_MS : 220);
  }

  _toggleStatus(s, lay = false, name = false) {
    const open = !s.screen.classList.contains("show-status");
    const wasSettings = !open && s.settings && !s.laySheet;
    if (open && this._link?.host === s) this._linkEnd(); // the guest never stands over the page (UX8 F1)
    if (open) this._stopTyping(s); // the bubble hides: the line is said whole
    if (open && s.game) this._quitGame(s, null); // the sheet covers it: nobody plays it unseen
    // A shell mode ends with it too (owner decision D8), unless its entry keeps it (exit.status "keep").
    if (open && s.mode && s.mode.exit?.status !== "keep") this._modeExit(s, "status");
    s.screen.classList.toggle("show-status", open);
    s.statusOpen = open; // the director's `status` busy owner reads it (device-alive 5.3)
    if (!open) this._restOffer = null; // the sheet closed without a button: not an answer (§6.3)
    s.journal = false;
    s.finds = false;
    s.everyWorld = false;
    s.refocus = null;
    s.tileSaid = null;
    s.settings = false;
    s.laySheet = open && lay; // the lay sheet closes with the status (S2)
    s.nameSheet = open && name; // and the name sheet (S3)
    if (!open) {
      s.nameFrom = null;
      s.nameBusy = false; // like every other exit of the name sheet (_closeName)
      this._clearNameTimers(s);
    }
    this._closePicker(s);
    if (open) {
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      this._wipe(s, "down");
    }
    if (!open && !calm() && s === this._slides[this._index]) this._wipe(s, "up");
    this._patSync(s); // back at once when the status closes, not at the next tick
    if (wasSettings) this._settingsReact(s); // closed from the sheet: the pet's word on a change
    else if (!open) {
      s.settingsChanged = null;
      this._perk(s); // the pet is back: it perks up (F13)
    }
    if (s === this._slides[this._index]) {
      this._card.querySelector(".statusbtn").setAttribute("aria-pressed", open ? "true" : "false");
    }
  }

  // Minutes until the egg hatches, or null.
  _eggMinutes(stageState) {
    const at = stageState?.state === "egg" ? stageState.attributes.hatches_at : null;
    return at ? (new Date(at) - serverNow()) / 60000 : null;
  }

  _petFrames(sp, stage, mood, calling, eggMinutes, flags = []) {
    if (stage === "egg") {
      if (!sp.egg) return [];
      // HA ticks every 5 minutes, so each phase spans at least one tick.
      if (eggMinutes != null && eggMinutes <= 6) return sp.egg.crack || sp.egg.idle;
      if (eggMinutes != null && eggMinutes <= 15) return sp.egg.wiggle || sp.egg.idle;
      return sp.egg.idle;
    }
    let drawn = stage;
    if (!sp.stages.includes(drawn)) drawn = sp.stage_fallback?.[stage] || sp.stages[sp.stages.length - 1];
    // Special poses are drawn for the child; other stages would change size.
    if (drawn === "child" && POSE_MOODS.has(mood)) {
      const flag = flags.find((f) => POSES[f] && sp.extras?.[POSES[f]]);
      if (flag) {
        const pose = sp.extras[POSES[flag]];
        return Array.isArray(pose) ? pose : [pose];
      }
    }
    const m = sp.moods.includes(mood) ? mood : "content";
    const frames = [];
    for (let i = 1; i <= (sp.frames || 1); i++) frames.push(`${drawn}_${m}_${i}`);
    return frames;
  }

  // The link greeting's frames: species.json "waves" for the stage (teen, adult, baby;
  // never the child) when every sprite loads, else the excited frames. A wave that
  // fails to load is remembered and swaps itself for excited, even mid-greeting.
  _linkPose(sp, stage, speciesId, apply) {
    const excited = this._petFrames(sp, stage, "excited", false, null, []);
    const waves = stage !== "child" && sp.waves?.[stage];
    if (!Array.isArray(waves) || !waves.length || waves.some((w) => typeof w !== "string")) return excited;
    this._waveOk ||= new Map();
    const key = `${speciesId}/${stage}`;
    const known = this._waveOk.get(key);
    if (known === false) return excited;
    if (known === undefined) {
      const loads = waves.map((w) => new Promise((ok) => {
        const img = new Image();
        img.onload = () => ok(true);
        img.onerror = () => ok(false);
        img.src = spriteSrc(speciesId, w);
      }));
      Promise.all(loads).then((r) => {
        this._waveOk.set(key, r.every(Boolean));
        if (!r.every(Boolean)) apply(excited);
      });
    }
    return waves;
  }

  // A species' own act frames (species.json "acts": a stage only where it is listed) for a stage, or null.
  // Every sprite is probed once, remembered in _poseOk by species/stage/act (not the
  // wave's keys). Unknown plays; a failed load calls `apply` once so the caller swaps
  // back to the frames it had, and later calls get null. Never a broken image. A call
  // while the probe is out (stored as undefined) starts no new one: its `apply` waits too.
  _actPose(sp, stage, speciesId, act, apply) {
    const stages = sp?.acts?.[act];
    if (!act || !stage || !(stages === true || (Array.isArray(stages) && stages.includes(stage)))) return null;
    const names = [`${stage}_${act}_1`, `${stage}_${act}_2`];
    this._poseOk ||= new Map();
    this._poseWait ||= new Map();
    const key = `${speciesId}/${stage}/${act}`;
    const known = this._poseOk.get(key);
    if (known === false) return null;
    if (!this._poseOk.has(key)) {
      this._poseOk.set(key, undefined);
      this._poseWait.set(key, [apply]);
      Promise.all(names.map((n) => new Promise((ok) => {
        const img = new Image();
        img.onload = () => ok(true);
        img.onerror = () => ok(false);
        img.src = spriteSrc(speciesId, n);
      }))).then((r) => {
        const good = r.every(Boolean);
        this._poseOk.set(key, good);
        const waiting = this._poseWait.get(key) || [];
        this._poseWait.delete(key);
        if (!good) waiting.forEach((fn) => fn());
      });
    } else if (known === undefined) {
      this._poseWait.get(key)?.push(apply);
    }
    return names;
  }
}

