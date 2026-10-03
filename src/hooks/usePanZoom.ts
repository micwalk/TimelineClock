// Drag to pan, wheel/pinch to zoom on the timeline element. A drag that starts on a
// chip still pans (like the canvas did); the click that ends a drag is swallowed.
// Movement and landing limits come from the tunables (Settings > Advanced).
import { useEffect } from 'react'
import type { RefObject } from 'react'
import { clamp } from '../domain/time.ts'
import { beginPan, endPan, panByPixels, zoomBy } from '../store/actions.ts'
import { getTunables } from '../store/settings.ts'

const WHEEL_ZOOM_PER_PX = 0.001 // a 100px mouse-wheel notch ≈ 10%

const isTouch = (e: PointerEvent) => e.pointerType === 'touch' || e.pointerType === 'pen'

export function usePanZoom(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const pointers = new Map<number, { x: number; y: number }>()
    let drag: { id: number; startX: number; lastX: number; moved: boolean; touch: boolean } | null = null
    let pinchDist = 0
    let swallowClick = false

    // A mouse drag ends with a click on whatever is under the pointer; swallow that
    // one click only. Touch gestures produce no click, so the guard must not outlive
    // the current event or it would eat the user's next real tap.
    const swallowTrailingClick = () => {
      swallowClick = true
      setTimeout(() => { swallowClick = false }, 0)
    }

    const exempt = (t: EventTarget | null) => t instanceof Element && !!t.closest('input, textarea, select, [data-no-pan]')
    const distance = () => {
      const [a, b] = [...pointers.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (exempt(e.target)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 1) {
        swallowClick = false
        drag = { id: e.pointerId, startX: e.clientX, lastX: e.clientX, moved: false, touch: isTouch(e) }
      } else if (pointers.size === 2) {
        pinchDist = distance()
        for (const id of pointers.keys()) el.setPointerCapture(id)
        if (drag) drag.moved = true
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size >= 2) {
        const d = distance()
        if (pinchDist > 0 && d > 0) zoomBy(pinchDist / d)
        pinchDist = d
        return
      }
      if (!drag || e.pointerId !== drag.id) return
      if (!drag.moved) {
        const t = getTunables()
        if (Math.abs(e.clientX - drag.startX) < (drag.touch ? t.dragThresholdTouchPx : t.dragThresholdMousePx)) return
        drag.moved = true
        // Capture only once dragging, so plain clicks still reach chips and buttons.
        el.setPointerCapture(e.pointerId)
        el.classList.add('is-panning')
        beginPan()
        panByPixels(e.clientX - drag.startX)
        drag.lastX = e.clientX
        return
      }
      panByPixels(e.clientX - drag.lastX)
      drag.lastX = e.clientX
    }

    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinchDist = 0
      if (drag && e.pointerId === drag.id) {
        if (drag.moved) {
          el.classList.remove('is-panning')
          const t = getTunables()
          endPan(drag.touch ? t.landingTouchPx : t.landingMousePx)
          swallowTrailingClick()
        }
        drag = null
      }
    }

    const onClickCapture = (e: MouseEvent) => {
      if (!swallowClick) return
      swallowClick = false
      e.stopPropagation()
      e.preventDefault()
    }

    const onWheel = (e: WheelEvent) => {
      if (exempt(e.target)) return
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      const dy = clamp(e.deltaY * unit, -400, 400)
      if (dy !== 0) zoomBy(Math.exp(dy * WHEEL_ZOOM_PER_PX))
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    el.addEventListener('click', onClickCapture, true)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      el.removeEventListener('click', onClickCapture, true)
      el.removeEventListener('wheel', onWheel)
    }
  }, [ref])
}
