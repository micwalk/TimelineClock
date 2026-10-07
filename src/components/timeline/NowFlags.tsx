// Vertical layout: label boxes for the saved span lanes on the right, against their bar, for
// spans without their own chip (the selected or focused span's chip reads the same). A span
// that contains Now (a running timer, a span you're in) gets its box at the Now line with the
// time left (the original length small); any other span gets one at its middle with its name
// and length (SpanReading). One frame listener places all of them so
// they never overlap (domain/nowFlags).
import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { useFrameListener } from '../../engine/hooks.ts'
import { SpanReading } from './SpanReading.tsx'
import { useView } from '../../store/view.ts'
import { useEntities } from '../../store/entities.ts'
import { useChipWidths } from './savedLayout.ts'
import { FLAG_SIZE, observeFlag, rightSideLayout, setRightSideInputs } from './rightSideLayout.ts'
import { engine } from '../../engine/viewportEngine.ts'
import * as act from '../../store/actions.ts'
import type { BottomLane } from './useBottomLanes.ts'
import { isLiveLane, laneName, savedLaneVariant } from './useBottomLanes.ts'
import { useFrameValue } from '../../engine/hooks.ts'
import { sameLabelGroups } from '../../domain/labelGroups.ts'
import { resolveTimeRef as resolveRef } from '../../domain/spans.ts'

type SavedLane = Extract<BottomLane, { kind: 'saved' }>

export function NowFlags({ lanes }: { lanes: BottomLane[] }) {
  const selectedSpanId = useView(s => s.selectedSpanId)
  const moving = useView(s => s.moveMode?.instantId ?? null)
  const selectedInstantId = useView(s => s.currentSelectedInstantId)
  const focusedInstantId = useView(s => (s.viewFocusMode === 'instant' ? s.focusedInstantId : null))
  const instants = useEntities(s => s.instants)
  const widths = useChipWidths(s => s.widths)
  const saved = lanes.filter((l): l is SavedLane => l.kind === 'saved' && !isLiveLane(l))
  // Labels that would crowd a bar fold into "N spans" boxes.
  const flagGroups = useFrameValue(f => rightSideLayout(f).flagGroups, sameLabelGroups)
  const byKey = new Map<string, BottomLane>(lanes.map(l => [l.key, l]))
  const refs = useRef(new Map<string, HTMLDivElement>())
  const shown = useRef(new Map<string, number | null>())
  // One stable ref callback per lane, so a re-render doesn't re-observe the box.
  const refFns = useRef(new Map<string, (el: HTMLDivElement | null) => void>())
  const refFor = (key: string) => {
    let fn = refFns.current.get(key)
    if (!fn) {
      let off: (() => void) | null = null
      fn = el => {
        if (el) {
          refs.current.set(key, el)
          off = observeFlag(key, el)
        } else {
          refs.current.delete(key)
          shown.current.delete(key)
          off?.()
          off = null
          refFns.current.delete(key)
        }
      }
      refFns.current.set(key, fn)
    }
    return fn
  }

  // Hand the lanes to the shared right-side layout (lane chips read it too); it reads the
  // saved chips' positions per frame.
  useLayoutEffect(() => {
    setRightSideInputs({ lanes, selectedSpanId, instants, widths, moving, selectedInstantId, focusedInstantId })
    engine.requestFrame()
  }, [lanes, selectedSpanId, instants, widths, moving, selectedInstantId, focusedInstantId])

  useFrameListener(f => {
    if (f.orientation !== 'vertical') return
    const placed = rightSideLayout(f).flags
    // Each lane's box, and each "N spans" box standing in for several.
    for (const [key, el] of refs.current) {
      const y = placed[key] ?? null
      if (shown.current.get(key) === y) continue
      shown.current.set(key, y)
      el.style.display = y === null ? 'none' : ''
      if (y !== null) el.style.transform = `translate3d(-100%, ${y - FLAG_SIZE / 2}px, 0)`
    }
  })

  return (
    <>
      {saved.map(lane => {
        const r = lane.span
        const name = r.span.label
        return (
          <div key={lane.key} className={`tl-lane tl-lane--${savedLaneVariant(r)} tl-lane--labels tl-nowflag-lane`} style={{ '--i': lane.index } as CSSProperties}>
            <div
              ref={refFor(lane.key)}
              className="tl-nowflag span-read glow-text"
              style={{ display: 'none', height: FLAG_SIZE }}
              role="button"
              tabIndex={0}
              aria-label={name || 'Span'}
              onClick={() => act.selectSpan(r.span.id)}
              onKeyDown={e => { if (e.key === 'Enter') act.selectSpan(r.span.id) }}
            >
              <SpanReading name={name} a={lane.a} b={lane.b} />
            </div>
          </div>
        )
      })}
      {flagGroups.map(g => {
        const members = g.members.map(k => byKey.get(k)).filter((l): l is BottomLane => !!l)
        if (members.length < 2) return null
        const label = `${members.length} spans: ${members.map(laneName).join(', ')}`
        const zoom = () => {
          const now = act.nowTime()
          const center = act.cursorTime()
          act.zoomToTimes(members.flatMap(l => [resolveRef(l.a, now, center), resolveRef(l.b, now, center)]))
        }
        return (
          <div key={g.key} className="tl-lane tl-lane--span tl-lane--labels tl-nowflag-lane" style={{ '--i': g.track } as CSSProperties}>
            <div
              ref={refFor(g.key)}
              className="tl-nowflag tl-nowflag--group glow-text"
              style={{ display: 'none', height: FLAG_SIZE }}
              role="button"
              tabIndex={0}
              aria-label={`${label}. Zoom in to show them`}
              title={label}
              onClick={zoom}
              onKeyDown={e => { if (e.key === 'Enter') zoom() }}
            >
              <span className="span-read__value">{members.length} spans</span>
            </div>
          </div>
        )
      })}
    </>
  )
}
