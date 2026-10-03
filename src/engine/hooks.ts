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
const POS_LIMIT = 100_000

/**
 * Keeps an element at main-axis position `getPos(frame)` (px) with a transform:
 * translateX when the timeline is horizontal, translateY when vertical.
 */
export function usePositionMain(ref: React.RefObject<HTMLElement | null>, getPos: (f: Frame) => number) {
  const last = useRef<{ pos: number; orientation: Frame['orientation'] } | null>(null)
  useFrameListener(f => {
    const el = ref.current
    if (!el) return
    const pos = Math.max(-POS_LIMIT, Math.min(POS_LIMIT, getPos(f)))
    const prev = last.current
    if (prev && prev.orientation === f.orientation && Math.abs(prev.pos - pos) < 0.01) return
    last.current = { pos, orientation: f.orientation }
    el.style.transform = f.orientation === 'horizontal' ? `translate3d(${pos}px,0,0)` : `translate3d(0,${pos}px,0)`
  })
}
