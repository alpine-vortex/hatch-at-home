// The server owns the turns. The card gives each node a still, a line and its shell caps.
const OUTING_VERSION = 1;
const OUTING_SCENES = {
  landing: { text: "The shore path is just ahead.", actions: ["walk"], x: 49, y: 94 },
  fork: { text: "Bubbles left. Glint right.", actions: ["pool", "ridge"], x: 50, y: 88 },
  pool_edge: { text: "Your pet watches the pool.", actions: ["wait", "look"], x: 66, y: 91 },
  pool_early: { text: "The water clouds. Let it settle.", actions: ["wait", "look"], x: 66, y: 91 },
  pool_signal: { text: "A ripple! Time to look.", actions: ["look"], x: 63, y: 90, pose: "excited" },
  pool_ending: { text: "A sea star! Your pet stays still.", actions: ["return"], x: 64, y: 91 },
  ridge: { text: "A glint in the high crack.", actions: ["high", "low"], x: 31, y: 93, pose: "excited" },
  ridge_empty: { text: "Just pebbles. The high crack still glints.", actions: ["high", "low"], x: 31, y: 93 },
  ridge_ending: { text: "We found green sea glass!", actions: ["return"], x: 42, y: 94, pose: "excited" },
};
const OUTING_CAPS = {
  walk: { slot: 1, cap: "ahead", label: "Walk up the path", key: "ArrowUp", icon: "up" },
  pool: { slot: 0, cap: "pool", label: "Follow the bubbles to the pool", key: "ArrowLeft", icon: "left" },
  ridge: { slot: 3, cap: "ridge", label: "Follow the glint to the ridge", key: "ArrowRight", icon: "right" },
  wait: { slot: 4, cap: "wait", label: "Wait for a ripple", key: "w" },
  look: { slot: 5, cap: "look", label: "Look into the pool", key: "l" },
  high: { slot: 1, cap: "high", label: "Check the high crack", key: "ArrowUp", icon: "up" },
  low: { slot: 2, cap: "low", label: "Check the low crack", key: "ArrowDown", icon: "down" },
  return: { slot: 2, cap: "home", label: "Return to the landing and go home", key: "ArrowDown", icon: "down" },
};
const OUTING_OPENING = "Heading for the shore…";
const OUTING_RETRY = "The shore stopped responding. Try again.";
const OUTING_REQUEST = { key: "outing.request" };

const OUTING_STYLE = `
  .outing-scene {
    position: absolute; inset: 0; overflow: hidden;
    background-color: #665c52; background-position: center 76%; background-size: 138% auto;
    image-rendering: pixelated;
  }
  .outing-scene[data-node^="pool_"] { background-position: 13% 62%; background-size: 155% auto; }
  .outing-scene[data-node^="ridge"] { background-position: 93% 63%; background-size: 150% auto; }
  .outing-scene img { position: absolute; object-fit: contain; image-rendering: pixelated; }
  .outing-pet { width: 32%; max-width: 100px; translate: -50% 0; }
  .outing-pool {
    position: absolute; left: 17%; bottom: 7%; width: 49%; height: 47%;
    border: 3px solid #5f5947; box-shadow: 0 0 0 2px #372e27, inset 0 0 0 2px #75afb6;
    border-radius: 34% 60% 34% 48%; background: #294a58;
  }
  [data-node="pool_early"] .outing-pool { background-color: #71645a; }
  .outing-ripple {
    position: absolute; left: 25%; bottom: 15%; width: 28%; height: 18%;
    border: 2px solid #e1fffc; border-radius: 50%; box-shadow: 0 0 0 2px #314951;
  }
  .outing-ripple::after {
    content: ""; position: absolute; inset: 20%; border: 2px solid #e1fffc; border-radius: 50%;
  }
  .outing-bubbles {
    position: absolute; width: 9px; height: 9px; left: 29%; top: 62%;
    border: 2px solid #f5fffb; border-radius: 50%; box-shadow: 0 0 0 2px #203f48;
  }
  .outing-bubbles::before, .outing-bubbles::after {
    content: ""; position: absolute; width: 5px; height: 5px; border: 2px solid #f5fffb;
    border-radius: 50%; box-shadow: 0 0 0 2px #203f48;
  }
  .outing-bubbles::before { left: 8px; top: -10px; }
  .outing-bubbles::after { left: -11px; top: 6px; }
  .outing-glint {
    position: absolute; width: 17px; height: 17px; left: 68%; bottom: 29%; background: #fff3a8;
    clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
  }
  .outing-ridge {
    position: absolute; left: 47%; bottom: 9%; width: 44%; height: 49%;
    background-size: 53%;
    clip-path: polygon(0 55%, 17% 55%, 17% 39%, 32% 39%, 32% 19%, 44% 19%, 44% 0,
      74% 0, 74% 17%, 87% 17%, 87% 37%, 100% 37%, 100% 100%, 0 100%);
  }
  .outing-crack {
    position: absolute; left: 57%; bottom: 15%; width: 17%; height: 10%; background: #1c2529;
    border-bottom: 2px solid #a5a091;
    clip-path: polygon(0 0, 32% 0, 32% 20%, 75% 20%, 75% 45%, 100% 45%, 100% 80%, 60% 80%,
      60% 100%, 25% 100%, 25% 60%, 0 60%);
  }
  .outing-crack.high { left: 66%; bottom: 28%; }
  .outing-scene[data-node^="ridge"] .outing-glint { left: 72%; bottom: 27%; }
  .outing-discovery { width: 20%; max-width: 64px; }
  .outing-discovery.star { left: 27%; bottom: 13%; }
  .outing-discovery.glass { left: 49%; bottom: 13%; width: 23%; }
  .outing-ledge {
    position: absolute; left: 25%; bottom: 31%; width: 23%; height: 13%;
    background-size: 100%; background-position: 50% 58%;
    clip-path: polygon(0 30%, 12% 30%, 12% 0, 65% 0, 65% 20%, 92% 20%, 100% 65%,
      85% 65%, 85% 85%, 45% 85%, 45% 100%, 11% 100%);
  }
  .outing-pathstone { width: 19%; max-width: 64px; bottom: 7%; left: 50%; translate: -50% 0; }
`;

class HatchPetCardOuting extends HatchPetCardPondChannel {
  _outingOpen(s, from) {
    const ref = s.house?.gameplay?.pet_ref;
    const id = s.ids?.["sensor.mood"];
    if (!id || !ref || !s.house?.gameplay?.outing) return false;
    const outing = { node: "landing", revision: null, request: null, retry: null, note: OUTING_OPENING };
    const opened = this._activityOpen(s, {
      id: "outing", title: "Tidepool outing", scene: true, from,
      text: () => outing.note || OUTING_SCENES[outing.node].text,
      buttons: () => this._outingButtons(s, outing),
      render: (box) => this._outingDraw(box, s, outing.node),
      close: () => this._stop(s, OUTING_REQUEST),
    });
    if (!opened) return false;
    outing.activity = s.activity;
    outing.ref = ref;
    outing.entityId = id;
    void this._outingSend(s, outing, "view");
    return true;
  }

  _outingButtons(s, outing) {
    if (outing.retry) {
      return [{ label: "Try the shore again", cap: "retry", act: () => this._outingSend(s, outing, outing.retry) }];
    }
    if (outing.revision === null) return [];
    const caps = [];
    for (const action of OUTING_SCENES[outing.node].actions) {
      const { slot, label, cap, key, icon } = OUTING_CAPS[action];
      caps[slot] = {
        label, cap, keys: [key], disabled: !!outing.request,
        icon: icon ? `icon_mode_${icon}` : undefined,
        act: () => this._outingSend(s, outing, action),
      };
    }
    return caps;
  }

  async _outingSend(s, outing, action) {
    if (outing.request || s.activity !== outing.activity || !action) return;
    const request = outing.request = {};
    const current = () => s.activity === outing.activity && outing.request === request &&
      s.house?.gameplay?.pet_ref === outing.ref;
    const failed = () => {
      if (!current()) return;
      outing.request = null;
      outing.retry = action;
      outing.note = OUTING_RETRY;
      this._activityUpdate(s);
    };
    outing.retry = null;
    outing.note = outing.revision === null ? OUTING_OPENING : "";
    this._activityUpdate(s);
    this._later(s, 8000, failed, OUTING_REQUEST);
    let reply;
    try {
      const msg = { type: "virtual_pet/outing", entity_id: outing.entityId, pet_ref: outing.ref, action };
      if (action !== "view") Object.assign(msg, { version: OUTING_VERSION, revision: outing.revision });
      reply = await this._hass.callWS(msg);
    } catch (err) {
      if (current()) this._stop(s, OUTING_REQUEST);
      failed();
      return;
    }
    if (!current()) return;
    this._stop(s, OUTING_REQUEST);
    if (reply?.result === "pet_changed" || reply?.result === "not_now") {
      this._activityClose(s, "unavailable");
      return;
    }
    if (reply?.version !== OUTING_VERSION || !["ok", "changed", "illegal"].includes(reply.result) ||
        !Object.hasOwn(OUTING_SCENES, reply.node) ||
        !Number.isSafeInteger(reply.revision) || reply.revision < 0) {
      failed();
      return;
    }
    if (action === "return" && reply.result === "ok" && ["pool", "ridge"].includes(reply.completed)) {
      this._activityClose(s, "complete");
      return;
    }
    outing.request = null;
    outing.node = reply.node;
    outing.revision = reply.revision;
    outing.note = reply.result === "changed" ? "The outing moved ahead on another screen." : "";
    this._activityUpdate(s);
  }

  _outingDraw(box, s, node) {
    const { x, y, pose } = OUTING_SCENES[node];
    const add = (parent, tag, cls) => {
      const el = document.createElement(tag);
      el.className = cls;
      parent.append(el);
      return el;
    };
    const scene = add(box, "div", "outing-scene");
    scene.dataset.node = node;
    scene.setAttribute("aria-hidden", "true");
    scene.style.backgroundImage = `url("${spriteSrc("otter", "bg_day")}")`;
    const art = (name) => `${BASE}/ui/${name}.png?v=${VERSION}`;
    const picture = (src, cls) => {
      const img = add(scene, "img", cls);
      img.alt = "";
      img.src = src;
      return img;
    };

    if (node === "landing" || node === "fork") {
      picture(art("hop_tidepool_stone"), "outing-pathstone");
    }
    if (node === "fork") {
      add(scene, "i", "outing-bubbles");
      add(scene, "i", "outing-glint");
    }
    if (node.startsWith("pool_")) {
      add(scene, "div", "outing-pool");
      if (node === "pool_signal") add(scene, "i", "outing-ripple");
      if (node === "pool_ending") {
        picture(art("visitor_tidepool_seastar_1"), "outing-discovery star");
        add(scene, "div", "outing-ledge").style.backgroundImage = `url("${art("hop_tidepool_wall")}")`;
      }
    }
    if (node === "ridge" || node === "ridge_empty") {
      add(scene, "div", "outing-ridge").style.backgroundImage = `url("${art("hop_tidepool_wall")}")`;
      add(scene, "i", "outing-crack");
      add(scene, "i", "outing-crack high");
      add(scene, "i", "outing-glint");
    }
    if (node === "ridge_ending") picture(art("find_tidepool_greenseaglass"), "outing-discovery glass");
    const sprite = s.framesOf?.(pose || "content")?.[0];
    if (sprite && s.speciesId) {
      const pet = picture(spriteSrc(s.speciesId, sprite), "outing-pet");
      pet.style.left = `${x}%`;
      pet.style.bottom = `${100 - y - 4}%`; // transparent baseline in the species frame
      pet.style.scale = s.species?.scale?.[s.drawn] || 1;
    }
  }
}
