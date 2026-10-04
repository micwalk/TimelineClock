import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { BottomLanes } from './Lanes.tsx'
import { isLiveLane, liveLaneVariant, partitionLanes, placeLanes, useVisibleLanes } from './useBottomLanes.ts'
import type { BottomLane } from './useBottomLanes.ts'
import { GEOMETRY, LIVE_LANES, geometryStyleFor, lanesTop, liveBandHeight, verticalLiveLaneX } from './geometry.ts'
import { engine } from '../../engine/viewportEngine.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { initialViewState, useView } from '../../store/view.ts'
import { useLayout } from '../../store/layout.ts'
import { ui, useUi } from '../../store/ui.ts'
import { MINUTE } from '../../domain/time.ts'

beforeEach(() => {
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [] })
  useView.setState(initialViewState())
  useLayout.setState({ orientation: 'horizontal', dir: 1 })
  ui.closeLaneTools()
})

/** Salad is selected (10m ago) with Rice→Done saved, a span from Salad to Now, the cursor away from Now and the implied lanes on. */
function scene() {
  const now = engine.getFrame().now
  const a = entities.createInstant(now - 30 * MINUTE, 'Rice')
  const b = entities.createInstant(now - 20 * MINUTE, 'Done')
  const c = entities.createInstant(now - 10 * MINUTE, 'Salad')
  const between = entities.createSpan(a, b, 'Cooking', { visible: true })
  const toNow = entities.upsertNowSpan(c, true)
  useView.setState({
    currentSelectedInstantId: c, secondarySelectedInstantId: b, viewFocusMode: 'cursor', timeCenter: now - 5 * MINUTE,
    showImpliedSelectedNow: true, showImpliedSelectedPrev: true,
  })
  return { between, toNow }
}

describe('live and saved lanes', () => {
  it('partitions lanes: an endpoint at Now or the cursor is live; saved-to-saved is not', () => {
    const { between } = scene()
    const { result } = renderHook(() => useVisibleLanes())
    const { live, saved } = partitionLanes(result.current)
    // Selected→Now is replaced by the saved span to Now (same start), so the live side has that and Selected→Cursor.
    expect(live.map(l => l.kind).sort()).toEqual(['saved', 'selected-cursor'])
    expect(saved.map(l => l.kind).sort()).toEqual(['saved', 'secondary'])
    expect(saved.some(l => l.kind === 'saved' && l.span.span.id === between)).toBe(true)
    expect(live.every(isLiveLane)).toBe(true)
    expect(saved.some(isLiveLane)).toBe(false)
  })

  it('puts the implied Selected→Now lane on the live side when no saved span covers it', () => {
    const now = engine.getFrame().now
    const id = entities.createInstant(now - 10 * MINUTE, 'Rice')
    useView.setState({ currentSelectedInstantId: id, showImpliedSelectedNow: true })
    const { result } = renderHook(() => useVisibleLanes())
    expect(partitionLanes(result.current).live.map(l => l.kind)).toEqual(['selected-now'])
  })

  it('keeps a span whose endpoint is the moving instant on the saved side', () => {
    const now = engine.getFrame().now
    const a = entities.createInstant(now - 30 * MINUTE, 'A')
    const b = entities.createInstant(now - 20 * MINUTE, 'B')
    entities.createSpan(a, b, '', { visible: true })
    useView.setState({ moveMode: { instantId: b, originalCenter: now } })
    const { result } = renderHook(() => useVisibleLanes())
    expect(result.current).toHaveLength(1)
    expect(result.current[0]).toMatchObject({ b: 'center' })
    expect(isLiveLane(result.current[0])).toBe(false)
  })

  it('colours live lanes: Now red for spans to Now, the cursor accent for Selected→Cursor', () => {
    scene()
    const { result } = renderHook(() => useVisibleLanes())
    const { live } = partitionLanes(result.current)
    expect(Object.fromEntries(live.map(l => [l.kind, liveLaneVariant(l)]))).toEqual({ saved: 'now', 'selected-cursor': 'cursor' })
    const { container } = render(<BottomLanes lanes={live.map((l, i) => ({ ...l, top: 10 + i * 24, index: i }))} />)
    expect(container.querySelectorAll('.tl-lane--now.tl-lane--live')).not.toHaveLength(0)
    expect(container.querySelectorAll('.tl-lane--cursor.tl-lane--live')).not.toHaveLength(0)
  })

  it('shows short chips: compact length, a named span truncated', () => {
    const now = engine.getFrame().now
    const a = entities.createInstant(now - 65 * MINUTE, 'Long walk')
    const spanId = entities.upsertNowSpan(a, true)
    useEntities.setState(s => ({ spans: s.spans.map(sp => (sp.id === spanId ? { ...sp, label: 'Making dinner' } : sp)) }))
    useView.setState({ currentSelectedInstantId: a })
    const { result } = renderHook(() => useVisibleLanes())
    const { live } = partitionLanes(result.current)
    render(<BottomLanes lanes={live.map((l, i) => ({ ...l, top: 10 + i * 24, index: i }))} />)
    expect(screen.getByText('1h 5m')).toBeInTheDocument()
    expect(screen.getByText('Making…')).toBeInTheDocument()
  })
})

describe('live lane placement', () => {
  const inst = { id: 'i', tsEpochMs: 0, label: '' }
  const cursorLane = (i: number): BottomLane => ({ key: `c${i}`, kind: 'selected-cursor', selected: inst, a: 1, b: 'center', top: 0, index: 0 })
  const secondaryLane: BottomLane = { key: 's', kind: 'secondary', selected: inst, secondary: inst, a: 1, b: 2, top: 0, index: 0 }

  it('horizontal: live lanes sit at y = 10 + i * 24 and saved lanes start below the band', () => {
    const { lanes, liveCount } = placeLanes([cursorLane(0), secondaryLane, cursorLane(1)], 1, 'horizontal')
    expect(liveCount).toBe(2)
    expect(lanes.filter(isLiveLane).map(l => l.top)).toEqual([10, 34])
    const saved = lanes.find(l => !isLiveLane(l))!
    expect(saved.top).toBeGreaterThan(lanesTop(1, 2))
  })

  it('vertical: live lanes stack from the left edge (x = 8 + i * 12) and there is no band', () => {
    expect([0, 1, 2].map(verticalLiveLaneX)).toEqual([8, 20, 32])
    const { lanes, liveCount } = placeLanes([cursorLane(0), cursorLane(1)], 1, 'vertical')
    expect(liveCount).toBe(0)
    expect(lanes.map(l => l.index)).toEqual([0, 1])
  })

  it('lanes already placed keep their slots when a more important lane arrives', () => {
    const savedLane = (k: string): BottomLane => ({ ...secondaryLane, key: k })
    const first = placeLanes([savedLane('a'), savedLane('b')], 1, 'vertical')
    const second = placeLanes([savedLane('x'), savedLane('a'), savedLane('b')], 1, 'vertical', first.slots)
    expect(Object.fromEntries(second.lanes.map(l => [l.key, l.index]))).toEqual({ x: 2, a: 0, b: 1 })
  })

  it('horizontal geometry: the axis offset grows with the live-lane count and equals today\'s with none', () => {
    expect(liveBandHeight(0)).toBe(0)
    expect(liveBandHeight(2)).toBeGreaterThan(liveBandHeight(1))
    expect(liveBandHeight(1)).toBe(LIVE_LANES.gap + LIVE_LANES.pitch)
    expect(geometryStyleFor('horizontal', 0)).toMatchObject({ '--tl-axis': `${GEOMETRY.axis}px`, '--tl-chip-top': `${GEOMETRY.chipTop}px` })
    expect(geometryStyleFor('horizontal', 2)).toMatchObject({
      '--tl-axis': `${GEOMETRY.axis + liveBandHeight(2)}px`,
      '--tl-chip-top': `${GEOMETRY.chipTop + liveBandHeight(2)}px`,
    })
    expect(lanesTop(1, 0)).toBe(GEOMETRY.chipTop + GEOMETRY.chipRow + 14)
    expect(lanesTop(1, 2)).toBe(lanesTop(1, 0) + liveBandHeight(2))
  })
})

describe('live lane tools', () => {
  it('stay hidden until the chip is tapped, then close on an outside tap', () => {
    scene()
    const { result } = renderHook(() => useVisibleLanes())
    const lane = partitionLanes(result.current).live.find(l => l.kind === 'selected-cursor')!
    render(<BottomLanes lanes={[{ ...lane, top: 10, index: 0 }]} />)
    expect(screen.queryByRole('button', { name: 'Save this span' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Focus endpoint' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Salad to Cursor/ }))
    expect(screen.getByRole('button', { name: 'Save this span' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Focus endpoint' })).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(useUi.getState().laneTools).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save this span' })).toBeNull()
  })

  it('show a saved live span\'s rename and delete only after a tap', () => {
    scene()
    const { result } = renderHook(() => useVisibleLanes())
    const lane = partitionLanes(result.current).live.find(l => l.kind === 'saved')!
    render(<BottomLanes lanes={[{ ...lane, top: 10, index: 0 }]} />)
    expect(screen.queryByRole('button', { name: 'Delete span' })).toBeNull()
    act(() => ui.toggleLaneTools(lane.key))
    expect(screen.getByRole('button', { name: 'Delete span' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rename span' })).toBeInTheDocument()
  })
})
