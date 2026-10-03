import { useRef } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePanZoom } from './usePanZoom.ts'
import { engine } from '../engine/viewportEngine.ts'
import { entities, useEntities } from '../store/entities.ts'
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
function pointer(target: Element, type: string, x: number, pointerType: 'touch' | 'mouse' = 'touch', pointerId = 1) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 100, button: 0 })
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
})
