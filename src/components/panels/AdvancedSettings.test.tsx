import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AdvancedSettings } from './AdvancedSettings.tsx'
import { getTunables, useSettings } from '../../store/settings.ts'
import { DEFAULT_TUNABLES, TUNABLE_DESCRIPTORS } from '../../domain/tunables.ts'

beforeEach(() => useSettings.setState({ tunables: {} }))

describe('AdvancedSettings', () => {
  it('lists every tunable with its current value', () => {
    render(<AdvancedSettings />)
    for (const d of TUNABLE_DESCRIPTORS) {
      expect(screen.getByLabelText(d.label)).toHaveValue(d.default)
    }
  })

  it('saves a typed value, clamped, and resets it', () => {
    render(<AdvancedSettings />)
    const rows = screen.getByLabelText('Chip rows (horizontal)')
    fireEvent.change(rows, { target: { value: '5' } })
    expect(getTunables().chipRowsMax).toBe(5)
    fireEvent.change(rows, { target: { value: '50' } })
    expect(getTunables().chipRowsMax).toBe(8)
    fireEvent.click(screen.getByRole('button', { name: 'Reset Chip rows (horizontal)' }))
    expect(getTunables().chipRowsMax).toBe(DEFAULT_TUNABLES.chipRowsMax)
  })

  it('ignores empty or non-numeric input', () => {
    render(<AdvancedSettings />)
    const gap = screen.getByLabelText('Gap between chips (px)')
    fireEvent.change(gap, { target: { value: '' } })
    fireEvent.change(gap, { target: { value: 'abc' } })
    expect(useSettings.getState().tunables).toEqual({})
  })

  it('offers reset only for changed values', () => {
    render(<AdvancedSettings />)
    expect(screen.queryByRole('button', { name: /^Reset / })).toBeNull()
  })
})
