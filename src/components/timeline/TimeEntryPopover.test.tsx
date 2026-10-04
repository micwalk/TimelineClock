import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TimeEntry } from './TimeEntryPopover.tsx'
import { HOUR, MINUTE } from '../../domain/time.ts'

const field = () => screen.getByRole('textbox')
const shown = () => [...document.querySelectorAll('.time-digits__num')].map(n => n.textContent).join(':')

describe('TimeEntry', () => {
  it('is one hh:mm:ss box showing the starting value until you type', () => {
    render(<TimeEntry title="t" offset={{ initialMs: HOUR + 5 * MINUTE, from: 'Now', onSubmit: () => {} }} onCancel={() => {}} />)
    expect(shown()).toBe('01:05:00')
    expect([...document.querySelectorAll('.time-digits__unit')].map(n => n.textContent)).toEqual(['h', 'm', 's'])
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
    expect(onSubmit).toHaveBeenLastCalledWith({ h: 17, m: 30, s: 0 })
    fireEvent.change(field(), { target: { value: '930' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toggle AM/PM' }))
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSubmit).toHaveBeenLastCalledWith({ h: 21, m: 30, s: 0 })
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
