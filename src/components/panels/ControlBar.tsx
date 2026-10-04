// Controls under the timeline: navigation, the big NOW / ＋ button (with the time under it),
// and the Stopwatch and Timer buttons. Long-press (or the caret) on the ± buttons picks the cursor step.
import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon,
} from '@heroicons/react/20/solid'
import { TIME_INCREMENT_OPTIONS, incrementOption } from '../../domain/time.ts'
import type { TimeIncrement } from '../../domain/time.ts'
import { useAnchoredMenu } from '../../hooks/useAnchoredMenu.ts'
import { CtlButton } from './CtlButton.tsx'
import { StopwatchButton, TimerButton } from './QuickButtons.tsx'
import { LiveText } from '../../engine/LiveText.tsx'
import { formatClockCompact } from '../../domain/format.ts'
import { useView, view } from '../../store/view.ts'
import { useLayout } from '../../store/layout.ts'
import * as act from '../../store/actions.ts'

const LONG_PRESS_MS = 500

/** `cell`: the grid cell in the vertical bar. `compact`: label the button "−30m" rather than "− 30 minutes". */
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
        <span className="mono">{direction > 0 ? '+' : '−'}</span>{compact ? option.value : label}
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

/** A grid cell of the vertical bar. */
const cell = (row: number, col: number, rowSpan = 1): CSSProperties => ({ gridRow: rowSpan > 1 ? `${row} / span ${rowSpan}` : row, gridColumn: col })

export function ControlBar() {
  const nowFocused = useView(s => s.viewFocusMode === 'now')
  const vertical = useLayout(s => s.orientation === 'vertical')
  const dir = useLayout(s => s.dir)

  // The vertical bar's NOW column is narrow: the time without seconds fits.
  const clock = <LiveText compute={f => formatClockCompact(f.now, !vertical)} />
  const nowButton = (style?: CSSProperties) => (nowFocused
    ? <CtlButton variant="now" label="Drop an instant at Now" title="Drop an instant (+)" style={style} sub={clock} onClick={() => act.dropInstant()}><span className="ctl-btn__plus" aria-hidden>＋</span></CtlButton>
    : <CtlButton variant="now" label="Focus Now (R)" style={style} sub={clock} onClick={() => act.focusNow()}>NOW</CtlButton>)

  if (vertical) {
    // A two-row grid that follows the screen: row 1 is "− ▲ step-up", row 2 is "+ ▼ step-down", NOW spans both rows,
    // then Stopwatch over Timer.
    // "Up the screen" is earlier when the future runs down (dir 1) and later when it runs up (dir -1).
    const up: 1 | -1 = dir === 1 ? -1 : 1
    const down: 1 | -1 = up === 1 ? -1 : 1
    return (
      <nav className="controls controls--vertical" aria-label="Timeline controls">
        <CtlButton icon={MagnifyingGlassMinusIcon} label="Zoom out (O)" style={cell(1, 1)} onClick={act.zoomOut}>Zoom out</CtlButton>
        <CtlButton icon={ChevronUpIcon} label={up < 0 ? 'Previous instant (A)' : 'Next instant (D)'} data-nav="up" style={cell(1, 2)}
          onClick={() => act.goToAdjacentInstant(up)}>{up < 0 ? 'Previous' : 'Next'}</CtlButton>
        <IncrementButton direction={up} cell={cell(1, 3)} compact />
        {nowButton(cell(1, 4, 2))}
        <CtlButton icon={MagnifyingGlassPlusIcon} label="Zoom in (I)" style={cell(2, 1)} onClick={act.zoomIn}>Zoom in</CtlButton>
        <CtlButton icon={ChevronDownIcon} label={down < 0 ? 'Previous instant (A)' : 'Next instant (D)'} data-nav="down" style={cell(2, 2)}
          onClick={() => act.goToAdjacentInstant(down)}>{down < 0 ? 'Previous' : 'Next'}</CtlButton>
        <IncrementButton direction={down} cell={cell(2, 3)} compact />
        <StopwatchButton style={cell(1, 5)} />
        <TimerButton style={cell(2, 5)} />
      </nav>
    )
  }

  return (
    <nav className="controls" aria-label="Timeline controls">
      <CtlButton icon={MagnifyingGlassMinusIcon} label="Zoom out (O)" onClick={act.zoomOut}>Zoom out</CtlButton>
      <CtlButton icon={ChevronLeftIcon} label="Previous instant (A)" onClick={() => act.goToAdjacentInstant(-1)}>Previous</CtlButton>
      <IncrementButton direction={-1} />
      {nowButton()}
      <IncrementButton direction={1} />
      <CtlButton icon={ChevronRightIcon} label="Next instant (D)" onClick={() => act.goToAdjacentInstant(1)}>Next</CtlButton>
      <CtlButton icon={MagnifyingGlassPlusIcon} label="Zoom in (I)" onClick={act.zoomIn}>Zoom in</CtlButton>
      <span className="controls__sep" aria-hidden />
      <StopwatchButton />
      <TimerButton />
    </nav>
  )
}
