// The Alarm button (TLC-3), beside Stopwatch and Timer, and its picker (also opened by L). Like
// them it only makes ordinary things: an instant with alarms, or a repeating series.
//
//   NEW ALARM                                             ✕
//   [Wake Up 7:00a · Weekdays] [6:15a · Once]              ← recent: one tap fills the form in from it
//   [  7:00         ]  ( AM | PM )                         ← AM/PM only when ambiguous
//   (Sunrise)(Sunset)                                      ← with a location (Settings › Sky); or type "sunset"
//   Tue 7:00a · in 7h 34m                                  ← where it lands, plainly (TLC-7)
//   REPEAT   (Once)(Daily)(Weekdays)(Weekends) / M T W T F S S / Every − 2 + days
//   RINGS    [On time][−5m][−15m][−30m][−1h][other]        ← at the time and/or before it; "20" in
//                                                            other adds a −20m (and a fresh box)
//   NAME     [ optional ]
//   [            Set alarm · Tue 7:00a            ]
//
// On a wide screen it opens from the button. On a phone (vertical, or a narrow window), or opened
// from the Alarms tab, it is a sheet at the top of what is visible, so the keyboard never pushes
// it off screen, over a scrim that closes it. From the Alarms tab it also edits a series: filled
// in from it, saved with updateSeries (its untouched occurrences ahead follow), with Pause /
// Resume and End series.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BellIcon } from '@heroicons/react/24/solid'
import { XMarkIcon } from '@heroicons/react/20/solid'
import type { RecentAlarm } from '../../domain/alarmPicker.ts'
import { clockText, hour24, isAmbiguous, nextAt, parseAlarmTime, parseSunWord, parseWarning, pickerOffsets, soonerIsPm, warnText } from '../../domain/alarmPicker.ts'
import type { Repeat } from '../../domain/series.ts'
import { clockKey, dateKey, describeRepeat, nextOccurrence } from '../../domain/series.ts'
import type { GeoPoint, SunEvent } from '../../domain/sun.ts'
import { SUN_EVENTS, nextSunEvent, sunEventName } from '../../domain/sun.ts'
import { formatClockCompact, formatRelativeShort } from '../../domain/format.ts'
import { useLayout } from '../../store/layout.ts'
import { useQuick } from '../../store/quick.ts'
import { useSettings } from '../../store/settings.ts'
import { useEntities } from '../../store/entities.ts'
import { ui, useUi } from '../../store/ui.ts'
import * as act from '../../store/actions.ts'
import { useAnchoredMenu } from '../../hooks/useAnchoredMenu.ts'
import { RepeatPicker } from '../common/RepeatPicker.tsx'
import { CtlButton } from './CtlButton.tsx'

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

/**
 * When an alarm at `time` ("HH:MM"), or at sunrise/sunset at `sun.loc`, first rings: the next
 * time today or tomorrow (the next sunset), or the series' next occurrence.
 */
function firstRing(time: string, repeat: Repeat | null, now: number, sun: { event: SunEvent; loc: GeoPoint } | null = null): number | null {
  const anchor = sun ? { event: sun.event, lat: sun.loc.lat, lon: sun.loc.lon } : undefined
  if (!repeat) {
    if (anchor) return nextSunEvent(now, anchor, anchor.event)
    const [h, m] = time.split(':').map(Number)
    return nextAt(h, m, now)
  }
  return nextOccurrence({ id: '', kind: 'series', label: '', time, repeat, alarms: [], from: dateKey(now), ...(anchor ? { sun: anchor } : {}) }, now)?.ts ?? null
}

const recentText = (r: RecentAlarm) => {
  const [h, m] = r.time.split(':').map(Number)
  const when = r.sun ? sunEventName(r.sun) : formatClockCompact(nextAt(h, m, act.nowTime()), false)
  return `${r.label ? `${r.label} ` : ''}${when} · ${r.repeat ? describeRepeat(r.repeat) : 'Once'}`
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
  const fromList = useUi(s => s.alarmMenuFromList)
  const editId = useUi(s => s.alarmEditSeries)
  const editing = useEntities(s => (editId ? s.groups?.find(g => g.id === editId) : undefined))
  const recent = useQuick(s => s.recentAlarms ?? [])
  const ringDefaults = useSettings(s => s.alarmRings)
  const loc = useSettings(s => s.skyLocation)
  const sheet = useSheet() || fromList
  const [text, setText] = useState('')
  const [pm, setPm] = useState<boolean | null>(null)
  const [repeat, setRepeat] = useState<Repeat | null>(null)
  const [warnings, setWarnings] = useState<number[]>([])
  /** Whether it rings at the time itself (else only its warnings do). */
  const [onTime, setOnTime] = useState(true)
  /** Warning lengths typed in "other" (they stay as choices while the picker is open). */
  const [extras, setExtras] = useState<number[]>([])
  const [other, setOther] = useState('')
  const [label, setLabel] = useState('')
  const seeded = useRef<string | null>(null)
  const close = () => {
    ui.setAlarmMenu(false); setText(''); setPm(null); setRepeat(null); setWarnings([]); setOnTime(true); setExtras([]); setOther(''); setLabel('')
    seeded.current = null
  }
  /** Fills the form in: a series being edited, or a recent alarm. */
  const fill = (a: { time: string; repeat: Repeat | null; warnings: number[]; onTime: boolean; label: string; sun?: SunEvent }) => {
    const [h, m] = a.time.split(':').map(Number)
    setText(a.sun ? sunEventName(a.sun) : `${h % 12 || 12}:${String(m).padStart(2, '0')}`)
    setPm(h >= 12)
    setRepeat(a.repeat)
    setWarnings(a.warnings)
    setExtras(a.warnings)
    setOnTime(a.onTime)
    setLabel(a.label)
  }
  // Start from what is being edited, else from the defaults (Settings > Alarms), once per opening.
  const seedKey = editing?.id ?? 'new'
  if (open && seeded.current !== seedKey) {
    seeded.current = seedKey
    if (editing) {
      fill({ ...editing, warnings: editing.alarms.filter(o => o > 0), onTime: editing.alarms.includes(0), sun: editing.sun?.event })
    } else {
      setWarnings(ringDefaults.warnings)
      setOnTime(ringDefaults.onTime)
    }
  }
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
  const sunWord = parseSunWord(text)
  // A sun time needs to know where (Settings › Sky); editing a sun series keeps its own place.
  const sunLoc = sunWord ? (loc ?? editing?.sun ?? null) : null
  const sun = sunWord && sunLoc ? { event: sunWord, loc: sunLoc } : null
  const typed = sunWord ? null : parseAlarmTime(text)
  const ambiguous = !!typed && isAmbiguous(typed)
  const usePm = pm ?? (typed ? soonerIsPm(typed, now) : false)
  const sunRing = sun ? firstRing('00:00', repeat, now, sun) : null
  const time = typed ? clockText(hour24(typed, usePm), typed.m) : sunRing !== null ? clockKey(sunRing) : null
  const ring = sun ? sunRing : time ? firstRing(time, repeat, now) : null
  const when = ring !== null ? `${dayFmt.format(ring)} ${formatClockCompact(ring, false)}` : ''
  const otherMs = parseWarning(other)
  // A length still in "other" counts as picked (Set may be tapped without leaving the box).
  const allWarnings = otherMs !== null && !warnings.includes(otherMs) ? [...warnings, otherMs] : warnings
  const rings = pickerOffsets(allWarnings, onTime)

  const set = (e?: FormEvent) => {
    e?.preventDefault()
    // A repeat may have no alarm (made with the ⟳ tool); a new alarm must ring.
    if (!time || ring === null || (!editing && rings.length === 0)) return
    const anchor = sun ? { event: sun.event, lat: sun.loc.lat, lon: sun.loc.lon } : undefined
    if (editing) act.updateSeries(editing.id, { label: label.trim(), time, repeat: repeat ?? editing.repeat, alarms: rings, sun: anchor })
    else act.setAlarm({ time, at: ring, repeat, warnings: allWarnings, label: label.trim(), onTime, ...(sun ? { sun: sun.event } : {}) })
    close()
  }
  /** A recent alarm fills the form in (nothing is set until Set): change what you like first. */
  const again = (r: RecentAlarm) => {
    fill({ ...r, onTime: r.onTime !== false })
    timeRef.current?.focus()
  }
  const toggleWarn = (ms: number) => setWarnings(w => (w.includes(ms) ? w.filter(x => x !== ms) : [...w, ms]))
  /** "Other": the typed length becomes a picked choice of its own, and the box is free for another. */
  const addOther = () => {
    if (otherMs === null) return
    setExtras(x => (x.includes(otherMs) ? x : [...x, otherMs]))
    setWarnings(w => (w.includes(otherMs) ? w : [...w, otherMs]))
    setOther('')
  }
  const section = (title: string, body: ReactNode) => (
    <div className="alarm-pick__section">
      <div className="alarm-pick__label">{title}</div>
      {body}
    </div>
  )

  const form = (
    <form className="alarm-pick" onSubmit={set}>
      <header className="alarm-pick__head">
        <span className="alarm-pick__title">{editing ? (editing.alarms.length > 0 ? 'Edit alarm' : 'Edit repeat') : 'New alarm'}</span>
        <button type="button" className="alarm-pick__close" aria-label="Close" onClick={close}><XMarkIcon aria-hidden /></button>
      </header>
      {!editing && recent.length > 0 && (
        <div className="alarm-pick__recent" aria-label="Recent alarms (fill the form in)">
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
          className={`alarm-pick__input mono${text && !typed && !sunWord ? ' is-invalid' : ''}`}
          aria-label="Time (7, 730, 7:30, 1730, 7p, or sunrise / sunset)"
          aria-invalid={!!text && !typed && !sunWord}
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
      {(loc || sunWord) && (
        <div className="alarm-pick__row alarm-pick__sun" role="group" aria-label="At sunrise or sunset">
          {SUN_EVENTS.map(e => (
            <button key={e} type="button" className={`repeat-chip glow-box${sunWord === e ? ' is-on' : ''}`} aria-pressed={sunWord === e}
              onClick={() => { setText(sunWord === e ? '' : sunEventName(e)); setPm(null) }}>{sunEventName(e)}</button>
          ))}
        </div>
      )}
      <div className={`alarm-pick__lands${ring === null ? ' is-hint' : ''}`} aria-live="polite">
        {ring !== null
          ? `${repeat ? `${describeRepeat(repeat)} · first ` : ''}${when} · ${formatRelativeShort(ring - now)}`
          : sunWord && !sunLoc ? 'Set your location in Settings › Sky for sunrise and sunset'
          : typed || sunWord ? 'Never, on these days' : 'Type a time: 7, 730, 7:30, 1730 or 7p'}
      </div>
      {/* Editing a series it always repeats (no Once); otherwise Once is null. */}
      {section('Repeat', <RepeatPicker value={repeat} onChange={r => setRepeat(editing ? r ?? repeat : r)} allowOnce={!editing} />)}
      {section('Rings', (
        <div className="alarm-pick__row" role="group" aria-label="When it rings">
          <button type="button" className={`repeat-chip glow-box${onTime ? ' is-on' : ''}`} aria-pressed={onTime}
            aria-label="Ring at the time" onClick={() => setOnTime(o => !o)}>On time</button>
          {[...new Set([...ringDefaults.choices, ...extras, ...warnings])].sort((a, b) => a - b).map(ms => (
            <button key={ms} type="button" className={`repeat-chip glow-box${warnings.includes(ms) ? ' is-on' : ''}`} aria-pressed={warnings.includes(ms)}
              aria-label={`Warn ${warnText(ms)} before`} onClick={() => toggleWarn(ms)}>−{warnText(ms)}</button>
          ))}
          <input className={`repeat-chip alarm-pick__other mono${other && otherMs === null ? ' is-invalid' : ''}`} aria-label="Another warning: how long before (20, 1h30)"
            aria-invalid={!!other && otherMs === null} placeholder="other" value={other} onChange={e => setOther(e.target.value)} onBlur={addOther}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOther() } }} enterKeyHint="done" autoComplete="off" />
        </div>
      ))}
      {section('Name', <input className="alarm-pick__name" aria-label="Name (optional)" placeholder="Optional" value={label} onChange={e => setLabel(e.target.value)} autoComplete="off" />)}
      <button type="submit" className="alarm-pick__set glow-box" disabled={ring === null || (!editing && rings.length === 0)}>
        {editing
          ? (ring === null || !time ? 'Save' : `Save · ${describeRepeat(repeat ?? editing.repeat)} ${sun ? sunEventName(sun.event).toLowerCase() : formatClockCompact(ring, false)}`)
          : ring === null ? 'Set alarm' : rings.length === 0 ? 'Pick when it rings' : `Set alarm · ${when}`}
      </button>
      {editing && (
        <div className="alarm-pick__manage">
          <button type="button" className="alarm-link glow-box" onClick={() => { act.setSeriesPaused(editing.id, !editing.paused); close() }}>
            {editing.paused ? 'Resume' : 'Pause'}
          </button>
          <button type="button" className="alarm-link alarm-link--all glow-box" onClick={() => { act.endSeries(editing.id); close() }}>End series</button>
        </div>
      )}
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
