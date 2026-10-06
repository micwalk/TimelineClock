// Vertical layout: label boxes for the saved span lanes on the right, against their bar.
// A span that contains Now (a running timer, a span you're in) gets its box at the Now line
// with the time left (the original length small); any other span without its own chip gets
// one at its middle with its name and length. One frame listener places all of them so
// they never overlap (domain/nowFlags).
import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { useFrameListener } from '../../engine/hooks.ts'
import { LiveText } from '../../engine/LiveText.tsx'
import { formatDurationHMS, formatDurationShort, formatLiveSpan, truncateText } from '../../domain/format.ts'
import { resolveTimeRef } from '../../domain/spans.ts'
import { useView } from '../../store/view.ts'
import { useEntities } from '../../store/entities.ts'
import { useChipWidths } from './savedLayout.ts'
import { FLAG_SIZE, observeFlag, rightSideLayout, setRightSideInputs } from './rightSideLayout.ts'
import { engine } from '../../engine/viewportEngine.ts'
import * as act from '../../store/actions.ts'
import type { BottomLane } from './useBottomLanes.ts'
import { isLiveLane, savedLaneVariant } from './useBottomLanes.ts'

const NAME_MAX = 10

type SavedLane = Extract<BottomLane, { kind: 'saved' }>

export function NowFlags({ lanes }: { lanes: BottomLane[] }) {
  const selectedSpanId = useView(s => s.selectedSpanId)
  const moving = useView(s => s.moveMode?.instantId ?? null)
  const selectedInstantId = useView(s => s.currentSelectedInstantId)
  const focusedInstantId = useView(s => (s.viewFocusMode === 'instant' ? s.focusedInstantId : null))
  const instants = useEntities(s => s.instants)
  const widths = useChipWidths(s => s.widths)
  const saved = lanes.filter((l): l is SavedLane => l.kind === 'saved' && !isLiveLane(l))
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
    for (const lane of saved) {
      const el = refs.current.get(lane.key)
      if (!el) continue
      const y = placed[lane.key] ?? null
      if (shown.current.get(lane.key) === y) continue
      shown.current.set(lane.key, y)
      el.style.display = y === null ? 'none' : ''
      if (y !== null) el.style.transform = `translate3d(-100%, ${y - FLAG_SIZE / 2}px, 0)`
    }
  })

  return (
    <>
      {saved.map(lane => {
        const r = lane.span
        const name = r.span.label
        // The later end is where the time left runs to.
        const end = (f: { now: number; center: number }) => Math.max(resolveTimeRef(lane.a, f.now, f.center), resolveTimeRef(lane.b, f.now, f.center))
        const start = (f: { now: number; center: number }) => Math.min(resolveTimeRef(lane.a, f.now, f.center), resolveTimeRef(lane.b, f.now, f.center))
        return (
          <div key={lane.key} className={`tl-lane tl-lane--${savedLaneVariant(r)} tl-lane--labels tl-nowflag-lane`} style={{ '--i': lane.index } as CSSProperties}>
            <div
              ref={refFor(lane.key)}
              className="tl-nowflag glow-text"
              style={{ display: 'none', height: FLAG_SIZE }}
              role="button"
              tabIndex={0}
              aria-label={name || 'Span'}
              onClick={() => act.selectSpan(r.span.id)}
              onKeyDown={e => { if (e.key === 'Enter') act.selectSpan(r.span.id) }}
            >
              {name && <span className="tl-nowflag__name">{truncateText(name, NAME_MAX)}</span>}
              {/* Containing Now: time left, big, and the length small. Otherwise: the length. */}
              <LiveText className="tl-nowflag__left mono" compute={f => (start(f) <= f.now && f.now <= end(f)
                ? formatDurationHMS(end(f) - f.now)
                : formatLiveSpan(end(f) - start(f), 1 / f.pxPerMs))} />
              <LiveText className="tl-nowflag__total mono" compute={f => (start(f) <= f.now && f.now <= end(f) ? `/${formatDurationShort(end(f) - start(f))}` : '')} />
            </div>
          </div>
        )
      })}
    </>
  )
}
