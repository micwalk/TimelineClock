import { describe, expect, it } from 'vitest'
import { contextBoundaries, contextUnitFor, formatContext, stickyPlace } from './tickContext.ts'
import { DAY, HOUR, MINUTE } from './time.ts'
import { labelSpacingPx } from './ticks.ts'

const H = labelSpacingPx('horizontal')

describe('contextUnitFor', () => {
  it('labels hours once 15-minute ticks (or finer) are labeled', () => {
    expect(contextUnitFor(400 / (15 * MINUTE), H)).toBe('hour')
    expect(contextUnitFor(1400 / (6 * HOUR), H)).toBe('day') // half hours labeled: hours read "8PM"
    expect(contextUnitFor(400 / (5 * 1000), H)).toBe('hour')
  })
  it('labels days while the ticks are hours (they carry AM/PM)', () => {
    expect(contextUnitFor(150 / HOUR, H)).toBe('day')
    expect(contextUnitFor(150 / (6 * HOUR), H)).toBe('day')
  })
  it('labels months while the ticks are days, and nothing past that', () => {
    expect(contextUnitFor(120 / DAY, H)).toBe('month')
    expect(contextUnitFor(1400 / (5 * 365 * DAY), H)).toBeNull()
  })
})

describe('contextBoundaries', () => {
  it('starts at the boundary at or before the start (the label that sticks)', () => {
    const start = new Date(2026, 9, 15, 20, 19).getTime()
    const b = contextBoundaries(start, start + 2 * HOUR, 'hour')
    expect(b.map(t => new Date(t).getHours())).toEqual([20, 21, 22])
    expect(b[0]).toBeLessThanOrEqual(start)
  })
  it('steps days by the calendar', () => {
    const start = new Date(2026, 9, 15, 20).getTime()
    expect(contextBoundaries(start, start + DAY, 'day').map(t => new Date(t).getDate())).toEqual([15, 16])
  })
})

describe('formatContext', () => {
  const now = new Date(2026, 9, 15, 12).getTime()
  it('gives the day and the hour for an hour', () => {
    const text = formatContext(new Date(2026, 9, 15, 20).getTime(), 'hour', now)
    expect(text).toContain('15')
    expect(text).toMatch(/·/)
  })
  it('adds the year only for another year', () => {
    expect(formatContext(new Date(2026, 9, 16).getTime(), 'day', now)).not.toContain('2026')
    expect(formatContext(new Date(2027, 0, 2).getTime(), 'day', now)).toContain('2027')
  })
})

describe('stickyPlace', () => {
  it('sticks the current label at the edge and leaves later ones at their boundaries', () => {
    expect(stickyPlace([-300, 200, 600], [120, 120, 120], 14, 8)).toEqual([14, 200, 600])
  })
  it('pushes the stuck label off as the next boundary arrives', () => {
    expect(stickyPlace([-300, 100], [120, 120], 14, 8)).toEqual([-28, 100])
  })
})
