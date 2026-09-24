import { useCallback, useRef } from 'react'

export default function Slider({ label, min, max, step, value, onChange }) {
  const wrapRef = useRef(null)

  const setFromEvent = useCallback((e) => {
    const rect = wrapRef.current.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    let v = min + frac * (max - min)
    v = Math.round(v / step) * step
    onChange(+v.toFixed(4))
  }, [min, max, step, onChange])

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setFromEvent(e)
  }
  const onPointerMove = (e) => {
    if (e.buttons & 1) setFromEvent(e)
  }

  const frac = (value - min) / (max - min || 1)
  const shown = step >= 1 ? Math.round(value) : +value.toFixed(3)

  return (
    <div className="row">
      <label>{label}</label>
      <div
        ref={wrapRef}
        className="pill"
        style={{ '--p': `${(frac * 100).toFixed(2)}%` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
        onKeyDown={(e) => {
          const d = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0
          if (d) onChange(+Math.min(max, Math.max(min, value + d)).toFixed(4))
        }}
      >
        <span className="val">{shown}</span>
      </div>
    </div>
  )
}
