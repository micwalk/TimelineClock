import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CSSProperties } from 'react'
import { ControlBar } from './ControlBar.tsx'
import { engine } from '../../engine/viewportEngine.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { initialViewState, useView } from '../../store/view.ts'
import { useLayout } from '../../store/layout.ts'
import { MINUTE } from '../../domain/time.ts'
import { useQuick } from '../../store/quick.ts'
import { useUi } from '../../store/ui.ts'
import { IDLE_STOPWATCH } from '../../domain/quickCreate.ts'

beforeEach(() => {
  useLayout.setState({ orientation: 'horizontal', dir: 1 })
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [] })
  useView.setState(initialViewState())
  useQuick.setState({ stopwatch: IDLE_STOPWATCH, recentTimers: [] })
  useUi.setState({ timerMenuOpen: false })
})

describe('the big red button', () => {
  it('drops an instant at Now while following Now', () => {
    render(<ControlBar />)
    expect(screen.queryByRole('button', { name: /Focus Now/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Drop an instant at Now' }))
    const [inst] = useEntities.getState().instants
    expect(inst.label).toBe('')
    expect(useView.getState()).toMatchObject({ viewFocusMode: 'now', editingInstantId: null })
  })

  it('is NOW in cursor mode and focuses Now', () => {
    useView.setState({ viewFocusMode: 'cursor', timeCenter: engine.getFrame().center - 600_000 })
    render(<ControlBar />)
    expect(screen.queryByRole('button', { name: 'Drop an instant at Now' })).toBeNull()
    fireEvent.click(screen.getByText('NOW'))
    expect(useView.getState().viewFocusMode).toBe('now')
    expect(useEntities.getState().instants).toHaveLength(0)
  })
})

/** Where a button sits in the vertical bar: "row/column". */
const cellOf = (el: HTMLElement) => {
  const s: CSSStyleDeclaration | CSSProperties = el.closest<HTMLElement>('[style]')!.style
  return `${String(s.gridRow).split(' ')[0]}/${s.gridColumn}`
}
const byName = (name: RegExp) => screen.getByRole('button', { name })

describe('the vertical bar', () => {
  beforeEach(() => {
    useLayout.setState({ orientation: 'vertical', dir: 1 })
    useView.setState({ viewFocusMode: 'cursor', timeCenter: engine.getFrame().now - 60 * MINUTE })
  })

  it('is a two-row grid: zoom out, up, step up, NOW over zoom in, down, step down', () => {
    render(<ControlBar />)
    expect(screen.getByRole('navigation').className).toContain('controls--vertical')
    expect(cellOf(byName(/^Zoom out/))).toBe('1/1')
    expect(cellOf(byName(/^Previous instant/))).toBe('1/2')
    expect(cellOf(byName(/^Back 30 minutes/))).toBe('1/3')
    expect(cellOf(byName(/^Focus Now/))).toBe('1/4')
    expect(byName(/^Focus Now/).style.gridRow).toBe('1 / span 2')
    expect(cellOf(byName(/^Start a stopwatch/))).toBe('1/5')
    expect(cellOf(byName(/^Start a timer/))).toBe('2/5')
    expect(cellOf(byName(/^Zoom in/))).toBe('2/1')
    expect(cellOf(byName(/^Next instant/))).toBe('2/2')
    expect(cellOf(byName(/^Forward 30 minutes/))).toBe('2/3')
  })

  it('uses up and down arrows and compact step labels', () => {
    render(<ControlBar />)
    expect(byName(/^Previous instant/).dataset.nav).toBe('up')
    expect(byName(/^Next instant/).dataset.nav).toBe('down')
    expect(byName(/^Back 30 minutes/)).toHaveTextContent('−30m')
    expect(byName(/^Forward 30 minutes/)).toHaveTextContent('+30m')
  })

  it('future up (dir -1) flips the screen: up is the next instant and +30m, down the previous and -30m', () => {
    useLayout.setState({ dir: -1 })
    render(<ControlBar />)
    expect(cellOf(byName(/^Next instant/))).toBe('1/2')
    expect(byName(/^Next instant/).dataset.nav).toBe('up')
    expect(cellOf(byName(/^Forward 30 minutes/))).toBe('1/3')
    expect(cellOf(byName(/^Previous instant/))).toBe('2/2')
    expect(byName(/^Previous instant/).dataset.nav).toBe('down')
    expect(cellOf(byName(/^Back 30 minutes/))).toBe('2/3')
  })

  it('up steps earlier with the future down, and later with the future up', () => {
    const start = engine.getFrame().now - 60 * MINUTE
    const { unmount } = render(<ControlBar />)
    fireEvent.click(byName(/^Back 30 minutes/)) // step up the screen
    expect(useView.getState().timeCenter).toBe(start - 30 * MINUTE)
    unmount()
    useLayout.setState({ dir: -1 })
    useView.setState({ timeCenter: start })
    render(<ControlBar />)
    fireEvent.click(byName(/^Forward 30 minutes/)) // step up the screen
    expect(useView.getState().timeCenter).toBe(start + 30 * MINUTE)
  })

  it('sends the up arrow to the previous instant (future down) or the next one (future up)', () => {
    const id = entities.createInstant(engine.getFrame().now - 3 * 60 * MINUTE, 'Early')
    const { unmount } = render(<ControlBar />)
    fireEvent.click(byName(/^Previous instant/))
    expect(useView.getState()).toMatchObject({ viewFocusMode: 'instant', focusedInstantId: id })
    unmount()
    useLayout.setState({ dir: -1 })
    useView.setState(initialViewState())
    useView.setState({ viewFocusMode: 'cursor', timeCenter: engine.getFrame().now - 60 * MINUTE })
    render(<ControlBar />)
    fireEvent.click(byName(/^Next instant/)) // now the up arrow; the next instant from here is Now
    expect(useView.getState().viewFocusMode).toBe('now')
  })

  it('keeps the step menu on both step buttons', () => {
    render(<ControlBar />)
    expect(screen.getAllByRole('button', { name: 'Choose step' })).toHaveLength(2)
  })
})

describe('the horizontal bar', () => {
  it('keeps its single row: previous, step back, NOW, step forward, next with left/right arrows', () => {
    render(<ControlBar />)
    expect(screen.getByRole('navigation').className).not.toContain('controls--vertical')
    const names = screen.getAllByRole('button').map(b => b.getAttribute('aria-label'))
    expect(names[0]).toMatch(/^Zoom out/)
    expect(names[1]).toMatch(/^Previous instant/)
    expect(names[2]).toMatch(/^Back 30 minutes/)
    expect(byName(/^Previous instant/).dataset.nav).toBeUndefined()
    expect(byName(/^Back 30 minutes/)).toHaveTextContent('−30 minutes')
  })
})

describe('Stopwatch and Timer buttons', () => {
  it('the stopwatch button starts, turns into Lap / Stop, then Reset', () => {
    render(<ControlBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Start a stopwatch' }))
    expect(useEntities.getState().instants).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Lap' }))
    expect(useEntities.getState().instants).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Stop the stopwatch' }))
    expect(useEntities.getState().instants).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Reset the stopwatch' }))
    expect(screen.getByRole('button', { name: 'Start a stopwatch' })).toBeTruthy()
    expect(useEntities.getState().instants).toHaveLength(3)
  })

  it('the timer button asks for a length: a preset starts it', () => {
    render(<ControlBar />)
    fireEvent.click(screen.getByRole('button', { name: /Start a timer/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: '10m' }))
    const end = useEntities.getState().instants.find(i => i.alarm)!
    expect(end.label).toBe('10m timer')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('a typed length starts it; a bad one is flagged and starts nothing', () => {
    render(<ControlBar />)
    fireEvent.click(screen.getByRole('button', { name: /Start a timer/ }))
    const input = screen.getByRole('textbox', { name: 'Custom timer length' })
    fireEvent.change(input, { target: { value: 'soon' } })
    fireEvent.submit(input)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(useEntities.getState().instants).toHaveLength(0)
    fireEvent.change(input, { target: { value: '13' } })
    fireEvent.submit(input)
    expect(useEntities.getState().instants.find(i => i.alarm)?.label).toBe('13m timer')
  })

  it('offers recent lengths first', () => {
    useQuick.setState({ recentTimers: [13 * MINUTE] })
    render(<ControlBar />)
    fireEvent.click(screen.getByRole('button', { name: /Start a timer/ }))
    expect(screen.getAllByRole('menuitem')[0].textContent).toBe('13m')
  })

  it('NOW / ＋ shows the time under it', () => {
    render(<ControlBar />)
    expect(screen.getByRole('button', { name: 'Drop an instant at Now' }).querySelector('.ctl-btn__sub')).toBeTruthy()
  })
})
