import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { Agenda } from './Agenda.tsx'
import { AgendaButton } from './AgendaButton.tsx'
import { AgendaShell } from './AgendaShell.tsx'
import { useLayout } from '../../store/layout.ts'
import { useUi } from '../../store/ui.ts'
import { useEntities } from '../../store/entities.ts'

function setLayout(agendaPlacement: 'bottom' | 'side' | 'drawer', agendaCanDock = true) {
  act(() => useLayout.setState({ agendaPlacement, agendaCanDock, agendaOverride: null }))
}

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {} // not implemented by jsdom
  useEntities.setState({ instants: [], spans: [] })
  useUi.setState({ agendaOpen: false })
})

function Harness() {
  return <><AgendaButton /><AgendaShell /></>
}

describe('Agenda drawer', () => {
  it('no menu button and no dialog when docked at the bottom', () => {
    setLayout('bottom')
    render(<Harness />)
    expect(screen.queryByRole('button', { name: 'Open Agenda' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Agenda' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Agenda' })).toBeTruthy()
  })

  it('menu button opens the dialog; Esc closes it and focus returns', () => {
    setLayout('drawer')
    render(<Harness />)
    const btn = screen.getByRole('button', { name: 'Open Agenda' })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    btn.focus()
    fireEvent.click(btn)
    const dlg = screen.getByRole('dialog', { name: 'Agenda' })
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(dlg.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Agenda' })).toBeNull()
    expect(document.activeElement).toBe(btn)
  })

  it('a scrim click closes it', () => {
    setLayout('drawer')
    render(<Harness />)
    const btn = screen.getByRole('button', { name: 'Open Agenda' })
    fireEvent.click(btn)
    fireEvent.click(document.querySelector('.agenda-scrim') as Element)
    expect(screen.queryByRole('dialog', { name: 'Agenda' })).toBeNull()
    expect(document.activeElement).toBe(btn)
  })
})

describe('dock toggle', () => {
  it('switches placement, and hides when docking is impossible', () => {
    act(() => useLayout.setState({ agendaPlacement: 'bottom', agendaCanDock: true, agendaOverride: null }))
    render(<Agenda />)
    fireEvent.click(screen.getByRole('button', { name: 'Undock Agenda' }))
    expect(useLayout.getState().agendaPlacement).toBe('drawer')
  })
  it('is hidden when docking is not possible', () => {
    setLayout('drawer', false)
    render(<Agenda />)
    expect(screen.queryByRole('button', { name: 'Dock Agenda' })).toBeNull()
  })
  it('offers Dock in the drawer', () => {
    setLayout('drawer', true)
    render(<Agenda />)
    expect(screen.getByRole('button', { name: 'Dock Agenda' })).toBeTruthy()
  })
})
