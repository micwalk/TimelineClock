// The timeline: ticks, axis, span lanes and instant columns as plain DOM.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { engine } from '../../engine/viewportEngine.ts'
import { usePanZoom } from '../../hooks/usePanZoom.ts'
import { useView } from '../../store/view.ts'
import { useUi } from '../../store/ui.ts'
import * as act from '../../store/actions.ts'
import { TickLayer } from './TickLayer.tsx'
import { SavedInstantColumns } from './InstantColumns.tsx'
import { CursorTag, NowTag } from './LiveTags.tsx'
import { AgendaButton } from '../panels/AgendaButton.tsx'
import { RotateButton } from './RotateButton.tsx'
import { PlusMorphLayer } from './PlusMorphLayer.tsx'
import { BottomLanes } from './Lanes.tsx'
import { NowFlags } from './NowFlags.tsx'
import { NO_LANE_SLOTS, isLiveLane, placeLanes, useVisibleLanes } from './useBottomLanes.ts'
import type { LaneSlots } from './useBottomLanes.ts'
import { useSavedLayoutSource } from './savedLayout.ts'
import { useLayout } from '../../store/layout.ts'
import { geometryStyleFor } from './geometry.ts'
import { LiveText } from '../../engine/LiveText.tsx'
import { formatDateRange } from '../../domain/format.ts'

const INTERACTIVE = 'button, input, textarea, a, [role="button"], [role="menu"], [role="menuitem"], [role="dialog"], [data-no-pan]'

export function Timeline() {
  const ref = useRef<HTMLElement>(null)
  const orientation = useLayout(s => s.orientation)
  const visibleLanes = useVisibleLanes()
  // Only saved-side lanes take width from the vertical chips; live lanes are on the left.
  const rowsUsed = useSavedLayoutSource(useMemo(() => visibleLanes.filter(l => !isLiveLane(l)).length, [visibleLanes]))
  // Lanes keep their slots from one placement to the next, so on-screen spans don't jump.
  const lastSlots = useRef<LaneSlots>(NO_LANE_SLOTS)
  const placed = useMemo(() => placeLanes(visibleLanes, rowsUsed, orientation, lastSlots.current), [visibleLanes, rowsUsed, orientation])
  useEffect(() => { lastSlots.current = placed.slots }, [placed])
  const { lanes, height, liveCount } = placed
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
      style={{ ...geometryStyleFor(orientation, liveCount), height }}
      aria-label={`Timeline${nowFocused ? ', following Now' : ''}`}
      onClick={e => {
        // A tap on empty space deselects; clicks ending a drag never get here (usePanZoom swallows them).
        if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return
        act.clearSelection()
      }}
    >
      <TickLayer />
      <AgendaButton />
      <LiveText className="tl-date glow-text" compute={f => formatDateRange(f.start, f.end, f.now)} />
      <div className="tl-axis" />
      <SavedInstantColumns />
      <NowTag />
      <CursorTag />
      <BottomLanes lanes={lanes} />
      {orientation === 'vertical' && <NowFlags lanes={lanes} />}
      <RotateButton />
      <PlusMorphLayer />
    </section>
  )
}
