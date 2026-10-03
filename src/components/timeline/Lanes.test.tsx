import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { BottomLanes } from './Lanes.tsx'
import type { BottomLane } from './useBottomLanes.ts'
import { engine } from '../../engine/viewportEngine.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { initialViewState, useView } from '../../store/view.ts'
import { useLayout } from '../../store/layout.ts'
import { resolveSpan } from '../../domain/spans.ts'
import { MINUTE, SECOND } from '../../domain/time.ts'

beforeEach(() => {
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [] })
  useView.setState(initialViewState())
  useLayout.setState({ orientation: 'horizontal', dir: 1 })
})

/** A saved span from 30 to 3m47s ago (26:13 long), as useBottomLanes would place it. */
function savedLane(label = ''): { lane: BottomLane; spanId: string } {
  const now = engine.getFrame().now
  const a = entities.createInstant(now - 30 * MINUTE, 'Rice')
  const b = entities.createInstant(now - 3 * MINUTE - 47 * SECOND, 'Done')
  const spanId = entities.createSpan(a, b, label, { visible: true })
  const byId = new Map(useEntities.getState().instants.map(i => [i.id, i]))
  const r = resolveSpan(entities.getSpan(spanId)!, byId)!
  return { spanId, lane: { key: spanId, kind: 'saved', span: { ...r, priority: 2, focused: false }, a: r.start.tsEpochMs, b: r.end!.tsEpochMs, top: 200, index: 0 } }
}

describe('span chips', () => {
  it('show only the duration', () => {
    const { lane } = savedLane()
    render(<BottomLanes lanes={[lane]} />)
    expect(screen.getByText('26:13')).toBeInTheDocument()
    expect(screen.queryByText(/Rice/)).toBeNull()
  })

  it('show the name of a named span', () => {
    const { lane } = savedLane('Cooking')
    render(<BottomLanes lanes={[lane]} />)
    expect(screen.getByText('Cooking')).toBeInTheDocument()
  })

  it('show the endpoints when selected', () => {
    const { lane, spanId } = savedLane()
    render(<BottomLanes lanes={[lane]} />)
    act(() => useView.setState({ selectedSpanId: spanId }))
    expect(screen.getByText('Rice → Done')).toBeInTheDocument()
  })

  it('keep the name first when selected: "name: Start → End"', () => {
    const { lane, spanId } = savedLane('beach')
    render(<BottomLanes lanes={[lane]} />)
    act(() => useView.setState({ selectedSpanId: spanId }))
    expect(screen.getByText('beach: Rice → Done')).toBeInTheDocument()
    expect(screen.getByText('26:13')).toBeInTheDocument()
  })

  it('are named by their visible text', () => {
    render(<BottomLanes lanes={[savedLane().lane]} />)
    expect(screen.getByRole('button', { name: /26:13/ })).toBeInTheDocument()
  })

  it('are named by the span name when named', () => {
    render(<BottomLanes lanes={[savedLane('Cooking').lane]} />)
    expect(screen.getByRole('button', { name: /Cooking/ })).toBeInTheDocument()
  })
})

describe('vertical lanes', () => {
  it('write y transforms and heights, and stack from the right edge', async () => {
    useLayout.setState({ orientation: 'vertical' })
    engine.setSize(390, 700) // a changed size makes the engine compute a vertical frame
    await new Promise(r => setTimeout(r, 50))
    expect(engine.getFrame().orientation).toBe('vertical')
    const { lane } = savedLane()
    const { container } = render(<BottomLanes lanes={[{ ...lane, index: 2 }]} />)
    const root = container.querySelector('.tl-lane') as HTMLElement
    const line = container.querySelector('.tl-lane__line') as HTMLElement
    expect(root.style.getPropertyValue('--i')).toBe('2')
    expect(root.style.top).toBe('')
    expect(line.style.transform).toMatch(/^translate3d\(0(px)?, ?-?[\d.]+px, ?0(px)?\)$/)
    expect(line.style.height).toMatch(/^[\d.]+px$/)
    expect(line.style.width).toBe('')
    expect(container.querySelector('.tl-lane__chev--left')).not.toBeNull()
    expect(container.querySelector('.span-chip')).toBeNull() // no controls: just the bar
  })

  it('draw the chip in vertical for a lane with controls', () => {
    useLayout.setState({ orientation: 'vertical' })
    const { lane } = savedLane()
    if (lane.kind !== 'saved') throw new Error('saved lane expected')
    const { container } = render(<BottomLanes lanes={[{ ...lane, span: { ...lane.span, focused: true } }]} />)
    expect(container.querySelector('.span-chip')).not.toBeNull()
  })
})

describe('layering', () => {
  it('draws the bar and chevrons in a lines layer separate from the chip and tools', () => {
    const { lane } = savedLane()
    const { container } = render(<BottomLanes lanes={[lane]} />)
    const lines = container.querySelector('.tl-lane--lines') as HTMLElement
    const labels = container.querySelector('.tl-lane--labels') as HTMLElement
    expect(lines).not.toBeNull()
    expect(labels).not.toBeNull()
    expect(lines.contains(labels)).toBe(false)
    expect(labels.contains(lines)).toBe(false)
    expect(lines.querySelector('.tl-lane__line')).not.toBeNull()
    expect(lines.querySelector('.tl-lane__chev--left')).not.toBeNull()
    expect(lines.querySelector('.span-chip')).toBeNull()
    expect(labels.querySelector('.span-chip')).not.toBeNull()
    expect(labels.querySelector('.tl-lane__line')).toBeNull()
  })
})
