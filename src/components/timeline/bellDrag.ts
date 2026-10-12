// Dragging an alarm's bell along time (TLC-1): the bell beside a chip, or a bell before its
// instant. The bell keeps the pointer (data-no-pan stops the timeline panning), follows it
// earlier in time, and on release sets how long before its instant the alarm rings. Let go
// close to the instant, it goes back onto the chip (offset 0). Its time while dragged lives
// here, not in React state: the layout and the bell read it each frame (bellDragAt).
import type React from 'react'
import { engine } from '../../engine/viewportEngine.ts'
import type { Frame } from '../../engine/viewportEngine.ts'
import { labelSpacingPx, pickTickTiers } from '../../domain/ticks.ts'
import { clamp } from '../../domain/time.ts'
import { entities } from '../../store/entities.ts'
import { getTunables } from '../../store/settings.ts'
import { ui } from '../../store/ui.ts'
import * as act from '../../store/actions.ts'

let drag: { instantId: string; alarmId: string; ringTs: number } | null = null
/** A drag just ended: the click that follows it is not a tap. */
let swallowClick = false

/** The bell being dragged and the time it is at, or null. */
export const bellDragAt = (): { alarmId: string; ringTs: number } | null => drag

/** Whether a click on a bell is really the end of a drag (then it does nothing). */
export function consumeBellDragClick(): boolean {
  const was = swallowClick
  swallowClick = false
  return was
}

/** How long before its instant a bell at `ringTs` rings, in whole ticks of the current zoom ("15m", not "14m 37s"). */
function offsetAt(f: Frame, instTs: number, ringTs: number): number {
  const unit = pickTickTiers(f.pxPerMs, labelSpacingPx(f.orientation))[0].ms
  return Math.round((instTs - ringTs) / unit) * unit
}

/** Starts following the pointer from a bell's pointerdown (a press that doesn't move stays a tap: the button's click). */
export function startBellDrag(e: React.PointerEvent<HTMLElement>, instantId: string, alarmId: string) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const inst = entities.getInstant(instantId)
  const alarm = inst?.alarms?.find(a => a.id === alarmId)
  if (!inst || !alarm || alarm.done) return
  e.stopPropagation()
  const pointerId = e.pointerId
  const main = (ev: { clientX: number; clientY: number }) => (engine.sample().orientation === 'vertical' ? ev.clientY : ev.clientX)
  const start = main(e)
  const startRing = inst.tsEpochMs - alarm.offsetMs
  const t = getTunables()
  const threshold = e.pointerType === 'mouse' ? t.dragThresholdMousePx : t.dragThresholdTouchPx
  let moved = false
  // Listened for on the window: the bell pressed may unmount as the drag starts (the chip's
  // bell, when its one alarm leaves it), taking element listeners and pointer capture with it.

  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    const d = main(ev) - start
    if (!moved) {
      if (Math.abs(d) < threshold) return
      moved = true
      ui.selectBell(null)
      ui.setDraggingBell(alarmId)
    }
    const f = engine.sample()
    const at = f.time(f.pos(startRing) + d)
    const latest = entities.getInstant(instantId)?.tsEpochMs ?? inst.tsEpochMs
    // Earlier than its instant, and never in the past.
    drag = { instantId, alarmId, ringTs: clamp(latest - offsetAt(f, latest, at), Math.min(f.now, latest), latest) }
    engine.invalidate()
  }
  const finish = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
    if (!moved) return
    const d = drag
    drag = null
    ui.setDraggingBell(null)
    swallowClick = true
    setTimeout(() => { swallowClick = false }, 0)
    const target = entities.getInstant(instantId)
    if (!d || !target || ev.type === 'pointercancel') { engine.invalidate(); return }
    const f = engine.sample()
    // Let go next to its instant: back onto the chip.
    const near = Math.abs(f.pos(target.tsEpochMs) - f.pos(d.ringTs)) < getTunables().bellCollapsePx
    act.setAlarmOffset(instantId, alarmId, near ? 0 : target.tsEpochMs - d.ringTs)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', finish)
  window.addEventListener('pointercancel', finish)
}
