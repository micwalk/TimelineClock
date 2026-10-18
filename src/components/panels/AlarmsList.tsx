// The Agenda's Alarms tab (TLC-3): every alarm, like a clock app's list (domain/alarmList).
//   Repeating: a series per row: time, name, how it repeats, its warnings, the next ring, and a
//              switch that pauses it.
//   Upcoming:  one-off alarms, soonest first, each with a button that cancels them.
//   Recent:    what rang in the last day and how it was answered.
// A row goes to its instant on the timeline. The Groups tab (RepeatsList) lists sunrise and sunset
// (#11; their switches show or hide them on the timeline), the Unnamed group, then every series,
// alarms or not, with the same rows; each has an adjust button that opens its zoom strip (#10:
// chips, gathered or hidden by zoom).
import { MARKS } from '../../config/labels.ts'
import { useMemo } from 'react'
import { AdjustmentsHorizontalIcon, BellSlashIcon, PencilIcon, PlusIcon, SunIcon } from '@heroicons/react/20/solid'
import { ZoomStrip } from './ZoomStrip.tsx'
import { SUN_GROUP, UNNAMED_GROUP, describeDisplay, displayFor, displayGroupOf } from '../../domain/displayGroups.ts'
import { useUi } from '../../store/ui.ts'
import { useFrameValue } from '../../engine/hooks.ts'
import { LiveText } from '../../engine/LiveText.tsx'
import { alarmList, repeatList } from '../../domain/alarmList.ts'
import type { SeriesRecord } from '../../domain/series.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import { describeRepeat, occurrenceTs } from '../../domain/series.ts'
import type { SunEvent } from '../../domain/sun.ts'
import { SUN_EVENTS, nextSunEvent, sunEventName } from '../../domain/sun.ts'
import { settings, useSettings } from '../../store/settings.ts'
import { endpointName } from '../../domain/spans.ts'
import { formatClockCompact, formatDuration, formatRelativeShort } from '../../domain/format.ts'
import { displayName, storedInstants } from '../../domain/entities.ts'
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
  return w.length > 0 ? `${offsets.includes(0) ? 'warns' : 'only warns'} ${w.map(o => formatDuration(o, { exact: true })).join(', ')} before` : ''
}

export function AlarmsList() {
  const instants = storedInstants(useEntities(s => s.instants))
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
      {list.repeating.map(({ series, next, nextRing }) => <SeriesRow key={series.id} series={series} next={next} when={nextRing} />)}

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
            onClick={() => act.cancelAlarms(inst.id)} />
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

/** The Groups tab's adjust button: opens (or closes) the row's zoom strip, shown under the row. */
function AdjustButton({ rowKey, name }: { rowKey: string; name: string }) {
  const open = useUi(s => s.groupOpen === rowKey)
  return (
    <IconButton icon={AdjustmentsHorizontalIcon} label={`How ${name} shows by zoom`} color="var(--ink-dim)" bare pressed={open}
      onClick={() => ui.setGroupOpen(open ? null : rowKey)} />
  )
}

/** The row's zoom strip, when its adjust button opened it. */
function StripIfOpen({ rowKey, groupKey }: { rowKey: string; groupKey: string }) {
  const open = useUi(s => s.groupOpen === rowKey)
  return open ? <ZoomStrip groupKey={groupKey} /> : null
}

/** A series: its time, name, how it repeats, its warnings, when next (`when`), edit, and a pause switch (and in the Groups tab, its zoom strip). */
function SeriesRow({ series, next, when, groups = false }: { series: SeriesRecord; next: InstantRecord | null; when: number | null; groups?: boolean }) {
  const name = displayName(series.label, series.alarms.length > 0 ? 'Alarm' : 'Repeat')
  return (
    <div className={`alarm-row glow-box${series.paused ? ' is-paused' : ''}`} role="button" tabIndex={0}
      onClick={() => go(next?.id)} onKeyDown={e => { if (e.key === 'Enter') go(next?.id) }}>
      <span className="alarm-row__time mono">{series.sun ? sunEventName(series.sun.event) : formatClockCompact(occurrenceTs(series, series.from), false)}</span>
      <span className="alarm-row__main">
        <span className="alarm-row__name">{name}</span>
        <span className="alarm-row__sub">{[describeRepeat(series.repeat), series.alarms.length > 0 ? warningsText(series.alarms) : 'no alarm'].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="alarm-row__when">
        {series.paused ? 'Paused' : when !== null ? <LiveText watch={bySecond} compute={f => formatRelativeShort(when - f.now)} /> : '—'}
      </span>
      <span className="alarm-row__tools" onClick={e => e.stopPropagation()}>
        {groups && <AdjustButton rowKey={series.id} name={name} />}
        <IconButton icon={PencilIcon} label={`Edit ${name}`} color="var(--c-alarm)" bare
          onClick={() => ui.openAlarmEditor(series.id)} />
      </span>
      <button type="button" role="switch" aria-checked={!series.paused} aria-label={series.paused ? `Turn ${name} on` : `Pause ${name}`}
        className={`alarm-switch${series.paused ? '' : ' is-on'}`}
        onClick={e => { e.stopPropagation(); act.setSeriesPaused(series.id, !series.paused) }}>
        <span className="alarm-switch__knob" />
      </button>
    </div>
  )
}

/** The Agenda's Repeats tab: every repeating series, alarms or not. */
export function RepeatsList() {
  const instants = storedInstants(useEntities(s => s.instants))
  const groups = useEntities(s => s.groups ?? [])
  const minute = useFrameValue(byMinute)
  const rows = useMemo(() => repeatList(instants, groups, minute * 60_000), [instants, groups, minute])
  return (
    <div className="alarms-list">
      <SunRows minute={minute} />
      <UnnamedRow instants={instants} />
      {rows.length === 0
        ? <p className="alarms-empty">Nothing repeats yet. Select any instant and use its <b>{MARKS.repeat}</b> tool, or set a repeating alarm with the <b>Alarm</b> button (L).</p>
        : rows.map(({ series, next }) => (
          <div key={series.id} className="group-row">
            <SeriesRow series={series} next={next} when={next?.tsEpochMs ?? null} groups />
            <StripIfOpen rowKey={series.id} groupKey={series.id} />
          </div>
        ))}
    </div>
  )
}

/** The Unnamed group (#10): instants with no name (most of a busy history), gathered when zoomed out. */
function UnnamedRow({ instants }: { instants: readonly InstantRecord[] }) {
  const count = useMemo(() => instants.filter(i => displayGroupOf(i) === UNNAMED_GROUP).length, [instants])
  const groupDisplay = useSettings(s => s.groupDisplay)
  const display = displayFor(UNNAMED_GROUP, groupDisplay)
  return (
    <div className="group-row">
      <div className="alarm-row alarm-row--unnamed glow-box" onClick={() => ui.setGroupOpen(useUi.getState().groupOpen === UNNAMED_GROUP ? null : UNNAMED_GROUP)}>
        <span className="alarm-row__time mono">{count}</span>
        <span className="alarm-row__main">
          <span className="alarm-row__name">{MARKS.unnamed} Unnamed</span>
          <span className="alarm-row__sub">{describeDisplay(display)}</span>
        </span>
        <span />
        <span className="alarm-row__tools" onClick={e => e.stopPropagation()}><AdjustButton rowKey={UNNAMED_GROUP} name="unnamed instants" /></span>
        <span />
      </div>
      <StripIfOpen rowKey={UNNAMED_GROUP} groupKey={UNNAMED_GROUP} />
    </div>
  )
}

/**
 * Sunrise and sunset (#11): they repeat every day by themselves. Each row's switch shows or hides
 * its chips on the timeline; a tap goes to the next one. Without a location, one row says where to set it.
 */
function SunRows({ minute }: { minute: number }) {
  const loc = useSettings(s => s.skyLocation)
  const shown = useSettings(s => s.sunEvents)
  if (!loc) {
    return (
      <div className="alarm-row alarm-row--sun glow-box">
        <SunIcon className="alarm-row__time alarm-row__sun" aria-hidden />
        <span className="alarm-row__main">
          <span className="alarm-row__name">Sunrise and sunset</span>
          <span className="alarm-row__sub">Set your location in Settings › Sky to see them</span>
        </span>
      </div>
    )
  }
  return <>{SUN_EVENTS.map(e => (
    <div key={e} className="group-row">
      <SunRow event={e} on={shown.includes(e)} next={nextSunEvent(minute * 60_000, loc, e)} place={loc.name.split(',')[0]} />
      {/* Sunrise and sunset share one group (they gather together). */}
      <StripIfOpen rowKey={`sun:${e}`} groupKey={SUN_GROUP} />
    </div>
  ))}</>
}

function SunRow({ event, on, next, place }: { event: SunEvent; on: boolean; next: number | null; place: string }) {
  const name = sunEventName(event)
  const goNext = () => {
    if (next === null) return
    act.focusCursorAt(next)
    if (useLayout.getState().agendaPlacement === 'drawer') ui.closeAgenda()
  }
  return (
    <div className={`alarm-row alarm-row--sun glow-box${on ? '' : ' is-paused'}`} role="button" tabIndex={0}
      onClick={goNext} onKeyDown={e => { if (e.key === 'Enter') goNext() }}>
      <span className="alarm-row__time mono">{next !== null ? formatClockCompact(next, false) : '—'}</span>
      <span className="alarm-row__main">
        <span className="alarm-row__name"><SunIcon className="alarm-row__sun" aria-hidden /> {name}</span>
        <span className="alarm-row__sub">{['Daily', place].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="alarm-row__when">
        {!on ? 'Hidden' : next !== null ? <LiveText watch={bySecond} compute={f => formatRelativeShort(next - f.now)} /> : '—'}
      </span>
      <span className="alarm-row__tools" onClick={ev => ev.stopPropagation()}><AdjustButton rowKey={`sun:${event}`} name="sunrise and sunset" /></span>
      <button type="button" role="switch" aria-checked={on} aria-label={on ? `Hide ${name.toLowerCase()} on the timeline` : `Show ${name.toLowerCase()} on the timeline`}
        className={`alarm-switch${on ? ' is-on' : ''}`}
        onClick={e => { e.stopPropagation(); settings.setSunEventShown(event, !on) }}>
        <span className="alarm-switch__knob" />
      </button>
    </div>
  )
}
