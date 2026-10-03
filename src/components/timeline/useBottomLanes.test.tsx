import { act, render, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { BottomLanes } from './Lanes.tsx'
import { useVisibleLanes } from './useBottomLanes.ts'
import type { BottomLane } from './useBottomLanes.ts'
import { engine } from '../../engine/viewportEngine.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { initialViewState, useView } from '../../store/view.ts'
import { formatClockCompact } from '../../domain/format.ts'
import { MINUTE } from '../../domain/time.ts'

beforeEach(() => {
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [] })
  useView.setState(initialViewState())
})

const kinds = (lanes: BottomLane[]) => lanes.map(l => l.kind)

describe('implied lanes', () => {
  it('shows Previous→Selected when two instants are selected in turn, and not Selected→Now by default', () => {
    const now = engine.getFrame().now
    const a = entities.createInstant(now - 20 * MINUTE, 'Wake up')
    const b = entities.createInstant(now - 10 * MINUTE, 'Sleep')
    useView.setState({ secondarySelectedInstantId: a, currentSelectedInstantId: b })
    const { result } = renderHook(() => useVisibleLanes())
    expect(kinds(result.current)).toEqual(['secondary'])
  })

  it('shows Selected→Now only when its toggle is on', () => {
    const id = entities.createInstant(engine.getFrame().now - 10 * MINUTE, 'Rice')
    useView.setState({ currentSelectedInstantId: id })
    const { result } = renderHook(() => useVisibleLanes())
    expect(kinds(result.current)).toEqual([])
    act(() => useView.setState({ showImpliedSelectedNow: true }))
    expect(kinds(result.current)).toEqual(['selected-now'])
  })

  it('shows Selected→Cursor in cursor mode with a selection away from the cursor', () => {
    const now = engine.getFrame().now
    const id = entities.createInstant(now - 10 * MINUTE, 'Rice')
    useView.setState({ currentSelectedInstantId: id, viewFocusMode: 'cursor', timeCenter: now })
    const { result } = renderHook(() => useVisibleLanes())
    expect(kinds(result.current)).toEqual(['selected-cursor'])
    expect(result.current[0]).toMatchObject({ b: 'center' })
  })

  it('has no cursor lane in Now mode or without a selection', () => {
    const id = entities.createInstant(engine.getFrame().now - 10 * MINUTE, 'Rice')
    useView.setState({ currentSelectedInstantId: id })
    const { result } = renderHook(() => useVisibleLanes())
    expect(kinds(result.current)).not.toContain('selected-cursor')
    act(() => useView.setState({ currentSelectedInstantId: null, viewFocusMode: 'cursor' }))
    expect(kinds(result.current)).toEqual([])
  })
})

describe('implied lane chips', () => {
  it('name their endpoints in time order with the length', () => {
    const now = engine.getFrame().now
    const a = entities.createInstant(now - 20 * MINUTE, 'Wake up')
    const b = entities.createInstant(now - 4 * MINUTE, 'Sleep')
    useView.setState({ secondarySelectedInstantId: b, currentSelectedInstantId: a })
    const { result } = renderHook(() => useVisibleLanes())
    render(<BottomLanes lanes={result.current.map(l => ({ ...l, top: 200 }))} />)
    expect(screen.getByText('Wake up → Sleep')).toBeInTheDocument()
    expect(screen.getByText('16:00')).toBeInTheDocument()
  })

  it('name an unnamed instant by its compact time (for screen readers) and show only the short length for a live lane', () => {
    const now = engine.getFrame().now
    const ts = now - 10 * MINUTE
    const id = entities.createInstant(ts, '')
    useView.setState({ currentSelectedInstantId: id, viewFocusMode: 'cursor', timeCenter: now })
    const { result } = renderHook(() => useVisibleLanes())
    render(<BottomLanes lanes={result.current.map(l => ({ ...l, top: 200 }))} />)
    expect(screen.getByText(`${formatClockCompact(ts, false)} to Cursor`, { exact: false })).toBeInTheDocument()
    expect(screen.getByText('10m')).toBeInTheDocument()
  })
})
