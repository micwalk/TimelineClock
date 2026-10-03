// Gear button (bottom left) and settings popover.
import { useEffect, useRef, useState } from 'react'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'
import { MINUTE } from '../../domain/time.ts'
import { settings, useSettings } from '../../store/settings.ts'
import { useAlarms } from '../../store/alarms.ts'
import * as act from '../../store/actions.ts'

const RING_OPTIONS = [1, 2, 5, 10, 30].map(m => ({ label: `${m} min`, ms: m * MINUTE }))

export function SettingsPanel() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const glow = useSettings(s => s.glow)
  const showTestAlarm = useSettings(s => s.showTestAlarm)
  const ringMs = useAlarms(s => s.autoDismissMs)
  const unattended = useAlarms(s => s.unattended)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="settings">
      <button
        type="button"
        className={`settings__gear glow-box${open ? ' is-open' : ''}`}
        aria-label="Settings"
        aria-expanded={open}
        title="Settings"
        onClick={() => setOpen(o => !o)}
      >
        <Cog6ToothIcon aria-hidden />
      </button>
      {open && (
        <div className="settings__panel glow-box" role="dialog" aria-label="Settings">
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
            <h3>Debug</h3>
            <label className="settings__row settings__row--check">
              <input type="checkbox" checked={showTestAlarm} onChange={e => settings.setShowTestAlarm(e.target.checked)} />
              <span>Show “Test alarm” button</span>
            </label>
            <button type="button" className="settings__action glow-box" onClick={() => act.createTestAlarm()}>
              Ring a test alarm in 3s
            </button>
          </section>
        </div>
      )}
    </div>
  )
}
