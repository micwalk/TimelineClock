// Span lanes below the timeline: implied spans for the selection, then saved spans (the focused one first).
import { EyeIcon, EyeSlashIcon, MapPinIcon, PencilIcon, TrashIcon } from '@heroicons/react/20/solid'
import { StarIcon as StarSolid } from '@heroicons/react/24/solid'
import { LiveText } from '../../engine/LiveText.tsx'
import { durationShowsMillis } from '../../domain/format.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import { displayName } from '../../domain/entities.ts'
import type { ResolvedSpan, TimeRef } from '../../domain/spans.ts'
import { isFavoriteNowSpan, resolveTimeRef, spanDescription, spanEndName, spanHeader } from '../../domain/spans.ts'
import { useView, view } from '../../store/view.ts'
import * as act from '../../store/actions.ts'
import { IconButton } from '../common/IconButton.tsx'
import { InlineInput } from '../common/InlineInput.tsx'
import type { EndTarget, LaneVariant } from './SpanLane.tsx'
import { SpanLane } from './SpanLane.tsx'
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

function SavedSpanChip({ r, a, b, editing }: { r: ResolvedSpan; a: TimeRef; b: TimeRef; editing: boolean }) {
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
        <Description a={a} b={b} startName={displayName(r.start.label)} endName={spanEndName(r)} />
        {isFavoriteNowSpan(r) && <StarSolid className="span-chip__star" aria-label="Favorite" />}
      </span>
    </>
  )
}

const instantTarget = (i: InstantRecord): EndTarget => ({ kind: 'instant', id: i.id })

function SavedSpanLane({ r, top, variant, controls, emphasis, a = r.start.tsEpochMs, b = r.end ? r.end.tsEpochMs : 'now' }: {
  r: ResolvedSpan
  top: number | string
  variant: LaneVariant
  controls: boolean
  emphasis?: boolean
  /** Endpoint times; default to the records' times (override for live endpoints). */
  a?: TimeRef
  b?: TimeRef
}) {
  const editing = useView(s => s.editingSpanId === r.span.id)
  return (
    <SpanLane
      top={top}
      variant={variant}
      emphasis={emphasis}
      a={a}
      b={b}
      aTarget={instantTarget(r.start)}
      bTarget={r.end ? instantTarget(r.end) : { kind: 'now' }}
      arrows={controls}
      chipLabel={`Span ${spanHeader(r) ?? ''}`}
      chip={<SavedSpanChip r={r} a={a} b={b} editing={editing} />}
      onChipClick={() => act.selectSpan(r.span.id)}
      onChipDoubleClick={() => act.activateSpan(r.span.id)}
      tools={controls ? () => ({ right: <SavedSpanTools spanId={r.span.id} visible={r.span.visible !== false} /> }) : undefined}
    />
  )
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
              a={lane.a}
              b="now"
              aTarget={instantTarget(s)}
              bTarget={{ kind: 'now' }}
              arrows
              chip={<span className="span-chip__text"><Description a={lane.a} b="now" startName={displayName(s.label)} endName="Now" /></span>}
              tools={() => ({ left: <PinButton a={lane.a} b="now" /> })}
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
              a={lane.a}
              b={lane.b}
              aTarget={instantTarget(p)}
              bTarget={instantTarget(s)}
              arrows
              chip={<span className="span-chip__text"><Description a={lane.a} b={lane.b} startName={displayName(p.label)} endName={displayName(s.label, 'selected')} /></span>}
              tools={() => ({ left: <PinButton a={lane.a} b={lane.b} /> })}
            />
          )
        }
        const r = lane.span
        const variant: LaneVariant = r.focused ? 'span' : r.priority === 0 ? 'focused' : r.priority === 1 ? 'selected' : 'span'
        const controls = r.focused || r.priority <= 1 || selectedSpanId === r.span.id
        return <SavedSpanLane key={lane.key} r={r} a={lane.a} b={lane.b} top={lane.top} variant={variant} controls={controls} emphasis={r.focused} />
      })}
    </>
  )
}

