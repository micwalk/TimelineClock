// The timeline: ticks, axis, span lanes and instant columns as plain DOM.
import { useLayoutEffect, useRef } from 'react'
import { engine } from '../../engine/viewportEngine.ts'
import { usePanZoom } from '../../hooks/usePanZoom.ts'
import { useView } from '../../store/view.ts'
import { useUi } from '../../store/ui.ts'
import { TickLayer } from './TickLayer.tsx'
import { CursorColumn, NowColumn, SavedInstantColumns } from './InstantColumns.tsx'
import { BottomLanes, TopLanes } from './Lanes.tsx'
import { useBottomLanes } from './useBottomLanes.ts'

export function Timeline() {
  const ref = useRef<HTMLElement>(null)
  const { lanes, height } = useBottomLanes()
  const nowFocused = useView(s => s.viewFocusMode === 'now')
  const popoverOpen = useUi(s => s.timeInput !== null)
  usePanZoom(ref)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => engine.setSize(el.clientWidth, el.clientHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <section
      ref={ref}
      className={`timeline${popoverOpen ? ' has-popover' : ''}`}
      style={{ height }}
      aria-label={`Timeline${nowFocused ? ', following Now' : ''}`}
    >
      <TickLayer />
      <div className="tl-axis" />
      <NowColumn />
      <SavedInstantColumns />
      <CursorColumn />
      <TopLanes />
      <BottomLanes lanes={lanes} />
    </section>
  )
}
