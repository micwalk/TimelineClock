// A group's zoom strip (#10, domain/displayGroups), in the Agenda's Groups tab: the zoom ladder
// (time on screen: 1h … 1mo, ∞) in three zones, chips | gathered | hidden, with two handles to drag
// (the chips handle above the track, the hide handle below it, so both can be grabbed when they
// meet) and a mark at the zoom you are at. Arrow keys move a focused handle a stop.
import { useRef } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { useFrameValue } from '../../engine/hooks.ts'
import { ZOOM_STOPS, describeDisplay, displayFor, setThreshold, stopIndex, zoomPosition } from '../../domain/displayGroups.ts'
import { settings, useSettings } from '../../store/settings.ts'

const LAST = ZOOM_STOPS.length - 1
const pct = (i: number) => `${(i / LAST) * 100}%`

export function ZoomStrip({ groupKey }: { groupKey: string }) {
  const prefs = useSettings(s => s.groupDisplay)
  const d = displayFor(groupKey, prefs)
  const here = useFrameValue(f => Math.round(zoomPosition(f.end - f.start) * 20) / 20)
  const trackRef = useRef<HTMLDivElement>(null)
  const fi = stopIndex(d.full)
  const mi = stopIndex(d.mini)
  const set = (which: 'full' | 'mini', i: number) =>
    settings.setGroupDisplay(groupKey, setThreshold(displayFor(groupKey, useSettings.getState().groupDisplay), which, ZOOM_STOPS[Math.max(0, Math.min(LAST, i))].stop))
  const stopAt = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect()
    return r && r.width > 0 ? Math.round(((clientX - r.left) / r.width) * LAST) : 0
  }
  const handle = (which: 'full' | 'mini', i: number, label: string) => ({
    role: 'slider' as const,
    tabIndex: 0,
    className: `zoom-strip__handle is-${which}`,
    style: { left: pct(i) },
    'aria-label': label,
    'aria-valuemin': 0,
    'aria-valuemax': LAST,
    'aria-valuenow': i,
    'aria-valuetext': ZOOM_STOPS[i].words,
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId) },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) set(which, stopAt(e.clientX)) },
    onKeyDown: (e: KeyboardEvent) => {
      const step = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0
      if (step) { e.preventDefault(); set(which, i + step) }
    },
  })
  return (
    <div className="zoom-strip" data-no-pan>
      <div ref={trackRef} className="zoom-strip__track">
        <div className="zoom-strip__seg is-full" style={{ left: 0, width: pct(fi) }} />
        <div className="zoom-strip__seg is-mini" style={{ left: pct(fi), width: pct(mi - fi) }} />
        <div className="zoom-strip__seg is-hidden" style={{ left: pct(mi), right: 0 }} />
        <div className="zoom-strip__here" style={{ left: pct(here) }} title="The zoom you are at" />
        <div {...handle('full', fi, 'Chips up to')} title="Drag: chips up to here" />
        <div {...handle('mini', mi, 'Hidden past')} title="Drag: hidden past here" />
      </div>
      <div className="zoom-strip__labels" aria-hidden>
        {ZOOM_STOPS.map((z, i) => <span key={z.stop} style={{ left: pct(i) }}>{z.label}</span>)}
      </div>
      <p className="zoom-strip__says">{describeDisplay(d)}</p>
    </div>
  )
}
