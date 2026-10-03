import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { HelpButton, HelpDialog } from './Help.tsx'
import { useUi } from '../../store/ui.ts'
import { useHotkeys } from '../../hooks/useHotkeys.ts'

beforeEach(() => useUi.setState({ helpOpen: false }))

describe('Help', () => {
  it('opens from the ? button and closes with the close button', () => {
    render(<><HelpButton /><HelpDialog /></>)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Help and about' }))
    expect(screen.getByRole('dialog', { name: 'Timeline Clock' })).toBeInTheDocument()
    expect(screen.getByText(/stored only in this browser/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'micwalk' })).toHaveAttribute('href', 'https://github.com/micwalk')
    fireEvent.click(screen.getByRole('button', { name: 'Close help' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens with ? and closes with Esc', () => {
    renderHook(() => useHotkeys())
    render(<HelpDialog />)
    act(() => { fireEvent.keyDown(window, { key: '?' }) })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
