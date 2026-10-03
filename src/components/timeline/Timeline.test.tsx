import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timeline } from './Timeline.tsx'
import { engine } from '../../engine/viewportEngine.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { initialViewState, useView } from '../../store/view.ts'
import { useLayout } from '../../store/layout.ts'
import { useChipWidths } from './savedLayout.ts'
import { MINUTE } from '../../domain/time.ts'

class FakeResizeObserver {
  cb: () => void
  constructor(cb: () => void) {
    this.cb = cb
  }
  observe() { this.cb() }
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  engine.setSize(1200, 400)
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [] })
  useView.setState(initialViewState())
  useChipWidths.setState({ widths: {} })
  useLayout.setState({ orientation: 'horizontal', dir: 1 })
})

afterEach(() => vi.unstubAllGlobals())

describe('Timeline height', () => {
  it('stays finite with measured chip widths and stacked rows', () => {
    const t = engine.getFrame().now - 20 * MINUTE
    const a = entities.createInstant(t, 'Take Meds')
    const b = entities.createInstant(t + 1000, 'Tea')
    useChipWidths.setState({ widths: { [a]: 150, [b]: 90 } })
    const { container } = render(<Timeline />)
    const el = container.querySelector('section.timeline') as HTMLElement
    expect(el.style.height).toMatch(/^\d+(\.\d+)?px$/)
    expect(container.innerHTML).not.toContain('NaN')
  })
})

describe('Timeline orientation', () => {
  it('flags the orientation and only sizes itself from the lanes when horizontal', () => {
    const { container, rerender } = render(<Timeline />)
    const el = container.querySelector('section.timeline') as HTMLElement
    expect(el.dataset.orientation).toBe('horizontal')
    expect(el.style.height).not.toBe('')
    expect(el.style.getPropertyValue('--tl-chip-start')).toBe('')
    act(() => useLayout.setState({ orientation: 'vertical' }))
    rerender(<Timeline />)
    expect(el.dataset.orientation).toBe('vertical')
    expect(el.style.height).toBe('')
    expect(el.style.getPropertyValue('--tl-axis')).toBe('84px')
    expect(el.style.getPropertyValue('--tl-chip-start')).toBe('96px')
    expect(container.innerHTML).not.toContain('NaN')
  })
})
