// Ringing alarm panel (top right). Subscribes to the alarm store; no polling.
// Each ringing alarm is a card:
//   Meeting                                 10:24p
//   in 2:41                                          ← time to its instant, live
//   [ Dismiss ]  [ Snooze 5m · 10:26 ]
//   Until start · 10:24   ·   Other…   ·   Dismiss all 3
// Snooze 5m shows for a warning only while it still lands before the instant; Until start only
// for a warning (it then takes the big button's place if 5m doesn't fit); Dismiss all only when
// the instant has other alarms to answer. Other… turns that row into a box to type a length
// ("10", "1h30"), in place, with the keyboard up and where it lands shown as you type.
import { useRef, useState } from 'react'
import { BellAlertIcon, SpeakerXMarkIcon } from '@heroicons/react/24/solid'
import { PencilIcon } from '@heroicons/react/20/solid'
import { LiveText } from '../../engine/LiveText.tsx'
import { formatClockCompact, formatRelativeShort } from '../../domain/format.ts'
import type { RingingAlarm } from '../../domain/alarms.ts'
import { ringKey } from '../../domain/alarms.ts'
import { displayName } from '../../domain/entities.ts'
import { parseTimerInput } from '../../domain/quickCreate.ts'
import { useAlarms } from '../../store/alarms.ts'
import { useEntities } from '../../store/entities.ts'
import * as act from '../../store/actions.ts'

const clock = (ts: number) => formatClockCompact(ts, false)
const bySecond = (f: { now: number }) => Math.floor(f.now / 1000)

function AlarmCard({ alarm }: { alarm: RingingAlarm }) {
  const key = ringKey(alarm.instantId, alarm.alarmId)
  // Re-render when the instant changes (renamed, other alarms answered).
  const inst = useEntities(s => s.instants.find(i => i.id === alarm.instantId))
  const choices = act.ringingChoicesFor(key)
  const [custom, setCustom] = useState(false)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const ts = inst?.tsEpochMs ?? alarm.tsEpochMs
  const name = displayName(inst?.label, clock(ts))

  const typedMs = parseTimerInput(text)
  // A typed length is taken as said: no landing on the instant.
  const typedLanding = typedMs !== null ? act.snoozeLandingFor(key, act.nowTime() + typedMs, true) : null
  const submitCustom = () => {
    if (typedMs === null) return
    act.snoozeAlarmUntil(key, act.nowTime() + typedMs, true)
  }
  const openCustom = () => {
    setCustom(true)
    // Focus in the tap itself, so phones bring the keyboard up.
    inputRef.current?.focus()
  }
  const closeCustom = () => { setCustom(false); setText('') }

  const big = choices?.snooze
    ? { text: 'Snooze 5m', at: choices.snooze.ringTs, run: () => act.snoozeAlarm(key, 5) }
    : choices?.untilStart
      ? { text: 'Until start', at: choices.untilStart.ringTs, run: () => act.snoozeAlarmUntil(key, choices.untilStart!.ringTs) }
      : null
  const untilStartLink = choices?.snooze && choices.untilStart ? choices.untilStart : null

  return (
    <div className="alarm-card">
      <div className="alarm-card__head">
        <span className="alarm-card__label">{name}</span>
        <span className="alarm-card__time mono">{clock(ts)}</span>
      </div>
      <LiveText className="alarm-card__rel" watch={bySecond} compute={f => formatRelativeShort(ts - f.now)} />
      <div className="alarm-card__actions">
        <button type="button" className="alarm-btn alarm-btn--dismiss glow-box" onClick={() => act.dismissAlarm(key)}>Dismiss</button>
        {big && (
          <button type="button" className="alarm-btn alarm-btn--snooze glow-box" onClick={big.run}>
            {big.text} <span className="alarm-btn__at">· {clock(big.at)}</span>
          </button>
        )}
      </div>
      <div className={`alarm-card__more${custom ? ' is-custom' : ''}`}>
        <div className="alarm-card__links" aria-hidden={custom}>
          {untilStartLink && (
            <button type="button" className="alarm-link" tabIndex={custom ? -1 : 0} onClick={() => act.snoozeAlarmUntil(key, untilStartLink.ringTs)}>
              Until start <span className="alarm-link__at">{clock(untilStartLink.ringTs)}</span>
            </button>
          )}
          <button type="button" className="alarm-other" tabIndex={custom ? -1 : 0} onClick={openCustom} aria-label="Snooze for another length">
            <span>Other…</span><PencilIcon aria-hidden />
          </button>
          {choices && choices.others > 0 && (
            <button type="button" className="alarm-link alarm-link--all" tabIndex={custom ? -1 : 0} onClick={() => act.cancelAlarms(alarm.instantId, 'all')}
              title="Dismiss this and cancel the instant's other alarms">
              Dismiss all {choices.others + 1}
            </button>
          )}
        </div>
        <form className="alarm-card__custom" aria-hidden={!custom} onSubmit={e => { e.preventDefault(); submitCustom() }}>
          <input
            ref={inputRef}
            className="alarm-custom__input mono"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') closeCustom() }}
            onBlur={() => { if (!text) closeCustom() }}
            placeholder="Snooze for… 10, 25m, 1h30"
            aria-label="Snooze for (minutes, or like 1h30)"
            aria-invalid={text !== '' && typedMs === null}
            enterKeyHint="done"
            autoComplete="off"
            tabIndex={custom ? 0 : -1}
          />
          <span className="alarm-custom__at mono" aria-live="polite">{typedLanding ? `→ ${clock(typedLanding.ringTs)}` : ''}</span>
          <button type="submit" className="alarm-link alarm-link--go" disabled={typedMs === null} tabIndex={custom ? 0 : -1}>Snooze</button>
        </form>
      </div>
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
