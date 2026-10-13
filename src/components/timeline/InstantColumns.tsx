// Saved instant markers: a line (in the shared lines layer, InstantLines) plus one compact chip,
// placed along the time axis each frame with its animated layout offsets (chipPlacement).
import { memo, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { StarIcon as StarOutline, BellIcon as BellOutline } from '@heroicons/react/24/outline'
import { StarIcon as StarSolid, BellAlertIcon } from '@heroicons/react/24/solid'
import { ArrowPathIcon, ArrowsRightLeftIcon, BellSlashIcon, CheckIcon, ClockIcon, EyeIcon, EyeSlashIcon, TrashIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { useFrameValue, useFrameValueWhile } from '../../engine/hooks.ts'
import { LiveText } from '../../engine/LiveText.tsx'
import { SNOOZE_MARK, chipName, formatClockCompact, formatDateTime, formatDuration, formatRelativeShort, showsSeconds } from '../../domain/format.ts'
import { labelSpacingPx, pickTickTiers } from '../../domain/ticks.ts'
import type { AlarmRecord, InstantRecord } from '../../domain/entities.ts'
import { hasArmedAlarm, openAlarms, ringKey, ringTime, warningsToCancel } from '../../domain/alarms.ts'
import { bellItemId, isLiveAlarm } from '../../domain/bells.ts'
import { displayName } from '../../domain/entities.ts'
import { endpointName } from '../../domain/spans.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { useView, view } from '../../store/view.ts'
import { useAlarms } from '../../store/alarms.ts'
import { useLayout } from '../../store/layout.ts'
import { ui, useUi } from '../../store/ui.ts'
import { getTunables } from '../../store/settings.ts'
import { GEOMETRY, GEOMETRY_VERTICAL } from './geometry.ts'
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss.ts'
import { bellDragAt, consumeBellDragClick, startBellDrag } from './bellDrag.ts'
import * as act from '../../store/actions.ts'
import { IconButton } from '../common/IconButton.tsx'
import { InlineInput } from '../common/InlineInput.tsx'
import { ClusterChip } from './ClusterChip.tsx'
import { TimeEntry } from './TimeEntryPopover.tsx'
import { chipToolsBelow, useChipWidth, useChipWidths, useSavedLayoutStructure } from './savedLayout.ts'
import { InstantLines } from './InstantLines.tsx'
import { useTimelineInstants } from './timelineInstants.ts'
import { RepeatPicker } from '../common/RepeatPicker.tsx'
import { describeRepeat } from '../../domain/series.ts'
import type { ChipOffsets } from './chipPlacement.ts'
import { useChipPlacement } from './chipPlacement.ts'
import { useMorphChip } from './plusMorph.ts'
import { captureAt } from './capture.ts'
import type { Frame } from '../../engine/viewportEngine.ts'

/** Vertical: the tools row under a chip stays this far in from the right edge, px. */
const TOOLS_EDGE = 6

/** Text about a fixed time changes only with the clock's second, not with pans or zooms. */
const bySecond = (f: { now: number }) => Math.floor(f.now / 1000)

const starColor = 'var(--c-favorite)'
const bellColor = 'var(--c-alarm)'

// ---------------------------------------------------------------------------
// Saved instants: a line plus one compact chip ("Take Meds 6:00p · 20m ago").

interface SavedFlags {
  selected: boolean
  focused: boolean
  secondary: boolean
  spanEnd: boolean
  editing: boolean
  moving: boolean
  /** Zoomed in far enough that every chip shows seconds. */
  fineSeconds: boolean
}

interface ChipProps {
  inst: InstantRecord
  /** Snoozes folded into this chip, and their ids (comma-joined to keep props primitive). */
  foldCount: number
  foldedIds: string
  /** Bells before the instant folded into its chip (too close to stand apart: zoomed out). */
  bellFolded: number
  selected: boolean
  focused: boolean
  editing: boolean
  moving: boolean
  fineSeconds: boolean
}

function SavedChip({ inst, foldCount, foldedIds, bellFolded, selected, focused, editing, moving, fineSeconds, belowRef }: ChipProps & { belowRef: React.RefObject<HTMLDivElement | null> }) {
  const ts = inst.tsEpochMs
  // Only alarms and a selected chip's tools care whether it is past: others don't watch the clock.
  const isPast = useFrameValueWhile(!!inst.alarms || selected, f => ts < f.now, false)
  const armed = useFrameValueWhile(!!inst.alarms, f => hasArmedAlarm(inst, f.now), false)
  const ringingIds = useAlarms(useShallow(s => s.ringing.filter(r => r.instantId === inst.id).map(r => r.alarmId)))
  const draggingBell = useUi(s => s.draggingBell)
  const selectedBell = useUi(s => s.selectedBell)
  const seriesHint = useUi(s => s.seriesHint === inst.id)
  const groupRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLDivElement>(null)
  // The layout measures the chip with its bell (the group); the ＋ flows into the chip itself.
  useChipWidth(groupRef, inst.id)
  useMorphChip(chipRef, inst.id)
  const name = chipName(inst.label)
  const vertical = useLayout(s => s.orientation === 'vertical')
  const unnamed = !inst.label

  // The bell beside the chip: its alarms at the instant (still to ring, or ringing), and the
  // bells before it folded in. One reads as a bell; more as their count, "3🔔".
  const atInstant = (inst.alarms ?? []).filter(a => a.offsetMs === 0 && !a.answered && a.id !== draggingBell && (!isPast || ringingIds.includes(a.id)))
  const ringingHere = atInstant.find(a => ringingIds.includes(a.id))
  const bellAlarm = ringingHere ?? atInstant[0]
  const bellCount = atInstant.length + bellFolded
  const showBell = bellCount > 0
  const bellSelected = !!bellAlarm && selectedBell === bellAlarm.id
  // A selected bell's tools close on a press anywhere else.
  usePopoverDismiss(groupRef, () => ui.selectBell(null), bellSelected)
  const onBell = () => {
    if (consumeBellDragClick()) return
    if (ringingHere) act.dismissAlarm(ringKey(inst.id, ringingHere.id))
    // Folded bells need room to tell apart: zoom in on them. Otherwise it is the alarm at the instant.
    else if (bellAlarm && bellFolded === 0) act.selectBell(bellAlarm.id)
    else act.zoomToTimes([ts, ...(inst.alarms ?? []).filter(a => !a.answered).map(a => ringTime(inst, a))])
  }
  // The Cursor tag carries the focused instant's relative time, so the focused chip omits it.
  const showRelative = !focused && (!!inst.favorite || showBell || selected)
  const withSeconds = fineSeconds || selected || focused

  // Move mode: a second tap on the chip (or its clock tool) types the time instead of dragging.
  const [typing, setTyping] = useState(false)
  // Whether the chip was focused when a double-tap began (its first tap may focus it).
  const firstTap = useRef<{ wasFocused: boolean } | null>(null)
  const onTap = (e: React.MouseEvent) => {
    // A computed occurrence (past the horizon) is stored as it is tapped, then selected.
    if (inst.virtual) { const id = act.materializeOccurrence(inst.id); if (id) act.selectInstant(id); return }
    if (e.detail <= 1) firstTap.current = { wasFocused: act.isInstantFocused(inst.id) }
    if (bellSelected) ui.selectBell(null)
    if (moving) setTyping(true)
    else act.selectInstant(inst.id)
  }
  if (typing && !moving) setTyping(false)

  const zoomToFold = () => {
    const times = [ts, ...foldedIds.split(',').map(id => entities.getInstant(id)?.tsEpochMs).filter((t): t is number => typeof t === 'number')]
    act.zoomToTimes(times)
  }

  const toolButtons = bellSelected && !moving && bellAlarm ? (
    <BellTools inst={inst} alarm={bellAlarm} />
  ) : selected && !moving ? (
    <>
      {!inst.favorite && <IconButton icon={StarOutline} label="Favorite" color={starColor} bare onClick={() => act.toggleFavorite(inst.id)} />}
      {!isPast && <IconButton icon={BellOutline} label={atInstant.length > 0 ? 'Add another alarm' : 'Set alarm'} color={bellColor} bare onClick={() => act.addAlarm(inst.id)} />}
      {openAlarms(inst).length > 0 && <CancelTool inst={inst} />}
      {focused && <IconButton icon={ArrowsRightLeftIcon} label="Move instant" color="var(--c-cursor)" bare onClick={() => act.enterMove(inst.id)} />}
      {/* An alarm still to ring is never hidden. */}
      <RepeatTool inst={inst} />
      {(inst.hidden || !armed) && (
        <IconButton icon={inst.hidden ? EyeIcon : EyeSlashIcon} label={inst.hidden ? 'Show on the timeline' : 'Hide from the timeline (spans stay)'}
          color="var(--ink-dim)" bare onClick={() => act.setInstantHidden(inst.id, !inst.hidden)} />
      )}
      {inst.seriesId
        ? <DeleteOccurrenceTool inst={inst} />
        : <IconButton icon={TrashIcon} label="Delete instant" color="var(--c-danger)" className="glow-box" onClick={() => act.deleteInstant(inst.id)} />}
    </>
  ) : moving ? (
    <>
      <IconButton icon={ClockIcon} label="Type the time" color="var(--c-cursor)" bare pressed={typing} onClick={() => setTyping(true)} />
      <IconButton icon={CheckIcon} label="Confirm move" color="var(--c-ok)" bare onClick={act.confirmMove} />
      <IconButton icon={XMarkIcon} label="Cancel move" color="var(--c-danger)" bare onClick={act.cancelMove} />
    </>
  ) : null
  // Tools sit in a row under the chip (beside a moving chip in horizontal, whose badge is under it).
  const toolsBelow = toolButtons !== null && chipToolsBelow({ moving, vertical })
  const tools = toolButtons && <div className="tl-col__tools">{toolButtons}</div>

  return (
    <div ref={groupRef} className={`tl-col__chip${foldCount > 0 ? ' has-fold' : ''}`} style={vertical ? ({ left: GEOMETRY_VERTICAL.chipStart } as CSSProperties) : undefined}>
      {showBell && (
        <button type="button" data-no-pan
          className={`chip-bell glow-box${ringingHere ? ' is-ringing' : ''}${bellSelected ? ' is-selected' : ''}${atInstant.length === 0 ? ' is-folded-only' : ''}`}
          aria-label={ringingHere ? 'Dismiss alarm (drag later to snooze)' : bellFolded > 0 ? `${bellCount} alarm${bellCount > 1 ? 's' : ''}, zoom to show them` : 'Alarm: drag earlier to ring before, tap for its tools'}
          title={ringingHere ? 'Tap to dismiss; drag later to snooze until there' : bellFolded > 0 ? 'Alarms: tap to show them all' : 'Drag earlier to ring before the instant; tap for its tools'}
          onPointerDown={bellAlarm ? e => startBellDrag(e, inst.id, bellAlarm.id) : undefined}
          onClick={onBell}>
          {bellCount > 1 && <span className="chip-bell__count">{bellCount}</span>}
          <BellAlertIcon aria-hidden />
        </button>
      )}
      <div ref={chipRef} className={`chip chip--saved${editing ? ' chip--editing' : ' glow-box glow-text'}${inst.label ? '' : ' chip--empty'}${armed || ringingIds.length > 0 ? ' has-alarm' : ''}`}>
        {inst.favorite && (
          <IconButton icon={StarSolid} label="Unfavorite" color={starColor} bare pressed onClick={() => act.toggleFavorite(inst.id)} />
        )}
        {editing ? (
          <InlineInput
            initial={inst.label}
            ariaLabel="Instant name"
            placeholder="Name"
            onCommit={v => act.renameInstant(inst.id, v)}
            onCancel={() => view.editInstant(null)}
          />
        ) : (
          <>
          {unnamed && selected && (
            <button type="button" className="chip__name-hint" aria-label="Name this instant" onClick={() => view.editInstant(inst.id)}>name…</button>
          )}
          <button
            type="button"
            className="chip__main"
            title={`${inst.label ? displayName(inst.label) : 'Instant'} · ${formatDateTime(ts)}. Click to select; double-click to focus, then again to rename`}
            onClick={onTap}
            onDoubleClick={() => act.activateInstant(inst.id, firstTap.current?.wasFocused)}
          >
            {!unnamed && <span className="chip__name">{name}</span>}
            {inst.seriesId && <span className="chip__repeat" aria-label="repeats">{REPEAT_MARK}</span>}
            <span className="chip__time">
              {moving ? <LiveText compute={f => formatClockCompact(f.center, true)} /> : formatClockCompact(ts, withSeconds)}
            </span>
            {showRelative && !moving && <LiveText className="chip__rel" watch={bySecond} compute={f => `· ${formatRelativeShort(ts - f.now)}`} />}
            {moving && <LiveText className="chip__rel" compute={f => `· ${formatRelativeShort(f.center - f.now)}`} />}
          </button>
          </>
        )}
      </div>
      {seriesHint && !editing && (
        <button type="button" className="tl-col__apply glow-box" onClick={() => act.applyToFutureOccurrences(inst.id)}
          title="Make every later occurrence like this one: name, time of day and alarms">
          {REPEAT_MARK} Apply to all future
        </button>
      )}
      {foldCount > 0 && (
        <button type="button" className="tl-col__fold glow-box glow-text" aria-label={`${foldCount} snooze${foldCount > 1 ? 's' : ''}, zoom to fit`} onClick={zoomToFold}>
          {SNOOZE_MARK}{foldCount}
        </button>
      )}
      {(editing || toolsBelow) && (
        <div ref={belowRef} className="tl-col__below">
          {editing && <span className="chip__time">{formatClockCompact(ts, true)}</span>}
          {toolsBelow && tools}
        </div>
      )}
      {!toolsBelow && tools}
      {moving && typing && (
        <TimeEntry
          title={`Move ${displayName(inst.label, 'instant')} to`}
          className="popover--chip"
          clock={{ initialTs: act.cursorTime(), onSubmit: t => act.moveInstantToClock(t.h, t.m, t.s) }}
          offset={{ initialMs: act.cursorTime() - act.nowTime(), from: 'Now', onSubmit: act.moveInstantFromNow }}
          onCancel={() => setTyping(false)}
        />
      )}
    </div>
  )
}

/**
 * Cancel an instant's alarms (the opposite of a snooze): its warnings, keeping the alarm at the
 * instant, or all of them. One tap when there is no choice; a menu when there is.
 */
function CancelTool({ inst }: { inst: InstantRecord }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  usePopoverDismiss(ref, () => setOpen(false), open)
  const warnings = warningsToCancel(inst).length
  const all = openAlarms(inst).length
  // A menu only when there is a choice (warnings and the alarm at the instant); otherwise the tap cancels.
  const choice = warnings > 0 && warnings < all
  const label = all > 1 ? `Cancel all ${all} alarms` : 'Cancel this alarm'
  return (
    <div ref={ref} className="skip-tool">
      <IconButton icon={BellSlashIcon} label={choice ? 'Cancel alarms…' : label} color={bellColor} bare pressed={open}
        onClick={() => (choice ? setOpen(o => !o) : act.cancelAlarms(inst.id, 'all'))} />
      {open && choice && (
        <div className="popover popover--chip skip-menu glow-box" role="menu" aria-label="Cancel alarms">
          <button type="button" role="menuitem" className="skip-menu__item" onClick={() => { act.cancelAlarms(inst.id, 'warnings'); setOpen(false) }}>
            Cancel warnings <span className="skip-menu__note">keep the alarm at {formatClockCompact(inst.tsEpochMs, false)}</span>
          </button>
          <button type="button" role="menuitem" className="skip-menu__item" onClick={() => { act.cancelAlarms(inst.id, 'all'); setOpen(false) }}>
            {label}
          </button>
        </div>
      )}
    </div>
  )
}

/** The mark on an occurrence of a repeating series. */
const REPEAT_MARK = '⟳'

/**
 * Repeat: makes an instant repeat (it becomes the first occurrence of a series), or, on an
 * occurrence, changes how its series repeats from now on, pauses it, or ends it.
 */
function RepeatTool({ inst }: { inst: InstantRecord }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  usePopoverDismiss(ref, () => setOpen(false), open)
  const series = useEntities(s => (inst.seriesId ? s.groups?.find(g => g.id === inst.seriesId) : undefined))
  return (
    <div ref={ref} className="skip-tool">
      <IconButton icon={ArrowPathIcon} label={series ? `Repeats ${describeRepeat(series.repeat)}: change` : 'Repeat'} color="var(--c-alarm)" bare pressed={open || !!series}
        onClick={() => setOpen(o => !o)} />
      {open && (
        <div className="popover popover--chip repeat-menu glow-box" role="dialog" aria-label="Repeat">
          <div className="repeat-menu__title">{series ? `Repeats ${describeRepeat(series.repeat).toLowerCase()} at ${formatClockCompact(inst.tsEpochMs, false)}` : `Repeat at ${formatClockCompact(inst.tsEpochMs, false)}`}</div>
          <RepeatPicker value={series?.repeat ?? null} onChange={r => { if (r) act.repeatInstant(inst.id, r) }} />
          {series && (
            <div className="repeat-menu__actions">
              <button type="button" className="alarm-link glow-box" onClick={() => { act.setSeriesPaused(series.id, !series.paused); setOpen(false) }}>
                {series.paused ? 'Resume' : 'Pause'}
              </button>
              <button type="button" className="alarm-link alarm-link--all glow-box" onClick={() => { act.endSeries(series.id); setOpen(false) }}>End series</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Delete, on an occurrence: this one, or this and all later ones (earlier ones stay as history). */
function DeleteOccurrenceTool({ inst }: { inst: InstantRecord }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  usePopoverDismiss(ref, () => setOpen(false), open)
  return (
    <div ref={ref} className="skip-tool">
      <IconButton icon={TrashIcon} label="Delete…" color="var(--c-danger)" className="glow-box" pressed={open} onClick={() => setOpen(o => !o)} />
      {open && (
        <div className="popover popover--chip skip-menu glow-box" role="menu" aria-label="Delete">
          <button type="button" role="menuitem" className="skip-menu__item" onClick={() => { act.deleteOccurrences(inst.id, 'this'); setOpen(false) }}>
            Delete this one
          </button>
          <button type="button" role="menuitem" className="skip-menu__item" onClick={() => { act.deleteOccurrences(inst.id, 'later'); setOpen(false) }}>
            This and all later <span className="skip-menu__note">earlier ones stay</span>
          </button>
        </div>
      )}
    </div>
  )
}

/** A selected bell's tools: type how long before its instant it rings, or delete it. */
function BellTools({ inst, alarm }: { inst: InstantRecord; alarm: AlarmRecord }) {
  const [typing, setTyping] = useState(false)
  return (
    <>
      <IconButton icon={ClockIcon} label="Type how long before it rings" color={bellColor} bare pressed={typing} onClick={() => setTyping(true)} />
      <IconButton icon={TrashIcon} label="Delete alarm" color="var(--c-danger)" className="glow-box" onClick={() => act.removeAlarm(inst.id, alarm.id)} />
      {typing && (
        <TimeEntry
          title={`Ring before ${displayName(inst.label, formatClockCompact(inst.tsEpochMs, false))}`}
          className="popover--chip"
          offset={{ initialMs: alarm.offsetMs, from: endpointName(inst), unsigned: true, onSubmit: ms => { act.setAlarmOffset(inst.id, alarm.id, ms); setTyping(false) } }}
          onCancel={() => setTyping(false)}
        />
      )}
    </>
  )
}

/** Distance from the axis to the first chip row (column), px: a bell's stub runs this far plus its row's offset. */
const AXIS_GAP = { horizontal: GEOMETRY.chipTop - GEOMETRY.axis, vertical: GEOMETRY_VERTICAL.chipStart - GEOMETRY_VERTICAL.axis }

/**
 * A bell before its instant (TLC-1): at the time it rings, in the chips' layout, with a short
 * stub to the axis (a small instant line) and a thin line along the axis back to its instant.
 * Drag it along time; tap it for its tools. A past one (history) is hollow.
 */
const BellMarker = memo(function BellMarker({ inst, alarm, siblings, past, selected, ringing, dragging }:
  { inst: InstantRecord; alarm: AlarmRecord; siblings: string; past: boolean; selected: boolean; ringing: boolean; dragging: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const stubRef = useRef<HTMLDivElement>(null)
  const linkRef = useRef<HTMLDivElement>(null)
  const vertical = useLayout(s => s.orientation === 'vertical')
  // Its tools close on a press anywhere else.
  usePopoverDismiss(ref, () => ui.selectBell(null), selected)
  // Where a bell of this instant rings (the drag's time while dragged).
  const ringOf = (a: AlarmRecord) => {
    const d = bellDragAt()
    return d && d.alarmId === a.id ? d.ringTs : ringTime(inst, a)
  }
  const ringTs = () => ringOf(alarm)
  // The instant's other bells drawn: each draws its line only as far as the next one nearer the instant.
  const others = useMemo(() => {
    const ids = new Set(siblings.split(','))
    return (inst.alarms ?? []).filter(a => ids.has(a.id))
  }, [inst.alarms, siblings])
  useChipPlacement(ref, bellItemId(alarm.id), false, f => f.pos(ringTs()), (f, _target, current) => {
    // The stub reaches from the bell back to the axis, whatever row it sits in.
    const stub = stubRef.current
    if (stub) {
      const len = `${Math.max(0, AXIS_GAP[f.orientation] + current.cross)}px`
      const prop = f.orientation === 'horizontal' ? 'height' : 'width'
      if (stub.style[prop] !== len) { stub.style.height = ''; stub.style.width = ''; stub.style[prop] = len }
    }
    // The line along the axis, from the bell's time on to the next bell nearer its instant (or the
    // instant), from either side (warnings before it, snoozes after it). Each stretch reads as
    // how many bells reach over it: one is dashed, more solid.
    const link = linkRef.current
    if (link) {
      const mine = ringTs()
      const ts = inst.tsEpochMs
      const side = Math.sign(ts - mine) // +1: before the instant
      let to = ts
      let shared = false
      for (const o of others) {
        const r = ringOf(o)
        if (Math.sign(ts - r) !== side) continue
        if ((r - mine) * side > 0 && (to - r) * side > 0) to = r
        if ((mine - r) * side > 0) shared = true
      }
      link.classList.toggle('is-solid', shared)
      const a = f.pos(mine)
      const b = f.pos(to)
      const lo = Math.max(-100_000, Math.min(a, b))
      const len = Math.min(200_000, Math.abs(b - a))
      const transform = f.orientation === 'horizontal' ? `translate3d(${lo.toFixed(1)}px,0,0)` : `translate3d(0,${lo.toFixed(1)}px,0)`
      if (link.style.transform !== transform) link.style.transform = transform
      const prop = f.orientation === 'horizontal' ? 'width' : 'height'
      const size = `${len.toFixed(1)}px`
      if (link.style[prop] !== size) { link.style.width = ''; link.style.height = ''; link.style[prop] = size }
    }
  })
  const name = endpointName(inst)
  const key = ringKey(inst.id, alarm.id)
  const onTap = () => {
    if (consumeBellDragClick()) return
    if (ringing) act.dismissAlarm(key)
    else act.selectBell(alarm.id)
  }
  const when = alarm.offsetMs >= 0
    ? `${formatDuration(alarm.offsetMs, { exact: true })} before ${name}`
    : `snoozed ${formatDuration(-alarm.offsetMs, { exact: true })} after ${name}`
  const label = past
    ? `Past alarm ${when}`
    : `Alarm ${when}${ringing ? ', ringing: tap to dismiss, drag later to snooze' : ': drag to move, tap for its tools'}`
  return (
    <>
      <div ref={linkRef} className={`tl-bell-link${past ? ' is-past' : ''}`} aria-hidden />
      <div ref={ref} className={`tl-col tl-col--label tl-bell${selected ? ' is-selected' : ''}${past ? ' is-past' : ''}${dragging ? ' is-dragging' : ''}${inst.virtual ? ' is-virtual' : ''}`} role="group" aria-label={label}>
        <div className="tl-col__chip" style={vertical ? ({ left: GEOMETRY_VERTICAL.chipStart } as CSSProperties) : undefined}>
          <div ref={stubRef} className="tl-bell__stub" aria-hidden />
          <button type="button" data-no-pan className={`chip-bell glow-box${ringing ? ' is-ringing' : ''}${selected ? ' is-selected' : ''}`}
            aria-label={label} title={label}
            onPointerDown={past ? undefined : e => startBellDrag(e, inst.id, alarm.id)}
            onClick={onTap}>
            {past ? <BellOutline aria-hidden /> : <BellAlertIcon aria-hidden />}
            {alarm.snoozeOf && <span className="chip-bell__snooze" aria-hidden>{SNOOZE_MARK}</span>}
          </button>
          {/* How long before its instant: while dragged (live) or selected. */}
          {(dragging || selected) && (
            <LiveText className="tl-bell__offset glow-text" compute={f => {
              const before = inst.tsEpochMs - ringTs()
              return `${before >= 0 ? '−' : '+'}${formatDuration(Math.abs(before), { msPerPx: 1 / f.pxPerMs, exact: true })}`
            }} />
          )}
          {selected && (
            <div className="tl-col__below">
              <div className="tl-col__tools">
                {past
                  ? <IconButton icon={TrashIcon} label="Delete alarm" color="var(--c-danger)" className="glow-box" onClick={() => act.removeAlarm(inst.id, alarm.id)} />
                  : <BellTools inst={inst} alarm={alarm} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
})

/**
 * A chip that the layout placed: moved along the time axis to its line each frame, plus its
 * animated layout offsets. Its line is drawn by InstantLines (clustered and folded instants keep theirs).
 */
const SavedMarker = memo(function SavedMarker({ inst, foldCount, foldedIds, bellFolded, bellLinked, selected, focused, secondary, spanEnd, editing, moving, fineSeconds, captured }:
  { inst: InstantRecord; foldCount: number; foldedIds: string; bellFolded: number; bellLinked: boolean; captured: boolean } & SavedFlags) {
  const ts = inst.tsEpochMs
  const name = endpointName(inst)
  const dropped = useUi(s => s.droppedId === inst.id)
  // The Cursor tag's ＋ is still growing into this chip: the chip shows once it arrives.
  const morphTarget = useUi(s => s.plusMorph?.id === inst.id && s.plusMorph.phase === 'in')
  const stateClass = `${moving ? 'is-moving' : focused ? 'is-focused' : captured ? 'is-capture' : selected ? 'is-selected' : spanEnd ? 'is-span-end' : secondary ? 'is-secondary' : ''}${dropped ? ' is-dropped' : ''}${morphTarget ? ' is-morph-target' : ''}`
  const ref = useRef<HTMLDivElement>(null)
  const belowRef = useRef<HTMLDivElement>(null)
  // Vertical: a chip wider than the room runs off the right edge; pull its tools row back on screen.
  const chipWidth = useChipWidths(s => s.widths[inst.id])
  const alarmStubRef = useRef<HTMLDivElement>(null)
  const onPlaced = (f: Frame, target: ChipOffsets, current: ChipOffsets) => {
    // Tied to bells before it: a stub runs across from the axis (where their line ends) to the
    // chip, whatever row it sits in or however far it slid.
    const stub = alarmStubRef.current
    if (stub) {
      const horizontal = f.orientation === 'horizontal'
      const transform = horizontal ? `translate(${(-current.shift).toFixed(1)}px,${(-current.cross).toFixed(1)}px)` : `translate(${(-current.cross).toFixed(1)}px,${(-current.shift).toFixed(1)}px)`
      if (stub.style.transform !== transform) stub.style.transform = transform
      const len = `${Math.max(0, AXIS_GAP[f.orientation] + current.cross).toFixed(1)}px`
      const prop = horizontal ? 'height' : 'width'
      if (stub.style[prop] !== len) { stub.style.height = ''; stub.style.width = ''; stub.style[prop] = len }
    }
    pullTools(f, target)
  }
  const pullTools = (f: Frame, target: ChipOffsets) => {
    const el = belowRef.current
    if (!el) return
    const pull = f.orientation === 'vertical' && chipWidth
      ? Math.max(0, GEOMETRY_VERTICAL.chipStart + target.cross + chipWidth - (f.crossSize - TOOLS_EDGE)) : 0
    const transform = pull > 0 ? `translateX(${-pull}px)` : ''
    if (el.style.transform !== transform) el.style.transform = transform
  }
  useChipPlacement(ref, inst.id, false, moving ? f => f.mainSize / 2 : f => f.pos(ts), onPlaced)
  const linked = bellLinked && !moving

  return (
    <div ref={ref} className={`tl-col tl-col--label ${stateClass}${inst.virtual ? ' is-virtual' : ''}`} role="group" aria-label={`Instant ${name}`}>
      {linked && <div ref={alarmStubRef} className="tl-col__alarm-stub" aria-hidden />}
      <SavedChip inst={inst} foldCount={foldCount} foldedIds={foldedIds} bellFolded={bellFolded} belowRef={belowRef}
        selected={selected} focused={focused} editing={editing} moving={moving} fineSeconds={fineSeconds} />
      {moving && <div className="tl-col__badge glow-box glow-text">Moving</div>}
    </div>
  )
})

export function SavedInstantColumns() {
  const layout = useSavedLayoutStructure()
  const instants = useTimelineInstants()
  const spans = useEntities(s => s.spans)
  const v = useView(useShallow(s => ({
    mode: s.viewFocusMode,
    focusedInstantId: s.focusedInstantId,
    focusedSpanId: s.focusedSpanId,
    selected: s.currentSelectedInstantId,
    secondary: s.secondarySelectedInstantId,
    editing: s.editingInstantId,
    moving: s.moveMode?.instantId ?? null,
  })))

  const fineSeconds = useFrameValue(f => showsSeconds(pickTickTiers(f.pxPerMs, labelSpacingPx(f.orientation))[0].ms, getTunables().secondsBelowTickMs))

  const spanEnds = useMemo(() => {
    if (v.mode !== 'span' || !v.focusedSpanId) return new Set<string>()
    const sp = spans.find(s => s.id === v.focusedSpanId)
    return new Set(sp ? [sp.startInstantId, sp.endInstantId] : [])
  }, [spans, v.mode, v.focusedSpanId])

  const byId = useMemo(() => new Map(instants.map(i => [i.id, i])), [instants])
  const moving = v.moving ? byId.get(v.moving) : undefined
  const focusedId = v.mode === 'instant' ? v.focusedInstantId : null
  // The instant a held drag is about to land on (it lights up like a focused one).
  const capturedId = useFrameValue(f => { const c = captureAt(f); return c?.preview ? c.id : null })

  // Line colours, by state (the same order of precedence as the chips).
  const lineClass = useMemo(() => {
    const out: Record<string, string> = {}
    for (const id of spanEnds) out[id] = 'is-span-end'
    if (v.secondary) out[v.secondary] = 'is-secondary'
    if (v.selected) out[v.selected] = 'is-selected'
    if (capturedId) out[capturedId] = 'is-focused'
    if (focusedId) out[focusedId] = 'is-focused'
    if (v.moving) out[v.moving] = 'is-moving'
    return out
  }, [spanEnds, v.secondary, v.selected, capturedId, focusedId, v.moving])

  // Alarms by id, for the bells before their instants.
  const alarmsById = useMemo(() => {
    const out = new Map<string, { inst: InstantRecord; alarm: AlarmRecord }>()
    for (const inst of instants) for (const alarm of inst.alarms ?? []) out.set(alarm.id, { inst, alarm })
    return out
  }, [instants])
  const selectedBell = useUi(s => s.selectedBell)
  const draggingBell = useUi(s => s.draggingBell)
  const ringingKeys = useAlarms(useShallow(s => s.ringing.map(r => ringKey(r.instantId, r.alarmId))))
  const ringingSet = useMemo(() => new Set(ringingKeys), [ringingKeys])
  // Each instant's drawn bells: their lines meet, and its chip ties into them.
  const bellsByInstant = useMemo(() => {
    const out = new Map<string, string[]>()
    for (const id of layout.bellIds) {
      const b = alarmsById.get(id)
      if (b) out.set(b.inst.id, [...(out.get(b.inst.id) ?? []), id])
    }
    return out
  }, [layout.bellIds, alarmsById])
  // Bells that are history (answered or missed) draw hollow.
  const pastIds = useFrameValue(f => layout.bellIds.filter(id => {
    const b = alarmsById.get(id)
    return !!b && !isLiveAlarm(b.inst, b.alarm, f.now, ringingSet)
  }).join(','))

  // Snooze ids per chip that shows them.
  const foldedIds = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const [snooze, anchor] of Object.entries(layout.folded)) (out[anchor] ??= []).push(snooze)
    return out
  }, [layout.folded])

  return (
    <>
      <InstantLines instants={instants} lineClass={lineClass} movingId={v.moving} ghostTs={moving ? moving.tsEpochMs : null} />
      {layout.chipIds.map(id => {
        const inst = byId.get(id)
        if (!inst) return null
        return (
          <SavedMarker
            key={id}
            inst={inst}
            foldCount={layout.foldCount[id] ?? 0}
            foldedIds={(foldedIds[id] ?? []).join(',')}
            bellFolded={layout.bellFolded[id] ?? 0}
            bellLinked={bellsByInstant.has(id)}
            selected={v.selected === id}
            focused={focusedId === id}
            secondary={v.secondary === id}
            spanEnd={spanEnds.has(id)}
            editing={v.editing === id}
            moving={v.moving === id}
            fineSeconds={fineSeconds}
            captured={capturedId === id}
          />
        )
      })}
      {layout.bellIds.map(id => {
        const b = alarmsById.get(id)
        if (!b) return null
        return (
          <BellMarker key={id} inst={b.inst} alarm={b.alarm}
            siblings={(bellsByInstant.get(b.inst.id) ?? []).filter(o => o !== id).join(',')}
            past={pastIds.split(',').includes(id)}
            selected={selectedBell === id}
            dragging={draggingBell === id}
            ringing={ringingSet.has(ringKey(b.inst.id, id))} />
        )
      })}
      {layout.clusters.map(c => (
        <ClusterChip
          key={c.id}
          id={c.id}
          topPriority={c.topPriority}
          members={c.memberIds.map(m => byId.get(m)).filter((i): i is InstantRecord => !!i)}
        />
      ))}
    </>
  )
}
