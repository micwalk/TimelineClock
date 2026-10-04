import { describe, expect, it } from 'vitest'
import type { Frame } from '../../engine/viewportEngine.ts'
import type { BottomLane } from './useBottomLanes.ts'
import { rightSideLayout, setRightSideInputs } from './rightSideLayout.ts'

const frame = (crossSize = 390): Frame => ({
  orientation: 'vertical', now: 0, center: 0, mainSize: 800, crossSize, pxPerMs: 1,
  pos: (t: number) => t + 400,
} as unknown as Frame)

const inst = (id: string, ts: number) => ({ id, tsEpochMs: ts, label: id })
const savedLayout = { visibleIds: [], rows: {}, crossOffsets: {}, shifts: {}, folded: {}, foldCount: {}, clusters: [], rowsUsed: 1 }

describe('rightSideLayout', () => {
  it('keeps the chips of overlapping selected lanes apart (the selected span and the implied selection span)', () => {
    const a = inst('a', -300), b = inst('b', 300), c = inst('c', -200)
    const selectedSpan: BottomLane = {
      key: 's1', kind: 'saved', a: a.tsEpochMs, b: b.tsEpochMs, top: 0, index: 0,
      span: { span: { id: 's1', startInstantId: 'a', endInstantId: 'b', label: 'Lap 1' }, start: a, end: b, priority: 1, focused: false },
    }
    const implied: BottomLane = { key: 'implied-secondary', kind: 'secondary', selected: b, secondary: c, a: c.tsEpochMs, b: b.tsEpochMs, top: 0, index: 1 }
    setRightSideInputs({ lanes: [selectedSpan, implied], selectedSpanId: 's1', saved: savedLayout, instants: [a, b, c], widths: {}, moving: null, flagWidth: () => undefined })
    const { chips } = rightSideLayout(frame())
    expect(Object.keys(chips).sort()).toEqual(['implied-secondary', 's1'])
    // Each chip block (chip plus its tools, 104px) clears the other.
    expect(Math.abs(chips.s1 - chips['implied-secondary'])).toBeGreaterThanOrEqual(104)
  })
  it('moves a live chip only when it would actually touch a right-side chip across the axis', () => {
    // Selected span: y 0–500 (middle 250). Live span a → Now: y 100–400 (middle 250).
    const a = inst('a', -300), b = inst('b', 100), start = inst('start', -400)
    const selectedSpan: BottomLane = {
      key: 's1', kind: 'saved', a: start.tsEpochMs, b: b.tsEpochMs, top: 0, index: 0,
      span: { span: { id: 's1', startInstantId: 'start', endInstantId: 'b', label: 'Lap 1' }, start, end: b, priority: 1, focused: false },
    }
    const liveLane: BottomLane = {
      key: 'n1', kind: 'saved', a: -300, b: 'now', top: 0, index: 0,
      span: { span: { id: 'n1', startInstantId: 'a', endInstantId: '__NOW__', label: '', endIsNow: true }, start: a, priority: 1, focused: false },
    }
    setRightSideInputs({ lanes: [selectedSpan, liveLane], selectedSpanId: 's1', saved: savedLayout, instants: [a, b, start], widths: {}, moving: null, flagWidth: () => undefined })
    // Wide screen: the right chip (x 208–368) and the live chip (x 18–178) don't meet, so both stay at y 250.
    const wide = rightSideLayout(frame(390)).chips
    expect(wide.s1).toBe(250)
    expect(wide.n1).toBe(250)
    // Narrow screen: the right chip reaches x 118, over the live chip, so the live chip moves aside.
    const narrow = rightSideLayout(frame(300)).chips
    expect(Math.abs(narrow.n1 - narrow.s1)).toBeGreaterThanOrEqual(52 + 16)
  })
})
