// Places the Agenda: inline when docked (bottom or side), or in a modal drawer from the left.
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLayout } from '../../store/layout.ts'
import { ui, useUi } from '../../store/ui.ts'
import { Agenda } from './Agenda.tsx'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

function Drawer() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    el?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      // Esc closes the Settings popover first, if it is open.
      if (e.key === 'Escape' && !document.querySelector('.settings__panel')) {
        e.preventDefault()
        ui.closeAgenda()
      } else if (e.key === 'Tab' && el) {
        const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.querySelector<HTMLElement>('.tl-agenda-btn')?.focus()
    }
  }, [])

  return createPortal(
    <>
      <div className="agenda-scrim" onClick={ui.closeAgenda} />
      <div ref={ref} className="agenda-drawer glow-box" role="dialog" aria-modal="true" aria-label="Agenda">
        <Agenda />
      </div>
    </>,
    document.body,
  )
}

export function AgendaShell() {
  const placement = useLayout(s => s.agendaPlacement)
  const open = useUi(s => s.agendaOpen)
  useEffect(() => {
    if (placement !== 'drawer' && open) ui.closeAgenda()
  }, [placement, open])
  if (placement !== 'drawer') return <Agenda />
  return open ? <Drawer /> : null
}
