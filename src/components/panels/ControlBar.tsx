// Controls under the timeline: navigation, the big NOW / ＋ button (long-press NOW: zoom to fit
// Now, #23) with the clock under it (a button of its own: tap to go to a typed time, #15), and
// the Stopwatch and Timer buttons. Long-press (or the caret) on the ± buttons picks the cursor step.
import { MARKS } from '../../config/labels.ts'
import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ChevronDownIcon, ChevronLeftIcon, ClockIcon, ChevronRightIcon, ChevronUpIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon,
} from '@heroicons/react/20/solid'
import { TIME_INCREMENT_OPTIONS, incrementOption } from '../../domain/time.ts'
import type { TimeIncrement } from '../../domain/time.ts'
import { useAnchoredMenu } from '../../hooks/useAnchoredMenu.ts'
import { CtlButton } from './CtlButton.tsx'
import { StopwatchButton, TimerButton } from './QuickButtons.tsx'
import { AlarmButton } from './AlarmButton.tsx'
import { LiveText } from '../../engine/LiveText.tsx'
import { formatClockCompact } from '../../domain/format.ts'
import { useView, view } from '../../store/view.ts'
import { ui, useUi } from '../../store/ui.ts'
import { TimeEntry } from '../timeline/TimeEntryPopover.tsx'
import { useLayout } from '../../store/layout.ts'
import * as act from '../../store/actions.ts'

const LONG_PRESS_MS = 500

/** `cell`: the grid cell in the vertical bar. `compact`: label the button "−30m" rather than "− 30 minutes" (horizontal picks by room: panels.css). */
function IncrementButton({ direction, cell, compact }: { direction: 1 | -1; cell?: CSSProperties; compact?: boolean }) {
  const increment = useView(s => s.timeIncrement)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)
  const { wrapRef, menuRef, menuStyle, above } = useAnchoredMenu(open, () => setOpen(false))

  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  const option = incrementOption(increment)
  const label = option.label
  const pick = (value: TimeIncrement) => { view.setTimeIncrement(value); setOpen(false) }

  return (
    <div ref={wrapRef} className="ctl-split" style={cell}>
      <CtlButton
        label={`${direction > 0 ? 'Forward' : 'Back'} ${label} (long-press to change)`}
        onPointerDown={() => {
          longPressed.current = false
          clear()
          timer.current = setTimeout(() => { longPressed.current = true; setOpen(true) }, LONG_PRESS_MS)
        }}
        onPointerUp={clear}
        onPointerLeave={clear}
        onContextMenu={e => { e.preventDefault(); setOpen(true) }}
        onClick={() => {
          if (longPressed.current) { longPressed.current = false; return }
          act.moveCursorByIncrement(direction)
        }}
      >
        <span className="mono">{direction > 0 ? '+' : '−'}</span>
        {compact ? option.value : <><span className="ctl-step__long">{label}</span><span className="ctl-step__short">{option.value}</span></>}
      </CtlButton>
      <button type="button" className="ctl-split__caret glow-box" aria-label="Choose step" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <ChevronDownIcon aria-hidden />
      </button>
      {open && (
        <div
          ref={menuRef}
          className={`menu glow-box${above ? ' menu--above' : ''}`}
          role="menu"
          style={menuStyle}
        >
          {TIME_INCREMENT_OPTIONS.map(o => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={o.value === increment}
              className={`menu__item${o.value === increment ? ' is-active' : ''}`}
              onClick={() => pick(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** NOW: a tap goes to Now, a long-press zooms so Now and the selection (or the cursor) fit. */
function NowButton() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  return (
    <CtlButton variant="now" label="Focus Now (R); long-press to zoom to Now (F)"
      onPointerDown={() => {
        longPressed.current = false
        clear()
        timer.current = setTimeout(() => { longPressed.current = true; act.zoomToNow() }, LONG_PRESS_MS)
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onContextMenu={e => { e.preventDefault(); clear(); act.zoomToNow() }}
      onClick={() => {
        if (longPressed.current) { longPressed.current = false; return }
        act.focusNow()
      }}>NOW</CtlButton>
  )
}

const PlusButton = () => (
  <CtlButton variant="now" label="Drop an instant at Now" title="Drop an instant (+)" onClick={() => act.dropInstant()}>
    <span className="ctl-btn__plus" aria-hidden>{MARKS.drop}</span>
  </CtlButton>
)

/** The clock under NOW, a button of its own: its time box goes to a typed time, or one from Now (G). */
function ClockButton({ seconds }: { seconds: boolean }) {
  const open = useUi(s => s.jumpOpen)
  // The box closes on the press outside it, before the clock's own click would open it again.
  const closedAt = useRef(0)
  const close = () => { closedAt.current = performance.now(); ui.setJump(false) }
  return (
    <div className="ctl-clock-wrap">
      <button type="button" className="ctl-clock glow-box mono" aria-label="Go to a time (G)" title="Go to a time (G)" aria-expanded={open}
        onClick={() => { if (performance.now() - closedAt.current > 300) ui.setJump(!open) }}>
        <ClockIcon className="ctl-clock__icon" aria-hidden />
        <LiveText compute={f => formatClockCompact(f.now, seconds)} />
      </button>
      {open && (
        <TimeEntry title="Go to a time" className="ctl-jump"
          clock={{ initialTs: act.nowTime(), onSubmit: (t, day) => { act.applyClockInput(t.h % 12 === 0 ? 12 : t.h % 12, t.m, t.s, t.h >= 12, day); close() } }}
          offset={{ initialMs: 0, from: 'Now', onSubmit: ms => { if (act.applyOffset(ms, 'now')) close() } }}
          onCancel={close} />
      )}
    </div>
  )
}

/** A grid cell of the vertical bar. */
const cell = (row: number, col: number, rowSpan = 1): CSSProperties => ({ gridRow: rowSpan > 1 ? `${row} / span ${rowSpan}` : row, gridColumn: col })

export function ControlBar() {
  const nowFocused = useView(s => s.viewFocusMode === 'now')
  const vertical = useLayout(s => s.orientation === 'vertical')
  const dir = useLayout(s => s.dir)


  if (vertical) {
    // A two-row grid that follows the screen: row 1 is "− ▲ step-up", row 2 is "+ ▼ step-down", column 4 is
    // NOW / ＋ with the clock under it, then Stopwatch over Timer, and Alarm spanning both rows.
    // "Up the screen" is earlier when the future runs down (dir 1) and later when it runs up (dir -1).
    const up: 1 | -1 = dir === 1 ? -1 : 1
    const down: 1 | -1 = up === 1 ? -1 : 1
    return (
      <nav className="controls controls--vertical" aria-label="Timeline controls">
        <CtlButton icon={MagnifyingGlassMinusIcon} label="Zoom out (O)" style={cell(1, 1)} onClick={act.zoomOut}>Zoom out</CtlButton>
        <CtlButton icon={ChevronUpIcon} label={up < 0 ? 'Previous instant (A)' : 'Next instant (D)'} data-nav="up" style={cell(1, 2)}
          onClick={() => act.goToAdjacentInstant(up)}>{up < 0 ? 'Previous' : 'Next'}</CtlButton>
        <IncrementButton direction={up} cell={cell(1, 3)} compact />
        {/* The column is narrow: the time without seconds fits. */}
        <div className="controls__now-col" style={cell(1, 4, 2)}>{nowFocused ? <PlusButton /> : <NowButton />}<ClockButton seconds={false} /></div>
        <CtlButton icon={MagnifyingGlassPlusIcon} label="Zoom in (I)" style={cell(2, 1)} onClick={act.zoomIn}>Zoom in</CtlButton>
        <CtlButton icon={ChevronDownIcon} label={down < 0 ? 'Previous instant (A)' : 'Next instant (D)'} data-nav="down" style={cell(2, 2)}
          onClick={() => act.goToAdjacentInstant(down)}>{down < 0 ? 'Previous' : 'Next'}</CtlButton>
        <IncrementButton direction={down} cell={cell(2, 3)} compact />
        <StopwatchButton style={cell(1, 5)} />
        <TimerButton style={cell(2, 5)} />
        <AlarmButton style={cell(1, 6, 2)} />
      </nav>
    )
  }

  // Horizontal: NOW sits at the bar's center, right under the timeline's (where the Now line is
  // while following Now), with the navigation gathered to either side of it; Stopwatch, Timer
  // and Alarm are a centered row of their own below.
  return (
    <nav className="controls controls--horizontal" aria-label="Timeline controls">
      <div className="controls__side is-before">
        <CtlButton icon={MagnifyingGlassMinusIcon} label="Zoom out (O)" onClick={act.zoomOut}>Zoom out</CtlButton>
        <CtlButton icon={ChevronLeftIcon} label="Previous instant (A)" onClick={() => act.goToAdjacentInstant(-1)}>Previous</CtlButton>
        <IncrementButton direction={-1} />
      </div>
      {/* While following Now, the Now line runs on down into the button. NOW turns to ＋ there, so a double tap goes to Now and drops. */}
      <div className={`controls__now${nowFocused ? ' is-following' : ''}`}>
        {nowFocused ? <PlusButton /> : <NowButton />}
        <ClockButton seconds />
      </div>
      <div className="controls__side is-after">
        <IncrementButton direction={1} />
        <CtlButton icon={ChevronRightIcon} label="Next instant (D)" onClick={() => act.goToAdjacentInstant(1)}>Next</CtlButton>
        <CtlButton icon={MagnifyingGlassPlusIcon} label="Zoom in (I)" onClick={act.zoomIn}>Zoom in</CtlButton>
      </div>
      <div className="controls__quick">
        <StopwatchButton />
        <TimerButton />
        <AlarmButton />
      </div>
    </nav>
  )
}
