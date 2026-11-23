// Span lanes below the timeline: implied spans for the selection, then saved spans (the focused one first).
import { isFixedTime } from '../../domain/dst.ts'
import { useLayoutEffect, useState, type ReactNode } from 'react'
import { ClockIcon, EyeIcon, EyeSlashIcon, MapPinIcon, PencilIcon, TrashIcon } from '@heroicons/react/20/solid'
import { PauseIcon, StarIcon as StarSolid, StopIcon } from '@heroicons/react/24/solid'
import { LiveText } from '../../engine/LiveText.tsx'
import { useFrameValue } from '../../engine/hooks.ts'
import { durationStep, formatDuration, formatDurationTo, truncateText } from '../../domain/format.ts'
import type { TimeBlock } from '../../domain/blocks.ts'
import { MARKS, TODO_UI } from '../../config/labels.ts'
import { useEntities } from '../../store/entities.ts'
import { SECOND } from '../../domain/time.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import type { ResolvedSpan, TimeRef } from '../../domain/spans.ts'
import { canStopNowSpan, endpointName, isFavoriteNowSpan, resolveTimeRef, spanEndName, spanHeader } from '../../domain/spans.ts'
import { useView, view } from '../../store/view.ts'
import { ui, useUi } from '../../store/ui.ts'
import * as act from '../../store/actions.ts'
import { IconButton } from '../common/IconButton.tsx'
import { InlineInput } from '../common/InlineInput.tsx'
import { doneOrigin } from '../common/doneOrigin.ts'
import type { EndTarget, LaneVariant } from './SpanLane.tsx'
import { SpanLane } from './SpanLane.tsx'
import { TimeEntry } from './TimeEntryPopover.tsx'
import { SpanReading } from './SpanReading.tsx'
import type { BottomLane } from './useBottomLanes.ts'
import { isLiveLane, laneHasControls, liveLaneVariant, savedLaneVariant } from './useBottomLanes.ts'
import { setLaneChipInputs } from './laneChipLayout.ts'
import { engine } from '../../engine/viewportEngine.ts'

// ---------------------------------------------------------------------------
// Shared bits

/**
 * Live length of a span, at the granularity that matters (format durationStep): "1h 5m" zoomed
 * out, "26:13", "26:13.4", "0:04.050" (zoomed in, or under a minute: a stopwatch's first lap).
 * Sub-second readouts ask for frames while they show.
 */
function Duration({ a, b }: { a: TimeRef; b: TimeRef }) {
  return (
    <LiveText
      compute={(f, ctx) => {
        const ms = resolveTimeRef(b, f.now, f.center) - resolveTimeRef(a, f.now, f.center)
        const step = durationStep(ms, { msPerPx: 1 / f.pxPerMs })
        if (step < SECOND) ctx.fast()
        return formatDurationTo(ms, step)
      }}
    />
  )
}


/** The longest span name a live lane's chip shows. */
const LIVE_NAME_MAX = 12

/** An implied lane's endpoint: where it is and what it is called. */
interface Endpoint { ref: TimeRef; name: string }
const instantEnd = (i: InstantRecord, ref: TimeRef): Endpoint => ({ ref, name: endpointName(i) })

/** "Wake up → Sleep · 16:00:00": endpoint names in time order (live, since an endpoint may be the cursor or Now), then the length. */
function ImpliedChip({ a, b }: { a: Endpoint; b: Endpoint }) {
  return (
    <span className="span-chip__text">
      <LiveText
        className="span-chip__name"
        compute={f => {
          const aFirst = resolveTimeRef(a.ref, f.now, f.center) <= resolveTimeRef(b.ref, f.now, f.center)
          return aFirst ? `${a.name} → ${b.name}` : `${b.name} → ${a.name}`
        }}
      />
      <span className="span-chip__sep" aria-hidden>·</span>
      <Duration a={a.ref} b={b.ref} />
    </span>
  )
}

/** A live implied lane's chip: just the compact length (its colour says Now or Cursor); the endpoints are for screen readers. */
function LiveImpliedChip({ from, to, a, b }: { from: string; to: string; a: TimeRef; b: TimeRef }) {
  return (
    <span className="span-chip__text">
      <span className="sr-only">{`${from} to ${to} `}</span>
      <Duration a={a} b={b} />
    </span>
  )
}

function PinButton({ a, b }: { a: TimeRef; b: TimeRef }) {
  return <IconButton icon={MapPinIcon} label="Save this span" className="glow-box" onClick={() => act.saveSpanRefs(a, b)} />
}

/**
 * A saved span's tools. A favorite's span to Now has the star instead of the eye and the trash, as
 * on its instant's chip: unfavoriting stops tracking it (the lane goes, nothing is saved); the
 * chip's ■ stop ends it and keeps it.
 */
function SavedSpanTools({ spanId, visible, onTypeLength, favoriteOf }: {
  spanId: string
  visible: boolean
  onTypeLength?: () => void
  favoriteOf?: InstantRecord
}) {
  return (
    <>
      <IconButton icon={PencilIcon} label="Rename span" color="#a3e635" bare onClick={() => view.editSpan(spanId)} />
      {onTypeLength && <IconButton icon={ClockIcon} label="Type the length" color="var(--c-cursor)" bare onClick={onTypeLength} />}
      {favoriteOf
        ? <IconButton icon={StarSolid} label={`Unfavorite ${endpointName(favoriteOf)}`} color="var(--c-favorite)" bare pressed
            onClick={() => act.setFavorite(favoriteOf.id, false)} />
        : <IconButton icon={visible ? EyeIcon : EyeSlashIcon} label={visible ? 'Hide span' : 'Show span'} color="var(--ink)" bare
            pressed={visible} onClick={() => act.toggleSpanVisible(spanId)} />}
      {!favoriteOf && <IconButton icon={TrashIcon} label="Delete span" color="var(--c-danger)" bare onClick={() => act.deleteSpan(spanId)} />}
    </>
  )
}

function SavedSpanChip({ r, a, b, editing, short, onLengthDoubleClick, beforeLength }: {
  r: ResolvedSpan
  a: TimeRef
  b: TimeRef
  editing: boolean
  short?: boolean
  /** A live chip's lap (or a todo's ⏸): left of the time, apart from the stop at the right end. */
  beforeLength?: ReactNode
  /** Double-tap on the length (a focused span): type it, rather than rename the span. */
  onLengthDoubleClick?: () => void
}) {
  const header = spanHeader(r)
  const nameBox = editing ? (
    <InlineInput
      initial={r.span.label}
      ariaLabel="Span name"
      placeholder="Span name"
      onCommit={v => act.renameSpan(r.span.id, v)}
      onCancel={() => view.editSpan(null)}
    />
  ) : undefined
  if (!short) {
    // Saved side: the same reading as the span's label box (name, time left and length, or length).
    return (
      <span className="span-chip__text span-read" title={`${endpointName(r.start)} → ${spanEndName(r)}`}>
        <SpanReading name={header ?? ''} a={a} b={b} nameSlot={nameBox} onValueDoubleClick={onLengthDoubleClick} />
      </span>
    )
  }
  // Live chips (spans to Now) name the span, else the instant it runs from.
  const liveName = header ?? (r.span.endIsNow ? endpointName(r.start) : undefined)
  const name = liveName ? truncateText(liveName, LIVE_NAME_MAX) : undefined
  return (
    <span className="span-chip__text">
      {isFavoriteNowSpan(r) && <><StarSolid className="span-chip__star" aria-hidden /><span className="sr-only">Favorite </span></>}
      {nameBox ?? (name ? (
        <>
          <span className="span-chip__name" title={liveName}>{name}</span>
          {!beforeLength && <span className="span-chip__sep" aria-hidden>·</span>}
        </>
      ) : null)}
      {beforeLength}
      <Duration a={a} b={b} />
    </span>
  )
}

/**
 * A favorite's span to Now, counting up, has a lap and a stop (the chip's only buttons, so a tap
 * near them can't hit anything worse than the chip), apart so neither is hit for the other
 * (owner 2026-11-22): the lap left of the time, the stop at the chip's right end. Stop: an instant
 * at Now ends the span, which is saved and flows to the saved side; the instant stops being a
 * favorite. Lap (a pin, #28): the same, and the new instant is tracked instead, so a span to Now
 * runs on from it.
 */
function LapButton({ instant }: { instant: InstantRecord }) {
  const lapLabel = `Lap: save ${endpointName(instant)}'s span here and go on from Now`
  return (
      <button
        type="button"
        className="span-chip__end-btn"
        aria-label={lapLabel}
        title={lapLabel}
        onClick={e => { e.stopPropagation(); act.lapNowSpan(instant.id) }}
        onDoubleClick={e => e.stopPropagation()}
      >
        <MapPinIcon className="span-chip__stop" aria-hidden />
      </button>
  )
}

function StopButton({ instant }: { instant: InstantRecord }) {
  const label = `Stop ${endpointName(instant)} here: save its span`
  return (
      <button
        type="button"
        className="span-chip__end-btn"
        aria-label={label}
        title={label}
        onClick={e => { e.stopPropagation(); act.stopNowSpan(instant.id) }}
        onDoubleClick={e => e.stopPropagation()}
      >
        <StopIcon className="span-chip__stop" aria-hidden />
      </button>
  )
}

const instantTarget = (i: InstantRecord): EndTarget => ({ kind: 'instant', id: i.id })

/**
 * A counting todo's lane (docs/prd_todos.md §7.1): its stopwatch controls become the todo's: the
 * lap is ⏸ Pause (the stretch saved, the todo open: act.pauseTodo), left of the time, and the stop
 * reads ✓ Done (the same stop: the new instant is its `done`), at the right end.
 */
function PauseButton({ instant, name }: { instant: InstantRecord; name: string }) {
  const pauseLabel = `${TODO_UI.pause}: ${name} (save this stretch)`
  return (
      <button
        type="button"
        className="span-chip__end-btn"
        aria-label={pauseLabel}
        title={pauseLabel}
        onClick={e => { e.stopPropagation(); if (instant.todo) act.pauseTodo(instant.todo.id) }}
        onDoubleClick={e => e.stopPropagation()}
      >
        <PauseIcon className="span-chip__stop" aria-hidden />
      </button>
  )
}

function DoneButton({ instant, name }: { instant: InstantRecord; name: string }) {
  const label = `${TODO_UI.done}: ${name}`
  return (
      <button
        type="button"
        className="span-chip__end-btn span-chip__end-btn--done"
        aria-label={label}
        title={label}
        onClick={e => { e.stopPropagation(); if (instant.todo) act.completeTodo(instant.todo.id, doneOrigin(e.currentTarget)); else act.stopNowSpan(instant.id) }}
        onDoubleClick={e => e.stopPropagation()}
      >
        <span className="span-chip__done" aria-hidden>{MARKS.todoDone}</span>
      </button>
  )
}

/** A block's chip (domain/blocks): its name and length, "Laundry · 20m". */
function BlockChip({ block }: { block: TimeBlock }) {
  return (
    <span className="span-chip__text">
      <span className="span-chip__name">{truncateText(block.label, 24)}</span>
      <span className="span-chip__sep" aria-hidden>·</span>
      <span className="mono">{formatDuration(block.end - block.start, { exact: true })}</span>
    </span>
  )
}

function SavedSpanLane({ r, laneKey, top, index, variant, controls, emphasis, live, toolsOpen, a = r.start.tsEpochMs, b = r.end ? r.end.tsEpochMs : 'now' }: {
  r: ResolvedSpan
  laneKey: string
  top: number | string
  index: number
  variant: LaneVariant
  controls: boolean
  emphasis?: boolean
  /** On the live side: short chip, tools only after a tap. */
  live?: boolean
  toolsOpen?: boolean
  /** Endpoint times; default to the records' times (override for live endpoints). */
  a?: TimeRef
  b?: TimeRef
}) {
  const editing = useView(s => s.editingSpanId === r.span.id)
  const isSelected = useView(s => s.selectedSpanId === r.span.id)
  const focused = useView(s => s.viewFocusMode === 'span' && s.focusedSpanId === r.span.id)
  // A span between two instants can have its length typed (its end moves): a tool, or a double-tap on the length once focused.
  const [typingLength, setTypingLength] = useState(false)
  // Not when its end is a sunrise, sunset or clock change (they never move).
  const lengthTypable = !!r.end && !live && !isFixedTime(r.end)
  // A countdown to a favorite ahead becomes stoppable once it passes (and counts up).
  const stoppable = useFrameValue(f => canStopNowSpan(r, f.now))
  // A counting todo's lane ends in ✓ Done instead of the lap and the stop.
  const todoName = useEntities(s => {
    const link = r.span.endIsNow ? r.start.todo : undefined
    const t = link ? s.todos?.find(x => x.id === link.id) : undefined
    return t?.status === 'open' ? t.label : null
  })
  const typeLength = lengthTypable ? () => setTypingLength(true) : undefined
  const lengthEntry = typingLength && r.end ? (
    <TimeEntry
      title={`Length of ${spanHeader(r) ?? 'span'}`}
      className="popover--chip"
      offset={{
        initialMs: Math.abs(r.end.tsEpochMs - r.start.tsEpochMs),
        from: endpointName(r.start),
        unsigned: true,
        onSubmit: ms => { act.setSpanLength(r.span.id, ms); setTypingLength(false) },
      }}
      onCancel={() => setTypingLength(false)}
    />
  ) : undefined
  return (
    <SpanLane
      top={top}
      index={index}
      variant={variant}
      emphasis={emphasis}
      selected={isSelected || !!emphasis}
      layoutKey={laneKey}
      live={live}
      toolsOpen={toolsOpen}
      onDismissTools={ui.closeLaneTools}
      a={a}
      b={b}
      aTarget={instantTarget(r.start)}
      bTarget={r.end ? instantTarget(r.end) : { kind: 'now' }}
      arrows={controls}
      barOnly={!controls}
      chip={<SavedSpanChip r={r} a={a} b={b} editing={editing} short={live} onLengthDoubleClick={focused ? typeLength : undefined}
        beforeLength={stoppable ? (todoName !== null ? <PauseButton instant={r.start} name={todoName} /> : <LapButton instant={r.start} />) : undefined} />}
      chipEnd={stoppable ? (todoName !== null ? <DoneButton instant={r.start} name={todoName} /> : <StopButton instant={r.start} />) : undefined}
      onChipClick={() => (live ? ui.toggleLaneTools(laneKey) : act.selectSpan(r.span.id))}
      onChipDoubleClick={() => act.activateSpan(r.span.id)}
      tools={controls ? () => ({ right: <SavedSpanTools spanId={r.span.id} visible={r.span.visible !== false} onTypeLength={typeLength}
        favoriteOf={isFavoriteNowSpan(r) ? r.start : undefined} /> }) : undefined}
      below={lengthEntry}
    />
  )
}

// ---------------------------------------------------------------------------
// Bottom lanes

export function BottomLanes({ lanes }: { lanes: BottomLane[] }) {
  const selectedSpanId = useView(s => s.selectedSpanId)
  const laneTools = useUi(s => s.laneTools)
  // Horizontal: the chips' shared layout (which fold into "N spans") reads the placed lanes.
  useLayoutEffect(() => {
    setLaneChipInputs({ lanes, selectedSpanId })
    engine.requestFrame()
  }, [lanes, selectedSpanId])
  return (
    <>
      {lanes.map(lane => {
        const live = isLiveLane(lane)
        const toolsOpen = laneTools === lane.key
        if (lane.kind === 'selected-now' || lane.kind === 'selected-cursor') {
          // Live: a thin lane on the live side with a short chip in the Now (red) or cursor accent; the pin shows after a tap.
          const s = lane.selected
          const to = lane.kind === 'selected-now' ? 'Now' : 'Cursor'
          return (
            <SpanLane
              key={lane.key}
              top={lane.top}
              index={lane.index}
              variant={liveLaneVariant(lane)}
              layoutKey={lane.key}
              live
              toolsOpen={toolsOpen}
              onDismissTools={ui.closeLaneTools}
              a={lane.a}
              b={lane.b}
              aTarget={instantTarget(s)}
              bTarget={lane.kind === 'selected-now' ? { kind: 'now' } : { kind: 'cursor' }}
              arrows
              chip={<LiveImpliedChip from={endpointName(s)} to={to} a={lane.a} b={lane.b} />}
              onChipClick={() => ui.toggleLaneTools(lane.key)}
              tools={() => ({ left: <PinButton a={lane.a} b={lane.b} /> })}
            />
          )
        }
        if (lane.kind === 'secondary') {
          const { selected: s, secondary: p } = lane
          return (
            <SpanLane
              key={lane.key}
              top={lane.top}
              index={lane.index}
              variant="secondary"
              selected
              layoutKey={lane.key}
              a={lane.a}
              b={lane.b}
              aTarget={instantTarget(p)}
              bTarget={instantTarget(s)}
              arrows
              chip={<ImpliedChip a={instantEnd(p, lane.a)} b={instantEnd(s, lane.b)} />}
              tools={() => ({ left: <PinButton a={lane.a} b={lane.b} /> })}
            />
          )
        }
        if (lane.kind === 'block') {
          // A todo's plan: a tap selects its `at`, a double-tap goes to it.
          const b = lane.block
          return (
            <SpanLane
              key={lane.key}
              top={lane.top}
              index={lane.index}
              variant="planned"
              layoutKey={lane.key}
              a={lane.a}
              b={lane.b}
              chip={<BlockChip block={b} />}
              chipLabel={`Planned: ${b.label}, ${formatDuration(b.end - b.start, { exact: true })}`}
              onChipClick={b.instantId ? () => act.selectInstant(b.instantId!) : undefined}
              onChipDoubleClick={b.instantId ? () => act.focusInstant(b.instantId!) : undefined}
            />
          )
        }
        const r = lane.span
        const variant: LaneVariant = live ? 'now' : savedLaneVariant(r)
        const controls = live || laneHasControls(lane, selectedSpanId)
        return (
          <SavedSpanLane key={lane.key} laneKey={lane.key} r={r} a={lane.a} b={lane.b} top={lane.top} index={lane.index}
            variant={variant} controls={controls} emphasis={r.focused} live={live} toolsOpen={toolsOpen} />
        )
      })}
    </>
  )
}
