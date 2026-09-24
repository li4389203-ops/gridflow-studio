import { PATTERNS } from '../patterns.js'
import Slider from './Slider.jsx'
import { Sec } from './LeftPanel.jsx'

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

function Rows({ defs, values, onChange }) {
  return defs.map(([key, label, min, max, step]) => (
    <Slider
      key={key}
      label={label}
      min={min} max={max} step={step}
      value={values[key] ?? min}
      onChange={v => onChange({ ...values, [key]: v })}
    />
  ))
}

export default function RightPanel({
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
      label={defs[key].label}
      min={defs[key].min} max={defs[key].max} step={defs[key].step}
      value={params[key] ?? defs[key].def}
      onChange={v => onParam(key, v)}
    />
  )
  return (
    <aside className="panel panel-right">
      <div className="panel-title">
        <b>{PATTERNS[templateId].name}</b>
        <span className="sp" />
        <button className="hide-btn" title="hide panel (H)" onClick={onHide}>×</button>
      </div>

      <Sec title="Shape" first>
        <div className="row">
          <label>motion</label>
          <select value={motion} onChange={e => onMotion(e.target.value)}>
            <option value="trails">Trails, run in, sweep, run out, loop</option>
            <option value="solid">Solid, colours loop, always lit</option>
            <option value="pulse">Pulse (measured clip)</option>
          </select>
        </div>
        {shapeKeys.map(paramSlider)}
      </Sec>

      {lineKeys.length > 0 && (
        <Sec title="Lines">
          {lineKeys.map(paramSlider)}
        </Sec>
      )}

      <Sec title="Gradient run" defaultOpen={false}>
        <Rows defs={GRAD_DEFS} values={grad} onChange={onGrad} />
      </Sec>

      <Sec title="Timing" defaultOpen={false}>
        <Rows defs={TIMING_DEFS} values={timing} onChange={onTiming} />
        <Slider label="speed" min={0.05} max={3} step={0.01} value={speed} onChange={onSpeed} />
      </Sec>

      <Sec title="Look" defaultOpen={false}>
        <Rows defs={LOOK_DEFS} values={look} onChange={onLook} />
      </Sec>

      <div className="btns">
        <button onClick={onResetParams}>↺ defaults</button>
      </div>
    </aside>
  )
}
