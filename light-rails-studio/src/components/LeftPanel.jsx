import { useEffect, useRef, useState } from 'react'
import { PATTERNS, THEMES } from '../patterns.js'
import { UI_THEMES } from '../presets.js'
import { defaultsFor, renderFrame } from '../engine.js'
import { patternName } from '../i18n.js'

export function Sec({ title, defaultOpen = true, first = false, children, meta = null }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <>
      <button
        className={`sec-head ${open ? '' : 'closed'} ${first ? 'first' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <span>{title}</span>
        {meta ? <em>{meta}</em> : null}
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
  lang, t,
  uiTheme, onUiTheme,
  templateId, onTemplate,
  themeName, onTheme,
  stops, bg, onStops, onBg,
  saved, onApplySaved, onDeleteSaved,
  lookName, onLookName, onSaveNamed,
}) {
  const visibleTemplates = Object.keys(PATTERNS)

  return (
    <aside className="panel panel-left">
      <div className="panel-title">
        <span className="tt">{t('looks')}</span>
        <span className="panel-count">{visibleTemplates.length}</span>
      </div>

      <Sec title={t('myPresets')} first>
        <div className="preset-save">
          <input
            value={lookName}
            onChange={e => onLookName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onSaveNamed() }}
            placeholder={t('presetPlaceholder')}
            aria-label={t('presetPlaceholder')}
          />
          <button onClick={onSaveNamed}>{t('save')}</button>
        </div>
        {saved.length === 0 ? (
          <p className="hint preset-hint">{t('emptyPresets')}</p>
        ) : (
          <div className="saved-list">
            {saved.map((item, index) => (
              <button className="saved-row" key={item.id} onClick={() => onApplySaved(item)}>
                <img src={item.thumb} alt="" />
                <span>{item.name || `Look ${saved.length - index}`}</span>
                <i
                  role="button"
                  tabIndex={0}
                  aria-label="delete"
                  onClick={e => { e.stopPropagation(); onDeleteSaved(item.id) }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
                      onDeleteSaved(item.id)
                    }
                  }}
                >×</i>
              </button>
            ))}
          </div>
        )}
      </Sec>

      <Sec title={t('uiThemes')}>
        <div className="ui-theme-grid">
          {UI_THEMES.map(theme => (
            <button
              key={theme.id}
              className={`ui-theme-card ${uiTheme === theme.id ? 'on' : ''}`}
              onClick={() => onUiTheme(theme.id)}
              title={theme.name[lang] || theme.name.en}
            >
              <span className="ui-theme-swatches">
                {theme.swatches.map((color, i) => (
                  <i key={color + i} style={{ background: color }} />
                ))}
              </span>
              <b>{theme.name[lang] || theme.name.en}</b>
            </button>
          ))}
        </div>
      </Sec>

      <Sec title={t('themePresets')} meta={THEMES.length}>
        <div className="chips theme-chips">
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

      <Sec title={t('templates')} meta={visibleTemplates.length}>
        <div className="chips tpl">
          {visibleTemplates.map(id => (
            <button
              key={id}
              className={`chip ${templateId === id ? 'on' : ''}`}
              onClick={() => onTemplate(id)}
              title={patternName(lang, PATTERNS[id].name)}
            >
              <TemplateThumb id={id} stops={stops} bg={bg} />
              <span>{patternName(lang, PATTERNS[id].name)}</span>
            </button>
          ))}
        </div>
      </Sec>

      <Sec title={t('gradientColours')} defaultOpen={false}>
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
          <button disabled={stops.length >= 6} onClick={() => onStops([...stops, stops[stops.length - 1]])}>{t('addStop')}</button>
          <button disabled={stops.length <= 2} onClick={() => onStops(stops.slice(0, -1))}>{t('removeStop')}</button>
        </div>
      </Sec>
    </aside>
  )
}
