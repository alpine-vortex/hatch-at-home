const ACTIVITY_STYLE = `
  .activity-panel {
    position: absolute; inset: 0; z-index: 12; box-sizing: border-box;
    display: flex; flex-direction: column; align-items: stretch; gap: 4px;
    padding: 6px 9%; background: var(--hp-ground, #27463e); color: #fff8e8;
    text-align: center; overflow: hidden; isolation: isolate;
  }
  .activity-panel > header { position: relative; z-index: 1; pointer-events: none; line-height: 1.18; }
  .activity-panel > header strong { display: block; font-size: 15px; }
  .activity-panel > header p { margin: 3px 0 0; font-size: 13px; }
  .activity-body { position: relative; min-height: 0; flex: 1; }
  .activity-panel.full-scene .activity-body { position: absolute; inset: 0; }
  .activity-panel.full-scene > header {
    align-self: center; max-width: 90%; padding: 2px 6px; border-radius: 5px;
    background: rgba(20, 32, 30, .90);
  }
  .activity-body button:focus-visible, .activity-panel:focus-visible {
    outline: 2px solid #fff3a5; outline-offset: 2px;
  }
  .compact .activity-panel > header strong { font-size: 13px; }
  .compact .activity-panel > header p { font-size: 11px; }
  ha-card.bigtext .activity-panel > header p { font-size: 15px; }
  .screen:has(.activity-panel) :is(.pat, .bubble, .basket, .attention) { visibility: hidden; }
  .screen:has(.activity-panel) ~ .request { display: none !important; }
  .screen:has(> .game.activity-picker-crowded:not([hidden])) .bubble { visibility: hidden; }
`;

function activityStyle() {
  return ACTIVITY_STYLE + FETCH_STYLE + POND_CHANNEL_STYLE + OUTING_STYLE +
    SHORE_CRAB_STYLE + HABITAT_STYLE + FAMILY_BEDTIME_STYLE + HOUSEHOLD_HOP_STYLE +
    TASTING_STYLE;
}

class HatchPetCardActivity extends HatchPetCardLink {
  _activityPicker(s) {
    const gameplay = s.house?.gameplay;
    const entry = [
      [gameplay?.pond_channel, "Channel", () => this._pondChannel(s, s.buttons.play)],
      [gameplay?.outing, "Outing", () => this._outingOpen(s, s.buttons.play)],
      [gameplay?.tasting, "Make a snack", () => this._tastingOpen(s, s.buttons.play)],
    ].find(([enabled]) => enabled);
    if (!entry) return;
    const button = document.createElement("button");
    button.dataset.gameplay = "";
    button.textContent = entry[1];
    button.addEventListener("click", entry[2]);
    s.gameBox.querySelector(".gpick").append(button);
  }

  _activityReady(s) {
    return s === this._slides?.[this._index] && !!s.species && !s.egg &&
      !s.asleep && !s.calling && !s.sick && !s.reloading && !s.empty &&
      !this._booting && !s.power;
  }

  _activityOpen(s, options) {
    if (!this._activityReady(s) || !this._activityLeavePicker(s)) return false;
    if (s.screen.classList.contains("show-status")) this._toggleStatus(s);
    this._clearAsk(s);
    this._endActivityFlair(s);
    const panel = document.createElement("section");
    panel.className = options.scene ? "activity-panel full-scene" : "activity-panel";
    panel.tabIndex = -1;
    panel.innerHTML = '<header><strong></strong><p role="status"></p></header><div class="activity-body"></div>';
    panel.addEventListener("click", (event) => event.stopPropagation());
    const activity = s.activity = { ...options, panel, ref: s.house?.gameplay?.pet_ref };
    s.screen.append(panel);
    if (!this._activityUpdate(s)) {
      this._activityClear(s, activity, "invalid");
      return false;
    }
    this._patSync(s, true);
    this._activityFocus(s);
    return true;
  }

  _endActivityFlair(s) {
    this._visitorEnd(s);
    this._seasonVisitEnd(s);
    if (this._link?.host === s || this._link?.guest === s) this._linkEnd();
  }

  _activityUpdate(s) {
    const activity = s.activity;
    if (!activity) return false;
    const active = this.shadowRoot?.activeElement;
    const focused = activity.panel.contains(active) || this._modeButtons(s).includes(active);
    const { panel } = activity;
    const title = shellText(activity.title, s);
    panel.setAttribute("aria-label", title);
    panel.querySelector("strong").textContent = title;
    const text = panel.querySelector("p");
    const line = shellText(activity.text, s);
    if (text.textContent !== line) text.textContent = line;
    text.hidden = !line;
    const box = panel.querySelector(".activity-body");
    box.replaceChildren();
    activity.render?.(box, s);

    const controls = activity.buttons?.(s) || [];
    const exitSlot = activity.exitSlot ?? SHELL_SLOTS;
    const slots = Array.from({ length: SHELL_SLOTS }, (_, i) => {
      const item = controls[i];
      return item ? {
        cap: item.cap || item.label, aria: item.aria || item.label, icon: item.icon, keys: item.keys,
        enabled: () => !item.disabled, on: item.selected == null ? undefined : () => item.selected,
        act: () => item.act(),
      } : null;
    });
    slots[exitSlot - 1] = activity.leave?.(s) || {
      cap: "leave", aria: "Leave activity", icon: "icon_mode_quit",
      act: () => this._activityClose(s, "leave"),
    };
    const mode = {
      id: activity.id, tint: "game", announce: title, slots,
      exit: { slot: exitSlot, escape: true, status: "end", on: ["egg", "calling"] },
      onExit: (_, slide, reason) => this._activityClear(slide, activity, reason),
    };
    const entered = this._modeEnter(s, mode, { from: activity.from });
    if (entered && focused && (!active?.isConnected || active.disabled ||
        !activity.holdCapFocus && active.getAttribute("aria-disabled") === "true")) this._activityFocus(s);
    return entered;
  }

  _activityFocus(s) {
    if (!s.activity) return;
    const controls = this._modeButtons(s);
    const exit = (s.activity.exitSlot ?? SHELL_SLOTS) - 1;
    const first = controls.find((b, i) => i !== exit && !b.disabled &&
      b.getAttribute("aria-disabled") !== "true");
    (first || controls[exit] || s.activity.panel).focus({ preventScroll: true });
  }

  _activityClose(s, reason = "leave") {
    if (s.activity) this._modeExit(s, reason);
  }

  _activityClear(s, activity, reason) {
    if (s.activity !== activity) return;
    const focused = activity.panel.contains(this.shadowRoot?.activeElement);
    s.activity = null;
    activity.panel.remove();
    activity.close?.(reason, s);
    this._activityAffordances(s);
    if (focused && s === this._slides?.[this._index] && reason !== "slide") {
      const from = activity.from;
      (from?.isConnected && !from.hidden && !from.disabled ? from : s.buttons.play)
        ?.focus({ preventScroll: true });
    }
  }

  _patSync(s, hide) {
    const activity = s.activity;
    const ref = s.house?.gameplay?.pet_ref;
    if (activity && (s.calling || s.egg || s.asleep && !activity.keepOnSleep?.() ||
        s.sick || activity.ref && ref && ref !== activity.ref)) {
      this._activityClose(s, "unavailable");
    }
    super._patSync(s, hide);
    this._activityAffordances(s);
  }

  _activityAffordances(s) {
    this._fetchAffordance(s);
    this._shoreCrabAffordance(s);
    this._habitatSync(s);
    this._familyBedtimeAffordance(s);
    this._householdHopSync(s);
  }
}
