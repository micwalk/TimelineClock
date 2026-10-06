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
    setRightSideInputs({ lanes: [selectedSpan, implied], selectedSpanId: 's1', savedAt: () => savedLayout, instants: [a, b, c], widths: {}, moving: null })
    const { chips } = rightSideLayout(frame())
    expect(Object.keys(chips).sort()).toEqual(['implied-secondary', 's1'])
    // Each chip block (chip plus its tools, 104px) clears the other.
    expect(Math.abs(chips.s1 - chips['implied-secondary'])).toBeGreaterThanOrEqual(104)
  })
  it('keeps a selected span’s chip off the instant chips once it has to leave its span, and always off the selected one', () => {
    // A one-second span (too short to hold its chip): its chip wants y 400, right on the selected instant's chip.
    const a = inst('a', -1), b = inst('b', 0)
    const selectedSpan: BottomLane = {
      key: 's1', kind: 'saved', a: a.tsEpochMs, b: b.tsEpochMs, top: 0, index: 0,
      span: { span: { id: 's1', startInstantId: 'a', endInstantId: 'b', label: 'Lap 1' }, start: a, end: b, priority: 1, focused: false },
    }
    const saved = { ...savedLayout, visibleIds: ['b'], rows: { b: 0 }, crossOffsets: { b: 0 } }
    const inputs = { lanes: [selectedSpan], selectedSpanId: 's1', savedAt: () => saved, instants: [a, b], widths: { b: 300 }, moving: null }
    // A chip too big for its span leaves it, and then keeps clear of instant chips: b's spans y 386–414.
    setRightSideInputs(inputs)
    const free = rightSideLayout(frame()).chips.s1
    expect(free + 52 <= 386 || free - 52 >= 414).toBe(true)
    // Selected, b's chip has its tools row under it too (y 386–444), and draws over the lanes.
    setRightSideInputs({ ...inputs, selectedInstantId: 'b' })
    const y = rightSideLayout(frame()).chips.s1
    // Chip block 104px tall.
    expect(y + 52 <= 386 || y - 52 >= 444).toBe(true)
  })

  it('moves a live chip only when it would actually touch a right-side chip across the axis', () => {
    // Selected span: y 150–350 (middle 250). Live span a → Now: y 100–400 (middle 250).
    const a = inst('a', -300), b = inst('b', -50), start = inst('start', -250)
    const selectedSpan: BottomLane = {
      key: 's1', kind: 'saved', a: start.tsEpochMs, b: b.tsEpochMs, top: 0, index: 0,
      span: { span: { id: 's1', startInstantId: 'start', endInstantId: 'b', label: 'Lap 1' }, start, end: b, priority: 1, focused: false },
    }
    const liveLane: BottomLane = {
      key: 'n1', kind: 'saved', a: -300, b: 'now', top: 0, index: 0,
      span: { span: { id: 'n1', startInstantId: 'a', endInstantId: '__NOW__', label: '', endIsNow: true }, start: a, priority: 1, focused: false },
    }
    setRightSideInputs({ lanes: [selectedSpan, liveLane], selectedSpanId: 's1', savedAt: () => savedLayout, instants: [a, b, start], widths: {}, moving: null })
    // Wide screen: the right chip (x 210–370) and the live chip (x 18–178) don't meet, so both stay at y 250.
    const wide = rightSideLayout(frame(390)).chips
    expect(wide.s1).toBe(250)
    expect(wide.n1).toBe(250)
    // Narrow screen: the right chip reaches x 120, over the live chip, so the live chip moves aside.
    const narrow = rightSideLayout(frame(300)).chips
    expect(Math.abs(narrow.n1 - narrow.s1)).toBeGreaterThanOrEqual(52 + 16)
  })

  it('puts a selected span’s chip at Now while it contains Now, and gives it no label box (the chip reads the same)', () => {
    // A running timer: y 300–520; Now at y 400.
    const start = inst('start', -100), end = inst('end', 120)
    const timer: BottomLane = {
      key: 't', kind: 'saved', a: start.tsEpochMs, b: end.tsEpochMs, top: 0, index: 0,
      span: { span: { id: 't', startInstantId: 'start', endInstantId: 'end', label: '3m timer' }, start, end, priority: 2, focused: false },
    }
    setRightSideInputs({ lanes: [timer], selectedSpanId: null, savedAt: () => savedLayout, instants: [start, end], widths: {}, moving: null })
    expect(rightSideLayout(frame()).flags.t).toBe(400)
    setRightSideInputs({ lanes: [timer], selectedSpanId: 't', savedAt: () => savedLayout, instants: [start, end], widths: {}, moving: null })
    const placed = rightSideLayout(frame())
    expect(placed.flags.t).toBeUndefined()
    // At Now, where the label box was (its 104px chip block fits inside the span there).
    expect(placed.chips.t).toBe(400)
  })
})
