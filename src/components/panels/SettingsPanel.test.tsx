import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { SettingsPanel } from './SettingsPanel.tsx'

const resizeTo = (width: number, height: number) => act(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
  window.dispatchEvent(new Event('resize'))
})

describe('SettingsPanel', () => {
  it('stays open when only the height changes (a phone keyboard), and closes for a new width', () => {
    resizeTo(400, 900)
    render(<SettingsPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy()
    resizeTo(400, 500)
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy()
    resizeTo(800, 500)
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull()
  })
})
