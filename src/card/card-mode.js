class HatchPetCardMode extends HatchPetCardActions {
  // --- Shell modes (docs/plan-2026-11-04-shell-modes.md, slice 1) ----------------
  //
  // A shell mode swaps the eight round buttons for its length; the card puts them back. The modes are
  // table entries (shell-modes.js) or a probe object; anyone may enter one (owner decision D6: this is a
  // general mode, games are only its first users), so nothing in this part names a game. `s.mode` is the
  // slide's mode (null at rest), per slide as a game is: a neighbour keeps its care caps.
  //
  // One writer: _paintCaps is the only code that writes the eight buttons' state (disabled, the classes,
  // the aria, the title, the caption, the icon). _update hands it the care state; with a mode on it keeps
  // that as s.careHome and paints the mode's slots instead, so a hass push never paints over a swap, and
  // the exit restores the care state of the last push, not a snapshot taken at the enter.

  // The eight, in slot order: ACTIONS (slots 1-7), then the lights (slot 8).
  _modeButtons(s) {
    return [...ACTIONS.map((a) => s.buttons[a.key]), s.buttons.lights];
  }

  // The care state as the buttons are built: every field a care paint writes, nothing pressed or wanted.
  // _update fills in the live state; a mode left before the first push restores this.
  _careRest() {
    const care = {};
    for (const a of ACTIONS) {
      care[a.key] = { disabled: false, wanted: false, on: false, desc: null, icon: ACTION_ICONS[a.key], cap: a.label, aria: a.aria || null, title: null };
    }
    care.lights = { disabled: false, wanted: false, on: false, desc: null, icon: null, cap: "", aria: null, title: null };
    return care;
  }

  _paintCaps(s, care) {
    s.careHome = care;
    if (s.mode) {
      this._modeSync(s);
      return;
    }
    for (const b of this._modeButtons(s)) this._capWrite(b, care[b.dataset.action] || {}, false);
  }

  // One button's look, from a care state or a slot's (`tinted`: a mode's slot).
  _capWrite(b, v, tinted) {
    b.disabled = !!v.disabled;
    b.classList.toggle("wanted", !!v.wanted);
    b.classList.toggle("on", !!v.on);
    b.classList.toggle("armed", v.pressed === true);
    b.classList.toggle("tinted", tinted);
    const attr = (name, val) => (val == null ? b.removeAttribute(name) : b.setAttribute(name, val));
    attr("aria-description", v.desc || null);
    attr("aria-label", v.aria);
    attr("title", v.title || null);
    attr("aria-hidden", v.hidden ? "true" : null);
    attr("aria-disabled", v.blocked ? "true" : null);
    attr("aria-pressed", v.pressed == null ? null : String(v.pressed));
    const caption = b.lastElementChild;
    if (caption && caption.textContent !== (v.cap || "")) caption.textContent = v.cap || "";
    const key = v.icon || "";
    if (b.dataset.icon !== key) {
      b.querySelector(".cap").innerHTML = shellIcon(key);
      b.dataset.icon = key;
    }
  }

  // A slot's state: live (a press runs act), blocked (enabled(s) is false: aria-disabled, still
  // focusable, a press does nothing), off (null: native disabled, aria-hidden, no label, out of the tab
  // order). No live or blocked slot is natively disabled, so no entity state can drop the focus.
  _slotState(s, slot) {
    if (!slot) return { disabled: true, hidden: true, aria: "", cap: "", icon: "" };
    const cap = shellText(slot.cap, s);
    const aria = shellText(slot.aria, s) || cap;
    return {
      cap, aria, icon: slot.icon || "",
      title: slot.title !== undefined ? shellText(slot.title, s) : aria,
      blocked: !!slot.enabled && !slot.enabled(s),
      pressed: slot.on ? !!slot.on(s) : null,
    };
  }

  _modeLive(s, slot) {
    return !!slot && !(slot.enabled && !slot.enabled(s));
  }

  // Repaints the slots from the slot functions: cheap and idempotent. A mode's own state change calls
  // it, and _paintCaps does on each hass push.
  _modeSync(s) {
    const m = s.mode;
    if (!m) return;
    this._modeButtons(s).forEach((b, i) => this._capWrite(b, this._slotState(s, m.slots[i]), true));
    s.device.classList.add("moded");
    s.device.style.setProperty("--mode-tint", SHELL_TINTS[m.tint] || "");
  }

  // One cap-press rebound on all eight as they change (translate only: style.js `.toy.swap`), none
  // under reduced motion: the change is instant then.
  _modeSwap(s) {
    if (calm()) return;
    const all = this._modeButtons(s);
    clearTimeout(s.swapTimer);
    all.forEach((b) => b.classList.add("swap"));
    s.swapTimer = setTimeout(() => all.forEach((b) => b.classList.remove("swap")), 90);
  }

  // `from` is the care button pressed to get here (or null): the focus goes back to it at the exit.
  // The same id again only repaints. Another id replaces the one on (its onExit hears "replace"), and
  // `from` stays the first care button, never a swapped cap. Returns whether the mode is on.
  _modeEnter(s, mode, { from = null } = {}) {
    const bad = shellCheck(mode);
    if (!s || bad.length) {
      if (bad.length) console.warn("hatch-pet-card: a shell mode was refused:", bad.join("; "));
      return false;
    }
    if (s.mode && s.mode.id === mode.id) {
      s.mode = mode;
      this._modeSync(s);
      return true;
    }
    const old = s.mode;
    if (old) {
      s.mode = null;
      old.onExit?.(this, s, "replace");
    } else s.modeFrom = from;
    if (s.scene) this._sceneEnd(s); // as a press does: the scene ends, showing how things are now
    s.mode = mode;
    s.modeAt = Date.now();
    this._modeSync(s);
    this._modeSwap(s);
    // One announcement, in the mode's own live node (nothing else writes it, so a prompt that follows
    // at once does not replace it): its lead, then the live slots (a blocked or off one is not said).
    const said = mode.slots.map((slot) => this._modeLive(s, slot) && (shellText(slot.cap, s) || shellText(slot.aria, s))).filter(Boolean);
    s.modeLive.textContent = [mode.announce, said.join(", ")].filter(Boolean).join(": ");
    // The focus moves to the first live slot, if it was on this slide (a press brought the mode on);
    // a mode that starts by itself takes no focus from the page.
    const root = this.shadowRoot;
    if (s.el.contains(root?.activeElement)) {
      const all = this._modeButtons(s);
      const first = all.find((b, i) => this._modeLive(s, mode.slots[i])) || all.find((b, i) => mode.slots[i]);
      first?.focus({ preventScroll: true });
    }
    return true;
  }

  // Idempotent. `s.mode` is cleared first, then the mode's onExit runs (it ends what the mode started,
  // and may come back here: a no-op), then the care state of the last push comes back. The focus, if it
  // was on one of the eight, goes to `from` if that is live, else to the first live care button.
  _modeExit(s, reason) {
    const m = s?.mode;
    if (!m) return false;
    s.mode = null;
    const all = this._modeButtons(s);
    const had = all.includes(this.shadowRoot?.activeElement);
    m.onExit?.(this, s, reason);
    if (s.mode) return true; // its onExit entered another: that one paints
    s.device.classList.remove("moded");
    s.device.style.removeProperty("--mode-tint");
    s.modeLive.textContent = "";
    this._paintCaps(s, s.careHome || this._careRest(s));
    this._modeSwap(s);
    if (had) [s.modeFrom, ...all].find((b) => b && all.includes(b) && !b.disabled)?.focus({ preventScroll: true });
    s.modeFrom = null;
    return true;
  }

  // The one click handler of each of the eight (bound at build). At rest: the care tap. In a mode: a
  // live slot runs its act, after closing an open status sheet (as a care press does); a blocked or off
  // slot does nothing, sends nothing and plays no rim cue.
  _modeClick(s, i) {
    const b = this._modeButtons(s)[i];
    const m = s.mode;
    if (!m) {
      s.careTaps?.[i]?.(b);
      return;
    }
    const slot = m.slots[i];
    if (!this._modeLive(s, slot)) return;
    if (!s.laySheet && s.screen.classList.contains("show-status")) this._toggleStatus(s);
    s.modeAt = Date.now();
    this._tapped(b, s, { perk: false });
    slot.act(this, s);
  }

  // Escape (bound on the device): the exit slot's act, when the mode takes Escape. False: not handled.
  _modeEscape(s) {
    const m = s.mode;
    const slot = m?.exit?.escape && m.exit.slot ? m.slots[m.exit.slot - 1] : null;
    if (!slot) return false;
    s.modeAt = Date.now();
    slot.act(this, s);
    return true;
  }

  // The engine's own reasons to end a mode: idle (exit.idleMs since idleAt(s), default the last accepted
  // press, unless idleHold(s)), and asleep, away and egg when exit.on lists them. From _update (the care
  // flags are fresh there) and _tick (idle must not wait for a hass push).
  _modeGuard(s, now = Date.now()) {
    const m = s.mode;
    if (!m) return;
    const exit = m.exit || {};
    for (const reason of SHELL_EXIT_ON) {
      if (exit.on?.includes(reason) && s[reason]) {
        this._modeExit(s, reason);
        return;
      }
    }
    if (!exit.idleMs || exit.idleHold?.(s)) return;
    const at = exit.idleAt ? exit.idleAt(s) : s.modeAt;
    if (at && now - at >= exit.idleMs) this._modeExit(s, "idle");
  }
}
