import { describe, expect, it } from 'vitest'
import type { Frame } from '../../engine/viewportEngine.ts'
import type { BottomLane } from './useBottomLanes.ts'
import { rightSideLayout, setRightSideInputs } from './rightSideLayout.ts'

const frame = (): Frame => ({
  orientation: 'vertical', now: 0, center: 0, mainSize: 800, crossSize: 390, pxPerMs: 1,
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
})
