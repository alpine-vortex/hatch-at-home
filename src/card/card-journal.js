class HatchPetCardJournal extends HatchPetCardSheets {
  // Set the pet's head, cropped from the sprite on show, as the background of `el` (a square of
  // 2 * cx px, 28 by default, the crop the settings bubble and the status band use); (cx, cy) is where
  // the head's centre and top sit in it. The sprite is drawn at 75 px (a 96-sprite-px window), so the box
  // shows a face and not just the crown that species.head marks (UX7 F2). A species that still
  // shows a back, a wing or a shell there gives species.json "face": {stage: [x, y, size]}: the face's
  // centre and the width of the window around it, in sprite px, and that wins.
  _headCrop(s, el, cx, cy) {
    if (!s.pet?.src || !s.drawn) return false;
    const [hx, hy] = s.species?.head?.[s.drawn] || [128, 96];
    const face = s.species?.face?.[s.drawn];
    let top = face ? hy : this._headTop(s.pet, hx, hy); // the head's top, where a hat sits
    if (top === null && !s.pet.complete) { // not drawn yet (a status opened at once): crop again when it is
      s.pet.addEventListener("load", () => { if (el.isConnected) this._headCrop(s, el, cx, cy); }, { once: true });
    }
    top ??= hy;
    // px per sprite px: the face's window fills the box; else a fixed 75 px sprite
    const k = face ? (cx * 2) / face[2] : (HEAD_SPRITE * (cx / 14)) / 256; // the 75 px sprite scales with the box
    el.style.setProperty("--say-img", `url("${s.pet.src}")`);
    el.style.setProperty("--say-size", `${(256 * k).toFixed(2)}px`);
    el.style.setProperty("--say-at", face ? `${(cx - face[0] * k).toFixed(2)}px ${(cx - face[1] * k).toFixed(2)}px`
      : `${(cx - hx * k).toFixed(2)}px ${(cy - top * k).toFixed(2)}px`);
    return true;
  }

  _statusMessage(s, message) {
    const note = s.status.querySelector(".status-feedback");
    if (!note) return;
    note.textContent = message;
    if (note.classList.contains("say")) this._headCrop(s, note, 14, 3); // its head, cropped from the sprite on show
    note.hidden = false;
    note.style.top = "";
    note.style.bottom = "";
    const tap = this._tapRect && Date.now() - this._tapRect.at < 6000 ? this._tapRect : null;
    if (tap && !note.classList.contains("say")) { // the foot note (sticky): lift it clear of the tapped row, not over it
      const hits = (box) => box.bottom > tap.top - 2 && box.top < tap.bottom + 2;
      if (hits(note.getBoundingClientRect())) {
        note.style.bottom = `${Math.max(0, s.status.getBoundingClientRect().bottom - tap.top + 2)}px`;
        if (hits(note.getBoundingClientRect())) note.style.bottom = ""; // no room above: leave it at the foot
      }
    }
    if (tap && note.classList.contains("say")) { // never hide the row just changed: the bubble drops to the foot
      const hits = (top, bottom) => bottom > tap.top - 2 && top < tap.bottom + 2;
      const box = note.getBoundingClientRect();
      const foot = s.status.getBoundingClientRect().bottom - 4 - box.height;
      if (hits(box.top, box.bottom) && !hits(foot, foot + box.height)) {
        note.style.top = `${foot - s.status.querySelector(".shead").getBoundingClientRect().top}px`;
      }
    }
    // Keyed: a new note restarts the 3.5 s, and the earlier timer is stopped silently (a forget drains it).
    const hide = () => {
      note.hidden = true;
      note.textContent = "";
    };
    this._later(s, 3500, hide, { key: "status.note", undo: hide });
  }

  // Fill the status screen; false if it already shows this (kept as is, so
  // its scroll position and focus survive the update).
  _setStatus(s, html) {
    if (s.statusHtml === html) return false;
    // Keep focus on the same control (a toggle, the journal link) across the redraw.
    const active = this.shadowRoot?.activeElement;
    const keep = !s.status.contains(active) ? null
      : active.dataset?.finish !== undefined ? `.tile[data-finish="${active.dataset.finish}"]` // its marks move
        : active.className
          // not the classes a tap puts on for a moment (_tapped), or the redrawn button never matches (F4)
          ? `.${active.className.trim().split(/\s+/).filter((c) => !PASSING_CLASSES.has(c)).join(".")}${Object.entries(active.dataset || {}).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}="${String(v).replace(/["\\]/g, "\\$&")}"]`).join("")}` : null;
    s.statusHtml = html;
    s.status.innerHTML = html;
    if (keep) s.status.querySelector(keep)?.focus({ preventScroll: true });
    return true;
  }

  // "journal ›" on the status page (open) or "‹ status" in the journal's top band (back).
  _journalLink(s, open) {
    s.status.querySelector(open ? ".jlink" : ".sback")?.addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      s.journal = open;
      s.finds = false;
      s.olderOpen = false; // older generations fold up with the journal
      s.tileSaid = null;
      s.refocus = null;
      if (open) this._loadPhotos(s); // a best friend's photos, theirs only
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      s.status.scrollTop = 0; // a new view starts at its top
      this._wipe(s);
      // Open: the band's back link, at the top where the view is (F5). Back: the link just used.
      s.status.querySelector(open ? ".sback" : ".jlink")?.focus({ preventScroll: true });
    });
  }

  // The top band of a deeper page, as the settings sheet has (UX fix 2, F3): the way back at
  // the left, the page's heading at the right, sticky. `page` marks which page is on show.
  _pageBand(back, title, page, note = "") {
    return `<div class="shead" data-page="${page}"><button class="sback" aria-label="back to ${back.replace(/^\W+/, "")}">${back}</button>` +
      `<span class="stitle" role="heading" aria-level="2">${title}</span>${note}</div>`;
  }

  // Is this page (not its loading view) already on show? Then a redraw keeps it and its place (F2).
  _pageShown(s, page) {
    return !!s.status.querySelector(`.shead[data-page="${page}"]`);
  }

  // Focus a control once the page that has it is drawn (the back link lands on the door it used).
  _refocus(s) {
    if (!s.refocus) return;
    s.status.querySelector(s.refocus)?.focus({ preventScroll: true });
    s.refocus = null;
  }

  // The world's creatures (unraised ones as silhouettes) and this device's past pets.
  async _renderJournal(s) {
    const heading = `journal · ${escape(this._worldName(s).toLowerCase())}`;
    const loading = `
      ${this._pageBand("‹ status", `${heading} · opening…`, "loading")}
      <div class="log">Gathering your pet's memories…</div>`;
    // Already drawn: a redraw (a tick, a message, the photos) replaces it in one go and keeps
    // its place, instead of passing through the short loading view (F2).
    if (!this._pageShown(s, "journal") && this._setStatus(s, loading)) this._journalLink(s, false);
    const stage = this._state(s, "sensor.life_stage")?.attributes || {};
    const roster = stage.roster || [];
    const raised = new Set();
    for (const other of this._slides) {
      const st = this._state(other, "sensor.life_stage")?.attributes;
      if (st?.world === stage.world) (st.raised || []).forEach((r) => raised.add(r));
    }
    const now = {
      generation: stage.generation || 1, name: this._hass.devices?.[s.ids?.device]?.name_by_user
        || this._hass.devices?.[s.ids?.device]?.name || "", species: stage.species,
      traits: stage.traits || [], levels: stage.trait_levels || {}, inherited: stage.inherited_trait,
      games: stage.games || {},
      upbringing: this._state(s, "sensor.life_stage")?.state === "adult" ? stage.upbringing : null,
      // Settled only on becoming a teen: a younger one's (a downgrade, a hand
      // edit) isn't shown.
      personality: ["teen", "adult"].includes(this._state(s, "sensor.life_stage")?.state) ? stage.personality : null,
      current: true,
    };
    const every = [...(stage.journal || []), now];
    const past = every.slice(-4);
    const older = every.slice(0, -4); // behind "older generations (N)"
    const ids = [...new Set([...roster, ...every.map((p) => p.species).filter(Boolean)])];
    const names = {};
    await Promise.all(ids.map((id) => loadJson(`sprites/${id}/species.json`)
      .then((d) => { names[id] = d.name; }).catch(() => { names[id] = id; })));
    if (!s.journal || s.finds) return; // closed (or on to the finds) while the names loaded
    const tiles = roster.map((id) => {
      const known = raised.has(id);
      return `<div class="jtile${known ? "" : " locked"}" role="button" tabindex="0"${known ? "" : ` aria-label="not met yet"`} data-id="${escape(id)}" data-name="${known ? escape(names[id]).toLowerCase() : ""}">` +
        `<img src="${BASE}/sprites/${id}/child_content_1.png?v=${VERSION}" alt="">` +
        `<span>${known ? escape(names[id]).toLowerCase() : "???"}</span></div>`;
    });
    // The family line, oldest first: each generation and its traits.
    const line = (p) =>
      `<div class="gen${p.current ? " now" : ""}">gen ${p.generation}${p.current ? " (now)" : ""} · ` +
      `${escape(p.name)} · ${escape((names[p.species] || "egg").toLowerCase())}` +
      `${p.age_days != null ? ` · ${Math.round(p.age_days)} days` : ""}` +
      `${p.upbringing ? ` · ${escape(p.upbringing)}` : ""}` +
      `${p.personality ? ` · ${escape(String(p.personality).replaceAll("_", " "))}` : ""}` +
      `${gamesPlayed(p.games) ? ` · ${gamesPlayed(p.games)} games` : ""}` +
      `${p.traits?.length ? `<br><span class="gt">${p.traits.map((t) =>
        traitLabel(t, p.levels?.[t], t === p.inherited)).join(" ")}</span>` : ""}</div>`;
    const lines = past.map(line);
    // The rest, oldest first, above the newest four; opened for as long as the journal is.
    const olderLink = older.length
      ? `<button class="jolder">older generations (${older.length})</button>` : "";
    const html = `
      ${this._pageBand("‹ status", `${heading} · gen ${stage.generation || 1}`, "journal", SAY_NOTE)}
      ${this._dreamSaid(s) ? `<div class="jdream">${escape(this._dreamSaid(s))}</div>` : ""}
      ${this._weekStrip(s)}
      <div class="jgrid">${tiles.join("")}</div>
      <button class="wlink">every world ›</button>
      ${this._photoRow(s)}
      <div class="jlist">${olderLink}<div class="jmore"></div>${lines.join("")}${past.length < 2 ? "<div class=\"gt\">a week into adulthood, a pet can lay an egg</div>" : ""}${this._memories(stage.memories, now.name)}</div>
      <div class="jfoot"><button class="flink">${findsShown() ? "finds" : "visitors"} ›</button></div>`;
    const top = s.status.scrollTop;
    if (!this._setStatus(s, html)) return;
    s.status.scrollTop = top; // the place a redraw found it at
    this._journalLink(s, false);
    this._findsLink(s, true);
    this._everyWorldLink(s, true);
    this._tileLines(s);
    this._refocus(s);
    const showOlder = () => {
      s.status.querySelector(".jmore").innerHTML = older.map(line).join("");
      s.status.querySelector(".jolder")?.remove();
      s.olderOpen = true;
    };
    const focusOlder = () => { // the button is gone: focus moves to the first revealed generation
      const first = s.status.querySelector(".jmore .gen");
      if (!first) return;
      first.tabIndex = -1;
      first.focus({ preventScroll: true });
    };
    s.status.querySelector(".jolder")?.addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      showOlder();
      focusOlder();
    });
    if (older.length && s.olderOpen) showOlder();
    s.status.querySelectorAll(".psave").forEach((button) => button.addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      this._savePhoto(s, Number(e.currentTarget.dataset.gen));
    }));
  }

  // --- A best friend's photo ---------------------------------------------------
  // Only the viewer's (virtual_pet/photos, never a sensor), never on a shared
  // screen; each drawn once and kept as a Blob behind a short blob: URL.

  // The journal's "photos" row: a print per generation, oldest first.
  _photoRow(s) {
    if (sharedScreen() || !s.photos?.size) return "";
    const prints = [...s.photos.values()].map(({ photo, url }) =>
      `<figure class="print"><img src="${url}" alt="${escape(this._photoAlt(photo))}">` +
      `<button class="bell psave" data-gen="${photo.generation}" ` +
      `aria-label="${escape(`save the photo of ${photo.name}, generation ${photo.generation}`)}">save</button></figure>`);
    return `<div class="photos"><span>photos</span><div class="prow">${prints.join("")}</div></div>`;
  }

  _photoAlt(photo) {
    return `photo of ${photo.name}, best friends, ${localDay(photo.on, this._hass?.locale?.language)}`;
  }

  // Fetch the viewer's photos when the journal opens, and draw the new ones.
  _loadPhotos(s) {
    // One load in flight per slide: a second open shares it.
    if (!s.photoLoad) s.photoLoad = this._fetchPhotos(s).finally(() => { s.photoLoad = null; });
    return s.photoLoad;
  }

  async _fetchPhotos(s) {
    const id = s.ids?.["sensor.life_stage"];
    if (!id || !this._hass.user || sharedScreen()) return;
    const epoch = s.photoEpoch || 0;
    let photos;
    try {
      photos = (await this._hass.callWS({ type: "virtual_pet/photos", entity_id: id }))?.photos || [];
    } catch (err) {
      return; // an older integration: no photos
    }
    const kept = s.photos || new Map();
    const next = new Map();
    const made = [];
    for (const photo of photos) {
      const sig = JSON.stringify(photo);
      const had = kept.get(photo.generation);
      if (had?.sig === sig) {
        next.set(photo.generation, had);
        continue;
      }
      // A tainted canvas (a Cast receiver) or a missing creature: no print.
      const print = await this._printPhoto(photo).catch(() => null);
      if (print) {
        made.push(print);
        next.set(photo.generation, { ...print, sig, photo });
      }
    }
    if ((s.photoEpoch || 0) !== epoch || s.ids?.["sensor.life_stage"] !== id || sharedScreen()) {
      made.forEach((p) => URL.revokeObjectURL(p.url)); // dropped meanwhile
      return;
    }
    for (const [gen, p] of kept) if (next.get(gen) !== p) URL.revokeObjectURL(p.url);
    s.photos = next;
    if (s.journal && !s.finds) this._renderJournal(s); // never over the finds page
  }

  // A photo as a PNG: the Blob, its URL, and the File a share sheet takes
  // (made now, so "save" can share straight from the tap).
  async _printPhoto(photo) {
    const canvas = await this._renderPhoto(photo);
    const blob = await new Promise((resolve, reject) => {
      try {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no print"))), "image/png");
      } catch (err) {
        reject(err);
      }
    });
    const name = `${String(photo.name).replace(/[\\/:*?"<>|]+/g, "").trim() || "pet"}-best-friends.png`;
    const file = typeof File === "function" ? new File([blob], name, { type: "image/png" }) : null;
    return { blob, url: URL.createObjectURL(blob), file, name };
  }

  // Draw a photo: a cream print with a thicker bottom edge, the creature's day
  // backdrop cropped square, the pet as it was (its drawn stage, scale and
  // perch, as on the shelf), one flair per place, its name and the day.
  // sprite: false leaves the pet out (card-check compares the two).
  async _renderPhoto(photo, { sprite = true } = {}) {
    const sp = await loadJson(`sprites/${photo.species}/species.json`);
    const { w, h, px, pic, edge } = PHOTO;
    const stage = sp.stages?.includes(photo.stage) ? photo.stage
      : sp.stage_fallback?.[photo.stage] || sp.stages?.[sp.stages.length - 1];
    const traits = (photo.traits || []).filter((t) => FLAIR[t]);
    const shown = ["head", "air", "ground"].map((place) => [place, traits.find((t) => FLAIR[t].place === place)])
      .filter(([, t]) => t);
    const flairSrc = (t) => `${BASE}/ui/flair_${FLAIR[t].art ? `${t}_1` : t}.png?v=${VERSION}`;
    const bg = sp.backgrounds?.day || Object.values(sp.backgrounds || {})[0];
    const srcs = [
      bg ? spriteSrc(photo.species, bg) : null,
      sprite ? spriteSrc(photo.species, `${stage}_content_1`) : null,
      sp.perch ? spriteSrc(photo.species, sp.perch) : null,
      ...shown.map(([, t]) => flairSrc(t)),
    ];
    let back, pet, perch, pieces;
    try {
      [back, pet, perch, ...pieces] = await Promise.all(srcs.map((src, i) => (src ? (i > 2 ? loadImage(src).catch(() => null) : loadImage(src)) : null)));
    } finally {
      releaseImages(srcs.filter(Boolean)); // the locals hold them for the draw; the map does not keep them
    }
    try {
      await document.fonts?.load("22px Tiny5");
    } catch (err) {
      // no font loading: the fallback face draws the words
    }
    const canvas = document.createElement("canvas");
    canvas.width = w * px;
    canvas.height = h * px;
    const g = canvas.getContext("2d");
    g.scale(px, px);
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#f6efdc";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#3a2a1a";
    g.fillRect(edge - 2, edge - 2, pic + 4, pic + 4);
    g.save();
    g.beginPath();
    g.rect(edge, edge, pic, pic);
    g.clip();
    if (back) {
      const side = Math.min(back.naturalWidth, back.naturalHeight);
      g.drawImage(back, (back.naturalWidth - side) / 2, back.naturalHeight - side, side, side, edge, edge, pic, pic);
    } else {
      g.fillStyle = "#2b2f3a";
      g.fillRect(edge, edge, pic, pic);
    }
    // The shelf's pet box: 62% of the scene's height, its feet 4% up, centred;
    // species.json "scale" grows it about its feet. The scene is 384 px tall.
    const ks = pic / 384;
    const box = 0.62 * pic * (sp.scale?.[stage] || 1);
    const cx = edge + pic / 2;
    const left = cx - box / 2;
    const top = edge + pic * 0.96 - box;
    if (perch) g.drawImage(perch, left, top, box, box);
    if (pet) g.drawImage(pet, left, top, box, box);
    const k = box / 256;
    const [hx, hy] = sp.head?.[stage] || [128, 96];
    const head = { x: left + hx * k, y: top + hy * k };
    const fy = top + 224 * k;
    const half = box * 0.32;
    const away = head.x >= cx ? -1 : 1; // the air's flair on the other side from the head
    shown.forEach(([place, t], i) => {
      const img = pieces[i];
      if (!img) return;
      const fw = img.naturalWidth * ks;
      const fh = img.naturalHeight * ks;
      // Placed by its bottom middle, as the shelf's flair is.
      const at = place === "head" ? [head.x + (t === "thunder_heart" ? 6 : 0), head.y - 6 * ks]
        : place === "air" ? [cx + away * half * 1.4, head.y + 18 * ks]
          : [cx + (PHOTO_GROUND[t] ?? 1.35) * half, fy + (PHOTO_GROUND_DY[t] ?? 2) * ks];
      g.drawImage(img, at[0] - fw / 2, at[1] - fh, fw, fh);
    });
    g.restore();
    g.fillStyle = "#3a2a1a";
    g.textAlign = "center";
    g.font = "400 22px Tiny5, monospace";
    g.fillText(photo.name, w / 2, edge + pic + 36, pic);
    g.font = "400 14px Tiny5, monospace";
    g.fillText("best friends ♥", w / 2, edge + pic + 58, pic);
    g.font = "400 12px Tiny5, monospace";
    g.fillStyle = "#6a5a44";
    g.fillText(localDay(photo.on, this._hass?.locale?.language), w / 2, edge + pic + 78, pic);
    return canvas;
  }

  // "save": the share sheet where there is one (straight from the tap: WebKit
  // drops the gesture after an await), else the picture in a dialog.
  _savePhoto(s, gen) {
    const p = s.photos?.get(gen);
    if (!p || sharedScreen()) return;
    const files = p.file ? [p.file] : null;
    if (files && navigator.canShare?.({ files })) {
      navigator.share({ files, title: "best friends ♥" }).then(
        () => this._statusMessage(s, "shared"),
        (err) => { if (err?.name !== "AbortError") this._photoDialog(s, gen); }, // cancelled: done
      );
      return;
    }
    this._photoDialog(s, gen);
  }

  // The picture full size, above everything (a modal <dialog>: focus kept in
  // it, Escape closes), to press and hold; a download link outside the apps.
  _photoDialog(s, gen) {
    const p = s.photos?.get(gen);
    if (!p) return;
    let dialog = this.shadowRoot.querySelector(".photo-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "photo-dialog";
      dialog.innerHTML = `<img class="pbig" alt=""><p>press and hold the picture to save it</p>` +
        `<p class="pcomputer" hidden>you can save it from a computer</p><a class="pdownload"></a><button class="bell pclose">close</button>`;
      // It stops every tap: nothing behind it reacts. A tap outside it closes it.
      dialog.addEventListener("click", (e) => {
        e.stopPropagation();
        const box = dialog.getBoundingClientRect();
        const inside = e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
        if (e.target === dialog && !inside) dialog.close();
      });
      dialog.querySelector(".pclose").addEventListener("click", () => dialog.close());
      dialog.querySelector(".pdownload").addEventListener("click", () => {
        if (this._photoFor) this._statusMessage(this._photoFor.s, "saved");
      });
      dialog.addEventListener("close", () => {
        const was = this._photoFor;
        this._photoFor = null;
        // Back to its "save" (the journal may have been redrawn meanwhile).
        was?.s.status.querySelector(`.psave[data-gen="${was.gen}"]`)?.focus({ preventScroll: true });
      });
      this.shadowRoot.append(dialog);
    }
    const img = dialog.querySelector(".pbig");
    img.src = p.url;
    img.alt = this._photoAlt(p.photo);
    const link = dialog.querySelector(".pdownload");
    link.href = p.url;
    link.download = p.name;
    link.textContent = p.name;
    link.hidden = inCompanionApp(); // the apps don't download; press and hold there
    dialog.querySelector(".pcomputer").hidden = !inAndroidApp();
    this._photoFor = { s, gen };
    if (!dialog.open) {
      if (dialog.showModal) dialog.showModal();
      else dialog.setAttribute("open", "");
    }
  }

  // --- Every world (top10 8a) ---------------------------------------------------
  // Each world's creatures, one row a world: drawn and named if a pet on this card has
  // raised it (any world: a device that changed world keeps its `raised`), "???" if
  // not, as in the journal. Nothing locked, nothing counted (owner Q6), no new state.

  // "every world ›" under the journal's grid (open) or "‹ journal" on the page (back).
  _everyWorldLink(s, open) {
    s.status.querySelector(open ? ".wlink" : ".sback")?.addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      s.everyWorld = open;
      s.journal = !open;
      s.tileSaid = null;
      // Open: the band's back link (F5). Back: the journal's "every world ›", once it's drawn.
      s.refocus = open ? null : ".wlink";
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      s.status.scrollTop = 0; // a new view starts at its top
      this._wipe(s);
      if (open) s.status.querySelector(".sback")?.focus({ preventScroll: true });
    });
  }

  async _renderEveryWorld(s) {
    const loading = this._pageBand("‹ journal", "every world · opening…", "loading");
    if (!this._pageShown(s, "every") && this._setStatus(s, loading)) this._everyWorldLink(s, false); // F2
    const raised = new Set();
    for (const other of this._slides) (this._state(other, "sensor.life_stage")?.attributes.raised || []).forEach((r) => raised.add(r));
    // The pet's own world first, then the rest in catalog order (F11).
    const worlds = Object.entries(this._worlds || {})
      .sort(([a], [b]) => (b === s.worldKey) - (a === s.worldKey));
    // A creature whose species.json won't load isn't ready: no tile (never a broken image).
    const names = {};
    await Promise.all(worlds.flatMap(([, w]) => (w.roster || []).map((id) => loadJson(`sprites/${id}/species.json`)
      .then((d) => { names[id] = d.name || id; }).catch(() => {}))));
    if (!s.everyWorld) return; // closed (or back to the journal) while the names loaded
    const rows = worlds.map(([, w]) => {
      const tiles = (w.roster || []).filter((id) => names[id]).map((id) => {
        const known = raised.has(id);
        return `<div class="jtile${known ? "" : " locked"}" role="button" tabindex="0"${known ? "" : ` aria-label="not met yet"`} data-id="${escape(id)}" data-name="${known ? escape(names[id]).toLowerCase() : ""}">` +
          `<img src="${BASE}/sprites/${id}/child_content_1.png?v=${VERSION}" alt="">` +
          `<span>${known ? escape(names[id]).toLowerCase() : "???"}</span></div>`;
      });
      return tiles.length ? `<div class="sec lc">${escape((w.name || "").toLowerCase())}</div><div class="jgrid">${tiles.join("")}</div>` : "";
    });
    const html = `
      ${this._pageBand("‹ journal", "every world", "every", SAY_NOTE)}
      ${rows.join("")}`;
    const top = s.status.scrollTop;
    if (!this._setStatus(s, html)) return;
    s.status.scrollTop = top; // F2: a redraw keeps its place
    this._everyWorldLink(s, false);
    this._tileLines(s);
    this._refocus(s);
  }

  // A tap on a creature's tile: the pet says one line, once a tile for as long as the page
  // is open (UX fix 2, F14). A raised one it names, an unmet one is still a silhouette.
  _tileLines(s) {
    s.status.querySelectorAll(".jtile").forEach((tile) => tile.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tile.click(); }
    }));
    s.status.querySelectorAll(".jtile").forEach((tile) => tile.addEventListener("click", () => {
      const said = (s.tileSaid ??= new Set());
      if (said.has(tile.dataset.id)) return;
      said.add(tile.dataset.id);
      const at = tile.getBoundingClientRect(); // the bubble must not cover the tile just tapped
      this._tapRect = { top: at.top, bottom: at.bottom, at: Date.now() };
      this._statusMessage(s, tile.classList.contains("locked") ? STATUS_COPY.tileUnmet
        : STATUS_COPY.tileRaised(tile.dataset.name));
    }));
  }

  // --- The finds page (visitors v2 §4, V-D) --------------------------------------
  // This world's visitors and finds, read on open from virtual_pet/collection (never a
  // sensor) and kept only while the page is: never in localStorage. The viewer's gifts
  // (`gifts`, sent only when `shared` is false) put a ♥ on their tiles, on their own
  // screen only; a shared screen's flip drops the page and its ♥ (_dropFinds).

  // "finds ›" in the journal's foot (open) or "‹ journal" on the page (back).
  _findsLink(s, open) {
    s.status.querySelector(open ? ".flink" : ".sback")?.addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      s.finds = open;
      s.journal = !open;
      s.tileSaid = null;
      s.refocus = open ? null : ".flink"; // back lands on "finds ›" once the journal is drawn
      if (open) {
        this._dropFinds(s); // read again on each open: the page only grows
        this._loadFinds(s);
      }
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      s.status.scrollTop = 0; // a new view starts at its top
      this._wipe(s);
    });
  }

  // Read the page once per open (one read in flight a slide); a reply for another pet,
  // or from before a shared-screen flip, is dropped. An error (an older server) goes
  // back to the journal, with nothing said.
  _loadFinds(s) {
    if (!s.findsLoad) {
      const load = this._fetchFinds(s).finally(() => { if (s.findsLoad === load) s.findsLoad = null; });
      s.findsLoad = load;
    }
    return s.findsLoad;
  }

  async _fetchFinds(s) {
    const id = s.ids?.["sensor.life_stage"];
    const epoch = s.findsEpoch || 0;
    const shared = sharedScreen();
    const stale = () => (s.findsEpoch || 0) !== epoch || s.ids?.["sensor.life_stage"] !== id || sharedScreen() !== shared;
    let reply = null;
    try {
      if (!id) throw new Error("no pet");
      reply = await this._hass.callWS({ type: "virtual_pet/collection", entity_id: id, shared });
      if (!reply || typeof reply !== "object") throw new Error("no page");
    } catch (err) {
      if (stale() || !s.finds) return;
      s.finds = false;
      s.journal = true;
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      return;
    }
    if (stale()) return;
    s.findsData = { reply, own: !shared };
    if (s.finds) this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
  }

  _renderFinds(s) {
    const data = s.findsData;
    if (!data && !s.findsLoad) this._loadFinds(s); // dropped meanwhile (a shared-screen flip)
    const key = data?.reply?.world || s.worldKey;
    const world = this._worlds?.[key];
    // Named by what it shows: visitors only when FINDS_SHOWN is off (top10 7a).
    const head = `${findsShown() ? "finds" : "visitors"} · ${escape((world?.name || this._worldName(s)).toLowerCase())}`;
    let html;
    if (!data) {
      html = this._pageBand("‹ journal", `${head} · opening…`, "loading");
    } else {
      const own = data.own && !sharedScreen();
      const tile = (t) => {
        const src = t.kind === "visitor" ? `${BASE}/ui/visitor_${key}_${t.id}_1.png?v=${VERSION}`
          : `${BASE}/ui/find_${key}_${t.id}.png?v=${VERSION}`;
        const cls = `ftile${t.kind === "visitor" ? " vis" : ""}${t.met ? "" : " locked"}`;
        // An unmet one: the art's silhouette, with no name, no alt and no label.
        if (!t.met) return `<div class="${cls}"><img src="${src}" alt=""></div>`;
        return `<div class="${cls}"><img src="${src}" alt=""><span>${escape(t.name || "")}</span>` +
          `${t.heart ? `<span class="fheart">♥</span>` : ""}</div>`;
      };
      const tiles = collectionTiles(world, data.reply, own);
      html = `
      ${this._pageBand("‹ journal", head, "finds", SAY_NOTE)}
      ${tiles.length ? "" : `<div class="ssub">nothing here yet</div>`}
      <div class="fgrid">${tiles.filter((t) => t.kind === "visitor").map(tile).join("")}</div>
      ${findsShown() ? `<div class="fgrid">${tiles.filter((t) => t.kind === "find").map(tile).join("")}</div>` : ""}`;
    }
    if (!this._setStatus(s, html)) return;
    this._findsLink(s, false);
  }

  // Forget a slide's finds page (another pet, a shared-screen flip, the sheet closed).
  _dropFinds(s) {
    s.findsEpoch = (s.findsEpoch || 0) + 1;
    s.findsLoad = null; // a read still running will find its epoch stale
    s.findsData = null;
  }

  // Forget a slide's photos (another pet on it, or a shared screen now).
  _dropPhotos(s) {
    s.photoEpoch = (s.photoEpoch || 0) + 1;
    s.photoLoad = null; // a load still running will find its epoch stale
    s.photos?.forEach((p) => URL.revokeObjectURL(p.url));
    s.photos = null;
    if (this._photoFor?.s === s) this.shadowRoot.querySelector(".photo-dialog")?.close();
  }

  // Seasonal firsts and other moments the family remembers, newest first.
  // `name` is the pet's now: a row from a pet without its own name (an old save) uses it.
  _memories(memories, name) {
    if (!memories?.length) return "";
    let sitter = 0;
    const shown = [...memories].reverse().slice(0, MEMORIES_SHOWN)
      .filter((m) => m.kind !== "sitter_visit" || ++sitter <= SITTER_MEMORIES_SHOWN);
    const items = shown.map((m) => {
      const when = new Date(m.at * 1000).toLocaleDateString(undefined,
        { month: "short", day: "numeric", year: "numeric" });
      const label = MEMORY_LINES[m.kind]?.(m, name) || MEMORY_LABELS[m.kind] || m.kind.replace("_", " ");
      return `${escape(label)}, ${escape(when)}`;
    });
    return `<div class="gen"><span class="gt">memories: ${items.join(" · ")}</span></div>`;
  }

  _worldName(s) {
    return s.world?.name || "";
  }
}

