import { PATTERNS, gradAt } from './patterns.js'
import { renderGLPattern } from './gl.js'

/* ── colour helpers ── */
export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]
}

function h1(n) {
  n = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return n - Math.floor(n)
}
function smooth(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x) }

/* ── global (non-pattern) settings defaults ── */
export const GLOBAL_DEFAULTS = {
  motion: 'solid',                                                      // trails | solid | pulse
  grad:   { runSpeed: 0.72, runStretch: 0.5, runSpread: 0.137, runJitter: 1, trailHold: 0 },
  timing: { period: 3.6, lifetime: 0.92, rise: 0.022, fallStart: 0.8, topLag: 0.056 },
  look:   { angle: 0, sway: 0, gain: 1, blur: 0.28, glow: 0.22, blowout: 0, grain: 0.04, hollow: 0 },
}

export function withGlobalDefaults(cfg) {
  return {
    ...cfg,
    motion: cfg.motion ?? GLOBAL_DEFAULTS.motion,
    grad:   { ...GLOBAL_DEFAULTS.grad,   ...(cfg.grad || {}) },
    timing: { ...GLOBAL_DEFAULTS.timing, ...(cfg.timing || {}) },
    look:   { ...GLOBAL_DEFAULTS.look,   ...(cfg.look || {}) },
  }
}

/* ── param helpers ── */
export function defaultsFor(templateId) {
  const out = {}
  const defs = PATTERNS[templateId].params
  for (const k in defs) out[k] = defs[k].def
  return out
}

export function randomParamsFor(templateId) {
  const out = {}
  const defs = PATTERNS[templateId].params
  for (const k in defs) {
    const d = defs[k]
    if (d.hidden) { out[k] = d.def; continue }          // keep handle points stable
    let v = d.min + Math.random() * (d.max - d.min)
    v = Math.round(v / d.step) * d.step
    out[k] = +v.toFixed(4)
  }
  return out
}

/* ── grain tile (built once) ── */
let grainTile = null
function getGrainTile() {
  if (grainTile) return grainTile
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const img = g.createImageData(128, 128)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 120 + Math.random() * 90
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  g.putImageData(img, 0, 0)
  grainTile = c
  return grainTile
}

/* ── offscreen buffer (reused) ── */
let buf = null
function getBuffer(W, H) {
  if (!buf || buf.width !== W || buf.height !== H) {
    buf = document.createElement('canvas')
    buf.width = W
    buf.height = H
  }
  return buf
}

/* ── frame renderer (shared by stage, thumbs, exports) ──
   cfg: { templateId, params, stops, bg, speed, motion, grad, timing, look } */
export function renderFrame(ctx, W, H, t, cfg, opts = {}) {
  const full = withGlobalDefaults(cfg)
  const { grad: G, timing: T, look: L } = full
  const pat = PATTERNS[full.templateId]
  if (!pat) return

  const tt = t * (full.speed ?? 1)
  const phase = ((tt / T.period) % 1 + 1) % 1
  const stopsRgb = full.stops.map(hexToRgb)
  const motion = full.motion

  /* rail-family patterns render on the GPU — per-pixel SDF glow */
  if (pat.gl) {
    stopsRgb.bgRgb = hexToRgb(full.bg)
    const glc = renderGLPattern(W, H, tt, full, stopsRgb, pat.gl(full.params))
    if (glc) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.drawImage(glc, 0, 0, W, H)
      return
    }
    /* no WebGL → fall through to the canvas approximation */
  }
  if (!pat.draw) {
    ctx.fillStyle = full.bg
    ctx.fillRect(0, 0, W, H)
    return
  }

  /* colour + envelope helpers handed to every pattern */
  const C = {
    stops: stopsRgb,
    bg: full.bg,
    hollow: L.hollow,
    /* gradient sample; u across, along = position along the stroke, idx = element seed */
    at(u, along = 0, idx = 0) {
      if (G.runSpeed <= 0.01) return gradAt(stopsRgb, u)
      let pos = u * (G.runSpread / 0.6)
              + along * G.runStretch
              + h1(idx * 7.31) * G.runJitter
              - phase * G.runSpeed
      pos = ((pos % 1) + 1) % 1
      pos = pos < 0.5 ? pos * 2 : 2 - pos * 2          // mirrored → seamless loop
      return gradAt(stopsRgb, pos)
    },
    /* brightness envelope 0..1; off = per-element offset (0..1) */
    env(off = 0) {
      if (motion === 'solid') return 1
      const o = motion === 'pulse' ? 0 : off * 0.2
      const ph = ((phase - o) % 1 + 1) % 1
      if (ph > T.lifetime) return 0.05
      const p = ph / T.lifetime
      const up = smooth(Math.min(1, p / Math.max(0.001, T.rise)))
      const down = p > T.fallStart ? 1 - smooth((p - T.fallStart) / Math.max(0.001, 1 - T.fallStart)) : 1
      return 0.05 + 0.95 * up * down
    },
  }

  /* pattern → offscreen (so look FX can composite) */
  const useFx = !opts.noFx
  const off = useFx ? getBuffer(W, H) : null
  const pctx = useFx ? off.getContext('2d') : ctx

  pctx.save()
  pctx.setTransform(1, 0, 0, 1, 0, 0)
  pctx.globalCompositeOperation = 'source-over'
  pctx.globalAlpha = 1
  if (useFx) pctx.clearRect(0, 0, W, H)
  pctx.fillStyle = full.bg
  pctx.fillRect(0, 0, W, H)

  const ang = (L.angle + Math.sin(tt * 0.9) * L.sway * 250) * Math.PI / 180
  if (ang !== 0) {
    pctx.translate(W / 2, H / 2)
    pctx.rotate(ang)
    const s = 1 + Math.abs(Math.sin(ang)) * 0.5      // overscan so corners stay covered
    pctx.scale(s, s)
    pctx.translate(-W / 2, -H / 2)
  }
  pat.draw(pctx, W, H, tt, full.params, C)
  pctx.restore()

  if (!useFx) return

  /* composite with look FX */
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.filter = Math.abs(L.gain - 1) > 0.01 ? `brightness(${L.gain})` : 'none'
  ctx.drawImage(off, 0, 0)
  ctx.filter = 'none'

  if (L.glow > 0.01) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = Math.min(1, L.glow)
    ctx.filter = `blur(${Math.max(1, L.blur * W * 0.02)}px) brightness(${1 + L.blowout * 1.5})`
    ctx.drawImage(off, 0, 0)
    ctx.filter = 'none'
    ctx.globalAlpha = 1
  }

  if (L.grain > 0.002) {
    ctx.globalCompositeOperation = 'overlay'
    ctx.globalAlpha = Math.min(1, L.grain * 3)
    const tile = getGrainTile()
    for (let y = 0; y < H; y += 128)
      for (let x = 0; x < W; x += 128) ctx.drawImage(tile, x, y)
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

export function renderStill(cfg, w, h, t = 3) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  renderFrame(c.getContext('2d'), w, h, t, cfg)
  return c
}

/* ── share encoding ── */
export function encodeCfg(cfg) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(cfg))))
}
export function decodeCfg(str) {
  try {
    const cfg = JSON.parse(decodeURIComponent(escape(atob(str))))
    if (!cfg || !PATTERNS[cfg.templateId]) return null
    return cfg
  } catch {
    return null
  }
}

/* ── downloads ── */
export function download(blob, name) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

/* ── webm capture ── */
export function recordWebm(canvas, seconds, onDone, onFail) {
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m))
  if (!mime) { onFail?.('Recording not supported in this browser'); return null }
  const stream = canvas.captureStream(60)
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 })
  const chunks = []
  rec.ondataavailable = e => e.data.size && chunks.push(e.data)
  rec.onstop = () => {
    stream.getTracks().forEach(tr => tr.stop())
    onDone(new Blob(chunks, { type: 'video/webm' }))
  }
  rec.start()
  setTimeout(() => rec.state !== 'inactive' && rec.stop(), seconds * 1000)
  return rec
}
