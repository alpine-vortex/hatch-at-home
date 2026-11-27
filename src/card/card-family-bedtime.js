const FAMILY_BEDTIME_STYLE = `
  .screen > .family-bedtime-entry {
    position: absolute; z-index: 4; top: 10%; left: 50%; width: max-content;
    max-width: 80%; translate: -50% 0; min-height: 44px; padding: 4px 10px;
    border: 1px solid #3b302d; border-radius: 8px; box-shadow: 1px 2px #3b302d;
    background: #fff1d1; color: #302725; font: inherit; font-size: 12px; cursor: pointer;
  }
  .screen > .family-bedtime-entry[hidden] { display: none; }
  .screen > .family-bedtime-entry:focus-visible {
    outline: 2px solid #fff8e8; outline-offset: 2px; box-shadow: 0 0 0 5px #342a24;
  }
  ha-card.bigtext .family-bedtime-entry { font-size: 15px; }
  .family-bedtime-scene { position: absolute; inset: 0; background: #303a40; }
  .family-bedtime-backdrop {
    inset: 0; width: 100%; height: 100%; object-fit: cover; filter: brightness(.72);
  }
  .family-bedtime-scene[data-pose="parent"] .family-bedtime-backdrop,
  .family-bedtime-scene[data-pose="both"] .family-bedtime-backdrop { filter: brightness(.47) saturate(.78); }
  .family-bedtime-pet {
    bottom: 7%; height: 58%; translate: -50% 0; transform-origin: center bottom;
    filter: drop-shadow(1px 2px 0 #171b23);
  }
  .family-bedtime-child { left: 31%; }
  .family-bedtime-parent { left: 68%; }
  .family-bedtime-scene[data-pose="ready"]:not(:has(.family-bedtime-parent)) .family-bedtime-child { left: 50%; }
`;

const FAMILY_BEDTIME_TIMERS = "family-bedtime";

class HatchPetCardFamilyBedtime extends HatchPetCardHabitat {
  _familyBedtimeAffordance(s) {
    const offer = !!s.house?.gameplay?.family_bedtime?.offer;
    let button = s.screen.querySelector(".family-bedtime-entry");
    if (!button && offer) {
      button = document.createElement("button");
      button.className = "family-bedtime-entry";
      button.type = "button";
      button.textContent = "Bedtime with parent";
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!button.hidden) this._familyBedtimeOpen(s, button);
      });
      s.screen.append(button);
    }
    if (!button) return;
    button.hidden = !offer || !this._activityReady(s) || this._owned(s) || !!s.scene ||
      s.lightsOut || s.gone || s.linking || this._questionOn(s) ||
      s.screen.classList.contains("show-status");
  }

  _familyBedtimeOpen(s, from) {
    const ref = s.house?.gameplay?.pet_ref;
    const entity = s.ids?.["sensor.life_stage"];
    if (!ref || !entity || !s.house?.gameplay?.family_bedtime?.offer) return;
    const requestId = Array.from(crypto.getRandomValues(new Uint8Array(16)),
      (n) => n.toString(16).padStart(2, "0")).join("");
    const bedtime = {
      ref, entity, requestId, pose: "ready", ready: false,
      note: "Waiting for your parent…",
    };
    this._tapped(from, s, { perk: false });
    const opened = this._activityOpen(s, {
      id: "family_bedtime", title: "Bedtime together", scene: true, exitSlot: 7, from,
      text: () => bedtime.note,
      keepOnSleep: () => !!bedtime.tucking || bedtime.pose !== "ready",
      buttons: () => this._familyBedtimeButtons(s, bedtime),
      render: (box) => this._familyBedtimeRender(box, s, bedtime),
      close: () => this._stop(s, { group: FAMILY_BEDTIME_TIMERS }),
    });
    if (!opened) return;
    bedtime.activity = s.activity;
    void this._familyBedtimeSend(s, bedtime, "invite");
  }

  _familyBedtimeButtons(s, bedtime) {
    const controls = [];
    if (bedtime.retryInvite) {
      controls[3] = {
        label: "Try inviting again", cap: "retry", act: () => this._familyBedtimeSend(s, bedtime, "invite"),
      };
    }
    if (bedtime.ready) {
      controls[7] = {
        label: "Dim the lamp", cap: "dim lamp", icon: "icon_lights_out",
        disabled: !!bedtime.request || bedtime.pose !== "ready",
        act: () => this._familyBedtimeSend(s, bedtime, "tuck"),
      };
    }
    return controls;
  }

  _familyBedtimeRender(box, s, bedtime) {
    const room = document.createElement("div");
    room.className = "family-bedtime-scene";
    room.dataset.pose = bedtime.pose;
    room.setAttribute("aria-hidden", "true");
    const append = (cls, pet, frame) => {
      if (!frame) return null;
      const img = document.createElement("img");
      img.className = cls;
      img.alt = "";
      this._show(pet, img, frame);
      room.append(img);
      return img;
    };
    const backdrop = s.species.backgrounds || {};
    append("family-bedtime-backdrop", s, backdrop.night || backdrop.day);
    const childFrame = s.framesOf?.(bedtime.pose === "both" ? "asleep" : "content")?.[0];
    const child = append("family-bedtime-pet family-bedtime-child", s, childFrame);
    if (child) child.style.scale = String(s.species.scale?.[s.drawn] || 1);
    const parent = bedtime.parent;
    if (parent) {
      const sleeping = parent.asleep || bedtime.pose !== "ready";
      const img = append("family-bedtime-pet family-bedtime-parent", parent,
        sleeping ? parent.sleep : parent.awake);
      if (img) img.style.scale = `${-parent.scale} ${parent.scale}`;
    }
    box.append(room);
  }

  async _familyBedtimeSend(s, bedtime, action) {
    if (bedtime.request || s.activity !== bedtime.activity) return;
    const request = bedtime.request = {};
    const current = () => s.activity === bedtime.activity && bedtime.request === request &&
      s.house?.gameplay?.pet_ref === bedtime.ref;
    const failed = () => {
      if (!current()) return;
      bedtime.request = null;
      bedtime.tucking = false;
      bedtime.retryInvite = action === "invite";
      bedtime.note = action === "invite" ? "The invitation got lost. Try again?" : "Could not dim the lamp. Try again?";
      if (s.asleep) this._activityClose(s, "unavailable");
      else this._activityUpdate(s);
    };
    bedtime.retryInvite = false;
    bedtime.tucking = action === "tuck";
    bedtime.note = bedtime.tucking ? "Dimming the lamp…" : "Waiting for your parent…";
    this._activityUpdate(s);
    const waiting = { group: FAMILY_BEDTIME_TIMERS, key: "family-bedtime.request" };
    this._later(s, 8000, failed, waiting);
    let reply;
    try {
      reply = await this._hass.callWS({
        type: "virtual_pet/family_bedtime", entity_id: bedtime.entity,
        pet_ref: bedtime.ref, request_id: bedtime.requestId, action,
      });
      if (current() && action === "invite" && reply?.result === "ok") {
        const { species, asleep } = reply.parent || {};
        if (typeof species !== "string" || !/^[a-z0-9_-]+$/.test(species)) throw new Error("Missing guest artwork");
        const art = await loadJson(`sprites/${species}/species.json`);
        if (!current()) return;
        const stage = art.stages.includes("adult") ? "adult" : art.stage_fallback?.adult || art.stages.at(-1);
        bedtime.parent = {
          speciesId: species, asleep, scale: art.scale?.[stage] || 1,
          awake: this._petFrames(art, "adult", "content", false, null)[0],
          sleep: this._petFrames(art, "adult", "asleep", false, null)[0],
        };
      }
    } catch (err) {
      if (current()) this._stop(s, waiting);
      failed();
      return;
    }
    if (!current()) return;
    this._stop(s, waiting);
    bedtime.request = null;
    bedtime.tucking = false;
    if (reply?.result === "ok") {
      if (action === "tuck") this._familyBedtimeSettle(s, bedtime);
      else {
        bedtime.ready = true;
        bedtime.note = bedtime.parent.asleep ? "Parent’s dozing. Dim the lamp."
          : "Your parent is here. Dim the lamp.";
        this._activityUpdate(s);
        if (this.shadowRoot?.activeElement === this._modeButtons(s)[6]) this._activityFocus(s);
      }
    } else if (s.asleep || reply?.result === "pet_changed") {
      this._activityClose(s, "unavailable");
    } else {
      const refused = reply?.result === "not_sleepy";
      if (!refused) {
        bedtime.parent = null;
        bedtime.ready = false;
      }
      bedtime.note = refused ? "Your pet isn’t sleepy yet."
        : reply?.result === "completed" ? "You’ve already had your first bedtime together."
          : "Bedtime together is unavailable right now.";
      this._activityUpdate(s);
    }
  }

  _familyBedtimeSettle(s, bedtime) {
    bedtime.pose = "parent";
    bedtime.note = "Your parent curls up…";
    this._activityUpdate(s);
    const options = { group: FAMILY_BEDTIME_TIMERS, hidden: "keep" };
    this._later(s, 650, () => {
      if (s.activity !== bedtime.activity) return;
      bedtime.pose = "both";
      bedtime.note = "Goodnight.";
      this._activityUpdate(s);
      this._rimCue(s, "lights");
    }, options);
    this._later(s, 2400, () => {
      if (s.activity === bedtime.activity) this._activityClose(s, "complete");
    }, options);
  }

  _channel(s, msg, user) {
    const echo = msg?.moment;
    if (echo?.type !== "family_bedtime_echo") return super._channel(s, msg, user);
    const ref = s.house?.gameplay?.pet_ref;
    const until = Date.parse(echo.at) + 15000;
    if (!ref || echo.id !== ref || s.familyBedtimeEchoSeen === ref ||
        !(serverNow() < until)) return;
    s.familyBedtimeEchoSeen = ref;
    if (s !== this._slides?.[this._index]) return;
    if (s.scene?.kind === "lights" && !s.scene.wake) {
      s.scene.familyBedtimeEcho = { ref, until };
    } else this._familyBedtimeEcho(s, { ref, until });
  }

  _sceneEnd(s, options) {
    const echo = s.scene?.familyBedtimeEcho;
    super._sceneEnd(s, options);
    if (echo && !options?.quiet && !options?.swipe) this._familyBedtimeEcho(s, echo);
  }

  _familyBedtimeEcho(s, { ref, until }) {
    if (serverNow() >= until) return;
    this._line(s, BEAT, "all curled up, just like my parent", 3200, {
      type: "family_bedtime_echo",
      still: () => s.asleep && s.house?.gameplay?.pet_ref === ref && serverNow() < until,
    });
  }
}
