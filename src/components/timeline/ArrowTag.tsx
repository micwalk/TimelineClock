// A live marker's readout: a box on the live side of the axis with an arrowhead
// (inward-curved edges) whose tip touches the axis. Slot 1 lifts the box one
// step further from the axis when it would overlap another tag; the arrowhead
// stays on the axis.
import { useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss.ts'

/** Points down, tip at (9,18); the sides and back curve inward. */
const ARROW_PATH = 'M9 18 Q10.5 8 17 1 Q9 5 1 1 Q7.5 8 9 18 Z'

export function ArrowTag({ srName, hint, slot, onClick, onDoubleClick, menuOpen, onDismissMenu, menu, popover, children }: {
  /**
   * Name read before the visible readout when the readout doesn't say what the tag
   * is ("Cursor"). The readout stays in the accessible name, so it is announced.
   */
  srName?: string
  /** Tooltip: what tapping and double-tapping do. */
  hint: string
  slot: 0 | 1
  onClick: () => void
  onDoubleClick: () => void
  menuOpen: boolean
  onDismissMenu: () => void
  menu?: ReactNode
  popover?: ReactNode
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  usePopoverDismiss(ref, onDismissMenu, menuOpen)
  return (
    <>
      <svg className="tl-tag__arrow" viewBox="0 0 18 18" aria-hidden><path d={ARROW_PATH} /></svg>
      <div ref={ref} className="tl-tag" style={{ '--slot': slot } as CSSProperties}>
        <button
          type="button"
          className="tl-tag__box glow-box glow-text"
          title={hint}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
        >
          {srName && <span className="sr-only">{srName} </span>}
          {children}
        </button>
        {menuOpen && menu}
        {popover}
      </div>
    </>
  )
}
