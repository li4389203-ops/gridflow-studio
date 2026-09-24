import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PATTERNS, THEMES } from './patterns.js'
import { MOTION_PRESETS } from './presets.js'
import {
  defaultsFor, randomParamsFor, renderStill,
  encodeCfg, decodeCfg, download, recordWebm,
  GLOBAL_DEFAULTS,
} from './engine.js'
import { tr } from './i18n.js'
import LeftPanel from './components/LeftPanel.jsx'
import Stage from './components/Stage.jsx'
import RightPanel from './components/RightPanel.jsx'

const SAVE_KEY = 'light-rails-saved-looks'
const LANG_KEY = 'light-rails-lang'
const UI_THEME_KEY = 'light-rails-ui-theme'
const RANDOM_LAYOUTS = ['editorial','swiss','split','manifesto','catalog','quote','minimal','vision','hero','poster','deck','index']

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || [] } catch { return [] }
}
function loadLang() {
  try { return localStorage.getItem(LANG_KEY) === 'zh' ? 'zh' : 'en' } catch { return 'en' }
}
function loadUiTheme() {
  try { return localStorage.getItem(UI_THEME_KEY) || 'paper' } catch { return 'paper' }
}

export default function App() {
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

  const [context, setContext] = useState('reel')
  const [aspect, setAspect] = useState(1.7778)
  const [uiOn, setUiOn] = useState(true)
  const [playing, setPlaying] = useState(true)

  const [lang, setLang] = useState(loadLang)
  const [uiTheme, setUiTheme] = useState(loadUiTheme)
  const [saved, setSaved] = useState(loadSaved)
  const [lookName, setLookName] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [roadmapOpen, setRoadmapOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [toast, setToast] = useState(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [, setHistoryTick] = useState(0)

  const canvasRef = useRef(null)
  const timeRef = useRef(0)
  const fileRef = useRef(null)
  const paramCache = useRef({ rails: defaultsFor('rails') })
  const toastTimer = useRef(null)
  const historyRef = useRef([])
  const historyIndexRef = useRef(-1)
  const historyTimerRef = useRef(null)
  const applyingHistoryRef = useRef(false)

  const t = useCallback((key) => tr(lang, key), [lang])

  const say = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }, [])

  const cfg = useMemo(
    () => ({ templateId, params, stops, bg, speed, motion, grad, timing, look }),
    [templateId, params, stops, bg, speed, motion, grad, timing, look],
  )

  function applyCfg(c) {
    const id = PATTERNS[c.templateId] ? c.templateId : 'rails'
    setTemplateId(id)
    setParams({ ...defaultsFor(id), ...(c.params || {}) })
    if (Array.isArray(c.stops) && c.stops.length >= 2) setStops(c.stops)
    if (c.bg) setBg(c.bg)
    if (typeof c.speed === 'number') setSpeed(c.speed)
    setMotion(c.motion ?? GLOBAL_DEFAULTS.motion)
    setGrad({ ...GLOBAL_DEFAULTS.grad, ...(c.grad || {}) })
    setTiming({ ...GLOBAL_DEFAULTS.timing, ...(c.timing || {}) })
    setLook({ ...GLOBAL_DEFAULTS.look, ...(c.look || {}) })
    setThemeName('')
  }

  useEffect(() => {
    const m = location.hash.match(/look=([A-Za-z0-9+/=]+)/)
    if (!m) return
    const c = decodeCfg(m[1])
    if (!c) return
    applyCfg(c)
    say(t('loaded'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try { localStorage.setItem(LANG_KEY, lang) } catch {}
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  }, [lang])

  useEffect(() => {
    try { localStorage.setItem(UI_THEME_KEY, uiTheme) } catch {}
    document.documentElement.dataset.uiTheme = uiTheme
  }, [uiTheme])

  useEffect(() => {
    const snapshot = JSON.stringify(cfg)
    if (applyingHistoryRef.current) {
      applyingHistoryRef.current = false
      return
    }
    clearTimeout(historyTimerRef.current)
    historyTimerRef.current = setTimeout(() => {
      const list = historyRef.current
      const idx = historyIndexRef.current
      if (list[idx] === snapshot) return
      const next = list.slice(0, idx + 1)
      next.push(snapshot)
      if (next.length > 80) next.shift()
      historyRef.current = next
      historyIndexRef.current = next.length - 1
      setHistoryTick(x => x + 1)
    }, 180)
    return () => clearTimeout(historyTimerRef.current)
  }, [cfg])

  const undo = () => {
    if (historyIndexRef.current <= 0) return
    historyIndexRef.current -= 1
    applyingHistoryRef.current = true
    applyCfg(JSON.parse(historyRef.current[historyIndexRef.current]))
    setHistoryTick(x => x + 1)
  }

  const redo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current += 1
    applyingHistoryRef.current = true
    applyCfg(JSON.parse(historyRef.current[historyIndexRef.current]))
    setHistoryTick(x => x + 1)
  }

  const resetAll = () => {
    const th = THEMES[0]
    applyCfg({
      templateId: 'rails',
      params: defaultsFor('rails'),
      stops: th.stops,
      bg: th.bg,
      speed: 1,
      motion: GLOBAL_DEFAULTS.motion,
      grad: GLOBAL_DEFAULTS.grad,
      timing: GLOBAL_DEFAULTS.timing,
      look: GLOBAL_DEFAULTS.look,
    })
    setThemeName(th.name)
    setContext('reel')
    setAspect(1.7778)
    setUiOn(true)
    timeRef.current = 0
    setMoreOpen(false)
  }

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
    const motionPreset = MOTION_PRESETS[Math.floor(Math.random() * MOTION_PRESETS.length)]
    const nextLayout = RANDOM_LAYOUTS[Math.floor(Math.random() * RANDOM_LAYOUTS.length)]
    setTemplateId(id)
    setParams(randomParamsFor(id))
    onTheme(th)
    setMotion(motionPreset.motion)
    setSpeed(motionPreset.speed)
    setGrad({ ...motionPreset.grad })
    setTiming({ ...motionPreset.timing })
    setLook({ ...motionPreset.look })
    setContext(nextLayout)
    timeRef.current = 0
    setMoreOpen(false)
  }

  const saveLook = () => {
    const name = lookName.trim()
    if (!name) { say(t('nameNeeded')); return }
    const thumb = renderStill(cfg, 220, 220, timeRef.current || 3).toDataURL('image/jpeg', 0.82)
    const item = { id: Date.now(), name, cfg, thumb }
    const next = [item, ...saved].slice(0, 24)
    setSaved(next)
    localStorage.setItem(SAVE_KEY, JSON.stringify(next))
    setLookName('')
    say(t('saved'))
  }

  const deleteSaved = (id) => {
    const next = saved.filter(s => s.id !== id)
    setSaved(next)
    localStorage.setItem(SAVE_KEY, JSON.stringify(next))
    say(t('deleted'))
  }

  const share = async () => {
    const url = `${location.origin}${location.pathname}#look=${encodeCfg(cfg)}`
    try {
      await navigator.clipboard.writeText(url)
      say(t('copied'))
    } catch {
      history.replaceState(null, '', `#look=${encodeCfg(cfg)}`)
      say(t('copied'))
    }
    setMoreOpen(false)
  }

  const exportPng = () => {
    const h = 2048
    const w = Math.round(h * aspect)
    renderStill(cfg, w, h, timeRef.current || 3).toBlob(b => {
      download(b, `light-rails-${templateId}.png`)
      say(t('exportedPng'))
    }, 'image/png')
  }

  const exportJson = () => {
    download(
      new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' }),
      `light-rails-${templateId}.json`,
    )
    say(t('exportedJson'))
  }

  const exportWebm = () => {
    if (recording) return
    setPlaying(true)
    setRecording(true)
    say(t('recording'))
    const ok = recordWebm(canvasRef.current, 6, (blob) => {
      download(blob, `light-rails-${templateId}.webm`)
      setRecording(false)
      say(t('exportedVideo'))
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
        say(t('imported'))
      } catch {
        say(t('invalid'))
      }
    })
    setMoreOpen(false)
  }

  const doExport = (kind) => {
    setExportOpen(false)
    if (kind === 'png') exportPng()
    else if (kind === 'json') exportJson()
    else if (kind === 'webm') exportWebm()
  }

  useEffect(() => {
    if (!exportOpen && !moreOpen) return
    const close = () => { setExportOpen(false); setMoreOpen(false) }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [exportOpen, moreOpen])

  useEffect(() => {
    const onKey = (e) => {
      if (/input|select|textarea/i.test(e.target.tagName)) return
      if (e.key.toLowerCase() === 'h' && !e.metaKey && !e.ctrlKey) setPanelOpen(o => !o)
      if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey) shuffle()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
      if (e.key === ' ') {
        e.preventDefault()
        setPlaying(p => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const canUndo = historyIndexRef.current > 0
  const canRedo = historyIndexRef.current >= 0 && historyIndexRef.current < historyRef.current.length - 1

  return (
    <>
      <header className="topbar">
        <div className="brand-cluster">
          <span className="tb-title">{t('brand')}</span>
          <span className="tb-by">{t('by')}</span>
          <span className="social-dot" aria-hidden="true">in</span>
          <span className="social-dot camera-dot" aria-hidden="true">◎</span>
        </div>

        <div className="history-cluster">
          <button className="icon-action" onClick={undo} disabled={!canUndo} title={t('undo')}>↶</button>
          <button className="icon-action" onClick={redo} disabled={!canRedo} title={t('redo')}>↷</button>
          <button className="icon-action" onClick={resetAll} title={t('reset')}>↻</button>
        </div>

        <div className="top-actions">
          <div className="lang-switch" aria-label={t('language')}>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
            <button className={lang === 'zh' ? 'on' : ''} onClick={() => setLang('zh')}>中</button>
          </div>

          <button className="tb-random" onClick={shuffle} title="R">
            <span aria-hidden="true">⤨</span>{t('shuffle')}
          </button>

          <div className="more-wrap" onPointerDown={e => e.stopPropagation()}>
            <button className="icon-action more-btn" onClick={() => setMoreOpen(o => !o)} aria-label={t('more')}>•••</button>
            {moreOpen && (
              <div className="export-menu more-menu">
                <button onClick={share}>↗ {t('share')}</button>
                <button onClick={() => fileRef.current?.click()}>⇧ {t('importJson')}</button>
                <button onClick={resetAll}>↻ {t('reset')}</button>
              </div>
            )}
          </div>

          <button className="tb-roadmap" onClick={() => setRoadmapOpen(true)}>⚡ {t('roadmap')}</button>

          <div className="export-wrap" onPointerDown={e => e.stopPropagation()}>
            <button
              className={`tb-export ${recording ? 'rec' : ''}`}
              onClick={() => setExportOpen(o => !o)}
            >
              {recording ? '● REC…' : t('export')}
            </button>
            {exportOpen && (
              <div className="export-menu">
                <button onClick={() => doExport('png')}>{t('png')}</button>
                <button onClick={() => doExport('webm')}>{t('webm')}</button>
                <button onClick={() => doExport('json')}>{t('json')}</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className={`layout ${panelOpen ? '' : 'no-right'}`}>
        <LeftPanel
          lang={lang} t={t}
          uiTheme={uiTheme} onUiTheme={setUiTheme}
          templateId={templateId} onTemplate={onTemplate}
          themeName={themeName} onTheme={onTheme}
          stops={stops} bg={bg}
          onStops={s => { setStops(s); setThemeName('') }}
          onBg={b => { setBg(b); setThemeName('') }}
          saved={saved}
          onApplySaved={item => { applyCfg(item.cfg); say(t('applied')) }}
          onDeleteSaved={deleteSaved}
          lookName={lookName} onLookName={setLookName} onSaveNamed={saveLook}
        />

        <Stage
          lang={lang} t={t}
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
            lang={lang} t={t}
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
        ) : <div />}
      </main>

      {!panelOpen && (
        <button className="show-panel" title="show panel (H)" onClick={() => setPanelOpen(true)}>
          {t('railsPanel')}
        </button>
      )}

      {roadmapOpen && (
        <div className="modal-backdrop" onPointerDown={() => setRoadmapOpen(false)}>
          <div className="roadmap-modal" onPointerDown={e => e.stopPropagation()}>
            <div className="roadmap-head">
              <h2>{t('roadmapTitle')}</h2>
              <button onClick={() => setRoadmapOpen(false)}>×</button>
            </div>
            <p>{t('roadmapBody')}</p>
            <div className="roadmap-grid">
              <div><b>01</b><span>42 CORE TEMPLATES</span></div>
              <div><b>02</b><span>LIVE RAIL PARAMETERS</span></div>
              <div><b>03</b><span>BRAND CONTEXTS</span></div>
              <div><b>04</b><span>PNG / JSON / WEBM</span></div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast"><span className="ring" />{toast}</div>}
      <input ref={fileRef} type="file" accept="application/json" hidden onChange={importJson} />
    </>
  )
}
