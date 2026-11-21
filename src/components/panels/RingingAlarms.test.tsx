import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RingingAlarms } from './RingingAlarms.tsx'
import { useAlarms } from '../../store/alarms.ts'

const chime = { instantId: 'i1', alarmId: 'a1', label: 'Tea', tsEpochMs: Date.now(), triggeredAt: Date.now() }

describe('RingingAlarms', () => {
  afterEach(() => useAlarms.setState({ ringing: [], chimes: [] }))

  it('shows a chime that sounded as a card with OK, which takes it away', () => {
    useAlarms.setState({ ringing: [], chimes: [chime] })
    render(<RingingAlarms />)
    expect(screen.getByRole('status', { name: 'Chime' })).toBeTruthy()
    expect(screen.queryByText('Silence')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(useAlarms.getState().chimes).toHaveLength(0)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
