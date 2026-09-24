import { useEffect, useRef, useState } from 'react'

export default function LayoutPicker({ value, options, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const current = options.find(o => o.value === value) ?? options[0]

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
    <div className="layout-picker" ref={rootRef}>
      <button
        type="button"
        className={`layout-trigger ${open ? 'open' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <i className={`layout-mini ${current?.preview || current?.value}`} aria-hidden="true" />
        <span>{current?.label}</span>
        <b aria-hidden="true" />
      </button>

      {open ? (
        <div className="layout-menu" role="listbox" aria-label={ariaLabel}>
          <div className="layout-menu-head">{ariaLabel}</div>
          <div className="layout-menu-grid">
            {options.map(option => {
              const active = option.value === value
              return (
                <button
                  type="button"
                  key={option.value}
                  role="option"
                  aria-selected={active}
                  className={active ? 'active' : ''}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <i className={`layout-preview ${option.preview || option.value}`} aria-hidden="true">
                    <span /><span /><span /><span />
                  </i>
                  <span className="layout-option-copy">
                    <b>{option.label}</b>
                    {option.desc ? <small>{option.desc}</small> : null}
                  </span>
                  {active ? <em aria-hidden="true">✓</em> : null}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
