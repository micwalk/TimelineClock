// Closes a popover or menu on Escape or a press outside `ref` (capture phase, so it
// runs before the press does anything else).
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

export function usePopoverDismiss(ref: RefObject<HTMLElement | null>, onDismiss: () => void, enabled = true) {
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss
  useEffect(() => {
    if (!enabled) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) dismissRef.current()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismissRef.current() }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, enabled])
}
