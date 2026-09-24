/* ── Pattern Forge · pattern engine ──────────────────────────
   Every pattern: {
     name,
     params: {key:{label,min,max,step,def,sec,hidden}},
     draw(ctx,W,H,t,P,C),
     handles?(P)  -> [{key, x, y}]           (normalised 0..1, drag points)
     setHandle?(P, key, x, y) -> partial P    (param patch from a drag)
   }
   C = {
     stops: [[r,g,b],...], bg, hollow,
     at(u, along, idx)  → colour with "gradient run" animation
     env(off)           → brightness envelope (motion: trails/solid/pulse)
   }
──────────────────────────────────────────────────────────── */

const TAU = Math.PI * 2;

function h1(n) {
  n = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function smooth(x) { x = clamp01(x); return x * x * (3 - 2 * x); }

function gradAt(stops, u) {
  u = clamp01(u);
  if (stops.length === 1) return stops[0];
  const f = u * (stops.length - 1);
  const i = Math.min(Math.floor(f), stops.length - 2);
  const k = f - i;
  const a = stops[i], b = stops[i + 1];
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}
function rgba(c, a) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
function pulse(x) { return 0.5 + 0.5 * Math.sin(x); }

/* closed Catmull-Rom through pts, u ∈ [0,1) */
function catmull(pts, u) {
  const n = pts.length;
  const f = ((u % 1) + 1) % 1 * n;
  const i = Math.floor(f) % n;
  const s = f - Math.floor(f);
  const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
  const q = (a, b, c, d) =>
    0.5 * ((2 * b) + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s * s + (-a + 3 * b - 3 * c + d) * s * s * s);
  return [q(p0[0], p1[0], p2[0], p3[0]), q(p0[1], p1[1], p2[1], p3[1])];
}

/* buttery polyline: quadratic curves through segment midpoints */
function smoothPoly(ctx, pts, close = false) {
  const n = pts.length;
  if (n < 3) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    return;
  }
  if (close) {
    ctx.moveTo((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
    for (let i = 1; i <= n; i++) {
      const p = pts[i % n], q = pts[(i + 1) % n];
      ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    ctx.closePath();
  } else {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n - 1; i++) {
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    }
    ctx.lineTo(pts[n - 1][0], pts[n - 1][1]);
  }
}

/* glow stroke with gradient running ALONG the path.
   colFn(s ∈ 0..1) → [r,g,b] */
function glowTrace(ctx, path, colFn, baseW, lit, coreHeat) {
  const [x0, y0] = path[0], [xe, ye] = path[path.length - 1];
  const mk = (alpha) => {
    const g = ctx.createLinearGradient(x0, y0, xe, ye);
    for (let k = 0; k <= 4; k++) g.addColorStop(k / 4, rgba(colFn(k / 4), alpha));
    return g;
  };
  ctx.lineJoin = "round";
  const trace = (w, style) => {
    ctx.beginPath();
    smoothPoly(ctx, path);
    ctx.lineWidth = w;
    ctx.strokeStyle = style;
    ctx.stroke();
  };
  trace(baseW * 7, mk(0.05 * lit));
  trace(baseW * 3, mk(0.13 * lit));
  trace(baseW, mk(0.55 * lit));
  trace(baseW * 0.35, rgba([255, 255, 255], (coreHeat ?? 0.5) * 0.55 * lit));
}

const PATTERNS = {

  /* ── RAILS · flaring light strokes (flagship) ──────────── */
  rails: {
    name: "rails",
    params: {
      warpA:      { label: "warp A",      min: -1.5, max: 3,   step: 0.01,  def: 0.5 },
      warpB:      { label: "warp B",      min: 0,    max: 3,   step: 0.01,  def: 1 },
      baseWidth:  { label: "base width",  min: 0,    max: 1,   step: 0.005, def: 0.165 },
      flareSpan:  { label: "flare span",  min: 0,    max: 2,   step: 0.005, def: 0.535 },
      flareCurve: { label: "flare curve", min: 0.2,  max: 4,   step: 0.01,  def: 1.75 },
      count:      { label: "count",       min: 1,    max: 30,  step: 0.05,  def: 3.4,  sec: "lines" },
      coreHeat:   { label: "core heat",   min: 0,    max: 1,   step: 0.01,  def: 0.62, sec: "lines" },
      stroke:     { label: "stroke width",min: 0.12, max: 1,   step: 0.01,  def: 0.12, sec: "lines" },
      outerEdge:  { label: "outer edge",  min: 0.2,  max: 2,   step: 0.01,  def: 0.7,  sec: "lines" },
      seam:       { label: "centre seam", min: 0,    max: 1,   step: 0.01,  def: 0,    sec: "lines" },
      seamWidth:  { label: "seam width",  min: 0.005,max: 0.3, step: 0.001, def: 0.055,sec: "lines" },
      flip:       { label: "flip",        min: 0,    max: 1,   step: 1,     def: 0,    sec: "look" },
    },
    gl: (P) => ({
      mode: 0, lines: P.count, edge: P.outerEdge,
      base: P.baseWidth, span: P.flareSpan, flare: P.flareCurve,
      warpA: P.warpA, warpB: P.warpB,
      stroke: P.stroke, core: P.coreHeat, seam: [P.seam, P.seamWidth],
    }),
    draw(ctx, W, H, t, P, C) {
      const n = Math.round(P.count);
      const cx = W / 2;
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      const steps = 56;
      for (let i = 0; i < n; i++) {
        const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
        const au = Math.abs(u);
        const lit = C.env(au) * (0.75 + 0.25 * pulse(t * 1.7 + i * 0.13));
        if (lit < 0.02) continue;
        const path = [];
        for (let s = 0; s <= steps; s++) {
          const yn = s / steps;
          const wob = Math.sin(yn * TAU * P.warpB + t * 0.8 + i * 0.6) * P.warpA * W * 0.03 * u;
          const half = P.baseWidth * W * 0.5 + Math.pow(yn, P.flareCurve) * P.flareSpan * W * 0.5;
          const x = cx + u * half + wob;
          const y = (P.flip > 0.5 ? 1 - yn : yn) * H;
          path.push([x, y]);
        }
        const wMul = lerp(1, P.outerEdge, au);
        glowTrace(ctx, path, s => C.at(au, s, i), P.stroke * W * 0.028 * wMul, lit, P.coreHeat);
      }
      if (P.seam > 0.01) {
        const path = [[cx, 0], [cx, H]];
        glowTrace(ctx, path, s => C.at(0, s, 99), P.seamWidth * W * 0.5, P.seam * C.env(0), P.coreHeat);
      }
    },
  },

  /* ── COMB FAN · draggable hub ──────────────────────────── */
  combFan: {
    name: "comb-fan",
    params: {
      spanDeg:   { label: "span",         min: 40,  max: 360, step: 1,    def: 200 },
      inner:     { label: "inner r",      min: 0,   max: 0.8, step: 0.01, def: 0.12 },
      outer:     { label: "outer r",      min: 0.2, max: 1.6, step: 0.01, def: 0.95 },
      blades:    { label: "blades",       min: 1,   max: 30,  step: 0.05, def: 15,  sec: "lines" },
      coreHeat:  { label: "core heat",    min: 0,   max: 1,   step: 0.01, def: 0.55, sec: "lines" },
      stroke:    { label: "stroke width", min: 0.05,max: 1,   step: 0.01, def: 0.18, sec: "lines" },
      outerEdge: { label: "outer edge",   min: 0.2, max: 2,   step: 0.01, def: 1,    sec: "lines" },
      hx:        { label: "hub x",        min: 0,   max: 1,   step: 0.001,def: 0.5,  hidden: true },
      hy:        { label: "hub y",        min: 0,   max: 1,   step: 0.001,def: 0.86, hidden: true },
    },
    gl: (P) => ({
      mode: 6, lines: P.blades, edge: P.outerEdge,
      base: 0.1, span: P.outer, flare: 1,
      stroke: P.stroke, core: P.coreHeat,
      pa: [P.hx, P.hy, (P.spanDeg * Math.PI / 180) / 2, P.inner / Math.max(P.outer, 0.01)],
    }),
    handles: (P) => [{ key: "hub", x: P.hx, y: P.hy }],
    setHandle: (P, key, x, y) => ({ hx: x, hy: y }),
    draw(ctx, W, H, t, P, C) {
      const n = Math.round(P.blades);
      const cx = W * P.hx, cy = H * P.hy;
      const R = Math.min(W, H);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      const span = P.spanDeg * Math.PI / 180;
      const a0 = -Math.PI / 2 - span / 2 + t * P.spin;
      for (let i = 0; i < n; i++) {
        const u = n === 1 ? 0.5 : i / (n - 1);
        const ang = a0 + span * u + Math.sin(t * 1.4 + i * 0.5) * P.wobble * 0.08;
        const col = C.at(u, 0, i);
        const lit = C.env(u) * (0.7 + 0.3 * pulse(t * 2 - u * 5));
        const r0 = P.inner * R, r1 = P.outer * R * (0.85 + 0.15 * Math.sin(t + i));
        const x0 = cx + Math.cos(ang) * r0, y0 = cy + Math.sin(ang) * r0;
        const x1 = cx + Math.cos(ang) * r1, y1 = cy + Math.sin(ang) * r1;
        const w = P.stroke * W * 0.02;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        ctx.lineWidth = w * 4; ctx.strokeStyle = rgba(col, 0.08 * lit); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        ctx.lineWidth = w; ctx.strokeStyle = rgba(col, 0.8 * lit); ctx.stroke();
      }
    },
  },

  /* ── WAIST ARCH · mirrored lobe fans, draggable waist ──── */
  waistArch: {
    name: "waist-arch",
    params: {
      waistX:     { label: "waist x",         min: 0,    max: 1,   step: 0.005, def: 0.5 },
      shift:      { label: "lower half shift",min: 0,    max: 1,   step: 0.005, def: 0.89 },
      baseWidth:  { label: "base width",      min: 0,    max: 1,   step: 0.005, def: 0.1 },
      flareSpan:  { label: "flare span",      min: 0,    max: 2,   step: 0.005, def: 0.7 },
      flareCurve: { label: "flare curve",     min: 0.05, max: 4,   step: 0.01,  def: 0.12 },
      colSpread:  { label: "colour spread",   min: 0,    max: 2,   step: 0.01,  def: 1 },
      stagger:    { label: "end stagger",     min: 0,    max: 1,   step: 0.01,  def: 0 },
      waistY:     { label: "waist height",    min: 0.1,  max: 0.9, step: 0.002, def: 0.528 },
      count:      { label: "rails",           min: 1,    max: 30,  step: 0.05,  def: 13,   sec: "lines" },
      coreHeat:   { label: "core heat",       min: 0,    max: 1,   step: 0.01,  def: 0.62, sec: "lines" },
      stroke:     { label: "stroke width",    min: 0.05, max: 1,   step: 0.01,  def: 0.11, sec: "lines" },
      outerEdge:  { label: "outer edge",      min: 0.2,  max: 2,   step: 0.01,  def: 0.8,  sec: "lines" },
    },
    gl: (P) => ({
      mode: 1, lines: P.count, edge: P.outerEdge,
      base: P.baseWidth, span: P.flareSpan, flare: P.flareCurve,
      stroke: P.stroke, core: P.coreHeat,
      pa: [P.waistY, P.shift, P.waistX, P.colSpread],
    }),
    handles: (P) => [{ key: "waist", x: P.waistX, y: P.waistY }],
    setHandle: (P, key, x, y) => ({ waistX: +x.toFixed(3), waistY: +Math.min(0.9, Math.max(0.1, y)).toFixed(3) }),
    draw(ctx, W, H, t, P, C) {
      const n = Math.round(P.count);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      const steps = 60;
      const wx = P.waistX * W;
      const wy = P.waistY;
      /* two lobes: top fan (edge → waist) and mirrored bottom fan (waist → edge) */
      for (const half of [0, 1]) {                       // 0 = top, 1 = bottom
        const y0 = half ? wy : 0;
        const y1 = half ? 1 : wy;
        const lowerOff = half ? (P.shift - 0.5) * W * 0.12 : 0;
        for (let i = 0; i < n; i++) {
          const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
          const au = Math.abs(u);
          const lit = C.env(au) * (0.85 + 0.15 * pulse(t * 1.8 + i * 0.11 + half * 1.7));
          if (lit < 0.02) continue;
          const endTrim = P.stagger * h1(i * 5.7 + half * 31) * 0.22;
          const path = [];
          for (let s = 0; s <= steps; s++) {
            const k = s / steps;
            const yn = y0 + (y1 - y0) * k;
            /* dw: 1 at the outer edge of the lobe, 0 at the waist */
            const dw = half ? k : 1 - k;
            if (half ? k > 1 - endTrim : k < endTrim) continue;
            const halfW = P.baseWidth * W * 0.5 + Math.pow(dw, P.flareCurve) * P.flareSpan * W * 0.5;
            const sway = Math.sin(t * 0.9 + yn * 3 + half) * W * 0.008;
            path.push([wx + lowerOff + u * halfW + sway, yn * H]);
          }
          if (path.length < 2) continue;
          const wMul = lerp(1, P.outerEdge, au);
          glowTrace(
            ctx, path,
            s => C.at(clamp01(au * P.colSpread), s, i + half * 40),
            P.stroke * W * 0.026 * wMul, lit, P.coreHeat,
          );
        }
      }
    },
  },

  /* ── HORIZON · the fan on its side, light plane at height ─ */
  horizon: {
    name: "horizon",
    params: {
      height:     { label: "plane height", min: 0,   max: 1,  step: 0.005, def: 0.5 },
      baseWidth:  { label: "base width",   min: 0,   max: 1,  step: 0.005, def: 0.12 },
      flareSpan:  { label: "flare span",   min: 0,   max: 2,  step: 0.005, def: 0.7 },
      flareCurve: { label: "flare curve",  min: 0.2, max: 4,  step: 0.01,  def: 1.5 },
      count:      { label: "count",        min: 1,   max: 30, step: 0.05,  def: 8,   sec: "lines" },
      coreHeat:   { label: "core heat",    min: 0,   max: 1,  step: 0.01,  def: 0.6, sec: "lines" },
      stroke:     { label: "stroke width", min: 0.05,max: 1,  step: 0.01,  def: 0.18, sec: "lines" },
      outerEdge:  { label: "outer edge",   min: 0.2, max: 2,  step: 0.01,  def: 0.8,  sec: "lines" },
    },
    gl: (P) => ({
      mode: 4, lines: P.count, edge: P.outerEdge,
      base: P.baseWidth, span: P.flareSpan, flare: P.flareCurve,
      warpA: P.height, stroke: P.stroke, core: P.coreHeat,
    }),
    handles: (P) => [{ key: "plane", x: 0.88, y: P.height }],
    setHandle: (P, key, x, y) => ({ height: +y.toFixed(3) }),
    draw(ctx, W, H, t, P, C) {
      const n = Math.round(P.lines);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineJoin = "round";
      const steps = 90;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1 || 1);
        const y0 = Math.pow(u, P.persp) * H;
        const col = C.at(u, 0, i);
        const amp = P.amp * H * 0.16 * (0.3 + u);
        const lit = C.env(u);
        const pts = [];
        for (let s = 0; s <= steps; s++) {
          const xn = s / steps;
          const y = y0 + Math.sin(xn * TAU * P.freq + t * P.drift + u * 4) * amp
                       + Math.sin(xn * TAU * P.freq * 0.37 + t * P.drift * 0.6) * amp * 0.5;
          pts.push([xn * W, y]);
        }
        ctx.beginPath();
        smoothPoly(ctx, pts);
        ctx.lineWidth = P.stroke * W * 0.008 * (0.5 + u * 1.5);
        ctx.strokeStyle = rgba(col, (0.35 + 0.55 * lit));
        ctx.stroke();
      }
    },
  },

  /* ── TILES ─────────────────────────────────────────────── */
  tiles: {
    name: "tiles",
    params: {
      cells:    { label: "cells across", min: 4,   max: 20,  step: 1,    def: 9 },
      fill:     { label: "fill chance",  min: 0.02,max: 0.6, step: 0.01, def: 0.16 },
      reshuffle:{ label: "reshuffle / s",min: 0.1, max: 2,   step: 0.05, def: 0.55 },
      inset:    { label: "tile inset",   min: 0,   max: 0.4, step: 0.01, def: 0.1 },
      lineFade: { label: "line fade",    min: 0,   max: 1,   step: 0.01, def: 0.9, sec: "lines" },
      stagger:  { label: "stagger",      min: 0,   max: 3,   step: 0.05, def: 1.1, sec: "look" },
    },
    draw(ctx, W, H, t, P, C) {
      const n = Math.round(P.cells);
      const cw = W / n;
      const rows = Math.ceil(H / cw);
      const beat = Math.floor(t * P.reshuffle);
      const frac = t * P.reshuffle - beat;
      ctx.globalCompositeOperation = "source-over";
      const gcol = C.at(0.5, 0, 0);
      ctx.strokeStyle = rgba(gcol, 0.12 * (1 - P.lineFade * 0.7));
      ctx.lineWidth = Math.max(1, W * 0.0012);
      ctx.beginPath();
      for (let x = 0; x <= n; x++) { ctx.moveTo(x * cw, 0); ctx.lineTo(x * cw, H); }
      for (let y = 0; y <= rows; y++) { ctx.moveTo(0, y * cw); ctx.lineTo(W, y * cw); }
      ctx.stroke();
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < n; gx++) {
          const cellSeed = gx * 31.7 + gy * 17.3 + beat * 101.9;
          if (h1(cellSeed) > P.fill) continue;
          const appear = smooth(frac * (1 + P.stagger) - h1(cellSeed * 3.1) * P.stagger);
          if (appear <= 0.01) continue;
          const kind = Math.floor(h1(cellSeed * 7.7) * 4);
          const col = C.at(h1(cellSeed * 5.3), 0, gx + gy);
          const col2 = C.at(h1(cellSeed * 9.1), 0.5, gx * gy);
          const inset = cw * P.inset;
          const x = gx * cw + inset, y = gy * cw + inset, s = cw - inset * 2;
          ctx.save();
          ctx.globalAlpha = appear;
          ctx.beginPath(); ctx.rect(x, y, s, s); ctx.clip();
          if (kind === 0) {
            ctx.fillStyle = rgba(col, 1);
            for (let k = 0; k < 5; k++) if (k % 2 === 0) ctx.fillRect(x + (k / 5) * s, y, s / 5, s);
          } else if (kind === 1) {
            ctx.fillStyle = rgba(col, 1);
            for (let k = 0; k < 5; k++) if (k % 2 === 0) ctx.fillRect(x, y + (k / 5) * s, s, s / 5);
          } else if (kind === 2) {
            const m = 4, ms = s / m;
            ctx.fillStyle = rgba(col, 1);
            for (let a = 0; a < m; a++) for (let b = 0; b < m; b++)
              if ((a + b) % 2 === 0) ctx.fillRect(x + a * ms, y + b * ms, ms, ms);
          } else {
            ctx.fillStyle = rgba(col, 1); ctx.fillRect(x, y, s, s);
            ctx.fillStyle = rgba(col2, 1);
            ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.22, 0, TAU); ctx.fill();
          }
          ctx.restore();
        }
      }
    },
  },

  /* ── RING COIL · ripple rings ──────────────────────────── */
  rings: {
    name: "ring-coil",
    params: {
      wobble:    { label: "wobble depth", min: 0,   max: 1,  step: 0.01,  def: 0.35 },
      lobes:     { label: "wobble lobes", min: 1,   max: 12, step: 1,     def: 5 },
      drift:     { label: "drift speed",  min: 0,   max: 1,  step: 0.01,  def: 0.25 },
      spread:    { label: "spread",       min: 0.2, max: 2,  step: 0.01,  def: 1 },
      cx:        { label: "centre x",     min: 0,   max: 1,  step: 0.001, def: 0.5, hidden: true },
      cy:        { label: "centre y",     min: 0,   max: 1,  step: 0.001, def: 0.5, hidden: true },
      rings:     { label: "rings",        min: 1,   max: 30, step: 0.05,  def: 9,   sec: "lines" },
      coreHeat:  { label: "core heat",    min: 0,   max: 1,  step: 0.01,  def: 0.6, sec: "lines" },
      stroke:    { label: "stroke width", min: 0.05,max: 1,  step: 0.01,  def: 0.16, sec: "lines" },
      outerEdge: { label: "outer edge",   min: 0.2, max: 2,  step: 0.01,  def: 1,    sec: "lines" },
    },
    gl: (P) => ({
      mode: 5, lines: P.rings, edge: P.outerEdge,
      base: 0.1, span: P.spread, flare: 1,
      warpA: P.wobble, stroke: P.stroke, core: P.coreHeat,
      pa: [P.cx, P.cy, P.lobes / 12, P.drift],
    }),
    handles: (P) => [{ key: "centre", x: P.cx, y: P.cy }],
    setHandle: (P, key, x, y) => ({ cx: +x.toFixed(3), cy: +y.toFixed(3) }),
    draw(ctx, W, H, t, P, C) {
      const n = Math.round(P.rings);
      const cx = W / 2, cy = H / 2;
      const maxR = Math.hypot(W, H) * 0.5;
      ctx.globalCompositeOperation = "lighter";
      ctx.lineJoin = "round";
      const steps = 140;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1 || 1);
        const baseR = Math.pow(u, P.gapPow) * maxR * (1 + Math.sin(t * 1.2 + u * 3) * P.breathe * 0.12);
        const col = C.at(u, 0, i);
        const lit = C.env(u);
        const pts = [];
        for (let s = 0; s < steps; s++) {
          const a = (s / steps) * TAU;
          const r = baseR * (1 + Math.sin(a * Math.round(P.wfreq) + t * 1.5 + u * 6) * P.wobble * 0.12);
          pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        ctx.beginPath();
        smoothPoly(ctx, pts, true);
        ctx.lineWidth = P.stroke * W * 0.008;
        ctx.strokeStyle = rgba(col, 0.25 + 0.65 * lit);
        ctx.stroke();
      }
    },
  },

  /* ── COSMOS ────────────────────────────────────────────── */
  cosmos: {
    name: "cosmos",
    params: {
      bodies: { label: "bodies",  min: 20,  max: 600, step: 1,    def: 220, sec: "lines" },
      spread: { label: "spread",  min: 0.1, max: 1.4, step: 0.01, def: 0.8 },
      size:   { label: "size",    min: 0.2, max: 3,   step: 0.05, def: 1,  sec: "lines" },
      swirl:  { label: "swirl",   min: 0,   max: 2,   step: 0.01, def: 0.5 },
      ecc:    { label: "flatten", min: 0,   max: 0.9, step: 0.01, def: 0.35 },
      ring:   { label: "rings",   min: 0,   max: 1,   step: 0.01, def: 0.4 },
    },
    draw(ctx, W, H, t, P, C) {
      const n = Math.round(P.bodies);
      const cx = W / 2, cy = H / 2;
      const R = Math.min(W, H) * 0.5 * P.spread * 1.4;
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < n; i++) {
        const rr = h1(i * 1.7);
        const band = P.ring > 0.02 ? (Math.round(rr * 6) / 6) * P.ring + rr * (1 - P.ring) : rr;
        const r = Math.sqrt(band) * R;
        const sp = (1.4 - band) * P.swirl;
        const ang = h1(i * 3.1) * TAU + t * sp;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r * (1 - P.ecc);
        const col = C.at(band, 0, i);
        const tw = (0.4 + 0.6 * pulse(t * 3 + i)) * (0.3 + 0.7 * C.env(band));
        const s = (0.6 + h1(i * 8.8) * 1.8) * P.size * W * 0.0035;
        ctx.beginPath(); ctx.arc(x, y, s, 0, TAU);
        ctx.fillStyle = rgba(col, 0.85 * tw);
        ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, s * 3, 0, TAU);
        ctx.fillStyle = rgba(col, 0.07 * tw);
        ctx.fill();
      }
    },
  },

  /* ── BUD FIELD ─────────────────────────────────────────── */
  budField: {
    name: "bud-field",
    params: {
      petals:     { label: "petal count", min: 2,   max: 12,  step: 1,    def: 4 },
      baseWidth:  { label: "base width",  min: 0,   max: 0.6, step: 0.005,def: 0.06 },
      flareSpan:  { label: "flare span",  min: 0,   max: 2,   step: 0.005,def: 0.6 },
      flareCurve: { label: "flare curve", min: 0.2, max: 5,   step: 0.05, def: 2 },
      spin:       { label: "spin",        min: -1,  max: 1,   step: 0.01, def: 0.05 },
      count:      { label: "count",       min: 1,   max: 30,  step: 0.05, def: 5,    sec: "lines" },
      coreHeat:   { label: "core heat",   min: 0,   max: 1,   step: 0.01, def: 0.52, sec: "lines" },
      stroke:     { label: "stroke width",min: 0.05,max: 1,   step: 0.01, def: 0.3,  sec: "lines" },
      outerEdge:  { label: "outer edge",  min: 0.2, max: 2,   step: 0.01, def: 1,    sec: "lines" },
    },
    gl: (P) => ({
      mode: 10, lines: P.count, edge: P.outerEdge,
      base: P.baseWidth, span: P.flareSpan, flare: P.flareCurve,
      warpB: P.spin, stroke: P.stroke, core: P.coreHeat,
      pa: [P.petals, 0, 0, 0],
    }),
    draw(ctx, W, H, t, P, C) {
      const cx = W / 2, cy = H / 2;
      const R = Math.hypot(W, H) * 0.62;
      const petals = Math.round(P.petals) * 2;
      const lines = Math.round(P.count);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      const steps = 40;
      for (let p = 0; p < petals; p++) {
        const baseAng = (p / petals) * TAU + t * P.spin;
        for (let i = 0; i < lines; i++) {
          const u = lines === 1 ? 0 : (i / (lines - 1)) * 2 - 1;
          const au = Math.abs(u);
          const lit = C.env(au) * (0.8 + 0.2 * pulse(t * 2 + p * 0.7));
          if (lit < 0.02) continue;
          const path = [];
          for (let s = 0; s <= steps; s++) {
            const rn = s / steps;
            const off = u * (P.baseWidth + Math.pow(rn, P.flareCurve) * P.flareSpan) * 0.5;
            const ang = baseAng + off;
            const r = rn * R;
            path.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
          }
          glowTrace(ctx, path, s => C.at(au, s, p * 13 + i), P.stroke * W * 0.02, lit, P.coreHeat);
        }
      }
    },
  },

  /* ── ASCII RAIN ────────────────────────────────────────── */
  asciiRain: {
    name: "ascii-rain",
    params: {
      cols:   { label: "columns", min: 8,   max: 80,  step: 1,    def: 32, sec: "lines" },
      speed:  { label: "speed",   min: 0.1, max: 3,   step: 0.01, def: 1 },
      density:{ label: "density", min: 0.1, max: 1,   step: 0.01, def: 0.7 },
      trail:  { label: "trail",   min: 2,   max: 26,  step: 1,    def: 10 },
      glow:   { label: "glow",    min: 0,   max: 1,   step: 0.01, def: 0.5, sec: "look" },
    },
    chars: "01✦✧+×*·:∆|/\\—≡".split(""),
    draw(ctx, W, H, t, P, C) {
      const n = Math.round(P.cols);
      const cw = W / n;
      const fs = cw * 0.72;
      ctx.font = `${fs}px "SF Mono", Menlo, monospace`;
      ctx.textAlign = "center";
      ctx.globalCompositeOperation = "lighter";
      const rows = Math.ceil(H / cw) + 2;
      const trail = Math.round(P.trail);
      for (let i = 0; i < n; i++) {
        if (h1(i * 3.7) > P.density) continue;
        const sp = 0.4 + h1(i * 1.3) * 1.2;
        const headRow = (t * P.speed * sp * 6 + h1(i * 9.1) * rows * 3) % (rows + trail);
        const col = C.at(h1(i * 5.77), 0, i);
        for (let k = 0; k < trail; k++) {
          const row = Math.floor(headRow) - k;
          if (row < 0 || row > rows) continue;
          const a = (1 - k / trail);
          const ch = this.chars[Math.floor(h1(i * 13.7 + row * 7.3) * this.chars.length)];
          const x = (i + 0.5) * cw, y = row * cw;
          if (k === 0 && P.glow > 0.05) {
            ctx.fillStyle = rgba([255, 255, 255], 0.85 * P.glow);
            ctx.fillText(ch, x, y);
          }
          ctx.fillStyle = rgba(col, a * a * 0.9);
          ctx.fillText(ch, x, y);
        }
      }
    },
  },

  /* ── CHECKMATE ─────────────────────────────────────────── */
  checkmate: {
    name: "checkmate",
    params: {
      cells:  { label: "cells",  min: 4,   max: 40, step: 1,    def: 12 },
      warp:   { label: "warp",   min: 0,   max: 1,  step: 0.01, def: 0.35 },
      wfreq:  { label: "w · freq",min: 0.5,max: 5,  step: 0.05, def: 1.5 },
      speed:  { label: "speed",  min: 0,   max: 2,  step: 0.01, def: 0.4 },
      round:  { label: "round",  min: 0,   max: 1,  step: 0.01, def: 0, sec: "look" },
      inset:  { label: "inset",  min: 0,   max: 0.45,step: 0.01,def: 0.04, sec: "look" },
    },
    draw(ctx, W, H, t, P, C) {
      const n = Math.round(P.cells);
      const cw = W / n;
      const rows = Math.ceil(H / cw);
      ctx.globalCompositeOperation = "source-over";
      for (let gy = 0; gy <= rows; gy++) {
        for (let gx = 0; gx < n; gx++) {
          const wob = Math.sin((gx / n) * TAU * P.wfreq + t * P.speed * 2) *
                      Math.cos((gy / rows) * TAU * P.wfreq * 0.8 + t * P.speed * 1.4);
          const on = (gx + gy) % 2 === 0;
          const u = clamp01(0.5 + wob * 0.5);
          if (!on && P.warp < 0.999) {
            if (wob * P.warp < 0.2) continue;
          }
          const col = C.at(on ? u : 1 - u, 0, gx + gy * 31);
          const inset = cw * P.inset;
          const s = (cw - inset * 2) * (on ? 1 : clamp01(wob * P.warp * 2));
          if (s <= 0.5) continue;
          const x = gx * cw + cw / 2, y = gy * cw + cw / 2;
          const rad = (P.round * s) / 2;
          ctx.beginPath();
          if (typeof ctx.roundRect === "function") ctx.roundRect(x - s / 2, y - s / 2, s, s, rad);
          else ctx.rect(x - s / 2, y - s / 2, s, s);
          if (C.hollow > 0.5) {
            ctx.lineWidth = Math.max(1, cw * 0.05);
            ctx.strokeStyle = rgba(col, 0.92);
            ctx.stroke();
          } else {
            ctx.fillStyle = rgba(col, 0.92);
            ctx.fill();
          }
        }
      }
    },
  },

  /* ── GRID BURST ────────────────────────────────────────── */
  gridBurst: {
    name: "grid-burst",
    params: {
      cells:  { label: "cells",   min: 4,   max: 36,  step: 1,    def: 14 },
      size:   { label: "size",    min: 0.1, max: 1,   step: 0.01, def: 0.5 },
      pulseA: { label: "pulse",   min: 0,   max: 1,   step: 0.01, def: 0.6 },
      rot:    { label: "rotate",  min: 0,   max: 1,   step: 0.01, def: 0.2, sec: "look" },
      shape:  { label: "shape",   min: 0,   max: 2,   step: 1,    def: 0,   sec: "look" },
      radial: { label: "radial",  min: 0,   max: 1,   step: 0.01, def: 0.7 },
    },
    draw(ctx, W, H, t, P, C) {
      const n = Math.round(P.cells);
      const cw = W / n;
      const rows = Math.max(1, Math.round(n * H / W));
      const chh = H / rows;
      ctx.globalCompositeOperation = "lighter";
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < n; gx++) {
          const x = (gx + 0.5) * cw, y = (gy + 0.5) * chh;
          const d = Math.hypot(x - W / 2, y - H / 2) / (Math.hypot(W, H) / 2);
          const ph = t * 2.4 - d * P.radial * 8;
          const k = 0.5 + 0.5 * Math.sin(ph);
          const s = cw * P.size * (1 - P.pulseA + P.pulseA * k);
          const col = C.at(d, 0, gx * 7 + gy);
          const a = (0.35 + 0.6 * k) * (0.3 + 0.7 * C.env(d));
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(Math.sin(ph * 0.5) * P.rot * Math.PI);
          ctx.strokeStyle = rgba(col, a);
          ctx.fillStyle = rgba(col, a);
          ctx.lineWidth = Math.max(1, cw * 0.06);
          const shape = Math.round(P.shape);
          if (shape === 0) {
            ctx.beginPath();
            ctx.moveTo(-s / 2, 0); ctx.lineTo(s / 2, 0);
            ctx.moveTo(0, -s / 2); ctx.lineTo(0, s / 2);
            ctx.stroke();
          } else if (shape === 1) {
            ctx.beginPath(); ctx.arc(0, 0, s / 2 * 0.6, 0, TAU); ctx.fill();
          } else {
            ctx.strokeRect(-s / 2, -s / 2, s, s);
          }
          ctx.restore();
        }
      }
    },
  },

  /* ── ECHO PATH · card echoes along a draggable path ────── */
  echoPath: {
    name: "echo-path",
    params: {
      copies: { label: "copies",       min: 4,   max: 120, step: 1,     def: 40 },
      size:   { label: "card size",    min: 0.04,max: 0.5, step: 0.005, def: 0.135 },
      radius: { label: "corner radius",min: 0,   max: 1,   step: 0.01,  def: 0.3 },
      pace:   { label: "pace",         min: 0.05,max: 1.5, step: 0.01,  def: 0.2 },
      gap:    { label: "echo gap",     min: 0.002,max: 0.05,step: 0.001,def: 0.012, sec: "lines" },
      fillOn: { label: "fill",         min: 0,   max: 1,   step: 1,     def: 1, sec: "look" },
      p1x: { label: "p1x", min: 0, max: 1, step: 0.001, def: 0.25, hidden: true },
      p1y: { label: "p1y", min: 0, max: 1, step: 0.001, def: 0.28, hidden: true },
      p2x: { label: "p2x", min: 0, max: 1, step: 0.001, def: 0.75, hidden: true },
      p2y: { label: "p2y", min: 0, max: 1, step: 0.001, def: 0.22, hidden: true },
      p3x: { label: "p3x", min: 0, max: 1, step: 0.001, def: 0.72, hidden: true },
      p3y: { label: "p3y", min: 0, max: 1, step: 0.001, def: 0.75, hidden: true },
      p4x: { label: "p4x", min: 0, max: 1, step: 0.001, def: 0.28, hidden: true },
      p4y: { label: "p4y", min: 0, max: 1, step: 0.001, def: 0.72, hidden: true },
    },
    handles: (P) => [
      { key: "p1", x: P.p1x, y: P.p1y },
      { key: "p2", x: P.p2x, y: P.p2y },
      { key: "p3", x: P.p3x, y: P.p3y },
      { key: "p4", x: P.p4x, y: P.p4y },
    ],
    setHandle: (P, key, x, y) => ({ [key + "x"]: +x.toFixed(3), [key + "y"]: +y.toFixed(3) }),
    draw(ctx, W, H, t, P, C) {
      const n = Math.round(P.copies);
      const pts = [[P.p1x * W, P.p1y * H], [P.p2x * W, P.p2y * H], [P.p3x * W, P.p3y * H], [P.p4x * W, P.p4y * H]];
      const s = P.size * Math.min(W, H);
      ctx.globalCompositeOperation = "source-over";
      /* faint guide path */
      const guide = [];
      for (let k = 0; k < 100; k++) guide.push(catmull(pts, k / 100));
      ctx.beginPath();
      smoothPoly(ctx, guide, true);
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(1, W * 0.0015);
      ctx.strokeStyle = rgba(C.at(0.5, 0, 3), 0.14);
      ctx.stroke();
      /* echoes, oldest first */
      for (let i = n - 1; i >= 0; i--) {
        const u = i / (n - 1 || 1);
        const [x, y] = catmull(pts, t * P.pace - i * P.gap);
        const col = C.at(u, t * P.pace - i * P.gap, i);
        const a = Math.pow(1 - u, 1.4);
        const rad = (P.radius * s) / 2;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(x - s / 2, y - s * 0.66, s, s * 1.32, rad);
        else ctx.rect(x - s / 2, y - s * 0.66, s, s * 1.32);
        if (P.fillOn > 0.5 && i === 0 && C.hollow < 0.5) {
          ctx.fillStyle = rgba(col, 0.95);
          ctx.fill();
        }
        ctx.lineWidth = Math.max(1, W * 0.0035 * (1 - u * 0.6));
        ctx.strokeStyle = rgba(col, 0.12 + 0.85 * a);
        ctx.stroke();
      }
    },
  },

  /* ── RAYS FROM FOCUS · draggable focus ─────────────────── */
  raysFocus: {
    name: "rays-from-focus",
    params: {
      raySpread: { label: "ray spread",   min: 0.1, max: 2,  step: 0.01,  def: 1 },
      count:     { label: "count",        min: 1,   max: 30, step: 0.05,  def: 9,    sec: "lines" },
      coreHeat:  { label: "core heat",    min: 0,   max: 1,  step: 0.01,  def: 0.55, sec: "lines" },
      stroke:    { label: "stroke width", min: 0.05,max: 1,  step: 0.01,  def: 0.18, sec: "lines" },
      outerEdge: { label: "outer edge",   min: 0.2, max: 2,  step: 0.01,  def: 0.95, sec: "lines" },
      fx:        { label: "focus x",      min: 0,   max: 1,  step: 0.001, def: 0.5, hidden: true },
      fy:        { label: "focus y",      min: 0,   max: 1,  step: 0.001, def: 0.5, hidden: true },
    },
    gl: (P) => ({
      mode: 3, lines: P.count, edge: P.outerEdge,
      base: 0.1, span: 0.5, flare: 1,
      stroke: P.stroke, core: P.coreHeat,
      pa: [P.fx, P.fy, P.raySpread, 0],
    }),
    handles: (P) => [{ key: "focus", x: P.fx, y: P.fy }],
    setHandle: (P, key, x, y) => ({ fx: +x.toFixed(3), fy: +y.toFixed(3) }),
    draw(ctx, W, H, t, P, C) {
      const n = Math.round(P.count);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      const halves = P.mirror > 0.5 ? [0, 1] : [0];
      for (const flip of halves) {
        const fx = flip ? W * (1 - P.fx) : W * P.fx;
        const fy = flip ? H * (1 - P.fy) : H * P.fy;
        const dir = fy < H / 2 ? 1 : -1;
        const reach = P.mirror > 0.5 ? Math.abs(H / 2 - fy) + H * 0.02 : H * 1.05;
        for (let i = 0; i < n; i++) {
          const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
          const au = Math.abs(u);
          const lit = C.env(au) * (0.8 + 0.2 * pulse(t * 1.6 + flip * 1.3));
          if (lit < 0.02) continue;
          const steps = 30;
          const path = [];
          for (let s = 0; s <= steps; s++) {
            const rn = s / steps;
            const x = fx + u * (P.baseWidth * 0.3 + Math.pow(rn, 1.4) * P.raySpread) * W * 0.62;
            const y = fy + dir * rn * reach;
            path.push([x, y]);
          }
          const bw = (P.baseWidth * 0.35 + au * P.flareSpan * 0.25) * W * 0.14;
          const colFn = s => C.at(au, s, i + flip * 40);
          const mk = (alpha) => {
            const g = ctx.createLinearGradient(path[0][0], path[0][1], path[steps][0], path[steps][1]);
            for (let k = 0; k <= 4; k++) g.addColorStop(k / 4, rgba(colFn(k / 4), alpha));
            return g;
          };
          const trace = (w, style) => {
            ctx.beginPath();
            smoothPoly(ctx, path);
            ctx.lineJoin = "round";
            ctx.lineWidth = w; ctx.strokeStyle = style; ctx.stroke();
          };
          trace(bw * 2.6, mk(0.07 * lit));
          trace(bw * 1.4, mk(0.16 * lit));
          trace(bw * 0.55, mk(0.38 * lit));
          trace(bw * 0.16, rgba([255, 255, 255], P.coreHeat * 0.45 * lit));
        }
      }
    },
  },

  /* ── SINE WARPED FAN ───────────────────────────────────── */
  sineFan: {
    name: "sine-warped-fan",
    params: {
      waveFreq:   { label: "wave frequency",min: 0.2, max: 8,  step: 0.05,  def: 2.4 },
      waveDepth:  { label: "wave depth",    min: 0,   max: 3,  step: 0.05,  def: 0.8 },
      baseWidth:  { label: "base width",    min: 0,   max: 0.9,step: 0.005, def: 0.1 },
      flareSpan:  { label: "flare span",    min: 0,   max: 1.4,step: 0.005, def: 0.3 },
      flareCurve: { label: "flare curve",   min: 0.2, max: 5,  step: 0.05,  def: 1 },
      count:      { label: "count",         min: 1,   max: 30, step: 0.05,  def: 7,    sec: "lines" },
      coreHeat:   { label: "core heat",     min: 0,   max: 1,  step: 0.01,  def: 0.55, sec: "lines" },
      stroke:     { label: "stroke width",  min: 0.05,max: 1,  step: 0.01,  def: 0.16, sec: "lines" },
      outerEdge:  { label: "outer edge",    min: 0.2, max: 2,  step: 0.01,  def: 0.9,  sec: "lines" },
    },
    gl: (P) => ({
      mode: 2, lines: P.count, edge: P.outerEdge,
      base: P.baseWidth, span: P.flareSpan, flare: P.flareCurve,
      warpA: P.waveFreq, warpB: P.waveDepth,
      stroke: P.stroke, core: P.coreHeat,
    }),
    draw(ctx, W, H, t, P, C) {
      const n = Math.round(P.count);
      const cx = W / 2;
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      const steps = 72;
      for (let i = 0; i < n; i++) {
        const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
        const au = Math.abs(u);
        const lit = C.env(au) * (0.8 + 0.2 * pulse(t * 1.8 + i * 0.2));
        if (lit < 0.02) continue;
        const path = [];
        for (let s = 0; s <= steps; s++) {
          const yn = s / steps;
          const half = P.baseWidth * W * 0.5 + Math.pow(yn, P.flareCurve) * P.flareSpan * W * 0.5;
          const warp = Math.sin(yn * TAU * P.waveFreq + t * 1.1 + au * 2) * P.waveDepth * W * 0.02 * (0.25 + yn);
          path.push([cx + u * half + warp, yn * H]);
        }
        glowTrace(ctx, path, s => C.at(au, s, i), P.stroke * W * 0.024, lit, P.coreHeat);
      }
    },
  },

  /* ── BEAMS · draggable direction ───────────────────────── */
  beams: {
    name: "beams",
    params: {
      angle:     { label: "angle",        min: -180,max: 180, step: 1,    def: 24 },
      width:     { label: "width",        min: 0.02,max: 0.6, step: 0.005,def: 0.14 },
      soft:      { label: "softness",     min: 0,   max: 1,   step: 0.01, def: 0.6 },
      gap:       { label: "gap",          min: 0.5, max: 4,   step: 0.05, def: 1.6 },
      speed:     { label: "drift speed",  min: 0,   max: 2,   step: 0.01, def: 0.35 },
      coreHeat:  { label: "core heat",    min: 0,   max: 1,   step: 0.01, def: 0.4, sec: "lines" },
      outerEdge: { label: "outer edge",   min: 0.2, max: 2,   step: 0.01, def: 0.8, sec: "lines" },
    },
    gl: (P) => ({
      mode: 8, lines: 1, edge: P.outerEdge,
      base: P.width, span: P.width, flare: 1,
      warpA: P.angle * Math.PI / 180, warpB: P.speed,
      stroke: 0.25 + (1 - P.soft) * 0.5, core: P.coreHeat,
      pa: [P.gap, 0, 0, 0],
    }),
    handles: (P) => {
      const a = P.angle * Math.PI / 180;
      return [{ key: "dir", x: 0.5 + Math.cos(a) * 0.32, y: 0.5 + Math.sin(a) * 0.32 }];
    },
    setHandle: (P, key, x, y) => ({ angle: Math.round(Math.atan2(y - 0.5, x - 0.5) * 180 / Math.PI) }),
    draw(ctx, W, H, t, P, C) {
      const n = Math.round(P.count);
      const diag = Math.hypot(W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(P.angle * Math.PI / 180);
      ctx.globalCompositeOperation = "lighter";
      const spacing = (diag / n) * P.gap;
      const total = spacing * n;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1 || 1);
        const col = C.at(u, 0, i);
        let x = -total / 2 + i * spacing + ((t * P.speed * spacing) % spacing);
        const bw = P.width * diag;
        const g = ctx.createLinearGradient(x - bw, 0, x + bw, 0);
        const lit = (0.4 + 0.6 * C.env(u)) * (0.7 + 0.3 * pulse(t * 2 + i * 1.7));
        g.addColorStop(0, rgba(col, 0));
        g.addColorStop(0.5 - 0.45 * (1 - P.soft), rgba(col, 0.75 * lit));
        g.addColorStop(0.5 + 0.45 * (1 - P.soft), rgba(col, 0.75 * lit));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - bw, -diag, bw * 2, diag * 2);
      }
      ctx.restore();
    },
  },

  /* ── SPIRAL ────────────────────────────────────────────── */
  spiral: {
    name: "spiral",
    params: {
      turns:     { label: "turns",        min: 1,   max: 16,  step: 0.1,  def: 5 },
      arms:      { label: "arms",         min: 1,   max: 8,   step: 1,    def: 2 },
      tight:     { label: "tightness",    min: 0.4, max: 3,   step: 0.05, def: 1 },
      spin:      { label: "spin",         min: -1,  max: 1,   step: 0.01, def: 0.15 },
      coreHeat:  { label: "core heat",    min: 0,   max: 1,   step: 0.01, def: 0.55, sec: "lines" },
      stroke:    { label: "stroke width", min: 0.05,max: 1,   step: 0.01, def: 0.2,  sec: "lines" },
      outerEdge: { label: "outer edge",   min: 0.2, max: 2,   step: 0.01, def: 0.6,  sec: "lines" },
    },
    gl: (P) => ({
      mode: 7, lines: 1, edge: P.outerEdge,
      base: 0.1, span: 0.5, flare: 1,
      warpA: P.turns, warpB: P.spin,
      stroke: P.stroke, core: P.coreHeat,
      pa: [P.arms, P.tight, 0, 0],
    }),
    draw(ctx, W, H, t, P, C) {
      const cx = W / 2, cy = H / 2;
      const R = Math.hypot(W, H) * 0.55;
      const arms = Math.round(P.arms);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      const steps = 340;
      for (let a = 0; a < arms; a++) {
        const off = (a / arms) * TAU;
        if (P.dots > 0.5) {
          for (let s = 0; s <= steps; s += 4) {
            const u = s / steps;
            const ang = off + u * TAU * P.turns + t * P.spin * 2;
            const r = Math.pow(u, P.tight) * R;
            const col = C.at(u, u, a);
            ctx.beginPath();
            ctx.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r,
                    P.stroke * W * 0.006 * (0.5 + u * 2), 0, TAU);
            ctx.fillStyle = rgba(col, 0.2 + 0.7 * C.env(u));
            ctx.fill();
          }
        } else {
          /* smooth chunked strokes — colour/width vary along the coil */
          ctx.lineJoin = "round";
          const total = 480, chunk = 16;
          const ptAt = (s) => {
            const u = s / total;
            const ang = off + u * TAU * P.turns + t * P.spin * 2;
            const r = Math.pow(u, P.tight) * R;
            return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r];
          };
          for (let s0 = 0; s0 < total; s0 += chunk) {
            const uMid = (s0 + chunk / 2) / total;
            const pts = [];
            for (let s = s0; s <= Math.min(total, s0 + chunk); s++) pts.push(ptAt(s));
            const col = C.at(uMid, uMid, a);
            ctx.beginPath();
            smoothPoly(ctx, pts);
            ctx.lineWidth = P.stroke * W * 0.01 * (0.3 + uMid * 1.7);
            ctx.strokeStyle = rgba(col, 0.25 + 0.65 * C.env(uMid));
            ctx.stroke();
          }
        }
      }
    },
  },

  /* ── SHAPE SHIFTER · custom blob, drag handles ─────────── */
  shapeShifter: {
    name: "shape-shifter",
    params: {
      layers:    { label: "layers",    min: 3,   max: 16,  step: 1,    def: 8 },
      amp:       { label: "morph",     min: 0,   max: 1,   step: 0.01, def: 0.25 },
      harmonics: { label: "harmonics", min: 1,   max: 7,   step: 1,    def: 3 },
      drift:     { label: "drift",     min: 0,   max: 2,   step: 0.01, def: 0.5, sec: "look" },
      scale:     { label: "scale",     min: 0.4, max: 2,   step: 0.01, def: 1.1 },
      pinch:     { label: "pinch",     min: 0.5, max: 6,   step: 0.05, def: 2.5 },
      h0x: { label: "h0x", min: 0, max: 1, step: 0.001, def: 0.5,  hidden: true },
      h0y: { label: "h0y", min: 0, max: 1, step: 0.001, def: 0.12, hidden: true },
      h1x: { label: "h1x", min: 0, max: 1, step: 0.001, def: 0.88, hidden: true },
      h1y: { label: "h1y", min: 0, max: 1, step: 0.001, def: 0.5,  hidden: true },
      h2x: { label: "h2x", min: 0, max: 1, step: 0.001, def: 0.5,  hidden: true },
      h2y: { label: "h2y", min: 0, max: 1, step: 0.001, def: 0.88, hidden: true },
      h3x: { label: "h3x", min: 0, max: 1, step: 0.001, def: 0.12, hidden: true },
      h3y: { label: "h3y", min: 0, max: 1, step: 0.001, def: 0.5,  hidden: true },
    },
    handles: (P) => [
      { key: "h0", x: P.h0x, y: P.h0y },
      { key: "h1", x: P.h1x, y: P.h1y },
      { key: "h2", x: P.h2x, y: P.h2y },
      { key: "h3", x: P.h3x, y: P.h3y },
    ],
    setHandle: (P, key, x, y) => ({ [key + "x"]: +x.toFixed(3), [key + "y"]: +y.toFixed(3) }),
    draw(ctx, W, H, t, P, C) {
      const pts = [[P.h0x, P.h0y], [P.h1x, P.h1y], [P.h2x, P.h2y], [P.h3x, P.h3y]];
      const cx = pts.reduce((a, p) => a + p[0], 0) / 4 * W;
      const cy = pts.reduce((a, p) => a + p[1], 0) / 4 * H;
      /* directional radius from handle distances */
      const dirs = pts.map(p => {
        const dx = p[0] * W - cx, dy = p[1] * H - cy;
        return { ang: Math.atan2(dy, dx), d: Math.hypot(dx, dy) };
      });
      const kappa = P.pinch;
      const radiusAt = (a) => {
        let num = 0, den = 0;
        for (const dd of dirs) {
          const w = Math.exp(kappa * (Math.cos(a - dd.ang) - 1));
          num += w * dd.d; den += w;
        }
        return den > 0 ? num / den : Math.min(W, H) * 0.3;
      };
      const n = Math.round(P.layers);
      const hmax = Math.round(P.harmonics);
      ctx.globalCompositeOperation = "source-over";
      ctx.lineJoin = "round";
      const steps = 180;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1 || 1);
        const k = (1 - u * 0.82) * P.scale * 1.6;
        const col = C.at(u, 0, i);
        const pts = [];
        for (let s = 0; s < steps; s++) {
          const a = (s / steps) * TAU;
          let r = radiusAt(a) * k;
          for (let hh = 1; hh <= hmax; hh++) {
            r += r * P.amp * (0.4 / hh) *
                 Math.sin(a * (hh + 1) + t * P.drift * (0.6 + hh * 0.3) + i * 0.9 + hh * 2.1);
          }
          pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        ctx.beginPath();
        smoothPoly(ctx, pts, true);
        if (C.hollow > 0.5) {
          ctx.lineWidth = Math.max(1.5, W * 0.004);
          ctx.strokeStyle = rgba(col, 1);
          ctx.stroke();
        } else {
          ctx.fillStyle = rgba(col, 1);
          ctx.fill();
        }
      }
    },
  },

  /* ── SUNBURST · draggable focus ────────────────────────── */
  sunburst: {
    name: "sunburst",
    params: {
      innerR:    { label: "inner r",      min: 0,   max: 0.6, step: 0.01, def: 0.08 },
      varLen:    { label: "len var",      min: 0,   max: 1,   step: 0.01, def: 0.45 },
      twist:     { label: "twist",        min: -1,  max: 1,   step: 0.01, def: 0 },
      rays:      { label: "rays",         min: 8,   max: 120, step: 1,    def: 60,  sec: "lines" },
      coreHeat:  { label: "core heat",    min: 0,   max: 1,   step: 0.01, def: 0.5, sec: "lines" },
      stroke:    { label: "stroke width", min: 0.05,max: 1,   step: 0.01, def: 0.14, sec: "lines" },
      outerEdge: { label: "outer edge",   min: 0.2, max: 2,   step: 0.01, def: 0.9,  sec: "lines" },
      fx:        { label: "focus x",      min: 0,   max: 1,   step: 0.001,def: 0.5, hidden: true },
      fy:        { label: "focus y",      min: 0,   max: 1,   step: 0.001,def: 0.5, hidden: true },
    },
    gl: (P) => ({
      mode: 9, lines: P.rays, edge: P.outerEdge,
      base: 0.1, span: 0.5, flare: 1,
      warpB: P.twist, stroke: P.stroke, core: P.coreHeat,
      pa: [P.fx, P.fy, P.varLen, P.innerR],
    }),
    handles: (P) => [{ key: "focus", x: P.fx, y: P.fy }],
    setHandle: (P, key, x, y) => ({ fx: +x.toFixed(3), fy: +y.toFixed(3) }),
    draw(ctx, W, H, t, P, C) {
      const n = Math.round(P.rays);
      const cx = W * P.fx, cy = H * P.fy;
      const R = Math.hypot(W, H) * 0.62;
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (let i = 0; i < n; i++) {
        const u = i / n;
        const ang = u * TAU + t * 0.1 + Math.sin(t * 0.6 + i) * P.twist * 0.03;
        const rnd = h1(i * 7.13);
        const len = R * (1 - P.varLen * rnd) * (0.75 + 0.25 * pulse(t * 2.2 + rnd * 9));
        const col = C.at(rnd, 0, i);
        const r0 = P.innerR * R;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(cx + Math.cos(ang + P.twist * 0.35) * len, cy + Math.sin(ang + P.twist * 0.35) * len);
        ctx.lineWidth = P.stroke * W * 0.006;
        ctx.strokeStyle = rgba(col, (0.15 + 0.75 * C.env(rnd)));
        ctx.stroke();
      }
    },
  },
  /* ── LIQUID MARBLE · domain-warped ink bands (GPU only) ── */
  liquidMarble: {
    name: "liquid-marble",
    params: {
      scale:    { label: "scale",      min: 0.5, max: 8,  step: 0.05, def: 2.2 },
      warp:     { label: "warp",       min: 0,   max: 3,  step: 0.01, def: 1.2 },
      bands:    { label: "bands",      min: 0.5, max: 8,  step: 0.05, def: 2 },
      flow:     { label: "flow speed", min: 0,   max: 3,  step: 0.01, def: 0.6 },
      contrast: { label: "contrast",   min: 0,   max: 1,  step: 0.01, def: 0.35, sec: "lines" },
      shimmer:  { label: "shimmer",    min: 0,   max: 2,  step: 0.01, def: 0.8,  sec: "lines" },
    },
    gl: (P) => ({
      mode: 20, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      stroke: 0.2, core: 0.5,
      pa: [P.scale, P.warp, P.bands, P.flow],
      pb: [P.contrast, P.shimmer, 0, 0],
    }),
  },

  /* ── FLOW FIELD · turbulent silk streams (GPU only) ────── */
  flowField: {
    name: "flow-field",
    params: {
      scale:      { label: "scale",      min: 0.5, max: 8,   step: 0.05, def: 2.5 },
      angle:      { label: "angle",      min: -180,max: 180, step: 1,    def: 20 },
      turbulence: { label: "turbulence", min: 0,   max: 3,   step: 0.01, def: 0.9 },
      streams:    { label: "streams",    min: 0.2, max: 4,   step: 0.05, def: 1.7 },
      flow:       { label: "flow speed", min: 0,   max: 3,   step: 0.01, def: 0.7 },
      sharp:      { label: "sharpness",  min: 0.02,max: 0.5, step: 0.005,def: 0.3,  sec: "lines" },
      coreHeat:   { label: "core heat",  min: 0,   max: 1,   step: 0.01, def: 0.5,  sec: "lines" },
    },
    gl: (P) => ({
      mode: 21, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      warpA: P.angle * Math.PI / 180,
      stroke: 0.2, core: P.coreHeat,
      pa: [P.scale, P.turbulence, P.streams, P.flow],
      pb: [P.sharp, 0, 0, 0],
    }),
    handles: (P) => {
      const a = P.angle * Math.PI / 180;
      return [{ key: "dir", x: 0.5 + Math.cos(a) * 0.32, y: 0.5 + Math.sin(a) * 0.32 }];
    },
    setHandle: (P, key, x, y) => ({ angle: Math.round(Math.atan2(y - 0.5, x - 0.5) * 180 / Math.PI) }),
  },

  /* ── META BLOBS · liquid metaballs (GPU only) ──────────── */
  metaBlobs: {
    name: "meta-blobs",
    params: {
      blobs:     { label: "blobs",     min: 1,   max: 10,  step: 1,    def: 5 },
      size:      { label: "size",      min: 0.05,max: 0.5, step: 0.005,def: 0.2 },
      threshold: { label: "threshold", min: 0.5, max: 4,   step: 0.05, def: 1.4 },
      speed:     { label: "speed",     min: 0,   max: 3,   step: 0.01, def: 1 },
      soft:      { label: "softness",  min: 0.02,max: 1.5, step: 0.01, def: 0.4, sec: "lines" },
      coreHeat:  { label: "rim light", min: 0,   max: 1,   step: 0.01, def: 0.5, sec: "lines" },
    },
    gl: (P) => ({
      mode: 22, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      stroke: 0.2, core: P.coreHeat,
      pa: [P.blobs, P.size, P.threshold, P.speed],
      pb: [P.soft, 0, 0, 0],
    }),
  },

  /* ── LAVA · lava-lamp, gooey rising blobs (GPU only) ───── */
  lava: {
    name: "lava",
    params: {
      blobs:    { label: "blobs",      min: 2,   max: 8,   step: 1,    def: 6 },
      size:     { label: "size",       min: 0.05,max: 0.5, step: 0.005,def: 0.24 },
      pool:     { label: "pool",       min: 0,   max: 2,   step: 0.01, def: 0.8 },
      rise:     { label: "rise speed", min: 0,   max: 2,   step: 0.01, def: 0.9 },
      soft:     { label: "softness",   min: 0.03,max: 1,   step: 0.01, def: 0.22, sec: "lines" },
      squash:   { label: "squash",     min: 0.5, max: 2,   step: 0.01, def: 1.3,  sec: "lines" },
      coreHeat: { label: "heat",       min: 0,   max: 1,   step: 0.01, def: 0.6,  sec: "lines" },
    },
    gl: (P) => ({
      mode: 24, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      stroke: 0.2, core: P.coreHeat,
      pa: [P.blobs, P.size, P.pool, P.rise],
      pb: [P.soft, P.squash, 0, 0],
    }),
  },

  /* ── TASTE OF NOISE · organic raymarched blobs (GPU only)
     adapted from "Taste of Noise 7" by Leon Denise · shadertoy NddSWs ── */
  tasteOfNoise: {
    name: "taste-of-noise",
    params: {
      orbitX:  { label: "orbit x",   min: 0,   max: 1,  step: 0.001, def: 0.08 },
      orbitY:  { label: "orbit y",   min: 0,   max: 1,  step: 0.001, def: 0.03 },
      zoom:    { label: "zoom",      min: 0.4, max: 3,  step: 0.01,  def: 1 },
      speed:   { label: "speed",     min: 0,   max: 3,  step: 0.01,  def: 1 },
      grid:    { label: "grid",      min: 2,   max: 10, step: 0.05,  def: 5 },
      wave:    { label: "wave",      min: 0,   max: 1.2,step: 0.01,  def: 0.5 },
      coreHeat:{ label: "tint",      min: 0,   max: 1,  step: 0.01,  def: 0.6, sec: "lines" },
    },
    gl: (P) => ({
      mode: 25, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      stroke: 0.2, core: P.coreHeat,
      pa: [P.orbitX, P.orbitY, P.zoom, P.speed],
      pb: [P.grid, P.wave, 0, 0],
    }),
    handles: (P) => [{ key: "orbit", x: P.orbitX, y: P.orbitY }],
    setHandle: (P, key, x, y) => ({ orbitX: +x.toFixed(3), orbitY: +y.toFixed(3) }),
  },

  /* ── PRETTY HIP · rippling tile wave (GPU only)
     adapted from "Pretty Hip" by Hadyn · shadertoy XsBfRW ── */
  prettyHip: {
    name: "pretty-hip",
    params: {
      tiles:  { label: "tiles",       min: 3,   max: 24,  step: 0.1,  def: 10 },
      angle:  { label: "angle",       min: -90, max: 90,  step: 1,    def: 45 },
      wave:   { label: "wave scale",  min: 0,   max: 1.5, step: 0.01, def: 0.5 },
      pulse:  { label: "pulse speed", min: 0,   max: 3,   step: 0.01, def: 1 },
      depth:  { label: "depth shade", min: 0,   max: 2,   step: 0.01, def: 1 },
      soft:   { label: "softness",    min: 0.005,max: 0.3,step: 0.005,def: 0.05, sec: "lines" },
    },
    gl: (P) => ({
      mode: 26, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      warpA: P.angle * Math.PI / 180, stroke: 0.2, core: 0.5,
      pa: [P.tiles, P.wave, P.depth, P.pulse],
      pb: [P.soft, 0, 0, 0],
    }),
  },

  /* ── CYANA · vortex nebula glow (GPU only)
     adapted from "Cyana" by muragustina · shadertoy 7cVXzK ── */
  cyana: {
    name: "cyana",
    params: {
      zoom:   { label: "zoom",    min: 0.4, max: 2.5, step: 0.01, def: 1 },
      swirl:  { label: "swirl",   min: 0,   max: 2,   step: 0.01, def: 1 },
      speed:  { label: "speed",   min: 0,   max: 3,   step: 0.01, def: 1 },
      breath: { label: "breath",  min: 0,   max: 1.2, step: 0.01, def: 0.9 },
      streak: { label: "streak",  min: 1,   max: 8,   step: 0.05, def: 4 },
      detail: { label: "detail",  min: 0.2, max: 1,   step: 0.01, def: 1,  sec: "lines" },
      dust:   { label: "dust",    min: 0,   max: 2,   step: 0.01, def: 1,  sec: "lines" },
    },
    gl: (P) => ({
      mode: 27, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      stroke: 0.2, core: 0.5,
      pa: [P.zoom, P.swirl, P.detail, P.speed],
      pb: [P.streak, P.breath, P.dust, 0],
    }),
  },

  /* ── URCHIN · undulating polar tubes (GPU only)
     adapted from "Undulating Urchin" by ChunderFPV · shadertoy 332XWd ── */
  urchin: {
    name: "urchin",
    params: {
      speed:  { label: "speed",     min: 0,   max: 3,  step: 0.01,  def: 1 },
      zoom:   { label: "zoom",      min: 0.4, max: 2,  step: 0.01,  def: 1 },
      amp:    { label: "amplitude", min: 0,   max: 20, step: 0.1,   def: 9 },
      ox:     { label: "centre x",  min: 0,   max: 1,  step: 0.001, def: 0.5,  hidden: true },
      oy:     { label: "centre y",  min: 0,   max: 1,  step: 0.001, def: 0.08, hidden: true },
    },
    gl: (P) => ({
      mode: 28, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      stroke: 0.2, core: 0.5,
      pa: [P.ox, P.oy, P.speed, P.zoom],
      pb: [P.amp, 0, 0, 0],
    }),
    handles: (P) => [{ key: "centre", x: P.ox, y: P.oy }],
    setHandle: (P, key, x, y) => ({ ox: +x.toFixed(3), oy: +y.toFixed(3) }),
  },

  /* ── WEIRDNESS · reflective superquadric on a glow stage (GPU only)
     adapted from "Saturday weirdness" by mrange (CC0) · shadertoy 43jXWt ── */
  weirdness: {
    name: "weirdness",
    params: {
      speed:  { label: "spin speed", min: 0,   max: 3,   step: 0.01, def: 1 },
      dist:   { label: "camera",     min: 0.5, max: 2,   step: 0.01, def: 1 },
      size:   { label: "ball size",  min: 0.5, max: 1.6, step: 0.01, def: 1 },
      swirlV: { label: "swirl speed",min: 0,   max: 3,   step: 0.01, def: 1 },
      swirl:  { label: "swirl",      min: 0,   max: 1.5, step: 0.01, def: 0.5, sec: "lines" },
    },
    gl: (P) => ({
      mode: 29, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      stroke: 0.2, core: 0.5,
      pa: [0, 0, P.speed, P.dist],
      pb: [0, P.size, P.swirlV, P.swirl],
    }),
  },

  /* ── STORMSEYE · hurricane-eye vortex (GPU only)
     adapted from "Stormseye" by muragustina · shadertoy ffVXRd ── */
  stormseye: {
    name: "stormseye",
    params: {
      zoom:   { label: "zoom",     min: 0.3,  max: 2.5, step: 0.01,  def: 1 },
      vortex: { label: "vortex",   min: 0,    max: 2,   step: 0.01,  def: 1 },
      speed:  { label: "speed",    min: 0,    max: 3,   step: 0.01,  def: 1 },
      breath: { label: "breath",   min: 0,    max: 1,   step: 0.01,  def: 0.5 },
      eye:    { label: "eye dist", min: 0,    max: 0.8, step: 0.005, def: 0.3 },
      streak: { label: "streak",   min: 0.005,max: 0.15,step: 0.001, def: 0.02, sec: "lines" },
      detail: { label: "detail",   min: 0.2,  max: 1,   step: 0.01,  def: 1,    sec: "lines" },
      dust:   { label: "dust",     min: 0,    max: 2,   step: 0.01,  def: 1,    sec: "lines" },
    },
    gl: (P) => ({
      mode: 30, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      stroke: 0.2, core: 0.5,
      pa: [P.zoom, P.vortex, P.detail, P.speed],
      pb: [P.streak, P.breath, P.dust, P.eye],
    }),
  },

  /* ── WATERFALL · droplet streaks on a cylinder (GPU only)
     adapted from "Smaller Waterfall" by mrange (CC0) · shadertoy NXjGRy ── */
  waterfall: {
    name: "waterfall",
    params: {
      zoom:    { label: "zoom",       min: 0.3, max: 2.5, step: 0.01, def: 1 },
      bright:  { label: "brightness", min: 0.2, max: 3,   step: 0.01, def: 1 },
      speed:   { label: "speed",      min: 0,   max: 3,   step: 0.01, def: 1 },
      colW:    { label: "column width",min: 0.3,max: 3,   step: 0.01, def: 1, sec: "lines" },
      dropSz:  { label: "drop size",  min: 0.2, max: 4,   step: 0.01, def: 1, sec: "lines" },
    },
    gl: (P) => ({
      mode: 31, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      stroke: 0.2, core: 0.5,
      pa: [P.zoom, P.bright, 0, P.speed],
      pb: [P.colW, P.dropSz, 0, 0],
    }),
  },

  /* ── NEON RING · pulsing ring equalizer (GPU only)
     adapted from "Fork Neon Seatu xinchenl 319" by xinchenl · shadertoy 7fVXz3 ── */
  neonRing: {
    name: "neon-ring",
    params: {
      zoom:     { label: "zoom",        min: 0.3, max: 2.5, step: 0.01, def: 1 },
      bars:     { label: "bars",        min: 0.3, max: 3,   step: 0.01, def: 1 },
      amp:      { label: "spectrum amp",min: 0,   max: 2,   step: 0.01, def: 1 },
      colSpeed: { label: "colour speed",min: 0,   max: 3,   step: 0.01, def: 1 },
      thick:    { label: "thickness",   min: 0.005,max: 0.2,step: 0.005,def: 0.04, sec: "lines" },
      trail:    { label: "trail",       min: 0,   max: 2,   step: 0.01, def: 1,    sec: "lines" },
    },
    gl: (P) => ({
      mode: 32, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      stroke: 0.2, core: 0.5,
      pa: [P.zoom, P.bars, P.amp, P.colSpeed],
      pb: [P.thick, P.trail, 0, 0],
    }),
  },

  /* ── SAKURA · psychedelic petal rings (GPU only)
     adapted from "PsychedelicSakura" by Reva · shadertoy wlGXRD ── */
  sakura: {
    name: "sakura",
    params: {
      zoom:    { label: "zoom",         min: 0.3, max: 2.5, step: 0.01, def: 1 },
      petals:  { label: "petals",       min: 1,   max: 8,   step: 0.5,  def: 2.5 },
      bloom:   { label: "inner bloom",  min: 0,   max: 2,   step: 0.01, def: 1 },
      breathe: { label: "breathe speed",min: 0,   max: 3,   step: 0.01, def: 1 },
    },
    gl: (P) => ({
      mode: 33, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      stroke: 0.2, core: 0.5,
      pa: [P.zoom, P.petals, P.bloom, P.breathe],
    }),
  },

  /* ── GLOSSY · silk trig-feedback gradients (GPU only)
     adapted from "Glossy Gradients" by Peace · shadertoy lX2GDR ── */
  glossy: {
    name: "glossy",
    params: {
      scale:  { label: "scale",      min: 0.3, max: 3,  step: 0.01, def: 1 },
      iters:  { label: "iterations", min: 2,   max: 12, step: 1,    def: 8 },
      tint:   { label: "tint mix",   min: 0,   max: 2,  step: 0.01, def: 1 },
      speed:  { label: "speed",      min: 0,   max: 3,  step: 0.01, def: 1 },
      gloss:  { label: "gloss",      min: 0,   max: 1,  step: 0.01, def: 0.35, sec: "lines" },
    },
    gl: (P) => ({
      mode: 34, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      stroke: 0.2, core: 0.5,
      pa: [P.scale, P.iters, P.tint, P.speed],
      pb: [P.gloss, 0, 0, 0],
    }),
  },

  /* ── ETHER · twisted sine-field volume (GPU only)
     adapted from "Ether" by nimitz · shadertoy MsjSW3
     ⚠ CC BY-NC-SA 3.0 — attribution required, NON-COMMERCIAL ── */
  ether: {
    name: "ether",
    params: {
      zoom:    { label: "zoom",      min: 0.3, max: 2.5, step: 0.01, def: 1 },
      density: { label: "density",   min: 0.4, max: 2,   step: 0.01, def: 1 },
      bright:  { label: "brightness",min: 0.2, max: 3,   step: 0.01, def: 1 },
      speed:   { label: "speed",     min: 0,   max: 3,   step: 0.01, def: 1 },
    },
    gl: (P) => ({
      mode: 35, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      stroke: 0.2, core: 0.5,
      pa: [P.zoom, P.density, P.bright, P.speed],
    }),
  },

  /* ── IN SPACE · banded planet with glowing lines (GPU only)
     compact adaptation of "in space" by Danil / arugl (CC0) · shadertoy sldGDf ── */
  inSpace: {
    name: "in-space",
    params: {
      zoom:    { label: "zoom",       min: 0.3,  max: 2.5, step: 0.01,  def: 1 },
      size:    { label: "planet size",min: 0.2,  max: 0.95,step: 0.005, def: 0.55 },
      bands:   { label: "bands",      min: 4,    max: 40,  step: 0.5,   def: 14 },
      speed:   { label: "speed",      min: 0,    max: 3,   step: 0.01,  def: 1 },
      tilt:    { label: "tilt",       min: -1,   max: 1,   step: 0.01,  def: 0.35 },
      turb:    { label: "turbulence", min: 0,    max: 2,   step: 0.01,  def: 0.8,  sec: "lines" },
      atmo:    { label: "atmosphere", min: 0.03, max: 0.5, step: 0.005, def: 0.15, sec: "lines" },
    },
    gl: (P) => ({
      mode: 36, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      stroke: 0.2, core: 0.5,
      pa: [P.zoom, P.size, P.bands, P.speed],
      pb: [P.atmo, P.tilt, P.turb, 0],
    }),
  },

  /* ── RELIEF WAVES · embossed 3D ridge field (GPU only) ── */
  reliefWaves: {
    name: "relief-waves",
    params: {
      zoom:    { label: "zoom",           min: 0.3, max: 3,   step: 0.01, def: 1 },
      scale:   { label: "wave scale",     min: 0.2, max: 4,   step: 0.01, def: 0.65 },
      ripples: { label: "ripples",        min: 2,   max: 20,  step: 0.1,  def: 9 },
      warp:    { label: "warp",           min: 0,   max: 2,   step: 0.01, def: 0.55 },
      lightA:  { label: "light angle",    min: -180,max: 180, step: 1,    def: 35 },
      speed:   { label: "speed",          min: 0,   max: 3,   step: 0.01, def: 0.5 },
      crest:   { label: "crest sharp",    min: 0.3, max: 4,   step: 0.01, def: 1.6, sec: "lines" },
      depth:   { label: "depth",          min: 0.1, max: 3,   step: 0.01, def: 1,   sec: "lines" },
      shine:   { label: "shine",          min: 0,   max: 1,   step: 0.01, def: 0.5, sec: "lines" },
      tint:    { label: "tint",           min: 0,   max: 1,   step: 0.01, def: 0.12,sec: "lines" },
      wash:    { label: "colour wash",    min: 0,   max: 1,   step: 0.01, def: 0,   sec: "lines" },
    },
    gl: (P) => ({
      mode: 37, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      warpA: P.lightA * Math.PI / 180,
      stroke: P.depth, core: P.shine,
      pa: [P.zoom, P.scale, P.ripples, P.speed],
      pb: [P.crest, P.warp, P.tint, P.wash],
    }),
    handles: (P) => {
      const a = P.lightA * Math.PI / 180;
      return [{ key: "light", x: 0.5 + Math.cos(a) * 0.32, y: 0.5 - Math.sin(a) * 0.32 }];
    },
    setHandle: (P, key, x, y) => ({ lightA: Math.round(Math.atan2(0.5 - y, x - 0.5) * 180 / Math.PI) }),
  },

  /* ── QUARTERS · bauhaus quarter-circle tiles (GPU only) ── */
  quarters: {
    name: "quarters",
    params: {
      cells:    { label: "cells",       min: 4,   max: 24, step: 1,    def: 9 },
      reshuffle:{ label: "reshuffle / s",min: 0,  max: 2,  step: 0.05, def: 0.3 },
      fill:     { label: "fill chance", min: 0.3, max: 1,  step: 0.01, def: 0.92 },
      variety:  { label: "variety",     min: 0,   max: 1,  step: 0.01, def: 0.7 },
      stagger:  { label: "stagger",     min: 0,   max: 1,  step: 0.01, def: 0.6, sec: "lines" },
    },
    gl: (P) => ({
      mode: 38, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      stroke: 0.2, core: 0.5,
      pa: [P.cells, P.reshuffle, P.fill, P.variety],
      pb: [P.stagger, 0, 0, 0],
    }),
  },

  /* ── TUBES · glossy 3D tubes and spheres (GPU only) ───── */
  tubes: {
    name: "tubes",
    params: {
      zoom:      { label: "zoom",      min: 0.3, max: 2,   step: 0.01, def: 0.7 },
      spheres:   { label: "spheres",   min: 0,   max: 7,   step: 1,    def: 5 },
      speed:     { label: "speed",     min: 0,   max: 3,   step: 0.01, def: 1 },
      thickness: { label: "thickness", min: 0.1, max: 0.7, step: 0.005,def: 0.32 },
      blend:     { label: "blend",     min: 0.05,max: 0.8, step: 0.005,def: 0.3 },
      ballSize:  { label: "ball size", min: 0.3, max: 2,   step: 0.01, def: 1,   sec: "lines" },
      gloss:     { label: "gloss",     min: 0,   max: 1,   step: 0.01, def: 0.7, sec: "lines" },
    },
    gl: (P) => ({
      mode: 39, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      stroke: 0.2, core: P.gloss,
      pa: [P.zoom, 0, P.spheres, P.speed],
      pb: [P.thickness, P.blend, P.ballSize, 0],
    }),
  },

  /* ── BLOOM PETALS · layered swirl folds (GPU only) ────── */
  bloomPetals: {
    name: "bloom-petals",
    params: {
      zoom:   { label: "zoom",       min: 0.3,  max: 2.5, step: 0.01,  def: 0.8 },
      petals: { label: "petals",     min: 3,    max: 16,  step: 1,     def: 7 },
      wave:   { label: "edge wave",  min: 0,    max: 2,   step: 0.01,  def: 0.8 },
      speed:  { label: "speed",      min: 0,    max: 3,   step: 0.01,  def: 1 },
      swirl:  { label: "swirl",      min: 0.3,  max: 4,   step: 0.01,  def: 1.3 },
      turb:   { label: "turbulence", min: 0,    max: 1.5, step: 0.01,  def: 0.35 },
      thick:  { label: "sheet fill", min: 0.05, max: 0.7, step: 0.005, def: 0.34, sec: "lines" },
      round:  { label: "edge round", min: 0.02, max: 0.3, step: 0.005, def: 0.16, sec: "lines" },
      gloss:  { label: "gloss",      min: 0,    max: 1,   step: 0.01,  def: 0.25, sec: "lines" },
      cx:     { label: "centre x",   min: 0,    max: 1,   step: 0.001, def: 0.6,  hidden: true },
      cy:     { label: "centre y",   min: 0,    max: 1,   step: 0.001, def: 0.5,  hidden: true },
    },
    gl: (P) => ({
      mode: 40, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      warpA: P.wave, warpB: P.turb, stroke: P.round, core: P.gloss,
      pa: [P.zoom, P.petals, P.cx, P.speed],
      pb: [P.swirl, 0, P.thick, P.cy],
    }),
    handles: (P) => [{ key: "centre", x: P.cx, y: P.cy }],
    setHandle: (P, key, x, y) => ({ cx: +x.toFixed(3), cy: +y.toFixed(3) }),
  },

  /* ── HEX GRID · dual-lit beveled hexagons (GPU only)
     from the Linux Mint wallpaper set by dr-leonard-m ── */
  hexGrid: {
    name: "hex-grid",
    params: {
      cells:   { label: "cells",        min: 2,    max: 16,  step: 0.1,  def: 6.5 },
      spread:  { label: "light spread", min: 0.2,  max: 1.4, step: 0.01, def: 0.8 },
      flicker: { label: "flicker",      min: 0,    max: 1,   step: 0.01, def: 0.5 },
      speed:   { label: "speed",        min: 0,    max: 3,   step: 0.01, def: 1 },
      edgeW:   { label: "edge width",   min: 0.008,max: 0.15,step: 0.002,def: 0.045, sec: "lines" },
      bevel:   { label: "bevel",        min: 0,    max: 1,   step: 0.01, def: 0.5,   sec: "lines" },
      glow:    { label: "edge glow",    min: 0,    max: 1,   step: 0.01, def: 0.7,   sec: "lines" },
      rays:    { label: "rays",         min: 0,    max: 1,   step: 0.01, def: 0.4,   sec: "lines" },
    },
    gl: (P) => ({
      mode: 41, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      stroke: 0.2, core: P.glow,
      pa: [P.cells, P.spread, P.flicker, P.speed],
      pb: [P.edgeW, P.bevel, 0, P.rays],
    }),
  },

  /* ── CLOTH STACK · draped sheets with air gaps (GPU only) ── */
  clothStack: {
    name: "cloth-stack",
    params: {
      zoom:   { label: "zoom",       min: 0.3,  max: 2.5, step: 0.01,  def: 1 },
      wave:   { label: "wave",       min: 0,    max: 2,   step: 0.01,  def: 1 },
      waveF:  { label: "wave freq",  min: 0.3,  max: 3,   step: 0.01,  def: 1 },
      speed:  { label: "speed",      min: 0,    max: 3,   step: 0.01,  def: 1 },
      cloth:  { label: "cloth bend", min: 0,    max: 1.5, step: 0.01,  def: 0.6 },
      gap:    { label: "gap",        min: 0.25, max: 1.2, step: 0.005, def: 0.55, sec: "lines" },
      thick:  { label: "thickness",  min: 0.01, max: 0.2, step: 0.005, def: 0.06, sec: "lines" },
      round:  { label: "edge round", min: 0.02, max: 0.25,step: 0.005, def: 0.12, sec: "lines" },
      gloss:  { label: "gloss",      min: 0,    max: 1,   step: 0.01,  def: 0.3,  sec: "lines" },
    },
    gl: (P) => ({
      mode: 42, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      warpA: P.wave, warpB: P.cloth, stroke: P.round, core: P.gloss,
      pa: [P.zoom, 0, P.waveF, P.speed],
      pb: [0, P.gap, P.thick, 0],
    }),
  },

  /* ── AURORA · flowing light curtains (GPU only) ────────── */
  aurora: {
    name: "aurora",
    params: {
      curtains: { label: "curtains",  min: 1,   max: 6,   step: 1,    def: 3 },
      spread:   { label: "spread",    min: 0,   max: 1.5, step: 0.01, def: 0.7 },
      waviness: { label: "waviness",  min: 0.5, max: 6,   step: 0.05, def: 2 },
      swayAmt:  { label: "sway",      min: 0,   max: 1,   step: 0.01, def: 0.35 },
      width:    { label: "width",     min: 0.02,max: 0.4, step: 0.005,def: 0.12, sec: "lines" },
    },
    gl: (P) => ({
      mode: 23, lines: 1, edge: 1, base: 0.1, span: 0.5, flare: 1,
      warpB: P.swayAmt, stroke: 0.2, core: 0.5,
      pa: [P.curtains, P.spread, P.waviness, 0],
      pb: [P.width, 0, 0, 0],
    }),
  },
};

/* ── theme presets · exact palettes from Light Stroke Rail ── */
const THEMES = [
  { name: "ember",     bg: "#050508", stops: ["#ff4a00", "#8a63ff", "#214aff"] },
  { name: "silk",      bg: "#0a0612", stops: ["#ff5e3a", "#ffd24a", "#7affc2", "#4a9bff", "#c86bff"] },
  { name: "projector", bg: "#0e1118", stops: ["#f6ecd8", "#7fb0ff", "#dfe9ff"] },
  { name: "horizon",   bg: "#0a0714", stops: ["#ff8ad2", "#ffc76a", "#7fb0ff", "#2a4fd0"] },
  { name: "arcs",      bg: "#060a18", stops: ["#2a6bff", "#9fc4ff", "#ffd7ec", "#0b2ea8"] },
  { name: "shoonyah",  bg: "#04120d", stops: ["#123a63", "#27c98a", "#eef6c8", "#0d5c4a"] },
  { name: "warp",      bg: "#120618", stops: ["#ff9a3d", "#ff5ad2", "#8a5cff", "#ffe9b0"] },
  { name: "cube",      bg: "#070b16", stops: ["#4a9bff", "#c86bff", "#ffd24a"] },
  { name: "luma",      bg: "#140b02", stops: ["#ff8c1a", "#ffc21a", "#ffdd66", "#ff9e2e"] },
  { name: "bloom",     bg: "#10041a", stops: ["#b44dff", "#ff5ad2", "#7a5cff", "#ff8ad2"] },
  { name: "folds",     bg: "#7e93a6", stops: ["#f5920b", "#ffc233", "#8fd4e8", "#2596be", "#12354f"] },
];

export { PATTERNS, THEMES, gradAt, rgba };
