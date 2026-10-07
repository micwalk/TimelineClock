// A marker on the timeline: a line across the timeline at one time, plus whatever
// content hangs off it. The line and the content are two sibling elements (moved
// together by the engine) so the line can live in the low "lines" layer while the
// content (chips, tags, badges) sits in the "labels" layer above every line.
import { useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useFrameListener, usePositionMain } from '../../engine/hooks.ts'
import type { Frame } from '../../engine/viewportEngine.ts'

export function Marker({ className, getPos, ariaLabel, style, frameClass, frameStyle, children }: {
  className: string
  getPos: (f: Frame) => number
  ariaLabel?: string
  /** Inline style for the label half (custom properties for its content). */
  style?: CSSProperties
  /** A class that comes and goes with the frame (e.g. is-capturing), set on both halves without re-rendering. */
  frameClass?: (f: Frame) => string | null
  /** Writes per-frame style onto the label half (custom properties its content reads), after it is placed. */
  frameStyle?: (f: Frame, label: HTMLDivElement) => void
  children?: ReactNode
}) {
  const lineRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  usePositionMain(lineRef, getPos)
  usePositionMain(labelRef, getPos)
  const applied = useRef<string | null>(null)
  useFrameListener(f => {
    if (frameStyle && labelRef.current) frameStyle(f, labelRef.current)
    if (!frameClass) return
    const want = frameClass(f)
    for (const el of [lineRef.current, labelRef.current]) {
      if (!el) continue
      if (applied.current && applied.current !== want) el.classList.remove(applied.current)
      // A re-render resets className, so check rather than trust what was applied.
      if (want && !el.classList.contains(want)) el.classList.add(want)
    }
    applied.current = want
  })
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
