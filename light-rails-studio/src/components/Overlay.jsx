import { useEffect, useRef, useState } from 'react'

const REEL = ['vision', 'editorial', 'swiss', 'split', 'manifesto', 'catalog', 'quote', 'hero']

function copy(lang) {
  const zh = lang === 'zh'
  return {
    ask: zh ? '让系统保持秩序，让视觉持续发生。' : 'Build a system that keeps moving.',
    visionA: zh ? '图案系统，' : 'Pattern systems,',
    visionB: zh ? '保持一致。' : 'kept coherent.',
    poster: zh ? '动态秩序' : 'Living order',
    hero: zh ? '一套系统，多种表达。' : 'One system. Many expressions.',
    heroSub: zh ? '通过形态、色彩与时序建立可复用的动态视觉语言。' : 'Build a reusable visual language through form, colour and timing.',
    heroCta: zh ? '探索系统' : 'Explore system',
    distribution: zh ? '视觉系统' : 'visual system',
    cards: zh
      ? [['形态', '建立可控的几何秩序。'], ['节奏', '让运动遵循清晰的时序。'], ['输出', '适配海报、界面与品牌场景。']]
      : [['FORM', 'Build a controllable geometric order.'], ['RHYTHM', 'Let movement follow a deliberate cadence.'], ['OUTPUT', 'Adapt the system across brand surfaces.']],
    deckHead: zh ? '系统化，而不是装饰化' : 'Systematic, not decorative',
    editorialKicker: zh ? '动态视觉研究 / 2026' : 'MOTION STUDY / 2026',
    editorialTitle: zh ? '让运动成为排版的一部分' : 'Motion as part of typography',
    editorialBody: zh ? '不是把动画叠在版式上，而是让图形、留白、节奏和信息层级共同工作。' : 'Not motion placed on top of layout, but form, whitespace, rhythm and hierarchy working as one.',
    swissTitle: zh ? '秩序 / 变化' : 'ORDER / CHANGE',
    splitTitle: zh ? '视觉系统需要规则，也需要呼吸。' : 'A visual system needs rules — and room to breathe.',
    manifesto: zh ? ['少一点噪声。','多一点结构。','让变化可被控制。'] : ['LESS NOISE.','MORE STRUCTURE.','CONTROL THE CHANGE.'],
    catalog: zh ? '视觉目录' : 'VISUAL CATALOGUE',
    quote: zh ? '“真正有力量的动态，不是更多，而是更准确。”' : '“Good motion is not more motion. It is more precise motion.”',
    minimal: zh ? '保持克制。' : 'KEEP IT QUIET.',
  }
}

function shade(hex, k) {
  const h = hex.replace('#', '')
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const f = c => Math.round(parseInt(c, 16) * (1 - k))
  return `rgb(${f(v.slice(0, 2))},${f(v.slice(2, 4))},${f(v.slice(4, 6))})`
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

function Ask({ lang }) {
  const c = copy(lang)
  return (
    <div className="ui-card scene-ask refined">
      <span className="ask-kicker">LIGHT RAILS / 01</span>
      <strong>{c.ask}</strong>
      <i />
      <b className="rails-mark dark">rails</b>
    </div>
  )
}

function Vision({ lang, canvasRef }) {
  const c = copy(lang)
  return (
    <div className="ui-card scene-vision refined">
      <div className="v-card">
        <span className="rails-mark dark">rails</span>
        <div className="v-copy">
          <small>01 / SYSTEM</small>
          <h1>{c.visionA}<br />{c.visionB}</h1>
        </div>
        <PatternWindow canvasRef={canvasRef} className="v-grid" mosaic={[12, 7]} />
      </div>
    </div>
  )
}

function Poster({ lang, stops, canvasRef }) {
  const c = copy(lang)
  const page = stops[Math.min(1, stops.length - 1)]
  return (
    <div className="scene-poster refined" style={{ background: page }}>
      <div className="p-poster">
        <div className="poster-meta"><span>LIGHT RAILS</span><span>POSTER / 01</span></div>
        <PatternWindow canvasRef={canvasRef} />
        <h2>{c.poster}</h2>
      </div>
    </div>
  )
}

function Deck({ lang, stops, canvasRef }) {
  const cpy = copy(lang)
  const colors = [
    stops[0] ? shade(stops[0], 0.28) : '#24242a',
    stops[1] ? shade(stops[1], 0.28) : '#30333a',
    stops[2] ? shade(stops[2], 0.28) : '#474a50',
  ]
  return (
    <div className="scene-deck refined" style={{ background: shade(stops[stops.length - 1] || '#202126', 0.78) }}>
      <div className="deck-meta"><span>{cpy.distribution}</span><span>03 MODULES</span></div>
      <div className="d-cards">
        {cpy.cards.map(([t, p], i) => (
          <div key={t} className="d-card" style={{ background: colors[i] }}>
            <div className="d-num">0{i + 1}</div>
            <div className="d-art"><PatternWindow canvasRef={canvasRef} className="d-artc" /></div>
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
    <div className="ui-card scene-hero refined">
      <span className="hero-index">LIGHT RAILS — 2026</span>
      <h1>{c.hero}</h1>
      <p>{c.heroSub}</p>
      <span className="cta">{c.heroCta}</span>
    </div>
  )
}

function Editorial({ lang, canvasRef }) {
  const c = copy(lang)
  return (
    <div className="layout-editorial">
      <div className="ed-side">
        <span>{c.editorialKicker}</span>
        <b>01</b>
      </div>
      <div className="ed-main">
        <h1>{c.editorialTitle}</h1>
        <p>{c.editorialBody}</p>
      </div>
      <PatternWindow canvasRef={canvasRef} className="ed-art" />
      <span className="ed-footer">LIGHT RAILS / SYSTEM STUDY</span>
    </div>
  )
}

function Swiss({ lang, canvasRef }) {
  const c = copy(lang)
  return (
    <div className="layout-swiss">
      <div className="swiss-grid">
        <span className="sg-a">LIGHT<br/>RAILS</span>
        <span className="sg-b">01</span>
        <h1>{c.swissTitle}</h1>
        <p>FORM<br/>COLOUR<br/>TIME</p>
        <PatternWindow canvasRef={canvasRef} className="swiss-art" />
        <span className="sg-footer">GEN / SYSTEM / MOTION</span>
      </div>
    </div>
  )
}

function Split({ lang, canvasRef }) {
  const c = copy(lang)
  return (
    <div className="layout-split">
      <PatternWindow canvasRef={canvasRef} className="split-art" />
      <div className="split-copy">
        <span>LIGHT RAILS / 02</span>
        <h1>{c.splitTitle}</h1>
        <div className="split-rule" />
        <p>FORM · RHYTHM · COLOUR · OUTPUT</p>
      </div>
    </div>
  )
}

function IndexLayout({ canvasRef }) {
  return (
    <div className="layout-index">
      <div className="index-head"><span>LIGHT RAILS</span><span>INDEX / 2026</span></div>
      <h1>01—12</h1>
      <div className="index-modules">
        {[0,1,2].map(i => (
          <div key={i}>
            <PatternWindow canvasRef={canvasRef} className="index-art" />
            <span>0{i+1}</span>
          </div>
        ))}
      </div>
      <div className="index-foot"><span>FORM</span><span>MOTION</span><span>SYSTEM</span></div>
    </div>
  )
}

function Manifesto({ lang, canvasRef }) {
  const c = copy(lang)
  return (
    <div className="layout-manifesto">
      <PatternWindow canvasRef={canvasRef} className="manifesto-band" />
      <div className="manifesto-copy">
        {c.manifesto.map((line, i) => <h1 key={line} className={`m-line m-${i}`}>{line}</h1>)}
      </div>
      <span className="manifesto-meta">LIGHT RAILS / MANIFESTO 01</span>
    </div>
  )
}

function Catalog({ lang, canvasRef }) {
  const c = copy(lang)
  return (
    <div className="layout-catalog">
      <div className="catalog-head"><h1>{c.catalog}</h1><span>VOL.01 / 2026</span></div>
      <div className="catalog-grid">
        {[0,1,2].map(i => (
          <article key={i}>
            <PatternWindow canvasRef={canvasRef} className="catalog-art" />
            <div><b>0{i+1}</b><span>{['FORM','FLOW','FIELD'][i]}</span></div>
          </article>
        ))}
      </div>
      <p>GENERATIVE FORM / MOTION SYSTEM / VISUAL IDENTITY</p>
    </div>
  )
}

function Quote({ lang, canvasRef }) {
  const c = copy(lang)
  return (
    <div className="layout-quote">
      <div className="quote-copy">
        <span>NOTE / 07</span>
        <h1>{c.quote}</h1>
        <p>LIGHT RAILS / MOTION PRINCIPLE</p>
      </div>
      <div className="quote-art-wrap"><PatternWindow canvasRef={canvasRef} className="quote-art" /></div>
    </div>
  )
}

function Minimal({ lang, canvasRef }) {
  const c = copy(lang)
  return (
    <div className="layout-minimal">
      <span className="minimal-brand">LIGHT RAILS</span>
      <PatternWindow canvasRef={canvasRef} className="minimal-art" />
      <h1>{c.minimal}</h1>
      <div className="minimal-foot"><span>FORM / 01</span><span>2026</span></div>
    </div>
  )
}

const RENDER = {
  ask: Ask,
  vision: Vision,
  poster: Poster,
  deck: Deck,
  hero: Hero,
  editorial: Editorial,
  swiss: Swiss,
  split: Split,
  index: IndexLayout,
  manifesto: Manifesto,
  catalog: Catalog,
  quote: Quote,
  minimal: Minimal,
}

export default function Overlay({ lang = 'en', context, uiOn, stops = [], bg = '#000', canvasRef }) {
  const [reelIdx, setReelIdx] = useState(0)

  useEffect(() => {
    if (context !== 'reel') return
    const id = setInterval(() => setReelIdx(i => (i + 1) % REEL.length), 5200)
    return () => clearInterval(id)
  }, [context])

  if (!uiOn || context === 'off') return null
  const key = context === 'reel' ? REEL[reelIdx] : context
  const Card = RENDER[key]
  if (!Card) return null
  return (
    <div className={`ui-overlay context-${key}`}>
      <Card key={key} lang={lang} stops={stops} bg={bg} canvasRef={canvasRef} />
    </div>
  )
}
