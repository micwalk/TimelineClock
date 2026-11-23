import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { InlineInput } from './InlineInput.tsx'

describe('InlineInput', () => {
  it('multiline: a box that wraps (a textarea), still one line of text: Enter commits, line breaks become spaces', () => {
    const onCommit = vi.fn()
    render(<InlineInput initial="Laundry" ariaLabel="Todo name" multiline onCommit={onCommit} onCancel={() => {}} />)
    const box = screen.getByRole('textbox', { name: 'Todo name' })
    expect(box.tagName).toBe('TEXTAREA')
    expect(box).toHaveClass('is-multiline')
    fireEvent.change(box, { target: { value: 'Fold the\nlaundry' } })
    expect(fireEvent.keyDown(box, { key: 'Enter' })).toBe(false) // no line break typed
    expect(onCommit).toHaveBeenCalledWith('Fold the laundry')
  })

  it('one line by default; Escape cancels', () => {
    const onCommit = vi.fn()
    const onCancel = vi.fn()
    render(<InlineInput initial="Tea" ariaLabel="Instant name" onCommit={onCommit} onCancel={onCancel} />)
    const box = screen.getByRole('textbox', { name: 'Instant name' })
    expect(box.tagName).toBe('INPUT')
    fireEvent.keyDown(box, { key: 'Escape' })
    fireEvent.blur(box)
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onCommit).not.toHaveBeenCalled()
  })
})
