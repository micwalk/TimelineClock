// A live marker's readout: a box on the live side of the axis (above it, or left of
// it when vertical) with an arrowhead (inward-curved edges) whose tip touches the axis. The
// Cursor tag moves its box out of the Now tag's way through --lift (the arrowhead stays on the
// axis).
import { useEffect, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { PlusIcon } from '@heroicons/react/20/solid'
import { useLayout } from '../../store/layout.ts'
import { verticalTagMaxWidth } from './geometry.ts'
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss.ts'
import { observeTag } from './rightSideLayout.ts'

/** Points down, tip at (9,18); the sides and back curve inward. */
const ARROW_PATH = 'M9 18 Q10.5 8 17 1 Q9 5 1 1 Q7.5 8 9 18 Z'
/** The same shape pointing right (vertical timeline), tip at (18,9). */
const ARROW_PATH_RIGHT = 'M18 9 Q8 10.5 1 17 Q5 9 1 1 Q8 7.5 18 9 Z'

export function ArrowTag({ srName, hint, action, onClick, onDoubleClick, menuOpen, onDismissMenu, menu, popover, measure, className, extra, inert, children }: {
  /**
   * Name read before the visible readout when the readout doesn't say what the tag
   * is ("Cursor"). The readout stays in the accessible name, so it is announced.
   */
  srName?: string
  /** Tooltip: what tapping and double-tapping do. */
  hint: string
  /**
   * A round glowing button across the axis from the box, on its line (the saved side). `hidden`
   * keeps its place but doesn't draw it (while it is inside a chip); `ref` gets the button.
   */
  action?: { label: string; onClick: () => void; hidden?: boolean; ref?: RefObject<HTMLButtonElement | null> }
  onClick: () => void
  onDoubleClick: () => void
  menuOpen: boolean
  onDismissMenu: () => void
  menu?: ReactNode
  popover?: ReactNode
  /** Report the box's size (the Cursor tag keeps clear of the Now tag; vertical live lane chips keep clear of both). */
  measure?: 'now' | 'cursor'
  /** Extra classes on the tag (e.g. is-collapsed). */
  className?: string
  /** More controls beside the box (e.g. the Cursor tag's hide button). */
  extra?: ReactNode
  /** Folded away: the box and its buttons can't be reached (the arrowhead stays). */
  inert?: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLButtonElement>(null)
  const vertical = useLayout(s => s.orientation === 'vertical')
  usePopoverDismiss(ref, onDismissMenu, menuOpen)
  useEffect(() => {
    const el = boxRef.current
    if (!measure || !el) return
    return observeTag(measure, el)
  }, [measure, vertical])
  return (
    <>
      <svg className="tl-tag__arrow" viewBox="0 0 18 18" aria-hidden><path d={vertical ? ARROW_PATH_RIGHT : ARROW_PATH} /></svg>
      <div ref={ref} className={`tl-tag${className ? ` ${className}` : ''}`} inert={inert}>
        <button
          ref={boxRef}
          type="button"
          className="tl-tag__box glow-box glow-text"
          title={hint}
          style={vertical ? { maxWidth: verticalTagMaxWidth() } : undefined}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
        >
          {srName && <span className="sr-only">{srName} </span>}
          {children}
        </button>
        {action && (
          <button ref={action.ref} type="button" className={`tl-tag__drop glow-box glow-text${action.hidden ? ' is-morphing' : ''}`} data-no-pan
            aria-label={action.label} title={action.label} onClick={action.onClick}
            aria-hidden={action.hidden || undefined} tabIndex={action.hidden ? -1 : undefined}>
            <PlusIcon aria-hidden />
          </button>
        )}
        {extra}
        {menuOpen && menu}
        {popover}
      </div>
    </>
  )
}
