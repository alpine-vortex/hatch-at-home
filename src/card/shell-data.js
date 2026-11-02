// --- The moulded shell -------------------------------------------------------
// Every part of a shell (body, bezel, lid, feet, loop, roof, crescent, the caps) is
// cut on the world's on-screen pixel grid (WORLD_GRID): --px CSS px a cell, a
// whole number of device pixels. mouldCells sorts a part's cells into tones; the
// part gets a clip-path for its stepped outline and an SVG of see-through light
// and shade over its plastic. The plastic itself (the world's colour, or a finish) stays CSS, so
// any shell colour works.
const TONE = { plain: 1, line: 2, lit: 3, glint: 4, shade: 5, dither: 6, deep: 7, seam: 8, side: 9 };
const TONE_PAINT = [
  [TONE.line, "rgba(34,20,10,.86)"], [TONE.lit, "rgba(255,255,255,.34)"], [TONE.glint, "rgba(255,255,255,.75)"],
  [TONE.shade, "rgba(24,12,4,.2)"], [TONE.dither, "rgba(24,12,4,.2)"], [TONE.deep, "rgba(24,12,4,.34)"],
  [TONE.seam, "rgba(24,12,4,.24)"],
];
const MOULDS = new Map(); // cut parts, by kind and size

// Inside a w x h box with CSS corner radii ([h, v] per corner, top-left first).
function inRound(x, y, w, h, rad) {
  if (x < 0 || y < 0 || x > w || y > h) return false;
  const f = Math.min(1, w / (rad[0][0] + rad[1][0] || 1), w / (rad[3][0] + rad[2][0] || 1),
    h / (rad[0][1] + rad[3][1] || 1), h / (rad[1][1] + rad[2][1] || 1));
  const c = rad.map(([a, b]) => [a * f, b * f]);
  const corner = (cx, cy, [a, b], sx, sy) => !a || !b || sx * (x - cx) < 0 || sy * (y - cy) < 0 ||
    ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 <= 1;
  return corner(c[0][0], c[0][1], c[0], -1, -1) && corner(w - c[1][0], c[1][1], c[1], 1, -1) &&
    corner(w - c[2][0], h - c[2][1], c[2], 1, 1) && corner(c[3][0], h - c[3][1], c[3], -1, 1);
}

// An element's corner radii, in cells of size g.
function cssRadii(el, w, h, g) {
  const st = getComputedStyle(el);
  return ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].map((k) => {
    const [a, b = a] = st[`border${k}Radius`].split(" ");
    const v = (s, size) => (s.endsWith("%") ? (parseFloat(s) / 100) * size : parseFloat(s) || 0) / g;
    return [v(a, w), v(b, h)];
  });
}

// Sort a W x H grid of cells into tones; inside(x, y) takes a cell's centre. Raised
// plastic is lit along its top and left and shaded, then dithered, along its bottom
// and right; sunk plastic (a recess) the other way round. With core(x, y), the
// cells around the core are a recess's lip: in shadow above, lit below. glint adds
// a highlight at the top left, seam a parting line that many cells in, veins(x, y)
// lines of its own.
function mouldCells(W, H, inside, { sunk = false, glint = false, seam = 0, core = null, veins = null } = {}) {
  const ins = new Uint8Array(W * H);
  let x0 = W, x1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x + 0.5, y + 0.5)) continue;
    ins[y * W + x] = core && !core(x + 0.5, y + 0.5) ? 2 : 1;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
  }
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && ins[y * W + x] === 1;
  const run = (x, y, dx, dy) => { let n = 0; while (n < 12 && at(x + dx * (n + 1), y + dy * (n + 1))) n++; return n; };
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (ins[i] === 2) { out[i] = x / W + y / H < 1 ? TONE.deep : TONE.lit; continue; }
    if (!ins[i]) continue;
    const u = run(x, y, 0, -1), d = run(x, y, 0, 1), l = run(x, y, -1, 0), r = run(x, y, 1, 0);
    if (!u || !d || !l || !r) { out[i] = TONE.line; continue; }
    let t = TONE.plain;
    const near = Math.min(u, d, l, r) - 1; // plain cells between this one and the outline
    if (sunk) t = u === 1 || l === 1 ? TONE.deep : d === 1 || r === 1 ? TONE.lit : t;
    else {
      if (u <= 2 || l === 1) t = TONE.lit;
      else if (d <= 2 || r === 1) t = TONE.shade;
      else if (d <= 4 && (x + y) % 2 === 0) t = TONE.dither;
      const fx = (x - x0) / (x1 - x0 + 1);
      if (glint && (u === 3 || u === 4) && fx > 0.16 && fx < (u === 3 ? 0.34 : 0.3)) t = TONE.glint;
      if (glint && u === 3 && fx > 0.37 && fx < 0.4) t = TONE.glint;
      if (seam && near === seam) t = TONE.seam;
      else if (seam && near === seam + 1 && (d === seam + 2 || r === seam + 2)) t = TONE.lit;
      if (veins && near > seam + 1 && veins(x + 0.5, y + 0.5)) t = TONE.seam;
    }
    out[i] = t;
  }
  return out;
}

// A button cap n cells across, raised depth cells off its socket: the face, its side
// below (TONE.side, which CSS paints) and the outline round both.
function capCells(n, depth, rad) {
  const W = n, H = n + depth;
  const face = (x, y) => inRound(x, y, n, n, rad);
  const ins = (x, y) => x >= 0 && y >= 0 && x < W && y < H &&
    Array.from({ length: depth + 1 }, (_, k) => k).some((k) => face(x + 0.5, y + 0.5 - k));
  const onFace = (x, y) => face(x + 0.5, y + 0.5);
  const run = (x, y, dy) => { let k = 0; while (k < 12 && onFace(x, y + dy * (k + 1))) k++; return k; };
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!ins(x, y)) continue;
    const i = y * W + x;
    if (!ins(x - 1, y) || !ins(x + 1, y) || !ins(x, y - 1) || !ins(x, y + 1)) out[i] = TONE.line;
    else if (!onFace(x, y)) out[i] = TONE.side;
    else {
      const u = run(x, y, -1), d = run(x, y, 1);
      out[i] = u <= 1 ? TONE.lit : u === 2 && x > n * 0.22 && x < n * 0.42 ? TONE.glint
        : d === 0 ? TONE.shade : TONE.plain;
    }
  }
  return out;
}

// The cells that pass test, as one SVG path (runs along a row, merged down the rows
// while they repeat), scaled by g and shifted by (ox, oy).
function cellsPath(cells, W, H, test, g = 1, ox = 0, oy = 0) {
  const f = (v, o) => +(v * g + o).toFixed(3);
  let d = "", prev = null, top = 0, runs = [];
  const flush = (bottom) => {
    for (let k = 0; k < runs.length; k += 2) {
      d += `M${f(runs[k], ox)} ${f(top, oy)}H${f(runs[k + 1], ox)}V${f(bottom, oy)}H${f(runs[k], ox)}Z`;
    }
  };
  for (let y = 0; y <= H; y++) {
    const row = [];
    for (let x = 0; y < H && x < W; x++) {
      if (!test(cells[y * W + x])) continue;
      const start = x;
      while (x < W && test(cells[y * W + x])) x++;
      row.push(start, x);
    }
    const key = row.join();
    if (key !== prev) { if (prev !== null) flush(y); prev = key; runs = row; top = y; }
  }
  return d;
}

// A clip-path of those cells; none at all is an empty clip, not an invalid path.
const clipPath = (d) => (d ? `path("${d}")` : "inset(50%)");

// The light and shade over a part, as a CSS image a cell per SVG unit.
function toneImage(cells, W, H) {
  const paths = TONE_PAINT.map(([t, paint]) => {
    const d = cellsPath(cells, W, H, (v) => v === t);
    return d ? `<path fill='${paint}' d='${d}'/>` : "";
  }).join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' preserveAspectRatio='none' ` +
    `shape-rendering='crispEdges'>${paths}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// Glitter in the plastic: a tile of single-cell flecks, each with a dark cell beside
// it so it shows on a pale shell too. Tiled at the grid's size by CSS.
const glitterTile = () => {
  const W = 29, H = 23, colours = ["#fff8d5", "#ffd9e9", "#d4f8ec", "#ffffff"];
  let rects = "";
  for (let k = 0; k < 7; k++) {
    const x = (k * 13 + 5) % W, y = (k * 17 + 3) % H;
    rects += `<rect x='${x}' y='${y}' width='1' height='1' fill='${colours[k % 4]}'/>` +
      `<rect x='${(x + 1) % W}' y='${(y + 1) % H}' width='1' height='1' fill='rgba(48,24,64,.35)'/>`;
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' shape-rendering='crispEdges'>${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

// A printed tile, a cell per character: rows of keys into paints, "." left clear.
function printTile(rows, paints) {
  let rects = "";
  rows.forEach((row, y) => [...row].forEach((k, x) => {
    if (paints[k]) rects += `<rect x='${x}' y='${y}' width='1' height='1' fill='${paints[k]}'/>`;
  }));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${rows[0].length} ${rows.length}' ` +
    `shape-rendering='crispEdges'>${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// Shell finishes (worlds.json shell.finish): each world's own, the 1990s editions,
// and prints any world can wear. The CSS draws them (.finish-<key>); here is what
// the captions are inked against: `face(colour)` the plastic's main colour, set as
// --d-face for the CSS too, or a fixed `ink`; `seen` mixes see-through plastic with
// the backdrop first. A print's tile is --print-<key>, tiled at the grid's size.
const PRINT_W = "rgba(255,255,255,.5)";
const FINISHES = {
  woodland: {}, aqua: {}, grove: {}, celestial: {}, dune: {},
  clear: { seen: (c) => c, see: 0.34 }, glitter: {}, glow: {},
  speckle: { face: (c) => mixHex(c, "#fff4e2", 0.62),
    tile: [["......d.......", ".........w....", "..w...........", "...........d..", "....d.........",
      "..........w...", "w.............", "......w....d..", "..d...........", "..........w..."],
    { d: "rgba(48,26,12,.62)", w: "rgba(255,255,255,.85)" }] },
  stripes: { face: (c) => c,
    tile: [["wwww....", ".wwww...", "..wwww..", "...wwww.", "....wwww", "w....www", "ww....ww", "www....w"], { w: PRINT_W }] },
  hearts: { face: (c) => mixHex(c, "#ffd5e4", 0.7),
    tile: [["............", ".hh..hh.....", "hhhhhhhh....", "hhhhhhhh....", ".hhhhhh.....", "..hhhh......",
      "...hh.......", "............", "............", "............", "............", "............"],
    { h: "rgba(255,182,206,.9)" }] },
  stars: { face: (c) => mixHex(c, "#3b3d99", 0.35),
    tile: [["......y.........", "......y.........", "....yyyyy.......", ".....yyy........", ".....y.y........",
      "................", "................", "............w...", "................", "................",
      "..w.............", "................"], { y: "rgba(255,240,150,.95)", w: "rgba(255,255,255,.7)" }] },
  gingham: { face: (c) => mixHex(c, "#fff5e0", 0.6),
    tile: [["wwww....", "wwww....", "wwww....", "wwww....", "....dddd", "....dddd", "....dddd", "....dddd"],
      { w: "rgba(255,255,255,.34)", d: "rgba(30,16,8,.2)" }] },
  dots: { face: (c) => c,
    tile: [["..........", ".ww.......", ".ww.......", "..........", "..........", ".......ww.", ".......ww.",
      "..........", "..........", ".........."], { w: PRINT_W }] },
  camo: { face: () => "#8fbe62",
    tile: [["dddd......gggg........", "ddddd....ggggg....dd..", ".dddd.....gg.....ddd..", "......dd........dddd..",
      "..gg..ddd....gg......k", ".gggg.......ggggg....k", ".ggg....kk...ggg......", ".......kkkk...........",
      "..dd....kk....gggg....", ".dddd.........gggg....", "..ddd...gg....gg......", "........ggg..........."],
    { d: "#5e9447", g: "#c4df8c", k: "#3f6a3a" }] },
  waves: { face: (c) => mixHex(c, "#5fb6d8", 0.55),
    tile: [["..ww....", ".w..w...", "w....w.w", "......w.", "........", "........", "........", "........"],
      { w: "rgba(255,255,255,.55)" }] },
  scales: { face: (c) => mixHex(c, "#4fa7c8", 0.6) },
  leaves: { face: () => "#f6efd6",
    tile: [[".......l....", "......lml...", ".....lmmll..", "......lml...", ".......m....", "............",
      "..l.........", ".lml........", "lmmll.......", ".lml........", "..m.........", "............"],
    { l: "#78b35a", m: "#4f8a43" }] },
  paws: { face: (c) => mixHex(c, "#ffe3c2", 0.75),
    tile: [["..........", ".w..w.....", "..........", "..www.....", ".wwwww....", ".wwwww....", "..w.w.....",
      "..........", "..........", ".........."], { w: PRINT_W }] },
  constellation: { face: () => "#3a3990",
    tile: [["..............................", "....w.........................", "....:.:.:.....w.......w.......",
      ".........:.:.w....:.:.:.......", "..............................", "..w...........................",
      "...................y..........", "...........w..................", "..............................",
      "..............................", "..............................", "..............................",
      "........................w.....", "..............................", "y.............................",
      ".............................."], { w: "#ffffff", y: "#fff0a0", ":": "rgba(255,255,255,.4)" }] },
  rainbow: { ink: "#3b2440" },
  twotone: { face: (c) => mixHex(c, "#fff4e6", 0.16), top: (c) => c },
  sunset: { ink: "#3a1631" },
  smoke: { seen: () => "#282230", see: 0.62 },
};
// Each print's tile as a CSS image, for --print-<key> on the card.
const printTiles = () => Object.entries(FINISHES).filter(([, f]) => f.tile)
  .map(([k, f]) => [`--print-${k}`, printTile(...f.tile)]);
// The shell picker's groups, in FINISHES order; the prints are the rest.
const SHELL_GROUPS = [["world plastics", ["woodland", "aqua", "grove", "celestial", "dune"]],
  ["specials", ["clear", "glitter", "glow"]]];
SHELL_GROUPS.push(["prints", Object.keys(FINISHES).filter((k) => !SHELL_GROUPS.some(([, keys]) => keys.includes(k)))]);
const finishName = (key) => (key === "twotone" ? "two-tone" : key);
// A finish's swatch in the picker: its print over its face, or bands of its plastic
// (the colours of its .finish-<key> CSS), drawn with the world's own colour.
const SWATCH_BANDS = {
  woodland: (c) => ["#f49a55", c, "#e07a40"], aqua: () => ["#80e3df", "#36b9c2", "#168d9c"],
  grove: () => ["#a9df68", "#74bd62", "#4e965c"], celestial: () => ["#777be0", "#6255bb", "#413c91"],
  dune: (c) => ["#ecc88f", c, "#cc9d62"], glow: (c) => [`color-mix(in srgb, ${c} 52%, #d4f0b4)`],
  rainbow: () => ["#ffa3b1", "#ffd08f", "#fff08f", "#a8e6a6", "#9ed4f2", "#c9aef0"],
  sunset: () => ["#ffd66e", "#ffbb63", "#ff9f62", "#ff8a78", "#f37e98", "#c96fa8"],
  clear: (c) => [`color-mix(in srgb, ${c} 40%, transparent)`], smoke: () => ["rgba(40,34,48,.75)"],
};
function finishSwatch(key, color) {
  if (!Object.hasOwn(FINISHES, key)) return color; // the world's plain plastic
  const look = FINISHES[key];
  const face = look.face ? look.face(color) : color;
  if (look.tile) return `var(--print-${key}) 0 0 / ${look.tile[0][0].length * 2}px ${look.tile[0].length * 2}px, ${face}`;
  if (key === "glitter") return `var(--glitter) 0 0 / 58px 46px, color-mix(in srgb, ${color} 80%, #fff2c9)`;
  if (key === "twotone") return `linear-gradient(180deg, ${color} 0 50%, ${face} 0)`;
  const bands = SWATCH_BANDS[key]?.(color) || [face];
  const stops = bands.map((b, i) => `${b} 0 ${Math.round(((i + 1) * 100) / bands.length)}%`);
  return `linear-gradient(180deg, ${stops.join(", ")})`;
}
// The sheet's and the picker's notes (F13): the pet speaking, a bubble with its head, hung under
// the back band (inside it, so it sticks with it and moves nothing), never over a row's taps.
const SAY_NOTE = `<div class="status-feedback say" role="status" aria-live="polite" hidden></div>`;
// Classes a button wears only for a moment (a tap, a call in flight): never part of the selector
// that puts focus back after a redraw.
const PASSING_CLASSES = new Set(["tap-feedback", "tapped", "pressed", "pending"]);
// A failed shell save, by the server's error code; anything else is the generic line.
const SHELL_ERRORS = {
  no_pet: "can't find this pet",
  shell_locked: "not grown into that one yet",
  unknown_command: "can't change the shell here",
};
// A trait's flair sprite as a small icon (its first frame or big variant).
function traitIcon(trait) {
  const f = FLAIR[trait];
  return f ? `<img class="ticon" src="${BASE}/ui/flair_${trait}${f.art ? "_1" : ""}.png?v=${VERSION}" alt="">` : "";
}

// Icon and "night owl ★★", with "↓" when it was handed down from the parent.
function traitLabel(trait, level, inherited) {
  return `${traitIcon(trait)}${inherited ? "↓" : ""}${escape(trait.replaceAll("_", " "))} ` +
    `<span role="img" aria-label="level ${level || 1}">${"★".repeat(level || 1)}</span>`;
}

// Games finished, all kinds together (the journal's game counts).
const gamesPlayed = (games) => Object.values(games || {}).reduce((n, c) => n + (c.played || 0), 0);

// The server's clock, as an offset from this device's. It is read from
// something fresh: the time_fired of a state event (see _watchServerClock), and
// later the snapshot's `now` (P3a calls noteServerTime with it). Never from a
// sensor's last_updated, which can be an hour old after a reload. Until a
// reading arrives the device clock is used as it is.
const SKEW_CAP_MS = 24 * 3600 * 1000; // a reading further off than this is not believed
let serverOffset = 0; // server time minus device time, ms
function noteServerTime(iso) {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return;
  const offset = at - Date.now();
  if (Math.abs(offset) <= SKEW_CAP_MS) serverOffset = offset;
}
const serverNow = () => Date.now() + serverOffset;
const SERVER_CLOCK_EVERY_MS = 3600000; // one reading an hour, per connection
const SERVER_CLOCK = new WeakMap(); // connection -> { at: last reading (device ms), busy }

function timeAgo(iso) {
  const minutes = Math.round((serverNow() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

