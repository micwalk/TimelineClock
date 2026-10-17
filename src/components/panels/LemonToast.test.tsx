import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LEMON_MS, ui, useUi } from '../../store/ui.ts'
import { LemonToast } from './LemonToast.tsx'

afterEach(() => { vi.useRealTimers(); useUi.setState({ lemonAt: 0 }) })

describe('LemonToast', () => {
  it('says "You bad lemon" after an add, then goes by itself', () => {
    vi.useFakeTimers()
    render(<LemonToast />)
    expect(screen.queryByRole('status')).toBeNull()
    act(() => ui.callLemon())
    expect(screen.getByRole('status')).toHaveTextContent('You bad lemon')
    act(() => { vi.advanceTimersByTime(LEMON_MS) })
    expect(screen.queryByRole('status')).toBeNull()
  })
})
