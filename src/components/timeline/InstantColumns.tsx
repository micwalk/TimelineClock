// Saved instant markers: a line plus one compact chip, moved along the time axis by the engine.
import { memo, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { StarIcon as StarOutline, BellIcon as BellOutline } from '@heroicons/react/24/outline'
import { StarIcon as StarSolid, BellAlertIcon } from '@heroicons/react/24/solid'
import { ArrowsRightLeftIcon, CheckIcon, ClockIcon, EyeIcon, EyeSlashIcon, TrashIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { useFrameValue } from '../../engine/hooks.ts'
import { LiveText } from '../../engine/LiveText.tsx'
import { SNOOZE_MARK, chipName, formatClockCompact, formatDateTime, formatRelativeShort, showsSeconds } from '../../domain/format.ts'
import { labelSpacingPx, pickTickTiers } from '../../domain/ticks.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import { displayName } from '../../domain/entities.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { useView, view } from '../../store/view.ts'
import { useAlarms } from '../../store/alarms.ts'
import { useLayout } from '../../store/layout.ts'
import { useUi } from '../../store/ui.ts'
import { getTunables } from '../../store/settings.ts'
import { GEOMETRY_VERTICAL } from './geometry.ts'
import * as act from '../../store/actions.ts'
import { IconButton } from '../common/IconButton.tsx'
import { InlineInput } from '../common/InlineInput.tsx'
import { Marker } from './Marker.tsx'
import { ClusterChip } from './ClusterChip.tsx'
import { TimeEntry } from './TimeEntryPopover.tsx'
import type { SavedLayout } from './savedLayout.ts'
import { useChipWidth, useChipWidths } from './savedLayout.ts'

/** Vertical: the tools row under a chip stays this far in from the right edge, px. */
const TOOLS_EDGE = 6

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
  /** Row from the overlap layout (0 = next to the axis). */
  row: number
  /** Vertical: px right of chip column 0 (from the overlap layout). */
  cross: number
  /** px the chip slid along the time axis away from its line (overlap layout), to avoid a "+N". */
  shift: number
  /** Snoozes folded into this chip, and their ids (comma-joined to keep props primitive). */
  foldCount: number
  foldedIds: string
  selected: boolean
  focused: boolean
  editing: boolean
  moving: boolean
  fineSeconds: boolean
}

function SavedChip({ inst, row, cross, shift, foldCount, foldedIds, selected, focused, editing, moving, fineSeconds }: ChipProps) {
  const ts = inst.tsEpochMs
  const isPast = useFrameValue(f => ts < f.now)
  const ringing = useAlarms(s => s.ringing.some(r => r.instantId === inst.id))
  const chipRef = useRef<HTMLDivElement>(null)
  useChipWidth(chipRef, inst.id)
  const name = chipName(inst.label)
  const vertical = useLayout(s => s.orientation === 'vertical')
  const unnamed = !inst.label

  const bellGlyph = (!!inst.alarm && !isPast) || ringing
  // The Cursor tag carries the focused instant's relative time, so the focused chip omits it.
  const showRelative = !focused && (!!inst.favorite || !!inst.alarm || selected)
  const withSeconds = fineSeconds || selected || focused

  // Move mode: a second tap on the chip (or its clock tool) types the time instead of dragging.
  const [typing, setTyping] = useState(false)
  // Whether the chip was focused when a double-tap began (its first tap may focus it).
  const firstTap = useRef<{ wasFocused: boolean } | null>(null)
  const onTap = (e: React.MouseEvent) => {
    if (e.detail <= 1) firstTap.current = { wasFocused: act.isInstantFocused(inst.id) }
    if (moving) setTyping(true)
    else act.selectInstant(inst.id)
  }
  if (typing && !moving) setTyping(false)

  const zoomToFold = () => {
    const times = [ts, ...foldedIds.split(',').map(id => entities.getInstant(id)?.tsEpochMs).filter((t): t is number => typeof t === 'number')]
    act.zoomToTimes(times)
  }

  const toolButtons = selected && !moving ? (
    <>
      {!inst.favorite && <IconButton icon={StarOutline} label="Favorite" color={starColor} bare onClick={() => act.toggleFavorite(inst.id)} />}
      {!inst.alarm && !isPast && <IconButton icon={BellOutline} label="Set alarm" color={bellColor} bare onClick={() => act.toggleAlarm(inst.id)} />}
      {focused && <IconButton icon={ArrowsRightLeftIcon} label="Move instant" color="var(--c-cursor)" bare onClick={() => act.enterMove(inst.id)} />}
      <IconButton icon={inst.hidden ? EyeIcon : EyeSlashIcon} label={inst.hidden ? 'Show on the timeline' : 'Hide from the timeline (spans stay)'}
        color="var(--ink-dim)" bare onClick={() => act.setInstantHidden(inst.id, !inst.hidden)} />
      <IconButton icon={TrashIcon} label="Delete instant" color="var(--c-danger)" className="glow-box" onClick={() => act.deleteInstant(inst.id)} />
    </>
  ) : moving ? (
    <>
      <IconButton icon={ClockIcon} label="Type the time" color="var(--c-cursor)" bare pressed={typing} onClick={() => setTyping(true)} />
      <IconButton icon={CheckIcon} label="Confirm move" color="var(--c-ok)" bare onClick={act.confirmMove} />
      <IconButton icon={XMarkIcon} label="Cancel move" color="var(--c-danger)" bare onClick={act.cancelMove} />
    </>
  ) : null
  // Vertical: tools sit in a row under the chip so none lies on the marker line. Horizontal: beside the chip.
  const toolsBelow = vertical && toolButtons !== null
  const tools = toolButtons && <div className="tl-col__tools">{toolButtons}</div>
  // A chip wider than the room runs off the right edge: pull its tools row back on screen.
  const chipWidth = useChipWidths(s => s.widths[inst.id])
  const toolsPull = useFrameValue(f => (toolsBelow && chipWidth ? Math.max(0, GEOMETRY_VERTICAL.chipStart + cross + chipWidth - (f.crossSize - TOOLS_EDGE)) : 0))

  return (
    <div className={`tl-col__chip${foldCount > 0 ? ' has-fold' : ''}`} style={{ '--row': row, '--shift': `${shift}px`, ...(vertical ? { left: GEOMETRY_VERTICAL.chipStart + cross } : {}) } as CSSProperties}>
      <div ref={chipRef} className={`chip chip--saved${editing ? ' chip--editing' : ' glow-box glow-text'}${inst.label ? '' : ' chip--empty'}`}>
        {inst.favorite && (
          <IconButton icon={StarSolid} label="Unfavorite" color={starColor} bare pressed onClick={() => act.toggleFavorite(inst.id)} />
        )}
        {bellGlyph && (
          <IconButton icon={BellAlertIcon} label={ringing ? 'Dismiss alarm' : 'Turn alarm off'} color={bellColor} bare pressed
            className={ringing ? 'is-ringing' : ''} onClick={() => act.toggleAlarm(inst.id)} />
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
          {unnamed && (
            <button type="button" className="chip__name-hint" aria-label="Name this instant" onClick={() => view.editInstant(inst.id)}>name…</button>
          )}
          <button
            type="button"
            className="chip__main"
            title={`${displayName(inst.label)} · ${formatDateTime(ts)}. Click to select; double-click to focus, then again to rename`}
            onClick={onTap}
            onDoubleClick={() => act.activateInstant(inst.id, firstTap.current?.wasFocused)}
          >
            {!unnamed && <span className="chip__name">{name}</span>}
            <span className="chip__time">
              {moving ? <LiveText compute={f => formatClockCompact(f.center, true)} /> : formatClockCompact(ts, withSeconds)}
            </span>
            {showRelative && !moving && <LiveText className="chip__rel" compute={f => `· ${formatRelativeShort(ts - f.now)}`} />}
            {moving && <LiveText className="chip__rel" compute={f => `· ${formatRelativeShort(f.center - f.now)}`} />}
          </button>
          </>
        )}
      </div>
      {foldCount > 0 && (
        <button type="button" className="tl-col__fold glow-box glow-text" aria-label={`${foldCount} snooze${foldCount > 1 ? 's' : ''}, zoom to fit`} onClick={zoomToFold}>
          {SNOOZE_MARK}{foldCount}
        </button>
      )}
      {(editing || toolsBelow) && (
        <div className="tl-col__below" style={toolsPull > 0 ? { transform: `translateX(${-toolsPull}px)` } : undefined}>
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

/** The line is always drawn; the chip only when the layout gives it a row (folded and clustered instants have none). */
const SavedMarker = memo(function SavedMarker({ inst, row, cross, shift, foldCount, foldedIds, selected, focused, secondary, spanEnd, editing, moving, fineSeconds }:
  { inst: InstantRecord; row: number | undefined; cross: number; shift: number; foldCount: number; foldedIds: string } & SavedFlags) {
  const ts = inst.tsEpochMs
  const name = chipName(inst.label)
  const dropped = useUi(s => s.droppedId === inst.id)
  const stateClass = `${moving ? 'is-moving' : focused ? 'is-focused' : selected ? 'is-selected' : spanEnd ? 'is-span-end' : secondary ? 'is-secondary' : ''}${dropped ? ' is-dropped' : ''}`

  return (
    <Marker className={stateClass} ariaLabel={`Instant ${name}`} getPos={moving ? f => f.mainSize / 2 : f => f.pos(ts)}>
      {row !== undefined && (
        <SavedChip inst={inst} row={row} cross={cross} shift={shift} foldCount={foldCount} foldedIds={foldedIds}
          selected={selected} focused={focused} editing={editing} moving={moving} fineSeconds={fineSeconds} />
      )}
      {moving && <div className="tl-col__badge glow-box glow-text">Moving</div>}
    </Marker>
  )
})

/** Faint marker at the original position of an instant being moved. */
function GhostColumn({ ts }: { ts: number }) {
  return <Marker className="is-ghost" getPos={f => f.pos(ts)} />
}

export function SavedInstantColumns({ layout }: { layout: SavedLayout }) {
  const instants = useEntities(s => s.instants)
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

  // Snooze ids per chip that shows them.
  const foldedIds = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const [snooze, anchor] of Object.entries(layout.folded)) (out[anchor] ??= []).push(snooze)
    return out
  }, [layout.folded])

  return (
    <>
      {moving && <GhostColumn ts={moving.tsEpochMs} />}
      {layout.visibleIds.map(id => {
        const inst = byId.get(id)
        if (!inst) return null
        return (
          <SavedMarker
            key={id}
            inst={inst}
            row={layout.rows[id]}
            cross={layout.crossOffsets[id] ?? 0}
            shift={layout.shifts[id] ?? 0}
            foldCount={layout.foldCount[id] ?? 0}
            foldedIds={(foldedIds[id] ?? []).join(',')}
            selected={v.selected === id}
            focused={v.mode === 'instant' && v.focusedInstantId === id}
            secondary={v.secondary === id}
            spanEnd={spanEnds.has(id)}
            editing={v.editing === id}
            moving={v.moving === id}
            fineSeconds={fineSeconds}
          />
        )
      })}
      {layout.clusters.map(c => (
        <ClusterChip
          key={c.id}
          cluster={c}
          members={c.memberIds.map(m => byId.get(m)).filter((i): i is InstantRecord => !!i)}
        />
      ))}
    </>
  )
}
