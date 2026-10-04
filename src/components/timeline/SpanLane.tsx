// One span lane (a horizontal line, or a vertical bar at the right or, for live lanes, left edge): a glowing line between two times, off-screen chevrons,
// endpoint arrows on the line at its visible ends, and a chip centered on the visible part of the line with tools on either side.
// Geometry is written per frame; React only re-renders when content changes.
import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon } from '@heroicons/react/20/solid'
import { useFrameListener, useFrameValue } from '../../engine/hooks.ts'
import type { TimeRef } from '../../domain/spans.ts'
import { resolveTimeRef, spanGeometry } from '../../domain/spans.ts'
import { IconButton } from '../common/IconButton.tsx'
import { useLayout } from '../../store/layout.ts'
import { focusInstant, focusNow } from '../../store/actions.ts'
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss.ts'
import { observeLaneChip, rightSideLayout } from './rightSideLayout.ts'

/** `now` and `cursor` are the live lanes' accents (red, cursor colour); the rest are saved-side lanes. */
export type LaneVariant = 'now' | 'cursor' | 'selected' | 'secondary' | 'focused' | 'span'

/** What an endpoint arrow jumps to. Cursor endpoints get no arrow. */
export type EndTarget = { kind: 'instant'; id: string } | { kind: 'now' } | { kind: 'cursor' }

export interface SpanLaneProps {
  /** Vertical center of the lane in px, or a CSS length. */
  top: number | string
  /**
   * A live lane (an endpoint at Now or the cursor): drawn on the live side, above the tags (horizontal) or at the left edge (vertical).
   * Its arrows and tools stay hidden until the chip is tapped (`toolsOpen`); an outside tap or Escape calls `onDismissTools`.
   */
  live?: boolean
  toolsOpen?: boolean
  onDismissTools?: () => void
  /** Vertical: draw only the bar, no chip or tools. */
  barOnly?: boolean
  /** Vertical: lane number from the right edge. */
  index?: number
  variant: LaneVariant
  a: TimeRef
  b: TimeRef
  aTarget?: EndTarget
  bTarget?: EndTarget
  /** Show endpoint arrows (focus jump buttons). */
  arrows?: boolean
  emphasis?: boolean
  hot?: boolean
  chip: ReactNode
  onChipClick?: () => void
  onChipDoubleClick?: () => void
  chipLabel?: string
  /** Extra tools; `startIsLeft` tells which side each endpoint is on right now. */
  tools?: (order: { aIsLeft: boolean }) => { left?: ReactNode; right?: ReactNode }
  /** Content rendered below the chip (e.g. a popover). */
  below?: ReactNode
  /** Selected or focused: its chip, tools and endpoint arrows draw over everything else. */
  selected?: boolean
  /** Vertical: key in the shared lane layout (rightSideLayout), which places the chip clear of other lane chips. */
  layoutKey?: string
}

function arrowFor(target: EndTarget | undefined, side: 'left' | 'right', vertical: boolean) {
  if (!target || target.kind === 'cursor') return null
  const onClick = target.kind === 'now' ? () => focusNow() : () => focusInstant(target.id)
  return (
    <IconButton
      key={`arrow-${side}`}
      icon={vertical ? (side === 'left' ? ChevronUpIcon : ChevronDownIcon) : side === 'left' ? ChevronLeftIcon : ChevronRightIcon}
      label={target.kind === 'now' ? 'Focus Now' : 'Focus endpoint'}
      onClick={onClick}
      className="glow-box"
    />
  )
}

export function SpanLane(props: SpanLaneProps) {
  const { top, barOnly, live, toolsOpen, onDismissTools, index = 0, variant, a, b, aTarget, bTarget, arrows, emphasis, hot, chip, onChipClick, onChipDoubleClick, chipLabel, tools, below, selected, layoutKey } = props
  const vertical = useLayout(s => s.orientation === 'vertical')
  const lineRef = useRef<HTMLDivElement>(null)
  const leftChevRef = useRef<HTMLDivElement>(null)
  const rightChevRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const startEndRef = useRef<HTMLDivElement>(null)
  const finishEndRef = useRef<HTMLDivElement>(null)
  const chipWrapRef = useRef<HTMLDivElement>(null)
  const showTools = !live || !!toolsOpen
  usePopoverDismiss(labelsRef, () => onDismissTools?.(), !!live && !!toolsOpen)
  const last = useRef({ left: NaN, width: NaN, mid: NaN, l: false, r: false, on: true, o: 'horizontal' as 'horizontal' | 'vertical' })

  useFrameListener(f => {
    const pa = f.pos(resolveTimeRef(a, f.now, f.center))
    const pb = f.pos(resolveTimeRef(b, f.now, f.center))
    const g = spanGeometry(pa, pb, f.mainSize)
    const s = last.current
    const v = f.orientation === 'vertical'
    if (f.orientation !== s.o) {
      // Orientation switched: forget what was written along the other axis.
      s.o = f.orientation
      s.left = s.width = s.mid = NaN
      if (lineRef.current) { lineRef.current.style.width = ''; lineRef.current.style.height = '' }
    }
    if (g.onScreen !== s.on) {
      s.on = g.onScreen
      const display = g.onScreen ? '' : 'none'
      if (lineRef.current) lineRef.current.style.display = display
      if (anchorRef.current) anchorRef.current.style.display = display
      if (startEndRef.current) startEndRef.current.style.display = display
      if (finishEndRef.current) finishEndRef.current.style.display = display
    }
    if (!g.onScreen) return
    const width = g.right - g.left
    if (lineRef.current && (g.left !== s.left || width !== s.width)) {
      s.left = g.left
      s.width = width
      lineRef.current.style.transform = v ? `translate3d(0,${g.left}px,0)` : `translate3d(${g.left}px,0,0)`
      lineRef.current.style[v ? 'height' : 'width'] = `${width}px`
    }
    // Vertical lane chips take their spot from the shared layout, so they never overlap each other.
    const mid = v && layoutKey ? (rightSideLayout(f).chips[layoutKey] ?? g.mid) : g.mid
    if (anchorRef.current && !(Math.abs(mid - s.mid) <= 0.01)) {
      s.mid = mid
      anchorRef.current.style.transform = v ? `translate3d(0,${mid}px,0)` : `translate3d(${mid}px,0,0)`
    }
    // Endpoint arrows sit on the line at its visible ends.
    const place = (el: HTMLDivElement | null, pos: number) => { if (el) el.style.transform = v ? `translate3d(0,${pos}px,0)` : `translate3d(${pos}px,0,0)` }
    place(startEndRef.current, g.left)
    place(finishEndRef.current, g.right)
    if (g.leftOffscreen !== s.l) { s.l = g.leftOffscreen; leftChevRef.current?.classList.toggle('is-visible', s.l) }
    if (g.rightOffscreen !== s.r) { s.r = g.rightOffscreen; rightChevRef.current?.classList.toggle('is-visible', s.r) }
  })

  // The shared lane layout needs this chip's width (vertical) to tell what it would touch.
  const hasChip = !(vertical && barOnly)
  useEffect(() => {
    const el = chipWrapRef.current
    if (!layoutKey || !el || !hasChip) return
    return observeLaneChip(layoutKey, el)
  }, [layoutKey, hasChip])

  // Which endpoint is on the left only changes when a moving endpoint crosses the other.
  const aIsLeft = useFrameValue(f => resolveTimeRef(a, f.now, f.center) <= resolveTimeRef(b, f.now, f.center))
  const extra = showTools ? tools?.({ aIsLeft }) : undefined
  const leftTarget = aIsLeft ? aTarget : bTarget
  const rightTarget = aIsLeft ? bTarget : aTarget

  const laneClass = `tl-lane tl-lane--${variant}${live ? ' tl-lane--live' : ''}${emphasis ? ' is-emphasis' : ''}${hot ? ' is-hot' : ''}`
  const showArrows = !!arrows && showTools && !(vertical && barOnly)
  const laneStyle = vertical ? ({ '--i': index } as CSSProperties) : { top }

  // Two sibling layers: the bar and chevrons sit below every label; the chip and tools above them.
  return (
    <>
      <div className={`${laneClass} tl-lane--lines`} style={laneStyle} aria-hidden>
        <div ref={lineRef} className="tl-lane__line" />
        <div ref={leftChevRef} className="tl-lane__chev tl-lane__chev--left" />
        <div ref={rightChevRef} className="tl-lane__chev tl-lane__chev--right" />
      </div>
      <div ref={labelsRef} className={`${laneClass} tl-lane--labels${selected || (live && toolsOpen) ? ' is-selected' : ''}`} style={laneStyle}>
        {showArrows && (
          <>
            <div ref={startEndRef} className="tl-lane__end">{arrowFor(leftTarget, 'left', vertical)}</div>
            <div ref={finishEndRef} className="tl-lane__end">{arrowFor(rightTarget, 'right', vertical)}</div>
          </>
        )}
        <div ref={anchorRef} className="tl-lane__anchor">
          {!(vertical && barOnly) && <div ref={chipWrapRef} className="tl-lane__chip-wrap">
            <div className="tl-lane__tools tl-lane__tools--left">
              {extra?.left}
            </div>
            <div
              role="button"
              tabIndex={0}
              aria-label={chipLabel}
              className="span-chip glow-box glow-text"
              onClick={onChipClick}
              onDoubleClick={onChipDoubleClick}
              onKeyDown={e => { if (e.key === 'Enter') onChipClick?.() }}
            >
              {chip}
            </div>
            <div className="tl-lane__tools tl-lane__tools--right">
              {extra?.right}
            </div>
            {below}
          </div>}
        </div>
      </div>
    </>
  )
}
