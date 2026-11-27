const POND_CHANNEL_WAIT_MS = 2000;
const POND_CHANNEL_WAIT_KEY = "pond-channel.start";
const POND_CHANNEL_PENDING = "Checking the water level…";

const POND_CHANNEL_CONTROLS = {
  gates: [
    { id: "left", cap: "Left", label: "Turn left gate", icon: "icon_mode_left", keys: ["ArrowLeft"] },
    { id: "right", cap: "Right", label: "Turn right gate", icon: "icon_mode_right", keys: ["ArrowRight"] },
    { id: "release", cap: "Release", label: "Release pod", icon: "icon_mode_down", keys: ["ArrowDown"] },
  ],
  eddy: [{ id: "reset", cap: "Reset", label: "Reset pod", icon: "icon_mode_up", keys: ["ArrowUp"] }],
  stones: [
    { id: "near", cap: "Near", label: "Step onto near stone", icon: "icon_mode_left", keys: ["ArrowLeft"] },
    { id: "far", cap: "Far", label: "Step onto far stone", icon: "icon_mode_right", keys: ["ArrowRight"] },
  ],
  catch: [{ id: "bring", cap: "Bring", label: "Bring pod", icon: "icon_mode_down", keys: ["ArrowDown"] }],
  done: [{ id: "again", cap: "Again", label: "Play Channel again", icon: "icon_mode_restart" }],
};

const POND_CHANNEL_STYLE = `
  .pond-channel-board { position: absolute; inset: 0; isolation: isolate; overflow: hidden;
    border: 1px solid #203323; border-radius: 5px; background: #344e3c; }
  .pond-channel-board img { position: absolute; display: block; image-rendering: pixelated; }
  .pond-channel-board .pond-channel-habitat,
  .pond-channel-board .pond-channel-waterway { inset: 0; width: 100%; height: 100%; }
  .pond-channel-board .pond-channel-habitat { object-fit: cover; object-position: 50% 58%; }
  .pond-channel-board .pond-channel-actor { width: min(36%, 74px); height: auto;
    transform: translate(-50%, -87.5%); }
  .pond-channel-board .pond-channel-pod { width: clamp(17px, 9%, 25px); height: auto;
    transform: translate(-50%, -50%); }
  .pond-channel-board .pond-channel-marker { position: absolute; transform: translate(-50%, -50%);
    padding: 1px 4px; border: 1px solid #233334; border-radius: 3px; background: #ffffdf; color: #233334;
    font: 600 11px/1.05 system-ui, sans-serif; white-space: nowrap; }
  .pond-channel-board .pond-channel-gate { position: absolute; inset: 0; background: #fff7c4;
    filter: drop-shadow(0 1px 0 #172e31); }
  .pond-channel-board .pond-channel-gate.left {
    clip-path: polygon(51% 28%, 47% 28%, 37% 45%, 35% 40%, 33% 52%, 43% 50%, 39% 47%); }
  .pond-channel-board .pond-channel-gate.right {
    clip-path: polygon(49% 28%, 53% 28%, 63% 45%, 65% 40%, 67% 52%, 57% 50%, 61% 47%); }
`;

function pondChannelStep(round, id) {
  if (!POND_CHANNEL_CONTROLS[round.phase]?.some((control) => control.id === id)) return;
  switch (id) {
    case "left":
    case "right":
      round.gate = id;
      round.text = id === "left" ? "The left gate points to the catch." : "The right gate points into the eddy.";
      break;
    case "release":
      if (!round.gate) break;
      if (round.gate === "right") {
        round.phase = "eddy";
        round.text = "The pod is in the eddy. Reset it to try again.";
      } else {
        round.phase = "catch";
        round.text = "Caught! Bring the seed pod up to the bank.";
      }
      break;
    case "reset":
      round.phase = "gates";
      round.gate = null;
      round.text = "The pod is back. Try the gate toward your pet.";
      break;
    case "near":
      round.stone = 1;
      round.text = "Your pet can reach the far stone now.";
      break;
    case "far":
      if (round.stone === 0) {
        round.text = "Too far. Try the near stone first.";
      } else {
        round.stone = 2;
        round.phase = "catch";
        round.text = "At the pod! Bring it to the bank.";
      }
      break;
    case "bring":
      round.phase = "done";
      round.text = "Your pet brings you the seed pod!";
      break;
  }
}

class HatchPetCardPondChannel extends HatchPetCardFetch {
  _pondChannel(s, from) {
    const gameplay = s.house?.gameplay;
    if (s.worldKey !== "pond" || !gameplay?.pond_channel || !gameplay.pet_ref || s.pondChannel) return false;
    const session = { petRef: gameplay.pet_ref, round: { text: POND_CHANNEL_PENDING } };
    s.pondChannel = session;
    const opened = this._activityOpen(s, {
      id: "pond-channel", from,
      title: () => ({ wet: "Rain-filled Channel", dry: "Dry Channel" }[session.round.layout] || "Channel"),
      text: () => session.round.text,
      buttons: () => (POND_CHANNEL_CONTROLS[session.round.phase] || []).map((control) => ({
        ...control,
        disabled: control.id === "release" && !session.round.gate,
        selected: ["left", "right"].includes(control.id) ? session.round.gate === control.id : undefined,
        act: () => {
          if (s.pondChannel !== session) return;
          if (control.id === "again") this._pondChannelStart(s, session);
          else {
            pondChannelStep(session.round, control.id);
            this._activityUpdate(s);
          }
        },
      })),
      render: (box) => this._pondChannelDraw(box, s, session.round),
      close: () => {
        this._stop(s, { key: POND_CHANNEL_WAIT_KEY });
        s.pondChannel = null;
      },
    });
    if (!opened) {
      s.pondChannel = null;
      return false;
    }
    void this._pondChannelStart(s, session);
    return true;
  }

  async _pondChannelStart(s, session) {
    const round = { text: POND_CHANNEL_PENDING };
    session.round = round;
    this._activityUpdate(s);
    const deadline = performance.now() + POND_CHANNEL_WAIT_MS;
    const pending = () => s.pondChannel === session && session.round === round && !round.layout;
    const stillHere = () => s.house?.gameplay?.pet_ref === session.petRef && s.worldKey === "pond";
    const pin = (layout) => {
      if (!pending()) return;
      this._stop(s, { key: POND_CHANNEL_WAIT_KEY });
      if (!stillHere()) {
        this._activityClose(s, "changed");
        return;
      }
      Object.assign(round, layout === "wet"
        ? { layout, phase: "gates", gate: null, text: "Turn a gate, then release the seed pod." }
        : { layout, phase: "stones", stone: 0, text: "Cross the near stone, then the far stone." });
      const active = this.shadowRoot?.activeElement;
      const hadFocus = active && active === this._modeButtons(s)[7];
      this._activityUpdate(s);
      if (hadFocus) this._activityFocus(s);
    };
    this._later(s, POND_CHANNEL_WAIT_MS, () => pin("dry"), { key: POND_CHANNEL_WAIT_KEY });
    let reply;
    try {
      reply = await this._hass.callWS({
        type: "virtual_pet/pond_channel",
        entity_id: s.ids?.["sensor.life_stage"],
        pet_ref: session.petRef,
      });
    } catch (err) {
      if (!pending()) return;
      if (performance.now() < deadline && ["forbidden", "activity_changed", "activity_unavailable"].includes(err?.code)) {
        this._activityClose(s, "changed");
      } else pin("dry");
      return;
    }
    pin(reply?.layout === "wet" && performance.now() < deadline ? "wet" : "dry");
  }

  _pondChannelDraw(box, s, round) {
    if (!round.layout) return;
    const board = document.createElement("div");
    board.className = "pond-channel-board";
    board.dataset.phase = round.phase;
    board.setAttribute("aria-hidden", "true"); // every step and outcome is in the activity's live text
    box.append(board);
    const image = (part, src, pos) => {
      const img = document.createElement("img");
      img.className = `pond-channel-${part}`;
      img.alt = "";
      img.src = src;
      if (pos) [img.style.left, img.style.top] = pos.map((v) => `${v}%`);
      board.append(img);
    };
    const marker = (label, x, y) => {
      const name = document.createElement("span");
      name.className = "pond-channel-marker";
      name.textContent = label;
      name.style.left = `${x}%`;
      name.style.top = `${y}%`;
      board.append(name);
    };
    const art = (part) => `${BASE}/ui/pond_channel_${part}.png?v=${VERSION}`;
    const wet = round.layout === "wet";
    const done = round.phase === "done";
    const caught = round.phase === "catch";
    const habitat = s.species.backgrounds || {};
    const backdrop = (wet ? habitat.rain : habitat.day) || habitat.day;
    if (backdrop) image("habitat", spriteSrc(s.speciesId, backdrop));
    image("waterway", art(round.layout));
    if (wet && round.gate && round.phase !== "done") {
      const gate = document.createElement("div");
      gate.className = `pond-channel-gate ${round.gate}`;
      board.append(gate);
    }
    if (!done && wet) {
      marker("Catch", 22, 88);
      marker("Eddy", 78, 88);
    } else if (!done) {
      marker("Near", 40, 88);
      marker("Far", 63, 88);
    }
    const stage = this._state(s, "sensor.life_stage")?.state;
    const frames = this._petFrames(s.species, stage, done ? "excited" : "content", false, null);
    const actor = done ? [32, 83] : wet ? [22, 73] : [[17, 80], [40, 73], [63, 60]][round.stone];
    if (frames.length) image("actor", spriteSrc(s.speciesId, frames[0]), actor);
    const pod = done ? [49, 76] : wet
      ? (caught ? [34, 70] : round.phase === "eddy" ? [78, 69] : [50, 16]) : [80, 48];
    image("pod", art("seed_pod"), pod);
  }
}
