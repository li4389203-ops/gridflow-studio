import { PATTERNS } from '../patterns.js'
import Slider from './Slider.jsx'
import { Sec } from './LeftPanel.jsx'
import { paramLabel, patternName } from '../i18n.js'

const GRAD_DEFS = [
  ['runSpeed',   'run speed',   0, 4,   0.01],
  ['runStretch', 'run stretch', 0, 3,   0.01],
  ['runSpread',  'run spread',  0, 0.6, 0.001],
  ['runJitter',  'run jitter',  0, 1,   0.01],
  ['trailHold',  'trail hold',  0, 1,   0.01],
]
const TIMING_DEFS = [
  ['period',    'period (s)', 0.4,  12,  0.01],
  ['lifetime',  'lifetime',   0.1,  1,   0.005],
  ['rise',      'rise',       0.01, 0.5, 0.005],
  ['fallStart', 'fall start', 0.1,  1,   0.005],
  ['topLag',    'top lag',   -0.2,  0.3, 0.001],
]
const LOOK_DEFS = [
  ['hollow',  'hollow',   0,    1,    0.01],
  ['angle',   'angle °',  -180, 180,  1],
  ['grain',   'grain',    0,    0.25, 0.005],
  ['gain',    'gain',     0.1,  3,    0.01],
  ['blur',    'blur',     0.02, 0.6,  0.005],
  ['glow',    'glow',     0,    1.5,  0.01],
  ['blowout', 'blow-out', 0,    1,    0.01],
  ['sway',    'sway',     0,    0.08, 0.001],
]

function Rows({ defs, values, onChange, lang }) {
  return defs.map(([key, label, min, max, step]) => (
    <Slider
      key={key}
      label={paramLabel(lang, label)}
      min={min} max={max} step={step}
      value={values[key] ?? min}
      onChange={v => onChange({ ...values, [key]: v })}
    />
  ))
}

export default function RightPanel({
  lang, t,
  templateId, params, onParam, onResetParams,
  speed, onSpeed,
  motion, onMotion,
  grad, onGrad,
  timing, onTiming,
  look, onLook,
  onHide,
}) {
  const defs = PATTERNS[templateId].params
  const shapeKeys = [], lineKeys = []
  for (const key of Object.keys(defs)) {
    if (defs[key].hidden) continue
    if (defs[key].sec === 'lines') lineKeys.push(key)
    else shapeKeys.push(key)
  }
  const paramSlider = key => (
    <Slider
      key={templateId + key}
      label={paramLabel(lang, defs[key].label)}
      min={defs[key].min} max={defs[key].max} step={defs[key].step}
      value={params[key] ?? defs[key].def}
      onChange={v => onParam(key, v)}
    />
  )

  return (
    <aside className="panel panel-right">
      <div className="panel-title rails-title">
        <span className="tt">{t('railsPanel')}</span>
        <span className="template-current">{patternName(lang, PATTERNS[templateId].name)}</span>
        <span className="sp" />
        <button className="hide-btn" title="hide panel (H)" onClick={onHide}>×</button>
      </div>

      <Sec title={t('shape')} first>
        <div className="row motion-row">
          <label>{t('motion')}</label>
          <select value={motion} onChange={e => onMotion(e.target.value)}>
            <option value="trails">{t('trails')}</option>
            <option value="solid">{t('solid')}</option>
            <option value="pulse">{t('pulse')}</option>
          </select>
        </div>
        {shapeKeys.map(paramSlider)}
      </Sec>

      {lineKeys.length > 0 && (
        <Sec title={t('lines')}>
          {lineKeys.map(paramSlider)}
        </Sec>
      )}

      <Sec title={t('gradientRun')} defaultOpen={false}>
        <Rows defs={GRAD_DEFS} values={grad} onChange={onGrad} lang={lang} />
      </Sec>

      <Sec title={t('timing')} defaultOpen={false}>
        <Rows defs={TIMING_DEFS} values={timing} onChange={onTiming} lang={lang} />
        <Slider label={paramLabel(lang, 'speed')} min={0.05} max={3} step={0.01} value={speed} onChange={onSpeed} />
      </Sec>

      <Sec title={t('look')} defaultOpen={false}>
        <Rows defs={LOOK_DEFS} values={look} onChange={onLook} lang={lang} />
      </Sec>

      <div className="btns panel-footer-actions">
        <button onClick={onResetParams}>{t('defaults')}</button>
      </div>
    </aside>
  )
}
