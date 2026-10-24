import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TimeEntry } from './TimeEntryPopover.tsx'
import { DAY, HOUR, MINUTE } from '../../domain/time.ts'

/** The hh:mm:ss box (an offset also has a days box). */
const field = () => screen.getByRole('textbox', { name: /hh:mm:ss/ })
const shown = () => [...document.querySelectorAll('.time-digits__num')].map(n => n.textContent).join(':')

describe('TimeEntry', () => {
  it('is an hh:mm:ss box (with a days box for an offset) showing the starting value until you type', () => {
    render(<TimeEntry title="t" offset={{ initialMs: 2 * DAY + HOUR + 5 * MINUTE, from: 'Now', onSubmit: () => {} }} onCancel={() => {}} />)
    expect(shown()).toBe('01:05:00')
    expect(screen.getByRole('textbox', { name: 'Days' })).toHaveValue('2')
    expect([...document.querySelectorAll('.time-digits__unit')].map(n => n.textContent)).toEqual(['d', 'h', 'm', 's'])
  })

  it('an offset reaches days, months or years away (no hours cap)', () => {
    const onSubmit = vi.fn()
    render(<TimeEntry title="t" offset={{ initialMs: 0, from: 'Now', onSubmit }} onCancel={() => {}} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Days' }), { target: { value: '200' } })
    fireEvent.change(field(), { target: { value: '130' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith(200 * DAY + HOUR + 30 * MINUTE)
  })

  it('a clock time has a date: another day, month or year', () => {
    const onSubmit = vi.fn()
    render(<TimeEntry title="t" clock={{ initialTs: new Date(2026, 9, 19, 8, 0).getTime(), onSubmit }} onCancel={() => {}} />)
    const date = screen.getByLabelText('Date')
    expect(date).toHaveValue('2026-10-19')
    fireEvent.change(date, { target: { value: '2027-04-03' } })
    fireEvent.change(field(), { target: { value: '930' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith({ h: 9, m: 30, s: 0 }, new Date(2027, 3, 3, 12).getTime())
  })

  it('fills from the right as digits are typed', () => {
    const onSubmit = vi.fn()
    render(<TimeEntry title="t" offset={{ initialMs: 0, from: 'Now', onSubmit }} onCancel={() => {}} />)
    fireEvent.change(field(), { target: { value: '1' } })
    expect(shown()).toBe('00:01:00')
    fireEvent.change(field(), { target: { value: '130' } })
    expect(shown()).toBe('01:30:00')
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith(HOUR + 30 * MINUTE)
  })

  it('offsets can be before (−)', () => {
    const onSubmit = vi.fn()
    render(<TimeEntry title="t" offset={{ initialMs: 0, from: 'Now', onSubmit }} onCancel={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /After Now/ }))
    fireEvent.change(field(), { target: { value: '13' } })
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(onSubmit).toHaveBeenCalledWith(-13 * MINUTE)
  })

  it('clock times use AM/PM, take 24-hour input, and flag impossible ones', () => {
    const onSubmit = vi.fn()
    render(<TimeEntry title="t" clock={{ initialTs: new Date(2026, 0, 1, 8, 0).getTime(), onSubmit }} onCancel={() => {}} />)
    fireEvent.change(field(), { target: { value: '975' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(field().getAttribute('aria-invalid')).toBe('true')
    fireEvent.change(field(), { target: { value: '1730' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSubmit).toHaveBeenLastCalledWith({ h: 17, m: 30, s: 0 }, new Date(2026, 0, 1, 12).getTime())
    fireEvent.change(field(), { target: { value: '930' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toggle AM/PM' }))
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSubmit).toHaveBeenLastCalledWith({ h: 21, m: 30, s: 0 }, new Date(2026, 0, 1, 12).getTime())
  })

  it('switches between a time and an offset when given both', () => {
    const onClock = vi.fn()
    const onOffset = vi.fn()
    render(<TimeEntry title="t" clock={{ initialTs: Date.now(), onSubmit: onClock }} offset={{ initialMs: 0, from: 'Now', onSubmit: onOffset }} onCancel={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: 'From Now' }))
    fireEvent.change(field(), { target: { value: '5' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onOffset).toHaveBeenCalledWith(5 * MINUTE)
    expect(onClock).not.toHaveBeenCalled()
  })
})
