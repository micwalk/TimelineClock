import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SavedInstantColumns } from './InstantColumns.tsx'
import type { SavedLayout } from './savedLayout.ts'
import { useSavedLayout } from './savedLayout.ts'
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
  return <SavedInstantColumns layout={useSavedLayout()} />
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
  it('show a name hint instead of "?", and tapping it opens the name box', () => {
    const t = twentyMinutesAgo()
    const id = entities.createInstant(t, '')
    render(<Columns />)
    expect(screen.queryByText('?')).toBeNull()
    expect(screen.getByText(formatClockCompact(t, false))).toBeInTheDocument()
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

  it('select on click, rename on double-clicking the name, focus on double-clicking the time', () => {
    const t = twentyMinutesAgo()
    const id = entities.createInstant(t, 'Tea')
    render(<Columns />)
    fireEvent.click(screen.getByText('Tea'))
    expect(useView.getState().currentSelectedInstantId).toBe(id)
    fireEvent.doubleClick(screen.getByText('Tea'))
    expect(useView.getState().editingInstantId).toBe(id)
    act(() => useView.setState({ editingInstantId: null }))
    fireEvent.doubleClick(screen.getByText(formatClockCompact(t, true)))
    expect(useView.getState()).toMatchObject({ viewFocusMode: 'instant', focusedInstantId: id })
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
  const chip = screen.getByText(name).closest('.tl-col__chip') as HTMLElement
  return chip.style.getPropertyValue('--row')
}

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
    render(<Columns />)
    const more = screen.getByRole('button', { name: /^3 more instants: .*Rice/ })
    expect(more).toHaveTextContent('+3')
    expect(screen.queryByText('Rice')).not.toBeInTheDocument()
    // Members keep their lines.
    expect(screen.getAllByRole('group', { name: /^Instant / })).toHaveLength(3)
    const before = useView.getState().timeWidth
    fireEvent.click(more)
    expect(useView.getState().viewFocusMode).toBe('cursor')
    expect(useView.getState().timeWidth).toBeLessThan(before)
  })

  it('folds a snooze into its original as a ⟲N badge, keeping its line', () => {
    const t = twentyMinutesAgo()
    const orig = entities.createInstant(t, 'Wake', { alarm: true })
    entities.createInstant(t + 1000, 'Snooze 1: Wake', { alarm: true, snoozeOriginalId: orig })
    render(<Columns />)
    expect(screen.getAllByRole('group', { name: /^Instant / })).toHaveLength(2)
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
  it('start at chipStart plus the layout cross offset', () => {
    useLayout.setState({ orientation: 'vertical' })
    const id = entities.createInstant(twentyMinutesAgo(), 'Take Meds')
    const layout: SavedLayout = { visibleIds: [id], rows: { [id]: 1 }, crossOffsets: { [id]: 40 }, folded: {}, foldCount: {}, clusters: [], rowsUsed: 2 }
    const { container } = render(<SavedInstantColumns layout={layout} />)
    const chip = container.querySelector('.tl-col__chip') as HTMLElement
    expect(chip.style.left).toBe('172px')
  })
})

describe('layering', () => {
  it("puts a saved instant's line in a lines-layer element that never contains its chip", () => {
    entities.createInstant(twentyMinutesAgo(), 'Rice')
    const { container } = render(<Columns />)
    const line = container.querySelector('.tl-col--line') as HTMLElement
    const label = screen.getByRole('group', { name: 'Instant Rice' })
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
