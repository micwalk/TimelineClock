// Vertical instant markers: Now, the Cursor, and saved instants. Each is one
// absolutely positioned column (line + label chip + time chip + tools) moved as a
// unit by a transform.
import { memo, useMemo, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { StarIcon as StarOutline, BellIcon as BellOutline } from '@heroicons/react/24/outline'
import { StarIcon as StarSolid, BellAlertIcon } from '@heroicons/react/24/solid'
import { ArrowsRightLeftIcon, CheckIcon, TrashIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { shallowArrayEqual, useFrameValue, usePositionMain } from '../../engine/hooks.ts'
import { LiveText } from '../../engine/LiveText.tsx'
import type { Frame } from '../../engine/viewportEngine.ts'
import { chipName, formatClock12h, formatClockCompact, formatDateTime, formatRelativeShort, showsSeconds } from '../../domain/format.ts'
import { pickTickTiers } from '../../domain/ticks.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import { displayName } from '../../domain/entities.ts'
import { useEntities } from '../../store/entities.ts'
import { useView, view } from '../../store/view.ts'
import { useAlarms } from '../../store/alarms.ts'
import { ui, useUi } from '../../store/ui.ts'
import { getTunables } from '../../store/settings.ts'
import * as act from '../../store/actions.ts'
import { IconButton } from '../common/IconButton.tsx'
import { InlineInput } from '../common/InlineInput.tsx'
import { ClockPopover } from './TimeEntryPopover.tsx'
import { Marker } from './Marker.tsx'

/** Label chips extend past the line; keep columns mounted this far off screen. */
const CULL_MARGIN_PX = 400

interface ColumnProps {
  className: string
  getPos: (f: Frame) => number
  label: ReactNode
  icons?: ReactNode
  time: ReactNode
  actions?: ReactNode
  badge?: ReactNode
  ariaLabel: string
}

function Column({ className, getPos, label, icons, time, actions, badge, ariaLabel }: ColumnProps) {
  const ref = useRef<HTMLDivElement>(null)
  usePositionMain(ref, getPos)
  return (
    <div ref={ref} className={`tl-col ${className}`} role="group" aria-label={ariaLabel}>
      <div className="tl-col__line" />
      <div className="tl-col__row tl-col__row--label">
        {label}
        {icons && <div className="tl-col__icons">{icons}</div>}
      </div>
      <div className="tl-col__row tl-col__row--time">{time}</div>
      {actions && <div className="tl-col__row tl-col__row--actions">{actions}</div>}
      {badge}
    </div>
  )
}

const starColor = 'var(--c-favorite)'
const bellColor = 'var(--c-alarm)'

// ---------------------------------------------------------------------------

export function NowColumn() {
  const focused = useView(s => s.viewFocusMode === 'now')
  const clockOpen = useUi(s => s.timeInput?.kind === 'clock' && s.timeInput.anchor === 'now')
  return (
    <Column
      className={`is-now${focused ? ' is-focused' : ''}${clockOpen ? ' has-popover' : ''}`}
      ariaLabel="Now"
      getPos={f => f.pos(f.now)}
      label={
        <button
          type="button"
          className="chip chip--label glow-box glow-text"
          title="Double-click to save an instant at Now"
          onDoubleClick={() => act.createInstantAndEdit(Date.now())}
        >
          Now
        </button>
      }
      icons={
        <IconButton icon={StarOutline} label="Save Now as a favorite" color={starColor} bare
          onClick={() => act.createInstantAndEdit(Date.now(), { favorite: true })} />
      }
      time={
        <div className="tl-col__time-wrap">
          <button
            type="button"
            className="chip chip--time glow-box glow-text"
            title="Double-click to set the cursor to a time"
            onDoubleClick={() => (focused ? ui.openTimeInput({ kind: 'clock', anchor: 'now' }) : act.focusNow())}
          >
            <LiveText compute={f => formatClock12h(f.now)} />
          </button>
          {clockOpen && (
            <ClockPopover
              initialTs={Date.now()}
              onCancel={ui.closeTimeInput}
              onSubmit={(h, m, s, pm) => { act.applyClockInput(h, m, s, pm); ui.closeTimeInput() }}
            />
          )}
        </div>
      }
    />
  )
}

export function CursorColumn() {
  const visible = useView(s => s.viewFocusMode === 'cursor' && !s.moveMode)
  const clockOpen = useUi(s => s.timeInput?.kind === 'clock' && s.timeInput.anchor === 'cursor')
  if (!visible) return null
  return (
    <Column
      className={`is-cursor${clockOpen ? ' has-popover' : ''}`}
      ariaLabel="Cursor"
      getPos={f => f.mainSize / 2}
      label={
        <button
          type="button"
          className="chip chip--label glow-box glow-text"
          title="Double-click to save an instant here"
          onDoubleClick={() => act.createInstantAndEdit(act.cursorTime())}
        >
          Cursor
        </button>
      }
      icons={
        <IconButton icon={StarOutline} label="Save cursor as a favorite" color={starColor} bare
          onClick={() => act.createInstantAndEdit(act.cursorTime(), { favorite: true })} />
      }
      time={
        <div className="tl-col__time-wrap">
          <button
            type="button"
            className="chip chip--time glow-box glow-text"
            title="Double-click to type a time"
            onDoubleClick={() => ui.openTimeInput({ kind: 'clock', anchor: 'cursor' })}
          >
            <LiveText compute={f => formatClock12h(f.center)} />
          </button>
          {clockOpen && (
            <ClockPopover
              initialTs={act.cursorTime()}
              onCancel={ui.closeTimeInput}
              onSubmit={(h, m, s, pm) => { act.applyClockInput(h, m, s, pm); ui.closeTimeInput() }}
            />
          )}
        </div>
      }
    />
  )
}

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

const SavedMarker = memo(function SavedMarker({ inst, selected, focused, secondary, spanEnd, editing, moving, fineSeconds }: { inst: InstantRecord } & SavedFlags) {
  const ts = inst.tsEpochMs
  const isPast = useFrameValue(f => ts < f.now)
  const ringing = useAlarms(s => s.ringing.some(r => r.instantId === inst.id))
  const name = chipName(inst.label)

  const stateClass = moving ? 'is-moving' : focused ? 'is-focused' : selected ? 'is-selected' : spanEnd ? 'is-span-end' : secondary ? 'is-secondary' : ''
  const bellGlyph = (!!inst.alarm && !isPast) || ringing
  const showRelative = !!inst.favorite || !!inst.alarm || selected || focused
  const withSeconds = fineSeconds || selected || focused

  return (
    <Marker className={stateClass} ariaLabel={`Instant ${name}`} getPos={moving ? f => f.mainSize / 2 : f => f.pos(ts)}>
      <div className="tl-col__chip" style={{ '--row': 0 } as CSSProperties}>
        <div className={`chip chip--saved glow-box glow-text${inst.label ? '' : ' chip--empty'}`}>
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
            <button
              type="button"
              className="chip__main"
              title={`${displayName(inst.label)} · ${formatDateTime(ts)}. Click to select; double-click the name to rename, the time to focus`}
              onClick={() => act.selectInstant(inst.id)}
            >
              <span className="chip__name" onDoubleClick={() => view.editInstant(inst.id)}>{name}</span>
              <span className="chip__time" onDoubleClick={() => act.focusInstant(inst.id)}>
                {moving ? <LiveText compute={f => formatClockCompact(f.center, true)} /> : formatClockCompact(ts, withSeconds)}
              </span>
              {showRelative && !moving && <LiveText className="chip__rel" compute={f => `· ${formatRelativeShort(ts - f.now)}`} />}
            </button>
          )}
        </div>
        {selected && !moving && (
          <div className="tl-col__tools">
            {!inst.favorite && <IconButton icon={StarOutline} label="Favorite" color={starColor} bare onClick={() => act.toggleFavorite(inst.id)} />}
            {!inst.alarm && !isPast && <IconButton icon={BellOutline} label="Set alarm" color={bellColor} bare onClick={() => act.toggleAlarm(inst.id)} />}
            {focused && <IconButton icon={ArrowsRightLeftIcon} label="Move instant" color="var(--c-cursor)" bare onClick={() => act.enterMove(inst.id)} />}
            <IconButton icon={TrashIcon} label="Delete instant" color="var(--c-danger)" className="glow-box" onClick={() => act.deleteInstant(inst.id)} />
          </div>
        )}
        {moving && (
          <div className="tl-col__tools">
            <IconButton icon={CheckIcon} label="Confirm move" color="var(--c-ok)" bare onClick={act.confirmMove} />
            <IconButton icon={XMarkIcon} label="Cancel move" color="var(--c-danger)" bare onClick={act.cancelMove} />
          </div>
        )}
      </div>
      {moving && <div className="tl-col__badge glow-box glow-text">Moving</div>}
    </Marker>
  )
})

/** Faint marker at the original position of an instant being moved. */
function GhostColumn({ ts }: { ts: number }) {
  return <Marker className="is-ghost" getPos={f => f.pos(ts)} />
}

export function SavedInstantColumns() {
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

  // Mount only instants near the screen (plus anything selected/focused/edited).
  const pinned = useMemo(() => new Set([v.selected, v.secondary, v.focusedInstantId, v.editing, v.moving].filter(Boolean) as string[]), [v])
  const visibleIds = useFrameValue(f => {
    const margin = CULL_MARGIN_PX / f.pxPerMs
    const lo = f.start - margin
    const hi = f.end + margin
    return instants.filter(i => pinned.has(i.id) || (i.tsEpochMs >= lo && i.tsEpochMs <= hi)).map(i => i.id)
  }, shallowArrayEqual)
  const fineSeconds = useFrameValue(f => showsSeconds(pickTickTiers(f.pxPerMs)[0].ms, getTunables().secondsBelowTickMs))

  const spanEnds = useMemo(() => {
    if (v.mode !== 'span' || !v.focusedSpanId) return new Set<string>()
    const sp = spans.find(s => s.id === v.focusedSpanId)
    return new Set(sp ? [sp.startInstantId, sp.endInstantId] : [])
  }, [spans, v.mode, v.focusedSpanId])

  const byId = useMemo(() => new Map(instants.map(i => [i.id, i])), [instants])
  const moving = v.moving ? byId.get(v.moving) : undefined

  return (
    <>
      {moving && <GhostColumn ts={moving.tsEpochMs} />}
      {visibleIds.map(id => {
        const inst = byId.get(id)
        if (!inst) return null
        return (
          <SavedMarker
            key={id}
            inst={inst}
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
    </>
  )
}
