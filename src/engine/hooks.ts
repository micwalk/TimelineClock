// React bindings for the viewport engine.
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import type { Frame, FrameListener } from './viewportEngine.ts'
import { engine } from './viewportEngine.ts'

/**
 * Runs `fn` on every engine frame (phase 0: direct DOM writes) and after every
 * render, so freshly mounted or re-rendered elements are positioned before paint.
 */
export function useFrameListener(fn: FrameListener) {
  const ref = useRef(fn)
  useLayoutEffect(() => {
    ref.current = fn
    fn(engine.getFrame())
  })
  useLayoutEffect(() => engine.onFrame(f => ref.current(f)), [])
}

/**
 * Derives a value from the frame and re-renders only when it changes (by `isEqual`).
 * Keep selectors cheap: they run every frame.
 */
export function useFrameValue<T>(selector: (f: Frame) => T, isEqual: (a: T, b: T) => boolean = Object.is): T {
  const cache = useRef<{ value: T } | null>(null)
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  const getSnapshot = () => {
    const value = selectorRef.current(engine.getFrame())
    if (cache.current && isEqual(cache.current.value, value)) return cache.current.value
    cache.current = { value }
    return value
  }
  return useSyncExternalStore(engine.subscribe, getSnapshot)
}

export const shallowArrayEqual = <T>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((x, i) => Object.is(x, b[i]))

/** Hard limit on transform offsets so far-off items never produce huge layer sizes. */
const X_LIMIT = 100_000

/** Keeps an element horizontally positioned at `getX(frame)` (screen px) via transform. */
export function usePositionX(ref: React.RefObject<HTMLElement | null>, getX: (f: Frame) => number) {
  const last = useRef<number | null>(null)
  useFrameListener(f => {
    const el = ref.current
    if (!el) return
    const x = Math.max(-X_LIMIT, Math.min(X_LIMIT, getX(f)))
    if (last.current !== null && Math.abs(last.current - x) < 0.01) return
    last.current = x
    el.style.transform = `translate3d(${x}px,0,0)`
  })
}
