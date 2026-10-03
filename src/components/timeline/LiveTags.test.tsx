import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CursorTag, NowTag, liveTagsCollide } from './LiveTags.tsx'
import { engine } from '../../engine/viewportEngine.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { initialViewState, useView } from '../../store/view.ts'
import { useUi } from '../../store/ui.ts'
import { formatClockCompact } from '../../domain/format.ts'

beforeEach(() => {
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [] })
  useView.setState(initialViewState())
  useUi.setState({ timeInput: null, tagMenu: null })
})

const cursorMode = () => useView.setState({ viewFocusMode: 'cursor', timeCenter: engine.getFrame().center })

describe('NowTag', () => {
  it('shows NOW and the clock with seconds', () => {
    render(<NowTag />)
    expect(screen.getByText('NOW')).toBeInTheDocument()
    expect(screen.getByText(formatClockCompact(engine.getFrame().now, true))).toBeInTheDocument()
  })

  it('is named by its caption and readout', () => {
    render(<NowTag />)
    const now = engine.getFrame().now
    expect(screen.getByRole('button', { name: `NOW ${formatClockCompact(now, true)}` })).toBeInTheDocument()
  })

  it('saves an instant at Now on double-click and opens its name', () => {
    render(<NowTag />)
    fireEvent.doubleClick(screen.getByRole('button', { name: /^now/i }))
    const [inst] = useEntities.getState().instants
    expect(inst).toBeDefined()
    expect(useView.getState().editingInstantId).toBe(inst.id)
  })

  it('opens its tools on click: save as favorite, set a time', () => {
    render(<NowTag />)
    fireEvent.click(screen.getByRole('button', { name: /^now/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save as favorite' }))
    expect(useEntities.getState().instants[0].favorite).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /^now/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Set cursor to a time…' }))
    expect(screen.getByRole('dialog', { name: 'Set cursor time' })).toBeInTheDocument()
  })
})

describe('CursorTag', () => {
  it('is hidden while following Now', () => {
    render(<CursorTag />)
    expect(screen.queryByRole('button', { name: /^Cursor/ })).toBeNull()
  })

  it('shows its time and its offset from Now', () => {
    cursorMode()
    render(<CursorTag />)
    expect(screen.getByText(/^Now [+-]/)).toBeInTheDocument()
  })

  it('adds the offset from the selected instant', () => {
    const id = entities.createInstant(engine.getFrame().now - 60_000, 'Rice')
    useView.setState({ currentSelectedInstantId: id })
    cursorMode()
    render(<CursorTag />)
    expect(screen.getByText(/^Rice [+-]/)).toBeInTheDocument()
  })

  it('hides the selected-offset line while the selected instant sits under the cursor', () => {
    const id = entities.createInstant(engine.getFrame().center, 'Rice')
    useView.setState({ currentSelectedInstantId: id })
    cursorMode()
    render(<CursorTag />)
    expect(screen.queryByText(/^Rice [+-]/)).toBeNull()
    expect(screen.getByText(/^Now [+-]/)).toBeInTheDocument()
  })

  it('ignores a selection that no longer exists', () => {
    useView.setState({ currentSelectedInstantId: 'deleted' })
    cursorMode()
    render(<CursorTag />)
    expect(screen.getAllByText(/[+-]\d/)).toHaveLength(1)
  })

  it('saves spans and locks from its tools', () => {
    cursorMode()
    render(<CursorTag />)
    fireEvent.click(screen.getByRole('button', { name: /^Cursor/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Lock offset to Now' }))
    expect(useView.getState()).toMatchObject({ cursorLocked: true, viewFocusMode: 'cursor' })
    fireEvent.click(screen.getByRole('button', { name: /^Cursor/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save span to Now' }))
    expect(useEntities.getState().spans).toHaveLength(1)
  })

  it('saves an instant at the cursor on double-click', () => {
    cursorMode()
    render(<CursorTag />)
    fireEvent.doubleClick(screen.getByRole('button', { name: /^Cursor/ }))
    expect(useEntities.getState().instants).toHaveLength(1)
    const id = useEntities.getState().instants[0].id
    expect(useView.getState()).toMatchObject({ viewFocusMode: 'cursor', editingInstantId: id, currentSelectedInstantId: id })
    expect(screen.getByRole('button', { name: /^Cursor/ })).toBeInTheDocument()
  })

  it('Save as favorite from the cursor menu keeps the cursor and opens the name box', () => {
    cursorMode()
    render(<CursorTag />)
    fireEvent.click(screen.getByRole('button', { name: /^Cursor/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save as favorite' }))
    const [inst] = useEntities.getState().instants
    expect(inst.favorite).toBe(true)
    expect(useView.getState()).toMatchObject({ viewFocusMode: 'cursor', editingInstantId: inst.id, currentSelectedInstantId: inst.id })
    expect(screen.getByRole('button', { name: /^Cursor/ })).toBeInTheDocument()
  })
})

describe('liveTagsCollide', () => {
  it('is true within the clearance on either side, false beyond', () => {
    expect(liveTagsCollide(500, 500, 100)).toBe(true)
    expect(liveTagsCollide(401, 500, 100)).toBe(true)
    expect(liveTagsCollide(599, 500, 100)).toBe(true)
    expect(liveTagsCollide(400, 500, 100)).toBe(false)
    expect(liveTagsCollide(600, 500, 100)).toBe(false)
  })
})

describe('marker layering', () => {
  it('keeps the Now line in its own element, apart from the tag that holds the time text', () => {
    const { container } = render(<NowTag />)
    const line = container.querySelector('.tl-col--line') as HTMLElement
    const label = container.querySelector('.tl-col--label') as HTMLElement
    expect(line.querySelector('.tl-col__line')).not.toBeNull()
    expect(line.contains(label)).toBe(false)
    expect(label.contains(line)).toBe(false)
    expect(label.querySelector('.tl-tag__box')).not.toBeNull()
    expect(line.querySelector('.tl-tag__box')).toBeNull()
    expect(line.className).toContain('is-now')
    expect(label.className).toContain('is-now')
  })
})
