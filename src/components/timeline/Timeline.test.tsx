import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timeline } from './Timeline.tsx'
import { engine } from '../../engine/viewportEngine.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { initialViewState, useView } from '../../store/view.ts'
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
