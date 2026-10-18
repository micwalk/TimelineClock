import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RepeatsList } from './AlarmsList.tsx'
import { settings, useSettings } from '../../store/settings.ts'
import { useEntities } from '../../store/entities.ts'
import { ui } from '../../store/ui.ts'

afterEach(() => { settings.setSkyLocation(null); useSettings.setState({ sunEvents: ['sunrise', 'sunset'], groupDisplay: {} }); ui.setGroupOpen(null) })

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
  it('Unnamed is a row; its adjust button opens a strip whose handles move by stops', () => {
    useEntities.setState({ instants: [{ id: 'a', tsEpochMs: 0, label: '' }, { id: 'b', tsEpochMs: 1, label: 'Rice' }], spans: [], groups: [] })
    render(<RepeatsList />)
    expect(screen.getByText('○ Unnamed')).toBeTruthy()
    expect(screen.getByText('Chips up to a day, gathered beyond, never hidden')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'How unnamed instants shows by zoom' }))
    const chips = screen.getByRole('slider', { name: 'Chips up to' })
    expect(chips).toHaveAttribute('aria-valuetext', 'a day')
    fireEvent.keyDown(chips, { key: 'ArrowRight' })
    expect(useSettings.getState().groupDisplay.unnamed).toEqual({ full: '3d', mini: 'always' })
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Hidden past' }), { key: 'ArrowLeft' })
    expect(useSettings.getState().groupDisplay.unnamed).toEqual({ full: '3d', mini: 'decade' })
  })

  it('a tap on the track moves the nearer handle there', () => {
    useEntities.setState({ instants: [{ id: 'a', tsEpochMs: 0, label: '' }], spans: [], groups: [] })
    render(<RepeatsList />)
    fireEvent.click(screen.getByRole('button', { name: 'How unnamed instants shows by zoom' }))
    const track = document.querySelector('.zoom-strip__track') as HTMLElement
    // jsdom has no layout: an 800px track from x=0, so the 10 stops sit about 89px apart.
    track.getBoundingClientRect = () => ({ left: 0, width: 800, top: 0, right: 800, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.click(track, { clientX: 100 }) // 6h: closer in than "chips up to a day", so that handle moves
    expect(useSettings.getState().groupDisplay.unnamed).toEqual({ full: '6h', mini: 'always' })
    fireEvent.click(track, { clientX: 700 }) // 10y: nearer the hide handle (at ∞)
    expect(useSettings.getState().groupDisplay.unnamed).toEqual({ full: '6h', mini: 'decade' })
  })
})
