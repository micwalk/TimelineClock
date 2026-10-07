import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CursorTag, NowTag } from './LiveTags.tsx'
import * as actions from '../../store/actions.ts'
import { engine } from '../../engine/viewportEngine.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { initialViewState, useView } from '../../store/view.ts'
import { useUi } from '../../store/ui.ts'
import { formatClockCompact } from '../../domain/format.ts'

beforeEach(() => {
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [] })
  useView.setState(initialViewState())
  useUi.setState({ timeInput: null, tagMenu: null, cursorHidden: false, plusMorph: null })
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

  it('on double-click goes to Now; there, drops an instant at Now and opens its name editor', () => {
    useView.setState({ viewFocusMode: 'cursor' })
    render(<NowTag />)
    fireEvent.doubleClick(screen.getByRole('button', { name: /^now/i }))
    expect(useView.getState().viewFocusMode).toBe('now')
    expect(useEntities.getState().instants).toHaveLength(0)
    fireEvent.doubleClick(screen.getByRole('button', { name: /^now/i }))
    const [inst] = useEntities.getState().instants
    expect(inst).toBeDefined()
    expect(inst.label).toBe('')
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

  it('drops a nameless instant at the cursor on double-click, without an editor or a selection', () => {
    cursorMode()
    render(<CursorTag />)
    fireEvent.doubleClick(screen.getByRole('button', { name: /^Cursor/ }))
    expect(useEntities.getState().instants).toHaveLength(1)
    expect(useView.getState()).toMatchObject({ viewFocusMode: 'cursor', editingInstantId: null, currentSelectedInstantId: null })
    expect(screen.getByRole('button', { name: /^Cursor/ })).toBeInTheDocument()
  })

  it('has a round + button that drops an instant at the cursor with its name box open', () => {
    cursorMode()
    render(<CursorTag />)
    const center = useView.getState().timeCenter
    fireEvent.click(screen.getByRole('button', { name: 'Drop an instant at the cursor and name it' }))
    const [inst] = useEntities.getState().instants
    expect(inst.label).toBe('')
    expect(Math.abs(inst.tsEpochMs - center)).toBeLessThan(2000)
    expect(useView.getState()).toMatchObject({ viewFocusMode: 'cursor', editingInstantId: inst.id, currentSelectedInstantId: null })
  })

  it('ends naming when the cursor moves away, keeping the instant unnamed', () => {
    cursorMode()
    render(<CursorTag />)
    fireEvent.click(screen.getByRole('button', { name: 'Drop an instant at the cursor and name it' }))
    act(() => actions.moveCursorBy(60_000))
    expect(useView.getState().editingInstantId).toBeNull()
    expect(useEntities.getState().instants[0].label).toBe('')
  })

  it('folds into its arrowhead from its hide button (line too), and the arrowhead brings it back', () => {
    cursorMode()
    const { container } = render(<CursorTag />)
    fireEvent.click(screen.getByRole('button', { name: 'Hide the cursor' }))
    expect(useUi.getState().cursorHidden).toBe(true)
    expect(container.querySelector('.tl-col--line.is-cursor.is-collapsed')).not.toBeNull()
    expect(container.querySelector('.tl-tag.is-collapsed')).not.toBeNull()
    // Nothing else changed: still a free cursor where it was.
    expect(useView.getState().viewFocusMode).toBe('cursor')
    fireEvent.click(screen.getByRole('button', { name: 'Show the cursor' }))
    expect(useUi.getState().cursorHidden).toBe(false)
    expect(container.querySelector('.is-collapsed')).toBeNull()
  })

  it('has no + button while following Now', () => {
    render(<CursorTag />)
    expect(screen.queryByRole('button', { name: 'Drop an instant at the cursor and name it' })).toBeNull()
  })

  it('Save as favorite from the cursor menu keeps the cursor and drops a nameless favorite', () => {
    cursorMode()
    render(<CursorTag />)
    fireEvent.click(screen.getByRole('button', { name: /^Cursor/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save as favorite' }))
    const [inst] = useEntities.getState().instants
    expect(inst.favorite).toBe(true)
    expect(inst.label).toBe('')
    expect(useView.getState()).toMatchObject({ viewFocusMode: 'cursor', editingInstantId: null, currentSelectedInstantId: null })
    expect(screen.getByRole('button', { name: /^Cursor/ })).toBeInTheDocument()
  })
})

describe('CursorTag on a focused instant', () => {
  const focusOn = (label = 'Rice', agoMs = 26 * 60_000) => {
    const ts = engine.getFrame().now - agoMs
    const id = entities.createInstant(ts, label)
    useView.setState({ viewFocusMode: 'instant', focusedInstantId: id, currentSelectedInstantId: id, timeCenter: ts })
    return ts
  }

  it('stays, showing the instant time with seconds and how long ago', () => {
    const ts = focusOn()
    render(<CursorTag />)
    const tag = screen.getByRole('button', { name: /^Cursor/ })
    expect(tag).toHaveTextContent(formatClockCompact(ts, true))
    expect(tag).toHaveTextContent('26m ago')
    expect(tag).not.toHaveTextContent('Now')
    expect(screen.getAllByRole('group', { name: 'Cursor' })[0].className).toContain('is-on-instant')
  })

  it('has no + button and ignores double-click', () => {
    focusOn()
    render(<CursorTag />)
    expect(screen.queryByRole('button', { name: 'Drop an instant at the cursor and name it' })).toBeNull()
    fireEvent.doubleClick(screen.getByRole('button', { name: /^Cursor/ }))
    expect(useEntities.getState().instants).toHaveLength(1)
  })

  it('offers span to Now, a typed time and an offset from Now', () => {
    focusOn()
    render(<CursorTag />)
    fireEvent.click(screen.getByRole('button', { name: /^Cursor/ }))
    expect(screen.getAllByRole('menuitem').map(i => i.textContent)).toEqual(['Save span to Now', 'Type a time…', 'Offset from Now…'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save span to Now' }))
    expect(useEntities.getState().spans).toHaveLength(1)
  })

  it('is hidden in move mode and keeps the free-cursor look otherwise', () => {
    focusOn()
    useView.setState({ moveMode: { instantId: useEntities.getState().instants[0].id, originalCenter: 0 } })
    const { unmount } = render(<CursorTag />)
    expect(screen.queryByRole('button', { name: /^Cursor/ })).toBeNull()
    unmount()
    useView.setState({ moveMode: null })
    cursorMode()
    render(<CursorTag />)
    expect(screen.getAllByRole('group', { name: 'Cursor' })[0].className).not.toContain('is-on-instant')
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
