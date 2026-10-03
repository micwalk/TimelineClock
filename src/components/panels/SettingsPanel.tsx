// Settings gear (in the Agenda's tab bar) and its popover. The popover is portaled to
// <body> so it floats above the timeline and controls wherever the gear sits.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'
import { MINUTE } from '../../domain/time.ts'
import { settings, useSettings } from '../../store/settings.ts'
import { useAlarms } from '../../store/alarms.ts'
import * as act from '../../store/actions.ts'

const RING_OPTIONS = [1, 2, 5, 10, 30].map(m => ({ label: `${m} min`, ms: m * MINUTE }))
const PANEL_GAP = 8
const PANEL_EST_HEIGHT = 340

/** Places the panel under the gear, or above it when there isn't room below. */
function panelPosition(gear: HTMLElement): CSSProperties {
  const r = gear.getBoundingClientRect()
  const right = Math.max(8, window.innerWidth - r.right)
  return window.innerHeight - r.bottom >= PANEL_EST_HEIGHT + PANEL_GAP
    ? { right, top: r.bottom + PANEL_GAP }
    : { right, bottom: window.innerHeight - r.top + PANEL_GAP }
}

export function SettingsPanel() {
  const [pos, setPos] = useState<CSSProperties | null>(null)
  const gearRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const glow = useSettings(s => s.glow)
  const ringMs = useAlarms(s => s.autoDismissMs)
  const unattended = useAlarms(s => s.unattended)
  const open = pos !== null
  const close = () => setPos(null)

  useEffect(() => {
    if (!open) return
    const inside = (t: EventTarget | null) => t instanceof Node && (!!gearRef.current?.contains(t) || !!panelRef.current?.contains(t))
    const onDown = (e: PointerEvent) => { if (!inside(e.target)) setPos(null) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null) }
    const onResize = () => setPos(null)
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  return (
    <>
      <button
        ref={gearRef}
        type="button"
        className={`settings__gear glow-box${open ? ' is-open' : ''}`}
        aria-label="Settings"
        aria-expanded={open}
        title="Settings"
        onClick={() => setPos(p => (p || !gearRef.current ? null : panelPosition(gearRef.current)))}
      >
        <Cog6ToothIcon aria-hidden />
      </button>
      {open && createPortal(
        <div ref={panelRef} className="settings__panel glow-box" role="dialog" aria-label="Settings" style={pos}>
          <h2 className="settings__title glow-text">Settings</h2>

          <section className="settings__group">
            <h3>Appearance</h3>
            <label className="settings__row">
              <span>Glow</span>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={glow}
                onChange={e => settings.setGlow(Number(e.target.value))}
              />
              <output className="mono">{glow.toFixed(1)}×</output>
            </label>
          </section>

          <section className="settings__group">
            <h3>Alarms</h3>
            <label className="settings__row">
              <span>Ring for</span>
              <select value={ringMs} onChange={e => useAlarms.setState({ autoDismissMs: Number(e.target.value) })}>
                {RING_OPTIONS.map(o => <option key={o.ms} value={o.ms}>{o.label}</option>)}
                {!RING_OPTIONS.some(o => o.ms === ringMs) && <option value={ringMs}>{Math.round(ringMs / MINUTE)} min</option>}
              </select>
            </label>
            <label className="settings__row">
              <span>If unanswered</span>
              <select value={unattended} onChange={e => useAlarms.setState({ unattended: e.target.value as 'dismiss' | 'snooze' })}>
                <option value="dismiss">Dismiss</option>
                <option value="snooze">Snooze 5 min</option>
              </select>
            </label>
          </section>

          <section className="settings__group">
            <h3>Dev</h3>
            <button type="button" className="settings__action glow-box" onClick={() => { act.createTestAlarm(); close() }}>
              Test alarm (rings in 3s)
            </button>
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}
