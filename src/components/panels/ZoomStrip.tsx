// A visibility strip (#10, domain/displayGroups): the zoom ladder (time on screen: 1h … 100y, ∞)
// in three zones, Label | Mark | Hidden, with two handles to drag ("Label up to" above the track,
// "Mark up to" below it, so both can be grabbed when they meet) and a mark at the zoom you are at.
// A tap on the track or a label moves the nearer handle there; arrow keys move a focused handle a
// stop. Handles snap to the stops unless Snap is unticked (Settings keeps the choice). The same
// strip sets a group's visibility (Groups tab) and an instant's (VisibilityEditor).
import { useRef } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { useFrameValue } from '../../engine/hooks.ts'
import type { Visibility, ZoomValue } from '../../domain/displayGroups.ts'
import { ZOOM_STOPS, describeVisibility, groupVisibility, setThreshold, valueAtPosition, valuePosition, valueWords, zoomPosition } from '../../domain/displayGroups.ts'
import { settings, useSettings } from '../../store/settings.ts'

const LAST = ZOOM_STOPS.length - 1
const pct = (p: number) => `${(p / LAST) * 100}%`
const HANDLES = { label: 'Label up to', mark: 'Mark up to' } as const

export function ZoomStrip({ value, onChange, note }: {
  value: Visibility
  onChange: (v: Visibility) => void
  /** Said under the strip instead of the plain description. */
  note?: string
}) {
  const snap = useSettings(s => s.stripSnap)
  const here = useFrameValue(f => Math.round(zoomPosition(f.end - f.start) * 20) / 20)
  const trackRef = useRef<HTMLDivElement>(null)
  // The latest value, for a drag's moves (the closure would hold the first).
  const latest = useRef(value)
  latest.current = value
  const lp = valuePosition(value.label)
  const mp = valuePosition(value.mark)
  const set = (which: 'label' | 'mark', v: ZoomValue) => onChange(setThreshold(latest.current, which, v))
  const posAt = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect()
    return r && r.width > 0 ? ((clientX - r.left) / r.width) * LAST : 0
  }
  /** A tap on the strip: the handle nearer the tapped spot goes there (outside both, the one on that side). */
  const tapAt = (clientX: number) => {
    const p = Math.max(0, Math.min(LAST, posAt(clientX)))
    const which = p < lp ? 'label' : p > mp ? 'mark' : p - lp <= mp - p ? 'label' : 'mark'
    set(which, valueAtPosition(p, snap))
  }
  const handle = (which: 'label' | 'mark', p: number) => ({
    role: 'slider' as const,
    tabIndex: 0,
    className: `zoom-strip__handle is-${which}`,
    style: { left: pct(p) },
    title: `Drag: ${HANDLES[which].toLowerCase()} here`,
    'aria-label': HANDLES[which],
    'aria-valuemin': 0,
    'aria-valuemax': LAST,
    'aria-valuenow': Math.round(p * 10) / 10,
    'aria-valuetext': valueWords(value[which]),
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId) },
    // A tap on a handle is a drag that didn't move: not a tap on the track under it.
    onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) set(which, valueAtPosition(posAt(e.clientX), snap)) },
    onKeyDown: (e: KeyboardEvent) => {
      const step = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0
      if (step) { e.preventDefault(); set(which, valueAtPosition(Math.round(p) + step, true)) }
    },
  })
  return (
    <div className="zoom-strip" data-no-pan>
      <div className="zoom-strip__zones" aria-hidden><span>Label</span><span>Mark</span><span>Hidden</span></div>
      <div ref={trackRef} className="zoom-strip__track" onClick={e => tapAt(e.clientX)}>
        <div className="zoom-strip__seg is-label" style={{ left: 0, width: pct(lp) }} />
        <div className="zoom-strip__seg is-mark" style={{ left: pct(lp), width: pct(Math.max(0, mp - lp)) }} />
        <div className="zoom-strip__seg is-hidden" style={{ left: pct(mp), right: 0 }} />
        <div className="zoom-strip__here" style={{ left: pct(here) }} title="The zoom you are at" />
        <div {...handle('label', lp)} />
        <div {...handle('mark', mp)} />
      </div>
      <div className="zoom-strip__labels" aria-hidden onClick={e => tapAt(e.clientX)}>
        {ZOOM_STOPS.map((z, i) => <span key={z.stop} style={{ left: pct(i) }}>{z.label}</span>)}
      </div>
      <div className="zoom-strip__foot">
        <p className="zoom-strip__says">{note ?? describeVisibility(value)}</p>
        <label className="zoom-strip__snap">
          <input type="checkbox" checked={snap} onChange={e => settings.setStripSnap(e.target.checked)} /> Snap
        </label>
      </div>
    </div>
  )
}

/** A group's visibility strip (Groups tab), kept in Settings. */
export function GroupZoomStrip({ groupKey }: { groupKey: string }) {
  const prefs = useSettings(s => s.groupVisibility)
  return <ZoomStrip value={groupVisibility(groupKey, prefs)} onChange={v => settings.setGroupVisibility(groupKey, v)} />
}
