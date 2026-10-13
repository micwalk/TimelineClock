// Ringing alarm panel (top right). Subscribes to the alarm store; no polling.
// Each alarm: Dismiss, Snooze (5m, or 10m / 15m / a typed length), and for a warning before its
// instant, "Skip the rest" (its other warnings; the alarm at the instant stays). A warning's
// snooze never lands past its instant: the buttons say where they land ("Until 9:00").
import { useState } from 'react'
import { BellAlertIcon, SpeakerXMarkIcon } from '@heroicons/react/24/solid'
import { formatClock12h, formatClockCompact } from '../../domain/format.ts'
import type { RingingAlarm } from '../../domain/alarms.ts'
import { ringKey } from '../../domain/alarms.ts'
import { MINUTE } from '../../domain/time.ts'
import { entities } from '../../store/entities.ts'
import { useAlarms } from '../../store/alarms.ts'
import * as act from '../../store/actions.ts'
import { TimeEntry } from '../timeline/TimeEntryPopover.tsx'

/** Snooze lengths offered; 5 minutes is the big button. */
const SNOOZE_CHOICES = [5, 10, 15]

/** The snooze choices for an alarm: each length and where it lands, keeping only those that land apart ("Until 9:00" once). */
function snoozeChoices(key: string, now: number): { minutes: number; text: string }[] {
  const seen = new Set<number>()
  return SNOOZE_CHOICES.flatMap(minutes => {
    const landing = act.snoozeLandingFor(key, now + minutes * MINUTE)
    if (!landing || seen.has(landing.ringTs)) return []
    seen.add(landing.ringTs)
    const capped = landing.ringTs < now + minutes * MINUTE
    return [{ minutes, text: capped ? `Until ${formatClockCompact(landing.ringTs, false)}` : `${minutes}m` }]
  })
}

function AlarmCard({ alarm }: { alarm: RingingAlarm }) {
  const key = ringKey(alarm.instantId, alarm.alarmId)
  const [typing, setTyping] = useState(false)
  const record = entities.getInstant(alarm.instantId)?.alarms?.find(a => a.id === alarm.alarmId)
  const warning = !!record && record.offsetMs > 0
  const [first, ...more] = snoozeChoices(key, act.nowTime())
  return (
    <div className="alarm-card">
      <div className="alarm-card__label">{alarm.label || 'Alarm'}</div>
      <div className="alarm-card__time mono">{formatClock12h(alarm.tsEpochMs)}</div>
      <div className="alarm-card__actions">
        <button type="button" className="alarm-btn alarm-btn--dismiss glow-box" onClick={() => act.dismissAlarm(key)}>Dismiss</button>
        {first && (
          <button type="button" className="alarm-btn alarm-btn--snooze glow-box" onClick={() => act.snoozeAlarm(key, first.minutes)}>
            Snooze {first.text}
          </button>
        )}
      </div>
      <div className="alarm-card__more">
        {more.map(c => (
          <button key={c.minutes} type="button" className="alarm-chip glow-box" onClick={() => act.snoozeAlarm(key, c.minutes)}>{c.text}</button>
        ))}
        <button type="button" className="alarm-chip glow-box" aria-label="Snooze for a typed length" onClick={() => setTyping(true)}>…</button>
        {warning && (
          <button type="button" className="alarm-chip alarm-chip--skip glow-box" onClick={() => act.skipAlarms(alarm.instantId, 'warnings')}
            title="Skip this and its other warnings; the alarm at the instant still rings">
            Skip the rest
          </button>
        )}
      </div>
      {typing && (
        <TimeEntry
          title="Snooze for"
          className="alarm-card__entry"
          offset={{ initialMs: 5 * MINUTE, from: 'Now', unsigned: true, onSubmit: ms => { act.snoozeAlarmUntil(key, act.nowTime() + Math.max(MINUTE / 60, ms)); setTyping(false) } }}
          onCancel={() => setTyping(false)}
        />
      )}
    </div>
  )
}

export function RingingAlarms() {
  const ringing = useAlarms(s => s.ringing)
  if (ringing.length === 0) return null
  return (
    <aside className="alarm-panel glow-box" role="alertdialog" aria-label="Alarm ringing">
      <header className="alarm-panel__header glow-text">
        <BellAlertIcon className="alarm-panel__bell" aria-hidden />
        <span>Alarm</span>
      </header>
      {ringing.map(alarm => <AlarmCard key={ringKey(alarm.instantId, alarm.alarmId)} alarm={alarm} />)}
      <button type="button" className="alarm-btn alarm-btn--silence glow-box" onClick={act.silenceAlarms}>
        <SpeakerXMarkIcon aria-hidden /> Silence
      </button>
    </aside>
  )
}
