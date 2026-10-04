// A menu that opens from a control-bar button: placed on whichever side of it has room,
// kept inside the viewport, and closed by an outside press or Escape.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { placeMenu } from '../domain/menuPlacement.ts'
import type { MenuPlacement } from '../domain/menuPlacement.ts'

export function useAnchoredMenu(open: boolean, close: () => void) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<MenuPlacement | null>(null)
  const closeRef = useRef(close)
  closeRef.current = close

  // Open on whichever side of the trigger has room, capped to it, and inside the viewport.
  useLayoutEffect(() => {
    if (!open) { setPlacement(null); return }
    const place = (scrollActive: boolean) => {
      const wrap = wrapRef.current
      const menu = menuRef.current
      if (!wrap || !menu) return
      const vv = window.visualViewport
      const viewport = {
        width: Math.min(window.innerWidth, vv?.width ?? Infinity),
        height: Math.min(window.innerHeight, vv?.height ?? Infinity),
      }
      const next = placeMenu(wrap.getBoundingClientRect(), { width: menu.offsetWidth, height: menu.scrollHeight }, viewport)
      setPlacement(prev => (prev && prev.side === next.side && prev.maxHeight === next.maxHeight && prev.shiftX === next.shiftX ? prev : next))
      if (scrollActive) menu.querySelector<HTMLElement>('.is-active')?.scrollIntoView({ block: 'nearest' })
    }
    place(false)
    // Scroll the active option into view once the height cap has been applied.
    const raf = requestAnimationFrame(() => place(true))
    const onResize = () => place(false)
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) closeRef.current() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current() }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  /** Style for the menu element: hidden until placed. */
  const menuStyle = placement ? { maxHeight: placement.maxHeight, left: placement.shiftX } : { visibility: 'hidden' as const }
  return { wrapRef, menuRef, placement, menuStyle, above: placement?.side === 'above' }
}
