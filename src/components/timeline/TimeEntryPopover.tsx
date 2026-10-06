// Time entry popovers: one hh:mm:ss box you type digits into (filling from the right; a clock
// time starts with the hour; see domain/timeDigits), as a clock time, an offset, or either
// with a switch between them.
// Rendered inside the tag or chip it edits, so it moves with the timeline.
import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss.ts'
import type { DigitMode, TimeParts } from '../../domain/timeDigits.ts'
import { cleanDigits, clockFromParts, digitDisplay, digitsToParts, msToParts, partsDisplay, partsToMs } from '../../domain/timeDigits.ts'
import { formatDurationForInput } from '../../domain/format.ts'

const UNITS = ['h', 'm', 's'] as const

/**
 * The hh:mm:ss box. Shows `initial` until the first digit is typed; then typed digits fill
 * from the right and the untyped places stay dim. A real (invisible) input on top takes the
 * keys, so phones bring up the number pad.
 */
function DigitField({ digits, mode, onDigits, initial, label, invalid, onSubmit, onCancel }: {
  digits: string
  mode: DigitMode
  onDigits: (digits: string) => void
  initial: TimeParts
  label: string
  invalid: boolean
  onSubmit: () => void
  onCancel: () => void
}) {
  const [focused, setFocused] = useState(false)
  const shown = digits ? digitDisplay(digits, mode) : partsDisplay(initial)
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    else if (e.key === 'Enter') { e.preventDefault(); onSubmit() }
  }
  return (
    <label className={`time-digits glow-box${focused ? ' is-focused' : ''}${digits ? '' : ' is-initial'}${invalid ? ' is-invalid' : ''}`}>
      <input
        className="time-digits__input"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        aria-label={`${label} (hh:mm:ss; type digits, e.g. ${mode === 'clock' ? '9 for 9:00, ' : ''}930 for 9:30)`}
        aria-invalid={invalid}
        value={digits}
        onChange={e => onDigits(cleanDigits(e.target.value))}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <span className="time-digits__display" aria-hidden>
        {UNITS.map((unit, pair) => (
          <span key={unit} className="time-digits__group">
            {pair > 0 && <span className="time-digits__sep">:</span>}
            <span className="time-digits__pair">
              <span className="time-digits__num">
                {[0, 1].map(k => {
                  const i = pair * 2 + k
                  return <span key={k} className={shown.typed[i] ? 'is-typed' : ''}>{shown.chars[i]}</span>
                })}
              </span>
              <span className="time-digits__unit">{unit}</span>
            </span>
          </span>
        ))}
        {focused && <span className="time-digits__caret" />}
      </span>
    </label>
  )
}

const stopAll = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
  onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(),
  onWheel: (e: React.WheelEvent) => e.stopPropagation(),
}

/** 12-hour parts of a timestamp. */
function clockParts(ts: number): { parts: TimeParts; pm: boolean } {
  const d = new Date(ts)
  const h = d.getHours()
  return { parts: { h: h % 12 === 0 ? 12 : h % 12, m: d.getMinutes(), s: d.getSeconds() }, pm: h >= 12 }
}

type Mode = 'clock' | 'offset'

export interface TimeEntryProps {
  title: string
  /** A wall-clock time; `onSubmit` gets 24-hour parts. */
  clock?: { initialTs: number; onSubmit: (t: TimeParts) => void }
  /** A signed offset from `from` ("Now", an instant's name); `unsigned`: a length, with no before/after switch. */
  offset?: { initialMs: number; from: string; unsigned?: boolean; onSubmit: (ms: number) => void }
  initialMode?: Mode
  onCancel: () => void
  className?: string
}

/** The popover: one or both modes (with a Time / From … switch when both are given). */
export function TimeEntry({ title, clock, offset, initialMode, onCancel, className }: TimeEntryProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<Mode>(initialMode ?? (clock ? 'clock' : 'offset'))
  const [digits, setDigits] = useState('')
  const [invalid, setInvalid] = useState(false)
  const startClock = clock ? clockParts(clock.initialTs) : null
  const [pm, setPm] = useState(startClock?.pm ?? false)
  const [negative, setNegative] = useState((offset?.initialMs ?? 0) < 0)
  usePopoverDismiss(ref, onCancel)

  const initial = mode === 'clock' && startClock ? startClock.parts : msToParts(offset?.initialMs ?? 0)
  const switchTo = (m: Mode) => { setMode(m); setDigits(''); setInvalid(false) }
  const submit = () => {
    const parts = digits ? digitsToParts(digits, mode === 'clock' ? 'clock' : 'duration') : initial
    if (mode === 'clock' && clock) {
      const t = clockFromParts(parts, pm)
      if (!t) { setInvalid(true); return }
      clock.onSubmit(t)
    } else if (offset) {
      offset.onSubmit((negative ? -1 : 1) * partsToMs(parts))
    }
  }

  return (
    <div ref={ref} className={`popover popover--below time-entry-pop glow-box${className ? ` ${className}` : ''}`} data-no-pan role="dialog" aria-label={title} {...stopAll}>
      {clock && offset && (
        <div className="time-entry__modes" role="tablist" aria-label="Enter as">
          <button type="button" role="tab" aria-selected={mode === 'clock'} className={`time-entry__mode${mode === 'clock' ? ' is-on' : ''}`} onClick={() => switchTo('clock')}>Time</button>
          <button type="button" role="tab" aria-selected={mode === 'offset'} className={`time-entry__mode${mode === 'offset' ? ' is-on' : ''}`} onClick={() => switchTo('offset')}>From {offset.from}</button>
        </div>
      )}
      <div className="time-entry">
        {mode === 'offset' && !offset?.unsigned && (
          <button type="button" className={`time-entry__toggle glow-box${negative ? ' is-on' : ''}`} onClick={() => setNegative(n => !n)}
            aria-label={negative ? `Before ${offset?.from} (tap for after)` : `After ${offset?.from} (tap for before)`}>
            {negative ? '−' : '+'}
          </button>
        )}
        <DigitField
          key={mode}
          digits={digits}
          mode={mode === 'clock' ? 'clock' : 'duration'}
          onDigits={d => { setDigits(d); setInvalid(false) }}
          initial={initial}
          label={mode === 'clock' ? 'Time' : offset?.unsigned ? 'Length' : `Offset from ${offset?.from}`}
          invalid={invalid}
          onSubmit={submit}
          onCancel={onCancel}
        />
        {mode === 'clock' && (
          <button type="button" className={`time-entry__toggle glow-box${pm ? ' is-on' : ''}`} onClick={() => setPm(p => !p)} aria-label="Toggle AM/PM">
            {pm ? 'PM' : 'AM'}
          </button>
        )}
      </div>
      <p className="time-entry__hint">
        {mode === 'clock' ? '9 → 9:00 · 930 → 9:30 · 1730 → 5:30 PM · 6 digits add seconds' : '13 → 13 min · 130 → 1h 30m · 6 digits add seconds'}
      </p>
      <div className="time-entry__actions">
        <button type="button" className="time-entry__btn glow-box" style={{ '--accent': 'var(--ink-faint)' } as React.CSSProperties} onClick={onCancel}>Cancel</button>
        <button type="button" className="time-entry__btn time-entry__btn--primary glow-box" onClick={submit}>OK</button>
      </div>
    </div>
  )
}

/** The longest offset the hh:mm:ss text form takes ("90" minutes typed as hours carries past 99h otherwise). */
const MAX_OFFSET_MS = partsToMs({ h: 99, m: 59, s: 59 })

/** Signed duration editor. `initialMs` seeds the field; onSubmit gets "[-]hh:mm:ss". */
export function DurationPopover({ initialMs, onSubmit, onCancel, title, from = 'Now' }: {
  initialMs: number
  onSubmit: (text: string) => void
  onCancel: () => void
  title: string
  from?: string
}) {
  return <TimeEntry title={title} offset={{ initialMs, from, onSubmit: ms => onSubmit(formatDurationForInput(Math.sign(ms) * Math.min(Math.abs(ms), MAX_OFFSET_MS))) }} onCancel={onCancel} />
}

/** Wall-clock editor; onSubmit gets 12-hour parts. */
export function ClockPopover({ initialTs, onSubmit, onCancel }: {
  initialTs: number
  onSubmit: (hour12: number, minutes: number, seconds: number, pm: boolean) => void
  onCancel: () => void
}) {
  return (
    <TimeEntry
      title="Set cursor time"
      clock={{ initialTs, onSubmit: t => onSubmit(t.h % 12 === 0 ? 12 : t.h % 12, t.m, t.s, t.h >= 12) }}
      onCancel={onCancel}
    />
  )
}
