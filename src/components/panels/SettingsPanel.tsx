// Settings gear (in the Agenda's tab bar) and its popover. The popover is portaled to
// <body> so it floats above the timeline and controls wherever the gear sits.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'
import { MINUTE } from '../../domain/time.ts'
import { settings, useSettings } from '../../store/settings.ts'
import { useAlarms } from '../../store/alarms.ts'
import { AdvancedSettings } from './AdvancedSettings.tsx'
import { AppVersion } from './AppVersion.tsx'
import { ShellStatus } from './ShellStatus.tsx'
import { PreviewSwitch } from './PreviewSwitch.tsx'
import { ShellDiagnostics } from './ShellDiagnostics.tsx'
import { DataSettings } from './DataSettings.tsx'
import { SkySettings } from './SkySettings.tsx'
import { panelPosition } from './panelPosition.ts'
import { parseWarningList, warnText } from '../../domain/alarmPicker.ts'

const RING_OPTIONS = [1, 2, 5, 10, 30].map(m => ({ label: `${m} min`, ms: m * MINUTE }))

export function SettingsPanel() {
  const [pos, setPos] = useState<CSSProperties | null>(null)
  const gearRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const glow = useSettings(s => s.glow)
  const favoriteLanes = useSettings(s => s.favoriteLanes)
  const orientation = useSettings(s => s.orientation)
  const verticalDir = useSettings(s => s.verticalDir)
  const tickSnap = useSettings(s => s.tickSnap)
  const dstShifts = useSettings(s => s.dstShifts)
  const seasons = useSettings(s => s.seasons)
  const stopwatchKeepStart = useSettings(s => s.stopwatchKeepStart)
  const agendaPlacement = useSettings(s => s.agendaPlacement)
  const ringMs = useAlarms(s => s.autoDismissMs)
  const unattended = useAlarms(s => s.unattended)
  const open = pos !== null

  useEffect(() => {
    if (!open) return
    const inside = (t: EventTarget | null) => t instanceof Node && (!!gearRef.current?.contains(t) || !!panelRef.current?.contains(t))
    const onDown = (e: PointerEvent) => { if (!inside(e.target)) setPos(null) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null) }
    // A phone's keyboard coming up (typing a zip or a warning) only changes the height: fit the
    // panel to what is left and keep the field in view. A new width (rotation, a real resize) closes it.
    let width = window.innerWidth
    const onResize = () => {
      if (window.innerWidth !== width || !gearRef.current) { width = window.innerWidth; setPos(null); return }
      setPos(panelPosition(gearRef.current.getBoundingClientRect(), window.innerWidth, window.innerHeight))
      requestAnimationFrame(() => {
        const el = document.activeElement
        if (el instanceof HTMLElement && panelRef.current?.contains(el)) el.scrollIntoView({ block: 'nearest' })
      })
    }
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
        onClick={() => setPos(p => (p || !gearRef.current ? null : panelPosition(gearRef.current.getBoundingClientRect(), window.innerWidth, window.innerHeight)))}
      >
        <Cog6ToothIcon aria-hidden />
      </button>
      {open && createPortal(
        <div ref={panelRef} className="settings__panel glow-box" role="dialog" aria-label="Settings" style={pos}>
          <h2 className="settings__title glow-text">Settings</h2>
          <PreviewSwitch />

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
            <h3>Timeline</h3>
            <label className="settings__row">
              <span>Orientation</span>
              <select value={orientation} onChange={e => settings.setOrientation(e.target.value === 'horizontal' || e.target.value === 'vertical' ? e.target.value : 'auto')}>
                <option value="auto">Auto</option>
                <option value="horizontal">Horizontal</option>
                <option value="vertical">Vertical</option>
              </select>
            </label>
            <label className="settings__row">
              <span>Future goes (vertical)</span>
              <select value={verticalDir} onChange={e => settings.setVerticalDir(e.target.value === 'up' ? 'up' : 'down')}>
                <option value="down">Down</option>
                <option value="up">Up</option>
              </select>
            </label>
            <label className="settings__row">
              <span>Agenda</span>
              <select value={agendaPlacement} onChange={e => settings.setAgendaPlacement(e.target.value === 'docked' || e.target.value === 'drawer' ? e.target.value : 'auto')}>
                <option value="auto">Auto</option>
                <option value="docked">Docked</option>
                <option value="drawer">Drawer</option>
              </select>
            </label>
            <label className="settings__row">
              <span>Lanes for favorites</span>
              <select value={favoriteLanes} onChange={e => settings.setFavoriteLanes(e.target.value === 'always' ? 'always' : 'selected')}>
                <option value="selected">When selected</option>
                <option value="always">Always</option>
              </select>
            </label>
            <label className="settings__row" title="The moments the clocks go forward or back (daylight saving), as instants on the timeline">
              <span>Daylight Savings Time changes on the timeline</span>
              <input type="checkbox" checked={dstShifts} onChange={e => settings.setDstShifts(e.target.checked)} />
            </label>
            <label className="settings__row" title="The moments the seasons turn, as instants on the timeline">
              <span>Solstices and equinoxes on the timeline</span>
              <input type="checkbox" checked={seasons} onChange={e => settings.setSeasons(e.target.checked)} />
            </label>
            <label className="settings__row">
              <span>Snap cursor to ticks</span>
              <input type="checkbox" checked={tickSnap} onChange={e => settings.setTickSnap(e.target.checked)} />
            </label>
            <label className="settings__row" title="On: a lap favorites the new lap and keeps the start favorited, so both spans to Now show (lap and total). Off: only the latest lap stays favorited.">
              <span>Stopwatch laps keep the start favorited</span>
              <input type="checkbox" checked={stopwatchKeepStart} onChange={e => settings.setStopwatchKeepStart(e.target.checked)} />
            </label>
          </section>

          <section className="settings__group">
            <h3>Sky</h3>
            <SkySettings />
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
            <AlarmRingSettings />
          </section>

          <section className="settings__group">
            <h3>Data</h3>
            <DataSettings />
          </section>

          <section className="settings__group">
            <details className="settings__advanced">
              <summary><h3>Advanced</h3></summary>
              <AdvancedSettings />
            </details>
          </section>

          <AppVersion className="settings__version mono" />
          <ShellStatus />
          <ShellDiagnostics />
        </div>,
        document.body,
      )}
    </>
  )
}

/** Settings > Alarms: the warnings the Alarm picker offers, and what a new alarm starts with. */
function AlarmRingSettings() {
  const rings = useSettings(s => s.alarmRings)
  const listText = rings.choices.map(warnText).join(', ')
  const [text, setText] = useState(listText)
  const [bad, setBad] = useState(false)
  useEffect(() => { setText(listText); setBad(false) }, [listText])
  const commit = () => {
    const choices = parseWarningList(text)
    if (!choices) { setBad(true); return }
    settings.setAlarmRings({ ...rings, choices, warnings: rings.warnings.filter(w => choices.includes(w)) })
  }
  const toggle = (ms: number) => settings.setAlarmRings({ ...rings, warnings: rings.warnings.includes(ms) ? rings.warnings.filter(w => w !== ms) : [...rings.warnings, ms] })
  const chip = (label: string, on: boolean, aria: string, onClick: () => void) => (
    <button key={label} type="button" className={`repeat-chip glow-box${on ? ' is-on' : ''}`} aria-pressed={on} aria-label={aria} onClick={onClick}>{label}</button>
  )
  return (
    <>
      <label className="settings__row">
        <span>Warnings offered</span>
        <input className={`settings__text mono${bad ? ' is-invalid' : ''}`} aria-invalid={bad} value={text} placeholder="5m, 15m, 1h"
          onChange={e => { setText(e.target.value); setBad(false) }} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit() }} />
      </label>
      <div className="settings__row settings__row--wrap">
        <span>New alarms ring</span>
        <div className="alarm-pick__row" role="group" aria-label="New alarms ring">
          {chip('On time', rings.onTime, 'New alarms ring at the time', () => settings.setAlarmRings({ ...rings, onTime: !rings.onTime }))}
          {rings.choices.map(ms => chip(`−${warnText(ms)}`, rings.warnings.includes(ms), `New alarms warn ${warnText(ms)} before`, () => toggle(ms)))}
        </div>
      </div>
    </>
  )
}
