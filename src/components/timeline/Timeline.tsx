// The timeline: ticks, axis, span lanes and instant columns as plain DOM.
import { useLayoutEffect, useMemo, useRef } from 'react'
import { engine } from '../../engine/viewportEngine.ts'
import { usePanZoom } from '../../hooks/usePanZoom.ts'
import { useView } from '../../store/view.ts'
import { useUi } from '../../store/ui.ts'
import { TickLayer } from './TickLayer.tsx'
import { SavedInstantColumns } from './InstantColumns.tsx'
import { CursorTag, NowTag } from './LiveTags.tsx'
import { RotateButton } from './RotateButton.tsx'
import { BottomLanes } from './Lanes.tsx'
import { placeLanes, useVisibleLanes } from './useBottomLanes.ts'
import { useSavedLayout } from './savedLayout.ts'
import { useLayout } from '../../store/layout.ts'
import { geometryStyleFor } from './geometry.ts'
import { LiveText } from '../../engine/LiveText.tsx'
import { formatDateRange } from '../../domain/format.ts'

export function Timeline() {
  const ref = useRef<HTMLElement>(null)
  const orientation = useLayout(s => s.orientation)
  const visibleLanes = useVisibleLanes()
  const layout = useSavedLayout(visibleLanes.length)
  const { lanes, height } = useMemo(() => placeLanes(visibleLanes, layout.rowsUsed, orientation), [visibleLanes, layout.rowsUsed, orientation])
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
      data-orientation={orientation}
      style={{ ...geometryStyleFor(orientation), height }}
      aria-label={`Timeline${nowFocused ? ', following Now' : ''}`}
    >
      <TickLayer />
      <LiveText className="tl-date glow-text" compute={f => formatDateRange(f.start, f.end, f.now)} />
      <div className="tl-axis" />
      <SavedInstantColumns layout={layout} />
      <NowTag />
      <CursorTag />
      <BottomLanes lanes={lanes} />
      <RotateButton />
    </section>
  )
}
