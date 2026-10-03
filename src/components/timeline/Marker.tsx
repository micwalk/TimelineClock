// A marker on the timeline: a line across the timeline at one time, plus whatever
// content hangs off it, moved as a unit along the time axis by the engine.
import { useRef } from 'react'
import type { ReactNode } from 'react'
import { usePositionMain } from '../../engine/hooks.ts'
import type { Frame } from '../../engine/viewportEngine.ts'

export function Marker({ className, getPos, ariaLabel, children }: {
  className: string
  getPos: (f: Frame) => number
  ariaLabel?: string
  children?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  usePositionMain(ref, getPos)
  return (
    <div ref={ref} className={`tl-col ${className}`} role={ariaLabel ? 'group' : undefined} aria-label={ariaLabel} aria-hidden={ariaLabel ? undefined : true}>
      <div className="tl-col__line" />
      {children}
    </div>
  )
}
