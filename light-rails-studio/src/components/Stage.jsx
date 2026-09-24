import { useEffect, useRef, useState } from 'react'
import { renderFrame } from '../engine.js'
import { PATTERNS } from '../patterns.js'
import Overlay from './Overlay.jsx'
import SelectControl from './SelectControl.jsx'
import LayoutPicker from './LayoutPicker.jsx'

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

  const contextOptions = [
    { value: 'reel', label: t('reel'), desc: lang === 'zh' ? '自动轮播精选版式' : 'Curated layout reel', preview: 'reel' },
    { value: 'editorial', label: t('editorial'), desc: lang === 'zh' ? '大标题与图像建立编辑感' : 'Editorial title-led spread', preview: 'editorial' },
    { value: 'swiss', label: t('swiss'), desc: lang === 'zh' ? '理性网格与信息层级' : 'Rational grid and hierarchy', preview: 'swiss' },
    { value: 'split', label: t('split'), desc: lang === 'zh' ? '图形与文字双区平衡' : 'Balanced image / type split', preview: 'split' },
    { value: 'manifesto', label: t('manifesto'), desc: lang === 'zh' ? '强文字主导的宣言式构图' : 'Type-first manifesto layout', preview: 'manifesto' },
    { value: 'catalog', label: t('catalog'), desc: lang === 'zh' ? '连续模块化视觉目录' : 'Modular visual catalogue', preview: 'catalog' },
    { value: 'quote', label: t('quote'), desc: lang === 'zh' ? '留白与引言形成节奏' : 'Whitespace-led quotation study', preview: 'quote' },
    { value: 'minimal', label: t('minimal'), desc: lang === 'zh' ? '高留白、低信息密度' : 'Quiet low-density frame', preview: 'minimal' },
    { value: 'vision', label: t('vision'), desc: lang === 'zh' ? '横向品牌主视觉' : 'Horizontal brand hero', preview: 'vision' },
    { value: 'hero', label: t('hero'), desc: lang === 'zh' ? '中心式系统主视觉' : 'Centered system hero', preview: 'hero' },
    { value: 'poster', label: t('poster'), desc: lang === 'zh' ? '单张海报式构图' : 'Single poster composition', preview: 'poster' },
    { value: 'deck', label: t('deck'), desc: lang === 'zh' ? '三卡片模块系统' : 'Three-card modular system', preview: 'deck' },
    { value: 'index', label: t('index'), desc: lang === 'zh' ? '编号与模块索引构图' : 'Numbered modular index', preview: 'index' },
    { value: 'ask', label: t('ask'), desc: lang === 'zh' ? '一句话信息条幅' : 'Single-line statement bar', preview: 'ask' },
    { value: 'off', label: t('off'), desc: lang === 'zh' ? '只保留动态图案' : 'Pure generative pattern', preview: 'off' },
  ]
  const frameOptions = [
    { value: 1.7778, label: '16 : 9' },
    { value: 1, label: '1 : 1' },
    { value: 0.8, label: '4 : 5' },
  ]

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
          <LayoutPicker
            value={context}
            options={contextOptions}
            onChange={onContext}
            ariaLabel={t('pattern')}
          />

          <label>{t('frame')}</label>
          <SelectControl
            value={aspect}
            options={frameOptions}
            onChange={value => onAspect(Number(value))}
            ariaLabel={t('frame')}
            compact
            placement="top"
          />

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
