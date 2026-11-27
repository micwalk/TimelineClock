import { describe, expect, it } from 'vitest'
import type { Frame } from '../../engine/viewportEngine.ts'
import type { BottomLane } from './useBottomLanes.ts'
import { laneChipLayout, setLaneChipInputs } from './laneChipLayout.ts'
import type { SavedLayout } from './savedLayout.ts'

const frame = (): Frame => ({
  orientation: 'horizontal', now: 0, center: 0, mainSize: 1200, crossSize: 400, pxPerMs: 1,
  pos: (t: number) => t + 600,
} as unknown as Frame)

const savedLayout: SavedLayout = { visibleIds: [], rows: {}, crossOffsets: {}, shifts: {}, folded: {}, foldCount: {}, clusters: [], bellIds: [], bellFolded: {}, doneFolded: {}, planFolded: {}, marks: {}, markFade: {}, rowsUsed: 1 }

// A todo's plan (domain/blocks) from its `at`, x 600–900 unless moved.
const plan = (start = 0, end = 300): BottomLane => ({
  key: 'plan:t', kind: 'block', a: start, b: end, top: 0, index: 0,
  block: { key: 'plan:t', start, end, label: 'Pre-warm cooler', look: 'planned', instantId: 'at' },
})
const place = (lane: BottomLane, saved: SavedLayout) => {
  setLaneChipInputs({ lanes: [lane], selectedSpanId: null, savedAt: () => saved })
  return laneChipLayout(frame())
}

describe('laneChipLayout', () => {
  it('puts a todo plan’s chip (its length) at its middle while its todo’s chip shows', () => {
    const placed = place(plan(), { ...savedLayout, visibleIds: ['at'], rows: { at: 0 } })
    expect(placed.shown['plan:t']).toBe(750)
    expect(placed.bare['plan:t']).toBeUndefined()
  })
  it('draws its bar alone once its length is folded into its todo’s chip', () => {
    const placed = place(plan(), { ...savedLayout, visibleIds: ['at'], rows: { at: 0 }, planFolded: { at: 300 } })
    expect(placed.shown['plan:t']).toBeUndefined()
    expect(placed.bare['plan:t']).toBe(true)
  })
  it('isn’t drawn while its todo is a Mark', () => {
    const placed = place(plan(), { ...savedLayout, visibleIds: ['at'], marks: { at: true } })
    expect(placed.hidden['plan:t']).toBe(true)
    expect(placed.shown['plan:t']).toBeUndefined()
  })
  it('keeps its chip, on what shows of it, while its todo is off screen', () => {
    // From x -400 to 300: its chip at the middle of what shows (x 0–300).
    const placed = place(plan(-1000, -300), savedLayout)
    expect(placed.shown['plan:t']).toBe(150)
  })
})
