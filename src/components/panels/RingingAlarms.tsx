// Ringing alarm panel (top right). Subscribes to the alarm store; no polling.
// Each ringing alarm is a card:
//   Meeting                                 10:24p
//   in 2:41                                          <- time to its instant, live
//   [ Dismiss ]
//   [ Snooze 5m · 10:26 ]  [ Snooze for _20m_ ]      <- components/panels/SnoozeRow
//   Until start · 10:24   ·   Dismiss all 3
// Snooze 5m shows for a warning only while it still lands before the instant; Until start only
// for a warning (it then takes the quick snooze's place if 5m doesn't fit); Dismiss all only when
// the instant has other alarms to answer. The box beside Snooze takes a length ("10", "1h30"),
// showing where it lands as its submit.
// A chime that just sounded (it needs no answer) is a quieter card of its own with an OK, gone by
// itself after the alarms' "Ring for" time.
//
// A todo's alarm (docs/prd_todos.md §7.1) asks ▶ Start (green, first: it counts from its time
// until its ✓) or ✓ Done (finished already), then the same Snooze row, where Snooze moves the
// todo itself and the box takes a length, a time or "tomorrow" (what Move did: owner,
// 2026-11-22, snooze and delay are one thing), then Ignore (it stops and waits in the Todos tab's
// Now, not started), Unschedule and Won't do, quieter boxes. A todo's chime shows the same card,
// without Ignore (it goes by itself after the Ring for time). A warning before it ("in 10m · get
// ready") asks ▶ Start now (the plan moves to Now and counts) or OK (it rings again at its time)
// instead; Done is a quiet link there. Making an alarm a todo is in its bell's tools, before it
// rings (owner, 2026-11-22: on the card it comes too late).
import { BellAlertIcon, BellIcon, SpeakerXMarkIcon } from '@heroicons/react/24/solid'
import { EyeSlashIcon, PlayIcon } from '@heroicons/react/20/solid'
import { LiveText } from '../../engine/LiveText.tsx'
import { formatClockCompact, formatRelativeShort } from '../../domain/format.ts'
import type { RingingAlarm } from '../../domain/alarms.ts'
import { ringKey } from '../../domain/alarms.ts'
import { displayName } from '../../domain/entities.ts'
import { parseTimerInput } from '../../domain/quickCreate.ts'
import { MINUTE } from '../../domain/time.ts'
import { SNOOZE_MINUTES } from '../../services/AlarmScheduler.ts'
import { useAlarms } from '../../store/alarms.ts'
import { useEntities } from '../../store/entities.ts'
import { getTodoTimes } from '../../store/settings.ts'
import * as act from '../../store/actions.ts'
import { parseWhen } from '../../domain/todos.ts'
import { ALARM_UI, MARKS, TODO_COPY, TODO_UI } from '../../config/labels.ts'
import type { SnoozeQuick, SnoozeTyped } from './SnoozeRow.tsx'
import { SnoozeRow } from './SnoozeRow.tsx'
import { TodoBoxIcon } from '../common/TodoIcons.tsx'
import { doneOrigin } from '../common/doneOrigin.ts'

const clock = (ts: number) => formatClockCompact(ts, false)
const bySecond = (f: { now: number }) => Math.floor(f.now / 1000)

/** The open todo whose `at` an instant is, if any (its alarms get the todo card). */
const useOpenTodoAt = (instantId: string) => useEntities(s => {
  const link = s.instants.find(i => i.id === instantId)?.todo
  return link?.role === 'at' && s.todos?.find(t => t.id === link.id)?.status === 'open' ? link.id : null
})

function AlarmCard({ alarm }: { alarm: RingingAlarm }) {
  // A todo's `at` (still open): its own card.
  const todoId = useOpenTodoAt(alarm.instantId)
  if (todoId) return <TodoCard alarm={alarm} todoId={todoId} />
  return <PlainAlarmCard alarm={alarm} />
}

/** A typed snooze length, as the box reads it ("10" is minutes, "1h30"). */
const typedLength = (now: number) => (text: string): SnoozeTyped | null => {
  const ms = parseTimerInput(text)
  return ms !== null ? { ts: now + ms, kind: 'for' } : null
}

/**
 * A todo's ringing alarm: Start or Done, the Snooze row (the todo itself moves), then Ignore,
 * Unschedule or Won't do. `chime`: its chime sounded (answered already): the same card without Ignore.
 */
function TodoCard({ alarm, todoId, chime = false }: { alarm: RingingAlarm; todoId: string; chime?: boolean }) {
  const key = ringKey(alarm.instantId, alarm.alarmId)
  const inst = useEntities(s => s.instants.find(i => i.id === alarm.instantId))
  const choices = act.ringingChoicesFor(key)
  const ts = inst?.tsEpochMs ?? alarm.tsEpochMs
  const name = displayName(inst?.label, clock(ts))
  const now = act.nowTime()
  // A warning: it isn't time yet ("in 10m · get ready").
  const warning = (inst?.alarms?.find(a => a.id === alarm.alarmId)?.offsetMs ?? 0) > 0
  // At its time, Snooze moves the todo itself (and its box takes a length, a time or "tomorrow");
  // a warning's snoozes are reminders before it (its box, a length).
  const snooze: SnoozeQuick | null = !warning
    ? { text: ALARM_UI.snooze(SNOOZE_MINUTES), at: now + SNOOZE_MINUTES * MINUTE, run: () => act.snoozeTodo(key) }
    : chime ? null
    : choices?.snooze
    ? { text: ALARM_UI.snooze(SNOOZE_MINUTES), at: choices.snooze.ringTs, run: () => act.snoozeAlarm(key, SNOOZE_MINUTES) }
    : choices?.untilStart
      ? { text: ALARM_UI.untilStart, at: choices.untilStart.ringTs, run: () => act.snoozeAlarmUntil(key, choices.untilStart!.ringTs) }
      : null
  const parse = !warning
    ? (text: string): SnoozeTyped | null => {
      const at = parseWhen(text, now, getTodoTimes())
      return at === null ? null : { ts: at, kind: parseTimerInput(text) !== null ? 'for' : 'until' }
    }
    : typedLength(now)
  const onTyped = (at: number) => (!warning ? act.rescheduleTodo(todoId, at) : act.snoozeAlarmUntil(key, at, true))
  // OK on a warning: it rings again at its time (a chime's card just goes).
  const ok = () => (chime ? act.clearChime(key) : act.dismissAlarm(key))

  return (
    <div className="alarm-card alarm-card--todo">
      <div className="alarm-card__head">
        <span className="alarm-card__label"><TodoBoxIcon className="alarm-card__todo" aria-hidden />{name}</span>
        <span className="alarm-card__time mono">{clock(ts)}</span>
      </div>
      <LiveText className="alarm-card__rel" watch={bySecond} compute={f => `${formatRelativeShort(ts - f.now)}${warning && ts > f.now ? ` · ${TODO_COPY.getReady}` : ''}`} />
      <div className="alarm-card__actions">
        {warning ? (
          <>
            <button type="button" className="alarm-btn alarm-btn--start glow-box" onClick={() => act.startTodo(todoId)}
              title={TODO_UI.startNowTitle}><PlayIcon aria-hidden /> {TODO_UI.startNow}</button>
            <button type="button" className="alarm-btn alarm-btn--dismiss glow-box" onClick={ok} title={TODO_UI.okTitle}>{TODO_UI.ok}</button>
          </>
        ) : (
          <>
            <button type="button" className="alarm-btn alarm-btn--start glow-box" onClick={() => act.startTodo(todoId, { fromAlarm: true })}
              title={TODO_UI.startCardTitle}><PlayIcon aria-hidden /> {TODO_UI.start}</button>
            <button type="button" className="alarm-btn alarm-btn--todo-done glow-box" onClick={e => act.completeTodo(todoId, doneOrigin(e.currentTarget, { box: false }))}
              title={TODO_UI.doneAlready}>{MARKS.todoDone} {TODO_UI.done}</button>
          </>
        )}
      </div>
      <SnoozeRow quick={snooze} parse={parse} onTyped={onTyped} />
      <div className="alarm-card__links">
        {warning && <button type="button" className="alarm-link alarm-link--quiet" onClick={() => act.doneTodo(todoId)}>{MARKS.todoDone} {TODO_UI.doneAlready}</button>}
        {!warning && !chime && (
          <button type="button" className="alarm-link alarm-link--wont glow-box" onClick={() => act.dismissAlarm(key)} title={TODO_UI.ignoreTitle}>
            <EyeSlashIcon aria-hidden /> {TODO_UI.ignore}
          </button>
        )}
        {!warning && <button type="button" className="alarm-link glow-box" onClick={() => act.backToList(todoId)}>{TODO_UI.unschedule}</button>}
        <button type="button" className="alarm-link alarm-link--wont glow-box" onClick={() => act.wontDoTodo(todoId)}>{TODO_UI.wontDo}</button>
      </div>
    </div>
  )
}

function PlainAlarmCard({ alarm }: { alarm: RingingAlarm }) {
  const key = ringKey(alarm.instantId, alarm.alarmId)
  const inst = useEntities(s => s.instants.find(i => i.id === alarm.instantId))
  const choices = act.ringingChoicesFor(key)
  const ts = inst?.tsEpochMs ?? alarm.tsEpochMs
  const name = displayName(inst?.label, clock(ts))
  const now = act.nowTime()
  // A typed length is taken as said: no landing on the instant (where it lands is the box's submit).
  const parse = (text: string): SnoozeTyped | null => {
    const typed = typedLength(now)(text)
    const landing = typed ? act.snoozeLandingFor(key, typed.ts, true) : null
    return typed && landing ? { ts: landing.ringTs, kind: 'for' } : null
  }
  const quick: SnoozeQuick | null = choices?.snooze
    ? { text: ALARM_UI.snooze(SNOOZE_MINUTES), at: choices.snooze.ringTs, run: () => act.snoozeAlarm(key, SNOOZE_MINUTES) }
    : choices?.untilStart
      ? { text: ALARM_UI.untilStart, at: choices.untilStart.ringTs, run: () => act.snoozeAlarmUntil(key, choices.untilStart!.ringTs) }
      : null
  const untilStartLink = choices?.snooze && choices.untilStart ? choices.untilStart : null
  const links = !!untilStartLink || (!!choices && choices.others > 0)

  return (
    <div className="alarm-card">
      <div className="alarm-card__head">
        <span className="alarm-card__label">{name}</span>
        <span className="alarm-card__time mono">{clock(ts)}</span>
      </div>
      <LiveText className="alarm-card__rel" watch={bySecond} compute={f => formatRelativeShort(ts - f.now)} />
      <div className="alarm-card__actions">
        <button type="button" className="alarm-btn alarm-btn--dismiss glow-box" onClick={() => act.dismissAlarm(key)}>{ALARM_UI.dismiss}</button>
      </div>
      <SnoozeRow quick={quick} parse={parse} onTyped={at => act.snoozeAlarmUntil(key, at, true)} />
      {links && (
        <div className="alarm-card__links">
          {untilStartLink && (
            <button type="button" className="alarm-link glow-box" onClick={() => act.snoozeAlarmUntil(key, untilStartLink.ringTs)}>
              {ALARM_UI.untilStart} <span className="alarm-link__at">{clock(untilStartLink.ringTs)}</span>
            </button>
          )}
          {choices && choices.others > 0 && (
            <button type="button" className="alarm-link alarm-link--all glow-box" onClick={() => act.cancelAlarms(alarm.instantId)} title={ALARM_UI.dismissAllTitle}>
              {ALARM_UI.dismissAll(choices.others + 1)}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** A chime that sounded: its name and time, how long ago, and OK. */
function ChimeCard({ chime }: { chime: RingingAlarm }) {
  // A todo's chime: its full card (Start, Done, Snooze, Later, Won't do).
  const todoId = useOpenTodoAt(chime.instantId)
  if (todoId) return <TodoCard alarm={chime} todoId={todoId} chime />
  return <PlainChimeCard chime={chime} />
}

function PlainChimeCard({ chime }: { chime: RingingAlarm }) {
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
  const muted = useAlarms(s => s.muted)
  if (ringing.length === 0 && chimes.length === 0) return null
  const ringingNow = ringing.length > 0
  return (
    <aside className={`alarm-panel glow-box${ringingNow ? '' : ' is-chime'}${muted ? ' is-muted' : ''}`} role={ringingNow ? 'alertdialog' : 'status'} aria-label={ringingNow ? 'Alarm ringing' : 'Chime'}>
      <header className="alarm-panel__header glow-text">
        {ringingNow ? <BellAlertIcon className="alarm-panel__bell" aria-hidden /> : <BellIcon className="alarm-panel__bell" aria-hidden />}
        <span>{ringingNow ? 'Alarm' : 'Chime'}</span>
        {/* Mute every ringing alarm (in the Android app, its sound and vibration): the cards stay, to answer. */}
        {ringingNow && (
          <button type="button" className={`alarm-panel__mute glow-box${muted ? ' is-on' : ''}`} aria-pressed={muted}
            aria-label={muted ? 'Muted (until another alarm rings)' : ALARM_UI.mute} title={muted ? 'Muted until another alarm rings; answer them below' : 'Mute: the alarms stay here to answer'}
            onClick={act.silenceAlarms} disabled={muted}>
            <SpeakerXMarkIcon aria-hidden />
          </button>
        )}
      </header>
      {ringing.map(alarm => <AlarmCard key={ringKey(alarm.instantId, alarm.alarmId)} alarm={alarm} />)}
      {chimes.map(c => <ChimeCard key={ringKey(c.instantId, c.alarmId)} chime={c} />)}
    </aside>
  )
}
