// Span lanes. Top lanes show the interaction spans (Cursor↔Now and Selected↔Cursor
// or the focused span); bottom lanes show implied spans for the selection followed
// by saved spans.
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { EyeIcon, EyeSlashIcon, LockClosedIcon, LockOpenIcon, MapPinIcon, PencilIcon, TrashIcon } from '@heroicons/react/20/solid'
import { StarIcon as StarSolid } from '@heroicons/react/24/solid'
import { LiveText } from '../../engine/LiveText.tsx'
import { durationShowsMillis, formatSignedDuration } from '../../domain/format.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import { displayName } from '../../domain/entities.ts'
import type { ResolvedSpan, TimeRef } from '../../domain/spans.ts'
import { isFavoriteNowSpan, resolveSpan, resolveTimeRef, spanDescription, spanEndName, spanHeader } from '../../domain/spans.ts'
import { useEntities } from '../../store/entities.ts'
import { useView, view } from '../../store/view.ts'
import { ui, useUi } from '../../store/ui.ts'
import * as act from '../../store/actions.ts'
import { IconButton } from '../common/IconButton.tsx'
import { InlineInput } from '../common/InlineInput.tsx'
import type { EndTarget, LaneVariant } from './SpanLane.tsx'
import { SpanLane } from './SpanLane.tsx'
import { DurationPopover } from './TimeEntryPopover.tsx'
import type { BottomLane } from './useBottomLanes.ts'

// ---------------------------------------------------------------------------
// Shared bits

/** Live "{end} {dur} AFTER {start}" text; asks for continuous frames while showing ms. */
function Description({ a, b, startName, endName }: { a: TimeRef; b: TimeRef; startName: string; endName: string }) {
  return (
    <LiveText
      compute={(f, ctx) => {
        const aTs = resolveTimeRef(a, f.now, f.center)
        const bTs = resolveTimeRef(b, f.now, f.center)
        if ((a === 'now' || b === 'now') && durationShowsMillis(bTs - aTs)) ctx.fast()
        return spanDescription(aTs, bTs, startName, endName)
      }}
    />
  )
}

/** Live signed duration from `from` to `to` (e.g. "+01:30:00"). */
function SignedDuration({ from, to }: { from: TimeRef; to: TimeRef }) {
  return (
    <LiveText
      compute={(f, ctx) => {
        const d = resolveTimeRef(to, f.now, f.center) - resolveTimeRef(from, f.now, f.center)
        if ((from === 'now' || to === 'now') && durationShowsMillis(d)) ctx.fast()
        return formatSignedDuration(d)
      }}
    />
  )
}

function PinButton({ a, b }: { a: TimeRef; b: TimeRef }) {
  return <IconButton icon={MapPinIcon} label="Save this span" className="glow-box" onClick={() => act.saveSpanRefs(a, b)} />
}

function SavedSpanTools({ spanId, visible }: { spanId: string; visible: boolean }) {
  return (
    <>
      <IconButton icon={PencilIcon} label="Rename span" color="#a3e635" bare onClick={() => view.editSpan(spanId)} />
      <IconButton icon={visible ? EyeIcon : EyeSlashIcon} label={visible ? 'Hide span' : 'Show span'} color="var(--ink)" bare
        pressed={visible} onClick={() => act.toggleSpanVisible(spanId)} />
      <IconButton icon={TrashIcon} label="Delete span" color="var(--c-danger)" bare onClick={() => act.deleteSpan(spanId)} />
    </>
  )
}

function SavedSpanChip({ r, editing }: { r: ResolvedSpan; editing: boolean }) {
  const header = spanHeader(r)
  return (
    <>
      {editing ? (
        <InlineInput
          initial={r.span.label}
          ariaLabel="Span name"
          placeholder="Span name"
          onCommit={v => act.renameSpan(r.span.id, v)}
          onCancel={() => view.editSpan(null)}
        />
      ) : header ? (
        <span className="span-chip__header">{header}</span>
      ) : null}
      <span className="span-chip__text">
        <Description a={r.start.tsEpochMs} b={r.end ? r.end.tsEpochMs : 'now'} startName={displayName(r.start.label)} endName={spanEndName(r)} />
        {isFavoriteNowSpan(r) && <StarSolid className="span-chip__star" aria-label="Favorite" />}
      </span>
    </>
  )
}

const instantTarget = (i: InstantRecord): EndTarget => ({ kind: 'instant', id: i.id })

function SavedSpanLane({ r, top, variant, controls, emphasis }: { r: ResolvedSpan; top: number | string; variant: LaneVariant; controls: boolean; emphasis?: boolean }) {
  const editing = useView(s => s.editingSpanId === r.span.id)
  return (
    <SpanLane
      top={top}
      variant={variant}
      emphasis={emphasis}
      a={r.start.tsEpochMs}
      b={r.end ? r.end.tsEpochMs : 'now'}
      aTarget={instantTarget(r.start)}
      bTarget={r.end ? instantTarget(r.end) : { kind: 'now' }}
      arrows={controls}
      chipLabel={`Span ${spanHeader(r) ?? ''}`}
      chip={<SavedSpanChip r={r} editing={editing} />}
      onChipClick={() => act.selectSpan(r.span.id)}
      onChipDoubleClick={() => act.activateSpan(r.span.id)}
      tools={controls ? () => ({ right: <SavedSpanTools spanId={r.span.id} visible={r.span.visible !== false} /> }) : undefined}
    />
  )
}

// ---------------------------------------------------------------------------
// Top lanes

export function TopLanes() {
  const instants = useEntities(s => s.instants)
  const spans = useEntities(s => s.spans)
  const v = useView(useShallow(s => ({
    mode: s.viewFocusMode,
    focusedInstantId: s.focusedInstantId,
    focusedSpanId: s.focusedSpanId,
    selectedId: s.currentSelectedInstantId,
    moving: s.moveMode?.instantId ?? null,
    locked: s.cursorLocked,
    selectedSpanId: s.selectedSpanId,
  })))
  const timeInput = useUi(s => s.timeInput)
  const byId = useMemo(() => new Map(instants.map(i => [i.id, i])), [instants])

  const focused = v.mode === 'instant' ? byId.get(v.focusedInstantId ?? '') : undefined
  const selected = byId.get(v.selectedId ?? '')

  // Lane A: Cursor (or focused instant) ↔ Now
  let laneA: ReactNode = null
  if (v.mode === 'cursor' || (v.mode === 'instant' && focused)) {
    const source: TimeRef = v.mode === 'instant' && focused ? focused.tsEpochMs : 'center'
    const durationOpen = timeInput?.kind === 'duration' && timeInput.reference === 'now'
    laneA = (
      <SpanLane
        top="var(--tl-lane-a)"
        variant="now"
        a={source}
        b="now"
        bTarget={{ kind: 'now' }}
        arrows
        chipLabel="Offset from Now; click to type"
        chip={<span className="span-chip__text"><SignedDuration from="now" to={source} /></span>}
        onChipClick={() => ui.openTimeInput({ kind: 'duration', reference: 'now' })}
        tools={({ aIsLeft }) => {
          const extras = (
            <>
              <PinButton a={source} b="now" />
              <IconButton icon={v.locked ? LockClosedIcon : LockOpenIcon} label={v.locked ? 'Unlock cursor from Now' : 'Lock cursor offset to Now'}
                color={v.locked ? 'var(--c-alarm)' : undefined} className="glow-box" pressed={v.locked} onClick={act.toggleCursorLock} />
            </>
          )
          // Arrow to Now sits on Now's side; save/lock go on the other side.
          return aIsLeft ? { left: extras } : { right: extras }
        }}
        below={durationOpen ? (
          <DurationPopover
            title="Offset from Now"
            initialMs={act.cursorTime() - Date.now()}
            onCancel={ui.closeTimeInput}
            onSubmit={text => { if (act.applyDurationInput(text, 'now')) ui.closeTimeInput() }}
          />
        ) : undefined}
      />
    )
  }

  // Lane B: Selected ↔ Cursor, Selected ↔ Focused, or the focused saved span
  let laneB: ReactNode = null
  if (v.mode === 'span' && v.focusedSpanId) {
    const sp = spans.find(s => s.id === v.focusedSpanId)
    const r = sp ? resolveSpan(sp, byId) : null
    if (r) laneB = <SavedSpanLane r={r} top="var(--tl-lane-b)" variant="span" controls emphasis />
  } else if (v.mode === 'cursor' && selected && selected.id !== v.moving) {
    const durationOpen = timeInput?.kind === 'duration' && timeInput.reference === 'selected'
    laneB = (
      <SpanLane
        top="var(--tl-lane-b)"
        variant="cursor"
        a={selected.tsEpochMs}
        b="center"
        aTarget={instantTarget(selected)}
        bTarget={{ kind: 'cursor' }}
        arrows
        chipLabel="Offset from selected instant; click to type"
        chip={<span className="span-chip__text"><SignedDuration from={selected.tsEpochMs} to="center" /></span>}
        onChipClick={() => ui.openTimeInput({ kind: 'duration', reference: 'selected' })}
        tools={({ aIsLeft }) => {
          // The pin goes on the side away from the cursor.
          const pin = <PinButton a={selected.tsEpochMs} b="center" />
          return aIsLeft ? { left: pin } : { right: pin }
        }}
        below={durationOpen ? (
          <DurationPopover
            title="Offset from selected instant"
            initialMs={act.cursorTime() - selected.tsEpochMs}
            onCancel={ui.closeTimeInput}
            onSubmit={text => { if (act.applyDurationInput(text, 'selected')) ui.closeTimeInput() }}
          />
        ) : undefined}
      />
    )
  } else if (v.mode === 'instant' && focused && selected && selected.id !== focused.id) {
    laneB = (
      <SpanLane
        top="var(--tl-lane-b)"
        variant="cursor"
        a={selected.tsEpochMs}
        b={focused.tsEpochMs}
        aTarget={instantTarget(selected)}
        bTarget={instantTarget(focused)}
        arrows
        chip={<span className="span-chip__text"><Description a={selected.tsEpochMs} b={focused.tsEpochMs} startName={displayName(selected.label)} endName={displayName(focused.label)} /></span>}
        tools={() => ({ left: <PinButton a={selected.tsEpochMs} b={focused.tsEpochMs} /> })}
      />
    )
  }

  return <>{laneA}{laneB}</>
}

// ---------------------------------------------------------------------------
// Bottom lanes

export function BottomLanes({ lanes }: { lanes: BottomLane[] }) {
  const selectedSpanId = useView(s => s.selectedSpanId)
  return (
    <>
      {lanes.map(lane => {
        if (lane.kind === 'selected-now') {
          const s = lane.selected
          return (
            <SpanLane
              key={lane.key}
              top={lane.top}
              variant="selected"
              a={s.tsEpochMs}
              b="now"
              aTarget={instantTarget(s)}
              bTarget={{ kind: 'now' }}
              arrows
              chip={<span className="span-chip__text"><Description a={s.tsEpochMs} b="now" startName={displayName(s.label)} endName="Now" /></span>}
              tools={() => ({ left: <PinButton a={s.tsEpochMs} b="now" /> })}
            />
          )
        }
        if (lane.kind === 'secondary') {
          const { selected: s, secondary: p } = lane
          return (
            <SpanLane
              key={lane.key}
              top={lane.top}
              variant="secondary"
              a={p.tsEpochMs}
              b={s.tsEpochMs}
              aTarget={instantTarget(p)}
              bTarget={instantTarget(s)}
              arrows
              chip={<span className="span-chip__text"><Description a={p.tsEpochMs} b={s.tsEpochMs} startName={displayName(p.label)} endName={displayName(s.label, 'selected')} /></span>}
              tools={() => ({ left: <PinButton a={p.tsEpochMs} b={s.tsEpochMs} /> })}
            />
          )
        }
        const r = lane.span
        const variant: LaneVariant = r.priority === 0 ? 'focused' : r.priority === 1 ? 'selected' : 'span'
        const controls = r.priority <= 1 || selectedSpanId === r.span.id
        return <SavedSpanLane key={lane.key} r={r} top={lane.top} variant={variant} controls={controls} />
      })}
    </>
  )
}

