import { useRef } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePanZoom } from './usePanZoom.ts'
import { engine } from '../engine/viewportEngine.ts'
import { entities, useEntities } from '../store/entities.ts'
import { settings, useSettings } from '../store/settings.ts'
import { useLayout } from '../store/layout.ts'
import { initialViewState, useView } from '../store/view.ts'

function Harness({ onTap }: { onTap: () => void }) {
  const ref = useRef<HTMLElement>(null)
  usePanZoom(ref)
  return (
    <section ref={ref} data-testid="timeline">
      <button type="button" onClick={onTap}>Tap me</button>
    </section>
  )
}

/** jsdom has no PointerEvent; a MouseEvent tagged with pointer fields is enough for the hook. */
function pointer(target: Element, type: string, x: number, pointerType: 'touch' | 'mouse' = 'touch', pointerId = 1, y = 100) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })
  Object.defineProperties(e, { pointerType: { value: pointerType }, pointerId: { value: pointerId } })
  target.dispatchEvent(e)
}

function drag(target: Element, fromX: number, toX: number, pointerType: 'touch' | 'mouse' = 'touch') {
  pointer(target, 'pointerdown', fromX, pointerType)
  const steps = 10
  for (let i = 1; i <= steps; i++) pointer(target, 'pointermove', fromX + ((toX - fromX) * i) / steps, pointerType)
  pointer(target, 'pointerup', toX, pointerType)
}

function tap(target: Element, x: number, wobblePx = 0) {
  pointer(target, 'pointerdown', x)
  if (wobblePx) pointer(target, 'pointermove', x + wobblePx)
  pointer(target, 'pointerup', x + wobblePx)
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

const nextTask = () => new Promise(r => setTimeout(r, 0))

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = () => {}
})

beforeEach(() => {
  engine.cancelTransition()
  useEntities.setState({ instants: [], spans: [] })
  useView.setState(initialViewState())
  useSettings.setState({ tunables: {} })
  useLayout.setState({ orientation: 'horizontal', dir: 1 })
})

describe('usePanZoom', () => {
  it('a tap right after a touch drag still reaches the button', async () => {
    const onTap = vi.fn()
    render(<Harness onTap={onTap} />)
    drag(screen.getByTestId('timeline'), 300, 360)
    await nextTask()
    tap(screen.getByText('Tap me'), 50)
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('a mouse drag swallows the click the browser fires at its end', () => {
    const onTap = vi.fn()
    render(<Harness onTap={onTap} />)
    const button = screen.getByText('Tap me')
    drag(button, 300, 360, 'mouse')
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onTap).not.toHaveBeenCalled()
  })

  it('a touch tap that wobbles a few pixels is a tap, not a pan', () => {
    const onTap = vi.fn()
    render(<Harness onTap={onTap} />)
    tap(screen.getByText('Tap me'), 50, 5)
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(useView.getState().viewFocusMode).toBe('now')
  })

  it('a touch drag that ends within finger range of an instant snaps onto it', () => {
    render(<Harness onTap={() => {}} />)
    const pxPerMs = engine.sample().pxPerMs
    // After dragging 100px right, this instant sits 16px left of the center.
    const id = entities.createInstant(Date.now() - (100 + 16) / pxPerMs, 'Rice')
    drag(screen.getByTestId('timeline'), 300, 400)
    expect(useView.getState()).toMatchObject({ viewFocusMode: 'instant', focusedInstantId: id })
  })

  it('takes the touch drag threshold from settings', () => {
    settings.setTunable('dragThresholdTouchPx', 30)
    const onTap = vi.fn()
    render(<Harness onTap={onTap} />)
    tap(screen.getByText('Tap me'), 50, 20)
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(useView.getState().viewFocusMode).toBe('now')
  })

  it('takes the touch landing radius from settings', () => {
    settings.setTunable('landingTouchPx', 40)
    render(<Harness onTap={() => {}} />)
    const pxPerMs = engine.sample().pxPerMs
    // 30px from the center after the drag: outside the default 20px, inside 40px.
    const id = entities.createInstant(Date.now() - (100 + 30) / pxPerMs, 'Rice')
    drag(screen.getByTestId('timeline'), 300, 400)
    expect(useView.getState()).toMatchObject({ viewFocusMode: 'instant', focusedInstantId: id })
  })

  it('a vertical drag uses clientY and ignores x', () => {
    useLayout.setState({ orientation: 'vertical' })
    render(<Harness onTap={() => {}} />)
    const el = screen.getByTestId('timeline')
    pointer(el, 'pointerdown', 100, 'touch', 1, 300)
    pointer(el, 'pointermove', 400, 'touch', 1, 300) // x only: below the threshold
    expect(useView.getState().viewFocusMode).toBe('now')
    pointer(el, 'pointermove', 400, 'touch', 1, 400)
    expect(useView.getState().viewFocusMode).toBe('cursor')
    pointer(el, 'pointerup', 400, 'touch', 1, 400)
  })

  describe('wheel', () => {
    const wheel = (el: Element, init: WheelEventInit) => el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init }))
    const width = () => useView.getState().timeWidth
    const center = () => useView.getState().timeCenter

    it('horizontal: deltaY zooms, deltaX pans, ctrl zooms', () => {
      render(<Harness onTap={() => {}} />)
      const el = screen.getByTestId('timeline')
      const w0 = width()
      wheel(el, { deltaY: 100 })
      expect(width()).toBeGreaterThan(w0)
      const w1 = width()
      wheel(el, { deltaX: 100 })
      expect(width()).toBe(w1)
      expect(useView.getState().viewFocusMode).toBe('cursor')
      const c = center()
      wheel(el, { deltaX: 100, ctrlKey: true, deltaY: 100 })
      expect(center()).toBe(c)
      expect(width()).toBeGreaterThan(w1)
    })

    it('vertical: deltaY pans, ctrl+wheel zooms', () => {
      useLayout.setState({ orientation: 'vertical' })
      render(<Harness onTap={() => {}} />)
      const el = screen.getByTestId('timeline')
      const w0 = width()
      wheel(el, { deltaY: 100 })
      expect(width()).toBe(w0)
      expect(useView.getState().viewFocusMode).toBe('cursor')
      wheel(el, { deltaY: 100, ctrlKey: true })
      expect(width()).toBeGreaterThan(w0)
    })
  })
})
