// A tap, or a long-press (also a right-click) that swallows the click after it. A pan that takes
// the pointer away (leaving the button, or the browser cancelling it) is neither.
import { useRef } from 'react'
import type { MouseEvent } from 'react'

export const LONG_PRESS_MS = 500

export function useLongPress(onLong: () => void, onTap: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  return {
    onPointerDown: () => {
      longPressed.current = false
      clear()
      timer.current = setTimeout(() => { longPressed.current = true; onLong() }, LONG_PRESS_MS)
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: MouseEvent) => { e.preventDefault(); if (longPressed.current) return; clear(); longPressed.current = true; onLong() },
    onClick: () => {
      if (longPressed.current) { longPressed.current = false; return }
      onTap()
    },
  }
}
