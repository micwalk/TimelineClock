import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { BottomLanes } from './Lanes.tsx'
import type { BottomLane } from './useBottomLanes.ts'
import { engine } from '../../engine/viewportEngine.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { initialViewState, useView } from '../../store/view.ts'
import { resolveSpan } from '../../domain/spans.ts'
import { MINUTE, SECOND } from '../../domain/time.ts'

beforeEach(() => {
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [] })
  useView.setState(initialViewState())
})

/** A saved span from 30 to 3m47s ago (26:13 long), as useBottomLanes would place it. */
function savedLane(label = ''): { lane: BottomLane; spanId: string } {
  const now = engine.getFrame().now
  const a = entities.createInstant(now - 30 * MINUTE, 'Rice')
  const b = entities.createInstant(now - 3 * MINUTE - 47 * SECOND, 'Done')
  const spanId = entities.createSpan(a, b, label, { visible: true })
  const byId = new Map(useEntities.getState().instants.map(i => [i.id, i]))
  const r = resolveSpan(entities.getSpan(spanId)!, byId)!
  return { spanId, lane: { key: spanId, kind: 'saved', span: { ...r, priority: 2, focused: false }, a: r.start.tsEpochMs, b: r.end!.tsEpochMs, top: 200 } }
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
})
