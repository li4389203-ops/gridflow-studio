import { useEffect, useRef, useState } from 'react'

export default function SelectControl({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
  compact = false,
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const current = options.find(o => String(o.value) === String(value)) ?? options[0]

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      className={`select-control ${compact ? 'compact' : ''} ${className}`}
    >
      <button
        type="button"
        className={`select-trigger ${open ? 'open' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <span>{current?.label ?? value}</span>
        <i aria-hidden="true" />
      </button>

      {open ? (
        <div className="select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map(option => {
            const active = String(option.value) === String(value)
            return (
              <button
                type="button"
                role="option"
                aria-selected={active}
                className={active ? 'active' : ''}
                key={String(option.value)}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                <span>{option.label}</span>
                {active ? <b aria-hidden="true">✓</b> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
