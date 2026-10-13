// How something repeats (domain/series Repeat): Once (when offered), Daily, Weekdays, Weekends,
// chosen days of the week (tap the letters), or every N days. Used by a chip's Repeat tool and
// the Alarm button's picker.
import type { Repeat } from '../../domain/series.ts'
import { EVERY_DAY, WEEKDAYS, WEEKENDS } from '../../domain/series.ts'

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
/** Week order Monday first, as the letters read. */
const WEEK = [1, 2, 3, 4, 5, 6, 0]

const sameDays = (a: readonly number[], b: readonly number[]) => a.length === b.length && b.every(d => a.includes(d))

export function RepeatPicker({ value, onChange, allowOnce = false }: {
  /** null: once (no repeat). */
  value: Repeat | null
  onChange: (r: Repeat | null) => void
  allowOnce?: boolean
}) {
  const days = value?.kind === 'weekly' ? value.days : []
  const preset = (p: readonly number[]) => value?.kind === 'weekly' && sameDays(value.days, p)
  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d]
    onChange(next.length > 0 ? { kind: 'weekly', days: next } : allowOnce ? null : value)
  }
  const every = value?.kind === 'interval' ? value.every : 2
  const chip = (label: string, on: boolean, pick: () => void) => (
    <button type="button" className={`repeat-chip glow-box${on ? ' is-on' : ''}`} aria-pressed={on} onClick={pick}>{label}</button>
  )
  return (
    <div className="repeat-picker" role="group" aria-label="Repeat">
      <div className="repeat-picker__row">
        {allowOnce && chip('Once', value === null, () => onChange(null))}
        {chip('Daily', preset(EVERY_DAY), () => onChange({ kind: 'weekly', days: [...EVERY_DAY] }))}
        {chip('Weekdays', preset(WEEKDAYS), () => onChange({ kind: 'weekly', days: [...WEEKDAYS] }))}
        {chip('Weekends', preset(WEEKENDS), () => onChange({ kind: 'weekly', days: [...WEEKENDS] }))}
      </div>
      <div className="repeat-picker__days">
        {WEEK.map(d => (
          <button key={d} type="button" className={`repeat-day glow-box${days.includes(d) ? ' is-on' : ''}`} aria-pressed={days.includes(d)}
            aria-label={DAY_LABELS[d]} onClick={() => toggleDay(d)}>{LETTERS[d]}</button>
        ))}
      </div>
      <div className="repeat-picker__every">
        {chip('Every', value?.kind === 'interval', () => onChange({ kind: 'interval', every }))}
        <button type="button" className="repeat-step" aria-label="Fewer days" onClick={() => onChange({ kind: 'interval', every: Math.max(2, every - 1) })}>−</button>
        <span className="repeat-every mono" aria-live="polite">{every}</span>
        <button type="button" className="repeat-step" aria-label="More days" onClick={() => onChange({ kind: 'interval', every: Math.min(365, every + 1) })}>+</button>
        <span className="repeat-every__unit">days</span>
      </div>
    </div>
  )
}
