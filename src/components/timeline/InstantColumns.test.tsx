import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SavedInstantColumns } from './InstantColumns.tsx'
import { engine } from '../../engine/viewportEngine.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { initialViewState, useView } from '../../store/view.ts'
import { useAlarms } from '../../store/alarms.ts'
import { formatClockCompact } from '../../domain/format.ts'
import { MINUTE } from '../../domain/time.ts'

beforeEach(() => {
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
    render(<SavedInstantColumns />)
    expect(screen.getByText('Take Meds')).toBeInTheDocument()
    expect(screen.getByText(formatClockCompact(t, false))).toBeInTheDocument()
  })

  it('show seconds when selected', () => {
    const t = twentyMinutesAgo()
    const id = entities.createInstant(t, 'Take Meds')
    useView.setState({ currentSelectedInstantId: id })
    render(<SavedInstantColumns />)
    expect(screen.getByText(formatClockCompact(t, true))).toBeInTheDocument()
  })

  it('show time since on favorites, and the star unfavorites', () => {
    const id = entities.createInstant(twentyMinutesAgo(), 'Rice', { favorite: true })
    render(<SavedInstantColumns />)
    expect(screen.getByText('· 20m ago')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Unfavorite' }))
    expect(entities.getInstant(id)?.favorite).toBe(false)
  })

  it('select on click, rename on double-clicking the name, focus on double-clicking the time', () => {
    const t = twentyMinutesAgo()
    const id = entities.createInstant(t, 'Tea')
    render(<SavedInstantColumns />)
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
    render(<SavedInstantColumns />)
    expect(screen.getByRole('button', { name: 'Favorite' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete instant' }))
    expect(entities.getInstant(id)).toBeUndefined()
  })

  it('shorten snooze names', () => {
    entities.createInstant(twentyMinutesAgo(), 'Snooze 2: Test Alarm')
    render(<SavedInstantColumns />)
    expect(screen.getByText('Test Alarm ⟲2')).toBeInTheDocument()
  })

  it('keep a long name whole in the title', () => {
    const long = 'Take the lasagna out of the oven and let it rest for ten minutes before cutting'
    entities.createInstant(twentyMinutesAgo(), long)
    render(<SavedInstantColumns />)
    const main = screen.getByText(long).closest('button')!
    expect(main.getAttribute('title')).toContain(long)
    expect(screen.getByText(long)).toHaveClass('chip__name')
  })
})
