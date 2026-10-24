import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act as rtlAct, fireEvent, render, screen } from '@testing-library/react'
import { AlarmButton } from './AlarmButton.tsx'
import { useEntities } from '../../store/entities.ts'
import { ui } from '../../store/ui.ts'
import { useSettings } from '../../store/settings.ts'

beforeEach(() => {
  useEntities.setState({ instants: [], spans: [], groups: [] })
  useSettings.setState({ alarmRings: { onTime: true, warnings: [], choices: [] } })
})
afterEach(() => rtlAct(() => ui.setAlarmMenu(false)))

describe('Alarm picker: a date for a one-off alarm', () => {
  it('rings at that time on the picked day, months away; Next goes back to today or tomorrow', () => {
    render(<AlarmButton />)
    rtlAct(() => ui.openAlarmEditor(null))
    fireEvent.change(screen.getByRole('textbox', { name: /^Time/ }), { target: { value: '7:30a' } })
    const date = screen.getByLabelText('Date (empty: today or tomorrow)')
    fireEvent.change(date, { target: { value: '2030-03-09' } })
    expect(screen.getByRole('button', { name: 'Set alarm · Sat, Mar 9, 2030 7:30a' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect((date as HTMLInputElement).value).toBe('')
    fireEvent.change(date, { target: { value: '2030-03-09' } })
    fireEvent.click(screen.getByRole('button', { name: /^Set alarm/ }))
    const [inst] = useEntities.getState().instants
    expect(inst.tsEpochMs).toBe(new Date(2030, 2, 9, 7, 30).getTime())
    expect(inst.alarms).toHaveLength(1)
  })

  it('says so when the picked day\'s time has passed, and has no date for a repeat', () => {
    render(<AlarmButton />)
    rtlAct(() => ui.openAlarmEditor(null))
    fireEvent.change(screen.getByRole('textbox', { name: /^Time/ }), { target: { value: '7:30a' } })
    fireEvent.change(screen.getByLabelText('Date (empty: today or tomorrow)'), { target: { value: '2020-01-01' } })
    expect(screen.getByText('That has passed: pick a later date or time')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Daily' }))
    expect(screen.queryByLabelText('Date (empty: today or tomorrow)')).toBeNull()
  })
})
