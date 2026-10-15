// A popover that opens beside something near an edge (a chip at the side of the screen, or
// near the control bar) is nudged back inside what is visible, or flipped above what it opens
// from, by the CSS `translate` property (it adds to the popover's own transform). Measured once
// as it opens, not per frame.
import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'

/** Gap kept from the screen's edges, px. */
const EDGE = 8

export function useKeepOnScreen(ref: RefObject<HTMLElement | null>, active: boolean) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!active || !el) return
    el.style.translate = ''
    const r = el.getBoundingClientRect()
    // What is visible: the screen (less the keyboard), and inside the timeline when it is in one
    // (the timeline clips at the control bar).
    const vv = window.visualViewport
    let left = vv?.offsetLeft ?? 0
    let top = vv?.offsetTop ?? 0
    let right = left + (vv?.width ?? window.innerWidth)
    let bottom = top + (vv?.height ?? window.innerHeight)
    const clip = el.closest('.timeline')?.getBoundingClientRect()
    if (clip) {
      left = Math.max(left, clip.left)
      top = Math.max(top, clip.top)
      right = Math.min(right, clip.right)
      bottom = Math.min(bottom, clip.bottom)
    }
    const dx = r.left < left + EDGE ? left + EDGE - r.left : r.right > right - EDGE ? Math.max(left + EDGE - r.left, right - EDGE - r.right) : 0
    // No room below: flip above what it opens from (its chip, else its parent) when it fits there, else clamp.
    let dy = 0
    if (r.bottom > bottom - EDGE) {
      const anchor = (el.parentElement?.closest('.tl-col__chip') ?? el.parentElement)?.getBoundingClientRect()
      const flipped = anchor ? anchor.top - 6 - r.bottom : -Infinity
      dy = anchor && r.top + flipped >= top + EDGE ? flipped : Math.max(top + EDGE - r.top, bottom - EDGE - r.bottom)
    } else if (r.top < top + EDGE) dy = top + EDGE - r.top
    if (dx !== 0 || dy !== 0) el.style.translate = `${Math.round(dx)}px ${Math.round(dy)}px`
  }, [ref, active])
}
