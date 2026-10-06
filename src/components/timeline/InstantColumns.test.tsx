import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SavedInstantColumns } from './InstantColumns.tsx'
import { savedLayoutAt, useSavedLayoutSource } from './savedLayout.ts'
import { useLayout } from '../../store/layout.ts'
import { useSettings } from '../../store/settings.ts'
import { engine } from '../../engine/viewportEngine.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { initialViewState, useView } from '../../store/view.ts'
import { ui } from '../../store/ui.ts'
import { useAlarms } from '../../store/alarms.ts'
import { formatClockCompact } from '../../domain/format.ts'
import { MINUTE } from '../../domain/time.ts'

function Columns() {
  useSavedLayoutSource()
  return <SavedInstantColumns />
}

beforeEach(() => {
  useSettings.setState({ tunables: {} })
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [] })
  useView.setState(initialViewState())
  useAlarms.setState({ ringing: [] })
  useLayout.setState({ orientation: 'horizontal', dir: 1 })
})

// The last rendered frame is what components draw from; anchor times to it.
const twentyMinutesAgo = () => engine.getFrame().now - 20 * MINUTE

describe('unnamed saved chips', () => {
  it('show just their time; once selected, a name hint that opens the name box', () => {
    const t = twentyMinutesAgo()
    const id = entities.createInstant(t, '')
    render(<Columns />)
    expect(screen.queryByText('?')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Name this instant' })).toBeNull()
    fireEvent.click(screen.getByText(formatClockCompact(t, false)))
    fireEvent.click(screen.getByRole('button', { name: 'Name this instant' }))
    expect(useView.getState().editingInstantId).toBe(id)
  })

  it('still select when the time is tapped', () => {
    const t = twentyMinutesAgo()
    const id = entities.createInstant(t, '')
    render(<Columns />)
    fireEvent.click(screen.getByText(formatClockCompact(t, false)))
    expect(useView.getState().currentSelectedInstantId).toBe(id)
  })

  it('pulse once when freshly dropped', () => {
    const id = entities.createInstant(twentyMinutesAgo(), '')
    const { container } = render(<Columns />)
    expect(container.querySelector('.is-dropped')).toBeNull()
    act(() => ui.markDropped(id))
    expect(container.querySelector('.tl-col--label.is-dropped')).not.toBeNull()
  })
})

describe('saved instant chips', () => {
  it('show the name and a compact time in one chip', () => {
    const t = twentyMinutesAgo()
    entities.createInstant(t, 'Take Meds')
    render(<Columns />)
    expect(screen.getByText('Take Meds')).toBeInTheDocument()
    expect(screen.getByText(formatClockCompact(t, false))).toBeInTheDocument()
  })

  it('show seconds when selected', () => {
    const t = twentyMinutesAgo()
    const id = entities.createInstant(t, 'Take Meds')
    useView.setState({ currentSelectedInstantId: id })
    render(<Columns />)
    expect(screen.getByText(formatClockCompact(t, true))).toBeInTheDocument()
  })

  it('show time since on favorites, and the star unfavorites', () => {
    const id = entities.createInstant(twentyMinutesAgo(), 'Rice', { favorite: true })
    render(<Columns />)
    expect(screen.getByText('· 20m ago')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Unfavorite' }))
    expect(entities.getInstant(id)?.favorite).toBe(false)
  })

  it('show time since when selected, but not when focused (the Cursor tag carries it)', () => {
    const id = entities.createInstant(twentyMinutesAgo(), 'Rice')
    useView.setState({ currentSelectedInstantId: id })
    render(<Columns />)
    expect(screen.getByText('· 20m ago')).toBeInTheDocument()
    act(() => useView.setState({ viewFocusMode: 'instant', focusedInstantId: id }))
    expect(screen.queryByText('· 20m ago')).toBeNull()
  })

  it('select on click; a double-click focuses, the next one renames', () => {
    const t = twentyMinutesAgo()
    const id = entities.createInstant(t, 'Tea')
    render(<Columns />)
    fireEvent.click(screen.getByText('Tea'))
    expect(useView.getState().currentSelectedInstantId).toBe(id)
    // A double-click: two clicks, then dblclick.
    const doubleClick = (el: HTMLElement) => { fireEvent.click(el, { detail: 1 }); fireEvent.click(el, { detail: 2 }); fireEvent.doubleClick(el) }
    doubleClick(screen.getByText(formatClockCompact(t, true)))
    expect(useView.getState()).toMatchObject({ viewFocusMode: 'instant', focusedInstantId: id, editingInstantId: null })
    doubleClick(screen.getByText('Tea'))
    expect(useView.getState().editingInstantId).toBe(id)
  })

  it('offer tools when selected, including delete', () => {
    const id = entities.createInstant(twentyMinutesAgo(), 'Tea')
    useView.setState({ currentSelectedInstantId: id })
    render(<Columns />)
    expect(screen.getByRole('button', { name: 'Favorite' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete instant' }))
    expect(entities.getInstant(id)).toBeUndefined()
  })

  it('shorten snooze names', () => {
    entities.createInstant(twentyMinutesAgo(), 'Snooze 2: Test Alarm')
    render(<Columns />)
    expect(screen.getByText('Test Alarm ⟲2')).toBeInTheDocument()
  })

  it('keep a long name whole in the title', () => {
    const long = 'Take the lasagna out of the oven and let it rest for ten minutes before cutting'
    entities.createInstant(twentyMinutesAgo(), long)
    render(<Columns />)
    const main = screen.getByText(long).closest('button')!
    expect(main.getAttribute('title')).toContain(long)
    expect(screen.getByText(long)).toHaveClass('chip__name')
  })
})

const rowOf = (name: string) => {
  const id = useEntities.getState().instants.find(i => i.label === name)!.id
  return String(savedLayoutAt(engine.getFrame()).rows[id])
}
/** The saved instants' lines (one per instant on screen, whatever happens to its chip). */
const lines = (container: HTMLElement) => container.querySelectorAll('.tl-world .tl-col--line')

describe('overlap layout', () => {
  it('stacks chips that would overlap into rows', () => {
    const t = twentyMinutesAgo()
    entities.createInstant(t, 'Rice')
    entities.createInstant(t + 1000, 'Beans')
    render(<Columns />)
    expect([rowOf('Rice'), rowOf('Beans')].sort()).toEqual(['0', '1'])
  })

  it('collapses overflow into a +N chip that zooms in when tapped', () => {
    useSettings.setState({ tunables: { chipRowsMax: 1 } })
    const t = twentyMinutesAgo()
    entities.createInstant(t, 'Rice')
    entities.createInstant(t + 1000, 'Beans')
    entities.createInstant(t + 2000, 'Corn')
    const { container } = render(<Columns />)
    const more = screen.getByRole('button', { name: /^3 more instants: .*Rice/ })
    expect(more).toHaveTextContent('+3')
    expect(screen.queryByText('Rice')).not.toBeInTheDocument()
    // Members keep their lines.
    expect(lines(container)).toHaveLength(3)
    const before = useView.getState().timeWidth
    fireEvent.click(more)
    expect(useView.getState().viewFocusMode).toBe('cursor')
    expect(useView.getState().timeWidth).toBeLessThan(before)
  })

  it('folds a snooze into its original as a ⟲N badge, keeping its line', () => {
    const t = twentyMinutesAgo()
    const orig = entities.createInstant(t, 'Wake', { alarm: true })
    entities.createInstant(t + 1000, 'Snooze 1: Wake', { alarm: true, snoozeOriginalId: orig })
    const { container } = render(<Columns />)
    expect(lines(container)).toHaveLength(2)
    expect(screen.queryByText('Wake ⟲1')).not.toBeInTheDocument()
    const badge = screen.getByRole('button', { name: /1 snooze/ })
    expect(badge).toHaveTextContent('⟲1')
    const before = useView.getState().timeWidth
    fireEvent.click(badge)
    expect(useView.getState().viewFocusMode).toBe('cursor')
    expect(useView.getState().timeWidth).toBeLessThan(before)
  })
})

describe('vertical chips', () => {
  it('start at chipStart, moved across by the layout cross offset', () => {
    useLayout.setState({ orientation: 'vertical' })
    entities.createInstant(twentyMinutesAgo(), 'Take Meds')
    entities.createInstant(twentyMinutesAgo() + 1000, 'Rice')
    const { container } = render(<Columns />)
    const chips = [...container.querySelectorAll('.tl-col__chip')] as HTMLElement[]
    expect(chips.map(c => c.style.left)).toEqual(['152px', '152px'])
    // Side by side: the layout moves one of them right of column 0 (the label's transform carries it).
    const cross = Object.values(savedLayoutAt(engine.getFrame()).crossOffsets)
    expect(Math.min(...cross)).toBe(0)
    expect(Math.max(...cross)).toBeGreaterThan(0)
  })
})

describe('layering', () => {
  it("puts a saved instant's line in a lines-layer element that never contains its chip", () => {
    entities.createInstant(twentyMinutesAgo(), 'Rice')
    const { container } = render(<Columns />)
    const line = container.querySelector('.tl-col--line') as HTMLElement
    const label = screen.getByRole('group', { name: 'Instant Rice' })
    expect(line.closest('.tl-world')).not.toBeNull()
    expect(line.querySelector('.tl-col__line')).not.toBeNull()
    expect(line.contains(label)).toBe(false)
    expect(label.contains(line)).toBe(false)
    expect(label).toHaveClass('tl-col--label')
    expect(label.querySelector('.tl-col__chip')).not.toBeNull()
    expect(line.querySelector('.tl-col__chip')).toBeNull()
  })
})

describe('chip polish: renaming and vertical tools', () => {
  it('shows one box while renaming, with the time under it', () => {
    const t = twentyMinutesAgo()
    const id = entities.createInstant(t, 'Tea')
    useView.setState({ currentSelectedInstantId: id, editingInstantId: id })
    const { container } = render(<Columns />)
    const input = screen.getByRole('textbox', { name: 'Instant name' })
    expect(container.querySelectorAll('input')).toHaveLength(1)
    expect(input.closest('.glow-box')).toBe(input)
    expect(container.querySelector('.chip--editing')).not.toBeNull()
    expect(screen.getByText(formatClockCompact(t, true))).toHaveClass('chip__time')
  })

  it('puts a vertical selected chip\'s tools in the row below it', () => {
    const id = entities.createInstant(twentyMinutesAgo(), 'Tea')
    useView.setState({ currentSelectedInstantId: id })
    useLayout.setState({ orientation: 'vertical', dir: 1 })
    const { container } = render(<Columns />)
    const below = container.querySelector('.tl-col__below')
    expect(below).not.toBeNull()
    expect(below!.contains(screen.getByRole('button', { name: 'Delete instant' }))).toBe(true)
    expect(container.querySelector('.chip--saved')!.contains(below)).toBe(false)
  })

  it('keeps horizontal tools beside the chip', () => {
    const id = entities.createInstant(twentyMinutesAgo(), 'Tea')
    useView.setState({ currentSelectedInstantId: id })
    const { container } = render(<Columns />)
    expect(container.querySelector('.tl-col__below')).toBeNull()
    expect(container.querySelector('.tl-col__tools')).not.toBeNull()
  })
})
