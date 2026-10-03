// Animates children of a container to their new positions when their order changes
// (FLIP via the Web Animations API, so it runs on the compositor).
import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

export function useFlip(container: RefObject<HTMLElement | null>, orderKey: string) {
  const prevTops = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const el = container.current
    if (!el) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const next = new Map<string, number>()
    for (const child of Array.from(el.children) as HTMLElement[]) {
      const key = child.dataset.key
      if (!key) continue
      const top = child.offsetTop
      next.set(key, top)
      const old = prevTops.current.get(key)
      if (!reduced && old !== undefined && old !== top) {
        child.animate([{ transform: `translateY(${old - top}px)` }, { transform: 'none' }], {
          duration: 280,
          easing: 'cubic-bezier(.2,.8,.2,1)',
        })
      }
    }
    prevTops.current = next
  }, [container, orderKey])
}
