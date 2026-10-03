// One span lane (a horizontal line, or a vertical bar at the right edge): a glowing line between two times, off-screen chevrons,
// and a chip centered on the visible part of the line with tools on either side.
// Geometry is written per frame; React only re-renders when content changes.
import { useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon } from '@heroicons/react/20/solid'
import { useFrameListener, useFrameValue } from '../../engine/hooks.ts'
import type { TimeRef } from '../../domain/spans.ts'
import { resolveTimeRef, spanGeometry } from '../../domain/spans.ts'
import { IconButton } from '../common/IconButton.tsx'
import { useLayout } from '../../store/layout.ts'
import { focusInstant, focusNow } from '../../store/actions.ts'

export type LaneVariant = 'now' | 'cursor' | 'selected' | 'secondary' | 'focused' | 'span'

/** What an endpoint arrow jumps to. Cursor endpoints get no arrow. */
export type EndTarget = { kind: 'instant'; id: string } | { kind: 'now' } | { kind: 'cursor' }

export interface SpanLaneProps {
  /** Vertical center of the lane in px, or a CSS length. */
  top: number | string
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
  const { top, barOnly, index = 0, variant, a, b, aTarget, bTarget, arrows, emphasis, hot, chip, onChipClick, onChipDoubleClick, chipLabel, tools, below } = props
  const vertical = useLayout(s => s.orientation === 'vertical')
  const lineRef = useRef<HTMLDivElement>(null)
  const leftChevRef = useRef<HTMLDivElement>(null)
  const rightChevRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
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
    }
    if (!g.onScreen) return
    const width = g.right - g.left
    if (lineRef.current && (g.left !== s.left || width !== s.width)) {
      s.left = g.left
      s.width = width
      lineRef.current.style.transform = v ? `translate3d(0,${g.left}px,0)` : `translate3d(${g.left}px,0,0)`
      lineRef.current.style[v ? 'height' : 'width'] = `${width}px`
    }
    if (anchorRef.current && !(Math.abs(g.mid - s.mid) <= 0.01)) {
      s.mid = g.mid
      anchorRef.current.style.transform = v ? `translate3d(0,${g.mid}px,0)` : `translate3d(${g.mid}px,0,0)`
    }
    if (g.leftOffscreen !== s.l) { s.l = g.leftOffscreen; leftChevRef.current?.classList.toggle('is-visible', s.l) }
    if (g.rightOffscreen !== s.r) { s.r = g.rightOffscreen; rightChevRef.current?.classList.toggle('is-visible', s.r) }
  })

  // Which endpoint is on the left only changes when a moving endpoint crosses the other.
  const aIsLeft = useFrameValue(f => resolveTimeRef(a, f.now, f.center) <= resolveTimeRef(b, f.now, f.center))
  const extra = tools?.({ aIsLeft })
  const leftTarget = aIsLeft ? aTarget : bTarget
  const rightTarget = aIsLeft ? bTarget : aTarget

  return (
    <div
      className={`tl-lane tl-lane--${variant}${emphasis ? ' is-emphasis' : ''}${hot ? ' is-hot' : ''}`}
      style={vertical ? ({ '--i': index } as CSSProperties) : { top }}
    >
      <div ref={lineRef} className="tl-lane__line" />
      <div ref={leftChevRef} className="tl-lane__chev tl-lane__chev--left" />
      <div ref={rightChevRef} className="tl-lane__chev tl-lane__chev--right" />
      <div ref={anchorRef} className="tl-lane__anchor">
        {!(vertical && barOnly) && <div className="tl-lane__chip-wrap">
          <div className="tl-lane__tools tl-lane__tools--left">
            {arrows && arrowFor(leftTarget, 'left', vertical)}
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
            {arrows && arrowFor(rightTarget, 'right', vertical)}
            {extra?.right}
          </div>
          {below}
        </div>}
      </div>
    </div>
  )
}
