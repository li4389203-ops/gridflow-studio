import { useEffect, useRef, useState } from 'react'
import { renderFrame } from '../engine.js'
import { PATTERNS } from '../patterns.js'
import Overlay from './Overlay.jsx'

function Handles({ templateId, params, onParams }) {
  const pat = PATTERNS[templateId]
  const dragRef = useRef(null)
  if (!pat.handles) return null
  const pts = pat.handles(params)

  const onPointerDown = (key) => (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { key, box: e.currentTarget.parentElement.getBoundingClientRect() }
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d || !(e.buttons & 1)) return
    const x = Math.min(1, Math.max(0, (e.clientX - d.box.left) / d.box.width))
    const y = Math.min(1, Math.max(0, (e.clientY - d.box.top) / d.box.height))
    onParams(pat.setHandle(params, d.key, x, y))
  }
  const onPointerUp = () => { dragRef.current = null }

  return (
    <>
      {pts.map(p => (
        <div
          key={p.key}
          className="handle"
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          onPointerDown={onPointerDown(p.key)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          title={`drag · ${p.key}`}
        />
      ))}
    </>
  )
}

export default function Stage({
  lang, t,
  cfg, playing, onTogglePlay,
  aspect, context, uiOn,
  onContext, onAspect, onUi,
  canvasRef, timeRef,
  templateId, params, onParams,
}) {
  const stageRef = useRef(null)
  const cfgRef = useRef(cfg)
  const playRef = useRef(playing)
  const [box, setBox] = useState({ w: 640, h: 640 })

  cfgRef.current = cfg
  playRef.current = playing

  useEffect(() => {
    const el = stageRef.current
    const ro = new ResizeObserver(() => {
      const pad = 28
      const aw = el.clientWidth - pad * 2
      const ah = el.clientHeight - pad * 2
      let w = aw, h = w / aspect
      if (h > ah) { h = ah; w = h * aspect }
      setBox({ w: Math.max(80, w), h: Math.max(80, h) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [aspect])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf, last = performance.now()
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (playRef.current) timeRef.current += dt
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const W = Math.round(canvas.clientWidth * dpr)
      const H = Math.round(canvas.clientHeight * dpr)
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W
        canvas.height = H
      }
      if (W > 0 && H > 0) renderFrame(ctx, W, H, timeRef.current, cfgRef.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [canvasRef, timeRef])

  return (
    <section className="stage-col">
      <div className="stage" ref={stageRef}>
        <div className="artboard" style={{ width: box.w, height: box.h }}>
          <canvas ref={canvasRef} />
          <Overlay lang={lang} context={context} uiOn={uiOn} stops={cfg.stops} bg={cfg.bg} canvasRef={canvasRef} />
          <Handles templateId={templateId} params={params} onParams={onParams} />
        </div>
        <button className="play-toggle" onClick={onTogglePlay} title="pause / play">
          {playing ? '❚❚' : '▶'}
        </button>
      </div>

      <div className="stage-bar">
        <div className="sb-card">
          <label>{t('pattern')}</label>
          <select value={context} onChange={e => onContext(e.target.value)}>
            <option value="reel">{t('reel')}</option>
            <option value="vision">{t('vision')}</option>
            <option value="hero">{t('hero')}</option>
            <option value="ask">{t('ask')}</option>
            <option value="poster">{t('poster')}</option>
            <option value="deck">{t('deck')}</option>
            <option value="off">{t('off')}</option>
          </select>

          <label>{t('frame')}</label>
          <select value={String(aspect)} onChange={e => onAspect(+e.target.value)}>
            <option value="1.7778">16 : 9</option>
            <option value="1">1 : 1</option>
            <option value="0.8">4 : 5</option>
          </select>

          <label style={{ marginLeft: 6 }}>{t('ui')}</label>
          <button
            type="button"
            className={`sw ${uiOn ? 'on' : ''}`}
            role="switch"
            aria-checked={uiOn}
            aria-label={t('ui')}
            onClick={() => onUi(!uiOn)}
          ><span /></button>
        </div>
      </div>
    </section>
  )
}
