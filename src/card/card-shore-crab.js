const SHORE_CRAB_STYLE = `
  .screen .shore-crab-invite {
    position: absolute; z-index: 3; top: 43%; right: 9%; width: 45px; min-height: 44px;
    box-sizing: border-box; display: grid; place-items: center; gap: 1px;
    padding: 2px; border: 1px solid #523c28; border-radius: 9px;
    background: #fff1d1; color: #342a24; box-shadow: 1px 2px #523c28;
    font: inherit; font-size: 12px; line-height: 1; cursor: pointer;
  }
  .screen .shore-crab-invite[hidden] { display: none; }
  .screen .shore-crab-invite img { position: static; width: 25px; height: 25px; }
  .screen .shore-crab-invite:focus-visible {
    outline: 2px solid #fff8e8; outline-offset: 2px;
    box-shadow: 0 0 0 5px #342a24;
  }
  .screen .shore-crab-invite:hover { background: #fffdf5; }
  .screen:has(.shore-crab-board) .activity-panel > header { max-width: 80%; }
  .shore-crab-board {
    position: absolute; inset: 0; isolation: isolate;
    color: #37291d; background: #d2ae7d;
    background-image: linear-gradient(#36565c 0 25%, #b8936c 25% 39%, transparent 39%),
      linear-gradient(170deg, #d2ae7d 58%, #dcb98c 58% 74%, #c7a372 74%);
  }
  .shore-crab-rock, .shore-crab-pool {
    position: absolute; bottom: 18%; width: 23%; height: 35%;
    background-position: center; background-size: cover;
    image-rendering: pixelated; border: 2px solid #392d2e;
  }
  .shore-crab-rock {
    left: 5%; clip-path: polygon(0 100%, 0 65%, 17% 58%, 26% 26%, 45% 20%,
      54% 0, 74% 0, 93% 27%, 100% 100%);
  }
  .shore-crab-pool {
    right: 5%; height: 26%; bottom: 16%; border-radius: 52% 37% 48% 42%;
    box-shadow: inset 0 0 0 2px #90c7c7;
  }
  .shore-crab-shelter {
    position: absolute; left: 39%; right: 39%; bottom: 25%; height: 25%;
    border: 2px solid #4b382f; border-top-width: 8px; border-bottom: 0;
    border-radius: 45% 45% 0 0; background: #352e2a;
    box-shadow: inset 0 4px 0 #514438;
  }
  [data-opening="left"] > .shore-crab-shelter { border-left-color: transparent; }
  [data-opening="right"] > .shore-crab-shelter { border-right-color: transparent; }
  .shore-crab-path {
    position: absolute; bottom: 33%; height: 0; width: 25%; border-top: 2px dashed #fff8e8;
    filter: drop-shadow(0 1px #352e2a);
  }
  [data-opening="left"] > .shore-crab-path { left: 18%; }
  [data-opening="right"] > .shore-crab-path { right: 18%; }
  .shore-crab-path::after {
    content: ""; position: absolute; top: -7px; height: 0; width: 0;
    border: 6px solid transparent;
  }
  [data-opening="left"] > .shore-crab-path::after { right: -3px; border-left-color: #fff8e8; }
  [data-opening="right"] > .shore-crab-path::after { left: -3px; border-right-color: #fff8e8; }
  .screen .shore-crab-board img { object-fit: contain; }
  .screen .shore-crab-shell {
    bottom: 12%; width: 16%; height: 26%; translate: -50% 0;
    filter: drop-shadow(0 1px #7b644e);
  }
  .screen .shore-crab-shell.high { bottom: 26%; }
  .shore-crab-shell.left { left: 33%; }
  .shore-crab-shell.right { left: 67%; }
  .shore-crab-crab {
    width: 16%; height: 34%; bottom: 25%; translate: -50% 0;
    filter: drop-shadow(0 1px #402a20);
  }
  .shore-crab-pet {
    width: 24%; bottom: 2%; left: 50%; translate: -50% 0;
  }
  .shore-crab-board .shore-crab-label, .shore-crab-mark {
    position: absolute; display: grid; place-items: center;
    background: #fff1d1; color: #352e2a; border: 1px solid #5b412d; border-radius: 4px;
  }
  .shore-crab-board .shore-crab-label { bottom: 10%; padding: 0 3px; font-size: 11px; line-height: 1.12; }
  ha-card.bigtext .shore-crab-board .shore-crab-label { font-size: 14px; }
  .shore-crab-label.rock { left: 12%; }
  .shore-crab-label.water { right: 10%; }
  .shore-crab-mark { bottom: 39%; width: 15px; height: 15px; translate: -50% 0; }
  .shore-crab-mark.left { left: 33%; }
  .shore-crab-mark.right { left: 67%; }
  .shore-crab-point {
    position: absolute; bottom: 17%; left: 39%; color: #fff8e8; font: bold 18px/1 sans-serif;
    text-shadow: 1px 1px #352e2a, -1px -1px #352e2a;
  }
  [data-opening="right"] > .shore-crab-point { left: auto; right: 39%; }
  .shore-crab-splash {
    position: absolute; right: 12%; bottom: 23%; width: 15%; height: 12%;
    border: 2px solid #fff8e8; border-radius: 50%; box-shadow: 0 0 0 1px #352e2a;
  }
`;

const SHORE_CRAB_MOTION = { key: "shore-crab.route" };
const SHORE_CRAB_RESTS = {
  left: { start: 19, shell: 33, door: 44 },
  right: { start: 81, shell: 67, door: 56 },
};

function shoreCrabResult(board) {
  if (board[board.opening] === "high") return "blocked";
  return board.opening === "left" ? "shade" : "splash";
}

class HatchPetCardShoreCrab extends HatchPetCardOuting {
  _shoreCrabOffer(s) {
    const gameplay = s.house?.gameplay;
    const offer = gameplay?.shore_crab;
    if (s.worldKey !== "tidepool" || !gameplay?.pet_ref || !offer?.id ||
        !Number.isFinite(offer.starts_at) || !Number.isFinite(offer.expires_at)) return null;
    const now = serverNow() / 1000;
    return offer.starts_at <= now && now < offer.expires_at ? offer : null;
  }

  _shoreCrabCanOpen(s) {
    return this._activityReady(s) && this._patOn(s) && !s.lightsOut;
  }

  _shoreCrabAffordance(s) {
    if (s.activity?.id === "shore_crab" && s.worldKey !== "tidepool") this._activityClose(s, "changed");
    const offer = this._shoreCrabOffer(s);
    const visible = !!offer && this._shoreCrabCanOpen(s);
    if (visible && !s.shoreCrabInvite) {
      const button = document.createElement("button");
      button.className = "shore-crab-invite";
      button.type = "button";
      button.setAttribute("aria-label", "Open the shore crab’s shell invitation");
      button.title = "The shore crab’s invitation";
      const shell = document.createElement("img");
      shell.src = this._shoreCrabArt("find_tidepool_scallopshell");
      shell.alt = "";
      button.append(shell, "Crab");
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (event.detail !== 0 && this._swiped) return;
        this._shoreCrabOpen(s, button);
      });
      s.screen.append(button);
      s.shoreCrabInvite = button;
    }
    const button = s.shoreCrabInvite;
    if (!button) return;
    if (!visible && !s.activity && this.shadowRoot?.activeElement === button) {
      this._card?.querySelector(".statusbtn")?.focus({ preventScroll: true });
    }
    if (offer) button.hidden = !visible;
    else {
      button.remove();
      s.shoreCrabInvite = null;
    }
  }

  _shoreCrabOpen(s, from) {
    if (!this._shoreCrabCanOpen(s) || !this._shoreCrabOffer(s)) return false;
    const board = { left: "high", right: "low", opening: "left", result: null };
    return this._activityOpen(s, {
      id: "shore_crab", title: "Crab shelter", scene: true, from,
      text: () => this._shoreCrabText(board),
      buttons: () => this._shoreCrabButtons(s, board),
      render: (box) => this._shoreCrabDraw(box, s, board),
      close: () => this._stop(s, SHORE_CRAB_MOTION),
    });
  }

  _shoreCrabText(board) {
    if (board.result === "blocked") return `The crab taps the ${board.opening} shell.`;
    if (board.result === "shade") return "The crab found shade.";
    if (board.result === "splash") return "The crab dips its claws!";
    return "Leave the entrance shell low.";
  }

  _shoreCrabButtons(s, board) {
    const shell = (side, key) => {
      const height = board[side] === "low" ? "high" : "low";
      return {
        label: `Set the ${side} shell ${height}`,
        cap: `${side[0].toUpperCase()} shell`,
        icon: height === "high" ? "icon_mode_up" : "icon_mode_down",
        keys: [key],
        selected: board[side] === "high",
        act: () => this._shoreCrabMove(s, board, side, height),
      };
    };
    const buttons = [];
    buttons[0] = shell("left", "ArrowLeft");
    buttons[1] = {
      label: board.opening === "left" ? "Turn the opening toward the water" : "Turn the opening toward the rock",
      cap: "turn", keys: ["ArrowUp"],
      icon: board.opening === "left" ? "icon_mode_right" : "icon_mode_left",
      act: () => this._shoreCrabMove(s, board, "opening", board.opening === "left" ? "right" : "left"),
    };
    buttons[3] = shell("right", "ArrowRight");
    buttons[4] = {
      label: "Try the shelter", cap: "try", keys: ["t", "T"], icon: "icon_mode_keep",
      act: () => this._shoreCrabMove(s, board, "result", shoreCrabResult(board)),
    };
    return buttons;
  }

  _shoreCrabMove(s, board, part, value) {
    this._stop(s, SHORE_CRAB_MOTION);
    board[part] = value;
    if (part !== "result") board.result = null;
    if (!this._activityUpdate(s) || part !== "result" || calm()) return;
    const crab = s.activity.panel.querySelector(".shore-crab-crab");
    const { start, shell, door } = SHORE_CRAB_RESTS[board.opening];
    const path = [{ left: `${start}%`, offset: 0 }];
    if (value === "blocked") {
      const tap = (2 * shell + start) / 3;
      path.push({ left: `${tap}%`, offset: .43 }, { left: `${tap}%`, scale: "1.06 .95", offset: .66 });
    } else {
      path.push({ left: `${door}%`, offset: .65 });
    }
    path.push({ left: crab.style.left, offset: 1 });
    this._waapi(s, crab, path, { duration: 750, easing: "ease-in-out" },
      { ...SHORE_CRAB_MOTION, hidden: "tab" });
  }

  _shoreCrabArt(stem) {
    return `${BASE}/ui/${stem}.png?v=${VERSION}`;
  }

  _shoreCrabDraw(box, s, board) {
    const scene = document.createElement("div");
    scene.className = "shore-crab-board";
    scene.dataset.opening = board.opening;
    scene.dataset.result = board.result || "";
    scene.setAttribute("role", "img");
    scene.setAttribute("aria-label",
      `Rock left, water right. Opening to the ${board.opening === "left" ? "rock" : "water"}. ` +
      `Left shell ${board.left}. Right shell ${board.right}.`);
    box.append(scene);
    const add = (className, text = "") => {
      const el = document.createElement("div");
      el.className = className;
      el.textContent = text;
      scene.append(el);
      return el;
    };
    const image = (src, className) => {
      const img = document.createElement("img");
      img.className = className;
      img.alt = "";
      img.src = src;
      scene.append(img);
      return img;
    };
    add("shore-crab-rock").style.backgroundImage = `url("${this._shoreCrabArt("hop_tidepool_wall")}")`;
    add("shore-crab-pool").style.backgroundImage = `url("${this._shoreCrabArt("hop_tidepool_pool_water")}")`;
    add("shore-crab-shelter");
    add("shore-crab-path");
    image(this._shoreCrabArt("find_tidepool_scallopshell"), `shore-crab-shell left ${board.left}`);
    image(this._shoreCrabArt("find_tidepool_periwinkle"), `shore-crab-shell right ${board.right}`);
    if (board.result === "splash") add("shore-crab-splash");
    const crabFrame = board.result ? 2 : 1;
    const crab = image(this._shoreCrabArt(`visitor_tidepool_shorecrab_${crabFrame}`), "shore-crab-crab");
    const { start, door } = SHORE_CRAB_RESTS[board.opening];
    crab.style.left = `${board.result === "shade" ? door : start}%`;
    const sprite = s.framesOf?.(board.result === "blocked" ? "excited" : "content")?.[0];
    if (sprite && s.speciesId) {
      const pet = image(spriteSrc(s.speciesId, sprite), "shore-crab-pet");
      pet.style.scale = s.species?.scale?.[s.drawn] || 1;
    }
    if (board.result === "blocked") {
      add(`shore-crab-mark ${board.opening}`, "!");
      add("shore-crab-point", board.opening === "left" ? "↖" : "↗");
    }
    add("shore-crab-label rock", "Rock");
    add("shore-crab-label water", "Water");
  }
}
