import { beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { LemonPrompt } from './LemonPrompt.tsx'
import { lemons, useLemons } from '../../store/lemons.ts'

beforeEach(() => useLemons.setState({ log: [], asking: null }))

describe('LemonPrompt', () => {
  it('asks with what you wrote; Yes or No is kept, × keeps nothing', () => {
    render(<LemonPrompt />)
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => lemons.ask({ text: 'Rice', kind: 'name' }))
    expect(screen.getByRole('dialog', { name: 'Are you a sour lemon?' })).toBeTruthy()
    expect(screen.getByText('after “Rice”')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'No 😊' }))
    expect(useLemons.getState().log.map(e => e.sour)).toEqual([false])
    act(() => lemons.ask({ text: 'Tea', kind: 'name' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close without answering' }))
    expect(useLemons.getState().log).toHaveLength(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
