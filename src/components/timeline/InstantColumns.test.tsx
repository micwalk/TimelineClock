import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SavedInstantColumns } from './InstantColumns.tsx'
import { useSavedLayout } from './savedLayout.ts'
import { useSettings } from '../../store/settings.ts'
import { engine } from '../../engine/viewportEngine.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { initialViewState, useView } from '../../store/view.ts'
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
})

// The last rendered frame is what components draw from; anchor times to it.
const twentyMinutesAgo = () => engine.getFrame().now - 20 * MINUTE

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
