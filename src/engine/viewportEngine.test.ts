import { beforeEach, describe, expect, it } from 'vitest'
import { engine } from './viewportEngine.ts'
import { useLayout } from '../store/layout.ts'
import { initialViewState, useView } from '../store/view.ts'
import { useEntities } from '../store/entities.ts'

beforeEach(() => {
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [] })
  useView.setState({ ...initialViewState(), viewFocusMode: 'cursor' })
  useLayout.setState({ orientation: 'horizontal', dir: 1 })
  engine.setSize(1000, 400)
})

describe('engine frames', () => {
  it('project along the width when horizontal', () => {
    const f = engine.sample()
    expect(f.orientation).toBe('horizontal')
    expect(f.mainSize).toBe(1000)
    expect(f.crossSize).toBe(400)
    expect(f.pos(f.center)).toBeCloseTo(500)
    expect(f.pos(f.center + f.width / 10)).toBeCloseTo(600)
    expect(f.time(600)).toBeCloseTo(f.center + f.width / 10)
    expect(f.pxPerMs).toBeCloseTo(1000 / f.width)
    expect(f.start).toBeCloseTo(f.center - f.width / 2)
    expect(f.end).toBeCloseTo(f.center + f.width / 2)
  })

  it('project along the height when vertical, in either direction', () => {
    useLayout.setState({ orientation: 'vertical', dir: 1 })
    let f = engine.sample()
    expect(f.mainSize).toBe(400)
    expect(f.crossSize).toBe(1000)
    expect(f.pos(f.center + f.width / 10)).toBeCloseTo(240)
    useLayout.setState({ dir: -1 })
    f = engine.sample()
    expect(f.pos(f.center + f.width / 10)).toBeCloseTo(160)
    expect(f.start).toBeLessThan(f.end)
  })

  it('keep the center and visible time span when the orientation changes', () => {
    const before = engine.sample()
    useLayout.setState({ orientation: 'vertical' })
    const after = engine.sample()
    expect(after.center).toBeCloseTo(before.center)
    expect(after.width).toBeCloseTo(before.width)
  })
})
