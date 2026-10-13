// The Alarm button (TLC-3), beside Stopwatch and Timer, and its picker (also opened by L). Like
// them it only makes ordinary things: an instant with alarms, or a repeating series.
//
//   NEW ALARM                                             ✕
//   [Wake Up 7:00a · Weekdays] [6:15a · Once]              ← recent: one tap sets it again
//   [  7:00         ]  ( AM | PM )                         ← AM/PM only when ambiguous
//   Tue 7:00a · in 7h 34m                                  ← where it lands, plainly (TLC-7)
//   REPEAT   (Once)(Daily)(Weekdays)(Weekends) / M T W T F S S / Every − 2 + days
//   WARN BEFORE   [5m][15m][30m][1h]                       ← extra bells before it
//   NAME     [ optional ]
//   [            Set alarm · Tue 7:00a            ]
//
// On a wide screen it opens from the button. On a phone (vertical, or a narrow window) it is a
// sheet at the top of what is visible, so the keyboard never pushes it off screen, over a scrim
// that closes it.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BellIcon } from '@heroicons/react/24/solid'
import { XMarkIcon } from '@heroicons/react/20/solid'
import type { RecentAlarm } from '../../domain/alarmPicker.ts'
import { WARN_CHOICES_MS, clockText, hour24, isAmbiguous, nextAt, parseAlarmTime, soonerIsPm, warnText } from '../../domain/alarmPicker.ts'
import type { Repeat } from '../../domain/series.ts'
import { dateKey, describeRepeat, nextOccurrence } from '../../domain/series.ts'
import { formatClockCompact, formatRelativeShort } from '../../domain/format.ts'
import { useLayout } from '../../store/layout.ts'
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
  return nextOccurrence({ id: '', kind: 'series', label: '', time, repeat, alarms: [], from: dateKey(now) }, now)?.ts ?? null
}

const recentText = (r: RecentAlarm) => {
  const [h, m] = r.time.split(':').map(Number)
  return `${r.label ? `${r.label} ` : ''}${formatClockCompact(nextAt(h, m, act.nowTime()), false)} · ${r.repeat ? describeRepeat(r.repeat) : 'Once'}`
}

/** A narrow screen (or the vertical layout, a phone's): the picker is a sheet. */
const useSheet = () => {
  const vertical = useLayout(s => s.orientation === 'vertical')
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return vertical || narrow
}

/** What is visible (the keyboard shrinks it on phones): the sheet sits inside it. */
function useVisibleArea(active: boolean): { top: number; height: number } | null {
  const [area, setArea] = useState<{ top: number; height: number } | null>(null)
  useEffect(() => {
    if (!active) return
    const vv = window.visualViewport
    const update = () => setArea({ top: vv?.offsetTop ?? 0, height: vv?.height ?? window.innerHeight })
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [active])
  return active ? area : null
}

export function AlarmButton({ style }: { style?: CSSProperties }) {
  const open = useUi(s => s.alarmMenuOpen)
  const recent = useQuick(s => s.recentAlarms ?? [])
  const sheet = useSheet()
  const [text, setText] = useState('')
  const [pm, setPm] = useState<boolean | null>(null)
  const [repeat, setRepeat] = useState<Repeat | null>(null)
  const [warnings, setWarnings] = useState<number[]>([])
  const [label, setLabel] = useState('')
  const close = () => { ui.setAlarmMenu(false); setText(''); setPm(null); setRepeat(null); setWarnings([]); setLabel('') }
  const { wrapRef, menuRef, menuStyle, above } = useAnchoredMenu(open && !sheet, close)
  const area = useVisibleArea(open && sheet)

  // The time box takes the keyboard as the picker opens (after it has been placed).
  const timeRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => timeRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])
  // The sheet closes on Escape too (the menu's own hook does it for the menu).
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!open || !sheet) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, sheet])

  const now = act.nowTime()
  const typed = parseAlarmTime(text)
  const ambiguous = !!typed && isAmbiguous(typed)
  const usePm = pm ?? (typed ? soonerIsPm(typed, now) : false)
  const time = typed ? clockText(hour24(typed, usePm), typed.m) : null
  const ring = time ? firstRing(time, repeat, now) : null
  const when = ring !== null ? `${dayFmt.format(ring)} ${formatClockCompact(ring, false)}` : ''

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
  const section = (title: string, body: ReactNode) => (
    <div className="alarm-pick__section">
      <div className="alarm-pick__label">{title}</div>
      {body}
    </div>
  )

  const form = (
    <form className="alarm-pick" onSubmit={set}>
      <header className="alarm-pick__head">
        <span className="alarm-pick__title">New alarm</span>
        <button type="button" className="alarm-pick__close" aria-label="Close" onClick={close}><XMarkIcon aria-hidden /></button>
      </header>
      {recent.length > 0 && (
        <div className="alarm-pick__recent" aria-label="Recent alarms">
          {recent.map(r => (
            <button key={`${r.time}|${r.label}|${JSON.stringify(r.repeat)}|${r.warnings.join()}`} type="button" className="alarm-pick__again glow-box" onClick={() => again(r)}>
              {recentText(r)}
            </button>
          ))}
        </div>
      )}
      <div className="alarm-pick__time">
        <input
          ref={timeRef}
          className={`alarm-pick__input mono${text && !typed ? ' is-invalid' : ''}`}
          aria-label="Time (7, 730, 7:30, 1730, 7p)"
          aria-invalid={!!text && !typed}
          placeholder="7:00"
          value={text}
          onChange={e => { setText(e.target.value); setPm(null) }}
          enterKeyHint="done"
          autoComplete="off"
        />
        <div className={`alarm-pick__ampm${ambiguous ? '' : ' is-idle'}`} role="group" aria-label="AM or PM">
          <button type="button" className={!usePm ? 'is-on' : ''} aria-pressed={ambiguous && !usePm} disabled={!ambiguous} onClick={() => setPm(false)}>AM</button>
          <button type="button" className={usePm ? 'is-on' : ''} aria-pressed={ambiguous && usePm} disabled={!ambiguous} onClick={() => setPm(true)}>PM</button>
        </div>
      </div>
      <div className={`alarm-pick__lands${ring === null ? ' is-hint' : ''}`} aria-live="polite">
        {ring !== null
          ? `${repeat ? `${describeRepeat(repeat)} · first ` : ''}${when} · ${formatRelativeShort(ring - now)}`
          : typed ? 'Never, on these days' : 'Type a time: 7, 730, 7:30, 1730 or 7p'}
      </div>
      {section('Repeat', <RepeatPicker value={repeat} onChange={setRepeat} allowOnce />)}
      {section('Warn before', (
        <div className="alarm-pick__row" role="group" aria-label="Warnings before it">
          {WARN_CHOICES_MS.map(ms => (
            <button key={ms} type="button" className={`repeat-chip glow-box${warnings.includes(ms) ? ' is-on' : ''}`} aria-pressed={warnings.includes(ms)}
              aria-label={`Warn ${warnText(ms)} before`} onClick={() => toggleWarn(ms)}>{warnText(ms)}</button>
          ))}
        </div>
      ))}
      {section('Name', <input className="alarm-pick__name" aria-label="Name (optional)" placeholder="Optional" value={label} onChange={e => setLabel(e.target.value)} autoComplete="off" />)}
      <button type="submit" className="alarm-pick__set glow-box" disabled={ring === null}>
        {ring === null ? 'Set alarm' : `Set alarm · ${when}`}
      </button>
    </form>
  )

  return (
    <div ref={wrapRef} className="ctl-anchor" style={style}>
      <CtlButton icon={BellIcon} className="ctl-btn--quick" label="Set an alarm (L)" aria-expanded={open} aria-haspopup="dialog"
        onClick={() => (open ? close() : ui.setAlarmMenu(true))}>
        Alarm
      </CtlButton>
      {open && !sheet && (
        <div ref={menuRef} className={`menu alarm-menu glow-box${above ? ' menu--above' : ''}`} role="dialog" aria-label="Set an alarm" style={menuStyle}>
          {form}
        </div>
      )}
      {open && sheet && createPortal(
        <div className="alarm-sheet__scrim" onPointerDown={e => { if (e.target === e.currentTarget) close() }}>
          <div className="alarm-sheet glow-box" role="dialog" aria-modal="true" aria-label="Set an alarm"
            style={area ? { top: area.top + 10, maxHeight: area.height - 20 } : undefined}>
            {form}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
