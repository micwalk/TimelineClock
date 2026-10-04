import { describe, expect, it } from 'vitest'
import type { TargetInputs } from './viewport.ts'
import { panCenterByPixels, posToTime, resolveViewTarget, timeToPos, visibleRange, widthToShow, zoomToFitRange } from './viewport.ts'
import type { InstantRecord, SpanRecord } from './entities.ts'
import { HOUR } from './time.ts'

const now = 1_800_000_000_000
const base: TargetInputs = {
  viewFocusMode: 'now',
  focusedInstantId: null,
  focusedSpanId: null,
  timeCenter: now - HOUR,
  timeWidth: 6 * HOUR,
  cursorLocked: false,
  cursorLockOffsetMs: 0,
}
const instants: InstantRecord[] = [
  { id: 'a', tsEpochMs: now - 2 * HOUR, label: 'A' },
  { id: 'b', tsEpochMs: now + 2 * HOUR, label: 'B' },
]
const spans: SpanRecord[] = [
  { id: 'ab', startInstantId: 'a', endInstantId: 'b', label: '' },
  { id: 'aNow', startInstantId: 'a', endInstantId: '__NOW__', label: '', endIsNow: true },
]

describe('projection', () => {
  const p = { center: now, width: 6 * HOUR, mainSize: 1200, dir: 1 as const }
  it('puts the center in the middle of the screen', () => {
    expect(timeToPos(p, now)).toBe(600)
    expect(timeToPos(p, now - 3 * HOUR)).toBe(0)
    expect(timeToPos(p, now + 3 * HOUR)).toBe(1200)
  })
  it('round-trips', () => {
    expect(posToTime(p, timeToPos(p, now + 1234567))).toBeCloseTo(now + 1234567, 3)
  })
})

describe('resolveViewTarget', () => {
  it('follows Now in now mode', () => {
    expect(resolveViewTarget(base, instants, spans, now)).toEqual({ center: now, width: 6 * HOUR, followsNow: true })
  })
  it('uses the stored center for a free cursor and an offset for a locked one', () => {
    expect(resolveViewTarget({ ...base, viewFocusMode: 'cursor' }, instants, spans, now).center).toBe(now - HOUR)
    const locked = resolveViewTarget({ ...base, viewFocusMode: 'cursor', cursorLocked: true, cursorLockOffsetMs: 5000 }, instants, spans, now)
    expect(locked).toMatchObject({ center: now + 5000, followsNow: true })
  })
  it('centers a focused instant', () => {
    expect(resolveViewTarget({ ...base, viewFocusMode: 'instant', focusedInstantId: 'b' }, instants, spans, now).center).toBe(now + 2 * HOUR)
  })
  it('centers a focused span and widens for spans ending at Now', () => {
    expect(resolveViewTarget({ ...base, viewFocusMode: 'span', focusedSpanId: 'ab' }, instants, spans, now).center).toBe(now)
    const live = resolveViewTarget({ ...base, viewFocusMode: 'span', focusedSpanId: 'aNow', timeWidth: HOUR }, instants, spans, now)
    expect(live.center).toBe(now - HOUR)
    expect(live.width).toBeCloseTo(2 * HOUR * 1.2)
    expect(live.followsNow).toBe(true)
  })
  it('falls back to the stored center when the focus target is gone', () => {
    expect(resolveViewTarget({ ...base, viewFocusMode: 'instant', focusedInstantId: 'zzz' }, instants, spans, now).center).toBe(now - HOUR)
  })
})

describe('zoomToFitRange', () => {
  const p = { center: now, width: 6 * HOUR, mainSize: 1200, dir: 1 as const }
  it('zooms out with margins when an end is off screen', () => {
    expect(zoomToFitRange(p, now - 4 * HOUR, now + HOUR)).toEqual({ center: now - 1.5 * HOUR, width: (5 * HOUR) / 0.8 })
  })
  it('zooms in when the range is tiny', () => {
    expect(zoomToFitRange(p, now, now + 10 * 60_000)).toEqual({ center: now + 5 * 60_000, width: 20 * 60_000 })
  })
  it('leaves a comfortable range alone', () => {
    expect(zoomToFitRange(p, now - HOUR, now + HOUR)).toBeNull()
  })
  it('gives the same answer when time runs the other way', () => {
    const flipped = { ...p, dir: -1 as const }
    expect(zoomToFitRange(flipped, now - 4 * HOUR, now + HOUR)).toEqual(zoomToFitRange(p, now - 4 * HOUR, now + HOUR))
    expect(zoomToFitRange(flipped, now - HOUR, now + HOUR)).toBeNull()
  })
})

describe('axis projection', () => {
  const mk = (dir: 1 | -1) => ({ center: 1000, width: 400, mainSize: 800, dir })
  it('maps center to middle and round-trips', () => {
    for (const dir of [1, -1] as const) {
      const p = mk(dir)
      expect(timeToPos(p, 1000)).toBe(400)
      expect(posToTime(p, timeToPos(p, 1234))).toBeCloseTo(1234)
    }
  })
  it('flips with dir', () => {
    expect(timeToPos(mk(1), 1100)).toBe(600)
    expect(timeToPos(mk(-1), 1100)).toBe(200)
  })
  it('visibleRange is ordered for both dirs', () => {
    for (const dir of [1, -1] as const) expect(visibleRange(mk(dir))).toEqual({ start: 800, end: 1200 })
  })
  it('pan follows the finger', () => {
    expect(panCenterByPixels(mk(1), 100)).toBe(950)
    expect(panCenterByPixels(mk(-1), 100)).toBe(1050)
  })
})

describe('widthToShow', () => {
  it('puts the farthest time 80% of the way to the edge', () => {
    expect(widthToShow(0, [0, 800], 0)).toBe(2000)
    expect(widthToShow(1000, [200, 1100], 0)).toBe(2000)
  })
  it('never goes below the minimum', () => {
    expect(widthToShow(0, [10], 500)).toBe(500)
    expect(widthToShow(0, [], 500)).toBe(500)
  })
})
