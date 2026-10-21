import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RepeatsList } from './AlarmsList.tsx'
import { settings, useSettings } from '../../store/settings.ts'
import { useEntities } from '../../store/entities.ts'
import { ui } from '../../store/ui.ts'

afterEach(() => { settings.setSkyLocation(null); useSettings.setState({ sunEvents: ['sunrise', 'sunset'], groupVisibility: {} }); ui.setGroupOpen(null) })

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

describe('Groups tab: zoom strips', () => {
  const withSun = () => {
    useEntities.setState({ instants: [{ id: 'a', tsEpochMs: 0, label: '' }], spans: [], groups: [] })
    settings.setSkyLocation({ lat: 37.77, lon: -122.42, name: 'San Francisco' })
    render(<RepeatsList />)
  }

  it('no Unnamed row (unnamed instants go by their reach); a row\'s adjust button opens a strip whose handles move by stops', () => {
    withSun()
    expect(screen.queryByText(/Unnamed/)).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Visibility of sunrise and sunset' })[0])
    const label = screen.getByRole('slider', { name: 'Label up to' })
    expect(label).toHaveAttribute('aria-valuetext', '3 days')
    fireEvent.keyDown(label, { key: 'ArrowLeft' })
    expect(useSettings.getState().groupVisibility.sun).toEqual({ label: 'day', mark: 'week' })
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Mark up to' }), { key: 'ArrowRight' })
    expect(useSettings.getState().groupVisibility.sun).toEqual({ label: 'day', mark: 'month' })
  })

  it('a tap on the track moves the nearer handle there', () => {
    withSun()
    fireEvent.click(screen.getAllByRole('button', { name: 'Visibility of sunrise and sunset' })[0])
    const track = document.querySelector('.zoom-strip__track') as HTMLElement
    // jsdom has no layout: an 800px track from x=0, so the 11 stops sit 80px apart.
    track.getBoundingClientRect = () => ({ left: 0, width: 800, top: 0, right: 800, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.click(track, { clientX: 100 }) // 6h: nearer "Label up to 3 days", so that handle moves
    expect(useSettings.getState().groupVisibility.sun).toEqual({ label: '6h', mark: 'week' })
    fireEvent.click(track, { clientX: 720 }) // 100y: nearer the Mark handle (at a week)
    expect(useSettings.getState().groupVisibility.sun).toEqual({ label: '6h', mark: 'century' })
  })
})
