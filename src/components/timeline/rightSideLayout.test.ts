import { describe, expect, it } from 'vitest'
import type { Frame } from '../../engine/viewportEngine.ts'
import type { BottomLane } from './useBottomLanes.ts'
import { rightSideLayout, setRightSideInputs } from './rightSideLayout.ts'

const frame = (crossSize = 390): Frame => ({
  orientation: 'vertical', now: 0, center: 0, mainSize: 800, crossSize, pxPerMs: 1,
  pos: (t: number) => t + 400,
} as unknown as Frame)

const inst = (id: string, ts: number) => ({ id, tsEpochMs: ts, label: id })
const savedLayout = { visibleIds: [], rows: {}, crossOffsets: {}, shifts: {}, folded: {}, foldCount: {}, clusters: [], bellIds: [], bellFolded: {}, doneFolded: {}, planFolded: {}, marks: {}, markFade: {}, rowsUsed: 1 }

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
  it('keeps a selected span’s chip on its span, over plain instant chips, stepping off it only for the selected one', () => {
    // A one-second span (too short to hold its chip): its chip wants y 400, right on the selected instant's chip.
    const a = inst('a', -1), b = inst('b', 0)
    const selectedSpan: BottomLane = {
      key: 's1', kind: 'saved', a: a.tsEpochMs, b: b.tsEpochMs, top: 0, index: 0,
      span: { span: { id: 's1', startInstantId: 'a', endInstantId: 'b', label: 'Lap 1' }, start: a, end: b, priority: 1, focused: false },
    }
    const saved = { ...savedLayout, visibleIds: ['b'], rows: { b: 0 }, crossOffsets: { b: 0 } }
    const inputs = { lanes: [selectedSpan], selectedSpanId: 's1', savedAt: () => saved, instants: [a, b], widths: { b: 300 }, moving: null }
    // Its tools draw over plain instant chips: it stays on its span (y 399–400), over b's chip (386–414).
    setRightSideInputs(inputs)
    const on = rightSideLayout(frame()).chips.s1
    expect(on - 16 <= 399 && on + 16 >= 400).toBe(true)
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

  // A todo's plan (domain/blocks): it follows its todo's chip (planLook).
  const plan = (key: string, start: number, end: number, instantId: string, index = 0): BottomLane => ({
    key, kind: 'block', a: start, b: end, top: 0, index,
    block: { key, start, end, label: key, look: 'planned', instantId },
  })

  it('draws a plan’s bar alone while its length is folded into its todo’s chip, and nothing while that is a Mark', () => {
    const at = inst('at', -200)
    const lane = plan('plan:t', -200, 100, 'at')
    const folded = { ...savedLayout, visibleIds: ['at'], rows: { at: 0 }, crossOffsets: { at: 0 }, planFolded: { at: 300 } }
    setRightSideInputs({ lanes: [lane], selectedSpanId: null, savedAt: () => folded, instants: [at], widths: { at: 40 }, moving: null })
    let placed = rightSideLayout(frame())
    expect(placed.bare['plan:t']).toBe(true)
    expect(placed.chips['plan:t']).toBeUndefined()
    // Its todo a Mark: the plan isn't drawn (it comes back with the chip).
    setRightSideInputs({ lanes: [lane], selectedSpanId: null, savedAt: () => ({ ...savedLayout, visibleIds: ['at'], marks: { at: true } }), instants: [at], widths: {}, moving: null })
    placed = rightSideLayout(frame())
    expect(placed.hidden['plan:t']).toBe(true)
    expect(placed.chips['plan:t']).toBeUndefined()
  })

  it('puts a plan’s chip on what shows of it when its todo is off screen, never past its ends', () => {
    // A long plan from above the screen (y -100) to y 400: its chip at the middle of what shows (y 200).
    const at = inst('at', -500)
    const lane = plan('plan:t', -500, 0, 'at')
    setRightSideInputs({ lanes: [lane], selectedSpanId: null, savedAt: () => savedLayout, instants: [at], widths: {}, moving: null })
    expect(rightSideLayout(frame()).chips['plan:t']).toBe(200)
    // What shows of it (y 0–40) is taken by an instant chip at y 20: its bar alone, not a chip off its span.
    const short = plan('plan:s', -500, -360, 'at')
    const c = inst('c', -380)
    const withChip = { ...savedLayout, visibleIds: ['c'], rows: { c: 0 }, crossOffsets: { c: 0 } }
    setRightSideInputs({ lanes: [short], selectedSpanId: null, savedAt: () => withChip, instants: [at, c], widths: { c: 300 }, moving: null })
    const placed = rightSideLayout(frame())
    expect(placed.chips['plan:s']).toBeUndefined()
    expect(placed.bare['plan:s']).toBe(true)
  })

  it('aims a crowded (compact) label box at its span’s middle, not at Now', () => {
    // A span y 580–620 (middle 600), Now at 400. An instant chip at 600 leaves room only for the compact box.
    const a = inst('a', 180), b = inst('b', 220), c = inst('c', 200)
    const span: BottomLane = {
      key: 's', kind: 'saved', a: a.tsEpochMs, b: b.tsEpochMs, top: 0, index: 0,
      span: { span: { id: 's', startInstantId: 'a', endInstantId: 'b', label: 'Roast' }, start: a, end: b, priority: 2, focused: false },
    }
    const withChip = { ...savedLayout, visibleIds: ['c'], rows: { c: 0 }, crossOffsets: { c: 0 } }
    // The chip reaches x 272 (chipStart + 120): clear of the compact box (x 316–372), not of the whole one (x 222–372).
    setRightSideInputs({ lanes: [span], selectedSpanId: null, savedAt: () => withChip, instants: [a, b, c], widths: { c: 120 }, moving: null })
    const placed = rightSideLayout(frame())
    expect(placed.compact.s).toBe(true)
    expect(placed.flags.s).toBe(600)
  })
})
