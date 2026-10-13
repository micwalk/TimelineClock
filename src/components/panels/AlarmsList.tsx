// The Agenda's Alarms tab (TLC-3): every alarm, like a clock app's list (domain/alarmList).
//   Repeating: a series per row: time, name, how it repeats, its warnings, the next ring, and a
//              switch that pauses it.
//   Upcoming:  one-off alarms, soonest first, each with a button that cancels them.
//   Recent:    what rang in the last day and how it was answered.
// A row goes to its instant on the timeline.
import { useMemo } from 'react'
import { BellSlashIcon, PencilIcon, PlusIcon } from '@heroicons/react/20/solid'
import { useFrameValue } from '../../engine/hooks.ts'
import { LiveText } from '../../engine/LiveText.tsx'
import { alarmList } from '../../domain/alarmList.ts'
import { describeRepeat, occurrenceTs } from '../../domain/series.ts'
import { endpointName } from '../../domain/spans.ts'
import { formatClockCompact, formatDuration, formatRelativeShort } from '../../domain/format.ts'
import { displayName } from '../../domain/entities.ts'
import { useEntities } from '../../store/entities.ts'
import { useLayout } from '../../store/layout.ts'
import { ui } from '../../store/ui.ts'
import * as act from '../../store/actions.ts'
import { IconButton } from '../common/IconButton.tsx'

/** A row that goes somewhere: in the drawer, close it so the result is not hidden behind it. */
function go(instantId: string | null | undefined) {
  if (!instantId) return
  act.revealInstant(instantId)
  if (useLayout.getState().agendaPlacement === 'drawer') ui.closeAgenda()
}

const bySecond = (f: { now: number }) => Math.floor(f.now / 1000)
const byMinute = (f: { now: number }) => Math.floor(f.now / 60_000)
const warningsText = (offsets: readonly number[]) => {
  const w = offsets.filter(o => o > 0).sort((a, b) => a - b)
  return w.length > 0 ? `warns ${w.map(o => formatDuration(o, { exact: true })).join(', ')} before` : ''
}

export function AlarmsList() {
  const instants = useEntities(s => s.instants)
  const groups = useEntities(s => s.groups ?? [])
  // The lists change as alarms come due; a minute is fine-grained enough (times are live below).
  const minute = useFrameValue(byMinute)
  const list = useMemo(() => alarmList(instants, groups, minute * 60_000), [instants, groups, minute])
  const empty = list.repeating.length === 0 && list.upcoming.length === 0 && list.recent.length === 0

  const newAlarm = (
    <button type="button" className="alarms-new glow-box" onClick={() => ui.openAlarmEditor(null)}>
      <PlusIcon aria-hidden /> New alarm
    </button>
  )
  if (empty) {
    return (
      <div className="alarms-list">
        {newAlarm}
        <p className="alarms-empty">No alarms yet. Set one here, with the <b>Alarm</b> button (L), or with the bell on any instant.</p>
      </div>
    )
  }
  return (
    <div className="alarms-list">
      {newAlarm}
      {list.repeating.length > 0 && <h3 className="alarms-list__head">Repeating</h3>}
      {list.repeating.map(({ series, next, nextRing }) => (
        <div key={series.id} className={`alarm-row glow-box${series.paused ? ' is-paused' : ''}`} role="button" tabIndex={0}
          onClick={() => go(next?.id)} onKeyDown={e => { if (e.key === 'Enter') go(next?.id) }}>
          <span className="alarm-row__time mono">{formatClockCompact(occurrenceTs(series, series.from), false)}</span>
          <span className="alarm-row__main">
            <span className="alarm-row__name">{displayName(series.label, 'Alarm')}</span>
            <span className="alarm-row__sub">{[describeRepeat(series.repeat), warningsText(series.alarms)].filter(Boolean).join(' · ')}</span>
          </span>
          <span className="alarm-row__when">
            {series.paused ? 'Paused' : nextRing !== null ? <LiveText watch={bySecond} compute={f => formatRelativeShort(nextRing - f.now)} /> : '—'}
          </span>
          <IconButton icon={PencilIcon} label={`Edit ${displayName(series.label, 'alarm')}`} color="var(--c-alarm)" bare
            onClick={() => ui.openAlarmEditor(series.id)} />
          <button type="button" role="switch" aria-checked={!series.paused} aria-label={series.paused ? `Turn ${series.label || 'alarm'} on` : `Pause ${series.label || 'alarm'}`}
            className={`alarm-switch${series.paused ? '' : ' is-on'}`}
            onClick={e => { e.stopPropagation(); act.setSeriesPaused(series.id, !series.paused) }}>
            <span className="alarm-switch__knob" />
          </button>
        </div>
      ))}

      {list.upcoming.length > 0 && <h3 className="alarms-list__head">Upcoming</h3>}
      {list.upcoming.map(({ inst, nextRing, count }) => (
        <div key={inst.id} className="alarm-row glow-box" role="button" tabIndex={0}
          onClick={() => go(inst.id)} onKeyDown={e => { if (e.key === 'Enter') go(inst.id) }}>
          <span className="alarm-row__time mono">{formatClockCompact(inst.tsEpochMs, false)}</span>
          <span className="alarm-row__main">
            <span className="alarm-row__name">{endpointName(inst)}</span>
            <span className="alarm-row__sub">{[count > 1 ? `${count} alarms` : '', warningsText((inst.alarms ?? []).filter(a => !a.answered).map(a => a.offsetMs))].filter(Boolean).join(' · ')}</span>
          </span>
          <span className="alarm-row__when"><LiveText watch={bySecond} compute={f => formatRelativeShort(nextRing - f.now)} /></span>
          <IconButton icon={BellSlashIcon} label={`Cancel ${count > 1 ? `${count} alarms` : 'alarm'} for ${endpointName(inst)}`} color="var(--c-alarm)" bare
            onClick={() => act.cancelAlarms(inst.id, 'all')} />
        </div>
      ))}

      {list.recent.length > 0 && <h3 className="alarms-list__head">Recent</h3>}
      {list.recent.map(({ inst, alarm, ringTs, answered }) => (
        <div key={`${inst.id}|${alarm.id}`} className="alarm-row alarm-row--past glow-box" role="button" tabIndex={0}
          onClick={() => go(inst.id)} onKeyDown={e => { if (e.key === 'Enter') go(inst.id) }}>
          <span className="alarm-row__time mono">{formatClockCompact(ringTs, false)}</span>
          <span className="alarm-row__main">
            <span className="alarm-row__name">{endpointName(inst)}</span>
            <span className="alarm-row__sub">{answered === 'snoozed' ? 'Snoozed' : 'Dismissed'}</span>
          </span>
          <span className="alarm-row__when"><LiveText watch={bySecond} compute={f => formatRelativeShort(ringTs - f.now)} /></span>
          <span />
        </div>
      ))}
    </div>
  )
}
