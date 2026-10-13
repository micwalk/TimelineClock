// The Alarm button (TLC-3), beside Stopwatch and Timer, and its picker (also opened by L). Like
// them it only makes ordinary things: an instant with alarms, or a repeating series.
//
//   Recent  [7:00a Wake up · Weekdays] [6:15a · Once]           ← one tap sets it again
//   Time    [ 7      ]  (AM)(PM)                                 ← AM/PM only when ambiguous
//           Tue 7:00 AM · in 7h 34m                              ← where it lands, plainly (TLC-7)
//   Repeat  (Once)(Daily)(Weekdays)(Weekends) / M T W T F S S / Every − 2 + days
//   Warn    [5m][15m][30m][1h]                                   ← extra bells before it
//   Name    [ optional ]
//                                                    [ Set alarm ]
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { BellIcon } from '@heroicons/react/24/solid'
import type { RecentAlarm } from '../../domain/alarmPicker.ts'
import { WARN_CHOICES_MS, clockText, hour24, isAmbiguous, nextAt, parseAlarmTime, soonerIsPm, warnText } from '../../domain/alarmPicker.ts'
import type { Repeat } from '../../domain/series.ts'
import { describeRepeat, nextOccurrence } from '../../domain/series.ts'
import { formatClockCompact, formatRelativeShort } from '../../domain/format.ts'
import { useQuick } from '../../store/quick.ts'
import { ui, useUi } from '../../store/ui.ts'
import * as act from '../../store/actions.ts'
import { useAnchoredMenu } from '../../hooks/useAnchoredMenu.ts'
import { RepeatPicker } from '../common/RepeatPicker.tsx'
import { CtlButton } from './CtlButton.tsx'

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

/** When an alarm at `time` ("HH:MM") first rings: the next time today or tomorrow, or the series' next occurrence. */
function firstRing(time: string, repeat: Repeat | null, now: number): number | null {
  const [h, m] = time.split(':').map(Number)
  if (!repeat) return nextAt(h, m, now)
  const d = new Date(now)
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return nextOccurrence({ id: '', kind: 'series', label: '', time, repeat, alarms: [], from }, now)?.ts ?? null
}

const recentText = (r: RecentAlarm) => `${formatClockCompact(firstRing(r.time, null, act.nowTime()) ?? 0, false)}${r.label ? ` ${r.label}` : ''} · ${r.repeat ? describeRepeat(r.repeat) : 'Once'}`

export function AlarmButton({ style }: { style?: CSSProperties }) {
  const open = useUi(s => s.alarmMenuOpen)
  const recent = useQuick(s => s.recentAlarms ?? [])
  const [text, setText] = useState('')
  const [pm, setPm] = useState<boolean | null>(null)
  const [repeat, setRepeat] = useState<Repeat | null>(null)
  const [warnings, setWarnings] = useState<number[]>([])
  const [label, setLabel] = useState('')
  const close = () => { ui.setAlarmMenu(false); setText(''); setPm(null); setRepeat(null); setWarnings([]); setLabel('') }
  const { wrapRef, menuRef, menuStyle, above } = useAnchoredMenu(open, close)
  // The time box takes the keyboard as the picker opens (after the menu has been placed).
  const timeRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => timeRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  const now = act.nowTime()
  const typed = parseAlarmTime(text)
  const ambiguous = !!typed && isAmbiguous(typed)
  const usePm = pm ?? (typed ? soonerIsPm(typed, now) : false)
  const time = typed ? clockText(hour24(typed, usePm), typed.m) : null
  const ring = time ? firstRing(time, repeat, now) : null

  const set = (e?: FormEvent) => {
    e?.preventDefault()
    if (!time || ring === null) return
    act.setAlarm({ time, at: ring, repeat, warnings, label: label.trim() })
    close()
  }
  const again = (r: RecentAlarm) => {
    const at = firstRing(r.time, r.repeat, act.nowTime())
    if (at === null) return
    act.setAlarm({ ...r, at })
    close()
  }
  const toggleWarn = (ms: number) => setWarnings(w => (w.includes(ms) ? w.filter(x => x !== ms) : [...w, ms]))

  return (
    <div ref={wrapRef} className="ctl-anchor" style={style}>
      <CtlButton icon={BellIcon} className="ctl-btn--quick" label="Set an alarm (L)" aria-expanded={open} aria-haspopup="dialog"
        onClick={() => (open ? close() : ui.setAlarmMenu(true))}>
        Alarm
      </CtlButton>
      {open && (
        <div ref={menuRef} className={`menu alarm-menu glow-box${above ? ' menu--above' : ''}`} role="dialog" aria-label="Set an alarm" style={menuStyle}>
        <form className="alarm-menu__form" onSubmit={set}>
          {recent.length > 0 && (
            <div className="alarm-menu__recent">
              {recent.map(r => (
                <button key={`${r.time}|${r.label}|${JSON.stringify(r.repeat)}`} type="button" className="alarm-menu__again glow-box" onClick={() => again(r)}>
                  {recentText(r)}
                </button>
              ))}
            </div>
          )}
          <div className="alarm-menu__time">
            <input
              ref={timeRef}
              className={`alarm-menu__input mono${text && !typed ? ' is-invalid' : ''}`}
              aria-label="Time (7, 730, 7:30, 1730, 7p)"
              aria-invalid={!!text && !typed}
              placeholder="7:00"
              value={text}
              onChange={e => { setText(e.target.value); setPm(null) }}
              onKeyDown={e => { if (e.key === 'Escape') close() }}
              enterKeyHint="done"
              autoComplete="off"
            />
            {ambiguous && (
              <div className="alarm-menu__ampm" role="group" aria-label="AM or PM">
                <button type="button" className={`repeat-chip glow-box${!usePm ? ' is-on' : ''}`} aria-pressed={!usePm} onClick={() => setPm(false)}>AM</button>
                <button type="button" className={`repeat-chip glow-box${usePm ? ' is-on' : ''}`} aria-pressed={usePm} onClick={() => setPm(true)}>PM</button>
              </div>
            )}
          </div>
          <div className="alarm-menu__lands" aria-live="polite">
            {ring !== null
              ? `${repeat ? `${describeRepeat(repeat)} · first ` : ''}${dayFmt.format(ring)} ${formatClockCompact(ring, false)} · ${formatRelativeShort(ring - now)}`
              : typed ? 'Never, on these days' : 'Type a time: 7, 730, 7:30, 1730, 7p'}
          </div>
          <RepeatPicker value={repeat} onChange={setRepeat} allowOnce />
          <div className="alarm-menu__warn" role="group" aria-label="Warnings before it">
            <span className="alarm-menu__key">Warn</span>
            {WARN_CHOICES_MS.map(ms => (
              <button key={ms} type="button" className={`repeat-chip glow-box${warnings.includes(ms) ? ' is-on' : ''}`} aria-pressed={warnings.includes(ms)}
                aria-label={`Warn ${warnText(ms)} before`} onClick={() => toggleWarn(ms)}>{warnText(ms)}</button>
            ))}
          </div>
          <input className="alarm-menu__name" aria-label="Name (optional)" placeholder="Name (optional)" value={label} onChange={e => setLabel(e.target.value)} autoComplete="off" />
          <button type="submit" className="alarm-menu__set glow-box" disabled={ring === null}>Set alarm</button>
        </form>
        </div>
      )}
    </div>
  )
}
