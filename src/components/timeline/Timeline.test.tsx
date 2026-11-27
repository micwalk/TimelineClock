import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timeline } from './Timeline.tsx'
import { engine } from '../../engine/viewportEngine.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { initialViewState, useView } from '../../store/view.ts'
import { useLayout } from '../../store/layout.ts'
import { useChipWidths } from './savedLayout.ts'
import { laneChipLayout } from './laneChipLayout.ts'
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

describe('crowded span names', () => {
  it('put spans that follow each other on one lane; chips with no room on their span leave their bar alone, which a tap selects', () => {
    const c = engine.getFrame().center
    const ids = [0, 1, 2, 3, 4].map(k => entities.createInstant(c + k * 2000, `Lap ${k}`))
    const spans = [0, 1, 2, 3].map(k => entities.createSpan(ids[k], ids[k + 1], `Lap ${k + 1}`, { visible: true }))
    const { container } = render(<Timeline />)
    // One lane for all four: every lane line sits at the same height.
    const tops = new Set([...container.querySelectorAll<HTMLElement>('.tl-lane--lines')].map(l => l.style.top))
    expect(tops.size).toBe(1)
    // No "N spans" stand-in: two-second spans side by side have room for one chip; the rest are bars.
    expect(screen.queryByRole('button', { name: /spans:/ })).not.toBeInTheDocument()
    const placed = laneChipLayout(engine.getFrame())
    expect(Object.keys(placed.shown)).toHaveLength(1)
    expect(Object.keys(placed.bare).sort()).toEqual(spans.filter(id => !(id in placed.shown)).sort())
    const bars = container.querySelectorAll<HTMLElement>('.tl-lane__hit')
    expect(bars).toHaveLength(4)
    fireEvent.click(bars[2])
    expect(spans).toContain(useView.getState().selectedSpanId)
  })

  it('shows a crowded span’s length alone (compact) where its whole chip has no room, still on its span', () => {
    const c = engine.getFrame().center
    const ids = [0, 1, 2].map(k => entities.createInstant(c + k * 25 * MINUTE, `Step ${k}`))
    const [first, second] = [0, 1].map(k => entities.createSpan(ids[k], ids[k + 1], `Step ${k + 1}`, { visible: true }))
    render(<Timeline />)
    const f = engine.getFrame()
    const placed = laneChipLayout(f)
    expect(placed.bare).toEqual({})
    // Whichever is placed first shows whole, the other its length alone.
    expect(Object.keys(placed.compact)).toHaveLength(1)
    const short = Object.keys(placed.compact)[0]
    const whole = short === first ? second : first
    expect(Object.keys(placed.shown).sort()).toEqual([first, second].sort())
    // Unmeasured in jsdom: a 60px compact chip inside its span (about 114px long here).
    const span = (id: string) => { const sp = useEntities.getState().spans.find(x => x.id === id)!; const t = (iid: string) => useEntities.getState().instants.find(i => i.id === iid)!.tsEpochMs; return [f.pos(t(sp.startInstantId)), f.pos(t(sp.endInstantId))] }
    const [lo, hi] = span(short)
    expect(placed.shown[short] - 30).toBeGreaterThanOrEqual(lo)
    expect(placed.shown[short] + 30).toBeLessThanOrEqual(hi)
    expect(placed.shown[whole]).toBeDefined()
  })
})
