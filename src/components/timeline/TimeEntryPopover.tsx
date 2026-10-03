// Time entry popovers: a signed hh:mm:ss duration, or a 12h wall-clock time.
// Rendered inside the chip it edits, so it moves with the timeline.
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

interface FieldsProps {
  values: string[]
  maxes: number[]
  onChange: (index: number, value: string) => void
  onSubmit: () => void
  onCancel: () => void
  labels: string[]
}

function Fields({ values, maxes, onChange, onSubmit, onCancel, labels }: FieldsProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  useEffect(() => {
    refs.current[0]?.focus()
    refs.current[0]?.select()
  }, [])
  const focusField = (i: number) => {
    const el = refs.current[i]
    if (el) { el.focus(); el.select() }
  }
  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    else if (e.key === 'Enter') { e.preventDefault(); onSubmit() }
    else if (e.key === 'Tab' && !e.shiftKey && i < values.length - 1) { e.preventDefault(); focusField(i + 1) }
    else if (e.key === 'Tab' && e.shiftKey && i > 0) { e.preventDefault(); focusField(i - 1) }
    else if (e.key === 'ArrowRight' && i < values.length - 1) focusField(i + 1)
    else if (e.key === 'ArrowLeft' && i > 0) focusField(i - 1)
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const n = (Number.parseInt(values[i] || '0', 10) + (e.key === 'ArrowUp' ? 1 : -1) + maxes[i] + 1) % (maxes[i] + 1)
      onChange(i, n.toString().padStart(2, '0'))
    }
  }
  return (
    <>
      {values.map((val, i) => (
        <span key={i} className="time-entry__group">
          {i > 0 && <span className="time-entry__sep">:</span>}
          <input
            ref={el => { refs.current[i] = el }}
            className="time-entry__field glow-box"
            inputMode="numeric"
            aria-label={labels[i]}
            value={val}
            maxLength={2}
            onChange={e => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 2)
              const clamped = digits === '' ? '' : Math.min(Number.parseInt(digits, 10), maxes[i]).toString()
              onChange(i, digits.length === 2 ? clamped.padStart(2, '0') : clamped)
              if (digits.length === 2 && i < values.length - 1) focusField(i + 1)
            }}
            onKeyDown={onKeyDown(i)}
            onFocus={e => e.target.select()}
          />
        </span>
      ))}
    </>
  )
}

function usePopoverDismiss(ref: React.RefObject<HTMLElement | null>, onCancel: () => void) {
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cancelRef.current()
    }
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') cancelRef.current() }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref])
}

const pad2 = (n: number) => n.toString().padStart(2, '0')
const stopAll = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
  onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(),
  onWheel: (e: React.WheelEvent) => e.stopPropagation(),
}

/** Signed duration editor. `initialMs` seeds the fields; onSubmit gets "[-]hh:mm:ss". */
export function DurationPopover({ initialMs, onSubmit, onCancel, title }: {
  initialMs: number
  onSubmit: (text: string) => void
  onCancel: () => void
  title: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const abs = Math.abs(initialMs)
  const [negative, setNegative] = useState(initialMs < 0)
  const [values, setValues] = useState([
    pad2(Math.min(99, Math.floor(abs / 3_600_000))),
    pad2(Math.floor((abs % 3_600_000) / 60_000)),
    pad2(Math.floor((abs % 60_000) / 1000)),
  ])
  usePopoverDismiss(ref, onCancel)
  const submit = () => onSubmit(`${negative ? '-' : ''}${values.map(v => (v || '0').padStart(2, '0')).join(':')}`)
  return (
    <div ref={ref} className="popover popover--below glow-box" data-no-pan role="dialog" aria-label={title} {...stopAll}>
      <div className="time-entry">
        <button type="button" className={`time-entry__toggle glow-box${negative ? ' is-on' : ''}`} onClick={() => setNegative(n => !n)} aria-label="Toggle sign">
          {negative ? '−' : '+'}
        </button>
        <Fields
          values={values}
          maxes={[99, 59, 59]}
          labels={['Hours', 'Minutes', 'Seconds']}
          onChange={(i, val) => setValues(vs => vs.map((x, j) => (j === i ? val : x)))}
          onSubmit={submit}
          onCancel={onCancel}
        />
      </div>
      <div className="time-entry__actions">
        <button type="button" className="time-entry__btn glow-box" style={{ '--accent': 'var(--ink-faint)' } as React.CSSProperties} onClick={onCancel}>Cancel</button>
        <button type="button" className="time-entry__btn time-entry__btn--primary glow-box" onClick={submit}>OK</button>
      </div>
    </div>
  )
}

/** 12-hour wall-clock editor. */
export function ClockPopover({ initialTs, onSubmit, onCancel }: {
  initialTs: number
  onSubmit: (hour12: number, minutes: number, seconds: number, pm: boolean) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const d = new Date(initialTs)
  const h = d.getHours()
  const [pm, setPm] = useState(h >= 12)
  const [values, setValues] = useState([pad2(h % 12 === 0 ? 12 : h % 12), pad2(d.getMinutes()), pad2(d.getSeconds())])
  usePopoverDismiss(ref, onCancel)
  const submit = () => {
    const [hh, mm, ss] = values.map(v => Number.parseInt(v || '0', 10))
    onSubmit(Math.max(1, Math.min(12, hh || 12)), mm, ss, pm)
  }
  return (
    <div ref={ref} className="popover popover--below glow-box" data-no-pan role="dialog" aria-label="Set cursor time" {...stopAll}>
      <div className="time-entry">
        <Fields
          values={values}
          maxes={[12, 59, 59]}
          labels={['Hour', 'Minutes', 'Seconds']}
          onChange={(i, val) => setValues(vs => vs.map((x, j) => (j === i ? val : x)))}
          onSubmit={submit}
          onCancel={onCancel}
        />
        <button type="button" className={`time-entry__toggle glow-box${pm ? ' is-on' : ''}`} onClick={() => setPm(p => !p)} aria-label="Toggle AM/PM">
          {pm ? 'PM' : 'AM'}
        </button>
      </div>
      <div className="time-entry__actions">
        <button type="button" className="time-entry__btn glow-box" style={{ '--accent': 'var(--ink-faint)' } as React.CSSProperties} onClick={onCancel}>Cancel</button>
        <button type="button" className="time-entry__btn time-entry__btn--primary glow-box" onClick={submit}>OK</button>
      </div>
    </div>
  )
}
