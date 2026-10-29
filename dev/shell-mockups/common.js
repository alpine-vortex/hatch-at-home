// Mockup helpers, injected into the page by shoot.py. In a real build the added
// nodes would be part of _buildSlide's markup; nothing here reads or changes game state.
window.mockNodes = (device) => {
  const body = device.querySelector(".body");
  const bezel = device.querySelector(".bezel");
  if (!body.querySelector(".mx-shine")) {
    body.insertAdjacentHTML("afterbegin",
      '<i class="mx mx-shine"></i><i class="mx mx-seam"></i><i class="mx mx-screws"></i>' +
      '<i class="mx mx-grille"></i><i class="mx mx-logo"></i><i class="mx mx-px"></i>');
    bezel.insertAdjacentHTML("afterbegin", '<i class="mx mx-ring"></i>');
    bezel.insertAdjacentHTML("beforeend", '<i class="mx mx-glass"></i>');
  }
};

window.mockDress = async (device, dir, shell) => {
  window.mockNodes(device);
  // PR #69's special finishes aren't in main's whitelist yet: add the class by hand.
  if (shell?.finish && !device.classList.contains(`finish-${shell.finish}`)) device.classList.add(`finish-${shell.finish}`);
  device.querySelector("canvas.mx-frame")?.remove();
  if (dir === "b" && window.mockPixelFrame) window.mockPixelFrame(device);
  if (dir === "c" && window.mockPixelBits) window.mockPixelBits(device);
};

// Colour helpers shared by the pixel directions.
window.mockRgb = (css) => {
  const m = css.match(/[\d.]+/g).map(Number);
  return m.slice(0, 3);
};
window.mockMix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
window.mockHex = (c) => `rgb(${c.join(",")})`;
