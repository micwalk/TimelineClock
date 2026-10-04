import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = () => {}
})

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
    expect(el.style.getPropertyValue('--tl-axis')).toBe('140px')
    expect(el.style.getPropertyValue('--tl-chip-start')).toBe('152px')
    expect(container.innerHTML).not.toContain('NaN')
  })
})

describe('Timeline tap to deselect', () => {
  const selectAll = () => {
    const t = engine.getFrame().now - 20 * MINUTE
    const a = entities.createInstant(t, 'Rice')
    const b = entities.createInstant(t + 5 * MINUTE, 'Tea')
    const spanId = entities.createSpan(a, b, 'beach', { visible: true })
    useView.setState({ currentSelectedInstantId: b, secondarySelectedInstantId: a, selectedSpanId: spanId, viewFocusMode: 'cursor' })
    return { a, b, spanId }
  }

  it('clears the selections when empty space is tapped, leaving focus and move mode alone', () => {
    selectAll()
    const mm = { instantId: 'x', originalCenter: 0 }
    useView.setState({ moveMode: mm })
    const { container } = render(<Timeline />)
    fireEvent.click(container.querySelector('section.timeline') as HTMLElement)
    expect(useView.getState()).toMatchObject({
      currentSelectedInstantId: null, secondarySelectedInstantId: null, selectedSpanId: null,
      moveMode: mm, viewFocusMode: 'cursor',
    })
  })

  it('tapping a chip selects it instead of clearing', () => {
    const { a } = selectAll()
    useView.setState({ currentSelectedInstantId: null, secondarySelectedInstantId: null, selectedSpanId: null })
    render(<Timeline />)
    fireEvent.click(screen.getByRole('button', { name: /Rice/ }))
    expect(useView.getState().currentSelectedInstantId).toBe(a)
  })

  it('a mouse drag does not clear the selection', () => {
    const { b } = selectAll()
    const { container } = render(<Timeline />)
    const el = container.querySelector('section.timeline') as HTMLElement
    const ptr = (type: string, x: number) => {
      const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 100, button: 0 })
      Object.defineProperties(e, { pointerType: { value: 'mouse' }, pointerId: { value: 1 } })
      el.dispatchEvent(e)
    }
    ptr('pointerdown', 300)
    ptr('pointermove', 340)
    ptr('pointermove', 400)
    ptr('pointerup', 400)
    fireEvent.click(el)
    expect(useView.getState().currentSelectedInstantId).toBe(b)
  })
})
