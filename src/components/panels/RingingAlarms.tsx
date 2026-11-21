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
// A chime that just sounded (it needs no answer) is a quieter card of its own with an OK, gone by
// itself after the alarms' "Ring for" time.
//
// A todo's alarm (docs/prd_todos.md §7.1) asks Done or Dismiss, big, side by side (finished
// already, or "on it / not yet", which starts it counting), then Snooze 5m and Later… (In 1h ·
// Tonight · Tomorrow · Back to the list · Other…, typed), then a quiet Won't do. Snooze is "remind
// me again"; Later is "the plan changed" (the instant moves).
import { useRef, useState } from 'react'
import { BellAlertIcon, BellIcon, SpeakerXMarkIcon } from '@heroicons/react/24/solid'
import { PencilIcon } from '@heroicons/react/20/solid'
import { LiveText } from '../../engine/LiveText.tsx'
import { formatClockCompact, formatRelativeShort } from '../../domain/format.ts'
import type { RingingAlarm } from '../../domain/alarms.ts'
import { ringKey } from '../../domain/alarms.ts'
import { displayName } from '../../domain/entities.ts'
import { parseTimerInput } from '../../domain/quickCreate.ts'
import { useAlarms } from '../../store/alarms.ts'
import { useEntities } from '../../store/entities.ts'
import { getTodoTimes } from '../../store/settings.ts'
import * as act from '../../store/actions.ts'
import { parseWhen, quickChoices } from '../../domain/todos.ts'
import { MARKS } from '../../config/labels.ts'

const clock = (ts: number) => formatClockCompact(ts, false)
const bySecond = (f: { now: number }) => Math.floor(f.now / 1000)

function AlarmCard({ alarm }: { alarm: RingingAlarm }) {
  // Re-render when the instant changes (renamed, other alarms answered).
  const inst = useEntities(s => s.instants.find(i => i.id === alarm.instantId))
  // A todo's `at` (still open): its own card.
  const todoId = useEntities(s => {
    const link = inst?.todo?.role === 'at' ? inst.todo : undefined
    return link && s.todos?.find(t => t.id === link.id)?.status === 'open' ? link.id : null
  })
  if (todoId) return <TodoCard alarm={alarm} todoId={todoId} />
  return <PlainAlarmCard alarm={alarm} />
}

/** A todo's ringing alarm: Done or Dismiss, Snooze or Later, Won't do. */
function TodoCard({ alarm, todoId }: { alarm: RingingAlarm; todoId: string }) {
  const key = ringKey(alarm.instantId, alarm.alarmId)
  const inst = useEntities(s => s.instants.find(i => i.id === alarm.instantId))
  const choices = act.ringingChoicesFor(key)
  const [mode, setMode] = useState<'more' | 'later'>('more')
  const [custom, setCustom] = useState(false)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const ts = inst?.tsEpochMs ?? alarm.tsEpochMs
  const name = displayName(inst?.label, clock(ts))
  const now = act.nowTime()
  const times = getTodoTimes()
  // Later offers what Snooze doesn't: further off.
  const later = quickChoices(now, times).filter(c => c.key !== 'in15')
  const typedAt = parseWhen(text, now, times)
  const snooze = choices?.snooze
    ? { text: 'Snooze 5m', at: choices.snooze.ringTs, run: () => act.snoozeAlarm(key, 5) }
    : choices?.untilStart
      ? { text: 'Until start', at: choices.untilStart.ringTs, run: () => act.snoozeAlarmUntil(key, choices.untilStart!.ringTs) }
      : null
  const openCustom = () => {
    setCustom(true)
    // Focus in the tap itself, so phones bring the keyboard up.
    inputRef.current?.focus()
  }
  const closeCustom = () => { setCustom(false); setText('') }
  const off = (on: boolean) => (on ? 0 : -1)

  return (
    <div className="alarm-card alarm-card--todo">
      <div className="alarm-card__head">
        <span className="alarm-card__label"><span className="alarm-card__todo" aria-hidden>{MARKS.todoOpen}</span>{name}</span>
        <span className="alarm-card__time mono">{clock(ts)}</span>
      </div>
      <LiveText className="alarm-card__rel" watch={bySecond} compute={f => formatRelativeShort(ts - f.now)} />
      <div className="alarm-card__actions">
        <button type="button" className="alarm-btn alarm-btn--done glow-box" onClick={() => act.doneTodo(todoId)}>{MARKS.todoDone} Done</button>
        <button type="button" className="alarm-btn alarm-btn--dismiss glow-box" onClick={() => act.dismissAlarm(key)}
          title="On it, or not yet: it counts on the timeline until you tap ✓">Dismiss</button>
      </div>
      <div className="alarm-card__actions alarm-card__actions--second">
        {snooze && (
          <button type="button" className="alarm-btn alarm-btn--snooze glow-box" onClick={snooze.run}>
            {snooze.text} <span className="alarm-btn__at">· {clock(snooze.at)}</span>
          </button>
        )}
        <button type="button" className={`alarm-btn alarm-btn--later glow-box${mode === 'later' ? ' is-open' : ''}`} aria-expanded={mode === 'later'}
          onClick={() => { setMode(m => (m === 'later' ? 'more' : 'later')); closeCustom() }}>Later…</button>
      </div>
      <div className={`alarm-card__more${custom ? ' is-custom' : ''}`}>
        <div className="alarm-card__links" aria-hidden={custom}>
          {mode === 'later' ? (
            <>
              {later.map(c => (
                <button key={c.key} type="button" className="alarm-link glow-box" tabIndex={off(!custom)} onClick={() => act.laterTodo(todoId, c.ts)}>
                  {c.label} <span className="alarm-link__at">{clock(c.ts)}</span>
                </button>
              ))}
              <button type="button" className="alarm-link glow-box" tabIndex={off(!custom)} onClick={() => act.backToList(todoId)}>Back to the list</button>
              <button type="button" className="alarm-other" tabIndex={off(!custom)} onClick={openCustom} aria-label="Later: type when">
                <span>Other…</span><PencilIcon aria-hidden />
              </button>
            </>
          ) : (
            <button type="button" className="alarm-link alarm-link--quiet" tabIndex={off(!custom)} onClick={() => act.wontDoTodo(todoId)}>Won't do</button>
          )}
        </div>
        <form className="alarm-card__custom" aria-hidden={!custom} onSubmit={e => { e.preventDefault(); if (typedAt !== null) act.laterTodo(todoId, typedAt) }}>
          <input
            ref={inputRef}
            className="alarm-custom__input mono"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') closeCustom() }}
            onBlur={() => { if (!text) closeCustom() }}
            placeholder="When… 3p, 1h30, tomorrow"
            aria-label="Later: when (a time, a length from now, or tomorrow)"
            aria-invalid={text !== '' && typedAt === null}
            enterKeyHint="done"
            autoComplete="off"
            tabIndex={off(custom)}
          />
          <span className="alarm-custom__at mono" aria-live="polite">{typedAt !== null ? `→ ${clock(typedAt)}` : ''}</span>
          <button type="submit" className="alarm-link alarm-link--go glow-box" disabled={typedAt === null} tabIndex={off(custom)}>Later</button>
        </form>
      </div>
    </div>
  )
}

function PlainAlarmCard({ alarm }: { alarm: RingingAlarm }) {
  const key = ringKey(alarm.instantId, alarm.alarmId)
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
            <button type="button" className="alarm-link glow-box" tabIndex={custom ? -1 : 0} onClick={() => act.snoozeAlarmUntil(key, untilStartLink.ringTs)}>
              Until start <span className="alarm-link__at">{clock(untilStartLink.ringTs)}</span>
            </button>
          )}
          <button type="button" className="alarm-other" tabIndex={custom ? -1 : 0} onClick={openCustom} aria-label="Snooze for another length">
            <span>Other…</span><PencilIcon aria-hidden />
          </button>
          {choices && choices.others > 0 && (
            <button type="button" className="alarm-link alarm-link--all glow-box" tabIndex={custom ? -1 : 0} onClick={() => act.cancelAlarms(alarm.instantId)}
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
          <button type="submit" className="alarm-link alarm-link--go glow-box" disabled={typedMs === null} tabIndex={custom ? 0 : -1}>Snooze</button>
        </form>
      </div>
    </div>
  )
}

/** A chime that sounded: its name and time, how long ago, and OK. */
function ChimeCard({ chime }: { chime: RingingAlarm }) {
  const key = ringKey(chime.instantId, chime.alarmId)
  const inst = useEntities(s => s.instants.find(i => i.id === chime.instantId))
  const ts = inst?.tsEpochMs ?? chime.tsEpochMs
  return (
    <div className="alarm-card alarm-card--chime">
      <div className="alarm-card__head">
        <span className="alarm-card__label">{displayName(inst?.label, clock(ts))}</span>
        <span className="alarm-card__time mono">{clock(ts)}</span>
      </div>
      <div className="alarm-card__chime-row">
        <LiveText className="alarm-card__rel" watch={bySecond} compute={f => formatRelativeShort(ts - f.now)} />
        <button type="button" className="alarm-link alarm-link--ok glow-box" onClick={() => act.clearChime(key)}>OK</button>
      </div>
    </div>
  )
}

export function RingingAlarms() {
  const ringing = useAlarms(s => s.ringing)
  const chimes = useAlarms(s => s.chimes)
  if (ringing.length === 0 && chimes.length === 0) return null
  const ringingNow = ringing.length > 0
  return (
    <aside className={`alarm-panel glow-box${ringingNow ? '' : ' is-chime'}`} role={ringingNow ? 'alertdialog' : 'status'} aria-label={ringingNow ? 'Alarm ringing' : 'Chime'}>
      <header className="alarm-panel__header glow-text">
        {ringingNow ? <BellAlertIcon className="alarm-panel__bell" aria-hidden /> : <BellIcon className="alarm-panel__bell" aria-hidden />}
        <span>{ringingNow ? 'Alarm' : 'Chime'}</span>
      </header>
      {ringing.map(alarm => <AlarmCard key={ringKey(alarm.instantId, alarm.alarmId)} alarm={alarm} />)}
      {chimes.map(c => <ChimeCard key={ringKey(c.instantId, c.alarmId)} chime={c} />)}
      {ringingNow && (
        <button type="button" className="alarm-btn alarm-btn--silence glow-box" onClick={act.silenceAlarms}>
          <SpeakerXMarkIcon aria-hidden /> Silence
        </button>
      )}
    </aside>
  )
}
