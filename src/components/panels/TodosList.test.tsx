import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { TodosList } from './TodosList.tsx'
import { RingingAlarms } from './RingingAlarms.tsx'
import { entities, useEntities } from '../../store/entities.ts'
import { useAlarms } from '../../store/alarms.ts'
import { initialViewState, useView } from '../../store/view.ts'
import { MINUTE } from '../../domain/time.ts'
import { useUi } from '../../store/ui.ts'
import { getTunables } from '../../store/settings.ts'
import * as actions from '../../store/actions.ts'

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
    expect(screen.getByRole('button', { name: 'Schedule and more' })).toBeTruthy()
  })

  it('shows what it read as you type, its duration with a stopwatch', () => {
    const { container } = render(<TodosList />)
    fireEvent.change(screen.getByRole('textbox', { name: /Add a todo/ }), { target: { value: 'laundry 20m' } })
    expect(container.querySelector('.todo-add__read')!.textContent).toBe('laundry · 20m')
    expect(screen.getByLabelText('takes 20m').querySelector('svg')).toBeTruthy()
  })

  it("a row's box does it (after its charge), and a done one's box opens it again", () => {
    vi.useFakeTimers()
    useEntities.setState({ todos: [{ id: 't1', label: 'Dishes', createdAt: 0, status: 'open', order: 0 }] })
    render(<TodosList />)
    fireEvent.click(screen.getByRole('button', { name: 'Done: Dishes' }))
    expect(entities.getTodo('t1')!.status).toBe('open')
    act(() => { vi.advanceTimersByTime(getTunables().doneChargeMs) })
    vi.useRealTimers()
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

  it('its stopwatch button opens one panel: Schedule on top, a box that says what it does, then its duration', () => {
    useEntities.setState({ todos: [{ id: 't1', label: 'Dishes', createdAt: 0, status: 'open', order: 0 }] })
    render(<TodosList />)
    fireEvent.click(screen.getByRole('button', { name: 'Schedule and more' }))
    expect(screen.getByRole('button', { name: /In 1h/ })).toBeTruthy()
    const box = screen.getByRole('textbox', { name: 'Schedule' })
    fireEvent.change(box, { target: { value: '11:58pm' } })
    expect(screen.getByRole('textbox', { name: 'Schedule at' })).toBeTruthy()
    fireEvent.change(box, { target: { value: '20' } })
    expect(screen.getByRole('textbox', { name: 'Schedule in' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Schedule: / }))
    const at = useEntities.getState().instants.find(i => i.todo?.id === 't1')!
    expect(Math.abs(at.tsEpochMs - (Date.now() + 20 * MINUTE))).toBeLessThan(5000)
    // Scheduled, the same button moves it, and its panel can unschedule it.
    fireEvent.click(screen.getByRole('button', { name: 'Move and more' }))
    expect(screen.getByRole('textbox', { name: 'Move' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Unschedule' }))
    expect(useEntities.getState().instants.some(i => i.todo?.id === 't1' && i.todo.role === 'at')).toBe(false)
  })

  it('its panel sets a duration from a short list, or none', () => {
    useEntities.setState({ todos: [{ id: 't1', label: 'Dishes', createdAt: 0, status: 'open', order: 0 }] })
    render(<TodosList />)
    fireEvent.click(screen.getByRole('button', { name: 'Schedule and more' }))
    expect(screen.getByRole('textbox', { name: 'Takes' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '30m' }))
    expect(entities.getTodo('t1')!.durationMs).toBe(30 * MINUTE)
    expect(screen.getByLabelText('takes 30m')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Schedule and more' }))
    expect(screen.getByRole('button', { name: '30m' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'No duration' }))
    expect(entities.getTodo('t1')!.durationMs).toBeUndefined()
  })
})

describe('a plain alarm ringing', () => {
  it('has no Todo on its card (that is in the bell\'s tools, before it rings), and one Snooze row', () => {
    const now = Date.now()
    useEntities.setState({ instants: [{ id: 'i1', tsEpochMs: now - MINUTE, label: 'Trash out', alarms: [{ id: 'a1', offsetMs: 0 }] }] })
    useAlarms.setState({ ringing: [{ instantId: 'i1', alarmId: 'a1', label: 'Trash out', tsEpochMs: now - MINUTE, triggeredAt: now }] })
    render(<RingingAlarms />)
    expect(screen.queryByRole('button', { name: /todo/i })).toBeNull()
    expect(screen.getByRole('button', { name: /Snooze 5m/ })).toBeTruthy()
    // The box says what it does, and its submit is where it lands.
    const box = screen.getByRole('textbox', { name: 'Snooze for' })
    fireEvent.change(box, { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /^Snooze until/ }))
    expect(useAlarms.getState().ringing).toEqual([])
    const snoozed = entities.getInstant('i1')!.alarms!.find(a => a.snoozeOf)!
    expect(now - MINUTE - snoozed.offsetMs).toBeGreaterThan(now + 19 * MINUTE)
  })
})

describe('a todo ringing', () => {
  it('asks ▶ Start or Done, then Snooze (5m, or for / until what you type), then Ignore, Unschedule or Won\'t do', () => {
    const now = Date.now()
    useEntities.setState({
      todos: [{ id: 't1', label: 'Feed cats', createdAt: 0, status: 'open', order: 0 }],
      instants: [{ id: 'i1', tsEpochMs: now - MINUTE, label: 'Feed cats', todo: { id: 't1', role: 'at' }, alarms: [{ id: 'a1', offsetMs: 0 }] }],
    })
    useAlarms.setState({ ringing: [{ instantId: 'i1', alarmId: 'a1', label: 'Feed cats', tsEpochMs: now - MINUTE, triggeredAt: now }] })
    render(<RingingAlarms />)
    for (const name of [/^Start$/, /Done/, /Snooze 5m/, /^Ignore$/, /^Unschedule$/, /Won't do/]) expect(screen.getByRole('button', { name })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Move/ })).toBeNull()
    // A time reads "until"; the todo moves there.
    const box = screen.getByRole('textbox', { name: 'Snooze for' })
    fireEvent.change(box, { target: { value: '11:59pm' } })
    expect(screen.getByRole('textbox', { name: 'Snooze until' })).toBeTruthy()
    // The panel's mute (sound off, cards kept) is a small 🔇 by its title.
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }))
    expect(useAlarms.getState().muted).toBe(true)
    expect(screen.getByRole('button', { name: /Muted/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Start$/ }))
    expect(entities.getInstant('i1')!.favorite).toBe(true)
    expect(useAlarms.getState().ringing).toEqual([])
  })

  it('a todo chime shows the same card, without Ignore', () => {
    const now = Date.now()
    useEntities.setState({
      todos: [{ id: 't1', label: 'Feed cats', createdAt: 0, status: 'open', order: 0 }],
      instants: [{ id: 'i1', tsEpochMs: now - MINUTE, label: 'Feed cats', todo: { id: 't1', role: 'at' }, alarms: [{ id: 'a1', offsetMs: 0, answered: 'chimed' }] }],
    })
    useAlarms.setState({ chimes: [{ instantId: 'i1', alarmId: 'a1', label: 'Feed cats', tsEpochMs: now - MINUTE, triggeredAt: now }] })
    render(<RingingAlarms />)
    for (const name of [/^Start$/, /Done/, /Snooze 5m/, /Won't do/]) expect(screen.getByRole('button', { name })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Ignore$/ })).toBeNull()
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

describe('Start and finding a todo', () => {
  it('an open row has a green ▶ right of Schedule; a counting one has neither, nor Not a todo', () => {
    const now = Date.now()
    useEntities.setState({
      todos: [
        { id: 't1', label: 'Dishes', createdAt: 0, status: 'open', order: 0 },
        { id: 't2', label: 'Laundry', createdAt: 0, status: 'open', order: 0 },
      ],
      instants: [{ id: 'i2', tsEpochMs: now - MINUTE, label: 'Laundry', favorite: true, todo: { id: 't2', role: 'at' } }],
      spans: [{ id: 's2', startInstantId: 'i2', endInstantId: '__NOW__', label: '', visible: true, endIsNow: true }],
    })
    render(<TodosList />)
    const tools = screen.getByRole('button', { name: 'Start: Dishes' }).parentElement!
    expect([...tools.children].map(c => c.getAttribute('aria-label') ?? c.textContent)).toEqual(['Start: Dishes', 'Schedule and more'])
    expect(screen.queryByRole('button', { name: 'Start: Laundry' })).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'More' })[0])
    expect(screen.queryByRole('button', { name: /Not a todo/ })).toBeNull()
  })

  it('findTodo opens the Todos tab and lights its row', () => {
    useEntities.setState({ todos: [{ id: 't1', label: 'Dishes', createdAt: 0, status: 'open', order: 0 }] })
    const { container } = render(<TodosList />)
    act(() => actions.findTodo('t1'))
    expect(useUi.getState().listTab).toBe('todos')
    expect(container.querySelector('.todo-row.is-found')).toBeTruthy()
  })
})
