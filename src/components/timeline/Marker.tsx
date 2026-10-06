// A marker on the timeline: a line across the timeline at one time, plus whatever
// content hangs off it. The line and the content are two sibling elements (moved
// together by the engine) so the line can live in the low "lines" layer while the
// content (chips, tags, badges) sits in the "labels" layer above every line.
import { useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { usePositionMain } from '../../engine/hooks.ts'
import type { Frame } from '../../engine/viewportEngine.ts'

export function Marker({ className, getPos, ariaLabel, style, children }: {
  className: string
  getPos: (f: Frame) => number
  ariaLabel?: string
  /** Inline style for the label half (custom properties for its content). */
  style?: CSSProperties
  children?: ReactNode
}) {
  const lineRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  usePositionMain(lineRef, getPos)
  usePositionMain(labelRef, getPos)
  const hasLabel = !!ariaLabel || !!children
  return (
    <>
      <div ref={lineRef} className={`tl-col tl-col--line ${className}`} aria-hidden>
        <div className="tl-col__line" />
      </div>
      {hasLabel && (
        <div ref={labelRef} className={`tl-col tl-col--label ${className}`} style={style} role={ariaLabel ? 'group' : undefined} aria-label={ariaLabel} aria-hidden={ariaLabel ? undefined : true}>
          {children}
        </div>
      )}
    </>
  )
}
