import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DataSettings } from './DataSettings.tsx'
import { entities, useEntities } from '../../store/entities.ts'
import { settings, useSettings } from '../../store/settings.ts'
import { BACKUP_FORMAT } from '../../domain/backup.ts'

beforeEach(() => useEntities.setState({ instants: [], spans: [] }))

const pick = (json: unknown) => {
  const file = new File([typeof json === 'string' ? json : JSON.stringify(json)], 'backup.json', { type: 'application/json' })
  fireEvent.change(screen.getByTestId('import-file'), { target: { files: [file] } })
}

describe('DataSettings', () => {
  it('imports only the chosen parts, combining data by default', async () => {
    entities.createInstant(1000, 'Here')
    settings.setGlow(1)
    render(<DataSettings />)
    pick({ format: BACKUP_FORMAT, version: 1, settings: { preferences: { glow: 2 } }, data: { instants: [{ id: 'x', tsEpochMs: 5, label: 'There' }], spans: [] } })
    await screen.findByText('File has settings + 1 instant, 0 spans.')
    fireEvent.click(screen.getByLabelText('Settings'))
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(useSettings.getState().glow).toBe(1)
    expect(useEntities.getState().instants.map(i => i.label)).toEqual(['Here', 'There'])
    expect(screen.getByRole('status')).toHaveTextContent('Imported data (combined).')
  })

  it('replace swaps the data', async () => {
    entities.createInstant(1000, 'Here')
    render(<DataSettings />)
    pick({ format: BACKUP_FORMAT, version: 1, data: { instants: [{ id: 'x', tsEpochMs: 5, label: 'There' }], spans: [] } })
    await screen.findByText(/File has/)
    expect(screen.getByLabelText('Settings')).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Replace current data'))
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
    expect(useEntities.getState().instants.map(i => i.label)).toEqual(['There'])
  })

  it('reports a bad file', async () => {
    render(<DataSettings />)
    pick('{nope')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Not a JSON file.'))
  })
})
