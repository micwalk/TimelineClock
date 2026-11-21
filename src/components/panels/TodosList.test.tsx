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

  it('shows what it read as you type', () => {
    render(<TodosList />)
    fireEvent.change(screen.getByRole('textbox', { name: /Add a todo/ }), { target: { value: 'laundry 20m' } })
    expect(screen.getByText('laundry · takes 20m')).toBeTruthy()
  })

  it('✓ on a row does it', () => {
    useEntities.setState({ todos: [{ id: 't1', label: 'Dishes', createdAt: 0, status: 'open', order: 0 }] })
    render(<TodosList />)
    fireEvent.click(screen.getByRole('button', { name: 'Done: Dishes' }))
    expect(entities.getTodo('t1')!.status).toBe('done')
    expect(screen.getByText(/1 done today/)).toBeTruthy()
  })
})

describe('a todo ringing', () => {
  it('asks Done or Dismiss, Snooze or Later, and Won\'t do', () => {
    const now = Date.now()
    useEntities.setState({
      todos: [{ id: 't1', label: 'Feed cats', createdAt: 0, status: 'open', order: 0 }],
      instants: [{ id: 'i1', tsEpochMs: now - MINUTE, label: 'Feed cats', todo: { id: 't1', role: 'at' }, alarms: [{ id: 'a1', offsetMs: 0 }] }],
    })
    useAlarms.setState({ ringing: [{ instantId: 'i1', alarmId: 'a1', label: 'Feed cats', tsEpochMs: now - MINUTE, triggeredAt: now }] })
    render(<RingingAlarms />)
    for (const name of [/Done/, /^Dismiss$/, /Snooze 5m/, /Later/, /Won't do/]) expect(screen.getByRole('button', { name })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Later/ }))
    expect(screen.getByRole('button', { name: 'Back to the list' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Dismiss$/ }))
    expect(entities.getInstant('i1')!.favorite).toBe(true)
    expect(useAlarms.getState().ringing).toEqual([])
  })
})
