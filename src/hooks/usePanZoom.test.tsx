import { useRef } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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

/** A deliberate drag: slow moves and a pause before release, so it never glides. */
function drag(target: Element, fromX: number, toX: number, pointerType: 'touch' | 'mouse' = 'touch') {
  let clock = 1000
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => clock)
  try {
    pointer(target, 'pointerdown', fromX, pointerType)
    const steps = 10
    for (let i = 1; i <= steps; i++) {
      clock += 40
      pointer(target, 'pointermove', fromX + ((toX - fromX) * i) / steps, pointerType)
    }
    clock += 300
    pointer(target, 'pointerup', toX, pointerType)
  } finally {
    spy.mockRestore()
  }
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

  describe('glide', () => {
    afterEach(() => { vi.useRealTimers() })
    const center = () => useView.getState().timeCenter
    /** Lets any real frame the engine already scheduled run first, so the faked ones drive it. */
    const fakeClock = async () => {
      await new Promise(r => setTimeout(r, 50))
      vi.useFakeTimers()
    }

    /** Touch flick: fast moves just before release, so the release velocity is high. */
    function flick(target: Element, pauseMs = 0) {
      pointer(target, 'pointerdown', 300)
      for (let i = 1; i <= 10; i++) {
        vi.advanceTimersByTime(8)
        pointer(target, 'pointermove', 300 + i * 20)
      }
      if (pauseMs) vi.advanceTimersByTime(pauseMs)
      pointer(target, 'pointerup', 500)
    }

    it('a flick still moving at release keeps panning, decaying, then lands', async () => {
      await fakeClock()
      render(<Harness onTap={() => {}} />)
      const el = screen.getByTestId('timeline')
      flick(el)
      const atRelease = center()
      const positions: number[] = []
      for (let i = 0; i < 12; i++) {
        vi.advanceTimersByTime(16)
        positions.push(center())
      }
      expect(positions[11]).toBeLessThan(atRelease) // dragged right = earlier time
      const steps = positions.map((p, i) => (i === 0 ? atRelease : positions[i - 1]) - p)
      expect(steps[2]).toBeGreaterThan(0)
      expect(steps[11]).toBeLessThan(steps[2]) // decays
      vi.advanceTimersByTime(8000)
      expect(center()).toBeLessThan(positions[11]) // kept going
      expect(useView.getState().viewFocusMode).toBe('cursor') // landed on a tick, not an instant
      const settled = center()
      vi.advanceTimersByTime(1000)
      expect(center()).toBe(settled) // and stopped
    })

    it('a release after a pause does not glide', async () => {
      await fakeClock()
      render(<Harness onTap={() => {}} />)
      flick(screen.getByTestId('timeline'), 200)
      const c = center()
      vi.advanceTimersByTime(500)
      expect(center()).toBe(c)
    })

    it('a pointerdown mid-glide stops it and its click reaches nothing', async () => {
      await fakeClock()
      const onTap = vi.fn()
      render(<Harness onTap={onTap} />)
      flick(screen.getByTestId('timeline'))
      vi.advanceTimersByTime(48)
      const button = screen.getByText('Tap me')
      pointer(button, 'pointerdown', 400)
      const c = center()
      vi.advanceTimersByTime(500)
      expect(center()).toBe(c)
      pointer(button, 'pointerup', 400)
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      expect(onTap).not.toHaveBeenCalled()
    })

    it('wheel scrolling never glides', async () => {
      await fakeClock()
      render(<Harness onTap={() => {}} />)
      screen.getByTestId('timeline').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 100 }))
      const c = center()
      vi.advanceTimersByTime(500)
      expect(center()).toBe(c)
    })
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
