import { useEffect, useRef, useState } from 'react'

const CARDS = ['ask', 'vision', 'poster', 'deck', 'hero']

function copy(lang) {
  const zh = lang === 'zh'
  return {
    ask: zh ? '让智能体替你处理那些重复工作' : 'Build an agent that does the boring parts',
    visionA: zh ? '图案系统，' : 'Pattern operations,',
    visionB: zh ? '一次解决。' : 'solved.',
    poster: zh ? '统一载体' : 'One surface.',
    hero: zh ? '一次运行，多轨协作。' : 'Single run by many rails.',
    heroSub: zh ? '实时生成、调节并导出可复用的动态品牌图案。' : 'Generate, tune and export a living pattern system in real time.',
    heroCta: zh ? '开始构建' : 'Start building',
    distribution: zh ? '品牌分发' : 'distribution',
    cards: zh
      ? [['生成', '从同一套系统快速产生不同动态图案。'], ['控制', '精确调节形态、光轨、渐变与时序。'], ['输出', '将效果带入不同品牌版式并导出。']]
      : [['Create', 'Generate living patterns from one system.'], ['Control', 'Tune shape, rails, gradient and timing precisely.'], ['Export', 'Place the result in brand layouts and export it.']],
    deckHead: zh ? '一套系统，多种表达' : 'One system, many expressions',
  }
}

function shade(hex, k) {
  const h = hex.replace('#', '')
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const f = c => Math.round(parseInt(c, 16) * (1 - k))
  return \`rgb(\${f(v.slice(0, 2))},\${f(v.slice(2, 4))},\${f(v.slice(4, 6))})\`
}

function Ask({ lang }) {
  const c = copy(lang)
  return (
    <div className="ui-card scene-ask">
      <span>{c.ask}</span>
      <i />
      <b className="rails-mark">rails</b>
    </div>
  )
}

function Vision({ lang, canvasRef }) {
  const c = copy(lang)
  return (
    <div className="ui-card scene-vision">
      <div className="v-card">
        <span className="rails-mark dark">rails</span>
        <h1>{c.visionA}<br />{c.visionB}</h1>
        <PatternWindow canvasRef={canvasRef} className="v-grid" mosaic={[9, 5]} />
      </div>
    </div>
  )
}

function PatternWindow({ canvasRef, className = 'p-art', mosaic = null }) {
  const ref = useRef(null)
  useEffect(() => {
    let raf
    const tiny = mosaic ? document.createElement('canvas') : null
    if (tiny) { tiny.width = mosaic[0]; tiny.height = mosaic[1] }
    const tick = () => {
      const src = canvasRef?.current
      const c = ref.current
      if (src && c && src.width > 0 && c.clientWidth > 0) {
        const W = Math.round(c.clientWidth * 2)
        const H = Math.round(c.clientHeight * 2)
        if (c.width !== W || c.height !== H) { c.width = W; c.height = H }
        const g = c.getContext('2d')
        const sa = src.width / src.height, da = W / H
        let sw = src.width, sh = src.height, sx = 0, sy = 0
        if (sa > da) { sw = src.height * da; sx = (src.width - sw) / 2 }
        else { sh = src.width / da; sy = (src.height - sh) / 2 }
        if (tiny) {
          const tg = tiny.getContext('2d')
          tg.drawImage(src, sx, sy, sw, sh, 0, 0, tiny.width, tiny.height)
          g.imageSmoothingEnabled = false
          g.drawImage(tiny, 0, 0, W, H)
        } else {
          g.drawImage(src, sx, sy, sw, sh, 0, 0, W, H)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [canvasRef, mosaic ? mosaic.join() : ''])
  return <canvas ref={ref} className={className} />
}

function Poster({ lang, stops, canvasRef }) {
  const c = copy(lang)
  const page = stops[Math.min(1, stops.length - 1)]
  return (
    <div className="scene-poster" style={{ background: page }}>
      <div className="p-poster">
        <span className="rails-mark poster-mark">rails</span>
        <PatternWindow canvasRef={canvasRef} />
        <h2>{c.poster}</h2>
      </div>
    </div>
  )
}

function Deck({ lang, stops, canvasRef }) {
  const cpy = copy(lang)
  const c = [
    stops[0] ? shade(stops[0], 0.25) : '#002CFC',
    stops[1] ? shade(stops[1], 0.25) : '#027842',
    stops[2] ? shade(stops[2], 0.25) : '#58594D',
  ]
  return (
    <div className="scene-deck" style={{ background: shade(stops[stops.length - 1] || '#001365', 0.72) }}>
      <span className="d-pill">{cpy.distribution}</span>
      <i className="d-dash" />
      <div className="d-cards">
        {cpy.cards.map(([t, p], i) => (
          <div
            key={t}
            className="d-card"
            style={{
              background: c[i],
              transform: \`rotate(\${(i - 1) * 7}deg) translateY(\${i === 1 ? -6 : 4}%)\`,
              zIndex: i === 1 ? 2 : 1,
            }}
          >
            <div className="d-art">
              <PatternWindow canvasRef={canvasRef} className="d-artc" />
            </div>
            <h3>{t}</h3>
            <p>{p}</p>
          </div>
        ))}
      </div>
      <h2 className="d-head">{cpy.deckHead}</h2>
    </div>
  )
}

function Hero({ lang }) {
  const c = copy(lang)
  return (
    <div className="ui-card scene-hero">
      <span className="rails-mark">rails</span>
      <h1>{c.hero}</h1>
      <p>{c.heroSub}</p>
      <span className="cta">{c.heroCta}</span>
    </div>
  )
}

const RENDER = { ask: Ask, vision: Vision, poster: Poster, deck: Deck, hero: Hero }

export default function Overlay({ lang = 'en', context, uiOn, stops = [], bg = '#000', canvasRef }) {
  const [reelIdx, setReelIdx] = useState(0)

  useEffect(() => {
    if (context !== 'reel') return
    const id = setInterval(() => setReelIdx(i => (i + 1) % CARDS.length), 5000)
    return () => clearInterval(id)
  }, [context])

  if (!uiOn || context === 'off') return null
  const key = context === 'reel' ? CARDS[reelIdx] : context
  const Card = RENDER[key]
  if (!Card) return null
  return (
    <div className="ui-overlay">
      <Card key={key} lang={lang} stops={stops} bg={bg} canvasRef={canvasRef} />
    </div>
  )
}
