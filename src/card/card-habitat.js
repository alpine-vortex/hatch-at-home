const HABITAT_VERSION = 1;
const HABITAT_SPOTS = ["Left spot", "Right spot"];
const HABITAT_PROPS = {
  hideout: { label: "Woodland hideout", short: "Hideout", art: "icon_habitat_woodland_hideout" },
  cup: { label: "Acorn-cap cup", short: "Cup", art: "icon_habitat_woodland_cup" },
};
const HABITAT_USE = { group: "habitat.use" };
const HABITAT_NOTE = { key: "habitat.note" };
const HABITAT_REQUEST = { key: "habitat.request" };

const HABITAT_STYLE = `
  .habitat-home { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
  .habitat-home[hidden], .screen.show-status > .habitat-home { display: none; }
  .habitat-spot {
    position: absolute; bottom: 14%; width: 23%; height: 33%;
    display: grid; place-items: end center;
  }
  .habitat-spot:first-child { left: 3%; }
  .habitat-spot:nth-child(2) { right: 3%; }
  .porthole .habitat-spot:first-child { left: 8%; }
  .porthole .habitat-spot:nth-child(2) { right: 8%; }
  .screen:has(> .habitat-home:not([hidden])) > :is(.scene-bowl, .scene-pill) { z-index: 2; }
  .habitat-spot::before {
    content: ""; position: absolute; bottom: 4%; width: 68%; height: 8%;
    border-block-end: 2px dotted #e9d6a5; opacity: .48;
  }
  .habitat-spot:has(button:not([hidden]))::before { opacity: .75; }
  .screen .habitat-object {
    position: relative; display: grid; place-items: end center; width: 100%; height: 100%;
    min-width: 44px; min-height: 44px; padding: 0; border: 0; background: none;
    cursor: pointer; pointer-events: auto; border-radius: 7px; -webkit-tap-highlight-color: transparent;
  }
  .screen .habitat-object[hidden] { display: none; }
  .screen .habitat-object:focus-visible {
    outline: 2px solid #fff6cf; outline-offset: -2px;
    box-shadow: inset 0 0 0 4px #263024;
  }
  .screen .habitat-object > .habitat-prop, .screen .habitat-prop {
    position: relative; width: 100%; height: 100%; object-fit: contain; object-position: center bottom;
  }
  .habitat-object:active > img { filter: brightness(1.16); }
  .screen .habitat-peek {
    position: absolute; width: 34%; height: 30%; left: 33%; bottom: 12%;
    border-radius: 45% 45% 10% 10%; pointer-events: none;
    background: var(--say-img) var(--say-at) / var(--say-size) no-repeat; image-rendering: pixelated;
  }
  .habitat-peek[hidden] { display: none; }
  .habitat-note {
    position: absolute; left: 50%; bottom: 2%; translate: -50% 0;
    width: max-content; max-width: 88%; margin: 0; padding: 2px 5px;
    border: 1px solid #33261d; border-radius: 4px; background: #fff3d1; color: #281e16;
    font-size: 12px; line-height: 1.15; text-align: center;
  }
  .habitat-note:empty { padding: 0; border: 0; }
  .screen.habitat-using > .pet {
    animation: none; translate: calc(var(--habitat-step, 42%) * var(--habitat-dir)) 0;
    transition: translate .28s ease-out, transform .23s ease-out;
  }
  .screen.habitat-using > :is(.perch, .ghost) { visibility: hidden; }
  .screen.habitat-left { --habitat-dir: -1; }
  .screen.habitat-right { --habitat-dir: 1; }
  .screen.habitat-left[data-habitat-act="cup"] > .pet { rotate: y 180deg; }
  .screen.habitat-using[data-habitat-phase="back"] > .pet { translate: 0 0; rotate: none; }
  .screen.habitat-using[data-habitat-act="hideout"][data-habitat-phase="use"] > .pet { visibility: hidden; }
  .screen.habitat-using[data-habitat-act="cup"][data-habitat-phase="use"] > .pet {
    transform: translateY(6%) rotate(12deg) scaleY(.8);
  }
  .screen.habitat-using[data-habitat-act="cup"][data-habitat-phase="up"] > .pet {
    transform: translateY(-5%) rotate(-8deg) scaleY(1.04);
  }
  .habitat-preview { position: absolute; inset: 0; background: #344e3b center / cover no-repeat; }
  .habitat-preview .habitat-spot { width: 33%; height: 44%; bottom: 8%; z-index: 1; }
  .habitat-preview .habitat-spot.selected::before {
    width: 96%; height: 75%; border: 2px dashed #fff3bf; border-radius: 8px; opacity: 1;
  }
  .habitat-preview .habitat-prop { width: 64%; height: 83%; bottom: 17px; }
  .habitat-preview .habitat-spot span {
    position: absolute; left: 0; right: 0; bottom: 0;
    padding: 2px; color: #fff9e6; background: #293c30; border: 1px solid #eee1b5;
    border-radius: 4px; font-size: 12px; line-height: 1.1;
  }
  .habitat-preview .habitat-spot.selected span { background: #fff3cf; color: #2d2a20; }
  .screen .habitat-preview .habitat-preview-pet {
    bottom: 9%; left: 50%; width: 38%; translate: -50% 0;
  }
  ha-card.bigtext .habitat-note, ha-card.bigtext .habitat-preview .habitat-spot span { font-size: 14px; }
  @media (prefers-reduced-motion: reduce) {
    .screen.habitat-using > .pet { transition: none; }
  }
`;

function habitatView(raw) {
  if (raw?.version !== HABITAT_VERSION || !Number.isSafeInteger(raw.revision) || raw.revision < 0 ||
      !Array.isArray(raw.slots) || raw.slots.length !== 2) return null;
  const cup = raw.cup === true;
  const known = (id) => typeof id === "string" && Object.hasOwn(HABITAT_PROPS, id) &&
    (id !== "cup" || cup) ? id : null;
  const [left, right] = raw.slots.map(known);
  return { revision: raw.revision, cup, slots: [left, left === right ? null : right] };
}

function habitatAssign(slots, spot, prop) {
  const next = [...slots];
  if (prop && next[1 - spot] === prop) next[1 - spot] = null;
  next[spot] = prop;
  return next;
}

function habitatSame(left, right) {
  return left[0] === right[0] && left[1] === right[1];
}

function habitatArt(prop) {
  return `${BASE}/ui/${HABITAT_PROPS[prop].art}.png?v=${VERSION}`;
}

class HatchPetCardHabitat extends HatchPetCardShoreCrab {
  _habitatRead(s) {
    const game = s.house?.gameplay;
    if (s.worldKey !== "woodland" || !game?.pet_ref) return null;
    const layout = habitatView(game.habitat);
    if (!layout) return null;
    const receipt = s.habitatReceipt;
    if (receipt?.ref === game.pet_ref && receipt.layout.revision > layout.revision) {
      return { ...receipt.layout, cup: layout.cup || receipt.layout.cup };
    }
    s.habitatReceipt = null;
    return layout;
  }

  _habitatOpen(s, from) {
    const layout = this._habitatRead(s);
    const id = s.ids?.["sensor.life_stage"];
    if (!layout || !id) return false;
    const edit = {
      base: layout, draft: [...layout.slots], spot: 0, note: "", request: null,
      ref: s.house.gameplay.pet_ref, id,
    };
    const status = this._card?.querySelector(".statusbtn");
    const opened = this._activityOpen(s, {
      id: "furnish", title: "Furnish", from: status || from, scene: true,
      text: () => edit.note || (edit.base.cup ? "Choose a spot and a prop." : "Find an acorn to unlock the cup."),
      buttons: () => this._habitatButtons(s, edit),
      render: (box) => this._habitatPreview(box, s, edit),
      close: () => {
        this._stop(s, HABITAT_REQUEST);
        s.habitatEdit = null;
      },
    });
    if (!opened) return false;
    edit.activity = s.activity;
    s.habitatEdit = edit;
    this._habitatSync(s);
    return true;
  }

  _habitatButtons(s, edit) {
    const disabled = !!edit.request;
    const refresh = () => {
      edit.note = "";
      this._activityUpdate(s);
    };
    const spot = (index, key) => ({
      label: HABITAT_SPOTS[index], cap: index ? "right" : "left",
      icon: index ? "icon_mode_right" : "icon_mode_left",
      keys: [key], disabled, selected: edit.spot === index,
      act: () => { edit.spot = index; refresh(); },
    });
    const prop = (id, key) => ({
      label: id ? HABITAT_PROPS[id].label : "Empty this spot",
      cap: id ? HABITAT_PROPS[id].short : "empty",
      icon: id ? HABITAT_PROPS[id].art : "−",
      keys: [key], disabled: disabled || id === "cup" && !edit.base.cup,
      selected: edit.draft[edit.spot] === id,
      act: () => { edit.draft = habitatAssign(edit.draft, edit.spot, id); refresh(); },
    });
    return [
      spot(0, "ArrowLeft"), prop("hideout", "h"), prop("cup", "c"), spot(1, "ArrowRight"),
      prop(null, "e"),
      { label: "Swap the two spots", cap: "swap", icon: "↔", keys: ["s"],
        disabled: disabled || habitatSame(edit.draft, [null, null]),
        act: () => { edit.draft = [...edit.draft].reverse(); refresh(); } },
      { label: "Confirm furnishings", cap: "save", icon: "icon_mode_keep",
        disabled: disabled || habitatSame(edit.draft, edit.base.slots),
        act: () => this._habitatConfirm(s, edit) },
    ];
  }

  _habitatPreview(box, s, edit) {
    const scene = document.createElement("div");
    scene.className = "habitat-preview";
    const bg = s.bg.getAttribute("src");
    if (bg) scene.style.backgroundImage = `url("${bg}")`;
    for (const [i, label] of HABITAT_SPOTS.entries()) {
      const spot = document.createElement("div");
      spot.className = "habitat-spot";
      spot.classList.toggle("selected", i === edit.spot);
      const id = edit.draft[i];
      if (id) {
        const prop = document.createElement("img");
        prop.className = "habitat-prop";
        prop.src = habitatArt(id);
        prop.alt = "";
        spot.append(prop);
      }
      const caption = document.createElement("span");
      caption.textContent = `${i ? "Right" : "Left"} · ${id ? HABITAT_PROPS[id].short : "Empty"}`;
      caption.setAttribute("aria-label", `${label}, ${id ? HABITAT_PROPS[id].label : "empty"}`);
      spot.append(caption);
      scene.append(spot);
    }
    const src = s.pet.getAttribute("src");
    if (src) {
      const pet = document.createElement("img");
      pet.className = "habitat-preview-pet";
      pet.alt = "";
      pet.src = src;
      pet.style.scale = s.pet.style.scale;
      scene.append(pet);
    }
    box.append(scene);
  }

  async _habitatConfirm(s, edit) {
    if (s.activity !== edit.activity || edit.request || habitatSame(edit.draft, edit.base.slots)) return;
    const request = edit.request = {};
    const current = () => this.isConnected && s.activity === edit.activity && edit.request === request &&
      s.house?.gameplay?.pet_ref === edit.ref;
    const failed = (line = "The save stopped responding. Try again.") => {
      if (!current()) return;
      edit.request = null;
      edit.note = line;
      this._activityUpdate(s);
    };
    edit.note = "Saving furnishings…";
    this._activityUpdate(s);
    this._later(s, 8000, failed, HABITAT_REQUEST);
    let reply;
    try {
      reply = await this._hass.callWS({
        type: "virtual_pet/habitat", action: "confirm", entity_id: edit.id, pet_ref: edit.ref,
        version: HABITAT_VERSION, revision: edit.base.revision, slots: [...edit.draft],
      });
    } catch (err) {
      if (!current()) return;
      this._stop(s, HABITAT_REQUEST);
      failed(err?.code === "forbidden" ? "This screen can't save furnishings." : undefined);
      return;
    }
    if (!current()) return;
    this._stop(s, HABITAT_REQUEST);
    if (reply?.result === "pet_changed" || reply?.result === "not_now") {
      this._activityClose(s, "unavailable");
      return;
    }
    const layout = habitatView(reply);
    if (!layout || !["ok", "changed", "illegal"].includes(reply.result)) {
      failed();
      return;
    }
    const latest = this._habitatRead(s);
    edit.base = latest?.revision > layout.revision ? latest : layout;
    edit.draft = [...edit.base.slots];
    edit.request = null;
    edit.note = reply.result === "changed" ? "Another screen saved first. Choose again."
      : reply.result === "illegal" ? "That arrangement is unavailable." : "Furnishings saved.";
    s.habitatReceipt = { ref: edit.ref, layout: edit.base };
    this._habitatSync(s);
    this._activityUpdate(s);
  }

  _habitatBuild(s) {
    const layer = document.createElement("div");
    layer.className = "habitat-home";
    const spots = HABITAT_SPOTS.map((label, index) => {
      const pad = document.createElement("div");
      pad.className = "habitat-spot";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "habitat-object";
      button.hidden = true;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!this._swiped) this._habitatTap(s, index);
      });
      const art = document.createElement("img");
      art.className = "habitat-prop";
      art.alt = "";
      const peek = document.createElement("span");
      peek.setAttribute("aria-hidden", "true");
      peek.className = "habitat-peek";
      peek.hidden = true;
      button.append(art, peek);
      pad.append(button);
      layer.append(pad);
      return { label, button, art, peek, id: undefined };
    });
    const note = document.createElement("p");
    note.className = "habitat-note";
    note.setAttribute("role", "status");
    layer.append(note);
    s.screen.insertBefore(layer, s.pat);
    return s.habitatHome = { layer, spots, note };
  }

  _habitatSync(s) {
    const layout = this._habitatRead(s);
    const edit = s.habitatEdit;
    const ref = s.house?.gameplay?.pet_ref;
    if (edit && s.activity === edit.activity && (!layout || edit.ref !== ref)) {
      this._activityClose(s, "unavailable");
    } else if (edit && layout && !edit.request) {
      const clean = habitatSame(edit.draft, edit.base.slots);
      if ((clean && layout.revision !== edit.base.revision) || layout.cup !== edit.base.cup) {
        edit.base = clean ? layout : { ...edit.base, cup: layout.cup };
        if (clean) edit.draft = [...layout.slots];
        this._activityUpdate(s);
      }
    }
    const home = s.habitatHome || (layout && this._habitatBuild(s));
    if (!home) return;
    if (home.ref !== ref) {
      this._habitatStop(s);
      home.ref = ref;
      home.idleCount = 0;
      home.lastIdle = null;
    }
    const active = s === this._slides?.[this._index] && !s.reloading && !s.empty && !s.gone;
    const covered = this._booting || s.power || s.linking || this._owned(s) ||
      this._questionOn(s) || s.screen.classList.contains("show-status");
    const visible = !!layout && active && !covered;
    const use = s.habitatUse;
    if (use && (!visible || s.scene || s.calling || s.asleep || s.lightsOut || s.egg || s.sick ||
        s.visitor || s.seasonVisit || layout.slots[use.spot] !== use.prop)) this._habitatStop(s);
    const focused = this.shadowRoot?.activeElement;
    if (!active || covered || !layout) {
      if (home.layer.contains(focused) && active && !this._owned(s)) {
        this._card?.querySelector(".statusbtn")?.focus({ preventScroll: true });
      }
      if (home.note.textContent) this._habitatQuiet(s);
    }
    home.layer.hidden = !visible;
    home.spots.forEach((spot, index) => {
      const id = layout?.slots[index];
      if (spot.id === id) return;
      spot.id = id;
      spot.button.hidden = !id;
      if (!id) {
        spot.art.removeAttribute("src");
        if (active && spot.button === focused) this._card?.querySelector(".statusbtn")?.focus({ preventScroll: true });
        return;
      }
      const label = `${HABITAT_PROPS[id].label} · ${spot.label.toLowerCase()}`;
      spot.button.setAttribute("aria-label", label);
      spot.button.title = label;
      spot.art.src = habitatArt(id);
    });
  }

  _habitatAvailable(s) {
    return this._activityReady(s) && this._freeBody(s) && !this._questionOn(s) &&
      !s.seasonVisit && !s.lightsOut && !s.habitatUse;
  }

  _habitatTap(s, index) {
    const home = s.habitatHome;
    const prop = home?.spots[index].id;
    if (!prop || home.layer.hidden) return;
    if (!this._habitatAvailable(s)) {
      const line = s.habitatUse ? "Already exploring." : "Your pet is busy just now.";
      this._habitatMessage(s, line);
      return;
    }
    this._habitatAct(s, index, prop);
  }

  _habitatIdle(s) {
    const home = s.habitatHome;
    if (!home || home.layer.hidden || s.vroom || !this._habitatAvailable(s)) return false;
    const options = home.spots.map((spot, index) => ({ prop: spot.id, index })).filter(({ prop }) => prop);
    if (!options.length) return false;
    if (++home.idleCount < 3) return false; // two ordinary idles between furnishing acts
    const next = options.find(({ prop }) => prop !== home.lastIdle) || options[0];
    this._habitatAct(s, next.index, next.prop);
    return true;
  }

  _habitatMessage(s, line) {
    const note = s.habitatHome.note;
    this._habitatQuiet(s);
    note.textContent = line;
    const clear = () => { note.textContent = ""; };
    this._later(s, 2300, clear, { ...HABITAT_NOTE, hidden: "tab", undo: clear });
  }

  _habitatQuiet(s) {
    this._stop(s, HABITAT_NOTE);
    s.habitatHome.note.textContent = "";
  }

  _habitatAct(s, index, prop) {
    const home = s.habitatHome;
    const { peek } = home.spots[index];
    const reduced = calm();
    const use = s.habitatUse = { spot: index, prop };
    const cleanup = () => {
      if (s.habitatUse !== use) return;
      s.habitatUse = null;
      s.screen.classList.remove("habitat-using", "habitat-left", "habitat-right");
      delete s.screen.dataset.habitatAct;
      delete s.screen.dataset.habitatPhase;
      s.screen.style.removeProperty("--habitat-step");
      peek.hidden = true;
    };
    home.idleCount = 0;
    home.lastIdle = prop;
    this._habitatQuiet(s);
    s.screen.dataset.habitatAct = prop;
    s.screen.dataset.habitatPhase = "approach";
    if (prop === "cup") {
      const head = s.species?.head?.[s.drawn]?.[0] ?? 160;
      const step = Math.max(12, Math.min(35, 45 - (head - 128) * 100 / 256));
      s.screen.style.setProperty("--habitat-step", `${step}%`);
    }
    s.screen.classList.add("habitat-using", index ? "habitat-right" : "habitat-left");
    this._moving(s, reduced ? 1850 : 2090);
    const later = (ms, step) => this._later(s, ms, step, { ...HABITAT_USE, hidden: "tab", undo: cleanup });
    const inspect = () => {
      s.screen.dataset.habitatPhase = "use";
      if (prop === "hideout") {
        peek.hidden = false;
        const radius = peek.getBoundingClientRect().width / 2;
        this._headCrop(s, peek, radius, radius / 5);
      }
      this._habitatMessage(s, prop === "hideout" ? "Peeking out of the hideout." : "A little sip from the cup.");
    };
    if (reduced) {
      inspect();
      if (prop === "cup") later(950, () => { s.screen.dataset.habitatPhase = "up"; });
      later(1850, cleanup);
      return;
    }
    later(300, inspect);
    later(1170, () => {
      peek.hidden = true;
      s.screen.dataset.habitatPhase = "up";
    });
    later(1730, () => { s.screen.dataset.habitatPhase = "back"; });
    later(2090, cleanup);
  }

  _habitatStop(s) {
    if (!s.habitatUse) return;
    this._drain(s, HABITAT_USE);
    this._habitatQuiet(s);
  }

  _sceneStart(s, kind) {
    this._habitatStop(s);
    return super._sceneStart(s, kind);
  }
}
