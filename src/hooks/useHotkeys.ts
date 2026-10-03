// Global keyboard shortcuts (same bindings as the original canvas app).
import { useEffect } from 'react'
import * as act from '../store/actions.ts'
import { useView } from '../store/view.ts'

const isTyping = (el: Element | null) =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)

export function useHotkeys() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isTyping(document.activeElement)) return
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const run = (fn: () => void) => { e.preventDefault(); fn() }
      switch (k) {
        case 'i': case 'w': return run(act.zoomIn)
        case 'o': case 's': return run(act.zoomOut)
        case 'x': return run(() => act.moveCursorByIncrement(1))
        case 'z': return run(() => act.moveCursorByIncrement(-1))
        case 'r': return run(() => act.focusNow())
        case 'd': case 'ArrowRight': case 'ArrowDown': return run(() => act.goToAdjacentInstant(1))
        case 'a': case 'ArrowLeft': case 'ArrowUp': return run(() => act.goToAdjacentInstant(-1))
        case 'v': return run(act.rotate)
        case 'q': return run(() => act.navigateFocusHistory(-1))
        case 'e': return run(() => act.navigateFocusHistory(1))
        case 'Escape': return run(act.escape)
        case 'Enter':
          if (useView.getState().moveMode && !(document.activeElement instanceof HTMLButtonElement)) return run(act.confirmMove)
          return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
