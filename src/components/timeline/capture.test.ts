import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { engine } from '../../engine/viewportEngine.ts'
import { setDragging } from '../../engine/gesture.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { initialViewState, useView } from '../../store/view.ts'
import { useSettings } from '../../store/settings.ts'
import { captureAt } from './capture.ts'

beforeEach(() => {
  useSettings.setState({ tunables: {} })
  useEntities.setState({ instants: [], spans: [] })
  useView.setState(initialViewState())
})
afterEach(() => setDragging(false, false))

/** A free cursor `px` pixels from an instant (at the current zoom). */
function cursorNear(px: number) {
  const f = engine.sample()
  const id = entities.createInstant(f.center, 'Rice')
  useView.setState({ viewFocusMode: 'cursor', timeCenter: f.center + px / f.pxPerMs })
  return id
}

describe('captureAt', () => {
  it('at rest, captures only an instant right under the cursor', () => {
    const id = cursorNear(0)
    expect(captureAt(engine.sample())).toMatchObject({ id, preview: true })
    useView.setState({ timeCenter: useView.getState().timeCenter + 6 / engine.sample().pxPerMs })
    expect(captureAt(engine.sample())).toBeNull()
  })

  it('while a drag is held, captures within the landing radius (touch 12px)', () => {
    const id = cursorNear(9)
    expect(captureAt(engine.sample())).toBeNull()
    setDragging(true, true)
    expect(captureAt(engine.sample())).toMatchObject({ id, preview: true })
    // Held a little past the radius once caught (no flicker at the edge)...
    setDragging(true, false)
    expect(captureAt(engine.sample())).toMatchObject({ id })
    // ...but a mouse (8px) doesn't catch it from 9px away.
    setDragging(false)
    expect(captureAt(engine.sample())).toBeNull()
    setDragging(true, false)
    expect(captureAt(engine.sample())).toBeNull()
  })

  it('is the focused instant (not a preview) in instant focus, and nothing in move mode', () => {
    const id = cursorNear(0)
    useView.setState({ viewFocusMode: 'instant', focusedInstantId: id })
    expect(captureAt(engine.sample())).toMatchObject({ id, preview: false })
    useView.setState({ viewFocusMode: 'cursor', moveMode: { instantId: id, originalCenter: 0 } })
    expect(captureAt(engine.sample())).toBeNull()
  })
})
