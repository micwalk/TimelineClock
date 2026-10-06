// Span lanes below the timeline: implied spans for the selection, then saved spans (the focused one first).
import { useLayoutEffect, useState } from 'react'
import { ClockIcon, EyeIcon, EyeSlashIcon, MapPinIcon, PencilIcon, TrashIcon } from '@heroicons/react/20/solid'
import { StarIcon as StarSolid } from '@heroicons/react/24/solid'
import { LiveText } from '../../engine/LiveText.tsx'
import { formatDurationHMS, formatLiveSpan, livePrecision, truncateText } from '../../domain/format.ts'
import type { InstantRecord } from '../../domain/entities.ts'
import type { ResolvedSpan, TimeRef } from '../../domain/spans.ts'
import { endpointName, isFavoriteNowSpan, resolveTimeRef, spanEndName, spanHeader } from '../../domain/spans.ts'
import { useView, view } from '../../store/view.ts'
import { ui, useUi } from '../../store/ui.ts'
import * as act from '../../store/actions.ts'
import { IconButton } from '../common/IconButton.tsx'
import { InlineInput } from '../common/InlineInput.tsx'
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

/** Live length of a span ("26:13", "00:10"): whole seconds at finest, so no continuous frames. */
function Duration({ a, b }: { a: TimeRef; b: TimeRef }) {
  return (
    <LiveText
      compute={f => formatDurationHMS(Math.abs(resolveTimeRef(b, f.now, f.center) - resolveTimeRef(a, f.now, f.center)))}
    />
  )
}

/**
 * Live length of a span on a live lane's chip, as precise as the zoom allows: "26m" zoomed out,
 * then "26:13", "26:13.4", "26:13.457". Sub-second readouts ask for frames while they show.
 */
function ShortDuration({ a, b }: { a: TimeRef; b: TimeRef }) {
  return (
    <LiveText
      compute={(f, ctx) => {
        const msPerPx = 1 / f.pxPerMs
        if ((livePrecision(msPerPx) ?? 0) > 0) ctx.fast()
        return formatLiveSpan(resolveTimeRef(b, f.now, f.center) - resolveTimeRef(a, f.now, f.center), msPerPx)
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
      <ShortDuration a={a} b={b} />
    </span>
  )
}

function PinButton({ a, b }: { a: TimeRef; b: TimeRef }) {
  return <IconButton icon={MapPinIcon} label="Save this span" className="glow-box" onClick={() => act.saveSpanRefs(a, b)} />
}

function SavedSpanTools({ spanId, visible, onTypeLength }: { spanId: string; visible: boolean; onTypeLength?: () => void }) {
  return (
    <>
      <IconButton icon={PencilIcon} label="Rename span" color="#a3e635" bare onClick={() => view.editSpan(spanId)} />
      {onTypeLength && <IconButton icon={ClockIcon} label="Type the length" color="var(--c-cursor)" bare onClick={onTypeLength} />}
      <IconButton icon={visible ? EyeIcon : EyeSlashIcon} label={visible ? 'Hide span' : 'Show span'} color="var(--ink)" bare
        pressed={visible} onClick={() => act.toggleSpanVisible(spanId)} />
      <IconButton icon={TrashIcon} label="Delete span" color="var(--c-danger)" bare onClick={() => act.deleteSpan(spanId)} />
    </>
  )
}

function SavedSpanChip({ r, a, b, editing, short, onLengthDoubleClick }: {
  r: ResolvedSpan
  a: TimeRef
  b: TimeRef
  editing: boolean
  short?: boolean
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
      {nameBox ?? (name ? (
        <>
          <span className="span-chip__name" title={liveName}>{name}</span>
          <span className="span-chip__sep" aria-hidden>·</span>
        </>
      ) : null)}
      <ShortDuration a={a} b={b} />
    </span>
  )
}

/** A favorite's span to Now ends in its star; tapping the star unfavorites the instant (the lane goes). */
function FavoriteStar({ instant }: { instant: InstantRecord }) {
  const label = `Unfavorite ${endpointName(instant)}`
  return (
    <button
      type="button"
      className="span-chip__star-btn"
      aria-label={label}
      title={label}
      onClick={e => { e.stopPropagation(); act.setFavorite(instant.id, false) }}
      onDoubleClick={e => e.stopPropagation()}
    >
      <StarSolid className="span-chip__star" aria-hidden />
    </button>
  )
}

const instantTarget = (i: InstantRecord): EndTarget => ({ kind: 'instant', id: i.id })

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
  const lengthTypable = !!r.end && !live
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
      chip={<SavedSpanChip r={r} a={a} b={b} editing={editing} short={live} onLengthDoubleClick={focused ? typeLength : undefined} />}
      chipEnd={isFavoriteNowSpan(r) ? <FavoriteStar instant={r.start} /> : undefined}
      onChipClick={() => (live ? ui.toggleLaneTools(laneKey) : act.selectSpan(r.span.id))}
      onChipDoubleClick={() => act.activateSpan(r.span.id)}
      tools={controls ? () => ({ right: <SavedSpanTools spanId={r.span.id} visible={r.span.visible !== false} onTypeLength={typeLength} /> }) : undefined}
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
