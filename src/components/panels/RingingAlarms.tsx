// Ringing alarm panel (top right). Subscribes to the alarm store; no polling.
import { BellAlertIcon, SpeakerXMarkIcon } from '@heroicons/react/24/solid'
import { formatClock12h } from '../../domain/format.ts'
import { useAlarms } from '../../store/alarms.ts'
import * as act from '../../store/actions.ts'

export function RingingAlarms() {
  const ringing = useAlarms(s => s.ringing)
  if (ringing.length === 0) return null
  return (
    <aside className="alarm-panel glow-box" role="alertdialog" aria-label="Alarm ringing">
      <header className="alarm-panel__header glow-text">
        <BellAlertIcon className="alarm-panel__bell" aria-hidden />
        <span>Alarm</span>
      </header>
      {ringing.map(alarm => (
        <div key={alarm.instantId} className="alarm-card">
          <div className="alarm-card__label">{alarm.label || 'Alarm'}</div>
          <div className="alarm-card__time mono">{formatClock12h(alarm.tsEpochMs)}</div>
          <div className="alarm-card__actions">
            <button type="button" className="alarm-btn alarm-btn--dismiss glow-box" onClick={() => act.dismissAlarm(alarm.instantId)}>Dismiss</button>
            <button type="button" className="alarm-btn alarm-btn--snooze glow-box" onClick={() => act.snoozeAlarm(alarm.instantId, 5)}>Snooze 5m</button>
          </div>
        </div>
      ))}
      <button type="button" className="alarm-btn alarm-btn--silence glow-box" onClick={act.silenceAlarms}>
        <SpeakerXMarkIcon aria-hidden /> Silence
      </button>
    </aside>
  )
}
