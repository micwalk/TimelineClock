import { describe, expect, it } from 'vitest'
import { addCalendar, firstCalendarBoundaryAtOrBefore, firstDurationBoundaryAtOrBefore, formatTickLabel, generateTicks, labelSpacingPx, nearestFinestTick, pickTickTiers, TICK_UNITS } from './ticks.ts'
import { DAY, HOUR, MINUTE } from './time.ts'

const SCREEN = 1400

describe('pickTickTiers', () => {
  it('uses the first unit spaced at least 100px as the middle tier', () => {
    const pxPerMs = SCREEN / (6 * HOUR) // ~389px per hour
    const [lo, mid, hi] = pickTickTiers(pxPerMs)
    // 15 minutes is ~58px apart here, so 30 minutes (~117px) are the labeled tier.
    expect(mid.ms).toBe(30 * MINUTE)
    expect(lo.ms).toBe(15 * MINUTE)
    expect(hi.ms).toBe(HOUR)
  })
  it('clamps at the ends of the unit list', () => {
    expect(pickTickTiers(1e6)[0]).toBe(TICK_UNITS[0])
    expect(pickTickTiers(1e-15)[2]).toBe(TICK_UNITS[TICK_UNITS.length - 1])
  })
})

describe('30-minute tier and orientation spacing', () => {
  it('uses 30 minutes as the minor tier when hours are labeled (horizontal, hour at 150px)', () => {
    const pxPerMs = 150 / HOUR
    expect(pickTickTiers(pxPerMs).map(u => u.ms)).toEqual([30 * MINUTE, HOUR, 6 * HOUR])
    const noon = new Date(2026, 9, 2, 12, 0).getTime()
    const ticks = generateTicks(noon, noon + 3 * HOUR, pxPerMs)
    const at = (h: number, m: number) => ticks.find(t => t.t === new Date(2026, 9, 2, h, m).getTime())!
    expect(at(13, 0).label).toBe('1PM')
    expect(at(13, 30).tier).toBe(0)
    expect(at(13, 30).label).toBeNull()
  })

  it('labels hours at phone spacing in vertical (hour at 70px)', () => {
    const pxPerMs = 70 / HOUR
    expect(labelSpacingPx('vertical')).toBe(48)
    expect(labelSpacingPx('horizontal')).toBe(100)
    expect(pickTickTiers(pxPerMs, labelSpacingPx('vertical')).map(u => u.ms)).toEqual([30 * MINUTE, HOUR, 6 * HOUR])
    const noon = new Date(2026, 9, 2, 12, 0).getTime()
    const ticks = generateTicks(noon, noon + 3 * HOUR, pxPerMs, 600, labelSpacingPx('vertical'))
    const hour = ticks.find(t => t.t === new Date(2026, 9, 2, 13, 0).getTime())!
    expect(hour.label).toBe('1PM')
    expect(hour.style.labelAlpha).toBe(1)
    // Horizontal at the same zoom: the 70px hour is too tight to be the labeled tier.
    expect(pickTickTiers(pxPerMs)[1].ms).toBe(6 * HOUR)
  })

  it('snaps to the same ticks it draws in vertical', () => {
    const t = new Date(2026, 9, 2, 13, 37).getTime()
    const pxPerMs = 70 / HOUR
    const snapped = nearestFinestTick(t, pxPerMs, 48)
    expect(snapped).toBe(new Date(2026, 9, 2, 13, 30).getTime())
    expect(generateTicks(t - HOUR, t + HOUR, pxPerMs, 600, 48).map(k => k.t)).toContain(snapped)
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


describe('nearestFinestTick', () => {
  // 15 minutes at exactly 100px makes 15m the labeled tier and 5m the finest.
  const fiveMinuteZoom = 100 / (15 * MINUTE)
  const tenAm = new Date(2026, 0, 5, 10, 0, 0).getTime()

  it('rounds to the nearest finest tick', () => {
    expect(nearestFinestTick(tenAm + 6 * MINUTE, fiveMinuteZoom)).toBe(tenAm + 5 * MINUTE)
    expect(nearestFinestTick(tenAm + 8 * MINUTE, fiveMinuteZoom)).toBe(tenAm + 10 * MINUTE)
  })

  it('breaks ties toward the earlier tick', () => {
    expect(nearestFinestTick(tenAm + 2.5 * MINUTE, fiveMinuteZoom)).toBe(tenAm)
  })

  it('snaps to local midnight when days are the finest tier', () => {
    const weekZoom = 100 / (7 * DAY)
    expect(nearestFinestTick(new Date(2026, 0, 5, 13).getTime(), weekZoom)).toBe(new Date(2026, 0, 6).getTime())
    expect(nearestFinestTick(new Date(2026, 0, 5, 11).getTime(), weekZoom)).toBe(new Date(2026, 0, 5).getTime())
  })

  it('snaps to 00/06/12/18 local when 6 hours is the finest tier', () => {
    const dayZoom = 100 / DAY
    expect(pickTickTiers(dayZoom)[0].ms).toBe(6 * HOUR)
    expect(nearestFinestTick(new Date(2026, 0, 5, 7, 59).getTime(), dayZoom)).toBe(new Date(2026, 0, 5, 6).getTime())
    expect(nearestFinestTick(new Date(2026, 0, 5, 9, 1).getTime(), dayZoom)).toBe(new Date(2026, 0, 5, 12).getTime())
  })

  it('always lands on a tick that generateTicks draws', () => {
    const t = new Date(2026, 2, 8, 1, 37, 21).getTime() // around the US DST change
    for (const span of [10 * MINUTE, 2 * HOUR, DAY, 10 * DAY, 90 * DAY]) {
      const pxPerMs = SCREEN / span
      const snapped = nearestFinestTick(t, pxPerMs)
      const drawn = generateTicks(t - span, t + span, pxPerMs).map(k => k.t)
      expect(drawn).toContain(snapped)
    }
  })
})
