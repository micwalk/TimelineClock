// Drag to pan, wheel/pinch to zoom on the timeline element. A drag that starts on a
// chip still pans (like the canvas did); the click that ends a drag is swallowed.
// Movement and landing limits come from the tunables (Settings > Advanced).
import { useEffect } from 'react'
import type { RefObject } from 'react'
import { clamp } from '../domain/time.ts'
import { releaseVelocity, shouldGlide } from '../domain/glide.ts'
import type { PointerSample } from '../domain/glide.ts'
import { glide } from './glide.ts'
import { beginPan, endPan, panByPixels, wheelPan, zoomBy } from '../store/actions.ts'
import { useLayout } from '../store/layout.ts'
import { getTunables } from '../store/settings.ts'

const WHEEL_ZOOM_PER_PX = 0.001 // a 100px mouse-wheel notch ≈ 10%

const isTouch = (e: PointerEvent) => e.pointerType === 'touch' || e.pointerType === 'pen'

export function usePanZoom(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const pointers = new Map<number, { x: number; y: number }>()
    let drag: { id: number; start: number; last: number; moved: boolean; touch: boolean } | null = null
    let pinchDist = 0
    let swallowClick = false
    let samples: PointerSample[] = []

    const sample = (pos: number) => {
      const t = performance.now()
      const keep = getTunables().glideWindowMs
      samples.push({ t, pos })
      while (samples.length > 2 && t - samples[0].t > keep) samples.shift()
    }

    // A mouse drag ends with a click on whatever is under the pointer; swallow that
    // one click only. Touch gestures produce no click, so the guard must not outlive
    // the current event or it would eat the user's next real tap.
    const swallowTrailingClick = () => {
      swallowClick = true
      setTimeout(() => { swallowClick = false }, 0)
    }

    // Drags follow the main axis: x when the timeline runs horizontally, y when vertically.
    const main = (e: { clientX: number; clientY: number }) => (useLayout.getState().orientation === 'vertical' ? e.clientY : e.clientX)
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
        samples = []
        // Touching during a glide stops it; this press is not a tap, so swallow its click.
        if (glide.stop()) {
          swallowClick = true
          el.classList.remove('is-panning')
        }
        drag = { id: e.pointerId, start: main(e), last: main(e), moved: false, touch: isTouch(e) }
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
        if (Math.abs(main(e) - drag.start) < (drag.touch ? t.dragThresholdTouchPx : t.dragThresholdMousePx)) return
        drag.moved = true
        // Capture only once dragging, so plain clicks still reach chips and buttons.
        el.setPointerCapture(e.pointerId)
        el.classList.add('is-panning')
        beginPan()
        panByPixels(main(e) - drag.start)
        drag.last = main(e)
        sample(drag.start)
        sample(main(e))
        return
      }
      panByPixels(main(e) - drag.last)
      drag.last = main(e)
      sample(main(e))
    }

    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinchDist = 0
      if (drag && e.pointerId === drag.id) {
        if (drag.moved) {
          el.classList.remove('is-panning')
          const t = getTunables()
          const landing = drag.touch ? t.landingTouchPx : t.landingMousePx
          const v = pointers.size === 0 && drag.id === e.pointerId && e.type === 'pointerup'
            ? releaseVelocity(samples, performance.now(), { windowMs: t.glideWindowMs, stillMs: t.glideStillMs })
            : 0
          if (shouldGlide(v, t.glideMinSpeed)) glide.start(v, landing)
          else endPan(landing)
          swallowTrailingClick()
        } else if (swallowClick) {
          swallowTrailingClick() // a press that stopped a glide: swallow its click, then disarm
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
      glide.stop()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      const dx = clamp(e.deltaX * unit, -400, 400)
      const dy = clamp(e.deltaY * unit, -400, 400)
      const zoom = (d: number) => { if (d !== 0) zoomBy(Math.exp(d * WHEEL_ZOOM_PER_PX)) }
      if (e.ctrlKey) return zoom(dy) // trackpad pinch arrives as ctrl+wheel
      if (useLayout.getState().orientation === 'vertical') {
        if (dy !== 0) wheelPan(dy)
      } else {
        zoom(dy)
        if (dx !== 0) wheelPan(dx)
      }
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    el.addEventListener('click', onClickCapture, true)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      glide.stop()
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      el.removeEventListener('click', onClickCapture, true)
      el.removeEventListener('wheel', onWheel)
    }
  }, [ref])
}
