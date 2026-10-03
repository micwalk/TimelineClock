import { useRef } from 'react'
import type { Frame } from './viewportEngine.ts'
import { engine } from './viewportEngine.ts'
import { useFrameListener } from './hooks.ts'

export interface LiveTextContext {
  /** Ask for another frame right away (for readouts that change every frame). */
  fast: () => void
}

const liveCtx: LiveTextContext = { fast: () => engine.requestFrame() }

/** Text that depends on the clock or viewport, updated without re-rendering React. */
export function LiveText({ compute, className }: { compute: (f: Frame, ctx: LiveTextContext) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const last = useRef<string | null>(null)
  useFrameListener(f => {
    const text = compute(f, liveCtx)
    if (text === last.current || !ref.current) return
    last.current = text
    ref.current.textContent = text
  })
  return <span ref={ref} className={className} />
}
