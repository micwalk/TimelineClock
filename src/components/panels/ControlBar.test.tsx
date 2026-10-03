import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ControlBar } from './ControlBar.tsx'
import { engine } from '../../engine/viewportEngine.ts'
import { useEntities } from '../../store/entities.ts'
import { initialViewState, useView } from '../../store/view.ts'

beforeEach(() => {
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [] })
  useView.setState(initialViewState())
})

describe('the big red button', () => {
  it('drops an instant at Now while following Now', () => {
    render(<ControlBar />)
    expect(screen.queryByRole('button', { name: /Focus Now/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Drop an instant at Now' }))
    const [inst] = useEntities.getState().instants
    expect(inst.label).toBe('')
    expect(useView.getState()).toMatchObject({ viewFocusMode: 'now', editingInstantId: null })
  })

  it('is NOW in cursor mode and focuses Now', () => {
    useView.setState({ viewFocusMode: 'cursor', timeCenter: engine.getFrame().center - 600_000 })
    render(<ControlBar />)
    expect(screen.queryByRole('button', { name: 'Drop an instant at Now' })).toBeNull()
    fireEvent.click(screen.getByText('NOW'))
    expect(useView.getState().viewFocusMode).toBe('now')
    expect(useEntities.getState().instants).toHaveLength(0)
  })
})
