// A long press (or right click) on an element, without stealing its tap: the tap that ends a long
// press is swallowed. A finger that moves (a pan) cancels it.
import { useRef } from 'react'
import type { MouseEvent, PointerEvent } from 'react'

const LONG_PRESS_MS = 500
const MOVE_TOLERANCE_PX = 8

export function useLongPress(onLongPress: () => void) {
  const s = useRef<{ timer: ReturnType<typeof setTimeout> | null; x: number; y: number; fired: boolean }>({ timer: null, x: 0, y: 0, fired: false })
  const cancel = () => { if (s.current.timer) { clearTimeout(s.current.timer); s.current.timer = null } }
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return
      cancel()
      s.current = { ...s.current, x: e.clientX, y: e.clientY, fired: false }
      s.current.timer = setTimeout(() => { s.current.timer = null; s.current.fired = true; onLongPress() }, LONG_PRESS_MS)
    },
    onPointerMove: (e: PointerEvent) => {
      if (Math.hypot(e.clientX - s.current.x, e.clientY - s.current.y) > MOVE_TOLERANCE_PX) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: MouseEvent) => { e.preventDefault(); cancel(); onLongPress() },
    /** Call first in the element's click handler: true when this click ended a long press (skip it). */
    consumeClick: () => { const f = s.current.fired; s.current.fired = false; return f },
  }
}
