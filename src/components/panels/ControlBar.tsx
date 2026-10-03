// Navigation controls under the timeline. Long-press (or the caret) on the ± buttons
// picks the cursor step.
import { useEffect, useRef, useState } from 'react'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import {
  ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon,
} from '@heroicons/react/20/solid'
import { TIME_INCREMENT_OPTIONS, incrementOption } from '../../domain/time.ts'
import type { TimeIncrement } from '../../domain/time.ts'
import { useView, view } from '../../store/view.ts'
import * as act from '../../store/actions.ts'

type Icon = ComponentType<SVGProps<SVGSVGElement>>

function CtlButton({ icon: Icon, children, onClick, variant, label, title, ...rest }: {
  icon?: Icon
  children?: ReactNode
  onClick: () => void
  variant?: 'now' | 'danger'
  label?: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  return (
    <button
      type="button"
      className={`ctl-btn glow-box glow-text${variant ? ` ctl-btn--${variant}` : ''}`}
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      {...rest}
    >
      {Icon && <Icon aria-hidden className="ctl-btn__icon" />}
      {children && <span className="ctl-btn__text">{children}</span>}
    </button>
  )
}

const LONG_PRESS_MS = 500

function IncrementButton({ direction }: { direction: 1 | -1 }) {
  const increment = useView(s => s.timeIncrement)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  const label = incrementOption(increment).label
  const pick = (value: TimeIncrement) => { view.setTimeIncrement(value); setOpen(false) }

  return (
    <div ref={wrapRef} className="ctl-split">
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
        <span className="mono">{direction > 0 ? '+' : '−'}</span>{label}
      </CtlButton>
      <button type="button" className="ctl-split__caret glow-box" aria-label="Choose step" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <ChevronDownIcon aria-hidden />
      </button>
      {open && (
        <div className="menu glow-box" role="menu">
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

export function ControlBar() {
  const nowFocused = useView(s => s.viewFocusMode === 'now')
  return (
    <nav className="controls" aria-label="Timeline controls">
      <CtlButton icon={MagnifyingGlassMinusIcon} label="Zoom out (O)" onClick={act.zoomOut}>Zoom out</CtlButton>
      <CtlButton icon={ChevronLeftIcon} label="Previous instant (A)" onClick={() => act.goToAdjacentInstant(-1)}>Previous</CtlButton>
      <IncrementButton direction={-1} />
      {nowFocused
        ? <CtlButton variant="now" label="Drop an instant at Now" title="Drop an instant (+)" onClick={() => act.dropInstant()}><span className="ctl-btn__plus" aria-hidden>＋</span></CtlButton>
        : <CtlButton variant="now" label="Focus Now (R)" onClick={() => act.focusNow()}>NOW</CtlButton>}
      <IncrementButton direction={1} />
      <CtlButton icon={ChevronRightIcon} label="Next instant (D)" onClick={() => act.goToAdjacentInstant(1)}>Next</CtlButton>
      <CtlButton icon={MagnifyingGlassPlusIcon} label="Zoom in (I)" onClick={act.zoomIn}>Zoom in</CtlButton>
    </nav>
  )
}
