// The Stopwatch and Timer buttons: one-tap ways in to the timeline's instants and spans.
// Stopwatch: Start, then Lap / Stop with live readings, then Reset. Timer: pick a length.
import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { ArrowPathIcon, BellAlertIcon, ClockIcon, FlagIcon, StopIcon } from '@heroicons/react/20/solid'
import { LiveText } from '../../engine/LiveText.tsx'
import { formatDurationHMS } from '../../domain/format.ts'
import { formatTimerLength, parseTimerInput, stopwatchPhase, timerChoices } from '../../domain/quickCreate.ts'
import { useAnchoredMenu } from '../../hooks/useAnchoredMenu.ts'
import { useEntities } from '../../store/entities.ts'
import { useQuick } from '../../store/quick.ts'
import { ui, useUi } from '../../store/ui.ts'
import * as act from '../../store/actions.ts'
import { CtlButton } from './CtlButton.tsx'

/** Time of a mark (null if it was deleted: the store prunes it on the next change). */
const useMarkTime = (id: string | undefined) => useEntities(s => (id ? s.instants.find(i => i.id === id)?.tsEpochMs ?? null : null))

/** Live time since `from` ("00:45", "12:03", "01:02:03"); fixed to `to` when given. */
function Elapsed({ from, to }: { from: number; to?: number }) {
  return <LiveText compute={f => formatDurationHMS((to ?? f.now) - from)} />
}

export function StopwatchButton({ style }: { style?: CSSProperties }) {
  const sw = useQuick(s => s.stopwatch)
  const phase = stopwatchPhase(sw)
  const startTs = useMarkTime(sw.marks[0])
  const lastTs = useMarkTime(sw.marks[sw.marks.length - 1])
  const prevTs = useMarkTime(sw.marks[sw.marks.length - 2])

  if (phase === 'idle' || startTs === null || lastTs === null) {
    return (
      <CtlButton icon={ClockIcon} className="ctl-btn--quick" label="Start a stopwatch" title="Stopwatch: start" style={style} onClick={act.startStopwatch}>
        Stopwatch
      </CtlButton>
    )
  }

  if (phase === 'stopped') {
    // The reading is the span the stop ended (the last lap, or the whole run without laps).
    const from = prevTs ?? startTs
    return (
      <CtlButton icon={ArrowPathIcon} className="ctl-btn--quick" label="Reset the stopwatch" title="Stopwatch: reset" style={style} onClick={act.resetStopwatch}
        sub={<Elapsed from={from} to={lastTs} />}>
        Reset
      </CtlButton>
    )
  }

  return (
    <div className="ctl-pair" style={style} role="group" aria-label="Stopwatch">
      <CtlButton icon={FlagIcon} className="ctl-btn--quick" label="Lap" title="Lap (time of this lap below)" onClick={act.lapStopwatch}
        sub={<Elapsed from={lastTs} />}>
        Lap
      </CtlButton>
      <CtlButton icon={StopIcon} className="ctl-btn--quick" label="Stop the stopwatch" title="Stop (total time below)" onClick={act.stopStopwatch}
        sub={<Elapsed from={startTs} />}>
        Stop
      </CtlButton>
    </div>
  )
}

export function TimerButton({ style }: { style?: CSSProperties }) {
  const open = useUi(s => s.timerMenuOpen)
  const recentTimers = useQuick(s => s.recentTimers)
  const [text, setText] = useState('')
  const [invalid, setInvalid] = useState(false)
  const close = () => { ui.setTimerMenu(false); setText(''); setInvalid(false) }
  const { wrapRef, menuRef, menuStyle, above } = useAnchoredMenu(open, close)
  const { recent, presets } = timerChoices(recentTimers)

  const start = (ms: number) => { act.startTimer(ms); close() }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const ms = parseTimerInput(text)
    if (ms === null) setInvalid(true)
    else start(ms)
  }
  const choice = (ms: number, isRecent: boolean) => (
    <button key={`${isRecent ? 'r' : 'p'}${ms}`} type="button" role="menuitem"
      className={`timer-menu__choice glow-box${isRecent ? ' is-recent' : ''}`} onClick={() => start(ms)}>
      {formatTimerLength(ms)}
    </button>
  )

  return (
    <div ref={wrapRef} className="ctl-anchor" style={style}>
      <CtlButton icon={BellAlertIcon} className="ctl-btn--quick" label="Start a timer (T)" aria-expanded={open} aria-haspopup="menu"
        onClick={() => ui.setTimerMenu(!open)}>
        Timer
      </CtlButton>
      {open && (
        <div ref={menuRef} className={`menu timer-menu glow-box${above ? ' menu--above' : ''}`} role="menu" aria-label="Timer length" style={menuStyle}>
          {recent.length > 0 && <div className="timer-menu__grid timer-menu__grid--recent">{recent.map(ms => choice(ms, true))}</div>}
          <div className="timer-menu__grid">{presets.map(ms => choice(ms, false))}</div>
          <form className="timer-menu__custom" onSubmit={submit}>
            <input
              className={`timer-menu__input glow-box${invalid ? ' is-invalid' : ''}`}
              aria-label="Custom timer length"
              aria-invalid={invalid}
              placeholder="13m, 1h30, 1:30"
              value={text}
              onChange={e => { setText(e.target.value); setInvalid(false) }}
              onKeyDown={e => { if (e.key === 'Escape') close() }}
            />
            <button type="submit" className="timer-menu__go glow-box">Start</button>
          </form>
        </div>
      )}
    </div>
  )
}
