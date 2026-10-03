// Span lanes below the timeline: implied spans for the selection, then saved spans (the focused one first).
import { EyeIcon, EyeSlashIcon, MapPinIcon, PencilIcon, TrashIcon } from '@heroicons/react/20/solid'
import { StarIcon as StarSolid } from '@heroicons/react/24/solid'
import { LiveText } from '../../engine/LiveText.tsx'
import { durationShowsMillis, formatDurationHMS } from '../../domain/format.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import { displayName } from '../../domain/entities.ts'
import type { ResolvedSpan, TimeRef } from '../../domain/spans.ts'
import { isFavoriteNowSpan, resolveTimeRef, spanEndName, spanHeader } from '../../domain/spans.ts'
import { useView, view } from '../../store/view.ts'
import * as act from '../../store/actions.ts'
import { IconButton } from '../common/IconButton.tsx'
import { InlineInput } from '../common/InlineInput.tsx'
import type { EndTarget, LaneVariant } from './SpanLane.tsx'
import { SpanLane } from './SpanLane.tsx'
import type { BottomLane } from './useBottomLanes.ts'
import { laneHasControls } from './useBottomLanes.ts'

// ---------------------------------------------------------------------------
// Shared bits

/** Live length of a span ("26:13"); asks for continuous frames while showing ms. */
function Duration({ a, b }: { a: TimeRef; b: TimeRef }) {
  const live = a === 'now' || b === 'now' || a === 'center' || b === 'center'
  return (
    <LiveText
      compute={(f, ctx) => {
        const ms = Math.abs(resolveTimeRef(b, f.now, f.center) - resolveTimeRef(a, f.now, f.center))
        if (live && durationShowsMillis(ms)) ctx.fast()
        return formatDurationHMS(ms)
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

function SavedSpanChip({ r, a, b, editing, expanded }: { r: ResolvedSpan; a: TimeRef; b: TimeRef; editing: boolean; expanded: boolean }) {
  const header = spanHeader(r)
  const ends = `${displayName(r.start.label)} → ${spanEndName(r)}`
  const name = expanded ? (header ? `${header}: ${ends}` : ends) : header
  return (
    <span className="span-chip__text">
      {editing ? (
        <InlineInput
          initial={r.span.label}
          ariaLabel="Span name"
          placeholder="Span name"
          onCommit={v => act.renameSpan(r.span.id, v)}
          onCancel={() => view.editSpan(null)}
        />
      ) : name ? (
        <>
          <span className="span-chip__name" title={name}>{name}</span>
          <span className="span-chip__sep" aria-hidden>·</span>
        </>
      ) : null}
      <Duration a={a} b={b} />
      {isFavoriteNowSpan(r) && <StarSolid className="span-chip__star" aria-label="Favorite" />}
    </span>
  )
}

const instantTarget = (i: InstantRecord): EndTarget => ({ kind: 'instant', id: i.id })

function SavedSpanLane({ r, top, index, variant, controls, emphasis, a = r.start.tsEpochMs, b = r.end ? r.end.tsEpochMs : 'now' }: {
  r: ResolvedSpan
  top: number | string
  index: number
  variant: LaneVariant
  controls: boolean
  emphasis?: boolean
  /** Endpoint times; default to the records' times (override for live endpoints). */
  a?: TimeRef
  b?: TimeRef
}) {
  const editing = useView(s => s.editingSpanId === r.span.id)
  const expanded = useView(s => s.selectedSpanId === r.span.id)
  return (
    <SpanLane
      top={top}
      index={index}
      variant={variant}
      emphasis={emphasis}
      a={a}
      b={b}
      aTarget={instantTarget(r.start)}
      bTarget={r.end ? instantTarget(r.end) : { kind: 'now' }}
      arrows={controls}
      barOnly={!controls}
      chip={<SavedSpanChip r={r} a={a} b={b} editing={editing} expanded={expanded} />}
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
              index={lane.index}
              variant="selected"
              a={lane.a}
              b="now"
              aTarget={instantTarget(s)}
              bTarget={{ kind: 'now' }}
              arrows
              chip={<span className="span-chip__text"><Duration a={lane.a} b="now" /></span>}
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
              index={lane.index}
              variant="secondary"
              a={lane.a}
              b={lane.b}
              aTarget={instantTarget(p)}
              bTarget={instantTarget(s)}
              arrows
              chip={<span className="span-chip__text"><Duration a={lane.a} b={lane.b} /></span>}
              tools={() => ({ left: <PinButton a={lane.a} b={lane.b} /> })}
            />
          )
        }
        const r = lane.span
        const variant: LaneVariant = r.focused ? 'span' : r.priority === 0 ? 'focused' : r.priority === 1 ? 'selected' : 'span'
        const controls = laneHasControls(lane, selectedSpanId)
        return <SavedSpanLane key={lane.key} r={r} a={lane.a} b={lane.b} top={lane.top} index={lane.index} variant={variant} controls={controls} emphasis={r.focused} />
      })}
    </>
  )
}

