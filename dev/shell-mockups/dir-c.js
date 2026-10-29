// Direction C: A's moulded CSS body, with the small hardware drawn as pixel sprites
// at the creatures' on-screen pixel size. Sprites are tinted from the shell colour
// here; a real build would ship them as tiny greyscale PNGs tinted the same way.
window.MOCK_C_GRID = 2;

window.mockSprite = (rows, colours, G) => {
  const c = document.createElement("canvas");
  c.width = rows[0].length * G; c.height = rows.length * G;
  const x = c.getContext("2d");
  rows.forEach((row, y) => [...row].forEach((ch, i) => {
    if (!colours[ch]) return;
    x.fillStyle = colours[ch]; x.fillRect(i * G, y * G, G, G);
  }));
  return { url: `url(${c.toDataURL()})`, w: c.width, h: c.height };
};

window.mockPixelBits = (device) => {
  const G = window.MOCK_C_GRID;
  const hex = (h) => { const n = parseInt(h.trim().slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const st = getComputedStyle(device);
  const shell = hex(st.getPropertyValue("--d-shell")), bez = hex(st.getPropertyValue("--d-bezel"));
  const M = window.mockMix, H = window.mockHex, W0 = [255, 255, 255];
  const line = H(M(shell.map((v) => Math.round(v * 0.45)), [42, 26, 16], 0.55));
  const metal = { "#": line, l: "#fbf8f0", m: "#d6cfc1", d: "#9b9284" };
  // The mark is a light tint of the shell itself, so it works on any bezel.
  const cream = { "#": line, l: H(M(shell, W0, 0.85)), m: H(M(shell, W0, 0.6)), d: H(M(shell, W0, 0.32)) };
  const set = (k, sp) => { device.style.setProperty(`--px-${k}`, sp.url); device.style.setProperty(`--px-${k}-w`, `${sp.w}px`); device.style.setProperty(`--px-${k}-h`, `${sp.h}px`); };
  set("screw", window.mockSprite([
    ".###.",
    "#llm#",
    "#ddd#",
    "#mmd#",
    ".###."], metal, G));
  set("logo", window.mockSprite([
    "...###...",
    "..#lll#..",
    ".#llmmm#.",
    ".#lmmmm#.",
    "#lmmmmmd#",
    "#mmmmmdd#",
    "#mmmmddd#",
    ".#mdddd#.",
    "..#####.."], cream, G));
  set("slot", window.mockSprite([
    "##.",
    "##.",
    "##.",
    "##.",
    "ll."], { "#": line, l: H(M(shell, W0, 0.45)) }, G));
  set("led", window.mockSprite([
    ".#.",
    "#lr",
    ".r."], { "#": "#7a2a20", l: "#ffd6c8", r: "#e8584a" }, G));
  set("stripe", window.mockSprite([
    "aaaa",
    "....",
    "bbbb",
    "...."], { a: H(M(bez, [42, 26, 16], 0.35)), b: H(M(bez, [42, 26, 16], 0.22)) }, G));
};
