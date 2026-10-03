import { describe, expect, it } from 'vitest'
import { addCalendar, firstCalendarBoundaryAtOrBefore, firstDurationBoundaryAtOrBefore, formatTickLabel, generateTicks, pickTickTiers, TICK_UNITS } from './ticks.ts'
import { DAY, HOUR, MINUTE } from './time.ts'

const SCREEN = 1400

describe('pickTickTiers', () => {
  it('uses the first unit spaced at least 100px as the middle tier', () => {
    const pxPerMs = SCREEN / (6 * HOUR) // ~389px per hour
    const [lo, mid, hi] = pickTickTiers(pxPerMs)
    // 15 minutes is ~58px apart here, so hours (~233px) are the labeled tier.
    expect(mid.ms).toBe(HOUR)
    expect(lo.ms).toBe(15 * MINUTE)
    expect(hi.ms).toBe(6 * HOUR)
  })
  it('clamps at the ends of the unit list', () => {
    expect(pickTickTiers(1e6)[0]).toBe(TICK_UNITS[0])
    expect(pickTickTiers(1e-15)[2]).toBe(TICK_UNITS[TICK_UNITS.length - 1])
  })
})

describe('calendar boundaries', () => {
  it('aligns weeks to Sunday midnight and months to the 1st', () => {
    const thu = new Date(2026, 9, 1, 15, 0).getTime() // Thu Oct 1 2026
    expect(new Date(firstCalendarBoundaryAtOrBefore(thu, 'week')).getDay()).toBe(0)
    expect(new Date(firstCalendarBoundaryAtOrBefore(thu, 'month')).getDate()).toBe(1)
    const jan1 = new Date(firstCalendarBoundaryAtOrBefore(thu, 'year'))
    expect([jan1.getMonth(), jan1.getDate(), jan1.getHours()]).toEqual([0, 1, 0])
  })
  it('adds calendar months without day overflow', () => {
    const jan = new Date(2026, 0, 1).getTime()
    expect(new Date(addCalendar(jan, 'month', 1)).getMonth()).toBe(1)
  })
  it('aligns 6-hour ticks to local 00/06/12/18', () => {
    const t = new Date(2026, 9, 2, 14, 37).getTime()
    expect(new Date(firstDurationBoundaryAtOrBefore(t, 6 * HOUR)).getHours()).toBe(12)
  })
})

describe('generateTicks', () => {
  const start = new Date(2026, 9, 2, 12, 0).getTime()
  const end = start + 6 * HOUR
  const pxPerMs = SCREEN / (end - start)

  it('returns sorted, unique timestamps within range', () => {
    const ticks = generateTicks(start, end, pxPerMs)
    const ts = ticks.map(t => t.t)
    expect(ts).toEqual([...ts].sort((a, b) => a - b))
    expect(new Set(ts).size).toBe(ts.length)
    expect(ts.every(t => t >= start - DAY && t <= end)).toBe(true)
  })

  it('merges coinciding tiers, keeping the tallest mark and a visible label', () => {
    const ticks = generateTicks(start, end, pxPerMs)
    const hourTicks = ticks.filter(t => new Date(t.t).getMinutes() === 0)
    for (const t of hourTicks) {
      expect(t.tier).toBeGreaterThanOrEqual(1)
      expect(t.label).not.toBeNull()
    }
    const noon = ticks.find(t => t.t === start)!
    // Noon is a 6h boundary: tallest mark, but the hour label stays visible.
    expect(noon.style.halfHeight).toBeGreaterThanOrEqual(10)
    expect(noon.label).toBe('12PM')
  })

  it('labels quarter-second ticks with hundredths', () => {
    const t = new Date(2026, 9, 2, 12, 44, 10, 750).getTime()
    expect(formatTickLabel(t, { ms: 250 })).toBe('44:10.75')
  })

  it('caps tick count per tier', () => {
    expect(generateTicks(0, 1e12, 1, 50).length).toBeLessThanOrEqual(150)
  })
})

import { nearestFinestTick as nft } from './ticks.ts'
describe('nearestFinestTick', () => {
  it('5-minute tier', () => {
    const base = new Date(2026, 0, 5, 10, 0, 0).getTime()
    const px = 100 / (15 * 60000)
    expect(nft(base + 6 * 60000, px)).toBe(base + 5 * 60000)
    expect(nft(base + 8 * 60000, px)).toBe(base + 10 * 60000)
  })
  it('day boundary', () => {
    const px = 100 / (7 * 86400000)
    expect(nft(new Date(2026, 0, 5, 13, 0).getTime(), px)).toBe(new Date(2026, 0, 6).getTime())
    expect(nft(new Date(2026, 0, 5, 11).getTime(), px)).toBe(new Date(2026, 0, 5).getTime())
  })
})
