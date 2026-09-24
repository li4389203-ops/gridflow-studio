import { useEffect, useRef, useState } from 'react'
import { PATTERNS, THEMES } from '../patterns.js'
import { defaultsFor, renderFrame } from '../engine.js'

export function Sec({ title, defaultOpen = true, first = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <>
      <button
        className={`sec-head ${open ? '' : 'closed'} ${first ? 'first' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        {title}
      </button>
      <div className={`sec ${open ? '' : 'closed-body'}`}>{children}</div>
    </>
  )
}

function orbStyle(th) {
  const s = th.stops
  const c2 = s[1] ?? s[0]
  return {
    background:
      `radial-gradient(circle at 30% 22%, ${s[0]} 0%, rgba(0,0,0,0) 58%), ` +
      `radial-gradient(circle at 76% 74%, ${c2} 0%, rgba(0,0,0,0) 62%), ` +
      `linear-gradient(140deg, ${s.join(', ')})`,
  }
}

function TemplateThumb({ id, stops, bg }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current
    c.width = 52
    c.height = 52
    renderFrame(c.getContext('2d'), 52, 52, 2.4, {
      templateId: id, params: defaultsFor(id), stops, bg, speed: 1, motion: 'solid',
    })
  }, [id, stops, bg])
  return <canvas ref={ref} />
}

const ROLE = (i, n) => (i === 0 ? 'start' : i === n - 1 ? 'end' : 'mid')

export default function LeftPanel({
  templateId, onTemplate,
  themeName, onTheme,
  stops, bg, onStops, onBg,
  saved, onApplySaved, onDeleteSaved,
}) {
  return (
    <aside className="panel panel-left">
      <div className="panel-title"><span className="tt">Looks</span></div>

      <Sec title="Theme presets" first>
        <div className="chips">
          {THEMES.map(th => (
            <button
              key={th.name}
              className={`chip orb ${themeName === th.name ? 'on' : ''}`}
              style={orbStyle(th)}
              aria-label={th.name}
              title={th.name}
              onClick={() => onTheme(th)}
            />
          ))}
        </div>
      </Sec>

      <Sec title="Templates">
        <div className="chips tpl">
          {Object.keys(PATTERNS).map(id => (
            <button
              key={id}
              className={`chip ${templateId === id ? 'on' : ''}`}
              onClick={() => onTemplate(id)}
            >
              <TemplateThumb id={id} stops={stops} bg={bg} />
              <span>{PATTERNS[id].name}</span>
            </button>
          ))}
        </div>
      </Sec>

      <Sec title="Gradient colours">
        {stops.map((hex, i) => (
          <div className="stop" key={i}>
            <input
              type="color"
              value={hex}
              onChange={e => onStops(stops.map((s, j) => (j === i ? e.target.value : s)))}
            />
            <code>{hex}</code>
            <span className="role">{ROLE(i, stops.length)}</span>
            {stops.length > 2
              ? <button title="remove stop" onClick={() => onStops(stops.filter((_, j) => j !== i))}>✕</button>
              : <span />}
          </div>
        ))}
        <div className="stop">
          <input type="color" value={bg} onChange={e => onBg(e.target.value)} />
          <code>{bg}</code>
          <span className="role">bg</span>
          <span />
        </div>
        <div className="btns">
          <button disabled={stops.length >= 6} onClick={() => onStops([...stops, stops[stops.length - 1]])}>+ stop</button>
          <button disabled={stops.length <= 2} onClick={() => onStops(stops.slice(0, -1))}>− stop</button>
        </div>
      </Sec>

      <Sec title="Saved looks" defaultOpen={saved.length > 0}>
        {saved.length === 0 && <p className="hint">Nothing saved yet. Hit “Save look”.</p>}
        <div className="saved-grid">
          {saved.map(item => (
            <div className="saved-item" key={item.id} onClick={() => onApplySaved(item)}>
              <img src={item.thumb} alt={item.cfg.templateId} />
              <button className="del" onClick={e => { e.stopPropagation(); onDeleteSaved(item.id) }}>✕</button>
            </div>
          ))}
        </div>
      </Sec>
    </aside>
  )
}
