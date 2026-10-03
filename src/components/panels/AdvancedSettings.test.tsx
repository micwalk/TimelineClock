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
    fireEvent.blur(rows)
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

  it('does not clamp mid-typing; commits once the typed value is in range', () => {
    render(<AdvancedSettings />)
    const f = screen.getByLabelText('Side-docked Agenda needs width (px)')
    for (const v of ['1', '12', '120']) {
      fireEvent.change(f, { target: { value: v } })
      expect(f).toHaveValue(Number(v))
      expect(getTunables().sideDockMinWidthPx).toBe(DEFAULT_TUNABLES.sideDockMinWidthPx)
    }
    fireEvent.change(f, { target: { value: '1200' } })
    expect(getTunables().sideDockMinWidthPx).toBe(1200)
  })

  it('clamps an out-of-range draft on blur and shows the stored value', () => {
    render(<AdvancedSettings />)
    const f = screen.getByLabelText('Side-docked Agenda needs width (px)')
    fireEvent.change(f, { target: { value: '50' } })
    fireEvent.blur(f)
    expect(getTunables().sideDockMinWidthPx).toBe(300)
    expect(f).toHaveValue(300)
  })

  it('reverts an emptied field on blur', () => {
    render(<AdvancedSettings />)
    const f = screen.getByLabelText('Side-docked Agenda needs width (px)')
    fireEvent.change(f, { target: { value: '' } })
    fireEvent.blur(f)
    expect(useSettings.getState().tunables).toEqual({})
    expect(f).toHaveValue(DEFAULT_TUNABLES.sideDockMinWidthPx)
  })
})
