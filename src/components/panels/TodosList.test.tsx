import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TodosList } from './TodosList.tsx'
import { RingingAlarms } from './RingingAlarms.tsx'
import { entities, useEntities } from '../../store/entities.ts'
import { useAlarms } from '../../store/alarms.ts'
import { initialViewState, useView } from '../../store/view.ts'
import { MINUTE } from '../../domain/time.ts'

beforeEach(() => {
  useEntities.setState({ instants: [], spans: [], groups: [], todos: [] })
  useAlarms.setState({ ringing: [], chimes: [] })
  useView.setState(initialViewState())
})

describe('the Todos tab', () => {
  it('a name and Enter in the Add box makes an unscheduled todo', () => {
    render(<TodosList />)
    const box = screen.getByRole('textbox', { name: /Add a todo/ })
    fireEvent.change(box, { target: { value: 'Book appointment' } })
    fireEvent.submit(box)
    expect(useEntities.getState().todos).toMatchObject([{ label: 'Book appointment', status: 'open' }])
    expect(screen.getByText('Unscheduled')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeTruthy()
  })

  it('shows what it read as you type, its duration with a stopwatch', () => {
    const { container } = render(<TodosList />)
    fireEvent.change(screen.getByRole('textbox', { name: /Add a todo/ }), { target: { value: 'laundry 20m' } })
    expect(container.querySelector('.todo-add__read')!.textContent).toBe('laundry · 20m')
    expect(screen.getByLabelText('takes 20m').querySelector('svg')).toBeTruthy()
  })

  it("a row's box does it, and a done one's box opens it again", () => {
    useEntities.setState({ todos: [{ id: 't1', label: 'Dishes', createdAt: 0, status: 'open', order: 0 }] })
    render(<TodosList />)
    fireEvent.click(screen.getByRole('button', { name: 'Done: Dishes' }))
    expect(entities.getTodo('t1')!.status).toBe('done')
    expect(screen.getByText(/1 done today/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open Dishes again' }))
    expect(entities.getTodo('t1')!.status).toBe('open')
  })

  it('a tap on an unscheduled row opens Schedule (nothing to go to on the timeline)', () => {
    useEntities.setState({ todos: [{ id: 't1', label: 'Dishes', createdAt: 0, status: 'open', order: 0 }] })
    render(<TodosList />)
    fireEvent.click(screen.getByText('Dishes'))
    expect(screen.getByRole('button', { name: /In 1h/ })).toBeTruthy()
  })

  it('its ⋯ sets a duration from a short list, or none', () => {
    useEntities.setState({ todos: [{ id: 't1', label: 'Dishes', createdAt: 0, status: 'open', order: 0 }] })
    render(<TodosList />)
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByRole('textbox', { name: 'Duration' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '30m' }))
    expect(entities.getTodo('t1')!.durationMs).toBe(30 * MINUTE)
    expect(screen.getByLabelText('takes 30m')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByRole('button', { name: '30m' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'No duration' }))
    expect(entities.getTodo('t1')!.durationMs).toBeUndefined()
  })
})

describe('a plain alarm ringing', () => {
  it('offers ☐ Todo: it becomes a todo, and its card the todo card', () => {
    const now = Date.now()
    useEntities.setState({ instants: [{ id: 'i1', tsEpochMs: now - MINUTE, label: 'Trash out', alarms: [{ id: 'a1', offsetMs: 0 }] }] })
    useAlarms.setState({ ringing: [{ instantId: 'i1', alarmId: 'a1', label: 'Trash out', tsEpochMs: now - MINUTE, triggeredAt: now }] })
    render(<RingingAlarms />)
    expect(screen.queryByRole('button', { name: /Done/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Make it a todo' }))
    expect(useEntities.getState().todos).toMatchObject([{ label: 'Trash out', status: 'open' }])
    expect(screen.getByRole('button', { name: /Done/ })).toBeTruthy()
  })
})

describe('a todo ringing', () => {
  it('asks ▶ Start or Done, Snooze or Later, Silence or Won\'t do', () => {
    const now = Date.now()
    useEntities.setState({
      todos: [{ id: 't1', label: 'Feed cats', createdAt: 0, status: 'open', order: 0 }],
      instants: [{ id: 'i1', tsEpochMs: now - MINUTE, label: 'Feed cats', todo: { id: 't1', role: 'at' }, alarms: [{ id: 'a1', offsetMs: 0 }] }],
    })
    useAlarms.setState({ ringing: [{ instantId: 'i1', alarmId: 'a1', label: 'Feed cats', tsEpochMs: now - MINUTE, triggeredAt: now }] })
    render(<RingingAlarms />)
    for (const name of [/^Start$/, /Done/, /Snooze 5m/, /Later/, /Silence/, /Won't do/]) expect(screen.getByRole('button', { name })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Silence/ })).toHaveLength(1)
    // The panel's mute (sound off, cards kept) is a small 🔇 by its title.
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }))
    expect(useAlarms.getState().muted).toBe(true)
    expect(screen.getByRole('button', { name: /Muted/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Later/ }))
    expect(screen.getByRole('button', { name: 'Back to the list' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Start$/ }))
    expect(entities.getInstant('i1')!.favorite).toBe(true)
    expect(useAlarms.getState().ringing).toEqual([])
  })

  it('a todo chime shows the same card, without Silence', () => {
    const now = Date.now()
    useEntities.setState({
      todos: [{ id: 't1', label: 'Feed cats', createdAt: 0, status: 'open', order: 0 }],
      instants: [{ id: 'i1', tsEpochMs: now - MINUTE, label: 'Feed cats', todo: { id: 't1', role: 'at' }, alarms: [{ id: 'a1', offsetMs: 0, answered: 'chimed' }] }],
    })
    useAlarms.setState({ chimes: [{ instantId: 'i1', alarmId: 'a1', label: 'Feed cats', tsEpochMs: now - MINUTE, triggeredAt: now }] })
    render(<RingingAlarms />)
    for (const name of [/^Start$/, /Done/, /Snooze 5m/, /Later/, /Won't do/]) expect(screen.getByRole('button', { name })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Silence/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Snooze 5m/ }))
    expect(useAlarms.getState().chimes).toEqual([])
    expect(entities.getInstant('i1')!.tsEpochMs).toBeGreaterThan(now + 4 * MINUTE)
  })

  it("a waiting row's ▶ Start counts from now", () => {
    const now = Date.now()
    useEntities.setState({
      todos: [{ id: 't1', label: 'Feed cats', createdAt: 0, status: 'open', order: 0 }],
      instants: [{ id: 'i1', tsEpochMs: now - 20 * MINUTE, label: 'Feed cats', todo: { id: 't1', role: 'at' }, alarms: [{ id: 'a1', offsetMs: 0, answered: 'dismissed' }] }],
    })
    render(<TodosList />)
    fireEvent.click(screen.getByRole('button', { name: 'Start: Feed cats' }))
    expect(useEntities.getState().instants.find(i => i.todo?.role === 'start')).toMatchObject({ favorite: true })
  })
})

describe('a todo warning ringing', () => {
  it('says get ready, and asks Start now or OK', () => {
    const now = Date.now()
    useEntities.setState({
      todos: [{ id: 't1', label: 'Laundry', createdAt: 0, status: 'open', order: 0 }],
      instants: [{ id: 'i1', tsEpochMs: now + 10 * MINUTE, label: 'Laundry', todo: { id: 't1', role: 'at' }, alarms: [{ id: 'w', offsetMs: 10 * MINUTE }, { id: 'a1', offsetMs: 0 }] }],
    })
    useAlarms.setState({ ringing: [{ instantId: 'i1', alarmId: 'w', label: 'Laundry in 10m', tsEpochMs: now + 10 * MINUTE, triggeredAt: now }] })
    render(<RingingAlarms />)
    expect(screen.getByText(/get ready/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /^OK$/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Start now/ }))
    expect(entities.getInstant('i1')!.favorite).toBe(true)
  })
})
