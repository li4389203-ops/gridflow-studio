import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PATTERNS, THEMES } from './patterns.js'
import {
  defaultsFor, randomParamsFor, renderStill,
  encodeCfg, decodeCfg, download, recordWebm,
  GLOBAL_DEFAULTS,
} from './engine.js'
import LeftPanel from './components/LeftPanel.jsx'
import Stage from './components/Stage.jsx'
import RightPanel from './components/RightPanel.jsx'

const SAVE_KEY = 'pattern-forge-saved'

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || [] } catch { return [] }
}

export default function App() {
  /* ── core look state ── */
  const [templateId, setTemplateId] = useState('rails')
  const [params, setParams] = useState(() => defaultsFor('rails'))
  const [themeName, setThemeName] = useState('ember')
  const [stops, setStops] = useState(THEMES[0].stops)
  const [bg, setBg] = useState(THEMES[0].bg)
  const [speed, setSpeed] = useState(1)
  const [motion, setMotion] = useState(GLOBAL_DEFAULTS.motion)
  const [grad, setGrad] = useState(GLOBAL_DEFAULTS.grad)
  const [timing, setTiming] = useState(GLOBAL_DEFAULTS.timing)
  const [look, setLook] = useState(GLOBAL_DEFAULTS.look)

  /* ── stage state ── */
  const [context, setContext] = useState('reel')
  const [aspect, setAspect] = useState(1.7778)
  const [uiOn, setUiOn] = useState(true)
  const [playing, setPlaying] = useState(true)

  /* ── misc ── */
  const [saved, setSaved] = useState(loadSaved)
  const [menuOpen, setMenuOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [toast, setToast] = useState(null)
  const [panelOpen, setPanelOpen] = useState(true)

  const canvasRef = useRef(null)
  const timeRef = useRef(0)
  const fileRef = useRef(null)
  const paramCache = useRef({ rails: defaultsFor('rails') })
  const toastTimer = useRef(null)

  const say = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }, [])

  const cfg = useMemo(
    () => ({ templateId, params, stops, bg, speed, motion, grad, timing, look }),
    [templateId, params, stops, bg, speed, motion, grad, timing, look],
  )

  /* ── restore from share link ── */
  useEffect(() => {
    const m = location.hash.match(/look=([A-Za-z0-9+/=]+)/)
    if (!m) return
    const c = decodeCfg(m[1])
    if (!c) return
    applyCfg(c)
    say('Loaded shared look')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyCfg(c) {
    setTemplateId(c.templateId)
    setParams({ ...defaultsFor(c.templateId), ...c.params })
    if (Array.isArray(c.stops) && c.stops.length >= 2) setStops(c.stops)
    if (c.bg) setBg(c.bg)
    if (c.speed) setSpeed(c.speed)
    setMotion(c.motion ?? GLOBAL_DEFAULTS.motion)
    setGrad({ ...GLOBAL_DEFAULTS.grad, ...(c.grad || {}) })
    setTiming({ ...GLOBAL_DEFAULTS.timing, ...(c.timing || {}) })
    setLook({ ...GLOBAL_DEFAULTS.look, ...(c.look || {}) })
    setThemeName('')
  }

  /* ── handlers ── */
  const onTemplate = (id) => {
    paramCache.current[templateId] = params
    setTemplateId(id)
    setParams(paramCache.current[id] || defaultsFor(id))
  }

  const onTheme = (th) => {
    setThemeName(th.name)
    setStops(th.stops)
    setBg(th.bg)
  }

  const onParam = (key, v) => setParams(p => ({ ...p, [key]: v }))
  const onParams = (patch) => setParams(p => ({ ...p, ...patch }))

  const shuffle = () => {
    const ids = Object.keys(PATTERNS)
    const id = ids[Math.floor(Math.random() * ids.length)]
    const th = THEMES[Math.floor(Math.random() * THEMES.length)]
    setTemplateId(id)
    setParams(randomParamsFor(id))
    onTheme(th)
    say(`⤨ ${PATTERNS[id].name} · ${th.name}`)
  }

  const saveLook = () => {
    const thumb = renderStill(cfg, 220, 220, timeRef.current || 3).toDataURL('image/jpeg', 0.82)
    const item = { id: Date.now(), cfg, thumb }
    const next = [item, ...saved].slice(0, 24)
    setSaved(next)
    localStorage.setItem(SAVE_KEY, JSON.stringify(next))
    say('Look saved')
  }

  const deleteSaved = (id) => {
    const next = saved.filter(s => s.id !== id)
    setSaved(next)
    localStorage.setItem(SAVE_KEY, JSON.stringify(next))
  }

  const share = async () => {
    const url = `${location.origin}${location.pathname}#look=${encodeCfg(cfg)}`
    try {
      await navigator.clipboard.writeText(url)
      say('Share link copied')
    } catch {
      history.replaceState(null, '', `#look=${encodeCfg(cfg)}`)
      say('Link in address bar')
    }
  }

  /* ── exports ── */
  const exportPng = () => {
    const h = 2048
    const w = Math.round(h * aspect)
    renderStill(cfg, w, h, timeRef.current || 3).toBlob(b => {
      download(b, `pattern-${templateId}.png`)
      say('PNG exported · 2048px')
    }, 'image/png')
  }

  const exportJson = () => {
    download(
      new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' }),
      `pattern-${templateId}.json`,
    )
    say('Settings exported')
  }

  const exportWebm = () => {
    if (recording) return
    setPlaying(true)
    setRecording(true)
    say('Recording 6s…')
    const ok = recordWebm(canvasRef.current, 6, (blob) => {
      download(blob, `pattern-${templateId}.webm`)
      setRecording(false)
      say('WebM exported')
    }, (err) => { setRecording(false); say(err) })
    if (!ok) setRecording(false)
  }

  const importJson = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    file.text().then(txt => {
      try {
        const c = JSON.parse(txt)
        if (!PATTERNS[c.templateId]) throw new Error('unknown template')
        applyCfg(c)
        say('Settings imported')
      } catch {
        say('Invalid settings file')
      }
    })
  }

  const doExport = (kind) => {
    setMenuOpen(false)
    if (kind === 'png') exportPng()
    else if (kind === 'json') exportJson()
    else if (kind === 'webm') exportWebm()
    else if (kind === 'import') fileRef.current.click()
  }

  /* close export menu on outside click */
  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menuOpen])

  /* H toggles the parameter panel, like the reference */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() === 'h' && !e.metaKey && !e.ctrlKey &&
          !/input|select|textarea/i.test(e.target.tagName)) {
        setPanelOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <header className="topbar">
        <span className="tb-title">Pattern Forge</span>
        <span className="tb-by">brand pattern studio</span>
        <span className="tb-sp" />
        <button className="tb-ghost" onClick={shuffle}>⤨ Shuffle</button>
        <button className="tb-ghost" onClick={saveLook}>Save look</button>
        <button className="tb-ghost" onClick={share}>Share</button>
        <div className="export-wrap" onPointerDown={e => e.stopPropagation()}>
          <button
            className={`tb-export ${recording ? 'rec' : ''}`}
            onClick={() => setMenuOpen(o => !o)}
          >
            {recording ? '● Rec…' : 'Export'}
          </button>
          {menuOpen && (
            <div className="export-menu">
              <button onClick={() => doExport('png')}>PNG still · 2048px</button>
              <button onClick={() => doExport('json')}>JSON settings</button>
              <button onClick={() => doExport('webm')}>WebM · 6s</button>
              <button onClick={() => doExport('import')}>Import JSON…</button>
            </div>
          )}
        </div>
      </header>

      <main className={`layout ${panelOpen ? '' : 'no-right'}`}>
        <LeftPanel
          templateId={templateId} onTemplate={onTemplate}
          themeName={themeName} onTheme={onTheme}
          stops={stops} bg={bg}
          onStops={s => { setStops(s); setThemeName('') }}
          onBg={b => { setBg(b); setThemeName('') }}
          saved={saved}
          onApplySaved={item => { applyCfg(item.cfg); say('Look applied') }}
          onDeleteSaved={deleteSaved}
        />
        <Stage
          cfg={cfg}
          playing={playing}
          onTogglePlay={() => setPlaying(p => !p)}
          aspect={aspect} context={context} uiOn={uiOn}
          onContext={setContext} onAspect={setAspect} onUi={setUiOn}
          canvasRef={canvasRef} timeRef={timeRef}
          templateId={templateId} params={params} onParams={onParams}
        />
        {panelOpen ? (
          <RightPanel
            templateId={templateId}
            params={params}
            onParam={onParam}
            speed={speed} onSpeed={setSpeed}
            motion={motion} onMotion={setMotion}
            grad={grad} onGrad={setGrad}
            timing={timing} onTiming={setTiming}
            look={look} onLook={setLook}
            onResetParams={() => setParams(defaultsFor(templateId))}
            onHide={() => setPanelOpen(false)}
          />
        ) : (
          <div />
        )}
      </main>

      {!panelOpen && (
        <button className="show-panel" title="show panel (H)" onClick={() => setPanelOpen(true)}>
          {PATTERNS[templateId].name}
        </button>
      )}
      {toast && <div className="toast"><span className="ring" />{toast}</div>}
      <input ref={fileRef} type="file" accept="application/json" hidden onChange={importJson} />
    </>
  )
}
