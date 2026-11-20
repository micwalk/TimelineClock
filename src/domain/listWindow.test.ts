import { describe, expect, it } from 'vitest'
import { listWindow, offsetOf, scrollToShow } from './listWindow.ts'

const slots = (n: number, h = 50) => Array.from({ length: n }, () => h)

describe('listWindow', () => {
  it('mounts every row before anything is laid out', () => {
    expect(listWindow(slots(100), 0, 0)).toEqual({ start: 0, end: 100, before: 0, after: 0 })
  })

  it('mounts the rows on screen and a viewport more each way', () => {
    // 500px view at 2000px: rows 40..50 on screen, 30..60 with the overscan.
    const w = listWindow(slots(100), 2000, 500)
    expect(w).toEqual({ start: 30, end: 60, before: 1500, after: 2000 })
  })

  it('stops at the ends', () => {
    expect(listWindow(slots(10), 0, 500)).toEqual({ start: 0, end: 10, before: 0, after: 0 })
    const w = listWindow(slots(100), 4800, 500)
    expect(w.end).toBe(100)
    expect(w.after).toBe(0)
  })

  it('accounts for rows of different heights', () => {
    const s = [100, 20, 20, 300, 20]
    const w = listWindow(s, 130, 10, 0)
    expect(w.start).toBe(2)
    expect(w.end).toBe(3)
    expect(w.before).toBe(120)
    expect(w.after).toBe(320)
  })

  it('spacers and mounted rows add up to the whole list', () => {
    const s = slots(37, 41)
    for (const top of [0, 300, 900, 1500]) {
      const w = listWindow(s, top, 200, 100)
      expect(w.before + offsetOf(s, w.end) - offsetOf(s, w.start) + w.after).toBe(37 * 41)
    }
  })
})

describe('scrollToShow', () => {
  it('leaves a row that already shows', () => {
    expect(scrollToShow(slots(100), 10, 400, 300)).toBeNull()
  })

  it('scrolls the least distance to show a row above or below', () => {
    expect(scrollToShow(slots(100), 2, 400, 300)).toBe(100)
    expect(scrollToShow(slots(100), 20, 400, 300)).toBe(1050 - 300)
  })

  it('keeps a margin clear', () => {
    expect(scrollToShow(slots(100), 2, 400, 300, 10)).toBe(90)
  })
})
