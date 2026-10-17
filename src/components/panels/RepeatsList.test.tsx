import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RepeatsList } from './AlarmsList.tsx'
import { settings, useSettings } from '../../store/settings.ts'
import { useEntities } from '../../store/entities.ts'

afterEach(() => { settings.setSkyLocation(null); useSettings.setState({ sunEvents: ['sunrise', 'sunset'] }) })

describe('Repeats tab: sunrise and sunset', () => {
  it('lists both above the series, each with a switch that shows or hides it on the timeline', () => {
    useEntities.setState({ instants: [], spans: [], groups: [] })
    settings.setSkyLocation({ lat: 37.77, lon: -122.42, name: 'San Francisco' })
    render(<RepeatsList />)
    expect(screen.getAllByText(/Daily · San Francisco/)).toHaveLength(2)
    fireEvent.click(screen.getByRole('switch', { name: 'Hide sunset on the timeline' }))
    expect(useSettings.getState().sunEvents).toEqual(['sunrise'])
    expect(screen.getByRole('switch', { name: 'Show sunset on the timeline' })).toHaveAttribute('aria-checked', 'false')
  })

  it('without a location, says where to set one', () => {
    useEntities.setState({ instants: [], spans: [], groups: [] })
    render(<RepeatsList />)
    expect(screen.getByText(/Set your location in Settings › Sky/)).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
  })
})
