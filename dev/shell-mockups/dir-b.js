// Direction B: a pixel-art shell, SKETCHED procedurally for an art commission.
// Paints every shell part (loop, lid, roof, crescent, feet, body, bezel, button
// sockets) on a grid of G CSS px into one canvas behind the device, with a dark
// outline, a lit top-left bevel, a shaded bottom with a dither band, a specular
// and finish speckles. Real frames would be drawn by hand from this layout.
window.MOCK_GRID = 4;

window.mockPixelFrame = (device) => {
  const G = window.MOCK_GRID;
  const cs = getComputedStyle(device);
  const rgb = (v) => window.mockRgb(v);
  const shell = rgb(getComputedStyle(device.querySelector(".body")).getPropertyValue("--d-shell").trim()
    .replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgb(${parseInt(r, 16)},${parseInt(g, 16)},${parseInt(b, 16)})`));
  const bezelHex = cs.getPropertyValue("--d-bezel").trim();
  const bez = rgb(bezelHex.replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgb(${parseInt(r, 16)},${parseInt(g, 16)},${parseInt(b, 16)})`));
  const W0 = [255, 255, 255], INK = [42, 26, 16];
  const pal = (c) => ({
    base: c, light: window.mockMix(c, W0, 0.32), spec: window.mockMix(c, W0, 0.68),
    dark: c.map((v) => Math.round(v * 0.78)), deep: c.map((v) => Math.round(v * 0.62)),
    line: window.mockMix(c.map((v) => Math.round(v * 0.45)), INK, 0.55),
  });
  const P = { shell: pal(shell), part: pal(shell.map((v) => Math.round(v * 0.74))), bezel: pal(bez) };

  const dr = device.getBoundingClientRect();
  const pad = 8;
  const W = Math.ceil((dr.width + pad * 2) / G), H = Math.ceil((dr.height + pad * 2) / G);
  const rel = (el) => { const r = el.getBoundingClientRect(); return { x: r.left - dr.left + pad, y: r.top - dr.top + pad, w: r.width, h: r.height }; };
  const shown = (el) => el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0;

  // Inside a box with CSS border radii (each corner "h v", % or px).
  const radii = (el, r) => {
    const st = getComputedStyle(el);
    return ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].map((k) => {
      const parts = st[`border${k}Radius`].split(" ");
      const v = (s, size) => s.endsWith("%") ? parseFloat(s) / 100 * size : parseFloat(s) || 0;
      return [v(parts[0], r.w), v(parts[1] || parts[0], r.h)];
    });
  };
  const inRRect = (r, rad, x, y) => {
    if (x < r.x || y < r.y || x > r.x + r.w || y > r.y + r.h) return false;
    // CSS scales the radii down together when they overflow.
    const f = Math.min(1, r.w / (rad[0][0] + rad[1][0] || 1), r.w / (rad[3][0] + rad[2][0] || 1),
      r.h / (rad[0][1] + rad[3][1] || 1), r.h / (rad[1][1] + rad[2][1] || 1));
    const c = rad.map(([a, b]) => [a * f, b * f]);
    const test = (cx, cy, [a, b], sx, sy) => {
      if (!a || !b || sx * (x - cx) < 0 || sy * (y - cy) < 0) return true;
      return ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 <= 1;
    };
    return test(r.x + c[0][0], r.y + c[0][1], c[0], -1, -1) && test(r.x + r.w - c[1][0], r.y + c[1][1], c[1], 1, -1) &&
      test(r.x + r.w - c[2][0], r.y + r.h - c[2][1], c[2], 1, 1) && test(r.x + c[3][0], r.y + r.h - c[3][1], c[3], -1, 1);
  };

  // Parts back to front: [palette, inside(x, y), kind].
  const parts = [];
  const add = (pl, fn, kind = "raised") => parts.push({ pl, fn, kind });
  const loop = device.querySelector(".loop");
  if (shown(loop)) {
    const r = rel(loop);
    const inner = { x: r.x + 6, y: r.y + 6, w: r.w - 12, h: r.h };
    add(P.part, (x, y) => inRRect(r, radii(loop, r), x, y) && !inRRect(inner, [[14, 14], [14, 14], [0, 0], [0, 0]], x, y));
  }
  const roof = device.querySelector(".roof");
  if (shown(roof)) {
    const r = rel(roof);
    add(P.part, (x, y) => x > r.x + r.w * 0.8 - 22 && x < r.x + r.w * 0.8 && y > r.y + 6 && y < r.y + 46);
    add(P.part, (x, y) => y >= r.y && y <= r.y + r.h && Math.abs(x - (r.x + r.w / 2)) <= (y - r.y) / r.h * r.w / 2);
  }
  const lid = device.querySelector(".lid");
  if (shown(lid)) { const r = rel(lid); const rd = radii(lid, r); add(P.part, (x, y) => inRRect(r, rd, x, y)); }
  device.querySelectorAll(".feet span").forEach((f) => {
    if (!shown(f)) return;
    const r = rel(f); const rd = radii(f, r); add(P.part, (x, y) => inRRect(r, rd, x, y));
  });
  const cres = device.querySelector(".crescent");
  const body = device.querySelector(".body");
  const br = rel(body), brd = radii(body, br);
  const isPad = device.classList.contains("pad");
  add(P.shell, (x, y) => inRRect(br, brd, x, y) &&
    !(isPad && y < br.y + 34 && Math.abs(x - (br.x + br.w / 2)) < 23 * (1 - (y - br.y) / 34)), "body");
  if (shown(cres)) {
    const r = rel(cres); const cx = r.x + r.w / 2, cy = r.y + r.h / 2, R = 32;
    const a = -20 * Math.PI / 180, ox = -15 * Math.cos(a) - 7 * Math.sin(a), oy = -15 * Math.sin(a) + 7 * Math.cos(a);
    add(P.bezel, (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= R * R && (x - cx - ox) ** 2 + (y - cy - oy) ** 2 > R * R);
  }
  const bezel = device.querySelector(".bezel");
  const zr = rel(bezel), zrd = radii(bezel, zr);
  add(P.bezel, (x, y) => inRRect(zr, zrd, x, y), "sunk");
  device.querySelectorAll(".toy .cap").forEach((cap) => {
    const r = rel(cap); const s = { x: r.x - 2, y: r.y + 1, w: r.w + 4, h: r.h + 6 };
    const k = /tank|house/.test(device.className) ? 12 : s.w / 2;
    const rd = [[k, k], [k, k], [k, k], [k, k]];
    add(P.part, (x, y) => inRRect(s, rd, x, y), "socket");
  });

  // Rasterise: which part owns each cell (the frontmost).
  const id = new Int16Array(W * H).fill(-1);
  for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
    const x = gx * G + G / 2, y = gy * G + G / 2;
    for (let p = parts.length - 1; p >= 0; p--) if (parts[p].fn(x, y)) { id[gy * W + gx] = p; break; }
  }
  const at = (gx, gy) => (gx < 0 || gy < 0 || gx >= W || gy >= H) ? -1 : id[gy * W + gx];
  // Cells to the part's own edge, looking through the parts drawn in front of it.
  const run = (gx, gy, dx, dy, p) => { let n = 0; while (at(gx + dx * (n + 1), gy + dy * (n + 1)) >= p && n < 9) n++; return n; };
  const finish = [...device.classList].find((c) => c.startsWith("finish-"));
  const hash = (a, b) => { let h = a * 374761393 + b * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; };
  const speck = { "finish-celestial": [255, 244, 187], "finish-grove": [255, 236, 143], "finish-glitter": [255, 248, 213],
    "finish-aqua": [255, 255, 255], "finish-woodland": [255, 238, 200], "finish-dune": [150, 104, 52] }[finish];

  const canvas = document.createElement("canvas");
  canvas.className = "mx-frame";
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const bw = Math.round(br.w / G);
  for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
    const p = at(gx, gy);
    if (p < 0) continue;
    const { pl, kind } = parts[p];
    const behind = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(gx + dx, gy + dy) < p);
    const up = run(gx, gy, 0, -1, p), down = run(gx, gy, 0, 1, p), left = run(gx, gy, -1, 0, p), right = run(gx, gy, 1, 0, p);
    let c = pl.base;
    if (behind) c = pl.line;
    else if (kind === "socket") c = pl.deep;
    else if (kind === "sunk") c = (up < 1 || left < 1) ? pl.deep : (down < 1 || right < 1) ? pl.light : pl.base;
    else {
      if (up < 1 || left < 1) c = pl.light;
      else if (down < 2 || right < 1) c = pl.dark;
      else if (down < 5 && (gx + gy) % 2 === 0) c = pl.dark; // dither band into the shade
      if (kind === "body" && !behind) {
        const fx = (gx - br.x / G) / bw;
        if ((up === 2 || up === 3) && fx > 0.14 && fx < 0.34 && !(up === 3 && fx > 0.3)) c = pl.spec;
        if (up === 2 && fx > 0.37 && fx < 0.4) c = pl.spec;
        if (speck && up > 3 && down > 4 && left > 2 && right > 2 && hash(gx, gy) < 0.008) c = speck;
      }
    }
    ctx.fillStyle = window.mockHex(c);
    ctx.fillRect(gx, gy, 1, 1);
  }
  // The porthole's brass rivets, redrawn as 2x2-cell studs.
  if (device.classList.contains("porthole")) {
    const pts = [[0.5, 7, "y"], [0.5, -7, "y"], [7, 0.5, "x"], [-7, 0.5, "x"]];
    for (const [a, b] of pts) {
      const x = typeof a === "number" && Math.abs(a) > 1 ? (a > 0 ? zr.x + a : zr.x + zr.w + a) : zr.x + zr.w * a;
      const y = Math.abs(b) > 1 ? (b > 0 ? zr.y + b : zr.y + zr.h + b) : zr.y + zr.h * b;
      const gx = Math.round(x / G) - 1, gy = Math.round(y / G) - 1;
      ctx.fillStyle = window.mockHex(P.part.line); ctx.fillRect(gx, gy, 2, 2);
      ctx.fillStyle = window.mockHex(P.part.light); ctx.fillRect(gx, gy, 1, 1);
    }
  }
  canvas.style.cssText = `left:${-pad}px;top:${-pad}px;width:${W * G}px;height:${H * G}px`;
  device.prepend(canvas);
  window.mockPixelCaps(device, G);
};

// Pixel button caps: a shading overlay and a mask, both drawn on the same grid.
window.mockPixelCaps = (device, G) => {
  const cap = device.querySelector(".toy .cap");
  if (!cap) return;
  const n = Math.round(cap.getBoundingClientRect().width / G);
  const round = !/tank|house/.test(device.className);
  const inside = (x, y) => {
    const cx = x + 0.5 - n / 2, cy = y + 0.5 - n / 2, r = n / 2;
    if (round) return cx * cx + cy * cy <= r * r;
    const k = r - 2; // a cut corner two cells deep
    return Math.abs(cx) <= r && Math.abs(cy) <= r && Math.max(0, Math.abs(cx) - k) + Math.max(0, Math.abs(cy) - k) <= 2.2;
  };
  const shade = document.createElement("canvas"), mask = document.createElement("canvas");
  shade.width = mask.width = n * G; shade.height = mask.height = n * G;
  const s = shade.getContext("2d"), m = mask.getContext("2d");
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!inside(x, y)) continue;
    m.fillStyle = "#000"; m.fillRect(x * G, y * G, G, G);
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    const top = !inside(x, y - 2), bottom = !inside(x, y + 2) || !inside(x, y + 3);
    s.fillStyle = edge ? "rgba(42,26,16,.85)" : top ? "rgba(255,255,255,.75)" : bottom ? "rgba(0,0,0,.18)" : "transparent";
    if (!edge && !top && y === 2 && x > n * 0.22 && x < n * 0.42) s.fillStyle = "rgba(255,255,255,.9)";
    s.fillRect(x * G, y * G, G, G);
  }
  device.style.setProperty("--px-cap", `url(${shade.toDataURL()})`);
  device.style.setProperty("--px-capmask", `url(${mask.toDataURL()})`);
};
