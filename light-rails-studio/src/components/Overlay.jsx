import { useEffect, useRef, useState } from 'react'

const CARDS = ['ask', 'vision', 'poster', 'deck', 'hero']

function shade(hex, k) {
  const h = hex.replace('#', '')
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const f = c => Math.round(parseInt(c, 16) * (1 - k))
  return `rgb(${f(v.slice(0, 2))},${f(v.slice(2, 4))},${f(v.slice(4, 6))})`
}

/* white question bar with a caret block, like the reference */
function Ask() {
  return (
    <div className="ui-card scene-ask">
      <span>How do I give my brand a pulse?</span>
      <i />
    </div>
  )
}

/* white vision card: headline bottom-left, LIVE pattern mosaic on the right */
function Vision({ canvasRef }) {
  return (
    <div className="ui-card scene-vision">
      <div className="v-card">
        <h1>Maximise<br />your brand.</h1>
        <PatternWindow canvasRef={canvasRef} className="v-grid" mosaic={[9, 5]} />
      </div>
    </div>
  )
}

/* live mirror of the main pattern canvas, cover-cropped.
   mosaic=[cols,rows] pixelates it into a colour-block grid. */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, mosaic ? mosaic.join() : ''])
  return <canvas ref={ref} className={className} />
}

/* full-bleed poster page: solid colour, live pattern in the art well */
function Poster({ stops, canvasRef }) {
  const page = stops[Math.min(1, stops.length - 1)]
  return (
    <div className="scene-poster" style={{ background: page }}>
      <div className="p-poster">
        <PatternWindow canvasRef={canvasRef} />
        <h2>Maximise</h2>
      </div>
    </div>
  )
}

/* dark deck page: pill, dashed drop, three stacked palette cards —
   every card's art well plays the LIVE pattern */
function Deck({ stops, canvasRef }) {
  const c = [
    stops[0] ? shade(stops[0], 0.25) : '#002CFC',
    stops[1] ? shade(stops[1], 0.25) : '#027842',
    stops[2] ? shade(stops[2], 0.25) : '#58594D',
  ]
  const titles = [
    ['Create', 'Generate living patterns from one system.'],
    ['Customise', 'Control the hell out of the configuration.'],
    ['Share', 'Publish your look and let others remix it.'],
  ]
  return (
    <div className="scene-deck" style={{ background: shade(stops[stops.length - 1] || '#001365', 0.72) }}>
      <span className="d-pill">distribution</span>
      <i className="d-dash" />
      <div className="d-cards">
        {titles.map(([t, p], i) => (
          <div
            key={t}
            className="d-card"
            style={{
              background: c[i],
              transform: `rotate(${(i - 1) * 7}deg) translateY(${i === 1 ? -6 : 4}%)`,
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
      <h2 className="d-head">Here’s what<br />your brand needs</h2>
    </div>
  )
}

/* promo hero: big white headline over the live pattern */
function Hero() {
  return (
    <div className="ui-card scene-hero">
      <h1>Ship your brand<br />in one afternoon</h1>
      <p>Generate, tune and export living patterns — no timeline scrubbing.</p>
      <span className="cta">Start building</span>
    </div>
  )
}

const RENDER = { ask: Ask, vision: Vision, poster: Poster, deck: Deck, hero: Hero }

export default function Overlay({ context, uiOn, stops = [], bg = '#000', canvasRef }) {
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
      <Card key={key} stops={stops} bg={bg} canvasRef={canvasRef} />
    </div>
  )
}
