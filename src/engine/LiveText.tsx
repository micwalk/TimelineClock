import { useRef } from 'react'
import type { Frame } from './viewportEngine.ts'
import { engine } from './viewportEngine.ts'
import { useFrameListener } from './hooks.ts'

export interface LiveTextContext {
  /** Ask for another frame right away (for readouts that change every frame). */
  fast: () => void
}

const liveCtx: LiveTextContext = { fast: () => engine.requestFrame() }

/**
 * Text that depends on the clock or viewport, updated without re-rendering React. `watch`
 * (optional) names what the text depends on: compute runs only when it changes (e.g. the
 * clock's second, for a time that doesn't move with pans and zooms).
 */
export function LiveText({ compute, className, watch }: { compute: (f: Frame, ctx: LiveTextContext) => string; className?: string; watch?: (f: Frame) => number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const last = useRef<string | null>(null)
  const watched = useRef<number | null>(null)
  useFrameListener(f => {
    if (watch) {
      const w = watch(f)
      if (w === watched.current && last.current !== null) return
      watched.current = w
    }
    const text = compute(f, liveCtx)
    if (text === last.current || !ref.current) return
    last.current = text
    ref.current.textContent = text
  })
  return <span ref={ref} className={className} />
}
