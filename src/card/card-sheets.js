class HatchPetCardSheets extends HatchPetCardStatus {
  // --- The shell picker (in the settings sheet) --------------------------------

  // The picker opens only on a personal screen, and only if the server offers shells.
  _shellPickable(s) {
    return !sharedScreen() && Array.isArray(this._state(s, "sensor.life_stage")?.attributes.shell_finish_options);
  }

  // A pick's name: a finish, or (null, or the world's own key) the world's own.
  _shellName(s, key) {
    return key == null || key === s.world.shell?.finish ? `${this._worldName(s).toLowerCase()} (default)` : finishName(key);
  }

  // A tile's data-finish: "" is the world's own, listed first.
  _tileId(s, key) {
    return key == null || key === s.world.shell?.finish ? "" : key;
  }

  // Leave the picker: an unsaved preview goes and the shell wears its pick again.
  // Every exit calls it: back, the status closing (_toggleStatus), a swipe (_go),
  // another pet (_forget), a shared screen (_goShared).
  _closePicker(s) {
    s.picker = false;
    s.pickerNote = null;
    if (s.previewFinish === undefined) return;
    s.previewFinish = undefined;
    if (s.device && s.world) this._dress(s, this._shellKey(s));
  }

  // The picker: the world's own first, then every finish by group; a locked one shows
  // the stage that opens it. Drawn from the saved pick only, so a hass update leaves
  // it (and its scroll) alone; the preview's mark is put on in place (_pickerMarks).
  _renderPicker(s) {
    const stage = this._state(s, "sensor.life_stage")?.attributes || {};
    const options = new Set(stage.shell_finish_options || []);
    const locked = stage.shell_locked || {};
    const own = s.world.shell?.finish;
    const color = s.world.shell?.color || "#e8834a";
    const now = this._tileId(s, this._shellChoice(s));
    const tile = (key) => {
      const id = this._tileId(s, key);
      const isOwn = key == null || key === own;
      const name = isOwn ? this._worldName(s).toLowerCase() : finishName(key); // the world's own: its name only (F6)
      const open = key == null || options.has(key);
      const at = open ? null : locked[key];
      const aria = at ? `${name} shell, opens at ${at}` : `${name} shell`;
      return `<button class="tile${id === now ? " now" : ""}${open ? "" : " locked"}" data-finish="${id}" ` +
        `aria-label="${escape(aria)}"><span class="sw" style="background: ${finishSwatch(key ?? own, color)}"></span>` +
        `<span class="tname">${escape(name)}</span><span class="tsub">${isOwn ? (id === now ? "default · now" : "default") : id === now ? "now" : at ? escape(at) : ""}</span></button>`;
    };
    const groups = SHELL_GROUPS.map(([head, keys], i) => `<div class="sec" data-group="${head}">${head}</div><div class="tiles">` +
      `${i === 0 ? tile(null) : ""}${keys.filter((k) => k !== own).map(tile).join("")}</div>`).join("");
    const html = `
      <div class="shead"><button class="sback pback" aria-label="back to settings">‹ settings</button>
        <button class="bell puse" aria-label="${escape(this._useAria(s, this._shellChoice(s)))}" aria-disabled="true">use</button>${SAY_NOTE}</div>
      ${groups}`;
    if (!this._setStatus(s, html)) return;
    this._pickerMarks(s);
    if (s.pickerNote && Date.now() < s.pickerNote.until) this._statusMessage(s, s.pickerNote.text); // a redraw dropped it
    const log = () => this._state(s, "sensor.last_care")?.attributes.log || [];
    s.status.querySelectorAll(".sec, .shead").forEach((h) => h.addEventListener("click", (e) => e.stopPropagation()));
    s.status.querySelector(".pback").addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(e.currentTarget);
      this._closePicker(s);
      this._renderStatus(s, log());
      s.status.scrollTop = 0;
      s.status.querySelector(".shellrow")?.focus({ preventScroll: true });
    });
    s.status.querySelectorAll(".tile").forEach((t) => t.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(t);
      if (t.classList.contains("locked")) {
        this._pickerNote(s, "I get this one as a teen ♪");
        return;
      }
      // The live shell is the preview: no save, no redraw of the view.
      s.previewFinish = t.dataset.finish || null;
      this._dress(s, this._shellKey(s));
      this._pickerMarks(s);
    }));
    s.status.querySelector(".puse").addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.currentTarget.getAttribute("aria-disabled") === "true") return; // nothing new to save (F7)
      this._tapped(e.currentTarget);
      this._saveShell(s, s.previewFinish);
    });
  }

  // The tile on the shell now (a preview, else the pick) is marked, and `use` names it.
  _pickerMarks(s) {
    if (!s.picker) return;
    const key = s.previewFinish !== undefined ? s.previewFinish : this._shellChoice(s);
    const sel = this._tileId(s, key);
    const now = this._tileId(s, this._shellChoice(s));
    s.status.querySelectorAll(".tile").forEach((t) => {
      const on = t.dataset.finish === sel;
      t.classList.toggle("sel", on);
      t.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const use = s.status.querySelector(".puse");
    use?.setAttribute("aria-label", this._useAria(s, key));
    // `use` is the confirm step: dimmed until the preview differs from the saved pick (F7).
    use?.setAttribute("aria-disabled", String(s.previewFinish === undefined || this._tileId(s, s.previewFinish) === now));
  }

  // `use`'s label: the finish it saves, or the world's own.
  _useAria(s, key) {
    return this._tileId(s, key) === "" ? "use the world's own shell" : `use ${finishName(key)} shell`;
  }

  // A picker line that a redraw (the sensor's push after a save) puts back.
  _pickerNote(s, text) {
    s.pickerNote = { text, until: Date.now() + 3500 };
    this._statusMessage(s, text);
  }

  // Save a pick (null: the world's own) through the websocket only: no service
  // fallback, since a service call is logged with who made it. The shell wears the
  // pick from the tap (so closing before the reply doesn't flicker); a failure puts
  // it back on the saved one and keeps the picker open.
  _saveShell(s, key) {
    const id = s.ids?.["sensor.life_stage"];
    this._shellSettled(s);
    s.shellPending = key;
    const failed = (code) => {
      if (s.ids?.["sensor.life_stage"] !== id) return; // another pet by now
      if (s.shellPending === key) this._shellSettled(s);
      s.previewFinish = undefined;
      this._dress(s, this._shellKey(s));
      if (code === "shell_locked") s.statusHtml = null; // its options moved on: draw them again
      if (s.picker) this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      this._pickerMarks(s);
      this._pickerNote(s, SHELL_ERRORS[code] || "that didn't work, try later");
    };
    if (!id) {
      failed("no_pet");
      return;
    }
    let timer;
    const late = new Promise((_, reject) => { timer = setTimeout(() => reject({ code: "timeout" }), 10000); });
    Promise.race([this._hass.callWS({ type: "virtual_pet/set_shell", entity_id: id, finish: key }), late])
      .finally(() => clearTimeout(timer))
      .then(() => {
        if (s.ids?.["sensor.life_stage"] !== id) return;
        clearTimeout(s.shellPendingTimer);
        if (s.shellPending === key) s.shellPendingTimer = setTimeout(() => {
          s.shellPending = undefined;
          this._redraw(s);
        }, 5000);
        s.previewFinish = undefined;
        this._dress(s, this._shellKey(s));
        if (s.picker) this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []); // `now` moves
        this._pickerNote(s, key === null ? "back to the world's own ♪" : "shell saved ♪");
        this._settingsChanged(s, "shell");
      })
      .catch((err) => failed(err?.code));
  }

  // The gear in the status view's corner: opens the settings sheet.
  _gearButton() {
    return `<button class="gear" aria-label="settings">${GEAR_ICON}</button>`;
  }

  _gearLink(s) {
    s.status.querySelector(".gear").addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      s.settings = true;
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      s.status.scrollTop = 0; // a new view starts at its top
      this._wipe(s);
      s.status.querySelector(".sback")?.focus({ preventScroll: true });
    });
  }

  // --- The lay sheet (plan-2026-11-02-settings-setup S2) ------------------------------
  // The creatures the next egg may be: the server's `egg_roster` (id and select option,
  // in catalog order) that this card's pets have raised in the egg's world (the pending
  // world's if one waits, else the current one). Never cached: every draw asks the state.
  // null: an older server, or no select to choose with. `surprise` is the select's own
  // first option, sent verbatim; `choice` the offered creature picked now (if any);
  // `outside` a pick made in Home Assistant that is not offered (never named here).
  _eggOffer(s) {
    const stage = this._state(s, "sensor.life_stage")?.attributes;
    const select = this._hass.states[s.ids?.["select.next_egg"]];
    if (!Array.isArray(stage?.egg_roster) || !select?.attributes.options?.length) return null;
    const world = stage.next_world
      ? Object.keys(this._worlds || {}).find((k) => this._worlds[k]?.name === stage.next_world)
      : stage.world;
    if (!world) return null;
    const raised = new Set();
    for (const other of this._slides || []) {
      const st = this._state(other, "sensor.life_stage")?.attributes;
      if (st?.world === world) (st.raised || []).forEach((r) => raised.add(r));
    }
    const offered = stage.egg_roster.filter((r) => raised.has(r.id));
    const picked = stage.next_egg ?? null;
    const choice = offered.find((r) => r.name === picked) || null;
    return { offered, choice, outside: !!picked && !choice, surprise: select.attributes.options[0],
      entity: select.entity_id };
  }

  // C15': the egg's first look, when an offered creature was chosen for it: a line on the
  // screen (an egg doesn't talk), once on this device for this generation.
  _eggComing(s) {
    const choice = this._eggOffer(s)?.choice;
    if (!choice) return null;
    const generation = this._state(s, "sensor.life_stage")?.attributes.generation ?? 1;
    return onceEver(`eggcoming-${s.ids?.device}-${generation}`) ? SETUP_COPY.eggComing(choice.name) : null;
  }

  // Open the lay sheet in the status box (a status already up is redrawn as the sheet).
  _openLay(s) {
    s.confirm = null;
    s.screen.classList.remove("show-status");
    this._toggleStatus(s, true);
    s.laySheetAt = Date.now();
    s.status.scrollTop = 0;
    s.status.querySelector(".layback")?.focus({ preventScroll: true });
  }

  // Close it: every exit comes here (or through _toggleStatus, which clears the flag).
  _closeLay(s) {
    if (s.screen.classList.contains("show-status")) this._toggleStatus(s);
    s.laySheet = false;
  }

  _renderLaySheet(s) {
    const offer = this._eggOffer(s);
    if (!offer || offer.offered.length < 2) { // a world change, an older save: the old two taps
      this._closeLay(s);
      return;
    }
    const row = (id, label, on) =>
      `<button class="bell layrow" data-id="${escape(id)}" aria-pressed="${on}">${escape(label)}</button>`;
    const device = this._hass.devices?.[s.ids?.device];
    const name = device?.name_by_user || device?.name || "Pet";
    const html = `
      <div class="shead"><button class="sback layback">${SETUP_COPY.layBack}</button>
        <button class="bell laygo" aria-label="${escape(`${SETUP_COPY.layConfirm}: ${name} retires to the journal and a new egg takes its place`)}">${SETUP_COPY.layConfirm}</button></div>
      <div class="sec">${SETUP_COPY.laySheetHeading}</div>
      <div class="shellnote">${SETUP_COPY.layPrompt}</div>
      <div class="laylist">
        ${row("", SETUP_COPY.laySurprise, !offer.choice && !offer.outside)}
        ${offer.outside ? `<div class="bell layrow ro" aria-current="true">${SETUP_COPY.layOutside}</div>` : ""}
        ${offer.offered.map((r) => row(r.id, r.name.toLowerCase(), offer.choice?.id === r.id)).join("")}
      </div>
      <div class="status-feedback" role="status" aria-live="polite" hidden></div>`;
    if (!this._setStatus(s, html)) return;
    s.status.querySelectorAll(".sec, .shead, .shellnote, .laylist").forEach((h) => h.addEventListener("click", (e) => e.stopPropagation()));
    s.status.querySelector(".layback").addEventListener("click", (e) => {
      e.stopPropagation(); // the screen behind would close the status
      this._tapped(e.currentTarget);
      this._closeLay(s); // nothing is laid; the pick stays the next egg's
    });
    s.status.querySelectorAll(".layrow[data-id]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tapped(b);
      this._layPick(s, b.dataset.id);
    }));
    s.status.querySelector(".laygo").addEventListener("click", (e) => {
      e.stopPropagation();
      // The tap that opened the sheet must not also lay (a fast double tap).
      if (Date.now() - (s.laySheetAt || 0) < CONFIRM_GAP_MS) return;
      this._tapped(e.currentTarget, s);
      this._press(s, "lay_egg");
      this._closeLay(s);
    });
  }

  // A row: the select's own option string, at once ("" is the surprise: options[0]).
  async _layPick(s, id) {
    const offer = this._eggOffer(s);
    const option = id === "" ? offer?.surprise : offer?.offered.find((r) => r.id === id)?.name;
    if (!option) return; // it left the offer meanwhile: the next draw shows what is
    try {
      await this._hass.callService("select", "select_option", { entity_id: offer.entity, option });
    } catch (err) {
      // A read-only login is refused: the choice stays as it was.
      const refused = /unauthori|forbidden|permission/i.test(`${err?.code} ${err?.message}`);
      this._statusMessage(s, refused ? SETUP_COPY.layRefused : SETTINGS_AGAIN.failed);
    }
  }

  // --- Naming the new generation (settings S3) -------------------------------------------
  // The pet's name as the household sees it: the device's own name if set, else its name.
  _petName(s) {
    const device = this._hass.devices?.[s.ids?.device];
    return device?.name_by_user || device?.name || "";
  }

  // The tap of a lay: remember which generation it is leaving. The name sheet opens when this
  // pet's life-stage sensor shows an egg of the next one (_nameWatch). A lay the server refuses
  // changes nothing, so nothing opens; the wait is dropped after 30 s (longer while the entry
  // reloads, as it does after a lay that moves the world), on a pet change and on a failed press.
  _layWatch(s) {
    const generation = Number(this._state(s, "sensor.life_stage")?.attributes.generation);
    this._layDrop(s);
    if (!Number.isFinite(generation)) return null;
    const mark = { generation, at: Date.now() };
    s.layAt = mark;
    const check = () => {
      if (s.layAt !== mark) return;
      if (s.reloading && Date.now() - mark.at < NAME_WAIT_MAX_MS) {
        s.layTimer = setTimeout(check, 5000); // still reloading: keep waiting
        return;
      }
      s.layAt = null;
    };
    s.layTimer = setTimeout(check, NAME_WAIT_MS);
    return mark;
  }

  _layDrop(s) {
    s.layAt = null;
    clearTimeout(s.layTimer);
  }

  // Called with each drawn state of a pet that is not reloading: opens the name sheet when the
  // lay this screen made has hatched a new egg, and closes it when it has nothing left to name.
  _nameWatch(s, stageState) {
    const stage = stageState?.state;
    const generation = Number(stageState?.attributes.generation);
    if (s.layAt && stage === "egg" && generation === s.layAt.generation + 1) {
      this._layDrop(s);
      this._openName(s, "lay");
    }
    if (s.nameSheet && ((stage !== "egg" && stage !== "baby") || !Object.is(generation, s.nameGen))) {
      this._closeName(s); // a child, or another generation: nothing to name here
    }
  }

  // Open the sheet: from the lay (the status box opens on it) or from the status page's row.
  _openName(s, from) {
    this._clearNameTimers(s);
    s.confirm = null;
    s.nameFrom = from;
    s.nameGen = Number(this._state(s, "sensor.life_stage")?.attributes.generation);
    s.nameBusy = false;
    if (from === "lay") {
      s.screen.classList.remove("show-status");
      this._toggleStatus(s, false, true);
    } else {
      s.nameSheet = true;
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      this._wipe(s);
    }
    s.nameSheetAt = Date.now();
    s.status.scrollTop = 0;
    s.status.querySelector(".nameinput")?.focus({ preventScroll: true });
  }

  // Every exit comes here (the status chip and the page flags go through _toggleStatus, which
  // clears the flag itself).
  _closeName(s) {
    const from = s.nameFrom;
    this._clearNameTimers(s);
    s.nameSheet = false;
    s.nameFrom = null;
    s.nameBusy = false;
    if (from === "status" && s.screen.classList.contains("show-status")) {
      this._renderStatus(s, this._state(s, "sensor.last_care")?.attributes.log || []);
      s.status.scrollTop = 0;
      this._wipe(s);
      s.status.querySelector(".namechange")?.focus({ preventScroll: true });
    } else if (s.screen.classList.contains("show-status")) {
      this._toggleStatus(s);
    }
  }

  _clearNameTimers(s) {
    clearTimeout(s.nameRetry);
    s.nameRetry = null;
  }

  _renderNameSheet(s) {
    const stage = this._state(s, "sensor.life_stage")?.state;
    if (stage !== "egg" && stage !== "baby") {
      this._closeName(s);
      return;
    }
    const name = this._petName(s);
    const html = `
      <div class="shead"><button class="sback nameback">${escape(SETUP_COPY.nameKeep(name || "Pet"))}</button>
        <button class="bell namego">${SETUP_COPY.nameSave}</button></div>
      <div class="sec">${SETUP_COPY.nameHeading}</div>
      <input class="nameinput" type="text" value="${escape(name)}" maxlength="${NAME_MAX}"
        aria-label="the new egg's name, up to ${NAME_MAX} characters" aria-describedby="nameerr"
        autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done">
      <div class="nameerr" id="nameerr" role="alert" hidden></div>
      <div class="status-feedback" role="status" aria-live="polite" hidden></div>`;
    if (!this._setStatus(s, html)) return;
    const input = s.status.querySelector(".nameinput");
    s.status.querySelectorAll(".sec, .shead").forEach((h) => h.addEventListener("click", (e) => e.stopPropagation()));
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("input", () => this._nameError(s, null));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        this._nameSave(s);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation(); // "keep", not the status's own Escape
        this._nameKeep(s);
      }
    });
    s.status.querySelector(".nameback").addEventListener("click", (e) => {
      e.stopPropagation();
      if (Date.now() - (s.nameSheetAt || 0) < CONFIRM_GAP_MS) return; // the tap that opened it
      this._tapped(e.currentTarget);
      this._nameKeep(s);
    });
    s.status.querySelector(".namego").addEventListener("click", (e) => {
      e.stopPropagation();
      if (Date.now() - (s.nameSheetAt || 0) < CONFIRM_GAP_MS) return;
      this._tapped(e.currentTarget, s);
      this._nameSave(s);
    });
  }

  _nameKeep(s) {
    if (s.nameBusy) return;
    this._closeName(s);
  }

  // The error line under the field (null clears it).
  _nameError(s, line) {
    const note = s.status.querySelector(".nameerr");
    if (!note) return;
    note.textContent = line || "";
    note.hidden = !line;
  }

  async _nameSave(s) {
    if (s.nameBusy || !s.nameSheet) return;
    const input = s.status.querySelector(".nameinput");
    const typed = input.value.normalize("NFC").split(/\s+/).filter(Boolean).join(" ");
    if (!nameShows(typed)) {
      this._nameError(s, SETUP_COPY.nameBad);
      input.focus({ preventScroll: true });
      return;
    }
    const generation = s.nameGen;
    const still = () => s.nameSheet && s.nameGen === generation;
    s.nameBusy = true;
    s.status.querySelector(".namego")?.classList.add("pending");
    const entity = s.ids?.["sensor.life_stage"];
    let name = null;
    let code = null;
    for (let attempt = 0; attempt < 2 && name === null; attempt++) {
      try {
        const reply = await this._hass.callWS({ type: "virtual_pet/rename", entity_id: entity, name: typed });
        name = reply?.name || typed;
      } catch (err) {
        code = err?.code || "unknown";
        // The entry is reloading (a lay that moved the world): once more in 2 s, then N18.
        if (code !== "not_ready" || attempt) break;
        await new Promise((resolve) => { s.nameRetry = setTimeout(resolve, NAME_RETRY_MS); });
        if (!still()) return;
      }
    }
    if (!still()) return; // the sheet closed meanwhile (a swipe, the chip, a child)
    s.nameBusy = false;
    s.status.querySelector(".namego")?.classList.remove("pending");
    if (name === null) {
      this._nameError(s, NAME_ERRORS[code] ? SETUP_COPY[NAME_ERRORS[code]] : SETUP_COPY.nameFailed);
      input.focus({ preventScroll: true });
      return;
    }
    const line = SETUP_COPY.nameSaved(name);
    const stage = this._state(s, "sensor.life_stage")?.state;
    const from = s.nameFrom;
    this._closeName(s);
    if (from === "status") this._statusMessage(s, line); // the status page is where the tap was
    else if (stage === "egg") this._write(s, line, 4000); // an egg can't talk: the line on the screen
    else this._speak(s, line, 4000);
  }

  // A tap on a two-tap control (confirmTap): true when it confirms. Otherwise
  // the button says "sure? tap again" until the window closes, then redraw().
  _confirmed(s, key, button, redraw) {
    const was = s.confirm?.key;
    if (confirmTap(s, key)) return true;
    if (was && was !== key) s.confirmRedraw?.(); // the other one disarmed
    s.confirmRedraw = redraw;
    button.textContent = "sure? tap again"; // in place: a redraw would drop focus
    button.setAttribute("aria-label", CONFIRM_ARIA[key]);
    s.statusHtml = null; // the screen no longer matches it: the next redraw writes
    clearTimeout(s.confirmTimer);
    s.confirmTimer = setTimeout(redraw, s.confirm.at + CONFIRM_MS + 50 - Date.now());
    return false;
  }

  // "My day" is per person too: steps, stairs and sleep from their own phones.
  async _setMyDay(s, enabled, button) {
    const id = s.ids?.["sensor.life_stage"];
    if (!id) return;
    button.classList.add("pending");
    button.setAttribute("aria-pressed", String(enabled));
    button.textContent = enabled ? "on" : "off";
    this._setMine("my_day", enabled); // at once, so a redraw before the push keeps it
    try {
      await this._callOwn("my_day", { entity_id: id, enabled });
      this._myDay = enabled; // one switch per person, for every pet
      this._statusMessage(s, enabled ? SETTINGS_COPY.myDayOn : SETTINGS_COPY.myDayOff);
    } catch (err) {
      this._setMine("my_day", !enabled);
      button.setAttribute("aria-pressed", String(!enabled));
      button.textContent = !enabled ? "on" : "off";
      this._statusMessage(s, SETTINGS_AGAIN.failed);
    } finally {
      button.classList.remove("pending");
    }
  }

  // Baby talk is the person's, for every pet and device: kept on the server
  // (a websocket command, off the event bus), cached here by user ID.
  async _setBabyTalk(s, enabled, button) {
    const id = s.ids?.["sensor.life_stage"];
    const user = this._hass.user?.id;
    if (!id || !user) return;
    button.classList.add("pending");
    button.setAttribute("aria-pressed", String(enabled));
    button.textContent = enabled ? "on" : "off";
    setBabyTalk(user, enabled); // at once, so a re-render mid-call draws the new state
    this._setMine("baby_talk", enabled);
    try {
      await this._hass.callWS({ type: "virtual_pet/baby_talk", entity_id: id, enabled });
      if (enabled) {
        // The status screen hides the bubble, so the note always shows; a baby
        // or child on screen says hello as well, for when the screen closes.
        this._statusMessage(s, SETTINGS_COPY.babyTalkOn);
        if (this._babyStage(s)) {
          const name = short(this._hass.user?.name?.trim().split(/\s+/)[0], 16);
          const baby = this._babySet(s, "greet"); // a child's hello is the normal one
          this._speak(s, name ? (baby ? pick(baby)(name) : this._hourHello(name)) : "hi hi!", 4000);
        }
      }
    } catch (err) {
      setBabyTalk(user, !enabled);
      this._setMine("baby_talk", !enabled);
      button.setAttribute("aria-pressed", String(!enabled));
      button.textContent = !enabled ? "on" : "off";
      this._statusMessage(s, SETTINGS_AGAIN.failed);
    } finally {
      button.classList.remove("pending");
    }
  }

  // The viewer's own switches: from the channel's "mine" once it has spoken,
  // else as the last visit reply had them (undefined: not known yet).
  _mineSwitch(s, key, fallback) {
    return s.mine ? !!s.mine[key] : fallback;
  }

  // A switch of the viewer's own (one per person, for every pet): every
  // slide's copy at once; the channel's push confirms it.
  _setMine(key, value) {
    for (const slide of this._slides || []) if (slide.mine) slide.mine[key] = value;
  }

  // "notify me" and "my day" as websocket commands (off the event bus). A
  // server older than this card has only the services: those, then.
  async _callOwn(command, data) {
    try {
      return await this._hass.callWS({ type: `virtual_pet/${command}`, ...data });
    } catch (err) {
      if (err?.code !== "unknown_command") throw err;
      return this._hass.callService("virtual_pet", command, data);
    }
  }

  // Phone notifications are per user: this only changes them for whoever is signed in.
  async _setNotify(s, enabled) {
    const id = s.ids?.["sensor.life_stage"];
    if (!id) return false;
    const button = s.status.querySelector(".bell.notify");
    if (button) {
      button.classList.add("pending");
      button.setAttribute("aria-pressed", String(enabled));
      button.textContent = enabled ? "on" : "off";
    }
    // At once, so a redraw before the push keeps it (this pet's, not every pet's).
    if (s.mine) s.mine.notify_me = enabled;
    try {
      await this._callOwn("notify_me", { entity_id: id, enabled });
      this._statusMessage(s, enabled ? SETTINGS_COPY.notifyOn : SETTINGS_COPY.notifyOff);
      this._settingsChanged(s, enabled ? "notifyOn" : null);
      return true;
    } catch (err) {
      if (s.mine) s.mine.notify_me = !enabled;
      if (button) {
        button.setAttribute("aria-pressed", String(!enabled));
        button.textContent = !enabled ? "on" : "off";
      }
      this._statusMessage(s, SETTINGS_AGAIN.failed);
      return false;
    } finally {
      button?.classList.remove("pending");
    }
  }
}

